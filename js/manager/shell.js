// The Manager workspace: its own left nav and pages, on its own store (with undo), saved in this
// browser and backed up to a file. The video studio stays as it was; "Make a promo" hands a song over.
import { h, icon, button, toast, download, pickFiles } from '../dom.js';
import { createStore } from '../state.js';
import { openDriveSetup } from '../gdrive.js';
import { todayISO } from './model.js';
import { loadWorkspace, saveWorkspace, viewOf, mergeView, addArtist, removeArtist, artistList, workspaceBackup, parseWorkspaceBackup } from './artists.js';
import { buildHome } from './page-home.js';
import { buildSongs } from './page-songs.js';
import { buildShows } from './page-shows.js';
import { buildPlanner } from './page-planner.js';
import { buildContent } from './page-content.js';
import { buildCalendar } from './page-calendar.js';
import { buildEPK } from './page-epk.js';
import { buildPhotos } from './page-photos.js';
import { buildMoney } from './page-money.js';
import { buildTours } from './page-tours.js';
import { buildStats } from './page-stats.js';

const VIEW_KEY = 'pvm.manager.view.v1';
export const MANAGER_PAGES = [
  { id: 'home', label: 'Home', icon: 'home', build: buildHome },
  { id: 'songs', label: 'Songs', icon: 'music', build: buildSongs },
  { id: 'shows', label: 'Shows', icon: 'ticket', build: buildShows },
  { id: 'planner', label: 'Show planner', icon: 'mapPin', build: buildPlanner },
  { id: 'tours', label: 'Tours', icon: 'route', build: buildTours },
  { id: 'stats', label: 'Streaming stats', icon: 'activity', build: buildStats },
  { id: 'content', label: 'Content', icon: 'chart', build: buildContent },
  { id: 'calendar', label: 'Calendar', icon: 'calendar', build: buildCalendar },
  { id: 'photos', label: 'Photos', icon: 'image', build: buildPhotos },
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
  let ws = loadWorkspace();
  saveWorkspace(ws); // an older single-artist save is rewritten as a workspace right away
  const store = createStore(viewOf(ws));
  const current = () => (ws = mergeView(ws, store.get())); // the workspace with the open artist's edits folded in
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
    button('Back up', () => download(new Blob([workspaceBackup(current())], { type: 'application/json' }), `band-manager-${todayISO()}.json`), { iconName: 'download', variant: 'sm ghost', title: 'Download every artist in the manager as one file' }),
    button('Restore', async () => {
      const [f] = await pickFiles('.json,application/json', false);
      if (!f) return;
      try {
        const next = parseWorkspaceBackup(await f.text());
        const songs = next.artists.reduce((n, a) => n + a.songs.length, 0);
        if (!confirm(`Replace everything in the manager with this backup (${next.artists.length} artist${next.artists.length > 1 ? 's' : ''}, ${songs} songs)?`)) return;
        ws = next;
        store.replace(viewOf(ws));
        toast('Backup restored');
      } catch (e) {
        toast(e.message, 'error', 5000);
      }
    }, { iconName: 'upload', variant: 'sm ghost', title: 'Load a backup file' }),
    button('Google Drive', () => openDriveSetup(), { iconName: 'cloud', variant: 'sm ghost', title: 'Connect Google Drive so you can pick files from it' }),
  );
  const switcher = h('div', { class: 'mgr-artist' });
  /** The artist's profile photo, or its first letter when it has none. */
  const avatar = (a, cls = '') => {
    const ph = a.photoId && studio.mediaInfo ? studio.mediaInfo(a.photoId) : null;
    return ph ? h('span', { class: `mgr-artist-dot photo ${cls}`, 'aria-hidden': 'true' }, h('img', { src: ph.url, alt: '' })) : h('span', { class: `mgr-artist-dot ${cls}`, 'aria-hidden': 'true' }, (a.name[0] || '?').toUpperCase());
  };
  root.replaceChildren(h('div', { class: 'mgr-side' }, h('div', {}, switcher, nav), tools), main);

  // ---- artists
  const switchArtist = (id, page = null, itemId = null, tab = null) => {
    current();
    if (!ws.artists.some((a) => a.id === id)) return;
    ws = { ...ws, current: id };
    saveWorkspace(ws);
    store.replace(viewOf(ws)); // a fresh undo history per artist
    studio.artistsChanged && studio.artistsChanged();
    if (page) go(page, itemId, tab);
  };
  const newArtist = () => {
    const name = prompt('Artist or band name', '');
    if (!name || !name.trim()) return;
    const [next, id] = addArtist(current(), name.trim());
    ws = next;
    switchArtist(id, 'epk');
    toast(`Added ${name.trim()}. Fill in the profile here; venues, bands and contacts are shared.`, 'info', 5000);
  };
  const deleteArtist = (id) => {
    const w = current();
    const a = w.artists.find((x) => x.id === id);
    if (!a || w.artists.length < 2) return;
    if (!confirm(`Delete ${a.band.name || 'this artist'} and all of its songs, shows, posts and money? Venues, bands and contacts stay. Back up first if you might want it again.`)) return;
    ws = removeArtist(w, id);
    saveWorkspace(ws);
    store.replace(viewOf(ws));
    studio.artistsChanged && studio.artistsChanged();
    go('home');
  };
  function renderSwitcher() {
    const list = artistList(current());
    const cur = list.find((a) => a.id === ws.current) || list[0];
    const menu = h('details', { class: 'mgr-artist-menu' },
      h('summary', { 'aria-label': `Artist: ${cur.name}. Switch artist` }, avatar(cur), h('span', { class: 'mgr-artist-name' }, h('strong', {}, cur.name), h('span', { class: 'muted tiny' }, list.length > 1 ? `${list.length} artists` : cur.city || 'Artist')), icon('chevron', 14)),
      h('div', { class: 'mgr-artist-list', role: 'menu' },
        list.map((a) => h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': a.id === cur.id ? 'true' : 'false', class: `mgr-artist-item${a.id === cur.id ? ' on' : ''}`, onclick: () => (a.id === cur.id ? (menu.open = false) : switchArtist(a.id)) }, avatar(a), h('span', {}, a.name, a.city ? h('span', { class: 'muted tiny' }, ` · ${a.city}`) : null), a.id === cur.id ? icon('check', 14) : null)),
        h('button', { type: 'button', role: 'menuitem', class: 'mgr-artist-item add', onclick: newArtist }, icon('plus', 14), h('span', {}, 'Add an artist')),
      ),
    );
    menu.addEventListener('toggle', () => {
      if (!menu.open) return;
      const close = (e) => {
        if (!menu.contains(e.target)) {
          menu.open = false;
          document.removeEventListener('pointerdown', close);
        }
      };
      document.addEventListener('pointerdown', close);
    });
    switcher.replaceChildren(menu);
  }

  const go = (page, id = null, tab = null) => {
    view = { ...view, page, id, tab: tab || (page === view.page && id === view.id ? view.tab : 'overview') };
    if (page === 'songs' && id) view.songId = id; // the song shown in the header
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
    /** The whole workspace (every artist), with the open artist's edits included. */
    workspace: () => current(),
    artists: () => artistList(current()),
    switchArtist,
    deleteArtist,
    get combined() {
      return !!view.combined;
    },
    setCombined: (on) => {
      view = { ...view, combined: !!on };
      localStorage.setItem(VIEW_KEY, JSON.stringify(view));
      render();
    },
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
    studio.contextChanged && studio.contextChanged();
    renderNav();
    renderSwitcher();
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
    saveTimer = setTimeout(() => {
      status.textContent = saveWorkspace(current()) ? 'Saved in this browser' : 'Could not save (storage full?)';
      studio.artistsChanged && studio.artistsChanged();
    }, 400);
  });

  return {
    store,
    /** For the video studio: every artist's id, name, theme and logo, and the open artist. */
    artists: () => artistList(current()),
    currentArtist: () => ws.current,
    /** The song you last opened in the Manager (for the open artist), or null. */
    currentSong: () => {
      const s = view.songId && store.get().songs.find((x) => x.id === view.songId);
      return s ? { id: s.id, title: s.title, artistId: ws.current } : null;
    },
    /** A song by id from any artist, with the artist's id. */
    findSong: (id) => {
      for (const a of current().artists) {
        const s = (a.songs || []).find((x) => x.id === id);
        if (s) return { id: s.id, title: s.title, artistId: a.id };
      }
      return null;
    },
    artistBand: (id) => (current().artists.find((a) => a.id === id) || {}).band || null,
    switchArtist,
    show: () => render(),
    go,
    undo: () => store.canUndo() && store.undo(),
    redo: () => store.canRedo() && store.redo(),
  };
}
