// Opportunities: grants, festival and showcase calls, contests and residencies, in the SHARED
// `opportunities` key (every artist sees one list). A researched starter list is added once
// (seeded.opps); after that your edits and deletions stick. Deadline reminders go to the Calendar
// and Home through registerAgendaSource. Pure functions, unit tested.
import { mid, addDays, todayISO, registerAgendaSource } from './model.js';

export const OPP_KINDS = [['grant', 'Grant'], ['festival', 'Festival'], ['contest', 'Contest'], ['showcase', 'Showcase'], ['residency', 'Residency'], ['other', 'Other']];
export const OPP_STATUSES = [['interested', 'Interested'], ['planning', 'Planning'], ['applied', 'Applied'], ['won', 'Won'], ['passed', 'Passed']];
/** Statuses with nothing left to chase: no reminders. */
const DONE = new Set(['applied', 'won', 'passed']);
/** How many days before a deadline the reminders come. */
export const OPP_REMIND = [14, 3];

const str = (v, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' ? String(v) : '');
const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');
const url = (v) => (/^https?:\/\/[^\s"'<>]+$/i.test(str(v, 500)) ? str(v, 500) : '');
export const kindLabel = (k) => (OPP_KINDS.find(([v]) => v === k) || ['', 'Other'])[1];
export const statusLabel = (k) => (OPP_STATUSES.find(([v]) => v === k) || ['', 'Interested'])[1];

export function normalizeOpp(o) {
  const x = o && typeof o === 'object' ? o : {};
  return {
    ...x, // unknown fields are kept (the list is shared, another build may add some)
    id: str(x.id, 80) || mid('opp'),
    kind: OPP_KINDS.some(([k]) => k === x.kind) ? x.kind : 'other',
    name: str(x.name, 160),
    org: str(x.org, 160),
    url: url(x.url),
    deadline: day(x.deadline),
    region: str(x.region, 120),
    fee: str(x.fee, 80),
    notes: str(x.notes, 2000),
    status: OPP_STATUSES.some(([k]) => k === x.status) ? x.status : 'interested',
    checked: day(x.checked),
    seed: x.seed === true,
  };
}
export const normalizeOpps = (list) => (Array.isArray(list) ? list.filter((x) => x && typeof x === 'object').map(normalizeOpp) : []);
export const newOpp = (fields = {}) => normalizeOpp({ kind: 'grant', status: 'interested', ...fields, id: mid('opp') });

/** Days until the deadline (negative once it has passed), or null when there's none. */
export const daysLeft = (o, today) => (o.deadline ? Math.round((Date.parse(o.deadline) - Date.parse(today)) / 86400000) : null);

/** Filter: { kind, status, region (text match), q }; sort: 'deadline' (soonest open first, then no date, then closed) | 'name' | 'status'. */
export function filterOpps(list, { kind = '', status = '', region = '', q = '', sort = 'deadline', today = todayISO() } = {}) {
  const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
  const reg = String(region).toLowerCase().trim();
  const out = normalizeOpps(list).filter((o) => {
    if (kind && o.kind !== kind) return false;
    if (status && o.status !== status) return false;
    if (reg && !o.region.toLowerCase().includes(reg)) return false;
    const hay = `${o.name} ${o.org} ${o.region} ${o.notes}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const band = (o) => (!o.deadline ? 1 : o.deadline >= today ? 0 : 2);
  const by = {
    deadline: (a, b) => band(a) - band(b) || (band(a) === 2 ? b.deadline.localeCompare(a.deadline) : a.deadline.localeCompare(b.deadline)) || a.name.localeCompare(b.name),
    name: (a, b) => a.name.localeCompare(b.name),
    status: (a, b) => OPP_STATUSES.findIndex(([k]) => k === a.status) - OPP_STATUSES.findIndex(([k]) => k === b.status) || a.name.localeCompare(b.name),
  }[sort];
  return by ? out.sort(by) : out;
}

/**
 * Deadline reminders: "Deadline in 14 days" and "Deadline in 3 days", for opportunities you're still
 * after (not applied, won or passed) whose deadline hasn't gone by. When the 3-day one is due the
 * 14-day one is dropped, so a late item never shows twice.
 */
export function oppReminders(list, today, inRange) {
  const out = [];
  for (const o of normalizeOpps(list)) {
    if (!o.deadline || o.deadline < today || DONE.has(o.status)) continue;
    const [far, near] = OPP_REMIND;
    const dFar = addDays(o.deadline, -far);
    const dNear = addDays(o.deadline, -near);
    const sub = `${kindLabel(o.kind)} · closes ${o.deadline}${o.org ? ` · ${o.org}` : ''}`;
    if (dNear > today && inRange(dFar)) out.push({ date: dFar, kind: 'task', key: `opp-${o.id}-${far}`, title: `Deadline in ${far} days: ${o.name || 'opportunity'}`, sub, ref: { page: 'fans', id: o.id, tab: 'opps' } });
    if (inRange(dNear)) out.push({ date: dNear, kind: 'task', key: `opp-${o.id}-${near}`, title: `Deadline in ${near} days: ${o.name || 'opportunity'}`, sub, ref: { page: 'fans', id: o.id, tab: 'opps' } });
  }
  return out;
}
registerAgendaSource((m, from, to, inRange) => oppReminders(m.opportunities, todayISO(), inRange));

// ---- the researched starter list
// Bump SEED_OPPS_ON when entries are added; entries are added by id, so ones you deleted after the
// first seeding are not added back while the marker matches.
export const SEED_OPPS_ON = '2026-11-23';
const C = '2026-11-23'; // the day each entry was checked
/** Each entry: source URL and the day it was checked; a deadline only where the source states it for this cycle. */
export const SEED_OPPS = [
  { id: 'sxsw-2027', kind: 'showcase', name: 'SXSW 2027 Music Festival showcase', org: 'SXSW', url: 'https://www.sxsw.com/apply/showcase-applications', deadline: '2026-11-20', region: 'Austin, TX (international applicants)', fee: '$80 at the final deadline', notes: 'Festival March 15–21, 2027. The final application deadline was Nov 20, 2026; invitations by Dec 18, 2026. Worth planning for the 2028 cycle (applications opened in June this year).' },
  { id: 'nxne-2027', kind: 'festival', name: 'NXNE 2027 artist applications', org: 'NXNE', url: 'https://www.nxne.com/faq', deadline: '2026-12-31', region: 'Toronto, ON', fee: 'Free', notes: 'Festival June 16–20, 2027. Applications only through their site (no email). Offers go out from January on a rolling basis.' },
  { id: 'wacken-battle-usa-2027', kind: 'contest', name: 'Wacken Metal Battle USA 2027', org: 'Wacken Metal Battle', url: 'https://www.metal-battle.com/', deadline: '2026-12-01', region: 'USA (city battles, Seattle included)', fee: '', notes: 'For unsigned, independent US metal bands. Pick "United States" on the site. The winner plays Wacken Open Air, Germany, July 28–31, 2027.' },
  { id: 'treefort-2027', kind: 'festival', name: 'Treefort Music Fest 2027 submissions', org: 'Treefort Music Fest', url: 'https://treefort.submittable.com/submit', deadline: '2026-11-21', region: 'Boise, ID', fee: '$10, then $20 after Nov 1', notes: 'Festival March 31–April 4, 2027; paid sets. Read the 100-mile radius clause. Submissions for 2027 closed Nov 21; watch for the 2028 call in late summer.' },
  { id: 'bmw-booked-treefort', kind: 'showcase', name: 'BOOKED artist placement (Treefort 2027)', org: 'Book More Women', url: 'https://www.bookmorewomen.com/booked', deadline: '2026-11-28', region: 'Boise, ID', fee: '', notes: 'Artist placement program; its first placement is at Treefort 2027. Check who can apply on the site before you submit.' },
  { id: 'seattle-cityartist', kind: 'grant', name: 'CityArtist grant', org: 'Seattle Office of Arts & Culture', url: 'https://seattle.gov/arts/programs/grants/cityartist-grant', deadline: '', region: 'Seattle, WA', fee: 'Free', notes: '$8,000 awards for Seattle-based artists. The 2027 cycle is for dance, music and theater; awardees give a public presentation in Seattle. Disciplines rotate each year. Check the site for the next deadline.' },
  { id: 'seattle-artists-center', kind: 'grant', name: 'Artists at the Center (pop-up performances)', org: 'Seattle Office of Arts & Culture', url: 'https://www.seattle.gov/documents/Departments/Arts/Downloads/Grants/Artists%20at%20the%20Center/Guidelines-AATC2026.pdf', deadline: '', region: 'Seattle, WA', fee: 'Free', notes: 'Paid pop-up performances (music included), $2,000, $4,000 or $6,000 by group size. The 2026–27 season runs Oct 2026 to Sept 2027. Check the site for the next call.' },
  { id: '4culture-art-projects', kind: 'grant', name: 'Art Projects grant', org: '4Culture', url: 'https://www.4culture.org/grants/art-projects/', deadline: '', region: 'King County, WA', fee: 'Free', notes: 'Up to $15,000 for an art project of any medium shared with King County communities. Last cycle closed in March. Check the site for the next deadline.' },
  { id: 'artisttrust-gap', kind: 'grant', name: 'Grants for Artist Projects (GAP)', org: 'Artist Trust', url: 'https://artisttrust.org/gap-guidelines/', deadline: '', region: 'Washington State', fee: 'Free', notes: '$2,500 unrestricted project grants, about 65 a year, all disciplines. Check the site for the next deadline.' },
  { id: 'artisttrust-fellowship', kind: 'grant', name: 'Artist Trust Fellowship', org: 'Artist Trust', url: 'https://artisttrust.org/grants/', deadline: '', region: 'Washington State', fee: 'Free', notes: '$10,000 merit-based awards for practicing professional artists in Washington. Disciplines rotate. Check the site for the next deadline.' },
  { id: 'tacoma-taip', kind: 'grant', name: 'Tacoma Artists Initiative Program (TAIP)', org: 'Tacoma Arts Commission', url: 'https://cms.cityoftacoma.org/CEDD/TacomaCulture/arts/TA_TAIP_2526CallDraft.pdf', deadline: '', region: 'Tacoma, WA', fee: 'Free', notes: '$2,500 awards for Tacoma artists; projects must happen in Tacoma. Runs in two-year cycles. Check the site for the next call.' },
  { id: 'indie-week', kind: 'showcase', name: 'Indie Week Canada', org: 'Indie Week', url: 'https://indieweek.com/', deadline: '', region: 'Ottawa, ON', fee: '', notes: 'Showcases plus meetings with festival and venue bookers; open to Canadian and international artists. The 2026 call closed July 31. Check the site for the next call.' },
  { id: 'departure-toronto', kind: 'showcase', name: 'Departure Festival + Conference (was Canadian Music Week)', org: 'Departure', url: 'https://departureto.com/', deadline: '', region: 'Toronto, ON', fee: '', notes: 'Canadian Music Week was renamed Departure in late 2024. New-music festival and conference. Check the site for artist applications.' },
  { id: 'sonicbids', kind: 'other', name: 'Sonicbids gig and festival listings', org: 'Sonicbids', url: 'https://sonicbids.com/', deadline: '', region: 'North America and beyond', fee: 'Per submission (varies)', notes: 'A portal listing many festival, showcase and gig calls. Most charge a fee per submission; read each listing.' },
];
/** A starter entry in the shape the app keeps: seeded, with the day it was checked. */
export const oppFromSeed = (s) => normalizeOpp({ ...s, id: `seed-o-${s.id}`, status: 'interested', checked: C, seed: true });

/** Add the starter list once. Returns the list with seeds not yet there (by id) appended. */
export function seedOpps(list) {
  const have = new Set(normalizeOpps(list).map((o) => o.id));
  return [...(Array.isArray(list) ? list : []), ...SEED_OPPS.map(oppFromSeed).filter((o) => !have.has(o.id))];
}
/** Whether the starter list still has to be added: the marker isn't today's version. */
export const needsOppSeed = (m) => !m.seeded || m.seeded.opps !== SEED_OPPS_ON;
