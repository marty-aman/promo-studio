// "Effect settings" for the lyrics: pulse tempo, how often it pulses, its length and size, shake, and the
// amount/speed of the other lyric motion effects. Only the effects the chosen style uses are shown.
// The shared settings live in lyricStyle.fx (tempo in lyricStyle.tempo); a line's own in line.fx.
import { h, button, toast } from './dom.js';
import { tempoControl, hostTarget } from './panel-tempo.js';
import { FX_FIELDS, DIVISIONS, SHAKE_DIRS, GROUP_FIELDS, GROUP_LABEL, fxGroups, fxv, fxChanged } from './lyricfx.js';

/** The pulse tempo of the lyrics: lyricStyle.tempo, else the project's. */
export const lyricTempoTarget = () => hostTarget('lyrics', (p) => p.lyricStyle);

/**
 * Set one setting on an fx holder (a lyric style or a line). Back at what it would be anyway (the default, or for a
 * line the shared setting `under`) it is removed again.
 */
export function setFx(holder, key, v, under = null) {
  const fx = { ...(holder.fx || {}) };
  const dflt = key in FX_FIELDS ? FX_FIELDS[key][0] : key === 'shakeDir' ? 'both' : false;
  const def = under && key in under ? under[key] : dflt;
  if (v === def) delete fx[key];
  else fx[key] = v;
  if (Object.keys(fx).length) holder.fx = fx;
  else delete holder.fx;
}

/**
 * b: the panel's Binder. ctx: { store, engine, ui }.
 * style: the style the group is built for (decides which effects show). holder(draftOrProject): what is edited
 * (the lyric style, or the line). line: true for one line's own settings (the tempo stays shared there).
 */
export function lyricFxGroup(b, ctx, { style, holder, line = false }) {
  const { store } = ctx;
  const shared = (p) => p.lyricStyle.fx;
  const fxOf = (p) => {
    const x = holder(p);
    return line ? { ...(shared(p) || {}), ...((x && x.fx) || {}) } : (x && x.fx) || {};
  };
  const set = (key) => (d, v) => {
    const x = holder(d);
    if (x) setFx(x, key, v, line ? shared(d) : null);
  };
  const k = (name) => ({ 'data-k': name });
  const range = (key) => {
    const [, min, max, step, label, fmt] = FX_FIELDS[key];
    const el = b.range(label, (p) => fxv(fxOf(p), key), set(key), { min, max, step, fmt: fmt || ((v) => String(v)), key: `lyricfx:${line ? 'line' : 'style'}:${key}` });
    el.setAttribute('data-fx', key);
    return el;
  };
  // turning "Shake on the beat" on or off shows or hides the beat timing, so the panel is built again
  const onBeatToggle = () => {
    const el = b.toggle('Shake on the beat', (p) => !!fxOf(p).shakeBeat, set('shakeBeat'));
    el.setAttribute('data-fx-toggle', 'shakeBeat');
    el.querySelector('input').addEventListener('change', () => setTimeout(() => ctx.ui && ctx.ui.refreshPanels && ctx.ui.refreshPanels(), 0));
    return el;
  };
  const groups = fxGroups(style);
  const cur = fxOf(store.get());
  const timing = groups.includes('pulse') || !!cur.shakeBeat;
  const parts = [];
  if (timing) {
    parts.push(h('h5', { class: 'fx-h' }, 'Beat timing'));
    if (!line) parts.push(tempoControl(b, ctx, lyricTempoTarget(), { title: 'Pulse tempo', note: 'The lyrics pulse to the project tempo (Audio tab) unless you set their own here. Moving the first beat sets their own tempo.' }));
    const div = b.select('Pulse every', (p) => String(fxv(fxOf(p), 'div')), (d, v) => set('div')(d, +v), DIVISIONS);
    div.setAttribute('data-fx', 'div');
    parts.push(h('div', { class: 'grid2' }, div, range('len')));
  }
  for (const g of groups) {
    const fields = GROUP_FIELDS[g].filter((f) => f !== 'div' && f !== 'len');
    if (!fields.length) continue;
    parts.push(h('h5', { class: 'fx-h' }, GROUP_LABEL[g]));
    parts.push(...fields.map(range));
    if (g === 'shake') {
      parts.push(
        b.segmented('Shake direction', (p) => fxOf(p).shakeDir || 'both', set('shakeDir'), SHAKE_DIRS),
        onBeatToggle(),
      );
    }
  }
  const reset = button(line ? 'Use the shared effect settings' : 'Reset to default', () => {
    store.update((d) => {
      const x = holder(d);
      if (!x) return;
      delete x.fx;
      if (!line) delete x.tempo;
    });
    toast(line ? 'This line uses the shared effect settings again' : 'Effect settings are back to the default look');
  }, { variant: 'ghost sm', title: line ? 'Drop this line’s own effect settings' : 'Pulse tempo, timing, sizes and shake back to how the style looks by default' });
  reset.setAttribute('data-k', 'lyricfx-reset');
  b._reg((p) => {
    const x = holder(p);
    reset.disabled = !(x && (fxChanged(x.fx) || (!line && x.tempo)));
  });
  return h(
    'div',
    { class: 'lyric-fx', ...k(line ? 'lyricfx-line' : 'lyricfx') },
    h('h4', { class: 'ai-h' }, line ? 'This line’s effect settings' : 'Effect settings'),
    h('p', { class: 'muted tiny' }, line ? 'Only this line. The pulse tempo is shared (Lyrics tab).' : 'How strong and how fast the lyric moves. Shown for the effects your lyric style uses.'),
    ...parts,
    h('div', { class: 'row' }, reset),
  );
}
