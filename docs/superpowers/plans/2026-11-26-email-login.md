# Email login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People log in with a 6-digit code sent by email (beside Telegram) and get every site message by email.

**Architecture:** Email accounts are `users` rows with negative ids and an `email`; Telegram accounts don't change. ar-va.com's login page gains an email step (Turnstile-protected) that sends a code through Resend and starts the same session as Telegram. `notify()` routes a negative id to an email built from the same message (link buttons kept, bot-only buttons dropped; each message already carries a link to its page).

**Tech Stack:** Astro 7 on Cloudflare Workers, D1, Resend HTTP API (`POST https://api.resend.com/emails`, Bearer key), Cloudflare Turnstile (`https://challenges.cloudflare.com/turnstile/v0/siteverify`), Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-26-email-login-design.md`

## Global Constraints

- Free services only: Resend free (100 emails a day, 3,000 a month), Turnstile free.
- Codes: 6 digits, stored only as SHA-256, valid 10 minutes, one use, 5 wrong tries void it, at most 3 sent per address per 15 minutes.
- Email accounts: negative ids (-1, -2, …), `users.email` unique and lower-cased, `users.email_messages` default 1; name typed by the person (1–64 characters), no photo, no username.
- Sender `ARVA Music <music@ar-va.com>`; every email has HTML and plain text; message emails end with why it was sent and a link to turn messages off (settings); login codes are always sent.
- Without `RESEND_API_KEY` (local runs) an email is logged, not sent, and counts as sent. Locally Turnstile uses its published test keys (site `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`).
- Telegram accounts and Telegram messages: unchanged. The admin stays on Telegram.
- Field placeholders describe the field, never sample values. Commits as `ARVA <github@ar-va.com>`, no Co-Authored-By trailer; never push.

## Review Focus

- A Telegram user reserving on an email account's wishlist: the bot's buttons carry the owner's negative id (`gift:-5:d:1`); `api/telegram.ts` must still accept them. Test in Task 4 (webhook post on preview).
- The same address typed with different case or spaces ("  David@Example.com "): one account, one code. Test in Task 1 (`normalizeEmail`).
- A code request flood for one address or many: 4th request in 15 minutes refused without sending; no Turnstile token refused. Test in Task 3 (preview).
- Message text with `<`, `&`, quotes, or a `javascript:` link in a comment: escaped / not linked in the email. Test in Task 1 (`toEmail`).
- An email account with messages turned off: no email for comments or reservations, but login codes still arrive. Test in Task 2 / 3 (preview logs).

---

### Task 1: Pure helpers

**Files:**
- Modify: `shared/lib/lib.ts`
- Test: `shared/tests/lib.test.js`

**Interfaces:**
- Produces:
  - `normalizeEmail(s: unknown): string | null`: trimmed, lower-cased; null unless one `@`, a dot in the domain, no spaces, ≤ 254 characters.
  - `newLoginCode(): string`: 6 digits, uniform (crypto.getRandomValues with rejection of the biased top range).
  - `toEmail(m: { text: string; buttons?: { text: string; url?: string }[][]; photo?: string | null }, settingsUrl: string | null): { subject: string; html: string; text: string }`: input is the Telegram HTML subset (`<b>`, `<i>`, `<a href>`, `<blockquote …>`, `\n`); subject = the first sentence without tags (up to `. `, `:`, `?`, or a line break), ≤ 80 characters; html = the text with `\n` → `<br>`, `blockquote expandable` → plain `blockquote`, the photo as an `<img>` (only https), then each url button as a link button (buttons without `url` dropped), then the footer when `settingsUrl` is given; text = the same without tags, links written "label: url", entities decoded.

- [ ] **Step 1: Failing tests** `'normalizeEmail'`: `'  David@Example.COM '` → `'david@example.com'`; `'a@b'`, `'a b@c.d'`, `'@c.d'`, `'a@@c.d'`, 300 characters, `42` → null. `'newLoginCode'`: 200 calls all match `/^\d{6}$/`, more than 150 distinct. `'toEmail'`: `{ text: '<b>Maya</b> commented on <b>Blackstar &amp; co</b>:\n\nNice &lt;i&gt;\n\n<a href="https://music.ar-va.com/a/1#comment-5">Open the comment</a>', buttons: [[{ text: 'Open', url: 'https://music.ar-va.com/a/1' }, { text: 'I gave it', callback_data: 'gift:1:d:2' }]] }` → subject `'Maya commented on Blackstar & co'`; html contains `Nice &lt;i&gt;`, `href="https://music.ar-va.com/a/1"` and not `I gave it`; text contains `Open the comment: https://music.ar-va.com/a/1#comment-5` and `Nice <i>`; with a settings url the footer link is present, with null it isn't; a `photo: 'http://x/y.jpg'` is left out, `'https://i.discogs.com/y.jpg'` appears as an img.
- [ ] **Step 2: Run** `npm test` → the three fail (not functions).
- [ ] **Step 3: Implement** the three in lib.ts (escaping with the existing `escapeHtml`; links in the input are already escaped HTML from our own code).
- [ ] **Step 4: Run** `npm test` → all pass.
- [ ] **Step 5: Commit** "Email helpers: normalizeEmail, newLoginCode, toEmail".

### Task 2: Accounts, codes and sending

**Files:**
- Modify: `shared/lib/store.ts` (SCHEMA, COLUMNS, `db()`, new functions), `shared/lib/notify.ts`
- Modify: `wrangler.jsonc`, `music/wrangler.jsonc` (var `TURNSTILE_SITE_KEY` on the root one only), `.dev.vars.example`, `music/.dev.vars.example` (`RESEND_API_KEY`, `TURNSTILE_SECRET` root only)

**Interfaces:**
- Consumes: `normalizeEmail`, `newLoginCode`, `toEmail` (Task 1).
- Produces:
  - Schema: `users.email TEXT`, `users.email_messages INTEGER NOT NULL DEFAULT 1` (in the definition and as ALTERs), unique index `users_email ON users (email)`, table `email_codes (email TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0, window_at INTEGER NOT NULL, sends INTEGER NOT NULL)`. `COLUMNS` entries may be a list run in order (the email ALTER, then the index); entries still run in parallel with each other.
  - `User` gains `email: string | null; email_messages: number`.
  - `requestLoginCode(email: string): Promise<'sent' | 'wait'>`: refuses after 3 sends in the current 15-minute window, else stores the new code's hash (10 minutes, tries 0) and emails it (subject "`<code>` is your ar-va.com code").
  - `checkLoginCode(email: string, code: string): Promise<'ok' | 'wrong' | 'expired'>`: deletes the row on 'ok' and when tries reach 5 or it expired.
  - `emailAccount(email: string, name: string | null): Promise<{ user: User; isNew: boolean }>`: finds by email, else inserts with id `(SELECT COALESCE(MIN(id), 0) - 1 FROM users WHERE id < 0)` and the name (or the address's part before `@` when null), one retry on an id clash.
  - `setName(user: User, name: string): Promise<string | null>` (error message or null; 1–64 characters after trimming), `setEmailMessages(user: User, on: boolean)`.
  - `sendEmail(to: string, mail: { subject: string; html: string; text: string }): Promise<boolean>` in notify.ts (Resend; no key → `console.log` the mail, true; a refusal logged, false; a `shortcut:` comment on the shared 100-a-day limit and when to upgrade).
  - `notify()` same signature; messages to negative ids: one `SELECT id, email, email_messages FROM users WHERE id IN (…)` (env.DB), then `sendEmail(email, toEmail(m, 'https://music.ar-va.com/settings#account'))` unless `email_messages` is 0 (then false). Positive ids: Telegram as now.

- [ ] **Step 1:** Schema pieces and `db()`'s ordered COLUMNS group.
- [ ] **Step 2:** The store functions and `sendEmail` / `notify` routing.
- [ ] **Step 3: Run** `npm test` and both builds → pass.
- [ ] **Step 4: Verify on preview** (music, throwaway page calling the functions, deleted after): a fresh local DB and the existing one both get the columns and the index; `emailAccount('david@example.com', 'David')` → id -1, again → same row; a second → -2; `notify` to -1 logs an email with subject and footer; with `email_messages = 0` nothing is logged and it returns false; to 42 still goes to Telegram (401 with the fake token).
- [ ] **Step 5: Commit** "Email accounts (negative ids), login codes, notify by email through Resend".

### Task 3: The login flow on ar-va.com

**Files:**
- Modify: `src/pages/login.astro` (panel: Telegram, then "Or use your email"; copy that says only Telegram)
- Create: `src/pages/auth/email.ts` (POST: `step=send` | `step=verify`), `src/pages/auth/name.astro` (name for a new email account)
- Modify: `music/src/pages/invite/[code].astro` ("Use email instead" under "Accept with Telegram")

**Interfaces:**
- Consumes: Task 2's store functions, `startSession`, `acceptPendingInvite`, `setWho`, `safeReturnPath`.
- Produces: `POST /auth/email` `step=send` (email, Turnstile token `cf-turnstile-response`, return) → siteverify with `TURNSTILE_SECRET` (and the visitor's `CF-Connecting-IP`) → `requestLoginCode` → 303 `/login?code&email=<addr>&return=…#email` ('wait' → `&wait`; bad address or failed Turnstile → `&bad`). `step=verify` (email, code, return) → 'ok': `emailAccount(email, null)`, `acceptPendingInvite`, `startSession`; new account → 303 `/auth/name?return=…`, else the same redirect as `auth/telegram.ts`; 'wrong' / 'expired' → `/login?code&email=…&wrong|expired`. `/auth/name`: logged-in email account only; saves the name (`setName`), refreshes `who`, then goes on to `return`.

- [ ] **Step 1:** login.astro: an `#email` form (label "Your email", a Turnstile widget, "Send me a code"); with `?code`: "We sent a code to <address>" + a one-time-code field (`inputmode="numeric"`, `autocomplete="one-time-code"`, 6 digits) + "Log in", "Use another address", "Send a new code", and the messages for wait / wrong / expired / bad; "Check your spam folder if it doesn't arrive". The panel's heading and the request-shelf / invite text stop saying Telegram only.
- [ ] **Step 2:** `auth/email.ts` and `auth/name.astro` as above.
- [ ] **Step 3:** Invite page: "Use email instead" (to `loginHref` with the invite's `?accept` return).
- [ ] **Step 4: Build and verify on preview** (root on 4322 with the Turnstile test keys and no Resend key; music on 4323): request a code (read it from the preview log) → verify → name page → name saved → `who` cookie has the name, `return` reached; the same address again → no name step; wrong code ×5 → the code is void (the right one then says expired); a 4th request in 15 minutes → "wait", nothing logged; no Turnstile token → refused; `" David@Example.com "` logs in to the same account; a cross-site POST → 403; an invite opened logged out, then email login → collector, `settings?welcome`. Screenshots of the panel and the code step, light / dark, 390 px.
- [ ] **Step 5: Commit** "Log in with an email code (ar-va.com/login), Turnstile-protected".

### Task 4: Email accounts across music.ar-va.com

**Files:**
- Modify: `music/src/pages/settings.astro` (account card for email accounts; shelf request text), `music/src/pages/api/telegram.ts` (ids may be negative; delivery failure wording), `shared/lib/wishlist.ts` (`reservationCard` option `byEmail`), `music/src/pages/[user]/wishlist/index.astro` and `[item].astro` (card `byEmail`; the `?nomsg` toast for email accounts)

**Interfaces:**
- Consumes: `setName`, `setEmailMessages` (Task 2).
- Produces: settings `#account` for email accounts: name form (`action=name`), the address, "Email me about comments and reservations" (`action=email-messages`), Log out; Telegram accounts unchanged. The admin's shelf-request message names an email account as "Name (address)". `api/telegram.ts`: `cal|day|back`, `gift|unres` and `invite` patterns take `-?\d+`; when the invited person can't be messaged, the admin's fallback says "couldn't email" or "Telegram won't deliver" by account kind. `reservationCard(…, byEmail)` drops "with the button below" from its tail.

- [ ] **Step 1:** The changes above.
- [ ] **Step 2: Build and verify on preview** (throwaway login page for -1 and 42, deleted after): an email account comments on 42's record → 42's Telegram attempt; 42 replies → an email to -1 is logged with "replied to your comment" and the link; -1 reserves on 42's wishlist → the card is logged as an email with the cover, links and no bot-only buttons, and the page shows "reserved"; with messages off → no email, the toast says so in email terms; webhook posts `gift:-1:c:5` / `cal:-1:c:5` from the reserver (a Telegram user reserving on -1's list) are accepted; settings for -1: rename, messages off / on, no Telegram rows; shelf request from -1 → the admin message (attempted) names the address; the "Send an invite link" tap for -1 → the invite email logged.
- [ ] **Step 3: Commit** "Email accounts: settings, messages, wishlist and the bot's buttons with negative ids".

### Task 5: Notes

- [ ] **Step 1:** CLAUDE.md: How it works "Email login" (accounts, codes, Turnstile, Resend, notify routing, limits, setup secrets), Accounts (Resend, Turnstile), History 2026-11-26 with what was verified; README if it lists the login.
- [ ] **Step 2:** Commit the spec and plan ("Notes: email login").
