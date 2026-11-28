// "My templates": save the current edit as a reusable template, without your media or lyrics.
// A template keeps the look (theme, lyric style, grade and effects per clip, text overlays, end card,
// watermark and progress bar settings, layer styles) and re-applies it to a new song and new clips.
// Pure functions (no DOM) so they can be unit tested; files are plain JSON you can share.

import { uid } from './core.js';

export const MY_TEMPLATE_VERSION = 2;

// layer fields that point at media (or depend on the song), kept from your project, never from a template
const MEDIA_KEYS = ['mediaId', 'track', 'offset', 'tempoScale', 'source', 'clips'];
// end-card fields that belong to one release
const RELEASE_KEYS = ['coverMediaId', 'coverBy', 'title', 'releaseDate', 'dateBy'];
// per-clip look fields
const CLIP_LOOK_KEYS = ['grade', 'filter', 'transition', 'effects', 'kenBurns', 'mask', 'fit'];

const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o && k in o).map((k) => [k, clone(o[k])]));
const omit = (o, keys) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => !keys.includes(k)).map(([k, v]) => [k, clone(v)]));
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);

/** A template from project `p`. `thumb` is an optional small data: URL picture. */
export function templateFromProject(p, name, thumb = null) {
  const look = clone(p.look || {});
  if (look.watermark) delete look.watermark.mediaId;
  return {
    v: MY_TEMPLATE_VERSION,
    name: String(name || 'My template').slice(0, 80),
    saved: Date.now(),
    thumb: typeof thumb === 'string' && thumb.startsWith('data:image/') ? thumb : null,
    aspect: p.aspect,
    layout: p.layout || null,
    template: p.template || null,
    theme: clone(p.theme || null),
    length: p.duration,
    background: p.background,
    lyricStyle: clone(p.lyricStyle),
    endCard: omit(p.endCard, RELEASE_KEYS),
    look,
    clipLooks: (p.clips || []).slice(0, 12).map((c) => pick(c, CLIP_LOOK_KEYS)),
    texts: (p.texts || []).map((t) => omit(t, ['id'])),
    layers: (p.layers || []).map((L) => {
      const x = omit(L, ['id', ...MEDIA_KEYS]);
      x.type = L.type;
      return x;
    }),
  };
}

/**
 * Apply template `t` to project draft `d`. Layers that need media reuse the matching layers you
 * already have (keeping their file, track and sync); returns { added, kept, missing } layer counts
 * so the UI can say what still needs a file.
 */
export function applyMyTemplate(d, t) {
  const out = { added: 0, kept: 0, missing: [] };
  if (!t) return out;
  if (isObj(t.lyricStyle)) d.lyricStyle = { ...d.lyricStyle, ...clone(t.lyricStyle) };
  if (isObj(t.endCard)) d.endCard = { ...d.endCard, ...omit(t.endCard, RELEASE_KEYS), ...pick(d.endCard, RELEASE_KEYS) };
  if (isObj(t.look)) {
    const wm = d.look && d.look.watermark;
    d.look = { ...d.look, ...clone(t.look) };
    d.look.watermark = { ...(wm || {}), ...((t.look && t.look.watermark) || {}), mediaId: wm ? wm.mediaId : null };
  }
  if (typeof t.background === 'string') d.background = t.background;
  if (!t.v) return out; // version 1 templates only saved the styles above

  if (t.aspect) d.aspect = t.aspect;
  if ('layout' in t) d.layout = t.layout;
  if ('template' in t) d.template = t.template;
  d.theme = clone(t.theme || null);
  if (typeof t.length === 'number' && t.length > 1) d.duration = +t.length.toFixed(2);

  const looks = Array.isArray(t.clipLooks) ? t.clipLooks.filter(isObj) : [];
  if (looks.length) (d.clips || []).forEach((c, i) => Object.assign(c, clone(looks[Math.min(i, looks.length - 1)])));

  if (Array.isArray(t.texts)) {
    const ecLen = d.endCard && d.endCard.enabled ? d.endCard.duration : 0;
    const max = Math.max(0.5, d.duration - ecLen);
    d.texts = t.texts.filter(isObj).map((x) => ({ ...clone(x), id: uid('txt'), start: Math.min(x.start || 0, max - 0.2), end: Math.min(x.end ?? max, max) }));
  }

  if (Array.isArray(t.layers)) {
    const have = [...(d.layers || [])];
    const used = new Set();
    const next = [];
    for (const tl of t.layers.filter((x) => isObj(x) && typeof x.type === 'string')) {
      // reuse one of your layers of the same kind that already has its media
      const mine = have.find((L) => !used.has(L) && L.type === tl.type && (L.mediaId || (L.clips && L.clips.length) || L.type === 'viz'));
      if (mine) {
        used.add(mine);
        next.push({ ...clone(tl), ...pick(mine, MEDIA_KEYS), id: mine.id, visible: tl.visible !== false });
        out.kept += 1;
      } else if (tl.type === 'viz') {
        next.push({ ...clone(tl), id: uid('lyr'), source: 'song', offset: 0 });
        out.added += 1;
      } else {
        out.missing.push(tl.type);
      }
    }
    // the layers the template doesn't use are hidden, not deleted
    for (const L of have) if (!used.has(L)) next.push({ ...L, visible: false });
    // video layers always sit under the others
    d.layers = [...next.filter((L) => L.type === 'video'), ...next.filter((L) => L.type !== 'video')];
  }
  return out;
}

/** The text of a template file. */
export const templateFile = (t) => JSON.stringify({ promoStudioTemplate: MY_TEMPLATE_VERSION, ...t }, null, 1);

/**
 * Read a template file (from someone else, so it is checked): returns a template or throws.
 * Only known fields of the right shape are kept.
 */
export function parseTemplateFile(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t a Band Manager template.');
  }
  if (!isObj(raw) || !(raw.promoStudioTemplate || raw.v) || !isObj(raw.lyricStyle)) throw new Error('That file isn’t a Band Manager template.');
  const t = {
    v: MY_TEMPLATE_VERSION,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : 'Imported template',
    saved: Date.now(),
    thumb: typeof raw.thumb === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(raw.thumb) && raw.thumb.length < 200000 ? raw.thumb : null,
    aspect: ['9:16', '1:1', '4:5', '16:9', 'canvas'].includes(raw.aspect) ? raw.aspect : '9:16',
    layout: typeof raw.layout === 'string' ? raw.layout : null,
    template: typeof raw.template === 'string' ? raw.template : null,
    theme: isObj(raw.theme) && typeof raw.theme.id === 'string' ? raw.theme : null,
    length: typeof raw.length === 'number' && raw.length > 1 && raw.length < 600 ? raw.length : null,
    background: typeof raw.background === 'string' && /^#[0-9a-f]{3,8}$/i.test(raw.background) ? raw.background : undefined,
    lyricStyle: raw.lyricStyle,
    endCard: isObj(raw.endCard) ? omit(raw.endCard, RELEASE_KEYS) : {},
    look: isObj(raw.look) ? raw.look : {},
    clipLooks: Array.isArray(raw.clipLooks) ? raw.clipLooks.filter(isObj).slice(0, 12).map((c) => pick(c, CLIP_LOOK_KEYS)) : [],
    texts: Array.isArray(raw.texts) ? raw.texts.filter(isObj).slice(0, 20).map((x) => ({ ...omit(x, ['id']), text: String(x.text || '').slice(0, 200) })) : [],
    layers: Array.isArray(raw.layers) ? raw.layers.filter((x) => isObj(x) && ['video', 'tab', 'drums', 'viz'].includes(x.type)).slice(0, 12).map((x) => omit(x, ['id', ...MEDIA_KEYS])) : [],
  };
  if (t.look.watermark) delete t.look.watermark.mediaId;
  return t;
}

/** One line saying what a template sets, for its card. */
export function describeTemplate(t) {
  if (!t.v) return 'Lyric style, end card and look';
  const bits = [];
  if (t.theme && t.theme.id) bits.push('theme');
  bits.push('lyric style');
  if (t.clipLooks && t.clipLooks.length) bits.push('clip looks');
  if (t.texts && t.texts.length) bits.push(`${t.texts.length} text${t.texts.length > 1 ? 's' : ''}`);
  const kinds = { viz: 'visualizer', tab: 'tab', drums: 'drum chart', video: 'video layer' };
  for (const [k, label] of Object.entries(kinds)) {
    const n = (t.layers || []).filter((L) => L.type === k && L.visible !== false).length;
    if (n) bits.push(n > 1 ? `${n} ${label}s` : label);
  }
  if (t.length) bits.push(`${Math.round(t.length)} s`);
  return bits.join(' · ');
}
