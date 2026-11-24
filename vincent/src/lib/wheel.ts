import { maxChroma, type Oklch } from './color.ts';

// The wheel: hue is the angle (0 at the top, clockwise), distance is the share of the most colourful value a screen can
// show at that hue and lightness, so every point on it is a real colour. x and y are measured from the centre.
export function pointToColor(x: number, y: number, radius: number, l: number): Oklch {
  const h = (Math.atan2(y, x) * 180 / Math.PI + 90 + 360) % 360;
  return { l, c: (Math.min(Math.hypot(x, y), radius) / radius) * maxChroma(l, h), h };
}

export function colorToPoint({ l, c, h }: Oklch, radius: number): { x: number; y: number } {
  const max = maxChroma(l, h);
  const share = max > 0 ? Math.min(c / max, 1) : 0;
  const angle = (h - 90) * Math.PI / 180;
  return { x: Math.cos(angle) * share * radius, y: Math.sin(angle) * share * radius };
}
