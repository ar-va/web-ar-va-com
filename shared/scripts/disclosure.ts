// Folding parts (Disclosure.astro) animate their height (user 2026-11-21: they snapped open and shut): opening on the
// menus' spring, closing quicker without the bounce (grow.ts). A click while one is moving turns it around from where
// it is. The browser still does the opening and closing itself (keyboard, find-in-page); this only animates the change.
// None with reduced motion.
import { spring, DURATION, CLOSE_MS, CLOSE_EASE } from './grow';

document.addEventListener('click', (e) => {
  const summary = (e.target as Element | null)?.closest?.('details[data-disclosure] > summary');
  if (!summary || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const d = summary.parentElement as HTMLDetailsElement;
  e.preventDefault();
  const closing = d.dataset.closing === 'true';
  const from = d.getBoundingClientRect().height; // mid-animation too: it carries on from here
  d.getAnimations().forEach((a) => a.cancel());
  delete d.dataset.closing;
  const opening = closing || !d.open;
  d.style.overflow = 'hidden';
  const done = () => { d.style.overflow = ''; };
  if (opening) {
    d.open = true;
    const to = d.getBoundingClientRect().height;
    d.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: DURATION, easing: spring }).finished.then(done, () => {});
  } else {
    // The closed height (with its preview line), then back open while it shrinks; closed for real at the end.
    d.open = false;
    const to = d.getBoundingClientRect().height;
    d.open = true;
    d.dataset.closing = 'true';
    d.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: CLOSE_MS, easing: CLOSE_EASE }).finished
      .then(() => { d.open = false; delete d.dataset.closing; done(); }, () => {});
  }
});
