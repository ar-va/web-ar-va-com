// Pure logic for the music site (no Cloudflare imports, so `node --test` can run it).

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const sha256 = async (text: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
export const randomToken = () => b64(crypto.getRandomValues(new Uint8Array(24))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!);

function sameString(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface TelegramUser {
  id: number;
  name: string;
  username: string | null;
  photoUrl: string | null;
}

// Fields the Telegram Login Widget signs; anything else in the URL is ignored.
const TELEGRAM_FIELDS = ['auth_date', 'first_name', 'id', 'last_name', 'photo_url', 'username'];

/** Checks a Telegram Login Widget redirect (https://core.telegram.org/widgets/login#checking-authorization). */
export async function verifyTelegramLogin(params: URLSearchParams, botToken: string, nowSeconds = Date.now() / 1000): Promise<TelegramUser | null> {
  const hash = params.get('hash');
  const id = Number(params.get('id'));
  const authDate = Number(params.get('auth_date'));
  if (!hash || !botToken || !Number.isSafeInteger(id) || !(nowSeconds - authDate < 86400)) return null;
  const dataCheck = TELEGRAM_FIELDS.filter((k) => params.has(k)).map((k) => `${k}=${params.get(k)}`).join('\n');
  const key = await crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', enc.encode(botToken)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  if (!sameString(hex(await crypto.subtle.sign('HMAC', key, enc.encode(dataCheck))), hash)) return null;
  const name = [params.get('first_name'), params.get('last_name')].filter(Boolean).join(' ');
  const photo = params.get('photo_url');
  return { id, name: name || params.get('username') || 'Telegram user', username: params.get('username'), photoUrl: photo?.startsWith('https://') ? photo : null };
}

// RFC 3986 encoding, as OAuth 1.0 requires (encodeURIComponent leaves !'()* alone).
const pct = (v: string) => encodeURIComponent(v).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

/**
 * OAuth 1.0a header signed with HMAC-SHA1 for one exact request. The browser sends it to Discogs (the server
 * can't: Cloudflare's shared address is over Discogs' per-address limit), so it must never contain a secret,
 * which rules out the PLAINTEXT method.
 */
export async function oauthHeader(
  method: string, url: string, consumer: { key: string; secret: string }, token?: { key: string; secret: string },
  extra: Record<string, string> = {}, now = Math.floor(Date.now() / 1000), nonce = randomToken(),
) {
  const u = new URL(url);
  const oauth: Record<string, string> = {
    oauth_consumer_key: consumer.key,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(now),
    oauth_version: '1.0',
    ...(token && { oauth_token: token.key }),
    ...extra,
  };
  const params = [...Object.entries(oauth), ...u.searchParams].map(([k, v]) => [pct(k), pct(v)]).sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1));
  const base = [method.toUpperCase(), pct(`${u.protocol}//${u.host}${u.pathname}`), pct(params.map(([k, v]) => `${k}=${v}`).join('&'))].join('&');
  const key = await crypto.subtle.importKey('raw', enc.encode(`${pct(consumer.secret)}&${pct(token?.secret ?? '')}`), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  oauth.oauth_signature = b64(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(base))));
  return 'OAuth ' + Object.entries(oauth).map(([k, v]) => `${pct(k)}="${pct(v)}"`).join(', ');
}

/** Discogs URLs the server will sign for a collector: their own collection, identity, and public release/master data. */
export function signablePath(path: string, discogsUsername: string | null) {
  const u = new URL(path, 'https://api.discogs.com');
  if (u.origin !== 'https://api.discogs.com') return null;
  const user = discogsUsername ? `/users/${encodeURIComponent(discogsUsername)}/` : null;
  const ok = u.pathname === '/oauth/identity'
    || /^\/(releases|masters)\/\d+$/.test(u.pathname)
    || (user !== null && [`${user}collection/fields`, `${user}collection/folders/0/releases`, `${user}wants`].includes(u.pathname));
  return ok ? u.href : null;
}

async function aesKey(secret: string) {
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', enc.encode(secret)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Encrypts a Discogs token for storage, so a database copy alone doesn't give access to anyone's Discogs account. */
export async function seal(text: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), enc.encode(text));
  return `${b64(iv)}.${b64(new Uint8Array(data))}`;
}

export async function unseal(sealed: string, secret: string) {
  const [iv, data] = sealed.split('.');
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(secret), unb64(data)));
}

// ---- Invites ----

/** SQL that holds for an invite link that still works: not revoked, not expired, uses left. `?1` is the current time. */
export const activeLink = (t = '') => `${t}revoked_at IS NULL AND (${t}expires_at IS NULL OR ${t}expires_at > ?1) AND (${t}max_uses IS NULL OR ${t}uses < ${t}max_uses)`;

// ---- Discogs data ----

export interface Field { name: string; value: string }

export interface ShelfRecord {
  instanceId: number;
  releaseId: number;
  masterId: number;
  artist: string;
  title: string;
  year: number | null;
  cover: string | null;
  labels: string;
  format: string;
  genres: string[];
  styles: string[];
  added: string;
  rating: number;
  fields: Field[];
  /** CSS color of the disc when the pressing isn't plain black (from Discogs' free-text format note). */
  vinyl?: string | null;
}

export interface CollectionField { id: number; name: string; position: number; public: boolean }

// Discogs disambiguates artists with " (2)"; nobody wants to read that.
export const cleanName = (name: string) => name.replace(/ \(\d+\)$/, '');

const artistLine = (artists: any[] = []) =>
  artists.map((a, i) => cleanName(a.anv || a.name) + (i < artists.length - 1 ? (a.join && a.join !== ',' ? ` ${a.join} ` : ', ') : '')).join('');

/** One item of GET /users/{u}/collection/folders/0/releases → what the shelf shows. Only fields marked public in Discogs are kept. */
export function toShelfRecord(item: any, fields: CollectionField[]): ShelfRecord {
  const b = item.basic_information;
  const byId = new Map((item.notes ?? []).map((n: any) => [n.field_id, String(n.value ?? '').trim()]));
  return {
    instanceId: item.instance_id,
    releaseId: item.id,
    masterId: b.master_id || 0,
    artist: artistLine(b.artists),
    // Shown on every collector's pages (shelves directory, login, invites): text where text belongs, whatever was sent.
    title: text(b.title, 300),
    year: b.year || null,
    // Collection data arrives through the collector's browser: only Discogs' own https image host is trusted.
    cover: typeof b.cover_image === 'string' && b.cover_image.startsWith('https://i.discogs.com/') ? b.cover_image : null,
    labels: [...new Set((b.labels ?? []).map((l: any) => cleanName(l.name)))].join(', '),
    format: (b.formats ?? []).map((f: any) => [f.qty > 1 ? `${f.qty}×${f.name}` : f.name, ...(f.descriptions ?? []), ...(f.text ? [f.text] : [])].join(', ')).join(' + '),
    vinyl: vinylColor((b.formats ?? []).map((f: any) => f.text ?? '').join(', ')),
    genres: words(b.genres),
    styles: words(b.styles),
    added: text(item.date_added, 40), // other collectors' Discogs records may come without one
    rating: item.rating || 0,
    fields: fields
      .filter((f) => f.public && byId.get(f.id))
      .sort((a, b) => a.position - b.position)
      .map((f) => ({ name: f.name, value: byId.get(f.id) as string })),
  };
}

export interface ReleaseDetail {
  released: string | null;
  originalYear: number | null;
  /** Release date of the master's main release ("2016-01-08"); missing on details cached before 2026-10-28. */
  firstReleased?: string | null;
  /** Discogs photos of this release (primary first), for the record page's gallery. */
  images?: string[];
  country: string | null;
  tracklist: { position: string; title: string; duration: string; heading: boolean }[];
  uri: string;
}

// Text from an upload, whatever was sent: the browser brings these details, and they're shown to every collector who
// owns the release, so a number or an object where text belongs must not break their pages.
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' ? String(v) : '');
const year = (v: unknown) => (Number.isSafeInteger(v) && (v as number) > 0 ? (v as number) : null);
const words = (v: unknown) => (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 100)).slice(0, 50);

/** GET /releases/{id} (+ the master's year) → what the record page shows. */
export function toReleaseDetail(release: any, masterYear: number | null, firstReleased: string | null = null): ReleaseDetail {
  return {
    released: text(release.released, 20) || null,
    originalYear: year(masterYear) ?? year(release.year),
    firstReleased: typeof firstReleased === 'string' && /^\d{4}(-\d{2}){0,2}$/.test(firstReleased) ? firstReleased : null,
    country: text(release.country, 100) || null,
    tracklist: (Array.isArray(release.tracklist) ? release.tracklist : []).slice(0, 300)
      .map((t: any) => ({ position: text(t?.position, 20), title: text(t?.title, 300), duration: text(t?.duration, 20), heading: t?.type_ === 'heading' })),
    uri: typeof release.uri === 'string' && release.uri.startsWith('https://www.discogs.com/') ? release.uri : `https://www.discogs.com/release/${Number(release.id)}`,
    images: (Array.isArray(release.images) ? release.images : []).map((i: any) => i?.uri).filter((u: unknown): u is string => typeof u === 'string' && u.startsWith('https://i.discogs.com/')).slice(0, 12),
  };
}

/** Discogs dates come as "2026", "2026-07" or "2026-07-24" (sometimes with -00 parts). Shown with three-letter months,
 *  "Oct 22, 2012" (user, 2026-11-21; was "October"), like every date on the sites. */
export function formatReleased(value: string | null) {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!m) return String(y);
  const opts: Intl.DateTimeFormatOptions = d ? { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' } : { year: 'numeric', month: 'short', timeZone: 'UTC' };
  return new Date(Date.UTC(y, m - 1, d || 1)).toLocaleDateString('en-US', opts);
}

/**
 * Telegram's own login window, for pages off the bot's domain (music.ar-va.com: Telegram's button there says "Bot
 * domain invalid", checked 2026-10-31). It runs as ar-va.com and comes back to ar-va.com/auth/done, which logs the
 * person in for both sites; `next` is where to go after (the page that opened it, which notices the login itself).
 */
export const telegramAuthUrl = (botId: string, siteOrigin: string, next: string) =>
  `https://oauth.telegram.org/auth?bot_id=${encodeURIComponent(botId)}&origin=${encodeURIComponent(siteOrigin)}&request_access=write` +
  `&return_to=${encodeURIComponent(`${siteOrigin}/auth/done?next=${encodeURIComponent(next)}`)}`;

/** The site both hosts share: "ar-va.com" for music.ar-va.com and ar-va.com (locally "localhost"). */
export const siteDomain = (hostname: string) => hostname.replace(/^music\./, '');

/** Post-login destination: a path on this host, or a page on the site or one of its subdomains. */
export function safeReturnPath(target: string | null | undefined, hostname: string) {
  if (!target) return '/';
  // No whitespace: browsers delete tabs and line breaks from addresses, so "/\t/evil.com" would turn into "//evil.com".
  if (/^\/(?![/\\])[^\s]*$/.test(target)) return target;
  try {
    const u = new URL(target);
    const site = siteDomain(hostname);
    if (/^https?:$/.test(u.protocol) && (u.hostname === site || u.hostname.endsWith(`.${site}`))) return u.href;
  } catch {}
  return '/';
}

/** The login page lives on the main site (ar-va.com/login); `back` is where to return, by default the current page. */
export const loginHref = (url: URL, back = url.origin + url.pathname + url.search) =>
  `${url.protocol}//${siteDomain(url.host)}/login?return=${encodeURIComponent(back)}`;

// ---- Vinyl colour ----

const COLORS: [RegExp, string][] = [
  [/\b(forest|bottle|dark) green\b/, '#1f5f3a'], [/\bgreen\b/, '#2f9e5b'], [/\b(sky|light) blue\b/, '#6bb3e8'], [/\bnavy\b/, '#1e2f6b'], [/\bblue\b/, '#2f5fd0'],
  [/\bred\b|\bcrimson\b|\bburgundy\b/, '#c62f34'], [/\bpink\b|\brose\b/, '#ec74a8'], [/\bpurple\b|\bviolet\b|\bmagenta\b/, '#7f4bc4'],
  [/\borange\b/, '#ec7a2c'], [/\byellow\b|\bmustard\b/, '#efc531'], [/\bgold\b/, '#c9a43c'], [/\bsilver\b|\bgr[ae]y\b/, '#a3a3ad'],
  [/\bbrown\b|\bcoffee\b/, '#7a4e2d'], [/\bwhite\b|\bbone\b|\bcream\b|\bmilky\b/, '#ece9e2'],
];

/**
 * The disc colour from Discogs' format note ("Red [Opaque Apple], 10th Anniversary Edition", "Pink Translucent").
 * Parts about labels, sleeves or covers are skipped ("Blue Sunset Labels" is the label, not the vinyl).
 * Null means plain black. Clear/translucent pressings come back semi-transparent.
 */
export function vinylColor(text: string): string | null {
  for (const part of text.toLowerCase().split(',')) {
    if (/label|sleeve|cover|jacket|insert|print|obi|sticker|booklet/.test(part)) continue;
    const clear = /\b(clear|transparent|translucent|crystal)\b/.test(part);
    const hit = COLORS.find(([re]) => re.test(part));
    if (hit) return clear ? `${hit[1]}a6` : hit[1];
    if (clear) return CLEAR_VINYL;
  }
  return null;
}

/** The edit page's disc colours (the ones Discogs notes map to); black is the CSS default disc. */
export const CLEAR_VINYL = '#d8dde673';
export const VINYL_SWATCHES: [string, string][] = [
  ['Black', '#131316'], ['White', '#ece9e2'], ['Silver', '#a3a3ad'], ['Red', '#c62f34'], ['Pink', '#ec74a8'],
  ['Purple', '#7f4bc4'], ['Navy', '#1e2f6b'], ['Blue', '#2f5fd0'], ['Sky blue', '#6bb3e8'], ['Forest green', '#1f5f3a'],
  ['Green', '#2f9e5b'], ['Yellow', '#efc531'], ['Gold', '#c9a43c'], ['Orange', '#ec7a2c'], ['Brown', '#7a4e2d'], ['Clear', CLEAR_VINYL],
];
/** A disc colour in words: "Red", "Red, see-through", "a custom colour". */
export function vinylName(hex: string) {
  const name = VINYL_SWATCHES.find(([, h]) => h === (hex === CLEAR_VINYL ? hex : hex.slice(0, 7)))?.[0] ?? 'a custom colour';
  return hex.length === 9 && hex !== CLEAR_VINYL ? `${name}, see-through` : name;
}
/** A disc colour safe for a `style` attribute: #rrggbb, or #rrggbbaa for a see-through pressing. */
export const safeVinyl = (value: string | null | undefined) => (value && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value) ? value.toLowerCase() : null);
/** The edit form's pick: a swatch or the custom colour, made see-through when ticked (Clear already is). */
export function vinylPick(swatch: string, custom: string, seeThrough: boolean) {
  const base = safeVinyl(swatch === 'custom' ? custom : swatch);
  if (!base) return '';
  return seeThrough && base.length === 7 ? `${base}a6` : base;
}

// ---- Owner edits (overrides of the Discogs data) ----

export type Overrides = Record<string, string>;
export type Service = 'spotify' | 'apple' | 'youtube';
export interface Track { position: string; title: string; duration: string; heading: boolean; links?: Partial<Record<Service, string>> }

/** One track per line, "A1 | Title | 4:52 | <links>"; a line starting with "## " is a heading (e.g. "## Side B"). */
export const tracklistToText = (tracks: Track[]) =>
  tracks.map((t) => (t.heading
    ? `## ${t.title}`
    : [t.position, t.title, t.duration, Object.values(t.links ?? {}).join(' ')].filter((x, i) => x || i === 1).join(' | '))).join('\n');

export function textToTracklist(text: string): Track[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    if (l.startsWith('## ')) return { position: '', title: l.slice(3).trim(), duration: '', heading: true };
    const parts = l.split('|').map((p) => p.trim());
    // Trailing parts that are links: each kept only if it's a page on one of the services.
    const links: Track['links'] = {};
    while (parts.length > 1 && /^https?:\/\//.test(parts.at(-1)!)) {
      for (const url of parts.pop()!.split(/\s+/)) {
        for (const s of ['spotify', 'apple', 'youtube'] as const) {
          const ok = safeStreamingUrl(url, s);
          if (ok) links[s] = ok;
        }
      }
    }
    const extra = Object.keys(links).length ? { links } : {};
    if (parts.length === 1) return { position: '', title: parts[0], duration: '', heading: false, ...extra };
    if (parts.length === 2) return /^\d{1,2}:\d{2}(:\d{2})?$/.test(parts[1])
      ? { position: '', title: parts[0], duration: parts[1], heading: false, ...extra }
      : { position: parts[0], title: parts[1], duration: '', heading: false, ...extra };
    return { position: parts[0], title: parts.slice(1, -1).join(' | '), duration: parts.at(-1)!, heading: false, ...extra };
  });
}

/** Total running time ("42 min", "1 h 12 min") when every track has a length like 4:52 or 1:02:10; else null. */
export function runtime(tracks: Track[]): string | null {
  const songs = tracks.filter((t) => !t.heading);
  if (!songs.length) return null;
  let seconds = 0;
  for (const t of songs) {
    const parts = t.duration.trim().split(':');
    if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
    seconds += parts.reduce((sum, p) => sum * 60 + Number(p), 0);
  }
  const minutes = Math.round(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

/**
 * Drag-and-drop renumbering for the edit page: positions like A1, B2 are numbered again in their new order within
 * each side letter; plain numbers 1, 2, 3 run straight through. Other positions (CD1-3, empty) stay as typed.
 */
export function renumber(positions: string[]): string[] {
  const counts = new Map<string, number>();
  const plain = positions.filter((p) => /^\d+$/.test(p)).length;
  let n = 0;
  return positions.map((p) => {
    const side = p.match(/^([A-Za-z]{1,2})\d+$/);
    if (side) {
      const k = (counts.get(side[1]) ?? 0) + 1;
      counts.set(side[1], k);
      return `${side[1]}${k}`;
    }
    return /^\d+$/.test(p) && plain ? String(++n) : p;
  });
}

/**
 * Vinyl positions (A1, A2, B1…) → a heading per side: "Side A", or "Disc 1, Side A" when there are more than two
 * sides; the position shows just the track number. Tracklists with their own headings, or positions that
 * aren't letter + number (CDs, "1", "2"), are left as they are.
 */
export function withSideHeadings(tracks: Track[]): Track[] {
  const songs = tracks.filter((t) => !t.heading);
  if (tracks.some((t) => t.heading) || !songs.every((t) => /^[A-Z]\d*[a-z]?$/i.test(t.position))) return tracks;
  const sides = new Set(songs.map((t) => t.position[0].toUpperCase()));
  if (sides.size < 2) return tracks;
  const discs = [...sides].some((s) => s > 'B');
  const out: Track[] = [];
  let current = '';
  for (const t of tracks) {
    const side = t.position[0].toUpperCase();
    if (side !== current) {
      current = side;
      const i = side.charCodeAt(0) - 65;
      out.push({ position: '', title: discs ? `Disc ${Math.floor(i / 2) + 1}, Side ${side}` : `Side ${side}`, duration: '', heading: true });
    }
    out.push({ ...t, position: t.position.slice(1) });
  }
  return out;
}

// ---- Shelf addresses (music.ar-va.com/<name>): safety rules (2026-10-31) ----

// The site's own pages and words it may use some day: never a shelf address.
const RESERVED = new Set(('settings login logout auth invite invites api music edit admin about blog records record shelf shelves new '
  + 'export brand favicon static assets help support contact terms privacy legal search explore discover home index www mail email '
  + 'root system null undefined me you user users account accounts profile join signup register request requests feed rss sitemap '
  + 'robots status health test demo').split(' '));
// Authority and brand words: only the admin may use them, so nobody looks official or like a service's own shelf.
// Short ones count only as a whole word between dashes ("team-x" no, "steamboat" yes).
const AUTHORITY = ['admin', 'administrator', 'moderator', 'official', 'support', 'telegram', 'discogs', 'spotify', 'youtube'];
const AUTHORITY_WORDS = ['mod', 'mods', 'staff', 'team', 'arva', 'apple', 'owner', 'verified'];
// Slurs, hate and explicit words, checked with digits read as letters (n1gg3r) and dashes removed. Short or
// ambiguous ones only as whole words, so ordinary names that contain them pass (raccoon, cocktail, grapefruit, torpedo).
const BLOCKED = ['nigger', 'nigga', 'faggot', 'retard', 'tranny', 'wetback', 'kike', 'chink', 'beaner', 'nazi', 'hitler', 'siegheil',
  'kkk', 'whitepower', 'fuck', 'shit', 'cunt', 'whore', 'slut', 'bitch', 'rapist', 'porn', 'pussy', 'paedo', 'molest', 'incest'];
const BLOCKED_WORDS = ['fag', 'fags', 'dyke', 'spic', 'gook', 'coon', 'paki', 'dick', 'cock', 'cum', 'sex', 'xxx', 'anal', 'nude', 'nudes',
  'rape', 'pedo', 'pedos', '1488'];
const unleet = (s: string) => s.replace(/[0134578@$]/g, (c) => ({ '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', $: 's' })[c]!);

/**
 * A shelf address someone typed: the cleaned name, or why it can't be used. 3–30 of a–z, 0–9 and single dashes,
 * starting and ending with a letter or digit, at least one letter; not a reserved word; for everyone but the admin,
 * no authority or brand word; for everyone, nothing offensive. (Look-alikes of other shelves: setShelfName.)
 */
export function checkShelfName(value: string, admin = false): { name: string } | { error: string } {
  const v = value.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(v) || v.includes('--')) {
    return { error: 'Use 3–30 letters, numbers and single dashes, starting and ending with a letter or number.' };
  }
  if (!/[a-z]/.test(v)) return { error: 'Use at least one letter (numbers alone look like record links).' };
  if (RESERVED.has(v)) return { error: `“${v}” is one of the site’s own addresses. Please pick another.` };
  const words = v.split('-');
  const joined = unleet(v.replace(/-/g, ''));
  const loose = words.map(unleet);
  if (BLOCKED.some((w) => joined.includes(w)) || BLOCKED_WORDS.some((w) => words.includes(w) || loose.includes(w))) {
    return { error: 'That address isn’t allowed here. Please pick another.' };
  }
  if (!admin && (AUTHORITY.some((w) => joined.includes(w)) || AUTHORITY_WORDS.some((w) => words.includes(w) || loose.includes(w)))) {
    return { error: 'Words like “admin”, “official”, “support” or a service’s name can’t be used, so nobody is mistaken for the site or a service.' };
  }
  return { name: v };
}

/** How an address is compared with others for look-alikes: no dashes, underscores or dots ("a-r-a-b-o-r" = "arabor"). */
export const nameKey = (s: string) => s.toLowerCase().replace(/[-_.]/g, '');

/** Only Spotify / Apple Music / YouTube (Music) pages are accepted as album links. */
export function safeStreamingUrl(value: string, service: 'spotify' | 'apple' | 'youtube') {
  try {
    const u = new URL(value.trim());
    const hosts = { spotify: ['open.spotify.com'], apple: ['music.apple.com'], youtube: ['music.youtube.com', 'www.youtube.com', 'youtube.com', 'youtu.be'] }[service];
    return u.protocol === 'https:' && hosts.includes(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

/** Search pages on each service, used when the owner hasn't pasted an exact album link. */
export const streamingSearch = (query: string, kind: 'album' | 'track' = 'album') => ({
  spotify: `https://open.spotify.com/search/${encodeURIComponent(query)}/${kind === 'album' ? 'albums' : 'tracks'}`,
  apple: `https://music.apple.com/search?term=${encodeURIComponent(query)}`,
  youtube: `https://music.youtube.com/search?q=${encodeURIComponent(query)}`,
});

/** Every editable value as Discogs gives it (the owner's edits override these, key by key). */
export function recordDefaults(r: ShelfRecord, d: ReleaseDetail | null, m: Match | null = null): Overrides {
  return {
    artist: r.artist,
    title: r.title,
    released: d?.firstReleased ?? (d?.originalYear ? String(d.originalYear) : ''),
    vinylRelease: d?.released ?? (r.year ? String(r.year) : ''),
    genre: r.genres.join(', '),
    style: (r.styles ?? []).join(', '),
    label: r.labels,
    format: r.format,
    country: d?.country ?? '',
    tracklist: tracklistToText(withMatchLinks(d?.tracklist ?? [], m)),
    spotify: m?.spotify?.url ?? '',
    apple: m?.apple?.url ?? '',
    youtube: m?.youtube?.url ?? '',
    // Track titles the owner marked as favourites, one per line (matched by title, so reordering keeps them).
    favorites: '',
    cover: r.cover ?? '',
    added: r.added.slice(0, 10),
    // The owner's note about this record, shown under the album (at most NOTE_MAX characters).
    note: '',
    vinyl: r.vinyl ?? VINYL_SWATCHES[0][1],
    ...Object.fromEntries(r.fields.map((f) => [`field:${f.name}`, f.value])),
  };
}

/** What visitors see: the owner's edit where there is one, else Discogs. Edits of keys Discogs no longer has are dropped. */
export const recordValues = (defaults: Overrides, overrides: Overrides): Overrides =>
  ({ ...defaults, ...Object.fromEntries(Object.entries(overrides).filter(([k]) => k in defaults)) });

/** A date shown as Discogs writes it ("2016-01-08" → "January 8, 2016"), anything else as typed. */
export const displayDate = (value: string) => (/^\d{4}(-\d{2}){0,2}$/.test(value) ? formatReleased(value) : value) || null;

/** The shelf's view of a record: edited artist/title/genres and the first release year for the "Released" filter. */
export function shelfView(r: ShelfRecord, d: ReleaseDetail | null, overrides: Overrides, m: Match | null = null) {
  const v = recordValues(recordDefaults(r, d, m), overrides);
  return {
    ...r,
    cover: safeCoverUrl(v.cover) ?? r.cover,
    // The owner's own "Added on" date wins over Discogs' (sorting, the Added filter, "Added to the shelf").
    added: safeDay(v.added) ?? r.added,
    vinyl: safeVinyl(v.vinyl) ?? r.vinyl,
    artist: v.artist,
    title: v.title,
    // Discogs genres can contain commas ("Folk, World, & Country"): only an owner-typed genre is split on them.
    genres: 'genre' in overrides ? v.genre.split(',').map((g) => g.trim()).filter(Boolean) : r.genres,
    releasedYear: Number(v.released.match(/\b(1[89]|20)\d{2}\b/)?.[0]) || null,
    released: v.released,
    trackCount: textToTracklist(v.tracklist).filter((t) => !t.heading).length,
    runtime: runtime(textToTracklist(v.tracklist)),
    links: { spotify: v.spotify, apple: v.apple, youtube: v.youtube },
  };
}

/** How long until `at` (seconds), rounded up: "7 days", "5 hours", "25 minutes". For invite links. */
export function timeLeft(at: number, nowSec = Date.now() / 1000) {
  const s = Math.max(0, at - nowSec);
  const [n, unit] = s >= 86400 ? [Math.ceil(s / 86400), 'day'] : s >= 3600 ? [Math.ceil(s / 3600), 'hour'] : [Math.max(1, Math.ceil(s / 60)), 'minute'];
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

/** The owner's notes, on a shelf and on each record: at most this many characters, no more than one empty line in a row. */
export const NOTE_MAX = 280;
export const cleanNote = (text: string) => text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, NOTE_MAX) || null;

/**
 * When a record's "Added on" date is missing, for the owner to fill in on the album page: Discogs gave none, or its day
 * is shared by this many of the shelf's records (a bulk-entry day: when they went into Discogs, not when they were
 * bought). Settled once the owner picks a day or confirms Discogs' (`addedChecked`).
 */
export const BULK_DAY = 5;
export const addedNeedsDate = (discogsAdded: string, overrides: Overrides, sameDay: number) =>
  !overrides.added && !overrides.addedChecked && (!discogsAdded || sameDay >= BULK_DAY);

/** A date the owner typed for "Added on": a real YYYY-MM-DD day, or null. */
export const safeDay = (value: string | null | undefined) =>
  value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value) ? value : null;

/** CSV for spreadsheets: quoted where needed, a BOM so Excel reads UTF-8, and cells that would start a formula
 *  (=, +, -, @) made plain text with a leading apostrophe. */
export function toCsv(rows: string[][]) {
  const cell = (v: string) => {
    const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

// ---- Comments: links and Telegram notifications ----

/** Splits comment text into plain text and http(s) links, so links can be rendered clickable (text stays escaped). */
export function linkify(text: string): ({ text: string } | { url: string })[] {
  const parts: ({ text: string } | { url: string })[] = [];
  let last = 0;
  for (const m of text.matchAll(/https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g)) {
    if (m.index! > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ url: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

export const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Telegram messages for a new comment: the person replied to hears "replied to your comment", the owner of the
 * place (shelf owner, or the admin for the blog) hears "commented on". Nobody hears about their own comment.
 */
export function commentNotices(c: { authorId: number; authorName: string; ownerId: number | null; parentAuthorId: number | null; title: string; body: string; url: string }) {
  const excerpt = c.body.length > 300 ? `${c.body.slice(0, 300)}…` : c.body;
  const text = (verb: string) => `<b>${escapeHtml(c.authorName)}</b> ${verb} <b>${escapeHtml(c.title)}</b>:\n\n${escapeHtml(excerpt)}\n\n<a href="${escapeHtml(c.url)}">Open the comment</a>`;
  const out: { chatId: number; text: string }[] = [];
  if (c.parentAuthorId && c.parentAuthorId !== c.authorId) out.push({ chatId: c.parentAuthorId, text: text('replied to your comment on') });
  if (c.ownerId && c.ownerId !== c.authorId && c.ownerId !== c.parentAuthorId) out.push({ chatId: c.ownerId, text: text(c.parentAuthorId ? 'replied to a comment on' : 'commented on') });
  return out;
}

// ---- Automatic matches on streaming services, and covers ----

/** A release found on the services: album link (+ Apple's artwork) and a link per track title. */
export interface Match {
  apple?: { url: string; artwork: string | null; tracks: { title: string; url: string }[] };
  spotify?: { url: string; tracks: { title: string; url: string }[] };
  /** Tracks from the artist's YouTube "Topic" channel with their plays, and the album's page from YouTube Music's own
   *  search (url; null = not found there, missing = not looked yet).
   *  null = looked, nothing found; missing = not looked yet (filled in later, see backfillYoutube). */
  youtube?: { url?: string | null; tracks: { title: string; url: string; views: number }[] } | null;
}

/** For comparing names across catalogues: no accents, case, punctuation or "(Deluxe…)"-style suffixes. */
export const normalizeName = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/[‘’'`]/g, '').replace(/\s*[([](deluxe|remaster|expanded|anniversary|edition|bonus|explicit|clean)[^)\]]*[)\]]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  // "Alfredo II" on Discogs is "Alfredo 2" on Apple Music.
  .replace(/(?<=\s|^)(ii|iii|iv|vi|vii|viii|ix)(?=\s|$)/g, (n) => String(['ii', 'iii', 'iv', '', 'vi', 'vii', 'viii', 'ix'].indexOf(n) + 2));

// Artists compared without the words joining them: "Denzel Curry X Kenny Beats" on Discogs is "Denzel Curry & Kenny
// Beats" on Apple Music ("&" already drops out as punctuation).
export const artistKey = (s: string) => normalizeName(s).replace(/(?<=\s|^)(x|and|feat|ft|with)(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();

/** The first of several credited artists: "Louis Armstrong And Eddie Condon" → "Louis Armstrong". */
export const firstArtist = (s: string) => s.split(/\s+(?:x|&|and|feat\.?|ft\.?|with|vs\.?)\s+|\s*[,•/]\s*/i)[0].trim();

/**
 * The catalogue album that is this record: the artist must match, then an exact title beats a longer
 * edition ("… (Deluxe)"), which beats a shorter one; null when nothing fits well enough to link to.
 */
export function pickAlbum<T extends { title: string; artist: string }>(candidates: T[], artist: string, title: string): T | null {
  const a = artistKey(artist), t = normalizeName(title);
  const score = (c: T) => {
    const ca = artistKey(c.artist), ct = normalizeName(c.title);
    if (!(ca === a || ca.includes(a) || a.includes(ca))) return 0;
    return ct === t ? 3 : ct.startsWith(t) ? 2 : t.startsWith(ct) && ct.length > 3 ? 1 : 0;
  };
  let best: T | null = null, top = 0;
  for (const c of candidates) {
    const s = score(c);
    if (s > top || (s === top && s > 0 && best && c.title.length < best.title.length)) { best = c; top = s; }
  }
  return best;
}

/** A track's identity for marks (popular, favourite): its normalized title, or the title itself for "★"-like ones. */
export const titleKey = (title: string) => normalizeName(title) || title.trim();

/**
 * The entry in a service's track list with this title: the same name, else one that starts like it. Titles of
 * symbols only ("★") normalize to nothing: those match only exactly, or they would start every title.
 */
function byTitle<T extends { title: string }>(list: T[] | undefined, title: string) {
  const n = normalizeName(title);
  if (!n) return list?.find((x) => x.title.trim() === title.trim());
  return list?.find((x) => normalizeName(x.title) === n) ?? list?.find((x) => { const xn = normalizeName(x.title); return !!xn && (xn.startsWith(n) || n.startsWith(xn)); });
}

/** Discogs tracks with the matched services' links added by title (a link the owner typed is kept). */
export function withMatchLinks(tracks: Track[], m: Match | null): Track[] {
  if (!m) return tracks;
  return tracks.map((t) => {
    if (t.heading) return t;
    const found = { apple: byTitle(m.apple?.tracks, t.title)?.url, spotify: byTitle(m.spotify?.tracks, t.title)?.url, youtube: byTitle(m.youtube?.tracks, t.title)?.url };
    const links = { ...Object.fromEntries(Object.entries(found).filter(([, v]) => v)), ...t.links };
    return Object.keys(links).length ? { ...t, links } : t;
  });
}

/**
 * The album's most played tracks on YouTube (normalized titles), with their plays: at most 3, and only tracks
 * clearly ahead of the rest (at least twice the plays of the album's middle track), so an evenly played album gets none.
 */
export function popularTracks(tracks: Track[], m: Match | null) {
  const songs = tracks.filter((t) => !t.heading)
    .map((t) => ({ key: titleKey(t.title), views: byTitle(m?.youtube?.tracks, t.title)?.views ?? null }))
    .filter((s): s is { key: string; views: number } => s.views !== null);
  if (songs.length < 3) return new Map<string, number>();
  const middle = songs.map((s) => s.views).sort((a, b) => a - b)[Math.floor(songs.length / 2)];
  return new Map(songs.filter((s) => s.views > 0 && s.views >= 2 * middle).sort((a, b) => b.views - a.views).slice(0, 3).map((s) => [s.key, s.views]));
}

/** YouTube Music's "72M plays", "1.2K plays", "950 plays" → a number (0 when there's none). */
export const playCount = (text: string) => {
  const m = text.match(/([\d.,]+)\s*([KMB]?)\s*plays?\b/i);
  return m ? Math.round(parseFloat(m[1].replace(/,/g, '')) * ({ '': 1, K: 1e3, M: 1e6, B: 1e9 } as Record<string, number>)[m[2].toUpperCase()]) : 0;
};

/** Each record's own wear (user, 2026-11-21: smudges varied per record, some more, some less, in different places):
 *  CSS custom properties for the disc (global.css), picked from the record's id so it never changes. About a quarter
 *  are clean, the rest have light or a little more smudging, cropped from a different part of the pattern; some carry
 *  a fingerprint somewhere on the grooves. */
export function vinylWear(id: number): string {
  let x = (id * 2654435761) >>> 0 || 1;
  const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 2 ** 32; };
  const pick = rnd();
  const smudges = pick < 0.25 ? 'none' : pick < 0.7 ? 'var(--smudges-light)' : 'var(--smudges-more)';
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const out = [`--smudges: ${smudges}`, `--sx: ${pct(rnd())}`, `--sy: ${pct(rnd())}`, `--sheen: ${Math.round(rnd() * 360)}deg`];
  if (rnd() < 0.55) {
    // somewhere on the grooves: 30–60 % of the way out from the centre, any angle
    const a = rnd() * 2 * Math.PI, r = 0.15 + rnd() * 0.15;
    out.push(`--fp-at: ${pct(0.5 + r * Math.cos(a))} ${pct(0.5 + r * Math.sin(a))}`, `--fp-a: ${(0.02 + rnd() * 0.02).toFixed(3)}`);
  }
  return out.join('; ');
}

/** The video id in a YouTube or YouTube Music track link (watch?v=…, youtu.be/…), or null. */
export const youtubeId = (url: string | undefined) =>
  url?.match(/^https:\/\/(?:(?:www|music|m)\.youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/)([\w-]{11})(?![\w-])/)?.[1] ?? null;

/** "4.5M", "820K", "950": plays, short. */
export const shortCount = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

/** Cover images come only from Discogs or Apple's artwork servers. */
export function safeCoverUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const u = new URL(value);
    // Discogs, Apple Music; Spotify and YouTube Music covers come with wishlist albums added from their links.
    const hosts = ['i.discogs.com', 'i.scdn.co', 'lh3.googleusercontent.com', 'i.ytimg.com'];
    return u.protocol === 'https:' && (hosts.includes(u.hostname) || /^is\d+-ssl\.mzstatic\.com$/.test(u.hostname)) ? u.href : null;
  } catch {
    return null;
  }
}

/** The record page's gallery: the main cover first (the owner's pick, else Discogs'), then Discogs' photos. */
export function gallery(main: string | null, discogsCover: string | null, images: string[] = []) {
  const rest = main && main !== discogsCover ? images : images.slice(1);
  return [...new Set([main, ...rest].filter((u): u is string => !!u))];
}
