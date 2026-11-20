// EPs and albums, cover art, song sections, the multi-photo carousel and photo in photo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newRelease, normalizeReleases, tracklist, setRelease, moveTrack, deleteRelease, coverOf, parseTime, fmtTime, parseSections, sectionSpans, numberRepeats, normalizeSections, sectionOnTimeline, sectionSlug } from '../js/manager/releases.js';
import { newManager, newSong, normalizeManager } from '../js/manager/model.js';
import { ARTIST_KEYS } from '../js/manager/artists.js';
import { normalizeFiles, setVideo } from '../js/manager/files.js';
import { templateById, carouselSlides, spanPhotos } from '../js/photo/templates.js';
import { newDoc, normalizeDoc } from '../js/photo/model.js';

const mk = () => {
  const m = newManager();
  m.songs = ['One', 'Two', 'Three'].map((t, i) => ({ ...newSong(t), id: `s${i + 1}` }));
  m.releases = [{ ...newRelease('ep', 'Static'), id: 'r1', coverId: 'cov1' }, { ...newRelease('album', 'Big'), id: 'r2' }];
  return m;
};

test('releases: tracklists, moving tracks, deleting', () => {
  const m = mk();
  setRelease(m, 's2', 'r1');
  setRelease(m, 's1', 'r1');
  setRelease(m, 's3', 'r1');
  assert.deepEqual(tracklist(m.songs, 'r1').map((s) => [s.title, s.track]), [['Two', 1], ['One', 2], ['Three', 3]]);
  assert.ok(moveTrack(m, 's3', -1));
  assert.deepEqual(tracklist(m.songs, 'r1').map((s) => s.id), ['s2', 's3', 's1']);
  assert.ok(!moveTrack(m, 's2', -1));
  // moving a song to another release renumbers both
  setRelease(m, 's3', 'r2');
  assert.deepEqual(tracklist(m.songs, 'r1').map((s) => [s.id, s.track]), [['s2', 1], ['s1', 2]]);
  assert.equal(m.songs.find((s) => s.id === 's3').track, 1);
  setRelease(m, 's1', '');
  assert.equal(m.songs.find((s) => s.id === 's1').track, 0);
  deleteRelease(m, 'r1');
  assert.equal(m.releases.length, 1);
  assert.equal(m.songs.find((s) => s.id === 's2').releaseId, '');
  assert.deepEqual(normalizeReleases([{ id: 'x', type: 'weird' }, { title: 'no id' }]).map((r) => r.type), ['ep']);
});

test('covers: a song’s own, else its release’s', () => {
  const m = mk();
  setRelease(m, 's1', 'r1');
  assert.equal(coverOf(m.songs[0], m.releases), 'cov1');
  m.songs[0].coverId = 'own';
  assert.equal(coverOf(m.songs[0], m.releases), 'own');
  assert.equal(coverOf(m.songs[1], m.releases), null);
  assert.equal(coverOf(null, m.releases), null);
});

test('songs, releases and covers survive a save', () => {
  assert.ok(ARTIST_KEYS.includes('releases'));
  const m = normalizeManager({ releases: [{ id: 'r1', type: 'album', title: 'LP' }], songs: [{ id: 'a', title: 'A', releaseId: 'r1', track: '2', coverId: 'c', sections: [{ label: 'Chorus', start: '42', end: 70 }, { start: 'x' }] }, { id: 'b', title: 'B', releaseId: 'gone', track: 3 }] });
  assert.deepEqual([m.songs[0].releaseId, m.songs[0].track, m.songs[0].coverId], ['r1', 2, 'c']);
  assert.deepEqual(m.songs[0].sections.map((s) => [s.label, s.start, s.end]), [['Chorus', 42, 70]]);
  assert.deepEqual([m.songs[1].releaseId, m.songs[1].track], ['', 0]);
  assert.deepEqual(newSong('x').sections, []);
  assert.equal(normalizeFiles({ video: { mediaId: 'v', offset: '8' } }).video.offset, 8);
  const s = newSong('y');
  setVideo(s, { id: 'v2' });
  assert.deepEqual(s.files.video, { mediaId: 'v2', offset: 0 });
});

test('times', () => {
  assert.equal(parseTime('1:05'), 65);
  assert.equal(parseTime('65'), 65);
  assert.equal(parseTime('1:02:03'), 3723);
  assert.equal(parseTime('0:45.5'), 45.5);
  assert.equal(parseTime('soon'), null);
  assert.equal(parseTime(''), null);
  assert.equal(fmtTime(65), '1:05');
  assert.equal(fmtTime(3723), '1:02:03');
  assert.equal(fmtTime(null), '');
});

test('pasted timestamps in the usual shapes', () => {
  const got = parseSections('0:00 Intro\nVerse 0:12\n0:41 - Chorus\n[1:10] Verse\nBridge (1:52 – 2:20)\n\nnothing here\n2:20-2:55 Chorus\n3:05');
  assert.deepEqual(got.map((s) => [s.label, s.start, s.end]), [['Intro', 0, null], ['Verse', 12, null], ['Chorus', 41, null], ['Verse', 70, null], ['Bridge', 112, 140], ['Chorus', 140, 175], ['Part 7', 185, null]]);
  assert.deepEqual(numberRepeats(got).map((s) => s.label), ['Intro', 'Verse 1', 'Chorus 1', 'Verse 2', 'Bridge', 'Chorus 2', 'Part 7']);
});

test('section ends and where they sit in an edit', () => {
  const spans = sectionSpans(normalizeSections([{ label: 'Chorus', start: 41 }, { label: 'Intro', start: 0 }, { label: 'Bridge', start: 112, end: 140 }, { label: 'Outro', start: 175 }]), 200);
  assert.deepEqual(spans.map((s) => [s.label, s.start, s.end, s.length]), [['Intro', 0, 41, 41], ['Chorus', 41, 112, 71], ['Bridge', 112, 140, 28], ['Outro', 175, 200, 25]]);
  assert.equal(sectionSpans([{ label: 'Last', start: 10 }], 0)[0].end, null);
  // an edit that plays the song from 0:30 for 60 s
  assert.deepEqual(sectionOnTimeline({ start: 41, end: 112 }, 30, 60), { from: 11, to: 60 });
  assert.deepEqual(sectionOnTimeline({ start: 0, end: 41 }, 30, 60), { from: 0, to: 11 });
  assert.equal(sectionOnTimeline({ start: 112, end: 140 }, 30, 60), null);
  assert.equal(sectionOnTimeline({ start: 5, end: null }, 0, 60), null);
  assert.equal(sectionSlug({ label: 'Chorus 2!' }, 4), '05-chorus-2');
});

test('the carousel spreads several photos across the slides, blending at the joins', () => {
  const photos = [{ id: 'a', w: 3000, h: 2000 }, { id: 'b', w: 2000, h: 2000 }, { id: 'c', w: 1000, h: 1500 }];
  // widths at 1350 high: 2025 + 1350 + 900 = 4275 → 4 slides of 1080
  assert.equal(carouselSlides(photos), 4);
  assert.equal(carouselSlides([{ id: 'x', w: 100, h: 100 }]), 2);
  const doc = templateById('carousel').build({ band: { name: 'Arc Flash' }, photos, photo: photos[0], today: '2026-01-01' });
  assert.equal(doc.slides, 4);
  const imgs = doc.layers.filter((L) => L.type === 'image');
  assert.deepEqual(imgs.map((L) => L.mediaId), ['a', 'b', 'c']);
  assert.equal(imgs[0].x, 0);
  assert.equal(imgs[0].mask.type, 'none');
  assert.ok(imgs.slice(1).every((L) => L.mask.type === 'fadeLeft' && L.mask.feather > 0 && L.mask.feather < 1));
  // each photo overlaps the one before, and the last reaches the right edge
  for (let i = 1; i < imgs.length; i++) assert.ok(imgs[i].x < imgs[i - 1].x + imgs[i - 1].w, `photo ${i + 1} overlaps`);
  assert.ok(Math.abs(imgs.at(-1).x + imgs.at(-1).w - doc.w) <= 2);
  // the wider photo gets more room
  assert.ok(imgs[0].w > imgs[2].w);
  assert.equal(normalizeDoc(doc).layers.length, doc.layers.length);
  assert.equal(spanPhotos(newDoc({ slides: 2 }), [{ id: 'q' }, { id: 'r' }]).length, 2);
  // one photo still makes the classic wide carousel
  const one = templateById('carousel').build({ band: { name: 'X' }, photo: { id: 'w', w: 6000, h: 2000 }, photos: [{ id: 'w', w: 6000, h: 2000 }] });
  assert.equal(one.layers.filter((L) => L.type === 'image').length, 1);
});

test('photo in photo frames the second photo over the first; covers go on the artwork', () => {
  const ctx = { band: { name: 'Arc Flash' }, song: { title: 'Static Bloom', releaseDate: '2026-04-03' }, today: '2026-03-30', photo: { id: 'back', w: 1600, h: 1000 }, photos: [{ id: 'back', w: 1600, h: 1000 }, { id: 'front', w: 1000, h: 1000 }] };
  const d = templateById('pip').build(ctx);
  const imgs = d.layers.filter((L) => L.type === 'image');
  assert.deepEqual(imgs.map((L) => L.mediaId), ['back', 'front']);
  assert.ok(imgs[0].adjust.blur > 0);
  assert.ok(imgs[1].w < d.w && imgs[1].rot !== 0);
  assert.ok(d.layers.some((L) => L.name === 'Print border' && L.shadow.on));
  assert.ok(d.layers.some((L) => L.text === 'OUT FRIDAY'));
  // with one photo and a cover, the cover is framed
  assert.equal(templateById('pip').build({ ...ctx, photos: [ctx.photo], cover: { id: 'cov', w: 3000, h: 3000 } }).layers.filter((L) => L.type === 'image')[1].mediaId, 'cov');
  // the promo and release templates put the cover on the artwork, the photo behind
  for (const id of ['promo', 'release']) {
    const t = templateById(id).build({ ...ctx, cover: { id: 'cov', w: 3000, h: 3000 } });
    assert.equal(t.layers.find((L) => L.name === 'Artwork').mediaId, 'cov', id);
    assert.equal(t.layers.find((L) => L.name === 'Background').mediaId, 'back', id);
  }
});
