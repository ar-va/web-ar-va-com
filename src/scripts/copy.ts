// Album page: the artist, title and track names (`data-copy`) copy their text when clicked, with a short "Copied" tip.
const tip = document.createElement('span');
tip.setAttribute('role', 'status');
tip.className = 'glass glass-dark pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium text-white opacity-0 transition-opacity';
document.body.append(tip);
let hide = 0;

document.addEventListener('click', async (e) => {
  const el = (e.target as Element).closest<HTMLElement>('[data-copy]');
  if (!el) return;
  try { await navigator.clipboard.writeText(el.textContent!.trim()); } catch { return; }
  const box = el.getBoundingClientRect();
  tip.textContent = 'Copied';
  tip.style.left = `${box.left + box.width / 2}px`;
  tip.style.top = `${box.top - 6}px`;
  tip.classList.replace('opacity-0', 'opacity-100');
  clearTimeout(hide);
  hide = window.setTimeout(() => tip.classList.replace('opacity-100', 'opacity-0'), 1200);
});
