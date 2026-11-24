import { contrast, hexToOklch, maxChroma, oklchToHex, oklchToRgb, parseColor, type Oklch } from '../lib/color';
import { exportCss, settings } from '../lib/export';
import { HARMONIES, OFFSETS, type Harmony } from '../lib/harmony';
import { dominantColors } from '../lib/image';
import { checkPairs, decodeChoices, encodeChoices, generateTheme, type Mode, type Page, type Style, type Theme } from '../lib/theme';
import { colorToPoint, pointToColor } from '../lib/wheel';
import { DURATION, spring } from '../../../shared/scripts/grow';
import { countTo, reducedMotion, tween } from './motion';

type View = 'files' | 'share' | 'login' | 'admin' | 'components';
type Point = { x: number; y: number };
interface PreviewOptions { smooth?: boolean; reveal?: Point }
interface PreviewApi {
  applyCss(css: string, mode: Mode, settings?: { primary: string; primaryText: string; background: string; backgroundText: string }, options?: PreviewOptions): void;
  show(view: View): void; setLogo(url: string | null): void; highlight(name: string | null): void;
}

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
// What the next render should animate: a discrete change cross-fades and glides, a drag stays instant.
let smoothNext = false;
let spinNext = false;
let revealNext: Point | null = null;
let highlighted: string | null = null;
let comparing = false;

const wheel = $('wheel');
const canvas = $<HTMLCanvasElement>('wheel-canvas');
const handles = $('wheel-handles');
const lines = $('wheel-lines');
const frame = $<HTMLIFrameElement>('preview');
// A second preview, shown in dark beside the first while comparing.
let frameB: HTMLIFrameElement | null = null;
const apiOf = (f: HTMLIFrameElement | null) => (f?.contentWindow as (Window & { preview?: PreviewApi }) | null)?.preview;
const previewApi = () => apiOf(frame);
const previews = () => (comparing && frameB ? [frame, frameB] : [frame]).map(apiOf).filter((a): a is PreviewApi => Boolean(a));

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

// Handle positions as angle and distance from the centre, so a glide follows the wheel round rather than cutting across.
let shown: { a: number; r: number }[] = [];
let stopGlide = () => {};

function drawHandles(polar: { a: number; r: number }[]) {
  const radius = wheel.clientWidth / 2;
  const points = polar.map(({ a, r }) => ({ x: radius + Math.cos(a) * r, y: radius + Math.sin(a) * r }));
  [...handles.children].forEach((node, i) => {
    (node as HTMLElement).style.left = `${points[i].x}px`;
    (node as HTMLElement).style.top = `${points[i].y}px`;
  });
  lines.innerHTML = `<path d="${points.map((p) => `M${radius} ${radius}L${p.x} ${p.y}`).join('')}" stroke="#fff" stroke-opacity=".75" stroke-width="1.5" fill="none" />`;
  shown = polar;
}

function placeHandles(glide = false, spin = false) {
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
  const target = [...handles.children].map((node, i) => {
    const el = node as HTMLElement;
    const color = colourAt(i);
    el.style.background = i === 0 ? choices.primary : theme.accents[i - 1];
    el.setAttribute('aria-valuenow', String(Math.round(color.h)));
    el.setAttribute('aria-valuetext', `${i === 0 ? choices.primary : theme.accents[i - 1]}, hue ${Math.round(color.h)} degrees, chroma ${color.c.toFixed(3)}`);
    const { x, y } = colorToPoint({ ...color, l: primary.l }, radius);
    return { a: Math.atan2(y, x), r: Math.hypot(x, y) };
  });
  stopGlide();
  if (!glide || reducedMotion() || !shown.length) return drawHandles(target);
  // New handles fan out from the primary's place.
  const from = target.map((_, i) => shown[i] ?? shown[0]);
  const turn = (i: number) => {
    const d = ((target[i].a - from[i].a) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
    return d + (spin ? 2 * Math.PI : 0);
  };
  const turns = target.map((_, i) => turn(i));
  stopGlide = tween(spin ? 900 : 450, (t) => drawHandles(target.map((p, i) => ({
    a: from[i].a + turns[i] * t,
    r: from[i].r + (p.r - from[i].r) * t,
  }))));
}

const loupe = $('wheel-loupe');
function showLoupe(i: number | null) {
  if (i === null || !shown[i]) { loupe.hidden = true; return; }
  const radius = wheel.clientWidth / 2;
  const hex = i === 0 ? choices.primary : theme.accents[i - 1];
  loupe.hidden = false;
  loupe.textContent = hex;
  loupe.style.left = `${radius + Math.cos(shown[i].a) * shown[i].r}px`;
  loupe.style.top = `${radius + Math.sin(shown[i].a) * shown[i].r}px`;
  loupe.style.background = hex;
  loupe.style.color = textOn(hex);
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

// The palette's swatches: built once, so focus and hover survive updates. Hovering or focusing one marks where that
// colour appears in the preview.
const swatches = ROLES.map(([name, key]) => {
  const item = document.createElement('button');
  item.type = 'button';
  item.dataset.var = key;
  item.className = 'text-left rounded-lg outline-offset-2 focus-visible:outline-2 focus-visible:outline-kikyo-500';
  item.setAttribute('aria-label', `${name}: show where it appears in the preview`);
  item.innerHTML = '<span class="v-swatch"></span><span class="mt-1 block text-xs font-medium text-zinc-800 dark:text-zinc-200"></span><span class="block font-mono text-[11px] text-zinc-500"></span>';
  (item.children[1] as HTMLElement).textContent = name;
  return item;
});
$('palette').replaceChildren(...swatches);
const highlight = (name: string | null) => {
  highlighted = name;
  for (const api of previews()) api.highlight(name);
};
for (const item of swatches) {
  item.addEventListener('pointerenter', () => highlight(item.dataset.var!));
  item.addEventListener('focus', () => highlight(item.dataset.var!));
  item.addEventListener('pointerleave', () => { if (document.activeElement !== item) highlight(null); });
  item.addEventListener('blur', () => highlight(null));
}

const contrastRows = new Map<string, { li: HTMLElement; chip: HTMLElement; ratio: HTMLElement; mark: HTMLElement; value: number; pass: boolean | null }>();

function renderPalette(smooth = false) {
  const vars = theme[mode];
  swatches.forEach((item, i) => {
    const value = vars[ROLES[i][1]];
    (item.children[0] as HTMLElement).style.background = value;
    (item.children[2] as HTMLElement).textContent = value;
  });
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
  for (const p of pairs) {
    let row = contrastRows.get(p.label);
    if (!row) {
      const li = document.createElement('li');
      li.className = 'flex items-center gap-2';
      li.innerHTML = '<span class="shrink-0 w-7 h-5 rounded grid place-items-center font-semibold" aria-hidden="true">Aa</span><span class="min-w-0 flex-1 truncate"></span><span class="v-mark"></span><span class="font-mono" data-ratio></span>';
      (li.children[1] as HTMLElement).textContent = p.label;
      $('contrast-list').append(li);
      row = { li, chip: li.children[0] as HTMLElement, mark: li.children[2] as HTMLElement, ratio: li.children[3] as HTMLElement, value: p.ratio, pass: null };
      contrastRows.set(p.label, row);
    }
    row.chip.style.background = p.bg;
    row.chip.style.color = p.fg;
    const final = `${p.ratio.toFixed(1)}:1`;
    row.ratio.dataset.ratio = final;
    if (smooth) countTo(row.ratio, row.value, p.ratio, (n) => `${n.toFixed(1)}:1`, final);
    else row.ratio.textContent = final;
    row.value = p.ratio;
    row.mark.textContent = p.pass ? '✓' : '!';
    row.mark.title = p.pass ? `Passes ${p.min}:1` : `Below ${p.min}:1`;
    if (row.pass !== null && row.pass !== p.pass && !reducedMotion()) {
      row.mark.animate([{ transform: 'scale(0.4)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: DURATION, easing: spring });
    }
    row.pass = p.pass;
  }
}

// Nextcloud picks white or black text for the admin colour buttons, as it does for its primary colour.
const textOn = (hex: string) => (contrast('#ffffff', hex) >= 4.5 ? '#ffffff' : '#000000');
function pushPreview(options: PreviewOptions = {}) {
  const saved = settings(theme);
  const css = exportCss(theme);
  const colours = { primary: saved.primary, primaryText: textOn(saved.primary), background: saved.background, backgroundText: textOn(saved.background) };
  // Comparing: light on the left, dark on the right.
  apiOf(frame)?.applyCss(css, comparing ? 'light' : mode, colours, options);
  if (comparing) apiOf(frameB)?.applyCss(css, 'dark', colours, { smooth: options.smooth });
  if (highlighted) for (const api of previews()) api.highlight(highlighted);
}

function render() {
  queued = false;
  choices.primary = oklchToHex(primary);
  theme = generateTheme(choices);
  saveAddress();
  if (Math.abs(paintedL - primary.l) > 0.001) paintWheel(primary.l);
  const [smooth, spin, reveal] = [smoothNext, spinNext, revealNext];
  smoothNext = spinNext = false;
  revealNext = null;
  placeHandles(smooth, spin);
  showLoupe(dragging);
  syncControls();
  renderPalette(smooth);
  pushPreview({ smooth, reveal: reveal ?? undefined });
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
  update({ smooth: true });
});

function update(options: { smooth?: boolean; spin?: boolean; reveal?: Point } = {}) {
  smoothNext ||= Boolean(options.smooth);
  spinNext ||= Boolean(options.spin);
  if (options.reveal) revealNext = options.reveal;
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
for (const type of ['pointerup', 'pointercancel']) wheel.addEventListener(type, () => { dragging = null; showLoupe(null); writeAddress(); });
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

function useColour(hex: string, smooth = true) {
  primary = hexToOklch(hex);
  update({ smooth });
}
// The system picker fires continuously while its own control is dragged: no glide.
$<HTMLInputElement>('colour-native').addEventListener('input', (e) => useColour((e.target as HTMLInputElement).value, false));
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
  update({ smooth: true });
});

// A random but readable starting point: a clear colour in the middle lightness range and any linked harmony.
$('surprise').addEventListener('click', () => {
  const h = Math.random() * 360;
  const l = 0.42 + Math.random() * 0.22;
  primary = { l, h, c: maxChroma(l, h) * (0.55 + Math.random() * 0.4) };
  const linked = HARMONIES.filter((x) => x.id !== 'custom');
  choices.harmony = linked[Math.floor(Math.random() * linked.length)].id;
  choices.style = (['balanced', 'balanced', 'vivid', 'muted'] as Style[])[Math.floor(Math.random() * 4)];
  choices.tint = Math.round((0.15 + Math.random() * 0.4) * 100) / 100;
  update({ smooth: true, spin: true });
});
$<HTMLInputElement>('tint').addEventListener('input', (e) => { choices.tint = Number((e.target as HTMLInputElement).value) / 100; update(); });
for (const b of all('[data-choice]')) b.addEventListener('click', () => {
  if (b.dataset.choice === 'style') choices.style = b.dataset.value as Style;
  else choices.page = b.dataset.value as Page;
  update({ smooth: true });
});
// The new mode grows as a circle from the button, mapped into the preview's own coordinates.
for (const b of all('[data-mode]')) b.addEventListener('click', () => {
  if (comparing || mode === b.dataset.mode) return;
  mode = b.dataset.mode as Mode;
  const box = b.getBoundingClientRect();
  const area = frame.getBoundingClientRect();
  const scale = area.width / frame.offsetWidth;
  update({ reveal: { x: (box.left + box.width / 2 - area.left) / scale, y: (box.top + box.height / 2 - area.top) / scale } });
});
for (const b of all('[data-view]')) b.addEventListener('click', () => {
  view = b.dataset.view as View;
  for (const api of previews()) api.show(view);
  if (highlighted) for (const api of previews()) api.highlight(highlighted);
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
    const thumb = document.createElement('img');
    thumb.id = 'image-thumb';
    thumb.alt = '';
    thumb.src = url;
    thumb.className = 'w-10 h-10 rounded-lg object-contain bg-(--well)';
    $('image-thumb-slot').replaceChildren(thumb);
    $('image-result').hidden = false;
    flyFrom(thumb, [...$('image-colours').children] as HTMLElement[]);
    if ($<HTMLInputElement>('image-logo').checked) showLogo(url);
    useColour(colours[0]);
  } catch {
    URL.revokeObjectURL(url);
    imageError('That image couldn’t be read. Try a PNG, JPEG, WebP or SVG.');
  }
}

// The colours found in an image fly out of its thumbnail into their places.
function flyFrom(source: HTMLElement, items: HTMLElement[]) {
  if (reducedMotion()) return;
  const from = source.getBoundingClientRect();
  items.forEach((item, i) => {
    const to = item.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    item.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(0.3)`, opacity: 0 },
      { transform: 'none', opacity: 1 },
    ], { duration: DURATION, easing: spring, delay: i * 70, fill: 'backwards' });
  });
}

function showLogo(url: string | null) {
  if (logoUrl && logoUrl !== url && logoUrl !== imageUrl) URL.revokeObjectURL(logoUrl);
  logoUrl = url;
  for (const api of previews()) api.setLogo(url);
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
  for (const f of frameB ? [frame, frameB] : [frame]) {
    f.style.width = `${desktop}px`;
    f.style.height = `${height / scale}px`;
    f.style.transform = `scale(${scale})`;
  }
}
new ResizeObserver(fitPreview).observe(stage);
addEventListener('resize', () => { fitPreview(); placeHandles(); });
function frameReady() {
  for (const api of previews()) {
    api.show(view);
    api.setLogo(logoUrl);
  }
  pushPreview();
  syncScrolling();
}
frame.addEventListener('load', frameReady);

// Compare: the same screen in light and dark, split by a divider that drags and takes arrow keys.
const splitHandle = $('split-handle');
function setSplit(percent: number) {
  const value = Math.min(95, Math.max(5, percent));
  stage.style.setProperty('--split', `${value}%`);
  splitHandle.setAttribute('aria-valuenow', String(Math.round(value)));
  splitHandle.setAttribute('aria-valuetext', `${Math.round(value)}% light`);
}
$('compare').addEventListener('click', () => {
  comparing = !comparing;
  $('compare').setAttribute('aria-pressed', String(comparing));
  for (const b of all<HTMLButtonElement>('[data-mode]')) b.disabled = comparing;
  if (comparing && !frameB) {
    frameB = document.createElement('iframe');
    frameB.id = 'preview-b';
    frameB.title = 'The same screen in dark mode';
    frameB.src = '/preview/';
    frameB.addEventListener('load', frameReady);
    frame.after(frameB);
    fitPreview();
  }
  if (frameB) frameB.hidden = !comparing;
  splitHandle.hidden = !comparing;
  for (const side of all('.v-side')) side.hidden = !comparing;
  setSplit(50);
  if (comparing && apiOf(frameB)) frameReady(); else pushPreview();
});
let splitting = false;
splitHandle.addEventListener('pointerdown', (e) => { splitting = true; splitHandle.setPointerCapture(e.pointerId); e.preventDefault(); });
splitHandle.addEventListener('pointermove', (e) => {
  if (!splitting) return;
  const box = stage.getBoundingClientRect();
  setSplit((e.clientX - box.left) / box.width * 100);
});
for (const type of ['pointerup', 'pointercancel']) splitHandle.addEventListener(type, () => { splitting = false; });
splitHandle.addEventListener('keydown', (e) => {
  const now = Number(splitHandle.getAttribute('aria-valuenow'));
  const step = e.shiftKey ? 10 : 5;
  const next = { ArrowLeft: now - step, ArrowRight: now + step, Home: 5, End: 95 }[e.key];
  if (next === undefined) return;
  e.preventDefault();
  setSplit(next);
});

// Both sides scroll together: a scroll in one list moves the same list in the other preview.
let mirroring = false;
const previewDocs = () => [frame, frameB].map((f) => f?.contentDocument).filter((d): d is Document => Boolean(d));
function syncScrolling() {
  for (const doc of previewDocs()) {
    if ((doc as Document & { vincentSync?: boolean }).vincentSync) continue;
    (doc as Document & { vincentSync?: boolean }).vincentSync = true;
    doc.addEventListener('scroll', (e) => {
      const source = e.target as HTMLElement;
      if (mirroring || !comparing || !source.classList?.contains('scroller')) return;
      const other = previewDocs().find((d) => d !== doc);
      if (!other) return;
      const index = [...doc.querySelectorAll('.scroller')].indexOf(source);
      const twin = other.querySelectorAll<HTMLElement>('.scroller')[index];
      if (!twin) return;
      mirroring = true;
      twin.scrollTop = source.scrollTop;
      twin.scrollLeft = source.scrollLeft;
      requestAnimationFrame(() => { mirroring = false; });
    }, true);
  }
}

fitPreview();
render();
// The frame may have finished loading before this script ran.
if (frame.contentDocument?.readyState === 'complete' && previewApi()) frameReady();
