import test from 'node:test';
import assert from 'node:assert/strict';
import { xcorr, fft, syncStem, syncChart, chartHits, onsetCurve } from '../js/autosync.js';
import { parseLRC, lrcToLines, titleFromFile, findSong, pickResult, fetchLyrics, lrclibGetURL } from '../js/lyricsfetch.js';

// a 90 s "song": hits on a 120 BPM grid with random accents, as an energy envelope at 100 per second
function makeSong(seed = 7, secs = 90) {
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const n = secs * 100;
  const env = new Float64Array(n);
  const hits = [];
  for (let t = 1; t < secs - 2; t += 0.25) if (rnd() < 0.7) hits.push(t);
  for (const t of hits) {
    const k = Math.round(t * 100);
    for (let d = 0; d < 12; d++) if (k + d < n) env[k + d] += (0.6 + rnd() * 0.4) * Math.exp(-d / 4);
  }
  for (let i = 0; i < n; i++) env[i] += 0.02 * rnd();
  return { env, hits };
}

test('FFT and cross-correlation', () => {
  const re = [1, 0, 0, 0];
  const im = [0, 0, 0, 0];
  fft(re, im);
  assert.deepEqual(re, [1, 1, 1, 1]);
  const { values, lag0 } = xcorr([0, 0, 1, 0, 0], [1, 0, 0]);
  const peak = values.indexOf(Math.max(...values));
  assert.equal(peak - lag0, 2); // b's start lines up 2 samples into a
  assert.equal(onsetCurve(new Float64Array(0)).length, 0);
});

test('a stem found where it starts in the song', () => {
  const { env } = makeSong();
  for (const off of [0, 7.42, 31.07]) {
    const stem = new Float64Array(env.length);
    for (let i = 0; i < env.length; i++) stem[i] = env[i + Math.round(off * 100)] * 0.7 || 0;
    const r = syncStem({ envelope: env, envRate: 100 }, { envelope: stem, envRate: 100 });
    assert.ok(Math.abs(r.offset - off) <= 0.01, `${off} → ${r.offset}`);
    assert.notEqual(r.sure, 'unsure');
  }
});

test('a chart found where it starts, at the right tempo', () => {
  const { env, hits } = makeSong(11);
  const song = { envelope: env, envRate: 100 };
  for (const [scale, start] of [[1, 3.05], [0.98, 12.3], [1.02, 20], [1.005, 8]]) {
    const chart = hits.filter((t) => t >= start).map((t) => ({ time: (t - start) * scale }));
    const r = syncChart(song, chart, {});
    assert.ok(Math.abs(r.offset - start) <= 0.02, `${scale}/${start} → ${r.offset}`);
    assert.ok(Math.abs(r.tempoScale - scale) < 0.003, `${scale} → ${r.tempoScale}`);
  }
  // with the file's and the song's BPM it can reach further than ±3%
  const far = hits.filter((t) => t >= 5).map((t) => ({ time: (t - 5) * 0.9 }));
  const r = syncChart(song, far, { tempo: 120 / 0.9, songBpm: 120 });
  assert.ok(Math.abs(r.offset - 5) <= 0.02 && Math.abs(r.tempoScale - 0.9) < 0.003, JSON.stringify(r));
  // too few notes
  assert.equal(syncChart(song, [{ time: 0 }]), null);
});

test('what a chart is synced from', () => {
  assert.equal(chartHits({ hits: [{ time: 0, lane: 'kick' }, { time: 1, lane: 'ride', vel: 0.5 }] })[1].weight, 0.3);
  assert.deepEqual(chartHits({ events: [{ time: 0, notes: [1] }, { time: 1, notes: [] }] }), [{ time: 0, weight: 1 }]);
  assert.equal(chartHits({ notes: [{ time: 0, vel: 100 }, { time: 0.01, vel: 100 }, { time: 0.5, vel: 50 }] }).length, 2); // a chord counts once
  assert.deepEqual(chartHits(null), []);
});

test('LRC lyrics', () => {
  const e = parseLRC('[ar:Bad Omens]\n[00:01.65] I’m not afraid\n[00:04.01]Of the <00:04.20>war\n[00:08.37][01:10.00] I’m not okay\n[00:09.00]\n');
  assert.deepEqual(e.map((x) => [x.time, x.text]), [[1.65, 'I’m not afraid'], [4.01, 'Of the war'], [8.37, 'I’m not okay'], [9, ''], [70, 'I’m not okay']]);
  const lines = lrcToLines(e);
  assert.equal(lines.length, 4);
  assert.equal(lines[0].end, 3.91);
  assert.equal(lines[2].end, 8.9); // ends before the blank line
  assert.equal(lines[3].end, 74);
});

test('song titles from file names, and the Manager song for a file', () => {
  assert.deepEqual(titleFromFile('03 - Arc Flash - Static Bloom (Final Mix).wav'), { artist: 'Arc Flash', title: 'Static Bloom' });
  assert.deepEqual(titleFromFile('static_bloom_master.wav'), { artist: '', title: 'static bloom' });
  assert.deepEqual(titleFromFile('Undertow v3.mp3'), { artist: '', title: 'Undertow' });
  const songs = [{ id: 'a', title: 'Static Bloom', audioId: 'm1' }, { id: 'b', title: 'Undertow', audioId: null }];
  assert.equal(findSong(songs, { id: 'm1', name: 'whatever.wav' }).id, 'a');
  assert.equal(findSong(songs, { id: 'm9', name: 'Undertow v3.mp3' }).id, 'b');
  assert.equal(findSong(songs, { id: 'm9', name: 'Arc Flash - Static Bloom (demo).mp3' }).id, 'a');
  assert.equal(findSong(songs, { id: 'm9', name: 'Hurt.mp3' }), null);
});

test('LRCLIB lookups', async () => {
  const u = new URL(lrclibGetURL({ artist: 'Bad Omens', title: 'Just Pretend', duration: 205.4 }));
  assert.equal(u.hostname, 'lrclib.net');
  assert.equal(u.searchParams.get('duration'), '205');
  const list = [
    { trackName: 'Just Pretend', artistName: 'Bad Omens', duration: 205, plainLyrics: 'a', syncedLyrics: null },
    { trackName: 'Just Pretend', artistName: 'Bad Omens', duration: 206, plainLyrics: 'a', syncedLyrics: '[00:01.00] a' },
    { trackName: 'Just Pretend (Live)', artistName: 'Bad Omens', duration: 260, syncedLyrics: '[00:01.00] b' },
    { trackName: 'Just Pretend', artistName: 'Someone Else', duration: 205, syncedLyrics: '[00:01.00] c' },
  ];
  assert.equal(pickResult(list, { artist: 'Bad Omens', title: 'Just Pretend', duration: 205 }).duration, 206); // timed first
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    if (url.includes('/get?')) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => list };
  };
  const got = await fetchLyrics({ artist: 'Bad Omens', title: 'Just Pretend', duration: 205 }, { fetchFn });
  assert.ok(got.timed && got.lines[0].text === 'a' && got.match.artist === 'Bad Omens');
  assert.equal(calls.length, 2);
  // with no artist, only a same-length match is trusted
  const noArtist = await fetchLyrics({ title: 'Just Pretend', duration: 230 }, { fetchFn });
  assert.equal(noArtist, null);
  const exact = await fetchLyrics({ title: 'Just Pretend', duration: 206 }, { fetchFn });
  assert.equal(exact.match.duration, 206);
  await assert.rejects(fetchLyrics({ artist: 'x', title: 'y' }, { fetchFn: async () => ({ ok: false, status: 500, json: async () => ({}) }) }), /500/);
});
