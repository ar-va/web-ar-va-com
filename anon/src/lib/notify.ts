// A Telegram message to the admin (@arvasitebot, the bot ar-va.com already uses) when a new message arrives, sent after
// the page has answered (waitUntil). Senders get no notifications: they come back to their private link.
import { env } from 'cloudflare:workers';
import { notify } from '@shared/lib/notify';
import { escapeHtml, excerpt } from './core';

export async function newMessageNotice(m: { id: number; body: string; wantsPublic: boolean }, origin: string) {
  const chatId = Number(env.ADMIN_TELEGRAM_ID) || 0;
  if (!chatId) return false;
  const what = m.wantsPublic ? 'asks to be public' : 'private';
  const [sent] = await notify([{
    chatId,
    text: `<b>New anonymous message</b> (${what}):\n\n${escapeHtml(excerpt(m.body, 600))}`,
    buttons: [[{ text: 'Open the inbox', url: `${origin}/admin#m-${m.id}` }]],
  }]);
  return sent;
}
