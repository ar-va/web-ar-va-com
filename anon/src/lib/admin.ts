// The admin logs in on ar-va.com (Telegram, the one login for every ar-va.com site): its session cookie is set for
// Domain=ar-va.com, so it arrives here too. This file only asks ar-va.com's database whether that session belongs to
// the admin.
//
// Anonymity: visitors who once logged in on music.ar-va.com send that cookie (and the `who` name cookie) here as well.
// They are only ever compared against the admin; nothing reads them on the sending path, nothing stores or logs them.
import type { AstroCookies } from 'astro';
import { env } from 'cloudflare:workers';
import { now, sha256 } from './core';

const SESSION_COOKIE = '__Secure-session';

export interface Admin { id: number; name: string; photo: string | null }

export async function currentAdmin(cookies: AstroCookies): Promise<Admin | null> {
  const token = cookies.get(SESSION_COOKIE)?.value;
  const adminId = Number(env.ADMIN_TELEGRAM_ID) || 0;
  if (!token || !adminId) return null;
  const row = await env.AUTH.prepare('SELECT users.id, users.name, users.photo_url FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ? AND sessions.expires_at > ? AND users.id = ?')
    .bind(await sha256(token), now(), adminId).first<{ id: number; name: string; photo_url: string | null }>()
    .catch(() => null);
  return row ? { id: row.id, name: row.name.split(' ')[0], photo: safePhoto(row.photo_url) } : null;
}

const safePhoto = (url: string | null) => (url?.startsWith('https://') ? url : null);

let face: Promise<{ name: string; photo: string | null }> | null = null;
/** Who answers on the page: the admin's first name and Telegram photo, read once per Worker instance. */
export function answerer() {
  face ??= env.AUTH.prepare('SELECT name, photo_url FROM users WHERE id = ?').bind(Number(env.ADMIN_TELEGRAM_ID) || 0)
    .first<{ name: string; photo_url: string | null }>()
    .then((r) => ({ name: r?.name.split(' ')[0] || 'Artur', photo: safePhoto(r?.photo_url ?? null) }))
    .catch(() => { face = null; return { name: 'Artur', photo: null }; });
  return face;
}

/** ar-va.com's login page, coming back to `back` on this site. */
export const loginUrl = (url: URL, back = url.href) => `${env.MAIN_ORIGIN}/login?return=${encodeURIComponent(back)}`;
