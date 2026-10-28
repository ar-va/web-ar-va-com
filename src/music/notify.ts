// Telegram messages from the login bot. Telegram only delivers to people who allowed the bot to message them
// (the login button asks); for everyone else it answers 403, which is fine to ignore.
import { env } from 'cloudflare:workers';

export async function notify(messages: { chatId: number; text: string }[]) {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  await Promise.all(messages.map(async ({ chatId, text }) => {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }),
    }).catch((e) => new Response(String(e), { status: 599 }));
    if (!res.ok) console.log(`telegram notify ${chatId}: ${res.status} ${(await res.text()).slice(0, 120)}`);
  }));
}
