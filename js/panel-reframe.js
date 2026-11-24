// Clip inspector section: Auto-reframe (keep the person in the picture) and, in a vertical or square
// format, Reframe every clip. The work itself is in reframe.js.
import { h, button, section, toast } from './dom.js';
import { ASPECTS } from './core.js';
import { findClip } from './state.js';
import { TIGHTNESS, WHICH, BATCH, reframeClips, reframeStatus, reframeBusy, cancelReframe, onReframeChange } from './reframe.js';

const OPTS_KEY = 'pvm.reframe.v1';
function loadOpts() {
  try {
    const o = JSON.parse(localStorage.getItem(OPTS_KEY) || '{}');
    return { tight: TIGHTNESS.some(([k]) => k === o.tight) ? o.tight : 'loose', which: WHICH.some(([k]) => k === o.which) ? o.which : 'largest' };
  } catch {
    return { tight: 'loose', which: 'largest' };
  }
}
function saveOpts(o) {
  try {
    localStorage.setItem(OPTS_KEY, JSON.stringify(o));
  } catch {
    /* storage full: the choice lasts for this visit */
  }
}

const frameOf = (p) => {
  const a = ASPECTS[p.aspect] || ASPECTS['9:16'];
  return { W: a.w, H: a.h };
};
/** Narrower than 16:9 footage: 9:16, the Spotify Canvas, 4:5 and 1:1. */
export const reframeFormat = (p) => {
  const f = frameOf(p);
  return f.W / f.H < 16 / 9 - 0.01;
};

/** Main-track video clips with their media, for Reframe every clip. */
export function everyClip(p, media) {
  return (p.clips || []).filter((c) => c.kind === 'video').map((clip) => ({ clip, rec: media.get(clip.mediaId) })).filter((x) => x.rec && (x.rec.url || x.rec.loaded === false));
}

function select(label, value, choices, onChange) {
  const s = h('select', { 'aria-label': label }, choices.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
  s.addEventListener('change', () => onChange(s.value));
  return h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), s);
}

/**
 * The "Auto-reframe" section of a video clip's inspector.
 * ctx: { store, media, G (the current clip), rec (its media) }
 */
export function reframeSection({ store, media, G, rec }) {
  const clipId = G().id;
  const opts = loadOpts();
  const body = h('div', { class: 'reframe' });
  const status = h('p', { class: 'muted tiny reframe-status', role: 'status', 'aria-live': 'polite' });

  const run = async (items, key) => {
    const p = store.get();
    try {
      const s = await reframeClips(store, (d, id) => findClip(d, id).clip, items, frameOf(p), loadOpts(), key);
      if (s.done) toast(items.length === 1 ? 'Reframed. Undo puts it back.' : `Reframed ${s.done} clip${s.done === 1 ? '' : 's'}`);
    } catch (e) {
      toast(e.message || String(e), 'error');
    }
  };

  const paint = () => {
    const p = store.get();
    const busy = reframeBusy();
    const mine = reframeStatus(clipId);
    const batch = reframeStatus(BATCH);
    const st = mine.status === 'running' ? mine : batch.status === 'running' ? batch : (mine.at || 0) >= (batch.at || 0) ? mine : batch;
    const showing = st.status && st.status !== 'idle' ? st : null;
    const vertical = reframeFormat(p);
    const n = everyClip(p, media).length;
    status.textContent = showing
      ? showing.message
      : vertical
        ? 'Finds the main person in this clip and moves the crop to keep them in the frame. It runs in this browser; nothing is uploaded.'
        : 'Your format is as wide as most footage, so there is little to crop. Follow closely zooms in on the person.';
    status.classList.toggle('error-text', !!showing && showing.status === 'error');
    body.replaceChildren(
      h('div', { class: 'grid2' },
        select('How tight', opts.tight, TIGHTNESS, (v) => saveOpts((opts.tight = v, opts))),
        select('When there are several people', opts.which, WHICH, (v) => saveOpts((opts.which = v, opts))),
      ),
      status,
      busy
        ? h('div', { class: 'row' }, button('Cancel', () => cancelReframe(), { variant: 'sm ghost' }))
        : h('div', { class: 'row' },
            button('Auto-reframe this clip', () => {
              const clip = G();
              if (!clip.id) return;
              run([{ clip, rec }], clipId);
            }, { variant: 'sm', iconName: 'sparkle' }),
            vertical && n > 1 ? button(`Reframe every clip (${n})`, () => run(everyClip(store.get(), media), BATCH), { variant: 'sm ghost' }) : null,
          ),
    );
  };
  paint();
  const off = onReframeChange(() => {
    if (body._mounted && !body.isConnected) return off();
    if (body.isConnected) body._mounted = true;
    paint();
  });
  return section('Auto-reframe', body);
}
