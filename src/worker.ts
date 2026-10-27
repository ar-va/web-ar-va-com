// One Worker for ar-va.com and music.ar-va.com: the music host is served from src/pages/music/.
import { handle } from '@astrojs/cloudflare/handler';
import { syncAll } from './music/discogs';

const SHARED = /^\/(_astro\/|favicon\.)/;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname.startsWith('music.')) {
      if (!SHARED.test(url.pathname)) {
        url.pathname = '/music' + url.pathname;
        request = new Request(url, request);
      }
    } else if (/^\/music(\/|$)/.test(url.pathname)) {
      return new Response('Not found', { status: 404 });
    }
    return handle(request, env, ctx);
  },

  async scheduled(_controller, _env, ctx) {
    ctx.waitUntil(syncAll());
  },
} satisfies ExportedHandler<Env>;
