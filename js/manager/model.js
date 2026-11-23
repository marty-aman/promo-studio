// Band manager data: the band, songs (lyrics, shoot plan, release checklist), shows, venues, scene
// bands, contacts, posts (with their stats) and money. Kept in this browser (localStorage) and
// backed up as a JSON file. Pure functions so they can be unit tested.

import { newFiles } from './files.js';
import { normalizeSong, idList } from './songnorm.js';
import { normalizeShow } from './showsnorm.js';
import { normalizePhotos, normalizeFolders } from './photos.js';
import { normalizeTours } from './tours.js';
import { newStats, normalizeStats } from './stats.js';
import { normalizeReleases } from './releases.js';
import { normalizeCovers } from './covers.js';
import { releaseTaskDone, showTaskDone } from './todoauto.js';
import { normalizeLinkInBio } from './linkbio-norm.js';

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
  [-28, 'content', 'First teaser: a studio or behind-the-scenes clip'],
  [-21, 'promo', 'Pre-save link live and in bio'],
  [-21, 'press', 'Pitch blogs, local radio and playlist curators'],
  [-21, 'content', 'Film 20–30 short clips in one session'],
  [-14, 'content', 'Announce the date and reveal the cover'],
  [-14, 'promo', 'Pre-save push: share the pre-save link with a clip'],
  [-14, 'press', 'Follow up with the blogs, radio and curators that haven’t replied'],
  [-10, 'video', 'Music video edit locked'],
  [-7, 'press', 'Add the song to your press kit (EPK)'],
  [-7, 'content', 'Teaser with the hook'],
  [-7, 'video', 'Set up the music video premiere (date announced, YouTube Premiere set)'],
  [-3, 'content', 'Countdown post'],
  [-1, 'content', '“Out tomorrow” post, schedule release-day posts'],
  [0, 'content', 'Release day: post, stories, ask for shares, update link in bio'],
  [0, 'video', 'Premiere the music video'],
  [1, 'content', 'Thank fans, share reactions'],
  [3, 'press', 'Send the live link to playlist curators'],
  [5, 'content', 'Post a behind-the-scenes clip from the shoot or studio'],
  [7, 'insights', 'Check first-week numbers; re-post the best clip'],
  [10, 'press', 'Thank the blogs, radio and curators who shared the song'],
  [14, 'content', 'Lyric video, acoustic or live version'],
  [14, 'distro', 'Second playlist pitch round with the first-week numbers'],
  [21, 'content', 'Repost fan covers, duets and reactions'],
  [28, 'insights', 'Review which content worked (Content page)'],
  [30, 'insights', 'Release recap: numbers, best post, what to change next time'],
];
/** The rollout steps added after the first 22 (songs made before keep their list; the Release tab offers to add these). */
export const ROLLOUT_ADDED = RELEASE_TEMPLATE.filter(([, , text]) => /^(First teaser|Pre-save push|Follow up with the blogs|Set up the music video premiere|Post a behind-the-scenes|Thank the blogs|Second playlist pitch|Repost fan covers|Release recap)/.test(text));
/**
 * A song marked Released keeps its after-release tasks in Overdue only while they are fresh (due in the last
 * LATE_WINDOW days); older untouched ones are shown as missed on its Rollout view, not as noise on Home.
 */
export const LATE_WINDOW = 7;
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
    lyricTiming: null, // timed lyric lines saved from the Video Studio (see lyrictiming.js)
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
  return { id: mid('show'), date, doors: '', setTime: '', loadIn: '', venueId: null, venue: '', city: 'Seattle', billing: 'support', lineup: [], status: 'idea', tickets: '', price: '', deal: '', contact: '', setlist: '', notes: '', posterId: null, todo: [], pitchedOn: '', followedUp: false, settlement: { gross: '', pay: '', merch: '', costs: '', fund: '', shares: {} } };
}

// ---- your own calendar events (rehearsals, meetings, travel…)
export const EVENT_KINDS = [['rehearsal', 'Rehearsal'], ['meeting', 'Meeting'], ['travel', 'Travel'], ['personal', 'Personal'], ['other', 'Other']];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** A new event. `repeat` is '' or 'weekly' (then `until`, a last date, or '' for no end). */
export const newEvent = (date = '') => ({ id: mid('ev'), title: '', date, start: '', end: '', allDay: true, location: '', note: '', kind: 'rehearsal', repeat: '', until: '' });
/** Events from a save, checked: bad dates and times dropped, unknown kinds become Other. */
export function normalizeEvents(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e && typeof e === 'object' && typeof e.id === 'string' && parseDate(e.date))
    .map((e) => {
      const d = newEvent(e.date);
      const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
      const start = HHMM.test(e.start) ? e.start : '';
      return { ...d, id: e.id, title: str(e.title, 200), start, end: start && HHMM.test(e.end) ? e.end : '', allDay: !start || e.allDay === true, location: str(e.location, 200), note: str(e.note, 2000), kind: EVENT_KINDS.some(([k]) => k === e.kind) ? e.kind : 'other', repeat: e.repeat === 'weekly' ? 'weekly' : '', until: e.repeat === 'weekly' && parseDate(e.until) && e.until >= e.date ? e.until : '' };
    });
}
/** The dates an event falls on in [from, to): one, or every week for a weekly one. */
export function eventDates(ev, from, to) {
  if (!ev.repeat) return ev.date >= from && ev.date < to ? [ev.date] : [];
  const out = [];
  // jump straight to the first week in range, so an old weekly event isn't walked from its start
  const skip = Math.max(0, Math.floor((daysBetween(ev.date, from) || 0) / 7));
  for (let d = addDays(ev.date, skip * 7); d < to && (!ev.until || d <= ev.until) && out.length < 400; d = addDays(d, 7)) if (d >= from) out.push(d);
  return out;
}
/** "19:00–21:00", "from 19:00", or '' for all day. */
export const eventTime = (ev) => (ev.allDay || !ev.start ? '' : ev.end ? `${ev.start}–${ev.end}` : `from ${ev.start}`);

/** The list keys added by the scaffold: arrays of plain objects with a string id. Builds own the item shapes. */
const NEW_LISTS = ['outreach', 'merch', 'fans', 'captionBank', 'availability', 'opportunities'];

export function newManager() {
  return {
    version: MANAGER_VERSION,
    band: { name: 'Arc Flash', city: 'Seattle', genres: 'alt-metal, emocore', bio: '', links: {} },
    songs: [],
    covers: [], // cover songs played live: { id, title, artist, length, key, notes } (see covers.js)
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
    events: [], // your own calendar events: { id, title, date, start, end, allDay, location, note, kind, repeat, until }
    playlists: [], // your own playlists and curators (shared by every artist)
    playlistsOff: [], // built-in playlist ids you hid
    outreach: [], // pitches and contacts to chase (G1); item shapes belong to the build that owns the key
    merch: [], // merch items and stock (G4)
    fans: [], // this artist's fan list (G5); the one key a backup can leave out (workspaceBackup withoutFans)
    captionBank: [], // saved captions (G5)
    availability: [], // member availability polls (G3)
    opportunities: [], // grants, festivals and contests, shared by every artist (G5)
    seeded: {},
  };
}

/** Fill in anything an older or hand-edited save is missing. */
export function normalizeManager(raw) {
  const base = newManager();
  if (!raw || typeof raw !== 'object') return base;
  const list = idList;
  const m = { ...base, ...raw, band: { ...base.band, ...(raw.band || {}) } };
  for (const k of ['songs', 'shows', 'venues', 'bands', 'contacts', 'posts', 'money']) m[k] = list(raw[k]);
  m.songs = m.songs.map((s) => normalizeSong(s, newSong(s.title)));
  m.photos = normalizePhotos(raw.photos);
  m.photoFolders = normalizeFolders(raw.photoFolders);
  for (const p of m.photos) if (p.folder && !m.photoFolders.some((f) => f.id === p.folder)) p.folder = '';
  m.tours = normalizeTours(raw.tours);
  m.stats = normalizeStats(raw.stats);
  m.releases = normalizeReleases(raw.releases);
  for (const s of m.songs) if (s.releaseId && !m.releases.some((r) => r.id === s.releaseId)) (s.releaseId = ''), (s.track = 0);
  // the profile photo's framing (artists.js photoPos checks the numbers); absent means centred at 1x
  if (m.band.photoPos !== undefined && (!m.band.photoPos || typeof m.band.photoPos !== 'object' || Array.isArray(m.band.photoPos))) delete m.band.photoPos;
  m.band.epkPhotos = Array.isArray(m.band.epkPhotos) ? m.band.epkPhotos.filter((x) => typeof x === 'string').slice(0, 4) : [];
  if (m.band.linkInBio !== undefined) m.band.linkInBio = normalizeLinkInBio(m.band.linkInBio); // the Link page (linkbio.js); absent until first used
  m.playlists = list(raw.playlists);
  m.playlistsOff = Array.isArray(raw.playlistsOff) ? raw.playlistsOff.filter((x) => typeof x === 'string') : [];
  m.shows = m.shows.map((s) => normalizeShow(s, newShow()));
  m.covers = normalizeCovers(raw.covers);
  m.events = normalizeEvents(raw.events);
  for (const k of NEW_LISTS) m[k] = list(raw[k]); // unknown fields on each item are kept
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
 * Agenda sources: how a feature adds its own dated items without editing agenda().
 * registerAgendaSource((m, from, to, inRange) => items) where `to` is the first day NOT in range,
 * `inRange(d)` says whether a date is in [from, to), and each item is the same shape agenda() makes:
 * { date, kind: 'task', key, title, sub, ref: { page, id, tab? } }. Use kind 'task' (an unknown kind
 * is shown as a task) and a distinct `key`.
 * RULE: a source must skip released and cancelled things (a released song, a cancelled show, a
 * declined or finished outreach) so they never show as late or upcoming.
 * overdueTasks() runs the same sources with from = '' and to = today, and keeps items dated before
 * today; it returns each as { task: { id: key, text: title }, due: date, source: item }.
 * A source that throws is skipped, never breaks the agenda.
 */
export const AGENDA_SOURCES = [];
export function registerAgendaSource(fn) {
  if (typeof fn === 'function' && !AGENDA_SOURCES.includes(fn)) AGENDA_SOURCES.push(fn);
  return fn;
}
function safeSource(fn, m, from, to, inRange) {
  try {
    const r = fn(m, from, to, inRange);
    return Array.isArray(r) ? r.filter((it) => it && typeof it.date === 'string' && it.date) : [];
  } catch {
    return [];
  }
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
        if (!showTaskDone(s, t) && t.offset !== 0 && inRange(due)) out.push({ date: due, kind: 'task', key: t.id, title: t.text, sub: `Show: ${s.venue || 'venue TBD'}`, ref: { page: 'shows', id: s.id } });
      }
    }
    const fu = showFollowUp(s);
    if (fu && inRange(fu)) out.push({ date: fu, kind: 'task', key: 'followup', title: `Follow up with ${s.venue || 'the venue'}`, sub: 'Show pitched a week ago', ref: { page: 'shows', id: s.id } });
    if (inRange(s.date) && s.status !== 'cancelled') out.push({ date: s.date, kind: 'show', title: s.venue || 'Show', sub: [s.status === 'confirmed' ? 'Confirmed' : SHOW_STATUSES.find(([k]) => k === s.status)?.[1], s.setTime && `set ${s.setTime}`].filter(Boolean).join(' · '), ref: { page: 'shows', id: s.id } });
  }
  for (const song of m.songs) {
    if (inRange(song.releaseDate)) out.push({ date: song.releaseDate, kind: 'release', title: `“${song.title}” comes out`, sub: 'Release day', ref: { page: 'songs', id: song.id, tab: 'release' } });
    if (inRange(song.shoot.date)) out.push({ date: song.shoot.date, kind: 'shoot', title: `Shoot: “${song.title}”`, sub: song.shoot.callTime ? `call ${song.shoot.callTime}` : 'Video shoot', ref: { page: 'songs', id: song.id, tab: 'shoot' } });
    for (const t of song.release) {
      if (isPreReleaseMoot(song, t)) continue;
      const due = taskDue(song, t);
      if (!releaseTaskDone(song, t, m) && inRange(due)) out.push({ date: due, kind: 'task', key: t.id, title: t.text, sub: `“${song.title}” · ${TASK_CATS[t.cat] || 'Task'}`, ref: { page: 'songs', id: song.id, tab: 'release' } });
    }
    for (const p of song.pitches || []) {
      if (p.status === 'sent' && !p.followedUp && inRange(p.followUp)) out.push({ date: p.followUp, kind: 'task', key: p.id, title: `Follow up: ${p.curator || p.playlist || 'curator'}`, sub: `“${song.title}” · Pitch${p.playlist ? ` to ${p.playlist}` : ''}`, ref: { page: 'songs', id: song.id, tab: 'pitch' } });
    }
  }
  for (const p of m.posts) {
    const song = m.songs.find((s) => s.id === p.songId);
    if (inRange(p.date) && p.status !== 'posted') out.push({ date: p.date, kind: 'post', title: p.title || 'Post', sub: [p.platform, song && `“${song.title}”`].filter(Boolean).join(' · '), ref: { page: 'content', id: p.id } });
  }
  for (const ev of m.events || []) {
    for (const date of eventDates(ev, from, to)) out.push({ date, kind: 'event', evKind: ev.kind, key: ev.id, title: ev.title || 'Event', sub: [EVENT_KINDS.find(([k]) => k === ev.kind)?.[1], eventTime(ev), ev.location].filter(Boolean).join(' · '), time: ev.allDay ? '' : ev.start, ref: { page: 'calendar', id: ev.id } });
  }
  for (const fn of AGENDA_SOURCES) out.push(...safeSource(fn, m, from, to, inRange));
  const order = { show: 0, release: 1, shoot: 2, event: 3, post: 4, task: 5 };
  const rank = (k) => (k in order ? order[k] : order.task);
  return out.sort((a, b) => a.date.localeCompare(b.date) || rank(a.kind) - rank(b.kind));
}

/** When to chase a venue you pitched a show to: a week after pitching, while it's still Pitched. '' when not. */
export const showFollowUp = (s) => (s.status === 'pitched' && s.pitchedOn && !s.followedUp ? addDays(s.pitchedOn, 7) : '');

/** Set a show's status, noting the day it was pitched (for the follow-up a week later). */
export function setShowStatus(s, status, today) {
  if (status === 'pitched' && s.status !== 'pitched') (s.pitchedOn = today), (s.followedUp = false);
  s.status = status;
}

/** A release-day-or-earlier task on a song marked Released (nothing to chase any more). */
export const isPreReleaseMoot = (song, t) => song.status === 'released' && !t.date && (t.offset || 0) <= 0;

/** Tick every task due on or before release day ("Mark everything before release day done"). Returns how many changed. */
export function markPreReleaseDone(song) {
  let n = 0;
  for (const t of song.release) {
    if (!t.done && !t.date && (t.offset || 0) <= 0) (t.done = true), n++;
  }
  return n;
}

/**
 * Delete a song. Posts not yet posted go with it; posted ones (and their stats, which feed
 * "What works best") stay, with the song's title kept on them.
 */
export function deleteSong(d, songId) {
  const song = d.songs.find((s) => s.id === songId);
  d.songs = d.songs.filter((s) => s.id !== songId);
  d.posts = d.posts
    .filter((p) => p.songId !== songId || p.status === 'posted')
    .map((p) => (p.songId === songId ? { ...p, songId: '', songTitle: (song && song.title) || p.songTitle || '' } : p));
}

/** Release tasks that are past due and not done, oldest first. */
export function overdueTasks(m, today) {
  const out = [];
  for (const song of m.songs) {
    if (song.status === 'released' && daysBetween(song.releaseDate, today) > 60) continue;
    for (const t of song.release) {
      // a song that's out no longer needs its run-up: only the after-release tasks can be late
      if (isPreReleaseMoot(song, t)) continue;
      const due = taskDue(song, t);
      // out already: an untouched after-release step stops being "late" a week on (it is missed, see the Rollout view)
      if (song.status === 'released' && !t.date && daysBetween(due, today) > LATE_WINDOW) continue;
      if (!releaseTaskDone(song, t, m) && due && due < today) out.push({ song, task: t, due });
    }
    for (const p of song.pitches || []) {
      if (p.status === 'sent' && !p.followedUp && p.followUp && p.followUp < today) out.push({ song, pitch: p, task: { id: p.id, text: `Follow up with ${p.curator || p.playlist || 'the curator'}` }, due: p.followUp });
    }
  }
  for (const show of m.shows) {
    const fu = showFollowUp(show);
    if (fu && fu < today) out.push({ show, song: null, followup: true, task: { id: `${show.id}-followup`, text: `Follow up with ${show.venue || 'the venue'} about the show` }, due: fu });
    if (show.status === 'cancelled' || !show.date || daysBetween(show.date, today) > 14) continue;
    for (const t of show.todo || []) {
      const due = addDays(show.date, t.offset || 0);
      if (!showTaskDone(show, t) && due < today) out.push({ show, song: null, task: t, due });
    }
  }
  const inLate = (d) => !!d && d < today;
  for (const fn of AGENDA_SOURCES) for (const it of safeSource(fn, m, '', today, inLate)) if (it.date < today) out.push({ show: null, song: null, source: it, task: { id: it.key || it.title, text: it.title }, due: it.date });
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

/**
 * How far along a song's release checklist is: { done, total }, counting tasks that ticked themselves
 * (todoauto.js). Pass the artist's data `m` so a cover or UPC on the song's EP or album counts too.
 */
export const releaseProgress = (song, m = null) => ({ done: song.release.filter((t) => releaseTaskDone(song, t, m)).length, total: song.release.length });

/** The next release (today or later), and the next show. */
export function nextUp(m, today) {
  const release = m.songs.filter((s) => s.releaseDate && s.releaseDate >= today).sort((a, b) => a.releaseDate.localeCompare(b.releaseDate))[0] || null;
  const show = m.shows.filter((s) => s.date && s.date >= today && s.status !== 'cancelled').sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  return { release, show };
}
