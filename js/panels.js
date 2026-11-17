// Left-hand tool panels and the right-hand inspector.
import {
  ASPECTS,
  uid,
  formatTime,
  parseTime,
  linesFromText,
  parseLRC,
  toLRC,
  shiftLyrics,
  sortLyrics,
  tapStart,
  tapEnd,
  findHook,
  detectBeats,
  beatCutPlan,
  songToTimeline,
  timelineToSong,
  clipAt,
  splitClip,
  layoutClips,
  maxClipDuration,
  clamp,
} from './core.js';
import { FONTS, PLATFORMS, FILTER_PRESETS, newText, defaultLyricStyle, loadSettings, saveSettings, loadTemplates, saveTemplates } from './state.js';
import { media, addMedia, removeMedia } from './media.js';
import { PROVIDERS, searchStock, downloadStock } from './stock.js';
import { exportVideo, pickMimeType } from './engine.js';
import { TRANSITIONS, TEXT_ANIMATIONS, END_ANIMATIONS, CLIP_EFFECTS, MIRRORS } from './renderer.js';
import { PLATFORM_OVERLAYS, overlaySupported } from './overlays.js';
import { h, icon, button, iconButton, toast, download, pickFiles, field, section, Binder } from './dom.js';

const fontOptions = () => [
  ...FONTS.map((f) => [f.id, f.label]),
  ...media
    .all()
    .filter((m) => m.kind === 'font' && m.family)
    .map((m) => [m.family, `${m.family} (uploaded)`]),
];

const ANIMATIONS = TEXT_ANIMATIONS;

const LYRIC_PRESETS = {
  'Bold pop': { font: 'Bebas Neue', size: 10, color: '#ffffff', outline: '#000000', outlineWidth: 0.6, shadow: true, box: false, animation: 'pop', uppercase: true },
  Karaoke: { font: 'Montserrat', size: 6, color: '#ffffff', highlight: '#ffd400', outline: '#000000', outlineWidth: 0.5, shadow: true, box: false, animation: 'karaoke', uppercase: false },
  'Word by word': { font: 'Oswald', size: 7.5, color: '#ffffff', highlight: '#ff4d6d', outline: '#000000', outlineWidth: 0.4, shadow: true, box: false, animation: 'words', uppercase: true },
  Boxed: { font: 'Inter', size: 5.2, color: '#111111', box: true, boxColor: '#ffffff', boxOpacity: 0.95, outlineWidth: 0, shadow: false, animation: 'slide', uppercase: false },
  Typewriter: { font: 'Courier New', size: 5.5, color: '#f5f5f5', outlineWidth: 0, shadow: true, box: true, boxColor: '#000000', boxOpacity: 0.6, animation: 'typewriter', uppercase: false },
  Neon: { font: 'Montserrat', size: 7, color: '#ffffff', highlight: '#ff2bd6', outline: '#ff2bd6', outlineWidth: 0.25, shadow: false, box: false, animation: 'neon', uppercase: true },
  'Drop & bounce': { font: 'Bebas Neue', size: 10, color: '#ffd400', outline: '#000000', outlineWidth: 0.7, shadow: true, box: false, animation: 'bounce', uppercase: true },
  Glitch: { font: 'Oswald', size: 8, color: '#ffffff', outline: '#000000', outlineWidth: 0.3, shadow: true, box: false, animation: 'glitch', uppercase: true },
  'Beat pulse': { font: 'Bebas Neue', size: 9.5, color: '#ffffff', outline: '#000000', outlineWidth: 0.6, shadow: true, box: false, animation: 'beat', uppercase: true },
  'Hand drawn': { font: 'Permanent Marker', size: 7, color: '#fff7d6', outline: '#1a1a1a', outlineWidth: 0.5, shadow: true, box: false, animation: 'fade', uppercase: false },
};

export function createPanels({ store, engine, ui }) {
  const settings = loadSettings();
  const sync = { active: false, cursor: 0 };

  // -------------------------------------------------------------- media actions
  const actions = {
    addClip(rec, at = null) {
      store.update((d) => {
        const clip = {
          id: uid('clip'),
          mediaId: rec.id,
          kind: rec.kind,
          in: 0,
          duration: rec.kind === 'image' ? 3 : +Math.min(rec.duration || 5, 6).toFixed(2),
          speed: 1,
          fit: 'cover',
          zoom: 1,
          panX: 0,
          panY: 0,
          rotate: 0,
          flip: false,
          volume: 0,
          filter: { preset: 'none', adjust: {} },
          transition: { type: d.clips.length ? 'crossfade' : 'fade', duration: 0.4 },
          kenBurns: rec.kind === 'image' ? { fromZoom: 1, toZoom: 1.15, fromX: 0, toX: 0, fromY: 0, toY: 0 } : null,
        };
        if (at == null) d.clips.push(clip);
        else d.clips.splice(at, 0, clip);
        const total = d.clips.reduce((s, c) => s + c.duration, 0);
        if (d.clips.length === 1 && !d.song) d.duration = Math.max(d.duration, +(total + (d.endCard.enabled ? d.endCard.duration : 0)).toFixed(2));
      });
      toast(`Added “${rec.name}” to the video track`);
    },
    useSong(rec) {
      store.update((d) => {
        d.song = { mediaId: rec.id, offset: 0, volume: 1, fadeIn: 0.3, fadeOut: 1.2 };
        d.beats = null;
      });
      toast('Song set. Use “Find the hook” in the Audio tab to pick the best section.');
    },
    addAudioTrack(rec) {
      store.update((d) => {
        d.audioTracks.push({
          id: uid('aud'),
          mediaId: rec.id,
          start: +engine.t.toFixed(2),
          in: 0,
          duration: +Math.min(rec.duration || 5, Math.max(1, d.duration - engine.t)).toFixed(2),
          volume: 0.8,
          fadeIn: 0,
          fadeOut: 0.3,
        });
      });
      toast(`Added “${rec.name}” as an extra audio track`);
    },
    useCover(rec) {
      store.update((d) => {
        d.endCard.coverMediaId = rec.id;
        d.endCard.enabled = true;
      });
      toast('Cover art set on the end card');
    },
    useWatermark(rec) {
      store.update((d) => (d.look.watermark.mediaId = rec.id));
      toast('Logo set as watermark');
    },
  };

  async function importFiles(files) {
    let added = 0;
    for (const f of files) {
      try {
        const rec = await addMedia(f, f.name);
        added += 1;
        // first useful default for each kind
        const p = store.get();
        if (rec.kind === 'audio' && !p.song) actions.useSong(rec);
        else if (rec.kind === 'video' || (rec.kind === 'image' && p.clips.length === 0 && !/cover|art/i.test(f.name))) actions.addClip(rec);
        else if (rec.kind === 'image' && /cover|art/i.test(f.name)) actions.useCover(rec);
        else if (rec.kind === 'font') toast(`Font “${rec.family}” is ready in every font menu`);
      } catch (e) {
        toast(e.message, 'error', 5000);
      }
    }
    if (added) ui.refreshPanels(true);
  }

  // -------------------------------------------------------------- tabs

  const tabs = [
    { id: 'media', label: 'Media', icon: 'film', build: buildMedia },
    { id: 'stock', label: 'Stock', icon: 'search', build: buildStock },
    { id: 'lyrics', label: 'Lyrics', icon: 'mic', build: buildLyrics },
    { id: 'audio', label: 'Audio', icon: 'music', build: buildAudio },
    { id: 'text', label: 'Text', icon: 'type', build: buildText },
    { id: 'endcard', label: 'End card', icon: 'disc', build: buildEndCard },
    { id: 'style', label: 'Style', icon: 'palette', build: buildStyle },
    { id: 'export', label: 'Export', icon: 'download', build: buildExport },
  ];

  // ---------------------------------------------------------------- MEDIA
  function buildMedia(b) {
    const drop = h(
      'div',
      { class: 'dropzone', tabindex: '0', role: 'button', 'aria-label': 'Upload files' },
      icon('upload', 28),
      h('strong', {}, 'Drop files here or click to upload'),
      h('span', { class: 'muted' }, 'Video, images, your song (MP3/WAV), cover art, logo or a font. Files stay on your computer.'),
    );
    const open = async () => importFiles(await pickFiles('video/*,image/*,audio/*,.ttf,.otf,.woff,.woff2'));
    drop.addEventListener('click', open);
    drop.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open()));

    const items = media.all();
    const grid = h('div', { class: 'media-grid' });
    if (!items.length) grid.append(h('p', { class: 'muted small' }, 'Nothing here yet.'));
    for (const rec of items) {
      const acts = [];
      if (rec.kind === 'video' || rec.kind === 'image') acts.push(button('Add to video', () => actions.addClip(rec), { iconName: 'plus', variant: 'sm' }));
      if (rec.kind === 'audio' || rec.kind === 'video') acts.push(button('Use as song', () => actions.useSong(rec), { iconName: 'music', variant: 'sm' }));
      if (rec.kind === 'audio') acts.push(button('Add audio track', () => actions.addAudioTrack(rec), { iconName: 'plus', variant: 'sm' }));
      if (rec.kind === 'image') {
        acts.push(button('Cover art', () => actions.useCover(rec), { iconName: 'disc', variant: 'sm' }));
        acts.push(button('Watermark', () => actions.useWatermark(rec), { iconName: 'image', variant: 'sm' }));
      }
      grid.append(
        h(
          'div',
          { class: 'media-item' },
          h(
            'div',
            { class: `thumb kind-${rec.kind}` },
            rec.thumb ? h('img', { src: rec.thumb, alt: '' }) : icon(rec.kind === 'audio' ? 'music' : rec.kind === 'font' ? 'type' : 'file', 26),
            h('span', { class: 'badge' }, rec.kind === 'font' ? 'font' : isFinite(rec.duration) && rec.duration ? formatTime(rec.duration, false) : rec.kind),
          ),
          h('div', { class: 'media-name', title: rec.name }, rec.name),
          rec.attribution ? h('div', { class: 'muted tiny' }, `${PROVIDERS[rec.attribution.provider]?.label || ''} · ${rec.attribution.author}`) : null,
          h('div', { class: 'media-acts' }, acts, iconButton('trash', `Remove ${rec.name}`, () => confirmRemove(rec), 'ghost danger')),
        ),
      );
    }

    // beat-synced auto edit
    const visual = items.filter((m) => m.kind === 'video' || m.kind === 'image');
    const picks = new Set(visual.map((m) => m.id));
    const beatsBox = h('div', { class: 'checklist' });
    visual.forEach((m) => {
      const cb = h('input', { type: 'checkbox', checked: true });
      cb.addEventListener('change', () => (cb.checked ? picks.add(m.id) : picks.delete(m.id)));
      beatsBox.append(h('label', { class: 'toggle' }, cb, h('span', {}, m.name)));
    });
    const per = h('select', {}, [1, 2, 4, 8].map((n) => h('option', { value: n, selected: n === 4 }, `every ${n} beat${n > 1 ? 's' : ''}`)));
    const autoEdit = () => {
      const p = store.get();
      if (!p.song) return toast('Choose a song first (Audio tab).', 'error');
      if (!p.beats) return toast('Detect the tempo first (Audio tab → Detect BPM).', 'error');
      const ids = visual.filter((m) => picks.has(m.id)).map((m) => m.id);
      if (!ids.length) return toast('Pick at least one clip or image.', 'error');
      const contentEnd = p.duration - (p.endCard.enabled ? p.endCard.duration : 0);
      const beats = p.beats.beats.map((x) => songToTimeline(x, p.song)).filter((x) => x > 0);
      const plan = beatCutPlan(ids, beats, parseInt(per.value, 10), p.duration);
      const offsets = new Map();
      store.update((d) => {
        d.clips = plan.map((step) => {
          const rec = media.get(step.mediaId);
          const used = offsets.get(step.mediaId) || 0;
          const room = rec.kind === 'video' ? rec.duration - step.duration : Infinity;
          const start = rec.kind === 'video' ? (used <= room ? used : 0) : 0;
          offsets.set(step.mediaId, start + step.duration);
          return {
            id: uid('clip'),
            mediaId: rec.id,
            kind: rec.kind,
            in: +Math.max(0, start).toFixed(3),
            duration: rec.kind === 'video' ? Math.min(step.duration, rec.duration) : step.duration,
            speed: 1,
            fit: 'cover',
            zoom: 1,
            panX: 0,
            panY: 0,
            rotate: 0,
            flip: false,
            volume: 0,
            filter: { preset: 'none', adjust: {} },
            transition: { type: 'none', duration: 0.3 },
            kenBurns: rec.kind === 'image' ? { fromZoom: 1.05, toZoom: 1.18, fromX: 0, toX: 0, fromY: 0, toY: 0 } : null,
          };
        });
      });
      toast(`Built ${plan.length} beat-synced cuts at ${p.beats.bpm} BPM${contentEnd < p.duration ? ' (the end card still covers the last seconds)' : ''}`);
    };

    return h(
      'div',
      {},
      section('Upload', drop),
      section('Library', grid),
      visual.length
        ? section(
            'Auto-edit to the beat',
            h('p', { class: 'muted small' }, 'Replaces the video track with cuts that land on the beat of your song, cycling through the media you pick.'),
            beatsBox,
            field('Cut', per),
            button('Build beat-synced edit', autoEdit, { iconName: 'wand', variant: 'primary' }),
          )
        : null,
    );
  }

  function confirmRemove(rec) {
    const p = store.get();
    const used = p.clips.some((c) => c.mediaId === rec.id) || (p.song && p.song.mediaId === rec.id) || p.audioTracks.some((a) => a.mediaId === rec.id) || p.endCard.coverMediaId === rec.id || p.look.watermark.mediaId === rec.id;
    if (used && !confirm(`“${rec.name}” is used in this project. Remove it and everything that uses it?`)) return;
    store.update((d) => {
      d.clips = d.clips.filter((c) => c.mediaId !== rec.id);
      d.audioTracks = d.audioTracks.filter((a) => a.mediaId !== rec.id);
      if (d.song && d.song.mediaId === rec.id) d.song = null;
      if (d.endCard.coverMediaId === rec.id) d.endCard.coverMediaId = null;
      if (d.look.watermark.mediaId === rec.id) d.look.watermark.mediaId = null;
    });
    removeMedia(rec.id);
    ui.refreshPanels(true);
  }

  // ---------------------------------------------------------------- STOCK
  const stockState = { provider: settings.stockProvider || 'pexels', query: '', page: 1, results: [], loading: false, error: '' };
  function buildStock() {
    const prov = PROVIDERS[stockState.provider];
    const keyName = `${stockState.provider}Key`;
    const providerSel = h('select', {}, Object.entries(PROVIDERS).map(([id, p]) => h('option', { value: id, selected: id === stockState.provider }, p.label)));
    providerSel.addEventListener('change', () => {
      stockState.provider = providerSel.value;
      stockState.results = [];
      stockState.error = '';
      settings.stockProvider = providerSel.value;
      saveSettings(settings);
      ui.refreshPanels(true);
    });

    const keyInput = h('input', { type: 'password', placeholder: 'Paste your free API key', value: settings[keyName] || '', autocomplete: 'off' });
    keyInput.addEventListener('change', () => {
      settings[keyName] = keyInput.value.trim();
      saveSettings(settings);
      toast(`${prov.label} key saved in this browser only`);
    });

    const q = h('input', { type: 'search', placeholder: 'e.g. city night, crowd, rain, neon', value: stockState.query });
    const run = async (page = 1) => {
      stockState.query = q.value;
      stockState.page = page;
      if (prov.needsKey && !settings[keyName]) {
        stockState.error = `Add your free ${prov.label} API key above first.`;
        return ui.refreshPanels(true);
      }
      stockState.loading = true;
      stockState.error = '';
      ui.refreshPanels(true);
      try {
        const res = await searchStock(stockState.provider, q.value, { key: settings[keyName], aspect: store.get().aspect, page });
        stockState.results = page === 1 ? res : [...stockState.results, ...res];
        if (!res.length && page === 1) stockState.error = 'No results. Try a different search.';
      } catch (e) {
        stockState.error = e.message || 'Search failed';
      }
      stockState.loading = false;
      ui.refreshPanels(true);
    };
    const form = h('form', { class: 'search-row', onsubmit: (e) => (e.preventDefault(), run(1)) }, q, button('Search', null, { iconName: 'search', variant: 'primary' }));
    form.querySelector('button').type = 'submit';

    const grid = h('div', { class: 'stock-grid' });
    for (const item of stockState.results) {
      const card = h(
        'div',
        { class: 'stock-item' },
        h('img', { src: item.thumb, alt: item.title || `${prov.label} video by ${item.author}`, loading: 'lazy' }),
        h('span', { class: 'badge' }, item.duration ? `${Math.round(item.duration)}s` : ''),
      );
      if (item.preview) {
        let vid = null;
        card.addEventListener('mouseenter', () => {
          vid = h('video', { src: item.preview, muted: true, autoplay: true, loop: true, playsInline: true, class: 'hover-preview' });
          card.append(vid);
        });
        card.addEventListener('mouseleave', () => vid && (vid.remove(), (vid = null)));
      }
      const addBtn = button('Add', async () => {
        addBtn.disabled = true;
        const label = addBtn.querySelector('span');
        try {
          const blob = await downloadStock(item, (f) => (label.textContent = `${Math.round(f * 100)}%`));
          const name = `${prov.label} ${item.id.split('-')[1]}${blob.type.includes('webm') ? '.webm' : '.mp4'}`;
          const rec = await addMedia(blob, name, { source: item.provider, attribution: { provider: item.provider, author: item.author, pageUrl: item.pageUrl, license: item.license } });
          actions.addClip(rec);
          label.textContent = 'Added';
        } catch (e) {
          toast(`${e.message}. You can download it from the provider page and upload it instead.`, 'error', 6000);
          label.textContent = 'Add';
          addBtn.disabled = false;
        }
      }, { iconName: 'plus', variant: 'sm primary' });
      card.append(
        h(
          'div',
          { class: 'stock-meta' },
          h('a', { href: item.pageUrl, target: '_blank', rel: 'noopener noreferrer', class: 'tiny' }, item.author),
          addBtn,
        ),
      );
      grid.append(card);
    }

    return h(
      'div',
      {},
      section(
        'Free stock video',
        field('Source', providerSel),
        prov.needsKey
          ? field(
              `${prov.label} API key`,
              keyInput,
              h('span', {}, 'Free. Get one at ', h('a', { href: prov.keyUrl, target: '_blank', rel: 'noopener noreferrer' }, prov.keyUrl.replace('https://', '')), '. Stored only in this browser.'),
            )
          : h('p', { class: 'muted small' }, 'No key needed. Smaller library, and many files require crediting the author.'),
        form,
        h('p', { class: 'muted tiny' }, `Searching for ${ASPECTS[store.get().aspect].label.split(' · ')[0]} footage. Hover a result to preview it.`),
      ),
      stockState.loading ? h('p', { class: 'muted' }, 'Searching…') : null,
      stockState.error ? h('p', { class: 'error-text' }, stockState.error) : null,
      grid,
      stockState.results.length ? button('Load more', () => run(stockState.page + 1), { variant: 'ghost wide' }) : null,
      h(
        'p',
        { class: 'muted tiny' },
        `Videos provided by `,
        h('a', { href: stockState.provider === 'wikimedia' ? 'https://commons.wikimedia.org' : stockState.provider === 'pexels' ? 'https://www.pexels.com' : 'https://pixabay.com', target: '_blank', rel: 'noopener noreferrer' }, prov.label),
        '. ',
        h('a', { href: prov.licenseUrl, target: '_blank', rel: 'noopener noreferrer' }, prov.license),
        '. Credits are collected for you in the Export tab.',
      ),
    );
  }

  // ---------------------------------------------------------------- LYRICS
  function buildLyrics(b) {
    const p = store.get();
    const paste = h('textarea', { rows: 6, placeholder: 'Paste your lyrics here, one line per row…\n\nBlank lines are skipped.' });
    paste.value = p.lyrics.map((l) => l.text).join('\n');
    const applyText = () => {
      const lines = paste.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      store.update((d) => {
        const old = sortLyrics(d.lyrics);
        // keep existing timing for lines that are still at the same position
        const start = timelineToSong(0, d.song) + 0.5;
        const fresh = linesFromText(lines.join('\n'), start, 2.5);
        d.lyrics = fresh.map((l, i) => (old[i] ? { ...old[i], text: l.text } : l));
      });
      sync.cursor = 0;
      toast(`${lines.length} lines ready. Next: tap along to sync them.`);
      ui.refreshPanels(true);
    };

    const syncBox = h('div', { class: `sync-box${sync.active ? ' live' : ''}` });
    const sorted = sortLyrics(p.lyrics);
    if (sync.active) {
      const cur = sorted[sync.cursor - 1];
      const next = sorted[sync.cursor];
      syncBox.append(
        h('div', { class: 'sync-now' }, cur ? cur.text : 'Get ready…'),
        h('div', { class: 'sync-next muted' }, next ? `Next: ${next.text}` : 'That was the last line. Press Stop.'),
        h('div', { class: 'sync-btns' }, button('Tap: next line starts', () => doTap(), { variant: 'primary big', iconName: 'hand' }), button('End line', () => doEnd(), { variant: 'big' })),
        h('p', { class: 'muted tiny' }, 'Keys: Space or Enter = next line starts · ↓ or . = end the current line (for a gap) · Esc = stop'),
        button('Stop syncing', () => stopSync(), { iconName: 'x', variant: 'ghost' }),
      );
    } else {
      syncBox.append(
        h('p', { class: 'small' }, 'Press Start, then tap Space each time a new line begins. The song plays from the playhead, so move it a few seconds before the first line.'),
        h(
          'div',
          { class: 'sync-btns' },
          button('Start tap-sync', () => startSync(0), { iconName: 'hand', variant: 'primary', disabled: !p.lyrics.length }),
          button('Resume from selected line', () => startSync(), { variant: 'ghost', disabled: !(ui.selection && ui.selection.type === 'lyric') }),
        ),
      );
    }

    const list = h('div', { class: 'lyric-list' });
    sorted.forEach((l, i) => {
      const startIn = h('input', { class: 'num time', value: formatTime(l.start), 'aria-label': `Start of line ${i + 1}` });
      const endIn = h('input', { class: 'num time', value: formatTime(l.end), 'aria-label': `End of line ${i + 1}` });
      const textIn = h('input', { class: 'lyric-text', value: l.text, 'aria-label': `Line ${i + 1}` });
      const commit = (field, input) => () => {
        const v = parseTime(input.value);
        if (isNaN(v)) return (input.value = formatTime(l[field]));
        store.update((d) => {
          const x = d.lyrics.find((y) => y.id === l.id);
          x[field] = Math.max(0, v);
          if (x.end <= x.start) x.end = x.start + 0.3;
        });
      };
      startIn.addEventListener('change', commit('start', startIn));
      endIn.addEventListener('change', commit('end', endIn));
      textIn.addEventListener('input', () => store.update((d) => (d.lyrics.find((y) => y.id === l.id).text = textIn.value), `lyrictext:${l.id}`));
      const row = h(
        'div',
        { class: `lyric-row${ui.selection && ui.selection.id === l.id ? ' selected' : ''}`, dataset: { id: l.id } },
        h('button', { class: 'lyric-num', type: 'button', title: 'Jump to this line', onclick: () => (engine.seek(Math.max(0, songToTimeline(l.start, store.get().song))), ui.select({ type: 'lyric', id: l.id })) }, String(i + 1)),
        textIn,
        startIn,
        endIn,
        iconButton('trash', `Delete line ${i + 1}`, () => store.update((d) => (d.lyrics = d.lyrics.filter((y) => y.id !== l.id))), 'ghost'),
      );
      list.append(row);
    });

    const shiftBy = (delta) => store.update((d) => (d.lyrics = shiftLyrics(d.lyrics, delta)), 'shift');

    const s = (fn) => (d, v) => fn(d.lyricStyle, v);
    const presetRow = h(
      'div',
      { class: 'chips' },
      Object.entries(LYRIC_PRESETS).map(([name, preset]) => button(name, () => store.update((d) => (d.lyricStyle = { ...defaultLyricStyle(), y: d.lyricStyle.y, ...preset })), { variant: 'chip' })),
    );

    return h(
      'div',
      {},
      section(
        '1 · Lyrics',
        paste,
        h('div', { class: 'row' }, button('Use these lyrics', applyText, { variant: 'primary', iconName: 'check' }), button('Import .lrc', importLRC, { iconName: 'upload', variant: 'ghost' }), button('Export .lrc', exportLRC, { iconName: 'download', variant: 'ghost', disabled: !p.lyrics.length })),
      ),
      section('2 · Sync to the song', syncBox),
      p.lyrics.length
        ? section(
            '3 · Fine-tune timing',
            h('p', { class: 'muted tiny' }, 'Drag lyric blocks on the timeline, or edit times here (m:ss.cc). Times follow the song, so changing the song section keeps them in sync.'),
            h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Shift all'), button('−0.5s', () => shiftBy(-0.5), { variant: 'sm' }), button('−0.1s', () => shiftBy(-0.1), { variant: 'sm' }), button('+0.1s', () => shiftBy(0.1), { variant: 'sm' }), button('+0.5s', () => shiftBy(0.5), { variant: 'sm' })),
            h('div', { class: 'lyric-head muted tiny' }, h('span', {}, '#'), h('span', {}, 'Line'), h('span', {}, 'Start'), h('span', {}, 'End'), h('span', {})),
            list,
          )
        : null,
      section(
        'Lyric style',
        presetRow,
        b.select('Font', (p) => p.lyricStyle.font, s((o, v) => (o.font = v)), fontOptions()),
        b.select('Animation', (p) => p.lyricStyle.animation, s((o, v) => (o.animation = v)), ANIMATIONS),
        b.range('Size', (p) => p.lyricStyle.size, s((o, v) => (o.size = v)), { min: 2.5, max: 14, step: 0.1, fmt: (v) => v.toFixed(1) }),
        b.range('Vertical position', (p) => p.lyricStyle.y, s((o, v) => (o.y = v)), { min: 5, max: 95, step: 1, fmt: (v) => `${v}%` }),
        b.range('Max width', (p) => p.lyricStyle.maxWidth, s((o, v) => (o.maxWidth = v)), { min: 40, max: 98, step: 1, fmt: (v) => `${v}%` }),
        b.segmented('Align', (p) => p.lyricStyle.align, s((o, v) => (o.align = v)), [['left', 'Left'], ['center', 'Center'], ['right', 'Right']]),
        h('div', { class: 'grid2' }, b.color('Text', (p) => p.lyricStyle.color, s((o, v) => (o.color = v))), b.color('Highlight', (p) => p.lyricStyle.highlight, s((o, v) => (o.highlight = v)))),
        h('div', { class: 'grid2' }, b.color('Outline', (p) => p.lyricStyle.outline, s((o, v) => (o.outline = v))), b.range('Outline width', (p) => p.lyricStyle.outlineWidth, s((o, v) => (o.outlineWidth = v)), { min: 0, max: 2, step: 0.05, fmt: (v) => v.toFixed(2) })),
        b.toggle('Drop shadow', (p) => p.lyricStyle.shadow, s((o, v) => (o.shadow = v))),
        b.toggle('ALL CAPS', (p) => p.lyricStyle.uppercase, s((o, v) => (o.uppercase = v))),
        b.toggle('Background box', (p) => p.lyricStyle.box, s((o, v) => (o.box = v))),
        h('div', { class: 'grid2' }, b.color('Box color', (p) => p.lyricStyle.boxColor, s((o, v) => (o.boxColor = v))), b.range('Box opacity', (p) => p.lyricStyle.boxOpacity, s((o, v) => (o.boxOpacity = v)), { min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` })),
      ),
    );
  }

  async function importLRC() {
    const [f] = await pickFiles('.lrc,.txt', false);
    if (!f) return;
    const text = await f.text();
    const parsed = parseLRC(text);
    if (!parsed.length) {
      store.update((d) => (d.lyrics = linesFromText(text, timelineToSong(0, d.song) + 0.5)));
      toast('No timestamps found, so the lines were imported untimed. Tap-sync them next.');
    } else {
      store.update((d) => (d.lyrics = parsed));
      toast(`Imported ${parsed.length} timed lines`);
    }
    ui.refreshPanels(true);
  }
  function exportLRC() {
    const p = store.get();
    download(new Blob([toLRC(p.lyrics, { title: p.endCard.title, artist: p.endCard.artist })], { type: 'text/plain' }), `${slug(p.name)}.lrc`);
  }

  function startSync(fromIndex) {
    const p = store.get();
    const sorted = sortLyrics(p.lyrics);
    let idx = fromIndex;
    if (idx == null) {
      idx = Math.max(0, sorted.findIndex((l) => ui.selection && l.id === ui.selection.id));
      engine.seek(Math.max(0, songToTimeline(sorted[idx].start, p.song) - 2));
    }
    store.update((d) => (d.lyrics = sortLyrics(d.lyrics)));
    sync.active = true;
    sync.cursor = idx;
    ui.syncing = true;
    engine.play();
    ui.refreshPanels(true);
  }
  function stopSync() {
    sync.active = false;
    ui.syncing = false;
    engine.pause();
    store.update((d) => d.lyrics.forEach((l) => delete l.open));
    toast('Synced. Drag blocks on the timeline to fine-tune.');
    ui.refreshPanels(true);
  }
  function doTap() {
    if (!sync.active) return;
    const ts = timelineToSong(engine.t, store.get().song);
    store.update((d) => {
      const r = tapStart(sortLyrics(d.lyrics), sync.cursor, +ts.toFixed(3));
      d.lyrics = r.lyrics;
      sync.cursor = r.cursor;
    });
    ui.refreshPanels(true);
  }
  function doEnd() {
    if (!sync.active) return;
    const ts = timelineToSong(engine.t, store.get().song);
    store.update((d) => {
      d.lyrics = tapEnd(sortLyrics(d.lyrics), sync.cursor, +ts.toFixed(3)).lyrics;
    });
  }

  // ---------------------------------------------------------------- AUDIO
  function buildAudio(b) {
    const p = store.get();
    const audioMedia = media.all().filter((m) => m.kind === 'audio' || m.kind === 'video');
    const songSel = h('select', {}, h('option', { value: '' }, '— choose your song —'), audioMedia.map((m) => h('option', { value: m.id, selected: p.song && p.song.mediaId === m.id }, m.name)));
    songSel.addEventListener('change', () => {
      const rec = media.get(songSel.value);
      if (rec) actions.useSong(rec);
      else store.update((d) => (d.song = null));
      ui.refreshPanels(true);
    });
    const rec = p.song && media.get(p.song.mediaId);

    let songBlock = null;
    if (rec) {
      // full-song overview with the selected window
      const ov = h('canvas', { class: 'overview', width: 600, height: 70, 'aria-label': 'Whole song waveform. Click or drag to choose the section used in the video.' });
      const drawOv = () => {
        const g = ov.getContext('2d');
        const pr = store.get();
        const W = ov.width;
        const H = ov.height;
        g.clearRect(0, 0, W, H);
        const dur = rec.duration || 1;
        if (rec.peaks) {
          const bins = rec.peaks.length / 2;
          g.fillStyle = 'rgba(160,170,190,.55)';
          for (let x = 0; x < W; x++) {
            const b0 = Math.floor((x / W) * bins);
            const b1 = Math.max(b0 + 1, Math.floor(((x + 1) / W) * bins));
            let lo = 0;
            let hi = 0;
            for (let i = b0; i < b1; i++) {
              lo = Math.min(lo, rec.peaks[i * 2]);
              hi = Math.max(hi, rec.peaks[i * 2 + 1]);
            }
            g.fillRect(x, H / 2 - hi * H * 0.48, 1, Math.max(1, (hi - lo) * H * 0.48));
          }
        }
        const x0 = (pr.song.offset / dur) * W;
        const x1 = (Math.min(dur, pr.song.offset + pr.duration) / dur) * W;
        g.fillStyle = 'rgba(110,231,160,.22)';
        g.fillRect(x0, 0, x1 - x0, H);
        g.strokeStyle = 'rgba(110,231,160,.95)';
        g.lineWidth = 2;
        g.strokeRect(x0 + 1, 1, x1 - x0 - 2, H - 2);
      };
      ov._draw = drawOv;
      let dragging = false;
      const setFrom = (e) => {
        const r = ov.getBoundingClientRect();
        const dur = rec.duration || 1;
        const t = ((e.clientX - r.left) / r.width) * dur - store.get().duration / 2;
        store.update((d) => (d.song.offset = +clamp(t, 0, Math.max(0, dur - 1)).toFixed(2)), 'songoffset');
      };
      ov.addEventListener('pointerdown', (e) => ((dragging = true), ov.setPointerCapture(e.pointerId), setFrom(e)));
      ov.addEventListener('pointermove', (e) => dragging && setFrom(e));
      ov.addEventListener('pointerup', () => (dragging = false));
      b._reg(() => drawOv());

      const hook = (len) => {
        const r2 = media.get(store.get().song.mediaId);
        if (!r2.envelope) return toast('Could not analyse this file.', 'error');
        const ec = store.get().endCard;
        const total = len + (ec.enabled ? ec.duration : 0);
        const start = findHook(r2.envelope, r2.envRate, len, r2.duration);
        store.update((d) => {
          d.song.offset = start;
          d.duration = total;
        });
        engine.seek(0);
        toast(`Picked ${formatTime(start, false)}–${formatTime(start + len, false)}, the loudest ${len}s of the song`);
      };
      const bpm = () => {
        const r2 = media.get(store.get().song.mediaId);
        if (!r2.envelope) return toast('Could not analyse this file.', 'error');
        const res = detectBeats(r2.envelope, r2.envRate);
        if (!res) return toast('Could not find a steady beat.', 'error');
        store.update((d) => (d.beats = res));
        toast(`About ${res.bpm} BPM. Beat markers are on the timeline ruler and items snap to them.`);
        ui.refreshPanels(true);
      };
      const g = (fn) => (d, v) => fn(d.song, v);
      songBlock = h(
        'div',
        {},
        ov,
        h('div', { class: 'muted tiny' }, b._label = h('span', {})),
        h('p', { class: 'small' }, 'Find the hook: picks the loudest section (usually the chorus) and sets the video length.'),
        h('div', { class: 'row' }, [15, 30, 45, 60].map((n) => button(`${n}s`, () => hook(n), { variant: 'chip', iconName: n === 15 ? 'wand' : null }))),
        b.number('Song starts at (s)', (pp) => pp.song && pp.song.offset, g((o, v) => (o.offset = v)), { min: 0, step: 0.1 }),
        b.range('Volume', (pp) => pp.song && pp.song.volume, g((o, v) => (o.volume = v)), { min: 0, max: 1.5, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` }),
        h('div', { class: 'grid2' }, b.number('Fade in (s)', (pp) => pp.song && pp.song.fadeIn, g((o, v) => (o.fadeIn = v)), { min: 0, max: 10, step: 0.1 }), b.number('Fade out (s)', (pp) => pp.song && pp.song.fadeOut, g((o, v) => (o.fadeOut = v)), { min: 0, max: 10, step: 0.1 })),
        h('div', { class: 'row' }, button(p.beats ? `Tempo: ${p.beats.bpm} BPM · redetect` : 'Detect BPM', bpm, { iconName: 'activity', variant: 'ghost' }), p.beats ? button('Clear beats', () => store.update((d) => (d.beats = null)), { variant: 'ghost sm' }) : null),
      );
      b._reg((pp) => {
        if (pp.song) b._label.textContent = `Using ${formatTime(pp.song.offset)} – ${formatTime(Math.min(rec.duration, pp.song.offset + pp.duration))} of ${formatTime(rec.duration)}`;
      });
    }

    const tracks = h('div', { class: 'list' });
    p.audioTracks.forEach((a, i) => {
      const r = media.get(a.mediaId);
      tracks.append(
        h(
          'div',
          { class: 'list-row' },
          h('button', { type: 'button', class: 'link', onclick: () => ui.select({ type: 'audio', id: a.id }) }, `Audio ${i + 1}: ${r ? r.name : 'missing'}`),
          h('span', { class: 'muted tiny' }, `${formatTime(a.start)} · ${a.duration.toFixed(1)}s`),
        ),
      );
    });
    const addAudio = async () => {
      const files = await pickFiles('audio/*', true);
      for (const f of files) {
        try {
          const r = await addMedia(f, f.name);
          actions.addAudioTrack(r);
        } catch (e) {
          toast(e.message, 'error');
        }
      }
      ui.refreshPanels(true);
    };
    return h(
      'div',
      {},
      section('Song', field('Track', songSel), audioMedia.length ? null : h('p', { class: 'muted small' }, 'Upload your song (MP3, WAV, M4A) in the Media tab or below.'), audioMedia.length ? null : button('Upload song', async () => importFiles(await pickFiles('audio/*', false)), { iconName: 'upload', variant: 'primary' }), songBlock),
      section('Extra audio', h('p', { class: 'muted small' }, 'Voice-over, a riser or sound effects. Each gets its own track; it starts at the playhead.'), tracks, button('Add audio file', addAudio, { iconName: 'plus' })),
      section('Video clip sound', h('p', { class: 'muted small' }, 'Clips are muted by default so your song is clean. Select a clip on the timeline to turn its own sound up.')),
    );
  }

  // ---------------------------------------------------------------- TEXT
  function buildText() {
    const p = store.get();
    const presets = ['NEW SINGLE', 'OUT NOW', 'OUT FRIDAY', 'PRE-SAVE NOW', 'LINK IN BIO', 'TURN THE SOUND ON 🔊'];
    const add = (text) => {
      const tx = { ...newText(+engine.t.toFixed(2)), text };
      store.update((d) => d.texts.push(tx));
      ui.select({ type: 'text', id: tx.id });
    };
    const list = h('div', { class: 'list' });
    for (const tx of p.texts) {
      list.append(
        h(
          'div',
          { class: 'list-row' },
          h('button', { type: 'button', class: 'link', onclick: () => (ui.select({ type: 'text', id: tx.id }), engine.seek(tx.start)) }, tx.text || '(empty)'),
          h('span', { class: 'muted tiny' }, `${formatTime(tx.start)}–${formatTime(tx.end)}`),
        ),
      );
    }
    return h(
      'div',
      {},
      section('Add text', h('p', { class: 'muted small' }, 'Titles and hooks that sit on top of the video. They start at the playhead; drag them on the Text track.'), h('div', { class: 'chips' }, presets.map((t) => button(t, () => add(t), { variant: 'chip' }))), button('Blank text', () => add('Your text'), { iconName: 'plus', variant: 'primary' })),
      p.texts.length ? section('On this video', list) : null,
    );
  }

  // ---------------------------------------------------------------- END CARD
  function buildEndCard(b) {
    const e = (fn) => (d, v) => fn(d.endCard, v);
    const images = media.all().filter((m) => m.kind === 'image');
    const coverSel = h('select', {}, h('option', { value: '' }, '— no cover —'), images.map((m) => h('option', { value: m.id }, m.name)));
    coverSel.addEventListener('change', () => store.update((d) => (d.endCard.coverMediaId = coverSel.value || null)));
    b._reg((p) => (coverSel.value = p.endCard.coverMediaId || ''));
    const plats = h(
      'div',
      { class: 'checklist cols' },
      PLATFORMS.map((pl) => {
        const cb = h('input', { type: 'checkbox' });
        cb.addEventListener('change', () =>
          store.update((d) => {
            const set = new Set(d.endCard.platforms);
            cb.checked ? set.add(pl.id) : set.delete(pl.id);
            d.endCard.platforms = PLATFORMS.map((x) => x.id).filter((id) => set.has(id));
          }),
        );
        b._reg((p) => (cb.checked = p.endCard.platforms.includes(pl.id)));
        return h('label', { class: 'toggle' }, cb, h('span', {}, pl.label));
      }),
    );
    const ctaPresets = ['OUT NOW', 'NEW SINGLE', 'PRE-SAVE NOW', 'OUT {date}', '{countdown}', 'STREAM IT NOW'];
    return h(
      'div',
      {},
      section(
        'Call-to-action end card',
        b.toggle('Show end card', (p) => p.endCard.enabled, e((o, v) => (o.enabled = v))),
        b.range('Length', (p) => p.endCard.duration, e((o, v) => (o.duration = v)), { min: 1, max: 10, step: 0.1, fmt: (v) => `${v.toFixed(1)}s` }),
        field('Cover art', coverSel, images.length ? null : 'Upload your cover image in the Media tab.'),
        images.length ? null : button('Upload cover art', async () => {
          const [f] = await pickFiles('image/*', false);
          if (!f) return;
          try {
            actions.useCover(await addMedia(f, f.name));
            ui.refreshPanels(true);
          } catch (err) {
            toast(err.message, 'error');
          }
        }, { iconName: 'upload' }),
        b.text('Song title', (p) => p.endCard.title, e((o, v) => (o.title = v))),
        b.text('Artist', (p) => p.endCard.artist, e((o, v) => (o.artist = v))),
        b.text('Call to action', (p) => p.endCard.cta, e((o, v) => (o.cta = v))),
        h('div', { class: 'chips' }, ctaPresets.map((c) => button(c, () => store.update((d) => (d.endCard.cta = c)), { variant: 'chip' }))),
        b.text('Release date', (p) => p.endCard.releaseDate, e((o, v) => (o.releaseDate = v)), { placeholder: 'YYYY-MM-DD' }),
        h('p', { class: 'muted tiny' }, '{date} becomes e.g. “NOV 21”. {countdown} becomes “OUT IN 3 DAYS”, “OUT TOMORROW” or “OUT NOW”, worked out on the day you export.'),
        b.text('Small text', (p) => p.endCard.subtext, e((o, v) => (o.subtext = v)), { placeholder: 'Link in bio · @yourband' }),
        field('Streaming platforms', plats),
      ),
      section(
        'End card look',
        b.segmented('Background', (p) => p.endCard.background, e((o, v) => (o.background = v)), [['blur', 'Blurred cover'], ['color', 'Color'], ['video', 'Dimmed video']]),
        h('div', { class: 'grid3' }, b.color('Background', (p) => p.endCard.bgColor, e((o, v) => (o.bgColor = v))), b.color('Accent', (p) => p.endCard.accent, e((o, v) => (o.accent = v))), b.color('Text', (p) => p.endCard.textColor, e((o, v) => (o.textColor = v)))),
        b.select('Title font', (p) => p.endCard.font, e((o, v) => (o.font = v)), fontOptions()),
        b.select('Entrance', (p) => p.endCard.animation, e((o, v) => (o.animation = v)), END_ANIMATIONS),
        button('Preview end card', () => {
          const p = store.get();
          engine.seek(Math.max(0, p.duration - p.endCard.duration));
          engine.play();
        }, { iconName: 'play', variant: 'ghost' }),
      ),
    );
  }

  // ---------------------------------------------------------------- STYLE
  function buildStyle(b) {
    const l = (fn) => (d, v) => fn(d.look, v);
    const images = media.all().filter((m) => m.kind === 'image');
    const wmSel = h('select', {}, h('option', { value: '' }, '— none —'), images.map((m) => h('option', { value: m.id }, m.name)));
    wmSel.addEventListener('change', () => store.update((d) => (d.look.watermark.mediaId = wmSel.value || null)));
    b._reg((p) => (wmSel.value = p.look.watermark.mediaId || ''));

    const templates = loadTemplates();
    const tplList = h('div', { class: 'list' });
    templates.forEach((t, i) =>
      tplList.append(
        h(
          'div',
          { class: 'list-row' },
          h('button', { type: 'button', class: 'link', onclick: () => applyTemplate(t) }, t.name),
          iconButton('trash', `Delete template ${t.name}`, () => {
            templates.splice(i, 1);
            saveTemplates(templates);
            ui.refreshPanels(true);
          }, 'ghost'),
        ),
      ),
    );
    const applyTemplate = (t) => {
      store.update((d) => {
        d.lyricStyle = { ...d.lyricStyle, ...t.lyricStyle };
        d.endCard = { ...d.endCard, ...t.endCard, coverMediaId: d.endCard.coverMediaId, title: d.endCard.title, releaseDate: d.endCard.releaseDate };
        d.look = { ...d.look, ...t.look, watermark: { ...d.look.watermark, ...t.look.watermark, mediaId: d.look.watermark.mediaId } };
        d.background = t.background || d.background;
      });
      toast(`Applied “${t.name}”`);
    };
    const saveTpl = () => {
      const name = prompt('Template name', 'My band style');
      if (!name) return;
      const p = store.get();
      const { coverMediaId, title, releaseDate, ...endCard } = p.endCard;
      templates.push({ name, lyricStyle: p.lyricStyle, endCard, look: p.look, background: p.background });
      saveTemplates(templates);
      toast('Template saved in this browser');
      ui.refreshPanels(true);
    };

    return h(
      'div',
      {},
      section(
        'Look',
        b.color('Background (behind letterboxed clips)', (p) => p.background, (d, v) => (d.background = v)),
        b.range('Vignette', (p) => p.look.vignette, l((o, v) => (o.vignette = v)), { min: 0, max: 0.9, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` }),
        b.range('Film grain', (p) => p.look.grain, l((o, v) => (o.grain = v)), { min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` }),
        b.range('Cinema bars', (p) => p.look.letterbox, l((o, v) => (o.letterbox = v)), { min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` }),
        b.range('Light leaks', (p) => p.look.lightLeak || 0, l((o, v) => (o.lightLeak = v)), { min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` }),
        b.range('Scanlines', (p) => p.look.scanlines || 0, l((o, v) => (o.scanlines = v)), { min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` }),
        b.range('Flash on the beat', (p) => p.look.beatFlash || 0, l((o, v) => (o.beatFlash = v)), { min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` }),
        h('p', { class: 'muted tiny' }, 'Color filters, zoom and speed are per clip: select a clip on the timeline.'),
      ),
      section(
        'Logo watermark',
        field('Image', wmSel, images.length ? 'A transparent PNG of your band logo works best.' : 'Upload your logo in the Media tab.'),
        b.select('Position', (p) => p.look.watermark.position, l((o, v) => (o.watermark.position = v)), [['top-left', 'Top left'], ['top-center', 'Top center'], ['top-right', 'Top right'], ['bottom-left', 'Bottom left'], ['bottom-center', 'Bottom center'], ['bottom-right', 'Bottom right']]),
        b.range('Size', (p) => p.look.watermark.size, l((o, v) => (o.watermark.size = v)), { min: 5, max: 40, step: 1, fmt: (v) => `${v}%` }),
        b.range('Opacity', (p) => p.look.watermark.opacity, l((o, v) => (o.watermark.opacity = v)), { min: 0.1, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` }),
      ),
      section(
        'Progress bar',
        b.toggle('Show a progress bar', (p) => p.look.progress.enabled, l((o, v) => (o.progress.enabled = v))),
        h('div', { class: 'grid2' }, b.color('Color', (p) => p.look.progress.color, l((o, v) => (o.progress.color = v))), b.segmented('Position', (p) => p.look.progress.position, l((o, v) => (o.progress.position = v)), [['top', 'Top'], ['bottom', 'Bottom']])),
      ),
      section(
        'Phone app preview',
        b.segmented('Show buttons from', (p) => p.look.overlay || 'off', l((o, v) => (o.overlay = v)), PLATFORM_OVERLAYS.map(([k, label]) => [k, label.replace('Instagram ', '').replace('YouTube ', '')])),
        b.range('Ghost opacity', (p) => p.look.overlayOpacity ?? 0.6, l((o, v) => (o.overlayOpacity = v)), { min: 0.15, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` }),
        b.toggle('Show the clear area for text', (p) => p.look.overlayClear !== false, l((o, v) => (o.overlayClear = v))),
        overlaySupported(store.get().aspect)
          ? h('p', { class: 'muted tiny' }, 'Ghost buttons show where each app puts its icons, caption and nav bar, so you can keep lyrics and text clear of them. Preview only, never exported. Shortcut: O cycles the apps.')
          : h('p', { class: 'warn-list' }, 'The phone preview is for 9:16 videos. Switch Format to 9:16 to see it.'),
      ),
      section('Templates', h('p', { class: 'muted small' }, 'Save your lyric style, end-card look, watermark and effects to reuse on the next release.'), tplList, button('Save current style as template', saveTpl, { iconName: 'plus' })),
    );
  }

  // ---------------------------------------------------------------- EXPORT
  const exportState = { running: false, progress: 0, result: null, error: '' };
  function buildExport(b) {
    const p = store.get();
    const mp4 = pickMimeType('mp4');
    const fmt = h('select', {}, mp4 && mp4.startsWith('video/mp4') ? h('option', { value: 'mp4' }, 'MP4 (best for Instagram & TikTok)') : null, h('option', { value: 'webm' }, 'WebM'));
    const quality = h('select', {}, h('option', { value: 6e6 }, 'Good · 6 Mbps'), h('option', { value: 10e6, selected: true }, 'High · 10 Mbps'), h('option', { value: 16e6 }, 'Max · 16 Mbps'));
    const fps = h('select', {}, h('option', { value: 30, selected: true }, '30 fps'), h('option', { value: 60 }, '60 fps'), h('option', { value: 24 }, '24 fps (film look)'));
    const monitor = h('input', { type: 'checkbox', checked: settings.monitorExport ?? true });
    monitor.addEventListener('change', () => ((settings.monitorExport = monitor.checked), saveSettings(settings)));
    const { w, hgt } = { w: ASPECTS[p.aspect].w, hgt: ASPECTS[p.aspect].h };

    const issues = [];
    if (!p.clips.length) issues.push('No video clips yet. The video will only show text on the background color.');
    if (!p.song) issues.push('No song chosen.');
    if (p.endCard.enabled && !p.endCard.coverMediaId) issues.push('End card has no cover art.');
    const contentLen = layoutClips(p.clips).reduce((m, l) => Math.max(m, l.end), 0);
    if (p.clips.length && contentLen < p.duration - (p.endCard.enabled && p.endCard.background !== 'video' ? p.endCard.duration : 0) - 0.05) issues.push(`Clips end at ${formatTime(contentLen)}; after that the background shows until ${formatTime(p.duration)}.`);

    const start = async () => {
      exportState.running = true;
      exportState.progress = 0;
      exportState.result = null;
      exportState.error = '';
      ui.refreshPanels(true);
      try {
        const res = await exportVideo(engine, {
          format: fmt.value,
          bitrate: Number(quality.value),
          fps: Number(fps.value),
          monitor: monitor.checked,
          onProgress: (f) => {
            exportState.progress = f;
            const bar = document.querySelector('.export-progress > div');
            if (bar) bar.style.width = `${Math.round(f * 100)}%`;
            const lbl = document.querySelector('.export-pct');
            if (lbl) lbl.textContent = `${Math.round(f * 100)}%`;
          },
        });
        const ext = res.mime.includes('mp4') ? 'mp4' : 'webm';
        exportState.result = { ...res, name: `${slug(p.name)}-${p.aspect.replace(':', 'x')}.${ext}`, url: URL.createObjectURL(res.blob) };
        toast('Export finished');
      } catch (e) {
        if (e.message !== 'cancelled') exportState.error = e.message || 'Export failed';
      }
      exportState.running = false;
      ui.refreshPanels(true);
    };

    const credits = media
      .all()
      .filter((m) => m.attribution && (p.clips.some((c) => c.mediaId === m.id)))
      .map((m) => `${PROVIDERS[m.attribution.provider]?.label}: ${m.attribution.author} (${m.attribution.license}) ${m.attribution.pageUrl}`);
    const caption = [
      `${p.endCard.title} by ${p.endCard.artist}: ${p.endCard.cta ? p.endCard.cta.replace(/\{date\}|\{countdown\}/gi, '').trim().toLowerCase() || 'out now' : 'out now'} 🎶`,
      p.endCard.subtext || 'Link in bio',
      '',
      `#newmusic #${(p.endCard.artist || 'artist').replace(/[^a-z0-9]/gi, '').toLowerCase()} #${(p.endCard.title || 'song').replace(/[^a-z0-9]/gi, '').toLowerCase()} #newsingle`,
      credits.length ? `\nFootage: ${credits.join('; ')}` : '',
    ]
      .join('\n')
      .trim();
    const capBox = h('textarea', { rows: 6, readOnly: true }, caption);
    capBox.value = caption;

    return h(
      'div',
      {},
      section(
        'Export video',
        h('p', { class: 'small' }, `${w}×${hgt} · ${formatTime(p.duration)} long. The video plays through once while it records, so exporting takes about ${Math.ceil(p.duration)} seconds. Keep this tab in front.`),
        issues.length ? h('ul', { class: 'warn-list' }, issues.map((i) => h('li', {}, i))) : null,
        field('Format', fmt),
        h('div', { class: 'grid2' }, field('Quality', quality), field('Frame rate', fps)),
        h('label', { class: 'toggle' }, monitor, h('span', {}, 'Play sound while exporting')),
        exportState.running
          ? h('div', {}, h('div', { class: 'export-progress' }, h('div', { style: { width: `${Math.round(exportState.progress * 100)}%` } })), h('div', { class: 'row' }, h('span', { class: 'export-pct' }, `${Math.round(exportState.progress * 100)}%`), button('Cancel', () => exportVideo.cancel && exportVideo.cancel(), { variant: 'ghost sm' })))
          : button('Export video', start, { iconName: 'download', variant: 'primary big wide' }),
        exportState.error ? h('p', { class: 'error-text' }, exportState.error) : null,
        exportState.result
          ? h(
              'div',
              { class: 'result' },
              h('video', { src: exportState.result.url, controls: true, playsInline: true }),
              h('a', { class: 'btn primary wide', href: exportState.result.url, download: exportState.result.name }, icon('download', 16), h('span', {}, `Download ${exportState.result.name} (${(exportState.result.blob.size / 1e6).toFixed(1)} MB)`)),
              exportState.result.mime.includes('webm') ? h('p', { class: 'muted tiny' }, 'WebM uploads fine to YouTube. Instagram prefers MP4, which Chrome and Edge can export.') : null,
            )
          : null,
      ),
      section(
        'Stills',
        h('p', { class: 'muted small' }, 'Save the current frame at full resolution, e.g. for a thumbnail or story teaser.'),
        button('Save frame as PNG', async () => download(await engine.snapshot(), `${slug(p.name)}-frame-${engine.t.toFixed(1)}s.png`), { iconName: 'image' }),
      ),
      section(
        'Post caption',
        capBox,
        button('Copy caption', () => navigator.clipboard.writeText(capBox.value).then(() => toast('Caption copied')), { iconName: 'copy' }),
        credits.length ? h('p', { class: 'muted tiny' }, 'Stock footage credits are included. CC BY / BY-SA files from Wikimedia must keep them.') : null,
      ),
    );
  }

  // ---------------------------------------------------------------- INSPECTOR
  function buildInspector(b) {
    const sel = ui.selection;
    const p = store.get();
    if (!sel) return buildProjectInspector(b);
    if (sel.type === 'clip') {
      const clip = p.clips.find((c) => c.id === sel.id);
      if (!clip) return buildProjectInspector(b);
      const rec = media.get(clip.mediaId);
      const c = (fn) => (d, v) => {
        const x = d.clips.find((y) => y.id === sel.id);
        if (x) fn(x, v, d);
      };
      const isVideo = clip.kind === 'video';
      const maxDur = maxClipDuration(clip, rec ? rec.duration : Infinity);
      return h(
        'div',
        {},
        h('div', { class: 'insp-title' }, icon('film', 16), h('span', {}, rec ? rec.name : 'Clip')),
        h(
          'div',
          { class: 'row' },
          button('Split at playhead', () => ui.split(), { iconName: 'scissors', variant: 'sm' }),
          button('Duplicate', () => store.update((d) => {
            const i = d.clips.findIndex((x) => x.id === sel.id);
            d.clips.splice(i + 1, 0, { ...structuredClone(d.clips[i]), id: uid('clip') });
          }), { iconName: 'copy', variant: 'sm' }),
          iconButton('arrowLeft', 'Move earlier', () => moveClip(-1), 'ghost'),
          iconButton('arrowRight', 'Move later', () => moveClip(1), 'ghost'),
          iconButton('trash', 'Delete clip', () => ui.deleteSelection(), 'ghost danger'),
        ),
        section(
          'Timing',
          b.number('Length (s)', () => store.get().clips.find((x) => x.id === sel.id)?.duration, c((x, v) => (x.duration = Math.min(v, maxClipDuration(x, rec ? rec.duration : Infinity)))), { min: 0.2, step: 0.1 }),
          isVideo ? b.number('Starts from (s into the file)', () => store.get().clips.find((x) => x.id === sel.id)?.in, c((x, v) => (x.in = Math.min(v, Math.max(0, (rec?.duration || 0) - 0.2)))), { min: 0, step: 0.1 }) : null,
          isVideo ? b.select('Speed', () => String(store.get().clips.find((x) => x.id === sel.id)?.speed || 1), c((x, v) => {
            const sp = parseFloat(v);
            x.duration = +(x.duration * (x.speed || 1) / sp).toFixed(3);
            x.speed = sp;
            x.duration = Math.min(x.duration, maxClipDuration(x, rec ? rec.duration : Infinity));
          }), [['0.25', '0.25× (very slow)'], ['0.5', '0.5× (slow-mo)'], ['0.75', '0.75×'], ['1', '1× normal'], ['1.5', '1.5×'], ['2', '2× (fast)'], ['4', '4×']]) : null,
          h('p', { class: 'muted tiny' }, isVideo ? `Up to ${maxDur.toFixed(1)}s available at this speed. Drag clip edges on the timeline to trim.` : 'Images can be any length.'),
        ),
        section(
          'Frame',
          b.segmented('Fit', () => store.get().clips.find((x) => x.id === sel.id)?.fit, c((x, v) => (x.fit = v)), [['cover', 'Fill'], ['contain', 'Fit'], ['blurfill', 'Fit + blur']]),
          b.range('Zoom', () => store.get().clips.find((x) => x.id === sel.id)?.zoom, c((x, v) => (x.zoom = v)), { min: 0.5, max: 3, step: 0.01, fmt: (v) => `${v.toFixed(2)}×` }),
          b.range('Pan left/right', () => store.get().clips.find((x) => x.id === sel.id)?.panX, c((x, v) => (x.panX = v)), { min: -1, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) }),
          b.range('Pan up/down', () => store.get().clips.find((x) => x.id === sel.id)?.panY, c((x, v) => (x.panY = v)), { min: -1, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) }),
          b.range('Rotate', () => store.get().clips.find((x) => x.id === sel.id)?.rotate, c((x, v) => (x.rotate = v)), { min: -180, max: 180, step: 1, fmt: (v) => `${v}°` }),
          b.toggle('Mirror', () => store.get().clips.find((x) => x.id === sel.id)?.flip, c((x, v) => (x.flip = v))),
          b.select('Motion', () => motionName(store.get().clips.find((x) => x.id === sel.id)?.kenBurns), c((x, v) => (x.kenBurns = MOTIONS[v] ? { ...MOTIONS[v] } : null)), [['none', 'Still'], ['in', 'Slow zoom in'], ['out', 'Slow zoom out'], ['left', 'Drift left'], ['right', 'Drift right'], ['up', 'Drift up']]),
        ),
        section(
          'Color',
          h('div', { class: 'chips' }, Object.entries(FILTER_PRESETS).map(([k, f]) => button(f.label, () => store.update(c((x) => (x.filter = { preset: k, adjust: {} }))), { variant: `chip${clip.filter?.preset === k ? ' on' : ''}` }))),
          ...['brightness', 'contrast', 'saturate'].map((k) =>
            b.range(k === 'saturate' ? 'Saturation' : k[0].toUpperCase() + k.slice(1), () => {
              const f = store.get().clips.find((x) => x.id === sel.id)?.filter || {};
              return f.adjust?.[k] ?? (FILTER_PRESETS[f.preset] || FILTER_PRESETS.none)[k];
            }, c((x, v) => ((x.filter = x.filter || { preset: 'none', adjust: {} }), (x.filter.adjust = { ...x.filter.adjust, [k]: v }))), { min: 0, max: 2, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` }),
          ),
          b.range('Blur', () => {
            const f = store.get().clips.find((x) => x.id === sel.id)?.filter || {};
            return f.adjust?.blur ?? (FILTER_PRESETS[f.preset] || FILTER_PRESETS.none).blur;
          }, c((x, v) => ((x.filter = x.filter || { preset: 'none', adjust: {} }), (x.filter.adjust = { ...x.filter.adjust, blur: v }))), { min: 0, max: 10, step: 0.1, fmt: (v) => `${v.toFixed(1)}px` }),
        ),
        section(
          'Transition in',
          b.select('Type', () => store.get().clips.find((x) => x.id === sel.id)?.transition?.type || 'none', c((x, v) => (x.transition = { ...(x.transition || { duration: 0.4 }), type: v })), TRANSITIONS),
          b.range('Length', () => store.get().clips.find((x) => x.id === sel.id)?.transition?.duration ?? 0.4, c((x, v) => (x.transition = { ...(x.transition || { type: 'fade' }), duration: v })), { min: 0.1, max: 2, step: 0.05, fmt: (v) => `${v.toFixed(2)}s` }),
          h(
            'div',
            { class: 'row' },
            button('Use on every cut', () => {
              const tr = store.get().clips.find((x) => x.id === sel.id)?.transition;
              store.update((d) => d.clips.forEach((x, i) => i > 0 && (x.transition = { ...tr })));
              toast('Applied to every cut');
            }, { variant: 'sm' }),
            button('Random on every cut', () => {
              const pool = TRANSITIONS.filter(([k]) => !['none', 'fade', 'dipBlack', 'dipWhite'].includes(k)).map(([k]) => k);
              store.update((d) => d.clips.forEach((x, i) => i > 0 && (x.transition = { type: pool[Math.floor(Math.random() * pool.length)], duration: x.transition?.duration ?? 0.4 })));
              toast('Mixed transitions applied');
            }, { iconName: 'wand', variant: 'sm' }),
          ),
        ),
        section(
          'Effects',
          h('p', { class: 'muted tiny' }, 'Beat effects follow the song’s beat. Run “Detect BPM” in the Audio tab first; otherwise they use 120 BPM.'),
          ...['beatPulse', 'shake', 'rgb', 'flicker'].map((k) =>
            b.range(CLIP_EFFECTS[k], () => store.get().clips.find((x) => x.id === sel.id)?.effects?.[k] || 0, c((x, v) => (x.effects = { ...(x.effects || {}), [k]: v })), { min: 0, max: 1, step: 0.01, fmt: (v) => (v ? `${Math.round(v * 100)}%` : 'Off') }),
          ),
          ...['vhs', 'strobe', 'invertBeat'].map((k) => b.toggle(CLIP_EFFECTS[k], () => store.get().clips.find((x) => x.id === sel.id)?.effects?.[k], c((x, v) => (x.effects = { ...(x.effects || {}), [k]: v })))),
          b.select('Mirror', () => store.get().clips.find((x) => x.id === sel.id)?.effects?.mirror || 'none', c((x, v) => (x.effects = { ...(x.effects || {}), mirror: v })), MIRRORS),
          button('Clear effects', () => store.update(c((x) => (x.effects = {}))), { variant: 'ghost sm' }),
        ),
        isVideo ? section('Clip sound', b.range('Volume', () => store.get().clips.find((x) => x.id === sel.id)?.volume, c((x, v) => (x.volume = v)), { min: 0, max: 1.5, step: 0.01, fmt: (v) => (v ? `${Math.round(v * 100)}%` : 'Muted') })) : null,
      );
    }
    if (sel.type === 'lyric') {
      const l = p.lyrics.find((x) => x.id === sel.id);
      if (!l) return buildProjectInspector(b);
      const L = (fn) => (d, v) => {
        const x = d.lyrics.find((y) => y.id === sel.id);
        if (x) fn(x, v, d);
      };
      const get = () => store.get().lyrics.find((x) => x.id === sel.id);
      const sorted = sortLyrics(p.lyrics);
      const idx = sorted.findIndex((x) => x.id === sel.id);
      return h(
        'div',
        {},
        h('div', { class: 'insp-title' }, icon('mic', 16), h('span', {}, `Lyric line ${idx + 1} of ${sorted.length}`)),
        b.text('Text', () => get()?.text, L((x, v) => (x.text = v)), { multiline: true, rows: 2 }),
        h('div', { class: 'grid2' }, b.number('Start (song s)', () => get()?.start, L((x, v) => ((x.start = v), x.end <= v && (x.end = v + 0.3))), { min: 0, step: 0.05 }), b.number('End (song s)', () => get()?.end, L((x, v) => (x.end = Math.max(x.start + 0.1, v))), { min: 0, step: 0.05 })),
        h(
          'div',
          { class: 'row' },
          button('Start at playhead', () => store.update(L((x, _v, d) => {
            x.start = +timelineToSong(engine.t, d.song).toFixed(3);
            if (x.end <= x.start) x.end = x.start + 1;
          })), { variant: 'sm' }),
          button('End at playhead', () => store.update(L((x, _v, d) => (x.end = Math.max(x.start + 0.1, +timelineToSong(engine.t, d.song).toFixed(3))))), { variant: 'sm' }),
        ),
        h(
          'div',
          { class: 'row' },
          iconButton('arrowLeft', 'Previous line', () => sorted[idx - 1] && selectLyric(sorted[idx - 1]), 'ghost'),
          iconButton('arrowRight', 'Next line', () => sorted[idx + 1] && selectLyric(sorted[idx + 1]), 'ghost'),
          button('Insert line after', () => {
            const nl = { id: uid('lyr'), text: 'New line', start: l.end + 0.05, end: l.end + 2 };
            store.update((d) => d.lyrics.push(nl));
            ui.select({ type: 'lyric', id: nl.id });
          }, { iconName: 'plus', variant: 'sm' }),
          iconButton('trash', 'Delete line', () => ui.deleteSelection(), 'ghost danger'),
        ),
        b.range('This line’s height', () => get()?.y ?? store.get().lyricStyle.y, L((x, v) => (x.y = v)), { min: 5, max: 95, step: 1, fmt: (v) => `${v}%` }),
        button('Use the shared height', () => store.update(L((x) => delete x.y)), { variant: 'ghost sm' }),
        h('p', { class: 'muted tiny' }, 'Font, colors and animation for all lines are in the Lyrics tab.'),
      );
    }
    if (sel.type === 'text') {
      const tx = p.texts.find((x) => x.id === sel.id);
      if (!tx) return buildProjectInspector(b);
      const T = (fn) => (d, v) => {
        const x = d.texts.find((y) => y.id === sel.id);
        if (x) fn(x, v);
      };
      const get = () => store.get().texts.find((x) => x.id === sel.id) || {};
      return h(
        'div',
        {},
        h('div', { class: 'insp-title' }, icon('type', 16), h('span', {}, 'Text overlay')),
        b.text('Text', () => get().text, T((x, v) => (x.text = v)), { multiline: true, rows: 2 }),
        h('div', { class: 'grid2' }, b.number('Start (s)', () => get().start, T((x, v) => ((x.start = v), x.end <= v && (x.end = v + 0.5))), { min: 0, step: 0.05 }), b.number('End (s)', () => get().end, T((x, v) => (x.end = Math.max(x.start + 0.1, v))), { min: 0, step: 0.05 })),
        b.select('Font', () => get().font, T((x, v) => (x.font = v)), fontOptions()),
        b.select('Animation', () => get().animation, T((x, v) => (x.animation = v)), ANIMATIONS.filter(([k]) => k !== 'karaoke')),
        b.range('Size', () => get().size, T((x, v) => (x.size = v)), { min: 2, max: 25, step: 0.1, fmt: (v) => v.toFixed(1) }),
        b.range('Left/right', () => get().x, T((x, v) => (x.x = v)), { min: 0, max: 100, step: 1, fmt: (v) => `${v}%` }),
        b.range('Up/down', () => get().y, T((x, v) => (x.y = v)), { min: 0, max: 100, step: 1, fmt: (v) => `${v}%` }),
        h('div', { class: 'grid2' }, b.color('Text', () => get().color, T((x, v) => (x.color = v))), b.color('Outline', () => get().outline, T((x, v) => (x.outline = v)))),
        b.toggle('Background box', () => get().box, T((x, v) => (x.box = v))),
        h('div', { class: 'grid2' }, b.color('Box', () => get().boxColor, T((x, v) => (x.boxColor = v))), b.range('Box opacity', () => get().boxOpacity, T((x, v) => (x.boxOpacity = v)), { min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` })),
        h('div', { class: 'row' }, button('Duplicate', () => store.update((d) => d.texts.push({ ...structuredClone(get()), id: uid('txt'), start: get().end, end: get().end + (get().end - get().start) })), { iconName: 'copy', variant: 'sm' }), iconButton('trash', 'Delete text', () => ui.deleteSelection(), 'ghost danger')),
      );
    }
    if (sel.type === 'audio') {
      const a = p.audioTracks.find((x) => x.id === sel.id);
      if (!a) return buildProjectInspector(b);
      const A = (fn) => (d, v) => {
        const x = d.audioTracks.find((y) => y.id === sel.id);
        if (x) fn(x, v);
      };
      const get = () => store.get().audioTracks.find((x) => x.id === sel.id) || {};
      const rec = media.get(a.mediaId);
      return h(
        'div',
        {},
        h('div', { class: 'insp-title' }, icon('music', 16), h('span', {}, rec ? rec.name : 'Audio')),
        h('div', { class: 'grid2' }, b.number('Starts at (s)', () => get().start, A((x, v) => (x.start = v)), { min: 0, step: 0.05 }), b.number('Length (s)', () => get().duration, A((x, v) => (x.duration = Math.min(v, (rec?.duration || v) - x.in))), { min: 0.2, step: 0.05 })),
        b.number('From (s into the file)', () => get().in, A((x, v) => (x.in = Math.min(v, Math.max(0, (rec?.duration || 0) - 0.2)))), { min: 0, step: 0.05 }),
        b.range('Volume', () => get().volume, A((x, v) => (x.volume = v)), { min: 0, max: 1.5, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` }),
        h('div', { class: 'grid2' }, b.number('Fade in (s)', () => get().fadeIn, A((x, v) => (x.fadeIn = v)), { min: 0, step: 0.1 }), b.number('Fade out (s)', () => get().fadeOut, A((x, v) => (x.fadeOut = v)), { min: 0, step: 0.1 })),
        button('Move to playhead', () => store.update(A((x) => (x.start = +engine.t.toFixed(2)))), { variant: 'sm' }),
        iconButton('trash', 'Delete audio track', () => ui.deleteSelection(), 'ghost danger'),
      );
    }
    if (sel.type === 'song') {
      ui.openTab('audio');
      return h('div', {}, h('div', { class: 'insp-title' }, icon('music', 16), h('span', {}, 'Song')), h('p', { class: 'small' }, 'Drag the song on the timeline to choose which part plays. Volume, fades, tempo and “Find the hook” are in the Audio tab.'));
    }
    if (sel.type === 'endcard') {
      ui.openTab('endcard');
      return h('div', {}, h('div', { class: 'insp-title' }, icon('disc', 16), h('span', {}, 'End card')), h('p', { class: 'small' }, 'Drag its left edge on the timeline to change its length. Everything else is in the End card tab.'));
    }
    return buildProjectInspector(b);
  }

  function selectLyric(l) {
    ui.select({ type: 'lyric', id: l.id });
    engine.seek(Math.max(0, songToTimeline(l.start, store.get().song)));
  }

  function moveClip(dir) {
    const id = ui.selection.id;
    store.update((d) => {
      const i = d.clips.findIndex((c) => c.id === id);
      const j = i + dir;
      if (j < 0 || j >= d.clips.length) return;
      [d.clips[i], d.clips[j]] = [d.clips[j], d.clips[i]];
    });
  }

  function buildProjectInspector(b) {
    const p = store.get();
    return h(
      'div',
      {},
      h('div', { class: 'insp-title' }, icon('settings', 16), h('span', {}, 'Project')),
      b.text('Name', (pp) => pp.name, (d, v) => (d.name = v)),
      b.select('Format', (pp) => pp.aspect, (d, v) => (d.aspect = v), Object.entries(ASPECTS).map(([k, a]) => [k, a.label])),
      b.number('Length (s)', (pp) => pp.duration, (d, v) => (d.duration = v), { min: 3, max: 600, step: 0.5 }),
      button('Fit length to clips + end card', () => store.update((d) => {
        const len = d.clips.reduce((s, c) => s + c.duration, 0);
        if (len) d.duration = +(len + (d.endCard.enabled && d.endCard.background !== 'video' ? d.endCard.duration : 0)).toFixed(2);
      }), { variant: 'ghost sm', disabled: !p.clips.length }),
      section(
        'Getting started',
        h(
          'ol',
          { class: 'steps' },
          h('li', { class: p.clips.length ? 'done' : '' }, 'Add video: upload clips (Media) or search free footage (Stock).'),
          h('li', { class: p.song ? 'done' : '' }, 'Add your song (Audio) and pick the hook.'),
          h('li', { class: p.lyrics.length ? 'done' : '' }, 'Paste lyrics and tap along to sync them (Lyrics).'),
          h('li', { class: p.endCard.coverMediaId ? 'done' : '' }, 'Add cover art and a call to action (End card).'),
          h('li', {}, 'Export and post.'),
        ),
      ),
      section(
        'Shortcuts',
        h(
          'dl',
          { class: 'keys' },
          [['Space', 'Play / pause'], ['← →', 'Step one frame (Shift: 1 s)'], ['S', 'Split clip at playhead'], ['O', 'Cycle phone app buttons'], ['Delete', 'Delete selected'], ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'], ['Ctrl+wheel', 'Zoom timeline'], ['Home / End', 'Jump to start / end']].map(([k, v]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, v)]),
        ),
      ),
    );
  }

  return { tabs, buildInspector, importFiles, sync, doTap, doEnd, stopSync, actions };
}

const MOTIONS = {
  in: { fromZoom: 1, toZoom: 1.18, fromX: 0, toX: 0, fromY: 0, toY: 0 },
  out: { fromZoom: 1.18, toZoom: 1, fromX: 0, toX: 0, fromY: 0, toY: 0 },
  left: { fromZoom: 1.15, toZoom: 1.15, fromX: 0.6, toX: -0.6, fromY: 0, toY: 0 },
  right: { fromZoom: 1.15, toZoom: 1.15, fromX: -0.6, toX: 0.6, fromY: 0, toY: 0 },
  up: { fromZoom: 1.15, toZoom: 1.15, fromX: 0, toX: 0, fromY: 0.6, toY: -0.6 },
};
function motionName(k) {
  if (!k) return 'none';
  for (const [name, m] of Object.entries(MOTIONS)) {
    if (Object.keys(m).every((key) => Math.abs(m[key] - k[key]) < 1e-6)) return name;
  }
  return 'in';
}

export function slug(s) {
  return String(s || 'promo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'promo';
}

export { clipAt, splitClip };
