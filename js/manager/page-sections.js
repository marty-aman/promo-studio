// A song's Sections tab: the intro, verses, choruses… with their timestamps, typed one by one or
// pasted as a list ("0:00 Intro", "0:42 Chorus"). The Video Studio exports any of them in one go.
import { h, button, iconButton, toast } from '../dom.js';
import { SECTION_NAMES, newSection, parseTime, fmtTime, parseSections, sectionSpans, numberRepeats, normalizeSections } from './releases.js';

export const sectionsUI = { paste: '' };

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
  const timeIn = (sec, k) => {
    const el = h('input', { type: 'text', value: sec[k] == null ? '' : fmtTime(sec[k]), placeholder: k === 'end' ? 'next one' : '0:00', 'data-k': `sec-${k}-${sec.id}`, 'aria-label': `${sec.label} ${k === 'start' ? 'starts' : 'ends'}`, class: 'mgr-time' });
    el.addEventListener('change', () => {
      const t = parseTime(el.value);
      if (el.value.trim() && t == null) return toast('Type a time like 1:05 or 65.', 'error');
      ctx.update(Sec(sec.id, (x) => (x[k] = el.value.trim() ? t : k === 'end' ? null : 0)));
    });
    return el;
  };
  const names = h('datalist', { id: 'mgr-section-names' }, SECTION_NAMES.map((n) => h('option', { value: n })));
  const rows = spans.map((sec) =>
    h(
      'tr',
      {},
      h('td', {}, ctx.form.text(`sec-l-${sec.id}`, '', sec.label, Sec(sec.id, (x, v) => (x.label = v.trim() || 'Section')), { list: 'mgr-section-names' })),
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
        const el = h('input', { type: 'text', value: fmtTime(v.offset || 0), class: 'mgr-time', 'data-k': `sec-voff-${song.id}`, 'aria-label': 'Where the song starts in the music video' });
        el.addEventListener('change', () => {
          const t = parseTime(el.value);
          if (t == null) return toast('Type a time like 0:08.', 'error');
          ctx.update(S((s) => (s.files.video.offset = t)));
        });
        return el;
      })()
    : null;
  return h(
    'div',
    { class: 'mgr-cols' },
    h(
      'section',
      { class: 'mgr-sect' },
      names,
      h('h2', {}, `Sections · ${spans.length}`),
      h('p', { class: 'muted small' }, `Times are in the song${dur ? ` (${fmtTime(dur)} long)` : ''}. Leave an end blank and it runs to the next section.`),
      spans.length ? h('table', { class: 'mgr-table mgr-sections' }, h('thead', {}, h('tr', {}, ['Section', 'Starts', 'Ends', 'Length', ''].map((x) => h('th', {}, x)))), h('tbody', {}, rows)) : h('p', { class: 'muted small' }, 'No sections yet. Add them one by one, or paste a list on the right.'),
      h('div', { class: 'row' }, button('Add a section', add, { iconName: 'plus', variant: 'sm' }), spans.length ? button('Export sections in the Video Studio', () => ctx.studio.openSections(song), { iconName: 'film', variant: 'sm primary', title: 'Opens this song in the editor and its Export tab, where you pick which sections to export' }) : null),
      v
        ? h('div', { class: 'mgr-two' }, h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'The song starts in the music video at'), offIn, h('span', { class: 'mf-h' }, `For ${vInfo ? vInfo.name : 'the music video'}: if it opens with a scene before the song, put where the song’s 0:00 is.`)))
        : null,
    ),
    h(
      'section',
      { class: 'mgr-sect' },
      h('h2', {}, 'Paste timestamps'),
      h('p', { class: 'muted small' }, 'One per line, like a YouTube description: “0:42 Chorus”, “Chorus 0:42–1:10” or “[1:10] Bridge”.'),
      paste,
      h('div', { class: 'row' }, button('Use these', () => usePaste(true), { variant: 'sm primary', title: 'Replace the sections with this list' }), spans.length ? button('Add to mine', () => usePaste(false), { variant: 'sm ghost' }) : null),
    ),
  );
}
