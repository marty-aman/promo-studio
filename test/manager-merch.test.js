import test from 'node:test';
import assert from 'node:assert/strict';
import { newManager, newSong, newShow, normalizeManager, agenda, overdueTasks, AGENDA_SOURCES } from '../js/manager/model.js';
import { workspaceFrom, viewOf, mergeView, addArtist, normalizeWorkspace, workspaceBackup, parseWorkspaceBackup } from '../js/manager/artists.js';
import { moneyLines, moneySummary, memberTotals, showMoney, recapExpenses, releaseSpend, releaseTotals, releaseMoney, newEntry } from '../js/manager/extras.js';
import { newMerchItem, normalizeMerch, itemStats, sellMerch, undoSale, restockMerch, setMerchKind, setSizeList, stockLeft, isLow, unitCost, showMerchSales, merchMoneyLines, reorderItems } from '../js/manager/merch.js';
import { releasesHTML } from '../js/manager/releasemoney.js';
import { newRelease } from '../js/manager/releases.js';

const TODAY = '2026-11-23';

function shirt(over = {}) {
  return { ...newMerchItem('shirt', '2026-10-01'), name: 'Logo shirt', price: 25, cost: 8.5, sizes: { S: 4, M: 10, L: 10, XL: 2 }, ...over };
}

test('merch: sell, refuse overselling, undo, restock, stock left, profit with rounding', () => {
  const it = shirt();
  assert.equal(stockLeft(it), 26);
  assert.equal(sellMerch(it, { date: '2026-11-01', qty: 3, size: 'XL' }).ok, false, 'only 2 XL');
  assert.equal(stockLeft(it), 26, 'a refused sale changes nothing');
  assert.equal(sellMerch(it, { qty: 1 }).error, 'Pick a size.');
  assert.equal(sellMerch(it, { qty: 0, size: 'M' }).ok, false);
  const a = sellMerch(it, { date: '2026-11-01', qty: 3, size: 'M' });
  assert.ok(a.ok);
  assert.equal(a.sale.price, 25, 'price defaults to the item price');
  sellMerch(it, { date: '2026-11-02', qty: 1, size: 'S', price: 19.99 });
  assert.equal(it.sizes.M, 7);
  const st = itemStats(it);
  assert.equal(st.soldQty, 4);
  assert.equal(st.revenue, 94.99);
  assert.equal(st.cogs, 34);
  assert.equal(st.profit, 60.99);
  assert.ok(undoSale(it, a.sale.id));
  assert.equal(it.sizes.M, 10);
  assert.equal(itemStats(it).soldQty, 1);
  const r = restockMerch(it, { date: '2026-11-05', qty: 12, size: 'L' });
  assert.equal(r.restock.cost, 102, 'blank cost: qty × cost per piece');
  assert.equal(it.sizes.L, 22);
  // one-size item: cost per piece from the restocks when the item has none
  const cd = { ...newMerchItem('cd', TODAY), name: 'CD', price: 10 };
  restockMerch(cd, { qty: 3, cost: 10 });
  assert.equal(cd.qty, 3);
  assert.equal(Math.round(unitCost(cd) * 1000) / 1000, 3.333);
  sellMerch(cd, { qty: 1 });
  assert.equal(itemStats(cd).profit, 6.67);
  assert.equal(sellMerch(cd, { qty: 5 }).ok, false);
});

test('merch: kind and size changes keep the count; normaliser tolerates bad data', () => {
  const it = shirt();
  setMerchKind(it, 'vinyl');
  assert.equal(it.sizes, null);
  assert.equal(it.qty, 26);
  setMerchKind(it, 'hoodie');
  assert.equal(stockLeft(it), 26);
  setSizeList(it, 'M, L, 3XL');
  assert.deepEqual(it.sizes, { M: 26, L: 0, '3XL': 0 });
  const n = normalizeMerch([null, { id: 3 }, { id: 'x', kind: 'spaceship', qty: '-4', sizes: [], reorderAt: 'abc', sold: [{ qty: 2, price: '5' }, 'junk', { qty: 0 }], restocks: 'no', extra: 1 }]);
  assert.equal(n.length, 1);
  assert.equal(n[0].kind, 'other');
  assert.equal(n[0].qty, 0);
  assert.equal(n[0].sizes, null);
  assert.equal(n[0].reorderAt, '');
  assert.equal(n[0].sold.length, 1);
  assert.equal(n[0].sold[0].id, 'x-sale0', 'a missing sale id is stable');
  assert.equal(n[0].extra, 1, 'unknown fields kept');
  assert.deepEqual(normalizeMerch(n), n, 'normalising twice changes nothing');
});

function withShow(merchVal, sold = []) {
  const m = newManager();
  const show = { ...newShow('2026-11-10'), id: 'show1', venue: 'Funhouse', status: 'played', settlement: { gross: '', pay: 150, merch: merchVal, costs: '40', fund: '', shares: {} } };
  m.shows.push(show);
  m.band.members = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
  m.merch = [shirt({ sold })];
  return m;
}

test('money: old data (settlement.merch only) works unchanged', () => {
  const m = withShow('90');
  const lines = moneyLines(m, TODAY);
  assert.deepEqual(lines.map((e) => [e.id, e.amount]), [['show1-costs', 40], ['show1-pay', 150], ['show1-merch', 90]]);
  assert.equal(memberTotals(m, { today: TODAY }).members[0].amount, 100);
  assert.deepEqual(showMoney(m, m.shows[0]), { pay: 150, merch: 90, costs: 40, merchFrom: 'settlement', costsFrom: 'settlement' });
});

test('money: sales logged at a show replace settlement.merch, never add to it', () => {
  const sold = [{ id: 's1', date: '2026-11-10', showId: 'show1', qty: 3, size: 'M', price: 25 }, { id: 's2', date: '2026-11-10', showId: 'show1', qty: 1, size: 'L', price: 0.1 }, { id: 's3', date: '2026-11-15', showId: '', qty: 2, size: 'S', price: 20 }];
  const m = withShow('90', sold);
  const lines = moneyLines(m, TODAY);
  const merchIn = lines.filter((e) => e.category === 'merch' && e.kind === 'income');
  assert.deepEqual(merchIn.map((e) => [e.id, e.amount, e.from]), [['s3', 40, 'merch'], ['show1-merch', 75.1, 'show']]);
  assert.ok(lines.find((e) => e.id === 'show1-merch').merchSales);
  assert.equal(moneySummary(lines).income, 150 + 75.1 + 40);
  // member split uses the same show money (150 + 75.10 - 40) / 2
  assert.equal(memberTotals(m, { today: TODAY }).members[0].amount, 92.55);
  assert.deepEqual(showMerchSales(m, 'show1'), { qty: 4, amount: 75.1 });
  // a sale whose show was deleted counts on its own date
  m.shows = [];
  assert.ok(merchMoneyLines(m).some((e) => e.id === 's1' && e.amount === 75));
});

test('money: show sales follow the show rule (count once played); restock cost is merch spending', () => {
  const m = withShow('', [{ id: 's1', date: '2026-11-30', showId: 'show1', qty: 2, size: 'M', price: 25 }]);
  m.shows[0].status = 'confirmed';
  m.shows[0].date = '2026-11-30';
  m.merch[0].restocks = [{ id: 'r1', date: '2026-11-01', qty: 20, size: 'M', cost: 170 }];
  let lines = moneyLines(m, TODAY);
  assert.ok(!lines.some((e) => e.id === 'show1-merch'));
  assert.deepEqual(lines.filter((e) => e.from === 'merch').map((e) => [e.kind, e.amount, e.category]), [['expense', 170, 'merch']]);
  lines = moneyLines(m, '2026-12-01');
  assert.equal(lines.find((e) => e.id === 'show1-merch').amount, 50);
});

test('money: recap expenses count only when settlement costs are blank or 0, missing recap tolerated', () => {
  const m = withShow('90');
  const s = m.shows[0];
  s.recap = { expenses: [{ id: 'e1', label: 'Gas', amount: '30.25' }, { id: 'e2', label: 'Food', amount: 12.5 }, null, { label: 'bad', amount: 'x' }] };
  assert.equal(recapExpenses(s), 42.75);
  assert.equal(showMoney(m, s).costs, 40, 'settlement costs win');
  s.settlement.costs = '';
  assert.equal(showMoney(m, s).costs, 42.75);
  assert.equal(showMoney(m, s).costsFrom, 'recap');
  s.settlement.costs = 0;
  assert.equal(moneyLines(m, TODAY).find((e) => e.id === 'show1-costs').amount, 42.75);
  s.recap = 'junk';
  assert.equal(recapExpenses(s), 0);
  delete s.recap;
  assert.equal(showMoney(m, s).costs, 0);
  assert.ok(!moneyLines(m, TODAY).some((e) => e.id === 'show1-costs'));
});

test('reorder reminders: low items only, retired and blank reorder points skipped, overdue from the last move', () => {
  const m = newManager();
  const low = shirt({ id: 'low', reorderAt: 5, sizes: { M: 3, L: 2 }, sold: [{ id: 'x', date: '2026-11-20', showId: '', qty: 1, size: 'M', price: 25 }] });
  const retired = shirt({ id: 'ret', reorderAt: 5, sizes: { M: 1 }, retired: true });
  const noPoint = shirt({ id: 'np', reorderAt: '', sizes: { M: 0 } });
  const plenty = shirt({ id: 'ok', reorderAt: 5, sizes: { M: 6 } });
  m.merch = [low, retired, noPoint, plenty];
  assert.ok(isLow(low) && !isLow(retired) && !isLow(noPoint) && !isLow(plenty));
  assert.ok(AGENDA_SOURCES.includes(reorderItems), 'registered when merch.js loads');
  const items = agenda(m, '2026-11-16', 14).filter((i) => i.key && i.key.startsWith('merch-reorder-'));
  assert.deepEqual(items.map((i) => [i.key, i.date, i.kind, i.title]), [['merch-reorder-low', '2026-11-20', 'task', 'Reorder Logo shirt (5 left)']]);
  assert.deepEqual(items[0].ref, { page: 'money', id: null, tab: 'merch' });
  const late = overdueTasks(m, TODAY).filter((l) => l.source && l.source.key.startsWith('merch-reorder-'));
  assert.deepEqual(late.map((l) => l.task.id), ['merch-reorder-low']);
  // normalised data from a backup keeps working (string numbers)
  m.merch = normalizeManager({ merch: [{ id: 'z', name: 'Patch', kind: 'patch', qty: '1', reorderAt: '2', addedAt: '2026-11-01' }] }).merch;
  assert.equal(reorderItems(m, '', TODAY, (d) => d < TODAY).length, 1);
});

test('merch backup round trip, artist switch and restore', () => {
  const ws = workspaceFrom(newManager());
  const v = viewOf(ws);
  const it = shirt({ id: 'merch1', reorderAt: 4 });
  sellMerch(it, { date: '2026-11-10', showId: '', qty: 2, size: 'M', price: 22.5 });
  restockMerch(it, { date: '2026-11-11', qty: 5, size: 'S', cost: 40 });
  v.merch = [it];
  const ws1 = mergeView(ws, v);
  const back = parseWorkspaceBackup(workspaceBackup(ws1));
  assert.deepEqual(back.artists[0].merch, ws1.artists[0].merch);
  assert.deepEqual(normalizeMerch(back.artists[0].merch), normalizeMerch([it]));
  assert.deepEqual(normalizeWorkspace(JSON.parse(JSON.stringify(ws1))), ws1);
  const [ws2, id2] = addArtist(ws1, 'Side project');
  assert.deepEqual(viewOf(ws2, id2).merch, [], 'a new artist starts with no merch');
  assert.deepEqual(viewOf(ws2, ws1.current).merch, [it], 'switching back keeps it');
  assert.deepEqual(normalizeManager(JSON.parse(JSON.stringify({ merch: [it] }))).merch, [it]);
});

test('release money: spent vs earned, streaming imports not double counted, EP totals, paid off', () => {
  const m = newManager();
  const a = { ...newSong('Static'), id: 'sa' };
  a.shoot.budget = '$400';
  const b = { ...newSong('Ash'), id: 'sb' };
  const c = { ...newSong('Lone single'), id: 'sc' };
  const ep = { ...newRelease('ep', 'Embers'), id: 'rel1' };
  a.releaseId = ep.id;
  b.releaseId = ep.id;
  m.songs.push(a, b, c);
  m.releases.push(ep);
  m.money.push(
    { ...newEntry('expense', '2026-10-02'), amount: '250', category: 'video', songId: 'sa' },
    { ...newEntry('income', '2026-11-02'), amount: '30.10', category: 'streaming', songId: 'sa' }, // same payout as the import: left out
    { ...newEntry('income', '2026-11-03'), amount: '100', category: 'other', songId: 'sa' }, // a sync fee: counts
    { ...newEntry('income', '2026-11-04'), amount: '12.345', category: 'streaming', songId: 'sb' }, // no import for sb: counts
    { ...newEntry('expense', '2026-10-05'), amount: '80', category: 'promo', releaseId: 'rel1' },
    { ...newEntry('income', '2026-11-06'), amount: '20', category: 'streaming', releaseId: 'rel1' }, // a track has imports: left out
    { ...newEntry('expense', '2026-10-06'), amount: '10', category: 'promo', songId: 'sc' },
    { ...newEntry('income', '2026-11-07'), amount: '15', category: 'show', songId: 'sc' },
  );
  m.stats.lines.push({ title: 'Static', songId: 'sa', earnings: 20.105, streams: 5000 }, { title: 'Static', songId: 'sa', earnings: 10, streams: 2000 }, { title: 'x', songId: null, earnings: 99 });
  const sa = releaseSpend(m, a);
  assert.equal(sa.spent, 250);
  assert.equal(sa.budget, 400);
  assert.equal(sa.left, 150);
  assert.equal(sa.streaming, 30.11);
  assert.equal(sa.streamingFrom, 'imports');
  assert.equal(sa.earned, 130.11);
  assert.equal(sa.net, -119.89);
  assert.equal(sa.paidOff, false);
  const sb = releaseSpend(m, b);
  assert.equal(sb.earned, 12.35);
  assert.equal(sb.streamingFrom, 'ledger');
  assert.equal(sb.paidOff, false, 'nothing spent is not "paid off"');
  const t = releaseTotals(m, ep);
  assert.equal(t.spent, 330);
  assert.equal(t.earned, 142.46);
  assert.equal(t.budget, 400);
  assert.equal(t.ownSpent, 80);
  assert.equal(t.ownEarned, 0);
  assert.equal(t.net, -187.54);
  const sc = releaseSpend(m, c);
  assert.equal(sc.paidOff, true);
  const all = releaseMoney(m, TODAY);
  assert.deepEqual(all.releases.map((r) => r.rel.id), ['rel1']);
  assert.deepEqual(all.songs.map((s) => s.song.id), ['sc'], 'tracks are listed under their EP, not twice');
  const html = releasesHTML({ band: { name: 'Arc <Flash>' }, data: all, today: TODAY });
  assert.ok(html.includes('Paid off') && html.includes('Embers') && html.includes('$187.54 to go'));
  assert.ok(html.includes('Arc &lt;Flash&gt;') && !html.includes('<Flash>'));
});

test('release PDF escapes titles', () => {
  const m = newManager();
  const s = { ...newSong('"><script>alert(1)</script>'), id: 'x' };
  s.shoot.budget = '100';
  m.songs.push(s);
  const html = releasesHTML({ band: {}, data: releaseMoney(m, TODAY) });
  assert.ok(!html.includes('<script>alert(1)'));
  assert.ok(html.includes('&lt;script&gt;'));
});
