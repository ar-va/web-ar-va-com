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

async function send(s: Signed) {
  const res = await fetch(s.url, {
    method: s.method,
    headers: { Authorization: s.authorization, ...(s.method === 'POST' && { 'Content-Type': 'application/x-www-form-urlencoded' }) },
  });
  if (!res.ok) throw Object.assign(new Error(`Discogs answered ${res.status}: ${(await res.text()).slice(0, 120)}`), { status: res.status });
  return res;
}

/** GET a Discogs path, signed fresh each try; waits a minute when Discogs says "too quickly". */
async function signedGet(path: string, onWait?: () => void): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await (await send(await site({ action: 'sign', path }))).json();
    } catch (e) {
      if ((e as { status?: number }).status !== 429 || attempt === 3) throw e;
      onWait?.();
      await sleep(61_000);
    }
  }
}

export async function startConnect() {
  const reply = new URLSearchParams(await (await send(await site({ action: 'request_token' }))).text());
  const { authorize } = await site({ action: 'pending', token: reply.get('oauth_token'), secret: reply.get('oauth_token_secret') });
  location.href = authorize;
}

export async function finishConnect(token: string, verifier: string) {
  const reply = new URLSearchParams(await (await send(await site({ action: 'access_token', token, verifier }))).text());
  await site({ action: 'token', key: reply.get('oauth_token'), secret: reply.get('oauth_token_secret') });
  const { username } = await signedGet('/oauth/identity');
  await site({ action: 'username', username });
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
  for (const [i, m] of (missing as { releaseId: number; masterId: number }[]).entries()) {
    progress(`${count} records on the shelf. Adding tracklists: ${i + 1} of ${missing.length}…`);
    const release = await signedGet(`/releases/${m.releaseId}`, waiting);
    const master = m.masterId ? await signedGet(`/masters/${m.masterId}`, waiting).catch(() => null) : null;
    await site({ action: 'release', release, masterYear: master?.year ?? null });
  }
  progress(`${count} records on the shelf. Everything is up to date.`);
}

/** On music pages: a logged-in collector's visit quietly re-syncs their shelf every half hour or so. */
export async function autoSync() {
  const skip = 'no-autosync';
  try {
    if (!/(?:^|; )who=/.test(document.cookie) || sessionStorage.getItem(skip)) return;
    const status = await site({ action: 'status' });
    if (!status.username) return sessionStorage.setItem(skip, '1');
    if (!status.syncedAt || Date.now() / 1000 - status.syncedAt > 1800) await syncShelf();
  } catch {
    // Not a collector (403), or Discogs/network trouble: stop trying for this tab; "Sync now" shows errors.
    try { sessionStorage.setItem(skip, '1'); } catch {}
  }
}
