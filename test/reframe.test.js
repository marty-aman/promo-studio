import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sampleTimes, cropGeometry, panFor, centreFor, clampCentre, keepInside, deadZone, oneEuro, smoothPath,
  pickBy, pickTrack, fillGaps, simplify, planReframe, applyReframe, normDetections, maskBox, describeSummary, narrower,
} from '../js/reframe.js';
import { valueAt, animate, propInfo } from '../js/keyframes.js';

const SRC = { w: 1920, h: 1080 };
const V916 = { W: 1080, H: 1920 };

// a seeded wobble so "detections" have repeatable noise
const noise = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);

/** A face (0..1 box) moving from x0 to x1 over `secs`, sampled at 5 per second, with ±jit noise. */
function movingFace(x0, x1, secs, { jit = 0.01, w = 0.08, h = 0.14, y = 0.3, kind = 'face' } = {}) {
  const r = noise(7);
  const n = secs * 5 + 1;
  return Array.from({ length: n }, (_, i) => {
    const f = i / (n - 1);
    const cx = x0 + (x1 - x0) * f + r() * 2 * jit;
    return { t: +(f * secs).toFixed(3), dets: [{ x: cx - w / 2, y: y + r() * jit, w, h, kind }] };
  });
}

/** The visible window [left, right] of the source at local time t for a reframed clip. */
function windowAt(clip, t, frame = V916, src = SRC) {
  const c = animate(clip, t);
  const g = cropGeometry(src.w, src.h, frame.W, frame.H, c.zoom || 1);
  const cx = centreFor(c.panX || 0, g.overX, g.dw);
  const cy = centreFor(c.panY || 0, g.overY, g.dh);
  return { x0: cx - g.visW / 2, x1: cx + g.visW / 2, y0: cy - g.visH / 2, y1: cy + g.visH / 2 };
}

const baseClip = () => ({ id: 'c1', kind: 'video', in: 0, duration: 6, speed: 1, fit: 'cover', zoom: 1, posX: 0, posY: 0, panX: 0, panY: 0 });

test('crop geometry and pan values for 16:9 into 9:16, 1:1 and 16:9', () => {
  const g = cropGeometry(1920, 1080, 1080, 1920);
  assert.ok(Math.abs(g.visW - 1080 / (1920 * (1920 / 1080))) < 1e-9);
  assert.equal(g.visH, 1);
  assert.equal(panFor(0.5, g.overX, g.dw), 0);
  assert.equal(panFor(g.visW / 2, g.overX, g.dw), 1); // left edge of the picture
  assert.equal(panFor(1 - g.visW / 2, g.overX, g.dw), -1); // right edge
  assert.equal(panFor(0, g.overX, g.dw), 1, 'clamped: never shows past the edge');
  assert.equal(panFor(1, g.overX, g.dw), -1);
  for (const c of [0.2, 0.5, 0.7]) assert.ok(Math.abs(centreFor(panFor(c, g.overX, g.dw), g.overX, g.dw) - c) < 1e-3);
  const sq = cropGeometry(1920, 1080, 1080, 1080);
  assert.ok(Math.abs(sq.visW - 0.5625) < 1e-9);
  const same = cropGeometry(1920, 1080, 1920, 1080);
  assert.equal(panFor(0.1, same.overX, same.dw), 0, 'nothing to pan');
  assert.equal(narrower({ W: 1920, H: 1080 }, SRC), false);
  assert.equal(narrower(V916, SRC), true);
  const z2 = cropGeometry(1920, 1080, 1080, 1920, 2);
  assert.ok(z2.visH === 0.5 && z2.overY > 0);
});

test('window centres clamp to the picture and keep the subject inside', () => {
  assert.equal(clampCentre(0, 0.3), 0.15);
  assert.equal(clampCentre(1, 0.3), 0.85);
  assert.equal(clampCentre(0.2, 1), 0.5);
  // subject at 0.6..0.7, window 0.3 wide centred at 0.4 -> moves right just enough
  assert.ok(Math.abs(keepInside(0.4, 0.6, 0.7, 0.3) - 0.55) < 1e-9);
  assert.equal(keepInside(0.65, 0.6, 0.7, 0.3), 0.65, 'already inside: unchanged');
  // bigger than the window: centre on it, or line up its start
  assert.equal(keepInside(0.2, 0.3, 0.9, 0.4), 0.6);
  assert.ok(Math.abs(keepInside(0.2, 0.3, 0.9, 0.4, 0, true) - 0.5) < 1e-9);
});

test('dead zone ignores small moves and follows big ones', () => {
  assert.deepEqual(deadZone([0.5, 0.52, 0.48, 0.51], 0.05), [0.5, 0.5, 0.5, 0.5]);
  assert.deepEqual(deadZone([0.5, 0.6, 0.7], 0.05).map((v) => +v.toFixed(3)), [0.5, 0.55, 0.65]);
  assert.deepEqual(deadZone([0.5, 0.3], 0.05).map((v) => +v.toFixed(3)), [0.5, 0.35]);
  assert.deepEqual(deadZone([], 0.1), []);
});

test('One-Euro smooths jitter; forwards-backwards does not lag', () => {
  const r = noise(3);
  const ts = Array.from({ length: 50 }, (_, i) => i * 0.2);
  const jittery = ts.map(() => 0.5 + r() * 0.04);
  const sd = (xs) => {
    const m = xs.reduce((a, b) => a + b) / xs.length;
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
  };
  assert.ok(sd(oneEuro(jittery, ts, { minCutoff: 0.3, beta: 0.5 })) < sd(jittery) * 0.6, 'one pass: jitter down by 40%+');
  assert.ok(sd(smoothPath(jittery, ts, { minCutoff: 0.3, beta: 0.5 })) < sd(jittery) / 2, 'two-way: jitter at least halved');
  // a straight move: the two-way filter stays on the line in the middle (no lag)
  const line = ts.map((t) => 0.2 + t * 0.05);
  const two = smoothPath(line, ts, { minCutoff: 0.3, beta: 0.5 });
  const one = oneEuro(line, ts, { minCutoff: 0.3, beta: 0.5 });
  assert.ok(Math.abs(two[25] - line[25]) < 0.01, `two-way ${two[25]} vs ${line[25]}`);
  assert.ok(Math.abs(one[25] - line[25]) > Math.abs(two[25] - line[25]), 'one-way lags more');
});

test('picking a person: largest, most central, and no swapping when two cross', () => {
  const big = { x: 0.05, y: 0.2, w: 0.2, h: 0.3 };
  const mid = { x: 0.45, y: 0.4, w: 0.08, h: 0.12 };
  assert.equal(pickBy([mid, big], 'largest'), big);
  assert.equal(pickBy([big, mid], 'central'), mid);
  assert.equal(pickBy([], 'largest'), null);
  // A walks right, B walks left; they cross in the middle. Track A from the start.
  const samples = Array.from({ length: 21 }, (_, i) => {
    const f = i / 20;
    const a = { x: 0.1 + 0.7 * f, y: 0.3, w: 0.1, h: 0.15, id: 'A' };
    const b = { x: 0.8 - 0.7 * f, y: 0.32, w: 0.09, h: 0.14, id: 'B' };
    return { t: i * 0.2, dets: i % 2 ? [b, a] : [a, b] };
  });
  const tr = pickTrack(samples, 'largest');
  assert.ok(tr.every((d) => d && d.id === 'A'), tr.map((d) => d && d.id).join(''));
  // lost for a while: re-picked by the rule
  const lost = [{ t: 0, dets: [big] }, ...[1, 2, 3, 4].map((i) => ({ t: i, dets: [mid] }))];
  const tl = pickTrack(lost, 'largest');
  assert.equal(tl[1], null);
  assert.equal(tl[4], mid);
});

test('gaps fill with straight lines, ends hold', () => {
  assert.deepEqual(fillGaps([null, 0.2, null, 0.6, null]).map((v) => +v.toFixed(3)), [0.2, 0.2, 0.4, 0.6, 0.6]);
  assert.equal(fillGaps([null, null]), null);
});

test('simplify keeps the shape with fewer points', () => {
  const pts = Array.from({ length: 30 }, (_, i) => ({ t: i, v: i < 15 ? 0 : (i - 15) / 15 }));
  const s = simplify(pts, 0.004);
  assert.ok(s.length <= 4, `${s.length} points`);
  for (const p of pts) assert.ok(Math.abs(valueAt(s.map((k) => ({ ...k, e: 'linear' })), p.t) - p.v) <= 0.004 + 1e-9);
});

test('9:16 reframe: a face walking across a 16:9 clip stays in the frame, and the crop moves smoothly', () => {
  for (const tight of ['loose', 'close']) {
    const samples = movingFace(0.1, 0.88, 6, { jit: 0.012 });
    const plan = planReframe(samples, SRC, V916, { tight, which: 'largest' });
    assert.ok(plan.found && plan.coverage === 1, tight);
    const clip = applyReframe(baseClip(), plan);
    assert.ok(clip.keys.panX.length >= 2 && clip.keys.panX.length < samples.length, `${tight}: ${clip.keys.panX.length} keys`);
    assert.ok(clip.keys.panX.every((k) => k.v >= -1 && k.v <= 1 && k.e === 'linear'));
    let prev = null;
    let maxStep = 0;
    for (let i = 0; i <= 120; i++) {
      const t = (6 * i) / 120;
      const s = samples[Math.min(samples.length - 1, Math.round(t * 5))].dets[0];
      const w = windowAt(clip, t);
      assert.ok(w.x0 >= -1e-6 && w.x1 <= 1 + 1e-6, `${tight} t=${t}: window inside the picture`);
      assert.ok(s.x >= w.x0 - 0.01 && s.x + s.w <= w.x1 + 0.01, `${tight} t=${t}: face ${s.x.toFixed(3)}..${(s.x + s.w).toFixed(3)} in ${w.x0.toFixed(3)}..${w.x1.toFixed(3)}`);
      if (prev != null) maxStep = Math.max(maxStep, Math.abs(w.x0 - prev));
      prev = w.x0;
    }
    // 6 s across ~0.6 of the picture -> about 0.005 per 0.05 s; no frame-to-frame jumps
    assert.ok(maxStep < 0.02, `${tight}: largest step ${maxStep}`);
    if (tight === 'close') assert.ok(plan.zoom > 1 && clip.keys.zoom.length === 1, 'closely zooms in');
    else assert.ok(!clip.keys.zoom && clip.zoom === 1);
  }
});

test('a person who stands still with jittery detections gives a still crop', () => {
  const samples = movingFace(0.6, 0.6, 4, { jit: 0.015 });
  const plan = planReframe(samples, SRC, V916, { tight: 'loose' });
  const vals = plan.panX.map((k) => k.v);
  assert.ok(Math.max(...vals) - Math.min(...vals) < 0.02, vals.join(','));
});

test('no person: nothing found, and too few frames counts as none', () => {
  const none = Array.from({ length: 10 }, (_, i) => ({ t: i * 0.2, dets: [] }));
  assert.deepEqual(planReframe(none, SRC, V916), { found: false, coverage: 0 });
  const once = none.map((s, i) => (i === 3 && false ? s : s));
  once.push(...Array.from({ length: 20 }, (_, i) => ({ t: 2 + i * 0.2, dets: [] })));
  once[3] = { t: 0.6, dets: [{ x: 0.4, y: 0.3, w: 0.1, h: 0.1, kind: 'face' }] };
  assert.equal(planReframe(once, SRC, V916).found, false, '1 frame of 30');
});

test('a person at the very edge: the crop stops at the edge and still contains them', () => {
  const samples = movingFace(0.97, 0.97, 3, { jit: 0.004, w: 0.05 });
  for (const s of samples) s.dets[0].x = Math.min(s.dets[0].x, 0.95);
  const plan = planReframe(samples, SRC, V916);
  assert.ok(plan.panX.every((k) => k.v === -1), plan.panX.map((k) => k.v).join(','));
  const clip = applyReframe(baseClip(), plan);
  const w = windowAt(clip, 1);
  assert.ok(Math.abs(w.x1 - 1) < 1e-3 && w.x0 < 0.95);
});

test('two people: largest or most central', () => {
  const two = Array.from({ length: 16 }, (_, i) => ({
    t: i * 0.2,
    dets: [
      { x: 0.1, y: 0.3, w: 0.12, h: 0.2, kind: 'face' }, // big, on the left
      { x: 0.47, y: 0.35, w: 0.06, h: 0.1, kind: 'face' }, // small, in the middle
    ],
  }));
  const g = cropGeometry(SRC.w, SRC.h, V916.W, V916.H);
  const L = planReframe(two, SRC, V916, { which: 'largest' });
  const C = planReframe(two, SRC, V916, { which: 'central' });
  const cl = centreFor(L.panX[0].v, g.overX, g.dw);
  const cc = centreFor(C.panX[0].v, g.overX, g.dw);
  assert.ok(Math.abs(cl - 0.16) < 0.03, `largest centre ${cl}`);
  assert.ok(Math.abs(cc - 0.5) < 0.03, `central centre ${cc}`);
});

test('speed and in-point: samples cover the source the clip uses, keys are in clip time', () => {
  const s = sampleTimes({ in: 3, duration: 4, speed: 2 }, 20);
  assert.equal(s[0].src, 3);
  assert.equal(s[s.length - 1].src, 11);
  assert.equal(s[s.length - 1].t, 4);
  assert.equal(s.length, 41);
  const end = sampleTimes({ in: 9, duration: 5, speed: 1 }, 10);
  assert.ok(end[end.length - 1].src <= 9.96 && end[end.length - 1].t <= 1, 'stops at the end of the file');
  assert.ok(sampleTimes({ in: 0, duration: 600, speed: 1 }).length <= 240);
});

test('writing keyframes: other keyframes kept, old framing keys replaced, Motion off, Fill on', () => {
  const clip = {
    ...baseClip(),
    fit: 'contain',
    kenBurns: { fromZoom: 1, toZoom: 1.2, fromX: 0, toX: 0, fromY: 0, toY: 0 },
    keys: { opacity: [{ t: 0, v: 0, e: 'smooth' }, { t: 1, v: 1, e: 'smooth' }], panX: [{ t: 0.5, v: 0.9, e: 'smooth' }], zoom: [{ t: 0, v: 3, e: 'smooth' }] },
  };
  const plan = planReframe(movingFace(0.3, 0.7, 6), SRC, V916);
  applyReframe(clip, plan);
  assert.equal(clip.fit, 'cover');
  assert.equal(clip.kenBurns, null);
  assert.equal(clip.keys.opacity.length, 2);
  assert.ok(!clip.keys.zoom && clip.zoom === 1);
  assert.ok(clip.keys.panX.every((k) => k.v !== 0.9));
  assert.equal(clip.panX, clip.keys.panX[0].v);
  assert.ok(!clip.keys.panY, '9:16 from 16:9 at 1x has nothing to pan up or down');
  assert.ok(propInfo('clip', 'panX') && propInfo('clip', 'panY'), 'the Keyframes panel knows the pan keys');
  // a mirrored clip aims at the mirrored place
  const m = planReframe(movingFace(0.2, 0.2, 2, { jit: 0 }), SRC, V916, { flip: true });
  assert.ok(m.panX[0].v < 0, 'person on the left of the file is on the right of a mirrored picture');
});

test('1:1 format: the person stays inside a wider window', () => {
  const sq = { W: 1080, H: 1080 };
  const samples = movingFace(0.15, 0.8, 5);
  const clip = applyReframe({ ...baseClip(), duration: 5 }, planReframe(samples, SRC, sq));
  for (let t = 0; t <= 5; t += 0.25) {
    const f = samples[Math.round(t * 5)].dets[0];
    const w = windowAt(clip, t, sq);
    assert.ok(f.x >= w.x0 - 0.01 && f.x + f.w <= w.x1 + 0.01, `t=${t}`);
  }
});

test('MediaPipe results and masks become 0..1 boxes', () => {
  const res = { detections: [{ boundingBox: { originX: 64, originY: 36, width: 128, height: 72 } }, { boundingBox: { originX: 0, originY: 0, width: 1, height: 1 } }] };
  assert.deepEqual(normDetections(res, 640, 360, 'face'), [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2, kind: 'face' }]);
  assert.deepEqual(normDetections(null, 1, 1, 'face'), []);
  const w = 20;
  const h = 10;
  const conf = new Float32Array(w * h);
  for (let y = 2; y < 8; y++) for (let x = 12; x < 16; x++) conf[y * w + x] = 0.9;
  assert.deepEqual(maskBox(conf, w, h), { x: 0.6, y: 0.2, w: 0.2, h: 0.6, kind: 'mask' });
  assert.equal(maskBox(new Float32Array(w * h), w, h), null);
  // a person box aims at the head, so the plan still works without faces
  const people = movingFace(0.3, 0.6, 3, { kind: 'person', w: 0.15, h: 0.7 });
  assert.ok(planReframe(people, SRC, V916).found);
});

test('summary sentences', () => {
  assert.match(describeSummary({ total: 1, done: 1, none: 0, failed: 0, changed: 0 }), /Reframed/);
  assert.match(describeSummary({ total: 1, done: 0, none: 1, failed: 0, changed: 0 }), /No person found in this clip, so it was left as it was/);
  assert.match(describeSummary({ total: 4, done: 2, none: 1, failed: 0, changed: 1, cancelled: false }), /Reframed 2 of 4 clips.*1 clip had no person.*1 clip changed/);
  assert.match(describeSummary({ total: 3, done: 0, none: 0, failed: 0, changed: 0, cancelled: true }), /Nothing was changed/);
  assert.match(describeSummary({ total: 1, done: 0, none: 0, failed: 1, changed: 0, error: 'the person finder needs WebGL' }), /WebGL/);
});
