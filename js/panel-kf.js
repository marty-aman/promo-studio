// Keyframe controls: a slider with a ◆ next to it (add / remove a keyframe at the playhead), an
// "Animate" section per item, and the keyframe list with easing. The timeline draws the same
// keyframes as diamonds under the selected block (timeline.js).
import { h, icon, button, iconButton, section } from './dom.js';
import { layoutClips, songToTimeline, formatTime, clamp } from './core.js';
import { findClip } from './state.js';
import { KF_PROPS, EASES, KEY_EPS, propInfo, isKeyed, keyAt, valueAt, getPath, setPath, setKey, removeKey, clearKeys, allKeys } from './keyframes.js';

/**
 * What the selection points at, for keyframing: { kind, id, start (timeline s), dur, item, find(draft) }.
 * Keyframe times are seconds from `start`; the playhead's local time is engine.t − start.
 */
export function kfTarget(p, sel) {
  if (!sel) return null;
  if (sel.type === 'clip') {
    const f = findClip(p, sel.id);
    if (!f.clip) return null;
    const start = f.layer ? f.clip.start : (layoutClips(p.clips).find((l) => l.clip.id === sel.id) || {}).start;
    return { kind: 'clip', id: sel.id, start: start || 0, dur: f.clip.duration, item: f.clip, find: (d) => findClip(d, sel.id).clip };
  }
  if (sel.type === 'text') {
    const tx = (p.texts || []).find((x) => x.id === sel.id);
    return tx && { kind: 'text', id: sel.id, start: tx.start, dur: tx.end - tx.start, item: tx, find: (d) => d.texts.find((x) => x.id === sel.id) };
  }
  if (sel.type === 'lyric') {
    const l = (p.lyrics || []).find((x) => x.id === sel.id);
    return l && { kind: 'lyric', id: sel.id, start: songToTimeline(l.start, p.song), dur: l.end - l.start, item: l, find: (d) => d.lyrics.find((x) => x.id === sel.id) };
  }
  if (sel.type === 'layer') {
    const L = (p.layers || []).find((x) => x.id === sel.id);
    if (!L) return null;
    const start = L.start || 0;
    const ecStart = p.endCard && p.endCard.enabled ? p.duration - p.endCard.duration : p.duration;
    return { kind: L.type === 'viz' ? 'viz' : 'layer', id: sel.id, start, dur: Math.max(0.1, (L.end ?? ecStart) - start), item: L, find: (d) => d.layers.find((x) => x.id === sel.id) };
  }
  return null;
}

export function createKeyframeUI({ store, engine }) {
  const now = (tg) => engine.t - tg.start;
  const inside = (tg, t) => t >= -KEY_EPS && t <= tg.dur + KEY_EPS;
  const fresh = (sel) => kfTarget(store.get(), sel);

  /**
   * A slider for `path` with a keyframe diamond. sel: the selection ({ type, id }).
   * o: { label, min, max, step, fmt, def, write(item, v) for un-keyed edits }
   */
  function range(b, sel, path, o = {}) {
    const tg0 = fresh(sel);
    const info = propInfo(tg0 ? tg0.kind : 'clip', path) || [];
    const label = o.label ?? info[1] ?? path;
    const min = o.min ?? info[2] ?? 0;
    const max = o.max ?? info[3] ?? 1;
    const step = o.step ?? info[4] ?? 0.01;
    const def = o.def ?? info[5] ?? 0;
    const fmt = o.fmt ?? info[6] ?? ((v) => String(v));
    const input = h('input', { type: 'range', min, max, step, 'aria-label': label });
    const out = h('output', { class: 'val' });
    const dia = h('button', { type: 'button', class: 'kf-dia', 'aria-label': `Keyframe ${label}` }, h('span', { 'aria-hidden': 'true' }));
    const ckey = `kf:${sel.id}:${path}`;
    const valueNow = (tg) => {
      if (!tg) return def;
      const t = clamp(now(tg), 0, tg.dur);
      return isKeyed(tg.item, path) ? valueAt(tg.item.keys[path], t) : getPath(tg.item, path) ?? def;
    };
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      out.textContent = fmt(v);
      store.update((d) => {
        const tg = kfTarget(d, sel);
        const it = tg && tg.find(d);
        if (!it) return;
        const t = now(tg);
        if (isKeyed(it, path)) {
          if (inside(tg, t)) setKey(it, path, clamp(t, 0, tg.dur), v);
        } else if (o.write) o.write(it, v);
        else setPath(it, path, v);
      }, ckey);
    });
    dia.addEventListener('click', () => {
      store.update((d) => {
        const tg = kfTarget(d, sel);
        const it = tg && tg.find(d);
        if (!it) return;
        const t = now(tg);
        if (!inside(tg, t)) return;
        const tt = clamp(t, 0, tg.dur);
        if (keyAt(it, path, tt)) removeKey(it, path, tt);
        else setKey(it, path, tt, valueNow({ ...tg, item: it }));
      });
    });
    b._reg(() => {
      const tg = fresh(sel);
      if (!tg) return;
      const v = valueNow(tg);
      if (document.activeElement !== input) input.value = v;
      out.textContent = fmt(+v);
      const t = now(tg);
      const keyed = isKeyed(tg.item, path);
      const on = keyed && !!keyAt(tg.item, path, clamp(t, 0, tg.dur)) && inside(tg, t);
      dia.className = `kf-dia${keyed ? ' keyed' : ''}${on ? ' on' : ''}`;
      dia.disabled = !inside(tg, t);
      dia.setAttribute('aria-pressed', on ? 'true' : 'false');
      dia.title = !inside(tg, t)
        ? 'Move the playhead over this item to add a keyframe'
        : on
          ? `Remove the ${label} keyframe at the playhead`
          : keyed
            ? `Add a ${label} keyframe at the playhead (it’s animated)`
            : `Add a ${label} keyframe at the playhead to start animating it`;
    });
    return h('div', { class: 'field kf-field' }, h('label', { class: 'lbl' }, label), h('div', { class: 'range-row' }, dia, input, out));
  }

  /** The list of an item's keyframes: time, property, value, easing, jump, delete. */
  function list(sel) {
    const tg = fresh(sel);
    if (!tg) return null;
    const ks = allKeys(tg.item);
    if (!ks.length) return h('p', { class: 'muted tiny' }, 'No keyframes yet.');
    const upd = (fn) => store.update((d) => {
      const t2 = kfTarget(d, sel);
      const it = t2 && t2.find(d);
      if (it) fn(it);
    });
    return h(
      'div',
      { class: 'kf-list' },
      ks.map((k) => {
        const info = propInfo(tg.kind, k.path) || [k.path, k.path];
        const fmt = info[6] || ((v) => String(+v.toFixed(2)));
        const ease = h('select', { 'aria-label': `Easing after ${info[1]} at ${formatTime(tg.start + k.t)}` }, EASES.map(([v, l]) => h('option', { value: v, selected: (k.e || 'smooth') === v }, l)));
        ease.addEventListener('change', () => upd((it) => {
          const x = it.keys[k.path].find((y) => Math.abs(y.t - k.t) < KEY_EPS);
          if (x) x.e = ease.value;
        }));
        return h(
          'div',
          { class: 'kf-row2' },
          h('button', { type: 'button', class: 'link', title: 'Move the playhead here', onclick: () => engine.seek(tg.start + k.t) }, formatTime(tg.start + k.t)),
          h('span', { class: 'kf-prop' }, info[1]),
          h('span', { class: 'muted tiny' }, fmt(k.v)),
          ease,
          iconButton('trash', `Delete the ${info[1]} keyframe`, () => upd((it) => removeKey(it, k.path, k.t)), 'ghost'),
        );
      }),
    );
  }

  /**
   * The Animate section for the selected item: sliders for the keyframable properties not shown
   * elsewhere (`skip`), the keyframe list, and a hint.
   */
  function animateSection(b, sel, { skip = [], title = 'Animate (keyframes)', write = {}, defs = {} } = {}) {
    const tg = fresh(sel);
    if (!tg) return null;
    const props = (KF_PROPS[tg.kind] || []).filter(([path]) => !skip.includes(path));
    const keyed = allKeys(tg.item).length;
    const clearAll = () => store.update((d) => {
      const t2 = kfTarget(d, sel);
      const it = t2 && t2.find(d);
      if (!it || !it.keys) return;
      const t = clamp(engine.t - t2.start, 0, t2.dur);
      for (const path of Object.keys(it.keys)) clearKeys(it, path, t);
    });
    return section(
      title,
      h('p', { class: 'muted tiny' }, icon('sparkle', 12), ' Move the playhead, then press ◆ or change a value: each ◆ is a keyframe, and the value glides between them. Drag the diamonds on the timeline to retime them; right-click one to change how it moves.'),
      ...props.map(([path]) => range(b, sel, path, { write: write[path], def: defs[path] })),
      keyed ? h('h4', { class: 'sub' }, `Keyframes · ${keyed}`) : null,
      list(sel),
      keyed ? button('Remove all keyframes', clearAll, { variant: 'sm ghost', title: 'Keeps each property at its value at the playhead' }) : null,
    );
  }

  return { range, list, animateSection };
}

/** A short signature of an item's keyframes, so panels rebuild when they change. */
export const kfSignature = (item) => allKeys(item).map((k) => `${k.path}@${k.t}:${k.e}`).join(',');
