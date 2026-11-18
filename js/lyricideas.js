// Ideas from your lyrics: which theme, visualizer, lyric display and per-line looks suit the words.
// Plain word matching (no network, nothing leaves the browser), with the matched words shown as the
// reason so you can judge the suggestion yourself. Pure functions so they can be unit tested.

import { uid } from './core.js';
import { THEMES, themeById, applyTheme, themeLayer } from './themes.js';
import { defaultVizLayer, VIZ_STYLES, setVizStyle } from './viz.js';
import { DISPLAY_DEFAULTS } from './lyricviz.js';

// words that point at each theme (stems: "burn" also matches burning, burned)
const THEME_WORDS = {
  hellfire: ['fire', 'burn', 'flame', 'hell', 'inferno', 'ember', 'blaze', 'ignite', 'smoke', 'light it up', 'heat', 'sun', 'match', 'spark', 'devil', 'pyre'],
  bloodash: ['blood', 'bleed', 'red', 'wound', 'knife', 'scar', 'ash', 'kill', 'vein', 'heart', 'teeth', 'bone', 'war', 'rage', 'hate'],
  frost: ['cold', 'ice', 'snow', 'winter', 'frozen', 'freez', 'numb', 'breath', 'north', 'frost', 'pale', 'glass', 'still', 'silence', 'white'],
  doom: ['grave', 'funeral', 'mourn', 'grief', 'death', 'dead', 'die', 'coffin', 'ghost', 'gone', 'alone', 'empty', 'sorrow', 'bury', 'pray', 'god', 'rain', 'tears', 'goodbye', 'fade'],
  toxic: ['poison', 'toxic', 'sick', 'acid', 'rot', 'venom', 'chemical', 'infect', 'pill', 'drug', 'disease', 'swamp', 'filth', 'plague', 'virus', 'green'],
  ruststeel: ['steel', 'iron', 'rust', 'machine', 'chain', 'metal', 'gear', 'factory', 'engine', 'wire', 'static', 'electric', 'circuit', 'concrete', 'city', 'arc', 'volt', 'grind'],
};

// visualizer ideas: the first style in each list that exists is used
const VIZ_WORDS = [
  { words: ['fire', 'burn', 'flame', 'inferno', 'ember', 'blaze', 'ignite', 'light it up', 'pyre', 'hell'], styles: ['fire'], why: 'Flames' },
  { words: ['storm', 'thunder', 'lightning', 'strike', 'electric', 'static', 'spark', 'arc', 'volt', 'shock', 'wire'], styles: ['lightning', 'electric'], why: 'Lightning' },
  { words: ['radio', 'tape', 'record', 'rewind', 'memory', 'remember', 'old', 'song', 'play it back', 'cassette', 'echo'], styles: ['tape', 'vu'], why: 'Tape reels' },
  { words: ['heart', 'beat', 'pulse', 'pound', 'chest', 'alive', 'breathe'], styles: ['speaker', 'rings'], why: 'A pumping speaker' },
  { words: ['ocean', 'water', 'drown', 'rain', 'wave', 'sea', 'river', 'flood', 'sink', 'tears'], styles: ['ripple'], why: 'Water ripples' },
  { words: ['string', 'guitar', 'chord', 'strum', 'riff', 'tune', 'wire'], styles: ['strings', 'wave'], why: 'Vibrating strings' },
  { words: ['scream', 'shout', 'loud', 'noise', 'volume', 'mix', 'sound', 'speaker', 'amp'], styles: ['faders', 'eq'], why: 'Mixing-desk meters' },
];

const WHISPER = ['whisper', 'quiet', 'softly', 'hush', 'breathe', 'secret', 'sleep'];
const SPOKEN = /^\s*[([]\s*(spoken|speaking|talk|said)/i;

const norm = (s) => ` ${String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ')} `;
/** The listed words found in `text` (a word must start at a word boundary). */
function found(text, words) {
  const t = norm(text);
  return words.filter((w) => t.includes(` ${w}`));
}

/** Per-line looks: repeated lines are the chorus (gang vocals), shouted lines scream, soft lines whisper. */
export function lineIdeas(lyrics) {
  const lines = (lyrics || []).filter((l) => l && l.text && l.text.trim());
  const key = (l) => norm(l.text).trim();
  const count = new Map();
  for (const l of lines) count.set(key(l), (count.get(key(l)) || 0) + 1);
  const out = [];
  for (const l of lines) {
    const txt = l.text.trim();
    const letters = txt.replace(/[^A-Za-z]/g, '');
    const words = key(l).split(' ').filter(Boolean);
    let preset = null;
    let why = '';
    if (SPOKEN.test(txt)) [preset, why] = ['spoken', 'marked as spoken'];
    else if (found(txt, WHISPER).length) [preset, why] = ['whisper', `“${found(txt, WHISPER)[0]}”`];
    else if (/!/.test(txt) || (letters.length >= 4 && letters === letters.toUpperCase())) [preset, why] = ['scream', 'shouted'];
    else if (count.get(key(l)) >= 2 && words.length <= 7) [preset, why] = ['chant', 'repeated, like a chorus'];
    else if (words.length <= 3 && found(txt, ['burn', 'die', 'kill', 'break', 'run', 'fight', 'scream', 'now', 'go', 'down']).length) [preset, why] = ['scream', 'a short shout'];
    if (preset) out.push({ id: l.id, preset, why, text: txt });
  }
  return out;
}

/**
 * Ideas for project `p` from its lyrics:
 * { ok, theme: { id, name, words }, viz: { style, label, words }, display: { id, why }, lines: [...] }
 */
export function lyricIdeas(p) {
  const lyrics = (p.lyrics || []).filter((l) => l.text && l.text.trim());
  if (lyrics.length < 2) return { ok: false };
  const all = lyrics.map((l) => l.text).join(' \n ');
  const title = (p.endCard && p.endCard.title) || '';

  // theme: most matched words (the title counts twice)
  let theme = null;
  for (const t of THEMES) {
    const words = [...new Set([...found(all, THEME_WORDS[t.id] || []), ...found(title, THEME_WORDS[t.id] || [])])];
    const score = found(all, THEME_WORDS[t.id] || []).length + found(title, THEME_WORDS[t.id] || []).length * 2;
    if (score && (!theme || score > theme.score)) theme = { id: t.id, name: t.name, words, score };
  }
  if (!theme) theme = { id: 'bloodash', name: themeById('bloodash').name, words: [], score: 0 };

  // visualizer
  const have = new Set(VIZ_STYLES.map(([id]) => id));
  const label = (id) => (VIZ_STYLES.find(([v]) => v === id) || [])[1];
  let viz = null;
  for (const v of VIZ_WORDS) {
    const words = found(`${all} ${title}`, v.words);
    const style = v.styles.find((s) => have.has(s));
    if (words.length && style && (!viz || words.length > viz.words.length)) viz = { style, label: label(style), words };
  }
  if (!viz) viz = { style: have.has('eq') ? 'eq' : 'bars', label: label(have.has('eq') ? 'eq' : 'bars'), words: [] };

  // lyric display: short punchy lines -> kinetic poster, long lines -> scrolling sheet
  const avgWords = lyrics.reduce((s, l) => s + norm(l.text).trim().split(' ').length, 0) / lyrics.length;
  const display =
    avgWords >= 8 ? { id: 'sheet', why: `long lines (about ${Math.round(avgWords)} words each) read best as a scrolling sheet` }
      : avgWords <= 5 ? { id: 'poster', why: `short, punchy lines (about ${Math.round(avgWords)} words) hit hardest as a kinetic poster` }
      : { id: 'line', why: 'medium-length lines work one at a time, with a strong animation' };

  return { ok: true, theme, viz, display, lines: lineIdeas(lyrics) };
}

/** Apply one idea (or all of them) to draft `d`. kind: theme | viz | display | lines | all */
export function applyLyricIdea(d, ideas, kind) {
  if (!ideas || !ideas.ok) return;
  if (kind === 'theme' || kind === 'all') applyTheme(d, ideas.theme.id);
  if (kind === 'viz' || kind === 'all') {
    d.layers ||= [];
    let L = d.layers.find((x) => x.type === 'viz' && x.fromLyrics);
    if (!L) {
      const n = d.layers.filter((x) => x.type === 'viz').length + 1;
      L = { ...defaultVizLayer(), id: uid('lyr'), type: 'viz', name: `Visualizer${n > 1 ? ` ${n}` : ''}`, visible: true, fromLyrics: true };
      d.layers.push(L);
    }
    setVizStyle(L, ideas.viz.style);
    const th = d.theme && themeById(d.theme.id);
    if (th) themeLayer(L, th, d.theme.colors);
  }
  if (kind === 'display' || kind === 'all') {
    d.lyricStyle.display = ideas.display.id;
    Object.assign(d.lyricStyle, DISPLAY_DEFAULTS[ideas.display.id] || {});
  }
  if (kind === 'lines' || kind === 'all') {
    for (const li of ideas.lines) {
      const l = (d.lyrics || []).find((x) => x.id === li.id);
      if (l && !l.style) l.style = { preset: li.preset };
    }
  }
}
