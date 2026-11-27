// Look themes in the lyric line inspector: which lines a change reaches ("Applies to N lines with this look"),
// "Only this line" (split the line into a look of its own) and the theme cards. Logic is in lookapply.js.
import { h, button, toast } from './dom.js';
import { hasLineStyle } from './linestyle.js';
import { LOOK_THEMES, themeState, motionLabel } from './lookthemes.js';
import { lookMembers, splitLine, applyTheme as applyLookTheme } from './lookapply.js';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * How the swatch word moves on hover or focus (css .lt-m-*; still under prefers-reduced-motion): shake (its size as
 * --lt-amp, on the beat or steady), the beat pulse, the neon flicker. '' for a still theme.
 */
export function swatchMotion(t) {
  const fx = t.fx || {};
  const cls = [];
  const style = {};
  if (fx.shake > 0) {
    cls.push(fx.shakeBeat ? 'lt-m-thump' : 'lt-m-shake');
    style['--lt-amp'] = `${Math.max(0.5, Math.min(3, fx.shake * 7)).toFixed(2)}px`;
    style['--lt-dur'] = `${Math.max(0.08, Math.min(1.6, 0.4 / (fx.shakeSpeed || 1))).toFixed(2)}s`;
    if (fx.shakeDir === 'x' || fx.shakeDir === 'y') cls.push(`lt-m-${fx.shakeDir}`);
  }
  if (t.fields.animation === 'beat') cls.push('lt-m-pulse');
  if (t.fields.animation === 'neon') cls.push('lt-m-flicker');
  if (t.fields.animation === 'wipe') cls.push('lt-m-wipe');
  if (t.fields.animation === 'tracking') cls.push('lt-m-track');
  if (t.fields.animation === 'letters') cls.push('lt-m-letters');
  if (t.fields.animation === 'buildhold') cls.push('lt-m-build');
  if (t.fields.animation === 'paper') cls.push('lt-m-paper');
  if (t.fields.outAnimation === 'scatter') cls.push('lt-m-scatter');
  if (t.fields.outAnimation === 'ash') cls.push('lt-m-ash');
  if (t.fields.hit) cls.push('lt-m-hit');
  return { cls: cls.join(' '), style };
}

/** The swatch preview of a theme: a short word drawn with its font, colours, outline and box, moving like the theme. */
export function themeSwatch(t) {
  const f = t.fields;
  const m = swatchMotion(t);
  const ow = Math.max(0, Math.min(2, f.outlineWidth || 0));
  return h('span', { class: 'lt-prev', 'aria-hidden': 'true', style: { background: f.box ? f.boxColor : '#0b0b0d' } },
    h('span', {
      class: `lt-word${m.cls ? ` ${m.cls}` : ''}`,
      style: {
        ...m.style,
        fontFamily: `'${f.font}', sans-serif`,
        color: f.color,
        textTransform: f.uppercase ? 'uppercase' : 'none',
        webkitTextStroke: ow ? `${(ow * 0.9).toFixed(2)}px ${f.outline}` : '',
        textShadow: f.animation === 'neon' ? `0 0 6px ${f.highlight}` : f.shadow ? '0 1px 3px rgba(0,0,0,.7)' : 'none',
      },
    }, 'Riff', h('b', { style: { color: f.highlight } }, 's')),
    h('span', { class: 'lt-dots' }, [f.color, f.highlight, f.outline].map((c) => h('i', { style: { background: c } }))),
  );
}

/**
 * The block: scope note, "Only this line", and the theme cards. `lineId` is the selected line.
 * Every action is one store.update (one Ctrl+Z).
 */
export function lookThemeBlock(b, store, lineId) {
  const live = () => store.get().lyrics.find((l) => l.id === lineId);
  const count = () => lookMembers(store.get().lyrics, lineId).length;
  const note = h('p', { class: 'muted tiny lt-scope', 'aria-live': 'polite' });
  const only = button('Only this line', () => {
    store.update((d) => splitLine(d, lineId));
    toast('This line has a look of its own now: changes to it stay on this line.');
  }, { variant: 'ghost sm', iconName: 'scissors', title: 'Give this line its own look, so changes here stop reaching the other lines' });
  only.classList.add('lt-only');
  const cards = LOOK_THEMES.map((t) =>
    h('button', {
      type: 'button',
      role: 'radio',
      class: 'lt-card',
      title: t.hint,
      dataset: { theme: t.id },
      onclick: () => {
        const own = hasLineStyle(live());
        const n = own ? count() : store.get().lyrics.filter((l) => !hasLineStyle(l)).length;
        store.update((d) => applyLookTheme(d, lineId, t));
        toast(own ? `${t.name} on ${plural(n, 'line')} with this look` : `${t.name} is the shared lyric style now (${plural(n, 'line')})`);
      },
    }, themeSwatch(t), h('span', { class: 'lt-name' }, t.name), h('span', { class: 'lt-motion', 'data-motion': t.id }, motionLabel(t))));
  const edited = h('p', { class: 'muted tiny lt-edited', hidden: true });
  b._reg((p) => {
    const l = p.lyrics.find((x) => x.id === lineId);
    if (!l) return;
    const own = hasLineStyle(l);
    const n = lookMembers(p.lyrics, lineId).length;
    note.textContent = own
      ? n > 1 ? `Applies to ${n} lines with this look.` : 'Only this line has this look.'
      : `This line uses the shared lyric style: a theme here changes the shared style, which applies to ${plural(n, 'line')}.`;
    only.hidden = n < 2;
    // the theme this line wears; "edited" once its effect settings were changed after picking it
    const ts = themeState(p.lyricStyle, own ? l : { ...l, style: undefined });
    const on = ts && ts.theme;
    for (const c of cards) {
      const yes = !!on && c.dataset.theme === on.id;
      c.setAttribute('aria-checked', yes ? 'true' : 'false');
      c.classList.toggle('on', yes);
      c.classList.toggle('edited', yes && ts.edited);
      c.title = yes && ts.edited ? `${on.hint}. Effect settings changed since: pick it again to use the theme’s.` : LOOK_THEMES.find((t) => t.id === c.dataset.theme).hint;
    }
    edited.hidden = !(ts && ts.edited);
    edited.textContent = ts && ts.edited ? `${on.name}, with changed effect settings. Pick it again to use the theme’s.` : '';
  });
  return h('div', { class: 'lt-block' },
    h('div', { class: 'row lt-head' }, note, only),
    h('div', { class: 'lt-label small' }, 'Look themes'),
    h('div', { class: 'lt-grid', role: 'radiogroup', 'aria-label': 'Look theme' }, cards),
    edited,
  );
}
