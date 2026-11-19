// App shell: layout, wiring, keyboard shortcuts and autosave.
import { ASPECTS, clipAt, splitClip, formatTime, clamp, linesFromText, timelineToSong } from './core.js';
import { createStore, newProject, loadProject, saveProject, FONTS, findClip } from './state.js';
import { media, restoreMedia, addMedia, kindOf } from './media.js';
import { Engine } from './engine.js';
import { createTimeline } from './timeline.js';
import { createPanels } from './panels.js';
import { h, icon, iconButton, button, toast, setFold, Binder } from './dom.js';
import { PLATFORM_OVERLAYS, overlaySupported } from './overlays.js';
import { buildInspirationPage } from './page-inspiration.js';
import { buildTabStudio, openInTabStudio } from './page-tabstudio.js';
import { buildCarouselPage } from './page-carousel.js';
import { createPostCheck } from './panel-postcheck.js';
import { createTips } from './panel-tips.js';
import { kfTarget, kfSignature } from './panel-kf.js';
import { createManager } from './manager/shell.js';
import { createPhotoStudio } from './photo/page.js';
import { addPhotos as addArtistPhotos } from './manager/photos.js';
import { makeLayer, makeOverlayClip } from './panel-layers.js';
import { studioSongFiles } from './manager/files.js';
import { applyTheme, themeById } from './themes.js';
import { loadSettings } from './state.js';

const store = createStore(loadProject() || newProject());
let manager = null; // the Manager workspace (created below)
let photo = null; // the Photo Studio (created below)

// ------------------------------------------------------------ layout
const app = document.getElementById('app');
const canvas = h('canvas', { class: 'preview', 'aria-label': 'Video preview' });
const stageInner = h('div', { class: 'stage-inner' }, canvas);
const stage = h('div', { class: 'stage' }, stageInner);
const timeLabel = h('span', { class: 'time' });
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
const transport = h(
  'div',
  { class: 'transport' },
  iconButton('skipBack', 'Go to start (Home)', () => engine.seek(0)),
  playBtn,
  iconButton('skipFwd', 'Go to end (End)', () => engine.seek(store.get().duration)),
  timeLabel,
  loopBtn,
  h('label', { class: 'overlay-pick' }, icon('eye', 16), overlaySel),
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
const MODE_KEY = 'pvm.mode.v1';
const modeBtn = (id, label, ic) => h('button', { type: 'button', role: 'tab', class: 'mode-btn', 'data-mode': id, onclick: () => setMode(id) }, icon(ic, 16), h('span', {}, label));
const modeSwitch = h('div', { class: 'mode-switch', role: 'tablist', 'aria-label': 'Workspace' }, modeBtn('manager', 'Manager', 'users'), modeBtn('studio', 'Video Studio', 'film'), modeBtn('photo', 'Photo Studio', 'image'));
const studioOnly = (...els) => h('div', { class: 'studio-only' }, ...els);
// which artist this promo is for (from the Manager): its name, theme and logo go on the edit
const artistSel = h('select', { class: 'artist-sel', 'aria-label': 'Artist for this promo', title: 'Artist: the promo takes their name, theme and logo (set them in Manager → Press kit)' });
artistSel.addEventListener('change', () => applyArtist(artistSel.value));
// what you're working on: the band and the song, in both workspaces
const nowOn = h('button', { type: 'button', class: 'now-on', title: 'The band and song you are working on' });
const header = h(
  'header',
  { class: 'topbar' },
  h('div', { class: 'brand' }, icon('disc', 22), h('span', {}, 'Band Manager')),
  modeSwitch,
  nowOn,
  studioOnly(nameInput, artistSel, aspectSel, undoBtn, redoBtn, saveState),
  h('div', { class: 'spacer' }),
  studioOnly(
    postSlot,
    button('New project', () => {
      if (!confirm('Start a new project? Your media library is kept; the current edit is replaced.')) return;
      store.replace(newProject());
      ui.select(null);
      engine.seek(0);
    }, { variant: 'ghost' }),
    button('Export', () => ui.openTab('export'), { iconName: 'download', variant: 'primary' }),
  ),
);

const zoom = h('input', { type: 'range', min: 10, max: 300, step: 1, 'aria-label': 'Timeline zoom' });
const snapBtn = iconButton('magnet', 'Snap to edges, playhead and beats', () => {
  ui.snap = !ui.snap;
  snapBtn.classList.toggle('on', ui.snap);
  snapBtn.setAttribute('aria-pressed', ui.snap ? 'true' : 'false');
});
const tlToolbar = h(
  'div',
  { class: 'tl-toolbar' },
  button('Split', () => ui.split(), { iconName: 'scissors', variant: 'sm', title: 'Split the clip under the playhead (S)' }),
  button('Delete', () => ui.deleteSelection(), { iconName: 'trash', variant: 'sm', title: 'Delete the selected item (Delete)' }),
  snapBtn,
  h('div', { class: 'spacer' }),
  h('span', { class: 'muted tiny' }, 'Drag blocks to move · drag edges to trim · Ctrl+wheel to zoom'),
  iconButton('zoomOut', 'Zoom out', () => ui.setZoom(ui.pxPerSec / 1.3)),
  zoom,
  iconButton('zoomIn', 'Zoom in', () => ui.setZoom(ui.pxPerSec * 1.3)),
);
const timelineRoot = h('section', { class: 'timeline', 'aria-label': 'Timeline' }, tlToolbar);
const pageEl = h('div', { class: 'page-overlay', hidden: true, role: 'region', 'aria-label': 'Inspiration' });

const managerRoot = h('div', { class: 'manager', role: 'region', 'aria-label': 'Band manager' });
const photoRoot = h('div', { class: 'photo', role: 'region', 'aria-label': 'Photo Studio', hidden: true });
app.append(
  header,
  managerRoot,
  photoRoot,
  h('main', { class: 'workspace' }, tabRail, leftPanel, h('div', { class: 'center' }, stage, transport), inspector, pageEl),
  timelineRoot,
);

// ------------------------------------------------------------ engine + ui state
const engine = new Engine(store, canvas);

const ui = {
  selection: null,
  pxPerSec: 40,
  snap: true,
  follow: true,
  syncing: false,
  tab: (localStorage.getItem('pvm.tab') || 'start').replace(/^guitar$/, 'guitarpro'),
  select(sel) {
    this.selection = sel;
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
    if ((sel && sel.type === 'lyric' && this.tab === 'lyrics') || leftSignature() !== leftSig) rebuildLeft();
  },
  setZoom(v) {
    this.pxPerSec = clamp(v, 10, 300);
    zoom.value = this.pxPerSec;
    timeline.render();
  },
  openTab(req) {
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
  split() {
    const p = store.get();
    // an overlay clip that is selected and under the playhead is split first
    const f = this.selection && this.selection.type === 'clip' ? findClip(p, this.selection.id) : null;
    if (f && f.layer && engine.t > f.clip.start && engine.t < f.clip.start + f.clip.duration) {
      const parts = splitClip(f.clip, engine.t - f.clip.start);
      if (!parts) return toast('Too close to the clip edge to split.');
      parts[1].start = +(f.clip.start + parts[0].duration).toFixed(3);
      store.update((d) => {
        const L = d.layers.find((l) => l.id === f.layer.id);
        const i = L.clips.findIndex((c) => c.id === f.clip.id);
        L.clips.splice(i, 1, ...parts);
      });
      ui.select({ type: 'clip', id: parts[1].id });
      return;
    }
    const hit = clipAt(p.clips, engine.t);
    if (!hit) return toast('Move the playhead over a clip to split it.');
    const parts = splitClip(hit.clip, hit.local);
    if (!parts) return toast('Too close to the clip edge to split.');
    store.update((d) => d.clips.splice(hit.index, 1, ...parts));
    ui.select({ type: 'clip', id: parts[1].id });
  },
  deleteSelection() {
    const sel = this.selection;
    if (!sel) return;
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
zoom.value = ui.pxPerSec;
zoom.addEventListener('input', () => ui.setZoom(parseFloat(zoom.value)));
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
  tabstudio: { label: 'Tab Studio', icon: 'guitar', build: () => buildTabStudio({ store, engine, ui, panels }) },
  carousel: { label: 'Carousel', icon: 'image', build: () => buildCarouselPage({ store, engine, ui, panels, settings: loadSettings() }) },
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
function leftSignature() {
  const p = store.get();
  const parts = [ui.tab, media.all().length, p.aspect];
  if (ui.tab === 'lyrics') parts.push(p.lyrics.map((l) => `${l.id}:${l.start}:${l.end}`).join('|'), panels.sync.active, panels.sync.cursor, ui.selection && ui.selection.id, p.lyricStyle.display);
  const has = (...ids) => ids.includes(ui.tab);
  if (has('audio')) parts.push(p.song && p.song.mediaId, p.beats && p.beats.bpm, p.audioTracks.map((a) => `${a.id}:${a.start}:${a.duration}`).join('|'));
  if (ui.tab === 'text') parts.push(p.texts.map((t) => `${t.id}:${t.text}:${t.start}:${t.end}`).join('|'));
  if (ui.tab === 'export') parts.push(p.clips.length, !!p.song, p.endCard.coverMediaId, p.duration, p.endCard.enabled, p.name, p.endCard.title, p.endCard.artist, p.endCard.cta, p.endCard.subtext);
  if (has('video')) parts.push(p.clips.length);
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
      L && [L.mediaId, L.source, L.track, L.mode, L.style, L.kitFinish, L.followSong, JSON.stringify(L.kitPieces || {}), L.playAudio, L.type === 'video' ? L.clips.length : '', kfSignature(L)].join(','),
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
  return `${s.type}#${s.id}#${exists}#${tg ? kfSignature(tg.item) : ''}`;
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
  keepScroll(leftPanel, () => leftPanel.replaceChildren(h('h2', { class: 'panel-title' }, tab.label), tab.build(leftBinder)));
  leftSig = leftSignature();
}
function rebuildInspector() {
  inspBinder = new Binder(store);
  keepScroll(inspector, () => inspector.replaceChildren(panels.buildInspector(inspBinder)));
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
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveState.textContent = saveProject(store.get()) ? 'Saved in this browser' : 'Could not save (storage full?)';
  }, 500);
});

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
  }
  const a = manager.artists().find((x) => x.id === artistId) || { name: 'No band yet' };
  const ph = a.photoId && media.get(a.photoId);
  const dot = ph && ph.url ? h('span', { class: 'now-dot photo', 'aria-hidden': 'true' }, h('img', { src: ph.url, alt: '' })) : h('span', { class: 'now-dot', 'aria-hidden': 'true' }, (a.name[0] || '?').toUpperCase());
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
  timeLabel.textContent = `${formatTime(engine.t)} / ${formatTime(store.get().duration)}`;
  playBtn.replaceChildren(icon(engine.playing ? 'pause' : 'play', 22));
  playBtn.setAttribute('aria-label', engine.playing ? 'Pause' : 'Play');
  timeline.movePlayhead();
  if (!engine.playing && panels.sync.active) panels.stopSync();
});
playBtn.addEventListener('click', () => engine.toggle());

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

// ------------------------------------------------------------ keyboard
window.addEventListener('keydown', (e) => {
  if (mode === 'photo') return photo && photo.onKey(e);
  if (mode === 'manager') {
    const t = (e.target.tagName || '').toUpperCase();
    if (/INPUT|TEXTAREA|SELECT/.test(t)) return;
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
    case 'o':
    case 'O':
      if (overlaySupported(store.get().aspect)) cycleOverlay();
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
    /** Library files of some kinds, for "pick from the library" menus. */
    libraryFiles: (kinds) => media.all().filter((m) => kinds.includes(m.kind)).map((m) => ({ id: m.id, name: m.name, kind: m.kind })),
    /** Switch to the Video Studio's Video tab. */
    openStudio() {
      setMode('studio');
      ui.select(null);
      ui.openTab('video');
    },
    /** A library file's details, or null when it was removed from the library. */
    mediaInfo(id) {
      const m = id && media.get(id);
      if (!m) return null;
      const tab = m.kind === 'tab' ? { title: m.title || '', tracks: (m.tracks || []).map((t) => t.name), drumTracks: (m.drumTracks || []).length } : {};
      return { id: m.id, name: m.name, kind: m.kind, duration: m.duration || 0, thumb: m.thumb || null, url: m.url, ...tab };
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
      if (open) {
        setMode('studio');
        if (how === 'clip' || how === 'overlay') ui.openTab('video');
      }
    },
    artistsChanged: () => (syncArtistSel(), syncNowOn()),
    /** The Manager's page, artist or song changed: update the header badge. */
    contextChanged: () => syncNowOn(),
    /** Open the Photo Studio on a template: 'promo', 'release', 'countdown', 'show', 'tour'… */
    openPhoto: (id, opts) => openPhoto(id, opts),
    imageFiles: () => media.all().filter((m) => m.kind === 'image').map((m) => ({ id: m.id, name: m.name, thumb: m.thumb || null })),
    /** A library image as a JPEG data URL no larger than `max` px on its long side (for the press kit). */
    async imageDataUrl(id, max = 1400) {
      const rec = media.get(id);
      const img = rec && rec.el;
      if (!img || !img.naturalWidth) return null;
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = h('canvas', { width: Math.round(img.naturalWidth * k), height: Math.round(img.naturalHeight * k) });
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.85);
    },
    /** Put a song's title, lyrics and audio into the video edit, then switch to the studio. */
    openPromo(song) {
      const p = store.get();
      const rec = song.audioId && media.get(song.audioId);
      const parts = ['title', song.lyrics.trim() && 'lyrics', rec && 'song file'].filter(Boolean);
      if ((p.clips.length || p.lyrics.length) && !confirm(`Use “${song.title}” in the current video edit? Its ${parts.join(', ')} replace the edit’s. Undo (Ctrl+Z) in the studio puts them back.`)) return;
      if (rec) panels.actions.useSong(rec);
      store.update((d) => {
        d.name = `${song.title} promo`;
        d.endCard.title = song.title;
        const band = manager.store.get().band.name;
        if (band) d.endCard.artist = band;
        d.artistId = manager.currentArtist();
        if (song.lyrics.trim()) d.lyrics = linesFromText(song.lyrics, +(timelineToSong(0, d.song) + 0.5).toFixed(2), 2.5);
        d.managerSongId = song.id;
      });
      const b = manager.artistBand(manager.currentArtist());
      if (b && (b.theme || b.logoId)) applyArtist(manager.currentArtist(), { quiet: true });
      setMode('studio');
      ui.openTab(song.lyrics.trim() ? 'lyrics' : 'start');
      toast(`“${song.title}” is in the editor${song.lyrics.trim() ? '. Next: tap along to sync the lyrics.' : '.'}`, 'info', 5000);
    },
  },
});
// The Video Studio's "From your songs" list: the open artist's stems, music videos and footage.
ui.songFiles = () =>
  studioSongFiles(manager.store.get().songs, (id) => {
    const m = id && media.get(id);
    return m ? { id: m.id, name: m.name, kind: m.kind, duration: m.duration || 0, thumb: m.thumb || null, title: m.title || '' } : null;
  });
ui.sendToEdit = (id, how) => {
  const rec = media.get(id);
  if (rec) sendToEdit(rec, how);
};
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
  const logo = b.logoId && media.get(b.logoId);
  const photoIds = [b.photoId, ...(b.epkPhotos || []), ...(m.photos || []).map((p) => p.mediaId)].filter((id, i, a) => id && a.indexOf(id) === i && media.get(id));
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
    photoFolderOf: Object.fromEntries((m.photos || []).map((p) => [p.mediaId, p.folder || ''])),
    today: todayStr(),
  };
}
photo = createPhotoStudio({
  root: photoRoot,
  studio: {
    images: () => media.all().filter((x) => x.kind === 'image').map((x) => ({ id: x.id, name: x.name, thumb: x.thumb, url: x.url, width: x.width, height: x.height })),
    get: (id) => media.get(id),
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
    context: photoContext,
  },
});
media.onChange(() => mode === 'photo' && photo.mediaChanged());
/** Open the Photo Studio on a template (from the Manager: a song, a show, a tour). */
function openPhoto(templateId, { songId = '', showId = '', tourId = '' } = {}) {
  const c = photoContext();
  const song = c.songs.find((s) => s.id === songId) || null;
  const show = c.shows.find((s) => s.id === showId) || null;
  const tour = c.tours.find((t) => t.id === tourId) || null;
  const extra = { song, show };
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
    openInTabStudio(rec, +timelineToSong(0, store.get().song).toFixed(3));
    setMode('studio');
    ui.openTab('tabstudio');
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
      L.clips.push(makeOverlayClip(rec, Math.min(engine.t, Math.max(0, d.duration - 1))));
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
    if (band.logoId && media.get(band.logoId)) d.look.watermark = { ...d.look.watermark, mediaId: band.logoId };
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
let mode = location.hash === '#studio' || new URLSearchParams(location.search).has('studio') ? 'studio' : location.hash === '#photo' ? 'photo' : 'manager';
function setMode(m) {
  mode = m;
  localStorage.setItem(MODE_KEY, m);
  // the Photo Studio hides the video editor the same way the Manager does
  document.body.classList.toggle('mode-manager', m === 'manager' || m === 'photo');
  document.body.classList.toggle('mode-photo', m === 'photo');
  managerRoot.hidden = m !== 'manager';
  photoRoot.hidden = m !== 'photo';
  for (const b of modeSwitch.children) {
    const on = b.dataset.mode === m;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  }
  if (m === 'manager') manager.show();
  else if (m === 'photo') photo.show();
  else {
    fitStage();
    timeline.render();
    engine.render();
  }
  syncNowOn();
}

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
  // Bundled fonts must be loaded before canvas text uses them.
  await Promise.all(FONTS.map((f) => document.fonts.load(`40px "${f.id}"`).catch(() => {})));
  engine.render();
  await restoreMedia();
  rebuildLeft();
  rebuildInspector();
  timeline.render();
  engine.seek(engine.t);
  showPage();
  syncArtistSel();
  setMode(mode);
  document.body.classList.add('ready');
}
boot();

// exposed for the automated browser checks in test/
window.__pvm = { store, engine, ui, media, panels, manager, photo, setMode };
