// Money page tabs: Merch (stock, sales at shows, restocks, reorder points) and Releases (spent vs
// earned per song, EP and album). The data lives in the artist's `merch` list and the ledger.
import { h, button, iconButton, toast } from '../dom.js';
import { exportPDF } from './pdf.js';
import { niceDate } from './model.js';
import { releaseMoney } from './extras.js';
import { releasesHTML, paidOffText } from './releasemoney.js';
import { MERCH_KINDS, newMerchItem, normalizeMerch, itemStats, sellMerch, undoSale, restockMerch, setMerchKind, setSizeList, stockLeft, unitCost, cents } from './merch.js';

/** Form state that isn't data yet (the quick sale and restock forms). */
export const merchUI = { showId: null, itemId: '', size: '', qty: '1', price: '', date: '', restockFor: '', rQty: '', rSize: '', rCost: '', rDate: '', showRetired: false };
const $ = (v) => `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: Math.round(Math.abs(v) * 100) % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const kindLabel = (k) => (MERCH_KINDS.find(([v]) => v === k) || ['', 'Other'])[1];
const showLabel = (s) => `${s.date ? niceDate(s.date, { weekday: false }) : 'No date'} · ${s.venue || 'Show'}`;

/** A plain input bound to merchUI (not saved until the form's button is pressed). */
function uiInput(key, { type = 'text', placeholder = '', aria, min = null, step = null }) {
  const el = h('input', { type, placeholder, value: merchUI[key] ?? '', 'aria-label': aria, 'data-k': `mui-${key}`, min, step });
  el.addEventListener('input', () => (merchUI[key] = el.value));
  return el;
}
function uiSelect(key, options, aria, onChange = null) {
  const el = h('select', { 'aria-label': aria, 'data-k': `mui-${key}` }, options.map(([v, l]) => h('option', { value: v, selected: v === merchUI[key] }, l)));
  el.addEventListener('change', () => ((merchUI[key] = el.value), onChange && onChange(el.value)));
  return el;
}

export function buildMerchTab(ctx) {
  const m = ctx.store.get();
  const f = ctx.form;
  const today = ctx.today();
  const ui = merchUI;
  const items = normalizeMerch(m.merch);
  const active = items.filter((x) => !x.retired);
  const retired = items.filter((x) => x.retired);
  const U = (id, fn) => (d, v) => {
    d.merch = normalizeMerch(d.merch);
    const x = d.merch.find((y) => y.id === id);
    if (x) fn(x, v);
  };
  const change = (id, fn) => ctx.update(U(id, fn));
  const shows = m.shows.filter((s) => s.status !== 'cancelled').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (ui.showId === null) ui.showId = (shows.find((s) => s.date && s.date <= today) || { id: '' }).id;
  if (!active.some((x) => x.id === ui.itemId)) ui.itemId = active[0] ? active[0].id : '';
  const item = active.find((x) => x.id === ui.itemId);
  // the size picked last time, unless it's gone or sold out: then the first size still in stock
  if (item && item.sizes && !(item.sizes[ui.size] > 0)) ui.size = Object.keys(item.sizes).find((k) => item.sizes[k] > 0) || (ui.size in item.sizes ? ui.size : Object.keys(item.sizes)[0]);
  const saleDate = () => ui.date || (m.shows.find((s) => s.id === ui.showId) || {}).date || today;

  const sell = () => {
    if (!item) return toast('Add an item first.', 'warn');
    const sale = { date: saleDate(), showId: ui.showId || '', qty: ui.qty, size: ui.size, price: ui.price };
    const check = sellMerch(structuredClone(item), sale); // try it first: a refused sale changes nothing
    if (!check.ok) return toast(check.error, 'warn');
    ctx.update(U(item.id, (x) => sellMerch(x, sale)));
    ui.qty = '1';
    ui.price = '';
    toast(`Logged ${check.sale.qty} × ${item.name || 'item'}${check.sale.size ? ` (${check.sale.size})` : ''}.`);
  };
  const restock = (it) => {
    const add = { date: ui.rDate || today, qty: ui.rQty, size: ui.rSize || (it.sizes ? Object.keys(it.sizes)[0] : ''), cost: ui.rCost };
    const check = restockMerch(structuredClone(it), add);
    if (!check.ok) return toast(check.error, 'warn');
    Object.assign(ui, { restockFor: '', rQty: '', rCost: '', rDate: '' });
    ctx.update(U(it.id, (x) => restockMerch(x, add)));
    toast(`Added ${check.restock.qty} to stock${check.restock.cost ? `, ${$(check.restock.cost)} in Money` : ''}.`);
  };
  const remove = (it) => {
    if ((it.sold.length || it.restocks.length) && !confirm(`Delete “${it.name || 'this item'}” with its ${it.sold.length} sale${it.sold.length === 1 ? '' : 's'} and ${it.restocks.length} restock${it.restocks.length === 1 ? '' : 's'}? Money loses them too. Retire it instead to keep the history.`)) return;
    ctx.update((d) => (d.merch = normalizeMerch(d.merch).filter((x) => x.id !== it.id)));
  };

  const totals = active.reduce((a, it) => {
    const s = itemStats(it);
    return { left: a.left + s.left, revenue: a.revenue + s.revenue, profit: a.profit + s.profit, low: a.low + (s.low ? 1 : 0) };
  }, { left: 0, revenue: 0, profit: 0, low: 0 });
  for (const it of retired) {
    const s = itemStats(it);
    totals.revenue += s.revenue;
    totals.profit += s.profit;
  }

  const stockCell = (it) =>
    it.sizes
      ? h('div', { class: 'mgr-merch-sizes' }, Object.entries(it.sizes).map(([k, n], i) => h('label', { class: `mgr-merch-size${n === 0 ? ' out' : ''}` }, h('span', {}, k), f.text(`mi-size-${it.id}-${i}`, '', n, U(it.id, (x, v) => (x.sizes[k] = Math.max(0, Math.floor(+v || 0)))), { type: 'number', aria: `${it.name || 'Item'} size ${k} in stock` }))))
      : f.text(`mi-qty-${it.id}`, '', it.qty, U(it.id, (x, v) => (x.qty = Math.max(0, Math.floor(+v || 0)))), { type: 'number', aria: `${it.name || 'Item'} in stock` });

  const restockRow = (it) =>
    h(
      'tr',
      { class: 'mgr-merch-restock' },
      h(
        'td',
        { colspan: 9 },
        h(
          'div',
          { class: 'mgr-merch-form' },
          h('strong', {}, `New stock for ${it.name || 'this item'}`),
          h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'How many'), uiInput('rQty', { type: 'number', aria: 'How many came in', min: 1, step: 1 })),
          it.sizes ? h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Size'), uiSelect('rSize', Object.keys(it.sizes).map((k) => [k, k]), 'Size of the new stock')) : null,
          h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Total cost ($)'), uiInput('rCost', { type: 'number', placeholder: unitCost(it) ? `${cents(unitCost(it))} each` : '', aria: 'What this batch cost in total', min: 0, step: 0.01 })),
          h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Date'), uiInput('rDate', { type: 'date', aria: 'When it came in' })),
          button('Add to stock', () => restock(it), { iconName: 'plus', variant: 'sm primary' }),
          button('Cancel', () => ((ui.restockFor = ''), ctx.refresh()), { variant: 'sm ghost' }),
          h('p', { class: 'muted tiny' }, 'The cost goes into Money as merch spending on that date. Blank cost: how many × the cost per piece. Don’t also type it into the ledger.'),
        ),
      ),
    );

  const itemRow = (it) => {
    const s = itemStats(it);
    return h(
      'tr',
      { class: `${it.retired ? 'mgr-merch-retired' : ''}${s.low ? ' mgr-merch-lowrow' : ''}`.trim(), 'data-merch': it.id },
      h('td', {}, f.text(`mi-name-${it.id}`, '', it.name, U(it.id, (x, v) => (x.name = v)), { placeholder: 'Logo shirt', aria: 'Item name' }), s.low ? h('span', { class: 'mgr-merch-flag', title: 'At or below the reorder point' }, 'Low stock') : null),
      h('td', {}, f.select(`mi-kind-${it.id}`, '', it.kind, MERCH_KINDS, U(it.id, (x, v) => setMerchKind(x, v)), { aria: `Kind: ${it.name || 'item'}` }), it.sizes ? f.text(`mi-sizes-${it.id}`, '', Object.keys(it.sizes).join(', '), U(it.id, (x, v) => setSizeList(x, v)), { aria: `Sizes: ${it.name || 'item'}`, placeholder: 'S, M, L' }) : null),
      h('td', { class: 'n' }, f.text(`mi-price-${it.id}`, '', it.price, U(it.id, (x, v) => (x.price = v)), { type: 'number', placeholder: '$', aria: `Price: ${it.name || 'item'}` })),
      h('td', { class: 'n' }, f.text(`mi-cost-${it.id}`, '', it.cost, U(it.id, (x, v) => (x.cost = v)), { type: 'number', placeholder: '$', aria: `Cost per piece: ${it.name || 'item'}` })),
      h('td', {}, stockCell(it), h('span', { class: 'muted tiny' }, `${s.left} left`)),
      h('td', { class: 'n' }, f.text(`mi-reorder-${it.id}`, '', it.reorderAt, U(it.id, (x, v) => (x.reorderAt = v === '' ? '' : Math.max(0, Math.floor(+v || 0)))), { type: 'number', placeholder: '—', aria: `Reorder at: ${it.name || 'item'}` })),
      h('td', { class: 'n' }, `${s.soldQty}`, h('span', { class: 'muted tiny' }, $(s.revenue))),
      h('td', { class: `n ${s.profit >= 0 ? 'ok' : 'bad'}` }, $(s.profit)),
      h(
        'td',
        { class: 'mgr-merch-acts' },
        it.retired ? null : button('Add stock', () => ((ui.restockFor = ui.restockFor === it.id ? '' : it.id), (ui.rSize = it.sizes ? Object.keys(it.sizes)[0] : ''), ctx.refresh()), { variant: 'sm' }),
        button(it.retired ? 'Bring back' : 'Retire', () => change(it.id, (x) => (x.retired = !x.retired)), { variant: 'sm ghost', title: it.retired ? 'Sell this again' : 'Stop selling it: no reorder reminder, kept in the history' }),
        iconButton('trash', `Delete ${it.name || 'this item'}`, () => remove(it), 'ghost'),
      ),
    );
  };
  const table = (list) =>
    h(
      'div',
      { class: 'mgr-table-wrap' },
      h(
        'table',
        { class: 'mgr-table mgr-merch-table' },
        h('thead', {}, h('tr', {}, ['Item', 'Kind', 'Price', 'Cost each', 'In stock', 'Reorder at', 'Sold', 'Profit', ''].map((x, i) => h('th', { class: [2, 3, 5, 6, 7].includes(i) ? 'n' : null }, x)))),
        h('tbody', {}, list.flatMap((it) => [itemRow(it), ui.restockFor === it.id ? restockRow(it) : null])),
      ),
    );

  const sales = items.flatMap((it) => it.sold.map((r) => ({ it, r }))).sort((a, b) => (b.r.date || '').localeCompare(a.r.date || '')).slice(0, 15);
  const showOf = (id) => m.shows.find((s) => s.id === id);

  return h(
    'div',
    { class: 'mgr-merch' },
    h(
      'div',
      { class: 'mgr-cards' },
      h('div', { class: 'mgr-card stat' }, h('span', { class: 'mgr-card-k' }, 'In stock'), h('strong', {}, `${totals.left}`), h('span', { class: 'muted tiny' }, `${active.length} item${active.length === 1 ? '' : 's'}`)),
      h('div', { class: 'mgr-card stat' }, h('span', { class: 'mgr-card-k' }, 'Merch sold'), h('strong', { class: 'ok' }, $(cents(totals.revenue)))),
      h('div', { class: 'mgr-card stat', title: 'Money taken minus what the pieces sold cost' }, h('span', { class: 'mgr-card-k' }, 'Profit'), h('strong', { class: totals.profit >= 0 ? 'ok' : 'bad' }, $(cents(totals.profit)))),
      totals.low ? h('div', { class: 'mgr-card stat' }, h('span', { class: 'mgr-card-k' }, 'Low stock'), h('strong', { class: 'bad' }, `${totals.low}`), h('span', { class: 'muted tiny' }, 'a reorder reminder is on Home and the Calendar')) : null,
    ),
    active.length
      ? h(
          'section',
          { class: 'mgr-sect mgr-merch-sell' },
          h('h2', {}, 'Sell at a show'),
          h(
            'div',
            { class: 'mgr-merch-form' },
            h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Show'), uiSelect('showId', [['', 'No show (online, mail order)'], ...shows.map((s) => [s.id, showLabel(s)])], 'Show', () => ((ui.date = ''), ctx.refresh()))),
            h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Item'), uiSelect('itemId', active.map((x) => [x.id, `${x.name || kindLabel(x.kind)} (${stockLeft(x)} left)`]), 'Item', () => ((ui.price = ''), ctx.refresh()))),
            item && item.sizes ? h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Size'), uiSelect('size', Object.entries(item.sizes).map(([k, n]) => [k, `${k} (${n})`]), 'Size')) : null,
            h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'How many'), uiInput('qty', { type: 'number', aria: 'How many sold', min: 1, step: 1 })),
            h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Price each ($)'), uiInput('price', { type: 'number', placeholder: item && item.price !== '' ? String(item.price) : '', aria: 'Price each', min: 0, step: 0.01 })),
            h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Date'), (() => {
              const el = uiInput('date', { type: 'date', aria: 'Sale date' });
              if (!el.value) el.value = saleDate();
              return el;
            })()),
            button('Log sale', sell, { iconName: 'check', variant: 'sm primary' }),
          ),
          h('p', { class: 'muted tiny' }, 'Sales logged for a show replace that show’s “Merch sales” number in Money (never on top of it), and count once the show is played. Sales with no show count on their date.'),
        )
      : null,
    h(
      'section',
      { class: 'mgr-sect' },
      h('div', { class: 'mgr-sect-head row' }, h('h2', {}, `Stock · ${active.length}`), button('Add item', () => ctx.update((d) => (d.merch = [newMerchItem('shirt', today), ...normalizeMerch(d.merch)])), { iconName: 'plus', variant: 'sm primary' })),
      active.length ? table(active) : h('p', { class: 'muted small' }, 'No merch yet. Add an item, then “Add stock” when a batch arrives so its cost lands in Money.'),
      retired.length
        ? h('div', {}, button(ui.showRetired ? `Hide retired (${retired.length})` : `Show retired (${retired.length})`, () => ((ui.showRetired = !ui.showRetired), ctx.refresh()), { variant: 'sm ghost' }), ui.showRetired ? table(retired) : null)
        : null,
      h('p', { class: 'muted tiny' }, 'Stored only in this browser. Counts are what you type and log here; nothing syncs with a web shop or card reader. Typing a stock number fixes a miscount and doesn’t touch Money.'),
    ),
    sales.length
      ? h(
          'section',
          { class: 'mgr-sect' },
          h('h2', {}, 'Recent sales'),
          h(
            'ul',
            { class: 'mgr-facts mgr-merch-sales' },
            sales.map(({ it, r }) =>
              h(
                'li',
                {},
                h('span', {}, `${r.date ? niceDate(r.date, { weekday: false }) : ''} · ${it.name || kindLabel(it.kind)} ×${r.qty}${r.size ? ` (${r.size})` : ''}${showOf(r.showId) ? ` · ${showOf(r.showId).venue || 'show'}` : ''}`),
                h('span', {}, h('strong', { class: 'ok' }, $(cents(r.qty * r.price))), iconButton('undo', 'Take this sale back (puts it back in stock)', () => change(it.id, (x) => undoSale(x, r.id)), 'ghost')),
              ),
            ),
          ),
        )
      : null,
  );
}

export function buildReleasesTab(ctx) {
  const m = ctx.store.get();
  const today = ctx.today();
  const data = releaseMoney(m, today);
  const all = [...data.releases, ...data.songs];
  const sum = (k) => cents(all.reduce((a, x) => a + x[k], 0));
  const pdf = () => {
    exportPDF(releasesHTML({ band: m.band, data, today }), `${m.band.name || 'Band'} releases spent vs earned`);
    toast('Pick “Save as PDF” as the printer to get a PDF.');
  };
  const status = (x) => h('span', { class: `mgr-merch-paid${x.paidOff ? ' ok' : ''}` }, paidOffText(x));
  const cells = (x) => [h('td', { class: 'n' }, x.budget ? $(x.budget) : '—'), h('td', { class: 'n' }, $(x.spent)), h('td', { class: 'n ok' }, $(x.earned)), h('td', { class: `n ${x.net >= 0 ? 'ok' : 'bad'}` }, $(x.net)), h('td', {}, status(x))];
  const head = h('thead', {}, h('tr', {}, ['Release', 'Budget', 'Spent', 'Earned', 'Net', ''].map((x, i) => h('th', { class: i && i < 5 ? 'n' : null }, x))));
  const songCell = (s, x) => h('td', {}, h('button', { type: 'button', class: 'link', onclick: () => ctx.go('songs', s.id, 'shoot') }, `“${s.title}”`), x.streamingFrom ? h('span', { class: 'muted tiny' }, x.streamingFrom === 'imports' ? `${$(x.streaming)} streaming (imported)` : `${$(x.streaming)} streaming (ledger)`) : null);
  return h(
    'div',
    { class: 'mgr-merch' },
    h(
      'div',
      { class: 'mgr-cards' },
      h('div', { class: 'mgr-card stat' }, h('span', { class: 'mgr-card-k' }, 'Spent on releases'), h('strong', {}, $(sum('spent')))),
      h('div', { class: 'mgr-card stat' }, h('span', { class: 'mgr-card-k' }, 'Earned'), h('strong', { class: 'ok' }, $(sum('earned')))),
      h('div', { class: 'mgr-card stat' }, h('span', { class: 'mgr-card-k' }, 'Net'), h('strong', { class: sum('net') >= 0 ? 'ok' : 'bad' }, $(sum('net'))), h('span', { class: 'muted tiny' }, `${all.filter((x) => x.paidOff).length} of ${all.length} paid off`)),
    ),
    h(
      'section',
      { class: 'mgr-sect' },
      h('div', { class: 'mgr-sect-head row' }, h('h2', {}, 'Spent vs earned'), button('Export PDF', pdf, { iconName: 'print', variant: 'sm' })),
      data.releases.length
        ? h(
            'div',
            { class: 'mgr-table-wrap' },
            h('h3', { class: 'mgr-h3' }, 'EPs and albums'),
            h(
              'table',
              { class: 'mgr-table mgr-rel-money' },
              head.cloneNode(true),
              h(
                'tbody',
                {},
                data.releases.flatMap((r) => [
                  h('tr', { class: 'mgr-rel-row' }, h('td', {}, h('button', { type: 'button', class: 'link', onclick: () => ctx.go('releases', r.rel.id) }, r.rel.title || 'Release'), r.ownSpent || r.ownEarned ? h('span', { class: 'muted tiny' }, `tagged to the release: ${$(r.ownSpent)} out, ${$(r.ownEarned)} in`) : null), ...cells(r)),
                  ...r.tracks.filter((t) => t.spent || t.earned || t.budget).map((t) => h('tr', { class: 'mgr-rel-track' }, songCell(t.song, t), ...cells(t))),
                ]),
              ),
            ),
          )
        : null,
      data.songs.length ? h('div', { class: 'mgr-table-wrap' }, h('h3', { class: 'mgr-h3' }, data.releases.length ? 'Songs' : 'Songs and singles'), h('table', { class: 'mgr-table mgr-rel-money' }, head.cloneNode(true), h('tbody', {}, data.songs.map((x) => h('tr', {}, songCell(x.song, x), ...cells(x)))))) : null,
      all.length ? null : h('p', { class: 'muted small' }, 'Nothing to show yet. Set a budget on a song’s Video shoot tab, and tag ledger lines “For” a song or release on the Overview tab.'),
      h('p', { class: 'muted tiny' }, 'Budget: the songs’ Video shoot budgets. Spent and earned: ledger lines tagged “For” the song or release, plus streaming earnings from reports imported on Streaming stats. When a song has imported earnings, a ledger “Streaming & sales” line for it is left out so a payout isn’t counted twice. Nothing here is live: re-import a report to update it.'),
    ),
  );
}
