// The Manager workspace: its own left nav and pages, on its own store (with undo), saved in this
// browser and backed up to a file. The video studio stays as it was; "Make a promo" hands a song over.
import { h, icon, button, toast, download, pickFiles } from '../dom.js';
import { createStore } from '../state.js';
import { loadManager, saveManager, backupFile, parseBackup, todayISO } from './model.js';
import { buildHome } from './page-home.js';
import { buildSongs } from './page-songs.js';
import { buildShows } from './page-shows.js';
import { buildPlanner } from './page-planner.js';
import { buildContent } from './page-content.js';
import { buildCalendar } from './page-calendar.js';
import { buildEPK } from './page-epk.js';
import { buildMoney } from './page-money.js';

const VIEW_KEY = 'pvm.manager.view.v1';
export const MANAGER_PAGES = [
  { id: 'home', label: 'Home', icon: 'home', build: buildHome },
  { id: 'songs', label: 'Songs', icon: 'music', build: buildSongs },
  { id: 'shows', label: 'Shows', icon: 'ticket', build: buildShows },
  { id: 'planner', label: 'Show planner', icon: 'mapPin', build: buildPlanner },
  { id: 'content', label: 'Content', icon: 'chart', build: buildContent },
  { id: 'calendar', label: 'Calendar', icon: 'calendar', build: buildCalendar },
  { id: 'epk', label: 'Press kit', icon: 'clipboard', build: buildEPK },
  { id: 'money', label: 'Money', icon: 'dollar', build: buildMoney },
];

/** Small form helpers shared by the pages. Every control has a stable data-k so focus survives a re-render. */
export function formKit(update) {
  const text = (k, label, value, set, { type = 'text', placeholder = '', rows = 0, hint = '', list = null } = {}) => {
    const el = rows
      ? h('textarea', { rows, placeholder, 'data-k': k }, value || '')
      : h('input', { type, placeholder, value: value ?? '', 'data-k': k, list });
    if (rows) el.value = value || '';
    el.addEventListener('change', () => update((d) => set(d, type === 'number' ? (el.value === '' ? '' : +el.value) : el.value)));
    return label ? h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, label), el, hint ? h('span', { class: 'mf-h' }, hint) : null) : el;
  };
  const select = (k, label, value, options, set) => {
    const el = h('select', { 'data-k': k }, options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
    el.addEventListener('change', () => update((d) => set(d, el.value)));
    return label ? h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, label), el) : el;
  };
  const check = (k, value, set, label = '') => {
    const el = h('input', { type: 'checkbox', checked: !!value, 'data-k': k, 'aria-label': label || null });
    el.addEventListener('change', () => update((d) => set(d, el.checked)));
    return el;
  };
  return { text, select, check };
}

export function createManager({ root, studio }) {
  const store = createStore(loadManager());
  let view = { page: 'home', id: null, tab: 'overview' };
  try {
    view = { ...view, ...(JSON.parse(localStorage.getItem(VIEW_KEY)) || {}) };
  } catch {
    /* default view */
  }
  if (!MANAGER_PAGES.some((p) => p.id === view.page)) view.page = 'home';

  const nav = h('nav', { class: 'mgr-nav', 'aria-label': 'Manager pages' });
  const main = h('main', { class: 'mgr-main', tabindex: '-1' });
  const status = h('span', { class: 'muted tiny mgr-saved' }, 'Saved in this browser');
  const tools = h(
    'div',
    { class: 'mgr-tools' },
    status,
    button('Back up', () => download(new Blob([backupFile(store.get())], { type: 'application/json' }), `band-manager-${todayISO()}.json`), { iconName: 'download', variant: 'sm ghost', title: 'Download everything in the manager as one file' }),
    button('Restore', async () => {
      const [f] = await pickFiles('.json,application/json', false);
      if (!f) return;
      try {
        const m = parseBackup(await f.text());
        if (!confirm(`Replace everything in the manager with this backup (${m.songs.length} songs, ${m.shows.length} shows)?`)) return;
        store.replace(m);
        toast('Backup restored');
      } catch (e) {
        toast(e.message, 'error', 5000);
      }
    }, { iconName: 'upload', variant: 'sm ghost', title: 'Load a backup file' }),
  );
  root.replaceChildren(h('div', { class: 'mgr-side' }, nav, tools), main);

  const go = (page, id = null, tab = null) => {
    view = { page, id, tab: tab || (page === view.page && id === view.id ? view.tab : 'overview') };
    localStorage.setItem(VIEW_KEY, JSON.stringify(view));
    render(true);
  };
  const ctx = {
    store,
    update: (fn, key) => store.update(fn, key),
    get view() {
      return view;
    },
    go,
    setTab: (tab) => go(view.page, view.id, tab),
    studio,
    today: () => todayISO(),
    form: null,
  };
  ctx.form = formKit(ctx.update);

  function renderNav() {
    nav.replaceChildren(
      ...MANAGER_PAGES.map((p) =>
        h('button', { type: 'button', class: `mgr-nav-btn${view.page === p.id ? ' on' : ''}`, 'aria-current': view.page === p.id ? 'page' : null, onclick: () => go(p.id) }, icon(p.icon, 18), h('span', {}, p.label)),
      ),
    );
  }

  function render(scrollTop = false) {
    renderNav();
    // keep the focused field (and caret) through the rebuild
    const a = document.activeElement;
    const k = a && main.contains(a) && a.dataset ? a.dataset.k : null;
    const sel = k && 'selectionStart' in a ? [a.selectionStart, a.selectionEnd] : null;
    const top = main.scrollTop;
    const page = MANAGER_PAGES.find((p) => p.id === view.page) || MANAGER_PAGES[0];
    main.replaceChildren(page.build(ctx));
    main.scrollTop = scrollTop ? 0 : top;
    if (k) {
      const el = main.querySelector(`[data-k="${CSS.escape(k)}"]`);
      if (el) {
        el.focus({ preventScroll: true });
        if (sel && el.setSelectionRange) {
          try {
            el.setSelectionRange(sel[0], sel[1]);
          } catch {
            /* not a text field */
          }
        }
      }
    }
  }

  let saveTimer = null;
  store.subscribe(() => {
    render();
    status.textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => (status.textContent = saveManager(store.get()) ? 'Saved in this browser' : 'Could not save (storage full?)'), 400);
  });

  return {
    store,
    show: () => render(),
    go,
    undo: () => store.canUndo() && store.undo(),
    redo: () => store.canRedo() && store.redo(),
  };
}
