// Suggested playlists for a song, from its sound (genres, moods, energy, vocals) and what the lyrics
// are about. A built-in list of real editorial playlists (names change, so the list can be edited
// and added to), plus playlist types to search for. Pure functions, unit tested.

export const MOODS = [
  ['aggressive', 'Aggressive'],
  ['dark', 'Dark'],
  ['sad', 'Sad'],
  ['angry', 'Angry'],
  ['anxious', 'Anxious'],
  ['nostalgic', 'Nostalgic'],
  ['romantic', 'Romantic'],
  ['empowering', 'Empowering'],
  ['uplifting', 'Uplifting'],
  ['dreamy', 'Dreamy'],
  ['chill', 'Chill'],
  ['party', 'Party'],
];
export const ENERGIES = [['', 'From the BPM'], ['low', 'Low'], ['mid', 'Medium'], ['high', 'High']];
export const VOCALS = [['', 'Not set'], ['clean', 'Clean singing'], ['mixed', 'Clean and screamed'], ['screamed', 'Mostly screamed'], ['rap', 'Rapped'], ['none', 'Instrumental']];

/** Lyric themes, found from words in the lyrics and title. */
export const THEMES = {
  heartbreak: { label: 'heartbreak', words: ['goodbye', 'left me', 'leave', 'leaving', 'gone', 'broken', 'break', 'ex', 'without you', 'over you', 'lost you', 'used to', 'apart', 'tears', 'cry', 'crying'] },
  anger: { label: 'anger', words: ['hate', 'rage', 'burn', 'fire', 'scream', 'fight', 'blood', 'kill', 'war', 'enemy', 'teeth', 'fist', 'fuck', 'damn', 'liar', 'lies'] },
  anxiety: { label: 'anxiety and self-doubt', words: ['anxious', 'anxiety', 'panic', 'cant breathe', 'breathe', 'head', 'mind', 'voices', 'doubt', 'afraid', 'fear', 'worthless', 'not enough', 'myself', 'mirror', 'insane', 'crazy'] },
  grief: { label: 'loss and grief', words: ['grave', 'funeral', 'dead', 'death', 'die', 'dying', 'ghost', 'heaven', 'miss you', 'buried', 'ashes', 'rest in', 'gone forever'] },
  resilience: { label: 'resilience and hope', words: ['rise', 'stand', 'survive', 'stronger', 'hope', 'light', 'never give', 'keep going', 'alive', 'fight back', 'wont break', 'dont break', 'carry on', 'hold on'] },
  love: { label: 'love', words: ['love', 'kiss', 'heart', 'hold you', 'your eyes', 'baby', 'darling', 'forever', 'together', 'need you', 'want you'] },
  isolation: { label: 'isolation', words: ['alone', 'lonely', 'empty', 'nobody', 'no one', 'silence', 'cold', 'numb', 'disappear', 'invisible', 'hollow'] },
  rebellion: { label: 'rebellion', words: ['rebel', 'riot', 'system', 'control', 'chains', 'break free', 'no rules', 'kings', 'rules', 'revolution', 'obey', 'fake'] },
  nostalgia: { label: 'nostalgia', words: ['remember', 'memories', 'summer', 'young', 'kids', 'back then', 'yesterday', 'old days', 'childhood', 'hometown', 'used to be'] },
  party: { label: 'nights out', words: ['party', 'dance', 'drink', 'tonight', 'club', 'drunk', 'shots', 'friday', 'weekend', 'lights'] },
  night: { label: 'night and dreams', words: ['night', 'midnight', 'dream', 'dreams', 'moon', 'stars', 'sleep', 'dark', '3am', 'insomnia'] },
};

const norm = (s) => ` ${String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9& ]+/g, ' ').replace(/\s+/g, ' ')} `;

/** What the lyrics are about, most mentioned first: [{ id, label, words, hits }]. */
export function lyricThemes(lyrics, title = '', max = 3) {
  const text = norm(`${lyrics || ''} ${title}`);
  const out = [];
  for (const [id, t] of Object.entries(THEMES)) {
    let hits = 0;
    const words = [];
    for (const w of t.words) {
      const k = text.split(` ${w} `).length - 1;
      if (k) {
        hits += k;
        words.push(w);
      }
    }
    if (hits >= 2 || words.length >= 2) out.push({ id, label: t.label, words, hits });
  }
  return out.sort((a, b) => b.hits - a.hits).slice(0, max);
}

// Genre families: anything the user types is mapped onto these so "metalcore" also matches metal.
const FAMILY = [
  ['metalcore', ['metalcore', 'post hardcore', 'posthardcore', 'emocore', 'deathcore', 'mathcore', 'screamo', 'djent', 'core']],
  ['metal', ['metal', 'alt metal', 'nu metal', 'numetal', 'thrash', 'doom', 'sludge', 'prog metal', 'heavy']],
  ['hardrock', ['hard rock', 'grunge', 'stoner', 'alt metal', 'post grunge']],
  ['rock', ['rock', 'alt rock', 'alternative', 'garage', 'post punk', 'shoegaze', 'grunge']],
  ['emo', ['emo', 'emocore', 'midwest emo', 'screamo', 'pop punk', 'post hardcore']],
  ['punk', ['punk', 'pop punk', 'hardcore', 'skate punk', 'post punk']],
  ['indie', ['indie', 'indie rock', 'indie pop', 'bedroom pop', 'dream pop', 'lo fi', 'lofi', 'shoegaze', 'alternative']],
  ['pop', ['pop', 'alt pop', 'synth pop', 'synthpop', 'dance pop', 'indie pop', 'bedroom pop']],
  ['hiphop', ['hip hop', 'hiphop', 'rap', 'trap', 'drill', 'emo rap']],
  ['rnb', ['r&b', 'rnb', 'soul', 'neo soul']],
  ['electronic', ['electronic', 'edm', 'house', 'techno', 'dance', 'dnb', 'drum and bass', 'synthwave', 'dubstep']],
  ['acoustic', ['acoustic', 'folk', 'singer songwriter', 'unplugged', 'americana']],
  ['country', ['country', 'americana', 'bluegrass']],
  ['chill', ['lo fi', 'lofi', 'ambient', 'chill', 'downtempo', 'piano']],
];
/** The genre families a free-text genre list belongs to. */
export function genreFamilies(text) {
  const t = norm(String(text || '').replace(/[-_/]/g, ' '));
  const out = new Set();
  for (const [fam, words] of FAMILY) if (words.some((w) => t.includes(` ${w} `))) out.add(fam);
  return [...out];
}

/** Low, mid or high energy: the sound tag when set, otherwise guessed from the BPM. */
export function energyOf(song) {
  const e = song.sound?.energy;
  if (e) return e;
  const bpm = +song.bpm;
  if (!bpm) return '';
  return bpm >= 135 ? 'high' : bpm >= 95 ? 'mid' : 'low';
}

/**
 * Built-in playlists: [id, name, service, genre families, moods, themes, energy, note].
 * An empty genre list means the playlist is mood-led and takes any genre that fits the mood.
 */
const P = (id, name, service, genres, moods, themes, energy, note) => ({ id, name, service, genres, moods, themes, energy, note, builtin: true });
export const PLAYLISTS = [
  // Spotify: heavy
  P('sp-new-core', 'New Core', 'Spotify', ['metalcore'], ['aggressive', 'angry', 'dark'], [], 'high', 'New metalcore and post-hardcore every Friday.'),
  P('sp-kickass-metal', 'Kickass Metal', 'Spotify', ['metal', 'metalcore'], ['aggressive', 'angry'], ['anger'], 'high', 'Spotify’s big new-metal playlist across styles.'),
  P('sp-all-new-metal', 'All New Metal', 'Spotify', ['metal', 'metalcore'], ['aggressive', 'dark'], [], 'high', 'Fresh metal releases.'),
  P('sp-new-blood', 'New Blood', 'Spotify', ['metal', 'metalcore'], ['aggressive', 'dark'], [], 'high', 'Up-and-coming heavy bands.'),
  P('sp-hard-rock', 'Hard Rock', 'Spotify', ['hardrock', 'metal'], ['aggressive', 'empowering'], ['resilience', 'rebellion'], 'high', 'Big riffs with sung choruses.'),
  P('sp-rock-this', 'Rock This', 'Spotify', ['rock', 'hardrock', 'emo'], ['empowering', 'angry', 'uplifting'], [], 'high', 'The flagship new-rock playlist.'),
  P('sp-heavy-queens', 'Heavy Queens', 'Spotify', ['metal', 'metalcore', 'hardrock'], ['aggressive', 'empowering'], [], 'high', 'Heavy music fronted by women. Pitch only if that fits the band.'),
  P('sp-nu-metal-gen', 'Nu Metal Generation', 'Spotify', ['metal'], ['angry', 'dark'], ['anger', 'anxiety'], 'high', 'Nu-metal and its newer offspring.'),
  P('sp-metal-ballads', 'Metal Ballads', 'Spotify', ['metal', 'hardrock'], ['sad', 'romantic', 'nostalgic'], ['heartbreak', 'grief', 'love'], 'mid', 'Slower, emotional heavy songs.'),
  // Spotify: emo, punk, rock, indie
  P('sp-emo-forever', 'Emo Forever', 'Spotify', ['emo'], ['sad', 'nostalgic', 'angry'], ['heartbreak', 'nostalgia'], '', 'Emo classics with some new songs mixed in.'),
  P('sp-pop-punk', 'Pop Punk’s Not Dead', 'Spotify', ['punk', 'emo'], ['uplifting', 'nostalgic', 'party'], ['heartbreak', 'nostalgia'], 'high', 'Pop-punk old and new.'),
  P('sp-rock-classics', 'Rock Classics', 'Spotify', ['rock'], [], [], '', 'Mostly classic catalog; rarely takes new indie songs.'),
  P('sp-ultimate-indie', 'Ultimate Indie', 'Spotify', ['indie', 'rock'], ['dreamy', 'nostalgic', 'uplifting'], [], '', 'Big indie playlist mixing new and known songs.'),
  P('sp-indie-pop', 'Indie Pop', 'Spotify', ['indie', 'pop'], ['uplifting', 'dreamy', 'romantic'], ['love'], 'mid', 'Bright indie pop.'),
  P('sp-lorem', 'Lorem', 'Spotify', ['indie', 'pop'], ['dreamy', 'chill'], [], '', 'Left-field new pop and indie.'),
  P('sp-bedroom-pop', 'Bedroom Pop', 'Spotify', ['indie', 'pop'], ['dreamy', 'chill', 'sad'], ['love', 'night'], 'low', 'Home-recorded, soft and hazy.'),
  P('sp-pollen', 'Pollen', 'Spotify', ['indie', 'pop', 'rnb'], ['dreamy', 'chill'], [], '', 'Genre-blurring new music.'),
  P('sp-anti-pop', 'Anti Pop', 'Spotify', ['pop', 'indie', 'emo'], ['dark', 'anxious', 'angry'], ['anxiety', 'isolation'], '', 'Alt-pop with an edge.'),
  // Spotify: discovery and big general lists
  P('sp-fresh-finds', 'Fresh Finds', 'Spotify', [], ['uplifting', 'dreamy', 'dark', 'sad'], [], '', 'Independent artists without a big label. A realistic editorial target for a new band.'),
  P('sp-radar', 'RADAR', 'Spotify', [], [], [], '', 'Spotify’s emerging-artist program. Strong first-week numbers help.'),
  P('sp-nmf', 'New Music Friday', 'Spotify', [], [], [], '', 'The biggest new-release list. Very hard to land without a label push; pitch anyway.'),
  P('sp-release-radar', 'Release Radar (your followers)', 'Spotify', [], [], [], '', 'Not pitched: every editorial pitch also puts the song in your followers’ Release Radar.'),
  // Spotify: mood-led
  P('sp-life-sucks', 'Life Sucks', 'Spotify', [], ['sad', 'angry', 'anxious', 'dark'], ['heartbreak', 'anxiety', 'isolation'], '', 'Angsty songs from rock, emo and alt-pop.'),
  P('sp-sad-hour', 'sad hour', 'Spotify', ['pop', 'indie', 'acoustic', 'emo'], ['sad'], ['heartbreak', 'grief', 'isolation'], 'low', 'Sad songs, mostly soft.'),
  P('sp-beast-mode', 'Beast Mode', 'Spotify', ['hiphop', 'metal', 'electronic', 'hardrock'], ['aggressive', 'empowering'], ['resilience', 'anger'], 'high', 'Workout energy.'),
  P('sp-motivation', 'Motivation Mix', 'Spotify', [], ['empowering', 'uplifting'], ['resilience'], 'high', 'Songs about pushing through.'),
  P('sp-sing-car', 'Songs to Sing in the Car', 'Spotify', ['pop', 'rock', 'punk', 'emo'], ['uplifting', 'nostalgic', 'party'], ['nostalgia', 'love'], '', 'Big singalong choruses.'),
  P('sp-coffeehouse', 'Your Favorite Coffeehouse', 'Spotify', ['acoustic', 'indie'], ['chill', 'romantic', 'nostalgic'], ['love', 'nostalgia'], 'low', 'Acoustic and stripped-back songs. Good for an acoustic version.'),
  // Spotify: other genres (for other artists in the manager)
  P('sp-todays-top-hits', 'Today’s Top Hits', 'Spotify', ['pop'], [], [], '', 'Hits only; realistic only for songs already charting.'),
  P('sp-pop-rising', 'Pop Rising', 'Spotify', ['pop'], ['uplifting', 'romantic', 'party'], ['love'], '', 'Rising pop artists.'),
  P('sp-rapcaviar', 'RapCaviar', 'Spotify', ['hiphop'], ['aggressive', 'party'], [], '', 'The biggest rap playlist; hard to land early on.'),
  P('sp-most-necessary', 'Most Necessary', 'Spotify', ['hiphop'], ['aggressive', 'dark'], [], '', 'Newer rappers.'),
  P('sp-mint', 'mint', 'Spotify', ['electronic'], ['party', 'uplifting'], ['party'], 'high', 'New dance and electronic music.'),
  P('sp-hot-country', 'Hot Country', 'Spotify', ['country'], [], [], '', 'Country hits.'),
  P('sp-peaceful-piano', 'Peaceful Piano', 'Spotify', ['chill'], ['chill', 'dreamy'], [], 'low', 'Calm piano pieces.'),
  P('sp-lofi', 'lofi beats', 'Spotify', ['chill', 'hiphop'], ['chill'], [], 'low', 'Instrumental lo-fi.'),
  // Apple Music
  P('am-breaking-metal', 'Breaking Metal', 'Apple Music', ['metal', 'metalcore'], ['aggressive', 'dark'], [], 'high', 'Apple’s new-metal playlist.'),
  P('am-breaking-hard-rock', 'Breaking Hard Rock', 'Apple Music', ['hardrock', 'metalcore', 'rock'], ['aggressive', 'empowering'], [], 'high', 'New hard rock, often takes metalcore with sung choruses.'),
  P('am-metalcore', 'Metalcore', 'Apple Music', ['metalcore'], ['aggressive', 'angry'], [], 'high', 'Metalcore new and old.'),
  P('am-new-in-rock', 'New in Rock', 'Apple Music', ['rock', 'hardrock', 'emo'], [], [], '', 'Weekly new rock releases.'),
  P('am-fresh-blood', 'Fresh Blood', 'Apple Music', ['metal', 'metalcore', 'hardrock'], ['aggressive'], [], 'high', 'New heavy bands.'),
  P('am-breaking-alt', 'Breaking Alternative', 'Apple Music', ['rock', 'indie', 'emo'], [], [], '', 'Up-and-coming alternative.'),
  P('am-alt-ctrl', 'ALT CTRL', 'Apple Music', ['rock', 'indie', 'emo'], ['dark', 'angry', 'anxious'], [], '', 'Apple’s flagship alternative playlist.'),
  P('am-todays-indie-rock', 'Today’s Indie Rock', 'Apple Music', ['indie', 'rock'], [], [], '', 'Current indie rock.'),
  P('am-heartbreak-pop', 'Heartbreak Pop', 'Apple Music', ['pop'], ['sad', 'romantic'], ['heartbreak'], '', 'Breakup pop.'),
  P('am-breaking-rnb', 'Breaking R&B', 'Apple Music', ['rnb'], ['romantic', 'chill'], ['love'], '', 'New R&B voices.'),
  // Amazon Music and Deezer
  P('az-rock-scene', 'Rock Scene', 'Amazon Music', ['rock', 'hardrock', 'metalcore', 'emo'], [], [], '', 'Amazon’s new-rock list.'),
  P('dz-heavy-new-rock', 'Heavy New Rock', 'Deezer', ['hardrock', 'metal', 'metalcore'], ['aggressive'], [], 'high', 'Deezer’s weekly heavy releases.'),
];

/** Built-ins (minus hidden ones) plus the user's own playlists, in one shape. */
export function playlistLibrary(m) {
  const off = new Set(m.playlistsOff || []);
  const split = (s) => (Array.isArray(s) ? s : String(s || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
  const own = (m.playlists || []).map((p) => ({
    id: p.id,
    name: p.name || 'Untitled playlist',
    service: p.service || 'Spotify',
    genres: genreFamilies(p.genres),
    moods: split(p.moods).filter((x) => MOODS.some(([k]) => k === x)),
    themes: split(p.themes),
    energy: '',
    note: p.notes || '',
    curator: p.curator || '',
    contact: p.contact || '',
    url: p.url || '',
    builtin: false,
  }));
  return [...own, ...PLAYLISTS.filter((p) => !off.has(p.id))];
}

/** A song's sound with the band's genres and "for fans of" filled in when the song leaves them empty. */
export function soundOf(song, band = {}) {
  const s = song.sound || {};
  const genres = s.genres || band.genres || '';
  return { genres, families: genreFamilies(genres), moods: s.moods || [], energy: energyOf(song), vocals: song.instrumental ? 'none' : s.vocals || '', similar: s.similar || band.similar || '' };
}

const HEAVY = new Set(['metal', 'metalcore', 'hardrock']);
// Playlists with a narrow brief (e.g. women-fronted bands): shown lower, with the note.
const NICHE = new Set(['sp-heavy-queens']);
// Discovery playlists that take any genre; always listed at the end.
const DISCOVERY = new Set(['sp-fresh-finds', 'sp-radar', 'sp-nmf', 'sp-release-radar']);

/**
 * Playlists that fit a song, best first: [{ ...playlist, score, why: [reasons] }].
 * Genre fit counts most, then mood, lyric themes and energy. Screamed vocals rule out soft
 * pop playlists. The best match for each of the song's genre families is always kept. General
 * discovery playlists (Fresh Finds, New Music Friday…) are always listed at the end.
 */
export function suggestPlaylists(song, m, { max = 10 } = {}) {
  const snd = soundOf(song, m.band);
  const themes = lyricThemes(song.lyrics, song.title).map((t) => t.id);
  const out = [];
  for (const p of playlistLibrary(m)) {
    const why = [];
    let score = 0;
    const gHit = p.genres.filter((g) => snd.families.includes(g));
    const general = !p.genres.length;
    if (gHit.length) {
      score += 4 + gHit.length;
      why.push(`fits ${snd.genres.split(',')[0].trim() || 'the genre'}`);
    } else if (!general) continue;
    const mHit = p.moods.filter((x) => snd.moods.includes(x));
    if (mHit.length) {
      score += 2 * mHit.length;
      why.push(`${mHit.join(' and ')} mood`);
    }
    const tHit = p.themes.filter((x) => themes.includes(x));
    if (tHit.length) {
      score += 1.5 * tHit.length;
      why.push(`lyrics about ${tHit.map((x) => THEMES[x]?.label || x).join(' and ')}`);
    }
    if (p.energy && snd.energy) {
      if (p.energy === snd.energy) {
        score += 1;
        why.push(`${snd.energy} energy`);
      } else if ((p.energy === 'high' && snd.energy === 'low') || (p.energy === 'low' && snd.energy === 'high')) score -= 3;
    }
    const soft = p.genres.length && !p.genres.some((g) => HEAVY.has(g) || g === 'emo' || g === 'punk');
    if (soft && snd.vocals === 'screamed') continue;
    if (soft && snd.vocals === 'mixed') score -= 3;
    const discovery = DISCOVERY.has(p.id);
    if (discovery) {
      score = 0.5; // always worth a pitch, listed last
      why.unshift('open to new independent artists');
    } else if (general && !mHit.length && !tHit.length) continue;
    if (!p.builtin) score += 3; // the user's own list is a deliberate choice
    if (NICHE.has(p.id)) score -= 3;
    if (score > 0) out.push({ ...p, score, why, general: discovery });
  }
  const by = (a, b) => b.score - a.score || a.name.localeCompare(b.name);
  // Keep a mix: the best playlist of every genre family the song has (emo next to metal) makes
  // the list, replacing the lowest-scored ones.
  const ranked = out.filter((x) => !x.general).sort(by);
  const picked = ranked.slice(0, max);
  const keep = new Set(ranked.filter((p) => !p.builtin)); // your own matching lists always show
  for (const p of keep) if (!picked.includes(p)) picked.push(p);
  for (const fam of snd.families) {
    const best = ranked.find((p) => p.genres[0] === fam);
    if (!best) continue;
    keep.add(best);
    if (!picked.includes(best)) picked.push(best);
  }
  while (picked.length > max) {
    const i = picked.map((p, k) => [p, k]).reverse().find(([p]) => !keep.has(p));
    if (!i) break;
    picked.splice(i[1], 1);
  }
  return [...picked.sort(by), ...out.filter((x) => x.general).sort(by)];
}

// Playlist types to search for: from the genre, the moods and the lyric themes.
const THEME_TYPES = {
  heartbreak: ['Breakup songs', 'breakup'],
  anger: ['Rage and workout', 'rage'],
  anxiety: ['Songs about anxiety', 'anxiety'],
  grief: ['Songs about loss', 'grief'],
  resilience: ['Never give up', 'motivation'],
  love: ['Love songs', 'love songs'],
  isolation: ['Lonely nights', 'lonely'],
  rebellion: ['Anthems against the system', 'rebellion'],
  nostalgia: ['Throwback feelings', 'nostalgia'],
  party: ['Pregame and parties', 'party'],
  night: ['Late night drives', 'late night'],
};
const MOOD_TYPES = { aggressive: 'gym', dark: 'dark', sad: 'sad', angry: 'angry', anxious: 'anxious', nostalgic: 'throwback', romantic: 'romantic', empowering: 'motivation', uplifting: 'feel good', dreamy: 'dreamy', chill: 'chill', party: 'party' };

/** Playlist types worth searching for, with search words: [{ title, search, url }]. */
export function playlistTypes(song, m, { max = 6 } = {}) {
  const snd = soundOf(song, m.band);
  const g = (snd.genres.split(',')[0] || '').trim() || 'new music';
  const themes = lyricThemes(song.lyrics, song.title);
  const out = [];
  const add = (title, search) => {
    if (out.some((x) => x.search === search)) return;
    out.push({ title, search, url: `https://open.spotify.com/search/${encodeURIComponent(search)}/playlists` });
  };
  add(`New ${g} (curator playlists)`, `new ${g}`);
  for (const t of themes) add(`${THEME_TYPES[t.id][0]}, ${g}`, `${THEME_TYPES[t.id][1]} ${g}`);
  for (const mood of snd.moods.slice(0, 3)) add(`${MOOD_TYPES[mood][0].toUpperCase()}${MOOD_TYPES[mood].slice(1)} ${g}`, `${MOOD_TYPES[mood]} ${g}`);
  const fans = snd.similar.split(',').map((x) => x.trim()).filter(Boolean);
  for (const a of fans.slice(0, 2)) add(`Playlists with ${a}`, a);
  if (snd.energy === 'high') add(`${g} workout`, `${g} workout`);
  if (m.band.city) add(`${m.band.city} bands`, `${m.band.city} ${g}`);
  return out.slice(0, max);
}

/** Where to look a playlist up (no IDs are stored, so this is a search). */
export function playlistSearchURL(p) {
  if (p.url) return p.url;
  const q = encodeURIComponent(p.name.replace(/\(.*\)/, '').trim());
  if (p.service === 'Apple Music') return `https://music.apple.com/us/search?term=${q}`;
  if (p.service === 'Amazon Music') return `https://music.amazon.com/search/${q}`;
  if (p.service === 'Deezer') return `https://www.deezer.com/search/${q}/playlist`;
  return `https://open.spotify.com/search/${q}/playlists`;
}
