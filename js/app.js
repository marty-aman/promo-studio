// App shell: layout, wiring, keyboard shortcuts and autosave.
import { openSongPart, partSummary, templatePartPicker, templatePartChoice, templatePartPicked } from './panel-songpart.js';
import { editSignature } from './songpart.js';
import { ASPECTS, clipAt, layoutClips, splitClip, clamp, linesFromText, timelineToSong, songOffsetAt, uid, detectBeats, NEW_CHART_OFFSET } from './core.js';
import { gameParts, applySongTemplate, SONG_TEMPLATES } from './songtemplates.js';
import { syncLayer } from './layersync.js';
import { describeSyncPoint, inForSyncPoint } from './clipsync.js';
import { savedVideoSync, setVideoSync, sameVideoSync, savedTabSync, setTabSync, sameTabSync, syncPatch, tabSyncChanges, videoSyncChange, autoSyncDecision, describeTabSync } from './songsync.js';
import { createStore, newProject, loadProject, saveProject, FONTS, findClip, loadRecent, saveRecent, setSaveFailHandler } from './state.js';
import { splitItem, splitClipAt, duplicateItem, copyItem, pasteItem, safeRect, meterFill, meterHold } from './studioedit.js';
import { liveGroup, inGroup, rowOf, allItems, planMove, applyMove, deleteGroup, copyGroup, pasteGroup, duplicateGroup } from './multimove.js';
import { toggleOff, isOff, canTurnOff, OFF_KEY } from './itemoff.js';
import { makeProjectFile, parseProjectFile, projectFileName, pushRecent, hasContent } from './projectfile.js';
import { createVideoProjects } from './projects-video.js';
import { readProjects } from './projectlib.js';
import { media, restoreMedia, restoreMissing, fileKind, addMedia, kindOf, ensureLoaded, ensureMany, idsIn, releaseUnused, removeFiles } from './media.js';
import { biggestFiles } from './medialight.js';
import { storagePanel } from './storagepanel.js';
import { projectStore } from './projectstore.js';
import { configureRelink, refreshRelink, relinkButton, openRelink, missingFor } from './relink.js';
import { Engine, exportVideo } from './engine.js';
import { createTimeline } from './timeline.js';
import { setExportSide } from './panel-exportrange.js';
import { SLIDER_STEPS, zoomToSlider, sliderToZoom, anchorScroll } from './tlzoom.js';
import { createPanels } from './panels.js';
import { h, icon, iconButton, button, toast, setFold, Binder, download, tablistKeys } from './dom.js';
import { modeUrl } from './modeurl.js';
import { PLATFORM_OVERLAYS, overlaySupported } from './overlays.js';
import { buildInspirationPage } from './page-inspiration.js';
import { buildDrumConvertPage } from './page-drumconvert.js';
import { buildCarouselPage } from './page-carousel.js';
import { createPostCheck } from './panel-postcheck.js';
import { createTips } from './panel-tips.js';
import { kfTarget, kfSignature } from './panel-kf.js';
import { hitTest, boxOf, movable, positionAt, moveBy, constrain } from './previewdrag.js';
import { createManager } from './manager/shell.js';
import { initMobile } from './mobile.js';
import { photoStyle } from './manager/artists.js';
import { createPhotoStudio } from './photo/page.js';
import { sectionsExport } from './panel-sections.js';
import { coverOf, songCovers, autoCover } from './manager/releases.js';
import { requestDetect } from './manager/page-sections.js';
import { addPhotos as addArtistPhotos } from './manager/photos.js';
import { makeLayer, makeOverlayClip, setSongTabs } from './panel-layers.js';
import { studioSongFiles, studioSongContext, addStems, addTabs } from './manager/files.js';
import { applyTheme, themeById } from './themes.js';
import { loadSettings } from './state.js';
import { initPanes, panes, paneX } from './panes-ui.js';
import { createTimeReadout } from './timereadout.js';
import { findSong, titleFromFile, fetchLyrics } from './lyricsfetch.js';
import { findCover } from './manager/covers.js';
import { configureTodoAuto } from './manager/todoauto.js';
import { installDesktopPage, isDesktop, desktop } from './desktop.js';
import { songLyricsPlan, lyricsFromTiming, timingFromLyrics, autoSaveDecision, setSongTiming, keepTiming, retimeLines, timingStale, timingSourceOf, markTimed } from './manager/lyrictiming.js';

const store = createStore(loadProject() || newProject());
let manager = null; // the Manager workspace (created below)
let photo = null; // the Photo Studio (created below)
let tabPage = null; // Tab Studio, built each time its workspace opens
// The Tab Studio and what only it uses (about 120 KB) load the first time they are needed, not at start-up.
let tabModule = null;
const loadTabStudio = () => (tabModule ||= import('./page-tabstudio.js'));

// ------------------------------------------------------------ layout
const app = document.getElementById('app');
const canvas = h('canvas', { class: 'preview', 'aria-label': 'Video preview' });
const stageInner = h('div', { class: 'stage-inner' }, canvas);
const stage = h('div', { class: 'stage' }, stageInner);
const playBtn = h('button', { type: 'button', class: 'play-btn', 'aria-label': 'Play' }, icon('play', 22));
const loopBtn = iconButton('repeat', 'Loop playback', () => {
  engine.loop = !engine.loop;
  loopBtn.classList.toggle('on', engine.loop);
  loopBtn.setAttribute('aria-pressed', engine.loop ? 'true' : 'false');
});
const overlaySel = h(
  'select',
  { class: 'overlay-sel', 'aria-label': 'Preview with phone app buttons', title: 'Show where each app puts its buttons (preview only, press O to cycle)' },
  PLATFORM_OVERLAYS.map(([k, label]) => h('option', { value: k }, k === 'off' ? 'No app buttons' : `${label} buttons`)),
);
overlaySel.addEventListener('change', () => store.update((d) => (d.look.overlay = overlaySel.value)));
const cycleOverlay = () => {
  const ids = PLATFORM_OVERLAYS.map(([k]) => k);
  const cur = ids.indexOf(store.get().look.overlay || 'off');
  const next = ids[(cur + 1) % ids.length];
  store.update((d) => (d.look.overlay = next));
  toast(next === 'off' ? 'App buttons hidden' : `Showing ${PLATFORM_OVERLAYS.find(([k]) => k === next)[1]} buttons`);
};
const safeBtn = iconButton('layout', 'Safe area guide: where text stays clear of the apps’ buttons (G). Pick an app in the Look tab.', () => toggleSafe());
const toggleSafe = () => {
  const on = (store.get().look.safeGuide || 'off') !== 'off';
  store.update((d) => (d.look.safeGuide = on ? 'off' : 'all'));
  toast(on ? 'Safe area hidden' : 'Showing the safe area (preview only). Pick one app in the Look tab.');
};
// level meter: the mix before the limiter, so a red top means the limiter is working
const meterFillEl = h('i', {});
const meterEl = h('div', { class: 'meter', role: 'img', 'aria-label': 'Output level', title: 'Output level (the limiter holds the sound under 0 dB)' }, meterFillEl);
const timeReadout = createTimeReadout({ engine: { get t() { return engine.t; }, seek: (t) => engine.seek(t) }, store, toast });
const transport = h(
  'div',
  { class: 'transport' },
  iconButton('skipBack', 'Go to start (Home)', () => engine.seek(0)),
  playBtn,
  iconButton('skipFwd', 'Go to end (End)', () => engine.seek(store.get().duration)),
  timeReadout.el,
  loopBtn,
  h('label', { class: 'overlay-pick' }, icon('eye', 16), overlaySel),
  safeBtn,
  meterEl,
);
const tabRail = h('nav', { class: 'rail', 'aria-label': 'Tools' });
const leftPanel = h('aside', { class: 'panel left', 'aria-label': 'Tool settings' });
const inspector = h('aside', { class: 'panel right', 'aria-label': 'Selected item settings' });
const saveState = h('span', { class: 'save-state muted tiny' }, 'Saved in this browser');
const undoBtn = iconButton('undo', 'Undo (Ctrl+Z)', () => store.undo());
const redoBtn = iconButton('redo', 'Redo (Ctrl+Shift+Z)', () => store.redo());
const nameInput = h('input', { type: 'text', class: 'proj-name', 'aria-label': 'Project name' });
nameInput.addEventListener('input', () => store.update((d) => (d.name = nameInput.value), 'name'));
const aspectSel = h('select', { class: 'aspect', 'aria-label': 'Format' }, Object.entries(ASPECTS).map(([k, a]) => h('option', { value: k }, a.label)));
aspectSel.addEventListener('change', () => store.update((d) => (d.aspect = aspectSel.value)));

const postSlot = h('span');
// Manager | Video Studio: two workspaces in one app
const modeBtn = (id, label, ic) => h('button', { type: 'button', role: 'tab', class: 'mode-btn', 'data-mode': id, 'aria-controls': id === 'studio' ? null : `ws-${id}`, title: label, onclick: () => setMode(id) }, icon(ic, 16), h('span', {}, label));
const modeSwitch = h('div', { class: 'mode-switch', role: 'tablist', 'aria-label': 'Workspace' }, modeBtn('manager', 'Manager', 'users'), modeBtn('studio', 'Video Studio', 'film'), modeBtn('photo', 'Photo Studio', 'image'), modeBtn('tabstudio', 'Tab Studio', 'guitar'));
const studioOnly = (...els) => h('div', { class: 'studio-only' }, ...els);
// which artist this promo is for (from the Manager): its name, theme and logo go on the edit
const artistSel = h('select', { class: 'artist-sel', 'aria-label': 'Artist for this promo', title: 'Artist: the promo takes their name, theme and logo (set them in Manager → Press kit)' });
artistSel.addEventListener('change', () => applyArtist(artistSel.value));
// what you're working on: the band and the song, in both workspaces
const nowOn = h('button', { type: 'button', class: 'now-on', title: 'The band and song you are working on' });
const exportBtn = button('Export', () => ui.openTab('export'), { iconName: 'download', variant: 'primary' });
// the Panes menu (all workspaces): hide or show the side panes, focus mode (F), the default layout
const panesBtn = initPanes({ mode: () => mode, focusHosts: [stage] });
const header = h(
  'header',
  { class: 'topbar' },
  h('div', { class: 'brand' }, icon('disc', 22), h('span', {}, 'Band Manager')),
  modeSwitch,
  nowOn,
  studioOnly(nameInput, artistSel, aspectSel, undoBtn, redoBtn, saveState, relinkButton('studio')),
  h('div', { class: 'spacer' }),
  panesBtn,
  studioOnly(
    postSlot,
    button('Projects', () => ui.openProjects(), { iconName: 'file', variant: 'ghost', title: 'Your saved projects: open, rename, copy, recover an earlier version or use one as a template' }),
    button('New project', () => ui.newProject(), { variant: 'ghost', title: 'Start a blank edit. The current one is kept under Start → Earlier projects, and Ctrl+Z brings it back.' }),
    exportBtn,
  ),
);

const zoom = h('input', { type: 'range', min: 0, max: SLIDER_STEPS, step: 1, 'aria-label': 'Timeline zoom', title: 'Timeline zoom. All the way left fits the whole edit.' });
const snapBtn = iconButton('magnet', 'Snap to edges, playhead and beats', () => {
  ui.snap = !ui.snap;
  snapBtn.classList.toggle('on', ui.snap);
  snapBtn.setAttribute('aria-pressed', ui.snap ? 'true' : 'false');
});
const TL_HINT = 'Drag blocks to move · drag edges to trim · Shift+click or drag a box to select several · Ctrl+wheel to zoom · Shift+Z fits';
const tlHint = h('span', { class: 'muted tiny tl-hint' }, TL_HINT);
const selectBtn = button('Select', () => {
  ui.multiSelect = !ui.multiSelect;
  timeline.render();
}, { iconName: 'check', variant: 'sm', title: 'Select several: click or tap blocks to add them, drag on empty space to box them. Drag one to move them all.' });
selectBtn.setAttribute('aria-pressed', 'false');
const tlToolbar = h(
  'div',
  { class: 'tl-toolbar' },
  button('Split', () => ui.split(), { iconName: 'scissors', variant: 'sm', title: 'Split at the playhead (S): the selected text, lyric line, audio block or chart/visualizer layer, else the clip under the playhead' }),
  button('Delete', () => ui.deleteSelection(), { iconName: 'trash', variant: 'sm', title: 'Delete the selected items (Delete)' }),
  selectBtn,
  snapBtn,
  h('div', { class: 'spacer' }),
  tlHint,
  button('Fit', () => ui.zoomToFit(), { variant: 'sm', title: 'Zoom to fit the whole edit (Shift+Z)' }),
  iconButton('zoomOut', 'Zoom out', () => ui.setZoom(ui.pxPerSec / 1.3)),
  zoom,
  iconButton('zoomIn', 'Zoom in', () => ui.setZoom(ui.pxPerSec * 1.3)),
);
const timelineRoot = h('section', { class: 'timeline', 'aria-label': 'Timeline' }, tlToolbar);
const pageEl = h('div', { class: 'page-overlay', hidden: true, role: 'region', 'aria-label': 'Inspiration' });

const managerRoot = h('div', { id: 'ws-manager', class: 'manager', role: 'region', 'aria-label': 'Band manager' });
const photoRoot = h('div', { id: 'ws-photo', class: 'photo', role: 'region', 'aria-label': 'Photo Studio', hidden: true });
const tabRoot = h('div', { id: 'ws-tabstudio', class: 'tabws', role: 'region', 'aria-label': 'Tab Studio', hidden: true });
// two bars that sit above everything: an export in progress (the editing controls are locked) and a failed save
const exportBar = h('div', { class: 'export-bar', role: 'status', hidden: true });
const saveBanner = h('div', { class: 'save-banner', role: 'alert', hidden: true });
app.append(
  header,
  managerRoot,
  photoRoot,
  tabRoot,
  h('main', { class: 'workspace' }, tabRail, leftPanel, h('div', { class: 'center' }, stage, transport), inspector, pageEl),
  timelineRoot,
);
document.body.append(exportBar, saveBanner);

// ------------------------------------------------------------ engine + ui state
const engine = new Engine(store, canvas);
// the Projects library: the open edit, when saved there, follows each save (projects-video.js)
const projects = createVideoProjects({
  store,
  media,
  canvas,
  replaceEdit: (next) => replaceEdit(next),
  remember: (p) => rememberProject(p),
  after() {
    ui.select(null);
    engine.seek(0);
    refreshRelink();
    ui.refreshPanels(true);
  },
  missing: () => missingFor('studio'),
  openRelink: () => openRelink('studio'),
});

const ui = {
  selection: null,
  /** A multi-selection (two or more { type, id }), or []. ui.selection is its last-picked block (the inspector shows that one). */
  group: [],
  /** The Select button: taps and clicks add blocks to the multi-selection (touch has no Shift key). */
  multiSelect: false,
  pxPerSec: 40,
  snap: true,
  follow: true,
  syncing: false,
  tab: (localStorage.getItem('pvm.tab') || 'start').replace(/^guitar$/, 'guitarpro').replace(/^tabstudio$/, 'layers'),
  select(sel) {
    this.selection = sel;
    this.group = [];
    // jump to the panel that edits what was just selected (only now, not on every refresh)
    const homeId = sel && { layer: 'layers', song: 'audio', endcard: 'endcard' }[sel.type];
    const [home, homeFold] = homeId ? panels.resolveTab(homeId) : [];
    if (homeFold) setFold(homeFold, true);
    if (home && this.tab !== home && !PAGES[this.tab]) {
      this.tab = home;
      localStorage.setItem('pvm.tab', home);
      renderRail();
      showPage();
    }
    rebuildInspector();
    timeline.render();
    if (this.onSelect) this.onSelect();
    if ((sel && sel.type === 'lyric' && this.tab === 'lyrics') || leftSignature() !== leftSig) rebuildLeft();
  },
  /** Select several blocks at once (one or none falls back to a plain selection). The last one is shown in the inspector. */
  setGroup(list) {
    const g = liveGroup(store.get(), list);
    if (g.length < 2) return this.select(g[0] || null);
    this.select(g[g.length - 1]);
    this.group = g;
    rebuildInspector(); // its off/on button covers the whole group
    timeline.render();
  },
  /** Ctrl+A: every block on the selected block's row; again (or with nothing selected), every block on the timeline. */
  selectAll() {
    const p = store.get();
    const row = rowOf(p, this.selection);
    const onRow = row ? allItems(p, row) : [];
    const already = onRow.length && onRow.every((s) => inGroup(this.group.length ? this.group : [this.selection], s));
    this.setGroup(row && !already ? onRow : allItems(p));
  },
  /** Arrow keys with a multi-selection: move the group a frame (Shift: a second). Video-track clips move one slot. */
  nudgeGroup(dir, big) {
    const p = store.get();
    const plan = planMove(p, this.group, dir * (big ? 1 : 1 / 30), { slot: dir });
    if (plan.error) return toast(plan.error);
    if (!plan.delta && plan.insertAt == null) return;
    store.update((d) => applyMove(d, this.group, plan), 'nudge-group');
  },
  /** The timeline calls this on every render with the size of the multi-selection (0 when there is none). */
  groupShown(n) {
    tlHint.textContent = n ? `${n} selected · drag one to move them all · arrows nudge · Esc clears` : TL_HINT;
    selectBtn.classList.toggle('on', !!this.multiSelect);
    selectBtn.setAttribute('aria-pressed', this.multiSelect ? 'true' : 'false');
  },
  /** Zoom the timeline to `v` px per second, keeping the moment under `clientX` (or the playhead) in place. */
  setZoom(v, clientX) {
    const { min, max } = timeline.zoomRange();
    const at = timeline.zoomAnchor(clientX);
    this.pxPerSec = clamp(v, min, max);
    timeline.render();
    timeline.scroller.scrollLeft = anchorScroll(at.t, this.pxPerSec, at.off);
  },
  /** Zoom so the whole edit fits the visible timeline. */
  zoomToFit() {
    this.pxPerSec = timeline.zoomRange().fit;
    timeline.render();
    timeline.scroller.scrollLeft = 0;
  },
  /** The timeline calls this on every render so the slider follows the zoom and the edit's length. */
  zoomShown(pps, min, max) {
    zoom.value = String(zoomToSlider(pps, min, max));
    zoom.setAttribute('aria-valuetext', `${pps < 10 ? pps.toFixed(2) : Math.round(pps)} pixels per second`);
  },
  /** Turn looping playback on or off (a Spotify Canvas previews as a loop). */
  setLoop(on) {
    engine.loop = !!on;
    loopBtn.classList.toggle('on', engine.loop);
    loopBtn.setAttribute('aria-pressed', engine.loop ? 'true' : 'false');
  },
  /**
   * Hand a finished carousel to the Photo Studio: the slides go to the media library and open as one design with a
   * photo per slide (the Photo Studio takes up to 10 slides), ready for text, shapes and looks.
   */
  async editInPhoto(blobs, name) {
    const items = [];
    for (const [i, b] of blobs.slice(0, 10).entries()) {
      const file = `${name}-${String(i + 1).padStart(2, '0')}.png`;
      const rec = await addMedia(b, file, { kind: 'image', source: 'carousel' });
      items.push({ id: rec.id, name: `Slide ${i + 1}` });
    }
    setMode('photo');
    photo.openCarousel(items, name, blobs.length);
  },
  /** Switch to the Video Studio, on a tab. */
  goStudio(tab = 'layers') {
    setMode('studio');
    ui.openTab(tab);
  },
  openTab(req) {
    if (req === 'tabstudio') return setMode('tabstudio'); // Tab Studio is its own workspace now
    // opening a tool shows the tool panel again when it was hidden (or focus mode was on)
    if (!panes.shown('studio', 'tools')) panes.set('studio', 'tools', true);
    // old ids (media, stock, sounds, layers, templates…) open the fold that now holds them
    const [id, foldId] = PAGES[req] ? [req] : panels.resolveTab(req);
    if (foldId) setFold(foldId, true);
    if (this.tab === id) {
      if (foldId) {
        rebuildLeft();
        revealFold(foldId);
      }
      return;
    }
    this.tab = id;
    localStorage.setItem('pvm.tab', id);
    renderRail();
    showPage();
    if (!PAGES[id]) rebuildLeft();
    if (foldId) revealFold(foldId);
  },
  refreshPanels() {
    rebuildLeft();
    rebuildInspector();
  },
  /** "Save as the song's music video sync": save `sec` on the Manager song, replacing what it had. */
  saveVideoSyncPoint(songId, sec) {
    return songSync.saveVideo(sec, { replace: true, songId });
  },
  split() {
    const p = store.get();
    const sel = this.selection;
    let res = null;
    let miss = '';
    if (sel && sel.type === 'clip') {
      // a selected clip under the playhead (main lane or overlay) first, else the main-lane clip under the playhead
      const f = findClip(p, sel.id);
      const laid = f.clip && !f.layer ? layoutClips(p.clips).find((l) => l.clip.id === sel.id) : null;
      const under = f.clip && (f.layer ? engine.t > f.clip.start && engine.t < f.clip.start + f.clip.duration : laid && engine.t > laid.start && engine.t < laid.end);
      if (under) res = applyEdit((d) => splitClipAt(d, sel.id, engine.t));
    } else if (sel && sel.type === 'layer') {
      // a chart or visualizer layer is cut at the playhead; it says so when the playhead is outside it
      res = applyEdit((d) => splitItem(d, sel, engine.t));
    } else if (sel) {
      res = applyEdit((d) => splitItem(d, sel, engine.t));
      // the selected block isn't under the playhead: the clip under it is split instead, as before
      if (res.error && /playhead inside/.test(res.error)) (miss = res.error), (res = null);
    }
    if (!res) {
      const hit = clipAt(p.clips, engine.t);
      if (!hit) return toast(miss || 'Move the playhead over a clip to split it, or select a text, lyric line, audio block or layer.');
      res = applyEdit((d) => splitClipAt(d, hit.clip.id, engine.t));
    }
    if (res.error) return toast(res.error);
    ui.select(res.sel);
  },
  /** Ctrl+D: a copy of the selection right after itself. */
  duplicate() {
    if (this.group.length > 1) {
      const g = applyEdit((d) => duplicateGroup(d, this.group));
      if (g.error) return toast(g.error);
      ui.setGroup(g.group);
      return toast(`Duplicated ${g.group.length} items. Ctrl+Z undoes it.`);
    }
    const r = applyEdit((d) => duplicateItem(d, this.selection));
    if (r.error) return toast(r.error);
    ui.select(r.sel);
    toast('Duplicated. Ctrl+Z undoes it.');
  },
  /** Ctrl+C. */
  copy() {
    const c = this.group.length > 1 ? copyGroup(store.get(), this.group) : copyItem(store.get(), this.selection);
    if (!c) return toast('Select a clip, text, lyric line, audio block or layer to copy.');
    this.clipboard = c;
    toast(c.group ? `Copied ${c.group.length} items. Move the playhead and press Ctrl+V to paste them there.` : 'Copied. Move the playhead and press Ctrl+V to paste it there.');
  },
  /** Ctrl+V: paste what was copied at the playhead. */
  paste() {
    if (this.clipboard && this.clipboard.group) {
      const g = applyEdit((d) => pasteGroup(d, this.clipboard, engine.t));
      if (g.error) return toast(g.error);
      return ui.setGroup(g.group);
    }
    const r = applyEdit((d) => pasteItem(d, this.clipboard, { mode: 'at', t: engine.t }));
    if (r.error) return toast(r.error);
    ui.select(r.sel);
  },
  clipboard: null,
  /** E: turn the selection (or `sels`) off, or back on when all of it is off, without deleting it. One undo step. */
  toggleOff(sels) {
    const list = sels || (this.group.length > 1 ? this.group : this.selection ? [this.selection] : []);
    const r = applyEdit((d) => toggleOff(d, list));
    if (r.error) return toast(r.error);
    toast(`${r.count > 1 ? `${r.count} items are` : 'It is'} ${r.off ? 'off, still on the timeline' : 'on again'}. Ctrl+Z undoes it.`);
  },
  /** New project: the current edit goes to Earlier projects first, and Ctrl+Z brings it back. */
  newProject() {
    const cur = store.get();
    const blank = !hasContent(cur);
    const linked = !!cur.projectId;
    if (!blank && !confirm(`Start a new project? Your media library is kept. The current edit is saved ${linked ? 'in Projects' : 'under Start → Earlier projects'}, and Ctrl+Z brings it back.`)) return;
    const kept = rememberProject(cur);
    replaceEdit(newProject());
    ui.select(null);
    engine.seek(0);
    if (!blank) toast(linked ? `New project. “${cur.name}” is in Projects (or press Ctrl+Z).` : kept ? 'New project. Your last edit is under Start → Earlier projects (or press Ctrl+Z).' : 'New project. The last edit could not be kept in the list (the browser’s storage is full), but Ctrl+Z still brings it back.', 'info', 6000);
  },
  /** Download the edit as a file. */
  saveProjectFile() {
    const p = store.get();
    flushSave();
    download(new Blob([makeProjectFile(p, media.names())], { type: 'application/json' }), projectFileName(p));
    toast(`Saved ${projectFileName(p)}. It holds the edit, not the media: keep the media files with it.`, 'info', 5000);
  },
  /** Open a project file from the computer; the edit it replaces goes to Earlier projects. */
  async openProjectFile(file) {
    let parsed;
    try {
      parsed = parseProjectFile(await file.text());
    } catch (e) {
      return toast(e.message, 'error', 6000);
    }
    const cur = store.get();
    if (hasContent(cur) && !confirm(`Open “${parsed.project.name}”? The current edit is saved under Start → Earlier projects, and Ctrl+Z brings it back.`)) return;
    rememberProject(cur);
    media.learnNames(parsed.names);
    replaceEdit(parsed.project);
    ui.select(null);
    engine.seek(0);
    refreshRelink();
    ui.refreshPanels(true);
    const missing = missingFor('studio');
    toast(missing.length ? `Opened “${parsed.project.name}”. ${missing.length} file${missing.length === 1 ? ' is' : 's are'} not in this browser yet.` : `Opened “${parsed.project.name}”.`, 'info', 5000);
    if (missing.length) openRelink('studio');
  },
  /** The Projects library (saved edits, their versions, templates). */
  openProjects: () => projects.openDialog({ addDesigns: (docs) => photo.addDesigns(docs) }),
  /** Put an Earlier projects entry in Projects without opening it. */
  async saveRecentToProjects(id) {
    const r = loadRecent().find((x) => x.id === id);
    if (r && (await projects.add(parseProjectFile(makeProjectFile(r.project)).project, r.name))) toast(`“${r.name}” is in Projects now.`);
  },
  /** Earlier projects (newest first). */
  recent: () => loadRecent(),
  restoreRecent(id) {
    const r = loadRecent().find((x) => x.id === id);
    if (!r) return;
    const cur = store.get();
    rememberProject(cur);
    replaceEdit(parseProjectFile(makeProjectFile(r.project)).project);
    ui.select(null);
    engine.seek(0);
    refreshRelink();
    ui.refreshPanels(true);
    toast(`Restored “${r.name}”. The edit you had is in the list too.`);
  },
  forgetRecent(id) {
    saveRecent(loadRecent().filter((x) => x.id !== id));
    ui.refreshPanels(true);
  },
  deleteSelection() {
    const sel = this.selection;
    if (!sel) return;
    if (this.group.length > 1) {
      const g = this.group;
      store.update((d) => deleteGroup(d, g));
      toast(`Deleted ${g.length} items. Ctrl+Z brings them back.`);
      return this.select(null);
    }
    store.update((d) => {
      if (sel.type === 'clip') d.clips = d.clips.filter((c) => c.id !== sel.id);
      if (sel.type === 'lyric') d.lyrics = d.lyrics.filter((c) => c.id !== sel.id);
      if (sel.type === 'text') d.texts = d.texts.filter((c) => c.id !== sel.id);
      if (sel.type === 'audio') d.audioTracks = d.audioTracks.filter((c) => c.id !== sel.id);
      if (sel.type === 'endcard') d.endCard.enabled = false;
      if (sel.type === 'song') d.song = null;
      if (sel.type === 'layer') d.layers = d.layers.filter((l) => l.id !== sel.id);
      if (sel.type === 'clip') d.layers.forEach((l) => l.type === 'video' && (l.clips = l.clips.filter((c) => c.id !== sel.id)));
    });
    this.select(null);
  },
};
/** Run an edit on a copy first: an { error } leaves the project (and the undo history) untouched. */
function applyEdit(fn) {
  const probe = fn(structuredClone(store.get()));
  if (probe.error) return probe;
  let r;
  store.update((d) => (r = fn(d)));
  return r;
}
/** Swap the whole edit for `next` as one undo step. */
function replaceEdit(next) {
  store.update((d) => {
    for (const k of Object.keys(d)) delete d[k];
    Object.assign(d, structuredClone(next));
  });
}
/** Keep a copy of an edit that is about to be replaced. Returns false when the browser had no room for it. */
function rememberProject(p) {
  if (p.projectId) return projects.flush(true), true; // a saved project keeps itself (and a version) in Projects
  if (!hasContent(p)) return true;
  const list = saveRecent(pushRecent(loadRecent(), p));
  return !!list.length && list[0].project === p;
}
zoom.addEventListener('input', () => {
  const { min, max } = timeline.zoomRange();
  ui.setZoom(sliderToZoom(parseFloat(zoom.value), min, max));
});
snapBtn.classList.add('on');
snapBtn.setAttribute('aria-pressed', 'true');

const timeline = createTimeline({ root: timelineRoot, store, engine, ui });
const panels = createPanels({ store, engine, ui });
const postcheck = createPostCheck({ store, engine, ui });
postSlot.replaceWith(postcheck.el);
createTips({ store, ui, host: stage, postcheck });

// ------------------------------------------------------------ panels
let leftBinder = null;
let inspBinder = null;
let leftSig = '';
let inspSig = '';

function renderRail() {
  const railBtn = (t) => {
    // the full-screen pages open from Start, so Start stays lit while one is up
    const on = ui.tab === t.id || (t.id === 'start' && !!PAGES[ui.tab]);
    const dot = t.dot && !on && t.dot();
    return h(
      'button',
      {
        type: 'button',
        class: `rail-btn${on ? ' on' : ''}`,
        'aria-current': on ? 'page' : null,
        'aria-label': dot ? `${t.label} (new suggestions)` : null,
        onclick: () => ui.openTab(t.id),
      },
      icon(t.icon, 20),
      h('span', {}, t.label),
      dot ? h('i', { class: 'rail-dot', 'aria-hidden': 'true' }) : null,
    );
  };
  railSig = railSignature();
  // Start (ideas, templates and the full-screen pages) on top, then the tabs you build with
  const [start, ...rest] = panels.tabs;
  tabRail.replaceChildren(railBtn(start), h('hr', { class: 'rail-sep' }), ...rest.map(railBtn));
}
let railSig = '';
function railSignature() {
  return `${ui.tab}|${panels.tabs.map((t) => (t.dot && ui.tab !== t.id && t.dot() ? 1 : 0)).join('')}`;
}

let page = null;
// full-screen pages that cover the editor (their rail buttons sit above the panel tabs)
const PAGES = {
  inspiration: { label: 'Inspiration', icon: 'wand', build: () => buildInspirationPage({ store, engine, ui, settings: loadSettings(), panels }) },
  carousel: { label: 'Carousel', icon: 'image', build: () => buildCarouselPage({ store, engine, ui, panels, settings: loadSettings() }) },
  drumconvert: { label: 'Drum MIDI converter', icon: 'activity', build: () => buildDrumConvertPage({ store, engine, ui, panels }) },
};
function showPage() {
  const pg = PAGES[ui.tab];
  pageEl.hidden = !pg;
  if (page && page.leave) page.leave();
  page = null;
  if (pg) {
    page = pg.build();
    pageEl.setAttribute('aria-label', pg.label);
    pageEl.replaceChildren(page.el);
    pageEl.scrollTop = 0;
  }
}

const loadTemplatesCount = () => (localStorage.getItem('pvm.templates.v1') || '').length;
/** A lyric line's word times and text, so the Lyrics tab's word timing editor rebuilds after a change or an undo. */
const wordsSig = (l) => (l.words || l.wordsBy ? `${l.wordsBy || ''}${l.text}${(l.words || []).map((k) => `${k.t},${k.end}`).join(';')}` : '');
function leftSignature() {
  const p = store.get();
  const parts = [ui.tab, media.all().length, p.aspect];
  if (ui.tab === 'lyrics') parts.push(p.lyrics.map((l) => `${l.id}:${l.start}:${l.end}:${wordsSig(l)}`).join('|'), panels.sync.active, panels.sync.cursor, ui.selection && ui.selection.id, p.lyricStyle.display);
  const has = (...ids) => ids.includes(ui.tab);
  if (has('audio')) parts.push(p.song && p.song.mediaId, !!p.beats, p.audioTracks.map((a) => `${a.id}:${a.start}:${a.duration}`).join('|'));
  if (ui.tab === 'text') parts.push(p.texts.map((t) => `${t.id}:${t.text}:${t.start}:${t.end}`).join('|'));
  if (ui.tab === 'export') parts.push(p.clips.length, !!p.song, p.endCard.coverMediaId, p.duration, p.endCard.enabled, JSON.stringify(p.exportRange), p.name, p.endCard.title, p.endCard.artist, p.endCard.cta, p.endCard.subtext);
  if (has('video')) parts.push(p.clips.length);
  if (has('start')) parts.push(loadRecent().map((r) => r.id).join(','));
  if (has('start')) parts.push(loadTemplatesCount(), p.clips.length, p.template, p.layout, p.lyrics.length, p.theme ? `${p.theme.id}:${p.theme.custom}` : '');
  if (has('start')) parts.push(media.all().map((m) => `${m.id}:${m.envelope ? 1 : 0}`).join(','), p.song && p.song.mediaId, p.lyrics.length, p.suggestion, p.endCard.coverMediaId, p.aspect);
  if (has('audio')) parts.push(p.audioTracks.length);
  if (has('video', 'visualizer', 'guitarpro')) {
    const L = ui.selection && ui.selection.type === 'layer' ? (p.layers || []).find((l) => l.id === ui.selection.id) : null;
    parts.push(
      (p.layers || []).map((l) => `${l.id}:${l.type}:${l.visible !== false}:${l.name}`).join('|'),
      JSON.stringify(p.layerVis || {}),
      p.audioTracks.length,
      ui.selection && ui.selection.id,
      L && [L.mediaId, L.source, L.track, L.mode, L.style, L.kitFinish, L.tabTheme, L.gameTheme, L.followSong, JSON.stringify(L.kitPieces || {}), L.playAudio, L.type === 'video' ? L.clips.length : '', kfSignature(L)].join(','),
      p.beats && p.beats.bpm,
    );
  }
  return parts.join('#');
}
function inspSignature() {
  const p = store.get();
  const s = ui.selection;
  if (!s) return `none#${p.clips.length}`;
  const exists =
    (s.type === 'clip' &&
      (() => {
        const c = findClip(p, s.id).clip;
        const br = c && c.bgRemove;
        const bg = br && br.background;
        return c && [c.filter?.preset, !!c.kenBurns, c.mask?.shape, c.mask?.background, c.grade?.preset, br?.enabled, br?.mode, bg && [bg.kind, bg.scene, bg.mediaId, bg.color, bg.color2].join(',')].join('|');
      })()) ||
    (s.type === 'lyric' && p.lyrics.some((c) => c.id === s.id) && (() => {
      const l = p.lyrics.find((c) => c.id === s.id);
      return `${[...p.lyrics].sort((a, b) => a.start - b.start).findIndex((c) => c.id === s.id)}|${l.style ? `${l.style.preset || 'own'}:${!!l.style.box}` : '-'}|${p.lyrics.filter((c) => c.text.trim().toLowerCase() === l.text.trim().toLowerCase()).length}`;
    })()) ||
    (s.type === 'text' && p.texts.some((c) => c.id === s.id)) ||
    (s.type === 'audio' && p.audioTracks.some((c) => c.id === s.id)) ||
    s.type;
  const tg = kfTarget(p, s);
  return `${s.type}#${s.id}#${exists}#${tg ? kfSignature(tg.item) : ''}#${ui.group.length > 1 ? ui.group.map((g) => isOff(p, g)).join('') : isOff(p, s)}`;
}

function keepScroll(el, fn) {
  const top = el.scrollTop;
  fn();
  el.scrollTop = top;
}
function revealFold(id) {
  const el = leftPanel.querySelector(`[data-fold="${id}"]`);
  if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }));
}
function rebuildLeft() {
  leftBinder = new Binder(store);
  const tab = panels.tabs.find((t) => t.id === ui.tab) || panels.tabs[0];
  keepScroll(leftPanel, () => leftPanel.replaceChildren(paneX('studio', 'tools'), h('h2', { class: 'panel-title' }, tab.label), tab.build(leftBinder)));
  leftSig = leftSignature();
}
/** Above the selection's settings: turn it (or the whole multi-selection) off or on, and what off means for it. */
function offBar() {
  const p = store.get();
  const list = (ui.group.length > 1 ? ui.group : ui.selection ? [ui.selection] : []).filter((s) => canTurnOff(p, s));
  if (!list.length) return null;
  const off = list.every((s) => isOff(p, s));
  const many = list.length > 1;
  const s = list[0];
  const main = !many && s.type === 'clip' && p.clips.some((c) => c.id === s.id);
  const note = !off
    ? null
    : many
      ? 'These are off: they stay on the timeline with their timing, keyframes and settings, and the preview, export and sound skip them.'
      : main
        ? 'Off: it keeps its place on the Video track, so the clips after it don’t move. The video shows black there, with no clip sound, in the preview and the export.'
        : `Off: it stays on the timeline with its timing${s.type === 'song' || s.type === 'endcard' ? '' : ', keyframes'} and settings, and the preview and the export skip it.`;
  const label = `${off ? 'Turn on' : 'Turn off'}${many ? ` ${list.length} selected` : ''}`;
  return h(
    'div',
    { class: `off-bar${off ? ' is-off' : ''}` },
    button(label, () => ui.toggleOff(list), { iconName: off ? 'eye' : 'eyeOff', variant: 'sm', title: `${label} without deleting (${OFF_KEY}). Ctrl+Z undoes it.` }),
    note ? h('p', { class: 'muted tiny' }, note) : null,
  );
}
function rebuildInspector() {
  inspBinder = new Binder(store);
  keepScroll(inspector, () => inspector.replaceChildren(...[paneX('studio', 'inspector'), offBar(), panels.buildInspector(inspBinder)].filter(Boolean)));
  inspSig = inspSignature();
}

// ------------------------------------------------------------ change handling
let saveTimer = null;
store.subscribe((p, meta) => {
  if (meta.type !== 'update' && ui.selection) {
    // undo/redo/new can remove the selected item
    const s = ui.selection;
    const gone =
      (s.type === 'clip' && !findClip(p, s.id).clip) ||
      (s.type === 'layer' && !(p.layers || []).some((l) => l.id === s.id)) ||
      (s.type === 'lyric' && !p.lyrics.some((c) => c.id === s.id)) ||
      (s.type === 'text' && !p.texts.some((c) => c.id === s.id)) ||
      (s.type === 'audio' && !p.audioTracks.some((c) => c.id === s.id));
    if (gone) ui.selection = null;
  }
  if (ui.group.length) {
    // undo/redo or a delete can take blocks out of a multi-selection
    const g = liveGroup(p, ui.group);
    ui.group = g.length > 1 ? g : [];
  }
  if (engine.t > p.duration) engine.t = p.duration;
  timeline.render();
  if (!engine.playing) engine.render();
  const typingInLeft = leftPanel.contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
  if (leftSignature() !== leftSig && !typingInLeft) rebuildLeft();
  else leftBinder.refresh();
  if (inspSignature() !== inspSig || meta.type !== 'update') rebuildInspector();
  else inspBinder.refresh();
  if (railSignature() !== railSig) renderRail();
  syncHeader();
  postcheck.refresh();
  if (manager && artistSel.value !== (p.artistId || '')) syncArtistSel();
  saveState.textContent = 'Saving…';
  saveState.classList.remove('bad');
  savePending = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeProject, 500);
});

/** Write the edit to this browser now. A failure shows a banner that stays until a save works. */
function writeProject() {
  clearTimeout(saveTimer);
  savePending = false;
  const ok = saveProject(store.get());
  if (ok) projects.autosave();
  saveState.textContent = ok ? 'Saved in this browser' : 'NOT saved: storage full';
  saveState.classList.toggle('bad', !ok);
  showSaveBanner(ok ? null : { what: 'your latest edits' });
  return ok;
}
/** Save anything still waiting for its half second (closing the tab or switching away must not lose it). */
function flushSave() {
  if (savePending) writeProject();
}
let savePending = false;
let mediaFailures = [];
function showSaveBanner(problem) {
  if (!problem && !mediaFailures.length) return (saveBanner.hidden = true);
  const biggest = biggestFiles(media.all(), 3).map((m) => `${m.name} (${(m.size / 1048576).toFixed(0)} MB)`);
  const mb = (n) => (n == null ? '?' : `${(n / 1048576).toFixed(0)} MB`);
  const lines = [];
  if (problem) lines.push(`This browser has no room left, so ${problem.what} are NOT being saved. Download a project file now, then free some space.`);
  for (const f of mediaFailures.slice(-3)) lines.push(`“${f.name}” (${mb(f.bytes)}) could not be stored${f.space != null ? `; about ${mb(f.space)} is free` : ''}. It works until you reload, then it will show as missing.`);
  saveBanner.replaceChildren(
    icon('x', 16),
    h('div', { class: 'save-banner-text' }, h('strong', {}, 'Storage is full. '), lines.join(' '), biggest.length ? h('span', { class: 'muted' }, ` Biggest files: ${biggest.join(', ')}.`) : null),
    h('div', { class: 'row' }, button('Download project file', () => ui.saveProjectFile(), { iconName: 'download', variant: 'sm primary' }), button('Clean up storage', () => openStorage(), { variant: 'sm' }), button('Open the media library', () => (setMode('studio'), ui.openTab('video')), { variant: 'sm' }), button('Dismiss', () => ((mediaFailures = []), (saveBanner.hidden = true)), { variant: 'sm ghost' })),
    iconButton('x', 'Close this warning', () => ((mediaFailures = []), (saveBanner.hidden = true)), 'ghost banner-x'),
  );
  saveBanner.hidden = false;
}
// settings and templates that did not fit, and media the browser refused to store
setSaveFailHandler((what, detail = {}) => {
  if (detail.media) {
    mediaFailures.push(detail);
    showSaveBanner(null);
  }
  toast(detail.media ? `Could not store “${detail.name}”: this browser is out of space. It works for now but will be missing after a reload.` : `Could not save ${what}: this browser is out of space.`, 'error', 7000);
});
// leaving, closing or hiding the tab: save what is waiting, in every workspace
function flushAll() {
  flushSave();
  projects.flush();
  if (manager && manager.flush) manager.flush();
  if (photo && photo.flush) photo.flush();
}
window.addEventListener('pagehide', flushAll);
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushAll());

function syncHeader() {
  const p = store.get();
  if (document.activeElement !== nameInput) nameInput.value = p.name;
  aspectSel.value = p.aspect;
  overlaySel.value = p.look.overlay || 'off';
  overlaySel.disabled = !overlaySupported(p.aspect);
  overlaySel.title = overlaySel.disabled ? 'App button previews are for 9:16 videos' : 'Show where each app puts its buttons (preview only, press O to cycle)';
  undoBtn.disabled = !store.canUndo();
  redoBtn.disabled = !store.canRedo();
  fitStage();
  syncNowOn();
}

/**
 * The header's "now on" badge: the band and song you are working on. In the Manager it is the
 * open artist and the song you last opened; in the Video Studio it is the promo's artist and song.
 */
function syncNowOn() {
  if (!manager) return;
  let artistId = manager.currentArtist();
  let song = manager.currentSong();
  if (mode === 'studio') {
    const p = store.get();
    if (p.artistId && manager.artists().some((a) => a.id === p.artistId)) artistId = p.artistId;
    song = p.managerSongId ? manager.findSong(p.managerSongId) : null;
  } else if (mode === 'tabstudio') {
    const ts = ui.tabSong();
    song = ts ? manager.findSong(ts.id) : null;
    if (tabPage) tabPage.songChanged();
  }
  const a = manager.artists().find((x) => x.id === artistId) || { name: 'No band yet' };
  const ph = a.photoId && media.peek(a.photoId); // the small picture: the header never opens the file
  const dotSrc = ph && (ph.thumb || ph.url);
  const dot = dotSrc ? h('span', { class: 'now-dot photo', 'aria-hidden': 'true' }, h('img', { src: dotSrc, alt: '', style: photoStyle(a.photoPos) })) : h('span', { class: 'now-dot', 'aria-hidden': 'true' }, (a.name[0] || '?').toUpperCase());
  nowOn.replaceChildren(dot, h('span', { class: 'now-band' }, a.name), h('span', { class: 'now-sep', 'aria-hidden': 'true' }, '·'), h('span', { class: `now-song${song ? '' : ' none'}` }, song ? song.title : 'No song selected'));
  nowOn.setAttribute('aria-label', `Working on ${a.name}${song ? `, song “${song.title}”` : ', no song selected'}. Open it in the Manager.`);
  nowOn.onclick = () => {
    setMode('manager');
    if (song && song.artistId && song.artistId !== manager.currentArtist()) manager.switchArtist(song.artistId);
    if (song) manager.go('songs', song.id);
    else manager.go('songs');
  };
}

media.onChange(() => {
  postcheck.refresh();
  if (!engine.playing) engine.render();
  timeline.render();
  if (railSignature() !== railSig) renderRail();
});

let kfRefresh = 0;
engine.on(() => {
  // keyframe sliders and diamonds follow the playhead (when paused; every ~100 ms while playing)
  const nowMs = performance.now();
  if (!engine.playing || nowMs - kfRefresh > 100) {
    kfRefresh = nowMs;
    if (inspBinder) inspBinder.refresh();
    if (leftBinder && ui.selection && ui.selection.type === 'layer') leftBinder.refresh();
  }
  timeReadout.update();
  playBtn.replaceChildren(icon(engine.playing ? 'pause' : 'play', 22));
  playBtn.setAttribute('aria-label', engine.playing ? 'Pause' : 'Play');
  timeline.movePlayhead();
  if (!engine.playing && panels.sync.active) panels.stopSync();
});
playBtn.addEventListener('click', () => engine.toggle());
timeReadout.update();

// ------------------------------------------------------------ export lock and level meter
let locked = null; // the controls locked by the running export
let plainTitle = document.title;
function syncExportLock() {
  const on = !!engine.exporting;
  if (on === !!locked) return;
  if (on) {
    // a fast export leaves the workspace switch free: it draws its own copy of the edit, so you can work elsewhere
    locked = engine.exportFast ? [tabRail, leftPanel, inspector, timelineRoot, transport, nowOn, ...header.querySelectorAll('.studio-only')] : [tabRail, leftPanel, inspector, timelineRoot, transport, header];
    for (const el of locked) el.inert = true;
    plainTitle = document.title;
    exportBar.replaceChildren(exportLabel, h('div', { class: 'export-progress' }, exportFill), h('span', { class: 'muted small' }, engine.exportFast ? 'Editing this video is locked until it finishes. You can switch workspace or tab; closing this tab stops it.' : 'Editing is locked until it finishes. Keep this tab in front.'), button('Cancel export', () => exportVideo.cancel && exportVideo.cancel(), { variant: 'sm' }));
    exportLabel.textContent = 'Exporting…';
    exportFill.style.width = '0%';
  } else {
    for (const el of locked) el.inert = false;
    locked = null;
    document.title = plainTitle;
  }
  document.body.classList.toggle('exporting', on);
  exportBar.hidden = !on;
}
const exportLabel = h('strong', {});
const exportFill = h('div', {});
ui.exportProgress = (f) => {
  const pct = Math.round(f * 100);
  exportLabel.textContent = `Exporting… ${pct}%`;
  exportFill.style.width = `${pct}%`;
  // the tab's title shows how far it is, for when you are in another tab
  document.title = `${pct}% exporting · ${plainTitle}`;
};
/** A short two-note chime (made here, no sound file) for an export that finished while you were elsewhere. */
function chime() {
  try {
    const ac = engine.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = ac.currentTime + 0.05;
    [880, 1320].forEach((f, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i * 0.18);
      g.gain.linearRampToValueAtTime(0.18, t + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.18 + 0.5);
      o.connect(g).connect(ac.destination);
      o.start(t + i * 0.18);
      o.stop(t + i * 0.18 + 0.55);
    });
  } catch {
    /* no sound: the bar and the notification still say it */
  }
}
/** After a fast export: the bar turns into Download / Open Video Studio / Close, wherever you are in the app. */
ui.exportDone = (res) => {
  if (!res.fast) return;
  const away = document.hidden || mode !== 'studio';
  const close = () => (exportBar.hidden = true);
  const parts = [
    h('strong', {}, 'Your video is ready'),
    h('a', { class: 'btn sm primary', href: res.url, download: res.name, 'data-testid': 'bar-download' }, icon('download', 16), h('span', {}, `Download (${(res.blob.size / 1e6).toFixed(1)} MB)`)),
    mode !== 'studio' ? button('Open Video Studio', () => (setMode('studio'), ui.openTab('export'), close()), { variant: 'sm ghost' }) : null,
    button('Close', close, { variant: 'sm ghost' }),
  ];
  exportBar.replaceChildren(...parts.filter(Boolean));
  exportBar.hidden = false;
  if (!away) return;
  chime();
  if (window.Notification && Notification.permission === 'granted') {
    try {
      const n = new Notification('Your video is ready', { body: `${res.name} finished exporting in Band Manager.`, tag: 'promo-studio-export' });
      n.onclick = () => (window.focus(), n.close());
    } catch {
      /* some phones only allow notifications from a service worker */
    }
  }
};
/** Before the recording starts: "Opening files 2 of 5…" ('' for the usual label). */
ui.exportLabel = (text) => (exportLabel.textContent = text || 'Exporting…');
engine.on(syncExportLock);
let meterShown = 0;
let meterAt = performance.now();
let meterTick = null;
function paintMeter() {
  const now = performance.now();
  meterShown = meterHold(meterShown, engine.playing || engine.exporting ? engine.level() : 0, (now - meterAt) / 1000);
  meterAt = now;
  meterFillEl.style.width = `${Math.round(meterFill(meterShown) * 100)}%`;
  meterEl.classList.toggle('hot', meterShown >= 0.98);
  meterTick = meterShown > 0.001 || engine.playing ? requestAnimationFrame(paintMeter) : null;
}
engine.on(() => !meterTick && (meterTick = requestAnimationFrame(paintMeter)));

// ------------------------------------------------------------ preview sizing
function fitStage() {
  const { w, h: hh } = ASPECTS[store.get().aspect];
  const r = stage.getBoundingClientRect();
  const scale = Math.min((r.width - 24) / w, (r.height - 24) / hh);
  stageInner.style.width = `${Math.max(50, Math.floor(w * scale))}px`;
  stageInner.style.height = `${Math.max(50, Math.floor(hh * scale))}px`;
}
new ResizeObserver(() => {
  fitStage();
  timeline.render();
}).observe(stage);

// ------------------------------------------------------------ drag to reposition on the preview
// Press on a text, lyric line, layer or picture to select it and drag it; Shift keeps one direction. With the preview
// focused, the arrow keys nudge the selection (Shift for bigger steps). One drag is one Ctrl+Z step.
canvas.tabIndex = 0;
const measureCtx = document.createElement('canvas').getContext('2d');
const measure = (text, font, px) => {
  measureCtx.font = `${Math.round(px)}px "${font}", Impact, "Arial Black", sans-serif`;
  return measureCtx.measureText(String(text || '')).width;
};
const frameOpts = () => {
  const { w, h: hh } = ASPECTS[store.get().aspect];
  return { W: w, H: hh, measure, selected: ui.selection };
};
const framePoint = (e) => {
  const r = canvas.getBoundingClientRect();
  return { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height, r };
};
const selBox = h('div', { class: 'preview-selbox', hidden: true, 'aria-hidden': 'true' });
stageInner.append(selBox);
function paintSelBox() {
  const p = store.get();
  const b = ui.selection && !engine.playing && !engine.exporting && canvas.offsetParent && movable(p, ui.selection) ? boxOf(p, engine.t, ui.selection, frameOpts()) : null;
  selBox.hidden = !b;
  if (!b) return;
  Object.assign(selBox.style, { left: `${(b.cx - b.w / 2) * 100}%`, top: `${(b.cy - b.h / 2) * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` });
}
let pdrag = null;
let pdragN = 0;
canvas.addEventListener('pointerdown', (e) => {
  if (engine.exporting || (e.pointerType === 'mouse' && e.button !== 0)) return;
  if (pdrag) return; // a second finger: leave the first drag alone
  const { fx, fy } = framePoint(e);
  const p = store.get();
  const sel = hitTest(p, engine.t, fx, fy, frameOpts());
  canvas.focus({ preventScroll: true });
  if (!sel) return;
  e.preventDefault();
  if (!ui.selection || ui.selection.type !== sel.type || ui.selection.id !== sel.id) ui.select(sel);
  pdrag = { id: e.pointerId, sel, x: e.clientX, y: e.clientY, from: positionAt(p, sel, engine.t), key: `pdrag-${++pdragN}`, moved: false, axes: { x: false, y: false } };
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    /* a pointer the browser doesn't track (synthetic): moves still reach the canvas */
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!pdrag) {
    if (e.pointerType === 'mouse' && !engine.exporting) {
      const { fx, fy } = framePoint(e);
      canvas.style.cursor = hitTest(store.get(), engine.t, fx, fy, frameOpts()) ? 'move' : '';
    }
    return;
  }
  if (e.pointerId !== pdrag.id) return;
  const r = canvas.getBoundingClientRect();
  let dx = e.clientX - pdrag.x;
  let dy = e.clientY - pdrag.y;
  if (!pdrag.moved && Math.hypot(dx, dy) < 3) return; // a click, not a drag
  if (!pdrag.moved) {
    pdrag.moved = true;
    if (engine.playing) engine.pause(); // a keyframe lands where the playhead is, so hold it still
  }
  if (e.shiftKey) [dx, dy] = constrain(dx, dy);
  if (dx) pdrag.axes.x = true;
  if (dy) pdrag.axes.y = true;
  const d = pdrag;
  store.update((draft) => moveBy(draft, d.sel, engine.t, d.from, dx / r.width, dy / r.height, d.axes), d.key);
});
const endPdrag = (e) => {
  if (!pdrag || e.pointerId !== pdrag.id) return;
  pdrag = null;
  paintSelBox();
};
canvas.addEventListener('pointerup', endPdrag);
canvas.addEventListener('pointercancel', endPdrag);
canvas.addEventListener('lostpointercapture', endPdrag);
canvas.addEventListener('keydown', (e) => {
  if (!/^Arrow/.test(e.key) || e.ctrlKey || e.metaKey || e.altKey || engine.exporting) return;
  const p = store.get();
  if (!movable(p, ui.selection)) return; // nothing to nudge: the arrows move the playhead as elsewhere
  e.preventDefault();
  e.stopPropagation();
  const step = e.shiftKey ? 0.05 : 0.005;
  const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
  const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
  const sel = ui.selection;
  store.update((d) => moveBy(d, sel, engine.t, positionAt(d, sel, engine.t), dx, dy), `pnudge-${sel.id}`);
});
store.subscribe(() => paintSelBox());
store.subscribe(() => timeReadout.update()); // the length can change without the playhead moving
engine.on(() => paintSelBox());
ui.onSelect = paintSelBox;

// ------------------------------------------------------------ keyboard
window.addEventListener('keydown', (e) => {
  if (mode === 'photo') return photo && photo.onKey(e);
  if (mode === 'tabstudio') return; // Tab Studio has its own keys
  if (mode === 'manager') {
    // text fields keep the browser's own undo; a ticked checkbox or a picked option undoes in the Manager
    const t = (e.target.tagName || '').toUpperCase();
    if (t === 'TEXTAREA' || e.target.isContentEditable || (t === 'INPUT' && !/^(checkbox|radio|button|range|submit|reset|color|file)$/.test(e.target.type))) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) manager.redo();
      else manager.undo();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      manager.redo();
    }
    return;
  }
  // while a video exports nothing may move the playhead or change the edit; the Cancel button is the way out
  if (engine.exporting) {
    if (!/^(F\d+|Tab|Shift|Control|Alt|Meta)$/.test(e.key) && !(e.ctrlKey || e.metaKey) && !(e.target.closest && e.target.closest('input,textarea,select'))) e.preventDefault();
    return;
  }
  const tag = (e.target.tagName || '').toUpperCase();
  const typing = /INPUT|TEXTAREA|SELECT/.test(tag) && !(e.target.type === 'range' || e.target.type === 'checkbox');
  if (panels.sync.active) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      return panels.doTap();
    }
    if (e.key === 'ArrowDown' || e.key === '.') {
      e.preventDefault();
      return panels.doEnd();
    }
    if (e.key === 'Escape') return panels.stopSync();
  }
  if (typing) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) store.redo();
    else store.undo();
    return;
  }
  if (mod && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    store.redo();
    return;
  }
  if (mod && !e.altKey) {
    const k = e.key.toLowerCase();
    if (k === 'd') {
      e.preventDefault();
      ui.duplicate();
    } else if (k === 'c' && !String(window.getSelection()).length) {
      e.preventDefault();
      ui.copy();
    } else if (k === 'v' && ui.clipboard) {
      e.preventDefault();
      ui.paste();
    } else if (k === 'a') {
      e.preventDefault();
      ui.selectAll();
    }
    return;
  }
  if (mod) return;
  const btn = e.target.closest && e.target.closest('button,a,[role=button]');
  switch (e.key) {
    case ' ':
      if (btn) return; // let buttons handle their own activation
      e.preventDefault();
      engine.toggle();
      break;
    case 'ArrowLeft':
    case 'ArrowRight': {
      if (e.target.type === 'range') return;
      e.preventDefault();
      if (ui.group.length > 1 && !e.altKey) {
        ui.nudgeGroup(e.key === 'ArrowLeft' ? -1 : 1, e.shiftKey);
        break;
      }
      const step = e.shiftKey ? 1 : 1 / 30;
      engine.seek(engine.t + (e.key === 'ArrowLeft' ? -step : step));
      break;
    }
    case 'Home':
      engine.seek(0);
      break;
    case 'End':
      engine.seek(store.get().duration);
      break;
    case 's':
    case 'S':
      ui.split();
      break;
    case 'i':
    case 'I':
      if (!e.altKey && !e.shiftKey) setExportSide(store, 'start', engine.t);
      break;
    case 'Delete':
    case 'Backspace':
      if (ui.selection) {
        e.preventDefault();
        ui.deleteSelection();
      }
      break;
    case 'Escape':
      ui.select(null);
      break;
    case 'Z':
      if (e.shiftKey && !e.altKey) ui.zoomToFit();
      break;
    case 'e':
    case 'E':
      if (!e.altKey) ui.toggleOff();
      break;
    case 'g':
    case 'G':
      toggleSafe();
      break;
    case 'o':
    case 'O':
      if (e.shiftKey) setExportSide(store, 'end', engine.t);
      else if (overlaySupported(store.get().aspect)) cycleOverlay();
      break;
    default:
  }
});

// ------------------------------------------------------------ file drop anywhere
window.addEventListener('dragover', (e) => {
  if ([...(e.dataTransfer?.types || [])].includes('Files')) {
    e.preventDefault();
    document.body.classList.add('dropping');
  }
});
window.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget) document.body.classList.remove('dropping');
});
window.addEventListener('drop', (e) => {
  if (!e.dataTransfer?.files?.length) return;
  e.preventDefault();
  document.body.classList.remove('dropping');
  if (engine.exporting) return toast('Wait for the export to finish before adding files.');
  panels.importFiles([...e.dataTransfer.files]);
});

// ------------------------------------------------------------ manager workspace
manager = createManager({
  root: managerRoot,
  studio: {
    audioFiles: () => media.all().filter((m) => m.kind === 'audio').map((m) => ({ id: m.id, name: m.name })),
    /** Add a song file from the computer to the media library (audio only); returns { id, name }. */
    async uploadAudio(file) {
      const audio = kindOf(file.type || '', file.name) === 'audio' || /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|aiff?)$/i.test(file.name);
      if (!audio) throw new Error(`“${file.name}” isn’t an audio file. Pick an MP3, WAV, M4A, OGG or FLAC.`);
      const rec = await addMedia(file, file.name, { kind: 'audio' });
      ui.refreshPanels(true);
      return { id: rec.id, name: rec.name };
    },
    /**
     * Add files from the computer to the media library, keeping only the kinds asked for
     * (['audio'], ['video'] or ['video', 'image']). Returns { added: [{ id, name, kind }], skipped: [names] }.
     */
    async uploadMedia(files, kinds) {
      const added = [];
      const skipped = [];
      for (const file of files) {
        const audioExt = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|aiff?)$/i.test(file.name);
        const kind = kindOf(file.type || '', file.name) || (audioExt ? 'audio' : null);
        if (!kinds.includes(kind)) {
          skipped.push(file.name);
          continue;
        }
        try {
          const rec = await addMedia(file, file.name, { kind });
          added.push({ id: rec.id, name: rec.name, kind: rec.kind });
        } catch (e) {
          skipped.push(file.name);
          toast(e.message, 'error', 5000);
        }
      }
      if (added.length) ui.refreshPanels(true);
      return { added, skipped };
    },
    /** The names this browser knows for these media ids (they go into a backup so another browser can ask for the files). */
    mediaNames: (ids) => Object.fromEntries([...ids].filter((id) => media.names()[id]).map((id) => [id, media.names()[id]])),
    learnNames: (names) => media.learnNames(names),
    /** The Projects library for a backup: saved video edits (no versions) and photo designs. */
    projectsBackup: () => ({ video: projects.entries(), photo: photo ? photo.designs() : [] }),
    /** Projects from a backup, added next to the ones here (nothing replaced). Resolves { video, photo } counts added. */
    async restoreProjects(raw) {
      const b = readProjects(raw);
      const video = b && Array.isArray(b.video) && b.video.length ? await projects.addEntries(b.video) : 0;
      const ph = b && Array.isArray(b.photo) && b.photo.length && photo ? photo.addDesigns(b.photo) : 0;
      return { video, photo: ph };
    },
    /** What a media id was called, even when its file is gone ('' when never known). */
    fileName: (id) => (media.names()[id] || [])[0] || '',
    /** Library files of some kinds, for "pick from the library" menus. */
    libraryFiles: (kinds) => media.all().filter((m) => kinds.includes(m.kind)).map((m) => ({ id: m.id, name: m.name, kind: m.kind })),
    /** Switch to the Video Studio's Video tab. */
    openStudio() {
      setMode('studio');
      ui.select(null);
      ui.openTab('video');
    },
    /** A library file's details, or null when it was removed from the library. */
    /** A library file's audio/video data, for features that listen to it on this device (Auto-sync lyrics). */
    /** Resolves the file's Blob (read from storage when it is not open), or null. */
    mediaBlob: (id) => media.blob(id),
    /** True when the library has the file (opened or not: a file not open yet is not missing). */
    hasMedia: (id) => media.has(id),
    /** Resolves a playable address for the file, opening it when needed (null when it is missing). */
    mediaUrl: (id) => ensureLoaded(id).then((r) => (r && r.url) || null),
    /** Details for lists and pages. Does not open the file: `url` is null until it is open (photos give their thumbnail). */
    mediaInfo(id) {
      const m = id && media.peek(id);
      if (!m) return null;
      const tab = m.kind === 'tab' ? { title: m.title || '', tracks: (m.tracks || []).map((t) => t.name), drumTracks: (m.drumTracks || []).length } : {};
      return { id: m.id, name: m.name, kind: m.kind, duration: Number.isFinite(m.duration) ? m.duration : 0, thumb: m.thumb || null, url: m.url || (m.kind === 'image' ? m.thumb : null) || null, width: m.width || 0, height: m.height || 0, peaks: m.peaks || null, peaksPerSec: m.peaksPerSec || 0, ...tab };
    },
    /**
     * Put a song's file into the current edit. `how`: 'clip' (end of the main video track),
     * 'overlay' (picture-in-picture at the playhead), 'drums' (drum chart from a drum stem),
     * 'viz' (visualizer that listens to the file), 'audio' (extra audio track at the playhead).
     * `open` switches to the Video Studio afterwards.
     */
    useInEditor(id, how, { open = true } = {}) {
      const rec = media.get(id);
      if (!rec) return toast('That file is no longer in the media library.', 'error');
      sendToEdit(rec, how);
      if (open && how !== 'tabstudio') {
        setMode('studio');
        if (how === 'clip' || how === 'overlay') ui.openTab('video');
      }
    },
    /** Song Files > "Make a tab from this stem": open Tab Studio with the stem and part picked. */
    stemToTab(id, role) {
      const rec = media.get(id);
      if (!rec) return toast('That file is no longer in the media library.', 'error');
      loadTabStudio().then((t) => {
        t.presetStemTab(rec, role);
        setMode('tabstudio');
      });
    },
    artistsChanged: () => (syncArtistSel(), syncNowOn()),
    /** The Manager's page, artist or song changed: update the header badge. */
    contextChanged: () => (syncNowOn(), soonReleaseMedia()),
    /** The Storage section of the Manager home (measures when built). */
    storagePanel: () => {
      const open = storageOpenNext;
      storageOpenNext = false;
      return storagePanel(storageDeps, { open });
    },
    /** Open this song's sections in the Video Studio's Export tab (loading the song first if the edit is another one). */
    openSections(song) {
      if (store.get().managerSongId !== song.id) this.openPromo(song);
      if (store.get().managerSongId !== song.id) return; // they kept the other edit
      setMode('studio');
      ui.openTab('export');
    },
    /** Open the Spotify Canvas templates for this song (its cover, and its music video when the edit has no clips). */
    openCanvas(song) {
      if (store.get().managerSongId !== song.id) this.openPromo(song);
      if (store.get().managerSongId !== song.id) return; // they kept the other edit
      const vid = song.files && song.files.video && media.get(song.files.video.mediaId);
      if (!store.get().clips.length && vid) panels.actions.addClip(vid);
      setMode('studio');
      ui.openTab('templates');
      requestAnimationFrame(() => document.querySelector('[data-canvas]')?.closest('section, details')?.scrollIntoView({ block: 'start' }));
    },
    /** Open the Photo Studio on a template: 'promo', 'release', 'countdown', 'show', 'tour'… */
    openPhoto: (id, opts) => openPhoto(id, opts),
    imageFiles: () => media.all().filter((m) => m.kind === 'image').map((m) => ({ id: m.id, name: m.name, thumb: m.thumb || null })),
    /** A library image as a JPEG data URL no larger than `max` px on its long side (for the press kit). */
    async imageDataUrl(id, max = 1400) {
      const rec = await ensureLoaded(id);
      const img = rec && rec.el;
      if (!img || !img.naturalWidth) return null;
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = h('canvas', { width: Math.round(img.naturalWidth * k), height: Math.round(img.naturalHeight * k) });
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.85);
    },
    /** Put a song's title, lyrics and audio into the video edit, then switch to the studio. */
    /** opts.askPart: then ask which part of the song the video is of (Make a promo). */
    openPromo(song, opts = {}) {
      const p = store.get();
      const rec = song.audioId && media.get(song.audioId);
      const plan = songLyricsPlan(song);
      const timed = plan.kind === 'timed';
      const parts = ['title', (song.lyrics.trim() || timed) && 'lyrics', rec && 'song file'].filter(Boolean);
      if ((p.clips.length || p.lyrics.length) && !confirm(`Use “${song.title}” in the current video edit? Its ${parts.join(', ')} replace the edit’s. Undo (Ctrl+Z) in the studio puts them back.`)) return;
      if (rec) panels.actions.useSong(rec);
      store.update((d) => {
        d.name = `${song.title} promo`;
        d.endCard.title = song.title;
        const band = manager.store.get().band.name;
        if (band) d.endCard.artist = band;
        d.artistId = manager.currentArtist();
        if (timed) {
          d.lyrics = lyricsFromTiming(song.lyricTiming);
          d.lyricsFrom = { mediaId: rec ? rec.id : null, source: 'timing', title: song.title, timed: true };
          d.lyricsTimed = markTimed(null, 'song', song.lyricTiming.savedAt);
        } else if (song.lyrics.trim()) {
          d.lyrics = linesFromText(song.lyrics, +(timelineToSong(0, d.song) + 0.5).toFixed(2), 2.5);
          d.lyricsFrom = { mediaId: rec ? rec.id : null, source: 'manager', title: song.title };
          d.lyricsTimed = null;
        }
        d.managerSongId = song.id;
        autoCover(d.endCard, songCoverOf(song));
      });
      const b = manager.artistBand(manager.currentArtist());
      if (b && (b.theme || b.logoId)) applyArtist(manager.currentArtist(), { quiet: true });
      setMode('studio');
      ui.openTab(song.lyrics.trim() || timed ? 'lyrics' : 'start');
      if (rec && opts.askPart) setTimeout(() => store.get().managerSongId === song.id && ui.openSongPart(), 0);
      toast(`“${song.title}” is in the editor${timed ? (plan.stale ? ' with its saved timing, but the lyrics changed since they were timed: re-time or keep it on the Lyrics tab.' : ', its lyrics already in time.') : song.lyrics.trim() ? '. Next: tap along to sync the lyrics.' : '.'}`, plan.stale ? 'error' : 'info', 6000);
    },
  },
});
// The Video Studio's "From your songs" list: the open artist's stems, music videos and footage.
ui.songFiles = () =>
  studioSongFiles(manager.store.get().songs, (id) => {
    const m = id && media.peek(id); // names and lengths only: no file is opened for a list
    return m ? { id: m.id, name: m.name, kind: m.kind, duration: m.duration || 0, thumb: m.thumb || null, title: m.title || '' } : null;
  });
ui.sendToEdit = (id, how) => {
  const rec = media.get(id);
  if (rec) sendToEdit(rec, how);
};
// Export tab: the song's marked sections (see panel-sections.js)
let previewStop = null;
ui.sectionsPanel = () =>
  sectionsExport({
    store,
    engine,
    manager,
    render: () => ui.refreshPanels(true),
    seekPlay(from, to) {
      clearInterval(previewStop);
      engine.seek(from);
      engine.play();
      previewStop = setInterval(() => {
        if (!engine.playing || engine.t >= to) {
          if (engine.t >= to) engine.pause();
          clearInterval(previewStop);
        }
      }, 30);
    },
  });
ui.openSongFiles = (songId) => {
  setMode('manager');
  manager.go('songs', songId, 'files');
};

// ------------------------------------------------------------ photo studio
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** The open artist's details for the Photo Studio's templates. */
function photoContext() {
  const m = manager.store.get();
  const b = m.band;
  const theme = b.theme ? themeById(b.theme) : null;
  const logo = b.logoId && media.peek(b.logoId);
  const photoIds = [b.photoId, ...(b.epkPhotos || []), ...(m.photos || []).map((p) => p.mediaId)].filter((id, i, a) => id && a.indexOf(id) === i && media.has(id));
  const venueName = (id) => (m.venues.find((v) => v.id === id) || {}).name || '';
  return {
    band: b,
    colors: theme ? theme.colors : null,
    font: theme ? theme.font : 'Bebas Neue',
    logo: logo ? { id: logo.id, w: logo.width, h: logo.height } : null,
    photoIds,
    songs: m.songs,
    shows: m.shows,
    tours: (m.tours || []).map((t) => ({ ...t, stops: t.stops.map((s) => ({ ...s, venueName: venueName((s.picks.find((p) => p.status === 'yes') || {}).venueId) })) })),
    currentSongId: manager.currentSong()?.id || '',
    // the Photos page's folders, and which folder each library photo is in
    photoFolders: m.photoFolders || [],
    releases: m.releases || [],
    /** A song's cover: its own, else its EP's or album's (a media id or null). */
    coverOf: (song) => coverOf(song, m.releases || []),
    photoFolderOf: Object.fromEntries((m.photos || []).map((p) => [p.mediaId, p.folder || ''])),
    today: todayStr(),
  };
}
photo = createPhotoStudio({
  root: photoRoot,
  studio: {
    images: () => media.all().filter((x) => x.kind === 'image').map((x) => ({ id: x.id, name: x.name, thumb: x.thumb, url: x.url, width: x.width, height: x.height })),
    get: (id) => media.get(id),
    /** Open the files of a design (before an export). */
    ensure: (ids) => ensureMany(ids),
    fileName: (id) => (media.names()[id] || [])[0] || '',
    mediaNames: () => media.names(),
    learnNames: (names) => media.learnNames(names),
    addVideoProjects: (entries) => projects.addEntries(entries),
    fonts: () => media.all().filter((x) => x.kind === 'font' && x.family).map((x) => x.family),
    async upload(files) {
      const out = [];
      for (const f of files) {
        if (kindOf(f.type || '', f.name) !== 'image') continue;
        try {
          const rec = await addMedia(f, f.name, { kind: 'image' });
          out.push({ id: rec.id, name: rec.name });
        } catch (e) {
          toast(e.message, 'error', 5000);
        }
      }
      if (out.length) ui.refreshPanels(true);
      return out;
    },
    async addBlob(blob, name, attribution) {
      const rec = await addMedia(blob, name, { kind: 'image', source: 'stock', attribution });
      ui.refreshPanels(true);
      return rec;
    },
    /** Finished images go to the media library and the open artist's Photos page. */
    async saveToLibrary(blobs, names) {
      const added = [];
      for (const [i, b] of blobs.entries()) {
        const rec = await addMedia(b, names[i], { kind: 'image', source: 'photo-studio' });
        added.push({ id: rec.id, name: rec.name, kind: 'image' });
      }
      manager.store.update((d) => addArtistPhotos(d, added));
      ui.refreshPanels(true);
      return added;
    },
    /** Put an image from the library on a show as its poster. */
    setShowPoster(showId, mediaId) {
      manager.store.update((d) => {
        const s = d.shows.find((x) => x.id === showId);
        if (s) s.posterId = mediaId;
      });
    },
    context: photoContext,
    openCarouselPage: () => ui.goStudio('carousel'),
  },
});
media.onChange(() => mode === 'photo' && photo.mediaChanged());

// ------------------------------------------------------------ replace missing files
// Looks through the edit, every artist's manager data and the photo designs for media ids with no file.
configureRelink({
  has: (id) => media.has(id),
  names: () => media.names(),
  restore: restoreMissing,
  kindOfFile: fileKind,
  sources: { studio: () => [store.get()], manager: () => [manager.workspace()], photo: () => photo.refSources() },
  after() {
    ui.refreshPanels(true);
    timeline.render();
    engine.render();
    manager.show();
    photo.mediaChanged();
    postcheck.refresh();
    refreshRelink();
  },
});
let relinkTimer = null;
const soonRefreshRelink = () => {
  clearTimeout(relinkTimer);
  relinkTimer = setTimeout(refreshRelink, 200);
};
store.subscribe(soonRefreshRelink);
manager.store.subscribe(soonRefreshRelink);
media.onChange(soonRefreshRelink);

// ------------------------------------------------------------ storage and clean up (Manager home)
// Text kept in localStorage that only indexes files (names, quality scores) is not a use of them.
const INDEX_KEYS = new Set(['pvm.mediaNames.v1', 'pvm.frameQuality.v1']);
const MEDIA_ID = /m_[0-9a-z]{6,}/g;
let storageOpenNext = false;
const storageDeps = {
  recs: () => media.all(),
  /** Mac app: { disk: { free, total }, linked: { count, bytes } } from the main process; null in a browser. */
  desktopInfo: isDesktop ? () => desktop.info() : null,
  /** Every id something saved points at: the edit, every artist, the designs, the projects and their versions, and any other saved setting. */
  async used() {
    const versions = await projectStore.allVersions().catch(() => []);
    const ids = idsIn(store.get(), manager.workspace(), photo ? photo.refSources() : [], projects.entries(), versions);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || INDEX_KEYS.has(k)) continue;
      for (const id of String(localStorage.getItem(k) || '').match(MEDIA_ID) || []) if (media.has(id)) ids.add(id);
    }
    return ids;
  },
  removeFiles: (ids) => removeFiles(ids),
  versions: () => projectStore.allVersions(),
  trimVersions: (keep) => projectStore.trimVersions(keep),
  projects: () => projects.entries(),
  async clearModels() {
    const [rt, si] = await Promise.all([import('./ai/runtime.js'), import('./ai/searchindex.js')]);
    await rt.clearModelCache();
    await si.clearSearchIndex();
  },
  backUp: () => manager.backUp(),
};
/** Open the Manager home with the Storage section unfolded (from the storage-full banner). */
function openStorage() {
  storageOpenNext = true;
  setMode('manager');
  manager.go('home');
  requestAnimationFrame(() => document.querySelector('[data-storage]')?.scrollIntoView({ block: 'start' }));
}

// ------------------------------------------------------------ files kept open
// Photos, videos and songs are opened when used (media.js). The open edit's files are opened as soon as the edit
// points at them, so playing never waits; a few seconds after the screen changes, files that neither the edit nor
// the screen in front used since are let go (their element, address and data), and open again when used.
let mediaRefs = new Set();
let mediaBooted = false;
const syncEditMedia = () => {
  if (!mediaBooted) return;
  const now = idsIn(store.get());
  const added = [...now].filter((id) => !mediaRefs.has(id));
  const dropped = [...mediaRefs].some((id) => !now.has(id));
  mediaRefs = now;
  if (added.length) ensureMany(added);
  if (dropped) soonReleaseMedia();
};
let editMediaTimer = null;
store.subscribe(() => {
  clearTimeout(editMediaTimer);
  editMediaTimer = setTimeout(syncEditMedia, 400);
});
let releaseTimer = null;
function soonReleaseMedia() {
  if (!mediaBooted) return;
  clearTimeout(releaseTimer);
  const since = performance.now();
  releaseTimer = setTimeout(() => releaseUnused(idsIn(store.get()), since), 4000);
}
// ------------------------------------------------------------ lyrics for the chosen song
/**
 * Fill the Lyrics tab for a song file. source: 'auto' (when a song is picked: your own lyrics from Songs &
 * releases, else timed lyrics from LRCLIB if that's on), 'manager' or 'online' (the Lyrics tab's buttons).
 * Lyrics you typed or pasted are only replaced when `force` is set; lyrics filled in for another song are.
 */
async function fillLyrics(rec, { source = 'auto', force = false } = {}) {
  await Promise.resolve(); // let the caller's own update (e.g. Make a promo) land first
  if (!rec) return null;
  const s = loadSettings();
  if (source === 'auto' && s.autoLyrics === false) return null;
  const p = store.get();
  const from = p.lyricsFrom;
  if (p.lyrics.length && !force) {
    if (!from || from.mediaId === rec.id) {
      if (source !== 'auto') toast('This edit already has lyrics. Use the button again after clearing them, or pick “Replace”.', 'error', 5000);
      return 'kept';
    }
  }
  const m = manager.store.get();
  const song = songForFile(rec);
  const still = () => store.get().song && store.get().song.mediaId === rec.id;
  const startAt = () => +(timelineToSong(0, store.get().song) + 0.5).toFixed(2);
  if (song && song.instrumental && source === 'auto') {
    if (p.lyrics.length && from) store.update((d) => ((d.lyrics = []), (d.lyricsFrom = null)));
    return 'instrumental';
  }
  // the timing saved on the song comes first: no lookup, no 2.5 s a line
  const plan = songLyricsPlan(song);
  if (source !== 'online' && plan.kind === 'timed') {
    store.update((d) => {
      d.lyrics = lyricsFromTiming(song.lyricTiming);
      d.lyricsFrom = { mediaId: rec.id, source: 'timing', title: song.title, timed: true };
      d.lyricsTimed = markTimed(d.lyricsTimed, 'song', song.lyricTiming.savedAt);
    });
    toast(plan.stale ? `Timed lyrics for “${song.title}” filled in, but the lyrics changed since they were timed: re-time or keep the timing on the Lyrics tab.` : `Timed lyrics for “${song.title}” filled in from the song, already in time.`, plan.stale ? 'error' : 'info', 6000);
    ui.refreshPanels(true);
    return 'timing';
  }
  if (source !== 'online' && song && song.lyrics.trim()) {
    store.update((d) => {
      d.lyrics = linesFromText(song.lyrics, startAt(), 2.5);
      d.lyricsFrom = { mediaId: rec.id, source: 'manager', title: song.title };
      d.lyricsTimed = null;
    });
    toast(`Lyrics for “${song.title}” filled in from Songs & releases. Tap along to time them, or try “Find timed lyrics online”.`, 'info', 6000);
    ui.refreshPanels(true);
    return 'manager';
  }
  if (source === 'manager') {
    toast(song ? `“${song.title}” has no lyrics in Songs & releases yet.` : 'This song file isn’t on a song in Songs & releases.', 'error', 5000);
    return null;
  }
  if (source === 'auto' && s.autoLyricsOnline === false) return null;
  // never send an unreleased song's title to LRCLIB by itself (it can't have it anyway); the button still can
  const today = new Date().toISOString().slice(0, 10);
  if (source === 'auto' && song && !(song.status === 'released' || (song.releaseDate && song.releaseDate <= today))) return null;
  const file = titleFromFile(rec.name);
  // a cover you play: look it up under the artist who wrote it (Songs & releases → Covers)
  const cover = song ? null : findCover(m.covers || [], file.title);
  const title = song ? song.title : cover ? cover.title : file.title;
  const band = m.band.name || '';
  const tries = cover && cover.artist ? [cover.artist] : file.artist && !song ? [file.artist] : [band];
  try {
    let got = null;
    for (const artist of tries) if (!got && artist) got = await fetchLyrics({ artist, title, duration: rec.duration || 0 });
    if (!got && !song) got = await fetchLyrics({ artist: '', title, duration: rec.duration || 0 });
    if (!got || (!got.lines && !got.plain.trim())) {
      if (source === 'online') toast(`LRCLIB has no lyrics for “${title}”${tries[0] ? ` by ${tries[0]}` : ''}. Paste them below, or add them to the song in Songs & releases.`, 'error', 6000);
      return null;
    }
    if (!still()) return null; // they picked another song meanwhile
    store.update((d) => {
      d.lyrics = got.lines ? got.lines.map((l) => ({ ...l, id: uid('lyr') })) : linesFromText(got.plain, startAt(), 2.5);
      d.lyricsFrom = { mediaId: rec.id, source: 'lrclib', title: got.match.title, artist: got.match.artist, timed: got.timed };
      d.lyricsTimed = got.timed ? markTimed(d.lyricsTimed, 'lrclib', '') : null;
    });
    toast(`${got.timed ? 'Timed lyrics' : 'Lyrics'} for “${got.match.title}” by ${got.match.artist} filled in from LRCLIB${got.timed ? ', already in time with the song' : '. Tap along to time them'}.`, 'info', 6000);
    ui.refreshPanels(true);
    return 'lrclib';
  } catch (e) {
    if (source === 'online') toast(`Could not reach LRCLIB: ${e.message || 'network error'}.`, 'error', 5000);
    return null;
  }
}
/** The edit's song in Songs & releases (its "Key / tuning" text picks the draft's tuning). */
ui.linkedSong = () => (manager ? manager.store.get().songs.find((x) => x.id === store.get().managerSongId) || null : null);
/** A tab saved from a stem: list it on the song's Files tab, marked "Draft from stem". */
ui.draftTabSaved = (rec) => {
  const song = ui.linkedSong();
  if (!song) return;
  manager.store.update((d) => {
    const s = d.songs.find((x) => x.id === song.id);
    if (!s) return;
    addTabs(s, [rec]);
    const t = s.files.tabs.find((x) => x.mediaId === rec.id);
    if (t) t.draft = true;
  });
};
ui.onSongChosen = (rec) => fillLyrics(rec, { source: 'auto' });
/** Cover art of this artist's songs, EPs and albums (Songs & releases), the edit's song first, for the End card picker. */
/** The edit's song in Songs & releases, your songs with a song file, and the current song's stems and tabs. */
ui.songContext = () => {
  if (!manager) return null;
  const p = store.get();
  return studioSongContext(manager.store.get(), { songId: p.managerSongId || '', audioId: p.song ? p.song.mediaId : '', info: (id) => media.peek(id), findSong });
};
// A new tab, drum chart or rhythm game layer starts on the edit's song's Guitar Pro file
setSongTabs(() => (ui.songContext() || { tabs: [] }).tabs);
/**
 * The song Tab Studio works for: the edit's song when you came from the Video Studio, else the song open in the
 * Manager, else the edit's song. The whole song (with its files), or null.
 */
ui.tabSong = () => {
  if (!manager) return null;
  const edit = linkedSong();
  const cur = manager.currentSong();
  const open = cur && manager.store.get().songs.find((s) => s.id === cur.id);
  return (tabFrom === 'studio' && edit && edit.song) || open || (edit && edit.song) || null;
};
/** Tab Studio's "Open its Files tab": the song's Files tab in the Manager. */
ui.openSongFiles = (songId) => {
  const s = manager && manager.findSong(songId);
  if (!s) return;
  setMode('manager');
  if (s.artistId !== manager.currentArtist()) manager.switchArtist(s.artistId, 'songs', s.id, 'files');
  else manager.go('songs', s.id, 'files');
};
/** A song's cover (its own, else its EP's or album's) when the picture is in this library, else null. */
const songCoverOf = (song) => {
  const id = song && manager ? coverOf(song, manager.store.get().releases || []) : null;
  return id && media.has(id) ? id : null;
};
/** The edit's song's cover for the End card tab, and "Use the song's cover": hand the cover back to the song. */
ui.songCover = () => {
  const l = linkedSong();
  return l && l.open ? songCoverOf(l.song) : null;
};
ui.useSongCover = () => {
  const id = ui.songCover();
  if (id) store.update((d) => autoCover(d.endCard, id, { force: true }));
  return !!id;
};
/** Put one of your songs in the edit: its song file, and the edit linked to it (stems, tabs, lyrics follow). */
ui.chooseSong = (songId) => {
  const m = manager.store.get();
  const s = m.songs.find((x) => x.id === songId);
  const rec = s && s.audioId && media.get(s.audioId);
  if (!rec) return;
  store.update((d) => {
    d.managerSongId = s.id;
    if (!d.endCard.title || d.endCard.title === 'Song Title') d.endCard.title = s.title;
    if ((!d.endCard.artist || d.endCard.artist === 'Artist Name') && m.band.name) d.endCard.artist = m.band.name;
    autoCover(d.endCard, songCoverOf(s));
  });
  panels.actions.useSong(rec);
};
/** Write a tempo into the song's BPM box (Songs & releases); false when the edit isn't one of your songs. */
ui.saveSongBpm = (bpm) => {
  const ctx = ui.songContext();
  if (!ctx || !ctx.song) return false;
  manager.store.update((d) => {
    const s = d.songs.find((x) => x.id === ctx.song.id);
    if (s) s.bpm = String(+(+bpm).toFixed(2));
  });
  return true;
};
/** Files uploaded in the studio for the current song: add them to its stems in Songs & releases too. */
ui.addStemsToSong = (recs) => {
  const ctx = ui.songContext();
  if (!ctx || !ctx.song) return 0;
  let n = 0;
  manager.store.update((d) => {
    const s = d.songs.find((x) => x.id === ctx.song.id);
    if (s) n = addStems(s, recs);
  });
  return n;
};
/** What the song templates can use for the song in the edit (null when the edit isn't one of your songs). */
const beatsFor = new Map();
ui.songTemplateContext = () => {
  const sc = ui.songContext();
  if (!sc || !sc.song) return sc ? { song: null } : null;
  const m = manager.store.get();
  const s = sc.song;
  const p = store.get();
  const audio = (s.audioId && media.peek(s.audioId)) || (p.song && media.peek(p.song.mediaId)) || null;
  if (audio && audio.envelope && !beatsFor.has(audio.id)) beatsFor.set(audio.id, detectBeats(audio.envelope, audio.envRate || 100));
  const f = s.files || {};
  const vrec = f.video && media.peek(f.video.mediaId);
  const footage = (f.footage || []).map((c) => media.peek(c.mediaId)).filter((r) => r && (r.kind === 'video' || r.kind === 'image'));
  const key = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const midis = media.all().filter((r) => r.kind === 'midi' && key(s.title).length >= 3 && key(r.name).includes(key(s.title)));
  const tabs = sc.tabs.map((id) => media.peek(id)).filter(Boolean);
  const stems = (f.stems || []).map((st) => ({ rec: media.peek(st.mediaId), role: st.role })).filter((x) => x.rec);
  return {
    song: s,
    band: m.band.name || '',
    audio,
    beats: p.beats && p.beats.source ? p.beats : audio ? beatsFor.get(audio.id) || null : null,
    video: vrec && vrec.kind === 'video' ? { rec: vrec, offset: f.video.offset || 0 } : null,
    footage,
    parts: gameParts({ tabs, midis, stems }),
    cover: songCoverOf(s),
    hasLyrics: p.lyrics.length > 0,
    today: new Date().toISOString().slice(0, 10),
    // the cover as a library image, for the Chorus promo when there's no footage or music video
    coverRec: (() => {
      const r = media.peek(coverOf(s, m.releases || []));
      return r && r.kind === 'image' ? r : null;
    })(),
  };
};
/** "Which part of the song?": entire song, one section, several sections or a range (panel-songpart.js). */
ui.openSongPart = (opts = {}) => {
  if (opts.songId && store.get().managerSongId !== opts.songId) {
    ui.chooseSong(opts.songId);
    if (store.get().managerSongId !== opts.songId) {
      const s = manager.store.get().songs.find((x) => x.id === opts.songId);
      return toast(`“${s ? s.title : 'This song'}” has no song file yet: add it on its Overview in Songs & releases.`, 'error', 6000), null;
    }
    ui.refreshPanels(true);
  }
  // an edit a song template made is re-made for the new part (with a warning when it was changed by hand since)
  const p = store.get();
  const tpl = SONG_TEMPLATES.find((t) => t.id === p.template);
  const made = tpl && p.songPart && p.songPart.songId === p.managerSongId && (p.songPart.template === tpl.id || p.songPart.byTemplate === tpl.id);
  const remake = made && !opts.picture
    ? {
        name: tpl.name,
        edited: !p.songPart.sig || p.songPart.sig !== editSignature(p),
        run: (choice) => {
          const game = (p.layers || []).find((l) => l.type === 'game' && l.fromTemplate);
          return ui.applySongTemplate(tpl.id, { part: choice, ...(game && game.gameTheme ? { gameTheme: game.gameTheme } : {}) });
        },
      }
    : null;
  return openSongPart({ store, engine, ctx: () => ui.songTemplateContext(), refresh: () => ui.refreshPanels(true), detect: (id) => ui.detectSongSections(id), picture: opts.picture || null, remake });
};
/** The part of the song templates are built for (null: each template's own pick), and its inline picker. */
// the Chorus promo keeps its own chorus unless the part was picked on the picker
ui.templatePart = (id = '') => {
  const c = templatePartChoice(store.get(), ui.songTemplateContext());
  return id === 'st-chorus' && !templatePartPicked() ? null : c;
};
ui.templatePartPicker = () =>
  templatePartPicker({
    store,
    ctx: () => ui.songTemplateContext(),
    detect: (id) => ui.detectSongSections(id),
    onChange: () => ui.refreshPanels(true),
    openMore: (start, choose) => openSongPart({ store, engine, ctx: () => ui.songTemplateContext(), refresh: () => ui.refreshPanels(true), detect: (id) => ui.detectSongSections(id), start, choose }),
  });
ui.songPartSummary = () => partSummary(store.get(), ui.songTemplateContext());
/** Open a song's Sections tab in the Manager and start detecting its sections from the audio. */
ui.detectSongSections = (songId) => {
  requestDetect(songId);
  setMode('manager');
  manager.go('songs', songId, 'sections');
};
/** Make a song template, then line its highways up with the song by listening. Returns the facts, or throws. */
ui.applySongTemplate = (id, opts = {}) => {
  // opts.part: the part of the song (null or kind 'own': the template's own pick); the Templates tab's pick by default
  const ctx = { ...ui.songTemplateContext(), part: 'part' in opts ? opts.part : ui.templatePart(id), ...opts };
  let facts = [];
  const key = `songtpl-${Date.now()}-${Math.random()}`; // the template and its auto-sync are one undo step
  store.update((d) => (facts = applySongTemplate(d, id, ctx)), key);
  if (id === 'st-game') {
    const synced = [];
    const kept = [];
    const patches = new Map();
    const p = store.get();
    for (const L of p.layers.filter((l) => l.type === 'game' && l.visible !== false)) {
      // a highway on one of the song's tab files already started on its saved sync: keep it (Auto-sync re-listens)
      const own = L.source === 'tab' && songSync.tab(L.mediaId);
      if (own && own.saved) {
        kept.push(L.label || L.name);
        continue;
      }
      const r = syncLayer(p, L);
      if (!r.error) (patches.set(L.id, r.patch), synced.push(r.sure === 'unsure' ? `${L.label || L.name} (check it)` : L.label || L.name));
    }
    if (patches.size) store.update((d) => d.layers.forEach((x) => patches.has(x.id) && Object.assign(x, patches.get(x.id))), key);
    if (kept.length) facts.push(`On the sync saved on the song: ${kept.join(', ')}`);
    if (synced.length) facts.push(`Auto-synced to the song: ${synced.join(', ')}`);
    else if (!kept.length) facts.push('Stems are still being analysed: press Auto-sync on each highway in a moment');
  }
  // what the template made, to tell later (Song part → Change) whether it was changed by hand
  store.patch((d) => d.songPart && (d.songPart.sig = editSignature(d)));
  engine.seek(0);
  ui.refreshPanels(true);
  return facts;
};
ui.songCovers = () => (manager ? songCovers(manager.store.get(), { firstSongId: store.get().managerSongId || '' }).filter((c) => media.has(c.mediaId)) : []);
ui.lyricsTools = {
  fill: (rec, opts) => fillLyrics(rec, opts),
  /** What the Lyrics tab can offer for the song in the edit. */
  info: (rec) => {
    const song = rec && manager ? songForFile(rec) : null;
    const link = linkedSong();
    const timingFor = link ? { title: link.song.title, timing: link.song.lyricTiming, stale: timingStale(link.song), other: !link.open, conflict: timingConflict === link.song.id } : null;
    return { song, hasLyrics: !!(song && (song.lyrics.trim() || song.lyricTiming)), instrumental: !!(song && song.instrumental), timingFor };
  },
  saveTiming: (opts) => saveTimingToSong(opts),
  /** "Keep the timing": the song's edited words are the ones its timing belongs to. */
  keepTiming: () => {
    const link = linkedSong();
    if (!link || !link.open) return;
    manager.store.update((d) => keepTiming(d.songs.find((s) => s.id === link.song.id)));
    ui.refreshPanels(true);
  },
  /** "Re-time with the new lyrics": the song's new words, each line at its old line's time; tap-sync next. */
  retime: () => {
    const link = linkedSong();
    if (!link) return;
    store.update((d) => {
      d.lyrics = retimeLines(link.song);
      d.lyricsFrom = { mediaId: d.song ? d.song.mediaId : null, source: 'manager', title: link.song.title };
      d.lyricsTimed = null;
    });
    toast('The new lyrics are in, each line at its old line’s time. Tap-sync them to fix the times, and the new timing is saved on the song.', 'info', 6000);
    ui.refreshPanels(true);
  },
};

// ------------------------------------------------------------ lyric timing kept on the song
/** The song the edit is linked to (managerSongId): { song, open } where open = it's the open artist's. */
function linkedSong() {
  const id = store.get().managerSongId;
  if (!id || !manager) return null;
  const own = manager.store.get().songs.find((s) => s.id === id);
  if (own) return { song: own, open: true };
  const any = manager.songById(id);
  return any ? { song: any.song, open: false } : null;
}
/** The Manager song for a song file: the edit's linked song when it uses that file, else by file or title. */
function songForFile(rec) {
  const link = linkedSong();
  if (link && link.song.audioId === rec.id) return link.song;
  return findSong(manager.store.get().songs, rec);
}
let timingConflict = ''; // the song whose saved timing differs from the edit's (only "Replace" saves over it)
const savedHere = new Map(); // song id → savedAt of the timing this tab saved last
/**
 * Save the edit's lyric lines as its song's timing. Automatic saves never overwrite a different timing
 * the song already has (made in another edit or imported): they note the conflict and the Lyrics tab
 * offers "Replace". Returns 'saved', 'same', 'conflict' or a reason it couldn't.
 */
function saveTimingToSong({ auto = false, replace = false } = {}) {
  const p = store.get();
  const link = linkedSong();
  if (!link) {
    if (!auto) toast('Pick one of your songs in the Audio tab first, so the timing has a song to go on.', 'error', 5000);
    return 'none';
  }
  if (!link.open) {
    if (!auto) toast(`“${link.song.title}” belongs to another artist. Open that artist in the Manager, then save the timing.`, 'error', 6000);
    return 'other';
  }
  const rec = p.song && media.get(p.song.mediaId);
  const timing = timingFromLyrics(p.lyrics, { source: timingSourceOf(p.lyricsTimed, link.song.lyricTiming), songLength: (rec && rec.duration) || 0 });
  if (!timing) return 'none';
  const basedOn = (p.lyricsTimed && p.lyricsTimed.basedOn) || '';
  let decision = replace ? 'save' : autoSaveDecision(link.song, timing, basedOn);
  if (decision === 'conflict' && basedOn && link.song.lyricTiming && savedHere.get(link.song.id) === link.song.lyricTiming.savedAt) decision = 'save';
  if (decision === 'conflict') {
    if (timingConflict !== link.song.id) toast(`“${link.song.title}” already has a different timing saved, so it was kept. Press “Replace the song’s timing” on the Lyrics tab to save this one instead.`, 'info', 7000);
    timingConflict = link.song.id;
    ui.refreshPanels(true);
    return 'conflict';
  }
  if (decision === 'same') {
    if (!auto) toast(`The timing on “${link.song.title}” is already up to date.`);
    return 'same';
  }
  let saved = null;
  manager.store.update((d) => {
    const s = d.songs.find((x) => x.id === link.song.id);
    if (s) saved = setSongTiming(s, timing);
  });
  if (!saved) return 'none';
  savedHere.set(link.song.id, saved.savedAt);
  timingConflict = '';
  // bookkeeping only: not an undo step of its own
  store.patch((d) => (d.lyricsTimed = { ...(d.lyricsTimed || markTimed(null, saved.source)), basedOn: saved.savedAt }));
  toast(`Timing saved on “${link.song.title}” (${saved.lines.length} lines). Every edit of it starts in time now.`, 'info', 4000);
  ui.refreshPanels(true);
  return 'saved';
}
// a timing change in the edit (tap-sync, timed lyrics, an .lrc, a shift, a drag) saves it on the song shortly after
let timingRev = store.get().lyricsTimed ? store.get().lyricsTimed.rev : 0;
let timingTimer = null;
store.subscribe((p, meta) => {
  const lt = p.lyricsTimed;
  const rev = lt ? lt.rev : 0;
  if (rev === timingRev) return;
  timingRev = rev;
  if (meta.type !== 'update' || !lt || lt.by === 'song' || !p.managerSongId) return;
  clearTimeout(timingTimer);
  timingTimer = setTimeout(() => saveTimingToSong({ auto: true }), 800);
});

// ------------------------------------------------------------ music video and Guitar Pro sync kept on the song
// Lining up the song's music video (Sound sync, nudges, Line it up by listening, trimming its in-point) or one of the
// song's Guitar Pro files (Auto-sync, Put bar at the playhead, nudges, speed, dragging the layer) saves it on the song
// shortly after, by the same rules as lyric timing: an automatic save never replaces a different value the song
// already has (made in another edit or another session); the panel offers "Replace" instead. A new layer of one of
// the song's tab files starts on its saved sync. Undo changes the edit only, not what was saved on the song.
const syncConflicts = new Set(); // 'video:<song id>' / 'tab:<song id>:<file id>'
const syncSavedHere = new Map(); // the same keys → savedAt of what this tab saved there last
let pointerHeld = false;
addEventListener('pointerdown', () => (pointerHeld = true), true);
addEventListener('pointerup', () => (pointerHeld = false), true);
addEventListener('pointercancel', () => (pointerHeld = false), true);
/** Rebuild the panels, but not in the middle of a drag (that would drop it): after it ends. */
const refreshSoon = () => (pointerHeld ? addEventListener('pointerup', () => setTimeout(() => ui.refreshPanels(true), 0), { once: true, capture: true }) : ui.refreshPanels(true));
/** The edit plays the song's own song file, so times in it are times in the song. */
const playsSong = (p, song) => !!(p.song && song && (!song.audioId || p.song.mediaId === song.audioId));
const tabName = (id) => {
  const r = media.peek(id);
  return r ? r.title || r.name : 'the tab';
};
function commitSync({ key, song, decision, auto, write, savedText, conflictText }) {
  if (decision === 'conflict') {
    if (!syncConflicts.has(key)) toast(conflictText, 'info', 7000);
    syncConflicts.add(key);
    refreshSoon();
    return 'conflict';
  }
  if (decision === 'same') {
    if (syncConflicts.delete(key)) refreshSoon();
    if (!auto) toast(`That is already saved on “${song.title}”.`);
    return 'same';
  }
  let saved = null;
  manager.store.update((m) => {
    const s = m.songs.find((x) => x.id === song.id);
    if (s) saved = write(s);
  });
  if (!saved) return 'none';
  syncSavedHere.set(key, saved.savedAt);
  syncConflicts.delete(key);
  toast(savedText(saved), 'info', 5000);
  refreshSoon();
  return 'saved';
}
const songSync = {
  /** The edit's song (one of the open artist's songs), or null. */
  song: () => {
    const sc = manager && ui.songContext ? ui.songContext() : null;
    return (sc && sc.song) || null;
  },
  /** The song's music video: { song, mvId, saved, conflict }, or null when the edit's song has none. */
  video() {
    const song = songSync.song();
    const v = song && song.files && song.files.video;
    return v ? { song, mvId: v.mediaId, saved: savedVideoSync(song), conflict: syncConflicts.has(`video:${song.id}`) } : null;
  },
  /** One of the song's Guitar Pro files: { song, saved, conflict }, or null when the file isn't on the edit's song. */
  tab(mediaId) {
    const song = songSync.song();
    if (!song || !((song.files && song.files.tabs) || []).some((t) => t.mediaId === mediaId)) return null;
    return { song, saved: savedTabSync(song, mediaId), conflict: syncConflicts.has(`tab:${song.id}:${mediaId}`) };
  },
  /** Save the music video's sync point (`replace` saves over a different one; `songId` picks the song). */
  saveVideo(point, { auto = false, replace = false, songId = '' } = {}) {
    const song = songId && manager ? manager.store.get().songs.find((s) => s.id === songId) : songSync.song();
    if (!song || !song.files || !song.files.video) return 'none';
    const key = `video:${song.id}`;
    const decision = replace ? 'save' : autoSyncDecision(savedVideoSync(song), point, (a, b) => sameVideoSync(a.offset, b), syncSavedHere.get(key));
    return commitSync({
      key,
      song,
      decision,
      auto,
      write: (s) => setVideoSync(s, point),
      savedText: (s) => `Music video sync saved on “${song.title}”: ${describeSyncPoint(s.offset)} Templates, section exports and new clips of it start there.`,
      conflictText: `“${song.title}” already has a different music video sync saved, so it was kept. Press “Save as “${song.title}”’s music video sync” in Sound sync to replace it.`,
    });
  },
  /** Save a Guitar Pro file's sync { offset, tempoScale, bar? } on the song. */
  saveTab(mediaId, sync, { auto = false, replace = false } = {}) {
    const song = songSync.song();
    if (!songSync.tab(mediaId)) return 'none';
    const key = `tab:${song.id}:${mediaId}`;
    const decision = replace ? 'save' : autoSyncDecision(savedTabSync(song, mediaId), sync, sameTabSync, syncSavedHere.get(key));
    return commitSync({
      key,
      song,
      decision,
      auto,
      write: (s) => setTabSync(s, mediaId, sync),
      savedText: (s) => `Sync of “${tabName(mediaId)}” saved on “${song.title}”: ${describeTabSync(s)}. New layers of it start there.`,
      conflictText: `“${song.title}” already has a different sync saved for “${tabName(mediaId)}”, so it was kept. Press “Replace the song’s sync” in the layer’s Sync section to save this one.`,
    });
  },
  /** Where a new clip of `rec` should start (its saved sync point) when it's the song's music video, else null. */
  videoPoint(rec) {
    const v = songSync.video();
    return v && rec && v.mvId === rec.id && v.saved && playsSong(store.get(), v.song) ? v.saved.offset : null;
  },
};
ui.songSync = songSync;
/** Each clip with where it starts on the timeline: the main track's and the picture-in-picture layers'. */
const clipPlaces = (p) => [
  ...layoutClips(p.clips || []).map((l) => ({ id: l.clip.id, mediaId: l.clip.mediaId, in: l.clip.in, speed: l.clip.speed, start: l.start })),
  ...(p.layers || []).filter((L) => L.type === 'video').flatMap((L) => (L.clips || []).map((c) => ({ id: c.id, mediaId: c.mediaId, in: c.in, speed: c.speed, start: c.start || 0 }))),
];
// what the edit had last time (every layer and clip), so only what an edit changes counts
let tabSeen = tabSyncChanges(new Map(), store.get().layers, [], () => null).seen;
let vidSeen = videoSyncChange(new Map(), clipPlaces(store.get()), '').seen;
let syncTimer = null;
const pendingSync = { video: null, tabs: new Map() };
function flushSync() {
  const v = pendingSync.video;
  pendingSync.video = null;
  if (v != null) songSync.saveVideo(v, { auto: true });
  for (const [id, s] of pendingSync.tabs) songSync.saveTab(id, s, { auto: true });
  pendingSync.tabs.clear();
}
store.subscribe((p, meta) => {
  const song = songSync.song();
  const ok = playsSong(p, song);
  const tabIds = ok ? ((song.files && song.files.tabs) || []).map((t) => t.mediaId) : [];
  const tc = tabSyncChanges(tabSeen, p.layers, tabIds, (id) => savedTabSync(song, id));
  tabSeen = tc.seen;
  // each clip's start as song time, so a clip in a later song part (song.parts) is measured against its own part
  const vc = videoSyncChange(vidSeen, clipPlaces(p).map((c) => ({ ...c, start: timelineToSong(c.start, p.song) })), ok && song.files && song.files.video ? song.files.video.mediaId : '', 0);
  vidSeen = vc.seen;
  if (meta.type !== 'update' || !ok) return;
  if (tc.fresh.length) {
    const map = new Map(tc.fresh.map((f) => [f.id, f.sync]));
    store.patch((d) => d.layers.forEach((L) => map.has(L.id) && Object.assign(L, syncPatch(map.get(L.id)))));
    toast(`Started on the sync saved on “${song.title}” (${describeTabSync(tc.fresh[0].sync)}). Auto-sync still re-listens if you want.`, 'info', 5000);
  }
  for (const e of tc.edited) pendingSync.tabs.set(e.mediaId, e.sync);
  if (vc.point != null) pendingSync.video = vc.point;
  if (tc.edited.length || vc.point != null) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(flushSync, 800);
  }
});

/** Open the Photo Studio on a template (from the Manager: a song, a show, a tour). */
function openPhoto(templateId, { songId = '', showId = '', tourId = '', releaseId = '' } = {}) {
  const c = photoContext();
  const rel = releaseId && c.releases.find((r) => r.id === releaseId);
  // an EP or album stands in for the song: its title, date and cover
  const song = c.songs.find((s) => s.id === songId) || (rel ? { title: rel.title, releaseDate: rel.releaseDate, coverId: rel.coverId } : null);
  const show = c.shows.find((s) => s.id === showId) || null;
  const tour = c.tours.find((t) => t.id === tourId) || null;
  const extra = { song, show, coverId: rel ? rel.coverId : '' };
  if (tour) Object.assign(extra, { tourName: tour.name, dates: tour.stops.filter((s) => s.status !== 'dropped').map((s) => ({ date: s.date, city: s.city, venue: s.venueName })) });
  else extra.dates = c.shows.filter((s) => s.date && s.date >= c.today && s.status !== 'cancelled').sort((a, b) => a.date.localeCompare(b.date)).map((s) => ({ date: s.date, city: s.city, venue: s.venue }));
  setMode('photo');
  photo.openTemplate(templateId, extra);
}
/** Put a library file into the edit (see studio.useInEditor for `how`). */
function sendToEdit(rec, how) {
  if (how === 'clip') return panels.actions.addClip(rec);
  if (how === 'tab') return panels.actions.useTab(rec);
  if (how === 'tabstudio') {
    const own = songSync.tab(rec.id);
    const offset = own && own.saved ? own.saved.offset : NEW_CHART_OFFSET;
    loadTabStudio().then((t) => {
      t.openInTabStudio(rec, offset);
      setMode('tabstudio');
    });
    return;
  }
  if (how === 'audio') return panels.actions.addAudioTrack(rec);
  let selectId = null;
  store.update((d) => {
    if (how === 'overlay') {
      let L = (d.layers || []).find((l) => l.type === 'video');
      if (!L) {
        L = makeLayer(d, 'video');
        d.layers.push(L);
      }
      const clip = makeOverlayClip(rec, Math.min(engine.t, Math.max(0, d.duration - 1)));
      // the song's music video starts in sync with the song
      const pt = songSync.videoPoint(rec);
      if (pt != null) clip.in = inForSyncPoint(pt, clip.start, songOffsetAt(clip.start, d.song), rec.duration, clip.duration);
      L.clips.push(clip);
      selectId = L.id;
    } else if (how === 'drums') {
      const L = { ...makeLayer(d, 'drums'), source: 'audio', mediaId: rec.id, offset: 0, name: `Drums: ${rec.name.replace(/\.[a-z0-9]+$/i, '')}` };
      d.layers.push(L);
      selectId = L.id;
    } else if (how === 'viz') {
      const L = { ...makeLayer(d, 'viz'), source: rec.id, name: `Visualizer: ${rec.name.replace(/\.[a-z0-9]+$/i, '')}` };
      d.layers.push(L);
      selectId = L.id;
    }
  });
  const what = { overlay: 'as picture-in-picture at the playhead', drums: 'as a drum chart (hits are found from the stem)', viz: 'as a visualizer' }[how];
  if (what) toast(`Added “${rec.name}” ${what}`);
  if (selectId) {
    ui.select({ type: 'layer', id: selectId });
    ui.openTab('layers');
  }
}
/** Put an artist's name, theme and logo on the current edit. */
function applyArtist(id, { quiet = false } = {}) {
  const band = manager.artistBand(id);
  if (!band) return;
  store.update((d) => {
    d.artistId = id;
    if (band.name) d.endCard.artist = band.name;
    if (band.theme && themeById(band.theme)) applyTheme(d, band.theme);
    if (band.logoId && media.has(band.logoId)) d.look.watermark = { ...d.look.watermark, mediaId: band.logoId };
  });
  if (!quiet) toast(`Promo set to ${band.name}${band.theme ? `, with the ${themeById(band.theme)?.name || ''} theme` : ''}${band.logoId ? ' and logo' : ''}. Undo (Ctrl+Z) to go back.`);
}
function syncArtistSel() {
  const list = manager.artists();
  const cur = store.get().artistId && list.some((a) => a.id === store.get().artistId) ? store.get().artistId : '';
  artistSel.replaceChildren(h('option', { value: '', disabled: true }, list.length ? 'Artist…' : 'No artists'), ...list.map((a) => h('option', { value: a.id }, a.name)));
  artistSel.value = cur;
  artistSel.hidden = list.length < 2 && !cur;
}

// The app always opens on the Manager. A link ending in #studio (or ?studio) opens the Video Studio, #photo the Photo Studio.
const wantsTabs = location.hash === '#tabstudio' || new URLSearchParams(location.search).has('tabstudio');
let mode = wantsTabs ? 'tabstudio' : location.hash === '#studio' || new URLSearchParams(location.search).has('studio') ? 'studio' : location.hash === '#photo' ? 'photo' : 'manager';
// Tab Studio used to be a page inside the Video Studio. If that was the last thing open, it opens as its own workspace once.
if (localStorage.getItem('pvm.tab') === 'tabstudio') {
  localStorage.setItem('pvm.tab', 'layers');
  if (!location.hash && !location.search) mode = 'tabstudio';
}
let tabFrom = 'manager'; // the workspace Tab Studio was opened from (it works for that workspace's song)
function setMode(m) {
  if (m === 'tabstudio' && mode !== 'tabstudio') tabFrom = mode;
  mode = m;
  localStorage.setItem('pvm.mode.v1', m); // nothing reads it back, but older checks and tools look at it
  // the workspace is in the address, so a reload or a shared link opens the same one
  const url = modeUrl(m, location);
  if (url !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', url);
  // the Photo Studio hides the video editor the same way the Manager does
  document.body.classList.toggle('mode-manager', m === 'manager' || m === 'photo' || m === 'tabstudio');
  document.body.classList.toggle('mode-photo', m === 'photo');
  document.body.classList.toggle('mode-tabstudio', m === 'tabstudio');
  managerRoot.hidden = m !== 'manager';
  photoRoot.hidden = m !== 'photo';
  tabRoot.hidden = m !== 'tabstudio';
  if (tabPage) (tabPage.leave && tabPage.leave(), (tabPage = null));
  if (m === 'tabstudio') {
    tabRoot.scrollTop = 0;
    loadTabStudio().then((t) => {
      // the workspace may have changed while the file loaded
      if (mode !== 'tabstudio' || tabPage) return;
      tabPage = t.buildTabStudio({ store, engine, ui, panels });
      tabRoot.replaceChildren(tabPage.el);
      tabRoot.scrollTop = 0;
    });
  } else tabRoot.replaceChildren();
  for (const b of modeSwitch.children) {
    const on = b.dataset.mode === m;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  }
  tablistKeys(modeSwitch);
  if (m === 'manager') manager.show();
  else if (m === 'photo') photo.show();
  else {
    fitStage();
    timeline.render();
    engine.render();
  }
  syncNowOn();
  panes.refresh();
  if (mobile) mobile.refresh();
  soonReleaseMedia();
}
let mobile = null;

// ------------------------------------------------------------ boot
async function boot() {
  // a tab id saved by an older version (media, stock, layers…) opens its new home
  {
    const [t, f] = PAGES[ui.tab] ? [ui.tab] : panels.resolveTab(ui.tab);
    ui.tab = PAGES[t] || panels.tabs.some((x) => x.id === t) ? t : 'start';
    if (f) setFold(f, true);
  }
  renderRail();
  syncHeader();
  postcheck.refresh();
  rebuildLeft();
  rebuildInspector();
  timeline.render();
  engine.seek(0);
  // Pick the workspace before the first await, so the first paint is the Manager home (or the workspace the
  // link asks for) and never the Video Studio while fonts and media are still loading. Set again below once loaded.
  setMode(mode);
  performance.mark('pvm-first-screen');
  // Bundled fonts must be loaded before canvas text uses them.
  await Promise.all(FONTS.map((f) => document.fonts.load(`40px "${f.id}"`).catch(() => {})));
  engine.render();
  // a big library takes a moment: say how far it is (only shown when it is slow)
  const loadNote = h('div', { class: 'load-note small', role: 'status' });
  let noteTimer = setTimeout(() => document.body.append(loadNote), 600);
  await restoreMedia({ onProgress: (n, total) => (loadNote.textContent = `Loading your files (${n}/${total})…`) });
  clearTimeout(noteTimer);
  loadNote.remove();
  mediaBooted = true;
  syncEditMedia(); // open the edit's own files in the background
  configureRelink({ ready: true }); // from here on, a media id with no file is really missing
  configureTodoAuto({ has: (id) => media.has(id) }); // to-dos tick themselves only for files really in the library
  refreshRelink();
  rebuildLeft();
  rebuildInspector();
  timeline.render();
  engine.seek(engine.t);
  showPage();
  syncArtistSel();
  setMode(mode);
  document.body.classList.add('ready');
  performance.mark('pvm-ready');
}
installDesktopPage(); // Mac app only: in-app viewer for blob: links, the `desktop` class
mobile = initMobile({ header, modeSwitch, nowOn, keep: [undoBtn, redoBtn, exportBtn], tabRail, pageEl, transport, tlToolbar, engine, store, ui, panels, getMode: () => mode, stage });
boot();

// exposed for the automated browser checks in test/
window.__pvm = { store, engine, ui, media, panels, manager, photo, setMode };
