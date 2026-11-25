// The wishlist's "Add an album" form: a pasted album link fills in the fields. Apple Music is asked from the browser (as
// all Apple lookups are), Spotify and YouTube Music through the site (api/wishlist.ts); whatever a page lacks (cover,
// tracks) is then looked for on Apple Music by name. The owner checks the fields and saves.
import { parseStreamingLink, type AlbumLookup } from '@shared/lib/wishlist';
import { appleLookup, appleSearch } from '../lib/sync';

type Values = { artist: string; title: string; year: string; cover: string; tracklist: string; links: Record<string, string> };

const fromApple = (a: AlbumLookup): Values => ({
  artist: a.artist, title: a.title, year: a.year ? String(a.year) : '', cover: a.cover ?? '', links: { apple: a.link },
  tracklist: a.tracks.map((t, i) => [i + 1, t.title, t.duration, t.url].filter(Boolean).join(' | ')).join('\n'),
});

for (const form of document.querySelectorAll<HTMLFormElement>('[data-wish-form]')) {
  const link = form.querySelector<HTMLInputElement>('[data-wish-link]');
  const status = form.querySelector<HTMLElement>('[data-wish-status]')!;
  const preview = form.querySelector<HTMLImageElement>('[data-wish-cover-preview]')!;
  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement;
  const fill = (v: Partial<Values>, onlyEmpty = false) => {
    for (const key of ['artist', 'title', 'year', 'cover', 'tracklist'] as const) {
      if (v[key] && !(onlyEmpty && field(key).value)) field(key).value = v[key]!;
    }
    for (const [service, url] of Object.entries(v.links ?? {})) if (url && !(onlyEmpty && field(service).value)) field(service).value = url;
    preview.hidden = !field('cover').value;
    if (field('cover').value) preview.src = field('cover').value;
  };
  let asked = '';
  const look = async () => {
    const url = link!.value.trim();
    if (!url || url === asked) return;
    asked = url;
    const parsed = parseStreamingLink(url);
    if (!parsed) { status.textContent = 'That link isn’t an album on Apple Music, Spotify or YouTube Music. You can type the album in below.'; return; }
    status.textContent = 'Looking it up…';
    try {
      if (parsed.service === 'apple') {
        const album = await appleLookup(parsed.id, parsed.country);
        if (!album) throw new Error('Apple Music doesn’t have that album in this country’s store.');
        fill(fromApple(album));
      } else {
        const res = await fetch('/api/wishlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'lookup', url }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `The site answered ${res.status}.`);
        fill(data);
        // A cover or tracklist the page didn't give: Apple Music by name (only into empty fields).
        if (!field('cover').value || !field('tracklist').value) {
          const apple = await appleSearch(field('artist').value, field('title').value).catch(() => null);
          if (apple) fill(fromApple(apple), true);
        }
      }
      status.textContent = 'Found it. Check the details and add it.';
    } catch (e) {
      asked = '';
      status.textContent = `${e instanceof Error ? e.message : 'Something went wrong.'} You can type the album in below.`;
    }
  };
  link?.addEventListener('change', look);
  link?.addEventListener('paste', () => setTimeout(look, 0));
  // Enter in the link field looks it up instead of submitting the half-empty form.
  link?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); look(); } });
}
