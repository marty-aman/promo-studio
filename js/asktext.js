// A small in-app "type a name" box, used instead of window.prompt(): the Mac app (Electron) has no prompt() (it
// throws "prompt() is not supported"), and a browser's own prompt box looks out of place. Enter or Save keeps what
// was typed, Esc, Cancel, the x and a backdrop tap cancel. Focus stays in the box. On a phone it is a bottom sheet.
import { h, button } from './dom.js';
import { guardDialog } from './closeable.js';

export const NAME_MAX = 120;

/** What the typed text becomes: trimmed and cut to `max`; nothing typed falls back to `fallback` (the default). */
export function textOrDefault(typed, fallback = '', max = NAME_MAX) {
  const clean = (v) => String(v ?? '').trim().slice(0, max);
  return clean(typed) || clean(fallback);
}

/** The element Tab should move to from `active` inside `items` (wraps at both ends; outside goes to the first). */
export function nextFocus(items, active, back = false) {
  if (!items.length) return null;
  const i = items.indexOf(active);
  if (i < 0) return back ? items[items.length - 1] : items[0];
  return items[(i + (back ? -1 : 1) + items.length) % items.length];
}

/**
 * Ask for one line of text. Resolves the text (see textOrDefault; `value` is the default) on Enter or Save, and
 * null when cancelled, so a caller saves nothing then. opts: { hint, okText, max, fallback }.
 */
export function askText(title, value = '', { hint = '', okText = 'Save', max = NAME_MAX, fallback = value } = {}) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'ask-dialog', 'aria-label': title });
    const input = h('input', { type: 'text', value: value || '', maxlength: max, 'aria-label': title, autocomplete: 'off', enterkeyhint: 'done' });
    let answered = false;
    const done = (v) => {
      if (answered) return;
      answered = true;
      dlg.close();
      dlg.remove();
      resolve(v);
    };
    const form = h(
      'form',
      { class: 'ask-form' },
      h('div', { class: 'projects-head' }, h('h2', {}, title), button('', () => requestClose(), { iconName: 'x', variant: 'ghost', title: 'Cancel' })),
      hint ? h('p', { class: 'muted small ask-hint' }, hint) : null,
      input,
      h('div', { class: 'row ask-btns' }, button('Cancel', () => requestClose(), { variant: 'ghost' }), h('button', { type: 'submit', class: 'btn primary' }, okText)),
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      done(textOrDefault(input.value, fallback, max));
    });
    // Tab and Shift+Tab go round the box's own controls
    dlg.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const items = [...dlg.querySelectorAll('input, button')].filter((x) => !x.disabled && x.offsetParent !== null);
      const to = nextFocus(items, document.activeElement, e.shiftKey);
      if (to) {
        e.preventDefault();
        to.focus();
      }
    });
    dlg.append(form);
    // the shared close: Esc, the x and a backdrop tap cancel straight away (there is only the one field)
    const requestClose = guardDialog(dlg, () => done(null), { askFirst: false });
    document.body.append(dlg);
    dlg.showModal();
    input.focus();
    input.select();
  });
}
