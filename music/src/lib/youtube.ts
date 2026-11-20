// YouTube Music track links and plays, server side. First YouTube Music's own search and album pages (unofficial, see
// below; no key, no quota: a page lists every track with its plays). For albums it can't find, the official YouTube
// Data API (YOUTUBE_API_KEY, optional): the API can't see album pages (checked 2026-10-30), but the artist's automatic
// "<Artist> - Topic" channel holds their tracks: find that channel, search it for the album title, and keep each
// title's most played video. That costs 201 of the 10,000 daily quota units per album; a failed call leaves the album
// for a later try.
import { env } from 'cloudflare:workers';
import { artistKey, firstArtist, normalizeName, pickAlbum, playCount, type Match } from '@shared/lib/lib';

const key = () => (env as Record<string, string | undefined>).YOUTUBE_API_KEY;

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

// YouTube Music's internal API, the one its website uses (user's choice, 2026-10-30, knowing it's unofficial and outside
// YouTube's terms): it finds album pages, which the official API can't see, and those pages list every track with its
// play count, so a found album costs no API quota at all. If YouTube changes or blocks it, matching falls back to the
// official API below, and album buttons to a search.
async function music(endpoint: 'search' | 'browse', body: object) {
  const res = await fetch(`https://music.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://music.youtube.com' },
    body: JSON.stringify({ context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20241023.01.00', hl: 'en' } }, ...body }),
  });
  if (!res.ok) throw new Error(`YouTube Music ${endpoint}: ${res.status}`);
  return res.json<any>();
}

/** Every list row in a YouTube Music response: its browse / video id and the text of its columns. */
function rows(data: unknown) {
  const out: { browseId?: string; videoId?: string; cols: string[] }[] = [];
  const walk = (o: any): void => {
    if (!o || typeof o !== 'object') return;
    const r = o.musicResponsiveListItemRenderer;
    if (r) {
      out.push({
        browseId: r.navigationEndpoint?.browseEndpoint?.browseId,
        videoId: r.playlistItemData?.videoId,
        cols: (r.flexColumns ?? []).map((c: any) => (c.musicResponsiveListItemFlexColumnRenderer?.text?.runs ?? []).map((x: any) => x.text).join('')),
      });
    }
    for (const k in o) walk(o[k]);
  };
  walk(data);
  return out;
}


/** The album's YouTube Music page id (MPREb_…): its "Albums" search, best match by artist and title. */
async function findAlbum(artist: string, title: string) {
  const found = rows(await music('search', { query: `${artist} ${title}`, params: 'EgWKAQIYAWoMEA4QChADEAQQCRAF' }))
    .filter((r) => r.browseId?.startsWith('MPREb_'))
    .map((r) => { const [kind, by = ''] = (r.cols[1] ?? '').split(' • '); return { id: r.browseId!, kind, title: r.cols[0] ?? '', artist: by }; })
    .filter((r) => r.kind === 'Album' || r.kind === 'EP');
  return (pickAlbum(found, artist, title) ?? (firstArtist(artist) !== artist ? pickAlbum(found, firstArtist(artist), title) : null))?.id ?? null;
}

/** An album page's tracks: title, YouTube Music link and plays. */
async function albumTracks(browseId: string) {
  return rows(await music('browse', { browseId }))
    .filter((r) => r.videoId && r.cols[0])
    .map((r) => ({ title: r.cols[0], url: `https://music.youtube.com/watch?v=${r.videoId}`, views: playCount(r.cols.find((c) => /plays?\b/i.test(c)) ?? '') }));
}

/**
 * Track links and plays for an album: from its YouTube Music page when that's found (no quota), otherwise from the
 * artist's Topic channel with the official API (201 units). undefined = both failed (try again later), null = nothing
 * found.
 */
export async function youtubeMatch(artist: string, title: string): Promise<Match['youtube'] | undefined> {
  let url: string | null | undefined;
  try {
    const id = await findAlbum(artist, title);
    url = id ? `https://music.youtube.com/browse/${id}` : null;
    const tracks = id ? await albumTracks(id) : [];
    if (tracks.length) return { url, tracks };
  } catch (e) {
    console.log(`youtube music match failed for ${artist} – ${title}: ${e instanceof Error ? e.message : e}`);
  }
  const fallback = await topicMatch(artist, title);
  if (fallback) return { url: url ?? null, tracks: fallback.tracks };
  if (url) return { url, tracks: [] };
  return fallback === null && url === null ? null : undefined;
}

/** The official API's way: the artist's Topic channel, searched for the album title; undefined = not configured or failed. */
async function topicMatch(artist: string, title: string): Promise<{ tracks: { title: string; url: string; views: number }[] } | null | undefined> {
  if (!key()) return undefined;
  try {
    const channel = (await topicChannel(artist)) ?? (firstArtist(artist) !== artist ? await topicChannel(firstArtist(artist)) : undefined);
    if (!channel) return null;
    const { items: found = [] } = await api(`search?part=snippet&type=video&maxResults=50&channelId=${channel}&q=${encodeURIComponent(title)}`);
    if (!found.length) return null;
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
    return { tracks: [...best.values()] };
  } catch (e) {
    console.log(`youtube match failed for ${artist} – ${title}: ${e instanceof Error ? e.message : e}`);
    return undefined;
  }
}
