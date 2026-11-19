// Song tabs for getting a song heard: the press release, suggested playlists, and the playlist
// pitch helper with a tracker of who you pitched.
import { h, button, iconButton, toast, download } from '../dom.js';
import { mid, niceDate, addDays } from './model.js';
import { MOODS, ENERGIES, VOCALS, lyricThemes, soundOf, suggestPlaylists, playlistTypes, playlistSearchURL, PLAYLISTS } from './playlists.js';
import { pressRelease, pressHTML, wordCount, spotifyPitch, spotifyFormHints, pitchDeadline, curatorPitch, SPOTIFY_PITCH_MAX, PITCH_STATUSES, PITCH_SERVICES, newPitch } from './press.js';

export const pitchUI = { curator: '', playlist: '', contact: '' };

const copy = async (text, what = 'Copied') => {
  try {
    await navigator.clipboard.writeText(text);
    toast(what);
  } catch {
    toast('Could not copy. Select the text and copy it.', 'error');
  }
};
const slug = (s) => String(s || 'song').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'song';
const looksEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());

/** A draft in an editable box with copy, download and reset. Edits are kept until reset. */
function draftBox(ctx, song, S, key, label, text, drafts, { rows = 10, filename = '' } = {}) {
  const edited = song.press?.edits?.[key] != null;
  const set = S((s, v) => {
    s.press.edits ||= {};
    if (v.trim() === drafts[key].trim()) delete s.press.edits[key];
    else s.press.edits[key] = v;
  });
  return h(
    'section',
    { class: 'mgr-sect' },
    h('div', { class: 'mgr-sect-head' }, h('h2', {}, label), h('span', { class: 'muted tiny' }, `${wordCount(text)} words`)),
    ctx.form.text(`press-${key}-${song.id}`, '', text, set, { rows }),
    edited ? h('p', { class: 'muted tiny' }, 'You edited this draft, so changes to the fields above no longer update it.') : null,
    h(
      'div',
      { class: 'row' },
      button('Copy', () => copy(text, `${label} copied`), { iconName: 'copy', variant: 'sm primary' }),
      filename ? button('Download .txt', () => download(new Blob([text], { type: 'text/plain' }), `${filename}.txt`), { iconName: 'download', variant: 'sm' }) : null,
      filename ? button('Print / save as PDF', () => printPage(text, filename), { iconName: 'print', variant: 'sm' }) : null,
      edited ? button('Back to the draft', () => ctx.update(S((s) => delete s.press.edits[key])), { variant: 'sm ghost' }) : null,
    ),
  );
}

function printPage(text, title) {
  const w = window.open('', '_blank');
  if (!w) return toast('Allow pop-ups to print.', 'error');
  w.document.write(pressHTML(text, { title }));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}

export function pressTab(ctx, song, S) {
  const f = ctx.form;
  const m = ctx.store.get();
  const r = pressRelease(song, m, { today: ctx.today() });
  const P = (k) => S((s, v) => (s.press[k] = v));
  const p = song.press;
  const missing = [!m.band.bio && 'a band bio', !(m.band.contactEmail || m.band.contactName) && 'a press contact', !song.releaseDate && 'a release date', !Object.values(song.links).some(Boolean) && 'a listen link'].filter(Boolean);
  return h(
    'div',
    { class: 'mgr-cols' },
    h(
      'div',
      {},
      h(
        'section',
        { class: 'mgr-sect' },
        h('h2', {}, 'Press release details'),
        h('p', { class: 'muted small' }, 'The draft fills itself from the song, the band profile, confirmed shows and the sound tags. Add what only you know.'),
        f.text(`press-head-${song.id}`, 'Headline (optional)', p.headline, P('headline'), { placeholder: r.headline }),
        f.text(`press-story-${song.id}`, 'The story behind the song', p.story, P('story'), { rows: 4, placeholder: song.notes ? 'Blank uses the first paragraph of the song notes.' : 'Why you wrote it, what happened, what it means. One or two sentences.' }),
        f.text(`press-quote-${song.id}`, 'A quote from the band', p.quote, P('quote'), { rows: 3, placeholder: 'In your own words, first person.' }),
        h('div', { class: 'mgr-two' }, f.text(`press-by-${song.id}`, 'Quote by', p.quoteBy, P('quoteBy'), { placeholder: m.band.name || 'Name, role' }), f.text(`press-label-${song.id}`, 'Label or distributor', p.label, P('label'), { placeholder: 'Leave blank if independent' })),
        f.text(`press-credits-${song.id}`, 'Credits', p.credits, P('credits'), { rows: 3, placeholder: 'Produced by…, mixed by…, mastered by…, artwork by…' }),
      ),
      missing.length ? h('p', { class: 'warn-list' }, `Adding ${missing.join(', ')} makes the release stronger. They come from the press kit and the Overview tab.`) : null,
    ),
    h(
      'div',
      {},
      draftBox(ctx, song, S, 'full', 'Press release', r.full, r.drafts, { rows: 22, filename: `${slug(m.band.name)}-${slug(song.title)}-press-release` }),
      draftBox(ctx, song, S, 'short', 'Short version for blogs', r.short, r.drafts, { rows: 6 }),
      draftBox(ctx, song, S, 'blurb', 'Radio and DJ blurb', r.blurb, r.drafts, { rows: 4 }),
    ),
  );
}

export function playlistsTab(ctx, song, S) {
  const f = ctx.form;
  const m = ctx.store.get();
  const snd = soundOf(song, m.band);
  const themes = lyricThemes(song.lyrics, song.title);
  const sug = suggestPlaylists(song, m);
  const types = playlistTypes(song, m);
  const Snd = (fn) => S((s, v) => fn(s.sound, v));
  const toggleMood = (k) => ctx.update(S((s) => {
    const cur = s.sound.moods || [];
    s.sound.moods = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k].slice(-4);
  }));
  const pitchTo = (pl) => {
    ctx.update(S((s) => s.pitches.push({ ...newPitch({ id: mid('pitch'), playlist: pl.name, service: pl.service, curator: pl.curator || '', contact: pl.contact || '' }) })));
    toast(`Added “${pl.name}” to your pitches`);
    ctx.setTab('pitch');
  };
  const hide = (pl) => ctx.update((d) => {
    if (pl.builtin) d.playlistsOff = [...new Set([...(d.playlistsOff || []), pl.id])];
  });
  const own = m.playlists || [];
  const O = (id, fn) => (d, v) => {
    const x = d.playlists.find((y) => y.id === id);
    if (x) fn(x, v);
  };
  const off = (m.playlistsOff || []).filter((id) => PLAYLISTS.some((p) => p.id === id));
  return h(
    'div',
    { class: 'mgr-cols' },
    h(
      'div',
      {},
      h(
        'section',
        { class: 'mgr-sect' },
        h('h2', {}, 'The sound'),
        h('p', { class: 'muted small' }, 'Tag how the song sounds. Matches are scored on genre first, then mood, lyric themes and energy.'),
        h('div', { class: 'mgr-two' }, f.text(`snd-genres-${song.id}`, 'Genres', song.sound.genres, Snd((x, v) => (x.genres = v)), { placeholder: m.band.genres || 'alt-metal, emocore' }), f.text(`snd-similar-${song.id}`, 'For fans of', song.sound.similar, Snd((x, v) => (x.similar = v)), { placeholder: m.band.similar || 'Bad Omens, Deftones' })),
        h('span', { class: 'mf-l' }, 'Mood (pick up to 4)'),
        h('div', { class: 'chips', role: 'group', 'aria-label': 'Mood' }, MOODS.map(([k, l]) => button(l, () => toggleMood(k), { variant: `chip${(song.sound.moods || []).includes(k) ? ' on' : ''}` }))),
        h('div', { class: 'mgr-two' }, f.select(`snd-energy-${song.id}`, `Energy${song.sound.energy ? '' : snd.energy ? ` (from BPM: ${snd.energy})` : ''}`, song.sound.energy, ENERGIES, Snd((x, v) => (x.energy = v))), f.select(`snd-vocals-${song.id}`, 'Vocals', song.sound.vocals, VOCALS, Snd((x, v) => (x.vocals = v)))),
        h('h3', { class: 'mgr-h3' }, 'What the lyrics are about'),
        themes.length
          ? h('ul', { class: 'mgr-facts' }, themes.map((t) => h('li', {}, h('span', {}, t.label), h('span', { class: 'muted tiny' }, `from “${t.words.slice(0, 4).join('”, “')}”`))))
          : h('p', { class: 'muted small' }, song.lyrics.trim() ? 'No clear theme found. Matches use the sound tags alone.' : 'Add lyrics on the Lyrics tab to match on what the song is about.'),
      ),
      h(
        'section',
        { class: 'mgr-sect' },
        h('h2', {}, 'Playlist types to search for'),
        h('p', { class: 'muted small' }, 'Curators name lists after moods, scenes and moments. These searches open Spotify.'),
        h('ul', { class: 'mgr-facts' }, types.map((t) => h('li', {}, h('a', { class: 'link', href: t.url, target: '_blank', rel: 'noopener noreferrer' }, t.title), h('span', { class: 'muted tiny' }, `search: ${t.search}`)))),
      ),
    ),
    h(
      'div',
      {},
      h(
        'section',
        { class: 'mgr-sect' },
        h('h2', {}, `Suggested playlists · ${sug.length}`),
        h('p', { class: 'muted small' }, 'Editorial playlists are chosen by the service’s editors; you reach them through a Spotify for Artists pitch or the equivalent. Names change, so check each one exists before you pitch.'),
        !snd.families.length ? h('p', { class: 'warn-list' }, 'Add a genre to get suggestions. The band’s genres are used when the song has none.') : null,
        h(
          'ul',
          { class: 'mgr-plays' },
          sug.map((pl) =>
            h(
              'li',
              { class: 'mgr-play' },
              h('div', {}, h('strong', {}, pl.name), h('span', { class: 'mgr-chip' }, pl.service), pl.builtin ? null : h('span', { class: 'mgr-chip' }, 'yours')),
              h('p', { class: 'muted small' }, `${pl.why.join(' · ')}${pl.note ? `. ${pl.note}` : ''}`),
              h('div', { class: 'row' }, h('a', { class: 'btn sm', href: playlistSearchURL(pl), target: '_blank', rel: 'noopener noreferrer' }, 'Find it'), button('Add to pitches', () => pitchTo(pl), { iconName: 'plus', variant: 'sm' }), pl.builtin ? iconButton('eyeOff', `Hide ${pl.name}`, () => hide(pl), 'ghost') : null),
            ),
          ),
        ),
        off.length ? h('p', { class: 'muted tiny' }, `${off.length} hidden. `, h('button', { type: 'button', class: 'link', onclick: () => ctx.update((d) => (d.playlistsOff = [])) }, 'Show them again')) : null,
      ),
      h(
        'section',
        { class: 'mgr-sect' },
        h('h2', {}, `Your playlists and curators · ${own.length}`),
        h('p', { class: 'muted small' }, 'Independent playlists you found. They are matched on their genres and shared by every artist.'),
        own.length
          ? h(
              'table',
              { class: 'mgr-table' },
              h('thead', {}, h('tr', {}, ['Playlist', 'Where', 'Curator', 'Contact', 'Genres', 'Link', ''].map((c) => h('th', {}, c)))),
              h(
                'tbody',
                {},
                own.map((p) =>
                  h(
                    'tr',
                    {},
                    h('td', {}, f.text(`pl-n-${p.id}`, '', p.name, O(p.id, (x, v) => (x.name = v)))),
                    h('td', {}, f.select(`pl-s-${p.id}`, '', p.service, PITCH_SERVICES.map((x) => [x, x]), O(p.id, (x, v) => (x.service = v)))),
                    h('td', {}, f.text(`pl-c-${p.id}`, '', p.curator, O(p.id, (x, v) => (x.curator = v)))),
                    h('td', {}, f.text(`pl-e-${p.id}`, '', p.contact, O(p.id, (x, v) => (x.contact = v.trim())))),
                    h('td', {}, f.text(`pl-g-${p.id}`, '', p.genres, O(p.id, (x, v) => (x.genres = v)), { placeholder: 'metalcore, emo' })),
                    h('td', {}, f.text(`pl-u-${p.id}`, '', p.url, O(p.id, (x, v) => (x.url = v.trim())), { type: 'url' })),
                    h('td', {}, iconButton('trash', `Delete ${p.name || 'playlist'}`, () => ctx.update((d) => (d.playlists = d.playlists.filter((x) => x.id !== p.id))), 'ghost')),
                  ),
                ),
              ),
            )
          : h('p', { class: 'muted small' }, 'None yet.'),
        button('Add a playlist', () => ctx.update((d) => d.playlists.push({ id: mid('pl'), name: 'New playlist', service: 'Spotify', curator: '', contact: '', genres: m.band.genres || '', url: '', notes: '' })), { iconName: 'plus', variant: 'sm' }),
      ),
    ),
  );
}

export function pitchTab(ctx, song, S) {
  const f = ctx.form;
  const m = ctx.store.get();
  const today = ctx.today();
  const sp = song.press.edits?.spotify ?? spotifyPitch(song, m, { today });
  const hints = spotifyFormHints(song, m);
  const dl = pitchDeadline(song, today);
  const cp = curatorPitch(song, m, { ...pitchUI, today });
  const cpText = `Subject: ${cp.subject}\n\n${cp.body}`;
  const curBox = h('textarea', { rows: 12, 'data-k': `cur-pitch-${song.id}`, 'aria-label': 'Message to the curator' });
  curBox.value = cpText; // not saved: it is redrafted from the fields above
  const pitches = [...(song.pitches || [])];
  const ui = (k) => (e) => {
    pitchUI[k] = e.target.value;
    ctx.setTab('pitch');
  };
  const Pt = (id, fn) => S((s, v) => {
    const x = s.pitches.find((y) => y.id === id);
    if (x) fn(x, v);
  });
  const add = (fields = {}) => ctx.update(S((s) => s.pitches.unshift(newPitch({ id: mid('pitch'), ...fields }))));
  const logIt = () => {
    add({ curator: pitchUI.curator, playlist: pitchUI.playlist, contact: pitchUI.contact, status: 'sent', sent: today, followUp: addDays(today, 7) });
    toast('Logged as sent, follow-up in 7 days');
  };
  const mail = looksEmail(pitchUI.contact) ? `mailto:${pitchUI.contact.trim()}?subject=${encodeURIComponent(cp.subject)}&body=${encodeURIComponent(cp.body)}` : '';
  const stats = { sent: pitches.filter((p) => p.status !== 'todo').length, added: pitches.filter((p) => p.status === 'added').length, replied: pitches.filter((p) => p.status === 'replied').length };
  const input = (label, k, ph) => h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, label), h('input', { type: 'text', value: pitchUI[k], placeholder: ph, 'data-k': `pitch-ui-${k}`, onchange: ui(k) }));
  const spField = f.text(`sp-pitch-${song.id}`, 'Song description', sp, S((s, v) => ((s.press.edits ||= {}).spotify = v)), { rows: 7 });
  const counter = h('p', { class: sp.length > SPOTIFY_PITCH_MAX ? 'warn-list' : 'muted tiny', 'aria-live': 'polite' }, `${sp.length} / ${SPOTIFY_PITCH_MAX} characters`);
  spField.querySelector('textarea').addEventListener('input', (e) => {
    const n = e.target.value.length;
    counter.textContent = `${n} / ${SPOTIFY_PITCH_MAX} characters${n > SPOTIFY_PITCH_MAX ? `, ${n - SPOTIFY_PITCH_MAX} over` : ''}`;
    counter.className = n > SPOTIFY_PITCH_MAX ? 'warn-list' : 'muted tiny';
  });
  const cols = h(
    'div',
    { class: 'mgr-cols' },
    h(
      'div',
      {},
      h(
        'section',
        { class: 'mgr-sect' },
        h('h2', {}, 'Spotify for Artists pitch'),
        dl ? h('p', { class: dl.left < 0 ? 'warn-list' : 'muted small' }, dl.left < 0 ? `The song comes out ${niceDate(song.releaseDate, { weekday: false })}. Pitching has to happen at least 7 days before release, so this one is closed for editorial.` : `Pitch by ${niceDate(dl.last, { weekday: false })} (${dl.left} day${dl.left === 1 ? '' : 's'} left). Editors can only consider an unreleased song, and earlier is better.`) : h('p', { class: 'warn-list' }, 'Set a release date on the Overview tab to see your pitch deadline.'),
        h('p', { class: 'muted small' }, 'In Spotify for Artists, open Upcoming → pick the release → Pitch a song. You can pitch one song per release.'),
        spField,
        counter,
        h('div', { class: 'row' }, button('Copy pitch', () => copy(sp, 'Pitch copied'), { iconName: 'copy', variant: 'sm primary' }), button('Redraft from the song', () => ctx.update(S((s) => delete s.press.edits.spotify)), { variant: 'sm ghost' })),
        h('h3', { class: 'mgr-h3' }, 'What to pick in the form'),
        h('ul', { class: 'mgr-facts' }, hints.map(([k, v]) => h('li', {}, h('span', {}, k), h('span', { class: 'muted small' }, v)))),
      ),
    ),
    h(
      'div',
      {},
      h(
        'section',
        { class: 'mgr-sect' },
        h('h2', {}, 'Pitch an independent curator'),
        h('p', { class: 'muted small' }, 'Name the curator and the playlist; the note stays short and about their list. Always send a link that plays without a login.'),
        h('div', { class: 'mgr-three' }, input('Curator', 'curator', 'First name'), input('Playlist', 'playlist', 'Playlist name'), input('Email or DM handle', 'contact', 'name@example.com')),
        curBox,
        h(
          'div',
          { class: 'row' },
          button('Copy message', () => copy(curBox.value, 'Message copied'), { iconName: 'copy', variant: 'sm primary' }),
          mail ? h('a', { class: 'btn sm', href: mail }, 'Open in email') : null,
          button('Log as sent', logIt, { iconName: 'check', variant: 'sm', title: 'Add to the tracker with a follow-up in 7 days' }),
        ),
        h('p', { class: 'muted tiny' }, 'Edit the message after copying if you like. Follow up once, a week later, and never twice. Some curators charge for submissions; you never have to pay for a playlist add.'),
      ),
    ),
  );
  const tracker = h(
    'section',
    { class: 'mgr-sect mgr-tracker' },
    h('h2', {}, `Pitch tracker · ${pitches.length}`),
    pitches.length ? h('p', { class: 'muted small' }, `${stats.sent} sent · ${stats.replied} replied · ${stats.added} added`) : null,
    pitches.length
      ? h(
          'table',
          { class: 'mgr-table' },
          h('thead', {}, h('tr', {}, ['Playlist', 'Where', 'Curator', 'Contact', 'Status', 'Sent', 'Follow up', 'Notes', ''].map((c) => h('th', {}, c)))),
          h(
            'tbody',
            {},
            pitches.map((p) => {
              const due = p.status === 'sent' && p.followUp && !p.followedUp && p.followUp <= today;
              return h(
                'tr',
                { class: due ? 'late' : '' },
                h('td', {}, f.text(`pt-p-${p.id}`, '', p.playlist, Pt(p.id, (x, v) => (x.playlist = v)), { placeholder: 'Playlist' })),
                h('td', {}, f.select(`pt-s-${p.id}`, '', p.service, PITCH_SERVICES.map((x) => [x, x]), Pt(p.id, (x, v) => (x.service = v)))),
                h('td', {}, f.text(`pt-c-${p.id}`, '', p.curator, Pt(p.id, (x, v) => (x.curator = v)))),
                h('td', {}, f.text(`pt-e-${p.id}`, '', p.contact, Pt(p.id, (x, v) => (x.contact = v.trim())))),
                h('td', {}, f.select(`pt-st-${p.id}`, '', p.status, PITCH_STATUSES, Pt(p.id, (x, v) => {
                  x.status = v;
                  if (v === 'sent' && !x.sent) {
                    x.sent = today;
                    x.followUp ||= addDays(today, 7);
                  }
                }))),
                h('td', {}, f.text(`pt-d-${p.id}`, '', p.sent, Pt(p.id, (x, v) => (x.sent = v)), { type: 'date' })),
                h('td', {}, f.text(`pt-f-${p.id}`, '', p.followUp, Pt(p.id, (x, v) => ((x.followUp = v), (x.followedUp = false))), { type: 'date' }), due ? h('button', { type: 'button', class: 'link', onclick: () => ctx.update(Pt(p.id, (x) => (x.followedUp = true))) }, 'Followed up') : null),
                h('td', {}, f.text(`pt-n-${p.id}`, '', p.notes, Pt(p.id, (x, v) => (x.notes = v)))),
                h('td', {}, iconButton('trash', `Delete pitch to ${p.playlist || 'playlist'}`, () => ctx.update(S((s) => (s.pitches = s.pitches.filter((x) => x.id !== p.id)))), 'ghost')),
              );
            }),
          ),
        )
      : h('p', { class: 'muted small' }, 'Pitches you log or add from the Playlists tab appear here, with a follow-up reminder on Home and the Calendar.'),
    button('Add a pitch', () => add(), { iconName: 'plus', variant: 'sm' }),
  );
  return h('div', {}, cols, tracker);
}
