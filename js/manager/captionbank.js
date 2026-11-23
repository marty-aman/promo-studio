// Caption bank: captions you write once and reuse, kept per artist in `captionBank`. Pure logic
// (normaliser, search and filters, copy text, saving from a post, ranking by the posts' views).
import { mid } from './model.js';

export const CB_PLATFORMS = [['any', 'Any app'], ['tiktok', 'TikTok'], ['reels', 'Instagram Reels'], ['shorts', 'YouTube Shorts'], ['x', 'X'], ['facebook', 'Facebook']];
export const CB_KINDS = [['hook', 'Hook'], ['teaser', 'Teaser'], ['release', 'Release'], ['show', 'Show'], ['behind-the-scenes', 'Behind the scenes'], ['other', 'Other']];
const PLAT_KEYS = CB_PLATFORMS.map(([k]) => k);
const KIND_KEYS = CB_KINDS.map(([k]) => k);
export const cbLabel = (list, k) => (list.find(([v]) => v === k) || list[0])[1];

const str = (x) => (typeof x === 'string' ? x : '');

/** Hashtags from typed text ("#doom, metal #doom") as ['doom', 'metal']: no '#', no repeats, letters, digits and _ only. */
export function parseHashtags(x) {
  const parts = Array.isArray(x) ? x : String(x ?? '').split(/[\s,]+/);
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const t = String(p ?? '').replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '');
    if (t && !seen.has(t.toLowerCase())) seen.add(t.toLowerCase()), out.push(t);
  }
  return out;
}

export function newCaption(fields = {}, today = '') {
  return normalizeCaption({ id: mid('cap'), created: today, ...fields });
}

export function normalizeCaption(c) {
  return {
    ...c,
    text: str(c.text),
    hashtags: parseHashtags(c.hashtags || []),
    platform: PLAT_KEYS.includes(c.platform) ? c.platform : 'any',
    kind: KIND_KEYS.includes(c.kind) ? c.kind : 'other',
    songId: str(c.songId),
    uses: Number.isFinite(+c.uses) && +c.uses > 0 ? Math.floor(+c.uses) : 0,
    lastUsed: str(c.lastUsed),
    created: str(c.created),
    postIds: Array.isArray(c.postIds) ? c.postIds.filter((x) => typeof x === 'string') : [],
  };
}

export const normalizeBank = (list) => (Array.isArray(list) ? list.filter((c) => c && typeof c === 'object' && typeof c.id === 'string').map(normalizeCaption) : []);

/** What Copy puts on the clipboard: the text, a blank line, then the hashtags. */
export const copyText = (c) => [c.text.trim(), c.hashtags.map((t) => `#${t}`).join(' ')].filter(Boolean).join('\n\n');

export function markUsed(c, today) {
  c.uses = (c.uses || 0) + 1;
  c.lastUsed = today;
  return c;
}

/**
 * Captions matching the search words (all of them, in the text or hashtags) and the filters.
 * A caption for "any" app shows under every app filter.
 */
export function filterCaptions(list, { q = '', platform = '', kind = '', songId = '' } = {}) {
  const words = String(q).toLowerCase().split(/\s+/).map((w) => w.replace(/^#/, '')).filter(Boolean);
  return list.filter((c) => {
    if (platform && c.platform !== platform && c.platform !== 'any') return false;
    if (kind && c.kind !== kind) return false;
    if (songId && c.songId !== songId) return false;
    const hay = `${c.text} ${c.hashtags.join(' ')}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

const POST_PLAT = { TikTok: 'tiktok', Reels: 'reels', Shorts: 'shorts', X: 'x', Facebook: 'facebook' };

/** A caption made from a post on the schedule (its hook line, else its title), linked to that post. */
export function captionFromPost(post, today = '') {
  const text = str(post.hook).trim() || str(post.title).trim();
  return newCaption({ text, platform: POST_PLAT[post.platform] || 'any', kind: 'other', songId: str(post.songId), postIds: [post.id] }, today);
}

/** Lower case, hashtags and punctuation removed, spaces squeezed: how caption and post text are compared. */
export const normText = (s) => String(s ?? '').toLowerCase().replace(/#[\p{L}\p{N}_]+/gu, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const MIN_MATCH = 8; // shorter texts ("new post") would match by accident

/** The posts a caption was used on: linked by id, or whose hook line or title is the same text. */
export function postsFor(c, posts = []) {
  const t = normText(c.text);
  return posts.filter((p) => c.postIds.includes(p.id) || (t.length >= MIN_MATCH && (normText(p.hook) === t || normText(p.title) === t)));
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};

/**
 * Best performers: captions whose posts have views, ranked by median views (then more posts).
 * Returns { top: [{ id, n, views }] (up to 3), rated, posts, enough }. `enough` is false when
 * fewer than 2 captions or fewer than 3 posts have views, so the page says the ranking is a hint.
 */
export function bestCaptions(bank, posts = []) {
  const rated = [];
  let total = 0;
  for (const c of bank) {
    const views = postsFor(c, posts).map((p) => +(p.stats && p.stats.views)).filter((v) => Number.isFinite(v) && v > 0);
    if (!views.length) continue;
    total += views.length;
    rated.push({ id: c.id, n: views.length, views: median(views) });
  }
  rated.sort((a, b) => b.views - a.views || b.n - a.n);
  return { top: rated.slice(0, 3), rated: rated.length, posts: total, enough: rated.length >= 2 && total >= 3 };
}
