// node --test tests/ (Node ≥ 22.18 runs the .ts module directly)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import {
  verifyTelegramLogin, oauthHeader, signablePath, seal, unseal, toShelfRecord, toReleaseDetail, formatReleased, safeReturnPath, siteDomain, musicPath, loginHref, vinylColor, vinylPick, safeVinyl, timeLeft, popularTracks, withMatchLinks, toCsv, safeDay, playCount, tracklistToText, textToTracklist, safeStreamingUrl,
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

test('vinyl colour from the format note', () => {
  assert.equal(vinylColor('180 Gram'), null);
  assert.equal(vinylColor('Red [Opaque Apple], 10th Anniversary Edition'), '#c62f34');
  assert.equal(vinylColor('Forest Green, Alternate Cover'), '#1f5f3a');
  assert.equal(vinylColor('White'), '#ece9e2');
  assert.equal(vinylColor('Milky Clear, Art Card'), '#ece9e2a6');
  // the edit page's pick: swatch, custom, see-through; nothing unsafe reaches the style attribute
  assert.equal(vinylPick('#c62f34', '#000000', false), '#c62f34');
  assert.equal(vinylPick('#c62f34', '#000000', true), '#c62f34a6');
  assert.equal(vinylPick('custom', '#12AB34', false), '#12ab34');
  assert.equal(vinylPick('#d8dde673', '', true), '#d8dde673');
  assert.equal(vinylPick('red; background:url(x)', '', false), '');
  assert.equal(safeVinyl('#fff'), null);
  assert.equal(vinylColor('Clear'), '#d8dde673');
  assert.equal(vinylColor('Pink Translucent [Vodka Sauce]'), '#ec74a8a6');
  assert.equal(vinylColor('Blue Sunset Labels, Gatefold'), null);
  assert.equal(vinylColor(''), null);
});

test('tracklist text round trip and streaming links', () => {
  const tracks = [{ position: '', title: 'Side A', duration: '', heading: true }, { position: 'A1', title: 'Lazarus', duration: '6:22', heading: false }, { position: 'A2', title: 'Untimed', duration: '', heading: false }];
  assert.equal(tracklistToText(tracks), '## Side A\nA1 | Lazarus | 6:22\nA2 | Untimed');
  assert.deepEqual(textToTracklist(tracklistToText(tracks)), tracks);
  assert.deepEqual(textToTracklist('Intro | 1:05\nJust a title\n\nB1 | A | B | 3:00'), [
    { position: '', title: 'Intro', duration: '1:05', heading: false },
    { position: '', title: 'Just a title', duration: '', heading: false },
    { position: 'B1', title: 'A | B', duration: '3:00', heading: false },
  ]);
  assert.equal(safeStreamingUrl(' https://open.spotify.com/album/abc ', 'spotify'), 'https://open.spotify.com/album/abc');
  assert.equal(safeStreamingUrl('https://evil.example/album', 'spotify'), null);
  assert.equal(safeStreamingUrl('javascript:alert(1)', 'apple'), null);
  assert.equal(safeStreamingUrl('http://music.apple.com/x', 'apple'), null);
  assert.ok(safeStreamingUrl('https://music.youtube.com/playlist?list=x', 'youtube'));
});

test('owner edits override Discogs key by key', async () => {
  const { recordDefaults, recordValues, shelfView, displayDate } = await import('../src/music/lib.ts');
  const r = { instanceId: 1, releaseId: 2, masterId: 3, artist: 'David Bowie', title: '★', year: 2026, cover: null, labels: 'ISO', format: 'Vinyl, LP', genres: ['Jazz', 'Rock'], styles: ['Art Rock'], added: '2026-10-14T00:00:00-07:00', rating: 0, fields: [{ name: 'Notes', value: 'Gift' }] };
  const d = { released: '2026-07-24', originalYear: 2016, firstReleased: '2016-01-08', country: 'Germany', tracklist: [{ position: 'A1', title: 'Blackstar', duration: '9:57', heading: false }], uri: 'https://www.discogs.com/release/2' };
  const defaults = recordDefaults(r, d);
  assert.equal(defaults.released, '2016-01-08');
  assert.equal(defaults.tracklist, 'A1 | Blackstar | 9:57');
  assert.equal(defaults['field:Notes'], 'Gift');
  const v = recordValues(defaults, { title: 'Blackstar', 'field:Gone': 'x', spotify: 'https://open.spotify.com/album/1' });
  assert.equal(v.title, 'Blackstar');
  assert.equal(v.artist, 'David Bowie');
  assert.equal(v['field:Gone'], undefined);
  assert.equal(displayDate('2016-01-08'), 'January 8, 2016');
  assert.equal(displayDate('around 1975'), 'around 1975');
  const s = shelfView(r, d, { genre: 'Jazz, Art Rock', released: 'January 1975' });
  assert.deepEqual(s.genres, ['Jazz', 'Art Rock']);
  assert.equal(s.releasedYear, 1975);
  assert.equal(s.released, 'January 1975');
  assert.equal(s.trackCount, 1);
  assert.deepEqual(shelfView(r, d, { spotify: 'https://open.spotify.com/album/x' }).links, { spotify: 'https://open.spotify.com/album/x', apple: '', youtube: '' });
  assert.equal(shelfView(r, null, {}).releasedYear, null);
  assert.deepEqual(shelfView({ ...r, genres: ['Folk, World, & Country', 'Rock'] }, null, {}).genres, ['Folk, World, & Country', 'Rock']);
});

test('tracklist: per-track links, side headings, shelf names', async () => {
  const { textToTracklist, tracklistToText, withSideHeadings, shelfName } = await import('../src/music/lib.ts');
  const tracks = textToTracklist('A1 | Lazarus | 6:22 | https://open.spotify.com/track/1 https://music.apple.com/x/song/2 https://evil.example/3\nA2 | Dollar Days | https://music.youtube.com/watch?v=4');
  assert.deepEqual(tracks[0].links, { spotify: 'https://open.spotify.com/track/1', apple: 'https://music.apple.com/x/song/2' });
  assert.equal(tracks[0].duration, '6:22');
  assert.deepEqual(tracks[1], { position: 'A2', title: 'Dollar Days', duration: '', heading: false, links: { youtube: 'https://music.youtube.com/watch?v=4' } });
  assert.deepEqual(textToTracklist(tracklistToText(tracks)), tracks);

  const t = (position) => ({ position, title: position, duration: '', heading: false });
  const two = withSideHeadings([t('A1'), t('A2'), t('B1')]);
  assert.deepEqual(two.map((x) => (x.heading ? `# ${x.title}` : x.position)), ['# Side A', '1', '2', '# Side B', '1']);
  const four = withSideHeadings([t('A1'), t('B1'), t('C1'), t('D1')]);
  assert.deepEqual(four.filter((x) => x.heading).map((x) => x.title), ['Disc 1 · Side A', 'Disc 1 · Side B', 'Disc 2 · Side C', 'Disc 2 · Side D']);
  assert.deepEqual(withSideHeadings([t('1'), t('2')]).map((x) => x.position), ['1', '2']);
  assert.equal(withSideHeadings([t('A1'), t('A2')]).length, 2);
  const own = [{ position: '', title: 'Part one', duration: '', heading: true }, t('A1'), t('B1')];
  assert.deepEqual(withSideHeadings(own), own);

  assert.equal(shelfName(' Artur '), 'artur');
  assert.equal(shelfName('a-r'), 'a-r');
  for (const bad of ['a', '-ab', 'ab-', 'settings', 'Login', 'a b', 'ar.va', 'x'.repeat(31), '']) assert.equal(shelfName(bad), null, bad);
});

test('comment links and notifications', async () => {
  const { linkify, commentNotices } = await import('../src/music/lib.ts');
  assert.deepEqual(linkify('see https://ar-va.com/blog/x, and http://a.b/c?d=1.'), [
    { text: 'see ' }, { url: 'https://ar-va.com/blog/x' }, { text: ', and ' }, { url: 'http://a.b/c?d=1' }, { text: '.' }]);
  assert.deepEqual(linkify('javascript:alert(1) no links'), [{ text: 'javascript:alert(1) no links' }]);

  const base = { authorId: 1, authorName: 'Ann <b>', ownerId: 9, parentAuthorId: null, title: 'Blackstar & co', body: 'Nice <i>', url: 'https://music.ar-va.com/a/1#comment-5' };
  const owner = commentNotices(base);
  assert.equal(owner.length, 1);
  assert.equal(owner[0].chatId, 9);
  assert.match(owner[0].text, /^<b>Ann &lt;b&gt;<\/b> commented on <b>Blackstar &amp; co<\/b>:\n\nNice &lt;i&gt;\n\n<a href="https:\/\/music\.ar-va\.com\/a\/1#comment-5">/);
  assert.deepEqual(commentNotices({ ...base, authorId: 9 }), []); // own shelf: nobody
  const reply = commentNotices({ ...base, parentAuthorId: 4 });
  assert.deepEqual(reply.map((n) => [n.chatId, n.text.includes('replied to your comment')]), [[4, true], [9, false]]);
  assert.deepEqual(commentNotices({ ...base, parentAuthorId: 9 }).map((n) => n.chatId), [9]); // owner replied to: one message
  assert.deepEqual(commentNotices({ ...base, ownerId: null }), []);
});

test('streaming matches, cover sources, gallery', async () => {
  const { pickAlbum, normalizeName, withMatchLinks, safeCoverUrl, gallery, recordDefaults, shelfView, streamingSearch } = await import('../src/music/lib.ts');
  assert.equal(normalizeName('Sherane A.K.A Master Splinter’s Daughter'), normalizeName('Sherane a.k.A Master Splinter\'s Daughter'));
  assert.equal(normalizeName('good kid, m.A.A.d city (Deluxe Version)'), 'good kid m a a d city');
  assert.equal(normalizeName('Ночь'), 'ночь');
  const c = (title, artist = 'Kendrick Lamar') => ({ title, artist });
  assert.equal(pickAlbum([c('good kid, m.A.A.d city (Deluxe Version)'), c('good kid, m.A.A.d city'), c('DAMN.')], 'Kendrick Lamar', 'Good Kid, M.A.A.D City').title, 'good kid, m.A.A.d city');
  assert.equal(pickAlbum([c('good kid, m.A.A.d city (Deluxe Version)')], 'Kendrick Lamar', 'Good Kid, M.A.A.D City').title, 'good kid, m.A.A.d city (Deluxe Version)');
  assert.equal(pickAlbum([c('Good Kid, M.A.A.D City', 'Someone Else')], 'Kendrick Lamar', 'Good Kid, M.A.A.D City'), null);
  assert.equal(pickAlbum([c('Mr. Morale')], 'Kendrick Lamar', 'Good Kid, M.A.A.D City'), null);
  assert.equal(pickAlbum([c('Alfredo', 'Freddie Gibbs & The Alchemist'), c('Alfredo 2', 'Freddie Gibbs & The Alchemist')], 'Freddie Gibbs & The Alchemist', 'Alfredo II').title, 'Alfredo 2');
  assert.equal(pickAlbum([c('★ - Single', 'David Bowie'), c('Blackstar', 'David Bowie')], 'David Bowie', '★ (Blackstar)').title, 'Blackstar');
  assert.equal(normalizeName('I Robot vi'), 'i robot 6');
  assert.equal(pickAlbum([c('Unlocked', 'Denzel Curry & Kenny Beats')], 'Denzel Curry X Kenny Beats', 'Unlocked').title, 'Unlocked');
  assert.equal(pickAlbum([c('At Newport', 'Louis Armstrong & Eddie Condon')], 'Louis Armstrong And Eddie Condon', 'At Newport').title, 'At Newport');
  const { firstArtist } = await import('../src/music/lib.ts');
  assert.equal(firstArtist('Louis Armstrong And Eddie Condon'), 'Louis Armstrong');
  assert.equal(firstArtist('Bernstein Conducts Tchaikovsky, New York Philharmonic'), 'Bernstein Conducts Tchaikovsky');
  assert.equal(firstArtist('Denzel Curry X Kenny Beats'), 'Denzel Curry');

  const m = { apple: { url: 'https://music.apple.com/us/album/1', artwork: 'https://is1-ssl.mzstatic.com/x/1200x1200bb.jpg', tracks: [{ title: 'Sherane a.k.A Master Splinter’s Daughter', url: 'https://music.apple.com/t1' }] },
    spotify: { url: 'https://open.spotify.com/album/s', tracks: [{ title: "Sherane a.k.a Master Splinter's Daughter", url: 'https://open.spotify.com/track/s1' }] } };
  const tracks = [{ position: 'A1', title: "Sherane A.K.A Master Splinter's Daughter", duration: '', heading: false }, { position: 'A2', title: 'Other', duration: '', heading: false, links: { apple: 'https://music.apple.com/mine' } }];
  const linked = withMatchLinks(tracks, m);
  assert.deepEqual(linked[0].links, { apple: 'https://music.apple.com/t1', spotify: 'https://open.spotify.com/track/s1' });
  assert.deepEqual(linked[1].links, { apple: 'https://music.apple.com/mine' });

  assert.ok(safeCoverUrl('https://is3-ssl.mzstatic.com/image/x.jpg'));
  assert.ok(safeCoverUrl('https://i.discogs.com/abc.jpeg'));
  for (const bad of ['https://evil.example/x.jpg', 'http://i.discogs.com/x', 'javascript:alert(1)', '', null]) assert.equal(safeCoverUrl(bad), null);

  assert.deepEqual(gallery('https://i.discogs.com/c', 'https://i.discogs.com/c', ['https://i.discogs.com/p1', 'https://i.discogs.com/p2']), ['https://i.discogs.com/c', 'https://i.discogs.com/p2']);
  assert.deepEqual(gallery('https://is1-ssl.mzstatic.com/a', 'https://i.discogs.com/c', ['https://i.discogs.com/p1', 'https://i.discogs.com/p2']), ['https://is1-ssl.mzstatic.com/a', 'https://i.discogs.com/p1', 'https://i.discogs.com/p2']);

  const r = { instanceId: 1, releaseId: 2, masterId: 0, artist: 'Kendrick Lamar', title: 'Good Kid', year: 2022, cover: 'https://i.discogs.com/c', labels: '', format: '', genres: [], styles: [], added: '2024-12-21T00:00:00-08:00', rating: 0, fields: [] };
  const d = { released: null, originalYear: 2012, country: null, tracklist: tracks, uri: 'https://www.discogs.com/release/2' };
  const defaults = recordDefaults(r, d, m);
  assert.equal(defaults.apple, 'https://music.apple.com/us/album/1');
  assert.match(defaults.tracklist, /https:\/\/open\.spotify\.com\/track\/s1/);
  assert.equal(shelfView(r, d, { cover: 'https://is1-ssl.mzstatic.com/a' }, m).cover, 'https://is1-ssl.mzstatic.com/a');
  assert.equal(shelfView(r, d, { cover: 'https://evil.example/a' }, m).cover, 'https://i.discogs.com/c');
  assert.equal(streamingSearch('a b', 'track').spotify, 'https://open.spotify.com/search/a%20b/tracks');
});

test('runtime and renumber', async () => {
  const { runtime, renumber } = await import('../src/music/lib.ts');
  const tr = (duration, heading = false) => ({ position: '', title: 'x', duration, heading });
  assert.equal(runtime([tr('', true), tr('4:52'), tr('3:08')]), '8 min');
  assert.equal(runtime([tr('45:00'), tr('30:00')]), '1 h 15 min');
  assert.equal(runtime([tr('4:52'), tr('')]), null);
  assert.equal(runtime([tr('abc')]), null);
  assert.equal(runtime([]), null);
  assert.deepEqual(renumber(['A2', 'A1', 'B1', 'A3', 'B2']), ['A1', 'A2', 'B1', 'A3', 'B2']);
  assert.deepEqual(renumber(['3', '1', '2']), ['1', '2', '3']);
  assert.deepEqual(renumber(['CD1-2', '', 'A5']), ['CD1-2', '', 'A1']);
});

test('timeLeft rounds up to days, hours or minutes', () => {
  assert.equal(timeLeft(1000 + 7 * 86400, 1000), '7 days');
  assert.equal(timeLeft(1000 + 86400, 1000), '1 day');
  assert.equal(timeLeft(1000 + 5 * 3600 - 10, 1000), '5 hours');
  assert.equal(timeLeft(1000 + 1800, 1000), '30 minutes');
  assert.equal(timeLeft(1000, 1000), '1 minute');
});

test('popularTracks marks up to 3 tracks clearly ahead in YouTube plays; withMatchLinks adds YouTube links', () => {
  const t = (title) => ({ position: '', title, duration: '', heading: false });
  const tracks = ['★', 'Lazarus', 'Sue', 'Girl Loves Me', 'Dollar Days'].map(t);
  const yt = (pairs) => ({ youtube: { tracks: pairs.map(([title, views]) => ({ title, views, url: `https://music.youtube.com/watch?v=${title}` })) } });
  const m = yt([['★', 1094617], ['Lazarus', 1985839], ['Sue (Or In A Season Of Crime)', 297436], ['Girl Loves Me', 311979], ['Dollar Days', 447650]]);
  assert.deepEqual([...popularTracks(tracks, m).keys()], ['lazarus', '★']); // titleKey keeps "★"
  // evenly played: no marks; too few matched tracks: no marks
  assert.equal(popularTracks(tracks, yt([['★', 100], ['Lazarus', 120], ['Sue', 90], ['Girl Loves Me', 110]])).size, 0);
  assert.equal(popularTracks(tracks, yt([['★', 9000], ['Lazarus', 10]])).size, 0);
  assert.equal(withMatchLinks([t('Sue')], m)[0].links.youtube, 'https://music.youtube.com/watch?v=Sue (Or In A Season Of Crime)');
  // a symbols-only title (★) matches only itself, not the start of every title
  assert.equal(withMatchLinks([t('★')], m)[0].links.youtube, 'https://music.youtube.com/watch?v=★');
  assert.equal(withMatchLinks([t('Unlisted')], m)[0].links, undefined);
  // the owner's own link wins
  assert.equal(withMatchLinks([{ ...t('Sue'), links: { youtube: 'https://music.youtube.com/watch?v=mine' } }], m)[0].links.youtube, 'https://music.youtube.com/watch?v=mine');
});

test('toCsv quotes what needs it, neutralises formulas, starts with a BOM; safeDay takes real days only', () => {
  const csv = toCsv([['Artist', 'Album'], ['Chet Baker', 'Sings, "Vol. 1"'], ['=HYPERLINK("x")', 'line\nbreak']]);
  assert.ok(csv.startsWith('﻿'));
  assert.equal(csv.slice(1), 'Artist,Album\r\nChet Baker,"Sings, ""Vol. 1"""\r\n"\'=HYPERLINK(""x"")","line\nbreak"\r\n');
  assert.equal(safeDay('2024-02-29'), '2024-02-29');
  assert.equal(safeDay('2023-02-29'), null);
  assert.equal(safeDay('2024-13-01'), null);
  assert.equal(safeDay('2024'), null);
});

test('playCount reads YouTube Music play counts', () => {
  assert.equal(playCount('72M plays'), 72_000_000);
  assert.equal(playCount('1.2K plays'), 1200);
  assert.equal(playCount('950 plays'), 950);
  assert.equal(playCount('1,234 plays'), 1234);
  assert.equal(playCount(''), 0);
});
