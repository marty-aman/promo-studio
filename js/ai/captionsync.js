// Captions from speech: hear what is said in a clip with the on-device speech model (the same Whisper as
// lyric auto-sync, loaded through js/ai/runtime.js), cut the words into caption lines, and put them on the
// timeline where the clip sits. Everything here is pure (fixed input, fixed output) except captionWords(),
// which feeds the model. Nothing is sent anywhere.
//
// Three time bases, kept apart on purpose:
//   file time      seconds into the clip's media file
//   speech time    seconds from the clip's in-point at normal speed (what the model hears)
//   timeline time  seconds on the edit: clip start + speech time / speed
import { chunkAtGaps, heardWords, SR } from './lyricsync.js';
import { captionStyle } from '../subtitles.js';
import { layoutClips, uid } from '../core.js';

export { LANGUAGES } from './lyricsync.js';
export const AUTO = 'auto'; // let the model detect the language (fine for speech, unlike a screamed vocal)

const r3 = (v) => Math.round(v * 1000) / 1000;
const MAX_WORD = 1.5; // Whisper stretches a word over a pause; a caption word never lasts longer than this

// ------------------------------------------------------------ which audio, and where it lands

/**
 * What the model should hear, and where it goes, for a selected thing in the edit:
 * a video clip on the main lane or an overlay layer, or an extra audio track. null when it has no audio file.
 * { mediaId, from, length, speed, start } - `from` is the in-point in the file (s), `length` how much of the
 * file plays (s, at the clip's speed), `start` where it begins on the timeline (s).
 */
export function clipTarget(p, sel) {
  if (!sel) return null;
  if (sel.type === 'audio') {
    const a = (p.audioTracks || []).find((x) => x.id === sel.id);
    return a ? { mediaId: a.mediaId, from: a.in || 0, length: a.duration, speed: 1, start: a.start || 0, kind: 'audio' } : null;
  }
  if (sel.type !== 'clip') return null;
  const main = (p.clips || []).find((c) => c.id === sel.id);
  let clip = main;
  let start = 0;
  if (main) start = layoutClips(p.clips).find((l) => l.clip.id === sel.id).start;
  else {
    for (const l of p.layers || []) {
      const c = l.type === 'video' && l.clips.find((x) => x.id === sel.id);
      if (c) ((clip = c), (start = c.start || 0));
    }
  }
  if (!clip || clip.kind !== 'video') return null;
  const speed = clip.speed || 1;
  return { mediaId: clip.mediaId, from: clip.in || 0, length: clip.duration * speed, speed, start, kind: 'video' };
}

/** The part of the decoded file (16 kHz mono) that plays: from the in-point for `length` seconds of file. */
export function windowSamples(samples, target, sr = SR) {
  const a = Math.max(0, Math.floor(target.from * sr));
  const b = Math.min(samples.length, Math.ceil((target.from + target.length) * sr));
  return b > a ? samples.slice(a, b) : new Float32Array(0);
}

// ------------------------------------------------------------ words to caption lines

const ENDS_SENTENCE = /[.!?…。！？]["')\]]?$/;
const ENDS_CLAUSE = /[,;:–—]["')\]]?$/;

/**
 * Cut words ([{ w, t, end }] in speech time) into caption lines that are easy to read: a new line at a pause
 * (gap), after a sentence end once the line has a few words, and whenever a line would pass `maxChars`,
 * `maxWords` or `maxDur`. Returns [{ text, start, end, words }]; a line ends a moment after its last word
 * (never into the next line). Words are copied, never changed.
 */
export function buildCues(words, { maxChars = 34, maxWords = 7, maxDur = 4, gap = 0.7, minWords = 3 } = {}) {
  const ws = (words || []).filter((x) => x && typeof x.w === 'string' && x.w.trim() && Number.isFinite(x.t)).map((x) => ({ w: x.w.trim(), t: x.t, end: Number.isFinite(x.end) && x.end > x.t ? Math.min(x.end, x.t + MAX_WORD) : x.t + 0.3 }));
  const groups = [];
  let cur = [];
  const chars = (g) => g.reduce((s, x) => s + x.w.length, 0) + Math.max(0, g.length - 1);
  for (const w of ws) {
    if (cur.length) {
      const last = cur[cur.length - 1];
      const brk =
        w.t - last.end > gap ||
        (ENDS_SENTENCE.test(last.w) && cur.length >= minWords) ||
        cur.length >= maxWords ||
        chars(cur) + 1 + w.w.length > maxChars ||
        w.end - cur[0].t > maxDur ||
        (ENDS_CLAUSE.test(last.w) && cur.length >= maxWords - 2);
      if (brk) (groups.push(cur), (cur = []));
    }
    cur.push(w);
  }
  if (cur.length) groups.push(cur);
  return groups.map((g, i) => {
    const next = groups[i + 1];
    const last = g[g.length - 1];
    const end = Math.min(last.end + 0.2, next ? next[0].t - 0.02 : Infinity);
    return { text: g.map((x) => x.w).join(' '), start: r3(g[0].t), end: r3(Math.max(end, g[0].t + 0.3)), words: g.map((x) => ({ w: x.w, t: r3(x.t), end: r3(x.end) })) };
  });
}

/**
 * Speech-time cues to timeline time: `start + t / speed`, so a clip played at 2x gets captions twice as fast,
 * and one trimmed with an in-point starts at its first heard word (the window already begins at the in-point).
 * Anything that starts after the clip's end on the timeline (`length` file seconds / speed) is dropped, the
 * rest is cut at that end. Returns new cues; the input is not changed.
 */
export function toTimeline(cues, { start = 0, speed = 1, length = Infinity } = {}) {
  const sp = speed > 0 ? speed : 1;
  const stop = start + length / sp;
  const at = (t) => r3(start + t / sp);
  const out = [];
  for (const c of cues) {
    const s = at(c.start);
    if (s >= stop - 0.05) continue;
    const words = c.words.filter((k) => at(k.t) < stop - 0.02).map((k) => ({ w: k.w, t: at(k.t), end: r3(Math.min(at(k.end), stop)) }));
    out.push({ text: words.map((k) => k.w).join(' '), start: s, end: r3(Math.min(at(c.end), stop)), words });
  }
  return out.filter((c) => c.words.length);
}

// ------------------------------------------------------------ into the edit

/** The captions that overlap [from, to] on the timeline (what "Replace" would remove). */
export const captionsIn = (p, from, to) => (p.texts || []).filter((t) => t.caption && t.end > from + 0.01 && t.start < to - 0.01);

/**
 * Put the cues on the Text row as captions (caption:true, an existing style, word times kept so "Word by word"
 * lands on the spoken words). mode 'replace' first removes the captions that overlap the clip's stretch of the
 * timeline; 'add' keeps them. Lyrics and other texts are never touched. Call inside one store.update (one undo
 * step). Returns how many captions were added.
 */
export function addSpeechCaptions(d, cues, { mode = 'add', style = 'bold', y = 72, from, to } = {}) {
  const st = captionStyle(style);
  if (mode === 'replace') {
    const gone = new Set(captionsIn(d, from ?? cues[0].start, to ?? cues[cues.length - 1].end).map((t) => t.id));
    d.texts = (d.texts || []).filter((t) => !gone.has(t.id));
  }
  d.texts = d.texts || [];
  for (const c of cues) d.texts.push({ id: uid('txt'), caption: true, captionStyle: style, text: c.text, start: c.start, end: c.end, x: 50, y, ...st, words: c.words });
  return cues.length;
}

// ------------------------------------------------------------ the whole run

const abortError = () => Object.assign(new Error('Cancelled'), { name: 'AbortError' });

/**
 * Run the model over `samples` (16 kHz mono, already cut to the clip's window) and return every word it heard in
 * speech time. `pipe(audio, options)` is the loaded ASR pipeline. language 'auto' sends no language, so the model
 * detects it. onProgress(fraction, text). signal: an AbortSignal, checked between chunks.
 * Resolves { words, chunks }.
 */
export async function captionWords({ samples, sr = SR, pipe, language = AUTO, onProgress, signal }) {
  const chunks = chunkAtGaps(samples, sr);
  const work = chunks.filter((c) => !c.silent);
  const words = [];
  let done = 0;
  for (const c of work) {
    if (signal && signal.aborted) throw abortError();
    onProgress && onProgress(done / Math.max(1, work.length), `Listening… ${done + 1} of ${work.length}`);
    const audio = samples.slice(Math.floor(c.start * sr), Math.ceil(c.end * sr));
    const opts = { return_timestamps: 'word', task: 'transcribe' };
    if (language && language !== AUTO) opts.language = language;
    words.push(...heardWords(await pipe(audio, opts), c.start));
    done++;
  }
  if (signal && signal.aborted) throw abortError();
  onProgress && onProgress(1, 'Making the captions…');
  return { words, chunks };
}
