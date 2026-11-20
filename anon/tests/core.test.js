// npm test: the pure logic in src/lib/core.ts (Node runs .ts directly).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanText, isToken, linkify, newToken, safeBack, sha256, ago } from '../src/lib/core.ts';

test('tokens are 32 URL-safe characters and unique', () => {
  const a = newToken(), b = newToken();
  assert.ok(isToken(a) && isToken(b));
  assert.notEqual(a, b);
  assert.ok(!isToken('short') && !isToken(`${a}x`) && !isToken(a.replace(/./, '/')));
});

test('sha256 is hex and stable', async () => {
  assert.equal(await sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});


test('cleanText trims, unifies line breaks, limits empty lines, drops control characters', () => {
  assert.equal(cleanText('  hi\r\n\r\n\r\n\r\nthere \u0007 '), 'hi\n\nthere');
  assert.equal(cleanText(null), '');
});


test('linkify finds links and leaves trailing punctuation out', () => {
  assert.deepEqual(linkify('see https://ar-va.com/x. ok'), [{ text: 'see ' }, { url: 'https://ar-va.com/x' }, { text: '. ok' }]);
  assert.deepEqual(linkify('javascript:alert(1)'), [{ text: 'javascript:alert(1)' }]);
});

test('safeBack only allows paths on this site', () => {
  assert.equal(safeBack('/p/3#m-3'), '/p/3#m-3');
  for (const bad of ['//evil.example', 'https://evil.example', '/\\evil', '', null]) assert.equal(safeBack(bad), '/admin');
});

test('ago reads naturally', () => {
  assert.equal(ago(1000, 1030), 'just now');
  assert.equal(ago(1000, 1000 + 7200), '2 h ago');
  assert.equal(ago(1000, 1000 + 90000), 'yesterday');
});
