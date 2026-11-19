// "From Google Drive": pick files in Google's own file picker and bring them into the media
// library, as if you had uploaded them from the computer.
//
// It runs in your browser with your own Google Cloud project (Google needs one per app): a
// client ID for signing in, an API key for the picker, and the project number. They are kept in
// this browser's settings only. The sign-in gives the app the files you pick and nothing else in
// your Drive, and the access token stays in memory for this tab (it is never saved).
import { h, icon, button, toast } from './dom.js';
import { loadSettings, saveSettings } from './state.js';

// drive.file: the app can open only the files you pick in Google's picker, nothing else in your Drive.
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GAPI = 'https://apis.google.com/js/api.js';
const GIS = 'https://accounts.google.com/gsi/client';
export const DRIVE_SETUP_URL = 'https://console.cloud.google.com/apis/credentials';

/** The saved Google settings: { clientId, apiKey, appId }. */
export function driveConfig(s = loadSettings()) {
  return { clientId: (s.gdriveClientId || '').trim(), apiKey: (s.gdriveApiKey || '').trim(), appId: (s.gdriveAppId || '').trim() };
}
export const driveReady = (c = driveConfig()) => /\.apps\.googleusercontent\.com$/.test(c.clientId) && c.apiKey.length >= 20 && /^\d{6,}$/.test(c.appId);

const MIME = {
  audio: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/opus', 'audio/flac', 'audio/x-flac', 'audio/aiff', 'audio/x-aiff'],
  video: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/x-matroska'],
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'],
};
/**
 * Picker MIME filter for an <input accept> string: only audio/video/image are filtered (Drive
 * stores Guitar Pro files and fonts as generic files, so those show everything).
 */
export function pickerMimeTypes(accept = '') {
  const parts = String(accept).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  const kinds = new Set();
  for (const p of parts) {
    const k = p.split('/')[0];
    if (p.includes('/') && MIME[k]) kinds.add(k);
    else if (/^\.(mp3|wav|m4a|aac|ogg|opus|flac|aif|aiff)$/.test(p)) kinds.add('audio');
    else if (/^\.(mp4|mov|webm|m4v)$/.test(p)) kinds.add('video');
    else if (/^\.(jpe?g|png|webp|gif|heic)$/.test(p)) kinds.add('image');
    else return ''; // something Drive has no MIME type for: don't filter
  }
  return [...kinds].flatMap((k) => MIME[k]).join(',');
}

/** Google Docs, Sheets and Slides have no file to download; they're skipped. */
export const isGoogleDoc = (mime) => /^application\/vnd\.google-apps\./.test(mime || '');

const loaded = {};
function loadScript(src) {
  return (loaded[src] ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => {
      delete loaded[src];
      reject(new Error('Could not load Google’s sign-in. Check your connection or ad blocker.'));
    };
    document.head.append(s);
  }));
}

let token = null; // { value, expires } in memory only
async function getToken(cfg) {
  if (token && token.expires > Date.now() + 60_000 && token.clientId === cfg.clientId) return token.value;
  await loadScript(GIS);
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: cfg.clientId,
      scope: DRIVE_SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) return reject(new Error(r.error_description || r.error || 'Google sign-in was cancelled.'));
        token = { value: r.access_token, expires: Date.now() + (+r.expires_in || 3600) * 1000, clientId: cfg.clientId };
        resolve(r.access_token);
      },
      error_callback: (e) => reject(new Error(e && e.type === 'popup_closed' ? 'Google sign-in was closed.' : 'Google sign-in did not finish (allow pop-ups for this page).')),
    });
    client.requestAccessToken({ prompt: token ? '' : 'consent' });
  });
}

async function openPicker(cfg, accessToken, { accept, multiple }) {
  await loadScript(GAPI);
  await new Promise((resolve, reject) => window.gapi.load('picker', { callback: resolve, onerror: () => reject(new Error('Could not load the Google Drive picker.')) }));
  const P = window.google.picker;
  return new Promise((resolve) => {
    const mimes = pickerMimeTypes(accept);
    const mk = () => {
      const v = new P.DocsView(P.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false);
      if (mimes) v.setMimeTypes(mimes);
      return v;
    };
    const shared = mk().setOwnedByMe(false); // "Shared with me", e.g. the band's shared folder
    const b = new P.PickerBuilder().setDeveloperKey(cfg.apiKey).setAppId(cfg.appId).setOAuthToken(accessToken).addView(mk()).addView(shared).setOrigin(window.location.origin).setTitle('Pick files for Band Manager');
    if (multiple) b.enableFeature(P.Feature.MULTISELECT_ENABLED);
    b.setCallback((data) => {
      const action = data[P.Response.ACTION];
      if (action === P.Action.PICKED) resolve(data[P.Response.DOCUMENTS].map((d) => ({ id: d[P.Document.ID], name: d[P.Document.NAME], mimeType: d[P.Document.MIME_TYPE], size: +d.sizeBytes || 0 })));
      else if (action === P.Action.CANCEL) resolve([]);
    });
    b.build().setVisible(true);
  });
}

/** Download a picked Drive file as a File (Google Docs are skipped). */
export async function downloadDriveFile(doc, accessToken, fetchImpl = fetch) {
  if (isGoogleDoc(doc.mimeType)) throw new Error(`“${doc.name}” is a Google Doc, not a file to download.`);
  const r = await fetchImpl(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(doc.id)}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) throw new Error(`Google Drive would not send “${doc.name}” (${r.status}).`);
  const blob = await r.blob();
  return new File([blob], doc.name, { type: doc.mimeType || blob.type || '' });
}

/**
 * Sign in (the first time), open the picker and download what you pick. Resolves to File[]
 * (empty when you cancel). `onProgress(i, n, name)` reports each download.
 */
export async function pickFromDrive({ accept = '', multiple = true, onProgress = null } = {}) {
  const cfg = driveConfig();
  if (!driveReady(cfg)) {
    openDriveSetup();
    return [];
  }
  const t = await getToken(cfg);
  const docs = await openPicker(cfg, t, { accept, multiple });
  const files = [];
  files.skipped = [];
  for (const [i, d] of docs.entries()) {
    onProgress && onProgress(i, docs.length, d.name);
    try {
      files.push(await downloadDriveFile(d, t));
    } catch (e) {
      files.skipped.push(e.message);
    }
  }
  return files;
}

/** The setup form: what to make in Google Cloud and where to paste it. */
export function driveSetupPanel(onSaved = null) {
  const c = driveConfig();
  const inp = (k, label, ph, type = 'text') => {
    const el = h('input', { type, value: c[k], placeholder: ph, autocomplete: 'off', 'aria-label': label });
    return [el, h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, label), el)];
  };
  const [idEl, idF] = inp('clientId', 'OAuth client ID', '1234-abc.apps.googleusercontent.com');
  const [keyEl, keyF] = inp('apiKey', 'API key', 'AIza…', 'password');
  const [appEl, appF] = inp('appId', 'Project number', '123456789012');
  const save = () => {
    const s = loadSettings();
    s.gdriveClientId = idEl.value.trim();
    s.gdriveApiKey = keyEl.value.trim();
    s.gdriveAppId = appEl.value.trim();
    saveSettings(s);
    token = null;
    if (!s.gdriveClientId && !s.gdriveApiKey && !s.gdriveAppId) toast('Google Drive settings removed');
    else if (!driveReady(driveConfig(s))) return toast('Check the three values: the client ID ends in .apps.googleusercontent.com and the project number is only digits.', 'error', 6000);
    else toast('Google Drive is set up in this browser');
    onSaved && onSaved();
  };
  const origin = window.location.origin;
  return h(
    'div',
    { class: 'gdrive-setup' },
    h('p', { class: 'small' }, 'Google lets an app open your Drive only through a Google Cloud project you own. It’s free and takes about 10 minutes, once:'),
    h(
      'ol',
      { class: 'small gdrive-steps' },
      h('li', {}, 'In ', h('a', { href: 'https://console.cloud.google.com/projectcreate', target: '_blank', rel: 'noopener noreferrer' }, 'Google Cloud'), ', make a project. Its number is on the project’s Dashboard (“Project number”).'),
      h('li', {}, 'Turn on the ', h('a', { href: 'https://console.cloud.google.com/apis/library/drive.googleapis.com', target: '_blank', rel: 'noopener noreferrer' }, 'Google Drive API'), ' and the ', h('a', { href: 'https://console.cloud.google.com/apis/library/picker.googleapis.com', target: '_blank', rel: 'noopener noreferrer' }, 'Google Picker API'), '.'),
      h('li', {}, 'Set up the ', h('a', { href: 'https://console.cloud.google.com/apis/credentials/consent', target: '_blank', rel: 'noopener noreferrer' }, 'OAuth consent screen'), ': External, add yourself (and bandmates) as test users.'),
      h('li', {}, 'In ', h('a', { href: DRIVE_SETUP_URL, target: '_blank', rel: 'noopener noreferrer' }, 'Credentials'), ', create an ', h('b', {}, 'OAuth client ID'), ' (Web application) with ', h('code', {}, origin), ' as an authorised JavaScript origin.'),
      h('li', {}, 'Create an ', h('b', {}, 'API key'), '. Restrict it to the Google Picker API and to the website ', h('code', {}, `${origin}/*`), '. If the picker says the key is not allowed, also add ', h('code', {}, 'https://docs.google.com/*'), '.'),
      h('li', {}, 'Paste the three values here. They stay in this browser.'),
    ),
    h('div', { class: 'mgr-three' }, idF, keyF, appF),
    h('div', { class: 'row' }, button('Save', save, { iconName: 'check', variant: 'sm primary' })),
    h('p', { class: 'muted tiny' }, 'Signing in lets the app open only the files you pick, nothing else in your Drive. Nothing is uploaded to Drive, and the sign-in lasts until you close the tab.'),
  );
}

/** A dialog with the setup form (opened when Drive isn't set up yet). */
export function openDriveSetup() {
  document.querySelectorAll('dialog.gdrive-dialog').forEach((d) => d.remove());
  const dlg = h('dialog', { class: 'gdrive-dialog', 'aria-label': 'Set up Google Drive' });
  const close = () => (dlg.close(), dlg.remove());
  dlg.append(h('div', { class: 'gdrive-dialog-head' }, h('h2', {}, icon('cloud', 18), ' Connect Google Drive'), button('', close, { iconName: 'x', variant: 'ghost', title: 'Close' })), driveSetupPanel(close));
  dlg.addEventListener('cancel', close);
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

/**
 * A "From Google Drive" button. `onFiles(files)` gets the downloaded files, like a file input's.
 */
export function driveButton(accept, multiple, onFiles, { variant = 'sm ghost', label = 'From Google Drive' } = {}) {
  const b = button(label, async () => {
    if (b.disabled) return;
    const span = b.querySelector('span');
    try {
      b.disabled = true;
      const files = await pickFromDrive({ accept, multiple, onProgress: (i, n, name) => span && (span.textContent = n > 1 ? `Downloading ${i + 1}/${n}…` : `Downloading ${name}…`) });
      if (files.length) await onFiles(files);
      if (files.skipped && files.skipped.length) {
        // keep what the upload just said, and add what was skipped
        const said = files.length ? (document.getElementById('toast')?.textContent || '') : '';
        toast(`${said ? `${said}. ` : ''}Skipped: ${files.skipped.join(' ')}`, files.length ? 'info' : 'error', 7000);
      }
    } catch (e) {
      toast(e.message || 'Google Drive did not open.', 'error', 6000);
    } finally {
      b.disabled = false;
      if (span) span.textContent = label;
    }
  }, { iconName: 'cloud', variant, title: driveReady() ? 'Pick files from your Google Drive' : 'Connect your Google Drive (one-time setup)' });
  b.classList.add('gdrive-btn');
  return b;
}
