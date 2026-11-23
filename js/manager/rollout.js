// Release rollout: the song's release checklist laid out by week around release day, and an EP or album
// level rollout (one plan per release date) whose steps go on the Calendar and Home through an agenda source.
// The song steps are the release checklist itself (model.js RELEASE_TEMPLATE); nothing here is a second list.
// Pure functions, unit tested.
import { addDays, daysBetween, taskDue, isPreReleaseMoot, registerAgendaSource, todayISO, ROLLOUT_ADDED, LATE_WINDOW, mid } from './model.js';
import { releaseTaskState, taskStateFrom, setTaskDone, mediaHas } from './todoauto.js';
import { tracklist, releaseTypeLabel } from './releases.js';

// ---------------------------------------------------------------- weeks
/** Which week around release day an offset falls in: 0 = release day to 6 days after, -1 = the 7 days before… */
export const weekOf = (offset) => Math.floor((offset || 0) / 7);
export function weekLabel(w) {
  if (w === 0) return 'Release week';
  const n = Math.abs(w);
  return w < 0 ? `${n} week${n === 1 ? '' : 's'} before` : `${n} week${n === 1 ? '' : 's'} after`;
}

/**
 * Group rollout items into weeks: items are { offset, due, state } where state is done, late, missed, moot
 * (skipped: the song is out) or open. Returns [{ week, label, from, to, items, done, total, current }] in order;
 * `from`/`to` are dates (to = last day) when there is a release date. `current` marks the week holding today.
 */
export function byWeek(items, releaseDate, today) {
  const weeks = new Map();
  for (const it of items) {
    const w = weekOf(it.offset);
    if (!weeks.has(w)) weeks.set(w, []);
    weeks.get(w).push(it);
  }
  const nowWeek = releaseDate && today ? weekOf(daysBetween(releaseDate, today)) : null;
  return [...weeks]
    .sort((a, b) => a[0] - b[0])
    .map(([week, list]) => {
      const counted = list.filter((x) => x.state !== 'moot');
      return {
        week,
        label: weekLabel(week),
        from: releaseDate ? addDays(releaseDate, week * 7) : '',
        to: releaseDate ? addDays(releaseDate, week * 7 + 6) : '',
        items: list.sort((a, b) => a.offset - b.offset),
        done: counted.filter((x) => x.state === 'done').length,
        total: counted.length,
        current: nowWeek === week,
      };
    });
}

const summary = (items) => ({ done: items.filter((x) => x.state === 'done').length, total: items.filter((x) => x.state !== 'moot').length, late: items.filter((x) => x.state === 'late').length, missed: items.filter((x) => x.state === 'missed').length });

/** A step's state given whether it's done, its due date and whether the release is out. */
function stepState({ done, due, offset, out, ownDate = false }, today) {
  if (done) return 'done';
  if (out && !ownDate && offset <= 0) return 'moot';
  if (due && due < today) return out && !ownDate && daysBetween(due, today) > LATE_WINDOW ? 'missed' : 'late';
  return 'open';
}

// ---------------------------------------------------------------- a song's rollout (its release checklist)
/** The song's checklist as rollout items: { task, offset, due, state, auto }. */
export function songRolloutItems(song, m, today) {
  const out = song.status === 'released';
  return song.release.map((t) => {
    const due = taskDue(song, t);
    const offset = t.date && song.releaseDate ? daysBetween(song.releaseDate, t.date) : t.offset || 0;
    const st = releaseTaskState(song, t, m);
    const state = isPreReleaseMoot(song, t) && !st.done ? 'moot' : stepState({ done: st.done, due, offset, out, ownDate: !!t.date }, today);
    return { task: t, offset, due, state, auto: st };
  });
}
/** { weeks, done, total, late, missed } for the song's Rollout view. */
export function songRollout(song, m, today) {
  const items = songRolloutItems(song, m, today);
  return { weeks: byWeek(items, song.releaseDate, today), ...summary(items) };
}

/** The newer standard rollout steps a song made before them is missing: { add, past } (template rows). */
export function missingRolloutSteps(song, today) {
  const have = new Set(song.release.map((t) => t.text));
  const rows = ROLLOUT_ADDED.filter(([, , text]) => !have.has(text));
  const due = (offset) => (song.releaseDate ? addDays(song.releaseDate, offset) : '');
  return { add: rows.filter(([o]) => !due(o) || due(o) >= today), past: rows.filter(([o]) => due(o) && due(o) < today) };
}
/** Add the missing newer steps that are not already past (a past step would only show up as late). Returns { added, skipped }. */
export function addRolloutSteps(song, today) {
  const { add, past } = missingRolloutSteps(song, today);
  for (const [offset, cat, text] of add) song.release.push({ id: mid('task'), offset, cat, text, done: false });
  return { added: add.length, skipped: past.length };
}

// ---------------------------------------------------------------- an EP or album's rollout
const okUPC = (v) => /^\d{12,13}$/.test(String(v || '').replace(/[\s-]+/g, ''));
const has = (id) => mediaHas(id);

/** The release-level steps: [offset, cat, key, text, rule(release, tracks, m) → reason or '']. */
export const EP_ROLLOUT = [
  [-70, 'music', 'order', 'Lock the tracklist and the running order', null],
  [-63, 'promo', 'singles', 'Pick the focus track and the singles that come out first', (r, tracks) => {
    const s = tracks.find((x) => x.releaseDate && r.releaseDate && x.releaseDate < r.releaseDate);
    return s ? `“${s.title}” comes out before the release` : '';
  }],
  [-56, 'art', 'cover', 'Cover art final for the whole release', (r) => (has(r.coverId) ? 'the release cover is attached' : '')],
  [-42, 'admin', 'dates', 'Give every track its release date (singles first, the rest on release day)', (r, tracks) => (tracks.length && tracks.every((x) => x.releaseDate) ? 'every track has a release date' : '')],
  [-35, 'distro', 'upload', 'Upload the whole release to your distributor', (r) => (okUPC(r.upc) ? 'UPC entered (your distributor gives it on upload)' : '')],
  [-28, 'content', 'announce', 'Announce the title, cover and tracklist', null],
  [-21, 'promo', 'presave', 'Pre-save link for the full release live and in bio', null],
  [-14, 'press', 'press', 'Send the release to press with the focus track', null],
  [-7, 'content', 'series', 'Plan a track-by-track post series (one post per song)', (r, tracks, m) => {
    const posts = (m && m.posts) || [];
    return tracks.length && tracks.every((s) => posts.some((p) => p.songId === s.id)) ? 'every track has a post planned' : '';
  }],
  [-1, 'content', 'eve', '“Out tomorrow” post for the whole release', null],
  [0, 'content', 'day', 'Release day: share the full release, update the link in bio', null],
  [0, 'promo', 'party', 'Listening party or live stream', null],
  [7, 'insights', 'week1', 'First-week numbers: which track leads?', null],
  [14, 'content', 'push', 'Push the strongest track with a new clip', null],
  [30, 'insights', 'recap', 'Release recap: numbers, best post, lessons for the next one', null],
];

/** Release types that group songs get a release-level rollout (a single uses its song's checklist). */
export const groupsSongs = (r, m) => !!r && r.type !== 'single' && tracklist(m.songs, r.id).length > 0;

/** The saved ticks of a release's rollout, checked: { done: { key: true }, off: { key: true } }. */
export function normalizeRelRollout(x) {
  const keys = new Set(EP_ROLLOUT.map((s) => s[2]));
  const pick = (o) => Object.fromEntries(Object.entries(o && typeof o === 'object' && !Array.isArray(o) ? o : {}).filter(([k, v]) => keys.has(k) && v === true));
  return { done: pick(x && x.done), off: pick(x && x.off) };
}

/** A release step's { done, manual, auto, off }, like a song task's. */
export function relStepState(r, step, m) {
  const st = normalizeRelRollout(r.rollout);
  const [, , key, , rule] = step;
  const auto = rule ? rule(r, tracklist(m.songs, r.id), m) || '' : '';
  return taskStateFrom({ done: st.done[key] === true, autoOff: st.off[key] === true }, auto);
}
/** Tick or untick a release step (writes r.rollout), with the same automatic-tick rules as song tasks. */
export function setRelStep(r, key, v, auto) {
  const st = normalizeRelRollout(r.rollout);
  const t = { done: st.done[key] === true, autoOff: st.off[key] === true };
  setTaskDone(t, v, auto);
  if (t.done) st.done[key] = true;
  else delete st.done[key];
  if (t.autoOff) st.off[key] = true;
  else delete st.off[key];
  r.rollout = st;
}

/** Is the release out: it has tracks and every one is marked Released. */
export const releaseIsOut = (r, m) => {
  const tracks = tracklist(m.songs, r.id);
  return tracks.length > 0 && tracks.every((s) => s.status === 'released');
};

/** The release's steps as rollout items: { step, key, text, cat, offset, due, state, auto }. */
export function releaseRolloutItems(r, m, today) {
  const out = releaseIsOut(r, m);
  return EP_ROLLOUT.map((step) => {
    const [offset, cat, key, text] = step;
    const due = r.releaseDate ? addDays(r.releaseDate, offset) : '';
    const st = relStepState(r, step, m);
    return { step, key, text, cat, offset, due, state: stepState({ done: st.done, due, offset, out }, today), auto: st };
  });
}
export function releaseRollout(r, m, today) {
  const items = releaseRolloutItems(r, m, today);
  return { weeks: byWeek(items, r.releaseDate, today), ...summary(items) };
}

/**
 * The agenda source: open release-level steps for EPs and albums with a date. Skips a release that is out
 * (its run-up is moot, and an old after-release step is missed, not late), and steps already done.
 * In overdue mode (from = '') `to` is today; otherwise today is the real date.
 */
export function releaseAgendaItems(m, from, to, inRange) {
  const today = from === '' ? to : todayISO();
  const out = [];
  for (const r of m.releases || []) {
    if (!r.releaseDate || !groupsSongs(r, m)) continue;
    for (const it of releaseRolloutItems(r, m, today)) {
      if (it.state === 'done' || it.state === 'moot' || it.state === 'missed' || !inRange(it.due)) continue;
      out.push({ date: it.due, kind: 'task', key: `rr:${r.id}:${it.key}`, title: it.text, sub: `${releaseTypeLabel(r.type)}: “${r.title}” · Rollout`, ref: { page: 'releases', id: r.id } });
    }
  }
  return out;
}
registerAgendaSource(releaseAgendaItems);

/** Every track's own checklist progress, for the release page. */
export const trackProgress = (r, m, today) => tracklist(m.songs, r.id).map((s) => ({ song: s, ...summary(songRolloutItems(s, m, today)) }));
