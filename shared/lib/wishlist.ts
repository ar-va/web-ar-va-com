// The wishlist's rules, no Cloudflare imports (tested by shared/tests/wishlist.test.js): album links from the streaming
// services, what a wish may hold, which wishes the owner already has, who sees a reservation, when to remind.
import { artistKey, cleanNote, normalizeName, safeCoverUrl, safeDay, safeStreamingUrl, textToTracklist, tracklistToText } from './lib.ts';

export const WISHES_MAX = 200;
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

export interface Wish {
  artist: string;
  title: string;
  year: number | null;
  cover: string | null;
  /** The edit page's text format, "A1 | Title | 4:52 | <links>". */
  tracklist: string;
  links: Record<LinkService, string>;
  note: string | null;
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
  };
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
 * What one viewer sees of a reservation. The owner never sees one (gifts stay a surprise), and neither does anyone
 * logged out: otherwise the owner would see "Reserved" just by visiting logged out.
 */
export type ReserveState = 'none' | 'login' | 'free' | 'mine' | 'taken';
export function reserveState(reservedBy: number | null, viewerId: number | null, ownerId: number): ReserveState {
  if (viewerId === ownerId) return 'none';
  if (viewerId === null) return 'login';
  if (reservedBy === null) return 'free';
  return reservedBy === viewerId ? 'mine' : 'taken';
}

const DAY = 86400;
const dayOf = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);
const shift = (day: string, days: number) => dayOf(Date.parse(`${day}T00:00:00Z`) / 1000 + days * DAY);

/**
 * Which reminder is due today (a UTC day): 3 days before the giving date and the day after it; without a date, two
 * weeks after reserving, then every 30 days. Never two on one day.
 */
export function reminderDue(r: { created_at: number; give_on: string | null; reminded_at: number | null }, today: string): 'before' | 'after' | 'nudge' | null {
  if (r.reminded_at && dayOf(r.reminded_at) === today) return null;
  if (r.give_on) return today === shift(r.give_on, -3) ? 'before' : today === shift(r.give_on, 1) ? 'after' : null;
  const now = Date.parse(`${today}T23:59:59Z`) / 1000;
  if (now - r.created_at < 14 * DAY) return null;
  return !r.reminded_at || today >= shift(dayOf(r.reminded_at), 30) ? 'nudge' : null;
}

/** "When are you giving it?": a real day from today up to a year ahead, or null. */
export function safeGiveOn(value: string | null | undefined, today: string) {
  const day = safeDay(value);
  return day && day >= today && day <= shift(today, 365) ? day : null;
}
