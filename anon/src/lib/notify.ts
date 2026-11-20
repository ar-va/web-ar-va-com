// A Telegram message to the admin (@arvasitebot, the bot ar-va.com already uses) when a new message arrives, sent after
// the page has answered (waitUntil). Senders get no notifications: they come back to their private link.
import { env } from 'cloudflare:workers';
import { escapeHtml, excerpt } from './core';

export async function telegramAdmin(text: string, button?: { text: string; url: string }) {
  const chatId = Number(env.ADMIN_TELEGRAM_ID) || 0;
  if (!env.TELEGRAM_BOT_TOKEN || !chatId) return false;
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true },
      ...(button && { reply_markup: { inline_keyboard: [[button]] } }),
    }),
  }).catch((e) => new Response(String(e), { status: 599 }));
  if (!res.ok) console.log(`telegram sendMessage: ${res.status}`);
  return res.ok;
}

export function newMessageNotice(m: { id: number; body: string; wantsPublic: boolean }, origin: string) {
  const what = m.wantsPublic ? 'asks to be public' : 'private';
  return telegramAdmin(
    `<b>New anonymous message</b> (${what}):\n\n${escapeHtml(excerpt(m.body, 600))}`,
    { text: 'Open the inbox', url: `${origin}/admin#m-${m.id}` },
  );
}

