// The "Link page" tab of the Press kit page: settings (band.linkInBio), a live preview, the
// download, the QR code and a printable flyer. The page itself is built in linkbio.js.
import { h, button, iconButton, toast, download } from '../dom.js';
import { mid } from './model.js';
import { exportPDF, docSlug } from './pdf.js';
import { normalizeLinkInBio, linkPageData, linkPageHTML, flyerHTML, safeHref, safeWebUrl, byteSize, LINKBIO_TARGET_BYTES } from './linkbio.js';
import { LINKBIO_MAX_BUTTONS, LINKBIO_MAX_SHOWS } from './linkbio-norm.js';
import { qrSVG } from './qr.js';

const kb = (n) => `${Math.max(1, Math.round(n / 1024))} KB`;

/** The cover and profile photo as small JPEG data URLs, made smaller once if the page runs over 200 KB. */
async function pageImages(ctx, d, sizes) {
  const cover = d.release && d.release.coverId ? await ctx.studio.imageDataUrl(d.release.coverId, sizes[0]) : null;
  const photo = d.photoId ? await ctx.studio.imageDataUrl(d.photoId, sizes[1]) : null;
  return { cover, photo };
}
async function buildPage(ctx) {
  const d = linkPageData(ctx.store.get(), { today: ctx.today() });
  let imgs = await pageImages(ctx, d, [420, 240]);
  let html = linkPageHTML(d, imgs);
  if (byteSize(html) > LINKBIO_TARGET_BYTES) {
    imgs = await pageImages(ctx, d, [280, 160]);
    html = linkPageHTML(d, imgs);
  }
  return { d, html, imgs };
}

export function linkBioTab(ctx) {
  const m = ctx.store.get();
  const f = ctx.form;
  const b = m.band;
  const li = normalizeLinkInBio(b.linkInBio);
  const L = (fn) => (d, v) => {
    const x = normalizeLinkInBio(d.band.linkInBio);
    fn(x, v, d);
    d.band.linkInBio = x;
  };
  const data = linkPageData(m, { today: ctx.today() });
  const slug = docSlug(b.name || 'band');

  // preview: drawn at once without photos, then again with them (the same file Download saves)
  const preview = h('iframe', { class: 'lb-frame', title: 'Link page preview', sandbox: '', srcdoc: linkPageHTML(data), 'data-k': 'lb-preview' });
  const sizeNote = h('span', { class: 'muted tiny', 'data-k': 'lb-size' }, `About ${kb(byteSize(linkPageHTML(data)))} before photos`);
  buildPage(ctx).then(({ html }) => {
    if (!preview.isConnected) return;
    preview.srcdoc = html;
    const n = byteSize(html);
    sizeNote.textContent = `${kb(n)}${n > LINKBIO_TARGET_BYTES ? ' (over 200 KB: pick a smaller cover or turn the photo off)' : ''}`;
  });

  const save = async () => {
    const { html } = await buildPage(ctx);
    download(new Blob([html], { type: 'text/html' }), `${slug}-links.html`);
    toast('Saved. Upload this one file to a free host, then paste its address below.');
  };
  const flyer = async () => {
    const d = linkPageData(ctx.store.get(), { today: ctx.today() });
    if (!d.qr) return toast('Paste the page address first (or tick “Use the Spotify link”), so the flyer has a QR code.', 'error');
    const photo = d.photoId ? await ctx.studio.imageDataUrl(d.photoId, 400) : null;
    exportPDF(flyerHTML(d, { photo }), `${b.name || 'Band'} flyer`);
    toast('Pick “Save as PDF” as the printer to get a PDF.');
  };
  const saveQr = () => {
    if (!data.qr) return;
    download(new Blob([qrSVG(data.qr.url, { px: 512, title: `QR code for ${data.qr.url}` })], { type: 'image/svg+xml' }), `${slug}-qr.svg`);
  };

  // your own buttons: label, address, move up or down, remove
  const btnRow = (x, i) => {
    const bad = x.url.trim() && !safeHref(x.url);
    const move = (by) => ctx.update(L((s) => {
      const j = i + by;
      if (j < 0 || j >= s.buttons.length) return;
      [s.buttons[i], s.buttons[j]] = [s.buttons[j], s.buttons[i]];
    }));
    const set = (key) => L((s, v) => {
      const y = s.buttons.find((z) => z.id === x.id);
      if (y) y[key] = key === 'url' ? v.trim() : v;
    });
    return h(
      'div',
      { class: 'lb-btn-row', 'data-id': x.id },
      f.text(`lb-btn-label-${x.id}`, '', x.label, set('label'), { placeholder: 'Label, e.g. Pre-save the EP', aria: `Button ${i + 1} label` }),
      f.text(`lb-btn-url-${x.id}`, '', x.url, set('url'), { type: 'url', placeholder: 'https://…', aria: `Button ${i + 1} address` }),
      iconButton('arrowUp', 'Move up', () => move(-1), 'ghost'),
      iconButton('arrowDown', 'Move down', () => move(1), 'ghost'),
      iconButton('trash', 'Remove this button', () => ctx.update(L((s) => (s.buttons = s.buttons.filter((z) => z.id !== x.id)))), 'ghost'),
      bad ? h('span', { class: 'lb-bad tiny' }, 'Left off the page: only https://, http:// and mailto: links are used.') : null,
    );
  };

  const songs = (m.songs || []).filter((s) => s.title);
  const addressBad = li.address && !safeWebUrl(li.address);
  const spotify = safeWebUrl((b.links || {}).spotify);
  const qrBox = h('div', { class: 'lb-qr', 'data-k': 'lb-qr' });
  if (data.qr) qrBox.innerHTML = qrSVG(data.qr.url, { px: 168, title: `QR code for ${data.qr.url}` }); // our own SVG, its text escaped

  const check = (k, key, label, { disabled = false } = {}) => {
    const el = f.check(`lb-${k}`, li[key], L((s, v) => (s[key] = v)), label);
    if (disabled) el.disabled = true;
    return h('label', { class: 'lb-check' }, el, h('span', {}, label));
  };

  return h(
    'div',
    { class: 'mgr-cols lb' },
    h(
      'div',
      {},
      h(
        'section',
        { class: 'mgr-sect' },
        h('h2', {}, 'What’s on the page'),
        h('p', { class: 'muted small' }, 'One page with your latest release, next shows, merch and links, to put behind the link in your bio. It takes the name, bio, links and theme from the Press kit tab.'),
        h('div', { class: 'lb-checks' }, check('photo', 'photo', 'Profile photo'), check('release', 'release', 'Latest release'), check('socials', 'socials', 'Social links')),
        h(
          'div',
          { class: 'mgr-two' },
          f.select('lb-song', 'Release to show', li.songId, [['', 'Newest one out (automatic)'], ...songs.map((s) => [s.id, s.title])], L((s, v) => (s.songId = v))),
          f.select('lb-shows', 'Upcoming shows', String(li.shows), Array.from({ length: LINKBIO_MAX_SHOWS + 1 }, (_, i) => [String(i), i ? `Next ${i}` : 'None']), L((s, v) => (s.shows = +v))),
        ),
        h('p', { class: 'muted tiny' }, 'Shows: confirmed dates only, with their ticket links. Release: the song’s store and streaming links from its page.'),
        f.text('lb-merch', 'Merch link', li.merchUrl, L((s, v) => (s.merchUrl = v.trim())), { type: 'url', placeholder: 'https://yourband.bandcamp.com/merch' }),
        f.text('lb-bio', 'Short bio', li.bio, L((s, v) => (s.bio = v)), { rows: 3, placeholder: data.bio || 'A line or two about the band. Blank uses the first paragraph of your bio.' }),
        h(
          'label',
          { class: 'lb-check' },
          (() => {
            const el = f.check('lb-email', li.showEmail, L((s, v) => (s.showEmail = v)), 'Show the booking email');
            if (!b.contactEmail) el.disabled = true;
            return el;
          })(),
          h('span', {}, b.contactEmail ? `Show the booking email (${b.contactEmail})` : 'Show the booking email (add one under Booking contact on the Press kit tab)'),
        ),
        h('p', { class: 'muted tiny' }, 'Nothing else from your contacts, fans, members or notes goes on this page.'),
      ),
      h(
        'section',
        { class: 'mgr-sect' },
        h('h2', {}, 'Your link buttons'),
        h('p', { class: 'muted small' }, 'Pre-saves, a new video, a fundraiser… The first one is drawn in your accent colour.'),
        h('div', { class: 'lb-btns', 'data-k': 'lb-btns' }, li.buttons.map(btnRow)),
        li.buttons.length < LINKBIO_MAX_BUTTONS ? button('Add a button', () => ctx.update(L((s) => s.buttons.push({ id: mid('lb'), label: '', url: '' }))), { iconName: 'plus', variant: 'sm ghost' }) : h('p', { class: 'muted tiny' }, `Up to ${LINKBIO_MAX_BUTTONS} buttons.`),
      ),
      h(
        'section',
        { class: 'mgr-sect' },
        h('h2', {}, 'Look'),
        f.select('lb-mode', 'Background', li.mode, [['dark', 'Dark'], ['light', 'Light']], L((s, v) => (s.mode = v))),
        h('p', { class: 'muted tiny' }, 'The colours come from the theme under Branding for promos on the Press kit tab.'),
      ),
      h(
        'section',
        { class: 'mgr-sect' },
        h('h2', {}, 'Put it online'),
        h(
          'ol',
          { class: 'lb-steps small' },
          h('li', {}, 'Download the page. It is one HTML file with the photos inside it.'),
          h('li', {}, 'Upload that file to any free static host, for example GitHub Pages, Netlify Drop or Cloudflare Pages. The host needs its own free account; this app has none and uploads nothing.'),
          h('li', {}, 'Copy the address the host gives you and paste it below. The app can’t know that address by itself.'),
          h('li', {}, 'Put the address in your bio. When you change something here, download and upload the file again: nothing updates by itself.'),
        ),
        f.text('lb-address', 'Page address', li.address, L((s, v) => (s.address = v.trim())), { type: 'url', placeholder: 'https://yourband.netlify.app', hint: addressBad ? 'That doesn’t look like a web address (it must start with https:// or http://).' : '' }),
        h(
          'div',
          { class: 'lb-qr-wrap' },
          qrBox,
          h(
            'div',
            {},
            h('strong', {}, 'QR code'),
            data.qr
              ? h('p', { class: 'muted tiny', 'data-k': 'lb-qr-for' }, data.qr.kind === 'spotify' ? `Points at your Spotify link: ${data.qr.url}` : `Points at ${data.qr.url}`)
              : h('p', { class: 'muted tiny', 'data-k': 'lb-qr-for' }, 'Paste the page address above to get a QR code for it.'),
            !safeWebUrl(li.address) ? h('label', { class: 'lb-check' }, (() => {
              const el = f.check('lb-qr-spotify', li.qrSpotify, L((s, v) => (s.qrSpotify = v)), 'Use the Spotify link for the QR code until then');
              if (!spotify) el.disabled = true;
              return el;
            })(), h('span', {}, spotify ? 'Until then, use the Spotify link for the QR code' : 'Add a Spotify link on the Press kit tab to use it for the QR code')) : null,
            h('p', { class: 'muted tiny' }, 'It is on the page and on the flyer. Test it with your phone’s camera before you print.'),
            h('div', { class: 'row' }, button('Download QR (SVG)', saveQr, { iconName: 'download', variant: 'sm', disabled: !data.qr }), button('Print flyer', flyer, { iconName: 'print', variant: 'sm', disabled: !data.qr, title: 'A one-page flyer with the QR code; pick “Save as PDF” as the printer for a PDF' })),
          ),
        ),
      ),
    ),
    h(
      'div',
      {},
      h(
        'section',
        { class: 'mgr-sect lb-prev' },
        h('div', { class: 'lb-prev-head' }, h('h2', {}, 'Preview'), button('Download .html', save, { iconName: 'download', variant: 'sm primary' })),
        preview,
        h('p', { class: 'muted tiny' }, 'The file has no scripts and loads nothing from the internet. ', sizeNote),
      ),
    ),
  );
}
