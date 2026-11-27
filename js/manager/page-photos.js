// Photos: the open artist's photo library, organised like a file browser. A folder tree on the left,
// Back / Up / a path above the grid, folders you open by clicking (they show what's inside), and
// two views: Browse (just the pictures) and Edit details (caption, photographer, tags, folder and
// the press kit / profile / logo buttons for each photo). Only one page of photos is drawn at a time.
import { h, icon, button, iconButton, toast, pickFiles, download } from '../dom.js';
import { askText } from '../asktext.js';
import { driveButton } from '../gdrive.js';
import { relinkNotice } from '../relink.js';
import { media, ensureLoaded } from '../media.js';

/** The full photo for the viewer: its small picture at once, the file once it is open. */
function fullImage(x, alt) {
  const img = h('img', { src: x.url || x.thumb, alt });
  ensureLoaded(x.id).then((r) => r && r.url && img.src !== r.url && (img.src = r.url)); // also marks it as used by this screen
  return img;
}
import { mixMatches } from '../ai/clipsearch.js';
import { smartSearchBar, visualScorer, looksBadge, smartOn } from '../ai/panel-photosearch.js';
import { addPhotos, filterPhotos, photoTags, toggleEpkPhoto, parseTags, EPK_PHOTO_MAX, newFolder, subfolders, folderPath, photosIn, deleteFolder, movePhotos, moveFolder, PAGE_SIZES, loadPageSize, savePageSize, paginate, tagPhotos, parseTagEdit, clickSelect } from './photos.js';

const MODE_KEY = 'pvm.photos.mode';
const loadMode = () => {
  try {
    return localStorage.getItem(MODE_KEY) === 'edit' ? 'edit' : 'browse';
  } catch {
    return 'browse';
  }
};
export const photosUI = { q: '', tag: '', starred: false, epkOnly: false, busy: false, open: null, folder: '', page: 1, size: 0, selected: new Set(), everywhere: false, mode: '', history: [], expanded: new Set(), details: false, anchor: null };

const IMAGE_ACCEPT = 'image/*,.jpg,.jpeg,.png,.webp,.gif,.heic';

/** Page controls: "41–80 of 230", previous / next, a page menu and the page size. */
export function pager(pg, { onPage, onSize, size, label = 'photos' }) {
  if (!pg.total) return null;
  const pageSel = h('select', { 'aria-label': 'Page' }, Array.from({ length: pg.pages }, (_, i) => h('option', { value: String(i + 1), selected: i + 1 === pg.page }, `Page ${i + 1} of ${pg.pages}`)));
  pageSel.addEventListener('change', () => onPage(+pageSel.value));
  const sizeSel = h('select', { 'aria-label': `${label} per page` }, PAGE_SIZES.map((n) => h('option', { value: String(n), selected: n === size }, `${n} per page`)));
  sizeSel.addEventListener('change', () => onSize(+sizeSel.value));
  return h(
    'div',
    { class: 'mgr-pager' },
    h('span', { class: 'muted small' }, `${pg.from}–${pg.to} of ${pg.total} ${label}`),
    pg.pages > 1 ? iconButton('arrowLeft', 'Previous page', () => onPage(pg.page - 1), pg.page > 1 ? 'ghost' : 'ghost disabled') : null,
    pg.pages > 1 ? pageSel : null,
    pg.pages > 1 ? iconButton('arrowRight', 'Next page', () => onPage(pg.page + 1), pg.page < pg.pages ? 'ghost' : 'ghost disabled') : null,
    sizeSel,
  );
}

export function buildPhotos(ctx) {
  const m = ctx.store.get();
  const st = ctx.studio;
  const ui = photosUI;
  const f = ctx.form;
  const band = m.band;
  const epk = band.epkPhotos || [];
  const folders = m.photoFolders || [];
  if (!ui.size) ui.size = loadPageSize();
  if (!ui.mode) ui.mode = loadMode();
  if (ui.folder && !folders.some((x) => x.id === ui.folder)) ui.folder = '';
  const info = (id) => st.mediaInfo(id);
  const P = (id, fn) => (d, v) => {
    const p = d.photos.find((x) => x.id === id);
    if (p) fn(p, v, d);
  };
  const rerender = () => ctx.go('photos');
  const folderName = (id) => (folders.find((x) => x.id === id) || {}).name || '';
  const pathOf = (id) => folderPath(folders, id);
  const top = () => document.querySelector('.mgr-main')?.scrollTo?.({ top: 0 });

  // ---- moving around: open a folder, go back, go up
  const openFolder = (id, { remember = true } = {}) => {
    if (remember && id !== ui.folder) ui.history.push(ui.folder);
    if (ui.history.length > 50) ui.history.shift();
    for (const fo of pathOf(id)) ui.expanded.add(fo.parent || '');
    if (id) ui.expanded.add(id);
    Object.assign(ui, { folder: id, page: 1, everywhere: false, q: '', tag: '', starred: false, epkOnly: false });
    ui.selected.clear();
    rerender();
    top();
  };
  const back = () => ui.history.length && openFolder(ui.history.pop(), { remember: false });
  const up = () => ui.folder && openFolder((folders.find((x) => x.id === ui.folder) || {}).parent || '');
  const setMode = (mode) => {
    ui.mode = mode;
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* this visit only */
    }
    rerender();
  };

  const upload = async (files) => {
    const picked = files || (await pickFiles(IMAGE_ACCEPT, true));
    if (!picked.length) return;
    ui.busy = true;
    rerender();
    try {
      const { added, skipped } = await st.uploadMedia(picked, ['image']);
      let n = 0;
      if (added.length) ctx.update((d) => (n = addPhotos(d, added, Date.now(), ui.folder)));
      if (skipped.length) toast(`Skipped ${skipped.length === 1 ? skipped[0] : `${skipped.length} files`}: not a photo.`, 'error', 5000);
      else if (n) toast(`Added ${n} photo${n === 1 ? '' : 's'}${ui.folder ? ` to ${folderName(ui.folder)}` : ''}`);
    } finally {
      ui.busy = false;
      ui.page = 1;
      rerender();
    }
  };
  const library = st.libraryFiles(['image']).filter((x) => !m.photos.some((p) => p.mediaId === x.id));
  const libSel = library.length
    ? (() => {
        const sel = h('select', { 'aria-label': 'Add a photo from the media library' }, h('option', { value: '' }, `Add from the media library (${library.length})`), library.slice(0, 500).map((x) => h('option', { value: x.id }, x.name)));
        sel.addEventListener('change', () => {
          const x = library.find((y) => y.id === sel.value);
          if (x) ctx.update((d) => addPhotos(d, [x], Date.now(), ui.folder));
        });
        return sel;
      })()
    : null;

  // a search or a filter looks in every folder; otherwise you see the open folder
  const filtering = !!(ui.q || ui.tag || ui.starred || ui.epkOnly || ui.everywhere);
  const pool = filtering ? m.photos : photosIn(m.photos, folders, ui.folder);
  const narrow = { tag: ui.tag, starred: ui.starred, epk: ui.epkOnly ? epk : null, nameOf: (id) => info(id)?.name || '' };
  const byWords = filterPhotos(pool, { ...narrow, q: ui.q });
  // smart search: photos whose picture matches the words come after the word matches (same scope and filters)
  const scorer = visualScorer(ui.q);
  const mixed = scorer ? mixMatches(byWords, filterPhotos(pool, narrow), (p) => scorer(media.peek(p.mediaId))) : null;
  const shown = mixed ? mixed.items.map((x) => x.photo) : byWords;
  const looks = new Map(mixed ? mixed.items.filter((x) => x.visual).map((x) => [x.photo.id, x.visual]) : []);
  const pg = paginate(shown, ui.page, ui.size);
  ui.page = pg.page;
  const tags = photoTags(m.photos);
  const search = h('input', { type: 'search', placeholder: smartOn() ? 'Search captions, tags, photographers or what’s in the picture (every folder)' : 'Search captions, tags, photographers (every folder)', value: ui.q, 'aria-label': 'Search photos', 'data-k': 'photos-q' });
  let timer = null;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => ((ui.q = search.value.trim()), (ui.page = 1), rerender()), 200);
  });
  const chip = (label, on, fn) => button(label, () => (fn(), (ui.page = 1), rerender()), { variant: `chip${on ? ' on' : ''}` });

  // ---- folders
  const newOne = async () => {
    const name = await askText(ui.folder ? `New folder inside “${folderName(ui.folder)}”` : 'New folder', '', { okText: 'Make it' });
    if (!name || !name.trim()) return;
    const fo = newFolder(name, ui.folder);
    ctx.update((d) => (d.photoFolders ||= []).push(fo));
    if (ui.folder) ui.expanded.add(ui.folder);
    toast(`Made “${fo.name}”. Open it to add photos, or drag photos onto it.`);
  };
  const rename = async (fo) => {
    const name = await askText('Rename the folder', fo.name, { max: 60 });
    if (name && name.trim()) ctx.update((d) => (d.photoFolders.find((x) => x.id === fo.id).name = name.trim().slice(0, 60)));
  };
  const remove = (fo) => {
    const n = photosIn(m.photos, folders, fo.id, { deep: true }).length;
    if (!confirm(`Delete the folder “${fo.name}”? ${n ? `Its ${n} photo${n === 1 ? '' : 's'} and folders move up to ${fo.parent ? `“${folderName(fo.parent)}”` : 'All photos'}; nothing is deleted.` : 'It is empty.'}`)) return;
    if (ui.folder === fo.id) ui.folder = fo.parent || '';
    ctx.update((d) => deleteFolder(d, fo.id));
  };
  /** Drop photos (or a folder) on a folder. */
  const dropOn = (target) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('over');
    const raw = e.dataTransfer.getData('text/x-pvm-photos');
    const fold = e.dataTransfer.getData('text/x-pvm-folder');
    if (fold) {
      if (fold === target) return;
      let ok = true;
      ctx.update((d) => (ok = moveFolder(d, fold, target)));
      if (!ok) toast('A folder can’t go inside itself.', 'error');
      return;
    }
    if (!raw) return;
    let n = 0;
    ctx.update((d) => (n = movePhotos(d, raw.split(','), target)));
    ui.selected.clear();
    if (n) toast(`Moved ${n} photo${n === 1 ? '' : 's'} to ${target ? `“${folderName(target)}”` : 'All photos'}`);
  };
  const dropTarget = (el, target) => {
    el.addEventListener('dragover', (e) => (e.preventDefault(), el.classList.add('over')));
    el.addEventListener('dragleave', () => el.classList.remove('over'));
    el.addEventListener('drop', dropOn(target));
    return el;
  };
  const count = (id) => photosIn(m.photos, folders, id, { deep: true }).length;
  /** Tag every photo in a folder (and, if you say so, in the folders inside it). */
  const tagFolder = (fo) => {
    const own = photosIn(m.photos, folders, fo.id);
    const deep = photosIn(m.photos, folders, fo.id, { deep: true });
    const inside = deep.length > own.length && confirm(`“${fo.name}” has ${deep.length - own.length} more photo${deep.length - own.length === 1 ? '' : 's'} in its folders. Tag those too?\n\nOK: all ${deep.length}. Cancel: just the ${own.length} directly in “${fo.name}”.`);
    tagMany((inside ? deep : own).map((p) => p.id), `in “${fo.name}”${inside ? ' and its folders' : ''}`);
  };

  // ---- the folder tree
  const treeItem = (fo, depth) => {
    const kids = subfolders(folders, fo.id);
    const open = ui.expanded.has(fo.id);
    const row = h(
      'div',
      { class: `mgr-ftree-row${ui.folder === fo.id ? ' on' : ''}`, style: { paddingLeft: `${4 + depth * 14}px` }, draggable: 'true' },
      kids.length ? h('button', { type: 'button', class: `mgr-ftree-caret${open ? ' open' : ''}`, 'aria-label': open ? `Collapse ${fo.name}` : `Expand ${fo.name}`, 'aria-expanded': open ? 'true' : 'false', onclick: () => (open ? ui.expanded.delete(fo.id) : ui.expanded.add(fo.id), rerender()) }, icon('chevron', 12)) : h('span', { class: 'mgr-ftree-caret none' }),
      h('button', { type: 'button', class: 'mgr-ftree-name', onclick: () => openFolder(fo.id), 'aria-current': ui.folder === fo.id ? 'true' : null }, h('span', { class: 'mgr-ficon', 'aria-hidden': 'true' }), h('span', { class: 'mgr-ftree-label' }, fo.name), h('span', { class: 'muted tiny' }, String(count(fo.id)))),
    );
    row.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/x-pvm-folder', fo.id));
    dropTarget(row, fo.id);
    return [row, ...(open ? kids.flatMap((k) => treeItem(k, depth + 1)) : [])];
  };
  const tree = h(
    'nav',
    { class: 'mgr-ftree', 'aria-label': 'Folders' },
    dropTarget(h('div', { class: `mgr-ftree-row root${!ui.folder && !filtering ? ' on' : ''}` }, h('button', { type: 'button', class: 'mgr-ftree-name', onclick: () => openFolder('') }, icon('home', 14), h('span', { class: 'mgr-ftree-label' }, 'All photos'), h('span', { class: 'muted tiny' }, String(m.photos.length)))), ''),
    ...subfolders(folders, '').flatMap((fo) => treeItem(fo, 0)),
    button('New folder', newOne, { iconName: 'plus', variant: 'sm ghost' }),
  );

  // ---- the path bar: back, up, where you are
  const cur = folders.find((x) => x.id === ui.folder) || null;
  const crumbs = h(
    'div',
    { class: 'mgr-pathbar' },
    iconButton('arrowLeft', 'Back', back, ui.history.length ? 'ghost' : 'ghost disabled'),
    iconButton('arrowUp', 'Up one folder', up, ui.folder ? 'ghost' : 'ghost disabled'),
    h(
      'nav',
      { class: 'mgr-crumbs', 'aria-label': 'Folder path' },
      dropTarget(h('button', { type: 'button', class: `link${ui.folder ? '' : ' on'}`, onclick: () => openFolder('') }, icon('home', 13), 'All photos'), ''),
      ...pathOf(ui.folder).flatMap((fo) => [h('span', { class: 'muted' }, '›'), dropTarget(h('button', { type: 'button', class: `link${fo.id === ui.folder ? ' on' : ''}`, onclick: () => openFolder(fo.id) }, fo.name), fo.id)]),
    ),
    cur ? h('div', { class: 'row' }, button('Tag all…', () => tagFolder(cur), { iconName: 'type', variant: 'sm', title: 'Add a tag to every photo in this folder' }), button('Rename', () => rename(cur), { iconName: 'type', variant: 'sm ghost' }), button('Delete folder', () => remove(cur), { iconName: 'trash', variant: 'sm ghost' })) : null,
  );

  // ---- folders inside this one, as folders you open
  const tiles = filtering
    ? []
    : subfolders(folders, ui.folder).map((fo) => {
        const inside = photosIn(m.photos, folders, fo.id, { deep: true });
        const peeks = inside.map((p) => info(p.mediaId)).filter(Boolean).slice(0, 3);
        const nSub = subfolders(folders, fo.id).length;
        const el = h(
          'div',
          { class: 'mgr-folder', draggable: 'true' },
          h(
            'button',
            { type: 'button', class: 'mgr-folder-open', onclick: () => openFolder(fo.id), 'aria-label': `Open ${fo.name}: ${inside.length} photos${nSub ? `, ${nSub} folders` : ''}` },
            h('span', { class: 'mgr-folder-art' }, h('span', { class: 'mgr-folder-back' }), h('span', { class: 'mgr-folder-peeks' }, peeks.map((x) => h('img', { src: x.thumb || x.url, alt: '', loading: 'lazy' }))), h('span', { class: 'mgr-folder-front' })),
            h('strong', {}, fo.name),
            h('span', { class: 'muted tiny' }, `${inside.length} photo${inside.length === 1 ? '' : 's'}${nSub ? ` · ${nSub} folder${nSub === 1 ? '' : 's'}` : ''}`),
          ),
          h('div', { class: 'mgr-folder-acts' }, button('#', () => tagFolder(fo), { variant: 'sm ghost', title: `Tag every photo in ${fo.name}` }), iconButton('type', `Rename ${fo.name}`, () => rename(fo), 'ghost'), iconButton('trash', `Delete the folder ${fo.name}`, () => remove(fo), 'ghost')),
        );
        el.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/x-pvm-folder', fo.id));
        return dropTarget(el, fo.id);
      });

  // ---- selection and moving
  const sel = ui.selected;
  for (const id of [...sel]) if (!m.photos.some((p) => p.id === id)) sel.delete(id);
  const folderOptions = () => folders.map((fo) => [fo.id, pathOf(fo.id).map((x) => x.name).join(' › ')]).sort((a, b) => a[1].localeCompare(b[1]));
  const moveSel = h('select', { 'aria-label': 'Move the ticked photos to' }, h('option', { value: '' }, 'Move to…'), h('option', { value: '__top' }, 'All photos (no folder)'), ...folderOptions().map(([id, label]) => h('option', { value: id }, label)));
  moveSel.addEventListener('change', () => {
    if (!moveSel.value) return;
    const to = moveSel.value === '__top' ? '' : moveSel.value;
    let n = 0;
    ctx.update((d) => (n = movePhotos(d, [...sel], to)));
    sel.clear();
    toast(`Moved ${n} photo${n === 1 ? '' : 's'} to ${to ? `“${folderName(to)}”` : 'All photos'}`);
  });
  const redraw = () => (ctx.refresh ? ctx.refresh() : rerender()); // keeps your place on the page
  const order = shown.map((p) => p.id);
  /** Tick a photo: Shift ticks the run from the last one, Ctrl or Cmd toggles one. */
  const select = (id, e) => {
    const out = clickSelect(sel, order, id, { shift: e.shiftKey, anchor: ui.anchor });
    sel.clear();
    out.selected.forEach((x) => sel.add(x));
    ui.anchor = out.anchor;
    redraw();
  };
  /** Ask for tags to add (and "-tag" to take off), then put them on `ids`. */
  const tagMany = async (ids, where) => {
    if (!ids.length) return toast('No photos there to tag.', 'error');
    const text = await askText(`Tags for ${ids.length} photo${ids.length === 1 ? '' : 's'}${where ? ` ${where}` : ''}`, '', { hint: 'Separate with commas. Put a minus in front to take a tag off (e.g. live, 2026, -old).', okText: 'Tag', max: 1000 });
    if (!text || !text.trim()) return;
    const { add, remove } = parseTagEdit(text);
    let n = 0;
    ctx.update((d) => (n = tagPhotos(d, ids, add, remove)));
    toast(n ? `${[add.length && `Added ${add.map((t) => `#${t}`).join(' ')}`, remove.length && `took off ${remove.map((t) => `#${t}`).join(' ')}`].filter(Boolean).join(', ')} on ${n} photo${n === 1 ? '' : 's'}` : 'Those photos already had those tags.');
  };
  const selBar = sel.size
    ? h(
        'div',
        { class: 'mgr-selbar' },
        h('strong', {}, `${sel.size} ticked`),
        moveSel,
        button('Tag…', () => tagMany([...sel], 'ticked'), { iconName: 'type', variant: 'sm', title: 'Add or take off tags on every ticked photo' }),
        button(`Tick all ${shown.length}`, () => (shown.forEach((p) => sel.add(p.id)), redraw()), { variant: 'sm ghost', title: filtering ? 'Every match, on every page' : 'Every photo here, on every page' }),
        button('Clear', () => (sel.clear(), (ui.anchor = null), redraw()), { variant: 'sm ghost' }),
        h('span', { class: 'muted tiny' }, 'Shift-click ticks a run · Ctrl/⌘-click adds one'),
      )
    : null;

  // ---- one photo: the picture with its star, tick and badges (both views)
  const removeOne = (p) => ctx.update((d) => {
    d.photos = d.photos.filter((y) => y.id !== p.id);
    d.band.epkPhotos = (d.band.epkPhotos || []).filter((id) => id !== p.mediaId);
    if (d.band.photoId === p.mediaId) d.band.photoId = null;
  });
  const actions = (p, x) => {
    const inKit = epk.includes(p.mediaId);
    const isLogo = band.logoId === p.mediaId;
    const isProfile = band.photoId === p.mediaId;
    return h(
      'div',
      { class: 'row mgr-ph-actions' },
      button(inKit ? 'In press kit' : 'Press kit', () => {
        let ok = true;
        ctx.update((d) => (ok = toggleEpkPhoto(d.band, p.mediaId)));
        if (!ok) toast(`The press kit holds ${EPK_PHOTO_MAX} photos. Take one out first.`, 'error');
      }, { iconName: inKit ? 'check' : 'clipboard', variant: `sm${inKit ? ' primary' : ''}`, title: `Use in the downloadable press kit (up to ${EPK_PHOTO_MAX})` }),
      button('Video', () => st.useInEditor(p.mediaId, 'clip', { open: false }), { iconName: 'film', variant: 'sm', title: 'Add to the end of the video track in the Video Studio' }),
      button(isProfile ? 'Profile ✓' : 'Profile', () => ctx.update((d) => (d.band.photoId = isProfile ? null : p.mediaId)), { variant: `sm${isProfile ? ' primary' : ' ghost'}`, title: isProfile ? 'This is the profile photo. Click to clear it.' : 'Use as this artist’s profile photo' }),
      button(isLogo ? 'Logo ✓' : 'Logo', () => ctx.update((d) => (d.band.logoId = isLogo ? null : p.mediaId)), { variant: `sm${isLogo ? ' primary' : ' ghost'}`, title: isLogo ? 'This is the logo on promos. Click to clear it.' : 'Use as this artist’s logo on promos' }),
      iconButton('download', `Download ${x.name}`, async () => {
        const b = await media.blob(x.id); // read from storage: the photo may not be open
        if (b) download(b, x.name);
        else toast('That photo’s file is missing.', 'error');
      }, 'ghost'),
      iconButton('trash', `Remove ${x.name} from this page`, () => removeOne(p), 'ghost'),
    );
  };
  const picture = (p, x) => {
    const inKit = epk.includes(p.mediaId);
    const isLogo = band.logoId === p.mediaId;
    const isProfile = band.photoId === p.mediaId;
    const tick = h('input', { type: 'checkbox', checked: sel.has(p.id), 'aria-label': `Tick ${p.caption || x.name}` });
    // the tick handles its own click (so Shift and Ctrl/Cmd work on it too)
    tick.addEventListener('click', (e) => (e.preventDefault(), select(p.id, e)));
    return h(
      'div',
      { class: 'mgr-ph-img' },
      h('button', {
        type: 'button',
        class: 'mgr-ph-open',
        // Shift, Ctrl or Cmd click ticks instead of opening; so does a plain click while photos are ticked
        onclick: (e) => (e.shiftKey || e.metaKey || e.ctrlKey || sel.size ? select(p.id, e) : ((ui.open = p.id), rerender())),
        'aria-label': `View ${p.caption || x.name}`,
        title: sel.size ? 'Click to tick or untick (Shift for a run)' : 'Open. Shift or Ctrl/⌘-click to tick',
      }, h('img', { src: x.thumb || x.url, alt: p.caption || '', loading: 'lazy', decoding: 'async' })),
      h('label', { class: 'mgr-ph-tick' }, tick),
      h('button', { type: 'button', class: `mgr-ph-star${p.favorite ? ' on' : ''}`, 'aria-pressed': p.favorite ? 'true' : 'false', 'aria-label': p.favorite ? 'Unstar' : 'Star', onclick: () => ctx.update(P(p.id, (y) => (y.favorite = !y.favorite))) }, p.favorite ? '★' : '☆'),
      inKit || isLogo || isProfile ? h('span', { class: 'mgr-ph-badges' }, isProfile ? h('span', {}, 'Profile') : null, inKit ? h('span', {}, 'Press kit') : null, isLogo ? h('span', {}, 'Logo') : null) : null,
      looks.has(p.id) ? looksBadge(looks.get(p.id), ui.q) : null,
    );
  };
  const draggable = (el, p) => {
    el.setAttribute('draggable', 'true');
    // dragging a ticked photo moves every ticked photo
    el.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/x-pvm-photos', (sel.has(p.id) ? [...sel] : [p.id]).join(',')));
    return el;
  };
  const missing = (p) => h('div', { class: 'mgr-ph missing' }, h('p', { class: 'muted small' }, `${st.fileName && st.fileName(p.mediaId) ? `“${st.fileName(p.mediaId)}” is` : 'This photo is'} not in the media library. Use Replace missing files above to give it back.`), button('Remove', () => removeOne(p), { variant: 'sm ghost' }));
  const where = (p) => (filtering && p.folder ? h('button', { type: 'button', class: 'link tiny mgr-ph-folder', onclick: () => openFolder(p.folder) }, h('span', { class: 'mgr-ficon small', 'aria-hidden': 'true' }), ` ${pathOf(p.folder).map((fo) => fo.name).join(' › ')}`) : null);

  /** Browse: the picture and one quiet line under it. */
  const tile = (p) => {
    const x = info(p.mediaId);
    if (!x) return missing(p);
    const line = [p.caption, p.credit && `📷 ${p.credit}`].filter(Boolean).join(' · ');
    return draggable(h('div', { class: `mgr-ph browse${sel.has(p.id) ? ' ticked' : ''}` }, picture(p, x), h('div', { class: 'mgr-ph-cap' }, line ? h('span', {}, line) : h('span', { class: 'muted' }, x.name), p.tags.length ? h('span', { class: 'muted tiny' }, p.tags.map((t) => `#${t}`).join(' ')) : null), where(p)), p);
  };
  /** Edit details: the picture beside every field and button for it. */
  const editRow = (p) => {
    const x = info(p.mediaId);
    if (!x) return missing(p);
    const tagsIn = h('input', { type: 'text', value: p.tags.join(', '), placeholder: 'Tags: live, press, 2026…', 'data-k': `ph-tags-${p.id}`, 'aria-label': 'Tags' });
    tagsIn.addEventListener('change', () => ctx.update(P(p.id, (y) => (y.tags = parseTags(tagsIn.value)))));
    const fsel = h('select', { 'aria-label': 'Folder', 'data-k': `ph-fold-${p.id}` }, h('option', { value: '' }, 'All photos (no folder)'), folderOptions().map(([id, label]) => h('option', { value: id, selected: p.folder === id }, label)));
    fsel.addEventListener('change', () => ctx.update(P(p.id, (y) => (y.folder = fsel.value))));
    return draggable(
      h(
        'div',
        { class: `mgr-ph edit${sel.has(p.id) ? ' ticked' : ''}${epk.includes(p.mediaId) ? ' in-kit' : ''}` },
        picture(p, x),
        h(
          'div',
          { class: 'mgr-ph-fields' },
          h('div', { class: 'mgr-ph-name' }, h('strong', { class: 'small' }, x.name), x.width ? h('span', { class: 'muted tiny' }, `${x.width} × ${x.height}`) : null, where(p)),
          h('div', { class: 'mgr-two' }, h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Caption'), f.text(`ph-cap-${p.id}`, '', p.caption, P(p.id, (y, v) => (y.caption = v)), { placeholder: 'Live at El Corazon' })), h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Photographer'), f.text(`ph-cred-${p.id}`, '', p.credit, P(p.id, (y, v) => (y.credit = v)), { placeholder: 'Who took it (credited in the press kit)' }))),
          h('div', { class: 'mgr-two' }, h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Tags'), tagsIn), h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Folder'), fsel)),
          actions(p, x),
        ),
      ),
      p,
    );
  };

  // ---- the viewer: big photo with its details beside it (editable)
  let viewer = null;
  if (ui.open) {
    const list = shown.length ? shown : m.photos;
    const i = list.findIndex((p) => p.id === ui.open);
    const p = list[i];
    const x = p && info(p.mediaId);
    if (x) {
      const close = () => ((ui.open = null), document.removeEventListener('keydown', onKey), rerender());
      const go = (k) => {
        const next = (i + k + list.length) % list.length;
        ui.open = list[next].id;
        ui.page = Math.floor(next / ui.size) + 1;
        document.removeEventListener('keydown', onKey);
        rerender();
      };
      const onKey = (e) => {
        if (/INPUT|TEXTAREA|SELECT/.test((e.target.tagName || '').toUpperCase())) return;
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowRight') go(1);
        else if (e.key === 'ArrowLeft') go(-1);
      };
      document.addEventListener('keydown', onKey);
      const tagsIn = h('input', { type: 'text', value: p.tags.join(', '), placeholder: 'Tags', 'data-k': `lb-tags-${p.id}`, 'aria-label': 'Tags' });
      tagsIn.addEventListener('change', () => ctx.update(P(p.id, (y) => (y.tags = parseTags(tagsIn.value)))));
      const panel = ui.details
        ? h(
            'aside',
            { class: 'mgr-lightbox-details', 'aria-label': 'Photo details' },
            h('strong', {}, x.name),
            x.width ? h('span', { class: 'muted tiny' }, `${x.width} × ${x.height}${p.folder ? ` · in ${pathOf(p.folder).map((fo) => fo.name).join(' › ')}` : ''}`) : null,
            h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Caption'), f.text(`lb-cap-${p.id}`, '', p.caption, P(p.id, (y, v) => (y.caption = v)))),
            h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Photographer'), f.text(`lb-cred-${p.id}`, '', p.credit, P(p.id, (y, v) => (y.credit = v)))),
            h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Tags'), tagsIn),
            actions(p, x),
          )
        : null;
      viewer = h(
        'div',
        { class: `mgr-lightbox${ui.details ? ' with-details' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': p.caption || x.name, onclick: (e) => e.target === e.currentTarget && close() },
        fullImage(x, p.caption || ''),
        panel,
        h('div', { class: 'mgr-lightbox-bar' }, h('span', {}, [p.caption, p.credit && `Photo: ${p.credit}`].filter(Boolean).join(' · ') || x.name), h('span', { class: 'muted small' }, `${i + 1} of ${list.length}`), button(ui.details ? 'Hide details' : 'Details', () => ((ui.details = !ui.details), rerender()), { iconName: 'type', variant: 'sm' })),
        list.length > 1 ? iconButton('arrowLeft', 'Previous photo', () => go(-1), 'mgr-lightbox-prev') : null,
        list.length > 1 ? iconButton('arrowRight', 'Next photo', () => go(1), 'mgr-lightbox-next') : null,
        iconButton('x', 'Close', close, 'mgr-lightbox-close'),
      );
    } else ui.open = null;
  }

  const drop = h('div', { class: 'dropzone small-drop', tabindex: '0', role: 'button', 'aria-label': 'Add photos' }, icon('upload', 20), h('strong', {}, ui.busy ? 'Adding photos…' : `Drop photos here or click to pick${ui.folder ? ` (they go in “${folderName(ui.folder)}”)` : ''}`));
  drop.addEventListener('click', () => !ui.busy && upload());
  drop.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), upload()));
  drop.addEventListener('dragover', (e) => (e.preventDefault(), e.stopPropagation(), drop.classList.add('over')));
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    drop.classList.remove('over');
    if (e.dataTransfer.files && e.dataTransfer.files.length) upload([...e.dataTransfer.files]);
  });

  const pageCtl = () => pager(pg, { size: ui.size, onPage: (n) => ((ui.page = n), rerender(), top()), onSize: (n) => (savePageSize(n), (ui.size = n), (ui.page = 1), rerender()) });
  const modeSwitch = h('div', { class: 'mgr-seg', role: 'radiogroup', 'aria-label': 'View' }, ...[['browse', 'Browse', 'image'], ['edit', 'Edit details', 'type']].map(([k, l, ic]) => h('button', { type: 'button', role: 'radio', 'aria-checked': ui.mode === k ? 'true' : 'false', class: ui.mode === k ? 'on' : '', onclick: () => setMode(k) }, icon(ic, 14), h('span', {}, l))));
  const here = cur ? cur.name : 'All photos';
  const empty = filtering ? 'No photos match.' : tiles.length ? (cur ? 'No photos directly in this folder: open a folder above.' : 'No loose photos: they’re all in folders.') : cur ? 'This folder is empty. Upload photos while it’s open, or drag photos onto it in the folder list.' : 'No photos yet.';
  const content = h(
    'section',
    { class: 'mgr-sect mgr-photos-main' },
    crumbs,
    h('div', { class: 'mgr-photos-tools' }, search, modeSwitch),
    smartSearchBar({ records: () => m.photos.map((p) => media.peek(p.mediaId)).filter((r) => r && r.kind === 'image'), query: () => ui.q, refresh: redraw }),
    h(
      'div',
      { class: 'chips' },
      chip(`Every folder ${m.photos.length}`, ui.everywhere && !ui.starred && !ui.epkOnly && !ui.tag && !ui.q, () => Object.assign(ui, { everywhere: !ui.everywhere, starred: false, epkOnly: false, tag: '' })),
      chip(`★ Starred ${m.photos.filter((p) => p.favorite).length}`, ui.starred, () => (ui.starred = !ui.starred)),
      chip(`Press kit ${epk.length}/${EPK_PHOTO_MAX}`, ui.epkOnly, () => (ui.epkOnly = !ui.epkOnly)),
      ...tags.map(({ tag, n }) => chip(`#${tag} ${n}`, ui.tag === tag, () => (ui.tag = ui.tag === tag ? '' : tag))),
      filtering ? button('Clear', () => Object.assign(ui, { q: '', tag: '', starred: false, epkOnly: false, everywhere: false }), { variant: 'chip' }) : null,
    ),
    filtering ? h('p', { class: 'muted tiny' }, 'Showing matches from every folder; each photo says where it is.') : null,
    mixed ? h('p', { class: 'muted tiny', 'data-k': 'photos-mix', 'data-text': String(mixed.nText), 'data-visual': String(mixed.nVisual) }, `${mixed.nText} by caption, tag or name first, then ${mixed.nVisual} that look like “${ui.q}” (best first, marked “looks like”).${mixed.nVisual ? '' : ' No picture stands out for those words.'}`) : null,
    tiles.length ? h('h3', { class: 'mgr-h3' }, `Folders · ${tiles.length}`) : null,
    tiles.length ? h('div', { class: 'mgr-folders' }, tiles) : null,
    selBar,
    shown.length ? h('h3', { class: 'mgr-h3' }, filtering ? `Photos · ${shown.length}` : cur ? `Photos in ${here} · ${shown.length}` : `Photos not in a folder · ${shown.length}`) : null,
    pageCtl(),
    shown.length ? h('div', { class: ui.mode === 'edit' ? 'mgr-photos-edit' : 'mgr-photos-grid' }, pg.items.map(ui.mode === 'edit' ? editRow : tile)) : h('p', { class: 'muted small' }, empty),
    pg.pages > 1 ? pageCtl() : null,
    !sel.size && shown.length ? h('p', { class: 'muted tiny' }, 'Tick photos to move several at once, or drag a photo onto a folder in the list.') : null,
  );

  return h(
    'div',
    { class: 'mgr-page wide' },
    h('header', { class: 'mgr-head' }, h('div', {}, h('h1', {}, 'Photos'), h('p', { class: 'muted' }, `${band.name || 'This artist'} · ${m.photos.length} photo${m.photos.length === 1 ? '' : 's'} · ${folders.length} folder${folders.length === 1 ? '' : 's'}${epk.length ? ` · ${epk.length} in the press kit` : ''}`)), h('div', { class: 'row' }, button('New folder', newOne, { iconName: 'plus', variant: 'ghost' }), driveButton(IMAGE_ACCEPT, true, (fs) => upload(fs), { variant: 'ghost' }), button(ui.busy ? 'Adding…' : 'Upload photos', () => upload(), { iconName: 'upload', variant: 'primary', disabled: ui.busy }))),
    relinkNotice('manager', () => [m.photos]),
    h('div', { class: 'mgr-photos-top' }, drop, libSel),
    m.photos.length || folders.length ? h('div', { class: 'mgr-photos-layout' }, tree, content) : h('p', { class: 'muted small' }, 'No photos yet. Press shots, live photos and behind-the-scenes go here; pick the best four for the press kit.'),
    viewer,
  );
}
