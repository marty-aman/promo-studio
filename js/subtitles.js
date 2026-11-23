// Captions: subtitle files in (.srt, .vtt) and out, caption styles, and captions made from the lyrics.
// Captions in the edit are on-screen texts marked `caption: true` (they sit on the Text row of the timeline
// and burn into the export). A caption file can also be downloaded to upload as closed captions
// (YouTube, Facebook and LinkedIn take .srt; the web takes .vtt). Pure, unit tested.
import { uid, timelineToSong } from './core.js';

/** "00:01:02,500" / "01:02.500" / "1:02.5" → seconds (NaN when it isn't a time). */
export function parseStamp(s) {
  const m = /^\s*(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?\s*$/.exec(String(s));
  if (!m) return NaN;
  const ms = m[4] ? +m[4].padEnd(3, '0') : 0;
  return (m[1] ? +m[1] * 3600 : 0) + +m[2] * 60 + +m[3] + ms / 1000;
}
const pad = (n, w = 2) => String(n).padStart(w, '0');
/** Seconds → "00:01:02,500" (SRT) or "00:01:02.500" (VTT). */
export function stamp(sec, sep = ',') {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1000, 3)}`;
}

/**
 * Parse .srt or .vtt text: [{ start, end, text }] sorted, tags (<i>, <b>, <font>, {\an8}, <c.yellow>) and
 * VTT cue settings removed, line breaks inside a cue kept as spaces.
 */
export function parseSubtitles(text) {
  const src = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const out = [];
  for (const block of src.split(/\n{2,}/)) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const at = lines.findIndex((l) => l.includes('-->'));
    if (at < 0) continue; // WEBVTT header, NOTE, STYLE, numbers on their own
    const [a, b] = lines[at].split('-->');
    const start = parseStamp(a);
    const end = parseStamp(String(b).trim().split(/\s+/)[0]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const body = lines
      .slice(at + 1)
      .join(' ')
      .replace(/<[^>]*>/g, '')
      .replace(/\{\\[^}]*\}/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (body) out.push({ start: +start.toFixed(3), end: +end.toFixed(3), text: body });
  }
  return out.sort((x, y) => x.start - y.start);
}

/** Split a long caption at word gaps so no line is over `max` characters (for the file, not the picture). */
function wrap(text, max = 42) {
  const words = String(text).split(/\s+/);
  const lines = [''];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if (cur && (cur + ' ' + w).length > max && lines.length < 2) lines.push(w);
    else lines[lines.length - 1] = cur ? `${cur} ${w}` : w;
  }
  return lines.join('\n');
}

/** Cues to a .srt file. */
export function toSRT(cues) {
  return cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${wrap(c.text)}\n`).join('\n');
}
/** Cues to a .vtt file. */
export function toVTT(cues) {
  return `WEBVTT\n\n${cues.map((c) => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${wrap(c.text).replace(/</g, '&lt;')}\n`).join('\n')}`;
}

/**
 * What's said or sung in the video, as cues in video time (0 = the start of the export): the lyrics that
 * play (moved from song time) and the captions, clipped to the video and the end card.
 * which: 'all' | 'lyrics' | 'captions'.
 */
export function videoCues(p, { which = 'all' } = {}) {
  const ecStart = p.endCard && p.endCard.enabled && p.endCard.background !== 'video' ? p.duration - p.endCard.duration : p.duration;
  const cues = [];
  if (which !== 'captions' && !(p.layerVis && p.layerVis.lyrics === false)) {
    const off = p.song ? timelineToSong(0, p.song) : 0; // song time at the start of the video
    for (const l of p.lyrics || []) {
      const start = l.start - off;
      const end = l.end - off;
      if (end <= 0 || start >= ecStart || !String(l.text || '').trim()) continue;
      const cue = { start: Math.max(0, start), end: Math.min(end, ecStart), text: l.text.trim() };
      // Auto-sync's word times (moved to video time), so word-by-word captions land on the sung words
      if (Array.isArray(l.words) && l.words.length && l.text.trim() === l.text.trimEnd()) cue.words = l.words.map((k) => ({ ...k, t: +(k.t - off).toFixed(3), ...(typeof k.end === 'number' ? { end: +(k.end - off).toFixed(3) } : {}) }));
      cues.push(cue);
    }
  }
  if (which !== 'lyrics') for (const t of p.texts || []) if (t.caption && t.end > 0 && t.start < p.duration) cues.push({ start: Math.max(0, t.start), end: Math.min(t.end, p.duration), text: t.text });
  return cues.sort((a, b) => a.start - b.start).map((c) => ({ ...c, start: +c.start.toFixed(3), end: +c.end.toFixed(3) }));
}

// ---- styles

/** How captions look: the on-screen text settings each style sets. */
export const CAPTION_STYLES = [
  ['bold', 'Bold pop', 'Big white words with a black outline that pop in, the TikTok look', { font: 'Montserrat', size: 6.2, color: '#ffffff', outline: '#000000', box: false, animation: 'pop' }],
  ['words', 'Word by word', 'Each word appears as it’s said', { font: 'Montserrat', size: 6, color: '#ffffff', outline: '#000000', box: false, animation: 'words' }],
  ['boxed', 'Boxed', 'White text on a dark box, easy to read on any footage', { font: 'Inter', size: 4.6, color: '#ffffff', outline: '#000000', box: true, boxColor: '#000000', boxOpacity: 0.72, animation: 'fade' }],
  ['highlight', 'Highlight', 'Black text on a bright box, like Reels captions', { font: 'Inter', size: 4.8, color: '#111111', outline: '#000000', box: true, boxColor: '#ffd400', boxOpacity: 1, animation: 'pop' }],
  ['subtitle', 'Film subtitle', 'Small, plain and low, like a film', { font: 'Inter', size: 3.8, color: '#ffffff', outline: '#000000', box: false, animation: 'fade' }],
];
export const captionStyle = (id) => (CAPTION_STYLES.find(([k]) => k === id) || CAPTION_STYLES[0])[3];

/**
 * Captions as on-screen texts, `y` % down the frame (in the app layout's clear area by default).
 * Replaces the edit's captions (other texts stay). Returns how many were added.
 */
export function setCaptions(d, cues, { style = 'bold', y = 72 } = {}) {
  const st = captionStyle(style);
  d.texts = (d.texts || []).filter((t) => !t.caption);
  for (const c of cues) d.texts.push({ id: uid('txt'), caption: true, captionStyle: style, text: c.text, start: c.start, end: c.end, x: 50, y, ...st, ...(c.words ? { words: c.words } : {}) });
  return cues.length;
}

/** Change every caption to style `id` (keeping their words, times and place). */
export function styleCaptions(d, id) {
  const st = captionStyle(id);
  let n = 0;
  for (const t of d.texts || []) if (t.caption) (Object.assign(t, st, { captionStyle: id }), n++);
  return n;
}

/** Shift every caption by `sec` seconds (a caption file made for a longer video, or a different start). */
export function shiftCaptions(d, sec) {
  for (const t of d.texts || []) if (t.caption) ((t.start = +Math.max(0, t.start + sec).toFixed(3)), (t.end = +Math.max(0.2, t.end + sec).toFixed(3)), t.words && (t.words = t.words.map((k) => ({ ...k, t: +(k.t + sec).toFixed(3), ...(typeof k.end === 'number' ? { end: +(k.end + sec).toFixed(3) } : {}) }))));
}

/** Where captions sit for the app layout: low in the clear area, above the caption and buttons. */
export function captionY(layoutArea) {
  if (!layoutArea) return 78;
  const [, y0, , y1] = layoutArea;
  return +((y0 + (y1 - y0) * 0.86) * 100).toFixed(1);
}
