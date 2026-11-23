// To-dos that tick themselves: a release task or show to-do counts as done when the song or show already holds what
// the task asks for (the cover art is attached, the ISRC is entered, the poster is attached…). Only derived, never
// written: the saved task keeps its own `done` (your tick) and `autoOff` (you said "not done" to the automatic tick).
// Rules match the standard task's text, so a task you renamed or added yourself stays manual. Pure functions.

// Is a media id in the library? Set by the app once the library is loaded (see app.js); until then everything counts
// as present so nothing flickers. Files that are gone from the library never count as attached.
const env = { has: () => true };
export function configureTodoAuto(opts) {
  Object.assign(env, opts);
}

const there = (id, has) => typeof id === 'string' && !!id && has(id);
const filled = (v) => typeof v === 'string' && v.trim() !== '';
const ISRC = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;
const UPC = /^\d{12,13}$/;
const okISRC = (v) => ISRC.test(String(v || '').toUpperCase().replace(/[\s-]+/g, ''));
const okUPC = (v) => UPC.test(String(v || '').replace(/[\s-]+/g, ''));
const VIDEO_PLANNED = ['planned', 'shot', 'editing', 'done', 'released'];
const SHOW_ON = { pitched: 'Pitched', hold: 'On hold', confirmed: 'Confirmed', played: 'Played' };
const FOOTAGE_CLIPS = 20; // "Film 20–30 short clips"

/** Release-task text → (song, { has, release }) → the reason it is done, or ''. */
export const RELEASE_RULES = {
  'Final mix and master approved': (s, { has }) => (there(s.audioId, has) && ['ready', 'released'].includes(s.status) ? `the song file is attached and the song is ${s.status === 'released' ? 'Released' : 'Ready to release'}` : ''),
  'Cover art final (3000 × 3000 px)': (s, { has, release }) => (there(s.coverId, has) ? 'cover art attached' : release && there(release.coverId, has) ? `the cover of “${release.title || 'its release'}” is attached` : ''),
  'Register the song with your PRO (BMI/ASCAP) and note the ISRC': (s) => (okISRC(s.isrc) ? 'ISRC entered' : ''),
  'Upload to your distributor with the release date': (s, { release }) => (okUPC(s.upc) || (release && okUPC(release.upc)) ? 'UPC entered (your distributor gives it on upload)' : Object.values(s.links || {}).some(filled) ? 'a streaming link is filled in' : ''),
  'Plan the music video and short-form shoot (Shoot tab)': (s) => (VIDEO_PLANNED.includes(s.videoStatus) ? 'the music video is past Planned' : filled(s.shoot && s.shoot.date) ? 'a shoot date is set' : ''),
  'Film 20–30 short clips in one session': (s, { has }) => {
    const n = ((s.files && s.files.footage) || []).filter((c) => there(c.mediaId, has)).length;
    return n >= FOOTAGE_CLIPS ? `${n} clips in Raw footage` : '';
  },
  'Music video edit locked': (s, { has }) => (there(s.files && s.files.video && s.files.video.mediaId, has) ? 'the music video is attached' : ['done', 'released'].includes(s.videoStatus) ? 'the music video is marked Complete' : ''),
  'Add the song to your press kit (EPK)': (s) => (filled(s.releaseDate) ? 'the press kit lists every song with a release date' : ''),
  'Premiere the music video': (s) => (s.videoStatus === 'released' ? 'the music video is marked Released' : ''),
  // rollout steps (G2); the ones that read posts need the artist's data `m`
  'First teaser: a studio or behind-the-scenes clip': (s, { m }) => {
    const p = postsOf(s, m).find((x) => x.status === 'posted' && x.date && (!s.releaseDate || x.date < s.releaseDate));
    return p ? `a post for this song went up on ${p.date}, before release` : '';
  },
  'Follow up with the blogs, radio and curators that haven’t replied': (s) => {
    const sent = (s.pitches || []).filter((p) => p && p.status && p.status !== 'todo');
    return sent.length && !sent.some((p) => p.status === 'sent' && !p.followedUp) ? 'every sent pitch is answered or followed up' : '';
  },
  'Set up the music video premiere (date announced, YouTube Premiere set)': (s) => (filled(s.links && s.links.youtube) ? 'the YouTube link is filled in' : s.videoStatus === 'released' ? 'the music video is marked Released' : ''),
  'Post a behind-the-scenes clip from the shoot or studio': (s, { m }) => {
    const p = postsOf(s, m).find((x) => x.status === 'posted' && x.format === 'bts' && (!s.releaseDate || (x.date && x.date >= s.releaseDate)));
    return p ? `a behind-the-scenes post went up on ${p.date}` : '';
  },
  'Second playlist pitch round with the first-week numbers': (s) => {
    const p = s.releaseDate && (s.pitches || []).find((x) => x && x.status !== 'todo' && typeof x.sent === 'string' && x.sent >= s.releaseDate);
    return p ? `a pitch went out on ${p.sent}, after release` : '';
  },
};
const postsOf = (s, m) => (m && Array.isArray(m.posts) ? m.posts.filter((p) => p && p.songId === s.id) : []);

/** Show to-do text → (show, { has }) → the reason it is done, or ''. */
export const SHOW_RULES = {
  'Pitch the venue and hold the date': (sh) => (SHOW_ON[sh.status] ? `the show is ${SHOW_ON[sh.status]}` : ''),
  'Confirm the lineup and the deal in writing': (sh) => (['confirmed', 'played'].includes(sh.status) && filled(sh.deal) ? 'the show is confirmed and the deal is noted' : ''),
  'Flyer / poster made (all bands tagged)': (sh, { has }) => (there(sh.posterId, has) ? 'poster attached' : ''),
};

const releaseOf = (song, m) => (song && song.releaseId && m && Array.isArray(m.releases) ? m.releases.find((r) => r.id === song.releaseId) || null : null);

/** Why a release task counts as done on its own ('' when it doesn't, or isn't one of the standard tasks). */
export function releaseAutoReason(song, task, { has = env.has, release = null, m = null } = {}) {
  const rule = task && RELEASE_RULES[task.text];
  return rule ? rule(song, { has, release, m }) || '' : '';
}
/** Is a media id in the library (as the app configured it)? For rules outside this file. */
export const mediaHas = (id) => there(id, env.has);
/** Why a show to-do counts as done on its own. */
export function showAutoReason(show, task, { has = env.has } = {}) {
  const rule = task && SHOW_RULES[task.text];
  return rule ? rule(show, { has }) || '' : '';
}

/**
 * A task's state: { done, manual, auto, off }. `done` is what every list counts: your tick, or the automatic one
 * unless you turned it off for this task. `auto` is the reason (or ''), `off` that you turned it off.
 */
const state = (task, auto) => {
  const off = task.autoOff === true;
  return { done: task.done === true || (!!auto && !off), manual: task.done === true, auto, off };
};
export const releaseTaskState = (song, task, m = null, opts = {}) => state(task, releaseAutoReason(song, task, { has: opts.has || env.has, release: releaseOf(song, m), m }));
/** The same { done, manual, auto, off } for a task kept elsewhere (an EP's rollout step), given its rule's reason. */
export const taskStateFrom = state;
export const showTaskState = (show, task, opts = {}) => state(task, showAutoReason(show, task, { has: opts.has || env.has }));
export const releaseTaskDone = (song, task, m = null, opts) => releaseTaskState(song, task, m, opts).done;
export const showTaskDone = (show, task, opts) => showTaskState(show, task, opts).done;

/**
 * Tick or untick a task by hand (writes the saved task). Ticking sets done and lets the automatic tick back in;
 * unticking a task that is done automatically remembers "not done" for this task (autoOff), so it stays open.
 */
export function setTaskDone(task, v, auto) {
  task.done = !!v;
  if (v) delete task.autoOff;
  else if (auto) task.autoOff = true;
}
