// Press releases and playlist pitches for a song, drafted from what the manager already knows:
// the song (title, date, story, sound, lyrics), the band profile, upcoming shows and contact
// details. Pure functions, unit tested.
import { niceDate, daysBetween, addDays } from './model.js';
import { hookLines } from './ideas.js';
import { soundOf, lyricThemes, MOODS } from './playlists.js';
import { linkLabel } from './isrc.js';

export const SPOTIFY_PITCH_MAX = 500;
export const PITCH_STATUSES = [['todo', 'To send'], ['sent', 'Sent'], ['replied', 'Replied'], ['added', 'Added'], ['declined', 'Declined']];
export const PITCH_SERVICES = ['Spotify', 'Apple Music', 'Amazon Music', 'Deezer', 'YouTube', 'SoundCloud', 'Blog', 'Radio', 'Other'];

/** The press-release details a song keeps (everything optional). */
export const newPress = () => ({ headline: '', story: '', quote: '', quoteBy: '', credits: '', label: '', edits: {} });
export const newPitch = (fields = {}) => ({ id: '', curator: '', playlist: '', service: 'Spotify', contact: '', sent: '', status: 'todo', followUp: '', followedUp: false, notes: '', ...fields });

const list = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const a = (w) => (/^[aeiou]/i.test(w) ? 'an' : 'a');
const firstPara = (s) => String(s || '').trim().split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim();
const sentence = (s) => {
  const t = String(s || '').trim();
  return !t ? '' : /[.!?”"]$/.test(t) ? t : `${t}.`;
};
const longDate = (iso) => {
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};
const monthDay = (iso) => {
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
};
const moodWords = (snd) => snd.moods.map((k) => (MOODS.find(([v]) => v === k) || [k, k])[1].toLowerCase());

/** Facts every draft shares. */
function facts(song, m, today) {
  const b = m.band || {};
  const snd = soundOf(song, b);
  const name = b.name || 'The band';
  const genres = snd.genres.split(',').map((x) => x.trim()).filter(Boolean);
  const themes = lyricThemes(song.lyrics, song.title).map((t) => t.label);
  const date = song.releaseDate;
  const out = date && today && date <= today;
  const when = date ? (out ? `out now` : `out ${niceDate(date, { weekday: false })}`) : 'out soon';
  const hook = hookLines(song.lyrics, 1)[0] || '';
  const shows = (m.shows || []).filter((s) => s.status === 'confirmed' && s.date && (!today || s.date >= today)).sort((x, y) => x.date.localeCompare(y.date)).slice(0, 4);
  const links = Object.entries(song.links || {}).filter(([, v]) => v).map(([k, v]) => [linkLabel(k), v]);
  const press = { ...newPress(), ...(song.press || {}) };
  return { b, snd, name, genres, themes, date, out, when, hook, shows, links, press, city: b.city || '' };
}

/** "Seattle alt-metal / emocore band Arc Flash" */
function who(f) {
  const g = f.genres.slice(0, 2).join(' / ');
  return `${f.city ? `${f.city} ` : ''}${g ? `${g} ` : ''}${/\b(band|duo|trio)\b/i.test(g) ? '' : 'band '}${f.name}`.replace(/\s+/g, ' ').trim();
}

function soundLine(f, song) {
  const moods = moodWords(f.snd);
  const bits = [];
  if (moods.length) bits.push(`${a(moods[0])} ${list(moods.slice(0, 3))} track`);
  else bits.push('a new track');
  if (f.snd.vocals === 'mixed') bits.push('that trades clean vocals with screams');
  else if (f.snd.vocals === 'screamed') bits.push('built on screamed vocals');
  else if (f.snd.vocals === 'rap') bits.push('with rapped verses');
  if (song.bpm) bits.push(`at ${song.bpm} BPM`);
  let s = `“${song.title}” is ${bits.join(' ')}`;
  if (f.themes.length) s += `, with lyrics about ${list(f.themes.slice(0, 2))}`;
  return `${s}.`;
}

/**
 * Three drafts: { full, short, blurb, headline }. The full release follows the usual layout
 * (FOR IMMEDIATE RELEASE, headline, dateline, story, quote, about, shows, links, contact, ###).
 */
export function pressRelease(song, m, { today = '' } = {}) {
  const f = facts(song, m, today);
  const headline = f.press.headline.trim() || `${f.name} ${f.out ? 'releases' : 'announces'} new single “${song.title}”${f.out ? '' : f.date ? `, out ${monthDay(f.date)}` : ''}`;
  const lead = `${f.city ? `${f.city.toUpperCase()}, ` : ''}${today ? longDate(today) : ''}${f.city || today ? ' — ' : ''}${who(f)} ${f.out ? 'has released' : 'will release'} its new single “${song.title}”${f.date ? ` on ${monthDay(f.date)}` : ''}${f.press.label ? ` via ${f.press.label}` : ''}.`;
  const story = sentence(f.press.story || firstPara(song.notes));
  const fans = f.snd.similar ? `For fans of ${f.snd.similar.replace(/\s*,\s*/g, ', ')}.` : '';
  const q = f.press.quote.trim().replace(/^[“"]|[”"]$/g, '').trim();
  const quote = q ? `“${/[?!]$/.test(q) ? q : `${q.replace(/[.,;:]+$/, '')},`}” says ${f.press.quoteBy.trim() || f.name}.` : '';
  const hook = f.hook ? `The chorus line “${f.hook.replace(/[.,!?]+$/, '')}” is the hook fans will be singing back.` : '';
  const bio = firstPara(f.b.bio);
  const shows = f.shows.map((s) => `${niceDate(s.date, { weekday: false })} · ${s.venue || 'TBA'}${s.city ? `, ${s.city}` : ''}`);
  const contact = [f.b.contactName, f.b.contactEmail, f.b.contactPhone].filter(Boolean).join(' · ');
  const bandLinks = Object.entries(f.b.links || {}).filter(([, v]) => v).map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)}: ${v}`);
  const full = [
    'FOR IMMEDIATE RELEASE',
    '',
    headline,
    '',
    [lead, story].filter(Boolean).join(' '),
    '',
    [soundLine(f, song), hook, fans].filter(Boolean).join(' '),
    quote ? `\n${quote}` : '',
    '',
    `About ${f.name}`,
    bio || `${f.name} is ${f.genres.length ? `${a(f.genres[0])} ${f.genres.slice(0, 2).join(' / ')} band` : 'a band'}${f.city ? ` from ${f.city}` : ''}.`,
    f.b.highlights ? `\n${String(f.b.highlights).split(/\n+/).filter(Boolean).map((x) => `• ${x.trim()}`).join('\n')}` : '',
    shows.length ? `\nUpcoming shows\n${shows.map((x) => `• ${x}`).join('\n')}` : '',
    f.press.credits.trim() ? `\nCredits\n${f.press.credits.trim()}` : '',
    f.links.length || bandLinks.length ? `\nListen and follow\n${[...f.links.map(([k, v]) => `${k}: ${v}`), ...bandLinks].join('\n')}` : '',
    contact ? `\nPress contact\n${contact}` : '',
    '',
    '###',
  ].filter((x, i, arr) => !(x === '' && arr[i - 1] === '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();

  const short = [
    `${who(f)} ${f.out ? 'has released' : 'will release'} “${song.title}”${f.date ? ` on ${monthDay(f.date)}` : ''}${f.press.label ? ` via ${f.press.label}` : ''}.`,
    soundLine(f, song),
    story,
    quote,
    fans,
    shows.length ? `Catch them live: ${shows.slice(0, 2).join('; ')}.` : '',
    f.links[0] ? `Listen: ${f.links[0][1]}` : '',
  ].filter(Boolean).join(' ');

  const blurb = [
    `“${song.title}” is the new single from ${who(f)}, ${f.when}.`,
    f.themes.length ? `It’s about ${list(f.themes.slice(0, 2))}.` : '',
    fans,
    f.shows[0] ? `Live next at ${f.shows[0].venue || 'a show'} on ${niceDate(f.shows[0].date, { weekday: false })}.` : '',
  ].filter(Boolean).join(' ');

  const edits = f.press.edits || {};
  return { headline, full: edits.full ?? full, short: edits.short ?? short, blurb: edits.blurb ?? blurb, drafts: { full, short, blurb } };
}

export const wordCount = (s) => (String(s || '').trim().match(/\S+/g) || []).length;

/** A press release as a printable page (plain text kept, safely escaped). */
export function pressHTML(text, { title = 'Press release' } = {}) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const paras = String(text).split(/\n\s*\n/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:15px/1.6 Georgia,serif;max-width:680px;margin:48px auto;padding:0 24px;color:#111}p:first-child{font:700 12px/1 system-ui,sans-serif;letter-spacing:.12em}p:nth-child(2){font:700 22px/1.25 system-ui,sans-serif}</style></head><body>${paras}</body></html>`;
}

/**
 * The Spotify for Artists pitch (500 characters max): what the song is, how it sounds, what it’s
 * about, the story, and the release plan. Trimmed by dropping the least useful parts first.
 */
export function spotifyPitch(song, m, { today = '' } = {}) {
  const f = facts(song, m, today);
  const moods = moodWords(f.snd);
  const posts = (m.posts || []).filter((p) => p.songId === song.id).length;
  const plan = [posts && `${posts} short-form video${posts === 1 ? '' : 's'}`, (song.shoot?.concept || song.shoot?.date) && 'a music video', (song.release || []).some((t) => /pre-save/i.test(t.text) && t.done) && 'a pre-save campaign'].filter(Boolean);
  const parts = [
    `“${song.title}” is ${a(f.genres[0] || 'new')} ${f.genres.slice(0, 2).join('/') || 'new'} single from ${f.city ? `${f.city}’s ` : ''}${f.name}${moods.length ? `: ${list(moods.slice(0, 2))}` : ''}${f.snd.vocals === 'mixed' ? ', clean vocals against screams' : f.snd.vocals === 'screamed' ? ', screamed vocals' : ''}.`,
    f.themes.length ? `It’s about ${list(f.themes.slice(0, 2))}.` : '',
    sentence(f.press.story || firstPara(song.notes)).slice(0, 180),
    f.snd.similar ? `For fans of ${f.snd.similar.split(',').slice(0, 3).map((x) => x.trim()).join(', ')}.` : '',
    f.shows.length ? `Live: ${f.shows.slice(0, 2).map((x) => `${x.venue || 'TBA'} ${niceDate(x.date, { weekday: false })}`).join(', ')}.` : '',
    plan.length ? `Release plan: ${list(plan)}.` : '',
  ].filter(Boolean);
  const drop = [5, 4, 2, 3, 1]; // release plan, shows, story, fans, themes
  let text = parts.join(' ');
  for (const i of drop) {
    if (text.length <= SPOTIFY_PITCH_MAX) break;
    parts[i] = '';
    text = parts.filter(Boolean).join(' ');
  }
  return text.length > SPOTIFY_PITCH_MAX ? `${text.slice(0, SPOTIFY_PITCH_MAX - 1).replace(/\s+\S*$/, '')}…` : text;
}

/** What to pick in the Spotify for Artists pitch form, from the sound tags. */
export function spotifyFormHints(song, m) {
  const snd = soundOf(song, m.band || {});
  const map = { aggressive: 'Aggressive', dark: 'Dark', sad: 'Sad', angry: 'Angry', anxious: 'Tense', nostalgic: 'Nostalgic', romantic: 'Romantic', empowering: 'Empowering', uplifting: 'Uplifting', dreamy: 'Dreamy', chill: 'Chill', party: 'Party' };
  return [
    ['Genres (up to 3)', snd.genres || 'Add genres in the sound tags'],
    ['Moods (up to 3)', snd.moods.slice(0, 3).map((x) => map[x]).join(', ') || 'Pick moods in the sound tags'],
    ['Vocals', { clean: 'Sung', mixed: 'Sung and screamed', screamed: 'Screamed', rap: 'Rapped', none: 'Instrumental' }[snd.vocals] || 'Not set'],
    ['Hometown', m.band?.city || 'Add a city in the press kit'],
    ['Song description', 'Paste the pitch below'],
  ];
}

/** The last day to pitch Spotify editorial (7 days before release), and how many days are left. */
export function pitchDeadline(song, today) {
  if (!song.releaseDate) return null;
  const last = addDays(song.releaseDate, -7);
  return { last, left: daysBetween(today, last) };
}

/** A short email or DM to an independent curator: { subject, body }. */
export function curatorPitch(song, m, { curator = '', playlist = '', today = '' } = {}) {
  const f = facts(song, m, today);
  const link = (f.links.find(([k]) => k === 'Spotify') || f.links[0] || [])[1] || '[private link or pre-save]';
  const moods = moodWords(f.snd);
  const subject = `Submission for ${playlist || 'your playlist'}: ${f.name} – “${song.title}”`;
  const body = [
    `Hi ${curator.trim() || 'there'},`,
    '',
    `I’m reaching out from ${f.name}${f.city ? `, ${f.genres.length ? `${a(f.genres[0])} ${f.genres.slice(0, 2).join('/')}` : 'a'} band from ${f.city}` : ''}. ${playlist ? `We’ve been listening to ${playlist} and` : 'We’ve been listening to your playlists and'} think our new single “${song.title}” (${f.when}) would fit.`,
    '',
    [`It’s ${moods.length ? list(moods.slice(0, 2)) : 'heavy and melodic'}${f.themes.length ? `, about ${list(f.themes.slice(0, 2))}` : ''}.`, f.snd.similar ? `For fans of ${f.snd.similar.split(',').slice(0, 3).map((x) => x.trim()).join(', ')}.` : ''].filter(Boolean).join(' '),
    '',
    `Listen: ${link}`,
    '',
    'Thanks for listening either way.',
    f.b.contactName || f.name,
  ].join('\n');
  return { subject, body };
}

/** Pitch follow-ups that are due: status Sent, a follow-up date, and not followed up yet. */
export const followUpsDue = (song) => (song.pitches || []).filter((p) => p.status === 'sent' && p.followUp && !p.followedUp);

/** Counts for a song’s pitches: { total, sent, added, replied, declined }. */
export function pitchStats(song) {
  const ps = song.pitches || [];
  const n = (s) => ps.filter((p) => p.status === s).length;
  return { total: ps.length, sent: ps.filter((p) => p.status !== 'todo').length, added: n('added'), replied: n('replied'), declined: n('declined') };
}
