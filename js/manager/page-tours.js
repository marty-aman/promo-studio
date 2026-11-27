// Tours: plan a run of shows city by city. Each stop has dates, a status, a venue shortlist found
// on OpenStreetMap or from where similar bands played (setlist.fm), the night's money, and the
// drive from the last stop. A confirmed stop becomes a show with its to-do list.
import { h, icon, button, iconButton, toast, keyBox } from '../dom.js';
import { askText } from '../asktext.js';
import { loadSettings, saveSettings } from '../state.js';
import { niceDate } from './model.js';
import { VENUE_STATUSES } from './planner.js';
import { exportPDF } from './pdf.js';
import { STOP_STATUSES, PICK_STATUSES, newTour, newStop, tourMoney, geocodeURL, parsePlaces, OVERPASS, venueQuery, parseOSMVenues, venueFromOSM, setlistSearchURL, setlistLink, fansOf, parseSetlists, similarVenues, venueFromSetlist, showFromStop, tourHTML, ROAD_FACTOR } from './tours.js';

/** Search state (not saved). */
export const toursUI = { q: '', places: null, busy: '', open: null, finder: 'osm', radius: 15, results: {} };
const label = (list, k) => (list.find(([v]) => v === k) || [k, k])[1];
const $ = (v) => `${v < 0 ? '−' : ''}$${Math.abs(Math.round(v)).toLocaleString()}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ext = (href, text) => (href ? h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text) : null);

export function buildTours(ctx) {
  const m = ctx.store.get();
  const tour = ctx.view.id && m.tours.find((t) => t.id === ctx.view.id);
  if (tour) return tourPage(ctx, tour);
  if (m.tours.length === 1 && !ctx.view.id) return tourPage(ctx, m.tours[0]);
  return tourList(ctx);
}

function tourList(ctx) {
  const m = ctx.store.get();
  const add = async () => {
    const name = await askText('Name the tour', `${m.band.name || 'Band'} ${new Date().getFullYear()} run`, { okText: 'Make it' });
    if (!name) return;
    const t = newTour(name.trim(), ctx.today());
    ctx.update((d) => d.tours.push(t));
    ctx.go('tours', t.id);
  };
  return h(
    'div',
    { class: 'mgr-page' },
    h('header', { class: 'mgr-head' }, h('div', {}, h('h1', {}, 'Tours'), h('p', { class: 'muted' }, 'Plan a run city by city: find rooms, pitch them, and see if the trip adds up.')), button('New tour', add, { iconName: 'plus', variant: 'primary' })),
    m.tours.length
      ? h('div', { class: 'mgr-shows' }, m.tours.map((t) => {
          const mo = tourMoney(t);
          const conf = t.stops.filter((s) => s.status === 'confirmed').length;
          return h('button', { type: 'button', class: 'mgr-show', onclick: () => ctx.go('tours', t.id) }, h('span', { class: 'mgr-date' }, icon('route', 20)), h('span', { class: 'mgr-show-main' }, h('strong', {}, t.name), h('span', { class: 'muted tiny' }, `${t.stops.length} stops · ${conf} confirmed · ${mo.dist} ${t.units}`)), h('span', { class: `mgr-chip ${mo.net >= 0 ? 'ok' : 'bad'}` }, `net ${$(mo.net)}`), h('span', {}));
        }))
      : h(
          'div',
          { class: 'mgr-empty' },
          h('p', {}, 'No tours yet. A regional run (3–6 nearby cities over a long weekend or two) is the usual first step out of town.'),
          button('Plan a tour', add, { iconName: 'route', variant: 'sm primary' }),
        ),
  );
}

function tourPage(ctx, tour) {
  const m = ctx.store.get();
  const f = ctx.form;
  const ui = toursUI;
  const re = () => ctx.go('tours', tour.id);
  const T = (fn) => (d, v) => {
    const t = d.tours.find((x) => x.id === tour.id);
    if (t) fn(t, v, d);
  };
  const St = (id, fn) => T((t, v, d) => {
    const s = t.stops.find((x) => x.id === id);
    if (s) fn(s, v, d, t);
  });
  const money = tourMoney(tour);
  const settings = loadSettings();

  // ---- add a stop: find the city on OpenStreetMap
  const q = h('input', { type: 'search', placeholder: 'City, e.g. Portland, OR', value: ui.q, 'data-k': 'tour-city', 'aria-label': 'City to add' });
  const findCity = async () => {
    ui.q = q.value.trim();
    if (!ui.q) return;
    ui.busy = 'city';
    re();
    try {
      const r = await fetch(geocodeURL(ui.q), { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(`OpenStreetMap answered ${r.status}`);
      ui.places = parsePlaces(await r.json());
      if (!ui.places.length) toast('No city found. Try adding the state or country.', 'error');
    } catch (e) {
      ui.places = null;
      toast(`Could not search for the city: ${e.message}. Add it by name instead.`, 'error', 5000);
    } finally {
      ui.busy = '';
      re();
    }
  };
  q.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), findCity()));
  const addStop = (place) => {
    const s = newStop(place);
    ctx.update(T((t) => t.stops.push(s)));
    Object.assign(ui, { q: '', places: null, open: s.id });
  };

  // ---- venue finder for one stop
  const finder = (s) => {
    const res = (ui.results[s.id] ||= { osm: null, sl: null, error: '' });
    const pickIds = new Set(s.picks.map((p) => p.venueId));
    const shortlist = (venue) => {
      ctx.update(St(s.id, (x, _v, d) => {
        if (!d.venues.some((v) => v.id === venue.id)) d.venues.unshift(venue);
        if (!x.picks.some((p) => p.venueId === venue.id)) x.picks.push({ id: `pick_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, venueId: venue.id, status: 'idea', note: '' });
      }));
      toast(`${venue.name} is on the ${s.city} shortlist and in Show planner → Venues.`);
    };
    const searchOSM = async () => {
      if (s.lat == null) return toast('This stop has no map position. Remove it and add the city from the search.', 'error', 5000);
      ui.busy = `osm:${s.id}`;
      res.error = '';
      re();
      try {
        const r = await fetch(OVERPASS, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ data: venueQuery(s.lat, s.lon, ui.radius) }) });
        if (!r.ok) throw new Error(r.status === 429 ? 'OpenStreetMap is busy, try again in a minute' : `OpenStreetMap answered ${r.status}`);
        res.osm = parseOSMVenues(await r.json(), s);
      } catch (e) {
        res.error = `Could not search OpenStreetMap: ${e.message}.`;
      } finally {
        ui.busy = '';
        re();
      }
    };
    const fans = fansOf(m.band.similar);
    const key = settings.setlistfmKey || '';
    const searchSL = async () => {
      if (!fans.length) return toast('Add bands to “For fans of” first.', 'error');
      if (!key) return toast('Add your setlist.fm API key first.', 'error');
      ui.busy = `sl:${s.id}`;
      res.error = '';
      re();
      const shows = [];
      try {
        for (const [i, band] of fans.entries()) {
          if (i) await sleep(700); // setlist.fm allows about 2 requests a second
          const r = await fetch(setlistSearchURL(band, s.city), { headers: { 'x-setlistfm-key': key, Accept: 'application/json' } });
          if (r.status === 404 && !(r.headers.get('content-type') || '').includes('json')) throw new Error('the setlist.fm search needs the app’s own server (npm start); use the links instead');
          if (r.status === 404) continue; // no shows for this band here
          if (r.status === 401 || r.status === 403) throw new Error('setlist.fm did not accept the API key');
          if (!r.ok) throw new Error(`setlist.fm answered ${r.status}`);
          shows.push(...parseSetlists(await r.json()));
        }
        res.sl = similarVenues(shows);
      } catch (e) {
        res.error = `Could not search setlist.fm: ${e.message}.`;
      } finally {
        ui.busy = '';
        re();
      }
    };
    const radius = h('select', { 'aria-label': 'Search radius', 'data-k': `tr-rad-${s.id}` }, [5, 15, 30, 50].map((k) => h('option', { value: k, selected: ui.radius === k }, `${k} km`)));
    radius.addEventListener('change', () => (ui.radius = +radius.value));
    const busy = (k) => ui.busy === `${k}:${s.id}`;
    const tabs = h('div', { class: 'chips' }, button('OpenStreetMap', () => ((ui.finder = 'osm'), re()), { variant: `chip${ui.finder === 'osm' ? ' on' : ''}` }), button('Where similar bands played', () => ((ui.finder = 'sl'), re()), { variant: `chip${ui.finder === 'sl' ? ' on' : ''}` }));
    const osmBody = h(
      'div',
      {},
      h('div', { class: 'row' }, radius, button(busy('osm') ? 'Searching…' : `Find live-music places near ${s.city}`, searchOSM, { iconName: 'search', variant: 'sm primary', disabled: busy('osm') })),
      h('p', { class: 'muted tiny' }, 'Music venues, nightclubs, concert halls and bars marked as having live music on OpenStreetMap. Coverage varies by city and contacts are often missing, so check each one.'),
      res.osm
        ? res.osm.length
          ? h('div', { class: 'tr-results' }, res.osm.slice(0, 60).map((o) => {
              const v = venueFromOSM(o, s.city);
              const have = pickIds.has(v.id);
              return h(
                'div',
                { class: 'tr-result' },
                h('div', {}, h('strong', {}, o.name), h('span', { class: 'muted tiny' }, ` · ${o.kind}${o.km != null ? ` · ${o.km} km` : ''}${o.capacity ? ` · cap ${o.capacity}` : ''}`), o.address ? h('div', { class: 'muted tiny' }, o.address) : null, h('div', { class: 'mgr-links tiny' }, ext(o.website, 'Website'), o.email ? h('a', { href: `mailto:${o.email}` }, o.email) : null, o.phone ? h('a', { href: `tel:${o.phone.replace(/[^\d+]/g, '')}` }, o.phone) : null, ext(`https://www.openstreetmap.org/${o.osmId}`, 'Map'))),
                have ? h('span', { class: 'mgr-chip ok' }, 'On the shortlist') : button('Shortlist', () => shortlist(m.venues.find((x) => x.id === v.id) || v), { iconName: 'plus', variant: 'sm' }),
              );
            }))
          : h('p', { class: 'muted small' }, 'Nothing tagged near here. Try a wider radius, or the similar-bands search.')
        : null,
    );
    const slBody = h(
      'div',
      {},
      f.text('tour-fans', 'For fans of (from your press kit)', m.band.similar || '', (d, v) => (d.band.similar = v), { placeholder: 'Bad Omens, Spiritbox, Deftones' }),
      keyBox('setlist.fm API key', (() => {
        const el = h('input', { type: 'password', autocomplete: 'off', placeholder: 'Paste your setlist.fm API key', value: key });
        el.addEventListener('change', () => {
          const st = loadSettings();
          st.setlistfmKey = el.value.trim();
          saveSettings(st);
          toast(st.setlistfmKey ? 'setlist.fm key saved in this browser only' : 'setlist.fm key removed');
          re();
        });
        return el;
      })(), { saved: !!key, help: h('span', {}, 'Free for non-commercial use: sign in on setlist.fm, then ', ext('https://www.setlist.fm/settings/api', 'apply for an API key'), '. Stored in this browser only and sent only to setlist.fm, through this app’s own server.') }),
      h('div', { class: 'row' }, button(busy('sl') ? 'Searching…' : `Find rooms in ${s.city}`, searchSL, { iconName: 'search', variant: 'sm primary', disabled: busy('sl') || !fans.length || !key })),
      fans.length ? h('p', { class: 'muted tiny' }, 'Or look by hand: ', fans.map((b, i) => [i ? ', ' : '', ext(setlistLink(b, s.city), b)])) : null,
      res.sl
        ? res.sl.length
          ? h('div', { class: 'tr-results' }, res.sl.slice(0, 40).map((x) => {
              const known = m.venues.find((v) => v.name.toLowerCase() === x.venue.toLowerCase() && (!v.city || v.city.toLowerCase() === x.city.toLowerCase()));
              const v = known || venueFromSetlist(x);
              const have = pickIds.has(v.id);
              return h(
                'div',
                { class: 'tr-result' },
                h('div', {}, h('strong', {}, x.venue), h('span', { class: 'muted tiny' }, ` · ${x.city}${x.region ? `, ${x.region}` : ''}`), h('div', { class: 'small' }, `${x.bands.join(', ')} played here`, x.last ? h('span', { class: 'muted tiny' }, ` · last ${niceDate(x.last, { weekday: false })}`) : null), x.url ? h('div', { class: 'tiny' }, ext(x.url, 'See the setlist')) : null),
                have ? h('span', { class: 'mgr-chip ok' }, 'On the shortlist') : button('Shortlist', () => shortlist(v), { iconName: 'plus', variant: 'sm' }),
              );
            }))
          : h('p', { class: 'muted small' }, `None of those bands have a show in ${s.city} on setlist.fm. Try other bands, or OpenStreetMap.`)
        : null,
    );
    return h('div', { class: 'tr-finder' }, tabs, ui.finder === 'osm' ? osmBody : slBody, res.error ? h('p', { class: 'warn-list small' }, res.error) : null);
  };

  // ---- one stop
  const stopCard = (s, i) => {
    const leg = i ? money.legs[i - 1] : null;
    const r = money.rows[i];
    const open = ui.open === s.id;
    const venueOf = (id) => m.venues.find((v) => v.id === id);
    const show = s.showId && m.shows.find((x) => x.id === s.showId);
    const confirm1 = (p) => {
      const v = venueOf(p.venueId);
      if (!s.date && !window.confirm('This stop has no date yet. Make the show anyway?')) return;
      const sh = showFromStop(s, v, m.band);
      ctx.update(St(s.id, (x, _v, d) => {
        d.shows.push(sh);
        x.showId = sh.id;
        x.status = 'confirmed';
        for (const pk of x.picks) if (pk.id === p.id) pk.status = 'yes';
        const dv = d.venues.find((y) => y.id === p.venueId);
        if (dv && (dv.status === 'new' || dv.status === 'pitched' || dv.status === 'talking')) dv.status = 'booked';
      }));
      toast(`Show at ${v ? v.name : s.city} added to Shows with its to-do list.`);
    };
    const picks = s.picks.map((p) => {
      const v = venueOf(p.venueId);
      const P = (fn) => St(s.id, (x, val) => {
        const y = x.picks.find((z) => z.id === p.id);
        if (y) fn(y, val);
      });
      if (!v) return null;
      return h(
        'li',
        { class: 'tr-pick' },
        h('div', {}, h('strong', {}, v.name), h('span', { class: 'muted tiny' }, [v.capacity && ` cap ${v.capacity}`, v.bookingEmail, label(VENUE_STATUSES, v.status)].filter(Boolean).join(' · ')), h('div', { class: 'mgr-links tiny' }, v.bookingEmail ? h('a', { href: `mailto:${v.bookingEmail}` }, 'Email') : null, ext(v.website, 'Website'), button('Pitch email', () => ctx.go('planner', null, 'venues'), { variant: 'link tiny', title: 'Open it in Show planner → Venues to write the pitch' }))),
        f.select(`tr-ps-${p.id}`, '', p.status, PICK_STATUSES, P((y, val) => (y.status = val)), { aria: 'Venue status' }),
        f.text(`tr-pn-${p.id}`, '', p.note, P((y, val) => (y.note = val)), { placeholder: 'Deal offered, who replied…' }),
        h('div', { class: 'row' }, s.showId ? null : button('Confirm here', () => confirm1(p), { iconName: 'check', variant: 'sm', title: 'Make this stop a confirmed show at this venue' }), iconButton('trash', `Take ${v.name} off the shortlist`, () => ctx.update(St(s.id, (x) => (x.picks = x.picks.filter((z) => z.id !== p.id)))), 'ghost')),
      );
    });
    return h(
      'article',
      { class: `tr-stop st-${s.status}` },
      leg ? h('div', { class: 'tr-leg muted tiny' }, icon('route', 12), leg.dist != null ? ` about ${leg.dist} ${tour.units} · ${leg.hours} h drive from ${tour.stops[i - 1].city}` : ' distance unknown') : null,
      h(
        'div',
        { class: 'tr-stop-head' },
        h('span', { class: 'tr-num' }, String(i + 1)),
        h('div', { class: 'tr-city' }, h('strong', {}, s.city), h('span', { class: 'muted tiny' }, [s.region, s.country].filter(Boolean).join(', '))),
        f.text(`tr-date-${s.id}`, '', s.date, St(s.id, (x, v) => (x.date = v)), { type: 'date', aria: `Date in ${s.city || 'this city'}` }),
        f.select(`tr-st-${s.id}`, '', s.status, STOP_STATUSES, St(s.id, (x, v) => (x.status = v)), { aria: `Status in ${s.city || 'this city'}` }),
        h('span', { class: `mgr-net ${r.net >= 0 ? 'ok' : 'bad'}` }, $(r.net)),
        h('div', { class: 'row' }, iconButton('arrowUp', 'Earlier in the tour', () => ctx.update(T((t) => {
          const k = t.stops.findIndex((x) => x.id === s.id);
          if (k > 0) [t.stops[k - 1], t.stops[k]] = [t.stops[k], t.stops[k - 1]];
        })), 'ghost'), iconButton('trash', `Remove ${s.city}`, () => window.confirm(`Remove ${s.city} from the tour?`) && ctx.update(T((t) => (t.stops = t.stops.filter((x) => x.id !== s.id)))), 'ghost danger')),
      ),
      h(
        'div',
        { class: 'tr-money' },
        f.text(`tr-g-${s.id}`, 'Guarantee / door ($)', s.guarantee, St(s.id, (x, v) => (x.guarantee = v)), { type: 'number' }),
        f.text(`tr-m-${s.id}`, 'Merch ($)', s.merch, St(s.id, (x, v) => (x.merch = v)), { type: 'number' }),
        f.text(`tr-gas-${s.id}`, 'Gas ($)', s.gas, St(s.id, (x, v) => (x.gas = v)), { type: 'number', placeholder: r.gasGuessed && r.gas ? `≈ ${r.gas}` : '' }),
        f.text(`tr-l-${s.id}`, 'Lodging ($)', s.lodging, St(s.id, (x, v) => (x.lodging = v)), { type: 'number', placeholder: 'floor, motel…' }),
      ),
      show ? h('p', { class: 'small' }, icon('check', 12), ` Confirmed: ${show.venue || 'show'}${show.date ? ` on ${niceDate(show.date, { weekday: false })}` : ''}. `, button('Open the show', () => ctx.go('shows', show.id), { variant: 'link' })) : null,
      h('div', { class: 'tr-picks-head' }, h('strong', { class: 'small' }, `Venue shortlist · ${s.picks.length}`), button(open ? 'Hide the venue finder' : 'Find venues', () => ((ui.open = open ? null : s.id), re()), { iconName: 'search', variant: `sm${open ? '' : ' primary'}` })),
      picks.filter(Boolean).length ? h('ul', { class: 'tr-picks' }, picks) : h('p', { class: 'muted tiny' }, 'No venues yet. Use “Find venues”, or pick from Show planner → Venues.'),
      m.venues.length ? (() => {
        const opts = m.venues.filter((v) => !s.picks.some((p) => p.venueId === v.id) && (!v.city || v.city.toLowerCase() === s.city.toLowerCase()));
        if (!opts.length) return null;
        const sel = h('select', { 'aria-label': `Add a saved venue in ${s.city}`, 'data-k': `tr-saved-${s.id}` }, h('option', { value: '' }, `Saved venues in ${s.city}…`), opts.map((v) => h('option', { value: v.id }, v.name)));
        sel.addEventListener('change', () => sel.value && ctx.update(St(s.id, (x) => x.picks.push({ id: `pick_${Date.now().toString(36)}`, venueId: sel.value, status: 'idea', note: '' }))));
        return sel;
      })() : null,
      open ? finder(s) : null,
      f.text(`tr-n-${s.id}`, '', s.notes, St(s.id, (x, v) => (x.notes = v)), { placeholder: 'Notes: where to sleep, local bands to ask, radio…' }),
    );
  };

  const pdf = () => {
    exportPDF(tourHTML(tour, { venues: m.venues, band: m.band, statusLabel: (k) => label(STOP_STATUSES, k) }), `${tour.name} tour sheet`);
    toast('Pick “Save as PDF” as the printer to get a PDF.');
  };
  const removeTour = () => {
    if (!window.confirm(`Delete “${tour.name}”? Shows it created stay in Shows.`)) return;
    ctx.update((d) => (d.tours = d.tours.filter((t) => t.id !== tour.id)));
    ctx.go('tours');
  };
  const newOne = async () => {
    const name = await askText('Name the tour', `${m.band.name || 'Band'} ${new Date().getFullYear()} run`, { okText: 'Make it' });
    if (!name) return;
    const t = newTour(name.trim(), ctx.today());
    ctx.update((d) => d.tours.push(t));
    ctx.go('tours', t.id);
  };

  return h(
    'div',
    { class: 'mgr-page wide' },
    m.tours.length > 1 ? h('button', { type: 'button', class: 'link back', onclick: () => ctx.go('tours', '__list') }, icon('arrowLeft', 14), 'All tours') : null,
    h(
      'header',
      { class: 'mgr-head' },
      h('div', {}, h('h1', {}, tour.name), h('p', { class: 'muted' }, 'Add cities in order, find rooms in each, and watch the money and the driving.')),
      h('div', { class: 'row' }, button('Tour poster', () => ctx.studio.openPhoto('tour', { tourId: tour.id }), { iconName: 'image', variant: 'sm', title: 'The dates as a post in the Photo Studio' }), button('Export PDF', pdf, { iconName: 'print', variant: 'sm primary' }), button('New tour', newOne, { iconName: 'plus', variant: 'sm' }), iconButton('trash', 'Delete this tour', removeTour, 'ghost danger')),
    ),
    h(
      'div',
      { class: 'mgr-cards tr-cards' },
      h('div', { class: 'mgr-card stat' }, h('span', { class: 'mgr-card-k' }, 'Stops'), h('strong', {}, `${tour.stops.filter((s) => s.status === 'confirmed').length}/${tour.stops.length}`), h('span', { class: 'muted tiny' }, 'confirmed')),
      h('div', { class: 'mgr-card stat' }, h('span', { class: 'mgr-card-k' }, 'Driving'), h('strong', {}, `${money.dist} ${tour.units}`), h('span', { class: 'muted tiny' }, `about ${money.hours} h`)),
      h('div', { class: 'mgr-card stat' }, h('span', { class: 'mgr-card-k' }, 'In'), h('strong', { class: 'ok' }, $(money.income))),
      h('div', { class: 'mgr-card stat' }, h('span', { class: 'mgr-card-k' }, 'Out'), h('strong', {}, $(money.costs))),
      h('div', { class: 'mgr-card stat' }, h('span', { class: 'mgr-card-k' }, 'Net'), h('strong', { class: money.net >= 0 ? 'ok' : 'bad' }, $(money.net))),
    ),
    h(
      'section',
      { class: 'mgr-sect' },
      h('h2', {}, 'Add a city'),
      h('div', { class: 'mgr-filters' }, q, button(ui.busy === 'city' ? 'Searching…' : 'Find the city', findCity, { iconName: 'search', variant: 'sm primary', disabled: ui.busy === 'city' }), button('Add by name only', () => {
        const name = q.value.trim();
        if (name) addStop({ city: name });
      }, { variant: 'sm ghost', title: 'Without a map position: no distances or venue map search' })),
      ui.places && ui.places.length ? h('div', { class: 'chips' }, ui.places.map((p) => button(`${p.name}${p.region ? `, ${p.region}` : ''}${p.country ? ` · ${p.country}` : ''}`, () => addStop({ ...p, city: p.name }), { iconName: 'plus', variant: 'chip', title: p.label }))) : null,
      h('p', { class: 'muted tiny' }, 'City search by ', ext('https://www.openstreetmap.org/copyright', 'OpenStreetMap'), ' (Nominatim). Drives are straight lines × ', String(ROAD_FACTOR), ', a rough guess: plan the real route in a map app.'),
    ),
    tour.stops.length ? h('div', { class: 'tr-stops' }, tour.stops.map(stopCard)) : h('div', { class: 'mgr-empty' }, h('p', {}, 'No cities yet. Start with your home city, then add 2–5 within a few hours’ drive.')),
    h(
      'section',
      { class: 'mgr-sect' },
      h('h2', {}, 'Tour settings'),
      h('div', { class: 'mgr-three' }, f.text(`tr-name-${tour.id}`, 'Name', tour.name, T((t, v) => (t.name = v || t.name))), f.select(`tr-units-${tour.id}`, 'Distances in', tour.units, [['mi', 'Miles'], ['km', 'Kilometres']], T((t, v) => (t.units = v))), f.text(`tr-rate-${tour.id}`, `Gas per ${tour.units} ($)`, tour.gasRate, T((t, v) => (t.gasRate = +v || 0)), { type: 'number', hint: 'For a van at about 15 mpg and $4 a gallon, use 0.27 per mile.' })),
      f.text(`tr-notes-${tour.id}`, 'Notes', tour.notes, T((t, v) => (t.notes = v)), { rows: 3, placeholder: 'Who drives, the van, merch to bring, days off…' }),
    ),
  );
}
