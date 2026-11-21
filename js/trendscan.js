// Refreshing the Inspiration page's trends from live data. TikTok and Instagram have no public API a web
// page can call, so this reads what can be read from the browser:
//  - YouTube Shorts in your genres from the last two weeks (YouTube Data API, with the key saved on the
//    Manager's Content page): which of the known formats show up, how many views they get, the
//    hashtags and phrases that keep coming back, and example videos;
//  - Deezer (no key): the newest additions to Deezer's own playlist for your genre (its editors keep a
//    "Metalcore" playlist current, for example), else its metal chart.
// Analysis is pure and unit tested; fetching takes `fetchFn` / `deezer` so tests can stub them.

export const TRENDS_KEY = 'pvm.trends.v1';
export const DEFAULT_TERMS = 'metalcore, post-hardcore, emo band';
export const WINDOW_DAYS = 14;
export const STALE_DAYS = 7;
const DEEZER_METAL = 464; // Deezer's Metal genre chart

/** Words in titles and descriptions that point to each known format (ids match TRENDS in inspiration.js). */
export const TREND_MATCH = {
  ifyoulike: [/\bif you (like|love|listen to)\b/, /\bfans of\b/, /\bfor fans\b/, /\bsimilar to\b/, /\bbands like\b/, /\bsounds like\b/],
  breakdown: [/\bbreakdowns?\b/, /\bheaviest\b/, /\bwait (for|till|until) (it|the)\b/, /\bthe drop\b/, /\bbeatdown\b/],
  cleanscream: [/\bcleans?\b.{0,12}\bscreams?\b/, /\bscreams?\b.{0,12}\bcleans?\b/, /\b(fry|false cord|scream) (vocals?|cover|tutorial|part)\b/, /\bvocal (switch|contrast)\b/],
  learnriff: [/\briffs?\b/, /\btabs?\b/, /\bguitar (lesson|tutorial|cover|playthrough)\b/, /\bhow to play\b/, /\bplaythrough\b/],
  onetake: [/\bone take\b/, /\bno edits?\b/, /\blive (at|in|from|session|performance)\b/, /\bin the pit\b/, /\bmosh ?pit\b/, /\bcrowd\b/],
  emo2006: [/\b200[4-9]\b/, /\bmyspace\b/, /\bemo (phase|nostalgia|kid)\b/, /\bscene kids?\b/, /\bthrowback\b/, /\bnostalgia\b/],
  tag: [/\btag (someone|your|a friend|ur)\b/, /\bsend (this|it) to\b/, /\b(pit|mosh) (friend|buddy)\b/, /\bshare (this|with)\b/],
  usesound: [/\buse (this|my|our) (sound|audio|song)\b/, /\bpls use\b/, /\bsound for your\b/, /\bthis sound\b/],
  bts: [/\bbehind the (song|scenes)\b/, /\bin the studio\b/, /\bstory behind\b/, /\bwe wrote\b/, /\bstudio (vlog|session|day)\b/, /\bbts\b/, /\bmaking of\b/],
  rate: [/\brate (this|it|the|my)\b/, /\bout of 10\b/, /\b\d+\s?\/\s?10\b/, /\bwhat'?s (your|ur) score\b/, /\b1\s?[-–]\s?10\b/],
  countdown: [/\bout (now|friday|tomorrow|this friday|next week)\b/, /\bnew (single|song|album|ep)\b/, /\bdays? (left|until|till|to go)\b/, /\bpre-?save\b/, /\bcountdown\b/],
};

const GENERIC_TAGS = new Set(['shorts', 'short', 'youtubeshorts', 'ytshorts', 'shortsvideo', 'shortvideo', 'fyp', 'foryou', 'foryoupage', 'fy', 'viral', 'viralvideo', 'trending', 'trend', 'explore', 'explorepage', 'reels', 'reel', 'tiktok', 'music', 'song', 'songs', 'subscribe', 'youtube', 'video', 'newmusic']);
const STOP = new Set('a an and are as at be but by for from has have how i if in into is it its just me my no not of on or our out so that the their them then there they this to too up us was we what when who why will with you your ur u im its official video music lyric lyrics audio visualizer full album hd 4k shorts short ft feat new'.split(' '));

// ---- YouTube
const enc = encodeURIComponent;
export const youtubeTrendURL = (q, key, after) => `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoDuration=short&order=viewCount&maxResults=25&publishedAfter=${enc(after)}&q=${enc(q)}&key=${enc(key)}`;
export const youtubeDetailsURL = (ids, key) => `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids.map(enc).join(',')}&key=${enc(key)}`;
const isVideoId = (id) => typeof id === 'string' && /^[\w-]{11}$/.test(id);
export const shortsURL = (id) => `https://www.youtube.com/shorts/${id}`;

/** "metalcore, post-hardcore" → ['metalcore #shorts', 'post-hardcore #shorts'] (up to 4). */
export function searchQueries(terms = DEFAULT_TERMS) {
  return [...new Set(String(terms || DEFAULT_TERMS).split(/[,;\n]+/).map((t) => t.trim().replace(/\s+/g, ' ')).filter(Boolean))].slice(0, 4).map((t) => `${t} #shorts`);
}

/** Video records from a videos.list response: { id, title, text, channel, views, likes, comments, published }. */
export function parseVideos(json) {
  return (json && Array.isArray(json.items) ? json.items : [])
    .filter((v) => isVideoId(v.id) && v.snippet)
    .map((v) => ({
      id: v.id,
      title: String(v.snippet.title || '').slice(0, 200),
      text: `${v.snippet.title || ''}\n${String(v.snippet.description || '').slice(0, 1500)}`,
      channel: String(v.snippet.channelTitle || '').slice(0, 80),
      channelId: String(v.snippet.channelId || ''),
      views: +(v.statistics && v.statistics.viewCount) || 0,
      likes: +(v.statistics && v.statistics.likeCount) || 0,
      comments: +(v.statistics && v.statistics.commentCount) || 0,
      published: String(v.snippet.publishedAt || ''),
    }));
}

const weight = (views) => Math.log10(1 + Math.max(0, views));

/** Which known formats show up in the videos: { [trendId]: { count, views, score, examples: [...] } }. */
export function matchFormats(videos, match = TREND_MATCH) {
  const out = {};
  for (const [id, res] of Object.entries(match)) {
    const hits = videos.filter((v) => res.some((r) => r.test(v.text.toLowerCase())));
    const top = [...hits].sort((a, b) => b.views - a.views);
    out[id] = {
      count: hits.length,
      channels: new Set(hits.map((v) => v.channelId || v.channel)).size,
      views: hits.reduce((s, v) => s + v.views, 0),
      score: +hits.reduce((s, v) => s + weight(v.views), 0).toFixed(2),
      examples: top.slice(0, 2).map((v) => ({ id: v.id, title: v.title, channel: v.channel, views: v.views })),
    };
  }
  return out;
}

/** Hashtags that keep coming back, by how many channels use them and their views: [{ tag, channels, views }]. */
export function risingHashtags(videos, { max = 15, skip = [] } = {}) {
  const own = new Set(skip.map((t) => t.toLowerCase().replace(/^#/, '')));
  const map = new Map();
  for (const v of videos) {
    const tags = new Set((v.text.match(/#[\p{L}\p{N}_]{2,40}/gu) || []).map((t) => t.slice(1).toLowerCase()));
    for (const t of tags) {
      if (GENERIC_TAGS.has(t) || own.has(t) || /^\d+$/.test(t)) continue;
      const e = map.get(t) || { tag: `#${t}`, channels: new Set(), views: 0, score: 0 };
      e.channels.add(v.channelId || v.channel);
      e.views += v.views;
      e.score += weight(v.views);
      map.set(t, e);
    }
  }
  return [...map.values()]
    .filter((e) => e.channels.size >= 2)
    .sort((a, b) => b.channels.size - a.channels.size || b.score - a.score)
    .slice(0, max)
    .map((e) => ({ tag: e.tag, channels: e.channels.size, views: e.views }));
}

/** Short phrases (2–4 words) in titles used by 3+ channels, that no known format covers: [{ text, channels, views, example }]. */
export function newPhrases(videos, { max = 8, match = TREND_MATCH, skip = [] } = {}) {
  const known = Object.values(match).flat();
  const ignore = new Set(skip.flatMap((s) => String(s).toLowerCase().split(/[^\p{L}\p{N}]+/u)).filter(Boolean));
  const map = new Map();
  for (const v of videos) {
    const words = v.title.toLowerCase().replace(/#[\p{L}\p{N}_]+/gu, ' ').split(/[^\p{L}\p{N}']+/u).filter(Boolean);
    const seen = new Set();
    for (const n of [4, 3, 2]) {
      for (let i = 0; i + n <= words.length; i++) {
        const gram = words.slice(i, i + n);
        if (STOP.has(gram[0]) || STOP.has(gram[n - 1])) continue;
        if (gram.every((w) => STOP.has(w) || ignore.has(w))) continue;
        const text = gram.join(' ');
        if (seen.has(text)) continue;
        seen.add(text);
        const e = map.get(text) || { text, channels: new Set(), views: 0, best: null };
        e.channels.add(v.channelId || v.channel);
        e.views += v.views;
        if (!e.best || v.views > e.best.views) e.best = v;
        map.set(text, e);
      }
    }
  }
  const list = [...map.values()].filter((e) => e.channels.size >= 3 && !known.some((r) => r.test(e.text)));
  list.sort((a, b) => b.channels.size - a.channels.size || b.views - a.views);
  // drop a shorter phrase that's part of a longer one already listed (or the other way round)
  const out = [];
  for (const e of list) {
    if (out.some((o) => o.text.includes(e.text) || e.text.includes(o.text))) continue;
    out.push({ text: e.text, channels: e.channels.size, views: e.views, example: { id: e.best.id, title: e.best.title, channel: e.best.channel } });
    if (out.length >= max) break;
  }
  return out;
}

// ---- Deezer
export const deezerChartURL = (genre = DEEZER_METAL, limit = 20) => `https://api.deezer.com/chart/${genre}/tracks?limit=${limit}`;
export const deezerPlaylistSearchURL = (term) => `https://api.deezer.com/search/playlist?q=${enc(term)}&limit=10`;
export const deezerPlaylistTracksURL = (id) => `https://api.deezer.com/playlist/${+id}/tracks?limit=100`;
const deezerLink = (u) => (/^https:\/\/www\.deezer\.com\/[\w/]+$/.test(u || '') ? u : '');

/** [{ title, artist, link, position, added }] from a Deezer chart or playlist tracks response. */
export function parseDeezerChart(json) {
  return (json && Array.isArray(json.data) ? json.data : [])
    .filter((t) => t && t.title && t.artist && t.artist.name)
    .map((t, i) => ({ title: String(t.title).slice(0, 120), artist: String(t.artist.name).slice(0, 80), link: deezerLink(t.link), position: +t.position || i + 1, added: +t.time_add || 0 }));
}

/** The best playlist for a genre word: one of Deezer's own editors' that matches the word, most recently updated. */
export function pickDeezerPlaylist(json, term) {
  const word = String(term || '').toLowerCase().replace(/\bband\b/, '').trim();
  const list = (json && Array.isArray(json.data) ? json.data : []).filter((p) => p && p.id && p.title && p.nb_tracks >= 20);
  const editor = (p) => /deezer/i.test((p.user && p.user.name) || '');
  const named = (p) => word && p.title.toLowerCase().includes(word);
  const ranked = list.filter((p) => editor(p) && named(p)).sort((a, b) => String(b.mod_date || '').localeCompare(String(a.mod_date || '')));
  const p = ranked[0];
  return p ? { id: p.id, title: String(p.title).slice(0, 80), link: deezerLink(p.link), editor: String(p.user.name).slice(0, 60), updated: String(p.mod_date || '').slice(0, 10) } : null;
}

/** A playlist's newest additions first. */
export const newestTracks = (tracks, max = 10) => [...tracks].sort((a, b) => b.added - a.added || a.position - b.position).slice(0, max);
/** Distinct chart artists (not you), for "bands your fans also like". */
export const chartArtists = (chart, own = '', max = 6) => [...new Set(chart.map((t) => t.artist))].filter((a) => a.toLowerCase() !== String(own).toLowerCase()).slice(0, max);

// ---- the whole refresh
/**
 * Run a refresh. Returns a scan: { fetchedAt, terms, videos, formats, hashtags, phrases, chart, notes }.
 * Without a YouTube key only the Deezer chart is read (and a note says so).
 */
export async function scanTrends({ key = '', terms = DEFAULT_TERMS, own = '', fetchFn = fetch, deezer = null, now = Date.now() } = {}) {
  const notes = [];
  const after = new Date(now - WINDOW_DAYS * 864e5).toISOString().replace(/\.\d+Z$/, 'Z');
  let videos = [];
  if (key) {
    const ids = new Set();
    for (const q of searchQueries(terms)) {
      try {
        const r = await fetchFn(youtubeTrendURL(q, key, after));
        const j = await r.json();
        if (!r.ok) {
          const reason = j && j.error && j.error.errors && j.error.errors[0] && j.error.errors[0].reason;
          notes.push(reason === 'quotaExceeded' ? 'YouTube’s daily quota for your key is used up; try again tomorrow.' : `YouTube search failed (${(j && j.error && j.error.message) || r.status}). Check the key on the Manager’s Content page.`);
          break;
        }
        for (const it of j.items || []) if (it.id && isVideoId(it.id.videoId)) ids.add(it.id.videoId);
      } catch {
        notes.push('Could not reach YouTube. Check your connection.');
        break;
      }
    }
    const list = [...ids];
    for (let i = 0; i < list.length; i += 50) {
      try {
        const r = await fetchFn(youtubeDetailsURL(list.slice(i, i + 50), key));
        if (r.ok) videos.push(...parseVideos(await r.json()));
      } catch {
        /* keep what we have */
      }
    }
    if (!videos.length && !notes.length) notes.push('YouTube found no Shorts for those words in the last two weeks. Try broader words.');
  } else notes.push('Add your YouTube API key (Manager → Content) to read what’s working on Shorts this fortnight. Only Deezer was read this time.');
  let chart = [];
  let chartSource = null;
  if (deezer) {
    try {
      // Deezer's editors' playlist for your genre, newest additions first
      for (const term of String(terms || DEFAULT_TERMS).split(/[,;\n]+/).map((t) => t.trim()).filter(Boolean).slice(0, 3)) {
        const pl = pickDeezerPlaylist(await deezer(deezerPlaylistSearchURL(term)), term);
        if (!pl) continue;
        const tracks = parseDeezerChart(await deezer(deezerPlaylistTracksURL(pl.id)));
        if (tracks.length) {
          chart = newestTracks(tracks);
          chartSource = { kind: 'playlist', ...pl };
          break;
        }
      }
      if (!chart.length) {
        chart = parseDeezerChart(await deezer(deezerChartURL())).slice(0, 10);
        if (chart.length) chartSource = { kind: 'chart', title: 'Metal chart', link: 'https://www.deezer.com/en/channels/metal' };
      }
    } catch {
      /* optional */
    }
    if (!chart.length) notes.push('Deezer could not be read this time.');
  }
  const ownTags = String(own || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return {
    fetchedAt: now,
    terms: String(terms || DEFAULT_TERMS),
    videos: videos.length,
    channels: new Set(videos.map((v) => v.channelId || v.channel)).size,
    formats: matchFormats(videos),
    hashtags: risingHashtags(videos, { skip: ownTags ? [ownTags] : [] }),
    phrases: newPhrases(videos, { skip: [terms] }),
    chart: chart.slice(0, 10),
    chartSource,
    notes,
  };
}

/**
 * Known trends ranked by the scan, hottest first: [{ trend, heat: 'hot' | 'rising' | 'quiet' | null, stat }].
 * Without a scan (or one with no videos) the original order is kept and heat is null.
 */
export function rankTrends(trends, scan) {
  if (!scan || !scan.videos) return trends.map((trend) => ({ trend, heat: null, stat: null }));
  const rows = trends.map((trend, i) => ({ trend, i, stat: (scan.formats || {})[trend.id] || { count: 0, score: 0, views: 0, examples: [] } }));
  rows.sort((a, b) => b.stat.score - a.stat.score || a.i - b.i);
  const top = rows.filter((r) => r.stat.count).slice(0, 3).map((r) => r.trend.id);
  return rows.map(({ trend, stat }) => ({ trend, stat, heat: !stat.count ? 'quiet' : top.includes(trend.id) && stat.channels >= 2 ? 'hot' : 'rising' }));
}

/** Template ids of the hottest formats, for the Suggested edits (best first). */
export function hotTemplates(trends, scan, max = 3) {
  return rankTrends(trends, scan).filter((r) => r.heat === 'hot').map((r) => r.trend.recipe && r.trend.recipe.template).filter(Boolean).filter((t, i, a) => a.indexOf(t) === i).slice(0, max);
}

/** Days since the scan (fractional), or Infinity. */
export const scanAge = (scan, now = Date.now()) => (scan && scan.fetchedAt ? (now - scan.fetchedAt) / 864e5 : Infinity);
export const isStale = (scan, now = Date.now()) => scanAge(scan, now) > STALE_DAYS;

/** "2 hours ago", "yesterday", "5 days ago". */
export function ago(ts, now = Date.now()) {
  const m = Math.max(0, Math.floor((now - ts) / 6e4));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const hrs = Math.round(m / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const d = Math.round(hrs / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export function loadScan(storage = globalThis.localStorage) {
  try {
    const s = JSON.parse(storage.getItem(TRENDS_KEY));
    return s && typeof s.fetchedAt === 'number' && s.formats ? s : null;
  } catch {
    return null;
  }
}
export function saveScan(scan, storage = globalThis.localStorage) {
  try {
    storage.setItem(TRENDS_KEY, JSON.stringify(scan));
    return true;
  } catch {
    return false;
  }
}

/** Short view counts: 1234 → 1.2k, 2500000 → 2.5M. */
export const shortNum = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : String(n || 0));
