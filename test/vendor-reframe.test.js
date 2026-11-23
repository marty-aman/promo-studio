import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const file = (p) => readFileSync(new URL(`../vendor/mediapipe/${p}`, import.meta.url));
const sha = (p) => createHash('sha256').update(file(p)).digest('hex');

const MODELS = {
  'blaze_face_short_range.tflite': 'b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f',
  'efficientdet_lite0.tflite': '0720bf247bd76e6594ea28fa9c6f7c5242be774818997dbbeffc4da460c723bb',
};

test('auto-reframe models are the vendored, unmodified files', () => {
  const readme = file('README.md').toString('utf8');
  for (const [name, hash] of Object.entries(MODELS)) {
    assert.equal(sha(name), hash, name);
    assert.ok(readme.includes(hash), `${name} hash listed in the README`);
  }
});

test('reframe.js loads only vendored files, never a CDN', () => {
  const js = readFileSync(new URL('../js/reframe.js', import.meta.url), 'utf8');
  const code = js.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l));
  assert.deepEqual(code.filter((l) => /https?:|googleapis|jsdelivr|unpkg/.test(l)), [], 'no network addresses in code');
  for (const name of Object.keys(MODELS)) assert.ok(js.includes(`'${name}'`), name);
  assert.ok(js.includes("'../vendor/mediapipe/'"));
});
