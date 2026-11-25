// Telegram messages from the login bot. Telegram only delivers to people who allowed the bot to message them
// (the login button asks); for everyone else it answers 403, which is fine to ignore.
import { env } from 'cloudflare:workers';
import { sha256 } from './lib';

/** One Bot API call; true if Telegram accepted it. */
export async function bot(method: string, body: object) {
  if (!env.TELEGRAM_BOT_TOKEN) return false;
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch((e) => new Response(String(e), { status: 599 }));
  if (!res.ok) console.log(`telegram ${method}: ${res.status} ${(await res.text()).slice(0, 120)}`);
  return res.ok;
}

type Button = { text: string; url: string } | { text: string; callback_data: string };

/**
 * Sends each message (HTML, optional buttons under it; with `photo`, the text is the photo's caption, at most 1024
 * characters); per message, whether Telegram delivered it. A photo Telegram can't fetch: the text alone.
 */
export function notify(messages: { chatId: number; text: string; buttons?: Button[][]; photo?: string | null }[]) {
  return Promise.all(messages.map(async ({ chatId, text, buttons, photo }) => {
    const markup = buttons && { reply_markup: { inline_keyboard: buttons } };
    if (photo && await bot('sendPhoto', { chat_id: chatId, photo, caption: text, parse_mode: 'HTML', ...markup })) return true;
    return bot('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...markup });
  }));
}

// Button taps come to music.ar-va.com/api/telegram. Telegram sends this secret along, so nobody else can fake a tap;
// it's derived from the bot token, so there is no extra secret to set.
export const webhookSecret = async () => sha256(`webhook:${env.TELEGRAM_BOT_TOKEN}`);
/** Points the bot's button taps at this site (only taps: messages to the bot aren't needed). Idempotent. */
export async function connectWebhook(musicHost: string) {
  if (/localhost(:\d+)?$/.test(musicHost)) return false;
  return bot('setWebhook', { url: `https://${musicHost}/api/telegram`, secret_token: await webhookSecret(), allowed_updates: ['callback_query'] });
}
