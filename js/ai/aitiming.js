// Times the speech model on a known clip (vendor/samples/jfk.wav, 11 s of speech) through the same code lyric sync and
// speech captions use: model load, then autoSyncLyrics() and captionWords(). Used by the Mac self-check page
// (js/selfcheck.js) and by the Electron measurement driver. Nothing is sent anywhere except the model download the
// caller already asked the person about.
import { decodeStem } from '../transcribe.js';
import { SR, autoSyncLyrics } from './lyricsync.js';
import { captionWords } from './captionsync.js';
import { loadBrowserPipeline, modelInfo, pickDevice, setRuntimeOverride, wasmThreads, ASR_TASK, DEFAULT_ASR } from './runtime.js';
import { makeNativePipe, nativeSetting } from './nativewhisper.js';

export const SAMPLE_URL = new URL('../../vendor/samples/jfk.wav', import.meta.url).href;
export const SAMPLE_LINES = ['And so, my fellow Americans,', 'ask not what your country can do for you,', 'ask what you can do for your country.'];

const r2 = (v) => Math.round(v * 100) / 100;
const now = () => performance.now() / 1000;

/** The clip as 16 kHz mono samples. */
export async function sampleSamples() {
  const res = await fetch(SAMPLE_URL);
  if (!res.ok) throw new Error('The test clip is missing');
  return (await decodeStem(await res.blob(), SR)).samples;
}

/**
 * One timing run. config: { engine: 'browser' | 'whisper.cpp', device?: 'wasm' | 'webgpu', threads?: n }.
 * For the browser engine the device and the thread count must be set before anything else loaded the model in this
 * page (the WASM thread count is read once), so a page times one browser configuration. Resolves
 * { engine, device, threads, model, loadSeconds, downloaded, audioSeconds, lyricSync: { seconds, secondsWarm, heard,
 * matched, lines }, captions: { seconds, words }, realtimeFactor } or { error }.
 * `loadSeconds` for whisper.cpp is 0: the tool loads its model inside each run, so that cost is in the run times.
 */
export async function timeSpeech({ engine = 'browser', device = null, threads = null, onStatus = () => {} } = {}) {
  const out = { engine, at: new Date().toISOString(), isolated: !!globalThis.crossOriginIsolated, cores: navigator.hardwareConcurrency || null };
  try {
    onStatus('Opening the test clip…');
    const samples = await sampleSamples();
    out.audioSeconds = r2(samples.length / SR);
    let pipe;
    if (engine === 'whisper.cpp') {
      const info = {};
      pipe = makeNativePipe({ model: nativeSetting().model, info });
      out.device = 'whisper.cpp';
      out.model = `ggml-${nativeSetting().model}`;
      out.threads = info.threads;
      out.loadSeconds = 0;
      out.downloaded = false;
    } else {
      setRuntimeOverride({ device, threads });
      out.device = await pickDevice();
      out.threads = out.device === 'wasm' ? wasmThreads() : null;
      out.model = (await modelInfo(DEFAULT_ASR)).id;
      out.downloaded = !(await modelInfo(DEFAULT_ASR)).cached;
      onStatus(out.downloaded ? 'Downloading and loading the model…' : 'Loading the model…');
      const t0 = now();
      pipe = await loadBrowserPipeline(ASR_TASK, DEFAULT_ASR, { consented: true });
      out.loadSeconds = r2(now() - t0);
    }
    onStatus('Lyric sync, first run…');
    let t0 = now();
    const first = await autoSyncLyrics({ samples, lyricLines: SAMPLE_LINES, pipe, language: 'en' });
    const lyric = { seconds: r2(now() - t0), heard: first.heard.length, lines: first.lines.length, matched: first.stats ? first.stats.matched ?? null : null };
    onStatus('Lyric sync, second run…');
    t0 = now();
    await autoSyncLyrics({ samples, lyricLines: SAMPLE_LINES, pipe, language: 'en' });
    lyric.secondsWarm = r2(now() - t0);
    out.lyricSync = lyric;
    onStatus('Caption timing…');
    t0 = now();
    const caps = await captionWords({ samples, pipe, language: 'en' });
    out.captions = { seconds: r2(now() - t0), words: caps.words.length };
    out.realtimeFactor = r2(out.audioSeconds / Math.max(0.01, lyric.secondsWarm));
  } catch (e) {
    out.error = String((e && e.message) || e);
  }
  return out;
}
