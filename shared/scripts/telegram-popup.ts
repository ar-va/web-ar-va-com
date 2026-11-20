// Links with data-tg-auth (Telegram's login window, telegramAuthUrl in lib.ts) log in without leaving the page: the
// click opens Telegram's window over it, and once the login cookie appears (ar-va.com/auth/done sets it for both
// sites) the page goes on to data-tg-next. If the browser blocks the window, the link's own href (the login page)
// is followed instead. The window is opened without a link back here (opener), so Telegram returns it to
// ar-va.com/auth/done rather than trying to message this page.
const loggedIn = () => /(?:^|; )who=/.test(document.cookie);

document.querySelectorAll<HTMLAnchorElement>('a[data-tg-auth]').forEach((link) => link.addEventListener('click', (e) => {
  const width = 550, height = 470;
  const win = window.open('', 'telegram_login', `width=${width},height=${height},left=${Math.max(0, (screen.width - width) / 2)},top=${Math.max(0, (screen.height - height) / 2)}`);
  if (!win) return;
  e.preventDefault();
  win.opener = null;
  win.location.href = link.dataset.tgAuth!;
  const hint = link.parentElement?.querySelector<HTMLElement>('[data-tg-hint]');
  const opened = Date.now();
  const timer = setInterval(() => {
    if (loggedIn()) {
      clearInterval(timer);
      location.href = link.dataset.tgNext || location.href;
    } else if (win.closed && Date.now() - opened > 1500) {
      // Closed without logging in (or a browser that loses track of it): say what else to try.
      clearInterval(timer);
      if (hint) hint.hidden = false;
    }
  }, 700);
}));
