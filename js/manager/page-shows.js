// Shows: upcoming and past shows with every detail for the day (times, lineup, deal, setlist),
// a settlement after the show, and a copy-paste summary for the band chat.
import { h, icon, button, iconButton, toast } from '../dom.js';
import { SHOW_STATUSES, newShow, niceDate, daysBetween, addDays, mid } from './model.js';
import { showTodo, todoDue } from './planner.js';
import { exportPDF } from './pdf.js';
import { showSheetHTML } from './docs.js';

const BILLING = [['headline', 'Headliner'], ['support', 'Support'], ['opener', 'Opener'], ['festival', 'Festival'], ['other', 'Other']];
const label = (list, k) => (list.find(([v]) => v === k) || [k, k])[1];
const money = (v) => (v === '' || v == null || Number.isNaN(+v) ? 0 : +v);

/** Net from a settlement: pay + merch − costs. */
export const showNet = (s) => money(s.settlement.pay) + money(s.settlement.merch) - money(s.settlement.costs);

/** A text summary of a show for the band group chat. */
export function showSummary(show, songs = []) {
  const lines = [`${niceDate(show.date)} · ${show.venue || 'Venue TBD'}${show.city ? `, ${show.city}` : ''}`];
  const times = [show.loadIn && `Load-in ${show.loadIn}`, show.doors && `Doors ${show.doors}`, show.setTime && `We play ${show.setTime}`].filter(Boolean);
  if (times.length) lines.push(times.join(' · '));
  if (show.lineup.length) lines.push(`Lineup: ${show.lineup.map((b) => `${b.name}${b.time ? ` (${b.time})` : ''}`).join(', ')}`);
  if (show.deal) lines.push(`Deal: ${show.deal}`);
  if (show.tickets) lines.push(`Tickets: ${show.tickets}`);
  const set = String(show.setlist || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (set.length) lines.push(`Setlist: ${set.join(' / ')}`);
  if (show.notes) lines.push(show.notes);
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
  const upcoming = m.shows.filter((s) => !s.date || s.date >= today).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  const past = m.shows.filter((s) => s.date && s.date < today).sort((a, b) => b.date.localeCompare(a.date));
  const row = (s) =>
    h(
      'button',
      { type: 'button', class: `mgr-show st-${s.status}`, onclick: () => ctx.go('shows', s.id) },
      h('span', { class: 'mgr-date' }, s.date ? [h('b', {}, String(+s.date.slice(8))), h('span', {}, new Date(s.date + 'T12:00').toLocaleDateString(undefined, { month: 'short' }))] : h('span', {}, 'TBD')),
      h('span', { class: 'mgr-show-main' }, h('strong', {}, s.venue || 'Venue to be set'), h('span', { class: 'muted tiny' }, [s.city, label(BILLING, s.billing), s.setTime && `set ${s.setTime}`, s.lineup.length && `${s.lineup.length} bands`].filter(Boolean).join(' · '))),
      h('span', { class: `mgr-chip st-${s.status}` }, label(SHOW_STATUSES, s.status)),
      s.date && s.date >= today ? h('span', { class: 'muted tiny' }, `in ${daysBetween(today, s.date)} d`) : s.status === 'played' && (s.settlement.pay || s.settlement.merch) ? h('span', { class: 'muted tiny' }, `net $${showNet(s).toFixed(0)}`) : h('span', {}),
    );
  return h(
    'div',
    { class: 'mgr-page' },
    h('header', { class: 'mgr-head' }, h('div', {}, h('h1', {}, 'Shows'), h('p', { class: 'muted' }, 'Dates, times, lineup, the deal and the setlist for every show.')), button('New show', add, { iconName: 'plus', variant: 'primary' })),
    h('section', { class: 'mgr-sect' }, h('h2', {}, `Upcoming (${upcoming.length})`), upcoming.length ? h('div', { class: 'mgr-shows' }, upcoming.map(row)) : h('div', { class: 'mgr-empty' }, h('p', {}, 'No upcoming shows.'), button('Add a show', add, { iconName: 'plus', variant: 'sm primary' }))),
    past.length ? h('section', { class: 'mgr-sect' }, h('h2', {}, `Past (${past.length})`), h('div', { class: 'mgr-shows' }, past.map(row))) : null,
  );
}

function showPage(ctx, show) {
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
      await navigator.clipboard.writeText(showSummary(show, m.songs));
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
        f.text(`lu-time-${b.id}`, '', b.time, S((s, v) => (s.lineup.find((x) => x.id === b.id).time = v)), { type: 'time' }),
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
    h('h2', {}, `To do · ${todo.filter((t) => t.done).length}/${todo.length}`),
    todo.length
      ? h('ul', { class: 'mgr-tasks' }, todo.map((t) => {
          const due = todoDue(show, t);
          return h(
            'li',
            { class: `mgr-task todo${t.done ? ' done' : ''}${!t.done && due && due < today ? ' late' : ''}` },
            f.check(`todo-${t.id}`, t.done, T(t.id, (x, v) => (x.done = v)), `Done: ${t.text}`),
            h('span', { class: 'mgr-when' }, due ? niceDate(due, { weekday: false }) : t.offset === 0 ? 'Show day' : `${Math.abs(t.offset)} d ${t.offset < 0 ? 'before' : 'after'}`),
            f.text(`todot-${t.id}`, '', t.text, T(t.id, (x, v) => (x.text = v))),
            iconButton('trash', `Delete “${t.text}”`, () => ctx.update(S((s) => (s.todo = s.todo.filter((x) => x.id !== t.id)))), 'ghost'),
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
      h('div', { class: 'row' }, button('Copy for the band chat', copy, { iconName: 'copy', variant: 'sm' }), button('Export show sheet PDF', () => (exportPDF(showSheetHTML({ ...show, billing: label(BILLING, show.billing), status: label(SHOW_STATUSES, show.status) }, m.band), `${show.venue || 'Show'} ${show.date || ''}`.trim()), toast('Pick “Save as PDF” as the printer to get a PDF.')), { iconName: 'print', variant: 'sm' }), button(show.plan ? 'Show plan' : 'Plan the night', () => ctx.go('planner', show.id, 'plan'), { iconName: 'clipboard', variant: 'sm ghost', title: 'Run of show: set times, changeovers and the setlist with timings' }), iconButton('trash', 'Delete this show', remove, 'ghost danger')),
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
        h('div', { class: 'mgr-two' }, f.text(`sd-${show.id}`, 'Date', show.date, S((s, v) => (s.date = v)), { type: 'date' }), f.select(`ss-${show.id}`, 'Status', show.status, SHOW_STATUSES, S((s, v) => (s.status = v)))),
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
      ),
      h('div', {}, todoBox, h(
        'section',
        { class: 'mgr-sect' },
        h('h2', {}, 'Lineup'),
        lineup,
        h('div', { class: 'row' }, button('Add a band', () => ctx.update(S((s) => s.lineup.push({ id: mid('lu'), name: '', time: '' }))), { iconName: 'plus', variant: 'sm ghost' }), show.lineup.some((b) => b.name === m.band.name) ? null : button(`Add ${m.band.name}`, () => ctx.update(S((s) => s.lineup.push({ id: mid('lu'), name: m.band.name, time: s.setTime || '' }))), { variant: 'sm ghost' })),
        h('h2', {}, 'Setlist'),
        f.text(`sset-${show.id}`, '', show.setlist, S((s, v) => (s.setlist = v)), { rows: 7, placeholder: 'One song per line' }),
        m.songs.length ? h('div', { class: 'chips' }, m.songs.map((sg) => button(sg.title, () => ctx.update(S((s) => (s.setlist = `${s.setlist ? `${s.setlist.trimEnd()}\n` : ''}${sg.title}`))), { variant: 'chip' }))) : null,
        h('h2', {}, 'After the show'),
        h('div', { class: 'mgr-three' }, f.text(`spay-${show.id}`, 'We were paid', show.settlement.pay, S((s, v) => (s.settlement.pay = v)), { type: 'number', placeholder: '$' }), f.text(`smer-${show.id}`, 'Merch sales', show.settlement.merch, S((s, v) => (s.settlement.merch = v)), { type: 'number', placeholder: '$' }), f.text(`scost-${show.id}`, 'Costs', show.settlement.costs, S((s, v) => (s.settlement.costs = v)), { type: 'number', placeholder: 'gas, food…' })),
        show.settlement.pay !== '' || show.settlement.merch !== '' || show.settlement.costs !== '' ? h('p', { class: `mgr-net ${net >= 0 ? 'ok' : 'bad'}` }, `Net: ${net < 0 ? '−' : ''}$${Math.abs(net).toFixed(2)}`) : null,
        h('h3', { class: 'mgr-h3' }, 'Summary for the band chat'),
        h('pre', { class: 'mgr-pre' }, showSummary(show, m.songs)),
      )),
    ),
  );
}
