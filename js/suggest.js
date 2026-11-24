// Suggested edits: look at what's in the library (song, clips, Guitar Pro tracks, lyrics) and build
// three different ready-to-post edits. Each take picks the hook, cuts the clips on the beat, applies a
// fitting template, lines the tab / drum layers up with the song, and puts cut-outs on a background.
import { findHook, detectBeats, beatCutPlan, uid, formatTime } from './core.js';
import { applyTemplate, tabSources, TEMPLATES } from './templates.js';
import { isBassTrack } from './tab.js';
import { suggestBackdrops } from './backgrounds.js';
import { bestStart, isWeakTake } from './framequality.js';

const beatCache = new Map(); // song media id -> detectBeats result (or null)

/**
 * What a suggestion can work with. `mediaAll` is the media library (records with kind, duration,
 * envelope...), `p` the current project. Pure apart from caching the beat detection.
 */
export function inventory(mediaAll, p) {
  const all = mediaAll || [];
  const audio = all.filter((m) => m.kind === 'audio' && m.envelope && m.duration > 5);
  const song = (p.song && audio.find((m) => m.id === p.song.mediaId)) || audio.slice().sort((a, b) => b.duration - a.duration)[0] || null;
  const skip = new Set([p.endCard && p.endCard.coverMediaId, p.look && p.look.watermark && p.look.watermark.mediaId].filter(Boolean));
  const clips = all.filter((m) => (m.kind === 'video' || m.kind === 'image') && !skip.has(m.id));
  const sources = tabSources(all);
  const tracks = sources.flatMap((s) => s.tracks);
  let beats = null;
  if (song) {
    if (!beatCache.has(song.id)) beatCache.set(song.id, detectBeats(song.envelope, song.envRate || 100));
    beats = beatCache.get(song.id);
  }
  return {
    song,
    beats,
    clips,
    sources,
    guitar: tracks.some((t) => !isBassTrack(t)),
    bass: tracks.some((t) => isBassTrack(t)),
    drums: sources.some((s) => s.drumTracks.length),
    lyrics: (p.lyrics || []).filter((l) => l.text && l.text.trim()).length,
    cutouts: [...(p.clips || []), ...(p.layers || []).filter((l) => l.type === 'video').flatMap((l) => l.clips)].filter((c) => c.bgRemove && c.bgRemove.enabled).length,
  };
}

/** Changes when the inputs a suggestion uses change (to show the "new suggestions" dot). */
export function inventorySignature(inv) {
  return [inv.song && inv.song.id, inv.clips.map((c) => c.id).join(','), inv.sources.map((s) => s.id).join(','), inv.lyrics].join('|');
}

/** Enough to suggest something: a song plus at least one clip, or a song plus a tab or lyrics. */
export function canSuggest(inv) {
  return !!inv.song && (inv.clips.length > 0 || inv.guitar || inv.bass || inv.drums || inv.lyrics >= 2);
}

const nameOf = (id) => (TEMPLATES.find((t) => t.id === id) || {}).name || id;

/**
 * Three different takes, best first. `seed` rotates the choices for "Show different takes".
 * `hot` lists template ids of formats trending right now (from the Inspiration page's refresh); the
 * first one that isn't already a pick replaces the plain look, and it's marked `trending`.
 * Each: { id, template, title, hookLen, beatsPerCut, trending? }
 */
export function planTakes(inv, { seed = 0, hot = [] } = {}) {
  const band = [];
  if (inv.guitar && inv.drums) band.push('fullband');
  if (inv.guitar) band.push('riff', 'challenge');
  if (inv.bass) band.push('basscam');
  if (inv.drums && !inv.guitar && !band.includes('fullband')) band.push('fullband');
  const lyric = inv.lyrics >= 2 ? ['lyricvideo', 'poster', 'tunnel'] : [];
  const looks = ['rock', 'hype', 'neon', 'cinematic', 'spotlight', 'vhs'];
  const rot = (arr, k) => (arr.length ? arr.map((_, i) => arr[(i + k) % arr.length]) : arr);
  const groups = [rot(band, seed), rot(lyric, seed), rot(looks, seed)].filter((g) => g.length);
  const picks = [];
  // one from each kind first (band, lyric, look), then fill
  for (let round = 0; picks.length < 3 && round < 6; round++) {
    for (const g of groups) {
      if (picks.length >= 3) break;
      const t = g[round];
      if (t && !picks.includes(t)) picks.push(t);
    }
  }
  // a trending format takes the last slot (the plain look), unless it's already picked
  const trend = hot.find((t) => TEMPLATES.some((x) => x.id === t) && !(TEMPLATES.find((x) => x.id === t).needs) && !picks.includes(t));
  const trending = new Set(hot.filter((t) => picks.includes(t)));
  if (trend && picks.length) {
    picks[picks.length - 1] = trend;
    trending.add(trend);
  }
  const lens = [30, 15, 20];
  return picks.map((template, i) => {
    const hookLen = lens[(i + seed) % lens.length];
    const beatsPerCut = template === 'hype' || template === 'poster' ? 2 : template === 'lyricvideo' || template === 'cinematic' ? 8 : 4;
    return { id: `take-${seed}-${i}-${template}`, template, title: nameOf(template), hookLen, beatsPerCut, ...(trending.has(template) ? { trending: true } : {}) };
  });
}

function baseClip(rec, start, duration, carry) {
  return {
    id: uid('clip'),
    mediaId: rec.id,
    kind: rec.kind,
    in: +Math.max(0, start).toFixed(3),
    duration: rec.kind === 'video' ? +Math.min(duration, rec.duration).toFixed(3) : duration,
    speed: 1,
    fit: 'cover',
    zoom: 1,
    panX: 0,
    panY: 0,
    rotate: 0,
    flip: false,
    volume: 0,
    filter: { preset: 'none', adjust: {} },
    transition: { type: 'none', duration: 0.3 },
    kenBurns: rec.kind === 'image' ? { fromZoom: 1.05, toZoom: 1.18, fromX: 0, toX: 0, fromY: 0, toY: 0 } : null,
    ...(carry ? { bgRemove: structuredClone(carry) } : {}),
  };
}

/**
 * Apply a take to project draft `d`. ctx: { inv, seed, palette, tabTempo(mediaId, track) -> bpm, extraScore(rec, from, to) -> 0..1 }.
 * Returns facts for the card ("why this edit"): [string].
 */
export function applyTake(d, take, { inv, seed = 0, palette = null, tabTempo = () => null, extraScore: ctxExtra = null } = {}) {
  const facts = [];
  const song = inv.song;
  // keep the cut-out settings you already chose for a clip, per media item
  const carry = new Map();
  for (const c of [...d.clips, ...(d.layers || []).filter((l) => l.type === 'video').flatMap((l) => l.clips)]) {
    if (c.bgRemove && c.bgRemove.enabled && !carry.has(c.mediaId)) carry.set(c.mediaId, c.bgRemove);
  }

  // song + hook
  if (song) {
    if (!d.song || d.song.mediaId !== song.id) d.song = { mediaId: song.id, offset: 0, volume: 1, fadeIn: 0.3, fadeOut: 1.2 };
    const len = Math.min(take.hookLen, Math.max(5, Math.floor(song.duration)));
    // take.start: a stretch chosen by the caller (a song section) instead of the loudest part
    d.song.offset = take.start != null ? take.start : findHook(song.envelope, song.envRate || 100, len, song.duration);
    delete d.song.parts; // one stretch of the song
    delete d.song.join;
    d.endCard.enabled = true;
    d.duration = +(len + d.endCard.duration).toFixed(2);
    if (take.start == null) facts.push(`${len} s hook from ${formatTime(d.song.offset, false)}, the loudest part of “${song.name}”`);
  }
  const beats = inv.beats;
  if (beats) d.beats = beats;

  // clips cut on the beat. Videos that frame-quality analysis found mostly blurry, shaky or badly exposed are left
  // out while others remain, and each cut starts at the best stretch of its clip. `extraScore(rec, from, to)` (in the
  // ctx or on `inv`) can add its own 0..1 score per stretch (e.g. a text-search match); from/to are seconds into the file.
  let skippedWeak = 0;
  let picked = 0;
  if (inv.clips.length) {
    const extraScore = ctxExtra || inv.extraScore || null;
    const good = inv.clips.filter((m) => !(m.kind === 'video' && isWeakTake(m.quality)));
    const pool = good.length ? good : inv.clips;
    skippedWeak = good.length ? inv.clips.length - good.length : 0;
    const order = pool.map((m, i) => pool[(i + seed) % pool.length]);
    const grid = beats ? beats.beats.map((b) => b - d.song.offset).filter((x) => x > 0) : Array.from({ length: Math.ceil(d.duration * 2) }, (_, i) => (i + 1) * 0.5);
    const plan = beatCutPlan(order.map((m) => m.id), grid, take.beatsPerCut, d.duration);
    const used = new Map(); // media id -> [from, to] ranges already used
    d.clips = plan.map((step) => {
      const rec = pool.find((m) => m.id === step.mediaId);
      const ranges = used.get(rec.id) || [];
      let start = 0;
      if (rec.kind === 'video') {
        const q = rec.quality || null;
        start = bestStart(q, step.duration, rec.duration, ranges, extraScore && q ? (a, b) => extraScore(rec, a, b) : null);
        if (q) picked++;
      }
      used.set(rec.id, [...ranges, [start, start + step.duration]]);
      return baseClip(rec, start, step.duration, carry.get(rec.id));
    });
    if (picked) facts.push(`Cut from the sharpest, steadiest stretches of your footage${skippedWeak ? `, leaving out ${skippedWeak} weak take${skippedWeak === 1 ? '' : 's'}` : ''}`);
    facts.push(beats ? `${d.clips.length} cuts every ${take.beatsPerCut} beats at ${beats.bpm} BPM across ${Math.min(inv.clips.length, d.clips.length)} clip${inv.clips.length === 1 ? '' : 's'}` : `${d.clips.length} cuts across your clips (no steady beat found, so every ${take.beatsPerCut / 2} s)`);
  }

  // template (adds tab / drum / visualizer layers for band templates)
  applyTemplate(d, take.template, inv.sources);
  const tpl = TEMPLATES.find((t) => t.id === take.template);
  if (tpl) facts.push(`${tpl.name} look`);

  // line tab / drum layers up with the song (bar 1 on the first beat, tempo matched),
  // unless you set their timing yourself
  const firstBeat = beats && beats.beats.length ? beats.beats[0] : 0;
  const lyricTake = ['lyricvideo', 'poster', 'tunnel'].includes(take.template);
  let hidden = 0;
  for (const L of d.layers || []) {
    if (L.visible === false) continue;
    if (lyricTake && ['tab', 'drums', 'viz'].includes(L.type)) {
      L.visible = false; // a clean lyric video; the layers are hidden, not deleted
      hidden++;
      continue;
    }
    if (!(L.type === 'tab' || (L.type === 'drums' && L.source === 'gp')) || !L.mediaId) continue;
    const fresh = !L.userSync;
    if (fresh) {
      L.offset = +firstBeat.toFixed(3);
      const base = tabTempo(L.mediaId, L.track);
      if (beats && base) {
        const cands = [beats.bpm, beats.bpm * 2, beats.bpm / 2].map((x) => x / base);
        L.tempoScale = +cands.reduce((a, c) => (Math.abs(Math.log(c)) < Math.abs(Math.log(a)) ? c : a)).toFixed(4);
      }
    }
    const what = L.type === 'drums' ? 'Drum chart' : /bass/i.test(L.name) ? 'Bass tab' : 'Guitar tab';
    const style = { highway: 'a fretboard highway', neck: 'a light-up neck', strings: 'vibrating strings', tab: 'scrolling tab', kit: 'the light-up kit', neon: 'a neon highway', glass: 'glass lanes', lanes: 'lanes', circle: 'a circle' }[L.style] || L.style;
    facts.push(`${what} as ${style}${fresh ? (beats ? ', lined up with the first beat and tempo' : ', starting with the song') : ', keeping your sync'}`);
  }
  if (hidden) facts.push(`Tab and drum layers hidden so the lyrics stand out (not deleted)`);
  if (inv.lyrics >= 2 && d.lyricStyle.display && d.lyricStyle.display !== 'line') {
    facts.push(`Your lyrics as ${{ sheet: 'a scrolling lyric sheet', poster: 'a kinetic poster', tunnel: 'a 3D word tunnel' }[d.lyricStyle.display]}`);
  }

  // cut-outs get the best background for this look
  const cut = [...d.clips, ...(d.layers || []).filter((l) => l.type === 'video').flatMap((l) => l.clips)].filter((c) => c.bgRemove && c.bgRemove.enabled);
  if (cut.length) {
    const others = inv.clips.filter((m) => !cut.some((c) => c.mediaId === m.id)).map((m) => ({ id: m.id, name: m.name, kind: m.kind }));
    const best = suggestBackdrops({ template: take.template, palette, otherMedia: others })[0];
    for (const c of cut) c.bgRemove.background = structuredClone(best.bg);
    facts.push(`Cut-outs in front of ${best.label}`);
  }
  d.suggestion = take.id;
  return facts;
}
