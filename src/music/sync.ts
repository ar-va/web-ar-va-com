// Browser side of Discogs: requests go from the collector's own address (the site's server can't reach
// Discogs, see discogs.ts), each one signed by /api/discogs; results are handed back to the site.

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
    const release = await signedGet(`/releases/${m.releaseId}`, waiting);
    const master = m.masterId ? await signedGet(`/masters/${m.masterId}`, waiting).catch(() => null) : null;
    const main = master?.main_release && master.main_release !== m.releaseId ? await signedGet(`/releases/${master.main_release}`, waiting).catch(() => null) : release;
    await site({ action: 'release', release, masterYear: master?.year ?? null, firstReleased: (master ? main?.released : null) ?? null });
  }
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
  const { count, missing } = await site({ action: 'collection', fields, releases });
  await syncDetails(missing, progress, `${count} records on the shelf. `);
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
    const { missing } = await site({ action: 'missing' });
    if (missing.length) {
      await syncDetails(missing, progress);
      progress('Everything is up to date. Reload to see it.');
    }
  } catch {
    // Not a collector (403), or Discogs/network trouble: stop trying for this tab; "Sync now" shows errors.
    try { sessionStorage.setItem(skip, '1'); } catch {}
  }
}
