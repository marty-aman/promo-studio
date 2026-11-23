// Printable versions of the Manager's pages, for "Export PDF": the show sheet, the money report
// and the month's calendar. Each returns a complete HTML document (see pdf.js).
import { esc, escBr, docHTML } from './pdf.js';
import { niceDate } from './model.js';

const money = (v) => `${v < 0 ? '−' : ''}$${Math.abs(+v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const num = (v) => (v === '' || v == null || Number.isNaN(+v) ? 0 : +v);

/** One show on a page: times, lineup, deal, setlist, to-dos and the settlement. */
/** `times`: the setlist with lengths (setlist.js setlistTimes), when known. */
export function showSheetHTML(show, band = {}, { times: setTimes = null } = {}) {
  const times = [['Load-in', show.loadIn], ['Doors', show.doors], ['Our set', show.setTime]].filter(([, v]) => v);
  const set = String(show.setlist || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const todo = [...(show.todo || [])].sort((a, b) => a.offset - b.offset);
  const st = show.settlement || {};
  const settled = [st.pay, st.merch, st.costs].some((v) => v !== '' && v != null);
  const net = num(st.pay) + num(st.merch) - num(st.costs);
  const body = `
<div class="two"><div>
${times.length ? `<h2>Times</h2><table>${times.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>` : ''}
<h2>The deal</h2><table>
<tr><th>Billing</th><td>${esc(show.billing || '')}</td></tr>
${show.price ? `<tr><th>Tickets</th><td>${esc(show.price)}${show.tickets ? ` · ${esc(show.tickets)}` : ''}</td></tr>` : ''}
${show.deal ? `<tr><th>Deal</th><td>${esc(show.deal)}</td></tr>` : ''}
${show.contact ? `<tr><th>Contact</th><td>${esc(show.contact)}</td></tr>` : ''}
</table>
${show.lineup.length ? `<h2>Lineup</h2><ol>${show.lineup.map((b) => `<li>${esc(b.name || 'TBA')}${b.time ? ` · ${esc(b.time)}` : ''}</li>`).join('')}</ol>` : ''}
</div><div>
${setTimes && setTimes.rows.length ? `<h2>Setlist · ${esc(setTimes.text)}</h2><table>${setTimes.rows.map((r) => `<tr><td class="n">${r.n}</td><td>${esc(r.title)}</td><td class="n">${r.seconds ? fmtT(r.seconds) : '?'}</td></tr>`).join('')}<tr><th></th><th>Set length${setTimes.gaps ? ` (with ${fmtT(setTimes.gaps)} between songs)` : ''}</th><th class="n">${esc(setTimes.text)}</th></tr></table>` : set.length ? `<h2>Setlist</h2><ol>${set.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
${show.notes ? `<h2>Notes</h2><p>${escBr(show.notes)}</p>` : ''}
</div></div>
${todo.length ? `<h2>To do</h2><ul>${todo.map((t) => `<li>${t.done ? '☑' : '☐'} ${esc(t.text)}</li>`).join('')}</ul>` : ''}
${settled ? `<h2>Settlement</h2><table><tr><th>Paid</th><td class="n">${money(num(st.pay))}</td></tr><tr><th>Merch</th><td class="n">${money(num(st.merch))}</td></tr><tr><th>Costs</th><td class="n">${money(-num(st.costs))}</td></tr><tr><th>Net</th><td class="n"><b>${money(net)}</b></td></tr></table>` : ''}`;
  return docHTML(`${band.name ? `${band.name} · ` : ''}${show.venue || 'Show'}`, body, { subtitle: [show.date ? niceDate(show.date) : 'Date to be set', show.city, show.status].filter(Boolean).join(' · ') });
}

/**
 * The setlist for the stage floor: one page, big type, one song per line. Covers are marked, and
 * each song's key shows small at the right when it has one. The type shrinks for a long set so it
 * stays on one page. `times`: setlistTimes(...) for the set; `keys`: show the key column.
 */
export function stageSetlistHTML(show, band = {}, times, { keys = true } = {}) {
  const rows = (times && times.rows) || [];
  const n = Math.max(1, rows.length);
  // about 640 pt of usable height on A4/Letter at these margins
  const pt = Math.max(24, Math.min(60, Math.floor(560 / n / 1.15)));
  const list = rows.map((r) => `<li><span class="t">${esc(r.title)}${r.song && r.song.cover ? ' <span class="c">(cover)</span>' : ''}</span>${keys && r.song && r.song.key ? `<span class="k">${esc(r.song.key)}</span>` : ''}</li>`).join('');
  const css = `@page{margin:12mm}body{font-family:Impact,"Arial Black","Helvetica Neue",Arial,sans-serif}h1,.foot{display:none}
.hd{display:flex;justify-content:space-between;font:600 14pt system-ui,sans-serif;border-bottom:2px solid #000;padding-bottom:4px;margin-bottom:8px}
ol{list-style:none;margin:0;padding:0;counter-reset:s}li{counter-increment:s;display:flex;align-items:baseline;gap:.4em;font-size:${pt}pt;line-height:1.15;margin:0;text-transform:uppercase}
li::before{content:counter(s);font-size:.45em;min-width:1.6em;color:#555}.t{flex:1}.c{font-size:.4em;color:#555;text-transform:none}.k{font:600 .4em system-ui,sans-serif;color:#333}`;
  const head = `<div class="hd"><span>${esc(band.name || '')}${show.venue ? ` · ${esc(show.venue)}` : ''}${show.date ? ` · ${esc(niceDate(show.date, { weekday: false }))}` : ''}</span><span>${rows.length} songs${times && times.text ? ` · ${esc(times.text)}` : ''}</span></div>`;
  return docHTML(`Setlist ${show.venue || ''}`.trim(), `${head}<ol class="stage">${list}</ol>`, { css });
}

/** The money page for a year: totals, by category, and every line. */
export function moneyHTML({ band = {}, year = '', lines = [], sum, catLabel = (k) => k }) {
  const rows = lines.map((e) => `<tr><td>${esc(e.date || '')}</td><td>${e.kind === 'income' ? 'In' : 'Out'}</td><td>${esc(catLabel(e.category))}</td><td>${esc(e.note || '')}</td><td class="n">${money(e.kind === 'income' ? num(e.amount) : -num(e.amount))}</td></tr>`).join('');
  const cats = (sum.byCat || []).map(([k, inc, out]) => `<tr><td>${esc(catLabel(k))}</td><td class="n">${money(inc)}</td><td class="n">${money(-out)}</td></tr>`).join('');
  const body = `<table><tr><th>In</th><th>Out</th><th>Net</th></tr><tr><td class="n">${money(sum.income)}</td><td class="n">${money(-sum.expense)}</td><td class="n"><b>${money(sum.net)}</b></td></tr></table>
${cats ? `<h2>By category</h2><table><tr><th>Category</th><th class="n">In</th><th class="n">Out</th></tr>${cats}</table>` : ''}
<h2>Every line · ${lines.length}</h2>${rows ? `<table><tr><th>Date</th><th></th><th>Category</th><th>Note</th><th class="n">Amount</th></tr>${rows}</table>` : '<p class="muted">Nothing yet.</p>'}`;
  return docHTML(`${band.name || 'Band'} · money ${year === 'all' ? '(all time)' : year}`, body);
}

/** A month's dates as a list (it prints better than a grid). */
export function calendarHTML({ title, monthName, items }) {
  const byDay = new Map();
  for (const it of [...items].sort((a, b) => a.date.localeCompare(b.date))) (byDay.get(it.date) || byDay.set(it.date, []).get(it.date)).push(it);
  const KIND = { show: 'Show', release: 'Release', shoot: 'Shoot', post: 'Post', task: 'To do', event: 'Event' };
  const rows = [...byDay].map(([d, list]) => `<tr><th style="width:150px">${esc(niceDate(d))}</th><td><ul>${list.map((x) => `<li><b>${esc(KIND[x.kind] || x.kind)}</b> · ${esc(x.title || x.text || '')}${x.kind === 'event' && x.sub ? ` · ${esc(x.sub)}` : ''}${x.artist ? ` <span class="muted">(${esc(x.artist)})</span>` : ''}</li>`).join('')}</ul></td></tr>`).join('');
  return docHTML(title, rows ? `<table>${rows}</table>` : '<p class="muted">Nothing planned this month.</p>', { subtitle: monthName });
}
