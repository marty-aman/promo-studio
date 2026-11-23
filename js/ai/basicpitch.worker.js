// Runs Basic Pitch off the page's thread (see basicpitch.js). One job per worker: the page terminates it to cancel.
import { detectNotes } from './basicpitch.js';

self.onmessage = async (e) => {
  const { samples, opts } = e.data || {};
  try {
    const r = await detectNotes(samples, { ...(opts || {}), onProgress: (p) => self.postMessage({ type: 'progress', p }) });
    self.postMessage({ type: 'done', notes: r.notes, backend: r.backend });
  } catch (err) {
    self.postMessage({ type: 'error', message: (err && err.message) || String(err) });
  }
};
