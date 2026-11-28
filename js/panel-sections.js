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
import { realtimeNote } from './exportplan.js';
import { writeBlob } from './streamsink.js';
import { desktop } from './desktop.js';
import { loadSettings } from './state.js';
import { sectionTextOf, setSectionText, textForSection, addSectionText, rememberedSectionText, rememberSectionText, ST_POSITIONS, ST_STYLES, ST_TOKENS } from './sectiontext.js';

// notes: [{ label, text }] sections recorded in real time and why; saved: { folder, files: [{ name, path, bytes, reveal }] } (Mac app)
const state = { running: false, done: 0, total: 0, current: '', result: null, error: '', cancel: false, picked: null, how: 'cut', songId: '', notes: [], saved: null };
const slug = (s) => String(s || 'promo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'promo';

/** The Manager song this edit is for: the one it was made from, else the one whose file it uses. */
export function editSong(project, manager) {
  if (!manager) return null;
  const byId = project.managerSongId && manager.songById(project.managerSongId);
  if (byId) return byId;
  return (project.song && manager.songsWithAudio(project.song.mediaId)[0]) || null;
}

export function sectionsExport({ store, engine, manager, render, seekPlay, b = null }) {
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
  // Mac app, fast MP4: every section is written straight into one folder picked once (the web keeps the download)
  const toFolder = !!(desktop && desktop.files && desktop.files.pickFolder) && fmt === 'mp4' && engine.exportMode !== 'realtime';

  const how = h('select', { 'aria-label': 'How to export the sections' }, h('option', { value: 'cut', selected: state.how === 'cut' }, 'Cut from this edit, as you edited it'), h('option', { value: 'promo', selected: state.how === 'promo' }, 'A promo of each: the section, your look and end card'), mv ? h('option', { value: 'mv', selected: state.how === 'mv' }, `From the music video, in sync (${mv.name})`) : null);
  how.addEventListener('change', () => ((state.how = how.value), render()));

  const run = async () => {
    if (!chosen.length) return toast(state.how === 'cut' ? 'None of the ticked sections are in this edit.' : 'Tick at least one section.', 'error');
    if (state.how !== 'cut' && !p.song) return toast('Choose the song in the Audio tab first.', 'error');
    let folder = null;
    if (toFolder) {
      try {
        folder = await desktop.files.pickFolder(); // the native folder dialog, once for all the sections
      } catch (e) {
        return toast(e.message || 'That folder cannot be used', 'error');
      }
      if (!folder) return; // cancelled
    }
    const snap = JSON.stringify(store.get());
    const textCfg = sectionTextOf(store.get(), song.id, rememberedSectionText(song.id));
    Object.assign(state, { running: true, done: 0, total: chosen.length, result: null, error: '', cancel: false, notes: [], saved: folder ? { folder: { name: folder.name, path: folder.path }, files: [] } : null });
    render();
    const files = [];
    const stream = folder ? { saveAs: '', folder, codec: loadSettings().exportCodec === 'hevc' ? 'hevc' : 'h264' } : {}; // the main export's codec choice
    try {
      for (const sec of chosen) {
        if (state.cancel) break;
        state.current = sec.label;
        render();
        const name = `${slug(song.title)}-${sectionSlug(sec, spans.indexOf(sec))}`; // numbered by its place in the song
        const opts = { format: fmt, fps: 30, bitrate: 10e6, ...(folder ? { ...stream, saveAs: `${name}.mp4` } : {}), onFallback: (why) => (state.notes.push({ label: sec.label, text: realtimeNote(why) }), render()) };
        let res;
        // the section's on-screen text, timed from where the section starts in the exported file (none: unchanged)
        const words = (d, from, to) => addSectionText(d, textCfg, { sectionId: sec.id, from, to, song: song.title, section: sec.label, artist: d.endCard.artist || '' });
        const hasWords = !!textForSection(textCfg, sec.id);
        if (state.how === 'cut') {
          const r = inEdit(sec);
          if (hasWords) store.patch((d) => words(d, r.from, r.to));
          await ensureLayerAnalyses(store.get());
          try {
            res = await exportVideo(engine, { ...opts, start: r.from, end: r.to });
          } finally {
            if (hasWords) store.patch((d) => {
              const back = JSON.parse(snap);
              for (const k of Object.keys(d)) delete d[k];
              Object.assign(d, back);
            });
          }
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
              words(d, r.from, r.to);
            }, 'sections');
            range = { start: r.from, end: store.get().duration };
          } else {
            // a section this edit doesn't hold: a short of it from the start of the edit, as Batch export makes
            store.update((d) => {
              applyBatchItem(d, { songOffset: sec.start, mvIn: useMv ? Math.max(0, sec.start + (mvRef.offset || 0)) : null }, { len, mvId: useMv ? mv.id : null, mvDuration: useMv ? mv.duration : 0 });
              words(d, 0, len);
            }, 'sections');
          }
          await ensureLayerAnalyses(store.get());
          res = await exportVideo(engine, { ...opts, ...range });
          store.update((d) => {
            const back = JSON.parse(snap);
            for (const k of Object.keys(d)) delete d[k];
            Object.assign(d, back);
          }, 'sections');
        }
        const ext = res.mime.includes('mp4') ? 'mp4' : 'webm';
        if (res.saved) state.saved.files.push(res.saved);
        // recorded in real time instead: an MP4 goes into the same folder, anything else into the download
        else if (folder && ext === 'mp4') {
          const sink = await folder.saveStream({ name: `${name}.mp4`, ext: 'mp4' });
          state.saved.files.push(await writeBlob(sink, res.blob));
        } else files.push({ name: `${name}.${ext}`, blob: res.blob });
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
      state.error = e.message === 'cancelled' ? '' : e.message || 'Export failed'; // a partial file was already deleted
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
  const textBlock = b ? onScreenText(b, song, spans) : null;
  const secs = chosen.reduce((a, s) => a + (s.end - s.start) + (state.how === 'cut' ? 0 : p.endCard.enabled ? p.endCard.duration : 0) + 1, 0);
  return h(
    'div',
    { class: 'sect sec-export' },
    h('h3', {}, `Song sections · ${song.title}`),
    h('p', { class: 'muted small' }, state.how === 'cut' ? `This edit plays the song from ${fmtTime(offset)}; each section is cut from the edit as it is.` : state.how === 'mv' ? `Each section is cut from the music video${mvRef.offset ? ` (the song starts there at ${fmtTime(mvRef.offset)})` : ''}, with your look, text and end card.` : 'Each section becomes its own short with your clips, look, text and end card.'),
    how,
    h('ul', { class: 'sec-list' }, rows),
    textBlock,
    h('div', { class: 'row' }, button('All', () => (spans.forEach((s) => state.picked.add(s.id)), render()), { variant: 'sm ghost' }), button('None', () => (state.picked.clear(), render()), { variant: 'sm ghost' }), h('span', { class: 'muted tiny' }, chosen.length ? `About ${Math.max(1, Math.ceil(secs / 60))} min to record; keep this tab in front.` : '')),
    state.running
      ? h('div', {}, h('div', { class: 'export-progress' }, h('div', { style: { width: `${Math.round((state.done / Math.max(1, state.total)) * 100)}%` } })), h('div', { class: 'row' }, h('span', { class: 'small' }, `${state.done + 1} of ${state.total}: ${state.current}`), button('Stop', () => ((state.cancel = true), exportVideo.cancel && exportVideo.cancel()), { variant: 'ghost sm' })))
      : button(chosen.length > 1 ? `Export ${chosen.length} sections${toFolder ? ' to a folder' : ' (.zip)'}` : chosen.length ? `Export ${chosen[0].label}${toFolder ? ' to a folder' : ''}` : 'Export sections', run, { iconName: 'download', variant: 'primary wide', disabled: !chosen.length }),
    toFolder && !state.running && !state.saved ? h('p', { class: 'muted tiny' }, 'Asks once for a folder, then writes each section there as it is made.') : null,
    // why a section was not fast, as it happens and in the summary (the same reasons as the main export)
    state.notes.length
      ? h('div', { class: 'warn-list small', role: 'status', 'data-testid': 'sections-realtime' },
          h('p', {}, state.running ? `${state.notes[state.notes.length - 1].label}: ${state.notes[state.notes.length - 1].text} Keep this tab in front.` : `${state.notes.length === 1 ? '1 section was' : `${state.notes.length} sections were`} recorded in real time:`),
          state.running ? null : h('ul', {}, state.notes.map((n) => h('li', {}, h('strong', {}, `${n.label}: `), n.text))))
      : null,
    state.error ? h('p', { class: 'error-text' }, state.error) : null,
    !state.running && state.saved && state.saved.files.length
      ? h('div', { 'data-testid': 'sections-saved' },
          h('p', { class: 'small' }, `Saved ${state.saved.files.length === 1 ? '1 video' : `${state.saved.files.length} videos`} to ${state.saved.folder.path}:`),
          h('ul', { class: 'muted tiny' }, state.saved.files.map((f) => h('li', {}, `${f.name} (${f.bytes < 1e5 ? `${Math.max(1, Math.round(f.bytes / 1e3))} KB` : `${(f.bytes / 1e6).toFixed(1)} MB`})`))),
          state.saved.files[0].reveal ? button('Show in Finder', () => state.saved.files[0].reveal(), { variant: 'sm' }) : null)
      : null,
    state.result ? h('a', { class: 'btn wide', href: state.result.url, download: state.result.name }, icon('download', 16), h('span', {}, `Download ${state.result.name} (${(state.result.size / 1e6).toFixed(1)} MB${state.result.count > 1 ? `, ${state.result.count} videos` : ''})`)) : null,
  );
}
export const sectionsState = state;

/**
 * "On-screen text" for the exported sections: one text for every file (with tokens), where and how it shows, and a
 * per-section own text or none. Saved in the edit for this song (one undo step per change) and remembered for it.
 */
function onScreenText(b, song, spans) {
  const mem = () => rememberedSectionText(song.id);
  const cfg = (p) => sectionTextOf(p, song.id, mem());
  const set = (fn) => (d, v) => rememberSectionText(song.id, setSectionText(d, song.id, (c) => fn(c, v), mem()));
  const shown = (el, on) => b._reg((p) => (el.hidden = !on(cfg(p))));
  const seconds = b.number('Seconds', (p) => cfg(p).length || 3, set((c, v) => (c.length = Math.max(0.5, v))), { min: 0.5, max: 600, step: 0.5 });
  shown(seconds, (c) => c.length > 0);
  const boxColor = b.color('Box colour', (p) => cfg(p).boxColor, set((c, v) => (c.boxColor = v)));
  shown(boxColor, (c) => c.style !== 'outline');
  const per = spans.map((s) => {
    const mode = b.select(s.label, (p) => (cfg(p).sections[s.id] || { mode: 'same' }).mode, set((c, v) => {
      if (v === 'same') delete c.sections[s.id];
      else c.sections[s.id] = { mode: v, text: (c.sections[s.id] && c.sections[s.id].text) || c.text };
    }), [['same', 'Same text'], ['own', 'Its own text'], ['none', 'No text']]);
    const own = b.text('', (p) => (cfg(p).sections[s.id] || {}).text || '', set((c, v) => (c.sections[s.id] = { mode: 'own', text: v })), { placeholder: `Text for ${s.label}`, key: `sectiontext:own:${s.id}` });
    own.setAttribute('aria-label', `On-screen text for ${s.label}`);
    shown(own, (c) => (c.sections[s.id] || {}).mode === 'own');
    return h('li', { 'data-section': s.id }, mode, own);
  });
  const none = h('p', { class: 'muted tiny' }, 'No text yet: the sections export as they are.');
  shown(none, (c) => !c.text.trim() && !Object.values(c.sections).some((o) => o.mode === 'own' && o.text.trim()));
  const text = b.text('Text on every section', (p) => cfg(p).text, set((c, v) => (c.text = v)), { placeholder: 'e.g. {song} · OUT {date}', key: 'sectiontext:text' });
  return h(
    'div',
    { class: 'sec-text', 'data-testid': 'section-text' },
    h('h4', {}, 'On-screen text'),
    text,
    h('p', { class: 'muted tiny' }, `${ST_TOKENS} are filled in for each file. The date is the end card’s release date.`),
    none,
    b.segmented('Position', (p) => cfg(p).pos, set((c, v) => (c.pos = v)), ST_POSITIONS.map(([k, l]) => [k, l])),
    h('div', { class: 'grid2' },
      b.select('Style', (p) => cfg(p).style, set((c, v) => {
        const look = ST_STYLES.find(([k]) => k === v);
        c.style = v;
        if (look) Object.assign(c, { color: look[2].color, boxColor: look[2].boxColor });
      }), ST_STYLES.map(([k, l]) => [k, l])),
      b.range('Size', (p) => cfg(p).size, set((c, v) => (c.size = v)), { min: 3, max: 18, step: 0.5, fmt: (v) => Number(v).toFixed(1), key: 'sectiontext:size' })),
    h('div', { class: 'grid2' }, b.color('Text colour', (p) => cfg(p).color, set((c, v) => (c.color = v))), boxColor),
    h('div', { class: 'grid2' },
      b.number('Starts after (s)', (p) => cfg(p).start, set((c, v) => (c.start = v)), { min: 0, max: 600, step: 0.5 }),
      b.select('Shows for', (p) => (cfg(p).length > 0 ? 'first' : 'whole'), set((c, v) => (c.length = v === 'first' ? c.length || 3 : 0)), [['whole', 'The whole section'], ['first', 'The first seconds']])),
    seconds,
    h('div', { class: 'row' }, b.toggle('Fade in', (p) => cfg(p).fadeIn, set((c, v) => (c.fadeIn = v))), b.toggle('Fade out', (p) => cfg(p).fadeOut, set((c, v) => (c.fadeOut = v)))),
    h('p', { class: 'muted tiny' }, 'Each section can have its own text, or none:'),
    h('ul', { class: 'sec-text-list' }, per),
  );
}
