// App shell: layout, wiring, keyboard shortcuts and autosave.
import { ASPECTS, clipAt, splitClip, formatTime, clamp } from './core.js';
import { createStore, newProject, loadProject, saveProject, FONTS, findClip } from './state.js';
import { media, restoreMedia } from './media.js';
import { Engine } from './engine.js';
import { createTimeline } from './timeline.js';
import { createPanels } from './panels.js';
import { h, icon, iconButton, button, toast, Binder } from './dom.js';
import { PLATFORM_OVERLAYS, overlaySupported } from './overlays.js';
import { buildInspirationPage } from './page-inspiration.js';
import { loadSettings } from './state.js';

const store = createStore(loadProject() || newProject());

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

const header = h(
  'header',
  { class: 'topbar' },
  h('div', { class: 'brand' }, icon('disc', 22), h('span', {}, 'Promo Studio')),
  nameInput,
  aspectSel,
  undoBtn,
  redoBtn,
  saveState,
  h('div', { class: 'spacer' }),
  button('New project', () => {
    if (!confirm('Start a new project? Your media library is kept; the current edit is replaced.')) return;
    store.replace(newProject());
    ui.select(null);
    engine.seek(0);
  }, { variant: 'ghost' }),
  button('Export', () => ui.openTab('export'), { iconName: 'download', variant: 'primary' }),
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

app.append(
  header,
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
  tab: (localStorage.getItem('pvm.tab') || 'media').replace(/^guitar$/, 'layers'),
  select(sel) {
    this.selection = sel;
    // jump to the panel that edits what was just selected (only now, not on every refresh)
    const home = sel && { layer: 'layers', song: 'audio', endcard: 'endcard' }[sel.type];
    if (home && this.tab !== home && this.tab !== 'inspiration') {
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
  openTab(id) {
    if (this.tab === id) return;
    this.tab = id;
    localStorage.setItem('pvm.tab', id);
    renderRail();
    showPage();
    if (id !== 'inspiration') rebuildLeft();
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

// ------------------------------------------------------------ panels
let leftBinder = null;
let inspBinder = null;
let leftSig = '';
let inspSig = '';

function renderRail() {
  const railBtn = (t) =>
    h(
      'button',
      {
        type: 'button',
        class: `rail-btn${ui.tab === t.id ? ' on' : ''}`,
        'aria-current': ui.tab === t.id ? 'page' : null,
        onclick: () => ui.openTab(t.id),
      },
      icon(t.icon, 20),
      h('span', {}, t.label),
    );
  tabRail.replaceChildren(railBtn({ id: 'inspiration', label: 'Inspiration', icon: 'wand' }), h('hr', { class: 'rail-sep' }), ...panels.tabs.map(railBtn));
}

let page = null;
function showPage() {
  const open = ui.tab === 'inspiration';
  pageEl.hidden = !open;
  if (open) {
    page = buildInspirationPage({ store, engine, ui, settings: loadSettings() });
    pageEl.replaceChildren(page.el);
    pageEl.scrollTop = 0;
  }
}

function leftSignature() {
  const p = store.get();
  const parts = [ui.tab, media.all().length, p.aspect];
  if (ui.tab === 'lyrics') parts.push(p.lyrics.map((l) => `${l.id}:${l.start}:${l.end}`).join('|'), panels.sync.active, panels.sync.cursor, ui.selection && ui.selection.id, p.lyricStyle.display);
  if (ui.tab === 'audio') parts.push(p.song && p.song.mediaId, p.beats && p.beats.bpm, p.audioTracks.map((a) => `${a.id}:${a.start}:${a.duration}`).join('|'));
  if (ui.tab === 'text') parts.push(p.texts.map((t) => `${t.id}:${t.text}:${t.start}:${t.end}`).join('|'));
  if (ui.tab === 'export') parts.push(p.clips.length, !!p.song, p.endCard.coverMediaId, p.duration, p.endCard.enabled, p.name, p.endCard.title, p.endCard.artist, p.endCard.cta, p.endCard.subtext);
  if (ui.tab === 'media') parts.push(p.clips.length);
  if (ui.tab === 'templates') parts.push(p.clips.length, p.template, p.layout, p.lyrics.length);
  if (ui.tab === 'sounds') parts.push(p.audioTracks.length);
  if (ui.tab === 'layers') {
    const L = ui.selection && ui.selection.type === 'layer' ? (p.layers || []).find((l) => l.id === ui.selection.id) : null;
    parts.push(
      (p.layers || []).map((l) => `${l.id}:${l.type}:${l.visible !== false}:${l.name}`).join('|'),
      JSON.stringify(p.layerVis || {}),
      p.audioTracks.length,
      ui.selection && ui.selection.id,
      L && [L.mediaId, L.source, L.track, L.mode, L.style, L.playAudio, L.type === 'video' ? L.clips.length : ''].join(','),
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
        const c = p.clips.find((x) => x.id === s.id);
        return c && [c.filter?.preset, !!c.kenBurns, c.mask?.shape, c.mask?.background, c.grade?.preset].join('|');
      })()) ||
    (s.type === 'lyric' && p.lyrics.some((c) => c.id === s.id) && [...p.lyrics].sort((a, b) => a.start - b.start).findIndex((c) => c.id === s.id)) ||
    (s.type === 'text' && p.texts.some((c) => c.id === s.id)) ||
    (s.type === 'audio' && p.audioTracks.some((c) => c.id === s.id)) ||
    s.type;
  return `${s.type}#${s.id}#${exists}`;
}

function keepScroll(el, fn) {
  const top = el.scrollTop;
  fn();
  el.scrollTop = top;
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
  syncHeader();
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
}

media.onChange(() => {
  if (!engine.playing) engine.render();
  timeline.render();
});

engine.on(() => {
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

// ------------------------------------------------------------ boot
async function boot() {
  renderRail();
  syncHeader();
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
  document.body.classList.add('ready');
}
boot();

// exposed for the automated browser checks in test/
window.__pvm = { store, engine, ui, media, panels };
