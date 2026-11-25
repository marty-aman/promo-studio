// whisper.cpp inside the Mac app (electron/native.cjs behind window.desktop.native). Lyric sync and speech captions
// call a speech "pipe" (audio, options) -> { chunks: [{ text, timestamp: [start, end] }] }; this makes the same kind
// of pipe from whisper.cpp, so lyricsync.js and captionsync.js do not change. It is used only when the app is the
// Mac app, the whisper tool and the chosen model are in place, and the person turned it on in Settings. The browser
// model stays the default and the fallback (js/ai/runtime.js).
//
// Pure parts (unit-tested on whisper.cpp's real JSON): wordsFromWhisperCpp, wavFromSamples.
import { desktop } from '../desktop.js';

export const NATIVE_KEY = 'pvm.nativeWhisper.v1';
export const NATIVE_MODELS = { base: 'Base (148 MB, fastest)', small: 'Small (488 MB, slower, more accurate)' };

// ------------------------------------------------------------ whisper.cpp JSON -> words

const r3 = (v) => Math.round(v * 1000) / 1000;
// "[_BEG_]", "[_TT_150]", "<|en|>": markers, not words. "[BLANK_AUDIO]", "[MUSIC]", "(applause)", "♪": sounds, not words.
const MARKER = /^(\[_[A-Z]+_?\d*\]|<\|[^|]*\|>)$/;
const SOUND = /^([[(][^\])]*[\])]|[♪♫♬\s]+)$/u;
const PUNCT = /^[\s\p{P}\p{S}]+$/u;

/**
 * whisper.cpp's full JSON (`-ojf`: the text of the .json file, or the parsed object) as the word list
 * [{ w, t, end }] (seconds, from the start of the audio it was given) that lyricsync.js and captionsync.js work
 * with. A word is a run of pieces: a piece that starts with a space starts a new word, so "Americans" in three
 * pieces is one word. Punctuation stays on its word, as with the browser model. Markers and sounds ([BLANK_AUDIO],
 * (music), ♪) are dropped.
 *
 * Times: with `--dtw` (what the app runs) a word starts when its first piece's DTW time (`t_dtw`, 10 ms units) says,
 * the same kind of alignment the browser model uses. Without it (t_dtw is -1) the piece's `offsets` (ms) are used,
 * which are rougher. A word ends where its last spoken (non-punctuation) piece ends, but never after the next word
 * starts; a comma that whisper.cpp stretches over a pause does not stretch the word. Never goes backwards.
 */
export function wordsFromWhisperCpp(json) {
  let doc = json;
  if (typeof json === 'string') {
    try {
      doc = JSON.parse(json);
    } catch {
      return [];
    }
  }
  const segs = (doc && doc.transcription) || [];
  const words = [];
  let cur = null;
  const flush = () => {
    if (cur) {
      const w = cur.w.trim();
      if (w && !SOUND.test(w)) words.push({ w, t: cur.t, end: cur.end });
    }
    cur = null;
  };
  for (const seg of Array.isArray(segs) ? segs : []) {
    const segFrom = seg && seg.offsets && Number.isFinite(seg.offsets.from) ? seg.offsets.from / 1000 : null;
    const segTo = seg && seg.offsets && Number.isFinite(seg.offsets.to) ? seg.offsets.to / 1000 : null;
    const pieces = Array.isArray(seg && seg.tokens) && seg.tokens.length ? seg.tokens : seg && typeof seg.text === 'string' ? [{ text: seg.text, offsets: seg.offsets }] : [];
    for (const k of pieces) {
      const text = k && typeof k.text === 'string' ? k.text : '';
      if (!text.trim() || MARKER.test(text.trim())) continue;
      const o = k.offsets && Number.isFinite(k.offsets.from) ? k.offsets : null;
      const off = o ? o.from / 1000 : segFrom;
      const e = o && Number.isFinite(o.to) ? o.to / 1000 : segTo;
      if (!Number.isFinite(off)) continue;
      const dtw = Number.isFinite(k.t_dtw) && k.t_dtw >= 0 ? k.t_dtw / 100 : null;
      const spoken = Number.isFinite(e) && !PUNCT.test(text);
      if (!cur || /^\s/.test(text)) {
        flush();
        cur = { w: text, t: dtw ?? off, end: spoken ? e : null };
      } else {
        cur.w += text;
        if (spoken) cur.end = Math.max(cur.end ?? 0, e);
      }
    }
    flush(); // a segment never continues a word into the next one
  }
  let prev = 0;
  words.forEach((x, i) => {
    const t = Math.max(x.t, prev);
    const nextT = i + 1 < words.length ? Math.max(words[i + 1].t, t) : Infinity;
    let end = x.end ?? t + 0.3;
    if (end <= t) end = t + 0.3; // the piece times and the DTW start disagree: a short word
    end = Math.min(end, nextT);
    prev = t;
    x.t = r3(t);
    x.end = r3(Math.max(end, t));
  });
  return words;
}

/** The words in the shape the browser model returns: { chunks: [{ text, timestamp: [start, end] }] } (lyricsync.heardWords reads it). */
export function chunksFromWords(words) {
  return { text: words.map((x) => x.w).join(' '), chunks: words.map((x) => ({ text: x.w, timestamp: [x.t, x.end] })) };
}

// ------------------------------------------------------------ audio -> WAV

/** 16-bit PCM mono WAV bytes for Float32 samples in -1..1. */
export function wavFromSamples(samples, sr = 16000) {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

// ------------------------------------------------------------ the setting, the status, the pipe

/** { on, model }: whether to use whisper.cpp, and which downloaded model. Off until the person turns it on. */
export function nativeSetting() {
  try {
    const v = JSON.parse(localStorage.getItem(NATIVE_KEY) || '{}');
    return { on: v.on === true, model: v.model in NATIVE_MODELS ? v.model : 'base' };
  } catch {
    return { on: false, model: 'base' };
  }
}
export function setNativeSetting(next) {
  const cur = nativeSetting();
  const v = { on: next.on === undefined ? cur.on : !!next.on, model: next.model in NATIVE_MODELS ? next.model : cur.model };
  try {
    localStorage.setItem(NATIVE_KEY, JSON.stringify(v));
  } catch {
    /* storage full: the setting stays as it was */
  }
  return v;
}

/** The tool and models as the Mac app sees them, or null in a browser. */
export async function nativeStatus(d = desktop) {
  if (!d || !d.native || !d.native.status) return null;
  try {
    return await d.native.status();
  } catch {
    return null;
  }
}

/**
 * Is whisper.cpp usable right now: the Mac app, the person turned it on, the tool is in <userData>/bin and the
 * chosen model is downloaded? Resolves { ready, model, why } (why: what is missing, for the Settings panel).
 */
export async function nativeReady(d = desktop, setting = nativeSetting()) {
  if (!d) return { ready: false, why: 'browser' };
  if (!setting.on) return { ready: false, why: 'off' };
  const st = await nativeStatus(d);
  if (!st) return { ready: false, why: 'unavailable' };
  if (!st.tools.whisper || !st.tools.whisper.installed) return { ready: false, why: 'no-tool' };
  const m = st.models.find((x) => x.name === setting.model);
  if (!m || !m.installed) return { ready: false, why: 'no-model' };
  return { ready: true, model: setting.model };
}

let runSeq = 0;
const lang = (l) => (typeof l === 'string' && /^[a-z]{2,3}$/.test(l) ? l : 'auto');

/**
 * A speech pipe backed by whisper.cpp: pipe(audio Float32 16 kHz, { language }) -> { text, chunks }. Every call
 * writes the audio as a WAV, runs the tool and turns its JSON into the browser model's shape. `info` is filled
 * with { threads, seconds, calls } for the self-check. Rejects with the tool's own message.
 */
export function makeNativePipe({ model = 'base', threads, d = desktop, info = {} } = {}) {
  const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  const t = threads || Math.max(1, Math.min(8, cores - 2));
  info.threads = t;
  info.calls = 0;
  info.seconds = 0;
  const pipe = async (audio, options = {}) => {
    const wav = wavFromSamples(audio, 16000);
    const r = await d.native.run('whisper', ['--model', model, '--language', lang(options.language), '--threads', String(t)], { input: wav, id: `w${++runSeq}` });
    info.calls++;
    info.seconds += r.seconds || 0;
    return chunksFromWords(wordsFromWhisperCpp(r.json));
  };
  return pipe;
}
