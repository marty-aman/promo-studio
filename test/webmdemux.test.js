import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWebm, vint } from '../js/webmdemux.js';
import { pickFrame, keyBefore } from '../js/exportplan.js';

// a tiny EBML writer, enough to build test files
const idBytes = (id) => {
  const out = [];
  for (let v = id; v > 0; v = Math.floor(v / 256)) out.unshift(v & 0xff);
  return out;
};
const el = (id, body, unknown = false) => [...idBytes(id), ...(unknown ? [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff] : [0x10, (body.length >>> 16) & 0xff, (body.length >>> 8) & 0xff, body.length & 0xff]), ...body];
const u = (n, len = 1) => Array.from({ length: len }, (_, i) => (n >>> (8 * (len - 1 - i))) & 0xff);
const str = (s) => [...s].map((c) => c.charCodeAt(0));
const simple = (track, rel, key, payload) => el(0xa3, [0x80 | track, (rel >> 8) & 0xff, rel & 0xff, key ? 0x80 : 0, ...payload]);

function file({ unknown = true, scale = 1_000_000 } = {}) {
  const tracks = el(0x1654ae6b, [
    ...el(0xae, [...el(0xd7, u(1)), ...el(0x83, u(2)), ...el(0x86, str('A_OPUS'))]),
    ...el(0xae, [...el(0xd7, u(2)), ...el(0x83, u(1)), ...el(0x86, str('V_VP8')), ...el(0xe0, [...el(0xb0, u(360, 2)), ...el(0xba, u(640, 2))])]),
  ]);
  const info = el(0x1549a966, el(0x2ad7b1, u(scale, 3)));
  const c1 = el(0x1f43b675, [...el(0xe7, u(0)), ...simple(2, 0, true, [1, 1]), ...simple(1, 0, true, [9]), ...simple(2, 33, false, [2]), ...simple(2, 67, false, [3])], unknown);
  const c2 = el(0x1f43b675, [...el(0xe7, u(100, 2)), ...simple(2, 0, true, [4]), ...el(0xa0, [...el(0xa1, [0x82, 0, 33, 0, 5]), ...el(0xfb, u(1))])], unknown);
  const head = el(0x1a45dfa3, el(0x4282, str('webm')));
  return new Uint8Array([...head, ...el(0x18538067, [...info, ...tracks, ...c1, ...c2], unknown)]);
}

test('vint reads EBML ids, sizes and the unknown size', () => {
  assert.deepEqual(vint([0x81], 0), { value: 1, len: 1 });
  assert.deepEqual(vint([0x40, 0x02], 0), { value: 2, len: 2 });
  assert.deepEqual(vint([0x1a, 0x45, 0xdf, 0xa3], 0, true), { value: 0x1a45dfa3, len: 4 });
  assert.equal(vint([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff], 0).value, -1);
  assert.equal(vint([0xff], 0).value, -1);
  assert.equal(vint([0x00], 0), null);
});

test('parseWebm: the video track, its frames in order, key frames, cluster times, unknown sizes', () => {
  for (const unknown of [true, false]) {
    const r = parseWebm(file({ unknown }));
    assert.ok(r, `unknown=${unknown}`);
    assert.equal(r.codec, 'vp8');
    assert.deepEqual([r.width, r.height], [360, 640]);
    assert.deepEqual(r.samples.map((s) => +s.ts.toFixed(3)), [0, 0.033, 0.067, 0.1, 0.133]);
    assert.deepEqual(r.samples.map((s) => s.key), [true, false, false, true, false], 'a Block with a ReferenceBlock is not a key frame');
    assert.deepEqual(r.samples.map((s) => [...s.data]), [[1, 1], [2], [3], [4], [5]], 'the audio track is left out');
  }
  assert.equal(parseWebm(new Uint8Array([1, 2, 3])), null);
});

test('pickFrame and keyBefore', () => {
  assert.equal(pickFrame([], 1), -1);
  assert.equal(pickFrame([0.5, 0.533], 0.1), 0, 'before the first frame: the first');
  assert.equal(pickFrame([0, 0.0333, 0.0667], 0.0333), 1);
  assert.equal(pickFrame([0, 0.0333, 0.0667], 0.06), 1);
  assert.equal(pickFrame([0, 0.0333, 0.0667], 5), 2);
  const order = [{ key: true, ts: 0 }, { key: false, ts: 0.5 }, { key: true, ts: 1 }, { key: false, ts: 1.5 }];
  assert.equal(keyBefore(order, 0.9), 0);
  assert.equal(keyBefore(order, 1), 2);
  assert.equal(keyBefore(order, 9), 2);
});
