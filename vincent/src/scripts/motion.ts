// Small motion helpers for the tool page. Everything here is skipped when the device asks for reduced motion.
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** Calls `frame` with eased progress 0..1 on each animation frame for `ms`; returns a function that stops it. */
export function tween(ms: number, frame: (t: number) => void, ease = easeOut): () => void {
  let stopped = false;
  const start = performance.now();
  const step = (now: number) => {
    if (stopped) return;
    const t = Math.min(1, (now - start) / ms);
    frame(ease(t));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return () => { stopped = true; };
}

/** Rolls a number shown in `el` from `from` to `to`, then leaves the exact final text. */
export function countTo(el: HTMLElement, from: number, to: number, format: (n: number) => string, final: string) {
  if (reducedMotion() || from === to) { el.textContent = final; return; }
  tween(450, (t) => { el.textContent = t === 1 ? final : format(from + (to - from) * t); });
}
