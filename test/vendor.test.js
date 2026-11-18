import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../vendor/mediapipe/${p}`, import.meta.url), 'utf8');

test('vendored MediaPipe never sends usage metrics', () => {
  const js = read('vision_bundle.mjs');
  // the logger's flush() discards its queue before it can reach the network call
  assert.ok(js.includes('flush(t,e){/* promo-studio patch: usage metrics are never sent */this.i=[];t?.();return;'), 'patch present');
  assert.equal(js.split('promo-studio patch').length - 1, 1);
  assert.ok(!js.includes('sourceMappingURL'), 'no dangling source map');
  // the WASM loader has no network endpoints of its own
  assert.ok(!/googleapis\.com/.test(read('wasm/vision_wasm_internal.js')));
  assert.match(read('LICENSE'), /Apache License\s+Version 2\.0/);
  assert.match(read('README.md'), /promo-studio patch/);
  assert.ok(statSync(new URL('../vendor/mediapipe/selfie_segmenter.tflite', import.meta.url)).size > 200_000);
});
