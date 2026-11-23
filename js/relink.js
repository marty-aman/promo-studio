// "Replace missing files": the notice, the button and the dialog that give files back to the media ids that lost them.
//
// A file goes missing when the browser drops its storage, when a library item is removed, or when a backup is
// restored in another browser. Everything that used it still holds its id, so this finds those ids, matches the
// files you pick by name (and sub-folder) and puts each one back under the SAME id: every clip, layer, song file
// and photo that used it works again at once. Nothing present is ever touched or deleted.
//
// app.js calls configure() once with the media library and the places to look for references; the pages only
// use relinkNotice() and relinkButton().
import { h, icon, button, toast } from './dom.js';
import { referencedIds, missingItems, pickMatches, namesWithCounts, REASONS } from './mediamatch.js';

const env = { ready: false, has: () => true, names: () => ({}), restore: async () => {}, kindOfFile: () => null, sources: {}, after: () => {} };

/**
 * has(id) -> bool, names() -> the name index, restore(id, file) -> promise (adds the file under that id),
 * kindOfFile(file) -> 'audio' | …, sources: { scope: () => [saved data to look through] }, after() runs once files came back.
 * Nothing counts as missing until `ready` is true (the library is still loading from storage before that).
 */
export function configureRelink(opts) {
  Object.assign(env, opts);
}

/**
 * The missing files that the data of `scope` ('studio', 'manager', 'photo', or 'all') points at, or that
 * whatever `roots()` returns (a narrower piece of saved data, such as one song) points at.
 */
export function missingFor(scope, roots = null) {
  if (!env.ready) return [];
  const keys = scope === 'all' ? Object.keys(env.sources) : [scope];
  const data = roots ? roots() : keys.flatMap((k) => (env.sources[k] ? env.sources[k]() : []));
  return missingItems(referencedIds(...data), env.has, env.names());
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const nameList = (items, max = 4) => {
  const list = namesWithCounts(items).map((x) => (x.count > 1 ? `${x.name} ×${x.count}` : x.name));
  return list.length > max ? `${list.slice(0, max).join(', ')} and ${list.length - max} more` : list.join(', ');
};

// ------------------------------------------------------------------ buttons and notices
const live = new Set();
const paint = (el) => {
  const list = missingFor(el.dataset.scope, el._roots);
  const n = list.length;
  el.hidden = !n;
  if (el.classList.contains('relink-note')) {
    el.querySelector('.relink-msg').textContent = n ? `${plural(n, 'file')} used here can’t be found: ${nameList(list)}.` : '';
  } else {
    el.querySelector('.relink-count').textContent = n ? ` (${n})` : '';
  }
};

/** Draw again every notice and button that is on screen (call after anything that can change what is missing). */
export function refreshRelink() {
  for (const el of live) {
    if (!el.isConnected) live.delete(el);
    else paint(el);
  }
}

/** A button that opens the dialog; hidden while nothing is missing. */
export function relinkButton(scope, { variant = 'sm', roots = null } = {}) {
  const b = button('Replace missing files', () => openRelink(scope, roots), { iconName: 'upload', variant, title: 'Some files your work uses are gone. Pick the folder they are in and files with the same name replace them.' });
  b.classList.add('relink-btn');
  b.dataset.scope = scope;
  b._roots = roots;
  b.querySelector('span').append(h('span', { class: 'relink-count' }));
  live.add(b);
  paint(b);
  return b;
}

/** A line saying what is missing here, with the button; empty (hidden) while nothing is missing. */
export function relinkNotice(scope, roots = null) {
  const el = h('div', { class: 'relink-note', role: 'status', dataset: { scope } }, h('span', { class: 'relink-msg small' }), relinkButton(scope, { roots }));
  el._roots = roots;
  live.add(el);
  paint(el);
  return el;
}

// ------------------------------------------------------------------ picking files
/** Files from a drop, walking into dropped folders and keeping each file's folder path. */
export async function filesFromDrop(dt) {
  const entries = [...(dt.items || [])].map((it) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null)).filter(Boolean);
  if (!entries.length) return [...(dt.files || [])];
  const out = [];
  const walk = async (entry, path) => {
    if (entry.isFile) {
      const f = await new Promise((res, rej) => entry.file(res, rej));
      try {
        Object.defineProperty(f, 'webkitRelativePath', { value: path + f.name });
      } catch {
        /* read-only in some browsers: the match then uses the name alone */
      }
      out.push(f);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      for (;;) {
        const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const e of batch) await walk(e, `${path}${entry.name}/`);
      }
    }
  };
  for (const e of entries) await walk(e, '');
  return out;
}

const pick = (folder) =>
  new Promise((resolve) => {
    const input = h('input', { type: 'file', multiple: true });
    if (folder) input.webkitdirectory = true;
    input.addEventListener('change', () => resolve([...input.files]));
    input.addEventListener('cancel', () => resolve([]));
    input.click();
  });

/**
 * Put the picked files back under the ids that lost them. Only ids in `missing` (and still absent) are touched.
 * Returns { replaced: [{ item, file }], still: [{ item, reason }], extra: [file] }.
 */
export async function relinkFiles(missing, files, onProgress = () => {}) {
  const { matches, still, extra } = pickMatches(
    missing.filter((m) => !env.has(m.id)),
    files,
  );
  const replaced = [];
  let i = 0;
  for (const m of matches) {
    onProgress(++i, matches.length, m.file.name);
    const kind = env.kindOfFile(m.file);
    if (m.item.kind && kind && kind !== m.item.kind) {
      still.push({ item: m.item, reason: 'wrongType' });
      continue;
    }
    if (env.has(m.item.id)) continue; // came back some other way while we worked: leave it
    try {
      await env.restore(m.item.id, m.file);
      replaced.push(m);
    } catch (e) {
      console.warn('Could not replace', m.item.name, e);
      still.push({ item: m.item, reason: 'unreadable' });
    }
  }
  return { replaced, still, extra };
}

// ------------------------------------------------------------------ the dialog
export function openRelink(scope, roots = null) {
  document.querySelectorAll('dialog.relink-dialog').forEach((d) => d.remove());
  const dlg = h('dialog', { class: 'relink-dialog', 'aria-label': 'Replace missing files' });
  const body = h('div', { class: 'relink-body' });
  const close = () => {
    dlg.close();
    dlg.remove();
    refreshRelink();
    env.after();
  };
  dlg.addEventListener('cancel', (e) => (e.preventDefault(), close()));
  dlg.append(h('div', { class: 'relink-head' }, h('h2', {}, icon('upload', 18), ' Replace missing files'), button('', close, { iconName: 'x', variant: 'ghost', title: 'Close' })), body);
  document.body.append(dlg);
  dlg.showModal();

  let busy = false;
  const go = async (files) => {
    if (busy || !files.length) return;
    busy = true;
    const missing = missingFor(scope, roots);
    const progress = h('p', { class: 'small', role: 'status' }, 'Looking for matches…');
    body.append(progress);
    try {
      const res = await relinkFiles(missing, files, (n, total, name) => (progress.textContent = `Replacing ${n} of ${total}: ${name}`));
      const left = missingFor(scope, roots);
      toast(
        res.replaced.length
          ? `Replaced ${plural(res.replaced.length, 'file')}${left.length ? `; still missing: ${nameList(left)}` : '. Nothing is missing now.'}`
          : `No match for ${nameList(left)}. Files need the same name.`,
        res.replaced.length ? 'info' : 'error',
        7000,
      );
      render(res);
      env.after();
    } finally {
      busy = false;
    }
  };

  const dropzone = h('div', { class: 'dropzone small-drop relink-drop', tabindex: '0', role: 'button', 'aria-label': 'Drop a folder or files here, or press Enter to pick a folder' }, icon('upload', 22), h('strong', {}, 'Drop the folder or files here'), h('span', { class: 'muted tiny' }, 'A file with the same name replaces the missing one. Files that are not missing are left alone.'));
  dropzone.addEventListener('click', async () => go(await pick(true)));
  dropzone.addEventListener('keydown', async (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), go(await pick(true))));
  dropzone.addEventListener('dragover', (e) => (e.preventDefault(), e.stopPropagation(), dropzone.classList.add('over')));
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('over'));
  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.remove('dropping');
    dropzone.classList.remove('over');
    go(await filesFromDrop(e.dataTransfer));
  });

  function render(res = null) {
    const missing = missingFor(scope, roots);
    const list = (items, reasons) =>
      h(
        'ul',
        { class: 'relink-list small' },
        items.slice(0, 40).map((x) => {
          const it = x.item || x;
          return h('li', {}, h('strong', {}, it.name || 'A file whose name was not saved'), it.path && it.path.includes('/') ? h('span', { class: 'muted tiny' }, ` ${it.path.replace(/\/[^/]*$/, '')}`) : null, reasons && x.reason ? h('span', { class: 'muted tiny' }, ` · ${REASONS[x.reason]}`) : null);
        }),
        items.length > 40 ? h('li', { class: 'muted' }, `and ${items.length - 40} more`) : null,
      );
    const kids = [];
    if (res) {
      kids.push(
        h('p', { class: res.replaced.length ? 'relink-ok' : 'warn-list' }, res.replaced.length ? `Replaced ${plural(res.replaced.length, 'file')}.` : 'Nothing was replaced.'),
        res.replaced.length ? list(res.replaced) : null,
      );
      if (res.extra.length) kids.push(h('p', { class: 'muted tiny' }, `${plural(res.extra.length, 'picked file')} didn’t match a missing file and were left alone.`));
    }
    if (missing.length) {
      const why = new Map((res ? res.still : []).map((s) => [s.item.id, s]));
      kids.push(
        h('p', { class: 'small' }, res ? `Still missing: ${missing.length}` : `${plural(missing.length, 'file')} can’t be found. Pick the folder they are in (or drop it); each missing file is replaced by the file with the same name, in the same sub-folder when several share a name.`),
        list(missing.map((m) => why.get(m.id) || m), !!res),
        h('div', { class: 'row' }, button('Choose a folder…', async () => go(await pick(true)), { iconName: 'file', variant: 'primary' }), button('Choose files…', async () => go(await pick(false)), { iconName: 'upload' })),
        dropzone,
      );
    } else {
      kids.push(h('p', { class: 'relink-ok' }, res ? 'Nothing is missing now.' : 'Nothing is missing.'));
    }
    kids.push(h('div', { class: 'row' }, button('Done', close, { variant: 'sm' })));
    body.replaceChildren(...kids.filter(Boolean));
  }
  render();
  return dlg;
}
