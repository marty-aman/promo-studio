import test from 'node:test';
import assert from 'node:assert/strict';
import { isOn, onOnly, canTurnOff, isOff, setOff, toggleOff, OFF_KEY } from '../js/itemoff.js';
import { newProject, normalizeProject, createStore, overlayClipAt } from '../js/state.js';
import { splitClipAt, splitItem, duplicateItem, copyItem, pasteItem } from '../js/studioedit.js';
import { copyGroup, pasteGroup } from '../js/multimove.js';
import { makeProjectFile, parseProjectFile } from '../js/projectfile.js';
import { makeLibraryFile, parseLibraryFile, readProjects } from '../js/projectlib.js';
import { draggablesAt } from '../js/previewdrag.js';
import { videoCues } from '../js/subtitles.js';
import { renderFrame } from '../js/renderer.js';
import { Engine } from '../js/engine.js';

let n = 0;
const mk = (p) => `${p}_x${++n}`;
const clip = (id, duration, extra = {}) => ({ id, mediaId: 'img', kind: 'image', in: 0, duration, speed: 1, fit: 'cover', zoom: 1, panX: 0, panY: 0, rotate: 0, transition: { type: 'none', duration: 0.4 }, ...extra });

/** 3 main clips (4 s each), a video layer with one clip, 2 texts, 2 lyric lines, 2 audio blocks, a viz layer, a song. */
const proj = () => {
  const p = newProject();
  p.duration = 20;
  p.endCard.enabled = false;
  p.clips = [clip('c1', 4), clip('c2', 4), clip('c3', 4)];
  p.song = { mediaId: 's1', offset: 0, volume: 1, fadeIn: 0, fadeOut: 0 };
  p.layers = [
    { id: 'vl', type: 'video', name: 'Video layer', visible: true, clips: [clip('o1', 3, { start: 5, keys: { opacity: [{ t: 1, v: 0.5 }] } })] },
    { id: 'viz', type: 'viz', name: 'Viz', start: 2, end: 6 },
  ];
  p.texts = [
    { id: 't1', text: 'HELLO', start: 1, end: 3, x: 50, y: 20, size: 9, font: 'Inter', color: '#fff', outline: '#000', box: false, animation: 'none', keys: { x: [{ t: 0.5, v: 30 }] } },
    { id: 't2', text: 'B', start: 6, end: 9, x: 50, y: 20, size: 9, font: 'Inter', color: '#fff', outline: '#000', box: false, animation: 'none', caption: true },
  ];
  p.lyrics = [
    { id: 'l1', text: 'first line', start: 1, end: 3 },
    { id: 'l2', text: 'second line', start: 7, end: 8 },
  ];
  p.audioTracks = [
    { id: 'a1', mediaId: 'au', start: 0, in: 0, duration: 10, volume: 1 },
    { id: 'a2', mediaId: 'au', start: 2, in: 0, duration: 5, volume: 1 },
  ];
  return p;
};
const S = (type, id) => ({ type, id });

test('every kind turns off and back on with the flag it uses', () => {
  const d = proj();
  const all = [S('clip', 'c2'), S('clip', 'o1'), S('text', 't1'), S('lyric', 'l1'), S('audio', 'a1'), S('layer', 'viz'), S('song', 'song'), S('endcard', 'endcard')];
  d.endCard.enabled = true;
  for (const s of all) assert.equal(canTurnOff(d, s), true, s.type);
  for (const s of all) assert.equal(isOff(d, s), false, s.type);
  const r = toggleOff(d, all);
  assert.deepEqual(r, { off: true, count: all.length });
  assert.equal(d.clips[1].disabled, true);
  assert.equal(d.layers[0].clips[0].disabled, true);
  assert.equal(d.texts[0].disabled, true);
  assert.equal(d.lyrics[0].disabled, true);
  assert.equal(d.audioTracks[0].disabled, true);
  assert.equal(d.layers[1].visible, false);
  assert.deepEqual(d.layerVis, { song: false, endcard: false });
  for (const s of all) assert.equal(isOff(d, s), true, s.type);
  // the others are untouched
  assert.equal(d.clips[0].disabled, undefined);
  assert.equal(d.texts[1].disabled, undefined);
  // all of them off: the same toggle turns them all on, and the flag goes away (a save looks like before)
  assert.deepEqual(toggleOff(d, all), { off: false, count: all.length });
  for (const s of all) assert.equal(isOff(d, s), false, s.type);
  assert.equal('disabled' in d.clips[1], false);
  assert.deepEqual(d.layerVis, {});
  assert.equal(d.layers[1].visible, true);
});

test('a mixed selection turns all off first; nothing selectable is an error with the key', () => {
  const d = proj();
  setOff(d, S('text', 't1'), true);
  const r = toggleOff(d, [S('text', 't1'), S('text', 't2'), S('clip', 'gone')]);
  assert.deepEqual(r, { off: true, count: 2 });
  assert.ok(d.texts.every((t) => t.disabled));
  assert.match(toggleOff(d, []).error, new RegExp(`press ${OFF_KEY}`));
  assert.ok(toggleOff(d, [S('clip', 'gone')]).error);
  // no song, no end card: nothing to turn off
  d.song = null;
  assert.equal(canTurnOff(d, S('song', 'song')), false);
  assert.equal(canTurnOff(d, S('endcard', 'endcard')), false);
});

test('onOnly / isOn: old items without the flag are on', () => {
  const list = [{ id: 'a' }, { id: 'b', disabled: true }];
  assert.equal(isOn(list[0]), true);
  assert.equal(isOn(list[1]), false);
  assert.deepEqual(onOnly(list).map((x) => x.id), ['a']);
  const none = [{ id: 'a' }];
  assert.equal(onOnly(none), none); // same array when nothing is off
  assert.deepEqual(onOnly(undefined), []);
});

test('one undo step brings a toggle back, redo re-applies it', () => {
  const store = createStore(proj());
  store.update((d) => toggleOff(d, [S('clip', 'c1'), S('text', 't2')]));
  assert.equal(store.get().clips[0].disabled, true);
  assert.equal(store.get().texts[1].disabled, true);
  store.undo();
  assert.equal(store.get().clips[0].disabled, undefined);
  assert.equal(store.get().texts[1].disabled, undefined);
  store.redo();
  assert.equal(store.get().clips[0].disabled, true);
});

test('split, duplicate, copy/paste keep the off state (both halves of a split)', () => {
  const d = proj();
  toggleOff(d, [S('clip', 'c2'), S('clip', 'o1'), S('text', 't2'), S('lyric', 'l2'), S('audio', 'a2')]);
  // main lane clip: c2 runs 4–8 s
  const r1 = splitClipAt(d, 'c2', 6, mk);
  assert.ok(!r1.error, r1.error);
  assert.equal(d.clips.length, 4);
  assert.deepEqual(d.clips.map((c) => !!c.disabled), [false, true, true, false]);
  // the split pieces still fill c2's old slot, so c3 still starts at 8 s
  assert.equal(d.clips[1].duration + d.clips[2].duration, 4);
  // overlay clip: o1 runs 5–8 s
  assert.ok(!splitClipAt(d, 'o1', 6.5, mk).error);
  assert.deepEqual(d.layers[0].clips.map((c) => !!c.disabled), [true, true]);
  // text, lyric line and audio block
  for (const [s, t] of [[S('text', 't2'), 7], [S('lyric', 'l2'), 7.5], [S('audio', 'a2'), 4]]) {
    const r = splitItem(d, s, t, mk);
    assert.ok(!r.error, r.error);
    const list = { text: d.texts, lyric: d.lyrics, audio: d.audioTracks }[s.type];
    assert.equal(list.find((x) => x.id === r.sel.id).disabled, true, `${s.type} second half`);
    assert.equal(list.find((x) => x.id === s.id).disabled, true, `${s.type} first half`);
  }
  // duplicate and copy/paste
  const dup = duplicateItem(d, S('text', 't2'), mk);
  assert.equal(d.texts.find((x) => x.id === dup.sel.id).disabled, true);
  const pasted = pasteItem(d, copyItem(d, S('clip', 'c1')), { mode: 'at', t: 0 }, mk);
  assert.ok(!pasted.error, pasted.error);
  const pc = d.clips.find((c) => c.id === pasted.sel.id);
  assert.equal(pc.disabled, undefined); // c1 was on and stays on
  const pa = pasteItem(d, copyItem(d, S('audio', 'a2')), { mode: 'at', t: 12 }, mk);
  assert.equal(d.audioTracks.find((x) => x.id === pa.sel.id).disabled, true);
  // a copied group keeps each item's state
  const g = pasteGroup(d, copyGroup(d, [S('text', 't1'), S('lyric', 'l2')]), 14);
  assert.ok(!g.error, g.error);
  const [gt, gl] = [d.texts.find((x) => x.id === g.group.find((s) => s.type === 'text').id), d.lyrics.find((x) => x.id === g.group.find((s) => s.type === 'lyric').id)];
  assert.equal(!!gt.disabled, false);
  assert.equal(gl.disabled, true);
});

test('off is kept by autosave, project files, the Projects library and backups; old saves load with all on', () => {
  const p = proj();
  toggleOff(p, [S('clip', 'c2'), S('clip', 'o1'), S('text', 't1'), S('lyric', 'l1'), S('audio', 'a1'), S('layer', 'viz'), S('song', 'song')]);
  const check = (q, what) => {
    assert.equal(q.clips[1].disabled, true, what);
    assert.equal(q.layers[0].clips[0].disabled, true, what);
    assert.equal(q.texts[0].disabled, true, what);
    assert.equal(q.lyrics[0].disabled, true, what);
    assert.equal(q.audioTracks[0].disabled, true, what);
    assert.equal(q.layers[1].visible, false, what);
    assert.equal(q.layerVis.song, false, what);
    assert.equal(q.clips[0].disabled, undefined, what);
  };
  check(normalizeProject(JSON.parse(JSON.stringify(p))), 'autosave');
  check(parseProjectFile(makeProjectFile(p)).project, 'project file');
  const lib = parseLibraryFile(makeLibraryFile({ video: [{ id: 'v1', name: 'X', data: p }] }));
  check(lib.video[0].data, 'projects file');
  check(readProjects({ video: [{ id: 'v1', name: 'X', data: JSON.parse(JSON.stringify(p)) }] }).video[0].data, 'backup');
  // an older save has no flags at all: everything is on
  const old = normalizeProject(JSON.parse(JSON.stringify(proj())));
  for (const s of [S('clip', 'c2'), S('clip', 'o1'), S('text', 't1'), S('lyric', 'l1'), S('audio', 'a1'), S('layer', 'viz')]) assert.equal(isOff(old, s), false, s.type);
});

test('preview hit-testing, overlay lookup and the captions file skip items that are off', () => {
  const p = proj();
  assert.equal(overlayClipAt(p.layers[0], 6).id, 'o1');
  const ids = (t) => draggablesAt(p, t).map((d) => `${d.sel.type}:${d.sel.id}`).filter((k) => k !== 'layer:viz');
  assert.ok(ids(2).includes('text:t1') && ids(2).includes('lyric:l1') && ids(2).includes('clip:c1'));
  toggleOff(p, [S('clip', 'o1'), S('text', 't1'), S('lyric', 'l1'), S('clip', 'c1'), S('text', 't2'), S('lyric', 'l2')]);
  assert.equal(overlayClipAt(p.layers[0], 6), null);
  assert.deepEqual(ids(2), []);
  assert.ok(!ids(6).includes('clip:o1'));
  assert.deepEqual(videoCues(p), []);
});

/** A canvas 2D context that records what is drawn. */
function fakeCtx() {
  const calls = [];
  const grad = { addColorStop() {} };
  const target = {
    canvas: { width: 108, height: 192 },
    calls,
    measureText: (s) => ({ width: String(s).length * 5, actualBoundingBoxAscent: 5, actualBoundingBoxDescent: 2 }),
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    createPattern: () => ({}),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    getTransform: () => ({ a: 1, d: 1 }),
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return (...args) => calls.push([k, args]);
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  });
}
// the renderer checks frames with instanceof; Node has no media elements
globalThis.HTMLVideoElement ??= class {};
globalThis.HTMLImageElement ??= class {};
const SRC = { width: 160, height: 90, naturalWidth: 160, naturalHeight: 90, videoWidth: 160, videoHeight: 90, complete: true };
const env = () => {
  const seen = [];
  return { seen, preview: false, sourceFor: (c) => (seen.push(c.id), SRC), image: () => null };
};
const texts = (ctx) => ctx.calls.filter(([k]) => k === 'fillText' || k === 'strokeText').map(([, a]) => String(a[0]));
const images = (ctx) => ctx.calls.filter(([k]) => k === 'drawImage').map(([, a]) => a[0]);

test('the render (preview and export frames) skips off items; an off main clip leaves black, the rest keep their place', () => {
  const p = proj();
  p.look = { ...p.look, vignette: 0 };
  // on: at 2 s the main clip c1, the text and the lyric line are drawn
  let ctx = fakeCtx();
  let e = env();
  renderFrame(ctx, 108, 192, p, 2, e);
  assert.ok(e.seen.includes('c1'));
  assert.ok(images(ctx).includes(SRC));
  assert.ok(texts(ctx).some((s) => /HELLO/.test(s)), texts(ctx).join('|'));
  assert.ok(texts(ctx).some((s) => /FIRST|first/.test(s)), texts(ctx).join('|'));
  toggleOff(p, [S('clip', 'c1'), S('text', 't1'), S('lyric', 'l1')]);
  ctx = fakeCtx();
  e = env();
  renderFrame(ctx, 108, 192, p, 2, e);
  assert.ok(!e.seen.includes('c1'), 'the off clip is not drawn');
  assert.ok(!images(ctx).includes(SRC));
  assert.ok(!texts(ctx).some((s) => /HELLO|first|FIRST/.test(s)), texts(ctx).join('|'));
  // c2 still starts at 4 s (the off clip keeps its slot)
  e = env();
  renderFrame(fakeCtx(), 108, 192, p, 4.5, e);
  assert.ok(e.seen.includes('c2') && !e.seen.includes('c1'));
  // an off overlay clip is not drawn either; the main clip under it still is
  toggleOff(p, [S('clip', 'o1')]);
  e = env();
  renderFrame(fakeCtx(), 108, 192, p, 6, e);
  assert.deepEqual(e.seen, ['c2']);
  // a transition into the next clip comes out of black, never out of the off clip
  p.clips[1].transition = { type: 'slide', duration: 0.5 };
  e = env();
  assert.doesNotThrow(() => renderFrame(fakeCtx(), 108, 192, p, 4.1, e));
  assert.ok(!e.seen.includes('c1'));
});

test('the sound skips off items: an off audio block gets no player, an off clip is silent', () => {
  const p = proj();
  toggleOff(p, [S('audio', 'a2')]);
  const keys = [];
  const fake = { project: p, t: 3, audioEls: new Map(), _node: () => null, _audioEl: (key) => (keys.push(key), null) };
  Engine.prototype._sync.call(fake, false);
  assert.ok(keys.includes('a1'));
  assert.ok(!keys.includes('a2'));
  // a stall while an off clip is "playing" never holds the clock
  p.clips[0] = { ...p.clips[0], kind: 'video', disabled: true };
  assert.equal(Engine.prototype._isStalled.call({ project: p, t: 1 }, 0), false);
});
