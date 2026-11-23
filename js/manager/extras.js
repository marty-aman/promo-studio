// Calendar export, the press kit (EPK) and the money ledger. Pure functions, unit tested.
import { agenda, addDays, parseDate, isoDate, niceDate, mid, EVENT_KINDS } from './model.js';
import { combinedAgenda, viewOf, photoStyleCss } from './artists.js';
import { showMerchSales, merchMoneyLines } from './merch.js';

// ---- calendar

/** The weeks (Monday first) that cover the month of `iso`: [[iso x 7], ...]. */
export function monthGrid(iso) {
  const d = parseDate(iso) || new Date();
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const weeks = [];
  const cur = new Date(start);
  do {
    const w = [];
    for (let i = 0; i < 7; i++) {
      w.push(isoDate(cur));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(w);
  } while (cur.getMonth() === first.getMonth());
  return weeks;
}
export const monthStart = (iso, delta = 0) => {
  const d = parseDate(iso) || new Date();
  return isoDate(new Date(d.getFullYear(), d.getMonth() + delta, 1));
};

const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);
const icsDay = (iso) => iso.replace(/-/g, '');
const icsLocal = (iso, hhmm) => `${icsDay(iso)}T${hhmm.replace(':', '')}00`;
const fold = (line) => {
  // RFC 5545: lines over 75 octets are folded
  const out = [];
  let s = line;
  while (s.length > 74) {
    out.push(s.slice(0, 74));
    s = ` ${s.slice(74)}`;
  }
  out.push(s);
  return out.join('\r\n');
};

/**
 * A calendar item's UID: its kind, what it belongs to, its own id for tasks, and its artist. One
 * release day and one shoot per song, one event per show and post, so no date is needed.
 */
export const icsUid = (it) => `${it.kind}-${it.ref.id}${it.key ? `-${it.key}` : ''}${it.artistId ? `-${it.artistId}` : ''}@promo-studio`;

/**
 * Everything in the manager as an .ics calendar (Google, Apple and Outlook calendars import it):
 * shows at their set time, shoots at call time, your own events at their times (weekly ones repeat),
 * everything else as all-day items.
 */
export function managerICS(m, { from = '', days = 400, stamp = new Date(), ws = null } = {}) {
  const start = from || addDays(isoDate(new Date()), -30);
  // with a workspace: every artist, each title prefixed with the artist's name
  const items = ws ? combinedAgenda(ws, start, days) : agenda(m, start, days);
  const views = ws ? Object.fromEntries(ws.artists.map((a) => [a.id, viewOf(ws, a.id)])) : null;
  const dt = `${stamp.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Band Manager//Band manager//EN', `X-WR-CALNAME:${icsEsc(ws ? 'All artists · manager' : `${m.band.name || 'Band'} · manager`)}`, 'CALSCALE:GREGORIAN'];
  items.filter((it) => it.kind !== 'event').forEach((it) => {
    const src = views ? views[it.artistId] : m;
    const show = it.kind === 'show' && src.shows.find((s) => s.id === it.ref.id);
    const song = it.kind === 'shoot' && src.songs.find((s) => s.id === it.ref.id);
    const time = show ? show.setTime || show.doors : song ? song.shoot.callTime : '';
    // the UID says what the item is (never its date or its place in the list), so a calendar app
    // that imports the file again updates the same events, moved ones included, instead of adding copies
    lines.push('BEGIN:VEVENT', `UID:${icsUid(it)}`, `DTSTAMP:${dt}`);
    if (time && /^\d{2}:\d{2}$/.test(time)) {
      const [hh, mm] = time.split(':').map(Number);
      // an hour for a set, 8 for a shoot, running past midnight onto the next day when it has to
      const end = hh * 60 + mm + (show ? 60 : 480);
      const endDay = addDays(it.date, Math.floor(end / 1440));
      const endT = `${String(Math.floor((end % 1440) / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
      lines.push(`DTSTART:${icsLocal(it.date, time)}`, `DTEND:${icsLocal(endDay, endT)}`);
    } else lines.push(`DTSTART;VALUE=DATE:${icsDay(it.date)}`, `DTEND;VALUE=DATE:${icsDay(addDays(it.date, 1))}`);
    const title = `${views ? `${it.artist}: ` : ''}${{ show: `Show: ${it.title}`, release: it.title, shoot: it.title, post: `Post: ${it.title}`, task: `To do: ${it.title}` }[it.kind] || `To do: ${it.title}`}`;
    lines.push(fold(`SUMMARY:${icsEsc(title)}`), fold(`DESCRIPTION:${icsEsc(it.sub)}`));
    if (show && show.venue) lines.push(fold(`LOCATION:${icsEsc([show.venue, show.city].filter(Boolean).join(', '))}`));
    lines.push('END:VEVENT');
  });
  // your own events go in as they are (a weekly one as one repeating event), not one per day
  const endDay = addDays(start, days);
  const events = ws ? ws.artists.flatMap((a) => (views[a.id].events || []).map((ev) => ({ ev, artistId: a.id, artist: a.band.name || 'Artist' }))) : (m.events || []).map((ev) => ({ ev }));
  for (const { ev, artistId, artist } of events) {
    const inRange = ev.repeat ? ev.date < endDay && (!ev.until || ev.until >= start) : ev.date >= start && ev.date < endDay;
    if (!inRange) continue;
    lines.push('BEGIN:VEVENT', `UID:event-${ev.id}${artistId ? `-${artistId}` : ''}@promo-studio`, `DTSTAMP:${dt}`);
    const timed = !ev.allDay && /^\d{2}:\d{2}$/.test(ev.start || '');
    if (timed) {
      const mins = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
      const s = mins(ev.start);
      // no end: an hour; an end before the start runs past midnight
      const e = /^\d{2}:\d{2}$/.test(ev.end || '') && ev.end !== ev.start ? mins(ev.end) + (mins(ev.end) < s ? 1440 : 0) : s + 60;
      const eT = `${String(Math.floor((e % 1440) / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`;
      lines.push(`DTSTART:${icsLocal(ev.date, ev.start)}`, `DTEND:${icsLocal(addDays(ev.date, Math.floor(e / 1440)), eT)}`);
    } else lines.push(`DTSTART;VALUE=DATE:${icsDay(ev.date)}`, `DTEND;VALUE=DATE:${icsDay(addDays(ev.date, 1))}`);
    if (ev.repeat === 'weekly') lines.push(`RRULE:FREQ=WEEKLY${ev.until ? `;UNTIL=${icsDay(ev.until)}${timed ? 'T235959' : ''}` : ''}`);
    lines.push(fold(`SUMMARY:${icsEsc(`${artistId ? `${artist}: ` : ''}${ev.title || 'Event'}`)}`));
    const desc = [(EVENT_KINDS.find(([k]) => k === ev.kind) || [])[1], ev.note].filter(Boolean).join('\n');
    if (desc) lines.push(fold(`DESCRIPTION:${icsEsc(desc)}`));
    if (ev.location) lines.push(fold(`LOCATION:${icsEsc(ev.location)}`));
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

// ---- press kit

export const EPK_LINKS = [['spotify', 'Spotify'], ['apple', 'Apple Music'], ['youtube', 'YouTube'], ['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['bandcamp', 'Bandcamp'], ['website', 'Website']];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = (u) => (/^https?:\/\/[^\s"'<>]+$/i.test(u || '') ? u : '');
const safeImg = (u) => (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(u || '') ? u : '');

/** A one-page press kit as a self-contained HTML file (photos embedded), safe to email or host. */
export function epkHTML(m, { today = isoDate(new Date()), photos = [], credits = [], avatar = null } = {}) {
  const b = m.band;
  const links = EPK_LINKS.map(([k, l]) => [l, safeUrl((b.links || {})[k])]).filter(([, u]) => u);
  const songs = m.songs.filter((s) => s.status === 'released' || s.releaseDate).sort((x, y) => (y.releaseDate || '').localeCompare(x.releaseDate || '')).slice(0, 6);
  const upcoming = m.shows.filter((s) => s.date >= today && ['confirmed', 'hold'].includes(s.status)).sort((x, y) => x.date.localeCompare(y.date)).slice(0, 8);
  const played = [...new Set(m.shows.filter((s) => s.date < today && s.status === 'played' && s.venue).map((s) => s.venue))].slice(0, 12);
  const press = (b.press || []).filter((p) => p && p.quote);
  const members = (b.members || []).filter((x) => x && x.name);
  const songLink = (s) => safeUrl(s.links.spotify) || safeUrl(s.links.youtube) || safeUrl(s.links.bandcamp) || safeUrl(s.links.apple);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(b.name)} · Press kit</title>
<style>body{margin:0;font:16px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;background:#0b0b0d;color:#ecebe6}main{max-width:820px;margin:0 auto;padding:40px 24px 64px}h1{font-size:44px;line-height:1.05;margin:0 0 6px;letter-spacing:-.01em}h2{font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#d33;margin:36px 0 10px}.sub{color:#a9a7a0;margin:0 0 18px}.links a{display:inline-block;margin:0 10px 8px 0;padding:6px 12px;border:1px solid #444;border-radius:99px;color:#ecebe6;text-decoration:none}.photos{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin:24px 0}.avatar{width:120px;height:120px;border-radius:20px;overflow:hidden;margin:0 0 18px}.avatar img{width:100%;height:100%;display:block}.photos figure{margin:0}.photos img{width:100%;border-radius:8px;display:block}.photos figcaption{font-size:12px;color:#a9a7a0;margin-top:4px}ul{padding-left:20px}li{margin:4px 0}blockquote{margin:10px 0;padding:8px 16px;border-left:3px solid #d33;color:#d8d6cf}blockquote cite{display:block;color:#a9a7a0;font-style:normal;font-size:14px;margin-top:4px}a{color:#f2b8b8}.contact{padding:16px;border:1px solid #333;border-radius:10px}</style></head><body><main>
${safeImg(avatar) ? `<div class="avatar"><img src="${safeImg(avatar)}" alt="${esc(b.name)}" style="${photoStyleCss(b.photoPos)}"></div>` : ''}<h1>${esc(b.name)}</h1>
<p class="sub">${esc([b.genres, b.city].filter(Boolean).join(' · '))}${b.similar ? ` · for fans of ${esc(b.similar)}` : ''}</p>
${links.length ? `<p class="links">${links.map(([l, u]) => `<a href="${esc(u)}">${esc(l)}</a>`).join('')}</p>` : ''}
${photos.map(safeImg).filter(Boolean).length ? `<div class="photos">${photos.map((p, i) => [safeImg(p), credits[i]]).filter(([p]) => p).map(([p, c]) => `<figure><img src="${p}" alt="${esc(b.name)} press photo">${c ? `<figcaption>${esc(c)}</figcaption>` : ''}</figure>`).join('')}</div>` : ''}
${b.bio ? `<h2>About</h2>${String(b.bio).split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}` : ''}
${b.highlights ? `<h2>Highlights</h2><ul>${String(b.highlights).split(/\n+/).filter((x) => x.trim()).map((x) => `<li>${esc(x.trim())}</li>`).join('')}</ul>` : ''}
${songs.length ? `<h2>Music</h2><ul>${songs.map((s) => `<li>${songLink(s) ? `<a href="${esc(songLink(s))}">“${esc(s.title)}”</a>` : `“${esc(s.title)}”`}${s.releaseDate ? ` · ${s.releaseDate > today ? 'out ' : ''}${esc(niceDate(s.releaseDate, { weekday: false }))}` : ''}</li>`).join('')}</ul>` : ''}
${press.length ? `<h2>Press</h2>${press.map((p) => `<blockquote>“${esc(p.quote)}”${p.source ? `<cite>${esc(p.source)}</cite>` : ''}</blockquote>`).join('')}` : ''}
${upcoming.length ? `<h2>Upcoming shows</h2><ul>${upcoming.map((s) => `<li>${esc(niceDate(s.date))} · ${esc(s.venue || 'TBA')}${s.city ? `, ${esc(s.city)}` : ''}${safeUrl(s.tickets) ? ` · <a href="${esc(s.tickets)}">tickets</a>` : ''}</li>`).join('')}</ul>` : ''}
${played.length ? `<h2>Has played</h2><p>${played.map(esc).join(' · ')}</p>` : ''}
${members.length ? `<h2>Band</h2><ul>${members.map((x) => `<li>${esc(x.name)}${x.role ? ` · ${esc(x.role)}` : ''}</li>`).join('')}</ul>` : ''}
${b.contactEmail || b.contactName ? `<h2>Contact</h2><p class="contact">${esc(b.contactName || '')}${b.contactEmail ? ` · <a href="mailto:${esc(b.contactEmail)}">${esc(b.contactEmail)}</a>` : ''}${b.contactPhone ? ` · ${esc(b.contactPhone)}` : ''}</p>` : ''}
</main></body></html>`;
}

/** A short bio (first paragraph, trimmed to `max` characters at a sentence) for forms and pitches. */
export function shortBio(bio, max = 280) {
  const p = String(bio || '').split(/\n{2,}/)[0].trim();
  if (p.length <= max) return p;
  const cut = p.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end > 60 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, '')}…`;
}

// ---- money

export const MONEY_CATS = [['show', 'Shows'], ['merch', 'Merch'], ['streaming', 'Streaming & sales'], ['recording', 'Recording & mixing'], ['video', 'Video & photo'], ['promo', 'Ads & promo'], ['gear', 'Gear'], ['travel', 'Travel & gas'], ['other', 'Other']];
export const newEntry = (kind = 'expense', date = isoDate(new Date())) => ({ id: mid('money'), date, kind, amount: '', category: kind === 'income' ? 'show' : 'other', songId: '', showId: '', note: '' });

const amt = (v) => (v === '' || v == null || Number.isNaN(+v) ? 0 : +v);
/**
 * A show whose pay and merch are real money: marked played, or confirmed and its day is over (today's
 * show counts from tomorrow). Ideas, pitches and holds that never got played don't count.
 */
export const showSettled = (s, today) => s.status === 'played' || (s.status === 'confirmed' && !!s.date && s.date < today);

/**
 * Every money line: the ledger plus show settlements (pay and merch in, costs out), so the totals
 * include shows without typing them twice. Pay and merch count once a show is settled (showSettled);
 * costs count right away. See expectedShowMoney for what upcoming shows should bring in.
 */
export function moneyLines(m, today = isoDate(new Date())) {
  const out = m.money.map((e) => ({ ...e, amount: amt(e.amount), from: 'ledger' }));
  for (const s of m.shows) {
    const sm = showMoney(m, s);
    const base = { date: s.date, showId: s.id, songId: '', from: 'show', note: s.venue || 'Show' };
    // costs are money already spent (a deposit, the van), so they count as soon as they're typed
    if (sm.costs) out.push({ ...base, id: `${s.id}-costs`, kind: 'expense', category: 'travel', amount: sm.costs });
    if (!showSettled(s, today)) continue;
    if (sm.pay) out.push({ ...base, id: `${s.id}-pay`, kind: 'income', category: 'show', amount: sm.pay });
    if (sm.merch) out.push({ ...base, id: `${s.id}-merch`, kind: 'income', category: 'merch', amount: sm.merch, ...(sm.merchFrom === 'sales' ? { merchSales: true } : {}) });
  }
  out.push(...merchMoneyLines(m));
  return out.filter((e) => e.amount > 0).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

/** What a show's recap lists as spent ([{ label, amount }]); 0 when there's no recap. */
export function recapExpenses(s) {
  const list = s && s.recap && Array.isArray(s.recap.expenses) ? s.recap.expenses : [];
  return cents(list.reduce((a, x) => a + (x && typeof x === 'object' ? amt(x.amount) : 0), 0));
}

/**
 * A show's money, the one place that decides it: { pay, merch, costs, merchFrom, costsFrom }.
 * Merch: when merch sales are logged for the show (Money → Merch), their total REPLACES the
 * settlement's "Merch sales" number, never adds to it. Costs: the settlement's "Costs", or the recap's
 * expense lines when Costs is blank or 0.
 */
export function showMoney(m, s) {
  const st = s.settlement || {};
  const sales = showMerchSales(m, s.id);
  const recap = recapExpenses(s);
  return {
    pay: amt(st.pay),
    merch: sales.qty ? sales.amount : amt(st.merch),
    costs: amt(st.costs) || recap,
    merchFrom: sales.qty ? 'sales' : amt(st.merch) ? 'settlement' : '',
    costsFrom: amt(st.costs) ? 'settlement' : recap ? 'recap' : '',
  };
}

/** Pay already typed in for shows still to come (today or later, or no date yet; not cancelled), e.g. guarantees: { total, shows }. */
export function expectedShowMoney(m, today = isoDate(new Date())) {
  const shows = m.shows.filter((s) => !showSettled(s, today) && s.status !== 'cancelled' && (!s.date || s.date >= today) && amt((s.settlement || {}).pay) > 0);
  return { total: shows.reduce((a, s) => a + amt(s.settlement.pay), 0), shows };
}

const cents = (v) => Math.round(v * 100) / 100;
/**
 * Split a show's net between band members: `fund` % is kept back for the band, the rest goes by
 * each member's share (`shares[memberId]`, default 1; 0 leaves someone out).
 * Returns { fund, members: [{ id, name, share, amount }] }. A loss isn't split.
 */
export function memberSplit(net, members = [], { fund = '', shares = {} } = {}) {
  const list = (members || []).filter((x) => x && x.name);
  const pct = Math.min(100, Math.max(0, amt(fund)));
  if (!(net > 0) || !list.length) return { fund: 0, members: list.map((x) => ({ id: x.id, name: x.name, share: 0, amount: 0 })) };
  const kept = cents((net * pct) / 100);
  const w = list.map((x) => (shares && shares[x.id] !== undefined && shares[x.id] !== '' ? Math.max(0, amt(shares[x.id])) : 1));
  const total = w.reduce((a, b) => a + b, 0);
  const left = net - kept;
  if (!total) return { fund: cents(net), members: list.map((x, i) => ({ id: x.id, name: x.name, share: w[i], amount: 0 })) };
  const out = list.map((x, i) => ({ id: x.id, name: x.name, share: w[i], amount: cents((left * w[i]) / total) }));
  // rounding to cents can leave a cent or two over (or short): the first paid member takes it, so it adds up
  const rest = cents(left - out.reduce((a, x) => a + x.amount, 0));
  if (rest) {
    const first = out.find((x) => x.share > 0);
    first.amount = cents(first.amount + rest);
  }
  return { fund: kept, members: out };
}

/** One line for the band chat: "Split: $45 each (4 members) · band fund $60". '' when there's nothing to split. */
export function splitText(sp) {
  const paid = sp.members.filter((x) => x.share > 0);
  if (!paid.length) return '';
  const fmt = (v) => `$${v.toFixed(2).replace(/\.00$/, '')}`;
  const even = paid.every((x) => x.amount === paid[0].amount);
  const who = even ? `${fmt(paid[0].amount)} each (${paid.length} member${paid.length === 1 ? '' : 's'})` : paid.map((x) => `${x.name} ${fmt(x.amount)}`).join(', ');
  return `Split: ${who}${sp.fund ? ` · band fund ${fmt(sp.fund)}` : ''}`;
}

/** Per member, what the band's shows paid them in [from, to] (settled shows only): { fund, members: [{ id, name, amount }] }. */
export function memberTotals(m, { from = '', to = '9999', today = isoDate(new Date()) } = {}) {
  const members = (m.band.members || []).filter((x) => x && x.name);
  const by = new Map(members.map((x) => [x.id, { id: x.id, name: x.name, amount: 0 }]));
  let fund = 0;
  for (const s of m.shows) {
    if (!showSettled(s, today) || (s.date || '') < from || (s.date || '0') > to) continue;
    const st = s.settlement || {};
    const sm = showMoney(m, s);
    const sp = memberSplit(sm.pay + sm.merch - sm.costs, members, st);
    fund += sp.fund;
    for (const x of sp.members) if (by.has(x.id)) by.get(x.id).amount += x.amount;
  }
  return { fund: cents(fund), members: [...by.values()].map((x) => ({ ...x, amount: cents(x.amount) })) };
}

/** Totals: { income, expense, net, byCat: [[cat, income, expense]], byMonth: [[YYYY-MM, income, expense]] } for the lines in [from, to]. */
export function moneySummary(lines, { from = '', to = '9999' } = {}) {
  const inRange = lines.filter((e) => (e.date || '') >= from && (e.date || '0') <= to);
  const t = { income: 0, expense: 0 };
  const cats = new Map();
  const months = new Map();
  for (const e of inRange) {
    t[e.kind] += e.amount;
    const c = cats.get(e.category) || [0, 0];
    c[e.kind === 'income' ? 0 : 1] += e.amount;
    cats.set(e.category, c);
    const mk = (e.date || '').slice(0, 7) || 'no date';
    const mo = months.get(mk) || [0, 0];
    mo[e.kind === 'income' ? 0 : 1] += e.amount;
    months.set(mk, mo);
  }
  return {
    income: t.income,
    expense: t.expense,
    net: t.income - t.expense,
    byCat: [...cats].map(([k, [i, x]]) => [k, i, x]).sort((a, b) => b[1] + b[2] - (a[1] + a[2])),
    byMonth: [...months].map(([k, [i, x]]) => [k, i, x]).sort((a, b) => a[0].localeCompare(b[0])),
  };
}

/** Earnings from imported streaming reports (Streaming stats) matched to a song. */
export const importedEarnings = (m, songId) => cents(((m.stats && m.stats.lines) || []).filter((l) => l && l.songId === songId).reduce((a, l) => a + amt(l.earnings), 0));

/**
 * Spent and earned for ledger lines tagged with `pick(e)`, plus streaming imports worth `imported`.
 * No double counting: when there are imported earnings, ledger "Streaming & sales" income for the same
 * thing is left out (it is most likely the same payout); without imports, that ledger income counts.
 */
function spentEarned(lines, pick, imported) {
  let spent = 0;
  let ledgerIn = 0;
  let ledgerStreaming = 0;
  for (const e of lines) {
    if (!pick(e)) continue;
    if (e.kind === 'expense') spent += e.amount;
    else if (e.category === 'streaming') ledgerStreaming += e.amount;
    else ledgerIn += e.amount;
  }
  const streaming = imported > 0 ? imported : ledgerStreaming;
  return { spent: cents(spent), ledgerIn: cents(ledgerIn), streaming: cents(streaming), streamingFrom: imported > 0 ? 'imports' : ledgerStreaming ? 'ledger' : '' };
}

const budgetOf = (song) => +(String((song.shoot && song.shoot.budget) || '').replace(/[^\d.]/g, '') || 0);

/**
 * A song release's money: spend against its budget (the Video shoot budget field, parsed) and what it
 * earned (ledger income tagged "For" the song, plus streaming earnings imported on Streaming stats).
 * { spent, budget, left, earned, ledgerIn, streaming, streamingFrom, net, paidOff }. `lines` saves
 * recomputing moneyLines for every song.
 */
export function releaseSpend(m, song, lines = moneyLines(m)) {
  const r = spentEarned(lines, (e) => e.songId === song.id, importedEarnings(m, song.id));
  const budget = budgetOf(song);
  const earned = cents(r.ledgerIn + r.streaming);
  return { ...r, budget, left: budget ? cents(budget - r.spent) : null, earned, net: cents(earned - r.spent), paidOff: r.spent > 0 && earned >= r.spent };
}

/**
 * An EP or album's money: its tracks added up, plus ledger lines tagged "For" the release itself.
 * The budget is the tracks' shoot budgets added up (there is no second budget field).
 */
export function releaseTotals(m, rel, lines = moneyLines(m)) {
  const tracks = m.songs.filter((s) => s.releaseId === rel.id).map((s) => ({ song: s, ...releaseSpend(m, s, lines) }));
  const own = spentEarned(lines, (e) => e.releaseId === rel.id, 0);
  // a release-level "Streaming & sales" ledger line is left out when any track has imports (same rule as songs)
  const ownStreaming = tracks.some((t) => t.streamingFrom === 'imports') ? 0 : own.streaming;
  const sum = (k) => cents(tracks.reduce((a, t) => a + t[k], 0));
  const spent = cents(sum('spent') + own.spent);
  const earned = cents(sum('earned') + own.ledgerIn + ownStreaming);
  const budget = sum('budget');
  return { rel, tracks, spent, earned, budget, left: budget ? cents(budget - spent) : null, net: cents(earned - spent), paidOff: spent > 0 && earned >= spent, ownSpent: own.spent, ownEarned: cents(own.ledgerIn + ownStreaming) };
}

/** Every release with money on it: { releases: [releaseTotals…], songs: [{ song, …releaseSpend }] } (songs not on an EP or album). */
export function releaseMoney(m, today = isoDate(new Date())) {
  const lines = moneyLines(m, today);
  const relIds = new Set(m.releases.map((r) => r.id));
  const releases = m.releases.map((r) => releaseTotals(m, r, lines)).filter((x) => x.spent || x.earned || x.budget);
  const songs = m.songs.filter((s) => !relIds.has(s.releaseId)).map((s) => ({ song: s, ...releaseSpend(m, s, lines) })).filter((x) => x.spent || x.earned || x.budget);
  return { releases, songs };
}
