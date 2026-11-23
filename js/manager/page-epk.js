// EPK (press kit): the band's profile in one place, and a one-page press kit you download as a
// single HTML file (photos embedded) to email to venues, press and curators or host anywhere.
import { h, button, iconButton, toast, download, pickFiles } from '../dom.js';
import { mid } from './model.js';
import { exportPDF } from './pdf.js';
import { EPK_LINKS, epkHTML, shortBio } from './extras.js';
import { epkCredits, addPhotos, pinnedPage, loadPageSize, savePageSize } from './photos.js';
import { pager } from './page-photos.js';
import { THEMES } from '../themes.js';
import { photoStyle, photoPos, nudgePhoto } from './artists.js';

export const epkUI = { photos: [], reposition: false, page: 1, size: 0 };

const setPos = (ctx, pos) => ctx.update((d) => (d.band.photoPos = photoPos(pos)), 'photoPos');

/**
 * The profile photo in its frame. With Reposition on: drag the photo to move it, arrow keys nudge
 * it (Shift for bigger steps), + and − zoom. The drag shows live and saves once, when you let go.
 */
function photoFrame(ctx, b, ph) {
  const img = h('img', { src: ph.url, alt: `${b.name || 'Artist'} profile photo`, style: photoStyle(b.photoPos), draggable: 'false' });
  if (!epkUI.reposition) return h('div', { class: 'mgr-profile-img' }, img);
  const frame = h('div', { class: 'mgr-profile-img edit', tabindex: '0', role: 'group', 'data-k': 'epk-photo-frame', 'aria-label': 'Profile photo framing. Drag the photo or use the arrow keys to move it; plus and minus zoom.' }, img);
  let start = null;
  frame.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    frame.focus();
    frame.setPointerCapture(e.pointerId);
    start = { x: e.clientX, y: e.clientY, pos: photoPos(ctx.store.get().band.photoPos), cur: null };
  });
  frame.addEventListener('pointermove', (e) => {
    if (!start) return;
    const r = frame.getBoundingClientRect();
    start.cur = nudgePhoto(start.pos, e.clientX - start.x, e.clientY - start.y, r.width, r.height);
    Object.assign(img.style, photoStyle(start.cur));
  });
  const end = () => {
    if (start && start.cur) setPos(ctx, start.cur);
    start = null;
  };
  frame.addEventListener('pointerup', end);
  frame.addEventListener('pointercancel', end);
  frame.addEventListener('keydown', (e) => {
    const p = photoPos(ctx.store.get().band.photoPos);
    const step = e.shiftKey ? 10 : 2;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      // an arrow moves the photo the way it points (the focal point goes the other way)
      setPos(ctx, { ...p, x: p.x - moves[e.key][0], y: p.y - moves[e.key][1] });
    } else if (e.key === '+' || e.key === '=' || e.key === '-') {
      e.preventDefault();
      setPos(ctx, { ...p, zoom: p.zoom + (e.key === '-' ? -0.1 : 0.1) });
    }
  });
  return frame;
}

/** The zoom slider (1x to 3x) and Reset, under the photo while repositioning. */
function photoControls(ctx, b) {
  const p = photoPos(b.photoPos);
  const zoom = h('input', { type: 'range', min: '1', max: '3', step: '0.05', value: String(p.zoom), 'aria-label': 'Zoom', 'data-k': 'epk-photo-zoom' });
  const label = h('span', { class: 'muted tiny mono' }, `${p.zoom.toFixed(2)}×`);
  zoom.addEventListener('input', () => {
    const img = document.querySelector('.mgr-profile-img.edit img');
    if (img) Object.assign(img.style, photoStyle({ ...p, zoom: +zoom.value }));
    label.textContent = `${(+zoom.value).toFixed(2)}×`;
  });
  zoom.addEventListener('change', () => setPos(ctx, { ...photoPos(ctx.store.get().band.photoPos), zoom: +zoom.value }));
  return h('div', { class: 'mgr-photo-pos' }, h('label', { class: 'mf inline' }, h('span', { class: 'mf-l' }, 'Zoom'), zoom, label), button('Reset', () => ctx.update((d) => delete d.band.photoPos), { variant: 'sm ghost', title: 'Centre the photo at 1×' }), h('span', { class: 'muted tiny' }, 'Drag the photo, or click it and use the arrow keys.'));
}

export function buildEPK(ctx) {
  const m = ctx.store.get();
  const f = ctx.form;
  const b = m.band;
  const B = (fn) => (d, v) => fn(d.band, v);
  const images = ctx.studio.imageFiles();
  // the artist's Photos come first, then any other image in the media library
  const byId = new Map(images.map((x) => [x.id, x]));
  const onPage = new Set((m.photos || []).map((p) => p.mediaId));
  const ranked = [...(m.photos || []).map((p) => byId.get(p.mediaId)).filter(Boolean), ...images.filter((x) => !onPage.has(x.id))];
  const ui = epkUI;
  ui.photos = (b.epkPhotos || []).filter((id) => byId.has(id));
  if (!ui.size) ui.size = loadPageSize();
  // only one page of photos is drawn; the picked ones and the profile photo stay on top
  const pg = pinnedPage(ranked, [...ui.photos, b.photoId].filter(Boolean), ui.page, ui.size);
  ui.page = pg.page;
  const pageCtl = () => pager(pg, { size: ui.size, onPage: (n) => ((ui.page = n), ctx.refresh(), requestAnimationFrame(() => document.querySelector('[data-k="epk-photos"]')?.scrollIntoView({ block: 'start' }))), onSize: (n) => (savePageSize(n), (ui.size = n), (ui.page = 1), ctx.refresh()) });

  const listEditor = (key, cols, blank, label) =>
    h(
      'div',
      { class: 'mgr-mini' },
      (b[key] || []).map((it) =>
        h(
          'div',
          { class: 'mgr-two' },
          ...cols.map(([c, ph]) => f.text(`epk-${key}-${c}-${it.id}`, '', it[c], B((band, v) => {
            const y = (band[key] || []).find((z) => z.id === it.id);
            if (y) y[c] = v;
          }), { placeholder: ph })),
          iconButton('trash', `Remove ${label}`, () => ctx.update(B((band) => (band[key] = band[key].filter((z) => z.id !== it.id)))), 'ghost'),
        ),
      ),
      button(`Add ${label}`, () => ctx.update(B((band) => (band[key] ||= []).push({ id: mid(key), ...blank }))), { iconName: 'plus', variant: 'sm ghost' }),
    );

  const preview = h('iframe', { class: 'mgr-epk-frame', title: 'Press kit preview', sandbox: '', srcdoc: epkHTML(m, { today: ctx.today() }) });
  const build = async () => {
    const photos = [];
    for (const id of ui.photos) {
      const url = await ctx.studio.imageDataUrl(id, 1400);
      if (url) photos.push(url);
    }
    const cur = ctx.store.get();
    const credits = epkCredits(cur.photos || [], ui.photos.filter((id) => images.some((x) => x.id === id)));
    const avatar = cur.band.photoId ? await ctx.studio.imageDataUrl(cur.band.photoId, 600) : null;
    return epkHTML(cur, { today: ctx.today(), photos, credits, avatar });
  };
  const save = async () => {
    const html = await build();
    download(new Blob([html], { type: 'text/html' }), `${(b.name || 'band').replace(/[^\w-]+/g, '-').toLowerCase()}-press-kit.html`);
  };
  const pdf = async () => {
    exportPDF(await build(), `${b.name || 'Band'} press kit`);
    toast('Pick “Save as PDF” as the printer to get a PDF.');
  };
  const copyBio = async () => {
    try {
      await navigator.clipboard.writeText(shortBio(b.bio));
      toast('Short bio copied');
    } catch {
      toast('Could not copy.', 'error');
    }
  };
  const togglePhoto = (id) => ctx.update(B((band) => (band.epkPhotos = (band.epkPhotos || []).includes(id) ? band.epkPhotos.filter((x) => x !== id) : [...(band.epkPhotos || []), id].slice(-4))));
  // the library's thumbnail, fetched only when scrolled near and decoded off the main thread.
  // shortcut: for images media.js uses the file's own URL as its thumb; a real small thumbnail
  // would need a downscaled copy made in media.js (shared with the Photos page) if pages still feel slow

  const tile = (im) => {
    const on = ui.photos.includes(im.id);
    return h('button', { type: 'button', class: `mgr-photo${on ? ' on' : ''}`, 'aria-pressed': on ? 'true' : 'false', 'data-id': im.id, onclick: () => togglePhoto(im.id) }, im.thumb ? h('img', { loading: 'lazy', decoding: 'async', src: im.thumb, alt: '' }) : null, h('span', {}, im.name), im.id === b.photoId ? h('em', { class: 'mgr-photo-tag' }, 'Profile photo') : null);
  };

  return h(
    'div',
    { class: 'mgr-page wide' },
    h(
      'header',
      { class: 'mgr-head' },
      h('div', {}, h('h1', {}, 'Press kit (EPK)'), h('p', { class: 'muted' }, 'Your band’s profile, bio and links. Download it as a one-page press kit for venues, blogs and playlist curators.')),
      h('div', { class: 'row' }, button('Copy short bio', copyBio, { iconName: 'copy', variant: 'sm', disabled: !b.bio }), button('Export PDF', pdf, { iconName: 'print', variant: 'sm', title: 'Print it, or pick “Save as PDF” as the printer' }), button('Download press kit', save, { iconName: 'download', variant: 'sm primary' })),
    ),
    h(
      'div',
      { class: 'mgr-cols' },
      h(
        'div',
        {},
        h(
          'section',
          { class: 'mgr-sect' },
          h('h2', {}, 'The band'),
          (() => {
            const ph = b.photoId && ctx.studio.mediaInfo(b.photoId);
            // a new photo starts centred at 1x
            const setPhoto = (id) => ctx.update(B((x) => {
              x.photoId = id || null;
              delete x.photoPos;
            }));
            const upload = async () => {
              const files = await pickFiles('image/*,.jpg,.jpeg,.png,.webp', false);
              if (!files.length) return;
              const { added, skipped } = await ctx.studio.uploadMedia(files, ['image']);
              if (skipped.length) return toast(`“${skipped[0]}” isn’t a photo.`, 'error');
              ctx.update((d) => {
                addPhotos(d, added);
                d.band.photoId = added[0].id;
                delete d.band.photoPos;
              });
              toast('Profile photo set. It’s also on the Photos page.');
            };
            const options = ranked.filter((x) => x.id !== b.photoId);
            const pick = options.length ? h('select', { 'aria-label': 'Pick a profile photo', 'data-k': 'epk-photo-pick' }, h('option', { value: '' }, 'Or pick one of your photos'), options.map((x) => h('option', { value: x.id }, x.name))) : null;
            if (pick) pick.addEventListener('change', () => pick.value && setPhoto(pick.value));
            return h(
              'div',
              { class: 'mgr-profile' },
              ph ? photoFrame(ctx, b, ph) : h('div', { class: 'mgr-profile-img' }, (b.name || '?')[0].toUpperCase()),
              h(
                'div',
                {},
                h('strong', {}, 'Profile photo'),
                h('p', { class: 'muted tiny' }, 'Shown in the artist menu, on Home and at the top of the press kit. A square photo works best.'),
                h('div', { class: 'row' }, button(ph ? 'Upload a new one' : 'Upload a photo', upload, { iconName: 'upload', variant: 'sm primary' }), pick, ph ? button(epkUI.reposition ? 'Done' : 'Reposition', () => ((epkUI.reposition = !epkUI.reposition), ctx.refresh()), { iconName: epkUI.reposition ? 'check' : 'hand', variant: 'sm', title: 'Move and zoom the photo inside its frame' }) : null, ph ? button('Remove', () => setPhoto(null), { variant: 'sm ghost' }) : null),
                ph && epkUI.reposition ? photoControls(ctx, b) : null,
              ),
            );
          })(),
          h('div', { class: 'mgr-two' }, f.text('epk-name', 'Band name', b.name, B((x, v) => (x.name = v.trim()))), f.text('epk-city', 'City', b.city, B((x, v) => (x.city = v)))),
          h('div', { class: 'mgr-two' }, f.text('epk-genres', 'Genres', b.genres, B((x, v) => (x.genres = v)), { placeholder: 'alt-metal, emocore' }), f.text('epk-similar', 'For fans of', b.similar || '', B((x, v) => (x.similar = v)), { placeholder: 'Bad Omens, Deftones, Loathe' })),
          f.text('epk-bio', 'Bio', b.bio, B((x, v) => (x.bio = v)), { rows: 7, placeholder: 'Who you are, how you sound, what you’ve done. The first paragraph is your short bio.', hint: b.bio ? `Short bio: ${shortBio(b.bio).length} characters` : '' }),
          f.text('epk-high', 'Highlights', b.highlights || '', B((x, v) => (x.highlights = v)), { rows: 4, placeholder: 'One per line: shows you opened, radio plays, playlist adds, stream counts…' }),
        ),
        h('section', { class: 'mgr-sect' }, h('h2', {}, 'Links'), h('div', { class: 'mgr-two' }, EPK_LINKS.map(([k, l]) => f.text(`epk-link-${k}`, l, (b.links || {})[k] || '', B((x, v) => (x.links = { ...(x.links || {}), [k]: v.trim() })), { type: 'url', placeholder: 'https://…' })))),
        h('section', { class: 'mgr-sect' }, h('h2', {}, 'Members'), listEditor('members', [['name', 'Name'], ['role', 'Vocals, guitar…']], { name: '', role: '' }, 'a member')),
        h('section', { class: 'mgr-sect' }, h('h2', {}, 'Press quotes'), listEditor('press', [['quote', 'What they said'], ['source', 'Who said it']], { quote: '', source: '' }, 'a quote')),
        h(
          'section',
          { class: 'mgr-sect' },
          h('h2', {}, 'Booking contact'),
          h('div', { class: 'mgr-three' }, f.text('epk-cname', 'Name', b.contactName || '', B((x, v) => (x.contactName = v))), f.text('epk-cemail', 'Email', b.contactEmail || '', B((x, v) => (x.contactEmail = v.trim())), { type: 'email' }), f.text('epk-cphone', 'Phone', b.contactPhone || '', B((x, v) => (x.contactPhone = v)), { type: 'tel' })),
        ),
        h(
          'section',
          { class: 'mgr-sect' },
          h('h2', {}, 'Branding for promos'),
          h('p', { class: 'muted small' }, 'When you pick this artist in the Video Studio, the promo takes its name, this theme and this logo.'),
          h(
            'div',
            { class: 'mgr-two' },
            f.select('epk-theme', 'Theme', b.theme || '', [['', 'No theme (keep the edit’s look)'], ...THEMES.map((t) => [t.id, t.name])], B((x, v) => (x.theme = v))),
            f.select('epk-logo', 'Logo', b.logoId || '', [['', images.length ? 'No logo' : 'Upload a logo in Video Studio → Video'], ...images.map((im) => [im.id, im.name])], B((x, v) => (x.logoId = v || null))),
          ),
        ),
        h(
          'section',
          { class: 'mgr-sect', 'data-k': 'epk-photos' },
          h('h2', {}, 'Press photos'),
          h('p', { class: 'muted small' }, 'Pick up to four. Manage, caption and credit them on the ', h('button', { type: 'button', class: 'link', onclick: () => ctx.go('photos') }, 'Photos'), ' page.'),
          ranked.length
            ? [
                pg.pinned.length ? h('div', { class: 'mgr-photos mgr-photos-pinned', 'data-k': 'epk-pinned', role: 'group', 'aria-label': 'Picked photos and the profile photo' }, pg.pinned.map(tile)) : null,
                pg.pinned.length && pg.total ? h('p', { class: 'muted tiny' }, 'All your other photos:') : null,
                pageCtl(),
                pg.items.length ? h('div', { class: 'mgr-photos', 'data-k': 'epk-page' }, pg.items.map(tile)) : null,
                pg.pages > 1 ? pageCtl() : null,
              ]
            : h('p', { class: 'muted small' }, 'No photos yet. Add them on the Photos page.'),
          h('p', { class: 'muted tiny' }, 'Picked photos are embedded in the downloaded file (resized to 1400 px). The preview leaves them out.'),
        ),
      ),
      h('div', {}, h('section', { class: 'mgr-sect mgr-epk-prev' }, h('h2', {}, 'Preview'), preview, h('p', { class: 'muted tiny' }, 'Music lists songs with a release date; shows list confirmed upcoming dates and venues you’ve played (marked Played).')),
        ctx.artists().length > 1 ? h('section', { class: 'mgr-sect' }, h('h2', {}, 'This artist'), h('p', { class: 'muted small' }, `Deletes ${b.name || 'this artist'} with its songs, shows, posts and money. Venues, bands and contacts are shared and stay.`), button(`Delete ${b.name || 'this artist'}`, () => ctx.deleteArtist(m.artistId), { iconName: 'trash', variant: 'sm danger' })) : null,
      ),
    ),
  );
}
