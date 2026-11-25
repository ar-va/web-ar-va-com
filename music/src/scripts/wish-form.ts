// The wishlist's one-line "add an album" box: a pasted album link fills in the fields; typed words show Apple Music's
// albums for them (picking one fills everything); a typed "Artist – Album" fills the two fields as it is. Apple Music is asked from the browser (as
// all Apple lookups are), Spotify and YouTube Music through the site (api/wishlist.ts); whatever a page lacks (cover,
// tracks) is then looked for on Apple Music by name. The owner checks the fields and saves.
import { parseStreamingLink, splitArtistAlbum, type AlbumLookup } from '@shared/lib/wishlist';
import { normalizeName } from '@shared/lib/lib';
import { appleAlbums, appleLookup, appleSearch } from '../lib/sync';

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
  /** The album behind a link: Apple in the browser, Spotify / YouTube Music through the site, gaps filled from Apple. */
  const loadAlbum = async (parsed: NonNullable<ReturnType<typeof parseStreamingLink>>, url: string) => {
    if (parsed.service === 'apple') {
      const album = await appleLookup(parsed.id, parsed.country);
      if (!album) throw new Error('Apple Music doesn’t have that album in this country’s store.');
      fill(fromApple(album));
      return;
    }
    const res = await fetch('/api/wishlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'lookup', url }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `The site answered ${res.status}.`);
    fill(data);
    // A cover or tracklist the page didn't give: Apple Music by name (only into empty fields).
    if (!field('cover').value || !field('tracklist').value) {
      const apple = await appleSearch(field('artist').value, field('title').value).catch(() => null);
      if (apple) fill(fromApple(apple), true);
    }
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
      await loadAlbum(parsed, url);
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
  // Suggestions: Apple Music's albums for the typed words, after a pause in typing; ↑ ↓ to move, Enter to pick, Esc.
  const list = form.querySelector<HTMLUListElement>('[data-wish-suggest]');
  type Found = { service: 'apple' | 'youtube' | 'spotify'; id?: string; url?: string; title: string; artist: string; year: number | null; artwork: string | null };
  const SERVICE = { apple: 'Apple Music', youtube: 'YouTube Music', spotify: 'Spotify' };
  let found: Found[] = [];
  // Apple's, YouTube Music's and Spotify's (with the site's keys) results taken in turn, each album once (Apple's
  // first: it gives the most), at most 8.
  const merge = (lists: Found[][]) => {
    const seen = new Set<string>(), out: Found[] = [];
    for (let i = 0; out.length < 8 && lists.some((l) => l[i]); i++) {
      for (const a of lists.map((l) => l[i]).filter(Boolean)) {
        const key = `${normalizeName(a.artist)}|${normalizeName(a.title)}`;
        if (!seen.has(key) && out.length < 8) { seen.add(key); out.push(a); }
      }
    }
    return out;
  };
  let active = -1, timer = 0, pending: AbortController | null = null;
  const options = () => [...(list?.children ?? [])] as HTMLElement[];
  const setActive = (i: number) => {
    active = i;
    options().forEach((o, j) => o.setAttribute('aria-selected', String(j === i)));
    if (i >= 0) { link?.setAttribute('aria-activedescendant', options()[i].id); options()[i].scrollIntoView({ block: 'nearest' }); }
    else link?.removeAttribute('aria-activedescendant');
  };
  const close = () => { if (list) list.hidden = true; link?.setAttribute('aria-expanded', 'false'); setActive(-1); };
  const render = () => {
    if (!list) return;
    list.replaceChildren(...found.map((a, i) => {
      const li = document.createElement('li');
      li.id = `wish-opt-${i}`;
      li.setAttribute('role', 'option');
      li.className = 'flex items-center gap-3 rounded-2xl px-2.5 py-2 cursor-pointer text-sm text-zinc-800 dark:text-zinc-200 hover:bg-zinc-900/5 dark:hover:bg-white/10 aria-selected:bg-(--on-bg) aria-selected:text-(--on-text)';
      const img = document.createElement('img');
      img.alt = ''; img.width = 40; img.height = 40; img.referrerPolicy = 'no-referrer';
      img.className = 'w-10 h-10 shrink-0 rounded-md object-cover bg-zinc-200 dark:bg-zinc-800';
      if (a.artwork) img.src = a.artwork;
      const text = document.createElement('span');
      text.className = 'min-w-0';
      const title = document.createElement('span'); title.className = 'block truncate font-medium'; title.textContent = a.title;
      const by = document.createElement('span'); by.className = 'block truncate text-xs opacity-70'; by.textContent = [a.artist, a.year].filter(Boolean).join(', ');
      text.append(title, by);
      text.classList.add('flex-1');
      const from = document.createElement('span'); from.className = 'shrink-0 text-xs opacity-60'; from.textContent = SERVICE[a.service];
      li.append(img, text, from);
      // mousedown: picked before the box loses focus (which closes the list).
      li.addEventListener('mousedown', (e) => { e.preventDefault(); pick(i); });
      return li;
    }));
    list.hidden = !found.length;
    link?.setAttribute('aria-expanded', String(!!found.length));
    setActive(-1);
  };
  const pick = async (i: number) => {
    const a = found[i];
    if (!a || !link) return;
    close();
    link.value = `${a.artist} – ${a.title}`;
    status.textContent = 'Looking it up…';
    try {
      if (a.service === 'apple') {
        const album = await appleLookup(a.id!);
        if (!album) throw new Error('Apple Music didn’t give that album’s details.');
        fill(fromApple(album));
      } else await loadAlbum(parseStreamingLink(a.url!)!, a.url!);
      status.textContent = 'Found it. Check the details and add it.';
    } catch (e) {
      fill({ artist: a.artist, title: a.title, year: a.year ? String(a.year) : '', cover: a.artwork?.replace(/\d+x\d+bb/, '600x600bb') ?? '' });
      status.textContent = `${e instanceof Error ? e.message : 'Something went wrong.'} The album is filled in; add the rest if you like.`;
    }
  };
  link?.addEventListener('input', () => {
    clearTimeout(timer);
    pending?.abort();
    const text = link.value.trim();
    if (text.length < 3 || /^https?:\/\//i.test(text)) { found = []; render(); return; }
    timer = window.setTimeout(async () => {
      const ask = pending = new AbortController();
      const [apple, site] = await Promise.allSettled([
        appleAlbums(text, ask.signal),
        fetch('/api/wishlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'search', term: text }), signal: ask.signal })
          .then((r) => (r.ok ? r.json() : { youtube: [], spotify: [] })),
      ]);
      // More typing since: these results are stale. A service that failed adds nothing.
      if (ask.signal.aborted) return;
      const ok = <T>(r: PromiseSettledResult<T>, fallback: T) => (r.status === 'fulfilled' ? r.value : fallback);
      const others = ok(site, { youtube: [], spotify: [] });
      found = merge([
        ok(apple, []).map((x) => ({ ...x, service: 'apple' as const })),
        (others.youtube ?? []).map((x: Omit<Found, 'service'>) => ({ ...x, service: 'youtube' as const })),
        (others.spotify ?? []).map((x: Omit<Found, 'service'>) => ({ ...x, service: 'spotify' as const })),
      ]);
      render();
    }, 400);
  });
  link?.addEventListener('keydown', (e) => {
    if (!list || list.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((active + 1) % found.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active <= 0 ? found.length - 1 : active - 1); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); e.stopImmediatePropagation(); pick(active); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  link?.addEventListener('blur', close);
  // Clear (adding) / Reset (editing): the browser puts every field back; the cover preview, message, list and the
  // open state follow (an edit stays open).
  // Shops: + adds a line (up to the form's limit), − removes one (the last one left is just emptied).
  const shops = form.querySelector<HTMLElement>('[data-shops]');
  const shopTemplate = form.querySelector<HTMLTemplateElement>('[data-shop-template]');
  const addShop = form.querySelector<HTMLButtonElement>('[data-shop-add]');
  const shopCount = () => shops?.querySelectorAll('[data-shop]').length ?? 0;
  const syncShops = () => { if (addShop) addShop.hidden = shopCount() >= Number(shops?.dataset.max ?? 5); };
  addShop?.addEventListener('click', () => {
    if (!shops || !shopTemplate || shopCount() >= Number(shops.dataset.max ?? 5)) return;
    shops.append(shopTemplate.content.cloneNode(true));
    shops.querySelector<HTMLInputElement>('[data-shop]:last-child input')?.focus();
    syncShops();
  });
  shops?.addEventListener('click', (e) => {
    const line = (e.target as Element).closest('[data-shop-remove]')?.closest<HTMLElement>('[data-shop]');
    if (!line) return;
    if (shopCount() > 1) { line.remove(); addShop?.focus(); } else { line.querySelector('input')!.value = ''; line.querySelector('input')!.focus(); }
    syncShops();
  });
  syncShops();
  // A hidden field's value is its default (a reset can't put it back): the cover is restored by hand.
  const startCover = field('cover').value;
  form.addEventListener('reset', () => setTimeout(() => {
    field('cover').value = startCover;
    preview.hidden = !field('cover').value;
    if (field('cover').value) preview.src = field('cover').value;
    status.textContent = '';
    asked = '';
    found = []; render();
    if (link) { form.classList.remove('open'); link.focus(); }
  }));
  link?.addEventListener('change', look);
  link?.addEventListener('paste', () => setTimeout(look, 0));
  // Enter on a link looks it up (rather than adding a half-filled album); on typed text it adds it.
  link?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && parseStreamingLink(link.value)) { e.preventDefault(); look(); } });
}
