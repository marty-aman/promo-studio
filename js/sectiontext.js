// On-screen text for exported section videos: Export → Song sections (cut, promo, music video) and Batch export.
// One setting per song, kept in the edit (p.sectionText[songId], so it is in project files, backups and undo) and
// remembered in this browser for the song's next edit. Each exported file gets one text, timed from that file's
// own section start; a section can have its own text or none. No text (the default) exports exactly as before.
// Pure: works on a project (or a draft) only.

export const ST_POSITIONS = [
  ['top', 'Top', 16],
  ['middle', 'Middle', 50],
  ['bottom', 'Bottom', 74], // above the app buttons and caption of TikTok, Reels and Shorts
];

// the text layer's own looks (state.js newText is the red box)
export const ST_STYLES = [
  ['box', 'Red box', { color: '#ffffff', box: true, boxColor: '#e0182d', boxOpacity: 1 }],
  ['dark', 'Dark box', { color: '#ffffff', box: true, boxColor: '#000000', boxOpacity: 0.7 }],
  ['yellow', 'Yellow box', { color: '#111111', box: true, boxColor: '#ffd400', boxOpacity: 1 }],
  ['outline', 'Outline, no box', { color: '#ffffff', box: false, boxColor: '#000000', boxOpacity: 1 }],
];

export const ST_TOKENS = '{song}, {section}, {artist}, {date} and {countdown}';

export function defaultSectionText() {
  return {
    text: '', // '' = no text on any section
    pos: 'bottom',
    size: 8,
    style: 'box',
    color: '#ffffff',
    boxColor: '#e0182d',
    start: 0, // seconds after the section starts
    length: 0, // seconds shown; 0 = the whole section
    fadeIn: true,
    fadeOut: true,
    sections: {}, // { [sectionId]: { mode: 'own', text } | { mode: 'none' } }
  };
}

const num = (v, lo, hi, def) => (Number.isFinite(+v) && v !== '' && v !== null ? Math.min(hi, Math.max(lo, +v)) : def);
const hex = (v, def) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : def);

/** A saved setting (any age, any shape) with every field filled in and in range. */
export function cleanSectionText(raw) {
  const d = defaultSectionText();
  const r = raw && typeof raw === 'object' ? raw : {};
  const sections = {};
  for (const [id, o] of Object.entries(r.sections && typeof r.sections === 'object' ? r.sections : {})) {
    if (o && o.mode === 'none') sections[id] = { mode: 'none' };
    else if (o && o.mode === 'own') sections[id] = { mode: 'own', text: String(o.text || '').slice(0, 300) };
  }
  return {
    text: String(r.text || '').slice(0, 300),
    pos: ST_POSITIONS.some(([k]) => k === r.pos) ? r.pos : d.pos,
    size: num(r.size, 3, 18, d.size),
    style: ST_STYLES.some(([k]) => k === r.style) ? r.style : d.style,
    color: hex(r.color, d.color),
    boxColor: hex(r.boxColor, d.boxColor),
    start: num(r.start, 0, 600, d.start),
    length: num(r.length, 0, 600, d.length),
    fadeIn: r.fadeIn !== false,
    fadeOut: r.fadeOut !== false,
    sections,
  };
}

/** The edit's setting for this song, else the one remembered for the song (`remembered`), else none. */
export function sectionTextOf(p, songId, remembered = null) {
  const own = songId && p && p.sectionText && p.sectionText[songId];
  return cleanSectionText(own || remembered || null);
}

/** Change the song's setting in a project draft (one store.update = one undo step). */
export function setSectionText(d, songId, fn, remembered = null) {
  if (!songId) return null;
  const cur = sectionTextOf(d, songId, remembered);
  fn(cur);
  const next = cleanSectionText(cur);
  d.sectionText = { ...(d.sectionText && typeof d.sectionText === 'object' ? d.sectionText : {}), [songId]: next };
  return next;
}

/** The words a section shows ('' = none): its own, none, or the shared text. */
export function textForSection(cfg, sectionId) {
  const o = sectionId && cfg.sections[sectionId];
  if (o && o.mode === 'none') return '';
  if (o && o.mode === 'own') return o.text.trim();
  return cfg.text.trim();
}

/** {song}, {section} and {artist} filled in; {date} and {countdown} are left for the end card's date (ctaText at draw time). */
export function fillSectionTokens(s, { song = '', section = '', artist = '' } = {}) {
  return String(s || '')
    .replace(/\{song\}/gi, song)
    .replace(/\{section\}/gi, section)
    .replace(/\{artist\}/gi, artist)
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * The text layer for one exported section: shown from `from` + start (timeline seconds of the section's start)
 * for `length` seconds or to `to` (the section's end, before the end card). null when there is nothing to show.
 */
export function sectionTextItem(cfg, { sectionId = '', from = 0, to = 0, song = '', section = '', artist = '' } = {}) {
  const words = fillSectionTokens(textForSection(cfg, sectionId), { song, section, artist });
  if (!words) return null;
  const start = +(from + cfg.start).toFixed(3);
  const end = +Math.min(to, cfg.length > 0 ? start + cfg.length : to).toFixed(3);
  if (end - start < 0.1) return null;
  const look = (ST_STYLES.find(([k]) => k === cfg.style) || ST_STYLES[0])[2];
  return {
    id: 'section-text',
    text: words,
    start,
    end,
    x: 50,
    y: (ST_POSITIONS.find(([k]) => k === cfg.pos) || ST_POSITIONS[2])[2],
    size: cfg.size,
    font: 'Bebas Neue',
    color: cfg.color,
    outline: '#000000',
    box: look.box,
    boxColor: cfg.boxColor,
    boxOpacity: look.boxOpacity,
    animation: cfg.fadeIn ? 'fade' : 'none',
    outAnimation: cfg.fadeOut ? 'fade' : 'cut',
    outDuration: 0.4,
  };
}

/**
 * Put the section's text on a project draft about to be exported. Only adds one text (on top of the others);
 * nothing else moves. A hidden Text row is shown for it while the edit's own texts stay hidden.
 */
export function addSectionText(d, cfg, ctx) {
  if ((d.texts || []).some((t) => t.id === 'section-text')) d.texts = d.texts.filter((t) => t.id !== 'section-text'); // the last file's (Batch export reuses its draft)
  const item = sectionTextItem(cfg, ctx);
  if (!item) return null;
  if (d.layerVis && d.layerVis.text === false) {
    d.texts = (d.texts || []).map((t) => ({ ...t, disabled: true }));
    d.layerVis = { ...d.layerVis, text: true };
  }
  d.texts = [...(d.texts || []), item];
  return item;
}

// ------------------------------------------------------------ remembered per song in this browser
const KEY = 'pvm.sectiontext.v1';
export function rememberedSectionText(songId) {
  try {
    return (JSON.parse(localStorage.getItem(KEY)) || {})[songId] || null;
  } catch {
    return null;
  }
}
export function rememberSectionText(songId, cfg) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY)) || {};
    all[songId] = cfg;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* no room: it's only a convenience, the edit keeps its own */
  }
}
