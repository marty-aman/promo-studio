// The Photo Studio workspace: posters, promo images, stories, thumbnails and carousels. Left: the
// templates, your photos, stock photos, text and shapes, and saved designs. Middle: the canvas,
// where you click to select, drag to move, pull the handles to resize and the top knob to rotate.
// Right: the selected layer's settings (adjustments, mask, shadow…) and the layer stack.
import { h, icon, button, iconButton, toast, download, pickFiles, keyBox, tablistKeys } from '../dom.js';
import { createStore, loadSettings, saveSettings, FONTS } from '../state.js';
import { PROVIDERS, searchStockPhotos, downloadStock } from '../stock.js';
import { driveButton } from '../gdrive.js';
import { relinkButton } from '../relink.js';
import { zipStore } from '../batch.js';
import { SIZES, sizeById, BLENDS, MASKS, SHAPES, LOOKS, defaultAdjust, newDoc, newLayer, normalizeDoc, hitTest, moveLayer, duplicateLayer, resizeBox, loadDesigns, saveDesigns, docMedia, slidesForImage, pullBackLayers, resizeDoc, clampDim, exportScales, dpiOf, alignLayer, safeInsets, isUntouched, carouselFromImages } from './model.js';
import { drawDoc, renderDoc, renderSlides, canvasBlob, layoutText } from './render.js';
import { TEMPLATES, templateById, countdownSet, carouselSlides } from './templates.js';
import { dist, mid, pinchScale, scrollDelta, keyboardInset, dropAfter, previewSize, isDoubleTap, cropShift } from './gesture.js';
import { PAGE_SIZES, loadPageSize, savePageSize, paginate, folderPath, folderTree } from '../manager/photos.js';
import { createPhotoProjects } from '../projects-photo.js';

// [where, label, icon] for the align buttons (left, centre and right; top, middle and bottom)
const ALIGNS = [['left', 'left', 'alignLeft'], ['center', 'centre', 'alignCenter'], ['right', 'right', 'alignRight'], ['top', 'top', 'alignTop'], ['middle', 'middle', 'alignMiddle'], ['bottom', 'bottom', 'alignBottom']];
const IMAGE_ACCEPT = 'image/*,.jpg,.jpeg,.png,.webp,.gif';
const slug = (s) => String(s || 'design').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'design';
const TABS = [['templates', 'Templates', 'layout'], ['photos', 'Photos', 'image'], ['stock', 'Stock', 'search'], ['text', 'Text', 'type'], ['shapes', 'Shapes', 'layers'], ['designs', 'Designs', 'file']];
const TEXT_PRESETS = [
  ['Heading', { text: 'HEADLINE', font: 'Bebas Neue', size: 0.13 }],
  ['Subheading', { text: 'Subheading', font: 'Oswald', size: 0.06, weight: 600 }],
  ['Body', { text: 'A line of details: date, venue, time', font: 'Inter', size: 0.035, weight: 600 }],
  ['Outlined', { text: 'OUTLINE', font: 'Bebas Neue', size: 0.13, color: '#00000000', stroke: { on: true, color: '#ffffff', width: 3 } }],
  ['Label', { text: 'OUT NOW', font: 'Inter', size: 0.04, weight: 900, letter: 4, color: '#111111', bg: { on: true, color: '#ffd400', pad: 0.35, radius: 0.2 } }],
  ['Handwritten', { text: 'see you there', font: 'Permanent Marker', size: 0.07 }],
];

/**
 * `studio` hooks from the app: images(), get(id) → media record, upload(files) → [{ id, name }],
 * addBlob(blob, name, attribution) → record, saveToLibrary(blobs, names), setShowPoster(showId, mediaId), context() → { band,
 * songs, shows, tours, colors, font, logo, photoIds, today }, fonts() → uploaded font families.
 */
export function createPhotoStudio({ root, studio }) {
  let saved = loadDesigns();
  const firstDoc = () => {
    const d = newDoc({ size: 'post', name: 'My first design' });
    saved.docs.push(d);
    saved.current = d.id;
    return d;
  };
  const store = createStore(saved.docs.find((d) => d.id === saved.current) || firstDoc());
  const ui = { tab: 'templates', sel: null, zoom: 0, stock: { provider: loadSettings().stockProvider || 'pexels', q: '', results: [], busy: false, error: '' }, tpl: { songId: '', showId: '', tourId: '', photoId: '', slides: 0 }, clickMode: 'add', busy: '', folder: 'all', page: 1, size: 0, safe: localStorage.getItem('pvm.photo.safe.v1') !== '0', exportScale: 1, designQ: '', customBar: false };
  const mattes = new Map(); // mediaId → canvas | 'pending' | Error

  // ---- persistence: the current design lives in the store; the rest in `saved`
  let saveTimer = null;
  let savePending = false;
  // the same small status the Video Studio and the Manager show
  const saveEl = h('span', { class: 'ph-save muted tiny', role: 'status' }, 'Saved in this browser');
  const writeNow = () => {
    clearTimeout(saveTimer);
    savePending = false;
    const d = { ...store.get(), updatedAt: new Date().toISOString() };
    saved.docs = saved.docs.map((x) => (x.id === d.id ? d : x));
    if (!saved.docs.some((x) => x.id === d.id)) saved.docs.push(d);
    saved.current = d.id;
    if (saveDesigns(saved)) {
      saveEl.textContent = 'Saved in this browser';
      projects.saved(d); // a version every couple of minutes (Projects)
    } else {
      saveEl.textContent = 'Could not save';
      saveEl.classList.add('warn');
      toast('Could not save designs (browser storage full?)', 'error');
    }
    if (saveEl.textContent === 'Saved in this browser') saveEl.classList.remove('warn');
  };
  const persist = () => {
    savePending = true;
    saveEl.textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeNow, 300);
  };
  const openDoc = (doc, { isNew = false } = {}) => {
    const cur = store.get();
    const was = saved.docs.find((x) => x.id === cur.id);
    saved.docs = saved.docs.map((x) => (x.id === cur.id ? { ...cur, updatedAt: x.updatedAt } : x));
    // the empty "My first design" a first visit makes is not kept once you move on from it untouched
    if (doc.id !== cur.id && !savePending && isUntouched({ ...cur, updatedAt: was ? was.updatedAt : '' })) saved.docs = saved.docs.filter((x) => x.id !== cur.id);
    if (isNew) saved.docs.push(doc);
    saved.current = doc.id;
    ui.sel = null;
    store.replace(doc);
    saveDesigns(saved);
  };

  /** Delete a design (its photos stay in the media library); the open one gives way to the next. */
  const removeDesign = (id) => {
    saved.docs = saved.docs.filter((x) => x.id !== id);
    thumbs.delete(id);
    if (id === store.get().id) openDoc(saved.docs[0] || newDoc(), { isNew: !saved.docs.length });
    saveDesigns(saved);
    renderLeft();
  };
  // the Projects dialog for designs (versions, templates, files)
  const projects = createPhotoProjects({
    saved: () => saved,
    current: () => store.get(),
    update: (fn) => update(fn),
    openDoc: (doc, o) => (openDoc(doc, o), renderLeft(), renderBar(true), renderRight(), draw()),
    write: () => saveDesigns(saved),
    remove: removeDesign,
    thumb: (d) => designThumb(d),
    studio,
    refresh: () => renderLeft(),
  });

  // ---- text boxes grow and shrink with their text
  const fitText = (d) => {
    for (const L of d.layers) if (L.type === 'text') L.h = Math.max(8, layoutText(L).height);
  };
  const update = (fn, key = null) => store.update((d) => {
    fn(d);
    fitText(d);
  }, key);
  const selLayer = () => store.get().layers.find((L) => L.id === ui.sel) || null;
  const L_ = (fn) => (d, v) => {
    const L = d.layers.find((x) => x.id === ui.sel);
    if (L) fn(L, v, d);
  };

  // ---- media
  const getImage = (id) => {
    const r = studio.get(id);
    return r && r.el ? r.el : null;
  };
  // Editing copies: a photo much bigger than the screen needs is drawn from a smaller canvas while editing
  // (the export always uses the original). Keeps a phone from re-scaling a 12 MP photo on every frame.
  const previews = new Map(); // mediaId → { src, cv }
  const getPreview = (id) => {
    const el = getImage(id);
    if (!el) return null;
    const w = el.naturalWidth || el.width;
    const hh = el.naturalHeight || el.height;
    const sz = previewSize(w, hh);
    if (!sz) return el;
    const hit = previews.get(id);
    if (hit && hit.src === el) return hit.cv;
    const cv = document.createElement('canvas');
    cv.width = sz.w;
    cv.height = sz.h;
    cv.getContext('2d').drawImage(el, 0, 0, sz.w, sz.h);
    previews.set(id, { src: el, cv });
    return cv;
  };
  const getMatte = (id) => {
    const m = mattes.get(id);
    return m instanceof HTMLCanvasElement ? m : null;
  };
  const ensureMattes = () => {
    for (const L of store.get().layers) {
      if (L.type !== 'image' || L.mask.type !== 'person' || !L.mediaId || mattes.has(L.mediaId)) continue;
      const img = getImage(L.mediaId);
      if (!img) continue;
      mattes.set(L.mediaId, 'pending');
      import('../bgremove.js')
        .then((m) => m.personMatteForImage(img))
        .then((c) => mattes.set(L.mediaId, c))
        .catch((e) => {
          mattes.set(L.mediaId, e);
          toast(`Couldn’t find the person: ${e.message}`, 'error', 6000);
        })
        .finally(() => (draw(), renderRight()));
    }
  };

  // ---------------------------------------------------------------- DOM
  const left = h('aside', { class: 'ph-left', 'aria-label': 'Add to the design' });
  const right = h('aside', { class: 'ph-right', 'aria-label': 'Selected layer' });
  const canvas = h('canvas', { class: 'ph-canvas', 'aria-label': 'Design preview' });
  const overlay = h('div', { class: 'ph-overlay', tabindex: '0', 'aria-label': 'Design. Click a layer to select it; drag to move; arrow keys nudge.' });
  const stageBox = h('div', { class: 'ph-stagebox' }, canvas, overlay);
  const stage = h('div', { class: 'ph-stage' }, stageBox);
  const bar = h('div', { class: 'ph-bar' });
  const center = h('section', { class: 'ph-center' }, bar, stage);
  // Phones and tablets (css/mobile-photo.css): the side panels become sheets reached from a bottom toolbar.
  const toolbar = h('nav', { class: 'ph-toolbar', 'aria-label': 'Photo Studio tools' });
  const sheetHead = h('div', { class: 'ph-sheet-head' });
  const exportSheet = h('section', { class: 'ph-export', 'aria-label': 'Save or download' });
  const quick = h('div', { class: 'ph-quick', role: 'toolbar', 'aria-label': 'Selected layer' });
  center.append(quick);
  root.replaceChildren(left, center, right, sheetHead, exportSheet, toolbar);
  const SHEETS = [['add', 'Add', 'plus', 'left'], ['layers', 'Layers', 'layers', 'right'], ['style', 'Style', 'palette', 'right'], ['templates', 'Templates', 'layout', 'left'], ['export', 'Export', 'download', 'export']];
  const narrow = window.matchMedia('(max-width: 1100px)');
  const coarse = window.matchMedia('(pointer: coarse)');
  const syncTouch = () => root.classList.toggle('ph-touch', ui.touched || narrow.matches || coarse.matches);
  narrow.addEventListener && narrow.addEventListener('change', () => (syncTouch(), draw()));
  syncTouch();
  function setSheet(name, { scrollTo = null } = {}) {
    ui.sheet = name && ui.sheet === name && !scrollTo ? null : name;
    if (ui.sheet === 'templates') ui.tab = 'templates';
    if (ui.sheet === 'add' && ui.tab === 'templates') ui.tab = 'photos';
    root.classList.remove('sheet-left', 'sheet-right', 'sheet-export', 'sheet-big');
    const kind = ui.sheet ? SHEETS.find((s) => s[0] === ui.sheet)[3] : null;
    if (kind) root.classList.add(`sheet-${kind}`);
    if (kind && ui.sheetBig) root.classList.add('sheet-big');
    if (kind === 'left') renderLeft();
    renderSheetChrome();
    if (kind === 'right') {
      const t = ui.sheet === 'layers' ? right.querySelector('.ph-layers-box') : null;
      right.scrollTop = t ? t.offsetTop - right.offsetTop : 0;
    }
  }
  function renderSheetChrome() {
    const cur = SHEETS.find((s) => s[0] === ui.sheet);
    toolbar.replaceChildren(...SHEETS.map(([k, label, ic]) => h('button', { type: 'button', class: `ph-tb${ui.sheet === k ? ' on' : ''}`, 'aria-pressed': ui.sheet === k ? 'true' : 'false', 'data-sheet': k, onclick: () => setSheet(k) }, icon(ic, 20), h('span', {}, label))));
    sheetHead.replaceChildren(
      h('strong', {}, cur ? cur[1] : ''),
      h('span', { class: 'spacer' }),
      iconButton(ui.sheetBig ? 'zoomOut' : 'zoomIn', ui.sheetBig ? 'Make the panel smaller' : 'Make the panel bigger', () => ((ui.sheetBig = !ui.sheetBig), root.classList.toggle('sheet-big', ui.sheetBig), renderSheetChrome()), 'ghost'),
      iconButton('x', 'Close the panel', () => setSheet(null), 'ghost'),
    );
    root.classList.toggle('sheet-open', !!ui.sheet);
  }
  // the on-screen keyboard: shrink the app to what is visible so the sheet and the canvas stay in view
  if (window.visualViewport) {
    const vvFit = () => {
      const kb = keyboardInset(window.innerHeight, window.visualViewport);
      const on = kb > 0 && !root.hidden;
      document.documentElement.style.setProperty('--ph-vvh', `${Math.round(window.visualViewport.height)}px`);
      document.body.classList.toggle('ph-kb', on);
      if (on) {
        window.scrollTo(0, 0);
        // keep the field being typed in above the keyboard
        requestAnimationFrame(() => document.activeElement && right.contains(document.activeElement) && document.activeElement.scrollIntoView({ block: 'nearest' }));
      }
    };
    window.visualViewport.addEventListener('resize', vvFit);
    window.visualViewport.addEventListener('scroll', vvFit);
  }

  let scale = 1;
  let raf = 0;
  // each layer's picture from the last frame, so a slider on one layer redraws only that layer (see drawDoc's cache)
  const layerCache = new Map();
  let epoch = 0; // bumped when fonts or files arrive: cached pictures made before are stale
  const draw = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(drawNow);
  };
  function drawNow() {
    const doc = store.get();
    const cs = getComputedStyle(stage);
    const avW = Math.max(100, stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
    const avH = Math.max(100, stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom));
    const fit = Math.min(avW / doc.w, avH / doc.h);
    fitScale = fit;
    scale = ui.zoom ? ui.zoom : fit;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.round(doc.w * scale);
    const ch = Math.round(doc.h * scale);
    stageBox.style.width = `${cw}px`;
    stageBox.style.height = `${ch}px`;
    // setting a canvas's size throws its pixels away and reallocates them: only do it when the size changed
    if (canvas.width !== Math.round(cw * dpr)) canvas.width = Math.round(cw * dpr);
    if (canvas.height !== Math.round(ch * dpr)) canvas.height = Math.round(ch * dpr);
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    drawDoc(canvas.getContext('2d'), doc, { scale: scale * dpr, getImage: getPreview, getMatte, preview: true, cache: layerCache, epoch });
    drawOverlay();
  }
  function drawOverlay() {
    const doc = store.get();
    const L = selLayer();
    const parts = [];
    if (doc.slides > 1) {
      for (let i = 1; i < doc.slides; i++) parts.push(h('div', { class: 'ph-seam', style: { left: `${(doc.w / doc.slides) * i * scale}px` } }));
      for (let i = 0; i < doc.slides; i++) parts.push(h('span', { class: 'ph-slide-n', style: { left: `${(doc.w / doc.slides) * i * scale + 6}px` } }, `Slide ${i + 1}`));
    }
    const safe = ui.safe ? safeInsets(doc) : null;
    if (safe) {
      // preview only: it is drawn on the page, never into the exported image
      const sw = doc.w / (doc.slides > 1 ? doc.slides : 1);
      for (let i = 0; i < Math.max(1, doc.slides); i++) {
        parts.push(h('div', { class: 'ph-safe top', title: 'The top bar of a story covers this part', style: { left: `${sw * i * scale}px`, width: `${sw * scale}px`, height: `${safe.top * scale}px` } }, h('span', {}, 'Top bar')));
        parts.push(h('div', { class: 'ph-safe bottom', title: 'The reply bar and stickers cover this part', style: { left: `${sw * i * scale}px`, width: `${sw * scale}px`, height: `${safe.bottom * scale}px` } }, h('span', {}, 'Reply bar')));
      }
    }
    if (snapGuide.x != null) parts.push(h('div', { class: 'ph-guide v', style: { left: `${snapGuide.x * scale}px` } }));
    if (snapGuide.y != null) parts.push(h('div', { class: 'ph-guide h', style: { top: `${snapGuide.y * scale}px` } }));
    if (L && L.visible) {
      const sel = h('div', { class: `ph-sel${L.locked ? ' locked' : ''}${ui.crop && L.type === 'image' ? ' cropping' : ''}${Math.min(L.w, L.h) * scale < 130 ? ' small' : ''}${L.y * scale < 52 ? ' rot-below' : ''}`, style: { left: `${L.x * scale}px`, top: `${L.y * scale}px`, width: `${L.w * scale}px`, height: `${L.h * scale}px`, transform: `rotate(${L.rot}deg)` } });
      if (!L.locked) {
        for (const k of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) sel.append(h('span', { class: `ph-handle ${k}`, 'data-handle': k }));
        sel.append(h('span', { class: 'ph-rot', 'data-handle': 'rot', title: 'Drag to rotate (Shift: 15° steps)' }));
      }
      parts.push(sel);
    }
    overlay.replaceChildren(...parts);
    renderQuick();
  }
  // a closed padlock when the layer is locked, an open one when it isn't; announced as a pressed button
  const lockButton = (locked, title, onClick) => {
    const b = iconButton(locked ? 'lock' : 'unlock', title, onClick, `ghost${locked ? ' on' : ''}`);
    b.setAttribute('aria-pressed', locked ? 'true' : 'false');
    b.title = locked ? 'Locked: click to unlock' : 'Unlocked: click to lock'; // the name stays "Lock …"; the pressed state says which
    return b;
  };
  // Buttons for what the keyboard does (Delete, Ctrl+D, Esc, double-click), shown over the canvas on a phone or tablet.
  let quickKey = '';
  function renderQuick() {
    const L = selLayer();
    const key = L ? `${L.id}|${L.type}|${L.locked}|${ui.crop}` : '';
    if (key === quickKey) return;
    quickKey = key;
    if (!L) return quick.replaceChildren();
    if (L.type !== 'image') ui.crop = false;
    const dup = () => {
      let c = null;
      update((d) => (c = duplicateLayer(d, L.id)));
      if (c) ui.sel = c.id;
      renderRight();
    };
    quick.replaceChildren(...[
      iconButton('settings', 'Style this layer', () => setSheet('style', { scrollTo: true }), 'ghost'),
      L.type === 'text' ? iconButton('type', 'Edit the text', () => editText(), 'ghost') : null,
      L.type === 'image' && L.fit !== 'stretch' ? iconButton('scissors', ui.crop ? 'Done cropping' : 'Crop: drag the photo inside its frame', () => ((ui.crop = !ui.crop), (quickKey = ''), drawOverlay()), `ghost${ui.crop ? ' on' : ''}`) : null,
      iconButton('copy', 'Duplicate', dup, 'ghost'),
      iconButton('arrowUp', 'Bring forward', () => update((d) => moveLayer(d, L.id, 1)), 'ghost'),
      iconButton('arrowDown', 'Send backward', () => update((d) => moveLayer(d, L.id, -1)), 'ghost'),
      lockButton(L.locked, 'Lock', () => update(L_((x) => (x.locked = !x.locked)))),
      iconButton('trash', 'Delete this layer', removeSel, 'ghost danger'),
      iconButton('x', 'Deselect', () => ((ui.sel = null), renderRight(), drawOverlay()), 'ghost'),
    ].filter(Boolean));
  }
  function editText() {
    setSheet('style', { scrollTo: true });
    const ta = right.querySelector('textarea[data-k="ph-text"]');
    if (ta) {
      ta.focus();
      ta.setSelectionRange(0, ta.value.length);
    }
  }
  new ResizeObserver(() => draw()).observe(stage);

  // ---------------------------------------------------------------- pointer: select, move, resize, rotate
  let drag = null;
  const snapGuide = { x: null, y: null };
  const docPoint = (e) => {
    const r = overlay.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };
  // fingers on the canvas: one moves a layer (or pans a zoomed view), two pinch the view (or the photo while cropping)
  const touches = new Map();
  let pinch = null;
  let lastTap = null;
  let fitScale = 1;
  overlay.addEventListener('contextmenu', (e) => e.preventDefault());
  let pendingEdit = 0;
  const openEdit = () => {
    clearTimeout(pendingEdit);
    pendingEdit = 0;
    editText();
  };
  overlay.addEventListener('click', () => pendingEdit && openEdit());
  const setView = (s) => {
    ui.zoom = s <= fitScale * 1.02 ? 0 : s;
  };
  function startPinch() {
    const [a, b] = [...touches.values()];
    const m = mid(a, b);
    const r = overlay.getBoundingClientRect();
    const L = selLayer();
    drag = null;
    pinch = { d0: dist(a, b), scale0: scale, z0: L && L.type === 'image' ? L.zoom : 1, anchor: { x: (m.x - r.left) / scale, y: (m.y - r.top) / scale } };
  }
  function movePinch() {
    const [a, b] = [...touches.values()];
    if (!a || !b || !pinch) return;
    const m = mid(a, b);
    const L = selLayer();
    if (ui.crop && L && L.type === 'image' && !L.locked) {
      const z = pinchScale({ scale0: pinch.z0, d0: pinch.d0, d1: dist(a, b), min: 1, max: 4 });
      update(L_((x) => (x.zoom = Math.round(z * 100) / 100)), 'pinch-crop');
      return;
    }
    setView(pinchScale({ scale0: pinch.scale0, d0: pinch.d0, d1: dist(a, b), min: fitScale, max: fitScale * 8 }));
    drawNow();
    const r = overlay.getBoundingClientRect();
    const d = scrollDelta({ anchor: pinch.anchor, scale, box: { x: r.left, y: r.top }, mid: m });
    stage.scrollLeft += d.x;
    stage.scrollTop += d.y;
  }
  overlay.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') {
      if (!ui.touched) (ui.touched = true), syncTouch();
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size >= 2) {
        try {
          overlay.setPointerCapture(e.pointerId);
        } catch {
          /* synthetic pointer */
        }
        return startPinch();
      }
    }
    const p = docPoint(e);
    const handle = e.target.dataset && e.target.dataset.handle;
    const doc = store.get();
    let L = selLayer();
    if (!handle) {
      L = hitTest(doc, p.x, p.y);
      ui.sel = L ? L.id : null;
      renderRight();
      drawOverlay();
    }
    if (!L && e.pointerType === 'touch' && (stage.scrollWidth > stage.clientWidth + 2 || stage.scrollHeight > stage.clientHeight + 2)) {
      drag = { mode: 'pan', x: e.clientX, y: e.clientY, l: stage.scrollLeft, t: stage.scrollTop, moved: true };
      try {
        overlay.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic pointer */
      }
      return;
    }
    if (!L || L.locked) return;
    e.preventDefault();
    drag = { mode: handle === 'rot' ? 'rot' : handle ? 'resize' : ui.crop && L.type === 'image' ? 'crop' : 'move', handle, start: p, L: structuredClone(L), key: `drag-${L.id}-${Date.now()}`, moved: false };
    try {
      overlay.setPointerCapture(e.pointerId);
    } catch {
      /* a pointer the browser doesn't know (synthetic): moves still reach the overlay */
    }
  });
  overlay.addEventListener('pointermove', (e) => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch) return movePinch();
    if (!drag) return;
    if (drag.mode === 'pan') {
      stage.scrollLeft = drag.l - (e.clientX - drag.x);
      stage.scrollTop = drag.t - (e.clientY - drag.y);
      return;
    }
    const p = docPoint(e);
    const dx = p.x - drag.start.x;
    const dy = p.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) * scale < 2) return;
    drag.moved = true;
    const o = drag.L;
    const doc = store.get();
    update((d) => {
      const L = d.layers.find((x) => x.id === o.id);
      if (!L) return;
      if (drag.mode === 'move') {
        let nx = o.x + dx;
        let ny = o.y + dy;
        snapGuide.x = snapGuide.y = null;
        if (!e.altKey) {
          const tol = 8 / scale;
          const cx = nx + o.w / 2;
          const cy = ny + o.h / 2;
          const slideW = doc.slides > 1 ? doc.w / doc.slides : doc.w;
          const xs = [doc.w / 2, ...Array.from({ length: doc.slides > 1 ? doc.slides : 1 }, (_, i) => slideW * i + slideW / 2)];
          const hitX = xs.find((g) => Math.abs(cx - g) < tol);
          if (hitX != null) (nx = hitX - o.w / 2), (snapGuide.x = hitX);
          if (Math.abs(cy - doc.h / 2) < tol) (ny = doc.h / 2 - o.h / 2), (snapGuide.y = doc.h / 2);
        }
        L.x = Math.round(nx);
        L.y = Math.round(ny);
      } else if (drag.mode === 'crop') {
        const rec = studio.get(o.mediaId);
        if (!rec || !rec.width) return;
        const r = (-o.rot * Math.PI) / 180;
        const s = cropShift({ fit: o.fit, iw: rec.width, ih: rec.height, bw: o.w, bh: o.h, zoom: o.zoom }, dx * Math.cos(r) - dy * Math.sin(r), dx * Math.sin(r) + dy * Math.cos(r));
        L.focusX = Math.min(1, Math.max(0, Math.round((o.focusX + s.fx) * 1000) / 1000));
        L.focusY = Math.min(1, Math.max(0, Math.round((o.focusY + s.fy) * 1000) / 1000));
      } else if (drag.mode === 'rot') {
        const cx = o.x + o.w / 2;
        const cy = o.y + o.h / 2;
        let a = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
        if (e.shiftKey) a = Math.round(a / 15) * 15;
        a = ((a + 540) % 360) - 180;
        L.rot = Math.round(a * 10) / 10;
      } else {
        // the drag in the layer's own (rotated) axes
        const r = (-o.rot * Math.PI) / 180;
        const lx = dx * Math.cos(r) - dy * Math.sin(r);
        const ly = dx * Math.sin(r) + dy * Math.cos(r);
        const corner = drag.handle.length === 2;
        const keep = (corner && (o.type === 'image' || o.type === 'text')) !== e.shiftKey;
        const nb = resizeBox({ x: 0, y: 0, w: o.w, h: o.h }, drag.handle, lx, ly, { keepAspect: keep });
        const dcx = nb.x + nb.w / 2 - o.w / 2;
        const dcy = nb.y + nb.h / 2 - o.h / 2;
        const rr = (o.rot * Math.PI) / 180;
        const gx = dcx * Math.cos(rr) - dcy * Math.sin(rr);
        const gy = dcx * Math.sin(rr) + dcy * Math.cos(rr);
        const ncx = o.x + o.w / 2 + gx;
        const ncy = o.y + o.h / 2 + gy;
        if (o.type === 'text') {
          if (corner) L.size = Math.max(6, Math.round(o.size * (nb.w / o.w)));
          L.w = nb.w;
          L.x = Math.round(ncx - nb.w / 2);
          L.y = Math.round(o.y + (nb.y === 0 ? 0 : nb.y));
        } else {
          Object.assign(L, { w: nb.w, h: nb.h, x: Math.round(ncx - nb.w / 2), y: Math.round(ncy - nb.h / 2) });
        }
      }
    }, drag.key);
  });
  const endDrag = (e) => {
    if (e && touches.delete(e.pointerId) && pinch && touches.size < 2) pinch = null;
    if (!drag) return;
    // a second quick tap on text opens it for editing (double-click does not fire on a touch screen)
    if (e && e.type === 'pointerup' && e.pointerType === 'touch' && !drag.moved && drag.L.type === 'text' && drag.mode === 'move') {
      const now = { t: performance.now(), x: e.clientX, y: e.clientY };
      if (isDoubleTap(lastTap, now)) (lastTap = null), (pendingEdit = setTimeout(openEdit, 450)); // after the click that follows, or it would land on the sheet
      else lastTap = now;
    }
    drag = null;
    snapGuide.x = snapGuide.y = null;
    drawOverlay();
    renderRight();
  };
  overlay.addEventListener('pointerup', endDrag);
  overlay.addEventListener('pointercancel', endDrag);
  overlay.addEventListener('dblclick', () => {
    const L = selLayer();
    if (L && L.type === 'text') right.querySelector('textarea[data-k="ph-text"]')?.focus();
  });

  // ---------------------------------------------------------------- keyboard (from the app)
  function onKey(e) {
    const tag = (e.target.tagName || '').toUpperCase();
    if (/INPUT|TEXTAREA|SELECT/.test(tag) && e.target.type !== 'range') return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (document.querySelector('dialog[open]') || (e.target.closest && e.target.closest('dialog'))) return; // a dialog is in front
    if (mod && k === 'z') return e.preventDefault(), e.shiftKey ? store.redo() : store.undo();
    if (mod && k === 'y') return e.preventDefault(), store.redo();
    const L = selLayer();
    if (!L) return;
    if (mod && k === 'd') {
      e.preventDefault();
      let c = null;
      update((d) => (c = duplicateLayer(d, L.id)));
      if (c) ui.sel = c.id;
      return renderRight();
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') return; // the key belongs to the focused control
      e.preventDefault();
      return removeSel();
    }
    if (e.key === 'Escape') return (ui.sel = null), renderRight(), drawOverlay();
    const step = e.shiftKey ? 10 : 1;
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (mv && !L.locked) {
      e.preventDefault();
      update(L_((x) => ((x.x += mv[0]), (x.y += mv[1]))), `nudge-${L.id}`);
    }
  }
  const removeSel = () => {
    const L = selLayer();
    if (!L) return;
    update((d) => (d.layers = d.layers.filter((x) => x.id !== L.id)));
    ui.sel = null;
    renderRight();
  };

  // ---------------------------------------------------------------- adding things
  const addLayer = (L) => {
    update((d) => d.layers.push(L));
    ui.sel = L.id;
    renderRight();
  };
  const addPhoto = (rec) => {
    const doc = store.get();
    const cur = selLayer();
    if (ui.clickMode === 'replace' && cur && cur.type === 'image') {
      update(L_((x) => (x.mediaId = rec.id)));
      return toast(`Photo swapped for “${rec.name}”`);
    }
    const iw = rec.width || 1;
    const ih = rec.height || 1;
    const w = Math.round(doc.w * (doc.slides > 1 ? 1 : 0.7));
    const hh = Math.round((w * ih) / iw);
    addLayer(newLayer('image', doc, { name: rec.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 30), mediaId: rec.id, w, h: hh, x: Math.round((doc.w - w) / 2), y: Math.round((doc.h - hh) / 2) }));
  };
  const uploadPhotos = async (files) => {
    const picked = files || (await pickFiles(IMAGE_ACCEPT, true));
    if (!picked.length) return;
    ui.busy = 'upload';
    renderLeft();
    try {
      const added = await studio.upload(picked);
      if (added.length === 1) addPhoto(studio.get(added[0].id));
      toast(added.length ? `Added ${added.length} photo${added.length > 1 ? 's' : ''}${added.length > 1 ? '. Click one to put it on the design.' : ''}` : 'No photos in those files.', added.length ? 'info' : 'error');
    } finally {
      ui.busy = '';
      renderLeft();
    }
  };

  // ---------------------------------------------------------------- left panel
  function renderLeft() {
    // the arrow keys move between the tabs, so keep the keyboard on the tab strip through the rebuild
    const onTab = !!(document.activeElement && left.contains(document.activeElement) && document.activeElement.getAttribute('role') === 'tab');
    const tabs = h('div', { class: 'ph-tabs', role: 'tablist', 'aria-label': 'Add to the design' }, TABS.map(([k, l, ic]) => h('button', { type: 'button', role: 'tab', id: `ph-tab-${k}`, 'aria-selected': ui.tab === k ? 'true' : 'false', 'aria-controls': 'ph-tabpanel', class: `ph-tab${ui.tab === k ? ' on' : ''}`, onclick: () => ((ui.tab = k), renderLeft()) }, icon(ic, 16), h('span', {}, l))));
    const body = { templates: templatesPanel, photos: photosPanel, stock: stockPanel, text: textPanel, shapes: shapesPanel, designs: designsPanel }[ui.tab]();
    left.replaceChildren(tabs, h('div', { class: 'ph-left-body', role: 'tabpanel', id: 'ph-tabpanel', 'aria-labelledby': `ph-tab-${ui.tab}` }, body));
    tablistKeys(tabs);
    if (onTab) tabs.querySelector('[aria-selected="true"]').focus({ preventScroll: true });
  }

  /**
   * A grid of photos, one page at a time (so a big library doesn't slow the browser), with the
   * Photos page's folders to narrow it.
   */
  const photoGrid = (list, onPick, { selected = null, order = null } = {}) => {
    if (!ui.size) ui.size = loadPageSize();
    const c = studio.context();
    const folders = c.photoFolders || [];
    const where = c.photoFolderOf || {};
    if (ui.folder !== 'all' && ui.folder !== 'none' && ui.folder !== 'artist' && !folders.some((f) => f.id === ui.folder)) ui.folder = 'all';
    const tree = folders.some((f) => f.id === ui.folder) ? folderTree(folders, ui.folder) : null;
    const pool = list.filter((m) => (ui.folder === 'all' ? true : ui.folder === 'artist' ? m.id in where : ui.folder === 'none' ? !where[m.id] : tree.has(where[m.id])));
    const pg = paginate(pool, ui.page, ui.size);
    ui.page = pg.page;
    const re = () => renderLeft();
    const fsel = h('select', { 'aria-label': 'Folder', 'data-k': 'ph-folder' }, h('option', { value: 'all', selected: ui.folder === 'all' }, `Whole media library (${list.length})`), h('option', { value: 'artist', selected: ui.folder === 'artist' }, `${c.band.name || 'Artist'}’s Photos page`), h('option', { value: 'none', selected: ui.folder === 'none' }, 'Not in a folder'), ...folders.map((f) => [f, folderPath(folders, f.id).map((x) => x.name).join(' › ')]).sort((a, b) => a[1].localeCompare(b[1])).map(([f, label]) => h('option', { value: f.id, selected: ui.folder === f.id }, `📁 ${label}`)));
    fsel.addEventListener('change', () => ((ui.folder = fsel.value), (ui.page = 1), re()));
    const sizeSel = h('select', { 'aria-label': 'Photos per page' }, PAGE_SIZES.map((n) => h('option', { value: String(n), selected: n === ui.size }, `${n} per page`)));
    sizeSel.addEventListener('change', () => (savePageSize(+sizeSel.value), (ui.size = +sizeSel.value), (ui.page = 1), re()));
    const nav = pg.pages > 1 ? h('div', { class: 'row ph-pager' }, iconButton('arrowLeft', 'Previous page', () => ((ui.page = pg.page - 1), re()), 'ghost'), h('span', { class: 'muted tiny' }, `Page ${pg.page} of ${pg.pages}`), iconButton('arrowRight', 'Next page', () => ((ui.page = pg.page + 1), re()), 'ghost')) : null;
    return h(
      'div',
      { class: 'ph-gridbox' },
      list.length ? fsel : null,
      pool.length
        ? h('div', { class: 'ph-grid' }, pg.items.map((m) => {
          const n = order ? order.indexOf(m.id) + 1 : 0;
          return h('button', { type: 'button', class: `ph-thumb${selected === m.id || n ? ' on' : ''}`, title: m.name, 'aria-pressed': order ? (n ? 'true' : 'false') : null, onclick: () => onPick(m) }, h('img', { src: m.thumb || m.url, alt: m.name, loading: 'lazy', decoding: 'async' }), n ? h('span', { class: 'ph-thumb-n' }, String(n)) : null);
        }))
        : h('p', { class: 'muted small' }, list.length ? 'No photos in this folder.' : 'No photos yet. Upload some, pull them from Google Drive, or search Stock.'),
      pool.length ? h('div', { class: 'row ph-pager' }, h('span', { class: 'muted tiny' }, `${pg.from}–${pg.to} of ${pg.total}`), sizeSel) : null,
      nav,
    );
  };

  function templatesPanel() {
    const c = studio.context();
    const t = ui.tpl;
    const imgs = studio.images();
    // the photos picked, in order: the first is the main one; the carousel uses them all, photo in photo the first two
    t.photoIds = (t.photoIds || []).filter((id) => imgs.some((m) => m.id === id));
    if (!t.photoIds.length) {
      const first = (c.photoIds || []).find((id) => imgs.some((m) => m.id === id)) || imgs[0]?.id;
      if (first) t.photoIds = [first];
    }
    t.photoId = t.photoIds[0] || '';
    if (!t.songId) t.songId = c.currentSongId || c.songs[0]?.id || '';
    const upcoming = c.shows.filter((s) => !s.date || s.date >= c.today).sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
    if (!t.showId) t.showId = upcoming[0]?.id || c.shows[0]?.id || '';
    const sel = (k, label, opts) => {
      const el = h('select', { 'data-k': `tpl-${k}`, 'aria-label': label }, opts.map(([v, l]) => h('option', { value: v, selected: t[k] === v }, l)));
      el.addEventListener('change', () => ((t[k] = el.value), renderLeft()));
      return h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, label), el);
    };
    const photo = studio.get(t.photoId);
    const ctx = () => {
      const song = c.songs.find((s) => s.id === t.songId) || null;
      const show = c.shows.find((s) => s.id === t.showId) || null;
      const tour = c.tours.find((x) => x.id === t.tourId) || null;
      const dates = tour ? tour.stops.filter((s) => s.status !== 'dropped').map((s) => ({ date: s.date, city: s.city, venue: (s.venueName || '') })) : upcoming.map((s) => ({ date: s.date, city: s.city, venue: s.venue }));
      const ref = (rec) => (rec ? { id: rec.id, w: rec.width, h: rec.height } : null);
      const photos = t.photoIds.map((id) => ref(studio.get(id))).filter(Boolean);
      const coverId = song && c.coverOf ? c.coverOf(song) : null;
      return { ...c, song, show, dates, tourName: tour ? tour.name : '', photo: photos[0] || null, photos, cover: ref(coverId && studio.get(coverId)), slides: t.slides || 0 };
    };
    const use = (tp) => {
      if (tp.needs === 'photo' && !photo) toast('No photo picked: the template has an empty photo layer. Click it and pick one from Photos.', 'info', 5000);
      const doc = tp.build(ctx());
      if (tp.needs === 'show' && t.showId) doc.showId = t.showId;
      openDoc(doc, { isNew: true });
      if (narrow.matches) setSheet(null); // on a phone the sheet would cover the new design
      toast(`New design: ${doc.name}. Everything is editable.`);
    };
    const slidesPick = h('select', { 'data-k': 'tpl-slides', 'aria-label': 'Slides' }, h('option', { value: '0', selected: !t.slides }, `Auto (${t.photoIds.length > 1 ? carouselSlides(t.photoIds.map((id) => studio.get(id)).filter(Boolean).map((x) => ({ w: x.width, h: x.height }))) : photo ? slidesForImage(photo.width, photo.height) : 3})`), [2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => h('option', { value: String(k), selected: t.slides === k }, `${k} slides`)));
    slidesPick.addEventListener('change', () => ((t.slides = +slidesPick.value), renderLeft()));
    return h(
      'div',
      { class: 'ph-tpl' },
      h('p', { class: 'muted small' }, `Made from ${c.band.name || 'your band'}’s theme, logo and details. Pick what goes in, then a template.`),
      h('div', { class: 'ph-tpl-photo' }, photo ? h('img', { src: photo.thumb || photo.url, alt: '' }) : h('span', { class: 'muted tiny' }, 'No photo'), h('span', { class: 'muted tiny' }, photo ? `Photo: ${photo.name}` : imgs.length ? 'Pick a photo below' : 'Add a photo to start')),
      // a first visit has no photos: the way to get some is right here, not folded away in another tab
      imgs.length ? null : h('div', { class: 'ph-firstrun' },
        h('p', { class: 'small' }, 'Most templates are built around a photo. Add one:'),
        h('div', { class: 'row' }, button(ui.busy === 'upload' ? 'Uploading…' : 'Upload photos', () => uploadPhotos(), { iconName: 'upload', variant: 'sm primary', disabled: ui.busy === 'upload' }), driveButton(IMAGE_ACCEPT, true, (fs) => uploadPhotos(fs)), button('Search stock', () => ((ui.tab = 'stock'), renderLeft()), { iconName: 'search', variant: 'sm' })),
        h('p', { class: 'muted tiny' }, 'Or pick a template anyway and add the photo later.')),
      t.photoIds.length > 1 ? h('p', { class: 'muted tiny' }, `${t.photoIds.length} photos picked: the carousel lays them all side by side, photo in photo frames the 2nd over the 1st.`) : null,
      !imgs.length ? null : h(
        'details',
        { class: 'ph-pick', open: ui.pickOpen || null, ontoggle: (e) => (ui.pickOpen = e.target.open) },
        h('summary', {}, t.photoIds.length > 1 ? 'Change the photos' : 'Change the photo, or pick several'),
        h('p', { class: 'muted tiny' }, 'Click photos in the order you want them; click again to drop one. The first is the main photo.'),
        photoGrid(imgs, (m) => {
          t.photoIds = t.photoIds.includes(m.id) ? t.photoIds.filter((x) => x !== m.id) : [...t.photoIds, m.id];
          renderLeft();
        }, { order: t.photoIds }),
        t.photoIds.length > 1 ? button('Keep only the first', () => ((t.photoIds = t.photoIds.slice(0, 1)), renderLeft()), { variant: 'sm ghost' }) : null,
      ),
      studio.openCarouselPage ? h('p', { class: 'muted tiny' }, 'Prefer slides built from your song, clips and cover? ', h('button', { type: 'button', class: 'linklike', onclick: () => studio.openCarouselPage() }, 'Make a carousel in the Video Studio'), ' and bring it back here to fine-tune.') : null,
      c.songs.length ? sel('songId', 'Song', [['', 'No song'], ...c.songs.map((s) => [s.id, s.title])]) : null,
      c.shows.length ? sel('showId', 'Show (for the poster)', c.shows.map((s) => [s.id, `${s.date || 'No date'} · ${s.venue || 'Venue TBD'}`])) : null,
      sel('tourId', 'Dates from', [['', 'Upcoming shows'], ...c.tours.map((x) => [x.id, `Tour: ${x.name}`])]),
      h(
        'div',
        { class: 'ph-tpl-list' },
        TEMPLATES.map((tp) =>
          h(
            'div',
            { class: 'ph-tpl-card' },
            h('div', {}, h('strong', {}, tp.label), h('p', { class: 'muted tiny' }, tp.blurb)),
            tp.id === 'carousel' ? slidesPick : null,
            h('div', { class: 'row' }, button('Use', () => use(tp), { iconName: 'plus', variant: 'sm primary' }), tp.id === 'countdown' ? button('Make the whole countdown', () => {
              const docs = countdownSet(ctx());
              docs.forEach((d, i) => openDoc(d, { isNew: true, last: i === docs.length - 1 }));
              toast(`Made ${docs.length} countdown designs (${docs.map((d) => d.name.split(' · ').pop()).join(', ')}). They’re in Designs.`, 'info', 6000);
            }, { variant: 'sm ghost' }) : null),
          ),
        ),
      ),
    );
  }

  function photosPanel() {
    const cur = selLayer();
    const imgs = studio.images();
    return h(
      'div',
      {},
      h('div', { class: 'row' }, button(ui.busy === 'upload' ? 'Uploading…' : 'Upload photos', () => uploadPhotos(), { iconName: 'upload', variant: 'sm primary', disabled: ui.busy === 'upload' }), driveButton(IMAGE_ACCEPT, true, (fs) => uploadPhotos(fs))),
      cur && cur.type === 'image'
        ? h('div', { class: 'chips ph-clickmode' }, h('span', { class: 'muted tiny' }, 'Clicking a photo:'), button('Adds a layer', () => ((ui.clickMode = 'add'), renderLeft()), { variant: `chip${ui.clickMode === 'add' ? ' on' : ''}` }), button('Swaps the selected photo', () => ((ui.clickMode = 'replace'), renderLeft()), { variant: `chip${ui.clickMode === 'replace' ? ' on' : ''}` }))
        : null,
      h('p', { class: 'muted tiny' }, `${imgs.length} photo${imgs.length === 1 ? '' : 's'} in your media library (shared with the Video Studio and the Manager’s Photos page).`),
      photoGrid(imgs, (m) => addPhoto(studio.get(m.id))),
    );
  }

  function stockPanel() {
    const S = ui.stock;
    const s = loadSettings();
    const prov = PROVIDERS[S.provider];
    const keyName = `${S.provider}Key`;
    const provSel = h('select', { 'aria-label': 'Stock source' }, Object.entries(PROVIDERS).map(([id, p]) => h('option', { value: id, selected: id === S.provider }, p.label)));
    provSel.addEventListener('change', () => {
      Object.assign(S, { provider: provSel.value, results: [], error: '' });
      const st = loadSettings();
      st.stockProvider = provSel.value;
      saveSettings(st);
      renderLeft();
    });
    const keyIn = h('input', { type: 'password', autocomplete: 'off', placeholder: 'Paste your free API key', value: s[keyName] || '' });
    keyIn.addEventListener('change', () => {
      const st = loadSettings();
      st[keyName] = keyIn.value.trim();
      saveSettings(st);
      toast(st[keyName] ? `${prov.label} key saved in this browser only` : `${prov.label} key removed`);
      renderLeft();
    });
    const doc = store.get();
    const orient = doc.slides > 1 || doc.w > doc.h * 1.2 ? 'landscape' : doc.h > doc.w * 1.2 ? 'portrait' : 'square';
    const q = h('input', { type: 'search', placeholder: 'e.g. concert crowd, smoke, city night', value: S.q, 'data-k': 'ph-stock-q', 'aria-label': 'Search stock photos' });
    const run = async (page = 1) => {
      S.q = q.value;
      if (prov.needsKey && !loadSettings()[keyName]) return toast(`Add your free ${prov.label} API key first.`, 'error');
      S.busy = true;
      S.error = '';
      renderLeft();
      try {
        const res = await searchStockPhotos(S.provider, S.q, { key: loadSettings()[keyName], orientation: orient, page });
        S.results = page === 1 ? res : [...S.results, ...res];
        S.page = page;
        if (!res.length && page === 1) S.error = 'No photos found. Try other words.';
      } catch (e) {
        S.error = e.message;
      } finally {
        S.busy = false;
        renderLeft();
      }
    };
    q.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), run()));
    const take = async (it) => {
      if (ui.busy) return;
      ui.busy = it.id;
      renderLeft();
      try {
        const blob = await downloadStock(it);
        const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
        const rec = await studio.addBlob(blob, `${slug(it.title || it.provider).slice(0, 40)}.${ext}`, { provider: it.provider, author: it.author, pageUrl: it.pageUrl, license: it.license });
        addPhoto(rec);
        toast(`Added. Photo by ${it.author} on ${PROVIDERS[it.provider].label} (${it.license}).`, 'info', 6000);
      } catch (e) {
        toast(`Couldn’t download it: ${e.message}`, 'error');
      } finally {
        ui.busy = '';
        renderLeft();
      }
    };
    return h(
      'div',
      {},
      h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Source'), provSel),
      prov.needsKey ? keyBox(`${prov.label} API key`, keyIn, { saved: !!s[keyName], help: h('span', {}, 'Free: ', h('a', { href: prov.keyUrl, target: '_blank', rel: 'noopener noreferrer' }, `get a ${prov.label} key`), '. The same key works for stock video in the Video Studio. Stored in this browser only.') }) : h('p', { class: 'muted tiny' }, 'No key needed. Check each photo’s license: many need a credit.'),
      h('div', { class: 'row' }, q, button(S.busy ? 'Searching…' : 'Search', () => run(), { iconName: 'search', variant: 'sm primary', disabled: S.busy })),
      h('p', { class: 'muted tiny' }, `Looking for ${orient} photos to fit this design. `, h('a', { href: prov.licenseUrl, target: '_blank', rel: 'noopener noreferrer' }, prov.license)),
      S.error ? h('p', { class: 'warn-list small' }, S.error) : null,
      S.results.length ? h('div', { class: 'ph-grid' }, S.results.map((it) => h('button', { type: 'button', class: `ph-thumb${ui.busy === it.id ? ' busy' : ''}`, title: `${it.title || ''} · ${it.author}`, onclick: () => take(it) }, h('img', { src: it.thumb, alt: it.title || 'Stock photo', loading: 'lazy' }), ui.busy === it.id ? h('span', { class: 'ph-thumb-busy' }, 'Adding…') : null))) : null,
      S.results.length ? button('More', () => run((S.page || 1) + 1), { variant: 'sm ghost' }) : null,
    );
  }

  function textPanel() {
    const doc = store.get();
    const k = Math.min(doc.w / (doc.slides || 1), doc.h);
    return h(
      'div',
      { class: 'ph-presets' },
      TEXT_PRESETS.map(([label, o]) =>
        button(label, () => {
          const L = newLayer('text', doc, { ...o, size: Math.round(o.size * k * (doc.slides > 1 ? 1 : 1)), name: label });
          const slideW = doc.slides > 1 ? doc.w / doc.slides : doc.w;
          L.w = Math.round(slideW * 0.84);
          L.x = Math.round((slideW - L.w) / 2);
          L.h = layoutText(L).height;
          L.y = Math.round((doc.h - L.h) / 2);
          addLayer(L);
        }, { variant: `ph-preset ph-font-${slug(o.font)}` }),
      ),
      h('p', { class: 'muted tiny' }, 'Double-click text on the canvas to edit it. Your own fonts (Video Studio → Text → Your fonts) are in the font menu too.'),
    );
  }

  function shapesPanel() {
    const doc = store.get();
    const c = studio.context().colors || {};
    return h(
      'div',
      {},
      h('h3', { class: 'ph-h3' }, 'Shapes'),
      h('div', { class: 'ph-presets' }, SHAPES.map(([id, label]) => button(label, () => addLayer(newLayer('shape', doc, { shape: id, name: label, fill: c.accent || '#ffd400', ...(id === 'line' ? { h: 12, y: Math.round(doc.h / 2), strokeW: 12 } : {}) })), { variant: 'ph-preset' }))),
      h('h3', { class: 'ph-h3' }, 'Gradients and washes'),
      h(
        'div',
        { class: 'ph-presets' },
        button('Shade the bottom', () => addLayer(newLayer('gradient', doc, { name: 'Shade the bottom' })), { variant: 'ph-preset' }),
        button('Shade the top', () => addLayer(newLayer('gradient', doc, { name: 'Shade the top', angle: 0 })), { variant: 'ph-preset' }),
        button('Vignette', () => addLayer(newLayer('gradient', doc, { name: 'Vignette', kind: 'radial', fromAlpha: 0, toAlpha: 0.85, mid: 0.6 })), { variant: 'ph-preset' }),
        button('Colour wash', () => addLayer(newLayer('gradient', doc, { name: 'Colour wash', from: c.accent || '#ff2b6a', fromAlpha: 0.55, to: c.deep || '#2a00ff', toAlpha: 0.55, angle: 135, blend: 'overlay' })), { variant: 'ph-preset' }),
        button('Grain-free duotone', () => addLayer(newLayer('gradient', doc, { name: 'Duotone', from: c.deep || '#1b0033', fromAlpha: 1, to: c.accent || '#ffd400', toAlpha: 1, angle: 180, blend: 'color' })), { variant: 'ph-preset' }),
      ),
    );
  }

  // A small picture of each saved design, made when the Designs tab opens and remembered until the design changes.
  const thumbs = new Map(); // design id → { sig, url }
  const sigOf = (d) => {
    const j = `${JSON.stringify(d.layers)}|${d.bg}|${d.w}|${d.h}|${d.slides}|${epoch}`;
    let x = 5381;
    for (let i = 0; i < j.length; i++) x = ((x << 5) + x + j.charCodeAt(i)) | 0;
    return `${j.length}:${x}`;
  };
  const designThumb = (d) => {
    const sig = sigOf(d);
    const hit = thumbs.get(d.id);
    if (hit && hit.sig === sig) return hit.url;
    const c = renderDoc(d, { scale: 120 / Math.max(d.w, d.h), getImage: getPreview, getMatte });
    const url = c.toDataURL('image/jpeg', 0.7);
    thumbs.set(d.id, { sig, url });
    return url;
  };

  function designsPanel() {
    const cur = store.get();
    const all = [...saved.docs.map((d) => (d.id === cur.id ? cur : d))].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const sizeSel = h('select', { 'aria-label': 'Size for a new design', 'data-k': 'ph-new-size' }, SIZES.map(([id, l, w, hh]) => h('option', { value: id }, `${l} · ${w}×${hh}`)), h('option', { value: 'custom' }, 'Custom size…'));
    const slidesSel = h('select', { 'aria-label': 'Slides' }, h('option', { value: '0' }, 'One image'), [2, 3, 4, 5, 6, 8, 10].map((k) => h('option', { value: String(k) }, `Carousel: ${k} slides`)));
    // width and height of ONE slide, shown only for a custom size
    const wIn = h('input', { type: 'number', min: 100, max: 8000, value: 1500, 'aria-label': 'Width in pixels', 'data-k': 'ph-new-w' });
    const hIn = h('input', { type: 'number', min: 100, max: 8000, value: 1500, 'aria-label': 'Height in pixels', 'data-k': 'ph-new-h' });
    const dims = h('div', { class: 'ph-two ph-custom', hidden: true }, h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Width (px)'), wIn), h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Height (px)'), hIn));
    sizeSel.addEventListener('change', () => (dims.hidden = sizeSel.value !== 'custom'));
    const blank = () => {
      const k = +slidesSel.value;
      if (sizeSel.value === 'custom') {
        const pw = clampDim(wIn.value, k);
        const ph = clampDim(hIn.value);
        return openDoc(newDoc({ size: 'custom', slides: k, name: 'Custom design', w: pw * (k > 1 ? k : 1), h: ph }), { isNew: true });
      }
      openDoc(newDoc({ size: sizeSel.value, slides: k, name: `${sizeById(sizeSel.value)[1].split(' (')[0]} design` }), { isNew: true });
    };
    const list = h('ul', { class: 'ph-designs' });
    const rows = () => {
      const q = all.length > 4 ? ui.designQ.trim().toLowerCase() : '';
      const shown = q ? all.filter((d) => d.name.toLowerCase().includes(q)) : all;
      const todo = [];
      const lis = shown.map((d) => {
        const img = h('img', { class: 'ph-design-thumb', alt: '', width: 44, height: 44 });
        const hit = thumbs.get(d.id);
        if (hit && hit.sig === sigOf(d)) img.src = hit.url;
        else todo.push([d, img]);
        return h(
          'li',
          { class: d.id === cur.id ? 'on' : '' },
          h('button', { type: 'button', class: 'ph-design-open', onclick: () => d.id !== cur.id && openDoc(normalizeDoc(d)) }, img, h('span', { class: 'ph-design-text' }, h('strong', {}, d.name), h('span', { class: 'muted tiny' }, `${d.slides > 1 ? `${d.slides} slides · ` : ''}${d.w}×${d.h} · ${d.layers.length} layers`))),
          iconButton('copy', `Copy ${d.name}`, () => openDoc(normalizeDoc({ ...structuredClone(d), id: '', name: `${d.name} copy` }), { isNew: true }), 'ghost'),
          iconButton('trash', `Delete ${d.name}`, () => {
            if (!confirm(`Delete “${d.name}”? Its photos stay in the media library.`)) return;
            removeDesign(d.id);
          }, 'ghost'),
        );
      });
      if (!lis.length) lis.push(h('li', { class: 'muted small' }, q ? `No design called “${ui.designQ.trim()}”.` : 'No designs yet.'));
      list.replaceChildren(...lis);
      // draw the pictures one at a time so a long list doesn't freeze the panel
      const next = () => {
        const job = todo.shift();
        if (!job || !list.isConnected) return;
        try {
          job[1].src = designThumb(job[0]);
        } catch {
          /* a design that can't be drawn just has no picture */
        }
        setTimeout(next, 0);
      };
      setTimeout(next, 0);
    };
    const find = h('input', { type: 'search', placeholder: 'Find a design', value: ui.designQ, 'aria-label': 'Find a design', 'data-k': 'ph-design-q' });
    find.addEventListener('input', () => ((ui.designQ = find.value), rows()));
    rows();
    return h(
      'div',
      {},
      h('h3', { class: 'ph-h3' }, 'New blank design'),
      sizeSel,
      dims,
      slidesSel,
      button('Create', blank, { iconName: 'plus', variant: 'sm primary' }),
      h('h3', { class: 'ph-h3' }, `Your designs · ${all.length}`),
      button('Projects…', () => projects.openDialog(), { iconName: 'file', variant: 'sm', title: 'Versions, rename, copy, use as a template, download or import designs' }),
      all.length > 4 ? find : null,
      list,
    );
  }

  // ---------------------------------------------------------------- top bar
  // The bar is rebuilt only when something it shows changes (not on every slider tick: each rebuild makes new controls).
  let barKey = '';
  function renderBar(force = false) {
    const doc = store.get();
    const insets = safeInsets(doc);
    const key = [doc.name, doc.size, doc.w, doc.h, doc.slides, (posterShow(doc) || {}).id || '', insets ? ui.safe : 'x', ui.exportScale, ui.customBar, missing().length, coarse.matches].join('|');
    if (!force && key === barKey) return;
    barKey = key;
    const name = h('input', { type: 'text', class: 'ph-name', value: doc.name, 'aria-label': 'Design name', 'data-k': 'ph-name' });
    name.addEventListener('change', () => update((d) => (d.name = name.value.trim() || 'Untitled design')));
    const isCustom = !SIZES.some((s) => s[0] === doc.size);
    const size = h('select', { 'aria-label': 'Canvas size', 'data-k': 'ph-size' }, SIZES.map(([id, l, w, hh]) => h('option', { value: id, selected: doc.size === id && !ui.customBar }, `${l}`)), h('option', { value: 'custom', selected: isCustom || ui.customBar }, isCustom ? `Custom ${doc.w / (doc.slides > 1 ? doc.slides : 1)}×${doc.h}` : 'Custom size…'));
    size.addEventListener('change', () => {
      if (size.value === 'custom') return ((ui.customBar = true), renderBar(true));
      ui.customBar = false;
      const [, , w, hh] = sizeById(size.value);
      update((d) => resizeDoc(d, size.value, w, hh));
      renderBar(true);
    });
    // typed width and height of one slide (the number boxes show for a custom size, or after choosing "Custom size…")
    const k = doc.slides > 1 ? doc.slides : 1;
    const wIn = h('input', { type: 'number', min: 100, max: 8000, value: Math.round(doc.w / k), class: 'ph-dim', 'aria-label': 'Width in pixels', 'data-k': 'ph-w-px' });
    const hIn = h('input', { type: 'number', min: 100, max: 8000, value: doc.h, class: 'ph-dim', 'aria-label': 'Height in pixels', 'data-k': 'ph-h-px' });
    const applyDims = () => {
      const pw = clampDim(wIn.value, k);
      const ph = clampDim(hIn.value);
      ui.customBar = false;
      update((d) => resizeDoc(d, 'custom', pw, ph));
      renderBar(true);
    };
    for (const el of [wIn, hIn]) el.addEventListener('change', applyDims);
    const dims = isCustom || ui.customBar ? [wIn, h('span', { class: 'muted tiny' }, '×'), hIn, h('span', { class: 'muted tiny' }, 'px')] : [];
    const slidesSel = h('select', { 'aria-label': 'Carousel slides', 'data-k': 'ph-slides' }, h('option', { value: '0', selected: doc.slides < 2 }, 'One image'), [2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => h('option', { value: String(n), selected: doc.slides === n }, `Carousel · ${n} slides`)));
    slidesSel.addEventListener('change', () => update((d) => {
      const old = d.slides > 1 ? d.slides : 1;
      const n = +slidesSel.value > 1 ? +slidesSel.value : 1;
      d.w = Math.round((d.w / old) * n);
      d.slides = n > 1 ? n : 0;
      const moved = pullBackLayers(d, n);
      if (moved) setTimeout(() => toast(`${moved} layer${moved === 1 ? ' was' : 's were'} past the new edge and moved onto the last slide.`, 'info', 5000));
    }));
    // the guide for the parts of a story that Instagram's own buttons cover (9:16 designs only)
    const safeBtn = insets ? button('Safe area', () => ((ui.safe = !ui.safe), localStorage.setItem('pvm.photo.safe.v1', ui.safe ? '1' : '0'), renderBar(true), drawOverlay()), { iconName: 'eye', variant: `sm ghost${ui.safe ? ' on' : ''}`, title: 'Show or hide the parts of a story the top bar and the reply bar cover. Only on this screen, never in the image.' }) : null;
    if (safeBtn) safeBtn.setAttribute('aria-pressed', ui.safe ? 'true' : 'false');
    bar.replaceChildren(...[
      name,
      size,
      ...dims,
      slidesSel,
      safeBtn,
      iconButton('undo', 'Undo (Ctrl+Z)', () => store.undo(), 'ghost'),
      iconButton('redo', 'Redo (Ctrl+Shift+Z)', () => store.redo(), 'ghost'),
      iconButton('zoomOut', 'Zoom out', () => ((ui.zoom = (ui.zoom || scale) / 1.25), draw()), 'ghost'),
      button('Fit', () => ((ui.zoom = 0), draw()), { variant: 'sm ghost', title: 'Fit the design in the window' }),
      iconButton('zoomIn', 'Zoom in', () => ((ui.zoom = (ui.zoom || scale) * 1.25), draw()), 'ghost'),
      saveEl,
      h('div', { class: 'spacer' }),
      ...exportControls(doc, 'ph-bar-export'),
    ].filter(Boolean)); // native replaceChildren would print a null as the word "null"
    // the same actions in the Export sheet (the bar hides them on a phone or tablet)
    exportSheet.replaceChildren(h('h3', { class: 'ph-h3' }, 'Save or download'), h('div', { class: 'ph-export-btns' }, ...exportControls(doc, 'ph-export-btn').filter((x) => !x.classList.contains('muted'))), h('p', { class: 'muted small' }, `${doc.w}×${doc.h}${doc.slides > 1 ? ` · ${doc.slides} slides, each its own image` : ''}. On a phone the download goes to your Downloads or Files; “Save to media” keeps it in the app.`));
  }
  // how many times bigger than the design the downloads are: 1× (the design's size), 2× or 3× for print, as far as the browser can draw
  const scaleChoices = (doc) => exportScales(doc, coarse.matches ? { maxArea: 16e6 } : {});
  const exportControls = (doc, cls) => {
    const choices = scaleChoices(doc);
    if (!choices.includes(ui.exportScale)) ui.exportScale = 1;
    const sc = ui.exportScale;
    const k = doc.slides > 1 ? doc.slides : 1;
    const dpi = dpiOf(doc, sc);
    const scaleSel = choices.length > 1
      ? h('label', { class: `ph-scale ${cls}` }, h('span', { class: 'muted tiny' }, 'Download size'), h('select', { 'aria-label': 'Download size', 'data-k': 'ph-export-scale', onchange: (e) => ((ui.exportScale = +e.target.value), renderBar(true)) }, choices.map((n) => h('option', { value: String(n), selected: n === sc }, `${n}× · ${Math.round((doc.w / k) * n)}×${Math.round(doc.h * n)}`))))
      : null;
    return [
      relinkButton('photo', { variant: `sm ${cls}` }),
      h('span', { class: `muted tiny ${cls}` }, `${Math.round(doc.w * sc)}×${Math.round(doc.h * sc)}${doc.slides > 1 ? ` · ${doc.slides} slides of ${Math.round((doc.w / k) * sc)}×${Math.round(doc.h * sc)}` : ''}${dpi ? ` · ${dpi} dpi` : ''}`),
      scaleSel,
      posterShow(doc) ? button('Use as the show’s poster', usePoster, { iconName: 'check', variant: `sm ${cls}`, title: `Save it to the media library and put it on the show at ${posterShow(doc).venue || 'this venue'}` }) : null,
      button('Save to media', saveToLibrary, { iconName: 'image', variant: `sm ${cls}`, title: 'Add the finished image(s) to the media library, the Photos page and the Video Studio' }),
      doc.slides > 1 ? button('Separate files', () => exportImages('image/png', true), { variant: `sm ghost ${cls}`, title: 'Download each slide as its own PNG instead of one .zip (handy on a phone)' }) : null,
      button('JPG', () => exportImages('image/jpeg'), { iconName: 'download', variant: `sm ${cls}` }),
      button(doc.slides > 1 ? `PNG · ${doc.slides} slides` : 'PNG', () => exportImages('image/png'), { iconName: 'download', variant: `sm primary ${cls}` }),
    ].filter(Boolean);
  };

  // ---------------------------------------------------------------- export
  const missing = () => docMedia(store.get()).filter((id) => !getImage(id));
  /** The finished image(s). `scale` 2 or 3 draws them bigger for print; the library copy and the poster stay 1×. */
  async function images(type, scale = 1) {
    if (studio.ensure) await studio.ensure(docMedia(store.get()));
    const doc = store.get();
    ensureMattes();
    if ([...mattes.values()].includes('pending')) {
      toast('Finding the person first…', 'info', 20000);
      for (let i = 0; i < 400 && [...mattes.values()].includes('pending'); i++) await new Promise((r) => setTimeout(r, 100));
    }
    const opt = { getImage, getMatte, scale };
    const canv = doc.slides > 1 ? renderSlides(doc, opt) : [renderDoc(doc, opt)];
    const ext = type === 'image/jpeg' ? 'jpg' : 'png';
    const blobs = [];
    for (const c of canv) blobs.push(await canvasBlob(c, type, 0.92)); // one at a time: three huge canvases at once can run a browser out of memory
    const tag = scale > 1 ? `-${scale}x` : '';
    return blobs.map((b, i) => ({ blob: b, name: `${slug(doc.name)}${tag}${canv.length > 1 ? `-${i + 1}` : ''}.${ext}` }));
  }
  async function exportImages(type, separateFiles = false) {
    if (studio.ensure) await studio.ensure(docMedia(store.get())); // photos not open yet are opened first
    const gone = missing();
    const warn = () => gone.length && toast(`${gone.length === 1 ? 'A photo in this design is' : `${gone.length} photos in this design are`} not in the media library (${gone.map((id) => (studio.fileName && studio.fileName(id)) || 'name unknown').join(', ')}) and left out. Use Replace missing files to put ${gone.length === 1 ? 'it' : 'them'} back.`, 'error', 9000);
    warn();
    const sc = ui.exportScale;
    const out = await images(type, sc);
    warn(); // the matte wait may have replaced the toast
    const doc = store.get();
    if (out.length > 1 && !separateFiles) {
      // one .zip beats a burst of downloads that Chrome may ask to allow (and drop when refused)
      const files = await Promise.all(out.map(async (f, i) => ({ name: `${slug(doc.name)}${sc > 1 ? `-${sc}x` : ''}-${String(i + 1).padStart(2, '0')}.${f.name.split('.').pop()}`, bytes: new Uint8Array(await f.blob.arrayBuffer()) })));
      download(new Blob([zipStore(files)], { type: 'application/zip' }), `${slug(doc.name)}${sc > 1 ? `-${sc}x` : ''}.zip`);
    } else {
      for (const [i, f] of out.entries()) {
        if (i) await new Promise((r) => setTimeout(r, 350)); // browsers drop downloads fired together
        download(f.blob, f.name);
      }
    }
    if (!gone.length) toast(out.length > 1 ? (separateFiles ? `Downloading ${out.length} slides.` : `Downloading ${slug(doc.name)}${sc > 1 ? `-${sc}x` : ''}.zip with ${out.length} slides. Post them in order and they line up.`) : `Downloading ${out[0].name}`);
    lastExport.files = out;
  }
  /** The show a poster design was made for (when it still exists). */
  function posterShow(doc) {
    return doc.showId ? studio.context().shows.find((s) => s.id === doc.showId) || null : null;
  }
  async function usePoster() {
    const doc = store.get();
    const show = posterShow(doc);
    if (!show) return;
    const [first] = await images('image/png');
    if (!first) return;
    const [rec] = await studio.saveToLibrary([first.blob], [first.name]);
    studio.setShowPoster(show.id, rec.id);
    toast(`Poster saved and put on the show at ${show.venue || 'the venue'}${show.date ? ` (${show.date})` : ''}.`, 'info', 5000);
  }
  async function saveToLibrary() {
    const out = await images('image/png');
    await studio.saveToLibrary(out.map((f) => f.blob), out.map((f) => f.name));
    toast(`Saved ${out.length > 1 ? `${out.length} slides` : 'the image'} to the media library and the artist’s Photos.`);
  }

  // ---------------------------------------------------------------- right panel
  const slider = (k, label, value, min, max, step, set, fmt = (v) => v) => {
    const el = h('input', { type: 'range', min, max, step, value, 'data-k': k, 'aria-label': label });
    const out = h('span', { class: 'ph-val' }, fmt(value));
    el.oninput = () => {
      out.textContent = fmt(+el.value);
      update((d) => {
        const L = d.layers.find((x) => x.id === ui.sel);
        if (L) set(L, +el.value, d);
      }, k);
    };
    return h('label', { class: 'ph-slider' }, h('span', {}, label), el, out);
  };
  const field = (k, label, value, set, { type = 'text', ...rest } = {}) => {
    const el = h(type === 'textarea' ? 'textarea' : 'input', { ...(type === 'textarea' ? { rows: 3 } : { type }), value: value ?? '', 'data-k': k, 'aria-label': label, ...rest });
    if (type === 'textarea') el.value = value ?? '';
    const ev = type === 'color' || type === 'textarea' || type === 'text' ? 'input' : 'change';
    el.addEventListener(ev, () => update((d) => {
      const L = d.layers.find((x) => x.id === ui.sel);
      if (L) set(L, type === 'number' ? +el.value : el.value, d);
    }, k));
    return h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, label), el);
  };
  const select = (k, label, value, options, set) => {
    const el = h('select', { 'data-k': k, 'aria-label': label }, options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
    el.addEventListener('change', () => update((d) => {
      const L = d.layers.find((x) => x.id === ui.sel);
      if (L) set(L, el.value, d);
    }));
    return h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, label), el);
  };
  const check = (k, label, value, set) => {
    const el = h('input', { type: 'checkbox', checked: !!value, 'data-k': k });
    el.addEventListener('change', () => update((d) => {
      const L = d.layers.find((x) => x.id === ui.sel);
      if (L) set(L, el.checked, d);
    }));
    return h('label', { class: 'ph-check' }, el, h('span', {}, label));
  };
  const sect = (title, ...kids) => h('details', { class: 'ph-sect', open: true }, h('summary', {}, title), h('div', { class: 'ph-sect-body' }, ...kids));
  const fontOptions = () => [...FONTS.map((f) => [f.id, f.label]), ...studio.fonts().map((f) => [f, `${f} (yours)`])];

  function layerProps(L) {
    const doc = store.get();
    const out = [];
    out.push(
      h(
        'div',
        { class: 'ph-props-head' },
        field('ph-lname', 'Layer', L.name, (x, v) => (x.name = v)),
        h(
          'div',
          { class: 'row' },
          iconButton('copy', 'Duplicate (Ctrl+D)', () => {
            let c = null;
            update((d) => (c = duplicateLayer(d, L.id)));
            if (c) (ui.sel = c.id), renderRight();
          }, 'ghost'),
          iconButton('arrowUp', 'Bring forward', () => update((d) => moveLayer(d, L.id, 1)), 'ghost'),
          iconButton('arrowDown', 'Send backward', () => update((d) => moveLayer(d, L.id, -1)), 'ghost'),
          iconButton('trash', 'Delete (Delete key)', removeSel, 'ghost danger'),
        ),
      ),
    );
    if (L.type === 'text') {
      out.push(
        sect(
          'Text',
          field('ph-text', 'Text', L.text, (x, v) => (x.text = v), { type: 'textarea' }),
          select('ph-font', 'Font', L.font, fontOptions(), (x, v) => (x.font = v)),
          h('div', { class: 'ph-two' }, field('ph-size', 'Size', L.size, (x, v) => (x.size = Math.max(4, v || 4)), { type: 'number', min: 4 }), select('ph-weight', 'Weight', String(L.weight), [['300', 'Light'], ['400', 'Regular'], ['600', 'Semibold'], ['700', 'Bold'], ['800', 'Extra bold'], ['900', 'Black']], (x, v) => (x.weight = +v))),
          h('div', { class: 'ph-two' }, field('ph-color', 'Colour', L.color.slice(0, 7), (x, v) => (x.color = v), { type: 'color' }), select('ph-align', 'Align', L.align, [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], (x, v) => (x.align = v))),
          slider('ph-lh', 'Line height', L.lineHeight, 0.7, 2, 0.05, (x, v) => (x.lineHeight = v), (v) => v.toFixed(2)),
          slider('ph-ls', 'Letter spacing', L.letter, -10, 40, 1, (x, v) => (x.letter = v), (v) => `${v}px`),
          h('div', { class: 'row' }, check('ph-upper', 'Capitals', L.upper, (x, v) => (x.upper = v)), check('ph-italic', 'Italic', L.italic, (x, v) => (x.italic = v))),
          h('div', { class: 'ph-two' }, check('ph-stroke', 'Outline', L.stroke.on, (x, v) => (x.stroke.on = v)), L.stroke.on ? field('ph-strokec', 'Outline colour', L.stroke.color, (x, v) => (x.stroke.color = v), { type: 'color' }) : h('span')),
          L.stroke.on ? slider('ph-strokew', 'Outline width', L.stroke.width, 1, 30, 1, (x, v) => (x.stroke.width = v), (v) => `${v}px`) : null,
          h('div', { class: 'ph-two' }, check('ph-pill', 'Label behind', L.bg.on, (x, v) => (x.bg.on = v)), L.bg.on ? field('ph-pillc', 'Label colour', L.bg.color, (x, v) => (x.bg.color = v), { type: 'color' }) : h('span')),
          L.color.length > 7 && L.color.endsWith('00') ? h('p', { class: 'muted tiny' }, 'The fill is see-through, so only the outline shows. Pick a colour to fill it.') : null,
        ),
      );
    }
    if (L.type === 'image') {
      const imgs = studio.images();
      out.push(
        sect(
          'Photo',
          select('ph-media', 'Photo', L.mediaId || '', [['', '— pick a photo —'], ...imgs.map((m) => [m.id, m.name])], (x, v) => (x.mediaId = v || null)),
          select('ph-fit', 'Fit', L.fit, [['cover', 'Fill the box (crop)'], ['contain', 'Show it all'], ['stretch', 'Stretch']], (x, v) => (x.fit = v)),
          L.fit !== 'stretch' ? slider('ph-zoom', 'Zoom', L.zoom, 1, 4, 0.05, (x, v) => (x.zoom = v), (v) => `${v.toFixed(2)}×`) : null,
          L.fit !== 'stretch' ? slider('ph-fx', 'Crop left ↔ right', L.focusX, 0, 1, 0.01, (x, v) => (x.focusX = v), (v) => `${Math.round(v * 100)}%`) : null,
          L.fit !== 'stretch' ? slider('ph-fy', 'Crop top ↕ bottom', L.focusY, 0, 1, 0.01, (x, v) => (x.focusY = v), (v) => `${Math.round(v * 100)}%`) : null,
          button('Match the photo’s shape', () => {
            const r = studio.get(L.mediaId);
            if (r && r.width) update(L_((x) => (x.h = Math.round((x.w * r.height) / r.width))));
          }, { variant: 'sm ghost' }),
        ),
      );
      const a = L.adjust;
      out.push(
        sect(
          'Adjust',
          h('div', { class: 'chips' }, LOOKS.map(([id, label, v]) => button(label, () => update(L_((x) => (x.adjust = { ...defaultAdjust(), ...v })), 'look'), { variant: 'chip' }))),
          slider('ph-br', 'Brightness', a.brightness, 0, 200, 1, (x, v) => (x.adjust.brightness = v), (v) => `${v}%`),
          slider('ph-co', 'Contrast', a.contrast, 0, 200, 1, (x, v) => (x.adjust.contrast = v), (v) => `${v}%`),
          slider('ph-sa', 'Saturation', a.saturate, 0, 300, 1, (x, v) => (x.adjust.saturate = v), (v) => `${v}%`),
          slider('ph-hu', 'Hue', a.hue, -180, 180, 1, (x, v) => (x.adjust.hue = v), (v) => `${v}°`),
          slider('ph-gr', 'Black and white', a.grayscale, 0, 100, 1, (x, v) => (x.adjust.grayscale = v), (v) => `${v}%`),
          slider('ph-se', 'Sepia', a.sepia, 0, 100, 1, (x, v) => (x.adjust.sepia = v), (v) => `${v}%`),
          slider('ph-bl', 'Blur', a.blur, 0, 60, 1, (x, v) => (x.adjust.blur = v), (v) => `${v}px`),
          slider('ph-in', 'Invert', a.invert, 0, 100, 1, (x, v) => (x.adjust.invert = v), (v) => `${v}%`),
        ),
      );
    }
    if (L.type === 'shape') {
      out.push(
        sect(
          'Shape',
          select('ph-shape', 'Shape', L.shape, SHAPES, (x, v) => (x.shape = v)),
          h('div', { class: 'ph-two' }, check('ph-fillon', 'Fill', L.fillOn !== false, (x, v) => (x.fillOn = v)), field('ph-fill', 'Fill colour', L.fill, (x, v) => (x.fill = v), { type: 'color' })),
          h('div', { class: 'ph-two' }, field('ph-strk', 'Outline colour', L.stroke, (x, v) => (x.stroke = v), { type: 'color' }), field('ph-strkw', 'Outline width', L.strokeW, (x, v) => (x.strokeW = Math.max(0, v || 0)), { type: 'number', min: 0 })),
          L.shape === 'rect' ? slider('ph-rad', 'Round corners', L.radius, 0, 1, 0.01, (x, v) => (x.radius = v), (v) => `${Math.round(v * 100)}%`) : null,
        ),
      );
    }
    if (L.type === 'gradient') {
      out.push(
        sect(
          'Gradient',
          select('ph-gk', 'Kind', L.kind, [['linear', 'Straight'], ['radial', 'Round (from the middle)']], (x, v) => (x.kind = v)),
          h('div', { class: 'ph-two' }, field('ph-gf', 'From', L.from, (x, v) => (x.from = v), { type: 'color' }), field('ph-gt', 'To', L.to, (x, v) => (x.to = v), { type: 'color' })),
          slider('ph-gfa', 'From opacity', L.fromAlpha, 0, 1, 0.01, (x, v) => (x.fromAlpha = v), (v) => `${Math.round(v * 100)}%`),
          slider('ph-gta', 'To opacity', L.toAlpha, 0, 1, 0.01, (x, v) => (x.toAlpha = v), (v) => `${Math.round(v * 100)}%`),
          L.kind === 'linear' ? slider('ph-ga', 'Angle', L.angle, 0, 360, 1, (x, v) => (x.angle = v), (v) => `${v}°`) : null,
          slider('ph-gm', 'Middle', L.mid, 0.05, 0.95, 0.01, (x, v) => (x.mid = v), (v) => `${Math.round(v * 100)}%`),
        ),
      );
    }
    // mask
    const M = L.mask;
    const matte = L.type === 'image' && M.type === 'person' ? mattes.get(L.mediaId) : null;
    out.push(
      sect(
        'Mask',
        select('ph-mask', 'Mask', M.type, MASKS.filter(([k]) => k !== 'person' || L.type === 'image'), (x, v) => ((x.mask.type = v), v === 'rect' || v === 'ellipse' ? Object.assign(x.mask, { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }) : null)),
        M.type === 'clip' ? h('p', { class: 'muted tiny' }, doc.layers.findIndex((x) => x.id === L.id) === 0 ? 'Nothing is below this layer yet. Put text or a shape under it (Send backward) to fill it with this layer.' : 'Shows only where the layer below has something: put a photo above big text for text filled with a photo.') : null,
        M.type === 'person' ? h('p', { class: 'muted tiny' }, !L.mediaId ? 'Pick a photo first.' : matte instanceof HTMLCanvasElement ? 'Person found. Turn on Invert to keep the background instead.' : matte instanceof Error ? `Couldn’t find a person: ${matte.message}` : 'Finding the person… (the first time loads the model)') : null,
        M.type !== 'none' ? check('ph-minv', 'Invert (keep the outside)', M.invert, (x, v) => (x.mask.invert = v)) : null,
        ['rect', 'ellipse', 'radial', 'fadeDown', 'fadeUp', 'fadeLeft', 'fadeRight'].includes(M.type) ? slider('ph-mf', M.type.startsWith('fade') ? 'Fade length' : 'Soft edge', M.feather, 0, 1, 0.01, (x, v) => (x.mask.feather = v), (v) => `${Math.round(v * 100)}%`) : null,
        ['rect', 'ellipse', 'radial'].includes(M.type)
          ? h(
              'div',
              { class: 'ph-two' },
              slider('ph-mx', 'Left', M.x, 0, 1, 0.01, (x, v) => (x.mask.x = v), (v) => `${Math.round(v * 100)}%`),
              slider('ph-my', 'Top', M.y, 0, 1, 0.01, (x, v) => (x.mask.y = v), (v) => `${Math.round(v * 100)}%`),
              slider('ph-mw', 'Width', M.w, 0.02, 1, 0.01, (x, v) => (x.mask.w = v), (v) => `${Math.round(v * 100)}%`),
              slider('ph-mh', 'Height', M.h, 0.02, 1, 0.01, (x, v) => (x.mask.h = v), (v) => `${Math.round(v * 100)}%`),
            )
          : null,
      ),
    );
    out.push(
      sect(
        'Position and blend',
        h('div', { class: 'ph-two' }, field('ph-x', 'X', L.x, (x, v) => (x.x = v || 0), { type: 'number' }), field('ph-y', 'Y', L.y, (x, v) => (x.y = v || 0), { type: 'number' })),
        h('div', { class: 'ph-two' }, field('ph-w', 'Width', L.w, (x, v) => (x.w = Math.max(4, v || 4)), { type: 'number' }), L.type === 'text' ? h('span', { class: 'muted tiny' }, `Height follows the text (${L.h})`) : field('ph-h', 'Height', L.h, (x, v) => (x.h = Math.max(4, v || 4)), { type: 'number' })),
        slider('ph-rot', 'Rotation', L.rot, -180, 180, 1, (x, v) => (x.rot = v), (v) => `${v}°`),
        slider('ph-op', 'Opacity', L.opacity, 0, 1, 0.01, (x, v) => (x.opacity = v), (v) => `${Math.round(v * 100)}%`),
        select('ph-blend', 'Blend', L.blend, BLENDS, (x, v) => (x.blend = v)),
        h(
          'div',
          { class: 'row' },
          button('Flip ↔', () => update(L_((x) => (x.flipX = !x.flipX))), { variant: 'sm ghost' }),
          button('Flip ↕', () => update(L_((x) => (x.flipY = !x.flipY))), { variant: 'sm ghost' }),
          button('Centre', () => update(L_((x, _v, d) => (alignLayer(d, x, 'center'), alignLayer(d, x, 'middle')))), { variant: 'sm ghost', title: 'Centre it on its slide' }),
          L.type !== 'text' ? button('Fill the canvas', () => update(L_((x, _v, d) => Object.assign(x, { x: 0, y: 0, w: d.w, h: d.h, rot: 0 }))), { variant: 'sm ghost' }) : null,
        ),
        // line it up with the edges of its own slide
        h('div', { class: 'ph-align', role: 'group', 'aria-label': 'Align on the slide' }, ALIGNS.map(([where, label, ic]) => iconButton(ic, `Align ${label}`, () => update(L_((x, _v, d) => alignLayer(d, x, where))), 'ghost'))),
        h('div', { class: 'ph-two' }, check('ph-sh', 'Shadow', L.shadow.on, (x, v) => (x.shadow.on = v)), L.shadow.on ? field('ph-shc', 'Shadow colour', L.shadow.color, (x, v) => (x.shadow.color = v), { type: 'color' }) : h('span')),
        L.shadow.on ? slider('ph-shb', 'Shadow blur', L.shadow.blur, 0, 120, 1, (x, v) => (x.shadow.blur = v), (v) => `${v}px`) : null,
        L.shadow.on ? slider('ph-shy', 'Shadow drop', L.shadow.y, -60, 60, 1, (x, v) => (x.shadow.y = v), (v) => `${v}px`) : null,
      ),
    );
    return out;
  }

  function docProps() {
    const doc = store.get();
    const bg = h('input', { type: 'color', value: /^#[\da-f]{6}$/i.test(doc.bg) ? doc.bg : '#111111', 'data-k': 'ph-bg', 'aria-label': 'Background colour' });
    bg.addEventListener('input', () => update((d) => (d.bg = bg.value), 'bg'));
    return [
      sect(
        'Design',
        h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Background colour'), bg),
        h('p', { class: 'muted tiny' }, 'Click a layer on the canvas to change it. Drag to move it, pull the handles to resize, and the round knob to rotate. Shift keeps the shape; Alt turns off snapping.'),
        doc.slides > 1 ? h('p', { class: 'muted tiny' }, `A ${doc.slides}-slide carousel: each slide exports as its own ${Math.round(doc.w / doc.slides)}×${doc.h} image. Put things across the dashed seams so they carry on when people swipe.`) : null,
      ),
    ];
  }

  function layersList() {
    const doc = store.get();
    const items = [...doc.layers].reverse();
    let dragId = null;
    const list = h(
      'ol',
      { class: 'ph-layers', 'aria-label': 'Layers, front first' },
      items.map((L) => {
        const li = h(
          'li',
          { class: `ph-layer${L.id === ui.sel ? ' on' : ''}${L.visible ? '' : ' off'}`, draggable: 'true', 'data-id': L.id },
          iconButton(L.visible ? 'eye' : 'eyeOff', L.visible ? `Hide ${L.name}` : `Show ${L.name}`, () => update((d) => {
            const x = d.layers.find((y) => y.id === L.id);
            if (x) x.visible = !x.visible;
          }), 'ghost'),
          h('button', { type: 'button', class: 'ph-layer-name', onclick: () => ((ui.sel = L.id), renderRight(), drawOverlay()) }, icon({ image: 'image', text: 'type', shape: 'layers', gradient: 'palette' }[L.type], 14), h('span', {}, L.name), L.mask.type !== 'none' ? h('span', { class: 'mgr-chip' }, L.mask.type === 'clip' ? 'clipped' : 'mask') : null),
          lockButton(L.locked, `Lock ${L.name}`, () => update((d) => {
            const x = d.layers.find((y) => y.id === L.id);
            if (x) x.locked = !x.locked;
          })),
        );
        li.addEventListener('dragstart', (e) => ((dragId = L.id), e.dataTransfer.setData('text/plain', L.id)));
        li.addEventListener('dragover', (e) => e.preventDefault());
        li.addEventListener('drop', (e) => {
          e.preventDefault();
          const from = dragId || e.dataTransfer.getData('text/plain');
          if (!from || from === L.id) return;
          update((d) => (d.layers = dropAfter(d.layers, from, L.id))); // dropped on a row: goes just in front of it
        });
        // a visible handle that works with a finger (the row itself can't be dragged on most touch browsers)
        const grip = h('span', { class: 'ph-grip', role: 'img', 'aria-label': `Drag to reorder ${L.name}`, title: 'Drag to reorder' }, icon('grid', 16));
        let gripping = false;
        const rowAt = (e) => {
          const el = document.elementFromPoint(e.clientX, e.clientY);
          return el && el.closest ? el.closest('.ph-layer') : null;
        };
        grip.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          gripping = true;
          li.classList.add('lifting');
          try {
            grip.setPointerCapture(e.pointerId);
          } catch {
            /* synthetic pointer */
          }
        });
        grip.addEventListener('pointermove', (e) => {
          if (!gripping) return;
          list.querySelectorAll('.drop').forEach((x) => x.classList.remove('drop'));
          const row = rowAt(e);
          if (row && row.dataset.id !== L.id) row.classList.add('drop');
          const r = right.getBoundingClientRect();
          if (e.clientY < r.top + 36) right.scrollTop -= 14;
          else if (e.clientY > r.bottom - 36) right.scrollTop += 14;
        });
        const gripEnd = (e) => {
          if (!gripping) return;
          gripping = false;
          const row = e.type === 'pointerup' ? rowAt(e) : null;
          list.querySelectorAll('.drop, .lifting').forEach((x) => x.classList.remove('drop', 'lifting'));
          if (row && row.dataset.id && row.dataset.id !== L.id) update((d) => (d.layers = dropAfter(d.layers, L.id, row.dataset.id)));
        };
        grip.addEventListener('pointerup', gripEnd);
        grip.addEventListener('pointercancel', gripEnd);
        li.prepend(grip);
        return li;
      }),
    );
    return h('section', { class: 'ph-layers-box' }, h('h3', { class: 'ph-h3' }, `Layers · ${doc.layers.length}`), doc.layers.length ? list : h('p', { class: 'muted tiny' }, 'Empty. Add a template, a photo, text or a shape on the left.'), h('p', { class: 'muted tiny' }, 'Drag rows to reorder. The top row is in front.'));
  }

  function renderRight() {
    const L = selLayer();
    // keep the focused field and caret through the rebuild
    const a = document.activeElement;
    const k = a && right.contains(a) && a.dataset ? a.dataset.k : null;
    const selr = k && 'selectionStart' in a && a.type !== 'range' && a.type !== 'color' && a.type !== 'number' ? [a.selectionStart, a.selectionEnd] : null;
    const scroll = right.scrollTop;
    right.replaceChildren(h('div', { class: 'ph-props' }, ...(L ? layerProps(L) : docProps())), layersList());
    right.scrollTop = scroll;
    if (k) {
      const el = right.querySelector(`[data-k="${CSS.escape(k)}"]`);
      if (el) {
        el.focus({ preventScroll: true });
        if (selr && el.setSelectionRange) el.setSelectionRange(selr[0], selr[1]);
      }
    }
  }

  // ---------------------------------------------------------------- store → screen
  let lastDocId = store.get().id;
  store.subscribe((d, meta) => {
    persist();
    ensureMattes();
    draw();
    if (ui.sel && !d.layers.some((L) => L.id === ui.sel)) ui.sel = null;
    // rebuild the panels unless the change came from a field being typed in or a drag
    const typing = document.activeElement && right.contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement.type !== 'checkbox';
    if (!drag && (!typing || meta.type === 'replace')) renderRight();
    if (meta.type === 'replace' || d.id !== lastDocId) {
      lastDocId = d.id;
      ui.zoom = 0;
      renderLeft();
    }
    renderBar();
  });
  document.fonts && document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', () => (epoch++, draw()));

  const lastExport = { files: [] };
  return {
    store,
    /** Save a change that is still waiting for its short delay (the page is closing or hiding). */
    flush: () => savePending && writeNow(),
    show() {
      renderLeft();
      renderBar();
      renderRight();
      renderSheetChrome();
      ensureMattes();
      draw();
    },
    onKey,
    /** Open a template with what the app picked (a song, a show…). */
    openTemplate(id, extra = {}) {
      const tp = templateById(id);
      if (!tp) return;
      const c = studio.context();
      // the artist's own photo first, else the newest photo in the library
      const ph = studio.get(extra.photoId || (c.photoIds || [])[0] || (studio.images().at(-1) || {}).id);
      const cov = extra.coverId ? studio.get(extra.coverId) : extra.song && c.coverOf ? studio.get(c.coverOf(extra.song)) : null;
      const doc = tp.build({ ...c, ...extra, photo: ph ? { id: ph.id, w: ph.width, h: ph.height } : null, cover: cov ? { id: cov.id, w: cov.width, h: cov.height } : null });
      openDoc(doc, { isNew: true });
    },
    /** Open slides made elsewhere (the Video Studio's Carousel page) as one carousel design, a photo on each slide. */
    openCarousel(items, name = 'Carousel', total = items.length) {
      const { doc } = carouselFromImages(items, { name });
      openDoc(doc, { isNew: true });
      toast(total > items.length ? `Opened the first ${items.length} of ${total} slides: the Photo Studio carousel holds up to 10.` : `Opened ${items.length} slide${items.length === 1 ? '' : 's'} as a carousel design. Add text, shapes and looks on top.`, 'info', 5000);
    },
    mediaChanged: () => (epoch++, renderLeft(), renderRight(), draw()),
    lastExport,
    get selected() {
      return ui.sel;
    },
    select(id) {
      ui.sel = id;
      renderRight();
      drawOverlay();
    },
    designs: () => saved.docs,
    /** Designs from a projects file or a backup, added next to the ones here. Returns how many came in. */
    addDesigns: (docs) => projects.addDesigns(docs),
    openProjects: () => projects.openDialog(),
    /** The saved designs and the open one, for finding the photos they point at. */
    refSources: () => [saved.docs, store.get()],
  };
}
