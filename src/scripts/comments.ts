// Reply / Edit behaviour for CommentItem.astro. Delegated from the document, so it also covers the blog's comments,
// which arrive later as a server island. One box open at a time; Cancel or Esc puts everything back as it was.

let open: { panel: HTMLFormElement; opener: HTMLButtonElement; view: HTMLElement; original: string } | null = null;

function close(restoreFocus = true) {
  if (!open) return;
  const { panel, opener, view, original } = open;
  const area = panel.querySelector('textarea')!;
  area.value = original;
  panel.hidden = true;
  view.hidden = false;
  opener.setAttribute('aria-expanded', 'false');
  if (restoreFocus) opener.focus();
  open = null;
}

function update(panel: HTMLFormElement) {
  // Save stays off until the text is changed (edit) or written (reply).
  const area = panel.querySelector('textarea')!;
  const submit = panel.querySelector<HTMLButtonElement>('[data-submit]')!;
  const original = panel.dataset.panel === 'edit' ? area.defaultValue.trim() : '';
  submit.disabled = !area.value.trim() || area.value.trim() === original;
}

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const opener = target.closest<HTMLButtonElement>('[data-open]');
  if (opener) {
    const comment = opener.closest<HTMLElement>('[data-comment]')!;
    const panel = comment.querySelector<HTMLFormElement>(`[data-panel="${opener.dataset.open}"]`)!;
    const wasOpen = open?.panel === panel;
    close(false);
    if (wasOpen) return;
    const view = comment.querySelector<HTMLElement>('[data-view]')!;
    const area = panel.querySelector('textarea')!;
    open = { panel, opener, view, original: area.value };
    panel.hidden = false;
    if (panel.dataset.panel === 'edit') view.hidden = true;
    opener.setAttribute('aria-expanded', 'true');
    update(panel);
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
    return;
  }
  if (target.closest('[data-cancel]')) close();
});

document.addEventListener('input', (e) => {
  const panel = (e.target as HTMLElement).closest<HTMLFormElement>('[data-panel]');
  if (panel) update(panel);
});

document.addEventListener('keydown', (e) => {
  const panel = e.target instanceof Element ? e.target.closest<HTMLFormElement>('[data-panel]') : null;
  if (!panel) return;
  if (e.key === 'Escape') { e.preventDefault(); close(); }
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    if (!panel.querySelector<HTMLButtonElement>('[data-submit]')!.disabled) panel.requestSubmit();
  }
});

document.addEventListener('submit', (e) => {
  const button = (e.target as HTMLElement).querySelector<HTMLButtonElement>('[data-submit]');
  if (!button) return;
  // No double posts: the page reloads with the result.
  button.disabled = true;
  button.textContent = button.dataset.submit!;
});
