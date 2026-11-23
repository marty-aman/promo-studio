// Content: post links, their stats and which kinds of post work best. YouTube stats are fetched
// with a YouTube Data API key; TikTok and Instagram only share stats with approved apps, so those
// are typed in (or imported from the app's CSV export). Pure functions, unit tested.
import { TRENDS } from '../inspiration.js';
import { parseDate } from './model.js';

export const FORMATS = [
  ...TRENDS.map((t) => [t.id, t.title.replace(/[“”]/g, '')]),
  ['mvclip', 'Music video clip'],
  ['lyric', 'Lyric video'],
  ['live', 'Live clip'],
  ['other', 'Other'],
];
export const formatLabel = (id) => (FORMATS.find(([k]) => k === id) || [id, 'Other'])[1];
export const PLATFORMS = ['TikTok', 'Reels', 'Shorts', 'YouTube', 'Facebook', 'X', 'Other'];

/** Which app a link is from, and the video id when it has one. */
export function parseLink(raw) {
  let u;
  try {
    u = new URL(String(raw || '').trim());
  } catch {
    return { platform: '', id: '' };
  }
  const host = u.hostname.replace(/^(www|m)\./, '');
  if (host === 'youtu.be') return { platform: 'YouTube', id: u.pathname.slice(1).split('/')[0] };
  if (host.endsWith('youtube.com')) {
    const m = /^\/(shorts|live|embed)\/([\w-]{6,})/.exec(u.pathname);
    if (m) return { platform: m[1] === 'shorts' ? 'Shorts' : 'YouTube', id: m[2] };
    return { platform: 'YouTube', id: u.searchParams.get('v') || '' };
  }
  if (host.endsWith('tiktok.com')) return { platform: 'TikTok', id: (/\/video\/(\d+)/.exec(u.pathname) || [])[1] || '' };
  if (host.endsWith('instagram.com')) return { platform: 'Reels', id: (/\/(reel|reels|p)\/([\w-]+)/.exec(u.pathname) || [])[2] || '' };
  if (host.endsWith('facebook.com') || host === 'fb.watch') return { platform: 'Facebook', id: '' };
  return { platform: 'Other', id: '' };
}
export const isYouTube = (url) => {
  const p = parseLink(url);
  return (p.platform === 'YouTube' || p.platform === 'Shorts') && /^[\w-]{11}$/.test(p.id);
};

/** ISO 8601 duration (PT1M5S) to seconds. */
export function isoDuration(s) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(s || '');
  return m ? (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0) : 0;
}

export const youtubeStatsUrl = (ids, key) => `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${ids.map(encodeURIComponent).join(',')}&key=${encodeURIComponent(key)}`;

/** The YouTube API answer as { [videoId]: stats }. */
export function parseYouTube(json, now = new Date().toISOString()) {
  const out = {};
  for (const it of (json && json.items) || []) {
    const s = it.statistics || {};
    out[it.id] = {
      views: +s.viewCount || 0,
      likes: +s.likeCount || 0,
      comments: +s.commentCount || 0,
      shares: null,
      saves: null,
      length: isoDuration(it.contentDetails && it.contentDetails.duration),
      title: (it.snippet && it.snippet.title) || '',
      publishedAt: ((it.snippet && it.snippet.publishedAt) || '').slice(0, 10),
      source: 'youtube',
      fetchedAt: now,
    };
  }
  return out;
}

export async function fetchYouTubeStats(ids, key, fetchImpl = fetch) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const res = await fetchImpl(youtubeStatsUrl(ids.slice(i, i + 50), key));
    if (res.status === 400 || res.status === 403) {
      const j = await res.json().catch(() => ({}));
      const why = (j.error && j.error.errors && j.error.errors[0] && j.error.errors[0].reason) || '';
      throw new Error(why === 'quotaExceeded' ? 'The YouTube API quota for this key is used up for today.' : 'YouTube refused the API key. Check it, and that “YouTube Data API v3” is enabled for it.');
    }
    if (!res.ok) throw new Error(`YouTube stats failed (${res.status})`);
    Object.assign(out, parseYouTube(await res.json()));
  }
  return out;
}

// ---- engagement

const n = (v) => (v == null || v === '' || Number.isNaN(+v) ? null : +v);
/**
 * Per-post numbers: engagement = (likes + comments + shares + saves) / views; shares and saves per
 * 1,000 views, since both apps weight sends and saves above likes; watched = average watch / length.
 */
export function postMetrics(stats) {
  if (!stats) return null;
  const views = n(stats.views);
  if (!views) return null;
  const sum = ['likes', 'comments', 'shares', 'saves'].reduce((s, k) => s + (n(stats[k]) || 0), 0);
  const per1k = (k) => (n(stats[k]) == null ? null : (1000 * n(stats[k])) / views);
  const watched = n(stats.avgWatch) && n(stats.length) ? Math.min(1, n(stats.avgWatch) / n(stats.length)) : null;
  // a single score for ranking: sends and saves count most, then comments, then likes
  const score = ((n(stats.shares) || 0) * 4 + (n(stats.saves) || 0) * 3 + (n(stats.comments) || 0) * 2 + (n(stats.likes) || 0)) / views;
  return { views, engagement: sum / views, sharesPer1k: per1k('shares'), savesPer1k: per1k('saves'), commentsPer1k: per1k('comments'), watched, score };
}

const median = (xs) => {
  const s = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (!s.length) return null;
  const k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};
const mean = (xs) => {
  const s = xs.filter((x) => x != null);
  return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
};
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const lengthBucket = (s) => (!s ? null : s <= 10 ? 'Up to 10 s' : s <= 20 ? '11–20 s' : s <= 45 ? '21–45 s' : 'Over 45 s');

/** The key a post is grouped by, for each way of comparing. */
export const GROUPINGS = {
  format: { label: 'Type of post', key: (p) => formatLabel(p.format || 'other') },
  platform: { label: 'App', key: (p) => p.platform || 'Other' },
  weekday: { label: 'Day posted', key: (p) => (parseDate(p.date) ? WEEKDAYS[parseDate(p.date).getDay()] : null) },
  length: { label: 'Length', key: (p) => lengthBucket(p.stats && n(p.stats.length)) },
  // a post of a deleted song keeps its title (deleteSong), so its stats still count for that song
  song: { label: 'Song', key: (p, { songs = [] } = {}) => (songs.find((s) => s.id === p.songId) || {}).title || p.songTitle || null },
  hashtag: { label: 'Hashtag', key: (p) => hashtags(p) },
};

/** The #hashtags in a post's title, hook and idea, lower-cased and once each (a post can be in several groups). */
export function hashtags(p) {
  const text = [p && p.title, p && p.hook, p && p.idea].filter((x) => typeof x === 'string').join(' ');
  return [...new Set([...text.matchAll(/(^|[^\p{L}\p{N}_&])#([\p{L}\p{N}_]{2,40})/gu)].map((x) => `#${x[2].toLowerCase()}`))];
}

/**
 * Posts with stats grouped and ranked: [{ key, n, views, engagement, sharesPer1k, savesPer1k, watched, score }].
 * `opts.songs` names the songs for the Song grouping. A grouping key may be a list (hashtags).
 */
export function compare(posts, by = 'format', opts = {}) {
  const g = GROUPINGS[by] || GROUPINGS.format;
  const groups = new Map();
  for (const p of posts) {
    const mt = postMetrics(p.stats);
    const raw = mt && g.key(p, opts);
    for (const k of Array.isArray(raw) ? raw : [raw]) {
      if (!k) continue;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(mt);
    }
  }
  return [...groups].map(([key, ms]) => ({
    key,
    n: ms.length,
    views: median(ms.map((m) => m.views)),
    engagement: mean(ms.map((m) => m.engagement)),
    sharesPer1k: mean(ms.map((m) => m.sharesPer1k)),
    savesPer1k: mean(ms.map((m) => m.savesPer1k)),
    watched: mean(ms.map((m) => m.watched)),
    score: mean(ms.map((m) => m.score)),
  })).sort((a, b) => b.score - a.score || b.views - a.views);
}

/** Plain-language findings for the top of the page (and Home). */
export function findings(posts) {
  const withStats = posts.filter((p) => postMetrics(p.stats));
  if (withStats.length < 3) return { ready: false, count: withStats.length, lines: [] };
  const lines = [];
  const fmt = compare(withStats, 'format').filter((g) => g.n >= 1);
  if (fmt.length >= 2) {
    const [a] = fmt;
    const rest = fmt.slice(1);
    const avg = mean(rest.map((g) => g.score));
    const x = avg ? a.score / avg : null;
    lines.push({ kind: 'best', text: `${a.key} works best: ${x && x >= 1.15 ? `${x.toFixed(1)}× the shares, saves and comments per view of your other posts` : 'the most interaction per view'}${a.n < 3 ? ` (only ${a.n} post${a.n > 1 ? 's' : ''} so far)` : ''}.` });
    const worst = fmt[fmt.length - 1];
    if (fmt.length >= 3 && worst.n >= 2) lines.push({ kind: 'worst', text: `${worst.key} does least well so far (${worst.n} posts). Try a stronger hook in the first second, or post it less.` });
  }
  const byViews = [...withStats].sort((p, q) => postMetrics(q.stats).views - postMetrics(p.stats).views);
  const top = byViews[0];
  const name = top.title || formatLabel(top.format);
  lines.push({ kind: 'top', text: `Most viewed: ${/^[“"]/.test(name) ? name : `“${name}”`} with ${postMetrics(top.stats).views.toLocaleString()} views on ${top.platform || 'its app'}.`, postId: top.id });
  const plat = compare(withStats, 'platform');
  if (plat.length >= 2) lines.push({ kind: 'platform', text: `${plat[0].key} gets the most interaction per view; ${plat[plat.length - 1].key} the least.` });
  const day = compare(withStats, 'weekday').filter((g) => g.n >= 2);
  if (day.length >= 2) lines.push({ kind: 'day', text: `${day[0].key} posts have done best so far.` });
  const len = compare(withStats, 'length').filter((g) => g.n >= 2);
  if (len.length >= 2) lines.push({ kind: 'length', text: `${len[0].key} videos hold up best.` });
  return { ready: true, count: withStats.length, lines };
}

/** Fewer posts with stats than this in a month and the summary says it's only a hint. */
export const SMALL_SAMPLE = 5;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * The best of the posts dated in today's calendar month (with stats): { month, label, n, small, top, type, song,
 * tag, lines }. `type`/`song`/`tag` are the leading compare() group (with its own n) or null when there is
 * nothing to compare (fewer than 2 groups). `lines` say it in words, always with how many posts it rests on.
 */
export function bestThisMonth(posts, today, songs = []) {
  const month = String(today || '').slice(0, 7);
  const label = /^\d{4}-\d{2}$/.test(month) ? `${MONTHS[+month.slice(5) - 1]} ${month.slice(0, 4)}` : '';
  const inMonth = (posts || []).filter((p) => p && typeof p.date === 'string' && p.date.slice(0, 7) === month && postMetrics(p.stats));
  const nPosts = inMonth.length;
  const lead = (by) => {
    const g = compare(inMonth, by, { songs });
    return g.length >= 2 ? g[0] : null;
  };
  const top = nPosts ? [...inMonth].sort((a, b) => postMetrics(b.stats).score - postMetrics(a.stats).score || postMetrics(b.stats).views - postMetrics(a.stats).views)[0] : null;
  const res = { month, label, n: nPosts, small: nPosts < SMALL_SAMPLE, top, type: lead('format'), song: lead('song'), tag: lead('hashtag'), lines: [] };
  const of = (g) => `${g.n} post${g.n === 1 ? '' : 's'}`;
  if (!nPosts) return res;
  const name = top.title || formatLabel(top.format);
  res.lines.push({ kind: 'top', text: `Best post: ${/^[“"]/.test(name) ? name : `“${name}”`} (${postMetrics(top.stats).views.toLocaleString()} views on ${top.platform || 'its app'}).`, postId: top.id });
  if (res.type) res.lines.push({ kind: 'type', text: `${res.type.key} leads the types (${of(res.type)}).` });
  if (res.song) res.lines.push({ kind: 'song', text: `“${res.song.key}” gets the most interaction per view (${of(res.song)}).` });
  if (res.tag) res.lines.push({ kind: 'tag', text: `${res.tag.key} does best of your hashtags (${of(res.tag)}).` });
  res.lines.push({ kind: 'n', text: res.small ? `Based on only ${nPosts} post${nPosts === 1 ? '' : 's'} with stats this month: a hint, not a rule.` : `Based on ${nPosts} posts with stats this month.` });
  return res;
}

// ---- CSV import (TikTok Studio, Instagram / Meta Business Suite and similar exports)

/** Parse CSV text (quoted fields, commas or semicolons) into rows of strings. */
export function parseCSV(text) {
  const src = String(text || '').replace(/^\uFEFF/, '');
  const first = src.split(/\r?\n/, 1)[0] || '';
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : first.includes('\t') && !first.includes(',') ? '\t' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) (row.push(cell), (cell = ''));
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

const COLS = {
  url: /^(video link|link|permalink|url|post link|share url)$/i,
  title: /^(video title|title|description|caption|post|video description)$/i,
  date: /^(post time|publish time|date|posted|create time|published|publish date|time)$/i,
  views: /^(total )?(video )?(views|plays|video views|reach)$/i,
  likes: /^(total )?(likes|like count|reactions)$/i,
  comments: /^(total )?(comments|comment count)$/i,
  shares: /^(total )?(shares|share count|sends)$/i,
  saves: /^(total )?(saves|favorites|favourites|add to favorites|bookmarks)$/i,
  avgWatch: /^(average (watch|play) time|avg\.? watch time|average time watched)( \(s(ec(onds)?)?\))?$/i,
  length: /^(duration|video duration|length)( \(s(ec(onds)?)?\))?$/i,
};
const num = (s) => {
  const t = String(s || '').trim().replace(/[\s,]/g, '');
  if (!t) return null;
  const m = /^([\d.]+)([kKmM])?$/.exec(t);
  if (!m) return Number.isNaN(+t) ? null : +t;
  return +m[1] * (m[2] ? (/k/i.test(m[2]) ? 1e3 : 1e6) : 1);
};
const toDate = (s) => {
  const t = String(s || '').trim();
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

/** Rows from an analytics export as [{ url, title, date, stats }], matching columns by name. */
export function importRows(text, now = new Date().toISOString()) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('That file has no rows.');
  const head = rows[0].map((x) => x.trim());
  const at = Object.fromEntries(Object.entries(COLS).map(([k, re]) => [k, head.findIndex((x) => re.test(x))]));
  if (at.views < 0) throw new Error('Couldn’t find a views (or plays) column. Export the post-level content report from the app.');
  return rows.slice(1).map((r) => ({
    url: at.url >= 0 ? r[at.url].trim() : '',
    title: at.title >= 0 ? r[at.title].trim().slice(0, 120) : '',
    date: at.date >= 0 ? toDate(r[at.date]) : '',
    stats: { views: num(r[at.views]), likes: at.likes >= 0 ? num(r[at.likes]) : null, comments: at.comments >= 0 ? num(r[at.comments]) : null, shares: at.shares >= 0 ? num(r[at.shares]) : null, saves: at.saves >= 0 ? num(r[at.saves]) : null, avgWatch: at.avgWatch >= 0 ? num(r[at.avgWatch]) : null, length: at.length >= 0 ? num(r[at.length]) : null, source: 'csv', fetchedAt: now },
  })).filter((x) => x.stats.views != null);
}

/** Put imported rows on the matching posts (same link), or report them as new. */
export function matchImport(posts, rows) {
  const key = (u) => {
    const p = parseLink(u);
    return p.id ? `${p.platform === 'Shorts' ? 'YouTube' : p.platform}:${p.id}` : String(u || '').trim().replace(/[?#].*$/, '').replace(/\/$/, '');
  };
  const byUrl = new Map(posts.filter((p) => p.url).map((p) => [key(p.url), p]));
  const matched = [];
  const fresh = [];
  for (const r of rows) {
    const p = r.url && byUrl.get(key(r.url));
    if (p) matched.push({ postId: p.id, stats: r.stats });
    else fresh.push(r);
  }
  return { matched, fresh };
}
