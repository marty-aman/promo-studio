import test from 'node:test';
import assert from 'node:assert/strict';
import { kitLayout, strikePoint, KIT_WRAPS, KIT_FINISHES, METAL_FINISHES, kitDoubleKick, lookOf, wrapOf, mixHex } from '../js/drumkit.js';

test('rack toms sit above the kick hoop(s) at any box shape, with one kick or two', () => {
  for (const doubleKick of [false, true]) {
    for (const [w, hh] of [[1600, 900], [600, 300], [400, 900], [1000, 200]]) {
      const k = kitLayout(0, 0, w, hh, { doubleKick });
      for (const t of k.toms.slice(0, 2)) assert.ok(t.y + t.depth + t.ry <= k.kick.top + 1e-6 || t.y <= hh * 0.2 + 1e-6, `${w}x${hh} ${doubleKick}`);
    }
  }
});

test('a double bass kit has two kicks side by side, mirrored about the centre', () => {
  const one = kitLayout(0, 0, 1600, 900);
  const two = kitLayout(0, 0, 1600, 900, { doubleKick: true });
  assert.equal(one.kicks.length, 1);
  assert.equal(two.kicks.length, 2);
  assert.ok(Math.abs(two.kicks[0].x + two.kicks[1].x - 2 * two.cx) < 1e-6);
  assert.ok(two.kicks[1].x - two.kicks[0].x >= two.kicks[0].r * 2, 'they do not overlap');
  assert.ok(two.snare.x < one.snare.x && two.toms[2].x > one.toms[2].x, 'snare and floor tom move out');
  assert.deepEqual(strikePoint(two, 'kick', 1), [two.kicks[1].x, two.kicks[1].y]);
  assert.deepEqual(strikePoint(two, 'kick', 5), [two.kicks[1].x, two.kicks[1].y]);
});

test('metal finishes default to double bass; the layer can turn it off', () => {
  for (const f of ['inferno', 'thunder', 'frostbite', 'steel']) {
    assert.ok(METAL_FINISHES.has(f));
    assert.ok(KIT_FINISHES.some(([k]) => k === f));
    assert.equal(kitDoubleKick({ kitFinish: f }), true);
    assert.equal(kitDoubleKick({ kitFinish: f, doubleKick: false }), false);
    assert.ok(lookOf(f).wrap && lookOf(f).fx, f);
  }
  assert.equal(kitDoubleKick({ kitFinish: 'stage' }), false);
  assert.equal(kitDoubleKick({ kitFinish: 'stage', doubleKick: true }), true);
  assert.equal(lookOf('nope'), lookOf('stage'));
});

test('wraps and colour mixing', () => {
  assert.equal(KIT_WRAPS.length, 6);
  assert.equal(wrapOf('nope'), KIT_WRAPS[0][2]);
  assert.equal(wrapOf('maple').kind, 'wood');
  assert.equal(mixHex('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(mixHex('#102030', '#102030', 0.7), '#102030');
});

test('the kit has a china, two crashes, a ride and high, mid and floor toms', async () => {
  const { LANES, chartLanes, laneColorOf } = await import('../js/drums.js');
  const ids = LANES.map((l) => l.id);
  for (const id of ['china', 'crash', 'crash2', 'ride', 'hihat', 'tom1', 'tom2', 'floor', 'snare', 'kick']) assert.ok(ids.includes(id), id);
  const L = kitLayout(0, 0, 1600, 900);
  for (const lane of ['china', 'crash', 'crash2', 'ride', 'tom1', 'tom2', 'floor']) {
    const p = strikePoint(L, lane);
    assert.ok(p && p[0] >= 0 && p[0] <= 1600 && p[1] >= 0 && p[1] <= 900, lane);
  }
  // cymbals stay inside the box and clear of each other
  const cym = [L.china, L.crash, L.crash2, L.ride];
  for (const c of cym) assert.ok(c.x - c.r >= 0 && c.x + c.r <= 1600, 'inside');
  for (let i = 0; i < cym.length; i++) for (let j = i + 1; j < cym.length; j++) assert.ok(Math.hypot(cym[i].x - cym[j].x, (cym[i].y - cym[j].y) * 4) > (cym[i].r + cym[j].r) * 0.8, `${i}-${j}`);
  // lane styles show the whole kit for a Guitar Pro part, only the found lanes for a stem
  assert.equal(chartLanes({ source: 'gp' }, { lanes: ['kick'] }).length, 10);
  assert.deepEqual(chartLanes({ source: 'audio' }, { lanes: ['kick', 'snare'] }), ['kick', 'snare']);
  assert.equal(chartLanes({ source: 'gp', allLanes: false }, { lanes: ['kick'] }).length, 1);
  // older projects: new toms take the old tom colour, crash 2 and china the crash colour
  assert.equal(laneColorOf({ colors: { tom: '#123456' } }, 'floor'), '#123456');
  assert.equal(laneColorOf({ colors: { crash: '#abcdef' } }, 'china'), '#abcdef');
  assert.equal(laneColorOf({ colors: { china: '#000001', crash: '#abcdef' } }, 'china'), '#000001');
});

test('blackout is all black and grey', () => {
  const look = lookOf('blackout');
  const grey = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return Math.max(r, g, b) - Math.min(r, g, b) <= 8;
  };
  for (const c of [look.wrap.base, look.wrap.reso, look.wrap.ink, look.light, look.rug, look.glow]) assert.ok(grey(c), c);
  assert.equal(kitDoubleKick({ kitFinish: 'blackout' }), true);
});

test('kit pieces: turned-off pieces hand their hits to the closest piece that is on', async () => {
  const { kitLane, withKit, chartLanes, pieceOn, KIT_PRESETS } = await import('../js/drums.js');
  const off = (...ids) => ({ kitPieces: Object.fromEntries(ids.map((i) => [i, false])) });
  assert.equal(kitLane({}, 'china'), 'china');
  assert.equal(kitLane(off('china'), 'china'), 'crash2');
  assert.equal(kitLane(off('china', 'crash2'), 'china'), 'crash');
  assert.equal(kitLane(off('china', 'crash', 'crash2'), 'china'), 'ride');
  assert.equal(kitLane(off('tom2'), 'tom2'), 'tom1');
  assert.equal(kitLane(off('tom1', 'tom2'), 'tom1'), 'floor');
  assert.equal(kitLane(off('snare'), 'snare'), null);
  assert.equal(pieceOn({ kitPieces: { kick: false } }, 'kick'), true, 'the kick stays');

  const data = { hits: [{ time: 0, lane: 'china' }, { time: 0.5, lane: 'tom2' }, { time: 1, lane: 'snare' }, { time: 1.5, lane: 'kick' }], lanes: ['china', 'tom2', 'snare', 'kick'] };
  assert.equal(withKit({}, data), data, 'nothing off: same chart');
  const layer = off('china', 'tom2', 'snare');
  const k = withKit(layer, data);
  assert.deepEqual(k.hits.map((h) => h.lane), ['crash2', 'tom1', 'kick']);
  assert.deepEqual(k.lanes, ['crash2', 'tom1', 'kick']);
  assert.equal(withKit(layer, data), k, 'cached');
  assert.equal(data.hits[0].lane, 'china', 'the original chart is untouched');
  assert.ok(!chartLanes({ source: 'gp', ...layer }, k).includes('china'));
  assert.equal(chartLanes({ source: 'gp', ...layer }, k).length, 7);
  // presets only name real pieces, never the kick
  for (const [, [label, offs]] of Object.entries(KIT_PRESETS)) {
    assert.ok(label && offs.every((p) => p !== 'kick'));
  }
});

test('one rack tom sits in the middle over the kick', () => {
  const both = kitLayout(0, 0, 1600, 900);
  const one = kitLayout(0, 0, 1600, 900, { has: (id) => id !== 'tom2' });
  assert.ok(Math.abs(one.toms[0].x - one.cx) < 1e-6);
  assert.ok(both.toms[0].x < both.cx);
});
