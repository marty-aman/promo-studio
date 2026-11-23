import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkAtGaps, heardWords, alignSequences, alignLyrics, normWord, wordSimilarity, autoSyncLyrics } from '../js/ai/lyricsync.js';
import { setPipelineForTesting, loadPipeline, modelInfo, ASR_TASK } from '../js/ai/runtime.js';
import { normalizeLyricTiming, normalizeWords, timingFromLyrics, lyricsFromTiming, MAX_WORDS_PER_LINE, TIMING_SOURCES } from '../js/manager/lyrictiming.js';
import { savedWordTimes, savedWordFractions, shiftLyrics } from '../js/core.js';
import { wordTimes } from '../js/lyricviz.js';
import { videoCues, setCaptions, shiftCaptions } from '../js/subtitles.js';

const near = (a, b, tol = 0.02) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

// a 16 kHz signal: loud everywhere except the listed quiet spans (seconds)
function signal(total, quiet = []) {
  const x = new Float32Array(Math.round(total * 16000));
  for (let i = 0; i < x.length; i++) {
    const s = i / 16000;
    x[i] = quiet.some(([a, b]) => s >= a && s < b) ? 0.0001 : 0.3 * Math.sin(i * 0.05);
  }
  return x;
}

test('chunking cuts at the quietest gap, never over the limit', () => {
  const ch = chunkAtGaps(signal(60, [[20.0, 20.4], [40.5, 40.8]]));
  assert.ok(ch.every((c) => c.end - c.start <= 28.001));
  near(ch[0].end, 20.2, 0.15); // the gap, not 28 s
  near(ch[ch.length - 1].end, 60, 0.01);
  for (let i = 1; i < ch.length; i++) near(ch[i].start, ch[i - 1].end, 0.001);
});

test('chunking: a short song is one piece, silence is flagged, empty input gives nothing', () => {
  assert.equal(chunkAtGaps(signal(10)).length, 1);
  assert.equal(chunkAtGaps(new Float32Array(16000 * 5))[0].silent, true);
  assert.deepEqual(chunkAtGaps(new Float32Array(0)), []);
});

test('heardWords: offsets, trims, drops bad entries, fills a missing end', () => {
  const w = heardWords({ chunks: [{ text: ' Burn', timestamp: [0.5, 0.9] }, { text: ' it', timestamp: [1, null] }, { text: ' ', timestamp: [2, 3] }, { text: 'x', timestamp: [null, 1] }] }, 10);
  assert.deepEqual(w, [{ w: 'Burn', t: 10.5, end: 10.9 }, { w: 'it', t: 11, end: 11.3 }]);
  assert.deepEqual(heardWords(null), []);
});

test('word similarity: exact, near miss, different', () => {
  assert.equal(wordSimilarity('fire', 'fire'), 1);
  assert.equal(wordSimilarity('burning', 'burnin'), 0.6);
  assert.equal(wordSimilarity('fire', 'dark'), 0);
  assert.equal(normWord('“Don’t!”'), 'dont');
});

test('alignSequences: skips a word the model missed and an extra one it made up', () => {
  const m = alignSequences(['a', 'b', 'c', 'd'], ['a', 'zzz', 'c', 'd']);
  assert.deepEqual(m.map((x) => x && x.j), [0, null, 2, 3]);
  const m2 = alignSequences(['a', 'c'], ['a', 'x', 'c']);
  assert.deepEqual(m2.map((x) => x && x.j), [0, 2]);
});

const LYRICS = ['Burn it down', 'Burn it down', 'I am the fire tonight'];
const HEARD = [
  ['burn', 1.0], ['it', 1.4], ['down', 1.8],
  ['burn', 4.0], ['it', 4.4], ['down', 4.8],
  ['I', 7.0], ['am', 7.3], ['the', 7.6], ['fire', 8.0], ['tonight', 8.5],
].map(([w, t]) => ({ w, t, end: t + 0.3 }));

test('alignLyrics: a repeated chorus line maps in order and keeps full confidence', () => {
  const r = alignLyrics(LYRICS, HEARD, { duration: 30 });
  assert.equal(r.lines.length, 3);
  near(r.lines[0].start, 1.0);
  near(r.lines[1].start, 4.0);
  near(r.lines[2].start, 7.0);
  assert.deepEqual(r.lines.map((l) => l.conf), [1, 1, 1]);
  assert.ok(r.lines.every((l) => !l.flagged));
  assert.equal(r.lines[2].words.length, 5);
});

test('alignLyrics: words the model missed are interpolated between heard neighbours and the line is flagged', () => {
  const heard = HEARD.filter((x) => !['am', 'the', 'fire'].includes(x.w));
  const r = alignLyrics(LYRICS, heard, { duration: 30 });
  const l = r.lines[2];
  assert.equal(l.conf, 0.4); // I and tonight heard, three of five
  assert.equal(l.flagged, true);
  const t = l.words.map((w) => w.t);
  assert.ok(t.every((v, i) => i === 0 || v >= t[i - 1]));
  assert.ok(t[1] > t[0] && t[3] < t[4], JSON.stringify(t));
  near(t[0], 7.0);
  near(t[4], 8.5);
});

test('alignLyrics: lyrics longer than the audio stay inside it; an unheard tail is flagged', () => {
  const r = alignLyrics([...LYRICS, 'one more line after it ends'], HEARD, { duration: 9 });
  const last = r.lines[3];
  assert.equal(last.conf, 0);
  assert.equal(last.flagged, true);
  assert.ok(last.words.every((w) => w.t <= 9 && w.end <= 9 + 1e-6));
});

test('alignLyrics: nothing heard (instrumental or no lyrics) gives no lines, so old times are kept', () => {
  assert.deepEqual(alignLyrics(LYRICS, [], {}).lines, []);
  assert.deepEqual(alignLyrics([], HEARD, {}).lines, []);
  assert.deepEqual(alignLyrics(LYRICS, [{ w: 'banana', t: 1, end: 2 }], {}).lines, []);
});

test('alignLyrics: lines never overlap and words stay in order', () => {
  const r = alignLyrics(LYRICS, HEARD.map((x) => ({ ...x, end: x.t + 5 })), { duration: 30 });
  r.lines.forEach((l, i) => {
    if (r.lines[i + 1]) assert.ok(l.end <= r.lines[i + 1].start);
    l.words.forEach((w) => assert.ok(w.end <= l.end + 0.011 && w.end > w.t));
  });
});

test('autoSyncLyrics: cuts the audio, passes the language, offsets each chunk, can be cancelled', async () => {
  const calls = [];
  const fake = async (audio, opts) => {
    calls.push({ n: audio.length, opts });
    // the model "hears" the three lines, one per chunk call, at times inside the chunk
    const first = calls.length === 1;
    return { chunks: first ? [{ text: ' Burn', timestamp: [1, 1.3] }, { text: ' it', timestamp: [1.4, 1.7] }, { text: ' down', timestamp: [1.8, 2.1] }] : [{ text: ' Burn', timestamp: [1, 1.3] }] };
  };
  const samples = signal(50, [[20, 20.5]]);
  const prog = [];
  const r = await autoSyncLyrics({ samples, lyricLines: ['Burn it down', 'Burn'], pipe: fake, language: 'en', onProgress: (f) => prog.push(f) });
  assert.equal(calls.length, 3); // 0-20.2 s, 20.2-48.2 s, the rest
  assert.ok(calls.every((c) => c.opts.language === 'en' && c.opts.return_timestamps === 'word' && c.n <= 28 * 16000));
  near(r.lines[0].start, 1);
  assert.ok(r.lines[1].start > 20, 'second chunk offset');
  assert.ok(prog.length >= 3 && prog[prog.length - 1] === 1);
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(autoSyncLyrics({ samples, lyricLines: ['x'], pipe: fake, signal: ac.signal }), { name: 'AbortError' });
});

test('runtime: a fake pipeline replaces the model; unconsented real loads are refused', async () => {
  setPipelineForTesting(ASR_TASK, async () => ({ chunks: [] }));
  assert.ok((await modelInfo()).fake);
  assert.equal(typeof (await loadPipeline(ASR_TASK)), 'function');
  setPipelineForTesting(ASR_TASK, null);
  await assert.rejects(loadPipeline(ASR_TASK, 'whisper-base'), { code: 'consent' });
});

// ---- the saved timing

const WORDS = [{ w: 'Burn', t: 1, end: 1.3 }, { w: 'it', t: 1.4, end: 1.7 }, { w: 'down', t: 1.8, end: 2.1 }];

test('lyrictiming: words and conf survive normalize, save and restore; auto is a source', () => {
  assert.ok(TIMING_SOURCES.includes('auto'));
  const lyrics = [{ text: 'Burn it down', start: 1, end: 2.2, words: WORDS, conf: 0.8 }, { text: 'plain line', start: 5, end: 6 }];
  const t = timingFromLyrics(lyrics, { source: 'auto', now: new Date('2026-11-23T00:00:00Z') });
  assert.equal(t.source, 'auto');
  assert.deepEqual(t.lines[0].words, WORDS);
  assert.equal(t.lines[0].conf, 0.8);
  assert.equal(t.lines[1].words, undefined);
  const back = normalizeLyricTiming(JSON.parse(JSON.stringify(t))); // a backup file
  assert.deepEqual(back, t);
  const edit = lyricsFromTiming(back, () => 'x');
  assert.deepEqual(edit[0].words, WORDS);
  assert.equal(edit[0].conf, 0.8);
});

test('lyrictiming: word times are validated, clamped and capped', () => {
  assert.equal(normalizeWords('no'), undefined);
  assert.equal(normalizeWords([{ w: '', t: 1 }, { t: 2 }, { w: 'a', t: NaN }]), undefined);
  const w = normalizeWords([{ w: 'b', t: 5, end: 4 }, { w: 'a', t: -3, end: 0.5 }, { w: 'c', t: 99999, end: 100000 }]);
  assert.deepEqual(w.map((k) => k.w), ['a', 'b', 'c']);
  assert.equal(w[0].t, 0);
  assert.equal(w[1].end, undefined); // end before t is dropped
  assert.equal(w[2].t, 35999);
  const many = Array.from({ length: 100 }, (_, i) => ({ w: 'w' + i, t: i }));
  assert.equal(normalizeWords(many).length, MAX_WORDS_PER_LINE);
  const t = normalizeLyricTiming({ lines: [{ t: 1, text: 'hi', words: 'junk', conf: 7 }] });
  assert.equal(t.lines[0].words, undefined);
  assert.equal(t.lines[0].conf, 1);
});

test('lyrictiming: the offset moves the words with the line', () => {
  const t = normalizeLyricTiming({ lines: [{ t: 1, text: 'Burn it down', words: WORDS }], offset: 2 });
  const l = lyricsFromTiming(t, () => 'x')[0];
  near(l.start, 3);
  near(l.words[0].t, 3);
  near(l.words[2].end, 4.1);
});

// ---- using the word times

const LINE = { id: 'a', text: 'Burn it down', start: 1, end: 3, words: WORDS };

test('saved word times are used when they fit the line, else the proportional split', () => {
  const w = wordTimes(LINE);
  near(w[1].start, 1.4);
  near(w[2].end, 2.1);
  assert.equal(savedWordTimes({ ...LINE, text: 'Burn it up' }), null); // words edited
  assert.equal(savedWordTimes({ ...LINE, text: 'Burn it' }), null);
  assert.equal(savedWordTimes({ ...LINE, start: 10, end: 12 }), null); // line moved away
  const prop = wordTimes({ ...LINE, text: 'Burn it up' });
  near(prop[0].start, 1);
  near(prop[2].end, 3);
  const f = savedWordFractions(LINE);
  near(f[1].start, 0.2);
  assert.equal(savedWordFractions({ text: 'x', start: 0, end: 1 }), null);
});

test('shifting lyrics moves their words; captions carry and shift word times', () => {
  const [s] = shiftLyrics([LINE], 0.5);
  near(s.words[0].t, 1.5);
  near(s.start, 1.5);
  assert.ok(savedWordTimes(s));
  const cues = videoCues({ duration: 30, lyrics: [LINE], song: null, texts: [], endCard: { enabled: false } }, { which: 'lyrics' });
  assert.equal(cues[0].words.length, 3);
  const d = { texts: [] };
  setCaptions(d, cues, { style: 'words' });
  assert.equal(d.texts[0].words.length, 3);
  shiftCaptions(d, 1);
  near(d.texts[0].words[0].t, 2);
  assert.ok(savedWordTimes({ ...d.texts[0] }));
});
