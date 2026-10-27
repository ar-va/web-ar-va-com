// D1: users, sessions, invites, synced records, cached release details, comments.
import { env } from 'cloudflare:workers';
import type { AstroCookies } from 'astro';
import { randomToken, sha256, siteDomain, type ShelfRecord } from './lib';

// Tables are created lazily (no migration step in the deploy).
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, username TEXT, photo_url TEXT,
    is_collector INTEGER NOT NULL DEFAULT 0, discogs_username TEXT UNIQUE COLLATE NOCASE, discogs_token TEXT,
    synced_at INTEGER, sync_error TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS invites (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, used_by INTEGER)`,
  `CREATE TABLE IF NOT EXISTS oauth_pending (token TEXT PRIMARY KEY, secret TEXT NOT NULL, user_id INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS records (user_id INTEGER NOT NULL, instance_id INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (user_id, instance_id))`,
  `CREATE TABLE IF NOT EXISTS releases (id INTEGER PRIMARY KEY, data TEXT NOT NULL, fetched_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, shelf_id INTEGER NOT NULL, instance_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS comments_by_record ON comments (shelf_id, instance_id)`,
  `CREATE TABLE IF NOT EXISTS post_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, author_id INTEGER NOT NULL,
    body TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS post_comments_by_slug ON post_comments (slug)`,
];

let ready: Promise<unknown> | null = null;
export async function db() {
  ready ??= env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s))).catch((e) => { ready = null; throw e; });
  await ready;
  return env.DB;
}

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
}

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

export async function shelfOwner(discogsUsername: string) {
  return (await db()).prepare(`SELECT * FROM users WHERE discogs_username = ? AND ${collectorSql()}`).bind(discogsUsername).first<User>();
}

export async function adminShelfOwner() {
  return (await db()).prepare('SELECT * FROM users WHERE id = ? AND discogs_username IS NOT NULL').bind(Number(env.ADMIN_TELEGRAM_ID) || 0).first<User>();
}

export async function listShelves() {
  const { results } = await (await db()).prepare(
    `SELECT users.id, users.name, users.discogs_username, COUNT(records.instance_id) AS count FROM users
     LEFT JOIN records ON records.user_id = users.id
     WHERE discogs_username IS NOT NULL AND ${collectorSql()} GROUP BY users.id ORDER BY users.name`,
  ).all<{ id: number; name: string; discogs_username: string; count: number }>();
  return results;
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

// ---- Comments ----

export const COMMENT_MAX = 2000;
const COMMENTS_PER_10_MIN = 10;

export interface Comment { id: number; body: string; created_at: number; author_id: number; name: string; username: string | null; photo_url: string | null }

/** A comment thread: a record on a shelf, or a blog post. */
export type Thread = { shelfId: number; instanceId: number } | { slug: string };

const threadSql = (t: Thread) => 'slug' in t
  ? { table: 'post_comments', cols: ['slug'], where: 'slug = ?', args: [t.slug] }
  : { table: 'comments', cols: ['shelf_id', 'instance_id'], where: 'shelf_id = ? AND instance_id = ?', args: [t.shelfId, t.instanceId] };

export async function listComments(t: Thread) {
  const { table, where, args } = threadSql(t);
  const { results } = await (await db()).prepare(
    `SELECT c.id, body, c.created_at, author_id, users.name, users.username, users.photo_url FROM ${table} c
     JOIN users ON users.id = c.author_id WHERE ${where} ORDER BY c.id`,
  ).bind(...args).all<Comment>();
  return results;
}

/** Returns an error message, or null when the comment was saved. */
export async function addComment(t: Thread, author: User, body: string) {
  const text = body.replace(/\r\n/g, '\n').trim();
  if (!text) return 'Write something first.';
  if (text.length > COMMENT_MAX) return `Comments can be up to ${COMMENT_MAX} characters.`;
  const d = await db();
  const recent = await d.prepare(
    `SELECT (SELECT COUNT(*) FROM comments WHERE author_id = ?1 AND created_at > ?2)
          + (SELECT COUNT(*) FROM post_comments WHERE author_id = ?1 AND created_at > ?2) AS n`,
  ).bind(author.id, now() - 600).first<number>('n');
  if ((recent ?? 0) >= COMMENTS_PER_10_MIN) return 'That’s a lot of comments at once. Try again in a few minutes.';
  const { table, cols, args } = threadSql(t);
  await d.prepare(`INSERT INTO ${table} (${cols.join(', ')}, author_id, body, created_at) VALUES (${cols.map(() => '?').join(', ')}, ?, ?, ?)`)
    .bind(...args, author.id, text, now()).run();
  return null;
}

/** Who may delete: the author and the admin; on a record also the shelf's owner. */
export const canDeleteComment = (t: Thread, authorId: number, user: User | null) =>
  !!user && (user.id === authorId || isAdmin(user) || (!('slug' in t) && t.shelfId === user.id));

export async function deleteComment(t: Thread, commentId: number, user: User) {
  const { table, where, args } = threadSql(t);
  const comment = await (await db()).prepare(`SELECT author_id FROM ${table} WHERE id = ? AND ${where}`).bind(commentId, ...args).first<{ author_id: number }>();
  if (comment && canDeleteComment(t, comment.author_id, user)) await (await db()).prepare(`DELETE FROM ${table} WHERE id = ?`).bind(commentId).run();
}
