// Templates built from one song's own files (Songs & releases → the song's Files tab): a rhythm game video
// (Guitar Hero / Rock Band style highways from its charts and stems), a promo cut from its music video with the
// lyrics on top, and a promo of its raw footage cut on the beat with the lyrics on top. Each ends on the
// song's end card. Pure apart from the project draft it changes; unit tested.
import { uid, findHook, linesFromText, beatCutPlan } from './core.js';
import { lyricsFromTiming, markTimed, timingStale } from './manager/lyrictiming.js';
import { applyTemplate } from './templates.js';
import { applyTake } from './suggest.js';
import { defaultGameLayer } from './rhythmgame.js';
import { isBassTrack } from './tab.js';
import { autoCover, sectionSpans, fmtTime } from './manager/releases.js';

export const SONG_TEMPLATES = [
  {
    id: 'st-game',
    name: 'Rhythm game',
    blurb: 'Guitar Hero / Rock Band style: note highways for the guitar, drums and bass, played in time with the song, with flames, streaks, star power and the score, in front of a rock arena (or your music video, dimmed). Built from the song’s Guitar Pro tabs, MIDI and stems, and auto-synced.',
    needs: 'parts',
  },
  {
    id: 'st-mv',
    name: 'Music video + lyrics',
    blurb: 'The best 15 seconds of the song over the same moment of its music video, in sync, with the lyrics on top and a moody grade.',
    needs: 'video',
  },
  {
    id: 'st-footage',
    name: 'Raw footage + lyrics',
    blurb: 'Your raw footage cut on the beat over the hook, with the lyrics on top.',
    needs: 'footage',
  },
  {
    id: 'st-chorus',
    name: 'Chorus promo',
    blurb: 'A 15–30 s vertical promo of the first chorus (from the song’s Sections tab): your footage, the music video or the cover cut on the beat, the chorus lyrics on top.',
    needs: 'chorus',
  },
];

/** The song's first section named Chorus (typed or accepted from detection), with its end filled: or null. */
export function firstChorus(song, duration = 0) {
  return sectionSpans(song && song.sections, duration).find((s) => /^chorus\b/i.test(String(s.label || '').trim())) || null;
}

/** The stretch of the song the Chorus promo plays: the chorus, held to 15–30 s and inside the song. { start, len } */
export function chorusWindow(sec, duration = 0) {
  const start = Math.max(0, sec.start);
  const room = duration > start ? duration - start : 30;
  const want = sec.end != null ? sec.end - start : 20;
  const len = Math.min(room, Math.max(15, Math.min(30, want)));
  return { start: +start.toFixed(2), len: +Math.max(5, len).toFixed(2) };
}

// "[Chorus]", "(Chorus x2)", "Chorus:", "Chorus 2" on a line of its own (not a lyric that starts with "hook")
const HEADER = /^\s*(\[\s*(chorus|refrain|hook)\b[^\]]*\]|\(\s*(chorus|refrain|hook)\b[^)]*\)|(chorus|refrain|hook)\s*\d*\s*:?)\s*$/i;
const ANY_HEADER = /^\s*\[[^\]]*\]\s*$|^\s*\((verse|chorus|bridge|intro|outro|pre-chorus|refrain|hook)[^)]*\)\s*$/i;

/**
 * The chorus lines of plain lyrics: the stanza after a [Chorus] / Chorus: header, else the stanza that repeats most,
 * else the first. Returns { lines: [text], how: 'header'|'repeat'|'first' } (empty lines when there are no lyrics).
 */
export function chorusLines(text) {
  const stanzas = [];
  let cur = null;
  let afterHeader = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      cur = null;
      continue;
    }
    if (HEADER.test(line) || ANY_HEADER.test(line)) {
      cur = { lines: [], chorus: HEADER.test(line) };
      stanzas.push(cur);
      afterHeader = true;
      continue;
    }
    if (!cur) stanzas.push((cur = { lines: [], chorus: false }));
    cur.lines.push(line);
  }
  const full = stanzas.filter((s) => s.lines.length);
  if (!full.length) return { lines: [], how: 'first' };
  const marked = afterHeader && full.find((s) => s.chorus);
  if (marked) return { lines: marked.lines, how: 'header' };
  const key = (s) => s.lines.join('\n').toLowerCase().replace(/[^\p{L}\p{N}\n]+/gu, '');
  const count = {};
  for (const s of full) count[key(s)] = (count[key(s)] || 0) + 1;
  const rep = full.filter((s) => count[key(s)] >= 2).sort((a, b) => count[key(b)] - count[key(a)])[0];
  return rep ? { lines: rep.lines, how: 'repeat' } : { lines: full[0].lines, how: 'first' };
}
const ORDER = ['guitar', 'drums', 'bass', 'keys'];
const LABEL = { guitar: 'Guitar', drums: 'Drums', bass: 'Bass', keys: 'Keys' };

/**
 * The parts a rhythm game can play, best source first for each instrument: a Guitar Pro track, then a MIDI
 * track, then a stem. tabs: library tab records (tracks, drumTracks); midis: MIDI records (midi.tracks);
 * stems: [{ rec, role }] (role from the song's Files tab). Returns [{ instrument, source, mediaId, track, label }]
 * in the order guitar, drums, bass (keys only when there's no bass).
 */
export function gameParts({ tabs = [], midis = [], stems = [] } = {}) {
  const found = {};
  const take = (inst, part) => {
    if (!found[inst]) found[inst] = { instrument: inst, label: LABEL[inst], ...part };
  };
  for (const r of tabs) {
    const gtr = (r.tracks || []).find((t) => !isBassTrack(t));
    const bass = (r.tracks || []).find((t) => isBassTrack(t));
    if (gtr) take('guitar', { source: 'tab', mediaId: r.id, track: gtr.index, from: `${r.title || r.name}: ${gtr.name}` });
    if (bass) take('bass', { source: 'tab', mediaId: r.id, track: bass.index, from: `${r.title || r.name}: ${bass.name}` });
    if ((r.drumTracks || []).length) take('drums', { source: 'tab', mediaId: r.id, track: r.drumTracks[0].index, from: `${r.title || r.name}: ${r.drumTracks[0].name}` });
  }
  for (const r of midis) {
    const m = r.midi;
    if (!m) continue;
    const dr = m.tracks.find((t) => t.notes && t.isDrum);
    const parts = m.tracks.filter((t) => t.notes && !t.isDrum);
    if (dr) take('drums', { source: 'midi', mediaId: r.id, track: dr.index, drumMap: r.drumMap || 'general_midi', from: `${r.name}: ${dr.name}` });
    const bassT = parts.find((t) => /bass/i.test(t.name) || (t.high && t.high < 60));
    const gtrT = parts.find((t) => t !== bassT && /guit|gtr|lead|rhythm/i.test(t.name)) || parts.find((t) => t !== bassT);
    if (gtrT) take('guitar', { source: 'midi', mediaId: r.id, track: gtrT.index, from: `${r.name}: ${gtrT.name}` });
    if (bassT) take('bass', { source: 'midi', mediaId: r.id, track: bassT.index, from: `${r.name}: ${bassT.name}` });
  }
  for (const { rec, role } of stems) {
    const inst = role === 'drums' || role === 'perc' ? 'drums' : role === 'bass' ? 'bass' : role === 'guitar' ? 'guitar' : role === 'keys' ? 'keys' : null;
    if (inst && rec && rec.kind === 'audio') take(inst, { source: 'stem', mediaId: rec.id, track: 0, from: `${rec.name} (stem)` });
  }
  const list = ORDER.map((k) => found[k]).filter(Boolean);
  // three highways at most; keys only when there's no bass
  return (found.bass ? list.filter((p) => p.instrument !== 'keys') : list).slice(0, 3);
}

/** Can the template be made for this song, and what will it use: { ok, uses: [text], missing: text }. */
export function songTemplateReady(id, ctx) {
  if (!ctx || !ctx.song) return { ok: false, uses: [], missing: 'Pick one of your songs in the Audio tab first.' };
  if (!ctx.audio) return { ok: false, uses: [], missing: `“${ctx.song.title}” has no song file yet (its Overview in Songs & releases).` };
  if (id === 'st-game') {
    const parts = ctx.parts || [];
    return parts.length
      ? { ok: true, uses: parts.map((p) => `${p.label}: ${p.from}`), missing: '' }
      : { ok: false, uses: [], missing: `Add a Guitar Pro tab, a MIDI file or guitar, bass or drum stems to “${ctx.song.title}” (its Files tab).` };
  }
  if (id === 'st-mv') return ctx.video ? { ok: true, uses: [`Music video: ${ctx.video.rec.name}`, lyricsUse(ctx)], missing: '' } : { ok: false, uses: [], missing: `Add the music video to “${ctx.song.title}” (its Files tab).` };
  if (id === 'st-chorus') {
    const sec = firstChorus(ctx.song, ctx.audio.duration || 0);
    if (!sec) return { ok: false, uses: [], missing: `“${ctx.song.title}” has no Chorus section yet. Detect the sections from the audio (or type them) on its Sections tab.`, detect: true };
    const pic = chorusPicture(ctx);
    if (!pic) return { ok: false, uses: [], missing: `Add raw footage, the music video or cover art to “${ctx.song.title}”.` };
    const w = chorusWindow(sec, ctx.audio.duration || 0);
    const picText = pic.kind === 'footage' ? `${ctx.footage.length} footage clip${ctx.footage.length === 1 ? '' : 's'}, cut on the beat` : pic.kind === 'video' ? `Music video: ${ctx.video.rec.name}, the same moment, cut on the beat` : 'The cover art, pulsing on the beat';
    return { ok: true, uses: [`${sec.label} ${fmtTime(w.start)}–${fmtTime(w.start + w.len)} (${Math.round(w.len)} s)`, picText, chorusLyricsUse(ctx, w)], missing: '' };
  }
  if (id === 'st-footage') return (ctx.footage || []).length ? { ok: true, uses: [`${ctx.footage.length} footage clip${ctx.footage.length === 1 ? '' : 's'}`, lyricsUse(ctx)], missing: '' } : { ok: false, uses: [], missing: `Add raw footage to “${ctx.song.title}” (its Files tab).` };
  return { ok: false, uses: [], missing: 'Unknown template.' };
}
const lyricsUse = (ctx) => (ctx.song.instrumental ? 'No lyrics (instrumental)' : ctx.hasLyrics ? 'The lyrics in the edit' : ctx.song.lyricTiming ? 'The song’s timed lyrics' : ctx.song.lyrics && ctx.song.lyrics.trim() ? 'The song’s lyrics (tap-sync them, or find timed ones)' : 'No lyrics yet: add them on the Lyrics tab');

/** Put the song in and pick its hook: `len` seconds from the loudest part. Returns the hook start (song seconds). */
function setSong(d, audio, len) {
  if (!d.song || d.song.mediaId !== audio.id) d.song = { mediaId: audio.id, offset: 0, volume: 1, fadeIn: 0.3, fadeOut: 1.2 };
  const L = Math.min(len, Math.max(5, Math.floor(audio.duration || len)));
  d.song.offset = audio.envelope ? findHook(audio.envelope, audio.envRate || 100, L, audio.duration) : 0;
  d.song.fadeIn = 0.3;
  return L;
}

/** The song's end card: title, artist, cover, and OUT NOW or a countdown to its release date. */
function endCardFor(d, ctx, today) {
  const s = ctx.song;
  Object.assign(d.endCard, { enabled: true, duration: Math.max(3, Math.min(d.endCard.duration || 4, 4)), title: s.title, artist: ctx.band || d.endCard.artist });
  autoCover(d.endCard, ctx.cover);
  const upcoming = s.releaseDate && today && s.releaseDate > today;
  d.endCard.releaseDate = s.releaseDate || '';
  d.endCard.cta = upcoming ? '{countdown}' : 'OUT NOW';
  d.managerSongId = s.id;
}

/** Lyrics on: the edit's own (timed or yours), else the song's from Songs & releases at 2.5 s a line. */
function lyricsOn(d, ctx, facts) {
  d.layerVis = { ...(d.layerVis || {}) };
  delete d.layerVis.lyrics;
  if (ctx.song.instrumental) {
    facts.push('No lyrics: the song is instrumental');
    return;
  }
  const timed = !d.lyrics.length && lyricsFromTiming(ctx.song.lyricTiming);
  if (timed && timed.length) {
    d.lyrics = timed;
    d.lyricsFrom = { mediaId: ctx.audio.id, source: 'timing', title: ctx.song.title, timed: true };
    d.lyricsTimed = markTimed(null, 'song', ctx.song.lyricTiming.savedAt);
    facts.push(timingStale(ctx.song) ? 'The song’s saved timing is on, but its lyrics changed since: re-time or keep it on the Lyrics tab' : 'The song’s timed lyrics are on, already in time');
  } else if (!d.lyrics.length && ctx.song.lyrics && ctx.song.lyrics.trim()) {
    d.lyrics = linesFromText(ctx.song.lyrics, +(d.song.offset + 0.5).toFixed(2), 2.5);
    d.lyricsFrom = { mediaId: ctx.audio.id, source: 'manager', title: ctx.song.title };
    facts.push('The song’s lyrics are on, 2.5 s a line: tap-sync them on the Lyrics tab (or find timed ones there)');
  } else if (d.lyrics.length) facts.push(d.lyricsFrom && d.lyricsFrom.timed ? 'Timed lyrics on top' : 'Your lyrics on top');
  else facts.push('No lyrics yet: add them on the Lyrics tab and they show on top');
}

/** What the Chorus promo shows: your raw footage first, then the music video, then the cover art. */
function chorusPicture(ctx) {
  if ((ctx.footage || []).length) return { kind: 'footage' };
  if (ctx.video) return { kind: 'video' };
  if (ctx.coverRec && ctx.coverRec.kind === 'image') return { kind: 'cover' };
  return null;
}

/** Timed lines (song seconds) that sit in the window. */
const inWindow = (lines, w) => (lines || []).filter((l) => l.end > w.start + 0.2 && l.start < w.start + w.len - 0.2);

function chorusLyricsUse(ctx, w) {
  const s = ctx.song;
  if (s.instrumental) return 'No lyrics (instrumental)';
  if (s.lyricTiming && inWindow(lyricsFromTiming(s.lyricTiming, () => ''), w).length) return 'The chorus lines from the song’s timed lyrics';
  if (s.lyrics && s.lyrics.trim()) {
    const c = chorusLines(s.lyrics);
    return c.how === 'first' ? 'The first lines of the lyrics, spread over the chorus (time them on the Lyrics tab)' : 'The chorus lines of the lyrics, spread over it (time them on the Lyrics tab)';
  }
  return ctx.hasLyrics ? 'The lyrics in the edit' : 'No lyrics yet: add them on the Lyrics tab';
}

/**
 * The chorus lyrics on top: the song's saved timing first (when it covers the chorus), then the edit's own lines
 * when they fall in it, then the chorus stanza of the plain lyrics spread over the window.
 */
function chorusLyricsOn(d, ctx, w, facts) {
  d.layerVis = { ...(d.layerVis || {}) };
  delete d.layerVis.lyrics;
  const s = ctx.song;
  if (s.instrumental) return facts.push('No lyrics: the song is instrumental');
  const timed = s.lyricTiming ? lyricsFromTiming(s.lyricTiming) : [];
  if (inWindow(timed, w).length) {
    d.lyrics = timed;
    d.lyricsFrom = { mediaId: ctx.audio.id, source: 'timing', title: s.title, timed: true };
    d.lyricsTimed = markTimed(null, 'song', s.lyricTiming.savedAt);
    return facts.push(`${inWindow(timed, w).length} chorus line${inWindow(timed, w).length === 1 ? '' : 's'} from the song’s timed lyrics${timingStale(s) ? ' (its lyrics changed since they were timed: check them on the Lyrics tab)' : ''}`);
  }
  // the edit's own lines, unless they are just the song's plain lyrics laid out 2.5 s apart from the start
  const spread = d.lyricsFrom && d.lyricsFrom.source === 'manager' && !d.lyricsTimed;
  if (!spread && inWindow(d.lyrics, w).length) return facts.push('Your lyrics in the edit on top');
  const c = chorusLines(s.lyrics);
  if (!c.lines.length) return facts.push('No lyrics yet: add them on the Lyrics tab and they show on top');
  const per = Math.max(1.2, Math.min(4, (w.len - 0.4) / c.lines.length));
  d.lyrics = linesFromText(c.lines.slice(0, Math.max(1, Math.floor((w.len - 0.4) / per))).join('\n'), +(w.start + 0.3).toFixed(2), +per.toFixed(2));
  d.lyricsFrom = { mediaId: ctx.audio.id, source: 'manager', title: s.title };
  d.lyricsTimed = null;
  facts.push(`${c.how === 'first' ? 'The first lines of the lyrics' : 'The chorus lines'}, ${per.toFixed(1)} s each: tap-sync them on the Lyrics tab`);
}

const hideParts = (d) => {
  for (const l of d.layers || []) if (['tab', 'drums', 'viz', 'midi', 'game'].includes(l.type)) l.visible = false;
};

const videoClip = (rec, inPoint, duration, extra = {}) => ({
  id: uid('clip'),
  mediaId: rec.id,
  kind: 'video',
  in: +Math.max(0, Math.min(inPoint, Math.max(0, (rec.duration || inPoint + duration) - duration))).toFixed(3),
  duration: +duration.toFixed(3),
  speed: 1,
  fit: 'cover',
  zoom: 1,
  panX: 0,
  panY: 0,
  rotate: 0,
  flip: false,
  volume: 0,
  filter: { preset: 'none', adjust: {} },
  transition: { type: 'fade', duration: 0.4 },
  kenBurns: null,
  ...extra,
});

/**
 * Apply template `id` to draft `d` for the song in `ctx`:
 * { song, band, audio, beats, video: { rec, offset }, footage: [rec], parts, cover, hasLyrics, today }.
 * Returns facts for the toast: [text]. Layers it doesn't use are hidden, never deleted.
 */
export function applySongTemplate(d, id, ctx) {
  const facts = [];
  const ready = songTemplateReady(id, ctx);
  if (!ready.ok) throw new Error(ready.missing);
  d.layers = d.layers || [];
  d.texts = [];
  if (id === 'st-chorus') {
    hideParts(d);
    const sec = firstChorus(ctx.song, ctx.audio.duration || 0);
    const w = chorusWindow(sec, ctx.audio.duration || 0);
    const pic = chorusPicture(ctx);
    facts.push(`${Math.round(w.len)} s of ${sec.label} from ${fmtTime(w.start)}`);
    if (pic.kind === 'video') {
      if (!d.song || d.song.mediaId !== ctx.audio.id) d.song = { mediaId: ctx.audio.id, offset: 0, volume: 1, fadeIn: 0.3, fadeOut: 1.2 };
      Object.assign(d.song, { offset: w.start, fadeIn: 0.3 });
      d.endCard.enabled = true;
      d.duration = +(w.len + d.endCard.duration).toFixed(2);
      if (ctx.beats) d.beats = ctx.beats;
      // the same moment of the music video, cut into pieces on the beat (each piece punches in a little)
      const grid = ctx.beats ? ctx.beats.beats.map((b) => b - w.start).filter((x) => x > 0) : Array.from({ length: Math.ceil(w.len * 2) }, (_, i) => (i + 1) * 0.5);
      let at = w.start + (ctx.video.offset || 0);
      d.clips = beatCutPlan([ctx.video.rec.id], grid, 4, w.len).map((step, i) => {
        const c = videoClip(ctx.video.rec, at, step.duration, { zoom: i % 2 ? 1.12 : 1 });
        at += step.duration;
        return c;
      });
      applyTemplate(d, 'spotlight');
      facts.push(`The music video at the same moment, ${d.clips.length} cuts on the beat`);
    } else {
      const clips = pic.kind === 'footage' ? ctx.footage : [ctx.coverRec];
      const take = { id: 'st-chorus', template: 'spotlight', title: 'Chorus promo', hookLen: w.len, beatsPerCut: pic.kind === 'cover' ? 4 : 2, start: w.start };
      facts.push(...applyTake(d, take, { inv: { song: ctx.audio, beats: ctx.beats || null, clips, sources: [], lyrics: 0 } }));
      if (pic.kind === 'cover') facts.push('The cover art, pulsing on the beat');
    }
    hideParts(d);
    d.look.letterbox = 0;
    // hard cuts on the beat with a small pulse, instead of the template's slow crossfades
    d.clips.forEach((c, i) => {
      c.transition = i ? { type: 'none', duration: 0.3 } : { type: 'fade', duration: 0.4 };
      c.effects = { ...(c.effects || {}), beatPulse: 0.35 };
    });
    chorusLyricsOn(d, ctx, w, facts);
  } else if (id === 'st-footage') {
    hideParts(d);
    const take = { id: 'st-footage', template: 'spotlight', title: 'Raw footage + lyrics', hookLen: 15, beatsPerCut: 4 };
    facts.push(...applyTake(d, take, { inv: { song: ctx.audio, beats: ctx.beats || null, clips: ctx.footage, sources: [], lyrics: 0 } }));
    hideParts(d); // the template can add band layers back
    lyricsOn(d, ctx, facts);
  } else if (id === 'st-mv') {
    hideParts(d);
    const len = setSong(d, ctx.audio, 15);
    d.duration = +(len + 3.5).toFixed(2);
    // the same moment of the music video as the song: its 0:00 is `offset` seconds into the video
    d.clips = [videoClip(ctx.video.rec, d.song.offset + (ctx.video.offset || 0), len, { transition: { type: 'fade', duration: 0.5 } })];
    if (ctx.beats) d.beats = ctx.beats;
    applyTemplate(d, 'cinematic');
    hideParts(d);
    d.look.letterbox = 0; // cinema bars would cover the lyrics on a phone
    for (const c of d.clips) c.kenBurns = { fromZoom: 1, toZoom: 1.06, fromX: 0, toX: 0, fromY: 0, toY: 0 };
    facts.push(`${len} s hook from ${fmt(d.song.offset)} over the same moment of the music video${ctx.video.offset ? ` (it starts the song ${fmt(ctx.video.offset)} in)` : ''}`);
    lyricsOn(d, ctx, facts);
  } else {
    const len = setSong(d, ctx.audio, 30);
    d.duration = +(len + 4).toFixed(2);
    if (ctx.beats) d.beats = ctx.beats;
    // behind the highways: the music video dimmed, or the rock arena
    const bgVideo = ctx.video ? ctx.video.rec : null;
    d.clips = bgVideo ? [videoClip(bgVideo, d.song.offset + (ctx.video.offset || 0), len, { filter: { preset: 'none', adjust: { brightness: 0.45, saturate: 0.85 } } })] : [];
    hideParts(d);
    d.layers = d.layers.filter((l) => !(l.type === 'game' && l.fromTemplate)); // replace highways this template made before
    const parts = ctx.parts.slice(0, 3);
    const n = parts.length;
    const xs = n === 1 ? [50] : n === 2 ? [27, 73] : [17, 50, 83];
    const width = n === 1 ? 74 : n === 2 ? 46 : 32;
    parts.forEach((p, i) => {
      d.layers.push({
        ...defaultGameLayer(),
        id: uid('lyr'),
        type: 'game',
        name: `Rhythm game: ${p.label}`,
        visible: true,
        fromTemplate: true,
        source: p.source,
        mediaId: p.mediaId,
        track: p.track,
        drumMap: p.drumMap || 'general_midi',
        instrument: p.instrument,
        offset: 0, // a chart or stem usually starts with the song; auto-sync finds where it really does
        x: xs[i],
        width,
        y: 56,
        height: 62,
        label: n > 1 ? p.label : '',
        hud: true,
        backdrop: !bgVideo && i === 0 ? 'arena' : 'none',
        gameTheme: ctx.gameTheme || 'classic',
        ...(d.theme && d.theme.colors ? { themeColors: { ...d.theme.colors } } : {}),
      });
    });
    // the song intro, top left, like the game shows it
    d.texts = [
      { id: uid('txt'), text: ctx.song.title.toUpperCase(), start: 0.3, end: 4.2, x: 50, y: 10, size: 7.5, font: 'Montserrat', color: '#ffffff', outline: '#000000', box: false, animation: 'slide' },
      { id: uid('txt'), text: (ctx.band || '').toUpperCase(), start: 0.5, end: 4.2, x: 50, y: 15, size: 4.5, font: 'Montserrat', color: '#facc15', outline: '#000000', box: false, animation: 'slide' },
    ].filter((x) => x.text);
    d.layerVis = { ...(d.layerVis || {}), lyrics: false };
    Object.assign(d.look, { vignette: 0.3, grain: 0, lightLeak: 0, scanlines: 0, beatFlash: 0, letterbox: 0 });
    d.template = 'st-game';
    facts.push(`${len} s from ${fmt(d.song.offset)}, the loudest part`, `${n} highway${n === 1 ? '' : 's'}: ${parts.map((p) => `${p.label} from ${p.from}`).join('; ')}`, bgVideo ? 'The music video, dimmed, behind them' : 'The rock arena behind them');
  }
  endCardFor(d, ctx, ctx.today || '');
  d.template = id;
  facts.push(`Ends on the end card for “${ctx.song.title}”${ctx.cover ? ' with its cover' : ''}`);
  return facts;
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
