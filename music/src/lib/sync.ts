// Browser side of Discogs: requests go from the collector's own address (the site's server can't reach
// Discogs, see discogs.ts), each one signed by /api/discogs; results are handed back to the site.

import { firstArtist, normalizeName, pickAlbum } from '@shared/lib/lib';

type Signed = { method: 'GET' | 'POST'; url: string; authorization: string };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function site(body: Record<string, unknown>) {
  const res = await fetch('/api/discogs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `The site answered ${res.status}.`);
  return data;
}

/** The same OAuth parameters in the URL instead of a header: a plain request with no CORS preflight. */
function inUrl(s: Signed) {
  const u = new URL(s.url);
  for (const [, k, v] of s.authorization.matchAll(/(\w+)="([^"]*)"/g)) u.searchParams.append(k, decodeURIComponent(v));
  return u.href;
}

// Discogs' OAuth endpoints answer the browser's CORS preflight with a 500, so a header signature is blocked
// ("Failed to fetch"); with the signature in the URL they answer normally (both checked in Chrome 2026-10-27).
// Those go via the URL; other endpoints pass the preflight and keep the header.
async function send(s: Signed, viaUrl = false): Promise<Response> {
  const res = viaUrl ? await fetch(inUrl(s), { method: s.method }) : await fetch(s.url, { method: s.method, headers: { Authorization: s.authorization } });
  if (!res.ok) throw Object.assign(new Error(`Discogs answered ${res.status}: ${(await res.text()).slice(0, 120)}`), { status: res.status });
  return res;
}

/** GET a Discogs path, signed fresh each try; waits a minute when Discogs says "too quickly". */
async function signedGet(path: string, onWait?: () => void): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    try {
      try {
        return await (await send(await site({ action: 'sign', path }))).json();
      } catch (e) {
        // The browser refused the header form (TypeError): sign again (new nonce) and send it in the URL.
        if (!(e instanceof TypeError)) throw e;
        return await (await send(await site({ action: 'sign', path }), true)).json();
      }
    } catch (e) {
      // Discogs' 429 replies carry no CORS header, so a browser often sees "Failed to fetch" (TypeError) instead.
      const limited = (e as { status?: number }).status === 429 || e instanceof TypeError;
      if (!limited || attempt === 3) throw e;
      onWait?.();
      await sleep(61_000);
    }
  }
}

export async function startConnect() {
  const reply = new URLSearchParams(await (await send(await site({ action: 'request_token' }), true)).text());
  const { authorize } = await site({ action: 'pending', token: reply.get('oauth_token'), secret: reply.get('oauth_token_secret') });
  location.href = authorize;
}

export async function finishConnect(token: string, verifier: string) {
  const reply = new URLSearchParams(await (await send(await site({ action: 'access_token', token, verifier }), true)).text());
  await site({ action: 'token', key: reply.get('oauth_token'), secret: reply.get('oauth_token_secret') });
  const { username } = await signedGet('/oauth/identity');
  await site({ action: 'username', username });
}

type Missing = { releaseId: number; masterId: number };

/** Tracklist, dates and the first release date (the master's main release) for each listed release. */
async function syncDetails(missing: Missing[], progress: (message: string) => void, prefix = '') {
  const waiting = () => progress('Discogs asked to slow down; continuing in a minute…');
  for (const [i, m] of missing.entries()) {
    progress(`${prefix}Adding tracklists and release dates: ${i + 1} of ${missing.length}…`);
    try {
      const release = await signedGet(`/releases/${m.releaseId}`, waiting);
      const master = m.masterId ? await signedGet(`/masters/${m.masterId}`, waiting).catch(() => null) : null;
      const main = master?.main_release && master.main_release !== m.releaseId ? await signedGet(`/releases/${master.main_release}`, waiting).catch(() => null) : release;
      await site({ action: 'release', release, masterYear: master?.year ?? null, firstReleased: (master ? main?.released : null) ?? null });
    } catch (e) {
      // Still too fast after the waits, or the network is gone: stop. One bad release (e.g. deleted on Discogs, 404)
      // is skipped, so it can't hold up every release after it on each visit.
      if ((e as { status?: number }).status === 429 || e instanceof TypeError) throw e;
    }
  }
}

// ---- Apple Music: its public search allows browsers (CORS) and needs no key; ~20 searches a minute. ----

const appleUrl = (u: string) => { const url = new URL(u); url.searchParams.delete('uo'); return url.href; };

let lastApple = 0;

async function itunes(path: string) {
  for (let attempt = 0; ; attempt++) {
    // At most one request every 3 s keeps under Apple's ~20 a minute.
    await sleep(Math.max(0, lastApple + 3000 - Date.now()));
    lastApple = Date.now();
    try {
      const res = await fetch(`https://itunes.apple.com${path}`);
      if (res.ok) return res.json();
      if (res.status !== 403 && res.status !== 429) throw new Error(`Apple answered ${res.status}`);
    } catch (e) {
      if (!(e instanceof TypeError) || attempt === 2) throw e;
    }
    if (attempt === 2) throw new Error('Apple asked to slow down');
    await sleep(61_000);
  }
}

/** An Apple Music album with its artwork and songs, by id; `country` is the store in the album's link (default US). */
async function appleAlbum(id: string | number, country = 'us') {
  const found = (await itunes(`/lookup?entity=song&country=${country}&id=${id}`)).results ?? [];
  const album = found.find((x: any) => x.wrapperType === 'collection');
  if (!album) return null;
  return {
    url: appleUrl(album.collectionViewUrl),
    // Apple serves the same artwork at any size by name; 600 px matches Discogs' images and keeps the shelf light.
    artwork: typeof album.artworkUrl100 === 'string' ? album.artworkUrl100.replace(/\d+x\d+bb/, '600x600bb') : null,
    tracks: found.filter((x: any) => x.wrapperType === 'track').map((x: any) => ({ title: x.trackName, url: appleUrl(x.trackViewUrl) })),
  };
}

async function appleMatch(artist: string, title: string) {
  const albums = (found: any) => (found.results ?? []).filter((x: any) => x.wrapperType === 'collection')
    .map((x: any) => ({ id: x.collectionId, title: x.collectionName, artist: x.artistName }));
  let best = pickAlbum(albums(await itunes(`/search?entity=album&limit=15&term=${encodeURIComponent(`${artist} ${title}`)}`)), artist, title);
  if (!best) {
    // Apple's search often misses an album that its artist page lists (symbols, "&", other stores' spellings).
    // The whole credit first ("Kool & The Gang"), then only its first artist ("Louis Armstrong And Eddie Condon").
    const a = normalizeName(artist);
    for (const term of new Set([artist, firstArtist(artist)])) {
      const artists = await itunes(`/search?entity=musicArtist&limit=5&term=${encodeURIComponent(term)}`);
      const found = (artists.results ?? []).find((x: any) => { const n = normalizeName(x.artistName ?? ''); return n && (a === n || a.includes(n)); });
      if (found) { best = pickAlbum(albums(await itunes(`/lookup?entity=album&limit=200&id=${found.artistId}`)), artist, title); break; }
    }
  }
  return best ? appleAlbum(best.id) : null;
}

/**
 * One album again, from its edit page: the Apple Music album the owner linked (any country's store) or, without a
 * link, a search by the artist and title as edited. The site keeps it and adds Spotify by the same artist and title.
 */
export async function rematch(releaseId: number, artist: string, title: string, appleLink?: string | null) {
  const link = appleLink?.match(/music\.apple\.com\/(\w\w)\/album\/(?:[^/?#]+\/)?(\d+)/);
  const apple = link ? await appleAlbum(link[2], link[1]) : await appleMatch(artist, title);
  await site({ action: 'match', releaseId, apple, artist, title });
  return apple;
}

type Unmatched = { releaseId: number; artist: string; title: string };

/** Looks each album up on Apple Music, then lets the site add Spotify and store the links. */
async function syncMatches(list: Unmatched[], progress: (message: string) => void, prefix = '') {
  for (const [i, r] of list.entries()) {
    progress(`${prefix}Finding albums on streaming services: ${i + 1} of ${list.length}…`);
    // Apple failing (slow-down, network) isn't "not on Apple Music": leave the album for the next visit.
    const apple = await appleMatch(r.artist, r.title).catch(() => undefined);
    if (apple === undefined) continue;
    await site({ action: 'match', releaseId: r.releaseId, apple });
  }
}

/**
 * Tracklists (Discogs) and streaming matches (Apple) side by side: separate services with separate limits, and
 * one failing doesn't stop the other.
 */
async function syncBoth(missing: Missing[], unmatched: Unmatched[], progress: (message: string) => void, prefix = '') {
  const state = { details: '', matches: '' };
  const show = () => progress(prefix + [state.details, state.matches].filter(Boolean).join(' '));
  const results = await Promise.allSettled([
    syncDetails(missing, (m) => { state.details = m; show(); }),
    syncMatches(unmatched, (m) => { state.matches = m; show(); }),
  ]);
  const failed = results.find((r) => r.status === 'rejected');
  if (failed) throw (failed as PromiseRejectedResult).reason;
}

/** Copies the collection to the site, then fetches details for releases the site doesn't have yet. */
export async function syncShelf(progress: (message: string) => void = () => {}) {
  const { username } = await site({ action: 'status' });
  const u = encodeURIComponent(username);
  const waiting = () => progress('Discogs asked to slow down; continuing in a minute…');
  progress('Reading your collection on Discogs…');
  const { fields } = await signedGet(`/users/${u}/collection/fields`, waiting);
  const releases: unknown[] = [];
  for (let page = 1, pages = 1; page <= pages; page++) {
    const data = await signedGet(`/users/${u}/collection/folders/0/releases?per_page=100&page=${page}`, waiting);
    pages = data.pagination.pages;
    releases.push(...data.releases);
  }
  const { count } = await site({ action: 'collection', fields, releases });
  // The wantlist too (the wishlist, when the collector picks Discogs for it).
  const wants: unknown[] = [];
  for (let page = 1, pages = 1; page <= pages; page++) {
    const data = await signedGet(`/users/${u}/wants?per_page=100&page=${page}`, waiting);
    pages = data.pagination.pages;
    wants.push(...data.wants);
  }
  await site({ action: 'wants', wants });
  const { missing, unmatched } = await site({ action: 'missing' });
  await syncBoth(missing, unmatched, progress, `${count} records on the shelf. `);
  progress(`${count} records on the shelf. Everything is up to date.`);
}

/**
 * On music pages: a logged-in collector's visit re-syncs the collection every half hour or so, and in between
 * finishes any tracklists an earlier sync didn't get to (e.g. the tab was closed).
 */
export async function autoSync(progress: (message: string) => void = () => {}) {
  const skip = 'no-autosync';
  try {
    if (!/(?:^|; )who=/.test(document.cookie) || sessionStorage.getItem(skip)) return;
    const status = await site({ action: 'status' });
    if (!status.username) return sessionStorage.setItem(skip, '1');
    if (!status.syncedAt || Date.now() / 1000 - status.syncedAt > 1800) return await syncShelf(progress);
    const { missing, unmatched } = await site({ action: 'missing' });
    if (missing.length || unmatched.length) {
      await syncBoth(missing, unmatched, progress);
      progress('Everything is up to date. Reload to see it.');
    }
  } catch {
    // Not a collector (403), or Discogs/network trouble: stop trying for this tab; "Sync now" shows errors.
    try { sessionStorage.setItem(skip, '1'); } catch {}
  }
}
