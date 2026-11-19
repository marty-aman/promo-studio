// Calendar: shows, releases, shoots, posts and to-dos on a month grid, plus an .ics export for
// Google, Apple or Outlook calendars.
import { h, icon, button, iconButton, download } from '../dom.js';
import { agenda, addDays, niceDate } from './model.js';
import { monthGrid, monthStart, managerICS } from './extras.js';

export const calUI = { month: '' };
const KIND = { show: ['ticket', 'Show'], release: ['disc', 'Release'], shoot: ['film', 'Shoot'], post: ['share', 'Post'], task: ['check', 'To do'] };

export function buildCalendar(ctx) {
  const m = ctx.store.get();
  const today = ctx.today();
  const ui = calUI;
  if (!ui.month) ui.month = monthStart(today);
  const weeks = monthGrid(ui.month);
  const first = weeks[0][0];
  const items = agenda(m, first, weeks.length * 7);
  const byDay = new Map();
  for (const it of items) (byDay.get(it.date) || byDay.set(it.date, []).get(it.date)).push(it);
  const monthName = new Date(`${ui.month}T12:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const go = (delta) => ((ui.month = delta === 0 ? monthStart(today) : monthStart(ui.month, delta)), ctx.go('calendar'));
  const exportICS = () => {
    download(new Blob([managerICS(m)], { type: 'text/calendar' }), `${(m.band.name || 'band').replace(/[^\w-]+/g, '-').toLowerCase()}-calendar.ics`);
  };
  const counts = Object.fromEntries(Object.keys(KIND).map((k) => [k, items.filter((x) => x.kind === k && x.date.slice(0, 7) === ui.month.slice(0, 7)).length]));
  return h(
    'div',
    { class: 'mgr-page wide' },
    h(
      'header',
      { class: 'mgr-head' },
      h('div', {}, h('h1', {}, 'Calendar'), h('p', { class: 'muted' }, 'Shows, releases, shoots, posts and to-dos in one place.')),
      h('div', { class: 'row' }, button('Download for my calendar (.ics)', exportICS, { iconName: 'calendar', variant: 'sm', title: 'Import into Google Calendar, Apple Calendar or Outlook' })),
    ),
    h(
      'div',
      { class: 'mgr-calbar' },
      h('div', { class: 'row' }, iconButton('arrowLeft', 'Previous month', () => go(-1), 'ghost'), h('h2', { class: 'mgr-month' }, monthName), iconButton('arrowRight', 'Next month', () => go(1), 'ghost'), button('Today', () => go(0), { variant: 'sm' })),
      h('div', { class: 'mgr-legend' }, Object.entries(KIND).map(([k, [ic, l]]) => h('span', { class: `mgr-kind ${k}` }, icon(ic, 12), `${l} ${counts[k] || 0}`))),
    ),
    h(
      'div',
      { class: 'mgr-cal', role: 'grid', 'aria-label': monthName },
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => h('div', { class: 'mgr-cal-h', role: 'columnheader' }, d)),
      weeks.flat().map((d) => {
        const list = byDay.get(d) || [];
        const out = d.slice(0, 7) !== ui.month.slice(0, 7);
        return h(
          'div',
          { class: `mgr-cal-d${out ? ' out' : ''}${d === today ? ' today' : ''}`, role: 'gridcell', 'aria-label': niceDate(d) },
          h('span', { class: 'mgr-cal-n' }, String(+d.slice(8))),
          list.slice(0, 4).map((it) => h('button', { type: 'button', class: `mgr-cal-item ${it.kind}`, title: `${KIND[it.kind][1]}: ${it.title}${it.sub ? ` · ${it.sub}` : ''}`, onclick: () => ctx.go(it.ref.page, it.ref.id, it.ref.tab) }, icon(KIND[it.kind][0], 11), h('span', {}, it.title))),
          list.length > 4 ? h('span', { class: 'muted tiny' }, `+${list.length - 4} more`) : null,
        );
      }),
    ),
    h('p', { class: 'muted tiny' }, `The .ics file holds everything from ${niceDate(addDays(today, -30), { weekday: false })} on. Shows use your set time, shoots the call time; the rest are all-day. Import it again after changes (most calendars update matching items).`),
  );
}
