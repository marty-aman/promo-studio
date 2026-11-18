// Spotify link import: paste a track or album link to fill the end card's title and cover art and keep
// the link for "Listen on Spotify". Uses Spotify's public oEmbed endpoint (no key, CORS allowed).
// Spotify doesn't let other apps download song audio, so the song itself still comes from your file.

/** Parse a Spotify link / URI -> { type: 'track'|'album', id, url } or null. */
export function parseSpotifyUrl(input) {
  const s = String(input || '').trim();
  let m = /^spotify:(track|album):([A-Za-z0-9]{22})$/.exec(s);
  if (!m) m = /^https?:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?(?:embed\/)?(track|album)\/([A-Za-z0-9]{22})(?:[/?#].*)?$/i.exec(s);
  if (!m) return null;
  const type = m[1].toLowerCase();
  return { type, id: m[2], url: `https://open.spotify.com/${type}/${m[2]}` };
}

/** Spotify cover URLs end in a size code; ask for the 640 px version (falls back to what oEmbed gave). */
export function largerCover(url) {
  return String(url || '').replace(/ab67616d00001e02/, 'ab67616d0000b273');
}

/**
 * Look a link up: { title, url, coverUrl, coverBlob|null }. Throws a readable Error.
 * `fetchFn` is injectable for tests.
 */
export async function fetchSpotifyInfo(input, fetchFn = fetch) {
  const ref = parseSpotifyUrl(input);
  if (!ref) throw new Error('That isn’t a Spotify track or album link. In Spotify use Share → Copy link.');
  const res = await fetchFn(`https://open.spotify.com/oembed?url=${encodeURIComponent(ref.url)}`);
  if (!res.ok) throw new Error(res.status === 404 ? 'Spotify can’t find that track. Is it released yet?' : `Spotify answered ${res.status}. Try again in a minute.`);
  const info = await res.json();
  let coverBlob = null;
  for (const u of [largerCover(info.thumbnail_url), info.thumbnail_url].filter(Boolean)) {
    try {
      const r = await fetchFn(u);
      if (r.ok) {
        coverBlob = await r.blob();
        break;
      }
    } catch {
      /* try the next size */
    }
  }
  return { ...ref, title: String(info.title || '').trim(), coverUrl: info.thumbnail_url || null, coverBlob };
}
