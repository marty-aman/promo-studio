// Calendar > Availability: ask the band which dates work. See availability.js for how it works.
import { h, icon, button, iconButton, download, toast } from '../dom.js';
import { niceDate } from './model.js';
import { monthGrid, monthStart } from './extras.js';
import { LIMITS, POLL_KINDS, kindLabel, normalizePoll, newPoll, pollProblem, splitNames, datesInRange, mergeCodes, tally, buildPollFile, pollFileName, inviteText, eventFromPoll, showFromPoll } from './availability.js';

const WEEKDAYS = [['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6], ['Sun', 0]];
const ANS = { yes: ['Yes', 'av-yes'], maybe: ['Maybe', 'av-maybe'], no: ['No', 'av-no'], '': ['–', 'av-none'] };

/** What the screen remembers between redraws (nothing here is saved). */
export const availUI = { sel: '', creating: false, draft: null, results: [], pasted: '', pick: { start: '', end: '' } };
const blankDraft = (today) => ({ title: '', kind: 'rehearsal', dates: [], members: '', month: monthStart(today), from: '', to: '', days: [] });

/** Change one poll through the store (one undo step). */
const edit = (ctx, id, fn) =>
  ctx.update((m) => {
    const i = m.availability.findIndex((x) => x.id === id);
    if (i >= 0) m.availability[i] = normalizePoll(fn(normalizePoll(m.availability[i])));
  });

const limits = () =>
  h(
    'section',
    { class: 'mgr-sect av-limits', 'aria-label': 'How this works and what it cannot do' },
    h('h2', {}, 'How it works, and what it can’t do'),
    h(
      'ul',
      {},
      h('li', {}, 'You make a ', h('b', {}, 'poll file'), ' and send it to your bandmates by message or email. This app runs on your own computer (127.0.0.1), so a link to it would not open for them.'),
      h('li', {}, 'They open the file, tick Yes, Maybe or No for each date and send you back a short ', h('b', {}, 'reply code'), '. You paste the codes here.'),
      h('li', {}, 'There is no live sync: nothing comes back by itself. The code is not secret and does not prove who sent it, anyone with the file can answer, and you only see what people send you.'),
      h('li', {}, 'Only names are kept (no emails or phone numbers). Polls are stored in this browser and in your backup files.'),
    ),
  );

// ---------- making a poll
function createForm(ctx, today) {
  const d = (availUI.draft ||= blankDraft(today));
  const field = (label, el) => h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, label), el);
  const title = h('input', { type: 'text', 'data-k': 'av-title', maxlength: LIMITS.title, placeholder: 'Rehearsal before the Funhouse show' });
  title.value = d.title;
  title.addEventListener('input', () => (d.title = title.value));
  const kind = h('select', { 'data-k': 'av-kind' }, POLL_KINDS.map(([v, l]) => h('option', { value: v, selected: v === d.kind }, l)));
  kind.addEventListener('change', () => (d.kind = kind.value));
  const members = h('textarea', { rows: 3, 'data-k': 'av-members', placeholder: 'One name per line, or separated by commas' });
  members.value = d.members;
  members.addEventListener('input', () => (d.members = members.value));
  const names = ctx.store.get().band.members;
  const fill = names?.some((x) => x && x.name) ? button('Use my band members', () => ((d.members = names.filter((x) => x && x.name).map((x) => x.name).join('\n')), ctx.refresh()), { variant: 'sm ghost' }) : null;

  const toggle = (date) => {
    const at = d.dates.indexOf(date);
    if (at >= 0) d.dates.splice(at, 1);
    else if (d.dates.length >= LIMITS.dates) return toast(`A poll can have at most ${LIMITS.dates} dates.`, 'error');
    else d.dates.push(date), d.dates.sort();
    ctx.refresh();
  };
  const weeks = monthGrid(d.month);
  const monthName = new Date(`${d.month}T12:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const grid = h(
    'div',
    { class: 'av-cal', role: 'group', 'aria-label': `Pick dates in ${monthName}` },
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((x) => h('span', { class: 'av-cal-h' }, x)),
    weeks.flat().map((date) => {
      const on = d.dates.includes(date);
      const past = date < today;
      return h('button', { type: 'button', class: `av-day${on ? ' on' : ''}${date.slice(0, 7) !== d.month.slice(0, 7) ? ' out' : ''}`, 'aria-pressed': on ? 'true' : 'false', 'aria-label': niceDate(date), 'data-date': date, disabled: past, onclick: () => toggle(date) }, String(+date.slice(8)));
    }),
  );
  const rangeIn = (k) => {
    const el = h('input', { type: 'date', 'data-k': `av-range-${k}` });
    el.value = d[k];
    el.addEventListener('input', () => (d[k] = el.value));
    return el;
  };
  const dayBox = ([label, n]) => {
    const c = h('input', { type: 'checkbox', 'data-k': `av-wd-${label}`, checked: d.days.includes(n) });
    c.addEventListener('change', () => (c.checked ? d.days.push(n) : (d.days = d.days.filter((x) => x !== n))));
    return h('label', { class: 'av-wd' }, c, label);
  };
  const addRange = () => {
    const found = datesInRange(d.from, d.to, d.days).filter((x) => x >= today);
    if (!found.length) return toast('Pick a first and last date and at least one weekday (past dates are skipped).', 'error');
    const all = [...new Set([...d.dates, ...found])].sort();
    if (all.length > LIMITS.dates) toast(`Only the first ${LIMITS.dates} dates were kept.`, 'info');
    d.dates = all.slice(0, LIMITS.dates);
    ctx.refresh();
  };
  const create = () => {
    const problem = pollProblem({ dates: d.dates, members: d.members, title: d.title });
    if (problem) return toast(problem, 'error');
    const poll = newPoll({ title: d.title, dates: d.dates, kind: d.kind, members: splitNames(d.members) });
    ctx.update((m) => m.availability.push(poll));
    availUI.sel = poll.id;
    availUI.creating = false;
    availUI.draft = null;
    availUI.results = [];
    toast(`Poll “${poll.title}” is ready. Make the poll file next.`);
    ctx.refresh();
  };
  const hasPolls = ctx.store.get().availability.length > 0;
  return h(
    'section',
    { class: 'mgr-sect av-create', 'aria-label': 'New poll' },
    h('h2', {}, 'New poll'),
    h('div', { class: 'mgr-two' }, field('What for', title), field('Kind', kind)),
    h('div', { class: 'av-pick' },
      h('div', {},
        h('div', { class: 'row av-month' }, iconButton('arrowLeft', 'Previous month', () => ((d.month = monthStart(d.month, -1)), ctx.refresh()), 'ghost'), h('b', {}, monthName), iconButton('arrowRight', 'Next month', () => ((d.month = monthStart(d.month, 1)), ctx.refresh()), 'ghost')),
        grid,
        h('p', { class: 'muted tiny' }, 'Click days to pick or un-pick them.'),
      ),
      h('div', { class: 'av-range' },
        h('b', {}, 'Or add a range of weekdays'),
        h('div', { class: 'mgr-two' }, field('From', rangeIn('from')), field('To', rangeIn('to'))),
        h('div', { class: 'av-wds' }, WEEKDAYS.map(dayBox)),
        button('Add these dates', addRange, { variant: 'sm', iconName: 'plus' }),
      ),
    ),
    h('div', { class: 'av-chosen', 'aria-live': 'polite' },
      h('b', {}, `${d.dates.length} of ${LIMITS.dates} dates`),
      d.dates.map((x) => h('button', { type: 'button', class: 'av-chip', title: 'Remove this date', 'aria-label': `Remove ${niceDate(x)}`, onclick: () => toggle(x) }, niceDate(x, { weekday: true }), ' ✕')),
      d.dates.length ? button('Clear', () => ((d.dates = []), ctx.refresh()), { variant: 'sm ghost' }) : null,
    ),
    field(`Who should answer (up to ${LIMITS.people} names; names only)`, members),
    h('div', { class: 'row' }, fill, button('Create poll', create, { iconName: 'check', variant: 'sm primary' }), hasPolls ? button('Cancel', () => ((availUI.creating = false), ctx.refresh()), { variant: 'sm ghost' }) : null),
  );
}

// ---------- one poll
function pollView(ctx, poll, today) {
  const m = ctx.store.get();
  const t = tally(poll);
  const busy = new Map();
  for (const s of m.shows) if (s.date && s.status !== 'cancelled') busy.set(s.date, `Show: ${s.venue || 'venue TBD'}`);
  for (const e of m.events || []) if (e.date && !e.repeat) busy.set(e.date, `${e.title || 'Event'}`);

  const makeFile = () => {
    try {
      download(new Blob([buildPollFile(poll)], { type: 'text/html' }), pollFileName(poll));
      toast('Poll file saved. Send it to your bandmates; they open it in any browser.');
    } catch (e) {
      toast(`Could not make the file: ${e.message}`, 'error');
    }
  };
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteText(poll));
      toast('Message copied.');
    } catch {
      toast(inviteText(poll), 'info', 9000);
    }
  };
  const pasted = h('textarea', { rows: 3, 'data-k': 'av-paste', placeholder: 'Paste one or several reply codes (or the whole message they sent). Codes start with AV1.' });
  pasted.value = availUI.pasted;
  pasted.addEventListener('input', () => (availUI.pasted = pasted.value));
  const add = () => {
    const r = mergeCodes(poll, pasted.value);
    availUI.results = r.results;
    if (r.results.some((x) => x.ok)) {
      availUI.pasted = '';
      edit(ctx, poll.id, () => r.poll);
    } else ctx.refresh();
  };
  const verb = { added: 'reply added', replaced: 'reply replaced their earlier one', unchanged: 'was already here, no change' };
  const results = availUI.results.length
    ? h('ul', { class: 'av-results', role: 'status' }, availUI.results.map((x) => h('li', { class: x.ok ? 'ok' : 'bad' }, x.ok ? `${x.name}: ${verb[x.status]}${x.extra ? ' (not on your list of names, added to the grid)' : ''}.` : x.error)))
    : null;

  const decide = (date) => {
    edit(ctx, poll.id, (p) => ({ ...p, decided: date }));
    availUI.pick = { start: '', end: '' };
  };
  const hasEvent = poll.eventId && (m.events || []).some((e) => e.id === poll.eventId);
  const hasShow = poll.showId && m.shows.some((s) => s.id === poll.showId);
  const addEvent = () => {
    const ev = eventFromPoll(poll, poll.decided, availUI.pick);
    ctx.update((d) => {
      (d.events ||= []).push(ev);
      const p = d.availability.find((x) => x.id === poll.id);
      if (p) p.eventId = ev.id;
    });
    toast(`Added “${ev.title}” to the calendar on ${niceDate(ev.date, { weekday: false })}.`);
  };
  const addShow = () => {
    const sh = showFromPoll(poll, poll.decided, m.band.city);
    ctx.update((d) => {
      d.shows.push(sh);
      const p = d.availability.find((x) => x.id === poll.id);
      if (p) p.showId = sh.id;
    });
    toast('Show draft added. Fill in the venue next.');
    ctx.go('shows', sh.id);
  };
  const timeIn = (k, label) => {
    const el = h('input', { type: 'time', 'data-k': `av-${k}`, 'aria-label': label });
    el.value = availUI.pick[k];
    el.addEventListener('input', () => (availUI.pick[k] = el.value));
    return h('label', { class: 'mf inline' }, h('span', { class: 'mf-l' }, label), el);
  };
  const decided = poll.decided
    ? h('div', { class: 'av-decided', role: 'status' },
        h('p', {}, icon('check', 14), ' ', h('b', {}, `Decided: ${niceDate(poll.decided)}`)),
        poll.kind === 'show'
          ? hasShow ? h('p', {}, 'A show draft is in Shows. ', button('Open it', () => ctx.go('shows', poll.showId), { variant: 'sm' })) : button('Add a show draft on this date', addShow, { iconName: 'ticket', variant: 'sm primary' })
          : hasEvent ? h('p', {}, `On the calendar as “${poll.title || kindLabel(poll.kind)}”. `, button('Open it', () => ctx.go('calendar', poll.eventId), { variant: 'sm' }))
          : h('div', { class: 'row' }, timeIn('start', 'Starts (optional)'), timeIn('end', 'Ends'), button(`Add ${kindLabel(poll.kind).toLowerCase()} to the calendar`, addEvent, { iconName: 'calendar', variant: 'sm primary' })),
        button('Pick a different date', () => decide(''), { variant: 'sm ghost' }),
      )
    : null;

  const sum = (label, dates, cls) => h('p', { class: `av-sum ${cls}` }, h('b', {}, `${label}: `), dates.length ? dates.map((x) => niceDate(x, { weekday: true })).join(' · ') : h('span', { class: 'muted' }, 'none'));
  const bestRow = t.rows.find((r) => r.date === t.best);
  const summary = poll.replies.length
    ? h('div', { class: 'av-summary' },
        t.best ? h('p', { class: 'av-best' }, icon('star', 14), ' ', h('b', {}, `Best date: ${niceDate(t.best)}`), ` (${bestRow.yes} yes, ${bestRow.maybe} maybe, ${bestRow.no} no${bestRow.none ? `, ${bestRow.none} not answered` : ''})`, ' ', poll.decided === t.best ? null : button('Pick this date', () => decide(t.best), { variant: 'sm primary' })) : h('p', { class: 'muted' }, 'No date has a Yes or a Maybe yet.'),
        sum('Everyone can', t.everyone, 'av-all'),
        sum('Everyone, but some only maybe', t.maybesOnly, 'av-soft'),
        t.waiting.length ? h('p', { class: 'muted' }, `Waiting for: ${t.waiting.join(', ')}. Dates only count as “everyone” once all of them have replied.`) : null,
      )
    : h('p', { class: 'muted' }, 'No replies yet. Send the poll file, then paste the codes you get back.');

  const removeReply = (name) => edit(ctx, poll.id, (p) => ({ ...p, replies: p.replies.filter((r) => r.name !== name) }));
  const table = h(
    'div',
    { class: 'av-grid', tabindex: 0, role: 'region', 'aria-label': 'Availability grid, scrolls sideways on a narrow screen' },
    h('table', { class: 'mgr-table av-table' },
      h('thead', {}, h('tr', {},
        h('th', {}, 'Date'),
        t.people.map((n) => h('th', { scope: 'col' }, n, poll.replies.some((r) => r.name === n) ? h('button', { type: 'button', class: 'av-x', title: `Remove ${n}’s reply`, 'aria-label': `Remove ${n}’s reply`, onclick: () => removeReply(n) }, '✕') : null)),
        h('th', {}, 'Yes / Maybe / No'),
        h('th', {}, ''),
      )),
      h('tbody', {}, t.rows.map((r) => h('tr', { class: `${r.date === t.best ? 'av-bestrow' : ''}${r.date === poll.decided ? ' av-decidedrow' : ''}${r.everyone ? ' av-allrow' : ''}`, 'data-date': r.date },
        h('th', { scope: 'row' }, niceDate(r.date), r.date === t.best ? h('span', { class: 'av-tag' }, 'Best') : null, r.date === poll.decided ? h('span', { class: 'av-tag' }, 'Picked') : null, busy.has(r.date) ? h('span', { class: 'muted tiny av-busy' }, busy.get(r.date)) : null),
        t.people.map((n) => { const [l, c] = ANS[r.byPerson[n]]; return h('td', { class: c }, l); }),
        h('td', { class: 'av-count' }, `${r.yes} / ${r.maybe} / ${r.no}`),
        h('td', {}, r.date === poll.decided ? null : button('Pick', () => decide(r.date), { variant: 'sm ghost', title: `Pick ${niceDate(r.date)}` })),
      ))),
    ),
  );
  const remove = () => {
    ctx.update((d) => (d.availability = d.availability.filter((x) => x.id !== poll.id)));
    availUI.sel = '';
    availUI.results = [];
    toast(`Deleted the poll “${poll.title}”. Ctrl+Z brings it back.`, 'info', 5000);
  };
  return h(
    'section',
    { class: 'mgr-sect av-poll', 'aria-label': `Poll: ${poll.title}` },
    h('div', { class: 'av-ph' },
      h('div', {}, h('h2', {}, poll.title), h('p', { class: 'muted' }, `${kindLabel(poll.kind)} · ${poll.dates.length} dates · ${t.replied} of ${t.people.length || 0} replied`)),
      h('div', { class: 'row' }, button('Make poll file', makeFile, { iconName: 'download', variant: 'sm primary', title: 'One HTML file to send to your bandmates' }), button('Copy message to send with it', copyInvite, { variant: 'sm' }), button('Delete poll', remove, { iconName: 'trash', variant: 'sm ghost danger' })),
    ),
    h('h3', { class: 'av-h' }, '1. Send the poll file'),
    h('p', { class: 'muted' }, 'Attach the file to a message or email. It works offline in any browser and sends nothing anywhere. The dates cannot be changed once a file has gone out; make a new poll for new dates.'),
    h('h3', { class: 'av-h' }, '2. Paste the reply codes'),
    pasted,
    h('div', { class: 'row' }, button('Add replies', add, { iconName: 'plus', variant: 'sm primary' })),
    results,
    h('h3', { class: 'av-h' }, '3. See who can make it'),
    summary,
    poll.replies.length || t.people.length ? table : null,
    decided,
  );
}

export function buildAvailability(ctx) {
  const m = ctx.store.get();
  const today = ctx.today();
  const polls = m.availability.map(normalizePoll).filter((p) => p.id && p.dates.length);
  if (!polls.some((p) => p.id === availUI.sel)) availUI.sel = polls[0]?.id || '';
  const poll = polls.find((p) => p.id === availUI.sel);
  const creating = availUI.creating || !polls.length;
  const list = polls.length
    ? h('div', { class: 'av-list', role: 'tablist', 'aria-label': 'Your polls' },
        polls.map((p) => h('button', { type: 'button', role: 'tab', 'aria-selected': p.id === availUI.sel && !creating ? 'true' : 'false', class: `av-card${p.id === availUI.sel && !creating ? ' on' : ''}`, onclick: () => ((availUI.sel = p.id), (availUI.creating = false), (availUI.results = []), ctx.refresh()) },
          h('b', {}, p.title), h('span', { class: 'muted tiny' }, `${kindLabel(p.kind)} · ${p.replies.length}/${Math.max(p.members.length, p.replies.length)} replied${p.decided ? ` · picked ${niceDate(p.decided, { weekday: false })}` : ''}`))),
        button('New poll', () => ((availUI.creating = true), ctx.refresh()), { iconName: 'plus', variant: 'sm' }),
      )
    : null;
  return h(
    'div',
    { class: 'av-wrap' },
    ctx.combined && ctx.artists().length > 1 ? h('p', { class: 'muted tiny' }, `Polls belong to one artist. These are ${m.band.name || 'the open artist'}’s.`) : null,
    limits(),
    list,
    creating ? createForm(ctx, today) : poll ? pollView(ctx, poll, today) : null,
  );
}
