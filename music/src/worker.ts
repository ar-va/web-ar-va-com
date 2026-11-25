// The Worker for music.ar-va.com.
import { serve } from '../../shared/worker';
import { siteDomain } from '../../shared/lib/lib';
import { dbRequest } from '../../shared/lib/store';
import { connectWebhook } from '../../shared/lib/notify';
import { sendReminders } from './lib/wishes';

// The cron has no request to take the host from.
const HOST = 'music.ar-va.com';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // The one login page is on ar-va.com (the Telegram bot's domain): music.ar-va.com/login goes there, back here after.
    // (Only on the music host: were ar-va.com ever pointed at this Worker, it must not redirect to itself.)
    if (url.hostname.startsWith('music.') && (url.pathname === '/login' || url.pathname === '/login/')) {
      const login = new URL(`${url.protocol}//${siteDomain(url.host)}/login`);
      login.searchParams.set('return', url.searchParams.get('return') ?? `${url.origin}/`);
      return Response.redirect(login.href, 302);
    }
    return serve(request, env, ctx);
  },
  // Daily (wrangler.jsonc): reminders for reserved wishlist gifts, whose buttons tap back to /api/telegram.
  async scheduled(_controller, _env, ctx) {
    ctx.waitUntil(dbRequest.run({ bookmark: null }, async () => {
      await connectWebhook(HOST);
      console.log(`wishlist reminders sent: ${await sendReminders(`https://${HOST}`)}`);
    }));
  },
} satisfies ExportedHandler<Env>;
