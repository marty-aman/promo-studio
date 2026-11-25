// The dialogs for "Export everything" and "Import everything" (everything.js does the work), and the welcome note of a
// first, empty run of the Mac app.
import { h, button, download, pickFiles } from './dom.js';
import { fmtBytes } from './medialight.js';
import { blobSink, fileSink } from './zipstream.js';
import { exportEverything, inventory, openBundle, verifyBundle, bigVideos, linkBig, restoreBundle, commitLocalStorage, localKeys } from './everything.js';
import { desktop, isDesktop } from './desktop.js';

const WELCOME_KEY = 'pvm.welcomeDesktop.v1';
const secs = (ms) => (ms < 1500 ? `${ms} ms` : ms < 90000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 60000)} min`);

/** A modal <dialog> with a title and a body that the caller re-renders. Returns { dlg, body, close }. */
function modal(title) {
  const body = h('div', { class: 'ev-body' });
  const dlg = h('dialog', { class: 'ev-dialog', 'aria-label': title }, h('h3', {}, title), body);
  document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('cancel', (e) => dlg.dataset.locked && e.preventDefault());
  dlg.showModal();
  return { dlg, body, close: () => dlg.close(), lock: (on) => (on ? (dlg.dataset.locked = '1') : delete dlg.dataset.locked) };
}
const bar = () => {
  const el = h('progress', { class: 'ev-bar', max: 1, value: 0 });
  const label = h('div', { class: 'muted tiny ev-label', role: 'status' });
  return { el, label, set: (done, total, text) => ((el.value = total ? Math.min(1, done / total) : 0), (label.textContent = `${total ? Math.round(Math.min(1, done / total) * 100) : 0}% · ${fmtBytes(done)} of ${fmtBytes(total)}${text ? ` · ${text}` : ''}`)) };
};

// ---------------------------------------------------------------- export
export async function openExportDialog() {
  const m = modal('Export everything');
  m.body.replaceChildren(h('p', { class: 'muted' }, 'Counting what is stored in this browser…'));
  let inv;
  try {
    inv = await inventory();
  } catch (e) {
    m.body.replaceChildren(h('p', { class: 'ev-err' }, `Could not read this browser’s storage: ${e.message}`), button('Close', m.close));
    return;
  }
  const abort = new AbortController();
  const lines = h('ul', { class: 'ev-list' }, h('li', {}, `${inv.mediaCount} media file${inv.mediaCount === 1 ? '' : 's'} (${fmtBytes(inv.mediaBytes)})`), h('li', {}, `${(inv.dbs['pvm-projects'] || {}).projects ? inv.dbs['pvm-projects'].projects.count : 0} saved projects, ${(inv.dbs['pvm-sounds'] || {}).sounds ? inv.dbs['pvm-sounds'].sounds.count : 0} sounds`), h('li', {}, `${inv.local.count} settings and Manager data entries`));
  const save = button('Save the zip', () => start(), { iconName: 'download', variant: 'primary' });
  const cancel = button('Cancel', () => m.close());
  m.body.replaceChildren(h('p', {}, h('strong', {}, `About ${fmtBytes(inv.bytes)}`), ' will go into one .zip. AI models are not included (they download again).'), lines, h('p', { class: 'muted tiny' }, 'Keep this tab open until it says it is done. In the Mac app choose “Import everything” and pick this file.'), h('div', { class: 'ev-actions' }, cancel, save));
  const start = async () => {
    const t0 = Date.now();
    let sink = blobSink();
    let file = null;
    const stamp = new Date().toISOString().slice(0, 10);
    const name = `promo-studio-everything-${stamp}.zip`;
    if (window.showSaveFilePicker) {
      try {
        file = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Zip', accept: { 'application/zip': ['.zip'] } }] });
        sink = fileSink(await file.createWritable());
      } catch (e) {
        if (e && e.name === 'AbortError') return; // chose not to save
        sink = blobSink(); // no file access here: it is built in the browser and downloaded at the end
      }
    }
    const pb = bar();
    const stop = button('Cancel', () => (abort.abort(), (stop.disabled = true)));
    m.lock(true);
    m.body.replaceChildren(h('p', {}, 'Writing the zip. This can take a while for a big library.'), pb.el, pb.label, h('div', { class: 'ev-actions' }, stop));
    pb.set(0, inv.bytes, '');
    try {
      const { manifest, size } = await exportEverything({ sink, total: inv.bytes, signal: abort.signal, onProgress: (p) => pb.set(p.done, p.total, p.label) });
      if (sink.close) await sink.close();
      else download(sink.result(), name);
      m.lock(false);
      m.body.replaceChildren(h('p', {}, h('strong', {}, 'Done. '), `${fmtBytes(size)} in ${secs(Date.now() - t0)}: ${manifest.counts.media} media files, ${manifest.files.length} files in the zip.`), h('p', { class: 'muted tiny' }, file ? 'Saved where you chose.' : `Saved as ${name} in your downloads.`), h('div', { class: 'ev-actions' }, button('Close', m.close, { variant: 'primary' })));
    } catch (e) {
      if (sink.abort) await sink.abort();
      m.lock(false);
      m.body.replaceChildren(h('p', { class: e.name === 'Cancelled' ? 'muted' : 'ev-err' }, e.name === 'Cancelled' ? 'Cancelled. Nothing was changed here.' : `The export stopped: ${e.message}`), h('div', { class: 'ev-actions' }, button('Close', m.close)));
    }
  };
}

// ---------------------------------------------------------------- import
export async function openImportDialog() {
  const [f] = await pickFiles('.zip,application/zip', false);
  if (!f) return;
  const m = modal('Import everything');
  const abort = new AbortController();
  const fail = (msg) => (m.lock(false), m.body.replaceChildren(h('p', { class: 'ev-err' }, msg), h('div', { class: 'ev-actions' }, button('Close', m.close))));
  let bundle;
  try {
    m.body.replaceChildren(h('p', { class: 'muted' }, `Opening ${f.name}…`));
    bundle = await openBundle(f);
  } catch (e) {
    return fail(e.message);
  }
  const pb = bar();
  const stop = button('Cancel', () => (abort.abort(), (stop.disabled = true)));
  m.lock(true);
  m.body.replaceChildren(h('p', {}, 'Checking the zip against its manifest (sha256 of every file)…'), pb.el, pb.label, h('div', { class: 'ev-actions' }, stop));
  const t0 = Date.now();
  let bad;
  try {
    bad = await verifyBundle(bundle, { signal: abort.signal, onProgress: (p) => pb.set(p.done, p.total, '') });
  } catch (e) {
    return e.name === 'Cancelled' ? (m.close(), undefined) : fail(`Could not read the zip: ${e.message}`);
  }
  m.lock(false);
  if (bad.length) return fail(`This zip is damaged: ${bad.length} file${bad.length === 1 ? '' : 's'} do not match their checksum (for example ${bad[0]}). Export again, or copy the file again. Nothing was changed.`);
  const verifyMs = Date.now() - t0;
  const here = await inventory().catch(() => null);
  const mf = bundle.manifest;
  const big = await bigVideos(bundle).catch(() => []);
  const picked = new Map(); // id -> true once linked
  const cnt = (db, st) => (mf.dbs[db] && mf.dbs[db].stores[st] ? mf.dbs[db].stores[st].count : 0);
  const had = (db, st) => (here && here.dbs[db] ? here.dbs[db][st].count : 0);
  const row = (label, now, then) => h('tr', {}, h('td', {}, label), h('td', { class: 'num' }, String(now)), h('td', { class: 'num' }, String(then)));
  const table = h('table', { class: 'ev-table' }, h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Here now (replaced)'), h('th', {}, 'In the zip'))), h('tbody', {}, row('Media files', had('pvm-media', 'media'), cnt('pvm-media', 'media')), row('Saved projects', had('pvm-projects', 'projects'), cnt('pvm-projects', 'projects')), row('Sounds', had('pvm-sounds', 'sounds'), cnt('pvm-sounds', 'sounds')), row('Settings and Manager data', localKeys().length, mf.localStorage.count)));
  const linkNote = h('p', { class: 'muted tiny' });
  const linkBox = big.length && desktop ? h('div', { class: 'ev-link' }, h('p', {}, `${big.length} video${big.length === 1 ? ' is' : 's are'} over 200 MB (${big.map((b) => `${b.name}, ${fmtBytes(b.size)}`).join('; ')}). If the original ${big.length === 1 ? 'file is' : 'files are'} on this Mac, link ${big.length === 1 ? 'it' : 'them'} where ${big.length === 1 ? 'it is' : 'they are'} instead of copying.`), button('Find the original files…', () => find(), { variant: 'sm' }), linkNote) : null;
  const find = async () => {
    try {
      const files = await desktop.media.pick({ kinds: ['video'], multiple: true });
      let ok = 0;
      for (const b of big) {
        if (picked.has(b.id)) continue;
        const hit = (files || []).find((x) => x.size === b.size && (x.name || '').toLowerCase() === b.name.toLowerCase()) || (files || []).find((x) => x.size === b.size);
        if (hit && (await linkBig(b, hit))) (picked.set(b.id, b.size), ok++);
      }
      linkNote.textContent = `${picked.size} of ${big.length} linked in place; the rest are copied from the zip.${ok ? '' : ' None of the chosen files matched (size and first/last megabyte).'}`;
    } catch (e) {
      linkNote.textContent = `Could not link: ${e.message}`;
    }
  };
  const go = button('Replace and import', () => doImport(), { iconName: 'upload', variant: 'primary' });
  m.body.replaceChildren(
    h('p', {}, h('strong', {}, 'The zip is intact'), ` (${mf.files.length} files, checked in ${secs(verifyMs)}). Made ${mf.createdAt ? mf.createdAt.slice(0, 10) : ''} by Promo Studio ${mf.app && mf.app.version ? mf.app.version : ''}.`),
    h('p', {}, h('strong', {}, 'Importing replaces'), ' everything below with the zip’s version. This cannot be undone, so export from here first if you want to keep what is here.'),
    table,
    linkBox,
    h('div', { class: 'ev-actions' }, button('Cancel', m.close), go),
  );
  const doImport = async () => {
    const pr = bar();
    m.lock(true);
    m.body.replaceChildren(h('p', {}, 'Restoring. Do not close this window.'), pr.el, pr.label);
    const t1 = Date.now();
    try {
      await restoreBundle(bundle, { linked: new Set(picked.keys()), skipBytes: [...picked.values()].reduce((a, b) => a + b, 0), onProgress: (p) => pr.set(p.done, p.total, p.label) });
      pr.label.textContent = `Done in ${secs(Date.now() - t1)}. Reloading…`;
      await commitLocalStorage(bundle);
      setTimeout(() => location.reload(), 400);
    } catch (e) {
      fail(`The import stopped part-way: ${e.message}. What was in the library may be partly replaced; import the zip again to finish.`);
    }
  };
}

// ---------------------------------------------------------------- welcome (Mac app, empty library)
export async function maybeWelcome() {
  if (!isDesktop || localStorage.getItem(WELCOME_KEY)) return;
  // empty = nothing in the databases and no song in the Manager (the app itself writes a few keys, such as pvm.tab, at start)
  const inv = await inventory().catch(() => null);
  if (!inv || Object.values(inv.dbs).some((d) => Object.values(d).some((x) => x.count))) return;
  try {
    const ws = JSON.parse(localStorage.getItem('pvm.manager.v1') || 'null');
    if (ws && (ws.artists || [ws]).some((a) => a && ((a.songs || []).length || (a.fans || []).length))) return;
  } catch {
    return;
  }
  const m = modal('Welcome to Promo Studio');
  const done = () => (localStorage.setItem(WELCOME_KEY, '1'), m.close());
  m.body.replaceChildren(
    h('p', {}, 'This app starts with an empty library. It does not read your browser’s data by itself.'),
    h('p', {}, 'To bring your songs, projects and media over:'),
    h('ol', { class: 'ev-steps' }, h('li', {}, 'In the browser where you used Promo Studio, open the Manager and choose “Export everything”.'), h('li', {}, 'Here, choose “Import everything” (below, or later in the Manager) and pick that .zip.')),
    h('p', { class: 'muted tiny' }, 'Videos over 200 MB can stay where they are on this Mac instead of being copied.'),
    h('div', { class: 'ev-actions' }, button('Start fresh', done), button('Import everything…', () => (done(), openImportDialog()), { variant: 'primary' })),
  );
}
