// A cover-art picker for a song, an EP or an album: the cover, Upload, Google Drive, a pick from the
// photos already in the library, and Remove. Covers are images in the shared media library.
import { h, icon, button, toast, pickFiles } from '../dom.js';
import { driveButton } from '../gdrive.js';

const IMAGE_ACCEPT = 'image/*,.jpg,.jpeg,.png,.webp';

/**
 * `current`: the cover's media id (or null). `inherited`: a cover shown greyed when this one is
 * blank (a song showing its album's). `set(id)` saves the choice. `poster: true` makes it a show
 * poster picker: a portrait frame and no streaming-store size advice.
 */
export function coverPicker(ctx, { key, current, inherited = null, inheritedFrom = '', set, label = 'Cover art', poster = false, hint = '' }) {
  const st = ctx.studio;
  const info = current ? st.mediaInfo(current) : null;
  const inh = !info && inherited ? st.mediaInfo(inherited) : null;
  const take = async (files) => {
    const picked = files || (await pickFiles(IMAGE_ACCEPT, false));
    if (!picked.length) return;
    const { added, skipped } = await st.uploadMedia(picked.slice(0, 1), ['image']);
    if (!added.length) return toast(`“${skipped[0] || 'That file'}” isn’t a picture.`, 'error');
    set(added[0].id);
    const img = st.mediaInfo(added[0].id);
    if (poster) return toast(`${label} added`);
    toast(img && img.width && img.width < 3000 ? `Cover added. Stores ask for at least 3000 × 3000 px; this one is ${img.width} × ${img.height}.` : 'Cover added');
  };
  const lib = st.libraryFiles(['image']);
  const sel = lib.length
    ? (() => {
        const s = h('select', { 'aria-label': `${label}: pick from the library`, 'data-k': `cover-lib-${key}` }, h('option', { value: '' }, 'Or pick a picture you already have…'), lib.slice(0, 400).map((x) => h('option', { value: x.id, selected: x.id === current }, x.name)));
        s.addEventListener('change', () => s.value && set(s.value));
        return s;
      })()
    : null;
  const shown = info || inh;
  return h(
    'div',
    { class: `mgr-cover-pick${poster ? ' poster' : ''}` },
    h('div', { class: `mgr-cover${shown ? '' : ' empty'}${inh ? ' inherited' : ''}` }, shown ? (poster ? h('a', { href: shown.url, target: '_blank', rel: 'noopener noreferrer', title: 'Open full size' }, h('img', { src: shown.url, alt: `${label}` })) : h('img', { src: shown.url, alt: `${label}` })) : h('span', {}, icon(poster ? 'image' : 'disc', 28), h('span', { class: 'tiny' }, poster ? 'No poster' : 'No cover'))),
    h(
      'div',
      { class: 'mgr-cover-acts' },
      h('strong', { class: 'small' }, label),
      poster ? h('span', { class: 'muted tiny' }, info && info.width ? `${info.width} × ${info.height}` : hint) : inh ? h('span', { class: 'muted tiny' }, `Using the cover of ${inheritedFrom}. Add one to give this song its own.`) : info && info.width ? h('span', { class: `tiny ${info.width < 3000 || info.width !== info.height ? 'warn-text' : 'muted'}` }, `${info.width} × ${info.height}${info.width !== info.height ? ' · stores want a square' : info.width < 3000 ? ' · stores want 3000 × 3000' : ''}`) : h('span', { class: 'muted tiny' }, 'Square, 3000 × 3000 px is what the stores want.'),
      h('div', { class: 'row' }, button(info ? 'Replace' : 'Upload', () => take(), { iconName: 'upload', variant: 'sm' }), driveButton(IMAGE_ACCEPT, false, (fs) => take(fs)), info ? button('Remove', () => set(null), { variant: 'sm ghost' }) : null),
      sel,
    ),
  );
}
