// Pure logic, no Cloudflare imports, so `npm test` can run it in Node.

// Hashing, links and HTML escaping are the ones every ARVA site uses (a relative path with .ts, so Node's tests load it too).
// newToken: the secret in a private link, 24 random bytes as 32 URL-safe characters. Only its hash is stored.
export { escapeHtml, linkify, randomToken as newToken, sha256 } from '../../../shared/lib/lib.ts';

export const now = () => Math.floor(Date.now() / 1000);

export const isToken = (s: string) => /^[A-Za-z0-9_-]{32}$/.test(s);

// ---- Text ----

export const BODY_MAX = 4000;
export const REPLY_MAX = 4000;

/** Trims, unifies line breaks, drops invisible control characters and keeps at most one empty line in a row. */
export function cleanText(raw: unknown) {
  return String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const excerpt = (s: string, max = 300) => (s.length > max ? `${s.slice(0, max).trimEnd()}…` : s);

/** "Nov 17, 2026": the day only. Public pages never show the time a message was sent. */
export const day = (s: number) => new Date(s * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** "3 hours ago", "yesterday", then the date. */
export function ago(s: number, at = now()) {
  const d = at - s;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  if (d < 2 * 86400) return 'yesterday';
  if (d < 7 * 86400) return `${Math.floor(d / 86400)} days ago`;
  return day(s);
}

export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/** Admin-only `back` targets: a path on this site, never another site. */
export const safeBack = (target: unknown) => {
  const s = String(target ?? '');
  return /^\/(?![/\\])[^\s]*$/.test(s) ? s : '/admin';
};
