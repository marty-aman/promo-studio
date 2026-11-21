// Layers panel: add, show/hide, reorder and edit stacked layers
// (video layers, guitar tabs, drum charts, audio visualizers).
import { uid, timelineToSong, songToTimeline, formatTime } from './core.js';
import { LAYER_TYPES, isVisible, findLayer } from './state.js';
import { media, tabTimeline, drumTimeline, drumHitsFromStem, vizFeatures } from './media.js';
import { MIDI_ACCEPT, noteCounts } from './midi.js';
import { guessEngines, engineGroups, noteName } from './drummap.js';
import { defaultMidiLayer, midiNotesFor, MIDI_STYLES, MIDI_PLACEMENT, MIDI_COLOR_MODES } from './midiviz.js';
import { syncLayer, syncKind, SURE_TEXT } from './layersync.js';
import { midiDrumTrack } from './drums.js';

/** A drum layer's track and drum map for a MIDI file: the drum track, and the map its notes fit best. */
export function midiDrumDefaults(midi) {
  const track = midiDrumTrack(midi);
  const best = guessEngines(noteCounts(midi, { tracks: track >= 0 ? [track] : null }), 1)[0];
  return { track, drumMap: best && best.fit >= 0.9 ? best.engine.id : 'general_midi' };
}
import { defaultTabLayer } from './tab.js';
import { defaultDrumLayer, LANES, DRUM_STYLES, STYLE_PLACEMENT, FIXED_PIECES, KIT_PRESETS, pieceOn, laneColorOf } from './drums.js';
import { TAB_STYLES, TAB_PLACEMENT, stringColor } from './tabviz.js';
import { REAL_PLACEMENT } from './vizreal.js';
import { themeById, themeLayer } from './themes.js';
import { defaultVizLayer, VIZ_STYLES, BLENDS, setVizStyle } from './viz.js';
import { isPoly, polyTiming, parseRatios, POLY_DEFAULTS } from './vizpoly.js';
import { tabIntoLayout } from './templates.js';
import { EXITS, ENTRANCES } from './exits.js';
import { KIT_FINISHES, KIT_WRAPS, kitDoubleKick } from './drumkit.js';
import { h, icon, button, iconButton, toast, field, section, fold, pickFiles } from './dom.js';

export const TAB_ACCEPT = '.gp,.gp3,.gp4,.gp5,.gpx,.gp7,.gp8,.musicxml,.mxl,.xml';

const FIXED_ROWS = [
  ['video', 'Main video', 'film'],
  ['text', 'Text overlays', 'type'],
  ['lyrics', 'Lyrics', 'mic'],
  ['endcard', 'End card', 'disc'],
  ['song', 'Song audio', 'music', true],
];

/** Create a layer of `type` with sensible defaults, using media already in the library. */
export function makeLayer(p, type, t = 0) {
  const L = makeLayerRaw(p, type, t);
  const th = p.theme && themeById(p.theme.id);
  return th ? themeLayer(L, th, p.theme.colors) : L;
}

function makeLayerRaw(p, type, t = 0) {
  const n = (p.layers || []).filter((l) => l.type === type).length + 1;
  const base = { id: uid('lyr'), type, name: `${LAYER_TYPES[type].label}${n > 1 ? ` ${n}` : ''}`, visible: true };
  const all = media.all();
  if (type === 'video') return { ...base, opacity: 1, blend: 'source-over', clips: [] };
  if (type === 'tab') {
    const rec = all.find((m) => m.kind === 'tab' && m.tracks && m.tracks.length);
    return { ...defaultTabLayer(), ...base, mediaId: rec ? rec.id : null, track: rec ? rec.tracks[0].index : 0, offset: +timelineToSong(0, p.song).toFixed(3) };
  }
  if (type === 'drums') {
    const gp = all.find((m) => m.kind === 'tab' && m.drumTracks && m.drumTracks.length);
    const stem = all.find((m) => m.kind === 'audio' && (!p.song || m.id !== p.song.mediaId));
    return gp
      ? { ...defaultDrumLayer(), ...base, source: 'gp', mediaId: gp.id, track: gp.drumTracks[0].index, offset: +timelineToSong(0, p.song).toFixed(3) }
      : { ...defaultDrumLayer(), ...base, source: 'audio', mediaId: stem ? stem.id : null, offset: 0 };
  }
  if (type === 'midi') {
    const rec = all.find((m) => m.kind === 'midi' && m.midi && m.midi.tracks.some((t) => t.notes && !t.isDrum)) || all.find((m) => m.kind === 'midi');
    return { ...defaultMidiLayer(), ...base, mediaId: rec ? rec.id : null, offset: +timelineToSong(0, p.song).toFixed(3) };
  }
  return { ...defaultVizLayer(), ...base };
}

/** A new clip on a video layer, starting at t, framed as picture-in-picture. */
export function makeOverlayClip(rec, t) {
  return {
    id: uid('clip'),
    mediaId: rec.id,
    kind: rec.kind,
    start: +t.toFixed(3),
    in: 0,
    duration: rec.kind === 'image' ? 4 : +Math.min(rec.duration || 5, 6).toFixed(2),
    speed: 1,
    fit: 'cover',
    zoom: 0.42,
    posX: 0.48,
    posY: -0.42,
    panX: 0,
    panY: 0,
    rotate: 0,
    flip: false,
    volume: 0,
    filter: { preset: 'none', adjust: {} },
    transition: { type: 'fade', duration: 0.3 },
    mask: { shape: 'rounded', size: 0.42, x: 0.48, y: -0.42, rotate: 0, feather: 0, border: 0.25, borderColor: '#ffffff', background: 'none', color: '#000000' },
    kenBurns: null,
  };
}

const FRAMINGS = {
  pip: { label: 'Picture in picture', apply: (c) => Object.assign(c, { zoom: 0.42, posX: 0.48, posY: -0.42, mask: { ...(c.mask || {}), shape: 'rounded', size: 0.42, x: 0.48, y: -0.42, border: 0.25, background: 'none' } }) },
  full: { label: 'Full frame', apply: (c) => Object.assign(c, { zoom: 1, posX: 0, posY: 0, mask: null }) },
  top: { label: 'Top half', apply: (c) => Object.assign(c, { zoom: 1, posX: 0, posY: -0.5, mask: { shape: 'topHalf', x: 0, y: 0, feather: 0, border: 0, background: 'none' } }) },
  bottom: { label: 'Bottom half', apply: (c) => Object.assign(c, { zoom: 1, posX: 0, posY: 0.5, mask: { shape: 'bottomHalf', x: 0, y: 0, feather: 0, border: 0, background: 'none' } }) },
  circle: { label: 'Circle', apply: (c) => Object.assign(c, { zoom: 0.55, posX: 0, posY: 0, mask: { shape: 'circle', size: 0.5, x: 0, y: 0, feather: 0.1, border: 0.3, borderColor: '#ffffff', background: 'none' } }) },
};

/**
 * opts.types: only show and add these layer types (the Video, Visualizer and Guitar Pro tabs each show
 * their own kind). Without it, the whole stack is shown, as in the "All layers" fold.
 */
export function buildLayersPanel(b, ctx, opts = {}) {
  const { store, engine, ui, importFiles, fontOptions, fontField, kf } = ctx;
  const p = store.get();
  const types = opts.types || null;
  const mine = (L) => !types || types.includes(L.type);
  const selAny = ui.selection && ui.selection.type === 'layer' ? findLayer(p, ui.selection.id) : null;
  const sel = selAny && mine(selAny) ? selAny : null;

  const add = (type) => {
    const layer = makeLayer(store.get(), type, engine.t);
    store.update((d) => {
      d.layers = [...(d.layers || []), layer];
      if (d.layout && d.layout !== 'full' && (type === 'tab' || type === 'drums')) tabIntoLayout(d);
    });
    ui.select({ type: 'layer', id: layer.id });
    if (type === 'tab' && !layer.mediaId) toast('Upload a Guitar Pro file in this layer’s settings.');
    if (type === 'drums' && !layer.mediaId) toast('Pick a Guitar Pro drum track, a MIDI file or a drum stem in this layer’s settings.');
    if (type === 'midi' && !layer.mediaId) toast('Upload a MIDI file (.mid) in this layer’s settings.');
  };

  const move = (id, dir) =>
    store.update((d) => {
      const i = d.layers.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.layers.length) return;
      [d.layers[i], d.layers[j]] = [d.layers[j], d.layers[i]];
    });
  const remove = (id) => {
    const L = findLayer(store.get(), id);
    if (L && !confirm(`Delete the layer “${L.name}”?`)) return;
    store.update((d) => (d.layers = d.layers.filter((l) => l.id !== id)));
    ui.select(null);
  };
  const eye = (hidden, label, onclick, audio = false) =>
    h('button', { type: 'button', class: `tl-eye${hidden ? ' off' : ''}`, 'aria-label': `${hidden ? (audio ? 'Unmute' : 'Show') : audio ? 'Mute' : 'Hide'} ${label}`, 'aria-pressed': hidden ? 'false' : 'true', onclick: (e) => (e.stopPropagation(), onclick()) }, icon(audio ? (hidden ? 'mute' : 'volume') : hidden ? 'eyeOff' : 'eye', 14));
  const toggleFixed = (key) =>
    store.update((d) => {
      d.layerVis = { ...(d.layerVis || {}) };
      if (d.layerVis[key] === false) delete d.layerVis[key];
      else d.layerVis[key] = false;
    });

  const makeList = (filter) => {
  const list = h('div', { class: 'layer-list' });
  const stack = [...(p.layers || [])].reverse().filter(filter); // top of the stack first
  stack.forEach((L, k) => {
    const idx = p.layers.indexOf(L);
    list.append(
      h(
        'div',
        { class: `layer-row${sel && sel.id === L.id ? ' on' : ''}`, role: 'button', tabindex: '0', onclick: () => ui.select({ type: 'layer', id: L.id }), onkeydown: (e) => e.key === 'Enter' && ui.select({ type: 'layer', id: L.id }) },
        eye(L.visible === false, L.name, () => store.update((d) => {
          const x = d.layers.find((y) => y.id === L.id);
          x.visible = x.visible === false;
        })),
        icon(LAYER_TYPES[L.type].icon, 16),
        h('span', { class: 'name' }, L.name),
        h(
          'div',
          { class: 'acts' },
          iconButton('arrowUp', `Move ${L.name} up (draw on top)`, (e) => (e.stopPropagation(), move(L.id, 1)), 'ghost'),
          iconButton('arrowDown', `Move ${L.name} down`, (e) => (e.stopPropagation(), move(L.id, -1)), 'ghost'),
          iconButton('trash', `Delete ${L.name}`, (e) => (e.stopPropagation(), remove(L.id)), 'ghost danger'),
        ),
      ),
    );
    if (idx === 0 && !types) list.append(h('div', { class: 'muted tiny' }, 'Video layers always sit under tab, drum and visualizer layers.'));
  });
  if (!stack.length) list.append(h('p', { class: 'muted small' }, types ? opts.empty || 'None yet. Add one above.' : 'No layers yet.'));
  return list;
  };
  const list = makeList(mine);
  const fixed = h(
    'div',
    { class: 'layer-list' },
    FIXED_ROWS.map(([key, label, ic, audio]) => h('div', { class: 'layer-row fixed' }, eye(!isVisible(p, key), label, () => toggleFixed(key), !!audio), icon(ic, 16), h('span', { class: 'name' }, label), h('span', {}))),
    p.audioTracks.map((a, i) => h('div', { class: 'layer-row fixed' }, eye(!isVisible(p, `audio:${a.id}`), `Audio ${i + 1}`, () => toggleFixed(`audio:${a.id}`), true), icon('music', 16), h('span', { class: 'name' }, `Audio ${i + 1}: ${media.get(a.mediaId)?.name || ''}`), h('span', {}))),
  );

  const ADD = {
    video: () => button(types ? 'Add a video layer' : 'Video layer', () => add('video'), { iconName: 'film', variant: types ? 'sm primary' : 'sm' }),
    tab: () => button(types ? 'Add a guitar or bass tab' : 'Guitar tab', () => add('tab'), { iconName: 'guitar', variant: types ? 'sm primary' : 'sm' }),
    drums: () => button(types ? 'Add a drum chart' : 'Drum chart', () => add('drums'), { iconName: 'activity', variant: types ? 'sm primary' : 'sm' }),
    viz: () => button(types ? 'Add a visualizer' : 'Visualizer', () => add('viz'), { iconName: 'volume', variant: types ? 'sm primary' : 'sm' }),
    midi: () => button(types ? 'Add MIDI notes' : 'MIDI notes', () => add('midi'), { iconName: 'music', variant: types ? 'sm' : 'sm' }),
  };
  const allRows = () =>
    fold(
      'all-layers',
      'All layers and rows',
      { open: false, hint: 'Order, show or hide everything' },
      h('p', { class: 'muted tiny' }, 'Top of the list draws on top. Video layers always sit under tab, drum and visualizer layers.'),
      makeList(() => true),
      (p.layers || []).some((L) => syncKind(p, L)) && p.song ? button('Auto-sync every layer to the song', () => autoSyncAll(), { iconName: 'activity', variant: 'sm' }) : null,
      h('h4', { class: 'sub' }, 'Always-there rows'),
      h('p', { class: 'muted tiny' }, 'Hide a row to leave it out of the preview and the export. Hiding audio mutes it.'),
      fixed,
    );

  if (types) {
    return h(
      'div',
      { class: 'layer-tab' },
      opts.intro ? h('p', { class: 'muted small' }, opts.intro) : null,
      h('div', { class: 'add-layer' }, types.map((t) => ADD[t]())),
      (p.layers || []).filter((L) => mine(L) && syncKind(p, L)).length > 1 && p.song ? h('div', { class: 'row' }, button('Auto-sync every layer here to the song', () => autoSyncAll(mine), { iconName: 'activity', variant: 'sm', title: 'Line up each chart, stem and stem visualizer on this tab with the song' })) : null,
      list,
      sel ? h('div', { class: 'layer-settings' }, settingsFor(sel), animateFor(sel)) : (p.layers || []).some(mine) ? h('p', { class: 'muted tiny' }, 'Select one to edit it. You can also click its name on the timeline.') : null,
      opts.after || null,
      opts.noAll ? null : allRows(),
    );
  }
  return h(
    'div',
    {},
    section('Add a layer', h('div', { class: 'add-layer' }, ADD.video(), ADD.tab(), ADD.drums(), ADD.viz(), ADD.midi())),
    section('Layer stack (top first)', list),
    selAny ? h('div', { class: 'layer-settings' }, settingsFor(selAny), animateFor(selAny)) : h('p', { class: 'muted tiny' }, 'Select a layer to edit it. You can also click a layer name on the timeline.'),
    section('Always-there rows', h('p', { class: 'muted tiny' }, 'Hide a row to leave it out of the preview and the export. Hiding audio mutes it.'), fixed),
  );

  /** "Auto-sync to the song" for one layer: listens to the song and lines the layer up with it. */
  function autoSyncRow(L) {
    const run = () => {
      const r = syncLayer(store.get(), findLayer(store.get(), L.id));
      if (r.error) return toast(r.error, 'error', 5000);
      store.update((d) => {
        const x = d.layers.find((y) => y.id === L.id);
        if (x) Object.assign(x, r.patch);
      });
      toast(`${r.text}: ${SURE_TEXT[r.sure]}.`, r.sure === 'unsure' ? 'error' : 'info', 7000);
    };
    return h('div', { class: 'row autosync' }, button('Auto-sync to the song', run, { iconName: 'activity', variant: 'sm primary', title: 'Listen to the song and line this up with it: where it starts and, for a chart, its tempo' }), h('span', { class: 'muted tiny' }, 'Listens to the song and lines it up. Undo (Ctrl+Z) if it’s off.'));
  }
  /** Auto-sync every chart, stem and stem visualizer in the project (only those the filter keeps). */
  function autoSyncAll(filter = () => true) {
    const pp = store.get();
    const targets = (pp.layers || []).filter((L) => filter(L) && syncKind(pp, L));
    if (!targets.length) return toast('No charts or stems to sync yet.', 'error');
    const done = [];
    const failed = [];
    const patches = new Map();
    for (const L of targets) {
      const r = syncLayer(pp, L);
      if (r.error) failed.push(`${L.name}: ${r.error}`);
      else (patches.set(L.id, r.patch), done.push(`${r.text}${r.sure === 'sure' ? '' : ' (check it)'}`));
    }
    if (patches.size) store.update((d) => d.layers.forEach((x) => patches.has(x.id) && Object.assign(x, patches.get(x.id))));
    toast([done.length ? `Synced ${done.length}: ${done.join('; ')}.` : '', failed.length ? `Not synced: ${failed.join('; ')}` : ''].filter(Boolean).join(' '), failed.length && !done.length ? 'error' : 'info', 9000);
  }

  // the keyframe list (sliders that animate are in each type's settings)
  function animateFor(L) {
    const skip = { viz: ['x', 'y', 'size', 'opacity', 'intensity'], video: ['x', 'y', 'opacity'] }[L.type] || ['x', 'y'];
    return kf.animateSection(b, { type: 'layer', id: L.id }, { skip });
  }

  // ------------------------------------------------------------ per-type settings
  /**
   * The current song's files from `all`, by `ids` (in that order), with the one already picked kept at the
   * end. When the edit isn't linked to one of your songs, everything in `all` is offered as before.
   */
  function forSong(all, ids, picked) {
    const sc = ui.songContext ? ui.songContext() : null;
    if (!sc || !sc.song) return { list: all, song: null };
    const list = ids.map((id) => all.find((m) => m.id === id)).filter(Boolean);
    const keep = picked && !list.some((m) => m.id === picked) ? all.find((m) => m.id === picked) : null;
    return { list, song: sc.song, keep, stems: sc.stems };
  }
  /** Says the list holds the current song's files (or that it has none yet). */
  function songNote(fs, what) {
    if (!fs.song) return null;
    return h('p', { class: 'muted tiny' }, fs.list.length ? `${what} of “${fs.song.title}” (its Files tab in Songs & releases).` : `“${fs.song.title}” has no ${what.toLowerCase()} yet: add them on its Files tab in Songs & releases, or upload them here.`);
  }
  /** Upload stems here: into the library, and onto the current song's Files tab. */
  async function uploadStems() {
    const files = await pickFiles('audio/*', true);
    if (!files.length) return;
    const before = new Set(media.all().map((m) => m.id));
    await importFiles(files);
    const added = media.all().filter((m) => !before.has(m.id) && m.kind === 'audio');
    const n = ui.addStemsToSong ? ui.addStemsToSong(added) : 0;
    if (n) toast(`${n} stem${n === 1 ? '' : 's'} added to the song’s Files tab too.`);
    ui.refreshPanels(true);
  }

  function settingsFor(L) {
    const set = (fn) => (d, v) => {
      const x = d.layers.find((y) => y.id === L.id);
      if (x) fn(x, v, d);
    };
    const get = (fn) => () => {
      const x = findLayer(store.get(), L.id);
      return x ? fn(x) : undefined;
    };
    const common = h(
      'div',
      {},
      h('div', { class: 'insp-title' }, icon(LAYER_TYPES[L.type].icon, 16), h('span', {}, `${LAYER_TYPES[L.type].label} settings`)),
      b.text('Layer name', get((x) => x.name), set((x, v) => (x.name = v))),
      h('div', { class: 'grid2' },
        b.select('Entrance', get((x) => (x.enter && x.enter.type) || ''), set((x, v) => (x.enter = v ? { type: v, duration: (x.enter && x.enter.duration) || 0.4 } : null)), [['', 'Quick fade (default)'], ...ENTRANCES]),
        b.select('Exit', get((x) => (x.exit && x.exit.type) || ''), set((x, v) => (x.exit = v ? { type: v, duration: (x.exit && x.exit.duration) || 0.4 } : null)), [['', 'Quick fade (default)'], ...EXITS]),
      ),
      h('div', { class: 'grid2' },
        b.range('Entrance length', get((x) => (x.enter && x.enter.duration) || 0.4), set((x, v) => (x.enter = { type: (x.enter && x.enter.type) || 'fade', duration: v })), { min: 0.1, max: 2, step: 0.05, fmt: (v) => `${v.toFixed(2)}s` }),
        b.range('Exit length', get((x) => (x.exit && x.exit.duration) || 0.4), set((x, v) => (x.exit = { type: (x.exit && x.exit.type) || 'fade', duration: v })), { min: 0.1, max: 2, step: 0.05, fmt: (v) => `${v.toFixed(2)}s` }),
      ),
    );
    const visibleRange = () =>
      section(
        'When it shows',
        h('div', { class: 'grid2' },
          b.number('From (s)', get((x) => x.start ?? 0), set((x, v) => (x.start = v)), { min: 0, step: 0.1 }),
          b.number('Until (s, empty = end card)', get((x) => x.end), set((x, v) => (x.end = v)), { min: 0, step: 0.1 }),
        ),
        h('div', { class: 'row' },
          button('Show from playhead', () => store.update(set((x) => (x.start = +engine.t.toFixed(2)))), { variant: 'sm' }),
          button('Hide at playhead', () => store.update(set((x) => (x.end = +engine.t.toFixed(2)))), { variant: 'sm' }),
          button('Until end card', () => store.update(set((x) => (x.end = null))), { variant: 'ghost sm' }),
        ),
      );
    const placement = (defaults) =>
      h(
        'div',
        {},
        h('div', { class: 'grid2' },
          kf.range(b, { type: 'layer', id: L.id }, 'y', { label: 'Up/down', def: defaults.y, min: 5, max: 95, step: 0.5, fmt: (v) => `${+(+v).toFixed(1)}%` }),
          kf.range(b, { type: 'layer', id: L.id }, 'x', { label: 'Left/right', def: 50, min: 5, max: 95, step: 0.5, fmt: (v) => `${+(+v).toFixed(1)}%` }),
        ),
        defaults.size
          ? kf.range(b, { type: 'layer', id: L.id }, 'size', { label: 'Size', def: defaults.size, min: 10, max: 160, step: 1, fmt: (v) => `${Math.round(v)}%` })
          : h('div', { class: 'grid2' },
              b.range('Width', get((x) => x.width ?? 92), set((x, v) => (x.width = v)), { min: 20, max: 100, step: 1, fmt: (v) => `${v}%` }),
              b.range('Height', get((x) => x.height ?? 16), set((x, v) => (x.height = v)), { min: 6, max: 80, step: 0.5, fmt: (v) => `${v}%` }),
            ),
      );
    const syncTools = (tlFn, isStem) => {
      // timing you set yourself is kept when a suggested edit is applied
      const S = (fn) => set((x, v, d) => {
        fn(x, v, d);
        x.userSync = true;
      });
      const songNow = () => timelineToSong(engine.t, store.get().song);
      const barNum = h('input', { type: 'number', min: 1, value: 1, class: 'num', 'aria-label': 'Bar number' });
      const nudge = (s) => store.update(S((x) => (x.offset = +((x.offset || 0) + s).toFixed(3))), `nudge:${L.id}`);
      const barAtPlayhead = () => {
        const tl = tlFn();
        if (!tl || !tl.bars) return;
        const n = parseInt(barNum.value, 10);
        const bar = tl.bars.find((x) => x.index === n - 1);
        if (!bar) return toast(`The file has ${new Set(tl.bars.map((x) => x.index)).size} bars.`, 'error');
        store.update(S((x) => (x.offset = +(songNow() - bar.time / (x.tempoScale || 1)).toFixed(3))));
        toast(`Bar ${n} now plays at the playhead`);
      };
      const matchBpm = () => {
        const pp = store.get();
        const tl = tlFn();
        if (!pp.beats) return toast('Run Detect BPM in the Audio tab first.', 'error');
        const base = (tl && tl.tempo) || 120;
        const cands = [pp.beats.bpm, pp.beats.bpm * 2, pp.beats.bpm / 2].map((x) => x / base);
        const scale = cands.reduce((a, c) => (Math.abs(Math.log(c)) < Math.abs(Math.log(a)) ? c : a));
        store.update(S((x) => (x.tempoScale = +scale.toFixed(4))));
        toast(`Tempo set to ${Math.round(base * scale)} BPM to match the song`);
      };
      return section(
        'Sync with the song',
        autoSyncRow(L),
        isStem
          ? h('p', { class: 'muted tiny' }, 'Stems normally start with the song, so 0 is right. Nudge if the stem was exported with a different start.')
          : h('p', { class: 'muted tiny' }, 'Move the playhead to where this part starts in the song, then put a bar there. Drag the layer’s block on the timeline to fine-tune.'),
        isStem ? null : h('div', { class: 'row' }, h('span', { class: 'small' }, 'Put bar'), barNum, button('at the playhead', barAtPlayhead, { variant: 'sm primary' })),
        b.number(isStem ? 'Stem starts at (song seconds)' : 'Starts at (song seconds)', get((x) => x.offset || 0), S((x, v) => (x.offset = v)), { step: 0.01 }),
        h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Nudge'), ...[-0.5, -0.05, 0.05, 0.5].map((s) => button(`${s > 0 ? '+' : '−'}${Math.abs(s)}s`, () => nudge(s), { variant: 'sm' }))),
        isStem
          ? null
          : h(
              'div',
              {},
              b.range('Tempo', get((x) => x.tempoScale ?? 1), S((x, v) => (x.tempoScale = v)), { min: 0.5, max: 1.5, step: 0.001, fmt: (v) => `${Math.round(((tlFn() && tlFn().tempo) || 120) * v)} BPM` }),
              h('div', { class: 'row' }, button('Match the song’s detected BPM', matchBpm, { iconName: 'activity', variant: 'sm' }), button('Use the file’s tempo', () => store.update(S((x) => (x.tempoScale = 1))), { variant: 'ghost sm' })),
            ),
      );
    };

    // ---- video layer
    if (L.type === 'video') {
      const visual = media.all().filter((m) => m.kind === 'video' || m.kind === 'image');
      const pick = h('select', { 'aria-label': 'Clip to add' }, visual.map((m) => h('option', { value: m.id }, m.name)));
      const addClip = () => {
        const rec = media.get(pick.value);
        if (!rec) return toast('Upload a clip or find one in Stock video (Video tab) first.', 'error');
        const clip = makeOverlayClip(rec, engine.t);
        store.update(set((x) => x.clips.push(clip)));
        ui.select({ type: 'clip', id: clip.id });
      };
      const frame = (k) => store.update(set((x) => x.clips.forEach((c) => FRAMINGS[k].apply(c))));
      return h(
        'div',
        {},
        common,
        kf.range(b, { type: 'layer', id: L.id }, 'opacity', { label: 'Opacity', def: 1 }),
        b.select('Blend', get((x) => x.blend || 'source-over'), set((x, v) => (x.blend = v)), [['source-over', 'Normal'], ['screen', 'Screen (smoke, light leaks, sparks)'], ['multiply', 'Multiply (dark textures)'], ['overlay', 'Overlay'], ['lighter', 'Add'], ['difference', 'Difference']]),
        section(
          'Clips on this layer',
          visual.length ? h('div', { class: 'search-row' }, pick, button('Add at playhead', addClip, { iconName: 'plus', variant: 'primary sm' })) : h('p', { class: 'muted small' }, 'Upload a video or image in Media first.'),
          h(
            'div',
            { class: 'list' },
            (findLayer(p, L.id)?.clips || []).map((c) =>
              h('div', { class: 'list-row' }, h('button', { type: 'button', class: 'link', onclick: () => (ui.select({ type: 'clip', id: c.id }), engine.seek(c.start)) }, media.get(c.mediaId)?.name || 'clip'), h('span', { class: 'muted tiny' }, `${formatTime(c.start)} · ${c.duration.toFixed(1)}s`)),
            ),
          ),
          h('p', { class: 'muted tiny' }, 'Select a clip to frame, mask, grade or trim it. Clips fade in and out unless their transition is a hard cut.'),
        ),
        section('Quick framing (all clips)', h('div', { class: 'chips' }, Object.entries(FRAMINGS).map(([k, f]) => button(f.label, () => frame(k), { variant: 'chip' })))),
      );
    }

    // ---- guitar tab layer
    if (L.type === 'tab') {
      const tabFs = forSong(media.all().filter((m) => m.kind === 'tab' && m.tracks && m.tracks.length), ui.songContext && ui.songContext() ? ui.songContext().tabs : [], L.mediaId);
      const tabs = [...tabFs.list, ...(tabFs.keep ? [tabFs.keep] : [])];
      const upload = button('Upload Guitar Pro tab', async () => importFiles(await pickFiles(TAB_ACCEPT, false), { tabLayer: L.id }), { iconName: 'upload', variant: tabs.length ? 'ghost sm' : 'primary' });
      const studio = button('Edit in Tab Studio', () => ui.openTab('tabstudio'), { iconName: 'guitar', variant: 'ghost sm', title: 'Edit notes, or make a tab from your stems' });
      const rec = media.get(L.mediaId);
      const tl = () => {
        const x = findLayer(store.get(), L.id);
        return x ? tabTimeline(media.get(x.mediaId), x.track) : null;
      };
      const fileSel = h('select', {}, h('option', { value: '' }, '— choose a tab file —'), tabs.map((m) => h('option', { value: m.id, selected: m.id === L.mediaId }, tabFs.keep === m ? `${m.name} (not this song’s)` : m.name)));
      fileSel.addEventListener('change', () => store.update(set((x) => {
        x.mediaId = fileSel.value || null;
        const r = media.get(fileSel.value);
        x.track = r ? r.tracks[0].index : 0;
      })));
      if (!rec) return h('div', {}, common, field('Tab file', fileSel), songNote(tabFs, 'Guitar Pro tabs'), h('div', { class: 'row' }, upload, studio), h('p', { class: 'muted small' }, 'Guitar Pro (.gp, .gp5, .gp4, .gp3, .gpx) or MusicXML. No file? Tab Studio can make one from your stems.'));
      const T = set;
      const g = (k, def) => get((x) => x[k] ?? def);
      const style = L.style || 'tab';
      const trk = rec.tracks.find((tr) => tr.index === L.track) || rec.tracks[0];
      const styleGrid = h(
        'div',
        { class: 'style-grid', role: 'radiogroup', 'aria-label': 'Tab style' },
        TAB_STYLES.map(([id, label, hint]) =>
          h('button', {
            type: 'button',
            role: 'radio',
            'aria-checked': style === id ? 'true' : 'false',
            class: `style-opt${style === id ? ' on' : ''}`,
            onclick: () => store.update(set((x, _v, d) => {
              x.style = id;
              Object.assign(x, TAB_PLACEMENT[id]);
              if (d.layout && d.layout !== 'full') tabIntoLayout(d);
            })),
          }, h('strong', {}, label), h('span', {}, hint)),
        ),
      );
      // string colours, lowest string first (E A D G … for guitar and bass alike)
      const stringColors = trk
        ? h('div', { class: 'grid3' }, trk.tuning.slice().reverse().map((name, k) =>
            b.color(`${name} string`, get((x) => stringColor(x, trk.strings, trk.strings - 1 - k)), T((o, v) => {
              const arr = (o.stringColors || []).slice();
              arr[k] = v;
              o.stringColors = arr;
            }))))
        : null;
      const fancyLook = () =>
        section(
          'Look',
          style !== 'neck'
            ? b.range('Seconds on screen', g('window', 2.5), T((o, v) => (o.window = v)), { min: 1.5, max: 8, step: 0.1, fmt: (v) => `${v.toFixed(1)}s` })
            : null,
          style === 'strings' ? b.range('Hit line', g('playhead', 22), T((o, v) => (o.playhead = v)), { min: 5, max: 70, step: 1, fmt: (v) => `${v}%` }) : null,
          placement({ y: TAB_PLACEMENT[style].y }),
          stringColors,
          h('div', { class: 'grid2' }, b.color('Background', g('bg', '#000000'), T((o, v) => (o.bg = v))), b.range('Background opacity', g('bgOpacity', 0.55), T((o, v) => (o.bgOpacity = v)), { min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` })),
          b.toggle('Show chord names', g('showChords', true), T((o, v) => (o.showChords = v))),
          style === 'neck' ? b.toggle('Show a strip of the next notes', g('showStrip', true), T((o, v) => (o.showStrip = v))) : null,
          b.toggle('Show tuning letters', g('showTuning', true), T((o, v) => (o.showTuning = v))),
          style !== 'neck' ? b.toggle('Show techniques (PM, h, /, bends, ~)', g('showMarks', true), T((o, v) => (o.showMarks = v))) : null,
          button('Reset string colours', () => store.update(T((o) => delete o.stringColors)), { variant: 'ghost sm' }),
        );
      return h(
        'div',
        {},
        common,
        field('Tab file', fileSel),
        songNote(tabFs, 'Guitar Pro tabs'),
        h('div', { class: 'row' }, upload, studio),
        b.select('Track', () => String(findLayer(store.get(), L.id)?.track ?? 0), T((o, v) => (o.track = parseInt(v, 10))), rec.tracks.map((tr) => [String(tr.index), `${tr.name} · ${tr.strings} strings (${tr.tuning.slice().reverse().join(' ')})`])),
        h('div', { class: 'lbl' }, 'Style'),
        styleGrid,
        style === 'tab' ? b.segmented('Movement', g('mode', 'scroll'), T((o, v) => (o.mode = v)), [['scroll', 'Scrolling'], ['bars', 'Bar by bar']]) : null,
        syncTools(tl, false),
        visibleRange(),
        style !== 'tab' ? fancyLook() : section(
          'Look',
          L.mode === 'bars'
            ? b.range('Bars on screen', g('barsPerPage', 2), T((o, v) => (o.barsPerPage = v)), { min: 1, max: 4, step: 1, fmt: (v) => String(v) })
            : h('div', { class: 'grid2' },
                b.range('Seconds on screen', g('window', 2.5), T((o, v) => (o.window = v)), { min: 1.5, max: 10, step: 0.1, fmt: (v) => `${v.toFixed(1)}s` }),
                b.range('Playhead', g('playhead', 25), T((o, v) => (o.playhead = v)), { min: 5, max: 70, step: 1, fmt: (v) => `${v}%` }),
              ),
          placement({ y: 30 }),
          h('div', { class: 'grid3' }, b.color('Numbers', g('numColor'), T((o, v) => (o.numColor = v))), b.color('Playing note', g('hiColor'), T((o, v) => (o.hiColor = v))), b.color('Strings', g('lineColor'), T((o, v) => (o.lineColor = v)))),
          h('div', { class: 'grid2' }, b.color('Background', g('bg'), T((o, v) => (o.bg = v))), b.range('Background opacity', g('bgOpacity', 0.55), T((o, v) => (o.bgOpacity = v)), { min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` })),
          fontField ? fontField(b, 'Font', g('font'), T((o, v) => (o.font = v))) : b.select('Font', g('font'), T((o, v) => (o.font = v)), fontOptions()),
          b.toggle('Show tuning letters', g('showTuning'), T((o, v) => (o.showTuning = v))),
          b.toggle('Show techniques (PM, h, /, bends, ~)', g('showMarks'), T((o, v) => (o.showMarks = v))),
        ),
      );
    }

    // ---- drum chart layer
    if (L.type === 'drums') {
      const sc0 = ui.songContext ? ui.songContext() : null;
      const gpFs = forSong(media.all().filter((m) => m.kind === 'tab' && m.drumTracks && m.drumTracks.length), sc0 ? sc0.tabs : [], L.mediaId);
      const gpFiles = [...gpFs.list, ...(gpFs.keep ? [gpFs.keep] : [])];
      // the song's stems, drums and percussion first
      const stemIds = sc0 ? [...sc0.stems.filter((x) => x.role === 'drums' || x.role === 'perc'), ...sc0.stems.filter((x) => x.role !== 'drums' && x.role !== 'perc')].map((x) => x.mediaId) : [];
      const stemFs = forSong(media.all().filter((m) => (m.kind === 'audio' || m.kind === 'video') && (m.id === L.mediaId || !(p.song && m.id === p.song.mediaId))), stemIds, L.mediaId);
      const stems = [...stemFs.list, ...(stemFs.keep ? [stemFs.keep] : [])];
      const stemLabel = (m) => (stemFs.keep === m ? `${m.name} (not this song’s)` : (sc0 && sc0.stems.find((x) => x.mediaId === m.id)?.label) || m.name);
      const midiFiles = media.all().filter((m) => m.kind === 'midi');
      const g = (k, def) => get((x) => x[k] ?? def);
      const rec = media.get(L.mediaId);
      const isStem = L.source === 'audio';
      const isMidi = L.source === 'midi';
      let status = null;
      if (isStem && rec) {
        const data = drumHitsFromStem(rec, L.sensitivity, () => ui.refreshPanels(true));
        status = h('p', { class: 'muted tiny' }, data === undefined ? 'Listening to the stem for kick, snare and hi-hat hits…' : data ? `${data.hits.length} hits found: ${data.lanes.map((l) => `${data.hits.filter((x) => x.lane === l).length} ${l}`).join(', ')}.` : 'Could not read this file.');
      }
      const fileSel = h('select', {}, h('option', { value: '' }, isStem ? '— choose a drum stem —' : isMidi ? '— choose a MIDI file —' : '— choose a Guitar Pro file —'), (isStem ? stems : isMidi ? midiFiles : gpFiles).map((m) => h('option', { value: m.id, selected: m.id === L.mediaId }, isStem ? stemLabel(m) : gpFs.keep === m ? `${m.name} (not this song’s)` : m.name)));
      fileSel.addEventListener('change', () => store.update(set((x) => {
        x.mediaId = fileSel.value || null;
        const r = media.get(fileSel.value);
        if (isMidi && r && r.midi) Object.assign(x, midiDrumDefaults(r.midi));
        else if (!isStem && r) x.track = r.drumTracks[0].index;
      })));
      const tl = () => {
        const x = findLayer(store.get(), L.id);
        return x && (x.source === 'gp' || x.source === 'midi') ? drumTimeline(media.get(x.mediaId), x.track, x.drumMap) : null;
      };
      // a MIDI file: which track, and which drum engine it was written for
      const midiBits = () => {
        if (!isMidi || !rec || !rec.midi) return null;
        const used = noteCounts(rec.midi, { tracks: L.track >= 0 ? [L.track] : null });
        const guesses = guessEngines(used, 3);
        const mapSel = h('select', { 'aria-label': 'Drum map the MIDI was written for' }, engineGroups().map(([vendor, list]) => h('optgroup', { label: vendor }, list.map((e) => h('option', { value: e.id, selected: e.id === (L.drumMap || 'general_midi') }, e.name)))));
        mapSel.addEventListener('change', () => store.update(set((x) => (x.drumMap = mapSel.value))));
        const data = tl();
        return h(
          'div',
          {},
          b.select('MIDI track', () => String(findLayer(store.get(), L.id)?.track ?? -1), set((x, v) => (x.track = parseInt(v, 10))), [['-1', 'Every track'], ...rec.midi.tracks.filter((t) => t.notes).map((t) => [String(t.index), `${t.name} · ${t.notes} notes${t.channels.length ? ` · ch ${t.channels.map((c) => c + 1).join(', ')}` : ''}`])]),
          field('Written for (drum map)', mapSel, 'Which drum software or e-kit the MIDI was made for, so each note lands on the right drum. Convert it to another map on the Drum MIDI converter page.'),
          guesses.length ? h('p', { class: 'muted tiny' }, 'Best fits for its notes: ', guesses.map((x, i) => [i ? ', ' : '', h('button', { type: 'button', class: 'link', onclick: () => store.update(set((y) => (y.drumMap = x.engine.id))) }, `${x.engine.short || x.engine.name} (${Math.round(x.fit * 100)}%)`)])) : null,
          data ? h('p', { class: 'muted tiny' }, `${data.hits.length} hits on ${data.lanes.length} drums${data.tempo ? ` · ${data.tempo} BPM in the file` : ''}.`) : null,
        );
      };
      return h(
        'div',
        {},
        common,
        b.segmented('Notes come from', g('source', 'gp'), set((x, v) => ((x.source = v), (x.mediaId = null), (x.offset = v !== 'audio' ? +timelineToSong(0, store.get().song).toFixed(3) : 0))), [['gp', 'Guitar Pro drum track'], ['midi', 'MIDI file'], ['audio', 'Drum stem (audio)']]),
        field(isStem ? 'Drum stem' : isMidi ? 'MIDI file' : 'Guitar Pro file', fileSel),
        isMidi ? null : songNote(isStem ? stemFs : gpFs, isStem ? 'Stems' : 'Guitar Pro tabs'),
        isStem
          ? button('Upload a drum stem', uploadStems, { iconName: 'upload', variant: 'ghost sm' })
          : isMidi ? button('Upload a MIDI file', async () => importFiles(await pickFiles(MIDI_ACCEPT, false), { drumLayer: L.id }), { iconName: 'upload', variant: 'ghost sm' })
            : button('Upload Guitar Pro file', async () => importFiles(await pickFiles(TAB_ACCEPT, false), { drumLayer: L.id }), { iconName: 'upload', variant: 'ghost sm' }),
        midiBits(),
        !isStem && !isMidi && rec && rec.drumTracks ? b.select('Drum track', () => String(findLayer(store.get(), L.id)?.track ?? 0), set((x, v) => (x.track = parseInt(v, 10))), rec.drumTracks.map((tr) => [String(tr.index), tr.name])) : null,
        isStem ? b.range('Hit sensitivity', g('sensitivity', 0.5), set((x, v) => (x.sensitivity = Math.round(v * 20) / 20)), { min: 0.05, max: 0.95, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` }) : null,
        status,
        isStem ? h('p', { class: 'muted tiny' }, 'Works best with an isolated drum track. Detection finds kick, snare and hi-hat only; for toms and cymbals use a Guitar Pro drum track.') : null,
        h('div', { class: 'lbl' }, 'Style'),
        h(
          'div',
          { class: 'style-grid', role: 'radiogroup', 'aria-label': 'Drum chart style' },
          DRUM_STYLES.map(([id, label, hint]) =>
            h('button', {
              type: 'button',
              role: 'radio',
              'aria-checked': L.style === id ? 'true' : 'false',
              class: `style-opt${L.style === id ? ' on' : ''}`,
              onclick: () => store.update(set((x, _v, d) => {
                x.style = id;
                Object.assign(x, STYLE_PLACEMENT[id]);
                if (id === 'kit' && !x.kickText) x.kickText = d.endCard.artist && d.endCard.artist !== 'Artist Name' ? d.endCard.artist : '';
                if (d.layout && d.layout !== 'full') tabIntoLayout(d);
              })),
            }, h('strong', {}, label), h('span', {}, hint)),
          ),
        ),
        L.style === 'kit' ? b.text('Text on the kick drum', g('kickText', ''), set((x, v) => (x.kickText = v)), { placeholder: 'Your band name' }) : null,
        L.style === 'kit' ? b.select('Finish', g('kitFinish', 'neon'), set((x, v) => (x.kitFinish = v)), KIT_FINISHES) : null,
        L.style === 'kit' && L.kitFinish === 'stage' ? b.select('Shells', g('kitWrap', 'black'), set((x, v) => (x.kitWrap = v)), KIT_WRAPS.map(([k, l]) => [k, l])) : null,
        L.style === 'kit' && (L.kitFinish || 'neon') !== 'neon' ? b.toggle('Double bass drums', get((x) => kitDoubleKick(x)), set((x, v) => (x.doubleKick = v))) : null,
        L.style !== 'kit' ? b.toggle('Show every drum and cymbal (even ones the part doesn’t use)', get((x) => x.allLanes ?? x.source !== 'audio'), set((x, v) => (x.allLanes = v))) : null,
        L.style === 'neon' ? b.toggle('Show the combo counter', g('showCombo', true), set((x, v) => (x.showCombo = v))) : null,
        rec ? syncTools(tl, isStem) : null,
        visibleRange(),
        section(
          'Kit pieces',
          h('p', { class: 'hint' }, 'Turn off what your drummer doesn’t play. A piece that’s off isn’t drawn, and its hits move to the closest piece that’s on (a china to a crash, a mid tom to a high tom).'),
          h(
            'div',
            { class: 'row wrap' },
            Object.entries(KIT_PRESETS).map(([id, [label, off]]) =>
              button(label, () => store.update(set((x) => (x.kitPieces = Object.fromEntries(off.map((p) => [p, false]))))), { variant: 'sm' }),
            ),
          ),
          h('div', { class: 'grid2' }, LANES.filter((ln) => !FIXED_PIECES.includes(ln.id)).map((ln) => b.toggle(ln.label, get((x) => pieceOn(x, ln.id)), set((x, v) => (x.kitPieces = { ...(x.kitPieces || {}), [ln.id]: v }))))),
        ),
        section(
          'Look',
          ['circle', 'kit'].includes(L.style) ? null : b.range('Seconds on screen', g('window', 2.2), set((x, v) => (x.window = v)), { min: 1, max: 6, step: 0.1, fmt: (v) => `${v.toFixed(1)}s` }),
          ['lanes', 'glass'].includes(L.style) ? b.range('Hit line', g('playhead', 22), set((x, v) => (x.playhead = v)), { min: 5, max: 70, step: 1, fmt: (v) => `${v}%` }) : null,
          placement({ y: 24 }),
          h('div', { class: 'grid3' }, LANES.filter((ln) => pieceOn(L, ln.id)).map((ln) => b.color(ln.label, get((x) => laneColorOf(x, ln.id)), set((x, v) => (x.colors = { ...(x.colors || {}), [ln.id]: v }))))),
          h('div', { class: 'grid2' }, b.color('Background', g('bg'), set((x, v) => (x.bg = v))), b.range('Background opacity', g('bgOpacity', 0.55), set((x, v) => (x.bgOpacity = v)), { min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` })),
          b.toggle('Show drum names', g('showLabels', true), set((x, v) => (x.showLabels = v))),
        ),
      );
    }

    // ---- MIDI notes layer
    if (L.type === 'midi') {
      const g = (k, def) => get((x) => x[k] ?? def);
      const files = media.all().filter((m) => m.kind === 'midi');
      const rec = media.get(L.mediaId);
      const fileSel = h('select', {}, h('option', { value: '' }, '— choose a MIDI file —'), files.map((m) => h('option', { value: m.id, selected: m.id === L.mediaId }, m.name)));
      fileSel.addEventListener('change', () => store.update(set((x) => ((x.mediaId = fileSel.value || null), (x.tracks = [])))));
      const tl = () => {
        const x = findLayer(store.get(), L.id);
        const r = x && media.get(x.mediaId);
        return r && r.midi ? midiNotesFor(r.midi, x.tracks) : null;
      };
      const data = tl();
      const withNotes = rec && rec.midi ? rec.midi.tracks.filter((t) => t.notes) : [];
      const chosen = (L.tracks || []).length ? L.tracks : data ? data.tracks : [];
      return h(
        'div',
        {},
        common,
        field('MIDI file', fileSel, 'A .mid exported from your DAW, Guitar Pro or MuseScore: keys, synths, bass, guitar, strings, a vocal melody…'),
        button('Upload a MIDI file', async () => importFiles(await pickFiles(MIDI_ACCEPT, false), { midiLayer: L.id }), { iconName: 'upload', variant: 'ghost sm' }),
        withNotes.length
          ? section(
              'Tracks',
              h('p', { class: 'muted tiny' }, 'Tick the parts to show. With none ticked, every part that isn’t drums shows (drums go on a Drum chart layer).'),
              h('div', { class: 'grid2' }, withNotes.map((t) => b.toggle(`${t.name}${t.isDrum ? ' (drums)' : ''} · ${t.notes}`, () => chosen.includes(t.index), set((x, v) => {
                const cur = new Set((x.tracks || []).length ? x.tracks : chosen);
                if (v) cur.add(t.index);
                else cur.delete(t.index);
                x.tracks = [...cur].sort((a, z) => a - z);
              })))),
            )
          : null,
        data ? h('p', { class: 'muted tiny' }, `${data.notes.length} notes from ${noteName(data.low)} to ${noteName(data.high)}${data.tempo ? ` · ${data.tempo} BPM in the file` : ''}.`) : rec ? h('p', { class: 'muted tiny' }, 'This file has no notes on the tracks picked.') : null,
        h('div', { class: 'lbl' }, 'Style'),
        h('div', { class: 'style-grid', role: 'radiogroup', 'aria-label': 'MIDI notes style' }, MIDI_STYLES.map(([id, label, hint]) =>
          h('button', { type: 'button', role: 'radio', 'aria-checked': L.style === id ? 'true' : 'false', class: `style-opt${L.style === id ? ' on' : ''}`, onclick: () => store.update(set((x) => ((x.style = id), Object.assign(x, MIDI_PLACEMENT[id])))) }, h('strong', {}, label), h('span', {}, hint)),
        )),
        rec ? syncTools(() => (tl() ? { ...tl(), bars: tl().bars } : null), false) : null,
        visibleRange(),
        section(
          'Look',
          L.style === 'bursts' ? null : b.range('Seconds on screen', g('window', 4), set((x, v) => (x.window = v)), { min: 1, max: 12, step: 0.5, fmt: (v) => `${v}s` }),
          L.style === 'roll' ? b.range('Playhead', g('playhead', 25), set((x, v) => (x.playhead = v)), { min: 5, max: 80, step: 1, fmt: (v) => `${v}%` }) : null,
          b.select('Colours', g('colorMode', 'track'), set((x, v) => (x.colorMode = v)), MIDI_COLOR_MODES),
          L.colorMode === 'single' ? b.color('Colour', g('color', '#4dd2ff'), set((x, v) => (x.color = v))) : null,
          b.range('Glow', g('glow', 0.8), set((x, v) => (x.glow = v)), { min: 0, max: 1.5, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` }),
          placement({ y: 30 }),
          h('div', { class: 'grid2' }, b.color('Background', g('bg', '#000000'), set((x, v) => (x.bg = v))), b.range('Background opacity', g('bgOpacity', 0.45), set((x, v) => (x.bgOpacity = v)), { min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` })),
        ),
      );
    }

    // ---- visualizer layer
    const g = (k, def) => get((x) => x[k] ?? def);
    // the song itself, then only the current song's stems (grouped by part)
    const scV = ui.songContext ? ui.songContext() : null;
    const vizFs = forSong(media.all().filter((m) => (m.kind === 'audio' || m.kind === 'video') && (m.id === L.source || !(p.song && m.id === p.song.mediaId))), scV ? scV.stems.map((x) => x.mediaId) : [], L.source && L.source !== 'song' ? L.source : null);
    const sources = [...vizFs.list, ...(vizFs.keep ? [vizFs.keep] : [])];
    const vizLabel = (m) => (vizFs.keep === m ? `${m.name} (not this song’s)` : (scV && scV.stems.find((x) => x.mediaId === m.id)?.label) || m.name);
    const srcSel = h('select', { 'aria-label': 'Reacts to' }, h('option', { value: 'song' }, 'The song'), sources.map((m) => h('option', { value: m.id, selected: m.id === L.source }, vizLabel(m))));
    srcSel.value = L.source || 'song';
    srcSel.addEventListener('change', () => store.update(set((x) => (x.source = srcSel.value))));
    const recV = media.get(L.source === 'song' ? p.song && p.song.mediaId : L.source);
    const feat = recV ? vizFeatures(recV, () => ui.refreshPanels(true)) : null;
    const styleGrid = h(
      'div',
      { class: 'style-grid', role: 'radiogroup', 'aria-label': 'Visualizer style' },
      VIZ_STYLES.map(([id, label, hint]) =>
        h('button', { type: 'button', role: 'radio', 'aria-checked': L.style === id ? 'true' : 'false', class: `style-opt${L.style === id ? ' on' : ''}`, onclick: () => store.update(set((x) => setVizStyle(x, id))) }, h('strong', {}, label), h('span', {}, hint)),
      ),
    );
    return h(
      'div',
      {},
      common,
      field('Reacts to', srcSel, vizFs.song ? null : 'Pick a stem (drums, bass, vocals…) or the whole song. Upload stems in the Audio tab.'),
      songNote(vizFs, 'Stems'),
      L.source && L.source !== 'song' && media.get(L.source)
        ? section(
            'Sync with the song',
            autoSyncRow(L),
            b.number('Stem starts at (song seconds)', g('offset', 0), set((x, v) => ((x.offset = v), (x.userSync = true))), { step: 0.01 }),
          )
        : null,
      button('Upload stems', uploadStems, { iconName: 'upload', variant: 'ghost sm', title: 'Into the media library, and onto the song’s Files tab in Songs & releases' }),
      h('p', { class: 'muted tiny' }, !recV ? (isPoly(L.style) ? 'Audio is optional for this style: it only adds a glow on loud moments.' : 'No audio chosen yet.') : feat === undefined ? 'Analysing the audio…' : feat ? `Ready: ${feat.duration.toFixed(1)}s analysed.` : 'Could not read this audio file.'),
      section('Style', styleGrid),
      isPoly(L.style)
        ? (() => {
            const T = polyTiming({ beats: p.beats, bpm: L.bpm, bars: L.bars ?? (L.style === 'arcs' ? 4 : 1), beatsPerBar: L.beatsPerBar || 4, followSong: L.followSong !== false }, 0);
            const counts = parseRatios(L.ratios || POLY_DEFAULTS[L.style]);
            const presets = L.style === 'polymeter' ? ['4, 5, 7', '3, 4', '4, 5, 6, 7', '5, 7, 9', '3, 5, 7, 11'] : L.style === 'arcs' ? ['1-12', '1-8', '2-16', '3, 4, 5, 7'] : ['3, 4, 5, 6', '3, 4', '2, 3', '3, 5, 7', '3-9'];
            return section(
              L.style === 'polymeter' ? 'Polymeter' : 'Polyrhythm',
              h('p', { class: 'muted small' }, L.style === 'polymeter' ? 'Each row is a loop of that many steps. Every row moves one step per pulse, so the rows only meet again after they all come round together.' : `Each voice hits that many times per cycle, all in the same span of time: ${counts.join(' against ')}.`),
              b.text(L.style === 'polymeter' ? 'Row lengths' : 'Hits per voice', g('ratios', POLY_DEFAULTS[L.style]), set((x, v) => (x.ratios = v)), { placeholder: 'e.g. 3, 4, 5 or 2-9' }),
              h('div', { class: 'chips' }, presets.map((pr) => button(pr, () => store.update(set((x) => (x.ratios = pr))), { variant: `chip${(L.ratios || POLY_DEFAULTS[L.style]) === pr ? ' on' : ''}` }))),
              h(
                'div',
                { class: 'grid2' },
                L.style === 'polymeter'
                  ? b.select('Pulse', g('pulse', 2), set((x, v) => (x.pulse = +v)), [[1, 'Quarter notes'], [2, 'Eighth notes'], [3, 'Triplets'], [4, 'Sixteenth notes']])
                  : b.select('Cycle', g('bars', L.style === 'arcs' ? 4 : 1), set((x, v) => (x.bars = +v)), [[0.5, 'Half a bar'], [1, '1 bar'], [2, '2 bars'], [4, '4 bars'], [8, '8 bars']]),
                b.select('Beats per bar', g('beatsPerBar', 4), set((x, v) => (x.beatsPerBar = +v)), [[3, '3'], [4, '4'], [5, '5'], [6, '6'], [7, '7']]),
              ),
              b.toggle('Follow the song’s tempo', g('followSong', true), set((x, v) => (x.followSong = v))),
              L.followSong === false || !p.beats ? b.number('Tempo (BPM)', g('bpm', 120), set((x, v) => (x.bpm = Math.max(20, Math.min(300, +v || 120)))), { step: 1 }) : null,
              h('p', { class: 'muted tiny' }, T.fromSong ? `Locked to the song: ${T.bpm} BPM from Audio → Detect BPM.` : p.beats ? `Running at ${T.bpm} BPM.` : `Running at ${T.bpm} BPM. Detect the song’s tempo in Audio → Detect BPM to lock it to the music.`),
              h('div', { class: 'grid2' }, b.toggle('Rainbow colours', g('polyRainbow', true), set((x, v) => (x.polyRainbow = v))), b.toggle('Show the numbers', g('showLabels', true), set((x, v) => (x.showLabels = v)))),
            );
          })()
        : null,
      section(
        'Look',
        h('div', { class: 'grid2' }, b.color('Color', g('color'), set((x, v) => (x.color = v))), b.color('Second color', g('color2'), set((x, v) => (x.color2 = v)))),
        kf.range(b, { type: 'layer', id: L.id }, 'intensity', { label: 'Intensity', def: 0.7 }),
        REAL_PLACEMENT[L.style] ? b.toggle('Real-world colours (off = use the colours above)', g('classic', true), set((x, v) => (x.classic = v))) : null,
        ['ripple', 'particles'].includes(L.style) ? b.range('Hit sensitivity', g('sensitivity', 0.5), set((x, v) => (x.sensitivity = v)), { min: 0.05, max: 0.95, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` }) : null,
        ['ripple', 'particles'].includes(L.style) ? b.toggle('Scatter across the frame', g('scatter', false), set((x, v) => (x.scatter = v))) : null,
        placement({ y: 50, size: 70 }),
        h('div', { class: 'grid2' },
          kf.range(b, { type: 'layer', id: L.id }, 'opacity', { label: 'Opacity', def: 1 }),
          b.select('Blend', g('blend', 'screen'), set((x, v) => (x.blend = v)), BLENDS),
        ),
      ),
      section(
        'Sound',
        L.source === 'song' ? h('p', { class: 'muted tiny' }, 'Uses the song you already hear.') : b.toggle('Play this stem’s sound too', g('playAudio', false), set((x, v) => (x.playAudio = v))),
        L.source !== 'song' && L.playAudio ? b.range('Stem volume', g('volume', 1), set((x, v) => (x.volume = v)), { min: 0, max: 1.5, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` }) : null,
        L.source !== 'song' ? b.number('Stem starts at (song seconds)', g('offset', 0), set((x, v) => (x.offset = v)), { step: 0.01 }) : null,
      ),
      visibleRange(),
    );
  }
}

export { songToTimeline };
