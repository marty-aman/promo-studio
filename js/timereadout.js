// The Video Studio player's time readout: the clock time and seconds.frame, both with the edit's length.
// The seconds.frame value is also a seek box (type 12.15 or 1:02). Clicking a label swaps which line is bigger.
import { h } from './dom.js';
import { FPS, clockTime, secFrame, parseSeek } from './timecode.js';

const KEY = 'pvm.timecode.primary';

/** `engine` needs `t` and `seek(t)`; call `update()` whenever the playhead or the length changes. */
export function createTimeReadout({ engine, store, toast }) {
  const clockNow = h('span', { class: 'tc-now' });
  const clockOf = h('span', { class: 'tc-of' });
  const frameOf = h('span', { class: 'tc-of' });
  const input = h('input', {
    type: 'text',
    class: 'tc-in',
    inputmode: 'decimal',
    autocomplete: 'off',
    spellcheck: 'false',
    size: 7,
    enterkeyhint: 'go',
    'aria-label': `Playhead in seconds.frame at ${FPS} fps. Type 12.15 or 1:02 and press Enter to jump there`,
    title: `Seconds.frame at ${FPS} fps: 12.15 is second 12, frame 15. Type 12.15 or 1:02 and press Enter to jump there.`,
  });
  const swapTitle = 'Click to swap which time is bigger';
  const clockRow = h(
    'button',
    { type: 'button', class: 'tc-row tc-clock', title: `Time (minutes:seconds.hundredths). ${swapTitle}`, onclick: () => swap() },
    h('small', { class: 'tc-lab' }, 'time'),
    clockNow,
    clockOf,
  );
  const frameLab = h('button', { type: 'button', class: 'tc-lab', title: `Seconds.frame at ${FPS} fps. ${swapTitle}`, onclick: () => swap() }, 'sec.frame');
  const frameRow = h('div', { class: 'tc-row tc-frames' }, frameLab, input, frameOf);
  const el = h('div', { class: 'timecode', role: 'group', 'aria-label': 'Playhead time' }, clockRow, frameRow);

  let primary = 'clock';
  try {
    if (localStorage.getItem(KEY) === 'frames') primary = 'frames';
  } catch {}
  const applyPrimary = () => {
    el.dataset.primary = primary;
    clockRow.setAttribute('aria-pressed', primary === 'clock' ? 'true' : 'false');
    frameLab.setAttribute('aria-pressed', primary === 'frames' ? 'true' : 'false');
  };
  function swap() {
    primary = primary === 'clock' ? 'frames' : 'clock';
    try {
      localStorage.setItem(KEY, primary);
    } catch {}
    applyPrimary();
  }
  applyPrimary();

  const editing = () => document.activeElement === input;
  function update() {
    const t = engine.t;
    const d = store.get().duration;
    clockNow.textContent = clockTime(t);
    clockOf.textContent = ` / ${clockTime(d)}`;
    frameOf.textContent = `/ ${secFrame(d)}`;
    if (!editing()) {
      input.value = secFrame(t);
      input.removeAttribute('aria-invalid');
    }
  }
  function commit() {
    const v = parseSeek(input.value);
    if (Number.isNaN(v)) {
      input.setAttribute('aria-invalid', 'true');
      toast(`Type a time like 12.15 (second 12, frame 15) or 1:02. Frames go from 0 to ${FPS - 1}.`);
      return false;
    }
    input.removeAttribute('aria-invalid');
    engine.seek(Math.min(v, store.get().duration));
    return true;
  }
  input.addEventListener('focus', () => input.select());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (commit()) input.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      input.blur();
    }
  });
  input.addEventListener('blur', () => update());
  return { el, update, input };
}
