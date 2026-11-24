// The tempo control: BPM box, Tap tempo, ×2, ÷2, "Use the song's BPM", and where the first beat is.
// One control for the project's tempo (Audio tab) and for the effects that can follow their own (a clip's beat
// effects, the Look's beat flash, drum and rhythm game layers). The maths is in tempo.js.
import { h, button, toast } from './dom.js';
import { timelineToSong } from './core.js';
import { findClip, findLayer } from './state.js';
import { media } from './media.js';
import { clampBpm, doubleBpm, halfBpm, tapTempo, gridFromBpm, gridFirst, gridLength, gridOf, songBpmOf, tempoSource, SOURCE_LABEL, DEFAULT_BPM, MIN_BPM, MAX_BPM } from './tempo.js';

const songSeconds = (p) => {
  const rec = p.song && media.get(p.song.mediaId);
  return rec && rec.duration ? rec.duration : 0;
};
// Tap times per control, kept outside the control: a tap changes the tempo, which can rebuild the panel.
const TAPS = new Map();
const fmt = (v) => String(+(+v).toFixed(2));

/** The project's own tempo: `project.beats`. */
export const projectTarget = () => ({
  id: 'project',
  own: () => true,
  read(p) {
    const g = p.beats;
    return { bpm: g ? g.bpm : DEFAULT_BPM, first: gridFirst(g), source: tempoSource(g) };
  },
  write(d, { bpm, first, source }) {
    d.beats = gridFromBpm(bpm, first, gridLength(d, songSeconds(d)), source);
  },
});

/** An effect with its own tempo: `host(draftOrProject).tempo`. Without one it follows the project's. */
export const hostTarget = (id, host) => ({
  id,
  own: (p) => !!(host(p) && host(p).tempo),
  read(p) {
    const x = host(p);
    if (x && x.tempo) return { bpm: x.tempo.bpm, first: +x.tempo.first || 0, source: 'effect' };
    const g = p.beats;
    return { bpm: g ? g.bpm : DEFAULT_BPM, first: gridFirst(g), source: tempoSource(g), inherited: true };
  },
  write(d, { bpm, first }) {
    const x = host(d);
    if (x) x.tempo = { bpm: clampBpm(bpm), first: Math.round(Math.max(0, first || 0) * 1000) / 1000 };
  },
  clear(d) {
    const x = host(d);
    if (x) delete x.tempo;
  },
});

export const clipTempoTarget = (id) => hostTarget(`clip:${id}`, (p) => (findClip(p, id) || {}).clip);
export const lookTempoTarget = () => hostTarget('look', (p) => p.look);
export const layerTempoTarget = (id) => hostTarget(`layer:${id}`, (p) => findLayer(p, id));

/** A polyrhythm layer: its own `bpm` and `first`, or (followSong) the project's beats. */
export const polyTempoTarget = (id) => ({
  id: `poly:${id}`,
  own: (p) => (findLayer(p, id) || {}).followSong === false,
  read(p) {
    const x = findLayer(p, id) || {};
    if (x.followSong !== false && p.beats) return { bpm: p.beats.bpm, first: gridFirst(p.beats), source: tempoSource(p.beats), inherited: true };
    return { bpm: clampBpm(x.bpm, DEFAULT_BPM), first: +x.first || 0, source: x.followSong === false ? 'effect' : 'default' };
  },
  write(d, { bpm, first }) {
    const x = findLayer(d, id);
    if (x) Object.assign(x, { followSong: false, bpm: clampBpm(bpm), first: Math.round(Math.max(0, first || 0) * 1000) / 1000 });
  },
  clear(d) {
    const x = findLayer(d, id);
    if (x) x.followSong = true;
  },
});

/**
 * A Guitar Pro, MIDI or drum chart layer: its tempo is the file's BPM × the layer's `tempoScale`.
 * `base()` is the file's BPM. No first beat: where the chart starts is "Starts at" in Sync with the song.
 */
export const chartTempoTarget = (id, base) => ({
  id: `chart:${id}`,
  own: (p) => Math.abs(((findLayer(p, id) || {}).tempoScale ?? 1) - 1) > 1e-6,
  read(p) {
    const sc = (findLayer(p, id) || {}).tempoScale ?? 1;
    return { bpm: (base() || DEFAULT_BPM) * sc, first: 0, source: Math.abs(sc - 1) > 1e-6 ? 'set' : 'file' };
  },
  write(d, { bpm }) {
    const x = findLayer(d, id);
    if (x) x.tempoScale = +(clampBpm(bpm) / (base() || DEFAULT_BPM)).toFixed(4);
  },
  clear(d) {
    const x = findLayer(d, id);
    if (x) x.tempoScale = 1;
  },
  clearLabel: 'Use the file’s tempo',
});

/**
 * b: the panel's Binder. ctx: { store, engine, ui }. target: from above. opts.title: heading (default "Tempo").
 * Changes show in the preview at once and are one undo step each (typing counts once, when committed).
 */
export function tempoControl(b, ctx, target, { title = 'Tempo', note = '', first: withFirst = true, songButton = true } = {}) {
  const { store, engine, ui } = ctx;
  const key = `tempo:${target.id}`;
  const k = (name) => ({ 'data-k': name });
  const read = () => target.read(store.get());
  const commit = (patch, undoKey = null) => {
    const cur = read();
    const source = patch.source || (cur.source === 'song' && patch.bpm === undefined && !cur.inherited ? 'song' : 'set');
    const next = { ...cur, ...patch, source, bpm: clampBpm(patch.bpm ?? cur.bpm, cur.bpm) };
    store.update((d) => target.write(d, next), undoKey);
    return next.bpm;
  };

  const box = h('input', { type: 'number', min: MIN_BPM, max: MAX_BPM, step: 0.1, class: 'num', 'aria-label': `${title} (BPM)`, ...k('tempo-bpm') });
  box.addEventListener('change', () => {
    const raw = parseFloat(box.value);
    if (!Number.isFinite(raw)) return void (box.value = fmt(read().bpm));
    const v = clampBpm(raw);
    if (v !== raw) toast(`The tempo stays between ${MIN_BPM} and ${MAX_BPM} BPM (set to ${fmt(v)}).`);
    commit({ bpm: v });
    box.value = fmt(v);
  });

  const tap = () => {
    if (!TAPS.has(target.id)) TAPS.set(target.id, []);
    const taps = TAPS.get(target.id);
    taps.push(performance.now());
    if (taps.length > 16) taps.shift();
    const v = tapTempo(taps);
    if (v) commit({ bpm: v }, `tap:${target.id}`);
    else toast('Keep tapping on the beat…');
  };
  const scale = (fn, name) => () => {
    const cur = read().bpm;
    const v = fn(cur);
    if (v === clampBpm(cur)) return toast(`That would leave the ${MIN_BPM}–${MAX_BPM} BPM range.`);
    commit({ bpm: v });
  };

  const src = h('span', { class: 'tempo-src muted tiny', ...k('tempo-source') });
  const first = h('input', { type: 'number', min: 0, step: 0.01, class: 'num', 'aria-label': 'First beat at (seconds into the song)', ...k('tempo-first') });
  first.addEventListener('change', () => {
    const v = parseFloat(first.value);
    if (Number.isFinite(v)) commit({ first: Math.max(0, v) });
    else first.value = fmt(read().first);
  });
  const nudge = (s) => commit({ first: Math.max(0, +(read().first + s).toFixed(3)) }, `${key}:nudge`);
  const atPlayhead = () => {
    const p = store.get();
    commit({ first: Math.max(0, +timelineToSong(engine.t, p.song).toFixed(3)) });
    toast('First beat is now at the playhead');
  };

  const songBtn = button('Use the song’s BPM', () => {
    const v = songBpmOf((ui.songContext && ui.songContext() || {}).song);
    if (v) commit({ bpm: v, source: 'song' });
  }, { variant: 'sm', title: 'Use the BPM saved on the song in Songs & releases' });
  songBtn.setAttribute('data-k', 'tempo-song');
  const sameBtn = button(target.clearLabel || 'Same as the project', () => store.update((d) => target.clear(d)), { variant: 'ghost sm', title: 'Follow the project’s tempo again' });
  sameBtn.setAttribute('data-k', 'tempo-same');
  const saveBtn = button('Save as the song’s BPM', () => {
    const v = read().bpm;
    if (ui.saveSongBpm && ui.saveSongBpm(v)) toast(`Saved ${fmt(v)} BPM on the song`);
  }, { variant: 'ghost sm', title: 'Write this tempo into the song’s BPM box in Songs & releases' });
  saveBtn.setAttribute('data-k', 'tempo-save');
  const btn = (label, fn, name, title) => {
    const el = button(label, fn, { variant: 'sm', title });
    el.setAttribute('data-k', name);
    return el;
  };

  b._reg((p) => {
    const cur = target.read(p);
    if (document.activeElement !== box) box.value = fmt(cur.bpm);
    if (document.activeElement !== first) first.value = fmt(cur.first);
    src.textContent = cur.inherited ? `following the project: ${fmt(cur.bpm)} BPM (${SOURCE_LABEL[cur.source]})` : SOURCE_LABEL[cur.source];
    src.dataset.source = cur.inherited ? 'project' : cur.source;
    const sc = ui.songContext ? ui.songContext() : null;
    const sb = songBpmOf(sc && sc.song);
    songBtn.hidden = !sb || !songButton;
    if (sb && songButton) {
      songBtn.querySelector('span').textContent = `Use the song’s BPM (${fmt(sb)})`;
      // when nothing is chosen yet and the song has a BPM, this is the suggested way in
      songBtn.classList.toggle('primary', !target.own(p) || (cur.source === 'default' && !p.beats));
      songBtn.classList.toggle('on', cur.source === 'song');
    }
    sameBtn.hidden = !target.clear || !target.own(p);
    saveBtn.hidden = !(sc && sc.song && target.id === 'project' && p.beats && Math.abs(cur.bpm - sb) > 0.005);
  });

  return h(
    'div',
    { class: 'tempo-ctl', 'data-tempo': target.id },
    h('div', { class: 'tempo-head' }, h('span', { class: 'small' }, title), src),
    h('div', { class: 'row tempo-row' }, box, h('span', { class: 'muted small' }, 'BPM'), btn('Tap tempo', tap, 'tempo-tap', 'Tap on the beat; the average of your taps sets the tempo'), btn('×2', scale(doubleBpm), 'tempo-x2', 'Double the tempo'), btn('÷2', scale(halfBpm), 'tempo-half', 'Half the tempo')),
    h('div', { class: 'row' }, songBtn, sameBtn, saveBtn),
    h(
      'div',
      { class: 'row tempo-row', hidden: !withFirst },
      h('span', { class: 'small' }, 'First beat at'),
      first,
      h('span', { class: 'muted small' }, 's'),
    ),
    h(
      'div',
      { class: 'row tempo-row', hidden: !withFirst },
      ...[-0.5, -0.05, 0.05, 0.5].map((s) => btn(`${s > 0 ? '+' : '−'}${Math.abs(s)}`, () => nudge(s), `tempo-nudge`, `Move the first beat by ${s} s`)),
      btn('Set first beat at the playhead', atPlayhead, 'tempo-first-play', 'Put the first beat where the playhead is, in the song'),
    ),
    note ? h('p', { class: 'muted tiny' }, note) : null,
  );
}

/** One line for places that only follow the project's tempo, with the numbers it has now. */
export const tempoSummary = (p) => `${fmt(p.beats ? p.beats.bpm : DEFAULT_BPM)} BPM (${SOURCE_LABEL[tempoSource(p.beats)]})`;
export { gridOf };
