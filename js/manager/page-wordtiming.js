// The Manager song's Lyrics tab → Timing → Word timing: how many lines have words timed by hand (Clear per line
// and all), lines whose words changed since (Re-spread), and the word timing editor (panel-wordtiming.js) on one
// line of the saved timing, playing the song file in this tab. Every change is one save on the song.
import { h, button } from '../dom.js';
import { lyricsFromTiming, editTimingLine } from './lyrictiming.js';
import { wordTimingEditor } from '../panel-wordtiming.js';
import { clearHandWords, wordsStale } from '../wordtiming.js';

const ui = new Map(); // song id → { line, word, target }, kept between page rebuilds
let audio = null; // { el, id, url } the song file playing for "Play this line"

function songPlayer(ctx, id) {
  if (!id || !ctx.studio.mediaBlob || !ctx.studio.mediaBlob(id)) return null;
  const el = () => {
    if (!audio || audio.id !== id) {
      if (audio) (audio.el.pause(), URL.revokeObjectURL(audio.url));
      const url = URL.createObjectURL(ctx.studio.mediaBlob(id));
      audio = { id, url, el: new Audio(url) };
    }
    return audio.el;
  };
  return {
    play(from) {
      const a = el();
      a.currentTime = from;
      a.play().catch(() => {});
      return true;
    },
    stop: () => audio && audio.el.pause(),
    now: () => (audio && audio.id === id ? audio.el.currentTime : null),
    playing: () => !!(audio && audio.id === id && !audio.el.paused),
  };
}

export function wordTimingBox(ctx, song, S) {
  const t = song.lyricTiming;
  if (!t || !t.lines || !t.lines.length) return null;
  const lines = lyricsFromTiming(t, () => '');
  const st = ui.get(song.id) || { line: 0, word: 0, target: 'word' };
  ui.set(song.id, st);
  st.line = Math.min(Math.max(0, st.line), lines.length - 1);
  const edit = (indexes, fn) => ctx.update(S((s) => indexes.forEach((i) => s.lyricTiming && editTimingLine(s.lyricTiming, i, fn))));
  const hand = lines.map((l, i) => (l.wordsBy === 'hand' && l.words ? i : -1)).filter((i) => i >= 0);
  const stale = lines.map((l, i) => (wordsStale(l) ? i : -1)).filter((i) => i >= 0);
  const respread = (x) => {
    delete x.wordsAuto;
    clearHandWords(x);
  };
  const pick = h('select', { 'aria-label': 'Line to time', 'data-k': 'wt-line' }, lines.map((l, i) => h('option', { value: String(i), selected: i === st.line }, `${i + 1} · ${l.text.length > 44 ? `${l.text.slice(0, 43)}…` : l.text}`)));
  pick.addEventListener('change', () => {
    st.line = +pick.value;
    st.word = 0;
    st.open = true;
    ctx.refresh(); // draw the page again on the new line
  });
  const stem = (song.files && song.files.stems ? song.files.stems : []).find((x) => x.role === 'vocals' && (ctx.studio.mediaInfo(x.mediaId) || {}).peaks);
  const info = stem ? ctx.studio.mediaInfo(stem.mediaId) : song.audioId && ctx.studio.mediaInfo(song.audioId);
  const peaks = info && info.peaks ? { data: info.peaks, perSec: info.peaksPerSec, label: stem ? 'Vocal stem' : 'Song' } : null;
  const line = lines[st.line];
  return h(
    'div',
    { class: 'mgr-wordtiming', 'data-k': 'word-timing-song' },
    h('h3', { class: 'mgr-h3' }, 'Word timing'),
    h('p', { class: 'small', 'data-k': 'wt-count' }, `Word timing: ${hand.length} line${hand.length === 1 ? '' : 's'} hand-timed`,
      hand.length ? [' ', button('Clear all', () => confirm(`Clear the word timing you set on ${hand.length} line${hand.length === 1 ? '' : 's'} of “${song.title}”? Lines with Auto-sync word times go back to them, the rest spread evenly.`) && edit(hand, clearHandWords), { variant: 'sm ghost' })] : null),
    hand.length
      ? h('ul', { class: 'mgr-wt-list' }, hand.map((i) => h('li', { 'data-k': 'wt-hand-line' }, h('span', {}, `${i + 1} · ${lines[i].text}`), button('Clear', () => edit([i], clearHandWords), { variant: 'sm ghost', title: 'Back to the Auto-sync word times, or spread evenly' }))))
      : null,
    stale.length
      ? h('p', { class: 'warn-note small', 'data-k': 'wt-stale-all' }, `${stale.length} line${stale.length === 1 ? '’s' : 's’'} words changed since they were timed. `, button('Re-spread them', () => edit(stale, respread), { variant: 'sm' }))
      : null,
    h('details', { class: 'mgr-wt-edit', open: st.open || null, ontoggle: (e) => (st.open = e.target.open) },
      h('summary', { class: 'small' }, 'Time the words of a line'),
      h('div', { class: 'row wt-pick' }, pick),
      wordTimingEditor({ line, commit: (fn) => edit([st.line], fn), player: songPlayer(ctx, song.audioId), peaks, fps: 30, state: st }),
    ),
  );
}
