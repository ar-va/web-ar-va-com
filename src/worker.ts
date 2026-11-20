// The Worker for ar-va.com (home, blog, and the login all three sites use). music.ar-va.com and anon.ar-va.com
// are separate Workers (music/, anon/).
import { serve } from '../shared/worker';
import { MAIN_SITE_PUBLIC } from '../shared/site';

const SHARED = /^\/(_astro\/|favicon\.|brand\/)/;
// While the main site is hidden, ar-va.com only serves the login and the files pages need.
const LOGIN = /^\/(login$|auth\/)/;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!MAIN_SITE_PUBLIC && !SHARED.test(url.pathname) && !LOGIN.test(url.pathname)) {
      // 302, not 301: browsers and search engines shouldn't remember it, the site comes back later.
      return Response.redirect(`${url.protocol}//music.${url.host}/`, 302);
    }
    return serve(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
