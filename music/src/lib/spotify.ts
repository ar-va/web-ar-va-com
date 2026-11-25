// Spotify album matching, server side, with the app's client-credentials token (catalogue access only).
// Optional: without SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET it does nothing and the icon keeps searching.
import { env } from 'cloudflare:workers';
import { pickAlbum, type Match } from '@shared/lib/lib';
import type { AlbumLookup } from '@shared/lib/wishlist';

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

/** Albums for words typed in the wishlist's box; only with the app's keys (Spotify has no keyless search). */
export async function spotifyAlbums(term: string) {
  const bearer = await accessToken();
  if (!bearer) return [];
  const data = await api(`/search?type=album&limit=6&q=${encodeURIComponent(term)}`, bearer);
  return (data.albums?.items ?? []).filter((a: any) => a?.id && a.name).map((a: any) => ({
    url: `https://open.spotify.com/album/${a.id}`,
    title: String(a.name),
    artist: (a.artists ?? []).map((x: any) => x.name).join(', '),
    year: Number(String(a.release_date ?? '').slice(0, 4)) || null,
    artwork: a.images?.at(-1)?.url ?? null,
  })) as { url: string; title: string; artist: string; year: number | null; artwork: string | null }[];
}

/**
 * An album pasted into a wishlist, without the API (no keys needed): Spotify's embed player page carries the album, its
 * artist and every track with its length; the album page adds the release date and the cover (checked 2026-11-24).
 */
export async function spotifyAlbum(id: string): Promise<AlbumLookup | null> {
  const get = (url: string) => fetch(url).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`Spotify ${url}: ${r.status}`))));
  const [embed, page] = await Promise.all([get(`https://open.spotify.com/embed/album/${id}`), get(`https://open.spotify.com/album/${id}`).catch(() => '')]);
  const json = embed.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s)?.[1];
  const album = json ? JSON.parse(json)?.props?.pageProps?.state?.data?.entity : null;
  if (!album?.name) return null;
  const meta = (name: string) => page.match(new RegExp(`<meta (?:property|name)="${name}" content="([^"]*)"`))?.[1] ?? null;
  const length = (ms: unknown) => {
    const s = typeof ms === 'number' && ms > 0 ? Math.round(ms / 1000) : 0;
    return s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '';
  };
  return {
    artist: String(album.subtitle ?? ''),
    title: String(album.name),
    year: Number(meta('music:release_date')?.slice(0, 4)) || null,
    cover: meta('og:image'),
    link: `https://open.spotify.com/album/${id}`,
    tracks: (Array.isArray(album.trackList) ? album.trackList : []).map((t: any) => ({
      title: String(t?.title ?? ''), duration: length(t?.duration),
      url: typeof t?.uri === 'string' && t.uri.startsWith('spotify:track:') ? `https://open.spotify.com/track/${t.uri.slice(14)}` : '',
    })).filter((t: { title: string }) => t.title),
  };
}
