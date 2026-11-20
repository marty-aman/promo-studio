// Find a song's streaming links from its ISRC. Sources, all called from the browser:
//  - MusicBrainz (ISRC → title, artist, length, and any streaming links people have added)
//  - Deezer (exact ISRC lookup; Deezer has no CORS, so its JSONP runs in a sandboxed iframe that
//    can't reach this app's data and only posts the JSON back)
//  - Spotify (exact `isrc:` search; needs your own free Spotify app's client ID and secret)
//  - iTunes Search (Apple Music, matched by artist, title and length)
//  - YouTube Data API (best video for "artist title", with the YouTube key from the Content page)
// Everything else gets a search link. Parsing is pure and unit tested; fetchers take `fetch`.

export const LINK_KEYS = [
  ['spotify', 'Spotify'],
  ['apple', 'Apple Music'],
  ['youtube', 'YouTube'],
  ['youtubeMusic', 'YouTube Music'],
  ['deezer', 'Deezer'],
  ['tidal', 'Tidal'],
  ['amazon', 'Amazon Music'],
  ['soundcloud', 'SoundCloud'],
  ['bandcamp', 'Bandcamp'],
];
export const linkLabel = (k) => (LINK_KEYS.find(([v]) => v === k) || [k, k])[1];

/** "us-um7-17-03861" → "USUM71703861"; null when it isn't an ISRC (CC-XXX-YY-NNNNN). */
export function normISRC(raw) {
  const s = String(raw || '').toUpperCase().replace(/[\s-]+/g, '');
  return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(s) ? s : null;
}
export const prettyISRC = (s) => (s && s.length === 12 ? `${s.slice(0, 2)}-${s.slice(2, 5)}-${s.slice(5, 7)}-${s.slice(7)}` : s || '');

/** Which link field an outside URL belongs to (https and known hosts only), or null. */
export function platformOf(raw) {
  let u;
  try {
    u = new URL(String(raw || ''));
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.replace(/^www\./, '');
  if (host === 'open.spotify.com') return 'spotify';
  if (host === 'music.apple.com' || host === 'itunes.apple.com') return 'apple';
  if (host === 'music.youtube.com') return 'youtubeMusic';
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') return 'youtube';
  if (host === 'deezer.com' || host === 'deezer.page.link') return 'deezer';
  if (host === 'tidal.com' || host === 'listen.tidal.com') return 'tidal';
  if (/^music\.amazon\.[a-z.]+$/.test(host)) return 'amazon';
  if (host === 'soundcloud.com') return 'soundcloud';
  if (host === 'bandcamp.com' || host.endsWith('.bandcamp.com')) return 'bandcamp';
  return null;
}
const httpsOf = (url) => String(url).replace(/^http:/, 'https:');

/** A found link: { key, url, how: 'isrc' | 'match' | 'search', source }. */
const found = (key, url, how, source) => ({ key, url: httpsOf(url), how, source });

// ---- MusicBrainz
export const musicBrainzURL = (isrc) => `https://musicbrainz.org/ws/2/isrc/${isrc}?inc=url-rels+artist-credits+releases&fmt=json`;
/** { title, artist, ms, date, links[] } from a MusicBrainz ISRC response, or null. */
export function parseMusicBrainz(json) {
  const recs = Array.isArray(json?.recordings) ? json.recordings : [];
  if (!recs.length) return null;
  const r = recs[0];
  const artist = (r['artist-credit'] || []).map((c) => `${c.name || c.artist?.name || ''}${c.joinphrase || ''}`).join('').trim();
  const links = [];
  for (const rec of recs) {
    for (const rel of rec.relations || []) {
      const url = rel.url?.resource;
      const key = platformOf(url);
      if (key && !links.some((l) => l.key === key)) links.push(found(key, url, 'isrc', 'MusicBrainz'));
    }
  }
  return { title: String(r.title || ''), artist, ms: +r.length || 0, date: String(r['first-release-date'] || ''), links };
}

// ---- Deezer
export const deezerURL = (isrc) => `https://api.deezer.com/2.0/track/isrc:${isrc}`;
export function parseDeezer(json) {
  if (!json || json.error || !json.id || !json.link) return null;
  if (platformOf(json.link) !== 'deezer') return null;
  return { title: String(json.title || ''), artist: String(json.artist?.name || ''), ms: (+json.duration || 0) * 1000, date: String(json.release_date || ''), cover: typeof json.album?.cover_xl === 'string' ? json.album.cover_xl : '', link: found('deezer', json.link, 'isrc', 'Deezer') };
}

/**
 * Deezer's track-by-ISRC, run as JSONP inside a sandboxed iframe (scripts only, no same-origin),
 * so Deezer's script can't read this app's storage. Resolves the parsed JSON, or null.
 */
export function deezerByISRC(isrc, { timeout = 12000 } = {}) {
  const id = normISRC(isrc);
  if (!id || typeof document === 'undefined') return Promise.resolve(null);
  return deezerJSONP(deezerURL(id), { timeout });
}

/**
 * Any Deezer API URL as JSONP inside a sandboxed iframe (scripts only, no same-origin), so
 * Deezer's script can't read this app's storage. Resolves the JSON, or null.
 */
export function deezerJSONP(url, { timeout = 12000 } = {}) {
  if (typeof document === 'undefined' || !/^https:\/\/api\.deezer\.com\//.test(url)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const nonce = Math.random().toString(36).slice(2);
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.display = 'none';
    const done = (v) => {
      window.removeEventListener('message', onMsg);
      clearTimeout(timer);
      frame.remove();
      resolve(v);
    };
    const onMsg = (e) => {
      if (e.source !== frame.contentWindow || !e.data || e.data.n !== nonce) return;
      done(e.data.d && typeof e.data.d === 'object' ? e.data.d : null);
    };
    const timer = setTimeout(() => done(null), timeout);
    window.addEventListener('message', onMsg);
    const n = JSON.stringify(nonce);
    frame.srcdoc = `<!doctype html><script>function cb(d){parent.postMessage({n:${n},d:d},'*')}</script><script src="${url}${url.includes('?') ? '&' : '?'}output=jsonp&callback=cb" onerror="parent.postMessage({n:${n},d:null},'*')"></script>`;
    document.body.append(frame);
  });
}

// ---- Spotify (client credentials)
export const spotifySearchURL = (isrc) => `https://api.spotify.com/v1/search?type=track&limit=1&q=${encodeURIComponent(`isrc:${isrc}`)}`;
export function parseSpotify(json) {
  const t = json?.tracks?.items?.[0];
  const url = t?.external_urls?.spotify;
  if (!t || platformOf(url) !== 'spotify') return null;
  return { title: String(t.name || ''), artist: (t.artists || []).map((a) => a.name).join(', '), ms: +t.duration_ms || 0, link: found('spotify', url, 'isrc', 'Spotify') };
}
let spotifyToken = null;
export async function spotifyByISRC(isrc, { clientId, clientSecret, fetchFn = fetch } = {}) {
  if (!clientId || !clientSecret) return null;
  if (!spotifyToken || spotifyToken.until < Date.now() || spotifyToken.id !== clientId) {
    const res = await fetchFn('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) throw new Error('Spotify didn’t accept the client ID and secret.');
    const j = await res.json();
    spotifyToken = { id: clientId, token: j.access_token, until: Date.now() + ((+j.expires_in || 3600) - 60) * 1000 };
  }
  const res = await fetchFn(spotifySearchURL(isrc), { headers: { Authorization: `Bearer ${spotifyToken.token}` } });
  if (!res.ok) throw new Error(`Spotify search failed (${res.status}).`);
  return parseSpotify(await res.json());
}

// ---- iTunes / Apple Music (no ISRC lookup, so match by name and length)
const simple = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\(.*?\)|\[.*?\]|feat\..*$/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export const itunesURL = (artist, title, country = 'us') => `https://itunes.apple.com/search?entity=song&limit=10&country=${country}&term=${encodeURIComponent(`${artist} ${title}`)}`;
/** The iTunes result with the same title and artist (and length within 4 s when known). */
export function pickITunes(json, { title, artist, ms = 0 }) {
  const t = simple(title);
  const a = simple(artist).split(' ')[0];
  const hit = (json?.results || []).find((r) => simple(r.trackName) === t && simple(r.artistName).includes(a) && (!ms || !r.trackTimeMillis || Math.abs(r.trackTimeMillis - ms) < 4000));
  if (!hit || platformOf(hit.trackViewUrl) !== 'apple') return null;
  return found('apple', hit.trackViewUrl.replace(/[?&]uo=\d+/, ''), 'match', 'Apple (title and length)');
}

// ---- YouTube
export const youtubeSearchAPI = (q, key) => `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&q=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`;
/** Prefer the artist's own upload or "Artist - Topic" auto channel; otherwise null. */
export function pickYouTube(json, { title, artist }) {
  const a = simple(artist);
  const t = simple(title);
  const items = (json?.items || []).filter((i) => i.id?.videoId && /^[\w-]{11}$/.test(i.id.videoId));
  const ok = (i) => simple(i.snippet?.title).includes(t) && (simple(i.snippet?.channelTitle).startsWith(a) || simple(i.snippet?.channelTitle) === `${a} topic`);
  const hit = items.find(ok);
  return hit ? found('youtube', `https://www.youtube.com/watch?v=${hit.id.videoId}`, 'match', `YouTube (${hit.snippet.channelTitle})`) : null;
}

/** Search links for every platform still missing. */
export function searchLinks({ title, artist }, have = []) {
  const q = encodeURIComponent(`${artist} ${title}`.trim());
  const urls = {
    spotify: `https://open.spotify.com/search/${q}`,
    apple: `https://music.apple.com/us/search?term=${q}`,
    youtube: `https://www.youtube.com/results?search_query=${q}`,
    youtubeMusic: `https://music.youtube.com/search?q=${q}`,
    deezer: `https://www.deezer.com/search/${q}`,
    tidal: `https://tidal.com/search?q=${q}`,
    amazon: `https://music.amazon.com/search/${q}`,
    soundcloud: `https://soundcloud.com/search?q=${q}`,
    bandcamp: `https://bandcamp.com/search?q=${q}`,
  };
  return LINK_KEYS.filter(([k]) => !have.includes(k)).map(([k]) => found(k, urls[k], 'search', 'Search'));
}

/** Combine finds: the first exact or matched link per platform wins; search links fill the rest. */
export function mergeLinks(lists, meta) {
  const out = [];
  for (const l of lists.flat().filter(Boolean)) if (!out.some((x) => x.key === l.key)) out.push(l);
  out.push(...searchLinks(meta, out.map((l) => l.key)));
  const order = Object.fromEntries(LINK_KEYS.map(([k], i) => [k, i]));
  return out.sort((x, y) => order[x.key] - order[y.key]);
}

/**
 * Look a song up by ISRC. Returns { isrc, title, artist, ms, cover, links, notes } or throws
 * when the ISRC isn't valid. Each source that fails is skipped with a note.
 */
export async function lookupISRC(raw, { fetchFn = fetch, deezer = deezerByISRC, spotify = {}, youtubeKey = '', fallback = {} } = {}) {
  const isrc = normISRC(raw);
  if (!isrc) throw new Error('That isn’t an ISRC. It looks like CC-XXX-YY-NNNNN (12 letters and numbers).');
  const notes = [];
  const getJSON = async (url, init) => {
    const res = await fetchFn(url, init);
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  };
  const [mb, dz, sp] = await Promise.all([
    getJSON(musicBrainzURL(isrc), { headers: { Accept: 'application/json' } })
      .catch(() => new Promise((r) => setTimeout(r, 1200)).then(() => getJSON(musicBrainzURL(isrc), { headers: { Accept: 'application/json' } }))) // MusicBrainz rate-limits: one retry
      .then(parseMusicBrainz)
      .catch(() => (notes.push('MusicBrainz didn’t answer. Try again in a moment.'), null)),
    deezer(isrc).then(parseDeezer).catch(() => null),
    spotifyByISRC(isrc, { ...spotify, fetchFn }).catch((e) => (notes.push(e.message), null)),
  ]);
  const meta = {
    title: dz?.title || sp?.title || mb?.title || fallback.title || '',
    artist: dz?.artist || sp?.artist || mb?.artist || fallback.artist || '',
    ms: dz?.ms || sp?.ms || mb?.ms || 0,
  };
  if (!mb && !dz && !sp) notes.push('No service knows this ISRC yet. New releases can take a few days after release day to show up.');
  const extra = [];
  if (meta.title && meta.artist) {
    const [ap, yt] = await Promise.all([
      getJSON(itunesURL(meta.artist, meta.title)).then((j) => pickITunes(j, meta)).catch(() => null),
      youtubeKey ? getJSON(youtubeSearchAPI(`${meta.artist} ${meta.title}`, youtubeKey)).then((j) => pickYouTube(j, meta)).catch(() => (notes.push('YouTube search failed (check the key on the Content page).'), null)) : null,
    ]);
    extra.push(ap, yt);
  }
  if (!spotify.clientId) notes.push('Add a Spotify client ID and secret below for an exact Spotify match.');
  const links = mergeLinks([sp?.link, dz?.link, mb?.links || [], extra], meta);
  return { isrc, ...meta, cover: dz?.cover || '', links, notes };
}

// ---------------------------------------------------------------- UPC: a whole release
// A UPC (or EAN) is the barcode of a release: a single, an EP or an album. Looking one up gives
// the release (title, artist, date, cover, album links) and its tracklist, each track with its
// ISRC when the service has it, so each song can then find its own links.
//  - Deezer: album by UPC, then each track for its ISRC (JSONP in the sandboxed iframe)
//  - MusicBrainz: release by barcode, with recordings and their ISRCs
//  - iTunes: the album and its songs by UPC (Apple Music links)

/** "0 602557 382549" → "602557382549"; null unless it's 12 or 13 digits (UPC-A or EAN-13). */
export function normUPC(raw) {
  const s = String(raw || '').replace(/[\s-]+/g, '');
  return /^\d{12,13}$/.test(s) ? s : null;
}

export const deezerAlbumURL = (upc) => `https://api.deezer.com/album/upc:${upc}`;
export const deezerTrackURL = (id) => `https://api.deezer.com/track/${encodeURIComponent(id)}`;
export function parseDeezerAlbum(json) {
  if (!json || json.error || !json.id) return null;
  const link = platformOf(json.link) === 'deezer' ? found('deezer', json.link, 'upc', 'Deezer') : null;
  return {
    title: String(json.title || ''),
    artist: String(json.artist?.name || ''),
    date: /^\d{4}-\d{2}-\d{2}$/.test(json.release_date || '') ? json.release_date : '',
    type: ['single', 'ep', 'album', 'compile'].includes(json.record_type) ? (json.record_type === 'compile' ? 'comp' : json.record_type) : '',
    label: String(json.label || ''),
    cover: typeof json.cover_xl === 'string' ? json.cover_xl : '',
    link,
    tracks: ((json.tracks && json.tracks.data) || []).map((t, i) => ({ n: i + 1, id: String(t.id || ''), title: String(t.title || ''), ms: (+t.duration || 0) * 1000, isrc: normISRC(t.isrc) || '', link: platformOf(t.link) === 'deezer' ? found('deezer', t.link, 'upc', 'Deezer') : null })),
  };
}

export const musicBrainzBarcodeURL = (upc) => `https://musicbrainz.org/ws/2/release/?query=barcode:${upc}&limit=3&fmt=json`;
export const musicBrainzReleaseURL = (id) => `https://musicbrainz.org/ws/2/release/${encodeURIComponent(id)}?inc=recordings+isrcs+artist-credits+url-rels&fmt=json`;
/** The best release id from a barcode search (an exact barcode, highest score). */
export function pickMBRelease(json, upc) {
  const list = (json && json.releases) || [];
  const exact = list.filter((r) => String(r.barcode || '').replace(/^0+/, '') === String(upc).replace(/^0+/, ''));
  return (exact[0] || null)?.id || null;
}
export function parseMBRelease(json) {
  if (!json || !json.id) return null;
  const tracks = (json.media || []).flatMap((m) => m.tracks || []).map((t, i) => ({
    n: i + 1,
    title: String(t.title || t.recording?.title || ''),
    ms: +t.length || +t.recording?.length || 0,
    isrc: normISRC((t.recording?.isrcs || [])[0]) || '',
    link: null,
  }));
  const links = (json.relations || []).map((r) => r.url && r.url.resource).filter(Boolean).map((u) => platformOf(u) && found(platformOf(u), u, 'upc', 'MusicBrainz')).filter(Boolean);
  return { title: String(json.title || ''), artist: (json['artist-credit'] || []).map((a) => a.name + (a.joinphrase || '')).join('').trim(), date: /^\d{4}-\d{2}-\d{2}$/.test(json.date || '') ? json.date : '', links, tracks };
}

export const itunesUPCURL = (upc) => `https://itunes.apple.com/lookup?upc=${upc}&entity=song`;
export function parseITunesUPC(json) {
  const res = (json && json.results) || [];
  const album = res.find((r) => r.wrapperType === 'collection');
  if (!album) return null;
  const songs = res.filter((r) => r.wrapperType === 'track').sort((a, b) => (a.discNumber || 1) - (b.discNumber || 1) || (a.trackNumber || 0) - (b.trackNumber || 0));
  const url = (u) => (platformOf(u) === 'apple' ? u : null);
  return {
    title: String(album.collectionName || ''),
    artist: String(album.artistName || ''),
    date: String(album.releaseDate || '').slice(0, 10),
    link: url(album.collectionViewUrl) ? found('apple', album.collectionViewUrl, 'upc', 'Apple Music') : null,
    cover: typeof album.artworkUrl100 === 'string' ? album.artworkUrl100.replace(/100x100bb/, '3000x3000bb') : '',
    tracks: songs.map((t, i) => ({ n: i + 1, title: String(t.trackName || ''), ms: +t.trackTimeMillis || 0, isrc: '', link: url(t.trackViewUrl) ? found('apple', t.trackViewUrl, 'upc', 'Apple Music') : null })),
  };
}

/** Song titles compared loosely (case, punctuation, "(feat. …)", " - Remastered"). */
const tkey = (t) => String(t || '').toLowerCase().replace(/\s*[([].*?(feat|ft|with|remaster|version|edit|mix).*?[)\]]/g, '').replace(/\s+-\s+.*$/, '').replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Merge what the services said: Deezer's tracklist first (it has the ISRCs after the per-track
 * step), MusicBrainz and iTunes fill in titles, lengths, ISRCs and links, matched by position
 * when the lists are the same length, else by title.
 */
export function mergeRelease(upc, { dz = null, mb = null, it = null } = {}) {
  const base = dz || mb || it;
  if (!base) return null;
  const lists = [dz, mb, it].filter(Boolean);
  const tracks = base.tracks.map((t) => ({ ...t, links: t.link ? [t.link] : [] }));
  for (const other of lists.filter((l) => l !== base)) {
    const samePos = other.tracks.length === tracks.length;
    other.tracks.forEach((o, i) => {
      const t = samePos && (!o.title || tkey(o.title) === tkey(tracks[i].title) || !tracks[i].title) ? tracks[i] : tracks.find((x) => tkey(x.title) === tkey(o.title));
      if (!t) return;
      t.isrc ||= o.isrc;
      t.ms ||= o.ms;
      t.title ||= o.title;
      if (o.link && !t.links.some((l) => l.key === o.link.key)) t.links.push(o.link);
    });
  }
  const links = [dz?.link, it?.link, ...(mb?.links || [])].filter(Boolean).filter((l, i, a) => a.findIndex((x) => x.key === l.key) === i);
  return {
    upc,
    title: dz?.title || it?.title || mb?.title || '',
    artist: dz?.artist || it?.artist || mb?.artist || '',
    date: dz?.date || mb?.date || it?.date || '',
    type: dz?.type || (tracks.length === 1 ? 'single' : tracks.length <= 6 ? 'ep' : 'album'),
    label: dz?.label || '',
    cover: dz?.cover || it?.cover || '',
    links,
    tracks,
  };
}

/** The found track that is this song (by title), or null. */
export const matchTrack = (tracks, title) => (tracks || []).find((t) => tkey(t.title) === tkey(title)) || null;

/**
 * Look a release up by UPC. Returns the merged release (see mergeRelease) with `notes`, or
 * throws when the UPC isn't valid or no service knows it.
 */
export async function lookupUPC(raw, { fetchFn = fetch, deezer = deezerJSONP, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const upc = normUPC(raw);
  if (!upc) throw new Error('That isn’t a UPC. It’s the release’s barcode number: 12 or 13 digits.');
  const notes = [];
  const getJSON = async (url) => {
    const res = await fetchFn(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  };
  const mbFetch = async () => {
    const id = pickMBRelease(await getJSON(musicBrainzBarcodeURL(upc)), upc);
    if (!id) return null;
    await wait(1100); // MusicBrainz allows one request a second
    return parseMBRelease(await getJSON(musicBrainzReleaseURL(id)));
  };
  const [dz, mb, it] = await Promise.all([
    deezer(deezerAlbumURL(upc)).then(parseDeezerAlbum).catch(() => null),
    mbFetch().catch(() => (notes.push('MusicBrainz didn’t answer (it’s often busy). Try again in a moment for its ISRCs.'), null)),
    getJSON(itunesUPCURL(upc)).then(parseITunesUPC).catch(() => null),
  ]);
  // Deezer's album list has no ISRCs: ask for each track (a handful of quick requests)
  if (dz) {
    for (const t of dz.tracks.slice(0, 40)) {
      if (t.isrc || !t.id) continue;
      const j = await deezer(deezerTrackURL(t.id)).catch(() => null);
      if (j && normISRC(j.isrc)) t.isrc = normISRC(j.isrc);
    }
  }
  const rel = mergeRelease(upc, { dz, mb, it });
  if (!rel) throw new Error('No service knows this UPC yet. New releases can take a few days after release day to show up, and some distributors list a different barcode.');
  if (rel.tracks.some((t) => !t.isrc)) notes.push('Some tracks have no ISRC listed; your distributor shows them next to each track.');
  return { ...rel, notes };
}
