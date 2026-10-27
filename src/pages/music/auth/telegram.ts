// Telegram Login Widget redirects here with the signed user data.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { safeReturnPath, verifyTelegramLogin } from '../../../music/lib';
import { saveTelegramUser, startSession } from '../../../music/store';

export const prerender = false;

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const returnTo = safeReturnPath(url.searchParams.get('return'));
  const tg = await verifyTelegramLogin(url.searchParams, env.TELEGRAM_BOT_TOKEN);
  if (!tg) return redirect(`/login?failed&return=${encodeURIComponent(returnTo)}`);
  await saveTelegramUser(tg);
  await startSession(cookies, tg.id);
  return redirect(returnTo);
};
