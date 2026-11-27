// Templates built from one song's own files (Songs & releases → the song's Files tab): a rhythm game video
// (Guitar Hero / Rock Band style highways from its charts and stems), a promo cut from its music video with the
// lyrics on top, and a promo of its raw footage cut on the beat with the lyrics on top. Each ends on the
// song's end card. Pure apart from the project draft it changes; unit tested.
import { uid, findHook, linesFromText, beatCutPlan, savedWordTimes, wordTimings } from './core.js';
import { lyricsFromTiming, markTimed, timingStale } from './manager/lyrictiming.js';
import { applyTemplate, applyLayout, areaOf, lyricsIntoLayout } from './templates.js';
import { applyTake } from './suggest.js';
import { defaultGameLayer } from './rhythmgame.js';
import { isBassTrack } from './tab.js';
import { autoCover, sectionSpans, fmtTime } from './manager/releases.js';
import { templatePart, applySongPart, partSections, partLayout, pictureFor, clipOf, sectionAt, sectionKind, linesInParts } from './songpart.js';
import { defaultLyricStyle } from './state.js';
import { applySharedTheme, changeLook } from './lookapply.js';
import { themeById } from './lookthemes.js';
import { DISPLAY_DEFAULTS } from './lyricviz.js';
import { GRADE_PRESETS } from './renderer.js';
import { defaultVizLayer } from './viz.js';

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
  // lyric-video templates (lyric: true): built in applyLyricTemplate below, for the Part of the song you pick
  {
    id: 'st-bloodslam',
    name: 'Blood Slam Cards',
    blurb: 'One phrase per card in Blood & Ash capitals. The backdrop goes black on verses, deep red on choruses and ash grey on breakdowns; a key word in each line slams, chorus lines flash on their first word and everything shakes on the beat. Starts on the chorus.',
    needs: 'lyrics',
    lyric: true,
  },
  {
    id: 'st-glowslam',
    name: 'Glow Slam One-Word',
    blurb: 'One word at a time in wide bold capitals: letters close in, a ghost echo glows behind and each word flashes as it lands, over a glowing visualizer. Best on a chorus with Auto-synced word times.',
    needs: 'lyrics',
    lyric: true,
    looks: [
      ['hellfire', 'Hellfire'],
      ['neon', 'Neon'],
    ],
  },
  {
    id: 'st-stage',
    name: 'Stage Footage Cinematic',
    blurb: 'Your music video (on its saved sync) or raw footage as a film: cinema bars, vignette and grain, with small serif lyrics in the lower third that open up letter by letter and trail a soft echo.',
    needs: 'picture',
    lyric: true,
    looks: [
      ['funeral', 'Funeral Doom'],
      ['frostbite', 'Frostbite'],
    ],
  },
  {
    id: 'st-coversheet',
    name: 'Cover Art Sheet',
    blurb: 'The whole lyric sheet scrolling over the blurred colours of the cover art, the sung line filling in word by word. Made for YouTube and Spotify.',
    needs: 'cover',
    lyric: true,
  },
  // batch 2
  {
    id: 'st-screamclean',
    name: 'Scream/Clean Split',
    blurb: 'Screamed lines (choruses and breakdowns) in glitching red capitals on the left, clean lines (verses, intros, outros) in smooth karaoke on the right, each side narrowed to 60% of the frame, over your picture dimmed. The Section looks switch below adds whispers and the breakdown look. Stand-in: lines are told apart by their section (with no sections they alternate two by two), since a screamed line is not detected from the audio.',
    needs: 'lyrics',
    lyric: true,
  },
  {
    id: 'st-tourticker',
    name: 'Tour Ticker',
    blurb: 'The lyrics as one tour-date style band: red strip, bone-white condensed capitals with diamonds between lines, one line per bar, crawling right to left over live footage and spectrum bars. The band holds the part’s lines only. Stand-in: it is paced by the tempo, not tied to when each line is sung.',
    needs: 'lyrics',
    lyric: true,
  },
  {
    id: 'st-ashdissolve',
    name: 'Ash Dissolve',
    blurb: 'Slow serif lyrics that open up letter by letter and, when a line ends, turn to ash: each letter blurs, drifts up and fades. Over your picture dimmed, grey and dark, with a slow sway. Starts on the outro, else the intro, else the first verse. Stand-in: the smoke scene is the ash-grey graded picture (black without one).',
    needs: 'lyrics',
    lyric: true,
  },
  {
    id: 'st-ransom',
    name: 'Ransom Note Zine',
    blurb: 'Every word on its own tilted paper strip in mixed cut-out fonts, slapped down on a solid deep red page with grain and scanlines; strips jump on the beat and chorus lines are bigger. Stand-ins: the concrete wall is solid red, and strips are per word rather than per letter.',
    needs: 'lyrics',
    lyric: true,
  },
];
const LYRIC_IDS = new Set(SONG_TEMPLATES.filter((t) => t.lyric).map((t) => t.id));

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
  if (LYRIC_IDS.has(id)) return lyricReady(id, ctx);
  if (id === 'st-game') {
    const parts = ctx.parts || [];
    return parts.length
      ? { ok: true, uses: parts.map((p) => `${p.label}: ${p.from}`), missing: '' }
      : { ok: false, uses: [], missing: `Add a Guitar Pro tab, a MIDI file or guitar, bass or drum stems to “${ctx.song.title}” (its Files tab).` };
  }
  if (id === 'st-mv') return ctx.video ? { ok: true, uses: [`Music video: ${ctx.video.rec.name}`, lyricsUse(ctx)], missing: '' } : { ok: false, uses: [], missing: `Add the music video to “${ctx.song.title}” (its Files tab).` };
  if (id === 'st-chorus') {
    const pic = chorusPicture(ctx);
    let part = null;
    try {
      part = templatePart(ctx.part, ctx);
    } catch (e) {
      return { ok: false, uses: [], missing: e.message };
    }
    if (part) {
      // a part you picked: no Chorus section needed
      if (!pic) return { ok: false, uses: [], missing: `Add raw footage, the music video or cover art to “${ctx.song.title}”.` };
      const picText = pic.kind === 'footage' ? `${ctx.footage.length} footage clip${ctx.footage.length === 1 ? '' : 's'}, cut on the beat` : pic.kind === 'video' ? `Music video: ${ctx.video.rec.name}, in sync` : 'The cover art, pulsing on the beat';
      return { ok: true, uses: [`${part.parts.map((q) => q.label).join(', ')} (${Math.round(part.length)} s)`, picText], missing: '' };
    }
    const sec = firstChorus(ctx.song, ctx.audio.duration || 0);
    if (!sec) return { ok: false, uses: [], missing: `“${ctx.song.title}” has no Chorus section yet. Detect the sections from the audio (or type them) on its Sections tab.`, detect: true };
    if (!pic) return { ok: false, uses: [], missing: `Add raw footage, the music video or cover art to “${ctx.song.title}”.` };
    const w = chorusWindow(sec, ctx.audio.duration || 0);
    const picText = pic.kind === 'footage' ? `${ctx.footage.length} footage clip${ctx.footage.length === 1 ? '' : 's'}, cut on the beat` : pic.kind === 'video' ? `Music video: ${ctx.video.rec.name}, the same moment, cut on the beat` : 'The cover art, pulsing on the beat';
    return { ok: true, uses: [`${sec.label} ${fmtTime(w.start)}–${fmtTime(w.start + w.len)} (${Math.round(w.len)} s)`, picText, chorusLyricsUse(ctx, w)], missing: '' };
  }
  if (id === 'st-footage') return (ctx.footage || []).length ? { ok: true, uses: [`${ctx.footage.length} footage clip${ctx.footage.length === 1 ? '' : 's'}`, lyricsUse(ctx)], missing: '' } : { ok: false, uses: [], missing: `Add raw footage to “${ctx.song.title}” (its Files tab).` };
  return { ok: false, uses: [], missing: 'Unknown template.' };
}
const lyricsUse = (ctx) => (ctx.song.instrumental ? 'No lyrics (instrumental)' : ctx.hasLyrics ? 'The lyrics in the edit' : ctx.song.lyricTiming ? 'The song’s timed lyrics' : ctx.song.lyrics && ctx.song.lyrics.trim() ? 'The song’s lyrics (tap-sync them, or find timed ones)' : 'No lyrics yet: add them on the Lyrics tab');

/** Put the song in and pick its hook: `len` seconds from the loudest part, or the part you picked. Returns the length. */
function setSong(d, audio, len, part = null) {
  if (!d.song || d.song.mediaId !== audio.id) d.song = { mediaId: audio.id, offset: 0, volume: 1, fadeIn: 0.3, fadeOut: 1.2 };
  d.song.fadeIn = 0.3;
  if (part) {
    d.song.offset = part.parts[0].from;
    return +part.length.toFixed(2);
  }
  const L = Math.min(len, Math.max(5, Math.floor(audio.duration || len)));
  d.song.offset = audio.envelope ? findHook(audio.envelope, audio.envRate || 100, L, audio.duration) : 0;
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
  // ctx.part: the part of the song you picked (songpart.js); none = the template's own pick
  const part = templatePart(ctx.part, ctx);
  const partText = part ? `${part.parts.map((q) => q.label).join(', ')} (${fmtTime(part.length)})` : '';
  d.layers = d.layers || [];
  d.texts = [];
  if (d.song) delete d.song.parts; // a template plays one stretch of the song (see songpart.js)
  if (d.song) delete d.song.join;
  if (LYRIC_IDS.has(id)) return applyLyricTemplate(d, id, ctx, part, facts);
  if (id === 'st-chorus') {
    hideParts(d);
    const sec = part ? null : firstChorus(ctx.song, ctx.audio.duration || 0);
    const w = part ? { start: part.parts[0].from, len: +part.length.toFixed(2) } : chorusWindow(sec, ctx.audio.duration || 0);
    const pic = chorusPicture(ctx);
    facts.push(part ? partText : `${Math.round(w.len)} s of ${sec.label} from ${fmtTime(w.start)}`);
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
    // a part you picked that is a chorus keeps the chorus lyrics; any other part gets the song's lyrics
    if (!part || (part.parts.length === 1 && /^chorus\b/i.test(part.parts[0].label))) chorusLyricsOn(d, ctx, w, facts);
    else lyricsOn(d, ctx, facts);
  } else if (id === 'st-footage') {
    hideParts(d);
    const take = { id: 'st-footage', template: 'spotlight', title: 'Raw footage + lyrics', hookLen: part ? part.length : 15, beatsPerCut: 4, ...(part ? { start: part.parts[0].from } : {}) };
    facts.push(...applyTake(d, take, { inv: { song: ctx.audio, beats: ctx.beats || null, clips: ctx.footage, sources: [], lyrics: 0 } }));
    hideParts(d); // the template can add band layers back
    lyricsOn(d, ctx, facts);
  } else if (id === 'st-mv') {
    hideParts(d);
    const len = setSong(d, ctx.audio, 15, part);
    d.duration = +(len + 3.5).toFixed(2);
    // the same moment of the music video as the song: its 0:00 is `offset` seconds into the video
    d.clips = [videoClip(ctx.video.rec, d.song.offset + (ctx.video.offset || 0), len, { transition: { type: 'fade', duration: 0.5 } })];
    if (ctx.beats) d.beats = ctx.beats;
    applyTemplate(d, 'cinematic');
    hideParts(d);
    d.look.letterbox = 0; // cinema bars would cover the lyrics on a phone
    for (const c of d.clips) c.kenBurns = { fromZoom: 1, toZoom: 1.06, fromX: 0, toX: 0, fromY: 0, toY: 0 };
    facts.push(`${part ? partText : `${len} s hook from ${fmt(d.song.offset)}`} over the same moment of the music video${ctx.video.offset ? ` (it starts the song ${fmt(ctx.video.offset)} in)` : ''}`);
    lyricsOn(d, ctx, facts);
  } else {
    const len = setSong(d, ctx.audio, 30, part);
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
    facts.push(part ? partText : `${len} s from ${fmt(d.song.offset)}, the loudest part`, `${n} highway${n === 1 ? '' : 's'}: ${parts.map((p) => `${p.label} from ${p.from}`).join('; ')}`, bgVideo ? 'The music video, dimmed, behind them' : 'The rock arena behind them');
  }
  endCardFor(d, ctx, ctx.today || '');
  d.template = id;
  if (part) {
    fitToPart(d, id, ctx, part);
    return facts.concat(`Ends on the end card for “${ctx.song.title}”${ctx.cover ? ' with its cover' : ''}`);
  }
  // the stretch it picked shows as the Song part, so it can be changed from there
  if (d.song) d.songPart = { songId: ctx.song.id, kind: 'range', ids: [], from: d.song.offset, to: +(d.song.offset + Math.max(1, d.duration - (d.endCard.enabled ? d.endCard.duration : 0))).toFixed(3), join: { kind: 'fade', fade: 0.3 }, picture: 'keep', length: +Math.max(1, d.duration - (d.endCard.enabled ? d.endCard.duration : 0)).toFixed(3), byTemplate: id };
  facts.push(`Ends on the end card for “${ctx.song.title}”${ctx.cover ? ' with its cover' : ''}`);
  return facts;
}

/**
 * After a template was built for the part's first stretch and length: set the part on the edit (applySongPart:
 * song.parts for several sections, the length plus the end card, the Song part record). Several stretches get one
 * picture per stretch (the music video in sync, footage on the beat or the cover) in the template's own style.
 */
function fitToPart(d, id, ctx, part) {
  const many = part.parts.length > 1;
  const chorusPic = id === 'st-chorus' ? chorusPicture(ctx).kind : null;
  const picture = !many ? 'keep' : id === 'st-mv' ? 'video' : id === 'st-footage' ? 'footage' : id === 'st-chorus' ? chorusPic : ctx.video ? 'video' : 'keep';
  const proto = (d.clips || [])[0] || null;
  applySongPart(d, ctx.part, { ...ctx, picture });
  if (many && proto && picture !== 'keep') {
    for (const c of d.clips) {
      if (proto.filter) c.filter = structuredClone(proto.filter);
      if (proto.grade) c.grade = structuredClone(proto.grade);
      if (proto.effects) c.effects = structuredClone(proto.effects);
      if (id === 'st-mv' && c.kind === 'video') c.kenBurns = proto.kenBurns ? structuredClone(proto.kenBurns) : null;
    }
  }
  d.songPart.template = id;
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------- lyric-video templates
// Blood Slam Cards, Glow Slam One-Word, Stage Footage Cinematic and Cover Art Sheet. Each stores values only (look
// fields, effect settings and animation ids on the lyric style and lines; no template id beyond project.template,
// which every template sets), keeps the Part of the song you picked (or starts on its own pick, shown as the Song
// part), and ends on the song's end card. Lines that already have a look of their own keep drawing as they did.
// shortcut: smoke and stage-light scenes only draw behind a cut-out or the rhythm game arena (renderer.js), so the
// "smoke" sections are ash-grey graded picture and the "lights" are the glow visualizer plus the beat flash; switch
// to real scenes once the renderer can draw one full frame.

const GR = (id) => {
  const { label, ...rest } = GRADE_PRESETS[id] || {};
  return { preset: id, ...rest };
};
const r3 = (x) => +(+x).toFixed(3);

/** Does the song have lyrics a lyric template can show (in the edit, timed on the song, or plain)? */
const anyLyrics = (ctx) => !!(ctx.hasLyrics || (ctx.song.lyricTiming && lyricsFromTiming(ctx.song.lyricTiming, () => '').length) || (ctx.song.lyrics && ctx.song.lyrics.trim()));

/** A template's own pick when no part is chosen: { start, len, label, text, chorus }. */
function ownWindow(id, ctx) {
  const dur = ctx.audio.duration || 0;
  if (id === 'st-coversheet') return { start: 0, len: r3(Math.max(5, dur || 30)), label: 'Entire song', text: `Entire song (${fmtTime(dur || 30)})`, chorus: false };
  if (id === 'st-ashdissolve') {
    const spans = sectionSpans(ctx.song && ctx.song.sections, dur);
    const pick = ['outro', 'intro', 'verse'].map((k) => spans.find((x) => sectionKind(x.label) === k)).find(Boolean);
    if (pick) {
      const len = r3(Math.max(5, Math.min(25, (pick.end != null ? pick.end : dur || pick.start + 20) - pick.start)));
      const start = Math.max(0, pick.start);
      return { start: r3(start), len: r3(Math.min(len, dur ? Math.max(5, dur - start) : len)), label: pick.label, text: `${pick.label} ${fmtTime(start)}–${fmtTime(start + len)} (${Math.round(len)} s)`, chorus: false };
    }
  }
  if (id === 'st-screamclean') {
    // a verse into the chorus, so both kinds of line are heard
    const sec = firstChorus(ctx.song, dur);
    if (sec) {
      const spans = sectionSpans(ctx.song.sections, dur);
      const prev = [...spans].reverse().find((x) => x.start < sec.start - 0.5);
      const start = Math.max(0, prev && sec.start - prev.start <= 30 ? prev.start : sec.start - 10);
      const end = Math.min(dur || Infinity, sec.end != null ? sec.end : sec.start + 20);
      const len = r3(Math.max(10, Math.min(30, end - start)));
      return { start: r3(start), len, label: `${prev ? prev.label : 'Lead-in'} to ${sec.label}`, text: `${prev ? prev.label : 'The lead-in'} into ${sec.label} ${fmtTime(start)}–${fmtTime(start + len)} (${Math.round(len)} s)`, chorus: false };
    }
  }
  if (id === 'st-bloodslam' || id === 'st-glowslam' || id === 'st-tourticker' || id === 'st-ransom') {
    const sec = firstChorus(ctx.song, dur);
    if (sec) {
      const w = chorusWindow(sec, dur);
      return { ...w, label: sec.label, text: `${sec.label} ${fmtTime(w.start)}–${fmtTime(w.start + w.len)} (${Math.round(w.len)} s)`, chorus: true };
    }
  }
  const want = id === 'st-stage' ? 15 : 20;
  const L = Math.min(want, Math.max(5, Math.floor(dur || want)));
  const start = ctx.audio.envelope ? findHook(ctx.audio.envelope, ctx.audio.envRate || 100, L, dur) : 0;
  const hook = `the loudest ${L} s from ${fmtTime(start)}`;
  return { start: r3(start), len: L, label: 'Hook', text: id === 'st-stage' ? `The hook: ${hook}` : id === 'st-ashdissolve' ? `No intro, outro or verse section yet, so ${hook} (detect the sections on the song’s Sections tab)` : `No Chorus section yet, so ${hook} (detect the sections on the song’s Sections tab for the chorus)`, chorus: false };
}

/** Lines (song time) with saved word times among `lines` in the ranges: { timed, total }. */
export function wordTimesIn(lines, ranges) {
  const inPart = linesInParts(lines, ranges);
  return { timed: inPart.filter((l) => savedWordTimes(l)).length, total: inPart.length };
}

function lyricReady(id, ctx) {
  let part = null;
  try {
    part = templatePart(ctx.part, ctx);
  } catch (e) {
    return { ok: false, uses: [], missing: e.message };
  }
  const own = part ? null : ownWindow(id, ctx);
  const ranges = part ? part.parts : [{ from: own.start, to: own.start + own.len }];
  const uses = [part ? `${part.parts.map((q) => q.label).join(', ')} (${Math.round(part.length)} s)` : own.text];
  const title = ctx.song.title;
  if (id !== 'st-coversheet' && id !== 'st-stage') {
    if (ctx.song.instrumental) return { ok: false, uses: [], missing: `“${title}” is instrumental: this template is made of its lyrics.` };
    if (!anyLyrics(ctx)) return { ok: false, uses: [], missing: `Add the lyrics of “${title}” on its Lyrics tab (or the Lyrics tab here) first.` };
  }
  if (id === 'st-stage') {
    if (!ctx.video && !(ctx.footage || []).length) return { ok: false, uses: [], missing: `Add the music video or raw footage to “${title}” (its Files tab).` };
    uses.push(ctx.video ? `Music video: ${ctx.video.rec.name}, on its saved sync${ctx.video.offset ? ` (${ctx.video.offset} s)` : ''}` : `${ctx.footage.length} footage clip${ctx.footage.length === 1 ? '' : 's'}, cut on the beat`);
  } else if (id === 'st-coversheet') {
    if (!ctx.coverRec) return { ok: false, uses: [], missing: `Add cover art to “${title}” (its Overview or a release).` };
    uses.push('The cover art, blurred into its colours');
  } else {
    const pic = (ctx.footage || []).length ? 'your footage' : ctx.video ? 'the music video' : ctx.coverRec ? 'the cover' : '';
    const noSections = !partSections(ctx.song, ctx.audio.duration || 0).length;
    uses.push(
      id === 'st-bloodslam' ? `Black, deep red and ash backdrops by section${pic ? `, with ${pic} dimmed under them` : ''}`
        : id === 'st-screamclean' ? `Scream lines on the left, clean lines on the right${pic ? `, over ${pic} dimmed` : ' on black'}${noSections ? '. No sections yet, so the lines alternate two by two (detect the sections to scream the choruses)' : ''}`
        : id === 'st-tourticker' ? `A red tour-date band crawling one line per bar${pic ? ` over ${pic}` : ' on black'}, with spectrum bars`
        : id === 'st-ashdissolve' ? `Letters that turn to ash as each line ends${pic ? `, over ${pic} dimmed and grey` : ' on black'}`
        : id === 'st-ransom' ? 'Paper strips on a solid deep red page'
        : `Glow visualizer${pic ? ` over ${pic}, dimmed` : ' on black'}`,
    );
  }
  uses.push(lyricsUse(ctx));
  const out = { ok: true, uses, missing: '' };
  if (id === 'st-glowslam') {
    const lines = ctx.hasLyrics && ctx.lyrics ? ctx.lyrics : ctx.song.lyricTiming ? lyricsFromTiming(ctx.song.lyricTiming, () => '') : [];
    const w = wordTimesIn(lines, ranges);
    if (!w.timed) {
      uses.push('No saved word times: each word gets an even share of its line. Auto-sync the lyrics for words on the beat');
      out.autosync = true;
    } else uses.push(`Saved word times on ${w.timed} of ${w.total} lines`);
  }
  return out;
}

/** The key word of a line: its longest word that is not a small one (4+ letters), or -1. */
const SMALL = new Set(['that', 'this', 'with', 'from', 'your', 'have', 'they', 'them', 'then', 'there', 'their', 'what', 'when', 'were', 'will', 'into', 'just', 'like', 'been', 'over']);
export function keyWord(text) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (words.length < 2) return -1;
  let best = -1;
  let len = 3;
  words.forEach((w, i) => {
    const p = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    if (p.length > len && !SMALL.has(p)) (best = i), (len = p.length);
  });
  return best;
}
const autoEmph = (line) => {
  const i = keyWord(line.text);
  return i < 0 ? null : { words: [{ i, w: String(line.text).split(/\s+/).filter(Boolean)[i] }], slam: true };
};
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Undo what a lyric template did to lines before (an auto key word, the chorus flash look): lines you set stay. */
function clearTemplateMarks(d) {
  for (const l of d.lyrics) {
    const a = l.emph && autoEmph(l);
    if (a && sameJson(l.emph, a)) delete l.emph;
  }
  // lines wearing exactly a template's own look: the chorus flash, Scream/Clean's two sides, the zine's big chorus strips
  for (const st of [{ hit: 'line' }, SPLIT_LOOKS.scream, SPLIT_LOOKS.clean, ZINE_BIG]) {
    const ids = d.lyrics.filter((l) => l.style && sameJson(l.style, st)).map((l) => l.id);
    if (ids.length) changeLook(d, ids[0], () => undefined, { ids });
  }
}

/**
 * The shared lyric style for a template: the look theme's fields and effect settings with the template's own on
 * top, applied with applySharedTheme so lines with a look of their own keep drawing as before.
 */
function lyricLook(d, theme, over = {}, fx = {}) {
  const fields = { display: 'line', align: 'center', side: 'center', hit: '', echo: '', ...(theme ? theme.fields : {}), ...over };
  const allFx = { ...((theme && theme.fx) || {}), ...fx };
  applySharedTheme(d, { fields, fx: Object.keys(allFx).length ? allFx : null });
}

/** The lyric y in the clear area: f 0 (top) .. 1 (bottom). */
const yIn = (d, f) => {
  const A = areaOf(d.layout);
  return +((A.y0 + A.h * f) * 100).toFixed(1);
};

/** Blood Slam backdrops: the picture dimmed under black, a deep red wash, or ash-grey haze. */
export const BLOOD_BACKDROPS = {
  black: { filter: { preset: 'none', adjust: { brightness: 0.22, saturate: 0 } }, grade: null },
  red: { filter: { preset: 'none', adjust: { brightness: 0.28, saturate: 0 } }, grade: { preset: 'custom', shadows: '#a0000f', shadowsAmt: 1, highlights: '#ff2a2a', highlightsAmt: 0.5 } },
  ash: { filter: { preset: 'none', adjust: { brightness: 0.42, saturate: 0, contrast: 0.8 } }, grade: { preset: 'custom', fade: 0.45 } },
};
/** Which backdrop a section gets: chorus red, breakdown / bridge / solo ash, the rest black. */
export function bloodBackdrop(label, dflt = 'black') {
  if (label == null) return dflt;
  const k = sectionKind(label);
  return k === 'chorus' ? 'red' : k === 'breakdown' || k === 'bridge' || k === 'solo' ? 'ash' : 'black';
}

/** Blood Slam's video track: one clip per section stretch of each part, each with its section's backdrop: { clips, backs }. */
function bloodClips(lay, ctx, sections, dflt) {
  const src = (ctx.footage || []).length ? 'footage' : ctx.video ? 'video' : ctx.coverRec ? 'cover' : null;
  if (!src) return { clips: [], backs: [] };
  const segs = [];
  lay.parts.forEach((q, i) => {
    const end = i < lay.parts.length - 1 ? q.from + (lay.parts[i + 1].at - q.at) : q.to;
    const cuts = [q.from, ...sections.map((s) => s.start).filter((t) => t > q.from + 0.5 && t < end - 0.5), end];
    for (let k = 0; k < cuts.length - 1; k++) {
      const sec = sectionAt(sections, cuts[k] + 0.05);
      segs.push({ from: cuts[k], len: cuts[k + 1] - cuts[k], back: bloodBackdrop(sec ? sec.label : null, dflt), first: k === 0, part: i });
    }
  });
  let n = 0;
  const clips = segs.map((s) => {
    const rec = src === 'footage' ? ctx.footage[n % ctx.footage.length] : src === 'video' ? ctx.video.rec : ctx.coverRec;
    const room = Math.max(0, (rec.duration || 0) - s.len);
    const at = src === 'video' ? s.from + (ctx.video.offset || 0) : src === 'footage' && room ? (n * 2.7) % room : 0;
    n++;
    const transition = !s.first ? { type: 'none', duration: 0.3 } : s.part === 0 ? { type: 'fade', duration: 0.4 } : lay.fade > 0 ? { type: 'crossfade', duration: Math.max(0.1, lay.fade) } : { type: 'none', duration: 0.3 };
    const b = BLOOD_BACKDROPS[s.back];
    return { ...clipOf(rec, at, s.len, { transition, effects: { beatPulse: 0.3 } }), filter: structuredClone(b.filter), grade: b.grade && structuredClone(b.grade) };
  });
  return { clips, backs: segs.map((s) => s.back) };
}

/** Glow Slam: each line in the ranges becomes one line per word, on its saved word times or an even share. */
export function oneWordLines(lyrics, ranges) {
  const inPart = new Set(linesInParts(lyrics, ranges).map((l) => l.id));
  let split = 0;
  let timed = 0;
  const out = [];
  for (const l of lyrics) {
    const words = String(l.text || '').split(/\s+/).filter(Boolean);
    if (!inPart.has(l.id) || words.length < 2) {
      out.push(l);
      continue;
    }
    const saved = savedWordTimes(l);
    const span = l.end - l.start;
    const times = saved || wordTimings(l.text).map((w) => ({ word: w.word, start: l.start + w.start * span, end: l.start + w.end * span }));
    split++;
    if (saved) timed++;
    times.forEach((w, i) => {
      const start = r3(w.start);
      const end = r3(Math.max(start + 0.05, i < times.length - 1 ? times[i + 1].start : l.end));
      const x = { id: uid('lyr'), text: w.word, start, end };
      if (saved) x.words = [{ w: w.word, t: start, end }];
      if (l.style) x.style = structuredClone(l.style);
      if (l.fx) x.fx = structuredClone(l.fx);
      out.push(x);
    });
  }
  return { lyrics: out, split, timed };
}

function glowViz(d, color) {
  d.layers = (d.layers || []).filter((l) => !(l.type === 'viz' && l.fromTemplate));
  d.layers.push({ ...defaultVizLayer(), id: uid('lyr'), type: 'viz', name: 'Glow visualizer', visible: true, fromTemplate: true, style: 'glow', blend: 'screen', color, color2: '#ffffff', intensity: 0.75 });
}

/** Scream/Clean Split: each kind of line's own look (side, preset, flash and shake for the screamed ones). */
export const SPLIT_LOOKS = {
  scream: { preset: 'scream', side: 'left', hit: 'line', fx: { shake: 0.35, shakeSpeed: 1.2, shakeBeat: true, glitchAmt: 1.3 } },
  clean: { preset: 'clean', side: 'right' },
};
/** Sections whose lines are screamed (the rest are sung clean). */
const SCREAMED = new Set(['chorus', 'breakdown']);
/** Is a line in the section `label` screamed or clean? With no section: null. */
export const vocalOf = (label) => (label == null ? null : SCREAMED.has(sectionKind(label)) ? 'scream' : 'clean');

/** Ransom Note Zine: the page, and the bigger look of chorus lines. */
export const ZINE_RED = '#7a0010';
const ZINE_BIG = { size: 11 };

/** The picture under a lyric template: your footage, else the music video, else the cover (else none). */
const underPicture = (ctx) => ((ctx.footage || []).length ? 'footage' : ctx.video ? 'video' : ctx.coverRec ? 'cover' : null);

/** Build one of the lyric-video templates (see SONG_TEMPLATES). Returns the facts for the toast. */
function applyLyricTemplate(d, id, ctx, part, facts) {
  const own = part ? null : ownWindow(id, ctx);
  const dur = ctx.audio.duration || 0;
  const look = ctx.look || (SONG_TEMPLATES.find((t) => t.id === id).looks || [[null]])[0][0];
  hideParts(d);
  d.layers = (d.layers || []).filter((l) => !(l.type === 'viz' && l.fromTemplate));
  if (d.background === ZINE_RED) d.background = '#000000'; // the zine's page, from an earlier apply
  if (!d.song || d.song.mediaId !== ctx.audio.id) d.song = { mediaId: ctx.audio.id, offset: 0, volume: 1, fadeIn: 0.3, fadeOut: 1.2 };
  Object.assign(d.song, { offset: part ? part.parts[0].from : own.start, fadeIn: 0.3 });
  if (ctx.beats) d.beats = ctx.beats;
  endCardFor(d, ctx, ctx.today || '');
  facts.push(part ? `${part.parts.map((q) => q.label).join(', ')} (${fmtTime(part.length)})` : own.text);
  if (own && own.chorus && id !== 'st-coversheet') chorusLyricsOn(d, ctx, { start: own.start, len: own.len }, facts);
  else lyricsOn(d, ctx, facts);
  // the part (or the template's own pick, shown as the Song part so it can be changed there)
  const choice = part ? ctx.part : { kind: 'range', from: own.start, to: r3(Math.min(dur || Infinity, own.start + own.len)) };
  applySongPart(d, choice, { ...ctx, picture: 'keep' });
  if (part) d.songPart.template = id;
  else d.songPart.byTemplate = id;
  const lay = part || partLayout([{ from: choice.from, to: choice.to, label: own.label }]);
  const ranges = lay.parts.map(({ from, to }) => ({ from, to }));
  const sections = partSections(ctx.song, dur);
  clearTemplateMarks(d);
  d.texts = [];
  Object.assign(d.look, { vignette: 0.45, grain: 0.2, lightLeak: 0, scanlines: 0, beatFlash: 0, letterbox: 0 });

  if (id === 'st-bloodslam') {
    // no sections, or the template's own chorus: the whole stretch is a chorus
    const dflt = !sections.length || (own && own.chorus) ? 'red' : 'black';
    const blood = bloodClips(lay, ctx, sections, dflt);
    d.clips = blood.clips;
    lyricLook(d, themeById('bloodash'), { font: 'Bebas Neue', size: 12, uppercase: true, box: false, y: 50 });
    Object.assign(d.look, { vignette: 0.5, grain: 0.3, beatFlash: 0.12 });
    // a key word in each line slams; chorus lines flash on their first word (lines you styled keep their look)
    let keys = 0;
    const chorusIds = [];
    for (const l of linesInParts(d.lyrics, ranges)) {
      if (!l.emph) {
        const e = autoEmph(l);
        if (e) (l.emph = e), keys++;
      }
      const sec = sectionAt(sections, (l.start + l.end) / 2);
      const chorus = sec ? sectionKind(sec.label) === 'chorus' : dflt === 'red';
      if (chorus && !(l.style && Object.keys(l.style).length)) chorusIds.push(l.id);
    }
    if (chorusIds.length) changeLook(d, chorusIds[0], (st) => ({ ...(st || {}), hit: 'line' }), { ids: chorusIds });
    Object.assign(d.endCard, { animation: 'drop', background: 'color', bgColor: '#0d0d0d', cta: d.endCard.cta, accent: '#e0182d', textColor: '#f2ede4', font: 'Bebas Neue' });
    const backs = [...new Set(blood.backs)];
    facts.push(d.clips.length ? `${d.clips.length} backdrop${d.clips.length === 1 ? '' : 's'} by section (${backs.join(', ')})` : 'Black backdrop (add footage, the music video or cover art to the song for the red and ash sections)');
    facts.push(`${keys} key word${keys === 1 ? '' : 's'} slam, ${chorusIds.length} chorus line${chorusIds.length === 1 ? '' : 's'} flash, shake on the beat`);
  } else if (id === 'st-glowslam') {
    const neon = look === 'neon';
    const pic = (ctx.footage || []).length ? 'footage' : ctx.video ? 'video' : ctx.coverRec ? 'cover' : null;
    d.clips = (pic && pictureFor(pic, lay, ctx)) || [];
    for (const c of d.clips) Object.assign(c, { filter: { preset: 'none', adjust: { brightness: 0.35, saturate: 0.7 } }, grade: neon ? GR('cyberpunk') : { preset: 'custom', temperature: 0.5, shadows: '#3a0800', shadowsAmt: 0.6 }, effects: { beatPulse: 0.5 } });
    const accent = neon ? '#ff2bd6' : '#ff4d00';
    lyricLook(d, themeById(neon ? 'neonpink' : 'hellfire'), { font: 'Montserrat', size: 13, uppercase: true, animation: 'tracking', hit: 'line', echo: 'behind', outAnimation: neon ? 'flicker' : 'zoomout', y: 50 }, { trackAmt: 1.2, echoAmt: 1.4, flashAmt: 0.9 });
    const w = oneWordLines(d.lyrics, ranges);
    d.lyrics = w.lyrics;
    glowViz(d, accent);
    Object.assign(d.look, { vignette: 0.5, grain: 0.15, beatFlash: 0.3, scanlines: neon ? 0.15 : 0 });
    Object.assign(d.endCard, { animation: 'zoom', background: 'blur', accent, font: 'Montserrat' });
    facts.push(neon ? 'Neon look' : 'Hellfire look', w.split ? `${w.split} line${w.split === 1 ? '' : 's'} shown one word at a time (Undo to get the lines back)` : 'One word at a time');
    if (w.split && w.timed < w.split) facts.push(`${w.timed ? `${w.split - w.timed} of them have` : 'The song has'} no saved word times, so the words share their line evenly: undo, Auto-sync the lyrics on the Lyrics tab, then apply again for words on the beat`);
  } else if (id === 'st-screamclean') {
    const pic = underPicture(ctx);
    d.clips = (pic && pictureFor(pic, lay, ctx)) || [];
    for (const c of d.clips) Object.assign(c, { filter: { preset: 'none', adjust: { brightness: 0.4, saturate: 0.55 } }, grade: GR('moody'), effects: { beatPulse: 0.3 } });
    // shared style = the clean look; the red accent is what the screamed preset takes its colour from
    lyricLook(d, themeById('cleanwhite'), { font: 'Montserrat', size: 9, color: '#f2ede4', highlight: '#e0182d', maxWidth: 84, y: 50 }, { shake: 0, shakeBeat: false });
    Object.assign(d.look, { vignette: 0.5, grain: 0.25, beatFlash: 0.1 });
    // each line in the part: screamed (left) or clean (right) by its section; lines with a look of your own stay as they are
    const mine = linesInParts(d.lyrics, ranges).filter((l) => !(l.style && Object.keys(l.style).length));
    const kinds = { scream: [], clean: [] };
    mine.forEach((l, i) => {
      const sec = sectionAt(sections, (l.start + l.end) / 2);
      kinds[(sections.length ? vocalOf(sec ? sec.label : null) : null) || (Math.floor(i / 2) % 2 ? 'clean' : 'scream')].push(l.id);
    });
    for (const k of ['scream', 'clean']) if (kinds[k].length) changeLook(d, kinds[k][0], () => structuredClone(SPLIT_LOOKS[k]), { ids: kinds[k] });
    Object.assign(d.endCard, { animation: 'glitch', background: 'color', bgColor: '#0d0d0d', accent: '#e0182d', textColor: '#f2ede4', font: 'Bebas Neue' });
    facts.push(`${kinds.scream.length} screamed line${kinds.scream.length === 1 ? '' : 's'} on the left, ${kinds.clean.length} clean on the right${sections.length ? ' (by section)' : ' (no sections: alternating two by two)'}`);
    if (mine.length < linesInParts(d.lyrics, ranges).length) facts.push('Lines with a look of your own kept it');
  } else if (id === 'st-tourticker') {
    const pic = underPicture(ctx);
    d.clips = (pic && pictureFor(pic, lay, ctx)) || [];
    for (const c of d.clips) Object.assign(c, { filter: { preset: 'none', adjust: { brightness: 0.85 } }, grade: null, effects: {} });
    // the band holds the lines of the part only: it crawls through every line the edit has, from the first
    const all = d.lyrics.length;
    d.lyrics = linesInParts(d.lyrics, ranges);
    lyricLook(d, null, { ...DISPLAY_DEFAULTS.ticker, display: 'ticker', font: 'Bebas Neue', size: 6.5, color: '#f2ede4', highlight: '#ffd400', outlineWidth: 0, shadow: false, uppercase: true, animation: 'none', outAnimation: '', box: false, boxColor: '#b3001b', boxOpacity: 0.92, align: 'left', maxWidth: 84, y: 74 }, { tickerLock: 1, tickerSpeed: 1, tickerGap: 1.1, shake: 0 });
    glowViz(d, '#ff2a2a');
    const bars = d.layers[d.layers.length - 1];
    Object.assign(bars, { name: 'Spectrum bars', style: 'bars', blend: 'screen', y: 90, size: 80, intensity: 0.8, color2: '#ffd400' });
    d.texts = [{ id: uid('txt'), text: [ctx.band, ctx.song.title].filter(Boolean).join(' · ').toUpperCase(), start: 0.3, end: Math.max(1, d.duration - (d.endCard.enabled ? d.endCard.duration : 0)), x: 50, y: 12, size: 4.2, font: 'Bebas Neue', color: '#f2ede4', outline: '#000000', box: false, animation: 'fade' }].filter((x) => x.text);
    Object.assign(d.look, { vignette: 0.35, grain: 0.15, beatFlash: 0 });
    Object.assign(d.endCard, { animation: 'rise', background: 'blur', accent: '#e0182d', textColor: '#f2ede4', font: 'Bebas Neue' });
    facts.push(`${d.lyrics.length} line${d.lyrics.length === 1 ? '' : 's'} in the band, one per bar${all > d.lyrics.length ? ` (${all - d.lyrics.length} outside this part left out: Undo brings them back)` : ''}`, 'Spectrum bars under the band');
  } else if (id === 'st-ashdissolve') {
    const pic = underPicture(ctx);
    const ash = BLOOD_BACKDROPS.ash;
    d.clips = (pic && pictureFor(pic, lay, ctx)) || [];
    for (const c of d.clips) Object.assign(c, { filter: { preset: 'none', adjust: { brightness: 0.34, saturate: 0, contrast: 0.85 } }, grade: structuredClone(ash.grade), effects: {} });
    lyricLook(d, themeById('funeral'), { font: 'Playfair Display', size: 7.5, uppercase: false, animation: 'tracking', outAnimation: 'ash', outDuration: 1, maxWidth: 80, y: 50 }, { trackAmt: 0.8, ashDrift: 1.2, ashBlur: 1.1, ashStagger: 1, shake: 0.08, shakeSpeed: 0.25, shakeDir: 'y' });
    Object.assign(d.look, { vignette: 0.65, grain: 0.35 });
    Object.assign(d.endCard, { animation: 'rise', background: 'color', bgColor: '#0b0b0d', accent: '#c08a3e', textColor: '#d9c9a8', font: 'Playfair Display' });
    facts.push(d.clips.length ? 'The picture dimmed, grey and dark' : 'Black backdrop (add footage, the music video or cover art to the song for a picture)', 'Each line turns to ash as it ends');
  } else if (id === 'st-ransom') {
    d.clips = [];
    d.background = ZINE_RED;
    lyricLook(d, null, { font: 'Bebas Neue', size: 8, color: '#f4efe3', highlight: '#f4efe3', outline: '#000000', outlineWidth: 0, shadow: false, uppercase: true, animation: 'paper', outAnimation: '', box: false, maxWidth: 84, y: 50 }, { paperTilt: 1.2, paperFonts: 1, paperJump: 1.2, shake: 0 });
    Object.assign(d.look, { vignette: 0.45, grain: 0.5, scanlines: 0.25, beatFlash: 0 });
    // chorus lines get bigger strips
    const bigIds = linesInParts(d.lyrics, ranges).filter((l) => {
      if (l.style && Object.keys(l.style).length) return false;
      const sec = sectionAt(sections, (l.start + l.end) / 2);
      return sec ? sectionKind(sec.label) === 'chorus' : own && own.chorus;
    }).map((l) => l.id);
    if (bigIds.length) changeLook(d, bigIds[0], () => structuredClone(ZINE_BIG), { ids: bigIds });
    Object.assign(d.endCard, { animation: 'glitch', background: 'color', bgColor: ZINE_RED, accent: '#f4efe3', textColor: '#f4efe3', font: 'Bebas Neue' });
    facts.push('A solid deep red page with grain and scanlines', `Paper strips jump on the beat${bigIds.length ? `, ${bigIds.length} chorus line${bigIds.length === 1 ? '' : 's'} bigger` : ''}`);
  } else if (id === 'st-stage') {
    const frost = look === 'frostbite';
    d.clips = pictureFor(ctx.video ? 'video' : 'footage', lay, ctx) || [];
    d.clips.forEach((c, i) => {
      c.grade = GR(frost ? 'cold' : 'moody');
      c.filter = { preset: 'none', adjust: { brightness: 0.85 } };
      c.effects = {};
      if (c.kind === 'video' && ctx.video && c.mediaId === ctx.video.rec.id) c.kenBurns = { fromZoom: 1, toZoom: 1.06, fromX: 0, toX: 0, fromY: 0, toY: 0 };
      if (i && c.transition.type === 'none' && !ctx.video) c.transition = { type: 'crossfade', duration: 0.5 };
    });
    lyricLook(d, themeById(frost ? 'frostbite' : 'funeral'), { ...(frost ? { font: 'Georgia', outAnimation: 'blur' } : {}), size: 4.6, uppercase: false, animation: 'tracking', echo: 'trail', maxWidth: 80, y: 76 }, { trackAmt: 0.7, echoAmt: 0.8 });
    Object.assign(d.look, { vignette: 0.45, grain: 0.3, letterbox: 0.55 });
    Object.assign(d.endCard, { animation: 'vinyl', background: 'blur', accent: frost ? '#9fb4c7' : '#c08a3e', font: frost ? 'Georgia' : 'Playfair Display' });
    facts.push(ctx.video ? `The music video on its saved sync${ctx.video.offset ? ` (${ctx.video.offset} s)` : ''}` : `${d.clips.length} footage cuts on the beat`, `${frost ? 'Frostbite' : 'Funeral Doom'} lyrics in the lower third`);
  } else {
    d.clips = pictureFor('cover', lay, ctx) || [];
    for (const c of d.clips) Object.assign(c, { filter: { preset: 'none', adjust: { blur: 18, brightness: 0.55, saturate: 1.5 } }, grade: null, effects: {}, kenBurns: { fromZoom: 1.2, toZoom: 1.35, fromX: -0.2, toX: 0.2, fromY: 0, toY: 0 } });
    lyricLook(d, null, { ...DISPLAY_DEFAULTS.sheet, display: 'sheet', font: 'Montserrat', size: 7.5, color: '#ffffff', highlight: '#ffd400', outline: '#000000', outlineWidth: 0, shadow: true, animation: 'karaoke', box: false });
    Object.assign(d.look, { vignette: 0.4, grain: 0.1 });
    Object.assign(d.endCard, { animation: 'vinyl', background: 'blur', accent: '#ffd400', font: 'Montserrat' });
    facts.push('The lyric sheet over the blurred cover');
  }
  // keep the lyrics in the platform's clear area
  if (d.layout) applyLayout(d, d.layout);
  if (id === 'st-coversheet') (lyricsIntoLayout(d), (d.lyricStyle.y = yIn(d, 0.5)));
  else d.lyricStyle.y = d.layout ? yIn(d, id === 'st-stage' ? 0.88 : id === 'st-tourticker' ? 0.8 : 0.5) : d.lyricStyle.y;
  d.template = id;
  facts.push(`Ends on the end card for “${ctx.song.title}”${ctx.cover ? ' with its cover' : ''}`);
  return facts;
}
