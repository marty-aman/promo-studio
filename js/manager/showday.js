// Show day: the advance sheet, the gear and load-in list and the after-show recap. Pure functions
// (the page is page-showday.js, the printable sheets are in docs.js). The data lives on the show, in
// three fields added through SHOW_EXTRAS: `advance`, `gear` and `recap`.
//
// Privacy: the advance sheet is built from an allow-list (advanceModel). Only the fields named there can
// reach the sheet, its email text or its PDF. Fans, bandmates, outreach, contacts, the deal, the
// settlement and the show's own notes are never read.
import { mid, addDays, daysBetween, niceDate, registerAgendaSource, todayISO } from './model.js';
import { SHOW_EXTRAS } from './showsnorm.js';
import { STAGE_GEAR, normalizeStage, gearNames, inputList, monitorMixes } from './showplan.js';

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const numOrBlank = (v) => (v === '' || v == null || typeof v === 'boolean' || !Number.isFinite(+v) ? '' : +v);

// ---------------------------------------------------------------- advance sheet
export const newAdvance = () => ({ soundcheck: '', curfew: '', parking: '', loadInNotes: '', rider: '', stagePlot: true, venueContact: { name: '', phone: '', email: '' }, share: { name: false, phone: false, email: false }, hospitality: '', notes: '', sentOn: '' });

/** The advance fields from a save, checked. `share` says which of the venue contact's details go on the sheet. */
export function normalizeAdvance(a) {
  const d = newAdvance();
  if (!isObj(a)) return d;
  const vc = isObj(a.venueContact) ? a.venueContact : {};
  const sh = isObj(a.share) ? a.share : {};
  return {
    soundcheck: str(a.soundcheck, 40),
    curfew: str(a.curfew, 40),
    parking: str(a.parking, 600),
    loadInNotes: str(a.loadInNotes, 800),
    rider: str(a.rider, 4000),
    stagePlot: a.stagePlot === undefined ? d.stagePlot : a.stagePlot === true,
    venueContact: { name: str(vc.name, 120), phone: str(vc.phone, 60), email: str(vc.email, 200) },
    share: { name: sh.name === true, phone: sh.phone === true, email: sh.email === true },
    hospitality: str(a.hospitality, 800),
    notes: str(a.notes, 1500),
    sentOn: DATE.test(a.sentOn) ? a.sentOn : '',
  };
}

/** Whether a typed address can safely be the recipient of the mailto link (one plain address, no separators). */
const looksLikeEmail = (v) => /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i.test(String(v || '').trim());

/**
 * What goes on the advance sheet, and nothing else: the one place the allow-list lives. `ctx` carries
 * what the page already knows: `times` (setlistTimes), `stage` (band.stage), `members` is never passed.
 * Returns { title, subtitle, rows, lineup, contacts, stage, backline, rider }.
 */
export function advanceModel(show, band = {}, { times = null, stage = null } = {}) {
  const a = normalizeAdvance(show.advance);
  const gear = normalizeGear(show.gear);
  const clock = [['Load-in', show.loadIn], ['Soundcheck', a.soundcheck], ['Doors', show.doors], ['Our set', show.setTime], ['Curfew', a.curfew]].filter(([, v]) => v);
  const rows = [
    ...clock,
    ...(times && times.rows && times.rows.length ? [['Set length', times.text]] : []),
    ...(a.parking ? [['Parking', a.parking]] : []),
    ...(a.loadInNotes ? [['Load-in', a.loadInNotes]] : []),
    ...(a.hospitality ? [['Hospitality', a.hospitality]] : []),
    ...(a.notes ? [['Notes', a.notes]] : []),
  ];
  const lineup = (Array.isArray(show.lineup) ? show.lineup : []).filter((b) => b && b.name).map((b) => ({ name: str(b.name, 120), time: str(b.time, 20) }));
  const contacts = [['Venue contact', a.share.name && a.venueContact.name], ['Phone', a.share.phone && a.venueContact.phone], ['Email', a.share.email && a.venueContact.email]].filter(([, v]) => v);
  const st = a.stagePlot ? normalizeStage(stage) : null;
  const needs = gear.filter((g) => needsBackline(g)).map((g) => g.label);
  return {
    title: `${band.name ? `${band.name} · ` : ''}Advance: ${str(show.venue, 120) || 'Show'}`,
    subtitle: [show.date ? niceDate(show.date) : 'Date to be set', str(show.city, 80)].filter(Boolean).join(' · '),
    rows,
    lineup,
    contacts,
    needs,
    rider: a.rider,
    stage: st && st.items.length ? { inputs: inputList(st), mixes: monitorMixes(st), backline: st.backline, notes: st.notes, plot: st } : null,
    bandContact: [band.email, band.phone].filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().slice(0, 120)),
    bandName: str(band.name, 120),
  };
}

/** The sheet as plain text, for the email. `compact` leaves out the input list so it stays short enough for a mailto link. */
export function advanceText(model, { compact = false } = {}) {
  const out = [`${model.title}`, model.subtitle, ''];
  for (const [k, v] of model.rows) out.push(`${k}: ${v}`);
  if (model.lineup.length) out.push('', 'Lineup:', ...model.lineup.map((b, i) => `${i + 1}. ${b.name}${b.time ? ` (${b.time})` : ''}`));
  if (model.contacts.length) out.push('', ...model.contacts.map(([k, v]) => `${k}: ${v}`));
  if (model.needs.length) out.push('', `Backline we need from you: ${model.needs.join(', ')}`);
  if (model.rider) out.push('', 'Rider:', model.rider);
  if (model.stage && !compact) {
    out.push('', 'Input list:', ...model.stage.inputs.map((r) => `${r.ch}. ${r.name} (${r.mic})`));
    if (model.stage.mixes.length) out.push('', `Monitor mixes: ${model.stage.mixes.map((x) => `${x.mix} ${x.name}`).join(', ')}`);
  } else if (model.stage) out.push('', 'The stage plot and input list are in the PDF.');
  if (model.bandContact.length) out.push('', `Contact: ${model.bandContact.join(' · ')}`);
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** The mailto link: the venue contact's email (when it looks like one) as recipient, the sheet as the body. No attachments are possible. */
export function advanceMailto(show, model, band = {}) {
  const a = normalizeAdvance(show.advance);
  const to = looksLikeEmail(a.venueContact.email) ? a.venueContact.email.trim() : '';
  const subject = `Advance for ${show.date ? niceDate(show.date, { weekday: false }) : 'our show'} · ${band.name || 'our band'}`;
  const link = (body) => `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  let body = advanceText(model);
  // many mail apps cut a mailto link near 2,000 characters: shorten to the essentials, the PDF has the rest
  if (link(body).length > 1900) body = advanceText(model, { compact: true });
  if (link(body).length > 1900) body = `${body.slice(0, 1000).trimEnd()}…\n(The rest is in the PDF.)`;
  return { href: link(body), to, body };
}

// ---------------------------------------------------------------- gear and load-in list
export const newGearItem = (label = '', owner = '') => ({ id: mid('gear'), label, owner, packed: false, borrowed: false, backline: false });

/** The gear list from a save, checked. `backline` marks something you need the venue or another band to supply. */
export function normalizeGear(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(isObj).map((g) => ({ id: typeof g.id === 'string' && g.id ? g.id : mid('gear'), label: str(g.label, 120), owner: str(g.owner, 80), packed: g.packed === true, borrowed: g.borrowed === true, backline: g.backline === true }));
}
/** Something you asked the venue or another band for and haven't got confirmed. */
export const needsBackline = (g) => g.backline && !g.borrowed;

const GENERIC = ['Cables and power strips', 'Tuner, spare strings, sticks and picks', 'Merch table: shirts, signs and card reader'];
const SKIP = new Set(['riser', 'person', 'power']);
/** A starting list from the stage plot's gear (one line per piece, named as on the plot) plus a few things every show needs. */
export function suggestGear(stage) {
  const st = normalizeStage(stage);
  const names = st ? gearNames(st.items) : {};
  const fromStage = st ? st.items.filter((it) => !SKIP.has(it.type) && STAGE_GEAR[it.type]).sort((a, b) => a.x - b.x).map((it) => names[it.id]) : [];
  return [...fromStage, ...GENERIC].map((label) => newGearItem(label));
}
/** `list` plus the suggestions that aren't on it yet (compared by name, ignoring case). */
export function addSuggestions(list, suggestions) {
  const have = new Set(list.map((g) => g.label.trim().toLowerCase()));
  return [...list, ...suggestions.filter((g) => !have.has(g.label.trim().toLowerCase()))];
}
/** { packed, total, needs }: how much of what you're bringing is packed, and how much backline is still unconfirmed. */
export function gearProgress(list) {
  const gear = normalizeGear(list);
  const bringing = gear.filter((g) => !needsBackline(g));
  return { packed: bringing.filter((g) => g.packed).length, total: bringing.length, needs: gear.filter(needsBackline).length };
}

// ---------------------------------------------------------------- recap
export const newRecap = () => ({ doorCount: '', expenses: [], notes: '', whatWorked: '', promoterNote: '', venueNote: '' });
export const newExpense = () => ({ id: mid('exp'), label: '', amount: '' });

/** The recap from a save, checked. Expense amounts are numbers, or '' while empty (the Money build sums them). */
export function normalizeRecap(r) {
  const d = newRecap();
  if (!isObj(r)) return d;
  const door = numOrBlank(r.doorCount);
  return {
    doorCount: door === '' || door < 0 ? '' : Math.round(door),
    expenses: (Array.isArray(r.expenses) ? r.expenses : []).filter(isObj).map((e) => ({ id: typeof e.id === 'string' && e.id ? e.id : mid('exp'), label: str(e.label, 120), amount: numOrBlank(e.amount) })),
    notes: str(r.notes, 3000),
    whatWorked: str(r.whatWorked, 2000),
    promoterNote: str(r.promoterNote, 1500),
    venueNote: str(r.venueNote, 600),
  };
}
export const recapEmpty = (r) => {
  const x = normalizeRecap(r);
  return x.doorCount === '' && !x.expenses.some((e) => e.label || e.amount !== '') && !x.notes && !x.whatWorked && !x.promoterNote && !x.venueNote;
};
/** The expense lines added up. */
export const expenseTotal = (r) => Math.round(normalizeRecap(r).expenses.reduce((a, e) => a + (e.amount === '' ? 0 : e.amount), 0) * 100) / 100;

SHOW_EXTRAS.push((s) => ({ ...s, advance: normalizeAdvance(s.advance), gear: normalizeGear(s.gear), recap: normalizeRecap(s.recap) }));

// ---------------------------------------------------------------- earlier shows at the same venue
const key = (v) => String(v || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const money = (v) => (v === '' || v == null || Number.isNaN(+v) ? 0 : +v);
/** Pay + merch − costs, or null when nothing was typed. */
export function showNetOrNull(s) {
  const st = (s && s.settlement) || {};
  return [st.pay, st.merch, st.costs].some((v) => v !== '' && v != null) ? money(st.pay) + money(st.merch) - money(st.costs) : null;
}
/**
 * Shows already played at this venue (`where`: { id?, venueId?, venue?/name? }), newest first, never `skipId`.
 * Each: { id, date, net, doorCount, note (the recap's venue note), promoter }.
 */
export function venueHistory(shows, where, { skipId = '' } = {}) {
  const vid = where.venueId || where.id || null;
  const name = key(where.venue || where.name);
  return (shows || [])
    .filter((s) => s && s.id !== skipId && s.status === 'played' && ((vid && s.venueId === vid) || (name && key(s.venue) === name)))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .map((s) => {
      const r = normalizeRecap(s.recap);
      return { id: s.id, date: s.date || '', net: showNetOrNull(s), doorCount: r.doorCount, note: r.venueNote, promoter: r.promoterNote };
    });
}
/** "Last time here: Mar 3 · net $120 · 62 at the door · “great sound, load in at the back”". '' when never played. */
export function lastTimeHere(rows) {
  const r = rows && rows[0];
  if (!r) return '';
  const net = r.net == null ? '' : `net ${r.net < 0 ? '−' : ''}$${Math.abs(r.net).toFixed(2).replace(/\.00$/, '')}`;
  return `Last time here: ${[r.date && niceDate(r.date, { weekday: false }), net, r.doorCount !== '' && `${r.doorCount} at the door`, r.note && `“${r.note}”`].filter(Boolean).join(' · ')}`;
}

// ---------------------------------------------------------------- reminders
/**
 * The two reminders (pure, `today` passed in). "Send advance sheet" a week before a Confirmed show, until it's marked sent.
 * "Fill in recap" the day after a Played show with no recap, for two weeks. Past, cancelled and not-yet-played shows give nothing,
 * so an old show never turns up as overdue.
 */
export function showDayItems(m, from, to, inRange, today) {
  const out = [];
  for (const s of m.shows || []) {
    if (!s || !s.date || s.status === 'cancelled') continue;
    if (s.status === 'confirmed' && s.date >= today && !normalizeAdvance(s.advance).sentOn) {
      const due = addDays(s.date, -7);
      if (inRange(due)) out.push({ date: due, kind: 'task', key: `advance-${s.id}`, title: `Send advance sheet: ${s.venue || 'the venue'}`, sub: `Show ${niceDate(s.date, { weekday: false })}`, ref: { page: 'shows', id: s.id } });
    }
    if (s.status === 'played' && recapEmpty(s.recap) && daysBetween(s.date, today) <= 14) {
      const due = addDays(s.date, 1);
      if (inRange(due)) out.push({ date: due, kind: 'task', key: `recap-${s.id}`, title: `Fill in the recap: ${s.venue || 'the show'}`, sub: `Played ${niceDate(s.date, { weekday: false })}`, ref: { page: 'shows', id: s.id } });
    }
  }
  return out;
}
registerAgendaSource((m, from, to, inRange) => showDayItems(m, from, to, inRange, todayISO()));
