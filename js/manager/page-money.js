// Money: what came in and went out (the ledger plus every show's settlement), by category and
// month, and each release's spend against its budget.
import { h, button, iconButton, download, toast } from '../dom.js';
import { exportPDF } from './pdf.js';
import { moneyHTML } from './docs.js';
import { niceDate } from './model.js';
import { MONEY_CATS, newEntry, moneyLines, moneySummary, releaseSpend } from './extras.js';

export const moneyUI = { year: '' };
const $ = (v) => `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const catLabel = (k) => (MONEY_CATS.find(([v]) => v === k) || [k, 'Other'])[1];

export function buildMoney(ctx) {
  const m = ctx.store.get();
  const f = ctx.form;
  const ui = moneyUI;
  const lines = moneyLines(m);
  const years = [...new Set(lines.map((e) => (e.date || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  if (!ui.year) ui.year = ctx.today().slice(0, 4);
  const range = ui.year === 'all' ? {} : { from: `${ui.year}-01-01`, to: `${ui.year}-12-31` };
  const sum = moneySummary(lines, range);
  const yearSel = h('select', { 'aria-label': 'Year' }, [...new Set([ctx.today().slice(0, 4), ...years])].map((y) => h('option', { value: y, selected: ui.year === y }, y)), h('option', { value: 'all', selected: ui.year === 'all' }, 'All time'));
  yearSel.addEventListener('change', () => ((ui.year = yearSel.value), ctx.go('money')));
  const E = (id, fn) => (d, v) => {
    const x = d.money.find((y) => y.id === id);
    if (x) fn(x, v);
  };
  const add = (kind) => ctx.update((d) => d.money.unshift(newEntry(kind, ctx.today())));
  const csv = () => {
    const rows = [['Date', 'In/Out', 'Category', 'Amount', 'Note', 'From'], ...lines.map((e) => [e.date, e.kind === 'income' ? 'in' : 'out', catLabel(e.category), e.amount, e.note || '', e.from])];
    download(new Blob([rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' }), `band-money-${ui.year}.csv`);
  };
  const pdf = () => {
    const inYear = lines.filter((e) => ui.year === 'all' || (e.date || '').startsWith(ui.year)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    exportPDF(moneyHTML({ band: m.band, year: ui.year, lines: inYear, sum, catLabel }), `${m.band.name || 'Band'} money ${ui.year}`);
    toast('Pick “Save as PDF” as the printer to get a PDF.');
  };
  const maxMonth = Math.max(1, ...sum.byMonth.map(([, i, x]) => Math.max(i, x)));
  const ledger = m.money.filter((e) => ui.year === 'all' || (e.date || '').startsWith(ui.year));
  const shows = lines.filter((e) => e.from === 'show' && (ui.year === 'all' || (e.date || '').startsWith(ui.year)));
  const songs = m.songs.map((s) => ({ s, ...releaseSpend(m, s) })).filter((x) => x.budget || x.spent);

  return h(
    'div',
    { class: 'mgr-page wide' },
    h(
      'header',
      { class: 'mgr-head' },
      h('div', {}, h('h1', {}, 'Money'), h('p', { class: 'muted' }, 'Show pay, merch, streaming and what you spend, so you know what the band can afford next.')),
      h('div', { class: 'row' }, yearSel, button('Download CSV', csv, { iconName: 'download', variant: 'sm' }), button('Export PDF', pdf, { iconName: 'print', variant: 'sm' }), button('Money in', () => add('income'), { iconName: 'plus', variant: 'sm' }), button('Money out', () => add('expense'), { iconName: 'plus', variant: 'sm primary' })),
    ),
    h(
      'div',
      { class: 'mgr-cards' },
      h('div', { class: 'mgr-card stat' }, h('span', { class: 'mgr-card-k' }, 'In'), h('strong', { class: 'ok' }, $(sum.income))),
      h('div', { class: 'mgr-card stat' }, h('span', { class: 'mgr-card-k' }, 'Out'), h('strong', {}, $(sum.expense))),
      h('div', { class: 'mgr-card stat' }, h('span', { class: 'mgr-card-k' }, 'Net'), h('strong', { class: sum.net >= 0 ? 'ok' : 'bad' }, $(sum.net))),
    ),
    h(
      'div',
      { class: 'mgr-cols' },
      h(
        'section',
        { class: 'mgr-sect' },
        h('h2', {}, `Ledger · ${ledger.length}`),
        ledger.length
          ? h(
              'table',
              { class: 'mgr-table' },
              h('thead', {}, h('tr', {}, ['Date', 'In / out', 'Category', 'Amount', 'For', 'Note', ''].map((x) => h('th', {}, x)))),
              h(
                'tbody',
                {},
                ledger.map((e) =>
                  h(
                    'tr',
                    {},
                    h('td', {}, f.text(`md-${e.id}`, '', e.date, E(e.id, (x, v) => (x.date = v)), { type: 'date' })),
                    h('td', {}, f.select(`mk-${e.id}`, '', e.kind, [['income', 'In'], ['expense', 'Out']], E(e.id, (x, v) => (x.kind = v)))),
                    h('td', {}, f.select(`mc-${e.id}`, '', e.category, MONEY_CATS, E(e.id, (x, v) => (x.category = v)))),
                    h('td', {}, f.text(`ma-${e.id}`, '', e.amount, E(e.id, (x, v) => (x.amount = v)), { type: 'number', placeholder: '$' })),
                    h('td', {}, f.select(`ms-${e.id}`, '', e.songId || '', [['', '—'], ...m.songs.map((s) => [s.id, s.title])], E(e.id, (x, v) => (x.songId = v)))),
                    h('td', {}, f.text(`mn-${e.id}`, '', e.note, E(e.id, (x, v) => (x.note = v)), { placeholder: 'What for' })),
                    h('td', {}, iconButton('trash', 'Delete this line', () => ctx.update((d) => (d.money = d.money.filter((x) => x.id !== e.id))), 'ghost')),
                  ),
                ),
              ),
            )
          : h('p', { class: 'muted small' }, 'Nothing in the ledger for this year. Add money in or out above.'),
        shows.length ? h('div', {}, h('h3', { class: 'mgr-h3' }, 'From show settlements'), h('ul', { class: 'mgr-facts' }, shows.map((e) => h('li', {}, h('button', { type: 'button', class: 'link', onclick: () => ctx.go('shows', e.showId) }, `${niceDate(e.date, { weekday: false })} · ${e.note} · ${catLabel(e.category)}`), h('span', { class: e.kind === 'income' ? 'ok' : '' }, `${e.kind === 'income' ? '+' : '−'}${$(e.amount)}`))))) : null,
      ),
      h(
        'div',
        {},
        h(
          'section',
          { class: 'mgr-sect' },
          h('h2', {}, 'By category'),
          sum.byCat.length ? h('ul', { class: 'mgr-facts' }, sum.byCat.map(([k, i, x]) => h('li', {}, h('span', {}, catLabel(k)), h('span', {}, i ? h('span', { class: 'ok' }, `+${$(i)} `) : null, x ? `−${$(x)}` : null)))) : h('p', { class: 'muted small' }, 'No money lines yet.'),
        ),
        sum.byMonth.length
          ? h(
              'section',
              { class: 'mgr-sect' },
              h('h2', {}, 'By month'),
              h('div', { class: 'mgr-months' }, sum.byMonth.map(([k, i, x]) => h('div', { class: 'mgr-month-row' }, h('span', { class: 'muted tiny' }, k), h('span', { class: 'mgr-mbar in', style: { width: `${(100 * i) / maxMonth}%` }, title: `In ${$(i)}` }), h('span', { class: 'mgr-mbar out', style: { width: `${(100 * x) / maxMonth}%` }, title: `Out ${$(x)}` }), h('span', { class: `tiny ${i - x >= 0 ? 'ok' : 'bad'}` }, $(i - x))))),
            )
          : null,
        h(
          'section',
          { class: 'mgr-sect' },
          h('h2', {}, 'Release budgets'),
          songs.length
            ? h('ul', { class: 'mgr-facts' }, songs.map(({ s, spent, budget, left }) => h('li', {}, h('button', { type: 'button', class: 'link', onclick: () => ctx.go('songs', s.id, 'shoot') }, `“${s.title}”`), h('span', { class: left != null && left < 0 ? 'bad' : '' }, budget ? `${$(spent)} of ${$(budget)}${left != null ? ` · ${left >= 0 ? `${$(left)} left` : `${$(-left)} over`}` : ''}` : `${$(spent)} spent`))))
            : h('p', { class: 'muted small' }, 'Set a budget on a song’s Video shoot tab and tag spending with the song (“For”) to track it here.'),
        ),
      ),
    ),
  );
}
