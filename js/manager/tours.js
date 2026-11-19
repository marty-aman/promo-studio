// Tours: a run of stops (city, dates, status), each with a venue shortlist and the money for that
// night. Venues come from two free sources:
//  - OpenStreetMap: live-music places near the city (Nominatim finds the city, Overpass the venues).
//  - setlist.fm: rooms where bands from your "for fans of" list played in that city. setlist.fm
//    needs a free API key and doesn't allow calls from web pages, so the local server passes the
//    request on (see server.js); on a static host you get search links instead.
// Distances are straight lines between cities; drive time is a rough guess from them.
import { venueFromSeed } from './planner.js';
import { newShow, mid } from './model.js';
import { showTodo } from './planner.js';
import { esc, escBr, docHTML } from './pdf.js';

export const STOP_STATUSES = [['looking', 'Looking for a venue'], ['pitched', 'Pitched'], ['hold', 'On hold'], ['confirmed', 'Confirmed'], ['dropped', 'Dropped']];
export const PICK_STATUSES = [['idea', 'Idea'], ['pitched', 'Pitched'], ['talking', 'Talking'], ['no', 'Said no'], ['yes', 'Said yes']];

const str = (v, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v) => (v === '' || v == null || Number.isNaN(+v) ? 0 : +v);
const url = (v) => (/^https?:\/\/[^\s"'<>]+$/i.test(str(v, 500)) ? str(v, 500) : '');

export const newTour = (name = 'New tour', today = '') => ({ id: mid('tour'), name, start: today, units: 'mi', gasRate: 0.2, notes: '', stops: [] });
export function newStop(place = {}) {
  return {
    id: mid('stop'),
    city: str(place.city || place.name, 80),
    region: str(place.region, 80),
    country: str(place.country, 60),
    lat: Number.isFinite(+place.lat) ? +place.lat : null,
    lon: Number.isFinite(+place.lon) ? +place.lon : null,
    date: '',
    status: 'looking',
    picks: [], // the venue shortlist: { id, venueId, status, note }
    guarantee: '',
    merch: '',
    gas: '',
    lodging: '',
    notes: '',
    showId: null,
  };
}

/** Fill in anything an older or hand-edited tour list is missing. */
export function normalizeTours(raw) {
  const list = Array.isArray(raw) ? raw.filter((t) => t && typeof t === 'object' && typeof t.id === 'string') : [];
  return list.map((t) => ({
    ...newTour(),
    ...t,
    stops: (Array.isArray(t.stops) ? t.stops : []).filter((s) => s && typeof s === 'object').map((s) => ({ ...newStop(), ...s, id: s.id || mid('stop'), picks: (Array.isArray(s.picks) ? s.picks : []).filter((p) => p && p.venueId) })),
  }));
}

// ---------------------------------------------------------------- distance and money
const KM_PER_MI = 1.609344;
/** Straight-line distance between two points in km. */
export function haversineKm(a, b) {
  if (![a?.lat, a?.lon, b?.lat, b?.lon].every(Number.isFinite)) return null;
  const R = 6371;
  const r = (d) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLon = r(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
/** Roads are about 1.25 × the straight line; 55 mph (88 km/h) average with stops. A guess, not a route. */
export const ROAD_FACTOR = 1.25;
export const AVG_KMH = 88;

/**
 * Each leg between consecutive stops (in date order as listed): straight-line distance, a rough
 * road distance and drive time, in the tour's units.
 */
export function tourLegs(tour) {
  const legs = [];
  for (let i = 1; i < tour.stops.length; i++) {
    const km = haversineKm(tour.stops[i - 1], tour.stops[i]);
    const road = km == null ? null : km * ROAD_FACTOR;
    legs.push({
      from: tour.stops[i - 1].id,
      to: tour.stops[i].id,
      km,
      dist: road == null ? null : Math.round(tour.units === 'km' ? road : road / KM_PER_MI),
      hours: road == null ? null : Math.round((road / AVG_KMH) * 10) / 10,
    });
  }
  return legs;
}

/** Gas to reach a stop: what you typed, or the rough road distance × your cost per mile/km. */
export function stopGas(tour, stop, leg) {
  if (stop.gas !== '' && stop.gas != null) return num(stop.gas);
  return leg && leg.dist != null ? Math.round(leg.dist * num(tour.gasRate)) : 0;
}

/** Money for each stop and the whole tour: guarantee + merch − gas − lodging. */
export function tourMoney(tour) {
  const legs = tourLegs(tour);
  const rows = tour.stops.map((s, i) => {
    const leg = i ? legs[i - 1] : null;
    const gas = stopGas(tour, s, leg);
    const income = num(s.guarantee) + num(s.merch);
    const costs = gas + num(s.lodging);
    return { id: s.id, income, gas, lodging: num(s.lodging), costs, net: income - costs, gasGuessed: s.gas === '' || s.gas == null };
  });
  const sum = (k) => rows.filter((r, i) => tour.stops[i].status !== 'dropped').reduce((a, r) => a + r[k], 0);
  const dist = legs.reduce((a, l) => a + (l.dist || 0), 0);
  const hours = legs.reduce((a, l) => a + (l.hours || 0), 0);
  return { rows, legs, income: sum('income'), costs: sum('costs'), net: sum('income') - sum('costs'), dist, hours: Math.round(hours * 10) / 10 };
}

// ---------------------------------------------------------------- OpenStreetMap
export const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
export const OVERPASS = 'https://overpass-api.de/api/interpreter';

/** Nominatim search URL for a city (one request per search you start; their usage policy allows 1 per second). */
export const geocodeURL = (q) => `${NOMINATIM}?${new URLSearchParams({ format: 'jsonv2', addressdetails: '1', limit: '5', featureType: 'city', q: String(q).slice(0, 120) })}`;

/** Places from a Nominatim answer: { name, label, lat, lon, region, country }. */
export function parsePlaces(json) {
  return (Array.isArray(json) ? json : [])
    .map((p) => {
      const a = p.address || {};
      const name = a.city || a.town || a.village || a.municipality || p.name || '';
      return { name: str(name, 80), label: str(p.display_name, 200), lat: +p.lat, lon: +p.lon, region: str(a.state || a.region || a.county, 80), country: str(a.country, 60) };
    })
    .filter((p) => p.name && Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

/**
 * Overpass query for live-music places within `radiusKm` of a point: music venues, nightclubs,
 * concert halls, and bars, pubs and cafés tagged as having live music.
 */
export function venueQuery(lat, lon, radiusKm = 15) {
  const r = Math.round(Math.min(50, Math.max(1, radiusKm)) * 1000);
  const at = `(around:${r},${(+lat).toFixed(5)},${(+lon).toFixed(5)})`;
  return `[out:json][timeout:25];
(
  nwr["amenity"="music_venue"]${at};
  nwr["amenity"="nightclub"]${at};
  nwr["amenity"="concert_hall"]${at};
  nwr["live_music"="yes"]["name"]${at};
);
out center tags 300;`;
}

const KIND = { music_venue: 'Music venue', nightclub: 'Nightclub', concert_hall: 'Concert hall', bar: 'Bar', pub: 'Pub', cafe: 'Café', biergarten: 'Beer garden', events_venue: 'Event space', community_centre: 'Community centre', arts_centre: 'Arts centre' };

/** Venues from an Overpass answer, named ones only, closest first when a centre is given. */
export function parseOSMVenues(json, centre = null) {
  const seen = new Set();
  const out = [];
  for (const e of (json && json.elements) || []) {
    const t = e.tags || {};
    if (!t.name) continue;
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    const key = `${t.name.toLowerCase()}|${Math.round((lat || 0) * 500)}|${Math.round((lon || 0) * 500)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const addr = [[t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' '), t['addr:city']].filter(Boolean).join(', ');
    const cap = parseInt(t.capacity, 10);
    out.push({
      osmId: `${e.type}/${e.id}`,
      name: str(t.name, 120),
      kind: KIND[t.amenity] || (t.live_music === 'yes' ? 'Live music' : 'Venue'),
      address: str(addr, 200),
      city: str(t['addr:city'], 60),
      website: url(t.website || t['contact:website'] || t.url),
      instagram: url(t['contact:instagram']),
      phone: str(t.phone || t['contact:phone'], 40),
      email: str(t.email || t['contact:email'], 120),
      capacity: Number.isFinite(cap) ? cap : null,
      liveMusic: t.live_music === 'yes' || t.amenity === 'music_venue' || t.amenity === 'concert_hall',
      lat,
      lon,
      km: centre && Number.isFinite(lat) ? Math.round(haversineKm(centre, { lat, lon }) * 10) / 10 : null,
    });
  }
  return out.sort((a, b) => (b.liveMusic - a.liveMusic) || (a.km ?? 99) - (b.km ?? 99));
}

/** A venue for the shared venue list from an OpenStreetMap place (marked "check before you reach out"). */
export function venueFromOSM(o, city = '') {
  const v = venueFromSeed({
    id: `osm-${o.osmId.replace('/', '-')}`,
    name: o.name,
    city: o.city || city,
    address: o.address,
    capacity: o.capacity,
    website: o.website,
    instagram: o.instagram,
    booking: { email: o.email },
    notes: [o.kind, o.phone && `Phone: ${o.phone}`].filter(Boolean).join(' · '),
    sources: [`https://www.openstreetmap.org/${o.osmId}`],
  });
  return { ...v, id: `osm-${o.osmId.replace('/', '-')}`, seed: false, verified: false, osm: o.osmId };
}

// ---------------------------------------------------------------- setlist.fm
/** The local server's pass-through to setlist.fm (see server.js). */
export const SETLIST_PROXY = '/api/setlistfm/search/setlists';
export const setlistSearchURL = (artist, city) => `${SETLIST_PROXY}?${new URLSearchParams({ artistName: String(artist).slice(0, 100), cityName: String(city).slice(0, 80), p: '1' })}`;
/** setlist.fm's own search page, for when the API can't be used. */
export const setlistLink = (artist, city) => `https://www.setlist.fm/search?${new URLSearchParams({ query: `${artist} ${city}`.trim() })}`;

/** Bands from a "for fans of" list ("Bad Omens, Spiritbox and Deftones"). */
export const fansOf = (s) => String(s || '').split(/,|\/|;|\band\b|&/i).map((x) => x.trim()).filter(Boolean).slice(0, 8);

/** setlist.fm "dd-MM-yyyy" → "yyyy-MM-dd". */
const isoFromSL = (d) => (/^(\d{2})-(\d{2})-(\d{4})$/.test(d || '') ? d.replace(/^(\d{2})-(\d{2})-(\d{4})$/, '$3-$2-$1') : '');

/** Shows from a setlist.fm search answer: { artist, date, venue, city, region, country, lat, lon, url }. */
export function parseSetlists(json) {
  return ((json && json.setlist) || [])
    .map((s) => {
      const v = s.venue || {};
      const c = v.city || {};
      return { artist: str(s.artist?.name, 120), date: isoFromSL(s.eventDate), venue: str(v.name, 120), city: str(c.name, 80), region: str(c.state, 80), country: str(c.country?.name, 60), lat: c.coords?.lat ?? null, lon: c.coords?.long ?? null, url: url(s.url) };
    })
    .filter((s) => s.venue);
}

/** Rooms in those shows, most bands first, then most recent: { venue, city, bands, count, last, url }. */
export function similarVenues(shows) {
  const by = new Map();
  for (const s of shows) {
    const k = `${s.venue.toLowerCase()}|${s.city.toLowerCase()}`;
    const x = by.get(k) || { venue: s.venue, city: s.city, region: s.region, bands: new Set(), count: 0, last: '', url: s.url };
    x.bands.add(s.artist);
    x.count++;
    if (s.date > x.last) (x.last = s.date), (x.url = s.url || x.url);
    by.set(k, x);
  }
  return [...by.values()].map((x) => ({ ...x, bands: [...x.bands] })).sort((a, b) => b.bands.length - a.bands.length || b.last.localeCompare(a.last));
}

/** A shared venue for a room found on setlist.fm. */
export function venueFromSetlist(x) {
  const slug = `${x.venue}-${x.city}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const v = venueFromSeed({ id: `sl-${slug}`, name: x.venue, city: x.city, notes: `Similar bands played here: ${x.bands.join(', ')}${x.last ? ` (last ${x.last})` : ''}.`, sources: x.url ? [x.url] : [] });
  return { ...v, id: `sl-${slug}`, seed: false, verified: false };
}

// ---------------------------------------------------------------- turning a stop into a show
/** A show for a confirmed stop, with the standard to-do list. */
export function showFromStop(stop, venue, band = {}) {
  return {
    ...newShow(stop.date),
    venue: venue ? venue.name : '',
    venueId: venue ? venue.id : null,
    city: stop.city,
    billing: 'support',
    status: 'confirmed',
    deal: stop.guarantee ? `$${num(stop.guarantee)} guarantee` : '',
    contact: venue ? venue.bookingEmail || venue.bookingPerson || '' : '',
    lineup: band.name ? [{ id: mid('lu'), name: band.name, time: '' }] : [],
    todo: showTodo(),
    notes: stop.notes || '',
  };
}

// ---------------------------------------------------------------- tour sheet
export function tourHTML(tour, { venues = [], band = {}, statusLabel = (k) => k } = {}) {
  const money = tourMoney(tour);
  const $ = (v) => `${v < 0 ? '−' : ''}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
  const venueOf = (id) => venues.find((v) => v.id === id);
  const rows = tour.stops.map((s, i) => {
    const leg = i ? money.legs[i - 1] : null;
    const r = money.rows[i];
    const yes = s.picks.find((p) => p.status === 'yes') || null;
    const v = yes && venueOf(yes.venueId);
    const short = s.picks.map((p) => venueOf(p.venueId)).filter(Boolean).map((x) => x.name);
    return `<tr><td>${esc(s.date || 'TBD')}</td><td><b>${esc(s.city)}</b>${s.region ? `, ${esc(s.region)}` : ''}</td><td>${esc(statusLabel(s.status))}</td><td>${v ? `<b>${esc(v.name)}</b>` : short.length ? esc(short.slice(0, 3).join(', ')) : '<span class="muted">—</span>'}</td><td class="n">${leg && leg.dist != null ? `${leg.dist} ${tour.units} · ${leg.hours} h` : ''}</td><td class="n">${$(r.income)}</td><td class="n">${$(-r.costs)}</td><td class="n"><b>${$(r.net)}</b></td></tr>`;
  }).join('');
  const body = `<table><tr><th>Date</th><th>City</th><th>Status</th><th>Venue</th><th class="n">Drive (rough)</th><th class="n">In</th><th class="n">Out</th><th class="n">Net</th></tr>${rows}
<tr><th colspan="4">Total (dropped stops left out)</th><th class="n">${money.dist} ${tour.units} · ${money.hours} h</th><th class="n">${$(money.income)}</th><th class="n">${$(-money.costs)}</th><th class="n">${$(money.net)}</th></tr></table>
<p class="small muted">Drive distances are straight lines × ${ROAD_FACTOR} at about ${Math.round(AVG_KMH / KM_PER_MI)} mph: plan the real route in a map app. Gas is your cost per ${tour.units} unless you typed it.</p>
${tour.stops.filter((s) => s.picks.length || s.notes).map((s) => `<h2>${esc(s.city)}${s.date ? ` · ${esc(s.date)}` : ''}</h2>${s.picks.length ? `<table><tr><th>Venue</th><th>Status</th><th>Contact</th><th>Note</th></tr>${s.picks.map((p) => {
    const v = venueOf(p.venueId);
    return v ? `<tr><td>${esc(v.name)}${v.address ? `<br><span class="small muted">${esc(v.address)}</span>` : ''}</td><td>${esc(p.status)}</td><td class="small">${esc([v.bookingEmail, v.website].filter(Boolean).join(' · '))}</td><td>${esc(p.note || '')}</td></tr>` : '';
  }).join('')}</table>` : ''}${s.notes ? `<p>${escBr(s.notes)}</p>` : ''}`).join('')}
${tour.notes ? `<h2>Notes</h2><p>${escBr(tour.notes)}</p>` : ''}`;
  return docHTML(`${band.name ? `${band.name} · ` : ''}${tour.name}`, body, { subtitle: `${tour.stops.length} stops` });
}
