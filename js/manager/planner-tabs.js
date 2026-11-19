// Show planner tabs: scene bands, contacts, and the show builder.
import { h, icon, button, iconButton, toast } from '../dom.js';
import { newShow, niceDate, addDays, mid } from './model.js';
import { BAND_STATUSES, CONTACT_ROLES, SOCIALS, newBand, newContact, showTodo, breakEven, venueFit } from './planner.js';
import { plannerUI, checkBadge } from './page-planner.js';
import { SEED_BANDS_ON } from './seed.js';

const SOCIAL_LABEL = { instagram: 'Instagram', tiktok: 'TikTok', spotify: 'Spotify', bandcamp: 'Bandcamp', youtube: 'YouTube', website: 'Website', facebook: 'Facebook' };
const ext = (href, text) => (href ? h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text) : null);
export const bandsUI = { q: '', genre: '', open: null };

export function bandsTab(ctx) {
  const m = ctx.store.get();
  const f = ctx.form;
  const ui = bandsUI;
  const B = (id, fn) => (d, v) => {
    const x = d.bands.find((y) => y.id === id);
    if (x) fn(x, v);
  };
  const genres = [...new Set(m.bands.flatMap((b) => b.genres))].sort();
  const words = ui.q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = m.bands.filter((b) => (!ui.genre || b.genres.includes(ui.genre)) && words.every((w) => `${b.name} ${b.genres.join(' ')} ${b.soundsLike} ${b.playsAt.join(' ')} ${b.myNotes}`.toLowerCase().includes(w)));
  const search = h('input', { type: 'search', placeholder: 'Search bands, genres, venues…', value: ui.q, 'aria-label': 'Search bands' });
  let timer = null;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      ui.q = search.value;
      ctx.setTab('bands');
      const s = document.querySelector('.mgr-filters input[type=search]');
      if (s) (s.focus(), s.setSelectionRange(s.value.length, s.value.length));
    }, 200);
  });
  const genreSel = h('select', { 'aria-label': 'Genre' }, h('option', { value: '' }, 'All genres'), genres.map((g) => h('option', { value: g, selected: ui.genre === g }, g)));
  genreSel.addEventListener('change', () => ((ui.genre = genreSel.value), ctx.setTab('bands')));
  const upcoming = m.shows.filter((s) => s.date >= ctx.today() && s.status !== 'cancelled').sort((a, b) => a.date.localeCompare(b.date));
  const addTo = (band, showId) => ctx.update((d) => {
    const s = d.shows.find((x) => x.id === showId);
    if (s && !s.lineup.some((x) => x.name === band.name)) s.lineup.push({ id: mid('lu'), name: band.name, time: '' });
  }) || toast(`${band.name} added to the lineup`);

  const card = (b) => {
    const links = SOCIALS.filter((k) => b.socials[k]);
    const showSel = upcoming.length ? h('select', { 'aria-label': `Add ${b.name} to a show` }, h('option', { value: '' }, 'Add to a show…'), upcoming.map((s) => h('option', { value: s.id }, `${niceDate(s.date, { weekday: false })} · ${s.venue || 'TBD'}`))) : null;
    if (showSel) showSel.addEventListener('change', () => showSel.value && addTo(b, showSel.value));
    return h(
      'article',
      { class: 'mgr-band' },
      h('div', { class: 'mgr-band-top' }, h('strong', {}, b.name), h('span', { class: 'muted tiny' }, [b.city, b.genres.join(', ')].filter(Boolean).join(' · '))),
      b.soundsLike ? h('p', { class: 'small' }, b.soundsLike) : null,
      links.length ? h('div', { class: 'mgr-links' }, links.map((k) => ext(b.socials[k], SOCIAL_LABEL[k]))) : h('p', { class: 'muted tiny' }, 'No confirmed accounts yet'),
      b.followers ? h('p', { class: 'muted tiny' }, `${b.followers.instagram.toLocaleString()} Instagram followers${b.followers.seenOn ? ` (seen ${b.followers.seenOn})` : ''}`) : null,
      b.playsAt.length ? h('p', { class: 'muted tiny' }, `Plays: ${b.playsAt.join(', ')}`) : null,
      b.active ? h('p', { class: 'muted tiny' }, `Active: ${b.active}`) : null,
      h('div', { class: 'row' }, checkBadge(b)),
      h('div', { class: 'mgr-two' }, f.select(`bs-${b.id}`, '', b.status, BAND_STATUSES, B(b.id, (x, v) => (x.status = v))), showSel || h('span')),
      f.text(`bn-${b.id}`, '', b.myNotes, B(b.id, (x, v) => (x.myNotes = v)), { placeholder: 'Our notes: who to message, their draw…' }),
      b.seed
        ? null
        : h('div', { class: 'mgr-two' }, f.text(`bname-${b.id}`, '', b.name, B(b.id, (x, v) => (x.name = v)), { placeholder: 'Band name' }), f.text(`big-${b.id}`, '', b.socials.instagram, B(b.id, (x, v) => (x.socials.instagram = v.trim())), { type: 'url', placeholder: 'Instagram link' })),
      h('div', { class: 'row' }, b.verified ? null : button('I checked this', () => ctx.update(B(b.id, (x) => (x.verified = true))), { variant: 'sm ghost' }), iconButton('trash', `Remove ${b.name}`, () => confirm(`Remove ${b.name}?`) && ctx.update((d) => (d.bands = d.bands.filter((x) => x.id !== b.id))), 'ghost danger')),
      b.sources.length ? h('p', { class: 'muted tiny' }, 'Sources: ', b.sources.slice(0, 3).map((s, i) => [i ? ', ' : '', ext(s, new URL(s).hostname.replace(/^www\./, ''))])) : null,
    );
  };
  return h(
    'div',
    {},
    h('div', { class: 'mgr-filters' }, search, genreSel, button('Add a band', () => ctx.update((d) => d.bands.unshift(newBand())), { iconName: 'plus', variant: 'sm' })),
    h('p', { class: 'muted tiny' }, `${list.length} of ${m.bands.length} bands. ${SEED_BANDS_ON ? `Starter list gathered ${niceDate(SEED_BANDS_ON, { weekday: false })} from El Corazon / Funhouse show pages, Do206 artist pages and Bandcamp; links are the ones listed for each band there.` : ''}`),
    m.bands.length ? h('div', { class: 'mgr-bands' }, list.map(card)) : h('div', { class: 'mgr-empty' }, h('p', {}, 'No bands yet. Add the ones you know from shows you’ve played.')),
  );
}

export function contactsTab(ctx) {
  const m = ctx.store.get();
  const f = ctx.form;
  const C = (id, fn) => (d, v) => {
    const x = d.contacts.find((y) => y.id === id);
    if (x) fn(x, v);
  };
  const col = (c, k, ph, type = 'text') => h('td', {}, f.text(`c${k}-${c.id}`, '', c[k], C(c.id, (x, v) => (x[k] = v)), { placeholder: ph, type }));
  return h(
    'section',
    { class: 'mgr-sect' },
    h('h2', {}, `Contacts · ${m.contacts.length}`),
    h('p', { class: 'muted small' }, 'Promoters, sound engineers, photographers, press and curators: everyone who helps a show or a release happen.'),
    m.contacts.length
      ? h(
          'table',
          { class: 'mgr-table' },
          h('thead', {}, h('tr', {}, ['Name', 'Role', 'Where', 'Email', 'Phone', 'Social / site', 'Notes', ''].map((x) => h('th', {}, x)))),
          h(
            'tbody',
            {},
            m.contacts.map((c) =>
              h(
                'tr',
                {},
                col(c, 'name', 'Name'),
                h('td', {}, f.select(`crole-${c.id}`, '', c.role, CONTACT_ROLES, C(c.id, (x, v) => (x.role = v)))),
                col(c, 'org', 'Venue, blog, studio…'),
                col(c, 'email', 'email', 'email'),
                col(c, 'phone', 'phone', 'tel'),
                col(c, 'social', 'link', 'url'),
                col(c, 'notes', ''),
                h('td', {}, iconButton('trash', `Delete ${c.name || 'contact'}`, () => ctx.update((d) => (d.contacts = d.contacts.filter((x) => x.id !== c.id))), 'ghost')),
              ),
            ),
          ),
        )
      : null,
    button('Add a contact', () => ctx.update((d) => d.contacts.push(newContact())), { iconName: 'plus', variant: 'sm' }),
  );
}

export const buildUI = { date: '', venueId: '', billing: 'headline', bands: [], price: '15', share: '70', costs: '0', draw: '' };

export function buildTab(ctx) {
  const m = ctx.store.get();
  const ui = buildUI;
  if (plannerUI.venueForBuild) {
    ui.venueId = plannerUI.venueForBuild;
    plannerUI.venueForBuild = null;
  }
  if (!ui.date) ui.date = addDays(ctx.today(), 45);
  const re = () => ctx.setTab('build');
  const inp = (k, label, type = 'text', ph = '') => {
    const el = h('input', { type, value: ui[k], placeholder: ph, 'data-k': `build-${k}` });
    el.addEventListener('change', () => ((ui[k] = el.value), re()));
    return h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, label), el);
  };
  const venueSel = h('select', { 'data-k': 'build-venue' }, h('option', { value: '' }, '— pick a venue —'), [...m.venues].sort((a, b) => a.name.localeCompare(b.name)).map((v) => h('option', { value: v.id, selected: ui.venueId === v.id }, `${v.name}${v.capacity ? ` (${v.capacity})` : ''}`)));
  venueSel.addEventListener('change', () => ((ui.venueId = venueSel.value), re()));
  const billSel = h('select', { 'data-k': 'build-billing' }, [['headline', 'We headline'], ['support', 'We support'], ['opener', 'We open']].map(([v, l]) => h('option', { value: v, selected: ui.billing === v }, l)));
  billSel.addEventListener('change', () => ((ui.billing = billSel.value), re()));
  const venue = m.venues.find((v) => v.id === ui.venueId);
  const pool = m.bands.filter((b) => b.status !== 'no');
  const toggle = (name) => ((ui.bands = ui.bands.includes(name) ? ui.bands.filter((x) => x !== name) : [...ui.bands, name]), re());
  const be = breakEven({ price: +ui.price, share: +ui.share / 100, costs: +ui.costs });
  const crowd = Math.round(+ui.draw * (ui.bands.length + 1));
  const fit = venue ? venueFit(venue, crowd) : '';
  const create = () => {
    if (!ui.date) return toast('Pick a date first.', 'error');
    const lineup = ui.billing === 'headline' ? [...ui.bands, m.band.name] : ui.billing === 'opener' ? [m.band.name, ...ui.bands] : [...ui.bands.slice(0, 1), m.band.name, ...ui.bands.slice(1)];
    const s = {
      ...newShow(ui.date),
      venue: venue ? venue.name : '',
      venueId: venue ? venue.id : null,
      city: venue ? venue.city : 'Seattle',
      billing: ui.billing,
      price: ui.price ? `$${ui.price}` : '',
      deal: ui.share ? `We keep about ${ui.share}% of the door after costs` : '',
      contact: venue ? venue.bookingEmail || venue.bookingPerson : '',
      status: 'idea',
      lineup: lineup.map((name) => ({ id: mid('lu'), name, time: '' })),
      todo: showTodo(),
      notes: be != null ? `Break-even: ${be} tickets at $${ui.price}.` : '',
    };
    ctx.update((d) => d.shows.push(s));
    Object.assign(buildUI, { bands: [], venueId: '' });
    toast('Show created with its to-do list. Pitch the venue next.');
    ctx.go('shows', s.id);
  };
  return h(
    'div',
    { class: 'mgr-cols' },
    h(
      'section',
      { class: 'mgr-sect' },
      h('h2', {}, '1 · When and where'),
      h('div', { class: 'mgr-two' }, inp('date', 'Date', 'date'), h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Billing'), billSel)),
      h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Venue'), venueSel),
      venue ? h('p', { class: 'muted small' }, [venue.city, venue.capacity && `${venue.capacity} capacity`, venue.ages].filter(Boolean).join(' · '), venue.howToBook ? h('span', {}, h('br'), venue.howToBook) : null) : h('p', { class: 'muted tiny' }, 'Pick one from your venue list, or leave it empty for now.'),
      h('h2', {}, '2 · Who plays'),
      pool.length ? h('div', { class: 'chips' }, pool.map((b) => button(b.name, () => toggle(b.name), { variant: `chip${ui.bands.includes(b.name) ? ' on' : ''}` }))) : h('p', { class: 'muted small' }, 'Add bands in the Bands tab to pick them here.'),
      h('p', { class: 'muted tiny' }, ui.bands.length ? `${ui.bands.length + 1} bands with you. Three or four is a full local bill.` : 'Three or four bands is a full local bill. Pick bands whose fans would like yours.'),
    ),
    h(
      'section',
      { class: 'mgr-sect' },
      h('h2', {}, '3 · Does it add up?'),
      h('div', { class: 'mgr-two' }, inp('draw', 'Each band brings about', 'number', 'people'), inp('price', 'Ticket price ($)', 'number')),
      h('div', { class: 'mgr-two' }, inp('share', 'Bands’ share of the door (%)', 'number'), inp('costs', 'Your costs ($): sound, flyers, gas', 'number')),
      h('ul', { class: 'mgr-facts' },
        h('li', {}, h('span', {}, 'Tickets to cover costs'), h('strong', {}, be == null ? '—' : String(be))),
        ui.draw ? h('li', {}, h('span', {}, 'Expected crowd'), h('strong', {}, String(crowd))) : null,
        venue && fit ? h('li', {}, h('span', {}, 'Room size'), h('strong', {}, fit === 'good' ? 'Good fit: it will feel full' : fit === 'stretch' ? 'A stretch: push presales' : 'Too big: try a smaller room')) : null,
        ui.draw && ui.price ? h('li', {}, h('span', {}, 'Door for the bands'), h('strong', {}, `$${Math.round(crowd * +ui.price * (+ui.share / 100) - +ui.costs)}`)) : null,
      ),
      h('p', { class: 'muted tiny' }, 'Rough maths only: real deals vary (guarantees, door splits after the venue’s costs, ticket fees).'),
      button('Create this show', create, { iconName: 'ticket', variant: 'primary' }),
      h('p', { class: 'muted tiny' }, icon('check', 12), ' It gets the standard to-do list: pitch, confirm, flyer, tickets, promo posts, advance and settle.'),
    ),
  );
}
