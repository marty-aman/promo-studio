import test from 'node:test';
import assert from 'node:assert/strict';
import { keyOf, inGroup, toggleIn, rowOf, allItems, liveGroup, spans, planMove, applyMove, deleteGroup, copyGroup, pasteGroup, duplicateGroup } from '../js/multimove.js';
import { newProject } from '../js/state.js';
import { layoutClips } from '../js/core.js';

let n = 0;
const id = (p) => `${p}_m${++n}`;
const clip = (cid, duration, extra = {}) => ({ id: cid, mediaId: 'm1', kind: 'image', in: 0, duration, speed: 1, transition: { type: 'none', duration: 0.4 }, ...extra });

/** 3 main clips (4 s each), a video layer with one clip, 2 texts, 2 lyric lines, an audio block, a viz and a tab layer. */
const proj = () => {
  const p = newProject();
  p.duration = 30;
  p.endCard.enabled = false;
  p.clips = [clip('c1', 4), clip('c2', 4), clip('c3', 4)];
  p.song = { mediaId: 's1', offset: 2, volume: 1, fadeIn: 0, fadeOut: 0 };
  p.layers = [
    { id: 'vl', type: 'video', name: 'Video layer', clips: [clip('o1', 3, { start: 5, keys: { opacity: [{ t: 1, v: 0.5 }] } })] },
    { id: 'viz', type: 'viz', name: 'Viz', start: 2, end: 6 },
    { id: 'tab', type: 'tab', name: 'Tab', mediaId: 't1', offset: 1 },
  ];
  p.texts = [
    { id: 't1', text: 'A', start: 1, end: 3, keys: { x: [{ t: 0.5, v: 0.2 }] } },
    { id: 't2', text: 'B', start: 6, end: 9 },
  ];
  p.lyrics = [
    { id: 'l1', text: 'one', start: 4, end: 6 },
    { id: 'l2', text: 'two', start: 7, end: 8 },
  ];
  p.audioTracks = [{ id: 'a1', mediaId: 'au', start: 10, in: 0, duration: 5 }];
  return p;
};

test('toggleIn adds and removes; inGroup and keyOf', () => {
  let g = toggleIn([], { type: 'text', id: 't1' });
  g = toggleIn(g, { type: 'clip', id: 'o1' });
  assert.deepEqual(g.map(keyOf), ['text:t1', 'clip:o1']);
  assert.ok(inGroup(g, { type: 'clip', id: 'o1' }));
  g = toggleIn(g, { type: 'text', id: 't1' });
  assert.deepEqual(g.map(keyOf), ['clip:o1']);
  assert.equal(inGroup(g, null), false);
});

test('rows and select-all: per row, then everything; the song and end card are never in a group', () => {
  const p = proj();
  assert.equal(rowOf(p, { type: 'clip', id: 'c2' }), 'main');
  assert.equal(rowOf(p, { type: 'clip', id: 'o1' }), 'vlayer:vl');
  assert.equal(rowOf(p, { type: 'song', id: 'song' }), null);
  assert.deepEqual(allItems(p, 'main').map((s) => s.id), ['c1', 'c2', 'c3']);
  assert.deepEqual(allItems(p, 'text').map((s) => s.id), ['t1', 't2']);
  const all = allItems(p).map(keyOf);
  assert.equal(all.length, 3 + 1 + 2 + 2 + 2 + 1); // video layers themselves are not blocks
  assert.ok(!all.includes('layer:vl'));
  assert.deepEqual(liveGroup(p, [{ type: 'text', id: 'gone' }, { type: 'song', id: 'song' }, { type: 'text', id: 't2' }]).map(keyOf), ['text:t2']);
});

test('a group of texts, a lyric, an overlay clip, audio and layers moves by the same amount and keeps its spacing', () => {
  const p = proj();
  const g = [{ type: 'text', id: 't1' }, { type: 'text', id: 't2' }, { type: 'lyric', id: 'l1' }, { type: 'clip', id: 'o1' }, { type: 'audio', id: 'a1' }, { type: 'layer', id: 'viz' }, { type: 'layer', id: 'tab' }];
  const before = spans(p, g).map((s) => s.start);
  const plan = planMove(p, g, 1.5);
  assert.equal(plan.delta, 1.5);
  applyMove(p, g, plan);
  const after = spans(p, g).map((s) => s.start);
  after.forEach((a, i) => assert.ok(Math.abs(a - before[i] - 1.5) < 1e-9, `item ${i}`));
  assert.deepEqual([p.texts[0].start, p.texts[0].end, p.texts[1].start, p.texts[1].end], [2.5, 4.5, 7.5, 10.5]);
  assert.deepEqual([p.lyrics[0].start, p.lyrics[0].end], [5.5, 7.5]); // song clock
  assert.ok(p.lyricsTimed && p.lyricsTimed.by === 'manual');
  assert.equal(p.layers[0].clips[0].start, 6.5);
  assert.equal(p.audioTracks[0].start, 11.5);
  assert.deepEqual([p.layers[1].start, p.layers[1].end], [3.5, 7.5]);
  assert.equal(p.layers[2].offset, 2.5);
  assert.equal(p.layers[2].userSync, true);
  // keyframes are seconds from the item's start: unchanged, so they move with it
  assert.deepEqual(p.texts[0].keys.x, [{ t: 0.5, v: 0.2 }]);
  assert.deepEqual(p.layers[0].clips[0].keys.opacity, [{ t: 1, v: 0.5 }]);
  // the main clips and the other lyric line did not move
  assert.deepEqual(p.clips.map((c) => c.id), ['c1', 'c2', 'c3']);
  assert.equal(p.lyrics[1].start, 7);
});

test('moving left stops when the earliest block reaches 0 (lyric lines at the start of the song)', () => {
  const p = proj();
  const g = [{ type: 'text', id: 't1' }, { type: 'text', id: 't2' }];
  assert.equal(planMove(p, g, -5).delta, -1); // t1 starts at 1
  const gl = [{ type: 'lyric', id: 'l1' }, { type: 'audio', id: 'a1' }];
  // l1 starts 4 s into the song (2 s on the timeline, the song starts 2 s in): it can go 4 s earlier
  assert.equal(planMove(p, gl, -9).delta, -4);
  // a viz range can't run past the end of the video
  assert.equal(planMove(p, [{ type: 'layer', id: 'viz' }], 100).delta, 30 - 4 - 2);
  // a chart layer can sit before 0 (it lines up with the song), so it does not limit the group
  assert.equal(planMove(p, [{ type: 'layer', id: 'tab' }, { type: 'text', id: 't2' }], -3).delta, -3);
});

test('main-track clips move as a block into the nearest slot; the rest of the group moves by the same amount', () => {
  const p = proj();
  p.clips = [clip('c1', 4), clip('c2', 2), clip('c3', 4), clip('c4', 3)];
  const g = [{ type: 'clip', id: 'c1' }, { type: 'clip', id: 'c2' }, { type: 'text', id: 't2' }];
  // the block c1+c2 (6 s) can sit at 0, 4 (after c3) or 7 (after c4): asking for +5 picks 4
  const plan = planMove(p, g, 5);
  assert.equal(plan.delta, 4);
  applyMove(p, g, plan);
  assert.deepEqual(p.clips.map((c) => c.id), ['c3', 'c1', 'c2', 'c4']);
  assert.equal(layoutClips(p.clips)[1].start, 4);
  assert.deepEqual([p.texts[1].start, p.texts[1].end], [10, 13]);
  // a small move keeps the block where it is (no undo step needed)
  assert.deepEqual(planMove(p, g, 0.5), { delta: 0 });
});

test('a main-track slot that would push another group block before 0 is not used', () => {
  const p = proj();
  p.clips = [clip('c1', 4), clip('c2', 4), clip('c3', 4)];
  const g = [{ type: 'clip', id: 'c3' }, { type: 'text', id: 't1' }]; // t1 starts at 1
  // c3 at slot 0 would be -8 s: t1 can only go back 1 s, so c3 stays
  assert.deepEqual(planMove(p, g, -8), { delta: 0 });
  // alone, c3 goes to the front
  const solo = planMove(p, [{ type: 'clip', id: 'c3' }], -8);
  assert.equal(solo.delta, -8);
  assert.equal(solo.insertAt, 0);
});

test('main-track clips that are not next to each other are refused with a message, nothing moves', () => {
  const p = proj();
  const g = [{ type: 'clip', id: 'c1' }, { type: 'clip', id: 'c3' }, { type: 'text', id: 't2' }];
  const plan = planMove(p, g, 4);
  assert.equal(plan.delta, 0);
  assert.match(plan.error, /next to each other/);
});

test('arrow-key slots: a block of main clips steps one slot at a time', () => {
  const p = proj();
  const g = [{ type: 'clip', id: 'c1' }, { type: 'clip', id: 'c2' }];
  const r = planMove(p, g, 1 / 30, { slot: 1 });
  assert.equal(r.insertAt, 1);
  assert.equal(r.delta, 4);
  assert.deepEqual(planMove(p, g, -1 / 30, { slot: -1 }), { delta: 0 }); // already first
  // non-main groups ignore the slot and move by the time asked
  assert.equal(planMove(p, [{ type: 'text', id: 't2' }, { type: 'audio', id: 'a1' }], 1 / 30, { slot: 1 }).delta, 1 / 30);
});

test('delete a group: every kind goes, nothing else does', () => {
  const p = proj();
  deleteGroup(p, [{ type: 'clip', id: 'c2' }, { type: 'clip', id: 'o1' }, { type: 'text', id: 't1' }, { type: 'lyric', id: 'l2' }, { type: 'audio', id: 'a1' }, { type: 'layer', id: 'viz' }]);
  assert.deepEqual(p.clips.map((c) => c.id), ['c1', 'c3']);
  assert.deepEqual(p.layers.map((l) => l.id), ['vl', 'tab']);
  assert.equal(p.layers[0].clips.length, 0);
  assert.deepEqual(p.texts.map((t) => t.id), ['t2']);
  assert.deepEqual(p.lyrics.map((t) => t.id), ['l1']);
  assert.equal(p.audioTracks.length, 0);
});

test('copy and paste a group at the playhead keeps the spacing; main clips paste as one run in order', () => {
  const p = proj();
  const g = [{ type: 'text', id: 't1' }, { type: 'text', id: 't2' }, { type: 'audio', id: 'a1' }];
  const c = copyGroup(p, g);
  assert.equal(c.group.length, 3);
  const r = pasteGroup(p, c, 12, id);
  assert.equal(r.group.length, 3);
  const [n1, n2] = r.group.slice(0, 2).map((s) => p.texts.find((t) => t.id === s.id));
  assert.deepEqual([n1.start, n2.start], [12, 17]); // 5 s apart, like t1 and t2
  assert.equal(p.audioTracks.find((a) => a.id === r.group[2].id).start, 21);

  const q = proj();
  const cm = copyGroup(q, [{ type: 'clip', id: 'c3' }, { type: 'clip', id: 'c1' }, { type: 'clip', id: 'c2' }]);
  const rm = pasteGroup(q, cm, 4, id);
  assert.equal(q.clips.length, 6);
  // pasted after c1 (the playhead at 4 s is past c1's middle), in their original order
  assert.deepEqual(q.clips.slice(1, 4).map((x) => x.id), rm.group.map((s) => s.id));
  assert.equal(q.clips[0].id, 'c1');
  assert.equal(q.clips[4].id, 'c2');
  assert.equal(pasteGroup(q, null, 0, id).error.length > 0, true);
});

test('duplicate a group: the copy starts where the group ends', () => {
  const p = proj();
  const r = duplicateGroup(p, [{ type: 'text', id: 't1' }, { type: 'text', id: 't2' }], id);
  assert.equal(r.group.length, 2);
  assert.deepEqual(r.group.map((s) => p.texts.find((t) => t.id === s.id).start), [9, 14]);
  const q = proj();
  const rm = duplicateGroup(q, [{ type: 'clip', id: 'c1' }, { type: 'clip', id: 'c2' }], id);
  assert.deepEqual(q.clips.map((c) => c.id), ['c1', 'c2', ...rm.group.map((s) => s.id), 'c3']);
  assert.ok(duplicateGroup(q, [], id).error);
});
