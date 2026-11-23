// Availability polls (Calendar > Availability). No accounts and no server: the organiser makes ONE
// self-contained poll file and sends it to the band; each bandmate gets back a short reply code that
// the organiser pastes here. This module is the pure logic (poll shape, reply codes, merging, best
// date, the poll file); the screen is in page-availability.js.
//
// A poll lives in the per-artist `availability` list:
//   { id, title, dates[], kind, members[], replies[{ name, answers{ 'YYYY-MM-DD': 'yes'|'maybe'|'no' }, at }],
//     createdAt, decided }          (+ eventId / showId once it was put on the calendar)
// Names only. No emails, phone numbers or other personal fields are stored, put in the file or put in a code.
import { esc } from './pdf.js';
import { mid, parseDate, isoDate, addDays, newEvent, newShow } from './model.js';

export const LIMITS = { dates: 60, people: 12, title: 80, name: 40, code: 1500, paste: 60000, codes: 30 };
export const POLL_KINDS = [['rehearsal', 'Rehearsal'], ['show', 'Show'], ['recording', 'Recording'], ['other', 'Other']];
export const kindLabel = (k) => (POLL_KINDS.find(([v]) => v === k) || POLL_KINDS[3])[1];
const ANSWERS = ['yes', 'maybe', 'no'];
const CH = { yes: 'y', maybe: 'm', no: 'n' };
const UNCH = { y: 'yes', m: 'maybe', n: 'no' };
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

// ---- cleaning
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g;
/** A person's name or a title: control and direction characters gone, spaces collapsed, cut at `max` characters. */
export function cleanText(v, max = LIMITS.name) {
  if (typeof v !== 'string') return '';
  return Array.from(v.normalize('NFC').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim()).slice(0, max).join('').trim();
}
export const nameKey = (n) => cleanText(n).toLowerCase();

/** Valid, unique, sorted 'YYYY-MM-DD' dates (a date like 2026-02-31 is dropped), at most LIMITS.dates. */
export function cleanDates(list) {
  const out = new Set();
  for (const d of Array.isArray(list) ? list : []) if (typeof d === 'string' && parseDate(d) && isoDate(parseDate(d)) === d) out.add(d);
  return [...out].sort().slice(0, LIMITS.dates);
}
/** Unique names (case-insensitive), at most `max`. */
export function cleanNames(list, max = LIMITS.people) {
  const seen = new Set();
  const out = [];
  for (const n of Array.isArray(list) ? list : []) {
    const c = cleanText(n);
    if (c && !seen.has(c.toLowerCase())) (seen.add(c.toLowerCase()), out.push(c));
  }
  return out.slice(0, max);
}
/** Names typed one per line or separated by commas. */
export const splitNames = (text) => cleanNames(String(text || '').split(/[\n,;]+/));

function cleanReplies(raw, dates, members) {
  const seen = new Map();
  const memberBy = new Map(members.map((n) => [n.toLowerCase(), n]));
  for (const r of Array.isArray(raw) ? raw : []) {
    if (!isObj(r)) continue;
    const key = nameKey(r.name);
    if (!key) continue;
    const answers = {};
    for (const d of dates) if (isObj(r.answers) && ANSWERS.includes(r.answers[d])) answers[d] = r.answers[d];
    seen.set(key, { name: memberBy.get(key) || cleanText(r.name), answers, at: typeof r.at === 'string' ? r.at.slice(0, 40) : '' });
  }
  return [...seen.values()].slice(0, LIMITS.people);
}

export const POLL_ID_MAX = 200;
/** A poll from a save, checked. Unknown fields are kept; never throws. */
export function normalizePoll(raw) {
  const p = isObj(raw) ? raw : {};
  const dates = cleanDates(p.dates);
  const members = cleanNames(p.members);
  return {
    ...p,
    id: typeof p.id === 'string' ? p.id : '',
    title: cleanText(p.title, LIMITS.title),
    dates,
    kind: POLL_KINDS.some(([k]) => k === p.kind) ? p.kind : 'other',
    members,
    replies: cleanReplies(p.replies, dates, members),
    createdAt: typeof p.createdAt === 'string' ? p.createdAt.slice(0, 40) : '',
    decided: typeof p.decided === 'string' && dates.includes(p.decided) ? p.decided : '',
  };
}

/** Why a poll can't be made yet ('' when it can). */
export function pollProblem({ dates, members, title } = {}) {
  const d = Array.isArray(dates) ? dates : [];
  if (d.length < 2) return 'Pick at least two dates to choose between.';
  if (d.length > LIMITS.dates) return `A poll can have at most ${LIMITS.dates} dates.`;
  if (splitNames(Array.isArray(members) ? members.join('\n') : members).length > LIMITS.people) return `At most ${LIMITS.people} people per poll.`;
  if (cleanText(title, 1000).length > LIMITS.title) return `Keep the title under ${LIMITS.title} characters.`;
  return '';
}

export function newPoll({ title = '', dates = [], kind = 'rehearsal', members = [] } = {}, now = new Date()) {
  const k = POLL_KINDS.some(([v]) => v === kind) ? kind : 'other';
  return normalizePoll({ id: mid('poll'), title: cleanText(title, LIMITS.title) || `${kindLabel(k)} poll`, dates, kind: k, members: Array.isArray(members) ? members : splitNames(members), replies: [], createdAt: now.toISOString(), decided: '' });
}

/** The dates from `from` to `to` (inclusive) that fall on the weekdays in `days` (0 = Sunday ... 6 = Saturday). */
export function datesInRange(from, to, days) {
  const out = [];
  if (!parseDate(from) || !parseDate(to) || from > to || !days?.length) return out;
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) if (days.includes(parseDate(d).getDay())) out.push(d);
  return out;
}

// ---- reply codes: "AV1." + base64url of {"v":1,"p":<poll id>,"n":<name>,"a":"ymn-…"}  (a = one letter per date in
// the poll's date order: y yes, m maybe, n no, - no answer). Not secret, not signed: anyone holding the file can make one.
export const CODE_PREFIX = 'AV1.';
function toB64u(s) {
  let bin = '';
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64u(t) {
  if (!/^[A-Za-z0-9_-]+$/.test(t) || t.length % 4 === 1) throw new Error('not base64');
  const bin = atob(t.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (t.length % 4)) % 4));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
/** Make a code (the poll file does this itself; the app needs it for tests and the preview). */
export const encodeReply = ({ p, n, a }) => CODE_PREFIX + toB64u(JSON.stringify({ v: 1, p, n, a }));
/** Read one code defensively. { ok: true, reply: { p, n, a } } or { ok: false, error }. */
export function decodeReply(code) {
  try {
    if (typeof code !== 'string' || !code.startsWith(CODE_PREFIX)) return { ok: false, error: 'Not a reply code (they start with AV1.).' };
    if (code.length > LIMITS.code) return { ok: false, error: 'That code is too long to be a reply.' };
    const j = JSON.parse(fromB64u(code.slice(CODE_PREFIX.length)));
    if (!isObj(j) || j.v !== 1) return { ok: false, error: 'This code is from a different version.' };
    if (typeof j.p !== 'string' || !j.p || j.p.length > POLL_ID_MAX) return { ok: false, error: 'The code is damaged (no poll id).' };
    if (typeof j.n !== 'string' || !cleanText(j.n)) return { ok: false, error: 'The code has no name in it.' };
    if (typeof j.a !== 'string' || !/^[ymn-]{1,60}$/.test(j.a)) return { ok: false, error: 'The code is damaged (answers).' };
    return { ok: true, reply: { p: j.p, n: cleanText(j.n), a: j.a } };
  } catch {
    return { ok: false, error: 'The code is damaged or was cut off when it was copied.' };
  }
}
/** The codes inside pasted text (a whole message is fine). */
export function findCodes(text) {
  if (typeof text !== 'string') return { tokens: [] };
  if (text.length > LIMITS.paste) return { tokens: [], error: 'That is too much text to be reply codes.' };
  return { tokens: text.match(/AV1\.[A-Za-z0-9_-]+/g) || [] };
}

// ---- people and merging
/** Everyone in the grid: the names you typed, then anyone who replied under another name. */
export function peopleOf(poll) {
  const seen = new Set(poll.members.map((n) => n.toLowerCase()));
  const out = [...poll.members];
  for (const r of poll.replies) if (!seen.has(r.name.toLowerCase())) (seen.add(r.name.toLowerCase()), out.push(r.name));
  return out;
}

/**
 * Add the replies in `text` to the poll. Returns { poll, results }: a new poll (the old one is untouched) and one
 * line per code. A person's earlier reply is replaced; codes for another poll, with the wrong number of dates, or
 * from a thirteenth person are ignored and say why.
 */
export function mergeCodes(poll, text, now = new Date().toISOString()) {
  let p = normalizePoll(poll);
  const results = [];
  const { tokens, error } = findCodes(text);
  if (error) return { poll: p, results: [{ ok: false, error }] };
  if (!tokens.length) return { poll: p, results: [{ ok: false, error: 'No reply code found. A code starts with AV1.' }] };
  if (tokens.length > LIMITS.codes) results.push({ ok: false, error: `Only the first ${LIMITS.codes} codes were read.` });
  for (const t of tokens.slice(0, LIMITS.codes)) {
    const d = decodeReply(t);
    if (!d.ok) {
      results.push({ ok: false, error: d.error });
      continue;
    }
    const { p: pid, n, a } = d.reply;
    if (pid !== p.id) {
      results.push({ ok: false, name: n, error: `${n}’s code is for a different poll, so it was ignored.` });
      continue;
    }
    if (a.length !== p.dates.length) {
      results.push({ ok: false, name: n, error: `${n}’s code has ${a.length} dates but this poll has ${p.dates.length}, so it was ignored.` });
      continue;
    }
    const answers = {};
    [...a].forEach((c, i) => c in UNCH && (answers[p.dates[i]] = UNCH[c]));
    const key = n.toLowerCase();
    const old = p.replies.find((r) => r.name.toLowerCase() === key);
    if (!old && !peopleOf(p).some((x) => x.toLowerCase() === key) && peopleOf(p).length >= LIMITS.people) {
      results.push({ ok: false, name: n, error: `${n} would be person ${LIMITS.people + 1}; a poll holds ${LIMITS.people} people, so the reply was ignored.` });
      continue;
    }
    const name = p.members.find((x) => x.toLowerCase() === key) || n;
    const same = old && JSON.stringify(old.answers) === JSON.stringify(answers);
    p = { ...p, replies: [...p.replies.filter((r) => r.name.toLowerCase() !== key), { name, answers, at: same ? old.at : now }] };
    results.push({ ok: true, name, status: same ? 'unchanged' : old ? 'replaced' : 'added', extra: !p.members.some((x) => x.toLowerCase() === key) });
  }
  return { poll: normalizePoll(p), results };
}

/**
 * The grid numbers. rows: one per date with counts and each person's answer ('' = no reply). `everyone` are the dates
 * every person said Yes to (only once all have replied), `maybesOnly` those where all said Yes or Maybe with at least
 * one Maybe, `best` the date with the most Yes (a Maybe counts half), then fewest No, then the earliest.
 */
export function tally(poll) {
  const p = normalizePoll(poll);
  const people = peopleOf(p);
  const by = new Map(p.replies.map((r) => [r.name.toLowerCase(), r]));
  const waiting = people.filter((n) => !by.has(n.toLowerCase()));
  const rows = p.dates.map((date) => {
    const byPerson = {};
    let yes = 0, maybe = 0, no = 0;
    for (const n of people) {
      const a = by.get(n.toLowerCase())?.answers[date] || '';
      byPerson[n] = a;
      if (a === 'yes') yes++;
      else if (a === 'maybe') maybe++;
      else if (a === 'no') no++;
    }
    const all = people.length > 0 && yes === people.length;
    const soft = people.length > 0 && yes + maybe === people.length && maybe > 0;
    return { date, yes, maybe, no, none: people.length - yes - maybe - no, byPerson, everyone: all, maybesOnly: soft, score: yes + maybe / 2 };
  });
  const ranked = rows.filter((r) => r.score > 0).sort((a, b) => b.score - a.score || a.no - b.no || (a.date < b.date ? -1 : 1));
  return { people, rows, waiting, replied: p.replies.length, everyone: rows.filter((r) => r.everyone).map((r) => r.date), maybesOnly: rows.filter((r) => r.maybesOnly).map((r) => r.date), best: ranked[0]?.date || '' };
}

// ---- Pick this date: the calendar event or show draft, through the existing models
const EVENT_KIND_OF = { rehearsal: 'rehearsal', recording: 'other', other: 'other' };
/** A calendar event for a decided rehearsal, recording or other date (never carries anyone's name). */
export function eventFromPoll(poll, date, { start = '', end = '' } = {}) {
  const p = normalizePoll(poll);
  const ok = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t || '');
  const ev = newEvent(date);
  return { ...ev, title: p.title || kindLabel(p.kind), kind: EVENT_KIND_OF[p.kind] || 'other', start: ok(start) ? start : '', end: ok(start) && ok(end) ? end : '', allDay: !ok(start), note: '' };
}
/** A show draft for a decided show date. */
export const showFromPoll = (poll, date, city = '') => ({ ...newShow(date), city: city || '', status: 'idea' });

// ---- the poll file
/**
 * The script inside the poll file, written as a constant so its hash can sit in the CSP. If you change a character of
 * it, update SCRIPT_HASH (test/availability.test.js checks the two agree).
 */
export const POLL_SCRIPT = `(()=>{const $=i=>document.getElementById(i);const clean=s=>Array.from(s.replace(/[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2066-\\u2069\\ufeff]/g,' ').replace(/\\s+/g,' ').trim()).slice(0,40).join('').trim();const enc=s=>{let t='';for(const b of new TextEncoder().encode(s))t+=String.fromCharCode(b);return btoa(t).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'')};$('go').addEventListener('click',()=>{const n=clean($('who').value),rows=document.querySelectorAll('li[data-d]');let a='',got=0;if(!n){$('msg').textContent='Type your name first.';return}rows.forEach(r=>{const c=r.querySelector('input:checked');a+=c?c.value:'-';if(c)got++});if(!got){$('msg').textContent='Pick Yes, Maybe or No for at least one date.';return}const code='AV1.'+enc(JSON.stringify({v:1,p:document.body.getAttribute('data-poll'),n:n,a:a}));$('code').value=code;$('out').hidden=false;$('msg').textContent=got<rows.length?(rows.length-got)+' date(s) left blank count as no answer.':'';const t=$('t').textContent;$('mail').href='mailto:?subject='+encodeURIComponent('My dates: '+t)+'&body='+encodeURIComponent('My answer for "'+t+'":\\n\\n'+code);$('code').focus();$('code').select()});$('copy').addEventListener('click',()=>{const c=$('code');c.select();const ok=()=>{$('copied').textContent='Copied.'};const old=()=>{try{document.execCommand('copy')&&ok()}catch(e){}};if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(c.value).then(ok,old);else old()})})();`;
/** base64 of the SHA-256 of POLL_SCRIPT (for the CSP). */
export const SCRIPT_HASH = 'sha256-EZBlCzdhrumfok/0rhfLdjFP2Jp10CZ2kP4cdyIv9Q8=';

const POLL_CSS = `*{box-sizing:border-box}body{margin:0;font:16px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;background:#f6f6f4;color:#161616}main{max-width:620px;margin:0 auto;padding:18px 14px 40px}h1{font-size:24px;margin:0 0 2px}.sub{margin:0 0 12px;color:#555}.note,.foot{font-size:13px;color:#555}.note{background:#fff;border:1px solid #d6d6d0;border-radius:8px;padding:8px 10px}label.n{display:block;font-weight:600;margin:14px 0 4px}input[type=text]{width:100%;padding:10px;font:inherit;border:1px solid #aaa;border-radius:8px}ol{list-style:none;padding:0;margin:12px 0}li{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 12px;padding:8px 10px;margin:6px 0;background:#fff;border:1px solid #d6d6d0;border-radius:8px}li b{min-width:9em}.g{display:flex;gap:6px}.g label{display:flex;align-items:center;gap:5px;padding:7px 12px;border:1px solid #aaa;border-radius:999px;cursor:pointer}.g label:has(input:checked){background:#161616;color:#fff;border-color:#161616}button{font:inherit;font-weight:600;padding:11px 16px;border-radius:8px;border:0;background:#161616;color:#fff;cursor:pointer}button.s,a.btn{background:#fff;color:#161616;border:1px solid #888}a.btn{display:inline-block;padding:10px 14px;border-radius:8px;text-decoration:none;font-weight:600}#msg{min-height:1.4em;color:#9b2c2c;font-weight:600}textarea{width:100%;font:14px/1.4 ui-monospace,monospace;padding:10px;border:1px solid #aaa;border-radius:8px;word-break:break-all}#out{background:#fff;border:2px solid #161616;border-radius:10px;padding:12px;margin-top:10px}#out p{margin:0 0 8px}.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px}@media(prefers-color-scheme:dark){body{background:#151515;color:#eee}.note,li,#out{background:#222;border-color:#444}.sub,.note,.foot{color:#aaa}input[type=text],textarea{background:#111;color:#eee;border-color:#666}.g label{border-color:#777}.g label:has(input:checked),button{background:#eee;color:#111;border-color:#eee}button.s,a.btn{background:#222;color:#eee;border-color:#777}#msg{color:#f08a8a}}`;

const FILE_DAY = (d) => parseDate(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

/**
 * The poll as ONE self-contained HTML file. Strict CSP: no network, no external anything, and the only script that can
 * run is the one inline script above (by hash). All typed text is escaped; the date rows are plain HTML.
 */
export function buildPollFile(poll) {
  const p = normalizePoll(poll);
  if (!p.id || p.id.length > POLL_ID_MAX) throw new Error('This poll has no usable id.');
  if (!p.dates.length) throw new Error('This poll has no dates.');
  const title = p.title || `${kindLabel(p.kind)} poll`;
  const rows = p.dates.map((d, i) => `<li data-d="${esc(d)}"><b>${esc(FILE_DAY(d))}</b><span class="g">${[['y', 'Yes'], ['m', 'Maybe'], ['n', 'No']].map(([v, l]) => `<label><input type="radio" name="r${i}" value="${v}">${l}</label>`).join('')}</span></li>`).join('');
  const people = p.members.map((n) => `<option value="${esc(n)}">`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src '${SCRIPT_HASH}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${POLL_CSS}</style></head><body data-poll="${esc(p.id)}"><main><h1 id="t">${esc(title)}</h1><p class="sub">${esc(kindLabel(p.kind))}: tick the dates you can make</p><p class="note">Nothing you do on this page is sent anywhere. At the end you get a short code. Send that code back to the person who sent you this file (text, chat or email).</p><label class="n" for="who">Your name</label><input type="text" id="who" maxlength="40" list="people" autocomplete="off" placeholder="Type your name"><datalist id="people">${people}</datalist><ol>${rows}</ol><button type="button" id="go">Get my reply code</button><p id="msg" role="status"></p><div id="out" hidden><p><b>Your reply code.</b> Send it back to whoever sent you this file.</p><textarea id="code" rows="4" readonly aria-label="Your reply code"></textarea><div class="row"><button type="button" class="s" id="copy">Copy code</button><a class="btn" id="mail" href="mailto:">Email it</a><span id="copied" role="status"></span></div></div><p class="foot">The code is not secret and does not prove who you are. Anyone who has this file can answer. The organiser only sees what people send back, and answering again with the same name replaces your earlier answer.</p></main><script>${POLL_SCRIPT}</script></body></html>`;
}

/** A file name for the poll file. */
export const pollFileName = (poll) => `${(cleanText(poll.title, 40) || 'poll').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'poll'}-availability-poll.html`;

/** The message to send along with the file. */
export function inviteText(poll) {
  const p = normalizePoll(poll);
  return `${p.title || kindLabel(p.kind)}: open the attached file in your browser, tick Yes, Maybe or No for each date, press “Get my reply code” and send me the code it shows.`;
}
