// Telegram Login Widget redirects here (ar-va.com/auth/telegram) with the signed user data.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { safeReturnPath, verifyTelegramLogin } from '../../music/lib';
import { acceptPendingInvite, saveTelegramUser, startSession } from '../../music/store';

export const prerender = false;

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const returnTo = safeReturnPath(url.searchParams.get('return'), url.hostname);
  const tg = await verifyTelegramLogin(url.searchParams, env.TELEGRAM_BOT_TOKEN);
  if (!tg) return redirect(`/login?failed&return=${encodeURIComponent(returnTo)}`);
  const user = await saveTelegramUser(tg);
  // Someone who opened an invite before logging in becomes a collector now, however they got to this login (before
  // the session starts, so the account menu already knows). Telegram's window (/auth/done) carries on to its own page.
  const invited = await acceptPendingInvite(cookies, user, url.hostname);
  await startSession(cookies, tg, url.hostname);
  return redirect(invited && !returnTo.startsWith('/auth/done') ? `${url.protocol}//music.${url.host}/settings?welcome` : returnTo);
};
