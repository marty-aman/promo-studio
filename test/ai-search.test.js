import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleTimes, fnv1a, fingerprint, cacheKey, isFresh, normalize, frameScores, smooth, rankMoments, relativeMatch, momentClip, rangeScorer, extraScoreFor, sharpness, toGray, bestFrameIndex, promptFor, evictIds, spread, MIN_SPAN, CACHE_V, MAX_SAMPLES } from '../js/ai/clipsearch.js';
import { MODELS, modelInfo, loadPipeline, setPipelineForTesting } from '../js/ai/runtime.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

/** An entry with unit vectors made from [x, y, z] rows. */
function entry(id, times, rows, extra = {}) {
  const dim = rows[0].length;
  const vecs = new Float32Array(rows.length * dim);
  rows.forEach((r, i) => vecs.set(normalize(r), i * dim));
  return { id, key: `${id}|k`, times, dim, vecs, thumbs: times.map((t) => `thumb@${t}`), ...extra };
}
const RED = normalize([1, 0, 0]);
const GREEN = normalize([0, 1, 0]);

test('sample times: every second, capped, one for a very short clip, none for nothing', () => {
  assert.deepEqual(sampleTimes(4), [0.5, 1.5, 2.5, 3.5]);
  const long = sampleTimes(600);
  assert.equal(long.length, MAX_SAMPLES);
  near(long[1] - long[0], 5, 1e-3);
  assert.ok(long[long.length - 1] < 600);
  assert.deepEqual(sampleTimes(0.3), [0.15]);
  assert.deepEqual(sampleTimes(0), []);
  assert.deepEqual(sampleTimes(NaN), []);
});

test('cache keys change with the file, the model and the version, not with the id alone', () => {
  const a = new Uint8Array([1, 2, 3, 4]);
  const b = new Uint8Array([1, 2, 3, 5]);
  assert.equal(fnv1a(new Uint8Array(0)), 0x811c9dc5);
  assert.notEqual(fnv1a(a), fnv1a(b));
  const fpA = fingerprint(1000, a, b);
  assert.equal(fpA, fingerprint(1000, a, b), 'same file, same fingerprint');
  assert.notEqual(fpA, fingerprint(1001, a, b), 'size counts');
  assert.notEqual(fpA, fingerprint(1000, b, b), 'head counts');
  assert.notEqual(fpA, fingerprint(1000, a, a), 'tail counts');
  assert.match(fpA, /^1000-[0-9a-f]{8}$/);
  const k = cacheKey('media-1', fpA, 'tinyclip');
  assert.equal(k, `media-1|${fpA}|tinyclip|v${CACHE_V}`);
  assert.notEqual(k, cacheKey('media-1', fpA, 'clip-b32'));
  assert.notEqual(k, cacheKey('media-1', fingerprint(1000, b, b), 'tinyclip'));
  const e = entry('media-1', [0.5, 1.5], [[1, 0, 0], [0, 1, 0]], { key: k });
  assert.ok(isFresh(e, k));
  assert.ok(!isFresh(e, cacheKey('media-1', fingerprint(1000, b, b), 'tinyclip')), 'another file under the same id is looked at again');
  assert.ok(!isFresh({ ...e, vecs: new Float32Array(3) }, k), 'truncated vectors are not trusted');
  assert.ok(!isFresh(null, k));
});

test('normalize, frame scores and smoothing', () => {
  const v = normalize([3, 4]);
  near(v[0], 0.6);
  near(v[1], 0.8);
  assert.deepEqual([...normalize([0, 0])], [0, 0]);
  const e = entry('a', [0.5, 1.5, 2.5], [[1, 0, 0], [0, 1, 0], [1, 1, 0]]);
  const s = frameScores(e, RED);
  near(s[0], 1);
  near(s[1], 0);
  near(s[2], Math.SQRT1_2, 1e-6);
  const sm = smooth(new Float32Array([0, 1, 0]));
  near(sm[1], 0.6);
  near(sm[0], 0.2);
});

test('ranking: best first across videos, one result per moment within a video, top cap', () => {
  // video a: red for 0-3 s, then green; video b: all green, strongest around 6 s
  const a = entry('a', [0.5, 1.5, 2.5, 3.5, 4.5, 5.5], [[1, 0, 0], [1, 0, 0], [1, 0.2, 0], [0.4, 1, 0], [0.4, 1, 0], [0.4, 1, 0]]);
  const b = entry('b', [0.5, 3.5, 6.5, 9.5], [[0.3, 1, 0], [0.2, 1, 0], [0, 1, 0], [0.3, 1, 0]]);
  const red = rankMoments([a, b], RED);
  assert.equal(red[0].mediaId, 'a');
  assert.ok(red.every((r) => r.mediaId === 'a'), 'an all-green video is no red match at all');
  assert.ok(red[0].t <= 1.5, `red moment at ${red[0].t}`);
  const inA = red.filter((r) => r.mediaId === 'a');
  for (let i = 0; i < inA.length; i++) for (let j = i + 1; j < inA.length; j++) assert.ok(Math.abs(inA[i].t - inA[j].t) >= 4, 'moments 4 s apart');
  const green = rankMoments([a, b], GREEN, { top: 3 });
  assert.equal(green.length, 3);
  assert.equal(green[0].mediaId, 'b');
  assert.equal(green[0].t, 6.5);
  for (let i = 1; i < green.length; i++) assert.ok(green[i - 1].score >= green[i].score);
  assert.ok(!green.some((r) => r.mediaId === 'a' && r.t < 3), 'red frames are left out of a green search');
  assert.deepEqual(rankMoments([], RED), []);
  assert.deepEqual(rankMoments([{ id: 'x', times: [] }], RED), []);
  // results carry the frame index, so the thumbnail is the frame that matched
  assert.equal(a.thumbs[red[0].idx], `thumb@${red[0].t}`);
});

test('relative match: best is 100, floor is 0, clamped', () => {
  assert.equal(relativeMatch(0.3, 0.3, 0.2), 100);
  assert.equal(relativeMatch(0.25, 0.3, 0.2), 50);
  assert.equal(relativeMatch(0.1, 0.3, 0.2), 0);
  assert.equal(relativeMatch(0.3, 0.3, 0.3), 100);
});

test('time mapping: a moment becomes a clip starting just before it that fits in the file', () => {
  assert.deepEqual(momentClip(10, 30, 4), { in: 9.5, duration: 4 });
  assert.deepEqual(momentClip(0.2, 30, 4), { in: 0, duration: 4 }, 'never before 0');
  assert.deepEqual(momentClip(29.5, 30, 4), { in: 26, duration: 4 }, 'never past the end');
  assert.deepEqual(momentClip(1, 2.5, 4), { in: 0, duration: 2.5 }, 'a short file gives what it has');
  assert.deepEqual(momentClip(5, NaN, 4), { in: 4.5, duration: 4 }, 'unknown length: trust the moment');
  const c = momentClip(12.34, 60, 3, 1);
  near(c.in, 11.34, 1e-9);
  assert.ok(c.in <= 12.34 && 12.34 < c.in + c.duration, 'the moment is inside the clip');
});

test('extraScore hook: 0..1 per stretch, best stretch scores 1, unknown video gives null', () => {
  const a = entry('a', [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5], [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0], [1, 0, 0], [1, 0, 0], [1, 0, 0], [1, 0, 0]]);
  const f = rangeScorer(a, RED);
  assert.ok(f(4, 8) > 0.95);
  assert.ok(f(0, 3) < 0.05);
  assert.ok(f(2, 6) > f(0, 3));
  const tiny = f(5.6, 5.7); // shorter than the sample step: nearest frame
  assert.ok(tiny > 0.9);
  for (const [x, y] of [[0, 1], [3, 5], [7, 8]]) {
    const v = f(x, y);
    assert.ok(v >= 0 && v <= 1, `${v}`);
  }
  assert.equal(rangeScorer({ id: 'n', times: [] }, RED), null);
  const flat = rangeScorer(entry('f', [0.5, 1.5], [[1, 0, 0], [1, 0, 0]]), RED);
  assert.equal(flat(0, 2), 0.5, 'no contrast: neutral');
  const hook = extraScoreFor(new Map([['a', a]]), RED);
  assert.ok(hook({ id: 'a' }, 4, 8) > 0.95);
  assert.equal(hook({ id: 'other' }, 0, 4), null);
  assert.equal(hook(null, 0, 4), null);
  assert.equal(extraScoreFor(new Map([['a', a]]), null)({ id: 'a' }, 0, 4), null);
});

test('spread: tiny differences inside a video stay near the middle', () => {
  assert.equal(spread(0.3, 0.2, 0.3), 1);
  assert.equal(spread(0.2, 0.2, 0.3), 0);
  assert.equal(spread(0.25, 0.2, 0.3), 0.5);
  near(spread(0.301, 0.3, 0.301), 0.5 + 0.0005 / MIN_SPAN, 1e-9);
  assert.equal(spread(1, 2, 1), 0.5);
});

test('sharpness and grey: edges are sharper than a blur, flat is zero', () => {
  const w = 16;
  const hh = 16;
  const rgba = (fn) => {
    const d = new Uint8ClampedArray(w * hh * 4);
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) d.set([fn(x, y), fn(x, y), fn(x, y), 255], (y * w + x) * 4);
    return d;
  };
  const checker = toGray(rgba((x, y) => ((x + y) % 2 ? 255 : 0)), w, hh);
  const ramp = toGray(rgba((x) => x * 16), w, hh);
  const flat = toGray(rgba(() => 90), w, hh);
  near(flat.mean, 90, 1e-3);
  assert.equal(sharpness(flat.gray, w, hh), 0);
  assert.ok(sharpness(checker.gray, w, hh) > sharpness(ramp.gray, w, hh) * 100);
});

test('best frame: sharp and well lit wins; with words, the matching sharp frame wins', () => {
  const e = entry('a', [0.5, 1.5, 2.5, 3.5], [[1, 0, 0], [1, 0, 0], [0, 1, 0], [0, 1, 0]], { sharp: [10, 200, 180, 40], luma: [120, 10, 120, 120] });
  assert.equal(bestFrameIndex(e), 2, 'frame 1 is sharpest but almost black');
  assert.equal(bestFrameIndex(e, GREEN), 2);
  assert.equal(bestFrameIndex(e, RED), 0, 'red: the lit red frame, not the sharper black one or a sharp green one');
  assert.equal(bestFrameIndex({ times: [] }), -1);
  assert.equal(bestFrameIndex(entry('b', [1], [[1, 0, 0]])), 0, 'no sharpness data still gives a frame');
});

test('prompt, eviction', () => {
  assert.equal(promptFor('  crowd   jumping '), 'a photo of crowd jumping');
  assert.equal(promptFor('A photo of a drummer'), 'A photo of a drummer');
  assert.equal(promptFor(''), '');
  assert.ok(promptFor('x'.repeat(500)).length <= 211);
  assert.deepEqual(evictIds([{ id: 'a', at: 1 }, { id: 'b', at: 3 }, { id: 'c', at: 2 }], 2), ['a']);
  assert.deepEqual(evictIds([{ id: 'a', at: 1 }], 5), []);
});

test('runtime: the search model is MIT-sized and needs consent before a download', async () => {
  const m = MODELS.tinyclip;
  assert.ok(m && m.id.startsWith('onnx-community/TinyCLIP'));
  assert.equal(m.task, 'zero-shot-image-classification');
  assert.ok(m.approxMB > 0 && m.approxMB < 30);
  const info = await modelInfo('tinyclip');
  assert.equal(info.sizeMB, m.approxMB);
  assert.equal(info.cached, false);
  await assert.rejects(loadPipeline(m.task, 'tinyclip'), (e) => e.code === 'consent' && /23 MB/.test(e.message));
  const fake = async () => [];
  setPipelineForTesting(m.task, fake);
  assert.equal(await loadPipeline(m.task, 'tinyclip'), fake, 'a test stub needs no consent');
  assert.equal((await modelInfo('tinyclip')).cached, true);
  setPipelineForTesting(m.task, null);
});
