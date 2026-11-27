import test from 'node:test';
import assert from 'node:assert/strict';
import { videoLayers, planLayerMove, planMoveTo, applyLayerMove } from '../js/studioedit.js';
import { planMove, applyMove } from '../js/multimove.js';
import { newProject, createStore, findClip } from '../js/state.js';

let n = 0;
const id = (p) => `${p}_ml${++n}`;
const clip = (cid, start, duration, extra = {}) => ({ id: cid, mediaId: 'm1', kind: 'video', start, in: 1, duration, speed: 1, ...extra });

/** Two video layers (bottom A, top B) with a tab chart between them, a main clip and a text. */
const proj = () => {
  const p = newProject();
  p.duration = 30;
  p.clips = [{ id: 'm1c', mediaId: 'm1', kind: 'image', in: 0, duration: 4, speed: 1 }];
  p.layers = [
    { id: 'A', type: 'video', name: 'Layer A', visible: true, opacity: 1, clips: [clip('a1', 2, 3, { keys: { opacity: [{ t: 1, v: 0.5 }] }, disabled: true, sync: { at: 4 }, filter: { preset: 'noir' }, credit: 'Pexels: Jo' }), clip('a2', 10, 2)] },
    { id: 'tab', type: 'tab', name: 'Tab', mediaId: 't1', offset: 0 },
    { id: 'B', type: 'video', name: 'Layer B', visible: true, opacity: 1, clips: [clip('b1', 6, 3)] },
  ];
  p.texts = [{ id: 't1', text: 'hi', start: 1, end: 2 }];
  return p;
};

test('videoLayers lists only video layers, bottom to top', () => {
  assert.deepEqual(videoLayers(proj()).map((L) => L.id), ['A', 'B']);
});

test('moving a clip up one row puts it on the next video layer at the same time, with every setting', () => {
  const p = proj();
  const before = structuredClone(findClip(p, 'a1').clip);
  const plan = planMoveTo(p, ['a1'], 'B');
  assert.equal(plan.error, undefined);
  const r = applyLayerMove(p, plan, id);
  assert.deepEqual(r.layers, ['B']);
  const f = findClip(p, 'a1');
  assert.equal(f.layer.id, 'B');
  assert.deepEqual(f.clip, before); // keyframes, off state, sound sync, effects and credit all kept
  assert.equal(p.layers.length, 3, 'no layer made or removed');
});

test('a delta moves the clip in time as it changes layer', () => {
  const p = proj();
  applyLayerMove(p, planMoveTo(p, ['a1'], 'B', 0.5), id);
  assert.equal(findClip(p, 'a1').clip.start, 2.5);
});

test('the layer a clip leaves stays, even when it is empty', () => {
  const p = proj();
  applyLayerMove(p, planMoveTo(p, ['b1'], 'A', 10), id); // 16..19 on A: free
  assert.equal(p.layers.find((L) => L.id === 'B').clips.length, 0);
  assert.ok(p.layers.find((L) => L.id === 'B'));
});

test('landing on a clip of the target layer is refused, nothing is overwritten', () => {
  const p = proj();
  const plan = planMoveTo(p, ['b1'], 'A', 4); // 10..13 hits a2 (10..12)
  assert.match(plan.error, /Layer A already has a clip from 10\.0s to 12\.0s/);
  const snap = JSON.stringify(p);
  applyLayerMove(p, plan, id);
  assert.equal(JSON.stringify(p), snap);
  // just touching an edge is fine
  assert.equal(planMoveTo(p, ['b1'], 'A', 6).error, undefined); // 12..15
});

test('a turned-off clip still counts as taken', () => {
  const p = proj();
  assert.match(planMoveTo(p, ['b1'], 'A', -4).error, /already has a clip/); // 2..5 hits a1, which is off
});

test('New layer goes right over the top video layer; below goes right under the bottom one', () => {
  const p = proj();
  const r = applyLayerMove(p, planMoveTo(p, ['a1'], 'new'), id);
  assert.equal(r.made.length, 1);
  assert.deepEqual(p.layers.map((L) => L.id), ['A', 'tab', 'B', r.made[0]]);
  assert.equal(p.layers[3].name, 'Video layer 3');
  assert.equal(p.layers[3].type, 'video');
  assert.equal(findClip(p, 'a1').layer.id, r.made[0]);
  const q = proj();
  const r2 = applyLayerMove(q, planMoveTo(q, ['b1'], 'below'), id);
  assert.deepEqual(q.layers.map((L) => L.id), [r2.made[0], 'A', 'tab', 'B']);
  assert.equal(findClip(q, 'b1').layer.id, r2.made[0]);
});

test('rows past the top make as many new layers as needed', () => {
  const p = proj();
  const plan = planLayerMove(p, ['a1'], 3);
  assert.equal(plan.newAbove, 2);
  const r = applyLayerMove(p, plan, id);
  assert.equal(findClip(p, 'a1').layer.id, r.made[1]);
  assert.equal(videoLayers(p).length, 4);
});

test('a multi-selection moves by the same row offset; main clips and other items are left on their rows', () => {
  const p = proj();
  p.layers[2].clips = [];
  const plan = planLayerMove(p, ['a1', 'a2', 'm1c', 't1'], 1);
  assert.equal(plan.moves.length, 2);
  applyLayerMove(p, plan, id);
  assert.equal(findClip(p, 'a1').layer.id, 'B');
  assert.equal(findClip(p, 'a2').layer.id, 'B');
  assert.equal(findClip(p, 'm1c').layer, null);
});

test('a group spread over two layers moves up together; the top one gets a new layer', () => {
  const p = proj();
  const plan = planLayerMove(p, ['a2', 'b1'], 1);
  assert.equal(plan.newAbove, 1);
  const r = applyLayerMove(p, plan, id);
  assert.equal(findClip(p, 'a2').layer.id, 'B');
  assert.equal(findClip(p, 'b1').layer.id, r.made[0]);
});

test('clips of the same group do not block each other', () => {
  const p = proj();
  p.layers[0].clips.push(clip('a3', 6, 2)); // under b1
  const plan = planLayerMove(p, ['a3', 'b1'], 1);
  assert.equal(plan.error, undefined);
});

test('group drag: time (applyMove) and layer change in one store update = one undo', () => {
  const p = proj();
  const store = createStore(p);
  const g = [{ type: 'clip', id: 'a2' }, { type: 'text', id: 't1' }];
  const tp = planMove(store.get(), g, 5);
  const lp = planMoveTo(store.get(), ['a2'], 'B', tp.delta);
  assert.equal(lp.error, undefined);
  store.update((d) => {
    applyMove(d, g, tp);
    applyLayerMove(d, { ...lp, delta: 0 }, id);
  });
  assert.equal(findClip(store.get(), 'a2').layer.id, 'B');
  assert.equal(findClip(store.get(), 'a2').clip.start, 15);
  assert.equal(store.get().texts[0].start, 6);
  store.undo();
  assert.equal(findClip(store.get(), 'a2').layer.id, 'A');
  assert.equal(findClip(store.get(), 'a2').clip.start, 10);
  assert.equal(store.canUndo(), false);
});

test('a move of no rows, an unknown target or a main clip changes nothing', () => {
  const p = proj();
  assert.deepEqual(planMoveTo(p, ['a1'], 'A').moves, []);
  assert.match(planMoveTo(p, ['a1'], 'gone').error, /gone/);
  assert.match(planMoveTo(p, ['m1c'], 'B').error, /video layer/);
  const snap = JSON.stringify(p);
  applyLayerMove(p, planMoveTo(p, ['a1'], 'A'), id);
  assert.equal(JSON.stringify(p), snap);
});

test('the result survives a save round trip (plain JSON)', () => {
  const p = proj();
  applyLayerMove(p, planMoveTo(p, ['a1'], 'new'), id);
  const back = JSON.parse(JSON.stringify(p));
  assert.equal(findClip(back, 'a1').layer.name, 'Video layer 3');
});
