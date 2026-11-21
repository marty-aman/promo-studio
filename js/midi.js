// Standard MIDI files (.mid): read the notes with their times in seconds (through the tempo map), the
// tracks, channels, tempo and bars, and rewrite drum note numbers in place for a drum-map conversion
// (everything else in the file, timing, velocities, controllers, stays byte for byte). Pure, unit tested.

export const MIDI_EXTENSIONS = /\.(mid|midi|smf)$/i;
export const MIDI_ACCEPT = '.mid,.midi,audio/midi,audio/x-midi';
export const DRUM_CHANNEL = 9; // channel 10, counting from 0

const GM_PROGRAMS = ['Piano', 'Chromatic perc.', 'Organ', 'Guitar', 'Bass', 'Strings', 'Ensemble', 'Brass', 'Reed', 'Pipe', 'Synth lead', 'Synth pad', 'Synth FX', 'Ethnic', 'Percussive', 'Sound FX'];

/**
 * Parse an SMF. Returns { format, ppq, smpte, tracks: [{ index, name, channels, notes, program, isDrum }],
 * notes: [{ track, ch, note, vel, tick, time, dur, at }] (at = byte offset of the note number),
 * tempos: [{ tick, us }], timeSigs: [{ tick, num, den }], tempo (first BPM), duration, bars }.
 * Throws on a file that isn't MIDI.
 */
export function parseMidi(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let p = 0;
  const u32 = () => ((b[p++] << 24) | (b[p++] << 16) | (b[p++] << 8) | b[p++]) >>> 0;
  const u16 = () => (b[p++] << 8) | b[p++];
  const tag = () => String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]);
  // RIFF-wrapped MIDI (.rmi) keeps the SMF in its data chunk
  if (tag() === 'RIFF') {
    const at = findTag(b, 'MThd');
    if (at < 0) throw new Error('Not a MIDI file.');
    p = at;
  }
  if (tag() !== 'MThd') throw new Error('Not a MIDI file.');
  p += 4;
  const hlen = u32();
  const format = u16();
  const ntracks = u16();
  const division = u16();
  p += hlen - 6;
  const smpte = (division & 0x8000) !== 0;
  const ppq = smpte ? 0 : division;
  const ticksPerSec = smpte ? (256 - (division >> 8)) * (division & 0xff) : 0;
  const tracks = [];
  const raw = [];
  const tempos = [];
  const timeSigs = [];
  for (let t = 0; t < ntracks && p + 8 <= b.length; t++) {
    while (p + 8 <= b.length && tag() !== 'MTrk') {
      p += 4;
      p += u32(); // skip unknown chunks
    }
    if (p + 8 > b.length) break;
    p += 4;
    const len = u32();
    const end = Math.min(b.length, p + len);
    const tr = { index: t, name: '', channels: new Set(), program: {}, events: [] };
    let tick = 0;
    let status = 0;
    while (p < end) {
      let delta = 0;
      for (let k = 0; k < 4; k++) {
        const c = b[p++];
        delta = (delta << 7) | (c & 0x7f);
        if (!(c & 0x80)) break;
      }
      tick += delta;
      let s = b[p];
      if (s & 0x80) p++;
      else s = status; // running status
      if (s === 0xff) {
        const type = b[p++];
        const n = vlq();
        if (type === 0x51 && n === 3) tempos.push({ tick, us: (b[p] << 16) | (b[p + 1] << 8) | b[p + 2] });
        else if (type === 0x58 && n >= 2) timeSigs.push({ tick, num: b[p], den: 2 ** b[p + 1] });
        else if (type === 0x03 && !tr.name) tr.name = utf8(b.subarray(p, p + n)).trim();
        p += n;
        continue;
      }
      if (s === 0xf0 || s === 0xf7) {
        p += vlq();
        continue;
      }
      status = s;
      const kind = s & 0xf0;
      const ch = s & 0x0f;
      if (kind === 0xc0 || kind === 0xd0) {
        if (kind === 0xc0) tr.program[ch] = b[p];
        p += 1;
        continue;
      }
      if (kind === 0x80 || kind === 0x90 || kind === 0xa0) {
        tr.events.push({ tick, kind, ch, note: b[p], vel: b[p + 1], at: p });
        tr.channels.add(ch);
      }
      p += 2;
    }
    p = end;
    raw.push(tr);
  }
  function vlq() {
    let v = 0;
    for (let k = 0; k < 4; k++) {
      const c = b[p++];
      v = (v << 7) | (c & 0x7f);
      if (!(c & 0x80)) break;
    }
    return v;
  }

  // ticks to seconds through the tempo map
  tempos.sort((a, x) => a.tick - x.tick);
  if (!tempos.length || tempos[0].tick > 0) tempos.unshift({ tick: 0, us: 500000 });
  const segs = [];
  let sec = 0;
  for (let i = 0; i < tempos.length; i++) {
    if (i) sec += ((tempos[i].tick - tempos[i - 1].tick) * tempos[i - 1].us) / 1e6 / (ppq || 1);
    segs.push({ tick: tempos[i].tick, us: tempos[i].us, sec });
  }
  const toSec = (tick) => {
    if (smpte) return tick / ticksPerSec;
    let s = segs[0];
    for (const x of segs) if (x.tick <= tick) s = x;
    return s.sec + ((tick - s.tick) * s.us) / 1e6 / ppq;
  };

  // pair note-ons with their note-offs
  const notes = [];
  for (const tr of raw) {
    const open = new Map();
    for (const e of tr.events) {
      if (e.kind === 0xa0) continue;
      const k = e.ch * 128 + e.note;
      if (e.kind === 0x90 && e.vel > 0) {
        const n = { track: tr.index, ch: e.ch, note: e.note, vel: e.vel, tick: e.tick, time: toSec(e.tick), dur: 0, at: e.at };
        notes.push(n);
        (open.get(k) || open.set(k, []).get(k)).push(n);
      } else {
        const list = open.get(k);
        const n = list && list.shift();
        if (n) n.dur = Math.max(0, toSec(e.tick) - n.time);
      }
    }
  }
  notes.sort((a, x) => a.time - x.time || a.note - x.note);
  const lastTick = Math.max(0, ...raw.flatMap((tr) => tr.events.map((e) => e.tick)));
  const duration = Math.max(toSec(lastTick), ...notes.map((n) => n.time + n.dur), 0);
  for (const tr of raw) {
    const mine = notes.filter((n) => n.track === tr.index);
    const chans = [...tr.channels].sort((a, x) => a - x);
    const isDrum = chans.includes(DRUM_CHANNEL) || /drum|kit|perc/i.test(tr.name);
    tracks.push({
      index: tr.index,
      name: tr.name || (isDrum ? 'Drums' : chans.length ? GM_PROGRAMS[Math.floor((tr.program[chans[0]] ?? 0) / 8)] : `Track ${tr.index + 1}`),
      channels: chans,
      notes: mine.length,
      low: mine.length ? Math.min(...mine.map((n) => n.note)) : 0,
      high: mine.length ? Math.max(...mine.map((n) => n.note)) : 0,
      isDrum,
    });
  }
  const tempo = Math.round((60e6 / tempos[0].us) * 100) / 100;
  return { format, ppq, smpte, tracks, notes, tempos, timeSigs, tempo, duration, bars: barsOf(timeSigs, ppq, lastTick, toSec, smpte), toSec };
}

function findTag(b, t) {
  for (let i = 0; i + 4 <= b.length; i++) if (b[i] === t.charCodeAt(0) && b[i + 1] === t.charCodeAt(1) && b[i + 2] === t.charCodeAt(2) && b[i + 3] === t.charCodeAt(3)) return i;
  return -1;
}
function utf8(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return String.fromCharCode(...bytes);
  }
}

/** Bars from the time signatures: [{ index, time, duration }] (4/4 when the file has none). */
function barsOf(timeSigs, ppq, lastTick, toSec, smpte) {
  if (smpte || !ppq) return [];
  const sigs = [...timeSigs].sort((a, b) => a.tick - b.tick);
  if (!sigs.length || sigs[0].tick > 0) sigs.unshift({ tick: 0, num: 4, den: 4 });
  const bars = [];
  let tick = 0;
  let i = 0;
  while (tick <= lastTick && bars.length < 5000) {
    while (i + 1 < sigs.length && sigs[i + 1].tick <= tick) i++;
    const len = Math.max(1, Math.round((ppq * 4 * sigs[i].num) / sigs[i].den));
    const t0 = toSec(tick);
    bars.push({ index: bars.length, time: t0, duration: toSec(tick + len) - t0 });
    tick += len;
  }
  return bars;
}

/** How often each note is played: Map(note -> count), on `channels` (all when null). */
export function noteCounts(midi, { channels = null, tracks = null } = {}) {
  const m = new Map();
  for (const n of midi.notes) {
    if (channels && !channels.includes(n.ch)) continue;
    if (tracks && !tracks.includes(n.track)) continue;
    m.set(n.note, (m.get(n.note) || 0) + 1);
  }
  return m;
}

/** The channels that carry drums: channel 10 when the file uses it, else every channel with notes. */
export function drumChannels(midi) {
  const used = [...new Set(midi.notes.map((n) => n.ch))].sort((a, b) => a - b);
  return used.includes(DRUM_CHANNEL) ? [DRUM_CHANNEL] : used;
}

/**
 * A copy of the file with note numbers changed by `map` (Map(note -> newNote | null)) on `channels`.
 * A note mapped to null is silenced: its note-on gets velocity 0, which every player reads as a note-off.
 * Note-offs and aftertouch move with their notes. Nothing else in the file changes.
 */
export function remapMidi(bytes, map, { channels = null } = {}) {
  const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const out = new Uint8Array(src);
  const midi = parseMidi(src);
  // every note event, not just paired notes (note-offs and aftertouch carry the number too)
  const events = rawNoteEvents(src);
  let changed = 0;
  let silenced = 0;
  for (const e of events) {
    if (channels && !channels.includes(e.ch)) continue;
    if (!map.has(e.note)) continue;
    const to = map.get(e.note);
    if (to == null) {
      if (e.kind === 0x90 && e.vel > 0) {
        out[e.at + 1] = 0;
        silenced++;
      }
      continue;
    }
    if (to !== e.note) {
      out[e.at] = to & 0x7f;
      if (e.kind === 0x90 && e.vel > 0) changed++;
    }
  }
  return { bytes: out, changed, silenced, notes: midi.notes.length };
}

/** Every note-on, note-off and aftertouch with its byte offset (a light second pass over the file). */
function rawNoteEvents(b) {
  const out = [];
  let p = findTag(b, 'MThd');
  if (p < 0) return out;
  p += 8;
  p += 6;
  while (p + 8 <= b.length) {
    const t = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]);
    const len = ((b[p + 4] << 24) | (b[p + 5] << 16) | (b[p + 6] << 8) | b[p + 7]) >>> 0;
    p += 8;
    const end = Math.min(b.length, p + len);
    if (t !== 'MTrk') {
      p = end;
      continue;
    }
    let status = 0;
    while (p < end) {
      for (let k = 0; k < 4; k++) if (!(b[p++] & 0x80)) break;
      let s = b[p];
      if (s & 0x80) p++;
      else s = status;
      if (s === 0xff) {
        p++;
        let n = 0;
        for (let k = 0; k < 4; k++) {
          const c = b[p++];
          n = (n << 7) | (c & 0x7f);
          if (!(c & 0x80)) break;
        }
        p += n;
        continue;
      }
      if (s === 0xf0 || s === 0xf7) {
        let n = 0;
        for (let k = 0; k < 4; k++) {
          const c = b[p++];
          n = (n << 7) | (c & 0x7f);
          if (!(c & 0x80)) break;
        }
        p += n;
        continue;
      }
      status = s;
      const kind = s & 0xf0;
      if (kind === 0xc0 || kind === 0xd0) {
        p += 1;
        continue;
      }
      if (kind === 0x80 || kind === 0x90 || kind === 0xa0) out.push({ kind, ch: s & 0x0f, note: b[p], vel: b[p + 1], at: p });
      p += 2;
    }
    p = end;
  }
  return out;
}

/**
 * A small SMF (format 1, one track per entry) from notes, for tests and for saving a converted chart:
 * tracks: [{ name, ch, notes: [{ tick, note, vel, len }] }], bpm.
 */
export function writeMidi(tracks, { ppq = 480, bpm = 120 } = {}) {
  const bytes = [];
  const push = (...x) => bytes.push(...x);
  const u32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const vlqBytes = (v) => {
    const s = [v & 0x7f];
    while ((v >>= 7)) s.unshift((v & 0x7f) | 0x80);
    return s;
  };
  push(0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, 1, 0, tracks.length + 1, (ppq >> 8) & 255, ppq & 255);
  const chunk = (body) => push(0x4d, 0x54, 0x72, 0x6b, ...u32(body.length), ...body);
  const us = Math.round(60e6 / bpm);
  chunk([0, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255, 0, 0xff, 0x58, 4, 4, 2, 24, 8, 0, 0xff, 0x2f, 0]);
  for (const tr of tracks) {
    const ev = [];
    for (const n of tr.notes) {
      ev.push([n.tick, 0x90 | tr.ch, n.note, n.vel ?? 100]);
      ev.push([n.tick + (n.len ?? ppq / 4), 0x80 | tr.ch, n.note, 0]);
    }
    ev.sort((a, b) => a[0] - b[0] || (a[1] & 0xf0) - (b[1] & 0xf0));
    const body = [];
    const name = new TextEncoder().encode(tr.name || '');
    body.push(0, 0xff, 0x03, ...vlqBytes(name.length), ...name);
    let last = 0;
    for (const [tick, s, d1, d2] of ev) {
      body.push(...vlqBytes(tick - last), s, d1, d2);
      last = tick;
    }
    body.push(0, 0xff, 0x2f, 0);
    chunk(body);
  }
  return new Uint8Array(bytes);
}
