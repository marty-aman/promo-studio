// Songs: one page per song with tabs for the overview, lyrics, video shoot, release checklist, its
// content plan, suggested playlists, the press release and playlist pitching. "Make a promo" hands the song to the video studio.
import { h, icon, button, iconButton, toast, pickFiles } from '../dom.js';
import { driveButton } from '../gdrive.js';
import { SONG_STATUSES, TASK_CATS, newSong, taskDue, releaseProgress, releaseChecklist, niceDate, daysBetween, mid } from './model.js';
import { hookLines, planPosts } from './ideas.js';
import { buildShootTab } from './page-shoot.js';
import { pressTab, playlistsTab, pitchTab } from './page-press.js';
import { pitchStats } from './press.js';
import { linksSection } from './page-links.js';
import { filesTab } from './page-files.js';
import { fileCounts } from './files.js';
import { sectionsTab } from './page-sections.js';
import { coverPicker } from './page-cover.js';
import { releaseCard } from './page-releases.js';
import { coverOf, setRelease, releaseTypeLabel, sectionSpans, newRelease, parseTime, fmtTime } from './releases.js';

const TABS = [
  ['overview', 'Overview'],
  ['lyrics', 'Lyrics'],
  ['files', 'Files'],
  ['sections', 'Sections'],
  ['shoot', 'Video shoot'],
  ['release', 'Release'],
  ['content', 'Content'],
  ['playlists', 'Playlists'],
  ['press', 'Press release'],
  ['pitch', 'Pitching'],
];
export const POST_STATUSES = [['idea', 'Idea'], ['filmed', 'Filmed'], ['edited', 'Edited'], ['scheduled', 'Scheduled'], ['posted', 'Posted']];
const statusLabel = (k) => (SONG_STATUSES.find(([v]) => v === k) || [k, k])[1];

export function buildSongs(ctx) {
  const m = ctx.store.get();
  const song = ctx.view.id && m.songs.find((s) => s.id === ctx.view.id);
  return song ? songPage(ctx, song) : songList(ctx);
}

export const songsUI = { show: 'all' };
const ALBUM_TYPES = ['album', 'deluxe', 'live', 'comp'];

function songList(ctx) {
  const m = ctx.store.get();
  const releases = m.releases || [];
  const add = () => {
    const s = newSong('New song');
    ctx.update((d) => d.songs.unshift(s));
    ctx.go('songs', s.id, 'overview');
  };
  const addRelease = (type) => {
    const r = newRelease(type);
    ctx.update((d) => (d.releases ||= []).unshift(r));
    ctx.go('releases', r.id);
  };
  const order = Object.fromEntries(SONG_STATUSES.map(([k], i) => [k, i]));
  const singles = m.songs.filter((s) => !s.releaseId);
  const pool = songsUI.show === 'singles' ? singles : m.songs;
  const songs = [...pool].sort((a, b) => (a.releaseDate || '9999').localeCompare(b.releaseDate || '9999') || order[a.status] - order[b.status]);
  const byDate = (list) => [...list].sort((a, b) => (b.releaseDate || '9999').localeCompare(a.releaseDate || '9999') || a.title.localeCompare(b.title));
  const albums = byDate(releases.filter((r) => ALBUM_TYPES.includes(r.type)));
  const eps = byDate(releases.filter((r) => r.type === 'ep'));
  const singleRels = byDate(releases.filter((r) => r.type === 'single'));
  const relSection = (title, list, type, blurb) =>
    h(
      'section',
      { class: 'mgr-sect mgr-music-sect' },
      h('div', { class: 'mgr-sect-head' }, h('h2', {}, `${title} · ${list.length}`), type ? button(`New ${type === 'ep' ? 'EP' : 'album'}`, () => addRelease(type), { iconName: 'plus', variant: 'sm' }) : null),
      list.length ? h('div', { class: 'mgr-releases' }, list.map((r) => releaseCard(ctx, r))) : h('p', { class: 'muted small' }, blurb),
    );
  const chip = (k, label) => button(label, () => ((songsUI.show = k), ctx.go('songs')), { variant: `chip${songsUI.show === k ? ' on' : ''}` });
  return h(
    'div',
    { class: 'mgr-page wide' },
    h(
      'header',
      { class: 'mgr-head' },
      h('div', {}, h('h1', {}, 'Songs & releases'), h('p', { class: 'muted' }, `${m.band.name || 'This artist'}’s albums, EPs and songs: covers, tracklists, lyrics, the video shoot, the release checklist and the content plan.`)),
      h('div', { class: 'row' }, button('New album', () => addRelease('album'), { iconName: 'plus' }), button('New EP', () => addRelease('ep'), { iconName: 'plus' }), button('New song', add, { iconName: 'plus', variant: 'primary' })),
    ),
    relSection('Albums', albums, 'album', 'No albums yet. Make one, then add songs to it from its page or from each song’s Overview.'),
    relSection('EPs', eps, 'ep', 'No EPs yet.'),
    singleRels.length ? relSection('Singles (as releases)', singleRels, '', '') : null,
    h(
      'section',
      { class: 'mgr-sect mgr-music-sect' },
      h('div', { class: 'mgr-sect-head' }, h('h2', {}, `Songs · ${m.songs.length}`), h('div', { class: 'row' }, m.songs.length && singles.length !== m.songs.length ? h('div', { class: 'chips' }, chip('all', `All ${m.songs.length}`), chip('singles', `Not on an EP or album ${singles.length}`)) : null, button('New song', add, { iconName: 'plus', variant: 'sm' }))),
      songs.length
        ? h(
            'div',
            { class: 'mgr-grid' },
            songs.map((s) => {
              const p = releaseProgress(s);
              const days = s.releaseDate ? daysBetween(ctx.today(), s.releaseDate) : null;
              const rel = s.releaseId && releases.find((x) => x.id === s.releaseId);
              return h(
                'button',
                { type: 'button', class: 'mgr-card', onclick: () => ctx.go('songs', s.id, 'overview') },
                h('span', { class: 'mgr-card-cover' }, (() => {
                  const c = coverOf(s, releases);
                  const x = c && ctx.studio.mediaInfo(c);
                  return x ? h('img', { src: x.url, alt: '', loading: 'lazy' }) : icon('disc', 22);
                })()),
                h('span', { class: `mgr-chip st-${s.status}` }, statusLabel(s.status)),
                h('strong', {}, s.title),
                h('span', { class: 'muted tiny' }, rel ? `${releaseTypeLabel(rel.type)}: ${rel.title} · track ${s.track || '?'}` : 'Single'),
                h('span', { class: 'muted tiny' }, s.releaseDate ? `${niceDate(s.releaseDate)}${days != null && days >= 0 ? ` · in ${days} days` : ''}` : 'No release date'),
                h('span', { class: 'mgr-bar' }, h('i', { style: { width: `${p.total ? (100 * p.done) / p.total : 0}%` } })),
                h('span', { class: 'muted tiny' }, `${p.done}/${p.total} release tasks · ${m.posts.filter((x) => x.songId === s.id).length} posts`),
              );
            }),
          )
        : h('div', { class: 'mgr-empty' }, h('p', {}, m.songs.length ? 'Every song is on an EP or album.' : 'No songs yet.'), m.songs.length ? null : button('Add your first song', add, { iconName: 'plus', variant: 'primary' })),
    ),
  );
}

function songPage(ctx, song) {
  const f = ctx.form;
  const S = (fn) => (d, v) => {
    const s = d.songs.find((x) => x.id === song.id);
    if (s) fn(s, v, d);
  };
  const tab = TABS.some(([k]) => k === ctx.view.tab) ? ctx.view.tab : 'overview';
  const remove = () => {
    if (!confirm(`Delete “${song.title}” and its plan? Its posts are deleted too.`)) return;
    ctx.update((d) => {
      d.songs = d.songs.filter((s) => s.id !== song.id);
      d.posts = d.posts.filter((p) => p.songId !== song.id);
    });
    ctx.go('songs');
  };
  const body = { overview: overviewTab, lyrics: lyricsTab, files: filesTab, sections: sectionsTab, shoot: buildShootTab, release: releaseTab, content: contentTab, playlists: playlistsTab, press: pressTab, pitch: pitchTab }[tab](ctx, song, S);
  return h(
    'div',
    { class: 'mgr-page' },
    h('button', { type: 'button', class: 'link back', onclick: () => ctx.go('songs') }, icon('arrowLeft', 14), 'Songs & releases'),
    h(
      'header',
      { class: 'mgr-head song' },
      h('div', { class: 'mgr-title' }, f.text(`title-${song.id}`, '', song.title, S((s, v) => (s.title = v.trim() || 'Untitled'))), h('div', { class: 'row' }, f.select(`status-${song.id}`, '', song.status, SONG_STATUSES, S((s, v) => (s.status = v))), h('label', { class: 'mf inline' }, h('span', { class: 'mf-l' }, 'Release date'), f.text(`rel-${song.id}`, '', song.releaseDate, S((s, v) => (s.releaseDate = v)), { type: 'date' })))),
      h('div', { class: 'row' }, button('Design a post', () => ctx.studio.openPhoto(song.releaseDate && song.releaseDate > ctx.today() ? 'release' : 'promo', { songId: song.id }), { iconName: 'image', variant: '', title: 'Open the Photo Studio with a release image for this song (more templates there: countdown, lyric card, carousel…)' }), button('Make a promo', () => ctx.studio.openPromo(song), { iconName: 'film', variant: 'primary', title: 'Open the video studio with this song’s title, lyrics and audio' }), iconButton('trash', `Delete “${song.title}”`, remove, 'ghost danger')),
    ),
    h('div', { class: 'mgr-tabs', role: 'tablist' }, TABS.map(([k, label]) => h('button', { type: 'button', role: 'tab', 'aria-selected': k === tab ? 'true' : 'false', class: `mgr-tab${k === tab ? ' on' : ''}`, onclick: () => ctx.setTab(k) }, label))),
    h('div', { class: 'mgr-tabbody', role: 'tabpanel' }, body),
  );
}

/** Which song is uploading a file right now (not saved). */
export const uploadUI = { busy: null };

/** Pick a song file from the computer, add it to the media library and attach it to the song. */
const SONG_ACCEPT = 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac,.aif,.aiff';
async function uploadSong(ctx, song, S, files = null) {
  const [file] = files || (await pickFiles(SONG_ACCEPT, false));
  if (!file) return;
  uploadUI.busy = song.id;
  ctx.setTab('overview');
  try {
    const rec = await ctx.studio.uploadAudio(file);
    ctx.update(S((s) => (s.audioId = rec.id)));
    toast(`“${rec.name}” is now the song file for “${song.title}”`);
  } catch (e) {
    toast(e.message || 'Could not read that file.', 'error', 5000);
  } finally {
    uploadUI.busy = null;
    ctx.setTab('overview');
  }
}

function overviewTab(ctx, song, S) {
  const f = ctx.form;
  const audio = ctx.studio.audioFiles();
  const p = releaseProgress(song);
  const posts = ctx.store.get().posts.filter((x) => x.songId === song.id);
  return h(
    'div',
    { class: 'mgr-cols' },
    h(
      'section',
      { class: 'mgr-sect' },
      h('h2', {}, 'At a glance'),
      h(
        'ul',
        { class: 'mgr-facts' },
        h('li', {}, h('span', {}, 'Release checklist'), h('button', { type: 'button', class: 'link', onclick: () => ctx.setTab('release') }, `${p.done} of ${p.total} done`)),
        h('li', {}, h('span', {}, 'Video shoot'), h('button', { type: 'button', class: 'link', onclick: () => ctx.setTab('shoot') }, song.shoot.date ? niceDate(song.shoot.date) : song.shoot.concept ? 'Concept picked, no date' : 'Not planned')),
        h('li', {}, h('span', {}, 'Planned posts'), h('button', { type: 'button', class: 'link', onclick: () => ctx.setTab('content') }, `${posts.length} (${posts.filter((x) => x.status === 'posted').length} posted)`)),
        h('li', {}, h('span', {}, 'Tab, stems, video and footage'), h('button', { type: 'button', class: 'link', onclick: () => ctx.setTab('files') }, (({ tabs, stems, video, footage, total }) => (total ? [tabs && `${tabs} tab${tabs === 1 ? '' : 's'}`, stems && `${stems} stem${stems === 1 ? '' : 's'}`, video && 'music video', footage && `${footage} clip${footage === 1 ? '' : 's'}`].filter(Boolean).join(' · ') : 'None yet'))(fileCounts(song)))),
        h('li', {}, h('span', {}, 'Playlist pitches'), h('button', { type: 'button', class: 'link', onclick: () => ctx.setTab('pitch') }, (({ total, sent, added }) => (total ? `${sent} sent · ${added} added` : 'None yet'))(pitchStats(song)))),
        h('li', {}, h('span', {}, 'Sections'), h('button', { type: 'button', class: 'link', onclick: () => ctx.setTab('sections') }, song.sections.length ? sectionSpans(song.sections).map((x) => x.label).slice(0, 4).join(' · ') + (song.sections.length > 4 ? '…' : '') : 'None yet')),
        h('li', {}, h('span', {}, 'Lyrics'), h('button', { type: 'button', class: 'link', onclick: () => ctx.setTab('lyrics') }, song.lyrics.trim() ? `${song.lyrics.trim().split(/\n+/).length} lines` : 'None yet')),
      ),
      (() => {
        const m = ctx.store.get();
        const rels = m.releases || [];
        const rel = rels.find((x) => x.id === song.releaseId);
        const sel = h('select', { 'data-k': `relsel-${song.id}`, 'aria-label': 'EP or album' }, h('option', { value: '' }, 'A single (not on an EP or album)'), rels.map((x) => h('option', { value: x.id, selected: x.id === song.releaseId }, `${releaseTypeLabel(x.type)}: ${x.title}`)), h('option', { value: '__new_ep' }, '+ New EP…'), h('option', { value: '__new_album' }, '+ New album…'));
        sel.addEventListener('change', () => {
          if (sel.value.startsWith('__new_')) {
            const type = sel.value === '__new_ep' ? 'ep' : 'album';
            const title = prompt(`Name the ${type === 'ep' ? 'EP' : 'album'}`, '');
            if (!title || !title.trim()) return ctx.setTab('overview');
            const r = { ...newRelease(type, title.trim()), releaseDate: song.releaseDate || '' };
            ctx.update((d) => {
              (d.releases ||= []).push(r);
              setRelease(d, song.id, r.id);
            });
            return toast(`“${song.title}” is track 1 of “${r.title}”. Add the cover and other songs on the Releases page.`, 'info', 5000);
          }
          ctx.update((d) => setRelease(d, song.id, sel.value));
        });
        return h(
          'div',
          { class: 'mgr-release-pick' },
          h('div', { class: 'mgr-two' }, h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Release'), sel), rel ? h('div', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Track'), h('div', { class: 'row' }, h('strong', {}, `${song.track || '?'} of ${m.songs.filter((x) => x.releaseId === rel.id).length}`), button(`Open ${rel.title}`, () => ctx.go('releases', rel.id), { variant: 'sm ghost' }))) : h('span')),
          coverPicker(ctx, { key: `song-${song.id}`, current: song.coverId, inherited: coverOf({ ...song, coverId: null }, rels), inheritedFrom: rel ? `“${rel.title}”` : '', set: (id) => ctx.update(S((x) => (x.coverId = id))) }),
        );
      })(),
      h(
        'div',
        { class: 'mgr-three' },
        f.text(`bpm-${song.id}`, 'BPM', song.bpm, S((s, v) => (s.bpm = v)), { type: 'number' }),
        f.text(`key-${song.id}`, 'Key', song.key, S((s, v) => (s.key = v)), { placeholder: 'e.g. Drop C, D minor' }),
        (() => {
          const fileLen = song.audioId ? ctx.studio.mediaInfo(song.audioId)?.duration : 0;
          return f.text(`len-${song.id}`, 'Length', song.length, S((s, v) => (s.length = parseTime(v) ? fmtTime(parseTime(v)) : v.trim())), { placeholder: fileLen ? `${fmtTime(fileLen)} (from the file)` : 'e.g. 3:45 (for setlists)', hint: song.length && !parseTime(song.length) ? 'Type it like 3:45.' : '' });
        })(),
      ),
      h(
        'div',
        { class: 'mgr-upload' },
        f.select(`audio-${song.id}`, 'Song file (for promos)', song.audioId || '', [['', audio.length ? '— pick a file —' : 'No file yet: upload one'], ...audio.map((a) => [a.id, a.name])], S((s, v) => (s.audioId = v || null))),
        button(uploadUI.busy === song.id ? 'Uploading…' : 'Upload from computer', () => uploadSong(ctx, song, S), { iconName: 'upload', variant: 'sm', disabled: uploadUI.busy === song.id, title: 'Pick an MP3, WAV, M4A, OGG or FLAC file. It goes into the Video Studio’s media library too.' }),
        driveButton(SONG_ACCEPT, false, (fs) => uploadSong(ctx, song, S, fs)),
      ),
      f.text(`notes-${song.id}`, 'Notes', song.notes, S((s, v) => (s.notes = v)), { rows: 4, placeholder: 'Story behind the song, who wrote what, studio notes…' }),
    ),
    linksSection(ctx, song, S),
  );
}

function lyricsTab(ctx, song, S) {
  const hooks = hookLines(song.lyrics, 5);
  return h(
    'div',
    { class: 'mgr-cols' },
    h('section', { class: 'mgr-sect' }, h('h2', {}, 'Lyrics'), ctx.form.text(`lyrics-${song.id}`, '', song.lyrics, S((s, v) => (s.lyrics = v)), { rows: 22, placeholder: 'One line per row. Blank lines between verses are fine.' })),
    h(
      'section',
      { class: 'mgr-sect' },
      h('h2', {}, 'Lines that work as hooks'),
      hooks.length ? h('ol', { class: 'mgr-hooks' }, hooks.map((l) => h('li', {}, l))) : h('p', { class: 'muted small' }, 'Add lyrics to see the short, repeated or shouted lines that make the best on-screen hooks.'),
      h('p', { class: 'muted tiny' }, 'Use them as the first line of a short video, a caption, or the end card. The Video shoot tab suggests concepts from these words.'),
      button('Send lyrics to the video editor', () => ctx.studio.openPromo(song), { iconName: 'film', variant: 'sm' }),
    ),
  );
}

function releaseTab(ctx, song, S) {
  const f = ctx.form;
  const today = ctx.today();
  const tasks = [...song.release].sort((a, b) => (taskDue(song, a) || `~${a.offset}`).localeCompare(taskDue(song, b) || `~${b.offset}`) || a.offset - b.offset);
  const T = (id, fn) => S((s, v) => {
    const t = s.release.find((x) => x.id === id);
    if (t) fn(t, v);
  });
  const addTask = () => ctx.update(S((s) => s.release.push({ id: mid('task'), offset: 0, date: today, cat: 'other', text: 'New task', done: false })));
  const reset = () => confirm('Put back the standard checklist? Tasks you added are kept; ticked standard tasks are reset.') && ctx.update(S((s) => (s.release = [...s.release.filter((t) => t.date), ...releaseChecklist()])));
  const rows = tasks.map((t) => {
    const due = taskDue(song, t);
    const late = !t.done && due && due < today;
    return h(
      'li',
      { class: `mgr-task${t.done ? ' done' : ''}${late ? ' late' : ''}` },
      f.check(`done-${t.id}`, t.done, T(t.id, (x, v) => (x.done = v)), `Done: ${t.text}`),
      h('span', { class: 'mgr-when' }, due ? niceDate(due, { weekday: false }) : t.offset === 0 ? 'Release day' : `${Math.abs(t.offset)} days ${t.offset < 0 ? 'before' : 'after'}`),
      f.text(`task-${t.id}`, '', t.text, T(t.id, (x, v) => (x.text = v))),
      h('span', { class: 'mgr-chip' }, TASK_CATS[t.cat] || 'Other'),
      t.date ? f.text(`tdate-${t.id}`, '', t.date, T(t.id, (x, v) => (x.date = v)), { type: 'date' }) : null,
      iconButton('trash', `Delete “${t.text}”`, () => ctx.update(S((s) => (s.release = s.release.filter((x) => x.id !== t.id)))), 'ghost'),
    );
  });
  const p = releaseProgress(song);
  return h(
    'section',
    { class: 'mgr-sect' },
    h('h2', {}, `Release checklist · ${p.done}/${p.total}`),
    song.releaseDate ? h('p', { class: 'muted small' }, `Counted back from ${niceDate(song.releaseDate)}. Change the release date above and every date moves with it.`) : h('p', { class: 'warn-list' }, 'Set a release date above to put dates on these tasks.'),
    h('ul', { class: 'mgr-tasks' }, rows),
    h('div', { class: 'row' }, button('Add a task', addTask, { iconName: 'plus', variant: 'sm' }), button('Put back the standard checklist', reset, { variant: 'sm ghost' })),
  );
}

function contentTab(ctx, song) {
  const f = ctx.form;
  const posts = ctx.store.get().posts.filter((p) => p.songId === song.id).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const P = (id, fn) => (d, v) => {
    const p = d.posts.find((x) => x.id === id);
    if (p) fn(p, v);
  };
  const plan = () => {
    if (!song.releaseDate) return toast('Set a release date first.', 'error');
    const fresh = planPosts(song);
    if (posts.length && !confirm(`Add ${fresh.length} more planned posts around release day?`)) return;
    ctx.update((d) => d.posts.push(...fresh));
    toast(`${fresh.length} posts planned around ${niceDate(song.releaseDate)}`);
  };
  const add = () => ctx.update((d) => d.posts.push({ id: mid('post'), songId: song.id, date: ctx.today(), platform: 'TikTok', format: 'other', title: 'New post', hook: '', idea: '', status: 'idea', url: '', stats: null }));
  return h(
    'section',
    { class: 'mgr-sect' },
    h('h2', {}, `Short-form plan · ${posts.length} posts`),
    h('p', { class: 'muted small' }, 'The plan follows the posting playbook: snippet and “use this sound” before release, the hook and a share ask on release day, then riffs, live takes and the story behind the song.'),
    h('div', { class: 'row' }, button('Plan posts around release day', plan, { iconName: 'wand', variant: 'sm primary' }), button('Add a post', add, { iconName: 'plus', variant: 'sm' })),
    posts.length
      ? h(
          'table',
          { class: 'mgr-table' },
          h('thead', {}, h('tr', {}, ['Date', 'Post', 'Hook line', 'Where', 'Status', 'Link', ''].map((c) => h('th', {}, c)))),
          h(
            'tbody',
            {},
            posts.map((p) =>
              h(
                'tr',
                {},
                h('td', {}, f.text(`pdate-${p.id}`, '', p.date, P(p.id, (x, v) => (x.date = v)), { type: 'date' })),
                h('td', {}, f.text(`ptitle-${p.id}`, '', p.title, P(p.id, (x, v) => (x.title = v))), p.idea ? h('span', { class: 'muted tiny' }, p.idea) : null),
                h('td', {}, f.text(`phook-${p.id}`, '', p.hook, P(p.id, (x, v) => (x.hook = v)))),
                h('td', {}, f.text(`pplat-${p.id}`, '', p.platform, P(p.id, (x, v) => (x.platform = v)))),
                h('td', {}, f.select(`pst-${p.id}`, '', p.status, POST_STATUSES, P(p.id, (x, v) => (x.status = v)))),
                h('td', {}, f.text(`purl-${p.id}`, '', p.url, P(p.id, (x, v) => (x.url = v.trim())), { type: 'url', placeholder: 'Paste the post link' })),
                h('td', {}, iconButton('trash', `Delete “${p.title}”`, () => ctx.update((d) => (d.posts = d.posts.filter((x) => x.id !== p.id))), 'ghost')),
              ),
            ),
          ),
        )
      : h('p', { class: 'muted small' }, 'No posts planned yet.'),
  );
}
