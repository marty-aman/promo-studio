import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRatios, polyTiming, sinceHit, hitIndex, together, POLY_STYLES, POLY_PLACEMENT, POLY_DEFAULTS, isPoly } from '../js/vizpoly.js';
import { VIZ_STYLES, setVizStyle, defaultVizLayer } from '../js/viz.js';
import { artistList, workspaceFrom, viewOf, mergeView } from '../js/manager/artists.js';
import { newManager } from '../js/manager/model.js';
import { epkHTML } from '../js/manager/extras.js';

test('counts are read from what you type', () => {
  assert.deepEqual(parseRatios('3, 4, 5'), [3, 4, 5]);
  assert.deepEqual(parseRatios('3:4'), [3, 4]);
  assert.deepEqual(parseRatios('2-6'), [2, 3, 4, 5, 6]);
  assert.deepEqual(parseRatios('5-3'), [5, 4, 3]);
  assert.deepEqual(parseRatios('4, 4, 0, 99, x, 7'), [4, 7]);
  assert.deepEqual(parseRatios('1-40').length, 12, 'at most 12 voices');
  assert.deepEqual(parseRatios('', [3, 4]), [3, 4]);
});

test('the cycle follows the song tempo and downbeat, or a set tempo', () => {
  const beats = { period: 0.5, beats: [0.2, 0.7, 1.2] }; // 120 BPM, first beat at 0.2 s
  const a = polyTiming({ beats, bars: 1 }, 0.2);
  assert.equal(a.cycle, 2);
  assert.equal(a.phase, 0);
  assert.equal(a.fromSong, true);
  assert.equal(a.bpm, 120);
  const b = polyTiming({ beats, bars: 2 }, 3.2);
  assert.equal(b.cycle, 4);
  assert.ok(Math.abs(b.phase - 0.75) < 1e-9);
  const c = polyTiming({ beats, followSong: false, bpm: 90 }, 0);
  assert.equal(c.fromSong, false);
  assert.ok(Math.abs(c.cycle - (60 / 90) * 4) < 1e-9);
  assert.equal(polyTiming({ beats: null, bpm: 0 }, 0).bpm, 120, 'falls back to 120 BPM');
  assert.ok(Math.abs(polyTiming({ beatsPerBar: 3, bpm: 120 }, 0).cycle - 1.5) < 1e-9);
});

test('3 against 4: hits land where they should and line up on the downbeat', () => {
  const cycle = 2;
  // the triangle hits at 0, 1/3, 2/3 of the cycle; the square at 0, 1/4, 1/2, 3/4
  assert.equal(hitIndex(3, 0.34), 1);
  assert.equal(hitIndex(4, 0.34), 1);
  assert.equal(hitIndex(4, 0.5), 2);
  assert.ok(Math.abs(sinceHit(3, 0.34, cycle) - (0.34 - 1 / 3) * cycle) < 1e-9);
  assert.equal(together([3, 4], 0, cycle), 2, 'both on the downbeat');
  assert.equal(together([3, 4], 0.5, cycle), 1, 'only the square on the half');
  assert.equal(together([2, 4], 0.5, cycle), 2);
});

test('the styles are in the visualizer list and switch to a sensible spot', () => {
  for (const [id] of POLY_STYLES) {
    assert.ok(VIZ_STYLES.some(([k]) => k === id), id);
    assert.ok(isPoly(id));
    const x = setVizStyle({ ...defaultVizLayer(), ratios: 'stale' }, id);
    assert.equal(x.ratios, POLY_DEFAULTS[id]);
    assert.equal(x.y, POLY_PLACEMENT[id].y);
  }
  assert.equal(isPoly('bars'), false);
});

test('each artist can have a profile photo, shown in the press kit', () => {
  let ws = workspaceFrom(newManager());
  const v = viewOf(ws);
  v.band.photoId = 'img1';
  ws = mergeView(ws, v);
  assert.equal(artistList(ws)[0].photoId, 'img1');
  const html = epkHTML({ ...newManager(), band: { name: 'Arc Flash', links: {} } }, { avatar: 'data:image/jpeg;base64,AAAA' });
  // the avatar is a frame holding the photo, framed by band.photoPos (centred at 1x by default)
  assert.ok(html.includes('<div class="avatar"><img src="data:image/jpeg;base64,AAAA" alt="Arc Flash" style="object-fit:cover;object-position:50% 50%;transform-origin:50% 50%"></div>'));
  assert.ok(!epkHTML({ ...newManager(), band: { name: 'X', links: {} } }, { avatar: 'javascript:alert(1)' }).includes('class="avatar"'), 'only safe images');
});
