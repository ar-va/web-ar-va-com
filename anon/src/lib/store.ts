// D1: messages and the admin's replies. Nothing here identifies a sender: no IP address, no browser details, no
// cookies, no account, no contact details. A message is its text, a few flags, and the hash of its private link's secret.
import { env } from 'cloudflare:workers';
import { newToken, now, sha256 } from './core';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    body TEXT NOT NULL,
    wants_public INTEGER NOT NULL DEFAULT 0,
    published_at INTEGER,
    read_at INTEGER,
    created_at INTEGER NOT NULL,
    ticket TEXT NOT NULL UNIQUE
  )`,
  `CREATE INDEX IF NOT EXISTS messages_published ON messages (published_at)`,
  `CREATE TABLE IF NOT EXISTS replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    edited_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS replies_message ON replies (message_id)`,
];

let ready: Promise<unknown> | null = null;
/** The database, with its tables created once per Worker instance (no migrations to run by hand). */
export async function db() {
  ready ??= env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s))).catch((e) => { ready = null; throw e; });
  await ready;
  return env.DB;
}

export interface Message {
  id: number;
  body: string;
  wants_public: number;
  published_at: number | null;
  read_at: number | null;
  created_at: number;
  replies: Reply[];
}
export interface Reply { id: number; message_id: number; body: string; created_at: number; edited_at: number | null }

const COLUMNS = 'id, body, wants_public, published_at, read_at, created_at';

async function withReplies(rows: Omit<Message, 'replies'>[]): Promise<Message[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const { results } = await (await db()).prepare(`SELECT * FROM replies WHERE message_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at, id`)
    .bind(...ids).all<Reply>();
  return rows.map((r) => ({ ...r, replies: results.filter((x) => x.message_id === r.id) }));
}

// ---- Sending ----

export async function createMessage(body: string, wantsPublic: boolean) {
  const token = newToken();
  const row = await (await db()).prepare('INSERT INTO messages (body, wants_public, created_at, ticket) VALUES (?, ?, ?, ?) RETURNING id')
    .bind(body, wantsPublic ? 1 : 0, now(), await sha256(token)).first<{ id: number }>();
  return { id: row!.id, token };
}

/** Messages sent in the last hour, from everyone: a ceiling on floods that the per-visitor limit can't see. */
export async function recentCount(seconds = 3600) {
  const row = await (await db()).prepare('SELECT COUNT(*) AS n FROM messages WHERE created_at > ?').bind(now() - seconds).first<{ n: number }>();
  return row?.n ?? 0;
}

// ---- Reading ----

export const PAGE_SIZE = 20;

/** Below this many answered messages the page says nothing about response times: too few to mean anything. */
export const STATS_MIN = 5;

/**
 * Real numbers only (never padded, never estimated): how many messages have an answer, and the median time from a
 * message to its first answer, over the last 200 answered. Shown on the front page once there are STATS_MIN.
 */
export async function answerStats() {
  const { results } = await (await db()).prepare(
    `SELECT m.created_at AS sent, MIN(r.created_at) AS answered FROM messages m JOIN replies r ON r.message_id = m.id
     GROUP BY m.id ORDER BY m.created_at DESC LIMIT 200`,
  ).all<{ sent: number; answered: number }>();
  const total = (await (await db()).prepare('SELECT COUNT(DISTINCT message_id) AS n FROM replies').first<{ n: number }>())?.n ?? 0;
  const waits = results.map((r) => Math.max(0, r.answered - r.sent)).sort((a, b) => a - b);
  const median = waits.length ? waits[Math.floor((waits.length - 1) / 2)] : null;
  return { answered: total, medianSeconds: total >= STATS_MIN ? median : null };
}

export async function publishedPage(page: number) {
  const d = await db();
  const [rows, count] = await d.batch([
    d.prepare(`SELECT ${COLUMNS} FROM messages WHERE published_at IS NOT NULL ORDER BY published_at DESC, id DESC LIMIT ? OFFSET ?`)
      .bind(PAGE_SIZE, (page - 1) * PAGE_SIZE),
    d.prepare('SELECT COUNT(*) AS n FROM messages WHERE published_at IS NOT NULL'),
  ]);
  return { messages: await withReplies(rows.results as Omit<Message, 'replies'>[]), total: (count.results[0] as { n: number }).n };
}

export async function publishedMessage(id: number) {
  const row = await (await db()).prepare(`SELECT ${COLUMNS} FROM messages WHERE id = ? AND published_at IS NOT NULL`).bind(id).first<Omit<Message, 'replies'>>();
  return row ? (await withReplies([row]))[0] : null;
}

export async function messageByToken(token: string) {
  const row = await (await db()).prepare(`SELECT ${COLUMNS} FROM messages WHERE ticket = ?`).bind(await sha256(token)).first<Omit<Message, 'replies'>>();
  return row ? (await withReplies([row]))[0] : null;
}

export type InboxFilter = 'all' | 'unanswered' | 'public' | 'published';
const FILTERS: Record<InboxFilter, string> = {
  all: '1',
  unanswered: 'NOT EXISTS (SELECT 1 FROM replies WHERE replies.message_id = messages.id)',
  public: 'wants_public = 1 AND published_at IS NULL',
  published: 'published_at IS NOT NULL',
};
export const isInboxFilter = (s: string): s is InboxFilter => Object.hasOwn(FILTERS, s);

export async function inbox(filter: InboxFilter, page: number) {
  const d = await db();
  // Counts for every tab, plus the unread ones (shown as "N new").
  const counts = [...Object.values(FILTERS), 'read_at IS NULL'].map((where) => d.prepare(`SELECT COUNT(*) AS n FROM messages WHERE ${where}`));
  const [rows, ...n] = await d.batch([
    d.prepare(`SELECT ${COLUMNS} FROM messages WHERE ${FILTERS[filter]} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).bind(PAGE_SIZE, (page - 1) * PAGE_SIZE),
    ...counts,
  ]);
  const totals = Object.fromEntries([...Object.keys(FILTERS), 'new'].map((k, i) => [k, (n[i].results[0] as { n: number }).n])) as Record<InboxFilter | 'new', number>;
  return { messages: await withReplies(rows.results as Omit<Message, 'replies'>[]), totals };
}

export async function markRead(ids: number[]) {
  if (!ids.length) return;
  await (await db()).prepare(`UPDATE messages SET read_at = ? WHERE read_at IS NULL AND id IN (${ids.map(() => '?').join(',')})`).bind(now(), ...ids).run();
}

// ---- The sender's own changes (private link) ----

/** Asking to be public again only re-queues it for approval; making it private takes it off the page at once. */
export async function setWantsPublic(token: string, wantsPublic: boolean) {
  await (await db()).prepare(`UPDATE messages SET wants_public = ?${wantsPublic ? '' : ', published_at = NULL'} WHERE ticket = ?`)
    .bind(wantsPublic ? 1 : 0, await sha256(token)).run();
}

export async function deleteByToken(token: string) {
  const d = await db();
  const ticket = await sha256(token);
  await d.batch([
    d.prepare('DELETE FROM replies WHERE message_id = (SELECT id FROM messages WHERE ticket = ?)').bind(ticket),
    d.prepare('DELETE FROM messages WHERE ticket = ?').bind(ticket),
  ]);
}

// ---- Admin ----

export async function publish(id: number, on: boolean) {
  // Only what the sender asked to be public can be published.
  const d = await db();
  await (on
    ? d.prepare('UPDATE messages SET published_at = ? WHERE id = ? AND wants_public = 1 AND published_at IS NULL').bind(now(), id)
    : d.prepare('UPDATE messages SET published_at = NULL WHERE id = ?').bind(id)).run();
}

export async function deleteMessage(id: number) {
  const d = await db();
  await d.batch([d.prepare('DELETE FROM replies WHERE message_id = ?').bind(id), d.prepare('DELETE FROM messages WHERE id = ?').bind(id)]);
}

export async function addReply(messageId: number, body: string) {
  await (await db()).prepare('INSERT INTO replies (message_id, body, created_at) SELECT id, ?, ? FROM messages WHERE id = ?').bind(body, now(), messageId).run();
}

export async function editReply(id: number, body: string) {
  await (await db()).prepare('UPDATE replies SET body = ?, edited_at = ? WHERE id = ?').bind(body, now(), id).run();
}

export async function deleteReply(id: number) {
  await (await db()).prepare('DELETE FROM replies WHERE id = ?').bind(id).run();
}

