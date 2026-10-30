// YouTube Music track links and plays, server side, with the YouTube Data API (YOUTUBE_API_KEY; optional: without it
// the YouTube icons keep searching). The API can't see YouTube Music's album pages (album playlists never come up in
// its search, checked 2026-10-30), but the artist's automatic "<Artist> - Topic" channel holds their tracks: find that
// channel, search it for the album's title, and keep each title's most played video. Quota: 10,000 units a day; an
// album costs 201 (two searches at 100, play counts at 1), so about 49 albums a day; a failed call leaves the album
// for a later try.
import { env } from 'cloudflare:workers';
import { artistKey, firstArtist, normalizeName, pickAlbum, type Match } from './lib';

const key = () => (env as Record<string, string | undefined>).YOUTUBE_API_KEY;
export const youtubeConfigured = () => !!key();

const api = async (path: string) => {
  const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}&key=${key()}`);
  if (!res.ok) throw new Error(`YouTube ${path.split('?')[0]}: ${res.status}`);
  return res.json<any>();
};
// The API returns titles HTML-escaped ("Let&#39;s Get Lost").
const decode = (s: string) => s.replace(/&(#39|quot|amp|lt|gt);/g, (_, e: string) => ({ '#39': "'", quot: '"', amp: '&', lt: '<', gt: '>' })[e]!);

/** The artist's "<Artist> - Topic" channel id, if YouTube has one. */
async function topicChannel(artist: string): Promise<string | undefined> {
  const a = artistKey(artist);
  const { items = [] } = await api(`search?part=snippet&type=channel&maxResults=5&q=${encodeURIComponent(`${artist} - Topic`)}`);
  return items.find((i: any) => {
    const name = decode(i.snippet.channelTitle);
    const ca = artistKey(name.replace(/ - Topic$/, ''));
    return name.endsWith(' - Topic') && (ca === a || ca.includes(a) || a.includes(ca));
  })?.id?.channelId;
}

/**
 * The album's own page on YouTube Music (music.youtube.com/browse/MPREb_…), which the official API can't see. This
 * asks YouTube Music's internal search, the one its website uses (user's choice, 2026-10-30, knowing it's unofficial
 * and outside YouTube's terms): it may change or be blocked, and then the album button simply keeps searching.
 * null = no album found; undefined = the search failed.
 */
export async function youtubeAlbum(artist: string, title: string): Promise<string | null | undefined> {
  try {
    const res = await fetch('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://music.youtube.com' },
      // params: the search's "Albums" filter.
      body: JSON.stringify({ context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20241023.01.00', hl: 'en' } }, query: `${artist} ${title}`, params: 'EgWKAQIYAWoMEA4QChADEAQQCRAF' }),
    });
    if (!res.ok) throw new Error(`YouTube Music search: ${res.status}`);
    const found: { id: string; title: string; artist: string }[] = [];
    const walk = (o: any): void => {
      if (!o || typeof o !== 'object') return;
      const r = o.musicResponsiveListItemRenderer;
      const id = r?.navigationEndpoint?.browseEndpoint?.browseId;
      if (typeof id === 'string' && id.startsWith('MPREb_')) {
        const [name = '', about = ''] = (r.flexColumns ?? []).map((c: any) => (c.musicResponsiveListItemFlexColumnRenderer?.text?.runs ?? []).map((x: any) => x.text).join(''));
        const [kind, by = ''] = about.split(' • ');
        if (kind === 'Album' || kind === 'EP') found.push({ id, title: name, artist: by });
      }
      for (const k in o) walk(o[k]);
    };
    walk(await res.json());
    const best = pickAlbum(found, artist, title) ?? (firstArtist(artist) !== artist ? pickAlbum(found, firstArtist(artist), title) : null);
    return best ? `https://music.youtube.com/browse/${best.id}` : null;
  } catch (e) {
    console.log(`youtube music album search failed for ${artist} – ${title}: ${e instanceof Error ? e.message : e}`);
    return undefined;
  }
}

/** Track links and plays for an album; undefined = not configured or failed (try again later), null = nothing found. */
export async function youtubeMatch(artist: string, title: string): Promise<Match['youtube'] | undefined> {
  if (!key()) return undefined;
  try {
    const albumPage = youtubeAlbum(artist, title);
    const channel = (await topicChannel(artist)) ?? (firstArtist(artist) !== artist ? await topicChannel(firstArtist(artist)) : undefined);
    const url = (await albumPage) ?? null;
    if (!channel) return url ? { url, tracks: [] } : null;
    const { items: found = [] } = await api(`search?part=snippet&type=video&maxResults=50&channelId=${channel}&q=${encodeURIComponent(title)}`);
    if (!found.length) return url ? { url, tracks: [] } : null;
    const { items: stats = [] } = await api(`videos?part=statistics&id=${found.map((i: any) => i.id.videoId).join(',')}`);
    const views = new Map<string, number>(stats.map((v: any) => [v.id, Number(v.statistics?.viewCount ?? 0)]));
    // One entry per title, its most played version (remasters and alternate takes share a title).
    const best = new Map<string, { title: string; url: string; views: number }>();
    for (const i of found) {
      const t = decode(i.snippet.title);
      const v = views.get(i.id.videoId) ?? 0;
      const k = normalizeName(t);
      if ((best.get(k)?.views ?? -1) < v) best.set(k, { title: t, url: `https://music.youtube.com/watch?v=${i.id.videoId}`, views: v });
    }
    return { url, tracks: [...best.values()] };
  } catch (e) {
    console.log(`youtube match failed for ${artist} – ${title}: ${e instanceof Error ? e.message : e}`);
    return undefined;
  }
}
