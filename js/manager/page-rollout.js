// The Rollout views: a song's release checklist by week (on its Release tab) and an EP or album's own rollout
// (on its release page). Logic in rollout.js.
import { h, button, toast } from '../dom.js';
import { niceDate, TASK_CATS } from './model.js';
import { setTaskDone } from './todoauto.js';
import { songRollout, missingRolloutSteps, addRolloutSteps, releaseRollout, setRelStep, groupsSongs, trackProgress } from './rollout.js';
import { releaseTypeLabel } from './releases.js';
import { autoNote } from './page-songs.js';

/** Which view the song's Release tab shows (not saved). */
export const rolloutUI = { view: 'list' };

const STATE = { late: ['Late', 'late'], missed: ['Missed', 'missed'], moot: ['Skipped: the song is out', 'moot'], done: ['', 'done'], open: ['', ''] };
const range = (w) => (w.from ? `${niceDate(w.from, { weekday: false })} to ${niceDate(w.to, { weekday: false })}` : '');

/** Week blocks; `row(item)` draws one step. */
function weeksView(weeks, row) {
  return h(
    'div',
    { class: 'mgr-ro-weeks' },
    weeks.map((w) =>
      h(
        'section',
        { class: `mgr-ro-week${w.current ? ' now' : ''}`, 'data-week': String(w.week) },
        h('header', { class: 'mgr-ro-head' }, h('strong', {}, w.label), h('span', { class: 'muted tiny' }, [range(w), w.current ? 'now' : ''].filter(Boolean).join(' · ')), h('span', { class: 'mgr-ro-count small' }, w.total ? `${w.done}/${w.total}` : '–'), h('span', { class: 'mgr-bar', 'aria-label': `${w.done} of ${w.total} done` }, h('i', { style: { width: `${w.total ? (100 * w.done) / w.total : 0}%` } }))),
        h('ul', { class: 'mgr-ro-list' }, w.items.map(row)),
      ),
    ),
  );
}
const stateChip = (state) => (STATE[state] && STATE[state][0] ? h('span', { class: `mgr-chip mgr-ro-${STATE[state][1]}` }, STATE[state][0]) : null);
const summaryLine = (r, what) => h('p', { class: 'small mgr-ro-sum', 'data-k': 'ro-sum' }, `${r.done} of ${r.total} ${what} done`, r.late ? ` · ${r.late} late` : '', r.missed ? ` · ${r.missed} missed (older than a week after release, so not on Home)` : '');

/** The view chips above the song's checklist. */
export function rolloutToggle(ctx) {
  const chip = (k, label) => button(label, () => ((rolloutUI.view = k), ctx.setTab('release')), { variant: `chip${rolloutUI.view === k ? ' on' : ''}` });
  return h('div', { class: 'chips mgr-ro-toggle', role: 'group', 'aria-label': 'Checklist view' }, chip('list', 'Checklist'), chip('weeks', 'Rollout by week'));
}

/** "Add the newer rollout steps" for a song whose checklist was made before them ('' when none are missing). */
export function addStepsButton(ctx, song, S) {
  const today = ctx.today();
  const { add, past } = missingRolloutSteps(song, today);
  if (!add.length) return null;
  return button(`Add ${add.length} newer rollout step${add.length === 1 ? '' : 's'}`, () => {
    let res = null;
    ctx.update(S((s) => (res = addRolloutSteps(s, today))));
    toast(`${res.added} step${res.added === 1 ? '' : 's'} added${res.skipped ? `; ${res.skipped} already past were left out` : ''}.`);
  }, { iconName: 'plus', variant: 'sm ghost', title: `Teasers, pre-save push, premiere, thank-yous and the recap.${past.length ? ` ${past.length} more are already past and are left out.` : ''}` });
}

/** The song's checklist by week. */
export function songRolloutView(ctx, song, S) {
  const m = ctx.store.get();
  const f = ctx.form;
  const ro = songRollout(song, m, ctx.today());
  const T = (id, fn) => S((s, v) => {
    const t = s.release.find((x) => x.id === id);
    if (t) fn(t, v);
  });
  const row = (it) =>
    h(
      'li',
      { class: `mgr-task mgr-ro-item ${it.state}` },
      f.check(`ro-${it.task.id}`, it.auto.done, T(it.task.id, (x, v) => setTaskDone(x, v, it.auto.auto)), it.auto.done && !it.auto.manual ? `Mark not done: ${it.task.text}` : `Done: ${it.task.text}`),
      h('span', { class: 'mgr-when' }, it.due ? niceDate(it.due, { weekday: false }) : it.offset === 0 ? 'Release day' : `${Math.abs(it.offset)} days ${it.offset < 0 ? 'before' : 'after'}`),
      h('span', { class: 'mgr-ro-text' }, it.task.text),
      h('span', { class: 'mgr-chip' }, TASK_CATS[it.task.cat] || 'Other'),
      stateChip(it.state),
      autoNote(it.auto, T(it.task.id, (x) => delete x.autoOff), ctx),
    );
  return h('div', { class: 'mgr-ro', 'data-k': 'song-rollout' }, summaryLine(ro, 'steps'), weeksView(ro.weeks, row));
}

/** The EP or album's rollout section on its page. */
export function releaseRolloutSection(ctx, r) {
  const m = ctx.store.get();
  const f = ctx.form;
  const today = ctx.today();
  const head = (extra) => h('div', { class: 'mgr-sect-head' }, h('h2', {}, `Rollout${extra}`));
  if (!groupsSongs(r, m))
    return h('section', { class: 'mgr-sect mgr-ro', 'data-k': 'rel-rollout' }, head(''), h('p', { class: 'muted small' }, r.type === 'single' ? 'A single is planned on its song’s Release tab (Rollout by week).' : 'Add songs to this release to get its rollout plan.'));
  const ro = releaseRollout(r, m, today);
  const R = (fn) => (d, v) => {
    const x = (d.releases || []).find((y) => y.id === r.id);
    if (x) fn(x, v);
  };
  const row = (it) =>
    h(
      'li',
      { class: `mgr-task mgr-ro-item ${it.state}` },
      f.check(`rr-${r.id}-${it.key}`, it.auto.done, R((x, v) => setRelStep(x, it.key, v, it.auto.auto)), it.auto.done && !it.auto.manual ? `Mark not done: ${it.text}` : `Done: ${it.text}`),
      h('span', { class: 'mgr-when' }, it.due ? niceDate(it.due, { weekday: false }) : it.offset === 0 ? 'Release day' : `${Math.abs(it.offset)} days ${it.offset < 0 ? 'before' : 'after'}`),
      h('span', { class: 'mgr-ro-text' }, it.text),
      h('span', { class: 'mgr-chip' }, TASK_CATS[it.cat] || 'Other'),
      it.state === 'moot' ? h('span', { class: 'mgr-chip mgr-ro-moot' }, 'Skipped: every track is out') : stateChip(it.state),
      it.auto.auto && !it.auto.manual ? (it.auto.off ? h('span', { class: 'mgr-auto muted tiny' }, `Marked not done by you (it would tick itself: ${it.auto.auto}).`) : h('span', { class: 'mgr-auto muted tiny' }, `Done automatically: ${it.auto.auto}.`)) : null,
    );
  const tracks = trackProgress(r, m, today);
  return h(
    'section',
    { class: 'mgr-sect mgr-ro', 'data-k': 'rel-rollout' },
    head(` · ${ro.done}/${ro.total}`),
    r.releaseDate ? h('p', { class: 'muted small' }, `One plan for the whole ${releaseTypeLabel(r.type)}, counted from ${niceDate(r.releaseDate)}. Change the release date and every step moves; open steps show on the Calendar and Home.`) : h('p', { class: 'warn-list' }, 'Set the release date above to put dates on these steps (and on the Calendar).'),
    summaryLine(ro, 'release steps'),
    weeksView(ro.weeks, row),
    h('h3', { class: 'mgr-h3' }, 'Each track’s own checklist'),
    h('ul', { class: 'mgr-ro-tracks' }, tracks.map((t) => h('li', {}, h('button', { type: 'button', class: 'link', onclick: () => ctx.go('songs', t.song.id, 'release') }, t.song.title), h('span', { class: 'muted tiny' }, ` ${t.done}/${t.total} done${t.late ? ` · ${t.late} late` : ''}${t.song.releaseDate ? ` · out ${niceDate(t.song.releaseDate, { weekday: false })}` : ' · no date'}`)))),
  );
}
