// What both Workers do with every request: render it with Astro inside a D1 session (reads from the nearest replica),
// and after a write hand the visitor a bookmark so their next pages see it.
import { handle } from '@astrojs/cloudflare/handler';
import { dbRequest } from './lib/store';
import { siteDomain } from './lib/lib';

const BOOKMARK = 'd1-bookmark';

export async function serve(request: Request, env: Env, ctx: ExecutionContext) {
  const url = new URL(request.url);
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
}
