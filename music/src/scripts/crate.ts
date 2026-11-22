// The shelf's crate view (user 2026-11-22): the records stand one behind another in a crate, as in a record shop, and
// you flip through them. The one at the front stands up whole, the ones still to come peek out behind; a flipped one
// tips toward you and fades (leaning on the crate's edge, it covered the front record, or lay mirrored under it). Flip with the arrows (buttons or keys), the wheel, or a sideways drag /
// swipe; clicking a record further back flips to it, clicking the front one opens it. Shelf.astro's filters and sorting
// change which records are in the crate and in what order (`update`). Reduced motion: the same, without the glide.
const BEHIND = 10; // records drawn behind the front one
const AHEAD = 1; // the record just flipped, drawn while it tips away
const STEP_PX = 48; // a drag or wheel distance per record

export function crate(root: HTMLElement) {
  const caption = root.querySelector<HTMLElement>('[data-crate-caption]');
  const prev = root.querySelector<HTMLButtonElement>('[data-crate-prev]');
  const next = root.querySelector<HTMLButtonElement>('[data-crate-next]');
  const stage = root.querySelector<HTMLElement>('[data-crate-stage]')!;
  let k = 0;
  const visible = () => [...root.querySelectorAll<HTMLElement>('.crate-item')].filter((li) => !li.hidden);

  function layout() {
    const list = visible();
    k = Math.max(0, Math.min(k, list.length - 1));
    list.forEach((li, i) => {
      const d = i - k;
      const far = d < -AHEAD || d > BEHIND;
      li.classList.toggle('crate-far', far);
      li.querySelector('a')!.tabIndex = d === 0 ? 0 : -1;
      li.toggleAttribute('data-front', d === 0);
      if (far) return;
      // Behind: further back, a little higher, leaning back, in shade. Flipped: tipped toward you, gone.
      li.style.transform = d >= 0
        ? `translate3d(0, ${-d * 9}px, ${-d * 30}px) rotateX(${6 + Math.min(d, 4)}deg)`
        : 'translate3d(0, 0, 60px) rotateX(-80deg)';
      li.style.opacity = d < 0 ? '0' : '';
      li.style.setProperty('--shade', String(d > 0 ? Math.min(0.08 + d * 0.06, 0.6) : 0));
    });
    const front = list[k];
    if (caption) caption.textContent = front ? `${front.dataset.artist} – ${front.dataset.title}` : 'No matching records.';
    root.querySelector('[data-crate-count]')!.textContent = list.length ? `${k + 1} of ${list.length}` : '';
    if (prev) prev.disabled = k <= 0;
    if (next) next.disabled = k >= list.length - 1;
  }

  // Moves by n records; keeps the keyboard on the front record if it was on one.
  function flip(n: number) {
    const before = k;
    k = Math.max(0, Math.min(k + n, visible().length - 1));
    if (k === before) return false;
    const focused = root.contains(document.activeElement) && document.activeElement?.closest('.crate-item');
    layout();
    if (focused) visible()[k]?.querySelector('a')?.focus({ preventScroll: true });
    return true;
  }

  prev?.addEventListener('click', () => flip(-1));
  next?.addEventListener('click', () => flip(1));
  root.addEventListener('keydown', (e) => {
    const n = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: -Infinity, End: Infinity }[e.key];
    if (!n || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    flip(Number.isFinite(n) ? n : n > 0 ? 1e6 : -1e6);
  });

  // The wheel flips while there's somewhere to flip to; at either end the page scrolls on.
  let wheel = 0;
  stage.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
    const dir = Math.sign(e.deltaY);
    if ((dir < 0 && k === 0) || (dir > 0 && k >= visible().length - 1)) return;
    e.preventDefault();
    wheel += e.deltaY;
    while (Math.abs(wheel) >= STEP_PX) { flip(Math.sign(wheel)); wheel -= Math.sign(wheel) * STEP_PX; }
  }, { passive: false });

  // A sideways drag (mouse) or swipe (touch; vertical swipes still scroll the page): left = onward.
  let startX: number | null = null, moved = false;
  stage.addEventListener('pointerdown', (e) => { startX = e.clientX; moved = false; });
  stage.addEventListener('pointermove', (e) => {
    if (startX === null) return;
    const steps = Math.trunc((startX - e.clientX) / STEP_PX);
    if (!steps) return;
    moved = true;
    flip(steps);
    startX -= steps * STEP_PX;
  });
  const end = () => { startX = null; };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener('pointerleave', end);
  // A record further back: flip to it instead of opening it. And a drag doesn't end in a click.
  stage.addEventListener('click', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('.crate-item');
    if (moved) { e.preventDefault(); moved = false; return; }
    if (li && !li.hasAttribute('data-front')) { e.preventDefault(); flip(visible().indexOf(li) - k); }
  });
  stage.addEventListener('dragstart', (e) => e.preventDefault()); // links and images would start a browser drag

  layout();
  return {
    /** After filtering or sorting: back to the first record. */
    update() { k = 0; layout(); },
  };
}
