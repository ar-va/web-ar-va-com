type Mode = 'light' | 'dark';

const style = document.head.appendChild(document.createElement('style'));
const panels = () => [...document.querySelectorAll<HTMLElement>('[data-view-panel]')];

function closeMenus() {
  for (const m of document.querySelectorAll<HTMLElement>('.menu')) m.hidden = true;
}

(window as unknown as { preview: unknown }).preview = {
  applyCss(css: string, mode: Mode) {
    style.textContent = css;
    document.body.toggleAttribute('data-theme-light', mode === 'light');
    document.body.toggleAttribute('data-theme-dark', mode === 'dark');
    document.documentElement.style.colorScheme = mode;
    document.body.classList.add('ready');
  },
  show(view: string) {
    closeMenus();
    const match = panels().some((p) => p.dataset.viewPanel === view) ? view : 'files';
    for (const p of panels()) p.hidden = p.dataset.viewPanel !== match;
  },
  setLogo(url: string | null) {
    for (const img of document.querySelectorAll<HTMLImageElement>('.logo-own')) {
      if (url) img.src = url; else img.removeAttribute('src');
      img.hidden = !url;
      (img.previousElementSibling as HTMLElement).style.display = url ? 'none' : '';
    }
  },
};

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const opener = target.closest<HTMLElement>('[data-menu]');
  if (opener) {
    const menu = document.getElementById(opener.dataset.menu!)!;
    const open = menu.hidden;
    closeMenus();
    menu.hidden = !open;
    if (open && menu.classList.contains('row-menu')) {
      const host = menu.offsetParent!.getBoundingClientRect();
      const b = opener.getBoundingClientRect();
      menu.style.top = `${Math.min(b.bottom - host.top + 2, host.height - menu.offsetHeight - 8)}px`;
      menu.style.left = `${b.right - host.left - menu.offsetWidth}px`;
    }
    return;
  }
  if (!target.closest('.menu')) closeMenus();

  const check = target.closest<HTMLElement>('.check');
  if (check) {
    const on = check.getAttribute('aria-checked') !== 'true';
    const row = check.closest<HTMLElement>('[data-file]');
    if (row) {
      check.setAttribute('aria-checked', String(on));
      row.setAttribute('aria-selected', String(on));
    } else {
      const table = check.closest('.files')!;
      for (const c of table.querySelectorAll('.check')) c.setAttribute('aria-checked', String(on));
      for (const r of table.querySelectorAll('[data-file]')) r.setAttribute('aria-selected', String(on));
    }
    return;
  }
  const tab = target.closest<HTMLElement>('[role="tab"]');
  if (tab) for (const t of tab.parentElement!.children) t.setAttribute('aria-selected', String(t === tab));
});
