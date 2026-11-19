// Photos: the open artist's photo library, in folders. Upload in bulk, caption, credit and tag each
// photo, star favorites, pick up to four for the press kit, set the logo, and send photos to the
// Video Studio. Only one page of photos is drawn at a time, so a big library stays quick.
import { h, icon, button, iconButton, toast, pickFiles, download } from '../dom.js';
import { driveButton } from '../gdrive.js';
import { addPhotos, filterPhotos, photoTags, toggleEpkPhoto, parseTags, EPK_PHOTO_MAX, newFolder, subfolders, folderPath, photosIn, deleteFolder, movePhotos, moveFolder, PAGE_SIZES, loadPageSize, savePageSize, paginate } from './photos.js';

export const photosUI = { q: '', tag: '', starred: false, epkOnly: false, busy: false, open: null, folder: '', page: 1, size: 0, selected: new Set(), everywhere: false };

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
  if (ui.folder && !folders.some((x) => x.id === ui.folder)) ui.folder = '';
  const info = (id) => st.mediaInfo(id);
  const P = (id, fn) => (d, v) => {
    const p = d.photos.find((x) => x.id === id);
    if (p) fn(p, v, d);
  };
  const rerender = () => ctx.go('photos');
  const openFolder = (id) => {
    Object.assign(ui, { folder: id, page: 1, everywhere: false });
    ui.selected.clear();
    rerender();
  };
  const folderName = (id) => (folders.find((x) => x.id === id) || {}).name || '';

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
        const sel = h('select', { 'aria-label': 'Add a photo from the media library' }, h('option', { value: '' }, `Or add from the media library (${library.length})`), library.slice(0, 500).map((x) => h('option', { value: x.id }, x.name)));
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
  const shown = filterPhotos(pool, { q: ui.q, tag: ui.tag, starred: ui.starred, epk: ui.epkOnly ? epk : null, nameOf: (id) => info(id)?.name || '' });
  const pg = paginate(shown, ui.page, ui.size);
  ui.page = pg.page;
  const tags = photoTags(m.photos);
  const search = h('input', { type: 'search', placeholder: 'Search captions, tags, photographers (all folders)', value: ui.q, 'aria-label': 'Search photos', 'data-k': 'photos-q' });
  let timer = null;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => ((ui.q = search.value.trim()), (ui.page = 1), rerender()), 200);
  });
  const chip = (label, on, fn) => button(label, () => (fn(), (ui.page = 1), rerender()), { variant: `chip${on ? ' on' : ''}` });

  // ---- folders
  const newOne = () => {
    const name = prompt(ui.folder ? `New folder inside “${folderName(ui.folder)}”` : 'New folder', '');
    if (!name || !name.trim()) return;
    const fo = newFolder(name, ui.folder);
    ctx.update((d) => (d.photoFolders ||= []).push(fo));
    toast(`Made “${fo.name}”. Drag photos onto it, or tick photos and use Move to.`);
  };
  const rename = (fo) => {
    const name = prompt('Rename the folder', fo.name);
    if (name && name.trim()) ctx.update((d) => (d.photoFolders.find((x) => x.id === fo.id).name = name.trim().slice(0, 60)));
  };
  const remove = (fo) => {
    const n = photosIn(m.photos, folders, fo.id, { deep: true }).length;
    if (!confirm(`Delete the folder “${fo.name}”? ${n ? `Its ${n} photo${n === 1 ? '' : 's'} and folders move up to ${fo.parent ? `“${folderName(fo.parent)}”` : 'the top'}; nothing is deleted.` : 'It is empty.'}`)) return;
    ctx.update((d) => deleteFolder(d, fo.id));
  };
  /** Drop photos (or a folder) on a folder. */
  const dropOn = (target) => (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('over');
    const raw = e.dataTransfer.getData('text/x-pvm-photos');
    const fold = e.dataTransfer.getData('text/x-pvm-folder');
    if (fold) {
      let ok = true;
      ctx.update((d) => (ok = moveFolder(d, fold, target)));
      if (!ok) toast('A folder can’t go inside itself.', 'error');
      return;
    }
    if (!raw) return;
    const ids = raw.split(',');
    let n = 0;
    ctx.update((d) => (n = movePhotos(d, ids, target)));
    ui.selected.clear();
    if (n) toast(`Moved ${n} photo${n === 1 ? '' : 's'} to ${target ? `“${folderName(target)}”` : 'the top'}`);
  };
  const dropTarget = (el, target) => {
    el.addEventListener('dragover', (e) => (e.preventDefault(), el.classList.add('over')));
    el.addEventListener('dragleave', () => el.classList.remove('over'));
    el.addEventListener('drop', dropOn(target));
    return el;
  };
  const crumbs = h(
    'nav',
    { class: 'mgr-crumbs', 'aria-label': 'Folder' },
    dropTarget(h('button', { type: 'button', class: `link${ui.folder ? '' : ' on'}`, onclick: () => openFolder('') }, icon('home', 13), 'All photos'), ''),
    ...folderPath(folders, ui.folder).flatMap((fo) => [h('span', { class: 'muted' }, '›'), dropTarget(h('button', { type: 'button', class: `link${fo.id === ui.folder ? ' on' : ''}`, onclick: () => openFolder(fo.id) }, fo.name), fo.id)]),
  );
  const tiles = filtering
    ? []
    : subfolders(folders, ui.folder).map((fo) => {
        const n = photosIn(m.photos, folders, fo.id, { deep: true });
        const cover = n.map((p) => info(p.mediaId)).find(Boolean);
        const el = h(
          'div',
          { class: 'mgr-folder', draggable: 'true' },
          h('button', { type: 'button', class: 'mgr-folder-open', onclick: () => openFolder(fo.id), 'aria-label': `Open ${fo.name}, ${n.length} photos` }, h('span', { class: 'mgr-folder-art' }, cover ? h('img', { src: cover.thumb || cover.url, alt: '', loading: 'lazy' }) : icon('file', 26)), h('strong', {}, fo.name), h('span', { class: 'muted tiny' }, `${n.length} photo${n.length === 1 ? '' : 's'}${subfolders(folders, fo.id).length ? ` · ${subfolders(folders, fo.id).length} folder${subfolders(folders, fo.id).length === 1 ? '' : 's'}` : ''}`)),
          h('div', { class: 'mgr-folder-acts' }, iconButton('type', `Rename ${fo.name}`, () => rename(fo), 'ghost'), iconButton('trash', `Delete the folder ${fo.name}`, () => remove(fo), 'ghost')),
        );
        el.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/x-pvm-folder', fo.id));
        return dropTarget(el, fo.id);
      });

  // ---- selection and moving
  const sel = ui.selected;
  for (const id of [...sel]) if (!m.photos.some((p) => p.id === id)) sel.delete(id);
  const moveSel = h('select', { 'aria-label': 'Move the ticked photos to' }, h('option', { value: '' }, 'Move to…'), h('option', { value: '__top' }, 'All photos (no folder)'), ...folders.map((fo) => h('option', { value: fo.id }, folderPath(folders, fo.id).map((x) => x.name).join(' › '))).sort((a, b) => a.textContent.localeCompare(b.textContent)));
  moveSel.addEventListener('change', () => {
    if (!moveSel.value) return;
    const to = moveSel.value === '__top' ? '' : moveSel.value;
    let n = 0;
    ctx.update((d) => (n = movePhotos(d, [...sel], to)));
    sel.clear();
    toast(`Moved ${n} photo${n === 1 ? '' : 's'} to ${to ? `“${folderName(to)}”` : 'the top'}`);
  });
  const selBar = sel.size
    ? h('div', { class: 'mgr-selbar' }, h('strong', {}, `${sel.size} ticked`), moveSel, button('Tick this page', () => (pg.items.forEach((p) => sel.add(p.id)), rerender()), { variant: 'sm ghost' }), button('Clear', () => (sel.clear(), rerender()), { variant: 'sm ghost' }))
    : h('p', { class: 'muted tiny' }, 'Tick photos to move several at once, or drag a photo onto a folder.');

  const card = (p) => {
    const x = info(p.mediaId);
    const drop = () => ctx.update((d) => {
      d.photos = d.photos.filter((y) => y.id !== p.id);
      d.band.epkPhotos = (d.band.epkPhotos || []).filter((id) => id !== p.mediaId);
      if (d.band.photoId === p.mediaId) d.band.photoId = null;
    });
    if (!x) return h('div', { class: 'mgr-ph missing' }, h('p', { class: 'muted small' }, 'This photo was removed from the media library.'), button('Remove', drop, { variant: 'sm ghost' }));
    const inKit = epk.includes(p.mediaId);
    const isLogo = band.logoId === p.mediaId;
    const isProfile = band.photoId === p.mediaId;
    const tagsIn = h('input', { type: 'text', value: p.tags.join(', '), placeholder: 'Tags: live, press, 2026…', 'data-k': `ph-tags-${p.id}`, 'aria-label': 'Tags' });
    tagsIn.addEventListener('change', () => ctx.update(P(p.id, (y) => (y.tags = parseTags(tagsIn.value)))));
    const tick = h('input', { type: 'checkbox', checked: sel.has(p.id), 'aria-label': `Tick ${p.caption || x.name}` });
    tick.addEventListener('change', () => (tick.checked ? sel.add(p.id) : sel.delete(p.id), rerender()));
    const el = h(
      'div',
      { class: `mgr-ph${inKit ? ' in-kit' : ''}${sel.has(p.id) ? ' ticked' : ''}`, draggable: 'true' },
      h(
        'div',
        { class: 'mgr-ph-img' },
        h('button', { type: 'button', class: 'mgr-ph-open', onclick: () => ((ui.open = p.id), rerender()), 'aria-label': `View ${p.caption || x.name}` }, h('img', { src: x.thumb || x.url, alt: p.caption || '', loading: 'lazy', decoding: 'async' })),
        h('label', { class: 'mgr-ph-tick' }, tick),
        h('button', { type: 'button', class: `mgr-ph-star${p.favorite ? ' on' : ''}`, 'aria-pressed': p.favorite ? 'true' : 'false', 'aria-label': p.favorite ? 'Unstar' : 'Star', onclick: () => ctx.update(P(p.id, (y) => (y.favorite = !y.favorite))) }, p.favorite ? '★' : '☆'),
        inKit || isLogo || isProfile ? h('span', { class: 'mgr-ph-badges' }, isProfile ? h('span', {}, 'Profile') : null, inKit ? h('span', {}, 'Press kit') : null, isLogo ? h('span', {}, 'Logo') : null) : null,
      ),
      filtering && p.folder ? h('button', { type: 'button', class: 'link tiny mgr-ph-folder', onclick: () => openFolder(p.folder) }, icon('file', 11), ` ${folderPath(folders, p.folder).map((fo) => fo.name).join(' › ')}`) : null,
      f.text(`ph-cap-${p.id}`, '', p.caption, P(p.id, (y, v) => (y.caption = v)), { placeholder: 'Caption' }),
      f.text(`ph-cred-${p.id}`, '', p.credit, P(p.id, (y, v) => (y.credit = v)), { placeholder: 'Photographer' }),
      tagsIn,
      p.tags.length ? h('div', { class: 'mgr-ph-tags' }, p.tags.map((t) => h('button', { type: 'button', class: 'sfx-tag', onclick: () => ((ui.tag = t), (ui.page = 1), rerender()) }, `#${t}`))) : null,
      h(
        'div',
        { class: 'row' },
        button(inKit ? 'In press kit' : 'Press kit', () => {
          let ok = true;
          ctx.update((d) => (ok = toggleEpkPhoto(d.band, p.mediaId)));
          if (!ok) toast(`The press kit holds ${EPK_PHOTO_MAX} photos. Take one out first.`, 'error');
        }, { iconName: inKit ? 'check' : 'clipboard', variant: `sm${inKit ? ' primary' : ''}`, title: `Use in the downloadable press kit (up to ${EPK_PHOTO_MAX})` }),
        button('Video', () => st.useInEditor(p.mediaId, 'clip', { open: false }), { iconName: 'film', variant: 'sm', title: 'Add to the end of the video track in the Video Studio' }),
        button(isProfile ? 'Profile ✓' : 'Profile', () => ctx.update((d) => (d.band.photoId = isProfile ? null : p.mediaId)), { variant: `sm${isProfile ? ' primary' : ' ghost'}`, title: isProfile ? 'This is the profile photo. Click to clear it.' : 'Use as this artist’s profile photo' }),
        button(isLogo ? 'Logo ✓' : 'Logo', () => ctx.update((d) => (d.band.logoId = isLogo ? null : p.mediaId)), { variant: `sm${isLogo ? ' primary' : ' ghost'}`, title: isLogo ? 'This is the logo on promos. Click to clear it.' : 'Use as this artist’s logo on promos' }),
        iconButton('download', `Download ${x.name}`, async () => download(await (await fetch(x.url)).blob(), x.name), 'ghost'),
        iconButton('trash', `Remove ${x.name} from this page`, drop, 'ghost'),
      ),
    );
    // dragging a ticked photo moves every ticked photo
    el.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/x-pvm-photos', (sel.has(p.id) ? [...sel] : [p.id]).join(',')));
    return el;
  };

  // a full-size view with previous / next (through the whole filtered list, not just this page)
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
        ui.page = Math.floor(next / ui.size) + 1; // the page behind follows along
        document.removeEventListener('keydown', onKey);
        rerender();
      };
      const onKey = (e) => (e.key === 'Escape' ? close() : e.key === 'ArrowRight' ? go(1) : e.key === 'ArrowLeft' ? go(-1) : null);
      document.addEventListener('keydown', onKey);
      viewer = h(
        'div',
        { class: 'mgr-lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': p.caption || x.name, onclick: (e) => e.target === e.currentTarget && close() },
        h('img', { src: x.url, alt: p.caption || '' }),
        h('div', { class: 'mgr-lightbox-bar' }, h('span', {}, [p.caption, p.credit && `Photo: ${p.credit}`].filter(Boolean).join(' · ') || x.name), h('span', { class: 'muted small' }, `${i + 1} of ${list.length}`)),
        list.length > 1 ? iconButton('arrowLeft', 'Previous photo', () => go(-1), 'mgr-lightbox-prev') : null,
        list.length > 1 ? iconButton('arrowRight', 'Next photo', () => go(1), 'mgr-lightbox-next') : null,
        iconButton('x', 'Close', close, 'mgr-lightbox-close'),
      );
    } else ui.open = null;
  }

  const drop = h('div', { class: 'dropzone small-drop', tabindex: '0', role: 'button', 'aria-label': 'Add photos' }, icon('upload', 22), h('strong', {}, ui.busy ? 'Adding photos…' : `Drop photos here or click to pick${ui.folder ? ` (they go in “${folderName(ui.folder)}”)` : ''}`), h('span', { class: 'muted tiny' }, 'JPG, PNG, WebP… Kept in this browser with the Video Studio’s media.'));
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

  const pageCtl = () => pager(pg, { size: ui.size, onPage: (n) => ((ui.page = n), ctx.go('photos'), document.querySelector('.mgr-main')?.scrollTo?.({ top: 0 })), onSize: (n) => (savePageSize(n), (ui.size = n), (ui.page = 1), rerender()) });
  const here = ui.folder ? folderName(ui.folder) : 'All photos';
  return h(
    'div',
    { class: 'mgr-page wide' },
    h('header', { class: 'mgr-head' }, h('div', {}, h('h1', {}, 'Photos'), h('p', { class: 'muted' }, `${band.name || 'This artist'} · ${m.photos.length} photo${m.photos.length === 1 ? '' : 's'} · ${folders.length} folder${folders.length === 1 ? '' : 's'}${epk.length ? ` · ${epk.length} in the press kit` : ''}`)), h('div', { class: 'row' }, button('New folder', newOne, { iconName: 'plus', variant: 'ghost' }), driveButton(IMAGE_ACCEPT, true, (fs) => upload(fs), { variant: 'ghost' }), button(ui.busy ? 'Adding…' : 'Upload photos', () => upload(), { iconName: 'upload', variant: 'primary', disabled: ui.busy }))),
    h('section', { class: 'mgr-sect' }, drop, libSel ? h('div', { class: 'row' }, libSel) : null),
    m.photos.length || folders.length
      ? h(
          'section',
          { class: 'mgr-sect' },
          crumbs,
          tiles.length ? h('div', { class: 'mgr-folders' }, tiles) : null,
          h('div', { class: 'search-row' }, search),
          h(
            'div',
            { class: 'chips' },
            chip(ui.folder ? `In ${here}` : 'Not in a folder', !filtering, () => Object.assign(ui, { starred: false, epkOnly: false, tag: '', q: '', everywhere: false })),
            chip(`Every folder ${m.photos.length}`, ui.everywhere && !ui.starred && !ui.epkOnly && !ui.tag, () => Object.assign(ui, { everywhere: !ui.everywhere, starred: false, epkOnly: false, tag: '' })),
            chip(`★ Starred ${m.photos.filter((p) => p.favorite).length}`, ui.starred, () => (ui.starred = !ui.starred)),
            chip(`Press kit ${epk.length}/${EPK_PHOTO_MAX}`, ui.epkOnly, () => (ui.epkOnly = !ui.epkOnly)),
          ),
          tags.length ? h('div', { class: 'chips sfx-tags' }, tags.map(({ tag, n }) => chip(`#${tag} ${n}`, ui.tag === tag, () => (ui.tag = ui.tag === tag ? '' : tag)))) : null,
          filtering ? h('p', { class: 'muted tiny' }, 'Showing matches from every folder. Each photo says which folder it’s in.') : null,
          selBar,
          pageCtl(),
          shown.length ? h('div', { class: 'mgr-photos-grid' }, pg.items.map(card)) : h('p', { class: 'muted small' }, filtering ? 'No photos match.' : tiles.length ? 'No loose photos here: open a folder above.' : 'This folder is empty. Upload photos while it’s open, or drag photos onto it.'),
          pg.pages > 1 ? pageCtl() : null,
        )
      : h('p', { class: 'muted small' }, 'No photos yet. Press shots, live photos and behind-the-scenes go here; pick the best four for the press kit.'),
    viewer,
  );
}
