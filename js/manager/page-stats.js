// Streaming stats: every song's streams, listeners, saves, earnings and views on one page, from
// Spotify for Artists and distributor exports plus live YouTube, Last.fm and Deezer numbers.
import { h, icon, button, iconButton, toast, pickFiles, keyBox } from '../dom.js';
import { loadSettings, saveSettings } from '../state.js';
import { niceDate } from './model.js';
import { normISRC, deezerByISRC } from './isrc.js';
import { parseLink, fetchYouTubeStats } from './content.js';
import { exportPDF, docHTML, esc } from './pdf.js';
import { normalizeStats, parseStatsFile, addImport, removeImport, assignTitle, songStats, lastfmURL, parseLastfm, parseDeezerRank, setLive } from './stats.js';

export const statsUI = { busy: '', timelineSong: '', sort: 'streams' };
const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : Math.round(n).toLocaleString());
const $ = (n) => `$${n.toLocaleString(undefined, { minimumFractionDigits: n && n < 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const ext = (href, text) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A small line chart of monthly streams. */
function spark(points) {
  if (points.length < 2) return h('span', { class: 'muted tiny' }, points.length ? '1 month' : '');
  const max = Math.max(...points.map((p) => p[1]), 1);
  const w = 90;
  const hh = 24;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${((i / (points.length - 1)) * w).toFixed(1)} ${(hh - (p[1] / max) * (hh - 2) - 1).toFixed(1)}`).join(' ');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${hh}`);
  svg.setAttribute('width', w);
  svg.setAttribute('height', hh);
  svg.setAttribute('class', 'st-spark');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Monthly streams: ${points.map((p) => `${p[0]} ${p[1]}`).join(', ')}`);
  svg.innerHTML = `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>`;
  return svg;
}

export function buildStats(ctx) {
  const m = ctx.store.get();
  const ui = statsUI;
  const stats = normalizeStats(m.stats);
  const sum = songStats(stats, m.songs);
  const settings = loadSettings();
  const re = () => ctx.go('stats');
  const S = (fn) => (d) => {
    d.stats = normalizeStats(d.stats);
    fn(d.stats, d);
  };

  // ---- imports
  const importFiles = async (files) => {
    const picked = files || (await pickFiles('.csv,.tsv,.txt,text/csv,text/tab-separated-values', true));
    if (!picked.length) return;
    let total = 0;
    for (const f of picked) {
      try {
        const res = parseStatsFile(await f.text(), { filename: f.name, songs: m.songs, songId: ui.timelineSong });
        let info = null;
        ctx.update(S((st) => (info = addImport(st, { filename: f.name, kind: res.kind, lines: res.lines }))));
        total += res.lines.length;
        const matched = res.lines.filter((l) => l.songId).length;
        toast(`${res.kind.label}: ${res.lines.length} rows from “${f.name}”${info && info.replaced ? ' (replaced the earlier import of this file)' : ''}. ${matched} matched to your songs${matched < res.lines.length ? '; match the rest below' : ''}.`, 'info', 7000);
      } catch (e) {
        toast(`${f.name}: ${e.message}`, 'error', 8000);
      }
    }
    if (total) ui.timelineSong = '';
  };

  // ---- live numbers
  const refresh = async () => {
    const s = loadSettings();
    const band = m.band.name;
    ui.busy = 'live';
    re();
    const notes = [];
    try {
      const ytIds = Object.fromEntries(m.songs.map((sg) => [sg.id, parseLink(sg.links.youtube || sg.links.youtubeMusic || '')]).filter(([, p]) => (p.platform === 'YouTube' || p.platform === 'Shorts') && /^[\w-]{11}$/.test(p.id)).map(([id, p]) => [id, p.id]));
      if (Object.keys(ytIds).length && s.youtubeKey) {
        try {
          const got = await fetchYouTubeStats(Object.values(ytIds), s.youtubeKey);
          ctx.update(S((st) => {
            for (const [songId, vid] of Object.entries(ytIds)) if (got[vid]) setLive(st, songId, 'youtube', { views: got[vid].views, likes: got[vid].likes, comments: got[vid].comments });
          }));
          notes.push(`YouTube: ${Object.keys(got).length} video${Object.keys(got).length === 1 ? '' : 's'}`);
        } catch (e) {
          notes.push(`YouTube: ${e.message}`);
        }
      } else if (Object.keys(ytIds).length) notes.push('YouTube: add your API key on the Content page');
      if (s.lastfmKey && band) {
        let k = 0;
        for (const sg of m.songs) {
          try {
            const r = await fetch(lastfmURL(band, sg.title, s.lastfmKey));
            const j = await r.json();
            if (j && j.error === 10) throw new Error('Last.fm did not accept the API key');
            const v = parseLastfm(j);
            if (v) (ctx.update(S((st) => setLive(st, sg.id, 'lastfm', { listeners: v.listeners, plays: v.plays }))), k++);
          } catch (e) {
            notes.push(`Last.fm: ${e.message}`);
            break;
          }
          await sleep(250);
        }
        notes.push(`Last.fm: ${k} of ${m.songs.length} songs found`);
      }
      let dz = 0;
      for (const sg of m.songs.filter((x) => normISRC(x.isrc))) {
        const v = parseDeezerRank(await deezerByISRC(sg.isrc));
        if (v) (ctx.update(S((st) => setLive(st, sg.id, 'deezer', { rank: v.rank }))), dz++);
      }
      if (m.songs.some((x) => normISRC(x.isrc))) notes.push(`Deezer: ${dz} found by ISRC`);
    } finally {
      ui.busy = '';
      re();
      toast(notes.length ? notes.join(' · ') : 'Nothing to look up: add YouTube links, ISRCs or a Last.fm key.', 'info', 7000);
    }
  };

  const lfmIn = h('input', { type: 'password', autocomplete: 'off', placeholder: 'Paste your Last.fm API key', value: settings.lastfmKey || '' });
  lfmIn.addEventListener('change', () => {
    const st = loadSettings();
    st.lastfmKey = lfmIn.value.trim();
    saveSettings(st);
    toast(st.lastfmKey ? 'Last.fm key saved in this browser only' : 'Last.fm key removed');
    re();
  });
  const timelineSel = h('select', { 'aria-label': 'Song for a timeline file', 'data-k': 'st-tl' }, h('option', { value: '' }, 'Files name their songs'), m.songs.map((s) => h('option', { value: s.id, selected: ui.timelineSong === s.id }, `Every row is “${s.title}”`)));
  timelineSel.addEventListener('change', () => (ui.timelineSong = timelineSel.value));

  // ---- the table
  const stores = sum.stores.slice(0, 4).map(([k]) => k);
  const sorted = [...sum.rows].sort((a, b) => (ui.sort === 'title' ? a.title.localeCompare(b.title) : (b[ui.sort] || 0) - (a[ui.sort] || 0)));
  const th = (label, key) => h('th', { class: key ? 'n sortable' : 'n' }, key ? h('button', { type: 'button', class: `link${ui.sort === key ? ' on' : ''}`, onclick: () => ((ui.sort = key), re()) }, label) : label);
  const rows = sorted.map((r) =>
    h(
      'tr',
      {},
      h('td', {}, h('button', { type: 'button', class: 'link', onclick: () => ctx.go('songs', r.id) }, r.title)),
      h('td', { class: 'n' }, r.streams ? h('strong', {}, fmt(r.streams)) : h('span', { class: 'muted' }, '—')),
      ...stores.map((k) => h('td', { class: 'n' }, r.byStore[k] ? fmt(r.byStore[k].streams) : h('span', { class: 'muted' }, '—'))),
      h('td', { class: 'n' }, r.listeners ? fmt(r.listeners) : h('span', { class: 'muted' }, '—')),
      h('td', { class: 'n' }, r.saves ? fmt(r.saves) : h('span', { class: 'muted' }, '—')),
      h('td', { class: 'n' }, r.youtube ? h('span', { title: `${r.youtube.likes} likes · checked ${niceDate(r.youtube.at.slice(0, 10), { weekday: false })}` }, fmt(r.youtube.views)) : h('span', { class: 'muted' }, '—')),
      h('td', { class: 'n' }, r.lastfm ? h('span', { title: `${r.lastfm.listeners} listeners` }, fmt(r.lastfm.plays)) : h('span', { class: 'muted' }, '—')),
      h('td', { class: 'n' }, r.deezer ? h('span', { title: 'Deezer rank: a popularity score that rises with recent plays' }, fmt(r.deezer.rank)) : h('span', { class: 'muted' }, '—')),
      h('td', { class: 'n' }, r.earnings ? $(r.earnings) : h('span', { class: 'muted' }, '—')),
      h('td', { class: 'st-trend' }, spark(r.monthly)),
    ),
  );

  const pdf = () => {
    const body = `<table><tr><th>Song</th><th class="n">Streams</th>${stores.map((k) => `<th class="n">${esc(k)}</th>`).join('')}<th class="n">Listeners</th><th class="n">Saves</th><th class="n">YouTube views</th><th class="n">Last.fm scrobbles</th><th class="n">Earnings</th></tr>
${sorted.map((r) => `<tr><td>${esc(r.title)}</td><td class="n"><b>${r.streams.toLocaleString()}</b></td>${stores.map((k) => `<td class="n">${r.byStore[k] ? r.byStore[k].streams.toLocaleString() : '—'}</td>`).join('')}<td class="n">${r.listeners ? r.listeners.toLocaleString() : '—'}</td><td class="n">${r.saves ? r.saves.toLocaleString() : '—'}</td><td class="n">${r.youtube ? r.youtube.views.toLocaleString() : '—'}</td><td class="n">${r.lastfm ? r.lastfm.plays.toLocaleString() : '—'}</td><td class="n">${r.earnings ? $(r.earnings) : '—'}</td></tr>`).join('')}
<tr><th>Total</th><th class="n">${sum.total.streams.toLocaleString()}</th>${stores.map((k) => `<th class="n">${(sum.stores.find((s) => s[0] === k) || [0, { streams: 0 }])[1].streams.toLocaleString()}</th>`).join('')}<th></th><th></th><th class="n">${sum.total.youtube.toLocaleString()}</th><th class="n">${sum.total.lastfm.toLocaleString()}</th><th class="n">${$(sum.total.earnings)}</th></tr></table>
<h2>By store</h2><table><tr><th>Store</th><th class="n">Streams</th><th class="n">Earnings</th><th class="n">Per 1,000 streams</th></tr>${sum.stores.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${v.streams.toLocaleString()}</td><td class="n">${$(v.earnings)}</td><td class="n">${v.paid && v.earnings ? $((v.earnings / v.paid) * 1000) : '—'}</td></tr>`).join('')}</table>
<h2>Sources</h2><ul>${stats.imports.map((x) => `<li>${esc(x.label)}: ${esc(x.name)} (${x.rows} rows, imported ${esc(x.at.slice(0, 10))})</li>`).join('') || '<li>No imports yet</li>'}</ul>`;
    exportPDF(docHTML(`${m.band.name || 'Band'} · streaming stats`, body, { subtitle: `As of ${ctx.today()}` }), `${m.band.name || 'Band'} streaming stats`);
    toast('Pick “Save as PDF” as the printer to get a PDF.');
  };

  const songOpts = m.songs.map((s) => [s.id, s.title]);
  return h(
    'div',
    { class: 'mgr-page wide' },
    h(
      'header',
      { class: 'mgr-head' },
      h('div', {}, h('h1', {}, 'Streaming stats'), h('p', { class: 'muted' }, 'Every song’s streams, listeners, saves, views and earnings in one place.')),
      h('div', { class: 'row' }, button(ui.busy === 'live' ? 'Checking…' : 'Refresh live numbers', refresh, { iconName: 'repeat', variant: 'sm', disabled: ui.busy === 'live', title: 'YouTube views, Last.fm scrobbles and Deezer rank, right now' }), button('Export PDF', pdf, { iconName: 'print', variant: 'sm' }), button('Import a report', () => importFiles(), { iconName: 'upload', variant: 'sm primary' })),
    ),
    h(
      'div',
      { class: 'mgr-cards' },
      h('div', { class: 'mgr-card stat' }, h('span', { class: 'mgr-card-k' }, 'Streams'), h('strong', {}, fmt(sum.total.streams)), h('span', { class: 'muted tiny' }, `${sum.stores.length} store${sum.stores.length === 1 ? '' : 's'}`)),
      h('div', { class: 'mgr-card stat' }, h('span', { class: 'mgr-card-k' }, 'Earnings'), h('strong', { class: 'ok' }, $(sum.total.earnings)), h('span', { class: 'muted tiny' }, sum.total.paid && sum.total.earnings ? `${$((sum.total.earnings / sum.total.paid) * 1000)} per 1,000 paid streams` : 'from distributor reports')),
      h('div', { class: 'mgr-card stat' }, h('span', { class: 'mgr-card-k' }, 'YouTube views'), h('strong', {}, fmt(sum.total.youtube))),
      h('div', { class: 'mgr-card stat' }, h('span', { class: 'mgr-card-k' }, 'Last.fm scrobbles'), h('strong', {}, fmt(sum.total.lastfm))),
    ),
    h(
      'section',
      { class: 'mgr-sect' },
      h('h2', {}, `Songs · ${m.songs.length}`),
      m.songs.length
        ? h('div', { class: 'st-scroll' }, h('table', { class: 'mgr-table st-table' }, h('thead', {}, h('tr', {}, h('th', {}, h('button', { type: 'button', class: `link${ui.sort === 'title' ? ' on' : ''}`, onclick: () => ((ui.sort = 'title'), re()) }, 'Song')), th('All streams', 'streams'), ...stores.map((k) => th(k)), th('Spotify listeners', 'listeners'), th('Saves', 'saves'), th('YouTube views'), th('Last.fm scrobbles'), th('Deezer rank'), th('Earnings', 'earnings'), h('th', {}, 'By month'))), h('tbody', {}, rows)))
        : h('p', { class: 'muted small' }, 'Add your songs first (Songs page).'),
      sum.total.streams || Object.keys(stats.live).length ? null : h('p', { class: 'muted small' }, 'No numbers yet. Import a Spotify for Artists or distributor report, or press Refresh live numbers.'),
    ),
    sum.unmatched.length
      ? h(
          'section',
          { class: 'mgr-sect' },
          h('h2', {}, `Rows not matched to a song · ${sum.unmatched.length}`),
          h('p', { class: 'muted small' }, 'These titles are in a report but not in your Songs (or are spelled differently). Pick the song each belongs to. Adding the ISRC to a song matches it exactly next time.'),
          h('ul', { class: 'st-unmatched' }, sum.unmatched.slice(0, 30).map(([title, n]) => {
            const sel = h('select', { 'aria-label': `Song for ${title}` }, h('option', { value: '' }, 'Pick the song…'), songOpts.map(([v, l]) => h('option', { value: v }, l)));
            sel.addEventListener('change', () => sel.value && ctx.update(S((st) => assignTitle(st, title, sel.value))));
            return h('li', {}, h('span', {}, h('strong', {}, title), h('span', { class: 'muted tiny' }, ` · ${fmt(n)} streams`)), sel);
          })),
        )
      : null,
    h(
      'div',
      { class: 'mgr-cols' },
      h(
        'section',
        { class: 'mgr-sect' },
        h('h2', {}, 'By store'),
        sum.stores.length
          ? h('table', { class: 'mgr-table' }, h('thead', {}, h('tr', {}, ['Store', 'Streams', 'Earnings', 'Per 1,000'].map((x, i) => h('th', { class: i ? 'n' : '' }, x)))), h('tbody', {}, sum.stores.map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', { class: 'n' }, fmt(v.streams)), h('td', { class: 'n' }, v.earnings ? $(v.earnings) : '—'), h('td', { class: 'n' }, v.paid && v.earnings ? $((v.earnings / v.paid) * 1000) : '—')))))
          : h('p', { class: 'muted small' }, 'Import your distributor’s report to see every store: Spotify, Apple Music, Amazon, YouTube Music, TikTok, Deezer, Tidal…'),
      ),
      h(
        'section',
        { class: 'mgr-sect' },
        h('h2', {}, 'Where the numbers come from'),
        h(
          'ul',
          { class: 'mgr-facts st-sources' },
          h('li', {}, h('span', {}, 'Spotify'), h('span', { class: 'small' }, 'No API has stream counts. In ', ext('https://artists.spotify.com/', 'Spotify for Artists'), ', go to Music → Songs and press the download arrow, then import the CSV here (a song’s own timeline CSV works too: pick the song below first).')),
          h('li', {}, h('span', {}, 'Apple, Amazon, TikTok, Tidal…'), h('span', { class: 'small' }, 'None has an artist API. Your distributor’s detailed report has every store. DistroKid: Bank → See Excruciating Detail → download. TuneCore, CD Baby and Amuse have similar sales or earnings exports.')),
          h('li', {}, h('span', {}, 'YouTube'), h('span', { class: 'small' }, settings.youtubeKey ? 'Live views from each song’s YouTube link (key from the Content page).' : 'Add a YouTube Data API key on the Content page, and a YouTube link on each song.')),
          h('li', {}, h('span', {}, 'Last.fm'), h('span', { class: 'small' }, 'Listeners and scrobbles from people who track their listening, so lower than real plays, but live and free.')),
          h('li', {}, h('span', {}, 'Deezer'), h('span', { class: 'small' }, 'A rank (popularity score) found by each song’s ISRC. No key.')),
        ),
        keyBox('Last.fm API key', lfmIn, { saved: !!settings.lastfmKey, help: h('span', {}, 'Free: ', ext('https://www.last.fm/api/account/create', 'create a Last.fm API account'), ' and paste the API key. Stored in this browser only.') }),
        h('div', { class: 'row' }, timelineSel, button('Import a report', () => importFiles(), { iconName: 'upload', variant: 'sm' })),
        stats.imports.length
          ? h('ul', { class: 'st-imports' }, stats.imports.map((x) => h('li', {}, icon('file', 14), h('span', {}, h('strong', {}, x.label), ` · ${x.name}`, h('span', { class: 'muted tiny' }, ` · ${x.rows} rows, ${x.matched} matched · ${niceDate(x.at.slice(0, 10), { weekday: false })}`)), iconButton('trash', `Remove the ${x.name} import`, () => confirm(`Remove “${x.name}” and its ${x.rows} rows?`) && ctx.update(S((st) => removeImport(st, x.id))), 'ghost'))))
          : h('p', { class: 'muted tiny' }, 'Importing the same file again replaces it, so streams aren’t counted twice.'),
      ),
    ),
  );
}
