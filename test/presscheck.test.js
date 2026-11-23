import test from 'node:test';
import assert from 'node:assert/strict';
import { newManager, newSong, newShow } from '../js/manager/model.js';
import { pressCheck, pressScore, BIO_MIN, BIO_MAX, PRESS_PHOTO_MIN } from '../js/manager/presscheck.js';

const TODAY = '2030-06-01';
const IDS = ['bio', 'photo', 'pressPhoto', 'video', 'stats', 'email', 'social', 'song', 'shows'];

function good() {
  const m = newManager();
  m.band = { ...m.band, bio: 'Arc Flash is a Seattle alt-metal and emocore band that trades clean vocals with screams and has opened for touring acts.', photoId: 'p1', epkPhotos: ['p2'], contactEmail: 'band@example.com', links: { instagram: 'https://instagram.com/arcflash', youtube: 'https://youtube.com/@arcflash' } };
  const s = newSong('Static');
  s.status = 'released';
  s.releaseDate = '2030-01-01';
  s.links.spotify = 'https://open.spotify.com/track/abc';
  m.songs.push(s);
  const sh = newShow('2030-07-01');
  sh.status = 'confirmed';
  m.shows.push(sh);
  m.stats.imports.push({ id: 'i', at: '2030-05-20T10:00:00.000Z' });
  const sizes = { p1: { width: 800, height: 800 }, p2: { width: 3000, height: 2000 } };
  return { m, sizeOf: (id) => sizes[id] ?? null, sizes };
}
const run = ({ m, sizeOf }) => pressCheck({ band: m.band, songs: m.songs, photos: m.photos, stats: m.stats, shows: m.shows, today: TODAY, sizeOf });
const by = (checks, id) => checks.find((c) => c.id === id);

test('a complete profile passes every check, in a fixed order, and the score says what it counts', () => {
  const c = run(good());
  assert.deepEqual(c.map((x) => x.id), IDS);
  for (const x of c) assert.equal(x.state, 'pass', x.id);
  for (const x of c) assert.equal(x.fix, '', 'a pass has no fix');
  assert.deepEqual(pressScore(c), { pass: 9, total: 9 });
});

test('every check that fails says how to fix it and where', () => {
  const c = pressCheck({ today: TODAY });
  for (const x of c) {
    assert.notEqual(x.state, 'pass', x.id);
    assert.ok(x.fix.length > 10, x.id);
    assert.ok(['epk', 'photos', 'stats', 'songs', 'shows'].includes(x.page), x.id);
  }
  assert.deepEqual(pressScore(c), { pass: 0, total: 9 });
});

test('bio: missing, too short, too long', () => {
  const g = good();
  g.m.band.bio = '';
  assert.match(by(run(g), 'bio').detail, /No bio/);
  g.m.band.bio = 'x'.repeat(BIO_MIN - 1);
  assert.equal(by(run(g), 'bio').state, 'warn');
  g.m.band.bio = `${'Word '.repeat(BIO_MAX / 4)}\n\nSecond paragraph.`;
  assert.equal(by(run(g), 'bio').state, 'warn');
  g.m.band.bio = `${'y'.repeat(BIO_MIN)}\n\n${'z'.repeat(2000)}`;
  assert.equal(by(run(g), 'bio').state, 'pass', 'only the first paragraph counts');
  assert.equal(by(run(g), 'bio').field, 'epk-bio');
});

test('profile photo: none, missing from the library, set', () => {
  const g = good();
  g.m.band.photoId = null;
  assert.equal(by(run(g), 'photo').state, 'warn');
  g.m.band.photoId = 'gone';
  assert.match(by(run(g), 'photo').detail, /no longer in the media library/);
  g.m.band.photoId = 'p1';
  assert.equal(by(run(g), 'photo').state, 'pass');
});

test('press photo: none picked, too small, size unknown, big enough', () => {
  const g = good();
  g.m.band.epkPhotos = [];
  assert.equal(by(run(g), 'pressPhoto').state, 'warn');
  g.m.band.epkPhotos = ['p1'];
  const small = by(run(g), 'pressPhoto');
  assert.equal(small.state, 'warn');
  assert.match(small.detail, /800 px/);
  g.sizes.p3 = { width: 0, height: 0 }; // not loaded yet
  g.m.band.epkPhotos = ['p3'];
  const unk = by(run(g), 'pressPhoto');
  assert.equal(unk.state, 'unknown');
  assert.match(unk.detail, /Can’t tell/);
  assert.equal(by(pressCheck({ band: { epkPhotos: ['x'] }, today: TODAY }), 'pressPhoto').state, 'unknown', 'no size lookup at all');
  g.m.band.epkPhotos = ['p3', 'p2'];
  assert.equal(by(run(g), 'pressPhoto').state, 'pass');
  g.sizes.p2 = { width: PRESS_PHOTO_MIN, height: 10 };
  assert.equal(by(run(g), 'pressPhoto').state, 'pass', 'the long side counts');
  assert.equal(pressScore(run({ ...g, m: { ...g.m, band: { ...g.m.band, epkPhotos: ['p3'] } } })).pass, 8, 'can’t tell is not a pass');
});

test('video link: band YouTube, a song’s YouTube, none', () => {
  const g = good();
  g.m.band.links.youtube = '';
  assert.equal(by(run(g), 'video').state, 'warn');
  g.m.songs[0].links.youtube = 'https://youtu.be/abc';
  assert.equal(by(run(g), 'video').state, 'pass');
  g.m.songs[0].links.youtube = 'javascript:alert(1)';
  assert.equal(by(run(g), 'video').state, 'warn');
});

test('latest numbers: within 90 days passes, older or none warns', () => {
  const g = good();
  assert.match(by(run(g), 'stats').detail, /12 days ago/);
  g.m.stats.imports = [{ at: '2030-01-01T00:00:00Z' }];
  assert.equal(by(run(g), 'stats').state, 'warn');
  g.m.stats.imports = [{ at: '2030-01-01T00:00:00Z' }, { at: '2030-03-04T00:00:00Z' }];
  assert.equal(by(run(g), 'stats').state, 'pass', 'the newest import counts (89 days)');
  g.m.stats.imports = [];
  assert.match(by(run(g), 'stats').detail, /No streaming stats/);
});

test('contact email and social links', () => {
  const g = good();
  g.m.band.contactEmail = 'nope';
  assert.match(by(run(g), 'email').detail, /doesn’t look valid/);
  g.m.band.contactEmail = '';
  assert.equal(by(run(g), 'email').state, 'warn');
  g.m.band.links = { website: 'https://arcflash.example' };
  assert.equal(by(run(g), 'social').state, 'warn');
  g.m.band.links = { tiktok: 'https://tiktok.com/@arcflash' };
  assert.equal(by(run(g), 'social').state, 'pass');
});

test('released song with links, and upcoming shows', () => {
  const g = good();
  g.m.songs[0].links.spotify = '';
  assert.match(by(run(g), 'song').detail, /no streaming links/);
  g.m.songs[0].status = 'ready';
  g.m.songs[0].releaseDate = '2031-01-01';
  assert.match(by(run(g), 'song').detail, /No released song/);
  g.m.songs[0].releaseDate = '2030-05-01';
  g.m.songs[0].links.bandcamp = 'https://arcflash.bandcamp.com/track/static';
  assert.equal(by(run(g), 'song').state, 'pass', 'a past release date counts as released');
  g.m.shows[0].status = 'idea';
  assert.equal(by(run(g), 'shows').state, 'warn');
  g.m.shows[0].status = 'confirmed';
  g.m.shows[0].date = '2030-05-01';
  assert.equal(by(run(g), 'shows').state, 'warn', 'a past show is not upcoming');
});
