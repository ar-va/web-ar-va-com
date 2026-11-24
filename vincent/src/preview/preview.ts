import { circleReveal } from '../../../shared/scripts/reveal';

type Mode = 'light' | 'dark';
/** `smooth`: cross-fade (a discrete change, not a drag); `reveal`: grow the new mode as a circle from that point. */
type Options = { smooth?: boolean; reveal?: { x: number; y: number } };
/** The saved admin colours, which the Theming page's buttons show in any mode. */
type Settings = { primary: string; primaryText: string; background: string; backgroundText: string };

const style = document.head.appendChild(document.createElement('style'));
const panels = () => [...document.querySelectorAll<HTMLElement>('[data-view-panel]')];

function closeMenus() {
  for (const m of document.querySelectorAll<HTMLElement>('.menu:not(.menu-static)')) m.hidden = true;
}

let fadeTimer = 0;
function apply(css: string, mode: Mode, settings?: Settings) {
  style.textContent = css;
  const root = document.documentElement.style;
  if (settings) {
    root.setProperty('--setting-primary', settings.primary);
    root.setProperty('--setting-primary-text', settings.primaryText);
    root.setProperty('--setting-background', settings.background);
    root.setProperty('--setting-background-text', settings.backgroundText);
  }
  document.body.toggleAttribute('data-theme-light', mode === 'light');
  document.body.toggleAttribute('data-theme-dark', mode === 'dark');
  document.documentElement.style.colorScheme = mode;
  document.body.classList.add('ready');
}

(window as unknown as { preview: unknown }).preview = {
  applyCss(css: string, mode: Mode, settings?: Settings, options: Options = {}) {
    const modeChanges = !document.body.hasAttribute(`data-theme-${mode}`);
    if (options.reveal && modeChanges) {
      circleReveal(options.reveal.x, options.reveal.y, () => apply(css, mode, settings));
      return;
    }
    if (options.smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.body.classList.add('fading');
      clearTimeout(fadeTimer);
      fadeTimer = window.setTimeout(() => document.body.classList.remove('fading'), 400);
    }
    apply(css, mode, settings);
  },
  highlight(name: string | null) {
    for (const e of document.querySelectorAll('.v-highlight')) e.classList.remove('v-highlight');
    if (!name) return;
    const probe = document.body.appendChild(document.createElement('i'));
    probe.style.color = `var(${name})`;
    const target = getComputedStyle(probe).color;
    probe.remove();
    const panel = panels().find((p) => !p.hidden);
    if (!panel) return;
    for (const el of panel.querySelectorAll<HTMLElement>('*')) {
      if (!el.getClientRects().length) continue;
      const c = getComputedStyle(el);
      // Text colour is inherited by everything: count it only where the element draws text or an icon itself.
      const ownText = el instanceof SVGElement || [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
      const borders = (['Top', 'Right', 'Bottom', 'Left'] as const).some((side) => parseFloat(c[`border${side}Width`]) > 0 && c[`border${side}Color`] === target);
      if (c.backgroundColor === target || borders || (ownText && c.color === target)) el.classList.add('v-highlight');
    }
  },
  show(view: string) {
    closeMenus();
    const match = panels().some((p) => p.dataset.viewPanel === view) ? view : 'files';
    for (const p of panels()) p.hidden = p.dataset.viewPanel !== match;
  },
  setLogo(url: string | null) {
    for (const logo of document.querySelectorAll<HTMLElement>('.logo')) {
      logo.querySelector('img')?.remove();
      (logo.querySelector('.logo-sample') as HTMLElement).style.display = url ? 'none' : '';
      if (!url) continue;
      const img = document.createElement('img');
      img.alt = '';
      img.src = url;
      logo.append(img);
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
    if (check.hasAttribute('data-static')) return;
    const on = check.getAttribute('aria-checked') !== 'true';
    const row = check.closest<HTMLElement>('[data-file]');
    if (row) {
      check.setAttribute('aria-checked', String(on));
      row.setAttribute('aria-selected', String(on));
    } else {
      const table = check.closest('.files');
      if (!table) { check.setAttribute('aria-checked', String(on)); return; }
      for (const c of table.querySelectorAll('.check')) c.setAttribute('aria-checked', String(on));
      for (const r of table.querySelectorAll('[data-file]')) r.setAttribute('aria-selected', String(on));
    }
    return;
  }
  const pane = target.closest<HTMLElement>('[data-pane]');
  if (pane) {
    const group = pane.closest<HTMLElement>('[data-panes]')!;
    for (const b of group.querySelectorAll<HTMLElement>('[data-pane]')) b.classList.toggle('active', b.dataset.pane === pane.dataset.pane);
    for (const c of group.querySelectorAll<HTMLElement>('[data-pane-id]')) c.hidden = c.dataset.paneId !== pane.dataset.pane;
    return;
  }
  if (target.closest('[data-login-submit]')) {
    document.getElementById('login-error')!.hidden = false;
    return;
  }
  const toggle = target.closest<HTMLElement>('.switch, .radio-row');
  if (toggle?.classList.contains('switch')) {
    toggle.setAttribute('aria-checked', String(toggle.getAttribute('aria-checked') !== 'true'));
    return;
  }
  if (toggle) {
    for (const r of toggle.closest('[role="radiogroup"]')!.querySelectorAll('.radio-row')) r.setAttribute('aria-checked', String(r === toggle));
    return;
  }
  const tab = target.closest<HTMLElement>('[role="tab"]');
  if (tab) for (const t of tab.parentElement!.children) t.setAttribute('aria-selected', String(t === tab));
});
