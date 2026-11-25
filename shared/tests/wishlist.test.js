// node --test shared/tests/ (the wishlist's rules: links, wishes, owned records, reservations, reminders)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStreamingLink, toWish, isOwned, reserveState, reminderDue, safeGiveOn } from '../lib/wishlist.ts';

test('album links from the three services', () => {
  assert.deepEqual(parseStreamingLink('https://music.apple.com/ua/album/blackstar/1059043043'), { service: 'apple', id: '1059043043', country: 'ua' });
  assert.deepEqual(parseStreamingLink('https://music.apple.com/us/album/1059043043?i=1'), { service: 'apple', id: '1059043043', country: 'us' });
  assert.deepEqual(parseStreamingLink(' https://open.spotify.com/album/2w1YJXWMIco9EurFGcZbVG?si=x '), { service: 'spotify', id: '2w1YJXWMIco9EurFGcZbVG' });
  assert.deepEqual(parseStreamingLink('https://open.spotify.com/intl-de/album/2w1YJXWMIco9EurFGcZbVG'), { service: 'spotify', id: '2w1YJXWMIco9EurFGcZbVG' });
  assert.deepEqual(parseStreamingLink('https://music.youtube.com/browse/MPREb_abcDEF123'), { service: 'youtube', id: 'MPREb_abcDEF123' });
  assert.deepEqual(parseStreamingLink('https://music.youtube.com/playlist?list=OLAK5uy_kQ1'), { service: 'youtube', id: 'VLOLAK5uy_kQ1' });
  assert.deepEqual(parseStreamingLink('https://www.youtube.com/playlist?list=OLAK5uy_kQ1'), { service: 'youtube', id: 'VLOLAK5uy_kQ1' });
  for (const bad of [
    'https://open.spotify.com/track/2w1YJXWMIco9EurFGcZbVG',
    'https://music.apple.com/us/artist/david-bowie/559',
    'https://music.youtube.com/playlist?list=PLabc',
    'https://evil.example/album/2w1YJXWMIco9EurFGcZbVG',
    'http://open.spotify.com/album/2w1YJXWMIco9EurFGcZbVG',
    'not a link',
  ]) assert.equal(parseStreamingLink(bad), null, bad);
});

test('wishes: text stays text, foreign hosts dropped, limits kept', () => {
  const tracks = Array.from({ length: 301 }, (_, i) => `${i + 1} | Song ${i + 1} | 3:00`).join('\n');
  const w = toWish({ artist: ' David Bowie ', title: '<script>alert(1)</script>', year: '2016', cover: 'https://evil.example/x.jpg', tracklist: tracks,
    links: { spotify: 'https://open.spotify.com/album/x', apple: 'javascript:alert(1)', youtube: '' }, note: 'the\n\n\n\nred one' });
  assert.equal(w.artist, 'David Bowie');
  assert.equal(w.title, '<script>alert(1)</script>');
  assert.equal(w.year, 2016);
  assert.equal(w.cover, null);
  assert.equal(w.tracklist.split('\n').length, 300);
  assert.deepEqual(w.links, { spotify: 'https://open.spotify.com/album/x', apple: '', youtube: '' });
  assert.equal(w.note, 'the\n\nred one');
  assert.equal(toWish({ artist: 'x', title: 'y', cover: 'https://i.scdn.co/image/ab67' }).cover, 'https://i.scdn.co/image/ab67');
  assert.equal(toWish({ artist: 'x', title: 'y', year: '1700' }).year, null);
  assert.equal(toWish({ artist: 'x', title: 'y'.repeat(400) }).title.length, 300);
  assert.deepEqual(toWish({ artist: '', title: 'y' }), { error: 'Add the artist and the album.' });
  // Where to get it: a shop's name and / or link, as text (links are made clickable when shown), one line, capped.
  assert.equal(toWish({ artist: 'x', title: 'y', where: '  Rough Trade https://www.roughtrade.com/x \n\n second line ' }).where, 'Rough Trade https://www.roughtrade.com/x second line');
  assert.equal(toWish({ artist: 'x', title: 'y', where: 'z'.repeat(400) }).where.length, 300);
  assert.equal(toWish({ artist: 'x', title: 'y', where: '   ' }).where, null);
  assert.equal(toWish({ artist: 'x', title: 'y' }).where, null);
  assert.deepEqual(toWish(null), { error: 'Add the artist and the album.' });
});

test('owned: same master, else same release, else same names', () => {
  const shelf = { masters: new Set([10]), releases: new Set([20]), names: new Set() };
  shelf.names.add('alfredo|alfredo 2');
  assert.equal(isOwned({ masterId: 10, releaseId: 99, artist: 'a', title: 'b' }, shelf), true);
  assert.equal(isOwned({ masterId: 0, releaseId: 20, artist: 'a', title: 'b' }, shelf), true);
  assert.equal(isOwned({ masterId: 11, releaseId: 21, artist: 'a', title: 'b' }, shelf), false);
  assert.equal(isOwned({ artist: 'Alfredo', title: 'Alfredo II' }, shelf), true);
  assert.equal(isOwned({ artist: 'Alfredo', title: 'Alfredo III' }, shelf), false);
});

test('who sees what of a reservation', () => {
  assert.equal(reserveState(5, 1, 1), 'none'); // the owner, even though it's reserved
  assert.equal(reserveState(null, 1, 1), 'none');
  assert.equal(reserveState(5, null, 1), 'login'); // logged out: no reserved state
  assert.equal(reserveState(null, 2, 1), 'free');
  assert.equal(reserveState(2, 2, 1), 'mine');
  assert.equal(reserveState(5, 2, 1), 'taken');
});

test('reminders', () => {
  const day = 86400;
  const at = (d) => Date.parse(`${d}T09:00:00Z`) / 1000;
  const r = (o) => ({ created_at: at('2026-12-01'), give_on: null, reminded_at: null, ...o });
  assert.equal(reminderDue(r({ give_on: '2026-12-25' }), '2026-12-22'), 'before');
  assert.equal(reminderDue(r({ give_on: '2026-12-25' }), '2026-12-23'), null);
  assert.equal(reminderDue(r({ give_on: '2026-12-25' }), '2026-12-26'), 'after');
  assert.equal(reminderDue(r({ give_on: '2026-12-25', reminded_at: at('2026-12-22') }), '2026-12-22'), null); // not twice a day
  assert.equal(reminderDue(r({}), '2026-12-14'), null);
  assert.equal(reminderDue(r({}), '2026-12-15'), 'nudge');
  assert.equal(reminderDue(r({ reminded_at: at('2026-12-15') }), '2027-01-13'), null);
  assert.equal(reminderDue(r({ reminded_at: at('2026-12-15') }), '2027-01-14'), 'nudge');
  assert.equal(reminderDue(r({ created_at: at('2026-12-01') - 100 * day, reminded_at: at('2026-11-30') }), '2026-12-01'), null);
});

test('giving dates: today up to a year ahead', () => {
  assert.equal(safeGiveOn('2026-12-25', '2026-11-24'), '2026-12-25');
  assert.equal(safeGiveOn('2026-11-24', '2026-11-24'), '2026-11-24');
  assert.equal(safeGiveOn('2026-11-23', '2026-11-24'), null);
  assert.equal(safeGiveOn('2027-11-25', '2026-11-24'), null);
  assert.equal(safeGiveOn('2026-02-30', '2026-01-01'), null);
  assert.equal(safeGiveOn('', '2026-11-24'), null);
});
