// The Content page's Captions tab: a bank of captions to reuse, with search, filters, one-click
// copy, a use counter and the captions whose posts did best. Data is `captionBank` (captionbank.js).
import { h, icon, button, iconButton, toast } from '../dom.js';
import { CB_PLATFORMS, CB_KINDS, cbLabel, parseHashtags, newCaption, normalizeBank, copyText, markUsed, filterCaptions, captionFromPost, bestCaptions } from './captionbank.js';

/** Search, filters, the open editor and the last delete (for its Undo). Not saved. */
export const captionsUI = { q: '', platform: '', kind: '', song: '', editing: null, deleted: null };

const big = (x) => (x >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : x >= 1e4 ? `${Math.round(x / 1e3)}k` : Math.round(x).toLocaleString());

/** "Save to bank" for a post on the schedule: copies its hook line (or title) into the bank, linked to the post. */
export function saveToBank(ctx, post) {
  const c = captionFromPost(post, ctx.today());
  if (!c.text) return toast('That post has no hook line or title to save.', 'error');
  const bank = normalizeBank(ctx.store.get().captionBank);
  const same = bank.find((x) => x.postIds.includes(post.id) || x.text.trim() === c.text);
  if (same) return toast('Already in the caption bank (Content → Captions).');
  ctx.update((d) => (d.captionBank ||= []).unshift(c));
  toast('Saved to the caption bank (Content → Captions).');
}

export function captionsTab(ctx) {
  const m = ctx.store.get();
  const f = ctx.form;
  const ui = captionsUI;
  const re = () => ctx.refresh();
  const bank = normalizeBank(m.captionBank);
  const songs = m.songs || [];
  const songTitle = (id) => (songs.find((s) => s.id === id) || {}).title || '';
  const C = (id, fn) => (d, v) => {
    const c = (d.captionBank || []).find((x) => x.id === id);
    if (c) fn(c, v);
  };

  // ---- add
  const text = h('textarea', { rows: 3, 'data-k': 'g6-cap-new', placeholder: 'Write the caption…', 'aria-label': 'New caption' });
  const tags = h('input', { type: 'text', 'data-k': 'g6-cap-new-tags', placeholder: '#doom #newmusic', 'aria-label': 'Hashtags' });
  const sel = (k, list, first, aria) => h('select', { 'data-k': k, 'aria-label': aria }, first ? h('option', { value: '' }, first) : null, list.map(([v, l]) => h('option', { value: v }, l)));
  const plat = sel('g6-cap-new-plat', CB_PLATFORMS, '', 'App');
  const kind = sel('g6-cap-new-kind', CB_KINDS, '', 'Kind');
  const song = sel('g6-cap-new-song', songs.map((s) => [s.id, s.title]), 'No song', 'Song');
  const add = () => {
    if (!text.value.trim()) return toast('Write the caption first.', 'error');
    const c = newCaption({ text: text.value.trim(), hashtags: parseHashtags(tags.value), platform: plat.value, kind: kind.value, songId: song.value }, ctx.today());
    ctx.update((d) => (d.captionBank ||= []).unshift(c));
    toast('Caption saved');
  };
  const addBox = h(
    'section',
    { class: 'mgr-sect g6-cap-add' },
    h('h2', {}, 'Add a caption'),
    text,
    h('div', { class: 'g6-cap-addrow' }, h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Hashtags'), tags), h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'App'), plat), h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Kind'), kind), h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Song'), song)),
    h('div', { class: 'row' }, button('Save to the bank', add, { iconName: 'plus', variant: 'sm primary' })),
    h('p', { class: 'muted tiny' }, 'Or press the star on a post in the Schedule tab to save its hook line here. Captions stay in this browser and go into backups with the rest of this artist.'),
  );

  // ---- best performers
  const best = bestCaptions(bank, m.posts || []);
  const rank = new Map(best.top.map((r, i) => [r.id, { ...r, place: i + 1 }]));
  const bestNote = !best.rated
    ? 'No caption is linked to a post with views yet. Save captions from posts (the star on a Schedule row), or use the same text as a post’s hook line, then add the post’s stats.'
    : best.enough
      ? `Ranked by the median views of the posts each caption was used on (${best.rated} caption${best.rated === 1 ? '' : 's'}, ${best.posts} post${best.posts === 1 ? '' : 's'} with views).`
      : `Too little data to call it: ${best.rated} caption${best.rated === 1 ? '' : 's'} and ${best.posts} post${best.posts === 1 ? '' : 's'} have views so far. Treat this as a hint until ${[best.rated < 2 && 'at least 2 captions', best.posts < 3 && '3 posts'].filter(Boolean).join(' and ')} have views.`;
  const bestBox = h(
    'section',
    { class: 'mgr-sect g6-cap-best', 'data-k': 'g6-cap-best' },
    h('h2', {}, 'Best performers'),
    best.top.length ? h('ol', { class: 'g6-cap-bestlist' }, best.top.map((r) => h('li', {}, h('strong', {}, `${big(r.views)} views`), h('span', { class: 'muted small' }, ` median · ${r.n} post${r.n === 1 ? '' : 's'} · `), (bank.find((c) => c.id === r.id) || {}).text.slice(0, 80)))) : null,
    h('p', { class: 'muted small', 'data-k': 'g6-cap-bestnote' }, bestNote),
  );

  // ---- list
  const shown = filterCaptions(bank, { q: ui.q, platform: ui.platform, kind: ui.kind, songId: ui.song });
  const search = h('input', { type: 'search', 'data-k': 'g6-cap-q', placeholder: 'Search captions and hashtags', value: ui.q, 'aria-label': 'Search captions' });
  search.addEventListener('input', () => {
    ui.q = search.value;
    re();
    requestAnimationFrame(() => {
      const el = document.querySelector('[data-k="g6-cap-q"]');
      if (el) el.focus(), el.setSelectionRange(el.value.length, el.value.length);
    });
  });
  const filt = (k, key, list, first, aria) => {
    const el = h('select', { 'data-k': k, 'aria-label': aria }, h('option', { value: '' }, first), list.map(([v, l]) => h('option', { value: v, selected: ui[key] === v }, l)));
    el.addEventListener('change', () => ((ui[key] = el.value), re()));
    return el;
  };
  const copy = (c) =>
    navigator.clipboard.writeText(copyText(c)).then(
      () => {
        ctx.update(C(c.id, (x) => markUsed(x, ctx.today())));
        toast('Caption copied');
      },
      () => toast('Could not copy. Select the text and copy it yourself.', 'error'),
    );
  const remove = (c) => {
    const idx = (m.captionBank || []).findIndex((x) => x.id === c.id);
    ui.deleted = { item: (m.captionBank || [])[idx], idx };
    ctx.update((d) => (d.captionBank = (d.captionBank || []).filter((x) => x.id !== c.id)));
  };
  const undo = () => {
    const { item, idx } = ui.deleted || {};
    ui.deleted = null;
    if (item) ctx.update((d) => (d.captionBank ||= []).splice(Math.max(0, idx), 0, item));
    else re();
  };
  const card = (c) => {
    const r = rank.get(c.id);
    const editing = ui.editing === c.id;
    return h(
      'li',
      { class: `g6-cap${r ? ' top' : ''}`, 'data-cap': c.id },
      r ? h('span', { class: 'g6-cap-rank', title: `${r.n} post${r.n === 1 ? '' : 's'} with views` }, icon('star', 12), `#${r.place} · ${big(r.views)} views${r.n === 1 ? ' (1 post)' : ` (${r.n} posts)`}`) : null,
      editing
        ? h(
            'div',
            { class: 'g6-cap-edit' },
            f.text(`g6c-t-${c.id}`, 'Caption', c.text, C(c.id, (x, v) => (x.text = v)), { rows: 3 }),
            h(
              'div',
              { class: 'g6-cap-addrow' },
              f.text(`g6c-h-${c.id}`, 'Hashtags', c.hashtags.map((t) => `#${t}`).join(' '), C(c.id, (x, v) => (x.hashtags = parseHashtags(v)))),
              f.select(`g6c-p-${c.id}`, 'App', c.platform, CB_PLATFORMS, C(c.id, (x, v) => (x.platform = v))),
              f.select(`g6c-k-${c.id}`, 'Kind', c.kind, CB_KINDS, C(c.id, (x, v) => (x.kind = v))),
              f.select(`g6c-s-${c.id}`, 'Song', c.songId, [['', 'No song'], ...songs.map((s) => [s.id, s.title])], C(c.id, (x, v) => (x.songId = v))),
            ),
          )
        : h('div', {}, h('p', { class: 'g6-cap-text' }, c.text), c.hashtags.length ? h('p', { class: 'g6-cap-tags small' }, c.hashtags.map((t) => `#${t}`).join(' ')) : null),
      h(
        'div',
        { class: 'g6-cap-foot' },
        h('span', { class: 'mgr-chip' }, cbLabel(CB_PLATFORMS, c.platform)),
        h('span', { class: 'mgr-chip' }, cbLabel(CB_KINDS, c.kind)),
        c.songId ? h('span', { class: 'mgr-chip' }, songTitle(c.songId) || 'Deleted song') : null,
        h('span', { class: 'muted tiny', 'data-k': `g6c-uses-${c.id}` }, c.uses ? `Used ${c.uses}×${c.lastUsed ? `, last ${c.lastUsed}` : ''}` : 'Not used yet'),
        h('span', { class: 'g6-cap-btns' }, button('Copy', () => copy(c), { iconName: 'copy', variant: 'sm primary', title: 'Copy the caption and hashtags, and count a use' }), button(editing ? 'Done' : 'Edit', () => ((ui.editing = editing ? null : c.id), re()), { variant: 'sm ghost' }), iconButton('trash', 'Delete this caption', () => remove(c), 'ghost')),
      ),
    );
  };
  const listBox = h(
    'section',
    { class: 'mgr-sect g6-cap-list' },
    h('h2', {}, `Caption bank · ${bank.length}`),
    ui.deleted ? h('p', { class: 'g6-cap-undo', role: 'status' }, 'Caption deleted. ', button('Undo', undo, { iconName: 'undo', variant: 'sm' }), button('Dismiss', () => ((ui.deleted = null), re()), { variant: 'sm ghost' })) : null,
    bank.length
      ? h(
          'div',
          { class: 'mgr-filters g6-cap-filters' },
          search,
          filt('g6-cap-fplat', 'platform', CB_PLATFORMS.slice(1), 'Any app', 'Filter by app'),
          filt('g6-cap-fkind', 'kind', CB_KINDS, 'Any kind', 'Filter by kind'),
          filt('g6-cap-fsong', 'song', songs.map((s) => [s.id, s.title]), 'Any song', 'Filter by song'),
        )
      : null,
    bank.length ? (shown.length ? h('ul', { class: 'g6-caps' }, shown.map(card)) : h('p', { class: 'muted small', 'data-k': 'g6-cap-none' }, 'No caption matches. Clear the search or a filter.')) : h('p', { class: 'muted small' }, 'No captions yet. Write one above, or save one from a post.'),
  );
  return h('div', { class: 'g6-captions' }, h('div', { class: 'mgr-cols' }, addBox, bestBox), listBox);
}
