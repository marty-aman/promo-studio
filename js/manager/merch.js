// Merch: items, stock, sales and restocks, kept in the artist's `merch` list. Pure functions, unit tested.
// Item: { id, name, kind, price, cost, sizes: { S: n, … } | null, qty, reorderAt, notes, retired, addedAt,
//         sold: [{ id, date, showId, qty, size, price }], restocks: [{ id, date, qty, size, cost }] }
// `sizes` (shirts, hoodies) or `qty` (everything else) is the stock on hand right now: a sale takes from
// it and a restock adds to it. A restock's `cost` is what that batch cost in total (it goes into Money
// as merch spending); the item's `cost` is the cost of one piece, used for profit per item.
import { mid, isoDate, registerAgendaSource } from './model.js';

export const MERCH_KINDS = [['shirt', 'T-shirt'], ['hoodie', 'Hoodie'], ['vinyl', 'Vinyl'], ['cd', 'CD'], ['sticker', 'Sticker'], ['patch', 'Patch'], ['poster', 'Poster'], ['other', 'Other']];
export const SIZED_KINDS = ['shirt', 'hoodie'];
export const DEFAULT_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

const num = (v) => (v === '' || v == null || Number.isNaN(+v) ? 0 : +v);
const count = (v) => Math.max(0, Math.floor(num(v)));
export const cents = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const kindOk = (k) => MERCH_KINDS.some(([v]) => v === k);
const blankSizes = (keys = DEFAULT_SIZES) => Object.fromEntries(keys.map((k) => [k, 0]));

export function newMerchItem(kind = 'shirt', today = isoDate(new Date())) {
  const sized = SIZED_KINDS.includes(kind);
  return { id: mid('merch'), name: '', kind, price: '', cost: '', sizes: sized ? blankSizes() : null, qty: 0, reorderAt: '', notes: '', retired: false, addedAt: today, sold: [], restocks: [] };
}

/** Defaults for anything an older or hand-edited item is missing; unknown fields are kept. */
export function normalizeMerch(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((x) => x && typeof x === 'object' && typeof x.id === 'string')
    .map((x) => {
      const kind = kindOk(x.kind) ? x.kind : 'other';
      const sizes = x.sizes && typeof x.sizes === 'object' && !Array.isArray(x.sizes) ? Object.fromEntries(Object.entries(x.sizes).filter(([k]) => k).map(([k, v]) => [k, count(v)])) : null;
      const rows = (list) => (Array.isArray(list) ? list.filter((r) => r && typeof r === 'object') : []);
      return {
        ...x,
        name: typeof x.name === 'string' ? x.name : '',
        kind,
        sizes: sizes && Object.keys(sizes).length ? sizes : null,
        qty: count(x.qty),
        reorderAt: x.reorderAt === '' || x.reorderAt == null || Number.isNaN(+x.reorderAt) ? '' : count(x.reorderAt),
        notes: typeof x.notes === 'string' ? x.notes : '',
        retired: !!x.retired,
        addedAt: typeof x.addedAt === 'string' ? x.addedAt : '',
        sold: rows(x.sold).map((r, i) => ({ ...r, id: typeof r.id === 'string' ? r.id : `${x.id}-sale${i}`, date: typeof r.date === 'string' ? r.date : '', showId: typeof r.showId === 'string' ? r.showId : '', qty: count(r.qty), size: typeof r.size === 'string' ? r.size : '', price: num(r.price) })).filter((r) => r.qty > 0),
        restocks: rows(x.restocks).map((r, i) => ({ ...r, id: typeof r.id === 'string' ? r.id : `${x.id}-rst${i}`, date: typeof r.date === 'string' ? r.date : '', qty: count(r.qty), size: typeof r.size === 'string' ? r.size : '', cost: num(r.cost) })),
      };
    });
}

export const isSized = (it) => !!it.sizes;
/** Pieces on hand: every size added up, or `qty`. */
export const stockLeft = (it) => (it.sizes ? Object.values(it.sizes).reduce((a, n) => a + count(n), 0) : count(it.qty));
/** At or below the reorder point (and not retired). A blank reorder point never flags. */
export const isLow = (it) => !it.retired && it.reorderAt !== '' && it.reorderAt != null && stockLeft(it) <= count(it.reorderAt);
/** Cost of one piece: the item's own cost, else the average of what the restocks cost. */
export function unitCost(it) {
  if (num(it.cost)) return num(it.cost);
  const q = (it.restocks || []).reduce((a, r) => a + count(r.qty), 0);
  return q ? (it.restocks || []).reduce((a, r) => a + num(r.cost), 0) / q : 0;
}

/** Sold count, money taken, cost of the pieces sold and the profit: { soldQty, revenue, cogs, profit, left, low }. */
export function itemStats(it) {
  const soldQty = (it.sold || []).reduce((a, r) => a + count(r.qty), 0);
  const revenue = cents((it.sold || []).reduce((a, r) => a + count(r.qty) * num(r.price), 0));
  const cogs = cents(soldQty * unitCost(it));
  return { soldQty, revenue, cogs, profit: cents(revenue - cogs), left: stockLeft(it), low: isLow(it) };
}

/**
 * Log a sale and take it off the stock. Returns { ok: true, sale } or { ok: false, error } (nothing
 * changes then). A sized item needs a size; you can't sell more than is on hand.
 */
export function sellMerch(it, { date, showId = '', qty = 1, size = '', price } = {}) {
  const n = count(qty);
  if (!n) return { ok: false, error: 'How many did you sell?' };
  if (it.sizes) {
    if (!(size in it.sizes)) return { ok: false, error: 'Pick a size.' };
    if (it.sizes[size] < n) return { ok: false, error: `Only ${it.sizes[size]} left in ${size}. Fix the stock count first if that’s wrong.` };
  } else if (count(it.qty) < n) return { ok: false, error: `Only ${count(it.qty)} left. Fix the stock count first if that’s wrong.` };
  const sale = { id: mid('sale'), date: date || isoDate(new Date()), showId: showId || '', qty: n, size: it.sizes ? size : '', price: price === '' || price == null ? num(it.price) : num(price) };
  if (it.sizes) it.sizes[size] -= n;
  else it.qty = count(it.qty) - n;
  (it.sold ||= []).push(sale);
  return { ok: true, sale };
}

/** Take a sale back (typo, refund): its pieces go back into stock. */
export function undoSale(it, saleId) {
  const sale = (it.sold || []).find((r) => r.id === saleId);
  if (!sale) return false;
  if (it.sizes) it.sizes[sale.size in it.sizes ? sale.size : Object.keys(it.sizes)[0]] += sale.qty;
  else it.qty = count(it.qty) + sale.qty;
  it.sold = it.sold.filter((r) => r.id !== saleId);
  return true;
}

/** New stock arrived: add it and log what it cost (that cost shows in Money). */
export function restockMerch(it, { date, qty, size = '', cost } = {}) {
  const n = count(qty);
  if (!n) return { ok: false, error: 'How many came in?' };
  if (it.sizes && !(size in it.sizes)) return { ok: false, error: 'Pick a size.' };
  const r = { id: mid('rst'), date: date || isoDate(new Date()), qty: n, size: it.sizes ? size : '', cost: cost === '' || cost == null ? cents(n * num(it.cost)) : num(cost) };
  if (it.sizes) it.sizes[size] += n;
  else it.qty = count(it.qty) + n;
  (it.restocks ||= []).push(r);
  return { ok: true, restock: r };
}

/** Change an item's kind; moving between sized and one-size keeps the count. */
export function setMerchKind(it, kind) {
  const sized = SIZED_KINDS.includes(kind);
  if (sized && !it.sizes) (it.sizes = { ...blankSizes(), M: count(it.qty) }), (it.qty = 0);
  else if (!sized && it.sizes) (it.qty = stockLeft(it)), (it.sizes = null);
  it.kind = kind;
}

/** Set the size list from "S, M, L, XL"; counts of sizes kept stay. */
export function setSizeList(it, text) {
  const keys = [...new Set(String(text || '').split(/[,\s]+/).map((x) => x.trim()).filter(Boolean))].slice(0, 12);
  if (!keys.length) return;
  it.sizes = Object.fromEntries(keys.map((k) => [k, count((it.sizes || {})[k])]));
}

/** What a show's sales add up to (all items): { qty, amount }. */
export function showMerchSales(m, showId) {
  let qty = 0;
  let amount = 0;
  for (const it of normalizeMerch(m.merch)) for (const r of it.sold) if (showId && r.showId === showId) (qty += r.qty), (amount += r.qty * r.price);
  return { qty, amount: cents(amount) };
}

/**
 * Money lines from merch that no show settlement already covers: restocks (merch spending, on the day
 * they came in) and sales not tied to a show you have (online, mail order). Sales at a show are
 * counted through that show instead (extras.js moneyLines), so nothing counts twice.
 */
export function merchMoneyLines(m) {
  const shows = new Set((m.shows || []).map((s) => s.id));
  const out = [];
  for (const it of normalizeMerch(m.merch)) {
    const name = it.name || 'Merch';
    for (const r of it.restocks) if (r.cost > 0) out.push({ id: `${r.id}`, date: r.date, kind: 'expense', category: 'merch', amount: cents(r.cost), songId: '', showId: '', merchId: it.id, from: 'merch', note: `Restock: ${name} ×${r.qty}` });
    for (const r of it.sold) if (!shows.has(r.showId) && r.qty * r.price > 0) out.push({ id: `${r.id}`, date: r.date, kind: 'income', category: 'merch', amount: cents(r.qty * r.price), songId: '', showId: '', merchId: it.id, from: 'merch', note: `${name} ×${r.qty}${r.size ? ` (${r.size})` : ''}` });
  }
  return out;
}

/** The day an item last changed (last sale or restock, else when it was added): when its reorder reminder is dated. */
export function lastMoved(it) {
  return [it.addedAt, ...(it.sold || []).map((r) => r.date), ...(it.restocks || []).map((r) => r.date)].filter(Boolean).sort().at(-1) || '';
}

/** Reorder reminders: one task per item at or below its reorder point, skipping retired items. */
export function reorderItems(m, from, to, inRange) {
  return normalizeMerch(m.merch)
    .filter(isLow)
    .map((it) => ({ it, date: lastMoved(it) }))
    .filter(({ date }) => inRange(date))
    .map(({ it, date }) => ({ date, kind: 'task', key: `merch-reorder-${it.id}`, title: `Reorder ${it.name || 'merch'} (${stockLeft(it)} left)`, sub: 'Merch', ref: { page: 'money', id: null, tab: 'merch' } }));
}
registerAgendaSource(reorderItems);
