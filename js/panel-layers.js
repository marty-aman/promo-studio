// Layers panel: add, show/hide, reorder and edit stacked layers
// (video layers, guitar tabs, drum charts, audio visualizers).
import { uid, timelineToSong, songToTimeline, formatTime } from './core.js';
import { LAYER_TYPES, isVisible, findLayer } from './state.js';
import { media, tabTimeline, drumTimeline, drumHitsFromStem, vizFeatures } from './media.js';
import { defaultTabLayer } from './tab.js';
import { defaultDrumLayer, LANES, DRUM_STYLES, STYLE_PLACEMENT } from './drums.js';
import { defaultVizLayer, VIZ_STYLES, BLENDS } from './viz.js';
import { tabIntoLayout } from './templates.js';
import { h, icon, button, iconButton, toast, field, section, pickFiles } from './dom.js';

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

export function buildLayersPanel(b, ctx) {
  const { store, engine, ui, importFiles, fontOptions } = ctx;
  const p = store.get();
  const sel = ui.selection && ui.selection.type === 'layer' ? findLayer(p, ui.selection.id) : null;

  const add = (type) => {
    const layer = makeLayer(store.get(), type, engine.t);
    store.update((d) => {
      d.layers = [...(d.layers || []), layer];
      if (d.layout && d.layout !== 'full' && (type === 'tab' || type === 'drums')) tabIntoLayout(d);
    });
    ui.select({ type: 'layer', id: layer.id });
    if (type === 'tab' && !layer.mediaId) toast('Upload a Guitar Pro file in this layer’s settings.');
    if (type === 'drums' && !layer.mediaId) toast('Pick a Guitar Pro drum track or a drum stem in this layer’s settings.');
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

  const list = h('div', { class: 'layer-list' });
  const stack = [...(p.layers || [])].reverse(); // top of the stack first
  stack.forEach((L, k) => {
    const idx = p.layers.length - 1 - k;
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
    if (idx === 0) list.append(h('div', { class: 'muted tiny' }, 'Video layers always sit under tab, drum and visualizer layers.'));
  });
  if (!stack.length) list.append(h('p', { class: 'muted small' }, 'No layers yet. Add one above.'));
  const fixed = h(
    'div',
    { class: 'layer-list' },
    FIXED_ROWS.map(([key, label, ic, audio]) => h('div', { class: 'layer-row fixed' }, eye(!isVisible(p, key), label, () => toggleFixed(key), !!audio), icon(ic, 16), h('span', { class: 'name' }, label), h('span', {}))),
    p.audioTracks.map((a, i) => h('div', { class: 'layer-row fixed' }, eye(!isVisible(p, `audio:${a.id}`), `Audio ${i + 1}`, () => toggleFixed(`audio:${a.id}`), true), icon('music', 16), h('span', { class: 'name' }, `Audio ${i + 1}: ${media.get(a.mediaId)?.name || ''}`), h('span', {}))),
  );

  return h(
    'div',
    {},
    section(
      'Add a layer',
      h(
        'div',
        { class: 'add-layer' },
        button('Video layer', () => add('video'), { iconName: 'film', variant: 'sm' }),
        button('Guitar tab', () => add('tab'), { iconName: 'guitar', variant: 'sm' }),
        button('Drum chart', () => add('drums'), { iconName: 'activity', variant: 'sm' }),
        button('Visualizer', () => add('viz'), { iconName: 'volume', variant: 'sm' }),
      ),
    ),
    section('Layer stack (top first)', list),
    sel ? h('div', { class: 'layer-settings' }, settingsFor(sel)) : h('p', { class: 'muted tiny' }, 'Select a layer to edit it. You can also click a layer name on the timeline.'),
    section('Always-there rows', h('p', { class: 'muted tiny' }, 'Hide a row to leave it out of the preview and the export. Hiding audio mutes it.'), fixed),
  );

  // ------------------------------------------------------------ per-type settings
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
          b.range('Up/down', get((x) => x.y ?? defaults.y), set((x, v) => (x.y = v)), { min: 5, max: 95, step: 0.5, fmt: (v) => `${v}%` }),
          b.range('Left/right', get((x) => x.x ?? 50), set((x, v) => (x.x = v)), { min: 5, max: 95, step: 0.5, fmt: (v) => `${v}%` }),
        ),
        defaults.size
          ? b.range('Size', get((x) => x.size ?? defaults.size), set((x, v) => (x.size = v)), { min: 10, max: 160, step: 1, fmt: (v) => `${v}%` })
          : h('div', { class: 'grid2' },
              b.range('Width', get((x) => x.width ?? 92), set((x, v) => (x.width = v)), { min: 20, max: 100, step: 1, fmt: (v) => `${v}%` }),
              b.range('Height', get((x) => x.height ?? 16), set((x, v) => (x.height = v)), { min: 6, max: 80, step: 0.5, fmt: (v) => `${v}%` }),
            ),
      );
    const syncTools = (tlFn, isStem) => {
      const songNow = () => timelineToSong(engine.t, store.get().song);
      const barNum = h('input', { type: 'number', min: 1, value: 1, class: 'num', 'aria-label': 'Bar number' });
      const nudge = (s) => store.update(set((x) => (x.offset = +((x.offset || 0) + s).toFixed(3))), `nudge:${L.id}`);
      const barAtPlayhead = () => {
        const tl = tlFn();
        if (!tl || !tl.bars) return;
        const n = parseInt(barNum.value, 10);
        const bar = tl.bars.find((x) => x.index === n - 1);
        if (!bar) return toast(`The file has ${new Set(tl.bars.map((x) => x.index)).size} bars.`, 'error');
        store.update(set((x) => (x.offset = +(songNow() - bar.time / (x.tempoScale || 1)).toFixed(3))));
        toast(`Bar ${n} now plays at the playhead`);
      };
      const matchBpm = () => {
        const pp = store.get();
        const tl = tlFn();
        if (!pp.beats) return toast('Run Detect BPM in the Audio tab first.', 'error');
        const base = (tl && tl.tempo) || 120;
        const cands = [pp.beats.bpm, pp.beats.bpm * 2, pp.beats.bpm / 2].map((x) => x / base);
        const scale = cands.reduce((a, c) => (Math.abs(Math.log(c)) < Math.abs(Math.log(a)) ? c : a));
        store.update(set((x) => (x.tempoScale = +scale.toFixed(4))));
        toast(`Tempo set to ${Math.round(base * scale)} BPM to match the song`);
      };
      return section(
        'Sync with the song',
        isStem
          ? h('p', { class: 'muted tiny' }, 'Stems normally start with the song, so 0 is right. Nudge if the stem was exported with a different start.')
          : h('p', { class: 'muted tiny' }, 'Move the playhead to where this part starts in the song, then put a bar there. Drag the layer’s block on the timeline to fine-tune.'),
        isStem ? null : h('div', { class: 'row' }, h('span', { class: 'small' }, 'Put bar'), barNum, button('at the playhead', barAtPlayhead, { variant: 'sm primary' })),
        b.number(isStem ? 'Stem starts at (song seconds)' : 'Starts at (song seconds)', get((x) => x.offset || 0), set((x, v) => (x.offset = v)), { step: 0.01 }),
        h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Nudge'), ...[-0.5, -0.05, 0.05, 0.5].map((s) => button(`${s > 0 ? '+' : '−'}${Math.abs(s)}s`, () => nudge(s), { variant: 'sm' }))),
        isStem
          ? null
          : h(
              'div',
              {},
              b.range('Tempo', get((x) => x.tempoScale ?? 1), set((x, v) => (x.tempoScale = v)), { min: 0.5, max: 1.5, step: 0.001, fmt: (v) => `${Math.round(((tlFn() && tlFn().tempo) || 120) * v)} BPM` }),
              h('div', { class: 'row' }, button('Match the song’s detected BPM', matchBpm, { iconName: 'activity', variant: 'sm' }), button('Use the file’s tempo', () => store.update(set((x) => (x.tempoScale = 1))), { variant: 'ghost sm' })),
            ),
      );
    };

    // ---- video layer
    if (L.type === 'video') {
      const visual = media.all().filter((m) => m.kind === 'video' || m.kind === 'image');
      const pick = h('select', { 'aria-label': 'Clip to add' }, visual.map((m) => h('option', { value: m.id }, m.name)));
      const addClip = () => {
        const rec = media.get(pick.value);
        if (!rec) return toast('Upload or find a clip in Media or Stock first.', 'error');
        const clip = makeOverlayClip(rec, engine.t);
        store.update(set((x) => x.clips.push(clip)));
        ui.select({ type: 'clip', id: clip.id });
      };
      const frame = (k) => store.update(set((x) => x.clips.forEach((c) => FRAMINGS[k].apply(c))));
      return h(
        'div',
        {},
        common,
        b.range('Opacity', get((x) => x.opacity ?? 1), set((x, v) => (x.opacity = v)), { min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` }),
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
      const tabs = media.all().filter((m) => m.kind === 'tab' && m.tracks && m.tracks.length);
      const upload = button('Upload Guitar Pro tab', async () => importFiles(await pickFiles(TAB_ACCEPT, false), { tabLayer: L.id }), { iconName: 'upload', variant: tabs.length ? 'ghost sm' : 'primary' });
      const rec = media.get(L.mediaId);
      const tl = () => {
        const x = findLayer(store.get(), L.id);
        return x ? tabTimeline(media.get(x.mediaId), x.track) : null;
      };
      const fileSel = h('select', {}, h('option', { value: '' }, '— choose a tab file —'), tabs.map((m) => h('option', { value: m.id, selected: m.id === L.mediaId }, m.name)));
      fileSel.addEventListener('change', () => store.update(set((x) => {
        x.mediaId = fileSel.value || null;
        const r = media.get(fileSel.value);
        x.track = r ? r.tracks[0].index : 0;
      })));
      if (!rec) return h('div', {}, common, field('Tab file', fileSel), upload, h('p', { class: 'muted small' }, 'Guitar Pro (.gp, .gp5, .gp4, .gp3, .gpx) or MusicXML.'));
      const T = set;
      const g = (k, def) => get((x) => x[k] ?? def);
      return h(
        'div',
        {},
        common,
        field('Tab file', fileSel),
        upload,
        b.select('Track', () => String(findLayer(store.get(), L.id)?.track ?? 0), T((o, v) => (o.track = parseInt(v, 10))), rec.tracks.map((tr) => [String(tr.index), `${tr.name} · ${tr.strings} strings (${tr.tuning.slice().reverse().join(' ')})`])),
        b.segmented('Style', g('mode', 'scroll'), T((o, v) => (o.mode = v)), [['scroll', 'Scrolling'], ['bars', 'Bar by bar']]),
        syncTools(tl, false),
        visibleRange(),
        section(
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
          b.select('Font', g('font'), T((o, v) => (o.font = v)), fontOptions()),
          b.toggle('Show tuning letters', g('showTuning'), T((o, v) => (o.showTuning = v))),
          b.toggle('Show techniques (PM, h, /, bends, ~)', g('showMarks'), T((o, v) => (o.showMarks = v))),
        ),
      );
    }

    // ---- drum chart layer
    if (L.type === 'drums') {
      const gpFiles = media.all().filter((m) => m.kind === 'tab' && m.drumTracks && m.drumTracks.length);
      const stems = media.all().filter((m) => m.kind === 'audio' || m.kind === 'video');
      const g = (k, def) => get((x) => x[k] ?? def);
      const rec = media.get(L.mediaId);
      const isStem = L.source === 'audio';
      let status = null;
      if (isStem && rec) {
        const data = drumHitsFromStem(rec, L.sensitivity, () => ui.refreshPanels(true));
        status = h('p', { class: 'muted tiny' }, data === undefined ? 'Listening to the stem for kick, snare and hi-hat hits…' : data ? `${data.hits.length} hits found: ${data.lanes.map((l) => `${data.hits.filter((x) => x.lane === l).length} ${l}`).join(', ')}.` : 'Could not read this file.');
      }
      const fileSel = h('select', {}, h('option', { value: '' }, isStem ? '— choose a drum stem —' : '— choose a Guitar Pro file —'), (isStem ? stems : gpFiles).map((m) => h('option', { value: m.id, selected: m.id === L.mediaId }, m.name)));
      fileSel.addEventListener('change', () => store.update(set((x) => {
        x.mediaId = fileSel.value || null;
        const r = media.get(fileSel.value);
        if (!isStem && r) x.track = r.drumTracks[0].index;
      })));
      const tl = () => {
        const x = findLayer(store.get(), L.id);
        return x && x.source === 'gp' ? drumTimeline(media.get(x.mediaId), x.track) : null;
      };
      return h(
        'div',
        {},
        common,
        b.segmented('Notes come from', g('source', 'gp'), set((x, v) => ((x.source = v), (x.mediaId = null), (x.offset = v === 'gp' ? +timelineToSong(0, store.get().song).toFixed(3) : 0))), [['gp', 'Guitar Pro drum track'], ['audio', 'Drum stem (audio)']]),
        field(isStem ? 'Drum stem' : 'Guitar Pro file', fileSel),
        isStem
          ? button('Upload a drum stem', async () => importFiles(await pickFiles('audio/*', true)), { iconName: 'upload', variant: 'ghost sm' })
          : button('Upload Guitar Pro file', async () => importFiles(await pickFiles(TAB_ACCEPT, false), { drumLayer: L.id }), { iconName: 'upload', variant: 'ghost sm' }),
        !isStem && rec ? b.select('Drum track', () => String(findLayer(store.get(), L.id)?.track ?? 0), set((x, v) => (x.track = parseInt(v, 10))), rec.drumTracks.map((tr) => [String(tr.index), tr.name])) : null,
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
        L.style === 'neon' ? b.toggle('Show the combo counter', g('showCombo', true), set((x, v) => (x.showCombo = v))) : null,
        rec ? syncTools(tl, isStem) : null,
        visibleRange(),
        section(
          'Look',
          ['circle', 'kit'].includes(L.style) ? null : b.range('Seconds on screen', g('window', 2.2), set((x, v) => (x.window = v)), { min: 1, max: 6, step: 0.1, fmt: (v) => `${v.toFixed(1)}s` }),
          ['lanes', 'glass'].includes(L.style) ? b.range('Hit line', g('playhead', 22), set((x, v) => (x.playhead = v)), { min: 5, max: 70, step: 1, fmt: (v) => `${v}%` }) : null,
          placement({ y: 24 }),
          h('div', { class: 'grid3' }, LANES.map((ln) => b.color(ln.label, get((x) => (x.colors || {})[ln.id] || ln.color), set((x, v) => (x.colors = { ...(x.colors || {}), [ln.id]: v }))))),
          h('div', { class: 'grid2' }, b.color('Background', g('bg'), set((x, v) => (x.bg = v))), b.range('Background opacity', g('bgOpacity', 0.55), set((x, v) => (x.bgOpacity = v)), { min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` })),
          b.toggle('Show drum names', g('showLabels', true), set((x, v) => (x.showLabels = v))),
        ),
      );
    }

    // ---- visualizer layer
    const g = (k, def) => get((x) => x[k] ?? def);
    const sources = media.all().filter((m) => m.kind === 'audio' || m.kind === 'video');
    const srcSel = h('select', {}, h('option', { value: 'song' }, 'The song'), sources.filter((m) => !(p.song && m.id === p.song.mediaId)).map((m) => h('option', { value: m.id, selected: m.id === L.source }, m.name)));
    srcSel.value = L.source || 'song';
    srcSel.addEventListener('change', () => store.update(set((x) => (x.source = srcSel.value))));
    const recV = media.get(L.source === 'song' ? p.song && p.song.mediaId : L.source);
    const feat = recV ? vizFeatures(recV, () => ui.refreshPanels(true)) : null;
    const styleGrid = h(
      'div',
      { class: 'style-grid', role: 'radiogroup', 'aria-label': 'Visualizer style' },
      VIZ_STYLES.map(([id, label, hint]) =>
        h('button', { type: 'button', role: 'radio', 'aria-checked': L.style === id ? 'true' : 'false', class: `style-opt${L.style === id ? ' on' : ''}`, onclick: () => store.update(set((x) => {
          x.style = id;
          if (id === 'bars' || id === 'wave') Object.assign(x, { y: 80, size: 80 });
          if (id === 'circle' || id === 'rings' || id === 'electric') Object.assign(x, { y: 45, size: 70 });
          if (id === 'glow') x.blend = 'screen';
        })) }, h('strong', {}, label), h('span', {}, hint)),
      ),
    );
    return h(
      'div',
      {},
      common,
      field('Reacts to', srcSel, 'Pick a stem (drums, bass, vocals…) or the whole song. Upload stems in Media.'),
      button('Upload stems', async () => importFiles(await pickFiles('audio/*', true)), { iconName: 'upload', variant: 'ghost sm' }),
      h('p', { class: 'muted tiny' }, !recV ? 'No audio chosen yet.' : feat === undefined ? 'Analysing the audio…' : feat ? `Ready: ${feat.duration.toFixed(1)}s analysed.` : 'Could not read this audio file.'),
      section('Style', styleGrid),
      section(
        'Look',
        h('div', { class: 'grid2' }, b.color('Color', g('color'), set((x, v) => (x.color = v))), b.color('Second color', g('color2'), set((x, v) => (x.color2 = v)))),
        b.range('Intensity', g('intensity', 0.7), set((x, v) => (x.intensity = v)), { min: 0, max: 1.5, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` }),
        ['ripple', 'particles'].includes(L.style) ? b.range('Hit sensitivity', g('sensitivity', 0.5), set((x, v) => (x.sensitivity = v)), { min: 0.05, max: 0.95, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` }) : null,
        ['ripple', 'particles'].includes(L.style) ? b.toggle('Scatter across the frame', g('scatter', false), set((x, v) => (x.scatter = v))) : null,
        placement({ y: 50, size: 70 }),
        h('div', { class: 'grid2' },
          b.range('Opacity', g('opacity', 1), set((x, v) => (x.opacity = v)), { min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` }),
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
