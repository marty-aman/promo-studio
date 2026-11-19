// Home: what's next. The next show and release, the next two weeks, and anything overdue.
import { h, icon, button } from '../dom.js';
import { agenda, overdueTasks, nextUp, releaseProgress, daysBetween, niceDate, newSong, newShow, addDays } from './model.js';
import { showTodo } from './planner.js';
import { findings } from './content.js';

const KIND = { show: ['ticket', 'Show'], release: ['disc', 'Release'], shoot: ['film', 'Shoot'], post: ['share', 'Post'], task: ['check', 'Task'] };

const inDays = (n) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : n < 0 ? `${-n} days ago` : `in ${n} days`);

export function buildHome(ctx) {
  const m = ctx.store.get();
  const today = ctx.today();
  const { release, show } = nextUp(m, today);
  const items = agenda(m, today, 14);
  const late = overdueTasks(m, today);

  const addSong = () => {
    const s = newSong('New song');
    ctx.update((d) => d.songs.unshift(s));
    ctx.go('songs', s.id, 'overview');
  };
  const addShow = () => {
    const s = { ...newShow(addDays(today, 30)), todo: showTodo() };
    ctx.update((d) => d.shows.push(s));
    ctx.go('shows', s.id);
  };

  const card = (ic, label, body, onclick) => h('button', { type: 'button', class: 'mgr-card big', onclick }, h('span', { class: 'mgr-card-k' }, icon(ic, 16), label), body);

  const nextShow = show
    ? card('ticket', 'Next show', [h('strong', {}, show.venue || 'Venue to be set'), h('span', {}, `${niceDate(show.date)} · ${inDays(daysBetween(today, show.date))}`), h('span', { class: 'muted tiny' }, [show.city, show.setTime && `set ${show.setTime}`, show.status].filter(Boolean).join(' · '))], () => ctx.go('shows', show.id))
    : card('ticket', 'Next show', [h('strong', {}, 'Nothing booked'), h('span', { class: 'muted tiny' }, 'Add a show, or find venues and bands in the show planner.')], addShow);

  const nextRelease = release
    ? (() => {
        const p = releaseProgress(release);
        return card('disc', 'Next release', [
          h('strong', {}, `“${release.title}”`),
          h('span', {}, `${niceDate(release.releaseDate)} · ${inDays(daysBetween(today, release.releaseDate))}`),
          h('span', { class: 'mgr-bar', 'aria-label': `${p.done} of ${p.total} release tasks done` }, h('i', { style: { width: `${p.total ? (100 * p.done) / p.total : 0}%` } })),
          h('span', { class: 'muted tiny' }, `${p.done} of ${p.total} release tasks done`),
        ], () => ctx.go('songs', release.id, 'release'));
      })()
    : card('disc', 'Next release', [h('strong', {}, 'No release date set'), h('span', { class: 'muted tiny' }, 'Give a song a release date and its checklist counts back from it.')], () => (m.songs.length ? ctx.go('songs') : addSong()));

  // the days ahead, grouped by day
  const fd = findings(m.posts);
  const best = fd.ready && fd.lines[0];
  const bestCard = card('chart', 'What works', best ? [h('strong', {}, best.text.split(':')[0]), h('span', { class: 'muted tiny' }, best.text.includes(':') ? best.text.slice(best.text.indexOf(':') + 1).trim() : `${fd.count} posts with stats`)] : [h('strong', {}, 'Not enough stats yet'), h('span', { class: 'muted tiny' }, `Add stats to 3 posts on the Content page (${fd.count} so far).`)], () => ctx.go('content'));

  // the next two weeks, grouped by day
  const days = [];
  for (const it of items) {
    const last = days[days.length - 1];
    if (last && last.date === it.date) last.items.push(it);
    else days.push({ date: it.date, items: [it] });
  }
  const week = days.length
    ? h(
        'div',
        { class: 'mgr-agenda' },
        days.map((d) =>
          h(
            'div',
            { class: 'mgr-day' },
            h('div', { class: 'mgr-day-d' }, h('strong', {}, niceDate(d.date)), h('span', { class: 'muted tiny' }, inDays(daysBetween(today, d.date)))),
            h(
              'ul',
              {},
              d.items.map((it) =>
                h('li', {}, h('button', { type: 'button', class: `mgr-item ${it.kind}`, onclick: () => ctx.go(it.ref.page, it.ref.id, it.ref.tab) }, h('span', { class: 'mgr-kind' }, icon(KIND[it.kind][0], 14), KIND[it.kind][1]), h('span', { class: 'mgr-item-t' }, it.title), h('span', { class: 'muted tiny' }, it.sub))),
              ),
            ),
          ),
        ),
      )
    : h('p', { class: 'muted small' }, 'Nothing in the next two weeks. Set release dates, add shows or plan posts and they show up here.');

  const lateList = late.length
    ? h(
        'section',
        { class: 'mgr-sect warn' },
        h('h2', {}, `Overdue (${late.length})`),
        h(
          'ul',
          { class: 'mgr-list' },
          late.slice(0, 8).map(({ song, show, task, due }) =>
            h(
              'li',
              { class: 'mgr-row' },
              ctx.form.check(`late-${task.id}`, false, (d) => {
                const t = song ? d.songs.find((s) => s.id === song.id)?.release.find((x) => x.id === task.id) : d.shows.find((s) => s.id === show.id)?.todo.find((x) => x.id === task.id);
                if (t) t.done = true;
              }, `Mark “${task.text}” done`),
              h('button', { type: 'button', class: 'link', onclick: () => (song ? ctx.go('songs', song.id, 'release') : ctx.go('shows', show.id)) }, task.text),
              h('span', { class: 'muted tiny' }, `${song ? `“${song.title}”` : `Show: ${show.venue || 'venue TBD'}`} · due ${niceDate(due, { weekday: false })}`),
            ),
          ),
        ),
        late.length > 8 ? h('p', { class: 'muted tiny' }, `And ${late.length - 8} more.`) : null,
      )
    : null;

  return h(
    'div',
    { class: 'mgr-page' },
    h('header', { class: 'mgr-head' }, h('div', {}, h('h1', {}, m.band.name || 'Your band'), h('p', { class: 'muted' }, `${niceDate(today)} · ${m.songs.length} song${m.songs.length === 1 ? '' : 's'} · ${m.shows.filter((s) => s.date >= today && s.status !== 'cancelled').length} upcoming show${m.shows.length === 1 ? '' : 's'}`)), h('div', { class: 'row' }, button('New song', addSong, { iconName: 'plus', variant: 'sm' }), button('New show', addShow, { iconName: 'plus', variant: 'sm' }))),
    h('div', { class: 'mgr-cards' }, nextShow, nextRelease, bestCard),
    lateList,
    h('section', { class: 'mgr-sect' }, h('h2', {}, 'Next two weeks'), week),
  );
}
