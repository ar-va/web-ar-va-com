import { growFrom, shrinkTo } from './grow';
// The filters panel that drops down from "All records" / "All writing" in the sticky list toolbar: the button
// toggles it, it stays open while picking, Esc (focus back to the button) or a click outside closes it.
export function filtersPanel(toggleId = 'filters-toggle', panelId = 'filters-panel') {
  const toggle = document.getElementById(toggleId);
  const panel = document.getElementById(panelId);
  if (!toggle || !panel) return;
  // Open / closed = the button's aria-expanded (closing, the panel shrinks back into it before it's hidden).
  const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';
  const show = (open: boolean) => {
    if (open === isOpen()) return;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) { panel.hidden = false; growFrom(panel, toggle); } else shrinkTo(panel, toggle, () => { panel.hidden = true; });
  };
  toggle.addEventListener('click', () => show(!isOpen()));
  document.addEventListener('click', (e) => {
    if (isOpen() && !panel.contains(e.target as Node) && !toggle.contains(e.target as Node)) show(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) { show(false); toggle.focus(); }
  });
}

/** The number of picked filters next to the toolbar's title (shows while the panel is closed); Reset is off at 0. */
export function filtersCount(n: number, badgeId = 'filters-count') {
  const badge = document.getElementById(badgeId);
  if (badge) { badge.textContent = String(n); badge.hidden = n === 0; }
  document.querySelectorAll<HTMLButtonElement>('[data-filters-reset]').forEach((b) => { b.disabled = n === 0; });
}
