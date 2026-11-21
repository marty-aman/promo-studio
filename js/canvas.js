// Spotify Canvas: the 3–8 second vertical loop that plays behind a track in Spotify's Now Playing
// view instead of the cover art. Spotify's rules (support.spotify.com/artists/article/canvas-guidelines):
// 3–8 s, 9:16, 720–1080 px tall, MP4 or JPG; no singing or lyrics (it won't sync), no fast cuts or
// intense flashing, and leave the song and artist name off (Spotify already shows them).
// These templates build the loop from your clips (or the song's cover art) so the last frame runs
// back into the first. Pure functions, unit tested.
import { uid } from './core.js';
import { GRADE_PRESETS } from './renderer.js';

const gradeOf = (id) => {
  const { label, ...rest } = GRADE_PRESETS[id] || GRADE_PRESETS.none || {};
  return { preset: id, ...rest };
};

export const CANVAS_ASPECT = 'canvas';
export const CANVAS_MIN = 3;
export const CANVAS_MAX = 8;
const TAIL = 1; // seconds of crossfade back into the opening shot for a seamless loop

/**
 * loop: 'seamless' (the end crossfades into the start), 'hardcut' (one clean cut back to the start)
 * or 'rebound' (the motion goes out and comes back, so a still loops perfectly).
 * shots: how many of your clips it uses.
 */
export const CANVAS_TEMPLATES = [
  {
    id: 'cv-seamless',
    name: 'Seamless loop',
    loop: 'seamless',
    shots: 1,
    blurb: 'One shot that runs back into itself with a soft 1-second blend, so fans can’t see where it starts. Best with something that keeps moving: waves, traffic, a crowd, smoke.',
    look: { grade: 'moody', vignette: 0.3, grain: 0.08, lightLeak: 0, scanlines: 0 },
  },
  {
    id: 'cv-cover',
    name: 'Cover art, alive',
    loop: 'rebound',
    shots: 1,
    cover: true,
    blurb: 'Your cover art breathing: a slow zoom in and back out with a warm light leak and film grain. Loops perfectly and needs no footage, so it ties the Canvas to the release.',
    look: { grade: 'none', vignette: 0.25, grain: 0.15, lightLeak: 0.35, scanlines: 0 },
    motion: 1.1,
  },
  {
    id: 'cv-push',
    name: 'Slow push',
    loop: 'hardcut',
    shots: 1,
    blurb: 'A slow push-in on one shot, then a clean cut back to the start (Spotify’s “hard cut” loop). Works for a portrait, an empty stage or a single striking image.',
    look: { grade: 'cold', vignette: 0.35, grain: 0.05, lightLeak: 0, scanlines: 0 },
    motion: 1.15,
  },
  {
    id: 'cv-super8',
    name: 'Super 8 memory',
    loop: 'seamless',
    shots: 1,
    blurb: 'Golden, grainy home-movie look with drifting light leaks that loop with the video. For tour footage, the van, backstage and summer songs.',
    look: { grade: 'golden', vignette: 0.4, grain: 0.35, lightLeak: 0.45, scanlines: 0 },
  },
  {
    id: 'cv-mono',
    name: 'Black and white',
    loop: 'rebound',
    shots: 1,
    blurb: 'High-contrast mono with a gentle zoom out and back. Moody and timeless; great on a live shot or a band portrait.',
    look: { grade: 'mono', vignette: 0.45, grain: 0.2, lightLeak: 0, scanlines: 0 },
    motion: 1.08,
  },
  {
    id: 'cv-neon',
    name: 'Neon city',
    loop: 'seamless',
    shots: 1,
    blurb: 'Cyberpunk grade, soft scanlines and a touch of colour split. For night-time city shots, lights and electronic or heavy tracks.',
    look: { grade: 'cyberpunk', vignette: 0.45, grain: 0.05, lightLeak: 0, scanlines: 0.12 },
    effects: { rgb: 0.12 },
  },
  {
    id: 'cv-montage',
    name: 'Performance montage',
    loop: 'seamless',
    shots: 4,
    blurb: 'Up to four of your clips, about two seconds each, with soft crossfades (no fast cuts) and a blend back into the first. For live and studio footage.',
    look: { grade: 'bleach', vignette: 0.3, grain: 0.1, lightLeak: 0, scanlines: 0 },
  },
];

export const canvasTemplate = (id) => CANVAS_TEMPLATES.find((t) => t.id === id) || null;
export const clampCanvasLength = (v) => Math.min(CANVAS_MAX, Math.max(CANVAS_MIN, Math.round((+v || CANVAS_MAX) * 2) / 2));

const usable = (c) => c && (c.kind === 'video' || c.kind === 'image');
const kb = (from, to) => ({ fromZoom: from, toZoom: to, fromX: 0, toX: 0, fromY: 0, toY: 0 });

/** A calm copy of a clip for the loop: no transition, exit, beat effects or audio. */
function shot(c, extra) {
  return { ...structuredClone(c), id: uid('clip'), from: c.id, transition: { type: 'none', duration: 0.4 }, exit: null, effects: {}, volume: 0, ...extra };
}

/**
 * The shots a Canvas template will use, from the project's clips, or the cover art when the template
 * is made for it (or there are no clips). Returns clips or [] when there's nothing to loop.
 */
export function canvasSources(d, t) {
  // after a first Canvas template the originals are in the backup, so switching template starts from them
  const base = d.canvas && d.canvas.backup ? d.canvas.backup.clips : d.clips;
  const clips = (base || []).filter(usable);
  const cover = d.endCard && d.endCard.coverMediaId;
  const coverClip = cover ? { id: 'cover', mediaId: cover, kind: 'image', in: 0, duration: 3, speed: 1, fit: 'cover', zoom: 1, panX: 0, panY: 0, rotate: 0, flip: false, volume: 0, filter: { preset: 'none', adjust: {} } } : null;
  if ((t.cover || !clips.length) && coverClip) return [coverClip];
  return clips.slice(0, t.shots);
}

/**
 * Build the loop's clips, `length` seconds long. `srcLen(mediaId)` is a video's length in seconds
 * (Infinity for a still). Shots are shortened when a video is too short; the result says how long
 * the loop really is.
 */
export function canvasClips(t, sources, length, srcLen = () => Infinity) {
  if (!sources.length) return { clips: [], length: 0 };
  const L = clampCanvasLength(length);
  const room = (c) => (c.kind === 'image' ? Infinity : Math.max(0, (srcLen(c.mediaId) - (c.in || 0)) / (c.speed || 1)));
  const grade = (c) => ({ ...c, grade: gradeOf(t.look.grade), effects: { ...(t.effects || {}) } });

  if (t.loop === 'rebound') {
    // out and back: the second half picks up where the first ended, the zoom returns to the start
    const half = Math.min(L, room(sources[0])) / 2;
    const a = shot(sources[0], { duration: +half.toFixed(2), kenBurns: kb(1, t.motion || 1.1) });
    const b = shot(sources[0], { duration: +half.toFixed(2), kenBurns: kb(t.motion || 1.1, 1), in: sources[0].kind === 'image' ? 0 : +((sources[0].in || 0) + half * (sources[0].speed || 1)).toFixed(3) });
    return { clips: [a, b].map(grade), length: +(half * 2).toFixed(2) };
  }
  if (t.loop === 'hardcut') {
    const len = Math.min(L, room(sources[0]));
    return { clips: [grade(shot(sources[0], { duration: +len.toFixed(2), kenBurns: kb(1, t.motion || 1.15) }))], length: +len.toFixed(2) };
  }
  // seamless: the opening shot starts TAIL seconds in; the same shot from its in-point fades in at the end,
  // so the last frame is exactly the first frame of the loop
  const n = sources.length;
  const tail = Math.min(TAIL, L / 4);
  const per = (L - tail) / n;
  const clips = sources.map((c, i) => {
    const sp = c.speed || 1;
    const skip = i === 0 && c.kind !== 'image' ? tail * sp : 0;
    const dur = Math.min(per, Math.max(0.5, room(c) - (i === 0 ? tail : 0)));
    return shot(c, { in: +((c.in || 0) + skip).toFixed(3), duration: +dur.toFixed(2), kenBurns: c.kind === 'image' ? kb(1.04, 1.04) : null, transition: i ? { type: 'crossfade', duration: Math.min(0.6, dur / 3) } : { type: 'none', duration: 0.4 } });
  });
  const first = sources[0];
  clips.push(shot(first, { in: first.in || 0, duration: +tail.toFixed(2), kenBurns: first.kind === 'image' ? kb(1.04, 1.04) : null, transition: { type: 'crossfade', duration: +tail.toFixed(2) } }));
  const total = clips.reduce((s, c) => s + c.duration, 0);
  return { clips: clips.map(grade), length: +total.toFixed(2) };
}

/**
 * Turn the project into a Spotify Canvas with template `id`: Canvas format, the loop as the video
 * track, no end card, text or lyrics (kept, just hidden), tab/drum/visualizer layers hidden,
 * Spotify's Now Playing view in the preview, and looping playback.
 * Returns { ok, length, message }.
 */
export function applyCanvas(d, id, { length = CANVAS_MAX, srcLen } = {}) {
  const t = canvasTemplate(id);
  if (!t) return { ok: false, message: 'Unknown Canvas template.' };
  const sources = canvasSources(d, t);
  if (!sources.length) return { ok: false, message: 'Add a clip or the song’s cover art first (Video tab, or the end card’s cover).' };
  const { clips, length: real } = canvasClips(t, sources, length, srcLen);
  if (!d.canvas || !d.canvas.backup) d.canvas = { backup: { aspect: d.aspect, duration: d.duration, clips: d.clips, endCard: !!d.endCard.enabled } };
  Object.assign(d.canvas, { template: id, loop: t.loop, length: clampCanvasLength(length) });
  d.aspect = CANVAS_ASPECT;
  d.clips = clips;
  d.duration = real;
  d.endCard.enabled = false;
  d.texts = [];
  d.layerVis = { ...(d.layerVis || {}), lyrics: false };
  for (const l of d.layers || []) if (['tab', 'drums', 'viz'].includes(l.type)) l.visible = false;
  Object.assign(d.look, { vignette: t.look.vignette, grain: t.look.grain, lightLeak: t.look.lightLeak, scanlines: t.look.scanlines, beatFlash: 0, letterbox: 0, loop: real, overlay: 'spotify', overlayClear: true });
  d.look.progress = { ...d.look.progress, enabled: false };
  d.template = id;
  return { ok: true, length: real, message: real < clampCanvasLength(length) - 0.05 ? `Your clip is only long enough for a ${real.toFixed(1)}-second loop.` : '' };
}

/** Put the project back the way it was before the first Canvas template. */
export function undoCanvas(d) {
  const b = d.canvas && d.canvas.backup;
  if (!b) return false;
  d.aspect = b.aspect;
  d.duration = b.duration;
  d.clips = b.clips;
  d.endCard.enabled = b.endCard;
  d.layerVis = { ...(d.layerVis || {}), lyrics: true };
  delete d.look.loop;
  if (d.look.overlay === 'spotify') d.look.overlay = 'off';
  delete d.canvas;
  d.template = null;
  return true;
}

/** How the edit measures up to Spotify's Canvas rules: [{ level: 'bad' | 'warn', text }]. */
export function canvasIssues(p, { exportHeight } = {}) {
  const out = [];
  const add = (level, text) => out.push({ level, text });
  if (p.aspect !== CANVAS_ASPECT) add('bad', 'Format isn’t Spotify Canvas (9:16, 1080 px tall). Spotify only takes vertical files 720–1080 px tall.');
  if (exportHeight && (exportHeight > 1080 || exportHeight < 720)) add('bad', `It exports ${exportHeight} px tall; Spotify needs 720–1080.`);
  if (p.duration < CANVAS_MIN - 0.01 || p.duration > CANVAS_MAX + 0.01) add('bad', `It’s ${(+p.duration).toFixed(1)} s long; a Canvas must be 3–8 seconds.`);
  if (!(p.clips || []).length) add('bad', 'No video in it yet.');
  if (p.endCard && p.endCard.enabled) add('warn', 'The end card is on. Spotify already shows the title, artist and cover, so leave it off.');
  if ((p.texts || []).length) add('warn', 'There’s text on it. Spotify suggests leaving the song and artist name off, and the bottom third is covered by the title and controls.');
  if ((p.lyrics || []).length && !(p.layerVis && p.layerVis.lyrics === false)) add('warn', 'Lyrics are showing. A Canvas loops every few seconds, so they won’t stay in sync with the song.');
  const fast = (p.clips || []).filter((c, i) => i < p.clips.length - 1 && c.duration < 1);
  if (fast.length) add('warn', 'Some shots are under a second. Spotify asks for no rapid cuts.');
  const flashy = (p.clips || []).some((c) => ['flash', 'glitch', 'whip', 'shake', 'strobe'].includes(c.transition && c.transition.type)) || (p.look && p.look.beatFlash > 0) || (p.clips || []).some((c) => c.effects && (c.effects.beatPulse || c.effects.shake || c.effects.strobe));
  if (flashy) add('warn', 'Flashes, glitches or shakes are on. Spotify asks for no intense flashing.');
  if (p.look && p.look.watermark && p.look.watermark.mediaId) add('warn', 'Your logo is on. Consider leaving it off: Spotify shows your name right below.');
  if ((p.clips || [])[0] && p.clips[0].transition && p.clips[0].transition.type === 'fade') add('warn', 'It fades in from black, so every loop blinks. Set the first clip’s transition to Hard cut.');
  return out;
}

/** Whether a project's format is the Canvas one. */
export const isCanvas = (p) => p && p.aspect === CANVAS_ASPECT;
