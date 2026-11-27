// Messages to people: Telegram from the login bot, or email for accounts that log in by email (negative ids). Telegram
// only delivers to people who allowed the bot to message them (the login button asks); for everyone else it answers
// 403, which is fine to ignore.
import { env } from 'cloudflare:workers';
import { sha256, toEmail } from './lib';

const MAIL_FROM = 'ARVA Music <music@ar-va.com>';
const SETTINGS = 'https://music.ar-va.com/settings#your-account';

/**
 * One email through Resend's HTTP API; true if Resend took it. Without RESEND_API_KEY it fails (logged without the
 * email, which may hold a login code); local runs set EMAIL_LOG=1 in .dev.vars to see emails in the log instead.
 * shortcut: Resend's free plan sends 100 emails a day (3,000 a month), login codes and messages together; past that,
 * sends are refused and logged. Upgrade to Resend Pro ($20/month) or Cloudflare Workers Paid's Email Sending then.
 */
export async function sendEmail(to: string, mail: { subject: string; html: string; text: string }) {
  const { RESEND_API_KEY: key, EMAIL_LOG } = env as { RESEND_API_KEY?: string; EMAIL_LOG?: string };
  if (!key && EMAIL_LOG === '1') {
    console.log(`email (not sent: no RESEND_API_KEY) to ${to}\nSubject: ${mail.subject}\n${mail.text}`);
    return true;
  }
  if (!key) {
    console.error('email not sent: RESEND_API_KEY is missing on this Worker');
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: MAIL_FROM, to: [to], subject: mail.subject, html: mail.html, text: mail.text }),
  }).catch((e) => new Response(String(e), { status: 599 }));
  if (!res.ok) console.log(`email: ${res.status} ${(await res.text()).slice(0, 160)}`);
  return res.ok;
}

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
export async function notify(messages: { chatId: number; text: string; buttons?: Button[][]; photo?: string | null }[]) {
  // Email accounts: their address and whether they want messages, in one query.
  const ids = [...new Set(messages.map((m) => m.chatId).filter((id) => id < 0))];
  const { results: inboxes } = ids.length
    ? await env.DB.prepare(`SELECT user_id, email, messages FROM email_accounts WHERE user_id IN (${ids.map(() => '?').join(', ')})`).bind(...ids)
      .all<{ user_id: number; email: string; messages: number }>().catch((e) => { console.log('email lookup failed', e); return { results: [] }; })
    : { results: [] };
  return Promise.all(messages.map(async (m) => {
    const { chatId, text, buttons, photo } = m;
    if (chatId < 0) {
      const inbox = inboxes.find((x) => x.user_id === chatId);
      return !!inbox?.messages && sendEmail(inbox.email, toEmail(m, SETTINGS));
    }
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
