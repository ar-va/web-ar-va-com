// Menus and panels that open from an icon spread out from it like a drop of ink (user, 2026-11-21): three soft-edged
// circles grow from the button, a little apart and at slightly different rates, so the edge wobbles like liquid rather
// than drawing one perfect circle. Only a mask animates (cheap); none with reduced motion. CSS: `.ink` in global.css.
// Used by the account menu (Header, inline script: via window.inkFrom), Sort, Filter, the listen menus and the edit
// page's track links.
export function inkFrom(el: HTMLElement, from?: Element | null) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = el.getBoundingClientRect();
  if (!box.width || !box.height) return;
  const o = from?.getBoundingClientRect();
  // where the drop lands: the button's centre, relative to the panel (it may well be outside it)
  const x = o ? o.left + o.width / 2 - box.left : box.width / 2;
  const y = o ? o.top + o.height / 2 - box.top : 0;
  const far = Math.hypot(Math.max(Math.abs(x), Math.abs(box.width - x)), Math.max(Math.abs(y), Math.abs(box.height - y)));
  const set = (k: string, v: number) => el.style.setProperty(k, `${Math.round(v)}px`);
  set('--ink-x', x);
  set('--ink-y', y);
  // the other two drops sit a little toward the panel's middle, one of them turned aside
  set('--ink-dx', (box.width / 2 - x) * 0.26);
  set('--ink-dy', (box.height / 2 - y) * 0.26);
  set('--ink-max', far + 40);
  el.classList.remove('ink');
  void el.offsetWidth; // restart the animation if it's already running
  el.classList.add('ink');
  const done = (e: AnimationEvent) => { if (e.animationName === 'ink-spread' && e.target === el) { el.classList.remove('ink'); el.removeEventListener('animationend', done); } };
  el.addEventListener('animationend', done);
}

declare global { interface Window { inkFrom?: typeof inkFrom } }
window.inkFrom = inkFrom;
