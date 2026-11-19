import test from 'node:test';
import assert from 'node:assert/strict';
import { valueAt, animate, setKey, removeKey, moveKey, clearKeys, allKeys, keyAt, isKeyed, easeFn, snapToBeat, withPath, KF_PROPS, EASES } from '../js/keyframes.js';
import { kfTarget, kfSignature } from '../js/panel-kf.js';
import { newProject, newText } from '../js/state.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('values hold before the first and after the last keyframe, and glide between', () => {
  const ks = [{ t: 1, v: 0, e: 'linear' }, { t: 3, v: 10, e: 'linear' }];
  assert.equal(valueAt(ks, 0), 0);
  near(valueAt(ks, 2), 5);
  assert.equal(valueAt(ks, 5), 10);
  assert.equal(valueAt([], 1), undefined);
  // unsorted input still works
  near(valueAt([{ t: 3, v: 10, e: 'linear' }, { t: 1, v: 0, e: 'linear' }], 2), 5);
});

test('easings: smooth is symmetric, in starts slow, out ends slow, hold jumps, overshoot goes past', () => {
  near(easeFn('smooth')(0.5), 0.5);
  assert.ok(easeFn('in')(0.25) < 0.25 && easeFn('out')(0.25) > 0.25);
  const ks = [{ t: 0, v: 0, e: 'hold' }, { t: 1, v: 1 }];
  assert.equal(valueAt(ks, 0.99), 0);
  assert.equal(valueAt(ks, 1), 1);
  assert.ok(Math.max(...[0.6, 0.7, 0.8, 0.9].map(easeFn('overshoot'))) > 1);
  for (const [id] of EASES) {
    near(easeFn(id)(1), id === 'hold' ? 0 : 1);
    near(easeFn(id)(0), 0);
  }
});

test('setKey adds, updates and inherits the easing; removeKey keeps the last value', () => {
  const clip = { zoom: 1 };
  setKey(clip, 'zoom', 0, 1);
  setKey(clip, 'zoom', 2, 2, 'linear');
  setKey(clip, 'zoom', 1, 1.5); // takes the easing of the key before it
  assert.deepEqual(clip.keys.zoom.map((k) => [k.t, k.v, k.e]), [[0, 1, 'smooth'], [1, 1.5, 'smooth'], [2, 2, 'linear']]);
  setKey(clip, 'zoom', 1.005, 1.7); // within a frame: same keyframe
  assert.equal(clip.keys.zoom.length, 3);
  assert.equal(keyAt(clip, 'zoom', 1).v, 1.7);
  removeKey(clip, 'zoom', 1);
  removeKey(clip, 'zoom', 0);
  removeKey(clip, 'zoom', 2);
  assert.equal(clip.keys, undefined);
  assert.equal(clip.zoom, 2); // no jump when the animation is removed
});

test('moving a keyframe, clearing a property, and listing every keyframe', () => {
  const it = {};
  setKey(it, 'opacity', 0, 0);
  setKey(it, 'opacity', 1, 1);
  setKey(it, 'x', 0.5, 20);
  moveKey(it, 'opacity', 1, 2);
  assert.deepEqual(it.keys.opacity.map((k) => k.t), [0, 2]);
  moveKey(it, 'opacity', 2, 0); // lands on the other one: replaces it
  assert.deepEqual(it.keys.opacity.map((k) => [k.t, k.v]), [[0, 1]]);
  assert.deepEqual(allKeys(it).map((k) => `${k.path}@${k.t}`), ['opacity@0', 'x@0.5']);
  clearKeys(it, 'x', 3);
  assert.equal(it.x, 20);
  assert.ok(!isKeyed(it, 'x'));
});

test('animate sets nested paths without touching the stored item', () => {
  const clip = { id: 'c', grade: { preset: 'mono', saturation: 0 } };
  setKey(clip, 'grade.exposure', 0, 0.5, 'linear');
  setKey(clip, 'grade.exposure', 2, 1.5);
  setKey(clip, 'opacity', 0, 0, 'linear');
  setKey(clip, 'opacity', 1, 1);
  const a = animate(clip, 1);
  near(a.grade.exposure, 1);
  assert.equal(a.grade.preset, 'mono');
  assert.equal(a.opacity, 1);
  assert.equal(clip.grade.exposure, undefined); // stored item unchanged
  const none = { id: 'x' };
  assert.equal(animate(none, 1), none);
  assert.deepEqual(withPath({ a: { b: 1 } }, 'a.c', 2), { a: { b: 1, c: 2 } });
});

test('beat snapping and the property list', () => {
  assert.equal(snapToBeat(0.97, [10, 11, 12], 10, 0.08), 1);
  assert.equal(snapToBeat(0.8, [10, 11, 12], 10, 0.08), 0.8);
  assert.equal(snapToBeat(0.8, [], 10), 0.8);
  for (const kind of ['clip', 'text', 'lyric', 'layer', 'viz']) assert.ok(KF_PROPS[kind].every((p) => p.length === 7 && p[2] < p[3]), kind);
});

test('targets: where each kind of item starts, and its keyframe signature', () => {
  const p = newProject();
  p.song = { mediaId: 's', offset: 20 };
  p.clips = [{ id: 'a', duration: 3 }, { id: 'b', duration: 2 }];
  p.texts = [{ ...newText(4), id: 't1', start: 4, end: 7 }];
  p.lyrics = [{ id: 'l1', text: 'x', start: 22, end: 24 }];
  p.layers = [{ id: 'v', type: 'viz', start: 1 }, { id: 'tab', type: 'tab' }];
  assert.equal(kfTarget(p, { type: 'clip', id: 'b' }).start, 3);
  assert.equal(kfTarget(p, { type: 'text', id: 't1' }).dur, 3);
  assert.equal(kfTarget(p, { type: 'lyric', id: 'l1' }).start, 2); // song 22 is timeline 2
  assert.equal(kfTarget(p, { type: 'layer', id: 'v' }).kind, 'viz');
  assert.equal(kfTarget(p, { type: 'layer', id: 'tab' }).kind, 'layer');
  assert.equal(kfTarget(p, { type: 'song' }), null);
  setKey(p.clips[1], 'zoom', 1, 2);
  assert.equal(kfSignature(p.clips[1]), 'zoom@1:smooth');
});
