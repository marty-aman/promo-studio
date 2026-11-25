// What the page does differently inside the Mac app (electron/). Without window.desktop (the web build) every
// export here is a no-op or false, so the web app behaves exactly as before.
//
// window.desktop (electron/preload.cjs) is the only way to the Mac: linked files (media.link / urlFor / read /
// stat / reveal / pick), shell.openExternal, print.toPDF, exports.begin/end, and stubs for later steps
// (files.saveStream, native.run). info().capabilities says which of them this build can do.

/** The bridge, or null in a browser. */
export const desktop = typeof window !== 'undefined' && window.desktop && window.desktop.bridge >= 1 ? window.desktop : null;
export const isDesktop = !!desktop;

/** Videos at least this big are linked in place (read where they are) instead of copied into the app's storage. */
export const LINK_MIN_BYTES = 200 * 1024 * 1024;
/** Settings choice for big videos: 'big' (link them, the default), 'ask' (ask each time) or 'never' (always copy). */
export const LINK_CHOICES = { big: 'Link videos over 200 MB where they are', ask: 'Ask each time', never: 'Always copy into Promo Studio' };

/**
 * Should this import be linked in place? 'link', 'copy' or 'ask'. Only videos that are real files on disk
 * (`onDisk`), and only from the desktop app. Pure: the caller asks when the answer is 'ask'.
 */
export function linkDecision({ kind, size, onDisk, choice = 'big', desktopApp = isDesktop }) {
  if (!desktopApp || !onDisk || kind !== 'video') return 'copy';
  if (choice === 'never') return 'copy';
  if (choice === 'ask') return 'ask';
  return size >= LINK_MIN_BYTES ? 'link' : 'copy';
}

// kept under its own key: the app's settings object is held and re-saved by several panels
const LINK_KEY = 'pvm.desktopLink.v1';
/** The big-video choice ('big', 'ask' or 'never'). */
export function linkChoice() {
  try {
    const v = localStorage.getItem(LINK_KEY);
    return v in LINK_CHOICES ? v : 'big';
  } catch {
    return 'big';
  }
}
export function setLinkChoice(v) {
  if (!(v in LINK_CHOICES)) return;
  try {
    localStorage.setItem(LINK_KEY, v);
  } catch {
    /* storage full: the default stays */
  }
}

/**
 * Link `file` (a File the person picked or dropped) in place? `choice` is linkChoice(); asks with `confirm` when
 * it is 'ask'. False in a browser.
 */
export function wantsLink(file, kind, choice = 'big', ask = (q) => confirm(q)) {
  if (!desktop || !file || typeof file.size !== 'number') return false;
  const d = linkDecision({ kind, size: file.size, onDisk: desktop.media.canLink(file), choice });
  if (d === 'ask') return ask(`Link “${file.name}” where it is instead of copying it into Promo Studio?\n\nOK: link it (saves space; keep the file where it is).\nCancel: copy it.`);
  return d === 'link';
}

/** Linked files bigger than this are not read whole into memory (blob() resolves null; jobs read in pieces). */
export const LINK_BLOB_MAX = 2 * 1024 * 1024 * 1024; // shortcut: decodeAudioData needs the whole file; a bigger file's sound is skipped by the fast export's mix

/** A reader for a linked file, in pieces: { size, read(start, end) -> Promise<Uint8Array> }. */
export function linkedReader(id, size) {
  return { size, read: (start, end) => desktop.media.read(id, start, Math.min(end, size)) };
}

/**
 * Around an export: keep the Mac awake, and for a real-time export keep its timers running when the window is
 * hidden. Resolves a release function (a no-op in a browser).
 */
export async function holdForExport(realtime = false) {
  if (!desktop) return () => {};
  let token = null;
  try {
    token = await desktop.exports.begin({ realtime });
  } catch {
    return () => {};
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    desktop.exports.end(token).catch(() => {});
  };
}

/** Features that sign in with Google cannot run in the app (Google blocks its sign-in in apps like this one). */
export const GOOGLE_SIGNIN_NOTE = 'Google sign-in does not work inside the Mac app yet. Use the web version for this, in Chrome.';

/**
 * Page-wide desktop behaviour: a `desktop` class on <body>, and links to blob: files (a cover shown full size)
 * open in an in-app viewer, since the default browser cannot open them.
 */
export function installDesktopPage() {
  if (!desktop || typeof document === 'undefined') return;
  document.documentElement.classList.add('desktop');
  document.addEventListener(
    'click',
    (e) => {
      const a = e.target && e.target.closest ? e.target.closest('a[href^="blob:"]') : null;
      if (!a || a.hasAttribute('download')) return;
      e.preventDefault();
      showViewer(a.href, a.getAttribute('title') || 'Full size');
    },
    true,
  );
}

function showViewer(url, label) {
  const dlg = document.createElement('dialog');
  dlg.className = 'desktop-viewer';
  dlg.setAttribute('aria-label', label);
  const img = document.createElement('img');
  img.src = url;
  img.alt = label;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn sm';
  close.textContent = 'Close';
  close.addEventListener('click', () => dlg.close());
  dlg.append(img, close);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => e.target === dlg && dlg.close());
  document.body.append(dlg);
  dlg.showModal();
}
