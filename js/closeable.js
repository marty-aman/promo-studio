// Closing what is on screen, the same way everywhere:
// - Esc closes the top-most thing: an open modal <dialog> first (the browser hands it the key), else the last opened
//   pop-over, menu or sheet that registered with escLayer(). One press closes one thing.
// - Modal dialogs (guardDialog) get a close (x) button if they have none, close on a backdrop click only while
//   nothing typed in them would be lost, and ask before Esc or x throws away what was typed.
// - Focus goes back to the button that opened the thing.
import { iconButton, toast } from './dom.js';
import { topLayer } from './panes.js';

const layers = [];
const TYPING = /^(INPUT|TEXTAREA|SELECT)$/;

/**
 * Register something Esc should close. isOpen() says whether it is on screen, close() closes it. Call
 * layer.opened() each time it opens (it becomes the top-most and remembers the focused element to return to).
 */
export function escLayer(isOpen, close) {
  const L = {
    open: isOpen,
    opener: null,
    opened() {
      const i = layers.indexOf(L);
      if (i >= 0) layers.splice(i, 1);
      layers.push(L);
      const a = document.activeElement;
      L.opener = a && a !== document.body ? a : null;
    },
    /** Close it from code or its own x button, sending focus back to the opener when focus was inside it. */
    close(returnFocus = true) {
      close();
      if (returnFocus) restoreFocus(L.opener);
    },
  };
  layers.push(L);
  return L;
}

export function restoreFocus(el) {
  if (el && el.isConnected && typeof el.focus === 'function' && !el.closest('[hidden]')) {
    try {
      el.focus({ preventScroll: true });
    } catch {
      /* not focusable any more */
    }
  }
}

// one listener ahead of every other Esc handler (window, capture), so a press closes only the top-most thing
if (typeof window !== 'undefined')
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('dialog[open]')) return; // the dialog's own cancel event handles it
      if (e.target && TYPING.test(e.target.tagName || '') && !(e.target.type === 'range' || e.target.type === 'checkbox')) return;
      const top = topLayer(layers);
      if (!top) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      top.close();
    },
    true,
  );

/** True when a text field in `root` holds something other than what it held when first focused (unsaved typing). */
function typedIn(root, start) {
  for (const [el, v] of start) if (el.isConnected && root.contains(el) && el.value !== v) return true;
  return false;
}

/**
 * Make a modal dialog close the shared way. `close` removes it (the dialog's own close). Returns requestClose(),
 * which asks first when something typed would be lost; use it for the dialog's own x and Cancel buttons.
 * opts.confirmText overrides the question.
 */
export function guardDialog(dlg, close, { confirmText = 'Close this window? What you typed here is not saved yet.' } = {}) {
  const opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
  const start = new Map(); // each text field's value when first focused
  dlg.addEventListener('focusin', (e) => {
    const t = e.target;
    if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName) && !/^(checkbox|radio|range|button|submit|file|color)$/.test(t.type) && !start.has(t)) start.set(t, t.value);
  });
  const dirty = () => typedIn(dlg, start);
  const finish = () => {
    close();
    restoreFocus(opener);
  };
  const requestClose = () => {
    if (dirty() && !window.confirm(confirmText)) return false;
    finish();
    return true;
  };
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    requestClose();
  });
  // a press on the backdrop (outside the dialog box) closes it, unless typing would be lost
  dlg.addEventListener('click', (e) => {
    if (e.target !== dlg) return;
    const r = dlg.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (inside) return;
    if (dirty()) return toast('You have typed something here. Close with the × button (it asks first) or finish first.');
    finish();
  });
  // every dialog has a visible close button with a name
  let x = dlg.querySelector('.dlg-x, button[aria-label^="Close"], button[title="Close"], button[title="Cancel"]');
  if (!x) {
    x = iconButton('x', 'Close', () => requestClose(), 'ghost dlg-x dlg-x-float');
    dlg.prepend(x);
  } else {
    x.classList.add('dlg-x');
    if (!x.getAttribute('aria-label')) x.setAttribute('aria-label', x.title || 'Close');
  }
  return requestClose;
}

/** A small "x" for a banner or notice. */
export const closeX = (label, onClick) => iconButton('x', label, onClick, 'ghost dlg-x');

/**
 * Swipe down on `handle` (a sheet's title bar) to close the sheet: a downward drag of 60 px or more that is mostly
 * vertical. Taps and sideways drags are left alone, so the bar's own buttons keep working.
 */
export function swipeDownToClose(handle, close) {
  let start = null;
  handle.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button,input,select,a')) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  const end = (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    if (dy >= 60 && Math.abs(dx) < dy * 0.7) close();
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', () => (start = null));
  handle.style.touchAction = 'none';
}
