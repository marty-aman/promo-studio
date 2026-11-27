// "Effect settings" for the lyrics: pulse tempo, how often it pulses, its length and size, shake, and the
// amount/speed of the other lyric motion effects. Only the effects the chosen style uses are shown.
// The shared settings live in lyricStyle.fx (tempo in lyricStyle.tempo); a look's in style.fx of each of its lines
// (lookapply.js); a line's own in line.fx. Drawn in that order, each over the one before.
import { h, button, toast } from './dom.js';
import { setLookFx, resetLookFx, lookFxState, lookFxOf, changeLook } from './lookapply.js';
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
 * look: { id, ids } for the settings of the look of line `id` (holder gives that line's style): a change reaches every
 * line with the look (ids(): the lines a slider drag started with, lookapply.js changeLook); the tempo stays shared.
 */
export function lyricFxGroup(b, ctx, { style, holder, line = false, look = null }) {
  const { store } = ctx;
  // what a line's own settings sit on: the shared settings, then its look's (a look theme's, style.fx)
  const shared = (p) => {
    const x = line ? holder(p) : null;
    const look = x && x.style && x.style.fx;
    return look ? { ...(p.lyricStyle.fx || {}), ...look } : p.lyricStyle.fx;
  };
  const hasLookFx = () => {
    const x = line ? holder(store.get()) : null;
    return !!(x && x.style && x.style.fx);
  };
  const fxOf = (p) => {
    const x = holder(p);
    if (look) return lookFxOf(p.lyricStyle, x);
    return line ? { ...(shared(p) || {}), ...((x && x.fx) || {}) } : (x && x.fx) || {};
  };
  const set = (key) => (d, v) => {
    if (look) return void setLookFx(d, look.id, key, v, { ids: look.ids() });
    const x = holder(d);
    if (x) setFx(x, key, v, line ? shared(d) : null);
  };
  const k = (name) => ({ 'data-k': name });
  const range = (key) => {
    const [, min, max, step, label, fmt] = FX_FIELDS[key];
    const el = b.range(label, (p) => fxv(fxOf(p), key), set(key), { min, max, step, fmt: fmt || ((v) => String(v)), key: `lyricfx:${look ? 'look' : line ? 'line' : 'style'}:${key}` });
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
  // the beat controls: the pulse, shake on the beat and the paper strips' jump use the pulse division and length; the ticker (locked to the tempo) uses only the tempo
  const tempoOnly = groups.includes('ticker') && !groups.includes('paper') && !groups.includes('pulse') && !cur.shakeBeat;
  const timing = groups.includes('pulse') || groups.includes('paper') || groups.includes('ticker') || !!cur.shakeBeat;
  const parts = [];
  if (timing) {
    parts.push(h('h5', { class: 'fx-h' }, 'Beat timing'));
    if (!line && !look) parts.push(tempoControl(b, ctx, lyricTempoTarget(), { title: 'Pulse tempo', note: 'The lyrics pulse to the project tempo (Audio tab) unless you set their own here. Moving the first beat sets their own tempo.' }));
    if (!tempoOnly) {
      const div = b.select('Pulse every', (p) => String(fxv(fxOf(p), 'div')), (d, v) => set('div')(d, +v), DIVISIONS);
      div.setAttribute('data-fx', 'div');
      parts.push(h('div', { class: 'grid2' }, div, range('len')));
    }
  }
  // "Pulse on the beat" is always listed: greyed out with a way to switch to it when the style does not pulse. Only the
  // panel shows it (fxGroups, and so what is saved, is unchanged), and its controls are off, so nothing is written.
  if (!groups.includes('pulse')) parts.push(pulseOff(b, ctx, { style, holder, line, look, range, fxOf, showTiming: !timing }));
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
  if (look) return lookGroup(b, ctx, look, parts);
  const lookFx = hasLookFx();
  const reset = button(line ? (lookFx ? 'Use the look’s effect settings' : 'Use the shared effect settings') : 'Reset to default', () => {
    store.update((d) => {
      const x = holder(d);
      if (!x) return;
      delete x.fx;
      if (!line) delete x.tempo;
    });
    const lookNow = hasLookFx();
    toast(line ? (lookNow ? 'This line uses its look’s effect settings again' : 'This line uses the shared effect settings again') : 'Effect settings are back to the default look');
  }, { variant: 'ghost sm', title: line ? 'Drop this line’s own effect settings' : 'Pulse tempo, timing, sizes and shake back to how the style looks by default' });
  reset.setAttribute('data-k', 'lyricfx-reset');
  b._reg((p) => {
    const x = holder(p);
    reset.disabled = !(x && (fxChanged(x.fx) || (!line && x.tempo)));
    // the look can get its own settings while this is open (its Effect settings group above)
    if (line) reset.firstChild.textContent = x && x.style && x.style.fx ? 'Use the look’s effect settings' : 'Use the shared effect settings';
  });
  return h(
    'div',
    { class: 'lyric-fx', ...k(line ? 'lyricfx-line' : 'lyricfx') },
    h('h4', { class: 'ai-h' }, line ? 'Effect settings: only this line' : 'Effect settings: the whole song'),
    h('p', { class: 'muted tiny' }, line ? (lookFx ? 'Only this line, over its look’s settings. The pulse tempo is shared (Lyrics tab).' : 'Only this line. The pulse tempo is shared (Lyrics tab).') : 'The whole song: how strong and how fast the lyric moves. Shown for the effects your lyric style uses. A look or a line can have its own (select a line).'),
    ...parts,
    h('div', { class: 'row' }, reset),
  );
}

const lines = (n) => `${n} line${n === 1 ? '' : 's'}`;

/** Does this style pulse on the beat? (its group is a live one then) The displays that can: the poster, the tunnel, the line. */
const PULSE_DISPLAYS = ['line', 'poster', 'tunnel'];

/**
 * The greyed-out "Pulse on the beat" group, for a style that does not pulse: a hint, a button that makes Pulse on the
 * beat the animation (one undo; on a look it reaches every line with the look, on a line only that line), and the
 * group's controls turned off. showTiming: also list Pulse every and Pulse length (the beat timing block is not above).
 */
function pulseOff(b, ctx, { style, holder, line, look, range, fxOf, showTiming }) {
  const { store } = ctx;
  const display = style.display || 'line';
  const canSwitch = PULSE_DISPLAYS.includes(display);
  const use = button('Use Pulse on the beat', () => {
    store.update((d) => {
      if (look) changeLook(d, look.id, (st) => ({ ...(st || {}), animation: 'beat' }), { ids: look.ids() });
      else if (line) changeLook(d, holder(d).id, (st) => ({ ...(st || {}), animation: 'beat' }), { only: true });
      else d.lyricStyle.animation = 'beat';
    });
    toast('The animation is now Pulse on the beat');
  }, { variant: 'sm', title: 'Make Pulse on the beat the animation' });
  use.setAttribute('data-k', 'lyricfx-pulse-use');
  use.disabled = !canSwitch;
  const controls = [];
  if (showTiming) {
    const div = b.select('Pulse every', (p) => String(fxv(fxOf(p), 'div')), () => {}, DIVISIONS);
    div.setAttribute('data-fx', 'div');
    controls.push(h('div', { class: 'grid2' }, div, range('len')));
  }
  controls.push(range('pulse'));
  const box = h('div', { class: 'fx-off', 'data-k': 'lyricfx-pulse-off', 'aria-disabled': 'true' },
    h('h5', { class: 'fx-h' }, GROUP_LABEL.pulse),
    h('p', { class: 'muted tiny', 'data-k': 'lyricfx-pulse-hint' }, canSwitch ? 'Choose Pulse on the beat as the animation to use these.' : 'Pulse on the beat works with One line at a time, the Kinetic poster and the 3D word tunnel.'),
    h('div', { class: 'row' }, use),
    ...controls,
  );
  for (const el of box.querySelectorAll('input, select')) el.disabled = true;
  return box;
}

/** The look's group: what it reaches ("This look (N lines)"), its controls, and Reset (to the theme's, or to none). */
function lookGroup(b, ctx, look, parts) {
  const { store } = ctx;
  const scope = h('p', { class: 'muted tiny lfx-scope', 'aria-live': 'polite' });
  const reset = button('Reset to default', () => {
    const st = lookFxState(store.get(), look.id);
    if (!st) return;
    store.update((d) => resetLookFx(d, look.id));
    toast(st.theme ? `This look moves like ${st.theme.name} again (${lines(st.count)})` : `This look uses the shared effect settings again (${lines(st.count)})`);
  }, { variant: 'ghost sm' });
  reset.setAttribute('data-k', 'lyricfx-reset');
  const title = h('h4', { class: 'ai-h' }, 'Effect settings: this look');
  b._reg((p) => {
    const st = lookFxState(p, look.id);
    if (!st) return;
    title.textContent = `Effect settings: this look (${lines(st.count)})`;
    scope.textContent = `${st.count > 1 ? `Changes reach all ${st.count} lines with this look` : 'Only this line has this look'}${st.theme ? `, from the ${st.theme.name} theme${st.edited ? ' (edited)' : ''}` : ''}. A line’s own settings (below) sit on top; the shared ones (Lyrics tab) sit under. The pulse tempo is shared.`;
    reset.firstChild.textContent = st.theme ? 'Use the theme’s effect settings' : 'Reset to default';
    reset.title = st.theme ? `Effect settings back to ${st.theme.name}’s, on every line with this look` : 'Drop this look’s own effect settings: its lines use the shared ones again';
    reset.disabled = !st.canReset;
  });
  return h('div', { class: 'lyric-fx', 'data-k': 'lyricfx-look' }, title, scope, ...parts, h('div', { class: 'row' }, reset));
}
