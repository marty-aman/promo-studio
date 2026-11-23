// Frame-quality UI: "Blurry" / "Shaky" / "Dark" badges on library items, footage thumbnails and timeline clips,
// the bad stretches in the clip settings, a "Hide weak takes" filter, and "Start from the best moment".
import { h, button, section } from './dom.js';
import { formatTime } from './core.js';
import { qualityOf, summarize, weakStretches, scoreRange, bestStart, hideWeak } from './framequality.js';



const HIDE_KEY = 'pvm.hideWeakTakes';
const FLAG_CLASS = { Blurry: 'blurry', Shaky: 'shaky', Dark: 'dark', Overexposed: 'bright' };

/** Show or hide every item that was marked weak (items carry data-weak while their take is weak). */
function applyHide() {
  const on = hideWeak();
  document.querySelectorAll('[data-weak="1"]').forEach((el) => (el.hidden = on));
}

/**
 * A small badge row for one library item or footage clip ("Blurry", "Shaky", "Dark"). It starts the analysis,
 * fills itself in when it lands, and marks the closest item `.media-item` / `.mgr-clip` as weak for the filter.
 */
export function qualityBadges(rec) {
  const box = h('span', { class: 'q-badges' });
  if (!rec || rec.kind !== 'video') return box;
  const fill = () => {
    box.replaceChildren();
    const q = rec.quality;
    const item = box.closest('.media-item, .mgr-clip');
    if (!q) {
      if (rec.quality === undefined) box.append(h('span', { class: 'q-badge q-wait', title: 'Checking sharpness and shake in the background' }, '…'));
      return;
    }
    const s = summarize(q);
    for (const f of s.flags) box.append(h('span', { class: `q-badge q-${FLAG_CLASS[f]}`, title: `${f} in ${Math.round((s.weak || 0) * 100)}% of this clip` }, f));
    if (item) {
      if (s.weak > 0.5) item.dataset.weak = '1';
      else delete item.dataset.weak;
      item.hidden = hideWeak() && s.weak > 0.5;
    }
  };
  const on = (e) => {
    if (!box.isConnected && box.dataset.seen) return window.removeEventListener('pvm-quality', on);
    if (e.detail && e.detail.id === rec.id) fill();
  };
  window.addEventListener('pvm-quality', on);
  qualityOf(rec);
  queueMicrotask(() => {
    box.dataset.seen = '1';
    fill();
  });
  return box;
}

/** A "Hide weak takes" checkbox. Flipping it hides or shows every item marked weak, without a re-render. */
export function weakToggle() {
  const cb = h('input', { type: 'checkbox', checked: hideWeak() });
  cb.addEventListener('change', () => {
    try {
      localStorage.setItem(HIDE_KEY, cb.checked ? '1' : '0');
    } catch {
      /* not kept */
    }
    applyHide();
  });
  return h('label', { class: 'toggle q-hide', title: 'Hide takes that are mostly blurry, shaky, too dark or overexposed' }, cb, h('span', {}, 'Hide weak takes'));
}

const FLAG_LABEL = { blurry: 'Blurry', shaky: 'Shaky', dark: 'Dark', bright: 'Overexposed' };
const span = (a, b) => `${formatTime(a, false)}–${formatTime(b, false)}`;

/**
 * Timeline clip block: the weak stretches inside the part of the file this clip plays, as coloured strips along
 * the bottom, and small flag chips. `redraw` must be the same function every time (it is the "analysis landed" callback).
 */
export function qualityMarks(el, rec, clip, widthPx, redraw) {
  if (!rec || rec.kind !== 'video') return;
  const q = qualityOf(rec, redraw);
  if (!q) return;
  const sp = clip.speed || 1;
  const a = clip.in || 0;
  const b = a + clip.duration * sp;
  const wrap = h('div', { class: 'q-marks', 'aria-hidden': 'true' });
  const seen = new Set();
  for (const w of weakStretches(q)) {
    if (w.to <= a || w.from >= b) continue;
    const l = ((Math.max(w.from, a) - a) / (b - a)) * widthPx;
    const r = ((Math.min(w.to, b) - a) / (b - a)) * widthPx;
    wrap.append(h('div', { class: `q-strip q-${w.flags[0]}`, style: { left: `${l}px`, width: `${Math.max(2, r - l)}px` }, title: `${w.flags.map((f) => FLAG_LABEL[f]).join(', ')} ${span(w.from, w.to)}` }));
    w.flags.forEach((f) => seen.add(f));
  }
  if (!seen.size) return;
  wrap.append(h('span', { class: 'q-chips' }, [...seen].map((f) => h('span', { class: `q-badge q-${f}` }, FLAG_LABEL[f]))));
  el.append(wrap);
}

/**
 * Clip inspector section "Take quality": the weak stretches of the file, which of them this clip plays, and a button
 * that moves the clip's start to the best stretch of the file. `setStart(seconds)` changes the clip's in-point.
 */
export function qualitySection({ rec, clip, setStart }) {
  const box = h('div', {});
  const out = section('Take quality', box);
  const fill = () => {
    box.replaceChildren();
    const q = rec.quality;
    if (q === undefined) return box.append(h('p', { class: 'muted small' }, 'Checking sharpness and shake in the background…'));
    if (!q) return box.append(h('p', { class: 'muted small' }, 'Could not read this video’s frames, so there is no quality check.'));
    const sp = clip.speed || 1;
    const a = clip.in || 0;
    const b = a + clip.duration * sp;
    const mine = scoreRange(q, a, b);
    const all = summarize(q);
    const strip = h('div', { class: 'q-timeline', role: 'img', 'aria-label': 'The whole file, with weak stretches marked' });
    const D = q.duration || rec.duration || 1;
    for (const w of weakStretches(q)) strip.append(h('div', { class: `q-strip q-${w.flags[0]}`, style: { left: `${(w.from / D) * 100}%`, width: `${Math.max(0.8, ((w.to - w.from) / D) * 100)}%` }, title: `${w.flags.map((f) => FLAG_LABEL[f]).join(', ')} ${span(w.from, w.to)}` }));
    strip.append(h('div', { class: 'q-used', style: { left: `${(a / D) * 100}%`, width: `${Math.max(0.8, ((b - a) / D) * 100)}%` }, title: 'The part this clip plays' }));
    box.append(
      h('p', { class: 'small' }, mine.flags.length ? ['This clip’s part: ', ...mine.flags.map((f) => h('span', { class: `q-badge q-${f}` }, FLAG_LABEL[f]))] : 'This clip’s part looks sharp, steady and well exposed.'),
      strip,
      weakStretches(q).length
        ? h('ul', { class: 'q-list small' }, weakStretches(q).slice(0, 6).map((w) => h('li', {}, `${w.flags.map((f) => FLAG_LABEL[f]).join(' + ')} ${span(w.from, w.to)}${w.to > a && w.from < b ? ' (in this clip)' : ''}`)))
        : h('p', { class: 'muted tiny' }, 'No weak stretches in the whole file.'),
      h('p', { class: 'muted tiny' }, `Whole file: ${all.weak ? Math.round(all.weak * 100) : 0}% of the sampled frames have a problem.`),
      button('Start from the best moment', () => setStart(bestStart(q, clip.duration * sp, rec.duration || D)), { iconName: 'star', variant: 'sm', title: 'Move this clip to the sharpest, steadiest, best exposed stretch of the file' }),
    );
  };
  const on = (e) => {
    if (!out.isConnected && out.dataset.seen) return window.removeEventListener('pvm-quality', on);
    if (e.detail && e.detail.id === rec.id) fill();
  };
  window.addEventListener('pvm-quality', on);
  qualityOf(rec);
  queueMicrotask(() => {
    out.dataset.seen = '1';
  });
  fill();
  return out;
}
