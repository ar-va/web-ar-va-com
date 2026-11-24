// Colour maths for Vincent: OKLCH (uniform, so harmonies and ramps look even) in, sRGB hex out. No browser APIs.

export interface Oklch { l: number; c: number; h: number }

const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));
const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGamma = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (rgb: number[]) => `#${rgb.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('')}`;

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = channels(hex).map((v) => toLinear(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: (Math.atan2(B, A) * 180 / Math.PI + 360) % 360 };
}

// Gamma-encoded sRGB, 0..1 when the colour is displayable.
function oklchToRgb({ l: L, c, h }: Oklch): [number, number, number] {
  const A = c * Math.cos(h * Math.PI / 180);
  const B = c * Math.sin(h * Math.PI / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const gamma = (v: number) => (v < 0 ? -toGamma(-v) : toGamma(v));
  return [
    gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const inGamut = (color: Oklch) => oklchToRgb(color).every((v) => v >= -0.0005 && v <= 1.0005);

/** The most colourful chroma sRGB can show at this lightness and hue. */
export function maxChroma(l: number, h: number): number {
  if (l <= 0 || l >= 1) return 0;
  let low = 0;
  let high = 0.4;
  for (let i = 0; i < 18; i++) {
    const mid = (low + high) / 2;
    if (inGamut({ l, c: mid, h })) low = mid; else high = mid;
  }
  return low;
}

export function oklchToHex(color: Oklch): string {
  const l = clamp(color.l);
  const fitted = inGamut({ ...color, l }) ? { ...color, l } : { ...color, l, c: Math.min(color.c, maxChroma(l, color.h)) };
  return toHex(oklchToRgb(fitted).map((v) => v * 255));
}

const NUMBER = '[-+]?(?:\\d+\\.?\\d*|\\.\\d+)';
const SEP = '(?:\\s*,\\s*|\\s+)';
const triple = (name: string, a: string, b: string, c: string) =>
  new RegExp(`^${name}\\(\\s*(${a})${SEP}(${b})${SEP}(${c})\\s*\\)$`, 'i');
const RGB = triple('rgb', `${NUMBER}%?`, `${NUMBER}%?`, `${NUMBER}%?`);
const HSL = triple('hsl', `${NUMBER}(?:deg)?`, `${NUMBER}%`, `${NUMBER}%`);
const OKLCH = triple('oklch', `${NUMBER}%?`, NUMBER, `${NUMBER}(?:deg)?`);

function hslToHex(h: number, s: number, l: number) {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return toHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}

/** Hex, rgb(), hsl() or oklch() as lowercase #rrggbb; null for anything else. */
export function parseColor(text: string): string | null {
  const t = text.trim();
  if (/^#[0-9a-f]{3}$/i.test(t)) return `#${[...t.slice(1)].map((d) => d + d).join('')}`.toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(t)) return t.toLowerCase();
  let m = t.match(RGB);
  if (m) {
    const values = m.slice(1, 4).map((v) => (v.endsWith('%') ? parseFloat(v) * 2.55 : parseFloat(v)));
    return values.every((v) => v >= 0 && v <= 255) ? toHex(values) : null;
  }
  m = t.match(HSL);
  if (m) {
    const [s, l] = [parseFloat(m[2]), parseFloat(m[3])];
    if (s < 0 || s > 100 || l < 0 || l > 100) return null;
    return hslToHex(((parseFloat(m[1]) % 360) + 360) % 360, s / 100, l / 100);
  }
  m = t.match(OKLCH);
  if (m) {
    const l = m[1].endsWith('%') ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
    const c = parseFloat(m[2]);
    if (l < 0 || l > 1 || c < 0) return null;
    return oklchToHex({ l, c, h: ((parseFloat(m[3]) % 360) + 360) % 360 });
  }
  return null;
}

function luminance(hex: string) {
  const [r, g, b] = channels(hex).map((v) => toLinear(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `top` at this opacity over `under`, as the browser blends it (in sRGB). */
export function composite(top: string, alpha: number, under: string): string {
  const u = channels(under);
  return toHex(channels(top).map((v, i) => v * alpha + u[i] * (1 - alpha)));
}

export const hexToRgbList = (hex: string) => channels(hex).join(',');

/** Moves lightness only, by the smallest step that reaches `min` on every background (or the closest it can get). */
export function fitContrast(color: Oklch, against: string[], min: number): Oklch {
  const worst = (l: number) => {
    const hex = oklchToHex({ ...color, l });
    return Math.min(...against.map((bg) => contrast(hex, bg)));
  };
  if (worst(color.l) >= min) return color;
  let best = color.l;
  let bestScore = worst(color.l);
  for (let d = 0.004; d <= 1; d += 0.004) {
    for (const l of [color.l + d, color.l - d]) {
      if (l < 0 || l > 1) continue;
      const score = worst(l);
      if (score >= min) return { ...color, l };
      if (score > bestScore) { best = l; bestScore = score; }
    }
  }
  return { ...color, l: best };
}
