// Shows: upcoming and past shows with every detail for the day (times, lineup, deal, setlist),
// a settlement after the show, and a copy-paste summary for the band chat.
import { h, icon, button, iconButton, toast } from '../dom.js';
import { SHOW_STATUSES, newShow, niceDate, daysBetween, addDays, mid, setShowStatus, showFollowUp } from './model.js';
import { showTodo, todoDue } from './planner.js';
import { exportPDF } from './pdf.js';
import { showSheetHTML, stageSetlistHTML } from './docs.js';
import { setlistTimes, songSeconds, fmtTime } from './setlist.js';
import { setlistSongs, addCover } from './covers.js';
import { coverPicker } from './page-cover.js';
import { songsUI, autoNote } from './page-songs.js';
import { showTaskState, showTaskDone, setTaskDone } from './todoauto.js';
import { parseTime } from './releases.js';
import { memberSplit, splitText } from './extras.js';

const BILLING = [['headline', 'Headliner'], ['support', 'Support'], ['opener', 'Opener'], ['festival', 'Festival'], ['other', 'Other']];
const label = (list, k) => (list.find(([v]) => v === k) || [k, k])[1];
const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const money = (v) => (v === '' || v == null || Number.isNaN(+v) ? 0 : +v);

/** Net from a settlement: pay + merch − costs. */
export const showNet = (s) => money(s.settlement.pay) + money(s.settlement.merch) - money(s.settlement.costs);

/** A text summary of a show for the band group chat. */
export function showSummary(show, songs = [], band = null) {
  const lines = [`${niceDate(show.date)} · ${show.venue || 'Venue TBD'}${show.city ? `, ${show.city}` : ''}`];
  const times = [show.loadIn && `Load-in ${show.loadIn}`, show.doors && `Doors ${show.doors}`, show.setTime && `We play ${show.setTime}`].filter(Boolean);
  if (times.length) lines.push(times.join(' · '));
  if (show.lineup.length) lines.push(`Lineup: ${show.lineup.map((b) => `${b.name}${b.time ? ` (${b.time})` : ''}`).join(', ')}`);
  if (show.deal) lines.push(`Deal: ${show.deal}`);
  if (show.tickets) lines.push(`Tickets: ${show.tickets}`);
  const set = String(show.setlist || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (set.length) lines.push(`Setlist: ${set.join(' / ')}`);
  if (show.notes) lines.push(show.notes);
  const st = show.settlement || {};
  if (band && [st.pay, st.merch, st.costs].some((v) => v !== '' && v != null)) {
    const net = showNet(show);
    const split = splitText(memberSplit(net, band.members, st));
    lines.push(`Net: ${net < 0 ? '−' : ''}$${Math.abs(net).toFixed(2).replace(/\.00$/, '')}${split ? ` · ${split}` : ''}`);
  }
  return lines.join('\n');
}

export function buildShows(ctx) {
  const m = ctx.store.get();
  const show = ctx.view.id && m.shows.find((s) => s.id === ctx.view.id);
  return show ? showPage(ctx, show) : showList(ctx);
}

function showList(ctx) {
  const m = ctx.store.get();
  const today = ctx.today();
  const add = () => {
    const s = { ...newShow(addDays(today, 30)), city: m.band.city || 'Seattle', todo: showTodo() };
    ctx.update((d) => d.shows.push(s));
    ctx.go('shows', s.id);
  };
  // a show that already happened, to keep the history (and the press kit's "played at") complete
  const addPast = () => {
    const s = { ...newShow(addDays(today, -1)), city: m.band.city || 'Seattle', status: 'played' };
    ctx.update((d) => d.shows.push(s));
    ctx.go('shows', s.id);
    toast('Set the date it was, then add the poster, setlist and what you made.', 'info', 5000);
  };
  const upcoming = m.shows.filter((s) => !s.date || s.date >= today).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  const past = m.shows.filter((s) => s.date && s.date < today).sort((a, b) => b.date.localeCompare(a.date));
  const posterOf = (s) => (s.posterId ? ctx.studio.mediaInfo(s.posterId) : null);
  const anyPoster = m.shows.some((s) => posterOf(s));
  const played = past.filter((s) => s.status === 'played');
  const row = (s) =>
    h(
      'button',
      { type: 'button', class: `mgr-show st-${s.status}${anyPoster ? ' has-poster' : ''}`, onclick: () => ctx.go('shows', s.id) },
      h('span', { class: 'mgr-date' }, s.date ? [h('b', {}, String(+s.date.slice(8))), h('span', {}, new Date(s.date + 'T12:00').toLocaleDateString(undefined, { month: 'short' }))] : h('span', {}, 'TBD')),
      anyPoster ? h('span', { class: 'mgr-show-poster' }, posterOf(s) ? h('img', { src: posterOf(s).thumb || posterOf(s).url, alt: '', loading: 'lazy' }) : null) : null,
      h('span', { class: 'mgr-show-main' }, h('strong', {}, s.venue || 'Venue to be set'), h('span', { class: 'muted tiny' }, [s.city, label(BILLING, s.billing), s.setTime && `set ${s.setTime}`, s.lineup.length && `${s.lineup.length} bands`].filter(Boolean).join(' · '))),
      h('span', { class: `mgr-chip st-${s.status}` }, label(SHOW_STATUSES, s.status)),
      s.date && s.date >= today ? h('span', { class: 'muted tiny' }, `in ${daysBetween(today, s.date)} d`) : s.status === 'played' && (s.settlement.pay || s.settlement.merch) ? h('span', { class: 'muted tiny' }, `net $${showNet(s).toFixed(0)}`) : h('span', {}),
    );
  return h(
    'div',
    { class: 'mgr-page' },
    h('header', { class: 'mgr-head' }, h('div', {}, h('h1', {}, 'Shows'), h('p', { class: 'muted' }, 'Dates, times, lineup, the deal, the setlist and the poster for every show, coming up and played.')), h('div', { class: 'row' }, button('Log a past show', addPast, { iconName: 'calendar', variant: '', title: 'Add a show that already happened, for your history and the press kit' }), button('New show', add, { iconName: 'plus', variant: 'primary' }))),
    h('section', { class: 'mgr-sect' }, h('h2', {}, `Upcoming (${upcoming.length})`), upcoming.length ? h('div', { class: 'mgr-shows' }, upcoming.map(row)) : h('div', { class: 'mgr-empty' }, h('p', {}, 'No upcoming shows.'), button('Add a show', add, { iconName: 'plus', variant: 'sm primary' }))),
    h(
      'section',
      { class: 'mgr-sect mgr-past' },
      h('h2', {}, `Past (${past.length})`),
      past.length
        ? h(
            'div',
            {},
            h('p', { class: 'muted small' }, [`${played.length} played`, played.length ? count(new Set(played.map((s) => s.venue).filter(Boolean)).size, 'venue') : '', played.length ? count(new Set(played.map((s) => s.city).filter(Boolean)).size, 'city', 'cities') : '', played.some((s) => s.settlement.pay || s.settlement.merch) ? `net $${played.reduce((a, s) => a + showNet(s), 0).toFixed(0)}` : ''].filter(Boolean).join(' · ') + '. Venues you played show on the press kit.'),
            past.some(posterOf) ? h('div', { class: 'mgr-poster-wall', 'aria-label': 'Posters from past shows' }, past.filter(posterOf).map((s) => h('button', { type: 'button', onclick: () => ctx.go('shows', s.id), title: `${s.venue || 'Show'} · ${s.date}` }, h('img', { src: posterOf(s).thumb || posterOf(s).url, alt: `Poster: ${s.venue || 'show'} ${s.date}`, loading: 'lazy' }), h('span', { class: 'tiny muted' }, `${niceDate(s.date, { weekday: false })} · ${s.venue || 'Venue'}`)))) : null,
            h('div', { class: 'mgr-shows' }, past.map(row)),
          )
        : h('p', { class: 'muted small' }, 'Shows move here the day after their date. Use “Log a past show” to add ones you played before you started using Band Manager.'),
    ),
  );
}

/** A length box beside a setlist line that isn't one of your songs: typing "3:30" saves it as a cover. */
function coverInput(ctx, title) {
  const inp = h('input', { type: 'text', inputmode: 'numeric', placeholder: 'm:ss', 'aria-label': `Length of ${title}`, 'data-k': `addcover-${title}` });
  const save = () => {
    const sec = parseTime(inp.value.trim());
    if (!sec) return toast('Type the length like 3:30.', 'error');
    let c = null;
    ctx.update((d) => (c = addCover(d, title, inp.value.trim())));
    if (c) toast(`“${c.title}” saved to your covers (${c.length}). Add who it’s by under Songs & releases → Covers.`, 'info', 5000);
  };
  inp.addEventListener('keydown', (e) => e.key === 'Enter' && save());
  inp.addEventListener('change', save);
  return h('span', { class: 'mgr-addcover' }, inp);
}

const GAPS = [[0, 'No gaps'], [10, '10 s between songs'], [20, '20 s between songs'], [30, '30 s between songs'], [60, '1 min between songs']];

/** Under the setlist: each song's length, when it starts, and how long the set runs. */
function setlistBox(ctx, show, S, dur) {
  const m = ctx.store.get();
  const t = setlistTimes(show.setlist, setlistSongs(m), dur, { gap: +show.setGap || 0 });
  if (!t.rows.length) return null;
  const gap = h('select', { 'aria-label': 'Time between songs', 'data-k': `sgap-${show.id}` }, GAPS.map(([v, l]) => h('option', { value: String(v), selected: (+show.setGap || 0) === v }, l)));
  gap.addEventListener('change', () => ctx.update(S((s) => (s.setGap = +gap.value))));
  return h(
    'div',
    { class: 'mgr-setlen' },
    h(
      'ol',
      { class: 'mgr-setlist' },
      t.rows.map((r) =>
        h(
          'li',
          { class: r.seconds ? '' : 'nolen' },
          h('span', { class: 'mgr-track-n' }, String(r.n)),
          r.song && r.song.cover
            ? h('span', {}, h('button', { type: 'button', class: 'link', onclick: () => ((songsUI.scrollTo = 'covers'), ctx.go('songs')), title: 'Edit it in Songs & releases → Covers' }, r.title), h('span', { class: 'mgr-cover-tag muted' }, r.song.artist ? `cover · ${r.song.artist}` : 'cover'))
            : r.song ? h('button', { type: 'button', class: 'link', onclick: () => ctx.go('songs', r.song.id, 'overview'), title: 'Open the song' }, r.title)
              : h('span', {}, r.title, r.seconds ? null : coverInput(ctx, r.title)),
          h('span', { class: 'mono muted' }, fmtTime(r.from)),
          h('strong', { class: 'mono' }, r.seconds ? fmtTime(r.seconds) : '?'),
        ),
      ),
    ),
    h(
      'div',
      { class: 'mgr-setlen-total' },
      h('span', {}, 'Set length ', h('strong', { class: 'mono' }, t.text), ` · ${t.rows.length} song${t.rows.length === 1 ? '' : 's'}${t.gaps ? ` (${fmtTime(t.music)} of music)` : ''}`),
      gap,
    ),
    t.missing ? h('p', { class: 'muted tiny' }, `${t.missing} song${t.missing === 1 ? ' has' : 's have'} no length yet. Your own songs: add it on the song’s Overview (Length) or give it a song file. Covers and anything else: type its length in the box next to it, which saves it to your covers, or after it in the setlist (“Jam 2:30”).`) : null,
  );
}

/** Under the net: who gets what. Members come from the press kit; a band fund % is kept back first. */
function splitBox(ctx, show, S, net) {
  const m = ctx.store.get();
  const members = (m.band.members || []).filter((x) => x && x.name);
  const st = show.settlement;
  if (!members.length) return h('p', { class: 'muted tiny' }, 'Add the band members in Press kit → Members to split the money between them here.');
  const sp = memberSplit(net, members, st);
  const f = ctx.form;
  const uneven = Object.keys(st.shares || {}).length > 0;
  return h(
    'div',
    { class: 'mgr-split' },
    h('div', { class: 'mgr-two' }, f.text(`sfund-${show.id}`, 'Band fund (% kept back)', st.fund, S((s, v) => (s.settlement.fund = v)), { type: 'number', placeholder: '0' }), h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Split'), (() => {
      const sel = h('select', { 'data-k': `ssplit-${show.id}` }, h('option', { value: 'even', selected: !uneven }, 'Even'), h('option', { value: 'shares', selected: uneven }, 'By share'));
      sel.addEventListener('change', () => ctx.update(S((s) => (s.settlement.shares = sel.value === 'shares' ? Object.fromEntries(members.map((x) => [x.id, 1])) : {}))));
      return sel;
    })())),
    net > 0
      ? h('ul', { class: 'mgr-facts' }, sp.members.map((x) => h('li', {}, h('span', {}, x.name), uneven ? f.text(`sshare-${show.id}-${x.id}`, '', (st.shares || {})[x.id] ?? 1, S((s, v) => ((s.settlement.shares ||= {})[x.id] = v)), { type: 'number', aria: `Share for ${x.name}` }) : null, h('strong', {}, `$${x.amount.toFixed(2)}`))), sp.fund ? h('li', {}, h('span', {}, 'Band fund'), h('strong', {}, `$${sp.fund.toFixed(2)}`)) : null)
      : h('p', { class: 'muted tiny' }, 'Nothing to split until the net is above $0.'),
  );
}

function showPage(ctx, show) {
  const dur = (id) => ctx.studio.mediaInfo(id)?.duration || 0;
  const f = ctx.form;
  const m = ctx.store.get();
  const S = (fn) => (d, v) => {
    const s = d.shows.find((x) => x.id === show.id);
    if (s) fn(s, v, d);
  };
  const venues = m.venues || [];
  const remove = () => {
    if (!confirm(`Delete the show at ${show.venue || 'this venue'}?`)) return;
    ctx.update((d) => (d.shows = d.shows.filter((s) => s.id !== show.id)));
    ctx.go('shows');
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(showSummary(show, m.songs, m.band));
      toast('Show details copied. Paste them in the band chat.');
    } catch {
      toast('Could not copy. Select the summary below and copy it.', 'error');
    }
  };
  const lineup = h(
    'ul',
    { class: 'mgr-tasks' },
    show.lineup.map((b, i) =>
      h(
        'li',
        { class: 'mgr-task lu' },
        h('span', { class: 'mgr-when' }, String(i + 1)),
        f.text(`lu-name-${b.id}`, '', b.name, S((s, v) => (s.lineup.find((x) => x.id === b.id).name = v)), { placeholder: 'Band name', list: 'mgr-bandnames' }),
        f.text(`lu-time-${b.id}`, '', b.time, S((s, v) => (s.lineup.find((x) => x.id === b.id).time = v)), { type: 'time', aria: `Set time: ${b.name || 'band'}` }),
        iconButton('arrowUp', 'Move up', () => ctx.update(S((s) => {
          const k = s.lineup.findIndex((x) => x.id === b.id);
          if (k > 0) [s.lineup[k - 1], s.lineup[k]] = [s.lineup[k], s.lineup[k - 1]];
        })), 'ghost'),
        iconButton('trash', `Remove ${b.name || 'band'}`, () => ctx.update(S((s) => (s.lineup = s.lineup.filter((x) => x.id !== b.id)))), 'ghost'),
      ),
    ),
  );
  const bandNames = h('datalist', { id: 'mgr-bandnames' }, [m.band.name, ...(m.bands || []).map((b) => b.name)].filter(Boolean).map((n) => h('option', { value: n })));
  const venueNames = h('datalist', { id: 'mgr-venuenames' }, venues.map((v) => h('option', { value: v.name })));
  const net = showNet(show);
  const today = ctx.today();
  const T = (id, fn) => S((s, v) => {
    const t = (s.todo || []).find((x) => x.id === id);
    if (t) fn(t, v);
  });
  const todo = [...(show.todo || [])].sort((a, b) => a.offset - b.offset);
  const todoBox = h(
    'section',
    { class: 'mgr-sect' },
    h('h2', {}, `To do · ${todo.filter((t) => showTaskDone(show, t)).length}/${todo.length}`),
    todo.length
      ? h('ul', { class: 'mgr-tasks' }, todo.map((t) => {
          const due = todoDue(show, t);
          const st = showTaskState(show, t);
          return h(
            'li',
            { class: `mgr-task todo${st.done ? ' done' : ''}${!st.done && due && due < today ? ' late' : ''}` },
            f.check(`todo-${t.id}`, st.done, T(t.id, (x, v) => setTaskDone(x, v, st.auto)), st.done && !st.manual ? `Mark not done: ${t.text}` : `Done: ${t.text}`),
            h('span', { class: 'mgr-when' }, due ? niceDate(due, { weekday: false }) : t.offset === 0 ? 'Show day' : `${Math.abs(t.offset)} d ${t.offset < 0 ? 'before' : 'after'}`),
            f.text(`todot-${t.id}`, '', t.text, T(t.id, (x, v) => (x.text = v)), { aria: `To-do: ${t.text}` }),
            iconButton('trash', `Delete “${t.text}”`, () => ctx.update(S((s) => (s.todo = s.todo.filter((x) => x.id !== t.id)))), 'ghost'),
            autoNote(st, T(t.id, (x) => delete x.autoOff), ctx),
          );
        }))
      : h('p', { class: 'muted small' }, 'No to-do list for this show.'),
    h('div', { class: 'row' }, todo.length ? null : button('Add the standard show to-do list', () => ctx.update(S((s) => (s.todo = showTodo()))), { iconName: 'check', variant: 'sm' }), button('Add a to-do', () => ctx.update(S((s) => (s.todo ||= []).push({ id: mid('todo'), offset: -1, text: 'New to-do', done: false }))), { iconName: 'plus', variant: 'sm ghost' })),
  );
  return h(
    'div',
    { class: 'mgr-page' },
    h('button', { type: 'button', class: 'link back', onclick: () => ctx.go('shows') }, icon('arrowLeft', 14), 'All shows'),
    h(
      'header',
      { class: 'mgr-head' },
      h('div', {}, h('h1', {}, show.venue || 'New show'), h('p', { class: 'muted' }, show.date ? `${niceDate(show.date)}${show.date >= ctx.today() ? ` · in ${daysBetween(ctx.today(), show.date)} days` : ''}` : 'No date yet')),
      h('div', { class: 'row' }, button('Copy for the band chat', copy, { iconName: 'copy', variant: 'sm' }), button('Make a poster', () => ctx.studio.openPhoto('show', { showId: show.id }), { iconName: 'image', variant: 'sm', title: 'A gig poster for this show in the Photo Studio' }), button('Export show sheet PDF', () => (exportPDF(showSheetHTML({ ...show, billing: label(BILLING, show.billing), status: label(SHOW_STATUSES, show.status) }, m.band, { times: setlistTimes(show.setlist, setlistSongs(m), dur, { gap: +show.setGap || 0 }) }), `${show.venue || 'Show'} ${show.date || ''}`.trim()), toast('Pick “Save as PDF” as the printer to get a PDF.')), { iconName: 'print', variant: 'sm' }), button(show.plan ? 'Show plan' : 'Plan the night', () => ctx.go('planner', show.id, 'plan'), { iconName: 'clipboard', variant: 'sm ghost', title: 'Run of show: set times, changeovers and the setlist with timings' }), iconButton('trash', 'Delete this show', remove, 'ghost danger')),
    ),
    bandNames,
    venueNames,
    h(
      'div',
      { class: 'mgr-cols' },
      h(
        'section',
        { class: 'mgr-sect' },
        h('h2', {}, 'The show'),
        h('div', { class: 'mgr-two' }, f.text(`sd-${show.id}`, 'Date', show.date, S((s, v) => (s.date = v)), { type: 'date' }), f.select(`ss-${show.id}`, 'Status', show.status, SHOW_STATUSES, S((s, v) => setShowStatus(s, v, ctx.today())))),
        showFollowUp(show) ? h('p', { class: 'muted small' }, `Pitched ${niceDate(show.pitchedOn, { weekday: false })}. Follow up with the venue on ${niceDate(showFollowUp(show), { weekday: false })} if you haven’t heard back. `, button('I followed up', () => ctx.update(S((s) => (s.followedUp = true))), { variant: 'sm ghost' })) : null,
        h('div', { class: 'mgr-two' }, f.text(`sv-${show.id}`, 'Venue', show.venue, S((s, v, d) => {
          s.venue = v;
          const known = (d.venues || []).find((x) => x.name === v);
          s.venueId = known ? known.id : null;
          if (known && known.city) s.city = known.city;
        }), { list: 'mgr-venuenames', placeholder: 'Venue name' }), f.text(`sc-${show.id}`, 'City', show.city, S((s, v) => (s.city = v)))),
        h('div', { class: 'mgr-three' }, f.text(`sl-${show.id}`, 'Load-in', show.loadIn, S((s, v) => (s.loadIn = v)), { type: 'time' }), f.text(`sdo-${show.id}`, 'Doors', show.doors, S((s, v) => (s.doors = v)), { type: 'time' }), f.text(`st-${show.id}`, 'Our set', show.setTime, S((s, v) => (s.setTime = v)), { type: 'time' })),
        h('div', { class: 'mgr-two' }, f.select(`sb-${show.id}`, 'Billing', show.billing, BILLING, S((s, v) => (s.billing = v))), f.text(`sp-${show.id}`, 'Ticket price', show.price, S((s, v) => (s.price = v)), { placeholder: 'e.g. $15 adv / $18 door' })),
        f.text(`stk-${show.id}`, 'Ticket link', show.tickets, S((s, v) => (s.tickets = v.trim())), { type: 'url', placeholder: 'https://…' }),
        f.text(`sdeal-${show.id}`, 'Deal', show.deal, S((s, v) => (s.deal = v)), { placeholder: 'e.g. $150 guarantee, or door split after costs' }),
        f.text(`scon-${show.id}`, 'Venue contact', show.contact, S((s, v) => (s.contact = v)), { placeholder: 'Booker name, email or phone' }),
        f.text(`snotes-${show.id}`, 'Notes', show.notes, S((s, v) => (s.notes = v)), { rows: 3, placeholder: 'Backline, parking, merch table, guest list…' }),
        h('h2', {}, 'Poster'),
        coverPicker(ctx, { key: `show-${show.id}`, current: show.posterId, set: (id) => ctx.update(S((s) => (s.posterId = id))), label: 'Show poster', poster: true, hint: 'The venue’s or your own: upload it, take it from Google Drive or pick one you already have.' }),
        show.posterId ? null : button('Design one in the Photo Studio', () => ctx.studio.openPhoto('show', { showId: show.id }), { iconName: 'image', variant: 'sm ghost', title: 'The show poster template, filled in from this show. “Use as the show’s poster” there puts it here.' }),
      ),
      h('div', {}, todoBox, h(
        'section',
        { class: 'mgr-sect' },
        h('h2', {}, 'Lineup'),
        lineup,
        h('div', { class: 'row' }, button('Add a band', () => ctx.update(S((s) => s.lineup.push({ id: mid('lu'), name: '', time: '' }))), { iconName: 'plus', variant: 'sm ghost' }), show.lineup.some((b) => b.name === m.band.name) ? null : button(`Add ${m.band.name}`, () => ctx.update(S((s) => s.lineup.push({ id: mid('lu'), name: m.band.name, time: s.setTime || '' }))), { variant: 'sm ghost' })),
        h('h2', {}, 'Setlist'),
        f.text(`sset-${show.id}`, '', show.setlist, S((s, v) => (s.setlist = v)), { rows: 7, aria: 'Setlist', placeholder: 'One song per line. A line can carry its own time: “Jam 2:30”' }),
        setlistSongs(m).length ? h('div', { class: 'chips' }, setlistSongs(m).map((sg) => {
          const sec = songSeconds(sg, dur);
          return button(sec ? `${sg.title} · ${fmtTime(sec)}` : sg.title, () => ctx.update(S((s) => (s.setlist = `${s.setlist ? `${s.setlist.trimEnd()}\n` : ''}${sg.title}`))), { variant: sg.cover ? 'chip cover' : 'chip', title: sg.cover ? `Cover${sg.artist ? ` of ${sg.artist}` : ''}` : '' });
        })) : null,
        setlistBox(ctx, show, S, dur),
        String(show.setlist || '').trim() ? h('div', { class: 'row' }, button('Print setlist', () => (exportPDF(stageSetlistHTML(show, m.band, setlistTimes(show.setlist, setlistSongs(m), dur, { gap: +show.setGap || 0 })), `Setlist ${show.venue || ''} ${show.date || ''}`.trim()), toast('Big type on one page, for the stage floor.')), { iconName: 'print', variant: 'sm', title: 'The setlist in big type on one page, to tape to the stage' })) : null,
        h('h2', {}, 'After the show'),
        h('div', { class: 'mgr-three' }, f.text(`spay-${show.id}`, 'We were paid', show.settlement.pay, S((s, v) => (s.settlement.pay = v)), { type: 'number', placeholder: '$' }), f.text(`smer-${show.id}`, 'Merch sales', show.settlement.merch, S((s, v) => (s.settlement.merch = v)), { type: 'number', placeholder: '$' }), f.text(`scost-${show.id}`, 'Costs', show.settlement.costs, S((s, v) => (s.settlement.costs = v)), { type: 'number', placeholder: 'gas, food…' })),
        show.settlement.pay !== '' || show.settlement.merch !== '' || show.settlement.costs !== '' ? h('p', { class: `mgr-net ${net >= 0 ? 'ok' : 'bad'}` }, `Net: ${net < 0 ? '−' : ''}$${Math.abs(net).toFixed(2)}`) : null,
        splitBox(ctx, show, S, net),
        h('h3', { class: 'mgr-h3' }, 'Summary for the band chat'),
        h('pre', { class: 'mgr-pre' }, showSummary(show, m.songs, m.band)),
      )),
    ),
  );
}
