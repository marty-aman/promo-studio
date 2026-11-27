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
  NEW_CHART_OFFSET,
  songOffsetAt,
  hasSongParts,
  clipAt,
  splitClip,
  layoutClips,
  maxClipDuration,
  clamp,
} from './core.js';
import { FONTS, PLATFORMS, FILTER_PRESETS, newText, defaultLyricStyle, loadSettings, saveSettings, loadTemplates, saveTemplates, findClip, findLayer, LAYER_TYPES } from './state.js';
import { buildLayersPanel, makeLayer, clipLayer, TAB_ACCEPT, midiDrumDefaults } from './panel-layers.js';
import { MIDI_ACCEPT } from './midi.js';
import { MAX_LENGTH } from './tlzoom.js';
import { drumConvertState } from './page-drumconvert.js';
import { driveButton } from './gdrive.js';
import { isDesktop, desktop, GOOGLE_SIGNIN_NOTE } from './desktop.js';
import { lyricIdeas, applyLyricIdea } from './lyricideas.js';
import { tipSettings, saveTipSettings } from './panel-tips.js';
import { createKeyframeUI } from './panel-kf.js';
import { gridFromBpm, gridLength } from './tempo.js';
import { tempoControl, projectTarget, clipTempoTarget, lookTempoTarget, tempoSummary } from './panel-tempo.js';
import { lyricFxGroup } from './panel-lyricfx.js';
import { EXITS } from './exits.js';
import { templateFromProject, applyMyTemplate, templateFile, parseTemplateFile, describeTemplate } from './mytemplates.js';
import { bgRemoveSection } from './panel-bgremove.js';
import { studioAutoSync } from './ai/panel-lyricsync.js';
import { reframeSection } from './panel-reframe.js';
import { qualityBadges, weakToggle, qualitySection } from './panel-quality.js';
import { findMomentBox } from './ai/panel-search.js';
import { buildSuggestPanel, hasNewSuggestions } from './panel-suggest.js';
import { captionPicker } from './panel-captions.js';
import { lyricIdeasAssistant } from './ai/panel-assistant.js';
import { fetchSpotifyInfo } from './spotify.js';
import { LINE_PRESETS, lineStyle, hasLineStyle } from './linestyle.js';
import { lookMembers, changeLook } from './lookapply.js';
import { lookThemeBlock } from './panel-lookthemes.js';
import { lineAnimBlock } from './panel-lineanim.js';
import { HITS, ECHOES } from './lyricanim.js';
import { THEMES, themeById, applyTheme } from './themes.js';
import { stemRoleLabel } from './manager/files.js';
import { markTimed, timingSummary, SOURCE_LABELS } from './manager/lyrictiming.js';
import { wordTimingEditor, filePlayer } from './panel-wordtiming.js';
import { resolveWave, waveChoices } from './wavesource.js';
import { handTimedCount, wordsStale, clearHandWords } from './wordtiming.js';

const themeState = { motion: false };
import { ensureLayerAnalyses, videoWaveform } from './media.js';
import { syncPoint, autoLineUp, describeSyncPoint, inForSyncPoint } from './clipsync.js';
import { savedOn, sameVideoSync } from './songsync.js';
import { placeIn, placeOnPoint, pointToDirection, directionToPoint } from './clipplace.js';
import { media, addMedia, removeMedia, tabTimeline, ensureLoaded } from './media.js';
import { PROVIDERS, searchStock, downloadStock } from './stock.js';
import { exportVideo, pickMimeType } from './engine.js';
import { fastSupport } from './fastexport.js';
import { speedRatio, codecLabel } from './exportplan.js';
import { exportRangePanel } from './panel-exportrange.js';
import { resolveRange, shiftCues } from './exportrange.js';
import { exportAdvice, exportEnv, keepAwake } from './mobilelogic.js';
import { SAFE_CHOICES, videoLayers, planMoveTo, applyLayerMove } from './studioedit.js';
import { describeProject } from './projectfile.js';
import { TRANSITIONS, TEXT_ANIMATIONS, END_ANIMATIONS, CLIP_EFFECTS, MIRRORS, MASK_SHAPES, GRADE_PRESETS, renderFrame } from './renderer.js';
import { PLATFORM_OVERLAYS, overlaySupported } from './overlays.js';
import { LAYOUTS, TEMPLATES, applyLayout, applyTemplate, tabIntoLayout, lyricsIntoLayout, tabSources, templateNeeds } from './templates.js';
import { SONG_TEMPLATES, songTemplateReady, applySongTemplate } from './songtemplates.js';
import { lyricCardExtras, lyricTplOpts, sectionLooksSwitch } from './panel-lyrictemplates.js';
import { applySongPart, describePart, partSections } from './songpart.js';
import { speechCaptionsFor } from './ai/panel-speechcaptions.js';
import { clipTarget } from './ai/captionsync.js';
import { parseSubtitles, toSRT, toVTT, videoCues, CAPTION_STYLES, setCaptions, styleCaptions, shiftCaptions, captionY } from './subtitles.js';
import { areaOf } from './templates.js';
const AREAS_FOR = (layout) => {
  const a = areaOf(layout);
  return [a.x0, a.y0, a.x1, a.y1];
};
import { GAME_THEME_LIST } from './rhythmgame.js';

/** The rhythm game theme picked on its template card (not saved). */
const songTplUI = { gameTheme: 'classic' };
import { CANVAS_TEMPLATES, CANVAS_MIN, CANVAS_MAX, canvasTemplate, applyCanvas, undoCanvas, canvasIssues, clampCanvasLength, isCanvas } from './canvas.js';

/** The Spotify Canvas loop length picked in the Templates tab (not saved). */
const canvasUI = { length: null };
import { LYRIC_DISPLAYS, DISPLAY_DEFAULTS } from './lyricviz.js';
import { BUILTIN_SFX, synthSfx, searchSfx, SFX_CATEGORIES, SFX_LICENSES } from './sfx.js';
import { shareFile, canShareFiles, youtube } from './share.js';
import { soundLib, importSounds, storageInfo, requestPersistence } from './soundlib.js';
import { loadPack, packResult } from './soundpack.js';
import { SOURCES, SOURCE_LABEL, fromLibrary, fromPack, fromBuiltin, applyMeta, metaFor, filterAll, topTags, parseTags, loadMeta, saveMeta } from './soundindex.js';
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
// '' keeps the original quick fade at the end
const TEXT_EXITS = [['', 'Quick fade (default)'], ...EXITS];

/** Exit for a clip (or anything with .exit = { type, duration }): get() returns the item, M wraps a mutator. */
function exitSection(b, get, M, note) {
  return section(
    'Exit',
    h('p', { class: 'muted tiny' }, note),
    h('div', { class: 'grid2' },
      b.select('Type', () => (get()?.exit && get().exit.type) || '', M((x, v) => (x.exit = v ? { duration: (x.exit && x.exit.duration) || 0.5, type: v } : null)), [['', 'None'], ...EXITS.filter(([k]) => k !== 'cut')]),
      b.range('Length', () => (get()?.exit && get().exit.duration) || 0.5, M((x, v) => (x.exit = { type: (x.exit && x.exit.type) || 'fade', duration: v })), { min: 0.1, max: 2, step: 0.05, fmt: (v) => `${v.toFixed(2)}s` }),
    ),
  );
}

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
  engine.limiterOn = settings.limiter !== false;
  engine.exportMode = settings.exportMode === 'realtime' ? 'realtime' : 'fast';
  const kf = createKeyframeUI({ store, engine });
  const sync = { active: false, cursor: 0 };
  const wordUI = { lineId: '', word: 0, target: 'word' }; // the word timing editor's line and word, kept between rebuilds

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
    /** `from`/`len`: start that many seconds into the video and keep `len` seconds (Find a moment). Without `from`, the song's music video starts on its saved sync. */
    addClip(rec, at = null, { from = null, len = null } = {}) {
      store.update((d) => {
        const clip = {
          id: uid('clip'),
          mediaId: rec.id,
          kind: rec.kind,
          in: rec.kind === 'video' ? from || 0 : 0,
          duration: rec.kind === 'image' ? 3 : len != null ? len : +Math.min(rec.duration || 5, 6).toFixed(2),
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
        const pt = from == null && rec.kind === 'video' && ui.songSync ? ui.songSync.videoPoint(rec) : null;
        if (pt != null) {
          const laid = layoutClips(d.clips).find((l) => l.clip.id === clip.id);
          clip.in = inForSyncPoint(pt, laid ? laid.start : 0, songOffsetAt(laid ? laid.start : 0, d.song), rec.duration, clip.duration);
        }
        const total = d.clips.reduce((s, c) => s + c.duration, 0);
        if (d.clips.length === 1 && !d.song) d.duration = Math.max(d.duration, +(total + (d.endCard.enabled ? d.endCard.duration : 0)).toFixed(2));
      });
      toast(`Added “${rec.name}” to the video track`);
    },
    useSong(rec) {
      store.update((d) => {
        d.song = { mediaId: rec.id, offset: 0, volume: 1, fadeIn: 0.3, fadeOut: 1.2 };
        // a detected tempo belongs to the old song; one you set or took from the song stays, laid out over the new one
        d.beats = d.beats && d.beats.source ? gridFromBpm(d.beats.bpm, d.beats.first, gridLength(d, rec.duration), d.beats.source) : null;
      });
      toast('Song set. Use “Find the hook” in the Audio tab to pick the best section.');
      if (ui.onSongChosen) ui.onSongChosen(rec); // fill the lyrics for it
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
        d.endCard.coverBy = 'manual';
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
        const off = NEW_CHART_OFFSET;
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
    /** A MIDI file: its drums as a drum chart, its other parts as MIDI notes (or into the layer it was uploaded for). */
    useMidi(rec, into = {}) {
      const m = rec.midi;
      if (!m) return;
      const hasDrums = m.tracks.some((t) => t.notes && t.isDrum);
      const hasParts = m.tracks.some((t) => t.notes && !t.isDrum);
      let selectId = null;
      const made = [];
      store.update((d) => {
        const off = NEW_CHART_OFFSET;
        const target = into.drumLayer || into.midiLayer ? d.layers.find((l) => l.id === (into.drumLayer || into.midiLayer)) : null;
        if (target && target.type === 'drums') {
          Object.assign(target, { source: 'midi', mediaId: rec.id, ...midiDrumDefaults(m), offset: target.mediaId ? target.offset : off });
          selectId = target.id;
          return;
        }
        if (target && target.type === 'midi') {
          Object.assign(target, { mediaId: rec.id, tracks: [], offset: target.mediaId ? target.offset : off });
          selectId = target.id;
          return;
        }
        if (hasDrums || !hasParts) {
          const L = { ...makeLayer(d, 'drums'), source: 'midi', mediaId: rec.id, ...midiDrumDefaults(m), offset: off };
          d.layers.push(L);
          selectId = L.id;
          made.push('a drum chart');
        }
        if (hasParts) {
          const L = { ...makeLayer(d, 'midi'), mediaId: rec.id, tracks: [], offset: off };
          d.layers.push(L);
          selectId = selectId || L.id;
          made.push('MIDI notes');
        }
        if (d.layout && d.layout !== 'full') tabIntoLayout(d);
      });
      toast(made.length ? `“${rec.name}” is on the video as ${made.join(' and ')}. Use Auto-sync to line it up with the song.` : `“${rec.name}” is on its layer.`, 'info', 6000);
      ui.select({ type: 'layer', id: selectId });
      ui.openTab(made.includes('a drum chart') || !made.length ? 'guitarpro' : 'visualizer');
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
        else if (rec.kind === 'midi') actions.useMidi(rec, into);
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
  const LAYER_HOME = { video: ['video', 'video-layers'], viz: ['visualizer'], tab: ['guitarpro'], drums: ['guitarpro'], midi: ['visualizer'], game: ['guitarpro'] };
  /** Which tab (and fold) an id opens. `layers` goes to the tab for the selected layer's kind. */
  function resolveTab(id) {
    if (id === 'layers') {
      const L = ui.selection && ui.selection.type === 'layer' ? (store.get().layers || []).find((x) => x.id === ui.selection.id) : null;
      return (L && LAYER_HOME[L.type]) || ['video', 'video-layers'];
    }
    return TAB_ALIASES[id] || [id];
  }
  // ---- your own fonts: upload once, then they're in every font menu (saved with your media)
  const FONT_ACCEPT = '.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2';
  async function addFonts(apply) {
    const files = await pickFiles(FONT_ACCEPT, true);
    if (!files.length) return;
    const fonts = files.filter((f) => /\.(ttf|otf|woff2?)$/i.test(f.name) || (f.type || '').startsWith('font/'));
    const skipped = files.length - fonts.length;
    const before = new Set(media.all().map((m) => m.id));
    await importFiles(fonts);
    const added = media.all().filter((m) => m.kind === 'font' && !before.has(m.id));
    if (skipped) toast(`${added.length ? `Added ${added.map((m) => `“${m.family}”`).join(', ')}. ` : ''}Skipped ${skipped} file${skipped === 1 ? '' : 's'}: not a TTF, OTF, WOFF or WOFF2 font.`, added.length ? 'info' : 'error', 6000);
    if (added.length && apply) apply(added[0].family);
    ui.refreshPanels(true);
  }
  /** A font menu with an "Add a font" button that uploads one and picks it right away. */
  function fontField(b, label, get, set) {
    return h(
      'div',
      { class: 'font-field' },
      b.select(label, get, set, fontOptions()),
      button('Add a font', () => addFonts((family) => store.update((d) => set(d, family))), { iconName: 'plus', variant: 'sm ghost', title: 'Upload a TTF, OTF, WOFF or WOFF2 file. It joins every font menu.' }),
    );
  }
  /** Where a font is used in this video: lyrics, texts, the end card, tab layers. */
  function fontUses(family) {
    const p = store.get();
    let n = 0;
    if (p.lyricStyle.font === family) n++;
    n += p.texts.filter((t) => t.font === family).length;
    n += p.lyrics.filter((l) => l.style && l.style.font === family).length;
    if (p.endCard.font === family) n++;
    n += (p.layers || []).filter((l) => l.font === family).length;
    return n;
  }
  function buildFonts() {
    const fonts = media.all().filter((m) => m.kind === 'font' && m.family);
    const useAll = (family) => {
      store.update((d) => {
        d.lyricStyle.font = family;
        for (const t of d.texts) t.font = family;
        d.endCard.font = family;
      });
      toast(`“${family}” is now on the lyrics, every text and the end card. Undo (Ctrl+Z) to go back.`);
    };
    const remove = (rec) => {
      const n = fontUses(rec.family);
      if (!confirm(`Delete the font “${rec.family}”?${n ? ` ${n} thing${n === 1 ? '' : 's'} in this video use${n === 1 ? 's' : ''} it and will switch to Bebas Neue.` : ''}`)) return;
      store.update((d) => {
        const swap = (o) => o && o.font === rec.family && (o.font = 'Bebas Neue');
        swap(d.lyricStyle);
        d.texts.forEach(swap);
        d.lyrics.forEach((l) => swap(l.style));
        swap(d.endCard);
        (d.layers || []).forEach(swap);
      });
      removeMedia(rec.id);
      ui.refreshPanels(true);
    };
    return h(
      'div',
      {},
      h('p', { class: 'muted small' }, 'Upload TTF, OTF, WOFF or WOFF2 files. They’re saved in this browser and show up in every font menu: text, lyrics, the end card and tab layers.'),
      fonts.length
        ? h(
            'div',
            { class: 'font-list' },
            fonts.map((rec) => {
              const n = fontUses(rec.family);
              return h(
                'div',
                { class: 'font-row' },
                h('div', { class: 'font-sample', style: { fontFamily: `"${rec.family}", sans-serif` } }, store.get().endCard.artist && store.get().endCard.artist !== 'Artist Name' ? store.get().endCard.artist : 'OUT NOW'),
                h('div', { class: 'font-meta' }, h('strong', {}, rec.family), h('span', { class: 'muted tiny' }, `${rec.name}${n ? ` · used ${n}×` : ''}`)),
                h('div', { class: 'row' }, button('Use everywhere', () => useAll(rec.family), { variant: 'sm', title: 'Put it on the lyrics, every text and the end card' }), iconButton('trash', `Delete ${rec.family}`, () => remove(rec), 'ghost danger')),
              );
            }),
          )
        : null,
      button(fonts.length ? 'Add more fonts' : 'Add a font', () => addFonts(), { iconName: 'upload', variant: fonts.length ? 'sm' : 'primary' }),
      h('p', { class: 'muted tiny' }, 'Only use fonts you’re allowed to use in videos. Free ones: Google Fonts, Font Squirrel.'),
    );
  }

  const layerCtx = () => ({ store, engine, ui, importFiles, fontOptions, fontField, kf });

  // ---------------------------------------------------------------- START (stacked ideas)
  function buildStart(b) {
    const p = store.get();
    const page = (id, ic, title, blurb) =>
      h('button', { type: 'button', class: 'page-link', onclick: () => ui.openTab(id) }, icon(ic, 20), h('span', {}, h('strong', {}, title), h('span', { class: 'muted tiny' }, blurb)), icon('chevron', 16));
    return h(
      'div',
      { class: 'start-stack' },
      fold('start-suggested', 'Suggested for you', { badge: hasNewSuggestions(p) ? 'New' : null, hint: 'From your song, clips and lyrics' }, () => [buildLyricIdeas(), buildSuggestPanel({ store, engine, ui })]),
      fold('start-templates', 'Templates and themes', { hint: 'One click restyles everything' }, () => buildTemplates()),
      fold('start-mine', 'My templates', { open: false, hint: 'Save this edit to reuse' }, () => buildMyTemplates()),
      fold('start-projects', 'Projects, project file and earlier projects', { open: false, hint: 'Save, recover, reuse' }, () => buildProjectFiles()),
      fold(
        'start-more',
        'Inspiration, Carousel and the drum converter',
        { open: false },
        h(
          'div',
          { class: 'page-links' },
          page('inspiration', 'wand', 'Inspiration', 'Trends for your niche, the posting playbook, captions and hooks'),
          page('carousel', 'image', 'Carousel', 'Photo carousels for Instagram and TikTok'),
          page('drumconvert', 'activity', 'Drum MIDI converter', 'Move drum MIDI between Superior Drummer, EZdrummer, Addictive Drums, GGD, GM and 150 more maps'),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- PROJECT FILE AND EARLIER PROJECTS
  /** Save or open the edit as a file, and the edits New project and Open replaced. */
  function buildProjectFiles() {
    const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true, 'aria-label': 'Open a project file' });
    file.addEventListener('change', async () => {
      const f = file.files[0];
      file.value = '';
      if (f) await ui.openProjectFile(f);
    });
    const recent = ui.recent();
    const when = (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return h(
      'div',
      {},
      h('p', { class: 'muted small' }, 'A project file holds the edit (clips, texts, lyrics, layers, the song and its settings), not the media. Open it on another computer and Replace missing files picks the media up by name.'),
      h('div', { class: 'row' }, button('Projects…', () => ui.openProjects(), { iconName: 'file', variant: 'sm primary', title: 'Saved edits with their versions: open, copy, recover or use as a template' })),
      h('div', { class: 'row' }, button('Save project file', () => ui.saveProjectFile(), { iconName: 'download', variant: 'sm' }), button('Open project file…', () => file.click(), { iconName: 'upload', variant: 'sm' }), file),
      h('h4', { class: 'sub-head' }, 'Earlier projects'),
      recent.length
        ? h(
            'ul',
            { class: 'recent-list' },
            recent.map((r) =>
              h(
                'li',
                {},
                h('span', { class: 'recent-info' }, h('strong', {}, r.name), h('span', { class: 'muted tiny' }, `${when(r.at)} · ${describeProject(r.project)}`)),
                h('span', { class: 'row' }, button('Restore', () => ui.restoreRecent(r.id), { variant: 'sm' }), iconButton('download', `Save ${r.name} to Projects`, () => ui.saveRecentToProjects(r.id), 'ghost'), iconButton('trash', `Forget ${r.name}`, () => ui.forgetRecent(r.id), 'ghost danger')),
              ),
            ),
          )
        : h('p', { class: 'muted small' }, 'Nothing yet. When New project or Open project file replaces an edit, the old one is kept here (the last 5).'),
    );
  }

  // ---------------------------------------------------------------- IDEAS FROM YOUR LYRICS
  function buildLyricIdeas() {
    const p = store.get();
    const ideas = lyricIdeas(p);
    if (!ideas.ok) return section('From your lyrics', h('p', { class: 'muted small' }, 'Paste your lyrics (Lyrics tab) and you’ll get a theme, visualizer and line looks that fit the words.'));
    const apply = (kind, msg) => {
      store.update((d) => applyLyricIdea(d, lyricIdeas(d), kind));
      toast(`${msg} Undo (Ctrl+Z) to go back.`);
      ui.refreshPanels(true);
    };
    const quote = (words) => words.slice(0, 4).map((w, i) => [i ? ', ' : '', h('b', {}, `“${w}”`)]).flat();
    const th = THEMES.find((t) => t.id === ideas.theme.id);
    const on = (k) => (k === 'theme' ? p.theme && p.theme.id === ideas.theme.id : k === 'viz' ? (p.layers || []).some((L) => L.type === 'viz' && L.style === ideas.viz.style && L.visible !== false) : k === 'display' ? (p.lyricStyle.display || 'line') === ideas.display.id : ideas.lines.every((li) => (p.lyrics.find((l) => l.id === li.id) || {}).style));
    const idea = (k, ic, title, why, label, msg, extra = null) =>
      h('div', { class: 'idea' }, icon(ic, 18), h('div', { class: 'idea-body' }, h('strong', {}, title), h('span', { class: 'why' }, ...why), extra), on(k) ? h('span', { class: 'chip-static ok' }, 'In use') : button(label, () => apply(k, msg), { variant: 'sm' }));
    const PRESET_NAMES = Object.fromEntries(LINE_PRESETS.map(([id, label]) => [id, label]));
    const display = LYRIC_DISPLAYS.find(([id]) => id === ideas.display.id);
    return section(
      'From your lyrics',
      h(
        'div',
        { class: 'lyric-ideas' },
        idea('theme', 'palette', h('span', {}, `Theme: ${ideas.theme.name}`, th ? h('span', { class: 'idea-swatch', 'aria-hidden': 'true' }, ['bg', 'deep', 'accent', 'light'].map((c) => h('i', { style: `background:${th.colors[c]}` }))) : null), ideas.theme.words.length ? ['Your words: ', ...quote(ideas.theme.words)] : ['A dark, all-round look when the words don’t point anywhere.'], 'Use', `${ideas.theme.name} applied.`),
        idea('viz', 'volume', `Visualizer: ${ideas.viz.label}`, ideas.viz.words.length ? ['Fits ', ...quote(ideas.viz.words)] : ['Reacts to the song without getting in the way.'], 'Add', `${ideas.viz.label} visualizer added.`),
        idea('display', 'mic', `Lyrics: ${display ? display[1] : ideas.display.id}`, [ideas.display.why[0].toUpperCase() + ideas.display.why.slice(1), '.'], 'Use', 'Lyric display changed.'),
        ideas.lines.length
          ? idea(
              'lines',
              'type',
              `Line looks for ${ideas.lines.length} line${ideas.lines.length > 1 ? 's' : ''}`,
              ['Shouted lines scream, the chorus becomes gang vocals.'],
              'Style them',
              'Line looks applied.',
              h('ul', { class: 'idea-lines' }, ideas.lines.slice(0, 5).map((li) => h('li', {}, h('span', { class: 'tag' }, PRESET_NAMES[li.preset] || li.preset), h('span', { class: 'muted' }, li.text.length > 34 ? `${li.text.slice(0, 33)}…` : li.text)))),
            )
          : null,
        button('Use all of these', () => apply('all', 'Theme, visualizer, lyric display and line looks applied.'), { iconName: 'wand', variant: 'sm primary' }),
      ),
      lyricIdeasAssistant(() => store.get()),
    );
  }

  // ---------------------------------------------------------------- VIDEO / AUDIO / LAYER TABS
  /** Music videos, footage and stems saved on the open artist's songs in the Manager. */
  function buildSongFiles() {
    const songs = ui.songFiles ? ui.songFiles() : [];
    if (!songs.length) return h('p', { class: 'muted small' }, 'Nothing yet. In the Manager, open a song’s Files tab to add its music video, raw footage and stems.');
    const send = (id, how) => ui.sendToEdit && ui.sendToEdit(id, how);
    const len = (s) => (s && Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');
    return h(
      'div',
      { class: 'song-files' },
      songs.map((s) =>
        h(
          'div',
          { class: 'song-files-song' },
          h('div', { class: 'song-files-head' }, h('strong', {}, s.title), h('button', { type: 'button', class: 'link small', onclick: () => ui.openSongFiles && ui.openSongFiles(s.id) }, 'Manage')),
          [...(s.video ? [{ ...s.video, note: 'Music video' }] : []), ...s.footage].map((m) =>
            h(
              'div',
              { class: 'song-files-item' },
              m.thumb ? h('img', { src: m.thumb, alt: '' }) : h('span', { class: 'song-files-noimg' }),
              h('span', { class: 'song-files-name', title: m.name }, m.note || m.name, m.duration ? h('span', { class: 'muted tiny' }, ` ${len(m.duration)}`) : null),
              m.note === 'Music video' && ui.openSongPart ? button('Make a video', () => ui.openSongPart({ songId: s.id, picture: 'video' }), { iconName: 'scissors', variant: 'sm primary', title: 'Pick the part of the song (entire song, a section, several sections or a range): the music video is cut in sync with it' }) : null,
              button('Add', () => send(m.id, 'clip'), { iconName: 'plus', variant: 'sm', title: 'Add to the end of the video track' }),
              iconButton('layers', 'Picture-in-picture at the playhead', () => send(m.id, 'overlay'), 'ghost'),
            ),
          ),
          (s.tabs || []).map((m) =>
            h(
              'div',
              { class: 'song-files-item stem' },
              h('span', { class: 'song-files-name', title: m.name }, `Tab: ${m.title || m.name}`),
              button('Add', () => send(m.id, 'tab'), { iconName: 'plus', variant: 'sm', title: 'Show the tab on the video' }),
              button('Tab Studio', () => send(m.id, 'tabstudio'), { variant: 'sm' }),
            ),
          ),
          s.stems.length
            ? h(
                'div',
                { class: 'song-files-stems' },
                s.stems.map((m) =>
                  h(
                    'div',
                    { class: 'song-files-item stem' },
                    h('span', { class: 'song-files-name', title: m.name }, `${m.role === 'other' ? 'Stem' : stemRoleLabel(m.role)}: ${m.label || m.name}`),
                    m.role === 'drums' || m.role === 'perc' ? button('Drum chart', () => send(m.id, 'drums'), { variant: 'sm' }) : null,
                    button('Visualizer', () => send(m.id, 'viz'), { variant: 'sm' }),
                  ),
                ),
              )
            : null,
        ),
      ),
    );
  }

  function buildVideoTab(b) {
    const n = (store.get().layers || []).filter((l) => l.type === 'video').length;
    return h(
      'div',
      {},
      fold('video-clips', 'My clips', { hint: 'Upload and arrange your footage' }, buildMedia(b)),
      fold('video-songs', 'From your songs', { open: false, hint: 'Music videos, footage, tabs and stems saved on your songs' }, () => buildSongFiles()),
      fold('video-find', 'Find a moment', { open: false, hint: 'Describe it, find it in your footage' }, () => findMomentBox({ addClip: (rec, o) => actions.addClip(rec, null, o), songFiles: () => (ui.songFiles ? ui.songFiles() : []), currentSongId: () => store.get().managerSongId || '' })),
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
      types: ['viz', 'midi'],
      intro: 'Visuals that react to your song or a stem (ripples, spectrums, VU meters, fire and more), or that play a MIDI part: a piano roll, falling keys or note bursts.',
      empty: 'No visualizers yet.',
    });
  }
  function buildGuitarTab(b) {
    return buildLayersPanel(b, layerCtx(), {
      types: ['tab', 'drums', 'midi', 'game'],
      intro: 'Guitar, bass and drum parts from Guitar Pro files, MIDI files (drums from any drum software) or a drum stem, in time with the song.',
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
            // the part of the song picked above, if any: the edit plays it, then the template styles it (one undo)
            const part = ui.templatePart ? ui.templatePart() : null;
            try {
              store.update((d) => {
                if (part) applySongPart(d, part, { ...ui.songTemplateContext(), picture: 'keep' });
                applyTemplate(d, tpl.id, tabSources(media.all()));
              });
            } catch (e) {
              return toast(e.message, 'error', 6000);
            }
            toast(`“${tpl.name}” applied${part ? ` to ${describeChoice(part)}` : ''}. Undo (Ctrl+Z) to go back.`);
            ui.refreshPanels(true);
          }, { variant: `sm${p.template === tpl.id ? '' : ' primary'}` }),
        ),
      );
    });

    const canvasSect = canvasSection(p, sources);
    return h(
      'div',
      {},
      isCanvas(p) ? canvasSect : null,
      templatePartSection(),
      songTemplatesSection(),
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
      isCanvas(p) ? null : canvasSect,
    );
  }

  /** "Part of the song": which part the templates below (and the Suggested edits) are built for. */
  function templatePartSection() {
    const el = ui.templatePartPicker ? ui.templatePartPicker() : null;
    const looks = el && ui.songTemplateContext ? sectionLooksSwitch({ store, ctx: () => ui.songTemplateContext(), choice: () => (ui.templatePart ? ui.templatePart() : null), refresh: () => ui.refreshPanels(true) }) : null;
    return el ? section('Part of the song', el, looks) : null;
  }
  const describeChoice = (c) => {
    const ctx = ui.songTemplateContext();
    const r = ctx && ctx.audio ? describePart(c, partSections(ctx.song, ctx.audio.duration || 0), ctx.audio.duration || 0) : null;
    return r && r.ok ? `${r.parts.map((q) => q.label).join(', ')} (${formatTime(r.length, false)})` : 'the part you picked';
  };
  ui.templatePartLabel = describeChoice;

  // ---------------------------------------------------------------- TEMPLATES FROM THE SONG'S FILES
  /** Rhythm game, music video + lyrics, raw footage + lyrics: built from the current song's own files. */
  function songTemplatesSection() {
    const ctx0 = ui.songTemplateContext ? ui.songTemplateContext() : null;
    const ctxAll = ctx0 ? { ...ctx0, gameTheme: songTplUI.gameTheme, lyrics: store.get().lyrics } : null;
    const cards = SONG_TEMPLATES.map((tpl) => {
      const ctx = ctxAll ? { ...ctxAll, part: ui.templatePart ? ui.templatePart(tpl.id) : null, ...lyricTplOpts(tpl) } : null;
      const r = songTemplateReady(tpl.id, ctx);
      const c = h('canvas', { width: 108, height: 192, class: 'tpl-thumb', 'aria-hidden': 'true' });
      if (r.ok) {
        requestAnimationFrame(() => {
          try {
            const draft = structuredClone(store.get());
            applySongTemplate(draft, tpl.id, ctx);
            draft.look.overlay = 'off';
            draft.endCard.enabled = false;
            renderFrame(c.getContext('2d'), c.width, c.height, draft, tpl.id === 'st-game' ? 6 : 2, engine.env(false));
          } catch (e) {
            console.warn('song template preview failed', e);
          }
        });
      }
      const on = store.get().template === tpl.id;
      return h(
        'div',
        { class: `tpl-card${on ? ' on' : ''}${r.ok ? '' : ' off'}`, 'data-songtpl': tpl.id },
        c,
        h(
          'div',
          { class: 'tpl-info' },
          h('strong', {}, tpl.name),
          h('span', { class: 'muted tiny' }, tpl.blurb),
          r.ok ? h('ul', { class: 'tpl-uses tiny' }, r.uses.map((u) => h('li', {}, u))) : h('span', { class: 'tpl-needs tiny' }, r.missing),
          tpl.id === 'st-game' && r.ok
            ? (() => {
                const sel = h('select', { 'aria-label': 'Rhythm game theme', 'data-k': 'songtpl-gametheme' }, GAME_THEME_LIST.map(([id, name]) => h('option', { value: id, selected: id === songTplUI.gameTheme }, `Theme: ${name}`)));
                sel.addEventListener('change', () => ((songTplUI.gameTheme = sel.value), ui.refreshPanels(true)));
                return sel;
              })()
            : null,
          lyricCardExtras(tpl, r, ui),
          r.ok
            ? button(on ? 'Applied · re-apply' : 'Use this template', () => {
                try {
                  const facts = ui.applySongTemplate(tpl.id, { gameTheme: songTplUI.gameTheme, ...lyricTplOpts(tpl) }); // the part picked now (ui.templatePart)
                  toast(`“${tpl.name}” for “${ctx.song.title}”: ${facts.join('. ')}. Undo (Ctrl+Z) to go back.`, 'info', 9000);
                } catch (e) {
                  toast(e.message, 'error', 6000);
                }
              }, { variant: `sm${on ? '' : ' primary'}` })
            : r.detect && ctx.audio
              ? button('Detect sections first', () => ui.detectSongSections(ctx.song.id), { variant: 'sm', iconName: 'wand', title: 'Opens the song’s Sections tab and listens for the intro, verses and choruses; accept them there, then come back' })
              : ctx && ctx.song ? button('Open the song’s files', () => ui.openSongFiles(ctx.song.id), { variant: 'sm ghost' }) : null,
        ),
      );
    });
    return section(
      'From your song’s files',
      h('p', { class: 'muted small' }, ctxAll && ctxAll.song ? `Made from “${ctxAll.song.title}” and the files on its Files tab in Songs & releases. Each ends on the song’s end card.` : 'Pick one of your songs in the Audio tab: these templates are made from its tabs, MIDI, stems, music video and footage, and end on its end card.'),
      h('div', { class: 'tpl-grid' }, cards),
    );
  }

  // ---------------------------------------------------------------- SPOTIFY CANVAS
  /** Loop templates for a Spotify Canvas, the 3–8 s video behind a track in Now Playing. */
  function canvasSection(p) {
    const srcLen = (id) => media.get(id)?.duration ?? Infinity;
    const len = clampCanvasLength(canvasUI.length ?? p.canvas?.length ?? CANVAS_MAX);
    const lenIn = h('input', { type: 'range', min: CANVAS_MIN, max: CANVAS_MAX, step: 0.5, value: len, 'aria-label': 'Loop length in seconds', 'data-k': 'canvas-len' });
    const lenOut = h('strong', {}, `${len.toFixed(1)} s`);
    lenIn.addEventListener('input', () => (lenOut.textContent = `${(+lenIn.value).toFixed(1)} s`));
    lenIn.addEventListener('change', () => {
      canvasUI.length = +lenIn.value;
      // re-apply the current Canvas template at the new length
      if (isCanvas(store.get()) && store.get().canvas?.template) use(store.get().canvas.template, false);
      else ui.refreshPanels(true);
    });
    const use = (id, announce = true) => {
      let res = null;
      store.update((d) => (res = applyCanvas(d, id, { length: canvasUI.length ?? len, srcLen })));
      if (!res || !res.ok) return toast(res ? res.message : 'Could not make the Canvas.', 'error', 5000);
      ui.setLoop && ui.setLoop(true);
      engine.seek && engine.seek(0);
      if (announce) toast(`“${canvasTemplate(id).name}” Canvas: a ${res.length.toFixed(1)} s loop. ${res.message || 'Undo (Ctrl+Z) to go back.'}`, 'info', 5000);
      else if (res.message) toast(res.message, 'info', 5000);
      ui.refreshPanels(true);
    };
    const loopLabel = { seamless: 'Seamless loop', hardcut: 'Hard cut', rebound: 'Rebound' };
    const cards = CANVAS_TEMPLATES.map((tpl) => {
      const c = h('canvas', { width: 108, height: 192, class: 'tpl-thumb', 'aria-hidden': 'true' });
      requestAnimationFrame(() => {
        const draft = structuredClone(store.get());
        const r = applyCanvas(draft, tpl.id, { length: len, srcLen });
        draft.look.overlay = 'off';
        for (const x of draft.clips) if (x.from) x.id = x.from; // draw with the clips' video elements already loaded
        try {
          if (r.ok) renderFrame(c.getContext('2d'), c.width, c.height, draft, Math.min(1.5, draft.duration / 3), engine.env(false));
        } catch (e) {
          console.warn('canvas preview failed', e);
        }
      });
      const on = isCanvas(p) && p.canvas?.template === tpl.id;
      return h(
        'div',
        { class: `tpl-card${on ? ' on' : ''}`, 'data-canvas': tpl.id },
        c,
        h(
          'div',
          { class: 'tpl-info' },
          h('strong', {}, tpl.name),
          h('span', { class: 'tpl-loop tiny' }, loopLabel[tpl.loop]),
          h('span', { class: 'muted tiny' }, tpl.blurb),
          button(on ? 'Applied · re-apply' : 'Make this Canvas', () => use(tpl.id), { variant: `sm${on ? '' : ' primary'}` }),
        ),
      );
    });
    const issues = isCanvas(p) ? canvasIssues(p, { exportHeight: ASPECTS[p.aspect].h }) : [];
    const hasSource = p.clips.length || p.endCard.coverMediaId || (p.canvas && p.canvas.backup);
    return section(
      'Spotify Canvas',
      h('p', { class: 'muted small' }, 'A Canvas is the 3–8 second vertical loop that plays behind your track in Spotify instead of the cover art. Each template turns your first clips (or the cover art) into a loop that runs back into its start, in Spotify’s size (608×1080), with no text, lyrics or end card. Upload it in Spotify for Artists → Music → your track → Add Canvas.'),
      hasSource ? null : h('p', { class: 'warn-list' }, 'Add a clip, or pick the song’s cover art on the End card tab, first.'),
      h('label', { class: 'canvas-len' }, h('span', { class: 'small' }, 'Loop length'), lenIn, lenOut),
      isCanvas(p)
        ? h(
            'div',
            { class: 'canvas-status' },
            issues.length ? h('ul', { class: 'warn-list' }, issues.map((i) => h('li', { class: i.level }, i.text))) : h('p', { class: 'ok-text small' }, '✓ Fits Spotify’s Canvas rules: 9:16, 1080 px tall, 3–8 seconds, no text or flashing.'),
            h(
              'div',
              { class: 'row' },
              button('Export the Canvas', () => ui.openTab('export'), { iconName: 'download', variant: 'sm primary' }),
              p.canvas && p.canvas.backup ? button('Back to my edit', () => {
                store.update((d) => undoCanvas(d));
                ui.setLoop && ui.setLoop(false);
                toast('Your edit is back (format, length, clips and end card).');
                ui.refreshPanels(true);
              }, { variant: 'sm ghost', title: 'Undo the Canvas: puts the format, length, clips and end card back' }) : null,
            ),
          )
        : null,
      h('div', { class: 'tpl-grid' }, cards),
      h('p', { class: 'muted tiny' }, 'Spotify’s tips: no singing or rapping on screen (it won’t sync), no fast cuts or intense flashing, and keep the important part away from the edges and the bottom third, where the title and controls sit. The preview shows Spotify’s Now Playing view; turn it off under the preview.'),
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
  const libState = { query: '', favoritesOnly: false, limit: 60, importing: '', source: 'all', tag: '', editKey: null };
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
    // ---- All your sounds in one list: your uploads, the free pack and the built-in effects.
    // Rename, tag and star any of them; filter by where they came from, by tag, or starred.
    const libList = h('div', { class: 'sfx-list lib-list' }, h('p', { class: 'muted tiny' }, 'Loading your sounds…'));
    const libInfo = h('p', { class: 'muted tiny' });
    const progress = h('p', { class: 'small', hidden: !libState.importing }, libState.importing || '');
    const libSearch = h('input', { type: 'search', placeholder: 'Search by name or tag: airhorn, boom, crowd…', value: libState.query, 'aria-label': 'Search your sounds' });
    const libChips = h('div', { class: 'chips sfx-filters' });
    const tagChips = h('div', { class: 'chips sfx-tags' });
    const extOf = (it) => (/\.[a-z0-9]+$/i.exec(it.fileName || '') || ['.mp3'])[0];
    const urls = new Map();
    const previewUrl = async (it) => {
      if (urls.has(it.key)) return urls.get(it.key);
      let u = it.url;
      if (it.source === 'mine') u = URL.createObjectURL((await soundLib.get(it.id)).blob);
      if (it.source === 'builtin') u = URL.createObjectURL(await synthSfx(it.id));
      urls.set(it.key, u);
      return u;
    };
    const blobOf = async (it) => (it.source === 'mine' ? (await soundLib.get(it.id)).blob : it.source === 'builtin' ? synthSfx(it.id) : fetchBlob(it.url));
    const addItem = async (it, btn) => {
      btn.disabled = true;
      try {
        const name = `${it.name}${it.source === 'mine' ? extOf(it) : it.source === 'builtin' ? '.wav' : '.mp3'}`;
        await addSoundBlob(await blobOf(it), name, { source: it.source === 'mine' ? (await soundLib.get(it.id)).source : it.source, attribution: it.attribution });
      } catch (e) {
        toast(e.message, 'error');
      }
      btn.disabled = false;
    };
    /** Save a rename / tags / star: on the record for your sounds, as an override for the others. */
    const editItem = async (it, patch, defaults) => {
      if (it.source === 'mine') return soundLib.update(it.id, patch);
      const meta = loadMeta();
      const m = metaFor(it, patch, defaults);
      if (m) meta[it.key] = m;
      else delete meta[it.key];
      saveMeta(meta);
      renderLib();
    };
    const editRow = (it, defaults) => {
      const nameIn = h('input', { type: 'text', value: it.name, 'aria-label': `Name for ${it.name}`, 'data-k': `snd-name-${it.key}` });
      const tagsIn = h('input', { type: 'text', value: it.tags.join(', '), placeholder: 'Tags, separated by commas: impact, intro, drop', 'aria-label': `Tags for ${it.name}`, 'data-k': `snd-tags-${it.key}` });
      const save = async () => {
        libState.editKey = null;
        await editItem(it, { name: nameIn.value.trim() || it.name, tags: parseTags(tagsIn.value) }, defaults);
        if (it.source === 'mine') renderLib();
      };
      for (const el of [nameIn, tagsIn]) el.addEventListener('keydown', (e) => (e.key === 'Enter' ? save() : e.key === 'Escape' ? ((libState.editKey = null), renderLib()) : null));
      setTimeout(() => nameIn.focus(), 0);
      return h(
        'div',
        { class: 'sfx-edit' },
        field('Name', nameIn),
        field('Tags', tagsIn),
        h(
          'div',
          { class: 'row' },
          button('Save', save, { variant: 'sm primary' }),
          button('Cancel', () => ((libState.editKey = null), renderLib()), { variant: 'sm ghost' }),
          it.source !== 'mine' && it.edited ? button('Back to the original', async () => ((libState.editKey = null), editItem(it, { name: it.defaultName, tags: defaults.tags, favorite: false }, defaults)), { variant: 'sm ghost' }) : null,
        ),
      );
    };

    const renderLib = async () => {
      const lib = await soundLib.all();
      const packList = loadPack(() => renderLib());
      const raw = [...lib.map(fromLibrary), ...(packList || []).map((s) => fromPack(s, packResult(s).url)), ...BUILTIN_SFX.map(fromBuiltin)];
      const defaults = new Map(raw.map((it) => [it.key, { tags: it.tags }]));
      const items = applyMeta(raw, loadMeta());
      const base = filterAll(items, { q: libState.query, source: libState.source, starred: libState.favoritesOnly });
      const tags = topTags(base);
      if (libState.tag && !base.some((it) => it.tags.includes(libState.tag))) libState.tag = '';
      const shown = libState.tag ? base.filter((it) => it.tags.includes(libState.tag)) : base;
      const count = (src) => items.filter((it) => src === 'all' || it.source === src).length;
      libChips.replaceChildren(
        ...SOURCES.map(([k, l]) => button(`${l} ${count(k)}`, () => ((libState.source = k), (libState.limit = 60), renderLib()), { variant: `chip${libState.source === k ? ' on' : ''}` })),
        button(`★ Starred ${items.filter((it) => it.favorite).length}`, () => ((libState.favoritesOnly = !libState.favoritesOnly), (libState.limit = 60), renderLib()), { variant: `chip${libState.favoritesOnly ? ' on' : ''}` }),
      );
      tagChips.replaceChildren(...tags.map(({ tag, n }) => button(`#${tag} ${n}`, () => ((libState.tag = libState.tag === tag ? '' : tag), (libState.limit = 60), renderLib()), { variant: `chip sm${libState.tag === tag ? ' on' : ''}` })));
      const info = await storageInfo();
      const mb = (n) => (n == null ? '?' : (n / 1048576).toFixed(n > 1e8 ? 0 : 1));
      const total = lib.reduce((sum, x) => sum + (x.size || 0), 0);
      libInfo.replaceChildren(
        `${lib.length} of your own sound${lib.length === 1 ? '' : 's'} · ${mb(total)} MB`,
        info.quota ? ` · browser storage ${mb(info.usage)} of ${mb(info.quota)} MB used` : '',
        info.persisted ? ' · protected from clean-up' : '',
      );
      if (!shown.length) {
        libList.replaceChildren(h('p', { class: 'muted small' }, libState.source === 'mine' && !lib.length ? 'No sounds of your own yet. Add some at the bottom of this tab.' : 'No sounds match. Try another word, or search Freesound below.'));
        return;
      }
      const limit = libState.limit;
      const more = shown.length > limit ? [button(`Show ${Math.min(60, shown.length - limit)} more of ${shown.length - limit}`, () => ((libState.limit += 60), renderLib()), { variant: 'ghost wide' })] : [];
      libList.replaceChildren(
        h('p', { class: 'muted tiny' }, `${shown.length} sound${shown.length === 1 ? '' : 's'}${libState.query ? ` for “${libState.query}”` : ''}${libState.tag ? ` tagged #${libState.tag}` : ''}`),
        ...shown.slice(0, limit).map((it) => {
          const play = h('button', { type: 'button', class: 'icon-btn sfx-play', 'aria-label': `Preview ${it.name}` }, icon('play', 16));
          play.addEventListener('click', async () => playPreview(it.key, await previewUrl(it), play));
          const star = h('button', { type: 'button', class: `icon-btn star${it.favorite ? ' on' : ''}`, 'aria-label': it.favorite ? `Unstar ${it.name}` : `Star ${it.name}`, 'aria-pressed': it.favorite ? 'true' : 'false', onclick: () => editItem(it, { favorite: !it.favorite }, defaults.get(it.key)) }, it.favorite ? '★' : '☆');
          const add = button('Add', () => addItem(it, add), { iconName: 'plus', variant: 'sm primary', title: 'Add to the timeline at the playhead' });
          const credit = it.attribution && it.attribution.author && it.source === 'pack' ? it.attribution.author : '';
          const row = h(
            'div',
            { class: 'sfx-row lib-row', 'data-key': it.key },
            play,
            h(
              'div',
              { class: 'sfx-meta' },
              h('span', { class: 'sfx-name', title: it.name }, it.name),
              h(
                'span',
                { class: 'muted tiny sfx-sub' },
                h('span', { class: `sfx-src src-${it.source}` }, SOURCE_LABEL[it.source]),
                it.duration ? ` ${it.duration.toFixed(1)}s` : '',
                credit ? ` · ${credit}` : '',
                it.attribution && it.attribution.needsCredit ? ' · credit needed' : '',
              ),
              it.tags.length ? h('span', { class: 'sfx-taglist' }, it.tags.slice(0, 5).map((t) => h('button', { type: 'button', class: 'sfx-tag', onclick: () => ((libState.tag = t), renderLib()) }, `#${t}`))) : null,
            ),
            h(
              'div',
              { class: 'lib-acts' },
              star,
              iconButton('type', `Rename or tag ${it.name}`, () => ((libState.editKey = libState.editKey === it.key ? null : it.key), renderLib()), 'ghost'),
              add,
              it.source === 'mine' ? iconButton('trash', `Delete ${it.name}`, async () => confirm(`Delete “${it.name}” from your sounds?`) && soundLib.remove(it.id), 'ghost danger') : null,
            ),
          );
          return libState.editKey === it.key ? h('div', { class: 'sfx-editing' }, row, editRow(it, defaults.get(it.key))) : row;
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
      toast(`Added ${res.added.length} sound${res.added.length === 1 ? '' : 's'} to Your sounds.${why}`, res.added.length ? 'info' : 'error', 6000);
      renderLib();
    };

    const drop = h(
      'div',
      { class: 'dropzone small-drop', tabindex: '0', role: 'button', 'aria-label': 'Add sound files to Your sounds' },
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

    let searchTimer = null;
    libSearch.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        libState.query = libSearch.value.trim();
        libState.limit = 60;
        renderLib();
      }, 120);
    });
    renderLib();

    // Save a downloaded result into the library
    const saveToLib = async (blob, name, meta, btn) => {
      btn.disabled = true;
      const ext = (blob.type.split('/')[1] || 'mp3').replace('mpeg', 'mp3').replace(/;.*/, '');
      const file = new File([blob], `${name.slice(0, 60)}.${ext}`, { type: blob.type || 'audio/mpeg' });
      const res = await importSounds([file], { source: meta.source, attribution: meta.attribution || null });
      toast(res.added.length ? `Saved “${name}” to Your sounds` : `Not saved: ${res.skipped[0]?.reason || 'unknown error'}`, res.added.length ? 'info' : 'error');
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
        const meta = { source: prefix, attribution: { provider: prefix, providerLabel: prefix === 'freesound' ? 'Freesound' : prefix === 'pack' ? 'Free sound pack (CC0)' : `${r.provider || 'Openverse'} via Openverse`, source: r.provider, author: r.author, pageUrl: r.pageUrl, license: r.license, needsCredit: r.needsCredit } };
        const add = button('Add', async () => {
          add.disabled = true;
          try {
            await addSoundBlob(await fetchBlob(r.url), `${r.title.slice(0, 40)}.mp3`, meta);
          } catch (e) {
            toast(`${e.message}. You can download it from the sound’s page and add it under Add your own sounds.`, 'error', 6000);
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
        }, { variant: 'sm', title: 'Save to Your sounds' });
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

    const myInstants = h('a', { class: 'btn sm ghost', target: '_blank', rel: 'noopener noreferrer', href: 'https://www.myinstants.com/en/search/?name=' }, 'Find on MyInstants');
    const syncMi = () => (myInstants.href = `https://www.myinstants.com/en/search/?name=${encodeURIComponent(libSearch.value.trim())}`);
    libSearch.addEventListener('input', syncMi);
    syncMi();

    return h(
      'div',
      {},
      section(
        'Your sounds',
        h('p', { class: 'muted small' }, 'Everything in one place: sounds you added, the free CC0 pack that ships with the app, and the built-in effects. Star favorites, and rename or tag any sound with the ', icon('type', 12), ' button.'),
        h('div', { class: 'search-row' }, libSearch),
        libChips,
        tagChips,
        libList,
        h('div', { class: 'row' }, myInstants, h('span', { class: 'muted tiny' }, 'Searches MyInstants for the same words. Most clips there are cut from movies, TV and songs, so only use ones you have the rights to.')),
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
      section(
        'Add your own sounds',
        h('p', { class: 'muted small' }, 'Add clips in bulk. They join Your sounds above and stay in this browser for every project. Folder and file names become tags.'),
        drop,
        h('div', { class: 'row' }, folderBtn, button('Add files', async () => doImport(await pickFiles('audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus', true)), { iconName: 'upload', variant: 'sm' })),
        progress,
        libInfo,
        h('p', { class: 'muted tiny' }, 'Only add sounds you have the rights to use. They live in this browser on this device; clearing site data removes them.'),
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
    const open = async () => importFiles(await pickFiles(`video/*,image/*,audio/*,.ttf,.otf,.woff,.woff2,${TAB_ACCEPT},${MIDI_ACCEPT}`));
    drop.addEventListener('click', open);
    drop.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open()));
    const fromDrive = driveButton(`video/*,image/*,audio/*,${TAB_ACCEPT},${MIDI_ACCEPT}`, true, (files) => importFiles(files));

    const items = media.all();
    const grid = h('div', { class: 'media-grid' });
    if (!items.length) grid.append(h('p', { class: 'muted small' }, 'Nothing here yet.'));
    const weakBox = items.some((m) => m.kind === 'video') ? weakToggle() : null;
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
      if (rec.kind === 'midi') acts.push(button('Show on video', () => actions.useMidi(rec), { iconName: 'music', variant: 'sm' }), button('Convert drum map', () => ((drumConvertState.pick = rec.id), (drumConvertState.bytes = null), (drumConvertState.from = ''), ui.openTab('drumconvert')), { variant: 'sm ghost' }));
      grid.append(
        h(
          'div',
          { class: 'media-item' },
          h(
            'div',
            { class: `thumb kind-${rec.kind}` },
            rec.thumb ? h('img', { src: rec.thumb, alt: '' }) : icon(rec.kind === 'audio' || rec.kind === 'midi' ? 'music' : rec.kind === 'font' ? 'type' : rec.kind === 'tab' ? 'guitar' : 'file', 26),
            h('span', { class: 'badge' }, rec.kind === 'font' ? 'font' : isFinite(rec.duration) && rec.duration ? formatTime(rec.duration, false) : rec.kind),
            qualityBadges(rec),
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
    // the tempo the cuts land on, with a way to change it (the control itself is in the Audio tab)
    const tempoLine = () => {
      const t = h('span', { 'data-k': 'autoedit-tempo' });
      b._reg((pp) => (t.textContent = pp.beats ? `Cuts land on ${tempoSummary(pp)}.` : 'No tempo yet.'));
      return h('p', { class: 'muted tiny' }, t, ' ', h('button', { type: 'button', class: 'link', onclick: () => ui.openTab('audio') }, 'Change the tempo'));
    };
    const autoEdit = () => {
      const p = store.get();
      if (!p.song) return toast('Choose a song first (Audio tab).', 'error');
      if (!p.beats) return toast('Set the tempo first (Audio tab → Tempo: type it, tap it or Detect BPM).', 'error');
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
      section('Upload', drop, h('div', { class: 'row gdrive-row' }, fromDrive)),
      section('Library', weakBox, grid),
      visual.length
        ? section(
            'Auto-edit to the beat',
            h('p', { class: 'muted small' }, 'Replaces the video track with cuts that land on the beat of your song, cycling through the media you pick.'),
            beatsBox,
            field('Cut', per),
            tempoLine(),
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
      // Add: a new video layer at the playhead; Add to main track: appended to the main video track (as before)
      const fetchInto = (btn, idle, use) => async () => {
        addBtn.disabled = mainBtn.disabled = true;
        const label = btn.querySelector('span');
        label.textContent = 'Adding…';
        try {
          const blob = await downloadStock(item, (f) => (label.textContent = `${Math.round(f * 100)}%`));
          const name = `${prov.label} ${item.id.split('-')[1]}${blob.type.includes('webm') ? '.webm' : '.mp4'}`;
          const rec = await addMedia(blob, name, { source: item.provider, attribution: { provider: item.provider, author: item.author, pageUrl: item.pageUrl, license: item.license } });
          use(rec);
          label.textContent = 'Added';
          (btn === addBtn ? mainBtn : addBtn).disabled = false;
        } catch (e) {
          toast(`${e.message}. You can download it from the provider page and upload it instead.`, 'error', 6000);
          label.textContent = idle;
          addBtn.disabled = mainBtn.disabled = false;
        }
      };
      const asLayer = (rec) => {
        const made = clipLayer(store.get(), rec, engine.t);
        store.update((d) => {
          d.layers = [...(d.layers || []), made.layer];
        });
        ui.select({ type: 'layer', id: made.layer.id });
        toast(made.trimmed ? 'Added as a new layer (cut to the end of the edit)' : 'Added as a new layer');
      };
      const addBtn = button('Add', () => addBtnRun(), { iconName: 'plus', variant: 'sm primary', title: 'Add as a new video layer at the playhead' });
      const mainBtn = button('Add to main track', () => mainBtnRun(), { variant: 'ghost sm', title: 'Add to the end of the main video track' });
      const addBtnRun = fetchInto(addBtn, 'Add', asLayer);
      const mainBtnRun = fetchInto(mainBtn, 'Add to main track', (rec) => actions.addClip(rec));
      card.append(
        h(
          'div',
          { class: 'stock-meta' },
          h('a', { href: item.pageUrl, target: '_blank', rel: 'noopener noreferrer', class: 'tiny' }, item.author),
          addBtn,
        ),
        h('div', { class: 'stock-main' }, mainBtn),
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
  /** The Lyrics tab's "Lyrics for this song": fill them from Songs & releases or LRCLIB, and the auto settings. */
  function lyricsSourceBox() {
    const p = store.get();
    const rec = p.song && media.get(p.song.mediaId);
    const tools = ui.lyricsTools;
    if (!tools) return null;
    const info = rec ? tools.info(rec) : {};
    const from = p.lyricsFrom;
    const fill = (source) => {
      if (p.lyrics.length && !p.lyricsFrom && !confirm('Replace the lyrics you typed or pasted? Undo (Ctrl+Z) brings them back.')) return;
      tools.fill(rec, { source, force: true });
    };
    const auto = h('input', { type: 'checkbox', checked: settings.autoLyrics !== false });
    auto.addEventListener('change', () => ((settings.autoLyrics = auto.checked), saveSettings(settings), ui.refreshPanels(true)));
    const online = h('input', { type: 'checkbox', checked: settings.autoLyricsOnline !== false, disabled: settings.autoLyrics === false });
    online.addEventListener('change', () => ((settings.autoLyricsOnline = online.checked), saveSettings(settings)));
    const said = from
      ? from.source === 'lrclib'
        ? `From LRCLIB: “${from.title}” by ${from.artist}${from.timed ? ', timed' : ''}.`
        : from.source === 'timing'
          ? `The timing saved on “${from.title}”.`
          : `From Songs & releases: “${from.title}”.`
      : p.lyrics.length ? 'Typed or pasted by you.' : 'None yet.';
    // the timing saved on the song (Songs & releases → the song → Lyrics)
    const tm = info.timingFor;
    const timingBox = tm
      ? h(
          'div',
          { class: 'lyric-timing', 'data-k': 'lyric-timing' },
          h('p', { class: 'small', 'data-k': 'timing-state' }, h('strong', {}, `On “${tm.title}”: `), tm.timing ? `${timingSummary(tm.timing)}, ${SOURCE_LABELS[tm.timing.source] || ''}.` : 'no timing saved yet.', tm.other ? ' It belongs to another artist: open that artist in the Manager to save to it.' : ''),
          tm.stale
            ? h('p', { class: 'warn-note small', 'data-k': 'timing-stale' }, 'Lyrics changed since they were timed. ', button('Re-time with the new lyrics', () => tools.retime(), { variant: 'sm' }), ' ', button('Keep the timing', () => tools.keepTiming(), { variant: 'sm ghost' }))
            : null,
          tm.conflict ? h('p', { class: 'warn-note small', 'data-k': 'timing-conflict' }, 'The song has a different timing saved, so these times weren’t saved over it.') : null,
          p.lyrics.length && !tm.other
            ? h(
                'div',
                { class: 'row wrap' },
                tm.conflict
                  ? button('Replace the song’s timing', () => confirm(`Replace the timing saved on “${tm.title}” with this edit’s ${p.lyrics.length} lines?`) && tools.saveTiming({ replace: true }), { iconName: 'check', variant: 'sm primary' })
                  : button('Save timing to the song', () => tools.saveTiming(), { iconName: 'check', variant: 'sm', title: 'Keep these line times on the song, so every edit of it starts in time. Done for you after tap-sync, timed lyrics and shifts.' }),
              )
            : null,
        )
      : null;
    return section(
      'Lyrics for this song',
      rec ? h('p', { class: 'small' }, h('strong', {}, rec.name), info.song ? ` · “${info.song.title}” in Songs & releases${info.instrumental ? ' (instrumental)' : ''}` : ' · not on a song in Songs & releases') : h('p', { class: 'muted small' }, 'Pick the song in the Audio tab and its lyrics are filled in here.'),
      h('p', { class: 'muted tiny' }, `Now: ${said}`),
      timingBox,
      rec
        ? h(
            'div',
            { class: 'row wrap' },
            info.hasLyrics ? button(`Use the ${info.song.lyricTiming ? 'timed ' : ''}lyrics from “${info.song.title}”`, () => fill('manager'), { iconName: 'mic', variant: 'sm' }) : null,
            button('Find timed lyrics online', () => fill('online'), { iconName: 'search', variant: 'sm', title: 'Look the song up on LRCLIB, a free lyrics database with line timings' }),
          )
        : null,
      h('label', { class: 'toggle' }, auto, h('span', {}, 'Fill in the lyrics when I pick a song')),
      h('label', { class: 'toggle' }, online, h('span', {}, 'If it isn’t in Songs & releases, or is released but has no lyrics there, look it up on LRCLIB')),
      h('p', { class: 'muted tiny' }, 'Your own lyrics come from the song in Songs & releases and never leave this browser, and an unreleased song is never looked up by itself. An online lookup sends only the title, artist and length to ', h('a', { href: 'https://lrclib.net', target: '_blank', rel: 'noopener noreferrer' }, 'lrclib.net'), '. Lyrics you typed or pasted are never replaced by picking a song.'),
    );
  }

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
        d.lyricsFrom = null; // yours now: picking another song won't replace them
        if (fresh.length > old.length) d.lyricsTimed = null; // the new lines aren't timed yet
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
          d.lyricsTimed = markTimed(d.lyricsTimed, 'manual');
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

    const shiftBy = (delta) => store.update((d) => ((d.lyrics = shiftLyrics(d.lyrics, delta)), (d.lyricsTimed = markTimed(d.lyricsTimed, 'manual'))), 'shift');

    const s = (fn) => (d, v) => fn(d.lyricStyle, v);
    const presetRow = h(
      'div',
      { class: 'chips' },
      Object.entries(LYRIC_PRESETS).map(([name, preset]) => button(name, () => store.update((d) => {
        // the effect settings and pulse tempo stay (Reset to default under Effect settings clears them)
        const { fx, tempo } = d.lyricStyle;
        d.lyricStyle = { ...defaultLyricStyle(), y: d.lyricStyle.y, display: d.lyricStyle.display || 'line', ...preset };
        if (fx) d.lyricStyle.fx = fx;
        if (tempo) d.lyricStyle.tempo = tempo;
      }), { variant: 'chip' })),
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
      lyricsSourceBox(),
      section(
        '1 · Lyrics',
        paste,
        h('div', { class: 'row' }, button('Use these lyrics', applyText, { variant: 'primary', iconName: 'check' }), button('Import .lrc', importLRC, { iconName: 'upload', variant: 'ghost' }), button('Export .lrc', exportLRC, { iconName: 'download', variant: 'ghost', disabled: !p.lyrics.length })),
      ),
      section('2 · Sync to the song', syncBox, h('h4', { class: 'ai-h' }, 'Or let the computer do it'), studioAutoSync({ store, engine, ui, media })),
      p.lyrics.length
        ? section(
            '3 · Fine-tune timing',
            h('p', { class: 'muted tiny' }, 'Drag lyric blocks on the timeline, or edit times here (m:ss.cc). Times follow the song, so changing the song section keeps them in sync.'),
            h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Shift all'), button('−0.5s', () => shiftBy(-0.5), { variant: 'sm' }), button('−0.1s', () => shiftBy(-0.1), { variant: 'sm' }), button('+0.1s', () => shiftBy(0.1), { variant: 'sm' }), button('+0.5s', () => shiftBy(0.5), { variant: 'sm' })),
            h('div', { class: 'lyric-head muted tiny' }, h('span', {}, '#'), h('span', {}, 'Line'), h('span', {}, 'Start'), h('span', {}, 'End'), h('span', {})),
            list,
          )
        : null,
      p.lyrics.length ? wordTimingSection(p, sorted) : null,
      section(
        'Lyric style',
        h('div', { class: 'lbl' }, 'How lyrics are shown'),
        displayGrid,
        presetRow,
        fontField(b, 'Font', (p) => p.lyricStyle.font, s((o, v) => (o.font = v))),
        display === 'line' ? b.select('Entrance', (p) => p.lyricStyle.animation, s((o, v) => (o.animation = v)), ANIMATIONS) : null,
        display === 'line'
          ? h('div', { class: 'grid2' },
              b.select('Exit', (p) => p.lyricStyle.outAnimation || '', s((o, v) => (o.outAnimation = v)), TEXT_EXITS),
              b.range('Exit length', (p) => p.lyricStyle.outDuration ?? 0.35, s((o, v) => (o.outDuration = v)), { min: 0.1, max: 1.5, step: 0.05, fmt: (v) => `${v.toFixed(2)}s` }),
            )
          : null,
        // flash hit and ghost echo (lyricanim.js): '' is off and leaves no field behind
        display === 'line'
          ? h('div', { class: 'grid2', 'data-k': 'lyric-hit-echo' },
              b.select('Flash hit', (p) => p.lyricStyle.hit || '', s((o, v) => (v ? (o.hit = v) : delete o.hit)), HITS),
              b.select('Ghost echo', (p) => p.lyricStyle.echo || '', s((o, v) => (v ? (o.echo = v) : delete o.echo)), ECHOES),
            )
          : null,
        lyricFxGroup(b, { store, engine, ui }, { style: p.lyricStyle, holder: (d) => d.lyricStyle }),
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

  /** "4 · Word timing": when each word of a line starts and ends (Karaoke, Word by word and the lyric displays). */
  function wordTimingSection(p, sorted) {
    const lines = sorted.filter((l) => String(l.text || '').trim());
    if (!lines.length) return null;
    const selId = ui.selection && ui.selection.type === 'lyric' ? ui.selection.id : wordUI.lineId;
    const line = lines.find((l) => l.id === selId) || lines[0];
    if (wordUI.lineId !== line.id) Object.assign(wordUI, { lineId: line.id, word: 0 });
    const num = (l) => sorted.indexOf(l) + 1;
    const pick = h('select', { 'aria-label': 'Line to time', 'data-k': 'wt-line' }, lines.map((l) => h('option', { value: l.id, selected: l.id === line.id }, `${num(l)} · ${l.text.length > 44 ? `${l.text.slice(0, 43)}…` : l.text}`)));
    pick.addEventListener('change', () => {
      const l = lines.find((x) => x.id === pick.value);
      if (l) selectLyric(l);
    });
    const i = lines.indexOf(line);
    // one undo step per change; the timing then saves on the song by itself, like line times
    const edit = (ids, fn) => store.update((d) => {
      d.lyrics.forEach((x) => ids.includes(x.id) && fn(x));
      d.lyricsTimed = markTimed(d.lyricsTimed, d.lyricsTimed && d.lyricsTimed.by === 'auto' ? 'auto' : 'manual');
    });
    const song = p.song;
    const player = song && media.get(song.mediaId)
      ? {
          play(from) {
            const at = songToTimeline(from, store.get().song);
            if (at > store.get().duration - 0.2) return toast('That line is past the end of this edit.', 'error'), false;
            engine.seek(Math.max(0, at));
            engine.play();
            return true;
          },
          stop: () => engine.pause(),
          now: () => timelineToSong(engine.t, store.get().song),
          playing: () => engine.playing,
        }
      : null;
    // the waveform under the words: the song or one of the song's stems, saved on your song (Songs & releases);
    // the peaks come with the library record, so no file is opened to draw them
    const sc = ui.songContext ? ui.songContext() : null;
    const mSong = sc && sc.song;
    const songId = song ? song.mediaId : null;
    const wave = mSong ? resolveWave(mSong, (id) => media.peek(id), { songId }) : { id: songId, label: 'Song', note: '' };
    const rec = wave.id && media.peek(wave.id);
    const peaks = rec && rec.peaks ? { data: rec.peaks, perSec: rec.peaksPerSec, label: wave.label, id: wave.id } : null;
    const isStem = !!(mSong && wave.id && wave.id !== songId);
    const hear = isStem && !!wordUI.hear;
    const source = mSong
      ? {
          choices: waveChoices(mSong, (id) => media.peek(id)),
          value: wave.value,
          note: wave.note,
          onPick: (v) => ui.saveSongWave && ui.saveSongWave(v) && ui.refreshPanels(true),
          hear,
          onHear: isStem ? (v) => ((wordUI.hear = v), ui.refreshPanels(true)) : null,
        }
      : null;
    // Hear this stem: the stem plays on its own in song time (opened the first time Play is pressed)
    const linePlayer = hear ? filePlayer(wave.id, (id) => ensureLoaded(id).then((r) => (r && r.url) || null)) : player;
    const hand = handTimedCount(lines);
    const stale = lines.filter(wordsStale);
    const anim = p.lyricStyle.animation;
    const shows = (p.lyricStyle.display || 'line') !== 'line' || anim === 'karaoke' || anim === 'words' || anim === 'buildhold' || p.lyrics.some((l) => (l.emph && l.emph.slam) || (l.style && l.style.animation === 'buildhold'));
    return section(
      '4 · Word timing',
      h('p', { class: 'muted tiny' }, 'When each word of a line lights up in the Word by word and Karaoke looks. Drag a word’s edge or the word itself; it saves on the song with the line times.'),
      shows ? null : h('p', { class: 'muted tiny' }, 'Your lyric look shows whole lines. Pick Word by word or Karaoke under Lyric style to see the words timed.'),
      h('div', { class: 'row wt-pick' }, iconButton('arrowLeft', 'Previous line', () => lines[i - 1] && selectLyric(lines[i - 1]), 'ghost'), pick, iconButton('arrowRight', 'Next line', () => lines[i + 1] && selectLyric(lines[i + 1]), 'ghost')),
      wordTimingEditor({ line, commit: (fn) => edit([line.id], fn), player: linePlayer, peaks, source, fps: 30, state: wordUI }),
      h('p', { class: 'small', 'data-k': 'wt-count' }, `Word timing: ${hand} line${hand === 1 ? '' : 's'} hand-timed`,
        hand ? [' ', button('Clear all', () => confirm(`Clear the word timing you set on ${hand} line${hand === 1 ? '' : 's'}? Lines with Auto-sync word times go back to them, the rest spread evenly.`) && edit(lines.filter((l) => l.wordsBy === 'hand').map((l) => l.id), clearHandWords), { variant: 'sm ghost' })] : null),
      stale.length
        ? h('p', { class: 'warn-note small', 'data-k': 'wt-stale-all' }, `${stale.length} line${stale.length === 1 ? '’s' : 's’'} words changed since they were timed. `,
            button('Re-spread them', () => edit(stale.map((l) => l.id), (x) => {
              delete x.wordsAuto;
              clearHandWords(x);
            }), { variant: 'sm' }))
        : null,
    );
  }

  async function importLRC() {
    const [f] = await pickFiles('.lrc,.txt', false);
    if (!f) return;
    const text = await f.text();
    const parsed = parseLRC(text);
    if (!parsed.length) {
      store.update((d) => ((d.lyrics = linesFromText(text, timelineToSong(0, d.song) + 0.5)), (d.lyricsTimed = null)));
      toast('No timestamps found, so the lines were imported untimed. Tap-sync them next.');
    } else {
      store.update((d) => ((d.lyrics = parsed), (d.lyricsTimed = markTimed(d.lyricsTimed, 'file', ''))));
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
    store.update((d) => {
      d.lyrics.forEach((l) => delete l.open);
      d.lyricsTimed = markTimed(d.lyricsTimed, 'tap');
    });
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
  /** Song part: which part of your song the video is of, and a button to change it (panel-songpart.js). */
  function songPartBlock() {
    const ctx = ui.songTemplateContext ? ui.songTemplateContext() : null;
    if (!ctx || !ctx.song || !ctx.audio || !store.get().song) return null;
    const sum = ui.songPartSummary ? ui.songPartSummary() : '';
    return h(
      'div',
      { class: 'songpart-block', 'data-songpart': '' },
      h('div', { class: 'songpart-block-text' }, h('strong', { class: 'small' }, 'Song part'), h('span', { class: 'muted tiny', 'data-songpart-sum': '' }, sum || 'Entire song, one section, several sections or a range')),
      button(sum ? 'Change' : 'Choose the part', () => ui.openSongPart(), { iconName: 'scissors', variant: sum ? 'sm' : 'sm primary', title: 'Make the video of the entire song, one section, several sections or a custom range: the song, music video, lyrics and captions follow' }),
    );
  }
  function buildAudio(b) {
    const p = store.get();
    // only your songs (Songs & releases) are offered as the song; stems and other audio stay in the library
    const sc = ui.songContext ? ui.songContext() : null;
    const yours = sc ? sc.songs : [];
    const curRec = p.song && media.get(p.song.mediaId);
    const curIsSong = curRec && yours.some((s) => s.mediaId === curRec.id);
    const songSel = h(
      'select',
      { 'aria-label': 'Song', 'data-k': 'song-pick' },
      h('option', { value: '' }, yours.length ? '— choose your song —' : '— no songs with a song file yet —'),
      yours.map((s) => h('option', { value: `song:${s.id}`, selected: !!(curRec && curRec.id === s.mediaId && (!p.managerSongId || p.managerSongId === s.id)) }, s.title)),
      curRec && !curIsSong ? h('option', { value: `file:${curRec.id}`, selected: true }, `${curRec.name} (not one of your songs)`) : null,
    );
    songSel.addEventListener('change', () => {
      const v = songSel.value;
      if (v.startsWith('song:')) ui.chooseSong(v.slice(5));
      else if (!v) store.update((d) => (d.song = null));
      ui.refreshPanels(true);
      // then: which part of the song is the video of?
      if (v.startsWith('song:') && ui.openSongPart && store.get().song) setTimeout(() => ui.openSongPart(), 0);
    });
    const songHint = yours.length
      ? 'Your songs from Songs & releases. To use another audio file, press “Use as song” on it in the media library.'
      : 'Give a song its song file on its Overview in Songs & releases (or press “Use as song” on a file in the media library).';
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
        // the stretch the video uses (each part, when it plays several: Song part)
        const spans = hasSongParts(pr.song) ? pr.song.parts.map((q) => [q.from, q.to]) : [[pr.song.offset, Math.min(dur, pr.song.offset + pr.duration)]];
        for (const [a, z] of spans) {
          const x0 = (a / dur) * W;
          const x1 = (z / dur) * W;
          g.fillStyle = 'rgba(110,231,160,.22)';
          g.fillRect(x0, 0, x1 - x0, H);
          g.strokeStyle = 'rgba(110,231,160,.95)';
          g.lineWidth = 2;
          g.strokeRect(x0 + 1, 1, x1 - x0 - 2, H - 2);
        }
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
        h('div', { class: 'row' }, button(p.beats ? 'Detect BPM again' : 'Detect BPM', bpm, { iconName: 'activity', variant: 'ghost' }), p.beats ? button('Clear beats', () => store.update((d) => (d.beats = null)), { variant: 'ghost sm' }) : null),
      );
      b._reg((pp) => {
        if (pp.song && hasSongParts(pp.song)) b._label.textContent = `Using ${pp.song.parts.map((q) => `${formatTime(q.from)} – ${formatTime(q.to)}`).join(', ')} of ${formatTime(rec.duration)} (Song part; changing the start below goes back to one stretch)`;
        else if (pp.song) b._label.textContent = `Using ${formatTime(pp.song.offset)} – ${formatTime(Math.min(rec.duration, pp.song.offset + pp.duration))} of ${formatTime(rec.duration)}`;
      });
    }

    const tracks = h('div', { class: 'list' });
    p.audioTracks.forEach((a, i) => {
      const r = media.get(a.mediaId);
      tracks.append(
        h(
          'div',
          { class: 'list-row' },
          h('button', { type: 'button', class: 'link', onclick: () => ui.select({ type: 'audio', id: a.id }) }, `Audio ${i + 1}: ${r ? r.name : media.missingLabel(a.mediaId, 'audio').replace('Missing ', 'missing ')}`),
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
      section('Song', field('Track', songSel, songHint), yours.length || curRec ? null : button('Upload a song file', async () => importFiles(await pickFiles('audio/*', false)), { iconName: 'upload', variant: 'primary' }), songPartBlock(), songBlock),
      section(
        'Tempo',
        h('p', { class: 'muted small' }, 'Beat effects, beat-synced cuts, the beat markers on the ruler and the drum and game beat lines follow this tempo. Effects can have their own: look for “Tempo” in their settings.'),
        tempoControl(b, { store, engine, ui }, projectTarget(), { title: 'Project tempo' }),
      ),
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
      captionsSection(),
      p.texts.length ? section('On this video', list) : null,
      section('Your fonts', buildFonts()),
    );
  }

  // ---------------------------------------------------------------- SOUND SYNC (video clips)
  /**
   * The clip's own sound under the song's, around the playhead: drag to slide the video against the song,
   * nudge by a frame or more, or line it up by listening. Changes the clip's in-point (where in the file it plays from).
   */
  function soundSyncSection(b, sel, rec, c) {
    const p = store.get();
    const song = p.song && media.get(p.song.mediaId);
    const startOf = (pp) => {
      const x = findClip(pp, sel.id);
      if (!x.clip) return 0;
      return x.layer ? x.clip.start : (layoutClips(pp.clips).find((l) => l.clip.id === sel.id) || { start: 0 }).start;
    };
    const state = videoWaveform(rec, () => ui.refreshPanels(true));
    if (state === 'pending') return section('Sound sync', h('p', { class: 'muted small' }, 'Reading the video’s sound…'));
    if (state === 'none') return section('Sound sync', h('p', { class: 'muted small' }, 'This video has no sound, so there’s nothing to line up. Drag the clip on the timeline to place it by eye.'));
    if (!song) return section('Sound sync', h('p', { class: 'muted small' }, 'Choose the song (Audio tab) to line this video’s sound up with it.'));
    const W = 600;
    const H = 96;
    const span = 3; // seconds either side of the playhead
    const cv = h('canvas', { class: 'sync-view', width: W, height: H, 'aria-label': 'The song’s waveform (top) and the video’s (bottom) around the playhead. Drag sideways to slide the video against the song.' });
    const draw = () => {
      const pp = store.get();
      const x = findClip(pp, sel.id).clip;
      if (!x) return;
      const g = cv.getContext('2d');
      g.clearRect(0, 0, W, H);
      const t0 = engine.t - span;
      const songAt = (t) => timelineToSong(t, pp.song);
      const start = startOf(pp);
      const vidAt = (t) => (x.in || 0) + (t - start) * (x.speed || 1);
      const lane = (r, timeAt, y, hh, col, from, to) => {
        if (!r.peaks) return;
        g.fillStyle = col;
        const per = r.peaksPerSec;
        const bins = r.peaks.length / 2;
        for (let px = 0; px < W; px++) {
          const t = t0 + (px / W) * span * 2;
          if (t < from || t > to) continue;
          const a = timeAt(t);
          const bn = Math.floor(a * per);
          const bEnd = Math.max(bn, Math.floor(timeAt(t + (span * 2) / W) * per));
          let lo = 0;
          let hi = 0;
          for (let k = bn; k <= bEnd; k++) {
            if (k < 0 || k >= bins) continue;
            lo = Math.min(lo, r.peaks[k * 2]);
            hi = Math.max(hi, r.peaks[k * 2 + 1]);
          }
          g.fillRect(px, y + hh / 2 - hi * hh * 0.48, 1, Math.max(1, (hi - lo) * hh * 0.48));
        }
      };
      lane(song, songAt, 2, H / 2 - 4, 'rgba(110,231,160,.9)', -Infinity, Infinity);
      lane(rec, vidAt, H / 2 + 2, H / 2 - 4, 'rgba(255,214,102,.9)', start, start + x.duration);
      // beat lines from the song, and the playhead
      if (pp.beats) {
        g.fillStyle = 'rgba(255,255,255,.14)';
        for (const bt of pp.beats.beats) {
          const tt = songToTimeline(bt, pp.song);
          if (tt >= t0 && tt <= t0 + span * 2) g.fillRect(((tt - t0) / (span * 2)) * W, 0, 1, H);
        }
      }
      g.fillStyle = 'rgba(255,255,255,.8)';
      g.fillRect(W / 2, 0, 1, H);
      g.fillStyle = 'rgba(255,255,255,.12)';
      g.fillRect(0, H / 2 - 0.5, W, 1);
    };
    b._reg(() => draw());
    // follow the playhead while the panel is open
    let lastT = null;
    const tick = () => {
      if (lastT !== null && !cv.isConnected) return;
      if (engine.t !== lastT) (lastT = engine.t), draw();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // where the clip and the song are now: the base a nudge or a whole drag is measured from
    const placeFrom = (pp = store.get()) => {
      const f = findClip(pp, sel.id);
      return { in: f.clip.in || 0, duration: f.clip.duration, speed: f.clip.speed || 1, start: startOf(pp), layer: !!f.layer, songOffset: songOffsetAt(startOf(pp), pp.song), songLen: song.duration, fileLen: rec.duration };
    };
    // move the in-point (and, when it has to, the clip's length, an overlay's start or the song's start: see clipplace.js)
    const place = (r, key = `sync:${sel.id}`) => {
      store.update((d) => {
        const x = findClip(d, sel.id).clip;
        if (!x) return;
        x.in = r.in;
        x.duration = r.duration;
        if (findClip(d, sel.id).layer) x.start = r.start;
        if (d.song && !hasSongParts(d.song)) d.song.offset = r.songOffset; // several song parts: the song's start stays
      }, key);
      return r;
    };
    const setIn = (fn, from = placeFrom()) => place(placeIn(fn(from), from));
    const showInfo = () => {
      const pp = store.get();
      info.textContent = describeSyncPoint(syncPoint(findClip(pp, sel.id).clip, startOf(pp), songOffsetAt(startOf(pp), pp.song)));
    };
    // drag: moving right makes the video's sound later against the song (an earlier in-point)
    let drag = null;
    cv.addEventListener('pointerdown', (e) => {
      try {
        cv.setPointerCapture(e.pointerId);
      } catch {
        /* a pointer the browser doesn't track (synthetic): drag without capture */
      }
      drag = { x: e.clientX, from: placeFrom(), w: cv.getBoundingClientRect().width, note: '', key: `syncdrag:${sel.id}:${e.timeStamp}` };
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dt = ((e.clientX - drag.x) / drag.w) * span * 2;
      drag.note = place(placeIn(drag.from.in - dt, drag.from), drag.key).note;
      draw();
      showInfo();
    });
    const end = () => {
      if (drag && drag.note) toast(drag.note, 'info', 6000);
      drag = null;
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    const x0 = findClip(p, sel.id).clip;
    const point = syncPoint(x0, startOf(p), songOffsetAt(startOf(p), p.song));
    const info = h('p', { class: 'small', 'data-k': 'sync-info' }, describeSyncPoint(point));
    const fps = 30;
    const nudge = (sec) => {
      const r = setIn((f) => f.in + sec);
      if (r.note) toast(r.note, 'info', 6000);
    };
    const auto = () => {
      const pp = store.get();
      const r = autoLineUp(song, rec, findClip(pp, sel.id).clip, startOf(pp), songOffsetAt(startOf(pp), pp.song));
      if (r.error) return toast(r.error, 'error', 5000);
      const moved = place(placeOnPoint(r.point, placeFrom(pp)));
      toast(`${describeSyncPoint(r.point)} ${r.sure === 'sure' ? 'A clear match.' : r.sure === 'likely' ? 'A likely match: play it to check.' : 'No clear match: play it, and nudge or drag if it’s off.'}${moved.note ? ` ${moved.note}` : ''} Undo (Ctrl+Z) to go back.`, r.sure === 'unsure' ? 'error' : 'info', 8000);
      ui.refreshPanels(true);
    };
    // the plain way in: does the video start before the song (an intro) or partway into it, and by how much
    const dirNow = pointToDirection(point);
    const dirSel = h('select', { 'data-k': 'sync-dir', 'aria-label': 'Which starts first', style: { flex: '1 1 12em', width: 'auto', minWidth: '0' } },
      h('option', { value: 'before' }, 'Video starts before the song'),
      h('option', { value: 'after' }, 'Video starts after the song'),
      h('option', { value: 'together' }, 'They start together'));
    dirSel.value = dirNow.dir;
    const secIn = h('input', { type: 'number', class: 'num', min: 0, step: 0.01, value: dirNow.sec, 'data-k': 'sync-sec', 'aria-label': 'By how many seconds', style: { width: '5.5em', flex: '0 0 auto' } });
    secIn.disabled = dirNow.dir === 'together';
    const applyDir = () => {
      secIn.disabled = dirSel.value === 'together';
      const sec = Math.abs(parseFloat(secIn.value) || 0);
      const r = place(placeOnPoint(directionToPoint(dirSel.value, sec), placeFrom()), `syncdir:${sel.id}`);
      if (r.note) toast(r.note, 'info', 6000);
      showInfo();
    };
    dirSel.addEventListener('change', applyDir);
    secIn.addEventListener('change', applyDir);
    b._reg(() => {
      const pp = store.get();
      const x = findClip(pp, sel.id).clip;
      if (!x || document.activeElement === secIn || document.activeElement === dirSel) return;
      const now = pointToDirection(syncPoint(x, startOf(pp), songOffsetAt(startOf(pp), pp.song)));
      if (info) info.textContent = describeSyncPoint(syncPoint(x, startOf(pp), songOffsetAt(startOf(pp), pp.song)));
      dirSel.value = now.dir;
      secIn.value = now.sec;
      secIn.disabled = now.dir === 'together';
    });
    // the song's own music video (matched by its file, however it got into the edit): its sync is kept on the song
    // and saved by itself shortly after each change here (see songSync in app.js)
    const mv = ui.songSync ? ui.songSync.video() : null;
    const isMv = !!(mv && mv.mvId === rec.id);
    const saveMv = (replace) => {
      const pp = store.get();
      const pt = syncPoint(findClip(pp, sel.id).clip, startOf(pp), songOffsetAt(startOf(pp), pp.song));
      ui.songSync.saveVideo(pt, { replace });
    };
    const mvNow = isMv ? syncPoint(x0, startOf(p), songOffsetAt(startOf(p), p.song)) : 0;
    const mvState = !isMv
      ? null
      : h(
          'div',
          { class: 'sync-saved', 'data-k': 'mv-sync-saved' },
          h('p', { class: 'small' }, mv.saved
            ? `Saved on “${mv.song.title}”: ${describeSyncPoint(mv.saved.offset)}${mv.saved.savedAt ? ` (${savedOn(mv.saved.savedAt)})` : ''}${sameVideoSync(mv.saved.offset, mvNow) ? '' : ' This clip is placed differently.'}`
            : `This is “${mv.song.title}”’s music video. Line it up and the sync is saved on the song by itself, for templates, section exports and new clips of it.`),
          mv.conflict ? h('p', { class: 'warn-note small' }, 'The song already had a different sync, so it was kept. Save to replace it.') : null,
          h('div', { class: 'row wrap' },
            button(`Save as “${mv.song.title}”’s music video sync`, () => saveMv(true), { variant: mv.conflict ? 'sm primary' : 'sm', title: 'Save where this clip is lined up on the song now (replacing what it had). Templates and section exports use it.' }),
            mv.saved && !sameVideoSync(mv.saved.offset, mvNow) ? button('Use the saved sync', () => { const r = place(placeOnPoint(mv.saved.offset, placeFrom())); if (r.note) toast(r.note, 'info', 6000); }, { variant: 'sm', title: 'Put this clip on the sync saved on the song' }) : null,
          ),
        );
    const hear = h('input', { type: 'checkbox', checked: (x0.volume || 0) > 0 });
    hear.addEventListener('change', () => store.update(c((x) => (x.volume = hear.checked ? 1 : 0))));
    return section(
      'Sound sync',
      h('p', { class: 'muted small', 'data-k': 'sync-how' }, 'To line a music video up with the song, say which starts first. If the video has an intro before the song comes in, pick “Video starts before the song” and how long the intro is: the clip plays from that far into the video. If the video begins partway into the song, pick “after” and how far in: the clip plays from the video’s start and the song plays from that far in. Then fine-tune by ear.'),
      h('div', { class: 'row wrap sync-dir' }, dirSel, h('span', { class: 'row', style: { flex: '0 0 auto', gap: '6px', alignItems: 'center', flexWrap: 'nowrap' } }, h('span', { class: 'muted small' }, 'by'), secIn, h('span', { class: 'muted small' }, 's'))),
      h('p', { class: 'muted small' }, 'The song (green) over this video’s own sound (gold), 3 seconds either side of the playhead. Drag sideways to slide the video until the hits line up, or nudge it.'),
      cv,
      h('div', { class: 'sync-legend' }, h('span', {}, h('i', { style: { background: 'rgba(110,231,160,.9)' } }), 'Song'), h('span', {}, h('i', { style: { background: 'rgba(255,214,102,.9)' } }), 'This video'), h('span', {}, 'White line: the playhead')),
      info,
      h('div', { class: 'row wrap' },
        h('span', { class: 'muted small' }, 'Video'),
        ...[[-0.5, '−0.5 s'], [-0.1, '−0.1 s'], [-1 / fps, '−1 frame'], [1 / fps, '+1 frame'], [0.1, '+0.1 s'], [0.5, '+0.5 s']].map(([sec, label]) => button(label, () => nudge(-sec), { variant: 'sm', title: sec < 0 ? 'The video plays earlier against the song' : 'The video plays later against the song' })),
      ),
      h('div', { class: 'row wrap' },
        button('Line it up by listening', auto, { iconName: 'activity', variant: 'sm primary', title: 'Compare the video’s sound with the song and set where it plays from' }),
      ),
      mvState,
      h('p', { class: 'muted small', 'data-k': 'sync-saved-how' }, 'A song’s saved music video sync (Manager → the song → Files) is the same number: “before the song by 12 s” saves as “the song’s 0:00 is 12 s into the video”. Templates, section exports and new clips of it start the music video there.'),
      isMv && point < -0.005 ? h('p', { class: 'warn-note small', 'data-k': 'sync-after-note' }, 'A saved sync can’t hold a video that starts after the song yet: saving this one keeps “they start together”.') : null,
      h('label', { class: 'toggle' }, hear, h('span', {}, 'Play the video’s own sound too (to check by ear)')),
    );
  }

  // ---------------------------------------------------------------- CAPTIONS
  const captionUI = { style: 'bold' };
  /** Captions on the video (import a caption file, or make them from the lyrics), and caption files out. */
  function captionsSection() {
    const p = store.get();
    const caps = p.texts.filter((t) => t.caption);
    const style = caps[0] ? caps[0].captionStyle || captionUI.style : captionUI.style;
    const y = captionY(p.layout && p.layout !== 'full' ? AREAS_FOR(p.layout) : null);
    const put = (cues, what) => {
      if (!cues.length) return toast(`No ${what} to make captions from.`, 'error');
      if (caps.length && !confirm(`Replace the ${caps.length} caption${caps.length === 1 ? '' : 's'} on the video?`)) return;
      store.update((d) => setCaptions(d, cues, { style, y }));
      toast(`${cues.length} caption${cues.length === 1 ? '' : 's'} on the video, on the Text row of the timeline. Undo (Ctrl+Z) to go back.`, 'info', 5000);
      ui.refreshPanels(true);
    };
    const importFile = async () => {
      const [f] = await pickFiles('.srt,.vtt,text/vtt,application/x-subrip', false);
      if (!f) return;
      const cues = parseSubtitles(await f.text());
      if (!cues.length) return toast(`No captions found in ${f.name}. It should be an .srt or .vtt file.`, 'error', 5000);
      put(cues, 'captions');
      if (cues[cues.length - 1].start > store.get().duration) toast(`Some captions start after the video ends (${formatTime(store.get().duration, false)}). Shift them, or make the video longer.`, 'info', 6000);
    };
    const fromLyrics = () => {
      // the lyrics become captions, and the lyric line is hidden so they don't show twice
      const cues = videoCues(p, { which: 'lyrics' });
      put(cues, 'lyrics in the video');
      if (cues.length) store.update((d) => (d.layerVis = { ...(d.layerVis || {}), lyrics: false }));
    };
    const save = (kind, which) => {
      const cues = videoCues(store.get(), { which });
      if (!cues.length) return toast(which === 'captions' ? 'No captions yet.' : 'No lyrics or captions play in this video.', 'error');
      const text = kind === 'srt' ? toSRT(cues) : toVTT(cues);
      download(new Blob([text], { type: kind === 'srt' ? 'application/x-subrip' : 'text/vtt' }), `${slug(p.name)}.${kind}`);
      toast(`${cues.length} captions saved. Upload the .${kind} with the video as closed captions.`, 'info', 5000);
    };
    const styles = h(
      'div',
      { class: 'chips', role: 'radiogroup', 'aria-label': 'Caption style' },
      CAPTION_STYLES.map(([id, label, hint]) =>
        button(label, () => {
          captionUI.style = id;
          if (caps.length) store.update((d) => styleCaptions(d, id));
          ui.refreshPanels(true);
        }, { variant: `chip${style === id ? ' on' : ''}`, title: hint }),
      ),
    );
    const hasLyrics = p.lyrics.length > 0;
    return section(
      'Captions',
      h('p', { class: 'muted small' }, 'Words on the video for people watching with the sound off. Import a caption file (.srt or .vtt) or make them from the lyrics; they land on the Text row, where you can drag and edit them.'),
      h('div', { class: 'lbl' }, 'Style'),
      styles,
      h('div', { class: 'row wrap' },
        button('Import .srt / .vtt', importFile, { iconName: 'upload', variant: 'sm' }),
        hasLyrics ? button('Captions from the lyrics', fromLyrics, { iconName: 'mic', variant: 'sm', title: 'Each lyric line as a caption, in time, styled as a caption (the lyric line is hidden so they don’t show twice)' }) : null,
        caps.length ? button(`Remove the ${caps.length} caption${caps.length === 1 ? '' : 's'}`, () => store.update((d) => (d.texts = d.texts.filter((t) => !t.caption))), { variant: 'sm ghost' }) : null,
      ),
      caps.length
        ? h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Shift all'), ...[-1, -0.1, 0.1, 1].map((sec) => button(`${sec > 0 ? '+' : '−'}${Math.abs(sec)}s`, () => store.update((d) => shiftCaptions(d, sec)), { variant: 'sm' })))
        : null,
      h('div', { class: 'lbl' }, 'Caption file to upload with the video'),
      h('p', { class: 'muted tiny' }, 'YouTube, Facebook and LinkedIn take an .srt file as closed captions; viewers can turn them on or off, and they help search. TikTok and Instagram make their own: turn on auto captions in the app.'),
      h('div', { class: 'row wrap' },
        button('Download .srt', () => save('srt', 'all'), { iconName: 'download', variant: 'sm' }),
        button('Download .vtt', () => save('vtt', 'all'), { iconName: 'download', variant: 'sm ghost' }),
      ),
      h('p', { class: 'muted tiny' }, hasLyrics || caps.length ? `Includes ${[hasLyrics ? 'the lyrics that play' : '', caps.length ? 'the captions' : ''].filter(Boolean).join(' and ')}, timed to this video.` : 'Add lyrics or captions first.'),
    );
  }

  // ---------------------------------------------------------------- END CARD
  function buildEndCard(b) {
    const e = (fn) => (d, v) => fn(d.endCard, v);
    // only the cover art of your songs, EPs and albums (Songs & releases), not every picture in the library
    const covers = ui.songCovers ? ui.songCovers() : [];
    const cur = store.get().endCard.coverMediaId;
    const curRec = cur && !covers.some((c) => c.mediaId === cur) ? media.get(cur) : null;
    const coverSel = h(
      'select',
      { 'aria-label': 'Cover art', 'data-k': 'ec-cover' },
      h('option', { value: '' }, covers.length ? '— no cover —' : '— no song covers yet —'),
      covers.map((c) => h('option', { value: c.mediaId }, c.label)),
      curRec ? h('option', { value: curRec.id }, `${curRec.name} (not a song’s cover)`) : null,
    );
    coverSel.addEventListener('change', () => store.update((d) => ((d.endCard.coverMediaId = coverSel.value || null), (d.endCard.coverBy = 'manual'))));
    const autoLbl = h('span', { class: 'muted tiny', 'data-k': 'ec-cover-auto' }, 'automatic');
    const useBtn = button('Use the song’s cover', () => ui.useSongCover && ui.useSongCover(), { variant: 'sm ghost' });
    useBtn.dataset.k = 'ec-cover-use';
    b._reg((p) => {
      coverSel.value = p.endCard.coverMediaId || '';
      const sc = ui.songCover ? ui.songCover() : null;
      autoLbl.hidden = !(p.endCard.coverBy === 'auto' && p.endCard.coverMediaId);
      useBtn.hidden = !sc || (p.endCard.coverBy === 'auto' && p.endCard.coverMediaId === sc);
    });
    const coverHint = covers.length
      ? 'The covers of your songs, EPs and albums in Songs & releases. Add or change one on a song’s Overview or an EP or album page.'
      : 'Cover art comes from your songs in Songs & releases: add one on a song’s Overview, or on an EP or album page. “Get info” from Spotify below also sets one.';
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
          if (coverRec) (d.endCard.coverMediaId = coverRec.id), (d.endCard.coverBy = 'manual');
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
        field('Cover art', h('div', { class: 'row wrap' }, coverSel, autoLbl, useBtn), coverHint),
        covers.length ? null : button('Upload cover art', async () => {
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
        fontField(b, 'Title font', (p) => p.endCard.font, e((o, v) => (o.font = v))),
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
        tempoControl(b, { store, engine, ui }, lookTempoTarget(), { title: 'Flash tempo', note: 'The flash follows the project tempo unless you set its own here. Beat text animations follow the project tempo (Audio tab).' }),
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
        b.select('Safe area guide (dashed box)', (p) => p.look.safeGuide || 'off', l((o, v) => (o.safeGuide = v)), SAFE_CHOICES),
        overlaySupported(store.get().aspect)
          ? h('p', { class: 'muted tiny' }, 'Ghost buttons show where each app puts its icons, caption and nav bar, so you can keep lyrics and text clear of them. Preview only, never exported. Shortcut: O cycles the apps.')
          : h('p', { class: 'warn-list' }, 'The phone preview is for 9:16 videos. Switch Format to 9:16 to see it.'),
      ),
      (() => {
        const ts = tipSettings();
        const cb = h('input', { type: 'checkbox', checked: !ts.off });
        cb.addEventListener('change', () => saveTipSettings({ ...tipSettings(), off: !cb.checked }));
        const reset = button('Show the hidden tips again', () => (saveTipSettings({ ...tipSettings(), never: [] }), toast('Hidden tips will show again'), ui.refreshPanels(true)), { variant: 'sm ghost' });
        return section(
          'Editing tips',
          h('label', { class: 'toggle' }, cb, h('span', {}, 'Pop up tips as I edit')),
          h('p', { class: 'muted tiny' }, 'Small cards at the bottom right of the preview suggest the next improvement when you add layers, clips, the song or lyrics.'),
          ts.never.length ? reset : null,
        );
      })(),
      section('Templates', h('p', { class: 'muted small' }, 'To reuse this look on your next release, save it as one of your templates.'), button('Save this edit as a template…', () => (setFold('start-mine', true), ui.openTab('start')), { iconName: 'star', variant: 'sm' })),
    );
  }

  /** On the Export tab for a Spotify Canvas: how it measures up and where to upload it. */
  function canvasExportNote(p) {
    const list = canvasIssues(p, { exportHeight: ASPECTS[p.aspect].h });
    return h(
      'div',
      { class: 'canvas-export' },
      h('p', { class: 'small' }, h('strong', {}, 'Spotify Canvas. '), 'Exports silent, as MP4 where this browser can (Spotify takes MP4 or JPG). Upload it in Spotify for Artists → Music → your track → Add Canvas.'),
      list.length ? h('ul', { class: 'warn-list' }, list.map((i) => h('li', { class: i.level }, i.text))) : h('p', { class: 'ok-text small' }, '✓ Fits Spotify’s Canvas rules.'),
    );
  }

  // ---------------------------------------------------------------- EXPORT
  const exportState = { running: false, progress: 0, result: null, error: '' };
  // an exported video describes the edit as it was: once the edit changes, the video is marked out of date
  const stampOf = (p) => JSON.stringify(p);
  const freshResult = () => (exportState.result && !exportState.result.stale && exportState.result.stamp === stampOf(store.get()) ? exportState.result : null);
  store.subscribe((p) => {
    const r = exportState.result;
    if (!r || r.stale || exportState.running || stampOf(p) === r.stamp) return;
    r.stale = true;
    if (ui.tab === 'export') ui.refreshPanels(true);
  });
  // what this browser will produce and what to do before exporting (phones: keep the screen on)
  function exportNote(p) {
    const a = exportAdvice({ ...exportEnv(resolveRange(p).length || p.duration, pickMimeType), fast: engine.exportMode !== 'realtime' });
    const wl = !!navigator.wakeLock;
    return h('ul', { class: `warn-list export-advice${a.phone || !a.format ? '' : ' calm'}`, role: 'note' }, a.lines.map((l) => h('li', {}, l)), a.phone ? h('li', {}, wl ? 'This browser can keep the screen awake for you while it exports.' : 'This browser cannot keep the screen awake by itself: turn off auto-lock for now.') : null);
  }
  /** The closed-caption cues of an exported video: only its part of the edit, starting at 0. */
  const rangeCues = (res) => {
    const p = store.get();
    const rg = (res && res.range) || resolveRange(p);
    return shiftCues(videoCues(p), rg.start, rg.end);
  };
  function buildExport(b) {
    const p = store.get();
    const mp4 = pickMimeType('mp4');
    const fmt = h('select', {}, mp4 && mp4.startsWith('video/mp4') ? h('option', { value: 'mp4' }, 'MP4 (best for Instagram & TikTok)') : null, h('option', { value: 'webm' }, 'WebM'));
    const quality = h('select', {}, h('option', { value: 6e6 }, 'Good · 6 Mbps'), h('option', { value: 10e6, selected: true }, 'High · 10 Mbps'), h('option', { value: 16e6 }, 'Max · 16 Mbps'));
    const fps = h('select', {}, h('option', { value: 30, selected: true }, '30 fps'), h('option', { value: 60 }, '60 fps'), h('option', { value: 24 }, '24 fps (film look)'));
    const fastMode = engine.exportMode !== 'realtime';
    const speed = h('select', { 'data-testid': 'export-speed' }, h('option', { value: 'fast', selected: fastMode }, 'Fast: frame by frame, can run in the background'), h('option', { value: 'realtime', selected: !fastMode }, 'Real-time: plays through once while it records'));
    speed.addEventListener('change', () => {
      settings.exportMode = speed.value;
      saveSettings(settings);
      engine.exportMode = speed.value;
      ui.refreshPanels(true);
    });
    // whether this browser can do the fast one for the chosen format (else it records in real time)
    const fastNote = h('p', { class: 'muted small', 'data-testid': 'fast-note', role: 'status' });
    // Mac app only: where the file goes and which codec. HEVC is offered once the encoder probe passes for this size.
    const streamOk = isDesktop && fastMode && !!(desktop.files && desktop.files.saveStream);
    const codecSel = h('select', { 'data-testid': 'export-codec', 'aria-label': 'Video codec' }, h('option', { value: 'h264' }, 'H.264 (plays everywhere)'), h('option', { value: 'hevc', selected: settings.exportCodec === 'hevc' }, 'HEVC (H.265): smaller file'));
    codecSel.addEventListener('change', () => ((settings.exportCodec = codecSel.value), saveSettings(settings)));
    const codecRow = h('div', { class: 'field-wrap' });
    codecRow.hidden = true;
    const checkCodec = () => {
      if (!streamOk) return;
      const { w: cw, h: ch } = ASPECTS[store.get().aspect];
      fastSupport('mp4', { w: cw, h: ch, fps: Number(fps.value), bitrate: Number(quality.value), audio: !isCanvas(store.get()), codec: 'hevc' }).then((r) => {
        codecRow.hidden = !(r.ok && fmt.value === 'mp4');
        codecRow.replaceChildren(r.ok ? field('Video codec', codecSel) : '');
      });
    };
    const checkFast = () => {
      checkCodec();
      if (!fastMode) return (fastNote.textContent = 'Plays the edit through once while it records, so it takes as long as the video. Keep this tab in front.');
      const { w: fw, h: fh } = ASPECTS[store.get().aspect];
      fastSupport(fmt.value, { w: fw, h: fh, fps: Number(fps.value), bitrate: Number(quality.value), audio: !isCanvas(store.get()) }).then((r) => {
        fastNote.classList.toggle('warn-list', !r.ok);
        fastNote.textContent = r.ok
          ? 'Draws each frame in turn, so it does not play through and often finishes sooner than the video lasts. You can switch to another workspace or browser tab while it works; closing this tab stops it.'
          : `Fast export is not available here: ${r.reason}. This export records in real time instead, so keep this tab in front.`;
      });
    };
    const monitor = h('input', { type: 'checkbox', checked: settings.monitorExport ?? true });
    monitor.addEventListener('change', () => ((settings.monitorExport = monitor.checked), saveSettings(settings)));
    const limiterToggle = h('label', { class: 'toggle', title: 'Keeps a loud song, clip sound and sound effects from distorting. The meter under the preview shows the level.' }, (() => {
      const cb = h('input', { type: 'checkbox', checked: settings.limiter !== false });
      cb.addEventListener('change', () => {
        settings.limiter = cb.checked;
        saveSettings(settings);
        engine.setLimiter(cb.checked);
      });
      return cb;
    })(), h('span', {}, 'Protect the sound from clipping (limiter)'));
    const { w, hgt } = { w: ASPECTS[p.aspect].w, hgt: ASPECTS[p.aspect].h };
    for (const sel of [fmt, quality, fps]) sel.addEventListener('change', checkFast);
    checkFast();

    const cv = isCanvas(p);
    const issues = [];
    if (!p.clips.length) issues.push('No video clips yet. The video will only show text on the background color.');
    if (!p.song && !cv) issues.push('No song chosen.');
    if (p.endCard.enabled && !p.endCard.coverMediaId) issues.push('End card has no cover art.');
    const contentLen = layoutClips(p.clips).reduce((m, l) => Math.max(m, l.end), 0);
    if (p.clips.length && contentLen < p.duration - (p.endCard.enabled && p.endCard.background !== 'video' ? p.endCard.duration : 0) - 0.05) issues.push(`Clips end at ${formatTime(contentLen)}; after that the background shows until ${formatTime(p.duration)}.`);

    const range = resolveRange(p);
    const start = async () => {
      const rg = resolveRange(store.get());
      if (rg.error) {
        exportState.error = rg.error;
        toast(rg.error, 'error');
        return ui.refreshPanels(true);
      }
      // a fast export can finish while you are elsewhere: ask once whether it may tell you
      if (engine.exportMode !== 'realtime' && window.Notification && Notification.permission === 'default' && (!navigator.userActivation || navigator.userActivation.isActive)) Promise.resolve(Notification.requestPermission()).catch(() => {});
      const awake = await keepAwake(); // phones: keep the screen on while it records (released below)
      exportState.running = true;
      exportState.progress = 0;
      if (exportState.result && exportState.result.url) URL.revokeObjectURL(exportState.result.url); // the older file's address is not needed any more
      exportState.result = null;
      exportState.error = '';
      ui.refreshPanels(true);
      try {
        const cutsReady = await ensureLayerAnalyses(store.get(), {
          // files the edit uses that are not open yet are opened first (usually they already are)
          onLoad: (n, total) => {
            const lbl = document.querySelector('.export-pct');
            if (lbl) lbl.textContent = n < total ? `Opening files ${n} of ${total}…` : '0%';
            ui.exportLabel && ui.exportLabel(n < total ? `Opening files ${n} of ${total}…` : '');
          },
        });
        if (cutsReady === false) toast('A background removal could not be prepared, so that clip exports with its original background.', 'error');
        const res = await exportVideo(engine, {
          format: fmt.value,
          bitrate: Number(quality.value),
          fps: Number(fps.value),
          monitor: monitor.checked,
          audio: !cv, // a Canvas is silent: Spotify plays the track under it
          // Mac app, fast MP4: straight to a file the person picks, in H.264 or HEVC
          ...(streamOk && fmt.value === 'mp4' && engine.exportMode !== 'realtime' ? { saveAs: `${slug(p.name)}-${cv ? 'spotify-canvas' : p.aspect.replace(':', 'x')}.mp4`, codec: codecSel.value } : {}),
          start: rg.start,
          end: rg.end,
          onFallback: (why) => toast(`Recording in real time: ${why}. Keep this tab in front.`, 'error', 7000),
          onPhase: (ph) => ui.exportLabel && ui.exportLabel(ph === 'sound' ? 'Mixing the sound…' : ''),
          onProgress: (f) => {
            exportState.progress = f;
            ui.exportProgress && ui.exportProgress(f);
            const bar = document.querySelector('.export-progress > div');
            if (bar) bar.style.width = `${Math.round(f * 100)}%`;
            const lbl = document.querySelector('.export-pct');
            if (lbl) lbl.textContent = `${Math.round(f * 100)}%`;
          },
        });
        const ext = res.mime.includes('mp4') ? 'mp4' : 'webm';
        exportState.result = { ...res, name: res.saved ? res.saved.name : `${slug(p.name)}-${cv ? 'spotify-canvas' : p.aspect.replace(':', 'x')}.${ext}`, url: res.blob ? URL.createObjectURL(res.blob) : null, stamp: stampOf(store.get()), range: rg, ratio: speedRatio(res.seconds, rg.length || p.duration) };
        toast('Export finished');
        ui.exportDone && ui.exportDone(exportState.result);
      } catch (e) {
        if (e.message !== 'cancelled') exportState.error = e.message || 'Export failed';
      }
      awake.release();
      exportState.running = false;
      ui.refreshPanels(true);
    };

    const credits = media
      .all()
      .filter((m) => m.attribution && (p.clips.some((c) => c.mediaId === m.id) || p.audioTracks.some((a) => a.mediaId === m.id) || (p.layers || []).some((l) => l.type === 'video' && l.clips.some((c) => c.mediaId === m.id))))
      .map((m) => `${m.attribution.providerLabel || PROVIDERS[m.attribution.provider]?.label || `${m.attribution.source || 'Openverse'} via Openverse`}: ${m.attribution.author} (${m.attribution.license}) ${m.attribution.pageUrl}`);
    const capPicker = captionPicker({ project: p, settings, kind: 'video', credits });

    return h(
      'div',
      {},
      exportRangePanel({ store, engine, ui, settings, saveSettings }),
      section(
        'Export video',
        h('p', { class: 'small' }, `${w}×${hgt} · ${formatTime(range.length)} long${range.whole ? '' : ` (of ${formatTime(p.duration)})`}.`),
        issues.length ? h('ul', { class: 'warn-list' }, issues.map((i) => h('li', {}, i))) : null,
        exportNote(p),
        cv ? canvasExportNote(p) : null,
        field('Export speed', speed),
        fastNote,
        field('Format', fmt),
        isDesktop ? codecRow : null,
        h('div', { class: 'grid2' }, field('Quality', quality), field('Frame rate', fps)),
        fastMode ? null : h('label', { class: 'toggle' }, monitor, h('span', {}, 'Play sound while exporting')),
        limiterToggle,
        exportState.running
          ? h('div', {}, h('div', { class: 'export-progress' }, h('div', { style: { width: `${Math.round(exportState.progress * 100)}%` } })), h('div', { class: 'row' }, h('span', { class: 'export-pct' }, `${Math.round(exportState.progress * 100)}%`), button('Cancel', () => exportVideo.cancel && exportVideo.cancel(), { variant: 'ghost sm' })))
          : button('Export video', start, { iconName: 'download', variant: 'primary big wide', disabled: !!range.error }),
        exportState.error ? h('p', { class: 'error-text' }, exportState.error) : null,
        exportState.result
          ? h(
              'div',
              { class: `result${freshResult() ? '' : ' stale'}` },
              freshResult() ? null : h('p', { class: 'warn-list stale-note', role: 'status' }, 'Out of date. You changed the edit after exporting this video, so it does not match any more. Export again to get the new version.'),
              exportState.result.saved ? null : h('video', { src: exportState.result.url, controls: true, playsInline: true }),
              exportState.result.seconds ? h('p', { class: 'muted tiny', 'data-testid': 'export-took' }, `${exportState.result.fast ? 'Fast export' : 'Recorded in real time'}: took ${Math.max(1, Math.round(exportState.result.seconds))} s, ${exportState.result.ratio} s per second of video.`) : null,
              exportState.result.saved
                ? h('div', {}, h('p', { class: 'small', 'data-testid': 'export-saved' }, `Saved to ${exportState.result.saved.path} (${(exportState.result.saved.bytes / 1e6).toFixed(1)} MB), written as it was made.`), h('p', { class: 'muted tiny', 'data-testid': 'export-codec-used' }, `Video codec used: ${codecLabel(exportState.result.codec)}.`), exportState.result.saved.reveal ? button('Show in Finder', () => exportState.result.saved.reveal(), { variant: 'sm' }) : null)
                : h('a', { class: `btn wide${freshResult() ? ' primary' : ' ghost'}`, href: exportState.result.url, download: exportState.result.name }, icon('download', 16), h('span', {}, `${freshResult() ? 'Download' : 'Download the old version of'} ${exportState.result.name} (${(exportState.result.blob.size / 1e6).toFixed(1)} MB)`)),
              !cv && rangeCues(exportState.result).length
                ? h('div', { class: 'row' }, h('span', { class: 'muted tiny' }, 'Closed captions for it:'), button('.srt', () => download(new Blob([toSRT(rangeCues(exportState.result))], { type: 'application/x-subrip' }), exportState.result.name.replace(/\.\w+$/, '.srt')), { iconName: 'download', variant: 'sm ghost', title: 'The lyrics and captions in this video, to upload with it (YouTube, Facebook, LinkedIn)' }), button('.vtt', () => download(new Blob([toVTT(rangeCues(exportState.result))], { type: 'text/vtt' }), exportState.result.name.replace(/\.\w+$/, '.vtt')), { variant: 'sm ghost' }))
                : null,
              exportState.result.mime.includes('webm') ? h('p', { class: cv ? 'warn-list' : 'muted tiny' }, cv ? 'This browser saved WebM, but Spotify only takes MP4 for a Canvas. Export it again in Chrome or Edge, which save MP4.' : 'WebM uploads fine to YouTube. Instagram prefers MP4, which Chrome and Edge can export.') : null,
            )
          : null,
      ),
      ui.sectionsPanel ? ui.sectionsPanel() : null,
      section('Project file', h('p', { class: 'muted small' }, 'Keep the edit as a file, to move it to another computer or go back to it later.'), h('div', { class: 'row' }, button('Save project file', () => ui.saveProjectFile(), { iconName: 'download', variant: 'sm' }))),
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
    const res = freshResult();
    const file = res && res.blob ? new File([res.blob], res.name, { type: res.blob.type }) : null;
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
      !res ? h('p', { class: 'muted tiny' }, exportState.result ? 'Export the video again first: the last one is out of date.' : 'Export the video first.') : !shareOk ? h('p', { class: 'muted tiny' }, 'This browser cannot share files. Open the site on your phone (it must be on https, e.g. GitHub Pages), or download and upload in the app.') : null,
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

    // Mac app: Google blocks its sign-in inside apps like this one, so the upload stays in the web version
    const ytShown = isDesktop ? h('div', { class: 'share-box' }, h('div', { class: 'share-head' }, icon('youtube', 18), h('strong', {}, 'YouTube Shorts')), h('p', { class: 'muted small', 'data-desktop-off': 'youtube' }, GOOGLE_SIGNIN_NOTE)) : yt;
    return section('Share', sheet, ytShown, others);
  }

  // ---------------------------------------------------------------- INSPECTOR
  // ---------------------------------------------------------------- per-line lyric look
  function lineLookSection(b, L, get, line) {
    const shared = () => store.get().lyricStyle;
    const cur = () => lineStyle(shared(), get() || line, store.get().theme);
    const st = line.style || {};
    // a change reaches every line with this look (lookapply.js); a slider drag keeps the lines it started with
    let drag = null;
    const groupIds = () => {
      const now = Date.now();
      if (!drag || now - drag.at > 700) drag = { ids: lookMembers(store.get().lyrics, line.id) };
      drag.at = now;
      return drag.ids;
    };
    const edit = (key) => (d, v) => changeLook(d, line.id, (s) => ({ ...(s || {}), [key]: v }), { ids: groupIds() });
    // a choice whose "off" value leaves no field behind (flash hit, ghost echo)
    const editOff = (key) => (d, v) => changeLook(d, line.id, (s) => {
      const n = { ...(s || {}) };
      // off over a shared style that has it on is kept as '' so this look stays off
      if (v || store.get().lyricStyle[key]) n[key] = v;
      else delete n[key];
      return n;
    }, { ids: groupIds() });
    // a preset on a shared-style line gives just that line the preset, as before; on a look, the whole look
    const setPreset = (id) => store.update((d) => changeLook(d, line.id, (s) => ({ ...(s && s.lookKey ? { lookKey: s.lookKey } : {}), preset: id }), { only: !hasLineStyle(line) }));
    const chips = h(
      'div',
      { class: 'chips', role: 'radiogroup', 'aria-label': 'Look for this line' },
      h('button', { type: 'button', role: 'radio', 'aria-checked': hasLineStyle(line) ? 'false' : 'true', class: `btn chip${hasLineStyle(line) ? '' : ' on'}`, onclick: () => store.update((d) => changeLook(d, line.id, () => undefined)) }, 'Same as the others'),
      LINE_PRESETS.map(([id, label, hint]) =>
        h('button', { type: 'button', role: 'radio', title: hint, 'aria-checked': st.preset === id ? 'true' : 'false', class: `btn chip${st.preset === id ? ' on' : ''}`, onclick: () => setPreset(id) }, label)),
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
      lookThemeBlock(b, store, line.id),
      // the look's own effect settings (every line with it); a line with no look moves with the whole song's
      (store.get().lyricStyle.display || 'line') !== 'line'
        ? null
        : hasLineStyle(line)
          ? lyricFxGroup(b, { store, engine, ui }, { style: cur(), holder: (p) => (p.lyrics.find((y) => y.id === line.id) || {}).style, look: { id: line.id, ids: groupIds } })
          : h('p', { class: 'muted tiny', 'data-k': 'lyricfx-look-none' }, 'This line uses the shared style, so its look moves with the whole song’s effect settings (Lyrics tab). Pick a look above to give its lines their own.'),
      hasLineStyle(line)
        ? h('div', {},
            fontField(b, 'Font', () => cur().font, edit('font')),
            b.range('Size', () => cur().size, edit('size'), { min: 2.5, max: 18, step: 0.1, fmt: (v) => Number(v).toFixed(1) }),
            h('div', { class: 'grid2' }, b.color('Text', () => cur().color, edit('color')), b.color('Highlight', () => cur().highlight, edit('highlight'))),
            h('div', { class: 'grid2' }, b.color('Outline', () => cur().outline, edit('outline')), b.range('Outline width', () => cur().outlineWidth || 0, edit('outlineWidth'), { min: 0, max: 2, step: 0.05, fmt: (v) => Number(v).toFixed(2) })),
            b.select('Entrance', () => cur().animation, edit('animation'), ANIMATIONS),
            b.select('Exit', () => cur().outAnimation || '', edit('outAnimation'), TEXT_EXITS),
            h('div', { class: 'grid2' }, b.select('Flash hit', () => cur().hit || '', editOff('hit'), HITS), b.select('Ghost echo', () => cur().echo || '', editOff('echo'), ECHOES)),
            h('div', { class: 'grid2' }, b.toggle('ALL CAPS', () => !!cur().uppercase, edit('uppercase')), b.toggle('Background box', () => !!cur().box, edit('box'))),
            cur().box ? b.color('Box color', () => cur().boxColor, edit('boxColor')) : null,
            h('p', { class: 'muted tiny' }, store.get().lyricStyle.display && store.get().lyricStyle.display !== 'line' ? 'In the lyric sheet, poster and tunnel displays this line keeps its font, colours and case; size and animation follow the display.' : 'Changes here reach every line with this look (see above).'),
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

  // the caption defaults the speech-captions box uses (the Captions section's style and place)
  const speechEnv = (sel) => ({
    media,
    store,
    target: () => clipTarget(store.get(), sel),
    style: () => ((store.get().texts.find((t) => t.caption) || {}).captionStyle || captionUI.style),
    y: () => captionY(store.get().layout && store.get().layout !== 'full' ? AREAS_FOR(store.get().layout) : null),
  });

  /** "Move to layer" for a clip on a video layer: every video layer, top first, and a new one (refused if it would land on a clip). */
  function moveToLayerField(id, ovl) {
    const V = videoLayers(store.get());
    const sel = h('select', { class: 'move-layer', 'aria-label': 'Move to layer' },
      [...V].reverse().map((L) => h('option', { value: L.id, selected: L.id === ovl.id }, L.name || 'Video layer')),
      h('option', { value: 'new' }, 'New layer (on top)'));
    sel.addEventListener('change', () => {
      const plan = planMoveTo(store.get(), [id], sel.value);
      if (plan.error) {
        toast(plan.error);
        sel.value = ovl.id;
        return;
      }
      if (plan.moves.length) store.update((d) => applyLayerMove(d, plan));
    });
    return field('Move to layer', sel, 'Clips on higher layers draw over the ones below.');
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
          ovl ? moveToLayerField(sel.id, ovl) : null,
          b.number('Length (s)', () => findClip(store.get(), sel.id).clip?.duration, c((x, v) => (x.duration = Math.min(v, maxClipDuration(x, rec ? rec.duration : Infinity)))), { min: 0.2, step: 0.1 }),
          isVideo ? b.number('Starts from (s into the file)', () => findClip(store.get(), sel.id).clip?.in, c((x, v) => ((x.in = Math.min(v, Math.max(0, (rec?.duration || 0) - 0.2))), (x.duration = +Math.min(x.duration, maxClipDuration(x, rec ? rec.duration : Infinity)).toFixed(3)))), { min: 0, step: 0.1 }) : null,
          isVideo ? b.select('Speed', () => String(findClip(store.get(), sel.id).clip?.speed || 1), c((x, v) => {
            const sp = parseFloat(v);
            x.duration = +(x.duration * (x.speed || 1) / sp).toFixed(3);
            x.speed = sp;
            x.duration = Math.min(x.duration, maxClipDuration(x, rec ? rec.duration : Infinity));
          }), [['0.25', '0.25× (very slow)'], ['0.5', '0.5× (slow-mo)'], ['0.75', '0.75×'], ['1', '1× normal'], ['1.5', '1.5×'], ['2', '2× (fast)'], ['4', '4×']]) : null,
          h('p', { class: 'muted tiny' }, isVideo ? `Up to ${maxDur.toFixed(1)}s available at this speed. Drag clip edges on the timeline to trim.` : 'Images can be any length.'),
        ),
        isVideo && rec ? soundSyncSection(b, sel, rec, c) : null,
        isVideo && rec ? qualitySection({ rec, clip, setStart: (v) => store.update((d) => c((x, vv) => (x.in = Math.max(0, vv)))(d, v)) }) : null,
        isVideo && rec ? section('Captions', speechCaptionsFor(sel, speechEnv(sel))) : null,
        section(
          'Frame',
          b.segmented('Fit', () => G().fit, c((x, v) => (x.fit = v)), [['cover', 'Fill'], ['contain', 'Fit'], ['blurfill', 'Fit + blur']]),
          kf.range(b, sel, 'zoom'),
          h('div', { class: 'grid2' }, kf.range(b, sel, 'posX'), kf.range(b, sel, 'posY')),
          h('div', { class: 'grid2' }, kf.range(b, sel, 'panX'), kf.range(b, sel, 'panY')),
          kf.range(b, sel, 'rotate'),
          b.toggle('Mirror', () => G().flip, c((x, v) => (x.flip = v))),
          h('p', { class: 'muted tiny' }, 'Zoom below 1× or move the picture to show a blurred copy behind it (picture-in-picture look). “Pan inside” moves the image within the frame when it is zoomed in.'),
          button('Reset framing', () => store.update(c((x) => Object.assign(x, { zoom: 1, posX: 0, posY: 0, panX: 0, panY: 0, rotate: 0, flip: false }))), { variant: 'ghost sm' }),
        ),
        isVideo && rec ? reframeSection({ store, media, G, rec }) : null,
        kf.animateSection(b, sel, { skip: ['posX', 'posY', 'zoom', 'panX', 'panY', 'rotate', 'grade.exposure', 'grade.contrast', 'grade.saturation'], title: 'Animate (keyframes)' }),
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
          ...['exposure', 'contrast', 'saturation'].map((k) => kf.range(b, sel, `grade.${k}`, { fmt: (v) => `${Math.round(v * 100)}%`, write: (x, v) => (x.grade = { ...(x.grade || {}), preset: 'custom', [k]: v }) })),
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
        exitSection(b, () => findClip(store.get(), sel.id).clip, c, ovl ? 'Plays at the end of this clip.' : 'Plays when this is the last clip, as the video ends or the end card starts. Between clips, the next clip’s transition in is used.'),
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
          h('p', { class: 'muted tiny' }, 'Beat effects follow the project tempo (Audio tab → Tempo); until one is set they use 120 BPM. This clip can have its own tempo below.'),
          ...['beatPulse', 'shake', 'rgb', 'flicker'].map((k) =>
            b.range(CLIP_EFFECTS[k], () => findClip(store.get(), sel.id).clip?.effects?.[k] || 0, c((x, v) => (x.effects = { ...(x.effects || {}), [k]: v })), { min: 0, max: 1, step: 0.01, fmt: (v) => (v ? `${Math.round(v * 100)}%` : 'Off') }),
          ),
          ...['vhs', 'strobe', 'invertBeat'].map((k) => b.toggle(CLIP_EFFECTS[k], () => findClip(store.get(), sel.id).clip?.effects?.[k], c((x, v) => (x.effects = { ...(x.effects || {}), [k]: v })))),
          tempoControl(b, { store, engine, ui }, clipTempoTarget(sel.id), { title: 'Beat tempo for this clip' }),
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
        kf.range(b, sel, 'y', { label: 'This line’s height', def: store.get().lyricStyle.y }),
        button('Use the shared height', () => store.update(L((x) => delete x.y)), { variant: 'ghost sm' }),
        lineLookSection(b, L, get, l),
        (p.lyricStyle.display || 'line') === 'line' ? section('Key words & side', lineAnimBlock(b, store, sel.id)) : null,
        (p.lyricStyle.display || 'line') === 'line'
          ? section('', lyricFxGroup(b, { store, engine, ui }, { style: lineStyle(p.lyricStyle, l, p.theme), holder: (d) => d.lyrics.find((y) => y.id === sel.id), line: true }))
          : null,
        kf.animateSection(b, sel, { skip: ['y'], write: { size: (x, v) => (x.style = { ...(x.style || {}), size: v }) }, defs: { x: store.get().lyricStyle.x ?? 50, size: (l.style && l.style.size) || store.get().lyricStyle.size } }),
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
        fontField(b, 'Font', () => get().font, T((x, v) => (x.font = v))),
        b.select('Entrance', () => get().animation, T((x, v) => (x.animation = v)), ANIMATIONS.filter(([k]) => k !== 'karaoke')),
        h('div', { class: 'grid2' },
          b.select('Exit', () => get().outAnimation || '', T((x, v) => (x.outAnimation = v)), TEXT_EXITS),
          b.range('Exit length', () => get().outDuration ?? 0.35, T((x, v) => (x.outDuration = v)), { min: 0.1, max: 1.5, step: 0.05, fmt: (v) => `${v.toFixed(2)}s` }),
        ),
        kf.range(b, sel, 'size', { label: 'Size', min: 2 }),
        kf.range(b, sel, 'x', { label: 'Left/right' }),
        kf.range(b, sel, 'y', { label: 'Up/down' }),
        h('div', { class: 'grid2' }, b.color('Text', () => get().color, T((x, v) => (x.color = v))), b.color('Outline', () => get().outline, T((x, v) => (x.outline = v)))),
        b.toggle('Background box', () => get().box, T((x, v) => (x.box = v))),
        h('div', { class: 'grid2' }, b.color('Box', () => get().boxColor, T((x, v) => (x.boxColor = v))), b.range('Box opacity', () => get().boxOpacity, T((x, v) => (x.boxOpacity = v)), { min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` })),
        kf.animateSection(b, sel, { skip: ['x', 'y', 'size'] }),
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
        rec ? section('Captions', speechCaptionsFor(sel, speechEnv(sel))) : null,
        button('Move to playhead', () => store.update(A((x) => (x.start = +engine.t.toFixed(2)))), { variant: 'sm' }),
        iconButton('trash', 'Delete audio track', () => ui.deleteSelection(), 'ghost danger'),
      );
    }
    if (sel.type === 'song') {
      return h('div', {}, h('div', { class: 'insp-title' }, icon('music', 16), h('span', {}, 'Song')), h('p', { class: 'small' }, 'Drag the song on the timeline to choose which part plays. Volume, fades, tempo and “Find the hook” are in the Audio tab.'));
    }
    if (sel.type === 'layer') {
      const L = findLayer(store.get(), sel.id);
      return h('div', {}, h('div', { class: 'insp-title' }, icon(L ? LAYER_TYPES[L.type].icon : 'layers', 16), h('span', {}, L ? L.name : 'Layer')), h('p', { class: 'small' }, 'This layer’s settings are in the panel on the left. Drag its block on the timeline to line it up with the song, or use the eye to hide it.'), h('div', { class: 'row' }, button('Open settings', () => ui.openTab('layers'), { iconName: 'settings', variant: 'sm primary' }), L && L.type !== 'video' ? button('Split at playhead', () => ui.split(), { iconName: 'scissors', variant: 'sm', title: 'Cut this layer in two at the playhead (S)' }) : null));
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
      b.number('Length (s)', (pp) => pp.duration, (d, v) => (d.duration = v), { min: 3, max: MAX_LENGTH, step: 0.5 }),
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
          [['Space', 'Play / pause'], ['← →', 'Step one frame (Shift: 1 s)'], ['S', 'Split at playhead (clip, text, lyric, audio or layer)'], ['E', 'Turn the selected items off / on (they stay on the timeline)'], ['O', 'Cycle phone app buttons'], ['Delete', 'Delete selected'], ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'], ['Ctrl+wheel', 'Zoom timeline'], ['Home / End', 'Jump to start / end']].map(([k, v]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, v)]),
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
