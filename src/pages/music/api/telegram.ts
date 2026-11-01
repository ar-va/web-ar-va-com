// The bot's button taps (Telegram's webhook, set by connectWebhook in notify.ts). One button so far: "Send an invite
// link" under a shelf request (settings.astro), which makes a one-use, 7-day link and has the bot send it to the person.
import type { APIRoute } from 'astro';
import { escapeHtml } from '../../../music/lib';
import { bot, notify, webhookSecret } from '../../../music/notify';
import { adminTelegramId, canCollect, createInvite, userById } from '../../../music/store';

export const prerender = false;

export const POST: APIRoute = async ({ request, url }) => {
  if (request.headers.get('x-telegram-bot-api-secret-token') !== (await webhookSecret())) return new Response('Forbidden', { status: 403 });
  const tap = (await request.json().catch(() => null))?.callback_query;
  const id = Number(String(tap?.data ?? '').match(/^invite:(\d+)$/)?.[1]);
  // Telegram retries anything but a 200, so everything else is acknowledged and dropped.
  if (!id) return new Response('ok');

  const answer = (text: string) => bot('answerCallbackQuery', { callback_query_id: tap.id, text });
  const [admin, person] = await Promise.all([userById(adminTelegramId()), userById(id)]);
  if (!admin || tap.from?.id !== admin.id) await answer('Only the site’s admin can send invites.');
  else if (!person) await answer('That person isn’t on the site.');
  else if (canCollect(person)) await answer(`${person.name} is already a collector.`);
  else {
    const link = `https://${url.host}/invite/${await createInvite(admin, 604800, 1)}`;
    const [sent] = await notify([{
      chatId: person.id,
      text: `<b>${escapeHtml(admin.name)}</b> invited you to put your record collection on music.ar-va.com.\n\nThe link works once, for 7 days.`,
      buttons: [[{ text: 'Accept the invite', url: link }]],
    }]);
    if (sent) {
      // The button turns into a note that it's done (a link to the invites in settings).
      await bot('editMessageReplyMarkup', {
        chat_id: tap.message?.chat?.id, message_id: tap.message?.message_id,
        reply_markup: { inline_keyboard: [[{ text: '✓ Invite link sent', url: `https://${url.host}/settings#invites` }]] },
      });
      await answer(`Invite link sent to ${person.name}.`);
    } else {
      // They never let the bot write to them: the admin gets the link to pass on another way.
      await notify([{ chatId: admin.id, text: `Telegram won’t deliver to <b>${escapeHtml(person.name)}</b> (they haven’t allowed messages from this bot). Send them this invite link yourself:\n\n${link}` }]);
      await answer('Couldn’t message them: the link is in this chat.');
    }
  }
  return new Response('ok');
};
