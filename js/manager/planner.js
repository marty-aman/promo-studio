// Show planner logic: venues, scene bands, contacts, the pitch email, a show's to-do list and the
// break-even maths. Pure functions so they can be unit tested.
import { mid, addDays } from './model.js';

export const VENUE_STATUSES = [['new', 'Not contacted'], ['pitched', 'Pitched'], ['talking', 'Talking'], ['booked', 'Booked a show'], ['played', 'Played here'], ['no', 'Not a fit']];
export const BAND_STATUSES = [['new', 'Want to play with'], ['contacted', 'Reached out'], ['talking', 'Talking'], ['played', 'Played together'], ['no', 'Not a fit']];
export const CONTACT_ROLES = [['promoter', 'Promoter / booker'], ['sound', 'Sound engineer'], ['photo', 'Photographer'], ['video', 'Videographer'], ['press', 'Press / blog'], ['radio', 'Radio'], ['playlist', 'Playlist curator'], ['merch', 'Merch / print'], ['studio', 'Studio'], ['other', 'Other']];

const str = (v, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const url = (v) => (/^https?:\/\/[^\s"'<>]+$/i.test(str(v, 500)) ? str(v, 500) : '');
const email = (v) => (/^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i.test(str(v, 200)) ? str(v, 200) : '');

/** A venue from the researched starter list, in the shape the app keeps (checked and trimmed). */
export function venueFromSeed(v) {
  const b = v.booking || {};
  return {
    id: `seed-v-${str(v.id, 60) || mid('v')}`,
    seed: true,
    verified: false,
    name: str(v.name, 120),
    city: str(v.city, 60),
    neighborhood: str(v.neighborhood, 80),
    address: str(v.address, 200),
    capacity: Number.isFinite(v.capacity) ? v.capacity : null,
    capacityNote: str(v.capacityNote),
    size: ['small', 'mid', 'large'].includes(v.size) ? v.size : '',
    ages: str(v.ages, 80),
    genres: Array.isArray(v.genres) ? v.genres.map((g) => str(g, 40)).filter(Boolean).slice(0, 8) : [],
    website: url(v.website),
    instagram: url(v.instagram),
    bookingEmail: email(b.email),
    bookingForm: url(b.formUrl),
    bookingPerson: str(b.person, 120),
    howToBook: str(b.how, 600),
    goodFor: str(v.goodFor, 200),
    notes: str(v.notes, 800),
    sources: Array.isArray(v.sources) ? v.sources.map(url).filter(Boolean).slice(0, 6) : [],
    status: 'new',
    lastContact: '',
    myNotes: '',
  };
}

export function newVenue(name = 'New venue') {
  return { ...venueFromSeed({ name, city: 'Seattle' }), id: mid('venue'), seed: false, verified: true };
}

const SOCIALS = ['instagram', 'tiktok', 'spotify', 'bandcamp', 'youtube', 'website', 'facebook'];
export function bandFromSeed(b) {
  const s = b.socials || {};
  return {
    id: `seed-b-${str(b.id, 60) || mid('b')}`,
    seed: true,
    verified: false,
    name: str(b.name, 120),
    city: str(b.city, 60),
    genres: Array.isArray(b.genres) ? b.genres.map((g) => str(g, 40)).filter(Boolean).slice(0, 6) : [],
    socials: Object.fromEntries(SOCIALS.map((k) => [k, url(s[k])])),
    followers: b.followers && Number.isFinite(b.followers.instagram) ? { instagram: b.followers.instagram, seenOn: str(b.followers.seenOn, 20) } : null,
    soundsLike: str(b.soundsLike, 200),
    playsAt: Array.isArray(b.playsAt) ? b.playsAt.map((x) => str(x, 80)).filter(Boolean).slice(0, 8) : [],
    active: str(b.active, 200),
    notes: str(b.notes, 600),
    sources: Array.isArray(b.sources) ? b.sources.map(url).filter(Boolean).slice(0, 6) : [],
    status: 'new',
    contact: '',
    myNotes: '',
  };
}
export function newBand(name = 'New band') {
  return { ...bandFromSeed({ name, city: 'Seattle' }), id: mid('band'), seed: false, verified: true };
}
export const newContact = (name = '') => ({ id: mid('contact'), name, role: 'promoter', org: '', email: '', phone: '', social: '', notes: '' });
export { SOCIALS };

/** Add starter entries that aren't there yet (by id), leaving edited and own entries alone. */
export function mergeSeed(list, seeds) {
  const have = new Set(list.map((x) => x.id));
  return [...list, ...seeds.filter((s) => !have.has(s.id))];
}

/** Venues matching the filters: { q, size, ages: 'all' | '', city }. */
export function filterVenues(list, { q = '', size = '', ages = '', city = '' } = {}) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((v) => {
    if (size && v.size !== size) return false;
    if (ages === 'all' && !/all ages/i.test(v.ages)) return false;
    if (city && v.city !== city) return false;
    const hay = `${v.name} ${v.city} ${v.neighborhood} ${v.genres.join(' ')} ${v.goodFor} ${v.notes} ${v.myNotes}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Venues that suit a band expecting `draw` people: the room should look full, not empty. */
export function venueFit(v, draw) {
  if (!draw || !v.capacity) return '';
  const r = draw / v.capacity;
  return r >= 0.6 ? 'good' : r >= 0.3 ? 'stretch' : 'too big';
}

/**
 * The pitch email for a venue. Bookers ask for the same things: who you are, what you sound
 * like, links, a realistic draw, dates, and the lineup you can bring.
 */
export function pitchEmail({ band, venue, dates = [], draw = '', lineup = [], links = [], similar = '', extra = '' }) {
  const name = band.name || 'our band';
  const subject = `Booking inquiry: ${name}${dates.length ? ` · ${dates.join(' / ')}` : ''}`;
  const lines = [
    `Hi${venue.bookingPerson ? ` ${venue.bookingPerson.split(/[ ,(]/)[0]}` : ''},`,
    '',
    `We’re ${name}, ${band.genres ? `${/^[aeiou]/i.test(band.genres) ? 'an' : 'a'} ${band.genres} band` : 'a band'} from ${band.city || 'Seattle'}, and we’d love to play ${venue.name || 'your room'}.`,
    similar ? `For fans of ${similar}.` : '',
    '',
    dates.length ? `Dates that work for us: ${dates.join(', ')}.` : 'We’re flexible on dates over the next couple of months.',
    lineup.length ? `We can bring a full bill: ${lineup.join(', ')}.` : '',
    draw ? `We usually bring around ${draw} people in Seattle.` : '',
    '',
    links.length ? 'Listen / watch:' : '',
    ...links.map((l) => `- ${l}`),
    extra || '',
    '',
    'Thanks for your time,',
    name,
  ];
  const body = lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim();
  return { to: venue.bookingEmail || '', subject, body };
}
export const mailtoLink = ({ to, subject, body }) => `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

/** A show's to-do list, counted back from the show date (days). */
export const SHOW_TODO = [
  [-60, 'Pitch the venue and hold the date'],
  [-45, 'Confirm the lineup and the deal in writing'],
  [-35, 'Flyer / poster made (all bands tagged)'],
  [-30, 'Ticket link live, announce the show'],
  [-21, 'Promo post: flyer and ticket link'],
  [-14, 'Promo post: clip from a past show'],
  [-7, 'Promo post: one week out, tag the other bands'],
  [-3, 'Advance the show: load-in, set times, backline, guest list'],
  [-1, 'Promo post: tomorrow night'],
  [0, 'Show day: stories, merch table, photos'],
  [1, 'Settle up, thank the venue and bands, post photos'],
];
export const showTodo = () => SHOW_TODO.map(([offset, text]) => ({ id: mid('todo'), offset, text, done: false }));
export const todoDue = (show, t) => (show.date ? addDays(show.date, t.offset) : '');

/** How many tickets cover the costs: ceil(costs / (price × your share)). */
export function breakEven({ price = 0, share = 1, costs = 0 }) {
  const per = +price * +share;
  if (!(per > 0)) return null;
  return Math.ceil(Math.max(0, +costs) / per);
}
