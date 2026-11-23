import test from 'node:test';
import assert from 'node:assert/strict';
import { pullBackLayers } from '../js/photo/model.js';

test('layers past the new right edge come back onto the last slide', () => {
  const d = { w: 1080, layers: [{ x: 1166, w: 400 }, { x: 100, w: 300 }, { x: 2000, w: 5000 }] };
  assert.equal(pullBackLayers(d, 1), 2);
  assert.equal(d.layers[0].x, 680);
  assert.equal(d.layers[1].x, 100);
  assert.equal(d.layers[2].x, 0); // wider than a slide: capped at the slide width
});
