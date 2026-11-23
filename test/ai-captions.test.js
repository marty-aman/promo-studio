import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCues, toTimeline, clipTarget, windowSamples, captionsIn, addSpeechCaptions, captionWords } from '../js/ai/captionsync.js';
import { setPipelineForTesting, loadPipeline, ASR_TASK } from '../js/ai/runtime.js';
import { savedWordTimes, savedWordFractions } from '../js/core.js';
import { videoCues } from '../js/subtitles.js';

const W = (w, t, end = t + 0.3) => ({ w, t, end });
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('cues: a pause, a sentence end and the length limits start a new line', () => {
  const words = [W('So', 0), W('this', 0.4), W('is', 0.8), W('the', 1.2), W('show.', 1.6), W('We', 2.0), W('start', 2.4), W('now', 2.8), W('after', 5.0), W('the', 5.4), W('break', 5.8)];
  const c = buildCues(words);
  assert.deepEqual(c.map((x) => x.text), ['So this is the show.', 'We start now', 'after the break']); // sentence end, then a 2.2 s pause
  assert.equal(c[0].words.length, 5);
  near(c[0].start, 0);
  near(c[1].end, 3.1 + 0.2 - 0.2 + 0.0, 0.25);
  assert.ok(c[1].end <= c[2].start);
  const long = buildCues(Array.from({ length: 20 }, (_, i) => W(`word${i}`, i * 0.3)));
  assert.ok(long.every((x) => x.text.length <= 34 && x.words.length <= 7), JSON.stringify(long.map((x) => x.text)));
  assert.equal(long.flatMap((x) => x.words).length, 20); // nothing lost
  const slow = buildCues([W('a', 0), W('b', 1.5), W('c', 3.0), W('d', 4.5)]); // no gap over 0.7 s but over 4 s in all
  assert.ok(slow.length >= 2 && slow.every((x) => x.end - x.start <= 4.5));
});

test('cues: junk words are skipped, a stretched word is capped, empty input gives no cues', () => {
  assert.deepEqual(buildCues([]), []);
  assert.deepEqual(buildCues(null), []);
  const c = buildCues([W('  ', 0), { w: 'x', t: NaN }, W('Hello', 1, 9), W('there', 9.2)]);
  assert.equal(c[0].text, 'Hello');
  near(c[0].words[0].end, 2.5); // 1.5 s at most
});

test('timeline: offset by the clip start, divided by the speed, cut at the clip end', () => {
  const cues = buildCues([W('one', 0.5), W('two', 1.0), W('three', 1.5), W('four', 6.0), W('five', 6.4)]);
  // a clip at 10 s on the timeline, played at 2x, 8 s of file playing -> 4 s on the timeline
  const t = toTimeline(cues, { start: 10, speed: 2, length: 8 });
  near(t[0].start, 10.25);
  near(t[0].words[1].t, 10.5);
  assert.equal(t.length, 2);
  near(t[1].start, 13);
  assert.ok(t.every((c) => c.end <= 14.0001));
  const slow = toTimeline(cues, { start: 0, speed: 0.5, length: 8 }); // slow-mo: twice as long, 16 s on the timeline
  near(slow[0].start, 1);
  near(slow[1].words[0].t, 12);
  // a cue that starts after the clip ends is dropped, one that runs over is cut
  const cut = toTimeline(cues, { start: 0, speed: 1, length: 6.2 });
  assert.equal(cut.length, 2);
  assert.equal(cut[1].words.length, 1);
  assert.ok(cut[1].end <= 6.2001);
  assert.deepEqual(cues[0].words[0], W('one', 0.5)); // the input is untouched
});

test('target: the in-point, the speed and the place on the timeline', () => {
  const p = {
    clips: [{ id: 'a', kind: 'video', mediaId: 'm1', in: 0, duration: 5, speed: 1 }, { id: 'b', kind: 'video', mediaId: 'm2', in: 3, duration: 4, speed: 2 }, { id: 'i', kind: 'image', mediaId: 'm3', in: 0, duration: 2 }],
    layers: [{ type: 'video', clips: [{ id: 'o', kind: 'video', mediaId: 'm4', in: 1, duration: 3, speed: 0.5, start: 7 }] }],
    audioTracks: [{ id: 'au', mediaId: 'm5', in: 2, duration: 6, start: 4 }],
  };
  assert.deepEqual(clipTarget(p, { type: 'clip', id: 'b' }), { mediaId: 'm2', from: 3, length: 8, speed: 2, start: 5, kind: 'video' });
  assert.deepEqual(clipTarget(p, { type: 'clip', id: 'o' }), { mediaId: 'm4', from: 1, length: 1.5, speed: 0.5, start: 7, kind: 'video' });
  assert.deepEqual(clipTarget(p, { type: 'audio', id: 'au' }), { mediaId: 'm5', from: 2, length: 6, speed: 1, start: 4, kind: 'audio' });
  assert.equal(clipTarget(p, { type: 'clip', id: 'i' }), null); // a picture has no sound
  assert.equal(clipTarget(p, null), null);
  const w = windowSamples(new Float32Array(16000 * 10), { from: 3, length: 8 }); // runs past the file: cut at its end
  assert.equal(w.length, 16000 * 7);
});

test('run: the model hears only the clip window, chunks it, passes the language, cancels, and heard times become word times', async () => {
  const calls = [];
  setPipelineForTesting(ASR_TASK, async (audio, opts) => {
    calls.push({ n: audio.length, opts });
    return { chunks: [{ text: ' Hello', timestamp: [1, 1.4] }, { text: ' world.', timestamp: [1.5, 2] }] };
  });
  const pipe = await loadPipeline(ASR_TASK, 'whisper-base', { consented: true });
  const loud = new Float32Array(16000 * 40).map((_, i) => 0.3 * Math.sin(i * 0.05));
  const prog = [];
  const r = await captionWords({ samples: loud, pipe, language: 'es', onProgress: (f) => prog.push(f) });
  assert.ok(calls.length >= 2 && calls.every((c) => c.n <= 16000 * 28 + 1 && c.opts.language === 'es' && c.opts.return_timestamps === 'word'));
  assert.equal(r.words.length, calls.length * 2);
  assert.ok(r.words[2].t > r.words[1].t, 'the second chunk is offset by its start');
  assert.ok(prog[0] === 0 && prog[prog.length - 1] === 1);
  calls.length = 0;
  await captionWords({ samples: loud, pipe, language: 'auto' });
  assert.ok(calls.every((c) => !('language' in c.opts)), 'auto sends no language');
  const silent = await captionWords({ samples: new Float32Array(16000 * 5), pipe });
  assert.equal(silent.words.length, 0); // silence is never sent to the model
  const ctl = new AbortController();
  ctl.abort();
  await assert.rejects(() => captionWords({ samples: loud, pipe, signal: ctl.signal }), { name: 'AbortError' });
  setPipelineForTesting(ASR_TASK, null);
});

test('edit: captions land as caption texts with word times; replace only touches the ones under the clip; lyrics are never touched', () => {
  const d = {
    lyrics: [{ id: 'l1', text: 'typed lyric', start: 1, end: 3 }],
    texts: [
      { id: 'c1', caption: true, text: 'under', start: 11, end: 12 },
      { id: 'c2', caption: true, text: 'elsewhere', start: 30, end: 31 },
      { id: 't1', text: 'a title', start: 0, end: 2 },
    ],
  };
  const lyrics = JSON.stringify(d.lyrics);
  const cues = toTimeline(buildCues([W('Hello', 0.2), W('there', 0.6), W('friend', 1.0)]), { start: 10, speed: 1, length: 5 });
  assert.deepEqual(captionsIn(d, 10, 15).map((t) => t.id), ['c1']);
  const n = addSpeechCaptions(d, cues, { mode: 'replace', style: 'words', y: 70, from: 10, to: 15 });
  assert.equal(n, 1);
  assert.deepEqual(d.texts.map((t) => t.id).slice(0, 2), ['c2', 't1']);
  const cap = d.texts[d.texts.length - 1];
  assert.equal(cap.caption, true);
  assert.equal(cap.captionStyle, 'words');
  assert.equal(cap.animation, 'words');
  assert.equal(cap.y, 70);
  assert.equal(cap.text, 'Hello there friend');
  assert.equal(JSON.stringify(d.lyrics), lyrics);
  // add keeps everything
  const before = d.texts.length;
  addSpeechCaptions(d, cues, { mode: 'add' });
  assert.equal(d.texts.length, before + 1);
  // the word times drive Word by word exactly like lyric words: they fit the caption and the renderer's fractions follow them
  const f = savedWordFractions(cap);
  assert.ok(f && f.length === 3);
  near(f[1].start, (10.6 - cap.start) / (cap.end - cap.start), 0.02);
  assert.equal(savedWordTimes(cap).length, 3);
  // and the caption file includes them
  const vc = videoCues({ duration: 30, texts: d.texts, lyrics: [], endCard: { enabled: false } }, { which: 'captions' });
  assert.ok(vc.some((c) => c.text === 'Hello there friend'));
});

test('privacy: the captions code has no network calls of its own', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const f of ['js/ai/captionsync.js', 'js/ai/panel-speechcaptions.js']) {
    const src = await readFile(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.ok(!/\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|https?:\/\//.test(src.replace(/\/\/.*$/gm, '').replace(/huggingface\.co/g, '')), f);
  }
});
