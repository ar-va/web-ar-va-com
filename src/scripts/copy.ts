// Click to copy, with a short tip: `data-copy` elements copy their text (album page: artist, title, track names);
// `data-copy="page"` copies this page's address (the link icon by the breadcrumbs). Without a clipboard, the address is
// offered in a prompt.
const tip = document.createElement('span');
tip.setAttribute('role', 'status');
tip.className = 'glass glass-dark pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium text-white opacity-0 transition-opacity';
document.body.append(tip);
let hide = 0;

document.addEventListener('click', async (e) => {
  const el = (e.target as Element).closest<HTMLElement>('[data-copy]');
  if (!el) return;
  const page = el.dataset.copy === 'page';
  const text = page ? location.origin + location.pathname : el.textContent!.trim();
  try { await navigator.clipboard.writeText(text); } catch { if (page) window.prompt('Copy this link:', text); return; }
  const box = el.getBoundingClientRect();
  tip.textContent = page ? 'Link copied' : 'Copied';
  tip.style.left = `${box.left + box.width / 2}px`;
  tip.style.top = `${box.top - 6}px`;
  tip.classList.replace('opacity-0', 'opacity-100');
  clearTimeout(hide);
  hide = window.setTimeout(() => tip.classList.replace('opacity-100', 'opacity-0'), 1200);
});
