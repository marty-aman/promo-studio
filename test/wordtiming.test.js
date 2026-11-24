import test from 'node:test';
import assert from 'node:assert/strict';
import { editableWords, constrainWords, moveEdge, moveWord, applyTaps, setHandWords, clearHandWords, spreadWords, wordWindow, wordsStale, handTimedCount, mergeAutoWords, handLinesHit, isHandLine, wordAt, MIN_WORD, SLACK } from '../js/wordtiming.js';
import { savedWordTimes } from '../js/core.js';
import { normalizeLyricTiming, timingFromLyrics, lyricsFromTiming, sameTiming, editTimingLine } from '../js/manager/lyrictiming.js';
import { newManager, newSong, normalizeManager, backupFile, parseBackup } from '../js/manager/model.js';

const line = () => ({ id: 'a', text: 'Burn it down', start: 10, end: 12 });
const auto = () => ({ ...line(), words: [{ w: 'Burn', t: 10.1, end: 10.6 }, { w: 'it', t: 10.7, end: 11 }, { w: 'down', t: 11.1, end: 11.9 }] });
const ordered = (ws) => ws.every((k, i) => k.end - k.t >= MIN_WORD - 1e-9 && (i === 0 || k.t >= ws[i - 1].end - 1e-9));

test('a line with no word times starts from the same spread the renderer uses', () => {
  const e = editableWords(line());
  assert.equal(e.from, 'spread');
  assert.equal(e.stale, false);
  assert.deepEqual(e.words.map((k) => k.w), ['Burn', 'it', 'down']);
  assert.equal(e.words[0].t, 10);
  assert.equal(e.words[2].end, 12);
  assert.ok(ordered(e.words));
  assert.deepEqual(spreadWords(line()), e.words);
});

test('saved word times are edited as they are; edited words flag them out of date', () => {
  const e = editableWords(auto());
  assert.equal(e.from, 'saved');
  assert.equal(e.words[1].t, 10.7);
  const changed = { ...auto(), text: 'Burn them all down' };
  assert.equal(wordsStale(changed), true);
  const e2 = editableWords(changed);
  assert.equal(e2.stale, true);
  assert.equal(e2.from, 'spread');
  assert.equal(e2.words.length, 4);
  assert.equal(wordsStale(line()), false);
});

test('edges and moves keep words in order, at least MIN_WORD long and inside the window', () => {
  const win = wordWindow(line());
  assert.equal(win.lo, 10 - SLACK);
  const w = editableWords(auto()).words;
  // start of "it" dragged way before "Burn": stops at Burn's end (they don't touch)
  let r = moveEdge(w, 1, 'start', 5, win);
  assert.equal(r[1].t, 10.6);
  assert.ok(ordered(r));
  // end of "it" past "down": stops at down's start
  r = moveEdge(w, 1, 'end', 20, win);
  assert.equal(r[1].end, 11.1);
  // an edge can't make a word shorter than MIN_WORD
  r = moveEdge(w, 2, 'start', 99, win);
  assert.ok(Math.abs(r[2].end - r[2].t - MIN_WORD) < 1e-6);
  // a whole-word move keeps its length and stops at the neighbours
  r = moveWord(w, 1, 5, win);
  assert.equal(r[1].end, 11.1);
  assert.ok(Math.abs(r[1].end - r[1].t - 0.3) < 1e-6);
  // the first word can go a little before the line, not more
  r = moveWord(w, 0, -3, win);
  assert.equal(r[0].t, win.lo);
  r = moveEdge(w, 2, 'end', 30, win);
  assert.equal(r[2].end, win.hi);
});

test('touching words share their boundary when an edge is dragged', () => {
  const win = wordWindow(line());
  const w = spreadWords(line()); // spread words meet end to start
  const r = moveEdge(w, 1, 'start', w[1].t - 0.2, win);
  assert.equal(r[0].end, r[1].t);
  assert.ok(ordered(r));
  const r2 = moveEdge(w, 1, 'end', w[1].end + 0.1, win);
  assert.equal(r2[2].t, r2[1].end);
});

test('constrainWords repairs overlapping, reversed and out-of-window words', () => {
  const win = { lo: 9.5, hi: 12.5 };
  const r = constrainWords([{ w: 'a', t: 11, end: 10 }, { w: 'b', t: 8, end: 9 }, { w: 'c', t: 13, end: 14 }], win);
  assert.ok(ordered(r));
  assert.ok(r[0].t >= win.lo && r[2].end <= win.hi);
});

test('tap to time: each tap starts a word, the tap after the last ends it', () => {
  const win = wordWindow(line());
  const w = spreadWords(line());
  const r = applyTaps(w, [10.2, 10.9, 11.3], win);
  assert.deepEqual(r.map((k) => k.t), [10.2, 10.9, 11.3]);
  assert.equal(r[0].end, 10.9);
  assert.equal(r[1].end, 11.3);
  // only two taps: the third word follows, keeping its length
  const r2 = applyTaps(w, [10.5, 11.5], win);
  assert.ok(ordered(r2));
  assert.ok(r2[2].t >= r2[1].end);
});

test('hand words keep the Auto-sync ones for Reset; Clear goes back to them, or to no word times', () => {
  const l = auto();
  setHandWords(l, [{ w: 'Burn', t: 10, end: 10.5 }, { w: 'it', t: 10.5, end: 11 }, { w: 'down', t: 11, end: 11.6 }]);
  assert.equal(l.wordsBy, 'hand');
  assert.equal(l.wordsAuto[0].t, 10.1);
  assert.equal(savedWordTimes(l)[0].start, 10);
  setHandWords(l, [{ w: 'Burn', t: 10.05, end: 10.5 }, { w: 'it', t: 10.5, end: 11 }, { w: 'down', t: 11, end: 11.6 }]);
  assert.equal(l.wordsAuto[0].t, 10.1, 'a second hand edit keeps the Auto-sync words, not the first hand ones');
  assert.equal(handTimedCount([l, line()]), 1);
  clearHandWords(l);
  assert.equal(l.wordsBy, undefined);
  assert.equal(l.words[0].t, 10.1);
  const plain = setHandWords(line(), spreadWords(line()));
  assert.equal(plain.wordsAuto, undefined);
  clearHandWords(plain);
  assert.equal(plain.words, undefined);
});

test('a later Auto-sync keeps hand-timed lines when asked and stores its words for Reset', () => {
  const hand = setHandWords(auto(), [{ w: 'Burn', t: 9.8, end: 10.5 }, { w: 'it', t: 10.5, end: 11 }, { w: 'down', t: 11, end: 12.2 }]);
  const other = { id: 'b', text: 'Arc flash', start: 13, end: 14 };
  const fresh = [{ start: 10.2, end: 12, words: [{ w: 'Burn', t: 10.2 }, { w: 'it', t: 10.8 }, { w: 'down', t: 11.2 }], conf: 0.9 }, { start: 13.1, end: 14, words: [{ w: 'Arc', t: 13.1 }, { w: 'flash', t: 13.5 }], conf: 0.8 }];
  assert.equal(handLinesHit([hand, other], fresh), 1);
  const kept = mergeAutoWords([hand, other], fresh, { keepHand: true });
  assert.equal(kept[0].wordsBy, 'hand');
  assert.equal(kept[0].words[0].t, 9.8);
  assert.equal(kept[0].wordsAuto[0].t, 10.2);
  assert.equal(kept[0].start, 9.8, 'the line widens to hold the hand words');
  assert.equal(kept[0].end, 12.2);
  assert.equal(kept[1].words[1].t, 13.5);
  const replaced = mergeAutoWords([hand, other], fresh, { keepHand: false });
  assert.equal(replaced[0].wordsBy, undefined);
  assert.equal(replaced[0].words[0].t, 10.2);
  // a hand line whose text no longer matches the new line isn't kept
  assert.equal(isHandLine({ ...hand, text: 'Something else' }), false);
  assert.equal(handLinesHit([hand], [{ ...fresh[0], text: 'Burn it all down' }]), 0);
});

test('word timing set by hand is saved on the song, survives a backup, and older saves load', () => {
  const l = setHandWords(auto(), [{ w: 'Burn', t: 10, end: 10.5 }, { w: 'it', t: 10.5, end: 11 }, { w: 'down', t: 11, end: 11.6 }]);
  const timing = timingFromLyrics([l, { id: 'b', text: 'Arc flash', start: 13, end: 14 }], { source: 'manual' });
  assert.equal(timing.lines[0].wordsBy, 'hand');
  assert.equal(timing.lines[0].wordsAuto[1].t, 10.7);
  assert.equal(timing.lines[0].words[2].end, 11.6);
  assert.equal(timing.lines[1].wordsBy, undefined);
  // through a Manager backup
  const m = newManager();
  const s = newSong('Burn');
  s.lyricTiming = timing;
  m.songs.push(s);
  const back = parseBackup(backupFile(normalizeManager(m)));
  const t2 = back.songs.find((x) => x.title === 'Burn').lyricTiming;
  assert.equal(t2.lines[0].wordsBy, 'hand');
  assert.equal(t2.lines[0].wordsAuto.length, 3);
  // back into an edit, offset applied to both word lists
  const lines = lyricsFromTiming({ ...t2, offset: 1 }, () => 'x');
  assert.equal(lines[0].wordsBy, 'hand');
  assert.equal(lines[0].words[0].t, 11);
  assert.equal(lines[0].wordsAuto[0].t, 11.1);
  // a hand mark without words is dropped; an older save without marks is unchanged
  assert.equal(normalizeLyricTiming({ lines: [{ t: 1, text: 'x', wordsBy: 'hand' }] }).lines[0].wordsBy, undefined);
  const old = normalizeLyricTiming({ lines: [{ t: 1, text: 'Arc flash', words: [{ w: 'Arc', t: 1 }, { w: 'flash', t: 1.4 }] }], source: 'auto' });
  assert.equal(old.lines[0].wordsBy, undefined);
  assert.equal(old.lines[0].words.length, 2);
  // the hand mark (and a changed word end) counts as a change for the automatic save
  const unmarked = timingFromLyrics([{ ...l, wordsBy: undefined }, { id: 'b', text: 'Arc flash', start: 13, end: 14 }]);
  assert.equal(sameTiming(timing, unmarked), false);
});

test('the Manager editor writes a line back without the offset and moves savedAt on', () => {
  const t = normalizeLyricTiming({ lines: [{ t: 10, end: 12, text: 'Burn it down' }], offset: 0.5, source: 'tap', savedAt: '2026-11-20T00:00:00.000Z' });
  const ok = editTimingLine(t, 0, (x) => setHandWords(x, spreadWords(x)), new Date('2026-11-24T00:00:00Z'));
  assert.equal(ok, true);
  assert.equal(t.lines[0].wordsBy, 'hand');
  assert.equal(t.lines[0].words[0].t, 10, 'stored without the 0.5 s offset');
  assert.equal(t.savedAt, '2026-11-24T00:00:00.000Z');
  editTimingLine(t, 0, (x) => clearHandWords(x));
  assert.equal(t.lines[0].words, undefined);
  assert.equal(t.lines[0].wordsBy, undefined);
  assert.equal(editTimingLine(t, 5, () => {}), false);
});

test('wordAt finds the word playing', () => {
  const w = editableWords(auto()).words;
  assert.equal(wordAt(w, 10.8), 1);
  assert.equal(wordAt(w, 10.65), -1);
});
