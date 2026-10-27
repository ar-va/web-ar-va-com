// What the collector's browser asks of the site while it talks to Discogs (see src/music/sync.ts).
import type { APIRoute } from 'astro';
import { canCollect, currentUser } from '../../../music/store';
import {
  accessTokenRequest, missingReleases, requestTokenRequest, saveCollection, savePending, saveRelease, saveToken, setUsername, signFor,
} from '../../../music/discogs';

export const prerender = false;

const json = (data: unknown, status = 200) => Response.json(data, { status });
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export const POST: APIRoute = async ({ request, cookies, url }) => {
  // JSON bodies aren't covered by Astro's checkOrigin; cross-site callers are refused here.
  if (request.headers.get('origin') !== url.origin) return json({ error: 'Forbidden' }, 403);
  const user = await currentUser(cookies);
  if (!user || !canCollect(user)) return json({ error: 'Only collectors can connect Discogs.' }, 403);
  const body = await request.json().catch(() => ({}));

  try {
    switch (body.action) {
      case 'status':
        return json({ username: user.discogs_token ? user.discogs_username : null, syncedAt: user.synced_at });
      case 'missing':
        return json({ missing: user.discogs_username ? await missingReleases(user) : [] });
      case 'request_token':
        return json(await requestTokenRequest(`${url.origin}/auth/discogs`));
      case 'pending':
        if (!str(body.token) || !str(body.secret)) return json({ error: 'Discogs didn’t start the sign-in. Please try again.' }, 400);
        await savePending(user, str(body.token), str(body.secret));
        return json({ authorize: `https://www.discogs.com/oauth/authorize?oauth_token=${encodeURIComponent(str(body.token))}` });
      case 'access_token': {
        const signed = await accessTokenRequest(user, str(body.token), str(body.verifier));
        return signed ? json(signed) : json({ error: 'That Discogs sign-in expired. Please try again.' }, 400);
      }
      case 'token':
        if (!str(body.key) || !str(body.secret)) return json({ error: 'Discogs didn’t finish the sign-in. Please try again.' }, 400);
        await saveToken(user, { key: str(body.key), secret: str(body.secret) });
        return json({ ok: true });
      case 'username': {
        const error = await setUsername(user, str(body.username));
        return error ? json({ error }, 400) : json({ ok: true });
      }
      case 'sign': {
        const signed = await signFor(user, str(body.path));
        return signed ? json(signed) : json({ error: 'Connect Discogs first.' }, 400);
      }
      case 'collection':
        return json(await saveCollection(user, body.fields, body.releases));
      case 'release':
        return (await saveRelease(user, body.release, body.masterYear, body.firstReleased)) ? json({ ok: true }) : json({ error: 'Not on your shelf.' }, 400);
    }
  } catch (e) {
    console.error(`api/discogs ${body.action} failed: ${e instanceof Error ? e.message : e}`);
    return json({ error: 'Something went wrong on the site. Please try again.' }, 500);
  }
  return json({ error: 'Unknown action' }, 400);
};
