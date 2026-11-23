// Outreach: blogs, playlist curators, radio, podcasts and press you pitch that are NOT a song's own
// playlist pitch (those stay on song.pitches, see press.js). One artist-level list, `m.outreach`.
// The app sends nothing itself: "Draft email" opens your own mail app. Pure functions, unit tested.
import { mid, addDays, parseDate, registerAgendaSource } from './model.js';
import { newPitch, curatorPitch, submitPitch } from './press.js';
import { mailtoLink } from './planner.js';
import { shortBio, EPK_LINKS } from './extras.js';

export const OUTREACH_TYPES = [['blog', 'Blog'], ['curator', 'Playlist curator'], ['radio', 'Radio'], ['podcast', 'Podcast'], ['press', 'Press'], ['other', 'Other']];
export const OUTREACH_STATUSES = [['idea', 'Idea'], ['drafted', 'Drafted'], ['sent', 'Sent'], ['replied', 'Replied'], ['placed', 'Placed'], ['passed', 'Passed']];
export const FOLLOW_UP_DAYS = 7;

const str = (v, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const day = (v) => (parseDate(v) ? v : '');
export const validEmail = (v) => /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i.test(v || '');
const httpUrl = (v) => (/^https?:\/\/[^\s"'<>]+$/i.test(str(v, 500)) ? str(v, 500) : '');

/** A new outreach target. The fields it shares with a song's pitch come from newPitch (press.js). */
export function newOutreach(fields = {}) {
  const { contact, sent, followUp, followedUp, notes } = newPitch();
  return { id: mid('out'), name: '', type: 'blog', contact, email: '', url: '', songId: '', sent, status: 'idea', followUp, followedUp, notes, log: [], ...fields };
}

/** The list from a save, checked. Unknown fields on an item are kept. */
export function normalizeOutreach(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o) => o && typeof o === 'object' && typeof o.id === 'string')
    .map((o) => ({
      ...o,
      name: str(o.name, 160),
      type: OUTREACH_TYPES.some(([k]) => k === o.type) ? o.type : 'other',
      contact: str(o.contact, 160),
      email: str(o.email, 200),
      url: httpUrl(o.url),
      songId: typeof o.songId === 'string' ? o.songId : '',
      sent: day(o.sent),
      status: OUTREACH_STATUSES.some(([k]) => k === o.status) ? o.status : 'idea',
      followUp: day(o.followUp),
      followedUp: o.followedUp === true,
      notes: str(o.notes, 4000),
      log: Array.isArray(o.log) ? o.log.filter((l) => l && typeof l === 'object' && day(l.date)).map((l) => ({ date: l.date, text: str(l.text, 300) })).slice(-50) : [],
    }));
}

/** Mark an item sent today: status Sent, follow-up in a week (editable afterwards), a line in its log. */
export function markSent(o, today, days = FOLLOW_UP_DAYS) {
  o.sent = today;
  o.status = 'sent';
  o.followUp = addDays(today, days);
  o.followedUp = false;
  o.log = [...(o.log || []), { date: today, text: 'Sent' }];
  return o;
}

/** Set a status, noting it in the log. Sent goes through markSent so it gets its follow-up date. */
export function setOutreachStatus(o, status, today) {
  if (status === o.status) return o;
  if (status === 'sent') return markSent(o, today);
  o.status = status;
  o.log = [...(o.log || []), { date: today, text: (OUTREACH_STATUSES.find(([k]) => k === status) || [, status])[1] }];
  return o;
}

/** Items matching { type, status } ('' = any). */
export const filterOutreach = (list, { type = '', status = '' } = {}) => list.filter((o) => (!type || o.type === type) && (!status || o.status === status));

/**
 * The stats row: sent counts everything that went out (Sent, Replied, Placed, Passed, or with a
 * sent date); replied counts Replied and Placed (a placement is a reply); placed counts Placed.
 */
export function outreachStats(list) {
  const out = list.filter((o) => o.sent || ['sent', 'replied', 'placed', 'passed'].includes(o.status));
  return { total: list.length, sent: out.length, replied: list.filter((o) => o.status === 'replied' || o.status === 'placed').length, placed: list.filter((o) => o.status === 'placed').length };
}

/** A follow-up is due when the item is Sent, has a follow-up date and was not followed up yet. */
export const outreachFollowUpDue = (o) => o.status === 'sent' && !o.followedUp && !!o.followUp;

/**
 * Agenda source: one "Follow up" task per item that is still Sent. Replied, placed and passed items
 * are finished and never show (the agenda rule for released and cancelled things). Only the outlet's
 * name goes in the title, never the contact person or email, because calendar exports carry it.
 */
export function outreachAgenda(m, from, to, inRange) {
  return normalizeOutreach(m.outreach)
    .filter((o) => outreachFollowUpDue(o) && inRange(o.followUp))
    .map((o) => ({ date: o.followUp, kind: 'task', key: `outreach-${o.id}`, title: `Follow up: ${o.name || 'outreach'}`, sub: `Outreach · ${(OUTREACH_TYPES.find(([k]) => k === o.type) || [, 'Other'])[1]}`, ref: { page: 'content', id: o.id, tab: 'outreach' } }));
}
registerAgendaSource(outreachAgenda);

/** The band's own links for the bottom of an email (http and https only). */
function bandLinks(band) {
  return EPK_LINKS.map(([k, l]) => [l, httpUrl((band.links || {})[k])]).filter(([, u]) => u);
}

/**
 * The email for one item, or for several at once (`items` longer than one: a generic greeting, and
 * the addresses go in BCC so nobody sees the others). With a song, the text comes from press.js:
 * curatorPitch for playlist curators, submitPitch for everyone else. Returns { to, bcc, subject, body }.
 */
export function outreachEmail(items, m, { song = null, today = '' } = {}) {
  const list = Array.isArray(items) ? items : [items];
  const one = list.length === 1 ? list[0] : null;
  const emails = [...new Set(list.map((o) => o.email).filter(validEmail))];
  const b = m.band || {};
  const name = b.name || 'our band';
  const greet = (one && (one.contact || '').split(/[ ,(]/)[0]) || 'there';
  const links = bandLinks(b);
  let subject;
  let body;
  if (song && one && one.type === 'curator') {
    ({ subject, body } = curatorPitch(song, m, { curator: greet === 'there' ? '' : greet, playlist: one.name, today }));
  } else {
    const songLinks = song ? Object.values(song.links || {}).map(httpUrl).filter(Boolean).slice(0, 2) : [];
    subject = song ? `New music: ${name} – “${song.title}”` : `${name}${b.city ? ` (${b.city})` : ''}: introduction`;
    body = [
      `Hi ${greet},`,
      '',
      one && one.name ? `I’m reaching out from ${name} about ${one.name}.` : `I’m reaching out from ${name}.`,
      song ? submitPitch(song, m, { today }) : shortBio(b.bio) || `We’re ${name}${b.genres ? `, ${b.genres}` : ''}${b.city ? ` from ${b.city}` : ''}.`,
      '',
      songLinks.length ? `Listen: ${songLinks.join('  ')}` : '',
      links.length ? links.map(([l, u]) => `${l}: ${u}`).join('\n') : '',
      '',
      'Thanks for your time,',
      b.contactName || name,
    ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim();
  }
  return one ? { to: emails[0] || '', bcc: [], subject, body } : { to: '', bcc: emails, subject, body };
}

/** The mailto link for outreachEmail's result; several addresses go in BCC. */
export function outreachMailto(mail) {
  const base = mailtoLink({ to: mail.to || '', subject: mail.subject, body: mail.body });
  return mail.bcc && mail.bcc.length ? `${base}&bcc=${encodeURIComponent(mail.bcc.join(','))}` : base;
}

/** Every song's playlist pitches, for the read-only list on the Outreach tab: [{ song, pitch }], newest first. */
export const songPitches = (m) =>
  (m.songs || []).flatMap((song) => (song.pitches || []).map((pitch) => ({ song, pitch }))).sort((a, b) => (b.pitch.sent || '').localeCompare(a.pitch.sent || ''));
