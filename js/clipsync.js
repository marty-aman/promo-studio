// Lining a video clip's own sound up with the song. A clip that starts at timeline `start` with in-point `in`
// shows video second `in` at that moment, when the song is at song second `songOffset + start` (the edit's
// song starts `songOffset` seconds into the file). So the video's "sync point", the video second where the
// song's 0:00 is, is `in − (songOffset + start)` at normal speed. Pure, unit tested.
import { syncStem } from './autosync.js';

/** The video second where the song's 0:00 plays, for this clip as placed (normal speed). */
export const syncPoint = (clip, start, songOffset = 0) => +((clip.in || 0) - (songOffset + start)).toFixed(3);

/** The in-point that puts the clip on the sync point `point` (a video second at song 0:00), clamped to the file. */
export function inForSyncPoint(point, start, songOffset = 0, fileLen = Infinity, clipLen = 0) {
  const v = point + songOffset + start;
  return +Math.max(0, Math.min(v, Number.isFinite(fileLen) ? Math.max(0, fileLen - clipLen) : v)).toFixed(3);
}

/**
 * Listen to the song and the clip's video and find the in-point that lines them up:
 * { in, point, sure } or { error }. Only for normal speed: a faster or slower clip's sound can't match.
 */
export function autoLineUp(song, video, clip, start, songOffset = 0) {
  if ((clip.speed || 1) !== 1) return { error: 'Set the clip back to 1× speed to line its sound up with the song.' };
  if (!song || !song.envelope) return { error: 'The song is still being analysed.' };
  if (!video || !video.envelope) return { error: 'This video has no sound to line up (or it is still being read).' };
  const r = syncStem(song, video, { maxShift: Math.max(120, (video.duration || 0) + 10) });
  if (!r) return { error: 'The song or the video is too short to compare.' };
  // the video's 0:00 plays at song second r.offset, so the song's 0:00 is at video second −r.offset
  const point = +(-r.offset).toFixed(3);
  return { in: inForSyncPoint(point, start, songOffset, video.duration, clip.duration), point, sure: r.sure };
}

/** "the song starts 12.40 s into this video" / "the video starts 3.20 s into the song". */
export function describeSyncPoint(point) {
  if (Math.abs(point) < 0.005) return 'The song and this video start together.';
  return point > 0 ? `The song’s 0:00 is ${point.toFixed(2)} s into this video.` : `This video starts ${(-point).toFixed(2)} s into the song.`;
}
