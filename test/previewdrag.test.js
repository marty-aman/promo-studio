import test from 'node:test';
import assert from 'node:assert/strict';
import { hitTest, boxOf, movable, positionAt, moveBy, constrain, draggablesAt } from '../js/previewdrag.js';
import { newProject, newText } from '../js/state.js';

const opts = { W: 1080, H: 1920 };
function project() {
  const p = newProject();
  p.duration = 12;
  p.endCard.duration = 2;
  p.clips = [{ id: 'c1', mediaId: 'm1', kind: 'video', in: 0, duration: 9, speed: 1, fit: 'cover', zoom: 1, posX: 0, posY: 0 }];
  p.texts = [{ ...newText(0), id: 't1', end: 9, x: 50, y: 14 }];
  p.lyrics = [{ id: 'l1', text: 'Burn it all down', start: 0, end: 9 }];
  p.layers = [
    { id: 'v1', type: 'video', visible: true, opacity: 1, clips: [{ id: 'o1', start: 0, duration: 9, zoom: 0.4, posX: 0.5, posY: -0.4 }] },
    { id: 'z1', type: 'viz', visible: true, x: 30, y: 52, size: 40 },
  ];
  return p;
}

test('the item under the pointer: text and lyric above layers above pictures above the main clip', () => {
  const p = project();
  assert.deepEqual(hitTest(p, 2, 0.5, 0.14, opts), { type: 'text', id: 't1' });
  assert.deepEqual(hitTest(p, 2, 0.5, 0.72, opts), { type: 'lyric', id: 'l1' });
  assert.deepEqual(hitTest(p, 2, 0.75, 0.3, opts), { type: 'clip', id: 'o1' });
  assert.deepEqual(hitTest(p, 2, 0.3, 0.52, opts), { type: 'layer', id: 'z1' });
  assert.deepEqual(hitTest(p, 2, 0.1, 0.95, opts), { type: 'clip', id: 'c1' });
  // the end card covers everything; hidden rows and items outside their time are skipped
  assert.equal(hitTest(p, 10.5, 0.5, 0.14, opts), null);
  p.layerVis.text = false;
  assert.deepEqual(hitTest(p, 2, 0.5, 0.14, opts), { type: 'clip', id: 'c1' });
  assert.deepEqual(draggablesAt(p, 9.5, opts).map((d) => d.sel.id), ['z1']);
});

test('the selected item wins where items overlap', () => {
  const p = project();
  assert.deepEqual(hitTest(p, 2, 0.75, 0.3, { ...opts, selected: { type: 'clip', id: 'c1' } }), { type: 'clip', id: 'c1' });
  assert.ok(boxOf(p, 2, { type: 'text', id: 't1' }, opts).w > 0.1);
});

test('moving each kind: % for texts, lyrics and layers; -1..1 for pictures', () => {
  const p = project();
  for (const [sel, path, want] of [
    [{ type: 'text', id: 't1' }, (d) => [d.texts[0].x, d.texts[0].y], [60, 19]],
    [{ type: 'lyric', id: 'l1' }, (d) => [d.lyrics[0].x, d.lyrics[0].y], [60, 77]],
    [{ type: 'layer', id: 'z1' }, (d) => [d.layers[1].x, d.layers[1].y], [40, 57]],
    [{ type: 'clip', id: 'o1' }, (d) => [d.layers[0].clips[0].posX, d.layers[0].clips[0].posY], [0.7, -0.3]],
  ]) {
    assert.ok(movable(p, sel));
    const from = positionAt(p, sel, 2);
    moveBy(p, sel, 2, from, 0.1, 0.05);
    assert.deepEqual(path(p).map((v) => +v.toFixed(3)), want);
  }
  assert.equal(movable(p, { type: 'layer', id: 'v1' }), false);
  // clamped to the property's range
  moveBy(p, { type: 'text', id: 't1' }, 2, { x: 60, y: 19 }, 5, 0);
  assert.equal(p.texts[0].x, 100);
});

test('a keyframed position gets a keyframe at the playhead; an untouched axis is left alone', () => {
  const p = project();
  p.texts[0].keys = { x: [{ t: 0, v: 50, e: 'linear' }, { t: 4, v: 50, e: 'linear' }], y: [{ t: 0, v: 14, e: 'linear' }] };
  const sel = { type: 'text', id: 't1' };
  moveBy(p, sel, 2, positionAt(p, sel, 2), 0.1, 0, { x: true, y: false });
  assert.deepEqual(p.texts[0].keys.x.map((k) => [k.t, k.v]), [[0, 50], [2, 60], [4, 50]]);
  assert.equal(p.texts[0].keys.y.length, 1);
  assert.equal(p.texts[0].x, 50);
});

test('Shift keeps the bigger move', () => {
  assert.deepEqual(constrain(10, 3), [10, 0]);
  assert.deepEqual(constrain(-2, 7), [0, 7]);
});
