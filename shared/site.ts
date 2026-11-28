// ar-va.com's home and blog are hidden for now (user, 2026-10-29): the Worker sends their pages to music.ar-va.com,
// keeping only the login (Telegram's bot lives on ar-va.com), and the header and login page drop their links.
// Set to true (and push) to bring them back.
export const MAIN_SITE_PUBLIC = false;

// The landing page (ar-va.com/) is public on its own since 2026-11-28 (user: "A"), while the blog stays hidden.
export const HOME_PUBLIC = true;

// The public repository every ARVA site is built from (the footer links to it).
export const REPO_URL = 'https://github.com/ar-va/web-ar-va-com';
