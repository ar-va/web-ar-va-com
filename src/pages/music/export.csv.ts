// music.ar-va.com/export.csv: the collector's whole shelf as a spreadsheet, the way they set it up here (their edits
// over Discogs' data), from the settings page. Only for the logged-in collector, only their own records.
import type { APIRoute } from 'astro';
import { recordDefaults, recordValues, safeCoverUrl, safeDay, textToTracklist, toCsv, vinylName } from '../../music/lib';
import { canCollect, collectionExport, currentUser, shelfSlug } from '../../music/store';

export const prerender = false;

export const GET: APIRoute = async ({ cookies }) => {
  const user = await currentUser(cookies);
  if (!user || !canCollect(user) || !user.discogs_username) return new Response('Log in as a collector to download your shelf.', { status: 403 });
  const items = await collectionExport(user.id);
  // One column per Discogs collection field anyone of these records has (Purchased, Notes, Gifted by…).
  const fieldNames = [...new Set(items.flatMap((i) => i.record.fields.map((f) => f.name)))];
  const rows = items.map(({ record, detail, match, overrides }) => {
    const v = recordValues(recordDefaults(record, detail, match), overrides);
    const songs = textToTracklist(v.tracklist).filter((t) => !t.heading);
    return {
      added: safeDay(v.added) ?? record.added.slice(0, 10),
      cells: [
        v.artist, v.title, v.released, v.vinylRelease, safeDay(v.added) ?? record.added.slice(0, 10), v.genre, v.style, v.label, v.format, v.country,
        vinylName(v.vinyl), String(songs.length),
        songs.map((t) => [t.position, t.title, t.duration && `(${t.duration})`].filter(Boolean).join(' ')).join('\n'),
        v.favorites.split('\n').filter((x) => x.trim()).join('; '),
        v.note, v.spotify, v.apple, v.youtube, safeCoverUrl(v.cover) ?? record.cover ?? '',
        detail?.uri ?? `https://www.discogs.com/release/${record.releaseId}`,
        ...fieldNames.map((name) => v[`field:${name}`] ?? ''),
      ],
    };
  }).sort((a, b) => b.added.localeCompare(a.added));
  const header = ['Artist', 'Album', 'Released', 'Vinyl release', 'Added on', 'Genre', 'Style', 'Label', 'Format', 'Country', 'Vinyl colour',
    'Tracks', 'Tracklist', 'Favourite tracks', 'Note', 'Spotify', 'Apple Music', 'YouTube Music', 'Cover', 'Discogs', ...fieldNames];
  const name = `${shelfSlug(user).replace(/[^\w-]+/g, '-') || 'shelf'}-records-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(toCsv([header, ...rows.map((r) => r.cells)]), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store' },
  });
};
