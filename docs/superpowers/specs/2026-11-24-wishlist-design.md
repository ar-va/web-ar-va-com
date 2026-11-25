# Wishlists on music.ar-va.com: design

2026-11-24. Agreed with the user in conversation; calls marked *(my call)* were not discussed and can be changed.

## Intent

Every collector's shelf gets a wishlist of records they'd like to own on vinyl. Friends and visitors can reserve one
("I'll get this"), so two people don't buy the same gift, and the collector never finds out what's been reserved:
gifts stay a surprise.

## Decisions (user)

- **Reservation privacy, option A:** reserving needs a Telegram login; other visitors see "Reserved"; the shelf owner
  never sees whether anything is reserved, or by whom. The site stores who reserved (so they can undo it).
- **Two kinds of wishlist per collector:**
  - **Discogs**: the collector's Discogs wantlist, synced like the collection.
  - **Custom**: albums added on the site, by pasting a link from a streaming service (the site fills in artist,
    album, cover, tracklist) or by typing.
- **Two separate lists; a switch picks which one is shown.** Both are kept, each with its own reservations; switching
  back restores the other exactly as it was. The same album on both lists is two separate entries.

## Goals

- A visitor can open any collector's wishlist, see what they want (cover, artist, album, year, tracklist, listen
  buttons), and reserve one item in one click after logging in.
- The owner keeps the list current with as little effort as the shelf: Discogs mode needs nothing beyond the Discogs
  app; custom mode is paste a link, check, save.
- Records the owner already has disappear from the wishlist by themselves.

## Non-goals

- Priorities, ordering by hand, prices, shop links, quantities.
- Reserving without logging in (rejected: anyone could reserve a whole list and nobody could undo it).
- Merging the two lists or moving items between them.
- Showing reservations to the admin.

## Anti-goals (a failure even if it works)

- **The owner learns a gift is coming** from the page, a count, a notification or a changed layout.
- A reserver forgets what they promised, or buys a record that was taken off the list in the meantime.
- The wishlist slows the shelf page (it has its own page and its own queries).

## Constraints from the project

- The server never calls Discogs (Cloudflare's shared address is over Discogs' limit): the collector's browser fetches,
  the server signs (`signablePath`) and stores what comes back (`music/src/lib/sync.ts`, `api/discogs.ts`).
- Apple's iTunes API is called from the browser (CORS, no key), paced to one request per 3 s (`itunes()` in sync.ts).
- YouTube Music's internal API is called from the server (`music/src/lib/youtube.ts`).
- Spotify: no API keys are set, so `spotifyMatch` returns nothing; the public `open.spotify.com` album page is the only
  source unless the user adds keys.
- D1, lazy schema in `db()`; new tables go in the `CREATE … IF NOT EXISTS` batch; free-plan read/write limits matter
  (a sync must not rewrite unchanged rows: same rule as `saveCollection`).
- Forms post without script and redirect 303 (comments, notes); Astro `checkOrigin` guards POSTs; JSON endpoints check
  `Origin` themselves.
- Shared components, one pattern one component (memory `modular-components`): `Cover`, `Listen`, `Disclosure`,
  `Notice`, `Breadcrumbs`, `LoginButton`, `.btn-primary`, `.ctl`.

## Approaches (considered for how the two lists relate)

1. **Two separate lists, a switch shows one** — chosen by the user. Nothing lost, no duplicates; an album on both
   lists is two entries with separate reservations.
2. One list converted on switch (Discogs wants become custom entries; switching back replaces them). Rejected: custom
   entries and their reservations would be lost when switching back.

For where link lookups run, one sensible way given the constraints: Apple in the browser (as matching does today),
YouTube Music and Spotify on the server, Apple search in the browser to fill whatever a Spotify / YouTube page lacks.

## Design

### Pages and placement *(my call)*

- New page **`music.ar-va.com/<shelf>/wishlist`** (breadcrumbs: Shelves / owner / Wishlist). Not a section of the
  shelf page: keeps the shelf's queries and layout as they are.
- The shelf's owner card stat line (`Note.astro`) gets a gift icon + count → the wishlist ("12 wishes"), shown when the
  shown list has items, or always to the owner ("Wishlist").
- Route conflict: `/<shelf>/wishlist` vs `/<shelf>/<record>`: records are numeric instance ids, so `[record].astro`
  keeps numbers and a new `wishlist.astro` sits beside it.

### What a visitor sees

Rows like the shelf's list view, newest first: cover (`Cover`), artist, album, year, a headphones `Listen` menu, and the
reserve control. A row folds open (`Disclosure`) to show the tracklist. *(my call: rows, not a grid, since the
reserve button needs room.)*

Reserve control by viewer:
- **Logged out:** "Log in to reserve" (`LoginButton`, returns to the row). **No reserved state is shown to logged-out
  visitors** *(my call)*: otherwise the owner would see "Reserved" simply by visiting while logged out.
- **Logged in, not the owner:** "Reserve" (primary) → "Reserved by you · Cancel"; someone else's reservation →
  "Reserved" (disabled).
- **The owner:** no reserve control and no reserved state, ever; instead Edit / Remove on custom items.

The page HTML for the owner must not contain reservation data at all (not hidden by CSS: absent).

### What the owner sees and does

- A switch at the top: **Discogs wantlist / My own list** (`aria-pressed` pair, `.ctl`). Discogs is disabled with
  "Connect Discogs first" (→ settings) while not connected. Stored as `users.wishlist_source` (`'discogs'` |
  `'custom'`, default `'custom'`; a `COLUMNS` ALTER).
- Discogs mode: a line "From your Discogs wantlist · add albums in the Discogs app" and the last sync time; the existing
  "Update from Discogs" also syncs the wantlist.
- Custom mode: an "Add an album" box: one field "Paste a link from Apple Music, Spotify or YouTube Music" + "or type
  it in". Pasting fills artist, album, year, cover and tracklist for review; the owner can edit any field, then Save.
  Without script the box is a plain form with typed fields (the link, if given, is kept as that service's listen link).
- Each custom item: Edit (same form, `?edit=<id>` server-rendered like the note editor) and Remove.
- An optional short note per item, ≤ 280 characters ("the red pressing, please") *(my call; custom items only;
  Discogs want notes are not shown, since Discogs keeps them private)*.
- Limits *(my call)*: 200 custom items per owner; Discogs wants capped at 10,000 like the collection.

### Link lookups (custom mode)

`parseStreamingLink(url)` in `shared/lib/lib.ts` (pure, tested) → `{service, kind, id, country?}` for:
- Apple Music `music.apple.com/<cc>/album/<slug>/<id>` (the regex `rematch` already uses).
- Spotify `open.spotify.com/(intl-xx/)album/<id>`.
- YouTube Music `music.youtube.com/browse/MPREb_…` and `music.youtube.com/playlist?list=OLAK5uy_…` (album playlists);
  plain `youtube.com/playlist?list=OLAK5uy_…` too.
Anything else → "That link isn't an album on Apple Music, Spotify or YouTube Music."

Flow (browser script on the wishlist page):
- **Apple:** `appleAlbum(id, country)` (sync.ts, exported) → artist, album, artwork, tracks, Apple link. Needs the
  collection's artist name, which `appleAlbum` doesn't return yet: add `artist`, `title`, `year` to its result.
- **Spotify / YouTube Music:** `POST /api/wishlist {action: 'lookup', url}` → the server reads
  - YouTube Music: `music('browse', {browseId})` (an `OLAK5uy_` list → `VL<list>`), header gives title / artist / year,
    rows give tracks (`albumTracks`); cover from the header thumbnail (`lh3.googleusercontent.com` / `i.ytimg.com`).
  - Spotify: the album page's `og:title` (album), `og:description` ("Artist · Album · 2016 · 7 songs"), `og:image`
    (`i.scdn.co`). **Unverified:** whether open.spotify.com answers a Worker with these tags. If not, fall back to
    `open.spotify.com/oembed` (title + thumbnail only) and ask the owner to type the artist. If keys are ever set, the
    Web API's album endpoint replaces both.
  - Whatever is still missing (tracklist, cover) → browser `appleMatch(artist, title)` fills it.
- Cover hosts allowed: extend `safeCoverUrl` with `i.scdn.co`, `lh3.googleusercontent.com`, `i.ytimg.com` (exact
  hosts, https only). Streaming links pass `safeStreamingUrl`.
- The filled form is posted like any form; the server re-validates every field (`toWish()`: text caps as
  `toReleaseDetail`, ≤ 300 tracks, hosts as above). The lookup result is never trusted as-is.

### Discogs mode

- `signablePath` also allows `/users/<own>/wants` (pagination via query string).
- `syncShelf` fetches the wantlist pages after the collection (`per_page=100`) and posts `{action: 'wants', wants}`.
- `saveWants(user, items)` in discogs.ts: maps each with `toShelfRecord(item, [])` (same `basic_information` shape;
  `instanceId` = the release id), compares with stored rows and only writes when something changed (like
  `saveCollection`), replaces table `wants(user_id, release_id, data, PRIMARY KEY (user_id, release_id))`.
- Tracklists: `missingReleases` / `saveRelease` also accept releases on the user's wantlist, so the existing details
  loop fills them (shared `releases` cache). Streaming matches the same way (`unmatchedReleases` includes wants).
- Ran on the same schedule as the collection (manual update, after connecting, `autoSync` every 30 min).

### Already owned

An item is hidden from the wishlist (both kinds) when the owner's shelf has the same master (or, without a master, the
same release; custom items: same `normalizeName(artist)` + `normalizeName(title)` as a shelf record) *(my call: any
pressing counts)*. Hidden, not deleted: the reservation rules below decide what happens.

### Reservations

- Table `reservations(owner_id, item TEXT, user_id, created_at, PRIMARY KEY (owner_id, item))`; `item` = `d:<release id>`
  (Discogs) or `c:<wish id>` (custom). One reservation per item; `INSERT … ON CONFLICT DO NOTHING` decides races.
- `POST /<shelf>/wishlist` form actions `reserve` / `unreserve` (logged in; not the owner; the item must be on the
  currently shown list and not owned), 303 back to `#wish-<item>`. Cap: 20 active reservations per person *(my call)*.
- **When an item goes away** (removed by the owner, dropped from the Discogs wantlist on sync, or now on the shelf):
  the reservation is deleted and the reserver gets a Telegram message through `notify()` *(my call)*:
  - now on the shelf: "Artur now has *Blackstar* on the shelf, so your reservation is gone." (it may be their gift)
  - removed: "Artur took *Blackstar* off the wishlist, so your reservation is gone. If you already bought it, …"
  These messages go only to the reserver; the owner is never told anything about reservations.
  Detection for Discogs: in `saveWants` / `saveCollection`, before replacing rows, find reservations whose item is gone.
- Switching lists doesn't touch reservations; the hidden list's reservations just aren't shown.
- When a shelf is removed (`removeShelf`), its wants, wishes and reservations go too (no notifications). When the
  owner connects a different Discogs account (`setUsername` already clears `records` then), `wants` is cleared too.
- **Settings, "Gifts you’ve reserved"** *(my call)*: the logged-in person's reservations across shelves (cover, album,
  whose list, Cancel), so a promise isn't forgotten. Shown only when there are any.

### Data

- `wishes(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id, data TEXT, created_at)`: `data` = `{artist, title, year,
  cover, tracklist (the edit page's "A1 | Title | 4:52 | urls" text), links: {spotify, apple, youtube}, note}`.
- `wants` and `reservations` as above; `users.wishlist_source`.
- `wishlistData(name, viewer)` in store.ts: one batch (owner, shown list, shelf masters/titles for "owned", details,
  matches, reservations **only when viewer is logged in and isn't the owner**).

### Tests

- `parseStreamingLink`: each service's album link forms, track / artist / playlist links refused, foreign hosts refused.
- `toWish`: caps, bad hosts dropped, script in text stays text.
- Owned-matching rule (master, release, normalized names).
- The visibility rule as a pure function `reserveState(item, reservation, viewer, ownerId)` → `none | login | free |
  mine | taken`; the owner always gets `none`.
- On preview: owner page HTML contains no "Reserved"; reserve / cancel / race (second reserve refused); removal sends a
  notification attempt (401 with the fake local token); switch keeps both lists; Discogs wants via the browser harness.

## Left to the builder

Exact copy and layout within the existing look (rows like the shelf's list view, `.ctl` / `.btn-primary`, Kikyō for
actions), the Spotify page parsing details once probed from a Worker, and the YouTube header field paths.
