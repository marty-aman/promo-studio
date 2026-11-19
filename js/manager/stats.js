// Streaming stats: every song's numbers on one page.
//
// What each service allows (checked November 2026):
//  - Spotify: the Web API has no stream counts, and for apps made since February 2026 it no longer
//    returns popularity or followers either. Spotify for Artists has no API, but its Songs table
//    and each song's timeline download as CSV, so they are imported here.
//  - Apple Music, Amazon Music, TikTok, Tidal…: no artist API. Their streams and earnings arrive in
//    your distributor's report (DistroKid, TuneCore, CD Baby, Amuse, UnitedMasters…), which
//    downloads as CSV/TSV and is imported here, per store and month.
//  - YouTube: views and likes from the YouTube Data API (the key on the Content page).
//  - Last.fm: listeners and scrobbles per track (free API key).
//  - Deezer: the track's rank (a popularity score) by ISRC, no key.
import { parseCSV } from './content.js';
import { normISRC } from './isrc.js';
import { mid } from './model.js';

export const STAT_SOURCES = [
  ['s4a', 'Spotify for Artists'],
  ['distro', 'Distributor report'],
  ['youtube', 'YouTube'],
  ['lastfm', 'Last.fm'],
  ['deezer', 'Deezer'],
];
export const newStats = () => ({ imports: [], lines: [], live: {}, history: [] });
export function normalizeStats(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const arr = (x) => (Array.isArray(x) ? x.filter((y) => y && typeof y === 'object') : []);
  return { imports: arr(s.imports), lines: arr(s.lines), live: s.live && typeof s.live === 'object' ? s.live : {}, history: arr(s.history).slice(-3000) };
}

// ---------------------------------------------------------------- CSV import
const ALIASES = {
  title: ['title', 'song', 'song title', 'track', 'track title', 'track name', 'song name', 'name', 'release title'],
  artist: ['artist', 'artist name', 'artists'],
  isrc: ['isrc', 'isrc code'],
  store: ['store', 'store name', 'service', 'platform', 'dsp', 'partner', 'retailer', 'shop', 'channel'],
  // in order of preference: when the streams happened beats when they were reported
  date: ['sale month', 'sales month', 'usage period', 'sales period', 'period', 'month', 'date', 'transaction date', 'statement period', 'reporting month', 'reporting date'],
  streams: ['streams', 'quantity', 'units', 'plays', 'total streams', 'stream count', 'number of streams', 'qty', 'count'],
  listeners: ['listeners', 'monthly listeners'],
  saves: ['saves'],
  earnings: ['earnings (usd)', 'earnings', 'revenue', 'net revenue', 'amount', 'royalty', 'royalties', 'total earned', 'subtotal', 'net', 'net amount', 'income', 'payable'],
  country: ['country', 'country of sale', 'territory', 'country code'],
};
const clean = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Which column holds what: { title: 2, streams: 7, … } (−1 when missing). */
export function mapColumns(head) {
  const h = head.map(clean);
  const out = {};
  for (const [k, names] of Object.entries(ALIASES)) {
    let i = -1;
    for (const name of names) if (i < 0) i = h.indexOf(name); // the first name in the list wins
    if (i < 0) i = h.findIndex((x) => names.some((n) => n.length > 3 && x.startsWith(n)));
    out[k] = i;
  }
  return out;
}

const toNum = (v) => {
  const s = String(v ?? '').replace(/[$€£\s]/g, '').replace(/,(?=\d{3}\b)/g, '');
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
/** Dates as yyyy-mm-dd, or yyyy-mm for a month ("2026-03", "Mar 2026", "03/2026", "2026-03-15"). */
export function toPeriod(v) {
  const s = String(v || '').trim();
  let m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(s);
  if (m) return m[3] ? `${m[1]}-${m[2]}-${m[3]}` : `${m[1]}-${m[2]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  m = /^(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  m = /^([a-z]{3})[a-z]*[ -](\d{4})$/i.exec(s);
  if (m) {
    const k = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[1].toLowerCase());
    if (k >= 0) return `${m[2]}-${String(k + 1).padStart(2, '0')}`;
  }
  return '';
}

/** What kind of file it is, from its columns. */
export function detectSource(head, filename = '') {
  const h = head.map(clean);
  if (h.includes('listeners') && (h.includes('streams') || h.includes('saves'))) return { source: 's4a', label: 'Spotify for Artists' };
  if (h.includes('team percentage') || (h.includes('earnings (usd)') && h.includes('reporting date'))) return { source: 'distro', label: 'DistroKid' };
  if (/tunecore/i.test(filename)) return { source: 'distro', label: 'TuneCore' };
  if (/cd ?baby/i.test(filename)) return { source: 'distro', label: 'CD Baby' };
  if (h.some((x) => ALIASES.store.includes(x)) || h.some((x) => ALIASES.earnings.includes(x))) return { source: 'distro', label: 'Distributor' };
  if (h.includes('date') && h.includes('streams')) return { source: 's4a', label: 'Spotify for Artists (timeline)' };
  return { source: 'other', label: 'Other' };
}

/** Song titles compared loosely: case, punctuation, "(feat. …)" and " - Remastered" ignored. */
export const titleKey = (t) => String(t || '').toLowerCase().replace(/\s*[([].*?(feat|ft|with|remaster|version|edit|mix).*?[)\]]/g, '').replace(/\s+-\s+.*$/, '').replace(/[^\p{L}\p{N}]+/gu, '');

/** The song a row is about: same ISRC first, then the same title. */
export function matchSong(songs, { isrc = '', title = '' }) {
  const i = normISRC(isrc);
  if (i) {
    const s = songs.find((x) => normISRC(x.isrc) === i);
    if (s) return s;
  }
  const k = titleKey(title);
  return (k && songs.find((x) => titleKey(x.title) === k)) || null;
}

/**
 * Rows from a stats file: { title, isrc, store, date, streams, listeners, saves, earnings, songId }.
 * `songId` puts every row on one song (a Spotify for Artists song timeline has no title column).
 */
export function parseStatsFile(text, { filename = '', songs = [], songId = '' } = {}) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('That file has no rows.');
  const head = rows[0].map((x) => x.trim());
  const at = mapColumns(head);
  const kind = detectSource(head, filename);
  if (at.streams < 0 && at.earnings < 0 && at.listeners < 0) throw new Error('Couldn’t find a streams, quantity or earnings column. Download the per-song report (Spotify for Artists → Music → Songs, or your distributor’s detailed earnings report).');
  if (at.title < 0 && at.isrc < 0 && !songId) throw new Error('This file has no song column (a Spotify for Artists song timeline). Pick the song it belongs to, then import again.');
  const get = (r, k) => (at[k] >= 0 ? String(r[at[k]] ?? '').trim() : '');
  const out = [];
  for (const r of rows.slice(1)) {
    const title = get(r, 'title');
    const isrc = get(r, 'isrc');
    const song = songId ? songs.find((s) => s.id === songId) : matchSong(songs, { isrc, title });
    out.push({
      title: title || (song ? song.title : ''),
      isrc: normISRC(isrc) || '',
      store: get(r, 'store') || (kind.source === 's4a' ? 'Spotify' : ''),
      country: get(r, 'country'),
      date: toPeriod(get(r, 'date')),
      streams: toNum(get(r, 'streams')),
      listeners: toNum(get(r, 'listeners')),
      saves: toNum(get(r, 'saves')),
      earnings: toNum(get(r, 'earnings')),
      songId: song ? song.id : null,
    });
  }
  return { kind, lines: out.filter((x) => x.streams || x.earnings || x.listeners || x.saves) };
}

/**
 * Add an import to the stats, replacing an earlier import of the same file name and source
 * (so re-importing an updated export doesn't count streams twice).
 */
export function addImport(stats, { filename, kind, lines }, now = new Date().toISOString()) {
  const old = stats.imports.find((x) => x.name === filename && x.source === kind.source);
  if (old) stats.lines = stats.lines.filter((l) => l.importId !== old.id);
  stats.imports = stats.imports.filter((x) => x !== old);
  const id = mid('imp');
  stats.imports.push({ id, name: filename, source: kind.source, label: kind.label, at: now, rows: lines.length, matched: lines.filter((l) => l.songId).length });
  stats.lines.push(...lines.map((l) => ({ ...l, importId: id, source: kind.source })));
  return { replaced: !!old, id };
}
export function removeImport(stats, id) {
  stats.imports = stats.imports.filter((x) => x.id !== id);
  stats.lines = stats.lines.filter((l) => l.importId !== id);
}
/** Put an unmatched title's rows on a song (and remember the title for later imports). */
export function assignTitle(stats, title, songId) {
  const k = titleKey(title);
  for (const l of stats.lines) if (!l.songId && titleKey(l.title) === k) l.songId = songId;
}

// ---------------------------------------------------------------- live numbers
export const lastfmURL = (artist, track, key) => `https://ws.audioscrobbler.com/2.0/?${new URLSearchParams({ method: 'track.getInfo', artist, track, api_key: key, format: 'json', autocorrect: '1' })}`;
export function parseLastfm(json) {
  if (!json || json.error || !json.track) return null;
  return { listeners: +json.track.listeners || 0, plays: +json.track.playcount || 0, url: typeof json.track.url === 'string' ? json.track.url : '' };
}
export function parseDeezerRank(json) {
  if (!json || json.error || !json.id) return null;
  return { rank: +json.rank || 0, link: typeof json.link === 'string' ? json.link : '' };
}

/** Save a live number on a song, and once a day in the history (for the trend). */
export function setLive(stats, songId, source, values, now = new Date().toISOString()) {
  stats.live[songId] ||= {};
  stats.live[songId][source] = { ...values, at: now };
  const day = now.slice(0, 10);
  for (const [k, v] of Object.entries(values)) {
    if (typeof v !== 'number') continue;
    const key = `${source}.${k}`;
    const same = stats.history.find((x) => x.songId === songId && x.key === key && x.date === day);
    if (same) same.value = v;
    else stats.history.push({ date: day, songId, key, value: v });
  }
  if (stats.history.length > 3000) stats.history.splice(0, stats.history.length - 3000);
}

// ---------------------------------------------------------------- the one page
const month = (d) => (d || '').slice(0, 7);
/**
 * Every song's numbers: imported streams (Spotify for Artists and the distributor's per-store
 * rows), earnings, listeners and saves, and the live YouTube, Last.fm and Deezer numbers.
 * Spotify streams come from Spotify for Artists when imported (it's more current), else from
 * the distributor's Spotify rows; other stores come from the distributor.
 */
export function songStats(stats, songs) {
  const rows = songs.map((s) => {
    const mine = stats.lines.filter((l) => l.songId === s.id);
    const s4a = mine.filter((l) => l.source === 's4a');
    const distro = mine.filter((l) => l.source !== 's4a');
    // a Spotify for Artists Songs table is a running total (no date): keep the latest import's row
    const s4aTotalRows = s4a.filter((l) => !l.date);
    const s4aLatest = s4aTotalRows.length ? s4aTotalRows[s4aTotalRows.length - 1] : null;
    const s4aTimeline = s4a.filter((l) => l.date).reduce((a, l) => a + l.streams, 0);
    const spotifyS4A = s4aLatest ? s4aLatest.streams : s4aTimeline;
    const byStore = {};
    for (const l of distro) {
      const k = l.store || 'Other';
      byStore[k] ||= { streams: 0, earnings: 0, paid: 0 };
      byStore[k].streams += l.streams;
      byStore[k].paid += l.streams; // streams the earnings are for (the distributor's own count)
      byStore[k].earnings += l.earnings;
    }
    const spotifyKey = Object.keys(byStore).find((k) => /spotify/i.test(k));
    if (spotifyS4A) {
      if (spotifyKey) byStore[spotifyKey].streams = Math.max(byStore[spotifyKey].streams, spotifyS4A);
      else byStore.Spotify = { streams: spotifyS4A, earnings: 0, paid: 0 };
    }
    const streams = Object.values(byStore).reduce((a, x) => a + x.streams, 0);
    const earnings = Object.values(byStore).reduce((a, x) => a + x.earnings, 0);
    const monthly = {};
    for (const l of distro.length ? distro : s4a) if (l.date) monthly[month(l.date)] = (monthly[month(l.date)] || 0) + l.streams;
    const live = stats.live[s.id] || {};
    return {
      id: s.id,
      title: s.title,
      streams,
      earnings,
      listeners: s4aLatest ? s4aLatest.listeners : 0,
      saves: s4aLatest ? s4aLatest.saves : 0,
      byStore,
      monthly: Object.entries(monthly).sort((a, b) => a[0].localeCompare(b[0])),
      youtube: live.youtube || null,
      lastfm: live.lastfm || null,
      deezer: live.deezer || null,
      // earnings per stream use the distributor's own counts, which the earnings are for
      perStream: earnings ? earnings / Math.max(1, Object.values(byStore).reduce((a, x) => a + x.paid, 0)) : 0,
    };
  });
  const stores = {};
  for (const r of rows) for (const [k, v] of Object.entries(r.byStore)) {
    stores[k] ||= { streams: 0, earnings: 0, paid: 0 };
    stores[k].streams += v.streams;
    stores[k].earnings += v.earnings;
    stores[k].paid += v.paid;
  }
  const total = rows.reduce((a, r) => ({ paid: a.paid + Object.values(r.byStore).reduce((x, v) => x + v.paid, 0), streams: a.streams + r.streams, earnings: a.earnings + r.earnings, youtube: a.youtube + (r.youtube ? r.youtube.views : 0), lastfm: a.lastfm + (r.lastfm ? r.lastfm.plays : 0) }), { paid: 0, streams: 0, earnings: 0, youtube: 0, lastfm: 0 });
  const unmatched = {};
  for (const l of stats.lines) if (!l.songId && l.title) unmatched[l.title] = (unmatched[l.title] || 0) + l.streams;
  return { rows, stores: Object.entries(stores).sort((a, b) => b[1].streams - a[1].streams), total, unmatched: Object.entries(unmatched).sort((a, b) => b[1] - a[1]) };
}

/** A trend from the daily history: [{ date, value }] for one song and number. */
export const trend = (stats, songId, key) => stats.history.filter((x) => x.songId === songId && x.key === key).sort((a, b) => a.date.localeCompare(b.date)).map((x) => ({ date: x.date, value: x.value }));
