// "Post check": how likely the current edit is to do well, judged against the posting playbook
// (Inspiration page). Pure function of the project so it can run on every change and be unit tested.
//
// Each finding: { id, level: 'bad' | 'warn' | 'tip' | 'good', title, detail, fix? }
// fix: { kind: 'playbook', action } (runs the playbook's Apply), { kind: 'aspect' }, { kind: 'layout' },
//      or { kind: 'tab', tab, fold? } (opens where you fix it yourself).

const AREA = [0.04, 0.11, 0.83, 0.79]; // the clear area that works on TikTok, Reels and Shorts
const PENALTY = { bad: 22, warn: 9, tip: 3, good: 0 };

const shown = (p, key) => !(p.layerVis && p.layerVis[key] === false);
const toTimeline = (songT, song) => songT - (song ? song.offset || 0 : 0);

export function postCheck(p) {
  const out = [];
  const add = (id, level, title, detail, fix) => out.push({ id, level, title, detail, fix: fix || null });
  const ecLen = p.endCard && p.endCard.enabled ? p.endCard.duration || 0 : 0;
  const content = Math.max(0, (p.duration || 0) - ecLen);
  const texts = shown(p, 'text') ? p.texts || [] : [];
  const lyrics = shown(p, 'lyrics') ? p.lyrics || [] : [];
  const layers = (p.layers || []).filter((L) => L.visible !== false);
  const clips = shown(p, 'video') ? p.clips || [] : [];

  // format
  if (p.aspect !== '9:16') add('aspect', 'bad', 'Not vertical', 'Reels, TikTok and Shorts favour original 9:16 video. Other shapes get bars or are cropped.', { kind: 'aspect' });

  // the basics
  if (!p.song) add('song', 'bad', 'No song', 'A music promo needs your track so people can find and use the sound.', { kind: 'tab', tab: 'audio' });
  if (!clips.length && !layers.some((L) => L.type === 'video')) add('footage', 'bad', 'No footage', 'Add clips of the band. Real performance footage beats text on a background.', { kind: 'tab', tab: 'video' });

  // hook in the first 1.5 s
  const early = (a, b) => a < 1.5 && b > 0.05;
  const hasEarlyText = texts.some((t) => early(t.start, t.end));
  const hasEarlyLyric = lyrics.some((l) => early(toTimeline(l.start, p.song), toTimeline(l.end, p.song)));
  const hasEarlyVisual = layers.some((L) => (L.type === 'tab' || L.type === 'drums' || L.type === 'viz') && (L.start || 0) < 1.5);
  if (hasEarlyText || hasEarlyLyric) add('hook', 'good', 'Hook on screen from the start', 'Words show in the first 1.5 seconds, while viewers decide whether to stay.');
  else add('hook', hasEarlyVisual ? 'warn' : 'bad', 'No hook in the first 1.5 s', 'Viewers decide in about 1.5 seconds. Put a line of text or a lyric on screen from frame one, over the strongest part of the song.', { kind: 'playbook', action: 'hook' });

  // length
  if (content > 0) {
    const s = Math.round(content);
    if (content < 6) add('length', 'warn', `Very short (${s} s)`, 'Under 6 seconds rarely shows enough of the song. 7–15 s is the sweet spot for performance clips.', { kind: 'playbook', action: 'length' });
    else if (content <= 15.5) add('length', 'good', `Good length (${s} s)`, '7–15 s clips get watched to the end and replayed.');
    else if (content <= 30) add('length', 'warn', `Long for a performance clip (${s} s)`, 'Most viewers leave before 30 s. 7–15 s gets more full watches and replays.', { kind: 'playbook', action: 'length' });
    else add('length', content > 60 ? 'bad' : 'warn', `Too long (${s} s)`, 'Long promos lose most viewers before the end. Cut it to the 12–15 s hook, or batch several short clips instead.', { kind: 'playbook', action: 'length' });
  }

  // pace of the cuts
  if (clips.length && content >= 6) {
    const avg = content / clips.length;
    if (clips.length === 1) add('cuts', 'warn', 'One long shot', 'Cut every 1–3 seconds (or on the beat) to hold attention, unless it is a live one-take.', { kind: 'tab', tab: 'video', fold: 'video-clips' });
    else if (avg > 4) add('cuts', 'tip', `Slow cuts (${avg.toFixed(1)} s each)`, 'Faster cuts on the beat usually hold viewers longer. Try “Auto-edit to the beat”.', { kind: 'tab', tab: 'video', fold: 'video-clips' });
  }

  // calls to action
  const said = (re) => texts.some((t) => re.test(t.text || '')) || re.test((p.endCard && p.endCard.cta) || '');
  if (said(/\b(send|share|tag)\b/i) || texts.some((t) => t.kind === 'share')) add('shares', 'good', 'Asks for shares', 'DM shares count about 4× more than likes on Instagram.');
  else add('shares', 'warn', 'No share ask', 'Ask people to send it to a friend. Shares are weighted far above likes.', { kind: 'playbook', action: 'shares' });
  if (!said(/use (this|the|our) sound/i)) add('sound', 'tip', 'No “use this sound”', 'Each video made with your track shows it to a new audience.', { kind: 'playbook', action: 'sound' });

  // text under the app buttons
  if (p.aspect === '9:16' && (!p.layout || p.layout === 'full')) {
    const [x0, y0, x1, y1] = AREA.map((v) => v * 100);
    const outside = (x, y) => y > y1 || y < y0 || x > x1 + 2 || x < x0 - 2;
    const ls = p.lyricStyle || {};
    const lyricOut = lyrics.length && ls.display !== 'sheet' && ls.display !== 'tunnel' && outside(ls.x ?? 50, ls.y ?? 72);
    const textOut = texts.some((t) => outside(t.x ?? 50, t.y ?? 18));
    if (lyricOut || textOut) add('safe', 'warn', 'Text under the app buttons', `${lyricOut ? 'Lyrics' : 'Some text'} sit where TikTok, Reels or Shorts put their buttons and caption, so they will be covered.`, { kind: 'layout' });
  }

  // too much at once
  const busy = layers.filter((L) => L.type !== 'video').length;
  if (busy >= 3) add('busy', 'warn', `A lot on screen (${busy} layers)`, 'Three or more charts and visualizers at once compete with the band. Keep one or two, or show them at different times.', { kind: 'tab', tab: 'video', fold: 'all-layers' });

  // end card
  if (ecLen > 3 && content <= 20) add('endcard', 'tip', `Long end card (${ecLen.toFixed(1)} s)`, 'People swipe at the end card. 2–3 seconds keeps more of them for the loop.', { kind: 'tab', tab: 'endcard' });

  const score = Math.max(0, Math.min(100, 100 - out.reduce((s, f) => s + PENALTY[f.level], 0)));
  const verdict = score >= 80 ? 'strong' : score >= 60 ? 'ok' : 'risky';
  const label = { strong: 'Likely to do well', ok: 'Could do better', risky: 'Likely to struggle' }[verdict];
  const order = { bad: 0, warn: 1, tip: 2, good: 3 };
  out.sort((a, b) => order[a.level] - order[b.level]);
  return { score, verdict, label, items: out };
}
