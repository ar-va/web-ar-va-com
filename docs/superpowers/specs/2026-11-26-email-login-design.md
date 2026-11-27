# Logging in with an email code, messages by email: design

2026-11-26. Agreed with the user in conversation; calls marked *(my call)* were not discussed and can be changed.

## Intent

Onboarding David (who barely uses Telegram) meant making him install Telegram and allow the site. People should be
able to join with just an email address and get the same experience: log in, comment, reserve, collect, and be told
about what concerns them, by email instead of Telegram.

## Decisions (user)

- **Log in with a code sent by email**, beside Telegram (not Google, not passkeys).
- **Messages by email** for people who log in that way.
- **Free services only.** Cloudflare's Email Sending reaches arbitrary addresses only on Workers Paid ($5/month), so
  the site sends through **Resend's free plan**: 3,000 emails a month, at most 100 a day, from our own domain, via an
  HTTP API (checked on resend.com/pricing, 2026-11-26).

## Goals

- Someone with only an email address can join from an invite link or the login page in under a minute: address, a
  6-digit code from their inbox, their name; then they're in, on both ar-va.com and music.ar-va.com, for 30 days.
- Every message Telegram users get (comment alerts, replies, reservation card, reminders, giving-date warnings, ended
  reservations, "gave you", invite link from a shelf request) reaches email users as an email, with a link to the page
  where they can act on it.
- Telegram users notice no change.

## Non-goals

- One person with both Telegram and email on one account (adding email to a Telegram account, or the reverse);
  merging accounts. *(my call: later, if someone needs it)*
- Changing an account's email address *(my call: later)*.
- Google / Apple sign-in, passkeys, passwords.
- Photos for email accounts (they get the letter avatar), email digests, marketing mail.
- The admin's own messages (shelf requests): the admin stays on Telegram.

## Anti-goals

- The login form usable to bomb strangers' inboxes or to use up the 100-a-day quota (that would stop everyone's codes).
- Codes that can be guessed, reused, or read from the database.
- An email account that can't do something a Telegram account can (become a collector, connect Discogs, reserve).

## Approaches considered

- **Email code + email messages via Resend (chosen).** Works for anyone with an inbox; free at this scale.
- Google sign-in + email messages: one tap and a photo, but still needs email sending, and leaves out people without
  Google. Not chosen by the user.
- Cloudflare Email Sending: same code, but needs Workers Paid. Rejected: free only.
- Brevo (300 a day free) puts its branding in every email; MailerSend / Mailgun free tiers are smaller or unclear;
  Postmark has no lasting free tier; SendGrid ended its free plan. *(my call: Resend)*

## How it works

### Accounts *(my call)*

- `users.id` stays the Telegram id for Telegram accounts (every table refers to it; nothing existing moves). Email
  accounts get **negative ids** (Telegram ids are positive), so `id < 0` means "an email account".
- New column `users.email` (unique, lower-cased) and `users.email_messages` (1 = send emails, default 1). A new email
  account takes the next negative id (-1, -2, …).
- A person's name is what they type at the first login (editable in settings, 1–64 characters); no photo, no
  @username (comments and shelves already handle a missing username).

### Logging in (ar-va.com/login, and every "Log in" link)

- The login panel keeps the Telegram button and adds "Or use your email": an email field + "Send me a code".
- `POST ar-va.com/auth/email` with the address and a **Cloudflare Turnstile** token (free; protects the quota and
  strangers' inboxes) *(my call)*: a 6-digit code is stored as a SHA-256 hash in `email_codes (email, code_hash,
  expires_at, tries, sent_at)`, valid **10 minutes**, and emailed. At most **3 codes per address per 15 minutes**
  *(my call)*. The page then asks for the code (same `return`).
- `POST ar-va.com/auth/email/verify`: right code → the code row is deleted (one use), the user is found by email or
  created; a new email user is asked for their name first (a short step on the same page), then `startSession` as for
  Telegram (same cookies, same `who`, pending invites accepted, same redirect). **5 wrong tries** void the code.
- Invite page and the login page's "Request a shelf": beside "Accept with Telegram", "Use email instead" leads to the
  login page with the same `return` (Telegram's popup flow stays as is).

### Messages

- `notify()` keeps its shape (`chatId` = user id, text, buttons, photo). For a negative id it sends an email instead
  of a Telegram message, unless `email_messages` is off. Telegram users: unchanged.
- The email is the same text (Telegram's HTML subset: `<b>`, `<i>`, `<a>`, blockquotes → simple HTML + a plain-text
  version), the cover photo when there is one, and the **link buttons as buttons**. Bot-only buttons (giving-date
  calendar, "I gave it", "Cancel reservation", "Send an invite link") can't work in email: every message whose actions
  are bot-only gets a link to the page that has the same controls (the wishlist record, or settings#gifts). Subject
  lines per kind of message *(my call)*.
- Messages written for Telegram that mention Telegram ("reminders come here", "allow messages") get email wording for
  email accounts.
- The admin's shelf-request message (Telegram, to the admin) shows an email account's address instead of the
  Telegram profile link; its "Send an invite link" button then emails the invite to them.
- Sender: `ARVA Music <music@ar-va.com>` *(my call)*. Footer: why they got it and a link to turn messages off
  (settings). Login codes are always sent.
- The reservation page's "Telegram couldn't message you" note doesn't apply to email users (they get the card by
  email; a failure says "We couldn't email you").

### Settings

- Email accounts see "Your account": name (editable), email, "Email me about comments and reservations" (on / off),
  Log out. Telegram accounts: unchanged.

## Setup (user)

1. resend.com: free account → add domain `ar-va.com` → add the DNS records it lists in Cloudflare (DKIM TXT and the
   `send.` subdomain's MX / SPF; they don't touch the existing mail for contact@).
2. Resend API key → `RESEND_API_KEY` secret on **both** Workers (web-ar-va-com sends codes and blog alerts;
   web-music-ar-va-com sends everything else).
3. Cloudflare → Turnstile → add widget for ar-va.com → site key as a var, secret as `TURNSTILE_SECRET` on
   web-ar-va-com.

## Limits to know

- 100 emails a day, account-wide: codes and messages share it. Fine for dozens of people; past that, Resend Pro
  ($20/month) or Cloudflare Workers Paid. A refused send is logged, not retried *(my call; shortcut comment in code)*.
- Email lands in spam sometimes, especially at first; the login page says to check spam.

## Left to the builder

- Exact wording of emails and the login steps (plain, site voice; no example placeholders in fields).
- Whether Turnstile runs invisible or as a checkbox (invisible preferred).
- Local testing without sending real mail (log the email instead when `RESEND_API_KEY` is missing); Turnstile's
  published test keys locally.
