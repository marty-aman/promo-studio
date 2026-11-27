// A lyric line's key words and duet side (lyricanim.js), in the lyric line inspector. Key words: tap a word chip to
// make it bigger, in an accent colour, and optionally slam when it is sung. The pick is saved on the line
// (line.emph, word indexes plus the words), so editing the text marks it out of date, like word timing.
// Duet side: the line sits left, centre or right (line.style.side, a look field, so it reaches every line with this
// look). Each change is one store.update, so one Ctrl+Z undoes it. One line at a time display only.
import { h, button, toast } from './dom.js';
import { lineStyle, hasLineStyle } from './linestyle.js';
import { lookMembers, changeLook } from './lookapply.js';
import { SIDES, EMPH_SIZE, toggleEmph, emphStale, emphIndexes } from './lyricanim.js';

const words = (text) => String(text || '').split(/\s+/).filter(Boolean);

/** b: the inspector's Binder; store; lineId. Returns the block's element. */
export function lineAnimBlock(b, store, lineId) {
  const live = () => store.get().lyrics.find((x) => x.id === lineId);
  const onLine = (fn) => (d, v) => {
    const x = d.lyrics.find((y) => y.id === lineId);
    if (x) fn(x, v, d);
  };
  const setEmph = (x, e) => {
    if (e && (e.words.length || e.size || e.color || e.slam)) x.emph = e;
    else delete x.emph;
  };
  const emphField = (key, off) => onLine((x, v) => {
    const e = { words: [], ...(x.emph || {}) };
    if (v === off) delete e[key];
    else e[key] = v;
    setEmph(x, e);
  });

  // ---- key words: one chip per word, rebuilt when the words change
  const chipRow = h('div', { class: 'chips la-words', role: 'group', 'aria-label': 'Key words in this line' });
  const staleNote = h('p', { class: 'muted tiny la-stale', hidden: true }, 'The words changed since you picked the key words, so they are not shown. Tap a word to pick again.');
  let shown = '';
  b._reg((p) => {
    const l = p.lyrics.find((x) => x.id === lineId);
    if (!l) return;
    const set = emphIndexes(l) || new Set();
    const sig = `${l.text}|${[...set].join(',')}`;
    staleNote.hidden = !emphStale(l);
    if (sig === shown) return;
    shown = sig;
    chipRow.replaceChildren(
      ...words(l.text).map((w, i) => {
        const on = set.has(i);
        return h('button', {
          type: 'button',
          class: `btn chip${on ? ' on' : ''}`,
          'aria-pressed': on ? 'true' : 'false',
          dataset: { wi: String(i) },
          onclick: () => store.update(onLine((x) => setEmph(x, toggleEmph(x, i)))),
        }, w);
      }),
    );
  });
  const clear = button('Clear key words', () => {
    store.update(onLine((x) => delete x.emph));
    toast('No key words on this line');
  }, { variant: 'ghost sm' });
  clear.setAttribute('data-k', 'emph-clear');
  b._reg((p) => {
    const l = p.lyrics.find((x) => x.id === lineId);
    clear.disabled = !(l && l.emph);
  });
  const accent = () => {
    const p = store.get();
    const l = live();
    return (l && l.emph && l.emph.color) || lineStyle(p.lyricStyle, l || {}, p.theme).highlight;
  };

  // ---- duet side: on a shared-style line it gives just this line a look; on a look, every line of the look
  let drag = null;
  const groupIds = () => {
    const now = Date.now();
    if (!drag || now - drag.at > 700) drag = { ids: lookMembers(store.get().lyrics, lineId) };
    drag.at = now;
    return drag.ids;
  };
  const setSide = (d, v) => {
    const me = d.lyrics.find((y) => y.id === lineId);
    if (!me) return;
    changeLook(d, lineId, (s) => {
      const n = { ...(s || {}) };
      if (v === 'center') delete n.side;
      else n.side = v;
      return n;
    }, hasLineStyle(me) ? { ids: groupIds() } : { only: true });
  };
  const sideOf = (p) => {
    const l = p.lyrics.find((x) => x.id === lineId);
    return (l && lineStyle(p.lyricStyle, l, p.theme).side) || 'center';
  };
  const voice2 = button('Second voice colours', () => {
    store.update((d) => {
      const me = d.lyrics.find((y) => y.id === lineId);
      if (me) changeLook(d, lineId, (s) => ({ ...(s || {}), color: d.lyricStyle.highlight, highlight: d.lyricStyle.color }), hasLineStyle(me) ? {} : { only: true });
    });
    toast('This look uses the second voice colours: the shared highlight as its text colour');
  }, { variant: 'ghost sm', title: 'Text in the shared highlight colour and the highlight in the shared text colour, so the two voices look different' });
  voice2.setAttribute('data-k', 'duet-colors');
  b._reg((p) => {
    voice2.hidden = sideOf(p) === 'center';
  });

  return h('div', { class: 'line-anim', 'data-k': 'line-anim' },
    h('h4', { class: 'ai-h' }, 'Key words'),
    h('p', { class: 'muted tiny' }, 'Tap the words to stress: they get bigger and take the accent colour. One line at a time display only.'),
    chipRow,
    staleNote,
    b.range('Key word size', () => (live() && live().emph && live().emph.size) || EMPH_SIZE, emphField('size', EMPH_SIZE), { min: 1, max: 2.5, step: 0.05, fmt: (v) => `×${Number(v).toFixed(2)}`, key: `emph:size:${lineId}` }),
    h('div', { class: 'grid2' },
      b.color('Key word colour', accent, emphField('color', ''), `emph:color:${lineId}`),
      b.toggle('Slam when sung', () => !!(live() && live().emph && live().emph.slam), emphField('slam', false)),
    ),
    h('div', { class: 'row' }, clear),
    h('h4', { class: 'ai-h' }, 'Duet side'),
    h('p', { class: 'muted tiny' }, 'Put screamed and clean vocals on opposite sides. Reaches every line with this look.'),
    b.segmented('Side', sideOf, setSide, SIDES),
    h('div', { class: 'row' }, voice2),
  );
}
