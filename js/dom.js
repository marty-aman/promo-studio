// Tiny DOM helpers, icons and store-bound form controls.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  appendAll(el, children);
  return el;
}

function appendAll(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

// Stroke icons (24x24, 2px), drawn in the style of the Lucide set.
const ICONS = {
  film: 'M3 3h18v18H3zM7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4',
  search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM21 21l-4.3-4.3',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM19 11a7 7 0 0 1-14 0M12 18v3',
  music: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  type: 'M4 7V4h16v3M9 20h6M12 4v16',
  disc: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
  palette: 'M12 2a10 10 0 1 0 0 20c1 0 1.7-.8 1.7-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.8-1.7 1.7-1.7H16a6 6 0 0 0 6-6C22 6 17.5 2 12 2zM7.5 11.5h.01M10.5 7.5h.01M15.5 7.5h.01',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h4v16H7zM14 4h4v16h-4z',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3',
  scissors: 'M6 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM6 15a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15',
  plus: 'M12 5v14M5 12h14',
  upload: 'M12 21V9M7 14l5-5 5 5M5 3h14',
  skipBack: 'M19 20L9 12l10-8zM5 19V5',
  skipFwd: 'M5 4l10 8-10 8zM19 5v14',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  magnet: 'M6 15V7a6 6 0 0 1 12 0v8M6 11h4M14 11h4M6 15a6 6 0 0 0 12 0',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  image: 'M3 3h18v18H3zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
  wand: 'M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5',
  hand: 'M12 3v10M8 6v8M16 6v7M20 10v4a8 8 0 0 1-16 0v-2',
  x: 'M18 6L6 18M6 6l12 12',
  check: 'M20 6L9 17l-5-5',
  settings: 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  zoomIn: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM21 21l-4.3-4.3M11 8v6M8 11h6',
  zoomOut: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM21 21l-4.3-4.3M8 11h6',
  arrowLeft: 'M19 12H5M12 19l-7-7 7-7',
  arrowRight: 'M5 12h14M12 5l7 7-7 7',
  file: 'M14 3H6v18h12V7zM14 3v4h4',
  eyeOff: 'M9.9 4.2A10 10 0 0 1 12 4c7 0 11 8 11 8a18 18 0 0 1-2.2 3.2M6.6 6.6A17.6 17.6 0 0 0 1 12s4 8 11 8a10 10 0 0 0 5.4-1.6M2 2l20 20M9.9 9.9a3 3 0 0 0 4.2 4.2',
  mute: 'M11 5L6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6',
  layers: 'M12 2l10 5-10 5L2 7zM2 12l10 5 10-5M2 17l10 5 10-5',
  arrowUp: 'M12 19V5M5 12l7-7 7 7',
  arrowDown: 'M12 5v14M19 12l-7 7-7-7',
  volume: 'M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14',
  layout: 'M3 3h18v18H3zM3 9h18M9 21V9',
  stop: 'M6 6h12v12H6z',
  guitar: 'M19 2l3 3-4.5 4.5M17.5 6.5l-6 6M11 9c-2-1-4.5-.5-5.5 1.5-.7 1.4-.3 2.3-1.5 3.5-1.6 1.6-1.4 4.5.5 6.5s4.9 2.1 6.5.5c1.2-1.2 2.1-.8 3.5-1.5 2-1 2.5-3.5 1.5-5.5M8 16h.01',
  share: 'M4 12v8h16v-8M12 3v13M7 8l5-5 5 5',
  youtube: 'M2.5 7.5a3 3 0 0 1 2.1-2.1C6.5 5 12 5 12 5s5.5 0 7.4.4a3 3 0 0 1 2.1 2.1c.5 1.9.5 4.5.5 4.5s0 2.6-.5 4.5a3 3 0 0 1-2.1 2.1C17.5 19 12 19 12 19s-5.5 0-7.4-.4a3 3 0 0 1-2.1-2.1C2 14.6 2 12 2 12s0-2.6.5-4.5zM10 15l5-3-5-3z',
};

export function icon(name, size = 18) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[name] || '');
  svg.append(path);
  return svg;
}

export function button(label, onClick, { iconName, variant = '', title, disabled } = {}) {
  return h(
    'button',
    { type: 'button', class: `btn ${variant}`.trim(), onclick: onClick, title: title || null, disabled: !!disabled },
    iconName ? icon(iconName, 16) : null,
    label ? h('span', {}, label) : null,
  );
}

export function iconButton(iconName, title, onClick, variant = '') {
  return h('button', { type: 'button', class: `icon-btn ${variant}`.trim(), title, 'aria-label': title, onclick: onClick }, icon(iconName, 18));
}

let toastTimer = null;
export function toast(msg, kind = 'info', ms = 3200) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = msg;
  el.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ''), ms);
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function pickFiles(accept, multiple = true) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, multiple });
    input.addEventListener('change', () => resolve([...input.files]));
    input.click();
  });
}

// ------------------------------------------------------------ bound controls

/**
 * A Binder ties form controls to the store. Panels are rebuilt only when their
 * structure changes; on every other change `refresh()` pulls fresh values into
 * the controls that do not have focus, so typing is never interrupted.
 */
export class Binder {
  constructor(store) {
    this.store = store;
    this.refreshers = [];
  }
  refresh() {
    const p = this.store.get();
    for (const r of this.refreshers) r(p);
  }
  _reg(fn) {
    this.refreshers.push(fn);
    fn(this.store.get());
  }
  _set(set, key) {
    return (v) => this.store.update((d) => set(d, v), key);
  }

  range(label, get, set, { min = 0, max = 1, step = 0.01, fmt = (v) => v, key } = {}) {
    const k = key || `range:${label}:${Math.random()}`;
    const out = h('output', { class: 'val' });
    const input = h('input', { type: 'range', min, max, step });
    const write = this._set(set, k);
    input.addEventListener('input', () => {
      write(parseFloat(input.value));
      out.textContent = fmt(parseFloat(input.value));
    });
    this._reg((p) => {
      const v = get(p);
      if (v == null) return;
      if (document.activeElement !== input) input.value = v;
      out.textContent = fmt(v);
    });
    return field(label, h('div', { class: 'range-row' }, input, out));
  }

  number(label, get, set, { min, max, step = 0.01, key, suffix } = {}) {
    const k = key || `num:${label}:${Math.random()}`;
    const input = h('input', { type: 'number', min, max, step, class: 'num' });
    const write = this._set(set, k);
    input.addEventListener('change', () => {
      let v = parseFloat(input.value);
      if (isNaN(v)) return;
      if (min != null) v = Math.max(min, v);
      if (max != null) v = Math.min(max, v);
      write(v);
    });
    this._reg((p) => {
      const v = get(p);
      if (document.activeElement !== input && v != null) input.value = +(+v).toFixed(3);
    });
    return field(label, suffix ? h('div', { class: 'inline' }, input, h('span', { class: 'muted' }, suffix)) : input);
  }

  color(label, get, set, key) {
    const k = key || `color:${label}:${Math.random()}`;
    const input = h('input', { type: 'color' });
    const write = this._set(set, k);
    input.addEventListener('input', () => write(input.value));
    this._reg((p) => {
      if (document.activeElement !== input) input.value = get(p) || '#000000';
    });
    return field(label, input);
  }

  select(label, get, set, options) {
    const sel = h(
      'select',
      {},
      options.map(([v, l]) => h('option', { value: v }, l)),
    );
    const write = this._set(set, null);
    sel.addEventListener('change', () => write(sel.value));
    this._reg((p) => {
      const v = get(p);
      if (document.activeElement !== sel) sel.value = v == null ? '' : String(v);
    });
    return field(label, sel);
  }

  text(label, get, set, { placeholder = '', multiline = false, rows = 3, key } = {}) {
    const k = key || `text:${label}:${Math.random()}`;
    const input = multiline ? h('textarea', { rows, placeholder }) : h('input', { type: 'text', placeholder });
    const write = this._set(set, k);
    input.addEventListener('input', () => write(input.value));
    this._reg((p) => {
      if (document.activeElement !== input) input.value = get(p) ?? '';
    });
    return label ? field(label, input) : input;
  }

  toggle(label, get, set) {
    const input = h('input', { type: 'checkbox' });
    const write = this._set(set, null);
    input.addEventListener('change', () => write(input.checked));
    this._reg((p) => {
      input.checked = !!get(p);
    });
    return h('label', { class: 'toggle' }, input, h('span', {}, label));
  }

  segmented(label, get, set, options) {
    const wrap = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
    const write = this._set(set, null);
    const btns = options.map(([v, l]) => {
      const b = h('button', { type: 'button', role: 'radio', onclick: () => write(v) }, l);
      b.dataset.value = v;
      wrap.append(b);
      return b;
    });
    this._reg((p) => {
      const cur = String(get(p));
      btns.forEach((b) => {
        const on = b.dataset.value === cur;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    });
    return field(label, wrap);
  }
}

let fieldId = 0;
export function field(label, control, hint) {
  let target = control;
  if (!/^(INPUT|SELECT|TEXTAREA)$/.test(control.tagName)) target = control.querySelector('input,select,textarea');
  let forId = null;
  if (label && target && !control.matches('.seg')) {
    fieldId += 1;
    target.id = target.id || `f${fieldId}`;
    forId = target.id;
  }
  return h(
    'div',
    { class: 'field' },
    label ? h('label', { class: 'lbl', for: forId }, label) : null,
    control,
    hint ? h('div', { class: 'hint' }, hint) : null,
  );
}

export function section(title, ...children) {
  return h('section', { class: 'sect' }, title ? h('h3', {}, title) : null, ...children);
}
