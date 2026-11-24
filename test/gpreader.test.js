// Guitar Pro reading checked against real files (test/fixtures/gp, see its README) and against alphaTab's own
// MIDI generator, which is how alphaTab (and Guitar Pro) play a file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTabBytes, playbackOrder, timedBeats, buildTabTimeline, tabTracks, isBassTrack, importCheck } from '../js/tab.js';
import { drumTimelineFromScore, midiToLane } from '../js/drums.js';
import * as E from '../js/tabedit.js';

const at = await import('../vendor/alphatab/alphaTab.core.min.mjs');
const fx = (name) => readFileSync(new URL(`./fixtures/gp/${name}`, import.meta.url));
const load = (name) => parseTabBytes(fx(name));
const quiet = () => {
  // alphaTab logs "Unsupported bend type" for some test files
  at.Logger.logLevel = at.LogLevel.None;
};
quiet();

function texScore(tex) {
  const imp = new at.importer.AlphaTexImporter();
  imp.initFromString(tex, new at.Settings());
  return imp.readScore();
}

/** alphaTab's reference: note-on times (s) per MIDI channel, and the bar order its player uses. */
function reference(score) {
  const midi = new at.midi.MidiFile();
  const gen = new at.midi.MidiFileGenerator(score, new at.Settings(), new at.midi.AlphaSynthMidiFileHandler(midi));
  gen.generate();
  const events = midi.tracks.flatMap((t) => t.events).sort((a, b) => a.tick - b.tick);
  const tempos = events.filter((e) => e instanceof at.midi.TempoChangeEvent);
  const sec = (tick) => {
    let s = 0;
    let last = 0;
    let bpm = score.tempo;
    for (const t of tempos) {
      if (t.tick >= tick) break;
      s += ((t.tick - last) / 960) * (60 / bpm);
      last = t.tick;
      bpm = t.beatsPerMinute;
    }
    return s + ((tick - last) / 960) * (60 / bpm);
  };
  const ons = events.filter((e) => e instanceof at.midi.NoteOnEvent).map((e) => ({ ch: e.channel, key: e.noteKey, time: sec(e.tick) }));
  return { ons, order: gen.tickLookup.masterBars.map((m) => m.masterBar.index) };
}
const r3 = (x) => Math.round(x * 1000) / 1000;

test('bar order matches alphaTab on its 58 repeat / ending / D.C. / D.S. / Coda / Fine cases', () => {
  const { cases } = JSON.parse(fx('playback-orders.json'));
  assert.ok(cases.length >= 50);
  for (const c of cases) assert.deepEqual(playbackOrder(texScore(c.tex).masterBars), c.expected, c.name);
});

test('bar order of Guitar Pro files matches alphaTab', async () => {
  // expected orders from alphaTab's MidiPlaybackController tests (files saved by Guitar Pro)
  assert.deepEqual(playbackOrder((await load('repeat-close-alternate-endings.gp5')).masterBars), [0, 1, 0, 2, 3, 0, 1, 0, 4]);
  assert.deepEqual(playbackOrder((await load('repeat-close-multi.gp5')).masterBars), [0, 1, 0, 1, 0, 1, 0, 1, 2]);
  // an ending with no repeat around it still plays (it used to be skipped)
  assert.deepEqual(playbackOrder((await load('alternate-endings-section-error.gp5')).masterBars), [0, 1]);
  for (const f of ['directions.gp5', 'metal-riffs.gp5', 'metal-riffs.gp4', 'metal-riffs.gp3']) {
    const score = await load(f);
    assert.deepEqual(playbackOrder(score.masterBars), reference(score).order, f);
  }
  // repeat x3, then the 7/8 part twice with first and second endings
  assert.deepEqual(playbackOrder((await load('metal-riffs.gp5')).masterBars), [0, 1, 0, 1, 0, 1, 2, 3, 4, 2, 3, 5]);
});

test('note times match alphaTab (tempo and time signature changes, tuplets, simile bars, over-full bars)', async () => {
  const files = ['time-signatures.gp5', 'tuplets.gp3', 'tuplets.gp4', 'tuplets.gp5', 'tuplets.gpx', 'tuplets.gp', 'bass-tuning.gp5', 'strings.gp5', 'simile-mark.gp', 'notes.gp5', 'metal-riffs.gp5', 'metal-riffs.gp4', 'metal-riffs.gp3'];
  for (const f of files) {
    const score = await load(f);
    const ref = reference(score);
    score.tracks.forEach((tr, ti) => {
      if (tr.staves.some((s) => s.isPercussion)) return;
      const ch = new Set([tr.playbackInfo.primaryChannel, tr.playbackInfo.secondaryChannel]);
      const want = ref.ons.filter((o) => ch.has(o.ch));
      const tl = buildTabTimeline(score, ti);
      const got = [];
      // tied and legato-slide target notes are not struck again
      for (const e of tl.events) for (const n of e.notes) if (!n.tie) got.push(r3(e.time));
      // alphaTab plays tremolo picking as many notes; the tab shows the written note
      const trem = tl.events.filter((e) => e.tremolo);
      const wantT = want.map((o) => r3(o.time)).filter((t) => !trem.some((e) => t > e.time + 0.01 && t < e.time + e.dur));
      const missing = [...new Set(wantT)].filter((t) => !got.some((g) => Math.abs(g - t) < 0.015));
      // grace notes: alphaTab moves the main note a little later; allow that one case
      assert.ok(missing.length <= 2, `${f} track ${ti}: ${missing.length} onsets missing, first ${missing.slice(0, 4)}`);
      const extra = [...new Set(got)].filter((t) => !wantT.some((w) => Math.abs(w - t) < 0.015));
      assert.ok(extra.length <= 2, `${f} track ${ti}: ${extra.length} extra onsets, first ${extra.slice(0, 4)}`);
    });
  }
});

test('simile (%) bars play the bar they repeat', async () => {
  const score = await load('simile-mark.gp');
  const ref = reference(score).ons.length;
  const tl = buildTabTimeline(score, 0);
  const notes = tl.events.reduce((n, e) => n + e.notes.length, 0);
  assert.equal(notes, ref); // 100 notes, was 52
});

test('an over-full bar keeps its notes in order instead of piling them at the bar line', async () => {
  const tl = buildTabTimeline(await load('notes.gp5'), 0);
  const times = tl.events.map((e) => e.time);
  assert.equal(new Set(times).size, times.length);
  assert.deepEqual(times.slice(0, 4), [0, 2, 4, 6]); // whole notes at 120 BPM
});

test('tunings, capo, 7 strings, 5-string bass, drums and a non-ASCII title (GP5 written by PyGuitarPro)', async () => {
  const score = await load('metal-riffs.gp5');
  assert.equal(score.title, 'Mötörhead Señor – Ünïcode');
  assert.equal(score.artist, 'Björk & Ølaf');
  const tracks = tabTracks(score);
  assert.deepEqual(tracks.map((t) => [t.name, t.strings]), [['Rhythm Guitar (Drop C)', 6], ['7-String Lead', 7], ['Bass 5', 5]]);
  assert.deepEqual(score.tracks[0].staves[0].tuning, [62, 57, 53, 48, 43, 36]);
  assert.ok(isBassTrack(tracks[2]) && !isBassTrack(tracks[1]));
  assert.equal(score.tracks[1].staves[0].capo, 2);
  const tl = buildTabTimeline(score, 0);
  assert.deepEqual(tl.tuning, ['D', 'A', 'F', 'C', 'G', 'C']);
  // 180 BPM, the 7/8 bar at 200 BPM: 3.5 quarters * 0.3 s
  assert.equal(r3(tl.bars[7].time - tl.bars[6].time), 1.05);
  assert.equal(r3(tl.duration), 14.9);
  const first = tl.events[0].notes[0];
  assert.deepEqual([first.line, first.fret, first.palmMute], [5, 0, true]);
  assert.ok(tl.events.find((e) => e.notes.some((n) => n.dead)) && tl.events.find((e) => e.notes.some((n) => n.tie)));
  // the drum track's two voices (hands and feet) both reach the drum chart
  const d = drumTimelineFromScore(score, 3);
  const bar1 = d.hits.filter((h) => h.time < 1.333 - 1e-3);
  assert.deepEqual(bar1.filter((h) => h.lane === 'kick').map((h) => r3(h.time)), [0, 0.167, 0.667]);
  assert.equal(bar1.filter((h) => h.lane === 'hihat').length, 8);
});

test('import check lists what the video layers skip or guess', async () => {
  const notes = importCheck(await load('metal-riffs.gp5'), midiToLane);
  assert.ok(notes.some((n) => n.kind === 'skipped' && /Tambourine \(5\)/.test(n.text)));
  assert.ok(notes.some((n) => /Tremolo picking/.test(n.text) && n.bars.includes(4)));
  const over = importCheck(await load('notes.gp5'), midiToLane);
  assert.ok(over.some((n) => /longer than their time signature/.test(n.text)));
  assert.deepEqual(importCheck(await load('tuplets.gp5'), midiToLane), []);
});

// ------------------------------------------------------------ Tab Studio

test('Tab Studio keeps time signature changes, repeats, endings, sections, capo and tempo', async () => {
  const m = E.fromScore(await load('metal-riffs.gp5'));
  assert.deepEqual(m.ts, [4, 4]);
  assert.deepEqual(m.tsBars, { 2: [7, 8], 3: [4, 4] });
  assert.deepEqual(E.tsAt(m, 2), [7, 8]);
  assert.deepEqual(E.tsAt(m, 5), [4, 4]);
  assert.deepEqual(m.marks[0], { ro: true, sec: { m: '', t: 'Intro' } });
  assert.deepEqual(m.marks[1], { rc: 3 });
  assert.deepEqual(m.marks[4], { rc: 2, ae: 1 });
  assert.equal(m.marks[2].sec.t, 'Refrän');
  assert.deepEqual(m.tempos, { 2: 200 });
  assert.equal(m.tracks[1].capo, 2);
  assert.deepEqual(E.checkModel(m), []); // no bar flagged too long or short
  assert.deepEqual(E.playOrder(m), [0, 1, 0, 1, 0, 1, 2, 3, 4, 2, 3, 5]);
  // Tab Studio plays as long as the video tab does
  assert.equal(r3(E.schedule(m).duration), 14.9);
  // a capo raises the pitch of fret 0 on the low B string: 35 + 2
  assert.equal(E.notePitch(m.tracks[1], { s: 7, f: 0 }), 37);
});

test('Tab Studio reads tuplets, triplets, dots, grace notes and 64ths at their real length', async () => {
  for (const f of ['tuplets.gp5', 'tuplets.gp', 'grace.gp5', 'time-signatures.gp5']) {
    const m = E.fromScore(await load(f));
    assert.deepEqual(E.checkModel(m).filter((i) => !i.short), [], f);
  }
  const t = E.fromScore(await load('tuplets.gp5'));
  const kinds = new Set(t.tracks[0].bars.flatMap((b) => b.beats.filter((x) => x.tu).map((x) => `${x.tu}:${x.tuD}`)));
  assert.ok(kinds.has('3:2') && kinds.has('5:4'), [...kinds].join(' '));
  const g = E.fromScore(await load('grace.gp5'));
  assert.ok(g.tracks[0].bars[0].beats.some((b) => b.grace === 'before'));
  assert.equal(E.beatQuarters({ dur: 4, dot: 2 }), 1.75);
  assert.equal(E.beatQuarters({ dur: 16, tu: 5, tuD: 4 }), 0.2);
  assert.equal(E.beatQuarters({ dur: 64 }), 1 / 16);
});

test('Tab Studio joins drum voices (kick in voice 2) and keeps every drum sound', async () => {
  const m = E.fromScore(await load('metal-riffs.gp5'));
  const drums = m.tracks.find((t) => t.kind === 'drums');
  const bar = drums.bars[0];
  assert.equal(bar.beats.length, 8);
  assert.deepEqual(bar.beats.map((b) => b.notes.map((n) => n.m).sort((a, b) => a - b)), [[36, 42], [36, 42], [38, 42], [42], [36, 42], [42], [38, 42, 54], [42]]);
  assert.ok(m.importNotes.some((n) => n.kind === 'changed' && /2 voices/.test(n.text)));
});

test('Tab Studio keeps ties (not played again), let ring, harmonics, slides, bends and tremolo picking', async () => {
  const m = E.fromScore(await load('metal-riffs.gp5'));
  const g = m.tracks[0];
  const notes = (bi) => g.bars[bi].beats.flatMap((b) => b.notes);
  assert.ok(notes(0).some((n) => n.tech.t) && notes(0).some((n) => n.tech.x) && notes(0).some((n) => n.tech.pm));
  assert.ok(notes(1).some((n) => n.tech.lr) && notes(1).some((n) => n.tech.h) && notes(1).some((n) => n.tech.sl === 1) && notes(1).some((n) => n.tech.v));
  assert.ok(notes(2).some((n) => n.tech.hm === 1) && notes(2).some((n) => Array.isArray(n.tech.b)));
  assert.equal(g.bars[3].beats[0].tp, 2); // sixteenth-note tremolo: 2 slashes
  // the tied note at the end of bar 1 is not struck again
  const sch = E.schedule(m);
  const bar0 = sch.events.filter((e) => e.track === 0 && e.bar === 0 && e.time < 1.333);
  assert.equal(bar0.length, 6); // 4 chugs, the chord, the dead note; not the tie
});

test('saving from Tab Studio keeps the file the same (Guitar Pro 7 round trip)', async () => {
  for (const f of ['metal-riffs.gp5', 'tuplets.gp5', 'grace.gp5', 'time-signatures.gp5', 'directions.gp5', 'repeat-close-alternate-endings.gp5']) {
    const m = E.fromScore(await load(f));
    E.alignTracks(m);
    const back = E.fromScore(await parseTabBytes(await E.toGpBytes(m)));
    const shape = (x) =>
      JSON.stringify(x.tracks.map((t) => [t.capo || 0, t.bars.map((b) => b.beats.map((k) => [k.dur, k.dot || 0, k.tu || 0, k.tuD || 0, k.grace || '', k.tp || 0, k.rest ? 1 : 0, k.notes.map((n) => (n.m != null ? n.m : `${n.s}/${n.tech.t ? '-' : n.tech.x ? 'x' : n.f}/${Object.keys(n.tech).sort()}`)).sort()]))]));
    assert.equal(shape(back), shape(m), f);
    for (const k of ['marks', 'tsBars', 'tempos', 'tempoMid']) assert.deepEqual(back[k] || {}, m[k] || {}, `${f} ${k}`);
  }
});

test('a return to the first tempo is kept (it was dropped before)', () => {
  const score = texScore('\\tempo 120 . \\track "G" . 0.6.1 | \\tempo 60 0.6.1 | \\tempo 120 0.6.1 |');
  const m = E.fromScore(score);
  assert.deepEqual(m.tempos, { 1: 60, 2: 120 });
  assert.equal(r3(E.barTimes(m).duration), r3(timedBeats(score, score.tracks[0].staves[0]).duration)); // 2 + 4 + 2 s
});

test('mid-bar tempo changes play and save in place', () => {
  const score = texScore('\\tempo 120 . \\track "G" . 0.6.4 0.6.4 0.6.4{tempo 60} 0.6.4 | 0.6.1 |');
  const m = E.fromScore(score);
  assert.deepEqual(m.tempoMid, { 0: [[0.5, 60]] });
  assert.equal(r3(E.barTimes(m).duration), r3(timedBeats(score, score.tracks[0].staves[0]).duration)); // 0.5 + 0.5 + 1 + 1 + 4
  assert.match(E.toAlphaTex(m), /0\.6\.4\{tempo 60\}/);
});

test('Tab Studio plays repeats like the video, and the cursor follows the repeat', () => {
  const m = E.fromScore(texScore('\\tempo 120 . \\track "G" . \\ro 1.6.1 | \\rc 2 2.6.1 | 3.6.1 |'));
  const sch = E.schedule(m);
  assert.deepEqual(sch.events.map((e) => [e.time, e.bar]), [[0, 0], [2, 1], [4, 0], [6, 1], [8, 2]]);
  assert.deepEqual(E.beatAtTime(m, 0, 5), { bar: 0, beat: 0 });
  assert.deepEqual(E.beatAtTime(m, 0, 9), { bar: 2, beat: 0 });
  assert.equal(E.barTimes(m).bars[2].time, 8);
});

test('bar edits move time signature changes and marks with their bars', () => {
  const m = E.fromScore(texScore('\\track "G" . \\ts 4 4 0.6.1 | \\ts 7 8 \\ro 0.6.8*7 | \\rc 2 \\ts 4 4 0.6.1 |'));
  E.insertBars(m, 0, 1);
  assert.deepEqual(m.tsBars, { 2: [7, 8], 3: [4, 4] });
  assert.deepEqual(Object.keys(m.marks), ['2', '3']);
  assert.equal(E.barFill(m.tracks[0].bars[1]), 4); // the new bar is in 4/4
  E.deleteBar(m, 1);
  assert.deepEqual(m.tsBars, { 1: [7, 8], 2: [4, 4] });
  assert.deepEqual(E.checkModel(m), []);
});

test('tracks without a tab or drum staff are left out of Tab Studio and keep their file number', () => {
  const m = E.fromScore(texScore('\\track "Piano" \\instrument piano \\staff {score} . c4.4*4 | \\track "G" . 0.6.1 |'));
  assert.equal(m.tracks.length, 1);
  assert.equal(m.tracks[0].srcIndex, 1);
  assert.ok(m.importNotes.some((n) => n.kind === 'skipped' && /Piano/.test(n.text)));
});

test('bar lists for the Import check', () => {
  assert.equal(E.barList([9, 3, 4, 5]), '3–5, 9');
  assert.equal(E.bendValues([[0, 0], [15, 4], [30, 4], [45, 0], [60, 0]]).join(' '), '0 4 4 0');
  assert.equal(E.bendValues(true).join(' '), '0 4');
});
