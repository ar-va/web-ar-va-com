import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needleDrop } from '../src/scripts/needle.ts';

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
