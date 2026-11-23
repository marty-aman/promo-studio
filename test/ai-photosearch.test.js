import test from 'node:test';
import assert from 'node:assert/strict';
import { photoCacheKey, isFreshPhoto, batches, cosine, visualCut, mixMatches, photosToIndex, normalize, cacheKey, PHOTO_V, PHOTO_BATCH } from '../js/ai/clipsearch.js';
import { filterPhotos } from '../js/manager/photos.js';
import { smartOn } from '../js/ai/panel-photosearch.js';

const store = (v) => ({ getItem: () => v });

test('photo cache key: changes with the file, the model and the photo version, and differs from a video key', () => {
  const k = photoCacheKey('m1', '100-abcd', 'tinyclip');
  assert.equal(k, `m1|100-abcd|tinyclip|p${PHOTO_V}`);
  assert.notEqual(k, photoCacheKey('m1', '100-abce', 'tinyclip'));
  assert.notEqual(k, photoCacheKey('m1', '100-abcd', 'other'));
  assert.notEqual(k, photoCacheKey('m2', '100-abcd', 'tinyclip'));
  assert.notEqual(k, cacheKey('m1', '100-abcd', 'tinyclip'));
});

test('a stored photo entry is fresh only for its key and with a whole vector', () => {
  const key = photoCacheKey('m1', 'fp', 'tinyclip');
  const vec = normalize([1, 2, 3]);
  assert.ok(isFreshPhoto({ key, vec, dim: 3 }, key));
  assert.ok(!isFreshPhoto({ key, vec, dim: 3 }, photoCacheKey('m1', 'fp2', 'tinyclip')));
  assert.ok(!isFreshPhoto({ key, vec: new Float32Array(2), dim: 3 }, key));
  assert.ok(!isFreshPhoto({ key, vec: new Float32Array(0), dim: 0 }, key));
  assert.ok(!isFreshPhoto(null, key));
});

test('batches: runs of the given size, the last one shorter, a bad size treated as 1', () => {
  assert.deepEqual(batches([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4), [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10]]);
  assert.deepEqual(batches([], 4), []);
  assert.deepEqual(batches([1, 2], 0), [[1], [2]]);
  assert.equal(batches(Array.from({ length: 600 }, (_, i) => i)).length, Math.ceil(600 / PHOTO_BATCH));
  assert.ok(PHOTO_BATCH <= 8, 'small batches keep the page responsive');
});

test('photos to index: only records with a file that are not done, in order', () => {
  const recs = [{ id: 'a', blob: 1 }, { id: 'b' }, { id: 'c', blob: 1 }, null, { id: 'd', blob: 1 }];
  const done = new Set(['c']);
  assert.deepEqual(photosToIndex(recs, (r) => done.has(r.id)).map((r) => r.id), ['a', 'd']);
});

test('cosine: dot product of unit vectors, 0 for a length mismatch', () => {
  assert.ok(Math.abs(cosine(normalize([1, 0]), normalize([1, 0])) - 1) < 1e-6);
  assert.ok(Math.abs(cosine(normalize([1, 0]), normalize([0, 1]))) < 1e-6);
  assert.equal(cosine([1, 0], [1, 0, 0]), 0);
  assert.equal(cosine(null, [1]), 0);
});

test('visual cut: only photos that stand out from the rest; nothing when nothing stands out', () => {
  const xs = [...Array(170).fill(0.2), ...Array(30).fill(0.3)];
  const c = visualCut(xs);
  assert.ok(c.cut > 0.2 && c.cut <= 0.3, JSON.stringify(c));
  assert.equal(c.best, 0.3);
  // all about equal: the words describe none of them
  assert.equal(visualCut([0.21, 0.212, 0.209, 0.211]).cut, Infinity);
  assert.equal(visualCut([]).cut, Infinity);
  // a stricter z keeps fewer
  const spreadOut = Array.from({ length: 100 }, (_, i) => 0.2 + i * 0.001);
  const keep = (z) => spreadOut.filter((x) => x >= visualCut(spreadOut, { z }).cut).length;
  assert.ok(keep(2) < keep(1) && keep(1) < keep(0), `${keep(0)} ${keep(1)} ${keep(2)}`);
});

test('mix: text matches first in their own order, then picture matches best first, without repeats, weak ones hidden', () => {
  const P = (id) => ({ id, mediaId: `m-${id}` });
  const pool = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map(P);
  const score = { a: 0.2, b: 0.2, c: 0.35, d: 0.2, e: 0.31, f: 0.2, g: 0.2, h: 0.33, i: 0.2, j: null };
  const text = [pool[3], pool[2]]; // d, c found by words (c also looks like it)
  const r = mixMatches(text, pool, (p) => score[p.id]);
  assert.deepEqual(r.items.map((x) => x.photo.id), ['d', 'c', 'h', 'e']);
  assert.equal(r.nText, 2);
  assert.equal(r.nVisual, 2);
  assert.equal(r.items[0].visual, null);
  assert.equal(r.items[1].visual, null, 'a word match keeps its place and is not marked as a picture match');
  assert.ok(r.items[2].visual.pct >= r.items[3].visual.pct);
  assert.equal(r.items[2].visual.pct, 100);
  assert.ok(r.items[3].visual.pct > 0);
});

test('mix: no vectors yet, or nothing stands out, gives the text matches alone', () => {
  const pool = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(mixMatches([pool[1]], pool, () => null).items.map((x) => x.photo.id), ['b']);
  assert.equal(mixMatches([], pool, () => 0.25).nVisual, 0);
});

test('mix over a real filter: plain text search is unchanged and visual matches only come from the scope', () => {
  const list = [
    { id: '1', mediaId: 'x1', caption: 'drums at practice', credit: '', tags: [], favorite: false, addedAt: 3, folder: '' },
    { id: '2', mediaId: 'x2', caption: 'van', credit: '', tags: [], favorite: true, addedAt: 1, folder: 'f' },
    { id: '3', mediaId: 'x3', caption: '', credit: '', tags: ['live'], favorite: false, addedAt: 2, folder: '' },
    { id: '4', mediaId: 'x4', caption: '', credit: '', tags: [], favorite: false, addedAt: 4, folder: '' },
  ];
  const byWords = filterPhotos(list, { q: 'drums' });
  assert.deepEqual(byWords.map((p) => p.id), ['1']);
  const scope = filterPhotos(list, { tag: 'live' }); // a tag filter narrows the picture matches too
  const r = mixMatches(filterPhotos(list, { q: 'drums', tag: 'live' }), scope, () => 0.3);
  assert.deepEqual(r.items.map((x) => x.photo.id), []);
  const sc = { x1: 0.2, x2: 0.4, x3: 0.2, x4: 0.2 };
  const all = mixMatches(byWords, filterPhotos(list, {}), (p) => sc[p.mediaId]);
  assert.deepEqual(all.items.map((x) => x.photo.id), ['1', '2']);
});

test('smart search switch: on unless turned off; a broken storage counts as on', () => {
  assert.equal(smartOn(store(null)), true);
  assert.equal(smartOn(store('on')), true);
  assert.equal(smartOn(store('off')), false);
  assert.equal(smartOn({ getItem: () => { throw new Error('private'); } }), true);
});
