// Home: what's next. The next show and release, the next two weeks, and anything overdue.
import { h, icon, button } from '../dom.js';
import { agenda, overdueTasks, nextUp, releaseProgress, daysBetween, niceDate, newSong, newShow, addDays } from './model.js';
import { showTodo } from './planner.js';
import { findings, bestThisMonth } from './content.js';
import { combinedAgenda, combinedNext, viewOf, photoStyle } from './artists.js';
import { setTaskDone } from './todoauto.js';
import { weekTab } from './page-week.js';

const HOME_TABS = [['overview', 'Overview'], ['week', 'This week']];

const KIND = { show: ['ticket', 'Show'], release: ['disc', 'Release'], shoot: ['film', 'Shoot'], post: ['share', 'Post'], task: ['check', 'Task'], event: ['calendar', 'Event'] };
const kindOf = (k) => KIND[k] || KIND.task; // an unknown kind from an agenda source shows as a task

const inDays = (n) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : n < 0 ? `${-n} days ago` : `in ${n} days`);

/** "This artist | All artists" chips, shown once there is more than one artist. */
/** The artist's profile photo on Home (click it to change it in the press kit). */
function homeAvatar(ctx, band) {
  const ph = band.photoId && ctx.studio.mediaInfo(band.photoId);
  return h('button', { type: 'button', class: `mgr-artist-dot big${ph ? ' photo' : ''}`, title: ph ? 'Change the profile photo' : 'Add a profile photo', 'aria-label': ph ? 'Change the profile photo' : 'Add a profile photo', onclick: () => ctx.go('epk') }, ph ? h('img', { src: ph.url, alt: '', style: photoStyle(band.photoPos) }) : (band.name || '?')[0].toUpperCase());
}

export function scopeChips(ctx) {
  if (ctx.artists().length < 2) return null;
  const chip = (on, label) => button(label, () => ctx.setCombined(on), { variant: `chip${!!ctx.combined === on ? ' on' : ''}` });
  return h('div', { class: 'chips mgr-scope', role: 'group', 'aria-label': 'Show' }, chip(false, ctx.store.get().band.name || 'This artist'), chip(true, 'All artists'));
}
/** Open an item that may belong to another artist (switching to that artist first). */
export const openItem = (ctx, it) => (it.artistId && it.artistId !== ctx.store.get().artistId ? ctx.switchArtist(it.artistId, it.ref.page, it.ref.id, it.ref.tab) : ctx.go(it.ref.page, it.ref.id, it.ref.tab));

/** A reminder to download a backup, two weeks after the last one (or after you started). */
function backupNudge(ctx) {
  const days = ctx.backupDue ? ctx.backupDue() : 0;
  if (!days) return null;
  return h('div', { class: 'mgr-nudge', role: 'note' }, icon('download', 16), h('span', {}, `No backup in ${days} days. Everything here lives only in this browser; a backup file keeps it safe if the browser is cleared or the laptop dies.`), button('Back up now', () => ctx.backUp(), { variant: 'sm primary' }));
}

export function buildHome(ctx) {
  const m = ctx.store.get();
  const today = ctx.today();
  const all = ctx.combined && ctx.artists().length > 1;
  const ws = all ? ctx.workspace() : null;
  const cn = all ? combinedNext(ws, today) : null;
  const { release, show } = all ? { release: cn.release && cn.release.release, show: cn.show && cn.show.show } : nextUp(m, today);
  const items = all ? combinedAgenda(ws, today, 14) : agenda(m, today, 14);
  const late = all ? ws.artists.flatMap((a) => overdueTasks(viewOf(ws, a.id), today).map((x) => ({ ...x, artistId: a.id, artist: a.band.name }))).sort((x, y) => x.due.localeCompare(y.due)) : overdueTasks(m, today);
  const whose = (o) => (all && o ? ` · ${o.artist}` : '');
  const open = (artistId, page, id, tab) => openItem(ctx, { artistId, ref: { page, id, tab } });

  const addSong = () => {
    const s = newSong('New song');
    ctx.update((d) => d.songs.unshift(s));
    ctx.go('songs', s.id, 'overview');
  };
  const addShow = () => {
    const s = { ...newShow(addDays(today, 30)), city: m.band.city || 'Seattle', todo: showTodo() };
    ctx.update((d) => d.shows.push(s));
    ctx.go('shows', s.id);
  };

  const card = (ic, label, body, onclick) => h('button', { type: 'button', class: 'mgr-card big', onclick }, h('span', { class: 'mgr-card-k' }, icon(ic, 16), label), body);

  const nextShow = show
    ? card('ticket', 'Next show', [h('strong', {}, show.venue || 'Venue to be set'), h('span', {}, `${niceDate(show.date)} · ${inDays(daysBetween(today, show.date))}`), h('span', { class: 'muted tiny' }, [show.city, show.setTime && `set ${show.setTime}`, show.status].filter(Boolean).join(' · ') + whose(cn && cn.show))], () => open(cn && cn.show.artistId, 'shows', show.id))
    : card('ticket', 'Next show', [h('strong', {}, 'Nothing booked'), h('span', { class: 'muted tiny' }, 'Add a show, or find venues and bands in the show planner.')], addShow);

  const nextRelease = release
    ? (() => {
        const p = releaseProgress(release, all ? viewOf(ws, cn.release.artistId) : m);
        return card('disc', 'Next release', [
          h('strong', {}, `“${release.title}”`),
          h('span', {}, `${niceDate(release.releaseDate)} · ${inDays(daysBetween(today, release.releaseDate))}`),
          h('span', { class: 'mgr-bar', 'aria-label': `${p.done} of ${p.total} release tasks done` }, h('i', { style: { width: `${p.total ? (100 * p.done) / p.total : 0}%` } })),
          h('span', { class: 'muted tiny' }, `${p.done} of ${p.total} release tasks done${whose(cn && cn.release)}`),
        ], () => open(cn && cn.release.artistId, 'songs', release.id, 'release'));
      })()
    : card('disc', 'Next release', [h('strong', {}, 'No release date set'), h('span', { class: 'muted tiny' }, 'Give a song a release date and its checklist counts back from it.')], () => (m.songs.length ? ctx.go('songs') : addSong()));

  // the days ahead, grouped by day
  const fd = findings(m.posts);
  const best = fd.ready && fd.lines[0];
  const month = bestThisMonth(m.posts, today, m.songs);
  const monthLine = month.n ? h('span', { class: 'muted tiny mgr-plan-month', 'data-k': 'home-month' }, `Best this month: ${month.type ? month.type.key : `“${month.top.title || 'a post'}”`} (${month.n} post${month.n === 1 ? '' : 's'} with stats${month.small ? ', a hint only' : ''})`) : null;
  const bestCard = all ? null : card('chart', 'What works', best ? [h('strong', {}, best.text.split(':')[0]), h('span', { class: 'muted tiny' }, best.text.includes(':') ? best.text.slice(best.text.indexOf(':') + 1).trim() : `${fd.count} posts with stats`), monthLine] : [h('strong', {}, 'Not enough stats yet'), h('span', { class: 'muted tiny' }, `Add stats to 3 posts on the Content page (${fd.count} so far).`), monthLine], () => ctx.go('content'));

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
                h('li', {}, h('button', { type: 'button', class: `mgr-item ${it.kind}`, onclick: () => openItem(ctx, it) }, h('span', { class: 'mgr-kind' }, icon(kindOf(it.kind)[0], 14), kindOf(it.kind)[1]), h('span', { class: 'mgr-item-t' }, it.title), h('span', { class: 'muted tiny' }, all ? `${it.artist} · ${it.sub}` : it.sub))),
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
          late.slice(0, 8).map(({ song, show, pitch, followup, task, due, artistId, artist, source }) =>
            h(
              'li',
              { class: 'mgr-row' },
              source ? null : all && artistId !== m.artistId ? h('span', { class: 'mgr-artist-dot small', title: artist, 'aria-hidden': 'true' }, (artist || '?')[0].toUpperCase()) : ctx.form.check(`late-${task.id}`, false, (d) => {
                if (followup) {
                  const x = d.shows.find((s) => s.id === show.id);
                  if (x) x.followedUp = true;
                  return;
                }
                if (pitch) {
                  const x = d.songs.find((s) => s.id === song.id)?.pitches.find((y) => y.id === pitch.id);
                  if (x) x.followedUp = true;
                  return;
                }
                const t = song ? d.songs.find((s) => s.id === song.id)?.release.find((x) => x.id === task.id) : d.shows.find((s) => s.id === show.id)?.todo.find((x) => x.id === task.id);
                if (t) setTaskDone(t, true);
              }, `Mark “${task.text}” done`),
              h('button', { type: 'button', class: 'link', onclick: () => (source ? open(artistId, source.ref.page, source.ref.id, source.ref.tab) : song ? open(artistId, 'songs', song.id, pitch ? 'pitch' : 'release') : open(artistId, 'shows', show.id)) }, task.text),
              h('span', { class: 'muted tiny' }, `${all ? `${artist} · ` : ''}${source ? source.sub || '' : song ? `“${song.title}”` : `Show: ${show.venue || 'venue TBD'}`} · due ${niceDate(due, { weekday: false })}`),
            ),
          ),
        ),
        late.length > 8 ? h('p', { class: 'muted tiny' }, `And ${late.length - 8} more.`) : null,
      )
    : null;

  const tab = ctx.view.tab === 'week' ? 'week' : 'overview';
  const tabs = h('div', { class: 'mgr-tabs', role: 'tablist' }, HOME_TABS.map(([k, label]) => h('button', { type: 'button', role: 'tab', 'aria-selected': k === tab ? 'true' : 'false', class: `mgr-tab${k === tab ? ' on' : ''}`, onclick: () => ctx.setTab(k) }, label)));
  const head = h('header', { class: 'mgr-head' }, h('div', { class: 'mgr-head-who' }, all ? null : homeAvatar(ctx, m.band), h('div', {}, h('h1', {}, all ? 'All artists' : m.band.name || 'Your band'), h('p', { class: 'muted' }, all ? `${niceDate(today)} · ${ws.artists.length} artists` : `${niceDate(today)} · ${m.songs.length} song${m.songs.length === 1 ? '' : 's'} · ${m.shows.filter((s) => s.date >= today && s.status !== 'cancelled').length} upcoming show${m.shows.length === 1 ? '' : 's'}`), scopeChips(ctx))), all ? null : h('div', { class: 'row' }, button('New song', addSong, { iconName: 'plus', variant: 'sm' }), button('New show', addShow, { iconName: 'plus', variant: 'sm' })));
  if (tab === 'week') return h('div', { class: 'mgr-page' }, head, backupNudge(ctx), tabs, h('div', { class: 'mgr-tabbody', role: 'tabpanel' }, weekTab(ctx, { openItem })));

  return h(
    'div',
    { class: 'mgr-page' },
    head,
    backupNudge(ctx),
    tabs,
    h('div', { class: 'mgr-cards' }, nextShow, nextRelease, bestCard),
    lateList,
    h('section', { class: 'mgr-sect' }, h('h2', {}, 'Next two weeks'), week),
    ctx.studio && ctx.studio.storagePanel ? h('section', { class: 'mgr-sect' }, ctx.studio.storagePanel()) : null,
  );
}
