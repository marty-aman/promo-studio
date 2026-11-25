// The "Post check" pill in the top bar: a score from the posting playbook, and a pop-over listing
// what will help or hurt, each with a one-click fix (undo works) or a jump to where you fix it.
import { findHook } from './core.js';
import { media } from './media.js';
import { h, icon, button, iconButton, toast, setFold } from './dom.js';
import { escLayer } from './closeable.js';
import { postCheck } from './postcheck.js';
import { applyPlaybook, PLAYBOOK_ACTIONS } from './inspiration.js';
import { applyLayout } from './templates.js';
import { bestLyric } from './captions.js';

const LEVEL = { bad: ['Hurts', 'x'], warn: ['Weak', 'activity'], tip: ['Tip', 'sparkle'], good: ['Good', 'check'] };

export function createPostCheck({ store, engine, ui }) {
  let open = false;
  let last = '';
  const pill = h('button', { type: 'button', class: 'postcheck-pill', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' });
  const pop = h('div', { class: 'postcheck-pop', role: 'dialog', 'aria-label': 'Post check', hidden: true });
  const el = h('div', { class: 'postcheck' }, pill, pop);

  const fixLabel = (f) =>
    f.kind === 'playbook' ? (PLAYBOOK_ACTIONS[f.action] && PLAYBOOK_ACTIONS[f.action].label) || 'Fix it' : f.kind === 'aspect' ? 'Switch to 9:16' : f.kind === 'layout' ? 'Fit text to all three apps' : 'Show me';

  const runFix = (f) => {
    if (f.kind === 'tab') {
      if (f.fold) setFold(f.fold, true);
      setOpen(false);
      ui.openTab(f.tab);
      return;
    }
    if (f.kind === 'aspect') store.update((d) => (d.aspect = '9:16'));
    else if (f.kind === 'layout') store.update((d) => applyLayout(d, 'all'));
    else if (f.kind === 'playbook') {
      const p = store.get();
      const from = p.song ? p.song.offset : 0;
      const lyric = bestLyric(p.lyrics, from, from + 15);
      const hookStart = (len) => {
        const rec = p.song && media.get(p.song.mediaId);
        return rec && rec.envelope ? findHook(rec.envelope, rec.envRate, len, rec.duration) : null;
      };
      store.update((d) => applyPlaybook(d, f.action, { hookStart, lyric: lyric && lyric.text }));
      engine.seek(0);
      const done = PLAYBOOK_ACTIONS[f.action] && PLAYBOOK_ACTIONS[f.action].done;
      if (done) toast(`${done} Undo (Ctrl+Z) to go back.`, 'info', 5000);
    }
  };

  const layer = escLayer(() => open, () => setOpen(false));
  function setOpen(v) {
    if (v && !open) layer.opened();
    open = v;
    pop.hidden = !v;
    pill.setAttribute('aria-expanded', v ? 'true' : 'false');
    if (v) render(true);
  }
  pill.addEventListener('click', () => setOpen(!open));
  document.addEventListener('pointerdown', (e) => open && !el.contains(e.target) && setOpen(false));
  // Esc closes it (closeable.js) and focus goes back to the pill

  function render(force = false) {
    const r = postCheck(store.get());
    const sig = JSON.stringify([r.score, r.items.map((i) => i.id + i.level + i.title)]);
    if (!force && sig === last) return r;
    last = sig;
    pill.className = `postcheck-pill ${r.verdict}`;
    pill.title = 'How this edit is likely to do, from the posting playbook';
    pill.replaceChildren(icon('gauge', 16), h('span', { class: 'pc-label' }, r.label), h('b', { class: 'pc-score' }, String(r.score)));
    if (!open) return r;
    const items = r.items.map((it) =>
      h(
        'li',
        { class: `pc-item ${it.level}` },
        h('span', { class: 'pc-ic', title: LEVEL[it.level][0] }, icon(LEVEL[it.level][1], 14)),
        h('div', {}, h('strong', {}, it.title), h('p', { class: 'muted tiny' }, it.detail), it.fix ? button(fixLabel(it.fix), () => runFix(it.fix), { variant: `sm${it.fix.kind === 'tab' ? ' ghost' : ' primary'}` }) : null),
      ),
    );
    pop.replaceChildren(
      h('div', { class: 'pc-head' }, h('div', { class: `pc-big ${r.verdict}` }, String(r.score)), h('div', {}, h('strong', {}, r.label), h('p', { class: 'muted tiny' }, 'Checked against the posting playbook (Start → Inspiration). A guide, not a promise: the song and the footage matter most.')), iconButton('x', 'Close the post check', () => (layer.close(false), pill.focus()), 'ghost pc-x')),
      h('ul', { class: 'pc-list' }, items),
    );
    return r;
  }
  return { el, refresh: () => render(false), open: () => setOpen(true) };
}
