// Suggested captions for the current edit (video) or a carousel, following what the 2026 caption
// research found works (see CAPTION_SOURCES):
//  - a 3-7 word hook first: only the first line or ~125 characters show before "more"
//  - searchable keywords in plain words (Instagram and TikTok search read the caption text)
//  - one specific ask, best of all a share to a friend's DMs (Instagram weighs sends most)
//  - at most 5 hashtags (Instagram's cap), 3-5 niche ones beat many generic ones
//  - TikTok: short, under ~150 characters; Instagram: short or a real story, not in between
export const CAPTION_RESEARCHED_ON = 'November 18, 2026';
export const CAPTION_SOURCES = [
  { label: 'Vaizle: viral Instagram captions 2026 (keywords over hashtags, 5-tag cap)', url: 'https://insights.vaizle.com/best-captions-for-instagram-posts-and-reels/' },
  { label: 'Vista Social: captions that drive engagement (DM shares)', url: 'https://vistasocial.com/insights/how-to-write-instagram-captions/' },
  { label: 'The Marketing Heaven: TikTok captions that go viral (3-7 word hook, one CTA, ~150 chars)', url: 'https://themarketingheaven.com/best-tiktok-captions-that-go-viral/' },
  { label: 'Crayo: Reel captions (specific questions beat “what do you think?”)', url: 'https://crayo.ai/blog/instagram-reel-caption-ideas' },
  { label: 'Prompt Builder: Instagram captions 2026 (short or long, not middling)', url: 'https://promptbuilder.cc/blog/how-to-write-instagram-captions' },
  { label: 'Creatorflow: carousel structure (slide 1 earns the swipe, end on one ask)', url: 'https://creatorflow.so/blog/instagram-carousel-structure/' },
];

const NICHE_TAGS = {
  heavy: ['#metalcore', '#posthardcore', '#metaltok', '#breakdown'],
  emo: ['#emo', '#emotok', '#alttiktok', '#emoisnotdead'],
  alt: ['#altmetal', '#rocktok', '#alternative', '#newsingle'],
  player: ['#guitartok', '#guitarriff', '#guitarlesson', '#bassguitar'],
  drums: ['#drumtok', '#drummer', '#drumcover'],
};

const tagify = (s) => '#' + String(s || '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** At most `max` unique hashtags, first ones win. */
export function hashtags(list, max = 5) {
  const out = [];
  for (const t of list) {
    const tag = t.startsWith('#') ? t.toLowerCase() : tagify(t);
    if (tag.length > 1 && !out.includes(tag)) out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}

/** The punchiest lyric line: one sung in the hook window, 3-9 words, preferring shorter ones. */
export function bestLyric(lyrics, from = -Infinity, to = Infinity) {
  const lines = (lyrics || []).filter((l) => l && l.text && l.text.trim());
  const score = (l) => {
    const words = l.text.trim().toLowerCase().split(/\s+/);
    const n = words.length;
    const inHook = l.start >= from && l.start < to;
    const repeats = n - new Set(words).size; // "arc flash arc flash" says less than it looks
    return (inHook ? 0 : 10) + (n < 3 ? 6 : n > 9 ? n - 9 : 0) + n * 0.1 + repeats * 1.5;
  };
  return lines.slice().sort((a, b) => score(a) - score(b))[0] || null;
}

function countdown(releaseDate, now = new Date()) {
  if (!releaseDate) return null;
  const d = new Date(`${releaseDate}T00:00:00`);
  if (isNaN(d)) return null;
  const days = Math.round((d - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  if (days > 1) return `out in ${days} days`;
  if (days === 1) return 'out tomorrow';
  return days === 0 ? 'out today' : 'out now';
}

/** Facts about the edit a caption can use. */
export function captionFacts(p, { similar = '', city = '' } = {}) {
  const ec = p.endCard || {};
  const layers = (p.layers || []).filter((l) => l.visible !== false);
  const songFrom = p.song ? p.song.offset : 0;
  const len = Math.max(1, (p.duration || 15) - (ec.enabled ? ec.duration || 0 : 0));
  const lyric = bestLyric(p.lyrics, songFrom, songFrom + len);
  return {
    title: clean(ec.title) && ec.title !== 'Song Title' ? clean(ec.title) : '',
    artist: clean(ec.artist) && ec.artist !== 'Artist Name' ? clean(ec.artist) : '',
    when: countdown(ec.releaseDate) || 'out now',
    preRelease: !!countdown(ec.releaseDate) && countdown(ec.releaseDate) !== 'out now',
    lyric: lyric ? clean(lyric.text) : '',
    similar: clean(similar),
    city: clean(city),
    template: p.template || '',
    trend: p.inspiration || '',
    hasTab: layers.some((l) => l.type === 'tab' && l.mediaId),
    hasBass: layers.some((l) => l.type === 'tab' && /bass/i.test(l.name || '')),
    hasDrums: layers.some((l) => l.type === 'drums'),
    heavy: ['rock', 'hype', 'fullband', 'challenge', 'poster', 'breakdown', 'cleanscream'].includes(p.template) || /breakdown|scream|heavy/i.test(p.inspiration || ''),
    emo: /emo/i.test(p.inspiration || '') || ['vhs', 'spotlight'].includes(p.template),
    seconds: Math.round(len),
  };
}

/**
 * Caption ideas for the edit, best first. kind: 'video' | 'carousel'.
 * Each: { id, style, why, tiktok, instagram, tags }.
 */
export function suggestCaptions(p, { similar = '', city = '', kind = 'video', slides = 5 } = {}) {
  const f = captionFacts(p, { similar, city });
  const song = f.title ? `“${f.title}”` : 'our new song';
  const band = f.artist || 'us';
  const genre = f.heavy ? 'metalcore' : f.emo ? 'emo' : 'alt rock';
  const kw = `new ${genre} song${f.city ? ` from ${f.city}` : ''}`; // searchable phrase
  const nicheTags = f.hasTab ? (f.hasBass ? ['#bassguitar', '#basstok'] : NICHE_TAGS.player.slice(0, 2)) : f.hasDrums ? NICHE_TAGS.drums.slice(0, 2) : [];
  const base = f.heavy ? NICHE_TAGS.heavy : f.emo ? NICHE_TAGS.emo : NICHE_TAGS.alt;
  // 5 tags: what it is (niche), who it's for (city), what it is right now (new music), then more niche
  const tags = (extra = []) => hashtags([...extra, ...nicheTags, ...base.slice(0, 2), f.city ? `#${f.city}music` : '', '#newmusic', ...base.slice(2), f.artist ? tagify(f.artist) : ''].filter(Boolean));
  const swipe = kind === 'carousel';
  const ideas = [];
  const add = (id, style, why, first, rest, extraTags = []) => {
    const t = tags(extraTags);
    const tiktokTags = t.slice(0, 3).join(' ');
    ideas.push({
      id,
      style,
      why,
      tiktok: clean(`${first} ${rest.short || ''}`).slice(0, 150 - tiktokTags.length - 1).trim() + ` ${tiktokTags}`,
      instagram: [first, rest.long || rest.short || '', '', t.join(' ')].join('\n').replace(/\n{3,}/g, '\n\n').trim(),
      tags: t,
    });
  };

  // a DM-share ask: what Instagram weighs most
  add('share', 'Send it to a friend', 'Shares to DMs count more than likes on Instagram; naming who to send it to makes it easy.',
    f.heavy ? 'Send this to the friend who starts every pit.' : 'Send this to the friend who still has an emo playlist from 2007.',
    { short: `${song} is ${f.when}.`, long: `${song} by ${band} is ${f.when}. ${swipe ? 'Swipe for the lyric that started it →' : 'Full song: link in bio.'}` });
  if (f.lyric) {
    add('lyric', 'Lead with the lyric', 'A lyric as the first line reads like a quote people screenshot and share, and says what the song is about.',
      `“${f.lyric}”`,
      { short: `${song} ${f.when}.`, long: `${song} is ${f.when}. Which line hits hardest? Drop it in the comments.` });
  }
  if (f.similar) {
    add('ifyoulike', 'If you like ___', 'Naming bands your fans already follow tells both the viewer and the search who this is for.',
      `If you like ${f.similar.replace(/\s*,\s*([^,]*)$/, ' & $1')}, press play.`,
      { short: `${kw}.`, long: `This is ${band}: a ${kw}. ${song} ${f.when}.` });
  }
  add('pov', 'POV', 'POV captions match the on-screen text for muted viewers and tap into a shared feeling, which drives shares.',
    f.emo ? 'POV: your emo phase never ended.' : f.heavy ? 'POV: the breakdown you’ve been waiting all year for.' : 'POV: you found your new favorite band at 2am.',
    { short: `${song} ${f.when}.`, long: `${song} by ${band}. ${f.when[0].toUpperCase()}${f.when.slice(1)}. Tag who you’d go to the show with.` });
  add('rate', 'Specific question', 'A specific, easy question (a number or A/B) gets far more replies than “what do you think?”.',
    f.heavy ? 'Rate this breakdown 1–10. Be honest.' : 'Chorus or bridge? Pick one.',
    { short: `${song} ${f.when}.`, long: `${song} is ${f.when}. We read every comment.` });
  if (f.hasTab) {
    add('learn', 'Save to learn it', 'Tutorial-style captions earn saves, another strong signal; the tab on screen backs it up.',
      f.hasBass ? 'Save this to learn the bass line.' : 'Save this. Riff tab on screen.',
      { short: `${song} ${f.when}.`, long: `${song} ${f.when}. Want the full ${f.hasBass ? 'bass' : 'guitar'} tab? Comment “TAB” and we’ll send it.` }, f.hasBass ? ['#bassguitar'] : ['#guitartok']);
  }
  add('sound', 'Use our sound', 'Every video made with your sound shows the song to a new audience.',
    'Use this sound for your next transition 🔊',
    { short: `${song} by ${band}.`, long: `${song} by ${band} is ${f.when}. Use the sound and tag us, we’ll repost our favorites.` });
  if (f.preRelease) {
    add('countdown', 'Countdown', 'A date in the first line gives people a reason to save or pre-save.',
      `${f.when[0].toUpperCase()}${f.when.slice(1)}.`,
      { short: `${song}. Pre-save in bio.`, long: `${song}. Pre-save link in bio so it’s in your library on day one.` });
  }
  if (swipe) {
    add('swipe', 'Swipe hook', 'For carousels, the caption should promise what the swipe pays off.',
      `The story behind ${song} in ${slides} slides →`,
      { short: '', long: `Swipe to the end for the release date. Send it to someone who needs this song.` });
  }
  // story caption for Instagram: longer works when it is a real story
  add('story', 'Short story', 'On Instagram, long captions work when they tell a real story; mid-length captions tend to underperform.',
    `We almost didn’t release ${song}.`,
    { short: f.when === 'out now' ? 'Now it’s out.' : `It’s ${f.when}.`, long: `It was the song we kept rewriting, the one we were scared to play live.\n\n${f.when === 'out now' ? 'Now it’s out' : `It’s ${f.when}`}, and it’s yours. Send it to the person you’d play it for first.` });

  // order: what the edit is about first
  const first = f.hasTab ? 'learn' : f.lyric && ['lyricvideo', 'poster', 'tunnel', 'spotlight'].includes(f.template) ? 'lyric' : f.preRelease ? 'countdown' : 'share';
  ideas.sort((a, b) => (a.id === first ? -1 : b.id === first ? 1 : 0));
  return ideas;
}
