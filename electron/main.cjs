// Promo Studio for Mac: the Electron main process. It serves the app from app://promo-studio/ (never a network
// port), opens one window, and answers the narrow desktop bridge (preload.cjs) with the checks done here.
//
// Fixed forever, because storage (localStorage, IndexedDB) is kept per origin and per app name: the origin
// app://promo-studio, productName "Promo Studio" and appId "com.martyaman.promostudio" (package.json).
'use strict';
const { app, BrowserWindow, Menu, dialog, ipcMain, powerSaveBlocker, protocol, screen, session, shell } = require('electron');
const crypto = require('node:crypto');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { SCHEME, HOST, ORIGIN, MEDIA_PREFIX, BASE_HEADERS, appFile, fileResponse, mediaType } = require('./serve.cjs');
const { createLinks } = require('./links.cjs');
const { createNative } = require('./native.cjs');
const { createExportStreams } = require('./export-stream.cjs');
const { BRIDGE_VERSION, CAPABILITIES, NATIVE_TOOLS, externalAllowed, fromApp } = require('./policy.cjs');

const ROOT = path.resolve(__dirname, '..');
// dev-only test hooks (never in a packaged app): an offscreen window for Linux CI, a separate profile, a driver
const DEV = !app.isPackaged;
if (DEV && process.env.PVM_USER_DATA) app.setPath('userData', path.resolve(process.env.PVM_USER_DATA));

protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } }]);

let links = null;
let native = null;
let streams = null; // export-stream.cjs: exports written straight to a file the person picks
let api = null; // server-api.js (ES module, loaded once)
let win = null;

// ------------------------------------------------------------------ app://promo-studio/
async function serve(request) {
  const url = new URL(request.url);
  if (url.host !== HOST) return new Response('Not found', { status: 404 });
  const range = request.headers.get('range');
  if (url.pathname.startsWith('/api/')) {
    // only this app's own pages reach app://, so the pass-throughs need no Host check; a request from another
    // origin (none can exist here) is still refused
    const origin = request.headers.get('origin');
    const site = request.headers.get('sec-fetch-site');
    const sameApp = (!origin || origin === ORIGIN) && (!site || site === 'same-origin' || site === 'none');
    const headers = Object.fromEntries([...request.headers].map(([k, v]) => [k.toLowerCase(), v]));
    const r = await api.apiRoute({ method: request.method, url, headers, sameApp, body: async (max) => {
      const text = await request.text();
      if (text.length > max) throw new Error('too big');
      return text;
    } });
    if (r) return new Response(r.body, { status: r.status, headers: { ...BASE_HEADERS, ...r.headers } });
    return new Response('Not found', { status: 404 });
  }
  if (url.pathname.startsWith(MEDIA_PREFIX)) {
    const id = decodeURIComponent(url.pathname.slice(MEDIA_PREFIX.length));
    let p = null;
    try {
      p = await links.pathOf(id);
    } catch {
      p = null;
    }
    if (!p) return new Response('Missing', { status: 404, headers: BASE_HEADERS });
    return fileResponse(p, { type: mediaType(p), range, extra: { 'Cache-Control': 'no-store' } });
  }
  if (url.pathname === '/__print') return new Response('<!doctype html><meta charset="utf-8"><title>Print</title>', { headers: { ...BASE_HEADERS, 'Content-Type': 'text/html; charset=utf-8' } });
  const file = appFile(ROOT, url.pathname);
  if (!file) return new Response('Forbidden', { status: 403 });
  try {
    return await fileResponse(file, { type: api.TYPES[path.extname(file)] || 'application/octet-stream', range });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

// ------------------------------------------------------------------ the window
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
async function loadWindowState() {
  try {
    const s = JSON.parse(await fsp.readFile(stateFile(), 'utf8'));
    const area = screen.getDisplayMatching(s).workArea;
    // still on a screen that is plugged in: keep it; otherwise only the size
    const on = s.x + 40 < area.x + area.width && s.y + 40 < area.y + area.height && s.x + s.width > area.x + 40 && s.y >= area.y - 10;
    return on ? s : { width: s.width, height: s.height, maximized: s.maximized };
  } catch {
    return { width: 1440, height: 900 };
  }
}
let saveTimer = null;
function trackWindowState(w) {
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (w.isDestroyed()) return;
      const b = w.getNormalBounds();
      fsp.writeFile(stateFile(), JSON.stringify({ ...b, maximized: w.isMaximized() })).catch(() => {});
    }, 400);
  };
  ['resize', 'move', 'maximize', 'unmaximize', 'close'].forEach((e) => w.on(e, save));
}

/** Web preferences for every window this app opens: isolated, sandboxed, no Node. */
const safePrefs = (extra = {}) => ({ contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, webviewTag: false, spellcheck: true, offscreen: DEV && process.env.PVM_OFFSCREEN === '1', ...extra });

/** Links and navigation: the app stays on its own origin; web, mail and phone links open in the default apps. */
function lockNavigation(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (externalAllowed(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (e, url) => {
    if (fromApp(url)) return;
    e.preventDefault();
    if (externalAllowed(url)) shell.openExternal(url);
  });
  contents.on('will-redirect', (e, url) => {
    if (!fromApp(url)) e.preventDefault();
  });
  contents.on('will-attach-webview', (e) => e.preventDefault());
}

async function createWindow(page = '/') {
  const s = await loadWindowState();
  const w = new BrowserWindow({
    width: s.width || 1440,
    height: s.height || 900,
    ...(Number.isFinite(s.x) && Number.isFinite(s.y) ? { x: s.x, y: s.y } : {}),
    minWidth: 360,
    minHeight: 500,
    title: 'Promo Studio',
    backgroundColor: '#0d0d12',
    show: false,
    webPreferences: safePrefs({ preload: path.join(__dirname, 'preload.cjs') }),
  });
  if (s.maximized) w.maximize();
  trackWindowState(w);
  lockNavigation(w.webContents);
  w.once('ready-to-show', () => w.show());
  await w.loadURL(`${ORIGIN}${page}`);
  return w;
}

// ------------------------------------------------------------------ the bridge (preload.cjs calls these)
/** Register an ipcMain handler that answers only this app's own pages. */
function handle(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => {
    const frame = event.senderFrame;
    if (!frame || !fromApp(frame.url)) throw new Error('Not allowed');
    return fn(event, ...args);
  });
}

const picks = new Map(); // token -> path, from the open dialog, kept for 10 minutes
const watched = new WeakSet(); // webContents whose export files are cleaned up when they go
const holds = new Map(); // export token -> { blocker, contents, realtime }

async function diskSpace() {
  try {
    const s = await fsp.statfs(app.getPath('userData'));
    return { free: s.bavail * s.bsize, total: s.blocks * s.bsize };
  } catch {
    return { free: null, total: null };
  }
}

function registerBridge() {
  handle('desktop:info', async () => ({
    bridge: BRIDGE_VERSION,
    version: app.getVersion(),
    name: app.getName(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    platform: process.platform,
    arch: process.arch,
    capabilities: [...CAPABILITIES, ...(await Promise.all(NATIVE_TOOLS.map(async (t) => ((await native.toolPath(t)) ? `native.run:${t}` : null)))).filter(Boolean)],
    disk: await diskSpace(),
    linked: await links.totals(),
    nativeModelsBytes: await native.modelsBytes(),
  }));

  // linked files: the page names ids; paths come from the dialog (a token) or the preload's getPathForFile
  handle('media:link', async (_e, id, source) => {
    let p = null;
    if (source && typeof source.token === 'string') {
      p = picks.get(source.token) || null;
      picks.delete(source.token);
    } else if (source && typeof source.path === 'string') p = source.path; // from webUtils.getPathForFile in the preload
    if (!p) throw new Error('Pick the file again');
    return links.add(id, p);
  });
  handle('media:unlink', (_e, id) => links.remove(id));
  handle('media:stat', (_e, id) => links.stat(id));
  handle('media:read', (_e, id, start, end) => links.read(id, start, end));
  handle('media:reveal', async (_e, id) => {
    const p = await links.pathOf(id);
    if (!p) return false;
    shell.showItemInFolder(p);
    return true;
  });
  handle('media:pick', async (event, opts = {}) => {
    const kinds = Array.isArray(opts.kinds) ? opts.kinds : ['video'];
    const ext = { video: ['mp4', 'm4v', 'mov', 'webm', 'mkv'], audio: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'aif', 'aiff', 'ogg', 'opus'], image: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic'] };
    const filters = kinds.filter((k) => ext[k]).map((k) => ({ name: k[0].toUpperCase() + k.slice(1), extensions: ext[k] }));
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { properties: ['openFile', ...(opts.multiple ? ['multiSelections'] : [])], filters });
    if (r.canceled) return [];
    const out = [];
    for (const p of r.filePaths.slice(0, 200)) {
      const st = await fsp.stat(p).catch(() => null);
      if (!st || !st.isFile()) continue;
      const token = crypto.randomUUID();
      picks.set(token, p);
      setTimeout(() => picks.delete(token), 10 * 60 * 1000);
      out.push({ token, name: path.basename(p), size: st.size, ext: path.extname(p).toLowerCase() });
    }
    return out;
  });

  handle('shell:openExternal', async (_e, url) => {
    if (!externalAllowed(url)) throw new Error('Only web, mail and phone links open outside the app');
    await shell.openExternal(url);
    return true;
  });

  // Export PDF: the document is drawn in a hidden same-origin window and saved where the person chooses
  handle('print:toPDF', async (event, html, title = 'document') => {
    if (typeof html !== 'string' || html.length > 50_000_000) throw new Error('Bad document');
    const name = `${String(title).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 100) || 'document'}.pdf`;
    const pw = new BrowserWindow({ show: false, webPreferences: safePrefs({ javascript: true }) });
    lockNavigation(pw.webContents);
    try {
      await pw.loadURL(`${ORIGIN}/__print`);
      await pw.webContents.executeJavaScript(`(async (html) => { document.open(); document.write(html); document.close(); await Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => (i.onload = i.onerror = r)))); await document.fonts.ready; return true; })(${JSON.stringify(html)})`);
      const pdf = await pw.webContents.printToPDF({ printBackground: true, pageSize: 'Letter', margins: { marginType: 'default' } });
      if (DEV && process.env.PVM_PDF_OUT) {
        await fsp.writeFile(path.resolve(process.env.PVM_PDF_OUT), pdf);
        return { saved: true, name, bytes: pdf.length };
      }
      const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), { defaultPath: path.join(app.getPath('downloads'), name), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
      if (r.canceled || !r.filePath) return { saved: false };
      await fsp.writeFile(r.filePath, pdf);
      return { saved: true, name: path.basename(r.filePath), bytes: pdf.length };
    } finally {
      pw.destroy();
    }
  });

  // Exports: keep the Mac awake for any export; a real-time export also keeps its timers running when hidden
  handle('export:begin', (event, opts = {}) => {
    const token = crypto.randomUUID();
    const realtime = !!(opts && opts.realtime);
    const blocker = powerSaveBlocker.start('prevent-app-suspension');
    if (realtime) event.sender.setBackgroundThrottling(false);
    holds.set(token, { blocker, contents: event.sender, realtime });
    return token;
  });
  handle('export:end', (_e, token) => {
    const h = holds.get(token);
    if (!h) return false;
    holds.delete(token);
    if (powerSaveBlocker.isStarted(h.blocker)) powerSaveBlocker.stop(h.blocker);
    if (h.realtime && ![...holds.values()].some((x) => x.realtime && x.contents === h.contents) && !h.contents.isDestroyed()) h.contents.setBackgroundThrottling(true);
    return true;
  });

  // Export straight to a file (export-stream.cjs): the dialog gives the only path; the page sends pieces by id.
  // The owner is the window's webContents id, so a window can only touch its own files.
  handle('files:pickFolder', (event) => streams.pickFolder(event.sender.id));
  handle('files:saveStream', async (event, opts) => {
    const o = opts && typeof opts === 'object' ? { name: opts.name, ext: opts.ext, ...(typeof opts.folder === 'string' ? { folder: opts.folder } : {}) } : {};
    const r = await streams.begin(event.sender.id, o);
    if (r && !watched.has(event.sender)) {
      watched.add(event.sender);
      const owner = event.sender.id;
      event.sender.once('destroyed', () => streams.abortOwner(owner));
    }
    return r;
  });
  handle('files:write', (event, id, position, bytes) => streams.write(event.sender.id, id, position, bytes));
  handle('files:finish', (event, id) => streams.finish(event.sender.id, id));
  handle('files:abort', (event, id) => streams.abort(event.sender.id, id));
  handle('files:reveal', (_e, p) => {
    if (!streams.isSaved(p)) return false;
    shell.showItemInFolder(String(p));
    return true;
  });
  // Native tools (electron/native.cjs): whisper.cpp for faster lyric sync and captions. The binary is put in
  // <userData>/bin by the person; models are downloaded after they agree. Progress goes back as 'native:event'.
  handle('native:run', async (event, name, args, opts = {}) => {
    if (!NATIVE_TOOLS.includes(name)) throw new Error(`No bundled tool called ${String(name).slice(0, 40)}`);
    const id = opts && typeof opts.id === 'string' ? opts.id.slice(0, 64) : '';
    const input = opts && opts.input instanceof Uint8Array ? opts.input : null;
    return native.run(name, args, { input, onProgress: (progress) => !event.sender.isDestroyed() && event.sender.send('native:event', { type: 'run', tool: name, id, progress }) });
  });
  handle('native:status', () => native.status());
  handle('native:download', (event, model, opts = {}) =>
    native.downloadModel(String(model), { consent: !!(opts && opts.consent === true), onProgress: (p) => !event.sender.isDestroyed() && event.sender.send('native:event', { type: 'download', model: String(model), ...p }) }),
  );
  handle('native:cancelDownload', (_e, model) => native.cancelDownload(String(model)));
  handle('native:removeModel', (_e, model) => native.removeModel(String(model)));
  handle('native:reveal', async (_e, what) => {
    const dir = what === 'models' ? native.modelsDir : native.binDir;
    await fsp.mkdir(dir, { recursive: true });
    return (await shell.openPath(dir)) === '';
  });
}

// ------------------------------------------------------------------ menu
function buildMenu() {
  const mac = process.platform === 'darwin';
  const selfCheck = { label: 'Mac self-check…', click: () => createWindow('/selfcheck.html') };
  const template = [
    ...(mac ? [{ role: 'appMenu', submenu: [{ role: 'about' }, { type: 'separator' }, selfCheck, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] }] : [{ role: 'fileMenu' }]),
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    { role: 'help', submenu: [...(mac ? [] : [selfCheck]), { label: 'Promo Studio on GitHub', click: () => shell.openExternal('https://github.com/marty-aman/promo-studio') }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ------------------------------------------------------------------ start
const PERMISSIONS = new Set(['persistent-storage', 'notifications', 'clipboard-sanitized-write', 'screen-wake-lock', 'wake-lock', 'fullscreen']);

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('web-contents-created', (_e, contents) => lockNavigation(contents));

app.whenReady().then(async () => {
  api = await import(pathToFileURL(path.join(ROOT, 'server-api.js')).href);
  links = createLinks({ configDir: app.getPath('userData') });
  native = createNative({ dir: app.getPath('userData') });
  streams = createExportStreams({
    freeBytes: async (dir) => {
      try {
        const st = await fsp.statfs(dir);
        return st.bavail * st.bsize;
      } catch {
        return null;
      }
    },
    pickPath: async ({ owner, defaultName, ext }) => {
      // dev-only test hook (never in a packaged app): the save location without a dialog
      if (DEV && process.env.PVM_SAVE_DIR) return path.join(path.resolve(process.env.PVM_SAVE_DIR), defaultName);
      const w = BrowserWindow.getAllWindows().find((x) => x.webContents.id === owner) || undefined;
      const r = await dialog.showSaveDialog(w, { defaultPath: path.join(app.getPath('movies'), defaultName), filters: [{ name: 'MP4 video', extensions: [ext] }] });
      return r.canceled || !r.filePath ? null : r.filePath;
    },
    pickFolder: async ({ owner }) => {
      // dev-only test hook (never in a packaged app): the folder without a dialog
      if (DEV && process.env.PVM_SAVE_DIR) return path.resolve(process.env.PVM_SAVE_DIR);
      const w = BrowserWindow.getAllWindows().find((x) => x.webContents.id === owner) || undefined;
      const r = await dialog.showOpenDialog(w, { title: 'Choose a folder for the videos', buttonLabel: 'Save here', defaultPath: app.getPath('movies'), properties: ['openDirectory', 'createDirectory'] });
      return r.canceled || !r.filePaths || !r.filePaths[0] ? null : r.filePaths[0];
    },
  });
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, cb, details) => cb(PERMISSIONS.has(permission) && fromApp(details.requestingUrl || '')));
  ses.setPermissionCheckHandler((_wc, permission, origin) => PERMISSIONS.has(permission) && fromApp(origin || ''));
  // small downloads (pictures, PDFs, zips, an exported video's Download button) ask where to save, starting in Downloads
  ses.on('will-download', (_e, item) => item.setSaveDialogOptions({ defaultPath: path.join(app.getPath('downloads'), item.getFilename()) }));
  protocol.handle(SCHEME, serve);
  registerBridge();
  buildMenu();
  win = await createWindow();
  if (DEV && process.env.PVM_E2E) require(path.resolve(process.env.PVM_E2E))({ app, win, ORIGIN, createWindow, links });
  app.on('activate', async () => {
    if (!BrowserWindow.getAllWindows().length) win = await createWindow();
  });
});

app.on('before-quit', () => {
  if (native) native.killAll();
  if (streams) streams.abortOwner(null); // best effort: the partial files go
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || (DEV && process.env.PVM_E2E)) app.quit();
});

