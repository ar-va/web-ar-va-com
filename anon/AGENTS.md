# anon.ar-va.com

Anonymous messages to Artur, in the spirit of ask.fm: anyone writes with no name and no account, may ask for the
message to be public, and gets a private link to come back for the answer. Artur approves what goes public and
answers underneath. Astro 7 + Tailwind 4 on one Cloudflare Worker (`anon-ar-va-com`) with D1. Design: ar-va.com /
music.ar-va.com (ARVA brand, see `../ar-va.com/brand/ARVA-brand-rules.md`); the post card follows Solaris'
`PostCard.tsx` (`../solaris/app/src/features/feed/`).

**Page design and wording follow [`docs/trust-principles.md`](docs/trust-principles.md)** (research on disclosure,
trust and dark patterns, 2026-11-17). Read it before changing the front page; its "Never add" list is binding.

**GitHub:** `ar-va/web-anon-ar-va-com` (public, so anyone can check the code; the page links to it). Commit as
`ARVA <github@ar-va.com>` (local git config) with **no Claude co-author lines** (user, 2026-11-17).

## Anonymity rules (keep them when changing anything)

- The sending path (`POST /` in `src/pages/index.astro`) reads **no cookies and no browser details**. The connection's
  address goes only to the `SEND_LIMIT` rate-limit binding (in memory at Cloudflare, 5 a minute) and is never stored.
- A message row is: text, dates, flags and `ticket` = SHA-256 of the private link's secret. The secret itself exists
  only in the sender's address bar. **No contact details at all** (user, 2026-11-17): an email option was built, then
  removed (Cloudflare Email Sending needs Workers Paid; Resend's dashboard would show the admin who got an email and
  when, enough to match an address to the message just answered). Senders come back to their private link.
  The live table still has an unused, empty `contact` column from the first deploy.
- Visitors logged in on music.ar-va.com send the `__Secure-session` and `who` cookies here too (Domain=ar-va.com).
  Only `currentAdmin()` reads the session cookie, compares it with the admin, and keeps nothing.
- Workers invocation logs are off (`observability.logs.invocation_logs: false`); code never logs addresses or text.
- Public pages show the date only, never the time a message was sent. Private pages: `no-store`, `noindex`, and
  `<meta name="referrer" content="no-referrer">` site-wide so the secret never leaks in a Referer.
- The admin can't edit a sender's words: only publish (if they asked), unpublish, answer, delete.

## How it works

| Path | What |
| --- | --- |
| `/` | Hero + writing form (`POST /` sends: honeypot `website`, rate limit, hourly ceiling of 120), then published messages with answers (20 a page), then "How anonymous is this?" |
| `/m/<token>` | Sender's private page: answers, make private / ask to be public, delete. |
| `/p/<id>` | One published message (share link). |
| `/admin` | Inbox (All / Unanswered / Asks to be public / Published, "N new"). POST actions: publish, unpublish, delete, reply, edit-reply, delete-reply. Answers on public messages are public. |
| `src/lib/core.ts` | Pure helpers (tokens, sha256, text cleaning, dates); tested by `npm test`. |
| `src/lib/store.ts` | D1 schema (created lazily, no migrations) and queries. |
| `src/lib/admin.ts` | Admin check against ar-va.com's D1 (`AUTH` binding: `sessions` + `users`, read only). |
| `src/lib/notify.ts` | Telegram ping to the admin when a message arrives. |
| `src/components/Post.astro` | The post card (public / owner / admin views); behaviour in `src/scripts/post.ts`. |

Admin login: `/admin` sends you to `https://ar-va.com/login?return=…` (Telegram); the session cookie is shared.

## Commands

```sh
npm test               # unit tests of src/lib/core.ts
npm run build          # Worker bundle in dist/
npx astro preview --port 4330   # local Worker (local D1 in .wrangler/state)
npm run generate-types # after changing wrangler.jsonc
```

Local admin: insert a `users` row (id = ADMIN_TELEGRAM_ID) and a `sessions` row (id = sha256 of a token) into the
local `ar-va-music-na`, then send `Cookie: __Secure-session=<token>`.

## Deploy

First deployed by the user 2026-11-17 (`wrangler deploy`, which created D1 `ar-va-anon`, id pinned in wrangler.jsonc,
and the anon.ar-va.com custom domain). Secrets set: `TELEGRAM_BOT_TOKEN`, and `EMAIL_KEY` (unused since email was
removed; `npx wrangler secret delete EMAIL_KEY`). Deploy: `npm run build && npx wrangler deploy`,
or (once connected) a push to `main` through Cloudflare Workers Builds: dashboard → Workers → anon-ar-va-com →
Settings → Builds → Connect the GitHub repo, build command `npm run build`, deploy command `npx wrangler deploy`.
