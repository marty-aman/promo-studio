// Moving a video clip's in-point (Sound sync drag, nudges, "Line it up by listening", the before/after box) without
// it snapping back. The in-point can't go before the file's 0:00 or past its end, so instead of clamping silently:
//  - a clip that would run past the end of the file gets shorter (it ends where the video ends);
//  - a video whose 0:00 should play AFTER this moment of the song (it starts partway into the song) keeps in = 0 and
//    moves later: an overlay clip starts later on its layer; a main-lane clip (the main lane always starts at 0:00)
//    keeps its place and the song plays from further in instead;
//  - each of those comes with a plain note for a toast. Pure, unit tested.

const r3 = (v) => +(+v).toFixed(3);
const MIN_LEN = 0.2;
const fmtS = (v) => `${(+v).toFixed(2)} s`;
const fmtT = (v) => {
  const m = Math.floor(v / 60);
  const s = v - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
};

/**
 * Where the clip goes when its in-point should be `want` (seconds into the file, may be negative or past the end).
 * from: { in, duration, speed, start, layer, songOffset, songLen, fileLen } as the clip and song are now (or were when
 * a drag began). Returns { in, duration, start, songOffset, note } (note '' when it went exactly where asked).
 */
export function placeIn(want, from) {
  const speed = from.speed || 1;
  const fileLen = Number.isFinite(from.fileLen) && from.fileLen > 0 ? from.fileLen : Infinity;
  const out = { in: r3(from.in || 0), duration: r3(from.duration), start: r3(from.start || 0), songOffset: r3(from.songOffset || 0), note: '' };
  if (!Number.isFinite(want)) return out;
  const notes = [];
  let v = want;
  if (v < 0) {
    // the video's 0:00 belongs later on the timeline than this clip's start
    const gap = -v / speed;
    v = 0;
    if (from.layer) {
      out.start = r3(out.start + gap);
      notes.push(`This video starts after the song here, so the clip now starts ${fmtS(gap)} later on its layer.`);
    } else {
      const max = Number.isFinite(from.songLen) && from.songLen > 1 ? from.songLen - 1 : Infinity;
      const want2 = out.songOffset + gap;
      out.songOffset = r3(Math.min(want2, max));
      notes.push(want2 > max
        ? `This video starts too far into the song to line up here: the song already plays from as late as it can (${fmtT(out.songOffset)}).`
        : `This video starts ${fmtS(gap)} after the song here, so the song now plays from ${fmtT(out.songOffset)} (Audio tab, “Song starts at”) to stay with it.`);
    }
  }
  const last = Number.isFinite(fileLen) ? Math.max(0, fileLen - MIN_LEN * speed) : Infinity;
  if (v > last) {
    v = last;
    notes.push('That is past the end of this video, so the clip plays its last moment.');
  }
  out.in = r3(v);
  if (Number.isFinite(fileLen) && out.in + out.duration * speed > fileLen + 1e-6) {
    out.duration = r3(Math.max(MIN_LEN, (fileLen - out.in) / speed));
    notes.push(`The clip is now ${fmtS(out.duration)} long, so it ends where the video ends.`);
  }
  out.note = notes.join(' ');
  return out;
}

/**
 * Put the clip on sync point `point` (the video second where the song's 0:00 plays; negative when the video starts
 * partway into the song), as Sound sync's syncPoint reads it back: in − (songOffset + start).
 */
export const placeOnPoint = (point, from) => placeIn(point + (from.songOffset || 0) + (from.start || 0), from);

/** The before/after box: { dir: 'before' | 'after' | 'together', sec } for a sync point, and back. */
export function pointToDirection(point) {
  if (Math.abs(point) < 0.005) return { dir: 'together', sec: 0 };
  return point > 0 ? { dir: 'before', sec: r3(point) } : { dir: 'after', sec: r3(-point) };
}
export const directionToPoint = (dir, sec) => (dir === 'after' ? -Math.abs(+sec || 0) : dir === 'before' ? Math.abs(+sec || 0) : 0);
