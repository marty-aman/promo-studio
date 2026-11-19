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
    frame.srcdoc = `<!doctype html><script>function cb(d){parent.postMessage({n:${n},d:d},'*')}</script><script src="${deezerURL(id)}?output=jsonp&callback=cb" onerror="parent.postMessage({n:${n},d:null},'*')"></script>`;
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
    getJSON(musicBrainzURL(isrc), { headers: { Accept: 'application/json' } }).then(parseMusicBrainz).catch(() => (notes.push('MusicBrainz didn’t answer.'), null)),
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
