// Fast export: draws the edit frame by frame at exact times and encodes it with WebCodecs, so it does not
// have to play through in real time and keeps going in a background tab. The sound is mixed offline with the
// same gains and limiter as the preview. The plan (frames, sounds, codecs) is in exportplan.js.
import { audioPlan, frameCount, frameTime, frameUs, isKeyFrame, videoCodecs, audioCodecs } from './exportplan.js';
import { renderFrame } from './renderer.js';
import { media, clipElement } from './media.js';
import { layoutClips } from './core.js';
import { openFrames, clearTracks } from './framesource.js';

const SR = 48000;

const videoConfig = (codec, w, h, fps, bitrate) => ({
  codec,
  width: w,
  height: h,
  bitrate,
  framerate: fps,
  // software VP8/VP9 in "quality" mode takes about a second a frame at 1080p; "realtime" keeps up
  latencyMode: codec.startsWith('avc') ? 'quality' : 'realtime',
  ...(codec.startsWith('avc') ? { avc: { format: 'avc' } } : {}),
});
const audioConfig = (codec) => ({ codec, sampleRate: SR, numberOfChannels: 2, bitrate: 192000 });

const supportCache = new Map();
/** Can this browser export `format` fast? { ok, video, audio, reason } (cached per format, size and rate). */
export function fastSupport(format, { w, h, fps = 30, bitrate = 10e6, audio = true } = {}) {
  const key = [format, w, h, fps, bitrate, audio].join('|');
  if (!supportCache.has(key)) supportCache.set(key, probe(format, w, h, fps, bitrate, audio));
  return supportCache.get(key);
}
async function probe(format, w, h, fps, bitrate, audio) {
  if (!window.VideoEncoder || !window.VideoFrame) return { ok: false, reason: 'this browser has no WebCodecs video encoder' };
  if (audio && (!window.AudioEncoder || !window.AudioData || !window.OfflineAudioContext)) return { ok: false, reason: 'this browser has no WebCodecs sound encoder' };
  let video = null;
  for (const c of videoCodecs(format, fps)) {
    const cfg = videoConfig(c.codec, w, h, fps, bitrate);
    try {
      if ((await VideoEncoder.isConfigSupported(cfg)).supported) {
        video = { ...c, cfg };
        break;
      }
    } catch {
      /* not this one */
    }
  }
  if (!video) return { ok: false, reason: format === 'mp4' ? 'this browser cannot encode H.264 for MP4 itself' : 'this browser cannot encode VP9 or VP8 itself' };
  let sound = null;
  if (audio) {
    for (const c of audioCodecs(format)) {
      const cfg = audioConfig(c.codec);
      try {
        if ((await AudioEncoder.isConfigSupported(cfg)).supported) {
          sound = { ...c, cfg };
          break;
        }
      } catch {
        /* not this one */
      }
    }
    if (!sound) return { ok: false, reason: format === 'mp4' ? 'this browser cannot encode AAC sound for MP4 itself (WebM can be fast)' : 'this browser cannot encode Opus sound itself' };
  }
  return { ok: true, video, audio: sound };
}

/** A task boundary that hidden tabs do not slow down (setTimeout would wait a second there). */
const nextTask = () =>
  new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => resolve();
    ch.port2.postMessage(0);
  });
/** Wait until an encoder has room in its queue. */
const room = (enc, max) =>
  enc.encodeQueueSize <= max
    ? null
    : new Promise((resolve) => {
        const done = () => enc.encodeQueueSize <= max && (enc.removeEventListener('dequeue', done), resolve());
        enc.addEventListener('dequeue', done);
        done();
      });

/** Every video element whose picture is on screen at `t` (main clips, overlay clips, a clip's video backdrop),
 *  except the clips in `skip` (decoded by the export itself). */
function activeVideos(p, t, skip = null) {
  const els = [];
  const push = (e) => e && els.push(e.el);
  for (const l of layoutClips(p.clips)) {
    if (t < l.start || t >= l.end || l.clip.disabled) continue;
    if (l.clip.kind === 'video' && !(skip && skip.has(l.clip.id))) push(clipElement(l.clip));
    const bg = l.clip.bgRemove && l.clip.bgRemove.enabled && l.clip.bgRemove.background;
    const rec = bg && bg.kind === 'media' && media.get(bg.mediaId);
    if (rec && rec.kind === 'video') push(clipElement({ id: `${l.clip.id}~bg`, mediaId: rec.id }));
  }
  for (const l of p.layers || []) {
    if (l.type !== 'video' || l.visible === false) continue;
    for (const c of l.clips) if (c.kind === 'video' && !c.disabled && !(skip && skip.has(c.id)) && t >= c.start && t < c.start + c.duration) push(clipElement(c));
  }
  return els;
}
const settled = (el) => !el.seeking && (el.readyState >= 2 || el.error || !el.src);
/** Resolve when each element has landed on its frame (or `ms` passed: a broken file must not stop the export). */
function landed(els, ms = 5000) {
  return Promise.all(
    els.filter((el) => !settled(el)).map(
      (el) =>
        new Promise((resolve) => {
          const evs = ['seeked', 'loadeddata', 'canplay', 'error'];
          const done = () => {
            if (!settled(el) && Date.now() < until) return;
            evs.forEach((e) => el.removeEventListener(e, done));
            clearTimeout(timer);
            resolve();
          };
          const until = Date.now() + ms;
          const timer = setTimeout(() => (evs.forEach((e) => el.removeEventListener(e, done)), resolve()), ms);
          evs.forEach((e) => el.addEventListener(e, done));
        }),
    ),
  );
}

/** Mix the export's sound offline: the same items, gains, fades and limiter as the live preview. */
async function mixAudio(engine, p, from, to, isCancelled) {
  const { items } = audioPlan(p, from, to);
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil((to - from) * SR)), SR);
  const master = ctx.createGain();
  const lim = ctx.createDynamicsCompressor();
  const on = engine.limiterOn !== false;
  lim.threshold.value = on ? -2 : 0;
  lim.knee.value = 0;
  lim.ratio.value = on ? 20 : 1;
  lim.attack.value = 0.003;
  lim.release.value = 0.12;
  master.connect(lim).connect(ctx.destination);
  const bufs = new Map();
  for (const it of items) {
    if (isCancelled()) throw new Error('cancelled');
    if (!bufs.has(it.mediaId)) {
      const rec = media.get(it.mediaId);
      const blob = (rec && rec.blob) || (await media.blob(it.mediaId));
      // shortcut: the whole file is read into memory to decode it; very large phone videos with sound on
      // could run out of memory on a phone, where the real-time export is the safer choice
      let buf = null;
      if (blob) buf = await ctx.decodeAudioData(await blob.arrayBuffer()).catch(() => null);
      // a video file can simply have no sound; a song or audio block that cannot be read is an error
      if (!buf && rec && rec.kind !== 'video') throw new Error(`could not read the sound of “${rec.name || 'a file'}”`);
      bufs.set(it.mediaId, buf);
    }
    const buf = bufs.get(it.mediaId);
    if (!buf || !it.points.length) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = it.rate;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, 0);
    it.points.forEach(([t, v], i) => (i ? g.gain.linearRampToValueAtTime(v, t) : g.gain.setValueAtTime(v, t)));
    src.connect(g).connect(master);
    src.start(it.at, it.offset, it.dur * it.rate);
  }
  return ctx.startRendering();
}

async function encodeAudio(buf, cfg, isCancelled) {
  const out = [];
  let err = null;
  const enc = new AudioEncoder({ output: (chunk, meta) => out.push([chunk, meta]), error: (e) => (err = e) });
  enc.configure(cfg);
  const step = SR / 10;
  const L = buf.getChannelData(0);
  const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  for (let i = 0; i < buf.length && !err; i += step) {
    if (isCancelled()) break;
    const k = Math.min(step, buf.length - i);
    const data = new Float32Array(k * 2);
    data.set(L.subarray(i, i + k), 0);
    data.set(R.subarray(i, i + k), k);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: k, numberOfChannels: 2, timestamp: Math.round((i * 1e6) / SR), data });
    enc.encode(ad);
    ad.close();
    await room(enc, 32);
  }
  if (!err) await enc.flush().catch((e) => (err = e));
  enc.close();
  if (err) throw err instanceof Error ? err : new Error(String(err));
  return out;
}

async function makeMuxer(format, video, sound, w, h, fps) {
  if (format === 'mp4') {
    const { Muxer, ArrayBufferTarget } = await import('../vendor/mp4-muxer/mp4-muxer.mjs');
    const target = new ArrayBufferTarget();
    const audio = sound ? { codec: sound.mux, numberOfChannels: 2, sampleRate: SR } : undefined;
    return { target, muxer: new Muxer({ target, video: { codec: 'avc', width: w, height: h, frameRate: fps }, audio, fastStart: 'in-memory', firstTimestampBehavior: 'cross-track-offset' }) };
  }
  const { Muxer, ArrayBufferTarget } = await import('../vendor/webm-muxer/webm-muxer.mjs');
  const target = new ArrayBufferTarget();
  const audio = sound ? { codec: sound.mux, numberOfChannels: 2, sampleRate: SR } : undefined;
  return { target, muxer: new Muxer({ target, video: { codec: video.mux, width: w, height: h, frameRate: fps }, audio, firstTimestampBehavior: 'offset' }) };
}

/**
 * Export from..to of the edit as it is now. `support` is fastSupport()'s answer. `onPhase('sound'|'video')`
 * and `onProgress(0..1)` report where it is; `isCancelled()` stops it (rejects with 'cancelled').
 * Resolves { blob, mime, frames, seconds }.
 */
export async function fastExport(engine, { format, fps, bitrate, audio, from, to, support, onProgress, onPhase, isCancelled }) {
  const t0 = performance.now();
  const p = engine.project;
  const { w, h } = engine.dims();
  const N = frameCount(from, to, fps);
  const cancelled = () => {
    if (isCancelled()) throw new Error('cancelled');
  };

  // 1. the sound, all at once (a few seconds for a song)
  let audioChunks = [];
  if (audio && support.audio) {
    onPhase && onPhase('sound');
    const mix = await mixAudio(engine, p, from, to, isCancelled);
    cancelled();
    audioChunks = await encodeAudio(mix, support.audio.cfg, isCancelled);
    cancelled();
  }

  // 2. the pictures, one exact frame at a time
  onPhase && onPhase('video');
  const { target, muxer } = await makeMuxer(format, support.video, audio ? support.audio : null, w, h, fps);
  let err = null;
  let ai = 0;
  const enc = new VideoEncoder({
    output: (chunk, meta) => {
      // keep both tracks in time order: the sound up to this frame goes in first
      while (ai < audioChunks.length && audioChunks[ai][0].timestamp <= chunk.timestamp) muxer.addAudioChunk(...audioChunks[ai++]);
      muxer.addVideoChunk(chunk, meta);
    },
    error: (e) => (err = e),
  });
  enc.configure(support.video.cfg);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  engine.offlineCanvas = canvas;
  engine.frameExact = true;
  const base = engine.env(false);
  // video clips are decoded in order (exact frames, no seeking); a cut-out clip keeps its <video> because its
  // matte follows the video's own time, and a file this cannot read is seeked as before
  const decoded = new Map(); // clip id -> FrameSource
  const lane = layoutClips(p.clips);
  const overlays = (p.layers || []).filter((l) => l.type === 'video' && l.visible !== false).flatMap((l) => l.clips);
  for (const c of [...lane.map((l) => l.clip), ...overlays]) {
    if (c.kind !== 'video' || c.disabled || (c.bgRemove && c.bgRemove.enabled)) continue;
    const src = await openFrames(media.get(c.mediaId));
    if (src) decoded.set(c.id, src);
  }
  engine.decodedClips = new Set(decoded.keys());
  const stats = { decodedClips: decoded.size, decodeSeconds: 0, renderSeconds: 0 };
  const pics = new Map(); // clip id -> its frame for the frame being drawn
  const env = { ...base, sourceFor: (clip) => pics.get(clip.id) || base.sourceFor(clip) };
  let kicked = -1; // the frame whose seeks already started while the last one was encoding
  const drop = (id) => {
    decoded.get(id).close();
    decoded.delete(id);
    engine.decodedClips.delete(id);
    kicked = -1;
  };
  /** Decode each clip on screen at t to its frame (the clip before a cut holds its last frame for a second). */
  const decodeAt = async (t) => {
    pics.clear();
    const want = [];
    lane.forEach((l, i) => {
      if (!decoded.has(l.clip.id)) return;
      const speed = l.clip.speed || 1;
      const nx = lane[i + 1];
      if (t >= l.start && t < l.end) want.push([l.clip.id, l.clip.in + (t - l.start) * speed]);
      else if (nx && t >= nx.start && t < nx.start + 1) want.push([l.clip.id, l.clip.in + l.clip.duration * speed - 0.04]);
    });
    for (const c of overlays) if (decoded.has(c.id) && t >= c.start && t < c.start + c.duration) want.push([c.id, c.in + (t - c.start) * (c.speed || 1)]);
    for (const [id, ft] of want) {
      const pic = await decoded.get(id).frameAt(ft);
      if (pic) pics.set(id, pic);
      else drop(id);
    }
    // clips that are done (or not started) give their decoder back
    for (const [id, src] of decoded) if (!pics.has(id) && src.dec) src.close();
  };
  try {
    for (let i = 0; i < N; i++) {
      cancelled();
      if (err) throw err;
      const t = frameTime(i, from, fps);
      engine.t = t;
      let q = performance.now();
      await decodeAt(t);
      stats.decodeSeconds += (performance.now() - q) / 1000;
      // seek every other video on screen to its exact frame and wait for it; a seek that lands on a parked clip
      // gets one more pass
      for (let pass = 0; pass < 3; pass++) {
        if (pass || kicked !== i) engine._sync(false);
        const els = activeVideos(p, t, engine.decodedClips);
        if (els.every(settled)) break;
        await landed(els);
      }
      q = performance.now();
      renderFrame(g, w, h, p, t, env);
      stats.renderSeconds += (performance.now() - q) / 1000;
      const frame = new VideoFrame(canvas, { timestamp: frameUs(i, fps), duration: Math.round(1e6 / fps), alpha: 'discard' });
      enc.encode(frame, { keyFrame: isKeyFrame(i, fps) });
      frame.close();
      if (!document.hidden && i % 3 === 0) engine.ctx.drawImage(canvas, 0, 0, engine.canvas.width, engine.canvas.height);
      // start the next frame's seeks now, so they land while this one encodes
      if (i + 1 < N) {
        engine.t = frameTime(i + 1, from, fps);
        engine._sync(false);
        kicked = i + 1;
      }
      onProgress && onProgress((i + 1) / N);
      await room(enc, 4);
      await nextTask(); // lets clicks (Cancel) and the progress bar through
    }
    await enc.flush();
    if (err) throw err;
    while (ai < audioChunks.length) muxer.addAudioChunk(...audioChunks[ai++]);
    muxer.finalize();
  } finally {
    if (enc.state !== 'closed') enc.close();
    for (const src of decoded.values()) src.close();
    clearTracks();
    engine.decodedClips = null;
    engine.offlineCanvas = null;
    engine.frameExact = false;
  }
  const codecs = [support.video.codec, audio && support.audio ? support.audio.codec : null].filter(Boolean).join(',');
  const type = format === 'mp4' ? 'video/mp4' : 'video/webm';
  return { blob: new Blob([target.buffer], { type }), mime: `${type};codecs=${codecs}`, frames: N, seconds: (performance.now() - t0) / 1000, ...stats };
}
