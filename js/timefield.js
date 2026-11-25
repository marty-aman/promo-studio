// Time fields for song section times (the Manager Sections tab, the custom range in "Which part of the song?"):
// shown in the format picked on the "Times as" switch (remembered in this browser), with the other format as a
// small hint, and reading the other formats when they are unambiguous (see parseTimeIn). Stored values stay seconds.
import { h, toast } from './dom.js';
import { FPS, TIME_FORMATS, cleanFormat, formatTimeIn, parseTimeIn, timeHint, stepTime } from './timecode.js';

const KEY = 'pvm.timefmt.v1';

export function getTimeFormat() {
  try {
    return cleanFormat(localStorage.getItem(KEY));
  } catch {
    return 'clock';
  }
}
export function setTimeFormat(f) {
  try {
    localStorage.setItem(KEY, cleanFormat(f));
  } catch {
    /* no room: it's only a convenience */
  }
}

/** A section time for display (tables, lists, picker labels) in the chosen format. */
export const showTime = (sec) => (sec == null || !Number.isFinite(+sec) ? '' : formatTimeIn(sec, getTimeFormat()));

/** The "Times as" switch. onChange() re-draws the surface it sits on. */
export function timeFormatSwitch(onChange) {
  const sel = h(
    'select',
    { 'aria-label': 'Show and type times as', 'data-k': 'timefmt', title: `Clock: 1:23.50. Seconds.frames: 83.15 is second 83, frame 15 (${FPS} fps). Plain seconds: 83.5. A time with a colon is always read as a clock time.` },
    TIME_FORMATS.map(([k, label]) => h('option', { value: k, selected: getTimeFormat() === k }, label)),
  );
  sel.addEventListener('change', () => (setTimeFormat(sel.value), onChange()));
  return h('label', { class: 'small timefmt' }, h('span', {}, 'Times as '), sel);
}

/**
 * A time input with −/+ frame buttons and a hint line. opts: { value (seconds or null), label, onCommit(sec, key),
 * empty: what an empty field means (a value, or null; undefined = an empty field is refused), placeholder, dataK }.
 * onCommit gets null for an empty field; `key` is set for nudge-button runs, so they can be one undo step.
 * A refused entry shows its message and puts the old value back. Arrow Up/Down step one frame (0.1 s in plain
 * seconds; Shift: a second) in the box and commit when the box is left or Enter is pressed, as one edit.
 */
export function timeField(opts) {
  const fmt = getTimeFormat();
  const shown = (v) => (v == null ? '' : formatTimeIn(v, fmt));
  const hintOf = (v) => (v == null ? '' : timeHint(v, fmt));
  const input = h('input', {
    type: 'text',
    inputmode: fmt === 'clock' ? 'text' : 'decimal',
    autocomplete: 'off',
    spellcheck: 'false',
    enterkeyhint: 'done',
    class: 'mgr-time tf-in',
    value: shown(opts.value),
    placeholder: opts.placeholder || formatTimeIn(0, fmt),
    'aria-label': opts.label,
    'data-k': opts.dataK || null,
    'data-fmt': fmt,
  });
  const hint = h('span', { class: 'tf-hint muted tiny', 'aria-live': 'polite' }, hintOf(opts.value));
  const preview = () => {
    const r = parseTimeIn(input.value, fmt);
    hint.classList.toggle('error-text', !!r.error);
    hint.textContent = r.error ? r.error : r.sec == null ? hintOf(opts.value) : `${formatTimeIn(r.sec, fmt) === input.value.trim() ? '' : `= ${formatTimeIn(r.sec, fmt)} · `}${timeHint(r.sec, fmt)}`;
  };
  const restore = () => {
    input.value = shown(opts.value);
    input.removeAttribute('aria-invalid');
  };
  const commit = (sec, key) => {
    if (sec === opts.value || (sec != null && opts.value != null && Math.abs(sec - opts.value) < 1e-9)) return restore();
    opts.onCommit(sec, key);
  };
  // the browser fires no 'change' for a value the arrow keys set, so the field commits itself on Enter and on leaving
  let applied = input.value;
  const apply = () => {
    if (input.value === applied) return;
    applied = input.value;
    const r = parseTimeIn(input.value, fmt);
    if (r.error || (r.sec == null && opts.empty === undefined)) {
      toast(r.error || 'Type a time; it can’t be empty.', 'error');
      restore();
      applied = input.value;
      hint.textContent = hintOf(opts.value);
      hint.classList.remove('error-text');
      return;
    }
    commit(r.sec == null ? opts.empty : r.sec);
  };
  input.addEventListener('input', preview);
  input.addEventListener('change', apply);
  input.addEventListener('blur', apply);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') return e.preventDefault(), apply(), input.blur();
    if (e.key === 'Escape' && input.value !== shown(opts.value)) return e.preventDefault(), restore(), preview(); // a first Escape only undoes the typing (a dialog stays open)
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const r = parseTimeIn(input.value, fmt);
    const from = r.sec != null ? r.sec : opts.value != null ? opts.value : 0;
    input.value = formatTimeIn(stepTime(from, fmt, e.key === 'ArrowUp' ? 1 : -1, e.shiftKey), fmt);
    preview();
  });
  const step = fmt === 'seconds' ? '0.1 s' : 'a frame';
  const nudge = (dir) =>
    h(
      'button',
      {
        type: 'button',
        class: 'icon-btn ghost tf-nudge',
        title: `${dir > 0 ? 'Later' : 'Earlier'} by ${step} (Shift: a second)`,
        'aria-label': `${opts.label}: ${dir > 0 ? 'later' : 'earlier'} by ${step}`,
        'data-nudge': dir > 0 ? '+' : '-',
        onclick: (e) => {
          const from = opts.value != null ? opts.value : 0;
          commit(stepTime(from, fmt, dir, e.shiftKey), `tf-nudge:${opts.dataK || opts.label}`);
        },
      },
      dir > 0 ? '+' : '−',
    );
  return h('span', { class: 'tf' }, h('span', { class: 'tf-row' }, input, nudge(-1), nudge(1)), hint);
}
