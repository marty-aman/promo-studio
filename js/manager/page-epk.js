// EPK (press kit): the band's profile in one place, and a one-page press kit you download as a
// single HTML file (photos embedded) to email to venues, press and curators or host anywhere.
import { h, button, iconButton, toast, download, pickFiles } from '../dom.js';
import { mid } from './model.js';
import { EPK_LINKS, epkHTML, shortBio } from './extras.js';
import { epkCredits, addPhotos } from './photos.js';
import { THEMES } from '../themes.js';

export const epkUI = { photos: [] };

export function buildEPK(ctx) {
  const m = ctx.store.get();
  const f = ctx.form;
  const b = m.band;
  const B = (fn) => (d, v) => fn(d.band, v);
  const images = ctx.studio.imageFiles();
  // the artist's Photos come first, then any other image in the media library
  const ranked = [...(m.photos || []).map((p) => images.find((x) => x.id === p.mediaId)).filter(Boolean), ...images.filter((x) => !(m.photos || []).some((p) => p.mediaId === x.id))];
  const ui = epkUI;
  ui.photos = (b.epkPhotos || []).filter((id) => images.some((x) => x.id === id));

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
  const copyBio = async () => {
    try {
      await navigator.clipboard.writeText(shortBio(b.bio));
      toast('Short bio copied');
    } catch {
      toast('Could not copy.', 'error');
    }
  };
  const togglePhoto = (id) => ctx.update(B((band) => (band.epkPhotos = (band.epkPhotos || []).includes(id) ? band.epkPhotos.filter((x) => x !== id) : [...(band.epkPhotos || []), id].slice(-4))));

  return h(
    'div',
    { class: 'mgr-page wide' },
    h(
      'header',
      { class: 'mgr-head' },
      h('div', {}, h('h1', {}, 'Press kit (EPK)'), h('p', { class: 'muted' }, 'Your band’s profile, bio and links. Download it as a one-page press kit for venues, blogs and playlist curators.')),
      h('div', { class: 'row' }, button('Copy short bio', copyBio, { iconName: 'copy', variant: 'sm', disabled: !b.bio }), button('Download press kit', save, { iconName: 'download', variant: 'sm primary' })),
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
            const setPhoto = (id) => ctx.update(B((x) => (x.photoId = id || null)));
            const upload = async () => {
              const files = await pickFiles('image/*,.jpg,.jpeg,.png,.webp', false);
              if (!files.length) return;
              const { added, skipped } = await ctx.studio.uploadMedia(files, ['image']);
              if (skipped.length) return toast(`“${skipped[0]}” isn’t a photo.`, 'error');
              ctx.update((d) => {
                addPhotos(d, added);
                d.band.photoId = added[0].id;
              });
              toast('Profile photo set. It’s also on the Photos page.');
            };
            const options = ranked.filter((x) => x.id !== b.photoId);
            const pick = options.length ? h('select', { 'aria-label': 'Pick a profile photo', 'data-k': 'epk-photo-pick' }, h('option', { value: '' }, 'Or pick one of your photos'), options.map((x) => h('option', { value: x.id }, x.name))) : null;
            if (pick) pick.addEventListener('change', () => pick.value && setPhoto(pick.value));
            return h(
              'div',
              { class: 'mgr-profile' },
              h('div', { class: 'mgr-profile-img' }, ph ? h('img', { src: ph.url, alt: `${b.name || 'Artist'} profile photo` }) : (b.name || '?')[0].toUpperCase()),
              h(
                'div',
                {},
                h('strong', {}, 'Profile photo'),
                h('p', { class: 'muted tiny' }, 'Shown in the artist menu, on Home and at the top of the press kit. A square photo works best.'),
                h('div', { class: 'row' }, button(ph ? 'Upload a new one' : 'Upload a photo', upload, { iconName: 'upload', variant: 'sm primary' }), pick, ph ? button('Remove', () => setPhoto(null), { variant: 'sm ghost' }) : null),
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
          { class: 'mgr-sect' },
          h('h2', {}, 'Press photos'),
          h('p', { class: 'muted small' }, 'Pick up to four. Manage, caption and credit them on the ', h('button', { type: 'button', class: 'link', onclick: () => ctx.go('photos') }, 'Photos'), ' page.'),
          ranked.length
            ? h('div', { class: 'mgr-photos' }, ranked.map((im) => h('button', { type: 'button', class: `mgr-photo${ui.photos.includes(im.id) ? ' on' : ''}`, 'aria-pressed': ui.photos.includes(im.id) ? 'true' : 'false', onclick: () => togglePhoto(im.id) }, im.thumb ? h('img', { src: im.thumb, alt: '' }) : null, h('span', {}, im.name))))
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
