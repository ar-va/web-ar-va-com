// The header's bell on music.ar-va.com (Header.astro shows it when logged in): the person's comment alerts from
// /api/notifications, in a menu that opens like the account menu. Opening it marks them seen (up to the newest shown);
// their dots stay until the next page. Everything from the server goes in as text (textContent), never as HTML.
import { timeAgo } from '../lib/lib';
import type { Alert } from '../lib/store';
import { growFrom, shrinkTo } from './grow';

const bell = document.getElementById('bell') as HTMLButtonElement | null;
const menu = document.getElementById('bell-menu');
if (bell && menu && !bell.hidden) {
  const count = document.getElementById('bell-count')!;
  const list = document.getElementById('bell-list')!;
  let unread = 0;
  let newest = 0; // the newest alert shown: opening marks alerts seen up to it

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) => {
    const e = document.createElement(tag);
    e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  // Same face as the header's avatar: the Telegram photo, else the first letter.
  const face = (a: Alert) => a.photo_url?.startsWith('https://')
    ? Object.assign(el('img', 'w-8 h-8 rounded-full object-cover shrink-0'), { src: a.photo_url, alt: '', width: 32, height: 32, referrerPolicy: 'no-referrer' })
    : el('span', 'w-8 h-8 rounded-full bg-(--on-bg) text-(--on-text) text-xs grid place-items-center shrink-0', a.name.charAt(0));

  function row(a: Alert) {
    const link = el('a', 'relative flex gap-3 px-3 py-2.5 rounded-xl hover:bg-(--well) focus-visible:outline-2 focus-visible:outline-kikyo-500 transition-colors');
    link.href = a.url;
    const text = el('span', 'min-w-0 flex flex-col gap-0.5');
    const line = el('span', 'text-zinc-600 dark:text-zinc-300 pr-3');
    line.append(el('span', 'font-medium text-zinc-900 dark:text-white', a.name), ` ${a.verb} `, el('span', 'font-medium text-zinc-900 dark:text-white', a.title));
    text.append(line, el('span', 'text-zinc-500 line-clamp-2 break-words', a.body), el('span', 'text-xs text-zinc-500', timeAgo(a.created_at)));
    link.append(face(a), text);
    if (a.unread) link.append(Object.assign(el('span', 'absolute top-3.5 right-3 w-2 h-2 rounded-full bg-kikyo-500'), { title: 'New' }), el('span', 'sr-only', ' (new)'));
    const li = el('li', '');
    li.append(link);
    return li;
  }

  // The login cookie ended while the header's `who` cookie remains: say so rather than "no comments".
  function loggedOut() {
    const login = el('a', 'font-medium text-kikyo-600 dark:text-kikyo-400 hover:underline underline-offset-4', 'Log in again');
    login.href = `${location.protocol}//${location.host.replace(/^music\./, '')}/login?return=${encodeURIComponent(location.href)}`;
    const li = el('li', 'px-3 py-3 text-zinc-500');
    li.append(login, ' to see your comments.');
    list.replaceChildren(li);
  }

  function render(items: Alert[]) {
    unread = items.filter((a) => a.unread).length;
    newest = items[0]?.created_at ?? 0;
    count.textContent = unread > 9 ? '9+' : String(unread);
    count.hidden = unread === 0;
    bell!.setAttribute('aria-label', unread ? `Comments, ${unread} new` : 'Comments');
    list.replaceChildren(...(items.length ? items.map(row)
      : [el('li', 'px-3 py-3 text-zinc-500', 'No comments yet. Comments on your shelf and replies to you show up here.')]));
    if (isOpen()) markSeen(); // opened before the alerts arrived
  }

  // keepalive: clicking an alert right after opening leaves the page, which would cancel a plain request.
  function markSeen() {
    if (!unread) return;
    unread = 0;
    count.hidden = true;
    bell!.setAttribute('aria-label', 'Comments');
    fetch('/api/notifications', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ upTo: newest }) }).catch(() => {});
  }

  // A failed request (offline) leaves an empty bell rather than an error.
  fetch('/api/notifications').then(async (r) => (r.status === 401 ? loggedOut() : render(r.ok ? (await r.json()).items ?? [] : [])))
    .catch(() => render([]));

  // Opening and closing as the account menu does (Header.astro): springs out of the bell, shrinks back into it.
  const isOpen = () => bell.getAttribute('aria-expanded') === 'true';
  const toggle = (open: boolean) => {
    if (open === isOpen()) return;
    bell.setAttribute('aria-expanded', String(open));
    if (open) {
      menu.hidden = false;
      growFrom(menu, bell);
      markSeen();
    } else shrinkTo(menu, bell, () => { menu.hidden = true; });
  };
  bell.addEventListener('click', () => toggle(!isOpen()));
  list.addEventListener('click', (e) => { if ((e.target as Element).closest('a')) toggle(false); });
  document.addEventListener('click', (e) => { if (isOpen() && !menu.contains(e.target as Node) && !bell.contains(e.target as Node)) toggle(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) { toggle(false); bell.focus(); } });
}
