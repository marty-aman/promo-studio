// "Auto-sync lyrics": the box on the Video Studio's Lyrics tab and the Manager song's Lyrics tab.
// It asks before the one-time model download (naming the size, and saying no song data is sent), shows
// progress with a Cancel button, runs the model on the song's vocal stem (else the full mix, labelled as
// low accuracy), and hands the timed lines to `env.apply`. The state of a run lives here, not in the panel,
// so the panel being rebuilt (the app refreshes panels often) does not lose the progress.
//
// env = {
//   key: 'studio' | 'manager',
//   lines(): string[]                      the lyrics to time, one string a line
//   sources(): { vocal: {mediaId, name}|null, mix: {mediaId, name}|null }
//   blob(mediaId): Blob|null
//   apply(result, info): string            put the timed lines where they belong; returns a one-line summary
//   flagged(): [{ index, text, start }]    lines still unsure (conf under the limit), from what is saved
//   goto(flaggedItem)                      jump to such a line
//   confirmReplace?(): boolean             ask before replacing a timing that already exists
// }
import { h, button, toast } from '../dom.js';
import { decodeStem } from '../transcribe.js';
import { loadPipeline, modelInfo, ASR_TASK, DEFAULT_ASR } from './runtime.js';
import { autoSyncLyrics, LANGUAGES, SR } from './lyricsync.js';

const LANG_KEY = 'pvm.ai.lang.v1';
const runs = new Map(); // key -> { phase: 'idle'|'consent'|'running'|'done'|'error', frac, text, msg, ctl, info }
const views = new Map(); // key -> Set of { box, env }
const run = (key) => {
  if (!runs.has(key)) runs.set(key, { phase: 'idle', frac: 0, text: '', msg: '' });
  return runs.get(key);
};

export function getLanguage() {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return LANGUAGES.some(([k]) => k === v) ? v : 'en';
  } catch {
    return 'en';
  }
}
const setLanguage = (v) => {
  try {
    localStorage.setItem(LANG_KEY, v);
  } catch {
    /* a language choice is not worth a storage message */
  }
};

function repaint(key) {
  const set = views.get(key);
  if (!set) return;
  for (const v of [...set]) {
    if (!v.box.isConnected) set.delete(v);
    else paint(v.box, v.env);
  }
}

async function start(env, language) {
  const st = run(env.key);
  const lines = env.lines();
  const src = env.sources();
  const pick = src.vocal || src.mix;
  const blob = pick && env.blob(pick.mediaId);
  if (!lines.length) return fail(st, env, 'Add the lyrics first.');
  if (!blob) return fail(st, env, src.mix || src.vocal ? 'That audio file is missing from the library. Re-link it first.' : 'Pick the song first.');
  st.ctl = new AbortController();
  st.phase = 'running';
  st.frac = 0;
  st.text = 'Getting the model ready…';
  repaint(env.key);
  try {
    const pipe = await loadPipeline(ASR_TASK, DEFAULT_ASR, { consented: true, onProgress: (f, t) => ((st.frac = f * 0.3), (st.text = t), repaint(env.key)) });
    if (st.ctl.signal.aborted) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
    st.text = 'Opening the audio…';
    st.frac = 0.3;
    repaint(env.key);
    const { samples } = await decodeStem(blob, SR);
    const res = await autoSyncLyrics({
      samples,
      lyricLines: lines,
      pipe,
      language,
      signal: st.ctl.signal,
      onProgress: (f, t) => ((st.frac = 0.3 + f * 0.7), (st.text = t), repaint(env.key)),
    });
    if (!res.lines.length) {
      st.phase = 'error';
      st.msg = 'The model could not hear any of these words. Check the language, use the vocal stem, or tap-sync by hand. Nothing was changed.';
    } else {
      const info = { source: src.vocal ? 'vocals' : 'mix', language };
      if (env.confirmReplace && !env.confirmReplace()) {
        st.phase = 'idle';
      } else {
        st.msg = env.apply(res, info);
        st.phase = 'done';
      }
    }
  } catch (e) {
    if (e && e.name === 'AbortError') {
      st.phase = 'idle';
      toast('Auto-sync cancelled. Nothing was changed.');
    } else {
      st.phase = 'error';
      st.msg = (e && e.message) || 'Auto-sync failed.';
    }
  }
  st.ctl = null;
  repaint(env.key);
}

function fail(st, env, msg) {
  st.phase = 'error';
  st.msg = msg;
  repaint(env.key);
}

async function begin(env, language) {
  const st = run(env.key);
  let info;
  try {
    info = await modelInfo(DEFAULT_ASR);
  } catch {
    info = { cached: false, sizeMB: 77, label: 'the speech model' };
  }
  if (info.cached) return start(env, language);
  st.phase = 'consent';
  st.info = info;
  st.language = language;
  repaint(env.key);
}

function paint(box, env) {
  const st = run(env.key);
  box.replaceChildren();
  const src = env.sources();
  const lines = env.lines();
  const lang = h('select', { 'aria-label': 'Language of the lyrics', 'data-k': 'ai-lang' }, LANGUAGES.map(([k, n]) => h('option', { value: k, selected: k === getLanguage() }, n)));
  lang.addEventListener('change', () => setLanguage(lang.value));

  box.append(h('p', { class: 'small' }, 'Listens to the vocals on this device and times every line and word to your lyrics. Best with a vocal stem: add one on the song’s Files tab.'));

  if (st.phase === 'running') {
    box.append(
      h('div', { class: 'ai-progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(st.frac * 100), 'data-k': 'ai-progress' }, h('i', { style: { width: `${Math.round(st.frac * 100)}%` } })),
      h('p', { class: 'muted tiny', 'data-k': 'ai-status' }, st.text),
      button('Cancel', () => st.ctl && st.ctl.abort(), { iconName: 'x', variant: 'ghost', title: 'Stop. Nothing is changed.' }),
    );
    return;
  }

  if (st.phase === 'consent') {
    const i = st.info || {};
    box.append(
      h(
        'div',
        { class: 'ai-consent', 'data-k': 'ai-consent' },
        h('strong', {}, `Download the speech model (${i.sizeMB || 77} MB)?`),
        h('p', { class: 'small' }, `One time only: it is downloaded from huggingface.co and kept in this browser. No song data, audio or lyrics is sent anywhere; everything is worked out on this device${i.device === 'wasm' ? ' (without a graphics chip’s help it can take a few minutes for a whole song)' : ''}.`),
        h('div', { class: 'row' }, button(`Download ${i.sizeMB || 77} MB and sync`, () => start(env, st.language || getLanguage()), { variant: 'primary', iconName: 'download' }), button('Not now', () => ((st.phase = 'idle'), repaint(env.key)), { variant: 'ghost' })),
      ),
    );
    return;
  }

  // which audio will be heard
  let from;
  if (!src.vocal && !src.mix) from = h('p', { class: 'warn-note small', 'data-k': 'ai-source' }, 'Pick your song first (Audio tab).');
  else if (src.vocal) from = h('p', { class: 'small', 'data-k': 'ai-source' }, `Will listen to the vocal stem “${src.vocal.name}”.`);
  else from = h('p', { class: 'warn-note small', 'data-k': 'ai-source' }, 'No vocal stem on the song’s Files tab, so this will listen to the full mix. That is much less accurate, so expect to fix lines by hand.');
  box.append(from);

  box.append(
    h('div', { class: 'row wrap' }, h('label', { class: 'small' }, 'Language ', lang), button('Auto-sync lyrics', () => begin(env, lang.value), { iconName: 'wand', variant: 'primary', disabled: !lines.length || (!src.vocal && !src.mix), title: !lines.length ? 'Add the lyrics first' : 'Time the lyrics to the song' })),
  );
  if (!lines.length) box.append(h('p', { class: 'muted tiny' }, 'Add the lyrics first.'));

  if (st.phase === 'error') box.append(h('p', { class: 'warn-note small', role: 'alert', 'data-k': 'ai-error' }, st.msg));
  if (st.phase === 'done') box.append(h('p', { class: 'small', 'data-k': 'ai-done' }, st.msg));
  const flagged = env.flagged();
  if (flagged.length) {
    box.append(
      h(
        'div',
        { class: 'ai-flagged', 'data-k': 'ai-flagged' },
        h('p', { class: 'small' }, `${flagged.length} line${flagged.length === 1 ? '' : 's'} the model was not sure about. Tap-sync them or drag them on the timeline:`),
        h('ul', {}, flagged.slice(0, 12).map((f) => h('li', {}, h('button', { type: 'button', class: 'link', onclick: () => env.goto(f) }, `${f.index + 1}. ${f.text.slice(0, 50)}`)))),
        flagged.length > 12 ? h('p', { class: 'muted tiny' }, `and ${flagged.length - 12} more`) : null,
      ),
    );
  }
}

/** The Auto-sync box for one surface. Rebuilding it (a panel refresh) keeps a run's progress. */
export function autoSyncBox(env) {
  const box = h('div', { class: 'ai-sync', 'data-k': `ai-sync-${env.key}` });
  if (!views.has(env.key)) views.set(env.key, new Set());
  views.get(env.key).add({ box, env });
  paint(box, env);
  return box;
}
