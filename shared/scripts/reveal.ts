// A change that spreads as a growing circle from (x, y), used by the sites' theme switch and Vincent's preview. Where
// the browser has view transitions and motion is welcome; otherwise the change happens at once. The page's CSS needs
// the `html.theme-vt` rules (shared/styles/global.css; Vincent's preview has its own copy).
export function circleReveal(x: number, y: number, change: () => void, doc: Document = document): void {
  const win = doc.defaultView!;
  if (!doc.startViewTransition || win.matchMedia('(prefers-reduced-motion: reduce)').matches) return change();
  const r = Math.hypot(Math.max(x, win.innerWidth - x), Math.max(y, win.innerHeight - y));
  const root = doc.documentElement;
  root.classList.add('theme-vt');
  const t = doc.startViewTransition(change);
  t.ready.then(() => root.animate(
    { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
    { duration: 550, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
  )).catch(() => {});
  t.finished.finally(() => root.classList.remove('theme-vt'));
}
