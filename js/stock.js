// Free stock video search: Pexels and Pixabay (free API keys) and Wikimedia Commons (no key).
// Results are normalised to { id, provider, thumb, preview, url, width, height, duration, author, pageUrl, license }.

export const PROVIDERS = {
  pexels: {
    label: 'Pexels',
    needsKey: true,
    keyUrl: 'https://www.pexels.com/api/',
    license: 'Pexels License: free to use, attribution appreciated',
    licenseUrl: 'https://www.pexels.com/license/',
  },
  pixabay: {
    label: 'Pixabay',
    needsKey: true,
    keyUrl: 'https://pixabay.com/api/docs/',
    license: 'Pixabay Content License: free to use',
    licenseUrl: 'https://pixabay.com/service/license-summary/',
  },
  wikimedia: {
    label: 'Wikimedia Commons',
    needsKey: false,
    license: 'Per file (often CC BY / CC BY-SA, which require credit)',
    licenseUrl: 'https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia',
  },
};

const orientationOf = (aspect) => (aspect === '16:9' ? 'landscape' : aspect === '1:1' ? 'square' : 'portrait');

function stripHtml(html) {
  if (typeof DOMParser === 'undefined') return String(html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

/** Pick the rendition closest to 1080p on the short side without going far above it. */
function pickFile(files) {
  const mp4 = files.filter((f) => (f.file_type || '').includes('mp4') && f.link);
  if (!mp4.length) return null;
  const short = (f) => Math.min(f.width || 0, f.height || 0);
  const ok = mp4.filter((f) => short(f) >= 1000).sort((a, b) => short(a) - short(b));
  return ok[0] || mp4.sort((a, b) => short(b) - short(a))[0];
}

async function pexels(query, { key, aspect, page }) {
  const u = new URL('https://api.pexels.com/videos/search');
  u.searchParams.set('query', query);
  u.searchParams.set('orientation', orientationOf(aspect));
  u.searchParams.set('per_page', '24');
  u.searchParams.set('page', String(page));
  const res = await fetch(u, { headers: { Authorization: key } });
  if (res.status === 401 || res.status === 403) throw new Error('Pexels rejected the API key. Check it in Settings.');
  if (!res.ok) throw new Error(`Pexels search failed (${res.status})`);
  const data = await res.json();
  return (data.videos || [])
    .map((v) => {
      const file = pickFile(v.video_files || []);
      const small = (v.video_files || []).filter((f) => (f.file_type || '').includes('mp4')).sort((a, b) => a.width - b.width)[0];
      if (!file) return null;
      return {
        id: `pexels-${v.id}`,
        provider: 'pexels',
        thumb: v.image,
        preview: small ? small.link : file.link,
        url: file.link,
        width: file.width,
        height: file.height,
        duration: v.duration,
        author: v.user ? v.user.name : 'Pexels',
        pageUrl: v.url,
        license: PROVIDERS.pexels.license,
      };
    })
    .filter(Boolean);
}

async function pixabay(query, { key, aspect, page }) {
  const u = new URL('https://pixabay.com/api/videos/');
  u.searchParams.set('key', key);
  u.searchParams.set('q', query.slice(0, 100));
  u.searchParams.set('per_page', '30');
  u.searchParams.set('page', String(page));
  u.searchParams.set('safesearch', 'true');
  const res = await fetch(u);
  if (res.status === 400 || res.status === 401) throw new Error('Pixabay rejected the request. Check the API key in Settings.');
  if (!res.ok) throw new Error(`Pixabay search failed (${res.status})`);
  const data = await res.json();
  const want = orientationOf(aspect);
  const results = (data.hits || []).map((v) => {
    const r = v.videos || {};
    const best = r.large && r.large.url ? r.large : r.medium;
    const small = r.tiny && r.tiny.url ? r.tiny : r.small;
    return {
      id: `pixabay-${v.id}`,
      provider: 'pixabay',
      thumb: (r.medium && r.medium.thumbnail) || (small && small.thumbnail) || '',
      preview: small ? small.url : best.url,
      url: best.url,
      width: best.width,
      height: best.height,
      duration: v.duration,
      author: v.user || 'Pixabay',
      pageUrl: v.pageURL,
      license: PROVIDERS.pixabay.license,
    };
  });
  // Pixabay has no orientation filter for video, so sort matches first.
  const score = (r) => {
    const o = r.height > r.width * 1.1 ? 'portrait' : r.width > r.height * 1.1 ? 'landscape' : 'square';
    return o === want ? 0 : 1;
  };
  return results.sort((a, b) => score(a) - score(b));
}

async function wikimedia(query, { page }) {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  const params = {
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrnamespace: '6',
    gsrlimit: '24',
    gsroffset: String((page - 1) * 24),
    gsrsearch: `${query} filemime:video/webm`,
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '320',
    iiextmetadatafilter: 'LicenseShortName|Artist',
  };
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const res = await fetch(u);
  if (!res.ok) throw new Error(`Wikimedia search failed (${res.status})`);
  const data = await res.json();
  const pages = Object.values((data.query && data.query.pages) || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  return pages
    .map((p) => {
      const ii = p.imageinfo && p.imageinfo[0];
      if (!ii || !ii.url) return null;
      const meta = ii.extmetadata || {};
      return {
        id: `wikimedia-${p.pageid}`,
        provider: 'wikimedia',
        thumb: ii.thumburl,
        preview: null,
        url: ii.url,
        width: ii.width,
        height: ii.height,
        duration: ii.duration,
        author: stripHtml(meta.Artist && meta.Artist.value) || 'Wikimedia Commons contributor',
        pageUrl: ii.descriptionurl,
        license: (meta.LicenseShortName && meta.LicenseShortName.value) || 'See file page',
        title: p.title.replace(/^File:/, ''),
      };
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------- photos (for the Photo Studio)
// Same three sources and keys as the videos. Results: { id, provider, thumb, url, width, height,
// author, pageUrl, license, title, kind: 'image' }.

export function parsePexelsPhotos(data) {
  return ((data && data.photos) || [])
    .filter((p) => p && p.src)
    .map((p) => ({ id: `pexels-p${p.id}`, provider: 'pexels', kind: 'image', thumb: p.src.medium || p.src.small, url: p.src.large2x || p.src.original, width: p.width, height: p.height, author: p.photographer || 'Pexels', pageUrl: p.url, license: PROVIDERS.pexels.license, title: p.alt || '' }));
}
export function parsePixabayPhotos(data) {
  return ((data && data.hits) || []).map((p) => ({ id: `pixabay-p${p.id}`, provider: 'pixabay', kind: 'image', thumb: p.webformatURL || p.previewURL, url: p.largeImageURL || p.webformatURL, width: p.imageWidth, height: p.imageHeight, author: p.user || 'Pixabay', pageUrl: p.pageURL, license: PROVIDERS.pixabay.license, title: p.tags || '' }));
}
export function parseWikimediaPhotos(data) {
  const pages = Object.values((data && data.query && data.query.pages) || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  return pages
    .map((p) => {
      const ii = p.imageinfo && p.imageinfo[0];
      if (!ii || !ii.url || !/^image\/(jpeg|png|webp)$/.test(ii.mime || '')) return null;
      const meta = ii.extmetadata || {};
      return { id: `wikimedia-p${p.pageid}`, provider: 'wikimedia', kind: 'image', thumb: ii.thumburl, url: ii.width > 2400 && ii.thumburl ? ii.thumburl.replace(/\/\d+px-/, '/2400px-') : ii.url, width: ii.width, height: ii.height, author: stripHtml(meta.Artist && meta.Artist.value) || 'Wikimedia Commons contributor', pageUrl: ii.descriptionurl, license: (meta.LicenseShortName && meta.LicenseShortName.value) || 'See file page', title: p.title.replace(/^File:/, '') };
    })
    .filter(Boolean);
}

/** Search stock photos. `orientation`: 'portrait' | 'landscape' | 'square' | ''. */
export async function searchStockPhotos(provider, query, { key = '', orientation = '', page = 1 } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  if (provider === 'pexels') {
    const u = new URL('https://api.pexels.com/v1/search');
    u.searchParams.set('query', q);
    if (orientation) u.searchParams.set('orientation', orientation);
    u.searchParams.set('per_page', '30');
    u.searchParams.set('page', String(page));
    const res = await fetch(u, { headers: { Authorization: key } });
    if (res.status === 401 || res.status === 403) throw new Error('Pexels rejected the API key.');
    if (!res.ok) throw new Error(`Pexels search failed (${res.status})`);
    return parsePexelsPhotos(await res.json());
  }
  if (provider === 'pixabay') {
    const u = new URL('https://pixabay.com/api/');
    u.searchParams.set('key', key);
    u.searchParams.set('q', q.slice(0, 100));
    u.searchParams.set('image_type', 'photo');
    if (orientation === 'portrait') u.searchParams.set('orientation', 'vertical');
    if (orientation === 'landscape') u.searchParams.set('orientation', 'horizontal');
    u.searchParams.set('per_page', '30');
    u.searchParams.set('page', String(page));
    u.searchParams.set('safesearch', 'true');
    const res = await fetch(u);
    if (res.status === 400 || res.status === 401) throw new Error('Pixabay rejected the request. Check the API key.');
    if (!res.ok) throw new Error(`Pixabay search failed (${res.status})`);
    return parsePixabayPhotos(await res.json());
  }
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  const params = { action: 'query', format: 'json', origin: '*', generator: 'search', gsrnamespace: '6', gsrlimit: '30', gsroffset: String((page - 1) * 30), gsrsearch: `${q} filetype:bitmap`, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '400', iiextmetadatafilter: 'LicenseShortName|Artist' };
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const res = await fetch(u);
  if (!res.ok) throw new Error(`Wikimedia search failed (${res.status})`);
  return parseWikimediaPhotos(await res.json());
}

export async function searchStock(provider, query, opts) {
  const q = String(query || '').trim();
  if (!q) return [];
  if (provider === 'pexels') return pexels(q, opts);
  if (provider === 'pixabay') return pixabay(q, opts);
  return wikimedia(q, opts);
}

/** Download a stock file into a Blob, reporting progress 0..1. */
export async function downloadStock(item, onProgress) {
  const res = await fetch(item.url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !total) return res.blob();
  const reader = res.body.getReader();
  const parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    onProgress && onProgress(got / total);
  }
  return new Blob(parts, { type: res.headers.get('content-type') || 'video/mp4' });
}
