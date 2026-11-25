// The Projects dialog both studios share: the list of saved projects (thumbnail, name, length, song, last edited)
// with search and sort, open, rename, duplicate, delete, versions with "Restore this version", "Use as template",
// download one or all, import, and how full the browser's storage is. On a phone it is a bottom sheet.
// Each studio passes an adapter (see openProjects); the dialog itself holds no project data.
import { h, icon, button, iconButton, toast } from './dom.js';
import { findProjects, SORTS, storageLevel } from './projectlib.js';
import { storageEstimate } from './projectstore.js';
import { guardDialog } from './closeable.js';

const when = (t) => {
  const d = new Date(typeof t === 'number' ? t : Date.parse(t || ''));
  return Number.isNaN(+d) ? '' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const len = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');
const prefs = { q: '', sort: 'edited' };

/**
 * adapter: {
 *   kind: 'video' | 'photo', title, noun ('edit' | 'design'),
 *   list() -> [{ id, name, thumb, thumbFn?, info: { length, song, what }, updatedAt, createdAt, current }],
 *   current?: { name, saved, save(), saveAs(name), saveCopy(name) }   (video: the open edit)
 *   open(id), rename(id, name), duplicate(id), remove(id) -> Promise<bool>, template(id),
 *   versions(id) -> Promise<[{ at, data }]>, describe(data) -> string, restoreVersion(id, at),
 *   download(ids | null), importFile(file),
 * }
 * Returns { dialog, refresh }.
 */
export function openProjects(adapter) {
  document.querySelectorAll('dialog.projects-dialog').forEach((d) => d.remove());
  const dlg = h('dialog', { class: 'projects-dialog', 'aria-label': adapter.title, 'data-kind': adapter.kind });
  const close = () => {
    dlg.close();
    dlg.remove();
  };
  const body = h('div', { class: 'projects-body' });
  const meter = h('p', { class: 'projects-storage muted tiny', role: 'status' });
  dlg.append(h('div', { class: 'projects-head' }, h('h2', {}, icon('file', 18), ` ${adapter.title}`), button('', () => requestClose(), { iconName: 'x', variant: 'ghost', title: 'Close' })), body);
  // Esc, the x and a backdrop tap close it (asking first while a rename is typed but not saved)
  const requestClose = guardDialog(dlg, close);
  document.body.append(dlg);
  dlg.showModal();

  const fileIn = h('input', { type: 'file', accept: '.json,application/json', hidden: true, 'aria-label': 'Import projects from a file' });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0];
    fileIn.value = '';
    if (f) {
      await adapter.importFile(f);
      render();
    }
  });
  const openVersions = new Set();

  const ask = (msg, value) => {
    const v = prompt(msg, value);
    return v == null ? null : v.trim().slice(0, 120);
  };

  function currentBar() {
    const c = adapter.current;
    if (!c) return null;
    const cur = c();
    return h(
      'div',
      { class: 'projects-current' },
      h('div', { class: 'projects-current-text' }, h('strong', {}, cur.name || 'Untitled'), h('span', { class: 'muted tiny' }, cur.saved ? 'Open now · saved in Projects, every change is kept' : 'Open now · not in Projects yet')),
      h(
        'div',
        { class: 'row' },
        cur.saved ? null : button('Save to Projects', async () => (await cur.save(ask('Name for this project', cur.name)), render()), { iconName: 'download', variant: 'sm primary', title: 'Keep this edit in Projects, with its versions' }),
        cur.saved ? button('Save as…', async () => {
          const n = ask('Save as a new project called', `${cur.name}`);
          if (n) await cur.saveAs(n);
          render();
        }, { variant: 'sm', title: 'Keep the saved project as it was and go on editing a new one' }) : null,
        button('Save a copy', async () => {
          const n = ask('Name for the copy', `${cur.name} copy`);
          if (n) await cur.saveCopy(n);
          render();
        }, { iconName: 'copy', variant: 'sm', title: 'Put a copy in Projects and go on editing this one' }),
      ),
    );
  }

  function row(e) {
    const img = h('img', { class: 'projects-thumb', alt: '', width: 72, height: 72, loading: 'lazy' });
    if (e.thumb) img.src = e.thumb;
    else if (e.thumbFn) setTimeout(() => {
      try {
        const u = e.thumbFn();
        if (u) img.src = u;
      } catch {
        /* no picture */
      }
    }, 0);
    const meta = [e.info && e.info.length ? len(e.info.length) : '', e.info && e.info.song ? `♪ ${e.info.song}` : '', e.info && e.info.what, e.updatedAt ? `edited ${when(e.updatedAt)}` : ''].filter(Boolean).join(' · ');
    const vbox = h('div', { class: 'projects-versions', hidden: !openVersions.has(e.id) });
    const showVersions = async () => {
      const list = await adapter.versions(e.id);
      vbox.replaceChildren(
        list.length
          ? h(
              'ul',
              {},
              list.map((v, i) =>
                h('li', {}, h('span', {}, h('strong', {}, when(v.at)), h('span', { class: 'muted tiny' }, ` ${i === 0 ? '(newest) · ' : ''}${adapter.describe(v.data)}`)), button('Restore this version', async () => {
                  if (!confirm(`Restore “${e.name}” as it was on ${when(v.at)}? What it is now is kept as a version too.`)) return;
                  await adapter.restoreVersion(e.id, v.at);
                  close();
                }, { variant: 'sm' })),
              ),
            )
          : h('p', { class: 'muted small' }, `No versions yet. One is kept every couple of minutes while you work on it (the last 10).`),
      );
    };
    if (openVersions.has(e.id)) showVersions();
    return h(
      'li',
      { class: `projects-item${e.current ? ' on' : ''}`, 'data-id': e.id },
      h(
        'div',
        { class: 'projects-row' },
        h('button', { type: 'button', class: 'projects-open', title: `Open ${e.name}`, onclick: async () => (e.current ? close() : (await adapter.open(e.id), close())) }, img, h('span', { class: 'projects-text' }, h('strong', {}, e.name || 'Untitled', e.current ? h('span', { class: 'tag' }, 'open') : null), h('span', { class: 'muted tiny' }, meta))),
        h(
          'div',
          { class: 'projects-actions' },
          iconButton('type', `Rename ${e.name}`, async () => {
            const n = ask('New name', e.name);
            if (n && n !== e.name) {
              await adapter.rename(e.id, n);
              render();
            }
          }, 'ghost'),
          iconButton('copy', `Duplicate ${e.name}`, async () => (await adapter.duplicate(e.id), render()), 'ghost'),
          iconButton('repeat', `Versions of ${e.name}`, () => {
            if (openVersions.has(e.id)) openVersions.delete(e.id);
            else openVersions.add(e.id);
            vbox.hidden = !openVersions.has(e.id);
            if (!vbox.hidden) showVersions();
          }, 'ghost'),
          iconButton('layout', `Use ${e.name} as a template`, async () => {
            close();
            await adapter.template(e.id);
          }, 'ghost'),
          iconButton('download', `Download ${e.name}`, () => adapter.download([e.id]), 'ghost'),
          iconButton('trash', `Delete ${e.name}`, async () => {
            if (!confirm(`Delete “${e.name}” and its versions? Its media stay in the media library.${e.current ? ' It stays open, as an edit that is not in Projects.' : ''}`)) return;
            if (await adapter.remove(e.id)) toast(`Deleted “${e.name}”.`);
            render();
          }, 'ghost danger'),
        ),
      ),
      vbox,
    );
  }

  function render() {
    if (!dlg.isConnected) return;
    const all = adapter.list();
    const find = h('input', { type: 'search', placeholder: `Find a ${adapter.noun}`, value: prefs.q, 'aria-label': `Find a ${adapter.noun}`, 'data-k': 'projects-q' });
    const sort = h('select', { 'aria-label': 'Sort', 'data-k': 'projects-sort' }, SORTS.filter(([id]) => adapter.kind === 'video' || id !== 'length').map(([id, l]) => h('option', { value: id, selected: id === prefs.sort }, l)));
    const list = h('ul', { class: 'projects-list' });
    const fill = () => {
      const shown = findProjects(all, prefs.q, prefs.sort);
      list.replaceChildren(...(shown.length ? shown.map(row) : [h('li', { class: 'muted small projects-empty' }, all.length ? `Nothing called “${prefs.q.trim()}”.` : adapter.kind === 'video' ? 'No saved projects yet. Save to Projects keeps this edit here.' : 'No designs yet.')]));
    };
    find.addEventListener('input', () => ((prefs.q = find.value), fill()));
    sort.addEventListener('change', () => ((prefs.sort = sort.value), fill()));
    fill();
    body.replaceChildren(
      ...[
        currentBar(),
        h('div', { class: 'projects-tools' }, find, sort, button('Import…', () => fileIn.click(), { iconName: 'upload', variant: 'sm', title: 'Add projects from a projects file or a project file' }), button('Download all', () => adapter.download(null), { iconName: 'download', variant: 'sm', title: 'One file with every project here (not the media)', disabled: !all.length }), fileIn),
        h('p', { class: 'muted tiny' }, `${all.length} saved. A projects file holds the ${adapter.noun}s, not the media: it names each file so Replace missing files can find it again.`),
        list,
        meter,
      ].filter(Boolean),
    );
    storageEstimate().then(({ usage, quota }) => {
      const s = storageLevel(usage, quota);
      meter.textContent = `Browser storage: ${s.text}`;
      meter.classList.toggle('warn', s.warn);
    });
  }
  render();
  return { dialog: dlg, refresh: render };
}

/**
 * "Use as template": which file each slot of the new project should use. slots: [{ id, where, name, kind, present }],
 * choices(kind) -> [{ id, name }]. Resolves { oldId: newId } for the swaps picked ({} for none), or null when cancelled.
 */
export function chooseSwaps(title, slots, choices) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'projects-dialog swap-dialog', 'aria-label': title });
    const done = (v) => {
      dlg.close();
      dlg.remove();
      resolve(v);
    };
    const sels = slots.map((s) => {
      const opts = choices(s.kind).filter((c) => c.id !== s.id);
      const sel = h('select', { 'aria-label': `File for ${s.where}`, 'data-slot': s.id }, h('option', { value: '' }, s.present ? `Keep ${s.name || 'this file'}` : `Keep (missing: ${s.name || 'unknown file'})`), opts.map((c) => h('option', { value: c.id }, c.name)));
      return [s, sel];
    });
    dlg.append(
      h('div', { class: 'projects-head' }, h('h2', {}, icon('layout', 18), ` ${title}`), button('', () => requestClose(), { iconName: 'x', variant: 'ghost', title: 'Close' })),
      h(
        'div',
        { class: 'projects-body' },
        h('p', { class: 'small' }, 'The new project keeps the layout, texts, styles and timing. Pick a different file for any of these, or keep them.'),
        slots.length
          ? h('ul', { class: 'swap-list' }, sels.map(([s, sel]) => h('li', {}, h('span', { class: 'swap-where' }, h('strong', {}, s.where), h('span', { class: `muted tiny${s.present ? '' : ' warn'}` }, ` ${s.name || ''}${s.present ? '' : ' (missing)'}`)), sel)))
          : h('p', { class: 'muted small' }, 'It uses no media files.'),
        h('div', { class: 'row' }, button('Make the new project', () => done(Object.fromEntries(sels.filter(([, sel]) => sel.value).map(([s, sel]) => [s.id, sel.value]))), { iconName: 'check', variant: 'primary' }), button('Cancel', () => requestClose(), { variant: 'ghost' })),
      ),
    );
    const requestClose = guardDialog(dlg, () => done(null));
    document.body.append(dlg);
    dlg.showModal();
  });
}
