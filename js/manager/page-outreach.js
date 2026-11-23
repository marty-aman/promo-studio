// The Outreach tab on the Content page: blogs, curators, radio, podcasts and press you pitch, plus
// a read-only list of your songs' playlist pitches (those are edited on each song's Pitch tab).
import { h, icon, button, iconButton, toast } from '../dom.js';
import { niceDate } from './model.js';
import { PITCH_STATUSES } from './press.js';
import { OUTREACH_TYPES, OUTREACH_STATUSES, newOutreach, normalizeOutreach, markSent, setOutreachStatus, filterOutreach, outreachStats, outreachFollowUpDue, outreachEmail, outreachMailto, songPitches, validEmail } from './outreach.js';

export const outreachUI = { type: '', status: '', open: null, sel: [], song: '', undo: null, lastArrival: null };
const label = (list, k) => (list.find(([x]) => x === k) || [k, k])[1];

export function buildOutreach(ctx) {
  const m = ctx.store.get();
  const f = ctx.form;
  const ui = outreachUI;
  const re = () => ctx.refresh();
  const today = ctx.today();
  const all = normalizeOutreach(m.outreach);
  ui.sel = ui.sel.filter((id) => all.some((o) => o.id === id));
  if (ui.undo && ui.undo.artist !== m.artistId) ui.undo = null; // another artist is open
  if (ui.song && !m.songs.some((s) => s.id === ui.song)) ui.song = '';
  // the item named in the address (from a calendar or Home link) opens on arrival
  if (ctx.view.id && ctx.view.id !== ui.lastArrival && all.some((o) => o.id === ctx.view.id)) (ui.open = ctx.view.id), (ui.lastArrival = ctx.view.id);
  const O = (id, fn) => (d, v) => {
    const o = (d.outreach || []).find((x) => x.id === id);
    if (o) fn(o, v);
  };
  const songOf = (id) => m.songs.find((s) => s.id === id) || null;
  const pitchSong = (o) => songOf(o.songId) || songOf(ui.song);
  const later = (fn) => setTimeout(fn, 0); // let a mailto link open before the page is redrawn

  const add = () => {
    const o = newOutreach({ name: 'New outreach', songId: ui.song, type: ui.type || 'blog' });
    ctx.update((d) => (d.outreach ||= []).push(o));
    ui.open = o.id;
    re();
  };
  // Undo puts the item back where it was, even after other edits (Ctrl+Z also works, step by step)
  const remove = (o) => {
    const raw = (m.outreach || []).find((x) => x.id === o.id);
    ui.undo = { item: JSON.parse(JSON.stringify(raw)), index: (m.outreach || []).indexOf(raw), name: o.name || 'outreach', artist: m.artistId };
    ctx.update((d) => (d.outreach = (d.outreach || []).filter((x) => x.id !== o.id)));
    if (ui.open === o.id) ui.open = null;
    re();
  };
  const sent = (o) => {
    ctx.update(O(o.id, (x) => markSent(x, today)));
    toast(`Marked sent. Follow-up set for ${niceDate(markSent({ ...o }, today).followUp)}; change it under Edit.`);
  };
  const mailOne = (o) => {
    const href = outreachMailto(outreachEmail(o, m, { song: pitchSong(o), today }));
    return h('a', { class: 'btn sm', href, 'data-k': `out-mail-${o.id}`, title: o.email && !validEmail(o.email) ? 'That email doesn’t look valid; the To field is left blank' : 'Opens your mail app with the text filled in', onclick: () => o.status === 'idea' && later(() => ctx.update(O(o.id, (x) => setOutreachStatus(x, 'drafted', today)))) }, icon('share', 16), h('span', {}, 'Draft email'));
  };

  // ---- filters, stats and the BCC email for several
  const shown = filterOutreach(all, ui).sort((a, b) => (a.followUp || a.sent || '9').localeCompare(b.followUp || b.sent || '9') || a.name.localeCompare(b.name));
  const st = outreachStats(all);
  const typeSel = h('select', { 'aria-label': 'Type', 'data-k': 'out-ftype' }, h('option', { value: '' }, 'Every type'), OUTREACH_TYPES.map(([k, l]) => h('option', { value: k, selected: ui.type === k }, l)));
  typeSel.addEventListener('change', () => ((ui.type = typeSel.value), re()));
  const statSel = h('select', { 'aria-label': 'Status', 'data-k': 'out-fstatus' }, h('option', { value: '' }, 'Any status'), OUTREACH_STATUSES.map(([k, l]) => h('option', { value: k, selected: ui.status === k }, l)));
  statSel.addEventListener('change', () => ((ui.status = statSel.value), re()));
  const songSel = h('select', { 'aria-label': 'Song to pitch', 'data-k': 'out-song' }, h('option', { value: '' }, 'No song (introduce the band)'), m.songs.map((s) => h('option', { value: s.id, selected: ui.song === s.id }, `Pitch “${s.title}”`)));
  songSel.addEventListener('change', () => ((ui.song = songSel.value), re()));
  const picked = all.filter((o) => ui.sel.includes(o.id));
  const withEmail = picked.filter((o) => validEmail(o.email));
  const bulk = withEmail.length >= 2
    ? h('a', { class: 'btn sm', 'data-k': 'out-bcc', href: outreachMailto(outreachEmail(withEmail, m, { song: songOf(ui.song), today })), title: 'Everyone goes in BCC, so nobody sees the other addresses' }, icon('share', 16), h('span', {}, `Draft one email to ${withEmail.length} (BCC)`))
    : h('span', { class: 'muted tiny' }, picked.length ? 'Tick two or more with an email to write to them at once (BCC).' : 'Tick items to write to several at once (BCC).');

  const card = (o) => {
    const song = songOf(o.songId);
    const due = outreachFollowUpDue(o);
    const late = due && o.followUp < today;
    const on = ui.sel.includes(o.id);
    const tick = h('input', { type: 'checkbox', checked: on, 'aria-label': `Select ${o.name || 'outreach'}`, 'data-k': `out-sel-${o.id}` });
    tick.addEventListener('change', () => ((ui.sel = tick.checked ? [...ui.sel, o.id] : ui.sel.filter((x) => x !== o.id)), re()));
    const open = ui.open === o.id;
    return h(
      'li',
      { class: `out-card${open ? ' open' : ''}${late ? ' late' : ''}`, 'data-id': o.id },
      h(
        'div',
        { class: 'out-top' },
        tick,
        h('div', { class: 'out-name' }, h('strong', {}, o.name || 'Untitled'), h('span', { class: 'out-type' }, label(OUTREACH_TYPES, o.type)), o.url ? h('a', { href: o.url, target: '_blank', rel: 'noopener noreferrer', class: 'muted tiny' }, o.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)) : null),
        f.select(`out-st-${o.id}`, '', o.status, OUTREACH_STATUSES, O(o.id, (x, v) => setOutreachStatus(x, v, today)), { aria: `Status: ${o.name || 'outreach'}` }),
      ),
      h(
        'p',
        { class: 'out-meta muted small' },
        [song ? `“${song.title}”` : o.songId ? 'Song deleted' : '', o.contact, o.sent ? `Sent ${niceDate(o.sent, { weekday: false })}` : '', due ? `${late ? 'Follow-up was due' : 'Follow up'} ${niceDate(o.followUp, { weekday: false })}` : ''].filter(Boolean).join(' · ') || 'Not sent yet',
      ),
      h(
        'div',
        { class: 'row out-actions' },
        mailOne(o),
        o.status !== 'idea' && o.status !== 'drafted' ? null : button('Mark sent', () => sent(o), { iconName: 'check', variant: 'sm', title: `Sent today; follow up in 7 days` }),
        due ? button('Followed up', () => ctx.update(O(o.id, (x) => ((x.followedUp = true), (x.log = [...(x.log || []), { date: today, text: 'Followed up' }])))), { iconName: 'check', variant: 'sm' }) : null,
        button(open ? 'Close' : 'Edit', () => ((ui.open = open ? null : o.id), re()), { variant: 'sm ghost' }),
        iconButton('trash', `Delete ${o.name || 'outreach'}`, () => remove(o), 'ghost'),
      ),
      open
        ? h(
            'div',
            { class: 'out-edit' },
            h('div', { class: 'mgr-two' }, f.text(`out-name-${o.id}`, 'Name (blog, show, station…)', o.name, O(o.id, (x, v) => (x.name = v.trim()))), f.select(`out-type-${o.id}`, 'Type', o.type, OUTREACH_TYPES, O(o.id, (x, v) => (x.type = v)))),
            h('div', { class: 'mgr-two' }, f.text(`out-contact-${o.id}`, 'Contact person', o.contact, O(o.id, (x, v) => (x.contact = v.trim()))), f.text(`out-email-${o.id}`, 'Email', o.email, O(o.id, (x, v) => (x.email = v.trim())), { type: 'email', hint: o.email && !validEmail(o.email) ? 'That doesn’t look like an email address.' : '' })),
            h('div', { class: 'mgr-two' }, f.text(`out-url-${o.id}`, 'Website or submission form', o.url, O(o.id, (x, v) => (x.url = v.trim())), { type: 'url', placeholder: 'https://…' }), f.select(`out-songid-${o.id}`, 'Song', o.songId, [['', 'No song'], ...m.songs.map((s) => [s.id, s.title])], O(o.id, (x, v) => (x.songId = v)))),
            h('div', { class: 'mgr-two' }, f.text(`out-sent-${o.id}`, 'Sent on', o.sent, O(o.id, (x, v) => (x.sent = v)), { type: 'date' }), f.text(`out-fu-${o.id}`, 'Follow up on', o.followUp, O(o.id, (x, v) => ((x.followUp = v), (x.followedUp = false))), { type: 'date' })),
            f.text(`out-notes-${o.id}`, 'Notes', o.notes, O(o.id, (x, v) => (x.notes = v)), { rows: 3, placeholder: 'What they cover, how they like to be pitched, what they said…' }),
            o.log.length ? h('ul', { class: 'out-log muted tiny' }, o.log.slice().reverse().map((l) => h('li', {}, `${niceDate(l.date, { weekday: false })}: ${l.text}`))) : null,
          )
        : null,
    );
  };

  // ---- the songs' own playlist pitches, read only
  const pitches = songPitches(m);
  const pitchList = pitches.length
    ? h(
        'ul',
        { class: 'out-pitches' },
        pitches.map(({ song, pitch: p }) =>
          h(
            'li',
            {},
            h('span', {}, h('strong', {}, p.playlist || p.curator || 'Pitch'), ` · ${p.service || ''}`),
            h('span', { class: 'muted small' }, [`“${song.title}”`, label(PITCH_STATUSES, p.status), p.sent && `sent ${niceDate(p.sent, { weekday: false })}`].filter(Boolean).join(' · ')),
            button('Open on the song', () => ctx.go('songs', song.id, 'pitch'), { variant: 'sm ghost' }),
          ),
        ),
      )
    : h('p', { class: 'muted small' }, 'No playlist pitches on your songs yet. Add them on a song’s Pitch tab.');

  return h(
    'div',
    { class: 'out-tab' },
    h('p', { class: 'out-note', role: 'note' }, icon('activity', 14), h('span', {}, 'Promo Studio sends nothing itself. “Draft email” opens your own mail app with the text filled in, and you press Send there. It can’t see your inbox, so mark replies here yourself. Contacts stay in this browser and in your backups, and never go into the press kit.')),
    h(
      'div',
      { class: 'out-stats', 'data-k': 'out-stats', title: 'Sent counts everything that went out; replied includes placed.' },
      h('div', {}, h('b', {}, String(st.sent)), h('span', {}, 'sent')),
      h('div', {}, h('b', {}, String(st.replied)), h('span', {}, 'replied')),
      h('div', {}, h('b', {}, String(st.placed)), h('span', {}, 'placed')),
      h('div', {}, h('b', {}, String(st.total)), h('span', {}, 'on the list')),
    ),
    ui.undo
      ? h(
          'div',
          { class: 'out-undo', role: 'status' },
          h('span', {}, `Deleted “${ui.undo.name}”.`),
          button('Undo', () => {
            const { item, index } = ui.undo;
            ui.undo = null;
            ctx.update((d) => {
              d.outreach ||= [];
              if (!d.outreach.some((x) => x.id === item.id)) d.outreach.splice(Math.max(0, Math.min(index, d.outreach.length)), 0, item);
            });
          }, { iconName: 'undo', variant: 'sm primary' }),
          button('Dismiss', () => ((ui.undo = null), re()), { variant: 'sm ghost' }),
        )
      : null,
    h(
      'section',
      { class: 'mgr-sect' },
      h('h2', {}, `Outreach · ${shown.length}${shown.length !== all.length ? ` of ${all.length}` : ''}`),
      h('div', { class: 'mgr-filters' }, typeSel, statSel, songSel, button('Add outreach', add, { iconName: 'plus', variant: 'sm primary' })),
      h('div', { class: 'row out-bulk' }, bulk),
      shown.length
        ? h('ul', { class: 'out-list' }, shown.map(card))
        : h('div', { class: 'mgr-empty' }, h('p', {}, all.length ? 'Nothing matches these filters.' : 'Blogs, radio shows, podcasts, press and playlist curators you want to reach. Song-by-song playlist pitches stay on each song and are listed below.'), all.length ? null : button('Add outreach', add, { iconName: 'plus', variant: 'sm primary' })),
    ),
    h('section', { class: 'mgr-sect' }, h('h2', {}, `Song playlist pitches · ${pitches.length}`), h('p', { class: 'muted tiny' }, 'Read only here. They live on each song, with their own follow-ups.'), pitchList),
  );
}
