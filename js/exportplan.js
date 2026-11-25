// Fast export planning: which frames to draw, which sounds to mix and how loud, which codecs to try.
// Pure (unit tested); js/fastexport.js runs the plan in the browser.
import { layoutClips, hasSongParts, timelineToSong } from './core.js';
import { isVisible } from './state.js';

/** How many frames a from..to export has at `fps` (at least one). */
export const frameCount = (from, to, fps) => Math.max(1, Math.round((to - from) * fps));
/** The timeline time of frame `i`. */
export const frameTime = (i, from, fps) => from + i / fps;
/** Frame `i`'s timestamp in the file, in microseconds (frame 0 is at 0). */
export const frameUs = (i, fps) => Math.round((i * 1e6) / fps);
/** A key frame every `every` seconds, so a player can seek in the file. */
export const isKeyFrame = (i, fps, every = 2) => i % Math.max(1, Math.round(fps * every)) === 0;

/**
 * The corners of fadeGain(t, start, end, fadeIn, fadeOut) times `vol`, as [time, gain] pairs in export time
 * (0 = `from`), trimmed to the export. Straight lines between them give the same loudness as fadeGain.
 */
export function gainPoints(start, end, fadeIn, fadeOut, vol, from, to) {
  const lo = Math.max(start, from);
  const hi = Math.min(end, to);
  if (!(hi > lo) || !(vol > 0)) return [];
  const g = (t) => {
    let v = 1;
    if (fadeIn > 0 && t < start + fadeIn) v = Math.min(v, (t - start) / fadeIn);
    if (fadeOut > 0 && t > end - fadeOut) v = Math.min(v, (end - t) / fadeOut);
    return Math.max(0, Math.min(1, v)) * vol;
  };
  const ts = [lo, hi];
  for (const t of [start + fadeIn, end - fadeOut]) if (t > lo && t < hi) ts.push(t);
  // a fade-in longer than the gap to the fade-out meets it in a peak
  if (fadeIn > 0 && fadeOut > 0 && start + fadeIn > end - fadeOut) {
    const meet = (fadeIn * end + fadeOut * start) / (fadeIn + fadeOut);
    if (meet > lo && meet < hi) ts.push(meet);
  }
  const pts = [...new Set(ts)].sort((a, b) => a - b).map((t) => [+(t - from).toFixed(6), +g(t).toFixed(6)]);
  return pts;
}

/**
 * Every sound the export mixes, the same ones Engine._sync plays: the song (or its sections), audio blocks,
 * the sound of video clips and of visualizer stems set to play. Each item: mediaId, `at` (export seconds it
 * starts), `offset` (seconds into its file), `dur` (export seconds it plays), `rate` and gain `points`.
 * `realtime` names a reason the fast mix cannot match the preview (then the real-time export is used).
 */
export function audioPlan(p, from, to) {
  const items = [];
  let realtime = '';
  const vis = (k) => isVisible(p, k);
  // one stretch of a file: timeline [start, end), file time = target0 + (t - start) * rate
  const add = (mediaId, start, end, target0, rate, volume, fadeIn, fadeOut) => {
    const lo = Math.max(start, from);
    const hi = Math.min(end, to);
    if (!(hi > lo) || !(volume > 0)) return;
    let offset = target0 + (lo - start) * rate;
    let at = lo - from;
    // the file has not started yet at `lo` (a negative song offset): wait until it does
    if (offset < 0) {
      at += -offset / rate;
      offset = 0;
    }
    const dur = hi - from - at;
    if (dur <= 0) return;
    items.push({ mediaId, at: +at.toFixed(6), offset: +offset.toFixed(6), dur: +dur.toFixed(6), rate, points: gainPoints(start, end, fadeIn, fadeOut, volume, from, to) });
  };
  if (p.song && p.song.mediaId) {
    const vol = vis('song') ? p.song.volume ?? 1 : 0;
    if (!hasSongParts(p.song)) add(p.song.mediaId, 0, p.duration, p.song.offset || 0, 1, vol, p.song.fadeIn || 0, p.song.fadeOut || 0);
    else {
      const fade = Math.max(0.02, (p.song.join && p.song.join.fade) || 0);
      const parts = p.song.parts;
      parts.forEach((q, i) => {
        const last = i === parts.length - 1;
        add(p.song.mediaId, q.at, last ? p.duration : q.at + (q.to - q.from), q.from, 1, vol, i ? fade : p.song.fadeIn || 0, last ? p.song.fadeOut || 0 : fade);
      });
    }
  }
  for (const a of p.audioTracks || []) {
    if (a.disabled) continue;
    add(a.mediaId, a.start, a.start + a.duration, a.in || 0, 1, vis(`audio:${a.id}`) ? a.volume ?? 1 : 0, a.fadeIn || 0, a.fadeOut || 0);
  }
  const clipSound = (clip, start, end) => {
    if (clip.kind !== 'video' || clip.disabled || !(clip.volume > 0)) return;
    const speed = clip.speed || 1;
    // the preview keeps a sped-up clip's pitch; a plain resample would not
    if (speed !== 1 && !realtime) realtime = 'a sped-up or slowed clip has its sound on';
    add(clip.mediaId, start, end, clip.in || 0, speed, clip.volume, 0.05, 0.05);
  };
  for (const l of layoutClips(p.clips || [])) clipSound(l.clip, l.start, l.end);
  for (const l of p.layers || []) {
    if (l.type === 'video' && l.visible !== false) for (const c of l.clips || []) clipSound(c, c.start, c.start + c.duration);
    if (l.type !== 'viz' || !l.playAudio || l.visible === false || l.source === 'song') continue;
    if (hasSongParts(p.song)) {
      if (!realtime) realtime = 'a visualizer plays its stem over a song cut into sections';
      continue;
    }
    add(l.source, 0, p.duration, timelineToSong(0, p.song) - (l.offset || 0), 1, l.volume ?? 1, 0, 0.3);
  }
  return { items, realtime };
}

/** Video codecs to try for a format, best first (H.264 level 4.0 fits 1080p at 30 fps, 4.2 at 60). */
export function videoCodecs(format, fps, codec = 'h264') {
  if (format === 'mp4' && codec === 'hevc') {
    // HEVC main profile, level 4.0 (1080p at 30 fps) or 4.1 (60 fps); hvc1 first (what QuickTime and Instagram read), then hev1
    const lv = fps > 30 ? 'L123' : 'L120';
    return ['hvc1', 'hev1'].map((tag) => ({ codec: `${tag}.1.6.${lv}.B0`, mux: 'hevc' }));
  }
  if (format === 'mp4') {
    const lv = fps > 30 ? '2a' : '28';
    return ['avc1.6400', 'avc1.4d00', 'avc1.42e0'].map((c) => ({ codec: c + lv, mux: 'avc' }));
  }
  // VP8 first: browsers encode it in software about twice as fast as VP9 (measured 0.8 vs 1.7 s per second of
  // 1080p video in Firefox), and at these bitrates it looks the same
  return [
    { codec: 'vp8', mux: 'V_VP8' },
    { codec: 'vp09.00.40.08', mux: 'V_VP9' },
    { codec: 'vp09.00.10.08', mux: 'V_VP9' },
  ];
}

/** Audio codecs for a format: AAC in MP4 (what Instagram and TikTok expect), Opus in WebM. */
export const audioCodecs = (format) => (format === 'mp4' ? [{ codec: 'mp4a.40.2', mux: 'aac' }] : [{ codec: 'opus', mux: 'A_OPUS' }]);

/** A short name for the codec an export used, from its WebCodecs codec string. */
export const codecLabel = (codec) => (/^(hvc1|hev1)/.test(codec) ? 'HEVC (H.265)' : /^avc/.test(codec) ? 'H.264' : /^vp09/.test(codec) ? 'VP9' : /^vp8/.test(codec) ? 'VP8' : String(codec));

/** Seconds of export per second of video: how long it took over how long the video is. */
export const speedRatio = (seconds, videoSeconds) => (videoSeconds > 0 ? +(seconds / videoSeconds).toFixed(3) : 0);

/** Which of the decoded frames (their times, ascending) a clip shows at time t: the last one at or before t, else the first. */
export function pickFrame(times, t, eps = 1e-4) {
  if (!times.length) return -1;
  let best = 0;
  for (let i = 0; i < times.length; i++) if (times[i] <= t + eps) best = i;
  return best;
}

/** Where to start decoding for time t: the last key frame at or before t, in decode order (0 if none). */
export function keyBefore(order, t, eps = 1e-4) {
  let k = 0;
  for (let i = 0; i < order.length; i++) if (order[i].key && order[i].ts <= t + eps) k = i;
  return k;
}
