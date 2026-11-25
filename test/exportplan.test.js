import test from 'node:test';
import assert from 'node:assert/strict';
import { frameCount, frameTime, frameUs, isKeyFrame, gainPoints, audioPlan, videoCodecs, audioCodecs, speedRatio } from '../js/exportplan.js';
import { fadeGain } from '../js/core.js';

test('frames: count, times and microsecond stamps for a range', () => {
  assert.equal(frameCount(0, 12, 30), 360);
  assert.equal(frameCount(5, 10, 30), 150);
  assert.equal(frameCount(0, 0.01, 30), 1, 'never zero frames');
  assert.equal(frameCount(0, 10, 24), 240);
  assert.equal(frameTime(0, 5, 30), 5);
  assert.ok(Math.abs(frameTime(45, 5, 30) - 6.5) < 1e-9);
  assert.equal(frameUs(0, 30), 0);
  assert.equal(frameUs(1, 30), 33333);
  assert.equal(frameUs(30, 30), 1_000_000);
  assert.equal(frameUs(3, 60), 50000);
  // stamps only go up, so a muxer accepts them
  for (let i = 1; i < 500; i++) assert.ok(frameUs(i, 30) > frameUs(i - 1, 30));
  assert.ok(isKeyFrame(0, 30) && isKeyFrame(60, 30) && !isKeyFrame(30, 30) && isKeyFrame(120, 60));
});

test('gainPoints traced with straight lines equal fadeGain', () => {
  const cases = [
    [0, 12, 2, 3, 0.8, 0, 12],
    [0, 12, 2, 3, 1, 5, 10], // a range inside the fades
    [4, 8, 0.05, 0.05, 0.5, 0, 12],
    [0, 1, 0.8, 0.8, 1, 0, 1], // the fades meet in a peak
    [2, 6, 0, 0, 1, 3, 4],
  ];
  for (const [s, e, fi, fo, v, from, to] of cases) {
    const pts = gainPoints(s, e, fi, fo, v, from, to);
    const at = (x) => {
      for (let i = 1; i < pts.length; i++) {
        const [t0, g0] = pts[i - 1];
        const [t1, g1] = pts[i];
        if (x >= t0 && x <= t1) return t1 === t0 ? g1 : g0 + ((g1 - g0) * (x - t0)) / (t1 - t0);
      }
      return 0;
    };
    for (let t = Math.max(s, from); t <= Math.min(e, to); t += 0.01) assert.ok(Math.abs(at(t - from) - v * fadeGain(t, s, e, fi, fo)) < 1e-4, `${[s, e, fi, fo, v, from, to]} at ${t}`);
    assert.equal(pts[0][0], +(Math.max(s, from) - from).toFixed(6));
  }
  assert.deepEqual(gainPoints(0, 4, 0, 0, 1, 5, 9), [], 'outside the range: nothing');
  assert.deepEqual(gainPoints(0, 4, 0, 0, 0, 0, 9), [], 'silent: nothing');
});

const base = () => ({
  duration: 20,
  song: { mediaId: 's', offset: 30, volume: 0.9, fadeIn: 0, fadeOut: 2 },
  audioTracks: [{ id: 'a1', mediaId: 'fx', start: 3, duration: 2, in: 1, volume: 1 }],
  clips: [
    { id: 'c1', kind: 'video', mediaId: 'v1', in: 10, duration: 5, volume: 0.5 },
    { id: 'c2', kind: 'image', mediaId: 'i1', in: 0, duration: 5 },
    { id: 'c3', kind: 'video', mediaId: 'v2', in: 0, duration: 10, volume: 0 },
  ],
  layers: [],
  layerVis: {},
});

test('audioPlan mixes what the preview plays, in export time', () => {
  const { items, realtime } = audioPlan(base(), 0, 20);
  assert.equal(realtime, '');
  const song = items.find((i) => i.mediaId === 's');
  assert.deepEqual([song.at, song.offset, song.dur, song.rate], [0, 30, 20, 1]);
  assert.deepEqual(song.points.at(-1), [20, 0]);
  const fx = items.find((i) => i.mediaId === 'fx');
  assert.deepEqual([fx.at, fx.offset, fx.dur], [3, 1, 2]);
  const v1 = items.find((i) => i.mediaId === 'v1');
  assert.deepEqual([v1.at, v1.offset, v1.dur], [0, 10, 5]);
  assert.ok(!items.some((i) => i.mediaId === 'v2'), 'a muted clip adds nothing');
  assert.ok(!items.some((i) => i.mediaId === 'i1'));
});

test('audioPlan follows the export range, hidden and turned-off sounds', () => {
  const r = audioPlan(base(), 4, 12).items;
  const song = r.find((i) => i.mediaId === 's');
  assert.deepEqual([song.at, song.offset, song.dur], [0, 34, 8]);
  const fx = r.find((i) => i.mediaId === 'fx');
  assert.deepEqual([fx.at, fx.offset, fx.dur], [0, 2, 1], 'an audio block already playing at the range start starts part-way');
  const v1 = r.find((i) => i.mediaId === 'v1');
  assert.deepEqual([v1.at, v1.offset, v1.dur], [0, 14, 1]);
  const p = base();
  p.layerVis = { song: false };
  p.audioTracks[0].disabled = true;
  assert.deepEqual(audioPlan(p, 0, 20).items.map((i) => i.mediaId), ['v1']);
  // a negative song offset: the song starts later on the timeline
  const q = base();
  q.song.offset = -2;
  const s2 = audioPlan(q, 0, 20).items.find((i) => i.mediaId === 's');
  assert.deepEqual([s2.at, s2.offset, s2.dur], [2, 0, 18]);
});

test('audioPlan: song sections, overlay clips, visualizer stems and when real time is needed', () => {
  const p = base();
  p.song.offset = 10; // parts are in use when the first starts at the song offset
  p.song.parts = [
    { at: 0, from: 10, to: 18 },
    { at: 8, from: 40, to: 52 },
  ];
  const parts = audioPlan(p, 0, 20).items.filter((i) => i.mediaId === 's');
  assert.deepEqual(parts.map((i) => [i.at, i.offset, i.dur]), [
    [0, 10, 8],
    [8, 40, 12],
  ]);
  p.layers = [{ id: 'L', type: 'video', clips: [{ id: 'o', kind: 'video', mediaId: 'ov', in: 2, start: 6, duration: 3, volume: 1 }] }];
  const ov = audioPlan(p, 0, 20).items.find((i) => i.mediaId === 'ov');
  assert.deepEqual([ov.at, ov.offset, ov.dur], [6, 2, 3]);
  p.layers.push({ id: 'z', type: 'viz', source: 'stem', playAudio: true, volume: 1 });
  assert.match(audioPlan(p, 0, 20).realtime, /sections/);
  const q = base();
  q.layers = [{ id: 'z', type: 'viz', source: 'stem', playAudio: true, volume: 1, offset: 1 }];
  const st = audioPlan(q, 0, 20).items.find((i) => i.mediaId === 'stem');
  assert.deepEqual([st.at, st.offset, st.dur], [0, 29, 20]);
  q.clips[0].speed = 2;
  assert.match(audioPlan(q, 0, 20).realtime, /sped-up/);
  q.clips[0].volume = 0;
  assert.equal(audioPlan(q, 0, 20).realtime, '', 'a sped-up clip with no sound is fine');
});

test('codecs: H.264 + AAC for MP4 (level by frame rate), VP9/VP8 + Opus for WebM', () => {
  assert.deepEqual(videoCodecs('mp4', 30).map((c) => c.codec), ['avc1.640028', 'avc1.4d0028', 'avc1.42e028']);
  assert.ok(videoCodecs('mp4', 60).every((c) => c.codec.endsWith('2a') && c.mux === 'avc'));
  assert.deepEqual(videoCodecs('webm', 30).map((c) => c.mux), ['V_VP8', 'V_VP9', 'V_VP9']);
  assert.deepEqual(audioCodecs('mp4'), [{ codec: 'mp4a.40.2', mux: 'aac' }]);
  assert.deepEqual(audioCodecs('webm'), [{ codec: 'opus', mux: 'A_OPUS' }]);
  assert.equal(speedRatio(6, 12), 0.5);
  assert.equal(speedRatio(1, 0), 0);
});
