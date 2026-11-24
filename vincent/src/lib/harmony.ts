import { oklchToHex, parseColor, type Oklch } from './color.ts';

export type Harmony = 'complementary' | 'split' | 'analogous' | 'accented' | 'triadic' | 'tetradic' | 'rectangle' | 'monochromatic' | 'custom';

export const HARMONIES: { id: Harmony; label: string }[] = [
  { id: 'complementary', label: 'Complementary' },
  { id: 'split', label: 'Split-complementary' },
  { id: 'analogous', label: 'Analogous' },
  // Neighbours for calm soft states, one opposite for the accent: suits interfaces.
  { id: 'accented', label: 'Accented analogous' },
  { id: 'triadic', label: 'Triadic' },
  // `tetradic` keeps its id (and old links) for the square form; the rectangle is two complementary pairs.
  { id: 'tetradic', label: 'Tetradic (square)' },
  { id: 'rectangle', label: 'Tetradic (rectangle)' },
  { id: 'monochromatic', label: 'Monochromatic' },
  { id: 'custom', label: 'Custom' },
];

export const OFFSETS: Record<string, number[]> = {
  complementary: [180],
  split: [150, 210],
  analogous: [30, -30],
  accented: [30, 180],
  triadic: [120, 240],
  tetradic: [90, 180, 270],
  rectangle: [60, 180, 240],
};

/** The accent colours that go with `primary`, without primary itself. */
export function harmonyColors(primary: Oklch, harmony: Harmony, custom: string[]): string[] {
  if (harmony === 'custom') {
    const picked = custom.map(parseColor).filter((c): c is string => c !== null);
    if (picked.length) return picked;
  }
  if (harmony === 'monochromatic') {
    const way = primary.l > 0.55 ? -1 : 1;
    return [0.18, 0.32].map((d) => oklchToHex({ l: primary.l + way * d, c: primary.c * 0.8, h: primary.h }));
  }
  return (OFFSETS[harmony] ?? OFFSETS.triadic).map((d) => oklchToHex({ ...primary, h: (primary.h + d + 360) % 360 }));
}
