// Logging in with a code sent by email (the login page's "Or use your email"). step=send: Turnstile, then a 6-digit
// code and a login link are emailed (the link: auth/link.astro) and the address waits in a short cookie (kept out of
// the address bar and logs); step=verify: the right code starts the same session as Telegram (auth/telegram.ts), a
// new account first chooses its name.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { normalizeEmail, safeReturnPath } from '@shared/lib/lib';
import { checkLoginCode, finishEmailLogin, requestLoginCode } from '@shared/lib/store';

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
    const sent = await requestLoginCode(email, (key) => `${url.origin}/auth/link?t=${key}&return=${encodeURIComponent(returnTo)}`);
    if (sent === 'failed') return back('bad=send');
    cookies.set(PENDING, email, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 900 });
    return back(sent === 'wait' ? 'code&wait' : 'code');
  }

  const email = normalizeEmail(cookies.get(PENDING)?.value);
  if (!email) return back('gone');
  const checked = await checkLoginCode(email, String(form.get('code') ?? ''));
  if (checked !== 'ok') return back(`code&${checked}`);
  cookies.delete(PENDING, { path: '/' });
  return redirect(await finishEmailLogin(cookies, url, email, returnTo), 303);
};
