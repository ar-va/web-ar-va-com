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

export function growFrom(el: HTMLElement, from?: Element | null) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = el.getBoundingClientRect();
  const o = from?.getBoundingClientRect();
  if (!box.width || !box.height || !o) return;
  // the starting pill: the button's width and height, on the panel's edge closest to the button
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const left = clamp(o.left - box.left, 0, box.width - 1);
  const right = clamp(box.right - o.right, 0, box.width - 1 - left);
  const below = o.top + o.height / 2 < box.top + box.height / 2; // the panel opens below the button
  const h = Math.min(o.height, box.height);
  const top = below ? 0 : box.height - h;
  const bottom = below ? box.height - h : 0;
  const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 16;
  const origin = `${o.left + o.width / 2 - box.left}px ${below ? 0 : box.height}px`;
  el.animate(
    [
      { clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px round ${h / 2}px)`, transform: 'scale(0.94)', transformOrigin: origin },
      { clipPath: `inset(0px 0px 0px 0px round ${radius}px)`, transform: 'none', transformOrigin: origin },
    ],
    { duration: DURATION, easing: spring },
  );
  // the content follows: fades in and settles from a few pixels toward the button
  [...el.children].forEach((child, i) => child.animate(
    [{ opacity: 0, transform: `translateY(${below ? -4 : 4}px)` }, { opacity: 1, transform: 'none' }],
    { duration: 220, delay: 30 + i * 15, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' },
  ));
}

declare global { interface Window { growFrom?: typeof growFrom } }
window.growFrom = growFrom;
