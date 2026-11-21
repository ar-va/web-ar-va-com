// Menus and panels that open from a button grow out of it on a spring, in the style of Sileo's notifications (user,
// 2026-11-21; Sileo: a pill that springs into a card, its content following a beat later; ours is quicker, below).
// The panel starts clipped to a pill the size of the button, at its edge nearest the button, and springs open to its
// full shape (a slight overshoot in its scale); its items fade and settle in just after. Clip-path, transform and
// opacity only (cheap); none with reduced motion. Used by the account menu (Header's inline script, via
// window.growFrom), Sort, Filter, the listen menus and the edit page's track links.

/** A spring like Sileo's, quicker (user, 2026-11-21: Sileo's 0.6 s felt slow): framer-motion's model with bounce 0.28
 *  over 0.38 s, a ~4 % overshoot, as a CSS linear() easing sampled once. */
const BOUNCE = 0.28, SETTLE = 0.3; // seconds (0.38 until user 2026-11-21: a little quicker)
export const spring = (() => {
  const bounce = BOUNCE, duration = SETTLE;
  const w0 = (2 * Math.PI) / duration, zeta = 1 - bounce, wd = w0 * Math.sqrt(1 - zeta * zeta);
  const x = (t: number) => 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  // Safari before 17.2 has no linear() easing, and animate() throws on it: a plain ease-out there.
  if (!CSS.supports('animation-timing-function', 'linear(0, 1)')) return 'cubic-bezier(0.2, 0.9, 0.25, 1)';
  return `linear(${Array.from({ length: 41 }, (_, i) => x((i / 40) * SETTLE * 1.3).toFixed(4)).join(', ')})`;
})();
export const DURATION = SETTLE * 1.3 * 1000; // sampled a little past SETTLE, where it has come to rest
/** Closing: quicker than opening and without the bounce, accelerating away (menus, folding parts). */
export const CLOSE_MS = 160, CLOSE_EASE = 'cubic-bezier(0.5, 0, 0.75, 0)';
// The same spring for CSS transitions elsewhere (the player's volume capsule): var(--spring) over var(--spring-time).
document.documentElement.style.setProperty('--spring', spring);
document.documentElement.style.setProperty('--spring-time', `${Math.round(DURATION)}ms`);

/** The pill a panel grows out of (and shrinks back into): the button's width and height on the panel's edge nearest
 *  the button, with the transform origin there. Null when either can't be measured. */
function pill(el: HTMLElement, from?: Element | null) {
  const box = el.getBoundingClientRect();
  const o = from?.getBoundingClientRect();
  if (!box.width || !box.height || !o) return null;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const left = clamp(o.left - box.left, 0, box.width - 1);
  const right = clamp(box.right - o.right, 0, box.width - 1 - left);
  const below = o.top + o.height / 2 < box.top + box.height / 2; // the panel opens below the button
  const h = Math.min(o.height, box.height);
  // A panel laid over its button (the listen menu) starts as exactly the button; others as a button-sized pill on
  // their edge nearest it.
  const over = o.top >= box.top - 1 && o.bottom <= box.bottom + 1;
  const top = over ? o.top - box.top : below ? 0 : box.height - h;
  const bottom = Math.max(0, box.height - top - h);
  const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 16;
  return {
    small: `inset(${top}px ${right}px ${bottom}px ${left}px round ${h / 2}px)`,
    full: `inset(0px 0px 0px 0px round ${radius}px)`,
    origin: `${o.left + o.width / 2 - box.left}px ${over ? top + h / 2 : below ? 0 : box.height}px`,
    below,
  };
}
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// A panel that is shrinking away: its animations, so opening it again mid-way can cancel them (and its hiding).
const closing = new WeakMap<HTMLElement, Animation[]>();
const stopClosing = (el: HTMLElement) => { closing.get(el)?.forEach((a) => a.cancel()); closing.delete(el); };

/** Opening: call right after the panel is shown (before the browser paints it). */
export function growFrom(el: HTMLElement, from?: Element | null) {
  stopClosing(el);
  const p = !still() && pill(el, from);
  if (!p) return;
  el.animate(
    [
      { clipPath: p.small, transform: 'scale(0.94)', transformOrigin: p.origin },
      { clipPath: p.full, transform: 'none', transformOrigin: p.origin },
    ],
    { duration: DURATION, easing: spring },
  );
  // the content follows: fades in and settles from a few pixels toward the button
  // (data-grow-keep: a child that stays put, like the listen menu's twin of its button)
  [...el.children].filter((c) => !c.hasAttribute('data-grow-keep')).forEach((child, i) => child.animate(
    [{ opacity: 0, transform: `translateY(${p.below ? -4 : 4}px)` }, { opacity: 1, transform: 'none' }],
    { duration: 180, delay: 20 + i * 12, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' },
  ));
}

/** Closing (user, 2026-11-21: "extend and subtract"): the panel shrinks back into its button, quicker than it opened
 *  and without the bounce (CLOSE_MS, accelerating), its content fading first; then `hide()` really hides it. Opening it
 *  again meanwhile (growFrom) cancels this, and the hide with it. */
export function shrinkTo(el: HTMLElement, from: Element | null | undefined, hide: () => void) {
  stopClosing(el);
  const p = !still() && pill(el, from);
  if (!p) return hide();
  const content = [...el.children].filter((c) => !c.hasAttribute('data-grow-keep')).map((child) => child.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, easing: 'ease-in', fill: 'forwards' }));
  const shape = el.animate(
    [
      { clipPath: p.full, transform: 'none', transformOrigin: p.origin, opacity: 1 },
      { clipPath: p.small, transform: 'scale(0.94)', transformOrigin: p.origin, opacity: 0.4 },
    ],
    { duration: CLOSE_MS, easing: CLOSE_EASE, fill: 'forwards' },
  );
  const all = [shape, ...content];
  closing.set(el, all);
  shape.onfinish = () => { closing.delete(el); hide(); all.forEach((a) => a.cancel()); };
}

declare global { interface Window { growFrom?: typeof growFrom; shrinkTo?: typeof shrinkTo } }
window.growFrom = growFrom;
window.shrinkTo = shrinkTo;
