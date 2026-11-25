// Pop-up editing tips: small cards at the bottom right of the preview, shown as you add layers,
// clips, the song or lyrics. Each has a one-click fix (undo works), "Got it", and "Don't show this
// again". Tips can be turned off in the Look tab.
import { h, icon, button, iconButton, setFold } from './dom.js';
import { media } from './media.js';
import { tipsFor, clearLyricY } from './tips.js';
import { applyLayout } from './templates.js';

const KEY = 'pvm.tips.v1';
export function tipSettings() {
  try {
    return { off: false, never: [], ...(JSON.parse(localStorage.getItem(KEY)) || {}) };
  } catch {
    return { off: false, never: [] };
  }
}
export function saveTipSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

const FIX_LABEL = { vizSource: 'Use the stem', lyricsClear: 'Move the lyrics', layout: 'Fit to the clear area', tab: 'Show me', lyricIdeas: 'See ideas', postcheck: 'Open post check' };
const SHOW_MS = 14000;
const AGAIN_MS = 10 * 60 * 1000; // the same tip at most every 10 minutes

export function createTips({ store, ui, host, postcheck }) {
  const box = h('div', { class: 'tips', role: 'status', 'aria-live': 'polite' });
  host.append(box);
  const shownAt = new Map();
  let prev = store.get();

  const runFix = (f) => {
    if (f.kind === 'vizSource') store.update((d) => {
      const L = (d.layers || []).find((x) => x.id === f.layerId);
      if (L) L.source = f.source;
    });
    else if (f.kind === 'lyricsClear') store.update((d) => {
      const L = (d.layers || []).find((x) => x.id === f.layerId);
      if (L) d.lyricStyle.y = clearLyricY(d, L);
    });
    else if (f.kind === 'layout') store.update((d) => applyLayout(d, d.layout && d.layout !== 'full' ? d.layout : 'all'));
    else if (f.kind === 'lyricIdeas') {
      setFold('start-suggested', true);
      ui.openTab('start');
      requestAnimationFrame(() => document.querySelector('.lyric-ideas')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    } else if (f.kind === 'postcheck') postcheck && postcheck.open();
    else if (f.kind === 'tab') {
      if (f.fold) setFold(f.fold, true);
      ui.openTab(f.tab);
    }
  };

  function show(tip) {
    const card = h('div', { class: 'tip-card', 'data-tip': tip.id });
    let timer = null;
    const close = () => {
      clearTimeout(timer);
      card.classList.add('out');
      setTimeout(() => card.remove(), 180);
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(close, SHOW_MS);
    };
    card.addEventListener('pointerenter', () => clearTimeout(timer));
    card.addEventListener('pointerleave', arm);
    card.addEventListener('focusin', () => clearTimeout(timer));
    card.append(
      iconButton('x', 'Close this tip', close, 'ghost tip-x'),
      h('div', { class: 'tip-text' }, icon('sparkle', 16), h('span', {}, tip.text)),
      h(
        'div',
        { class: 'tip-acts' },
        tip.fix ? button(FIX_LABEL[tip.fix.kind] || 'Fix it', () => (runFix(tip.fix), close()), { variant: 'sm primary' }) : null,
        button('Got it', close, { variant: 'sm ghost' }),
        h('button', {
          type: 'button',
          class: 'link tiny',
          onclick: () => {
            const s = tipSettings();
            s.never = [...new Set([...s.never, tip.id])];
            saveTipSettings(s);
            close();
          },
        }, 'Don’t show this again'),
      ),
    );
    box.append(card);
    while (box.children.length > 2) box.firstChild.remove();
    arm();
  }

  function onChange(next, meta) {
    const before = prev;
    prev = next;
    if (meta.type !== 'update') return; // undo, redo and new projects don't trigger tips
    const s = tipSettings();
    if (s.off) return;
    const stems = media.all().filter((m) => m.kind === 'audio' && (!next.song || m.id !== next.song.mediaId)).map((m) => ({ id: m.id, name: m.name }));
    const now = Date.now();
    for (const tip of tipsFor(before, next, { stems })) {
      // a tip about a different layer is new news; the same one waits AGAIN_MS
      const key = `${tip.id}:${(tip.fix && tip.fix.layerId) || ''}`;
      if (s.never.includes(tip.id) || now - (shownAt.get(key) || -Infinity) < AGAIN_MS) continue;
      shownAt.set(key, now);
      show(tip);
      break; // one at a time
    }
  }
  store.subscribe(onChange);
  return { el: box };
}
