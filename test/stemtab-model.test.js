// The real Basic Pitch model (vendor/basic-pitch) on synthetic guitar and bass parts: known notes at known
// times, plucked (Karplus-Strong) so they decay like strings. Runs TensorFlow.js on the CPU, so it takes a while.
import { createRequire } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.require ||= createRequire(import.meta.url); // TensorFlow.js asks for require() when it sees Node

const tf = await import('../vendor/basic-pitch/tf.fesm.min.js');
const BP = await import('../js/ai/basicpitch.js');
const { cleanNotes, notesToTrack, playableRange } = await import('../js/stemtab.js');
const { TUNINGS, barFill, barQuarters } = await import('../js/tabedit.js');

const json = JSON.parse(readFileSync(new URL('../vendor/basic-pitch/model/model.json', import.meta.url), 'utf8'));
const w = readFileSync(new URL('../vendor/basic-pitch/model/group1-shard1of1.bin', import.meta.url));
BP.setModelSourceForTesting(tf.io.fromMemory({ modelTopology: json.modelTopology, weightSpecs: json.weightsManifest[0].weights, weightData: w.buffer.slice(w.byteOffset, w.byteOffset + w.byteLength) }));

const SR = BP.BP_SR;
/** A plucked string (Karplus-Strong) for each [time, midi, length] into a buffer of `dur` seconds. */
function pluck(notes, dur, { gain = 0.35, seed = 7 } = {}) {
  const out = new Float32Array(Math.round(dur * SR));
  let r = seed;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (const [t, m, len] of notes) {
    const f = 440 * 2 ** ((m - 69) / 12);
    const p = Math.max(2, Math.round(SR / f));
    const buf = Float32Array.from({ length: p }, rnd);
    const i0 = Math.round(t * SR);
    const n = Math.round(len * SR);
    for (let i = 0; i < n && i0 + i < out.length; i++) {
      const k = i % p;
      const v = buf[k];
      buf[k] = 0.996 * 0.5 * (v + buf[(k + 1) % p]);
      const fade = i > n - 200 ? (n - i) / 200 : 1; // the player lets go
      out[i0 + i] += gain * v * fade;
    }
  }
  return out;
}

const match = (found, want, tol = 0.06) => want.map(([t, m]) => found.find((n) => n.pitch === m && Math.abs(n.start - t) <= tol));

test('Basic Pitch finds a plucked guitar riff: right pitches, onsets within 60 ms, then a playable tab', async () => {
  // E minor riff at 120 BPM, eighth notes (0.25 s): E2 G2 A2 B2 D3 E3, then a held A2
  const riff = [[0.5, 40, 0.24], [0.75, 43, 0.24], [1.0, 45, 0.24], [1.25, 47, 0.24], [1.5, 50, 0.24], [1.75, 52, 0.24], [2.0, 45, 0.9]];
  const audio = pluck(riff, 3.4);
  let last = 0;
  const { notes, backend } = await BP.detectNotes(audio, { range: playableRange(TUNINGS['Guitar · Standard E']), onProgress: (p) => (last = p) });
  assert.equal(backend, 'cpu');
  assert.equal(last, 1);
  const tun = TUNINGS['Guitar · Standard E'];
  const { notes: clean } = cleanNotes(notes, { range: playableRange(tun), mono: true });
  const hits = match(clean, riff);
  assert.ok(hits.filter(Boolean).length >= 6, `found ${hits.filter(Boolean).length} of 7: ${JSON.stringify(clean.map((n) => [n.start, n.pitch]))}`);
  // no extra notes left after the clean-up (overtones are gone)
  assert.ok(clean.length <= riff.length + 1, `extra notes: ${JSON.stringify(clean.map((n) => [n.start, n.pitch]))}`);
  const res = notesToTrack(clean, { tuning: tun, bpm: 120, firstBeat: 0.5, grid: '8' });
  assert.ok(Math.abs(res.offset - 0.5) < 1e-6);
  for (const bar of res.track.bars) assert.ok(Math.abs(barFill(bar) - barQuarters([4, 4])) < 1e-9);
  const first = res.track.bars[0].beats.filter((b) => !b.rest).map((b) => tun[b.notes[0].s - 1] + b.notes[0].f);
  assert.deepEqual(first.slice(0, 6), [40, 43, 45, 47, 50, 52]);
});

test('Basic Pitch on a bass line, in short windows: notes held across a window edge stay one note', async () => {
  const line = [[0.3, 28, 0.45], [0.8, 31, 0.45], [1.3, 33, 1.2], [2.6, 35, 0.4]]; // E1 G1 A1 (held across 2.0 s) B1
  const audio = pluck(line, 3.3, { gain: 0.5, seed: 3 });
  const tun = TUNINGS['Bass · Standard E'];
  const { notes } = await BP.detectNotes(audio, { range: playableRange(tun), chunkSec: 2 });
  const { notes: clean } = cleanNotes(notes, { range: playableRange(tun), mono: true });
  const hits = match(clean, line, 0.08);
  assert.ok(hits.filter(Boolean).length >= 3, `found ${JSON.stringify(clean.map((n) => [n.start, n.pitch, n.dur]))}`);
  const held = clean.filter((n) => n.pitch === 33);
  assert.equal(held.length, 1, `A1 split: ${JSON.stringify(held)}`);
  assert.ok(held[0].start + held[0].dur > 2.1, 'the held note goes past the window edge');
});

test('detectNotes stops when asked', async () => {
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(BP.detectNotes(new Float32Array(SR), { signal: ac.signal }), { name: 'AbortError' });
});
