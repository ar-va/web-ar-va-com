// The wishlist's rules, no Cloudflare imports (tested by shared/tests/wishlist.test.js): album links from the streaming
// services, what a wish may hold, which wishes the owner already has, who sees a reservation, when to remind.
import { artistKey, cleanNote, escapeHtml, linkify, normalizeName, safeCoverUrl, safeDay, safeStreamingUrl, textToTracklist, tracklistToText, type Track } from './lib.ts';

export const WISHES_MAX = 200;
export const WHERE_MAX = 5;

/** A wish's shops as lines, whatever was stored or posted (one string before 2026-11-25, a list since). */
export const whereLines = (v: unknown): string[] => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : []).filter((x): x is string => typeof x === 'string');

/** One shop line as a button: its name (the words around the link) or the link's site, and the link (null: no link). */
export function shopLink(line: string) {
  const url = linkify(line).find((p): p is { url: string } => 'url' in p)?.url ?? null;
  // The words left once the link is out, tidied: "Sound Shop: <link>, ask for Ben" → "Sound Shop, ask for Ben".
  const name = (url ? line.replace(url, '') : line)
    .replace(/[:–—-]\s*(?=[,;])/g, '').replace(/\s+([,;:])/g, '$1').replace(/\s+/g, ' ')
    .trim().replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, '');
  return { label: name || (url ? new URL(url).hostname.replace(/^www\./, '') : line), url };
}
export const RESERVATIONS_MAX = 20;

export type LinkService = 'apple' | 'spotify' | 'youtube';

/** An album page on Apple Music, Spotify or YouTube Music, or null. YouTube ids are what its browse API takes. */
export function parseStreamingLink(value: string): { service: LinkService; id: string; country?: string } | null {
  let u: URL;
  try { u = new URL(value.trim()); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  if (u.hostname === 'music.apple.com') {
    const m = u.pathname.match(/^\/(\w\w)\/album\/(?:[^/]+\/)?(\d+)\/?$/);
    return m ? { service: 'apple', id: m[2], country: m[1] } : null;
  }
  if (u.hostname === 'open.spotify.com') {
    const m = u.pathname.match(/^\/(?:intl-[\w-]+\/)?album\/([A-Za-z0-9]{10,40})\/?$/);
    return m ? { service: 'spotify', id: m[1] } : null;
  }
  if (['music.youtube.com', 'www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(u.hostname)) {
    const browse = u.hostname === 'music.youtube.com' && u.pathname.match(/^\/browse\/(MPREb_[\w-]+)$/);
    if (browse) return { service: 'youtube', id: browse[1] };
    // Album playlists (OLAK5uy_…) are albums; other playlists are someone's mix.
    const list = u.pathname === '/playlist' && u.searchParams.get('list');
    return list && /^OLAK5uy_[\w-]+$/.test(list) ? { service: 'youtube', id: `VL${list}` } : null;
  }
  return null;
}

/** What a streaming service's album page gives (music/src/lib: Apple in the browser, Spotify and YouTube on the server). */
export interface AlbumLookup {
  artist: string;
  title: string;
  year: number | null;
  cover: string | null;
  link: string;
  tracks: { title: string; duration: string; url: string }[];
}

/** A looked-up album as form values (a Wish before `toWish`), each track linked on the service it came from. */
export const lookupToWish = (l: AlbumLookup, service: LinkService) => ({
  artist: l.artist, title: l.title, year: l.year ? String(l.year) : '', cover: l.cover ?? '',
  tracklist: tracklistToText(l.tracks.map((t, i) => ({ position: String(i + 1), title: t.title, duration: t.duration, heading: false, ...(t.url && { links: { [service]: t.url } }) }))),
  links: { spotify: '', apple: '', youtube: '', [service]: l.link },
});

export interface Wish {
  artist: string;
  title: string;
  year: number | null;
  cover: string | null;
  /** The edit page's text format, "A1 | Title | 4:52 | <links>". */
  tracklist: string;
  links: Record<LinkService, string>;
  note: string | null;
  /** Where to get it: shops, one per line (a name and / or link each; user 2026-11-25), at most WHERE_MAX; shown as
   *  buttons (`shopLink`). Saved before 2026-11-25 as one string: read through `whereLines`. */
  where: string[];
}

const text = (v: unknown, max = 300) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '');

/** A wish as stored: whatever the form or a lookup sent, checked again (only text, known hosts, limits). */
export function toWish(input: any): Wish | { error: string } {
  const artist = text(input?.artist), title = text(input?.title);
  if (!artist || !title) return { error: 'Add the artist and the album.' };
  const year = Number(text(input.year, 4));
  const links = input.links ?? {};
  return {
    artist,
    title,
    year: Number.isInteger(year) && year >= 1900 && year <= new Date().getUTCFullYear() + 1 ? year : null,
    cover: safeCoverUrl(text(input.cover, 1000)),
    tracklist: tracklistToText(textToTracklist(text(input.tracklist, 100_000)).slice(0, 300)),
    links: {
      spotify: safeStreamingUrl(text(links.spotify, 1000), 'spotify') ?? '',
      apple: safeStreamingUrl(text(links.apple, 1000), 'apple') ?? '',
      youtube: safeStreamingUrl(text(links.youtube, 1000), 'youtube') ?? '',
    },
    note: cleanNote(text(input.note, 2000)),
    where: whereLines(input.where).map((w) => text(w, 2000).replace(/\s+/g, ' ').slice(0, 300)).filter(Boolean).slice(0, WHERE_MAX),
  };
}

/** What was typed in the one-line box: "Artist – Album" (any dash with spaces around it), else just the album. */
export function splitArtistAlbum(text: string) {
  const m = text.trim().match(/^(.+?)\s+[-–—]\s+(.+)$/);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: '', title: text.trim() };
}

/** How a typed wish is compared with the shelf's records when there are no Discogs ids to compare. */
export const ownedKey = (artist: string, title: string) => `${artistKey(artist)}|${normalizeName(title)}`;

/** Already on the owner's shelf: any pressing of the same album (master), the same release, or the same names. */
export function isOwned(item: { masterId?: number; releaseId?: number; artist: string; title: string },
  shelf: { masters: Set<number>; releases: Set<number>; names: Set<string> }) {
  if (item.masterId && shelf.masters.has(item.masterId)) return true;
  if (item.releaseId && shelf.releases.has(item.releaseId)) return true;
  return shelf.names.has(ownedKey(item.artist, item.title));
}

/**
 * What one viewer sees of a reservation. The owner (logged in) never sees one: gifts stay a surprise. Everyone else sees
 * that it's reserved (logged-out visitors too, user 2026-11-25, knowing the owner would see it logged out), but only
 * the reserver sees it's theirs. `reservedBy` 0 = reserved by someone not named (what a logged-out page is given).
 */
export type ReserveState = 'none' | 'login' | 'free' | 'mine' | 'taken';
export function reserveState(reservedBy: number | null, viewerId: number | null, ownerId: number): ReserveState {
  if (viewerId === ownerId) return 'none';
  if (reservedBy === null) return viewerId === null ? 'login' : 'free';
  return reservedBy === viewerId ? 'mine' : 'taken';
}

const DAY = 86400;
const dayOf = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);
const shift = (day: string, days: number) => dayOf(Date.parse(`${day}T00:00:00Z`) / 1000 + days * DAY);

/**
 * Which reminder is due today (a UTC day): 3 days before the reservation ends; 3 days before the giving date and the
 * day after it; without a date, two weeks after reserving, then every 30 days. Never two on one day.
 */
export function reminderDue(r: { created_at: number; give_on: string | null; reminded_at: number | null }, today: string): 'before' | 'after' | 'nudge' | 'ending' | null {
  if (r.reminded_at && dayOf(r.reminded_at) === today) return null;
  if (today === shift(reservationEnds(r), -3)) return 'ending';
  if (r.give_on) return today === shift(r.give_on, -3) ? 'before' : today === shift(r.give_on, 1) ? 'after' : null;
  const now = Date.parse(`${today}T23:59:59Z`) / 1000;
  if (now - r.created_at < 14 * DAY) return null;
  return !r.reminded_at || today >= shift(dayOf(r.reminded_at), 30) ? 'nudge' : null;
}

/** How long a reservation holds without "I gave it" (user 2026-11-25): RESERVATION_DAYS, or a week past a later giving date. */
export const RESERVATION_DAYS = 60;
/** The last day a reservation holds (YYYY-MM-DD, UTC); the day after, it ends and the record is free again. */
export function reservationEnds(r: { created_at: number; give_on: string | null }) {
  const days = shift(dayOf(r.created_at), RESERVATION_DAYS);
  const date = r.give_on ? shift(r.give_on, 7) : '';
  return date > days ? date : days;
}

/** "When are you giving it?": a real day from today up to a year ahead, or null. */
export function safeGiveOn(value: string | null | undefined, today: string) {
  const day = safeDay(value);
  return day && day >= today && day <= shift(today, 365) ? day : null;
}

// ---- The Telegram message a reserver gets (user 2026-11-25: everything about the record, convenient to use) ----

type Button = { text: string; url: string } | { text: string; callback_data: string };
const CAPTION_MAX = 1024; // Telegram's limit for a photo's caption, counted without the HTML tags

/**
 * The reservation's confirmation, sent as the cover photo with this caption (HTML): the album, artist, year, "most
 * wanted", the owner's note, where to get it, then the tracklist folded (Telegram's expandable quote), cut to fit with
 * "+N more on the website". Buttons: the record's page, the shop's link, the listening links, I gave it / Cancel.
 */
export function reservationCard(r: {
  ownerFirst: string; title: string; artist: string; year: number | null; top: boolean; tracks: Track[];
  note: string | null; where: string[]; giveOn: string | null;
  links: Record<LinkService, string>; pageUrl: string; item: string; ownerId: number;
}) {
  const e = escapeHtml;
  const head = [
    `You reserved this for ${e(r.ownerFirst)}. Nobody else can reserve it now, and ${e(r.ownerFirst)} won’t see who reserved it.`,
    '',
    `<b>${e(r.title)}</b>`,
    `${e(r.artist)}${r.year ? `, ${r.year}` : ''}`,
    ...(r.top ? [`★ One of ${e(r.ownerFirst)}’s most wanted`] : []),
    ...(r.note ? ['', `${e(r.ownerFirst)}’s note: <i>${e(r.note)}</i>`] : []),
    ...(r.where.length ? ['', `Where to get it: ${r.where.map(e).join('; ')}`] : []),
  ].join('\n');
  const tail = `\n\nIt’s held for you for ${RESERVATION_DAYS} days, or until a week after the day you’re giving it (set it on the record’s page). I’ll remind you before then.`;
  const songs = r.tracks.filter((t) => !t.heading);
  const line = (t: Track, i: number) => `${i + 1}. ${e(t.title)}${t.duration ? ` (${t.duration})` : ''}`;
  const visible = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&(lt|gt|amp|quot);/g, '_').length;
  // As many tracks as fit, then how many more.
  let tracks = '';
  for (let n = songs.length; n >= 0; n--) {
    const more = songs.length - n;
    const body = songs.slice(0, n).map(line).join('\n') + (more ? `\n+${more} more on the website` : '');
    tracks = songs.length ? `\n\nTracklist\n<blockquote expandable>${body}</blockquote>` : '';
    if (visible(head + tracks + tail) <= CAPTION_MAX) break;
  }
  const shops = r.where.map(shopLink).filter((x): x is { label: string; url: string } => !!x.url).slice(0, 3);
  const listen = (['spotify', 'apple', 'youtube'] as const).filter((s) => r.links[s])
    .map((s) => ({ text: { spotify: 'Spotify', apple: 'Apple Music', youtube: 'YouTube Music' }[s], url: r.links[s] }));
  const buttons: Button[][] = [
    [{ text: 'Open on the website', url: r.pageUrl }],
    ...shops.map((x) => [{ text: `Buy at ${x.label}`, url: x.url }]),
    ...(listen.length ? [listen] : []),
    [{ text: `I gave it to ${r.ownerFirst}`, callback_data: `gift:${r.ownerId}:${r.item}` }, { text: 'Cancel reservation', callback_data: `unres:${r.ownerId}:${r.item}` }],
  ];
  return { caption: head + tracks + tail, buttons };
}
