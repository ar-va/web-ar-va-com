# Comment bell on music.ar-va.com: design

2026-11-26. Agreed with the user in conversation; calls marked *(my call)* were not discussed and can be changed.

## Intent

When someone comments, the people concerned can see it on the site, not only in Telegram (people who never allowed
the bot to message them get nothing today). A bell next to the account link shows new comments and leads to them.
The admin also gets one place to read every comment on the site.

## Decisions (user)

- **The bell shows each person their own comments (option 1):** comments on your shelf and your records, and replies
  to your comments: the same alerts Telegram sends (`commentNotices`). Every logged-in person gets a bell.
- **Admin: every comment on the site (option 2), in settings.**
- **Alerts are saved when they're sent** (a new table), not worked out from the comments: replies are stored under
  the top comment, so the person a reply answered is only known at the moment it's posted.

## Goals

- A logged-in visitor sees at a glance that something new arrived, and gets to the comment in two clicks.
- The bell and Telegram agree: same people, same comments.

## Non-goals

- Other events in the bell (reservations, gifts, shelf requests, invites).
- Live updates while a page is open; the count is fetched when a page loads.
- Marking single alerts read or unread, muting, email.
- The bell on ar-va.com (only its login page is served) or anon.ar-va.com (no logins).

## Anti-goals

- Slowing pages down: the page draws first, the bell's count arrives after.
- Showing a deleted comment, or the old text of an edited one.

## Bell (music.ar-va.com header)

- Left of the avatar, only when logged in (the `who` cookie), on every music page.
- A badge with the number of new alerts (solid Kikyō, "9+" above nine); no badge when nothing is new.
- Click: a panel like the account menu (glass, springs out of the bell, Esc / outside click close it), the 20 newest
  alerts *(my call)*:

  ```
  Comments
  ● (M) Maya replied to your comment on Kind of Blue        2 h ago
        "I have the mono pressing, the bass is so much…"
    (S) Sam commented on Artur’s records                    3 d ago
        "Great shelf!"
  ```

  Each row links to the comment (`#comment-<id>`). New ones (since the bell was last opened) carry a dot.
  Empty: "No comments yet. Comments on your shelf and replies to you show up here."
- Opening it clears the count *(my call)*; the dots stay while the panel is open.
- The panel shows the comment's current text and author (an edit shows; a deleted comment disappears).
- Comments posted before launch create no alerts *(my call)*.

## Admin settings: "All comments"

- A card for the admin only, near Collectors: the 50 newest comments on the site *(my call)*, from all shelves,
  records and blog posts. Each row: author (photo, name), where ("on Kind of Blue, Maya’s shelf" / "on Maya’s records"
  / a blog post), "reply" when it is one, the start of the text, when, and a link to it.
- Read only: deleting stays on the comment's page.

## How (my calls)

- Table `notifications (id, user_id, source, comment_id, kind, title, url, created_at)`: `source` = `comments` /
  `post_comments`; `kind` = reply to you / reply on your place / comment on your place (the wording Telegram uses);
  `url` = the page. Written in `commentForm` from `commentNotices`' recipients, alongside the Telegram send.
- `users.notifications_seen_at` (added by the `COLUMNS` ALTER list).
- `music.ar-va.com/api/notifications`: GET returns `{ unread, items }` for the session's user (items joined to the
  comment and its author, so deleted ones drop out); POST marks everything seen. Logged out: 401.
- The header's inline script adds the bell from the cookie and fills it from one fetch per page load.
