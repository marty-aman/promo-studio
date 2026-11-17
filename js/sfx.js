// Sound effects: a built-in set synthesised in the browser (no copyright at all), plus
// search of CC-licensed sounds on Openverse (Freesound, Wikimedia and more; no API key).

const SR = 44100;

function wav(buffer) {
  const ch = buffer.numberOfChannels;
  const n = buffer.length;
  const data = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o, s) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  data.setUint32(4, 36 + n * ch * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, ch, true);
  data.setUint32(24, SR, true);
  data.setUint32(28, SR * ch * 2, true);
  data.setUint16(32, ch * 2, true);
  data.setUint16(34, 16, true);
  w(36, 'data');
  data.setUint32(40, n * ch * 2, true);
  const chans = [...Array(ch)].map((_, i) => buffer.getChannelData(i));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      data.setInt16(o, v * 32767, true);
      o += 2;
    }
  }
  return new Blob([data.buffer], { type: 'audio/wav' });
}

function noiseBuffer(ctx, secs) {
  const b = ctx.createBuffer(1, Math.ceil(SR * secs), SR);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function noiseSrc(ctx, secs) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx, secs);
  return s;
}

const env = (param, points) => {
  param.setValueAtTime(points[0][1], points[0][0]);
  for (const [t, v, kind] of points.slice(1)) {
    if (kind === 'exp') param.exponentialRampToValueAtTime(Math.max(v, 0.0001), t);
    else param.linearRampToValueAtTime(v, t);
  }
};

/** Each recipe builds a graph on an OfflineAudioContext and returns its length in seconds. */
const RECIPES = {
  riser: {
    label: 'Riser',
    secs: 3,
    build(ctx) {
      const n = noiseSrc(ctx, 3);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 6;
      env(bp.frequency, [[0, 300], [3, 9000, 'exp']]);
      const g = ctx.createGain();
      env(g.gain, [[0, 0.0001], [2.9, 0.9, 'exp'], [3, 0]]);
      n.connect(bp).connect(g).connect(ctx.destination);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      env(o.frequency, [[0, 110], [3, 880, 'exp']]);
      const og = ctx.createGain();
      env(og.gain, [[0, 0.0001], [2.9, 0.18, 'exp'], [3, 0]]);
      o.connect(og).connect(ctx.destination);
      n.start();
      o.start();
    },
  },
  impact: {
    label: 'Impact / boom',
    secs: 2.5,
    build(ctx) {
      const o = ctx.createOscillator();
      env(o.frequency, [[0, 120], [0.4, 40, 'exp'], [2.5, 30, 'exp']]);
      const g = ctx.createGain();
      env(g.gain, [[0, 1], [2.5, 0.001, 'exp']]);
      o.connect(g).connect(ctx.destination);
      const n = noiseSrc(ctx, 1);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      env(lp.frequency, [[0, 6000], [0.6, 200, 'exp']]);
      const ng = ctx.createGain();
      env(ng.gain, [[0, 0.9], [0.6, 0.001, 'exp']]);
      n.connect(lp).connect(ng).connect(ctx.destination);
      o.start();
      n.start();
    },
  },
  subdrop: {
    label: 'Sub drop',
    secs: 2.5,
    build(ctx) {
      const o = ctx.createOscillator();
      env(o.frequency, [[0, 160], [2.2, 32, 'exp']]);
      const g = ctx.createGain();
      env(g.gain, [[0, 0.0001], [0.03, 0.95, 'exp'], [2.5, 0.001, 'exp']]);
      o.connect(g).connect(ctx.destination);
      o.start();
    },
  },
  whoosh: {
    label: 'Whoosh',
    secs: 1.2,
    build(ctx) {
      const n = noiseSrc(ctx, 1.2);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 2;
      env(bp.frequency, [[0, 300], [0.55, 3500, 'exp'], [1.2, 400, 'exp']]);
      const g = ctx.createGain();
      env(g.gain, [[0, 0.0001], [0.55, 1, 'exp'], [1.2, 0.001, 'exp']]);
      n.connect(bp).connect(g).connect(ctx.destination);
      n.start();
    },
  },
  reverseCymbal: {
    label: 'Reverse cymbal',
    secs: 2.5,
    build(ctx) {
      const n = noiseSrc(ctx, 2.5);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 5000;
      const g = ctx.createGain();
      env(g.gain, [[0, 0.0001], [2.45, 0.8, 'exp'], [2.5, 0]]);
      n.connect(hp).connect(g).connect(ctx.destination);
      n.start();
    },
  },
  clap: {
    label: 'Clap',
    secs: 0.5,
    build(ctx) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1500;
      bp.Q.value = 1.2;
      bp.connect(ctx.destination);
      [0, 0.012, 0.024].forEach((t, i) => {
        const n = noiseSrc(ctx, 0.5);
        const g = ctx.createGain();
        env(g.gain, [[t, 0.9], [t + (i === 2 ? 0.35 : 0.01), 0.001, 'exp']]);
        n.connect(g).connect(bp);
        n.start(t);
      });
    },
  },
  scratch: {
    label: 'Record scratch',
    secs: 0.7,
    build(ctx) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      env(o.frequency, [[0, 300], [0.15, 900], [0.3, 200], [0.45, 1100], [0.7, 150]]);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1200;
      const g = ctx.createGain();
      env(g.gain, [[0, 0.5], [0.6, 0.4], [0.7, 0]]);
      o.connect(bp).connect(g).connect(ctx.destination);
      o.start();
    },
  },
  recordStop: {
    label: 'Record stop',
    secs: 1.4,
    build(ctx) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      env(o.frequency, [[0, 440], [1.3, 30, 'exp']]);
      const g = ctx.createGain();
      env(g.gain, [[0, 0.6], [1.4, 0.001, 'exp']]);
      o.connect(g).connect(ctx.destination);
      o.start();
    },
  },
  glitch: {
    label: 'Glitch stutter',
    secs: 1,
    build(ctx) {
      for (let i = 0; i < 12; i++) {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = 200 + Math.random() * 1800;
        const g = ctx.createGain();
        const t = i * 0.08;
        env(g.gain, [[t, 0.25], [t + 0.05, 0.25], [t + 0.06, 0]]);
        o.connect(g).connect(ctx.destination);
        o.start(t);
        o.stop(t + 0.07);
      }
    },
  },
  heartbeat: {
    label: 'Heartbeat',
    secs: 2,
    build(ctx) {
      [0, 0.25, 1, 1.25].forEach((t, i) => {
        const o = ctx.createOscillator();
        env(o.frequency, [[t, 90], [t + 0.15, 45, 'exp']]);
        const g = ctx.createGain();
        env(g.gain, [[t, 0.0001], [t + 0.01, i % 2 ? 0.6 : 0.9, 'exp'], [t + 0.2, 0.001, 'exp']]);
        o.connect(g).connect(ctx.destination);
        o.start(t);
        o.stop(t + 0.25);
      });
    },
  },
  shutter: {
    label: 'Camera shutter',
    secs: 0.35,
    build(ctx) {
      [0, 0.12].forEach((t) => {
        const n = noiseSrc(ctx, 0.1);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 2500;
        const g = ctx.createGain();
        env(g.gain, [[t, 0.8], [t + 0.05, 0.001, 'exp']]);
        n.connect(hp).connect(g).connect(ctx.destination);
        n.start(t);
      });
    },
  },
  vinyl: {
    label: 'Vinyl crackle (loop)',
    secs: 8,
    build(ctx) {
      const b = ctx.createBuffer(1, SR * 8, SR);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        d[i] = (Math.random() * 2 - 1) * 0.012;
        if (Math.random() < 0.0006) d[i] += (Math.random() * 2 - 1) * 0.7;
      }
      const s = ctx.createBufferSource();
      s.buffer = b;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 6000;
      s.connect(lp).connect(ctx.destination);
      s.start();
    },
  },
};

export const BUILTIN_SFX = Object.entries(RECIPES).map(([id, r]) => ({ id, label: r.label, secs: r.secs }));

/** Render a built-in effect to a WAV blob. */
export async function synthSfx(id) {
  const r = RECIPES[id];
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new Ctx(2, Math.ceil(SR * r.secs), SR);
  r.build(ctx);
  return wav(await ctx.startRendering());
}

// ------------------------------------------------------------ Openverse

export const SFX_CATEGORIES = ['whoosh', 'riser', 'impact', 'bass drop', 'record scratch', 'crowd cheer', 'applause', 'thunder', 'rain', 'glitch', 'tape stop', 'reverse cymbal', 'camera shutter', 'vinyl crackle', 'heartbeat', 'swoosh transition'];

export const SFX_LICENSES = [
  ['cc0', 'CC0 only (no credit needed)'],
  ['cc0,pdm,by', 'CC0 + CC BY (credit the author)'],
];

/** Search Openverse audio. Returns [{id, title, url, duration, author, license, pageUrl, provider}]. */
export async function searchSfx(query, { license = 'cc0', page = 1 } = {}) {
  const u = new URL('https://api.openverse.org/v1/audio/');
  u.searchParams.set('q', query);
  u.searchParams.set('license', license);
  u.searchParams.set('page_size', '20');
  u.searchParams.set('page', String(page));
  const res = await fetch(u);
  if (res.status === 429) throw new Error('Openverse is rate-limiting searches. Wait a minute and try again.');
  if (!res.ok) throw new Error(`Sound search failed (${res.status})`);
  const data = await res.json();
  return (data.results || [])
    .filter((r) => r.url && /mp3|mpeg|wav|ogg|flac/i.test(r.filetype || r.url))
    .map((r) => ({
      id: r.id,
      title: r.title || 'Untitled',
      url: r.url,
      duration: r.duration ? r.duration / 1000 : null,
      author: r.creator || 'Unknown',
      license: `${(r.license || '').toUpperCase()} ${r.license_version || ''}`.trim(),
      licenseUrl: r.license_url,
      pageUrl: r.foreign_landing_url || r.url,
      provider: r.source || r.provider,
      needsCredit: r.license !== 'cc0' && r.license !== 'pdm',
    }));
}
