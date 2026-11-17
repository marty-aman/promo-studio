// Inspiration page data: short-form trends for alt-metal / emocore / post-hardcore bands,
// researched from public TikTok pages and 2026 music-marketing guides (sources below).
// Each trend has a recipe that sets up the edit in one click.
import { uid } from './core.js';
import { applyTemplate, applyLayout } from './templates.js';

export const RESEARCHED_ON = 'November 17, 2026';
export const NICHE = 'Alt-metal · emocore · post-hardcore';

export const SOURCES = {
  mbes: { label: 'Making Blind Eyes See on TikTok (“If you like these bands…”)', url: 'https://www.tiktok.com/@makingblindeyessee/video/7299058791545343264' },
  badomens: { label: 'TikTok: “bands similar to bad omens”', url: 'https://www.tiktok.com/discover/bands-similar-to-bad-omens' },
  heaviest: { label: 'TikTok: Heavy Metal Music (“heaviest song of the year”)', url: 'https://www.tiktok.com/discover/Heavy-Metal-Music' },
  surefire: { label: 'Surefire on TikTok (live one take)', url: 'https://www.tiktok.com/@surefiremke/video/7501082162368662827' },
  pipebomb: { label: 'Pipe Bomb on TikTok (guitar tip + band plug)', url: 'https://www.tiktok.com/@pipebombband/video/7534517165328780557' },
  emo20: { label: 'TikTok: emo band songs (“iconic songs turn 20”)', url: 'https://www.tiktok.com/discover/emo-band-songs' },
  emoscore: { label: 'TikTok: emo song trend (“what’s ur score?”)', url: 'https://www.tiktok.com/discover/emo-song-trend' },
  emouse: { label: 'TikTok: emo band (“pls use my audio”)', url: 'https://www.tiktok.com/discover/emo-band' },
  arcnorth: { label: 'TikTok: rock metal music (“Tag someone who loves metal”)', url: 'https://www.tiktok.com/discover/rock-metal-music' },
  hypebot: { label: 'Hypebot: Cracking the Instagram algorithm (2026)', url: 'https://www.hypebot.com/cracking-the-instagram-algorithm-a-2026-guide-for-musicians/' },
  virlo: { label: 'Virlo: How to promote music on TikTok (2026)', url: 'https://virlo.ai/blog/how-to-promote-music-on-tiktok' },
  koa: { label: 'Koa Music: Digital music marketing in 2026', url: 'https://grapefruit-lanternfish-dbce.squarespace.com/blog/digital-music-marketing-in-2026' },
  droptrack: { label: 'Droptrack: 10 strategies for 2026', url: 'https://www.droptrack.com/how-to-promote-your-music-in-2026-10-proven-strategies-that-actually-work/' },
  socialtradia: { label: 'Socialtradia: trending Reels audio (Sept 2026)', url: 'https://socialtradia.com/blog/trending-audio-instagram/' },
  revid: { label: 'Revid: more views on Instagram Reels (2026)', url: 'https://www.revid.ai/blog/how-to-get-more-views-on-instagram-reels' },
  freebeat: { label: 'Freebeat: Reel ideas and hook length', url: 'https://freebeat.ai/articles/instagram-reel-ideas-promote-your-beat' },
  qoncert: { label: 'Qoncert: Reels for musicians', url: 'https://roughdraft.qoncertapp.com/instagram-reels-for-musicians-how-to-go-viral-and-actually-convert-viewers-into-fans/' },
  otw: { label: 'Ones To Watch: promoting underground music (2026)', url: 'https://resources.onestowatch.com/effectively-promote-underground-music-globally/' },
  artistpr: { label: 'ArtistPR: Instagram for musicians', url: 'https://www.artistpr.com/music-promotion/music-marketing/how-to-use-instagram-to-build-your-fan-base/' },
  unhurd: { label: 'UnHurd: promoting a music video (2026)', url: 'https://www.unhurdmusic.com/blog/how-to-promote-a-music-video' },
  creative: { label: 'TikTok Creative Center: trending songs & hashtags', url: 'https://ads.tiktok.com/business/creativecenter/inspiration/popular/music/pc/en' },
};

// Recipe text tokens: {similar} {title} {artist}
export const TRENDS = [
  {
    id: 'ifyoulike',
    title: '“If you like ___, you’ll like us”',
    platforms: ['TikTok', 'Reels', 'Shorts'],
    why: 'Metalcore and post-hardcore bands name the bigger bands their fans already love, so the algorithm and the viewer both know who it is for in the first second.',
    sources: ['mbes', 'badomens'],
    steps: ['Name 3 bands your fans love in “Bands like you” below.', 'Use the hook section of the song (picked automatically).', 'Keep it about 15 seconds and end on the cover with OUT NOW.'],
    hook: 'IF YOU LIKE {similar}…',
    length: '12–15 s',
    recipe: { template: 'hype', duration: 15, hook: true, texts: [['IF YOU LIKE {similar}', 0.2, 3.2], ['…YOU’LL LIKE THIS', 3.3, 6]] },
  },
  {
    id: 'breakdown',
    title: 'Wait for the breakdown',
    platforms: ['TikTok', 'Reels'],
    why: '“Heaviest song / breakdown of the year” videos sit among the most-viewed heavy-music posts. Viewers stay to the drop, which is exactly what completion-rate algorithms reward.',
    sources: ['heaviest', 'qoncert'],
    steps: ['Pick a section that builds and then drops (the loudest part is chosen for you; drag the song on the timeline if the drop is later).', 'Tease it on screen in the first second.', 'Shake, strobe and flash land on the beat when it hits.'],
    hook: 'WAIT FOR THE BREAKDOWN',
    length: '10–15 s',
    recipe: { template: 'rock', duration: 13, hook: true, texts: [['WAIT FOR THE BREAKDOWN', 0.1, 3]] },
  },
  {
    id: 'cleanscream',
    title: 'Cleans → screams contrast',
    platforms: ['TikTok', 'Reels', 'Shorts'],
    why: 'Contrast edits are a standing Reels trend: a calm first shot, then the visual change lands on the lyric or beat. For emocore that is the switch from clean vocals to screams.',
    sources: ['socialtradia'],
    steps: ['Put a calm clip first and the heaviest clip second.', 'Line up the cut with the first scream (drag the clip edge on the timeline).', 'The second clip gets a flash cut, shake and a harsh mono grade.'],
    hook: 'POV: THE CHORUS HITS',
    length: '8–12 s',
    recipe: { template: 'spotlight', duration: 11, hook: true, contrast: true, texts: [['POV: THE CHORUS HITS', 0.2, 2.6]] },
  },
  {
    id: 'learnriff',
    title: 'Learn the riff (tab playthrough)',
    platforms: ['TikTok', 'Reels', 'Shorts'],
    why: 'Guitar tips with a band plug at the end reach players who are not fans yet, and the scrolling tab gives them a reason to save the video.',
    sources: ['pipebomb'],
    steps: ['Upload the Guitar Pro tab for the main riff.', 'Use a playthrough or close-up clip of the guitarist.', 'Put bar 1 at the playhead where the riff starts.'],
    hook: 'LEARN THE MAIN RIFF 🎸',
    length: '15–30 s',
    recipe: { template: 'minimal', duration: 20, hook: false, tab: true, texts: [['LEARN THE MAIN RIFF 🎸', 0.2, 3]] },
  },
  {
    id: 'onetake',
    title: 'Live, one take, no edits',
    platforms: ['TikTok', 'Reels'],
    why: 'Marketers report that polished promo is tired and raw, honest moments cut through. Bands post one-take live clips and point to the show or the stream.',
    sources: ['surefire', 'koa'],
    steps: ['Use one continuous live or rehearsal clip.', 'No effects; a light film grain and a progress bar only.', 'Mention your next show in the small end-card text.'],
    hook: 'LIVE. ONE TAKE. NO EDITS.',
    length: '20–45 s',
    recipe: { template: 'minimal', duration: 25, hook: true, raw: true, texts: [['LIVE. ONE TAKE. NO EDITS.', 0.2, 3]] },
  },
  {
    id: 'emo2006',
    title: '2006 emo, released in 2026',
    platforms: ['TikTok', 'Reels'],
    why: 'Emo nostalgia is constant on TikTok, and many 2006 scene songs turn 20 this year. Framing a new song as a lost 2006 track borrows that energy.',
    sources: ['emo20', 'emoscore'],
    steps: ['Retro VHS look with typewriter captions is applied.', 'Use grainy, flash-lit or MySpace-style photos and clips.', 'Ask in the caption which 2006 band it reminds people of.'],
    hook: 'IF THIS CAME OUT IN 2006',
    length: '10–15 s',
    recipe: { template: 'vhs', duration: 14, hook: true, texts: [['IF THIS CAME OUT IN 2006…', 0.2, 3.2]] },
  },
  {
    id: 'tag',
    title: 'Send this to your pit friend',
    platforms: ['Reels', 'TikTok'],
    why: 'On Instagram, shares to DMs now count about 4× more than likes, and “Tag someone who loves metal” posts reach millions of views. Ask for the share directly.',
    sources: ['hypebot', 'arcnorth'],
    steps: ['Use the most energetic crowd or performance clip.', 'Ask for the share at the start, repeat it near the end.', 'Keep it short so people watch twice before sending.'],
    hook: 'SEND THIS TO YOUR MOSH PIT FRIEND',
    length: '7–12 s',
    recipe: { template: 'hype', duration: 10, hook: true, texts: [['SEND THIS TO YOUR MOSH PIT FRIEND', 0.2, 3.2], ['TAG THEM 👇', 6.5, 9.8]] },
  },
  {
    id: 'usesound',
    title: 'Make your sound reusable',
    platforms: ['TikTok', 'Reels'],
    why: 'On TikTok a song spreads when other people make videos with it. A clear lyric moment that fits a feeling (“emo phase pics”, “3am drive”) invites reuse.',
    sources: ['virlo', 'emouse'],
    steps: ['Pick the most quotable 10–15 seconds.', 'Lyrics are the hero (karaoke highlight).', 'Say what to use it for in the on-screen text and caption.'],
    hook: 'USE THIS SOUND FOR YOUR EMO PHASE PICS',
    length: '10–15 s',
    recipe: { template: 'spotlight', duration: 14, hook: true, texts: [['USE THIS SOUND FOR YOUR EMO PHASE PICS 🖤', 0.2, 3.5]] },
  },
  {
    id: 'bts',
    title: 'The story behind the song',
    platforms: ['Reels', 'TikTok', 'Shorts'],
    why: '2026 guides keep pointing to “context-first” posts: the studio session, the failed take, what the lyric is about. Fans share stories more than ads.',
    sources: ['droptrack', 'koa'],
    steps: ['Use studio, rehearsal or phone footage.', 'One line about what the song means on screen.', 'Warm golden-hour look with hand-written captions.'],
    hook: 'WE WROTE {title} THE NIGHT…',
    length: '15–30 s',
    recipe: { template: 'golden', duration: 20, hook: true, texts: [['WE WROTE “{title}” AFTER THE WORST NIGHT OF OUR LIVES', 0.2, 4]] },
  },
  {
    id: 'rate',
    title: 'Rate this chorus 1–10',
    platforms: ['TikTok', 'Reels', 'Shorts'],
    why: 'Score challenges (“what’s ur score?”) run through emo TikTok. A number is an easy comment, and comments push the video further.',
    sources: ['emoscore'],
    steps: ['Use the chorus.', 'Ask for a score at the start.', 'Pin your favourite reply and answer it with a new video.'],
    hook: 'RATE THIS CHORUS 1–10',
    length: '10–15 s',
    recipe: { template: 'neon', duration: 13, hook: true, texts: [['RATE THIS CHORUS 1–10', 0.2, 3], ['DROP YOUR SCORE 👇', 8.5, 12.5]] },
  },
  {
    id: 'countdown',
    title: 'Release countdown',
    platforms: ['TikTok', 'Reels', 'Shorts'],
    why: 'Short teasers in the week before release give the algorithm several chances to find the right audience before release day. Set the release date in End card.',
    sources: ['otw', 'unhurd'],
    steps: ['Set the release date in the End card tab.', 'Post a different 10-second piece of the song each day.', 'The end card counts down automatically.'],
    hook: 'OUT {date}',
    length: '8–12 s',
    recipe: { template: 'countdown', duration: 10, hook: true, texts: null },
  },
];

export const PLAYBOOK = [
  { rule: 'Hook in the first 1.5–3 seconds', detail: 'Text on screen from frame one and the strongest part of the song first. Viewers decide that fast.', sources: ['qoncert', 'revid'] },
  { rule: '7–15 seconds for performance clips', detail: 'Short clips get watched to the end and replayed, which is what both apps reward.', sources: ['freebeat'] },
  { rule: 'Ask for shares, not likes', detail: 'Instagram now weights DM shares about 4× more than likes.', sources: ['hypebot'] },
  { rule: 'Get people to use your sound', detail: 'Each video someone makes with your track shows it to a new audience.', sources: ['virlo'] },
  { rule: 'Batch 20–30 clips per song', detail: 'Cut many 15–45 s clips from one track in one or two sessions before release.', sources: ['otw'] },
  { rule: '3–5 Reels a week, judge after 4–6 weeks', detail: 'Consistency beats one big post. Give a format time before dropping it.', sources: ['artistpr'] },
  { rule: 'At most 5 hashtags, under 3 minutes, original 9:16', detail: 'Searchable caption, a few precise tags; try new ideas as Instagram trial reels.', sources: ['revid'] },
  { rule: 'Show the real band', detail: 'Process, mistakes and reactions cut through better than polished ads.', sources: ['koa', 'droptrack'] },
  { rule: 'Cut the music video into 5–10 clips', detail: 'Short clips send more new viewers to the full video than any single tactic.', sources: ['unhurd'] },
];

export const HASHTAG_SETS = [
  { name: 'Metalcore / heavy', tags: '#metalcore #posthardcore #metaltok #breakdown #newmusic' },
  { name: 'Emo / scene', tags: '#emo #emotok #alttiktok #emoisnotdead #newmusic' },
  { name: 'Alt-rock reach', tags: '#altmetal #rocktok #alternative #newsingle #seattlemusic' },
];

export const CAPTION_HOOKS = [
  'If you like {similar}, this one’s for you.',
  'We waited two years to show you this breakdown.',
  'Rate the chorus 1–10. Be honest.',
  'Send this to the friend who always starts the pit.',
  'POV: your emo phase never ended.',
  '“{title}” is out now. Link in bio. 🖤',
];

/** Two weeks around release day: [day offset, trend id, note]. */
export const CALENDAR = [
  [-7, 'usesound', 'Unreleased snippet, ask people to save the sound'],
  [-5, 'ifyoulike', 'Tell the right fans who it is for'],
  [-3, 'countdown', 'Countdown teaser'],
  [-1, 'countdown', '“Out tomorrow”'],
  [0, 'tag', 'Release day: ask for shares'],
  [1, 'learnriff', 'Riff tutorial with the tab'],
  [3, 'onetake', 'Live one take'],
  [5, 'breakdown', 'The breakdown'],
  [7, 'rate', 'Rate the chorus'],
  [10, 'bts', 'Story behind the song'],
  [12, 'emo2006', '2006 emo version'],
];

const fill = (s, ctx) =>
  String(s)
    .replace(/\{similar\}/gi, (ctx.similar || 'YOUR FAVORITE BANDS').toUpperCase())
    .replace(/\{title\}/gi, ctx.title || 'THIS SONG')
    .replace(/\{artist\}/gi, ctx.artist || 'US');

/** Caption hooks / text with tokens filled in. */
export const fillTokens = fill;

/**
 * Apply a trend recipe to the project draft.
 * ctx: { similar, hookStart(seconds) -> songOffset|null }
 */
export function applyRecipe(d, trend, ctx = {}) {
  const r = trend.recipe;
  applyTemplate(d, r.template);
  const ecLen = d.endCard.enabled ? d.endCard.duration : 0;
  d.duration = +(r.duration + ecLen).toFixed(2);
  if (r.hook && d.song && ctx.hookStart) {
    const start = ctx.hookStart(r.duration);
    if (start != null) d.song.offset = start;
  }
  const tctx = { similar: ctx.similar, title: d.endCard.title, artist: d.endCard.artist };
  if (r.texts) {
    d.texts = r.texts.map(([text, start, end], i) => ({
      id: uid('txt'),
      text: fill(text, tctx),
      start,
      end: Math.min(end, d.duration - ecLen),
      x: 50,
      y: i ? 26 : 18,
      size: text.length > 26 ? 6.5 : 8.5,
      font: 'Bebas Neue',
      color: '#ffffff',
      outline: '#000000',
      box: true,
      boxColor: i ? '#111111' : '#e0182d',
      boxOpacity: 0.92,
      animation: 'pop',
    }));
  }
  if (r.contrast && d.clips.length) {
    d.clips.forEach((c, i) => {
      if (i === 0) {
        c.effects = {};
        c.transition = { type: 'fade', duration: 0.4 };
      } else {
        c.transition = { type: 'flash', duration: 0.3 };
        c.effects = { shake: 0.4, beatPulse: 0.6 };
        c.grade = { preset: 'mono', contrast: 1.3, saturation: 0 };
      }
    });
  }
  if (r.raw) {
    d.clips.forEach((c) => {
      c.effects = {};
      c.grade = null;
      c.kenBurns = null;
    });
    Object.assign(d.look, { grain: 0.15, vignette: 0.15, progress: { ...d.look.progress, enabled: true } });
  }
  const tabLayer = (d.layers || []).find((l) => l.type === 'tab' && l.mediaId);
  if (r.tab && tabLayer) {
    tabLayer.start = 0;
    tabLayer.end = null;
    tabLayer.mode = 'scroll';
    tabLayer.visible = true;
    tabLayer.height = Math.max(tabLayer.height, 18);
  }
  d.inspiration = trend.id;
  if (d.layout) applyLayout(d, d.layout);
}
