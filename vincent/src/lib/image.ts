import { hexToOklch } from './color.ts';

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0');

/** The main colours of an image's RGBA pixels, most useful first: colourful areas outrank big white or grey ones. */
export function dominantColors(rgba: Uint8ClampedArray, count: number): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const key = ((rgba[i] >> 4) << 8) | ((rgba[i + 1] >> 4) << 4) | (rgba[i + 2] >> 4);
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n++;
    bucket.r += rgba[i];
    bucket.g += rgba[i + 1];
    bucket.b += rgba[i + 2];
    buckets.set(key, bucket);
  }
  const ranked = [...buckets.values()].map(({ n, r, g, b }) => {
    const hex = `#${hex2(r / n)}${hex2(g / n)}${hex2(b / n)}`;
    const color = hexToOklch(hex);
    const angle = color.h * Math.PI / 180;
    return { hex, l: color.l, a: color.c * Math.cos(angle), b: color.c * Math.sin(angle), score: n * (0.04 + Math.min(color.c * 6, 1)) };
  }).sort((x, y) => y.score - x.score);
  const picked: typeof ranked = [];
  for (const c of ranked) {
    if (picked.length === count) break;
    if (picked.every((p) => Math.hypot(p.l - c.l, p.a - c.a, p.b - c.b) > 0.09)) picked.push(c);
  }
  return picked.map((c) => c.hex);
}
