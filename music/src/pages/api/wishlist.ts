// For the wishlist's box (music/src/scripts/wish-form.ts): album suggestions for typed words (`action: search`), and an
// album from a Spotify or YouTube Music link. Apple Music is asked from the browser, like every Apple lookup. Returns
// form values; saving checks them again (toWish).
import type { APIRoute } from 'astro';
import { canCollect, currentUser } from '@shared/lib/store';
import { lookupToWish, parseStreamingLink } from '@shared/lib/wishlist';
import { spotifyAlbum, spotifyAlbums } from '../../lib/spotify';
import { youtubeAlbum, youtubeAlbums } from '../../lib/youtube';

export const prerender = false;

const json = (data: unknown, status = 200) => Response.json(data, { status });

export const POST: APIRoute = async ({ request, cookies, url }) => {
  // JSON bodies aren't covered by Astro's checkOrigin; cross-site callers are refused here.
  if (request.headers.get('origin') !== url.origin) return json({ error: 'Forbidden' }, 403);
  const user = await currentUser(cookies);
  if (!user || !canCollect(user)) return json({ error: 'Only collectors have a wishlist.' }, 403);
  const body = await request.json().catch(() => ({}));
  // Typed words: YouTube Music's and (with keys) Spotify's albums for them; Apple's come from the browser. A service
  // that fails just adds nothing.
  if (body?.action === 'search') {
    const term = String(body.term ?? '').trim().slice(0, 200);
    if (term.length < 3) return json({ youtube: [], spotify: [] });
    const [youtube, spotify] = await Promise.all([
      youtubeAlbums(term).catch((e) => { console.log(`youtube search failed: ${e instanceof Error ? e.message : e}`); return []; }),
      spotifyAlbums(term).catch((e) => { console.log(`spotify search failed: ${e instanceof Error ? e.message : e}`); return []; }),
    ]);
    return json({ youtube, spotify });
  }
  const link = parseStreamingLink(String(body?.url ?? ''));
  if (!link || link.service === 'apple') return json({ error: 'That link isn’t an album on Spotify or YouTube Music.' }, 400);
  try {
    const album = link.service === 'spotify' ? await spotifyAlbum(link.id) : await youtubeAlbum(link.id);
    if (!album) return json({ error: 'Couldn’t find that album. Please type it in instead.' }, 404);
    return json(lookupToWish(album, link.service));
  } catch (e) {
    console.error(`api/wishlist lookup failed for ${link.service} ${link.id}: ${e instanceof Error ? e.message : e}`);
    return json({ error: `Couldn’t reach ${link.service === 'spotify' ? 'Spotify' : 'YouTube Music'}. Please try again, or type it in.` }, 502);
  }
};
