// Connect Discogs: without parameters it starts the OAuth flow, Discogs sends the user back here with a verifier.
import type { APIRoute } from 'astro';
import { finishConnect, startConnect, syncShelf } from '../../../music/discogs';
import { canCollect, currentUser } from '../../../music/store';

export const prerender = false;

export const GET: APIRoute = async ({ url, cookies, redirect, locals }) => {
  const user = await currentUser(cookies);
  if (!user) return redirect('/login?return=%2Fsettings');
  if (!canCollect(user)) return redirect('/settings');

  const token = url.searchParams.get('oauth_token');
  const verifier = url.searchParams.get('oauth_verifier');
  if (url.searchParams.has('denied')) return redirect('/settings');
  try {
    if (!token || !verifier) return redirect(await startConnect(user, `https://${url.host}/auth/discogs`));
    const error = await finishConnect(user, token, verifier);
    if (error) return redirect(`/settings?error=${encodeURIComponent(error)}`);
  } catch (e) {
    console.error('discogs connect failed', e);
    return redirect(`/settings?error=${encodeURIComponent('Discogs didn’t answer as expected. Please try again in a minute.')}`);
  }
  const connected = await currentUser(cookies);
  if (connected) locals.cfContext.waitUntil(syncShelf(connected));
  return redirect('/settings?connected');
};
