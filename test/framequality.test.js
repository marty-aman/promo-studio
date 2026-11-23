import test from 'node:test';
import assert from 'node:assert/strict';
import { laplacianVariance, frameStats, shiftBetween, burstMotion, flagsOf, sampleScore, scoreRange, weakStretches, summarize, isWeakTake, bestStart, sampleTimes, buildQuality } from '../js/framequality.js';
import { applyTake } from '../js/suggest.js';

const W = 96;
const H = 54;
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const noise = () => Float32Array.from({ length: W * H }, () => (rnd() > 0.5 ? 200 : 50));
const blur = (g, k = 3) => {
  const o = new Float32Array(g.length);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -k; dy <= k; dy++) {
        for (let dx = -k; dx <= k; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H) {
            s += g[yy * W + xx];
            n++;
          }
        }
      }
      o[y * W + x] = s / n;
    }
  }
  return o;
};
// a picture moved by (dx, dy): out(x, y) = g(x - dx, y - dy)
const moved = (g, dx, dy) =>
  Float32Array.from({ length: W * H }, (_, i) => {
    const x = (i % W) - dx;
    const y = Math.floor(i / W) - dy;
    return g[((y + H) % H) * W + ((x + W) % W)];
  });

test('Laplacian variance: sharp noise is far above a blurred copy, a flat frame is 0', () => {
  const s = noise();
  assert.ok(laplacianVariance(s, W, H) > 1000);
  assert.ok(laplacianVariance(blur(s), W, H) < laplacianVariance(s, W, H) / 20);
  assert.equal(laplacianVariance(new Float32Array(W * H).fill(120), W, H), 0);
});

test('frameStats: brightness and clipped share', () => {
  const st = frameStats(new Float32Array(W * H).fill(255), W, H);
  assert.equal(st.luma, 255);
  assert.equal(st.over, 1);
});

test('shiftBetween finds a known shift magnitude and calls a still frame still', () => {
  const a = noise();
  const r = shiftBetween(a, moved(a, 3, -2), W, H);
  assert.equal(Math.abs(r.dx), 3);
  assert.equal(Math.abs(r.dy), 2);
  const s = shiftBetween(a, a, W, H);
  assert.deepEqual([s.dx, s.dy], [0, 0]);
  const flat = new Float32Array(W * H).fill(90);
  const f = shiftBetween(flat, flat, W, H);
  assert.deepEqual([f.dx, f.dy], [0, 0]);
});

test('burstMotion: a steady pan has motion but no jerk, a shake has jerk', () => {
  const a = noise();
  const pan = burstMotion(a, moved(a, 2, 0), moved(a, 4, 0), W, H);
  assert.ok(pan.mag > 1.5 && pan.jerk < 0.01);
  const shake = burstMotion(a, moved(a, 4, 0), moved(a, -1, 0), W, H);
  assert.ok(shake.jerk > 2.2);
});

const mk = (t, o = {}) => ({ t, sharp: 300, luma: 120, over: 0, mag: 1, jerk: 0, ...o });

test('flags and scores', () => {
  assert.deepEqual(flagsOf(mk(0)), []);
  assert.deepEqual(flagsOf(mk(0, { sharp: 5 })), ['blurry']);
  assert.deepEqual(flagsOf(mk(0, { jerk: 5 })), ['shaky']);
  assert.deepEqual(flagsOf(mk(0, { luma: 10, sharp: 0 })), ['dark']);
  assert.deepEqual(flagsOf(mk(0, { luma: 240 })), ['bright']);
  assert.ok(sampleScore(mk(0)) > 0.9);
  assert.ok(sampleScore(mk(0, { sharp: 5 })) < 0.2);
  assert.ok(sampleScore(mk(0, { jerk: 5 })) < 0.1);
  assert.ok(sampleScore(mk(0, { luma: 20 })) < 0.5);
});

// 0..5 s sharp, 5..10 s blurred, 10..15 s shaky, step 1 s
const q = buildQuality(Array.from({ length: 15 }, (_, t) => mk(t + 0.5, t >= 10 ? { jerk: 6 } : t >= 5 ? { sharp: 4 } : {})), 15, 1);

test('scoreRange and weakStretches', () => {
  assert.ok(scoreRange(q, 0, 4).score > 0.85);
  assert.ok(scoreRange(q, 5, 9).score < 0.15);
  assert.deepEqual(scoreRange(q, 6, 8).flags, ['blurry']);
  const w = weakStretches(q);
  assert.equal(w.length, 2);
  assert.deepEqual(w[0].flags, ['blurry']);
  assert.deepEqual(w[1].flags, ['shaky']);
  assert.equal(w[0].from, 5);
  assert.equal(w[1].to, 15);
  assert.deepEqual(summarize(q).flags, ['Blurry', 'Shaky']);
  assert.equal(isWeakTake(q), false); // two thirds is weak, but one good stretch is still worth cutting from
  assert.equal(isWeakTake(buildQuality([mk(0, { sharp: 1 }), mk(1, { sharp: 1 })], 2, 1)), true);
});

test('bestStart picks the sharp stretch, avoids reuse, honours the extra score, falls back without data', () => {
  const s = bestStart(q, 4, 15);
  assert.ok(s >= 0 && s <= 1.01, `start ${s}`);
  const second = bestStart(q, 4, 15, [[s, s + 4]]);
  assert.notEqual(second, s);
  const flat = buildQuality(Array.from({ length: 15 }, (_, t) => mk(t + 0.5)), 15, 1);
  const biased = bestStart(flat, 3, 15, [], (a) => (a >= 8 ? 1 : 0));
  assert.ok(biased >= 7.5, `extra hook ignored: ${biased}`);
  assert.equal(bestStart(null, 4, 15), 0);
  assert.equal(bestStart(null, 4, 15, [[0, 4]]), 4);
  assert.equal(bestStart(q, 20, 15), 0);
});

test('sampleTimes: short clip, long clip, bad duration', () => {
  assert.deepEqual(sampleTimes(0.2), [0]);
  assert.equal(sampleTimes(NaN).length, 0);
  assert.ok(sampleTimes(600).length <= 91);
  assert.ok(sampleTimes(10).every((t) => t >= 0 && t < 10));
});

test('suggest.js: the first cut skips the weak take and starts on the sharp stretch, cuts stay on the beat', () => {
  const song = { id: 's', kind: 'audio', name: 'Song', duration: 60, envelope: new Float32Array(6000).fill(0.5), envRate: 100 };
  const beats = { bpm: 120, beats: Array.from({ length: 200 }, (_, i) => 1 + i * 0.5) };
  const q2 = buildQuality(Array.from({ length: 15 }, (_, t) => mk(t + 0.5, t >= 10 ? { sharp: 4 } : {})), 15, 1);
  const good = { id: 'g', kind: 'video', name: 'good', duration: 15, quality: q2 };
  const bad = { id: 'b', kind: 'video', name: 'bad', duration: 15, quality: buildQuality([mk(1, { sharp: 1 }), mk(3, { sharp: 1 })], 15, 2) };
  const photo = { id: 'p', kind: 'image', name: 'pic', duration: 0 };
  const draft = () => ({ clips: [], layers: [], texts: [], endCard: { enabled: false, duration: 3 }, look: {}, lyricStyle: {}, duration: 0 });
  const take = { id: 't', template: 'rock', hookLen: 15, beatsPerCut: 4 };
  const d = draft();
  const facts = applyTake(d, take, { inv: { song, beats, clips: [bad, good], sources: [], lyrics: 0 } });
  assert.ok(d.clips.length > 1);
  assert.ok(d.clips.every((c) => c.mediaId === 'g'));
  assert.ok(d.clips[0].in <= 1.01, `first cut should start in the sharp half: ${d.clips[0].in}`);
  assert.ok(facts.some((f) => /leaving out 1 weak take/.test(f)));
  // a photo and a video without analysis still work
  const d2 = draft();
  applyTake(d2, take, { inv: { song, beats, clips: [photo, { id: 'n', kind: 'video', name: 'n', duration: 9 }], sources: [], lyrics: 0 } });
  assert.ok(d2.clips.some((c) => c.mediaId === 'p') && d2.clips.some((c) => c.mediaId === 'n'));
  // the hook for a later score
  const d3 = draft();
  const flat = buildQuality(Array.from({ length: 15 }, (_, t) => mk(t + 0.5)), 15, 1);
  applyTake(d3, { ...take, beatsPerCut: 8 }, { inv: { song, beats, clips: [{ ...good, quality: flat }], sources: [], lyrics: 0 }, extraScore: (rec, a) => (a >= 9 ? 1 : 0) });
  assert.ok(d3.clips[0].in >= 8, `extraScore ignored: ${d3.clips[0].in}`);
});
