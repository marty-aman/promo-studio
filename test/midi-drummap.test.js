import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMidi, remapMidi, writeMidi, noteCounts, drumChannels } from '../js/midi.js';
import { engines, engine, fallbackChain, plan, guessEngines, canonLabel, canonLane, noteName, laneFor, sameDrum, engineGroups } from '../js/drummap.js';
import { drumTimelineFromMidi, midiDrumTrack } from '../js/drums.js';
import { midiNotesFor } from '../js/midiviz.js';
import { kindOf } from '../js/media.js';

const groove = () =>
  writeMidi(
    [
      { name: 'Drums', ch: 9, notes: [{ tick: 0, note: 36 }, { tick: 0, note: 42 }, { tick: 480, note: 38 }, { tick: 480, note: 42 }, { tick: 960, note: 36 }, { tick: 960, note: 46 }, { tick: 1440, note: 50 }, { tick: 1560, note: 45 }, { tick: 1680, note: 43 }, { tick: 1920, note: 49, vel: 127 }] },
      { name: 'Keys', ch: 0, notes: [{ tick: 0, note: 60, len: 960 }, { tick: 0, note: 64, len: 960 }, { tick: 960, note: 67, len: 480 }] },
    ],
    { bpm: 120 },
  );

test('MIDI files: notes, times through the tempo, tracks, bars', () => {
  const m = parseMidi(groove());
  assert.equal(m.ppq, 480);
  assert.equal(m.tempo, 120);
  assert.equal(m.notes.length, 13);
  const drums = m.tracks.find((t) => t.isDrum);
  assert.equal(drums.name, 'Drums');
  assert.deepEqual(drums.channels, [9]);
  assert.equal(m.notes.find((n) => n.note === 38).time, 0.5);
  assert.equal(m.notes.find((n) => n.note === 60).dur, 1);
  assert.equal(m.bars[1].time, 2);
  assert.deepEqual(drumChannels(m), [9]);
  assert.equal(noteCounts(m, { channels: [9] }).get(42), 2);
  assert.equal(midiDrumTrack(m), drums.index);
  assert.throws(() => parseMidi(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), /Not a MIDI file/);
  assert.equal(kindOf('audio/midi', 'groove.mid'), 'midi');
  assert.equal(kindOf('', 'Groove.MIDI'), 'midi');
  assert.equal(kindOf('audio/mpeg', 'song.mp3'), 'audio');
});

test('rewriting drum notes keeps everything else byte for byte', () => {
  const src = groove();
  const out = remapMidi(src, new Map([[42, 51], [49, null]]), { channels: [9] });
  assert.equal(out.bytes.length, src.length);
  assert.equal(out.changed, 2);
  assert.equal(out.silenced, 1);
  const m = parseMidi(out.bytes);
  assert.deepEqual(m.notes.filter((n) => n.ch === 9).map((n) => n.note).sort((a, b) => a - b), [36, 36, 38, 43, 45, 46, 50, 51, 51]);
  assert.equal(m.notes.filter((n) => n.ch === 0).length, 3); // other channels untouched
  // the bytes that differ are only note numbers and the silenced velocity
  let diff = 0;
  for (let i = 0; i < src.length; i++) if (src[i] !== out.bytes[i]) diff++;
  assert.equal(diff, 2 * 2 + 1); // two hi-hats (on + off) and one velocity
});

test('160 drum maps, every note naming a known drum', () => {
  const all = engines();
  assert.equal(all.length, 160);
  for (const id of ['general_midi', 'guitar_pro', 'superior_drummer3', 'ezdrummer2', 'addictive_drums2', 'ssd5', 'bfd3', 'ggd_invasion', 'roland_td27', 'logic_pro_drummer']) assert.ok(engine(id), id);
  const gm = engine('general_midi');
  assert.equal(gm.notes.get(36), 'kick.main');
  assert.equal(gm.notes.get(42), 'hat.closed');
  assert.equal(gm.notes.get(49), 'crash.1.hit');
  assert.equal(engineGroups()[0][0], 'Standards');
  for (const e of all) for (const c of e.notes.values()) assert.ok(canonLabel(c), `${e.id} ${c}`);
});

test('stand-ins follow remidi’s order', () => {
  assert.deepEqual(fallbackChain('snare1.hit'), ['snare1.side', 'snare2.hit', 'snare2.side']);
  assert.deepEqual(fallbackChain('snare2.rimshot'), ['snare2.hit', 'snare1.rimshot', 'snare1.hit']);
  assert.deepEqual(fallbackChain('tom.rack2.hit').slice(0, 3), ['tom.rack1.hit', 'tom.rack3.hit', 'tom.rack4.hit']);
  assert.ok(fallbackChain('tom.rack2.hit').every((c) => c.endsWith('.hit')));
  assert.deepEqual(fallbackChain('tom.rack2.rimshot').slice(0, 3), ['tom.rack2.hit', 'tom.rack1.rimshot', 'tom.rack1.hit']);
  assert.deepEqual(fallbackChain('crash.1.hit').slice(0, 4), ['crash.1.edge', 'crash.2.hit', 'crash.2.edge', 'crash.3.hit']);
  assert.deepEqual(fallbackChain('aux1.closed.tip').slice(8, 10), ['hat.closed.tip', 'hat.closed']);
  assert.ok(fallbackChain('china.1.hit').indexOf('stack.1.hit') < fallbackChain('china.1.hit').indexOf('crash.1.hit'));
  assert.ok(sameDrum('snare1.rimshot', 'snare1.hit') && !sameDrum('snare1.hit', 'snare2.hit'));
});

test('converting General MIDI to Addictive Drums 2 and back', () => {
  const used = new Map([[36, 4], [38, 4], [42, 8], [46, 2], [49, 1], [51, 6], [50, 2], [48, 2], [47, 2], [45, 2], [43, 2], [41, 2], [99, 1]]);
  const p = plan('general_midi', 'addictive_drums2', used);
  const to = (n) => p.map.get(n);
  assert.equal(to(36), 36);
  assert.equal(to(38), 38);
  assert.equal(to(42), 51); // a closed hat lands on AD2's closed tip
  assert.equal(to(46), 55); // open hat 1
  assert.equal(to(49), 77);
  assert.equal(to(51), 60);
  assert.equal(to(99), null); // not a GM drum: left out
  // six GM toms on AD2's four, still running down the kit
  const toms = [50, 48, 47, 45, 43, 41].map(to);
  for (let i = 1; i < toms.length; i++) assert.ok(toms[i] <= toms[i - 1], `tom order ${toms}`);
  assert.equal(new Set(toms).size, 4);
  assert.equal(p.rows.find((r) => r.note === 42).how, 'stand-in');
  assert.equal(p.stats.notes, 38);
  assert.equal(p.stats.dropped, 1);
  const keep = plan('general_midi', 'addictive_drums2', used, { unknown: 'keep' });
  assert.equal(keep.map.get(99), 99);
  // same-drum-only: a china with no china, stack or crash of its own kind is left out
  const drop = plan('general_midi', 'mt_power', new Map([[52, 1]]), { missing: 'drop' });
  const near = plan('general_midi', 'mt_power', new Map([[52, 1]]));
  assert.ok(drop.rows[0].how === 'dropped' || drop.rows[0].how === 'same');
  assert.notEqual(near.rows[0].how, 'dropped');
  // round trip of the basics
  const back = plan('addictive_drums2', 'general_midi', new Map([[36, 1], [38, 1], [77, 1]]));
  assert.deepEqual([...back.map.values()], [36, 38, 49]);
});

test('guessing what a file was written for, and drum lanes', () => {
  const ad2 = engine('addictive_drums2');
  const used = new Map([...ad2.notes.keys()].slice(0, 30).map((n) => [n, 3]));
  assert.equal(guessEngines(used)[0].engine.id, 'addictive_drums2');
  assert.equal(guessEngines(new Map([[36, 1], [38, 1], [42, 1]]))[0].fit, 1);
  assert.equal(canonLane('tom.floor2.hit'), 'floor');
  assert.equal(canonLane('tom.rack1.rimshot'), 'tom1');
  assert.equal(canonLane('china.1.hit'), 'china');
  assert.equal(canonLane('perc.cowbell'), null);
  assert.equal(laneFor('addictive_drums2', 51), 'hihat'); // AD2's 51 is a hat, GM's is a ride
  assert.equal(laneFor('general_midi', 51), 'ride');
  assert.equal(noteName(36), 'C1');
  assert.equal(noteName(61), 'C#3');
  assert.equal(canonLabel('hat.open2.tip'), 'Hi-hat open 2 (tip)');
  assert.equal(canonLabel('snare1.rimshot'), 'Snare rimshot');
});

test('a drum chart and MIDI notes from a MIDI file', () => {
  const m = parseMidi(groove());
  const tl = drumTimelineFromMidi(m, midiDrumTrack(m), 'general_midi');
  assert.deepEqual(tl.lanes.sort(), ['crash', 'floor', 'hihat', 'kick', 'snare', 'tom1', 'tom2'].sort());
  assert.equal(tl.hits.find((x) => x.lane === 'crash').vel, 1);
  assert.equal(tl.tempo, 120);
  // read as AD2, 42 is a sidestick on the snare lane
  const ad = drumTimelineFromMidi(m, midiDrumTrack(m), 'addictive_drums2');
  assert.ok(ad.hits.filter((x) => x.lane === 'snare').length > tl.hits.filter((x) => x.lane === 'snare').length);
  const notes = midiNotesFor(m, []);
  assert.equal(notes.notes.length, 3); // drums left out by default
  assert.equal(notes.low, 60);
  assert.equal(notes.high, 67);
  assert.equal(midiNotesFor(m, [notes.tracks[0]]), midiNotesFor(m, [notes.tracks[0]])); // cached
});
