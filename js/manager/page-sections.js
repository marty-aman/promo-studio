// A song's Sections tab: the intro, verses, choruses… with their timestamps, typed one by one or
// pasted as a list ("0:00 Intro", "0:42 Chorus"). The Video Studio exports any of them in one go.
import { h, button, iconButton, toast } from '../dom.js';
import { SECTION_NAMES, newSection, fmtTime, parseSections, sectionSpans, numberRepeats, normalizeSections } from './releases.js';
import { lyricsFromTiming } from './lyrictiming.js';
import { setVideoSync } from '../songsync.js';
import { decodeMono, detectSections, proposalAgainst } from '../sectiondetect.js';
import { timeField, timeFormatSwitch, showTime } from '../timefield.js';

export const sectionsUI = { paste: '' };

// "Detect sections from the audio": one run at a time; its result waits here as a proposal until you accept or
// dismiss it (nothing is written to the song until then). bar/label: the progress elements on screen now.
export const detectUI = { songId: '', running: false, progress: 0, ac: null, result: null, error: '', auto: '', bar: null, label: null };

/** Open a song's Sections tab and start detecting there (the Video Studio's Chorus promo asks for this). */
export const requestDetect = (songId) => (detectUI.auto = songId);

async function runDetect(ctx, song) {
  const blob = song.audioId ? await ctx.studio.mediaBlob(song.audioId) : null; // read from storage when not open
  if (!blob) return toast('Add the song file on its Overview tab first.', 'error');
  if (detectUI.ac) detectUI.ac.abort();
  const ac = new AbortController();
  Object.assign(detectUI, { songId: song.id, running: true, progress: 0, ac, result: null, error: '' });
  ctx.refresh();
  const show = (x, what) => {
    detectUI.progress = x;
    if (detectUI.bar) detectUI.bar.value = Math.round(x * 100);
    if (detectUI.label && what) detectUI.label.textContent = what;
  };
  try {
    show(0, 'Reading the song file…');
    const { mono, sampleRate } = await decodeMono(blob);
    if (ac.signal.aborted) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
    show(0.02, 'Listening for where the music changes…');
    const lines = song.lyricTiming ? lyricsFromTiming(song.lyricTiming, () => '') : [];
    const r = await detectSections(mono, sampleRate, { lines, signal: ac.signal, onProgress: (x) => show(0.02 + 0.98 * x, x > 0.6 ? 'Comparing the parts…' : null) });
    if (detectUI.ac !== ac) return;
    r.sections = numberRepeats(r.sections);
    r.usedLyrics = lines.length > 0;
    Object.assign(detectUI, { running: false, ac: null, result: r });
    if (!r.sections.length) toast(r.note, 'error', 6000);
  } catch (e) {
    if (detectUI.ac !== ac) return;
    Object.assign(detectUI, { running: false, ac: null, result: null, error: e.name === 'AbortError' ? '' : `Couldn’t read the song file: ${e.message}` });
    if (e.name === 'AbortError') toast('Stopped detecting sections.');
  }
  ctx.refresh();
}

/** The detect button, its progress and cancel, and the proposal with Accept all / Accept / Dismiss. */
function detectBox(ctx, song, S, dur) {
  const mine = detectUI.songId === song.id;
  if (detectUI.auto === song.id) {
    detectUI.auto = '';
    if (!(mine && detectUI.running) && song.audioId) queueMicrotask(() => runDetect(ctx, song));
  }
  const hasAudio = !!(song.audioId && (ctx.studio.hasMedia ? ctx.studio.hasMedia(song.audioId) : ctx.studio.mediaBlob(song.audioId)));
  const kids = [
    h('h2', {}, 'Detect from the audio'),
    h('p', { class: 'muted small' }, `Listens to the song file in this browser (nothing is uploaded) and proposes where the intro, verses, choruses and bridge are${song.lyricTiming ? ', using the saved lyric timing to place them' : ''}. Your own sections are never changed.`),
  ];
  if (mine && detectUI.running) {
    detectUI.bar = h('progress', { max: 100, value: Math.round(detectUI.progress * 100), 'aria-label': 'Detecting sections', 'data-k': 'sec-detect-progress' });
    detectUI.label = h('span', { class: 'muted small' }, 'Listening…');
    kids.push(h('div', { class: 'mgr-detect-run' }, detectUI.bar, detectUI.label, button('Cancel', () => detectUI.ac && detectUI.ac.abort(), { variant: 'sm ghost', iconName: 'x' })));
  } else {
    detectUI.bar = detectUI.label = null;
    kids.push(
      h('div', { class: 'row' }, button(mine && detectUI.result ? 'Detect again' : 'Detect sections from the audio', () => runDetect(ctx, song), { iconName: 'wand', variant: `sm${mine && detectUI.result ? ' ghost' : ' primary'}`, disabled: !hasAudio, title: hasAudio ? 'Takes a few seconds for a 4-minute song' : 'Add the song file on the Overview tab first' })),
    );
    if (!hasAudio) kids.push(h('p', { class: 'muted tiny' }, 'Add the song file on the Overview tab first.'));
  }
  if (mine && detectUI.error) kids.push(h('p', { class: 'warn-list' }, detectUI.error));
  const r = mine && !detectUI.running ? detectUI.result : null;
  if (r && r.sections.length) {
    const prop = proposalAgainst(song.sections, r.sections, dur || r.duration);
    const take = (list) => {
      const free = list.filter((x) => !x.clash);
      if (!free.length) return;
      ctx.update(S((s) => (s.sections = normalizeSections([...s.sections, ...free.map((x) => newSection(x.label, x.start, x.end))]))));
      const left = r.sections.filter((x) => !free.some((f) => f.start === x.start && f.label === x.label));
      detectUI.result = left.length && list.length === 1 ? { ...r, sections: left } : null;
      toast(`Added ${free.length} section${free.length === 1 ? '' : 's'}${prop.length - free.length && list.length > 1 ? `; ${prop.length - free.length} left out where you already have one` : ''}.`);
      ctx.refresh();
    };
    const free = prop.filter((x) => !x.clash).length;
    const conf = { good: 'Clear', fair: 'Fair', rough: 'Rough guess' }[r.confidence] || r.confidence;
    kids.push(
      h(
        'div',
        { class: 'mgr-detect-prop', 'data-k': 'sec-proposal' },
        h('p', { class: 'small' }, h('span', { class: `mgr-conf mgr-conf-${r.confidence}` }, conf), ` ${r.sections.length} section${r.sections.length === 1 ? '' : 's'} found${r.bpm ? ` · about ${Math.round(r.bpm)} BPM` : ''}.`),
        h('p', { class: 'muted tiny', 'data-k': 'sec-detect-note' }, r.note),
        h(
          'table',
          { class: 'mgr-table mgr-sections mgr-detect-table' },
          h('thead', {}, h('tr', {}, ['Section', 'From', 'To', ''].map((x) => h('th', {}, x)))),
          h(
            'tbody',
            {},
            prop.map((x) =>
              h(
                'tr',
                { class: x.clash ? 'muted' : '' },
                h('td', {}, x.label),
                h('td', { class: 'n' }, showTime(x.start)),
                h('td', { class: 'n' }, showTime(x.end)),
                h('td', {}, x.clash ? h('span', { class: 'tiny muted', title: 'You already have a section here; yours is kept' }, `You have “${x.clash}”`) : button('Accept', () => take([x]), { variant: 'sm ghost', title: `Add ${x.label} (${showTime(x.start)}–${showTime(x.end)}) to your sections` })),
              ),
            ),
          ),
        ),
        h('div', { class: 'row' }, button(free === prop.length ? 'Accept all' : `Accept the ${free} that don’t clash`, () => take(prop), { variant: 'sm primary', iconName: 'check', disabled: !free }), button('Dismiss', () => ((detectUI.result = null), ctx.refresh()), { variant: 'sm ghost' })),
      ),
    );
  }
  return h('section', { class: 'mgr-sect mgr-detect', 'data-k': 'sec-detect' }, ...kids);
}

export function sectionsTab(ctx, song, S) {
  const st = ctx.studio;
  const audio = song.audioId ? st.mediaInfo(song.audioId) : null;
  const dur = audio && audio.duration ? audio.duration : 0;
  const spans = sectionSpans(song.sections, dur);
  const Sec = (id, fn) => S((s, v) => {
    const x = s.sections.find((y) => y.id === id);
    if (x) fn(x, v);
    s.sections = normalizeSections(s.sections);
  });
  const timeIn = (sec, k) =>
    timeField({
      value: sec[k] == null ? null : sec[k],
      label: `${sec.label} ${k === 'start' ? 'starts' : 'ends'}`,
      dataK: `sec-${k}-${sec.id}`,
      placeholder: k === 'end' ? 'next one' : undefined,
      empty: k === 'end' ? null : 0,
      onCommit: (t, key) => ctx.update(Sec(sec.id, (x) => (x[k] = t)), key),
    });
  const names = h('datalist', { id: 'mgr-section-names' }, SECTION_NAMES.map((n) => h('option', { value: n })));
  const rows = spans.map((sec) =>
    h(
      'tr',
      {},
      h('td', {}, ctx.form.text(`sec-l-${sec.id}`, '', sec.label, Sec(sec.id, (x, v) => (x.label = v.trim() || 'Section')), { list: 'mgr-section-names', aria: 'Section name' })),
      h('td', {}, timeIn(sec, 'start')),
      h('td', {}, timeIn(song.sections.find((x) => x.id === sec.id) || sec, 'end')),
      h('td', { class: 'n muted' }, sec.length != null ? fmtTime(sec.length) : '?'),
      h('td', {}, iconButton('trash', `Remove ${sec.label}`, () => ctx.update(S((s) => (s.sections = s.sections.filter((x) => x.id !== sec.id)))), 'ghost')),
    ),
  );
  const add = () => {
    const last = spans[spans.length - 1];
    const start = last ? (last.end != null ? last.end : last.start + 15) : 0;
    ctx.update(S((s) => (s.sections = normalizeSections([...s.sections, newSection(SECTION_NAMES[Math.min(SECTION_NAMES.length - 1, s.sections.length ? 1 : 0)], start)]))));
  };
  const paste = h('textarea', { rows: 8, placeholder: '0:00 Intro\n0:12 Verse 1\n0:41 Chorus\n1:10 Verse 2\n1:52 Bridge\n2:20 Chorus\n2:55 Outro', 'data-k': `sec-paste-${song.id}`, 'aria-label': 'Paste timestamps' });
  paste.value = sectionsUI.paste;
  paste.addEventListener('input', () => (sectionsUI.paste = paste.value));
  const usePaste = (replace) => {
    const got = numberRepeats(parseSections(paste.value));
    if (!got.length) return toast('No times found. Put a time like 0:42 on each line.', 'error');
    ctx.update(S((s) => (s.sections = normalizeSections([...(replace ? [] : s.sections), ...got.map((g) => newSection(g.label, g.start, g.end))]))));
    sectionsUI.paste = '';
    toast(`${replace ? 'Set' : 'Added'} ${got.length} section${got.length === 1 ? '' : 's'}`);
  };
  const v = song.files && song.files.video;
  const vInfo = v ? st.mediaInfo(v.mediaId) : null;
  const offIn = v
    ? (() => {
        return timeField({ value: v.offset || 0, label: 'Where the song starts in the music video', dataK: `sec-voff-${song.id}`, onCommit: (t, key) => ctx.update(S((s) => setVideoSync(s, t)), key) });
      })()
    : null;
  return h(
    'div',
    { class: 'mgr-cols' },
    h(
      'section',
      { class: 'mgr-sect' },
      names,
      h('div', { class: 'mgr-sect-head' }, h('h2', {}, `Sections · ${spans.length}`), timeFormatSwitch(() => ctx.refresh())),
      h('p', { class: 'muted small' }, `Times are in the song${dur ? ` (${fmtTime(dur)} long)` : ''}. Leave an end blank and it runs to the next section.`),
      spans.length ? h('table', { class: 'mgr-table mgr-sections' }, h('thead', {}, h('tr', {}, ['Section', 'Starts', 'Ends', 'Length', ''].map((x) => h('th', {}, x)))), h('tbody', {}, rows)) : h('p', { class: 'muted small' }, 'No sections yet. Add them one by one, detect them from the audio, or paste a list.'),
      h('div', { class: 'row' }, button('Add a section', add, { iconName: 'plus', variant: 'sm' }), spans.length ? button('Export sections in the Video Studio', () => ctx.studio.openSections(song), { iconName: 'film', variant: 'sm primary', title: 'Opens this song in the editor and its Export tab, where you pick which sections to export' }) : null),
      v
        ? h('div', { class: 'mgr-two' }, h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'The song starts in the music video at'), offIn, h('span', { class: 'mf-h' }, `For ${vInfo ? vInfo.name : 'the music video'}: if it opens with a scene before the song, put where the song’s 0:00 is.`)))
        : null,
    ),
    h(
      'div',
      { class: 'mgr-stack' },
      detectBox(ctx, song, S, dur),
      h(
        'section',
        { class: 'mgr-sect' },
        h('h2', {}, 'Paste timestamps'),
        h('p', { class: 'muted small' }, 'One per line, like a YouTube description: “0:42 Chorus”, “Chorus 0:42–1:10” or “[1:10] Bridge”.'),
        paste,
        h('div', { class: 'row' }, button('Use these', () => usePaste(true), { variant: 'sm primary', title: 'Replace the sections with this list' }), spans.length ? button('Add to mine', () => usePaste(false), { variant: 'sm ghost' }) : null),
      ),
    ),
  );
}
