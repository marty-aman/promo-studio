// Split sheets: who wrote a song and what share each writer gets, kept on the song as `song.split`.
// Pure logic (normaliser, share maths, status, the printable sheet), so it is unit tested without a page.
import { SONG_EXTRAS } from './songnorm.js';
import { mid } from './model.js';
import { esc, escBr, docHTML } from './pdf.js';

export const SPLIT_ROLES = [['lyrics', 'Lyrics'], ['music', 'Music'], ['both', 'Lyrics and music'], ['producer', 'Producer'], ['other', 'Other']];
const ROLE_KEYS = SPLIT_ROLES.map(([k]) => k);
export const roleLabel = (k) => (SPLIT_ROLES.find(([v]) => v === k) || SPLIT_ROLES[4])[1];

/** A share as a number from 0 to 100 with at most 2 decimals ('' or junk is 0). */
export const cleanShare = (x) => {
  const v = typeof x === 'number' ? x : parseFloat(String(x ?? '').replace(',', '.'));
  return Number.isFinite(v) ? Math.round(Math.min(100, Math.max(0, v)) * 100) / 100 : 0;
};

const str = (x) => (typeof x === 'string' ? x : '');

export function newWriter(name = '', role = 'both') {
  return { id: mid('wr'), name, role, share: 0, pro: '', email: '' };
}

export function normalizeSplit(x) {
  const s = x && typeof x === 'object' && !Array.isArray(x) ? x : {};
  const writers = (Array.isArray(s.writers) ? s.writers : [])
    .filter((w) => w && typeof w === 'object')
    .map((w) => ({ ...w, id: typeof w.id === 'string' && w.id ? w.id : mid('wr'), name: str(w.name), role: ROLE_KEYS.includes(w.role) ? w.role : 'other', share: cleanShare(w.share), pro: str(w.pro), email: str(w.email) }));
  return { ...s, writers, date: str(s.date), notes: str(s.notes), master: str(s.master), signed: s.signed === true, signedDate: str(s.signedDate) };
}

SONG_EXTRAS.push((s) => ({ ...s, split: normalizeSplit(s.split) }));

/** The writers' shares added up, in hundredths so 33.33 + 33.33 + 33.34 is exactly 100. */
export const splitTotal = (writers = []) => writers.reduce((t, w) => t + Math.round(cleanShare(w.share) * 100), 0) / 100;
export const splitAddsUp = (writers = []) => writers.length > 0 && Math.round(splitTotal(writers) * 100) === 10000;

/** Shares for `n` writers that add up to exactly 100; leftover hundredths go to the first writers. */
export function evenShares(n) {
  if (!(n > 0)) return [];
  const base = Math.floor(10000 / n);
  const left = 10000 - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < left ? 1 : 0)) / 100);
}

/** Adds the band members not already on the split (matched by name), with no share yet. */
export function addMembers(split, members = []) {
  const have = new Set(split.writers.map((w) => w.name.trim().toLowerCase()));
  const fresh = (members || []).filter((x) => x && typeof x.name === 'string' && x.name.trim() && !have.has(x.name.trim().toLowerCase()));
  return { ...split, writers: [...split.writers, ...fresh.map((x) => newWriter(x.name.trim(), 'both'))] };
}

/**
 * Where the song's split stands: { ok, label, why }. "Split signed" needs writers, shares that
 * add up to 100 and the signed box ticked; anything else is "Split missing", with the reason.
 */
export function splitStatus(song) {
  const s = normalizeSplit(song && song.split);
  if (!s.writers.length) return { ok: false, label: 'Split missing', why: 'No writers on the split sheet yet' };
  if (!splitAddsUp(s.writers)) return { ok: false, label: 'Split missing', why: `Shares add up to ${splitTotal(s.writers)}%, not 100%` };
  if (!s.signed) return { ok: false, label: 'Split missing', why: 'Shares agreed, not signed yet' };
  return { ok: true, label: 'Split signed', why: s.signedDate ? `Signed ${s.signedDate}` : 'Signed' };
}

export const SPLIT_NOTE = 'This is a record of what the writers agree, not legal advice. Each writer signs and keeps a copy.';

const pct = (x) => `${cleanShare(x).toFixed(2).replace(/\.00$/, '')}%`;

/**
 * The printable split sheet. Only the fields listed here are printed; emails only when
 * `includeEmail` is set. Every user value goes through esc().
 */
export function splitSheetHTML(song, band = {}, { includeEmail = false } = {}) {
  const s = normalizeSplit(song.split);
  const total = splitTotal(s.writers);
  const cols = `<tr><th>Writer</th><th>Role</th><th>PRO / society</th>${includeEmail ? '<th>Email</th>' : ''}<th class="n">Share</th></tr>`;
  const rows = s.writers.map((w) => `<tr><td>${esc(w.name || '(no name)')}</td><td>${esc(roleLabel(w.role))}</td><td>${esc(w.pro)}</td>${includeEmail ? `<td>${esc(w.email)}</td>` : ''}<td class="n">${pct(w.share)}</td></tr>`).join('');
  const sign = s.writers.map((w) => `<div class="sig"><div class="line"></div><div>${esc(w.name || '(no name)')} · ${pct(w.share)}</div><div class="line short"></div><div>Date</div></div>`).join('');
  const body = `${splitAddsUp(s.writers) ? '' : `<p class="warn">Draft: the shares add up to ${esc(total)}%, not 100%.</p>`}
<p><strong>Song:</strong> ${esc(song.title || 'Untitled')}${band.name ? ` · <strong>Artist:</strong> ${esc(band.name)}` : ''}${s.date ? ` · <strong>Date agreed:</strong> ${esc(s.date)}` : ''}</p>
<h2>Writers</h2><table>${cols}${rows}<tr><th colspan="${includeEmail ? 4 : 3}">Total</th><th class="n">${esc(total)}%</th></tr></table>
${s.master ? `<h2>Master and publishing</h2><p>${escBr(s.master)}</p>` : ''}
${s.notes ? `<h2>Notes</h2><p>${escBr(s.notes)}</p>` : ''}
<h2>Signatures</h2><div class="sigs">${sign}</div>
<p class="note">${esc(SPLIT_NOTE)}</p>`;
  const css = '.sigs{display:grid;grid-template-columns:1fr 1fr;gap:22px 28px;margin-top:10px}.sig .line{border-bottom:1px solid #111;height:34px}.sig .line.short{width:50%;height:26px}.warn{border:1px solid #b00;color:#b00;padding:6px 8px}.note{margin-top:22px;font-size:11px;color:#444}';
  return docHTML(`Split sheet: ${song.title || 'Untitled'}`, body, { subtitle: band.name || '', css });
}
