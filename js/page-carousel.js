// The Carousel page: suggested Instagram carousels, a slide strip, per-slide looks, captions and
// download (1080x1350 PNGs in a .zip, or the share sheet on a phone).
import { h, icon, button, toast, field, download } from './dom.js';
import { media } from './media.js';
import { renderFrame } from './renderer.js';
import { layoutClips } from './core.js';
import { coverPalette } from './backgrounds.js';
import { zipStore } from './batch.js';
import { canShareFiles } from './share.js';
import { captionPicker } from './panel-captions.js';
import { SLIDE_W, SLIDE_H, FILTERS, LAYOUTS, CAROUSEL_SOURCES, carouselInputs, suggestCarousels, drawSlide, slide as makeSlide } from './carousel.js';

const ui$ = { sel: 0, seed: 0 };
const frames = new Map(); // `${mediaId}@${time}` -> canvas (frames grabbed from clips)
const pending = new Map();
const editFrames = new Map(); // `edit@${fraction}@${projectStamp}` -> canvas

const slug = (s) => String(s || 'carousel').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'carousel';

function seekVideo(url, time) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = url;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(v);
    };
    v.addEventListener('loadeddata', () => {
      v.currentTime = Math.min(Math.max(0, time), Math.max(0, (v.duration || time) - 0.05));
    }, { once: true });
    v.addEventListener('seeked', finish, { once: true });
    v.addEventListener('error', () => ((done = true), resolve(null)), { once: true });
    setTimeout(finish, 4000);
  });
}

/** A frame from a clip, as a canvas (cached). Calls onReady when it arrives. */
function clipFrame(mediaId, time, onReady) {
  const key = `${mediaId}@${time}`;
  if (frames.has(key)) return frames.get(key);
  if (!pending.has(key)) {
    const rec = media.get(mediaId);
    if (!rec) return null;
    pending.set(key, seekVideo(rec.url, time).then((v) => {
      if (!v || !v.videoWidth) return;
      const c = document.createElement('canvas');
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      frames.set(key, c);
      v.removeAttribute('src');
      v.load();
      onReady();
    }));
  }
  return null;
}

/** A still of the edit itself (lyrics, tab, look) at `fraction` of the content, at 4:5 (cached). */
function editFrame(store, engine, fraction, onReady) {
  const p = store.get();
  const stamp = JSON.stringify([p.clips.map((c) => [c.id, c.in, c.duration]), p.layers && p.layers.length, p.lyrics.length, p.template]).length + ':' + p.clips.length;
  const key = `edit@${fraction}@${stamp}`;
  if (editFrames.has(key)) return editFrames.get(key);
  if (pending.has(key)) return null;
  const contentEnd = Math.max(0.5, p.duration - (p.endCard.enabled ? p.endCard.duration : 0));
  const t = Math.min(contentEnd - 0.05, contentEnd * fraction);
  const laid = layoutClips(p.clips);
  const cur = laid.find((l) => t >= l.start && t < l.end);
  const job = (async () => {
    let el = null;
    if (cur) {
      const rec = media.get(cur.clip.mediaId);
      if (rec && rec.kind === 'video') el = await seekVideo(rec.url, cur.clip.in + (t - cur.start) * (cur.clip.speed || 1));
      else if (rec) el = rec.el;
    }
    const c = document.createElement('canvas');
    c.width = SLIDE_W;
    c.height = SLIDE_H;
    const env = { ...engine.env(false), sourceFor: (clip) => (cur && clip.id === cur.clip.id ? el : media.get(clip.mediaId) && media.get(clip.mediaId).kind === 'image' ? media.get(clip.mediaId).el : null) };
    const draft = structuredClone(p);
    draft.look.overlay = 'off';
    draft.look.progress = { ...draft.look.progress, enabled: false };
    renderFrame(c.getContext('2d'), SLIDE_W, SLIDE_H, draft, t, env);
    if (el && el.removeAttribute) {
      el.removeAttribute('src');
      el.load();
    }
    editFrames.set(key, c);
    onReady();
  })();
  pending.set(key, job);
  return null;
}

export function buildCarouselPage({ store, engine, ui, settings }) {
  const root = h('div', { class: 'page carousel-page' });
  let redrawAll = () => {};

  const assets = {
    image: (src) => {
      if (!src) return null;
      if (src.kind === 'image' || src.kind === 'cover') {
        const rec = media.get(src.mediaId);
        return rec && rec.el ? rec.el : null;
      }
      if (src.kind === 'clip') return clipFrame(src.mediaId, src.time || 0, () => redrawAll());
      if (src.kind === 'edit') return editFrame(store, engine, src.time ?? 0.3, () => redrawAll());
      return null;
    },
  };
  const style = () => {
    const p = store.get();
    const cov = p.endCard.coverMediaId && media.get(p.endCard.coverMediaId);
    const pal = p.theme && p.theme.colors ? [p.theme.colors.accent, p.theme.colors.deep] : cov && cov.el ? coverPalette(cov.el) : null;
    return { palette: pal, accent: p.endCard.accent || '#ffd400' };
  };
  const slides = () => (store.get().carousel && store.get().carousel.slides) || [];
  const setSlides = (fn, key) => store.update((d) => {
    d.carousel ||= { recipe: null, slides: [] };
    fn(d.carousel.slides, d.carousel);
  }, key);

  const paint = (c, s, i, n) => {
    const g = c.getContext('2d');
    drawSlide(g, c.width, c.height, s, assets, { ...style(), index: i, total: n });
  };

  function render() {
    const p = store.get();
    const inp = carouselInputs(media.all(), p);
    const list = slides();
    ui$.sel = Math.max(0, Math.min(list.length - 1, ui$.sel));
    const canvases = [];
    const live = (c, getSlide) => {
      canvases.push([c, getSlide]);
      return c;
    };
    redrawAll = () => {
      const n = slides().length;
      for (const [c, get] of canvases) {
        const r = get();
        if (r && c.isConnected) paint(c, r.s, r.i, r.n ?? n);
      }
    };

    // suggested carousels
    const sugg = suggestCarousels(inp, { seed: ui$.seed });
    const recipeCard = (r) => {
      const minis = r.slides.slice(0, 3).map((s, i) => live(h('canvas', { width: 72, height: 90, class: 'car-mini', 'aria-hidden': 'true' }), () => ({ s, i, n: r.slides.length })));
      return h(
        'article',
        { class: `car-recipe${p.carousel && p.carousel.recipe === r.id ? ' on' : ''}` },
        h('div', { class: 'car-minis' }, minis),
        h('div', { class: 'car-recipe-body' },
          h('strong', {}, r.name),
          h('span', { class: 'muted tiny' }, `${r.slides.length} slides · ${r.why}`),
          button(p.carousel && p.carousel.recipe === r.id ? 'In use · start over' : 'Use this carousel', () => {
            if (list.length && !confirm('Replace the slides you have with this carousel?')) return;
            store.update((d) => (d.carousel = { recipe: r.id, slides: structuredClone(r.slides) }));
            ui$.sel = 0;
            toast(`“${r.name}” loaded. Change any slide below, then download.`);
            render();
          }, { variant: 'sm primary' })),
      );
    };

    const head = h(
      'header',
      { class: 'page-head' },
      h('div', {}, h('h2', {}, icon('image', 20), ' Carousel'), h('p', { class: 'muted small' }, 'Instagram carousel posts from your cover, clips, lyrics and edit. Slide 1 earns the swipe, each slide pays off one idea, the last asks for one thing. 1080×1350, Instagram’s tallest feed size.')),
      button('Back to editor', () => ui.openTab('templates'), { iconName: 'x', variant: 'ghost' }),
    );

    const parts = [
      head,
      h('section', {},
        h('div', { class: 'row car-sect-head' }, h('h3', { class: 'page-sect' }, 'Suggested carousels'), button('Other photos', () => ((ui$.seed += 1), render()), { iconName: 'repeat', variant: 'ghost sm' })),
        !inp.cover ? h('p', { class: 'muted tiny' }, 'Tip: set your cover art in the End card tab (or import it from Spotify) for the cover slides.') : null,
        !inp.images.length && !inp.clips.length ? h('p', { class: 'warn-list small' }, 'Add photos or clips in the Video tab to fill the slides.') : null,
        h('div', { class: 'car-recipes' }, sugg.map(recipeCard))),
    ];

    if (!list.length) {
      parts.push(h('p', { class: 'ts-empty' }, 'Pick a suggested carousel above to start. You can change every slide.'));
      root.replaceChildren(...parts);
      requestAnimationFrame(redrawAll);
      return;
    }

    // ---- strip
    const strip = h('div', { class: 'car-strip', role: 'listbox', 'aria-label': 'Slides' },
      list.map((s, i) => h('button', { type: 'button', role: 'option', 'aria-selected': i === ui$.sel ? 'true' : 'false', class: `car-thumb${i === ui$.sel ? ' on' : ''}`, onclick: () => ((ui$.sel = i), render()), 'aria-label': `Slide ${i + 1}${s.text ? `: ${s.text}` : ''}` },
        live(h('canvas', { width: 108, height: 135 }), () => ({ s: slides()[i], i })),
        h('span', {}, String(i + 1)))),
      list.length < 20 ? h('button', { type: 'button', class: 'car-thumb add', onclick: () => {
        setSlides((sl) => sl.splice(ui$.sel + 1, 0, makeSlide({ source: structuredClone(sl[ui$.sel].source), filter: sl[ui$.sel].filter })));
        ui$.sel++;
        render();
      }, 'aria-label': 'Add a slide' }, '+') : null);

    // ---- editor
    const s = list[ui$.sel];
    const big = live(h('canvas', { width: 432, height: 540, class: 'car-big', 'aria-label': `Slide ${ui$.sel + 1} of ${list.length}` }), () => ({ s: slides()[ui$.sel], i: ui$.sel }));
    const set = (fn, key) => setSlides((sl) => fn(sl[ui$.sel]), key);
    const sources = [
      ...(inp.cover ? [[`cover:${inp.cover.id}`, 'Cover art']] : []),
      ...inp.images.map((m) => [`image:${m.id}`, `Photo · ${m.name}`]),
      ...inp.clips.map((m) => [`clip:${m.id}`, `Frame from · ${m.name}`]),
      ...(inp.hasEdit ? [['edit:', 'Still from your edit (with lyrics and tab)']] : []),
      ['color:', 'Plain colour'],
    ];
    const srcKey = `${s.source.kind}:${s.source.mediaId || ''}`;
    const srcSel = h('select', { 'aria-label': 'Picture' }, sources.map(([v, l]) => h('option', { value: v, selected: v === srcKey }, l)));
    srcSel.addEventListener('change', () => {
      const [kind, id] = srcSel.value.split(':');
      set((x) => (x.source = { kind, mediaId: id || null, time: kind === 'clip' ? 1 : kind === 'edit' ? 0.3 : undefined, color: kind === 'color' ? '#111111' : undefined }));
      render();
    });
    let timeCtl = null;
    if (s.source.kind === 'clip' || s.source.kind === 'edit') {
      const rec = s.source.kind === 'clip' && media.get(s.source.mediaId);
      const max = s.source.kind === 'clip' ? Math.max(0.1, (rec && rec.duration) || 1) : 1;
      const r = h('input', { type: 'range', min: 0, max, step: s.source.kind === 'clip' ? 0.05 : 0.01, value: s.source.time ?? 0 });
      const lab = h('span', { class: 'muted tiny' });
      const show = () => (lab.textContent = s.source.kind === 'clip' ? `${Number(r.value).toFixed(2)} s` : `${Math.round(r.value * 100)}% through the video`);
      show();
      r.addEventListener('input', show);
      r.addEventListener('change', () => {
        set((x) => (x.source = { ...x.source, time: +Number(r.value).toFixed(2) }), 'cartime');
        render();
      });
      timeCtl = h('label', { class: 'field' }, h('span', { class: 'lbl' }, s.source.kind === 'clip' ? 'Which moment' : 'Where in the video'), r, lab);
    }
    const color = s.source.kind === 'color' ? h('input', { type: 'color', value: s.source.color || '#111111', 'aria-label': 'Colour' }) : null;
    if (color) color.addEventListener('change', () => (set((x) => (x.source = { ...x.source, color: color.value })), render()));
    const layout = h('select', { 'aria-label': 'Layout' }, LAYOUTS.map(([v, l]) => h('option', { value: v, selected: v === s.layout }, l)));
    layout.addEventListener('change', () => (set((x) => (x.layout = layout.value)), render()));
    const text = h('textarea', { rows: 2, 'aria-label': 'Slide text' });
    text.value = s.text;
    text.addEventListener('input', () => {
      set((x) => (x.text = text.value), `cartext${ui$.sel}`);
      redrawAll();
    });
    const sub = h('input', { type: 'text', value: s.sub, 'aria-label': 'Small text' });
    sub.addEventListener('input', () => {
      set((x) => (x.sub = sub.value), `carsub${ui$.sel}`);
      redrawAll();
    });
    // looks: this slide in every filter
    const looks = h('div', { class: 'car-looks', role: 'radiogroup', 'aria-label': 'Look' },
      FILTERS.map((f) => h('button', { type: 'button', role: 'radio', 'aria-checked': s.filter === f.id ? 'true' : 'false', class: `car-look${s.filter === f.id ? ' on' : ''}`, title: f.why, onclick: () => (set((x) => (x.filter = f.id)), render()) },
        live(h('canvas', { width: 72, height: 90, 'aria-hidden': 'true' }), () => ({ s: { ...slides()[ui$.sel], filter: f.id, text: '', sub: '' }, i: 1 })),
        h('span', {}, f.label))));
    const cur = FILTERS.find((f) => f.id === s.filter) || FILTERS[0];
    const move = (d) => {
      const j = ui$.sel + d;
      if (j < 0 || j >= list.length) return;
      setSlides((sl) => ([sl[ui$.sel], sl[j]] = [sl[j], sl[ui$.sel]]));
      ui$.sel = j;
      render();
    };
    const editor = h('div', { class: 'car-editor' },
      h('div', { class: 'car-preview' },
        big,
        h('div', { class: 'row car-nav' },
          button('', () => ((ui$.sel = Math.max(0, ui$.sel - 1)), render()), { iconName: 'arrowLeft', variant: 'ghost sm', title: 'Previous slide', disabled: ui$.sel === 0 }),
          h('span', { class: 'small' }, `Slide ${ui$.sel + 1} of ${list.length}`),
          button('', () => ((ui$.sel = Math.min(list.length - 1, ui$.sel + 1)), render()), { iconName: 'arrowRight', variant: 'ghost sm', title: 'Next slide', disabled: ui$.sel === list.length - 1 })),
        h('div', { class: 'row' },
          button('Move left', () => move(-1), { variant: 'ghost sm', disabled: ui$.sel === 0 }),
          button('Move right', () => move(1), { variant: 'ghost sm', disabled: ui$.sel === list.length - 1 }),
          button('Duplicate', () => {
            setSlides((sl) => sl.splice(ui$.sel + 1, 0, { ...structuredClone(sl[ui$.sel]), id: `${sl[ui$.sel].id}-copy-${Date.now().toString(36)}` }));
            ui$.sel++;
            render();
          }, { iconName: 'copy', variant: 'ghost sm', disabled: list.length >= 20 }),
          button('', () => {
            if (list.length <= 1) return toast('A carousel needs at least one slide.', 'error');
            setSlides((sl) => sl.splice(ui$.sel, 1));
            render();
          }, { iconName: 'trash', variant: 'ghost sm danger', title: 'Delete this slide' }))),
      h('div', { class: 'car-fields' },
        field('Picture', srcSel), timeCtl, color ? field('Colour', color) : null,
        field('Layout', layout),
        field('Text', text),
        field('Small text', sub),
        h('div', { class: 'lbl' }, 'Look'),
        looks,
        h('p', { class: 'muted tiny' }, cur.why),
        button('Use this look on every photo slide', () => {
          setSlides((sl) => sl.forEach((x) => !['cover', 'cta'].includes(x.layout) && (x.filter = s.filter)));
          toast(`${cur.label} on every photo slide`);
          render();
        }, { variant: 'ghost sm' })));

    // ---- caption + download
    const cap = captionPicker({ project: p, settings, kind: 'carousel', slides: list.length });
    const pngs = async () => {
      const out = [];
      for (let i = 0; i < slides().length; i++) {
        const c = document.createElement('canvas');
        c.width = SLIDE_W;
        c.height = SLIDE_H;
        paint(c, slides()[i], i, slides().length);
        out.push(await new Promise((res) => c.toBlob(res, 'image/png')));
      }
      return out;
    };
    const waitAssets = async () => {
      // make sure every clip frame / edit still is ready before drawing full size
      for (const x of slides()) assets.image(x.source);
      await Promise.all([...pending.values()]);
    };
    const base = slug(`${inp.title || p.name}-carousel`);
    const dlZip = async () => {
      await waitAssets();
      const blobs = await pngs();
      const files = await Promise.all(blobs.map(async (b, i) => ({ name: `${base}-${String(i + 1).padStart(2, '0')}.png`, bytes: new Uint8Array(await b.arrayBuffer()) })));
      files.push({ name: `${base}-caption.txt`, bytes: new TextEncoder().encode(cap.currentText()) });
      download(new Blob([zipStore(files)], { type: 'application/zip' }), `${base}.zip`);
      toast(`Downloaded ${blobs.length} slides and the caption`);
    };
    const dlOne = async () => {
      await waitAssets();
      const c = document.createElement('canvas');
      c.width = SLIDE_W;
      c.height = SLIDE_H;
      paint(c, slides()[ui$.sel], ui$.sel, slides().length);
      download(await new Promise((res) => c.toBlob(res, 'image/png')), `${base}-${String(ui$.sel + 1).padStart(2, '0')}.png`);
    };
    const share = async () => {
      await waitAssets();
      const files = (await pngs()).map((b, i) => new File([b], `${base}-${i + 1}.png`, { type: 'image/png' }));
      try {
        await navigator.clipboard.writeText(cap.currentText()).catch(() => {});
        await navigator.share({ files, text: cap.currentText() });
      } catch (e) {
        if (e.name !== 'AbortError') toast(`Sharing failed: ${e.message}`, 'error');
      }
    };
    const probe = new File([new Blob(['x'], { type: 'image/png' })], 'x.png', { type: 'image/png' });

    parts.push(
      h('section', {}, h('h3', { class: 'page-sect' }, 'Your slides'), strip, editor),
      h('div', { class: 'page-cols' },
        h('section', {}, h('h3', { class: 'page-sect' }, 'Caption'), cap),
        h('section', {}, h('h3', { class: 'page-sect' }, 'Download'),
          h('p', { class: 'small' }, 'Upload the slides in order as one post. Instagram crops every slide to the first slide’s shape, so keep them all 4:5.'),
          h('div', { class: 'row' },
            button('Download all slides (.zip)', dlZip, { iconName: 'download', variant: 'primary' }),
            button('This slide (PNG)', dlOne, { iconName: 'image', variant: 'ghost' }),
            ui.editInPhoto ? button('Edit in Photo Studio', async () => {
              await waitAssets();
              await ui.editInPhoto(await pngs(), base);
            }, { iconName: 'layout', variant: 'ghost', title: 'Open these slides as a carousel in the Photo Studio, to add text, shapes and looks' }) : null,
            button('Share to Instagram…', share, { iconName: 'share', variant: 'ghost', disabled: !canShareFiles(probe) })),
          !canShareFiles(probe) ? h('p', { class: 'muted tiny' }, 'Sharing straight to the app works from a phone browser. On a computer, download and upload them.') : null,
          h('details', { class: 'tiny muted' }, h('summary', {}, 'Why carousels are built this way'),
            h('div', {}, CAROUSEL_SOURCES.map((x, i) => [i ? ' · ' : '', h('a', { href: x.url, target: '_blank', rel: 'noopener noreferrer' }, x.label)]))))),
    );
    root.replaceChildren(...parts.filter(Boolean));
    requestAnimationFrame(redrawAll);
  }

  render();
  return { el: root, render };
}
