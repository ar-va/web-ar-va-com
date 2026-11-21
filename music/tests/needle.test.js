import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needleDrop, needleLift, surfaceLoop } from '../src/scripts/needle.ts';

// A small seeded random, so the test sees the same drop every time.
const seeded = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const peak = (a) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);

test('needleDrop: a loud landing, a quieter groove, silence at the end, never clipping', () => {
  const sr = 48000;
  const s = needleDrop(sr, 3.6, seeded(7));
  assert.equal(s.length, 3.6 * sr);
  assert.ok(s.every((x) => x >= -1 && x <= 1));
  const landing = s.subarray(0, 0.1 * sr), groove = s.subarray(0.5 * sr, 1.5 * sr), end = s.subarray(s.length - 0.02 * sr);
  assert.ok(peak(landing) > 0.5, `landing peak ${peak(landing)}`);
  assert.ok(rms(groove) > 0.005 && rms(groove) < rms(landing) / 3, `groove ${rms(groove)} vs landing ${rms(landing)}`);
  assert.ok(peak(end) < 0.02, `end peak ${peak(end)}`);
});

test('needleLift: groove thins out, a click as the stylus leaves, a soft knock as the arm rests, then quiet', () => {
  const sr = 48000;
  const s = needleLift(sr, 0.9, seeded(3));
  assert.ok(s.every((x) => x >= -1 && x <= 1));
  const at = (a, b) => s.subarray(Math.round(a * sr), Math.round(b * sr));
  assert.ok(peak(at(0.22, 0.23)) > 0.3, `click ${peak(at(0.22, 0.23))}`);
  assert.ok(peak(at(0.62, 0.7)) > 0.1, `rest ${peak(at(0.62, 0.7))}`);
  assert.ok(rms(at(0.3, 0.6)) < 0.005, `between ${rms(at(0.3, 0.6))}`);
  assert.ok(peak(at(0.88, 0.9)) < 0.02);
});

test('surfaceLoop: faint, no clipping, and loops without a jump at the seam', () => {
  const sr = 48000;
  const s = surfaceLoop(sr, 3.6, seeded(5));
  assert.ok(s.length > 3.5 * sr && s.length < 3.6 * sr);
  assert.ok(rms(s) > 0.003 && rms(s) < 0.04, `rms ${rms(s)}`);
  assert.ok(s.every((x) => x >= -1 && x <= 1));
  assert.ok(Math.abs(s[s.length - 1] - s[0]) < 0.1, `seam ${s[s.length - 1]} → ${s[0]}`);
});
