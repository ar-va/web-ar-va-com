import test from 'node:test';
import assert from 'node:assert/strict';
import {
  composite, contrast, fitContrast, hexToOklch, hexToRgbList, maxChroma, oklchToHex, parseColor,
} from '../src/lib/color.ts';

test('converts a known colour', () => {
  const c = hexToOklch('#3b82f6');
  assert.ok(Math.abs(c.l - 0.623) < 0.002, `l ${c.l}`);
  assert.ok(Math.abs(c.c - 0.188) < 0.002, `c ${c.c}`);
  assert.ok(Math.abs(c.h - 259.8) < 0.5, `h ${c.h}`);
});

test('round-trips every 17th sRGB value', () => {
  const hex2 = (n) => n.toString(16).padStart(2, '0');
  for (let r = 0; r <= 255; r += 17) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 17) {
    const hex = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
    assert.equal(oklchToHex(hexToOklch(hex)), hex);
  }
});

test('greys have no chroma and keep working through the hue', () => {
  const grey = hexToOklch('#808080');
  assert.ok(grey.c < 0.001);
  assert.equal(oklchToHex(grey), '#808080');
});

test('out-of-gamut colours keep lightness and hue', () => {
  const hex = oklchToHex({ l: 0.7, c: 0.35, h: 150 });
  const back = hexToOklch(hex);
  assert.ok(Math.abs(back.l - 0.7) < 0.01, `l ${back.l}`);
  assert.ok(Math.abs(back.h - 150) < 2, `h ${back.h}`);
});

test('maxChroma is the sRGB edge', () => {
  const edge = maxChroma(0.6, 260);
  assert.ok(edge > 0.1 && edge < 0.3, `edge ${edge}`);
  assert.equal(maxChroma(0, 40), 0);
  assert.equal(maxChroma(1, 40), 0);
  const inside = hexToOklch(oklchToHex({ l: 0.6, c: edge * 0.98, h: 260 }));
  assert.ok(Math.abs(inside.c - edge * 0.98) < 0.004, `c ${inside.c}`);
});

test('contrast', () => {
  assert.equal(contrast('#ffffff', '#000000'), 21);
  assert.equal(contrast('#000000', '#ffffff'), 21);
  assert.equal(contrast('#123456', '#123456'), 1);
  assert.ok(Math.abs(contrast('#777777', '#ffffff') - 4.48) < 0.01);
});

test('parses each format', () => {
  for (const t of ['#f00', '#FF0000', ' #ff0000 ', 'rgb(255, 0, 0)', 'rgb(255 0 0)', 'hsl(0, 100%, 50%)', 'hsl(0 100% 50%)', 'oklch(0.628 0.2577 29.23)', 'oklch(62.8% 0.2577 29.23)']) {
    assert.equal(parseColor(t), '#ff0000', t);
  }
});

test('refuses what is not a colour', () => {
  for (const t of ['', 'red-ish', '#12', '#12345g', 'rgb(1,2)', 'rgb(999,0,0)', 'url(x)', 'hsl(a,b,c)', 'oklch(2 0 0)']) {
    assert.equal(parseColor(t), null, t);
  }
});

test('composite blends over a background', () => {
  assert.equal(composite('#ffffff', 1, '#000000'), '#ffffff');
  assert.equal(composite('#ffffff', 0, '#000000'), '#000000');
  assert.equal(composite('#ffffff', 0.5, '#000000'), '#808080');
});

test('rgb list', () => {
  assert.equal(hexToRgbList('#ff8000'), '255,128,0');
});

test('fitContrast meets the minimum on all backgrounds and keeps hue', () => {
  const start = hexToOklch('#f5c518');
  const fitted = fitContrast(start, ['#ffffff', '#f5f5f5'], 4.5);
  const hex = oklchToHex(fitted);
  assert.ok(contrast(hex, '#ffffff') >= 4.5);
  assert.ok(contrast(hex, '#f5f5f5') >= 4.5);
  assert.ok(Math.abs(hexToOklch(hex).h - start.h) < 8, `h ${hexToOklch(hex).h} vs ${start.h}`);
});

test('fitContrast goes lighter on dark backgrounds', () => {
  const start = hexToOklch('#203080');
  const hex = oklchToHex(fitContrast(start, ['#171717', '#262626'], 4.5));
  assert.ok(hexToOklch(hex).l > start.l);
  assert.ok(contrast(hex, '#262626') >= 4.5);
});

test('fitContrast leaves a colour that already passes alone', () => {
  const start = hexToOklch('#00679e');
  assert.deepEqual(fitContrast(start, ['#ffffff'], 3.2), start);
});

test('fitContrast picks the side that can reach the minimum on a mid background', () => {
  const hex = oklchToHex(fitContrast(hexToOklch('#808080'), ['#808080'], 4.5));
  assert.ok(contrast(hex, '#808080') >= 4.5);
});
