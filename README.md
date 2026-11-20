# ar-va.com

One repository for the ARVA sites. Each site is its own Astro project and its own Cloudflare Worker;
what they have in common lives in `shared/`.

| Folder | Site | Cloudflare Worker |
| --- | --- | --- |
| `/` (`src/`) | **ar-va.com**: home, blog (written in Obsidian), and the Telegram login all sites use | `web-ar-va-com` |
| `music/` | **music.ar-va.com**: record shelves from Discogs, comments, invites | `web-music-ar-va-com` |
| `anon/` | **anon.ar-va.com**: anonymous messages, with its own database (see `anon/README.md`) | `web-anon-ar-va-com` |
| `shared/` | Header, footer, layout, styles, logos and favicons (`shared/public`), accounts, sessions and comments (`shared/lib`) | (none; imported as `@shared/…`) |

ar-va.com and music.ar-va.com use the same D1 database (`ar-va-music-na`): one account and one login across the
sites. anon.ar-va.com keeps messages in its own database and only reads the login one, to recognise the admin.

## Working on it

```sh
npm install                 # once, at the top: installs every site (npm workspaces)
npm test                    # tests of shared/lib
npm run build               # ar-va.com
npm run build -w music      # music.ar-va.com (or `npm run build` inside music/)
npm run build -w anon       # anon.ar-va.com
```

Each site deploys by itself when a push changes its folder or `shared/` (Workers Builds).
