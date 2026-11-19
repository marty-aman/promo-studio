// EPK (press kit): the band's profile in one place, and a one-page press kit you download as a
// single HTML file (photos embedded) to email to venues, press and curators or host anywhere.
import { h, button, iconButton, toast, download } from '../dom.js';
import { mid } from './model.js';
import { EPK_LINKS, epkHTML, shortBio } from './extras.js';

export const epkUI = { photos: [] };

export function buildEPK(ctx) {
  const m = ctx.store.get();
  const f = ctx.form;
  const b = m.band;
  const B = (fn) => (d, v) => fn(d.band, v);
  const images = ctx.studio.imageFiles();
  const ui = epkUI;
  ui.photos = ui.photos.filter((id) => images.some((x) => x.id === id));

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
    return epkHTML(ctx.store.get(), { today: ctx.today(), photos });
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
  const togglePhoto = (id) => {
    ui.photos = ui.photos.includes(id) ? ui.photos.filter((x) => x !== id) : [...ui.photos, id].slice(-4);
    ctx.go('epk');
  };

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
          h('h2', {}, 'Press photos'),
          images.length
            ? h('div', { class: 'mgr-photos' }, images.map((im) => h('button', { type: 'button', class: `mgr-photo${ui.photos.includes(im.id) ? ' on' : ''}`, 'aria-pressed': ui.photos.includes(im.id) ? 'true' : 'false', onclick: () => togglePhoto(im.id) }, im.thumb ? h('img', { src: im.thumb, alt: '' }) : null, h('span', {}, im.name))))
            : h('p', { class: 'muted small' }, 'Upload photos in Video Studio → Video → My clips, then pick up to four here.'),
          h('p', { class: 'muted tiny' }, 'Picked photos are embedded in the downloaded file (resized to 1400 px). The preview leaves them out.'),
        ),
      ),
      h('section', { class: 'mgr-sect mgr-epk-prev' }, h('h2', {}, 'Preview'), preview, h('p', { class: 'muted tiny' }, 'Music lists songs with a release date; shows list confirmed upcoming dates and venues you’ve played (marked Played).')),
    ),
  );
}
