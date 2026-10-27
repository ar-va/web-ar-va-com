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
  const own = discogsUsername ? `/users/${encodeURIComponent(discogsUsername)}/collection/` : null;
  const ok = u.pathname === '/oauth/identity'
    || /^\/(releases|masters)\/\d+$/.test(u.pathname)
    || (own !== null && (u.pathname === `${own}fields` || u.pathname === `${own}folders/0/releases`));
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
    title: b.title,
    year: b.year || null,
    // Collection data arrives through the collector's browser: only Discogs' own https image host is trusted.
    cover: typeof b.cover_image === 'string' && b.cover_image.startsWith('https://i.discogs.com/') ? b.cover_image : null,
    labels: [...new Set((b.labels ?? []).map((l: any) => cleanName(l.name)))].join(', '),
    format: (b.formats ?? []).map((f: any) => [f.qty > 1 ? `${f.qty}×${f.name}` : f.name, ...(f.descriptions ?? [])].join(', ')).join(' + '),
    genres: b.genres ?? [],
    styles: b.styles ?? [],
    added: item.date_added,
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
  country: string | null;
  tracklist: { position: string; title: string; duration: string; heading: boolean }[];
  uri: string;
}

/** GET /releases/{id} (+ the master's year) → what the record page shows. */
export function toReleaseDetail(release: any, masterYear: number | null): ReleaseDetail {
  return {
    released: release.released || null,
    originalYear: masterYear || release.year || null,
    country: release.country || null,
    tracklist: (release.tracklist ?? []).map((t: any) => ({ position: t.position, title: t.title, duration: t.duration, heading: t.type_ === 'heading' })),
    uri: typeof release.uri === 'string' && release.uri.startsWith('https://www.discogs.com/') ? release.uri : `https://www.discogs.com/release/${Number(release.id)}`,
  };
}

/** Discogs dates come as "2026", "2026-07" or "2026-07-24" (sometimes with -00 parts). */
export function formatReleased(value: string | null) {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!m) return String(y);
  const opts: Intl.DateTimeFormatOptions = d ? { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' } : { year: 'numeric', month: 'long', timeZone: 'UTC' };
  return new Date(Date.UTC(y, m - 1, d || 1)).toLocaleDateString('en-US', opts);
}

/** The site both hosts share: "ar-va.com" for music.ar-va.com and ar-va.com (locally "localhost"). */
export const siteDomain = (hostname: string) => hostname.replace(/^music\./, '');

/** Post-login destination: a path on this host, or a page on the site or one of its subdomains. */
export function safeReturnPath(target: string | null | undefined, hostname: string) {
  if (!target) return '/';
  if (/^\/(?![/\\])/.test(target)) return target;
  try {
    const u = new URL(target);
    const site = siteDomain(hostname);
    if (/^https?:$/.test(u.protocol) && (u.hostname === site || u.hostname.endsWith(`.${site}`))) return u.href;
  } catch {}
  return '/';
}

/** Path as the visitor sees it on music.ar-va.com (the Worker serves it from /music/…). */
export const musicPath = (url: URL) => url.pathname.replace(/^\/music(?=\/|$)/, '') || '/';
/** The login page lives on the main site (ar-va.com/login); `back` is where to return, by default the current page. */
export const loginHref = (url: URL, back = url.origin + musicPath(url) + url.search) =>
  `${url.protocol}//${siteDomain(url.host)}/login?return=${encodeURIComponent(back)}`;
