import test from 'node:test';
import assert from 'node:assert/strict';
import { composite, contrast, hexToOklch, hexToRgbList, oklchToHex } from '../src/lib/color.ts';
import { harmonyColors } from '../src/lib/harmony.ts';
import { NEXTCLOUD_COLOR_VARS } from '../src/lib/nextcloud-vars.ts';
import { CONTRAST_PAIRS, DEFAULT_CHOICES, checkPairs, decodeChoices, encodeChoices, generateTheme } from '../src/lib/theme.ts';

const HARMONIES = ['complementary', 'split', 'analogous', 'accented', 'triadic', 'tetradic', 'rectangle', 'monochromatic', 'custom'];
const STYLES = ['muted', 'balanced', 'vivid'];
const PAGES = ['neutral', 'primary', 'secondary'];
const hueGap = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

function assertPairs(choices) {
  const theme = generateTheme(choices);
  for (const mode of ['light', 'dark']) {
    for (const p of checkPairs(theme[mode], mode)) {
      assert.ok(p.pass, `${JSON.stringify(choices)} ${mode}: ${p.label} ${p.fg} on ${p.bg} = ${p.ratio.toFixed(2)} < ${p.min}`);
    }
  }
}

test('each mode sets exactly Nextcloud\'s colour variables', () => {
  const t = generateTheme(DEFAULT_CHOICES);
  assert.equal(NEXTCLOUD_COLOR_VARS.length, 76);
  assert.deepEqual(Object.keys(t.light).sort(), [...NEXTCLOUD_COLOR_VARS].sort());
  assert.deepEqual(Object.keys(t.dark).sort(), [...NEXTCLOUD_COLOR_VARS].sort());
});

test('harmony offsets', () => {
  const primary = hexToOklch('#2f7fbf');
  const offsets = { complementary: [180], split: [150, 210], analogous: [30, -30], accented: [30, 180], triadic: [120, 240], tetradic: [90, 180, 270], rectangle: [60, 180, 240] };
  for (const [name, list] of Object.entries(offsets)) {
    const accents = harmonyColors(primary, name, []);
    assert.equal(accents.length, list.length, name);
    accents.forEach((hex, i) => {
      assert.ok(hueGap(hexToOklch(hex).h, primary.h + list[i]) < 3, `${name} ${i}: ${hexToOklch(hex).h}`);
    });
  }
});

test('monochromatic keeps the hue and changes lightness', () => {
  const primary = hexToOklch('#2f7fbf');
  const accents = harmonyColors(primary, 'monochromatic', []);
  assert.equal(accents.length, 2);
  for (const hex of accents) {
    const c = hexToOklch(hex);
    assert.ok(hueGap(c.h, primary.h) < 6);
    assert.ok(Math.abs(c.l - primary.l) > 0.05);
  }
});

test('custom uses the given colours and skips broken ones', () => {
  const primary = hexToOklch('#2f7fbf');
  assert.deepEqual(harmonyColors(primary, 'custom', ['#112233', 'nope', '#aabbcc']), ['#112233', '#aabbcc']);
  assert.equal(harmonyColors(primary, 'custom', []).length, 2);
});

test('every contrast pair passes across the colour grid', () => {
  let i = 0;
  for (let h = 0; h < 360; h += 30) for (const l of [0.15, 0.35, 0.55, 0.75, 0.92]) for (const c of [0, 0.05, 0.12, 0.2]) {
    const primary = oklchToHex({ l, c, h });
    // Every harmony, style and page meets every hue over the grid, without running all 63 for each colour.
    for (let n = 0; n < 4; n++, i++) {
      assertPairs({
        ...DEFAULT_CHOICES, primary,
        harmony: HARMONIES[i % 9], style: STYLES[i % 3], page: PAGES[(i >> 1) % 3], tint: [0, 0.35, 1][(i >> 2) % 3],
      });
    }
  }
});

test('every harmony, style and page combination passes on the default colour', () => {
  for (const harmony of HARMONIES) for (const style of STYLES) for (const page of PAGES) assertPairs({ ...DEFAULT_CHOICES, harmony, style, page });
});

test('extreme primaries pass', () => {
  for (const primary of ['#ffffff', '#000000', '#ffff00', '#808080', '#00ffff', '#ff0000', '#0000ff']) {
    for (const page of PAGES) assertPairs({ ...DEFAULT_CHOICES, primary, page });
  }
});

test('a pure grey primary gives a grey interface', () => {
  const t = generateTheme({ ...DEFAULT_CHOICES, primary: '#808080', tint: 0 });
  assert.ok(hexToOklch(t.light['--color-main-background']).c < 0.003);
  assert.ok(hexToOklch(t.dark['--color-main-background']).c < 0.003);
  assert.ok(hexToOklch(t.light['--color-primary-element']).c < 0.01);
});

test('tint changes how coloured the backgrounds are', () => {
  const chroma = (tint) => hexToOklch(generateTheme({ ...DEFAULT_CHOICES, tint }).dark['--color-main-background']).c;
  assert.ok(chroma(1) > chroma(0.35));
  assert.ok(chroma(0.35) > chroma(0));
});

test('light is light and dark is dark', () => {
  const t = generateTheme(DEFAULT_CHOICES);
  assert.ok(hexToOklch(t.light['--color-main-background']).l > 0.95);
  assert.ok(hexToOklch(t.dark['--color-main-background']).l < 0.3);
  assert.equal(t.light['--background-invert-if-dark'], 'no');
  assert.equal(t.dark['--background-invert-if-dark'], 'invert(100%)');
});

test('status colours stay recognisable', () => {
  const bases = { error: 29, warning: 72, success: 143, info: 247 };
  for (const primary of ['#624db4', '#ff00aa', '#00cc66', '#ffaa00', '#0088ff']) {
    const t = generateTheme({ ...DEFAULT_CHOICES, primary });
    for (const mode of ['light', 'dark']) for (const [name, hue] of Object.entries(bases)) {
      const h = hexToOklch(t[mode][`--color-element-${name}`]).h;
      assert.ok(hueGap(h, hue) <= 15, `${primary} ${mode} ${name}: ${h}`);
    }
  }
});

test('the style scales colourfulness', () => {
  const chroma = (style) => hexToOklch(generateTheme({ ...DEFAULT_CHOICES, primary: '#3f6fa8', style }).light['--color-primary-element']).c;
  assert.ok(chroma('muted') < chroma('balanced'));
  assert.ok(chroma('balanced') < chroma('vivid'));
});

test('a primary that already passes stays exact in light mode', () => {
  const t = generateTheme(DEFAULT_CHOICES);
  assert.equal(t.light['--color-primary-element'], '#624db4');
  assert.equal(t.notes.filter((n) => n.mode === 'light' && n.role === 'Primary').length, 0);
});

test('notes report a shifted colour', () => {
  const t = generateTheme({ ...DEFAULT_CHOICES, primary: '#ffff00' });
  const note = t.notes.find((n) => n.mode === 'light' && n.role === 'Primary');
  assert.equal(note.from, '#ffff00');
  assert.equal(note.to, t.light['--color-primary-element']);
  assert.notEqual(note.from, note.to);
});

test('page background follows the choice', () => {
  const primary = generateTheme({ ...DEFAULT_CHOICES, page: 'primary' });
  assert.equal(primary.light['--color-background-plain'], primary.light['--color-primary-element']);
  const secondary = generateTheme({ ...DEFAULT_CHOICES, page: 'secondary' });
  assert.ok(hueGap(hexToOklch(secondary.light['--color-background-plain']).h, hexToOklch(secondary.accents[0]).h) < 8);
});

test('rgb variables match their hex', () => {
  const t = generateTheme(DEFAULT_CHOICES);
  for (const mode of ['light', 'dark']) {
    assert.equal(t[mode]['--color-main-background-rgb'], hexToRgbList(t[mode]['--color-main-background']));
    for (const name of ['error', 'warning', 'success', 'info']) {
      assert.equal(t[mode][`--color-${name}-rgb`], hexToRgbList(t[mode][`--color-${name}`]));
    }
  }
});

test('the guest card keeps its text readable over the page', () => {
  for (const page of PAGES) {
    const t = generateTheme({ ...DEFAULT_CHOICES, page });
    const pairs = checkPairs(t.dark, 'dark').filter((p) => p.label.includes('guest card'));
    assert.ok(pairs.length >= 3);
    for (const p of pairs) assert.ok(contrast(p.fg, p.bg) >= p.min, p.label);
  }
});

test('contrast pairs name real variables', () => {
  for (const p of CONTRAST_PAIRS) {
    assert.ok(NEXTCLOUD_COLOR_VARS.includes(p.fg), p.fg);
    assert.ok(p.bg.startsWith('@') || NEXTCLOUD_COLOR_VARS.includes(p.bg), p.bg);
  }
});

test('the selected menu item is checked as Nextcloud draws it, a tint of primary', () => {
  const t = generateTheme(DEFAULT_CHOICES);
  for (const mode of ['light', 'dark']) {
    const vars = t[mode];
    const pairs = checkPairs(vars, mode);
    for (const [label, alpha] of [['Text on selected menu item', 0.16], ['Text on selected menu item, hover', 0.22]]) {
      const pair = pairs.find((p) => p.label === label);
      assert.ok(pair, label);
      assert.equal(pair.bg, composite(vars['--color-primary-element'], alpha, vars['--color-main-background']));
    }
  }
});

test('address round-trip', () => {
  assert.deepEqual(decodeChoices(encodeChoices(DEFAULT_CHOICES)), DEFAULT_CHOICES);
  const custom = { primary: '#102030', harmony: 'custom', custom: ['#aabbcc', '#ddeeff'], style: 'vivid', tint: 0.8, page: 'secondary' };
  assert.deepEqual(decodeChoices(encodeChoices(custom)), custom);
  assert.deepEqual(decodeChoices(`#${encodeChoices(custom)}`), custom);
});

test('a damaged address falls back to the default', () => {
  for (const bad of ['', '%%%', 'p=url(x)', 'a'.repeat(5000), 'p=zzzzzz&h=evil&s=loud&t=900&b=nope&c=<script>']) {
    assert.deepEqual(decodeChoices(bad), DEFAULT_CHOICES, bad.slice(0, 30));
  }
});

test('one bad field keeps the good ones', () => {
  const c = decodeChoices('p=112233&h=evil');
  assert.equal(c.primary, '#112233');
  assert.equal(c.harmony, DEFAULT_CHOICES.harmony);
});

test('a colourless primary gives true greys at any tint', () => {
  for (const primary of ['#808080', '#000000', '#ffffff', '#333333']) {
    const t = generateTheme({ ...DEFAULT_CHOICES, primary, tint: 1 });
    for (const mode of ['light', 'dark']) {
      for (const name of ['--color-main-background', '--color-background-hover', '--color-main-text', '--color-text-maxcontrast', '--color-background-plain']) {
        assert.ok(hexToOklch(t[mode][name]).c < 0.004, `${primary} ${mode} ${name} ${t[mode][name]}`);
      }
    }
  }
});

test('notes name the colour the person chose, and only for a visible change', () => {
  const muted = generateTheme({ ...DEFAULT_CHOICES, style: 'muted' });
  for (const n of muted.notes) assert.equal(n.from, DEFAULT_CHOICES.primary);
  assert.equal(muted.notes.filter((n) => n.mode === 'light').length, 0, 'style alone is not a contrast change');
  const dark = generateTheme(DEFAULT_CHOICES).notes.find((n) => n.mode === 'dark');
  assert.equal(dark.from, '#624db4');
  assert.equal(dark.reason, 'dark');
  assert.equal(generateTheme({ ...DEFAULT_CHOICES, primary: '#ffff00' }).notes.find((n) => n.mode === 'light').reason, 'contrast');
});

test('the dark search bar label stays readable on every page background', async () => {
  const { composite } = await import('../src/lib/color.ts');
  for (let h = 0; h < 360; h += 30) for (const l of [0.2, 0.5, 0.8]) for (const c of [0, 0.1, 0.18]) for (const page of ['neutral', 'primary', 'secondary']) {
    const t = generateTheme({ ...DEFAULT_CHOICES, primary: oklchToHex({ l, c, h }), page }).dark;
    const plain = t['--color-background-plain'];
    // Nextcloud's label colour on the exported bar (8% white over the header).
    const label = composite(t['--color-background-plain-text'], 0.7, plain);
    assert.ok(contrast(label, composite('#ffffff', 0.08, plain)) >= 4.5, `${page} ${plain}`);
  }
});

test('the harmony list names both tetradic forms and keeps old links', async () => {
  const { HARMONIES: list } = await import('../src/lib/harmony.ts');
  const label = (id) => list.find((h) => h.id === id)?.label;
  assert.equal(label('tetradic'), 'Tetradic (square)');
  assert.equal(label('rectangle'), 'Tetradic (rectangle)');
  assert.equal(label('accented'), 'Accented analogous');
  assert.equal(decodeChoices('h=tetradic').harmony, 'tetradic');
  assert.equal(decodeChoices('h=rectangle').harmony, 'rectangle');
});
