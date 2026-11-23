// Releases: the open artist's EPs and albums (and singles you want to track as releases), each with
// its cover, date, label and UPC and an ordered tracklist of the artist's songs.
import { h, icon, button, iconButton, toast } from '../dom.js';
import { newSong, niceDate } from './model.js';
import { RELEASE_TYPES, releaseTypeLabel, tracklist, setRelease, moveTrack, deleteRelease, coverOf, fmtTime } from './releases.js';
import { coverPicker } from './page-cover.js';
import { releaseRolloutSection } from './page-rollout.js';
import { normUPC, lookupUPC, matchTrack, prettyISRC } from './isrc.js';

/** The last UPC lookup per release (not saved). */
export const upcUI = { res: {}, busy: '' };
const len = (ms) => (ms ? `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}` : '');

/**
 * Put a UPC lookup on a release: its title, type, date and label where blank, and for each found
 * track the matching song (by title, among this release's songs and then the artist's singles),
 * which gets the ISRC, its track number and the links the services listed. `create` adds songs for
 * tracks that match nothing. Returns { matched, created, isrcs }.
 */
export function applyUPC(d, relId, found, { create = true, newSongFn = null } = {}) {
  const r = (d.releases || []).find((x) => x.id === relId);
  if (!r) return { matched: 0, created: 0, isrcs: 0 };
  r.upc = found.upc;
  const fresh = !r.title || /^New (EP|album|single)$/.test(r.title); // still the default name
  if (fresh) r.title = found.title || r.title;
  if (!r.releaseDate && found.date) r.releaseDate = found.date;
  if (!r.label && found.label) r.label = found.label;
  if (fresh && ['single', 'ep', 'album', 'comp'].includes(found.type)) r.type = found.type;
  let matched = 0;
  let created = 0;
  let isrcs = 0;
  const taken = new Set();
  for (const t of found.tracks) {
    const pool = d.songs.filter((s) => !taken.has(s.id) && (s.releaseId === relId || !s.releaseId));
    let s = matchTrack(pool, t.title);
    if (!s && create && newSongFn) {
      s = { ...newSongFn(t.title), releaseDate: r.releaseDate || '' };
      d.songs.push(s);
      created++;
    } else if (s) matched++;
    if (!s) continue;
    taken.add(s.id);
    s.releaseId = relId;
    s.track = t.n;
    s.upc = found.upc;
    if (t.isrc && !s.isrc) (s.isrc = t.isrc), isrcs++;
    for (const l of t.links || []) if (!s.links[l.key]) s.links[l.key] = l.url;
  }
  // songs on the release that the UPC didn't list keep their place after the found ones
  const rest = d.songs.filter((x) => x.releaseId === relId && !taken.has(x.id)).sort((a, b) => (a.track || 99) - (b.track || 99));
  rest.forEach((x, i) => (x.track = found.tracks.length + i + 1));
  return { matched, created, isrcs };
}

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
  const upcRes = upcUI.res[r.id];
  const findUPC = async () => {
    if (!normUPC(r.upc)) return toast('Type the UPC first: the barcode number your distributor shows for the release (12 or 13 digits).', 'error');
    upcUI.busy = r.id;
    ctx.go('releases', r.id);
    try {
      upcUI.res[r.id] = await lookupUPC(r.upc);
    } catch (e) {
      toast(e.message, 'error', 7000);
    } finally {
      upcUI.busy = '';
      ctx.go('releases', r.id);
    }
  };
  const fill = (create) => {
    let out = null;
    ctx.update((d) => (out = applyUPC(d, r.id, upcRes, { create, newSongFn: newSong })));
    toast(`${out.matched} song${out.matched === 1 ? '' : 's'} matched${out.created ? `, ${out.created} added` : ''}; ${out.isrcs} ISRC${out.isrcs === 1 ? '' : 's'} filled. Each song’s Links section can now find its streaming links.`, 'info', 7000);
  };
  const takeCover = async () => {
    try {
      const blob = await (await fetch(upcRes.cover)).blob();
      const { added } = await ctx.studio.uploadMedia([new File([blob], `${(upcRes.title || 'cover').replace(/[^\w-]+/g, '-').toLowerCase()}-cover.jpg`, { type: blob.type || 'image/jpeg' })], ['image']);
      if (added.length) ctx.update(R((x) => (x.coverId = added[0].id)));
      toast('Cover saved');
    } catch {
      toast('Couldn’t download the cover from Deezer.', 'error');
    }
  };
  const upcBox = upcRes
    ? h(
        'div',
        { class: 'mgr-isrc-res' },
        h('div', { class: 'mgr-isrc-head' }, upcRes.cover ? h('img', { src: upcRes.cover, alt: '', width: 56, height: 56, referrerpolicy: 'no-referrer' }) : null, h('div', {}, h('strong', {}, upcRes.title), h('span', { class: 'muted small' }, [upcRes.artist, releaseTypeLabel(upcRes.type), upcRes.date, upcRes.label].filter(Boolean).join(' · ')))),
        h('ol', { class: 'mgr-upc-tracks' }, upcRes.tracks.map((t) => {
          const mine = matchTrack(m.songs.filter((s) => s.releaseId === r.id || !s.releaseId), t.title);
          return h('li', { class: mine ? 'match' : '' }, h('span', { class: 'mgr-track-n' }, String(t.n)), h('span', {}, h('strong', {}, t.title), h('span', { class: 'muted tiny' }, ` ${[len(t.ms), t.isrc ? prettyISRC(t.isrc) : 'no ISRC listed'].filter(Boolean).join(' · ')}`)), h('span', { class: 'muted tiny' }, mine ? `→ ${mine.title}` : 'new song'));
        })),
        upcRes.links.length ? h('p', { class: 'small' }, 'The release on: ', upcRes.links.map((l, i) => [i ? ', ' : '', h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer' }, l.source)])) : null,
        upcRes.notes.map((n) => h('p', { class: 'muted tiny' }, n)),
        h('div', { class: 'row' }, button('Fill in the tracks', () => fill(true), { iconName: 'check', variant: 'sm primary', title: 'Match songs by title, give them their ISRC and track number, and add songs for the rest' }), button('Only match songs I have', () => fill(false), { variant: 'sm ghost' }), upcRes.cover && !r.coverId ? button('Use this cover', takeCover, { iconName: 'image', variant: 'sm' }) : null),
      )
    : null;
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
      h('div', { class: 'mgr-title' }, f.text(`rel-title-${r.id}`, '', r.title, R((x, v) => (x.title = v.trim() || 'Untitled')), { aria: 'Release title' }), h('p', { class: 'muted' }, `${releaseTypeLabel(r.type)} · ${tracks.length} track${tracks.length === 1 ? '' : 's'}${total ? ` · ${fmtTime(total)}` : ''}`)),
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
        h('div', { class: 'row' }, button(upcUI.busy === r.id ? 'Looking…' : 'Find tracks by UPC', findUPC, { iconName: 'search', variant: 'sm', disabled: upcUI.busy === r.id, title: 'Look the release up on Deezer, MusicBrainz and Apple Music by its barcode' }), tracks.length && r.releaseDate ? button('Give every track this release date', sameDate, { variant: 'sm ghost' }) : null),
        upcBox,
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
    releaseRolloutSection(ctx, r),
  );
}
