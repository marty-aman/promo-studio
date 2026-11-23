import test from 'node:test';
import assert from 'node:assert/strict';
import { splitItem, splitClipAt, duplicateItem, copyItem, pasteItem, splitKeys, safeRect, SAFE_AREAS, peakOf, toDb, meterFill, meterHold } from '../js/studioedit.js';
import { newProject, newText } from '../js/state.js';

let n = 0;
const id = (p) => `${p}_t${++n}`;
const base = () => {
  const p = newProject();
  p.duration = 20;
  return p;
};

test('split a text block: two pieces meet at the playhead, the second is selected', () => {
  const p = base();
  const t = { ...newText(2), id: 'txt_a', end: 6 };
  p.texts.push(t);
  const r = splitItem(p, { type: 'text', id: 'txt_a' }, 4, id);
  assert.ok(r.sel && r.sel.type === 'text');
  assert.equal(p.texts.length, 2);
  assert.deepEqual([p.texts[0].start, p.texts[0].end, p.texts[1].start, p.texts[1].end], [2, 4, 4, 6]);
  assert.equal(p.texts[1].id, r.sel.id);
  assert.equal(p.texts[1].text, p.texts[0].text);
});

test('split refuses outside the block or too near its edge, and says what to do', () => {
  const p = base();
  p.texts.push({ ...newText(2), id: 'txt_a', end: 6 });
  for (const at of [1, 2.02, 5.98, 7]) {
    const r = splitItem(p, { type: 'text', id: 'txt_a' }, at, id);
    assert.match(r.error, /playhead inside/);
  }
  assert.equal(p.texts.length, 1);
  assert.match(splitItem(p, { type: 'song' }, 3, id).error, /whole video/);
  assert.match(splitItem(p, null, 3, id).error, /Select/);
});

test('split a lyric line uses the song clock and shares the words by position', () => {
  const p = base();
  p.song = { mediaId: 'm_x', offset: 10, volume: 1, fadeIn: 0, fadeOut: 0 };
  p.lyrics.push({ id: 'lyr_a', text: 'we light it up tonight', start: 10, end: 14 }); // on screen 0..4 s
  const r = splitItem(p, { type: 'lyric', id: 'lyr_a' }, 2, id);
  assert.ok(r.sel);
  assert.equal(p.lyrics.length, 2);
  assert.equal(p.lyrics[0].end, 12);
  assert.equal(p.lyrics[1].start, 12);
  assert.equal(`${p.lyrics[0].text} ${p.lyrics[1].text}`, 'we light it up tonight');
  assert.ok(p.lyrics[0].text && p.lyrics[1].text);
});

test('split an audio block keeps the sound continuous: second piece starts further into the file', () => {
  const p = base();
  p.audioTracks.push({ id: 'aud_a', mediaId: 'm_y', start: 3, in: 1, duration: 8, volume: 1, fadeIn: 0.5, fadeOut: 0.5 });
  const r = splitItem(p, { type: 'audio', id: 'aud_a' }, 7, id);
  const [a, b] = p.audioTracks;
  assert.ok(r.sel);
  assert.deepEqual([a.start, a.duration, a.fadeOut], [3, 4, 0]);
  assert.deepEqual([b.start, b.in, b.duration, b.fadeIn, b.fadeOut], [7, 5, 4, 0, 0.5]);
});

test('keyframes are cut with the item: earlier ones stay, later ones move to the new start', () => {
  const [a, b] = splitKeys({ x: [{ t: 0, v: 1 }, { t: 1, v: 2 }, { t: 3, v: 5 }] }, 2);
  assert.deepEqual(a.x.map((k) => k.t), [0, 1]);
  assert.deepEqual(b.x.map((k) => k.t), [1]);
  assert.deepEqual(splitKeys(undefined, 1), [undefined, undefined]);
});

test('split a main-lane clip and an overlay clip', () => {
  const p = base();
  p.clips.push({ id: 'c1', mediaId: 'm_1', kind: 'video', in: 0, duration: 4, speed: 1, transition: {} }, { id: 'c2', mediaId: 'm_2', kind: 'video', in: 0, duration: 4, speed: 1, transition: {} });
  const r = splitClipAt(p, 'c2', 6, id);
  assert.equal(p.clips.length, 3);
  assert.deepEqual(p.clips.map((c) => c.duration), [4, 2, 2]);
  assert.equal(p.clips[2].in, 2);
  assert.equal(r.sel.id, p.clips[2].id);
  assert.match(splitClipAt(p, 'c1', 9, id).error, /inside/);
  p.layers.push({ id: 'L1', type: 'video', visible: true, clips: [{ id: 'o1', mediaId: 'm_3', kind: 'video', in: 0, start: 5, duration: 4, speed: 1, transition: {} }] });
  splitClipAt(p, 'o1', 7, id);
  assert.deepEqual(p.layers[0].clips.map((c) => [c.start, c.duration]), [[5, 2], [7, 2]]);
});

test('duplicate puts a copy right after, with a new id and the same look', () => {
  const p = base();
  p.texts.push({ ...newText(2), id: 'txt_a', end: 5, text: 'HELLO' });
  const r = duplicateItem(p, { type: 'text', id: 'txt_a' }, id);
  assert.equal(p.texts.length, 2);
  assert.equal(p.texts[1].text, 'HELLO');
  assert.deepEqual([p.texts[1].start, p.texts[1].end], [5, 8]);
  assert.notEqual(p.texts[1].id, p.texts[0].id);
  assert.equal(r.sel.id, p.texts[1].id);
  assert.match(duplicateItem(p, { type: 'song' }, id).error, /one item/);
  assert.match(duplicateItem(p, { type: 'endcard' }, id).error, /one end card/);
});

test('duplicate a main-lane clip goes right after it; a layer gets fresh clip ids', () => {
  const p = base();
  p.clips.push({ id: 'c1', mediaId: 'm_1', kind: 'video', in: 0, duration: 3, speed: 1 }, { id: 'c2', mediaId: 'm_2', kind: 'video', in: 0, duration: 3, speed: 1 });
  duplicateItem(p, { type: 'clip', id: 'c1' }, id);
  assert.deepEqual(p.clips.map((c) => c.mediaId), ['m_1', 'm_1', 'm_2']);
  p.layers.push({ id: 'L1', type: 'video', name: 'Video layer', visible: true, clips: [{ id: 'o1', mediaId: 'm_3', kind: 'video', in: 0, start: 1, duration: 2 }] });
  duplicateItem(p, { type: 'layer', id: 'L1' }, id);
  assert.equal(p.layers.length, 2);
  assert.equal(p.layers[1].name, 'Video layer (copy)');
  assert.notEqual(p.layers[1].clips[0].id, 'o1');
});

test('copy then paste at the playhead; paste is a copy, not a link', () => {
  const p = base();
  p.texts.push({ ...newText(1), id: 'txt_a', end: 3 });
  const c = copyItem(p, { type: 'text', id: 'txt_a' });
  p.texts[0].text = 'CHANGED AFTER COPY';
  const r = pasteItem(p, c, { mode: 'at', t: 10 }, id);
  assert.equal(p.texts[1].text, 'NEW SINGLE');
  assert.deepEqual([p.texts[1].start, p.texts[1].end], [10, 12]);
  assert.ok(r.sel);
  // near the end of the video it is moved back so it still fits
  pasteItem(p, c, { mode: 'at', t: 19.5 }, id);
  assert.equal(p.texts[2].end, 20);
  assert.match(pasteItem(p, null, {}, id).error, /Nothing copied/);
});

test('paste a lyric line at the playhead uses the song clock; a main clip lands between its neighbours', () => {
  const p = base();
  p.song = { mediaId: 'm_x', offset: 5, volume: 1, fadeIn: 0, fadeOut: 0 };
  p.lyrics.push({ id: 'lyr_a', text: 'one', start: 5, end: 7 });
  pasteItem(p, copyItem(p, { type: 'lyric', id: 'lyr_a' }), { mode: 'at', t: 4 }, id);
  assert.equal(p.lyrics[1].start, 9);
  p.clips.push({ id: 'c1', mediaId: 'm_1', kind: 'video', in: 0, duration: 4 }, { id: 'c2', mediaId: 'm_2', kind: 'video', in: 0, duration: 4 });
  pasteItem(p, copyItem(p, { type: 'clip', id: 'c1' }), { mode: 'at', t: 5 }, id);
  assert.deepEqual(p.clips.map((c) => c.mediaId), ['m_1', 'm_1', 'm_2']); // 5 s is before the middle of the second clip
  pasteItem(p, copyItem(p, { type: 'clip', id: 'c2' }), { mode: 'at', t: 15 }, id);
  assert.equal(p.clips.at(-1).mediaId, 'm_2');
  assert.match(pasteItem(p, { type: 'clip', item: p.clips[0], layerId: 'gone' }, { mode: 'at', t: 1 }, id).error, /video layer/);
});

test('safe areas: 9:16 uses the apps’ areas, the common one is inside each, other shapes get a plain margin', () => {
  const all = safeRect('all', '9:16');
  for (const r of Object.values(SAFE_AREAS)) assert.ok(all[0] >= r[0] && all[1] >= r[1] && all[2] <= r[2] && all[3] <= r[3]);
  assert.deepEqual(safeRect('reels', '9:16'), SAFE_AREAS.reels);
  assert.deepEqual(safeRect('tiktok', '16:9'), [0.05, 0.05, 0.95, 0.95]);
  assert.equal(safeRect('off', '9:16'), null);
  assert.equal(safeRect(undefined, '9:16'), null);
});

test('levels: peak, dB, meter fill and a held peak that falls', () => {
  assert.equal(peakOf([0.1, -0.7, 0.3]), 0.7);
  assert.equal(peakOf([]), 0);
  assert.equal(toDb(1), 0);
  assert.equal(toDb(0), -Infinity);
  assert.equal(meterFill(1), 1);
  assert.equal(meterFill(0), 0);
  assert.ok(Math.abs(meterFill(0.5) - (48 - 6.02) / 48) < 0.01);
  assert.equal(meterHold(0.8, 0.2, 0.1), 0.8 - 0.12);
  assert.equal(meterHold(0.1, 0.5, 0.1), 0.5);
});
