// Notes from a stem with Spotify's Basic Pitch (Apache-2.0), on this device. The library, TensorFlow.js and the
// 0.9 MB model are vendored under vendor/basic-pitch/, so nothing is downloaded and no audio leaves the browser
// (no download prompt is needed, unlike the speech model in runtime.js).
//  - detectNotes(): runs the model over the stem in windows (CHUNK_SEC), reports progress, stops on an AbortSignal,
//    and joins the notes a window edge cut in two. Works in a Worker, in the page and in Node (the unit tests).
//  - transcribeStem(): the page's entry point; runs detectNotes in a module Worker (basicpitch.worker.js) so a
//    4-minute stem does not freeze the page, and falls back to the page when the Worker can't start.
// Audio must be mono at BP_SR (22050 Hz): decodeStem() in transcribe.js gives that.
import { joinAtSeams } from '../stemtab.js';

export const BP_BASE = new URL('../../vendor/basic-pitch/', import.meta.url).href;
export const BP_SR = 22050;
export const CHUNK_SEC = 20; // the model runs on this much audio at a time (bounded memory, progress, cancel)
const LEAD_IN = 1; // seconds of the previous window each window also hears

let libs = null;
let modelPromise = null;
let modelSource = null;
let backendName = '';

/** Tests: load the model from this (a tf.io handler, e.g. tf.io.fromMemory) instead of the vendored URL. */
export function setModelSourceForTesting(src) {
  modelSource = src;
  modelPromise = null;
}

/** The vendored modules (TensorFlow.js, Basic Pitch's model runner and note decoder). */
export async function loadLibs() {
  if (!libs) {
    libs = Promise.all([import(`${BP_BASE}tf.fesm.min.js`), import(`${BP_BASE}inference.js`), import(`${BP_BASE}toMidi.js`)]).then(([tf, inf, tm]) => ({ tf, BasicPitch: inf.BasicPitch, outputToNotesPoly: tm.outputToNotesPoly, noteFramesToTime: tm.noteFramesToTime }));
    libs.catch(() => (libs = null));
  }
  return libs;
}

/** WebGL when it works here (much faster), else plain JavaScript on the CPU. */
async function pickBackend(tf, prefer) {
  for (const b of prefer ? [prefer] : ['webgl', 'cpu']) {
    try {
      if (await tf.setBackend(b)) {
        await tf.ready();
        return b;
      }
    } catch {
      /* not available here */
    }
  }
  await tf.setBackend('cpu');
  return 'cpu';
}

async function model(backend) {
  const L = await loadLibs();
  if (!modelPromise) {
    modelPromise = (async () => {
      backendName = await pickBackend(L.tf, backend);
      return L.tf.loadGraphModel(modelSource || `${BP_BASE}model/model.json`);
    })();
    modelPromise.catch(() => (modelPromise = null));
  }
  return { L, m: await modelPromise };
}

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const abortError = () => Object.assign(new Error('Stopped.'), { name: 'AbortError' });

/**
 * Notes in mono samples at 22050 Hz: [{ start, dur, pitch, amp }] sorted by start (seconds, MIDI, 0..1).
 * opts: onProgress(0..1), signal (AbortSignal, checked between windows), range [low, high] MIDI (tells the
 * decoder which pitches to look for), onsetThresh / frameThresh / minNoteFrames (Basic Pitch's own settings),
 * backend ('webgl' | 'cpu', default: the best that works). Resolves with { notes, backend }.
 */
export async function detectNotes(samples, { onProgress = () => {}, signal = null, range = null, onsetThresh = 0.5, frameThresh = 0.3, minNoteFrames = 6, backend = '', chunkSec = CHUNK_SEC } = {}) {
  const { L, m } = await model(backend);
  const bp = new L.BasicPitch(m);
  const step = Math.round(chunkSec * BP_SR);
  const n = Math.max(1, Math.ceil(samples.length / step));
  const notes = [];
  const seams = [];
  const lead = (c0) => (c0 > 0 ? Math.round(LEAD_IN * BP_SR) : 0);
  for (let c = 0; c < n; c++) {
    if (signal && signal.aborted) throw abortError();
    const i0 = c * step;
    if (samples.length - i0 < BP_SR * 0.1) break;
    // each window after the first also hears the second before it, so a note ringing over the edge is not
    // mistaken for a new one there; what it finds before the edge is the previous window's
    const a0 = i0 - lead(c);
    const part = samples.slice(a0, Math.min(samples.length, i0 + step));
    const frames = [];
    const onsets = [];
    L.tf.engine().startScope(); // the runner doesn't free its tensors: free each window's here
    try {
      await bp.evaluateModel(part, (f, o) => (frames.push(...f), onsets.push(...o)), (p) => onProgress((c + Math.min(1, p)) / n));
    } finally {
      L.tf.engine().endScope();
    }
    const found = L.noteFramesToTime(L.outputToNotesPoly(frames, onsets, onsetThresh, frameThresh, minNoteFrames, true, range ? hz(range[1] + 0.5) : null, range ? hz(range[0] - 0.5) : null, true));
    const t0 = i0 / BP_SR;
    for (const x of found) {
      let start = x.startTimeSeconds + a0 / BP_SR;
      const end = start + x.durationSeconds;
      if (c > 0 && end <= t0 + 0.01) continue; // the previous window has it
      if (start < t0) start = t0; // the rest of a note that started before the edge: joined below
      notes.push({ start: +start.toFixed(4), dur: +(end - start).toFixed(4), pitch: x.pitchMidi, amp: +x.amplitude.toFixed(3) });
    }
    if (c > 0) seams.push(t0);
    // let the page (or the worker's message loop) breathe between windows
    await new Promise((r) => setTimeout(r, 0));
  }
  onProgress(1);
  return { notes: joinAtSeams(notes, seams).sort((a, b) => a.start - b.start || a.pitch - b.pitch), backend: backendName };
}

/**
 * The page's way in: detectNotes in a Worker (falls back to the page). Same options; `signal` stops the Worker at
 * once. Resolves with { notes, backend, where: 'worker' | 'page' }.
 */
export function transcribeStem(samples, { onProgress = () => {}, signal = null, ...opts } = {}) {
  if (signal && signal.aborted) return Promise.reject(abortError());
  let worker = null;
  try {
    worker = new Worker(new URL('./basicpitch.worker.js', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }
  const inPage = () => detectNotes(samples, { ...opts, onProgress, signal }).then((r) => ({ ...r, where: 'page' }));
  if (!worker) return inPage();
  return new Promise((resolve, reject) => {
    let started = false;
    const stop = () => {
      worker.terminate();
      reject(abortError());
    };
    if (signal) signal.addEventListener('abort', stop, { once: true });
    const done = () => signal && signal.removeEventListener('abort', stop);
    worker.onmessage = (e) => {
      const d = e.data || {};
      started = true;
      if (d.type === 'progress') onProgress(d.p);
      else if (d.type === 'done') {
        done();
        worker.terminate();
        resolve({ notes: d.notes, backend: d.backend, where: 'worker' });
      } else if (d.type === 'error') {
        done();
        worker.terminate();
        reject(new Error(d.message));
      }
    };
    worker.onerror = (e) => {
      e.preventDefault && e.preventDefault();
      worker.terminate();
      if (started) {
        done();
        return reject(new Error(e.message || 'The note finder stopped.'));
      }
      done();
      inPage().then(resolve, reject); // module workers unsupported, or the worker could not load
    };
    // a copy goes to the worker; the page keeps its samples for the waveform
    const copy = samples.slice();
    worker.postMessage({ samples: copy, opts }, [copy.buffer]);
  });
}
