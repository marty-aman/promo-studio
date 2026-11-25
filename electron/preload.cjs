// The desktop bridge: window.desktop, the only way the page reaches the Mac. Sandboxed preload (it can require
// 'electron' only), so it holds no logic beyond shaping calls: every check is in main.cjs. The page names media
// ids; file paths never reach it (a picked File's path is read here and sent straight to main).
//
// The surface is fixed in step 1. Later steps fill in the stubs (files.saveStream, native.run; step 3 also added native.status/download/removeModel/reveal/onEvent) and add names to
// info().capabilities; they do not rename calls or change arguments.
'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const ORIGIN = 'app://promo-studio';
const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
const idOk = (id) => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(id);

/** The path of a File the person picked or dropped ('' for a File made in code, which has none). */
function pathOf(file) {
  try {
    return (file && webUtils.getPathForFile(file)) || '';
  } catch {
    return '';
  }
}

contextBridge.exposeInMainWorld('desktop', {
  bridge: 1,
  /** { bridge, version, name, electron, chrome, platform, arch, capabilities: [..], disk: { free, total }, linked: { count, bytes } } */
  info: () => call('desktop:info'),
  media: {
    /** True when this File is a real file on disk (picked or dropped), so it can be linked in place. */
    canLink: (file) => !!pathOf(file),
    /**
     * Link media `id` to a file where it is, without copying it. `source` is a picked or dropped File, or
     * { token } from media.pick(). Resolves { id, name, size, ext }.
     */
    link: (id, source) => {
      if (!idOk(id)) return Promise.reject(new Error('Not a media id'));
      if (source && typeof source.token === 'string') return call('media:link', id, { token: source.token });
      const p = pathOf(source);
      return p ? call('media:link', id, { path: p }) : Promise.reject(new Error('This file is not on disk'));
    },
    /** Forget a link (the file itself is never touched). */
    unlink: (id) => call('media:unlink', id),
    /** { linked, exists, size, mtime, changed, name } */
    stat: (id) => call('media:stat', id),
    /** A URL <video>, <audio> and <img> stream from (seeking reads only what it needs). Same origin as the app. */
    urlFor: (id) => (idOk(id) ? `${ORIGIN}/__media/${encodeURIComponent(id)}` : ''),
    /** Bytes [start, end) of a linked file as a Uint8Array (at most 64 MB per call), for jobs that read in pieces. */
    read: (id, start, end) => call('media:read', id, start, end),
    /** Show the linked file in Finder. */
    reveal: (id) => call('media:reveal', id),
    /** The native open dialog: [{ token, name, size, ext }] to pass to link(). opts: { kinds: ['video'|'audio'|'image'], multiple } */
    pick: (opts) => call('media:pick', opts || {}),
  },
  files: {
    /** Step 2: write an export straight to a file the person picks. Not available yet (rejects). */
    saveStream: (opts) => call('files:saveStream', opts || {}),
  },
  shell: {
    /** Open a web page (http, https), a mailto: or a tel: link in the default app. */
    openExternal: (url) => call('shell:openExternal', String(url)),
  },
  print: {
    /** Save an HTML document as a PDF (asks where). Resolves { saved, name, bytes }. */
    toPDF: (html, title) => call('print:toPDF', String(html), String(title || 'document')),
  },
  native: {
    /**
     * Run a tool from the allowlist ('whisper') with structured options, e.g. ['--model', 'base', '--language', 'en'].
     * opts: { input: Uint8Array (a 16 kHz mono WAV), id } -> { json, seconds }. Progress arrives through onEvent.
     */
    run: (name, args, opts) => call('native:run', String(name), Array.isArray(args) ? args.map(String) : [], { id: opts && opts.id ? String(opts.id) : '', input: opts && opts.input instanceof Uint8Array ? opts.input : null }),
    /** { tools: { whisper: { installed } }, models: [{ name, label, bytes, installed, partial, downloading }], binDir, modelsDir, modelsBytes } */
    status: () => call('native:status'),
    /** Download a model ('base' | 'small') into the app's models folder. Only with { consent: true }; checked against a pinned sha256. */
    download: (model, opts) => call('native:download', String(model), { consent: !!(opts && opts.consent === true) }),
    cancelDownload: (model) => call('native:cancelDownload', String(model)),
    removeModel: (model) => call('native:removeModel', String(model)),
    /** Open the folder for the tool binary ('bin') or the models ('models') in Finder. */
    reveal: (what) => call('native:reveal', what === 'models' ? 'models' : 'bin'),
    /** cb({ type: 'download', model, loaded, total } | { type: 'run', tool, id, progress }). Returns a function that stops listening. */
    onEvent: (cb) => {
      const f = (_e, data) => cb(data);
      ipcRenderer.on('native:event', f);
      return () => ipcRenderer.removeListener('native:event', f);
    },
  },
  exports: {
    /** An export starts: keep the Mac awake; `realtime` also keeps timers running in the background. Resolves a token. */
    begin: (opts) => call('export:begin', { realtime: !!(opts && opts.realtime) }),
    end: (token) => call('export:end', String(token)),
  },
});
