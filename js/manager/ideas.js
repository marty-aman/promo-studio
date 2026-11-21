// Music video and short-form ideas from a song's lyrics. Word matching in the browser (nothing is
// sent anywhere); each idea says which words it came from so you can judge it.

import { CALENDAR, TRENDS } from '../inspiration.js';
import { addDays, mid } from './model.js';

const IMAGERY = [
  {
    id: 'fire',
    words: ['fire', 'burn', 'flame', 'ash', 'smoke', 'ember', 'blaze', 'ignite', 'light it up', 'heat', 'spark', 'match', 'hell'],
    title: 'Burn it down',
    pitch: 'Performance in a dark warehouse lit only by flame bars, sparklers and red/orange gels, cut with slow-motion embers and smoke.',
    look: 'Black and deep orange; hard backlight through haze; sparks in slow motion.',
    locations: ['An empty warehouse or rehearsal space with a high ceiling', 'A gravel lot at night (with a fire permit, or LED flame effects instead)'],
    shots: ['Wide: band backlit through haze', 'Slow-mo: sparks falling past the vocalist', 'Close-up: a match lighting, timed to the first hit', 'Over-the-shoulder: drummer into a wall of light'],
  },
  {
    id: 'cold',
    words: ['cold', 'ice', 'snow', 'winter', 'frozen', 'freez', 'numb', 'breath', 'frost', 'pale', 'grey', 'gray', 'fog', 'mist'],
    title: 'Cold open',
    pitch: 'Black-metal-cold: the band plays outside at dawn in fog or snow, breath visible, intercut with the singer alone in a bare room.',
    look: 'Desaturated blue-grey, almost black and white; soft top light; visible breath.',
    locations: ['A foggy beach or forest at first light', 'A bare concrete room with one window'],
    shots: ['Drone or high wide: band small in a grey landscape', 'Macro: frost or water on a guitar string', 'Close-up: breath in front of the mic', 'Slow push-in on the singer, no cut, for a whole verse'],
  },
  {
    id: 'blood',
    words: ['blood', 'bleed', 'red', 'wound', 'knife', 'scar', 'vein', 'heart', 'teeth', 'bone', 'rage', 'hate', 'war', 'fight'],
    title: 'Red room',
    pitch: 'One red room, one take of the band at full intensity, with flash-cut inserts of the lyric’s images (hands, teeth, a heartbeat on a monitor).',
    look: 'Red and black only; strobe on the breakdown; grain.',
    locations: ['A small room you can paint or light entirely red', 'A practice space with red LED tubes'],
    shots: ['Locked-off wide of the whole band', 'Strobe-lit close-ups on the breakdown', 'Inserts: knuckles, a ripped shirt, a chest heaving', 'Handheld circling the drummer'],
  },
  {
    id: 'grief',
    words: ['grave', 'funeral', 'mourn', 'grief', 'death', 'dead', 'die', 'ghost', 'gone', 'alone', 'empty', 'bury', 'goodbye', 'tears', 'miss you', 'pray'],
    title: 'The empty chair',
    pitch: 'A story told in reverse: an empty room slowly fills with memories of one person, while the band plays in the same space, faded like an old photo.',
    look: 'Faded film colours, warm practical lamps, soft focus edges.',
    locations: ['An old house or apartment with character', 'A church hall or community room'],
    shots: ['The same wide frame at three moments (empty, full, empty again)', 'Close-up: an object left behind', 'Band in silhouette against a window', 'Final shot: the singer alone, holding the last note'],
  },
  {
    id: 'machine',
    words: ['static', 'electric', 'wire', 'machine', 'steel', 'iron', 'rust', 'chain', 'circuit', 'signal', 'radio', 'volt', 'arc', 'engine', 'city', 'concrete'],
    title: 'Live wire',
    pitch: 'The band as a machine: industrial space, flickering fluorescent tubes and sparks, with glitch and static inserts that hit on the snare.',
    look: 'Gunmetal and rust with cold white flicker; glitch cuts and RGB split on the drops.',
    locations: ['A parking garage or loading dock at night', 'An industrial unit with exposed pipes'],
    shots: ['Fluorescent tubes flickering to the beat', 'Close-up: amp tubes and cables', 'Shaky handheld: everyone in one frame for the breakdown', 'CRT or old TV showing the band, filmed off the screen'],
  },
  {
    id: 'water',
    words: ['ocean', 'water', 'drown', 'rain', 'wave', 'sea', 'river', 'flood', 'sink', 'under'],
    title: 'Under',
    pitch: 'Rain machine or real rain: the band plays soaked, intercut with the singer under water (pool or bathtub) for the quiet parts.',
    look: 'Teal and black, wet highlights, slow motion water.',
    locations: ['A rooftop or alley in the rain', 'A pool (book the time) or a bathtub for close-ups'],
    shots: ['Backlit rain on the whole band', 'Underwater close-up of the singer', 'Slow-mo: water flying off the drum heads', 'Reflection in a puddle'],
  },
];

const ALWAYS = [
  { id: 'live', title: 'Live in one room', pitch: 'Film a real or staged show in a small venue: crowd, sweat and the band at its best. The cheapest video that still looks big.', look: 'Venue lights, two or three handheld cameras, fast cuts on the beat.', locations: ['A small local venue on an off night', 'A DIY space with friends as the crowd'], shots: ['Crowd from the stage', 'Stage from the back of the room', 'Close-ups of hands on instruments', 'Stage dive or crowd singing the hook'] },
  { id: 'onetake', title: 'One take', pitch: 'The whole song in one continuous shot moving through the band and the space. Rehearse the path; it reads as confident and is easy to edit.', look: 'Gimbal or steady handheld; plan light for the whole path.', locations: ['A house, rehearsal space or venue with a route between rooms'], shots: ['Start on a detail, pull out to the band', 'Pass each member on their part', 'End on the singer for the last line'] },
];

const norm = (s) => ` ${String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ')} `;
const found = (text, words) => words.filter((w) => norm(text).includes(` ${w}`));

/** Concepts for a music video, best match first: [{ id, title, pitch, look, locations, shots, words }]. */
export function shootIdeas(lyrics, title = '') {
  const text = `${lyrics || ''} ${title} ${title}`;
  const scored = IMAGERY.map((c) => ({ ...c, words: [...new Set(found(text, c.words))] })).filter((c) => c.words.length).sort((a, b) => b.words.length - a.words.length);
  return [...scored.slice(0, 3), ...ALWAYS.map((c) => ({ ...c, words: [] }))];
}

/** Lines that work as on-screen hooks: short, quotable, repeated or shouted. */
export function hookLines(lyrics, max = 4) {
  const lines = String(lyrics || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const count = new Map();
  for (const l of lines) count.set(norm(l), (count.get(norm(l)) || 0) + 1);
  const score = (l) => (count.get(norm(l)) - 1) * 3 + (/!/.test(l) ? 2 : 0) + (l.split(/\s+/).length <= 7 ? 2 : 0) + (l === l.toUpperCase() && /[A-Z]/.test(l) ? 1 : 0);
  return [...new Set(lines)].sort((a, b) => score(b) - score(a)).slice(0, max);
}

/**
 * A short-form posting plan around release day, from the Inspiration page's two-week calendar.
 * Returns new posts: { id, songId, date, platform, format, title, hook, status: 'idea' }.
 */
export function planPosts(song, { platforms = ['TikTok', 'Reels', 'Shorts'] } = {}) {
  if (!song.releaseDate) return [];
  const hooks = song.instrumental ? [] : hookLines(song.lyrics, 6);
  return CALENDAR.map(([offset, trendId, note], i) => {
    const tr = TRENDS.find((t) => t.id === trendId);
    return {
      id: mid('post'),
      songId: song.id,
      date: addDays(song.releaseDate, offset),
      platform: platforms.join(' + '),
      format: trendId,
      title: note,
      hook: hooks.length ? hooks[i % hooks.length] : '',
      idea: tr ? tr.title : '',
      status: 'idea',
      url: '',
      stats: null,
    };
  });
}
