// Clip inspector section: Remove background (person or green screen) and the suggested backgrounds.
import { h, button, section, toast } from './dom.js';
import { BG_MODES, defaultBgRemove, personStatus, onMatteChange, preparePerson } from './bgremove.js';
import { suggestBackdrops, backdropSearches, drawBackdrop, coverPalette } from './backgrounds.js';
import { themeById, themeBackdrop } from './themes.js';

let paletteCache = { id: null, pal: null };
function paletteFor(media, p) {
  const id = p.endCard && p.endCard.coverMediaId;
  if (paletteCache.id !== id) {
    const rec = id && media.get(id);
    paletteCache = { id, pal: rec && rec.el ? coverPalette(rec.el) : null };
  }
  return paletteCache.pal;
}

/** Is background `a` the same choice as suggestion `b`? */
export function sameBackdrop(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'scene') return a.scene === b.scene;
  if (a.kind === 'media') return a.mediaId === b.mediaId;
  return true;
}

function tile(s, rec, media, selected, onPick) {
  const c = h('canvas', { width: 54, height: 96, 'aria-hidden': 'true' });
  const g = c.getContext('2d');
  const drawImg = (url, blur) => {
    if (!url) return;
    const img = new Image();
    img.onload = () => {
      g.save();
      if (blur) g.filter = 'blur(3px) brightness(0.7)';
      const k = Math.max(c.width / img.width, c.height / img.height) * (blur ? 1.15 : 1);
      g.drawImage(img, (c.width - img.width * k) / 2, (c.height - img.height * k) / 2, img.width * k, img.height * k);
      g.restore();
    };
    img.src = url;
  };
  if (!drawBackdrop(g, c.width, c.height, s.bg, 1.3, 0.3)) {
    g.fillStyle = '#111';
    g.fillRect(0, 0, c.width, c.height);
    if (s.bg.kind === 'blur') drawImg(rec && rec.thumb, true);
    if (s.bg.kind === 'media') {
      const m = media.get(s.bg.mediaId);
      drawImg(m && (m.thumb || (m.kind === 'image' ? m.url : null)), false);
    }
  }
  return h(
    'button',
    {
      type: 'button',
      class: `bg-tile${selected ? ' on' : ''}`,
      role: 'radio',
      'aria-checked': selected ? 'true' : 'false',
      title: `${s.label}: ${s.why}`,
      onclick: onPick,
    },
    c,
    h('span', {}, s.label),
  );
}

/**
 * The "Remove background" section of the clip inspector.
 * ctx: { store, media, actions, b (Binder), c (setter maker for this clip), G (current clip), rec (its media) }
 */
export function bgRemoveSection({ store, media, actions, b, c, G, rec }) {
  const set = (fn) =>
    c((x, v) => {
      x.bgRemove = { ...defaultBgRemove(), ...(x.bgRemove || {}) };
      fn(x.bgRemove, v, x);
    });
  const g = (k, def) => () => (G().bgRemove || {})[k] ?? def;
  const br = G().bgRemove;
  const on = !!(br && br.enabled);
  const toggle = b.toggle('Remove background', () => !!(G().bgRemove && G().bgRemove.enabled), c((x, v, d) => {
    const first = !x.bgRemove;
    x.bgRemove = { ...defaultBgRemove(), ...(x.bgRemove || {}), enabled: v };
    // the first time on a themed project, start with the theme's background
    const t = d && d.theme && themeById(d.theme.id);
    if (v && first && t) x.bgRemove.background = themeBackdrop(t, d.theme.colors);
  }));
  if (!on) {
    return section(
      'Remove background',
      toggle,
      h('p', { class: 'muted tiny' }, 'Cut yourself out and put a new background behind you. Person (AI) finds people automatically and runs only in this browser. Green screen removes a green or blue backdrop.'),
    );
  }
  const mode = br.mode || 'person';
  const p = store.get();

  // live progress while the person cut-out is prepared
  const status = h('p', { class: 'muted tiny bg-status', role: 'status' });
  const paintStatus = () => {
    if (mode !== 'person') {
      status.textContent = 'Works best with an evenly lit screen. Pick the screen colour with the colour picker if it isn’t pure green.';
      return;
    }
    const s = personStatus(rec.id);
    status.classList.toggle('error-text', s.status === 'error');
    status.textContent =
      s.status === 'error'
        ? `Could not prepare the cut-out: ${s.error}`
        : s.status === 'ready'
          ? 'Cut-out ready. It works best when one or two people fill a good part of the frame. Instruments held close usually stay in.'
          : s.total
            ? `Finding people in the clip… ${Math.min(s.done, s.total)} of ${s.total} frames. You can keep editing.`
            : 'Loading the person finder (first time only, about 15 MB)…';
  };
  paintStatus();
  const off = onMatteChange((id) => {
    if (status._mounted && !status.isConnected) return off();
    if (status.isConnected) status._mounted = true;
    if (id === rec.id) {
      paintStatus();
      showRetry();
    }
  });

  const statusRow = mode === 'person'
    ? h('div', { class: 'row' }, button('Try again', () => {
        const pp = store.get();
        const all = [...pp.clips, ...(pp.layers || []).filter((l) => l.type === 'video').flatMap((l) => l.clips)];
        preparePerson(rec, all.filter((x) => x.mediaId === rec.id && x.bgRemove && x.bgRemove.enabled && x.bgRemove.mode === 'person'), { retry: true });
      }, { variant: 'sm' }), button('Use Green screen instead', () => store.update(set((o) => (o.mode = 'chroma'))), { variant: 'ghost sm' }))
    : null;
  const showRetry = () => statusRow && (statusRow.hidden = personStatus(rec.id).status !== 'error');
  showRetry();

  const controls =
    mode === 'person'
      ? h(
          'div',
          { class: 'grid2' },
          b.range('Edge', g('edge', 0), set((o, v) => (o.edge = v)), { min: -1, max: 1, step: 0.05, fmt: (v) => (v > 0.02 ? `grow ${Math.round(v * 100)}%` : v < -0.02 ? `shrink ${Math.round(-v * 100)}%` : 'as found') }),
          b.range('Softness', g('softness', 0.35), set((o, v) => (o.softness = v)), { min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` }),
        )
      : h(
          'div',
          {},
          h('div', { class: 'grid2' },
            b.color('Screen colour', g('key', '#00ff00'), set((o, v) => (o.key = v))),
            b.range('Amount removed', g('tolerance', 0.35), set((o, v) => (o.tolerance = v)), { min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` }),
          ),
          h('div', { class: 'grid2' },
            b.range('Softness', g('softness', 0.35), set((o, v) => (o.softness = v)), { min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` }),
            b.range('Edge', g('edge', 0), set((o, v) => (o.edge = v)), { min: -1, max: 1, step: 0.05, fmt: (v) => (v > 0.02 ? `grow ${Math.round(v * 100)}%` : v < -0.02 ? `shrink ${Math.round(-v * 100)}%` : 'as keyed') }),
          ),
        );

  // suggested backgrounds
  const palette = paletteFor(media, p);
  const others = media.all().filter((m) => (m.kind === 'video' || m.kind === 'image') && m.id !== rec.id && m.id !== (p.endCard && p.endCard.coverMediaId));
  const th = p.theme && themeById(p.theme.id);
  const sugg = suggestBackdrops({ template: p.template || null, palette, otherMedia: others.map((m) => ({ id: m.id, name: m.name, kind: m.kind })), theme: th ? { ...th, colors: p.theme.colors } : null });
  const cur = br.background;
  const grid = h(
    'div',
    { class: 'bg-grid', role: 'radiogroup', 'aria-label': 'Background behind the cut-out' },
    sugg.map((s) => tile(s, rec, media, sameBackdrop(cur, s.bg), () => store.update(set((o) => (o.background = { ...s.bg }))))),
  );
  const top = sugg[0];
  const colorRow =
    cur && (cur.kind === 'scene' || cur.kind === 'gradient' || cur.kind === 'color')
      ? h('div', { class: 'grid2' },
          b.color(cur.kind === 'color' ? 'Colour' : 'Main colour', () => (G().bgRemove.background || {}).color || '#ff2bd6', set((o, v) => (o.background = { ...o.background, color: v }))),
          cur.kind === 'color' ? null : b.color('Second colour', () => (G().bgRemove.background || {}).color2 || '#2b6bff', set((o, v) => (o.background = { ...o.background, color2: v }))),
        )
      : null;
  const applyAll = () => {
    const bg = structuredClone(G().bgRemove.background);
    let n = 0;
    store.update((d) => {
      const all = [...d.clips, ...(d.layers || []).filter((l) => l.type === 'video').flatMap((l) => l.clips)];
      for (const x of all) if (x.bgRemove && x.bgRemove.enabled) (x.bgRemove.background = structuredClone(bg)), n++;
    });
    toast(`Background used for ${n} cut-out${n === 1 ? '' : 's'}`);
  };
  const searches = h(
    'div',
    { class: 'chips' },
    backdropSearches(p.template).map((q) => button(q, () => actions.stockSearch(q), { variant: 'chip', iconName: 'search' })),
  );

  return section(
    'Remove background',
    toggle,
    b.segmented('How', () => (G().bgRemove || {}).mode || 'person', set((o, v) => (o.mode = v)), BG_MODES),
    status,
    statusRow,
    controls,
    h('div', { class: 'lbl' }, 'Suggested backgrounds'),
    h('p', { class: 'muted tiny' }, palette ? `Matched to your cover art${p.template ? ' and template' : ''}. Top pick: ${top.label}.` : `Add cover art in End card to match its colours. Top pick: ${top.label}.`),
    grid,
    colorRow,
    h('div', { class: 'row' }, button('Use this background for every cut-out', applyAll, { variant: 'ghost sm' })),
    h('div', { class: 'lbl' }, 'Find background footage'),
    searches,
    h('p', { class: 'muted tiny' }, 'Downloads from Stock appear in Media. Then pick them above as “another clip of yours”.'),
  );
}
