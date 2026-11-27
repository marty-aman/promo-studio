// A lyric line's key words and duet side (lyricanim.js), in the lyric line inspector. Key words: tap a word chip to
// make it bigger, in an accent colour, and optionally slam when it is sung. The pick is saved on the line
// (line.emph, word indexes plus the words), so editing the text marks it out of date, like word timing.
// Duet side: the line sits left, centre or right (line.style.side, a look field, so it reaches every line with this
// look). Each change is one store.update, so one Ctrl+Z undoes it. One line at a time display only.
import { h, button, toast, field } from './dom.js';
import { lineStyle, hasLineStyle } from './linestyle.js';
import { lookMembers, changeLook } from './lookapply.js';
import { SIDES, EMPH_SIZE, toggleEmph, emphStale, emphIndexes } from './lyricanim.js';
import { WORD_FX_FIELDS, wordFxOf, wordFxStale, setWordFx, resolveWordFx } from './lyricfx.js';

// what tapping a chip does on each line (key word or pick a word to tune) and the word being tuned; kept here so a
// rebuilt inspector keeps them. Not saved.
const tuneState = new Map();

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

  // ---- key words: one chip per word, rebuilt when the words change. In "Tune a word" mode a tap picks the word
  // whose own effect settings show below instead (lyricfx.js wordFx); a dot marks words with their own settings.
  if (!tuneState.has(lineId)) tuneState.set(lineId, { mode: 'key', sel: null });
  const tune = tuneState.get(lineId);
  const chipRow = h('div', { class: 'chips la-words', role: 'group', 'aria-label': 'Key words in this line' });
  const staleNote = h('p', { class: 'muted tiny la-stale', hidden: true }, 'The words changed since you picked the key words, so they are not shown. Tap a word to pick again.');
  const wfxStaleNote = h('p', { class: 'muted tiny la-stale', 'data-k': 'wfx-stale', hidden: true }, 'The words changed since you tuned some of them, so those word settings are not used. Tune the words again.');
  const modeBtns = [['key', 'Make it a key word'], ['fx', 'Tune its effects']].map(([v, label]) =>
    h('button', { type: 'button', role: 'radio', dataset: { value: v, k: `wfx-mode-${v}` }, onclick: () => setMode(v) }, label));
  const modeSeg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Tapping a word' }, ...modeBtns);
  let shown = '';
  const drawChips = (p) => {
    const l = p.lyrics.find((x) => x.id === lineId);
    if (!l) return;
    const set = emphIndexes(l) || new Set();
    const wf = wordFxOf(l);
    const n = words(l.text).length;
    if (tune.sel != null && tune.sel >= n) tune.sel = null;
    const sig = `${l.text}|${[...set].join(',')}|${tune.mode}|${tune.sel}|${wf ? [...wf.keys()].join(',') : ''}`;
    staleNote.hidden = !emphStale(l);
    wfxStaleNote.hidden = !wordFxStale(l);
    modeBtns.forEach((x) => {
      const on = x.dataset.value === tune.mode;
      x.classList.toggle('on', on);
      x.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    if (sig === shown) return;
    shown = sig;
    chipRow.setAttribute('aria-label', tune.mode === 'fx' ? 'Pick a word to tune' : 'Key words in this line');
    chipRow.replaceChildren(
      ...words(l.text).map((w, i) => {
        const on = tune.mode === 'fx' ? tune.sel === i : set.has(i);
        const own = !!(wf && wf.has(i));
        return h('button', {
          type: 'button',
          class: `btn chip${on ? ' on' : ''}${own ? ' has-wfx' : ''}${set.has(i) ? ' is-key' : ''}`,
          'aria-pressed': on ? 'true' : 'false',
          title: own ? 'This word has its own effect settings' : undefined,
          dataset: { wi: String(i) },
          onclick: () => {
            if (tune.mode === 'fx') {
              tune.sel = tune.sel === i ? null : i;
              b.refresh();
            } else store.update(onLine((x) => setEmph(x, toggleEmph(x, i))));
          },
        }, w, own ? h('span', { class: 'wfx-dot', 'aria-hidden': 'true' }) : null);
      }),
    );
  };
  const setMode = (v) => {
    tune.mode = v;
    if (v === 'key') tune.sel = null;
    b.refresh();
  };
  b._reg(drawChips);

  // ---- the picked word's own settings: word > line > look > song. Each slider shows the line's value until you
  // change it; each change is one store.update per drag (one Ctrl+Z), keyed by the word so two words never merge.
  const wordOf = (p) => {
    const l = p.lyrics.find((x) => x.id === lineId);
    if (!l || tune.mode !== 'fx' || tune.sel == null) return null;
    const ws = words(l.text);
    if (!(tune.sel < ws.length)) return null;
    const s = lineStyle(p.lyricStyle, l, p.theme);
    const wf = wordFxOf(l);
    const entry = wf && wf.get(tune.sel);
    const r = resolveWordFx(s.fx, entry, s.animation);
    const key = (emphIndexes(l) || new Set()).has(tune.sel);
    const inherited = key ? (l.emph && l.emph.color) || s.highlight : s.color;
    return { l, word: ws[tune.sel], r, color: r.color || inherited, entry };
  };
  const writeWord = (k, v) => store.update((d) => {
    const x = d.lyrics.find((y) => y.id === lineId);
    if (!x || tune.sel == null) return;
    const w = setWordFx(x, tune.sel, k, v);
    if (w) x.wordFx = w;
    else delete x.wordFx;
  }, k == null ? null : `wfx:${k}:${lineId}:${tune.sel}`);
  const wordHead = h('h5', { class: 'wfx-h' });
  const rows = Object.entries(WORD_FX_FIELDS).map(([k, [, min, max, step, label, fmt]]) => {
    const out = h('output', { class: 'val' });
    const input = h('input', { type: 'range', min, max, step });
    input.addEventListener('input', () => {
      writeWord(k, parseFloat(input.value));
      out.textContent = fmt(parseFloat(input.value));
    });
    const row = field(label, h('div', { class: 'range-row' }, input, out));
    row.dataset.wfx = k;
    b._reg((p) => {
      const w = wordOf(p);
      if (!w) return;
      const v = w.r[k];
      if (document.activeElement !== input) input.value = v;
      out.textContent = fmt(v);
      row.classList.toggle('wfx-own', !!w.r.own[k]);
    });
    return row;
  });
  const colorIn = h('input', { type: 'color' });
  colorIn.addEventListener('input', () => writeWord('color', colorIn.value));
  const colorRow = field('Colour', colorIn);
  colorRow.dataset.wfx = 'color';
  const reset = button('Reset this word', () => {
    writeWord(null);
    toast('This word follows the line again');
  }, { variant: 'ghost sm' });
  reset.setAttribute('data-k', 'wfx-reset');
  const wordEd = h('div', { class: 'wfx-editor', 'data-k': 'wfx-editor', hidden: true },
    wordHead,
    h('p', { class: 'muted tiny' }, 'Only this word moves this way; the rest of the line keeps its settings. Sliders show the line’s value until you change them.'),
    h('div', { class: 'grid2' }, ...rows),
    colorRow,
    h('div', { class: 'row' }, reset),
  );
  const pickHint = h('p', { class: 'muted tiny', 'data-k': 'wfx-pick', hidden: true }, 'Tap a word to give it its own shake, pulse, glitch, size or colour.');
  b._reg((p) => {
    const w = wordOf(p);
    wordEd.hidden = !w;
    pickHint.hidden = !(tune.mode === 'fx' && !w);
    if (!w) return;
    wordHead.textContent = `Word: “${w.word}”`;
    if (document.activeElement !== colorIn) colorIn.value = w.color || '#ffffff';
    colorRow.classList.toggle('wfx-own', !!w.r.own.color);
    reset.disabled = !w.entry;
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
    field('Tapping a word', modeSeg),
    chipRow,
    staleNote,
    wfxStaleNote,
    pickHint,
    wordEd,
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
