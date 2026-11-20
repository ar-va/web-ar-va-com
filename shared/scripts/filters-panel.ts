// The filters panel that drops down from "All records" / "All writing" in the sticky list toolbar: the button
// toggles it, it stays open while picking, Esc (focus back to the button) or a click outside closes it.
export function filtersPanel(toggleId = 'filters-toggle', panelId = 'filters-panel') {
  const toggle = document.getElementById(toggleId);
  const panel = document.getElementById(panelId);
  if (!toggle || !panel) return;
  const show = (open: boolean) => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => show(panel.hidden));
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !panel.contains(e.target as Node) && !toggle.contains(e.target as Node)) show(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) { show(false); toggle.focus(); }
  });
}

/** The number of picked filters next to the toolbar's title (shows while the panel is closed); Reset is off at 0. */
export function filtersCount(n: number, badgeId = 'filters-count') {
  const badge = document.getElementById(badgeId);
  if (badge) { badge.textContent = String(n); badge.hidden = n === 0; }
  document.querySelectorAll<HTMLButtonElement>('[data-filters-reset]').forEach((b) => { b.disabled = n === 0; });
}
