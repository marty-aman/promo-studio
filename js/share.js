// Sharing: the system share sheet (phones / supported desktops) and direct YouTube upload.
//
// YouTube runs fully in the browser with Google Identity Services (OAuth token model):
// the user's own OAuth *client ID* (not a secret) is kept in localStorage; the access token is
// held in memory only, never stored, and revoked on disconnect.

export function canShareFiles(file) {
  try {
    return !!(navigator.canShare && navigator.canShare({ files: [file] }));
  } catch {
    return false;
  }
}

export async function shareFile(file, { title, text } = {}) {
  await navigator.share({ files: [file], title, text });
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';

function loadGis() {
  if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Google sign-in. Check your connection or ad blocker.'));
    document.head.append(s);
  });
}

const state = { token: null, expiresAt: 0, clientId: null };

export const youtube = {
  isConnected: () => !!state.token && Date.now() < state.expiresAt - 60_000,

  /** Opens Google's consent popup. Must be called from a click. */
  async connect(clientId) {
    const id = String(clientId || '').trim();
    if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(id)) throw new Error('That does not look like a Google OAuth client ID (it ends in .apps.googleusercontent.com).');
    await loadGis();
    return new Promise((resolve, reject) => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: id,
        scope: UPLOAD_SCOPE,
        callback: (resp) => {
          if (resp.error) return reject(new Error(resp.error_description || resp.error));
          if (!window.google.accounts.oauth2.hasGrantedAllScopes(resp, UPLOAD_SCOPE)) return reject(new Error('YouTube upload permission was not granted.'));
          state.token = resp.access_token;
          state.expiresAt = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
          state.clientId = id;
          resolve();
        },
        error_callback: (err) => reject(new Error(err && err.type === 'popup_closed' ? 'Sign-in window was closed.' : 'Google sign-in failed.')),
      });
      client.requestAccessToken({ prompt: '' });
    });
  },

  disconnect() {
    if (state.token && window.google && window.google.accounts) window.google.accounts.oauth2.revoke(state.token, () => {});
    state.token = null;
    state.expiresAt = 0;
  },

  /**
   * Resumable upload. meta: { title, description, tags[], privacy, madeForKids, paidPromotion }.
   * Returns the new video id.
   */
  async upload(blob, meta, onProgress) {
    if (!youtube.isConnected()) throw new Error('Connect your YouTube account first.');
    const body = {
      snippet: {
        title: String(meta.title || 'New song').slice(0, 100),
        description: String(meta.description || '').slice(0, 5000),
        tags: (meta.tags || []).slice(0, 30),
        categoryId: '10', // Music
      },
      status: { privacyStatus: meta.privacy || 'public', selfDeclaredMadeForKids: !!meta.madeForKids },
      paidProductPlacementDetails: { hasPaidProductPlacement: !!meta.paidPromotion },
    };
    const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status,paidProductPlacementDetails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${state.token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': blob.type || 'video/mp4',
        'X-Upload-Content-Length': String(blob.size),
      },
      body: JSON.stringify(body),
    });
    if (!init.ok) throw new Error(await apiError(init));
    const location = init.headers.get('Location');
    if (!location) throw new Error('YouTube did not return an upload address.');
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', location);
      xhr.setRequestHeader('Content-Type', blob.type || 'video/mp4');
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText).id);
          } catch {
            reject(new Error('Upload finished but the response was not understood.'));
          }
        } else reject(new Error(errorText(xhr.status, xhr.responseText)));
      };
      xhr.onerror = () => reject(new Error('Network error while uploading.'));
      xhr.send(blob);
    });
  },
};

async function apiError(res) {
  return errorText(res.status, await res.text().catch(() => ''));
}
function errorText(status, text) {
  try {
    const e = JSON.parse(text).error;
    const reason = e.errors && e.errors[0] && e.errors[0].reason;
    if (reason === 'quotaExceeded') return 'Your Google Cloud project is out of YouTube upload quota for today.';
    if (status === 401) return 'Your YouTube sign-in expired. Connect again.';
    return `YouTube: ${e.message || reason || status}`;
  } catch {
    return `YouTube upload failed (${status})`;
  }
}
