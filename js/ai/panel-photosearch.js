// Smart search for Manager → Photos: the search box also finds photos by what is in them ("drums", "crowd",
// "singer on stage"), using the same TinyCLIP model and consent prompt as Find a moment (js/ai/searchindex.js).
// Text matches (caption, photographer, tags, file name) stay instant and first; picture matches are added after
// them with a "looks like" badge and a match bar. This file holds the switch, the status bar (progress, pause,
// stop, clear) and the query-vector cache; the page asks it for scores while it draws.
import { h, button, toast } from '../dom.js';
import { photoIndex, onPhotoIndex, indexPhotos, pausePhotoIndex, stopPhotoIndex, startPhotoIndex, clearPhotoIndex, photoQueryVector, photoScore, searchModelInfo } from './searchindex.js';

const SMART_KEY = 'pvm.photos.smart';

/** Smart search is on unless it was turned off (remembered in this browser). */
export function smartOn(storage = globalThis.localStorage) {
  try {
    return storage.getItem(SMART_KEY) !== 'off';
  } catch {
    return true;
  }
}
function setSmart(on) {
  try {
    localStorage.setItem(SMART_KEY, on ? 'on' : 'off');
  } catch {
    /* this visit only */
  }
  if (!on) stopPhotoIndex();
}

// the model's state for this visit: unknown until asked once (cached = no download needed)
const model = { info: null, asking: null, offer: false, at: 0 };
function askModel() {
  // not downloaded yet: look again now and then (Find a moment may have fetched it since)
  if (model.asking || (model.info && (model.info.cached || Date.now() - model.at < 5000))) return;
  model.at = Date.now();
  model.asking = searchModelInfo()
    .catch(() => ({ cached: false, sizeMB: 23 }))
    .then((i) => {
      model.info = i;
      model.asking = null;
      const v = [...views].find((x) => x.bar.isConnected);
      if (v && smartOn() && ready()) indexPhotos(v.env.records()); // the model is already here (Find a moment): start
      changed(true);
    });
}
// 'consent': the model files were removed from the browser since the check; ask again
const ready = () => !!(model.info && (model.info.cached || photoIndex.consented) && photoIndex.phase !== 'consent');

// the query's text vector, kept until the words change
const qv = { q: '', vec: null, busy: false, err: '' };
const views = new Set();
let lastRefresh = 0;
let refreshTimer = null;

/** New vectors or a query vector arrived: redraw the bars, and the page itself (not too often while indexing). */
function changed(force = false) {
  for (const v of [...views]) {
    if (!v.bar.isConnected) {
      views.delete(v);
      continue;
    }
    paint(v);
  }
  const v = [...views].find((x) => x.bar.isConnected);
  if (!v || !v.env.query()) return;
  const now = Date.now();
  const due = force || photoIndex.phase !== 'running' || now - lastRefresh > 3000;
  clearTimeout(refreshTimer);
  if (due) {
    lastRefresh = now;
    v.env.refresh();
  } else refreshTimer = setTimeout(() => changed(true), 3000 - (now - lastRefresh));
}
let lastVer = -1;
let lastPhase = '';
onPhotoIndex((s) => {
  // a progress tick only repaints the bars; new vectors may change the results
  const fresh = s.ver !== lastVer || s.phase !== lastPhase;
  lastVer = s.ver;
  lastPhase = s.phase;
  if (fresh) changed(s.phase === 'done');
  else for (const v of views) if (v.bar.isConnected) paint(v);
});

/**
 * For the page while it draws: a function photo record -> cosine (or null), or null when smart search has nothing
 * to add yet (off, not set up, no query, or the query vector is still being made; the page is redrawn when it is).
 */
export function visualScorer(query) {
  const q = String(query || '').trim();
  if (!q || !smartOn() || !ready()) return null;
  if (qv.q !== q) {
    Object.assign(qv, { q, vec: null, busy: true, err: '' });
    photoQueryVector(q)
      .then((vec) => qv.q === q && Object.assign(qv, { vec, busy: false }))
      .catch((e) => qv.q === q && Object.assign(qv, { busy: false, err: (e && e.message) || 'Smart search failed.' }))
      .finally(() => qv.q === q && changed(true));
    return null;
  }
  return qv.vec ? (rec) => photoScore(rec, qv.vec) : null;
}

const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

function paint(v) {
  const { bar, env } = v;
  const on = smartOn();
  const s = photoIndex;
  const kids = [];
  const sw = h('input', { type: 'checkbox', checked: on, 'data-k': 'photos-smart-on', 'aria-label': 'Smart search: also find photos by what is in them' });
  sw.addEventListener('change', () => {
    setSmart(sw.checked);
    if (sw.checked && ready()) startPhotoIndex(env.records());
    changed(true);
    env.refresh();
  });
  kids.push(h('label', { class: 'ps-switch', title: 'Also find photos by what is in them (drums, crowd, guitar). Runs on this computer.' }, sw, h('span', {}, 'Smart search')));
  if (!on) {
    kids.push(h('span', { class: 'muted tiny' }, 'Off: the search looks at captions, photographers, tags and file names only.'));
    bar.replaceChildren(...kids);
    return;
  }
  if (!model.info) {
    kids.push(h('span', { class: 'muted tiny' }, 'Checking the picture model…'));
  } else if (!ready()) {
    if (model.offer) {
      const mb = model.info.sizeMB || 23;
      bar.replaceChildren(
        h(
          'div',
          { class: 'ai-consent', 'data-k': 'photos-smart-consent' },
          h('strong', {}, `Download the picture model (${mb} MB)?`),
          h('p', { class: 'small' }, `One time only: TinyCLIP (MIT licence) is downloaded from huggingface.co and kept in this browser (Find a moment in the Video Studio uses the same one). No photo, video or search words are sent anywhere; your photos are looked at on this computer, a few at a time in the background.`),
          h('div', { class: 'row' }, button(`Download ${mb} MB and look at my photos`, () => ((model.offer = false), startPhotoIndex(env.records(), { consented: true }), changed(true)), { variant: 'primary', iconName: 'download' }), button('Not now', () => ((model.offer = false), paint(v)), { variant: 'ghost' })),
        ),
      );
      return;
    }
    kids.push(h('span', { class: 'muted tiny' }, env.query() ? 'No luck with the words? Smart search can look at the pictures themselves.' : 'Find photos by what is in them: drums, crowd, guitar…'), button('Set up smart search', () => ((model.offer = true), paint(v)), { variant: 'sm', iconName: 'search' }));
  } else {
    const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
    if (s.phase === 'running' || s.phase === 'paused') {
      kids.push(
        h('div', { class: 'ai-progress ps-progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct, 'data-k': 'photos-smart-progress' }, h('i', { style: { width: `${pct}%` } })),
        h('span', { class: 'muted tiny', 'data-k': 'photos-smart-status' }, s.msg || `${s.phase === 'paused' ? 'Paused at' : 'Indexing photos'} ${s.done}/${s.total}`),
        s.phase === 'paused' ? button('Resume', () => pausePhotoIndex(false), { variant: 'sm ghost', iconName: 'play' }) : button('Pause', () => pausePhotoIndex(true), { variant: 'sm ghost', iconName: 'pause', title: 'Pause looking at photos. Search still uses those already done.' }),
        button('Stop', () => (stopPhotoIndex(), toast(`Stopped. ${plural(s.done, 'photo')} can be found by picture; the rest by words only.`)), { variant: 'sm ghost', iconName: 'x', title: 'Stop for now; Index now carries on later' }),
      );
    } else {
      const left = Math.max(0, s.total - s.done);
      const status = s.phase === 'error' ? s.msg : s.phase === 'stopped' ? `Stopped: ${s.done} of ${plural(s.total, 'photo')} looked at.` : s.total ? `${s.done} of ${plural(s.total, 'photo')} looked at${s.failed ? ` (${s.failed} could not be read)` : ''}.` : 'Ready.';
      kids.push(h('span', { class: `tiny ${s.phase === 'error' ? 'warn-note' : 'muted'}`, 'data-k': 'photos-smart-status' }, status));
      if ((s.phase === 'stopped' || s.phase === 'error') && (left || !s.total)) kids.push(button('Index now', () => startPhotoIndex(env.records()), { variant: 'sm', iconName: 'search' }));
    }
    if (qv.err && env.query()) kids.push(h('span', { class: 'warn-note tiny' }, qv.err));
    else if (qv.busy && env.query()) kids.push(h('span', { class: 'muted tiny' }, 'Looking for matching pictures…'));
    kids.push(
      button('Clear photo index', async () => {
        if (!confirm('Delete what smart search learned about your photos? The photos themselves are not touched; they are looked at again when you click Index now.')) return;
        await clearPhotoIndex();
        toast('Photo index cleared.');
        env.refresh();
      }, { variant: 'sm ghost', iconName: 'trash', title: 'Delete the stored picture vectors (the model stays; nothing else changes)' }),
    );
  }
  kids.push(h('span', { class: 'muted tiny ps-note', title: 'TinyCLIP 8M is a small model: broad things (drums, crowd, stage lights) work better than detail, and some matches will be loose.' }, 'Small on-device model: some “looks like” matches will be loose.'));
  bar.replaceChildren(...kids);
}

/**
 * The smart-search bar under the search box. env = { records(): library photo records, query(): string,
 * refresh(): redraw the page }. Drawing it also keeps the index up to date (new photos are looked at; photos
 * already done are skipped), once the model is set up.
 */
export function smartSearchBar(env) {
  const bar = h('div', { class: 'ps-bar', 'data-k': 'photos-smart' });
  const v = { bar, env };
  views.add(v);
  askModel();
  if (smartOn() && ready()) indexPhotos(env.records());
  paint(v);
  return bar;
}

/** The "looks like" badge and match bar for a picture match on a photo tile. */
export const looksBadge = (visual, query) =>
  h(
    'span',
    { class: 'ps-looks', 'data-k': 'ph-looks', 'data-pct': String(visual.pct), title: `Found by what is in the picture, not its words: ${visual.pct}% of the best match for “${query}”` },
    h('span', {}, 'looks like'),
    h('span', { class: 'ps-looks-bar' }, h('i', { style: { width: `${Math.max(6, visual.pct)}%` } })),
  );
