// The Link page settings (band.linkInBio), checked. No imports, so model.js can use it without a cycle.

export const LINKBIO_MAX_BUTTONS = 12;
export const LINKBIO_MAX_SHOWS = 10;

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Fresh settings: everything on except the contact email, three shows, dark. */
export const newLinkInBio = () => ({ address: '', bio: '', merchUrl: '', songId: '', shows: 3, mode: 'dark', photo: true, release: true, socials: true, showEmail: false, qrSpotify: false, buttons: [] });

/** Settings from a save (anything may be missing or wrong): known fields only, each checked. */
export function normalizeLinkInBio(raw) {
  const d = newLinkInBio();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;
  const bool = (k) => (typeof raw[k] === 'boolean' ? raw[k] : d[k]);
  const shows = Number.isFinite(+raw.shows) && raw.shows !== '' && raw.shows !== null ? Math.max(0, Math.min(LINKBIO_MAX_SHOWS, Math.round(+raw.shows))) : d.shows;
  const buttons = (Array.isArray(raw.buttons) ? raw.buttons : [])
    .filter((b) => b && typeof b === 'object' && typeof b.id === 'string')
    .slice(0, LINKBIO_MAX_BUTTONS)
    .map((b) => ({ id: b.id, label: str(b.label, 80), url: str(b.url, 500) }));
  return { address: str(raw.address, 500).trim(), bio: str(raw.bio, 600), merchUrl: str(raw.merchUrl, 500).trim(), songId: str(raw.songId, 80), shows, mode: raw.mode === 'light' ? 'light' : 'dark', photo: bool('photo'), release: bool('release'), socials: bool('socials'), showEmail: bool('showEmail'), qrSpotify: bool('qrSpotify'), buttons };
}
