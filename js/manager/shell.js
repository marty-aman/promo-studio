// The Manager workspace: its own left nav and pages, on its own store (with undo), saved in this
// browser and backed up to a file. The video studio stays as it was; "Make a promo" hands a song over.
import { h, icon, button, iconButton, toast, download, pickFiles, onDateCommit } from '../dom.js';
import { createStore } from '../state.js';
import { openDriveSetup } from '../gdrive.js';
import { todayISO } from './model.js';
import { loadWorkspace, saveWorkspace, viewOf, mergeView, addArtist, removeArtist, restoreArtist, artistList, photoStyle, workspaceBackup, parseWorkspaceBackup, backupMediaNames, backupProjects } from './artists.js';
import { relinkButton } from '../relink.js';
import { referencedIds } from '../mediamatch.js';
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
import { buildReleases } from './page-releases.js';
import { buildFans } from './page-fans.js';
import { paneX } from '../panes-ui.js';

const VIEW_KEY = 'pvm.manager.view.v1';
// when the last backup file was made and when you first changed anything: { lastBackupAt, firstEditAt } (ms)
export const BACKUP_INFO_KEY = 'pvm.manager.backupInfo.v1';
export const BACKUP_NUDGE_DAYS = 14;
// the workspace as it was just before the last Restore (so a wrong file can be undone)
// (the 2026-11 build kept a copy of the workspace here on Restore; it's no longer written, and an
// old leftover is removed on load so it doesn't hold storage)
const BEFORE_RESTORE_KEY = 'pvm.manager.beforeRestore';
const readBackupInfo = () => {
  try {
    const x = JSON.parse(localStorage.getItem(BACKUP_INFO_KEY));
    return x && typeof x === 'object' ? x : {};
  } catch {
    return {};
  }
};
const writeBackupInfo = (patch) => {
  try {
    localStorage.setItem(BACKUP_INFO_KEY, JSON.stringify({ ...readBackupInfo(), ...patch }));
  } catch {
    /* storage full: the save-failed banner already says so */
  }
};
/**
 * Whether to nudge for a backup: none in `days` days, or none ever and you started more than
 * `days` days ago. `info` is { lastBackupAt, firstEditAt } in ms. Returns days since, or 0 for no nudge.
 */
export function backupDue(info, now = Date.now(), days = BACKUP_NUDGE_DAYS) {
  const since = info.lastBackupAt || info.firstEditAt;
  if (!since) return 0;
  const d = Math.floor((now - since) / 86400000);
  return d >= days ? d : 0;
}
/** "today", "yesterday", "12 days ago". */
const agoText = (ms, now = Date.now()) => {
  const d = Math.floor((now - ms) / 86400000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};
/** A Manager page address for the browser's Back button and links: #m/<page>/<id>/<tab>. */
export const viewHash = (v) => `#m/${[v.page, v.id || '', v.tab && v.tab !== 'overview' ? v.tab : ''].map((x) => encodeURIComponent(x || '')).join('/').replace(/\/+$/, '')}`;
export function parseViewHash(hash) {
  const m = /^#m\/([^/]*)(?:\/([^/]*))?(?:\/([^/]*))?/.exec(hash || '');
  if (!m) return null;
  const dec = (x) => {
    try {
      return decodeURIComponent(x || '');
    } catch {
      return '';
    }
  };
  return { page: dec(m[1]), id: dec(m[2]) || null, tab: dec(m[3]) || 'overview' };
}
export const MANAGER_PAGES = [
  { id: 'home', label: 'Home', icon: 'home', build: buildHome },
  { id: 'songs', label: 'Songs & releases', icon: 'music', build: buildSongs },
  // an EP's or album's own page; reached from Songs & releases, so not in the nav
  { id: 'releases', label: 'Releases', icon: 'disc', build: buildReleases, hidden: true, navAs: 'songs' },
  { id: 'shows', label: 'Shows', icon: 'ticket', build: buildShows },
  { id: 'planner', label: 'Show planner', icon: 'mapPin', build: buildPlanner },
  { id: 'tours', label: 'Tours', icon: 'route', build: buildTours },
  { id: 'stats', label: 'Streaming stats', icon: 'activity', build: buildStats },
  { id: 'content', label: 'Content', icon: 'chart', build: buildContent },
  { id: 'calendar', label: 'Calendar', icon: 'calendar', build: buildCalendar },
  { id: 'photos', label: 'Photos', icon: 'image', build: buildPhotos },
  { id: 'epk', label: 'Press kit', icon: 'clipboard', build: buildEPK },
  { id: 'money', label: 'Money', icon: 'dollar', build: buildMoney },
  { id: 'fans', label: 'Fans & opportunities', icon: 'users', build: buildFans },
];

/** Small form helpers shared by the pages. Every control has a stable data-k so focus survives a re-render. */
export function formKit(update) {
  // `aria`: the name screen readers hear for a field shown without a visible label
  const text = (k, label, value, set, { type = 'text', placeholder = '', rows = 0, hint = '', list = null, aria = '' } = {}) => {
    const al = !label && aria ? aria : null;
    const el = rows
      ? h('textarea', { rows, placeholder, 'data-k': k, 'aria-label': al }, value || '')
      : h('input', { type, placeholder, value: value ?? '', 'data-k': k, list, 'aria-label': al });
    if (rows) el.value = value || '';
    // date and time fields save when you've finished typing (see onDateCommit)
    if (type === 'date' || type === 'time' || type === 'month') onDateCommit(el, (v) => update((d) => set(d, v)));
    else el.addEventListener('change', () => update((d) => set(d, type === 'number' ? (el.value === '' ? '' : +el.value) : el.value)));
    return label ? h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, label), el, hint ? h('span', { class: 'mf-h' }, hint) : null) : el;
  };
  const select = (k, label, value, options, set, { aria = '' } = {}) => {
    const el = h('select', { 'data-k': k, 'aria-label': !label && aria ? aria : null }, options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
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
  let edits = 0; // edits made in this tab (for "Undo restore" to say what it would undo)
  try {
    localStorage.removeItem(BEFORE_RESTORE_KEY);
  } catch {
    /* storage blocked */
  }
  saveWorkspace(ws); // an older single-artist save is rewritten as a workspace right away
  const store = createStore(viewOf(ws));
  const current = () => (ws = mergeView(ws, store.get())); // the workspace with the open artist's edits folded in
  let view = { page: 'home', id: null, tab: 'overview' };
  try {
    view = { ...view, ...(JSON.parse(localStorage.getItem(VIEW_KEY)) || {}) };
  } catch {
    /* default view */
  }
  // a link or bookmark to a Manager page (#m/songs/<id>/release) opens that page
  const fromHash = parseViewHash(location.hash);
  if (fromHash && MANAGER_PAGES.some((p) => p.id === fromHash.page)) view = { ...view, ...fromHash, ...(fromHash.page === 'songs' && fromHash.id ? { songId: fromHash.id } : {}) };
  if (!MANAGER_PAGES.some((p) => p.id === view.page)) view.page = 'home';
  // the page you opened on is remembered in its history entry (the address isn't touched while loading)
  history.replaceState({ ...(history.state || {}), mgrView: { page: view.page, id: view.id, tab: view.tab } }, '');

  const nav = h('nav', { class: 'mgr-nav', 'aria-label': 'Manager pages' });
  const main = h('main', { class: 'mgr-main', tabindex: '-1' });
  const status = h('span', { class: 'muted tiny mgr-saved' }, 'Saved in this browser');
  const backupNote = h('span', { class: 'muted tiny mgr-saved mgr-backup-note' });
  const renderBackupNote = () => {
    const info = readBackupInfo();
    backupNote.textContent = info.lastBackupAt ? `Last backup: ${agoText(info.lastBackupAt)}` : 'No backup yet';
    backupNote.classList.toggle('warn', !!backupDue(info));
    // a backup holds every artist's fan list: say so, and offer one without it
    const fans = ws.artists.reduce((n, a) => n + (a.id === ws.current ? (store.get().fans || []).length : (a.fans || []).length), 0);
    fansNote.hidden = fanless.hidden = !fans;
    fansNote.textContent = fans ? `This backup contains your fan list (${fans} ${fans === 1 ? 'person' : 'people'}).` : '';
  };
  const fansNote = h('span', { class: 'muted tiny mgr-saved mgr-fans-note', hidden: true });
  // a save that fails (storage full, or blocked) stays on screen until a save works again
  const saveError = h('div', { class: 'mgr-save-err', role: 'alert', hidden: true }, h('strong', {}, 'Your last change could not be saved in this browser.'), h('span', {}, 'The storage may be full. Download a backup now so nothing is lost, then free some space (Photos and Files hold the most).'), button('Back up now', () => backUp(), { iconName: 'download', variant: 'sm primary' }), iconButton('x', 'Close this warning', () => (saveError.hidden = true), 'ghost banner-x'));
  // a bar with one button that puts something back (a restore, a deleted artist), for 15 seconds
  const undoBar = h('div', { class: 'mgr-undo', role: 'status', hidden: true });
  let undoTimer = null;
  const offerUndo = (msg, label, fn) => {
    clearTimeout(undoTimer);
    undoBar.replaceChildren(h('span', {}, msg), button(label, () => ((undoBar.hidden = true), fn()), { variant: 'sm primary' }), button('Dismiss', () => (undoBar.hidden = true), { variant: 'sm ghost' }), iconButton('x', 'Close', () => (undoBar.hidden = true), 'ghost banner-x'));
    undoBar.hidden = false;
    undoTimer = setTimeout(() => (undoBar.hidden = true), 15000);
  };
  /** The backup file's text: every artist, the Projects library (saved edits and designs), and the names of the media they use. */
  const backupText = (opts = {}) => {
    const projects = studio.projectsBackup ? studio.projectsBackup() : null;
    const ids = referencedIds(current(), projects ? projects.video.map((e) => e.data) : [], projects ? projects.photo : []);
    return workspaceBackup(current(), studio.mediaNames ? studio.mediaNames(ids) : null, { ...opts, projects });
  };
  const backUp = () => {
    download(new Blob([backupText()], { type: 'application/json' }), `band-manager-${todayISO()}.json`);
    writeBackupInfo({ lastBackupAt: Date.now() });
    renderBackupNote();
    if (view.page === 'home') render();
  };
  /** The same backup with every artist's fan list left out (the lists here are not touched). */
  const backUpWithoutFans = () => {
    download(new Blob([backupText({ withoutFans: true })], { type: 'application/json' }), `band-manager-${todayISO()}-no-fans.json`);
    writeBackupInfo({ lastBackupAt: Date.now() });
    renderBackupNote();
    toast('Backup saved without the fan list.');
  };
  const fanless = button('Back up without the fan list', () => backUpWithoutFans(), { iconName: 'download', variant: 'sm ghost', title: 'The same backup with every artist’s fan list left out' });
  fanless.hidden = true;
  fanless.classList.add('fo-fanless');
  /** Swap in a whole workspace (restore, undo of a restore or a delete). */
  const replaceWorkspace = (next) => {
    ws = next;
    saveWorkspace(ws);
    store.replace(viewOf(ws));
    studio.artistsChanged && studio.artistsChanged();
  };
  const tools = h(
    'div',
    { class: 'mgr-tools' },
    status,
    backupNote,
    button('Back up', backUp, { iconName: 'download', variant: 'sm ghost', title: 'Download every artist in the manager as one file' }),
    fansNote,
    fanless,
    button('Restore', async () => {
      const [f] = await pickFiles('.json,application/json', false);
      if (!f) return;
      try {
        const text = await f.text();
        const next = parseWorkspaceBackup(text);
        const songs = next.artists.reduce((n, a) => n + a.songs.length, 0);
        if (!confirm(`Replace everything in the manager with this backup (${next.artists.length} artist${next.artists.length > 1 ? 's' : ''}, ${songs} songs)? You can undo this right after.`)) return;
        // keep what's here now (in memory only: a second copy in storage would double the Manager's
        // footprint), so the restore can be undone while the undo bar is up
        const before = JSON.parse(JSON.stringify(current()));
        studio.learnNames && studio.learnNames(backupMediaNames(text)); // so files this browser doesn't have can be asked for by name
        replaceWorkspace(next);
        const editsAt = edits;
        // saved projects in the backup are added next to the ones here (none are replaced, and Undo restore leaves them)
        const got = studio.restoreProjects ? await studio.restoreProjects(backupProjects(text)) : { video: 0, photo: 0 };
        const extra = [got.video ? `${got.video} video project${got.video === 1 ? '' : 's'}` : '', got.photo ? `${got.photo} design${got.photo === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ');
        toast(extra ? `Backup restored, with ${extra} added to Projects` : 'Backup restored');
        offerUndo('Backup restored.', 'Undo restore', () => {
          // undoing puts back exactly what you had before; changes made since the restore go with it
          const since = edits - editsAt;
          if (since && !confirm(`Undo the restore? The ${since} change${since === 1 ? '' : 's'} you made since restoring will be undone too.`)) return;
          replaceWorkspace(before);
          toast('Put back what you had before the restore.');
        });
      } catch (e) {
        toast(e.message, 'error', 5000);
      }
    }, { iconName: 'upload', variant: 'sm ghost', title: 'Load a backup file' }),
    relinkButton('manager'),
    button('Google Drive', () => openDriveSetup(), { iconName: 'cloud', variant: 'sm ghost', title: 'Connect Google Drive so you can pick files from it' }),
  );
  const switcher = h('div', { class: 'mgr-artist' });
  /** The artist's profile photo, or its first letter when it has none. */
  const avatar = (a, cls = '') => {
    const ph = a.photoId && studio.mediaInfo ? studio.mediaInfo(a.photoId) : null;
    return ph ? h('span', { class: `mgr-artist-dot photo ${cls}`, 'aria-hidden': 'true' }, h('img', { src: ph.url, alt: '', style: photoStyle(a.photoPos) })) : h('span', { class: `mgr-artist-dot ${cls}`, 'aria-hidden': 'true' }, (a.name[0] || '?').toUpperCase());
  };
  root.replaceChildren(h('div', { class: 'mgr-side' }, paneX('manager', 'nav'), h('div', {}, switcher, nav), tools), main, saveError, undoBar);
  renderBackupNote();

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
    if (!confirm(`Delete ${a.band.name || 'this artist'} and all of its songs, shows, posts and money? Venues, bands and contacts stay. You can undo this right after.`)) return;
    const before = JSON.parse(JSON.stringify(w));
    replaceWorkspace(removeArtist(w, id));
    go('home');
    offerUndo(`Deleted ${a.band.name || 'the artist'}.`, 'Undo delete', () => {
      replaceWorkspace(restoreArtist(before, current(), id));
      go('home');
      toast(`${a.band.name || 'The artist'} is back.`);
    });
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
    // each page gets a history entry, so the browser's Back button steps back through the Manager
    const hash = viewHash(view);
    if (location.hash !== hash && !root.hidden) history.pushState({ mgr: 1 }, '', hash);
    render(true);
  };
  window.addEventListener('popstate', (e) => {
    // Back pressed in the Video or Photo Studio: leave the hidden Manager where it was
    if (root.hidden) return;
    const v = parseViewHash(location.hash) || (e.state && e.state.mgrView) || null;
    if (!v || !MANAGER_PAGES.some((p) => p.id === v.page)) return;
    view = { ...view, ...v, ...(v.page === 'songs' && v.id ? { songId: v.id } : {}) };
    localStorage.setItem(VIEW_KEY, JSON.stringify(view));
    render(true);
  });
  const ctx = {
    store,
    update: (fn, key) => store.update(fn, key),
    get view() {
      return view;
    },
    go,
    setTab: (tab) => go(view.page, view.id, tab),
    /** Draw the page again where it is (no scrolling back to the top). */
    refresh: () => render(),
    studio,
    today: () => todayISO(),
    form: null,
    /** The whole workspace (every artist), with the open artist's edits included. */
    workspace: () => current(),
    artists: () => artistList(current()),
    switchArtist,
    deleteArtist,
    /** Days since the last backup when a reminder is due (0 when not), and making one. */
    backupDue: () => backupDue(readBackupInfo()),
    backUp,
    backUpWithoutFans,
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
      ...MANAGER_PAGES.filter((p) => !p.hidden).map((p) => {
        const on = view.page === p.id || (MANAGER_PAGES.find((x) => x.id === view.page) || {}).navAs === p.id;
        return h('button', { type: 'button', class: `mgr-nav-btn${on ? ' on' : ''}`, 'aria-current': on ? 'page' : null, onclick: () => go(p.id) }, icon(p.icon, 18), h('span', {}, p.label));
      }),
    );
    // on a phone the nav is a sideways strip: keep the open page's button in view
    const on = nav.querySelector('.mgr-nav-btn.on');
    if (on && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = Math.max(0, on.offsetLeft - nav.offsetLeft - 40);
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
  let asked = false;
  store.subscribe((_, meta) => {
    render();
    renderBackupNote();
    status.textContent = 'Saving…';
    if (meta && meta.type === 'update') edits++;
    // only a real edit (not an artist switch, a restore or an undo) counts as the first one
    if (!asked && meta && meta.type === 'update') {
      asked = true;
      // ask the browser not to clear this site's storage on its own (no prompt in most browsers)
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      if (!readBackupInfo().firstEditAt) writeBackupInfo({ firstEditAt: Date.now() });
    }
    saveSoon();
  });
  const writeNow = () => {
    clearTimeout(saveTimer);
    savePending = false;
    let ok = saveWorkspace(current());
    if (!ok && localStorage.getItem(BEFORE_RESTORE_KEY)) {
      // the copy kept for "Undo restore" is the first thing to give up for room
      localStorage.removeItem(BEFORE_RESTORE_KEY);
      ok = saveWorkspace(current());
    }
    status.textContent = ok ? 'Saved in this browser' : 'Not saved: storage full';
    status.classList.toggle('bad', !ok);
    if (!ok && saveError.hidden) toast('Could not save your change in this browser. Back up now.', 'error', 8000);
    saveError.hidden = ok;
    studio.artistsChanged && studio.artistsChanged();
  };
  let savePending = false;
  const saveSoon = () => {
    savePending = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeNow, 400);
  };

  return {
    store,
    /** Save a change that is still waiting for its short delay (the page is closing or hiding). */
    flush: () => savePending && writeNow(),
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
    /** The whole song by id from any artist (sections, files, cover), with its artist's releases. */
    songById: (id) => {
      for (const a of current().artists) {
        const s = (a.songs || []).find((x) => x.id === id);
        if (s) return { song: s, artistId: a.id, releases: a.releases || [] };
      }
      return null;
    },
    /** Songs whose song file is this media item, from any artist. */
    songsWithAudio: (mediaId) => current().artists.flatMap((a) => (a.songs || []).filter((s) => s.audioId === mediaId).map((s) => ({ song: s, artistId: a.id, releases: a.releases || [] }))),
    artistBand: (id) => (current().artists.find((a) => a.id === id) || {}).band || null,
    switchArtist,
    /** Every artist's data (for finding the media a backup or a song points at). */
    workspace: () => current(),
    show: () => render(),
    go,
    undo: () => store.canUndo() && store.undo(),
    redo: () => store.canRedo() && store.redo(),
    /** Download the backup file (the Storage section's reminder). */
    backUp: () => backUp(),
  };
}
