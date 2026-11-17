// Freesound (freesound.org) search via APIv2 with a personal API key (token auth).
// We use the HQ MP3 previews, which token-authenticated apps may download; originals need OAuth.

export const FREESOUND_KEY_URL = 'https://freesound.org/apiv2/apply/';

export const FS_LICENSES = [
  ['cc0', 'CC0 only (no credit needed)'],
  ['cc0by', 'CC0 + CC BY (credit the author)'],
];
export const FS_DURATIONS = [
  ['any', 'Any length'],
  ['5', 'Up to 5 s'],
  ['15', 'Up to 15 s'],
  ['60', 'Up to 1 min'],
];
export const FS_SORTS = [
  ['score', 'Best match'],
  ['downloads_desc', 'Most downloaded'],
  ['rating_desc', 'Top rated'],
  ['duration_asc', 'Shortest first'],
];

/** Build the search URL. Non-commercial licenses are always excluded (promos are commercial use). */
export function freesoundUrl(query, { key, license = 'cc0', maxDuration = 'any', sort = 'score', page = 1 } = {}) {
  const u = new URL('https://freesound.org/apiv2/search/text/');
  u.searchParams.set('query', query);
  const filters = [license === 'cc0' ? 'license:"Creative Commons 0"' : 'license:("Creative Commons 0" OR "Attribution")'];
  if (maxDuration !== 'any') filters.push(`duration:[0 TO ${Number(maxDuration)}]`);
  u.searchParams.set('filter', filters.join(' '));
  u.searchParams.set('fields', 'id,name,username,license,duration,previews,url,tags');
  u.searchParams.set('sort', sort);
  u.searchParams.set('page_size', '20');
  u.searchParams.set('page', String(page));
  u.searchParams.set('token', key);
  return u.toString();
}

export function licenseLabel(url) {
  const s = String(url || '');
  if (/publicdomain\/zero/.test(s)) return 'CC0 1.0';
  const m = /licenses\/([a-z-]+)\/([\d.]+)/.exec(s);
  return m ? `CC ${m[1].toUpperCase()} ${m[2]}` : 'See sound page';
}

export function mapResults(json) {
  return (json.results || [])
    .map((r) => {
      const url = r.previews && (r.previews['preview-hq-mp3'] || r.previews['preview-lq-mp3']);
      if (!url) return null;
      const license = licenseLabel(r.license);
      return {
        id: `fs-${r.id}`,
        title: r.name,
        url,
        duration: r.duration,
        author: r.username,
        license,
        pageUrl: r.url,
        tags: (r.tags || []).slice(0, 8),
        needsCredit: license !== 'CC0 1.0',
      };
    })
    .filter(Boolean);
}

export async function searchFreesound(query, opts) {
  if (!opts.key) throw new Error('Add your free Freesound API key first.');
  const res = await fetch(freesoundUrl(query, opts));
  if (res.status === 401) throw new Error('Freesound rejected the API key. Check it below.');
  if (res.status === 429) throw new Error('Freesound’s rate limit was reached. Wait a minute and try again.');
  if (!res.ok) throw new Error(`Freesound search failed (${res.status})`);
  const json = await res.json();
  return { results: mapResults(json), count: json.count || 0, hasMore: !!json.next };
}
