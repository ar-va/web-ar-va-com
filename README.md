# ar-va.com

One repository for the ARVA sites. Each site is its own Astro project and its own Cloudflare Worker;
what they have in common lives in `shared/`.

| Folder | Site | Cloudflare Worker |
| --- | --- | --- |
| `/` (`src/`) | **ar-va.com**: home, blog (written in Obsidian), and the Telegram login all sites use | `web-ar-va-com` |
| `music/` | **music.ar-va.com**: record shelves from Discogs, comments, invites | `web-music-ar-va-com` |
| `shared/` | Header, footer, layout, styles, logos and favicons (`shared/public`), accounts, sessions and comments (`shared/lib`) | (none; imported as `@shared/…`) |

Both Workers use the same D1 database (`ar-va-music-na`): one account and one login across the sites.

## Working on it

```sh
npm install                 # once, at the top: installs every site (npm workspaces)
npm test                    # tests of shared/lib
npm run build               # ar-va.com
npm run build -w music      # music.ar-va.com (or `npm run build` inside music/)
```

Each site deploys by itself when a push changes its folder or `shared/` (Workers Builds).
