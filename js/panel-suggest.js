// The "Suggested" tab: three ready-made edits built from your song, clips, Guitar Pro file and lyrics.
// Each card has a playable preview (with the song), a short plan, and "Use this edit" (undo works).
import { h, button, section, toast } from './dom.js';
import { renderFrame } from './renderer.js';
import { layoutClips } from './core.js';
import { media, tabTimeline } from './media.js';
import { inventory, inventorySignature, canSuggest, planTakes, applyTake } from './suggest.js';
import { coverPalette } from './backgrounds.js';

export const suggestState = { seed: 0, seen: '' };

/** Is there a suggestion the user hasn't looked at yet (for the dot on the rail)? */
export function hasNewSuggestions(p) {
  const inv = inventory(media.all(), p);
  return canSuggest(inv) && inventorySignature(inv) !== suggestState.seen;
}

let stopPreview = null;

/** Own video elements per card so previews don't fight the editor's playback. */
function previewEnv(base, els, onFrame) {
  return {
    ...base,
    preview: true,
    sourceFor: (clip) => {
      const rec = media.get(clip.mediaId);
      if (!rec) return null;
      if (rec.kind === 'image') return rec.el;
      let el = els.get(rec.id);
      if (!el) {
        el = document.createElement('video');
        el.muted = true;
        el.playsInline = true;
        el.preload = 'auto';
        el.src = rec.url;
        el.addEventListener('seeked', onFrame);
        el.addEventListener('loadeddata', onFrame);
        els.set(rec.id, el);
      }
      return el;
    },
  };
}

function syncPreviewVideos(draft, t, els, playing) {
  const laid = layoutClips(draft.clips);
  const active = laid.find((l) => t >= l.start && t < l.end);
  for (const [id, el] of els) {
    const on = active && active.clip.mediaId === id;
    if (!on) {
      if (!el.paused) el.pause();
      continue;
    }
    const target = active.clip.in + (t - active.start) * (active.clip.speed || 1);
    if (!playing) {
      if (Math.abs(el.currentTime - target) > 0.05 && !el.seeking) el.currentTime = target;
      continue;
    }
    if (el.paused || Math.abs(el.currentTime - target) > 0.35) {
      if (!el.seeking) el.currentTime = target;
      el.play().catch(() => {});
    }
  }
}

export function buildSuggestPanel({ store, engine, ui }) {
  if (stopPreview) stopPreview();
  const p = store.get();
  const inv = inventory(media.all(), p);
  const have = h(
    'div',
    { class: 'chips sugg-have' },
    h('span', { class: `chip-static${inv.song ? ' ok' : ''}` }, inv.song ? `Song: ${inv.song.name}` : 'No song yet'),
    h('span', { class: `chip-static${inv.clips.length ? ' ok' : ''}` }, `${inv.clips.length} clip${inv.clips.length === 1 ? '' : 's'}`),
    h('span', { class: `chip-static${inv.sources.length ? ' ok' : ''}` }, inv.sources.length ? `Guitar Pro: ${[inv.guitar && 'guitar', inv.bass && 'bass', inv.drums && 'drums'].filter(Boolean).join(', ')}` : 'No Guitar Pro file'),
    h('span', { class: `chip-static${inv.lyrics ? ' ok' : ''}` }, `${inv.lyrics} lyric line${inv.lyrics === 1 ? '' : 's'}`),
    inv.cutouts ? h('span', { class: 'chip-static ok' }, `${inv.cutouts} cut-out${inv.cutouts === 1 ? '' : 's'}`) : null,
  );
  if (!canSuggest(inv)) {
    return h(
      'div',
      {},
      section(
        'Suggested edits',
        h('p', { class: 'small' }, 'Add a song and a few clips, and Promo Studio builds three ready-to-post edits for you: the hook, cuts on the beat, a fitting look and, if you add one, your Guitar Pro tab lined up with the song.'),
        have,
        h('div', { class: 'row' },
          button('Add media', () => ui.openTab('media'), { iconName: 'upload', variant: 'primary' }),
          button('Paste lyrics', () => ui.openTab('lyrics'), { iconName: 'mic', variant: 'ghost' }),
        ),
      ),
    );
  }
  suggestState.seen = inventorySignature(inv);
  const cover = p.endCard.coverMediaId && media.get(p.endCard.coverMediaId);
  const palette = cover && cover.el ? coverPalette(cover.el) : null;
  const tabTempo = (id, track) => {
    const tl = tabTimeline(media.get(id), track);
    return tl && tl.tempo;
  };
  const seed = suggestState.seed;
  const takes = planTakes(inv, { seed });
  const base = engine.env(false);

  const cards = takes.map((take, i) => {
    const draft = structuredClone(p);
    const facts = applyTake(draft, take, { inv, seed: seed + i, palette, tabTempo });
    draft.look.overlay = 'off';
    const W = 135;
    const dims = engine.dims();
    const H = Math.round((W * dims.h) / dims.w);
    const c = h('canvas', { width: W * 2, height: H * 2, class: 'sugg-thumb', 'aria-label': `Preview of ${take.title}` });
    const g = c.getContext('2d');
    const els = new Map();
    const contentEnd = draft.duration - (draft.endCard.enabled ? draft.endCard.duration : 0);
    const stillT = Math.min(contentEnd * 0.4, 6);
    let t = stillT;
    let playing = false;
    const draw = () => {
      try {
        renderFrame(g, c.width, c.height, draft, t, env);
      } catch (e) {
        console.warn('suggestion preview failed', e);
      }
    };
    const env = previewEnv(base, els, () => !playing && draw());
    requestAnimationFrame(() => {
      syncPreviewVideos(draft, t, els, false);
      draw();
    });
    let audio = null;
    let raf = 0;
    const playBtn = button('Play preview', null, { iconName: 'play', variant: 'sm' });
    const stop = () => {
      playing = false;
      cancelAnimationFrame(raf);
      if (audio) audio.pause();
      els.forEach((el) => el.pause());
      playBtn.querySelector('span:last-child').textContent = 'Play preview';
      if (stopPreview === stop) stopPreview = null;
    };
    playBtn.addEventListener('click', () => {
      if (playing) return stop();
      if (stopPreview) stopPreview();
      if (engine.playing) engine.pause();
      stopPreview = stop;
      playing = true;
      playBtn.querySelector('span:last-child').textContent = 'Stop';
      t = 0;
      const songRec = draft.song && media.get(draft.song.mediaId);
      if (songRec) {
        audio = audio || new Audio(songRec.url);
        audio.currentTime = draft.song.offset;
        audio.volume = 0.8;
        audio.play().catch(() => {});
      }
      const t0 = performance.now();
      let last = 0;
      const tick = (now) => {
        if (!playing) return;
        if (!c.isConnected) return stop();
        t = (now - t0) / 1000;
        if (t >= draft.duration) {
          t = stillT;
          stop();
          syncPreviewVideos(draft, t, els, false);
          return draw();
        }
        if (now - last > 1000 / 24) {
          last = now;
          syncPreviewVideos(draft, t, els, true);
          draw();
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    const use = button('Use this edit', () => {
      stop();
      store.update((d) => applyTake(d, take, { inv, seed: seed + i, palette, tabTempo }));
      engine.seek(0);
      toast(`“${take.title}” edit applied. Undo (Ctrl+Z) to go back.`);
      ui.refreshPanels(true);
    }, { iconName: 'check', variant: 'sm primary' });
    return h(
      'div',
      { class: `sugg-card${p.suggestion === take.id ? ' on' : ''}` },
      c,
      h(
        'div',
        { class: 'sugg-info' },
        h('strong', {}, `${i === 0 ? 'Best match · ' : ''}${take.title}`),
        h('ul', { class: 'sugg-facts tiny' }, facts.map((f) => h('li', {}, f))),
        h('div', { class: 'row' }, playBtn, use),
      ),
    );
  });

  return h(
    'div',
    {},
    section(
      'Suggested edits',
      h('p', { class: 'muted small' }, 'Three edits built from what you added. Play one to see and hear it, then use it. It replaces the video track and look; your lyrics, text and files stay.'),
      have,
      h('div', { class: 'sugg-list' }, cards),
      h('div', { class: 'row' },
        button('Show 3 different takes', () => {
          suggestState.seed += 1;
          ui.refreshPanels(true);
        }, { iconName: 'repeat', variant: 'ghost' }),
      ),
      inv.lyrics < 2 ? h('p', { class: 'muted tiny' }, 'Tip: paste your lyrics in the Lyrics tab to get lyric-video suggestions.') : null,
      !inv.sources.length ? h('p', { class: 'muted tiny' }, 'Tip: add a Guitar Pro file (Media) to get band edits with your tab and drums.') : null,
    ),
  );
}
