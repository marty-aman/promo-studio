// Home → This week: the weekly plan (weekplan.js) with week navigation and Export PDF.
import { h, icon, button, toast } from '../dom.js';
import { niceDate, addDays, daysBetween } from './model.js';
import { weekStartOf, weekPlan, mergePlans, weekHTML, lateWhat } from './weekplan.js';
import { viewOf } from './artists.js';
import { exportPDF } from './pdf.js';

/** The week shown (not saved; '' = the week holding today). */
export const weekUI = { start: '' };
const KIND = { show: ['ticket', 'Show'], release: ['disc', 'Release'], shoot: ['film', 'Shoot'], post: ['share', 'Post'], task: ['check', 'Task'], event: ['calendar', 'Event'] };
const kindOf = (k) => KIND[k] || KIND.task;

/** The plan for the shown week, for this artist or (All artists) every artist. */
export function shownPlan(ctx, start, today) {
  const all = ctx.combined && ctx.artists().length > 1;
  if (!all) return { all, plan: weekPlan(ctx.store.get(), start, today) };
  const ws = ctx.workspace();
  return { all, plan: mergePlans(ws.artists.map((a) => ({ artistId: a.id, artist: a.band.name || 'Artist', plan: weekPlan(viewOf(ws, a.id), start, today) })), today) };
}

export function weekTab(ctx, { openItem }) {
  const m = ctx.store.get();
  const today = ctx.today();
  const now = weekStartOf(today);
  const start = weekUI.start || now;
  const { all, plan } = shownPlan(ctx, start, today);
  const go = (s) => ((weekUI.start = s === now ? '' : s), ctx.setTab('week'));
  const who = (it) => (all && it.artist ? `${it.artist} · ` : '');
  const open = (it) => it && it.ref && openItem(ctx, it);

  const list = (items, empty) =>
    items.length
      ? h(
          'ul',
          { class: 'mgr-plan-list' },
          items.map((it) => h('li', {}, h('button', { type: 'button', class: `mgr-item ${it.kind}${it.date < today ? ' past' : ''}`, onclick: () => open(it) }, h('span', { class: 'mgr-plan-day' }, niceDate(it.date)), h('span', { class: 'mgr-kind' }, icon(kindOf(it.kind)[0], 14), kindOf(it.kind)[1]), h('span', { class: 'mgr-item-t' }, it.title), h('span', { class: 'muted tiny' }, `${who(it)}${it.sub || ''}`)))),
        )
      : h('p', { class: 'muted small' }, empty);

  const bestLine = (() => {
    const one = (b, name) => (b ? `${name ? `${name}: ` : ''}${b.key} (${b.n} post${b.n === 1 ? '' : 's'}${b.small ? ', a hint only' : ''})` : '');
    const text = Array.isArray(plan.best) ? plan.best.map((x) => one(x.best, x.artist)).filter(Boolean).join(' · ') : one(plan.best);
    return h('p', { class: 'small mgr-plan-best', 'data-k': 'plan-best' }, icon('chart', 14), text ? `Best type of post so far: ${text}.` : 'Not enough post stats to say which type works best yet (add stats on the Content page).');
  })();

  const lateBox = plan.late.length
    ? h(
        'div',
        { class: 'mgr-plan-late' },
        h('h3', { class: 'mgr-h3' }, `Late · ${plan.late.length}`),
        h('ul', { class: 'mgr-plan-list' }, plan.late.slice(0, 6).map((x) => h('li', { class: 'small' }, `${all && x.artist ? `${x.artist} · ` : ''}${x.task.text}${lateWhat(x) ? ` · ${lateWhat(x)}` : ''} · due ${niceDate(x.due, { weekday: false })}`))),
        plan.late.length > 6 ? h('p', { class: 'muted tiny' }, `And ${plan.late.length - 6} more on the Overview tab.`) : null,
      )
    : null;

  const pdf = () => {
    const title = `${all ? 'All artists' : m.band.name || 'Band'} · week of ${niceDate(start, { weekday: false })}`;
    exportPDF(weekHTML(plan, { title }), title);
    toast('Pick “Save as PDF” as the printer to get a PDF.');
  };
  const rel = daysBetween(now, start) / 7;
  const sect = (cls, ic, title, ...body) => h('section', { class: `mgr-sect mgr-plan-sect ${cls}` }, h('h2', {}, icon(ic, 16), title), ...body);

  return h(
    'div',
    { class: 'mgr-plan' },
    h(
      'div',
      { class: 'mgr-plan-nav row' },
      button('Previous week', () => go(addDays(start, -7)), { iconName: 'arrowLeft', variant: 'sm ghost' }),
      h('strong', { class: 'mgr-plan-range', 'data-k': 'plan-range' }, `${niceDate(plan.from)} to ${niceDate(plan.to)}`, h('span', { class: 'muted tiny' }, rel === 0 ? ' · this week' : rel === 1 ? ' · next week' : rel === -1 ? ' · last week' : rel > 0 ? ` · in ${rel} weeks` : ` · ${-rel} weeks ago`)),
      button('Next week', () => go(addDays(start, 7)), { iconName: 'arrowRight', variant: 'sm ghost' }),
      rel !== 0 ? button('This week', () => go(now), { variant: 'sm' }) : null,
      button('Export PDF', pdf, { iconName: 'print', variant: 'sm', title: 'This week as a printable page' }),
    ),
    h('div', { class: 'mgr-plan-first', 'data-k': 'plan-first', role: 'note' }, h('strong', {}, 'Do this first: '), plan.first.item && plan.first.item.ref ? h('button', { type: 'button', class: 'link', onclick: () => open(plan.first.item) }, plan.first.text) : h('span', {}, plan.first.text)),
    lateBox,
    h(
      'div',
      { class: 'mgr-plan-grid' },
      sect('posts', 'share', `What to post · ${plan.posts.length}`, list(plan.posts, 'No posts planned this week. Plan them from a song’s release date on the Content page.'), bestLine),
      sect('contacts', 'users', `Who to contact · ${plan.contacts.length}`, list(plan.contacts, 'Nobody to follow up with this week.'), h('p', { class: 'muted tiny' }, 'Follow-ups, pitches and press steps from your songs, shows and releases. Nothing is sent from here.')),
      sect('dated', 'calendar', `Shows and deadlines · ${plan.dated.length + plan.tasks.length}`, list([...plan.dated, ...plan.tasks].sort((a, b) => a.date.localeCompare(b.date)), 'No shows, releases or deadlines this week.')),
    ),
    h('p', { class: 'muted tiny' }, 'Made from what is in Band Manager: dates, checklists, follow-ups and post stats you added. It has no live data from the apps and does not update by itself.'),
  );
}
