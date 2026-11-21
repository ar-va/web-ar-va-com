// Menus and panels that open from a button grow out of it on a spring, in the style of Sileo's notifications (user,
// 2026-11-21; Sileo: a pill that springs into a card, its content following a beat later; ours is quicker, below).
// The panel starts clipped to a pill the size of the button, at its edge nearest the button, and springs open to its
// full shape (a slight overshoot in its scale); its items fade and settle in just after. Clip-path, transform and
// opacity only (cheap); none with reduced motion. Used by the account menu (Header's inline script, via
// window.growFrom), Sort, Filter, the listen menus and the edit page's track links.

/** A spring like Sileo's, quicker (user, 2026-11-21: Sileo's 0.6 s felt slow): framer-motion's model with bounce 0.28
 *  over 0.38 s, a ~4 % overshoot, as a CSS linear() easing sampled once. */
const BOUNCE = 0.28, SETTLE = 0.38; // seconds
const spring = (() => {
  const bounce = BOUNCE, duration = SETTLE;
  const w0 = (2 * Math.PI) / duration, zeta = 1 - bounce, wd = w0 * Math.sqrt(1 - zeta * zeta);
  const x = (t: number) => 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  return `linear(${Array.from({ length: 41 }, (_, i) => x((i / 40) * SETTLE * 1.3).toFixed(4)).join(', ')})`;
})();
const DURATION = SETTLE * 1.3 * 1000; // sampled a little past SETTLE, where it has come to rest
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
  const top = below ? 0 : box.height - h;
  const bottom = below ? box.height - h : 0;
  const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 16;
  return {
    small: `inset(${top}px ${right}px ${bottom}px ${left}px round ${h / 2}px)`,
    full: `inset(0px 0px 0px 0px round ${radius}px)`,
    origin: `${o.left + o.width / 2 - box.left}px ${below ? 0 : box.height}px`,
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
  [...el.children].forEach((child, i) => child.animate(
    [{ opacity: 0, transform: `translateY(${p.below ? -4 : 4}px)` }, { opacity: 1, transform: 'none' }],
    { duration: 220, delay: 30 + i * 15, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' },
  ));
}

/** Closing (user, 2026-11-21: "extend and subtract"): the panel shrinks back into its button, quicker than it opened
 *  and without the bounce (0.2 s, accelerating), its content fading first; then `hide()` really hides it. Opening it
 *  again meanwhile (growFrom) cancels this, and the hide with it. */
export function shrinkTo(el: HTMLElement, from: Element | null | undefined, hide: () => void) {
  stopClosing(el);
  const p = !still() && pill(el, from);
  if (!p) return hide();
  const content = [...el.children].map((child) => child.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, easing: 'ease-in', fill: 'forwards' }));
  const shape = el.animate(
    [
      { clipPath: p.full, transform: 'none', transformOrigin: p.origin, opacity: 1 },
      { clipPath: p.small, transform: 'scale(0.94)', transformOrigin: p.origin, opacity: 0.4 },
    ],
    { duration: 200, easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'forwards' },
  );
  const all = [shape, ...content];
  closing.set(el, all);
  shape.onfinish = () => { closing.delete(el); hide(); all.forEach((a) => a.cancel()); };
}

declare global { interface Window { growFrom?: typeof growFrom; shrinkTo?: typeof shrinkTo } }
window.growFrom = growFrom;
window.shrinkTo = shrinkTo;
