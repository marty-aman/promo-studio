import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ZOOM_MAX, TAIL_SEC, MAX_LENGTH, fitZoom, zoomMin, clampZoom, zoomToSlider, sliderToZoom, anchorScroll, rulerSteps, rulerLabel, showBeats, LABEL_PX, SLIDER_STEPS } from '../js/tlzoom.js';

test('zoomed out fully, a long edit fits the view', () => {
  for (const min of [10, 20, 30, 60]) {
    const d = min * 60;
    for (const w of [278, 1000, 1328]) {
      const z = zoomMin(d, w);
      assert.ok((d + TAIL_SEC) * z <= w, `${min} min in ${w} px`);
      assert.ok((d + TAIL_SEC) * z >= w - 10, 'and uses the width');
    }
  }
});

test('short edits keep the old 10 px/s limit, fit can be closer', () => {
  assert.equal(zoomMin(30, 1000), 10);
  assert.ok(fitZoom(30, 1000) > 10);
  assert.equal(fitZoom(1, 100000), ZOOM_MAX);
  assert.equal(clampZoom(0.001, 1200, 1000), zoomMin(1200, 1000));
  assert.equal(clampZoom(999, 1200, 1000), ZOOM_MAX);
  assert.ok(MAX_LENGTH >= 30 * 60);
});

test('the log slider round-trips and hits both ends', () => {
  const min = zoomMin(1800, 1000);
  assert.equal(zoomToSlider(min, min), 0);
  assert.equal(zoomToSlider(ZOOM_MAX, min), SLIDER_STEPS);
  assert.ok(Math.abs(sliderToZoom(0, min) - min) < 1e-9);
  assert.ok(Math.abs(sliderToZoom(SLIDER_STEPS, min) - ZOOM_MAX) < 1e-9);
  const v = zoomToSlider(40, min);
  assert.ok(Math.abs(sliderToZoom(v, min) / 40 - 1) < 0.01);
});

test('anchorScroll keeps a moment under the same pixel', () => {
  assert.equal(anchorScroll(100, 2, 50), 150);
  assert.equal(anchorScroll(1, 2, 50), 0);
});

test('ruler labels never sit closer than LABEL_PX at any zoom', () => {
  const seen = new Set();
  for (let pps = 0.02; pps <= ZOOM_MAX; pps *= 1.07) {
    const { label, minor } = rulerSteps(pps);
    assert.ok(label * pps >= LABEL_PX, `pps ${pps}`);
    if (minor) assert.ok(Math.abs(label / minor - Math.round(label / minor)) < 1e-9, 'minor ticks divide the label step');
    seen.add(label);
  }
  for (const l of [0.5, 1, 5, 15, 30, 60, 300]) assert.ok(seen.has(l), `uses ${l} s labels`);
});

test('ruler labels read as m:ss, h:mm:ss, and tenths only under a second', () => {
  assert.equal(rulerLabel(75, 15), '1:15');
  assert.equal(rulerLabel(3900, 300), '1:05:00');
  assert.equal(rulerLabel(1.5, 0.5), '0:01.5');
  assert.equal(rulerLabel(600, 60), '10:00');
});

test('beat marks hide when they would smear together', () => {
  const beats = Array.from({ length: 100 }, (_, i) => i * 0.5);
  assert.equal(showBeats(beats, 40), true);
  assert.equal(showBeats(beats, 2), false);
  assert.equal(showBeats([], 40), false);
});
