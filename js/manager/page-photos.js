// Photos: the open artist's photo library. Upload in bulk, caption, credit and tag each photo, star
// favorites, pick up to four for the press kit, set the logo, and send photos to the Video Studio.
import { h, icon, button, iconButton, toast, pickFiles, download } from '../dom.js';
import { driveButton } from '../gdrive.js';
import { addPhotos, filterPhotos, photoTags, toggleEpkPhoto, parseTags, EPK_PHOTO_MAX } from './photos.js';

export const photosUI = { q: '', tag: '', starred: false, epkOnly: false, busy: false, open: null, limit: 48 };

const IMAGE_ACCEPT = 'image/*,.jpg,.jpeg,.png,.webp,.gif,.heic';

export function buildPhotos(ctx) {
  const m = ctx.store.get();
  const st = ctx.studio;
  const ui = photosUI;
  const f = ctx.form;
  const band = m.band;
  const epk = band.epkPhotos || [];
  const info = (id) => st.mediaInfo(id);
  const P = (id, fn) => (d, v) => {
    const p = d.photos.find((x) => x.id === id);
    if (p) fn(p, v, d);
  };
  const rerender = () => ctx.go('photos');

  const upload = async (files) => {
    const picked = files || (await pickFiles(IMAGE_ACCEPT, true));
    if (!picked.length) return;
    ui.busy = true;
    rerender();
    try {
      const { added, skipped } = await st.uploadMedia(picked, ['image']);
      let n = 0;
      if (added.length) ctx.update((d) => (n = addPhotos(d, added)));
      if (skipped.length) toast(`Skipped ${skipped.length === 1 ? skipped[0] : `${skipped.length} files`}: not a photo.`, 'error', 5000);
      else if (n) toast(`Added ${n} photo${n === 1 ? '' : 's'}`);
    } finally {
      ui.busy = false;
      rerender();
    }
  };
  const library = st.libraryFiles(['image']).filter((x) => !m.photos.some((p) => p.mediaId === x.id));
  const libSel = library.length
    ? (() => {
        const sel = h('select', { 'aria-label': 'Add a photo from the media library' }, h('option', { value: '' }, `Or add from the media library (${library.length})`), library.map((x) => h('option', { value: x.id }, x.name)));
        sel.addEventListener('change', () => {
          const x = library.find((y) => y.id === sel.value);
          if (x) ctx.update((d) => addPhotos(d, [x]));
        });
        return sel;
      })()
    : null;

  const shown = filterPhotos(m.photos, { q: ui.q, tag: ui.tag, starred: ui.starred, epk: ui.epkOnly ? epk : null, nameOf: (id) => info(id)?.name || '' });
  const tags = photoTags(m.photos);
  const search = h('input', { type: 'search', placeholder: 'Search captions, tags, photographers', value: ui.q, 'aria-label': 'Search photos', 'data-k': 'photos-q' });
  let timer = null;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => ((ui.q = search.value.trim()), (ui.limit = 48), rerender()), 200);
  });
  const chip = (label, on, fn) => button(label, () => (fn(), (ui.limit = 48), rerender()), { variant: `chip${on ? ' on' : ''}` });

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
    return h(
      'div',
      { class: `mgr-ph${inKit ? ' in-kit' : ''}` },
      h(
        'div',
        { class: 'mgr-ph-img' },
        h('button', { type: 'button', class: 'mgr-ph-open', onclick: () => ((ui.open = p.id), rerender()), 'aria-label': `View ${p.caption || x.name}` }, h('img', { src: x.url, alt: p.caption || '', loading: 'lazy' })),
        h('button', { type: 'button', class: `mgr-ph-star${p.favorite ? ' on' : ''}`, 'aria-pressed': p.favorite ? 'true' : 'false', 'aria-label': p.favorite ? 'Unstar' : 'Star', onclick: () => ctx.update(P(p.id, (y) => (y.favorite = !y.favorite))) }, p.favorite ? '★' : '☆'),
        inKit || isLogo || isProfile ? h('span', { class: 'mgr-ph-badges' }, isProfile ? h('span', {}, 'Profile') : null, inKit ? h('span', {}, 'Press kit') : null, isLogo ? h('span', {}, 'Logo') : null) : null,
      ),
      f.text(`ph-cap-${p.id}`, '', p.caption, P(p.id, (y, v) => (y.caption = v)), { placeholder: 'Caption' }),
      f.text(`ph-cred-${p.id}`, '', p.credit, P(p.id, (y, v) => (y.credit = v)), { placeholder: 'Photographer' }),
      tagsIn,
      p.tags.length ? h('div', { class: 'mgr-ph-tags' }, p.tags.map((t) => h('button', { type: 'button', class: 'sfx-tag', onclick: () => ((ui.tag = t), rerender()) }, `#${t}`))) : null,
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
  };

  // a full-size view with previous / next
  let viewer = null;
  if (ui.open) {
    const list = shown.length ? shown : m.photos;
    const i = list.findIndex((p) => p.id === ui.open);
    const p = list[i];
    const x = p && info(p.mediaId);
    if (x) {
      const close = () => ((ui.open = null), document.removeEventListener('keydown', onKey), rerender());
      const go = (k) => ((ui.open = list[(i + k + list.length) % list.length].id), document.removeEventListener('keydown', onKey), rerender());
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

  const drop = h('div', { class: 'dropzone small-drop', tabindex: '0', role: 'button', 'aria-label': 'Add photos' }, icon('upload', 22), h('strong', {}, ui.busy ? 'Adding photos…' : 'Drop photos here or click to pick'), h('span', { class: 'muted tiny' }, 'JPG, PNG, WebP… Kept in this browser with the Video Studio’s media.'));
  drop.addEventListener('click', () => !ui.busy && upload());
  drop.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), upload()));
  drop.addEventListener('dragover', (e) => (e.preventDefault(), e.stopPropagation(), drop.classList.add('over')));
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    drop.classList.remove('over');
    upload([...(e.dataTransfer.files || [])]);
  });

  return h(
    'div',
    { class: 'mgr-page wide' },
    h('header', { class: 'mgr-head' }, h('div', {}, h('h1', {}, 'Photos'), h('p', { class: 'muted' }, `${band.name || 'This artist'} · ${m.photos.length} photo${m.photos.length === 1 ? '' : 's'}${epk.length ? ` · ${epk.length} in the press kit` : ''}`)), h('div', { class: 'row' }, driveButton(IMAGE_ACCEPT, true, (fs) => upload(fs), { variant: 'ghost' }), button(ui.busy ? 'Adding…' : 'Upload photos', () => upload(), { iconName: 'upload', variant: 'primary', disabled: ui.busy }))),
    h('section', { class: 'mgr-sect' }, drop, libSel ? h('div', { class: 'row' }, libSel) : null),
    m.photos.length
      ? h(
          'section',
          { class: 'mgr-sect' },
          h('div', { class: 'search-row' }, search),
          h('div', { class: 'chips' }, chip(`All ${m.photos.length}`, !ui.starred && !ui.epkOnly && !ui.tag, () => ((ui.starred = false), (ui.epkOnly = false), (ui.tag = ''))), chip(`★ Starred ${m.photos.filter((p) => p.favorite).length}`, ui.starred, () => (ui.starred = !ui.starred)), chip(`Press kit ${epk.length}/${EPK_PHOTO_MAX}`, ui.epkOnly, () => (ui.epkOnly = !ui.epkOnly))),
          tags.length ? h('div', { class: 'chips sfx-tags' }, tags.map(({ tag, n }) => chip(`#${tag} ${n}`, ui.tag === tag, () => (ui.tag = ui.tag === tag ? '' : tag)))) : null,
          shown.length ? h('div', { class: 'mgr-photos-grid' }, shown.slice(0, ui.limit).map(card)) : h('p', { class: 'muted small' }, 'No photos match.'),
          shown.length > ui.limit ? button(`Show ${Math.min(48, shown.length - ui.limit)} more`, () => ((ui.limit += 48), rerender()), { variant: 'ghost wide' }) : null,
        )
      : h('p', { class: 'muted small' }, 'No photos yet. Press shots, live photos and behind-the-scenes go here; pick the best four for the press kit.'),
    viewer,
  );
}
