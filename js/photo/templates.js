// Photo Studio templates. Each one builds a ready design from the band, a song, a show or a tour
// and a photo, in the band's theme colours and font. Everything stays editable afterwards.
import { newDoc, newLayer, slidesForImage } from './model.js';

const DEFAULT_COLORS = { bg: '#0b0b0f', deep: '#2a2a35', accent: '#ffd400', light: '#f4f1ea' };

/** Whole days from `today` to `date` (both yyyy-mm-dd); null when either is missing. */
export function daysUntil(date, today) {
  if (!date || !today) return null;
  const a = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const b = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
  return Math.round((b - a) / 86400000);
}
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
/** "2026-04-03" → "FRI APR 3". */
export function shortDate(iso, { weekday = true } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '';
  const d = new Date(`${iso}T12:00:00`);
  return `${weekday ? `${DAYS[d.getDay()]} ` : ''}${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
/** The release-day word from today: TODAY, TOMORROW, FRIDAY (this week), or the date. */
export function releaseWhen(date, today) {
  const k = daysUntil(date, today);
  if (k == null) return 'SOON';
  if (k <= 0) return 'NOW';
  if (k === 1) return 'TOMORROW';
  if (k < 7) return ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][new Date(`${date}T12:00:00`).getDay()];
  return shortDate(date, { weekday: false });
}

// ---------------------------------------------------------------- layer helpers
const photoLayer = (doc, photo, o = {}) => newLayer('image', doc, { name: 'Photo', mediaId: photo ? photo.id : null, ...o });
const text = (doc, t, o = {}) => {
  const L = newLayer('text', doc, { text: t, name: o.name || t.split('\n')[0].slice(0, 24) || 'Text', ...o });
  L.h = o.h || Math.round(L.size * (L.lineHeight || 1.05) * (String(t).split('\n').length) + L.size * 0.2);
  return L;
};
const fade = (doc, o = {}) => newLayer('gradient', doc, { name: 'Shade', from: '#000000', fromAlpha: 0, to: '#000000', toAlpha: 0.9, angle: 180, mid: 0.55, ...o });
const box = (doc, o = {}) => newLayer('shape', doc, { name: 'Box', ...o });

function common(ctx) {
  const c = { ...DEFAULT_COLORS, ...(ctx.colors || {}) };
  return { c, font: ctx.font || 'Bebas Neue', band: (ctx.band && ctx.band.name) || 'Your Band' };
}
function logoOrName(doc, ctx, { y, h, size }) {
  const { c, font, band } = common(ctx);
  if (ctx.logo && ctx.logo.id) {
    const ar = ctx.logo.w && ctx.logo.h ? ctx.logo.w / ctx.logo.h : 3;
    const w = Math.min(doc.w * 0.6, h * ar);
    return newLayer('image', doc, { name: 'Logo', mediaId: ctx.logo.id, fit: 'contain', x: Math.round((doc.w - w) / 2), y, w: Math.round(w), h });
  }
  return text(doc, band.toUpperCase(), { name: 'Band', font, size, color: c.light, y, x: Math.round(doc.w * 0.06), w: Math.round(doc.w * 0.88) });
}

// ---------------------------------------------------------------- the templates
export const TEMPLATES = [
  {
    id: 'carousel',
    label: 'Continuous carousel',
    blurb: 'One wide photo across 2–10 slides, so it flows when people swipe. Slide 1 has the hook.',
    needs: 'photo',
    build(ctx) {
      const { c, font, band } = common(ctx);
      const k = ctx.slides || slidesForImage(ctx.photo?.w, ctx.photo?.h);
      const doc = newDoc({ size: 'post', slides: k, name: `${band} carousel` });
      const sw = doc.w / k;
      const L = [photoLayer(doc, ctx.photo, { name: 'Wide photo' })];
      L.push(fade(doc, { name: 'Shade at the bottom', toAlpha: 0.75, mid: 0.6 }));
      // a line that runs across every seam, so the swipe feels continuous
      L.push(box(doc, { name: 'Running line', shape: 'line', x: Math.round(sw * 0.08), y: Math.round(doc.h * 0.86), w: Math.round(doc.w - sw * 0.16), h: 10, fill: c.accent, strokeW: 10 }));
      L.push(text(doc, ctx.hook || (ctx.song ? `“${ctx.song.title}”` : band.toUpperCase()), { name: 'Hook', font, size: 150, color: c.light, align: 'left', x: Math.round(sw * 0.08), y: Math.round(doc.h * 0.62), w: Math.round(sw * 0.84), shadow: { on: true, color: '#000000', blur: 30, x: 0, y: 6 } }));
      L.push(text(doc, 'SWIPE →', { name: 'Swipe hint', font: 'Inter', weight: 800, size: 36, letter: 6, color: c.accent, align: 'left', x: Math.round(sw * 0.08), y: Math.round(doc.h * 0.9), w: Math.round(sw * 0.6) }));
      L.push(text(doc, ctx.song ? (ctx.song.releaseDate && daysUntil(ctx.song.releaseDate, ctx.today) > 0 ? `OUT ${releaseWhen(ctx.song.releaseDate, ctx.today)}` : 'OUT NOW') : 'LINK IN BIO', { name: 'Last slide', font, size: 120, color: c.light, align: 'right', x: Math.round(doc.w - sw * 0.92), y: Math.round(doc.h * 0.7), w: Math.round(sw * 0.84) }));
      doc.layers = L;
      return doc;
    },
  },
  {
    id: 'promo',
    label: 'Promotional image',
    blurb: 'The cover or a band photo, the song title big, and where to listen. For the feed.',
    needs: 'photo',
    build(ctx) {
      const { c, font, band } = common(ctx);
      const doc = newDoc({ size: 'post', name: `${ctx.song?.title || band} promo` });
      doc.bg = c.bg;
      const art = Math.round(doc.w * 0.74);
      doc.layers = [
        photoLayer(doc, ctx.photo, { name: 'Background', adjust: { brightness: 45, contrast: 110, saturate: 70, hue: 0, blur: 30, grayscale: 0, sepia: 0, invert: 0 } }),
        photoLayer(doc, ctx.photo, { name: 'Artwork', x: Math.round((doc.w - art) / 2), y: Math.round(doc.h * 0.1), w: art, h: art, shadow: { on: true, color: '#000000', blur: 60, x: 0, y: 24 } }),
        text(doc, 'NEW SINGLE', { name: 'Kicker', font: 'Inter', weight: 800, size: 38, letter: 10, color: c.accent, y: Math.round(doc.h * 0.7) }),
        text(doc, (ctx.song?.title || 'Song title').toUpperCase(), { name: 'Title', font, size: 120, color: c.light, y: Math.round(doc.h * 0.74) }),
        text(doc, `${band} · ${ctx.song?.releaseDate && daysUntil(ctx.song.releaseDate, ctx.today) > 0 ? `out ${releaseWhen(ctx.song.releaseDate, ctx.today).toLowerCase()}` : 'out now'} everywhere`, { name: 'Line', font: 'Inter', weight: 600, size: 34, color: c.light, y: Math.round(doc.h * 0.85), opacity: 0.85 }),
        text(doc, 'SPOTIFY · APPLE MUSIC · YOUTUBE · BANDCAMP', { name: 'Platforms', font: 'Inter', weight: 700, size: 24, letter: 3, color: c.light, y: Math.round(doc.h * 0.91), opacity: 0.6 }),
      ];
      return doc;
    },
  },
  {
    id: 'release',
    label: 'Release notification',
    blurb: '“Out Friday” for the story: the day, the title, the cover, and room for a link sticker.',
    needs: 'photo',
    build(ctx) {
      const { c, font, band } = common(ctx);
      const doc = newDoc({ size: 'story', name: `${ctx.song?.title || band} release` });
      doc.bg = c.bg;
      const when = ctx.song ? releaseWhen(ctx.song.releaseDate, ctx.today) : 'FRIDAY';
      const art = Math.round(doc.w * 0.78);
      doc.layers = [
        photoLayer(doc, ctx.photo, { name: 'Background', adjust: { brightness: 40, contrast: 115, saturate: 60, hue: 0, blur: 40, grayscale: 0, sepia: 0, invert: 0 } }),
        logoOrName(doc, ctx, { y: Math.round(doc.h * 0.06), h: 140, size: 90 }),
        text(doc, when === 'NOW' ? 'OUT NOW' : `OUT ${when}`, { name: 'When', font, size: 190, color: c.accent, y: Math.round(doc.h * 0.16) }),
        photoLayer(doc, ctx.photo, { name: 'Artwork', x: Math.round((doc.w - art) / 2), y: Math.round(doc.h * 0.3), w: art, h: art, shadow: { on: true, color: '#000000', blur: 70, x: 0, y: 30 } }),
        text(doc, `“${ctx.song?.title || 'Song title'}”`, { name: 'Title', font, size: 120, color: c.light, y: Math.round(doc.h * 0.74) }),
        ctx.song?.releaseDate ? text(doc, shortDate(ctx.song.releaseDate), { name: 'Date', font: 'Inter', weight: 700, size: 40, letter: 8, color: c.light, y: Math.round(doc.h * 0.82), opacity: 0.8 }) : null,
        box(doc, { name: 'Link sticker space', x: Math.round(doc.w * 0.2), y: Math.round(doc.h * 0.87), w: Math.round(doc.w * 0.6), h: 110, fill: c.light, fillOn: false, stroke: c.light, strokeW: 4, radius: 0.5, opacity: 0.5 }),
        text(doc, 'PRE-SAVE ↓', { name: 'Pre-save', font: 'Inter', weight: 800, size: 34, letter: 6, color: c.light, y: Math.round(doc.h * 0.89), opacity: 0.8 }),
      ].filter(Boolean);
      return doc;
    },
  },
  {
    id: 'countdown',
    label: 'Countdown to release',
    blurb: 'A big number of days to go. “Make the whole countdown” adds 7, 3 and 1 days and release day.',
    needs: 'photo',
    build(ctx) {
      const { c, font, band } = common(ctx);
      const days = ctx.days ?? Math.max(0, daysUntil(ctx.song?.releaseDate, ctx.today) ?? 7);
      const doc = newDoc({ size: 'story', name: `${ctx.song?.title || band} · ${days ? `${days} day${days === 1 ? '' : 's'}` : 'out now'}` });
      doc.bg = c.bg;
      doc.layers = [
        photoLayer(doc, ctx.photo, { name: 'Photo', adjust: { brightness: 70, contrast: 120, saturate: 80, hue: 0, blur: 0, grayscale: 0, sepia: 0, invert: 0 } }),
        fade(doc, { name: 'Shade', toAlpha: 0.85, mid: 0.4 }),
        logoOrName(doc, ctx, { y: Math.round(doc.h * 0.07), h: 130, size: 80 }),
        text(doc, days ? String(days) : 'OUT', { name: 'Number', font, size: 620, color: c.accent, y: Math.round(doc.h * 0.36), lineHeight: 0.9, shadow: { on: true, color: '#000000', blur: 40, x: 0, y: 10 } }),
        text(doc, days ? (days === 1 ? 'DAY TO GO' : 'DAYS TO GO') : 'NOW', { name: 'Days to go', font, size: 130, color: c.light, y: Math.round(doc.h * 0.66) }),
        text(doc, `“${ctx.song?.title || 'Song title'}”${ctx.song?.releaseDate ? ` · ${shortDate(ctx.song.releaseDate, { weekday: false })}` : ''}`, { name: 'Song', font: 'Inter', weight: 700, size: 44, color: c.light, y: Math.round(doc.h * 0.76), opacity: 0.9 }),
      ];
      return doc;
    },
  },
  {
    id: 'show',
    label: 'Show poster',
    blurb: 'A gig poster: the band, the date, the room, the bill and the ticket price.',
    needs: 'show',
    build(ctx) {
      const { c, font, band } = common(ctx);
      const s = ctx.show || {};
      const doc = newDoc({ size: ctx.size || 'poster', name: `${s.venue || band} poster` });
      doc.bg = c.bg;
      const W = doc.w;
      const H = doc.h;
      const k = W / 1800;
      const others = (s.lineup || []).map((b) => b.name).filter((x) => x && x.toLowerCase() !== band.toLowerCase());
      doc.layers = [
        photoLayer(doc, ctx.photo, { name: 'Photo', h: Math.round(H * 0.62), mask: { type: 'fadeDown', invert: false, feather: 0.45, x: 0, y: 0, w: 1, h: 1 }, adjust: { brightness: 90, contrast: 130, saturate: 60, hue: 0, blur: 0, grayscale: 0, sepia: 0, invert: 0 } }),
        logoOrName(doc, ctx, { y: Math.round(H * 0.5), h: Math.round(260 * k), size: Math.round(300 * k) }),
        others.length ? text(doc, `WITH ${others.join(' · ').toUpperCase()}`, { name: 'Lineup', font, size: Math.round(90 * k), color: c.light, y: Math.round(H * 0.64), x: Math.round(W * 0.06), w: Math.round(W * 0.88) }) : null,
        box(doc, { name: 'Date bar', x: 0, y: Math.round(H * 0.76), w: W, h: Math.round(H * 0.12), fill: c.accent }),
        text(doc, shortDate(s.date) || 'DATE TBA', { name: 'Date', font, size: Math.round(190 * k), color: c.bg, y: Math.round(H * 0.776) }),
        text(doc, [s.venue, s.city].filter(Boolean).join(' · ').toUpperCase() || 'VENUE · CITY', { name: 'Venue', font, size: Math.round(110 * k), color: c.light, y: Math.round(H * 0.9) }),
        text(doc, [s.doors && `DOORS ${s.doors}`, s.price && String(s.price).toUpperCase(), s.ages].filter(Boolean).join(' · ') || 'DOORS 7PM · TICKETS AT THE LINK', { name: 'Details', font: 'Inter', weight: 700, size: Math.round(44 * k), letter: 4, color: c.light, y: Math.round(H * 0.95), opacity: 0.8 }),
      ].filter(Boolean);
      return doc;
    },
  },
  {
    id: 'tour',
    label: 'Tour dates',
    blurb: 'Every date and city in a list, from a tour or your upcoming shows.',
    needs: 'dates',
    build(ctx) {
      const { c, font, band } = common(ctx);
      const dates = (ctx.dates || []).slice(0, 14);
      const doc = newDoc({ size: 'post', name: `${ctx.tourName || band} dates` });
      doc.bg = c.bg;
      const top = 0.3;
      const step = Math.min(0.06, (0.62) / Math.max(1, dates.length));
      const size = Math.round(Math.min(64, doc.h * step * 0.8));
      doc.layers = [
        photoLayer(doc, ctx.photo, { name: 'Photo', adjust: { brightness: 35, contrast: 120, saturate: 40, hue: 0, blur: 6, grayscale: 0, sepia: 0, invert: 0 } }),
        logoOrName(doc, ctx, { y: Math.round(doc.h * 0.05), h: 150, size: 120 }),
        text(doc, (ctx.tourName || 'TOUR DATES').toUpperCase(), { name: 'Tour name', font, size: 90, color: c.accent, y: Math.round(doc.h * 0.18) }),
        ...dates.flatMap((d, i) => [
          text(doc, shortDate(d.date, { weekday: false }) || 'TBA', { name: `Date ${i + 1}`, font, size, color: c.accent, align: 'left', x: Math.round(doc.w * 0.1), w: Math.round(doc.w * 0.25), y: Math.round(doc.h * (top + i * step)) }),
          text(doc, [d.city, d.venue].filter(Boolean).join(' · ').toUpperCase(), { name: `Place ${i + 1}`, font, size, color: c.light, align: 'left', x: Math.round(doc.w * 0.36), w: Math.round(doc.w * 0.6), y: Math.round(doc.h * (top + i * step)) }),
        ]),
        text(doc, 'TICKETS · LINK IN BIO', { name: 'Tickets', font: 'Inter', weight: 800, size: 30, letter: 6, color: c.light, y: Math.round(doc.h * 0.93), opacity: 0.8 }),
      ];
      return doc;
    },
  },
  {
    id: 'lyric',
    label: 'Lyric card',
    blurb: 'One line from the song over a moody photo, for a quote post.',
    needs: 'photo',
    build(ctx) {
      const { c, font, band } = common(ctx);
      const doc = newDoc({ size: 'square', name: `${ctx.song?.title || band} lyric` });
      doc.bg = c.bg;
      doc.layers = [
        photoLayer(doc, ctx.photo, { name: 'Photo', adjust: { brightness: 55, contrast: 125, saturate: 0, hue: 0, blur: 0, grayscale: 100, sepia: 0, invert: 0 } }),
        text(doc, (ctx.line || 'A line from the song that hits').toUpperCase(), { name: 'Lyric', font, size: 110, color: c.light, y: Math.round(doc.h * 0.36), x: Math.round(doc.w * 0.08), w: Math.round(doc.w * 0.84), lineHeight: 1 }),
        box(doc, { name: 'Rule', shape: 'line', x: Math.round(doc.w * 0.42), y: Math.round(doc.h * 0.78), w: Math.round(doc.w * 0.16), h: 8, fill: c.accent }),
        text(doc, `${band.toUpperCase()} · “${(ctx.song?.title || 'SONG').toUpperCase()}”`, { name: 'Credit', font: 'Inter', weight: 800, size: 30, letter: 5, color: c.light, y: Math.round(doc.h * 0.82), opacity: 0.85 }),
      ];
      return doc;
    },
  },
  {
    id: 'thumb',
    label: 'YouTube thumbnail',
    blurb: 'Big readable words and a face: what works at thumbnail size.',
    needs: 'photo',
    build(ctx) {
      const { c, font, band } = common(ctx);
      const doc = newDoc({ size: 'thumb', name: `${ctx.song?.title || band} thumbnail` });
      doc.bg = c.bg;
      doc.layers = [
        photoLayer(doc, ctx.photo, { name: 'Photo', adjust: { brightness: 95, contrast: 130, saturate: 120, hue: 0, blur: 0, grayscale: 0, sepia: 0, invert: 0 } }),
        newLayer('gradient', doc, { name: 'Shade', from: '#000000', fromAlpha: 0.9, to: '#000000', toAlpha: 0, angle: 90, mid: 0.5 }),
        text(doc, (ctx.song?.title || 'SONG TITLE').toUpperCase(), { name: 'Title', font, size: 170, color: c.light, align: 'left', x: 60, w: 700, y: 180, stroke: { on: true, color: '#000000', width: 6 }, lineHeight: 0.95 }),
        text(doc, 'OFFICIAL VIDEO', { name: 'Tag', font: 'Inter', weight: 900, size: 42, letter: 4, color: c.bg, align: 'left', x: 60, w: 500, y: 560, bg: { on: true, color: c.accent, pad: 0.35, radius: 0.15 } }),
      ];
      return doc;
    },
  },
];
export const templateById = (id) => TEMPLATES.find((t) => t.id === id) || null;

/** The countdown set: 7, 3 and 1 days before, and release day (only the ones still ahead). */
export function countdownSet(ctx) {
  const left = daysUntil(ctx.song?.releaseDate, ctx.today);
  const want = [7, 3, 1, 0].filter((d) => left == null || d <= left);
  return want.map((days) => templateById('countdown').build({ ...ctx, days }));
}
