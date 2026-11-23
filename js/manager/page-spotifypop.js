// The Spotify popularity box (song page Overview and the Streaming stats page) and the small
// score cell in the stats table. Data is `song.spotifyPop` (see spotifypop.js).
import { h, button, iconButton, toast, onDateCommit } from '../dom.js';
import { niceDate } from './model.js';
import { scoreSummary, addScore, editScore, deleteScore, checkedLabel, changeLabel, trendPath, normalizeSpotifyPop, entryError, cleanScore, SPOTIFY_STALE_DAYS } from './spotifypop.js';

/** Why the number is typed in (shown on both pages). */
export const SPOTIFY_POP_NOTE = 'Spotify stopped giving its popularity score (0–100) to apps like this one in February 2026, so it can’t be looked up here. Check it where you usually do (SubmitHub, Chartmetric, an artist tool) and type it in with the date. The app keeps the history and shows the trend.';

/** What you are typing in each song's add form (not saved), so a redraw doesn't lose it. */
export const spotifyUI = { draft: {} };

/** The trend line on a 0–100 scale (one point is just a dot's worth of nothing: no line). */
export function scoreTrend(points, { w = 90, hh = 24 } = {}) {
  const d = trendPath(points, w, hh);
  if (!d) return null;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${hh}`);
  svg.setAttribute('width', w);
  svg.setAttribute('height', hh);
  svg.setAttribute('class', 'sp-trend');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Spotify popularity over time: ${points.map((p) => `${p.date} ${p.score}`).join(', ')}`);
  svg.innerHTML = `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`;
  return svg;
}

const changeChip = (c) => (c === null ? null : h('span', { class: `sp-change ${c > 0 ? 'up' : c < 0 ? 'down' : 'same'}`, title: 'Change since the previous check' }, changeLabel(c)));

/** The stats table cell: the score, its change, the trend and when it was checked; or an Add score button. */
export function spotifyCell(song, today, onAdd) {
  const s = scoreSummary(song, today);
  if (!s.latest) return button('Add score', onAdd, { variant: 'sm ghost sp-add', title: `Type in “${song.title}”’s Spotify popularity` });
  return h(
    'div',
    { class: 'sp-cell', 'data-sp': song.id },
    h('span', { class: 'sp-cell-top' }, h('strong', { title: `Spotify popularity on ${niceDate(s.latest.date, { weekday: false })}` }, String(s.latest.score)), changeChip(s.change), scoreTrend(s.points, { w: 54, hh: 18 })),
    h('button', { type: 'button', class: `link tiny${s.stale ? ' sp-stale' : ' muted'}`, onclick: onAdd, title: s.stale ? `Older than ${SPOTIFY_STALE_DAYS} days: check it again` : 'Add a newer score' }, s.stale ? `${checkedLabel(s.days)}: check again` : checkedLabel(s.days)),
  );
}

/**
 * The full box: the latest score, an add form (score and date) and the history to edit or delete.
 * `S(fn)` gives an updater that runs `fn(song, value)` on this song in the saved data.
 */
export function spotifyScoreBox(ctx, song, S, { heading = 'h2', nested = false } = {}) {
  const f = ctx.form;
  const today = ctx.today();
  const sum = scoreSummary(song, today);
  const draft = (spotifyUI.draft[song.id] ||= { score: '', date: today });
  const scoreIn = h('input', { type: 'number', min: '0', max: '100', step: '1', inputmode: 'numeric', value: draft.score, placeholder: '0–100', 'data-k': `sp-score-${song.id}`, 'aria-label': `Spotify popularity for ${song.title} (0 to 100)`, class: 'sp-score-in' });
  scoreIn.addEventListener('input', () => (draft.score = scoreIn.value));
  const dateIn = h('input', { type: 'date', value: draft.date, max: today, 'data-k': `sp-date-${song.id}`, 'aria-label': 'Date you checked it' });
  onDateCommit(dateIn, (v) => (draft.date = v));
  const err = h('p', { class: 'sp-err small', role: 'alert', hidden: true });
  const add = () => {
    draft.score = scoreIn.value;
    draft.date = dateIn.value;
    const msg = entryError(draft.score, draft.date, today);
    if (msg) {
      err.textContent = msg;
      err.hidden = false;
      (cleanScore(draft.score) === null ? scoreIn : dateIn).focus();
      return;
    }
    const { score, date } = draft;
    const replaced = normalizeSpotifyPop(song.spotifyPop).some((e) => e.date === date);
    spotifyUI.draft[song.id] = { score: '', date: today }; // the redraw after saving shows an empty form
    ctx.update(S((s) => addScore(s, score, date, today)));
    toast(`${replaced ? 'Replaced the score' : 'Saved'} for “${song.title}”: ${score} on ${niceDate(date, { weekday: false })}`);
  };
  scoreIn.addEventListener('keydown', (e) => e.key === 'Enter' && add());
  const E = (id, field) => S((s, v) => {
    const msg = editScore(s, id, { [field]: field === 'score' ? String(v) : v }, today);
    if (msg) toast(msg, 'error');
  });
  const H = heading;
  return h(
    'section',
    { class: nested ? 'sp-box sp-nested' : 'mgr-sect sp-box', 'data-sp-box': song.id },
    h('div', { class: 'mgr-sect-head' }, h(H, {}, nested ? `“${song.title}”` : 'Spotify popularity'), sum.latest ? h('span', { class: 'sp-latest' }, h('strong', {}, String(sum.latest.score)), changeChip(sum.change)) : null),
    sum.latest
      ? h('p', { class: `small${sum.stale ? ' warn-note sp-stale' : ' muted'}`, 'data-k': `sp-when-${song.id}` }, `${sum.latest.score} of 100, ${checkedLabel(sum.days)} (${niceDate(sum.latest.date, { weekday: false })}).`, sum.stale ? ` That’s over ${SPOTIFY_STALE_DAYS} days: check it again.` : '')
      : h('p', { class: 'muted small sp-none' }, `No score yet for “${song.title}”. Add score: type it in with the date you checked it.`),
    sum.points.length > 1 ? h('div', { class: 'sp-trend-wrap' }, scoreTrend(sum.points, { w: 240, hh: 48 })) : null,
    h('div', { class: 'sp-addrow' }, h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Score'), scoreIn), h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Checked on'), dateIn), button('Add score', add, { iconName: 'plus', variant: 'sm primary' })),
    err,
    sum.points.length
      ? h(
          'details',
          { class: 'sp-history', open: sum.points.length <= 6 },
          h('summary', { class: 'small' }, `History · ${sum.points.length}`),
          h(
            'ul',
            { class: 'sp-list' },
            [...sum.points].reverse().map((e, i, arr) => {
              const prev = arr[i + 1];
              return h(
                'li',
                { 'data-sp-entry': e.id },
                f.text(`sp-ed-${e.id}`, '', e.date, E(e.id, 'date'), { type: 'date', aria: `Date of the ${e.score} score` }),
                f.text(`sp-es-${e.id}`, '', String(e.score), E(e.id, 'score'), { type: 'number', aria: `Score on ${e.date}` }),
                prev ? changeChip(e.score - prev.score) : h('span'),
                iconButton('trash', `Delete the score from ${niceDate(e.date, { weekday: false })}`, () => ctx.update(S((s) => deleteScore(s, e.id))), 'ghost'),
              );
            }),
          ),
        )
      : null,
    nested ? null : h('p', { class: 'muted tiny' }, SPOTIFY_POP_NOTE),
  );
}
