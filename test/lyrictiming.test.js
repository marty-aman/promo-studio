import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLyricTiming, timingFromLyrics, lyricsFromTiming, sameTiming, timingStale, songLyricsPlan, setSongTiming, keepTiming, retimeLines, autoSaveDecision, timingSummary, timingToLRC, timingToSRT, timingFromLRC, lyricsKey, markTimed, timingSourceOf, MAX_TIMED_LINES } from '../js/manager/lyrictiming.js';
import { newManager, newSong, normalizeManager, backupFile, parseBackup } from '../js/manager/model.js';
import { workspaceFrom, addArtist, workspaceBackup, parseWorkspaceBackup } from '../js/manager/artists.js';
import { parseSubtitles } from '../js/subtitles.js';

const edit = [
  { id: 'a', text: 'Wires in the dark', start: 12.5, end: 15.2 },
  { id: 'b', text: 'Arc flash', start: 15.3, end: 17 },
  { id: 'c', text: 'Burn it down', start: 20, end: 22.75 },
];
const now = new Date('2026-11-23T08:00:00Z');

test('edit lines become a small timing and come back the same', () => {
  const t = timingFromLyrics(edit, { source: 'tap', songLength: 201.37, now });
  assert.deepEqual(t.lines[0], { t: 12.5, text: 'Wires in the dark' }); // it runs to the next line, so no end is kept
  assert.deepEqual(t.lines[1], { t: 15.3, text: 'Arc flash', end: 17 });
  assert.equal(t.source, 'tap');
  assert.equal(t.offset, 0);
  assert.equal(t.savedAt, '2026-11-23T08:00:00.000Z');
  assert.equal(t.songLength, 201.37);
  const back = lyricsFromTiming(t, () => 'x');
  assert.deepEqual(back.map((l) => [l.text, l.start, l.end]), edit.map((l) => [l.text, l.start, l.end]));
  // a line that just runs to the next one keeps no end
  const runOn = timingFromLyrics([{ text: 'one', start: 1, end: 2.9 }, { text: 'two', start: 3, end: 7 }], { now });
  assert.equal('end' in runOn.lines[0], false);
  assert.equal('end' in runOn.lines[1], false);
  assert.equal(lyricsFromTiming(runOn)[0].end, 2.9);
  assert.equal(timingFromLyrics([], { now }), null);
  assert.equal(timingFromLyrics([{ text: '  ', start: 1, end: 2 }], { now }), null);
});

test('normalize keeps good timing and rejects junk', () => {
  assert.equal(normalizeLyricTiming(null), null);
  assert.equal(normalizeLyricTiming({ lines: 'nope' }), null);
  assert.equal(normalizeLyricTiming({ lines: [{ t: 'x', text: 'a' }, { t: -1, text: 'b' }, { t: 3, text: '' }] }), null);
  const n = normalizeLyricTiming({ lines: [{ t: 9.123, text: ' b ', end: 8 }, { t: 2, text: 'a', end: 4 }, { t: NaN, text: 'c' }], offset: 9999, source: 'evil', savedAt: 'not a date', songLength: -5, lyricsKey: '<script>', extra: 'dropped' });
  assert.deepEqual(n, { lines: [{ t: 2, text: 'a', end: 4 }, { t: 9.12, text: 'b' }], offset: 600, source: 'manual', savedAt: '' });
  const many = normalizeLyricTiming({ lines: Array.from({ length: MAX_TIMED_LINES + 50 }, (_, i) => ({ t: i, text: `l${i}` })) });
  assert.equal(many.lines.length, MAX_TIMED_LINES);
  assert.equal(normalizeLyricTiming({ lines: [{ t: 1, text: 'x'.repeat(1000) }] }).lines[0].text.length, 300);
});

test('offset moves every line, never below zero', () => {
  const t = { lines: [{ t: 0.2, text: 'a', end: 1 }, { t: 5, text: 'b' }], offset: -0.5 };
  const l = lyricsFromTiming(t);
  assert.equal(l[0].start, 0);
  assert.equal(l[1].start, 4.5);
  assert.equal(l[1].end, 8.5); // the last line lasts 4 s
});

test('the Manager keeps lyricTiming through normalize and both backups; old saves still load', () => {
  const m = newManager();
  const s = newSong('Arc Flash');
  s.lyrics = 'Wires in the dark\nArc flash\nBurn it down';
  setSongTiming(s, timingFromLyrics(edit, { source: 'tap', now }));
  s.files.video = { mediaId: 'vid1', offset: 3.25 };
  m.songs.push(s);
  const back = parseBackup(backupFile(m));
  assert.deepEqual(back.songs[0].lyricTiming, s.lyricTiming);
  assert.equal(back.songs[0].files.video.offset, 3.25); // the music video's sync point is its own thing
  const ws = workspaceFrom(m);
  const wsBack = parseWorkspaceBackup(workspaceBackup(ws));
  assert.deepEqual(wsBack.artists[0].songs[0].lyricTiming, s.lyricTiming);
  // an old save with no timing, and one with a broken timing
  const old = normalizeManager({ songs: [{ id: 'song_old', title: 'Old', lyrics: 'x' }, { id: 'song_bad', title: 'Bad', lyricTiming: { lines: [{ t: 'nope' }] } }] });
  assert.equal(old.songs[0].lyricTiming, null);
  assert.equal(old.songs[1].lyricTiming, null);
  assert.equal(old.songs[1].lyrics, '');
  let [ws2] = addArtist(workspaceFrom(newManager()), 'Static Ritual');
  assert.ok(parseWorkspaceBackup(workspaceBackup(ws2)).artists.every((a) => a.songs.every((x) => 'lyricTiming' in x)));
});

test('.lrc and .srt out, .lrc in', () => {
  const t = timingFromLyrics(edit, { source: 'tap', now });
  const lrc = timingToLRC(t, { title: 'Arc Flash', artist: 'Arc Flash' });
  assert.match(lrc, /^\[ti:Arc Flash\]\n\[ar:Arc Flash\]\n\[00:12\.50\]Wires in the dark\n/);
  const again = timingFromLRC(lrc, { now });
  assert.equal(again.source, 'file');
  assert.ok(sameTiming(again, t), 'an exported .lrc reads back to the same timing');
  const srt = timingToSRT(t);
  assert.match(srt, /^1\n00:00:12,500 --> 00:00:15,200\nWires in the dark\n/);
  const cues = parseSubtitles(srt);
  assert.deepEqual(cues.map((c) => c.text), edit.map((l) => l.text));
  assert.equal(timingFromLRC('just words\nno stamps'), null);
});

test('saved timing beats a lookup; plain text comes next', () => {
  const s = newSong('Arc Flash');
  assert.equal(songLyricsPlan(s).kind, 'none'); // only then may LRCLIB be asked
  s.lyrics = 'Wires in the dark';
  assert.equal(songLyricsPlan(s).kind, 'text');
  s.status = 'released';
  setSongTiming(s, timingFromLyrics(edit, { now }));
  assert.deepEqual(songLyricsPlan(s), { kind: 'timed', stale: false });
  s.instrumental = true;
  assert.equal(songLyricsPlan(s).kind, 'instrumental');
  assert.equal(songLyricsPlan(null).kind, 'none');
  // blank lyrics on the song are filled from the timed lines
  const blank = newSong('Blank');
  setSongTiming(blank, timingFromLyrics(edit, { now }));
  assert.equal(blank.lyrics, 'Wires in the dark\nArc flash\nBurn it down');
});

test('editing the plain lyrics after timing is noticed; keep or re-time', () => {
  const s = newSong('Arc Flash');
  s.lyrics = 'Wires in the dark\n\nArc flash\nBurn it down\n';
  setSongTiming(s, timingFromLyrics(edit, { now }));
  assert.equal(timingStale(s), false);
  s.lyrics = 'Wires  in the dark\nArc flash\n\nBurn it down'; // spacing and blank lines don't count
  assert.equal(timingStale(s), false);
  s.lyrics = 'Wires in the dark\nArc flash again\nBurn it down\nNew last line';
  assert.equal(timingStale(s), true);
  assert.equal(songLyricsPlan(s).stale, true);
  const re = retimeLines(s, () => 'r');
  assert.deepEqual(re.map((l) => [l.text, l.start]), [['Wires in the dark', 12.5], ['Arc flash again', 15.3], ['Burn it down', 20], ['New last line', 22.85]]);
  keepTiming(s);
  assert.equal(timingStale(s), false);
  assert.equal(s.lyricTiming.lyricsKey, lyricsKey(s.lyrics));
});

test('automatic saves never overwrite a different saved timing', () => {
  const s = newSong('Arc Flash');
  const mine = timingFromLyrics(edit, { source: 'tap', now });
  assert.equal(autoSaveDecision(s, mine, ''), 'save'); // nothing saved yet
  setSongTiming(s, mine);
  assert.equal(autoSaveDecision(s, timingFromLyrics(edit, { now: new Date() }), ''), 'same');
  const shifted = timingFromLyrics(edit.map((l) => ({ ...l, start: l.start + 0.1, end: l.end + 0.1 })), { source: 'manual', now: new Date() });
  assert.equal(autoSaveDecision(s, shifted, s.lyricTiming.savedAt), 'save'); // this edit started from it
  assert.equal(autoSaveDecision(s, shifted, ''), 'conflict'); // e.g. an LRCLIB fetch or a fresh tap-sync
  assert.equal(autoSaveDecision(s, shifted, '2020-01-01T00:00:00.000Z'), 'conflict'); // started from an older one
  assert.equal(autoSaveDecision(null, shifted), 'none');
});

test('the edit note and summary', () => {
  const a = markTimed(null, 'song', 'S1');
  assert.deepEqual(a, { by: 'song', basedOn: 'S1', rev: 1 });
  const b = markTimed(a, 'manual');
  assert.deepEqual(b, { by: 'manual', basedOn: 'S1', rev: 2 });
  assert.equal(markTimed(b, 'lrclib', '').basedOn, '');
  assert.equal(timingSourceOf(b), 'manual');
  assert.equal(timingSourceOf(a, { source: 'tap' }), 'tap');
  assert.equal(timingSummary(null), 'Not timed yet');
  assert.match(timingSummary(timingFromLyrics(edit, { now })), /^Timed \(3 lines, saved Nov 23/);
});
