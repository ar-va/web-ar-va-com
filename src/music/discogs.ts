// Discogs, server side. The server never calls Discogs: Cloudflare's shared outgoing address is over Discogs'
// per-address limit (measured 2026-10-27: 71 of 25 used before our first request). Instead it signs requests that
// the collector's browser sends (src/music/sync.ts) and stores what the browser brings back.
import { env } from 'cloudflare:workers';
import { oauthHeader, safeCoverUrl, safeStreamingUrl, seal, signablePath, toReleaseDetail, toShelfRecord, unseal, type CollectionField, type Match, type ReleaseDetail } from './lib';
import { spotifyMatch } from './spotify';
import { db, type User } from './store';

type Token = { key: string; secret: string };
const API = 'https://api.discogs.com';
const now = () => Math.floor(Date.now() / 1000);
const tokenOf = async (u: User): Promise<Token> => JSON.parse(await unseal(u.discogs_token!, env.TOKEN_KEY));
const signed = async (method: 'GET' | 'POST', url: string, token?: Token, extra?: Record<string, string>) =>
  ({ method, url, authorization: await oauthHeader(method, url, { key: env.DISCOGS_CONSUMER_KEY, secret: env.DISCOGS_CONSUMER_SECRET }, token, extra) });

// ---- Connect (OAuth 1.0a, https://www.discogs.com/developers/#page:authentication,header:authentication-oauth-flow) ----

export const requestTokenRequest = (callbackUrl: string) => signed('GET', `${API}/oauth/request_token`, undefined, { oauth_callback: callbackUrl });

export async function savePending(user: User, token: string, secret: string) {
  const d = await db();
  await d.batch([
    d.prepare('DELETE FROM oauth_pending WHERE created_at < ?').bind(now() - 900),
    d.prepare('INSERT OR REPLACE INTO oauth_pending (token, secret, user_id, created_at) VALUES (?, ?, ?, ?)').bind(token, await seal(secret, env.TOKEN_KEY), user.id, now()),
  ]);
}

/** The signed access_token request for a pending sign-in, or null when it expired or isn't this user's. */
export async function accessTokenRequest(user: User, requestToken: string, verifier: string) {
  const d = await db();
  const pending = await d.prepare('SELECT secret FROM oauth_pending WHERE token = ? AND user_id = ? AND created_at > ?')
    .bind(requestToken, user.id, now() - 900).first<{ secret: string }>();
  await d.prepare('DELETE FROM oauth_pending WHERE token = ?').bind(requestToken).run();
  if (!pending) return null;
  return signed('POST', `${API}/oauth/access_token`, { key: requestToken, secret: await unseal(pending.secret, env.TOKEN_KEY) }, { oauth_verifier: verifier });
}

export async function saveToken(user: User, token: Token) {
  await (await db()).prepare('UPDATE users SET discogs_token = ? WHERE id = ?').bind(await seal(JSON.stringify(token), env.TOKEN_KEY), user.id).run();
}

/** Links the Discogs username (from /oauth/identity). Returns an error message or null. */
export async function setUsername(user: User, username: string) {
  // shortcut: the browser reports the username, so an invited collector could claim another (unclaimed) name; fine while shelves are invite-only.
  if (!/^[\w.-]{1,64}$/.test(username)) return 'Discogs sent an unexpected username.';
  const d = await db();
  if (await d.prepare('SELECT id FROM users WHERE discogs_username = ? AND id != ?').bind(username, user.id).first()) {
    return `The Discogs account “${username}” is already connected to another shelf.`;
  }
  const switched = user.discogs_username && user.discogs_username.toLowerCase() !== username.toLowerCase();
  await d.batch([
    ...(switched ? [d.prepare('DELETE FROM records WHERE user_id = ?').bind(user.id)] : []),
    d.prepare('UPDATE users SET discogs_username = ?, sync_error = NULL WHERE id = ?').bind(username, user.id),
  ]);
  return null;
}

/** A signed GET for one of the URLs `signablePath` allows, or null. */
export async function signFor(user: User, path: string) {
  const url = signablePath(path, user.discogs_username);
  return url && user.discogs_token ? signed('GET', url, await tokenOf(user)) : null;
}

// ---- What the browser brings back ----

const RELEASE_MAX_AGE = 30 * 86400;

/** Replaces the user's records; returns which releases still need details (tracklist etc.). */
export async function saveCollection(user: User, fields: CollectionField[], items: any[]) {
  if (!Array.isArray(fields) || !Array.isArray(items) || items.length > 10_000) throw new Error('Unexpected collection data');
  const records = items.map((i) => toShelfRecord(i, fields));
  if (records.some((r) => !Number.isSafeInteger(r.instanceId) || !Number.isSafeInteger(r.releaseId))) throw new Error('Unexpected collection data');
  const d = await db();
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
  return { count: records.length, missing: await missingReleases(user) };
}

/** Releases on the user's shelf without fresh details (or cached before the first-release date was added). */
export async function missingReleases(user: User) {
  const d = await db();
  const { results } = await d.prepare(
    `SELECT DISTINCT json_extract(r.data, '$.releaseId') AS releaseId, json_extract(r.data, '$.masterId') AS masterId FROM records r
     LEFT JOIN releases rel ON rel.id = json_extract(r.data, '$.releaseId') AND rel.fetched_at > ?
       AND json_type(rel.data, '$.firstReleased') IS NOT NULL AND json_type(rel.data, '$.images') IS NOT NULL
     WHERE r.user_id = ? AND rel.id IS NULL`,
  ).bind(now() - RELEASE_MAX_AGE, user.id).all<{ releaseId: number; masterId: number }>();
  return results;
}

/** Caches a release's details, only for releases on the uploader's own shelf. */
export async function saveRelease(user: User, release: any, masterYear: unknown, firstReleased: unknown) {
  const id = Number(release?.id);
  const d = await db();
  const owned = Number.isSafeInteger(id) && await d.prepare(`SELECT 1 FROM records WHERE user_id = ? AND json_extract(data, '$.releaseId') = ? LIMIT 1`).bind(user.id, id).first();
  if (!owned) return false;
  const detail = toReleaseDetail(release, Number.isSafeInteger(masterYear) ? (masterYear as number) : null, typeof firstReleased === 'string' ? firstReleased : null);
  await d.prepare('INSERT OR REPLACE INTO releases (id, data, fetched_at) VALUES (?, ?, ?)').bind(id, JSON.stringify(detail), now()).run();
  return true;
}

export async function cachedRelease(releaseId: number): Promise<ReleaseDetail | null> {
  const row = await (await db()).prepare('SELECT data FROM releases WHERE id = ?').bind(releaseId).first<{ data: string }>();
  return row ? JSON.parse(row.data) : null;
}

// ---- Streaming matches (Apple Music found by the browser, Spotify looked up here) ----

const MATCH_MAX_AGE = 60 * 86400;

/** Releases on the shelf not (recently) looked up on the streaming services, with the names to search for. */
export async function unmatchedReleases(user: User) {
  const { results } = await (await db()).prepare(
    `SELECT DISTINCT json_extract(r.data, '$.releaseId') AS releaseId, json_extract(r.data, '$.artist') AS artist, json_extract(r.data, '$.title') AS title
     FROM records r LEFT JOIN matches m ON m.release_id = json_extract(r.data, '$.releaseId') AND m.matched_at > ?
     WHERE r.user_id = ? AND m.release_id IS NULL`,
  ).bind(now() - MATCH_MAX_AGE, user.id).all<{ releaseId: number; artist: string; title: string }>();
  return results;
}

/** Stores what the browser found on Apple Music (checked) plus a Spotify lookup; only for releases on the user's shelf. */
export async function saveMatch(user: User, releaseId: number, apple: any, artist?: unknown, title?: unknown) {
  const d = await db();
  const record = Number.isSafeInteger(releaseId) && await d.prepare(
    `SELECT json_extract(data, '$.artist') AS artist, json_extract(data, '$.title') AS title FROM records WHERE user_id = ? AND json_extract(data, '$.releaseId') = ? LIMIT 1`,
  ).bind(user.id, releaseId).first<{ artist: string; title: string }>();
  if (!record) return false;
  const match: Match = {};
  const albumUrl = typeof apple?.url === 'string' ? safeStreamingUrl(apple.url, 'apple') : null;
  if (albumUrl) {
    match.apple = {
      url: albumUrl,
      artwork: typeof apple.artwork === 'string' ? safeCoverUrl(apple.artwork) : null,
      tracks: (Array.isArray(apple.tracks) ? apple.tracks : []).slice(0, 100)
        .map((t: any) => ({ title: String(t?.title ?? '').slice(0, 300), url: typeof t?.url === 'string' ? safeStreamingUrl(t.url, 'apple') : null }))
        .filter((t: { title: string; url: string | null }) => t.title && t.url),
    };
  }
  try {
    // The owner's edited artist and title when re-matching from the edit page (Discogs' spelling otherwise).
    const name = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : fallback);
    const spotify = await spotifyMatch(name(artist, record.artist), name(title, record.title));
    if (spotify) match.spotify = spotify;
  } catch (e) {
    console.log(`spotify match failed for ${releaseId}: ${e instanceof Error ? e.message : e}`);
  }
  await d.prepare('INSERT OR REPLACE INTO matches (release_id, data, matched_at) VALUES (?, ?, ?)').bind(releaseId, JSON.stringify(match), now()).run();
  return true;
}
