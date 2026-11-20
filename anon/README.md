# anon.ar-va.com

The code behind [anon.ar-va.com](https://anon.ar-va.com): a place to write to Artur with no name and no account.
Writers can ask for their message to be public; it appears only after he has read it, word for word, with his answer.

This folder (`anon/` in the public repository [ar-va/ar-va.com](https://github.com/ar-va/ar-va.com)) is public so
anyone can check what the site does with a message. Cloudflare builds and deploys the site from this folder, so the
code here is the code that runs. Until 2026-11-20 it was its own repository, `ar-va/web-anon-ar-va-com` (archived).

## What the site stores

For each message: the text, the date, whether its writer asked to make it public, and the SHA-256 hash of the secret in
the writer's private link. No name, email, account, IP address, browser or device details. The sending code is in
[`src/pages/index.astro`](src/pages/index.astro) and the database queries in [`src/lib/store.ts`](src/lib/store.ts).

The design and wording follow [`docs/trust-principles.md`](docs/trust-principles.md).

## Running it

Astro 7 on a Cloudflare Worker with D1.

```sh
npm install     # at the top of the repository (npm workspaces)
cd anon
npm test        # unit tests
npm run build
npx astro preview --port 4330
```

`.dev.vars.example` lists the one secret (`TELEGRAM_BOT_TOKEN`, for the new-message ping to the admin).
