// D1: users, sessions, invites, synced records, cached release details, comments.
import { env } from 'cloudflare:workers';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { AstroCookies } from 'astro';
import { activeLink, nameKey, randomToken, seal, sha256, shelfView, siteDomain, unseal, type Match, type Overrides, type ReleaseDetail, type ShelfRecord } from './lib';

// Tables are created lazily (no migration step in the deploy).
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, username TEXT, photo_url TEXT,
    is_collector INTEGER NOT NULL DEFAULT 0, discogs_username TEXT UNIQUE COLLATE NOCASE, discogs_token TEXT,
    synced_at INTEGER, sync_error TEXT, created_at INTEGER NOT NULL, shelf_name TEXT, shelf_note TEXT, invited_by INTEGER, shelf_request_at INTEGER)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_shelf_name ON users (shelf_name)`,
  `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
  // Invite links since 2026-10-30, like Discord's: expiry and number of uses chosen by the creator; the code is kept
  // encrypted (TOKEN_KEY) so its creator can copy it again, and looked up by its hash (id).
  `CREATE TABLE IF NOT EXISTS invite_links (id TEXT PRIMARY KEY, code TEXT NOT NULL, created_by INTEGER NOT NULL, created_at INTEGER NOT NULL,
    expires_at INTEGER, max_uses INTEGER, uses INTEGER NOT NULL DEFAULT 0, revoked_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS invite_links_by_creator ON invite_links (created_by)`,
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

// Changes to existing tables after launch (new columns are also in the definitions above, for a fresh database). Each
// runs once per Worker instance alongside the schema; "duplicate column" errors are ignored. (shelf_name, parent_id,
// edited_at got a one-off manual ALTER in October 2026.) The one-use `invites` table was replaced by invite_links on
// 2026-10-30 and is dropped (user: fine to delete the old links).
const COLUMNS = ['ALTER TABLE users ADD COLUMN shelf_note TEXT', 'ALTER TABLE users ADD COLUMN invited_by INTEGER', 'ALTER TABLE users ADD COLUMN shelf_request_at INTEGER', 'DROP TABLE IF EXISTS invites'];

let ready: Promise<unknown> | null = null;

// One round trip per Worker instance: the database is far from most visitors (each trip ~0.3 s from North America).
export async function db() {
  ready ??= Promise.all([
    env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s))),
    ...COLUMNS.map((s) => env.DB.prepare(s).run().catch(() => null)),
  ]).catch((e) => { ready = null; throw e; });
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
  /** The owner's short note about their collection, shown on their shelf and in the directory. */
  shelf_note: string | null;
  /** Who invited them (invite links since 2026-10-30). */
  invited_by: number | null;
  /** When they last asked for a shelf ("Request a shelf"), unix seconds. */
  shelf_request_at: number | null;
}

/** The address a shelf is linked under: the chosen name, else the Discogs username. */
export const shelfSlug = (u: { shelf_name: string | null; discogs_username: string | null }) => u.shelf_name || u.discogs_username || '';

export const isAdmin = (u: User | null) => !!u && !!env.ADMIN_TELEGRAM_ID && String(u.id) === env.ADMIN_TELEGRAM_ID;
export const canCollect = (u: User | null) => !!u && (u.is_collector === 1 || isAdmin(u));

export async function saveTelegramUser(u: { id: number; name: string; username: string | null; photoUrl: string | null }) {
  return (await (await db()).prepare(
    `INSERT INTO users (id, name, username, photo_url, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (id) DO UPDATE SET name = ?2, username = ?3, photo_url = ?4 RETURNING *`,
  ).bind(u.id, u.name, u.username, u.photoUrl, now()).first<User>())!;
}

export const userById = async (id: number) => (await db()).prepare('SELECT * FROM users WHERE id = ?').bind(id).first<User>();

// ---- Sessions (the cookie holds a random token; D1 holds only its hash) ----

// One cookie for ar-va.com and music.ar-va.com, so a login on either counts on both.
const COOKIE = '__Secure-session';
const SESSION_DAYS = 30;
// Browsers refuse Domain=localhost, so locally each host keeps its own cookie.
const cookieDomain = (hostname: string) => (siteDomain(hostname) === 'localhost' ? undefined : siteDomain(hostname));

// Readable by the header script on every page (pre-rendered ones too), it grants nothing: first name, photo, and for
// collectors their shelf address (s) or that Discogs still needs connecting (d), for the account menu.
const WHO_COOKIE = 'who';
const cookieOptions = (hostname: string) => ({ secure: true, sameSite: 'lax', path: '/', maxAge: SESSION_DAYS * 86400, domain: cookieDomain(hostname) } as const);

/** Writes the header's `who` cookie; settings refreshes it on each visit (after connecting Discogs, a new address…). */
export function setWho(cookies: AstroCookies, user: User, hostname: string) {
  const shelf = canCollect(user) ? (user.discogs_username ? { s: shelfSlug(user) } : { d: 1 }) : {};
  cookies.set(WHO_COOKIE, JSON.stringify({ n: user.name.split(' ')[0], p: user.photo_url, ...shelf }), cookieOptions(hostname));
}

export async function startSession(cookies: AstroCookies, user: { id: number; name: string; photoUrl: string | null }, hostname: string) {
  const token = randomToken();
  const d = await db();
  const [, row] = await d.batch([
    d.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').bind(await sha256(token), user.id, now() + SESSION_DAYS * 86400),
    d.prepare('SELECT * FROM users WHERE id = ?').bind(user.id),
  ]);
  cookies.set(COOKIE, token, { ...cookieOptions(hostname), httpOnly: true });
  // The row always exists: the Telegram callback saves the user before starting the session.
  const saved = row.results[0] as User | undefined;
  if (saved) setWho(cookies, saved, hostname);
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

/** "Request a shelf": once a week at most; the admin gets a Telegram message (settings sends it). */
export const REQUEST_EVERY_DAYS = 7;
export async function requestShelf(user: User): Promise<'sent' | 'recent' | 'collector'> {
  if (canCollect(user)) return 'collector';
  const res = await (await db()).prepare('UPDATE users SET shelf_request_at = ?1 WHERE id = ?2 AND (shelf_request_at IS NULL OR shelf_request_at < ?3)')
    .bind(now(), user.id, now() - REQUEST_EVERY_DAYS * 86400).run();
  return res.meta.changes ? 'sent' : 'recent';
}
export const adminTelegramId = () => Number(env.ADMIN_TELEGRAM_ID) || 0;

/** Discord's choices (0 = never / no limit). "Never" and "No limit" are the admin's only (user, 2026-10-30). */
export const INVITE_EXPIRY = [['30 minutes', 1800], ['1 hour', 3600], ['6 hours', 21600], ['12 hours', 43200], ['1 day', 86400], ['7 days', 604800], ['Never', 0]] as const;
export const INVITE_USES = [['No limit', 0], ['1 use', 1], ['5 uses', 5], ['10 uses', 10], ['25 uses', 25], ['50 uses', 50], ['100 uses', 100]] as const;
/** What `user` may pick, and their defaults: Discord's (7 days, no limit) for the admin, 7 days and 10 uses otherwise. */
export function inviteOptions(user: User) {
  const admin = isAdmin(user);
  return {
    expiry: INVITE_EXPIRY.filter(([, v]) => admin || v > 0),
    uses: INVITE_USES.filter(([, v]) => admin || v > 0),
    defaults: { expiresIn: 604800, maxUses: admin ? 0 : 10 },
  };
}
/** Active invite links a collector may have at once (the admin has no limit): keeps growth, and the bill, in check. */
export const OPEN_INVITES_MAX = 5;

/**
 * A new invite link (`expiresIn` seconds, `maxUses`; 0 = never / no limit). Values `by` may not pick become their
 * defaults. Null when `by` already has too many working links.
 */
export async function createInvite(by: User, expiresIn: number, maxUses: number) {
  const { expiry, uses, defaults } = inviteOptions(by);
  if (!expiry.some(([, v]) => v === expiresIn)) expiresIn = defaults.expiresIn;
  if (!uses.some(([, v]) => v === maxUses)) maxUses = defaults.maxUses;
  const d = await db();
  if (!isAdmin(by)) {
    const open = await d.prepare(`SELECT COUNT(*) AS n FROM invite_links WHERE created_by = ?2 AND ${activeLink()}`).bind(now(), by.id).first<{ n: number }>();
    if ((open?.n ?? 0) >= OPEN_INVITES_MAX) return null;
  }
  // Short like a Discord code (10 characters, ~60 bits): links expire or run out, and are revocable.
  const code = randomToken().slice(0, 10);
  await d.prepare('INSERT INTO invite_links (id, code, created_by, created_at, expires_at, max_uses) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(await sha256(code), await seal(code, env.TOKEN_KEY), by.id, now(), expiresIn ? now() + expiresIn : null, maxUses || null).run();
  return code;
}

/** Active invite links, newest first: the user's own, or everyone's for the admin (like Discord's Invites tab). */
export async function listInvites(by: User) {
  const mine = isAdmin(by) ? '' : ' AND l.created_by = ?2';
  const q = (await db()).prepare(`SELECT l.id, l.code, l.created_by, l.created_at, l.expires_at, l.max_uses, l.uses, users.name AS inviter
    FROM invite_links l JOIN users ON users.id = l.created_by WHERE ${activeLink('l.')}${mine} ORDER BY l.created_at DESC, l.rowid DESC LIMIT 50`);
  const { results } = await (mine ? q.bind(now(), by.id) : q.bind(now()))
    .all<{ id: string; code: string; created_by: number; created_at: number; expires_at: number | null; max_uses: number | null; uses: number; inviter: string }>();
  // A link sealed with an older TOKEN_KEY can't be shown any more (it still works); it's left out.
  const shown = await Promise.all(results.map(async (r) => ({ ...r, code: await unseal(r.code, env.TOKEN_KEY).catch(() => null) })));
  return shown.filter((r): r is typeof r & { code: string } => r.code !== null);
}

/** Stops a link working: its creator's, or any for the admin. */
export async function revokeInvite(by: User, id: string) {
  await (await db()).prepare(`UPDATE invite_links SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL${isAdmin(by) ? '' : ' AND created_by = ?'}`)
    .bind(...[now(), id, ...(isAdmin(by) ? [] : [by.id])]).run();
}

/**
 * A working invite: who sent it (their shelf for the preview), when it expires and how many uses are left (null =
 * never / no limit). Null when the code is used up, expired, revoked or unknown.
 */
export async function inviteDetails(code: string) {
  return (await db()).prepare(`SELECT users.id, users.name, users.photo_url, users.shelf_name, users.discogs_username, l.expires_at, l.max_uses - l.uses AS uses_left
    FROM invite_links l JOIN users ON users.id = l.created_by WHERE l.id = ?2 AND ${activeLink('l.')}`).bind(now(), await sha256(code))
    .first<{ id: number; name: string; photo_url: string | null; shelf_name: string | null; discogs_username: string | null; expires_at: number | null; uses_left: number | null }>();
}

// The invite someone opened while logged out: whichever way they then log in (Telegram's window, the login page, the
// login page's other buttons), the Telegram callback accepts it, so the invite isn't lost on the way.
const INVITE_COOKIE = 'invite';
export const rememberInvite = (cookies: AstroCookies, code: string, hostname: string) =>
  cookies.set(INVITE_COOKIE, code, { ...cookieOptions(hostname), maxAge: 86400, httpOnly: true });
export const hasPendingInvite = (cookies: AstroCookies) => cookies.has(INVITE_COOKIE);
/** Accepts the remembered invite (once) for someone who isn't a collector yet; true if that made them one. */
export async function acceptPendingInvite(cookies: AstroCookies, user: User, hostname: string) {
  const code = cookies.get(INVITE_COOKIE)?.value;
  if (!code) return false;
  cookies.delete(INVITE_COOKIE, { path: '/', domain: cookieDomain(hostname) });
  return !canCollect(user) && (await acceptInvite(code, user));
}

/** Makes the user a collector (and remembers who invited them) if the link still works. Returns false otherwise. */
export async function acceptInvite(code: string, user: User) {
  const d = await db();
  const link = await d.prepare(`UPDATE invite_links SET uses = uses + 1 WHERE id = ?2 AND ${activeLink()} RETURNING created_by`)
    .bind(now(), await sha256(code)).first<{ created_by: number }>();
  if (!link) return false;
  await d.prepare('UPDATE users SET is_collector = 1, invited_by = ? WHERE id = ?').bind(link.created_by, user.id).run();
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

const collectorSql = (table = '') => `(${table}is_collector = 1 OR ${table}id = ${Number(env.ADMIN_TELEGRAM_ID) || 0})`;
// The shelf at music.ar-va.com/<?1>: by its chosen name or its Discogs username.
const ownerWhere = () => `(shelf_name = lower(?1) OR discogs_username = ?1) AND discogs_username IS NOT NULL AND ${collectorSql()}`;

export async function shelfOwner(name: string) {
  return (await db()).prepare(`SELECT * FROM users WHERE ${ownerWhere()}`).bind(name).first<User>();
}

/** Sets (or clears, with null) the user's shelf address. Returns an error message or null. */
export async function setShelfName(user: User, name: string | null) {
  const d = await db();
  // Taken, or a look-alike of another collector's address or Discogs name (dashes, underscores and dots ignored).
  const key = (col: string) => `replace(replace(replace(lower(${col}), '-', ''), '_', ''), '.', '')`;
  if (name && await d.prepare(`SELECT id FROM users WHERE id != ?2 AND (${key('shelf_name')} = ?1 OR ${key('discogs_username')} = ?1)`).bind(nameKey(name), user.id).first()) {
    return 'That address is taken, or too close to another collector’s. Please pick another.';
  }
  await d.prepare('UPDATE users SET shelf_name = ? WHERE id = ?').bind(name, user.id).run();
  return null;
}

/** Shelf comments live in the comments table under instance_id 0 (Discogs collection instance ids start at 1). */
export const SHELF_THREAD = 0;
const commentsSql = `SELECT c.id, body, c.created_at, c.edited_at, c.parent_id, author_id, users.name, users.username, users.photo_url
  FROM comments c JOIN users ON users.id = c.author_id`;

/**
 * Everything a shelf page shows, in one round trip: the owner (by shelf name or Discogs username), their records with
 * edits, cached details and streaming matches, and the comments on the shelf itself.
 */
export async function shelfData(name: string) {
  const owner = `(SELECT id FROM users WHERE ${ownerWhere()})`;
  const releaseIds = `(SELECT json_extract(data, '$.releaseId') FROM records WHERE user_id = ${owner})`;
  const d = await db();
  const q = (sql: string) => d.prepare(sql).bind(name);
  const [users, records, overrides, releases, matches, comments] = await d.batch([
    q(`SELECT * FROM users WHERE id = ${owner}`),
    q(`SELECT data FROM records WHERE user_id = ${owner}`),
    q(`SELECT instance_id, data FROM overrides WHERE user_id = ${owner}`),
    q(`SELECT id, data FROM releases WHERE id IN ${releaseIds}`),
    q(`SELECT release_id, data FROM matches WHERE release_id IN ${releaseIds}`),
    q(`${commentsSql} WHERE shelf_id = ${owner} AND instance_id = ${SHELF_THREAD} ORDER BY c.id`),
  ]);
  const byId = <T>(rows: unknown[], key: string) => new Map((rows as Record<string, any>[]).map((r) => [r[key] as number, JSON.parse(r.data) as T]));
  const details = byId<ReleaseDetail>(releases.results, 'id');
  const edits = byId<Overrides>(overrides.results, 'instance_id');
  const found = byId<Match>(matches.results, 'release_id');
  return {
    owner: (users.results[0] as User | undefined) ?? null,
    // Sorted after the owner's edits are applied: their own "Added on" dates count.
    records: (records.results as { data: string }[]).map((r) => JSON.parse(r.data) as ShelfRecord)
      .map((r) => shelfView(r, details.get(r.releaseId) ?? null, edits.get(r.instanceId) ?? {}, found.get(r.releaseId) ?? null))
      .sort((a, b) => b.added.localeCompare(a.added)),
    comments: comments.results as Comment[],
  };
}

/** Everything for the owner's CSV export, in one round trip: each record with its cached details, match and edits. */
export async function collectionExport(userId: number) {
  const releaseIds = `(SELECT json_extract(data, '$.releaseId') FROM records WHERE user_id = ?1)`;
  const d = await db();
  const [records, overrides, releases, matches] = await d.batch([
    d.prepare('SELECT data FROM records WHERE user_id = ?1').bind(userId),
    d.prepare('SELECT instance_id, data FROM overrides WHERE user_id = ?1').bind(userId),
    d.prepare(`SELECT id, data FROM releases WHERE id IN ${releaseIds}`).bind(userId),
    d.prepare(`SELECT release_id, data FROM matches WHERE release_id IN ${releaseIds}`).bind(userId),
  ]);
  const byId = <T>(rows: unknown[], key: string) => new Map((rows as Record<string, any>[]).map((r) => [r[key] as number, JSON.parse(r.data) as T]));
  const details = byId<ReleaseDetail>(releases.results, 'id');
  const edits = byId<Overrides>(overrides.results, 'instance_id');
  const found = byId<Match>(matches.results, 'release_id');
  return (records.results as { data: string }[]).map((row) => {
    const record = JSON.parse(row.data) as ShelfRecord;
    return { record, detail: details.get(record.releaseId) ?? null, match: found.get(record.releaseId) ?? null, overrides: edits.get(record.instanceId) ?? {} };
  });
}

export async function setShelfNote(userId: number, note: string | null) {
  await (await db()).prepare('UPDATE users SET shelf_note = ? WHERE id = ?').bind(note, userId).run();
}

/** Everything a record page shows, in one round trip: owner, record, the owner's edits, cached details, match, comments. */
export async function recordData(name: string, instanceId: number) {
  const owner = `(SELECT id FROM users WHERE ${ownerWhere()})`;
  const releaseId = `(SELECT json_extract(data, '$.releaseId') FROM records WHERE user_id = ${owner} AND instance_id = ?2)`;
  const d = await db();
  const q = (sql: string) => d.prepare(sql).bind(name, instanceId);
  const [users, records, overrides, releases, matches, comments, sameDay] = await d.batch([
    d.prepare(`SELECT * FROM users WHERE ${ownerWhere()}`).bind(name),
    q(`SELECT data FROM records WHERE user_id = ${owner} AND instance_id = ?2`),
    q(`SELECT data FROM overrides WHERE user_id = ${owner} AND instance_id = ?2`),
    q(`SELECT data FROM releases WHERE id = ${releaseId}`),
    q(`SELECT data FROM matches WHERE release_id = ${releaseId}`),
    q(`${commentsSql} WHERE shelf_id = ${owner} AND instance_id = ?2 ORDER BY c.id`),
    // How many of the owner's records Discogs dated on this record's day (a bulk-entry day means the date is doubtful).
    q(`SELECT COUNT(*) AS n FROM records WHERE user_id = ${owner} AND substr(json_extract(data, '$.added'), 1, 10) =
       (SELECT substr(json_extract(data, '$.added'), 1, 10) FROM records WHERE user_id = ${owner} AND instance_id = ?2)`),
  ]);
  const one = <T>(r: { results: unknown[] }) => (r.results[0] ? (JSON.parse((r.results[0] as { data: string }).data) as T) : null);
  return {
    owner: (users.results[0] as User | undefined) ?? null,
    record: one<ShelfRecord>(records),
    overrides: one<Overrides>(overrides) ?? {},
    detail: one<ReleaseDetail>(releases),
    match: one<Match>(matches),
    comments: comments.results as Comment[],
    sameDay: (sameDay.results[0] as { n: number } | undefined)?.n ?? 0,
  };
}

export async function adminShelfOwner() {
  return (await db()).prepare('SELECT * FROM users WHERE id = ? AND discogs_username IS NOT NULL').bind(Number(env.ADMIN_TELEGRAM_ID) || 0).first<User>();
}

/** For the admin: every collector, with who invited them. */
export async function listCollectors() {
  const { results } = await (await db()).prepare(`SELECT users.*, referrer.name AS invited_by_name
    FROM users LEFT JOIN users referrer ON referrer.id = users.invited_by
    WHERE ${collectorSql('users.')} ORDER BY users.name`).all<User & { invited_by_name: string | null }>();
  return results;
}

/**
 * music.ar-va.com/: every shelf with its latest records, most recently added to first, in one round trip.
 * shortcut: reads every record row on each visit (fine for dozens of shelves); past a few hundred collectors, keep a
 * per-shelf summary row updated on sync instead.
 */
export async function directory(perShelf = 5) {
  const latest = `SELECT user_id, instance_id, data FROM (SELECT user_id, instance_id, data,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY json_extract(data, '$.added') DESC) AS n FROM records) WHERE n <= ${perShelf}`;
  const d = await db();
  const [shelves, records, overrides] = await d.batch([
    d.prepare(`SELECT users.id, users.name, users.username, users.photo_url, users.discogs_username, users.shelf_name, users.shelf_note,
      COUNT(*) AS count, MAX(json_extract(records.data, '$.added')) AS latest,
      (SELECT COUNT(*) FROM comments WHERE shelf_id = users.id AND instance_id = ${SHELF_THREAD}) AS comments
      FROM users JOIN records ON records.user_id = users.id
      WHERE discogs_username IS NOT NULL AND ${collectorSql('users.')} GROUP BY users.id ORDER BY latest DESC`),
    d.prepare(latest),
    d.prepare(`SELECT o.user_id, o.instance_id, o.data FROM overrides o JOIN (${latest}) l ON l.user_id = o.user_id AND l.instance_id = o.instance_id`),
  ]);
  const edits = new Map((overrides.results as { user_id: number; instance_id: number; data: string }[]).map((o) => [`${o.user_id}/${o.instance_id}`, JSON.parse(o.data) as Overrides]));
  const byUser = new Map<number, ReturnType<typeof shelfView>[]>();
  for (const row of records.results as { user_id: number; instance_id: number; data: string }[]) {
    const r = JSON.parse(row.data) as ShelfRecord;
    const list = byUser.get(row.user_id) ?? [];
    list.push(shelfView(r, null, edits.get(`${row.user_id}/${row.instance_id}`) ?? {}));
    byUser.set(row.user_id, list);
  }
  return (shelves.results as { id: number; name: string; username: string | null; photo_url: string | null; discogs_username: string;
    shelf_name: string | null; shelf_note: string | null; count: number; comments: number }[])
    .map((s) => ({ ...s, records: (byUser.get(s.id) ?? []).sort((a, b) => b.added.localeCompare(a.added)) }));
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

export async function saveOverrides(userId: number, instanceId: number, data: Overrides) {
  const d = await db();
  await (Object.keys(data).length
    ? d.prepare('INSERT OR REPLACE INTO overrides (user_id, instance_id, data) VALUES (?, ?, ?)').bind(userId, instanceId, JSON.stringify(data))
    : d.prepare('DELETE FROM overrides WHERE user_id = ? AND instance_id = ?').bind(userId, instanceId)).run();
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
