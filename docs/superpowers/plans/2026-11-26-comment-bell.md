# Comment bell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A bell beside the account link on music.ar-va.com listing each person's comment alerts, plus an admin-only "All comments" card in settings.

**Architecture:** `commentForm` (shared/lib/store.ts) already computes who to tell (`commentNotices`); it now also saves one `notifications` row per recipient. A music endpoint returns the alerts joined to the live comment (so edits show and deleted comments drop out) and marks them seen. The header's bell is shown from the `who` cookie and filled by one fetch per page load.

**Tech Stack:** Astro 7 on Cloudflare Workers, D1 (lazy schema in `db()`), Tailwind 4, Node's built-in test runner (`npm test`, `node:sqlite` for SQL tests).

**Spec:** `docs/superpowers/specs/2026-11-26-comment-bell-design.md`

## Global Constraints

- Bell only on the music host, only when the `who` cookie exists; not on ar-va.com or anon (`minimal` header).
- Bell shows the 20 newest alerts; admin card shows the 50 newest comments.
- Badge: solid on-colour like `#filters-count` (`bg-(--on-bg) text-(--on-text)`), text "9+" above nine, hidden at 0.
- Empty bell text: "No comments yet. Comments on your shelf and replies to you show up here."
- Opening the bell marks everything seen; dots stay while it is open.
- No alerts are created for comments posted before launch (no backfill).
- Wording of an alert = Telegram's verbs: "replied to your comment on", "replied to a comment on", "commented on".
- Commits as `ARVA <github@ar-va.com>`, no Co-Authored-By trailer; never push.

## Review Focus

- A comment deleted after its alert was saved (and its replies, deleted with it): must vanish from the bell and not count as new. Test in Task 2 (SQL test).
- An edited comment: the bell shows the new text. Test in Task 2.
- Another person's alerts never appear in your bell. Test in Task 2.
- Alert text containing `<script>` or a link: rendered as plain text in the bell (built with `textContent`), never as HTML. Check in Task 3's browser step.
- The fetch failing or answering 401 (session expired while `who` remains): bell stays without a badge, opening shows the empty text; no script error. Check in Task 3.

---

### Task 1: Shared wording and time

**Files:**
- Modify: `shared/lib/lib.ts` (`commentNotices` ~line 547; add `NOTICE_VERBS`, `timeAgo`)
- Modify: `music/src/pages/settings.astro:105-109` (its local `ago` uses `timeAgo`)
- Test: `shared/tests/lib.test.js`

**Interfaces:**
- Produces: `export type NoticeKind = 'reply' | 'place-reply' | 'comment'`; `export const NOTICE_VERBS: Record<NoticeKind, string>`; `commentNotices(...)` now returns `{ chatId: number; text: string; kind: NoticeKind }[]`; `export function timeAgo(at: number, nowSec?: number): string`.

- [ ] **Step 1: Failing tests.** In `'comment links and notifications'`: `assert.deepEqual(reply.map((n) => n.kind), ['reply', 'place-reply'])` and `assert.equal(owner[0].kind, 'comment')`. New test `'timeAgo'`: with `now = 1_800_000_000`: `timeAgo(now - 20, now) === 'just now'`, `timeAgo(now - 300, now) === '5 min ago'`, `timeAgo(now - 7200, now) === '2 h ago'`, `timeAgo(now - 86400, now) === '1 day ago'`, `timeAgo(now - 3 * 86400, now) === '3 days ago'`.
- [ ] **Step 2: Run** `npm test` → both fail (`kind` undefined, `timeAgo` not a function).
- [ ] **Step 3: Implement.** `commentNotices` builds its text from `NOTICE_VERBS[kind]` and adds `kind` to each item. `timeAgo` = settings' current thresholds (< 1 min, < 60 min, < 1440 min, days) with "1 day" singular. Settings: `const ago = (s: number | null) => (s ? timeAgo(s) : 'not yet')`.
- [ ] **Step 4: Run** `npm test` → all pass.
- [ ] **Step 5: Commit** "Comment notices carry their kind; timeAgo shared (1 day, not 1 days)".

### Task 2: Saved alerts, the endpoint, the admin list's data

**Files:**
- Modify: `shared/lib/lib.ts` (add `NOTIFICATIONS_SQL`)
- Modify: `shared/lib/store.ts` (SCHEMA, COLUMNS, `commentForm`, new functions in the Comments section)
- Create: `music/src/pages/api/notifications.ts`
- Test: `shared/tests/lib.test.js`

**Interfaces:**
- Consumes: `commentNotices` with `kind` (Task 1).
- Produces:
  - Table `notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, source TEXT NOT NULL, comment_id INTEGER NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL, created_at INTEGER NOT NULL)` + index `notifications_by_user (user_id, id)`; column `users.notifications_seen_at INTEGER` (in the `users` definition and in `COLUMNS`).
  - `export const NOTIFICATIONS_SQL: string` in lib.ts: one bound parameter (user id); selects `id, kind, title, url, created_at, body, name, photo_url` from `notifications` LEFT JOIN `comments` / `post_comments` by `source` + `comment_id`, JOIN `users` on the comment's author (so a deleted comment drops out), newest first, `LIMIT 20`.
  - `export interface Alert { id: number; verb: string; title: string; url: string; created_at: number; body: string; name: string; photo_url: string | null; unread: boolean }`
  - `export async function listAlerts(user: User): Promise<Alert[]>` (`unread` = `created_at > (user.notifications_seen_at ?? 0)`; `body` cut to 200 characters; `verb` from `NOTICE_VERBS`).
  - `export async function markAlertsSeen(user: User): Promise<void>`.
  - `export interface SiteComment { id: number; body: string; created_at: number; reply: boolean; name: string; photo_url: string | null; place: string; href: string }`
  - `export async function allComments(): Promise<SiteComment[]>`: one batch of two queries (record/shelf comments joined to author, shelf owner, `records` and `overrides` for the title; blog `post_comments` joined to author), merged newest first, 50. `place` = "Kind of Blue, Maya Lind’s shelf" / "Maya Lind’s records" (instance 0) / "the blog post <slug>"; `href` = `/<shelfSlug>/<instance>#comment-<id>` / `/<shelfSlug>#comment-<id>` / `https://ar-va.com/blog/<slug>#comment-<id>`; a record no longer on the shelf: "a removed record, Maya Lind’s shelf".
  - `GET /api/notifications` → `{ items: Alert[] }`, 401 `{ items: [] }` when logged out; `POST` (same-origin check like api/discogs.ts) → `markAlertsSeen`, `{ ok: true }`.

- [ ] **Step 1: Failing SQL test** `'alerts: own only, live text, deleted comments gone'` with `DatabaseSync(':memory:')` (as the invite-links test does): create `users`, `comments`, `post_comments`, `notifications` (columns as above); users 1 (Ann), 2 (Bo); comments 10 by Ann, 11 by Ann; alerts for user 2 on comments 10 and 11 (`source 'comments'`) and one for user 1. Edit comment 10's body to "edited", delete comment 11. `db.prepare(NOTIFICATIONS_SQL).all(2)` → exactly one row, `body === 'edited'`, `name === 'Ann'`.
- [ ] **Step 2: Run** `npm test` → fails (`NOTIFICATIONS_SQL` undefined).
- [ ] **Step 3: Implement** `NOTIFICATIONS_SQL`, the schema pieces, `listAlerts`, `markAlertsSeen`, `allComments`, the endpoint. In `commentForm`, after `addComment` succeeds: compute the notices once, `await` one batched INSERT of a row per notice (`source` = `'post_comments'` for a slug thread else `'comments'`, `url` = `${about.url}#comment-${id}`, `title` = `about.title`), then `waitUntil(notify(notices))` as before.
- [ ] **Step 4: Run** `npm test` → pass; `npm run build -w music` and `npm run build` pass.
- [ ] **Step 5: Verify on preview** (`cd music && npx astro preview --port 4323`, throwaway login page per CLAUDE.md Testing, deleted after): Maya comments on the admin's record → admin's `GET /api/notifications` has one unread item "commented on"; admin replies → Maya gets "replied to your comment on"; `POST` with Origin → items `unread: false`; POST without Origin → 403; delete Maya's comment → gone from the admin's list; logged out GET → 401.
- [ ] **Step 6: Commit** "Comment alerts saved for the bell; /api/notifications; allComments for the admin".

### Task 3: The bell in the header

**Files:**
- Modify: `shared/components/Header.astro` (bell markup before `#account`, inside `!minimal`)
- Create: `shared/scripts/bell.ts` (loaded from Header with a bundled `<script>`)

**Interfaces:**
- Consumes: `GET` / `POST /api/notifications` (Task 2), `timeAgo` (Task 1), `window.growFrom` / `window.shrinkTo` (shared/scripts/grow.ts).

- [ ] **Step 1: Markup.** A `hidden` button `#bell` (bell icon, 32 px, plain like the account link: zinc-600, hover Kikyō; `aria-label` "Comments", `aria-haspopup`, `aria-expanded`, `aria-controls="bell-menu"`) with a badge span `#bell-count` (classes of `#filters-count`, absolutely placed top-right); a `hidden` panel `#bell-menu` with the account menu's classes (`glass absolute right-6 top-full mt-1 w-80 max-w-[calc(100vw-3rem)] rounded-2xl p-2 z-50 text-sm`), a "Comments" title line and an empty `<ul>`. The inline script unhides `#bell` when `who` is valid and `location.host === music.<base>`.
- [ ] **Step 2: bell.ts.** If `#bell` is visible: fetch GET once; set the badge (`n > 9 ? '9+' : n`, hidden at 0); render rows into the list with DOM + `textContent` only: avatar (photo if https, else the initial, same classes as the header's), "**name** verb **title**", the body clamped to 2 lines, `timeAgo`, a dot when unread; the whole row a link to `url`; empty → the empty text. Open / close exactly like the account menu (growFrom / shrinkTo, outside click, Esc returns focus). On the first open with unread items: hide the badge and POST.
- [ ] **Step 3: Build and check in headless Chrome** (preview, the seeded alerts from Task 2): bell left of the avatar at 1200 and 390 px without sideways scroll, menu still centred; badge count right; panel opens / closes (Esc, outside click), rows link to `#comment-<id>`; after opening, a reload shows no badge; a comment body `<script>alert(1)</script>` shows as text; with the session cookie removed (keeping `who`) no badge, empty text, no console error; no bell on ar-va.com's login page or anon. Screenshots light and dark.
- [ ] **Step 4: Commit** "Header bell: comment alerts on music.ar-va.com".

### Task 4: "All comments" in settings (admin)

**Files:**
- Modify: `music/src/pages/settings.astro` (load `allComments()` in the existing `Promise.all` for the admin; card after Collectors)

**Interfaces:**
- Consumes: `allComments(): Promise<SiteComment[]>` (Task 2), `shared/components/Avatar.astro`, `timeAgo`.

- [ ] **Step 1: Card** `<section id="comments">` titled "All comments" (the page's `card` / `cardTitle`), one row per comment: Avatar, name, "replied on" / "on" + `place` as a link to `href`, the body clamped to 2 lines, `timeAgo(created_at)`; none yet: "No comments yet."
- [ ] **Step 2: Build and check** as the admin on preview: rows newest first, record / shelf / reply wording, links land on the comment; a non-admin's settings has no such card. Screenshot.
- [ ] **Step 3: Commit** "Settings: All comments for the admin".

### Task 5: Project notes

- [ ] **Step 1:** CLAUDE.md: How it works bullet "Comment bell" (table, endpoint, header script, admin card) and a History entry 2026-11-26 with what was verified; README if it lists features.
- [ ] **Step 2:** Commit the spec and plan with it ("Notes: comment bell").
