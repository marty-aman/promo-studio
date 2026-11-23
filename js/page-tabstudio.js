// Tab Studio: a full page for editing Guitar Pro tabs (all tracks stacked, keyboard editing, playback)
// and for making tabs from stems. Saves as a new .gp file in your media so the video's tab and drum
// layers can use it.
import { h, icon, button, toast, field, pickFiles } from './dom.js';
import { media, addMedia } from './media.js';
import { uid } from './core.js';
import { defaultTabLayer } from './tab.js';
import { drumHitsFromAudio } from './drums.js';
import { TAB_ACCEPT } from './panel-layers.js';
import * as E from './tabedit.js';
import { TRANSCRIBE_KINDS, decodeStem, gridFromSamples, transcribeSamples, drumsToTrack } from './transcribe.js';

// kept while the app is open, so leaving the page and coming back keeps your work
const S = {
  model: null,
  sourceId: null, // media id the model was opened from
  savedId: null, // media id of the last save
  sel: { track: 0, bar: 0, beat: 0, key: 1 }, // key: string (fretted) or GM drum number
  undo: [],
  redo: [],
  dirty: false,
  typed: '',
  typedAt: 0,
  playing: false,
  playFrom: 0,
  muted: new Set(),
  stemPeaks: new Map(), // track id -> { peaks, duration }
  busy: '',
  showTx: false,
};

const BEAT_MIN = 26;
const ROW = 18;
const BAR_PAD = 12;
const beatW = (b) => Math.round(BEAT_MIN + 30 * Math.sqrt(E.beatQuarters(b)));
const DRUM_ROWS = [49, 51, 42, 46, 38, 48, 45, 41, 36];
const drumName = (m) => (E.DRUM_PIECES.find((p) => p[0] === m) || [m, `Drum ${m}`])[1];
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const stringName = (track, s) => NOTE[track.tuning[s - 1] % 12];
const slug = (s) => String(s || 'tab').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tab';

function snapshot() {
  S.undo.push(JSON.stringify(S.model));
  if (S.undo.length > 200) S.undo.shift();
  S.redo.length = 0;
  S.dirty = true;
}

/** Bar layout for a track: [{ x, w, beats: [{ x, w }] }] and total width. */
function layoutTrack(track) {
  let x = 44;
  const bars = track.bars.map((bar) => {
    const bx = x;
    let cx = bx + BAR_PAD;
    const beats = bar.beats.map((b) => {
      const w = beatW(b);
      const out = { x: cx, w };
      cx += w;
      return out;
    });
    x = cx + 4;
    return { x: bx, w: x - bx, beats };
  });
  return { bars, width: x + 40 };
}

/** Loudness per bin, 0..1, for the waveform under a transcribed track. */
function peaksOf(samples, bins) {
  const out = new Float32Array(bins);
  const per = samples.length / bins;
  let max = 1e-6;
  for (let i = 0; i < bins; i++) {
    let m = 0;
    for (let k = Math.floor(i * per); k < Math.floor((i + 1) * per); k++) m = Math.max(m, Math.abs(samples[k]));
    out[i] = m;
    max = Math.max(max, m);
  }
  for (let i = 0; i < bins; i++) out[i] /= max;
  return out;
}

const rowsFor = (track) => (track.kind === 'drums' ? DRUM_ROWS : track.tuning.map((_, i) => i + 1));

let audioCtx = null;
function ctx() {
  audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

/** A short plucked or drum sound at `when`. */
function voice(ac, out, when, track, n, dur) {
  if (track.kind === 'drums') {
    const len = n.m === 36 ? 0.3 : n.m === 38 ? 0.18 : 0.08;
    const g = ac.createGain();
    g.gain.setValueAtTime(n.m === 36 ? 0.9 : 0.45, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + len);
    g.connect(out);
    if (n.m === 36 || (n.m >= 41 && n.m <= 48)) {
      const o = ac.createOscillator();
      o.frequency.setValueAtTime(n.m === 36 ? 110 : 160 + (n.m - 41) * 15, when);
      o.frequency.exponentialRampToValueAtTime(n.m === 36 ? 45 : 90, when + len);
      o.connect(g);
      o.start(when);
      o.stop(when + len);
    } else {
      const b = ac.createBuffer(1, Math.ceil(ac.sampleRate * len), ac.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource();
      src.buffer = b;
      const f = ac.createBiquadFilter();
      f.type = n.m === 38 ? 'bandpass' : 'highpass';
      f.frequency.value = n.m === 38 ? 1800 : 7000;
      src.connect(f).connect(g);
      src.start(when);
    }
    return;
  }
  if (n.tech && n.tech.x) return;
  const hz = 440 * 2 ** ((E.notePitch(track, n) - 69) / 12);
  const o = ac.createOscillator();
  o.type = track.tuning.length <= 5 ? 'triangle' : 'sawtooth';
  o.frequency.setValueAtTime(hz, when);
  if (n.tech && n.tech.b) o.frequency.linearRampToValueAtTime(hz * 2 ** (2 / 12), when + Math.min(0.25, dur * 0.6));
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(n.tech && n.tech.pm ? 700 : 3200, when);
  f.frequency.exponentialRampToValueAtTime(400, when + Math.max(0.1, dur));
  const g = ac.createGain();
  const vol = n.tech && n.tech.g ? 0.05 : 0.14;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(vol, when + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, when + Math.max(0.12, Math.min(dur, n.tech && n.tech.pm ? 0.15 : 2)));
  o.connect(f).connect(g).connect(out);
  o.start(when);
  o.stop(when + Math.max(0.15, Math.min(dur, 2)) + 0.05);
}

/** Open a Guitar Pro / MusicXML file from the media library in Tab Studio (next time the page shows). */
export function openInTabStudio(rec, offset = 0) {
  if (!rec || !rec.score) return false;
  S.model = E.fromScore(rec.score);
  E.alignTracks(S.model);
  S.model.offset = offset;
  S.sourceId = rec.id;
  S.sel = { track: 0, bar: 0, beat: 0, key: 1 };
  S.undo = [];
  S.redo = [];
  return true;
}

export function buildTabStudio({ store, engine, ui, panels }) {
  const root = h('div', { class: 'page tab-studio' });
  const status = h('p', { class: 'ts-status', role: 'status', 'aria-live': 'polite' });
  let canvases = [];
  let raf = 0;
  let playNodes = null;

  const tabFiles = () => media.all().filter((m) => m.kind === 'tab');
  const audioFiles = () => media.all().filter((m) => m.kind === 'audio');
  const track = () => S.model && S.model.tracks[S.sel.track];

  function open(rec) {
    if (!rec || !rec.score) return toast('That file isn’t loaded yet.', 'error');
    if (S.dirty && !confirm('Open another file? Unsaved changes here will be lost.')) return;
    S.model = E.fromScore(rec.score);
    E.alignTracks(S.model);
    S.sourceId = rec.id;
    S.savedId = null;
    S.undo = [];
    S.redo = [];
    S.dirty = false;
    S.sel = { track: 0, bar: 0, beat: 0, key: S.model.tracks[0] && S.model.tracks[0].kind === 'drums' ? 36 : 1 };
    render();
  }
  function fresh() {
    if (S.dirty && !confirm('Start a new tab? Unsaved changes here will be lost.')) return;
    const p = store.get();
    S.model = E.newSong({ title: p.endCard.title && p.endCard.title !== 'Song Title' ? p.endCard.title : 'New tab', tempo: p.beats ? Math.round(p.beats.bpm) : 120 });
    S.sourceId = null;
    S.savedId = null;
    S.undo = [];
    S.redo = [];
    S.dirty = false;
    S.sel = { track: 0, bar: 0, beat: 0, key: 1 };
    render();
  }

  // ------------------------------------------------------------ editing

  function clampSel() {
    const m = S.model;
    S.sel.track = Math.max(0, Math.min(m.tracks.length - 1, S.sel.track));
    const t = track();
    S.sel.bar = Math.max(0, Math.min(t.bars.length - 1, S.sel.bar));
    S.sel.beat = Math.max(0, Math.min(t.bars[S.sel.bar].beats.length - 1, S.sel.beat));
    const rows = rowsFor(t);
    if (!rows.includes(S.sel.key)) S.sel.key = rows[t.kind === 'drums' ? rows.length - 1 : 0];
  }

  function describe() {
    const t = track();
    if (!t) return '';
    const b = E.beatAt(t, S.sel.bar, S.sel.beat);
    const note = t.kind === 'drums' ? (b.notes.some((n) => n.m === S.sel.key) ? 'hit' : 'empty') : (() => {
      const n = b.notes.find((x) => x.s === S.sel.key);
      return n ? `fret ${n.tech.x ? 'x (dead)' : n.f}${Object.keys(n.tech).length ? ` · ${Object.keys(n.tech).map((k) => E.TECHS.find((x) => x[0] === k)[1].toLowerCase()).join(', ')}` : ''}` : 'empty';
    })();
    const len = `${b.dot ? 'dotted ' : ''}${{ 1: 'whole', 2: 'half', 4: 'quarter', 8: 'eighth', 16: 'sixteenth', 32: '32nd' }[b.dur]}${b.rest ? ' rest' : ''}`;
    const row = t.kind === 'drums' ? drumName(S.sel.key) : `${stringName(t, S.sel.key)} string`;
    return `${t.name} · bar ${S.sel.bar + 1} · beat ${S.sel.beat + 1} (${len}) · ${row}: ${note}`;
  }

  function edit(fn, { quiet = false } = {}) {
    snapshot();
    const ok = fn();
    if (ok === false) {
      S.undo.pop();
      if (!quiet) toast('That doesn’t fit in the bar. Shorten another beat first or add a bar.', 'error');
    }
    clampSel();
    draw();
    paintTools();
  }

  const moveBeat = (d) => {
    const t = track();
    let { bar, beat } = S.sel;
    beat += d;
    if (beat < 0) {
      if (bar > 0) {
        bar--;
        beat = t.bars[bar].beats.length - 1;
      } else beat = 0;
    } else if (beat >= t.bars[bar].beats.length) {
      if (bar < t.bars.length - 1) {
        bar++;
        beat = 0;
      } else beat = t.bars[bar].beats.length - 1;
    }
    S.sel.bar = bar;
    S.sel.beat = beat;
    S.typed = '';
  };
  const moveRow = (d) => {
    const rows = rowsFor(track());
    const i = rows.indexOf(S.sel.key);
    const j = Math.max(0, Math.min(rows.length - 1, i + d));
    if (j === i && d) {
      // past the edge: go to the neighbouring track
      const nt = S.sel.track + d;
      if (nt >= 0 && nt < S.model.tracks.length) {
        S.sel.track = nt;
        const r2 = rowsFor(track());
        S.sel.key = d > 0 ? r2[0] : r2[r2.length - 1];
        clampSel();
      }
      return;
    }
    S.sel.key = rows[j];
  };

  const ops = {
    dur: (d) => edit(() => E.setDuration(track(), S.sel.bar, S.sel.beat, d, S.model.ts)),
    longer: () => {
      const b = E.beatAt(track(), S.sel.bar, S.sel.beat);
      if (b.dur > 1) ops.dur(b.dur / 2);
    },
    shorter: () => {
      const b = E.beatAt(track(), S.sel.bar, S.sel.beat);
      if (b.dur < 32) ops.dur(b.dur * 2);
    },
    dot: () => edit(() => E.toggleDot(track(), S.sel.bar, S.sel.beat, S.model.ts)),
    rest: () => edit(() => E.toggleRest(track(), S.sel.bar, S.sel.beat)),
    insert: () => edit(() => {
      const k = E.insertBeat(track(), S.sel.bar, S.sel.beat, S.model.ts);
      if (k === S.sel.beat) return false;
      S.sel.beat = k;
    }),
    remove: () => edit(() => (S.sel.beat = E.deleteBeat(track(), S.sel.bar, S.sel.beat))),
    clear: () => edit(() => E.clearNote(track(), S.sel.bar, S.sel.beat, S.sel.key)),
    tech: (k) => {
      if (track().kind === 'drums') return;
      const n = E.beatAt(track(), S.sel.bar, S.sel.beat).notes.find((x) => x.s === S.sel.key);
      if (!n) return toast('Type a fret first, then add the technique.', 'error');
      edit(() => E.toggleTech(track(), S.sel.bar, S.sel.beat, S.sel.key, k));
    },
    drum: (m) => {
      if (m) S.sel.key = m;
      edit(() => E.toggleDrum(track(), S.sel.bar, S.sel.beat, S.sel.key));
    },
    addBar: () => edit(() => {
      E.insertBars(S.model, S.sel.bar, 1);
      S.sel.bar++;
      S.sel.beat = 0;
    }),
    delBar: () => edit(() => E.deleteBar(S.model, S.sel.bar)),
    undo: () => {
      if (!S.undo.length) return;
      S.redo.push(JSON.stringify(S.model));
      S.model = JSON.parse(S.undo.pop());
      S.dirty = true;
      render();
    },
    redo: () => {
      if (!S.redo.length) return;
      S.undo.push(JSON.stringify(S.model));
      S.model = JSON.parse(S.redo.pop());
      S.dirty = true;
      render();
    },
  };

  function typeFret(digit) {
    const t = track();
    if (t.kind === 'drums') return;
    const now = performance.now();
    const two = S.typed && now - S.typedAt < 700 && Number(S.typed + digit) <= 24;
    S.typed = two ? S.typed + digit : String(digit);
    S.typedAt = now;
    const fret = Number(S.typed);
    // a second digit corrects the note just typed, so it shares that undo step
    if (two) S.undo.pop();
    edit(() => E.setFret(t, S.sel.bar, S.sel.beat, S.sel.key, fret));
    // 3-9 (and any second digit) can't start a two-digit fret, so the next digit starts a new one
    if (two || fret >= 3) S.typed = '';
  }

  function onKey(e) {
    if (!S.model) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (mod && k.toLowerCase() === 'z') return handled(), e.shiftKey ? ops.redo() : ops.undo();
    if (mod && k.toLowerCase() === 'y') return handled(), ops.redo();
    if (mod) return;
    if (/^[0-9]$/.test(k)) return handled(), typeFret(Number(k));
    const tech = E.TECHS.find((x) => x[2].toLowerCase() === k.toLowerCase());
    const map = {
      ArrowLeft: () => moveBeat(-1),
      ArrowRight: () => moveBeat(1),
      ArrowUp: () => moveRow(-1),
      ArrowDown: () => moveRow(1),
      Backspace: ops.clear,
      Delete: e.shiftKey ? ops.remove : ops.clear,
      Insert: ops.insert,
      i: ops.insert,
      '+': ops.longer,
      '=': ops.longer,
      '-': ops.shorter,
      '.': ops.dot,
      r: ops.rest,
      Enter: () => (track().kind === 'drums' ? ops.drum() : moveBeat(1)),
      ' ': () => togglePlay(),
      Home: () => ((S.sel.bar = 0), (S.sel.beat = 0)),
      End: () => ((S.sel.bar = track().bars.length - 1), (S.sel.beat = 0)),
    };
    if (map[k]) {
      handled();
      map[k]();
      clampSel();
      draw();
      paintTools();
      scrollToSel();
      return;
    }
    if (tech && track().kind === 'fretted') {
      handled();
      ops.tech(tech[0]);
    }
  }

  // ------------------------------------------------------------ drawing

  function drawTrack(ti) {
    const c = canvases[ti];
    if (!c) return;
    const t = S.model.tracks[ti];
    const lay = c._layout;
    const scroller = c._scroller;
    const W = scroller.clientWidth || 800;
    const rows = rowsFor(t);
    const stem = S.stemPeaks.get(t.id);
    const H = rows.length * ROW + 30 + (stem ? 40 : 0);
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      c.style.width = `${W}px`;
      c.style.height = `${H}px`;
    }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(root);
    const col = (v, d) => css.getPropertyValue(v).trim() || d;
    const fg = col('--text', '#ececf1');
    const muted = col('--muted', '#9a9daa');
    const accent = col('--accent', '#ffd400');
    g.fillStyle = col('--panel', '#16171d');
    g.fillRect(0, 0, W, H);
    const sx = scroller.scrollLeft;
    const top = 20;
    const yOf = (key) => top + rows.indexOf(key) * ROW + ROW / 2;
    // string / drum rows
    g.strokeStyle = 'rgba(160,160,180,0.35)';
    g.lineWidth = 1;
    rows.forEach((r, i) => {
      const y = top + i * ROW + ROW / 2;
      g.beginPath();
      g.moveTo(0, y + 0.5);
      g.lineTo(W, y + 0.5);
      g.stroke();
    });
    // labels (fixed at the left)
    g.font = '600 11px Inter, system-ui, sans-serif';
    g.textBaseline = 'middle';
    // bars
    g.save();
    g.translate(-sx, 0);
    const selected = ti === S.sel.track;
    lay.bars.forEach((bl, bi) => {
      if (bl.x + bl.w < sx || bl.x > sx + W) return;
      g.strokeStyle = 'rgba(200,200,220,0.6)';
      g.beginPath();
      g.moveTo(bl.x + 0.5, top);
      g.lineTo(bl.x + 0.5, top + rows.length * ROW);
      g.stroke();
      g.fillStyle = muted;
      g.textAlign = 'left';
      g.fillText(String(bi + 1), bl.x + 3, 9);
      if (S.model.tempos && S.model.tempos[bi]) {
        g.fillStyle = accent;
        g.fillText(`♩=${S.model.tempos[bi]}`, bl.x + 22, 9);
      }
      const over = E.barFill(t.bars[bi]) - E.barQuarters(S.model.ts);
      if (Math.abs(over) > 1e-9) {
        g.fillStyle = over > 0 ? 'rgba(255,92,108,0.18)' : 'rgba(255,212,0,0.08)';
        g.fillRect(bl.x + 1, top, bl.w - 4, rows.length * ROW);
      }
      bl.beats.forEach((bt, ki) => {
        const b = t.bars[bi].beats[ki];
        const isSel = selected && S.sel.bar === bi && S.sel.beat === ki;
        if (isSel) {
          g.fillStyle = 'rgba(255,212,0,0.14)';
          g.fillRect(bt.x, top - 2, bt.w - 2, rows.length * ROW + 4);
          g.strokeStyle = accent;
          g.lineWidth = 2;
          g.strokeRect(bt.x + 1, yOf(S.sel.key) - ROW / 2 + 1, bt.w - 4, ROW - 2);
          g.lineWidth = 1;
        }
        // duration tick under the staff
        g.fillStyle = muted;
        g.textAlign = 'center';
        g.font = '10px Inter, system-ui, sans-serif';
        const dl = { 1: '𝅝', 2: '𝅗𝅥', 4: '♩', 8: '♪', 16: '𝅘𝅥𝅯', 32: '𝅘𝅥𝅰' }[b.dur] || '';
        g.fillText(`${dl}${b.dot ? '.' : ''}`, bt.x + bt.w / 2, top + rows.length * ROW + 8);
        if (b.rest) {
          g.fillStyle = muted;
          g.font = '600 12px Inter, system-ui, sans-serif';
          g.fillText('–', bt.x + bt.w / 2, top + (rows.length * ROW) / 2);
          return;
        }
        for (const n of b.notes) {
          const key = t.kind === 'drums' ? n.m : n.s;
          if (!rows.includes(key)) continue;
          const y = yOf(key);
          if (t.kind === 'drums') {
            g.fillStyle = fg;
            g.beginPath();
            if (n.m === 42 || n.m === 46 || n.m === 49 || n.m === 51 || n.m === 57) {
              g.font = '700 13px Inter, system-ui, sans-serif';
              g.fillText('x', bt.x + bt.w / 2, y + 1);
            } else {
              g.arc(bt.x + bt.w / 2, y, 5, 0, Math.PI * 2);
              g.fill();
            }
            continue;
          }
          const label = n.tech.x ? 'x' : n.tech.g ? `(${n.f})` : String(n.f);
          g.font = '700 12px Inter, system-ui, sans-serif';
          const tw = g.measureText(label).width + 6;
          g.fillStyle = col('--panel', '#16171d');
          g.fillRect(bt.x + bt.w / 2 - tw / 2, y - 7, tw, 14);
          g.fillStyle = fg;
          g.fillText(label, bt.x + bt.w / 2, y + 1);
          const marks = ['h', 'sl', 'b', 'v', 'pm'].filter((k) => n.tech[k]).map((k) => ({ h: 'h', sl: '/', b: '↗', v: '~', pm: 'PM' })[k]);
          if (marks.length) {
            g.font = '600 9px Inter, system-ui, sans-serif';
            g.fillStyle = accent;
            g.fillText(marks.join(''), bt.x + bt.w / 2 + tw / 2 + 2, y - 7);
          }
        }
      });
    });
    // last bar line
    const last = lay.bars[lay.bars.length - 1];
    if (last) {
      g.strokeStyle = 'rgba(200,200,220,0.6)';
      g.beginPath();
      g.moveTo(last.x + last.w, top);
      g.lineTo(last.x + last.w, top + rows.length * ROW);
      g.stroke();
    }
    // stem waveform under transcribed tracks, aligned to the bars
    if (stem && S.model.offset != null) {
      const y0 = top + rows.length * ROW + 16;
      const times = E.barTimes(S.model).bars;
      g.fillStyle = 'rgba(74,222,128,0.55)';
      lay.bars.forEach((bl, bi) => {
        if (bl.x + bl.w < sx || bl.x > sx + W || !times[bi]) return;
        const t0 = S.model.offset + times[bi].time;
        const t1 = S.model.offset + (times[bi + 1] ? times[bi + 1].time : times[bi].time + E.barQuarters(S.model.ts) * times[bi].spq);
        for (let px = 0; px < bl.w; px += 2) {
          const tt = t0 + ((t1 - t0) * px) / bl.w;
          const i = Math.floor((tt / stem.duration) * stem.peaks.length);
          const v = stem.peaks[i] || 0;
          g.fillRect(bl.x + px, y0 + 12 - v * 12, 1.5, Math.max(1, v * 24));
        }
      });
    }
    // playback cursor
    if (S.playing && S.cursor && S.cursor.track === ti) {
      const bt = lay.bars[S.cursor.bar] && lay.bars[S.cursor.bar].beats[S.cursor.beat];
      if (bt) {
        g.fillStyle = 'rgba(79,140,255,0.35)';
        g.fillRect(bt.x, top - 4, bt.w - 2, rows.length * ROW + 8);
      }
    }
    g.restore();
    // row labels drawn last, on a solid strip
    g.fillStyle = col('--panel-2', '#1d1f27');
    g.fillRect(0, top - 2, 40, rows.length * ROW + 4);
    g.textAlign = 'center';
    g.font = '700 11px Inter, system-ui, sans-serif';
    rows.forEach((r) => {
      g.fillStyle = selected && r === S.sel.key ? accent : muted;
      g.fillText(t.kind === 'drums' ? drumName(r).split(' ')[0].slice(0, 5) : stringName(t, r), 20, yOf(r));
    });
  }

  function draw() {
    if (!S.model) return;
    canvases.forEach((c, i) => {
      c._layout = layoutTrack(S.model.tracks[i]);
      c._spacer.style.width = `${c._layout.width}px`;
      drawTrack(i);
    });
    status.textContent = describe();
    paintIssues();
  }

  function scrollToSel() {
    const c = canvases[S.sel.track];
    if (!c) return;
    const bt = c._layout.bars[S.sel.bar] && c._layout.bars[S.sel.bar].beats[S.sel.beat];
    if (!bt) return;
    const sc = c._scroller;
    if (bt.x < sc.scrollLeft + 50) sc.scrollLeft = Math.max(0, bt.x - 60);
    else if (bt.x + bt.w > sc.scrollLeft + sc.clientWidth - 20) sc.scrollLeft = bt.x + bt.w - sc.clientWidth + 60;
    // keep all tracks scrolled together
    canvases.forEach((o) => o !== c && (o._scroller.scrollLeft = sc.scrollLeft));
  }

  function hit(ti, ev) {
    const c = canvases[ti];
    const r = c.getBoundingClientRect();
    const x = ev.clientX - r.left + c._scroller.scrollLeft;
    const y = ev.clientY - r.top;
    const t = S.model.tracks[ti];
    const rows = rowsFor(t);
    const ri = Math.floor((y - 20) / ROW);
    if (ri < 0 || ri >= rows.length) return null;
    for (let bi = 0; bi < c._layout.bars.length; bi++) {
      const bl = c._layout.bars[bi];
      if (x < bl.x || x > bl.x + bl.w) continue;
      for (let ki = 0; ki < bl.beats.length; ki++) {
        const bt = bl.beats[ki];
        if (x >= bt.x && x < bt.x + bt.w) return { track: ti, bar: bi, beat: ki, key: rows[ri] };
      }
      return { track: ti, bar: bi, beat: bl.beats.length - 1, key: rows[ri] };
    }
    return null;
  }

  // ------------------------------------------------------------ playback

  function stopPlay() {
    S.playing = false;
    cancelAnimationFrame(raf);
    if (playNodes) {
      try {
        playNodes.out.disconnect();
      } catch {
        /* gone */
      }
      playNodes = null;
    }
    S.cursor = null;
    paintTools();
    draw();
  }
  function togglePlay() {
    if (S.playing) return stopPlay();
    const ac = ctx();
    ac.resume();
    const sch = E.schedule(S.model);
    const startT = (E.barTimes(S.model).bars[S.sel.bar] || { time: 0 }).time;
    const out = ac.createGain();
    out.gain.value = 0.8;
    out.connect(ac.destination);
    const t0 = ac.currentTime + 0.08;
    for (const ev of sch.events) {
      if (ev.time < startT - 1e-6 || S.muted.has(S.model.tracks[ev.track].id)) continue;
      for (const n of ev.notes) voice(ac, out, t0 + ev.time - startT, S.model.tracks[ev.track], n, ev.dur);
    }
    playNodes = { out };
    S.playing = true;
    paintTools();
    const tick = () => {
      if (!S.playing) return;
      if (!root.isConnected) return stopPlay();
      const t = ac.currentTime - t0 + startT;
      if (t > sch.duration) return stopPlay();
      S.cursor = { track: S.sel.track, ...E.beatAtTime(S.model, S.sel.track, Math.max(0, t)) };
      drawTrack(S.sel.track);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  // ------------------------------------------------------------ save / use

  async function save({ use = false } = {}) {
    const issues = E.checkModel(S.model);
    if (issues.some((i) => !i.short)) return toast(`Fix first: ${issues.find((i) => !i.short).message}.`, 'error');
    for (const t of S.model.tracks) for (const bar of t.bars) E.padBar(bar, S.model.ts);
    try {
      const bytes = await E.toGpBytes(S.model);
      const file = new File([bytes], `${slug(S.model.title)}${S.savedId || S.sourceId ? '-edit' : ''}.gp`, { type: 'application/octet-stream' });
      const rec = await addMedia(file, file.name);
      S.savedId = rec.id;
      S.dirty = false;
      toast(`Saved “${file.name}” to your media.${use ? '' : ' Use it from the Guitar Pro tab, or press “Use in video”.'}`, 'info', 5000);
      if (use) useInVideo(rec);
      render();
      return rec;
    } catch (e) {
      toast(e.message, 'error', 6000);
    }
  }

  function useInVideo(rec) {
    const tabTracks = rec.tracks || [];
    const drumTracks = rec.drumTracks || [];
    const offset = S.model.offset != null ? S.model.offset : null;
    store.update((d) => {
      d.layers ||= [];
      const ofs = offset != null ? offset : d.song ? d.song.offset : 0;
      tabTracks.forEach((tr, i) => {
        const existing = d.layers.find((l) => l.type === 'tab' && l.mediaId === S.sourceId && l.track === tr.index);
        const L = existing || d.layers.find((l) => l.type === 'tab' && !l.mediaId);
        if (L) Object.assign(L, { mediaId: rec.id, track: tr.index, visible: true, ...(offset != null ? { offset: ofs } : {}) });
        else if (i < 3) d.layers.push({ ...defaultTabLayer(), id: uid('lyr'), type: 'tab', name: tr.name || 'Tab', visible: true, mediaId: rec.id, track: tr.index, offset: ofs });
      });
      drumTracks.forEach((tr) => {
        const L = d.layers.find((l) => l.type === 'drums' && l.source === 'gp' && (l.mediaId === S.sourceId || !l.mediaId));
        if (L) Object.assign(L, { mediaId: rec.id, track: tr.index, visible: true, ...(offset != null ? { offset: ofs } : {}) });
      });
    });
    toast('The Video Studio edit now uses this tab. In the Video Studio, Ctrl+Z goes back.', 'info', 4500);
  }

  // ------------------------------------------------------------ transcription

  async function transcribe(form) {
    const rec = media.get(form.stem.value);
    if (!rec) return toast('Pick a stem first.', 'error');
    const kind = form.kind.value;
    const p = store.get();
    S.busy = `Listening to “${rec.name}”…`;
    render();
    try {
      const { samples, sr, duration } = await decodeStem(rec.blob);
      // the song's beat grid when we have it (stems line up with the song), otherwise the stem's own
      const songBeats = p.beats && p.beats.beats && p.beats.beats.length;
      const grid = form.grid.value === 'song' && songBeats ? { bpm: p.beats.bpm, firstBeat: p.beats.beats[0], ts: S.model ? S.model.ts : [4, 4] } : { ...gridFromSamples(samples, sr), ts: S.model ? S.model.ts : [4, 4] };
      let res;
      if (kind === 'drums') {
        const hits = await drumHitsFromAudio(rec.blob);
        res = drumsToTrack(hits.hits, grid);
      } else {
        const tuning = E.TUNINGS[form.tuning.value];
        res = transcribeSamples(samples, sr, kind, grid, { tuning });
      }
      if (!res.stats.notes) throw new Error('No notes found. Is this an isolated stem with the part playing?');
      // peaks for the waveform under the track
      const t = { id: `trk-${Date.now().toString(36)}`, ...res.track, stemId: rec.id };
      S.stemPeaks.set(t.id, { peaks: peaksOf(samples, 1600), duration });
      if (!S.model || !S.dirty && !S.sourceId && S.model.tracks.every((x) => x.bars.every((b) => b.beats.every((k) => k.rest)))) {
        S.model = { title: p.endCard.title && p.endCard.title !== 'Song Title' ? p.endCard.title : 'From stems', tempo: Math.round(grid.bpm), ts: grid.ts, tempos: {}, offset: res.offset, tracks: [t] };
        S.sourceId = null;
        S.undo = [];
      } else {
        snapshot();
        const barLen = E.barQuarters(S.model.ts) * (60 / S.model.tempo);
        if (S.model.offset == null) S.model.offset = res.offset;
        const shift = Math.round((res.offset - S.model.offset) / barLen);
        if (shift > 0) t.bars.unshift(...Array.from({ length: shift }, () => E.emptyBar(S.model.ts)));
        else if (shift < 0) {
          S.model.tracks.forEach((x) => x.bars.unshift(...Array.from({ length: -shift }, () => E.emptyBar(S.model.ts))));
          S.model.offset = +(S.model.offset + shift * barLen).toFixed(3);
        }
        S.model.tracks.push(t);
        E.alignTracks(S.model);
      }
      S.sel = { track: S.model.tracks.length - 1, bar: 0, beat: 0, key: t.kind === 'drums' ? 36 : 1 };
      S.dirty = true;
      S.showTx = false;
      toast(`${res.track.name}: ${res.stats.notes} ${kind === 'rhythm' ? `chord hits (${res.stats.chords.join(', ')})` : 'notes'} at ${Math.round(grid.bpm)} BPM. Play it back and fix anything that sounds off.`, 'info', 7000);
    } catch (e) {
      toast(e.message || 'Could not transcribe that file.', 'error', 6000);
    }
    S.busy = '';
    render();
  }

  function txPanel() {
    const stems = audioFiles();
    const p = store.get();
    const stem = h('select', { name: 'stem', 'aria-label': 'Stem' }, stems.map((m) => h('option', { value: m.id, selected: p.song && m.id === p.song.mediaId ? null : undefined }, m.name)));
    const kind = h('select', { name: 'kind', 'aria-label': 'Part' }, TRANSCRIBE_KINDS.map(([id, label]) => h('option', { value: id }, label)));
    const tuning = h('select', { name: 'tuning', 'aria-label': 'Tuning' }, Object.keys(E.TUNINGS).map((n) => h('option', { value: n }, n)));
    const grid = h('select', { name: 'grid', 'aria-label': 'Tempo from' },
      h('option', { value: 'song', disabled: !p.beats }, p.beats ? `The song’s detected tempo (${Math.round(p.beats.bpm)} BPM)` : 'The song’s tempo (run Detect BPM in Audio)'),
      h('option', { value: 'stem', selected: !p.beats }, 'Detect from this stem'));
    const pickTuning = () => (tuning.value = kind.value === 'bass' ? 'Bass · Standard E' : 'Guitar · Standard E');
    kind.addEventListener('change', pickTuning);
    tuning.disabled = false;
    const form = h('form', { class: 'tool-box ts-tx', onsubmit: (e) => (e.preventDefault(), transcribe(form)) },
      h('h4', {}, 'Make a tab from a stem'),
      h('p', { class: 'small' }, 'Upload an isolated stem (bass, lead guitar, rhythm guitar or drums) in the Video or Audio tab, then pick it here. Single-note parts come out best; chords become power-chord shapes with the chord names; drums give kick, snare and hi-hat. Then fix it by ear.'),
      stems.length ? null : h('p', { class: 'warn-list small' }, 'No audio files yet.'),
      h('div', { class: 'row' }, button('Upload stems', async () => {
        const files = await pickFiles('audio/*', true);
        if (files.length) await panels.importFiles(files);
        render();
      }, { iconName: 'upload', variant: 'ghost sm' })),
      h('div', { class: 'grid2' }, field('Stem', stem), field('Part', kind)),
      h('div', { class: 'grid2' }, field('Tuning', tuning), field('Tempo from', grid)),
      h('p', { class: 'muted tiny' }, 'Stems exported from your session start with the song, so the song’s tempo lines the tab up with the video.'),
      h('div', { class: 'row' }, button(S.busy ? S.busy : 'Transcribe', null, { iconName: 'wand', variant: 'primary', disabled: !!S.busy || !stems.length }), button('Close', () => ((S.showTx = false), render()), { variant: 'ghost sm' })),
    );
    form.querySelector('button.primary').type = 'submit';
    pickTuning();
    return form;
  }

  // ------------------------------------------------------------ toolbar & render

  const tools = h('div', { class: 'ts-tools', role: 'toolbar', 'aria-label': 'Edit the selected beat' });
  function paintTools() {
    if (!S.model) return tools.replaceChildren();
    const t = track();
    const b = E.beatAt(t, S.sel.bar, S.sel.beat);
    const tbtn = (label, title, fn, on = false, extra = '') => h('button', { type: 'button', class: `btn sm${on ? ' on' : ''} ${extra}`, title, 'aria-pressed': on ? 'true' : 'false', onclick: () => (fn(), canvases[S.sel.track] && canvases[S.sel.track].focus()) }, label);
    const n = t.kind === 'fretted' && b.notes.find((x) => x.s === S.sel.key);
    tools.replaceChildren(
      h('div', { class: 'ts-group', 'aria-label': 'Length' }, E.DURATIONS.map((d) => tbtn({ 1: '1/1', 2: '1/2', 4: '1/4', 8: '1/8', 16: '1/16', 32: '1/32' }[d], `${{ 1: 'Whole', 2: 'Half', 4: 'Quarter', 8: 'Eighth', 16: 'Sixteenth', 32: '32nd' }[d]} note (+ / − keys)`, () => ops.dur(d), b.dur === d)), tbtn('dot', 'Dotted (.)', ops.dot, b.dot), tbtn('rest', 'Rest (R)', ops.rest, b.rest)),
      t.kind === 'fretted'
        ? h('div', { class: 'ts-group', 'aria-label': 'Technique' }, E.TECHS.map(([k, label, key]) => tbtn(key, `${label} (${key})`, () => ops.tech(k), !!(n && n.tech[k]))))
        : h('div', { class: 'ts-group', 'aria-label': 'Drum hits' }, DRUM_ROWS.slice().reverse().map((m) => tbtn(drumName(m), `${drumName(m)} hit (select a row, Enter)`, () => ops.drum(m), b.notes.some((x) => x.m === m)))),
      h('div', { class: 'ts-group', 'aria-label': 'Beats and bars' }, tbtn('+ beat', 'Insert a beat after this one (I)', ops.insert), tbtn('− beat', 'Delete this beat (Shift+Delete)', ops.remove), tbtn('+ bar', 'Add a bar after this one', ops.addBar), tbtn('− bar', 'Delete this bar from every track', ops.delBar, false, 'danger')),
      h('div', { class: 'ts-group' }, tbtn('↶', 'Undo (Ctrl+Z)', ops.undo), tbtn('↷', 'Redo (Ctrl+Y)', ops.redo), tbtn(S.playing ? '■ Stop' : '▶ Play', 'Play from this bar (Space)', togglePlay, S.playing, 'primary')),
    );
  }

  const issuesEl = h('div', { class: 'ts-issues small' });
  function paintIssues() {
    const iss = S.model ? E.checkModel(S.model) : [];
    issuesEl.replaceChildren(...(iss.length ? [h('strong', {}, iss.some((i) => !i.short) ? 'Fix before saving: ' : 'Note: '), iss.slice(0, 4).map((i) => i.message).join('; '), iss.length > 4 ? ` and ${iss.length - 4} more` : ''] : []));
  }

  function trackBlock(t, ti) {
    const c = h('canvas', { class: 'ts-canvas', tabindex: 0, role: 'application', 'aria-roledescription': 'tab editor', 'aria-label': `${t.name} tab. Arrow keys move, digits type frets, + and − change length, I inserts a beat, R makes a rest, Space plays.` });
    // the spacer is as wide as the whole tab; the canvas sticks to the left and draws what's in view
    const spacer = h('div', { class: 'ts-spacer' }, c);
    const scroller = h('div', { class: 'ts-scroll' }, spacer);
    c._spacer = spacer;
    c._scroller = scroller;
    scroller.addEventListener('scroll', () => {
      drawTrack(ti);
      canvases.forEach((o, j) => {
        if (j !== ti && Math.abs(o._scroller.scrollLeft - scroller.scrollLeft) > 1) o._scroller.scrollLeft = scroller.scrollLeft;
      });
    });
    c.addEventListener('pointerdown', (ev) => {
      const at = hit(ti, ev);
      if (!at) return;
      S.sel = at;
      S.typed = '';
      c.focus();
      draw();
      paintTools();
    });
    c.addEventListener('dblclick', (ev) => {
      const at = hit(ti, ev);
      if (at && S.model.tracks[ti].kind === 'drums') ops.drum(at.key);
    });
    c.addEventListener('keydown', onKey);
    c.addEventListener('focus', () => {
      if (S.sel.track !== ti) {
        S.sel.track = ti;
        clampSel();
        draw();
        paintTools();
      }
    });
    canvases[ti] = c;
    const nameIn = h('input', { type: 'text', value: t.name, 'aria-label': 'Track name', class: 'ts-name' });
    nameIn.addEventListener('change', () => edit(() => (t.name = nameIn.value.trim() || t.name)));
    const tun = t.kind === 'fretted'
      ? (() => {
          const sel = h('select', { 'aria-label': `${t.name} tuning` }, h('option', { value: '' }, t.tuning.slice().reverse().map((m) => NOTE[m % 12]).join(' ')), Object.entries(E.TUNINGS).filter(([, v]) => v.length === t.tuning.length).map(([n]) => h('option', { value: n }, n)));
          sel.addEventListener('change', () => sel.value && edit(() => (t.tuning = E.TUNINGS[sel.value].slice())));
          return sel;
        })()
      : null;
    const mute = h('button', { type: 'button', class: `btn ghost sm${S.muted.has(t.id) ? ' on' : ''}`, 'aria-pressed': S.muted.has(t.id) ? 'true' : 'false', onclick: () => (S.muted.has(t.id) ? S.muted.delete(t.id) : S.muted.add(t.id), render()) }, S.muted.has(t.id) ? 'Muted' : 'Mute');
    const shift = (d) => edit(() => {
      if (d > 0) t.bars.unshift(E.emptyBar(S.model.ts));
      else if (t.bars[0].beats.every((b) => b.rest)) t.bars.shift();
      else return false;
      E.alignTracks(S.model);
    });
    return h(
      'section',
      { class: `ts-track${ti === S.sel.track ? ' on' : ''}` },
      h('div', { class: 'ts-head' },
        h('span', { class: 'ts-kind' }, icon(t.kind === 'drums' ? 'activity' : 'guitar', 14)),
        nameIn,
        tun,
        t.stemId ? h('span', { class: 'muted tiny' }, `from ${(media.get(t.stemId) || {}).name || 'a stem'}`) : null,
        h('span', { class: 'spacer' }),
        button('Later 1 bar', () => shift(1), { variant: 'ghost sm', title: 'Move this track one bar later' }),
        button('Earlier 1 bar', () => shift(-1), { variant: 'ghost sm', title: 'Move this track one bar earlier (needs an empty first bar)' }),
        mute,
        button('', () => {
          if (S.model.tracks.length <= 1) return toast('A tab needs at least one track.', 'error');
          if (!confirm(`Delete the track “${t.name}”?`)) return;
          edit(() => S.model.tracks.splice(ti, 1));
          S.sel.track = Math.min(S.sel.track, S.model.tracks.length - 1);
          render();
        }, { iconName: 'trash', variant: 'ghost sm danger', title: `Delete ${t.name}` }),
      ),
      scroller,
    );
  }

  function render() {
    stopPlayQuiet();
    canvases = [];
    const files = tabFiles();
    const openSel = h('select', { 'aria-label': 'Open a Guitar Pro file' }, h('option', { value: '' }, files.length ? '— open a file from your media —' : 'No Guitar Pro files yet'), files.map((m) => h('option', { value: m.id, selected: m.id === S.sourceId || m.id === S.savedId }, m.name)));
    openSel.addEventListener('change', () => openSel.value && open(media.get(openSel.value)));
    const head = h(
      'header',
      { class: 'page-head' },
      h('div', {}, h('h2', {}, icon('guitar', 20), ' Tab Studio'), h('p', { class: 'muted small' }, 'Edit your Guitar Pro tabs, or make one from your stems. Save it and the video’s tab and drum layers can use it.')),
      button('Video Studio', () => ui.goStudio('layers'), { iconName: 'film', variant: 'ghost', title: 'Back to the video editor' }),
    );
    const fileBar = h('div', { class: 'page-bar ts-files' },
      openSel,
      button('Upload .gp', async () => {
        const fs = await pickFiles(TAB_ACCEPT, false);
        if (!fs.length) return;
        await panels.importFiles(fs);
        const rec = media.all().filter((m) => m.kind === 'tab').at(-1);
        if (rec) open(rec);
      }, { iconName: 'upload', variant: 'ghost sm' }),
      button('New tab', fresh, { iconName: 'plus', variant: 'ghost sm' }),
      button('Make tab from stems…', () => ((S.showTx = !S.showTx), render()), { iconName: 'wand', variant: `sm${S.showTx ? ' on' : ''}` }),
      h('span', { class: 'spacer' }),
      S.model ? button(S.dirty ? 'Save as new .gp' : 'Saved', () => save(), { iconName: 'download', variant: `sm${S.dirty ? ' primary' : ''}`, disabled: !S.dirty }) : null,
      S.model ? button('Save & use in video', () => save({ use: true }), { iconName: 'check', variant: 'sm' }) : null,
    );
    if (!S.model) {
      root.replaceChildren(...[head, fileBar, S.showTx ? txPanel() : null,
        h('div', { class: 'ts-empty' },
          h('p', {}, 'Open a Guitar Pro file from your media, start a new tab, or make one from your stems.'),
          h('div', { class: 'row' }, files.length ? button(`Open “${files[0].name}”`, () => open(files[0]), { variant: 'primary' }) : null, button('New tab', fresh, { iconName: 'plus' }), button('Make tab from stems…', () => ((S.showTx = true), render()), { iconName: 'wand' })))].filter(Boolean));
      return;
    }
    clampSel();
    const m = S.model;
    const title = h('input', { type: 'text', value: m.title, 'aria-label': 'Song title', class: 'ts-title' });
    title.addEventListener('change', () => edit(() => (m.title = title.value.trim() || m.title)));
    const tempo = h('input', { type: 'number', min: 30, max: 300, value: m.tempo, class: 'num', 'aria-label': 'Tempo (BPM)' });
    tempo.addEventListener('change', () => edit(() => (m.tempo = Math.max(30, Math.min(300, Number(tempo.value) || m.tempo)))));
    const ts = h('select', { 'aria-label': 'Time signature' }, ['4/4', '3/4', '6/8', '12/8', '5/4', '7/8', '2/4'].map((x) => h('option', { value: x, selected: x === `${m.ts[0]}/${m.ts[1]}` }, x)));
    ts.addEventListener('change', () => edit(() => {
      m.ts = ts.value.split('/').map(Number);
    }));
    const addTrack = h('select', { 'aria-label': 'Add a track' }, h('option', { value: '' }, '+ Add a track…'), h('option', { value: 'Guitar · Standard E' }, 'Guitar'), h('option', { value: 'Bass · Standard E' }, 'Bass'), h('option', { value: 'Guitar 7 · Standard B' }, '7-string guitar'), h('option', { value: 'Bass 5 · Standard B' }, '5-string bass'), h('option', { value: 'drums' }, 'Drums'));
    addTrack.addEventListener('change', () => {
      const v = addTrack.value;
      if (!v) return;
      edit(() => {
        const nt = v === 'drums' ? E.newTrack('drums', { name: 'Drums', bars: m.tracks[0].bars.length, ts: m.ts }) : E.newTrack('fretted', { name: v.startsWith('Bass') ? 'Bass' : 'Guitar', tuning: E.TUNINGS[v].slice(), bars: m.tracks[0].bars.length, ts: m.ts });
        m.tracks.push(nt);
        S.sel = { track: m.tracks.length - 1, bar: 0, beat: 0, key: v === 'drums' ? 36 : 1 };
      });
      render();
    });
    root.replaceChildren(...[
      head,
      fileBar,
      S.showTx ? txPanel() : null,
      h('div', { class: 'page-bar ts-song' }, field('Title', title), field('Tempo', tempo), field('Time', ts), addTrack,
        h('span', { class: 'muted tiny' }, m.offset != null ? `Bar 1 plays at ${m.offset.toFixed(2)} s into the song.` : '')),
      tools,
      status,
      h('div', { class: 'ts-tracks' }, m.tracks.map(trackBlock)),
      issuesEl,
      h('details', { class: 'ts-keys small' }, h('summary', {}, 'Keyboard'),
        h('ul', {},
          h('li', {}, 'Arrows move between beats and strings (up/down past the edge goes to the next track).'),
          h('li', {}, 'Type a fret number (two digits quickly for 10–24). Backspace clears the note.'),
          h('li', {}, '+ / − make the beat longer or shorter, . adds a dot, R makes a rest, I inserts a beat, Shift+Delete removes it.'),
          h('li', {}, 'H hammer-on, S slide, B bend, V vibrato, P palm mute, X dead note, G ghost note.'),
          h('li', {}, 'Drums: pick a row and press Enter (or double-click) to add or remove a hit.'),
          h('li', {}, 'Space plays from the selected bar. Ctrl+Z / Ctrl+Y undo and redo.'))),
    ].filter(Boolean));
    paintTools();
    requestAnimationFrame(() => {
      draw();
      scrollToSel();
    });
  }
  function stopPlayQuiet() {
    if (S.playing) {
      S.playing = false;
      cancelAnimationFrame(raf);
      if (playNodes) {
        try {
          playNodes.out.disconnect();
        } catch {
          /* gone */
        }
        playNodes = null;
      }
    }
  }

  const onResize = () => S.model && draw();
  window.addEventListener('resize', onResize);
  // open the tab the video uses, if nothing is open yet
  if (!S.model) {
    const p = store.get();
    const L = (p.layers || []).find((l) => l.type === 'tab' && l.mediaId && media.get(l.mediaId) && media.get(l.mediaId).score);
    if (L) {
      S.model = E.fromScore(media.get(L.mediaId).score);
      E.alignTracks(S.model);
      S.model.offset = L.offset;
      S.sourceId = L.mediaId;
      S.sel = { track: Math.min(L.track || 0, S.model.tracks.length - 1), bar: 0, beat: 0, key: 1 };
    }
  }
  render();
  return {
    el: root,
    render,
    leave() {
      stopPlayQuiet();
      window.removeEventListener('resize', onResize);
    },
  };
}
