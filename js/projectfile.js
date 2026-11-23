// A Video Studio project as a file you can keep, send or move to another computer, and the list of
// earlier projects the app keeps when an edit is replaced. Pure functions: no browser APIs here.
import { normalizeProject } from './state.js';
import { referencedIds } from './mediamatch.js';

export const PROJECT_FILE_KIND = 'promo-studio-video-project';
export const PROJECT_FILE_VERSION = 1;

/**
 * The text of a project file: the whole edit, plus what each media file in it was called (id -> [name, path, kind]),
 * so another browser can ask for the right files with Replace missing files. The media themselves stay out (they
 * can be gigabytes); the file holds the edit.
 */
export function makeProjectFile(project, names = {}, now = new Date()) {
  const ids = referencedIds(project);
  const used = {};
  for (const id of ids) if (names[id]) used[id] = names[id];
  return JSON.stringify({ kind: PROJECT_FILE_KIND, version: PROJECT_FILE_VERSION, savedAt: now.toISOString(), mediaNames: used, project }, null, 1);
}

/** A file name for a project: "my-promo.promo.json". */
export function projectFileName(project) {
  const slug = String(project.name || 'promo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'promo';
  return `${slug}.promo.json`;
}

/** Read a project file. Returns { project, names, savedAt }; throws an Error with a sentence for the user. */
export function parseProjectFile(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t a Video Studio project file.');
  }
  if (!raw || typeof raw !== 'object' || raw.kind !== PROJECT_FILE_KIND || !raw.project || typeof raw.project !== 'object') throw new Error('That file isn’t a Video Studio project file.');
  if (raw.version > PROJECT_FILE_VERSION) throw new Error('That project file was saved by a newer version of the app. Update the app and open it again.');
  const p = raw.project;
  for (const k of ['clips', 'lyrics', 'texts', 'audioTracks']) if (p[k] != null && !Array.isArray(p[k])) throw new Error(`That project file is damaged (${k} is not a list).`);
  const project = normalizeProject(JSON.parse(JSON.stringify(p)));
  const names = raw.mediaNames && typeof raw.mediaNames === 'object' && !Array.isArray(raw.mediaNames) ? raw.mediaNames : {};
  return { project, names, savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : '' };
}

/** What is in a project, in a few words: "3 clips · 12 lyric lines · song". */
export function describeProject(p) {
  const n = (k, one, many) => (k ? `${k} ${k === 1 ? one : many}` : '');
  return [n((p.clips || []).length, 'clip', 'clips'), n((p.lyrics || []).length, 'lyric line', 'lyric lines'), n((p.texts || []).length, 'text', 'texts'), p.song ? 'song' : '', n((p.layers || []).length, 'layer', 'layers')].filter(Boolean).join(' · ') || 'empty';
}

/** Is this project worth keeping a copy of (not a blank new one)? */
export function hasContent(p) {
  return !!((p.clips || []).length || (p.lyrics || []).length || (p.texts || []).length || p.song || (p.audioTracks || []).length || (p.layers || []).length);
}

/**
 * Put `project` at the front of the earlier-projects list. The same edit twice moves up instead of repeating;
 * blank projects are not kept. Returns a new list of at most `cap` entries, newest first.
 */
export function pushRecent(list, project, now = Date.now(), cap = 5) {
  if (!hasContent(project)) return list.slice(0, cap);
  const key = JSON.stringify(project);
  const rest = list.filter((r) => JSON.stringify(r.project) !== key);
  return [{ id: `r${now.toString(36)}${rest.length}`, at: now, name: project.name || 'Untitled', project }, ...rest].slice(0, cap);
}
