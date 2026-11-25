// The Panes menu in the top bar, the hide (x) button on each side pane and focus mode (F). The layout is kept per
// workspace in the saved settings (pvm.settings.v1 → panes); an old save without it opens with every pane shown.
// Desktop only: on a phone or tablet (body.m-sheets) the side panes are sheets with their own close button, and
// every rule in css that hides a pane is scoped to body:not(.m-sheets).
import { h, icon, iconButton, button, toast } from './dom.js';
import { PANES, FOCUS_WORKSPACES, normalizeLayout, setPane, setFocus, resetLayout, isShown, isDefaultLayout } from './panes.js';
import { loadSettings, saveSettings } from './state.js';
import { escLayer } from './closeable.js';

let layout = normalizeLayout(loadSettings().panes);
let getMode = () => 'studio';
let menuEl = null;
let menuBtn = null;
const focusExits = [];
let menuLayer = null;
const listeners = new Set();

const ALL_CLASSES = () => [...Object.values(PANES).flat().map((p) => `pane-off-${p.id}`), 'focus-mode'];

function save() {
  const s = loadSettings();
  s.panes = layout;
  saveSettings(s);
}

/** Put the current workspace's layout on <body>, the x buttons and the menu. */
function apply() {
  const ws = getMode();
  const body = document.body;
  body.classList.remove(...ALL_CLASSES());
  for (const p of PANES[ws] || []) if (!isShown(layout, ws, p.id)) body.classList.add(`pane-off-${p.id}`);
  const focus = !!(layout[ws] && layout[ws].focus);
  body.classList.toggle('focus-mode', focus);
  for (const b of focusExits) b.hidden = !focus;
  if (menuBtn) {
    menuBtn.classList.toggle('on', !isDefaultLayout(layout, ws));
    menuBtn.parentNode.hidden = !(PANES[ws] || []).length;
  }
  if (menuEl && !menuEl.hidden) renderMenu();
  for (const fn of listeners) fn(ws);
}

function change(next, msg) {
  layout = next;
  save();
  apply();
  if (msg) toast(msg);
}

const label = (ws, id) => ((PANES[ws] || []).find((p) => p.id === id) || {}).label || id;

export const panes = {
  /** Show (on true), hide (false) or flip (undefined) a side pane of workspace `ws`. */
  set(ws, id, on) {
    const was = isShown(layout, ws, id);
    const next = setPane(layout, ws, id, on);
    if (isShown(next, ws, id) === was) return;
    change(next, was ? `${label(ws, id)} hidden. Bring it back from Panes in the top bar.` : null);
  },
  shown: (ws, id) => isShown(layout, ws, id),
  focus(on) {
    const ws = getMode();
    if (!FOCUS_WORKSPACES.includes(ws)) return;
    const next = setFocus(layout, ws, on);
    if (next[ws].focus === layout[ws].focus) return;
    change(next, next[ws].focus ? 'Focus mode: the side panes are hidden. Press F or Exit focus to bring them back.' : null);
  },
  reset() {
    change(resetLayout(layout, getMode()), 'Default layout restored.');
  },
  /** Called with the workspace id after every layout change (to re-fit a preview, for example). */
  onChange(fn) {
    listeners.add(fn);
  },
  get layout() {
    return layout;
  },
  refresh: () => apply(),
};

/** The hide (x) button at the top of a side pane. Rebuilt with the pane's content. */
export function paneX(ws, id) {
  return h('button', { type: 'button', class: 'icon-btn ghost pane-x', title: `Hide the ${label(ws, id).toLowerCase()} (bring it back from Panes)`, 'aria-label': `Hide the ${label(ws, id).toLowerCase()}`, onclick: () => (panes.set(ws, id, false), menuBtn && menuBtn.focus()) }, icon('x', 16));
}

function setMenu(open) {
  if (!menuEl) return;
  if (open) {
    menuLayer.opened();
    menuEl.hidden = false;
    renderMenu();
    menuBtn.setAttribute('aria-expanded', 'true');
    const first = menuEl.querySelector('[role^="menuitem"]');
    if (first) first.focus();
  } else {
    menuEl.hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');
  }
}

function renderMenu() {
  const ws = getMode();
  const item = (text, checked, onclick, hint, key) =>
    h('button', { type: 'button', role: 'menuitemcheckbox', class: 'panes-item', 'aria-checked': checked ? 'true' : 'false', title: hint || null, onclick },
      h('span', { class: 'panes-check', 'aria-hidden': 'true' }, checked ? icon('check', 14) : null), h('span', {}, text), key ? h('kbd', {}, key) : null);
  const list = PANES[ws] || [];
  menuEl.replaceChildren(
    h('div', { class: 'panes-head' }, h('strong', { id: 'panes-title' }, 'Panes'), iconButton('x', 'Close the Panes menu', () => menuLayer.close(), 'ghost')),
    ...list.map((p) => item(p.label, isShown(layout, ws, p.id), () => panes.set(ws, p.id), p.hint)),
    FOCUS_WORKSPACES.includes(ws) ? h('div', { class: 'panes-sep', role: 'separator' }) : null,
    FOCUS_WORKSPACES.includes(ws) ? item('Focus mode', layout[ws].focus, () => panes.focus(), 'Hide every side pane so the preview fills the screen', 'F') : null,
    h('div', { class: 'panes-sep', role: 'separator' }),
    h('button', { type: 'button', role: 'menuitem', class: 'panes-item', disabled: isDefaultLayout(layout, ws), onclick: () => panes.reset() }, h('span', { class: 'panes-check' }), h('span', {}, 'Restore the default layout')),
  );
  menuKeys();
}

function menuKeys() {
  if (menuEl._keys) return;
  menuEl._keys = true;
  menuEl.addEventListener('keydown', (e) => {
    const items = [...menuEl.querySelectorAll('[role^="menuitem"]:not([disabled])')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = items.length;
      if (n) items[(i + (e.key === 'ArrowDown' ? 1 : n - 1) + n) % n].focus();
    } else if (e.key === 'Tab') setMenu(false);
  });
}

/** Put an "Exit focus" button (shown only in focus mode) into `host`, a positioned preview area. */
export function focusExitInto(host) {
  const b = button('Exit focus', () => panes.focus(false), { iconName: 'x', variant: 'sm focus-exit', title: 'Bring the side panes back (F)' });
  b.hidden = !document.body.classList.contains('focus-mode');
  host.append(b);
  focusExits.push(b);
}

/**
 * Build the Panes button (returned, for the top bar) and the focus-mode exit buttons (one into each of `focusHosts`).
 * mode() is the current workspace. Re-applies on every workspace switch through panes.refresh().
 */
export function initPanes({ mode, focusHosts = [] }) {
  getMode = mode;
  menuBtn = h('button', { type: 'button', class: 'btn ghost panes-btn', 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: 'Show or hide the side panes, focus mode (F), restore the default layout', onclick: () => setMenu(menuEl.hidden) }, icon('grid', 16), h('span', {}, 'Panes'));
  menuEl = h('div', { class: 'panes-menu', role: 'menu', 'aria-labelledby': 'panes-title', hidden: true });
  menuLayer = escLayer(() => !menuEl.hidden, () => setMenu(false));
  const wrap = h('div', { class: 'panes-wrap' }, menuBtn, menuEl);
  document.addEventListener('pointerdown', (e) => !menuEl.hidden && !wrap.contains(e.target) && setMenu(false), true);
  for (const host of focusHosts) focusExitInto(host);
  // F flips focus mode in the Video and Photo Studio (not while typing, not with Ctrl/Alt/Cmd)
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || (e.key !== 'f' && e.key !== 'F')) return;
    const t = e.target;
    if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    if (document.querySelector('dialog[open]') || document.body.classList.contains('m-sheets')) return;
    if (!FOCUS_WORKSPACES.includes(getMode())) return;
    e.preventDefault();
    panes.focus();
  });
  return wrap; // the first panes.refresh() (from the workspace switch) applies the saved layout
}
