// The Inspiration page: niche trends with one-click recipes, a posting playbook,
// hashtag sets, caption hooks and a release-week calendar.
import { findHook } from './core.js';
import { media } from './media.js';
import { renderFrame } from './renderer.js';
import { saveSettings } from './state.js';
import { h, icon, button, toast } from './dom.js';
import { RESEARCHED_ON, NICHE, SOURCES, TRENDS, PLAYBOOK, HASHTAG_SETS, CAPTION_HOOKS, CALENDAR, applyRecipe, fillTokens } from './inspiration.js';

const PLATFORM_FILTERS = ['All', 'TikTok', 'Reels', 'Shorts'];

export function buildInspirationPage({ store, engine, ui, settings }) {
  const state = { filter: 'All' };
  const root = h('div', { class: 'page' });

  const similarIn = h('input', { type: 'text', value: settings.similarBands || 'Bad Omens, Spiritbox, Pierce the Veil', 'aria-label': 'Bands your fans also like' });
  similarIn.addEventListener('change', () => {
    settings.similarBands = similarIn.value.trim();
    saveSettings(settings);
    render();
  });

  const ctx = () => ({
    similar: (settings.similarBands || similarIn.value).replace(/\s*,\s*([^,]*)$/, ' & $1'),
    hookStart: (len) => {
      const p = store.get();
      const rec = p.song && media.get(p.song.mediaId);
      return rec && rec.envelope ? findHook(rec.envelope, rec.envRate, len, rec.duration) : null;
    },
  });

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

  function trendCard(trend) {
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
      { class: `trend-card${store.get().inspiration === trend.id ? ' on' : ''}` },
      thumb,
      h(
        'div',
        { class: 'trend-body' },
        h('div', { class: 'trend-head' }, h('h3', {}, trend.title), h('div', { class: 'badges' }, trend.platforms.map((p) => h('span', { class: `plat plat-${p.toLowerCase()}` }, p)))),
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
    const trends = TRENDS.filter((t) => state.filter === 'All' || t.platforms.includes(state.filter));
    const c = ctx();
    root.replaceChildren(
      h(
        'header',
        { class: 'page-head' },
        h('div', {}, h('h2', {}, icon('wand', 20), ' Inspiration'), h('p', { class: 'muted small' }, `Short-form trends for ${NICHE} bands on TikTok and Instagram, researched ${RESEARCHED_ON}. Each card builds a ready-to-edit promo from your song and clips.`)),
        button('Back to editor', () => ui.openTab('templates'), { iconName: 'x', variant: 'ghost' }),
      ),
      h(
        'div',
        { class: 'page-bar' },
        h('label', { class: 'similar' }, h('span', { class: 'lbl' }, 'Bands your fans also like'), similarIn),
        h(
          'div',
          { class: 'seg', role: 'radiogroup', 'aria-label': 'Platform' },
          PLATFORM_FILTERS.map((f) =>
            h('button', { type: 'button', role: 'radio', 'aria-checked': state.filter === f ? 'true' : 'false', class: state.filter === f ? 'on' : '', onclick: () => ((state.filter = f), render()) }, f),
          ),
        ),
      ),
      h('p', { class: 'muted tiny note' }, 'Trends move every week. Before you post, check what sounds and hashtags are rising today in ', h('a', { href: SOURCES.creative.url, target: '_blank', rel: 'noopener noreferrer' }, 'TikTok Creative Center'), ' and the trending audio list in the Instagram Reels editor.'),
      h('section', {}, h('h3', { class: 'page-sect' }, 'Trending formats in your niche'), h('div', { class: 'trend-grid' }, trends.map(trendCard))),
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
            PLAYBOOK.map((p) => h('div', { class: 'rule' }, h('strong', {}, p.rule), h('span', { class: 'small' }, p.detail), sourceLinks(p.sources))),
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
