// Which side panes each workspace shows, and focus mode (every side pane hidden so the preview and timeline fill the
// screen). Pure data: panes-ui.js applies it to the page and keeps it in the saved settings (pvm.settings.v1 → panes).
// The core areas (the preview, the timeline, the Manager's page) are never in these lists, so they can't be hidden.

export const PANES = {
  studio: [
    { id: 'tools', label: 'Tool panel', hint: 'Media, Audio, Lyrics, Text, Look, End card and the other tool tabs' },
    { id: 'inspector', label: 'Settings panel', hint: 'Settings of the selected clip, text, lyric line or layer' },
  ],
  photo: [
    { id: 'left', label: 'Add panel', hint: 'Photos, text, shapes and templates' },
    { id: 'right', label: 'Layer panel', hint: 'Layers and the selected layer’s style' },
  ],
  manager: [{ id: 'nav', label: 'Page list', hint: 'The artist picker and the list of Manager pages' }],
  tabstudio: [],
};

/** Workspaces with a preview to give the room to in focus mode. */
export const FOCUS_WORKSPACES = ['studio', 'photo'];

export const defaultLayout = () => Object.fromEntries(Object.keys(PANES).map((ws) => [ws, { hidden: [], focus: false }]));

/** A saved layout (or nothing, or junk from an older save) with every workspace filled in and unknown panes dropped. */
export function normalizeLayout(raw) {
  const out = defaultLayout();
  if (!raw || typeof raw !== 'object') return out;
  for (const ws of Object.keys(PANES)) {
    const r = raw[ws];
    if (!r || typeof r !== 'object') continue;
    const ids = PANES[ws].map((p) => p.id);
    out[ws].hidden = Array.isArray(r.hidden) ? [...new Set(r.hidden.filter((id) => ids.includes(id)))] : [];
    out[ws].focus = FOCUS_WORKSPACES.includes(ws) && r.focus === true;
  }
  return out;
}

const withWs = (layout, ws, fn) => {
  const next = normalizeLayout(layout);
  if (next[ws]) fn(next[ws]);
  return next;
};

/** Show or hide one pane (`on` undefined flips it). Showing a pane in focus mode leaves focus mode. */
export function setPane(layout, ws, id, on) {
  return withWs(layout, ws, (w) => {
    if (!PANES[ws].some((p) => p.id === id)) return;
    const shown = isShown(layout, ws, id);
    const want = on === undefined ? !shown : !!on;
    if (want === shown) return;
    if (want) {
      // showing a pane ends focus mode; the panes hidden before focus mode stay hidden
      w.focus = false;
      w.hidden = w.hidden.filter((x) => x !== id);
    } else w.hidden.push(id);
  });
}

/** Focus mode on or off (`on` undefined flips it). The pane choices from before are kept for when it ends. */
export function setFocus(layout, ws, on) {
  return withWs(layout, ws, (w) => {
    if (!FOCUS_WORKSPACES.includes(ws)) return;
    w.focus = on === undefined ? !w.focus : !!on;
  });
}

/** Every pane shown again and focus mode off, for one workspace. */
export const resetLayout = (layout, ws) => withWs(layout, ws, (w) => ((w.hidden = []), (w.focus = false)));

export function isShown(layout, ws, id) {
  const w = normalizeLayout(layout)[ws];
  return !!w && !w.focus && !w.hidden.includes(id);
}

/** The panes shown in `ws`: { [paneId]: true|false }. */
export const shownPanes = (layout, ws) => Object.fromEntries((PANES[ws] || []).map((p) => [p.id, isShown(layout, ws, p.id)]));

export function isDefaultLayout(layout, ws) {
  const w = normalizeLayout(layout)[ws];
  return !w || (!w.focus && !w.hidden.length);
}

/**
 * The top-most open layer that Esc should close: the last one opened that is still open. A native modal <dialog>
 * always wins (the browser gives it the key), so `layers` lists only the others. Each is { open(): boolean }.
 */
export function topLayer(layers) {
  for (let i = layers.length - 1; i >= 0; i--) if (layers[i].open()) return layers[i];
  return null;
}
