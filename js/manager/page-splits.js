// The song page's Splits tab: writers, their shares (must add up to 100), signed or not, and a
// printable split sheet to sign. Data is `song.split` (see splits.js).
import { h, button, iconButton, toast } from '../dom.js';
import { exportPDF, docSlug } from './pdf.js';
import { SPLIT_ROLES, SPLIT_NOTE, normalizeSplit, newWriter, splitTotal, splitAddsUp, evenShares, addMembers, splitStatus, splitSheetHTML, cleanShare } from './splits.js';

/** Print options (not saved): emails stay off the sheet unless this is ticked. */
export const splitsUI = { includeEmail: false };

/** The small "Split signed" / "Split missing" chip for song cards and the Overview. */
export function splitChip(song, onclick = null) {
  const st = splitStatus(song);
  const attrs = { class: `mgr-chip g6-split-chip${st.ok ? ' ok' : ' miss'}`, title: st.why, 'data-split': st.ok ? 'signed' : 'missing' };
  return onclick ? h('button', { type: 'button', ...attrs, onclick }, st.label) : h('span', attrs, st.label);
}

export function splitsTab(ctx, song, S) {
  const f = ctx.form;
  const m = ctx.store.get();
  const split = normalizeSplit(song.split);
  const members = (m.band.members || []).filter((x) => x && x.name && x.name.trim());
  const have = new Set(split.writers.map((w) => w.name.trim().toLowerCase()));
  const missingMembers = members.filter((x) => !have.has(x.name.trim().toLowerCase()));
  // every edit goes through the normalised split, so a song made this session (no split yet) works too
  const P = (fn) => S((s, v) => fn((s.split = normalizeSplit(s.split)), v));
  const W = (id, fn) => P((sp, v) => {
    const w = sp.writers.find((x) => x.id === id);
    if (w) fn(w, v);
  });
  const total = splitTotal(split.writers);
  const ok = splitAddsUp(split.writers);
  const st = splitStatus(song);
  const even = () => {
    if (!split.writers.length) return toast('Add the writers first.', 'error');
    const shares = evenShares(split.writers.length);
    ctx.update(P((sp) => sp.writers.forEach((w, i) => (w.share = shares[i]))));
  };
  const print = () => {
    if (!split.writers.length) return toast('Add the writers first.', 'error');
    if (!ok && !confirm(`The shares add up to ${total}%, not 100%. Print it as a draft anyway?`)) return;
    exportPDF(splitSheetHTML(song, m.band, { includeEmail: splitsUI.includeEmail }), `split-sheet-${docSlug(song.title)}`);
  };
  const emailBox = h('input', { type: 'checkbox', checked: splitsUI.includeEmail, 'data-k': 'g6-split-email' });
  emailBox.addEventListener('change', () => (splitsUI.includeEmail = emailBox.checked));

  const rows = split.writers.map((w) =>
    h(
      'tr',
      { 'data-writer': w.id },
      h('td', {}, f.text(`g6w-n-${w.id}`, '', w.name, W(w.id, (x, v) => (x.name = v.trim())), { aria: 'Writer name', placeholder: 'Name' })),
      h('td', {}, f.select(`g6w-r-${w.id}`, '', w.role, SPLIT_ROLES, W(w.id, (x, v) => (x.role = v)), { aria: `Role of ${w.name || 'writer'}` })),
      h('td', { class: 'g6-share' }, h('span', { class: 'g6-sharebox' }, f.text(`g6w-s-${w.id}`, '', String(w.share), W(w.id, (x, v) => (x.share = cleanShare(v))), { type: 'number', aria: `Share of ${w.name || 'writer'} (%)` }), h('span', { class: 'muted small' }, '%'))),
      h('td', {}, f.text(`g6w-p-${w.id}`, '', w.pro, W(w.id, (x, v) => (x.pro = v.trim())), { aria: `PRO of ${w.name || 'writer'}`, placeholder: 'e.g. BMI, PRS, SOCAN' })),
      h('td', {}, f.text(`g6w-e-${w.id}`, '', w.email, W(w.id, (x, v) => (x.email = v.trim())), { type: 'email', aria: `Email of ${w.name || 'writer'}`, placeholder: 'Optional' })),
      h('td', {}, iconButton('trash', `Remove ${w.name || 'this writer'}`, () => ctx.update(P((sp) => (sp.writers = sp.writers.filter((x) => x.id !== w.id)))), 'ghost')),
    ),
  );

  return h(
    'div',
    { class: 'mgr-cols g6-splits' },
    h(
      'section',
      { class: 'mgr-sect' },
      h('div', { class: 'mgr-sect-head' }, h('h2', {}, 'Split sheet'), splitChip(song)),
      h('p', { class: 'muted small' }, 'Who wrote the song and what share of the songwriting each writer gets. Shares must add up to 100%. Fill it in together, print it, and everyone signs.'),
      split.writers.length
        ? h(
            'div',
            { class: 'mgr-table-wrap' },
            h(
              'table',
              { class: 'mgr-table compact g6-writers' },
              h('thead', {}, h('tr', {}, ['Writer', 'Role', 'Share', 'PRO / society', 'Email', ''].map((x) => h('th', {}, x)))),
              h('tbody', {}, rows),
            ),
          )
        : h('p', { class: 'muted small' }, members.length ? `No writers yet. Start from the band’s ${members.length} member${members.length === 1 ? '' : 's'}, or add writers one by one.` : 'No writers yet. Add the band members on the Press kit page to start from them, or add writers one by one.'),
      split.writers.length
        ? h('p', { class: `g6-total${ok ? ' ok' : ' warn-note'}`, 'data-k': 'g6-total', role: 'status' }, ok ? `Total ${total}%: adds up.` : `Total ${total}%. ${total < 100 ? `${Math.round((100 - total) * 100) / 100}% still to give` : `${Math.round((total - 100) * 100) / 100}% too much`}: the shares must add up to 100%.`)
        : null,
      h(
        'div',
        { class: 'row wrap' },
        button('Add a writer', () => ctx.update(P((sp) => sp.writers.push(newWriter()))), { iconName: 'plus', variant: 'sm' }),
        missingMembers.length ? button(`Add band members (${missingMembers.length})`, () => ctx.update(P((sp) => (sp.writers = addMembers(sp, members).writers))), { iconName: 'plus', variant: 'sm' }) : null,
        split.writers.length > 1 ? button('Split evenly', even, { variant: 'sm' }) : null,
      ),
    ),
    h(
      'section',
      { class: 'mgr-sect' },
      h('h2', {}, 'Agreement'),
      f.text('g6-split-date', 'Date agreed', split.date, P((sp, v) => (sp.date = v)), { type: 'date' }),
      h(
        'label',
        { class: 'mgr-inline g6-signed' },
        f.check('g6-split-signed', split.signed, P((sp, v) => ((sp.signed = v), v && !sp.signedDate && (sp.signedDate = ctx.today()))), 'Everyone has signed'),
        h('span', { class: 'small' }, 'Everyone has signed'),
      ),
      split.signed ? f.text('g6-split-sdate', 'Signed on', split.signedDate, P((sp, v) => (sp.signedDate = v)), { type: 'date' }) : null,
      split.signed && !ok ? h('p', { class: 'warn-note small' }, 'Ticked as signed, but the shares no longer add up to 100%. Fix them and sign a new sheet.') : null,
      h('p', { class: 'muted tiny' }, 'You tick this yourself once the signed copies are back. The app does not collect signatures.'),
      f.text('g6-split-master', 'Master and publishing (optional)', split.master, P((sp, v) => (sp.master = v)), { rows: 2, placeholder: 'e.g. Master owned by the band; publishing self-administered' }),
      f.text('g6-split-notes', 'Notes', split.notes, P((sp, v) => (sp.notes = v)), { rows: 3, placeholder: 'Samples, who wrote which part, anything agreed' }),
      h('h3', { class: 'mgr-h3' }, 'Print to sign'),
      h('label', { class: 'mgr-inline' }, emailBox, h('span', { class: 'small' }, 'Include email addresses on the sheet')),
      button('Print split sheet (PDF)', print, { iconName: 'download', variant: 'sm primary', title: 'Pick “Save as PDF” as the printer to get a file' }),
      h('p', { class: 'muted tiny' }, `${SPLIT_NOTE} ${st.ok ? '' : `Status: ${st.why}.`}`),
    ),
  );
}
