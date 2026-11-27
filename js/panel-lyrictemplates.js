// The lyric-video song templates' extras on their cards (Start > Templates and themes > From your song's files): the
// look picker (Hellfire or Neon, Funeral Doom or Frostbite) and, for Glow Slam with no saved word times, a button to
// the Lyrics tab's Auto-sync. Plus the Section looks switch under "Part of the song". The logic is in
// songtemplates.js and songpart.js (unit tested); this file only builds the controls.
import { h, button } from './dom.js';
import { sectionLooksState, setSectionLooks } from './songpart.js';

/** The look picked on each card (template id -> look id), for this session. */
export const lyricTplUI = {};

/** The options a card adds to its template's ctx and Apply: { look } for templates with looks. */
export const lyricTplOpts = (tpl) => (tpl.looks ? { look: lyricTplUI[tpl.id] || tpl.looks[0][0] } : {});

/** The look select and the Auto-sync button for a lyric template's card (null for other templates). */
export function lyricCardExtras(tpl, ready, ui) {
  if (!tpl.lyric || !ready.ok) return null;
  const out = [];
  if (tpl.looks) {
    const cur = lyricTplOpts(tpl).look;
    const sel = h('select', { 'aria-label': `${tpl.name} look`, 'data-k': `songtpl-look-${tpl.id}` }, tpl.looks.map(([id, name]) => h('option', { value: id, selected: id === cur }, `Look: ${name}`)));
    sel.addEventListener('change', () => ((lyricTplUI[tpl.id] = sel.value), ui.refreshPanels(true)));
    out.push(sel);
  }
  if (ready.autosync) {
    const b = button('Auto-sync the words first', () => {
      ui.openTab('lyrics');
      // the Auto-sync lyrics box on the Lyrics tab
      requestAnimationFrame(() => document.querySelector('.ai-sync')?.scrollIntoView({ block: 'center' }));
    }, { variant: 'sm ghost', iconName: 'wand', title: 'Opens the Lyrics tab: Auto-sync lyrics times every word, so each word lands on its beat' });
    b.dataset.k = `songtpl-autosync-${tpl.id}`;
    out.push(b);
  }
  return out.length ? h('div', { class: 'row wrap' }, out) : null;
}

/**
 * The Section looks switch: each lyric line in the part of the song takes its section's look (intro and outro
 * whisper, verses clean, choruses scream, the breakdown its own). One undo step; off puts the shared style back.
 * deps: { store, ctx: () => song template ctx, choice: () => the picked part (or null), refresh }
 */
export function sectionLooksSwitch({ store, ctx, choice, refresh }) {
  const c = ctx();
  if (!c || !c.song) return null;
  const st = sectionLooksState(store.get(), choice(), c);
  const box = h('input', { type: 'checkbox', checked: st.on, disabled: !st.count && !st.on, 'data-k': 'section-looks' });
  box.addEventListener('change', () => {
    let n = 0;
    store.update((d) => (n = setSectionLooks(d, box.checked, choice(), ctx())));
    refresh();
    return n;
  });
  const hint = !st.sections
    ? 'Needs the song’s sections: detect them on its Sections tab.'
    : !st.count
      ? 'No lyric lines in this part sit in an intro, verse, chorus, breakdown or outro.'
      : `${st.count} line${st.count === 1 ? '' : 's'} in this part: intro and outro whisper, verses clean, choruses scream, the breakdown its own. Undo (Ctrl+Z) to go back.`;
  return h('div', { class: 'section-looks' }, h('label', { class: 'row' }, box, h('strong', {}, 'Section looks: each line takes its section’s look')), h('p', { class: 'muted tiny' }, hint));
}
