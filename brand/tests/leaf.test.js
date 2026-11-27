import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readLeaf, contact } from '../src/lib/leaf.ts';

const file = (name) => readFileSync(new URL(`../logo/${name}`, import.meta.url), 'utf8');
const full = file('arva-mark-ink.svg');

test('the full leaf is nine lobes and nine notches, alternating, largest at the tip', () => {
  const { circles } = readLeaf(full);
  assert.equal(circles.length, 18);
  circles.forEach((c, i) => assert.equal(c.kind, i % 2 ? 'notch' : 'lobe'));
  const lobes = circles.filter((c) => c.kind === 'lobe').map((c) => c.r);
  assert.equal(Math.max(...lobes), 11.73);
  const tip = lobes.indexOf(11.73);
  for (let i = 1; i <= tip; i++) assert.ok(lobes[i] >= lobes[i - 1], `side one grows to the tip at ${i}`);
  for (let i = tip + 1; i < lobes.length; i++) assert.ok(lobes[i] <= lobes[i - 1], `side two shrinks from the tip at ${i}`);
});

test('the axis from the base to the tip leans at 45°', () => {
  const { base, tip } = readLeaf(full);
  const angle = (Math.atan2(base[1] - tip[1], tip[0] - base[0]) * 180) / Math.PI;
  assert.ok(Math.abs(angle - 45) < 0.2, `angle ${angle}`);
});

test('the full leaf has a stem and a midrib', () => {
  const { stem, midrib } = readLeaf(full);
  assert.equal(stem.length, 4);
  assert.equal(midrib.length, 3);
});

test('the small leaf is seven and seven, without a midrib', () => {
  const { circles, midrib } = readLeaf(file('arva-mark-small-ink.svg'));
  assert.equal(circles.length, 14);
  assert.equal(midrib, null);
});

test('a lobe that stops touching its notch fails the build', () => {
  assert.throws(() => readLeaf(full.replace('A11.73 11.73', 'A12.5 12.5')), /touch/);
});

test('a path the reader can’t follow fails with a plain message', () => {
  assert.throws(() => readLeaf('<svg><path d="M1,1L2,2L3,3L4,4Z"/></svg>'), /no arcs/);
});

test('the touching point lies on both circles', () => {
  const { circles } = readLeaf(full);
  circles.forEach((a, i) => {
    const b = circles[(i + 1) % circles.length];
    const [x, y] = contact(a, b);
    assert.ok(Math.abs(Math.hypot(x - a.cx, y - a.cy) - a.r) < 0.02);
    assert.ok(Math.abs(Math.hypot(x - b.cx, y - b.cy) - b.r) < 0.02);
  });
});
