// One Worker for ar-va.com and music.ar-va.com: the music host is served from src/pages/music/.
import { handle } from '@astrojs/cloudflare/handler';
import { dbRequest } from './music/store';
import { siteDomain } from './music/lib';
import { MAIN_SITE_PUBLIC } from './site';

const SHARED = /^\/(_astro\/|favicon\.|brand\/)/;
// While the main site is hidden, ar-va.com only serves the login and the files music pages share.
const LOGIN = /^\/(login$|auth\/)/;
const BOOKMARK = 'd1-bookmark';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname.startsWith('music.')) {
      // The one login page is on ar-va.com (the Telegram bot's domain): music.ar-va.com/login goes there, back here after.
      if (url.pathname === '/login' || url.pathname === '/login/') {
        const login = new URL(`${url.protocol}//${siteDomain(url.host)}/login`);
        login.searchParams.set('return', url.searchParams.get('return') ?? `${url.origin}/`);
        return Response.redirect(login.href, 302);
      }
      if (!SHARED.test(url.pathname)) {
        url.pathname = '/music' + url.pathname;
        request = new Request(url, request);
      }
    } else if (/^\/music(\/|$)/.test(url.pathname)) {
      return new Response('Not found', { status: 404 });
    } else if (!MAIN_SITE_PUBLIC && !SHARED.test(url.pathname) && !LOGIN.test(url.pathname)) {
      // 302, not 301: browsers and search engines shouldn't remember it, the site comes back later.
      return Response.redirect(`${url.protocol}//music.${url.host}/`, 302);
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
