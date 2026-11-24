// The Photo Studio side of the Projects library. Designs already save themselves in this browser (photo/model.js);
// this adds their versions (one every couple of minutes while you work, the last 10, in projectstore.js), rename,
// duplicate, "Use as template", sort, and download/import as a projects file, through the shared dialog.
import { download, toast } from './dom.js';
import { projectStore } from './projectstore.js';
import { normalizeDoc } from './photo/model.js';
import { copyName, photoInfo, dueVersion, makeLibraryFile, libraryFileName, parseLibraryFile, mergeIncoming, templateFrom, mediaSlots, swapMedia } from './projectlib.js';
import { openProjects, chooseSwaps } from './projects-ui.js';

/**
 * deps: { saved() -> { current, docs }, current() -> the open design, update(fn) (one undo step on the open design),
 *         openDoc(doc, { isNew }), write() (store the designs list), remove(id), thumb(doc) -> data URL,
 *         studio: { images(), get(id), mediaNames(), learnNames(names), addVideoProjects(entries) }, refresh() }
 */
export function createPhotoProjects(deps) {
  const lastVersion = new Map();
  const docs = () => {
    const cur = deps.current();
    return deps.saved().docs.map((d) => (d.id === cur.id ? cur : d));
  };
  const byId = (id) => docs().find((d) => d.id === id) || null;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const content = (d) => JSON.stringify({ ...d, updatedAt: '' });

  /** After each save of the open design: keep a version when one is due. */
  async function saved(d, force = false) {
    if (!d || !d.id || (!d.layers.length && !force)) return;
    if (!lastVersion.has(d.id)) lastVersion.set(d.id, await projectStore.lastVersionAt('photo', d.id));
    const now = Date.now();
    if (!dueVersion(lastVersion.get(d.id) ? [{ at: lastVersion.get(d.id) }] : null, now, force)) return;
    lastVersion.set(d.id, now);
    await projectStore.addVersion('photo', d.id, d);
  }
  /** Add designs (from a file or a backup) next to the ones here; nothing here is replaced. Returns how many came in. */
  function addDesigns(list) {
    const s = deps.saved();
    const add = mergeIncoming(s.docs, list.map(normalizeDoc).filter(Boolean), (a, b) => content(a) === content(b), 'photo');
    for (const { item } of add) s.docs.push(normalizeDoc(item));
    if (add.length) {
      deps.write();
      deps.refresh();
    }
    return add.length;
  }
  const replaceOpen = (doc) =>
    deps.update((d) => {
      for (const k of Object.keys(d)) delete d[k];
      Object.assign(d, clone(doc));
    });

  const api = {
    saved,
    addDesigns,
    async versions(id) {
      const d = byId(id);
      if (d && d.id === deps.current().id) await saved(d, true);
      return projectStore.versions('photo', id);
    },
    openDialog() {
      const studio = deps.studio;
      return openProjects({
        kind: 'photo',
        title: 'Photo projects',
        noun: 'design',
        list: () => {
          const cur = deps.current().id;
          return docs().map((d) => ({ id: d.id, name: d.name, thumbFn: () => deps.thumb(d), info: photoInfo(d), updatedAt: d.updatedAt, createdAt: d.createdAt || d.updatedAt, current: d.id === cur }));
        },
        open: (id) => {
          const d = byId(id);
          if (d && id !== deps.current().id) deps.openDoc(normalizeDoc(clone(d)));
        },
        rename(id, name) {
          if (id === deps.current().id) return deps.update((d) => (d.name = name));
          const d = deps.saved().docs.find((x) => x.id === id);
          if (d) {
            d.name = name;
            d.updatedAt = new Date().toISOString();
            deps.write();
          }
        },
        duplicate(id) {
          const d = byId(id);
          if (!d) return;
          const name = copyName(d.name, docs().map((x) => x.name));
          deps.saved().docs.push(normalizeDoc({ ...clone(d), id: '', name, updatedAt: new Date().toISOString() }));
          deps.write();
          deps.refresh();
          toast(`Made “${name}”.`);
        },
        async remove(id) {
          deps.remove(id);
          await projectStore.dropVersions('photo', id);
          return true;
        },
        versions: (id) => api.versions(id),
        describe: (d) => photoInfo(d).what,
        async restoreVersion(id, at) {
          const v = (await projectStore.versions('photo', id)).find((x) => x.at === at);
          const d = byId(id);
          if (!v || !d) return;
          await saved(d, true); // what it is now becomes a version first
          const doc = normalizeDoc({ ...clone(v.data), id });
          if (id !== deps.current().id) deps.openDoc(normalizeDoc(clone(d)));
          replaceOpen(doc);
          toast(`Restored the version from ${new Date(at).toLocaleString()}. Ctrl+Z goes back.`);
        },
        async template(id) {
          const d = byId(id);
          if (!d) return;
          const fresh = templateFrom('photo', d, `${d.name} (new)`);
          const names = studio.mediaNames();
          const slots = mediaSlots('photo', fresh).map((s) => {
            const m = studio.get(s.id);
            return { ...s, kind: 'image', present: !!m, name: m ? m.name : (names[s.id] || [])[0] || '' };
          });
          const map = await chooseSwaps(`New design from “${d.name}”`, slots, () => studio.images().map((m) => ({ id: m.id, name: m.name })));
          if (!map) return;
          swapMedia(fresh, map);
          deps.openDoc(fresh, { isNew: true });
          toast(`New design from “${d.name}”.`);
        },
        download(ids) {
          const list = docs().filter((d) => !ids || ids.includes(d.id));
          if (!list.length) return;
          const text = makeLibraryFile({ photo: list }, studio.mediaNames(), (mid) => !!studio.get(mid));
          download(new Blob([text], { type: 'application/json' }), libraryFileName(list.length === 1 ? list[0].name : 'photo-projects'));
          toast(`Downloaded ${list.length === 1 ? `“${list[0].name}”` : `${list.length} designs`}. The file holds the designs, not the photos.`, 'info', 5000);
        },
        async importFile(f) {
          try {
            const parsed = parseLibraryFile(await f.text());
            studio.learnNames(parsed.names);
            const ph = addDesigns(parsed.photo);
            const vid = parsed.video.length && studio.addVideoProjects ? await studio.addVideoProjects(parsed.video) : 0;
            toast(ph || vid ? `Added ${[ph ? `${ph} design${ph === 1 ? '' : 's'}` : '', vid ? `${vid} video project${vid === 1 ? '' : 's'} (in the Video Studio)` : ''].filter(Boolean).join(' and ')}.` : 'Nothing new in that file: those designs are already here.', 'info', 6000);
          } catch (e) {
            toast(e.message, 'error', 6000);
          }
        },
      });
    },
  };
  return api;
}
