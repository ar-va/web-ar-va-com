// The bot's button taps (Telegram's webhook, set by connectWebhook in notify.ts): "Send an invite link" under a shelf
// request (settings.astro), which makes a one-use, 7-day link and has the bot send it to the person; and under a
// wishlist reminder or reservation message (wishes.ts) "I gave it" / "Cancel reservation" and the giving-date calendar,
// which only the person who reserved can use (the date saved here is the one the website shows).
import type { APIRoute } from 'astro';
import { displayDate, escapeHtml } from '@shared/lib/lib';
import { bot, notify, webhookSecret } from '@shared/lib/notify';
import { adminTelegramId, canCollect, createInvite, userById } from '@shared/lib/store';
import { currentGiveOn, markGifted, openReservation, reservationButtons, setGiveOn, unreserve } from '../../lib/wishes';
import { calendarKeyboard, safeGiveOn } from '@shared/lib/wishlist';

export const prerender = false;

export const POST: APIRoute = async ({ request, url }) => {
  if (request.headers.get('x-telegram-bot-api-secret-token') !== (await webhookSecret())) return new Response('Forbidden', { status: 403 });
  const tap = (await request.json().catch(() => null))?.callback_query;
  const data = String(tap?.data ?? '');
  // Parts of the calendar that aren't buttons (weekday names, blanks): just acknowledged.
  if (data === 'noop') { await bot('answerCallbackQuery', { callback_query_id: tap.id }); return new Response('ok'); }
  // The giving-date calendar (shared/lib/wishlist.ts calendarKeyboard): show a month, save a day (or none), go back.
  const cal = data.match(/^(cal|day|back):(-?\d+):([dc]:\d+)(?::(\d{4}-\d{2}(?:-\d{2})?|none))?$/);
  if (cal) {
    const [, verb, ownerText, item, arg] = cal;
    const ownerId = Number(ownerText);
    const open = await openReservation(ownerId, item);
    const reserver = open && tap.from?.id === open.user_id ? await userById(open.user_id) : null;
    const answer = (text?: string) => bot('answerCallbackQuery', { callback_query_id: tap.id, ...(text && { text }) });
    const setButtons = (inline_keyboard: unknown) => bot('editMessageReplyMarkup', { chat_id: tap.message?.chat?.id, message_id: tap.message?.message_id, reply_markup: { inline_keyboard } });
    if (!reserver) { await answer('This reservation isn’t yours, or it’s already closed.'); return new Response('ok'); }
    const today = new Date().toISOString().slice(0, 10);
    if (verb === 'cal') {
      // A month from ‹ ›, else the month of the date set, else this month.
      const selected = await currentGiveOn(ownerId, item);
      const month = arg?.length === 7 && arg >= today.slice(0, 7) ? arg : (selected ?? today).slice(0, 7);
      await setButtons(calendarKeyboard({ ownerId, item, month, today, selected }));
      await answer();
    } else {
      if (verb === 'day') await setGiveOn(ownerId, item, reserver.id, arg === 'none' ? null : safeGiveOn(arg, today));
      const buttons = await reservationButtons(ownerId, item, reserver, `https://${url.host}`);
      if (buttons) await setButtons(buttons);
      const set = verb === 'day' ? await currentGiveOn(ownerId, item) : null;
      await answer(verb === 'back' ? undefined : set ? `Saved: giving on ${displayDate(set)}. I’ll remind you 3 days before.` : 'The giving date is cleared.');
    }
    return new Response('ok');
  }
  const gift = data.match(/^(gift|unres):(-?\d+):([dc]:\d+)$/);
  if (gift) {
    const [, verb, owner, item] = gift;
    const open = await openReservation(Number(owner), item);
    let done = '';
    if (open && tap.from?.id === open.user_id) {
      if (verb === 'gift' && await markGifted(Number(owner), item, { id: open.user_id, name: (await userById(open.user_id))?.name ?? 'Someone' })) done = '✓ Marked as gifted';
      if (verb === 'unres' && await unreserve(Number(owner), item, open.user_id)) done = 'Reservation cancelled';
    }
    if (done) {
      // Given: a note that it's done (→ their reserved gifts). Cancelled: also the way back to the wishlist, to pick
      // another (user 2026-11-25).
      const keyboard = verb === 'gift'
        ? [[{ text: done, url: `https://${url.host}/settings#gifts` }]]
        : [[{ text: done, callback_data: 'noop' }], [{ text: `Back to ${open!.owner_name.split(' ')[0]}’s wishlist`, url: `https://${url.host}${open!.wishlist}` }]];
      await bot('editMessageReplyMarkup', { chat_id: tap.message?.chat?.id, message_id: tap.message?.message_id, reply_markup: { inline_keyboard: keyboard } });
      await bot('answerCallbackQuery', { callback_query_id: tap.id, text: verb === 'gift' ? `Thank you! ${open!.owner_name.split(' ')[0]} has been told.` : 'Cancelled.' });
    } else await bot('answerCallbackQuery', { callback_query_id: tap.id, text: 'This reservation isn’t yours, or it’s already closed.' });
    return new Response('ok');
  }
  const id = Number(String(tap?.data ?? '').match(/^invite:(-?\d+)$/)?.[1]);
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
      // They never let the bot write to them (or their email didn't go): the admin gets the link to pass on another way.
      const why = person.id < 0 ? `The email to <b>${escapeHtml(person.name)}</b> didn’t go out (or they turned messages off).`
        : `Telegram won’t deliver to <b>${escapeHtml(person.name)}</b> (they haven’t allowed messages from this bot).`;
      await notify([{ chatId: admin.id, text: `${why} Send them this invite link yourself:\n\n${link}` }]);
      await answer('Couldn’t message them: the link is in this chat.');
    }
  }
  return new Response('ok');
};
