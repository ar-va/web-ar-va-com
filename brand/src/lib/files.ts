// What the page and llms.txt list, read from the brand kit beside this site at build time (the build runs in brand/).
import { readdirSync } from 'node:fs';

export const SITE = 'https://brand.ar-va.com';

export const kitFiles = (dir: 'logo' | 'avatars') => readdirSync(dir).filter((f) => f.endsWith('.svg')).sort();

export type Token = { name: string; light: string; dark: string; note: string };

/** The colour tokens of arva-tokens.css, light and dark side by side, with their comments. */
export function colourTokens(css: string): Token[] {
  const block = (selector: string) => {
    const at = css.indexOf(`${selector} {`);
    if (at < 0) throw new Error(`arva-tokens.css: no ${selector} block`);
    const body = css.slice(at, css.indexOf('}', at));
    return [...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;(?:\s*\/\*\s*(.*?)\s*\*\/)?/gi)].map(([, name, hex, note = '']) => ({ name, hex, note }));
  };
  const light = block('[data-theme="light"]');
  const dark = new Map(block('[data-theme="dark"]').map((t) => [t.name, t.hex]));
  // Fails the build rather than publishing a page that disagrees with the tokens file.
  if (!light.length || light.some((t) => !dark.has(t.name))) throw new Error('arva-tokens.css: light and dark tokens differ');
  return light.map((t) => ({ name: t.name, light: t.hex, dark: dark.get(t.name)!, note: t.note }));
}
