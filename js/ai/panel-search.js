// "Find a moment" (Video Studio → Video tab): type what you are looking for ("crowd jumping", "close-up of
// guitar") and get the best moments across your footage, each with a thumbnail, its time and "Add to video",
// which puts the clip on the video track starting at that moment. The last search also steers the Suggested
// edits (activeExtraScore), and "Best frame" picks a sharp, well-lit frame (matching the words when given) for a
// thumbnail. Run state lives here, not in the panel, so a panel rebuild keeps a run's progress.
//
// env = { addClip(rec, { from, len }), songFiles(): [{ id, title, video, footage }], currentSongId(): string }
import { warnDownload } from '../mobilelogic.js';
import { h, button, toast, download } from '../dom.js';
import { media, addMedia } from '../media.js';
import { relinkNotice } from '../relink.js';
import { ensureIndex, runSearch, clearSearch, searchState, searchModelInfo, cachedEntry } from './searchindex.js';
import { momentClip, relativeMatch, bestFrameIndex } from './clipsearch.js';

export const EXAMPLES = ['crowd jumping', 'close-up of guitar', 'drummer playing', 'singer at the microphone', 'stage lights and smoke'];
const CLIP_LEN = 4;
const st = { phase: 'idle', frac: 0, text: '', msg: '', ctl: null, info: null, query: '', scope: '', failed: [], best: null };
const views = new Set();

const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

function repaint() {
  for (const v of [...views]) {
    if (!v.box.isConnected) views.delete(v);
    else paint(v.box, v.env);
  }
}

/** Which videos a scope searches: 'all' (every library video) or a song id (its music video and raw footage). */
export function scopeRecords(scope, env) {
  const vids = (ids) => ids.map((id) => media.get(id)).filter((r) => r && r.kind === 'video' && r.blob);
  if (scope && scope !== 'all') {
    const s = env.songFiles().find((x) => x.id === scope);
    if (s) return vids([...(s.video ? [s.video.id] : []), ...s.footage.map((f) => f.id)]);
  }
  return media.all().filter((r) => r.kind === 'video' && r.blob);
}

function scopes(env) {
  const songs = env.songFiles().filter((s) => s.footage.length || s.video);
  return [['all', `All videos in the library (${scopeRecords('all', env).length})`], ...songs.map((s) => [s.id, `${s.title}: footage and music video (${scopeRecords(s.id, env).length})`])];
}

function currentScope(env) {
  const list = scopes(env);
  if (st.scope && list.some(([k]) => k === st.scope)) return st.scope;
  const cur = env.currentSongId();
  return cur && list.some(([k]) => k === cur) ? cur : 'all';
}

async function begin(env, query) {
  st.query = String(query || '').trim();
  if (!st.query) return;
  st.best = null;
  let info;
  try {
    info = await searchModelInfo();
  } catch {
    info = { cached: false, sizeMB: 23, label: 'the picture model' };
  }
  if (info.cached) return start(env);
  st.phase = 'consent';
  st.info = info;
  repaint();
}

async function start(env) {
  const recs = scopeRecords(currentScope(env), env);
  if (!recs.length) {
    st.phase = 'error';
    st.msg = 'No videos to search here. Add footage in My clips, or on a song’s Files tab in the Manager.';
    return repaint();
  }
  st.ctl = new AbortController();
  st.phase = 'running';
  st.frac = 0;
  st.text = 'Getting the model ready…';
  st.failed = [];
  repaint();
  try {
    const { entries, failed } = await ensureIndex(recs, { consented: true, signal: st.ctl.signal, onProgress: (f, t) => ((st.frac = f), (st.text = t), repaint()) });
    st.failed = failed;
    if (st.ctl.signal.aborted) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
    st.text = 'Searching…';
    repaint();
    const results = await runSearch(st.query, entries);
    st.phase = 'done';
    st.msg = results.length ? '' : 'Nothing found. Try other words.';
  } catch (e) {
    if (e && e.name === 'AbortError') {
      st.phase = 'idle';
      toast('Search cancelled. Videos already looked at stay ready for next time.');
    } else {
      st.phase = 'error';
      st.msg = (e && e.message) || 'The search failed.';
    }
  }
  st.ctl = null;
  repaint();
}

/** A full-size still of a video at `t`, as a PNG blob. */
async function grabFrame(rec, t) {
  const v = Object.assign(document.createElement('video'), { muted: true, preload: 'auto', playsInline: true, src: rec.url });
  try {
    await new Promise((res, rej) => ((v.onloadeddata = res), (v.onerror = () => rej(new Error('The video could not be opened.')))));
    v.currentTime = t;
    await new Promise((res) => (v.onseeked = res));
    const c = Object.assign(document.createElement('canvas'), { width: v.videoWidth, height: v.videoHeight });
    c.getContext('2d').drawImage(v, 0, 0);
    return await new Promise((res) => c.toBlob(res, 'image/png'));
  } finally {
    v.removeAttribute('src');
    v.load();
  }
}

async function findBest(env, id) {
  const rec = media.get(id);
  const e = rec && (await cachedEntry(rec));
  if (!e) {
    st.best = { id, msg: 'Search this video first (any words), then pick its best frame.' };
    return repaint();
  }
  const useQuery = searchState.vec && searchState.entries.some((x) => x.id === id);
  const i = bestFrameIndex(e, useQuery ? searchState.vec : null);
  st.best = { id, t: e.times[i], thumb: e.thumbs[i], name: rec.name, query: useQuery ? searchState.query : '' };
  repaint();
}

function resultCard(r, env, best, floor) {
  const rec = media.get(r.mediaId);
  const e = searchState.entries.find((x) => x.id === r.mediaId);
  const name = rec ? rec.name : media.missingLabel(r.mediaId, 'video');
  const pct = relativeMatch(r.score, best, floor);
  return h(
    'div',
    { class: 'find-card', 'data-k': 'find-result', 'data-t': String(r.t), 'data-media': r.mediaId },
    e && e.thumbs[r.idx] ? h('img', { src: e.thumbs[r.idx], alt: `${name} at ${mmss(r.t)}`, loading: 'lazy' }) : h('span', { class: 'find-noimg' }),
    h('div', { class: 'find-info' }, h('span', { class: 'find-name small', title: name }, name), h('span', { class: 'muted tiny' }, `at ${mmss(r.t)}`), h('span', { class: 'find-bar', title: `Match ${pct}% of the best result` }, h('i', { style: { width: `${pct}%` } }))),
    h(
      'div',
      { class: 'row' },
      button('Add to video', () => {
        if (!rec) return toast('That video is no longer in the library.', 'error');
        const c = momentClip(r.t, rec.duration, CLIP_LEN);
        env.addClip(rec, { from: c.in, len: c.duration });
      }, { iconName: 'plus', variant: 'sm primary', title: `Add ${CLIP_LEN} s of this video, starting just before ${mmss(r.t)}, to the end of the video track`, disabled: !rec }),
      button('Best frame', () => findBest(env, r.mediaId), { iconName: 'image', variant: 'sm ghost', title: 'The sharpest, best-lit frame of this video that matches the words, for a thumbnail' }),
    ),
  );
}

function bestBox(env) {
  const b = st.best;
  if (!b) return null;
  if (b.msg) return h('p', { class: 'muted small', 'data-k': 'find-best' }, b.msg);
  const rec = media.get(b.id);
  const stem = (b.name || 'frame').replace(/\.[a-z0-9]+$/i, '');
  const fileName = `${stem}-${b.t.toFixed(1)}s.png`;
  return h(
    'div',
    { class: 'find-best', 'data-k': 'find-best', 'data-t': String(b.t) },
    h('img', { src: b.thumb, alt: `Best frame of ${b.name}` }),
    h(
      'div',
      { class: 'find-info' },
      h('strong', { class: 'small' }, `Best frame of “${b.name}” at ${mmss(b.t)}`),
      h('span', { class: 'muted tiny' }, b.query ? `Sharp, well lit and closest to “${b.query}”.` : 'The sharpest, best-lit frame.'),
      h(
        'div',
        { class: 'row' },
        button('Save as PNG', async () => {
          if (!rec) return toast('That video is no longer in the library.', 'error');
          download(await grabFrame(rec, b.t), fileName);
        }, { iconName: 'download', variant: 'sm' }),
        button('Add to photos', async () => {
          if (!rec) return toast('That video is no longer in the library.', 'error');
          await addMedia(await grabFrame(rec, b.t), fileName);
          toast(`Saved “${fileName}” to the library. The Photo Studio can use it for a thumbnail.`);
        }, { iconName: 'plus', variant: 'sm ghost', title: 'Keep it in the media library (Photo Studio thumbnails, covers)' }),
      ),
    ),
  );
}

function paint(box, env) {
  box.replaceChildren();
  box.append(h('p', { class: 'small' }, 'Describe a moment and find it in your footage. The videos are looked at once on this device; nothing is uploaded.'));
  if (st.phase === 'running') {
    box.append(
      h('div', { class: 'ai-progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(st.frac * 100), 'data-k': 'find-progress' }, h('i', { style: { width: `${Math.round(st.frac * 100)}%` } })),
      h('p', { class: 'muted tiny', 'data-k': 'find-status' }, st.text),
      button('Cancel', () => st.ctl && st.ctl.abort(), { iconName: 'x', variant: 'ghost', title: 'Stop. Videos already looked at are kept.' }),
    );
    return;
  }
  if (st.phase === 'consent') {
    const i = st.info || {};
    const mb = i.sizeMB || 23;
    box.append(
      h(
        'div',
        { class: 'ai-consent', 'data-k': 'find-consent' },
        h('strong', {}, `Download the picture model (${mb} MB)?`),
        warnDownload(mb) ? h('p', { class: 'warn-list small', role: 'note' }, warnDownload(mb)) : null,
        h('p', { class: 'small' }, `One time only: TinyCLIP (MIT licence) is downloaded from huggingface.co and kept in this browser. No video, picture or search words are sent anywhere; your footage is looked at on this device${i.device === 'wasm' ? ' (without a graphics chip’s help, about half a second for each second of video, once)' : ''}.`),
        h('div', { class: 'row' }, button(`Download ${mb} MB and search`, () => start(env), { variant: 'primary', iconName: 'download' }), button('Not now', () => ((st.phase = 'idle'), repaint()), { variant: 'ghost' })),
      ),
    );
    return;
  }
  const list = scopes(env);
  const scope = currentScope(env);
  const sel = h('select', { 'aria-label': 'Which videos to search', 'data-k': 'find-scope' }, list.map(([k, label]) => h('option', { value: k, selected: k === scope }, label)));
  sel.addEventListener('change', () => (st.scope = sel.value));
  const input = h('input', { type: 'search', value: st.query, placeholder: 'e.g. crowd jumping, close-up of guitar', 'aria-label': 'Describe the moment', 'data-k': 'find-query', maxlength: 200 });
  input.addEventListener('keydown', (e) => e.key === 'Enter' && begin(env, input.value));
  box.append(
    sel,
    h('div', { class: 'row find-row' }, input, button('Find', () => begin(env, input.value), { iconName: 'search', variant: 'primary' })),
    h('div', { class: 'chips' }, EXAMPLES.map((x) => button(x, () => begin(env, x), { variant: 'chip' }))),
    relinkNotice('all'),
  );
  if (st.phase === 'error') box.append(h('p', { class: 'warn-note small', role: 'alert', 'data-k': 'find-error' }, st.msg));
  if (st.failed.length) box.append(h('p', { class: 'warn-note small', 'data-k': 'find-failed' }, `Left out ${plural(st.failed.length, 'video')}: ${st.failed.map((f) => f.msg).join(' ')}`));
  const res = searchState.results;
  if (searchState.vec) {
    box.append(
      h(
        'p',
        { class: 'muted tiny', 'data-k': 'find-summary' },
        `${res.length === 1 ? 'The best moment' : res.length ? `The best ${res.length} moments` : 'No moments'} for “${searchState.query}” in ${plural(searchState.entries.length, 'video')}. The Suggested edits favour matching moments too. `,
        h('button', { type: 'button', class: 'link', onclick: () => (clearSearch(), (st.best = null), (st.phase = 'idle'), repaint()) }, 'Clear search'),
      ),
    );
    if (st.msg && st.phase === 'done') box.append(h('p', { class: 'muted small' }, st.msg));
    const best = res.length ? res[0].score : 0;
    const floor = res.length ? res[res.length - 1].score - 0.01 : 0;
    box.append(h('div', { class: 'find-list' }, res.map((r) => resultCard(r, env, best, floor))));
  }
  box.append(bestBox(env));
}

/** The Find a moment box. Rebuilding it (a panel refresh) keeps a run's progress and the results. */
export function findMomentBox(env) {
  const box = h('div', { class: 'find-moment', 'data-k': 'find-moment' });
  views.add({ box, env });
  paint(box, env);
  return box;
}
