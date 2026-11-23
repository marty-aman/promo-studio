// The Link page: one self-contained, script-free HTML file with the band's latest release, next
// shows, merch, socials and your own link buttons, to host anywhere as a "link in bio" page. Plus
// its QR code and a printable flyer. Pure functions, unit tested in test/linkbio.test.js.
//
// Privacy by construction: linkPageData() copies ONLY the named public fields below into a plain
// object, and the HTML is built from that object alone. Fans, contacts, bandmates, notes, phone
// numbers and outreach never reach it; the booking email does only when "show contact email" is on.
import { niceDate, isoDate } from './model.js';
import { EPK_LINKS, shortBio } from './extras.js';
import { coverOf } from './releases.js';
import { esc } from './pdf.js';
import { themeById, mix } from '../themes.js';
import { qrSVG } from './qr.js';
import { normalizeLinkInBio, newLinkInBio } from './linkbio-norm.js';

export { normalizeLinkInBio, newLinkInBio };
export const LINKBIO_TARGET_BYTES = 200 * 1024;

/** A link the page may carry: https, http or mailto, with nothing that could break out of an attribute. */
export function safeHref(u) {
  const s = String(u ?? '').trim();
  if (/^https?:\/\/[^\s"'<>`\\]+$/i.test(s)) return s;
  if (/^mailto:[^\s"'<>`\\:/]+@[^\s"'<>`\\]+$/i.test(s)) return s;
  return '';
}
/** A web address for the QR code and the "Page address" field: https or http only. */
export const safeWebUrl = (u) => (/^https?:\/\//i.test(String(u ?? '').trim()) ? safeHref(u) : '');
const safeImg = (u) => (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(u || '') ? u : '');
const isEmail = (s) => /^[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+$/.test(s || '');

export const STORE_LINKS = [['spotify', 'Spotify'], ['apple', 'Apple Music'], ['youtube', 'YouTube'], ['youtubeMusic', 'YouTube Music'], ['bandcamp', 'Bandcamp'], ['deezer', 'Deezer'], ['tidal', 'TIDAL'], ['amazon', 'Amazon Music'], ['soundcloud', 'SoundCloud']];

/** The release the page shows: the one picked, else the newest one out, else the next one coming. */
export function linkRelease(m, today, songId = '') {
  const songs = (m.songs || []).filter((s) => s && s.title);
  if (songId) {
    const s = songs.find((x) => x.id === songId);
    if (s) return s;
  }
  const out = songs.filter((s) => s.status === 'released' || (s.releaseDate && s.releaseDate <= today)).sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || ''));
  if (out.length) return out[0];
  return songs.filter((s) => s.releaseDate && s.releaseDate > today).sort((a, b) => a.releaseDate.localeCompare(b.releaseDate))[0] || null;
}

/** What the QR code points at: the page address, else (if ticked) the Spotify link, else nothing. */
export function qrTarget(band, li = normalizeLinkInBio(band.linkInBio)) {
  const a = safeWebUrl(li.address);
  if (a) return { url: a, kind: 'address' };
  const sp = safeWebUrl((band.links || {}).spotify);
  if (li.qrSpotify && sp) return { url: sp, kind: 'spotify' };
  return null;
}

/** The page's colours: the band's theme (Blood & Ash when none), dark or light. */
export function linkColors(band, mode = 'dark') {
  const c = (themeById(band.theme || '') || themeById('bloodash')).colors;
  if (mode === 'light') return { bg: mix(c.light, '#ffffff', 0.6), card: '#ffffff', text: mix(c.bg, '#000000', 0.3), muted: mix(c.bg, '#ffffff', 0.4), accent: mix(c.accent, '#000000', 0.25), onAccent: '#ffffff', line: mix(c.light, '#000000', 0.15) };
  return { bg: c.bg, card: mix(c.bg, c.deep, 0.55), text: c.light, muted: mix(c.light, c.bg, 0.4), accent: c.accent, onAccent: '#ffffff', line: mix(c.bg, c.light, 0.18) };
}

/**
 * Only the public fields the page shows, copied by name from the manager. This object is all the
 * HTML builders see. `today` decides which release and shows count.
 */
export function linkPageData(m, { today = isoDate(new Date()) } = {}) {
  const b = m.band || {};
  const li = normalizeLinkInBio(b.linkInBio);
  const song = li.release ? linkRelease(m, today, li.songId) : null;
  const shows = (m.shows || [])
    .filter((s) => s && s.status === 'confirmed' && s.date >= today)
    .sort((x, y) => x.date.localeCompare(y.date))
    .slice(0, li.shows)
    .map((s) => ({ date: s.date, venue: String(s.venue || 'TBA'), city: String(s.city || ''), tickets: safeHref(s.tickets) }));
  return {
    name: String(b.name || 'Our band'),
    tagline: [b.genres, b.city].filter(Boolean).map(String).join(' · '),
    bio: (li.bio || shortBio(b.bio || '', 280)).trim(),
    release: song ? { title: String(song.title), date: song.releaseDate || '', upcoming: !!(song.releaseDate && song.releaseDate > today && song.status !== 'released'), links: STORE_LINKS.map(([k, l]) => [l, safeHref((song.links || {})[k])]).filter(([, u]) => u), coverId: coverOf(song, m.releases || []) } : null,
    shows,
    merch: safeHref(li.merchUrl),
    socials: li.socials ? EPK_LINKS.map(([k, l]) => [l, safeHref((b.links || {})[k])]).filter(([, u]) => u) : [],
    buttons: li.buttons.map((x) => [x.label.trim(), safeHref(x.url)]).filter(([, u]) => u).map(([l, u]) => [l || u.replace(/^(https?:\/\/|mailto:)/i, '').replace(/\/$/, ''), u]),
    email: li.showEmail && isEmail(b.contactEmail) ? String(b.contactEmail) : '',
    photoId: li.photo && b.photoId ? b.photoId : null,
    qr: qrTarget(b, li),
    address: safeWebUrl(li.address),
    mode: li.mode,
    colors: linkColors(b, li.mode),
  };
}

export const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; base-uri 'none'; form-action 'none'";
const A = (href, text, cls = '') => `<a${cls ? ` class="${cls}"` : ''} href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
const day = (iso) => esc(niceDate(iso));

/**
 * The page as one HTML file: no script, a Content-Security-Policy that blocks everything but inline
 * styles and images, every text escaped, every link allow-listed. `cover` and `photo` are small
 * image data URLs (anything else is dropped); `withQr` adds the QR code at the bottom.
 */
export function linkPageHTML(d, { cover = null, photo = null, withQr = true } = {}) {
  const c = d.colors;
  const img = safeImg(photo);
  const cov = safeImg(cover);
  const qr = withQr && d.qr ? qrSVG(d.qr.url, { px: 132, title: `QR code for ${d.qr.url}` }) : '';
  const css = `*{box-sizing:border-box}body{margin:0;background:${c.bg};color:${c.text};font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}main{max-width:520px;margin:0 auto;padding:36px 18px 48px;text-align:center}
.pic{width:112px;height:112px;border-radius:50%;object-fit:cover;display:block;margin:0 auto 14px;border:3px solid ${c.accent}}h1{font-size:30px;line-height:1.1;margin:0 0 4px;letter-spacing:.01em}.tag{color:${c.muted};margin:0 0 12px;font-size:14px}.bio{margin:0 auto 20px;max-width:440px}
h2{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:${c.accent};margin:26px 0 10px}.btn{display:block;margin:0 0 10px;padding:13px 16px;border-radius:12px;background:${c.card};border:1px solid ${c.line};color:${c.text};text-decoration:none;font-weight:600}.btn:hover,.btn:focus{border-color:${c.accent}}.btn.main{background:${c.accent};border-color:${c.accent};color:${c.onAccent}}
.rel{background:${c.card};border:1px solid ${c.line};border-radius:16px;padding:14px;margin:0 0 10px}.rel img{width:100%;max-width:240px;aspect-ratio:1;object-fit:cover;border-radius:10px;display:block;margin:0 auto 10px}.rel strong{font-size:19px;display:block}.rel .when{color:${c.muted};font-size:13px;margin:0 0 10px}.chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}.chips a{padding:7px 12px;border-radius:99px;border:1px solid ${c.line};color:${c.text};text-decoration:none;font-size:14px}.chips a:hover,.chips a:focus{border-color:${c.accent}}
ul.shows{list-style:none;padding:0;margin:0;text-align:left}ul.shows li{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid ${c.line}}ul.shows .d{font-weight:700;white-space:nowrap}ul.shows .v{flex:1;min-width:0}ul.shows .v small{display:block;color:${c.muted}}ul.shows a{color:${c.accent};font-weight:700;white-space:nowrap}
.qr{margin:28px auto 0;display:inline-block;padding:8px;background:#fff;border-radius:10px}.qr svg{display:block}.foot{color:${c.muted};font-size:12px;margin-top:26px}a{color:${c.accent}}`;
  const parts = [];
  if (img) parts.push(`<img class="pic" src="${img}" alt="${esc(d.name)}">`);
  parts.push(`<h1>${esc(d.name)}</h1>`);
  if (d.tagline) parts.push(`<p class="tag">${esc(d.tagline)}</p>`);
  if (d.bio) parts.push(`<p class="bio">${esc(d.bio)}</p>`);
  if (d.release) {
    const r = d.release;
    const when = r.date ? `${r.upcoming ? 'Out ' : ''}${esc(niceDate(r.date, { weekday: false }))}` : '';
    parts.push(`<h2>${r.upcoming ? 'New release' : 'Latest release'}</h2><div class="rel">${cov ? `<img src="${cov}" alt="${esc(r.title)} cover art">` : ''}<strong>${esc(r.title)}</strong>${when ? `<p class="when">${when}</p>` : ''}${r.links.length ? `<div class="chips">${r.links.map(([l, u]) => A(u, l)).join('')}</div>` : ''}</div>`);
  }
  if (d.buttons.length || d.merch) parts.push(`<h2>Links</h2>${d.buttons.map(([l, u], i) => A(u, l, i === 0 ? 'btn main' : 'btn')).join('')}${d.merch ? A(d.merch, 'Merch', d.buttons.length ? 'btn' : 'btn main') : ''}`);
  if (d.shows.length) parts.push(`<h2>Upcoming shows</h2><ul class="shows">${d.shows.map((s) => `<li><span class="d">${day(s.date)}</span><span class="v">${esc(s.venue)}${s.city ? `<small>${esc(s.city)}</small>` : ''}</span>${s.tickets ? A(s.tickets, 'Tickets') : ''}</li>`).join('')}</ul>`);
  if (d.socials.length) parts.push(`<h2>Follow</h2><div class="chips">${d.socials.map(([l, u]) => A(u, l)).join('')}</div>`);
  if (d.email) parts.push(`<h2>Contact</h2><p>${A(`mailto:${d.email}`, d.email)}</p>`);
  if (qr) parts.push(`<div class="qr">${qr}</div>`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${esc(d.name)}</title><style>${css}</style></head><body><main>
${parts.join('\n')}
<p class="foot">${esc(d.name)}</p>
</main></body></html>`;
}

/** A one-page printable flyer: name, photo, the big QR code and the address under it, next shows. */
export function flyerHTML(d, { photo = null } = {}) {
  const img = safeImg(photo);
  const qr = d.qr ? qrSVG(d.qr.url, { px: 300, title: `QR code for ${d.qr.url}` }) : '';
  const label = d.qr ? (d.qr.kind === 'spotify' ? 'Listen on Spotify' : 'All our links') : '';
  const css = `@page{margin:16mm}*{box-sizing:border-box}body{margin:0;font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:#111;background:#fff;text-align:center}main{padding:10mm 0}h1{font-size:44px;line-height:1.05;margin:8px 0 6px}.tag{color:#555;margin:0 0 18px}.pic{width:150px;height:150px;border-radius:50%;object-fit:cover}.qr{display:inline-block;margin:10px 0 4px}.qr svg{display:block}.lbl{font-size:20px;font-weight:700;margin:8px 0 2px}.addr{font:14px ui-monospace,Menlo,monospace;word-break:break-all;color:#333;margin:0 0 20px}ul{list-style:none;padding:0;margin:8px auto;max-width:440px;text-align:left}li{padding:5px 0;border-bottom:1px solid #ccc}h2{font-size:13px;letter-spacing:.12em;text-transform:uppercase;margin:22px 0 4px}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><title>${esc(d.name)} flyer</title><style>${css}</style></head><body><main>
${img ? `<img class="pic" src="${img}" alt="">` : ''}<h1>${esc(d.name)}</h1>${d.tagline ? `<p class="tag">${esc(d.tagline)}</p>` : ''}
${qr ? `<div class="qr">${qr}</div><p class="lbl">${esc(label)}</p><p class="addr">${esc(d.qr.url)}</p>` : ''}
${d.release ? `<h2>${d.release.upcoming ? 'New release' : 'Latest release'}</h2><p><strong>${esc(d.release.title)}</strong>${d.release.date ? ` · ${d.release.upcoming ? 'out ' : ''}${esc(niceDate(d.release.date, { weekday: false }))}` : ''}</p>` : ''}
${d.shows.length ? `<h2>Upcoming shows</h2><ul>${d.shows.map((s) => `<li><strong>${day(s.date)}</strong> · ${esc(s.venue)}${s.city ? `, ${esc(s.city)}` : ''}</li>`).join('')}</ul>` : ''}
</main></body></html>`;
}

/** The file's size in bytes (UTF-8), for the "under 200 KB" note. */
export const byteSize = (s) => new TextEncoder().encode(s).length;
