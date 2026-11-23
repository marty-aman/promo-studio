// The "Show day" section of the show page: the advance sheet, the gear and load-in list and the
// after-show recap. Logic in showday.js; the printable sheets in docs.js. Everything is typed by you
// and stays in this browser: nothing is fetched, synced or sent by the app.
import { h, button, iconButton, toast } from '../dom.js';
import { exportPDF } from './pdf.js';
import { advanceHTML, gearListHTML } from './docs.js';
import { normalizeStage } from './showplan.js';
import { normalizeAdvance, normalizeGear, normalizeRecap, advanceModel, advanceText, advanceMailto, newGearItem, suggestGear, addSuggestions, gearProgress, needsBackline, newExpense, expenseTotal, venueHistory, lastTimeHere } from './showday.js';

export const showDayUI = { tab: 'advance' };
const TABS = [['advance', 'Advance sheet'], ['gear', 'Gear and load-in'], ['recap', 'After-show recap']];
const usd = (v) => `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(2).replace(/\.00$/, '')}`;

/** Where this show's venue is in the venue list (by id, else by name), or null. */
export const venueOf = (m, show) => (m.venues || []).find((v) => (show.venueId && v.id === show.venueId) || (show.venue && v.name.trim().toLowerCase() === show.venue.trim().toLowerCase())) || null;

/** The "Last time here" block: the venue's own notes and the shows played there before. */
export function venueMemory(m, show, { skipId = '' } = {}) {
  const rows = venueHistory(m.shows, { venueId: show.venueId, venue: show.venue }, { skipId });
  const venue = venueOf(m, show);
  const mine = venue && venue.myNotes ? venue.myNotes : '';
  if (!rows.length && !mine) return null;
  return h(
    'div',
    { class: 'sd-memory', 'data-k': 'sd-memory' },
    rows.length ? h('p', { class: 'sd-last' }, lastTimeHere(rows)) : null,
    mine ? h('p', { class: 'muted small' }, h('strong', {}, 'Venue notes: '), mine.length > 300 ? `${mine.slice(0, 300)}…` : mine) : null,
    rows.length > 1 || (rows[0] && rows[0].promoter)
      ? h('ul', { class: 'sd-past' }, rows.slice(0, 5).map((r) => h('li', {}, h('strong', {}, r.date || 'No date'), ` · ${r.net == null ? 'no money typed' : `net ${usd(r.net)}`}${r.doorCount !== '' ? ` · ${r.doorCount} at the door` : ''}${r.note ? ` · ${r.note}` : ''}${r.promoter ? ` · promoter: ${r.promoter}` : ''}`)))
      : null,
  );
}

/** `S(fn)` is the show page's updater: (s, value, draft) → void, applied to this show. */
export function showDaySection(ctx, show, { S, times, members = [] }) {
  const m = ctx.store.get();
  const f = ctx.form;
  const tab = TABS.some(([k]) => k === showDayUI.tab) ? showDayUI.tab : 'advance';
  const adv = normalizeAdvance(show.advance);
  const gear = normalizeGear(show.gear);
  const recap = normalizeRecap(show.recap);
  // each setter rebuilds its field from what's saved, so a show made before this section existed gets the field on its first edit
  const A = (fn) => S((s, v) => fn((s.advance = normalizeAdvance(s.advance)), v, s));
  const G = (fn) => S((s, v) => fn((s.gear = normalizeGear(s.gear)), v, s));
  const R = (fn) => S((s, v, d) => fn((s.recap = normalizeRecap(s.recap)), v, s, d));
  const idPart = show.id;
  const chk = (k, value, set, text) => h('label', { class: 'sd-chk' }, f.check(k, value, set, ''), h('span', {}, text));
  const names = h('datalist', { id: `sd-members-${idPart}` }, members.map((x) => h('option', { value: x })));

  const body = tab === 'advance' ? advanceTab() : tab === 'gear' ? gearTab() : recapTab();

  function advanceTab() {
    const stage = normalizeStage(m.band.stage);
    const model = advanceModel(show, m.band, { times, stage: m.band.stage });
    const mail = advanceMailto(show, model, m.band);
    const pdf = () => (exportPDF(advanceHTML(model), `${show.venue || 'Show'} advance ${show.date || ''}`.trim()), toast('Pick “Save as PDF” as the printer to get a PDF.'));
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(advanceText(model));
        toast('Advance sheet text copied.');
      } catch {
        toast('Could not copy. Select the text below and copy it.', 'error');
      }
    };
    const sent = adv.sentOn
      ? h('span', { class: 'sd-sent' }, `Marked as sent on ${adv.sentOn}. `, button('Not sent', () => ctx.update(A((a) => (a.sentOn = ''))), { variant: 'sm ghost' }))
      : button('Mark as sent', () => ctx.update(A((a) => (a.sentOn = ctx.today()))), { variant: 'sm', title: 'Stops the “Send advance sheet” reminder' });
    const contactRow = (k, label, type = 'text') => h('div', { class: 'sd-contact' }, f.text(`adv-vc-${k}-${idPart}`, label, adv.venueContact[k], A((a, v) => (a.venueContact[k] = v)), { type }), chk(`adv-sh-${k}-${idPart}`, adv.share[k], A((a, v) => (a.share[k] = v)), 'Put on the sheet'));
    return h(
      'div',
      { class: 'sd-tab' },
      h('p', { class: 'muted small' }, 'One page for the venue and its sound engineer: times, lineup, set length, the stage plot and input list, parking and load-in. The deal, money, notes, fans and your bandmates’ details are never on it.'),
      h('div', { class: 'mgr-two' }, f.text(`adv-sc-${idPart}`, 'Soundcheck', adv.soundcheck, A((a, v) => (a.soundcheck = v)), { type: 'time' }), f.text(`adv-cf-${idPart}`, 'Curfew', adv.curfew, A((a, v) => (a.curfew = v)), { type: 'time' })),
      f.text(`adv-pk-${idPart}`, 'Parking', adv.parking, A((a, v) => (a.parking = v)), { rows: 2, placeholder: 'Where to park the van, permits, loading zone' }),
      f.text(`adv-li-${idPart}`, 'Load-in notes', adv.loadInNotes, A((a, v) => (a.loadInNotes = v)), { rows: 2, placeholder: 'Back door, stairs, who meets you, elevator' }),
      f.text(`adv-ho-${idPart}`, 'Hospitality', adv.hospitality, A((a, v) => (a.hospitality = v)), { rows: 2, placeholder: 'Drinks, food, number of guest list spots' }),
      f.text(`adv-rd-${idPart}`, 'Rider', adv.rider, A((a, v) => (a.rider = v)), { rows: 3, placeholder: 'What you need from the venue: backline, monitors, power' }),
      chk(`adv-sp-${idPart}`, adv.stagePlot, A((a, v) => (a.stagePlot = v)), stage ? 'Include the stage plot and input list from the Stage plot tab' : 'Include the stage plot (make one in Show planner → Stage plot first)'),
      f.text(`adv-nt-${idPart}`, 'Other notes for the sheet', adv.notes, A((a, v) => (a.notes = v)), { rows: 2 }),
      h('h3', { class: 'mgr-h3' }, 'Venue contact'),
      h('p', { class: 'muted tiny' }, 'Typed here for this sheet only. Only the details you tick go on the sheet; the email address is also used as the recipient when you send.'),
      contactRow('name', 'Name'),
      contactRow('phone', 'Phone', 'tel'),
      contactRow('email', 'Email', 'email'),
      h(
        'div',
        { class: 'row sd-actions' },
        h('a', { class: 'btn primary sm', href: mail.href, 'data-k': `adv-mailto-${idPart}`, title: 'Opens your email app with the sheet as text' }, 'Send to venue (email)'),
        button('Export advance sheet PDF', pdf, { iconName: 'print', variant: 'sm' }),
        button('Copy as text', copy, { iconName: 'copy', variant: 'sm' }),
        sent,
      ),
      h('p', { class: 'muted tiny' }, 'Sending opens your own email app with the sheet written out as text. Attachments can’t be added from here, so save the PDF and attach it yourself. Nothing is sent by this app.'),
      h('h3', { class: 'mgr-h3' }, 'What the venue will see'),
      h('pre', { class: 'mgr-pre', 'data-k': 'adv-preview' }, advanceText(model)),
    );
  }

  function gearTab() {
    const pr = gearProgress(gear);
    const suggestions = () => {
      const next = addSuggestions(gear, suggestGear(m.band.stage));
      if (next.length === gear.length) return toast('Everything from the stage plot is already on the list.');
      ctx.update(G((g) => g.splice(0, g.length, ...next)));
    };
    const row = (g) =>
      h(
        'li',
        { class: `sd-gear${g.packed ? ' packed' : ''}${needsBackline(g) ? ' need' : ''}` },
        chk(`gear-pk-${g.id}`, g.packed, G((l, v) => (l.find((x) => x.id === g.id).packed = v)), 'Packed'),
        f.text(`gear-lb-${g.id}`, '', g.label, G((l, v) => (l.find((x) => x.id === g.id).label = v)), { aria: 'Item', placeholder: 'What' }),
        (() => {
          const inp = f.text(`gear-ow-${g.id}`, '', g.owner, G((l, v) => (l.find((x) => x.id === g.id).owner = v)), { aria: `Whose: ${g.label || 'item'}`, placeholder: 'Whose' });
          inp.setAttribute('list', `sd-members-${idPart}`);
          return inp;
        })(),
        chk(`gear-bl-${g.id}`, g.backline, G((l, v) => (l.find((x) => x.id === g.id).backline = v)), 'Needs backline'),
        chk(`gear-bo-${g.id}`, g.borrowed, G((l, v) => (l.find((x) => x.id === g.id).borrowed = v)), 'Borrowed / arranged'),
        iconButton('trash', `Remove ${g.label || 'item'}`, () => ctx.update(G((l, _v, s) => (s.gear = l.filter((x) => x.id !== g.id)))), 'ghost'),
        needsBackline(g) ? h('span', { class: 'mgr-chip sd-flag' }, 'Needs backline') : null,
      );
    return h(
      'div',
      { class: 'sd-tab' },
      h('p', { class: 'muted small' }, 'What goes in the van, who brings it and what you still need from the venue. Tick “Needs backline” for gear you will not bring; it is flagged until you tick “Borrowed / arranged”, and it goes on the advance sheet.'),
      names,
      h('div', { class: 'sd-progress', role: 'status' }, h('strong', {}, pr.total ? `Packed ${pr.packed} of ${pr.total}` : 'Nothing on the list yet'), pr.needs ? h('span', { class: 'mgr-chip sd-flag' }, `${pr.needs} still need${pr.needs === 1 ? 's' : ''} backline`) : null, h('div', { class: 'sd-bar', 'aria-hidden': 'true' }, h('span', { style: { width: `${pr.total ? Math.round((pr.packed / pr.total) * 100) : 0}%` } }))),
      gear.length ? h('ul', { class: 'sd-gearlist' }, gear.map(row)) : h('p', { class: 'muted small' }, normalizeStage(m.band.stage) ? 'Start from the gear on your stage plot, or add items yourself.' : 'Add items yourself, or make a stage plot in Show planner → Stage plot and start from that.'),
      h(
        'div',
        { class: 'row sd-actions' },
        button('Suggest from the stage plot', suggestions, { iconName: 'grid', variant: 'sm' }),
        button('Add an item', () => ctx.update(G((l) => l.push(newGearItem('')))), { iconName: 'plus', variant: 'sm ghost' }),
        gear.length ? button('Print the list', () => (exportPDF(gearListHTML(show, m.band, gear), `${show.venue || 'Show'} gear ${show.date || ''}`.trim()), toast('Pick “Save as PDF” as the printer, or print it for the van.')), { iconName: 'print', variant: 'sm' }) : null,
        gear.some((g) => g.packed) ? button('Untick everything', () => ctx.update(G((l) => l.forEach((x) => (x.packed = false)))), { variant: 'sm ghost', title: 'Start a fresh pack-up for the next show' }) : null,
      ),
    );
  }

  function recapTab() {
    const total = expenseTotal(recap);
    const venue = venueOf(m, show);
    const line = `${show.date || ''}: ${recap.venueNote}`;
    const inNotes = !!(venue && recap.venueNote && (venue.myNotes || '').includes(line));
    return h(
      'div',
      { class: 'sd-tab' },
      h('p', { class: 'muted small' }, 'Fill this in the day after. It is typed by you: nothing is fetched or counted from anywhere else. The venue note shows up the next time you plan a show at this venue.'),
      f.text(`rc-door-${idPart}`, 'People through the door', recap.doorCount, R((r, v) => (r.doorCount = v)), { type: 'number', placeholder: 'head count' }),
      h('h3', { class: 'mgr-h3' }, 'Expenses'),
      recap.expenses.length
        ? h(
            'ul',
            { class: 'sd-exps' },
            recap.expenses.map((e) =>
              h(
                'li',
                {},
                f.text(`rc-el-${e.id}`, '', e.label, R((r, v) => (r.expenses.find((x) => x.id === e.id).label = v)), { aria: 'Expense', placeholder: 'Gas, food, parking…' }),
                f.text(`rc-ea-${e.id}`, '', e.amount, R((r, v) => (r.expenses.find((x) => x.id === e.id).amount = v)), { type: 'number', aria: `Amount: ${e.label || 'expense'}`, placeholder: '$' }),
                iconButton('trash', `Remove ${e.label || 'expense'}`, () => ctx.update(R((r) => (r.expenses = r.expenses.filter((x) => x.id !== e.id)))), 'ghost'),
              ),
            ),
          )
        : h('p', { class: 'muted small' }, 'No expense lines. Add one per cost: gas, food, parking, a hired amp.'),
      h('div', { class: 'row' }, button('Add an expense', () => ctx.update(R((r) => r.expenses.push(newExpense()))), { iconName: 'plus', variant: 'sm ghost' }), total ? h('strong', { class: 'sd-total', 'data-k': 'rc-total' }, `Expenses total ${usd(total)}`) : null),
      f.text(`rc-nt-${idPart}`, 'How it went', recap.notes, R((r, v) => (r.notes = v)), { rows: 3, placeholder: 'Crowd, sound, the set, what to remember' }),
      f.text(`rc-ww-${idPart}`, 'What worked', recap.whatWorked, R((r, v) => (r.whatWorked = v)), { rows: 2, placeholder: 'Promo, merch display, the closer…' }),
      f.text(`rc-pn-${idPart}`, 'Note on the promoter', recap.promoterNote, R((r, v) => (r.promoterNote = v)), { rows: 2, placeholder: 'Paid on time? Would play for them again? Who to thank?' }),
      f.text(`rc-vn-${idPart}`, 'Venue note for next time', recap.venueNote, R((r, v) => (r.venueNote = v)), { rows: 2, placeholder: 'Load-in at the back, the sound person is great, ask for the 8 pm slot' }),
      venue && recap.venueNote
        ? inNotes
          ? h('p', { class: 'muted tiny' }, `Saved in ${venue.name}’s notes (Show planner → Venues → Our notes).`)
          : button(`Add to ${venue.name}’s notes`, () => ctx.update((d) => {
              const v = d.venues.find((x) => x.id === venue.id);
              if (v && !(v.myNotes || '').includes(line)) v.myNotes = `${v.myNotes ? `${v.myNotes.trimEnd()}\n` : ''}${line}`;
            }), { variant: 'sm', title: 'Appends a dated line to the venue’s “Our notes” in the Show planner' })
        : venue ? null : h('p', { class: 'muted tiny' }, 'This show’s venue isn’t in your venue list, so the note stays on this show only.'),
    );
  }

  return h(
    'section',
    { class: 'mgr-sect sd-wrap', 'data-k': 'show-day' },
    h('h2', {}, 'Show day'),
    venueMemory(m, show, { skipId: show.id }),
    h('div', { class: 'mgr-tabs', role: 'tablist' }, TABS.map(([k, l]) => h('button', { type: 'button', role: 'tab', 'aria-selected': k === tab ? 'true' : 'false', class: `mgr-tab${k === tab ? ' on' : ''}`, 'data-k': `sd-tab-${k}`, onclick: () => ((showDayUI.tab = k), ctx.refresh()) }, l))),
    h('div', { role: 'tabpanel' }, body),
  );
}
