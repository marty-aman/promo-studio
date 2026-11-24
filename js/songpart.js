// "Song part": which part of the song a video is made of. The entire song, one section (Verse 1, Chorus…),
// several sections played one after another (in song order, reordered or repeated, crossfaded or hard cut) or
// a custom range. Applying a part sets the song's stretch (song.offset, plus song.parts for several sections:
// see songToTimeline in core.js), lays the music video in sync with its saved offset (or footage on the beat,
// or the cover), moves speech captions with the song, and keeps lyrics (stored in song time, they follow by
// themselves), texts, layers and the look. Pure apart from the draft it changes; unit tested.
import { uid, beatCutPlan, linesFromText, timelineToSong, songToTimeline } from './core.js';
import { sectionSpans, numberRepeats, fmtTime } from './manager/releases.js';
import { lyricsFromTiming, markTimed } from './manager/lyrictiming.js';

export const PART_KINDS = [
  ['all', 'Entire song'],
  ['one', 'One section'],
  ['several', 'Several sections'],
  ['range', 'Custom range'],
];
export const DEFAULT_FADE = 0.3;
const r3 = (x) => +(+x).toFixed(3);

/** The song's sections that have an end, in song order, repeats numbered (Verse 1, Verse 2). */
export function partSections(song, duration = 0) {
  return numberRepeats(sectionSpans(song && song.sections, duration).filter((s) => s.end != null && s.end > s.start + 0.2));
}

/**
 * The stretches of the song a choice plays, in play order: [{ from, to, label }]. Back-to-back sections
 * (Verse 1 then Chorus, as in the song) join into one stretch. Throws an Error with a message to show.
 * choice: { kind: 'all'|'one'|'several'|'range', ids: [section id] (several: play order, repeats allowed), from, to }
 */
export function partRanges(choice, sections, duration) {
  const dur = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const c = choice || { kind: 'all' };
  if (c.kind === 'all') {
    if (!dur) throw new Error('The song file is still loading.');
    return [{ from: 0, to: r3(dur), label: 'Entire song' }];
  }
  if (c.kind === 'range') {
    const from = Math.max(0, +c.from || 0);
    const to = Math.min(dur || Infinity, +c.to);
    if (!Number.isFinite(to) || to - from < 1) throw new Error('The range needs an end at least 1 second after its start.');
    return [{ from: r3(from), to: r3(to), label: `${fmtTime(from)}–${fmtTime(to)}` }];
  }
  const byId = new Map((sections || []).map((s) => [s.id, s]));
  const picked = (c.ids || []).map((id) => byId.get(id)).filter(Boolean);
  if (!picked.length) throw new Error(c.kind === 'one' ? 'Pick a section.' : 'Tick at least one section.');
  const list = (c.kind === 'one' ? picked.slice(0, 1) : picked).map((s) => ({ from: r3(s.start), to: r3(dur ? Math.min(dur, s.end) : s.end), label: s.label }));
  const out = [];
  for (const r of list) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(r.from - prev.to) < 0.05) Object.assign(prev, { to: r.to, label: `${prev.label} + ${r.label}` });
    else out.push({ ...r });
  }
  return out;
}

/**
 * Where each stretch starts in the video. join: { kind: 'fade'|'cut', fade }. A crossfade overlaps the end of one
 * stretch with the start of the next by `fade` seconds (held under half the shortest stretch).
 * Returns { parts: [{ from, to, at, label }], length, fade }.
 */
export function partLayout(ranges, join = { kind: 'fade', fade: DEFAULT_FADE }) {
  const lens = ranges.map((r) => r.to - r.from);
  const want = join && join.kind === 'cut' ? 0 : Math.max(0, join && Number.isFinite(+join.fade) ? +join.fade : DEFAULT_FADE);
  const fade = ranges.length > 1 ? r3(Math.min(want, Math.min(...lens) / 2)) : 0;
  let at = 0;
  const parts = ranges.map((r, i) => {
    const q = { from: r.from, to: r.to, at: r3(at), label: r.label };
    at += lens[i] - fade;
    return q;
  });
  const last = parts[parts.length - 1];
  return { parts, length: r3(last.at + (last.to - last.from)), fade };
}

/** What a choice makes, for the preview before Apply: { ok, parts, length, fade, error }. */
export function describePart(choice, sections, duration) {
  try {
    const ranges = partRanges(choice, sections, duration);
    return { ok: true, ...partLayout(ranges, choice && choice.join), error: '' };
  } catch (e) {
    return { ok: false, parts: [], length: 0, fade: 0, error: e.message };
  }
}

/** Lyric lines (song time) heard in the parts. */
export function linesInParts(lyrics, parts) {
  return (lyrics || []).filter((l) => parts.some((q) => l.end > q.from + 0.1 && l.start < q.to - 0.1));
}

/** The picture to use when nothing is said: your own clips, then the music video, then footage, then the cover. */
export function defaultPicture(d, ctx) {
  if ((d.clips || []).some((c) => !c.songPart)) return 'keep';
  if (ctx.video) return 'video';
  if ((ctx.footage || []).length) return 'footage';
  if (ctx.coverRec) return 'cover';
  return 'keep';
}

const clipOf = (rec, inPoint, duration, extra = {}) => ({
  id: uid('clip'),
  mediaId: rec.id,
  kind: rec.kind === 'image' ? 'image' : 'video',
  in: rec.kind === 'image' ? 0 : r3(Math.max(0, Math.min(inPoint, Math.max(0, (rec.duration || inPoint + duration) - duration)))),
  duration: r3(duration),
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
  kenBurns: rec.kind === 'image' ? { fromZoom: 1, toZoom: 1.12, fromX: 0, toX: 0, fromY: 0, toY: 0 } : null,
  songPart: true,
  ...extra,
});

/** The video track for the parts: one music video clip per part, in sync; footage on the beat; or the cover. */
export function pictureFor(picture, layout, ctx) {
  const { parts, fade } = layout;
  const lenOf = (i) => (i < parts.length - 1 ? parts[i + 1].at - parts[i].at : parts[i].to - parts[i].from);
  const join = (i) => (i === 0 ? { type: 'fade', duration: 0.4 } : fade > 0 ? { type: 'crossfade', duration: Math.max(0.1, fade) } : { type: 'none', duration: 0.3 });
  if (picture === 'video' && ctx.video) {
    // the music video's 0:00 is `offset` seconds before the song's: the same moment as the sound
    return parts.map((q, i) => clipOf(ctx.video.rec, q.from + (ctx.video.offset || 0), lenOf(i), { transition: join(i) }));
  }
  if (picture === 'footage' && (ctx.footage || []).length) {
    const recs = ctx.footage;
    const out = [];
    let k = 0;
    parts.forEach((q, i) => {
      const len = lenOf(i);
      const grid = ctx.beats && ctx.beats.beats ? ctx.beats.beats.map((b) => b - q.from).filter((x) => x > 0 && x < len) : Array.from({ length: Math.ceil(len * 2) }, (_, j) => (j + 1) * 0.5);
      beatCutPlan(recs.map((r) => r.id), grid, 4, len).forEach((step, j) => {
        const rec = recs[k++ % recs.length];
        const room = Math.max(0, (rec.duration || 0) - step.duration);
        out.push(clipOf(rec, room ? (k * 2.7) % room : 0, step.duration, { transition: j === 0 ? join(i) : { type: 'none', duration: 0.3 } }));
      });
    });
    return out;
  }
  if (picture === 'cover' && ctx.coverRec) return [clipOf(ctx.coverRec, 0, layout.length)];
  return null;
}

/**
 * Make the edit play `choice`. ctx: { song, audio, video: { rec, offset }, footage: [rec], coverRec, beats,
 * picture: 'video'|'footage'|'cover'|'keep' }. One call is one undo step when run inside store.update.
 * Returns facts for the toast: [text]. Throws an Error with a message to show.
 */
export function applySongPart(d, choice, ctx) {
  if (!ctx || !ctx.song || !ctx.audio) throw new Error('Pick one of your songs with a song file first.');
  const sections = partSections(ctx.song, ctx.audio.duration || 0);
  const ranges = partRanges(choice, sections, ctx.audio.duration || 0);
  const join = choice.join || { kind: 'fade', fade: DEFAULT_FADE };
  const layout = partLayout(ranges, join);
  const oldSong = d.song && d.song.mediaId === ctx.audio.id ? JSON.parse(JSON.stringify(d.song)) : null;
  const facts = [];

  if (!d.song || d.song.mediaId !== ctx.audio.id) d.song = { mediaId: ctx.audio.id, offset: 0, volume: 1, fadeIn: 0.3, fadeOut: 1.2 };
  d.song.offset = layout.parts[0].from;
  if (layout.parts.length > 1) {
    d.song.parts = layout.parts.map(({ from, to, at }) => ({ from, to, at }));
    d.song.join = { kind: join.kind === 'cut' ? 'cut' : 'fade', fade: layout.fade };
  } else {
    delete d.song.parts;
    delete d.song.join;
  }
  const ec = d.endCard || {};
  d.duration = r3(layout.length + (ec.enabled ? ec.duration || 0 : 0));
  if (ctx.beats && !d.beats) d.beats = ctx.beats;
  facts.push(layout.parts.length > 1 ? `${layout.parts.map((q) => q.label).join(', ')}: ${fmtTime(layout.length)} with ${layout.fade ? `${layout.fade} s crossfades` : 'hard cuts'}` : `${layout.parts[0].label}, ${fmtTime(layout.parts[0].from)}–${fmtTime(layout.parts[0].to)} (${fmtTime(layout.length)})`);

  const picture = ctx.picture || defaultPicture(d, ctx);
  const clips = picture === 'keep' ? null : pictureFor(picture, layout, ctx);
  if (clips) {
    d.clips = clips;
    facts.push(picture === 'video' ? `The music video in sync${ctx.video.offset ? ` (its saved offset ${ctx.video.offset} s)` : ''}` : picture === 'footage' ? `${clips.length} footage cuts on the beat` : 'The cover art');
  } else {
    // your own clips stay; the song's music video among them is put back in sync with the new part
    let resynced = 0;
    if (ctx.video) {
      let t = 0;
      for (const c of d.clips || []) {
        if (c.mediaId === ctx.video.rec.id && c.kind === 'video' && (c.speed || 1) === 1) {
          const want = clipOf(ctx.video.rec, timelineToSong(t, d.song) + (ctx.video.offset || 0), c.duration).in;
          if (Math.abs(want - (c.in || 0)) > 0.0005) (c.in = want), resynced++;
        }
        t += c.duration;
      }
    }
    facts.push(resynced ? `Your clips are kept; ${resynced} music video clip${resynced === 1 ? '' : 's'} put back in sync` : 'Your clips are kept as they are');
  }

  // speech captions move with the moment of the song they were on; ones in a cut-out part go
  if (oldSong) {
    const kept = [];
    let gone = 0;
    for (const t of d.texts || []) {
      if (!t.caption) {
        kept.push(t);
        continue;
      }
      const s = timelineToSong(t.start, oldSong);
      if (!layout.parts.some((q) => s >= q.from && s < q.to)) {
        gone++;
        continue;
      }
      const shift = songToTimeline(s, d.song) - t.start;
      if (Math.abs(shift) > 0.0005) {
        t.start = r3(t.start + shift);
        t.end = r3(t.end + shift);
        if (Array.isArray(t.words)) t.words = t.words.map((w) => (w && Number.isFinite(w.start) ? { ...w, start: r3(w.start + shift), end: Number.isFinite(w.end) ? r3(w.end + shift) : w.end } : w));
      }
      kept.push(t);
    }
    d.texts = kept;
    if (gone) facts.push(`${gone} caption${gone === 1 ? '' : 's'} outside this part removed`);
  }

  // lyrics are stored in song time: the ones in these parts show by themselves. An edit with none gets the song's.
  const s = ctx.song;
  if (!s.instrumental && !(d.lyrics || []).length) {
    const timed = s.lyricTiming ? lyricsFromTiming(s.lyricTiming) : [];
    if (timed.length) {
      d.lyrics = timed;
      d.lyricsFrom = { mediaId: ctx.audio.id, source: 'timing', title: s.title, timed: true };
      d.lyricsTimed = markTimed(null, 'song', s.lyricTiming.savedAt);
    } else if (s.lyrics && s.lyrics.trim()) {
      d.lyrics = linesFromText(s.lyrics, r3(layout.parts[0].from + 0.5), 2.5);
      d.lyricsFrom = { mediaId: ctx.audio.id, source: 'manager', title: s.title };
      d.lyricsTimed = null;
    }
  }
  if (!s.instrumental) {
    const n = linesInParts(d.lyrics, layout.parts).length;
    facts.push(n ? `${n} lyric line${n === 1 ? '' : 's'} in this part, in time` : 'No lyric lines in this part');
  }

  d.songPart = {
    songId: s.id,
    kind: choice.kind,
    ids: [...(choice.ids || [])],
    from: choice.from != null ? +choice.from : null,
    to: choice.to != null ? +choice.to : null,
    join: { kind: join.kind === 'cut' ? 'cut' : 'fade', fade: join.fade != null ? +join.fade : DEFAULT_FADE },
    picture,
    length: layout.length,
  };
  d.managerSongId = s.id;
  return facts;
}

/**
 * The part a template is built for: null when the choice is the template's own pick (no choice, or kind 'own'),
 * else its layout ({ parts, length, fade }). ctx: { song, audio }. Throws an Error with a message to show.
 */
export function templatePart(choice, ctx) {
  if (!choice || choice.kind === 'own') return null;
  const dur = (ctx && ctx.audio && ctx.audio.duration) || 0;
  return partLayout(partRanges(choice, partSections(ctx.song, dur), dur), choice.join || { kind: 'fade', fade: DEFAULT_FADE });
}

/** A short fingerprint of what a template builds (clips, texts, layers, look), to tell when it was changed by hand. */
export function editSignature(d) {
  const s = JSON.stringify([d.clips || [], d.texts || [], d.layers || [], d.look || {}]);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return `${s.length.toString(36)}.${h.toString(36)}`;
}

/**
 * The part templates start on for a song: the edit's own Song part when you chose one (not Entire song, not a
 * template's pick), else the part remembered for the song, else each template's own pick ({ kind: 'own' }).
 * Entire song counts as no choice, so templates keep their own length unless you pick a part.
 */
export function defaultTemplatePart(cur, remembered, sections, duration) {
  const real = (c) => c && c.kind !== 'all' && !c.byTemplate ? usableChoice(c, sections, duration) : null;
  return real(cur && cur.same !== false ? cur : null) || real(remembered) || { kind: 'own' };
}

/** A remembered choice that still fits the song (sections may have been renamed or removed since). */
export function usableChoice(saved, sections, duration) {
  if (!saved || !PART_KINDS.some(([k]) => k === saved.kind)) return null;
  const c = { kind: saved.kind, ids: (saved.ids || []).filter((id) => sections.some((s) => s.id === id)), from: saved.from, to: saved.to, join: saved.join || { kind: 'fade', fade: DEFAULT_FADE }, picture: saved.picture };
  return describePart(c, sections, duration).ok ? c : null;
}
