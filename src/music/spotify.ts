// Spotify album matching, server side, with the app's client-credentials token (catalogue access only).
// Optional: without SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET it does nothing and the icon keeps searching.
import { env } from 'cloudflare:workers';
import { pickAlbum, type Match } from './lib';

let token: { value: string; expires: number } | null = null;

async function accessToken() {
  const id = (env as Record<string, string | undefined>).SPOTIFY_CLIENT_ID, secret = (env as Record<string, string | undefined>).SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (token && token.expires > Date.now() + 60_000) return token.value;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${id}:${secret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Spotify token: ${res.status}`);
  const data = await res.json<{ access_token: string; expires_in: number }>();
  token = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return token.value;
}

const api = async (path: string, bearer: string) => {
  const res = await fetch(`https://api.spotify.com/v1${path}`, { headers: { Authorization: `Bearer ${bearer}` } });
  if (!res.ok) throw new Error(`Spotify ${path.split('?')[0]}: ${res.status}`);
  return res.json<any>();
};

export async function spotifyMatch(artist: string, title: string): Promise<Match['spotify']> {
  const bearer = await accessToken();
  if (!bearer) return undefined;
  const albums = (q: string) => api(`/search?type=album&limit=10&q=${encodeURIComponent(q)}`, bearer)
    .then((d) => (d.albums?.items ?? []).map((a: any) => ({ id: a.id, title: a.name, artist: a.artists.map((x: any) => x.name).join(', '), url: a.external_urls?.spotify })));
  const best = pickAlbum(await albums(`album:${title} artist:${artist}`), artist, title) ?? pickAlbum(await albums(`${artist} ${title}`), artist, title);
  if (!best?.url) return undefined;
  const tracks = await api(`/albums/${best.id}/tracks?limit=50`, bearer);
  return { url: best.url, tracks: (tracks.items ?? []).map((t: any) => ({ title: t.name, url: t.external_urls?.spotify })).filter((t: { url?: string }) => t.url) };
}
