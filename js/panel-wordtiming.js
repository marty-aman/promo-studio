// The word timing editor for one lyric line: its words as blocks on a small timeline that spans the line
// (with the song's or vocal stem's waveform under it), drag an edge to change when a word starts or ends,
// drag a word to move it, nudge buttons, number fields, Spread evenly, Reset to auto-sync, Tap to time and
// Play this line with the playing word lit. Used by the Video Studio's Lyrics tab and the Manager song's
// Lyrics tab; it never touches a store itself. Each drag, nudge, field change or finished tap run is one
// call of `commit(mutator)`, which the caller makes one undo step / one save.
//
// wordTimingEditor({ line, commit, player, peaks, fps, state })
//   line    { text, start, end, words?, wordsBy?, wordsAuto? } in song time
//   commit  (mutateLine) => void — mutateLine(lineDraft) changes the line in place
//   player  { play(from, to), stop(), now() → song time, playing() } or null (no preview)
//   peaks   { data: Float32Array (min/max pairs), perSec, label } or null
//   state   an object kept by the caller between rebuilds ({ word, target })
import { h, button, toast } from './dom.js';
import { editableWords, constrainWords, moveEdge, moveWord, applyTaps, setHandWords, clearHandWords, spreadWords, wordWindow, wordAt } from './wordtiming.js';

const fmt = (v) => (Math.round(v * 100) / 100).toFixed(2);

let tapOwner = null; // the editor taking Tap to time keys
function onTapKey(e) {
  const o = tapOwner;
  if (!o) return;
  if (e.key === ' ' || e.key === 'Enter' || e.key === 't' || e.key === 'T') {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat) o.doTap();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    e.stopImmediatePropagation();
    o.cancelTap();
  }
}

export function wordTimingEditor({ line, commit, player = null, peaks = null, fps = 30, state = {} }) {
  const win = wordWindow(line);
  const info = editableWords(line);
  let words = info.words;
  if (!words.length) return h('p', { class: 'muted small' }, 'This line has no words.');
  state.word = Math.min(Math.max(0, state.word || 0), words.length - 1);
  state.target = state.target || 'word';
  const span = Math.max(0.1, win.hi - win.lo);
  const pct = (t) => `${(((t - win.lo) / span) * 100).toFixed(3)}%`;

  const save = (next, msg) => {
    const fixed = constrainWords(next, win);
    commit((x) => setHandWords(x, fixed));
    if (msg) toast(msg);
  };

  // ---------------------------------------------------------------- the mini timeline
  const track = h('div', { class: 'wt-track', tabindex: '0', role: 'group', 'aria-label': `Word times of “${line.text}”. Left and right arrows pick a word.` });
  const wave = h('canvas', { class: 'wt-wave', 'aria-hidden': 'true' });
  const lineBox = h('div', { class: 'wt-line', style: { left: pct(line.start), width: `${((line.end - line.start) / span) * 100}%` }, 'aria-hidden': 'true' });
  const head = h('div', { class: 'wt-head', hidden: true, 'aria-hidden': 'true' });
  track.append(wave, lineBox);
  const blocks = words.map((k, i) => {
    const el = h('div', { class: 'wt-word', dataset: { i: String(i) }, title: k.w },
      h('span', { class: 'wt-h s', dataset: { edge: 'start' }, 'aria-hidden': 'true' }),
      h('span', { class: 'wt-w' }, k.w),
      h('span', { class: 'wt-h e', dataset: { edge: 'end' }, 'aria-hidden': 'true' }));
    track.append(el);
    return el;
  });
  track.append(head);
  const layout = () => {
    words.forEach((k, i) => {
      const b = blocks[i];
      b.style.left = pct(k.t);
      b.style.width = `${Math.max(0.4, ((k.end - k.t) / span) * 100)}%`;
      b.classList.toggle('sel', i === state.word);
      b.classList.toggle('alt', i % 2 === 1);
    });
  };
  layout();

  // the waveform under the words (drawn once it has a size)
  const drawWave = () => {
    if (!peaks || !peaks.data || !peaks.perSec) return;
    const w = Math.max(1, Math.round(track.clientWidth));
    const hgt = Math.max(1, Math.round(track.clientHeight));
    if (!w || !hgt) return;
    wave.width = w;
    wave.height = hgt;
    const ctx = wave.getContext('2d');
    ctx.clearRect(0, 0, w, hgt);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    const bins = peaks.data.length / 2;
    for (let x = 0; x < w; x++) {
      const b0 = Math.floor((win.lo + (x / w) * span) * peaks.perSec);
      const b1 = Math.max(b0 + 1, Math.floor((win.lo + ((x + 1) / w) * span) * peaks.perSec));
      let lo = 0;
      let hi = 0;
      for (let b = Math.max(0, b0); b < Math.min(bins, b1); b++) {
        lo = Math.min(lo, peaks.data[b * 2]);
        hi = Math.max(hi, peaks.data[b * 2 + 1]);
      }
      const y0 = ((1 - hi) / 2) * hgt;
      ctx.fillRect(x, y0, 1, Math.max(1, ((hi - lo) / 2) * hgt));
    }
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(drawWave).observe(track);

  // drag: an edge handle changes that edge, the word body moves the word; a tap without moving selects it
  let drag = null;
  track.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.wt-word');
    if (!b || e.button > 0 || tapRun()) return;
    e.preventDefault();
    const i = +b.dataset.i;
    const edge = e.target.dataset.edge || 'word';
    drag = { i, edge, x0: e.clientX, from: words.map((k) => ({ ...k })), moved: false, id: e.pointerId };
    track.setPointerCapture(e.pointerId);
    state.word = i;
    state.target = edge;
    layout();
    paintFields();
  });
  track.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    if (!drag.moved && Math.abs(dx) < 3) return;
    drag.moved = true;
    const dt = (dx / Math.max(1, track.clientWidth)) * span;
    const k = drag.from[drag.i];
    words = drag.edge === 'word' ? moveWord(drag.from, drag.i, dt, win) : moveEdge(drag.from, drag.i, drag.edge, (drag.edge === 'start' ? k.t : k.end) + dt, win);
    layout();
    paintFields();
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (d.moved) save(words);
  };
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    words = drag.from;
    drag = null;
    layout();
    paintFields();
  });
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      state.word = Math.min(words.length - 1, Math.max(0, state.word + (e.key === 'ArrowRight' ? 1 : -1)));
      layout();
      paintFields();
    }
  });

  // ---------------------------------------------------------------- the selected word
  const label = h('div', { class: 'wt-sel small' });
  const startIn = h('input', { type: 'number', class: 'num', step: '0.01', min: '0', 'aria-label': 'Word start (song seconds)' });
  const endIn = h('input', { type: 'number', class: 'num', step: '0.01', min: '0', 'aria-label': 'Word end (song seconds)' });
  const paintFields = () => {
    const k = words[state.word];
    label.textContent = `Word ${state.word + 1} of ${words.length}: “${k.w}”`;
    if (document.activeElement !== startIn) startIn.value = fmt(k.t);
    if (document.activeElement !== endIn) endIn.value = fmt(k.end);
    targets.forEach((b) => b.setAttribute('aria-checked', b.dataset.v === state.target ? 'true' : 'false'));
    targets.forEach((b) => b.classList.toggle('on', b.dataset.v === state.target));
  };
  const setField = (edge, input) => () => {
    const v = parseFloat(input.value);
    if (!Number.isFinite(v)) return paintFields();
    save(moveEdge(words, state.word, edge, v, win));
  };
  startIn.addEventListener('change', setField('start', startIn));
  endIn.addEventListener('change', setField('end', endIn));
  const targets = [['start', 'Start'], ['word', 'Whole word'], ['end', 'End']].map(([v, l]) =>
    h('button', { type: 'button', role: 'radio', class: 'btn chip', dataset: { v }, onclick: () => ((state.target = v), paintFields()) }, l));
  const nudge = (sec) => {
    const i = state.word;
    const k = words[i];
    save(state.target === 'word' ? moveWord(words, i, sec, win) : moveEdge(words, i, state.target, (state.target === 'start' ? k.t : k.end) + sec, win));
  };
  const frame = 1 / (fps || 30);
  const nudges = [[-0.05, '−0.05 s'], [-frame, '−1 frame'], [frame, '+1 frame'], [0.05, '+0.05 s']].map(([s, l]) => button(l, () => nudge(s), { variant: 'sm', title: `${s < 0 ? 'Earlier' : 'Later'}: moves what is picked above (start, whole word or end)` }));

  // ---------------------------------------------------------------- play this line, tap to time
  let raf = 0;
  // where "Play this line" stops, kept in `state` so an editor rebuilt mid-play carries on lighting words
  const tick = () => {
    if (!track.isConnected || !player) return stopLoop();
    const t = player.now();
    if (t == null || !player.playing()) {
      if (tapRun()) finishTap();
      return stopLoop();
    }
    if (t >= (state.playTo ?? Infinity)) {
      state.playTo = null;
      player.stop();
      if (tapRun()) finishTap();
      return stopLoop();
    }
    head.hidden = false;
    head.style.left = pct(Math.min(win.hi, Math.max(win.lo, t)));
    const at = wordAt(words, t);
    blocks.forEach((b, i) => b.classList.toggle('live', i === at));
    raf = requestAnimationFrame(tick);
  };
  const stopLoop = () => {
    cancelAnimationFrame(raf);
    head.hidden = true;
    blocks.forEach((b) => b.classList.remove('live'));
  };
  const playLine = (lead = 0.3) => {
    if (!player) return false;
    state.playTo = win.hi + 0.3;
    if (player.play(Math.max(0, line.start - lead), state.playTo) === false) return (state.playTo = null), false;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
    return true;
  };

  // a Tap to time run lives in `state.tap`, so an editor rebuilt mid-run (an automatic save redraws the panel)
  // takes it over: the newest editor of the same line owns the run and the keys
  const key = `${line.text}@${line.start}`;
  const me = {};
  if (state.tap && state.tap.key !== key) {
    state.tap = null; // another line now: that run is over
    tapOwner = null;
    removeEventListener('keydown', onTapKey, true);
  }
  const tapRun = () => (state.tap && tapOwner === me ? state.tap : null);
  const tapBox = h('div', { class: 'wt-tap', hidden: true });
  const tapBtn = button('Tap', () => doTap(), { variant: 'primary big', iconName: 'hand' });
  const tapNote = h('p', { class: 'small' });
  tapBox.append(tapNote, h('div', { class: 'row' }, tapBtn, button('Stop', () => cancelTap(), { variant: 'ghost' })), h('p', { class: 'muted tiny' }, 'Space, Enter or T taps · Esc stops. The tap after the last word ends it.'));
  const paintTap = () => {
    const n = state.tap.taps.length;
    tapBox.hidden = false;
    tapNote.textContent = n < words.length ? `Tap as “${words[n].w}” starts (${n + 1} of ${words.length})` : `Tap once more when “${words[words.length - 1].w}” ends, or let the line finish`;
    tapBtn.querySelector('span').textContent = n < words.length ? `Tap: “${words[n].w}”` : 'Tap: end';
  };
  const startTap = () => {
    if (!player) return toast('Pick the song first, so the line can play while you tap.', 'error');
    state.tap = { taps: [], key };
    tapOwner = me;
    paintTap();
    addEventListener('keydown', onTapKey, true);
    if (!playLine(1)) return endTap();
    track.focus(); // not the Tap button: Space on a focused button would tap twice
  };
  const doTap = () => {
    const run = tapRun();
    if (!run) return;
    const t = player.now();
    if (t == null) return;
    run.taps.push(+t.toFixed(3));
    if (run.taps.length > words.length) return finishTap();
    paintTap();
  };
  const endTap = () => {
    removeEventListener('keydown', onTapKey, true);
    tapBox.hidden = true;
    const t = state.tap;
    state.tap = null;
    tapOwner = null;
    if (player && player.playing()) player.stop();
    return t;
  };
  const cancelTap = () => tapRun() && endTap();
  const finishTap = () => {
    if (!tapRun()) return;
    const t = endTap();
    if (!t.taps.length) return;
    const ends = t.taps.length > words.length ? t.taps.slice(0, words.length + 1) : t.taps;
    const next = applyTaps(words, ends.slice(0, words.length), win);
    if (ends.length > words.length) next[words.length - 1] = { ...next[words.length - 1], end: Math.max(next[words.length - 1].t + 0.04, ends[words.length]) };
    save(next, `${Math.min(t.taps.length, words.length)} of ${words.length} words timed by tapping.`);
  };
  Object.assign(me, { doTap, cancelTap });
  if (state.tap && player && player.playing()) {
    tapOwner = me; // rebuilt mid-run: carry on here
    paintTap();
  } else if (state.tap) endTap();

  const canReset = Array.isArray(line.wordsAuto) && line.wordsAuto.length;
  const status = info.stale
    ? h('p', { class: 'warn-note small', 'data-k': 'wt-stale' }, 'The words of this line changed (or the line moved) since they were timed, so they play spread evenly. ',
        button('Re-spread', () => commit((x) => {
          delete x.wordsAuto; // they were for the old words too
          clearHandWords(x);
        }), { variant: 'sm' }))
    : h('p', { class: 'muted tiny', 'data-k': 'wt-from' }, info.hand ? 'Timed by you. A later Auto-sync asks before replacing it.' : info.from === 'saved' ? 'From Auto-sync. Change any word and it’s kept as yours.' : 'No word times yet: the words are spread evenly over the line. Change any word to time it.');

  const box = h(
    'div',
    { class: 'wt', 'data-k': 'word-timing' },
    status,
    track,
    h('div', { class: 'wt-scale muted tiny', 'aria-hidden': 'true' }, h('span', {}, `${fmt(win.lo)} s`), peaks && peaks.label ? h('span', {}, peaks.label) : null, h('span', {}, `${fmt(win.hi)} s`)),
    label,
    h('div', { class: 'wt-fields' }, h('label', {}, h('span', { class: 'tiny muted' }, 'Start'), startIn), h('label', {}, h('span', { class: 'tiny muted' }, 'End'), endIn)),
    h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'What the nudge buttons move' }, targets),
    h('div', { class: 'row wrap wt-nudge' }, nudges),
    tapBox,
    h(
      'div',
      { class: 'row wrap' },
      player ? button('Play this line', () => playLine(), { iconName: 'play', variant: 'sm' }) : null,
      player ? button('Tap to time', startTap, { iconName: 'hand', variant: 'sm', title: 'The line plays; tap Space as each word starts' }) : null,
      button('Spread evenly', () => save(spreadWords(line), 'Words spread evenly over the line.'), { variant: 'sm ghost', title: 'Longer words get a bit more time, as when a line has no word times' }),
      button('Reset to auto-sync', () => commit((x) => clearHandWords(x)), { variant: 'sm ghost', disabled: !canReset, title: canReset ? 'Back to the word times Auto-sync found' : 'This line has no Auto-sync word times to go back to' }),
    ),
  );
  paintFields();
  if (player && state.playTo != null && player.playing()) raf = requestAnimationFrame(tick); // rebuilt while playing
  return box;
}
