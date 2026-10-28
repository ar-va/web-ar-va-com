// D1: users, sessions, invites, synced records, cached release details, comments.
import { env } from 'cloudflare:workers';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { AstroCookies } from 'astro';
import { randomToken, sha256, shelfView, siteDomain, type Match, type Overrides, type ReleaseDetail, type ShelfRecord } from './lib';

// Tables are created lazily (no migration step in the deploy).
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, username TEXT, photo_url TEXT,
    is_collector INTEGER NOT NULL DEFAULT 0, discogs_username TEXT UNIQUE COLLATE NOCASE, discogs_token TEXT,
    synced_at INTEGER, sync_error TEXT, created_at INTEGER NOT NULL, shelf_name TEXT)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_shelf_name ON users (shelf_name)`,
  `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS invites (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, used_by INTEGER)`,
  `CREATE TABLE IF NOT EXISTS oauth_pending (token TEXT PRIMARY KEY, secret TEXT NOT NULL, user_id INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS records (user_id INTEGER NOT NULL, instance_id INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (user_id, instance_id))`,
  `CREATE TABLE IF NOT EXISTS releases (id INTEGER PRIMARY KEY, data TEXT NOT NULL, fetched_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, shelf_id INTEGER NOT NULL, instance_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL, parent_id INTEGER, edited_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS comments_by_record ON comments (shelf_id, instance_id)`,
  `CREATE TABLE IF NOT EXISTS post_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, author_id INTEGER NOT NULL,
    body TEXT NOT NULL, created_at INTEGER NOT NULL, parent_id INTEGER, edited_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS post_comments_by_slug ON post_comments (slug)`,
  `CREATE TABLE IF NOT EXISTS matches (release_id INTEGER PRIMARY KEY, data TEXT NOT NULL, matched_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS overrides (user_id INTEGER NOT NULL, instance_id INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (user_id, instance_id))`,
];

let ready: Promise<unknown> | null = null;

// One round trip per Worker instance: the database is far from most visitors (each trip ~0.3 s from North America).
// Columns added later (shelf_name, parent_id, edited_at) are in the definitions above; production got them by
// ALTER TABLE in October 2026. A new column for an existing table needs its own ALTER again.
export async function db() {
  ready ??= env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s))).catch((e) => { ready = null; throw e; });
  await ready;
  const request = dbRequest.getStore();
  if (!request) return env.DB;
  return (request.session ??= env.DB.withSession(request.bookmark ?? 'first-unconstrained'));
}

/**
 * One D1 session per request (set up in src/worker.ts). Read replication is on: a session reads from the nearest
 * copy (visitors in Europe aren't sent to North America), writes go to the primary, and a visitor who has just
 * written something carries its bookmark, so their next page waits for a copy that already has it.
 */
export const dbRequest = new AsyncLocalStorage<{ bookmark: string | null; session?: D1DatabaseSession }>();

const now = () => Math.floor(Date.now() / 1000);

export interface User {
  id: number;
  name: string;
  username: string | null;
  photo_url: string | null;
  is_collector: number;
  discogs_username: string | null;
  discogs_token: string | null;
  synced_at: number | null;
  sync_error: string | null;
  created_at: number;
  /** The owner's chosen shelf address (music.ar-va.com/<shelf_name>); the Discogs username always works too. */
  shelf_name: string | null;
}

/** The address a shelf is linked under: the chosen name, else the Discogs username. */
export const shelfSlug = (u: { shelf_name: string | null; discogs_username: string | null }) => u.shelf_name || u.discogs_username || '';

export const isAdmin = (u: User | null) => !!u && !!env.ADMIN_TELEGRAM_ID && String(u.id) === env.ADMIN_TELEGRAM_ID;
export const canCollect = (u: User | null) => !!u && (u.is_collector === 1 || isAdmin(u));

export async function saveTelegramUser(u: { id: number; name: string; username: string | null; photoUrl: string | null }) {
  await (await db()).prepare(
    `INSERT INTO users (id, name, username, photo_url, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (id) DO UPDATE SET name = ?2, username = ?3, photo_url = ?4`,
  ).bind(u.id, u.name, u.username, u.photoUrl, now()).run();
}

// ---- Sessions (the cookie holds a random token; D1 holds only its hash) ----

// One cookie for ar-va.com and music.ar-va.com, so a login on either counts on both.
const COOKIE = '__Secure-session';
const SESSION_DAYS = 30;
// Browsers refuse Domain=localhost, so locally each host keeps its own cookie.
const cookieDomain = (hostname: string) => (siteDomain(hostname) === 'localhost' ? undefined : siteDomain(hostname));

// Readable by the header script on every page (pre-rendered ones too): first name and photo only, it grants nothing.
const WHO_COOKIE = 'who';

export async function startSession(cookies: AstroCookies, user: { id: number; name: string; photoUrl: string | null }, hostname: string) {
  const token = randomToken();
  await (await db()).prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), user.id, now() + SESSION_DAYS * 86400).run();
  const opts = { secure: true, sameSite: 'lax', path: '/', maxAge: SESSION_DAYS * 86400, domain: cookieDomain(hostname) } as const;
  cookies.set(COOKIE, token, { ...opts, httpOnly: true });
  cookies.set(WHO_COOKIE, JSON.stringify({ n: user.name.split(' ')[0], p: user.photoUrl }), opts);
}

export async function currentUser(cookies: AstroCookies): Promise<User | null> {
  const token = cookies.get(COOKIE)?.value;
  if (!token) return null;
  return (await db()).prepare('SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ? AND expires_at > ?')
    .bind(await sha256(token), now()).first<User>();
}

export async function endSession(cookies: AstroCookies, hostname: string) {
  const token = cookies.get(COOKIE)?.value;
  if (token) await (await db()).prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256(token)).run();
  cookies.delete(COOKIE, { path: '/', domain: cookieDomain(hostname) });
  cookies.delete(WHO_COOKIE, { path: '/', domain: cookieDomain(hostname) });
}

// ---- Invites ----

const INVITE_DAYS = 7;

export async function createInvite() {
  const code = randomToken();
  await (await db()).prepare('INSERT INTO invites (id, created_at) VALUES (?, ?)').bind(await sha256(code), now()).run();
  return code;
}

/** Makes the user a collector if the code is unused and fresh. Returns false otherwise. */
export async function acceptInvite(code: string, user: User) {
  const d = await db();
  const res = await d.prepare('UPDATE invites SET used_by = ? WHERE id = ? AND used_by IS NULL AND created_at > ?')
    .bind(user.id, await sha256(code), now() - INVITE_DAYS * 86400).run();
  if (!res.meta.changes) return false;
  await d.prepare('UPDATE users SET is_collector = 1 WHERE id = ?').bind(user.id).run();
  return true;
}

/** Disconnects Discogs and removes the shelf; `revoke` also takes away collector access (admin only). */
export async function removeShelf(userId: number, revoke: boolean) {
  const d = await db();
  await d.batch([
    d.prepare('DELETE FROM records WHERE user_id = ?').bind(userId),
    d.prepare(`UPDATE users SET discogs_username = NULL, discogs_token = NULL, synced_at = NULL, sync_error = NULL${revoke ? ', is_collector = 0' : ''} WHERE id = ?`).bind(userId),
  ]);
}

// ---- Shelves ----

const collectorSql = () => `(is_collector = 1 OR id = ${Number(env.ADMIN_TELEGRAM_ID) || 0})`;
// The shelf at music.ar-va.com/<?1>: by its chosen name or its Discogs username.
const ownerWhere = () => `(shelf_name = lower(?1) OR discogs_username = ?1) AND discogs_username IS NOT NULL AND ${collectorSql()}`;

export async function shelfOwner(name: string) {
  return (await db()).prepare(`SELECT * FROM users WHERE ${ownerWhere()}`).bind(name).first<User>();
}

/** Sets (or clears, with null) the user's shelf address. Returns an error message or null. */
export async function setShelfName(user: User, name: string | null) {
  const d = await db();
  if (name && await d.prepare('SELECT id FROM users WHERE id != ?2 AND (shelf_name = ?1 OR discogs_username = ?1)').bind(name, user.id).first()) {
    return 'That address is already taken.';
  }
  await d.prepare('UPDATE users SET shelf_name = ? WHERE id = ?').bind(name, user.id).run();
  return null;
}

const shelvesSql = () => `SELECT users.id, users.name, users.discogs_username, users.shelf_name, COUNT(records.instance_id) AS count FROM users
  LEFT JOIN records ON records.user_id = users.id
  WHERE discogs_username IS NOT NULL AND ${collectorSql()} GROUP BY users.id ORDER BY users.name`;

/**
 * Everything a shelf page shows, in one round trip: the owner (by shelf name or Discogs username; null = the admin's
 * shelf), their records with edits, cached details and streaming matches, and the list of all shelves.
 */
export async function shelfData(name: string | null) {
  const owner = name === null
    ? `(SELECT id FROM users WHERE id = ${Number(env.ADMIN_TELEGRAM_ID) || 0} AND discogs_username IS NOT NULL)`
    : `(SELECT id FROM users WHERE ${ownerWhere()})`;
  const releaseIds = `(SELECT json_extract(data, '$.releaseId') FROM records WHERE user_id = ${owner})`;
  const d = await db();
  const q = (sql: string) => (name === null ? d.prepare(sql) : d.prepare(sql).bind(name));
  const [users, records, overrides, releases, matches, shelves] = await d.batch([
    q(`SELECT * FROM users WHERE id = ${owner}`),
    q(`SELECT data FROM records WHERE user_id = ${owner}`),
    q(`SELECT instance_id, data FROM overrides WHERE user_id = ${owner}`),
    q(`SELECT id, data FROM releases WHERE id IN ${releaseIds}`),
    q(`SELECT release_id, data FROM matches WHERE release_id IN ${releaseIds}`),
    d.prepare(shelvesSql()),
  ]);
  const byId = <T>(rows: unknown[], key: string) => new Map((rows as Record<string, any>[]).map((r) => [r[key] as number, JSON.parse(r.data) as T]));
  const details = byId<ReleaseDetail>(releases.results, 'id');
  const edits = byId<Overrides>(overrides.results, 'instance_id');
  const found = byId<Match>(matches.results, 'release_id');
  return {
    owner: (users.results[0] as User | undefined) ?? null,
    records: (records.results as { data: string }[]).map((r) => JSON.parse(r.data) as ShelfRecord)
      .sort((a, b) => b.added.localeCompare(a.added))
      .map((r) => shelfView(r, details.get(r.releaseId) ?? null, edits.get(r.instanceId) ?? {}, found.get(r.releaseId) ?? null)),
    shelves: shelves.results as { id: number; name: string; discogs_username: string; shelf_name: string | null; count: number }[],
  };
}

/** Everything a record page shows, in one round trip: owner, record, the owner's edits, cached details, match, comments. */
export async function recordData(name: string, instanceId: number) {
  const owner = `(SELECT id FROM users WHERE ${ownerWhere()})`;
  const releaseId = `(SELECT json_extract(data, '$.releaseId') FROM records WHERE user_id = ${owner} AND instance_id = ?2)`;
  const d = await db();
  const q = (sql: string) => d.prepare(sql).bind(name, instanceId);
  const [users, records, overrides, releases, matches, comments] = await d.batch([
    d.prepare(`SELECT * FROM users WHERE ${ownerWhere()}`).bind(name),
    q(`SELECT data FROM records WHERE user_id = ${owner} AND instance_id = ?2`),
    q(`SELECT data FROM overrides WHERE user_id = ${owner} AND instance_id = ?2`),
    q(`SELECT data FROM releases WHERE id = ${releaseId}`),
    q(`SELECT data FROM matches WHERE release_id = ${releaseId}`),
    q(`SELECT c.id, body, c.created_at, c.edited_at, c.parent_id, author_id, users.name, users.username, users.photo_url FROM comments c
       JOIN users ON users.id = c.author_id WHERE shelf_id = ${owner} AND instance_id = ?2 ORDER BY c.id`),
  ]);
  const one = <T>(r: { results: unknown[] }) => (r.results[0] ? (JSON.parse((r.results[0] as { data: string }).data) as T) : null);
  return {
    owner: (users.results[0] as User | undefined) ?? null,
    record: one<ShelfRecord>(records),
    overrides: one<Overrides>(overrides) ?? {},
    detail: one<ReleaseDetail>(releases),
    match: one<Match>(matches),
    comments: comments.results as Comment[],
  };
}

export async function adminShelfOwner() {
  return (await db()).prepare('SELECT * FROM users WHERE id = ? AND discogs_username IS NOT NULL').bind(Number(env.ADMIN_TELEGRAM_ID) || 0).first<User>();
}

export async function listCollectors() {
  const { results } = await (await db()).prepare(`SELECT * FROM users WHERE ${collectorSql()} ORDER BY name`).all<User>();
  return results;
}

export async function shelfRecords(userId: number) {
  const { results } = await (await db()).prepare('SELECT data FROM records WHERE user_id = ?').bind(userId).all<{ data: string }>();
  return results.map((r) => JSON.parse(r.data) as ShelfRecord).sort((a, b) => b.added.localeCompare(a.added));
}

export async function shelfRecord(userId: number, instanceId: number) {
  const row = await (await db()).prepare('SELECT data FROM records WHERE user_id = ? AND instance_id = ?').bind(userId, instanceId).first<{ data: string }>();
  return row ? (JSON.parse(row.data) as ShelfRecord) : null;
}

// ---- Owner edits: only the changed values are stored; Discogs' own data stays untouched underneath ----

export async function recordOverrides(userId: number, instanceId: number): Promise<Overrides> {
  const row = await (await db()).prepare('SELECT data FROM overrides WHERE user_id = ? AND instance_id = ?').bind(userId, instanceId).first<{ data: string }>();
  return row ? JSON.parse(row.data) : {};
}

export async function saveOverrides(userId: number, instanceId: number, data: Overrides) {
  const d = await db();
  await (Object.keys(data).length
    ? d.prepare('INSERT OR REPLACE INTO overrides (user_id, instance_id, data) VALUES (?, ?, ?)').bind(userId, instanceId, JSON.stringify(data))
    : d.prepare('DELETE FROM overrides WHERE user_id = ? AND instance_id = ?').bind(userId, instanceId)).run();
}

export async function releaseMatch(releaseId: number): Promise<import('./lib').Match | null> {
  const row = await (await db()).prepare('SELECT data FROM matches WHERE release_id = ?').bind(releaseId).first<{ data: string }>();
  return row ? JSON.parse(row.data) : null;
}

// ---- Comments ----

export const COMMENT_MAX = 2000;
const COMMENTS_PER_10_MIN = 10;

export interface Comment {
  id: number; body: string; created_at: number; edited_at: number | null; parent_id: number | null;
  author_id: number; name: string; username: string | null; photo_url: string | null;
}

/** A comment thread: a record on a shelf, or a blog post. */
export type Thread = { shelfId: number; instanceId: number } | { slug: string };

const threadSql = (t: Thread) => 'slug' in t
  ? { table: 'post_comments', cols: ['slug'], where: 'slug = ?', args: [t.slug] }
  : { table: 'comments', cols: ['shelf_id', 'instance_id'], where: 'shelf_id = ? AND instance_id = ?', args: [t.shelfId, t.instanceId] };

export async function listComments(t: Thread) {
  const { table, where, args } = threadSql(t);
  const { results } = await (await db()).prepare(
    `SELECT c.id, body, c.created_at, c.edited_at, c.parent_id, author_id, users.name, users.username, users.photo_url FROM ${table} c
     JOIN users ON users.id = c.author_id WHERE ${where} ORDER BY c.id`,
  ).bind(...args).all<Comment>();
  return results;
}

/** Comment text as stored, or an error message. */
function commentText(body: string) {
  const text = body.replace(/\r\n/g, '\n').trim();
  if (!text) return { error: 'Write something first.' };
  if (text.length > COMMENT_MAX) return { error: `Comments can be up to ${COMMENT_MAX} characters.` };
  return { text };
}

/**
 * Saves a comment (or a reply, with `parentId`). Replies stay one level deep: answering a reply attaches it to the
 * same top comment, but `parentAuthorId` is the person actually answered (for the notification).
 */
export async function addComment(t: Thread, author: User, body: string, parentId: number | null = null):
  Promise<{ error: string } | { id: number; parentAuthorId: number | null }> {
  const checked = commentText(body);
  if ('error' in checked) return checked;
  const d = await db();
  const recent = await d.prepare(
    `SELECT (SELECT COUNT(*) FROM comments WHERE author_id = ?1 AND created_at > ?2)
          + (SELECT COUNT(*) FROM post_comments WHERE author_id = ?1 AND created_at > ?2) AS n`,
  ).bind(author.id, now() - 600).first<number>('n');
  if ((recent ?? 0) >= COMMENTS_PER_10_MIN) return { error: 'That’s a lot of comments at once. Try again in a few minutes.' };
  const { table, cols, where, args } = threadSql(t);
  let parent: { id: number; parent_id: number | null; author_id: number } | null = null;
  if (parentId) {
    parent = await d.prepare(`SELECT id, parent_id, author_id FROM ${table} WHERE id = ? AND ${where}`).bind(parentId, ...args).first();
    if (!parent) return { error: 'That comment isn’t here any more.' };
  }
  const res = await d.prepare(`INSERT INTO ${table} (${cols.join(', ')}, author_id, body, created_at, parent_id) VALUES (${cols.map(() => '?').join(', ')}, ?, ?, ?, ?)`)
    .bind(...args, author.id, checked.text, now(), parent ? parent.parent_id ?? parent.id : null).run();
  return { id: Number(res.meta.last_row_id), parentAuthorId: parent?.author_id ?? null };
}

/** The author edits their own comment. Returns an error message or null. */
export async function editComment(t: Thread, commentId: number, user: User, body: string) {
  const checked = commentText(body);
  if ('error' in checked) return checked.error;
  const { table, where, args } = threadSql(t);
  await (await db()).prepare(`UPDATE ${table} SET body = ?, edited_at = ? WHERE id = ? AND author_id = ? AND ${where}`)
    .bind(checked.text, now(), commentId, user.id, ...args).run();
  return null;
}

/** Who may delete: the author and the admin; on a record also the shelf's owner. */
export const canDeleteComment = (t: Thread, authorId: number, user: User | null) =>
  !!user && (user.id === authorId || isAdmin(user) || (!('slug' in t) && t.shelfId === user.id));

/** Deleting a comment also deletes its replies. */
export async function deleteComment(t: Thread, commentId: number, user: User) {
  const { table, where, args } = threadSql(t);
  const comment = await (await db()).prepare(`SELECT author_id FROM ${table} WHERE id = ? AND ${where}`).bind(commentId, ...args).first<{ author_id: number }>();
  if (comment && canDeleteComment(t, comment.author_id, user)) await (await db()).prepare(`DELETE FROM ${table} WHERE id = ?1 OR parent_id = ?1`).bind(commentId).run();
}
