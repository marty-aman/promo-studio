// The profile photo's framing (band.photoPos): the pure helpers, old saves, and the press kit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { photoPos, photoStyle, photoStyleCss, nudgePhoto, artistList, workspaceFrom } from '../js/manager/artists.js';
import { newManager, normalizeManager } from '../js/manager/model.js';
import { epkHTML } from '../js/manager/extras.js';

test('photoPos: centre at 1x by default, numbers clamped', () => {
  assert.deepEqual(photoPos(undefined), { x: 50, y: 50, zoom: 1 });
  assert.deepEqual(photoPos(null), { x: 50, y: 50, zoom: 1 });
  assert.deepEqual(photoPos({ x: 20, y: 80, zoom: 2 }), { x: 20, y: 80, zoom: 2 });
  assert.deepEqual(photoPos({ x: -5, y: 140, zoom: 9 }), { x: 0, y: 100, zoom: 3 });
  assert.deepEqual(photoPos({ x: 'a', y: NaN, zoom: 0 }), { x: 50, y: 50, zoom: 1 });
});

test('photoStyle and photoStyleCss', () => {
  assert.deepEqual(photoStyle(), { objectFit: 'cover', objectPosition: '50% 50%', transformOrigin: '50% 50%', transform: '' });
  assert.deepEqual(photoStyle({ x: 25, y: 10, zoom: 1.5 }), { objectFit: 'cover', objectPosition: '25% 10%', transformOrigin: '25% 10%', transform: 'scale(1.5)' });
  assert.equal(photoStyleCss({ x: 33.3333, y: 0, zoom: 2 }), 'object-fit:cover;object-position:33.33% 0%;transform-origin:33.33% 0%;transform:scale(2)');
  // nothing from the save reaches the CSS except clamped numbers
  assert.ok(!photoStyleCss({ x: '1;background:url(x)', y: 2 }).includes('url'));
});

test('nudgePhoto: dragging right shows more of the left, scaled by zoom, stays in range', () => {
  assert.deepEqual(nudgePhoto({ x: 50, y: 50, zoom: 1 }, 10, 0, 100, 100), { x: 40, y: 50, zoom: 1 });
  assert.deepEqual(nudgePhoto({ x: 50, y: 50, zoom: 2 }, 0, -10, 100, 100), { x: 50, y: 55, zoom: 2 });
  assert.deepEqual(nudgePhoto({ x: 5, y: 50 }, 500, 0, 100, 100), { x: 0, y: 50, zoom: 1 });
  assert.deepEqual(nudgePhoto(undefined, 0, 0, 0, 0), { x: 50, y: 50, zoom: 1 }); // a zero-size frame
});

test('old saves load unchanged; a bad photoPos is dropped', () => {
  const old = normalizeManager({ band: { name: 'A', photoId: 'img' } });
  assert.equal('photoPos' in old.band, false);
  assert.deepEqual(normalizeManager({ band: { photoPos: { x: 10, y: 20, zoom: 2 } } }).band.photoPos, { x: 10, y: 20, zoom: 2 });
  assert.equal('photoPos' in normalizeManager({ band: { photoPos: 'centre' } }).band, false);
  assert.equal('photoPos' in normalizeManager({ band: { photoPos: [1, 2] } }).band, false);
});

test('the artist list and the press kit carry the framing', () => {
  const m = newManager();
  m.band.photoId = 'img';
  m.band.photoPos = { x: 30, y: 70, zoom: 1.2 };
  assert.deepEqual(artistList(workspaceFrom(m))[0].photoPos, { x: 30, y: 70, zoom: 1.2 });
  const html = epkHTML(m, { avatar: 'data:image/jpeg;base64,AAAA' });
  assert.ok(html.includes('style="object-fit:cover;object-position:30% 70%;transform-origin:30% 70%;transform:scale(1.2)"'));
});
