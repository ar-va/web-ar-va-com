// Music notes that float out of a sleeve's opening (shelf hover, album roll-out and spin). Each note is a small
// span inside the sleeve, animated once and removed. Nothing happens for people who prefer reduced motion.

const GLYPHS = ['♪', '♫', '♩', '♬'];
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** One note leaving the sleeve: from the top opening (shelf) or the right one (rolled-out record). */
export function emitNote(sleeve: HTMLElement, from: 'top' | 'right') {
  if (reduced()) return;
  const note = document.createElement('span');
  note.className = 'flying-note';
  note.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
  note.setAttribute('aria-hidden', 'true');
  const w = sleeve.offsetWidth;
  const x = from === 'top' ? rand(0.25, 0.75) * w : rand(1.15, 1.38) * w;
  const y = from === 'top' ? rand(-0.05, 0.05) * w : rand(0.25, 0.7) * w;
  note.style.cssText = `left:${x}px;top:${y}px;font-size:${rand(13, 23)}px`;
  sleeve.append(note);
  // Shelf notes fade out before the top of their shelf unit (5rem above the sleeve); hero notes rise past the
  // record's edge rather than drifting right into the title.
  const dx = from === 'top' ? rand(-0.22, 0.22) * w : rand(-0.05, 0.18) * w;
  const dy = from === 'top' ? -rand(0.22, 0.34) * w : -rand(0.3, 0.6) * w;
  const turn = rand(-30, 30);
  const peak = rand(0.35, 0.9);
  note.animate(
    [
      { transform: 'translate(-50%, -50%) scale(0.7) rotate(0deg)', opacity: 0 },
      { opacity: peak, offset: 0.2 },
      { opacity: peak * 0.8, offset: 0.7 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.1) rotate(${turn}deg)`, opacity: 0 },
    ],
    { duration: rand(1400, 2400), easing: 'cubic-bezier(0.2, 0.6, 0.3, 1)' },
  ).finished.then(() => note.remove(), () => note.remove());
}

/** A burst of notes spread over `ms` milliseconds. */
export function emitBurst(sleeve: HTMLElement, from: 'top' | 'right', count: number, ms: number, delay = 0) {
  for (let i = 0; i < count; i++) setTimeout(() => emitNote(sleeve, from), delay + rand(0, ms));
}

/** Notes keep coming from the top while a shelf record is hovered or focused. */
export function notesOnHover(selector: string) {
  const timers = new WeakMap<Element, number>();
  const start = (link: Element) => {
    const sleeve = link.querySelector<HTMLElement>('.sleeve');
    if (!sleeve || timers.has(link) || reduced()) return;
    emitBurst(sleeve, 'top', 3, 500, 150);
    timers.set(link, window.setInterval(() => emitNote(sleeve, 'top'), 420));
  };
  const stop = (link: Element) => { clearInterval(timers.get(link)); timers.delete(link); };
  for (const link of document.querySelectorAll(selector)) {
    link.addEventListener('mouseenter', () => start(link));
    link.addEventListener('mouseleave', () => stop(link));
    link.addEventListener('focus', () => start(link));
    link.addEventListener('blur', () => stop(link));
  }
}
