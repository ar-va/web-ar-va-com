// Turns a few choices into every Nextcloud colour variable, for light and dark. Colours are fitted to their backgrounds
// by lightness only, so hue and character survive and every pair in CONTRAST_PAIRS passes.
import { composite, contrast, fitContrast, hexToOklch, hexToRgbList, oklchToHex, type Oklch } from './color.ts';
import { HARMONIES, harmonyColors, type Harmony } from './harmony.ts';
import { NEXTCLOUD_COLOR_VARS } from './nextcloud-vars.ts';

export { NEXTCLOUD_COLOR_VARS };

export type Mode = 'light' | 'dark';
export type Style = 'muted' | 'balanced' | 'vivid';
export type Page = 'neutral' | 'primary' | 'secondary';
export type Vars = Record<string, string>;

export interface Choices { primary: string; harmony: Harmony; custom: string[]; style: Style; tint: number; page: Page }
export interface Note { role: string; mode: Mode; from: string; to: string }
export interface Theme { light: Vars; dark: Vars; accents: string[]; notes: Note[] }

export const DEFAULT_CHOICES: Choices = { primary: '#624db4', harmony: 'triadic', custom: [], style: 'balanced', tint: 0.35, page: 'neutral' };

const TEXT = 4.5;
// Nextcloud's own margin for controls, so hover states still reach 3:1.
const UI = 3.2;
const STYLE_CHROMA: Record<Style, number> = { muted: 0.55, balanced: 1, vivid: 1.35 };
const GUEST_ALPHA: Record<Mode, number> = { light: 0.8, dark: 0.85 };
const STATUS = { error: 29, warning: 72, success: 143, info: 247 };

const v = (name: string) => `--color-${name}`;
const pair = (fg: string, bg: string, min: number, label: string) => ({ fg, bg, min, label });
const statusPairs = Object.keys(STATUS).flatMap((s) => [
  pair(v(`${s}-text`), v(s), TEXT, `${s} text`),
  pair(v(`${s}-text`), v(`${s}-hover`), TEXT, `${s} text on hover`),
  pair(v(`element-${s}`), v('main-background'), UI, `${s} icon`),
]);

/** What must stay readable. `@guest-card` is the blurred card on login and public share pages. */
export const CONTRAST_PAIRS = [
  pair(v('main-text'), v('main-background'), TEXT, 'Text'),
  pair(v('main-text'), v('background-hover'), TEXT, 'Text on hover'),
  pair(v('main-text'), v('background-dark'), TEXT, 'Text on selected row'),
  pair(v('main-text'), v('mark'), TEXT, 'Text on highlight'),
  pair(v('main-text'), '@guest-card', TEXT, 'Text on guest card'),
  pair(v('text-maxcontrast'), v('main-background'), TEXT, 'Secondary text'),
  pair(v('text-maxcontrast'), v('background-hover'), TEXT, 'Secondary text on hover'),
  pair(v('text-maxcontrast'), v('background-dark'), TEXT, 'Secondary text on selected row'),
  pair(v('text-maxcontrast-background-blur'), '@guest-card', TEXT, 'Secondary text on guest card'),
  pair(v('primary-element-text'), v('primary-element'), TEXT, 'Primary button'),
  pair(v('primary-element-text'), v('primary-element-hover'), TEXT, 'Primary button on hover'),
  pair(v('primary-light-text'), v('primary-light'), TEXT, 'Soft button'),
  pair(v('primary-light-text'), v('primary-light-hover'), TEXT, 'Soft button on hover'),
  pair(v('background-plain-text'), v('background-plain'), TEXT, 'Header icons'),
  pair(v('text-error'), v('main-background'), TEXT, 'Error text'),
  pair(v('text-success'), v('main-background'), TEXT, 'Success text'),
  ...statusPairs,
  pair(v('primary-element'), v('main-background'), UI, 'Primary control'),
  pair(v('primary-element'), v('background-hover'), UI, 'Primary control on hover'),
  pair(v('primary-element'), '@guest-card', UI, 'Primary control on guest card'),
  pair(v('border-maxcontrast'), v('main-background'), UI, 'Field border'),
  pair(v('favorite'), v('main-background'), UI, 'Favourite star'),
];

export interface PairResult { label: string; fg: string; bg: string; min: number; ratio: number; pass: boolean }

export function checkPairs(vars: Vars, mode: Mode): PairResult[] {
  const guest = composite(vars[v('main-background')], GUEST_ALPHA[mode], vars[v('background-plain')]);
  return CONTRAST_PAIRS.map(({ fg, bg, min, label }) => {
    const [f, b] = [vars[fg], bg === '@guest-card' ? guest : vars[bg]];
    const ratio = contrast(f, b);
    return { label, fg: f, bg: b, min, ratio, pass: ratio >= min };
  });
}

const onColor = (bg: string) => (contrast('#ffffff', bg) >= TEXT ? '#ffffff' : '#000000');

// A hover state that differs from `color`, keeps its text readable and stays visible on the page.
function hoverOf(color: Oklch, text: string, backgrounds: string[], away: number): string {
  const base = oklchToHex(color);
  for (const way of [away, -away]) {
    for (let d = 0.07; d > 0.005; d -= 0.01) {
      const hex = oklchToHex({ ...color, l: color.l + way * d });
      if (hex !== base && contrast(hex, text) >= TEXT && backgrounds.every((b) => contrast(hex, b) >= UI)) return hex;
    }
  }
  return base;
}

function generateMode(mode: Mode, choices: Choices, primary: Oklch, accents: string[]) {
  const dark = mode === 'dark';
  const { tint } = choices;
  const away = dark ? 1 : -1;
  const hex = oklchToHex;
  const fit = (color: Oklch, against: string[], min: number) => hex(fitContrast(color, against, min));
  const neutral = (l: number, strength = 1) => hex({ l, c: tint * 0.022 * strength, h: primary.h });

  // Surfaces first: everything else is fitted to them.
  const base = dark ? 0.205 : 1 - 0.012 * tint;
  const ramp = (d: number) => neutral(base + away * d);
  const main = ramp(0);
  const hover = ramp(0.035);
  const backgroundDark = ramp(0.06);
  const darker = ramp(0.125);

  const secondary = hexToOklch(accents[0]);
  const tertiary = hexToOklch(accents[1] ?? accents[0]);
  const last = hexToOklch(accents[accents.length - 1]);

  // Dark mode reads best with a light control and dark text on it, as Material's dark schemes do.
  const seed = dark ? { ...primary, l: Math.min(0.88, Math.max(0.72, primary.l)) } : primary;
  const pageFor = (color: string) => ({
    neutral: neutral(base - (dark ? 0.05 : 0.03)),
    primary: color,
    secondary: hex({ l: dark ? 0.32 : 0.45, c: Math.min(secondary.c, 0.12), h: secondary.h }),
  }[choices.page]);
  // On a Primary page the guest card shows the control's own colour through it, so fit until the two agree.
  let element = fit(seed, [main, hover], UI);
  let page = pageFor(element);
  let guest = composite(main, GUEST_ALPHA[mode], page);
  for (let i = 0; i < 8; i++) {
    const next = fit({ ...seed, l: hexToOklch(element).l }, [main, hover, guest], UI);
    if (next === element) break;
    element = next;
    page = pageFor(element);
    guest = composite(main, GUEST_ALPHA[mode], page);
  }
  const elementOklch = hexToOklch(element);
  const elementText = onColor(element);
  const elementHover = hoverOf(elementOklch, elementText, [main, hover], away);

  const soft = { c: Math.min(secondary.c * 0.4, 0.06), h: secondary.h };
  const light = hex({ ...soft, l: dark ? 0.31 : 0.93 });
  const lightHover = hex({ ...soft, l: dark ? 0.35 : 0.895 });
  const lightText = fit({ l: dark ? 0.9 : 0.33, c: Math.min(secondary.c, 0.12), h: secondary.h }, [light, lightHover], TEXT);

  const mark = hex({ l: dark ? 0.33 : 0.92, c: Math.min(tertiary.c * 0.45, 0.07), h: tertiary.h });
  const favorite = fit({ l: dark ? 0.82 : 0.52, c: Math.min(tertiary.c, 0.16), h: tertiary.h }, [main, hover], UI);

  const textHue = { c: tint * 0.025, h: primary.h };
  const mainText = fit({ ...textHue, l: dark ? 0.93 : 0.25 }, [main, hover, backgroundDark, guest, mark], TEXT);
  const maxContrast = fit({ ...textHue, l: dark ? 0.74 : 0.5 }, [main, hover, backgroundDark], TEXT);
  const maxBlur = fit(hexToOklch(maxContrast), [guest], TEXT);
  const borderMax = fit({ ...textHue, l: dark ? 0.6 : 0.62 }, [main, hover], UI);

  const stop = (color: Oklch) => fit({ l: dark ? 0.78 : 0.45, c: Math.min(color.c, 0.16), h: color.h }, [elementText], TEXT);
  const [a, b, c] = [stop(primary), stop(secondary), stop(last)];

  const vars: Vars = {
    '--color-main-background': main,
    '--color-main-background-rgb': hexToRgbList(main),
    '--color-main-background-translucent': 'rgba(var(--color-main-background-rgb), .97)',
    '--color-main-background-blur': `rgba(var(--color-main-background-rgb), ${dark ? '.85' : '.8'})`,
    '--gradient-main-background': 'var(--color-main-background) 0%, var(--color-main-background-translucent) 85%, transparent 100%',
    '--color-background-hover': hover,
    '--color-background-dark': backgroundDark,
    '--color-background-darker': darker,
    '--color-placeholder-light': ramp(0.09),
    '--color-placeholder-dark': ramp(0.18),
    '--color-main-text': mainText,
    '--color-text-maxcontrast': maxContrast,
    '--color-text-maxcontrast-default': maxContrast,
    '--color-text-maxcontrast-background-blur': maxBlur,
    '--color-border': backgroundDark,
    '--color-border-dark': darker,
    '--color-border-maxcontrast': borderMax,
    '--color-border-error': 'var(--color-element-error)',
    '--color-border-success': 'var(--color-element-success)',
    '--color-favorite': favorite,
    '--color-mark': mark,
    '--color-background-selection': `rgb(from var(--color-primary-element) r g b / ${dark ? '0.4' : '0.2'})`,
    '--color-text-selection': 'var(--color-main-text)',
    '--color-loading-light': neutral(dark ? 0.55 : 0.84),
    '--color-loading-dark': neutral(dark ? 0.85 : 0.38),
    '--color-scrollbar': 'var(--color-border-maxcontrast) transparent',
    '--color-box-shadow-rgb': hexToRgbList(neutral(dark ? 0.06 : 0.42)),
    '--color-box-shadow': 'rgba(var(--color-box-shadow-rgb), 0.5)',
    '--color-background-assistant': hex({ l: dark ? 0.25 : 0.975, c: 0.015, h: secondary.h }),
    '--color-border-assistant': `linear-gradient(125deg, ${a} 50%, ${b} 125%)`,
    '--color-element-assistant': `linear-gradient(214deg, ${a} 12%, ${b} 39%, ${c} 86%)`,
    '--color-element-assistant-icon': `linear-gradient(214deg, ${a} 15%, ${b} 40%, ${c} 80%)`,
    '--background-invert-if-dark': dark ? 'invert(100%)' : 'no',
    '--background-invert-if-bright': dark ? 'no' : 'invert(100%)',
    '--background-image-invert-if-bright': onColor(page) === '#000000' ? 'invert(100%)' : 'no',
    '--primary-invert-if-bright': elementText === '#000000' ? 'invert(100%)' : 'no',
    '--primary-invert-if-dark': elementText === '#000000' ? 'no' : 'invert(100%)',
    '--color-primary': element,
    '--color-primary-text': elementText,
    '--color-primary-hover': elementHover,
    '--color-primary-element': element,
    '--color-primary-element-hover': elementHover,
    '--color-primary-element-text': elementText,
    '--color-primary-element-text-dark': hex({ l: elementText === '#000000' ? 0.14 : 0.93, c: 0, h: 0 }),
    '--color-primary-light': light,
    '--color-primary-light-hover': lightHover,
    '--color-primary-light-text': lightText,
    '--color-primary-element-light': 'var(--color-primary-light)',
    '--color-primary-element-light-text': 'var(--color-primary-light-text)',
    '--color-primary-element-light-hover': 'var(--color-primary-light-hover)',
    '--gradient-primary-background': 'linear-gradient(40deg, var(--color-primary) 0%, var(--color-primary-hover) 100%)',
    '--color-background-plain': page,
    '--color-background-plain-text': onColor(page),
    '--image-background': 'none',
  };

  for (const [name, baseHue] of Object.entries(STATUS)) {
    // Status colours lean a little toward the theme but stay red, amber, green and blue.
    const gap = ((primary.h - baseHue + 540) % 360) - 180;
    const h = primary.c < 0.02 ? baseHue : baseHue + Math.sign(gap) * Math.min(Math.abs(gap) * 0.25, 12);
    const surface = hex({ l: dark ? 0.3 : 0.945, c: 0.05, h });
    const surfaceHover = hex({ l: dark ? 0.34 : 0.905, c: 0.06, h });
    vars[v(name)] = surface;
    vars[v(`${name}-hover`)] = surfaceHover;
    vars[v(`${name}-rgb`)] = hexToRgbList(surface);
    vars[v(`${name}-text`)] = fit({ l: dark ? 0.9 : 0.36, c: 0.1, h }, [surface, surfaceHover], TEXT);
    vars[v(`element-${name}`)] = fit({ l: dark ? 0.72 : 0.55, c: 0.17, h }, [main, hover], UI);
    if (name === 'error' || name === 'success') {
      vars[v(`text-${name}`)] = fit({ l: dark ? 0.78 : 0.48, c: 0.16, h }, [main, hover], TEXT);
    }
  }

  // Nextcloud's own order, so the exported CSS reads like its stylesheet.
  return Object.fromEntries(NEXTCLOUD_COLOR_VARS.map((name) => [name, vars[name]])) as Vars;
}

export function generateTheme(choices: Choices): Theme {
  const chosen = hexToOklch(choices.primary);
  const primary = { ...chosen, c: chosen.c * STYLE_CHROMA[choices.style] };
  const accents = harmonyColors(primary, choices.harmony, choices.custom);
  const light = generateMode('light', choices, primary, accents);
  const dark = generateMode('dark', choices, primary, accents);
  const start = oklchToHex(primary);
  const notes: Note[] = [];
  for (const [mode, vars] of [['light', light], ['dark', dark]] as const) {
    const to = vars['--color-primary-element'];
    if (to !== start) notes.push({ role: 'Primary', mode, from: start, to });
  }
  return { light, dark, accents, notes };
}

const HEX6 = /^[0-9a-f]{6}$/i;

/** The theme as a short page address fragment. */
export function encodeChoices(c: Choices): string {
  const params = new URLSearchParams({ p: c.primary.slice(1), h: c.harmony, s: c.style, t: String(Math.round(c.tint * 100)), b: c.page });
  if (c.custom.length) params.set('c', c.custom.map((x) => x.slice(1)).join('.'));
  return params.toString();
}

/** Reads an address fragment. Anything damaged falls back to the default for that field; never throws. */
export function decodeChoices(text: string): Choices {
  const raw = text.replace(/^#/, '');
  if (raw.length > 300) return { ...DEFAULT_CHOICES };
  const q = new URLSearchParams(raw);
  const one = <T extends string>(key: string, allowed: readonly T[], fallback: T) => {
    const value = q.get(key) as T | null;
    return value !== null && allowed.includes(value) ? value : fallback;
  };
  const p = q.get('p') ?? '';
  const t = q.get('t') ?? '';
  return {
    primary: HEX6.test(p) ? `#${p.toLowerCase()}` : DEFAULT_CHOICES.primary,
    harmony: one('h', HARMONIES.map((x) => x.id), DEFAULT_CHOICES.harmony),
    custom: (q.get('c') ?? '').split('.').filter((x) => HEX6.test(x)).slice(0, 3).map((x) => `#${x.toLowerCase()}`),
    style: one('s', ['muted', 'balanced', 'vivid'] as const, DEFAULT_CHOICES.style),
    tint: /^\d{1,3}$/.test(t) && Number(t) <= 100 ? Number(t) / 100 : DEFAULT_CHOICES.tint,
    page: one('b', ['neutral', 'primary', 'secondary'] as const, DEFAULT_CHOICES.page),
  };
}
