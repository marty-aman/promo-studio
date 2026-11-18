// Pop-up tips while you edit: compare the project before and after a change and suggest the next
// improvement (one at a time). Pure so it can be unit tested; panel-tips.js shows them.
//
// tipsFor(prev, next, ctx) -> [{ id, text, fix? }]
//   ctx: { stems: [{ id, name }] }  audio files that aren't the song (drum, bass, vocal stems)
//   fix kinds: { kind: 'vizSource', layerId, source } | { kind: 'lyricsClear', layerId } | { kind: 'layout' }
//              | { kind: 'tab', tab, fold? } | { kind: 'lyricIdeas' } | { kind: 'postcheck' }

const visible = (L) => L.visible !== false;
const overlays = (p) => (p.layers || []).filter((L) => L.type !== 'video' && visible(L));

/** Where a layer sits vertically, in % of the frame: [top, bottom]. */
function span(L) {
  const hgt = L.type === 'viz' ? (L.size || 70) * 0.6 : L.height || 18;
  const y = L.y ?? 50;
  return [y - hgt / 2, y + hgt / 2];
}

/** Do one-line lyrics sit on top of layer L? */
export function lyricsOverlap(p, L) {
  const ls = p.lyricStyle || {};
  if (!(p.lyrics || []).length || (ls.display && ls.display !== 'line')) return false;
  if (L.type === 'viz' && !['vu', 'eq', 'scope', 'speaker', 'spectrogram', 'tape', 'faders', 'strings'].includes(L.style)) return false; // glows and ripples sit behind text fine
  const [a, b] = span(L);
  const half = (ls.size || 7) * 0.9;
  const y = ls.y ?? 72;
  return y + half > a && y - half < b;
}

/** A spot for the lyrics clear of layer L (below it if there is room, else above). */
export function clearLyricY(p, L) {
  const [a, b] = span(L);
  const half = ((p.lyricStyle && p.lyricStyle.size) || 7) * 0.9;
  const below = b + half + 2;
  return +(below <= 80 ? below : Math.max(12, a - half - 2)).toFixed(1);
}

export function tipsFor(prev, next, ctx = {}) {
  if (!prev || !next) return [];
  const out = [];
  const add = (id, text, fix) => out.push({ id, text, fix: fix || null });
  const before = new Set((prev.layers || []).map((L) => L.id));
  const added = (next.layers || []).filter((L) => !before.has(L.id));
  const stems = ctx.stems || [];

  for (const L of added) {
    if (L.type === 'viz' && L.source === 'song') {
      const drum = stems.find((s) => /drum|kick|perc/i.test(s.name));
      const bass = stems.find((s) => /bass/i.test(s.name));
      const pickStem = ['ripple', 'particles', 'speaker', 'rings'].includes(L.style) ? drum : L.style === 'electric' || L.style === 'lightning' ? bass || drum : null;
      if (pickStem) add('viz-stem', `This visualizer reacts to the whole song. Point it at “${pickStem.name}” so it hits with the ${pickStem === drum ? 'kick and snare' : 'bass'}.`, { kind: 'vizSource', layerId: L.id, source: pickStem.id });
    }
    if ((L.type === 'tab' || L.type === 'drums') && lyricsOverlap(next, L)) add('overlap', `The lyrics sit on top of the new ${L.type === 'tab' ? 'tab' : 'drum chart'}. Move them clear?`, { kind: 'lyricsClear', layerId: L.id });
    if (L.type === 'viz' && !next.theme && L.classic === false) add('viz-theme', 'Pick a theme and this visualizer takes its colours, along with everything else.', { kind: 'tab', tab: 'start', fold: 'start-templates' });
  }
  if (added.length && overlays(next).length >= 3 && overlays(prev).length < 3) add('busy', `${overlays(next).length} charts and visualizers are on screen at once. Viewers watch the band: keep one or two, or show them at different times.`, { kind: 'tab', tab: 'video', fold: 'all-layers' });

  // clips: the second clip is when cutting on the beat starts to matter
  if ((next.clips || []).length >= 2 && (prev.clips || []).length < 2 && next.song && !next.beats) add('beats', 'Detect the BPM, then “Auto-edit to the beat” cuts your clips on the drums.', { kind: 'tab', tab: 'audio', fold: 'audio-song' });

  // a song longer than a promo
  if (next.song && !prev.song && next.duration > 20) add('hook', 'Promos do best at 7–15 s. “Find the hook” picks the loudest part of the song.', { kind: 'tab', tab: 'audio', fold: 'audio-song' });

  // lyrics pasted
  if ((next.lyrics || []).length >= 2 && (prev.lyrics || []).length < 2) add('lyric-ideas', 'Your lyrics are in. See the theme, visualizer and line looks that fit the words.', { kind: 'lyricIdeas' });

  // text moved off-screen-safe area by hand
  if (next.aspect === '9:16' && (!next.layout || next.layout === 'full') && (next.lyricStyle && next.lyricStyle.y > 80) && !(prev.lyricStyle && prev.lyricStyle.y > 80)) add('safe', 'Lyrics this low sit under the app’s caption and buttons. Fit them to the clear area?', { kind: 'layout' });

  // a template or theme without cover art for the end card
  if ((next.template !== prev.template || (next.theme && (!prev.theme || next.theme.id !== prev.theme.id))) && next.endCard && next.endCard.enabled && !next.endCard.coverMediaId) add('cover', 'Add your cover art: the end card is where people find the song.', { kind: 'tab', tab: 'endcard' });

  return out;
}
