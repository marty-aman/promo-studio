// A song's Files tab: its Guitar Pro tabs, stems, the music video and raw footage, kept in the shared media library.
// Each file can be sent to the Video Studio: footage and the music video as clips or picture-in-
// picture, stems as a drum chart, a visualizer or an extra audio track.
import { h, button, iconButton, toast, pickFiles } from '../dom.js';
import { driveButton } from '../gdrive.js';
import { STEM_ROLES, newFiles, addStems, addFootage, addTabs, setVideo, fileCounts } from './files.js';

/** Which upload is running (not saved). */
export const filesUI = { busy: null };

const AUDIO_ACCEPT = 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac,.aif,.aiff';
const VIDEO_ACCEPT = 'video/*,.mp4,.mov,.webm,.m4v';
const FOOTAGE_ACCEPT = `${VIDEO_ACCEPT},image/*`;
const TAB_ACCEPT = '.gp,.gp3,.gp4,.gp5,.gpx,.gp7,.gp8,.musicxml,.mxl,.xml';
const len = (s) => (s && Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function filesTab(ctx, song, S) {
  const st = ctx.studio;
  const files = song.files || newFiles();
  const info = (id) => st.mediaInfo(id);
  const rerender = () => ctx.setTab('files');
  const busy = (key) => filesUI.busy === `${song.id}:${key}`;

  /** Upload from the computer, then attach with `attach(song, added)`. */
  const upload = async (key, accept, kinds, multiple, attach, label, files = null) => {
    const picked = files || (await pickFiles(accept, multiple));
    if (!picked.length) return;
    filesUI.busy = `${song.id}:${key}`;
    rerender();
    try {
      const { added, skipped } = await st.uploadMedia(picked, kinds);
      if (added.length) ctx.update(S((s) => attach(s, added)));
      if (skipped.length) toast(`Skipped ${skipped.join(', ')}: not ${label}.`, 'error', 5000);
      else if (added.length) toast(`Added ${added.length === 1 ? `“${added[0].name}”` : plural(added.length, 'file')} to “${song.title}”`);
    } finally {
      filesUI.busy = null;
      rerender();
    }
  };
  /** A "pick from the library" menu for files of `kinds` the song doesn't have yet. */
  const fromLibrary = (key, kinds, have, attach, placeholder) => {
    const options = st.libraryFiles(kinds).filter((m) => !have.includes(m.id));
    if (!options.length) return null;
    const sel = h('select', { 'data-k': `lib-${key}-${song.id}`, 'aria-label': placeholder }, h('option', { value: '' }, placeholder), options.map((m) => h('option', { value: m.id }, m.name)));
    sel.addEventListener('change', () => {
      const m = options.find((x) => x.id === sel.value);
      if (m) ctx.update(S((s) => attach(s, [m])));
    });
    return sel;
  };
  const send = (id, how) => st.useInEditor(id, how, { open: false });
  const missing = (label, onRemove) => h('div', { class: 'mgr-file missing' }, h('span', { class: 'muted small' }, `${label}: this file was removed from the media library.`), button('Remove', onRemove, { variant: 'sm ghost' }));

  // ---- Guitar Pro tabs
  const tabRows = (files.tabs || []).map((t) => {
    const m = info(t.mediaId);
    const drop = () => ctx.update(S((x) => (x.files.tabs = x.files.tabs.filter((y) => y.id !== t.id))));
    if (!m) return missing('Tab', drop);
    const parts = [...(m.tracks || []), m.drumTracks ? `drums${m.drumTracks > 1 ? ` ×${m.drumTracks}` : ''}` : ''].filter(Boolean);
    return h(
      'div',
      { class: 'mgr-file tab' },
      h('div', { class: 'mgr-file-main' }, h('strong', { title: m.name }, m.title || m.name), m.title ? h('span', { class: 'muted tiny' }, m.name) : null),
      parts.length ? h('div', { class: 'mgr-tracks' }, parts.map((p) => h('span', { class: 'mgr-chip' }, p))) : null,
      h(
        'div',
        { class: 'row' },
        button('Add to the video', () => send(m.id, 'tab'), { iconName: 'guitar', variant: 'sm', title: 'Show the tab (and drums) on the video, in time with the song' }),
        button('Open in Tab Studio', () => st.useInEditor(m.id, 'tabstudio'), { iconName: 'type', variant: 'sm', title: 'Edit or fix the tab' }),
        iconButton('trash', `Remove ${m.name} from this song`, drop, 'ghost'),
      ),
    );
  });
  const tabs = h(
    'section',
    { class: 'mgr-sect' },
    h('h2', {}, `Guitar Pro tab · ${(files.tabs || []).length}`),
    h('p', { class: 'muted small' }, 'Guitar Pro 3–8 (.gp, .gp5, .gpx…) or MusicXML. Add it to the video as a scrolling tab, a fretboard or a drum chart, or open it in Tab Studio to fix it.'),
    tabRows.length ? h('div', { class: 'mgr-files' }, tabRows) : null,
    h(
      'div',
      { class: 'row' },
      button(busy('tabs') ? 'Uploading…' : 'Upload a Guitar Pro file', () => upload('tabs', TAB_ACCEPT, ['tab'], true, (s, added) => addTabs(s, added), 'Guitar Pro or MusicXML files'), { iconName: 'upload', variant: 'sm primary', disabled: busy('tabs') }),
      driveButton(TAB_ACCEPT, true, (fs) => upload('tabs', TAB_ACCEPT, ['tab'], true, (s, added) => addTabs(s, added), 'Guitar Pro or MusicXML files', fs)),
      fromLibrary('tabs', ['tab'], (files.tabs || []).map((t) => t.mediaId), (s, added) => addTabs(s, added), 'Or pick a tab from the library'),
    ),
  );

  // ---- stems
  const stemRows = files.stems.map((s) => {
    const m = info(s.mediaId);
    const drop = () => ctx.update(S((x) => (x.files.stems = x.files.stems.filter((y) => y.id !== s.id))));
    if (!m) return missing('Stem', drop);
    return h(
      'div',
      { class: 'mgr-file stem' },
      h('div', { class: 'mgr-file-main' }, h('strong', { title: m.name }, m.name), h('span', { class: 'muted tiny' }, len(m.duration))),
      ctx.form.select(`stem-role-${s.id}`, '', s.role, STEM_ROLES, S((x, v) => {
        const y = x.files.stems.find((z) => z.id === s.id);
        if (y) y.role = v;
      })),
      h('audio', { controls: true, preload: 'none', src: m.url, 'aria-label': `Play ${m.name}` }),
      h(
        'div',
        { class: 'row' },
        s.role === 'drums' ? button('Drum chart', () => send(m.id, 'drums'), { iconName: 'activity', variant: 'sm', title: 'Add a drum chart layer that finds the hits in this stem' }) : null,
        button('Visualizer', () => send(m.id, 'viz'), { iconName: 'volume', variant: 'sm', title: 'Add a visualizer that moves to this stem' }),
        button('Audio track', () => send(m.id, 'audio'), { iconName: 'music', variant: 'sm', title: 'Add it as an extra audio track at the playhead' }),
        iconButton('trash', `Remove ${m.name} from this song`, drop, 'ghost'),
      ),
    );
  });
  const stemIds = files.stems.map((s) => s.mediaId);
  const stems = h(
    'section',
    { class: 'mgr-sect' },
    h('h2', {}, `Stems · ${files.stems.length}`),
    h('p', { class: 'muted small' }, 'Separate parts of the mix: drums, bass, guitars, vocals. The part is guessed from the file name. A drum stem can drive a drum chart, and any stem can drive a visualizer or play on its own track.'),
    stemRows.length ? h('div', { class: 'mgr-files' }, stemRows) : null,
    h(
      'div',
      { class: 'row' },
      button(busy('stems') ? 'Uploading…' : 'Upload stems', () => upload('stems', AUDIO_ACCEPT, ['audio'], true, (s, added) => addStems(s, added), 'audio files'), { iconName: 'upload', variant: 'sm primary', disabled: busy('stems') }),
      driveButton(AUDIO_ACCEPT, true, (fs) => upload('stems', AUDIO_ACCEPT, ['audio'], true, (s, added) => addStems(s, added), 'audio files', fs)),
      fromLibrary('stems', ['audio'], [...stemIds, song.audioId].filter(Boolean), (s, added) => addStems(s, added), 'Or pick audio from the library'),
    ),
  );

  // ---- music video
  const vm = files.video && info(files.video.mediaId);
  const dropVideo = () => ctx.update(S((s) => setVideo(s, null)));
  const pickVideo = () => upload('video', VIDEO_ACCEPT, ['video'], false, (s, added) => setVideo(s, added[0]), 'video files');
  const video = h(
    'section',
    { class: 'mgr-sect' },
    h('h2', {}, 'Music video'),
    files.video && !vm ? missing('Music video', dropVideo) : null,
    vm
      ? h(
          'div',
          { class: 'mgr-file video' },
          h('video', { controls: true, preload: 'metadata', src: vm.url, poster: vm.thumb || undefined, playsinline: true, 'aria-label': `Play ${vm.name}` }),
          h('div', { class: 'mgr-file-main' }, h('strong', { title: vm.name }, vm.name), h('span', { class: 'muted tiny' }, len(vm.duration))),
          h(
            'div',
            { class: 'row' },
            button('Add to the video track', () => send(vm.id, 'clip'), { iconName: 'plus', variant: 'sm' }),
            button('Picture-in-picture', () => send(vm.id, 'overlay'), { iconName: 'layers', variant: 'sm', title: 'Add it on top of the edit at the playhead' }),
            button(busy('video') ? 'Uploading…' : 'Replace', pickVideo, { iconName: 'upload', variant: 'sm ghost', disabled: busy('video') }),
            iconButton('trash', 'Remove the music video from this song', dropVideo, 'ghost'),
          ),
        )
      : h('p', { class: 'muted small' }, 'The finished video for this song. Cut teasers and shorts from it in the Video Studio.'),
    vm
      ? null
      : h(
          'div',
          { class: 'row' },
          button(busy('video') ? 'Uploading…' : 'Upload the music video', pickVideo, { iconName: 'upload', variant: 'sm primary', disabled: busy('video') }),
          driveButton(VIDEO_ACCEPT, false, (fs) => upload('video', VIDEO_ACCEPT, ['video'], false, (s, added) => setVideo(s, added[0]), 'video files', fs)),
          fromLibrary('video', ['video'], [], (s, added) => setVideo(s, added[0]), 'Or pick a video from the library'),
        ),
    song.links.youtube ? h('p', { class: 'muted tiny' }, 'Its YouTube link is on the Overview tab.') : null,
  );

  // ---- raw footage
  const clips = files.footage.map((c) => {
    const m = info(c.mediaId);
    const drop = () => ctx.update(S((x) => (x.files.footage = x.files.footage.filter((y) => y.id !== c.id))));
    if (!m) return missing('Clip', drop);
    return h(
      'div',
      { class: 'mgr-clip' },
      h('div', { class: 'mgr-clip-thumb' }, m.thumb ? h('img', { src: m.thumb, alt: '' }) : null, m.kind === 'video' && m.duration ? h('span', { class: 'mgr-clip-len' }, len(m.duration)) : m.kind === 'image' ? h('span', { class: 'mgr-clip-len' }, 'Photo') : null),
      h('strong', { title: m.name }, m.name),
      ctx.form.text(`clip-note-${c.id}`, '', c.note, S((x, v) => {
        const y = x.files.footage.find((z) => z.id === c.id);
        if (y) y.note = v;
      }), { placeholder: 'Note: chorus take, crowd, B-roll…' }),
      h(
        'div',
        { class: 'row' },
        button('Add', () => send(m.id, 'clip'), { iconName: 'plus', variant: 'sm', title: 'Add to the end of the video track' }),
        button('PiP', () => send(m.id, 'overlay'), { iconName: 'layers', variant: 'sm', title: 'Picture-in-picture at the playhead' }),
        iconButton('trash', `Remove ${m.name} from this song`, drop, 'ghost'),
      ),
    );
  });
  const usable = files.footage.filter((c) => info(c.mediaId));
  const footage = h(
    'section',
    { class: 'mgr-sect' },
    h('div', { class: 'mgr-sect-head' }, h('h2', {}, `Raw footage · ${files.footage.length}`), usable.length > 1 ? button(`Add all ${usable.length} to the video track`, () => {
      for (const c of usable) send(c.mediaId, 'clip');
    }, { iconName: 'plus', variant: 'sm' }) : null),
    h('p', { class: 'muted small' }, 'Everything you filmed for this song: shoot takes, live clips, B-roll and photos. Add a note to find takes later. They also show in the Video Studio under Video → From your songs.'),
    clips.length ? h('div', { class: 'mgr-clips' }, clips) : null,
    h(
      'div',
      { class: 'row' },
      button(busy('footage') ? 'Uploading…' : 'Upload footage', () => upload('footage', FOOTAGE_ACCEPT, ['video', 'image'], true, (s, added) => addFootage(s, added), 'videos or photos'), { iconName: 'upload', variant: 'sm primary', disabled: busy('footage') }),
      driveButton(FOOTAGE_ACCEPT, true, (fs) => upload('footage', FOOTAGE_ACCEPT, ['video', 'image'], true, (s, added) => addFootage(s, added), 'videos or photos', fs)),
      fromLibrary('footage', ['video', 'image'], [...files.footage.map((c) => c.mediaId), files.video?.mediaId].filter(Boolean), (s, added) => addFootage(s, added), 'Or pick from the library'),
    ),
  );

  const n = fileCounts(song);
  return h(
    'div',
    {},
    h(
      'div',
      { class: 'mgr-files-head' },
      h('p', { class: 'muted small' }, `Files are kept in this browser with the Video Studio’s media, so they’re ready in the editor. Removing one here only takes it off this song.${n.total ? '' : ' Nothing added yet.'}`),
      button('Open the Video Studio', () => ctx.studio.openStudio(), { iconName: 'film', variant: 'sm' }),
    ),
    h('div', { class: 'mgr-cols' }, h('div', {}, tabs, video, stems), footage),
  );
}
