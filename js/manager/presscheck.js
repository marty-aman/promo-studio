// Press kit health check: what a booker, blog or curator looks for first, checked against what the
// Manager already holds. Pure function, unit tested; the panel is on the Press kit page.
import { daysBetween } from './model.js';
import { shortBio } from './extras.js';

export const BIO_MIN = 80; // characters in the first paragraph (the short bio)
export const BIO_MAX = 600;
export const PRESS_PHOTO_MIN = 2000; // px on the long side, enough to print
export const STATS_MAX_AGE = 90; // days

const url = (v) => /^https?:\/\/[^\s"'<>]+$/i.test(v || '');
const email = (v) => /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i.test(v || '');
const SOCIAL = ['instagram', 'tiktok', 'youtube'];
const isVideo = (u) => url(u) && /(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|instagram\.com\/(reel|tv|p)\/)/i.test(u);

/**
 * Every check: { id, label, state: 'pass' | 'warn' | 'unknown', detail, fix, page, field? }.
 * `page` is the Manager page that fixes it; `field` is the data-k of a Press kit field.
 * `sizeOf(mediaId)` gives { width, height } of a library image (0 while not loaded yet), null when the
 * image is not in the library, or undefined when it can't be looked up.
 */
export function pressCheck({ band = {}, songs = [], photos = [], stats = {}, shows = [], today = '', sizeOf = () => undefined } = {}) {
  const out = [];
  const add = (id, label, state, detail, fix, page, field = '') => out.push({ id, label, state, detail, fix: state === 'pass' ? '' : fix, page, field });

  // short bio
  const first = String(band.bio || '').split(/\n{2,}/)[0].trim();
  if (!first) add('bio', 'Short bio', 'warn', 'No bio yet.', 'Write two or three sentences: who you are, how you sound, one highlight.', 'epk', 'epk-bio');
  else if (first.length < BIO_MIN) add('bio', 'Short bio', 'warn', `The first paragraph is ${first.length} characters.`, `Make it at least ${BIO_MIN} characters, so it says how you sound and one thing you’ve done.`, 'epk', 'epk-bio');
  else if (first.length > BIO_MAX) add('bio', 'Short bio', 'warn', `The first paragraph is ${first.length} characters; forms cut it to “${shortBio(band.bio).slice(0, 40)}…”.`, `Keep the first paragraph under ${BIO_MAX} characters; put the rest in later paragraphs.`, 'epk', 'epk-bio');
  else add('bio', 'Short bio', 'pass', `${first.length} characters.`, '', 'epk', 'epk-bio');

  // profile photo
  const dims = (id) => {
    const s = id && sizeOf(id);
    const rec = (photos || []).find((p) => p.mediaId === id) || {};
    const w = (s && s.width) || rec.width || 0;
    const hh = (s && s.height) || rec.height || 0;
    return { w, h: hh, missing: s === null };
  };
  if (!band.photoId) add('photo', 'Profile photo', 'warn', 'None set.', 'Upload or pick a square photo under The band.', 'epk');
  else if (dims(band.photoId).missing) add('photo', 'Profile photo', 'warn', 'The photo is no longer in the media library.', 'Pick or upload it again under The band.', 'epk');
  else add('photo', 'Profile photo', 'pass', 'Set.', '', 'epk');

  // a high-resolution press photo among the picked ones
  const picked = (band.epkPhotos || []).map((id) => ({ id, ...dims(id) }));
  const known = picked.filter((p) => p.w && p.h);
  const best = known.reduce((x, p) => Math.max(x, p.w, p.h), 0);
  if (!picked.length) add('pressPhoto', 'High-resolution press photo', 'warn', 'No press photos picked.', `Pick at least one photo of ${PRESS_PHOTO_MIN} px or more on its long side under Press photos.`, 'epk', 'epk-photos');
  else if (best >= PRESS_PHOTO_MIN) add('pressPhoto', 'High-resolution press photo', 'pass', `Largest picked photo: ${best} px on its long side.`, '', 'epk', 'epk-photos');
  else if (!known.length) add('pressPhoto', 'High-resolution press photo', 'unknown', 'Can’t tell: the picked photos’ sizes aren’t known (not loaded, or missing from the library).', 'Open the Photos page once so the photos load, then come back.', 'photos');
  else add('pressPhoto', 'High-resolution press photo', 'warn', `Largest picked photo is ${best} px on its long side${known.length < picked.length ? ' (some sizes unknown)' : ''}.`, `Add a photo of at least ${PRESS_PHOTO_MIN} px for print and blog headers.`, 'photos');

  // a live video link
  const vids = [(band.links || {}).youtube, ...songs.flatMap((s) => [(s.links || {}).youtube])].filter(isVideo);
  if (vids.length) add('video', 'Live video link', 'pass', `${vids.length} video link${vids.length > 1 ? 's' : ''}.`, '', 'songs');
  else add('video', 'Live video link', 'warn', 'No YouTube link on the band or any song.', 'Add your YouTube channel under Links, or a music video link on a song.', 'epk', 'epk-link-youtube');

  // latest numbers
  const dates = ((stats && stats.imports) || []).map((x) => String(x.at || '').slice(0, 10)).filter(Boolean).sort();
  const last = dates[dates.length - 1] || '';
  const age = last && today ? daysBetween(last, today) : null;
  if (!last) add('stats', 'Latest numbers', 'warn', 'No streaming stats imported yet.', 'Import a Spotify for Artists or distributor export on Streaming stats.', 'stats');
  else if (age != null && age <= STATS_MAX_AGE) add('stats', 'Latest numbers', 'pass', `Last import ${age === 0 ? 'today' : `${age} day${age === 1 ? '' : 's'} ago`}.`, '', 'stats');
  else add('stats', 'Latest numbers', 'warn', `Last import was ${age} days ago.`, `Import a fresh export (within ${STATS_MAX_AGE} days) before quoting numbers.`, 'stats');

  // contact email
  if (email(band.contactEmail)) add('email', 'Contact email', 'pass', 'Set.', '', 'epk', 'epk-cemail');
  else add('email', 'Contact email', 'warn', band.contactEmail ? 'The email doesn’t look valid.' : 'No booking email.', 'Add a booking email under Booking contact.', 'epk', 'epk-cemail');

  // social links
  const socials = SOCIAL.filter((k) => url((band.links || {})[k]));
  if (socials.length) add('social', 'Social links', 'pass', `${socials.length} of Instagram, TikTok, YouTube.`, '', 'epk', 'epk-link-instagram');
  else add('social', 'Social links', 'warn', 'No Instagram, TikTok or YouTube link.', 'Add at least one under Links.', 'epk', 'epk-link-instagram');

  // a released song with links
  const out1 = songs.filter((s) => (s.status === 'released' || (s.releaseDate && today && s.releaseDate <= today)) && Object.values(s.links || {}).some(url));
  const released = songs.filter((s) => s.status === 'released' || (s.releaseDate && today && s.releaseDate <= today));
  if (out1.length) add('song', 'Released song with links', 'pass', `${out1.length} released song${out1.length > 1 ? 's' : ''} with links.`, '', 'songs');
  else add('song', 'Released song with links', 'warn', released.length ? 'Your released songs have no streaming links.' : 'No released song yet.', released.length ? 'Paste the Spotify or YouTube link on the song (Songs & releases → Links).' : 'Once a song is out, add its links on Songs & releases.', 'songs');

  // upcoming shows
  const up = shows.filter((s) => s.status === 'confirmed' && s.date && (!today || s.date >= today));
  if (up.length) add('shows', 'Upcoming shows', 'pass', `${up.length} confirmed.`, '', 'shows');
  else add('shows', 'Upcoming shows', 'warn', 'No confirmed upcoming shows.', 'Bookers look for activity: add or confirm a show.', 'shows');

  return out;
}

/** "6 of 9 checks pass" counts only passes; can't-tell checks are not counted as passing. */
export const pressScore = (checks) => ({ pass: checks.filter((c) => c.state === 'pass').length, total: checks.length });
