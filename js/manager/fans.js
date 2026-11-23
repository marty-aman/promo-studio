// Fans: the artist's own list of people who agreed to hear from the band (per artist, in the `fans`
// key). Adding by hand, pasting a list, CSV import and export, the city summary, fans near a show and
// "Email these fans" as mailto links with the addresses in BCC. Nothing is sent by the app.
// Pure functions, unit tested. Fan data never goes into any generated document (see the privacy test).
import { mid, addDays } from './model.js';
import { parseCSV } from './content.js';

export const FAN_SOURCES = [['show', 'At a show'], ['signup', 'Signup form'], ['merch', 'Merch table'], ['other', 'Other']];
/** The most fans one artist keeps (the browser's storage is small) and the most rows one import reads. */
export const FAN_MAX = 5000;
export const FAN_IMPORT_CAP = 2000;
/** Most mail apps cut a mailto link at about 2,000 characters; each link stays under this. */
export const MAILTO_MAX = 1800;
/** And most mail services refuse more than this many recipients in one message. */
export const BCC_MAX = 50;

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' ? String(v).slice(0, max) : '');
export const isEmail = (v) => /^[^\s@<>"',;:]+@[^\s@<>"',;:]+\.[a-z]{2,}$/i.test(str(v));
export const emailKey = (v) => str(v).toLowerCase();
/** A city as compared: lower case, trimmed, inner spaces squeezed, "St." = "Saint" not attempted. */
export const cityKey = (v) => str(v).toLowerCase().replace(/\s+/g, ' ');

/**
 * One fan, checked. Only these fields are kept (no phone numbers, nothing else that comes along in
 * an import): { id, name, email, city, region, source, showId, added, note, consent }.
 */
export function normalizeFan(f) {
  const o = f && typeof f === 'object' ? f : {};
  return {
    id: str(o.id, 80) || mid('fan'),
    name: str(o.name, 120),
    email: isEmail(o.email) ? str(o.email) : '',
    city: str(o.city, 80),
    region: str(o.region, 80),
    source: FAN_SOURCES.some(([k]) => k === o.source) ? o.source : 'other',
    showId: str(o.showId, 80),
    added: /^\d{4}-\d{2}-\d{2}$/.test(o.added || '') ? o.added : '',
    note: str(o.note, 400),
    consent: o.consent === true,
  };
}
export const normalizeFans = (list) => (Array.isArray(list) ? list.filter((x) => x && typeof x === 'object').map(normalizeFan) : []);
export const newFan = (fields = {}, today = '') => normalizeFan({ source: 'show', added: today, ...fields, id: mid('fan') });

/**
 * Add fans to a list: skips rows without a valid email, emails already there (any case) or twice in
 * the import, and anything past the caps. Returns { list, added, dupes, invalid, over }.
 */
export function addFans(list, rows, { today = '', cap = FAN_IMPORT_CAP, max = FAN_MAX } = {}) {
  const have = new Set(list.map((f) => emailKey(f.email)).filter(Boolean));
  const out = [...list];
  let added = 0;
  let dupes = 0;
  let invalid = 0;
  let over = 0;
  rows.forEach((r, i) => {
    if (i >= cap || out.length >= max) return void over++;
    const f = normalizeFan({ added: today, ...r, id: mid('fan') });
    if (!f.email) return void invalid++;
    const k = emailKey(f.email);
    if (have.has(k)) return void dupes++;
    have.add(k);
    out.push(f);
    added++;
  });
  return { list: out, added, dupes, invalid, over };
}

/** A pasted list, one person per line: "email, name, city" (the email may be anywhere on the line). */
export function parseFanLines(text) {
  return String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const cells = (parseCSV(line)[0] || []).map((c) => c.trim());
      const at = cells.findIndex(isEmail);
      const email = at >= 0 ? cells[at] : cells[0] || '';
      const rest = cells.filter((_, i) => i !== (at >= 0 ? at : 0));
      return { email, name: rest[0] || '', city: rest[1] || '' };
    });
}

// ---- CSV import

/** The fields a CSV column can go to. Phone numbers are never imported. */
export const FAN_FIELDS = [['', 'Skip'], ['email', 'Email'], ['name', 'Name'], ['first', 'First name'], ['last', 'Last name'], ['city', 'City'], ['region', 'Region / country'], ['note', 'Note']];
const GUESS = [
  ['email', /^(e-?mail|email address|e-mail address|mail)$/i],
  ['first', /^(first|first name|given name|firstname)$/i],
  ['last', /^(last|last name|surname|family name|lastname)$/i],
  ['name', /^(name|full name|fan|subscriber)$/i],
  ['city', /^(city|town|location)$/i],
  ['region', /^(region|state|province|country|state\/province)$/i],
  ['note', /^(note|notes|comment|comments)$/i],
];
/** Guess where each column goes from the heading row: an array of field names ('' = skip). */
export function guessFanColumns(head) {
  const used = new Set();
  return head.map((h) => {
    const t = String(h || '').trim();
    const hit = GUESS.find(([k, re]) => !used.has(k) && re.test(t));
    if (!hit) return '';
    used.add(hit[0]);
    return hit[0];
  });
}
/** Whether the first row is headings: none of its cells is an email address. */
export const hasHeadingRow = (rows) => !!rows.length && !rows[0].some(isEmail);

/**
 * Read a CSV file's text into rows ready for addFans. `map` gives each column's field (see
 * FAN_FIELDS); without one it is guessed from the headings. Returns { head, map, rows, total }.
 */
export function fansFromCSV(text, { map = null, heading = null, cap = FAN_IMPORT_CAP } = {}) {
  const all = parseCSV(text);
  const head = heading ?? hasHeadingRow(all);
  const cols = map || (head ? guessFanColumns(all[0] || []) : (all[0] || []).map((c, i) => (isEmail(c) ? 'email' : i === 1 ? 'name' : i === 2 ? 'city' : '')));
  const body = head ? all.slice(1) : all;
  const rows = body.slice(0, cap).map((r) => {
    const o = {};
    cols.forEach((k, i) => {
      if (k && r[i] != null && String(r[i]).trim()) o[k] = o[k] ? `${o[k]} ${String(r[i]).trim()}` : String(r[i]).trim();
    });
    const name = o.name || [o.first, o.last].filter(Boolean).join(' ');
    return { email: o.email || '', name: name || '', city: o.city || '', region: o.region || '', note: o.note || '' };
  });
  return { head: head ? all[0] || [] : [], map: cols, rows, total: body.length };
}

/** A cell that a spreadsheet won't run as a formula. */
const cell = (v) => {
  const s = String(v ?? '');
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};
/** The list as CSV (a personal-data file: the page says so). */
export function fansCSV(list, { shows = [] } = {}) {
  const showName = (id) => {
    const s = shows.find((x) => x.id === id);
    return s ? [s.date, s.venue].filter(Boolean).join(' ') : '';
  };
  const rows = [['Name', 'Email', 'City', 'Region', 'Source', 'Show', 'Added', 'Agreed to hear from us', 'Note'], ...normalizeFans(list).map((f) => [f.name, f.email, f.city, f.region, f.source, showName(f.showId), f.added, f.consent ? 'yes' : 'no', f.note])];
  return `\uFEFF${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}

// ---- email

/**
 * "Email these fans": mailto links with the addresses in BCC (so nobody sees anyone else's),
 * split so each link stays under `maxLen` characters and `perMail` addresses. Each address goes
 * in exactly one link; duplicates (any case) once.
 */
export function bccMailtos(emails, { to = '', subject = '', body = '', maxLen = MAILTO_MAX, perMail = BCC_MAX } = {}) {
  const seen = new Set();
  const list = emails.map((e) => str(e)).filter((e) => isEmail(e) && !seen.has(e.toLowerCase()) && seen.add(e.toLowerCase()));
  const base = `mailto:${isEmail(to) ? encodeURIComponent(str(to)) : ''}?`;
  const tail = [subject && `subject=${encodeURIComponent(subject)}`, body && `body=${encodeURIComponent(body)}`].filter(Boolean).join('&');
  const link = (chunk) => `${base}bcc=${chunk.map(encodeURIComponent).join(',')}${tail ? `&${tail}` : ''}`;
  const out = [];
  let chunk = [];
  for (const e of list) {
    const next = [...chunk, e];
    if (chunk.length && (chunk.length >= perMail || link(next).length > maxLen)) {
      out.push(link(chunk));
      chunk = [e];
    } else chunk = next;
  }
  if (chunk.length) out.push(link(chunk));
  return out.map((href, i) => ({ href, count: decodeURIComponent(href.split('bcc=')[1].split('&')[0]).split(',').length, part: i + 1, parts: out.length }));
}

/** Who can be emailed: a valid address and the box "agreed to hear from us" ticked. */
export const emailable = (list) => normalizeFans(list).filter((f) => f.email && f.consent);

// ---- cities

/** Fans per city, most first: [{ key, city, count }]. The city is the first spelling seen. */
export function citySummary(list) {
  const by = new Map();
  for (const f of normalizeFans(list)) {
    const k = cityKey(f.city);
    if (!k) continue;
    const g = by.get(k) || { key: k, city: f.city, count: 0 };
    g.count++;
    by.set(k, g);
  }
  return [...by.values()].sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
}
export const noCityCount = (list) => normalizeFans(list).filter((f) => !cityKey(f.city)).length;

/** "Tacoma, Bellevue; Everett" -> ['tacoma', 'bellevue', 'everett']. */
export const aliasList = (text) => [...new Set(String(text || '').split(/[,;\n]/).map(cityKey).filter(Boolean))];
/** The nearby-towns lists, kept on the profile as { [cityKey]: 'Tacoma, Bellevue' }. */
export const fanAliases = (band) => {
  const a = band && band.fanAliases;
  return a && typeof a === 'object' && !Array.isArray(a) ? Object.fromEntries(Object.entries(a).filter(([k, v]) => typeof k === 'string' && typeof v === 'string')) : {};
};

/** Fans whose city is the show's city or one of its "also try nearby" towns (case and spaces ignored). */
export function fansInCity(list, city, aliases = {}) {
  const k = cityKey(city);
  if (!k) return [];
  const keys = new Set([k, ...aliasList(aliases[k])]);
  return normalizeFans(list).filter((f) => keys.has(cityKey(f.city)));
}

/** Upcoming shows (today on, not cancelled or played), each with its fans nearby. */
export function showsWithFans(m, today, { days = 365 } = {}) {
  const aliases = fanAliases(m.band);
  const end = addDays(today, days);
  return (m.shows || [])
    .filter((s) => s.date && s.date >= today && s.date < end && s.status !== 'cancelled' && s.status !== 'played')
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((show) => {
      const fans = fansInCity(m.fans, show.city, aliases);
      return { show, fans, count: fans.length, reachable: fans.filter((f) => f.email && f.consent).length };
    });
}

/** Filter and sort for the list: { q, city (a cityKey), source, sort: 'added' | 'name' | 'city' }. */
export function filterFans(list, { q = '', city = '', source = '', sort = 'added' } = {}) {
  const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
  const out = normalizeFans(list).filter((f) => {
    if (city && cityKey(f.city) !== city) return false;
    if (source && f.source !== source) return false;
    const hay = `${f.name} ${f.email} ${f.city} ${f.region} ${f.note}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const by = {
    added: (a, b) => (b.added || '').localeCompare(a.added || ''),
    name: (a, b) => (a.name || a.email).localeCompare(b.name || b.email),
    city: (a, b) => cityKey(a.city).localeCompare(cityKey(b.city)) || (a.name || a.email).localeCompare(b.name || b.email),
  }[sort] || (() => 0);
  return out.sort(by);
}
