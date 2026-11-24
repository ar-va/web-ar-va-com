import test from 'node:test';
import assert from 'node:assert/strict';
import { hexToOklch, maxChroma } from '../src/lib/color.ts';
import { dominantColors } from '../src/lib/image.ts';
import { colorToPoint, pointToColor } from '../src/lib/wheel.ts';

const R = 140;

test('wheel points and colours round-trip', () => {
  for (const [x, y] of [[0, -70], [50, 50], [-90, 20], [10, 120], [-60, -100]]) {
    const back = colorToPoint(pointToColor(x, y, R, 0.6), R);
    assert.ok(Math.abs(back.x - x) < 0.5 && Math.abs(back.y - y) < 0.5, `${x},${y} became ${back.x},${back.y}`);
  }
});

test('the centre of the wheel is grey', () => {
  assert.equal(pointToColor(0, 0, R, 0.6).c, 0);
  const p = colorToPoint({ l: 0.6, c: 0, h: 123 }, R);
  assert.ok(Math.abs(p.x) < 1e-9 && Math.abs(p.y) < 1e-9);
});

test('a point past the rim clamps to the rim', () => {
  const far = pointToColor(5000, 0, R, 0.6);
  const rim = pointToColor(R, 0, R, 0.6);
  assert.ok(Math.abs(far.c - rim.c) < 1e-6);
  assert.ok(Math.abs(far.h - rim.h) < 1e-6);
  assert.ok(far.c <= maxChroma(0.6, far.h) + 1e-6);
});

test('a colour beyond the edge of the screen sits on the rim', () => {
  const p = colorToPoint({ l: 0.6, c: 0.4, h: 200 }, R);
  assert.ok(Math.abs(Math.hypot(p.x, p.y) - R) < 0.01);
});

const image = (pixels) => new Uint8ClampedArray(pixels.flat());

test('finds two flat colours', () => {
  const found = dominantColors(image([...Array(60).fill([230, 110, 80, 255]), ...Array(40).fill([40, 40, 40, 255])]), 5);
  assert.deepEqual([...found].sort(), ['#282828', '#e66e50']);
});

test('prefers the logo colour over a large white background', () => {
  const found = dominantColors(image([...Array(900).fill([255, 255, 255, 255]), ...Array(60).fill([230, 110, 80, 255])]), 5);
  assert.equal(found[0], '#e66e50');
});

test('ignores transparent pixels', () => {
  const found = dominantColors(image([...Array(90).fill([255, 0, 0, 10]), ...Array(10).fill([0, 90, 200, 255])]), 5);
  assert.deepEqual(found, ['#005ac8']);
});

test('an empty or fully transparent image has no colours', () => {
  assert.deepEqual(dominantColors(new Uint8ClampedArray(0), 5), []);
  assert.deepEqual(dominantColors(image(Array(20).fill([9, 9, 9, 0])), 5), []);
});

test('returns at most the number asked for, all distinct', () => {
  const pixels = [];
  for (let i = 0; i < 12; i++) pixels.push(...Array(10).fill([i * 20, 255 - i * 20, (i * 67) % 255, 255]));
  const found = dominantColors(image(pixels), 5);
  assert.ok(found.length <= 5 && found.length >= 2);
  assert.equal(new Set(found).size, found.length);
  for (const hex of found) assert.ok(hexToOklch(hex).l >= 0);
});
