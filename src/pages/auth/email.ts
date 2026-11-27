// Logging in with a code sent by email (the login page's "Or use your email"). step=send: Turnstile, then a 6-digit
// code is emailed and the address waits in a short cookie (kept out of the address bar and logs); step=verify: the
// right code starts the same session as Telegram (auth/telegram.ts), a new account first chooses its name.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { normalizeEmail, safeReturnPath } from '@shared/lib/lib';
import { acceptPendingInvite, checkLoginCode, emailAccount, requestLoginCode, startSession } from '@shared/lib/store';

export const prerender = false;

const PENDING = 'login_email';

/** Cloudflare Turnstile's answer for the widget's token (keeps the form from being used to flood inboxes). */
async function isPerson(token: string, ip: string | null) {
  const secret = (env as { TURNSTILE_SECRET?: string }).TURNSTILE_SECRET;
  if (!token || !secret) return false;
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body }).catch(() => null);
  return !!res?.ok && ((await res.json()) as { success?: boolean }).success === true;
}

export const POST: APIRoute = async ({ request, cookies, url, redirect }) => {
  const form = await request.formData();
  const returnTo = safeReturnPath(String(form.get('return') ?? ''), url.hostname);
  const back = (query: string) => redirect(`/login?${query}&return=${encodeURIComponent(returnTo)}#email`, 303);

  if (form.get('step') === 'send') {
    const email = normalizeEmail(form.get('email'));
    if (!email) return back('bad=email');
    if (!await isPerson(String(form.get('cf-turnstile-response') ?? ''), request.headers.get('CF-Connecting-IP'))) return back('bad=check');
    const sent = await requestLoginCode(email);
    if (sent === 'failed') return back('bad=send');
    cookies.set(PENDING, email, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 900 });
    return back(sent === 'wait' ? 'code&wait' : 'code');
  }

  const email = normalizeEmail(cookies.get(PENDING)?.value);
  if (!email) return back('gone');
  const checked = await checkLoginCode(email, String(form.get('code') ?? ''));
  if (checked !== 'ok') return back(`code&${checked}`);
  cookies.delete(PENDING, { path: '/' });
  const { user, isNew } = await emailAccount(email);
  // As after a Telegram login: an invite opened before logging in is accepted, then settings welcomes them.
  const invited = await acceptPendingInvite(cookies, user, url.hostname);
  await startSession(cookies, { id: user.id, name: user.name, photoUrl: null }, url.hostname);
  const next = invited ? `${url.protocol}//music.${url.host}/settings?welcome` : returnTo;
  return redirect(isNew ? `/auth/name?return=${encodeURIComponent(next)}` : next, 303);
};
