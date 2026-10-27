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

/** OAuth 1.0a header with the PLAINTEXT signature Discogs accepts over HTTPS. */
export function oauthHeader(consumerKey: string, consumerSecret: string, token?: { key: string; secret: string }, extra: Record<string, string> = {}) {
  const params: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: randomToken(),
    oauth_signature_method: 'PLAINTEXT',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: '1.0',
    ...(token && { oauth_token: token.key }),
    ...extra,
    oauth_signature: `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(token?.secret ?? '')}`,
  };
  return 'OAuth ' + Object.entries(params).map(([k, v]) => `${k}="${encodeURIComponent(v)}"`).join(', ');
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
    cover: b.cover_image && !b.cover_image.includes('spacer.gif') ? b.cover_image : null,
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
    uri: release.uri || `https://www.discogs.com/release/${release.id}`,
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

/** Only same-site paths are allowed as a post-login destination. */
export const safeReturnPath = (path: string | null | undefined) => (path && /^\/(?![/\\])/.test(path) ? path : '/');

/** Path as the visitor sees it on music.ar-va.com (the Worker serves it from /music/…). */
export const musicPath = (url: URL) => url.pathname.replace(/^\/music(?=\/|$)/, '') || '/';
export const loginHref = (url: URL) => `/login?return=${encodeURIComponent(musicPath(url) + url.search)}`;
