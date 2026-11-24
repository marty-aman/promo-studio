// Playback clock, media synchronisation, audio mixing and rendering.
import { ASPECTS, layoutClips, fadeGain, clamp, timelineToSong, hasSongParts } from './core.js';
import { media, clipElement, pruneClipElements, tabTimeline, drumTimeline, drumHitsFromStem, vizFeatures } from './media.js';
import { midiNotesFor } from './midiviz.js';
import { gameChart } from './gamechart.js';
import { isVisible } from './state.js';
import { renderFrame } from './renderer.js';
import { gridOf } from './tempo.js';
import { peakOf } from './studioedit.js';
import { matteFor, preparePerson, onMatteChange } from './bgremove.js';

export class Engine {
  constructor(store, canvas) {
    this.store = store;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.t = 0;
    this.playing = false;
    this.loop = false;
    this.listeners = new Set();
    onMatteChange(() => !this.playing && this.render());
    this.audioEls = new Map(); // key -> {el, mediaId}
    this.nodes = new Map(); // element -> {src, gain}
    this.audioCtx = null;
    this.master = null;
    this.exportCanvas = null;
    this.onEnded = null;
    this.previewScale = 0.5;
    this.stalled = false;
    this._raf = null;
    this._tick = this._tick.bind(this);
    this.resize();
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  _emit() {
    this.listeners.forEach((fn) => fn(this));
  }

  get project() {
    return this.store.get();
  }

  dims() {
    return ASPECTS[this.project.aspect] || ASPECTS['9:16'];
  }

  resize() {
    const { w, h } = this.dims();
    const pw = Math.round(w * this.previewScale);
    const ph = Math.round(h * this.previewScale);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
  }

  // ------------------------------------------------------------ audio graph

  ensureAudio() {
    if (this.audioCtx) {
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = new Ctx();
    this.master = this.audioCtx.createGain();
    // a brick-wall style limiter keeps a loud song plus clip sound and effects from clipping, in the preview and the export
    this.limiter = this.audioCtx.createDynamicsCompressor();
    this.setLimiter(this.limiterOn !== false);
    this.meterIn = this.audioCtx.createAnalyser(); // what the mix is before the limiter
    this.meterIn.fftSize = 1024;
    this.meterBuf = new Float32Array(this.meterIn.fftSize);
    this.master.connect(this.meterIn);
    this.master.connect(this.limiter);
    this.limiter.connect(this.audioCtx.destination);
    this.monitor = true;
  }

  /** The limiter on (threshold -2 dB, ratio 20, 3 ms attack) or flat (no change to the sound). */
  setLimiter(on) {
    this.limiterOn = on;
    if (!this.limiter) return;
    const t = this.audioCtx.currentTime;
    const l = this.limiter;
    l.threshold.setValueAtTime(on ? -2 : 0, t);
    l.knee.setValueAtTime(0, t);
    l.ratio.setValueAtTime(on ? 20 : 1, t);
    l.attack.setValueAtTime(0.003, t);
    l.release.setValueAtTime(0.12, t);
  }

  /** The loudest sample of the last moment in the mix before the limiter, 0..1+ (0 when nothing plays or no audio yet). */
  level() {
    if (!this.meterIn) return 0;
    this.meterIn.getFloatTimeDomainData(this.meterBuf);
    return peakOf(this.meterBuf);
  }

  setMonitor(on) {
    if (!this.master) return;
    if (on === this.monitor) return;
    this.monitor = on;
    if (on) this.limiter.connect(this.audioCtx.destination);
    else this.limiter.disconnect(this.audioCtx.destination);
  }

  _node(el) {
    if (!this.audioCtx) return null;
    let n = this.nodes.get(el);
    if (!n) {
      el.muted = false;
      const src = this.audioCtx.createMediaElementSource(el);
      const gain = this.audioCtx.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(this.master);
      n = { src, gain };
      this.nodes.set(el, n);
    }
    return n;
  }

  _audioEl(key, mediaId) {
    const rec = media.get(mediaId);
    if (!rec || !rec.url) return null; // not open yet: media.get started opening it
    let entry = this.audioEls.get(key);
    if (!entry || entry.mediaId !== mediaId || entry.url !== rec.url) {
      if (entry) entry.el.pause();
      const el = document.createElement(rec.kind === 'video' ? 'video' : 'audio');
      el.preload = 'auto';
      el.src = rec.url;
      entry = { el, mediaId, url: rec.url };
      this.audioEls.set(key, entry);
    }
    return entry.el;
  }

  // ------------------------------------------------------------ transport

  /** `force` is for the export itself: while exporting, nothing else may start, stop or move the clock. */
  play(force = false) {
    if (this.playing) return;
    if (this.exporting && !force) return;
    this.ensureAudio();
    if (this.t >= this.project.duration - 0.01) this.t = 0;
    this.playing = true;
    this._startWall = performance.now();
    this._startT = this.t;
    this._sync(true, true);
    cancelAnimationFrame(this._raf);
    clearTimeout(this._timer);
    this._schedule();
    this._emit();
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this._raf);
    clearTimeout(this._timer);
    this._pauseAll();
    this._sync(false);
    this.render();
    this._emit();
  }

  toggle() {
    if (this.exporting) return;
    if (this.playing) this.pause();
    else this.play();
  }

  seek(t, force = false) {
    if (this.exporting && !force) return;
    this.t = clamp(t, 0, this.project.duration);
    if (this.playing) {
      this._startWall = performance.now();
      this._startT = this.t;
      this._sync(true, true);
    } else {
      this._sync(false);
      this.render();
    }
    this._emit();
  }

  _pauseAll() {
    for (const { el } of this.audioEls.values()) el.pause();
    for (const clip of this.project.clips) {
      const e = clipElement(clip);
      if (e) e.el.pause();
    }
    for (const l of this.project.layers || []) {
      if (l.type !== 'video') continue;
      for (const clip of l.clips) {
        const e = clipElement(clip);
        if (e) e.el.pause();
      }
    }
  }

  _tick() {
    cancelAnimationFrame(this._raf);
    clearTimeout(this._timer);
    if (!this.playing) return;
    const now = performance.now();
    if (this._isStalled(now)) {
      // hold the clock while a video buffers so audio, lyrics and video stay aligned
      if (!this.stalled) {
        this.stalled = true;
        this._pauseAll();
      }
      this._startWall = now;
      this._startT = this.t;
    } else {
      if (this.stalled) {
        this.stalled = false;
        this._startWall = now;
        this._startT = this.t;
        this._sync(true, true);
      }
      this.t = this._startT + (now - this._startWall) / 1000;
    }
    const dur = this.project.duration;
    if (this.t >= dur) {
      this.t = dur;
      this.render();
      if (this.loop && !this.exporting) {
        this.t = 0;
        this._startWall = performance.now();
        this._startT = 0;
        this._sync(true, true);
      } else {
        this.playing = false;
        this._pauseAll();
        this._emit();
        if (this.onEnded) this.onEnded();
        return;
      }
    }
    this._sync(true);
    this.render();
    this._emit();
    this._schedule();
  }

  /** rAF drives playback; a timer keeps it going when frames are throttled (e.g. background tab). */
  _schedule() {
    this._raf = requestAnimationFrame(this._tick);
    this._timer = setTimeout(this._tick, 60);
  }

  _isStalled(now) {
    const laid = layoutClips(this.project.clips);
    const cur = laid.find((l) => this.t >= l.start && this.t < l.end);
    if (!cur || cur.clip.kind !== 'video' || cur.clip.disabled) {
      this._stallSince = 0;
      return false;
    }
    const e = clipElement(cur.clip);
    const waiting = !!e && (e.el.seeking || e.el.readyState < 2) && !e.el.ended;
    if (!waiting) {
      this._stallSince = 0;
      return false;
    }
    // Hold the clock while a clip buffers, but never for more than 1.5 s in a row.
    if (!this._stallSince) this._stallSince = now;
    return now - this._stallSince < 1500;
  }

  /** Bring every media element in line with the clock. */
  _sync(playing, force = false) {
    const p = this.project;
    const t = this.t;
    const tol = playing ? 0.2 : 0.03;
    const live = new Set();
    const laid = layoutClips(p.clips);
    laid.forEach((l, i) => {
      const clip = l.clip;
      live.add(clip.id);
      if (clip.kind !== 'video') return;
      const e = clipElement(clip);
      if (!e) return;
      const el = e.el;
      const active = !clip.disabled && t >= l.start && t < l.end; // a clip turned off is silent (and shows black)
      const speed = clip.speed || 1;
      const target = clip.in + (t - l.start) * speed;
      const node = this._node(el);
      if (node) node.gain.gain.value = active ? (clip.volume || 0) * fadeGain(t, l.start, l.end, 0.05, 0.05) : 0;
      if (active) {
        el.playbackRate = speed;
        const drift = Math.abs(el.currentTime - target);
        const now = performance.now();
        if (force || !playing) {
          if (drift > tol && (force || !el.seeking)) {
            el.currentTime = target;
            e.lastSeek = now;
          }
        } else if (!el.seeking && drift > 0.3 && now - (e.lastSeek || 0) > 800) {
          // correct real drift only; seeking a playing video too often makes it chase the clock
          el.currentTime = target;
          e.lastSeek = now;
        }
        if (playing && el.paused) el.play().catch(() => {});
        if (!playing && !el.paused) el.pause();
      } else {
        if (!el.paused) el.pause();
        // preload the next clip at its in-point; park the previous one at its last frame
        const next = laid[i - 1] && t >= laid[i - 1].start && t < laid[i - 1].end;
        if (next && Math.abs(el.currentTime - clip.in) > 0.05 && !el.seeking) el.currentTime = clip.in;
        const prev = laid[i + 1] && t >= laid[i + 1].start && t < laid[i + 1].start + 1;
        const outPoint = clip.in + clip.duration * speed - 0.04;
        if (prev && Math.abs(el.currentTime - outPoint) > 0.1 && !el.seeking) el.currentTime = outPoint;
      }
    });
    // a clip of yours used as the background behind a cut-out loops along with it
    for (const l of laid) {
      const bg = l.clip.bgRemove && l.clip.bgRemove.enabled && l.clip.bgRemove.background;
      if (!bg || bg.kind !== 'media') continue;
      const rec = media.get(bg.mediaId);
      if (!rec || rec.kind !== 'video') continue;
      const pseudo = { id: `${l.clip.id}~bg`, mediaId: rec.id };
      live.add(pseudo.id);
      const e = clipElement(pseudo);
      if (!e) continue;
      const el = e.el;
      const active = t >= l.start && t < l.end;
      const dur = rec.duration || el.duration || 1;
      const target = (((t - l.start) % dur) + dur) % dur;
      if (active) {
        if ((force || !playing) && Math.abs(el.currentTime - target) > tol && !el.seeking) el.currentTime = target;
        if (playing && el.paused) el.play().catch(() => {});
        if (!playing && !el.paused) el.pause();
        el.loop = true;
      } else if (!el.paused) el.pause();
    }
    // overlay clips on video layers: placed freely by start time
    for (const l of p.layers || []) {
      if (l.type !== 'video') continue;
      const shown = l.visible !== false;
      for (const clip of l.clips) {
        live.add(clip.id);
        if (clip.kind !== 'video') continue;
        const e = clipElement(clip);
        if (!e) continue;
        const el = e.el;
        const active = shown && !clip.disabled && t >= clip.start && t < clip.start + clip.duration;
        const speed = clip.speed || 1;
        const target = clip.in + (t - clip.start) * speed;
        const node = this._node(el);
        if (node) node.gain.gain.value = active ? (clip.volume || 0) * fadeGain(t, clip.start, clip.start + clip.duration, 0.05, 0.05) : 0;
        if (active) {
          el.playbackRate = speed;
          const drift = Math.abs(el.currentTime - target);
          const now = performance.now();
          if (force || !playing) {
            if (drift > tol && (force || !el.seeking)) {
              el.currentTime = target;
              e.lastSeek = now;
            }
          } else if (!el.seeking && drift > 0.3 && now - (e.lastSeek || 0) > 800) {
            el.currentTime = target;
            e.lastSeek = now;
          }
          if (playing && el.paused) el.play().catch(() => {});
          if (!playing && !el.paused) el.pause();
        } else {
          if (!el.paused) el.pause();
          // park upcoming clips on their first frame
          if (t < clip.start && clip.start - t < 1.5 && Math.abs(el.currentTime - clip.in) > 0.05 && !el.seeking) el.currentTime = clip.in;
        }
      }
    }
    pruneClipElements(live);

    const vis = (k) => isVisible(p, k);
    const audioItems = [];
    if (p.song && media.get(p.song.mediaId)) {
      const parts = hasSongParts(p.song) ? p.song.parts : null;
      if (!parts) {
        audioItems.push({
          key: 'song',
          mediaId: p.song.mediaId,
          start: 0,
          end: p.duration,
          target: t + p.song.offset,
          volume: vis('song') ? p.song.volume ?? 1 : 0,
          fadeIn: p.song.fadeIn || 0,
          fadeOut: p.song.fadeOut || 0,
        });
      } else {
        // several sections: one player each, crossfading (or a hard cut) where they meet
        const fade = Math.max(0.02, (p.song.join && p.song.join.fade) || 0);
        parts.forEach((q, i) => {
          const last = i === parts.length - 1;
          audioItems.push({
            key: i ? `song:${i}` : 'song',
            mediaId: p.song.mediaId,
            start: q.at,
            end: last ? p.duration : q.at + (q.to - q.from),
            target: q.from + (t - q.at),
            volume: vis('song') ? p.song.volume ?? 1 : 0,
            fadeIn: i ? fade : p.song.fadeIn || 0,
            fadeOut: last ? p.song.fadeOut || 0 : fade,
            park: i ? q.from : null,
          });
        });
      }
    }
    for (const a of p.audioTracks) {
      if (a.disabled) continue; // turned off: its player is let go, like a deleted block's
      audioItems.push({
        key: a.id,
        mediaId: a.mediaId,
        start: a.start,
        end: a.start + a.duration,
        target: a.in + (t - a.start),
        volume: vis(`audio:${a.id}`) ? a.volume ?? 1 : 0,
        fadeIn: a.fadeIn || 0,
        fadeOut: a.fadeOut || 0,
      });
    }
    // visualizer stems normally only drive visuals; "play its sound" mixes them in
    for (const l of p.layers || []) {
      if (l.type !== 'viz' || !l.playAudio || l.visible === false || l.source === 'song') continue;
      if (!media.get(l.source)) continue;
      audioItems.push({ key: `viz:${l.id}`, mediaId: l.source, start: 0, end: p.duration, target: timelineToSong(t, p.song) - (l.offset || 0), volume: l.volume ?? 1, fadeIn: 0, fadeOut: 0.3 });
    }
    const liveKeys = new Set(audioItems.map((a) => a.key));
    for (const [key, entry] of this.audioEls) {
      if (!liveKeys.has(key)) {
        entry.el.pause();
        this.audioEls.delete(key);
      }
    }
    for (const a of audioItems) {
      const el = this._audioEl(a.key, a.mediaId);
      if (!el) continue;
      const node = this._node(el);
      const active = t >= a.start && t < a.end && a.target >= 0 && a.target < (el.duration || Infinity);
      if (node) node.gain.gain.value = active ? a.volume * fadeGain(t, a.start, a.end, a.fadeIn, a.fadeOut) : 0;
      if (active && playing) {
        if (force || Math.abs(el.currentTime - a.target) > 0.12) el.currentTime = a.target;
        if (el.paused) el.play().catch(() => {});
      } else {
        if (!el.paused) el.pause();
        // a later section's player waits on its first moment, so the join doesn't wait for a seek
        if (a.park != null && t < a.start && a.start - t < 1.5 && Math.abs(el.currentTime - a.park) > 0.05 && !el.seeking) el.currentTime = a.park;
      }
    }
  }

  // ------------------------------------------------------------ drawing

  env(preview) {
    return {
      preview,
      sourceFor: (clip) => {
        if (clip.kind === 'image') return media.get(clip.mediaId)?.el || null;
        const e = clipElement(clip);
        if (e && !e._hooked) {
          // redraw when a paused seek lands
          e.el.addEventListener('seeked', () => !this.playing && this.render());
          e.el.addEventListener('loadeddata', () => !this.playing && this.render());
          e._hooked = true;
        }
        return e ? e.el : null;
      },
      image: (id) => {
        const r = media.get(id);
        return r && r.kind === 'image' ? r.el : null;
      },
      // cut-out matte for Remove background (person mattes are prepared in the background)
      matte: (clip, src) => {
        if (clip.bgRemove.mode === 'person') {
          const p = this.project;
          const all = [...p.clips, ...(p.layers || []).filter((l) => l.type === 'video').flatMap((l) => l.clips)];
          const uses = all.filter((c) => c.mediaId === clip.mediaId && c.bgRemove && c.bgRemove.enabled && c.bgRemove.mode === 'person');
          preparePerson(media.get(clip.mediaId), uses.length ? uses : [clip]);
        }
        return matteFor(clip, src);
      },
      backdropSource: (clip) => {
        const bg = clip.bgRemove && clip.bgRemove.background;
        const rec = bg && media.get(bg.mediaId);
        if (!rec) return null;
        if (rec.kind === 'image') return rec.el;
        const e = clipElement({ id: `${clip.id}~bg`, mediaId: rec.id });
        if (e && !e._hooked) {
          e.el.addEventListener('seeked', () => !this.playing && this.render());
          e._hooked = true;
        }
        return e ? e.el : null;
      },
      tab: (id, track) => tabTimeline(media.get(id), track),
      drums: (l) => {
        if (l.source === 'audio') {
          const v = drumHitsFromStem(media.get(l.mediaId), l.sensitivity, () => !this.playing && this.render());
          return v || null;
        }
        return drumTimeline(media.get(l.mediaId), l.track, l.drumMap);
      },
      game: (l) => gameChart(l, { bpm: (gridOf(this.project, l) || {}).bpm || 0, onReady: () => !this.playing && this.render() }) || null,
      midi: (l) => {
        const rec = media.get(l.mediaId);
        return rec && rec.midi ? midiNotesFor(rec.midi, l.tracks) : null;
      },
      viz: (l) => {
        const p = this.project;
        const rec = media.get(l.source === 'song' ? p.song && p.song.mediaId : l.source);
        return vizFeatures(rec, () => !this.playing && this.render()) || null;
      },
    };
  }

  render() {
    this.resize();
    const p = this.project;
    if (this.exportCanvas) {
      const ec = this.exportCanvas;
      renderFrame(ec.getContext('2d'), ec.width, ec.height, p, this.t, this.env(false));
      this.ctx.drawImage(ec, 0, 0, this.canvas.width, this.canvas.height);
      return;
    }
    renderFrame(this.ctx, this.canvas.width, this.canvas.height, p, this.t, this.env(true));
  }

  /** Full-resolution still of the current frame. */
  snapshot(type = 'image/png') {
    const { w, h } = this.dims();
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    renderFrame(c.getContext('2d'), w, h, this.project, this.t, this.env(false));
    return new Promise((resolve) => c.toBlob(resolve, type, 0.92));
  }
}

// ------------------------------------------------------------ export

export function pickMimeType(prefer = 'mp4') {
  const mp4 = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'];
  const webm = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const order = prefer === 'webm' ? [...webm, ...mp4] : [...mp4, ...webm];
  return order.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || null;
}

/** The same container without an audio codec, when the browser can record that (else the original). */
function silentMime(mime) {
  const bare = mime.replace(/,\s*(opus|vorbis|mp4a[\w.]*|aac)\b/i, '');
  return bare !== mime && window.MediaRecorder && MediaRecorder.isTypeSupported(bare) ? bare : mime;
}

/**
 * Real-time export: plays the project from 0 onto a full-resolution canvas while
 * MediaRecorder captures the canvas and the mixed audio.
 */
/** `start`/`end` (seconds on the timeline) record just that part, e.g. one section of the song. */
export function exportVideo(engine, { format = 'mp4', fps = 30, bitrate = 10_000_000, monitor = false, onProgress, start = 0, end = null, audio = true } = {}) {
  return new Promise((resolve, reject) => {
    const mime = pickMimeType(format);
    if (!mime) return reject(new Error('This browser cannot record video. Use a recent Chrome, Edge or Firefox.'));
    engine.pause();
    engine.ensureAudio();
    const { w, h } = engine.dims();
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    engine.exportCanvas = canvas;
    engine.exporting = true;
    engine._emit(); // the app locks its editing controls while this is set

    const dest = engine.audioCtx.createMediaStreamDestination();
    engine.limiter.connect(dest);
    engine.setMonitor(monitor);
    const stream = canvas.captureStream(fps);
    // audio: false makes a silent file (a Spotify Canvas plays over the track itself)
    if (audio) dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    const rec = new MediaRecorder(stream, { mimeType: audio ? mime : silentMime(mime), videoBitsPerSecond: bitrate, audioBitsPerSecond: 192000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    let cancelled = false;

    const cleanup = () => {
      engine.exportCanvas = null;
      engine.exporting = false;
      engine.onEnded = null;
      engine._emit();
      try {
        engine.limiter.disconnect(dest);
      } catch {
        /* already disconnected */
      }
      engine.setMonitor(true);
      clearInterval(timer);
      engine.render();
    };
    rec.onstop = () => {
      cleanup();
      if (cancelled) return reject(new Error('cancelled'));
      resolve({ blob: new Blob(chunks, { type: mime.split(';')[0] }), mime });
    };
    rec.onerror = (e) => {
      cleanup();
      reject(e.error || new Error('Recording failed'));
    };

    const from = Math.max(0, +start || 0);
    const to = end != null && end > from ? Math.min(end, engine.project.duration) : engine.project.duration;
    let stopping = false;
    const stopAt = () => {
      if (stopping) return;
      stopping = true;
      engine.pause();
      setTimeout(() => rec.state !== 'inactive' && rec.stop(), 60);
    };
    const timer = setInterval(() => {
      onProgress && onProgress(Math.min(1, (engine.t - from) / Math.max(0.01, to - from)));
      // a part of the timeline: stop when the playhead passes its end
      if (to < engine.project.duration && engine.t >= to - 0.01) stopAt();
    }, 15);
    engine.onEnded = () => setTimeout(() => rec.state !== 'inactive' && rec.stop(), 150);

    // Prime: seek to the start and give elements a moment to land on their first frames.
    engine.seek(from, true);
    setTimeout(() => {
      rec.start(250);
      engine.play(true);
    }, 400);

    exportVideo.cancel = () => {
      cancelled = true;
      engine.pause();
      if (rec.state !== 'inactive') rec.stop();
    };
  });
}
