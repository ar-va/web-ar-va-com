// One Worker for ar-va.com and music.ar-va.com: the music host is served from src/pages/music/.
import { handle } from '@astrojs/cloudflare/handler';
import { dbRequest } from './music/store';
import { siteDomain } from './music/lib';

const SHARED = /^\/(_astro\/|favicon\.)/;
const BOOKMARK = 'd1-bookmark';

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
    const bookmark = request.headers.get('cookie')?.match(/(?:^|;\s*)d1-bookmark=([^;]+)/)?.[1];
    const state: Parameters<typeof dbRequest.run>[0] = { bookmark: bookmark ? decodeURIComponent(bookmark) : null };
    const response = await dbRequest.run(state, () => handle(request, env, ctx));
    // Requests that write (forms, the sync API, logins) hand the visitor a bookmark for their next pages.
    const wrote = !['GET', 'HEAD'].includes(request.method) || /\/auth\//.test(url.pathname);
    const next = wrote ? state.session?.getBookmark() : null;
    if (!next) return response;
    const domain = siteDomain(url.hostname);
    const out = new Response(response.body, response);
    out.headers.append('Set-Cookie', `${BOOKMARK}=${encodeURIComponent(next)}; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax${domain === 'localhost' ? '' : `; Domain=${domain}`}`);
    return out;
  },
} satisfies ExportedHandler<Env>;
