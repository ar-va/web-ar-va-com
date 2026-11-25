// The wishlist's one-line "add an album" box: a pasted album link fills in the fields, typed "Artist – Album" too. Apple Music is asked from the browser (as
// all Apple lookups are), Spotify and YouTube Music through the site (api/wishlist.ts); whatever a page lacks (cover,
// tracks) is then looked for on Apple Music by name. The owner checks the fields and saves.
import { parseStreamingLink, splitArtistAlbum, type AlbumLookup } from '@shared/lib/wishlist';
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
    form.classList.add('open');
  };
  let asked = '';
  const look = async () => {
    const url = link!.value.trim();
    if (!url || url === asked) return;
    asked = url;
    const parsed = parseStreamingLink(url);
    if (!parsed) {
      if (/^https?:\/\//i.test(url)) status.textContent = 'That link isn’t an album on Apple Music, Spotify or YouTube Music. Type the artist and album below.';
      return;
    }
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
  // Typing "Artist – Album" (not a link) fills the two fields as you go.
  link?.addEventListener('input', () => {
    const text = link.value.trim();
    if (!text || /^https?:\/\//i.test(text)) return;
    const { artist, title } = splitArtistAlbum(text);
    field('artist').value = artist;
    field('title').value = title;
    status.textContent = '';
  });
  // Anything filled in keeps the form open when focus moves away.
  form.addEventListener('input', () => { if ([...form.querySelectorAll<HTMLInputElement>('input:not([type=hidden]):not([type=checkbox]), textarea')].some((f) => f.value.trim())) form.classList.add('open'); });
  link?.addEventListener('change', look);
  link?.addEventListener('paste', () => setTimeout(look, 0));
  // Enter on a link looks it up (rather than adding a half-filled album); on typed text it adds it.
  link?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && parseStreamingLink(link.value)) { e.preventDefault(); look(); } });
}
