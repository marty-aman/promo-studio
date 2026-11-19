// Show planner: venues (size, capacity, how to book, a pitch email), scene bands, contacts, and
// a show builder. The researched starter lists are added once and marked "check before you reach out".
import { h, icon, button, iconButton, toast } from '../dom.js';
import { niceDate } from './model.js';
import { VENUE_STATUSES, venueFromSeed, bandFromSeed, newVenue, mergeSeed, filterVenues, venueFit, pitchEmail, mailtoLink } from './planner.js';
import { SEED_VENUES, SEED_BANDS, SEED_VENUES_ON, SEED_BANDS_ON } from './seed.js';
import { bandsTab, contactsTab, buildTab } from './planner-tabs.js';
import { showPlanTab, stagePlotTab } from './planner-stage.js';

const TABS = [['venues', 'Venues'], ['bands', 'Bands'], ['build', 'Build a show'], ['plan', 'Show plan'], ['stage', 'Stage plot'], ['contacts', 'Contacts']];
export const plannerUI = { q: '', size: '', ages: '', city: '', draw: '', open: null, pitch: null, pitchDates: '', pitchSimilar: '', venueForBuild: null };
const label = (list, k) => (list.find(([v]) => v === k) || [k, k])[1];

/** Add the starter lists the first time (and any new entries after an update), once. */
function seedOnce(ctx) {
  const m = ctx.store.get();
  const needV = SEED_VENUES.length && m.seeded.venues !== SEED_VENUES_ON;
  const needB = SEED_BANDS.length && m.seeded.bands !== SEED_BANDS_ON;
  if (!needV && !needB) return;
  queueMicrotask(() =>
    ctx.update((d) => {
      if (needV) {
        d.venues = mergeSeed(d.venues, SEED_VENUES.map(venueFromSeed).filter((v) => v.name));
        d.seeded.venues = SEED_VENUES_ON;
      }
      if (needB) {
        d.bands = mergeSeed(d.bands, SEED_BANDS.map(bandFromSeed).filter((b) => b.name));
        d.seeded.bands = SEED_BANDS_ON;
      }
    }),
  );
}

export function buildPlanner(ctx) {
  seedOnce(ctx);
  const tab = TABS.some(([k]) => k === ctx.view.tab) ? ctx.view.tab : 'venues';
  const body = { venues: venuesTab, bands: bandsTab, contacts: contactsTab, build: buildTab, plan: showPlanTab, stage: stagePlotTab }[tab](ctx);
  return h(
    'div',
    { class: 'mgr-page' },
    h('header', { class: 'mgr-head' }, h('div', {}, h('h1', {}, 'Show planner'), h('p', { class: 'muted' }, 'Find a room, line up the bands, pitch it, plan the night and send the stage plot.'))),
    h('div', { class: 'mgr-tabs', role: 'tablist' }, TABS.map(([k, l]) => h('button', { type: 'button', role: 'tab', 'aria-selected': k === tab ? 'true' : 'false', class: `mgr-tab${k === tab ? ' on' : ''}`, onclick: () => ctx.go('planner', k === 'plan' ? ctx.view.id : null, k) }, l))),
    h('div', { role: 'tabpanel' }, body),
  );
}

const ext = (href, text) => (href ? h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text) : null);
export const checkBadge = (x) => (x.verified ? null : h('span', { class: 'mgr-chip check', title: 'From public sources on the date shown. Confirm the details before you reach out.' }, 'Check before you reach out'));

function venuesTab(ctx) {
  const m = ctx.store.get();
  const f = ctx.form;
  const ui = plannerUI;
  const V = (id, fn) => (d, v) => {
    const x = d.venues.find((y) => y.id === id);
    if (x) fn(x, v, d);
  };
  const rerender = () => ctx.setTab('venues');
  const cities = [...new Set(m.venues.map((v) => v.city).filter(Boolean))].sort();
  const list = filterVenues(m.venues, ui).sort((a, b) => (a.capacity || 9999) - (b.capacity || 9999));
  const search = h('input', { type: 'search', placeholder: 'Search venues, neighbourhoods, genres…', value: ui.q, 'aria-label': 'Search venues' });
  let timer = null;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      ui.q = search.value;
      rerender();
      const s = document.querySelector('.mgr-filters input[type=search]');
      if (s) (s.focus(), s.setSelectionRange(s.value.length, s.value.length));
    }, 200);
  });
  const chip = (k, v, text) => button(text, () => ((ui[k] = ui[k] === v ? '' : v), rerender()), { variant: `chip${ui[k] === v ? ' on' : ''}` });
  const drawIn = h('input', { type: 'number', min: 0, placeholder: 'e.g. 60', value: ui.draw, 'aria-label': 'How many people you usually bring', style: { width: '90px' } });
  drawIn.addEventListener('change', () => ((ui.draw = drawIn.value), rerender()));
  const citySel = h('select', { 'aria-label': 'City' }, h('option', { value: '' }, 'All cities'), cities.map((c) => h('option', { value: c, selected: ui.city === c }, c)));
  citySel.addEventListener('change', () => ((ui.city = citySel.value), rerender()));

  const add = () => {
    const v = newVenue();
    ctx.update((d) => d.venues.unshift(v));
    ui.open = v.id;
  };
  const songLinks = m.songs.flatMap((s) => [s.links.spotify, s.links.youtube, s.links.bandcamp]).filter(Boolean).slice(0, 3);

  const card = (v) => {
    const fit = venueFit(v, +ui.draw);
    const open = ui.open === v.id;
    const head = h(
      'button',
      { type: 'button', class: 'mgr-venue-head', 'aria-expanded': open ? 'true' : 'false', onclick: () => ((ui.open = open ? null : v.id), rerender()) },
      icon('chevron', 14),
      h('span', { class: 'mgr-venue-name' }, h('strong', {}, v.name), h('span', { class: 'muted tiny' }, [v.city, v.neighborhood].filter(Boolean).join(' · '))),
      h('span', { class: 'mgr-cap' }, v.capacity ? `${v.capacity}` : '?', h('small', {}, 'cap')),
      h('span', { class: 'muted tiny mgr-ages' }, v.ages),
      fit ? h('span', { class: `mgr-chip fit-${fit.replace(' ', '')}` }, fit === 'good' ? 'Good fit' : fit === 'stretch' ? 'A stretch' : 'Too big for now') : h('span', {}),
      h('span', { class: `mgr-chip vs-${v.status}` }, label(VENUE_STATUSES, v.status)),
    );
    if (!open) return h('div', { class: 'mgr-venue' }, head);
    const p = ui.pitch === v.id ? pitchEmail({ band: m.band, venue: v, dates: ui.pitchDates.split(',').map((s) => s.trim()).filter(Boolean), draw: ui.draw, similar: ui.pitchSimilar, links: songLinks }) : null;
    return h(
      'div',
      { class: 'mgr-venue open' },
      head,
      h(
        'div',
        { class: 'mgr-venue-body' },
        h(
          'div',
          { class: 'mgr-cols' },
          h(
            'div',
            {},
            h('div', { class: 'row' }, checkBadge(v), v.genres.map((g) => h('span', { class: 'mgr-chip' }, g))),
            v.howToBook ? h('div', { class: 'mgr-howto' }, h('strong', {}, 'How to book'), h('p', {}, v.howToBook)) : null,
            h(
              'ul',
              { class: 'mgr-facts' },
              v.bookingEmail ? h('li', {}, h('span', {}, 'Booking email'), h('a', { href: `mailto:${v.bookingEmail}` }, v.bookingEmail)) : null,
              v.bookingForm ? h('li', {}, h('span', {}, 'Booking form'), ext(v.bookingForm, 'Open the form')) : null,
              v.bookingPerson ? h('li', {}, h('span', {}, 'Who books'), h('span', {}, v.bookingPerson)) : null,
              !v.bookingEmail && !v.bookingForm ? h('li', {}, h('span', {}, 'Booking'), h('span', { class: 'muted' }, 'No public contact found: ask on Instagram or through a promoter')) : null,
              h('li', {}, h('span', {}, 'Capacity'), h('span', {}, v.capacity ? String(v.capacity) : 'Unknown', v.capacityNote ? h('span', { class: 'muted tiny' }, ` · ${v.capacityNote}`) : null)),
              v.goodFor ? h('li', {}, h('span', {}, 'Good for'), h('span', {}, v.goodFor)) : null,
              v.address ? h('li', {}, h('span', {}, 'Address'), h('span', {}, v.address)) : null,
              h('li', {}, h('span', {}, 'Links'), h('span', { class: 'mgr-links' }, ext(v.website, 'Website'), ext(v.instagram, 'Instagram'))),
            ),
            v.notes ? h('p', { class: 'muted small' }, v.notes) : null,
            v.sources.length ? h('p', { class: 'muted tiny' }, `Sources (checked ${niceDate(SEED_VENUES_ON, { weekday: false }) || 'when added'}): `, v.sources.map((s, i) => [i ? ', ' : '', ext(s, new URL(s).hostname.replace(/^www\./, ''))])) : null,
          ),
          h(
            'div',
            {},
            h('div', { class: 'mgr-two' }, f.select(`vs-${v.id}`, 'Where we are', v.status, VENUE_STATUSES, V(v.id, (x, val) => (x.status = val))), f.text(`vlc-${v.id}`, 'Last contact', v.lastContact, V(v.id, (x, val) => (x.lastContact = val)), { type: 'date' })),
            f.text(`vn-${v.id}`, 'Our notes', v.myNotes, V(v.id, (x, val) => (x.myNotes = val)), { rows: 3, placeholder: 'Who you talked to, what they said, the deal they offered…' }),
            v.seed ? null : h('div', { class: 'mgr-two' }, f.text(`vname-${v.id}`, 'Name', v.name, V(v.id, (x, val) => (x.name = val))), f.text(`vcap-${v.id}`, 'Capacity', v.capacity ?? '', V(v.id, (x, val) => (x.capacity = val === '' ? null : +val)), { type: 'number' })),
            v.seed ? null : h('div', { class: 'mgr-two' }, f.text(`vem-${v.id}`, 'Booking email', v.bookingEmail, V(v.id, (x, val) => (x.bookingEmail = val.trim())), { type: 'email' }), f.text(`vcity-${v.id}`, 'City', v.city, V(v.id, (x, val) => (x.city = val)))),
            h(
              'div',
              { class: 'row' },
              button(ui.pitch === v.id ? 'Hide the pitch' : 'Write a pitch email', () => ((ui.pitch = ui.pitch === v.id ? null : v.id), rerender()), { iconName: 'share', variant: 'sm primary' }),
              button('Plan a show here', () => ((plannerUI.venueForBuild = v.id), ctx.setTab('build')), { iconName: 'ticket', variant: 'sm' }),
              v.verified ? null : button('I checked the details', () => ctx.update(V(v.id, (x) => (x.verified = true))), { iconName: 'check', variant: 'sm ghost' }),
              iconButton('trash', `Remove ${v.name}`, () => confirm(`Remove ${v.name} from your list?`) && ctx.update((d) => (d.venues = d.venues.filter((x) => x.id !== v.id))), 'ghost danger'),
            ),
            p ? pitchBox(ctx, v, p) : null,
          ),
        ),
      ),
    );
  };

  return h(
    'div',
    {},
    h(
      'div',
      { class: 'mgr-filters' },
      search,
      citySel,
      h('div', { class: 'chips' }, chip('size', 'small', 'Small'), chip('size', 'mid', 'Mid'), chip('size', 'large', 'Large'), chip('ages', 'all', 'All ages')),
      h('label', { class: 'mf inline' }, h('span', { class: 'mf-l' }, 'We bring about'), drawIn, h('span', { class: 'mf-l' }, 'people')),
      button('Add a venue', add, { iconName: 'plus', variant: 'sm' }),
    ),
    h('p', { class: 'muted tiny' }, `${list.length} of ${m.venues.length} venues. ${SEED_VENUES_ON ? `The starter list was researched on ${niceDate(SEED_VENUES_ON, { weekday: false })} from each venue’s own pages and local listings; bookers and capacities change, so check before you reach out.` : ''}`),
    h('div', { class: 'mgr-venues' }, list.map(card)),
  );
}

function pitchBox(ctx, v, p) {
  const ui = plannerUI;
  const dates = h('input', { type: 'text', value: ui.pitchDates, placeholder: 'e.g. Fri Jan 16, Sat Jan 24', 'data-k': `pd-${v.id}` });
  dates.addEventListener('change', () => ((ui.pitchDates = dates.value), ctx.setTab('venues')));
  const similar = h('input', { type: 'text', value: ui.pitchSimilar, placeholder: 'e.g. Bad Omens, Spiritbox, Deftones', 'data-k': `ps-${v.id}` });
  similar.addEventListener('change', () => ((ui.pitchSimilar = similar.value), ctx.setTab('venues')));
  const text = `Subject: ${p.subject}\n\n${p.body}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Pitch copied');
    } catch {
      toast('Could not copy: select the text and copy it.', 'error');
    }
  };
  const sent = () => ctx.update((d) => {
    const x = d.venues.find((y) => y.id === v.id);
    if (x) Object.assign(x, { status: x.status === 'new' ? 'pitched' : x.status, lastContact: ctx.today() });
  });
  return h(
    'div',
    { class: 'mgr-pitch' },
    h('div', { class: 'mgr-two' }, h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Dates you want'), dates), h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'For fans of'), similar)),
    h('textarea', { rows: 14, readonly: true, class: 'mgr-pitch-text', 'aria-label': 'Pitch email' }, text),
    h('p', { class: 'muted tiny' }, v.howToBook ? 'Check it against “How to book” above and add anything they ask for (press, photos, past shows).' : 'Add press, photos and past shows if you have them.'),
    h(
      'div',
      { class: 'row' },
      button('Copy', copy, { iconName: 'copy', variant: 'sm' }),
      p.to ? h('a', { class: 'btn sm primary', href: mailtoLink(p), onclick: sent }, icon('share', 16), h('span', {}, 'Open in my email app')) : v.bookingForm ? h('a', { class: 'btn sm primary', href: v.bookingForm, target: '_blank', rel: 'noopener noreferrer', onclick: sent }, h('span', {}, 'Open their booking form')) : null,
      button('Mark as pitched', sent, { variant: 'sm ghost' }),
    ),
  );
}
