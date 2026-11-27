// Wishlists (design: docs/superpowers/specs/2026-11-24-wishlist-design.md). Each collector has two lists, the Discogs
// wantlist (synced by the browser, discogs.ts) and albums added on the site; `users.wishlist_source` picks the one shown.
// Logged-in visitors reserve items; the owner never sees a reservation (it's left out of the owner's data entirely),
// until the giver says they gave it. Reservers get Telegram reminders (sendReminders, from the daily cron).
import { escapeHtml, displayDate, textToTracklist, tracklistToText, withMatchLinks, type Match, type ReleaseDetail, type ShelfRecord, type Track } from '@shared/lib/lib';
import { RESERVATIONS_MAX, WISHES_MAX, giveOnButton, isOwned, reservationCard, reservationEnds, whereLines, ownedKey, reminderDue, reserveState, toWish, type ReserveState, type Wish } from '@shared/lib/wishlist';
import { notify } from '@shared/lib/notify';
import { byId, db, ownerWhere, shelfSlug, userById, type User } from '@shared/lib/store';

const now = () => Math.floor(Date.now() / 1000);
const first = (name: string) => name.split(' ')[0];

export type WishSource = 'discogs' | 'custom';
export const sourceOf = (u: User): WishSource => (u.wishlist_source === 'discogs' && u.discogs_username ? 'discogs' : 'custom');

export interface WishItem {
  /** 'd:<release id>' (Discogs) or 'c:<wish id>' (added on the site): the reservation's item. */
  key: string;
  /** For Cover's per-record wear and the page anchor. */
  instanceId: number;
  masterId: number;
  releaseId: number;
  artist: string;
  title: string;
  year: number | null;
  /** Discogs' genres (wantlist records); none for albums added on the site. */
  genres: string[];
  cover: string | null;
  vinyl: null;
  tracks: Track[];
  links: { spotify: string; apple: string; youtube: string };
  note: string | null;
  /** Where to get it (albums added on the site): shops, a name and / or link each. */
  where: string[];
  /** The owner's "Most wanted" star. */
  top: boolean;
  /** ISO date it was added, for the order (newest first). */
  added: string;
  /** The stored wish (custom items), for the edit form. */
  wish?: Wish;
}

/** An item in addresses: 'd:123' → 'd-123' (its page: /<shelf>/wishlist/d-123), and back (null if it isn't one). */
export const wishSlug = (key: string) => key.replace(':', '-');
export const wishKey = (slug: string) => (/^[dc]-\d{1,12}$/.test(slug) ? slug.replace('-', ':') : null);
/** The item's spot on the wishlist shelf: '#wish-d-123'. */
export const wishAnchor = (key: string) => `wish-${wishSlug(key)}`;

/** What happened, after a form on the wishlist or a record's page (?reserved, ?taken…), for a Notice. */
export function wishNotice(q: URLSearchParams, ownerFirst: string) {
  if (q.has('reserved')) return 'Reserved. You’ll find it in your settings too, and you’ll get reminders about it.';
  if (q.has('taken')) return 'Someone reserved it a moment ago. Pick another?';
  if (q.has('limit')) return `You have ${RESERVATIONS_MAX} reservations open. Give or cancel one first.`;
  if (q.has('gifted')) return `Thank you! ${ownerFirst} has been told it’s from you.`;
  return null;
}

const fromWant = (r: ShelfRecord, d: ReleaseDetail | null, m: Match | null): WishItem => ({
  key: `d:${r.releaseId}`, instanceId: r.releaseId, masterId: r.masterId, releaseId: r.releaseId, artist: r.artist, title: r.title,
  year: d?.originalYear ?? r.year, genres: r.genres, cover: r.cover ?? m?.apple?.artwork ?? null, vinyl: null, tracks: withMatchLinks(d?.tracklist ?? [], m),
  links: { spotify: m?.spotify?.url ?? '', apple: m?.apple?.url ?? '', youtube: m?.youtube?.url ?? '' }, note: null, where: [], top: false, added: r.added,
});

const fromWish = (id: number, w: Wish, createdAt: number): WishItem => ({
  key: `c:${id}`, instanceId: id, masterId: 0, releaseId: 0, artist: w.artist, title: w.title, year: w.year, genres: [], cover: w.cover, vinyl: null,
  tracks: textToTracklist(w.tracklist), links: w.links, note: w.note, where: whereLines(w.where), top: false, added: new Date(createdAt * 1000).toISOString(), wish: w,
});

type ShelfKeys = { masters: Set<number>; releases: Set<number>; names: Set<string> };
const shelfKeys = (rows: unknown[]): ShelfKeys => {
  const keys: ShelfKeys = { masters: new Set(), releases: new Set(), names: new Set() };
  for (const r of rows as { m: number; r: number; a: string; t: string }[]) {
    if (r.m) keys.masters.add(r.m);
    keys.releases.add(r.r);
    keys.names.add(ownedKey(r.a ?? '', r.t ?? ''));
  }
  return keys;
};
const shelfKeysSql = (owner: string) =>
  `SELECT json_extract(data, '$.masterId') AS m, json_extract(data, '$.releaseId') AS r, json_extract(data, '$.artist') AS a, json_extract(data, '$.title') AS t FROM records WHERE user_id = ${owner}`;

/**
 * Everything the wishlist page shows, in one round trip. Reservations never come back for the logged-in owner (the
 * database doesn't even hand them over), except which items are gifted (those leave the list for everyone); a
 * logged-out visitor learns only that an item is reserved, a logged-in one also whether it's theirs.
 */
export async function wishlistData(name: string, viewer: User | null) {
  const owner = `(SELECT id FROM users WHERE ${ownerWhere()})`;
  const d = await db();
  const q = (sql: string) => d.prepare(sql).bind(name);
  const [users, wants, wishes, shelf, releases, matches, stars, reservations] = await d.batch([
    q(`SELECT * FROM users WHERE id = ${owner}`),
    q(`SELECT data FROM wants WHERE user_id = ${owner}`),
    q(`SELECT id, data, created_at FROM wishes WHERE user_id = ${owner}`),
    q(shelfKeysSql(owner)),
    q(`SELECT id, data FROM releases WHERE id IN (SELECT release_id FROM wants WHERE user_id = ${owner})`),
    q(`SELECT release_id, data FROM matches WHERE release_id IN (SELECT release_id FROM wants WHERE user_id = ${owner})`),
    q(`SELECT item FROM wish_stars WHERE owner_id = ${owner}`),
    // Who reserved: never for the owner; "someone" (0) for a logged-out visitor; the id for a logged-in one (to tell theirs).
    d.prepare(`SELECT item, gifted_at IS NOT NULL AS gifted, CASE WHEN ?2 = owner_id THEN NULL WHEN ?2 = 0 THEN 0 ELSE user_id END AS user_id,
      CASE WHEN ?2 != 0 AND ?2 = user_id THEN give_on END AS give_on, CASE WHEN ?2 != 0 AND ?2 = user_id THEN created_at END AS reserved_at FROM reservations WHERE owner_id = ${owner}`).bind(name, viewer?.id ?? 0),
  ]);
  const user = (users.results[0] as User | undefined) ?? null;
  if (!user) return { owner: null, source: 'custom' as WishSource, items: [] };
  const details = byId<ReleaseDetail>(releases.results, 'id');
  const found = byId<Match>(matches.results, 'release_id');
  const res = new Map((reservations.results as { item: string; gifted: number; user_id: number | null; give_on: string | null; reserved_at: number | null }[]).map((r) => [r.item, r]));
  const source = sourceOf(user);
  const keys = shelfKeys(shelf.results);
  const starred = new Set((stars.results as { item: string }[]).map((r) => r.item));
  const list = source === 'discogs'
    ? (wants.results as { data: string }[]).map((r) => JSON.parse(r.data) as ShelfRecord).map((r) => fromWant(r, details.get(r.releaseId) ?? null, found.get(r.releaseId) ?? null))
    : (wishes.results as { id: number; data: string; created_at: number }[]).map((r) => fromWish(r.id, JSON.parse(r.data), r.created_at));
  const items = list
    .filter((i) => !res.get(i.key)?.gifted && !isOwned(i, keys))
    .sort((a, b) => b.added.localeCompare(a.added))
    .map((i) => ({ ...i, top: starred.has(i.key), state: reserveState(res.get(i.key)?.user_id ?? null, viewer?.id ?? null, user.id) as ReserveState, giveOn: res.get(i.key)?.give_on ?? null,
      // The reserver's own: the last day it holds.
      heldUntil: res.get(i.key)?.reserved_at ? reservationEnds({ created_at: res.get(i.key)!.reserved_at!, give_on: res.get(i.key)!.give_on }) : null }));
  return { owner: user, source, items };
}

/** How many items the shelf's wishlist shows (for its link on the shelf), without reservations. */
export async function wishCount(name: string) {
  const owner = `(SELECT id FROM users WHERE ${ownerWhere()})`;
  const discogs = `(SELECT wishlist_source = 'discogs' FROM users WHERE id = ${owner})`;
  const d = await db();
  const q = (sql: string) => d.prepare(sql).bind(name);
  const [items, shelf, gifted] = await d.batch([
    q(`SELECT 'd:' || release_id AS key, json_extract(data, '$.masterId') AS masterId, release_id AS releaseId, json_extract(data, '$.artist') AS artist,
      json_extract(data, '$.title') AS title FROM wants WHERE user_id = ${owner} AND ${discogs} IS 1
      UNION ALL SELECT 'c:' || id, 0, 0, json_extract(data, '$.artist'), json_extract(data, '$.title') FROM wishes WHERE user_id = ${owner} AND ${discogs} IS NOT 1`),
    q(shelfKeysSql(owner)),
    q(`SELECT item FROM reservations WHERE owner_id = ${owner} AND gifted_at IS NOT NULL`),
  ]);
  const skip = new Set((gifted.results as { item: string }[]).map((r) => r.item));
  const keys = shelfKeys(shelf.results);
  return (items.results as { key: string; masterId: number; releaseId: number; artist: string; title: string }[])
    .filter((i) => !skip.has(i.key) && !isOwned(i, keys)).length;
}

// ---- The owner's list ----

export async function setWishlistSource(user: User, source: WishSource) {
  await (await db()).prepare('UPDATE users SET wishlist_source = ? WHERE id = ?').bind(source, user.id).run();
}

/** Adds an album to the owner's own list; false when it already holds WISHES_MAX. */
export async function addWish(user: User, wish: Wish) {
  const row = await (await db()).prepare(`INSERT INTO wishes (user_id, data, created_at) SELECT ?1, ?2, ?3
    WHERE (SELECT count(*) FROM wishes WHERE user_id = ?1) < ?4 RETURNING id`).bind(user.id, JSON.stringify(wish), now(), WISHES_MAX).first<{ id: number }>();
  return row?.id ?? null;
}

export async function updateWish(user: User, id: number, wish: Wish) {
  await (await db()).prepare('UPDATE wishes SET data = ? WHERE id = ? AND user_id = ?').bind(JSON.stringify(wish), id, user.id).run();
}

/**
 * A Discogs wantlist record copied to the owner's own list (user 2026-11-25): album, cover, tracklist with its listening
 * links, the star. The id of the copy, 'exists' when that artist and album are already on the own list, or 'full'.
 */
export async function copyToOwnList(owner: User, item: WishItem): Promise<number | 'exists' | 'full'> {
  const d = await db();
  const { results } = await d.prepare('SELECT data FROM wishes WHERE user_id = ?').bind(owner.id).all<{ data: string }>();
  const key = ownedKey(item.artist, item.title);
  if (results.some((r) => { const w = JSON.parse(r.data) as Wish; return ownedKey(w.artist, w.title) === key; })) return 'exists';
  const wish = toWish({ artist: item.artist, title: item.title, year: item.year ?? '', cover: item.cover ?? '', tracklist: tracklistToText(item.tracks), links: item.links });
  if ('error' in wish) return 'full';
  const id = await addWish(owner, wish);
  if (!id) return 'full';
  if (item.top) await setStar(owner, `c:${id}`, true);
  return id;
}

/** The owner's "Most wanted" star on a record of either list, on or off. */
export async function setStar(owner: User, item: string, on: boolean) {
  const d = await db();
  await (on ? d.prepare('INSERT OR IGNORE INTO wish_stars (owner_id, item) VALUES (?, ?)') : d.prepare('DELETE FROM wish_stars WHERE owner_id = ? AND item = ?'))
    .bind(owner.id, item).run();
}

/** Removes an album from the owner's own list; whoever reserved it is told. */
export async function removeWish(user: User, id: number) {
  const d = await db();
  await d.prepare('DELETE FROM wish_stars WHERE owner_id = ? AND item = ?').bind(user.id, `c:${id}`).run();
  const row = await d.prepare('DELETE FROM wishes WHERE id = ? AND user_id = ? RETURNING data').bind(id, user.id).first<{ data: string }>();
  if (row) await closeReservations(user, [{ key: `c:${id}`, title: (JSON.parse(row.data) as Wish).title }], 'removed');
}

/**
 * Items that left the list (taken off it, or now on the shelf): their open reservations are deleted and each reserver
 * gets a message (Telegram or email), so nobody buys a gift that's no longer wanted. Gifted reservations stay (they're history).
 */
export async function closeReservations(owner: { id: number; name: string }, items: { key: string; title: string }[], why: 'removed' | 'owned') {
  if (!items.length) return;
  const d = await db();
  const titles = new Map(items.map((i) => [i.key, i.title]));
  const closed: { item: string; user_id: number }[] = [];
  // One statement per 90 items (D1 allows 100 bound parameters).
  const keys = [...titles.keys()];
  for (let i = 0; i < keys.length; i += 90) {
    const chunk = keys.slice(i, i + 90);
    const { results } = await d.prepare(`DELETE FROM reservations WHERE owner_id = ? AND gifted_at IS NULL AND item IN (${chunk.map(() => '?').join(', ')}) RETURNING item, user_id`)
      .bind(owner.id, ...chunk).all<{ item: string; user_id: number }>();
    closed.push(...results);
  }
  const who = escapeHtml(first(owner.name));
  await notify(closed.map((r) => {
    const title = `<b>${escapeHtml(titles.get(r.item) ?? '')}</b>`;
    return {
      chatId: r.user_id,
      text: why === 'owned'
        ? `${who} now has ${title} on the shelf, so your reservation is closed. Thank you!`
        : `${who} took ${title} off the wishlist, so your reservation is gone. If you already bought it, you could still give it.`,
    };
  }));
}

/** After a collection sync: open reservations of items now on the owner's shelf are closed (any pressing counts). */
export async function closeOwnedReservations(owner: User) {
  const d = await db();
  const id = '?1';
  const [open, wants, wishes, shelf] = await d.batch([
    d.prepare(`SELECT item FROM reservations WHERE owner_id = ${id} AND gifted_at IS NULL`).bind(owner.id),
    d.prepare(`SELECT data FROM wants WHERE user_id = ${id}`).bind(owner.id),
    d.prepare(`SELECT id, data FROM wishes WHERE user_id = ${id}`).bind(owner.id),
    d.prepare(shelfKeysSql(id)).bind(owner.id),
  ]);
  const reserved = new Set((open.results as { item: string }[]).map((r) => r.item));
  if (!reserved.size) return;
  const keys = shelfKeys(shelf.results);
  const items = [
    ...(wants.results as { data: string }[]).map((r) => JSON.parse(r.data) as ShelfRecord).map((r) => ({ key: `d:${r.releaseId}`, ...r })),
    ...(wishes.results as { id: number; data: string }[]).map((r) => ({ key: `c:${r.id}`, ...(JSON.parse(r.data) as Wish) })),
  ];
  await closeReservations(owner, items.filter((i) => reserved.has(i.key) && isOwned(i, keys)), 'owned');
}

// ---- Reservations (the page checks the item is on the shown list and free before calling these) ----

/** 'ok', 'taken' (someone was quicker) or 'limit' (RESERVATIONS_MAX open ones already). */
export async function reserve(ownerId: number, item: string, user: User, giveOn: string | null): Promise<'ok' | 'taken' | 'limit'> {
  const d = await db();
  const open = await d.prepare('SELECT count(*) AS n FROM reservations WHERE user_id = ? AND gifted_at IS NULL').bind(user.id).first<{ n: number }>();
  if ((open?.n ?? 0) >= RESERVATIONS_MAX) return 'limit';
  const row = await d.prepare(`INSERT INTO reservations (owner_id, item, user_id, created_at, give_on) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (owner_id, item) DO NOTHING RETURNING item`).bind(ownerId, item, user.id, now(), giveOn).first();
  return row ? 'ok' : 'taken';
}

/** The reserver's own open reservation: cancelled (true when there was one). */
export async function unreserve(ownerId: number, item: string, userId: number) {
  const row = await (await db()).prepare('DELETE FROM reservations WHERE owner_id = ? AND item = ? AND user_id = ? AND gifted_at IS NULL RETURNING item')
    .bind(ownerId, item, userId).first();
  return !!row;
}

export async function setGiveOn(ownerId: number, item: string, userId: number, giveOn: string | null) {
  await (await db()).prepare('UPDATE reservations SET give_on = ?, reminded_at = NULL WHERE owner_id = ? AND item = ? AND user_id = ? AND gifted_at IS NULL')
    .bind(giveOn, ownerId, item, userId).run();
}

/** The giver handed it over: the item leaves the list and the owner is told who it's from. False if it isn't theirs to mark. */
export async function markGifted(ownerId: number, item: string, giver: { id: number; name: string }) {
  const d = await db();
  const row = await d.prepare('UPDATE reservations SET gifted_at = ? WHERE owner_id = ? AND item = ? AND user_id = ? AND gifted_at IS NULL RETURNING item')
    .bind(now(), ownerId, item, giver.id).first();
  if (!row) return false;
  const title = await itemTitle(ownerId, item);
  await notify([{
    chatId: ownerId,
    text: `<b>${escapeHtml(giver.name)}</b> gave you <b>${escapeHtml(title)}</b> 🎁${item.startsWith('d:') ? '\n\nAdd it to your collection on Discogs, and take it off your wantlist.' : ''}`,
  }]);
  return true;
}

async function itemTitle(ownerId: number, item: string) {
  const [kind, id] = item.split(':');
  const row = await (await db()).prepare(kind === 'd' ? 'SELECT data FROM wants WHERE user_id = ? AND release_id = ?' : 'SELECT data FROM wishes WHERE user_id = ? AND id = ?')
    .bind(ownerId, Number(id)).first<{ data: string }>();
  return row ? String(JSON.parse(row.data).title ?? '') : 'a record';
}

const reservationsSql = `SELECT r.owner_id, r.item, r.user_id, r.created_at, r.give_on, r.reminded_at, o.name AS owner_name, o.shelf_name, o.discogs_username,
  coalesce(w.data, c.data) AS data FROM reservations r JOIN users o ON o.id = r.owner_id
  LEFT JOIN wants w ON r.item = 'd:' || w.release_id AND w.user_id = r.owner_id
  LEFT JOIN wishes c ON r.item = 'c:' || c.id AND c.user_id = r.owner_id
  WHERE r.gifted_at IS NULL`;
type ReservationRow = { owner_id: number; item: string; user_id: number; created_at: number; give_on: string | null; reminded_at: number | null;
  owner_name: string; shelf_name: string | null; discogs_username: string | null; data: string | null };
const reservationView = (r: ReservationRow) => {
  const data = r.data ? JSON.parse(r.data) : {};
  return { ...r, artist: String(data.artist ?? ''), title: String(data.title ?? ''), cover: (data.cover as string | null) ?? null,
    list: `/${shelfSlug(r)}/wishlist`, href: `/${shelfSlug(r)}/wishlist/${wishSlug(r.item)}` };
};

/** The person's open reservations on every shelf (settings, "Gifts you’ve reserved"), soonest giving date first. */
export async function myReservations(user: User) {
  const { results } = await (await db()).prepare(`${reservationsSql} AND r.user_id = ? AND (w.data IS NOT NULL OR c.data IS NOT NULL)
    ORDER BY r.give_on IS NULL, r.give_on, r.created_at DESC`).bind(user.id).all<ReservationRow>();
  return results.map(reservationView);
}

// ---- Reminders (the daily cron, music/src/worker.ts) ----

/** Sends today's reminders (Telegram, or email for email accounts: notify), each with "I gave it" / "Cancel reservation" buttons (api/telegram.ts). */
export async function sendReminders(origin: string, today = new Date().toISOString().slice(0, 10)) {
  const d = await db();
  const { results } = await d.prepare(`${reservationsSql} AND (w.data IS NOT NULL OR c.data IS NOT NULL)`).all<ReservationRow>();
  const due = results.map((r) => ({ r: reservationView(r), kind: reminderDue(r, today) })).filter((x) => x.kind);
  if (!due.length) return 0;
  const sent = await notify(due.map(({ r, kind }) => {
    const who = escapeHtml(first(r.owner_name)), title = `<b>${escapeHtml(r.title)}</b>`;
    const text = kind === 'ending' ? `Your reservation of ${title} for ${who} ends on ${displayDate(reservationEnds(r))}. Mark it as given, or set a later giving date on the record’s page to keep it.`
      : kind === 'before' ? `In 3 days you’re giving ${who} ${title} (${displayDate(r.give_on!)}).`
      : kind === 'after' ? `Did you give ${who} ${title}?`
      : `You reserved ${title} for ${who}. Still planning to give it?`;
    return {
      chatId: r.user_id,
      text,
      buttons: [
        [{ text: `I gave it to ${first(r.owner_name)}`, callback_data: `gift:${r.owner_id}:${r.item}` }, { text: 'Cancel reservation', callback_data: `unres:${r.owner_id}:${r.item}` }],
        [giveOnButton(r.owner_id, r.item, r.give_on)],
        [{ text: 'Open the wishlist', url: `${origin}${r.href}` }],
      ],
    };
  }));
  // Marked as reminded even when Telegram refused (never allowed messages): it would refuse again tomorrow too.
  await d.batch(due.map(({ r }) => d.prepare('UPDATE reservations SET reminded_at = ? WHERE owner_id = ? AND item = ?').bind(now(), r.owner_id, r.item)));
  return sent.filter(Boolean).length;
}

/**
 * Reservations not given by the end of their time (`reservationEnds`) end: the record is free for others again, and the
 * reserver is told, with a link to reserve it again. Gifted ones are history and stay. Returns how many ended.
 */
export async function endExpiredReservations(origin: string, today = new Date().toISOString().slice(0, 10)) {
  const d = await db();
  const { results } = await d.prepare(reservationsSql).all<ReservationRow>();
  const ended = results.map(reservationView).filter((r) => reservationEnds(r) < today);
  if (!ended.length) return 0;
  await d.batch(ended.map((r) => d.prepare('DELETE FROM reservations WHERE owner_id = ? AND item = ? AND gifted_at IS NULL').bind(r.owner_id, r.item)));
  await notify(ended.filter((r) => r.title).map((r) => ({
    chatId: r.user_id,
    text: `Your reservation of <b>${escapeHtml(r.title)}</b> for ${escapeHtml(first(r.owner_name))} has ended (it wasn’t marked as given in time), so others can reserve it now.`,
    buttons: [[{ text: 'Reserve it again', url: `${origin}${r.href}` }]],
  })));
  return ended.length;
}

/**
 * A reservation's message buttons, as `reservationCard` makes them, for the bot to put back after the calendar (the
 * date row then shows the date just set). Null when it isn't this person's open reservation any more.
 */
export async function reservationButtons(ownerId: number, item: string, reserver: User, origin: string) {
  const owner = await userById(ownerId);
  if (!owner) return null;
  const { items } = await wishlistData(shelfSlug(owner), reserver);
  const found = items.find((i) => i.key === item && i.state === 'mine');
  if (!found) return null;
  return reservationCard({
    ownerFirst: first(owner.name), title: found.title, artist: found.artist, year: found.year, top: found.top, tracks: found.tracks,
    note: found.note, where: found.where, giveOn: found.giveOn, links: found.links, item, ownerId,
    pageUrl: `${origin}/${shelfSlug(owner)}/wishlist/${wishSlug(item)}`,
  }).buttons;
}

/** The giving date of an open reservation (null: none set, or no such reservation). */
export async function currentGiveOn(ownerId: number, item: string) {
  const row = await (await db()).prepare('SELECT give_on FROM reservations WHERE owner_id = ? AND item = ? AND gifted_at IS NULL').bind(ownerId, item).first<{ give_on: string | null }>();
  return row?.give_on ?? null;
}

/** Who reserved an item (for a Telegram button tap): the open reservation's giver, the owner's name and wishlist path. */
export async function openReservation(ownerId: number, item: string) {
  const row = await (await db()).prepare(`SELECT r.user_id, o.name AS owner_name, o.shelf_name, o.discogs_username FROM reservations r
    JOIN users o ON o.id = r.owner_id WHERE r.owner_id = ? AND r.item = ? AND r.gifted_at IS NULL`).bind(ownerId, item)
    .first<{ user_id: number; owner_name: string; shelf_name: string | null; discogs_username: string | null }>();
  return row && { user_id: row.user_id, owner_name: row.owner_name, wishlist: `/${shelfSlug(row)}/wishlist` };
}
