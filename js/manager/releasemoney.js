// The printable "Releases: spent vs earned" document (Money → Releases → Export PDF).
// Every piece of user text goes through esc().
import { esc, docHTML } from './pdf.js';

const money = (v) => `${v < 0 ? '−' : ''}$${Math.abs(+v || 0).toLocaleString('en-US', { minimumFractionDigits: Math.round(Math.abs(+v || 0) * 100) % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const paidOffText = (x) => (x.paidOff ? 'Paid off' : x.spent > 0 ? `${money(x.spent - x.earned)} to go` : '—');

const row = (title, x, cls = '') => `<tr${cls ? ` class="${cls}"` : ''}><td>${title}</td><td class="n">${x.budget ? money(x.budget) : '—'}</td><td class="n">${money(x.spent)}</td><td class="n">${money(x.earned)}</td><td class="n"><b>${money(x.net)}</b></td><td>${esc(paidOffText(x))}</td></tr>`;
const HEAD = '<tr><th>Release</th><th class="n">Budget</th><th class="n">Spent</th><th class="n">Earned</th><th class="n">Net</th><th></th></tr>';

/** `data` is extras.js releaseMoney(m): { releases: [releaseTotals…], songs: [{ song, …releaseSpend }] }. */
export function releasesHTML({ band = {}, data, today = '' }) {
  const rel = data.releases.map((r) => row(`<b>${esc(r.rel.title || 'Release')}</b>`, r) + r.tracks.filter((t) => t.spent || t.earned || t.budget).map((t) => row(`&nbsp;&nbsp;“${esc(t.song.title)}”`, t, 'muted')).join('')).join('');
  const songs = data.songs.map((s) => row(`“${esc(s.song.title)}”`, s)).join('');
  const body = `${rel ? `<h2>EPs and albums</h2><table>${HEAD}${rel}</table>` : ''}
${songs ? `<h2>Songs</h2><table>${HEAD}${songs}</table>` : ''}
${!rel && !songs ? '<p class="muted">No release has a budget, spending or earnings yet.</p>' : ''}
<p class="muted small">Budget: each song’s Video shoot budget. Spent: ledger lines tagged “For” the song or release. Earned: ledger income tagged the same way, plus streaming earnings from imported reports (a ledger “Streaming &amp; sales” line is left out when the song has imported earnings, so a payout isn’t counted twice). Figures are what you typed or imported, not live.</p>`;
  return docHTML(`${band.name || 'Band'} · releases, spent vs earned`, body, { subtitle: today ? `As of ${today}` : '' });
}
