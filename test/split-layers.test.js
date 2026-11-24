import test from 'node:test';
import assert from 'node:assert/strict';
import { splitItem, splitKeysAt, seamView } from '../js/studioedit.js';
import { newProject, createStore } from '../js/state.js';
import { animate } from '../js/keyframes.js';
import { defaultVizLayer } from '../js/viz.js';
import { defaultTabLayer } from '../js/tab.js';
import { defaultDrumLayer } from '../js/drums.js';
import { defaultMidiLayer } from '../js/midiviz.js';
import { defaultGameLayer } from '../js/rhythmgame.js';

let n = 0;
const id = (p) => `${p}_s${++n}`;
const DEFAULTS = { viz: defaultVizLayer, tab: defaultTabLayer, drums: defaultDrumLayer, midi: defaultMidiLayer, game: defaultGameLayer };
const proj = (L) => {
  const p = newProject();
  p.duration = 20;
  p.endCard.enabled = true;
  p.endCard.duration = 4; // layers with end: null show until 16 s
  p.layers = [L];
  return p;
};
const layer = (type, extra = {}) => ({ ...DEFAULTS[type](), id: `L_${type}`, type, name: 'Layer', visible: true, ...extra });
const strip = (L) => {
  const { id: _i, name: _n, chain: _c, start: _s, end: _e, keys: _k, enter: _en, exit: _ex, ...rest } = L;
  return rest;
};

for (const type of Object.keys(DEFAULTS)) {
  test(`split a ${type} layer: two pieces meet at the playhead, same settings and sync, the second is selected`, () => {
    const L = layer(type, { mediaId: 'm_1', offset: 7.25, tempoScale: 1.1, userSync: true, start: 2 });
    const p = proj(L);
    const before = strip(structuredClone(L));
    const r = splitItem(p, { type: 'layer', id: L.id }, 9, id);
    assert.ok(r.sel, r.error);
    const [a, b] = p.layers;
    assert.equal(p.layers.length, 2);
    assert.equal(r.sel.type, 'layer');
    assert.equal(r.sel.id, b.id);
    assert.deepEqual([a.start, a.end, b.start, b.end], [2, 9, 9, null]);
    // the song/file position is absolute (song time of the file's first beat), so both keep the same offset
    assert.deepEqual(strip(a), before);
    assert.deepEqual(strip(b), before);
    assert.equal(a.chain, b.chain);
    assert.equal(b.name, 'Layer (part 2)');
  });
}

test('split a layer a second time: three pieces, names count on', () => {
  const p = proj(layer('viz'));
  const r1 = splitItem(p, { type: 'layer', id: 'L_viz' }, 5, id);
  const r2 = splitItem(p, r1.sel, 10, id);
  assert.ok(r2.sel);
  assert.deepEqual(p.layers.map((x) => [x.start, x.end]), [[0, 5], [5, 10], [10, null]]);
  assert.deepEqual(p.layers.map((x) => x.name), ['Layer', 'Layer (part 2)', 'Layer (part 3)']);
  assert.equal(new Set(p.layers.map((x) => x.chain)).size, 1);
});

test('split a layer refuses outside its time or at its edges, and says where it is; video layers point to their clips', () => {
  const p = proj(layer('tab', { start: 3, end: 8 }));
  for (const at of [1, 3.01, 7.99, 8, 12]) {
    const r = splitItem(p, { type: 'layer', id: 'L_tab' }, at, id);
    assert.match(r.error, /playhead inside the layer.*3\.0s to 8\.0s/);
  }
  assert.equal(p.layers.length, 1);
  // until the end card: the end card start is the layer's end
  const q = proj(layer('midi'));
  assert.match(splitItem(q, { type: 'layer', id: 'L_midi' }, 17, id).error, /0\.0s to 16\.0s/);
  q.layers.push({ id: 'L_vid', type: 'video', visible: true, clips: [] });
  assert.match(splitItem(q, { type: 'layer', id: 'L_vid' }, 5, id).error, /select a clip on it/);
  assert.match(splitItem(q, { type: 'layer', id: 'gone' }, 5, id).error, /gone/);
});

test('entrance stays on the first piece, exit on the last; a played stem plays once', () => {
  const L = layer('viz', { source: 'm_stem', playAudio: true, enter: { type: 'slideUp', duration: 0.5 }, exit: { type: 'zoomOut', duration: 0.6 } });
  const p = proj(L);
  splitItem(p, { type: 'layer', id: L.id }, 6, id);
  const [a, b] = p.layers;
  assert.deepEqual(a.enter, { type: 'slideUp', duration: 0.5 });
  assert.equal(a.exit, undefined);
  assert.equal(b.enter, undefined);
  assert.deepEqual(b.exit, { type: 'zoomOut', duration: 0.6 });
  assert.equal(a.playAudio, true);
  assert.equal(b.playAudio, false);
});

test('keyframes divide at the cut and give the same values on both sides as before', () => {
  const keys = { opacity: [{ t: 0, v: 0, e: 'linear' }, { t: 4, v: 1, e: 'hold' }, { t: 8, v: 0.2 }], size: [{ t: 1, v: 40, e: 'linear' }, { t: 3, v: 80 }] };
  const L = layer('drums', { start: 2, end: 14, keys });
  const orig = structuredClone(L);
  const p = proj(L);
  splitItem(p, { type: 'layer', id: L.id }, 7, id); // local 5: inside the hold segment for opacity, after the last size key
  const [a, b] = p.layers;
  for (const t of [2, 3, 4.5, 6, 6.99, 7, 7.5, 9, 9.99, 10, 10.01, 13]) {
    const piece = t < 7 ? a : b;
    const want = animate(orig, t - orig.start);
    const got = animate(piece, t - piece.start);
    assert.equal(got.opacity, want.opacity, `opacity at ${t}`);
    assert.equal(got.size, want.size, `size at ${t}`);
  }
  // the first piece ends on a key at the cut, the second starts on one
  assert.deepEqual(a.keys.opacity.map((k) => k.t), [0, 4, 5]);
  assert.deepEqual(b.keys.opacity.map((k) => [k.t, k.v]), [[0, 1], [3, 0.2]]);
  assert.deepEqual(b.keys.size.map((k) => [k.t, k.v]), [[0, 80]]);
  // a cut exactly on a keyframe doesn't double it in the second piece
  const [, kb] = splitKeysAt({ x: [{ t: 0, v: 0 }, { t: 2, v: 5 }] }, 2);
  assert.deepEqual(kb.x.map((k) => k.t), [0]);
  assert.deepEqual(splitKeysAt(undefined, 1), [undefined, undefined]);
});

test('seamView draws a piece as the unsplit layer at the cut: fades and counters run from the chain start', () => {
  const p = proj(layer('drums', { start: 1 }));
  splitItem(p, { type: 'layer', id: 'L_drums' }, 6, id);
  splitItem(p, { type: 'layer', id: p.layers[1].id }, 11, id);
  const [a, b, c] = p.layers;
  const va = seamView(a, p.layers, 16);
  const vb = seamView(b, p.layers, 16);
  const vc = seamView(c, p.layers, 16);
  assert.deepEqual([va.start, va.end], [1, Infinity]);
  assert.deepEqual([vb.start, vb.end], [1, Infinity]);
  assert.deepEqual([vc.start, vc.end], [1, null]);
  // a hidden middle piece (not in the visible list) breaks the chain: the others fade as normal layers
  const shown = [a, c];
  assert.equal(seamView(a, shown, 16), a);
  assert.equal(seamView(c, shown, 16), c);
  // moved apart: no seam
  const q = structuredClone(p.layers);
  q[1].start = 7;
  assert.equal(seamView(q[1], q, 16).start, 7);
  // a layer that was never split is drawn as it is
  const solo = layer('tab');
  assert.equal(seamView(solo, [solo], 16), solo);
});

test('one undo puts the layer back whole', () => {
  const p = proj(layer('game', { mediaId: 'm_g', offset: 3 }));
  const store = createStore(p);
  const before = JSON.stringify(store.get());
  let r;
  store.update((d) => (r = splitItem(d, { type: 'layer', id: 'L_game' }, 8, id)));
  assert.ok(r.sel);
  assert.equal(store.get().layers.length, 2);
  store.undo();
  assert.equal(JSON.stringify(store.get()), before);
});
