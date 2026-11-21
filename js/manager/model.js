// Band manager data: the band, songs (lyrics, shoot plan, release checklist), shows, venues, scene
// bands, contacts, posts (with their stats) and money. Kept in this browser (localStorage) and
// backed up as a JSON file. Pure functions so they can be unit tested.

import { newFiles, normalizeFiles, VIDEO_STATUSES } from './files.js';
import { normalizePhotos, normalizeFolders } from './photos.js';
import { normalizeTours } from './tours.js';
import { newStats, normalizeStats } from './stats.js';
import { normalizeReleases, normalizeSections } from './releases.js';

export const MANAGER_KEY = 'pvm.manager.v1';
export const MANAGER_VERSION = 1;

let n = 0;
export const mid = (p = 'm') => `${p}_${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---- dates are plain local 'YYYY-MM-DD' strings (no time zone surprises)
const pad = (v) => String(v).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDate = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
export const addDays = (s, k) => {
  const d = parseDate(s);
  if (!d) return '';
  d.setDate(d.getDate() + k);
  return isoDate(d);
};
export const daysBetween = (a, b) => {
  const x = parseDate(a);
  const y = parseDate(b);
  return x && y ? Math.round((y - x) / 86400000) : null;
};
export const todayISO = () => isoDate(new Date());
export function niceDate(s, { weekday = true } = {}) {
  const d = parseDate(s);
  if (!d) return '';
  return d.toLocaleDateString(undefined, { weekday: weekday ? 'short' : undefined, month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}

export const SONG_STATUSES = [
  ['writing', 'Writing'],
  ['demo', 'Demo'],
  ['recording', 'Recording'],
  ['mixing', 'Mixing / mastering'],
  ['ready', 'Ready to release'],
  ['released', 'Released'],
];
export const SHOW_STATUSES = [
  ['idea', 'Idea'],
  ['pitched', 'Pitched'],
  ['hold', 'On hold'],
  ['confirmed', 'Confirmed'],
  ['played', 'Played'],
  ['cancelled', 'Cancelled'],
];

/**
 * The release checklist, counted back from release day (offset in days). Lead times follow
 * common distributor and Spotify for Artists guidance: upload 4+ weeks ahead, pitch editorial
 * at least 7 days ahead (earlier is better).
 */
export const RELEASE_TEMPLATE = [
  [-56, 'music', 'Final mix and master approved'],
  [-49, 'art', 'Cover art final (3000 × 3000 px)'],
  [-42, 'admin', 'Register the song with your PRO (BMI/ASCAP) and note the ISRC'],
  [-35, 'distro', 'Upload to your distributor with the release date'],
  [-30, 'distro', 'Pitch the song to Spotify editorial in Spotify for Artists'],
  [-28, 'video', 'Plan the music video and short-form shoot (Shoot tab)'],
  [-21, 'promo', 'Pre-save link live and in bio'],
  [-21, 'press', 'Pitch blogs, local radio and playlist curators'],
  [-21, 'content', 'Film 20–30 short clips in one session'],
  [-14, 'content', 'Announce the date and reveal the cover'],
  [-10, 'video', 'Music video edit locked'],
  [-7, 'press', 'Add the song to your press kit (EPK)'],
  [-7, 'content', 'Teaser with the hook'],
  [-3, 'content', 'Countdown post'],
  [-1, 'content', '“Out tomorrow” post, schedule release-day posts'],
  [0, 'content', 'Release day: post, stories, ask for shares, update link in bio'],
  [0, 'video', 'Premiere the music video'],
  [1, 'content', 'Thank fans, share reactions'],
  [3, 'press', 'Send the live link to playlist curators'],
  [7, 'insights', 'Check first-week numbers; re-post the best clip'],
  [14, 'content', 'Lyric video, acoustic or live version'],
  [28, 'insights', 'Review which content worked (Content page)'],
];
export const TASK_CATS = { music: 'Music', art: 'Art', admin: 'Admin', distro: 'Distribution', video: 'Video', promo: 'Promo', press: 'Press', content: 'Content', insights: 'Insights', other: 'Other' };

export const releaseChecklist = () => RELEASE_TEMPLATE.map(([offset, cat, text]) => ({ id: mid('task'), offset, cat, text, done: false }));
/** A release task's due date: release day + offset, or its own fixed date. */
export const taskDue = (song, t) => t.date || (song.releaseDate ? addDays(song.releaseDate, t.offset || 0) : '');

export function newSong(title = 'New song') {
  return {
    id: mid('song'),
    title,
    status: 'writing',
    releaseDate: '',
    lyrics: '',
    notes: '',
    bpm: '',
    instrumental: false, // no vocals: no lyrics needed, and pitches and the press release say so
    videoStatus: '', // the music video: '' (none yet), idea, planned, shot, editing, done, released
    length: '', // "3:45"; blank uses the song file's length
    key: '',
    audioId: null, // a song file in the video studio's media library
    coverId: null, // cover art (an image in the media library); blank uses the EP's or album's
    releaseId: '', // the EP or album it's on ('' = a single)
    track: 0, // its track number there
    sections: [], // intro, verse, chorus… { id, label, start, end } in seconds of the song
    sound: { genres: '', moods: [], energy: '', vocals: '', similar: '' }, // blank genres and similar fall back to the band's
    press: { headline: '', story: '', quote: '', quoteBy: '', credits: '', label: '', edits: {} },
    files: newFiles(), // stems, the music video and raw footage (references into the media library)
    pitches: [], // playlist pitches sent: { id, curator, playlist, service, contact, sent, status, followUp, ... }
    isrc: '',
    upc: '', // the barcode of its release, for finding it when there's no ISRC
    links: { spotify: '', apple: '', youtube: '', youtubeMusic: '', deezer: '', tidal: '', amazon: '', soundcloud: '', bandcamp: '' },
    shoot: { concept: '', date: '', callTime: '', locations: [], crew: [], shots: [], wardrobe: '', props: '', budget: '', notes: '' },
    release: releaseChecklist(),
  };
}

export function newShow(date = '') {
  return { id: mid('show'), date, doors: '', setTime: '', loadIn: '', venueId: null, venue: '', city: 'Seattle', billing: 'support', lineup: [], status: 'idea', tickets: '', price: '', deal: '', contact: '', setlist: '', notes: '', todo: [], settlement: { gross: '', pay: '', merch: '', costs: '' } };
}

export function newManager() {
  return {
    version: MANAGER_VERSION,
    band: { name: 'Arc Flash', city: 'Seattle', genres: 'alt-metal, emocore', bio: '', links: {} },
    songs: [],
    shows: [],
    venues: [],
    bands: [],
    contacts: [],
    posts: [],
    money: [],
    releases: [], // EPs and albums: { id, type, title, releaseDate, coverId, label, upc, notes }
    stats: newStats(), // streaming numbers: imported reports and live lookups (see stats.js)
    tours: [], // this artist's tours: { id, name, stops: [{ city, date, status, picks, money… }] } (see tours.js)
    photoFolders: [], // folders on the Photos page: { id, name, parent } (see photos.js)
    photos: [], // this artist's photos: { id, mediaId, caption, credit, tags, favorite, addedAt }
    playlists: [], // your own playlists and curators (shared by every artist)
    playlistsOff: [], // built-in playlist ids you hid
    seeded: {},
  };
}

/** Fill in anything an older or hand-edited save is missing. */
export function normalizeManager(raw) {
  const base = newManager();
  if (!raw || typeof raw !== 'object') return base;
  const list = (x) => (Array.isArray(x) ? x.filter((y) => y && typeof y === 'object' && typeof y.id === 'string') : []);
  const m = { ...base, ...raw, band: { ...base.band, ...(raw.band || {}) } };
  for (const k of ['songs', 'shows', 'venues', 'bands', 'contacts', 'posts', 'money']) m[k] = list(raw[k]);
  m.songs = m.songs.map((s) => {
    const d = newSong(s.title);
    return { ...d, ...s, instrumental: s.instrumental === true, videoStatus: VIDEO_STATUSES.some(([k]) => k === s.videoStatus) ? s.videoStatus : '', sections: normalizeSections(s.sections), coverId: typeof s.coverId === 'string' ? s.coverId : null, releaseId: typeof s.releaseId === 'string' ? s.releaseId : '', track: +s.track || 0, sound: { ...d.sound, ...(s.sound || {}), moods: Array.isArray(s.sound?.moods) ? s.sound.moods : [] }, press: { ...d.press, ...(s.press || {}), edits: { ...(s.press?.edits || {}) } }, pitches: list(s.pitches), files: normalizeFiles(s.files), links: { ...d.links, ...(s.links || {}) }, shoot: { ...d.shoot, ...(s.shoot || {}) }, release: Array.isArray(s.release) ? s.release : d.release };
  });
  m.photos = normalizePhotos(raw.photos);
  m.photoFolders = normalizeFolders(raw.photoFolders);
  for (const p of m.photos) if (p.folder && !m.photoFolders.some((f) => f.id === p.folder)) p.folder = '';
  m.tours = normalizeTours(raw.tours);
  m.stats = normalizeStats(raw.stats);
  m.releases = normalizeReleases(raw.releases);
  for (const s of m.songs) if (s.releaseId && !m.releases.some((r) => r.id === s.releaseId)) (s.releaseId = ''), (s.track = 0);
  m.band.epkPhotos = Array.isArray(m.band.epkPhotos) ? m.band.epkPhotos.filter((x) => typeof x === 'string').slice(0, 4) : [];
  m.playlists = list(raw.playlists);
  m.playlistsOff = Array.isArray(raw.playlistsOff) ? raw.playlistsOff.filter((x) => typeof x === 'string') : [];
  m.shows = m.shows.map((s) => ({ ...newShow(), ...s, settlement: { ...newShow().settlement, ...(s.settlement || {}) } }));
  m.seeded = raw.seeded && typeof raw.seeded === 'object' ? raw.seeded : {};
  return m;
}

export function loadManager() {
  try {
    return normalizeManager(JSON.parse(localStorage.getItem(MANAGER_KEY)));
  } catch {
    return newManager();
  }
}
export function saveManager(m) {
  try {
    localStorage.setItem(MANAGER_KEY, JSON.stringify(m));
    return true;
  } catch {
    return false;
  }
}

/** The backup file's text, and reading one back (checked, since it may come from anywhere). */
export const backupFile = (m) => JSON.stringify({ promoStudioManager: MANAGER_VERSION, savedAt: new Date().toISOString(), ...m }, null, 1);
export function parseBackup(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t a band manager backup.');
  }
  if (!raw || typeof raw !== 'object' || !raw.promoStudioManager) throw new Error('That file isn’t a band manager backup.');
  delete raw.promoStudioManager;
  delete raw.savedAt;
  return normalizeManager(raw);
}

/**
 * Everything dated in [from, from + days): shows, release days, release tasks, shoot days and
 * planned posts, sorted by date. Each: { date, kind, title, sub, ref: { page, id, tab? }, done? }.
 */
export function agenda(m, from, days = 14) {
  const to = addDays(from, days);
  const inRange = (d) => d && d >= from && d < to;
  const out = [];
  for (const s of m.shows) {
    if (s.status !== 'cancelled' && s.date) {
      for (const t of s.todo || []) {
        const due = addDays(s.date, t.offset || 0);
        if (!t.done && t.offset !== 0 && inRange(due)) out.push({ date: due, kind: 'task', title: t.text, sub: `Show: ${s.venue || 'venue TBD'}`, ref: { page: 'shows', id: s.id } });
      }
    }
    if (inRange(s.date) && s.status !== 'cancelled') out.push({ date: s.date, kind: 'show', title: s.venue || 'Show', sub: [s.status === 'confirmed' ? 'Confirmed' : SHOW_STATUSES.find(([k]) => k === s.status)?.[1], s.setTime && `set ${s.setTime}`].filter(Boolean).join(' · '), ref: { page: 'shows', id: s.id } });
  }
  for (const song of m.songs) {
    if (inRange(song.releaseDate)) out.push({ date: song.releaseDate, kind: 'release', title: `“${song.title}” comes out`, sub: 'Release day', ref: { page: 'songs', id: song.id, tab: 'release' } });
    if (inRange(song.shoot.date)) out.push({ date: song.shoot.date, kind: 'shoot', title: `Shoot: “${song.title}”`, sub: song.shoot.callTime ? `call ${song.shoot.callTime}` : 'Video shoot', ref: { page: 'songs', id: song.id, tab: 'shoot' } });
    for (const t of song.release) {
      const due = taskDue(song, t);
      if (!t.done && inRange(due)) out.push({ date: due, kind: 'task', title: t.text, sub: `“${song.title}” · ${TASK_CATS[t.cat] || 'Task'}`, ref: { page: 'songs', id: song.id, tab: 'release' } });
    }
    for (const p of song.pitches || []) {
      if (p.status === 'sent' && !p.followedUp && inRange(p.followUp)) out.push({ date: p.followUp, kind: 'task', title: `Follow up: ${p.curator || p.playlist || 'curator'}`, sub: `“${song.title}” · Pitch${p.playlist ? ` to ${p.playlist}` : ''}`, ref: { page: 'songs', id: song.id, tab: 'pitch' } });
    }
  }
  for (const p of m.posts) {
    const song = m.songs.find((s) => s.id === p.songId);
    if (inRange(p.date) && p.status !== 'posted') out.push({ date: p.date, kind: 'post', title: p.title || 'Post', sub: [p.platform, song && `“${song.title}”`].filter(Boolean).join(' · '), ref: { page: 'content', id: p.id } });
  }
  const order = { show: 0, release: 1, shoot: 2, post: 3, task: 4 };
  return out.sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind]);
}

/** Release tasks that are past due and not done, oldest first. */
export function overdueTasks(m, today) {
  const out = [];
  for (const song of m.songs) {
    if (song.status === 'released' && daysBetween(song.releaseDate, today) > 60) continue;
    for (const t of song.release) {
      const due = taskDue(song, t);
      if (!t.done && due && due < today) out.push({ song, task: t, due });
    }
    for (const p of song.pitches || []) {
      if (p.status === 'sent' && !p.followedUp && p.followUp && p.followUp < today) out.push({ song, pitch: p, task: { id: p.id, text: `Follow up with ${p.curator || p.playlist || 'the curator'}` }, due: p.followUp });
    }
  }
  for (const show of m.shows) {
    if (show.status === 'cancelled' || !show.date || daysBetween(show.date, today) > 14) continue;
    for (const t of show.todo || []) {
      const due = addDays(show.date, t.offset || 0);
      if (!t.done && due < today) out.push({ show, song: null, task: t, due });
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

/** How far along a song's release checklist is: { done, total }. */
export const releaseProgress = (song) => ({ done: song.release.filter((t) => t.done).length, total: song.release.length });

/** The next release (today or later), and the next show. */
export function nextUp(m, today) {
  const release = m.songs.filter((s) => s.releaseDate && s.releaseDate >= today).sort((a, b) => a.releaseDate.localeCompare(b.releaseDate))[0] || null;
  const show = m.shows.filter((s) => s.date && s.date >= today && s.status !== 'cancelled').sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  return { release, show };
}
