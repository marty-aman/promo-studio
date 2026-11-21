// The Inspiration page: niche trends with one-click recipes, a posting playbook,
// hashtag sets, caption hooks and a release-week calendar.
import { findHook } from './core.js';
import { media } from './media.js';
import { renderFrame } from './renderer.js';
import { saveSettings, loadSettings } from './state.js';
import { h, icon, button, toast } from './dom.js';
import { RESEARCHED_ON, NICHE, SOURCES, TRENDS, PLAYBOOK, PLAYBOOK_ACTIONS, HASHTAG_SETS, CAPTION_HOOKS, CALENDAR, applyRecipe, applyPlaybook, fillTokens } from './inspiration.js';
import { batchTool, calendarTool, captionTool, hookOpeners } from './page-tools.js';
import { bestLyric } from './captions.js';
import { tabSources } from './templates.js';
import { scanTrends, rankTrends, loadScan, saveScan, isStale, ago, shortNum, shortsURL, chartArtists, DEFAULT_TERMS, WINDOW_DAYS } from './trendscan.js';
import { deezerJSONP } from './manager/isrc.js';

/** The last trend refresh, shared with the Suggested tab (saved in this browser). */
export const trendState = { scan: null, busy: false };
export const currentScan = () => (trendState.scan ||= loadScan());

const PLATFORM_FILTERS = ['All', 'TikTok', 'Reels', 'Shorts'];

export function buildInspirationPage({ store, engine, ui, settings, panels }) {
  const state = { filter: 'All', tool: null };
  currentScan();
  const root = h('div', { class: 'page' });

  const similarIn = h('input', { type: 'text', value: settings.similarBands || 'Bad Omens, Spiritbox, Pierce the Veil', 'aria-label': 'Bands your fans also like' });
  similarIn.addEventListener('change', () => {
    settings.similarBands = similarIn.value.trim();
    saveSettings(settings);
    render();
  });

  const ctx = () => ({
    sources: tabSources(media.all()),
    similar: (settings.similarBands || similarIn.value).replace(/\s*,\s*([^,]*)$/, ' & $1'),
    hookStart: (len) => {
      const p = store.get();
      const rec = p.song && media.get(p.song.mediaId);
      return rec && rec.envelope ? findHook(rec.envelope, rec.envRate, len, rec.duration) : null;
    },
  });

  const cityIn = h('input', { type: 'text', value: settings.city ?? 'Seattle', 'aria-label': 'Your city (for captions)' });
  cityIn.addEventListener('change', () => {
    settings.city = cityIn.value.trim();
    saveSettings(settings);
    render();
  });

  const playbookApply = (rule) => {
    const a = PLAYBOOK_ACTIONS[rule.action];
    if (!a) return;
    if (a.kind === 'tool') {
      state.tool = state.tool === rule.action ? null : rule.action;
      render();
      const el = root.querySelector('.tool-box');
      if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    const p = store.get();
    const from = p.song ? p.song.offset : 0;
    const lyric = bestLyric(p.lyrics, from, from + 15);
    store.update((d) => applyPlaybook(d, rule.action, { ...ctx(), lyric: lyric && lyric.text }));
    engine.seek(0);
    toast(`${a.done} Undo (Ctrl+Z) to go back.`, 'info', 5000);
    if (rule.action === 'hook') {
      const el = root.querySelector('#hook-openers');
      if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  };

  const toolFor = (id) =>
    id === 'batch' ? batchTool({ store, engine, render, mode: 'song' })
      : id === 'mv' ? batchTool({ store, engine, render, mode: 'mv' })
        : id === 'calendar' ? calendarTool({ store })
          : id === 'caption' ? captionTool({ store, settings })
            : null;

  const build = (trend) => {
    store.update((d) => applyRecipe(d, trend, ctx()));
    engine.seek(0);
    const name = /^[“"]/.test(trend.title) ? trend.title : `“${trend.title}”`;
    toast(`${name} is set up. Swap in your best clips and press play. Undo (Ctrl+Z) to go back.`, 'info', 5000);
    if (trend.recipe.tab && !(store.get().layers || []).some((l) => l.type === 'tab' && l.mediaId)) ui.openTab('layers');
    else ui.openTab('templates');
  };

  const sourceLinks = (ids) =>
    h(
      'div',
      { class: 'sources tiny' },
      'Sources: ',
      ids.map((id, i) => [i ? ' · ' : '', h('a', { href: SOURCES[id].url, target: '_blank', rel: 'noopener noreferrer' }, SOURCES[id].label)]),
    );

  const copy = (text, what) => navigator.clipboard.writeText(text).then(() => toast(`${what} copied`), () => toast('Could not copy', 'error'));

  const termsIn = h('input', { type: 'text', value: settings.trendTerms || DEFAULT_TERMS, 'aria-label': 'Search Shorts for', 'data-k': 'trend-terms' });
  termsIn.addEventListener('change', () => {
    settings.trendTerms = termsIn.value.trim();
    saveSettings(settings);
  });

  /** Read the live data again and re-rank everything. */
  const refresh = async () => {
    if (trendState.busy) return;
    trendState.busy = true;
    render();
    try {
      const key = (loadSettings().youtubeKey || '').trim(); // read fresh: the key lives on the Manager's Content page
      const scan = await scanTrends({ key, terms: termsIn.value.trim() || DEFAULT_TERMS, own: store.get().endCard.artist, deezer: (url) => deezerJSONP(url) });
      trendState.scan = scan;
      saveScan(scan);
      const hot = rankTrends(TRENDS, scan).filter((r) => r.heat === 'hot').map((r) => r.trend.title.replace(/^[“"]|[”"]$/g, ''));
      toast(scan.videos ? `Read ${scan.videos} Shorts from the last ${WINDOW_DAYS} days.${hot.length ? ` Hot now: ${hot.join(', ')}.` : ''}` : scan.notes[0] || 'Refreshed.', scan.videos ? 'info' : 'error', 6000);
    } catch (e) {
      toast(`Could not refresh: ${e.message}`, 'error', 5000);
    } finally {
      trendState.busy = false;
      render();
    }
  };

  const link = (href, text) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text);

  /** What the last refresh found: hashtags, new phrases and the Deezer chart. */
  function liveSection(scan) {
    if (!scan) return null;
    const tags = scan.hashtags || [];
    const set = tags.slice(0, 5).map((t) => t.tag).join(' ');
    const bands = chartArtists(scan.chart || [], store.get().endCard.artist, 3);
    return h(
      'section',
      { class: 'live-trends' },
      h('h3', { class: 'page-sect' }, scan.videos ? `Right now on Shorts · ${scan.videos} videos from ${scan.channels} channels` : 'Right now'),
      h(
        'div',
        { class: 'page-cols' },
        h(
          'div',
          {},
          h('h4', {}, 'Rising hashtags'),
          tags.length
            ? h('div', {}, h('div', { class: 'chips' }, tags.map((t) => h('span', { class: 'chip-static', title: `${t.channels} channels · ${shortNum(t.views)} views` }, t.tag))), h('div', { class: 'list-row' }, h('span', { class: 'small' }, set), button('Copy top 5', () => copy(set, 'Hashtags'), { iconName: 'copy', variant: 'sm' })))
            : h('p', { class: 'muted small' }, scan.videos ? 'No hashtag is shared by two or more channels this time.' : 'Needs the YouTube key.'),
          h('h4', {}, 'Phrases showing up in titles'),
          (scan.phrases || []).length
            ? h('ul', { class: 'phrase-list small' }, scan.phrases.map((ph) => h('li', {}, h('strong', {}, `“${ph.text}”`), ` · ${ph.channels} channels · ${shortNum(ph.views)} views · `, link(shortsURL(ph.example.id), 'example'))))
            : h('p', { class: 'muted small' }, scan.videos ? 'Nothing new beyond the formats below.' : 'Needs the YouTube key.'),
        ),
        h(
          'div',
          {},
          h('h4', {}, scan.chartSource && scan.chartSource.kind === 'playlist' ? ['Just added to Deezer’s ', scan.chartSource.link ? link(scan.chartSource.link, `“${scan.chartSource.title}”`) : `“${scan.chartSource.title}”`, ' playlist'] : 'What metal fans are playing (Deezer chart)'),
          (scan.chart || []).length
            ? h('ol', { class: 'chart-list small' }, scan.chart.map((t) => h('li', {}, t.link ? link(t.link, t.title) : t.title, h('span', { class: 'muted' }, ` · ${t.artist}`))))
            : h('p', { class: 'muted small' }, 'Not read this time.'),
          bands.length
            ? button(`Use ${bands.join(', ')} as “bands your fans also like”`, () => {
                similarIn.value = bands.join(', ');
                settings.similarBands = similarIn.value;
                saveSettings(settings);
                render();
                toast('Bands updated; the “If you like…” hooks use them now.');
              }, { variant: 'sm', title: 'Name bands from the chart in the “If you like ___” trend and the captions' })
            : null,
        ),
      ),
    );
  }

  function trendCard({ trend, heat, stat }) {
    const thumb = h('canvas', { width: 108, height: 192, class: 'tpl-thumb', 'aria-hidden': 'true' });
    requestAnimationFrame(() => {
      const draft = structuredClone(store.get());
      try {
        applyRecipe(draft, trend, ctx());
        draft.look.overlay = 'off';
        renderFrame(thumb.getContext('2d'), thumb.width, thumb.height, draft, 1.2, engine.env(false));
      } catch (e) {
        console.warn('trend preview failed', e);
      }
    });
    return h(
      'article',
      { class: `trend-card${store.get().inspiration === trend.id ? ' on' : ''}${heat ? ` heat-${heat}` : ''}`, 'data-trend': trend.id },
      thumb,
      h(
        'div',
        { class: 'trend-body' },
        h('div', { class: 'trend-head' }, h('h3', {}, trend.title), h('div', { class: 'badges' }, heat ? h('span', { class: `heat ${heat}` }, { hot: '🔥 Hot now', rising: 'Rising', quiet: 'Quiet now' }[heat]) : null, trend.platforms.map((p) => h('span', { class: `plat plat-${p.toLowerCase()}` }, p)))),
        stat && stat.count
          ? h('p', { class: 'trend-live tiny' }, `${stat.count} Short${stat.count === 1 ? '' : 's'} from ${stat.channels} channel${stat.channels === 1 ? '' : 's'} · ${shortNum(stat.views)} views in ${WINDOW_DAYS} days · `, stat.examples.map((x, i) => [i ? ', ' : '', link(shortsURL(x.id), `example${stat.examples.length > 1 ? ` ${i + 1}` : ''}`)]))
          : null,
        h('p', { class: 'small' }, trend.why),
        h('div', { class: 'hookline' }, h('span', { class: 'muted tiny' }, 'On-screen hook'), h('strong', {}, fillTokens(trend.hook, { ...ctx(), title: store.get().endCard.title }))),
        h('ol', { class: 'steps small' }, trend.steps.map((s) => h('li', {}, s))),
        h('div', { class: 'trend-foot' }, h('span', { class: 'muted tiny' }, `Length ${trend.length}`), button('Build this', () => build(trend), { iconName: 'wand', variant: 'primary sm' })),
        sourceLinks(trend.sources),
      ),
    );
  }

  function calendar() {
    const rel = store.get().endCard.releaseDate;
    const base = rel ? new Date(`${rel}T00:00:00`) : null;
    const fmt = (off) => {
      if (!base || isNaN(base)) return off === 0 ? 'Release day' : `Day ${off > 0 ? '+' : ''}${off}`;
      const d = new Date(base);
      d.setDate(d.getDate() + off);
      return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${off === 0 ? ' · release' : ''}`;
    };
    return h(
      'div',
      { class: 'calendar' },
      CALENDAR.map(([off, id, note]) => {
        const t = TRENDS.find((x) => x.id === id);
        return h(
          'div',
          { class: `cal-row${off === 0 ? ' release' : ''}` },
          h('span', { class: 'cal-day' }, fmt(off)),
          h('span', { class: 'cal-what' }, h('strong', {}, t.title), h('span', { class: 'muted tiny' }, note)),
          button('Build', () => build(t), { variant: 'sm' }),
        );
      }),
    );
  }

  function render() {
    const scan = currentScan();
    const trends = rankTrends(TRENDS, scan).filter((r) => state.filter === 'All' || r.trend.platforms.includes(state.filter));
    const stale = scan && isStale(scan);
    const status = scan
      ? `${scan.videos ? `Ranked by ${scan.videos} YouTube Shorts from the last ${WINDOW_DAYS} days` : 'Deezer only'}, refreshed ${ago(scan.fetchedAt)}.`
      : `Researched ${RESEARCHED_ON}. Refresh to rank them by what’s working this fortnight.`;
    const c = ctx();
    root.replaceChildren(
      h(
        'header',
        { class: 'page-head' },
        h('div', {}, h('h2', {}, icon('wand', 20), ' Inspiration'), h('p', { class: 'muted small' }, `Short-form trends for ${NICHE} bands on TikTok and Instagram. Each card builds a ready-to-edit promo from your song and clips.`)),
        button('Back to editor', () => ui.openTab('templates'), { iconName: 'x', variant: 'ghost' }),
      ),
      h(
        'div',
        { class: 'page-bar' },
        h('label', { class: 'similar' }, h('span', { class: 'lbl' }, 'Bands your fans also like'), similarIn),
        h('label', { class: 'similar city' }, h('span', { class: 'lbl' }, 'Your city'), cityIn),
        h(
          'div',
          { class: 'seg', role: 'radiogroup', 'aria-label': 'Platform' },
          PLATFORM_FILTERS.map((f) =>
            h('button', { type: 'button', role: 'radio', 'aria-checked': state.filter === f ? 'true' : 'false', class: state.filter === f ? 'on' : '', onclick: () => ((state.filter = f), render()) }, f),
          ),
        ),
      ),
      h(
        'div',
        { class: `trend-refresh${stale ? ' stale' : ''}` },
        h('span', { class: 'small' }, status, stale ? ' That’s over a week old, so refresh before you plan.' : ''),
        h('label', { class: 'similar' }, h('span', { class: 'lbl' }, 'Search Shorts for'), termsIn),
        button(trendState.busy ? 'Refreshing…' : 'Refresh trends', refresh, { iconName: 'repeat', variant: 'primary sm', disabled: trendState.busy, title: 'Search YouTube Shorts from the last two weeks and Deezer’s metal chart, then re-rank the trends and suggestions' }),
        (scan && scan.notes.length) ? h('ul', { class: 'warn-list' }, scan.notes.map((n) => h('li', {}, n))) : null,
        h('p', { class: 'muted tiny', style: { flexBasis: '100%', margin: 0 } }, 'TikTok and Instagram don’t let a web page search them, so this reads YouTube Shorts (mostly the same videos, cross-posted) with your YouTube key from Manager → Content, plus Deezer. Each refresh uses 100 of the key’s 10,000 free daily units per search word (3–4% a day).'),
      ),
      liveSection(scan),
      h('p', { class: 'muted tiny note' }, 'Trends move every week. Before you post, check what sounds and hashtags are rising today in ', h('a', { href: SOURCES.creative.url, target: '_blank', rel: 'noopener noreferrer' }, 'TikTok Creative Center'), ' and the trending audio list in the Instagram Reels editor.'),
      h('section', {}, h('h3', { class: 'page-sect' }, scan && scan.videos ? 'Trending formats in your niche, hottest first' : 'Trending formats in your niche'), h('div', { class: 'trend-grid' }, trends.map(trendCard))),
      h('section', { id: 'hook-openers' }, h('h3', { class: 'page-sect' }, 'Hook openers for the first second'), hookOpeners({ store, engine, ui, settings, panels })),
      h(
        'div',
        { class: 'page-cols' },
        h(
          'section',
          {},
          h('h3', { class: 'page-sect' }, 'Posting playbook'),
          h(
            'div',
            { class: 'playbook' },
            PLAYBOOK.map((p) =>
              h('div', { class: `rule${state.tool === p.action ? ' on' : ''}` },
                h('strong', {}, p.rule),
                h('span', { class: 'small' }, p.detail),
                sourceLinks(p.sources),
                PLAYBOOK_ACTIONS[p.action]
                  ? button(PLAYBOOK_ACTIONS[p.action].label, () => playbookApply(p), { iconName: PLAYBOOK_ACTIONS[p.action].kind === 'tool' ? 'settings' : 'wand', variant: `sm${PLAYBOOK_ACTIONS[p.action].kind === 'edit' ? ' primary' : ''}` })
                  : null,
                state.tool === p.action ? toolFor(p.action) : null,
              ),
            ),
          ),
        ),
        h(
          'section',
          {},
          h('h3', { class: 'page-sect' }, 'Release-week plan'),
          h('p', { class: 'muted tiny' }, store.get().endCard.releaseDate ? 'Dates come from the release date in the End card tab.' : 'Set a release date in the End card tab to see real dates.'),
          calendar(),
          h('h3', { class: 'page-sect' }, 'Hashtag sets (5 each)'),
          h('div', { class: 'list' }, HASHTAG_SETS.map((s) => h('div', { class: 'list-row' }, h('span', {}, h('strong', {}, s.name), h('br'), h('span', { class: 'muted tiny' }, s.tags)), button('Copy', () => copy(s.tags, 'Hashtags'), { iconName: 'copy', variant: 'sm' })))),
          h('h3', { class: 'page-sect' }, 'Caption openers'),
          h(
            'div',
            { class: 'list' },
            CAPTION_HOOKS.map((raw) => {
              const text = fillTokens(raw, { similar: c.similar, title: store.get().endCard.title, artist: store.get().endCard.artist }).replace(/YOUR FAVORITE BANDS/, 'your favorite bands');
              const nice = raw.includes('{similar}') ? text.replace(c.similar.toUpperCase(), c.similar) : text;
              return h('div', { class: 'list-row' }, h('span', { class: 'small' }, nice), button('Copy', () => copy(nice, 'Caption'), { iconName: 'copy', variant: 'sm' }));
            }),
          ),
        ),
      ),
    );
  }

  render();
  return { el: root, render };
}
