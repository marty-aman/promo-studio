import test from 'node:test';
import assert from 'node:assert/strict';
import { addPhotos, normalizePhotos, filterPhotos, photoTags, toggleEpkPhoto, epkCredits, EPK_PHOTO_MAX } from '../js/manager/photos.js';
import { newManager, normalizeManager } from '../js/manager/model.js';
import { workspaceFrom, viewOf, mergeView, addArtist, ARTIST_KEYS } from '../js/manager/artists.js';
import { epkHTML } from '../js/manager/extras.js';

test('photos are added newest first, without repeats', () => {
  const m = newManager();
  assert.equal(addPhotos(m, [{ id: 'a' }, { id: 'b' }], 1000), 2);
  assert.equal(addPhotos(m, [{ id: 'a' }, { id: 'c' }], 2000), 1);
  assert.deepEqual(m.photos.map((p) => p.mediaId), ['c', 'a', 'b']);
});

test('search, tags, stars and the press-kit filter', () => {
  const m = newManager();
  addPhotos(m, [{ id: 'a' }, { id: 'b' }, { id: 'c' }], 1000);
  const [a, b, c] = m.photos;
  Object.assign(a, { caption: 'Live at El Corazon', credit: 'Jo Lee', tags: ['live', '2026'] });
  Object.assign(b, { caption: 'Press shot', tags: ['press'], favorite: true });
  Object.assign(c, { tags: ['live'] });
  const names = { a: 'IMG_001.jpg', b: 'press.jpg', c: 'crowd-van.jpg' };
  const ids = (o) => filterPhotos(m.photos, { nameOf: (id) => names[id], ...o }).map((p) => p.mediaId);
  assert.deepEqual(ids({}), ['b', 'a', 'c'], 'starred first, then newest');
  assert.deepEqual(ids({ q: 'corazon' }), ['a']);
  assert.deepEqual(ids({ q: 'jo' }), ['a'], 'photographer');
  assert.deepEqual(ids({ q: 'van' }), ['c'], 'file name');
  assert.deepEqual(ids({ tag: 'live' }), ['a', 'c']);
  assert.deepEqual(ids({ starred: true }), ['b']);
  assert.deepEqual(ids({ epk: ['a'] }), ['a']);
  assert.deepEqual(photoTags(m.photos)[0], { tag: 'live', n: 2 });
});

test('the press kit holds up to four photos and credits the photographers', () => {
  const band = {};
  for (const id of ['a', 'b', 'c', 'd']) assert.equal(toggleEpkPhoto(band, id), true);
  assert.equal(toggleEpkPhoto(band, 'e'), false);
  assert.equal(band.epkPhotos.length, EPK_PHOTO_MAX);
  assert.equal(toggleEpkPhoto(band, 'b'), true);
  assert.deepEqual(band.epkPhotos, ['a', 'c', 'd']);
  const photos = normalizePhotos([{ mediaId: 'a', credit: 'Jo Lee' }, { mediaId: 'c' }]);
  assert.deepEqual(epkCredits(photos, ['a', 'c', 'zz']), ['Photo: Jo Lee', '', '']);
  const html = epkHTML({ ...newManager(), band: { name: 'Arc Flash', links: {} } }, { photos: ['data:image/jpeg;base64,AAAA'], credits: ['Photo: Jo <Lee>'] });
  assert.ok(html.includes('<figcaption>Photo: Jo &lt;Lee&gt;</figcaption>'));
});

test('photos belong to each artist and survive saves', () => {
  assert.ok(ARTIST_KEYS.includes('photos'));
  let ws = workspaceFrom(newManager());
  const v = viewOf(ws);
  addPhotos(v, [{ id: 'arc1' }]);
  v.band.epkPhotos = ['arc1'];
  ws = mergeView(ws, v);
  const [ws2, other] = addArtist(ws, 'Static Ritual');
  assert.deepEqual(viewOf(ws2, other).photos, []);
  assert.deepEqual(viewOf(ws2).photos.map((p) => p.mediaId), ['arc1']);
  assert.deepEqual(viewOf(ws2).band.epkPhotos, ['arc1']);
  const m = normalizeManager({ photos: [{ mediaId: 'x' }, { mediaId: 'x' }, { nope: 1 }], band: { epkPhotos: ['x', 3, 'y', 'z', 'w', 'v'] } });
  assert.equal(m.photos.length, 1);
  assert.deepEqual(m.band.epkPhotos, ['x', 'y', 'z', 'w']);
});
