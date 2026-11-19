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
