// Tools opened from the Inspiration page's playbook: batch export, music-video splitter, posting
// calendar, the caption writer, and the hook-opener library.
import { h, button, toast, download, field } from './dom.js';
import { releaseDay } from './core.js';
import { media, ensureLayerAnalyses } from './media.js';
import { exportVideo, pickMimeType } from './engine.js';
import { realtimeNote } from './exportplan.js';
import { planBatch, applyBatchItem, zipStore, postingSchedule, toICS } from './batch.js';
import { captionPicker } from './panel-captions.js';
import { HOOK_OPENERS, HOOK_KINDS, HOOK_SOURCES, applyHookOpener } from './hooks.js';
import { TRENDS, CALENDAR } from './inspiration.js';

const batchState = { running: false, done: 0, total: 0, current: '', result: null, error: '', cancel: false, notes: [] }; // notes: [{ label, text }] clips recorded in real time and why

const slug = (s) => String(s || 'promo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'promo';

/** Batch export (mode 'song') or music-video splitter (mode 'mv'). */
export function batchTool({ store, engine, render, mode = 'song' }) {
  const p = store.get();
  const song = p.song && media.get(p.song.mediaId);
  const videos = media.all().filter((m) => m.kind === 'video').sort((a, b) => (b.duration || 0) - (a.duration || 0));
  const isMv = mode === 'mv';
  const count = h('input', { type: 'number', min: 2, max: 30, value: isMv ? 8 : 10, class: 'num', 'aria-label': 'How many clips' });
  const len = h('select', { 'aria-label': 'Clip length' }, [8, 12, 15, 20, 30, 45].map((n) => h('option', { value: n, selected: n === 15 }, `${n} s`)));
  const mvSel = h('select', { 'aria-label': 'Music video' }, videos.map((v) => h('option', { value: v.id }, `${v.name} · ${Math.round(v.duration || 0)} s`)));
  const mp4 = pickMimeType('mp4');
  const fmt = mp4 && mp4.startsWith('video/mp4') ? 'mp4' : 'webm';
  const total = () => Math.max(2, Math.min(30, parseInt(count.value, 10) || 10));
  const estimate = h('span', { class: 'muted tiny' });
  const updateEstimate = () => {
    const secs = total() * (Number(len.value) + (p.endCard.enabled ? p.endCard.duration : 0) + 1);
    estimate.textContent = `About ${Math.ceil(secs / 60)} min. Each clip plays through once while it records; keep this tab in front.`;
  };
  count.addEventListener('input', updateEstimate);
  len.addEventListener('change', updateEstimate);
  updateEstimate();

  const run = async () => {
    const L = Number(len.value);
    const mv = isMv ? media.get(mvSel.value) : null;
    if (isMv && !mv) return toast('Add your music video in the Video tab first.', 'error');
    if (!isMv && !song) return toast('Choose your song in the Audio tab first.', 'error');
    const plan = planBatch({ mode, song, mv, len: L, count: total() });
    if (!plan.length) return toast('Could not read the song. Wait for its waveform to load and try again.', 'error');
    const snap = JSON.stringify(store.get());
    Object.assign(batchState, { running: true, done: 0, total: plan.length, result: null, error: '', cancel: false, notes: [] });
    render();
    const files = [];
    try {
      for (const item of plan) {
        if (batchState.cancel) break;
        batchState.current = item.label;
        store.update((d) => applyBatchItem(d, item, { len: L, mvId: mv ? mv.id : null, mvDuration: mv ? mv.duration : 0 }), 'batch');
        await ensureLayerAnalyses(store.get());
        const res = await exportVideo(engine, { format: fmt, fps: 30, bitrate: 8e6, monitor: false, onFallback: (why) => (batchState.notes.push({ label: item.label, text: realtimeNote(why) }), render()) });
        const ext = res.mime.includes('mp4') ? 'mp4' : 'webm';
        files.push({ name: `${slug(p.endCard.title || p.name)}-${item.label}.${ext}`, bytes: new Uint8Array(await res.blob.arrayBuffer()) });
        batchState.done++;
        render();
      }
      if (files.length) {
        const zip = new Blob([zipStore(files)], { type: 'application/zip' });
        batchState.result = { url: URL.createObjectURL(zip), name: `${slug(p.endCard.title || p.name)}-${isMv ? 'music-video-clips' : 'batch'}.zip`, count: files.length, size: zip.size };
      }
    } catch (e) {
      batchState.error = e.message === 'cancelled' ? '' : e.message || 'Batch export failed';
    } finally {
      const back = JSON.parse(snap);
      store.update((d) => {
        for (const k of Object.keys(d)) delete d[k];
        Object.assign(d, back);
      }, 'batch');
      batchState.running = false;
      batchState.current = '';
      render();
    }
  };

  return h(
    'div',
    { class: 'tool-box' },
    h('h4', {}, isMv ? 'Split a music video into clips' : 'Batch export'),
    h('p', { class: 'small' }, isMv
      ? 'Picks the strongest moments of your music video (by its loudest sections) and exports each as its own short with your current look, end card and text. The song plays in sync with the picture.'
      : 'Exports several promos from the loudest, non-overlapping sections of your song, all with the current look, clips, text and end card. You get one .zip.'),
    isMv ? (videos.length ? field('Music video', mvSel) : h('p', { class: 'warn-list small' }, 'Add your music video in the Video tab first.')) : !song ? h('p', { class: 'warn-list small' }, 'Choose your song in the Audio tab first.') : null,
    h('div', { class: 'grid2' }, field('How many', count), field('Each clip', len)),
    estimate,
    batchState.running
      ? h('div', {},
          h('div', { class: 'export-progress' }, h('div', { style: { width: `${Math.round((batchState.done / Math.max(1, batchState.total)) * 100)}%` } })),
          h('div', { class: 'row' }, h('span', { class: 'small batch-status' }, `Clip ${Math.min(batchState.done + 1, batchState.total)} of ${batchState.total} · ${batchState.current}`),
            button('Stop after this clip', () => ((batchState.cancel = true), toast('Stopping after the current clip')), { variant: 'ghost sm' })))
      : button(isMv ? 'Export the clips' : 'Export the batch', run, { iconName: 'download', variant: 'primary', disabled: isMv ? !videos.length : !song }),
    batchState.notes.length
      ? h('div', { class: 'warn-list small', role: 'status', 'data-testid': 'batch-realtime' },
          h('p', {}, batchState.running ? `${batchState.notes[batchState.notes.length - 1].label}: ${batchState.notes[batchState.notes.length - 1].text} Keep this tab in front.` : `${batchState.notes.length === 1 ? '1 clip was' : `${batchState.notes.length} clips were`} recorded in real time:`),
          batchState.running ? null : h('ul', {}, batchState.notes.map((n) => h('li', {}, h('strong', {}, `${n.label}: `), n.text))))
      : null,
    batchState.error ? h('p', { class: 'error-text' }, batchState.error) : null,
    batchState.result ? h('a', { class: 'btn primary', href: batchState.result.url, download: batchState.result.name }, `Download ${batchState.result.count} clips (${(batchState.result.size / 1e6).toFixed(1)} MB .zip)`) : null,
  );
}

/** Posting calendar: 3-5 posts a week for 4-6 weeks, as a list and an .ics file. */
export function calendarTool({ store }) {
  const p = store.get();
  const rel = releaseDay(p.endCard.releaseDate);
  const startDefault = rel ? new Date(rel.getFullYear(), rel.getMonth(), rel.getDate() - 7) : new Date(Date.now() + 86400000);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const start = h('input', { type: 'date', value: iso(startDefault), 'aria-label': 'First post' });
  const per = h('select', { 'aria-label': 'Posts a week' }, [3, 4, 5].map((n) => h('option', { value: n, selected: n === 4 }, `${n} a week`)));
  const weeks = h('select', { 'aria-label': 'Weeks' }, [4, 5, 6].map((n) => h('option', { value: n, selected: n === 6 }, `${n} weeks`)));
  const hour = h('select', { 'aria-label': 'Time' }, [12, 15, 17, 18, 19, 20, 21].map((n) => h('option', { value: n, selected: n === 18 }, `${n > 12 ? n - 12 : n} ${n >= 12 ? 'pm' : 'am'}`)));
  const list = h('ol', { class: 'cal-list small' });
  // follow the release-week plan first, then rotate the other formats
  const order = [...new Set([...CALENDAR.map((c) => c[1]), ...TRENDS.map((t) => t.id)])].map((id) => TRENDS.find((t) => t.id === id)).filter(Boolean);
  const events = () => {
    const [y, m, d] = start.value.split('-').map(Number);
    return postingSchedule(new Date(y, m - 1, d), Number(per.value), Number(weeks.value), Number(hour.value)).map((date, i) => {
      const t = order[i % order.length];
      const w = Math.floor(i / Number(per.value)) + 1;
      return { date, title: `Post: ${t.title.replace(/[“”"]/g, '')}`, note: `${t.why}\n\nWeek ${w}. In Band Manager: Inspiration → “${t.title.replace(/[“”"]/g, '')}” → Build this.${w === 4 ? '\n\nWeek 4: compare views, shares and saves; keep the formats that work.' : ''}` };
    });
  };
  const draw = () => list.replaceChildren(...events().map((e) => h('li', {}, h('strong', {}, e.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })), ` · ${e.title.replace(/^Post: /, '')}`)));
  [start, per, weeks, hour].forEach((el) => el.addEventListener('change', draw));
  draw();
  return h(
    'div',
    { class: 'tool-box' },
    h('h4', {}, 'Posting calendar'),
    h('p', { class: 'small' }, 'A steady plan: the same few days each week, one format per post, with a check-in at week 4. Add it to Google, Apple or Outlook calendar.'),
    h('div', { class: 'grid2' }, field('First post', start), field('Time', hour)),
    h('div', { class: 'grid2' }, field('Posts', per), field('For', weeks)),
    list,
    button('Download calendar (.ics)', () => download(new Blob([toICS(events(), `${p.endCard.title || 'Promo'} posting plan`)], { type: 'text/calendar' }), `${slug(p.endCard.title || 'promo')}-posting-plan.ics`), { iconName: 'download', variant: 'primary' }),
  );
}

export function captionTool({ store, settings }) {
  return h('div', { class: 'tool-box' }, h('h4', {}, 'Caption for this edit'), captionPicker({ project: store.get(), settings, kind: 'video' }));
}

/** Hook-opener library with "Add as intro". */
export function hookOpeners({ store, engine, ui, settings, panels }) {
  const clips = media.all().filter((m) => m.kind === 'video' || m.kind === 'image');
  const kinds = Object.keys(HOOK_KINDS);
  const card = (hk) => {
    const pick = h('select', { 'aria-label': `Clip to open “${hk.title}” with` }, h('option', { value: '' }, 'Use my first clip'), clips.map((m) => h('option', { value: m.id }, m.name)));
    const add = async () => {
      const rec = pick.value ? media.get(pick.value) : null;
      let sfx = null;
      store.update((d) => (sfx = applyHookOpener(d, hk, { clipMediaId: rec && rec.id, clipKind: rec && rec.kind, clipDuration: rec && rec.duration, similar: settings.similarBands })));
      if (sfx && panels && panels.actions.addBuiltinSfx) await panels.actions.addBuiltinSfx(sfx, 0);
      engine.seek(0);
      toast(`“${hk.title}” is the intro. Undo (Ctrl+Z) to go back.`, 'info', 4500);
    };
    return h(
      'article',
      { class: 'hook-card' },
      h('div', { class: 'trend-head' }, h('h4', {}, hk.title), h('span', { class: `plat kind-${hk.kind}` }, HOOK_KINDS[hk.kind])),
      h('p', { class: 'small' }, hk.how),
      hk.safety ? h('p', { class: 'tiny warn-note' }, `⚠ ${hk.safety}`) : null,
      hk.text ? h('div', { class: 'hookline' }, h('span', { class: 'muted tiny' }, 'On-screen'), h('strong', {}, hk.text.replace(/\{similar\}/gi, (settings.similarBands || 'your favorite bands').toUpperCase()))) : null,
      hk.stock ? h('div', { class: 'chips' }, hk.stock.map((q) => button(q, () => panels.actions.stockSearch(q), { variant: 'chip', iconName: 'search' }))) : null,
      hk.kind === 'app'
        ? h('p', { class: 'muted tiny' }, 'This one happens in the app when you post. Use “Add as intro” for the text and sound, then post with Stitch or the reply tool.')
        : null,
      h('div', { class: 'row' }, clips.length ? pick : null, button('Add as intro', add, { iconName: 'plus', variant: 'sm primary' })),
    );
  };
  return h(
    'div',
    {},
    h('p', { class: 'muted small' }, 'The first second decides the scroll. These openers are things you film, licensed stock, or the apps’ own Stitch and reply tools. Reposting someone else’s fail or fight clip gets reels muted or taken down, so they aren’t here.'),
    kinds.map((k) => {
      const items = HOOK_OPENERS.filter((x) => x.kind === k);
      return items.length ? h('div', {}, h('h4', { class: 'hook-kind' }, HOOK_KINDS[k]), h('div', { class: 'hook-grid' }, items.map(card))) : null;
    }),
    h('div', { class: 'sources tiny' }, 'Sources: ', HOOK_SOURCES.map((s, i) => [i ? ' · ' : '', h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.label)])),
  );
}
