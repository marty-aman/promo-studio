import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTabBytes } from '../js/tab.js';
import { midiToLane, drumTracks, drumTimelineFromScore, detectOnsets } from '../js/drums.js';
import { fft, bandEdges, analyseSamples } from '../js/viz.js';

test('GM drum numbers map to chart lanes', () => {
  assert.deepEqual([36, 38, 42, 46, 45, 49, 51, 80].map(midiToLane), ['kick', 'snare', 'hihat', 'hihat', 'tom', 'crash', 'ride', null]);
});

test('drum timeline from a Guitar Pro drum track', async () => {
  const score = await parseTabBytes(readFileSync(new URL('./fixtures/spark-drums.gp', import.meta.url)));
  const tracks = drumTracks(score);
  assert.equal(tracks.length, 1);
  const tl = drumTimelineFromScore(score, tracks[0].index);
  assert.deepEqual(tl.lanes, ['crash', 'ride', 'hihat', 'tom', 'snare', 'kick']);
  // bar 1 at 120 BPM: kick on 0, snare on beat 2 (0.5 s), hi-hat eighths (every 0.25 s)
  const at = (t) => tl.hits.filter((h) => Math.abs(h.time - t) < 1e-3).map((h) => h.lane).sort();
  assert.deepEqual(at(0), ['hihat', 'kick']);
  assert.deepEqual(at(0.5), ['hihat', 'snare']);
  assert.deepEqual(at(0.25), ['hihat']);
  assert.equal(tl.bars.length, 4);
  assert.ok(tl.hits.some((h) => h.lane === 'crash' && Math.abs(h.time - 4) < 1e-3));
});

test('onset detection finds clicks and respects the minimum gap', () => {
  const rate = 100;
  const env = new Float32Array(rate * 4).fill(0.02);
  const clicks = [0.5, 1.0, 1.5, 1.52, 2.5, 3.25];
  for (const c of clicks) {
    const i = Math.round(c * rate);
    env[i] = 1;
    env[i + 1] = 0.5;
  }
  const on = detectOnsets(env, rate, { sensitivity: 0.5, minGap: 0.09 }).map((o) => o.time);
  assert.deepEqual(on, [0.5, 1, 1.5, 2.5, 3.25]); // 1.52 is inside the gap
});

test('fft finds a pure tone in the right band', () => {
  const n = 1024;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * 64 * i) / n);
  fft(re, im);
  let best = 0;
  for (let k = 1; k < n / 2; k++) if (Math.hypot(re[k], im[k]) > Math.hypot(re[best], im[best])) best = k;
  assert.equal(best, 64);
  const edges = bandEdges(22050);
  assert.equal(edges.length, 17);
  assert.ok(edges.every((e, i) => i === 0 || e >= edges[i - 1]));
});

test('analysis: level follows loudness, bass tone lands in a low band', () => {
  const sr = 22050;
  const mono = new Float32Array(sr * 2);
  for (let i = 0; i < mono.length; i++) mono[i] = (i < sr ? 0.05 : 0.8) * Math.sin((2 * Math.PI * 80 * i) / sr);
  const f = analyseSamples(mono, sr);
  assert.equal(f.frames, 60);
  assert.ok(f.level[45] > f.level[10] * 5);
  const b = Array.from(f.bands.slice(45 * 16, 46 * 16));
  const top = b.indexOf(Math.max(...b));
  assert.ok(top <= 3, `bass in band ${top}`);
  assert.equal(f.wave.length, 8000);
});

import { cleanBleed } from '../js/drums.js';
import { findClip, overlayClipAt, isVisible, newProject } from '../js/state.js';
import { applyLayout } from '../js/templates.js';

test('snare bleed from hats is removed, real snares kept', () => {
  const snares = [{ time: 0.5, strength: 1 }, { time: 0.75, strength: 0.2 }, { time: 1.5, strength: 0.9 }, { time: 1.75, strength: 0.25 }];
  const hats = [{ time: 0.75 }, { time: 1.5 }, { time: 1.75 }];
  assert.deepEqual(cleanBleed(snares, [hats]).map((s) => s.time), [0.5, 1.5]);
});

test('layer helpers: findClip, overlayClipAt, isVisible, stacked layouts', () => {
  const p = newProject();
  p.clips = [{ id: 'main', duration: 3 }];
  p.layers = [
    { id: 'v', type: 'video', clips: [{ id: 'o1', start: 1, duration: 2 }] },
    { id: 't1', type: 'tab', height: 16 },
    { id: 'd1', type: 'drums', style: 'lanes', height: 18 },
    { id: 'z', type: 'viz', visible: false },
  ];
  p.layerVis = { lyrics: false };
  assert.equal(findClip(p, 'main').layer, null);
  assert.equal(findClip(p, 'o1').layer.id, 'v');
  assert.equal(overlayClipAt(p.layers[0], 2.5).id, 'o1');
  assert.equal(overlayClipAt(p.layers[0], 3.1), null);
  assert.ok(!isVisible(p, 'lyrics') && isVisible(p, 'text') && !isVisible(p, p.layers[3]));
  applyLayout(p, 'tiktok');
  const [tab, drums] = [p.layers[1], p.layers[2]];
  assert.ok(drums.y - drums.height / 2 >= tab.y + tab.height / 2, 'drum lanes stacked under the tab');
  assert.ok(tab.y - tab.height / 2 >= 11, 'inside the TikTok clear area');
});
