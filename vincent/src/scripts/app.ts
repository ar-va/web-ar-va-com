import { contrast, hexToOklch, maxChroma, oklchToHex, oklchToRgb, parseColor, type Oklch } from '../lib/color';
import { exportCss, settings } from '../lib/export';
import { OFFSETS, type Harmony } from '../lib/harmony';
import { dominantColors } from '../lib/image';
import { checkPairs, decodeChoices, encodeChoices, generateTheme, type Mode, type Page, type Style, type Theme } from '../lib/theme';
import { colorToPoint, pointToColor } from '../lib/wheel';

type View = 'files' | 'share' | 'login' | 'admin' | 'components';
interface PreviewApi { applyCss(css: string, mode: Mode, settings?: { primary: string; primaryText: string; background: string; backgroundText: string }): void; show(view: View): void; setLogo(url: string | null): void }

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const all = <T extends HTMLElement = HTMLElement>(selector: string) => [...document.querySelectorAll<T>(selector)];
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const choices = decodeChoices(location.hash);
// Kept apart from its hex: a hue must survive passing through grey at the wheel's centre.
let primary: Oklch = hexToOklch(choices.primary);
let mode: Mode = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
let view: View = 'files';
let theme: Theme = generateTheme(choices);
let logoUrl: string | null = null;
let imageUrl: string | null = null;
let queued = false;
let paintedL = -1;

const wheel = $('wheel');
const canvas = $<HTMLCanvasElement>('wheel-canvas');
const handles = $('wheel-handles');
const lines = $('wheel-lines');
const frame = $<HTMLIFrameElement>('preview');
const previewApi = () => (frame.contentWindow as (Window & { preview?: PreviewApi }) | null)?.preview;

function paintWheel(l: number) {
  const size = canvas.width;
  const r = size / 2;
  const edge = Array.from({ length: 360 }, (_, h) => maxChroma(l, h));
  const image = canvas.getContext('2d')!.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const [dx, dy] = [x + 0.5 - r, y + 0.5 - r];
    const h = (Math.atan2(dy, dx) * 180 / Math.PI + 450) % 360;
    const [a, b] = [edge[Math.floor(h) % 360], edge[(Math.floor(h) + 1) % 360]];
    const c = Math.min(Math.hypot(dx, dy) / r, 1) * (a + (b - a) * (h % 1)) * 0.995;
    const rgb = oklchToRgb({ l, c, h });
    const at = (y * size + x) * 4;
    image.data[at] = rgb[0] * 255;
    image.data[at + 1] = rgb[1] * 255;
    image.data[at + 2] = rgb[2] * 255;
    image.data[at + 3] = 255;
  }
  canvas.getContext('2d')!.putImageData(image, 0, 0);
  paintedL = l;
}

const colourAt = (i: number) => (i === 0 ? primary : hexToOklch(theme.accents[i - 1]));

function placeHandles() {
  const count = theme.accents.length + 1;
  while (handles.children.length > count) handles.lastElementChild!.remove();
  while (handles.children.length < count) {
    const i = handles.children.length;
    const el = document.createElement('div');
    el.className = 'v-wheel-handle';
    el.tabIndex = 0;
    el.setAttribute('role', 'slider');
    el.setAttribute('aria-valuemin', '0');
    el.setAttribute('aria-valuemax', '360');
    el.dataset.index = String(i);
    if (i === 0) el.dataset.main = '';
    el.setAttribute('aria-label', i === 0 ? 'Primary colour on the wheel' : `Matching colour ${i} on the wheel`);
    handles.append(el);
  }
  const radius = wheel.clientWidth / 2;
  const points: string[] = [];
  [...handles.children].forEach((node, i) => {
    const el = node as HTMLElement;
    const color = colourAt(i);
    const { x, y } = colorToPoint({ ...color, l: primary.l }, radius);
    el.style.left = `${radius + x}px`;
    el.style.top = `${radius + y}px`;
    el.style.background = i === 0 ? choices.primary : theme.accents[i - 1];
    el.setAttribute('aria-valuenow', String(Math.round(color.h)));
    el.setAttribute('aria-valuetext', `${i === 0 ? choices.primary : theme.accents[i - 1]}, hue ${Math.round(color.h)} degrees, chroma ${color.c.toFixed(3)}`);
    points.push(`M${radius} ${radius}L${radius + x} ${radius + y}`);
  });
  lines.innerHTML = `<path d="${points.join('')}" stroke="#fff" stroke-opacity=".75" stroke-width="1.5" fill="none" />`;
}

function setValue(input: HTMLInputElement | HTMLSelectElement, value: string) {
  if (document.activeElement !== input) input.value = value;
}

function syncControls() {
  setValue($<HTMLInputElement>('lightness'), String(Math.round(primary.l * 200) / 2));
  setValue($<HTMLInputElement>('colour-text'), choices.primary);
  $<HTMLInputElement>('colour-native').value = choices.primary;
  setValue($<HTMLInputElement>('num-l'), String(Math.round(primary.l * 200) / 2));
  setValue($<HTMLInputElement>('num-c'), primary.c.toFixed(3));
  setValue($<HTMLInputElement>('num-h'), String(Math.round(primary.h)));
  setValue($<HTMLSelectElement>('harmony'), choices.harmony);
  setValue($<HTMLInputElement>('tint'), String(Math.round(choices.tint * 100)));
  for (const b of all('[data-choice]')) b.setAttribute('aria-pressed', String(choices[b.dataset.choice as 'style' | 'page'] === b.dataset.value));
  for (const b of all('[data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === view));
  for (const b of all('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
}

const ROLES: [string, string][] = [
  ['Primary', '--color-primary-element'], ['Soft', '--color-primary-light'], ['Accent', '--color-favorite'], ['Page', '--color-background-plain'],
  ['Surface', '--color-main-background'], ['Hover', '--color-background-hover'], ['Border', '--color-border-maxcontrast'], ['Text', '--color-main-text'],
  ['Error', '--color-element-error'], ['Warning', '--color-element-warning'], ['Success', '--color-element-success'], ['Info', '--color-element-info'],
];

function renderPalette() {
  const vars = theme[mode];
  $('palette').replaceChildren(...ROLES.map(([name, key]) => {
    const item = document.createElement('div');
    const swatch = document.createElement('span');
    swatch.className = 'v-swatch';
    swatch.style.background = vars[key];
    const title = document.createElement('span');
    title.className = 'mt-1 block text-xs font-medium text-zinc-800 dark:text-zinc-200';
    title.textContent = name;
    const hex = document.createElement('span');
    hex.className = 'block font-mono text-[11px] text-zinc-500';
    hex.textContent = vars[key];
    item.append(swatch, title, hex);
    return item;
  }));
  const note = theme.notes.find((n) => n.mode === mode);
  $('notes').hidden = !note;
  if (note) {
    $('notes').textContent = note.reason === 'dark'
      ? `In dark mode your colour ${note.from} becomes ${note.to}, lighter so it stands out on dark backgrounds.`
      : `In ${mode} mode your colour ${note.from} becomes ${note.to} so that controls stay readable.`;
  }
  const pairs = checkPairs(vars, mode);
  const failing = pairs.filter((p) => !p.pass).length;
  $('contrast-summary').textContent = failing ? `${failing} of ${pairs.length} pairs below target` : `All ${pairs.length} pairs pass in ${mode} mode`;
  $('contrast-list').replaceChildren(...pairs.map((p) => {
    const li = document.createElement('li');
    li.className = 'flex items-center gap-2';
    const chip = document.createElement('span');
    chip.className = 'shrink-0 w-7 h-5 rounded grid place-items-center font-semibold';
    chip.style.background = p.bg;
    chip.style.color = p.fg;
    chip.textContent = 'Aa';
    chip.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'min-w-0 flex-1 truncate';
    label.textContent = p.label;
    const ratio = document.createElement('span');
    ratio.className = 'font-mono';
    ratio.textContent = `${p.ratio.toFixed(1)}:1`;
    li.append(chip, label, ratio);
    return li;
  }));
}

// Nextcloud picks white or black text for the admin colour buttons, as it does for its primary colour.
const textOn = (hex: string) => (contrast('#ffffff', hex) >= 4.5 ? '#ffffff' : '#000000');
function pushPreview() {
  const saved = settings(theme);
  previewApi()?.applyCss(exportCss(theme), mode, {
    primary: saved.primary, primaryText: textOn(saved.primary), background: saved.background, backgroundText: textOn(saved.background),
  });
}

function render() {
  queued = false;
  choices.primary = oklchToHex(primary);
  theme = generateTheme(choices);
  saveAddress();
  if (Math.abs(paintedL - primary.l) > 0.001) paintWheel(primary.l);
  placeHandles();
  syncControls();
  renderPalette();
  pushPreview();
}

// Browsers cap how often a page may rewrite its address (Chrome drops the rest, Safari and Firefox throw), so a drag
// writes it once it settles.
let addressTimer = 0;
function writeAddress() {
  clearTimeout(addressTimer);
  try {
    history.replaceState(null, '', `#${encodeChoices(choices)}`);
  } catch {
    saveAddress();
  }
}
function saveAddress() {
  clearTimeout(addressTimer);
  addressTimer = window.setTimeout(writeAddress, 250);
}
addEventListener('pagehide', writeAddress);
// A Vincent link pasted into this tab only changes the fragment: load its theme.
addEventListener('hashchange', () => {
  Object.assign(choices, decodeChoices(location.hash));
  primary = hexToOklch(choices.primary);
  update();
});

function update() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(render);
}

function setPrimary(next: Oklch) {
  primary = next;
  update();
}

const wrapHue = (h: number) => ((h % 360) + 360) % 360;

function moveHandle(i: number, x: number, y: number) {
  const radius = wheel.clientWidth / 2;
  if (i === 0) return setPrimary(pointToColor(x, y, radius, primary.l));
  if (choices.harmony === 'custom') {
    const custom = [...theme.accents];
    // The wheel shows the primary's lightness, so a colour moved on it takes that lightness and stays under the pointer.
    custom[i - 1] = oklchToHex(pointToColor(x, y, radius, primary.l));
    choices.custom = custom;
    return update();
  }
  // Linked colours turn together.
  const hue = pointToColor(x, y, radius, primary.l).h;
  setPrimary({ ...primary, h: wrapHue(hue - (OFFSETS[choices.harmony]?.[i - 1] ?? 0)) });
}

function nudge(i: number, hue: number, chroma: number) {
  const step = (c: Oklch) => {
    const h = wrapHue(c.h + hue);
    return { ...c, h, c: Math.max(0, Math.min(maxChroma(c.l, h), c.c + chroma)) };
  };
  if (i > 0 && choices.harmony === 'custom') {
    const custom = [...theme.accents];
    custom[i - 1] = oklchToHex(step(hexToOklch(custom[i - 1])));
    choices.custom = custom;
    return update();
  }
  setPrimary(step(primary));
}

let dragging: number | null = null;
const fromCentre = (e: PointerEvent) => {
  const box = wheel.getBoundingClientRect();
  return [e.clientX - box.left - box.width / 2, e.clientY - box.top - box.height / 2];
};
wheel.addEventListener('pointerdown', (e) => {
  const handle = (e.target as HTMLElement).closest<HTMLElement>('.v-wheel-handle');
  dragging = handle ? Number(handle.dataset.index) : 0;
  wheel.setPointerCapture(e.pointerId);
  (handle ?? handles.children[0] as HTMLElement).focus({ preventScroll: true });
  if (!handle) moveHandle(0, ...(fromCentre(e) as [number, number]));
  e.preventDefault();
});
wheel.addEventListener('pointermove', (e) => {
  if (dragging !== null) moveHandle(dragging, ...(fromCentre(e) as [number, number]));
});
for (const type of ['pointerup', 'pointercancel']) wheel.addEventListener(type, () => { dragging = null; writeAddress(); });
wheel.addEventListener('keydown', (e) => {
  const handle = (e.target as HTMLElement).closest<HTMLElement>('.v-wheel-handle');
  if (!handle) return;
  const big = e.shiftKey ? 5 : 1;
  const move = { ArrowLeft: [-2 * big, 0], ArrowRight: [2 * big, 0], ArrowUp: [0, 0.004 * big], ArrowDown: [0, -0.004 * big] }[e.key];
  if (!move) return;
  e.preventDefault();
  nudge(Number(handle.dataset.index), move[0], move[1]);
});

$<HTMLInputElement>('lightness').addEventListener('input', (e) => setPrimary({ ...primary, l: Number((e.target as HTMLInputElement).value) / 100 }));

function useColour(hex: string) {
  primary = hexToOklch(hex);
  update();
}
$<HTMLInputElement>('colour-native').addEventListener('input', (e) => useColour((e.target as HTMLInputElement).value));
$<HTMLInputElement>('colour-text').addEventListener('input', (e) => {
  const input = e.target as HTMLInputElement;
  const hex = parseColor(input.value);
  input.setAttribute('aria-invalid', String(!hex && input.value.trim() !== ''));
  $('colour-error').hidden = Boolean(hex) || input.value.trim() === '';
  if (hex) useColour(hex);
});
$<HTMLInputElement>('colour-text').addEventListener('blur', (e) => {
  (e.target as HTMLInputElement).value = choices.primary;
  (e.target as HTMLInputElement).removeAttribute('aria-invalid');
  $('colour-error').hidden = true;
});

const numberInput = (id: string, apply: (n: number) => Oklch) => $<HTMLInputElement>(id).addEventListener('input', (e) => {
  const n = (e.target as HTMLInputElement).valueAsNumber;
  if (Number.isFinite(n)) setPrimary(apply(n));
});
numberInput('num-l', (n) => ({ ...primary, l: Math.min(0.95, Math.max(0.05, n / 100)) }));
numberInput('num-c', (n) => ({ ...primary, c: Math.min(maxChroma(primary.l, primary.h), Math.max(0, n)) }));
numberInput('num-h', (n) => ({ ...primary, h: wrapHue(n) }));

$<HTMLSelectElement>('harmony').addEventListener('change', (e) => {
  const next = (e.target as HTMLSelectElement).value as Harmony;
  if (next === 'custom') choices.custom = [...theme.accents];
  choices.harmony = next;
  update();
});
$<HTMLInputElement>('tint').addEventListener('input', (e) => { choices.tint = Number((e.target as HTMLInputElement).value) / 100; update(); });
for (const b of all('[data-choice]')) b.addEventListener('click', () => {
  if (b.dataset.choice === 'style') choices.style = b.dataset.value as Style;
  else choices.page = b.dataset.value as Page;
  update();
});
for (const b of all('[data-mode]')) b.addEventListener('click', () => { mode = b.dataset.mode as Mode; update(); });
for (const b of all('[data-view]')) b.addEventListener('click', () => {
  view = b.dataset.view as View;
  previewApi()?.show(view);
  syncControls();
});

function imageError(text: string) {
  $('image-error').textContent = text;
  $('image-error').hidden = !text;
  if (text) $('image-result').hidden = true;
}

async function readImage(file: File) {
  imageError('');
  if (!file.type.startsWith('image/')) return imageError('That file isn’t an image.');
  if (file.size > MAX_IMAGE_BYTES) return imageError('That image is over 20 MB. Try a smaller one.');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 128 / Math.max(img.naturalWidth || 128, img.naturalHeight || 128));
    const pixels = document.createElement('canvas');
    pixels.width = Math.max(1, Math.round((img.naturalWidth || 128) * scale));
    pixels.height = Math.max(1, Math.round((img.naturalHeight || 128) * scale));
    const ctx = pixels.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, pixels.width, pixels.height);
    const colours = dominantColors(ctx.getImageData(0, 0, pixels.width, pixels.height).data, 5);
    if (!colours.length) {
      URL.revokeObjectURL(url);
      return imageError('No colours found: the image is fully transparent.');
    }
    if (imageUrl && imageUrl !== logoUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = url;
    $('image-colours').replaceChildren(...colours.map((hex) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'v-swatch';
      b.style.background = hex;
      b.title = hex;
      b.setAttribute('aria-label', `Use ${hex}`);
      b.addEventListener('click', () => useColour(hex));
      return b;
    }));
    $('image-result').hidden = false;
    if ($<HTMLInputElement>('image-logo').checked) showLogo(url);
    useColour(colours[0]);
  } catch {
    URL.revokeObjectURL(url);
    imageError('That image couldn’t be read. Try a PNG, JPEG, WebP or SVG.');
  }
}

function showLogo(url: string | null) {
  if (logoUrl && logoUrl !== url && logoUrl !== imageUrl) URL.revokeObjectURL(logoUrl);
  logoUrl = url;
  previewApi()?.setLogo(url);
}
$<HTMLInputElement>('image-input').addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  if (input.files?.[0]) readImage(input.files[0]);
  input.value = '';
});
$<HTMLInputElement>('image-logo').addEventListener('change', (e) => showLogo((e.target as HTMLInputElement).checked ? imageUrl : null));

const dialog = $<HTMLDialogElement>('export-dialog');
$('export-open').addEventListener('click', () => {
  render();
  const { primary: main, background } = settings(theme);
  $<HTMLInputElement>('export-primary').value = main;
  $<HTMLInputElement>('export-background').value = background;
  $('export-primary-chip').style.background = main;
  $('export-background-chip').style.background = background;
  $<HTMLTextAreaElement>('export-css').value = exportCss(theme);
  dialog.showModal();
});
$('export-close').addEventListener('click', () => dialog.close());
// Only a click that starts and ends on the backdrop closes it, not a text selection released there.
let pressedOnBackdrop = false;
dialog.addEventListener('pointerdown', (e) => { pressedOnBackdrop = e.target === dialog; });
dialog.addEventListener('click', (e) => { if (e.target === dialog && pressedOnBackdrop) dialog.close(); });

for (const button of all<HTMLButtonElement>('[data-copy-from]')) {
  const label = button.textContent!;
  let timer = 0;
  button.addEventListener('click', async () => {
    const field = $<HTMLInputElement | HTMLTextAreaElement>(button.dataset.copyFrom!);
    let copied = false;
    try {
      await navigator.clipboard.writeText(field.value);
      copied = true;
    } catch {
      // No clipboard access (an insecure page, a browser setting): leave it selected to copy by hand.
      field.focus();
      field.select();
    }
    button.textContent = copied ? 'Copied' : /Mac|iPhone|iPad/.test(navigator.platform) ? 'Press ⌘C' : 'Press Ctrl+C';
    $('export-status').textContent = copied ? 'Copied' : 'Selected. Use your keyboard or menu to copy it.';
    clearTimeout(timer);
    timer = window.setTimeout(() => { button.textContent = label; }, copied ? 1600 : 4000);
  });
}

const stage = $('preview-stage');
function fitPreview() {
  const width = stage.clientWidth;
  const desktop = Math.max(width, 1360);
  const scale = width / desktop;
  const room = window.innerWidth >= 1024 ? window.innerHeight - stage.getBoundingClientRect().top - 16 : width * 0.72;
  const height = Math.max(420, Math.min(room, 1100));
  stage.style.height = `${height}px`;
  frame.style.width = `${desktop}px`;
  frame.style.height = `${height / scale}px`;
  frame.style.transform = `scale(${scale})`;
}
new ResizeObserver(fitPreview).observe(stage);
addEventListener('resize', () => { fitPreview(); placeHandles(); });
function frameReady() {
  previewApi()?.show(view);
  previewApi()?.setLogo(logoUrl);
  pushPreview();
}
frame.addEventListener('load', frameReady);

fitPreview();
render();
// The frame may have finished loading before this script ran.
if (frame.contentDocument?.readyState === 'complete' && previewApi()) frameReady();
