// Content: the posting schedule across songs, each post's link and stats, and what works best.
import { h, icon, button, iconButton, toast, keyBox, pickFiles } from '../dom.js';
import { loadSettings, saveSettings } from '../state.js';
import { niceDate, mid } from './model.js';
import { planPosts } from './ideas.js';
import { POST_STATUSES } from './page-songs.js';
import { FORMATS, PLATFORMS, GROUPINGS, formatLabel, parseLink, isYouTube, fetchYouTubeStats, postMetrics, compare, findings, importRows, matchImport } from './content.js';

export const contentUI = { song: '', status: '', by: 'format', open: null, busy: false };
const pct = (x) => (x == null ? '—' : `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`);
const fix1 = (x) => (x == null ? '—' : x.toFixed(1));
const big = (x) => (x == null ? '—' : x >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : x >= 1e4 ? `${Math.round(x / 1e3)}k` : x.toLocaleString());

export function buildContent(ctx) {
  const m = ctx.store.get();
  const f = ctx.form;
  const ui = contentUI;
  const settings = loadSettings();
  const re = () => ctx.go('content');
  const P = (id, fn) => (d, v) => {
    const p = d.posts.find((x) => x.id === id);
    if (p) fn(p, v);
  };
  const songTitle = (id) => (m.songs.find((s) => s.id === id) || {}).title || '';

  // ---- YouTube stats
  const keyIn = h('input', { type: 'password', placeholder: 'Paste your YouTube Data API key', value: settings.youtubeKey || '', autocomplete: 'off' });
  keyIn.addEventListener('change', () => {
    const s = loadSettings();
    s.youtubeKey = keyIn.value.trim();
    saveSettings(s);
    toast(s.youtubeKey ? 'YouTube key saved in this browser only' : 'YouTube key removed');
    re();
  });
  const ytPosts = m.posts.filter((p) => isYouTube(p.url));
  const fetchYT = async (only = null) => {
    const key = loadSettings().youtubeKey;
    if (!key) return toast('Add your YouTube API key first.', 'error');
    const list = only ? [only] : ytPosts;
    if (!list.length) return toast('No YouTube or Shorts links yet. Paste a post’s link first.', 'error');
    ui.busy = true;
    re();
    try {
      const got = await fetchYouTubeStats([...new Set(list.map((p) => parseLink(p.url).id))], key);
      let n = 0;
      ctx.update((d) => {
        for (const p of d.posts) {
          const s = isYouTube(p.url) && got[parseLink(p.url).id];
          if (s && (!only || p.id === only.id)) {
            p.stats = { ...(p.stats || {}), ...s, shares: p.stats ? p.stats.shares ?? null : null, saves: p.stats ? p.stats.saves ?? null : null, avgWatch: p.stats ? p.stats.avgWatch ?? null : null };
            n += 1;
          }
        }
      });
      toast(n ? `Updated ${n} post${n > 1 ? 's' : ''} from YouTube` : 'YouTube didn’t return those videos (private or removed?)', n ? 'info' : 'error');
    } catch (e) {
      toast(e.message, 'error', 6000);
    }
    ui.busy = false;
    re();
  };

  // ---- CSV import
  const importCSV = async () => {
    const [file] = await pickFiles('.csv,text/csv,.tsv', false);
    if (!file) return;
    try {
      const rows = importRows(await file.text());
      const { matched, fresh } = matchImport(m.posts, rows);
      const addNew = fresh.length && confirm(`${matched.length} rows match your posts. Add the other ${fresh.length} as posted posts too?`);
      ctx.update((d) => {
        for (const x of matched) {
          const p = d.posts.find((y) => y.id === x.postId);
          if (p) (p.stats = { ...(p.stats || {}), ...Object.fromEntries(Object.entries(x.stats).filter(([, v]) => v != null)) }), (p.status = 'posted');
        }
        if (addNew) for (const r of fresh) d.posts.push({ id: mid('post'), songId: ui.song || '', date: r.date, platform: parseLink(r.url).platform || 'TikTok', format: 'other', title: r.title || 'Imported post', hook: '', idea: '', status: 'posted', url: r.url, stats: r.stats });
      });
      toast(`Imported stats for ${matched.length + (addNew ? fresh.length : 0)} posts`);
    } catch (e) {
      toast(e.message, 'error', 6000);
    }
  };

  // ---- what works best
  const all = m.posts.filter((p) => !ui.song || p.songId === ui.song);
  const fd = findings(all);
  const groups = compare(all, ui.by);
  const maxScore = Math.max(...groups.map((g) => g.score), 1e-9);
  const bySel = h('select', { 'aria-label': 'Compare by' }, Object.entries(GROUPINGS).map(([k, g]) => h('option', { value: k, selected: ui.by === k }, g.label)));
  bySel.addEventListener('change', () => ((ui.by = bySel.value), re()));
  const insights = h(
    'section',
    { class: 'mgr-sect' },
    h('h2', {}, 'What works best'),
    fd.ready
      ? h('ul', { class: 'mgr-findings' }, fd.lines.map((l) => h('li', { class: l.kind }, icon(l.kind === 'worst' ? 'activity' : 'sparkle', 14), h('span', {}, l.text))))
      : h('p', { class: 'muted small' }, `Add stats to at least 3 posts to see which kinds work best (${fd.count} so far). YouTube and Shorts links fetch their own stats; for TikTok and Instagram, copy the numbers from the post’s insights or import the app’s CSV export.`),
    groups.length
      ? h(
          'div',
          {},
          h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Compare by'), bySel),
          h(
            'table',
            { class: 'mgr-table mgr-compare' },
            h('thead', {}, h('tr', {}, [GROUPINGS[ui.by].label, 'Posts', 'Median views', 'Interaction', 'Shares / 1k', 'Saves / 1k', 'Watched', ''].map((x) => h('th', {}, x)))),
            h(
              'tbody',
              {},
              groups.map((g) =>
                h(
                  'tr',
                  {},
                  h('td', {}, h('strong', {}, g.key)),
                  h('td', {}, String(g.n)),
                  h('td', {}, big(g.views)),
                  h('td', {}, pct(g.engagement)),
                  h('td', {}, fix1(g.sharesPer1k)),
                  h('td', {}, fix1(g.savesPer1k)),
                  h('td', {}, pct(g.watched)),
                  h('td', { class: 'mgr-barcell' }, h('span', { class: 'mgr-bar' }, h('i', { style: { width: `${(100 * g.score) / maxScore}%` } }))),
                ),
              ),
            ),
          ),
          h('p', { class: 'muted tiny' }, 'Ranked by sends and saves first, then comments and likes, per view: the signals TikTok and Instagram weight most. A few posts can mislead, so treat small groups as hints.'),
        )
      : null,
  );

  // ---- schedule
  const songSel = h('select', { 'aria-label': 'Song' }, h('option', { value: '' }, 'All songs'), m.songs.map((s) => h('option', { value: s.id, selected: ui.song === s.id }, s.title)));
  songSel.addEventListener('change', () => ((ui.song = songSel.value), re()));
  const stSel = h('select', { 'aria-label': 'Status' }, h('option', { value: '' }, 'Any status'), POST_STATUSES.map(([k, l]) => h('option', { value: k, selected: ui.status === k }, l)));
  stSel.addEventListener('change', () => ((ui.status = stSel.value), re()));
  const posts = all.filter((p) => !ui.status || p.status === ui.status).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const add = () => ctx.update((d) => d.posts.push({ id: mid('post'), songId: ui.song || (m.songs[0] && m.songs[0].id) || '', date: ctx.today(), platform: 'TikTok', format: 'other', title: 'New post', hook: '', idea: '', status: 'idea', url: '', stats: null }));
  const planFor = (song) => {
    const fresh = planPosts(song);
    if (!fresh.length) return toast(`Give “${song.title}” a release date first (Songs).`, 'error');
    ctx.update((d) => d.posts.push(...fresh));
    toast(`${fresh.length} posts planned for “${song.title}”`);
  };
  const statsEditor = (p) => {
    const s = p.stats || {};
    const field = (k, label, ph = '') => f.text(`ps-${k}-${p.id}`, label, s[k] ?? '', P(p.id, (x, v) => (x.stats = { ...(x.stats || {}), [k]: v === '' ? null : +v, source: (x.stats && x.stats.source === 'youtube') ? 'youtube' : 'manual', fetchedAt: new Date().toISOString() })), { type: 'number', placeholder: ph });
    return h(
      'tr',
      { class: 'mgr-statsrow' },
      h(
        'td',
        { colspan: 9 },
        h('div', { class: 'mgr-statgrid' }, field('views', 'Views'), field('likes', 'Likes'), field('comments', 'Comments'), field('shares', 'Shares / sends'), field('saves', 'Saves'), field('avgWatch', 'Avg watch (s)'), field('length', 'Length (s)')),
        h('p', { class: 'muted tiny' }, isYouTube(p.url) ? 'Views, likes, comments and length come from YouTube; shares, saves and watch time are only in YouTube Studio, so add them here if you want.' : `Copy these from the post’s insights in ${p.platform || 'the app'} (open the post → ••• or “View insights”).`),
        isYouTube(p.url) ? button(ui.busy ? 'Fetching…' : 'Fetch from YouTube', () => fetchYT(p), { iconName: 'download', variant: 'sm', disabled: ui.busy }) : null,
      ),
    );
  };
  const rows = posts.flatMap((p) => {
    const mt = postMetrics(p.stats);
    const link = parseLink(p.url);
    const main = h(
      'tr',
      { class: p.status === 'posted' ? 'posted' : '' },
      h('td', {}, f.text(`cd-${p.id}`, '', p.date, P(p.id, (x, v) => (x.date = v)), { type: 'date' })),
      h('td', { class: 'muted small' }, songTitle(p.songId) || '—'),
      h('td', {}, f.select(`cf-${p.id}`, '', p.format || 'other', FORMATS, P(p.id, (x, v) => (x.format = v)))),
      h('td', {}, f.text(`ct-${p.id}`, '', p.title, P(p.id, (x, v) => (x.title = v)))),
      h('td', {}, f.select(`cp-${p.id}`, '', PLATFORMS.includes(p.platform) ? p.platform : 'Other', PLATFORMS.map((x) => [x, x]), P(p.id, (x, v) => (x.platform = v)))),
      h('td', {}, f.select(`cs-${p.id}`, '', p.status, POST_STATUSES, P(p.id, (x, v) => (x.status = v)))),
      h('td', {}, f.text(`cu-${p.id}`, '', p.url, P(p.id, (x, v) => {
        x.url = v.trim();
        const pl = parseLink(x.url).platform;
        if (pl) x.platform = pl;
        if (x.url && x.status !== 'posted') x.status = 'posted';
      }), { type: 'url', placeholder: 'Post link' })),
      h(
        'td',
        {},
        h('button', { type: 'button', class: `mgr-statbtn${mt ? ' has' : ''}`, 'aria-expanded': ui.open === p.id ? 'true' : 'false', onclick: () => ((ui.open = ui.open === p.id ? null : p.id), re()) }, mt ? `${big(mt.views)} · ${pct(mt.engagement)}` : link.platform === 'YouTube' || link.platform === 'Shorts' ? 'Fetch / add' : 'Add stats'),
      ),
      h('td', {}, iconButton('trash', `Delete “${p.title}”`, () => ctx.update((d) => (d.posts = d.posts.filter((x) => x.id !== p.id))), 'ghost')),
    );
    return ui.open === p.id ? [main, statsEditor(p)] : [main];
  });

  return h(
    'div',
    { class: 'mgr-page wide' },
    h(
      'header',
      { class: 'mgr-head' },
      h('div', {}, h('h1', {}, 'Content'), h('p', { class: 'muted' }, 'Every planned and posted short across your songs, with its stats.')),
      h('div', { class: 'row' }, button('Import stats (CSV)', importCSV, { iconName: 'upload', variant: 'sm', title: 'TikTok Studio or Instagram / Meta Business Suite content export' }), button(ui.busy ? 'Fetching…' : `Fetch YouTube stats${ytPosts.length ? ` (${ytPosts.length})` : ''}`, () => fetchYT(), { iconName: 'download', variant: 'sm', disabled: ui.busy }), button('Add a post', add, { iconName: 'plus', variant: 'sm primary' })),
    ),
    keyBox('YouTube Data API key', keyIn, {
      saved: !!settings.youtubeKey,
      help: h('span', {}, 'Free. In ', h('a', { href: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com', target: '_blank', rel: 'noopener noreferrer' }, 'Google Cloud'), ', enable “YouTube Data API v3”, then Credentials → Create API key. It reads public numbers (views, likes, comments) for any YouTube or Shorts link. Stored in this browser only.'),
    }),
    insights,
    h(
      'section',
      { class: 'mgr-sect' },
      h('h2', {}, `Schedule · ${posts.length} posts`),
      h('div', { class: 'mgr-filters' }, songSel, stSel, m.songs.filter((s) => s.releaseDate).length ? h('span', { class: 'row' }, h('span', { class: 'muted small' }, 'Plan around release:'), m.songs.filter((s) => s.releaseDate).map((s) => button(s.title, () => planFor(s), { variant: 'chip' }))) : null),
      posts.length
        ? h('table', { class: 'mgr-table mgr-posts' }, h('thead', {}, h('tr', {}, ['Date', 'Song', 'Type', 'Post', 'App', 'Status', 'Link', 'Stats', ''].map((x) => h('th', {}, x)))), h('tbody', {}, rows))
        : h('div', { class: 'mgr-empty' }, h('p', {}, 'No posts yet. Plan them from a song’s release date, or add one.'), button('Add a post', add, { iconName: 'plus', variant: 'sm primary' })),
    ),
  );
}

export { formatLabel };
