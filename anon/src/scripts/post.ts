// Small page behaviour, by delegation so it covers every post on the page. Everything works without it too
// (plain forms), except copying a link.

const toast = (anchor: HTMLElement, text: string) => {
  const tip = Object.assign(document.createElement('span'), {
    textContent: text,
    className: 'glass absolute z-50 -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-200 pointer-events-none',
    role: 'status',
  });
  anchor.style.position ||= 'relative';
  anchor.append(tip);
  setTimeout(() => tip.remove(), 1600);
};

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { prompt('Copy this link:', text); return false; }
}

document.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement;

  const confirmer = target.closest<HTMLElement>('[data-confirm]');
  if (confirmer && !confirm(confirmer.dataset.confirm!)) { e.preventDefault(); return; }

  const copier = target.closest<HTMLElement>('[data-copy]');
  if (copier) {
    const url = new URL(copier.dataset.copy!, location.href).href;
    if (await copy(url)) toast(copier, copier.dataset.copied ?? 'Link copied');
    return;
  }

  // Edit an answer in place; Cancel puts the text back.
  const edit = target.closest<HTMLElement>('[data-edit]');
  if (edit) {
    const reply = edit.closest('[data-reply]')!;
    reply.querySelector<HTMLElement>('[data-view]')!.hidden = true;
    const form = reply.querySelector<HTMLFormElement>('[data-editor]')!;
    form.hidden = false;
    const box = form.querySelector('textarea')!;
    box.dataset.original ??= box.value;
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
    return;
  }
  const cancel = target.closest<HTMLElement>('[data-cancel]');
  if (cancel) {
    const form = cancel.closest<HTMLFormElement>('[data-editor]')!;
    const box = form.querySelector('textarea')!;
    box.value = box.dataset.original ?? box.value;
    form.hidden = true;
    form.closest('[data-reply]')!.querySelector<HTMLElement>('[data-view]')!.hidden = false;
  }
});

// ⌘/Ctrl + Enter sends; Esc cancels an edit.
document.addEventListener('keydown', (e) => {
  const box = e.target as HTMLElement;
  if (!(box instanceof HTMLTextAreaElement) || !box.form) return;
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); box.form.requestSubmit(); }
  if (e.key === 'Escape') box.form.querySelector<HTMLElement>('[data-cancel]')?.click();
});

// One press only: the button says what's happening and can't post twice.
document.addEventListener('submit', (e) => {
  const button = (e as SubmitEvent).submitter as HTMLButtonElement | null;
  if (!button?.dataset.submit) return;
  setTimeout(() => { button.disabled = true; button.textContent = button.dataset.submit!; });
});
