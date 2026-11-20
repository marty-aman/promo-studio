// Releases: the open artist's EPs and albums (and singles you want to track as releases), each with
// its cover, date, label and UPC and an ordered tracklist of the artist's songs.
import { h, icon, button, iconButton, toast } from '../dom.js';
import { newSong, niceDate } from './model.js';
import { RELEASE_TYPES, releaseTypeLabel, tracklist, setRelease, moveTrack, deleteRelease, coverOf, fmtTime } from './releases.js';
import { coverPicker } from './page-cover.js';

export function buildReleases(ctx) {
  const m = ctx.store.get();
  const rel = ctx.view.id && (m.releases || []).find((r) => r.id === ctx.view.id);
  if (rel) return releasePage(ctx, rel);
  // the list of releases is on Songs & releases
  queueMicrotask(() => ctx.go('songs'));
  return h('div', { class: 'mgr-page' });
}

/** A release's card (cover, type, title, date, tracks) for the Songs & releases page. */
export function releaseCard(ctx, r) {
  const m = ctx.store.get();
  const tracks = tracklist(m.songs, r.id);
  return h('button', { type: 'button', class: 'mgr-release-card', onclick: () => ctx.go('releases', r.id) }, thumb(ctx, r.coverId, 'big'), h('span', { class: 'mgr-chip' }, releaseTypeLabel(r.type)), h('strong', {}, r.title), h('span', { class: 'muted tiny' }, [r.releaseDate ? niceDate(r.releaseDate, { weekday: false }) : 'No date', `${tracks.length} track${tracks.length === 1 ? '' : 's'}`].join(' · ')));
}

function thumb(ctx, id, cls = '') {
  const x = id ? ctx.studio.mediaInfo(id) : null;
  return h('span', { class: `mgr-cover-thumb ${cls}` }, x ? h('img', { src: x.url, alt: '', loading: 'lazy' }) : icon('disc', 22));
}

function releasePage(ctx, r) {
  const m = ctx.store.get();
  const f = ctx.form;
  const R = (fn) => (d, v) => {
    const x = (d.releases || []).find((y) => y.id === r.id);
    if (x) fn(x, v, d);
  };
  const tracks = tracklist(m.songs, r.id);
  const lens = tracks.map((s) => (s.audioId && ctx.studio.mediaInfo(s.audioId)?.duration) || 0);
  const total = lens.reduce((a, b) => a + b, 0);
  const others = m.songs.filter((s) => s.releaseId !== r.id);
  const addSel = others.length
    ? (() => {
        const sel = h('select', { 'aria-label': 'Add a song', 'data-k': `rel-add-${r.id}` }, h('option', { value: '' }, 'Add one of your songs…'), others.map((s) => h('option', { value: s.id }, `${s.title}${s.releaseId ? ` (now on ${(m.releases.find((x) => x.id === s.releaseId) || {}).title || 'another release'})` : ''}`)));
        sel.addEventListener('change', () => sel.value && ctx.update((d) => setRelease(d, sel.value, r.id)));
        return sel;
      })()
    : null;
  const newTrack = () => {
    const title = prompt('Song title', '');
    if (!title || !title.trim()) return;
    const s = { ...newSong(title.trim()), releaseDate: r.releaseDate || '' };
    ctx.update((d) => {
      d.songs.unshift(s);
      setRelease(d, s.id, r.id);
    });
  };
  const remove = () => {
    if (!confirm(`Delete “${r.title}”? Its ${tracks.length} song${tracks.length === 1 ? '' : 's'} stay, as singles.`)) return;
    ctx.update((d) => deleteRelease(d, r.id));
    ctx.go('songs');
  };
  const sameDate = () => {
    if (!r.releaseDate) return toast('Set the release date first.', 'error');
    ctx.update((d) => {
      for (const s of d.songs) if (s.releaseId === r.id) s.releaseDate = r.releaseDate;
    });
    toast(`Every track now comes out ${niceDate(r.releaseDate, { weekday: false })}; their release checklists moved too.`);
  };
  return h(
    'div',
    { class: 'mgr-page wide' },
    h('button', { type: 'button', class: 'link back', onclick: () => ctx.go('songs') }, icon('arrowLeft', 14), 'Songs & releases'),
    h(
      'header',
      { class: 'mgr-head' },
      h('div', { class: 'mgr-title' }, f.text(`rel-title-${r.id}`, '', r.title, R((x, v) => (x.title = v.trim() || 'Untitled'))), h('p', { class: 'muted' }, `${releaseTypeLabel(r.type)} · ${tracks.length} track${tracks.length === 1 ? '' : 's'}${total ? ` · ${fmtTime(total)}` : ''}`)),
      h('div', { class: 'row' }, button('Design a post', () => ctx.studio.openPhoto(r.releaseDate && r.releaseDate > ctx.today() ? 'release' : 'promo', { releaseId: r.id }), { iconName: 'image', title: 'A release image for this EP or album in the Photo Studio' }), iconButton('trash', `Delete ${r.title}`, remove, 'ghost danger')),
    ),
    h(
      'div',
      { class: 'mgr-cols' },
      h(
        'section',
        { class: 'mgr-sect' },
        h('h2', {}, 'The release'),
        coverPicker(ctx, { key: `rel-${r.id}`, current: r.coverId, set: (id) => ctx.update(R((x) => (x.coverId = id))) }),
        h('div', { class: 'mgr-two' }, f.select(`rel-type-${r.id}`, 'Type', r.type, RELEASE_TYPES, R((x, v) => (x.type = v))), f.text(`rel-date-${r.id}`, 'Release date', r.releaseDate, R((x, v) => (x.releaseDate = v)), { type: 'date' })),
        h('div', { class: 'mgr-two' }, f.text(`rel-label-${r.id}`, 'Label', r.label, R((x, v) => (x.label = v)), { placeholder: 'Self-released' }), f.text(`rel-upc-${r.id}`, 'UPC', r.upc, R((x, v) => (x.upc = v.replace(/\D/g, '').slice(0, 14))), { placeholder: 'From your distributor' })),
        f.text(`rel-notes-${r.id}`, 'Notes', r.notes, R((x, v) => (x.notes = v)), { rows: 3, placeholder: 'Producer, studio, the story of the record…' }),
        tracks.length && r.releaseDate ? button('Give every track this release date', sameDate, { variant: 'sm ghost' }) : null,
      ),
      h(
        'section',
        { class: 'mgr-sect' },
        h('h2', {}, `Tracklist · ${tracks.length}`),
        tracks.length
          ? h(
              'ol',
              { class: 'mgr-tracks' },
              tracks.map((s, i) =>
                h(
                  'li',
                  { class: 'mgr-track' },
                  h('span', { class: 'mgr-track-n' }, String(i + 1)),
                  thumb(ctx, coverOf(s, m.releases)),
                  h('button', { type: 'button', class: 'link', onclick: () => ctx.go('songs', s.id) }, s.title),
                  h('span', { class: 'muted tiny' }, lens[i] ? fmtTime(lens[i]) : ''),
                  h('div', { class: 'row' }, iconButton('arrowUp', 'Move up', () => ctx.update((d) => moveTrack(d, s.id, -1)), 'ghost'), iconButton('arrowDown', 'Move down', () => ctx.update((d) => moveTrack(d, s.id, 1)), 'ghost'), iconButton('x', `Take ${s.title} off ${r.title}`, () => ctx.update((d) => setRelease(d, s.id, '')), 'ghost')),
                ),
              ),
            )
          : h('p', { class: 'muted small' }, 'No songs yet.'),
        h('div', { class: 'row' }, addSel, button('New song on this release', newTrack, { iconName: 'plus', variant: 'sm' })),
        h('p', { class: 'muted tiny' }, 'A song without its own cover shows this release’s cover.'),
      ),
    ),
  );
}
