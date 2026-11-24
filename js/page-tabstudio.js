// Tab Studio: a full page for editing Guitar Pro tabs (all tracks stacked, keyboard editing, playback)
// and for making tabs from stems. Saves as a new .gp file in your media so the video's tab and drum
// layers can use it.
import { h, icon, button, toast, field, pickFiles } from './dom.js';
import { media, addMedia } from './media.js';
import { uid } from './core.js';
import { defaultTabLayer, drumSoundName } from './tab.js';
import { drumHitsFromAudio } from './drums.js';
import { TAB_ACCEPT, makeLayer } from './panel-layers.js';
import * as E from './tabedit.js';
import { TRANSCRIBE_KINDS, decodeStem, gridFromSamples, transcribeSamples, drumsToTrack } from './transcribe.js';
import { transcribeStem } from './ai/basicpitch.js';
import * as ST from './stemtab.js';
import { wrapBars, clampZoom, nextSpeed, loopPosition, readGesture } from './tablayout.js';
import { songTabChoices, tabToFollow } from './manager/files.js';
import { savedTabSync } from './songsync.js';
import { relinkButton } from './relink.js';

// Phones and tablets (and any touch screen) get the touch layout: bars wrap to the screen, a playback bar at
// the bottom, an on-screen edit pad and a tracks sheet. A desktop window wider than this keeps the classic layout.
const TOUCH_MQ = '(max-width: 1100px), (pointer: coarse)';
const PHONE_MQ = '(max-width: 699px), (max-height: 499px)';
const TOUCH_K = 1.45; // the tab drawn bigger for fingers (rows about 26 px instead of 18)
const savedZoom = () => {
  try {
    return clampZoom(localStorage.getItem('pvm.tabZoom') || 1);
  } catch {
    return 1;
  }
};

// kept while the app is open, so leaving the page and coming back keeps your work
const S = {
  model: null,
  sourceId: null, // media id the model was opened from
  savedId: null, // media id of the last save
  auto: null, // { songId, mediaId }: opened for the selected song (not by hand), so it follows the song until you edit it
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
  // touch layout
  zoom: savedZoom(),
  wrap: true, // bars wrap to the screen (false: one long line you scroll sideways)
  oneTrack: null, // null: one track at a time on phones, all tracks on tablets
  pad: { open: null, tab: 'fret' }, // open null: docked on tablets, closed on phones until you tap a note
  sheet: false,
  speed: 1,
  loop: false,
  loopBars: 1,
  headOpen: null, // track id whose settings row is open
  fileOpen: null,
};

const BEAT_MIN = 26;
const ROW = 18;
const BAR_PAD = 12;
const beatW = (b) => Math.round(BEAT_MIN + 30 * Math.sqrt(E.beatQuarters(b)));
const DRUM_ROWS = [49, 51, 42, 46, 38, 48, 45, 41, 36];
// top-to-bottom order for any other kit pieces a Guitar Pro file uses (they get their own rows)
const DRUM_ORDER = [55, 52, 49, 57, 51, 59, 53, 42, 46, 44, 40, 38, 37, 39, 50, 48, 47, 45, 43, 41, 36, 35];
const MORE_DRUMS = { 35: 'Kick2', 37: 'Stick (side stick)', 39: 'Clap', 40: 'Rim (snare rim)', 43: 'Flr2 (floor tom 2)', 47: 'Tom2 (low-mid tom)', 50: 'Tom1 (high tom 2)', 52: 'China', 55: 'Splash', 59: 'Ride2' };
const drumName = (m) => (E.DRUM_PIECES.find((p) => p[0] === m) || [m, MORE_DRUMS[m] || drumSoundName(m)])[1];
/** The drum rows of a track: the usual kit plus every other sound its notes use. */
function drumRows(track) {
  const used = new Set();
  for (const bar of track.bars) for (const b of bar.beats) for (const n of b.notes) used.add(n.m);
  const extra = [...used].filter((m) => !DRUM_ROWS.includes(m));
  if (!extra.length) return DRUM_ROWS;
  const rank = (m) => {
    const i = DRUM_ORDER.indexOf(m);
    return i === -1 ? 100 + m : i;
  };
  return [...DRUM_ROWS, ...extra].sort((a, b) => rank(a) - rank(b));
}
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const stringName = (track, s) => NOTE[track.tuning[s - 1] % 12];
const slug = (s) => String(s || 'tab').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tab';

function snapshot() {
  S.undo.push(JSON.stringify(S.model));
  if (S.undo.length > 200) S.undo.shift();
  S.redo.length = 0;
  S.dirty = true;
}

/**
 * Bar layout for a track: [{ x, w, beats: [{ x, w }] }] and total width, drawn `k` times the normal size.
 * With `wrapW` the bars flow into lines that fit that width: each bar also gets its `line`, and the layout
 * has `lines` ({ bars, y, h }) and a total `height`.
 */
/** Tab Studio's track for track `src` of the Guitar Pro file (tracks without a tab or drum staff are left out). */
function modelTrackOf(model, src) {
  const i = model.tracks.findIndex((t) => t.srcIndex === (src || 0));
  return i >= 0 ? i : Math.max(0, Math.min(src || 0, model.tracks.length - 1));
}

function layoutTrack(track, wrapW = 0, k = 1, stem = false) {
  if (wrapW) {
    // beats a little narrower than the row height grows, so more bars fit on a line (frets stay readable)
    const { lines, bars } = wrapBars(track.bars.map((bar) => bar.beats.map((b) => (beatW(b) * k * 0.85) / TOUCH_K)), wrapW, { gutter: 44 * k, barPad: BAR_PAD * k, barGap: 4 * k, right: 8 });
    const lineH = Math.round((20 + rowsFor(track).length * ROW + 18 + (stem ? 40 : 0) + 10) * k);
    lines.forEach((l, i) => Object.assign(l, { y: i * lineH, h: lineH }));
    return { bars, lines, width: wrapW, height: lines.length * lineH + 4, k, wrap: true };
  }
  let x = 44 * k;
  const bars = track.bars.map((bar) => {
    const bx = x;
    let cx = bx + BAR_PAD * k;
    const beats = bar.beats.map((b) => {
      const w = beatW(b) * k;
      const out = { x: cx, w };
      cx += w;
      return out;
    });
    x = cx + 4 * k;
    return { x: bx, w: x - bx, beats };
  });
  return { bars, width: x + 40 * k, k };
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

const rowsFor = (track) => (track.kind === 'drums' ? drumRows(track) : track.tuning.map((_, i) => i + 1));

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
/** Song Files > "Make a tab from this stem": open the stem panel with this stem and part picked. */
export function presetStemTab(rec, role) {
  S.tx = { stem: rec.id, kind: ST.TAB_ROLES[role] === 'bass' ? 'bass' : 'lead' };
  S.showTx = true;
}

export function openInTabStudio(rec, offset = 0) {
  if (!rec || !rec.score) return false;
  S.model = E.fromScore(rec.score);
  E.alignTracks(S.model);
  S.model.offset = offset;
  S.sourceId = rec.id;
  S.auto = null;
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
  // touch layout (phones, tablets, touch screens); decided on each render
  const touchMq = window.matchMedia(TOUCH_MQ);
  const phoneMq = window.matchMedia(PHONE_MQ);
  let touchUI = touchMq.matches;
  let phone = touchUI && phoneMq.matches;
  const oneTrack = () => touchUI && (S.oneTrack != null ? S.oneTrack : phone) && S.model && S.model.tracks.length > 1;
  const padOpen = () => touchUI && (S.pad.open != null ? S.pad.open : !phone);
  const transportEl = h('div', { class: 'ts-transport', role: 'toolbar', 'aria-label': 'Playback' });
  const padEl = h('section', { class: 'ts-pad', 'aria-label': 'Edit pad' });

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
    S.auto = null; // opened by hand: it stays when the selected song changes
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
    S.auto = null;
    S.undo = [];
    S.redo = [];
    S.dirty = false;
    S.sel = { track: 0, bar: 0, beat: 0, key: 1 };
    render();
  }

  // ------------------------------------------------------------ the selected song's tab
  // Tab Studio opens the Guitar Pro file attached to the selected song, and moves to the next song's file when the
  // song changes, as long as that tab was opened for the song and not edited. A tab you opened yourself stays.
  const curSong = () => (ui.tabSong ? ui.tabSong() : null);
  const choicesFor = (song) => (song ? songTabChoices(song, (id) => media.get(id), (id) => media.missingLabel(id, 'Guitar Pro file').replace(/^Missing:? ?/, '')) : []);
  const inVideo = () => (store.get().layers || []).map((l) => l.mediaId).filter(Boolean);
  const mainTab = (song) => tabToFollow({ model: null }, song, choicesFor(song), inVideo());
  function openForSong(id, song) {
    const rec = media.get(id);
    if (!rec || !rec.score) return false;
    const L = (store.get().layers || []).find((l) => l.mediaId === id && (l.type === 'tab' || (l.type === 'drums' && l.source === 'gp')));
    S.model = E.fromScore(rec.score);
    E.alignTracks(S.model);
    if (L && L.offset != null) S.model.offset = L.offset;
    else if (savedTabSync(song, id)) S.model.offset = savedTabSync(song, id).offset; // the sync saved on the song
    S.sourceId = id;
    S.savedId = null;
    S.auto = { songId: song.id, mediaId: id };
    S.undo = [];
    S.redo = [];
    S.dirty = false;
    const ti = L && L.type === 'tab' ? modelTrackOf(S.model, L.track) : 0;
    S.sel = { track: ti, bar: 0, beat: 0, key: S.model.tracks[ti] && S.model.tracks[ti].kind === 'drums' ? 36 : 1 };
    return true;
  }
  /** Open (or close) the tab the selected song calls for. Returns true when something changed. */
  function followSong() {
    const song = curSong();
    const edited = S.dirty || !!S.savedId || S.undo.length > 0;
    const want = tabToFollow({ model: S.model, auto: S.auto, edited, sourceId: S.sourceId }, song, choicesFor(song), inVideo());
    if (want === null) return false;
    if (want) return openForSong(want, song);
    // it followed the last song, and this one has no tab yet
    stopPlayQuiet();
    Object.assign(S, { model: null, sourceId: null, auto: null, undo: [], redo: [] });
    return true;
  }
  /** "From <song>", a picker for a song with several tabs, a way back to the song's tab, or why there is none. */
  function songLine() {
    const song = curSong();
    if (!song) return null;
    const choices = choicesFor(song);
    const ok = choices.filter((c) => c.state === 'ok');
    const mine = S.model && S.auto && S.auto.songId === song.id;
    const openSong = (id) => {
      if (S.dirty && !confirm('Open the song’s tab? Unsaved changes here will be lost.')) return render();
      stopPlayQuiet();
      if (openForSong(id, song)) render();
    };
    const parts = [];
    if (mine) {
      parts.push(h('span', { class: 'ts-from' }, icon('music', 14), ` From “${song.title}”`));
      if (ok.length > 1) {
        const pick = h('select', { 'aria-label': `${song.title}: its Guitar Pro files` }, ok.map((c) => h('option', { value: c.mediaId, selected: c.mediaId === S.sourceId }, `${c.name}${c.draft ? ' (draft from a stem)' : ''}`)));
        pick.addEventListener('change', () => openSong(pick.value));
        parts.push(pick);
      }
    } else if (ok.length) {
      parts.push(
        h('span', { class: 'muted small' }, S.model ? `“${song.title}” has its own tab.` : `“${song.title}” has a Guitar Pro file.`),
        button(S.model ? 'Back to the song’s tab' : `Open “${ok[0].name}”`, () => openSong(mainTab(song)), { iconName: 'guitar', variant: 'ghost sm ts-songback' }),
      );
    } else if (!choices.length) {
      parts.push(
        h('span', { class: 'muted small ts-nosongtab' }, `“${song.title}” has no Guitar Pro file yet. Attach one on its Files tab in Songs & releases.`),
        ui.openSongFiles ? button('Open its Files tab', () => ui.openSongFiles(song.id), { iconName: 'file', variant: 'ghost sm' }) : null,
      );
    }
    for (const c of choices.filter((x) => x.state !== 'ok')) {
      parts.push(h('span', { class: 'small ts-missing' }, c.state === 'missing' ? `“${c.name}” (on “${song.title}”) can’t be found: the file is no longer in this browser.` : `“${c.name}” (on “${song.title}”) couldn’t be read as a Guitar Pro file.`));
    }
    if (choices.some((c) => c.state === 'missing')) parts.push(relinkButton('manager', { roots: () => [song] }));
    return h('div', { class: 'page-bar ts-songtab' }, parts.filter(Boolean));
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
    dur: (d) => edit(() => E.setDuration(track(), S.sel.bar, S.sel.beat, d, E.tsAt(S.model, S.sel.bar))),
    longer: () => {
      const b = E.beatAt(track(), S.sel.bar, S.sel.beat);
      if (b.dur > 1) ops.dur(b.dur / 2);
    },
    shorter: () => {
      const b = E.beatAt(track(), S.sel.bar, S.sel.beat);
      if (b.dur < 32) ops.dur(b.dur * 2);
    },
    dot: () => edit(() => E.toggleDot(track(), S.sel.bar, S.sel.beat, E.tsAt(S.model, S.sel.bar))),
    rest: () => edit(() => E.toggleRest(track(), S.sel.bar, S.sel.beat)),
    insert: () => edit(() => {
      const k = E.insertBeat(track(), S.sel.bar, S.sel.beat, E.tsAt(S.model, S.sel.bar));
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

  // the element that scrolls the page up and down (the Tab Studio workspace), and how much of it is on screen
  const scrollBox = () => root.closest('.tabws') || document.scrollingElement || document.documentElement;
  /** Visible part of the workspace, above the playback bar and a docked edit pad. */
  function viewRect() {
    const vr = scrollBox().getBoundingClientRect();
    let bottom = Math.min(vr.bottom, window.innerHeight);
    for (const el of [transportEl, padEl]) {
      if (!el.isConnected || el.hidden) continue;
      const r = el.getBoundingClientRect();
      // only bars docked along the bottom (the landscape pad sits at the side)
      if (r.height && r.bottom >= window.innerHeight - 2 && r.width > window.innerWidth * 0.6) bottom = Math.min(bottom, r.top);
    }
    return { top: Math.max(vr.top, 0), bottom, height: Math.max(60, bottom - Math.max(vr.top, 0)) };
  }

  /**
   * Draw one track. Classic layout: one long line in a sideways scroller, the canvas sticks to the left and
   * draws what is in view. Wrapped layout: the tab can be very tall (200+ bars), so the canvas is only about
   * 1.6 screens tall, sits over the visible part of the tall spacer and draws the lines there. `lazy` (on
   * scroll) skips the redraw while the screen is still inside what the canvas already shows.
   */
  function drawTrack(ti, { lazy = false } = {}) {
    const c = canvases[ti];
    if (!c || !c._layout) return;
    const t = S.model.tracks[ti];
    const lay = c._layout;
    const k = lay.k || 1;
    const R = ROW * k;
    const scroller = c._scroller;
    const rows = rowsFor(t);
    const stem = S.stemPeaks.get(t.id);
    let W;
    let H;
    let offY = 0;
    if (lay.wrap) {
      W = lay.width;
      const vr = viewRect();
      const sp = c._spacer.getBoundingClientRect();
      if (sp.bottom < vr.top - 200 || sp.top > vr.bottom + 200) {
        if (lazy) return; // off screen
      }
      H = Math.max(1, Math.min(lay.height, Math.round(vr.height * 1.6)));
      const seenTop = vr.top - sp.top;
      if (lazy && c._drawn && c._offY <= Math.max(0, seenTop) && c._offY + c._h >= Math.min(lay.height, seenTop + vr.height)) return;
      offY = Math.round(Math.max(0, Math.min(lay.height - H, seenTop - (H - vr.height) / 2)));
      c._offY = offY;
      c._h = H;
      c._drawn = true;
      c.style.top = `${offY}px`;
    } else {
      W = scroller.clientWidth || 800;
      H = rows.length * ROW * k + 30 * k + (stem ? 40 * k : 0);
    }
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
    const pal = { fg: col('--text', '#ececf1'), muted: col('--muted', '#9a9daa'), accent: col('--accent', '#ffd400'), panel: col('--panel', '#16171d'), panel2: col('--panel-2', '#1d1f27') };
    g.fillStyle = pal.panel;
    g.fillRect(0, 0, W, H);
    if (!lay.wrap) {
      drawLine(g, ti, { idx: null, sx: scroller.scrollLeft, top: 20 * k, W, pal, rows, stem, k, R });
      return;
    }
    lay.lines.forEach((line) => {
      if (line.y + line.h < offY || line.y > offY + H) return;
      drawLine(g, ti, { idx: line.bars, sx: 0, top: line.y - offY + 20 * k, W, pal, rows, stem, k, R });
    });
  }

  /** One line of bars (`idx`: bar numbers, null for all) with its strings, notes, cursor and string names. */
  function drawLine(g, ti, { idx, sx, top, W, pal, rows, stem, k, R }) {
    const t = S.model.tracks[ti];
    const lay = canvases[ti]._layout;
    const { fg, muted, accent } = pal;
    const list = idx || lay.bars.map((_, i) => i);
    const yOf = (key) => top + rows.indexOf(key) * R + R / 2;
    const endX = idx ? lay.bars[list[list.length - 1]].x + lay.bars[list[list.length - 1]].w : W;
    // string / drum rows
    g.strokeStyle = 'rgba(160,160,180,0.35)';
    g.lineWidth = 1;
    rows.forEach((r, i) => {
      const y = top + i * R + R / 2;
      g.beginPath();
      g.moveTo(0, y + 0.5);
      g.lineTo(endX, y + 0.5);
      g.stroke();
    });
    const px = (n) => `${Math.round(n * k)}px`;
    g.font = `600 ${px(11)} Inter, system-ui, sans-serif`;
    g.textBaseline = 'middle';
    // bars
    g.save();
    g.translate(-sx, 0);
    const selected = ti === S.sel.track;
    for (const bi of list) {
      const bl = lay.bars[bi];
      if (bl.x + bl.w < sx || bl.x > sx + W) continue;
      g.strokeStyle = 'rgba(200,200,220,0.6)';
      g.beginPath();
      g.moveTo(bl.x + 0.5, top);
      g.lineTo(bl.x + 0.5, top + rows.length * R);
      g.stroke();
      g.fillStyle = muted;
      g.textAlign = 'left';
      // the classic layout draws bar numbers in the font left over from the last beat; kept so desktop looks the same
      if (lay.wrap) g.font = `600 ${px(11)} Inter, system-ui, sans-serif`;
      g.fillText(String(bi + 1), bl.x + 3 * k, top - 11 * k);
      // bar marks from the file: tempo, time signature change, section, repeat, ending and jump signs
      const mk = (S.model.marks && S.model.marks[bi]) || {};
      const tsc = S.model.tsBars && S.model.tsBars[bi];
      const head = [
        S.model.tempos && S.model.tempos[bi] ? `♩=${S.model.tempos[bi]}` : '',
        tsc ? `${tsc[0]}/${tsc[1]}` : '',
        mk.sec ? `[${mk.sec.t || mk.sec.m}]` : '',
        mk.ae ? `${[0, 1, 2, 3, 4, 5, 6, 7].filter((x) => mk.ae & (1 << x)).map((x) => x + 1).join('.')}.` : '',
        ...(mk.dirs || []).map((d) => E.DIRECTION_LABELS[d] || ''),
      ].filter(Boolean).join(' ');
      if (head) {
        g.fillStyle = accent;
        g.fillText(head, bl.x + 22 * k, top - 11 * k);
      }
      if (mk.ro || mk.rc) {
        // repeat signs sit on the bar-number line, so they never cover a fret number
        g.fillStyle = accent;
        g.font = `700 ${px(11)} Inter, system-ui, sans-serif`;
        if (mk.ro) g.fillText('‖:', bl.x + 22 * k + (head ? g.measureText(head).width + 6 * k : 0), top - 11 * k);
        if (mk.rc) {
          g.textAlign = 'right';
          g.fillText(`:‖${mk.rc > 2 ? `×${mk.rc}` : ''}`, bl.x + bl.w - 3 * k, top - 11 * k);
          g.textAlign = 'left';
        }
        g.font = `600 ${px(11)} Inter, system-ui, sans-serif`;
      }
      if (S.loop && S.loopFrom != null && bi >= S.loopFrom && bi < S.loopFrom + S.loopBars) {
        g.fillStyle = 'rgba(79,140,255,0.5)';
        g.fillRect(bl.x + 1, top - 4 * k, bl.w - 2, 2 * k);
      }
      const over = E.barFill(t.bars[bi]) - E.barLen(S.model, bi);
      if (Math.abs(over) > 1e-9) {
        g.fillStyle = over > 0 ? 'rgba(255,92,108,0.18)' : 'rgba(255,212,0,0.08)';
        g.fillRect(bl.x + 1, top, bl.w - 4, rows.length * R);
      }
      bl.beats.forEach((bt, ki) => {
        const b = t.bars[bi].beats[ki];
        const isSel = selected && S.sel.bar === bi && S.sel.beat === ki;
        if (isSel) {
          g.fillStyle = 'rgba(255,212,0,0.14)';
          g.fillRect(bt.x, top - 2 * k, bt.w - 2 * k, rows.length * R + 4 * k);
          g.strokeStyle = accent;
          g.lineWidth = 2;
          g.strokeRect(bt.x + 1, yOf(S.sel.key) - R / 2 + 1, bt.w - 4, R - 2);
          g.lineWidth = 1;
        }
        // duration tick under the staff
        g.fillStyle = muted;
        g.textAlign = 'center';
        g.font = `${px(10)} Inter, system-ui, sans-serif`;
        const dl = { 1: '𝅝', 2: '𝅗𝅥', 4: '♩', 8: '♪', 16: '𝅘𝅥𝅯', 32: '𝅘𝅥𝅰', 64: '𝅘𝅥𝅱' }[b.dur] || '';
        const dots = b.dot === 2 ? '..' : b.dot ? '.' : '';
        g.fillText(`${b.grace ? 'gr ' : ''}${b.tu && !(b.tu === 3 && (b.tuD || 2) === 2) ? `${b.tu}:${b.tuD}` : b.tu ? '3' : ''}${dl}${dots}${b.tp ? '≡' : ''}`, bt.x + bt.w / 2, top + rows.length * R + 8 * k);
        if (b.rest) {
          g.fillStyle = muted;
          g.font = `600 ${px(12)} Inter, system-ui, sans-serif`;
          g.fillText('–', bt.x + bt.w / 2, top + (rows.length * R) / 2);
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
              g.font = `700 ${px(13)} Inter, system-ui, sans-serif`;
              g.fillText('x', bt.x + bt.w / 2, y + 1);
            } else {
              g.arc(bt.x + bt.w / 2, y, 5 * k, 0, Math.PI * 2);
              g.fill();
            }
            continue;
          }
          let label = n.tech.x ? 'x' : String(n.f);
          if (n.tech.hm === 1) label = `<${label}>`;
          if (n.tech.g || n.tech.t) label = `(${label})`; // ghost and tied notes, as Guitar Pro shows them
          g.font = `700 ${px(12)} Inter, system-ui, sans-serif`;
          const tw = g.measureText(label).width + 6 * k;
          g.fillStyle = pal.panel;
          g.fillRect(bt.x + bt.w / 2 - tw / 2, y - 7 * k, tw, 14 * k);
          g.fillStyle = n.tech.t ? muted : fg;
          g.fillText(label, bt.x + bt.w / 2, y + 1);
          const bendTxt = () => {
            const q = Array.isArray(n.tech.b) ? Math.max(0, ...n.tech.b.map((p) => (Array.isArray(p) ? p[1] : p))) : 4; // quarter tones: 4 = full
            return `↗${{ 1: '¼', 2: '½', 3: '¾', 4: 'full', 6: '1½', 8: '2' }[q] || q / 4}`;
          };
          const marks = ['h', 'sl', 'b', 'v', 'pm', 'lr', 'hm', 'lht'].filter((m) => n.tech[m] && !(m === 'hm' && n.tech.hm === 1)).map((m) => (m === 'b' ? bendTxt() : m === 'hm' ? (E.HARMONICS[n.tech.hm] || ['', 'H'])[1] : { h: 'h', sl: '/', v: '~', pm: 'PM', lr: 'LR', lht: 'T' }[m]));
          if (b.tap && n === b.notes[0]) marks.push('T');
          if (marks.length) {
            g.font = `600 ${px(9)} Inter, system-ui, sans-serif`;
            g.fillStyle = accent;
            g.fillText(marks.join(''), bt.x + bt.w / 2 + tw / 2 + 2 * k, y - 7 * k);
          }
        }
      });
    }
    // closing bar line (after the last bar of the tab, or of this line)
    const last = lay.bars[list[list.length - 1]];
    if (last) {
      g.strokeStyle = 'rgba(200,200,220,0.6)';
      g.beginPath();
      g.moveTo(last.x + last.w, top);
      g.lineTo(last.x + last.w, top + rows.length * R);
      g.stroke();
    }
    // stem waveform under transcribed tracks, aligned to the bars
    if (stem && S.model.offset != null) {
      const y0 = top + rows.length * R + 16 * k;
      const times = E.barTimes(S.model).bars;
      g.fillStyle = 'rgba(74,222,128,0.55)';
      for (const bi of list) {
        const bl = lay.bars[bi];
        if (bl.x + bl.w < sx || bl.x > sx + W || !times[bi]) continue;
        const t0 = S.model.offset + times[bi].time;
        const t1 = S.model.offset + (times[bi + 1] ? times[bi + 1].time : times[bi].time + E.barLen(S.model, bi) * times[bi].spq);
        for (let p = 0; p < bl.w; p += 2) {
          const tt = t0 + ((t1 - t0) * p) / bl.w;
          const i = Math.floor((tt / stem.duration) * stem.peaks.length);
          const v = stem.peaks[i] || 0;
          g.fillRect(bl.x + p, y0 + 12 * k - v * 12 * k, 1.5, Math.max(1, v * 24 * k));
        }
      }
    }
    // playback cursor
    if (S.playing && S.cursor && S.cursor.track === ti && list.includes(S.cursor.bar)) {
      const bt = lay.bars[S.cursor.bar] && lay.bars[S.cursor.bar].beats[S.cursor.beat];
      if (bt) {
        g.fillStyle = 'rgba(79,140,255,0.35)';
        g.fillRect(bt.x, top - 4 * k, bt.w - 2 * k, rows.length * R + 8 * k);
      }
    }
    g.restore();
    // row labels drawn last, on a solid strip
    g.fillStyle = pal.panel2;
    g.fillRect(0, top - 2 * k, 40 * k, rows.length * R + 4 * k);
    g.textAlign = 'center';
    g.font = `700 ${px(11)} Inter, system-ui, sans-serif`;
    rows.forEach((r) => {
      g.fillStyle = selected && r === S.sel.key ? accent : muted;
      g.fillText(t.kind === 'drums' ? drumName(r).split(' ')[0].slice(0, 5) : stringName(t, r), 20 * k, yOf(r));
    });
  }

  const scale = () => (touchUI ? TOUCH_K * S.zoom : 1);
  function draw() {
    if (!S.model) return;
    if (touchUI && oneTrack() && !canvases[S.sel.track]) return render(); // moved to a track that isn't shown
    const k = scale();
    canvases.forEach((c, i) => {
      const t = S.model.tracks[i];
      const wrap = touchUI && S.wrap;
      c._layout = layoutTrack(t, wrap ? c._scroller.clientWidth || 320 : 0, k, !!S.stemPeaks.get(t.id));
      c._drawn = false;
      if (wrap) {
        c._spacer.style.width = '';
        c._spacer.style.height = `${c._layout.height}px`;
      } else {
        c._spacer.style.width = `${c._layout.width}px`;
        c._spacer.style.height = '';
      }
      drawTrack(i);
    });
    status.textContent = describe();
    paintIssues();
  }

  /** Scroll so the selected beat (or bar `bar` during playback) is in view. */
  function scrollToSel(bar = S.sel.bar, beat = S.sel.beat) {
    const c = canvases[S.sel.track];
    if (!c || !c._layout) return;
    const bl = c._layout.bars[bar];
    const bt = bl && bl.beats[beat];
    if (!bt) return;
    if (c._layout.wrap) {
      const line = c._layout.lines[bl.line];
      const vr = viewRect();
      const sp = c._spacer.getBoundingClientRect();
      const y = sp.top + line.y;
      const box = scrollBox();
      if (y < vr.top + 4) box.scrollTop += y - vr.top - 4;
      else if (y + line.h > vr.bottom) box.scrollTop += Math.min(y - vr.top - 4, y + line.h - vr.bottom + 8);
      return;
    }
    const sc = c._scroller;
    if (bt.x < sc.scrollLeft + 50) sc.scrollLeft = Math.max(0, bt.x - 60);
    else if (bt.x + bt.w > sc.scrollLeft + sc.clientWidth - 20) sc.scrollLeft = bt.x + bt.w - sc.clientWidth + 60;
    // keep all tracks scrolled together
    canvases.forEach((o) => o && o !== c && (o._scroller.scrollLeft = sc.scrollLeft));
  }

  /** The beat and string under a pointer. With `strip`, a tap on the bar numbers above the strings counts too. */
  function hit(ti, ev, { strip = false } = {}) {
    const c = canvases[ti];
    const lay = c._layout;
    const k = lay.k || 1;
    const r = c.getBoundingClientRect();
    let x = ev.clientX - r.left;
    let y = ev.clientY - r.top;
    const t = S.model.tracks[ti];
    const rows = rowsFor(t);
    let list;
    let top;
    if (lay.wrap) {
      y += c._offY || 0;
      const line = lay.lines.find((l) => y >= l.y && y < l.y + l.h);
      if (!line) return null;
      list = line.bars;
      top = line.y + 20 * k;
    } else {
      x += c._scroller.scrollLeft;
      list = lay.bars.map((_, i) => i);
      top = 20 * k;
    }
    const ri = Math.floor((y - top) / (ROW * k));
    const onStrip = strip && y < top && y >= top - 20 * k;
    if (!onStrip && (ri < 0 || ri >= rows.length)) return null;
    const key = onStrip ? (ti === S.sel.track ? S.sel.key : rows[0]) : rows[ri];
    for (const bi of list) {
      const bl = lay.bars[bi];
      if (x < bl.x || x > bl.x + bl.w) continue;
      const extra = onStrip ? { strip: true } : {};
      if (onStrip) return { track: ti, bar: bi, beat: 0, key, ...extra };
      for (let ki = 0; ki < bl.beats.length; ki++) {
        const bt = bl.beats[ki];
        if (x >= bt.x && x < bt.x + bt.w) return { track: ti, bar: bi, beat: ki, key };
      }
      return { track: ti, bar: bi, beat: bl.beats.length - 1, key };
    }
    return null;
  }

  // ------------------------------------------------------------ playback

  /** Mobile browsers only make sound after a tap: the first tap in Tab Studio turns the sound on. */
  function unlockAudio() {
    const ac = ctx();
    root.dataset.audio = ac.state;
    if (ac.state === 'running') return;
    Promise.resolve(ac.resume()).then(() => (root.dataset.audio = ac.state), () => {});
    try {
      // a silent sample started inside the tap is what unlocks older iPhones
      const src = ac.createBufferSource();
      src.buffer = ac.createBuffer(1, Math.round(ac.sampleRate * 0.05), ac.sampleRate);
      src.connect(ac.destination);
      src.start(0);
      src.stop(ac.currentTime + 0.05);
    } catch {
      /* not needed elsewhere */
    }
  }

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
    startPlay(S.sel.bar);
  }
  /** Play from the start of bar `fromBar` at the playback speed, looping `S.loopBars` bars when Loop is on. */
  function startPlay(fromBar) {
    stopPlayQuiet();
    const ac = ctx();
    Promise.resolve(ac.resume()).then(() => {
      root.dataset.audio = ac.state;
      if (ac.state !== 'running' && S.playing) toast('The browser is holding back sound. Tap Play again to turn it on.', 'error', 5000);
    }, () => {});
    const sch = E.schedule(S.model);
    const times = E.barTimes(S.model);
    const sp = S.speed || 1;
    const startT = (times.bars[fromBar] || { time: 0 }).time;
    const endT = S.loop ? (times.bars[fromBar + S.loopBars] || { time: times.duration }).time : sch.duration;
    const len = endT - startT;
    S.loopFrom = S.loop ? fromBar : null;
    const out = ac.createGain();
    out.gain.value = 0.8;
    out.connect(ac.destination);
    const t0 = ac.currentTime + 0.08;
    const pass = (at) => {
      for (const ev of sch.events) {
        if (ev.time < startT - 1e-6 || (S.loop && ev.time >= endT - 1e-6) || S.muted.has(S.model.tracks[ev.track].id)) continue;
        for (const n of ev.notes) voice(ac, out, at + (ev.time - startT) / sp, S.model.tracks[ev.track], n, ev.dur / sp);
      }
    };
    pass(t0);
    let nextPass = t0 + len / sp;
    playNodes = { out };
    S.playing = true;
    paintTools();
    let shownLine = -1;
    const tick = () => {
      if (!S.playing) return;
      if (!root.isConnected) return stopPlay();
      const elapsed = (ac.currentTime - t0) * sp;
      if (!S.loop && elapsed + startT > sch.duration) return stopPlay();
      if (S.loop && len > 0 && ac.currentTime > nextPass - 0.4) {
        pass(nextPass); // schedule the next time round just before it is needed
        nextPass += len / sp;
      }
      const t = S.loop ? loopPosition(Math.max(0, elapsed), startT, endT, true) : Math.max(0, elapsed + startT);
      S.cursor = { track: S.sel.track, ...E.beatAtTime(S.model, S.sel.track, t) };
      const c = canvases[S.sel.track];
      // the touch layout follows the music down the wrapped lines
      if (touchUI && c && c._layout && c._layout.wrap) {
        const bl = c._layout.bars[S.cursor.bar];
        if (bl && bl.line !== shownLine) {
          shownLine = bl.line;
          scrollToSel(S.cursor.bar, 0);
          drawTrack(S.sel.track, { lazy: true });
        }
      }
      drawTrack(S.sel.track);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  // ------------------------------------------------------------ save / use

  async function save({ use = false } = {}) {
    const issues = E.checkModel(S.model);
    if (issues.some((i) => !i.short)) return toast(`Fix first: ${issues.find((i) => !i.short).message}.`, 'error');
    for (const t of S.model.tracks) t.bars.forEach((bar, bi) => E.padBar(bar, E.barLen(S.model, bi)));
    try {
      const bytes = await E.toGpBytes(S.model);
      const draft = S.model.tracks.some((t) => t.draft);
      const file = new File([bytes], `${slug(S.model.title)}${draft ? '-draft-from-stem' : ''}${S.savedId || S.sourceId ? '-edit' : ''}.gp`, { type: 'application/octet-stream' });
      const rec = await addMedia(file, file.name);
      S.savedId = rec.id;
      if (draft && ui.draftTabSaved) ui.draftTabSaved(rec);
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

  /** The notes of a draft as a .mid in your media, ready for the MIDI notes layers and the rhythm game. */
  async function useAsMidi() {
    const bytes = S.model && ST.modelToMidi(S.model);
    if (!bytes) return toast('There are no notes to save yet.', 'error');
    try {
      const file = new File([bytes], `${slug(S.model.title)}${S.model.tracks.some((t) => t.draft) ? '-draft-from-stem' : ''}.mid`, { type: 'audio/midi' });
      const rec = await addMedia(file, file.name);
      store.update((d) => {
        d.layers ||= [];
        const L = { ...makeLayer(d, 'midi'), name: S.model.title || 'MIDI notes', visible: true, mediaId: rec.id, tracks: [], offset: S.model.offset != null ? S.model.offset : d.song ? d.song.offset : 0 };
        d.layers.push(L);
      });
      toast(`Saved “${file.name}” to your media and added a MIDI notes layer to the Video Studio edit. The rhythm game can use the file too.`, 'info', 6000);
    } catch (e) {
      toast(e.message || 'Could not save the MIDI file.', 'error', 6000);
    }
  }

  /** Basic Pitch: the notes in the stem (chords too), cleaned, put on the song's beat grid, with frets chosen. */
  async function transcribeBP(form, rec, kind) {
    const p = store.get();
    S.abort = new AbortController();
    S.busy = `Listening to “${rec.name}”…`;
    S.progress = 0;
    render();
    try {
      const { samples, duration } = await decodeStem(await media.blob(rec.id)); // read from storage when not open
      const tuning = E.TUNINGS[form.tuning.value];
      const range = ST.playableRange(tuning);
      const songBeats = p.beats && p.beats.beats && p.beats.beats.length;
      const ts = S.model ? S.model.ts : [4, 4];
      const sg = form.grid.value === 'song' && songBeats ? { bpm: p.beats.bpm, firstBeat: p.beats.beats[0] } : gridFromSamples(samples, 22050);
      const raw = await transcribeStem(samples, { range, signal: S.abort.signal, onProgress: (v) => ((S.progress = v), (S.busy = `Finding notes in “${rec.name}”… ${Math.round(v * 100)}%`), paintBusy()) });
      const { notes } = ST.cleanNotes(raw.notes, { range, mono: kind !== 'rhythm' });
      if (!notes.length) throw new Error('No notes found. Is this an isolated stem with the part playing?');
      const name = `${kind === 'bass' ? 'Bass' : 'Guitar'} (draft from stem)`;
      const res = ST.notesToTrack(notes, { tuning, name, bpm: sg.bpm, firstBeat: sg.firstBeat, ts, grid: form.noteGrid.value, stemId: rec.id });
      if (!res.stats.notes) throw new Error('No notes fit this instrument and tuning. Try another tuning.');
      installTrack(res, { ...sg, ts }, rec, samples, duration);
      toast(`${res.track.name}: ${res.stats.notes} notes${res.stats.chords ? ` (${res.stats.chords} chords)` : ''} at ${Math.round(sg.bpm)} BPM${res.stats.skipped ? `, ${res.stats.skipped} outside the tuning left out` : ''}. Play it back and fix anything that sounds off.`, 'info', 8000);
    } catch (e) {
      if (e.name !== 'AbortError') toast(e.message || 'Could not transcribe that file.', 'error', 6000);
    }
    S.abort = null;
    S.busy = '';
    render();
  }

  /** Update only the text of the busy button (a full render per progress step would be wasteful). */
  function paintBusy() {
    const b = root.querySelector('.ts-tx button.primary');
    if (b) b.lastChild.textContent = S.busy;
  }

  /** Add a made track to the open model (or start one), line its bars up with the others. */
  function installTrack(res, grid, rec, samples, duration) {
    const p = store.get();
    const t = { id: `trk-${Date.now().toString(36)}`, ...res.track, stemId: rec.id };
    S.stemPeaks.set(t.id, { peaks: peaksOf(samples, 1600), duration });
    if (!S.model || (!S.dirty && !S.sourceId && S.model.tracks.every((x) => x.bars.every((b) => b.beats.every((k) => k.rest))))) {
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
    S.sel = { track: S.model.tracks.length - 1, bar: 0, beat: 0, key: 1 };
    S.dirty = true;
    S.showTx = false;
    S.tx = null;
  }

  async function transcribe(form) {
    const rec = media.get(form.stem.value);
    if (!rec) return toast('Pick a stem first.', 'error');
    const kind = form.kind.value;
    if (kind !== 'drums' && form.method.value === 'bp') return transcribeBP(form, rec, kind);
    const p = store.get();
    S.busy = `Listening to “${rec.name}”…`;
    render();
    try {
      const stemBlob = await media.blob(rec.id); // read from storage when not open
      const { samples, sr, duration } = await decodeStem(stemBlob);
      // the song's beat grid when we have it (stems line up with the song), otherwise the stem's own
      const songBeats = p.beats && p.beats.beats && p.beats.beats.length;
      const grid = form.grid.value === 'song' && songBeats ? { bpm: p.beats.bpm, firstBeat: p.beats.beats[0], ts: S.model ? S.model.ts : [4, 4] } : { ...gridFromSamples(samples, sr), ts: S.model ? S.model.ts : [4, 4] };
      let res;
      if (kind === 'drums') {
        const hits = await drumHitsFromAudio(stemBlob);
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
    const stem = h('select', { name: 'stem', 'aria-label': 'Stem' }, stems.map((m) => h('option', { value: m.id, selected: S.tx && S.tx.stem === m.id ? true : undefined }, m.name)));
    const kind = h('select', { name: 'kind', 'aria-label': 'Part' }, TRANSCRIBE_KINDS.map(([id, label]) => h('option', { value: id, selected: S.tx && S.tx.kind === id ? true : undefined }, label)));
    const method = h('select', { name: 'method', 'aria-label': 'Method' }, h('option', { value: 'bp' }, 'Basic Pitch (finds chords too, slower)'), h('option', { value: 'quick' }, 'Quick pitch tracker (single notes, power chords)'));
    const noteGrid = h('select', { name: 'noteGrid', 'aria-label': 'Note grid' }, ST.GRIDS.map(([id, label]) => h('option', { value: id }, label)));
    const songKey = (ui.linkedSong && ui.linkedSong() && ui.linkedSong().key) || '';
    const tuning = h('select', { name: 'tuning', 'aria-label': 'Tuning' }, Object.keys(E.TUNINGS).map((n) => h('option', { value: n }, n)));
    const grid = h('select', { name: 'grid', 'aria-label': 'Tempo from' },
      h('option', { value: 'song', disabled: !p.beats }, p.beats ? `The song’s detected tempo (${Math.round(p.beats.bpm)} BPM)` : 'The song’s tempo (run Detect BPM in Audio)'),
      h('option', { value: 'stem', selected: !p.beats }, 'Detect from this stem'));
    const pickTuning = () => (tuning.value = ST.tuningFor(kind.value === 'bass' ? 'bass' : 'guitar', songKey));
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
      h('div', { class: 'grid2' }, field('Method', method), field('Note grid', noteGrid)),
      h('p', { class: 'warn-list small' }, 'Distorted, fast or layered guitar comes out noisy and needs correcting by ear. A clean, isolated single-note part works best. Basic Pitch runs on this device: nothing is uploaded.'),
      h('p', { class: 'muted tiny' }, 'Stems exported from your session start with the song, so the song’s tempo lines the tab up with the video.'),
      h('div', { class: 'row' }, button(S.busy ? S.busy : 'Transcribe', null, { iconName: 'wand', variant: 'primary', disabled: !!S.busy || !stems.length }), S.abort ? button('Cancel', () => S.abort && S.abort.abort(), { variant: 'sm' }) : null, button('Close', () => ((S.showTx = false), render()), { variant: 'ghost sm' })),
    );
    form.querySelector('button.primary').type = 'submit';
    pickTuning();
    return form;
  }

  // ------------------------------------------------------------ toolbar & render

  const tools = h('div', { class: 'ts-tools', role: 'toolbar', 'aria-label': 'Edit the selected beat' });
  const DUR_LABEL = { 1: '1/1', 2: '1/2', 4: '1/4', 8: '1/8', 16: '1/16', 32: '1/32' };
  const DUR_NAME = { 1: 'Whole', 2: 'Half', 4: 'Quarter', 8: 'Eighth', 16: 'Sixteenth', 32: '32nd' };
  function paintTools() {
    if (touchUI) {
      paintPad();
      paintTransport();
    }
    if (!S.model) return tools.replaceChildren();
    const t = track();
    const b = E.beatAt(t, S.sel.bar, S.sel.beat);
    const tbtn = (label, title, fn, on = false, extra = '') => h('button', { type: 'button', class: `btn sm${on ? ' on' : ''} ${extra}`, title, 'aria-pressed': on ? 'true' : 'false', onclick: () => (fn(), canvases[S.sel.track] && canvases[S.sel.track].focus()) }, label);
    const n = t.kind === 'fretted' && b.notes.find((x) => x.s === S.sel.key);
    tools.replaceChildren(
      h('div', { class: 'ts-group', 'aria-label': 'Length' }, E.DURATIONS.map((d) => tbtn(DUR_LABEL[d], `${DUR_NAME[d]} note (+ / − keys)`, () => ops.dur(d), b.dur === d)), tbtn('dot', 'Dotted (.)', ops.dot, b.dot), tbtn('rest', 'Rest (R)', ops.rest, b.rest)),
      t.kind === 'fretted'
        ? h('div', { class: 'ts-group', 'aria-label': 'Technique' }, E.TECHS.map(([k, label, key]) => tbtn(key, `${label} (${key})`, () => ops.tech(k), !!(n && n.tech[k]))))
        : h('div', { class: 'ts-group', 'aria-label': 'Drum hits' }, drumRows(track()).slice().reverse().map((m) => tbtn(drumName(m), `${drumName(m)} hit (select a row, Enter)`, () => ops.drum(m), b.notes.some((x) => x.m === m)))),
      h('div', { class: 'ts-group', 'aria-label': 'Beats and bars' }, tbtn('+ beat', 'Insert a beat after this one (I)', ops.insert), tbtn('− beat', 'Delete this beat (Shift+Delete)', ops.remove), tbtn('+ bar', 'Add a bar after this one', ops.addBar), tbtn('− bar', 'Delete this bar from every track', ops.delBar, false, 'danger')),
      h('div', { class: 'ts-group' }, tbtn('↶', 'Undo (Ctrl+Z)', ops.undo), tbtn('↷', 'Redo (Ctrl+Y)', ops.redo), tbtn(S.playing ? '■ Stop' : '▶ Play', 'Play from this bar (Space)', togglePlay, S.playing, 'primary')),
    );
  }

  // ------------------------------------------------------------ touch: playback bar, edit pad, tracks sheet

  /** After moving the cursor from a button or a swipe: redraw and keep the cursor in view. */
  function moved() {
    S.typed = '';
    clampSel();
    if (oneTrack() && !canvases[S.sel.track]) return render();
    draw();
    paintTools();
    scrollToSel();
  }
  function jumpBar(d) {
    S.sel.bar = Math.max(0, Math.min(track().bars.length - 1, S.sel.bar + d));
    S.sel.beat = 0;
    moved();
    if (S.playing) startPlay(S.sel.bar);
  }
  const tbtn2 = (label, title, fn, { ic, on, cls = '', pressed = on } = {}) =>
    h('button', { type: 'button', class: `ts-tbtn ${cls}${on ? ' on' : ''}`, title, 'aria-label': title, 'aria-pressed': pressed == null ? null : pressed ? 'true' : 'false', onclick: fn }, ic ? icon(ic, 20) : null, h('span', {}, label));

  function paintTransport() {
    if (!S.model) return transportEl.replaceChildren();
    transportEl.replaceChildren(
      tbtn2('Bar', 'Previous bar', () => jumpBar(-1), { ic: 'skipBack' }),
      tbtn2(S.playing ? 'Stop' : 'Play', S.playing ? 'Stop' : `Play from bar ${S.sel.bar + 1}`, togglePlay, { ic: S.playing ? 'stop' : 'play', cls: 'play', on: S.playing }),
      tbtn2('Bar', 'Next bar', () => jumpBar(1), { ic: 'skipFwd' }),
      tbtn2(`Loop ${S.loopBars}`, `Loop ${S.loopBars} bar${S.loopBars > 1 ? 's' : ''} from the selected bar (change the length in Tracks)`, () => {
        S.loop = !S.loop;
        if (S.playing) startPlay(S.sel.bar);
        else paintTransport();
        draw();
      }, { ic: 'repeat', on: S.loop }),
      tbtn2(`${Math.round(S.speed * 100)}%`, `Playback speed ${Math.round(S.speed * 100)}%. Tap to change`, () => {
        S.speed = nextSpeed(S.speed);
        if (S.playing) startPlay(S.cursor ? S.cursor.bar : S.sel.bar);
        else paintTransport();
      }, { ic: 'gauge', pressed: null }),
      tbtn2('Tracks', 'Tracks, instruments and view', openSheet, { ic: 'layers', pressed: null }),
      tbtn2('Edit', padOpen() ? 'Hide the edit pad' : 'Show the edit pad', () => setPad(!padOpen()), { ic: 'type', on: padOpen() }),
    );
  }

  function setPad(open) {
    S.pad.open = open;
    padEl.hidden = !open;
    root.classList.toggle('ts-pad-open', open);
    paintTools();
    updateDock();
    requestAnimationFrame(() => {
      draw();
      scrollToSel();
    });
  }

  const PAD_TABS = { fretted: [['fret', 'Fret'], ['len', 'Length'], ['tech', 'Technique'], ['beats', 'Bars']], drums: [['fret', 'Hits'], ['len', 'Length'], ['beats', 'Bars']] };
  function paintPad() {
    if (!S.model || !touchUI) return padEl.replaceChildren();
    const t = track();
    const b = E.beatAt(t, S.sel.bar, S.sel.beat);
    const n = t.kind === 'fretted' && b.notes.find((x) => x.s === S.sel.key);
    const tabs = PAD_TABS[t.kind];
    if (!tabs.some(([id]) => id === S.pad.tab)) S.pad.tab = 'fret';
    const keep = () => canvases[S.sel.track] && canvases[S.sel.track].focus({ preventScroll: true });
    const key = (label, title, fn, { on = false, cls = '' } = {}) => h('button', { type: 'button', class: `ts-key ${cls}${on ? ' on' : ''}`, title, 'aria-label': title, 'aria-pressed': on ? 'true' : 'false', onclick: () => (fn(), keep()) }, label);
    const nav = (label, title, fn) => h('button', { type: 'button', class: 'ts-key nav', title, 'aria-label': title, onclick: fn }, label);
    const body = {
      fret: () =>
        t.kind === 'drums'
          ? drumRows(track()).slice().reverse().map((m) => key(drumName(m), `${drumName(m)} hit`, () => ops.drum(m), { on: b.notes.some((x) => x.m === m), cls: 'word' }))
          : Array.from({ length: 25 }, (_, f) => key(String(f), `Fret ${f}`, () => {
              S.typed = '';
              edit(() => E.setFret(t, S.sel.bar, S.sel.beat, S.sel.key, f));
            }, { on: !!n && !n.tech.x && n.f === f })),
      len: () => [...E.DURATIONS.map((d) => key(DUR_LABEL[d], `${DUR_NAME[d]} note`, () => ops.dur(d), { on: b.dur === d })), key('Dot', 'Dotted', ops.dot, { on: b.dot }), key('Rest', 'Rest', ops.rest, { on: b.rest })],
      tech: () => E.TECHS.map(([k2, label]) => key(label, label, () => ops.tech(k2), { on: !!(n && n.tech[k2]), cls: 'word' })),
      beats: () => [key('+ beat', 'Insert a beat after this one', ops.insert, { cls: 'word' }), key('− beat', 'Delete this beat', ops.remove, { cls: 'word' }), key('+ bar', 'Add a bar after this one', ops.addBar, { cls: 'word' }), key('− bar', 'Delete this bar from every track', ops.delBar, { cls: 'word danger' })],
    }[S.pad.tab]();
    padEl.replaceChildren(
      h('p', { class: 'ts-pad-status', 'aria-hidden': 'true' }, describe()),
      h('div', { class: 'ts-pad-nav', role: 'toolbar', 'aria-label': 'Move and undo' },
        nav('◀', 'Previous beat', () => (moveBeat(-1), moved())),
        nav('▲', 'String above', () => (moveRow(-1), moved())),
        nav('▼', 'String below', () => (moveRow(1), moved())),
        nav('▶', 'Next beat', () => (moveBeat(1), moved())),
        nav('⌫', 'Clear the note', () => ops.clear()),
        nav('↶', 'Undo', () => ops.undo()),
        nav('↷', 'Redo', () => ops.redo()),
        phone ? nav('✕', 'Close the edit pad', () => setPad(false)) : null),
      h('div', { class: 'ts-pad-tabs', role: 'tablist', 'aria-label': 'Edit' }, tabs.map(([id, label]) => h('button', { type: 'button', role: 'tab', class: `ts-pad-tab${S.pad.tab === id ? ' on' : ''}`, 'aria-selected': S.pad.tab === id ? 'true' : 'false', onclick: () => ((S.pad.tab = id), paintPad()) }, label))),
      h('div', { class: `ts-pad-keys ${S.pad.tab}${t.kind === 'drums' ? ' drums' : ''}`, role: 'tabpanel' }, body),
    );
  }

  const INSTRUMENTS = [['Guitar · Standard E', 'Guitar'], ['Bass · Standard E', 'Bass'], ['Guitar 7 · Standard B', '7-string guitar'], ['Bass 5 · Standard B', '5-string bass'], ['drums', 'Drums']];
  function addTrackOf(v) {
    const m = S.model;
    edit(() => {
      const nt = v === 'drums' ? E.newTrack('drums', { name: 'Drums', bars: m.tracks[0].bars.length, ts: m.ts }) : E.newTrack('fretted', { name: v.startsWith('Bass') ? 'Bass' : 'Guitar', tuning: E.TUNINGS[v].slice(), bars: m.tracks[0].bars.length, ts: m.ts });
      nt.bars = nt.bars.map((_, i) => E.emptyBar(E.tsAt(m, i))); // each bar in its own time signature
      m.tracks.push(nt);
      S.sel = { track: m.tracks.length - 1, bar: 0, beat: 0, key: v === 'drums' ? 36 : 1 };
    });
    render();
  }
  const toggleMute = (t) => (S.muted.has(t.id) ? S.muted.delete(t.id) : S.muted.add(t.id));

  let sheetEl = null;
  let sheetBack = null;
  function openSheet() {
    S.sheet = true;
    paintSheet(true);
  }
  function closeSheet() {
    S.sheet = false;
    if (sheetEl) sheetEl.remove();
    if (sheetBack) sheetBack.remove();
    sheetEl = sheetBack = null;
    const back = transportEl.querySelector('[aria-label="Tracks, instruments and view"]');
    if (back) back.focus({ preventScroll: true });
  }
  function paintSheet(focus = false) {
    if (!S.sheet || !S.model || !touchUI) return;
    const m = S.model;
    const seg = (label, opts, cur, set) => h('div', { class: 'ts-seg', role: 'group', 'aria-label': label }, h('span', { class: 'ts-seg-label' }, label), opts.map(([v, l]) => h('button', { type: 'button', class: `ts-key word${cur === v ? ' on' : ''}`, 'aria-pressed': cur === v ? 'true' : 'false', onclick: () => set(v) }, l)));
    const rerender = () => {
      render();
    };
    const content = [
      h('div', { class: 'ts-sheet-head' }, h('h3', {}, 'Tracks'), h('button', { type: 'button', class: 'ts-key nav', 'aria-label': 'Close', title: 'Close', onclick: closeSheet }, '✕')),
      h('div', { class: 'ts-sheet-tracks' }, m.tracks.map((t, i) => h('div', { class: 'ts-sheet-row' },
        h('button', { type: 'button', class: `ts-pick${i === S.sel.track ? ' on' : ''}`, 'aria-pressed': i === S.sel.track ? 'true' : 'false', onclick: () => {
          S.sel.track = i;
          S.sel.bar = Math.min(S.sel.bar, t.bars.length - 1);
          S.sel.beat = 0;
          S.sel.key = t.kind === 'drums' ? 36 : 1;
          closeSheet();
          render();
        } }, icon(t.kind === 'drums' ? 'activity' : 'guitar', 18), h('span', { class: 'ts-pick-name' }, t.name), h('span', { class: 'muted tiny' }, t.kind === 'drums' ? 'Drums' : t.tuning.slice().reverse().map((x) => NOTE[x % 12]).join(' '))),
        h('button', { type: 'button', class: `ts-key word${S.muted.has(t.id) ? ' on' : ''}`, 'aria-pressed': S.muted.has(t.id) ? 'true' : 'false', 'aria-label': `Mute ${t.name}`, onclick: () => (toggleMute(t), rerender()) }, S.muted.has(t.id) ? 'Muted' : 'Mute')))),
      m.tracks.length > 1 ? seg('Show', [[true, 'This track'], [false, 'All tracks']], !!oneTrack(), (v) => ((S.oneTrack = v), rerender())) : null,
      h('h4', {}, 'Add a track'),
      h('div', { class: 'ts-sheet-grid' }, INSTRUMENTS.map(([v, l]) => h('button', { type: 'button', class: 'ts-key word', onclick: () => {
        closeSheet();
        addTrackOf(v);
      } }, `+ ${l}`))),
      h('h4', {}, 'View'),
      seg('Bars', [[true, 'Wrap to screen'], [false, 'One long line']], S.wrap, (v) => ((S.wrap = v), rerender())),
      h('div', { class: 'ts-seg', role: 'group', 'aria-label': 'Tab size' }, h('span', { class: 'ts-seg-label' }, 'Size'),
        h('button', { type: 'button', class: 'ts-key word', 'aria-label': 'Smaller tab', onclick: () => setZoom(S.zoom - 0.15) }, 'A−'),
        h('output', { class: 'ts-zoom' }, `${Math.round(S.zoom * 100)}%`),
        h('button', { type: 'button', class: 'ts-key word', 'aria-label': 'Bigger tab', onclick: () => setZoom(S.zoom + 0.15) }, 'A+')),
      seg('Loop', [[1, '1 bar'], [2, '2 bars'], [4, '4 bars'], [8, '8 bars']], S.loopBars, (v) => {
        S.loopBars = v;
        if (S.playing && S.loop) startPlay(S.loopFrom != null ? S.loopFrom : S.sel.bar);
        paintTransport();
        paintSheet();
      }),
      h('p', { class: 'muted tiny' }, 'Pinch the tab to resize it. Tap a bar number to play from that bar.'),
    ];
    if (!sheetEl) {
      sheetBack = h('div', { class: 'ts-sheet-back', onclick: closeSheet });
      sheetEl = h('div', { class: 'ts-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Tracks and view' });
      sheetEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          closeSheet();
        }
      });
    }
    sheetEl.replaceChildren(...content.filter(Boolean));
    if (!sheetEl.isConnected) root.append(sheetBack, sheetEl);
    if (focus) sheetEl.querySelector('button').focus({ preventScroll: true });
  }

  function setZoom(z) {
    S.zoom = clampZoom(z);
    try {
      localStorage.setItem('pvm.tabZoom', String(S.zoom));
    } catch {
      /* private mode */
    }
    draw();
    scrollToSel();
    paintSheet();
  }

  /** Room at the bottom (and side) of the page for the fixed playback bar and edit pad. */
  function updateDock() {
    if (!touchUI) return;
    const tb = transportEl.getBoundingClientRect().height || 0;
    const pad = padEl.hidden ? 0 : padEl.getBoundingClientRect();
    const side = pad && pad.width && pad.width < window.innerWidth * 0.6;
    root.style.setProperty('--ts-transport-h', `${Math.round(tb)}px`);
    root.style.setProperty('--ts-dock', `${Math.round(tb + (pad && !side ? pad.height : 0))}px`);
    root.style.setProperty('--ts-side', `${Math.round(side ? pad.width : 0)}px`);
  }
  const dockObs = typeof ResizeObserver === 'function' ? new ResizeObserver(() => updateDock()) : null;
  if (dockObs) {
    dockObs.observe(transportEl);
    dockObs.observe(padEl);
  }

  const issuesEl = h('div', { class: 'ts-issues small' });
  function paintIssues() {
    const iss = S.model ? E.checkModel(S.model) : [];
    issuesEl.replaceChildren(...(iss.length ? [h('strong', {}, iss.some((i) => !i.short) ? 'Fix before saving: ' : 'Note: '), iss.slice(0, 4).map((i) => i.message).join('; '), iss.length > 4 ? ` and ${iss.length - 4} more` : ''] : []));
  }
  /** Import check: what loading the Guitar Pro file skipped or guessed, in Tab Studio and in the video's tab layers. */
  const KIND_LABEL = { skipped: 'Skipped', guessed: 'Guessed', changed: 'Changed' };
  function importBox() {
    const rec = S.sourceId ? media.get(S.sourceId) : null;
    if (!S.model || !rec || rec.kind !== 'tab') return null;
    const items = [...(S.model.importNotes || []).map((n) => ({ ...n, where: 'Tab Studio' })), ...(rec.importNotes || []).map((n) => ({ ...n, where: 'Video' }))];
    if (!items.length) return null;
    const box = h('details', { class: 'ts-import small', open: S.importOpen != null ? S.importOpen : !phone },
      h('summary', {}, h('strong', {}, 'Import check'), ` · ${items.length} thing${items.length === 1 ? '' : 's'} in “${rec.name}” we could not read exactly`),
      h('ul', {}, items.map((n) => h('li', {}, h('span', { class: `ts-import-kind ${n.kind}` }, KIND_LABEL[n.kind] || n.kind), ` ${n.where}: ${n.text}`, n.bars && n.bars.length ? h('span', { class: 'muted' }, ` (bar${n.bars.length > 1 ? 's' : ''} ${E.barList(n.bars)})`) : ''))),
      h('p', { class: 'muted tiny' }, 'Everything else matches the file. If something still looks wrong, send the .gp file and the bar number.'));
    box.addEventListener('toggle', () => (S.importOpen = box.open));
    return box;
  }

  /** Touch on the tab: tap selects (tap again or long-press for the pad), swipe sideways moves, pinch resizes, a tap on a bar number plays from there. */
  function touchGestures(c, ti) {
    const ptrs = new Map();
    let g0 = null;
    let pinch0 = null;
    const dist = () => {
      const [a, b] = [...ptrs.values()];
      return Math.hypot(a.x - b.x, a.y - b.y) || 1;
    };
    c.addEventListener('pointerdown', (ev) => {
      ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (ptrs.size === 1) g0 = { x: ev.clientX, y: ev.clientY, t: performance.now(), id: ev.pointerId };
      else if (ptrs.size === 2) {
        pinch0 = { d: dist(), z: S.zoom };
        g0 = null;
      }
    });
    c.addEventListener('pointermove', (ev) => {
      if (!ptrs.has(ev.pointerId)) return;
      ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pinch0 && ptrs.size === 2) {
        ev.preventDefault();
        const z = clampZoom(pinch0.z * (dist() / pinch0.d));
        if (Math.abs(z - S.zoom) >= 0.04) setZoom(z);
      }
    });
    const end = (ev) => {
      ptrs.delete(ev.pointerId);
      if (pinch0) {
        if (!ptrs.size) pinch0 = null;
        g0 = null;
        return;
      }
      if (ev.type === 'pointercancel' || !g0 || g0.id !== ev.pointerId) return (g0 = null);
      const g = readGesture(ev.clientX - g0.x, ev.clientY - g0.y, performance.now() - g0.t);
      g0 = null;
      if (g.kind === 'swipe') {
        if (Math.abs(g.step) === 2) return jumpBar(Math.sign(g.step));
        moveBeat(g.step);
        return moved();
      }
      if (g.kind === 'none') return;
      const at = hit(ti, ev, { strip: true });
      if (!at) return;
      const same = S.sel.track === at.track && S.sel.bar === at.bar && S.sel.beat === at.beat && S.sel.key === at.key;
      const strip = at.strip;
      delete at.strip;
      S.sel = at;
      S.typed = '';
      clampSel();
      if (strip || S.playing) {
        draw();
        paintTools();
        return startPlay(S.sel.bar);
      }
      if (g.kind === 'long' || (same && !padOpen())) return setPad(true);
      draw();
      paintTools();
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    // a long press selects the note; no copy menu or text selection
    c.addEventListener('contextmenu', (ev) => ev.preventDefault());
  }

  function trackBlock(t, ti) {
    const c = h('canvas', { class: 'ts-canvas', tabindex: 0, role: 'application', 'aria-roledescription': 'tab editor', 'aria-label': `${t.name} tab. Arrow keys move, digits type frets, + and − change length, I inserts a beat, R makes a rest, Space plays.` });
    // the spacer is as wide as the whole tab; the canvas sticks to the left and draws what's in view
    const spacer = h('div', { class: 'ts-spacer' }, c);
    const scroller = h('div', { class: `ts-scroll${touchUI && S.wrap ? ' ts-wrap' : ''}` }, spacer);
    c._spacer = spacer;
    c._scroller = scroller;
    scroller.addEventListener('scroll', () => {
      drawTrack(ti);
      canvases.forEach((o, j) => {
        if (o && j !== ti && Math.abs(o._scroller.scrollLeft - scroller.scrollLeft) > 1) o._scroller.scrollLeft = scroller.scrollLeft;
      });
    });
    c.addEventListener('pointerdown', (ev) => {
      if (touchUI && ev.pointerType !== 'mouse') return; // touch: see touchGestures (a tap selects on lift, so scrolling doesn't)
      const at = hit(ti, ev);
      if (!at) return;
      S.sel = at;
      S.typed = '';
      c.focus();
      draw();
      paintTools();
    });
    if (touchUI) touchGestures(c, ti);
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
    const mute = h('button', { type: 'button', class: `btn ghost sm${S.muted.has(t.id) ? ' on' : ''}`, 'aria-pressed': S.muted.has(t.id) ? 'true' : 'false', onclick: () => (toggleMute(t), render()) }, S.muted.has(t.id) ? 'Muted' : 'Mute');
    const shift = (d) => edit(() => {
      if (d > 0) t.bars.unshift(E.emptyBar(S.model.ts));
      else if (t.bars[0].beats.every((b) => b.rest)) t.bars.shift();
      else return false;
      E.alignTracks(S.model);
    });
    const kind = h('span', { class: 'ts-kind' }, icon(t.kind === 'drums' ? 'activity' : 'guitar', 14));
    const stemNote = t.stemId ? h('span', { class: 'muted tiny' }, `from ${(media.get(t.stemId) || {}).name || 'a stem'}`) : null;
    const actions = [
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
    ];
    let head;
    if (touchUI) {
      // touch: the name, then a Track button that opens tuning, moving, mute and delete, so the tab gets the room
      const open = S.headOpen === t.id;
      head = h('div', { class: 'ts-head' }, kind, nameIn,
        h('button', { type: 'button', class: `btn ghost ts-more-btn${open ? ' on' : ''}`, 'aria-expanded': open ? 'true' : 'false', title: `${t.name} settings`, onclick: () => ((S.headOpen = open ? null : t.id), render()) }, icon('settings', 18), h('span', {}, 'Track')),
        open ? h('div', { class: 'ts-more' }, tun, stemNote, actions) : null);
    } else head = h('div', { class: 'ts-head' }, kind, nameIn, tun, stemNote, h('span', { class: 'spacer' }), actions);
    return h('section', { class: `ts-track${ti === S.sel.track ? ' on' : ''}` }, head, scroller);
  }

  function render() {
    stopPlayQuiet();
    touchUI = touchMq.matches;
    phone = touchUI && phoneMq.matches;
    root.classList.toggle('ts-touch', touchUI);
    root.classList.toggle('ts-phone', phone);
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
      S.model && S.model.tracks.some((t) => t.kind !== 'drums') ? button('Use as MIDI notes', useAsMidi, { iconName: 'music', variant: 'sm', title: 'Save the notes as a .mid and add a MIDI notes layer to the video. The rhythm game can use the file too.' }) : null,
      S.model ? button(S.dirty ? 'Save as new .gp' : 'Saved', () => save(), { iconName: 'download', variant: `sm${S.dirty ? ' primary' : ''}`, disabled: !S.dirty }) : null,
      S.model ? button('Save & use in video', () => save({ use: true }), { iconName: 'check', variant: 'sm' }) : null,
    );
    if (!S.model) {
      transportEl.remove();
      padEl.remove();
      closeSheet();
      root.replaceChildren(...[head, fileBar, songLine(), S.showTx ? txPanel() : null,
        h('div', { class: 'ts-empty' },
          h('p', {}, 'Open a Guitar Pro file from your media, start a new tab, or make one from your stems.'),
          h('div', { class: 'row' }, files.length ? button(`Open “${files[0].name}”`, () => open(files[0]), { variant: 'primary' }) : null, button('New tab', fresh, { iconName: 'plus' }), button('Make tab from stems…', () => ((S.showTx = true), render()), { iconName: 'wand' })))].filter(Boolean));
      return;
    }
    clampSel();
    const m = S.model;
    const title = h('input', { type: 'text', value: m.title, 'aria-label': 'Song title', class: 'ts-title' });
    title.addEventListener('change', () => edit(() => (m.title = title.value.trim() || m.title)));
    const tempo = h('input', { type: 'number', min: 30, max: 300, value: m.tempo, class: 'num', 'aria-label': 'Tempo (BPM)', inputmode: 'numeric' });
    tempo.addEventListener('change', () => edit(() => (m.tempo = Math.max(30, Math.min(300, Number(tempo.value) || m.tempo)))));
    const ts = h('select', { 'aria-label': 'Time signature' }, ['4/4', '3/4', '6/8', '12/8', '5/4', '7/8', '2/4'].map((x) => h('option', { value: x, selected: x === `${m.ts[0]}/${m.ts[1]}` }, x)));
    ts.addEventListener('change', () => edit(() => {
      m.ts = ts.value.split('/').map(Number);
    }));
    const addTrack = h('select', { 'aria-label': 'Add a track' }, h('option', { value: '' }, '+ Add a track…'), INSTRUMENTS.map(([v, l]) => h('option', { value: v }, l)));
    addTrack.addEventListener('change', () => addTrack.value && addTrackOf(addTrack.value));
    const songBar = h('div', { class: 'page-bar ts-song' }, field('Title', title), field('Tempo', tempo), field('Time', ts), addTrack,
      h('span', { class: 'muted tiny' }, m.offset != null ? `Bar 1 plays at ${m.offset.toFixed(2)} s into the song.` : ''));
    const shown = oneTrack() ? [S.sel.track] : m.tracks.map((_, i) => i);
    const tracksEl = h('div', { class: 'ts-tracks' }, shown.map((i) => trackBlock(m.tracks[i], i)));
    const keys = h('details', { class: 'ts-keys small' }, h('summary', {}, touchUI ? 'Help' : 'Keyboard'),
      h('ul', {},
        touchUI ? h('li', {}, 'Tap a beat on a string to select it; tap it again (or press and hold, or Edit) for the edit pad. Swipe sideways to move one beat, a long swipe moves a bar. Pinch to resize the tab. Tap a bar number to play from that bar.') : null,
        h('li', {}, 'Arrows move between beats and strings (up/down past the edge goes to the next track).'),
        h('li', {}, 'Type a fret number (two digits quickly for 10–24). Backspace clears the note.'),
        h('li', {}, '+ / − make the beat longer or shorter, . adds a dot, R makes a rest, I inserts a beat, Shift+Delete removes it.'),
        h('li', {}, 'H hammer-on, S slide, B bend, V vibrato, P palm mute, X dead note, G ghost note.'),
        h('li', {}, 'Drums: pick a row and press Enter (or double-click) to add or remove a hit.'),
        h('li', {}, 'Space plays from the selected bar. Ctrl+Z / Ctrl+Y undo and redo.')));
    if (touchUI) {
      // touch: file and song settings fold away (open on tablets), the tab gets the screen, and the
      // playback bar and edit pad sit at the bottom
      const fold = h('details', { class: 'ts-filesong', open: S.fileOpen != null ? S.fileOpen : !phone }, h('summary', {}, 'File & song', S.dirty ? h('span', { class: 'ts-dirty' }, ' · not saved') : null), fileBar, songBar);
      fold.addEventListener('toggle', () => (S.fileOpen = fold.open));
      const pickTrack = oneTrack() ? h('button', { type: 'button', class: 'btn ts-trackpick', onclick: openSheet, title: 'Pick a track' }, icon('layers', 18), h('span', {}, `${track().name} · ${S.sel.track + 1} of ${m.tracks.length}`)) : null;
      padEl.hidden = !padOpen();
      root.classList.toggle('ts-pad-open', padOpen());
      root.replaceChildren(...[head, songLine(), fold, S.showTx ? txPanel() : null, pickTrack, status, importBox(), tracksEl, issuesEl, keys, padEl, transportEl].filter(Boolean));
      if (sheetEl) {
        sheetEl = null;
        sheetBack = null;
      }
      paintSheet();
    } else {
      transportEl.remove();
      padEl.remove();
      root.classList.remove('ts-pad-open');
      root.style.removeProperty('--ts-dock');
      root.style.removeProperty('--ts-side');
      root.replaceChildren(...[
        head,
        fileBar,
        songLine(),
        S.showTx ? txPanel() : null,
        songBar,
        tools,
        status,
        importBox(),
        tracksEl,
        issuesEl,
        keys,
      ].filter(Boolean));
    }
    paintTools();
    requestAnimationFrame(() => {
      updateDock();
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

  const onResize = () => S.model && (updateDock(), draw());
  window.addEventListener('resize', onResize);
  // phone <-> tablet <-> desktop (rotating, resizing the window): lay the page out again
  const onMq = () => render();
  touchMq.addEventListener('change', onMq);
  phoneMq.addEventListener('change', onMq);
  // wrapped tabs draw only what is on screen, so they redraw as the page scrolls
  let scrollRaf = 0;
  const onScroll = () => {
    if (!touchUI || !S.wrap || scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      canvases.forEach((c, i) => c && drawTrack(i, { lazy: true }));
    });
  };
  document.addEventListener('scroll', onScroll, true);
  // the first tap turns sound on (mobile browsers block it until then)
  const onFirstTap = () => {
    if (!touchUI) return;
    unlockAudio();
    if (audioCtx && audioCtx.state === 'running') for (const t of TAP_EVENTS) root.removeEventListener(t, onFirstTap);
  };
  // browsers differ in which of these counts as the tap that allows sound (iOS: touchend), so listen to all three
  const TAP_EVENTS = ['pointerup', 'touchend', 'click'];
  for (const t of TAP_EVENTS) root.addEventListener(t, onFirstTap);
  // open the selected song's tab (or the next song's, see followSong); with no song selected, the tab the video uses
  if (!followSong() && !S.model && !curSong()) {
    const p = store.get();
    const L = (p.layers || []).find((l) => l.type === 'tab' && l.mediaId && media.get(l.mediaId) && media.get(l.mediaId).score);
    if (L) {
      S.model = E.fromScore(media.get(L.mediaId).score);
      E.alignTracks(S.model);
      S.model.offset = L.offset;
      S.sourceId = L.mediaId;
      S.sel = { track: modelTrackOf(S.model, L.track), bar: 0, beat: 0, key: 1 };
    }
  }
  let shownSong = curSong() ? curSong().id : '';
  render();
  return {
    el: root,
    render,
    /** The selected song changed while the page is open. */
    songChanged() {
      const s = curSong();
      if ((s ? s.id : '') === shownSong) return;
      shownSong = s ? s.id : '';
      followSong();
      render();
    },
    leave() {
      stopPlayQuiet();
      window.removeEventListener('resize', onResize);
      touchMq.removeEventListener('change', onMq);
      phoneMq.removeEventListener('change', onMq);
      document.removeEventListener('scroll', onScroll, true);
      if (dockObs) dockObs.disconnect();
      closeSheet();
    },
  };
}
