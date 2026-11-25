// Export tab: "Song sections". The sections you marked on the song in the Manager (intro, verse,
// chorus…) exported in one go, three ways:
//  - cut: that part of this edit, exactly as you edited it (clips, text, lyrics, effects);
//  - promo: a short of each section with your look, clips and end card (like Batch export);
//  - mv: each section cut from the song's music video, picture and sound in sync.
import { h, icon, button, toast } from './dom.js';
import { media, ensureLayerAnalyses } from './media.js';
import { exportVideo, pickMimeType } from './engine.js';
import { applyBatchItem, mvClip, zipStore } from './batch.js';
import { sectionSpans, sectionOnTimeline, fmtTime, sectionSlug } from './manager/releases.js';

const state = { running: false, done: 0, total: 0, current: '', result: null, error: '', cancel: false, picked: null, how: 'cut', songId: '' };
const slug = (s) => String(s || 'promo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'promo';

/** The Manager song this edit is for: the one it was made from, else the one whose file it uses. */
export function editSong(project, manager) {
  if (!manager) return null;
  const byId = project.managerSongId && manager.songById(project.managerSongId);
  if (byId) return byId;
  return (project.song && manager.songsWithAudio(project.song.mediaId)[0]) || null;
}

export function sectionsExport({ store, engine, manager, render, seekPlay }) {
  const p = store.get();
  const found = editSong(p, manager);
  if (!found || !found.song.sections || !found.song.sections.length) {
    return h('div', { class: 'sect sec-export' }, h('h3', {}, 'Song sections'), h('p', { class: 'muted small' }, found ? `Mark “${found.song.title}”’s intro, verses and choruses (Manager → the song → Sections) to export any of them here in one go.` : 'Open a song from the Manager (Make a promo) and mark its sections there to export them here in one go.'));
  }
  const song = found.song;
  const audio = song.audioId && media.get(song.audioId);
  const spans = sectionSpans(song.sections, (audio && Number.isFinite(audio.duration) && audio.duration) || (p.song && p.song.duration) || 0).filter((s) => s.end != null);
  if (state.songId !== song.id || !state.picked) {
    state.songId = song.id;
    state.picked = new Set(spans.map((s) => s.id));
  }
  const offset = p.song ? p.song.offset || 0 : 0;
  const mvRef = song.files && song.files.video;
  const mv = mvRef && media.get(mvRef.mediaId);
  if (state.how === 'mv' && !mv) state.how = 'cut';
  const inEdit = (s) => sectionOnTimeline(s, p.song || offset, p.duration);
  // the picture part of the edit (before its end card): a promo of a section that sits there is cut from there
  const picEnd = p.endCard.enabled ? Math.max(0, p.duration - p.endCard.duration) : p.duration;
  const inPicture = (s) => {
    const r = sectionOnTimeline(s, p.song || offset, picEnd);
    return r && r.to - r.from >= s.end - s.start - 0.05 ? r : null;
  };
  const mp4 = pickMimeType('mp4');
  const fmt = mp4 && mp4.startsWith('video/mp4') ? 'mp4' : 'webm';
  const chosen = spans.filter((s) => state.picked.has(s.id) && (state.how !== 'cut' || inEdit(s)));

  const how = h('select', { 'aria-label': 'How to export the sections' }, h('option', { value: 'cut', selected: state.how === 'cut' }, 'Cut from this edit, as you edited it'), h('option', { value: 'promo', selected: state.how === 'promo' }, 'A promo of each: the section, your look and end card'), mv ? h('option', { value: 'mv', selected: state.how === 'mv' }, `From the music video, in sync (${mv.name})`) : null);
  how.addEventListener('change', () => ((state.how = how.value), render()));

  const run = async () => {
    if (!chosen.length) return toast(state.how === 'cut' ? 'None of the ticked sections are in this edit.' : 'Tick at least one section.', 'error');
    if (state.how !== 'cut' && !p.song) return toast('Choose the song in the Audio tab first.', 'error');
    const snap = JSON.stringify(store.get());
    Object.assign(state, { running: true, done: 0, total: chosen.length, result: null, error: '', cancel: false });
    render();
    const files = [];
    try {
      for (const sec of chosen) {
        if (state.cancel) break;
        state.current = sec.label;
        render();
        let res;
        if (state.how === 'cut') {
          const r = inEdit(sec);
          await ensureLayerAnalyses(store.get());
          res = await exportVideo(engine, { format: fmt, fps: 30, bitrate: 10e6, start: r.from, end: r.to });
        } else {
          const len = +(sec.end - sec.start).toFixed(2);
          const useMv = state.how === 'mv' && mv;
          const r = inPicture(sec);
          const mvIn = useMv && r ? +(sec.start + (mvRef.offset || 0) - r.from).toFixed(3) : 0;
          let range = {};
          if (r && mvIn >= 0) {
            // the section's own place in the edit (clips, texts, layers, keyframes, items turned off there), then
            // the end card straight after it: the same export range as a cut, with the edit ending at the section
            store.update((d) => {
              if (useMv) d.clips = [mvClip(mv.id, mvIn, Math.min(r.to, Math.max(0.5, mv.duration - mvIn)), d.song ? 0 : 1)];
              d.duration = +(r.to + (d.endCard.enabled ? d.endCard.duration : 0)).toFixed(3);
            }, 'sections');
            range = { start: r.from, end: store.get().duration };
          } else {
            // a section this edit doesn't hold: a short of it from the start of the edit, as Batch export makes
            store.update((d) => applyBatchItem(d, { songOffset: sec.start, mvIn: useMv ? Math.max(0, sec.start + (mvRef.offset || 0)) : null }, { len, mvId: useMv ? mv.id : null, mvDuration: useMv ? mv.duration : 0 }), 'sections');
          }
          await ensureLayerAnalyses(store.get());
          res = await exportVideo(engine, { format: fmt, fps: 30, bitrate: 10e6, ...range });
          store.update((d) => {
            const back = JSON.parse(snap);
            for (const k of Object.keys(d)) delete d[k];
            Object.assign(d, back);
          }, 'sections');
        }
        const ext = res.mime.includes('mp4') ? 'mp4' : 'webm';
        files.push({ name: `${slug(song.title)}-${sectionSlug(sec, spans.indexOf(sec))}.${ext}`, blob: res.blob }); // numbered by its place in the song
        state.done++;
        render();
      }
      if (files.length === 1) state.result = { url: URL.createObjectURL(files[0].blob), name: files[0].name, count: 1, size: files[0].blob.size };
      else if (files.length) {
        const zip = new Blob([zipStore(await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.blob.arrayBuffer()) }))))], { type: 'application/zip' });
        state.result = { url: URL.createObjectURL(zip), name: `${slug(song.title)}-sections.zip`, count: files.length, size: zip.size };
      }
      state.files = files;
    } catch (e) {
      state.error = e.message === 'cancelled' ? '' : e.message || 'Export failed';
    } finally {
      const back = JSON.parse(snap);
      store.update((d) => {
        for (const k of Object.keys(d)) delete d[k];
        Object.assign(d, back);
      }, 'sections');
      state.running = false;
      state.current = '';
      render();
    }
  };

  const rows = spans.map((s) => {
    const r = inEdit(s);
    const usable = state.how !== 'cut' || r;
    const box = h('input', { type: 'checkbox', checked: state.picked.has(s.id) && usable, disabled: !usable || state.running, 'aria-label': `Export ${s.label}` });
    box.addEventListener('change', () => (box.checked ? state.picked.add(s.id) : state.picked.delete(s.id), render()));
    return h(
      'li',
      { class: usable ? '' : 'off' },
      h('label', { class: 'sec-row' }, box, h('strong', {}, s.label), h('span', { class: 'muted tiny' }, `${fmtTime(s.start)}–${fmtTime(s.end)} · ${fmtTime(s.length)}`)),
      state.how === 'cut' ? (r ? button('Play', () => seekPlay(r.from, r.to), { iconName: 'play', variant: 'sm ghost', title: `Play ${s.label} in the preview` }) : h('span', { class: 'muted tiny' }, 'not in this edit')) : null,
    );
  });
  const secs = chosen.reduce((a, s) => a + (s.end - s.start) + (state.how === 'cut' ? 0 : p.endCard.enabled ? p.endCard.duration : 0) + 1, 0);
  return h(
    'div',
    { class: 'sect sec-export' },
    h('h3', {}, `Song sections · ${song.title}`),
    h('p', { class: 'muted small' }, state.how === 'cut' ? `This edit plays the song from ${fmtTime(offset)}; each section is cut from the edit as it is.` : state.how === 'mv' ? `Each section is cut from the music video${mvRef.offset ? ` (the song starts there at ${fmtTime(mvRef.offset)})` : ''}, with your look, text and end card.` : 'Each section becomes its own short with your clips, look, text and end card.'),
    how,
    h('ul', { class: 'sec-list' }, rows),
    h('div', { class: 'row' }, button('All', () => (spans.forEach((s) => state.picked.add(s.id)), render()), { variant: 'sm ghost' }), button('None', () => (state.picked.clear(), render()), { variant: 'sm ghost' }), h('span', { class: 'muted tiny' }, chosen.length ? `About ${Math.max(1, Math.ceil(secs / 60))} min to record; keep this tab in front.` : '')),
    state.running
      ? h('div', {}, h('div', { class: 'export-progress' }, h('div', { style: { width: `${Math.round((state.done / Math.max(1, state.total)) * 100)}%` } })), h('div', { class: 'row' }, h('span', { class: 'small' }, `${state.done + 1} of ${state.total}: ${state.current}`), button('Stop', () => ((state.cancel = true), exportVideo.cancel && exportVideo.cancel()), { variant: 'ghost sm' })))
      : button(chosen.length > 1 ? `Export ${chosen.length} sections (.zip)` : chosen.length ? `Export ${chosen[0].label}` : 'Export sections', run, { iconName: 'download', variant: 'primary wide', disabled: !chosen.length }),
    state.error ? h('p', { class: 'error-text' }, state.error) : null,
    state.result ? h('a', { class: 'btn wide', href: state.result.url, download: state.result.name }, icon('download', 16), h('span', {}, `Download ${state.result.name} (${(state.result.size / 1e6).toFixed(1)} MB${state.result.count > 1 ? `, ${state.result.count} videos` : ''})`)) : null,
  );
}
export const sectionsState = state;
