import test from 'node:test';
import assert from 'node:assert/strict';
import { EXITS, ENTRANCES, exitTransform, enterTransform, exitProgress, enterProgress, combine, isStill, STILL } from '../js/exits.js';

test('every exit starts fully there and ends gone (or cut at the very end)', () => {
  for (const [id] of EXITS) {
    assert.ok(isStill(exitTransform(id, 0)), id);
    const end = exitTransform(id, 1);
    assert.ok(end.alpha <= 0.001 || end.scale <= 0.06, `${id} ends gone`);
  }
  assert.equal(exitTransform('cut', 0.9).alpha, 1);
});

test('exits move the way their names say', () => {
  assert.ok(exitTransform('slidedown', 0.6).fy > 0 && exitTransform('slideup', 0.6).fy < 0);
  assert.ok(exitTransform('slideleft', 0.6).fx < 0 && exitTransform('slideright', 0.6).fx > 0);
  assert.ok(exitTransform('zoomout', 0.5).scale > 1 && exitTransform('shrink', 0.5).scale < 1);
  assert.ok(exitTransform('popout', 0.2).scale > 1); // swells before it goes
  assert.ok(exitTransform('spin', 0.5).rot > 0 && exitTransform('blur', 0.5).blur > 0);
  assert.ok(exitTransform('drop', 0.5).fy > exitTransform('drop', 0.25).fy * 3); // speeds up like falling
  const fl = [0.2, 0.4, 0.6, 0.8].map((q) => exitTransform('flicker', q).alpha);
  assert.ok(new Set(fl.map((a) => a < 0.5)).size === 2);
});

test('entrances are exits played backwards; progress and combining', () => {
  assert.deepEqual(enterTransform('slidedown', 1), STILL);
  assert.deepEqual(enterTransform('slidedown', 0.3), exitTransform('slidedown', 0.7));
  assert.ok(ENTRANCES.every(([id]) => EXITS.some(([e]) => e === id)));
  assert.equal(exitProgress(0.5, 0.5), 0);
  assert.equal(exitProgress(0.25, 0.5), 0.5);
  assert.equal(exitProgress(-1, 0.5), 1);
  assert.equal(enterProgress(0.2, 0.4), 0.5);
  const c = combine(exitTransform('fade', 0.5), exitTransform('slideup', 0.5));
  assert.ok(c.alpha < 0.5 && c.fy < 0);
});
