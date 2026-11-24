// Storage on the Manager home: how much of this browser's room the app uses, whether the browser may clear it on
// its own, what takes the room (videos, songs, photos, AI models, projects), the biggest files, and a Clean up
// panel for files nothing uses, the AI caches and old project versions. Nothing is deleted without a confirm.
//
// deps (from app.js):
//   recs() -> library records (media.all(); light records carry their size)
//   used() -> Promise<Set of media ids> that a saved edit, song, design, project or version points at
//   removeFiles(ids) -> Promise<undo() | null>   (undo puts the files back, when it still can)
//   versions() -> Promise<[{ key, list }]>, trimVersions(keep) -> Promise<number dropped>
//   projects() -> saved project entries, clearModels() -> Promise, backUp() -> download a backup
import { h, icon, button, toast } from './dom.js';
import { storageBreakdown, biggestFiles, unusedMedia, fmtBytes, GROUP_LABEL } from './medialight.js';
import { storageLevel } from './projectlib.js';

const KIND_LABEL = { video: 'Video', audio: 'Audio', image: 'Photo', tab: 'Tab', midi: 'MIDI', font: 'Font' };
const GROUPS = ['video', 'audio', 'photos', 'models', 'projects', 'other'];

/** Bytes kept in Cache Storage (the AI models), by the browser's own count when it gives one. */
async function cacheBytes(est) {
  if (est && est.usageDetails && Number.isFinite(est.usageDetails.caches)) return est.usageDetails.caches;
  if (typeof caches === 'undefined') return 0;
  let n = 0;
  try {
    for (const name of await caches.keys()) {
      const c = await caches.open(name);
      for (const req of await c.keys()) {
        const res = await c.match(req);
        const len = res && Number(res.headers.get('content-length'));
        n += len > 0 ? len : 0; // shortcut: entries without a length header are not counted (the rest shows as Other)
      }
    }
  } catch {
    /* the count is a guide only */
  }
  return n;
}

const jsonBytes = (v) => {
  try {
    return JSON.stringify(v).length;
  } catch {
    return 0;
  }
};

/** Everything the panel shows, measured once per open. */
export async function measureStorage(deps) {
  let est = null;
  try {
    est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
  } catch {
    est = null;
  }
  let persisted = null;
  try {
    persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null;
  } catch {
    persisted = null;
  }
  const recs = deps.recs();
  const [used, versions, models] = await Promise.all([deps.used(), deps.versions().catch(() => []), cacheBytes(est)]);
  const projects = jsonBytes(deps.projects()) + versions.reduce((n, v) => n + jsonBytes(v.list), 0);
  const versionCount = versions.reduce((n, v) => n + Math.max(0, (v.list || []).length - 1), 0);
  const usage = est && Number.isFinite(est.usage) ? est.usage : null;
  const quota = est && Number.isFinite(est.quota) ? est.quota : null;
  return {
    usage,
    quota,
    level: storageLevel(usage, quota),
    persisted,
    groups: storageBreakdown(recs, { models, projects, usage }),
    biggest: biggestFiles(recs, 5).map((f) => ({ ...f, used: used.has(f.id) })),
    unused: unusedMedia(recs, used),
    oldVersions: versionCount,
    models,
  };
}

/** The Storage section for the Manager home. `open`: start unfolded (after a save failed). */
export function storagePanel(deps, { open = false } = {}) {
  const box = h('details', { class: 'storage-panel', 'data-storage': '' });
  const summary = h('summary', {}, icon('gauge', 16), h('span', { class: 'storage-sum' }, 'Storage: measuring…'));
  const body = h('div', { class: 'storage-body' });
  box.append(summary, body);
  if (open) box.open = true;
  const picked = new Set();
  let data = null;
  let busy = false;

  const bar = (pct, warn) => h('div', { class: `storage-bar${warn ? ' warn' : ''}`, role: 'img', 'aria-label': pct == null ? 'Unknown' : `${Math.round(pct * 100)} % used` }, h('div', { style: { width: `${pct == null ? 0 : Math.round(pct * 100)}%` } }));

  const askPersist = async () => {
    let ok = false;
    try {
      ok = navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false;
    } catch {
      ok = false;
    }
    toast(ok ? 'This browser will keep your files until you delete them.' : 'The browser said no. It may ask again after you use the app more, or install it from the browser menu. Keep backing up.', ok ? 'info' : 'error', 6000);
    refresh();
  };

  const removePicked = async () => {
    const list = data.unused.filter((f) => picked.has(f.id));
    if (!list.length) return;
    const bytes = list.reduce((n, f) => n + f.size, 0);
    if (!confirm(`Delete ${list.length} file${list.length === 1 ? '' : 's'} (${fmtBytes(bytes)}) from this browser? No project, song or design uses ${list.length === 1 ? 'it' : 'them'}. Files on your computer are not touched.`)) return;
    busy = true;
    paint();
    const undo = await deps.removeFiles(list.map((f) => f.id));
    picked.clear();
    busy = false;
    toast(`Deleted ${list.length} file${list.length === 1 ? '' : 's'} (${fmtBytes(bytes)}).`, 'info', 4000);
    refresh(undo);
  };

  const clearModels = async () => {
    if (!confirm('Delete the downloaded AI models and the search index? Features that use them download them again (asking first) the next time.')) return;
    await deps.clearModels();
    toast('AI models and caches deleted.');
    refresh();
  };

  const trim = async () => {
    if (!confirm(`Delete ${data.oldVersions} older version${data.oldVersions === 1 ? '' : 's'}? Each project and design keeps its newest version.`)) return;
    const n = await deps.trimVersions(1);
    toast(`Deleted ${n} older version${n === 1 ? '' : 's'}.`);
    refresh();
  };

  let undoFn = null;
  function paint() {
    if (!data) return;
    const { level, groups, biggest, unused, persisted } = data;
    summary.querySelector('.storage-sum').textContent = `Storage: ${level.text.split('. Only')[0]}${persisted === false ? ' · may be cleared by the browser' : ''}`;
    box.classList.toggle('warn', !!level.warn);
    if (level.warn) box.open = true;
    const total = GROUPS.reduce((n, g) => n + groups[g], 0) || 1;
    const sel = unused.filter((f) => picked.has(f.id));
    const selBytes = sel.reduce((n, f) => n + f.size, 0);
    const allOn = unused.length > 0 && sel.length === unused.length;
    const parts = [
      bar(level.pct, level.warn),
      level.warn ? h('p', { class: 'storage-warn small', role: 'alert' }, `This browser is ${level.pct != null ? `${Math.round(level.pct * 100)} %` : 'almost'} full. When it is full, new files and edits are not saved. Back up, then clean up below.`) : null,
      h(
        'p',
        { class: 'small storage-persist' },
        persisted ? [icon('check', 14), ' The browser keeps these files until you delete them.'] : persisted === false ? ['The browser may delete these files on its own when the computer runs low on space. ', button('Ask the browser to keep them', askPersist, { variant: 'sm' })] : 'This browser does not say whether it keeps these files.',
      ),
      h('h3', { class: 'storage-h' }, 'What takes the room'),
      h(
        'ul',
        { class: 'storage-groups' },
        GROUPS.filter((g) => groups[g] > 0).map((g) => h('li', {}, h('span', { class: 'storage-g-name' }, GROUP_LABEL[g]), h('span', { class: 'storage-g-bar' }, h('span', { style: { width: `${Math.max(1, Math.round((groups[g] / total) * 100))}%` } })), h('span', { class: 'storage-g-size muted' }, fmtBytes(groups[g])))),
      ),
      biggest.length ? h('h3', { class: 'storage-h' }, 'Biggest files') : null,
      biggest.length ? h('ol', { class: 'storage-big' }, biggest.map((f) => h('li', {}, h('span', { class: 'storage-f-name', title: f.name }, f.name), h('span', { class: 'muted tiny' }, `${KIND_LABEL[f.kind] || f.kind} · ${fmtBytes(f.size)}${f.used ? '' : ' · not used'}`)))) : null,
      h('h3', { class: 'storage-h' }, 'Clean up'),
      undoFn ? h('div', { class: 'storage-undo row', role: 'status' }, h('span', { class: 'small' }, 'Files deleted. You can undo for a few seconds.'), button('Undo', async () => {
            busy = true;
            paint();
            const n = await undoFn();
            undoFn = null;
            busy = false;
            toast(n ? `Put back ${n} file${n === 1 ? '' : 's'}.` : 'The files could not be put back.', n ? 'info' : 'error');
            refresh();
          }, { variant: 'sm primary' })) : null,
      unused.length
        ? h(
            'div',
            { class: 'storage-unused' },
            h('p', { class: 'small muted' }, `${unused.length} file${unused.length === 1 ? '' : 's'} that no edit, song, design, project or version uses (${fmtBytes(unused.reduce((n, f) => n + f.size, 0))}).`),
            h('label', { class: 'storage-all small' }, h('input', { type: 'checkbox', checked: allOn, onchange: (e) => (unused.forEach((f) => (e.target.checked ? picked.add(f.id) : picked.delete(f.id))), paint()) }), ' Select all'),
            h(
              'ul',
              { class: 'storage-list' },
              unused.slice(0, 200).map((f) =>
                h(
                  'li',
                  {},
                  h('label', {}, h('input', { type: 'checkbox', 'data-id': f.id, checked: picked.has(f.id), onchange: (e) => (e.target.checked ? picked.add(f.id) : picked.delete(f.id), paint()) }), f.thumb && f.thumb.startsWith('data:') ? h('img', { src: f.thumb, alt: '', loading: 'lazy' }) : h('span', { class: 'storage-noimg' }), h('span', { class: 'storage-f-name', title: f.name }, f.name), h('span', { class: 'muted tiny' }, `${KIND_LABEL[f.kind] || f.kind} · ${fmtBytes(f.size)}`)),
                ),
              ),
            ),
            unused.length > 200 ? h('p', { class: 'muted tiny' }, `And ${unused.length - 200} smaller files (Select all includes them).`) : null,
            button(sel.length ? `Delete ${sel.length} selected (${fmtBytes(selBytes)})` : 'Delete selected', removePicked, { iconName: 'trash', variant: 'sm', disabled: busy || !sel.length }),
          )
        : h('p', { class: 'small muted' }, 'Every file in the library is used by something.'),
      h(
        'div',
        { class: 'row storage-actions' },
        button(`Delete AI models and caches${data.models ? ` (${fmtBytes(data.models)})` : ''}`, clearModels, { variant: 'sm ghost', disabled: busy }),
        button(data.oldVersions ? `Delete ${data.oldVersions} older project version${data.oldVersions === 1 ? '' : 's'}` : 'No older versions to delete', trim, { variant: 'sm ghost', disabled: busy || !data.oldVersions }),
      ),
      h('p', { class: 'small storage-backup' }, 'Everything here lives only in this browser. A backup keeps your plans and names your files so they can be found again. ', button('Back up now', () => deps.backUp(), { iconName: 'download', variant: 'sm' })),
    ];
    body.replaceChildren(...parts.filter(Boolean)); // replaceChildren would print a null as text
  }

  let undoTimer = null;
  async function refresh(undo) {
    if (undo !== undefined) {
      undoFn = undo || null;
      clearTimeout(undoTimer);
      if (undoFn) undoTimer = setTimeout(() => ((undoFn = null), paint()), 14500); // the files are deleted for good at 15 s
    }
    try {
      data = await measureStorage(deps);
    } catch (e) {
      console.warn('storage measure failed', e);
      summary.querySelector('.storage-sum').textContent = 'Storage: the browser does not say how much room is used.';
      return;
    }
    for (const id of [...picked]) if (!data.unused.some((f) => f.id === id)) picked.delete(id);
    paint();
  }
  refresh();
  return box;
}
