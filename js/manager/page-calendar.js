// Calendar: shows, releases, shoots, posts and to-dos on a month grid, plus an .ics export for
// Google, Apple or Outlook calendars.
import { h, icon, button, iconButton, download, toast } from '../dom.js';
import { exportPDF } from './pdf.js';
import { calendarHTML } from './docs.js';
import { agenda, addDays, niceDate, newEvent, EVENT_KINDS } from './model.js';
import { monthGrid, monthStart, managerICS } from './extras.js';
import { combinedAgenda } from './artists.js';
import { scopeChips, openItem } from './page-home.js';
import { buildAvailability } from './page-availability.js';

export const calUI = { month: '', draft: null, isNew: false };
const KIND = { show: ['ticket', 'Show'], release: ['disc', 'Release'], shoot: ['film', 'Shoot'], event: ['calendar', 'Event'], post: ['share', 'Post'], task: ['check', 'To do'] };
const kindOf = (k) => KIND[k] || KIND.task; // an unknown kind from an agenda source shows as a task

/** Open the event form: a new event on `date`, or a copy of an existing one to edit. */
const openDraft = (ctx, ev, isNew) => {
  calUI.draft = { ...ev };
  calUI.isNew = isNew;
  calUI.month = monthStart(ev.date || ctx.today());
  ctx.go('calendar', isNew ? null : ev.id);
};

/** The add / edit form for one of your own events. Edits stay in the form until Save (one undo step). */
function eventForm(ctx) {
  const ui = calUI;
  const d = ui.draft;
  const close = () => ((ui.draft = null), ctx.go('calendar'));
  const field = (k, label, type, attrs = {}) => {
    const el = h(type === 'textarea' ? 'textarea' : 'input', { ...(type === 'textarea' ? { rows: 2 } : { type }), 'data-k': `ev-${k}`, ...attrs });
    el.value = d[k] || '';
    el.addEventListener('input', () => (d[k] = el.value));
    return h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, label), el);
  };
  const allDay = h('input', { type: 'checkbox', checked: !!d.allDay, 'data-k': 'ev-allday' });
  allDay.addEventListener('change', () => ((d.allDay = allDay.checked), ctx.refresh()));
  const kind = h('select', { 'data-k': 'ev-kind' }, EVENT_KINDS.map(([v, l]) => h('option', { value: v, selected: v === d.kind }, l)));
  kind.addEventListener('change', () => (d.kind = kind.value));
  const repeat = h('select', { 'data-k': 'ev-repeat' }, h('option', { value: '', selected: !d.repeat }, 'Doesn’t repeat'), h('option', { value: 'weekly', selected: d.repeat === 'weekly' }, 'Every week'));
  repeat.addEventListener('change', () => ((d.repeat = repeat.value), ctx.refresh()));
  const save = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) return toast('Pick a date for the event.', 'error');
    const ev = { ...d, title: (d.title || '').trim() || EVENT_KINDS.find(([k]) => k === d.kind)[1], allDay: d.allDay || !d.start, end: d.allDay || !d.start ? '' : d.end, start: d.allDay ? '' : d.start, until: d.repeat === 'weekly' && d.until >= d.date ? d.until : '' };
    ctx.update((m) => {
      m.events ||= [];
      const i = m.events.findIndex((x) => x.id === ev.id);
      if (i >= 0) m.events[i] = ev;
      else m.events.push(ev);
    });
    toast(ui.isNew ? `Added “${ev.title}” on ${niceDate(ev.date, { weekday: false })}.` : 'Event saved.');
    close();
  };
  const remove = () => {
    ctx.update((m) => (m.events = (m.events || []).filter((x) => x.id !== d.id)));
    toast(`Deleted “${d.title || 'the event'}”. Ctrl+Z brings it back.`, 'info', 5000);
    close();
  };
  return h(
    'section',
    { class: 'mgr-sect mgr-evform', role: 'dialog', 'aria-label': ui.isNew ? 'New event' : 'Edit event' },
    h('h2', {}, ui.isNew ? 'New event' : 'Edit event'),
    h('div', { class: 'mgr-two' }, field('title', 'Title', 'text', { placeholder: 'Rehearsal, band meeting, drive to Portland…' }), h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Kind'), kind)),
    h('div', { class: 'mgr-three' }, field('date', 'Date', 'date'), d.allDay ? null : field('start', 'Starts', 'time'), d.allDay ? null : field('end', 'Ends', 'time')),
    h('label', { class: 'mf inline' }, allDay, h('span', {}, 'All day')),
    h('div', { class: 'mgr-two' }, h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Repeats'), repeat), d.repeat === 'weekly' ? field('until', 'Until (blank: no end)', 'date') : h('span')),
    field('location', 'Location', 'text', { placeholder: 'Practice space, address…' }),
    field('note', 'Note', 'textarea'),
    h('div', { class: 'row' }, button(ui.isNew ? 'Add event' : 'Save', save, { iconName: 'check', variant: 'sm primary' }), button('Cancel', close, { variant: 'sm ghost' }), ui.isNew ? null : button('Delete', remove, { iconName: 'trash', variant: 'sm ghost danger' })),
  );
}

export function buildCalendar(ctx) {
  const m = ctx.store.get();
  const today = ctx.today();
  const ui = calUI;
  if (!ui.month) ui.month = monthStart(today);
  // opened from Home or the grid with an event's id: edit that event
  const opened = ctx.view.id && (m.events || []).find((x) => x.id === ctx.view.id);
  if (opened && (!ui.draft || ui.draft.id !== opened.id)) {
    ui.draft = { ...opened };
    ui.isNew = false;
    ui.month = monthStart(opened.date);
  }
  if (!ctx.view.id && ui.draft && !ui.isNew) ui.draft = null;
  const tab = ctx.view.tab === 'avail' && !ctx.view.id ? 'avail' : 'overview';
  const addOn = (date) => openDraft(ctx, newEvent(date), true);
  const weeks = monthGrid(ui.month);
  const first = weeks[0][0];
  const all = ctx.combined && ctx.artists().length > 1;
  const ws = all ? ctx.workspace() : null;
  const items = all ? combinedAgenda(ws, first, weeks.length * 7) : agenda(m, first, weeks.length * 7);
  const byDay = new Map();
  for (const it of items) (byDay.get(it.date) || byDay.set(it.date, []).get(it.date)).push(it);
  const monthName = new Date(`${ui.month}T12:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const go = (delta) => ((ui.month = delta === 0 ? monthStart(today) : monthStart(ui.month, delta)), ctx.go('calendar'));
  const exportICS = () => {
    download(new Blob([managerICS(m, { ws })], { type: 'text/calendar' }), `${(all ? 'all-artists' : m.band.name || 'band').replace(/[^\w-]+/g, '-').toLowerCase()}-calendar.ics`);
  };
  const pdf = () => {
    const inMonth = items.filter((x) => x.date.slice(0, 7) === ui.month.slice(0, 7));
    const title = `${all ? 'All artists' : m.band.name || 'Band'} · calendar`;
    exportPDF(calendarHTML({ title, monthName, items: inMonth }), `${title} ${ui.month.slice(0, 7)}`);
    toast('Pick “Save as PDF” as the printer to get a PDF.');
  };
  const tabs = h('div', { class: 'mgr-tabs', role: 'tablist' }, [['overview', 'Calendar'], ['avail', 'Availability']].map(([k, l]) => h('button', { type: 'button', role: 'tab', 'aria-selected': k === tab ? 'true' : 'false', class: `mgr-tab${k === tab ? ' on' : ''}`, 'data-k': `cal-tab-${k}`, onclick: () => ctx.go('calendar', null, k) }, l)));
  if (tab === 'avail') return h('div', { class: 'mgr-page wide' }, h('header', { class: 'mgr-head' }, h('div', {}, h('h1', {}, 'Calendar'), h('p', { class: 'muted' }, 'Ask the band which dates work, with a poll file and reply codes. No accounts.'), scopeChips(ctx))), tabs, buildAvailability(ctx));
  const counts = Object.fromEntries(Object.keys(KIND).map((k) => [k, items.filter((x) => x.kind === k && x.date.slice(0, 7) === ui.month.slice(0, 7)).length]));
  return h(
    'div',
    { class: 'mgr-page wide' },
    h(
      'header',
      { class: 'mgr-head' },
      h('div', {}, h('h1', {}, all ? 'Calendar · all artists' : 'Calendar'), h('p', { class: 'muted' }, 'Shows, releases, shoots, your own events, posts and to-dos in one place. Click a day to add an event.'), scopeChips(ctx)),
      h('div', { class: 'row' }, all ? null : button('Add event', () => addOn(ui.month.slice(0, 7) === today.slice(0, 7) ? today : ui.month), { iconName: 'plus', variant: 'sm primary', title: 'A rehearsal, meeting, travel day or anything else' }), button('Export PDF', pdf, { iconName: 'print', variant: 'sm', title: 'This month as a printable list' }), button('Download for my calendar (.ics)', exportICS, { iconName: 'calendar', variant: 'sm', title: 'Import into Google Calendar, Apple Calendar or Outlook' })),
    ),
    tabs,
    ui.draft ? eventForm(ctx) : null,
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
        // click a day's empty space (or its +) to add an event on it
        const cell = h(
          'div',
          { class: `mgr-cal-d${out ? ' out' : ''}${d === today ? ' today' : ''}`, role: 'gridcell', 'aria-label': niceDate(d), onclick: (e) => !all && (e.target === cell || e.target.classList.contains('mgr-cal-n')) && addOn(d) },
          h('span', { class: 'mgr-cal-n' }, String(+d.slice(8))),
          all ? null : h('button', { type: 'button', class: 'mgr-cal-add', 'aria-label': `Add an event on ${niceDate(d)}`, title: 'Add an event', onclick: () => addOn(d) }, icon('plus', 12)),
          list.slice(0, 4).map((it) => h('button', { type: 'button', class: `mgr-cal-item ${it.kind}${it.evKind ? ` ev-${it.evKind}` : ''}`, title: `${all ? `${it.artist} · ` : ''}${kindOf(it.kind)[1]}: ${it.title}${it.sub ? ` · ${it.sub}` : ''}`, onclick: () => openItem(ctx, it) }, all ? h('b', { class: 'mgr-cal-who', 'aria-hidden': 'true' }, (it.artist || '?')[0].toUpperCase()) : null, icon(kindOf(it.kind)[0], 11), h('span', {}, all ? `${it.artist}: ${it.title}` : it.title))),
          list.length > 4 ? h('span', { class: 'muted tiny' }, `+${list.length - 4} more`) : null,
        );
        return cell;
      }),
    ),
    h('p', { class: 'muted tiny' }, `The .ics file holds everything from ${niceDate(addDays(today, -30), { weekday: false })} on. Shows use your set time, shoots the call time; the rest are all-day. Import it again after changes (most calendars update matching items).`),
  );
}
