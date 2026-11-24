// The Video Studio side of the Projects library. The open edit is linked to a saved project by `projectId`
// (part of the edit, so undo and redo keep the link right). A linked edit saves itself to Projects a moment after
// each change, and keeps a version every couple of minutes (the last 10), so an earlier state can be restored
// after a reload or a crash. An edit that is not saved yet still goes to Earlier projects when it is replaced.
import { download, toast } from './dom.js';
import { projectStore } from './projectstore.js';
import { makeProjectId, dueVersion, copyName, videoInfo, makeLibraryFile, libraryFileName, parseLibraryFile, mergeIncoming, templateFrom, mediaSlots, swapMedia, fitClipsToMedia } from './projectlib.js';
import { describeProject, hasContent } from './projectfile.js';
import { normalizeProject } from './state.js';
import { openProjects, chooseSwaps } from './projects-ui.js';

/**
 * deps: { store, replaceEdit(project), media, canvas, after() (refresh panels, relink, seek 0), remember(project) -> bool,
 *         missing() -> [missing items in the edit], openRelink() }
 */
export function createVideoProjects(deps) {
  const { store, media } = deps;
  const ready = projectStore.load();
  const lastVersion = new Map(); // id -> time of the newest version (from this visit)
  let timer = null;
  let failed = false;

  const songName = (p) => {
    const id = p.song && p.song.mediaId;
    const n = id ? (media.peek(id) || {}).name || (media.names()[id] || [])[0] || '' : '';
    return n.replace(/\.[a-z0-9]{2,4}$/i, '');
  };
  /** A small frame of the preview as it is now (the open edit only). */
  const thumbNow = () => {
    try {
      const c = deps.canvas;
      if (!c || !c.width) return '';
      const w = 96;
      const t = document.createElement('canvas');
      t.width = w;
      t.height = Math.max(1, Math.round((c.height / c.width) * w));
      t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
      return t.toDataURL('image/jpeg', 0.7);
    } catch {
      return '';
    }
  };
  const entryFor = (p, prev = null, { thumb = true } = {}) => {
    const now = new Date().toISOString();
    return { id: p.projectId, kind: 'video', name: p.name || 'Untitled', createdAt: (prev && prev.createdAt) || now, updatedAt: now, thumb: (thumb && thumbNow()) || (prev && prev.thumb) || '', info: videoInfo(p, songName(p)), data: JSON.parse(JSON.stringify(p)) };
  };
  /** Write the open edit to its saved project; a version too when one is due (or `force`). */
  async function writeOpen({ force = false } = {}) {
    clearTimeout(timer);
    const p = store.get();
    if (!p.projectId) return true;
    await ready;
    const prev = projectStore.get(p.projectId);
    const now = Date.now();
    const version = dueVersion(lastVersion.has(p.projectId) ? [{ at: lastVersion.get(p.projectId) }] : null, now, force);
    const ok = await projectStore.put(entryFor(p, prev), { version });
    if (ok && version) lastVersion.set(p.projectId, now);
    if (!ok && !failed) toast('Could not save to Projects: the browser’s storage may be full. The edit itself is still saved; download your projects to be safe.', 'error', 8000);
    failed = !ok;
    return ok;
  }
  /** Called after every save of the edit: Projects follows a moment later. */
  const autosave = () => {
    if (!store.get().projectId) return;
    clearTimeout(timer);
    timer = setTimeout(() => writeOpen(), 1500);
  };
  const link = (id, name = null) =>
    store.update((d) => {
      d.projectId = id;
      if (name) d.name = name;
    });
  /** Before the open edit is replaced: save it to its project (with a version), or to Earlier projects when it has none. */
  async function keepOpen() {
    const p = store.get();
    if (p.projectId) return writeOpen({ force: true });
    return hasContent(p) ? deps.remember(p) : true;
  }
  async function openData(data, msg) {
    await keepOpen();
    deps.replaceEdit(normalizeProject(JSON.parse(JSON.stringify(data))));
    deps.after();
    const miss = deps.missing();
    toast(miss.length ? `${msg} ${miss.length} file${miss.length === 1 ? ' is' : 's are'} not in this browser.` : msg, 'info', 5000);
    if (miss.length) deps.openRelink();
  }
  const usedNames = () => projectStore.all().map((e) => e.name);
  const mediaOf = (data) =>
    mediaSlots('video', data).map((s) => {
      const m = media.peek(s.id); // names only: listing projects opens no file
      return { ...s, present: !!m, kind: m ? m.kind : (media.names()[s.id] || [])[2] || '', name: m ? m.name : (media.names()[s.id] || [])[0] || '' };
    });

  const api = {
    ready,
    autosave,
    flush: (force = false) => (force || timer ? writeOpen({ force }) : Promise.resolve(true)),
    /** Every saved project (for backups). */
    entries: () => projectStore.all(),
    /** Put the open edit in Projects under `name` (no-op when cancelled). */
    async saveOpen(name) {
      if (name == null) return false;
      link(makeProjectId(), name || store.get().name);
      const ok = await writeOpen({ force: true });
      if (ok) toast(`Saved “${store.get().name}” to Projects. Every change is kept from now on.`);
      return ok;
    },
    /** Save as: the saved project stays as it is; the open edit goes on as a new project. */
    async saveAs(name) {
      await writeOpen({ force: true });
      link(makeProjectId(), name);
      const ok = await writeOpen({ force: true });
      if (ok) toast(`Saved as “${name}”. The project you had is still in Projects.`);
      return ok;
    },
    /** Save a copy: a copy goes in Projects; you keep editing this one. */
    async saveCopy(name) {
      const p = { ...JSON.parse(JSON.stringify(store.get())), projectId: makeProjectId(), name };
      const ok = await projectStore.put(entryFor(p), { version: true });
      if (ok) toast(`Saved a copy called “${name}”.`);
      return ok;
    },
    /** A project from Earlier projects (or anywhere) put in Projects without opening it. */
    async add(data, name) {
      await ready;
      const p = { ...JSON.parse(JSON.stringify(data)), projectId: makeProjectId(), name: name || data.name || 'Untitled' };
      return projectStore.put({ ...entryFor(p, null, { thumb: false }) }, { version: true });
    },
    async open(id) {
      await ready;
      const e = projectStore.get(id);
      if (!e || e.id === store.get().projectId) return;
      await openData({ ...e.data, projectId: e.id }, `Opened “${e.name}”.`);
    },
    async rename(id, name) {
      const e = projectStore.get(id);
      if (!e) return;
      if (store.get().projectId === id) {
        store.update((d) => (d.name = name));
        return writeOpen();
      }
      await projectStore.put({ ...e, name, data: { ...e.data, name }, updatedAt: new Date().toISOString() });
    },
    async duplicate(id) {
      if (store.get().projectId === id) await writeOpen();
      const e = projectStore.get(id);
      if (!e) return;
      const nid = makeProjectId();
      const name = copyName(e.name, usedNames());
      await projectStore.put({ ...e, id: nid, name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), data: { ...e.data, projectId: nid, name } }, { version: true });
      toast(`Made “${name}”.`);
    },
    async remove(id) {
      const ok = await projectStore.remove(id);
      if (ok && store.get().projectId === id) store.update((d) => delete d.projectId);
      return ok;
    },
    versions: async (id) => {
      if (store.get().projectId === id) await writeOpen({ force: true }); // the edit as it is now is the newest version
      return projectStore.versions('video', id);
    },
    async restoreVersion(id, at) {
      const v = (await projectStore.versions('video', id)).find((x) => x.at === at);
      const e = projectStore.get(id);
      if (!v || !e) return;
      if (store.get().projectId === id) await writeOpen({ force: true }); // what it is now becomes a version first
      else await projectStore.put(e, { version: true });
      const data = { ...v.data, projectId: id };
      if (store.get().projectId === id) {
        deps.replaceEdit(normalizeProject(JSON.parse(JSON.stringify(data))));
        deps.after();
        await writeOpen();
        toast(`Restored the version from ${new Date(at).toLocaleString()}. Ctrl+Z goes back.`);
      } else {
        await projectStore.put({ ...e, data, updatedAt: new Date().toISOString() });
        await api.open(id);
      }
    },
    /** Use as template: a new edit with the same layout, texts, styles and timing, and the files you pick. */
    async template(id) {
      if (store.get().projectId === id) await writeOpen();
      const e = projectStore.get(id);
      if (!e) return;
      const fresh = templateFrom('video', e.data, `${e.name} (new)`);
      const slots = mediaOf(fresh);
      const map = await chooseSwaps(`New project from “${e.name}”`, slots, (kind) => media.all().filter((m) => !kind || m.kind === kind).map((m) => ({ id: m.id, name: m.name })));
      if (!map) return;
      swapMedia(fresh, map);
      fitClipsToMedia(fresh, (mid) => {
        const m = media.peek(mid);
        return m && m.kind === 'video' ? m.duration || 0 : 0;
      });
      await openData(fresh, `New project from “${e.name}”. Save to Projects keeps it.`);
    },
    download(ids) {
      const list = projectStore.all().filter((e) => !ids || ids.includes(e.id));
      if (!list.length) return;
      const text = makeLibraryFile({ video: list }, media.names(), (mid) => media.has(mid));
      download(new Blob([text], { type: 'application/json' }), libraryFileName(list.length === 1 ? list[0].name : 'video-projects'));
      const miss = JSON.parse(text).missing.length;
      toast(`Downloaded ${list.length === 1 ? `“${list[0].name}”` : `${list.length} projects`}. The file holds the edits, not the media${miss ? `; ${miss} file${miss === 1 ? ' was' : 's were'} already missing here and are named in it` : ''}.`, 'info', 6000);
    },
    /** Add what a projects file (or a project file) holds. Returns { video, photo } counts added; photo designs go to `addDesigns`. */
    async importText(text, addDesigns = null) {
      const parsed = parseLibraryFile(text);
      media.learnNames(parsed.names);
      const n = await api.addEntries(parsed.video);
      const ph = parsed.photo.length && addDesigns ? addDesigns(parsed.photo) : 0;
      return { video: n, photo: ph };
    },
    /** Add saved entries (from a file or a backup) next to what is here; nothing here is replaced. Returns how many came in. */
    async addEntries(list) {
      await ready;
      const same = (a, b) => JSON.stringify(a.data) === JSON.stringify(b.data);
      let n = 0;
      for (const { item } of mergeIncoming(projectStore.all(), list, same, 'video')) {
        const now = new Date().toISOString();
        const e = { ...item, kind: 'video', createdAt: item.createdAt || now, updatedAt: item.updatedAt || now, info: item.info || videoInfo(item.data), data: { ...item.data, projectId: item.id } };
        if (await projectStore.put(e, { version: true })) n++;
      }
      return n;
    },
    /** The dialog. `photoImport(docs)` adds photo designs a projects file carries. */
    openDialog({ addDesigns = null } = {}) {
      const dlg = openProjects({
        kind: 'video',
        title: 'Video projects',
        noun: 'project',
        list: () => {
          const cur = store.get().projectId;
          return projectStore.all().map((e) => ({ ...e, current: e.id === cur }));
        },
        current: () => {
          const p = store.get();
          return { name: p.name, saved: !!(p.projectId && projectStore.get(p.projectId)), save: (n) => api.saveOpen(n), saveAs: (n) => api.saveAs(n), saveCopy: (n) => api.saveCopy(n) };
        },
        open: (id) => api.open(id),
        rename: (id, n) => api.rename(id, n),
        duplicate: (id) => api.duplicate(id),
        remove: (id) => api.remove(id),
        versions: (id) => api.versions(id),
        describe: (d) => `${describeProject(d)}${d.duration ? ` · ${Math.round(d.duration)} s` : ''}`,
        restoreVersion: (id, at) => api.restoreVersion(id, at),
        template: (id) => api.template(id),
        download: (ids) => api.download(ids),
        async importFile(f) {
          try {
            const r = await api.importText(await f.text(), addDesigns);
            toast(r.video || r.photo ? `Added ${[r.video ? `${r.video} video project${r.video === 1 ? '' : 's'}` : '', r.photo ? `${r.photo} design${r.photo === 1 ? '' : 's'} (in the Photo Studio)` : ''].filter(Boolean).join(' and ')}. Open one; Replace missing files asks for any media this browser lacks.` : 'Nothing new in that file: those projects are already here.', 'info', 6000);
          } catch (e) {
            toast(e.message, 'error', 6000);
          }
        },
      });
      projectStore.load().then(() => dlg.refresh());
      return dlg;
    },
  };
  // a reload: the newest version time of the open project, so the next one is not taken right away
  ready.then(async () => {
    const id = store.get().projectId;
    if (id) lastVersion.set(id, await projectStore.lastVersionAt('video', id));
  });
  return api;
}

