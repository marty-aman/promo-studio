import test from 'node:test';
import assert from 'node:assert/strict';
import { kitLayout, strikePoint, stickPose, REST, KIT_WRAPS, wrapOf, mixHex } from '../js/drumkit.js';

const L = kitLayout(0, 0, 1600, 900);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('rack toms sit above the kick hoop at any box shape', () => {
  for (const [w, hh] of [[1600, 900], [600, 300], [400, 900], [1000, 200]]) {
    const k = kitLayout(0, 0, w, hh);
    for (const t of k.toms.slice(0, 2)) assert.ok(t.y + t.depth + t.ry <= k.kick.top + 1e-6 || t.y <= hh * 0.2 + 1e-6, `${w}x${hh}`);
  }
});

test('a stick is down on the piece at a hit and lifts after it', () => {
  const hit = { lane: 'snare', time: 1, index: 0 };
  const T = strikePoint(L, 'snare');
  const at = stickPose(L, hit, null, 1, REST.left);
  assert.ok(near(at.tip[0], T[0]) && near(at.tip[1], T[1]));
  const later = stickPose(L, hit, null, 1.3, REST.left);
  assert.ok(later.tip[1] < T[1] - L.U * 0.05, 'tip is raised');
  // stick length stays the same while it turns around the grip
  const len = (p) => Math.hypot(p.tip[0] - p.grip[0], p.tip[1] - p.grip[1]);
  assert.ok(near(len(at), len(later), 1e-6));
});

test('a stick comes down just before the next hit and rests when idle', () => {
  const next = { lane: 'tom', time: 2, index: 1 };
  const T = strikePoint(L, 'tom', 1);
  const just = stickPose(L, null, next, 2 - 1e-4, REST.right);
  assert.ok(Math.hypot(just.tip[0] - T[0], just.tip[1] - T[1]) < L.U * 0.01);
  const idle = stickPose(L, null, null, 5, REST.right);
  const F = strikePoint(L, 'tom', 2);
  assert.ok(idle.tip[1] < F[1], 'resting above the floor tom');
  // cymbal grips stay low enough to keep the stick inside the kit
  const cy = stickPose(L, { lane: 'ride', time: 1, index: 0 }, null, 1.3, REST.right);
  assert.ok(cy.grip[1] > L.ride.y - L.U * 0.15);
});

test('wraps and colour mixing', () => {
  assert.equal(KIT_WRAPS.length, 6);
  assert.equal(wrapOf('nope'), KIT_WRAPS[0][2]);
  assert.equal(wrapOf('maple').kind, 'wood');
  assert.equal(mixHex('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(mixHex('#102030', '#102030', 0.7), '#102030');
});
