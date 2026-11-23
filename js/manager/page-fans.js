// Fans & opportunities: the artist's own fan list (with a privacy panel, paste and CSV import, CSV
// export, a city summary, fans near each upcoming show and BCC mailto links), and the shared list of
// grants, festival calls, contests and residencies with deadline reminders.
import { h, button, iconButton, toast, download, pickFiles } from '../dom.js';
import { niceDate } from './model.js';
import { FAN_SOURCES, FAN_FIELDS, FAN_MAX, FAN_IMPORT_CAP, normalizeFans, newFan, addFans, parseFanLines, fansFromCSV, fansCSV, bccMailtos, emailable, citySummary, noCityCount, cityKey, fanAliases, showsWithFans, filterFans, isEmail } from './fans.js';
import { OPP_KINDS, OPP_STATUSES, normalizeOpps, newOpp, filterOpps, daysLeft, kindLabel, seedOpps, needsOppSeed, SEED_OPPS_ON } from './opps.js';

const TABS = [['fans', 'Fans'], ['opps', 'Opportunities']];
export const fansUI = { q: '', city: '', source: '', sort: 'added', shown: 100, draft: { email: '', name: '', city: '', region: '', source: 'show', showId: '', note: '', consent: false }, paste: '', pasteConsent: false, csv: null, subject: '', mail: null, undo: null };
export const oppsUI = { kind: '', status: '', region: '', sort: 'deadline', open: null, undo: null };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Add the researched starter list the first time, once (a deletion afterwards sticks). */
function seedOnce(ctx) {
  if (!needsOppSeed(ctx.store.get())) return;
  queueMicrotask(() =>
    ctx.update((d) => {
      d.opportunities = seedOpps(d.opportunities);
      d.seeded = { ...(d.seeded || {}), opps: SEED_OPPS_ON };
    }),
  );
}

export function buildFans(ctx) {
  seedOnce(ctx);
  const tab = TABS.some(([k]) => k === ctx.view.tab) ? ctx.view.tab : 'fans';
  return h(
    'div',
    { class: 'mgr-page wide fo-page' },
    h('header', { class: 'mgr-head' }, h('div', {}, h('h1', {}, 'Fans & opportunities'), h('p', { class: 'muted' }, 'The people who want to hear from you, and the grants, festivals and contests worth applying to.'))),
    h('div', { class: 'mgr-tabs', role: 'tablist' }, TABS.map(([k, l]) => h('button', { type: 'button', role: 'tab', 'aria-selected': k === tab ? 'true' : 'false', class: `mgr-tab${k === tab ? ' on' : ''}`, onclick: () => ctx.go('fans', null, k) }, l))),
    h('div', { role: 'tabpanel' }, tab === 'opps' ? oppsTab(ctx) : fansTab(ctx)),
  );
}

/** A bar with one button that puts back what was just deleted. */
function undoBar(ui, ctx) {
  if (!ui.undo) return null;
  const u = ui.undo;
  return h('div', { class: 'fo-undo', role: 'status' }, h('span', {}, u.msg), button('Undo', () => ((ui.undo = null), u.fn()), { variant: 'sm primary' }), button('Dismiss', () => ((ui.undo = null), ctx.refresh()), { variant: 'sm ghost' }));
}

/** Mail links for a list of fans: one per chunk, with the count, and a line saying nothing is sent. */
function mailLinks(fans, subject, to) {
  const links = bccMailtos(fans.map((f) => f.email), { subject, to });
  if (!links.length) return h('p', { class: 'muted small' }, 'Nobody here can be emailed yet: a fan needs an email address and the “agreed to hear from us” box ticked.');
  return h(
    'div',
    { class: 'fo-mail' },
    h('div', { class: 'row' }, links.map((l) => h('a', { class: 'btn sm primary', href: l.href, target: '_blank', rel: 'noopener noreferrer' }, links.length > 1 ? `Open email ${l.part} of ${l.parts} (${plural(l.count, 'person', 'people')})` : `Open email (${plural(l.count, 'person', 'people')})`))),
    h('p', { class: 'muted tiny' }, `The app sends nothing. Each button opens your own mail app with the addresses in BCC, so fans don't see each other's.${links.length > 1 ? ` Long lists are split into ${links.length} emails (mail apps cut long links and limit recipients).` : ''}`),
  );
}

function fansTab(ctx) {
  const m = ctx.store.get();
  const f = ctx.form;
  const ui = fansUI;
  const all = normalizeFans(m.fans);
  const today = ctx.today();
  const rerender = () => ctx.refresh();
  const F = (id, fn) => (d, v) => {
    const x = d.fans.find((y) => y.id === id);
    if (x) fn(x, v);
  };
  const shows = [...m.shows].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const showLabel = (s) => [s.date ? niceDate(s.date, { weekday: false }) : 'No date', s.venue || 'venue TBD', s.city].filter(Boolean).join(' · ');
  const to = isEmail(m.band.contactEmail) ? m.band.contactEmail : '';
  const subject = ui.subject || `News from ${m.band.name || 'the band'}`;

  // ---- privacy
  const privacy = h(
    'section',
    { class: 'mgr-sect fo-privacy', 'aria-label': 'Privacy' },
    h('strong', {}, 'Stored only in this browser. Backups include this list. Only add people who agreed to hear from you.'),
    h('p', { class: 'muted small' }, 'No phone numbers are kept. Fan details never go into the press kit, show sheets, PDFs or calendar files. The app sends nothing: the email buttons open your own mail app. There is no sync, so a list on another computer is separate.'),
    h('div', { class: 'row' }, button('Back up without the fan list', () => ctx.backUpWithoutFans(), { iconName: 'download', variant: 'sm', title: 'A backup file with every artist’s fan list left out (the lists here are not changed)' }), h('span', { class: 'muted tiny' }, 'Use this one when you share a backup with a bandmate.')),
  );

  // ---- add one
  const dr = ui.draft;
  const di = (k, ph, type = 'text') => {
    const el = h('input', { type, placeholder: ph, value: dr[k], 'aria-label': ph });
    el.addEventListener('input', () => (dr[k] = el.value));
    return el;
  };
  const srcSel = h('select', { 'aria-label': 'Where you met' }, FAN_SOURCES.map(([v, l]) => h('option', { value: v, selected: dr.source === v }, l)));
  srcSel.addEventListener('change', () => (dr.source = srcSel.value));
  const showSel = h('select', { 'aria-label': 'Show' }, h('option', { value: '' }, 'No show'), shows.map((s) => h('option', { value: s.id, selected: dr.showId === s.id }, showLabel(s))));
  showSel.addEventListener('change', () => (dr.showId = showSel.value));
  const consent = h('input', { type: 'checkbox', checked: dr.consent });
  consent.addEventListener('change', () => (dr.consent = consent.checked));
  const addOne = () => {
    if (!isEmail(dr.email)) return toast('Type a valid email address.', 'error');
    const r = addFans(all, [{ ...dr, source: dr.source }], { today, cap: 1 });
    if (r.dupes) return toast('That email is on the list already.', 'error');
    if (r.over) return toast(`The list is full (${FAN_MAX} people).`, 'error');
    const fan = r.list[r.list.length - 1];
    ctx.update((d) => d.fans.unshift(fan));
    ui.draft = { email: '', name: '', city: dr.city, region: dr.region, source: dr.source, showId: dr.showId, note: '', consent: false };
    toast('Added.');
  };
  const addForm = h(
    'section',
    { class: 'mgr-sect' },
    h('h2', {}, 'Add a fan'),
    h('div', { class: 'fo-add' }, di('email', 'Email', 'email'), di('name', 'Name (optional)'), di('city', 'City'), di('region', 'Region or country (optional)'), srcSel, showSel, di('note', 'Note (optional)')),
    h('div', { class: 'row' }, h('label', { class: 'mf inline' }, consent, h('span', {}, 'They agreed to hear from us')), button('Add', addOne, { iconName: 'plus', variant: 'sm primary' })),
  );

  // ---- paste and CSV
  const pasteBox = h('textarea', { rows: 4, placeholder: 'one per line: email, name, city\nsam@example.com, Sam, Tacoma', 'aria-label': 'Paste a list of fans' });
  pasteBox.value = ui.paste;
  pasteBox.addEventListener('input', () => (ui.paste = pasteBox.value));
  const pasteConsent = h('input', { type: 'checkbox', checked: ui.pasteConsent });
  pasteConsent.addEventListener('change', () => (ui.pasteConsent = pasteConsent.checked));
  const importRows = (rows, msgFrom) => {
    const r = addFans(all, rows.map((x) => ({ ...x, consent: ui.pasteConsent, source: x.source || 'other' })), { today, cap: FAN_IMPORT_CAP });
    if (r.added) ctx.update((d) => (d.fans = [...r.list.slice(all.length).reverse(), ...d.fans]));
    toast([`${msgFrom}: added ${r.added}`, r.dupes && `${r.dupes} already on the list`, r.invalid && `${r.invalid} without a valid email`, r.over && `${r.over} over the limit`].filter(Boolean).join(', ') + '.', r.added ? 'info' : 'error', 6000);
    return r;
  };
  const csvPick = async () => {
    const [file] = await pickFiles('.csv,text/csv,text/plain', false);
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast('That file is over 5 MB. Split it and import the parts.', 'error');
    const text = await file.text();
    const p = fansFromCSV(text);
    ui.csv = { name: file.name, text, heading: !!p.head.length, map: p.map, cols: Math.max(p.map.length, p.head.length) };
    rerender();
  };
  const csvPanel = () => {
    const c = ui.csv;
    const p = fansFromCSV(c.text, { map: c.map, heading: c.heading });
    const headCells = p.head;
    const colSel = (i) => {
      const s = h('select', { 'aria-label': `Column ${i + 1}: ${headCells[i] || ''}` }, FAN_FIELDS.map(([v, l]) => h('option', { value: v, selected: (c.map[i] || '') === v }, l)));
      s.addEventListener('change', () => ((c.map[i] = s.value), rerender()));
      return s;
    };
    const headCheck = h('input', { type: 'checkbox', checked: c.heading });
    headCheck.addEventListener('change', () => ((c.heading = headCheck.checked), rerender()));
    const ok = c.map.includes('email');
    return h(
      'div',
      { class: 'fo-csv' },
      h('p', { class: 'small' }, `${c.name}: ${plural(p.total, 'row')}${p.total > FAN_IMPORT_CAP ? ` (the first ${FAN_IMPORT_CAP} are read)` : ''}. Pick where each column goes. Phone numbers are never imported.`),
      h('label', { class: 'mf inline' }, headCheck, h('span', {}, 'The first row is headings')),
      h('div', { class: 'fo-csv-cols' }, Array.from({ length: c.cols }, (_, i) => h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, headCells[i] || `Column ${i + 1}`), colSel(i)))),
      p.rows.length ? h('table', { class: 'mgr-table fo-preview' }, h('thead', {}, h('tr', {}, ['Email', 'Name', 'City', 'Region'].map((x) => h('th', {}, x)))), h('tbody', {}, p.rows.slice(0, 3).map((r) => h('tr', {}, [r.email, r.name, r.city, r.region].map((x) => h('td', {}, x)))))) : null,
      h('div', { class: 'row' }, button(`Import ${plural(Math.min(p.total, FAN_IMPORT_CAP), 'row')}`, () => (ok ? (importRows(p.rows, c.name), (ui.csv = null), rerender()) : toast('Pick which column has the email.', 'error')), { iconName: 'upload', variant: 'sm primary', disabled: !ok }), button('Cancel', () => ((ui.csv = null), rerender()), { variant: 'sm ghost' })),
    );
  };
  const importSect = h(
    'section',
    { class: 'mgr-sect' },
    h('h2', {}, 'Add many'),
    pasteBox,
    h('div', { class: 'row' }, h('label', { class: 'mf inline' }, pasteConsent, h('span', {}, 'Everyone in this list or file agreed to hear from us')), button('Add the pasted list', () => (ui.paste.trim() ? (importRows(parseFanLines(ui.paste), 'Pasted list').added && ((ui.paste = ''), rerender())) : toast('Paste one person per line first.', 'error')), { iconName: 'plus', variant: 'sm' }), button('Import a CSV file', csvPick, { iconName: 'upload', variant: 'sm' })),
    ui.csv ? csvPanel() : null,
    h('p', { class: 'muted tiny' }, `Duplicates (same email, any case) are skipped. Up to ${FAN_IMPORT_CAP} rows per import and ${FAN_MAX} people per artist, so the browser's storage doesn't fill up.`),
  );

  // ---- cities and shows
  const cities = citySummary(all);
  const noCity = noCityCount(all);
  const citySect = h(
    'section',
    { class: 'mgr-sect' },
    h('h2', {}, 'By city'),
    cities.length ? h('div', { class: 'fo-cities' }, cities.slice(0, 40).map((g) => button(`${g.city} · ${g.count}`, () => ((ui.city = ui.city === g.key ? '' : g.key), (ui.shown = 100), rerender()), { variant: `chip${ui.city === g.key ? ' on' : ''}` }))) : h('p', { class: 'muted small' }, 'Add fans with a city to see where they are.'),
    noCity ? h('p', { class: 'muted tiny' }, `${plural(noCity, 'fan')} without a city.`) : null,
  );
  const aliases = fanAliases(m.band);
  const upcoming = showsWithFans(m, today);
  const nearSect = h(
    'section',
    { class: 'mgr-sect' },
    h('h2', {}, 'Fans near a show'),
    upcoming.length
      ? h(
          'ul',
          { class: 'fo-near' },
          upcoming.map(({ show, fans, count, reachable }) => {
            const k = cityKey(show.city);
            const open = ui.mail === `show-${show.id}`;
            return h(
              'li',
              { class: 'fo-near-row' },
              h('div', { class: 'fo-near-head' }, h('button', { type: 'button', class: 'link', onclick: () => ctx.go('shows', show.id) }, showLabel(show)), h('strong', {}, plural(count, 'fan')), reachable ? button(open ? 'Hide' : `Email ${reachable}`, () => ((ui.mail = open ? null : `show-${show.id}`), rerender()), { iconName: 'link', variant: 'sm' }) : null),
              k ? f.text(`fo-alias-${k}`, 'Also try nearby', aliases[k] || '', (d, v) => (d.band.fanAliases = { ...fanAliases(d.band), [k]: v }), { placeholder: 'e.g. Tacoma, Bellevue, Everett', hint: `Towns counted as ${show.city} (for every show there).` }) : h('p', { class: 'muted tiny' }, 'This show has no city yet.'),
              open ? mailLinks(fans.filter((x) => x.email && x.consent), `${m.band.name || 'We'}: ${show.venue || 'show'} ${show.date ? niceDate(show.date, { weekday: false }) : ''}`.trim(), to) : null,
            );
          }),
        )
      : h('p', { class: 'muted small' }, 'No upcoming shows. Add one on the Shows page and the fans in that city show up here.'),
    h('p', { class: 'muted tiny' }, 'Matched by the city typed on the fan and on the show (case and spaces ignored), plus the nearby towns you list.'),
  );

  // ---- the list
  const list = filterFans(all, ui);
  const search = h('input', { type: 'search', placeholder: 'Search name, email, city, note…', value: ui.q, 'aria-label': 'Search fans' });
  let timer = null;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      ui.q = search.value;
      rerender();
      const s = document.querySelector('.fo-page .mgr-filters input[type=search]');
      if (s) (s.focus(), s.setSelectionRange(s.value.length, s.value.length));
    }, 200);
  });
  const sel = (k, aria, opts) => {
    const s = h('select', { 'aria-label': aria }, opts.map(([v, l]) => h('option', { value: v, selected: ui[k] === v }, l)));
    s.addEventListener('change', () => ((ui[k] = s.value), (ui.shown = 100), rerender()));
    return s;
  };
  const reach = emailable(list);
  const subj = h('input', { type: 'text', value: subject, 'aria-label': 'Email subject' });
  subj.addEventListener('change', () => (ui.subject = subj.value));
  const del = (fan) => {
    const at = m.fans.findIndex((x) => x.id === fan.id);
    const raw = m.fans[at];
    ctx.update((d) => (d.fans = d.fans.filter((x) => x.id !== fan.id)));
    ui.undo = { msg: `Deleted ${fan.name || fan.email}.`, fn: () => ctx.update((d) => d.fans.splice(Math.min(at, d.fans.length), 0, raw)) };
    rerender();
  };
  const delAll = () => {
    if (!all.length || !confirm(`Delete all ${all.length} fans for ${m.band.name || 'this artist'}? You can undo this right after.`)) return;
    const before = m.fans;
    ctx.update((d) => (d.fans = []));
    ui.undo = { msg: 'Deleted the whole fan list.', fn: () => ctx.update((d) => (d.fans = before)) };
    rerender();
  };
  const listSect = h(
    'section',
    { class: 'mgr-sect' },
    h('div', { class: 'fo-list-head' }, h('h2', {}, `Fan list · ${all.length}`), h('div', { class: 'row' }, button('Download CSV', () => (download(new Blob([fansCSV(list, { shows: m.shows })], { type: 'text/csv' }), `fans-${today}.csv`), toast('This file has people’s details in it. Keep it safe.', 'info', 5000)), { iconName: 'download', variant: 'sm', disabled: !list.length, title: 'The fans shown below, as a spreadsheet (personal data)' }), button('Delete all', delAll, { iconName: 'trash', variant: 'sm ghost', disabled: !all.length }))),
    h('div', { class: 'mgr-filters' }, search, sel('city', 'City', [['', 'All cities'], ...cities.map((g) => [g.key, `${g.city} (${g.count})`])]), sel('source', 'Where you met', [['', 'Anywhere'], ...FAN_SOURCES]), sel('sort', 'Sort', [['added', 'Newest first'], ['name', 'By name'], ['city', 'By city']])),
    h(
      'div',
      { class: 'fo-email' },
      h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Email these fans'), subj),
      button(ui.mail === 'list' ? 'Hide' : `Email ${plural(reach.length, 'fan')}`, () => ((ui.mail = ui.mail === 'list' ? null : 'list'), rerender()), { iconName: 'link', variant: 'sm', disabled: !reach.length }),
      list.length > reach.length ? h('span', { class: 'muted tiny' }, `${list.length - reach.length} shown without an email or without “agreed to hear from us” are left out.`) : null,
    ),
    ui.mail === 'list' ? mailLinks(reach, subject, to) : null,
    list.length
      ? h(
          'div',
          { class: 'fo-table-wrap' },
          h(
            'table',
            { class: 'mgr-table fo-table' },
            h('thead', {}, h('tr', {}, ['Name', 'Email', 'City', 'Met', 'Added', 'Agreed', ''].map((x) => h('th', {}, x)))),
            h(
              'tbody',
              {},
              list.slice(0, ui.shown).map((x) =>
                h(
                  'tr',
                  {},
                  h('td', {}, f.text(`fn-${x.id}`, '', x.name, F(x.id, (y, v) => (y.name = v)), { placeholder: 'Name', aria: `Name: ${x.email}` })),
                  h('td', {}, f.text(`fe-${x.id}`, '', x.email, F(x.id, (y, v) => (isEmail(v) ? (y.email = v.trim()) : toast('That isn’t a valid email; kept the old one.', 'error'))), { type: 'email', aria: `Email: ${x.name || x.email}` })),
                  h('td', {}, f.text(`fc-${x.id}`, '', x.city, F(x.id, (y, v) => (y.city = v)), { placeholder: 'City', aria: `City: ${x.name || x.email}` })),
                  h('td', {}, f.select(`fs-${x.id}`, '', x.source, FAN_SOURCES, F(x.id, (y, v) => (y.source = v)), { aria: `Where you met: ${x.name || x.email}` })),
                  h('td', { class: 'muted tiny' }, x.added ? niceDate(x.added, { weekday: false }) : ''),
                  h('td', {}, f.check(`fk-${x.id}`, x.consent, F(x.id, (y, v) => (y.consent = v)), `Agreed to hear from us: ${x.name || x.email}`)),
                  h('td', {}, iconButton('trash', `Delete ${x.name || x.email}`, () => del(x), 'ghost')),
                ),
              ),
            ),
          ),
          list.length > ui.shown ? button(`Show ${Math.min(100, list.length - ui.shown)} more (of ${list.length - ui.shown})`, () => ((ui.shown += 100), rerender()), { variant: 'sm ghost' }) : null,
        )
      : h('p', { class: 'muted small' }, all.length ? 'No fans match these filters.' : 'No fans yet. Add the people who sign up at your merch table or on your site.'),
  );

  return h('div', { class: 'fo-fans' }, undoBar(ui, ctx), privacy, h('div', { class: 'mgr-cols' }, h('div', {}, addForm, importSect), h('div', {}, citySect, nearSect)), listSect);
}

function oppsTab(ctx) {
  const m = ctx.store.get();
  const f = ctx.form;
  const ui = oppsUI;
  const today = ctx.today();
  const rerender = () => ctx.refresh();
  // opened from a reminder (#m/fans/<id>/opps): that card opens and scrolls into view, once
  if (ctx.view.id && ui.linked !== ctx.view.id) ((ui.open = ctx.view.id), (ui.linked = ctx.view.id), (ui.scrolled = false));
  const O = (id, fn) => (d, v) => {
    const x = d.opportunities.find((y) => y.id === id);
    if (x) fn(x, v);
  };
  const all = normalizeOpps(m.opportunities);
  const list = filterOpps(all, { ...ui, today });
  const sel = (k, aria, opts) => {
    const s = h('select', { 'aria-label': aria }, opts.map(([v, l]) => h('option', { value: v, selected: ui[k] === v }, l)));
    s.addEventListener('change', () => ((ui[k] = s.value), rerender()));
    return s;
  };
  const region = h('input', { type: 'search', placeholder: 'Region (e.g. Seattle, WA, Toronto)', value: ui.region, 'aria-label': 'Region' });
  region.addEventListener('change', () => ((ui.region = region.value), rerender()));
  const add = () => {
    const o = newOpp({ name: 'New opportunity', checked: today });
    ctx.update((d) => d.opportunities.unshift(o));
    ui.open = o.id;
    rerender();
  };
  const del = (o) => {
    const at = m.opportunities.findIndex((x) => x.id === o.id);
    const raw = m.opportunities[at];
    ctx.update((d) => (d.opportunities = d.opportunities.filter((x) => x.id !== o.id)));
    ui.undo = { msg: `Deleted ${o.name || 'the opportunity'}.`, fn: () => ctx.update((d) => d.opportunities.splice(Math.min(at, d.opportunities.length), 0, raw)) };
    rerender();
  };
  const left = (o) => {
    const n = daysLeft(o, today);
    if (n == null) return h('span', { class: 'mgr-chip fo-nodate' }, 'No date: check the site');
    if (n < 0) return h('span', { class: 'mgr-chip fo-closed' }, `Closed ${niceDate(o.deadline, { weekday: false })}`);
    return h('span', { class: `mgr-chip ${n <= 3 ? 'fo-soon' : n <= 14 ? 'fo-due' : 'fo-open'}` }, n === 0 ? 'Closes today' : `${plural(n, 'day')} left`);
  };
  const card = (o) => {
    const open = ui.open === o.id;
    const details = h(
      'details',
      { class: 'fo-opp-more', open },
      h('summary', {}, 'Edit details'),
      h(
        'div',
        { class: 'fo-opp-grid' },
        f.text(`on-${o.id}`, 'Name', o.name, O(o.id, (x, v) => (x.name = v))),
        f.text(`oo-${o.id}`, 'Organisation', o.org, O(o.id, (x, v) => (x.org = v))),
        f.select(`ok-${o.id}`, 'Kind', o.kind, OPP_KINDS, O(o.id, (x, v) => (x.kind = v))),
        f.text(`ou-${o.id}`, 'Link', o.url, O(o.id, (x, v) => (/^https?:\/\//i.test(v.trim()) || !v.trim() ? (x.url = v.trim()) : toast('Links start with https://', 'error'))), { type: 'url', placeholder: 'https://' }),
        f.text(`or-${o.id}`, 'Region', o.region, O(o.id, (x, v) => (x.region = v))),
        f.text(`of-${o.id}`, 'Fee', o.fee, O(o.id, (x, v) => (x.fee = v)), { placeholder: 'Free, $25…' }),
        f.text(`oc-${o.id}`, 'Last checked', o.checked, O(o.id, (x, v) => (x.checked = v)), { type: 'date' }),
      ),
      f.text(`ox-${o.id}`, 'Notes', o.notes, O(o.id, (x, v) => (x.notes = v)), { rows: 3 }),
    );
    details.addEventListener('toggle', () => {
      if (details.open) ui.open = o.id;
      else if (ui.open === o.id) ui.open = null;
    });
    return h(
      'li',
      { class: `fo-opp${open ? ' open' : ''}`, 'data-id': o.id },
      h(
        'div',
        { class: 'fo-opp-head' },
        h('div', { class: 'fo-opp-title' }, o.url ? h('a', { href: o.url, target: '_blank', rel: 'noopener noreferrer' }, o.name || 'Untitled') : h('strong', {}, o.name || 'Untitled'), h('span', { class: 'muted small' }, [kindLabel(o.kind), o.org, o.region].filter(Boolean).join(' · '))),
        left(o),
      ),
      h(
        'div',
        { class: 'fo-opp-row' },
        f.select(`os-${o.id}`, '', o.status, OPP_STATUSES, O(o.id, (x, v) => (x.status = v)), { aria: `Status: ${o.name}` }),
        h('label', { class: 'mf inline' }, h('span', { class: 'mf-l' }, 'Deadline'), f.text(`od-${o.id}`, '', o.deadline, O(o.id, (x, v) => (x.deadline = v)), { type: 'date', aria: `Deadline: ${o.name}` })),
        o.fee ? h('span', { class: 'muted small' }, `Fee: ${o.fee}`) : null,
        h('span', { class: 'muted tiny' }, o.checked ? `Checked ${niceDate(o.checked, { weekday: false })}` : 'Not checked yet'),
        button('Checked today', () => ctx.update((d) => O(o.id, (x) => (x.checked = today))(d)), { variant: 'sm ghost', title: 'You looked at the site today and the details are right' }),
        iconButton('trash', `Delete ${o.name}`, () => del(o), 'ghost'),
      ),
      o.notes && !open ? h('p', { class: 'small fo-opp-notes' }, o.notes) : null,
      details,
    );
  };
  const node = h(
    'div',
    { class: 'fo-opps' },
    undoBar(ui, ctx),
    h('div', { class: 'fo-warn', role: 'note' }, h('strong', {}, 'Dates change, always confirm on the site.'), h('span', {}, ' The starter list was checked on 23 Nov 2026 from each organiser’s public pages. Nothing here updates itself. Where a deadline couldn’t be confirmed it is left blank: check the site.')),
    h('div', { class: 'mgr-filters' }, region, sel('kind', 'Kind', [['', 'All kinds'], ...OPP_KINDS]), sel('status', 'Status', [['', 'Any status'], ...OPP_STATUSES]), sel('sort', 'Sort', [['deadline', 'Deadline'], ['name', 'Name'], ['status', 'Status']]), button('Add', add, { iconName: 'plus', variant: 'sm primary' })),
    h('p', { class: 'muted tiny' }, `${plural(list.length, 'opportunity', 'opportunities')}${list.length < all.length ? ` of ${all.length}` : ''}. Reminders come 14 and 3 days before a deadline (in the Calendar and on Home) until you mark it Applied or Passed. The list is shared by every artist.`),
    list.length ? h('ul', { class: 'fo-opp-list' }, list.map(card)) : h('p', { class: 'muted small' }, all.length ? 'Nothing matches these filters.' : 'No opportunities yet. Add grants, festival calls and contests you want to apply for.'),
  );
  if (ctx.view.id && ui.linked === ctx.view.id && !ui.scrolled) {
    ui.scrolled = true;
    queueMicrotask(() => {
      const el = document.querySelector(`.fo-opp[data-id="${CSS.escape(ctx.view.id)}"]`);
      if (el) el.scrollIntoView({ block: 'center' });
    });
  }
  return node;
}
