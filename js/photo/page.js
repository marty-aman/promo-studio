// The Photo Studio workspace: posters, promo images, stories, thumbnails and carousels. Left: the
// templates, your photos, stock photos, text and shapes, and saved designs. Middle: the canvas,
// where you click to select, drag to move, pull the handles to resize and the top knob to rotate.
// Right: the selected layer's settings (adjustments, mask, shadow…) and the layer stack.
import { h, icon, button, iconButton, toast, download, pickFiles, keyBox } from '../dom.js';
import { createStore, loadSettings, saveSettings, FONTS } from '../state.js';
import { PROVIDERS, searchStockPhotos, downloadStock } from '../stock.js';
import { driveButton } from '../gdrive.js';
import { SIZES, sizeById, BLENDS, MASKS, SHAPES, LOOKS, defaultAdjust, newDoc, newLayer, normalizeDoc, hitTest, moveLayer, duplicateLayer, resizeBox, loadDesigns, saveDesigns, docMedia, slidesForImage } from './model.js';
import { drawDoc, renderDoc, renderSlides, canvasBlob, layoutText } from './render.js';
import { TEMPLATES, templateById, countdownSet, carouselSlides } from './templates.js';
import { PAGE_SIZES, loadPageSize, savePageSize, paginate, folderPath, folderTree } from '../manager/photos.js';

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
 * addBlob(blob, name, attribution) → record, saveToLibrary(blobs, names), context() → { band,
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
  const ui = { tab: 'templates', sel: null, zoom: 0, stock: { provider: loadSettings().stockProvider || 'pexels', q: '', results: [], busy: false, error: '' }, tpl: { songId: '', showId: '', tourId: '', photoId: '', slides: 0 }, clickMode: 'add', busy: '', folder: 'all', page: 1, size: 0 };
  const mattes = new Map(); // mediaId → canvas | 'pending' | Error

  // ---- persistence: the current design lives in the store; the rest in `saved`
  let saveTimer = null;
  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const d = { ...store.get(), updatedAt: new Date().toISOString() };
      saved.docs = saved.docs.map((x) => (x.id === d.id ? d : x));
      if (!saved.docs.some((x) => x.id === d.id)) saved.docs.push(d);
      saved.current = d.id;
      if (!saveDesigns(saved)) toast('Could not save designs (browser storage full?)', 'error');
    }, 300);
  };
  const openDoc = (doc, { isNew = false } = {}) => {
    const cur = store.get();
    saved.docs = saved.docs.map((x) => (x.id === cur.id ? cur : x));
    if (isNew) saved.docs.push(doc);
    saved.current = doc.id;
    ui.sel = null;
    store.replace(doc);
    saveDesigns(saved);
  };

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
  root.replaceChildren(left, center, right);

  let scale = 1;
  let raf = 0;
  const draw = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(drawNow);
  };
  function drawNow() {
    const doc = store.get();
    const avW = Math.max(100, stage.clientWidth - 48);
    const avH = Math.max(100, stage.clientHeight - 48);
    const fit = Math.min(avW / doc.w, avH / doc.h);
    scale = ui.zoom ? ui.zoom : fit;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.round(doc.w * scale);
    const ch = Math.round(doc.h * scale);
    stageBox.style.width = `${cw}px`;
    stageBox.style.height = `${ch}px`;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    drawDoc(canvas.getContext('2d'), doc, { scale: scale * dpr, getImage, getMatte, preview: true });
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
    if (snapGuide.x != null) parts.push(h('div', { class: 'ph-guide v', style: { left: `${snapGuide.x * scale}px` } }));
    if (snapGuide.y != null) parts.push(h('div', { class: 'ph-guide h', style: { top: `${snapGuide.y * scale}px` } }));
    if (L && L.visible) {
      const sel = h('div', { class: `ph-sel${L.locked ? ' locked' : ''}`, style: { left: `${L.x * scale}px`, top: `${L.y * scale}px`, width: `${L.w * scale}px`, height: `${L.h * scale}px`, transform: `rotate(${L.rot}deg)` } });
      if (!L.locked) {
        for (const k of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) sel.append(h('span', { class: `ph-handle ${k}`, 'data-handle': k }));
        sel.append(h('span', { class: 'ph-rot', 'data-handle': 'rot', title: 'Drag to rotate (Shift: 15° steps)' }));
      }
      parts.push(sel);
    }
    overlay.replaceChildren(...parts);
  }
  new ResizeObserver(() => draw()).observe(stage);

  // ---------------------------------------------------------------- pointer: select, move, resize, rotate
  let drag = null;
  const snapGuide = { x: null, y: null };
  const docPoint = (e) => {
    const r = overlay.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };
  overlay.addEventListener('pointerdown', (e) => {
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
    if (!L || L.locked) return;
    e.preventDefault();
    drag = { mode: handle === 'rot' ? 'rot' : handle ? 'resize' : 'move', handle, start: p, L: structuredClone(L), key: `drag-${L.id}-${Date.now()}`, moved: false };
    try {
      overlay.setPointerCapture(e.pointerId);
    } catch {
      /* a pointer the browser doesn't know (synthetic): moves still reach the overlay */
    }
  });
  overlay.addEventListener('pointermove', (e) => {
    if (!drag) return;
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
  const endDrag = () => {
    if (!drag) return;
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
    const tabs = h('div', { class: 'ph-tabs', role: 'tablist' }, TABS.map(([k, l, ic]) => h('button', { type: 'button', role: 'tab', 'aria-selected': ui.tab === k ? 'true' : 'false', class: `ph-tab${ui.tab === k ? ' on' : ''}`, onclick: () => ((ui.tab = k), renderLeft()) }, icon(ic, 16), h('span', {}, l))));
    const body = { templates: templatesPanel, photos: photosPanel, stock: stockPanel, text: textPanel, shapes: shapesPanel, designs: designsPanel }[ui.tab]();
    left.replaceChildren(tabs, h('div', { class: 'ph-left-body', role: 'tabpanel' }, body));
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
      openDoc(doc, { isNew: true });
      toast(`New design: ${doc.name}. Everything is editable.`);
    };
    const slidesPick = h('select', { 'data-k': 'tpl-slides', 'aria-label': 'Slides' }, h('option', { value: '0', selected: !t.slides }, `Auto (${t.photoIds.length > 1 ? carouselSlides(t.photoIds.map((id) => studio.get(id)).filter(Boolean).map((x) => ({ w: x.width, h: x.height }))) : photo ? slidesForImage(photo.width, photo.height) : 3})`), [2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => h('option', { value: String(k), selected: t.slides === k }, `${k} slides`)));
    slidesPick.addEventListener('change', () => ((t.slides = +slidesPick.value), renderLeft()));
    return h(
      'div',
      { class: 'ph-tpl' },
      h('p', { class: 'muted small' }, `Made from ${c.band.name || 'your band'}’s theme, logo and details. Pick what goes in, then a template.`),
      h('div', { class: 'ph-tpl-photo' }, photo ? h('img', { src: photo.thumb || photo.url, alt: '' }) : h('span', { class: 'muted tiny' }, 'No photo'), h('span', { class: 'muted tiny' }, photo ? `Photo: ${photo.name}` : 'Pick a photo below')),
      t.photoIds.length > 1 ? h('p', { class: 'muted tiny' }, `${t.photoIds.length} photos picked: the carousel lays them all side by side, photo in photo frames the 2nd over the 1st.`) : null,
      h(
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

  function designsPanel() {
    const cur = store.get();
    const all = [...saved.docs.map((d) => (d.id === cur.id ? cur : d))].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const sizeSel = h('select', { 'aria-label': 'Size for a new design' }, SIZES.map(([id, l, w, hh]) => h('option', { value: id }, `${l} · ${w}×${hh}`)));
    const slidesSel = h('select', { 'aria-label': 'Slides' }, h('option', { value: '0' }, 'One image'), [2, 3, 4, 5, 6, 8, 10].map((k) => h('option', { value: String(k) }, `Carousel: ${k} slides`)));
    const blank = () => openDoc(newDoc({ size: sizeSel.value, slides: +slidesSel.value, name: `${sizeById(sizeSel.value)[1].split(' (')[0]} design` }), { isNew: true });
    return h(
      'div',
      {},
      h('h3', { class: 'ph-h3' }, 'New blank design'),
      sizeSel,
      slidesSel,
      button('Create', blank, { iconName: 'plus', variant: 'sm primary' }),
      h('h3', { class: 'ph-h3' }, `Your designs · ${all.length}`),
      h(
        'ul',
        { class: 'ph-designs' },
        all.map((d) =>
          h(
            'li',
            { class: d.id === cur.id ? 'on' : '' },
            h('button', { type: 'button', class: 'ph-design-open', onclick: () => d.id !== cur.id && openDoc(normalizeDoc(d)) }, h('strong', {}, d.name), h('span', { class: 'muted tiny' }, `${d.slides > 1 ? `${d.slides} slides · ` : ''}${d.w}×${d.h} · ${d.layers.length} layers`)),
            iconButton('copy', `Copy ${d.name}`, () => openDoc(normalizeDoc({ ...structuredClone(d), id: '', name: `${d.name} copy` }), { isNew: true }), 'ghost'),
            iconButton('trash', `Delete ${d.name}`, () => {
              if (!confirm(`Delete “${d.name}”? Its photos stay in the media library.`)) return;
              saved.docs = saved.docs.filter((x) => x.id !== d.id);
              if (d.id === cur.id) openDoc(saved.docs[0] || newDoc(), { isNew: !saved.docs.length });
              saveDesigns(saved);
              renderLeft();
            }, 'ghost'),
          ),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- top bar
  function renderBar() {
    const doc = store.get();
    const name = h('input', { type: 'text', class: 'ph-name', value: doc.name, 'aria-label': 'Design name', 'data-k': 'ph-name' });
    name.addEventListener('change', () => update((d) => (d.name = name.value.trim() || 'Untitled design')));
    const size = h('select', { 'aria-label': 'Canvas size', 'data-k': 'ph-size' }, SIZES.map(([id, l, w, hh]) => h('option', { value: id, selected: doc.size === id }, `${l}`)), h('option', { value: 'custom', selected: !SIZES.some((s) => s[0] === doc.size) }, `Custom ${doc.w}×${doc.h}`));
    size.addEventListener('change', () => {
      if (size.value === 'custom') return;
      const [, , w, hh] = sizeById(size.value);
      update((d) => {
        const k = d.slides > 1 ? d.slides : 1;
        const sx = (w * k) / d.w;
        const sy = hh / d.h;
        for (const L of d.layers) Object.assign(L, { x: Math.round(L.x * sx), y: Math.round(L.y * sy), w: Math.round(L.w * sx), h: Math.round(L.h * sy) });
        Object.assign(d, { size: size.value, w: w * k, h: hh });
      });
    });
    const slidesSel = h('select', { 'aria-label': 'Carousel slides', 'data-k': 'ph-slides' }, h('option', { value: '0', selected: doc.slides < 2 }, 'One image'), [2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => h('option', { value: String(k), selected: doc.slides === k }, `Carousel · ${k} slides`)));
    slidesSel.addEventListener('change', () => update((d) => {
      const old = d.slides > 1 ? d.slides : 1;
      const k = +slidesSel.value > 1 ? +slidesSel.value : 1;
      d.w = Math.round((d.w / old) * k);
      d.slides = k > 1 ? k : 0;
    }));
    bar.replaceChildren(
      name,
      size,
      slidesSel,
      iconButton('undo', 'Undo (Ctrl+Z)', () => store.undo(), 'ghost'),
      iconButton('redo', 'Redo (Ctrl+Shift+Z)', () => store.redo(), 'ghost'),
      iconButton('zoomOut', 'Zoom out', () => ((ui.zoom = (ui.zoom || scale) / 1.25), draw()), 'ghost'),
      button('Fit', () => ((ui.zoom = 0), draw()), { variant: 'sm ghost', title: 'Fit the design in the window' }),
      iconButton('zoomIn', 'Zoom in', () => ((ui.zoom = (ui.zoom || scale) * 1.25), draw()), 'ghost'),
      h('div', { class: 'spacer' }),
      h('span', { class: 'muted tiny' }, `${doc.w}×${doc.h}${doc.slides > 1 ? ` · ${doc.slides} slides of ${Math.round(doc.w / doc.slides)}×${doc.h}` : ''}`),
      button('Save to media', saveToLibrary, { iconName: 'image', variant: 'sm', title: 'Add the finished image(s) to the media library, the Photos page and the Video Studio' }),
      button('JPG', () => exportImages('image/jpeg'), { iconName: 'download', variant: 'sm' }),
      button(doc.slides > 1 ? `PNG · ${doc.slides} slides` : 'PNG', () => exportImages('image/png'), { iconName: 'download', variant: 'sm primary' }),
    );
  }

  // ---------------------------------------------------------------- export
  const missing = () => docMedia(store.get()).filter((id) => !getImage(id));
  async function images(type) {
    const doc = store.get();
    ensureMattes();
    const opt = { getImage, getMatte };
    const canv = doc.slides > 1 ? renderSlides(doc, opt) : [renderDoc(doc, opt)];
    const ext = type === 'image/jpeg' ? 'jpg' : 'png';
    const blobs = await Promise.all(canv.map((c) => canvasBlob(c, type, 0.92)));
    return blobs.map((b, i) => ({ blob: b, name: `${slug(doc.name)}${canv.length > 1 ? `-${i + 1}` : ''}.${ext}` }));
  }
  async function exportImages(type) {
    if (missing().length) toast('A photo in this design is no longer in the media library; it is left out.', 'error', 5000);
    const out = await images(type);
    for (const [i, f] of out.entries()) {
      if (i) await new Promise((r) => setTimeout(r, 350)); // browsers drop downloads fired together
      download(f.blob, f.name);
    }
    toast(out.length > 1 ? `Downloading ${out.length} slides. Post them in order and they line up.` : `Downloading ${out[0].name}`);
    lastExport.files = out;
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
          button('Centre', () => update(L_((x, _v, d) => {
            const sw = d.slides > 1 ? d.w / d.slides : d.w;
            const slide = Math.floor((x.x + x.w / 2) / sw);
            x.x = Math.round(slide * sw + (sw - x.w) / 2);
            x.y = Math.round((d.h - x.h) / 2);
          })), { variant: 'sm ghost', title: 'Centre it on its slide' }),
          L.type !== 'text' ? button('Fill the canvas', () => update(L_((x, _v, d) => Object.assign(x, { x: 0, y: 0, w: d.w, h: d.h, rot: 0 }))), { variant: 'sm ghost' }) : null,
        ),
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
          iconButton(L.locked ? 'key' : 'hand', L.locked ? `Unlock ${L.name}` : `Lock ${L.name}`, () => update((d) => {
            const x = d.layers.find((y) => y.id === L.id);
            if (x) x.locked = !x.locked;
          }), `ghost${L.locked ? ' on' : ''}`),
        );
        li.addEventListener('dragstart', (e) => ((dragId = L.id), e.dataTransfer.setData('text/plain', L.id)));
        li.addEventListener('dragover', (e) => e.preventDefault());
        li.addEventListener('drop', (e) => {
          e.preventDefault();
          const from = dragId || e.dataTransfer.getData('text/plain');
          if (!from || from === L.id) return;
          update((d) => {
            const a = d.layers.findIndex((x) => x.id === from);
            const [m] = d.layers.splice(a, 1);
            const b = d.layers.findIndex((x) => x.id === L.id);
            d.layers.splice(b + 1, 0, m); // dropped on a row: goes just in front of it
          });
        });
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
  document.fonts && document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', () => draw());

  const lastExport = { files: [] };
  return {
    store,
    show() {
      renderLeft();
      renderBar();
      renderRight();
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
    mediaChanged: () => (renderLeft(), renderRight(), draw()),
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
  };
}
