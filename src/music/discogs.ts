// Discogs: OAuth connect, collection sync, release details (cached in D1).
import { env } from 'cloudflare:workers';
import { oauthHeader, seal, toReleaseDetail, toShelfRecord, unseal, type CollectionField, type ReleaseDetail } from './lib';
import { db, type User } from './store';

const API = 'https://api.discogs.com';
const UA = 'ArvaMusicShelf/1.0 +https://music.ar-va.com';
type Token = { key: string; secret: string };

class DiscogsError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function discogs(path: string, token?: Token, init: RequestInit & { oauth?: Record<string, string> } = {}) {
  const res = await fetch(API + path, {
    method: init.method,
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: oauthHeader(env.DISCOGS_CONSUMER_KEY, env.DISCOGS_CONSUMER_SECRET, token, init.oauth),
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    // Discogs explains refusals in plain text ("Invalid consumer."); keep it for the logs and the settings page.
    const why = (await res.text()).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    throw new DiscogsError(res.status, `Discogs ${init.method ?? 'GET'} ${path.split('?')[0]}: ${res.status} ${why}`);
  }
  return res;
}

const now = () => Math.floor(Date.now() / 1000);
const tokenOf = async (u: User): Promise<Token> => JSON.parse(await unseal(u.discogs_token!, env.TOKEN_KEY));

// ---- Connect (OAuth 1.0a, https://www.discogs.com/developers/#page:authentication,header:authentication-oauth-flow) ----

/** Returns the Discogs page to send the user to. */
export async function startConnect(user: User, callbackUrl: string) {
  const p = new URLSearchParams(await (await discogs('/oauth/request_token', undefined, { oauth: { oauth_callback: callbackUrl } })).text());
  const token = p.get('oauth_token'), secret = p.get('oauth_token_secret');
  if (!token || !secret) throw new Error('Discogs request_token: no token in the reply');
  const d = await db();
  await d.batch([
    d.prepare('DELETE FROM oauth_pending WHERE created_at < ?').bind(now() - 900),
    d.prepare('INSERT INTO oauth_pending (token, secret, user_id, created_at) VALUES (?, ?, ?, ?)').bind(token, await seal(secret, env.TOKEN_KEY), user.id, now()),
  ]);
  return `https://www.discogs.com/oauth/authorize?oauth_token=${encodeURIComponent(token)}`;
}

/** Finishes the OAuth dance and stores the (encrypted) access token. Returns an error message or null. */
export async function finishConnect(user: User, requestToken: string, verifier: string) {
  const d = await db();
  const pending = await d.prepare('SELECT secret FROM oauth_pending WHERE token = ? AND user_id = ? AND created_at > ?')
    .bind(requestToken, user.id, now() - 900).first<{ secret: string }>();
  await d.prepare('DELETE FROM oauth_pending WHERE token = ?').bind(requestToken).run();
  if (!pending) return 'That Discogs sign-in expired. Please try again.';
  const reply = new URLSearchParams(await (await discogs('/oauth/access_token', { key: requestToken, secret: await unseal(pending.secret, env.TOKEN_KEY) }, {
    method: 'POST', oauth: { oauth_verifier: verifier },
  })).text());
  const token = { key: reply.get('oauth_token') ?? '', secret: reply.get('oauth_token_secret') ?? '' };
  if (!token.key || !token.secret) throw new Error('Discogs access_token: no token in the reply');
  const { username } = await (await discogs('/oauth/identity', token)).json<{ username: string }>();
  const taken = await d.prepare('SELECT id FROM users WHERE discogs_username = ? AND id != ?').bind(username, user.id).first();
  if (taken) return `The Discogs account “${username}” is already connected to another shelf.`;
  await d.prepare('UPDATE users SET discogs_username = ?, discogs_token = ?, synced_at = NULL, sync_error = NULL WHERE id = ?')
    .bind(username, await seal(JSON.stringify(token), env.TOKEN_KEY), user.id).run();
  return null;
}

// ---- Sync ----

// Workers Free allows 50 outgoing requests per invocation; keep a margin for D1.
export const newBudget = () => ({ left: 40 });

/** Replaces the user's records with their current Discogs collection (all folders). */
export async function syncShelf(user: User, budget = newBudget()) {
  const d = await db();
  try {
    const token = await tokenOf(user);
    const u = encodeURIComponent(user.discogs_username!);
    budget.left--;
    const { fields } = await (await discogs(`/users/${u}/collection/fields`, token)).json<{ fields: CollectionField[] }>();
    const items: any[] = [];
    // shortcut: 100 records per request and ≤ 40 requests per run, so collections over ~3,900 records can't sync; page across runs if that ever matters.
    for (let page = 1, pages = 1; page <= pages; page++) {
      if (budget.left-- <= 0) throw new Error('Collection too large to sync in one run');
      const data = await (await discogs(`/users/${u}/collection/folders/0/releases?per_page=100&page=${page}`, token)).json<any>();
      pages = data.pagination.pages;
      items.push(...data.releases);
    }
    const records = items.map((i) => toShelfRecord(i, fields));
    const inserts = [];
    // 3 parameters per row and D1 allows 100 bound parameters per statement.
    for (let i = 0; i < records.length; i += 33) {
      const chunk = records.slice(i, i + 33);
      inserts.push(d.prepare(`INSERT INTO records (user_id, instance_id, data) VALUES ${chunk.map(() => '(?, ?, ?)').join(', ')}`)
        .bind(...chunk.flatMap((r) => [user.id, r.instanceId, JSON.stringify(r)])));
    }
    await d.batch([
      d.prepare('DELETE FROM records WHERE user_id = ?').bind(user.id),
      ...inserts,
      d.prepare('UPDATE users SET synced_at = ?, sync_error = NULL WHERE id = ?').bind(now(), user.id),
    ]);
    return records.length;
  } catch (e) {
    console.error(`sync failed for ${user.discogs_username}: ${e instanceof Error ? e.message : e}`);
    const message = e instanceof DiscogsError && e.status === 401 ? 'Discogs refused the connection. Please reconnect Discogs.' : String((e as Error).message ?? e);
    await d.prepare('UPDATE users SET synced_at = ?, sync_error = ? WHERE id = ?').bind(now(), message, user.id).run();
    return null;
  }
}

/** Cron: syncs the shelves that waited longest, as far as the request budget goes. */
export async function syncAll() {
  const budget = newBudget();
  const { results } = await (await db()).prepare(
    `SELECT * FROM users WHERE discogs_token IS NOT NULL AND (is_collector = 1 OR id = ?) ORDER BY synced_at IS NOT NULL, synced_at`,
  ).bind(Number(env.ADMIN_TELEGRAM_ID) || 0).all<User>();
  for (const user of results) {
    if (budget.left < 3) break;
    await syncShelf(user, budget);
  }
}

// ---- Release details (tracklist, dates), fetched when a record page is first opened ----

const RELEASE_MAX_AGE = 30 * 86400;

export async function releaseDetail(owner: User, releaseId: number, masterId: number): Promise<ReleaseDetail | null> {
  const d = await db();
  const cached = await d.prepare('SELECT data, fetched_at FROM releases WHERE id = ?').bind(releaseId).first<{ data: string; fetched_at: number }>();
  if (cached && cached.fetched_at > now() - RELEASE_MAX_AGE) return JSON.parse(cached.data);
  try {
    const token = await tokenOf(owner);
    const release = await (await discogs(`/releases/${releaseId}`, token)).json<any>();
    const masterYear = masterId ? (await (await discogs(`/masters/${masterId}`, token)).json<any>()).year : null;
    const detail = toReleaseDetail(release, masterYear);
    await d.prepare('INSERT OR REPLACE INTO releases (id, data, fetched_at) VALUES (?, ?, ?)').bind(releaseId, JSON.stringify(detail), now()).run();
    return detail;
  } catch (e) {
    console.error(`release fetch failed for ${releaseId}: ${e instanceof Error ? e.message : e}`);
    return cached ? JSON.parse(cached.data) : null;
  }
}
