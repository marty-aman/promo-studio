// Export tab: "Export range". Start and End of the exported clip (default: the whole edit), with
// "Set at playhead" buttons, a preview that plays just that range (optionally looping) and the resulting length.
import { h, button, toast, field, section } from './dom.js';
import { resolveRange, setRangeSide } from './exportrange.js';
import { clockTime, secFrame, parseSeek } from './timecode.js';

/**
 * Set one side of the export range (t = null puts it back to the edit's own). One undo step; a refused change
 * (too short) shows its message and leaves the edit alone. `key` lets a drag collapse into one step.
 */
export function setExportSide(store, which, t, key = null) {
  const probe = structuredClone(store.get());
  const err = setRangeSide(probe, which, t);
  if (err) {
    toast(err, 'error');
    return false;
  }
  store.update((d) => setRangeSide(d, which, t), key);
  return true;
}

export function exportRangePanel({ store, engine, ui, settings, saveSettings }) {
  const p = store.get();
  const r = resolveRange(p);
  const box = (which) => {
    const input = h('input', {
      type: 'text',
      inputmode: 'decimal',
      autocomplete: 'off',
      spellcheck: 'false',
      value: clockTime(which === 'start' ? r.start : r.end),
      enterkeyhint: 'go',
      'aria-label': `Export ${which}. Type 1:02.50 (minutes:seconds.hundredths) or 62.15 (seconds.frame) and press Enter`,
    });
    const commit = () => {
      const v = parseSeek(input.value);
      if (!Number.isFinite(v)) {
        toast('Type a time like 1:02.50 or 62.15 (second 62, frame 15).', 'error');
        input.value = clockTime(which === 'start' ? r.start : r.end);
        return;
      }
      if (!setExportSide(store, which, v)) input.value = clockTime(which === 'start' ? r.start : r.end);
    };
    input.addEventListener('change', commit);
    input.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), input.blur()));
    return input;
  };
  const hint = (t) => h('span', { class: 'muted tiny' }, `${secFrame(t)} (seconds.frame)`);
  const loop = h('input', { type: 'checkbox', checked: settings.rangeLoop !== false });
  loop.addEventListener('change', () => ((settings.rangeLoop = loop.checked), saveSettings(settings)));
  const playBtn = button(
    'Play export range',
    () => {
      const now = resolveRange(store.get());
      if (now.error) return toast(now.error, 'error');
      engine.playRegion(now.start, now.end, loop.checked);
    },
    { iconName: 'play', variant: 'sm', disabled: !!r.error, title: 'Preview just the part that will be exported' },
  );
  const status = r.error
    ? h('p', { class: 'warn-list', role: 'alert', 'data-testid': 'range-length' }, r.error)
    : h('p', { class: 'small', role: 'status', 'data-testid': 'range-length' }, r.whole ? `Exports the whole edit: ${clockTime(r.length)}.` : `Exports ${clockTime(r.length)} of the ${clockTime(p.duration)} edit (${clockTime(r.start)} to ${clockTime(r.end)}).`);
  return section(
    'Export range',
    h('p', { class: 'muted small' }, 'Choose where the exported video starts and ends. Video, sound, lyrics, layers and the end card all begin at the start you pick. Shortcuts: I sets the start, Shift+O the end, at the playhead.'),
    h(
      'div',
      { class: 'grid2 range-fields' },
      field('Start', box('start'), hint(r.start)),
      field('End', box('end'), hint(r.end)),
    ),
    h(
      'div',
      { class: 'row wrap' },
      button('Set start at playhead', () => setExportSide(store, 'start', engine.t), { variant: 'sm', title: 'I' }),
      button('Set end at playhead', () => setExportSide(store, 'end', engine.t), { variant: 'sm', title: 'Shift+O' }),
      button('Whole edit', () => {
        if (!r.set) return;
        store.update((d) => (d.exportRange = null));
      }, { variant: 'sm ghost', disabled: !r.set }),
    ),
    status,
    h('div', { class: 'row wrap' }, playBtn, h('label', { class: 'toggle' }, loop, h('span', {}, 'Loop'))),
  );
}
