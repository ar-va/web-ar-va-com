// node --test tests/ (Node ≥ 22.18 runs the .ts module directly)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import {
  verifyTelegramLogin, oauthHeader, signablePath, seal, unseal, toShelfRecord, toReleaseDetail, formatReleased, safeReturnPath, siteDomain, musicPath, loginHref,
} from '../src/music/lib.ts';

const BOT = '123:test-bot-token';
function signed(fields, token = BOT) {
  const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const hash = createHmac('sha256', createHash('sha256').update(token).digest()).update(check).digest('hex');
  return new URLSearchParams({ ...fields, hash });
}

test('Telegram login: valid, tampered, stale, wrong bot', async () => {
  const now = 1_800_000_000;
  const fields = { id: '42', first_name: 'Ada', last_name: 'L', username: 'ada', photo_url: 'https://t.me/i/a.jpg', auth_date: String(now - 60) };
  const p = signed(fields);
  p.set('return', '/arabor/1'); // our own parameter on the auth URL must not break the check
  assert.deepEqual(await verifyTelegramLogin(p, BOT, now), { id: 42, name: 'Ada L', username: 'ada', photoUrl: 'https://t.me/i/a.jpg' });

  const tampered = signed(fields);
  tampered.set('id', '43');
  assert.equal(await verifyTelegramLogin(tampered, BOT, now), null);
  assert.equal(await verifyTelegramLogin(signed({ ...fields, auth_date: String(now - 90_000) }), BOT, now), null);
  assert.equal(await verifyTelegramLogin(signed(fields, 'other'), BOT, now), null);
  assert.equal(await verifyTelegramLogin(signed(fields), '', now), null);
  const noPhoto = await verifyTelegramLogin(signed({ id: '7', username: 'x', auth_date: String(now), photo_url: 'javascript:alert(1)' }), BOT, now);
  assert.deepEqual(noPhoto, { id: 7, name: 'x', username: 'x', photoUrl: null });
});

test('OAuth HMAC-SHA1 matches the OAuth 1.0 spec example', async () => {
  // https://oauth.net/core/1.0/#sig_base_example
  const h = await oauthHeader('GET', 'http://photos.example.net/photos?file=vacation.jpg&size=original',
    { key: 'dpf43f3p2l4k3l03', secret: 'kd94hf93k423kf44' }, { key: 'nnch734d00sl2jdk', secret: 'pfkkdhi9sl3r4s00' }, {}, 1191242096, 'kllo9940pd9333jh');
  assert.match(h, /oauth_signature="tR3%2BTy81lMeYAr%2FFid0kMTYa%2FWM%3D"/);
  assert.match(h, /oauth_signature_method="HMAC-SHA1"/);
  assert.doesNotMatch(h, /kd94hf93k423kf44|pfkkdhi9sl3r4s00/); // no secret leaves the server
});

test('only own collection, identity and public release data can be signed', () => {
  assert.equal(signablePath('/users/arabor/collection/folders/0/releases?per_page=100&page=2', 'arabor'), 'https://api.discogs.com/users/arabor/collection/folders/0/releases?per_page=100&page=2');
  assert.ok(signablePath('/users/arabor/collection/fields', 'arabor'));
  assert.ok(signablePath('/oauth/identity', null));
  assert.ok(signablePath('/releases/37956252', null));
  for (const bad of ['/users/someone/collection/fields', '/users/arabor/collection/folders/0/releases/1/instances/2', '/marketplace/orders',
    'https://evil.example/releases/1', '//evil.example/releases/1', '/users/arabor/wants', '/releases/1/rating/x']) {
    assert.equal(signablePath(bad, 'arabor'), null, bad);
  }
  assert.equal(signablePath('/users/arabor/collection/fields', null), null);
});

test('seal/unseal round trip; another key cannot open it', async () => {
  const sealed = await seal('{"key":"a","secret":"b"}', 'k1');
  assert.notEqual(sealed, await seal('{"key":"a","secret":"b"}', 'k1'));
  assert.equal(await unseal(sealed, 'k1'), '{"key":"a","secret":"b"}');
  await assert.rejects(unseal(sealed, 'k2'));
});

test('collection item → shelf record keeps only public fields, in Discogs order', () => {
  const item = {
    id: 37956252, instance_id: 99, date_added: '2026-10-14T21:19:56-07:00', rating: 5,
    notes: [{ field_id: 1, value: 'Mint (M)' }, { field_id: 3, value: 'Bought used.' }, { field_id: 4, value: '2026-10-14' }, { field_id: 5, value: '45 CAD' }],
    basic_information: {
      master_id: 939598, title: '★ (Blackstar)', year: 2026, cover_image: 'https://i.discogs.com/x.jpeg',
      artists: [{ name: 'Freddie Gibbs', anv: '', join: '&' }, { name: 'The Alchemist (2)', anv: 'Alchemist', join: '' }],
      labels: [{ name: 'Parlophone' }, { name: 'ISO Records' }, { name: 'Parlophone' }],
      formats: [{ name: 'Vinyl', qty: '2', descriptions: ['LP', 'Album'] }],
      genres: ['Jazz', 'Rock'], styles: ['Art Rock', 'Jazz'],
    },
  };
  const fields = [
    { id: 1, name: 'Media Condition', position: 1, public: true },
    { id: 3, name: 'Notes', position: 3, public: true },
    { id: 4, name: 'Purchased Date', position: 2, public: true },
    { id: 5, name: 'Price', position: 4, public: false },
  ];
  const r = toShelfRecord(item, fields);
  assert.equal(r.artist, 'Freddie Gibbs & Alchemist');
  assert.equal(r.labels, 'Parlophone, ISO Records');
  assert.equal(r.format, '2×Vinyl, LP, Album');
  assert.deepEqual(r.genres, ['Jazz', 'Rock']);
  assert.deepEqual(r.styles, ['Art Rock', 'Jazz']);
  assert.deepEqual(r.fields, [
    { name: 'Media Condition', value: 'Mint (M)' },
    { name: 'Purchased Date', value: '2026-10-14' },
    { name: 'Notes', value: 'Bought used.' },
  ]);
  assert.equal(toShelfRecord({ ...item, basic_information: { ...item.basic_information, cover_image: 'https://s.discogs.com/images/spacer.gif' } }, []).cover, null);
  assert.equal(toShelfRecord({ ...item, basic_information: { ...item.basic_information, cover_image: 'javascript:alert(1)' } }, []).cover, null);
});

test('release detail and dates', () => {
  const d = toReleaseDetail({ id: 1, released: '2026-07-24', year: 2026, country: 'Germany',
    tracklist: [{ position: '', title: 'Side A', duration: '', type_: 'heading' }, { position: 'A1', title: '★', duration: '9:57', type_: 'track' }] }, 2016);
  assert.equal(d.originalYear, 2016);
  assert.equal(d.uri, 'https://www.discogs.com/release/1');
  assert.equal(toReleaseDetail({ id: 2, uri: 'javascript:alert(1)' }, null).uri, 'https://www.discogs.com/release/2');
  assert.equal(toReleaseDetail({ id: 3, uri: 'https://www.discogs.com/release/3-X' }, null).uri, 'https://www.discogs.com/release/3-X');
  assert.deepEqual(d.tracklist.map((t) => t.heading), [true, false]);
  assert.equal(formatReleased('2026-07-24'), 'July 24, 2026');
  assert.equal(formatReleased('1977-00-00'), '1977');
  assert.equal(formatReleased('1977-03'), 'March 1977');
  assert.equal(formatReleased(null), null);
});

test('return paths and music paths', () => {
  const h = 'music.ar-va.com';
  assert.equal(safeReturnPath('/arabor/1#comments', h), '/arabor/1#comments');
  assert.equal(safeReturnPath('https://ar-va.com/blog/x#comments', h), 'https://ar-va.com/blog/x#comments');
  assert.equal(safeReturnPath('https://music.ar-va.com/arabor', 'ar-va.com'), 'https://music.ar-va.com/arabor');
  for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'https://ar-va.com.evil.com/', 'https://evilar-va.com/', 'javascript:alert(1)', '', null]) {
    assert.equal(safeReturnPath(bad, h), '/', String(bad));
  }
  assert.equal(siteDomain('music.ar-va.com'), 'ar-va.com');
  assert.equal(siteDomain('ar-va.com'), 'ar-va.com');
  assert.equal(musicPath(new URL('https://music.ar-va.com/music/arabor/1')), '/arabor/1');
  assert.equal(musicPath(new URL('https://music.ar-va.com/music')), '/');
  assert.equal(musicPath(new URL('https://music.ar-va.com/musicals')), '/musicals');
  // login always on the main site, returning to the visitor's page (without the internal /music prefix)
  assert.equal(loginHref(new URL('https://music.ar-va.com/music/arabor/1?x=1')), 'https://ar-va.com/login?return=' + encodeURIComponent('https://music.ar-va.com/arabor/1?x=1'));
  assert.equal(loginHref(new URL('http://music.localhost:4321/music/settings')), 'http://localhost:4321/login?return=' + encodeURIComponent('http://music.localhost:4321/settings'));
  assert.equal(loginHref(new URL('https://ar-va.com/_server-islands/x'), 'https://ar-va.com/blog/a#comments'), 'https://ar-va.com/login?return=' + encodeURIComponent('https://ar-va.com/blog/a#comments'));
});
