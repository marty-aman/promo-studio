// "Captions from speech": the box in the Inspector of a video clip or an audio track.
// It asks before the one-time model download (same prompt and same model as lyric auto-sync, so it is only
// ever downloaded once), shows progress with a Cancel button, hears the clip from its in-point for its length,
// and puts the captions on the Text row where the clip sits. If captions are already there it asks: replace
// the ones under this clip, or add alongside. The state of a run lives here, not in the panel, so the panel
// being rebuilt (the app refreshes panels often) does not lose the progress.
import { warnDownload } from '../mobilelogic.js';
import { h, button, toast } from '../dom.js';
import { decodeStem } from '../transcribe.js';
import { loadPipeline, modelInfo, ASR_TASK, DEFAULT_ASR } from './runtime.js';
import { SR } from './lyricsync.js';
import { captionWords, buildCues, toTimeline, windowSamples, captionsIn, addSpeechCaptions, LANGUAGES, AUTO } from './captionsync.js';

const LANG_KEY = 'pvm.ai.captionlang.v1';
const runs = new Map(); // clip id -> { phase: 'idle'|'consent'|'running'|'choose'|'done'|'error', frac, text, msg, ctl, info, cues, span }
const views = new Map(); // clip id -> Set of { box, env }
const run = (key) => {
  if (!runs.has(key)) runs.set(key, { phase: 'idle', frac: 0, text: '', msg: '' });
  return runs.get(key);
};

export function getLanguage() {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v === AUTO || LANGUAGES.some(([k]) => k === v) ? v : AUTO;
  } catch {
    return AUTO;
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

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

async function start(env, language) {
  const st = run(env.key);
  const target = env.target();
  const blob = target && (await env.blob(target.mediaId)); // the file may not be open yet: read it from storage
  if (!target || !blob) return fail(st, env, 'That file is missing from the library. Re-link it first.');
  st.ctl = new AbortController();
  st.phase = 'running';
  st.frac = 0;
  st.text = 'Getting the model ready…';
  repaint(env.key);
  try {
    const pipe = await loadPipeline(ASR_TASK, DEFAULT_ASR, { consented: true, onProgress: (f, t) => ((st.frac = f * 0.3), (st.text = t), repaint(env.key)) });
    if (st.ctl.signal.aborted) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
    st.text = 'Opening the sound…';
    st.frac = 0.3;
    repaint(env.key);
    let decoded;
    try {
      decoded = await decodeStem(blob, SR);
    } catch {
      throw new Error('This file has no sound the browser can read, so there is nothing to caption.');
    }
    const samples = windowSamples(decoded.samples, target);
    const res = await captionWords({ samples, pipe, language, signal: st.ctl.signal, onProgress: (f, t) => ((st.frac = 0.3 + f * 0.7), (st.text = t), repaint(env.key)) });
    const cues = toTimeline(buildCues(res.words), { start: target.start, speed: target.speed, length: target.length });
    if (!cues.length) {
      st.phase = 'error';
      st.msg = 'No speech was heard in this clip. Check the language, or that the clip has talking in it. Nothing was changed.';
    } else {
      st.cues = cues;
      st.span = [target.start, target.start + target.length / target.speed];
      const n = env.existing(st.span[0], st.span[1]);
      if (n) st.phase = 'choose';
      else finish(env, st, 'add');
    }
  } catch (e) {
    if (e && e.name === 'AbortError') {
      st.phase = 'idle';
      toast('Captions cancelled. Nothing was changed.');
    } else {
      st.phase = 'error';
      st.msg = (e && e.message) || 'Captions from speech failed.';
    }
  }
  st.ctl = null;
  repaint(env.key);
}

function finish(env, st, mode) {
  const n = env.apply(st.cues, mode, st.span);
  st.msg = `${plural(n, 'caption')} on the Text row${mode === 'replace' ? ' (replacing the ones under this clip)' : ''}. Undo (Ctrl+Z) takes them all back.`;
  st.phase = 'done';
  st.cues = null;
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
  box.append(h('div', { class: 'lbl' }, 'Captions from speech'));

  if (st.phase === 'running') {
    box.append(
      h('div', { class: 'ai-progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(st.frac * 100), 'data-k': 'cap-progress' }, h('i', { style: { width: `${Math.round(st.frac * 100)}%` } })),
      h('p', { class: 'muted tiny', 'data-k': 'cap-status' }, st.text),
      button('Cancel', () => st.ctl && st.ctl.abort(), { iconName: 'x', variant: 'ghost', title: 'Stop. Nothing is changed.' }),
    );
    return;
  }

  if (st.phase === 'consent') {
    const i = st.info || {};
    box.append(
      h(
        'div',
        { class: 'ai-consent', 'data-k': 'cap-consent' },
        h('strong', {}, `Download the speech model (${i.sizeMB || 77} MB)?`),
        warnDownload(i.sizeMB || 77) ? h('p', { class: 'warn-list small', role: 'note' }, warnDownload(i.sizeMB || 77)) : null,
        h('p', { class: 'small' }, `One time only: it is downloaded from huggingface.co and kept in this browser. No video, sound or text is sent anywhere; everything is worked out on this device${i.device === 'wasm' ? ' (without a graphics chip’s help a long clip can take a few minutes)' : ''}.`),
        h('div', { class: 'row' }, button(`Download ${i.sizeMB || 77} MB and caption`, () => start(env, st.language || getLanguage()), { variant: 'primary', iconName: 'download' }), button('Not now', () => ((st.phase = 'idle'), repaint(env.key)), { variant: 'ghost' })),
      ),
    );
    return;
  }

  if (st.phase === 'choose') {
    const n = env.existing(st.span[0], st.span[1]);
    box.append(
      h(
        'div',
        { class: 'ai-consent', 'data-k': 'cap-choose' },
        h('strong', {}, `${plural(st.cues.length, 'caption')} ready. ${plural(n, 'caption')} already ${n === 1 ? 'sits' : 'sit'} under this clip.`),
        h('div', { class: 'row wrap' },
          button(`Replace those ${n}`, () => (finish(env, st, 'replace'), repaint(env.key)), { variant: 'primary', title: 'Only the captions under this clip are removed. Other captions and the lyrics stay.' }),
          button('Add alongside', () => (finish(env, st, 'add'), repaint(env.key)), { variant: 'sm' }),
          button('Throw these away', () => ((st.phase = 'idle'), (st.cues = null), repaint(env.key)), { variant: 'ghost' }),
        ),
      ),
    );
    return;
  }

  const lang = h('select', { 'aria-label': 'Language spoken', 'data-k': 'cap-lang' }, [h('option', { value: AUTO, selected: getLanguage() === AUTO }, 'Detect it'), ...LANGUAGES.map(([k, n]) => h('option', { value: k, selected: k === getLanguage() }, n))]);
  lang.addEventListener('change', () => setLanguage(lang.value));
  box.append(
    h('p', { class: 'muted tiny' }, 'Listens to this clip on this device and writes what is said as captions, timed to the words. Starts at the clip’s in-point, follows its speed, and lands on the Text row at the clip’s place.'),
    h('div', { class: 'row wrap' }, h('label', { class: 'small' }, 'Language ', lang), button('Captions from speech', () => begin(env, lang.value), { iconName: 'mic', variant: 'sm primary', title: 'Hear the speech in this clip and make captions' })),
  );
  if (st.phase === 'error') box.append(h('p', { class: 'warn-note small', role: 'alert', 'data-k': 'cap-error' }, st.msg));
  if (st.phase === 'done') box.append(h('p', { class: 'small', 'data-k': 'cap-done' }, st.msg));
}

/**
 * The box for one selected clip or audio track.
 * env = {
 *   key: string                              the clip's id (a run survives panel rebuilds under this key)
 *   target(): { mediaId, from, length, speed, start } | null   see captionsync.clipTarget
 *   blob(mediaId): Blob | null
 *   existing(from, to): number               captions already under that stretch of the timeline
 *   apply(cues, mode, [from, to]): number    put them in the edit in one undo step; returns how many
 * }
 */
export function speechCaptionsBox(env) {
  const box = h('div', { class: 'ai-sync', 'data-k': 'cap-speech' });
  if (!views.has(env.key)) views.set(env.key, new Set());
  views.get(env.key).add({ box, env });
  paint(box, env);
  return box;
}

/** The wiring used by the Inspector: `{ store, media }` and the caption defaults of the Captions section. */
export function speechCaptionsFor(sel, { store, media, style, y, target }) {
  return speechCaptionsBox({
    key: sel.id,
    target,
    blob: (id) => (media.blob ? media.blob(id) : (media.get(id) || {}).blob || null),
    existing: (from, to) => captionsIn(store.get(), from, to).length,
    apply: (cues, mode, [from, to]) => {
      let n = 0;
      store.update((d) => (n = addSpeechCaptions(d, cues, { mode, style: style(), y: y(), from, to })));
      return n;
    },
  });
}
