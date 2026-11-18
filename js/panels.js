// Left-hand tool panels and the right-hand inspector.
import {
  ASPECTS,
  uid,
  formatTime,
  parseTime,
  linesFromText,
  parseLRC,
  toLRC,
  shiftLyrics,
  sortLyrics,
  tapStart,
  tapEnd,
  findHook,
  detectBeats,
  beatCutPlan,
  songToTimeline,
  timelineToSong,
  clipAt,
  splitClip,
  layoutClips,
  maxClipDuration,
  clamp,
} from './core.js';
import { FONTS, PLATFORMS, FILTER_PRESETS, newText, defaultLyricStyle, loadSettings, saveSettings, loadTemplates, saveTemplates, findClip, findLayer, LAYER_TYPES } from './state.js';
import { buildLayersPanel, makeLayer, TAB_ACCEPT } from './panel-layers.js';
import { templateFromProject, applyMyTemplate, templateFile, parseTemplateFile, describeTemplate } from './mytemplates.js';
import { bgRemoveSection } from './panel-bgremove.js';
import { buildSuggestPanel, hasNewSuggestions } from './panel-suggest.js';
import { captionPicker } from './panel-captions.js';
import { fetchSpotifyInfo } from './spotify.js';
import { LINE_PRESETS, lineStyle, hasLineStyle } from './linestyle.js';
import { THEMES, themeById, applyTheme } from './themes.js';

const themeState = { motion: false };
import { ensureLayerAnalyses } from './media.js';
import { media, addMedia, removeMedia, tabTimeline } from './media.js';
import { PROVIDERS, searchStock, downloadStock } from './stock.js';
import { exportVideo, pickMimeType } from './engine.js';
import { TRANSITIONS, TEXT_ANIMATIONS, END_ANIMATIONS, CLIP_EFFECTS, MIRRORS, MASK_SHAPES, GRADE_PRESETS, renderFrame } from './renderer.js';
import { PLATFORM_OVERLAYS, overlaySupported } from './overlays.js';
import { LAYOUTS, TEMPLATES, applyLayout, applyTemplate, tabIntoLayout, lyricsIntoLayout, tabSources, templateNeeds } from './templates.js';
import { LYRIC_DISPLAYS, DISPLAY_DEFAULTS } from './lyricviz.js';
import { BUILTIN_SFX, synthSfx, searchSfx, SFX_CATEGORIES, SFX_LICENSES } from './sfx.js';
import { shareFile, canShareFiles, youtube } from './share.js';
import { soundLib, importSounds, filterSounds, storageInfo, requestPersistence } from './soundlib.js';
import { searchFreesound, FS_LICENSES, FS_DURATIONS, FS_SORTS, FREESOUND_KEY_URL } from './freesound.js';

import { h, icon, button, iconButton, toast, download, pickFiles, field, section, fold, setFold, keyBox, Binder } from './dom.js';

const fontOptions = () => [
  ...FONTS.map((f) => [f.id, f.label]),
  ...media
    .all()
    .filter((m) => m.kind === 'font' && m.family)
    .map((m) => [m.family, `${m.family} (uploaded)`]),
];

const ANIMATIONS = TEXT_ANIMATIONS;

const LYRIC_PRESETS = {
  'Bold pop': { font: 'Bebas Neue', size: 10, color: '#ffffff', outline: '#000000', outlineWidth: 0.6, shadow: true, box: false, animation: 'pop', uppercase: true },
  Karaoke: { font: 'Montserrat', size: 6, color: '#ffffff', highlight: '#ffd400', outline: '#000000', outlineWidth: 0.5, shadow: true, box: false, animation: 'karaoke', uppercase: false },
  'Word by word': { font: 'Oswald', size: 7.5, color: '#ffffff', highlight: '#ff4d6d', outline: '#000000', outlineWidth: 0.4, shadow: true, box: false, animation: 'words', uppercase: true },
  Boxed: { font: 'Inter', size: 5.2, color: '#111111', box: true, boxColor: '#ffffff', boxOpacity: 0.95, outlineWidth: 0, shadow: false, animation: 'slide', uppercase: false },
  Typewriter: { font: 'Courier New', size: 5.5, color: '#f5f5f5', outlineWidth: 0, shadow: true, box: true, boxColor: '#000000', boxOpacity: 0.6, animation: 'typewriter', uppercase: false },
  Neon: { font: 'Montserrat', size: 7, color: '#ffffff', highlight: '#ff2bd6', outline: '#ff2bd6', outlineWidth: 0.25, shadow: false, box: false, animation: 'neon', uppercase: true },
  'Drop & bounce': { font: 'Bebas Neue', size: 10, color: '#ffd400', outline: '#000000', outlineWidth: 0.7, shadow: true, box: false, animation: 'bounce', uppercase: true },
  Glitch: { font: 'Oswald', size: 8, color: '#ffffff', outline: '#000000', outlineWidth: 0.3, shadow: true, box: false, animation: 'glitch', uppercase: true },
  'Beat pulse': { font: 'Bebas Neue', size: 9.5, color: '#ffffff', outline: '#000000', outlineWidth: 0.6, shadow: true, box: false, animation: 'beat', uppercase: true },
  'Hand drawn': { font: 'Permanent Marker', size: 7, color: '#fff7d6', outline: '#1a1a1a', outlineWidth: 0.5, shadow: true, box: false, animation: 'fade', uppercase: false },
};

export function createPanels({ store, engine, ui }) {
  const settings = loadSettings();
  const sync = { active: false, cursor: 0 };

  // -------------------------------------------------------------- media actions
  const actions = {
    /** Add a built-in sound effect at time `at` on the timeline (used by hook openers). */
    async addBuiltinSfx(id, at = 0) {
      const s = BUILTIN_SFX.find((x) => x.id === id);
      if (!s) return;
      const rec = await addMedia(await synthSfx(id), `${s.label}.wav`, { source: 'builtin' });
      const keep = engine.t;
      engine.t = at;
      actions.addAudioTrack(rec);
      engine.t = keep;
    },
    /** Open the Stock tab and search for `query` (used by the suggested-background chips). */
    stockSearch(query) {
      stockState.query = query;
      stockState.autorun = true;
      ui.select(null);
      ui.openTab('stock');
      ui.refreshPanels(true);
    },
    addClip(rec, at = null) {
      store.update((d) => {
        const clip = {
          id: uid('clip'),
          mediaId: rec.id,
          kind: rec.kind,
          in: 0,
          duration: rec.kind === 'image' ? 3 : +Math.min(rec.duration || 5, 6).toFixed(2),
          speed: 1,
          fit: 'cover',
          zoom: 1,
          panX: 0,
          panY: 0,
          rotate: 0,
          flip: false,
          volume: 0,
          filter: { preset: 'none', adjust: {} },
          transition: { type: d.clips.length ? 'crossfade' : 'fade', duration: 0.4 },
          kenBurns: rec.kind === 'image' ? { fromZoom: 1, toZoom: 1.15, fromX: 0, toX: 0, fromY: 0, toY: 0 } : null,
        };
        if (at == null) d.clips.push(clip);
        else d.clips.splice(at, 0, clip);
        const total = d.clips.reduce((s, c) => s + c.duration, 0);
        if (d.clips.length === 1 && !d.song) d.duration = Math.max(d.duration, +(total + (d.endCard.enabled ? d.endCard.duration : 0)).toFixed(2));
      });
      toast(`Added “${rec.name}” to the video track`);
    },
    useSong(rec) {
      store.update((d) => {
        d.song = { mediaId: rec.id, offset: 0, volume: 1, fadeIn: 0.3, fadeOut: 1.2 };
        d.beats = null;
      });
      toast('Song set. Use “Find the hook” in the Audio tab to pick the best section.');
    },
    addAudioTrack(rec) {
      store.update((d) => {
        d.audioTracks.push({
          id: uid('aud'),
          mediaId: rec.id,
          start: +engine.t.toFixed(2),
          in: 0,
          duration: +Math.min(rec.duration || 5, Math.max(1, d.duration - engine.t)).toFixed(2),
          volume: 0.8,
          fadeIn: 0,
          fadeOut: 0.3,
        });
      });
      toast(`Added “${rec.name}” as an extra audio track`);
    },
    useCover(rec) {
      store.update((d) => {
        d.endCard.coverMediaId = rec.id;
        d.endCard.enabled = true;
      });
      toast('Cover art set on the end card');
    },
    useWatermark(rec) {
      store.update((d) => (d.look.watermark.mediaId = rec.id));
      toast('Logo set as watermark');
    },
    /**
     * Put a Guitar Pro file on the video. `into` = { tabLayer, drumLayer } fills an existing layer;
     * otherwise a new tab layer is added (and a drum chart when the file only has drums).
     */
    useTab(rec, into = {}) {
      let selectId = null;
      store.update((d) => {
        const off = +timelineToSong(0, d.song).toFixed(3);
        const target = into.tabLayer || into.drumLayer ? d.layers.find((l) => l.id === (into.tabLayer || into.drumLayer)) : null;
        if (target && target.type === 'tab' && rec.tracks.length) {
          Object.assign(target, { mediaId: rec.id, track: rec.tracks[0].index, offset: target.mediaId ? target.offset : off });
          selectId = target.id;
        } else if (target && target.type === 'drums' && rec.drumTracks.length) {
          Object.assign(target, { source: 'gp', mediaId: rec.id, track: rec.drumTracks[0].index, offset: target.mediaId ? target.offset : off });
          selectId = target.id;
        } else if (rec.tracks.length) {
          const L = { ...makeLayer(d, 'tab'), mediaId: rec.id, track: rec.tracks[0].index, offset: off };
          d.layers.push(L);
          selectId = L.id;
        } else {
          const L = { ...makeLayer(d, 'drums'), source: 'gp', mediaId: rec.id, track: rec.drumTracks[0].index, offset: off };
          d.layers.push(L);
          selectId = L.id;
        }
        if (d.layout && d.layout !== 'full') tabIntoLayout(d);
      });
      const extra = rec.tracks.length && rec.drumTracks.length ? ' It also has drums: add a Drum chart layer to show them.' : '';
      toast(`“${rec.title || rec.name}” is on the video. Line it up with the song in the Guitar Pro tab.${extra}`, 'info', 6000);
      ui.select({ type: 'layer', id: selectId });
      ui.openTab('layers');
    },
  };

  async function importFiles(files, into = {}) {
    let added = 0;
    for (const f of files) {
      try {
        const rec = await addMedia(f, f.name);
        added += 1;
        // first useful default for each kind
        const p = store.get();
        if (rec.kind === 'audio' && !p.song) actions.useSong(rec);
        else if (rec.kind === 'tab') actions.useTab(rec, into);
        else if (rec.kind === 'video' || (rec.kind === 'image' && p.clips.length === 0 && !/cover|art/i.test(f.name))) actions.addClip(rec);
        else if (rec.kind === 'image' && /cover|art/i.test(f.name)) actions.useCover(rec);
        else if (rec.kind === 'font') toast(`Font “${rec.family}” is ready in every font menu`);
      } catch (e) {
        toast(e.message, 'error', 5000);
      }
    }
    if (added) ui.refreshPanels(true);
  }

  // -------------------------------------------------------------- tabs

  // The rail: one "Start" tab for ideas (stacked folds), then a tab per kind of thing you build.
  const tabs = [
    { id: 'start', label: 'Start', icon: 'sparkle', build: buildStart, dot: () => hasNewSuggestions(store.get()) },
    { id: 'video', label: 'Video', icon: 'film', build: buildVideoTab },
    { id: 'audio', label: 'Audio', icon: 'music', build: buildAudioTab },
    { id: 'lyrics', label: 'Lyrics', icon: 'mic', build: buildLyrics },
    { id: 'visualizer', label: 'Visualizer', icon: 'volume', build: buildVizTab },
    { id: 'guitarpro', label: 'Guitar Pro', icon: 'guitar', build: buildGuitarTab },
    { id: 'text', label: 'Text', icon: 'type', build: buildText },
    { id: 'endcard', label: 'End card', icon: 'disc', build: buildEndCard },
    { id: 'style', label: 'Look', icon: 'palette', build: buildStyle },
    { id: 'export', label: 'Export', icon: 'download', build: buildExport },
  ];
  // Old tab ids (bookmarks, saved state, other panels) open the fold that now holds them.
  const TAB_ALIASES = {
    suggested: ['start', 'start-suggested'],
    templates: ['start', 'start-templates'],
    mytemplates: ['start', 'start-mine'],
    media: ['video', 'video-clips'],
    stock: ['video', 'video-stock'],
    youtube: ['video', 'video-youtube'],
    sounds: ['audio', 'audio-sounds'],
  };
  const LAYER_HOME = { video: ['video', 'video-layers'], viz: ['visualizer'], tab: ['guitarpro'], drums: ['guitarpro'] };
  /** Which tab (and fold) an id opens. `layers` goes to the tab for the selected layer's kind. */
  function resolveTab(id) {
    if (id === 'layers') {
      const L = ui.selection && ui.selection.type === 'layer' ? (store.get().layers || []).find((x) => x.id === ui.selection.id) : null;
      return L ? LAYER_HOME[L.type] : ['video', 'video-layers'];
    }
    return TAB_ALIASES[id] || [id];
  }
  const layerCtx = () => ({ store, engine, ui, importFiles, fontOptions });

  // ---------------------------------------------------------------- START (stacked ideas)
  function buildStart(b) {
    const p = store.get();
    const page = (id, ic, title, blurb) =>
      h('button', { type: 'button', class: 'page-link', onclick: () => ui.openTab(id) }, icon(ic, 20), h('span', {}, h('strong', {}, title), h('span', { class: 'muted tiny' }, blurb)), icon('chevron', 16));
    return h(
      'div',
      { class: 'start-stack' },
      fold('start-suggested', 'Suggested for you', { badge: hasNewSuggestions(p) ? 'New' : null, hint: 'From your song, clips and lyrics' }, () => buildSuggestPanel({ store, engine, ui })),
      fold('start-templates', 'Templates and themes', { hint: 'One click restyles everything' }, () => buildTemplates()),
      fold('start-mine', 'My templates', { open: false, hint: 'Save this edit to reuse' }, () => buildMyTemplates()),
      fold(
        'start-more',
        'Inspiration, Tab Studio and Carousel',
        { open: false },
        h(
          'div',
          { class: 'page-links' },
          page('inspiration', 'wand', 'Inspiration', 'Trends for your niche, the posting playbook, captions and hooks'),
          page('tabstudio', 'guitar', 'Tab Studio', 'Write or fix Guitar Pro tabs, or make one from a stem'),
          page('carousel', 'image', 'Carousel', 'Photo carousels for Instagram and TikTok'),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- VIDEO / AUDIO / LAYER TABS
  function buildVideoTab(b) {
    const n = (store.get().layers || []).filter((l) => l.type === 'video').length;
    return h(
      'div',
      {},
      fold('video-clips', 'My clips', { hint: 'Upload and arrange your footage' }, buildMedia(b)),
      fold('video-stock', 'Stock video', { open: false, hint: 'Pexels, Pixabay, Wikimedia' }, () => buildStock()),
      fold('video-youtube', 'From your YouTube channel', { open: false, hint: 'Videos you posted' }, buildYouTubeImport()),
      fold(
        'video-layers',
        'Video layers',
        { open: n > 0, badge: n ? String(n) : null, hint: 'Clips on top of the main video' },
        buildLayersPanel(b, layerCtx(), { types: ['video'], empty: 'No video layers. Use one for picture-in-picture, smoke or light-leak footage.' }),
      ),
    );
  }
  function buildAudioTab(b) {
    return h(
      'div',
      {},
      fold('audio-song', 'Song and your own audio', { hint: 'Song, beats, voice-over, clip sound' }, buildAudio(b)),
      fold('audio-sounds', 'Sound effects', { hint: 'Built-in, free libraries and yours' }, () => buildSounds()),
    );
  }
  function buildVizTab(b) {
    return buildLayersPanel(b, layerCtx(), {
      types: ['viz'],
      intro: 'Visuals that react to your song or a stem: ripples, spectrums, VU meters, fire and more.',
      empty: 'No visualizers yet.',
    });
  }
  function buildGuitarTab(b) {
    return buildLayersPanel(b, layerCtx(), {
      types: ['tab', 'drums'],
      intro: 'Guitar, bass and drum parts from Guitar Pro files (or a drum stem), in time with the song.',
      empty: 'No tab or drum layers yet.',
      after: section(
        'Tab Studio',
        h('p', { class: 'muted small' }, 'Write a tab, fix one, or make one from a guitar, bass or drum stem.'),
        button('Open Tab Studio', () => ui.openTab('tabstudio'), { iconName: 'guitar', variant: 'sm' }),
      ),
    });
  }

  // ---------------------------------------------------------------- YOUTUBE (your own uploads)
  function buildYouTubeImport() {
    const step = (n, ...kids) => h('li', {}, h('span', { class: 'step-n' }, String(n)), h('span', {}, ...kids));
    const link = (href, text) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text);
    return h(
      'div',
      { class: 'yt-import' },
      h('p', { class: 'muted small' }, 'YouTube lets you download videos you uploaded yourself from YouTube Studio. Videos from other channels can’t be downloaded.'),
      h(
        'ol',
        { class: 'steps' },
        step(1, 'Open ', link('https://studio.youtube.com/', 'YouTube Studio'), ' and go to ', h('b', {}, 'Content'), '.'),
        step(2, 'Hover your video, click ', h('b', {}, '⋮ Options'), ', then ', h('b', {}, 'Download'), '.'),
        step(3, 'Drop the MP4 here, or anywhere on this page.'),
      ),
      h(
        'div',
        { class: 'row' },
        button('Add the downloaded video', async () => importFiles(await pickFiles('video/*,.mp4,.mov,.webm', true)), { iconName: 'upload', variant: 'sm primary' }),
        h('a', { class: 'btn sm ghost', href: 'https://support.google.com/youtube/answer/56100', target: '_blank', rel: 'noopener noreferrer' }, 'YouTube’s help page'),
      ),
      h('p', { class: 'muted tiny' }, 'Shorts are downloaded the same way. Studio gives you a 720p file; for full quality, use your original export.'),
    );
  }


  // ---------------------------------------------------------------- MY TEMPLATES
  const myTplState = { name: '', error: '' };
  function buildMyTemplates() {
    const list = loadTemplates();
    const save = () => {
      const name = nameIn.value.trim() || store.get().name || 'My template';
      // a small picture of the frame at the first lyric (or 1.5 s) for the card
      let thumb = null;
      try {
        const c = h('canvas', { width: 72, height: 128 });
        const draft = structuredClone(store.get());
        draft.look.overlay = 'off';
        renderFrame(c.getContext('2d'), c.width, c.height, draft, Math.min(1.5, draft.duration / 3), engine.env(false));
        thumb = c.toDataURL('image/jpeg', 0.7);
      } catch {
        thumb = null;
      }
      const at = list.findIndex((t) => t.name.toLowerCase() === name.toLowerCase());
      if (at >= 0 && !confirm(`Replace your template “${list[at].name}”?`)) return;
      const t = templateFromProject(store.get(), name, thumb);
      if (at >= 0) list[at] = t;
      else list.unshift(t);
      try {
        saveTemplates(list);
      } catch {
        return toast('Could not save: this browser’s storage is full.', 'error');
      }
      myTplState.name = '';
      toast(`Saved “${name}” to My templates`);
      ui.refreshPanels(true);
    };
    const use = (t) => {
      let res = null;
      store.update((d) => (res = applyMyTemplate(d, t)));
      const miss = res && res.missing.length ? ` It also had ${[...new Set(res.missing)].map((k) => ({ tab: 'a guitar tab', drums: 'a drum chart', video: 'a video layer' })[k]).join(' and ')}; add the file in the ${res.missing.includes('video') ? 'Video' : 'Guitar Pro'} tab.` : '';
      toast(`“${t.name}” applied. Undo (Ctrl+Z) to go back.${miss}`, 'info', miss ? 7000 : 3500);
      ui.refreshPanels(true);
    };
    const remove = (i) => {
      if (!confirm(`Delete your template “${list[i].name}”?`)) return;
      list.splice(i, 1);
      saveTemplates(list);
      ui.refreshPanels(true);
    };
    const exportOne = (t) => download(new Blob([templateFile(t)], { type: 'application/json' }), `${t.name.replace(/[^\w\- ]+/g, '').trim() || 'template'}.promo-template.json`);
    const importOne = async () => {
      const [f] = await pickFiles('.json,application/json', false);
      if (!f) return;
      try {
        const t = parseTemplateFile(await f.text());
        list.unshift(t);
        saveTemplates(list);
        toast(`Added “${t.name}” to My templates`);
        ui.refreshPanels(true);
      } catch (e) {
        toast(e.message, 'error', 5000);
      }
    };
    const nameIn = h('input', { type: 'text', placeholder: store.get().name || 'e.g. Dark single, breakdown teaser', value: myTplState.name, maxlength: 80, 'aria-label': 'Template name' });
    nameIn.addEventListener('input', () => (myTplState.name = nameIn.value));
    nameIn.addEventListener('keydown', (e) => e.key === 'Enter' && save());
    const cards = list.map((t, i) =>
      h(
        'div',
        { class: 'my-tpl' },
        t.thumb ? h('img', { src: t.thumb, alt: '', class: 'my-tpl-thumb' }) : h('div', { class: 'my-tpl-thumb empty' }, icon('star', 18)),
        h(
          'div',
          { class: 'my-tpl-info' },
          h('strong', {}, t.name),
          h('span', { class: 'muted tiny' }, describeTemplate(t)),
          h(
            'div',
            { class: 'row' },
            button('Use', () => use(t), { variant: 'sm primary' }),
            iconButton('download', `Download “${t.name}” as a file`, () => exportOne(t), 'ghost'),
            iconButton('trash', `Delete template ${t.name}`, () => remove(i), 'ghost danger'),
          ),
        ),
      ),
    );
    return h(
      'div',
      { class: 'my-tpls' },
      h('p', { class: 'muted small' }, 'Saves the look of this edit (theme, fonts, lyric style, grades and effects, text, end card, visualizer and tab styles) without your clips, song or lyrics, so you can reuse it on the next release.'),
      h('div', { class: 'search-row' }, nameIn, button('Save', save, { iconName: 'star', variant: 'primary' })),
      cards.length ? h('div', { class: 'my-tpl-list' }, cards) : h('p', { class: 'muted tiny' }, 'No templates yet.'),
      h('div', { class: 'row' }, button('Import a template file', importOne, { iconName: 'upload', variant: 'sm ghost' })),
    );
  }

  // ---------------------------------------------------------------- TEMPLATES
  function buildTemplates() {
    const p = store.get();
    const layoutBtns = h(
      'div',
      { class: 'layout-list' },
      LAYOUTS.map((l) =>
        h(
          'button',
          {
            type: 'button',
            class: `layout-btn${p.layout === l.id ? ' on' : ''}`,
            'aria-pressed': p.layout === l.id ? 'true' : 'false',
            onclick: () => {
              store.update((d) => applyLayout(d, l.id));
              toast(`${l.label} layout applied to lyrics, text, logo, progress bar and end card`);
            },
          },
          h('strong', {}, l.label),
          h('span', { class: 'muted tiny' }, l.desc),
        ),
      ),
    );

    // live thumbnails of each template using your own media
    const firstLyric = sortLyrics(p.lyrics)[0];
    const lyricT = firstLyric ? songToTimeline(firstLyric.start, p.song) + 0.7 : null;
    const previewT = lyricT != null && lyricT > 0 && lyricT < p.duration - (p.endCard.enabled ? p.endCard.duration : 0) ? lyricT : Math.min(1.5, p.duration / 3);
    const sources = tabSources(media.all());
    const cards = TEMPLATES.map((tpl) => {
      const c = h('canvas', { width: 108, height: 192, class: 'tpl-thumb', 'aria-hidden': 'true' });
      requestAnimationFrame(() => {
        const draft = structuredClone(store.get());
        applyTemplate(draft, tpl.id, sources);
        draft.look.overlay = 'off';
        try {
          renderFrame(c.getContext('2d'), c.width, c.height, draft, previewT, engine.env(false));
        } catch (e) {
          console.warn('template preview failed', e);
        }
      });
      const needs = templateNeeds(tpl.id, sources);
      return h(
        'div',
        { class: `tpl-card${p.template === tpl.id ? ' on' : ''}` },
        c,
        h(
          'div',
          { class: 'tpl-info' },
          h('strong', {}, tpl.name),
          h('span', { class: 'muted tiny' }, tpl.blurb),
          needs ? h('span', { class: 'tpl-needs tiny' }, `Needs a Guitar Pro file with a ${needs} track. Add one in the Guitar Pro tab.`) : null,
          button(p.template === tpl.id ? 'Applied · re-apply' : 'Use this template', () => {
            store.update((d) => applyTemplate(d, tpl.id, tabSources(media.all())));
            toast(`“${tpl.name}” applied. Undo (Ctrl+Z) to go back.`);
            ui.refreshPanels(true);
          }, { variant: `sm${p.template === tpl.id ? '' : ' primary'}` }),
        ),
      );
    });

    return h(
      'div',
      {},
      themeSection(p, previewT),
      section(
        'Layout for the app you post to',
        h('p', { class: 'muted small' }, 'Moves lyrics, text, your logo, the progress bar and the end card into the area that app leaves clear. Templates keep the layout you pick here.'),
        p.aspect !== '9:16' ? h('p', { class: 'warn-list' }, 'App layouts are made for 9:16. Switch Format to 9:16 first.') : null,
        layoutBtns,
      ),
      section(
        'Song templates',
        h('p', { class: 'muted small' }, 'Each template sets the lyric style, color grade, effects, transitions, text and end card in one click, using your clips and song. Previews show your own footage.'),
        p.clips.length ? null : h('p', { class: 'muted tiny' }, 'Add a few clips first to see the previews properly.'),
        h('div', { class: 'tpl-grid' }, cards),
      ),
    );
  }

  // ---------------------------------------------------------------- THEMES
  function themeSection(p, previewT) {
    const cur = p.theme && themeById(p.theme.id);
    const cards = THEMES.map((t) => {
      const c = h('canvas', { width: 54, height: 96, class: 'theme-thumb', 'aria-hidden': 'true' });
      requestAnimationFrame(() => {
        const draft = structuredClone(store.get());
        applyTheme(draft, t.id, { colors: p.theme && p.theme.id === t.id && p.theme.custom ? p.theme.colors : null });
        draft.look.overlay = 'off';
        try {
          renderFrame(c.getContext('2d'), c.width, c.height, draft, previewT, engine.env(false));
        } catch (e) {
          console.warn('theme preview failed', e);
        }
      });
      const on = p.theme && p.theme.id === t.id;
      const cols = on ? p.theme.colors : t.colors;
      return h(
        'button',
        {
          type: 'button',
          class: `theme-card${on ? ' on' : ''}`,
          'aria-pressed': on ? 'true' : 'false',
          title: t.blurb,
          onclick: () => {
            store.update((d) => applyTheme(d, t.id, { motion: themeState.motion }));
            toast(`${t.name} applied to lyrics, text, picture, end card, layers and backgrounds. Undo (Ctrl+Z) to go back.`, 'info', 4500);
            ui.refreshPanels(true);
          },
        },
        c,
        h('span', { class: 'theme-info' },
          h('strong', {}, t.name),
          h('span', { class: 'theme-sw', 'aria-hidden': 'true' }, ['bg', 'deep', 'accent', 'light'].map((k) => h('i', { style: { background: cols[k] } }))),
          h('span', { class: 'muted tiny' }, t.blurb)),
      );
    });
    const motion = h('input', { type: 'checkbox', checked: themeState.motion });
    motion.addEventListener('change', () => (themeState.motion = motion.checked));
    const own = cur
      ? (() => {
          const pick = (k, label) => {
            const inp = h('input', { type: 'color', value: p.theme.colors[k], 'aria-label': label });
            inp.addEventListener('change', () => {
              store.update((d) => applyTheme(d, cur.id, { colors: { ...d.theme.colors, [k]: inp.value } }), `theme-${k}`);
              ui.refreshPanels(true);
            });
            return h('label', { class: 'theme-pick' }, inp, h('span', { class: 'tiny' }, label));
          };
          return h('div', { class: 'theme-own' },
            h('div', { class: 'lbl' }, `Make my own ${cur.name}`),
            h('div', { class: 'row' }, pick('bg', 'Background'), pick('deep', 'Dark tone'), pick('accent', 'Accent'), pick('light', 'Text')),
            h('div', { class: 'row' },
              p.theme.custom ? button('Back to the theme’s colours', () => (store.update((d) => applyTheme(d, cur.id)), ui.refreshPanels(true)), { variant: 'ghost sm' }) : null,
              button('Also use its cuts and motion', () => {
                store.update((d) => applyTheme(d, cur.id, { colors: d.theme.colors, motion: true }));
                toast(`${cur.name} cuts, clip effects and lyric motion applied`);
              }, { variant: 'ghost sm' })));
        })()
      : null;
    return section(
      'Theme',
      h('p', { class: 'muted small' }, 'Dark looks for heavy music. A theme recolours everything at once: lyrics and text, the picture, the end card, tab, drum and visualizer layers, cut-out backgrounds and carousel slides. Your clips, timing and lyrics stay. Templates you pick afterwards keep the theme.'),
      h('div', { class: 'theme-grid' }, cards),
      h('label', { class: 'toggle' }, motion, h('span', {}, 'Also use the theme’s cuts, clip effects and lyric motion')),
      own,
    );
  }

  // ---------------------------------------------------------------- SOUNDS
  const previewAudio = new Audio();
  let previewing = null;
  const soundState = { query: '', license: settings.sfxLicense || 'cc0', results: [], loading: false, error: '', page: 1 };
  const fsState = { query: '', results: [], loading: false, error: '', page: 1, hasMore: false, count: 0 };
  const libState = { query: '', favoritesOnly: false, limit: 60, importing: '' };
  soundLib.onChange(() => ui.tab === 'audio' && !libState.importing && ui.refreshPanels(true));

  /** Files from a drop, walking into dropped folders. */
  async function filesFromDrop(dt) {
    const items = [...(dt.items || [])].map((it) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null)).filter(Boolean);
    if (!items.length) return [...(dt.files || [])];
    const out = [];
    const walk = async (entry, path) => {
      if (entry.isFile) {
        const f = await new Promise((res, rej) => entry.file(res, rej));
        try {
          Object.defineProperty(f, 'webkitRelativePath', { value: path + f.name });
        } catch {
          /* read-only in some browsers; tags then come from the file name */
        }
        out.push(f);
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        for (;;) {
          const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
          if (!batch.length) break;
          for (const e of batch) await walk(e, `${path}${entry.name}/`);
        }
      }
    };
    for (const e of items) await walk(e, '');
    return out;
  }
  function playPreview(id, url, btn) {
    if (previewing === id && !previewAudio.paused) {
      previewAudio.pause();
      previewing = null;
      btn.replaceChildren(icon('play', 16));
      return;
    }
    document.querySelectorAll('.sfx-play').forEach((b) => b.replaceChildren(icon('play', 16)));
    previewAudio.src = url;
    previewAudio.play().catch(() => toast('Could not play this preview.', 'error'));
    previewing = id;
    btn.replaceChildren(icon('stop', 16));
    previewAudio.onended = () => btn.replaceChildren(icon('play', 16));
  }
  async function addSoundBlob(blob, name, meta) {
    const rec = await addMedia(blob, name, meta);
    actions.addAudioTrack(rec);
    ui.refreshPanels(true);
  }

  function buildSounds() {
    // ---- My sound library (stored in this browser)
    const libList = h('div', { class: 'sfx-list lib-list' }, h('p', { class: 'muted tiny' }, 'Loading your library…'));
    const libInfo = h('p', { class: 'muted tiny' });
    const progress = h('p', { class: 'small', hidden: !libState.importing }, libState.importing || '');
    const libSearch = h('input', { type: 'search', placeholder: 'Search your sounds (name or folder)', value: libState.query, 'aria-label': 'Search your sound library' });
    const favBtn = h('button', { type: 'button', class: `btn chip${libState.favoritesOnly ? ' on' : ''}`, 'aria-pressed': libState.favoritesOnly ? 'true' : 'false' }, '★ Starred');

    const renderLib = async () => {
      const all = await soundLib.all();
      const shown = filterSounds(all, libState.query, { favoritesOnly: libState.favoritesOnly });
      const info = await storageInfo();
      const mb = (n) => (n == null ? '?' : (n / 1048576).toFixed(n > 1e8 ? 0 : 1));
      const total = all.reduce((s, x) => s + (x.size || 0), 0);
      libInfo.replaceChildren(
        `${all.length} sound${all.length === 1 ? '' : 's'} · ${mb(total)} MB`,
        info.quota ? ` · browser storage ${mb(info.usage)} of ${mb(info.quota)} MB used` : '',
        info.persisted ? ' · protected from clean-up' : '',
      );
      if (!all.length) {
        libList.replaceChildren(h('p', { class: 'muted small' }, 'No sounds yet. Add a batch of clips above; they stay here for every project.'));
        return;
      }
      if (!shown.length) {
        libList.replaceChildren(h('p', { class: 'muted small' }, 'No sounds match.'));
        return;
      }
      const limit = libState.limit;
      const more = shown.length > limit ? [button(`Show ${Math.min(60, shown.length - limit)} more of ${shown.length - limit}`, () => ((libState.limit += 60), renderLib()), { variant: 'ghost wide' })] : [];
      libList.replaceChildren(
        ...shown.slice(0, limit).map((s) => {
          const play = h('button', { type: 'button', class: 'icon-btn sfx-play', 'aria-label': `Preview ${s.name}` }, icon('play', 16));
          let url = null;
          play.addEventListener('click', () => {
            url = url || URL.createObjectURL(s.blob);
            playPreview(s.id, url, play);
          });
          const star = h('button', { type: 'button', class: `icon-btn star${s.favorite ? ' on' : ''}`, 'aria-label': s.favorite ? `Unstar ${s.name}` : `Star ${s.name}`, 'aria-pressed': s.favorite ? 'true' : 'false', onclick: () => soundLib.update(s.id, { favorite: !s.favorite }) }, s.favorite ? '★' : '☆');
          const nameBtn = h('button', { type: 'button', class: 'link sfx-name', title: 'Rename', onclick: async () => {
            const n = prompt('Rename sound', s.name);
            if (n && n.trim()) await soundLib.update(s.id, { name: n.trim() });
          } }, s.name);
          return h(
            'div',
            { class: 'sfx-row lib-row' },
            play,
            h('div', { class: 'sfx-meta' }, nameBtn, h('span', { class: 'muted tiny' }, [s.duration ? `${s.duration.toFixed(1)}s` : '', (s.tags || []).slice(0, 3).join(' · '), s.attribution ? `${s.attribution.license}${s.attribution.needsCredit ? ' (credit)' : ''}` : ''].filter(Boolean).join(' · '))),
            h(
              'div',
              { class: 'lib-acts' },
              star,
              button('Add', () => addSoundBlob(s.blob, `${s.name}${(/\.[a-z0-9]+$/i.exec(s.fileName || '') || ['.mp3'])[0]}`, { source: s.source, attribution: s.attribution }), { iconName: 'plus', variant: 'sm primary', title: 'Add to the timeline at the playhead' }),
              iconButton('trash', `Delete ${s.name}`, async () => confirm(`Delete “${s.name}” from your library?`) && soundLib.remove(s.id), 'ghost danger'),
            ),
          );
        }),
        ...more,
      );
    };

    const doImport = async (files) => {
      if (!files.length) return;
      libState.importing = `Adding 0 of ${files.length}…`;
      progress.hidden = false;
      progress.textContent = libState.importing;
      const res = await importSounds(files, {
        onProgress: (i, n, name) => (progress.textContent = libState.importing = `Adding ${i} of ${n}: ${name}`),
      });
      libState.importing = '';
      progress.hidden = true;
      if (res.added.length && !(await storageInfo()).persisted) requestPersistence();
      const why = res.skipped.length ? ` Skipped ${res.skipped.length}: ${[...new Set(res.skipped.map((s) => s.reason))].join(', ')}.` : '';
      toast(`Added ${res.added.length} sound${res.added.length === 1 ? '' : 's'} to your library.${why}`, res.added.length ? 'info' : 'error', 6000);
      renderLib();
    };

    const drop = h(
      'div',
      { class: 'dropzone small-drop', tabindex: '0', role: 'button', 'aria-label': 'Add sound files to your library' },
      icon('upload', 22),
      h('strong', {}, 'Drop sound files or folders here'),
      h('span', { class: 'muted tiny' }, 'MP3, WAV, OGG, M4A, FLAC… Saved in this browser for all your projects.'),
    );
    drop.addEventListener('click', async () => doImport(await pickFiles('audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus', true)));
    drop.addEventListener('keydown', async (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), doImport(await pickFiles('audio/*', true))));
    drop.addEventListener('dragover', (e) => (e.preventDefault(), e.stopPropagation(), drop.classList.add('over')));
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.body.classList.remove('dropping');
      drop.classList.remove('over');
      doImport(await filesFromDrop(e.dataTransfer));
    });
    const folderBtn = button('Add a whole folder', async () => {
      const input = h('input', { type: 'file', multiple: true });
      input.webkitdirectory = true;
      input.addEventListener('change', () => doImport([...input.files]));
      input.click();
    }, { iconName: 'file', variant: 'sm' });

    libSearch.addEventListener('input', () => {
      libState.query = libSearch.value;
      libState.limit = 60;
      renderLib();
    });
    favBtn.addEventListener('click', () => {
      libState.favoritesOnly = !libState.favoritesOnly;
      favBtn.classList.toggle('on', libState.favoritesOnly);
      favBtn.setAttribute('aria-pressed', libState.favoritesOnly ? 'true' : 'false');
      renderLib();
    });
    renderLib();

    // Save a downloaded result into the library
    const saveToLib = async (blob, name, meta, btn) => {
      btn.disabled = true;
      const ext = (blob.type.split('/')[1] || 'mp3').replace('mpeg', 'mp3').replace(/;.*/, '');
      const file = new File([blob], `${name.slice(0, 60)}.${ext}`, { type: blob.type || 'audio/mpeg' });
      const res = await importSounds([file], { source: meta.source, attribution: meta.attribution || null });
      toast(res.added.length ? `Saved “${name}” to your library` : `Not saved: ${res.skipped[0]?.reason || 'unknown error'}`, res.added.length ? 'info' : 'error');
      btn.disabled = false;
    };
    const fetchBlob = async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      return res.blob();
    };

    // ---- Freesound
    const fsKeyIn = h('input', { type: 'password', placeholder: 'Paste your free Freesound API key', value: settings.freesoundKey || '', autocomplete: 'off' });
    fsKeyIn.addEventListener('change', () => {
      settings.freesoundKey = fsKeyIn.value.trim();
      saveSettings(settings);
      toast(settings.freesoundKey ? 'Freesound key saved in this browser only' : 'Freesound key removed');
      ui.refreshPanels(true);
    });
    const sel = (opts, key, def) => {
      const s = h('select', {}, opts.map(([v, l]) => h('option', { value: v, selected: v === (settings[key] || def) }, l)));
      s.addEventListener('change', () => ((settings[key] = s.value), saveSettings(settings)));
      return s;
    };
    const fsLic = sel(FS_LICENSES, 'fsLicense', 'cc0');
    const fsDur = sel(FS_DURATIONS, 'fsDuration', '15');
    const fsSort = sel(FS_SORTS, 'fsSort', 'score');
    const fsQ = h('input', { type: 'search', placeholder: 'e.g. riser, impact, crowd scream', value: fsState.query });
    const runFs = async (query, page = 1) => {
      fsState.query = query;
      fsState.page = page;
      fsState.loading = true;
      fsState.error = '';
      ui.refreshPanels(true);
      try {
        const r = await searchFreesound(query, { key: settings.freesoundKey, license: fsLic.value, maxDuration: fsDur.value, sort: fsSort.value, page });
        fsState.results = page === 1 ? r.results : [...fsState.results, ...r.results];
        fsState.hasMore = r.hasMore;
        fsState.count = r.count;
        if (!r.results.length && page === 1) fsState.error = 'No sounds found. Try another word or a longer length.';
      } catch (e) {
        fsState.error = e.message;
      }
      fsState.loading = false;
      ui.refreshPanels(true);
    };
    const fsForm = h('form', { class: 'search-row', onsubmit: (e) => (e.preventDefault(), fsQ.value.trim() && runFs(fsQ.value.trim())) }, fsQ, button('Search', null, { iconName: 'search', variant: 'primary' }));
    fsForm.querySelector('button').type = 'submit';
    const resultRows = (results, prefix) =>
      results.map((r) => {
        const play = h('button', { type: 'button', class: 'icon-btn sfx-play', 'aria-label': `Preview ${r.title}` }, icon('play', 16));
        play.addEventListener('click', () => playPreview(r.id, r.url, play));
        const meta = { source: prefix, attribution: { provider: prefix, providerLabel: prefix === 'freesound' ? 'Freesound' : `${r.provider || 'Openverse'} via Openverse`, source: r.provider, author: r.author, pageUrl: r.pageUrl, license: r.license, needsCredit: r.needsCredit } };
        const add = button('Add', async () => {
          add.disabled = true;
          try {
            await addSoundBlob(await fetchBlob(r.url), `${r.title.slice(0, 40)}.mp3`, meta);
          } catch (e) {
            toast(`${e.message}. You can download it from the sound’s page and add it to your library.`, 'error', 6000);
          }
          add.disabled = false;
        }, { iconName: 'plus', variant: 'sm primary', title: 'Add to the timeline at the playhead' });
        const save = button('Save', async () => {
          try {
            await saveToLib(await fetchBlob(r.url), r.title, meta, save);
          } catch (e) {
            toast(e.message, 'error');
            save.disabled = false;
          }
        }, { variant: 'sm', title: 'Save to your sound library' });
        return h(
          'div',
          { class: 'sfx-row' },
          play,
          h(
            'div',
            { class: 'sfx-meta' },
            h('span', { class: 'sfx-name', title: r.title }, r.title),
            h('span', { class: 'muted tiny' }, `${r.duration ? `${r.duration.toFixed(1)}s · ` : ''}`, h('a', { href: r.pageUrl, target: '_blank', rel: 'noopener noreferrer' }, r.author), ` · ${r.license}${r.needsCredit ? ' (credit needed)' : ''}`),
          ),
          h('div', { class: 'lib-acts' }, save, add),
        );
      });

    // ---- built-ins
    const builtins = h(
      'div',
      { class: 'sfx-grid' },
      BUILTIN_SFX.map((s) => {
        let url = null;
        const play = h('button', { type: 'button', class: 'icon-btn sfx-play', 'aria-label': `Preview ${s.label}` }, icon('play', 16));
        play.addEventListener('click', async () => {
          url = url || URL.createObjectURL(await synthSfx(s.id));
          playPreview(`b-${s.id}`, url, play);
        });
        const save = button('Save', async () => saveToLib(await synthSfx(s.id), s.label, { source: 'builtin' }, save), { variant: 'sm', title: 'Save to your sound library' });
        return h(
          'div',
          { class: 'sfx-item' },
          play,
          h('span', { class: 'sfx-name' }, s.label, h('span', { class: 'muted tiny' }, ` ${s.secs}s`)),
          h('div', { class: 'lib-acts' }, save, button('Add', async () => addSoundBlob(await synthSfx(s.id), `${s.label}.wav`, { source: 'builtin' }), { iconName: 'plus', variant: 'sm' })),
        );
      }),
    );

    // ---- Openverse
    const licSel = h('select', {}, SFX_LICENSES.map(([v, l]) => h('option', { value: v, selected: v === soundState.license }, l)));
    licSel.addEventListener('change', () => {
      soundState.license = licSel.value;
      settings.sfxLicense = licSel.value;
      saveSettings(settings);
    });
    const q = h('input', { type: 'search', placeholder: 'e.g. whoosh, crowd cheer, thunder', value: soundState.query });
    const runOv = async (query, page = 1) => {
      soundState.query = query;
      soundState.page = page;
      soundState.loading = true;
      soundState.error = '';
      ui.refreshPanels(true);
      try {
        const res = await searchSfx(query, { license: soundState.license, page });
        soundState.results = page === 1 ? res : [...soundState.results, ...res];
        if (!res.length && page === 1) soundState.error = 'No sounds found. Try another word.';
      } catch (e) {
        soundState.error = e.message || 'Search failed';
      }
      soundState.loading = false;
      ui.refreshPanels(true);
    };
    const ovForm = h('form', { class: 'search-row', onsubmit: (e) => (e.preventDefault(), q.value.trim() && runOv(q.value.trim())) }, q, button('Search', null, { iconName: 'search', variant: 'primary' }));
    ovForm.querySelector('button').type = 'submit';

    return h(
      'div',
      {},
      section(
        'My sound library',
        h('p', { class: 'muted small' }, 'Your own collection of clips, kept in this browser for every project. Add them in bulk, star favorites, and drop them on the timeline.'),
        drop,
        h('div', { class: 'row' }, folderBtn, button('Add files', async () => doImport(await pickFiles('audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus', true)), { iconName: 'upload', variant: 'sm' })),
        progress,
        h('div', { class: 'search-row' }, libSearch, favBtn),
        libInfo,
        libList,
        h('p', { class: 'muted tiny' }, 'Only add sounds you have the rights to use. The library lives in this browser on this device; clearing site data removes it.'),
      ),
      section(
        'Freesound',
        h('p', { class: 'muted small' }, 'Search 600,000+ Creative Commons sounds on ', h('a', { href: 'https://freesound.org', target: '_blank', rel: 'noopener noreferrer' }, 'Freesound'), '. Non-commercial licenses are left out, since a promo is commercial use.'),
        keyBox('Freesound API key', fsKeyIn, { saved: !!settings.freesoundKey, help: h('span', {}, 'Free: sign in, then ', h('a', { href: FREESOUND_KEY_URL, target: '_blank', rel: 'noopener noreferrer' }, 'apply for an API key'), ' and paste the “Client secret/Api key” here. Stored in this browser only.') }),
        h('div', { class: 'grid3' }, field('License', fsLic), field('Length', fsDur), field('Sort', fsSort)),
        fsForm,
        h('div', { class: 'chips' }, SFX_CATEGORIES.slice(0, 10).map((c) => button(c, () => ((fsQ.value = c), runFs(c)), { variant: 'chip' }))),
        fsState.loading ? h('p', { class: 'muted' }, 'Searching…') : null,
        fsState.error ? h('p', { class: 'error-text' }, fsState.error) : null,
        fsState.results.length ? h('p', { class: 'muted tiny' }, `${fsState.count.toLocaleString()} matches`) : null,
        h('div', { class: 'sfx-list' }, resultRows(fsState.results, 'freesound')),
        fsState.hasMore ? button('Load more', () => runFs(fsState.query, fsState.page + 1), { variant: 'ghost wide' }) : null,
      ),
      section(
        'Built-in effects',
        h('p', { class: 'muted small' }, 'Made in your browser, so there is nothing to credit or license.'),
        builtins,
      ),
      section(
        'More free sounds (Openverse)',
        h('p', { class: 'muted small' }, 'Searches Creative Commons sounds from Freesound, Wikimedia and others through ', h('a', { href: 'https://openverse.org', target: '_blank', rel: 'noopener noreferrer' }, 'Openverse'), ', with no key.'),
        field('License', licSel),
        ovForm,
        soundState.loading ? h('p', { class: 'muted' }, 'Searching…') : null,
        soundState.error ? h('p', { class: 'error-text' }, soundState.error) : null,
        h('div', { class: 'sfx-list' }, resultRows(soundState.results, 'openverse')),
        soundState.results.length ? button('Load more', () => runOv(soundState.query, soundState.page + 1), { variant: 'ghost wide' }) : null,
        h('p', { class: 'muted tiny' }, 'Sounds that need credit are added to your post caption in the Export tab automatically.'),
      ),
    );
  }

  // ---------------------------------------------------------------- LAYERS

  // ---------------------------------------------------------------- MEDIA
  function buildMedia(b) {
    const drop = h(
      'div',
      { class: 'dropzone', tabindex: '0', role: 'button', 'aria-label': 'Upload files' },
      icon('upload', 28),
      h('strong', {}, 'Drop files here or click to upload'),
      h('span', { class: 'muted' }, 'Video, images, your song (MP3/WAV), cover art, logo, a font or a Guitar Pro tab. Files stay on your computer.'),
    );
    const open = async () => importFiles(await pickFiles(`video/*,image/*,audio/*,.ttf,.otf,.woff,.woff2,${TAB_ACCEPT}`));
    drop.addEventListener('click', open);
    drop.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open()));

    const items = media.all();
    const grid = h('div', { class: 'media-grid' });
    if (!items.length) grid.append(h('p', { class: 'muted small' }, 'Nothing here yet.'));
    for (const rec of items) {
      const acts = [];
      if (rec.kind === 'video' || rec.kind === 'image') acts.push(button('Add to video', () => actions.addClip(rec), { iconName: 'plus', variant: 'sm' }));
      if (rec.kind === 'audio' || rec.kind === 'video') acts.push(button('Use as song', () => actions.useSong(rec), { iconName: 'music', variant: 'sm' }));
      if (rec.kind === 'audio') acts.push(button('Add audio track', () => actions.addAudioTrack(rec), { iconName: 'plus', variant: 'sm' }));
      if (rec.kind === 'image') {
        acts.push(button('Cover art', () => actions.useCover(rec), { iconName: 'disc', variant: 'sm' }));
        acts.push(button('Watermark', () => actions.useWatermark(rec), { iconName: 'image', variant: 'sm' }));
      }
      if (rec.kind === 'tab') acts.push(button('Show on video', () => actions.useTab(rec), { iconName: 'guitar', variant: 'sm' }));
      grid.append(
        h(
          'div',
          { class: 'media-item' },
          h(
            'div',
            { class: `thumb kind-${rec.kind}` },
            rec.thumb ? h('img', { src: rec.thumb, alt: '' }) : icon(rec.kind === 'audio' ? 'music' : rec.kind === 'font' ? 'type' : rec.kind === 'tab' ? 'guitar' : 'file', 26),
            h('span', { class: 'badge' }, rec.kind === 'font' ? 'font' : isFinite(rec.duration) && rec.duration ? formatTime(rec.duration, false) : rec.kind),
          ),
          h('div', { class: 'media-name', title: rec.name }, rec.name),
          rec.attribution ? h('div', { class: 'muted tiny' }, `${rec.attribution.providerLabel || PROVIDERS[rec.attribution.provider]?.label || 'Openverse'} · ${rec.attribution.author}`) : null,
          h('div', { class: 'media-acts' }, acts, iconButton('trash', `Remove ${rec.name}`, () => confirmRemove(rec), 'ghost danger')),
        ),
      );
    }

    // beat-synced auto edit
    const visual = items.filter((m) => m.kind === 'video' || m.kind === 'image');
    const picks = new Set(visual.map((m) => m.id));
    const beatsBox = h('div', { class: 'checklist' });
    visual.forEach((m) => {
      const cb = h('input', { type: 'checkbox', checked: true });
      cb.addEventListener('change', () => (cb.checked ? picks.add(m.id) : picks.delete(m.id)));
      beatsBox.append(h('label', { class: 'toggle' }, cb, h('span', {}, m.name)));
    });
    const per = h('select', {}, [1, 2, 4, 8].map((n) => h('option', { value: n, selected: n === 4 }, `every ${n} beat${n > 1 ? 's' : ''}`)));
    const autoEdit = () => {
      const p = store.get();
      if (!p.song) return toast('Choose a song first (Audio tab).', 'error');
      if (!p.beats) return toast('Detect the tempo first (Audio tab → Detect BPM).', 'error');
      const ids = visual.filter((m) => picks.has(m.id)).map((m) => m.id);
      if (!ids.length) return toast('Pick at least one clip or image.', 'error');
      const contentEnd = p.duration - (p.endCard.enabled ? p.endCard.duration : 0);
      const beats = p.beats.beats.map((x) => songToTimeline(x, p.song)).filter((x) => x > 0);
      const plan = beatCutPlan(ids, beats, parseInt(per.value, 10), p.duration);
      const offsets = new Map();
      store.update((d) => {
        d.clips = plan.map((step) => {
          const rec = media.get(step.mediaId);
          const used = offsets.get(step.mediaId) || 0;
          const room = rec.kind === 'video' ? rec.duration - step.duration : Infinity;
          const start = rec.kind === 'video' ? (used <= room ? used : 0) : 0;
          offsets.set(step.mediaId, start + step.duration);
          return {
            id: uid('clip'),
            mediaId: rec.id,
            kind: rec.kind,
            in: +Math.max(0, start).toFixed(3),
            duration: rec.kind === 'video' ? Math.min(step.duration, rec.duration) : step.duration,
            speed: 1,
            fit: 'cover',
            zoom: 1,
            panX: 0,
            panY: 0,
            rotate: 0,
            flip: false,
            volume: 0,
            filter: { preset: 'none', adjust: {} },
            transition: { type: 'none', duration: 0.3 },
            kenBurns: rec.kind === 'image' ? { fromZoom: 1.05, toZoom: 1.18, fromX: 0, toX: 0, fromY: 0, toY: 0 } : null,
          };
        });
      });
      toast(`Built ${plan.length} beat-synced cuts at ${p.beats.bpm} BPM${contentEnd < p.duration ? ' (the end card still covers the last seconds)' : ''}`);
    };

    return h(
      'div',
      {},
      section('Upload', drop),
      section('Library', grid),
      visual.length
        ? section(
            'Auto-edit to the beat',
            h('p', { class: 'muted small' }, 'Replaces the video track with cuts that land on the beat of your song, cycling through the media you pick.'),
            beatsBox,
            field('Cut', per),
            button('Build beat-synced edit', autoEdit, { iconName: 'wand', variant: 'primary' }),
          )
        : null,
    );
  }

  function confirmRemove(rec) {
    const p = store.get();
    const used = p.clips.some((c) => c.mediaId === rec.id) || (p.song && p.song.mediaId === rec.id) || p.audioTracks.some((a) => a.mediaId === rec.id) || p.endCard.coverMediaId === rec.id || p.look.watermark.mediaId === rec.id;
    if (used && !confirm(`“${rec.name}” is used in this project. Remove it and everything that uses it?`)) return;
    store.update((d) => {
      d.clips = d.clips.filter((c) => c.mediaId !== rec.id);
      d.audioTracks = d.audioTracks.filter((a) => a.mediaId !== rec.id);
      if (d.song && d.song.mediaId === rec.id) d.song = null;
      if (d.endCard.coverMediaId === rec.id) d.endCard.coverMediaId = null;
      if (d.look.watermark.mediaId === rec.id) d.look.watermark.mediaId = null;
      d.layers = (d.layers || [])
        .map((l) => (l.type === 'video' ? { ...l, clips: l.clips.filter((c) => c.mediaId !== rec.id) } : l))
        .filter((l) => !((l.type === 'tab' || l.type === 'drums') && l.mediaId === rec.id));
      d.layers.forEach((l) => l.type === 'viz' && l.source === rec.id && (l.source = 'song'));
    });
    removeMedia(rec.id);
    ui.refreshPanels(true);
  }

  // ---------------------------------------------------------------- STOCK
  const stockState = { provider: settings.stockProvider || 'pexels', query: '', page: 1, results: [], loading: false, error: '' };
  function buildStock() {
    const prov = PROVIDERS[stockState.provider];
    const keyName = `${stockState.provider}Key`;
    const providerSel = h('select', {}, Object.entries(PROVIDERS).map(([id, p]) => h('option', { value: id, selected: id === stockState.provider }, p.label)));
    providerSel.addEventListener('change', () => {
      stockState.provider = providerSel.value;
      stockState.results = [];
      stockState.error = '';
      settings.stockProvider = providerSel.value;
      saveSettings(settings);
      ui.refreshPanels(true);
    });

    const keyInput = h('input', { type: 'password', placeholder: 'Paste your free API key', value: settings[keyName] || '', autocomplete: 'off' });
    keyInput.addEventListener('change', () => {
      settings[keyName] = keyInput.value.trim();
      saveSettings(settings);
      toast(settings[keyName] ? `${prov.label} key saved in this browser only` : `${prov.label} key removed`);
      ui.refreshPanels(true);
    });

    const q = h('input', { type: 'search', placeholder: 'e.g. city night, crowd, rain, neon', value: stockState.query });
    const run = async (page = 1) => {
      stockState.query = q.value;
      stockState.page = page;
      if (prov.needsKey && !settings[keyName]) {
        stockState.error = `Add your free ${prov.label} API key above first.`;
        return ui.refreshPanels(true);
      }
      stockState.loading = true;
      stockState.error = '';
      ui.refreshPanels(true);
      try {
        const res = await searchStock(stockState.provider, q.value, { key: settings[keyName], aspect: store.get().aspect, page });
        stockState.results = page === 1 ? res : [...stockState.results, ...res];
        if (!res.length && page === 1) stockState.error = 'No results. Try a different search.';
      } catch (e) {
        stockState.error = e.message || 'Search failed';
      }
      stockState.loading = false;
      ui.refreshPanels(true);
    };
    const form = h('form', { class: 'search-row', onsubmit: (e) => (e.preventDefault(), run(1)) }, q, button('Search', null, { iconName: 'search', variant: 'primary' }));
    form.querySelector('button').type = 'submit';
    if (stockState.autorun) {
      stockState.autorun = false;
      queueMicrotask(() => run(1));
    }

    const grid = h('div', { class: 'stock-grid' });
    for (const item of stockState.results) {
      const card = h(
        'div',
        { class: 'stock-item' },
        h('img', { src: item.thumb, alt: item.title || `${prov.label} video by ${item.author}`, loading: 'lazy' }),
        h('span', { class: 'badge' }, item.duration ? `${Math.round(item.duration)}s` : ''),
      );
      if (item.preview) {
        let vid = null;
        card.addEventListener('mouseenter', () => {
          vid = h('video', { src: item.preview, muted: true, autoplay: true, loop: true, playsInline: true, class: 'hover-preview' });
          card.append(vid);
        });
        card.addEventListener('mouseleave', () => vid && (vid.remove(), (vid = null)));
      }
      const addBtn = button('Add', async () => {
        addBtn.disabled = true;
        const label = addBtn.querySelector('span');
        try {
          const blob = await downloadStock(item, (f) => (label.textContent = `${Math.round(f * 100)}%`));
          const name = `${prov.label} ${item.id.split('-')[1]}${blob.type.includes('webm') ? '.webm' : '.mp4'}`;
          const rec = await addMedia(blob, name, { source: item.provider, attribution: { provider: item.provider, author: item.author, pageUrl: item.pageUrl, license: item.license } });
          actions.addClip(rec);
          label.textContent = 'Added';
        } catch (e) {
          toast(`${e.message}. You can download it from the provider page and upload it instead.`, 'error', 6000);
          label.textContent = 'Add';
          addBtn.disabled = false;
        }
      }, { iconName: 'plus', variant: 'sm primary' });
      card.append(
        h(
          'div',
          { class: 'stock-meta' },
          h('a', { href: item.pageUrl, target: '_blank', rel: 'noopener noreferrer', class: 'tiny' }, item.author),
          addBtn,
        ),
      );
      grid.append(card);
    }

    return h(
      'div',
      {},
      section(
        'Free stock video',
        field('Source', providerSel),
        prov.needsKey
          ? keyBox(`${prov.label} API key`, keyInput, {
              saved: !!settings[keyName],
              help: h('span', {}, 'Free. Get one at ', h('a', { href: prov.keyUrl, target: '_blank', rel: 'noopener noreferrer' }, prov.keyUrl.replace('https://', '')), '. Stored only in this browser.'),
            })
          : h('p', { class: 'muted small' }, 'No key needed. Smaller library, and many files require crediting the author.'),
        form,
        h('p', { class: 'muted tiny' }, `Searching for ${ASPECTS[store.get().aspect].label.split(' · ')[0]} footage. Hover a result to preview it.`),
      ),
      stockState.loading ? h('p', { class: 'muted' }, 'Searching…') : null,
      stockState.error ? h('p', { class: 'error-text' }, stockState.error) : null,
      grid,
      stockState.results.length ? button('Load more', () => run(stockState.page + 1), { variant: 'ghost wide' }) : null,
      h(
        'p',
        { class: 'muted tiny' },
        `Videos provided by `,
        h('a', { href: stockState.provider === 'wikimedia' ? 'https://commons.wikimedia.org' : stockState.provider === 'pexels' ? 'https://www.pexels.com' : 'https://pixabay.com', target: '_blank', rel: 'noopener noreferrer' }, prov.label),
        '. ',
        h('a', { href: prov.licenseUrl, target: '_blank', rel: 'noopener noreferrer' }, prov.license),
        '. Credits are collected for you in the Export tab.',
      ),
    );
  }

  // ---------------------------------------------------------------- LYRICS
  function buildLyrics(b) {
    const p = store.get();
    const paste = h('textarea', { rows: 6, placeholder: 'Paste your lyrics here, one line per row…\n\nBlank lines are skipped.' });
    paste.value = p.lyrics.map((l) => l.text).join('\n');
    const applyText = () => {
      const lines = paste.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      store.update((d) => {
        const old = sortLyrics(d.lyrics);
        // keep existing timing for lines that are still at the same position
        const start = timelineToSong(0, d.song) + 0.5;
        const fresh = linesFromText(lines.join('\n'), start, 2.5);
        d.lyrics = fresh.map((l, i) => (old[i] ? { ...old[i], text: l.text } : l));
      });
      sync.cursor = 0;
      toast(`${lines.length} lines ready. Next: tap along to sync them.`);
      ui.refreshPanels(true);
    };

    const syncBox = h('div', { class: `sync-box${sync.active ? ' live' : ''}` });
    const sorted = sortLyrics(p.lyrics);
    if (sync.active) {
      const cur = sorted[sync.cursor - 1];
      const next = sorted[sync.cursor];
      syncBox.append(
        h('div', { class: 'sync-now' }, cur ? cur.text : 'Get ready…'),
        h('div', { class: 'sync-next muted' }, next ? `Next: ${next.text}` : 'That was the last line. Press Stop.'),
        h('div', { class: 'sync-btns' }, button('Tap: next line starts', () => doTap(), { variant: 'primary big', iconName: 'hand' }), button('End line', () => doEnd(), { variant: 'big' })),
        h('p', { class: 'muted tiny' }, 'Keys: Space or Enter = next line starts · ↓ or . = end the current line (for a gap) · Esc = stop'),
        button('Stop syncing', () => stopSync(), { iconName: 'x', variant: 'ghost' }),
      );
    } else {
      syncBox.append(
        h('p', { class: 'small' }, 'Press Start, then tap Space each time a new line begins. The song plays from the playhead, so move it a few seconds before the first line.'),
        h(
          'div',
          { class: 'sync-btns' },
          button('Start tap-sync', () => startSync(0), { iconName: 'hand', variant: 'primary', disabled: !p.lyrics.length }),
          button('Resume from selected line', () => startSync(), { variant: 'ghost', disabled: !(ui.selection && ui.selection.type === 'lyric') }),
        ),
      );
    }

    const list = h('div', { class: 'lyric-list' });
    sorted.forEach((l, i) => {
      const startIn = h('input', { class: 'num time', value: formatTime(l.start), 'aria-label': `Start of line ${i + 1}` });
      const endIn = h('input', { class: 'num time', value: formatTime(l.end), 'aria-label': `End of line ${i + 1}` });
      const textIn = h('input', { class: 'lyric-text', value: l.text, 'aria-label': `Line ${i + 1}` });
      const commit = (field, input) => () => {
        const v = parseTime(input.value);
        if (isNaN(v)) return (input.value = formatTime(l[field]));
        store.update((d) => {
          const x = d.lyrics.find((y) => y.id === l.id);
          x[field] = Math.max(0, v);
          if (x.end <= x.start) x.end = x.start + 0.3;
        });
      };
      startIn.addEventListener('change', commit('start', startIn));
      endIn.addEventListener('change', commit('end', endIn));
      textIn.addEventListener('input', () => store.update((d) => (d.lyrics.find((y) => y.id === l.id).text = textIn.value), `lyrictext:${l.id}`));
      const row = h(
        'div',
        { class: `lyric-row${ui.selection && ui.selection.id === l.id ? ' selected' : ''}`, dataset: { id: l.id } },
        h('button', { class: 'lyric-num', type: 'button', title: 'Jump to this line', onclick: () => (engine.seek(Math.max(0, songToTimeline(l.start, store.get().song))), ui.select({ type: 'lyric', id: l.id })) }, String(i + 1)),
        textIn,
        startIn,
        endIn,
        iconButton('trash', `Delete line ${i + 1}`, () => store.update((d) => (d.lyrics = d.lyrics.filter((y) => y.id !== l.id))), 'ghost'),
      );
      list.append(row);
    });

    const shiftBy = (delta) => store.update((d) => (d.lyrics = shiftLyrics(d.lyrics, delta)), 'shift');

    const s = (fn) => (d, v) => fn(d.lyricStyle, v);
    const presetRow = h(
      'div',
      { class: 'chips' },
      Object.entries(LYRIC_PRESETS).map(([name, preset]) => button(name, () => store.update((d) => (d.lyricStyle = { ...defaultLyricStyle(), y: d.lyricStyle.y, display: d.lyricStyle.display || 'line', ...preset })), { variant: 'chip' })),
    );
    const display = p.lyricStyle.display || 'line';
    const displayGrid = h(
      'div',
      { class: 'style-grid', role: 'radiogroup', 'aria-label': 'How lyrics are shown' },
      LYRIC_DISPLAYS.map(([id, label, hint]) =>
        h('button', {
          type: 'button',
          role: 'radio',
          'aria-checked': display === id ? 'true' : 'false',
          class: `style-opt${display === id ? ' on' : ''}`,
          onclick: () => store.update((d) => {
            d.lyricStyle.display = id;
            Object.assign(d.lyricStyle, DISPLAY_DEFAULTS[id] || {});
            if (id !== 'line' && d.layout && d.layout !== 'full') lyricsIntoLayout(d);
          }),
        }, h('strong', {}, label), h('span', {}, hint)),
      ),
    );

    return h(
      'div',
      {},
      section(
        '1 · Lyrics',
        paste,
        h('div', { class: 'row' }, button('Use these lyrics', applyText, { variant: 'primary', iconName: 'check' }), button('Import .lrc', importLRC, { iconName: 'upload', variant: 'ghost' }), button('Export .lrc', exportLRC, { iconName: 'download', variant: 'ghost', disabled: !p.lyrics.length })),
      ),
      section('2 · Sync to the song', syncBox),
      p.lyrics.length
        ? section(
            '3 · Fine-tune timing',
            h('p', { class: 'muted tiny' }, 'Drag lyric blocks on the timeline, or edit times here (m:ss.cc). Times follow the song, so changing the song section keeps them in sync.'),
            h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Shift all'), button('−0.5s', () => shiftBy(-0.5), { variant: 'sm' }), button('−0.1s', () => shiftBy(-0.1), { variant: 'sm' }), button('+0.1s', () => shiftBy(0.1), { variant: 'sm' }), button('+0.5s', () => shiftBy(0.5), { variant: 'sm' })),
            h('div', { class: 'lyric-head muted tiny' }, h('span', {}, '#'), h('span', {}, 'Line'), h('span', {}, 'Start'), h('span', {}, 'End'), h('span', {})),
            list,
          )
        : null,
      section(
        'Lyric style',
        h('div', { class: 'lbl' }, 'How lyrics are shown'),
        displayGrid,
        presetRow,
        b.select('Font', (p) => p.lyricStyle.font, s((o, v) => (o.font = v)), fontOptions()),
        display === 'line' ? b.select('Animation', (p) => p.lyricStyle.animation, s((o, v) => (o.animation = v)), ANIMATIONS) : null,
        b.range('Size', (p) => p.lyricStyle.size, s((o, v) => (o.size = v)), { min: 2.5, max: 14, step: 0.1, fmt: (v) => v.toFixed(1) }),
        b.range('Vertical position', (p) => p.lyricStyle.y, s((o, v) => (o.y = v)), { min: 5, max: 95, step: 1, fmt: (v) => `${v}%` }),
        b.range('Horizontal position', (p) => p.lyricStyle.x ?? 50, s((o, v) => (o.x = v)), { min: 10, max: 90, step: 0.5, fmt: (v) => `${v}%` }),
        b.range('Max width', (p) => p.lyricStyle.maxWidth, s((o, v) => (o.maxWidth = v)), { min: 40, max: 98, step: 1, fmt: (v) => `${v}%` }),
        b.segmented('Align', (p) => p.lyricStyle.align, s((o, v) => (o.align = v)), [['left', 'Left'], ['center', 'Center'], ['right', 'Right']]),
        h('div', { class: 'grid2' }, b.color('Text', (p) => p.lyricStyle.color, s((o, v) => (o.color = v))), b.color('Highlight', (p) => p.lyricStyle.highlight, s((o, v) => (o.highlight = v)))),
        h('div', { class: 'grid2' }, b.color('Outline', (p) => p.lyricStyle.outline, s((o, v) => (o.outline = v))), b.range('Outline width', (p) => p.lyricStyle.outlineWidth, s((o, v) => (o.outlineWidth = v)), { min: 0, max: 2, step: 0.05, fmt: (v) => v.toFixed(2) })),
        b.toggle('Drop shadow', (p) => p.lyricStyle.shadow, s((o, v) => (o.shadow = v))),
        b.toggle('ALL CAPS', (p) => p.lyricStyle.uppercase, s((o, v) => (o.uppercase = v))),
        display === 'line' ? b.toggle('Background box', (p) => p.lyricStyle.box, s((o, v) => (o.box = v))) : null,
        display === 'line' ? h('div', { class: 'grid2' }, b.color('Box color', (p) => p.lyricStyle.boxColor, s((o, v) => (o.boxColor = v))), b.range('Box opacity', (p) => p.lyricStyle.boxOpacity, s((o, v) => (o.boxOpacity = v)), { min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` })) : null,
      ),
    );
  }

  async function importLRC() {
    const [f] = await pickFiles('.lrc,.txt', false);
    if (!f) return;
    const text = await f.text();
    const parsed = parseLRC(text);
    if (!parsed.length) {
      store.update((d) => (d.lyrics = linesFromText(text, timelineToSong(0, d.song) + 0.5)));
      toast('No timestamps found, so the lines were imported untimed. Tap-sync them next.');
    } else {
      store.update((d) => (d.lyrics = parsed));
      toast(`Imported ${parsed.length} timed lines`);
    }
    ui.refreshPanels(true);
  }
  function exportLRC() {
    const p = store.get();
    download(new Blob([toLRC(p.lyrics, { title: p.endCard.title, artist: p.endCard.artist })], { type: 'text/plain' }), `${slug(p.name)}.lrc`);
  }

  function startSync(fromIndex) {
    const p = store.get();
    const sorted = sortLyrics(p.lyrics);
    let idx = fromIndex;
    if (idx == null) {
      idx = Math.max(0, sorted.findIndex((l) => ui.selection && l.id === ui.selection.id));
      engine.seek(Math.max(0, songToTimeline(sorted[idx].start, p.song) - 2));
    }
    store.update((d) => (d.lyrics = sortLyrics(d.lyrics)));
    sync.active = true;
    sync.cursor = idx;
    ui.syncing = true;
    engine.play();
    ui.refreshPanels(true);
  }
  function stopSync() {
    sync.active = false;
    ui.syncing = false;
    engine.pause();
    store.update((d) => d.lyrics.forEach((l) => delete l.open));
    toast('Synced. Drag blocks on the timeline to fine-tune.');
    ui.refreshPanels(true);
  }
  function doTap() {
    if (!sync.active) return;
    const ts = timelineToSong(engine.t, store.get().song);
    store.update((d) => {
      const r = tapStart(sortLyrics(d.lyrics), sync.cursor, +ts.toFixed(3));
      d.lyrics = r.lyrics;
      sync.cursor = r.cursor;
    });
    ui.refreshPanels(true);
  }
  function doEnd() {
    if (!sync.active) return;
    const ts = timelineToSong(engine.t, store.get().song);
    store.update((d) => {
      d.lyrics = tapEnd(sortLyrics(d.lyrics), sync.cursor, +ts.toFixed(3)).lyrics;
    });
  }

  // ---------------------------------------------------------------- AUDIO
  function buildAudio(b) {
    const p = store.get();
    const audioMedia = media.all().filter((m) => m.kind === 'audio' || m.kind === 'video');
    const songSel = h('select', {}, h('option', { value: '' }, '— choose your song —'), audioMedia.map((m) => h('option', { value: m.id, selected: p.song && p.song.mediaId === m.id }, m.name)));
    songSel.addEventListener('change', () => {
      const rec = media.get(songSel.value);
      if (rec) actions.useSong(rec);
      else store.update((d) => (d.song = null));
      ui.refreshPanels(true);
    });
    const rec = p.song && media.get(p.song.mediaId);

    let songBlock = null;
    if (rec) {
      // full-song overview with the selected window
      const ov = h('canvas', { class: 'overview', width: 600, height: 70, 'aria-label': 'Whole song waveform. Click or drag to choose the section used in the video.' });
      const drawOv = () => {
        const g = ov.getContext('2d');
        const pr = store.get();
        const W = ov.width;
        const H = ov.height;
        g.clearRect(0, 0, W, H);
        const dur = rec.duration || 1;
        if (rec.peaks) {
          const bins = rec.peaks.length / 2;
          g.fillStyle = 'rgba(160,170,190,.55)';
          for (let x = 0; x < W; x++) {
            const b0 = Math.floor((x / W) * bins);
            const b1 = Math.max(b0 + 1, Math.floor(((x + 1) / W) * bins));
            let lo = 0;
            let hi = 0;
            for (let i = b0; i < b1; i++) {
              lo = Math.min(lo, rec.peaks[i * 2]);
              hi = Math.max(hi, rec.peaks[i * 2 + 1]);
            }
            g.fillRect(x, H / 2 - hi * H * 0.48, 1, Math.max(1, (hi - lo) * H * 0.48));
          }
        }
        const x0 = (pr.song.offset / dur) * W;
        const x1 = (Math.min(dur, pr.song.offset + pr.duration) / dur) * W;
        g.fillStyle = 'rgba(110,231,160,.22)';
        g.fillRect(x0, 0, x1 - x0, H);
        g.strokeStyle = 'rgba(110,231,160,.95)';
        g.lineWidth = 2;
        g.strokeRect(x0 + 1, 1, x1 - x0 - 2, H - 2);
      };
      ov._draw = drawOv;
      let dragging = false;
      const setFrom = (e) => {
        const r = ov.getBoundingClientRect();
        const dur = rec.duration || 1;
        const t = ((e.clientX - r.left) / r.width) * dur - store.get().duration / 2;
        store.update((d) => (d.song.offset = +clamp(t, 0, Math.max(0, dur - 1)).toFixed(2)), 'songoffset');
      };
      ov.addEventListener('pointerdown', (e) => ((dragging = true), ov.setPointerCapture(e.pointerId), setFrom(e)));
      ov.addEventListener('pointermove', (e) => dragging && setFrom(e));
      ov.addEventListener('pointerup', () => (dragging = false));
      b._reg(() => drawOv());

      const hook = (len) => {
        const r2 = media.get(store.get().song.mediaId);
        if (!r2.envelope) return toast('Could not analyse this file.', 'error');
        const ec = store.get().endCard;
        const total = len + (ec.enabled ? ec.duration : 0);
        const start = findHook(r2.envelope, r2.envRate, len, r2.duration);
        store.update((d) => {
          d.song.offset = start;
          d.duration = total;
        });
        engine.seek(0);
        toast(`Picked ${formatTime(start, false)}–${formatTime(start + len, false)}, the loudest ${len}s of the song`);
      };
      const bpm = () => {
        const r2 = media.get(store.get().song.mediaId);
        if (!r2.envelope) return toast('Could not analyse this file.', 'error');
        const res = detectBeats(r2.envelope, r2.envRate);
        if (!res) return toast('Could not find a steady beat.', 'error');
        store.update((d) => (d.beats = res));
        toast(`About ${res.bpm} BPM. Beat markers are on the timeline ruler and items snap to them.`);
        ui.refreshPanels(true);
      };
      const g = (fn) => (d, v) => fn(d.song, v);
      songBlock = h(
        'div',
        {},
        ov,
        h('div', { class: 'muted tiny' }, b._label = h('span', {})),
        h('p', { class: 'small' }, 'Find the hook: picks the loudest section (usually the chorus) and sets the video length.'),
        h('div', { class: 'row' }, [15, 30, 45, 60].map((n) => button(`${n}s`, () => hook(n), { variant: 'chip', iconName: n === 15 ? 'wand' : null }))),
        b.number('Song starts at (s)', (pp) => pp.song && pp.song.offset, g((o, v) => (o.offset = v)), { min: 0, step: 0.1 }),
        b.range('Volume', (pp) => pp.song && pp.song.volume, g((o, v) => (o.volume = v)), { min: 0, max: 1.5, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` }),
        h('div', { class: 'grid2' }, b.number('Fade in (s)', (pp) => pp.song && pp.song.fadeIn, g((o, v) => (o.fadeIn = v)), { min: 0, max: 10, step: 0.1 }), b.number('Fade out (s)', (pp) => pp.song && pp.song.fadeOut, g((o, v) => (o.fadeOut = v)), { min: 0, max: 10, step: 0.1 })),
        h('div', { class: 'row' }, button(p.beats ? `Tempo: ${p.beats.bpm} BPM · redetect` : 'Detect BPM', bpm, { iconName: 'activity', variant: 'ghost' }), p.beats ? button('Clear beats', () => store.update((d) => (d.beats = null)), { variant: 'ghost sm' }) : null),
      );
      b._reg((pp) => {
        if (pp.song) b._label.textContent = `Using ${formatTime(pp.song.offset)} – ${formatTime(Math.min(rec.duration, pp.song.offset + pp.duration))} of ${formatTime(rec.duration)}`;
      });
    }

    const tracks = h('div', { class: 'list' });
    p.audioTracks.forEach((a, i) => {
      const r = media.get(a.mediaId);
      tracks.append(
        h(
          'div',
          { class: 'list-row' },
          h('button', { type: 'button', class: 'link', onclick: () => ui.select({ type: 'audio', id: a.id }) }, `Audio ${i + 1}: ${r ? r.name : 'missing'}`),
          h('span', { class: 'muted tiny' }, `${formatTime(a.start)} · ${a.duration.toFixed(1)}s`),
        ),
      );
    });
    const addAudio = async () => {
      const files = await pickFiles('audio/*', true);
      for (const f of files) {
        try {
          const r = await addMedia(f, f.name);
          actions.addAudioTrack(r);
        } catch (e) {
          toast(e.message, 'error');
        }
      }
      ui.refreshPanels(true);
    };
    return h(
      'div',
      {},
      section('Song', field('Track', songSel), audioMedia.length ? null : h('p', { class: 'muted small' }, 'Upload your song (MP3, WAV, M4A) here or anywhere on the page.'), audioMedia.length ? null : button('Upload song', async () => importFiles(await pickFiles('audio/*', false)), { iconName: 'upload', variant: 'primary' }), songBlock),
      section('Extra audio', h('p', { class: 'muted small' }, 'Voice-over, a riser or sound effects. Each gets its own track; it starts at the playhead.'), tracks, button('Add audio file', addAudio, { iconName: 'plus' })),
      section('Video clip sound', h('p', { class: 'muted small' }, 'Clips are muted by default so your song is clean. Select a clip on the timeline to turn its own sound up.')),
    );
  }

  // ---------------------------------------------------------------- TEXT
  function buildText() {
    const p = store.get();
    const presets = ['NEW SINGLE', 'OUT NOW', 'OUT FRIDAY', 'PRE-SAVE NOW', 'LINK IN BIO', 'TURN THE SOUND ON 🔊'];
    const add = (text) => {
      const tx = { ...newText(+engine.t.toFixed(2)), text };
      store.update((d) => d.texts.push(tx));
      ui.select({ type: 'text', id: tx.id });
    };
    const list = h('div', { class: 'list' });
    for (const tx of p.texts) {
      list.append(
        h(
          'div',
          { class: 'list-row' },
          h('button', { type: 'button', class: 'link', onclick: () => (ui.select({ type: 'text', id: tx.id }), engine.seek(tx.start)) }, tx.text || '(empty)'),
          h('span', { class: 'muted tiny' }, `${formatTime(tx.start)}–${formatTime(tx.end)}`),
        ),
      );
    }
    return h(
      'div',
      {},
      section('Add text', h('p', { class: 'muted small' }, 'Titles and hooks that sit on top of the video. They start at the playhead; drag them on the Text track.'), h('div', { class: 'chips' }, presets.map((t) => button(t, () => add(t), { variant: 'chip' }))), button('Blank text', () => add('Your text'), { iconName: 'plus', variant: 'primary' })),
      p.texts.length ? section('On this video', list) : null,
    );
  }

  // ---------------------------------------------------------------- END CARD
  function buildEndCard(b) {
    const e = (fn) => (d, v) => fn(d.endCard, v);
    const images = media.all().filter((m) => m.kind === 'image');
    const coverSel = h('select', {}, h('option', { value: '' }, '— no cover —'), images.map((m) => h('option', { value: m.id }, m.name)));
    coverSel.addEventListener('change', () => store.update((d) => (d.endCard.coverMediaId = coverSel.value || null)));
    b._reg((p) => (coverSel.value = p.endCard.coverMediaId || ''));
    const plats = h(
      'div',
      { class: 'checklist cols' },
      PLATFORMS.map((pl) => {
        const cb = h('input', { type: 'checkbox' });
        cb.addEventListener('change', () =>
          store.update((d) => {
            const set = new Set(d.endCard.platforms);
            cb.checked ? set.add(pl.id) : set.delete(pl.id);
            d.endCard.platforms = PLATFORMS.map((x) => x.id).filter((id) => set.has(id));
          }),
        );
        b._reg((p) => (cb.checked = p.endCard.platforms.includes(pl.id)));
        return h('label', { class: 'toggle' }, cb, h('span', {}, pl.label));
      }),
    );
    const ctaPresets = ['OUT NOW', 'NEW SINGLE', 'PRE-SAVE NOW', 'OUT {date}', '{countdown}', 'STREAM IT NOW'];
    const spIn = h('input', { type: 'url', placeholder: 'https://open.spotify.com/track/…', value: store.get().endCard.spotifyUrl || '', 'aria-label': 'Spotify link' });
    const spStatus = h('p', { class: 'muted tiny', role: 'status' });
    const spImport = async () => {
      spStatus.textContent = 'Looking it up on Spotify…';
      try {
        const info = await fetchSpotifyInfo(spIn.value);
        let coverRec = null;
        if (info.coverBlob) coverRec = await addMedia(new File([info.coverBlob], `${slug(info.title || 'spotify')}-cover.jpg`, { type: info.coverBlob.type || 'image/jpeg' }), `${info.title || 'Spotify'} cover.jpg`);
        store.update((d) => {
          if (info.title) d.endCard.title = info.title;
          d.endCard.spotifyUrl = info.url;
          if (coverRec) d.endCard.coverMediaId = coverRec.id;
          if (!d.endCard.platforms.includes('spotify')) d.endCard.platforms = ['spotify', ...d.endCard.platforms];
        });
        toast(`Got “${info.title}” from Spotify${coverRec ? ' with its cover art' : ''}. Add the artist name and your song file (Spotify doesn’t share audio).`, 'info', 6000);
        ui.refreshPanels(true);
      } catch (err) {
        spStatus.textContent = err.message;
      }
    };
    const spotify = section(
      'From Spotify',
      h('p', { class: 'muted small' }, 'Paste your track or album link (Share → Copy link) to fill in the title and cover art. The link goes in your Export notes for your bio.'),
      h('form', { class: 'search-row', onsubmit: (ev) => (ev.preventDefault(), spImport()) }, spIn, button('Get info', null, { iconName: 'download', variant: 'primary' })),
      spStatus,
      h('p', { class: 'muted tiny' }, 'Spotify doesn’t allow other apps to download songs, so add the audio from your own file (your master or the WAV you sent your distributor) in the Audio tab.'),
    );
    spotify.querySelector('form button').type = 'submit';
    return h(
      'div',
      {},
      spotify,
      section(
        'Call-to-action end card',
        b.toggle('Show end card', (p) => p.endCard.enabled, e((o, v) => (o.enabled = v))),
        b.range('Length', (p) => p.endCard.duration, e((o, v) => (o.duration = v)), { min: 1, max: 10, step: 0.1, fmt: (v) => `${v.toFixed(1)}s` }),
        field('Cover art', coverSel, images.length ? null : 'Upload your cover image in the Video tab (My clips).'),
        images.length ? null : button('Upload cover art', async () => {
          const [f] = await pickFiles('image/*', false);
          if (!f) return;
          try {
            actions.useCover(await addMedia(f, f.name));
            ui.refreshPanels(true);
          } catch (err) {
            toast(err.message, 'error');
          }
        }, { iconName: 'upload' }),
        b.text('Song title', (p) => p.endCard.title, e((o, v) => (o.title = v))),
        b.text('Artist', (p) => p.endCard.artist, e((o, v) => (o.artist = v))),
        b.text('Call to action', (p) => p.endCard.cta, e((o, v) => (o.cta = v))),
        h('div', { class: 'chips' }, ctaPresets.map((c) => button(c, () => store.update((d) => (d.endCard.cta = c)), { variant: 'chip' }))),
        b.text('Release date', (p) => p.endCard.releaseDate, e((o, v) => (o.releaseDate = v)), { placeholder: 'YYYY-MM-DD' }),
        h('p', { class: 'muted tiny' }, '{date} becomes e.g. “NOV 21”. {countdown} becomes “OUT IN 3 DAYS”, “OUT TOMORROW” or “OUT NOW”, worked out on the day you export.'),
        b.text('Small text', (p) => p.endCard.subtext, e((o, v) => (o.subtext = v)), { placeholder: 'Link in bio · @yourband' }),
        field('Streaming platforms', plats),
      ),
      section(
        'End card look',
        b.segmented('Background', (p) => p.endCard.background, e((o, v) => (o.background = v)), [['blur', 'Blurred cover'], ['color', 'Color'], ['video', 'Dimmed video']]),
        h('div', { class: 'grid3' }, b.color('Background', (p) => p.endCard.bgColor, e((o, v) => (o.bgColor = v))), b.color('Accent', (p) => p.endCard.accent, e((o, v) => (o.accent = v))), b.color('Text', (p) => p.endCard.textColor, e((o, v) => (o.textColor = v)))),
        b.select('Title font', (p) => p.endCard.font, e((o, v) => (o.font = v)), fontOptions()),
        b.select('Entrance', (p) => p.endCard.animation, e((o, v) => (o.animation = v)), END_ANIMATIONS),
        button('Preview end card', () => {
          const p = store.get();
          engine.seek(Math.max(0, p.duration - p.endCard.duration));
          engine.play();
        }, { iconName: 'play', variant: 'ghost' }),
      ),
    );
  }

  // ---------------------------------------------------------------- STYLE
  function buildStyle(b) {
    const l = (fn) => (d, v) => fn(d.look, v);
    const images = media.all().filter((m) => m.kind === 'image');
    const wmSel = h('select', {}, h('option', { value: '' }, '— none —'), images.map((m) => h('option', { value: m.id }, m.name)));
    wmSel.addEventListener('change', () => store.update((d) => (d.look.watermark.mediaId = wmSel.value || null)));
    b._reg((p) => (wmSel.value = p.look.watermark.mediaId || ''));

    return h(
      'div',
      {},
      section(
        'Look',
        b.color('Background (behind letterboxed clips)', (p) => p.background, (d, v) => (d.background = v)),
        b.range('Vignette', (p) => p.look.vignette, l((o, v) => (o.vignette = v)), { min: 0, max: 0.9, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` }),
        b.range('Film grain', (p) => p.look.grain, l((o, v) => (o.grain = v)), { min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` }),
        b.range('Cinema bars', (p) => p.look.letterbox, l((o, v) => (o.letterbox = v)), { min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` }),
        b.range('Light leaks', (p) => p.look.lightLeak || 0, l((o, v) => (o.lightLeak = v)), { min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` }),
        b.range('Scanlines', (p) => p.look.scanlines || 0, l((o, v) => (o.scanlines = v)), { min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` }),
        b.range('Flash on the beat', (p) => p.look.beatFlash || 0, l((o, v) => (o.beatFlash = v)), { min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` }),
        h('p', { class: 'muted tiny' }, 'Color filters, zoom and speed are per clip: select a clip on the timeline.'),
      ),
      section(
        'Logo watermark',
        field('Image', wmSel, images.length ? 'A transparent PNG of your band logo works best.' : 'Upload your logo in the Video tab (My clips).'),
        b.select('Position', (p) => p.look.watermark.position, l((o, v) => (o.watermark.position = v)), [['top-left', 'Top left'], ['top-center', 'Top center'], ['top-right', 'Top right'], ['bottom-left', 'Bottom left'], ['bottom-center', 'Bottom center'], ['bottom-right', 'Bottom right'], ['custom', 'Custom (X / Y below)']]),
        h('div', { class: 'grid2' },
          b.range('Logo X', (p) => p.look.watermark.x ?? 50, l((o, v) => ((o.watermark.x = v), (o.watermark.position = 'custom'))), { min: 0, max: 100, step: 0.5, fmt: (v) => `${v}%` }),
          b.range('Logo Y', (p) => p.look.watermark.y ?? 10, l((o, v) => ((o.watermark.y = v), (o.watermark.position = 'custom'))), { min: 0, max: 100, step: 0.5, fmt: (v) => `${v}%` }),
        ),
        b.range('Size', (p) => p.look.watermark.size, l((o, v) => (o.watermark.size = v)), { min: 5, max: 40, step: 1, fmt: (v) => `${v}%` }),
        b.range('Opacity', (p) => p.look.watermark.opacity, l((o, v) => (o.watermark.opacity = v)), { min: 0.1, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` }),
      ),
      section(
        'Progress bar',
        b.toggle('Show a progress bar', (p) => p.look.progress.enabled, l((o, v) => (o.progress.enabled = v))),
        h('div', { class: 'grid2' }, b.color('Color', (p) => p.look.progress.color, l((o, v) => (o.progress.color = v))), b.segmented('Position', (p) => p.look.progress.position, l((o, v) => (o.progress.position = v)), [['top', 'Top'], ['bottom', 'Bottom']])),
      ),
      section(
        'Phone app preview',
        b.segmented('Show buttons from', (p) => p.look.overlay || 'off', l((o, v) => (o.overlay = v)), PLATFORM_OVERLAYS.map(([k, label]) => [k, label.replace('Instagram ', '').replace('YouTube ', '')])),
        b.range('Ghost opacity', (p) => p.look.overlayOpacity ?? 0.6, l((o, v) => (o.overlayOpacity = v)), { min: 0.15, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` }),
        b.toggle('Show the clear area for text', (p) => p.look.overlayClear !== false, l((o, v) => (o.overlayClear = v))),
        overlaySupported(store.get().aspect)
          ? h('p', { class: 'muted tiny' }, 'Ghost buttons show where each app puts its icons, caption and nav bar, so you can keep lyrics and text clear of them. Preview only, never exported. Shortcut: O cycles the apps.')
          : h('p', { class: 'warn-list' }, 'The phone preview is for 9:16 videos. Switch Format to 9:16 to see it.'),
      ),
      section('Templates', h('p', { class: 'muted small' }, 'To reuse this look on your next release, save it as one of your templates.'), button('Save this edit as a template…', () => (setFold('start-mine', true), ui.openTab('start')), { iconName: 'star', variant: 'sm' })),
    );
  }

  // ---------------------------------------------------------------- EXPORT
  const exportState = { running: false, progress: 0, result: null, error: '' };
  function buildExport(b) {
    const p = store.get();
    const mp4 = pickMimeType('mp4');
    const fmt = h('select', {}, mp4 && mp4.startsWith('video/mp4') ? h('option', { value: 'mp4' }, 'MP4 (best for Instagram & TikTok)') : null, h('option', { value: 'webm' }, 'WebM'));
    const quality = h('select', {}, h('option', { value: 6e6 }, 'Good · 6 Mbps'), h('option', { value: 10e6, selected: true }, 'High · 10 Mbps'), h('option', { value: 16e6 }, 'Max · 16 Mbps'));
    const fps = h('select', {}, h('option', { value: 30, selected: true }, '30 fps'), h('option', { value: 60 }, '60 fps'), h('option', { value: 24 }, '24 fps (film look)'));
    const monitor = h('input', { type: 'checkbox', checked: settings.monitorExport ?? true });
    monitor.addEventListener('change', () => ((settings.monitorExport = monitor.checked), saveSettings(settings)));
    const { w, hgt } = { w: ASPECTS[p.aspect].w, hgt: ASPECTS[p.aspect].h };

    const issues = [];
    if (!p.clips.length) issues.push('No video clips yet. The video will only show text on the background color.');
    if (!p.song) issues.push('No song chosen.');
    if (p.endCard.enabled && !p.endCard.coverMediaId) issues.push('End card has no cover art.');
    const contentLen = layoutClips(p.clips).reduce((m, l) => Math.max(m, l.end), 0);
    if (p.clips.length && contentLen < p.duration - (p.endCard.enabled && p.endCard.background !== 'video' ? p.endCard.duration : 0) - 0.05) issues.push(`Clips end at ${formatTime(contentLen)}; after that the background shows until ${formatTime(p.duration)}.`);

    const start = async () => {
      exportState.running = true;
      exportState.progress = 0;
      exportState.result = null;
      exportState.error = '';
      ui.refreshPanels(true);
      try {
        const cutsReady = await ensureLayerAnalyses(store.get());
        if (cutsReady === false) toast('A background removal could not be prepared, so that clip exports with its original background.', 'error');
        const res = await exportVideo(engine, {
          format: fmt.value,
          bitrate: Number(quality.value),
          fps: Number(fps.value),
          monitor: monitor.checked,
          onProgress: (f) => {
            exportState.progress = f;
            const bar = document.querySelector('.export-progress > div');
            if (bar) bar.style.width = `${Math.round(f * 100)}%`;
            const lbl = document.querySelector('.export-pct');
            if (lbl) lbl.textContent = `${Math.round(f * 100)}%`;
          },
        });
        const ext = res.mime.includes('mp4') ? 'mp4' : 'webm';
        exportState.result = { ...res, name: `${slug(p.name)}-${p.aspect.replace(':', 'x')}.${ext}`, url: URL.createObjectURL(res.blob) };
        toast('Export finished');
      } catch (e) {
        if (e.message !== 'cancelled') exportState.error = e.message || 'Export failed';
      }
      exportState.running = false;
      ui.refreshPanels(true);
    };

    const credits = media
      .all()
      .filter((m) => m.attribution && (p.clips.some((c) => c.mediaId === m.id) || p.audioTracks.some((a) => a.mediaId === m.id)))
      .map((m) => `${m.attribution.providerLabel || PROVIDERS[m.attribution.provider]?.label || `${m.attribution.source || 'Openverse'} via Openverse`}: ${m.attribution.author} (${m.attribution.license}) ${m.attribution.pageUrl}`);
    const capPicker = captionPicker({ project: p, settings, kind: 'video', credits });

    return h(
      'div',
      {},
      section(
        'Export video',
        h('p', { class: 'small' }, `${w}×${hgt} · ${formatTime(p.duration)} long. The video plays through once while it records, so exporting takes about ${Math.ceil(p.duration)} seconds. Keep this tab in front.`),
        issues.length ? h('ul', { class: 'warn-list' }, issues.map((i) => h('li', {}, i))) : null,
        field('Format', fmt),
        h('div', { class: 'grid2' }, field('Quality', quality), field('Frame rate', fps)),
        h('label', { class: 'toggle' }, monitor, h('span', {}, 'Play sound while exporting')),
        exportState.running
          ? h('div', {}, h('div', { class: 'export-progress' }, h('div', { style: { width: `${Math.round(exportState.progress * 100)}%` } })), h('div', { class: 'row' }, h('span', { class: 'export-pct' }, `${Math.round(exportState.progress * 100)}%`), button('Cancel', () => exportVideo.cancel && exportVideo.cancel(), { variant: 'ghost sm' })))
          : button('Export video', start, { iconName: 'download', variant: 'primary big wide' }),
        exportState.error ? h('p', { class: 'error-text' }, exportState.error) : null,
        exportState.result
          ? h(
              'div',
              { class: 'result' },
              h('video', { src: exportState.result.url, controls: true, playsInline: true }),
              h('a', { class: 'btn primary wide', href: exportState.result.url, download: exportState.result.name }, icon('download', 16), h('span', {}, `Download ${exportState.result.name} (${(exportState.result.blob.size / 1e6).toFixed(1)} MB)`)),
              exportState.result.mime.includes('webm') ? h('p', { class: 'muted tiny' }, 'WebM uploads fine to YouTube. Instagram prefers MP4, which Chrome and Edge can export.') : null,
            )
          : null,
      ),
      buildShare(p, () => capPicker.currentText()),
      section(
        'Stills',
        h('p', { class: 'muted small' }, 'Save the current frame at full resolution, e.g. for a thumbnail or story teaser.'),
        button('Save frame as PNG', async () => download(await engine.snapshot(), `${slug(p.name)}-frame-${engine.t.toFixed(1)}s.png`), { iconName: 'image' }),
      ),
      section(
        'Suggested captions',
        h('p', { class: 'muted small' }, 'Written from this edit: song, look, hook lyric and release date. Pick one, tweak it, copy it.'),
        capPicker,
        p.endCard.spotifyUrl ? h('div', { class: 'list-row' }, h('span', { class: 'small' }, 'Link for your bio: ', h('a', { href: p.endCard.spotifyUrl, target: '_blank', rel: 'noopener noreferrer' }, p.endCard.spotifyUrl)), button('Copy', () => navigator.clipboard.writeText(p.endCard.spotifyUrl).then(() => toast('Link copied')), { iconName: 'copy', variant: 'sm' })) : null,
        credits.length ? h('p', { class: 'muted tiny' }, 'Stock footage credits are included. CC BY / BY-SA files from Wikimedia must keep them.') : null,
      ),
    );
  }

  // ---------------------------------------------------------------- SHARE
  const ytState = { uploading: false, progress: 0, videoId: null, error: '' };
  function buildShare(p, getCaption) {
    const caption = getCaption();
    const res = exportState.result;
    const file = res ? new File([res.blob], res.name, { type: res.blob.type }) : null;
    const shareOk = file && canShareFiles(file);

    // --- system share sheet
    const sheet = h(
      'div',
      {},
      h('p', { class: 'muted small' }, 'On a phone this opens the share sheet, so you can pick Instagram, TikTok or YouTube and post from the app. The caption is copied too.'),
      button('Share to an app…', async () => {
        try {
          const text = getCaption();
          await navigator.clipboard.writeText(text).catch(() => {});
          await shareFile(file, { title: p.endCard.title, text });
        } catch (e) {
          if (e.name !== 'AbortError') toast(`Sharing failed: ${e.message}`, 'error');
        }
      }, { iconName: 'share', variant: 'primary', disabled: !shareOk }),
      !res ? h('p', { class: 'muted tiny' }, 'Export the video first.') : !shareOk ? h('p', { class: 'muted tiny' }, 'This browser cannot share files. Open the site on your phone (it must be on https, e.g. GitHub Pages), or download and upload in the app.') : null,
    );

    // --- YouTube
    const clientIdIn = h('input', { type: 'text', placeholder: '1234-abc.apps.googleusercontent.com', value: settings.ytClientId || '', autocomplete: 'off', spellcheck: false });
    clientIdIn.addEventListener('change', () => ((settings.ytClientId = clientIdIn.value.trim()), saveSettings(settings)));
    const connected = youtube.isConnected();
    const title = h('input', { type: 'text', value: `${p.endCard.title} - ${p.endCard.artist} #Shorts`.slice(0, 100), maxLength: 100 });
    const desc = h('textarea', { rows: 4 });
    desc.value = caption;
    const privacy = h('select', {}, h('option', { value: 'public' }, 'Public'), h('option', { value: 'unlisted' }, 'Unlisted'), h('option', { value: 'private' }, 'Private'));
    privacy.value = settings.ytPrivacy || 'public';
    privacy.addEventListener('change', () => ((settings.ytPrivacy = privacy.value), saveSettings(settings)));
    const paid = h('input', { type: 'checkbox' });
    const shortsIssues = [];
    if (!['9:16', '1:1'].includes(p.aspect)) shortsIssues.push('Shorts must be vertical or square. Switch Format to 9:16.');
    if (p.duration > 180) shortsIssues.push('Shorts can be up to 3 minutes long.');

    const upload = async () => {
      ytState.uploading = true;
      ytState.progress = 0;
      ytState.error = '';
      ytState.videoId = null;
      ui.refreshPanels(true);
      try {
        const tags = [p.endCard.artist, p.endCard.title, 'new music', 'shorts'].filter(Boolean);
        ytState.videoId = await youtube.upload(res.blob, { title: title.value, description: desc.value, tags, privacy: privacy.value, paidPromotion: paid.checked }, (f) => {
          ytState.progress = f;
          const bar = document.querySelector('.yt-progress > div');
          if (bar) bar.style.width = `${Math.round(f * 100)}%`;
        });
        toast('Uploaded to YouTube');
      } catch (e) {
        ytState.error = e.message;
      }
      ytState.uploading = false;
      ui.refreshPanels(true);
    };

    const yt = h(
      'div',
      { class: 'share-box' },
      h('div', { class: 'share-head' }, icon('youtube', 18), h('strong', {}, 'YouTube Shorts'), h('span', { class: `pill ${connected ? 'ok' : ''}` }, connected ? 'Connected' : 'Not connected')),
      connected
        ? null
        : h(
            'details',
            { open: !settings.ytClientId },
            h('summary', {}, 'One-time setup (about 5 minutes)'),
            h(
              'ol',
              { class: 'steps small' },
              h('li', {}, 'Open the ', h('a', { href: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com', target: '_blank', rel: 'noopener noreferrer' }, 'Google Cloud console'), ', create a project, and enable YouTube Data API v3.'),
              h('li', {}, 'Under Google Auth Platform → Branding, fill in an app name and your email. Under Audience, add your own Google account as a test user.'),
              h('li', {}, 'Under Clients, create an OAuth client of type Web application. Add this site’s address as an Authorized JavaScript origin: ', h('code', {}, location.origin.replace('127.0.0.1', 'localhost')), location.hostname === '127.0.0.1' ? ' (open the site at that localhost address)' : '', '.'),
              h('li', {}, 'Paste the client ID below and press Connect.'),
            ),
          ),
      connected ? null : field('OAuth client ID', clientIdIn, 'Not a secret. Saved in this browser only. Your sign-in token is kept in memory and forgotten when you close the tab.'),
      h(
        'div',
        { class: 'row' },
        connected
          ? button('Disconnect', () => (youtube.disconnect(), ui.refreshPanels(true)), { variant: 'ghost sm' })
          : button('Connect YouTube', async () => {
              try {
                settings.ytClientId = clientIdIn.value.trim();
                saveSettings(settings);
                await youtube.connect(settings.ytClientId);
                toast('YouTube connected');
              } catch (e) {
                toast(e.message, 'error', 6000);
              }
              ui.refreshPanels(true);
            }, { iconName: 'youtube', variant: 'primary' }),
      ),
      connected
        ? h(
            'div',
            {},
            field('Title', title, 'Keep #Shorts in the title or description.'),
            field('Description', desc),
            field('Visibility', privacy),
            h('label', { class: 'toggle' }, paid, h('span', {}, 'Contains paid promotion')),
            shortsIssues.length ? h('ul', { class: 'warn-list' }, shortsIssues.map((i) => h('li', {}, i))) : null,
            ytState.uploading
              ? h('div', { class: 'export-progress yt-progress' }, h('div', { style: { width: `${Math.round(ytState.progress * 100)}%` } }))
              : button(res ? `Upload ${res.name} to YouTube` : 'Export the video first', upload, { iconName: 'upload', variant: 'primary wide', disabled: !res }),
          )
        : null,
      ytState.error ? h('p', { class: 'error-text' }, ytState.error) : null,
      ytState.videoId
        ? h('p', { class: 'small' }, 'Posted: ', h('a', { href: `https://youtube.com/shorts/${encodeURIComponent(ytState.videoId)}`, target: '_blank', rel: 'noopener noreferrer' }, `youtube.com/shorts/${ytState.videoId}`), '. YouTube may take a few minutes to process it.')
        : null,
    );

    const others = h(
      'div',
      { class: 'share-box' },
      h('div', { class: 'share-head' }, h('strong', {}, 'Instagram & TikTok')),
      h('p', { class: 'muted small' }, 'Posting straight to Instagram or TikTok needs a server and an app approved by Meta or TikTok, so it is not built in yet. For now, use Share to an app on your phone, or download and upload in the app.'),
    );

    return section('Share', sheet, yt, others);
  }

  // ---------------------------------------------------------------- INSPECTOR
  // ---------------------------------------------------------------- per-line lyric look
  function lineLookSection(b, L, get, line) {
    const shared = () => store.get().lyricStyle;
    const cur = () => lineStyle(shared(), get() || line, store.get().theme);
    const st = line.style || {};
    const edit = (key) => L((x, v) => {
      x.style = { ...(x.style || {}), [key]: v };
    });
    const chips = h(
      'div',
      { class: 'chips', role: 'radiogroup', 'aria-label': 'Look for this line' },
      h('button', { type: 'button', role: 'radio', 'aria-checked': hasLineStyle(line) ? 'false' : 'true', class: `btn chip${hasLineStyle(line) ? '' : ' on'}`, onclick: () => store.update(L((x) => delete x.style)) }, 'Same as the others'),
      LINE_PRESETS.map(([id, label, hint]) =>
        h('button', { type: 'button', role: 'radio', title: hint, 'aria-checked': st.preset === id ? 'true' : 'false', class: `btn chip${st.preset === id ? ' on' : ''}`, onclick: () => store.update(L((x) => (x.style = { preset: id }))) }, label)),
    );
    const sameText = () => {
      const t = (get() || line).text.trim().toLowerCase();
      return store.get().lyrics.filter((x) => x.id !== line.id && x.text.trim().toLowerCase() === t);
    };
    const twins = sameText().length;
    return section(
      'This line’s look',
      h('p', { class: 'muted tiny' }, 'Make one line stand out: a screamed line, a whisper, a gang-vocal shout. The other lines keep the style from the Lyrics tab.'),
      chips,
      hasLineStyle(line)
        ? h('div', {},
            b.select('Font', () => cur().font, edit('font'), fontOptions()),
            b.range('Size', () => cur().size, edit('size'), { min: 2.5, max: 18, step: 0.1, fmt: (v) => Number(v).toFixed(1) }),
            h('div', { class: 'grid2' }, b.color('Text', () => cur().color, edit('color')), b.color('Highlight', () => cur().highlight, edit('highlight'))),
            h('div', { class: 'grid2' }, b.color('Outline', () => cur().outline, edit('outline')), b.range('Outline width', () => cur().outlineWidth || 0, edit('outlineWidth'), { min: 0, max: 2, step: 0.05, fmt: (v) => Number(v).toFixed(2) })),
            b.select('Animation', () => cur().animation, edit('animation'), ANIMATIONS),
            h('div', { class: 'grid2' }, b.toggle('ALL CAPS', () => !!cur().uppercase, edit('uppercase')), b.toggle('Background box', () => !!cur().box, edit('box'))),
            cur().box ? b.color('Box color', () => cur().boxColor, edit('boxColor')) : null,
            h('p', { class: 'muted tiny' }, store.get().lyricStyle.display && store.get().lyricStyle.display !== 'line' ? 'In the lyric sheet, poster and tunnel displays this line keeps its font, colours and case; size and animation follow the display.' : 'Changes here only affect this line.'),
          )
        : null,
      h('div', { class: 'row' },
        hasLineStyle(line) && twins
          ? button(`Use on the ${twins} other line${twins === 1 ? '' : 's'} with these words`, () => {
              const ids = new Set(sameText().map((x) => x.id));
              const s2 = structuredClone((get() || line).style);
              store.update((d) => d.lyrics.forEach((x) => ids.has(x.id) && (x.style = structuredClone(s2))));
              toast(`Applied to ${ids.size} more line${ids.size === 1 ? '' : 's'} (the repeats of this line)`);
            }, { variant: 'ghost sm', iconName: 'copy' })
          : null,
        hasLineStyle(line)
          ? button('Copy look to the next line', () => {
              const sorted = sortLyrics(store.get().lyrics);
              const i = sorted.findIndex((x) => x.id === line.id);
              const next = sorted[i + 1];
              if (!next) return toast('This is the last line.', 'error');
              const s2 = structuredClone((get() || line).style);
              store.update((d) => {
                const x = d.lyrics.find((y) => y.id === next.id);
                if (x) x.style = s2;
              });
              selectLyric(next);
            }, { variant: 'ghost sm' })
          : null,
      ),
      h('p', { class: 'muted tiny' }, 'The shared font, colours and animation are in the Lyrics tab.'),
    );
  }

  function buildInspector(b) {
    const sel = ui.selection;
    const p = store.get();
    if (!sel) return buildProjectInspector(b);
    if (sel.type === 'clip') {
      const { clip, layer: ovl } = findClip(p, sel.id);
      if (!clip) return buildProjectInspector(b);
      const rec = media.get(clip.mediaId);
      const c = (fn) => (d, v) => {
        const x = findClip(d, sel.id).clip;
        if (x) fn(x, v, d);
      };
      const isVideo = clip.kind === 'video';
      const G = () => findClip(store.get(), sel.id).clip || {};
      const maxDur = maxClipDuration(clip, rec ? rec.duration : Infinity);
      return h(
        'div',
        {},
        h('div', { class: 'insp-title' }, icon('film', 16), h('span', {}, `${rec ? rec.name : 'Clip'}${ovl ? ` · ${ovl.name}` : ''}`)),
        h(
          'div',
          { class: 'row' },
          button('Split at playhead', () => ui.split(), { iconName: 'scissors', variant: 'sm' }),
          button('Duplicate', () => store.update((d) => {
            const f = findClip(d, sel.id);
            if (f.layer) {
              const L = d.layers.find((x) => x.id === f.layer.id);
              L.clips.push({ ...structuredClone(f.clip), id: uid('clip'), start: +(f.clip.start + f.clip.duration).toFixed(3) });
            } else {
              const i = d.clips.findIndex((x) => x.id === sel.id);
              d.clips.splice(i + 1, 0, { ...structuredClone(d.clips[i]), id: uid('clip') });
            }
          }), { iconName: 'copy', variant: 'sm' }),
          ovl ? null : iconButton('arrowLeft', 'Move earlier', () => moveClip(-1), 'ghost'),
          ovl ? null : iconButton('arrowRight', 'Move later', () => moveClip(1), 'ghost'),
          iconButton('trash', 'Delete clip', () => ui.deleteSelection(), 'ghost danger'),
        ),
        section(
          'Timing',
          ovl ? b.number('Starts at (s on the timeline)', () => G().start, c((x, v) => (x.start = Math.max(0, v))), { min: 0, step: 0.05 }) : null,
          b.number('Length (s)', () => findClip(store.get(), sel.id).clip?.duration, c((x, v) => (x.duration = Math.min(v, maxClipDuration(x, rec ? rec.duration : Infinity)))), { min: 0.2, step: 0.1 }),
          isVideo ? b.number('Starts from (s into the file)', () => findClip(store.get(), sel.id).clip?.in, c((x, v) => (x.in = Math.min(v, Math.max(0, (rec?.duration || 0) - 0.2)))), { min: 0, step: 0.1 }) : null,
          isVideo ? b.select('Speed', () => String(findClip(store.get(), sel.id).clip?.speed || 1), c((x, v) => {
            const sp = parseFloat(v);
            x.duration = +(x.duration * (x.speed || 1) / sp).toFixed(3);
            x.speed = sp;
            x.duration = Math.min(x.duration, maxClipDuration(x, rec ? rec.duration : Infinity));
          }), [['0.25', '0.25× (very slow)'], ['0.5', '0.5× (slow-mo)'], ['0.75', '0.75×'], ['1', '1× normal'], ['1.5', '1.5×'], ['2', '2× (fast)'], ['4', '4×']]) : null,
          h('p', { class: 'muted tiny' }, isVideo ? `Up to ${maxDur.toFixed(1)}s available at this speed. Drag clip edges on the timeline to trim.` : 'Images can be any length.'),
        ),
        section(
          'Frame',
          b.segmented('Fit', () => G().fit, c((x, v) => (x.fit = v)), [['cover', 'Fill'], ['contain', 'Fit'], ['blurfill', 'Fit + blur']]),
          b.range('Zoom', () => G().zoom, c((x, v) => (x.zoom = v)), { min: 0.2, max: 4, step: 0.01, fmt: (v) => `${v.toFixed(2)}×` }),
          h('div', { class: 'grid2' },
            b.range('Position X', () => G().posX || 0, c((x, v) => (x.posX = v)), { min: -1, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 50)}%` }),
            b.range('Position Y', () => G().posY || 0, c((x, v) => (x.posY = v)), { min: -1, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 50)}%` }),
          ),
          h('div', { class: 'grid2' },
            b.range('Pan inside X', () => G().panX, c((x, v) => (x.panX = v)), { min: -1, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) }),
            b.range('Pan inside Y', () => G().panY, c((x, v) => (x.panY = v)), { min: -1, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) }),
          ),
          b.range('Rotate', () => G().rotate, c((x, v) => (x.rotate = v)), { min: -180, max: 180, step: 1, fmt: (v) => `${v}°` }),
          b.toggle('Mirror', () => G().flip, c((x, v) => (x.flip = v))),
          h('p', { class: 'muted tiny' }, 'Zoom below 1× or move the picture to show a blurred copy behind it (picture-in-picture look). “Pan inside” moves the image within the frame when it is zoomed in.'),
          button('Reset framing', () => store.update(c((x) => Object.assign(x, { zoom: 1, posX: 0, posY: 0, panX: 0, panY: 0, rotate: 0, flip: false }))), { variant: 'ghost sm' }),
        ),
        rec ? bgRemoveSection({ store, media, actions, b, c, G, rec }) : null,
        section(
          'Motion (keyframes)',
          b.select('Motion', () => motionName(G().kenBurns), c((x, v) => (x.kenBurns = v === 'custom' ? { ...(x.kenBurns || MOTIONS.in) } : MOTIONS[v] ? { ...MOTIONS[v] } : null)), [['none', 'Still'], ['in', 'Slow zoom in'], ['out', 'Slow zoom out'], ['left', 'Drift left'], ['right', 'Drift right'], ['up', 'Drift up'], ['custom', 'Custom start → end']]),
          clip.kenBurns
            ? h(
                'div',
                { class: 'keyframes' },
                h('div', { class: 'kf-head muted tiny' }, h('span', {}, ''), h('span', {}, 'Start'), h('span', {}, 'End')),
                ...[['Zoom', 'Zoom', 0.5, 3], ['X', 'X', -1, 1], ['Y', 'Y', -1, 1]].map(([label, key, min, max]) =>
                  h(
                    'div',
                    { class: 'kf-row' },
                    h('span', { class: 'lbl' }, label),
                    b.range('', () => G().kenBurns?.[`from${key}`], c((x, v) => (x.kenBurns = { ...(x.kenBurns || MOTIONS.in), [`from${key}`]: v })), { min, max, step: 0.01, fmt: (v) => v.toFixed(2) }),
                    b.range('', () => G().kenBurns?.[`to${key}`], c((x, v) => (x.kenBurns = { ...(x.kenBurns || MOTIONS.in), [`to${key}`]: v })), { min, max, step: 0.01, fmt: (v) => v.toFixed(2) }),
                  ),
                ),
                h('p', { class: 'muted tiny' }, 'The clip moves smoothly from Start to End over its length. Any change here switches Motion to Custom.'),
              )
            : null,
        ),
        section(
          'Mask',
          b.select('Shape', () => G().mask?.shape || 'none', c((x, v) => (x.mask = { size: 0.8, x: 0, y: 0, rotate: 0, feather: 0, border: 0, borderColor: '#ffffff', background: 'blur', color: '#000000', ...(x.mask || {}), shape: v })), MASK_SHAPES),
          clip.mask && clip.mask.shape && clip.mask.shape !== 'none'
            ? h(
                'div',
                {},
                /Half$/.test(clip.mask.shape) ? null : b.range('Size', () => G().mask?.size ?? 0.8, c((x, v) => (x.mask = { ...x.mask, size: v })), { min: 0.1, max: 1.6, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` }),
                h('div', { class: 'grid2' },
                  b.range(/Half$/.test(clip.mask.shape) ? 'Split X' : 'Mask X', () => G().mask?.x || 0, c((x, v) => (x.mask = { ...x.mask, x: v })), { min: -1, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 50)}%` }),
                  b.range(/Half$/.test(clip.mask.shape) ? 'Split Y' : 'Mask Y', () => G().mask?.y || 0, c((x, v) => (x.mask = { ...x.mask, y: v })), { min: -1, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 50)}%` }),
                ),
                /Half$/.test(clip.mask.shape) ? null : b.range('Mask rotation', () => G().mask?.rotate || 0, c((x, v) => (x.mask = { ...x.mask, rotate: v })), { min: -180, max: 180, step: 1, fmt: (v) => `${v}°` }),
                b.range('Soft edge', () => G().mask?.feather || 0, c((x, v) => (x.mask = { ...x.mask, feather: v })), { min: 0, max: 1, step: 0.01, fmt: (v) => (v ? `${Math.round(v * 100)}%` : 'Sharp') }),
                h('div', { class: 'grid2' },
                  b.range('Border', () => G().mask?.border || 0, c((x, v) => (x.mask = { ...x.mask, border: v })), { min: 0, max: 2, step: 0.05, fmt: (v) => (v ? v.toFixed(2) : 'None') }),
                  b.color('Border color', () => G().mask?.borderColor, c((x, v) => (x.mask = { ...x.mask, borderColor: v }))),
                ),
                b.segmented('Outside the mask', () => G().mask?.background || 'blur', c((x, v) => (x.mask = { ...x.mask, background: v })), [['blur', 'Blurred clip'], ['color', 'Color'], ['none', 'Background']]),
                G().mask?.background === 'color' ? b.color('Outside color', () => G().mask?.color, c((x, v) => (x.mask = { ...x.mask, color: v }))) : null,
              )
            : null,
        ),
        section(
          'Color grade',
          h('div', { class: 'chips' }, Object.entries(GRADE_PRESETS).map(([k, g]) => button(g.label, () => store.update(c((x) => {
            const { label, ...vals } = g;
            x.grade = k === 'none' ? null : { preset: k, ...vals };
          })), { variant: `chip${(clip.grade?.preset || 'none') === k ? ' on' : ''}` }))),
          ...[['exposure', 'Exposure', 0.4, 1.6], ['contrast', 'Contrast', 0.5, 1.8], ['saturation', 'Saturation', 0, 2]].map(([k, label, min, max]) =>
            b.range(label, () => G().grade?.[k] ?? 1, c((x, v) => (x.grade = { ...(x.grade || {}), preset: 'custom', [k]: v })), { min, max, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` }),
          ),
          h('div', { class: 'grid2' },
            b.range('Temperature', () => G().grade?.temperature || 0, c((x, v) => (x.grade = { ...(x.grade || {}), preset: 'custom', temperature: v })), { min: -1, max: 1, step: 0.01, fmt: (v) => (v > 0 ? `Warm ${Math.round(v * 100)}` : v < 0 ? `Cool ${Math.round(-v * 100)}` : '0') }),
            b.range('Tint', () => G().grade?.tint || 0, c((x, v) => (x.grade = { ...(x.grade || {}), preset: 'custom', tint: v })), { min: -1, max: 1, step: 0.01, fmt: (v) => (v > 0 ? `Magenta ${Math.round(v * 100)}` : v < 0 ? `Green ${Math.round(-v * 100)}` : '0') }),
          ),
          b.range('Fade (matte blacks)', () => G().grade?.fade || 0, c((x, v) => (x.grade = { ...(x.grade || {}), preset: 'custom', fade: v })), { min: 0, max: 0.6, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` }),
          h('div', { class: 'grid2' },
            b.color('Shadows tint', () => G().grade?.shadows || '#000000', c((x, v) => (x.grade = { ...(x.grade || {}), preset: 'custom', shadows: v, shadowsAmt: x.grade?.shadowsAmt || 0.3 }))),
            b.range('Shadows amount', () => G().grade?.shadowsAmt || 0, c((x, v) => (x.grade = { ...(x.grade || {}), preset: 'custom', shadowsAmt: v, shadows: x.grade?.shadows || '#003c5a' })), { min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` }),
          ),
          h('div', { class: 'grid2' },
            b.color('Highlights tint', () => G().grade?.highlights || '#ffffff', c((x, v) => (x.grade = { ...(x.grade || {}), preset: 'custom', highlights: v, highlightsAmt: x.grade?.highlightsAmt || 0.3 }))),
            b.range('Highlights amount', () => G().grade?.highlightsAmt || 0, c((x, v) => (x.grade = { ...(x.grade || {}), preset: 'custom', highlightsAmt: v, highlights: x.grade?.highlights || '#ffc890' })), { min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` }),
          ),
          button('Apply this grade to all clips', () => {
            const gr = G().grade;
            store.update((d) => d.clips.forEach((x) => (x.grade = gr ? { ...gr } : null)));
            toast('Grade copied to every clip');
          }, { variant: 'sm' }),
        ),
        section(
          'Filter',
          h('div', { class: 'chips' }, Object.entries(FILTER_PRESETS).map(([k, f]) => button(f.label, () => store.update(c((x) => (x.filter = { preset: k, adjust: {} }))), { variant: `chip${clip.filter?.preset === k ? ' on' : ''}` }))),
          ...['brightness', 'contrast', 'saturate'].map((k) =>
            b.range(k === 'saturate' ? 'Saturation' : k[0].toUpperCase() + k.slice(1), () => {
              const f = findClip(store.get(), sel.id).clip?.filter || {};
              return f.adjust?.[k] ?? (FILTER_PRESETS[f.preset] || FILTER_PRESETS.none)[k];
            }, c((x, v) => ((x.filter = x.filter || { preset: 'none', adjust: {} }), (x.filter.adjust = { ...x.filter.adjust, [k]: v }))), { min: 0, max: 2, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` }),
          ),
          b.range('Blur', () => {
            const f = findClip(store.get(), sel.id).clip?.filter || {};
            return f.adjust?.blur ?? (FILTER_PRESETS[f.preset] || FILTER_PRESETS.none).blur;
          }, c((x, v) => ((x.filter = x.filter || { preset: 'none', adjust: {} }), (x.filter.adjust = { ...x.filter.adjust, blur: v }))), { min: 0, max: 10, step: 0.1, fmt: (v) => `${v.toFixed(1)}px` }),
        ),
        section(
          'Transition in',
          b.select('Type', () => findClip(store.get(), sel.id).clip?.transition?.type || 'none', c((x, v) => (x.transition = { ...(x.transition || { duration: 0.4 }), type: v })), TRANSITIONS),
          b.range('Length', () => findClip(store.get(), sel.id).clip?.transition?.duration ?? 0.4, c((x, v) => (x.transition = { ...(x.transition || { type: 'fade' }), duration: v })), { min: 0.1, max: 2, step: 0.05, fmt: (v) => `${v.toFixed(2)}s` }),
          h(
            'div',
            { class: 'row' },
            button('Use on every cut', () => {
              const tr = findClip(store.get(), sel.id).clip?.transition;
              store.update((d) => d.clips.forEach((x, i) => i > 0 && (x.transition = { ...tr })));
              toast('Applied to every cut');
            }, { variant: 'sm' }),
            button('Random on every cut', () => {
              const pool = TRANSITIONS.filter(([k]) => !['none', 'fade', 'dipBlack', 'dipWhite'].includes(k)).map(([k]) => k);
              store.update((d) => d.clips.forEach((x, i) => i > 0 && (x.transition = { type: pool[Math.floor(Math.random() * pool.length)], duration: x.transition?.duration ?? 0.4 })));
              toast('Mixed transitions applied');
            }, { iconName: 'wand', variant: 'sm' }),
          ),
        ),
        section(
          'Effects',
          h('p', { class: 'muted tiny' }, 'Beat effects follow the song’s beat. Run “Detect BPM” in the Audio tab first; otherwise they use 120 BPM.'),
          ...['beatPulse', 'shake', 'rgb', 'flicker'].map((k) =>
            b.range(CLIP_EFFECTS[k], () => findClip(store.get(), sel.id).clip?.effects?.[k] || 0, c((x, v) => (x.effects = { ...(x.effects || {}), [k]: v })), { min: 0, max: 1, step: 0.01, fmt: (v) => (v ? `${Math.round(v * 100)}%` : 'Off') }),
          ),
          ...['vhs', 'strobe', 'invertBeat'].map((k) => b.toggle(CLIP_EFFECTS[k], () => findClip(store.get(), sel.id).clip?.effects?.[k], c((x, v) => (x.effects = { ...(x.effects || {}), [k]: v })))),
          b.select('Mirror', () => findClip(store.get(), sel.id).clip?.effects?.mirror || 'none', c((x, v) => (x.effects = { ...(x.effects || {}), mirror: v })), MIRRORS),
          button('Clear effects', () => store.update(c((x) => (x.effects = {}))), { variant: 'ghost sm' }),
        ),
        isVideo ? section('Clip sound', b.range('Volume', () => findClip(store.get(), sel.id).clip?.volume, c((x, v) => (x.volume = v)), { min: 0, max: 1.5, step: 0.01, fmt: (v) => (v ? `${Math.round(v * 100)}%` : 'Muted') })) : null,
      );
    }
    if (sel.type === 'lyric') {
      const l = p.lyrics.find((x) => x.id === sel.id);
      if (!l) return buildProjectInspector(b);
      const L = (fn) => (d, v) => {
        const x = d.lyrics.find((y) => y.id === sel.id);
        if (x) fn(x, v, d);
      };
      const get = () => store.get().lyrics.find((x) => x.id === sel.id);
      const sorted = sortLyrics(p.lyrics);
      const idx = sorted.findIndex((x) => x.id === sel.id);
      return h(
        'div',
        {},
        h('div', { class: 'insp-title' }, icon('mic', 16), h('span', {}, `Lyric line ${idx + 1} of ${sorted.length}`)),
        b.text('Text', () => get()?.text, L((x, v) => (x.text = v)), { multiline: true, rows: 2 }),
        h('div', { class: 'grid2' }, b.number('Start (song s)', () => get()?.start, L((x, v) => ((x.start = v), x.end <= v && (x.end = v + 0.3))), { min: 0, step: 0.05 }), b.number('End (song s)', () => get()?.end, L((x, v) => (x.end = Math.max(x.start + 0.1, v))), { min: 0, step: 0.05 })),
        h(
          'div',
          { class: 'row' },
          button('Start at playhead', () => store.update(L((x, _v, d) => {
            x.start = +timelineToSong(engine.t, d.song).toFixed(3);
            if (x.end <= x.start) x.end = x.start + 1;
          })), { variant: 'sm' }),
          button('End at playhead', () => store.update(L((x, _v, d) => (x.end = Math.max(x.start + 0.1, +timelineToSong(engine.t, d.song).toFixed(3))))), { variant: 'sm' }),
        ),
        h(
          'div',
          { class: 'row' },
          iconButton('arrowLeft', 'Previous line', () => sorted[idx - 1] && selectLyric(sorted[idx - 1]), 'ghost'),
          iconButton('arrowRight', 'Next line', () => sorted[idx + 1] && selectLyric(sorted[idx + 1]), 'ghost'),
          button('Insert line after', () => {
            const nl = { id: uid('lyr'), text: 'New line', start: l.end + 0.05, end: l.end + 2 };
            store.update((d) => d.lyrics.push(nl));
            ui.select({ type: 'lyric', id: nl.id });
          }, { iconName: 'plus', variant: 'sm' }),
          iconButton('trash', 'Delete line', () => ui.deleteSelection(), 'ghost danger'),
        ),
        b.range('This line’s height', () => get()?.y ?? store.get().lyricStyle.y, L((x, v) => (x.y = v)), { min: 5, max: 95, step: 1, fmt: (v) => `${v}%` }),
        button('Use the shared height', () => store.update(L((x) => delete x.y)), { variant: 'ghost sm' }),
        lineLookSection(b, L, get, l),
      );
    }
    if (sel.type === 'text') {
      const tx = p.texts.find((x) => x.id === sel.id);
      if (!tx) return buildProjectInspector(b);
      const T = (fn) => (d, v) => {
        const x = d.texts.find((y) => y.id === sel.id);
        if (x) fn(x, v);
      };
      const get = () => store.get().texts.find((x) => x.id === sel.id) || {};
      return h(
        'div',
        {},
        h('div', { class: 'insp-title' }, icon('type', 16), h('span', {}, 'Text overlay')),
        b.text('Text', () => get().text, T((x, v) => (x.text = v)), { multiline: true, rows: 2 }),
        h('div', { class: 'grid2' }, b.number('Start (s)', () => get().start, T((x, v) => ((x.start = v), x.end <= v && (x.end = v + 0.5))), { min: 0, step: 0.05 }), b.number('End (s)', () => get().end, T((x, v) => (x.end = Math.max(x.start + 0.1, v))), { min: 0, step: 0.05 })),
        b.select('Font', () => get().font, T((x, v) => (x.font = v)), fontOptions()),
        b.select('Animation', () => get().animation, T((x, v) => (x.animation = v)), ANIMATIONS.filter(([k]) => k !== 'karaoke')),
        b.range('Size', () => get().size, T((x, v) => (x.size = v)), { min: 2, max: 25, step: 0.1, fmt: (v) => v.toFixed(1) }),
        b.range('Left/right', () => get().x, T((x, v) => (x.x = v)), { min: 0, max: 100, step: 1, fmt: (v) => `${v}%` }),
        b.range('Up/down', () => get().y, T((x, v) => (x.y = v)), { min: 0, max: 100, step: 1, fmt: (v) => `${v}%` }),
        h('div', { class: 'grid2' }, b.color('Text', () => get().color, T((x, v) => (x.color = v))), b.color('Outline', () => get().outline, T((x, v) => (x.outline = v)))),
        b.toggle('Background box', () => get().box, T((x, v) => (x.box = v))),
        h('div', { class: 'grid2' }, b.color('Box', () => get().boxColor, T((x, v) => (x.boxColor = v))), b.range('Box opacity', () => get().boxOpacity, T((x, v) => (x.boxOpacity = v)), { min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` })),
        h('div', { class: 'row' }, button('Duplicate', () => store.update((d) => d.texts.push({ ...structuredClone(get()), id: uid('txt'), start: get().end, end: get().end + (get().end - get().start) })), { iconName: 'copy', variant: 'sm' }), iconButton('trash', 'Delete text', () => ui.deleteSelection(), 'ghost danger')),
      );
    }
    if (sel.type === 'audio') {
      const a = p.audioTracks.find((x) => x.id === sel.id);
      if (!a) return buildProjectInspector(b);
      const A = (fn) => (d, v) => {
        const x = d.audioTracks.find((y) => y.id === sel.id);
        if (x) fn(x, v);
      };
      const get = () => store.get().audioTracks.find((x) => x.id === sel.id) || {};
      const rec = media.get(a.mediaId);
      return h(
        'div',
        {},
        h('div', { class: 'insp-title' }, icon('music', 16), h('span', {}, rec ? rec.name : 'Audio')),
        h('div', { class: 'grid2' }, b.number('Starts at (s)', () => get().start, A((x, v) => (x.start = v)), { min: 0, step: 0.05 }), b.number('Length (s)', () => get().duration, A((x, v) => (x.duration = Math.min(v, (rec?.duration || v) - x.in))), { min: 0.2, step: 0.05 })),
        b.number('From (s into the file)', () => get().in, A((x, v) => (x.in = Math.min(v, Math.max(0, (rec?.duration || 0) - 0.2)))), { min: 0, step: 0.05 }),
        b.range('Volume', () => get().volume, A((x, v) => (x.volume = v)), { min: 0, max: 1.5, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` }),
        h('div', { class: 'grid2' }, b.number('Fade in (s)', () => get().fadeIn, A((x, v) => (x.fadeIn = v)), { min: 0, step: 0.1 }), b.number('Fade out (s)', () => get().fadeOut, A((x, v) => (x.fadeOut = v)), { min: 0, step: 0.1 })),
        button('Move to playhead', () => store.update(A((x) => (x.start = +engine.t.toFixed(2)))), { variant: 'sm' }),
        iconButton('trash', 'Delete audio track', () => ui.deleteSelection(), 'ghost danger'),
      );
    }
    if (sel.type === 'song') {
      return h('div', {}, h('div', { class: 'insp-title' }, icon('music', 16), h('span', {}, 'Song')), h('p', { class: 'small' }, 'Drag the song on the timeline to choose which part plays. Volume, fades, tempo and “Find the hook” are in the Audio tab.'));
    }
    if (sel.type === 'layer') {
      const L = findLayer(store.get(), sel.id);
      return h('div', {}, h('div', { class: 'insp-title' }, icon(L ? LAYER_TYPES[L.type].icon : 'layers', 16), h('span', {}, L ? L.name : 'Layer')), h('p', { class: 'small' }, 'This layer’s settings are in the panel on the left. Drag its block on the timeline to line it up with the song, or use the eye to hide it.'));
    }
    if (sel.type === 'endcard') {
      return h('div', {}, h('div', { class: 'insp-title' }, icon('disc', 16), h('span', {}, 'End card')), h('p', { class: 'small' }, 'Drag its left edge on the timeline to change its length. Everything else is in the End card tab.'));
    }
    return buildProjectInspector(b);
  }

  function selectLyric(l) {
    ui.select({ type: 'lyric', id: l.id });
    engine.seek(Math.max(0, songToTimeline(l.start, store.get().song)));
  }

  function moveClip(dir) {
    const id = ui.selection.id;
    store.update((d) => {
      const i = d.clips.findIndex((c) => c.id === id);
      const j = i + dir;
      if (j < 0 || j >= d.clips.length) return;
      [d.clips[i], d.clips[j]] = [d.clips[j], d.clips[i]];
    });
  }

  function buildProjectInspector(b) {
    const p = store.get();
    return h(
      'div',
      {},
      h('div', { class: 'insp-title' }, icon('settings', 16), h('span', {}, 'Project')),
      b.text('Name', (pp) => pp.name, (d, v) => (d.name = v)),
      b.select('Format', (pp) => pp.aspect, (d, v) => (d.aspect = v), Object.entries(ASPECTS).map(([k, a]) => [k, a.label])),
      b.number('Length (s)', (pp) => pp.duration, (d, v) => (d.duration = v), { min: 3, max: 600, step: 0.5 }),
      button('Fit length to clips + end card', () => store.update((d) => {
        const len = d.clips.reduce((s, c) => s + c.duration, 0);
        if (len) d.duration = +(len + (d.endCard.enabled && d.endCard.background !== 'video' ? d.endCard.duration : 0)).toFixed(2);
      }), { variant: 'ghost sm', disabled: !p.clips.length }),
      section(
        'Getting started',
        h(
          'ol',
          { class: 'steps' },
          h('li', { class: p.template || p.theme ? 'done' : '' }, 'Pick a template or theme, or a suggested edit (Start).'),
          h('li', { class: p.clips.length ? 'done' : '' }, 'Add video: upload clips or search free stock footage (Video).'),
          h('li', { class: p.song ? 'done' : '' }, 'Add your song (Audio) and pick the hook.'),
          h('li', { class: p.lyrics.length ? 'done' : '' }, 'Paste lyrics and tap along to sync them (Lyrics).'),
          h('li', { class: p.endCard.coverMediaId ? 'done' : '' }, 'Add cover art and a call to action (End card).'),
          h('li', {}, 'Export and post.'),
        ),
      ),
      section(
        'Shortcuts',
        h(
          'dl',
          { class: 'keys' },
          [['Space', 'Play / pause'], ['← →', 'Step one frame (Shift: 1 s)'], ['S', 'Split clip at playhead'], ['O', 'Cycle phone app buttons'], ['Delete', 'Delete selected'], ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'], ['Ctrl+wheel', 'Zoom timeline'], ['Home / End', 'Jump to start / end']].map(([k, v]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, v)]),
        ),
      ),
    );
  }

  return { tabs, resolveTab, buildInspector, importFiles, sync, doTap, doEnd, stopSync, actions };
}

const MOTIONS = {
  in: { fromZoom: 1, toZoom: 1.18, fromX: 0, toX: 0, fromY: 0, toY: 0 },
  out: { fromZoom: 1.18, toZoom: 1, fromX: 0, toX: 0, fromY: 0, toY: 0 },
  left: { fromZoom: 1.15, toZoom: 1.15, fromX: 0.6, toX: -0.6, fromY: 0, toY: 0 },
  right: { fromZoom: 1.15, toZoom: 1.15, fromX: -0.6, toX: 0.6, fromY: 0, toY: 0 },
  up: { fromZoom: 1.15, toZoom: 1.15, fromX: 0, toX: 0, fromY: 0.6, toY: -0.6 },
};
function motionName(k) {
  if (!k) return 'none';
  for (const [name, m] of Object.entries(MOTIONS)) {
    if (Object.keys(m).every((key) => Math.abs(m[key] - k[key]) < 1e-6)) return name;
  }
  return 'custom';
}

export function slug(s) {
  return String(s || 'promo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'promo';
}

export { clipAt, splitClip };
