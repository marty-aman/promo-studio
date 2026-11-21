// The song's Links section: type the ISRC, "Find links" looks it up on MusicBrainz, Deezer,
// Spotify, Apple and YouTube, and you pick which links to keep.
import { h, button, toast } from '../dom.js';
import { loadSettings, saveSettings } from '../state.js';
import { LINK_KEYS, normISRC, prettyISRC, lookupISRC, normUPC, lookupUPC, matchTrack } from './isrc.js';
import { releaseTypeLabel } from './releases.js';

/** Last lookup per song (not saved: it is quick to run again). */
export const linkUI = { results: {}, busy: {}, upc: {}, upcBusy: {} };
const len = (ms) => (ms ? `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}` : '');

const HOW = { isrc: 'Exact match (ISRC)', match: 'Matched by title and length', search: 'Search link' };

export function linksSection(ctx, song, S) {
  const f = ctx.form;
  const res = linkUI.results[song.id];
  const busy = linkUI.busy[song.id];
  const settings = loadSettings();
  const rerender = () => ctx.setTab('overview');

  const find = async (isrcIn = null) => {
    const isrc = normISRC(isrcIn || song.isrc);
    if (!isrc) return toast('Type the ISRC first, like USUM71703861 or US-UM7-17-03861.', 'error');
    linkUI.busy[song.id] = true;
    rerender();
    try {
      const s = loadSettings();
      linkUI.results[song.id] = await lookupISRC(isrc, {
        spotify: { clientId: s.spotifyClientId || '', clientSecret: s.spotifySecret || '' },
        youtubeKey: s.youtubeKey || '',
        fallback: { title: song.title, artist: ctx.store.get().band.name },
      });
      const n = linkUI.results[song.id].links.filter((l) => l.how !== 'search').length;
      toast(n ? `Found ${n} link${n === 1 ? '' : 's'}` : 'No direct links found; search links are ready', n ? 'info' : 'error');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      linkUI.busy[song.id] = false;
      rerender();
    }
  };
  const use = (links) => {
    ctx.update(S((s) => {
      for (const l of links) s.links[l.key] = l.url;
    }));
    toast(`${links.length} link${links.length === 1 ? '' : 's'} saved to the song`);
  };

  const exact = res ? res.links.filter((l) => l.how !== 'search' && song.links[l.key] !== l.url) : [];
  const results = res
    ? h(
        'div',
        { class: 'mgr-isrc-res' },
        h(
          'div',
          { class: 'mgr-isrc-head' },
          res.cover ? h('img', { src: res.cover, alt: '', width: 56, height: 56, referrerpolicy: 'no-referrer' }) : null,
          h('div', {}, h('strong', {}, res.title || 'Unknown title'), h('span', { class: 'muted small' }, [res.artist, res.ms ? `${Math.floor(res.ms / 60000)}:${String(Math.round((res.ms % 60000) / 1000)).padStart(2, '0')}` : '', prettyISRC(res.isrc)].filter(Boolean).join(' · '))),
        ),
        res.title && song.title && res.title.toLowerCase() !== song.title.toLowerCase() ? h('p', { class: 'warn-list' }, `This ISRC belongs to “${res.title}”, not “${song.title}”. Check the code before saving the links.`) : null,
        h(
          'ul',
          { class: 'mgr-isrc-list' },
          res.links.map((l) =>
            h(
              'li',
              { class: `how-${l.how}` },
              h('span', { class: 'mgr-isrc-k' }, (LINK_KEYS.find(([k]) => k === l.key) || [l.key, l.key])[1]),
              h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer', class: 'link' }, l.how === 'search' ? 'Search' : 'Open'),
              h('span', { class: 'muted tiny' }, l.how === 'search' ? HOW.search : `${HOW[l.how]} · ${l.source}`),
              song.links[l.key] === l.url ? h('span', { class: 'mgr-chip' }, 'Saved') : l.how === 'search' ? null : button('Use', () => use([l]), { variant: 'sm' }),
            ),
          ),
        ),
        res.notes.filter((n) => !(n.startsWith('Add a Spotify') && res.links.some((l) => l.key === 'spotify' && l.how === 'isrc'))).map((n) => h('p', { class: 'muted tiny' }, n)),
        exact.length ? button(`Use all ${exact.length} found link${exact.length === 1 ? '' : 's'}`, () => use(exact), { iconName: 'check', variant: 'sm primary' }) : null,
      )
    : null;

  // Optional Spotify app for exact Spotify matches; kept in this browser only.
  const idIn = h('input', { type: 'text', placeholder: 'Client ID', value: settings.spotifyClientId || '', autocomplete: 'off', 'aria-label': 'Spotify client ID' });
  const secretIn = h('input', { type: 'password', placeholder: 'Client secret', value: settings.spotifySecret || '', autocomplete: 'off', 'aria-label': 'Spotify client secret' });
  const saveSpotify = () => {
    const s = loadSettings();
    s.spotifyClientId = idIn.value.trim();
    s.spotifySecret = secretIn.value.trim();
    saveSettings(s);
    toast(s.spotifyClientId ? 'Spotify app saved in this browser only' : 'Spotify app removed');
  };
  const spotify = h(
    'details',
    { class: 'mgr-isrc-sp' },
    h('summary', {}, settings.spotifyClientId ? 'Spotify app: saved' : 'Spotify app (optional, for exact Spotify matches)'),
    h('p', { class: 'muted tiny' }, 'Create a free app at developer.spotify.com → Dashboard → Create app, then paste its client ID and secret. They stay in this browser and are only sent to Spotify.'),
    h('div', { class: 'mgr-two' }, idIn, secretIn),
    button('Save', saveSpotify, { variant: 'sm' }),
  );

  // ---- no ISRC? find the song from the release's UPC
  const rel = song.releaseId && (ctx.store.get().releases || []).find((x) => x.id === song.releaseId);
  const upcNow = song.upc || (rel && rel.upc) || '';
  const upcRes = linkUI.upc[song.id];
  const findUPC = async () => {
    const upc = normUPC(upcNow);
    if (!upc) return toast('Type the UPC first: the release’s barcode, 12 or 13 digits.', 'error');
    linkUI.upcBusy[song.id] = true;
    rerender();
    try {
      linkUI.upc[song.id] = await lookupUPC(upc);
      const r = linkUI.upc[song.id];
      toast(`Found “${r.title}” with ${r.tracks.length} track${r.tracks.length === 1 ? '' : 's'}${matchTrack(r.tracks, song.title) ? `, including “${song.title}”` : ''}`);
    } catch (e) {
      toast(e.message, 'error', 6000);
    } finally {
      linkUI.upcBusy[song.id] = false;
      rerender();
    }
  };
  /** This track is the song: take its ISRC, then find its links. */
  const pick = (t) => {
    const upc = normUPC(upcNow);
    ctx.update((d) => {
      const s = d.songs.find((x) => x.id === song.id);
      if (!s) return;
      if (t.isrc) s.isrc = t.isrc;
      s.upc = upc || s.upc;
      for (const l of t.links || []) if (!s.links[l.key]) s.links[l.key] = l.url;
      const r = s.releaseId && (d.releases || []).find((x) => x.id === s.releaseId);
      if (r && !r.upc && upc) r.upc = upc;
    });
    toast(t.isrc ? `ISRC ${prettyISRC(t.isrc)} saved. Finding the links…` : 'Saved the links this release lists. This track has no ISRC listed.');
    if (t.isrc) find(t.isrc);
  };
  const upcBox = h(
    'details',
    { class: 'mgr-upc', open: !normISRC(song.isrc) || !!upcRes || null },
    h('summary', {}, normISRC(song.isrc) ? 'Look it up by UPC instead' : 'No ISRC? Find the song from its UPC'),
    h(
      'div',
      { class: 'mgr-isrc' },
      f.text(`upc-${song.id}`, 'UPC (the release’s barcode)', upcNow, (d, v) => {
        const s = d.songs.find((x) => x.id === song.id);
        if (s) s.upc = String(v).replace(/[^\d]/g, '').slice(0, 13);
      }, { placeholder: 'e.g. 602557382549', hint: rel ? `From “${rel.title}”${rel.upc ? '' : ' (it has none yet)'}. Your distributor shows it on the release.` : 'Your distributor shows it on the release page.' }),
      button(linkUI.upcBusy[song.id] ? 'Looking…' : 'Find the release', findUPC, { iconName: 'search', variant: 'sm', disabled: !!linkUI.upcBusy[song.id] }),
    ),
    upcRes
      ? h(
          'div',
          { class: 'mgr-isrc-res' },
          h('div', { class: 'mgr-isrc-head' }, upcRes.cover ? h('img', { src: upcRes.cover, alt: '', width: 56, height: 56, referrerpolicy: 'no-referrer' }) : null, h('div', {}, h('strong', {}, upcRes.title), h('span', { class: 'muted small' }, [upcRes.artist, releaseTypeLabel(upcRes.type), upcRes.date, `${upcRes.tracks.length} track${upcRes.tracks.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')))),
          h(
            'ol',
            { class: 'mgr-upc-tracks' },
            upcRes.tracks.map((t) => {
              const me = matchTrack([t], song.title);
              return h('li', { class: me ? 'match' : '' }, h('span', { class: 'mgr-track-n' }, String(t.n)), h('span', {}, h('strong', {}, t.title), h('span', { class: 'muted tiny' }, ` ${[len(t.ms), t.isrc ? prettyISRC(t.isrc) : 'no ISRC listed'].filter(Boolean).join(' · ')}`)), song.isrc && t.isrc === normISRC(song.isrc) ? h('span', { class: 'mgr-chip' }, 'This song') : button(me ? 'This is the song' : 'Use this one', () => pick(t), { variant: `sm${me ? ' primary' : ' ghost'}` }));
            }),
          ),
          upcRes.notes.map((n) => h('p', { class: 'muted tiny' }, n)),
          rel ? h('p', { class: 'muted tiny' }, 'To fill in every song on the release at once, use Find tracks by UPC on its page.') : null,
        )
      : null,
  );

  const link = (k, label) => f.text(`link-${k}-${song.id}`, label, song.links[k], S((s, v) => (s.links[k] = v.trim())), { type: 'url', placeholder: 'https://…' });
  return h(
    'section',
    { class: 'mgr-sect' },
    h('h2', {}, 'Links'),
    h(
      'div',
      { class: 'mgr-isrc' },
      f.text(`isrc-${song.id}`, 'ISRC', song.isrc, S((s, v) => (s.isrc = normISRC(v) || v.trim().toUpperCase())), { placeholder: 'e.g. US-UM7-17-03861', hint: song.isrc && !normISRC(song.isrc) ? 'An ISRC has 12 letters and numbers: country, registrant, year, number.' : 'Your distributor shows it next to the track.' }),
      button(busy ? 'Looking…' : 'Find links', () => find(), { iconName: 'search', variant: 'sm primary', disabled: busy }),
    ),
    results,
    upcBox,
    spotify,
    h('div', { class: 'mgr-two' }, LINK_KEYS.map(([k, l]) => link(k, l))),
  );
}
