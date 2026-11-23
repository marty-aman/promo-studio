import test from 'node:test';
import assert from 'node:assert/strict';
import { pinchScale, scrollDelta, keyboardInset, dropAfter, previewSize, isDoubleTap, dist, mid, cropShift } from '../js/photo/gesture.js';

test('pinch scales the view by how far the fingers spread, within limits', () => {
  assert.equal(pinchScale({ scale0: 0.4, d0: 100, d1: 200, min: 0.3, max: 3 }), 0.8);
  assert.equal(pinchScale({ scale0: 0.4, d0: 100, d1: 10, min: 0.3, max: 3 }), 0.3);
  assert.equal(pinchScale({ scale0: 0.4, d0: 100, d1: 5000, min: 0.3, max: 3 }), 3);
  assert.equal(pinchScale({ scale0: 0.4, d0: 0, d1: 50, min: 0.3, max: 3 }), 0.4);
  assert.equal(dist({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.deepEqual(mid({ x: 0, y: 0 }, { x: 4, y: 10 }), { x: 2, y: 5 });
});

test('the point under the fingers stays put when the scale changes', () => {
  // design point (100, 50) was under the fingers; the design is now drawn at scale 2 with its corner at (10, 20)
  const d = scrollDelta({ anchor: { x: 100, y: 50 }, scale: 2, box: { x: 10, y: 20 }, mid: { x: 150, y: 90 } });
  assert.deepEqual(d, { x: 60, y: 30 });
});

test('a keyboard is only a gap of more than browser-bar size', () => {
  assert.equal(keyboardInset(844, { height: 540, offsetTop: 0 }), 304);
  assert.equal(keyboardInset(844, { height: 790, offsetTop: 0 }), 0);
  assert.equal(keyboardInset(844, null), 0);
});

test('dropping a layer puts it just in front of the one it lands on', () => {
  const L = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  assert.deepEqual(dropAfter(L, 'a', 'c').map((x) => x.id), ['b', 'c', 'a', 'd']);
  assert.deepEqual(dropAfter(L, 'd', 'a').map((x) => x.id), ['a', 'd', 'b', 'c']);
  assert.equal(dropAfter(L, 'a', 'a'), L);
  assert.equal(dropAfter(L, 'zz', 'a'), L);
  assert.equal(dropAfter(L, 'a', 'zz'), L);
});

test('big photos get a smaller editing copy, small ones are left alone', () => {
  assert.deepEqual(previewSize(4000, 3000), { w: 2048, h: 1536 });
  assert.deepEqual(previewSize(3000, 6000), { w: 1024, h: 2048 });
  assert.equal(previewSize(2048, 1000), null);
  assert.equal(previewSize(2300, 1000), null);
});

test('dragging a cropped photo moves it with the finger', () => {
  // 2000x1000 photo in a 500x500 box, cover: drawn 1000 wide, 500 of it hidden sideways
  const g = { fit: 'cover', iw: 2000, ih: 1000, bw: 500, bh: 500, zoom: 1 };
  assert.deepEqual(cropShift(g, 100, 40), { fx: -0.2, fy: 0 });
  assert.equal(cropShift({ ...g, zoom: 2 }, 0, 100).fy, -0.2);
  assert.deepEqual(cropShift({ ...g, fit: 'stretch' }, 50, 50), { fx: 0, fy: 0 });
  // contain: photo drawn 500x250, 250 of free room above and below
  assert.deepEqual(cropShift({ ...g, fit: 'contain' }, 40, 50), { fx: 0, fy: 0.2 });
});

test('double tap needs a quick second tap close to the first', () => {
  assert.equal(isDoubleTap({ t: 0, x: 10, y: 10 }, { t: 300, x: 15, y: 12 }), true);
  assert.equal(isDoubleTap({ t: 0, x: 10, y: 10 }, { t: 900, x: 10, y: 10 }), false);
  assert.equal(isDoubleTap({ t: 0, x: 10, y: 10 }, { t: 100, x: 200, y: 10 }), false);
  assert.equal(isDoubleTap(null, { t: 1, x: 0, y: 0 }), false);
});
