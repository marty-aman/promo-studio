// Printable versions of the Manager's pages, for "Export PDF": the show sheet, the money report
// and the month's calendar. Each returns a complete HTML document (see pdf.js).
import { esc, escBr, docHTML } from './pdf.js';
import { niceDate } from './model.js';

const money = (v) => `${v < 0 ? '−' : ''}$${Math.abs(+v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const num = (v) => (v === '' || v == null || Number.isNaN(+v) ? 0 : +v);

/** One show on a page: times, lineup, deal, setlist, to-dos and the settlement. */
export function showSheetHTML(show, band = {}) {
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
${set.length ? `<h2>Setlist</h2><ol>${set.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
${show.notes ? `<h2>Notes</h2><p>${escBr(show.notes)}</p>` : ''}
</div></div>
${todo.length ? `<h2>To do</h2><ul>${todo.map((t) => `<li>${t.done ? '☑' : '☐'} ${esc(t.text)}</li>`).join('')}</ul>` : ''}
${settled ? `<h2>Settlement</h2><table><tr><th>Paid</th><td class="n">${money(num(st.pay))}</td></tr><tr><th>Merch</th><td class="n">${money(num(st.merch))}</td></tr><tr><th>Costs</th><td class="n">${money(-num(st.costs))}</td></tr><tr><th>Net</th><td class="n"><b>${money(net)}</b></td></tr></table>` : ''}`;
  return docHTML(`${band.name ? `${band.name} · ` : ''}${show.venue || 'Show'}`, body, { subtitle: [show.date ? niceDate(show.date) : 'Date to be set', show.city, show.status].filter(Boolean).join(' · ') });
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
  const KIND = { show: 'Show', release: 'Release', shoot: 'Shoot', post: 'Post', task: 'To do' };
  const rows = [...byDay].map(([d, list]) => `<tr><th style="width:150px">${esc(niceDate(d))}</th><td><ul>${list.map((x) => `<li><b>${esc(KIND[x.kind] || x.kind)}</b> · ${esc(x.title || x.text || '')}${x.artist ? ` <span class="muted">(${esc(x.artist)})</span>` : ''}</li>`).join('')}</ul></td></tr>`).join('');
  return docHTML(title, rows ? `<table>${rows}</table>` : '<p class="muted">Nothing planned this month.</p>', { subtitle: monthName });
}
