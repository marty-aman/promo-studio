// The Drum MIDI converter page: load a drum .mid, say which drum software or e-kit it was written for and
// which one it should play on, see where every drum goes, and download the converted file (or add it to
// the media library for a drum chart). The maps are in drummap.js; the file is rewritten by midi.js.
import { h, icon, button, toast, pickFiles, download } from './dom.js';
import { media, addMedia } from './media.js';
import { parseMidi, remapMidi, noteCounts, drumChannels, MIDI_ACCEPT, DRUM_CHANNEL } from './midi.js';
import { engines, engine, engineGroups, plan, guessEngines, canonLabel, noteName } from './drummap.js';

const KEY = 'pvm.drumconvert.v1';
/** What the page is working on (not saved, except the last maps picked). */
export const drumConvertState = { pick: '', bytes: null, name: '', from: '', to: '', missing: 'nearest', unknown: 'remove', channel: 'auto', viewMap: '' };

const saved = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
};
const remember = (o) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...saved(), ...o }));
  } catch {
    /* private mode */
  }
};

const HOW = {
  same: ['Same drum', 'ok'],
  'stand-in': ['Stand-in', 'warn'],
  dropped: ['No drum: left out', 'bad'],
  'unknown-removed': ['Unknown note: left out', 'bad'],
  'unknown-kept': ['Unknown note: kept', 'warn'],
};

export function buildDrumConvertPage({ store, ui, panels }) {
  const st = drumConvertState;
  const root = h('div', { class: 'page drumconv' });

  const mapSelect = (value, onChange, label) => {
    const sel = h('select', { 'aria-label': label }, engineGroups().map(([vendor, list]) => h('optgroup', { label: vendor }, list.map((e) => h('option', { value: e.id, selected: e.id === value }, e.name)))));
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  };

  async function load(bytes, name) {
    try {
      const midi = parseMidi(bytes);
      if (!midi.notes.length) throw new Error('This MIDI file has no notes.');
      st.bytes = bytes;
      st.name = name;
      st.channel = 'auto';
      const best = guessEngines(noteCounts(midi, { channels: drumChannels(midi) }), 1)[0];
      if (!st.from || !engine(st.from)) st.from = best && best.fit >= 0.95 ? best.engine.id : saved().from || 'general_midi';
      if (!st.to || !engine(st.to)) st.to = saved().to || 'superior_drummer3';
      render();
    } catch (e) {
      toast(e.message || 'Could not read that file.', 'error', 5000);
    }
  }
  const fromLibrary = async (id) => {
    const rec = media.get(id);
    if (!rec) return;
    st.pick = id;
    await load(new Uint8Array(await rec.blob.arrayBuffer()), rec.name);
  };
  const upload = async () => {
    const [f] = await pickFiles(MIDI_ACCEPT, false);
    if (f) await load(new Uint8Array(await f.arrayBuffer()), f.name);
  };

  function render() {
    const midi = st.bytes ? parseMidi(st.bytes) : null;
    const lib = media.all().filter((m) => m.kind === 'midi');
    const libSel = h('select', { 'aria-label': 'A MIDI file from the media library' }, h('option', { value: '' }, lib.length ? 'Pick a MIDI file from the library…' : 'No MIDI files in the library yet'), lib.map((m) => h('option', { value: m.id, selected: m.id === st.pick && st.bytes }, m.name)));
    libSel.addEventListener('change', () => libSel.value && fromLibrary(libSel.value));

    const head = h(
      'header',
      { class: 'page-head' },
      h('div', {}, h('h2', {}, icon('activity', 20), ' Drum MIDI converter'), h('p', { class: 'muted small' }, 'Move a drum MIDI file from one drum map to another: Superior Drummer 3, EZdrummer, Addictive Drums 2, GetGood Drums, Steven Slate Drums, BFD, General MIDI, Guitar Pro, Roland and Alesis kits and 150 more. Only the note numbers change; the timing, velocities and everything else stay as played.')),
      button('Back to editor', () => ui.openTab('start'), { iconName: 'x', variant: 'ghost' }),
    );
    const pick = h(
      'section',
      { class: 'dc-step' },
      h('h3', { class: 'page-sect' }, '1 · The MIDI file'),
      h('div', { class: 'row wrap' }, button('Open a .mid file', upload, { iconName: 'upload', variant: st.bytes ? 'sm' : 'primary' }), libSel),
      midi
        ? h(
            'p',
            { class: 'small' },
            h('strong', {}, st.name),
            ` · ${midi.notes.length} notes · ${midi.tracks.filter((t) => t.notes).length} track${midi.tracks.filter((t) => t.notes).length === 1 ? '' : 's'} · ${midi.tempo} BPM · ${Math.floor(midi.duration / 60)}:${String(Math.round(midi.duration % 60)).padStart(2, '0')}`,
          )
        : h('p', { class: 'muted small' }, 'Drag the MIDI out of your DAW or drum software as a .mid file, then open it here. Nothing is uploaded: the file stays in this browser.'),
    );
    if (!midi) {
      root.replaceChildren(head, pick, mapViewer());
      return;
    }
    // which channels are the drums
    const used = [...new Set(midi.notes.map((n) => n.ch))].sort((a, b) => a - b);
    const auto = drumChannels(midi);
    const channels = st.channel === 'auto' ? auto : st.channel === 'all' ? null : [+st.channel];
    const chSel = h('select', { 'aria-label': 'Which channel has the drums' }, h('option', { value: 'auto', selected: st.channel === 'auto' }, `Automatic (${auto.length === 1 ? `channel ${auto[0] + 1}` : 'every channel'})`), h('option', { value: 'all', selected: st.channel === 'all' }, 'Every channel'), used.map((c) => h('option', { value: String(c), selected: st.channel === String(c) }, `Channel ${c + 1}${c === DRUM_CHANNEL ? ' (GM drums)' : ''}`)));
    chSel.addEventListener('change', () => ((st.channel = chSel.value), render()));
    const counts = noteCounts(midi, { channels });
    const guesses = guessEngines(counts, 4);

    const maps = h(
      'section',
      { class: 'dc-step' },
      h('h3', { class: 'page-sect' }, '2 · From and to'),
      h(
        'div',
        { class: 'dc-maps' },
        h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'It was written for'), mapSelect(st.from, (v) => ((st.from = v), remember({ from: v }), render()), 'Source drum map')),
        button('Swap', () => {
          [st.from, st.to] = [st.to, st.from];
          remember({ from: st.from, to: st.to });
          render();
        }, { iconName: 'repeat', variant: 'sm ghost', title: 'Swap source and destination' }),
        h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Convert it to'), mapSelect(st.to, (v) => ((st.to = v), remember({ to: v }), render()), 'Destination drum map')),
      ),
      h('p', { class: 'muted tiny' }, 'Best fits for the notes in this file: ', guesses.map((g, i) => [i ? ' · ' : '', h('button', { type: 'button', class: `link${g.engine.id === st.from ? ' on' : ''}`, onclick: () => ((st.from = g.engine.id), render()) }, `${g.engine.short || g.engine.name} ${Math.round(g.fit * 100)}%`)]), '. Many maps share the General MIDI basics, so check the toms and cymbals below.'),
      h(
        'div',
        { class: 'grid3 dc-opts' },
        h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Drum channel'), chSel),
        h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Drums the destination doesn’t have'), (() => {
          const s = h('select', {}, h('option', { value: 'nearest', selected: st.missing === 'nearest' }, 'Play the closest drum it has'), h('option', { value: 'drop', selected: st.missing === 'drop' }, 'Same drum only, else leave out'));
          s.addEventListener('change', () => ((st.missing = s.value), render()));
          return s;
        })()),
        h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Notes the source map doesn’t know'), (() => {
          const s = h('select', {}, h('option', { value: 'remove', selected: st.unknown === 'remove' }, 'Leave them out'), h('option', { value: 'keep', selected: st.unknown === 'keep' }, 'Keep them as they are'));
          s.addEventListener('change', () => ((st.unknown = s.value), render()));
          return s;
        })()),
      ),
    );

    let pl;
    try {
      pl = plan(st.from, st.to, counts, { missing: st.missing, unknown: st.unknown });
    } catch (e) {
      root.replaceChildren(head, pick, maps, h('p', { class: 'error-text' }, e.message));
      return;
    }
    const src = engine(st.from);
    const dst = engine(st.to);
    const table = h(
      'table',
      { class: 'mgr-table dc-table' },
      h('thead', {}, h('tr', {}, h('th', {}, `${src.short || src.name} note`), h('th', {}, 'Drum'), h('th', { class: 'n' }, 'Hits'), h('th', {}, ''), h('th', {}, `${dst.short || dst.name} note`), h('th', {}, 'Plays'), h('th', {}, ''))),
      h('tbody', {}, pl.rows.map((r) => {
        const [how, cls] = HOW[r.how];
        return h(
          'tr',
          { class: `dc-${r.how}` },
          h('td', { class: 'mono' }, `${r.note} · ${noteName(r.note)}`),
          h('td', {}, r.canon ? canonLabel(r.canon) : h('span', { class: 'muted' }, 'not in this map')),
          h('td', { class: 'n' }, String(r.count)),
          h('td', { 'aria-hidden': 'true' }, '→'),
          h('td', { class: 'mono' }, r.to == null ? '—' : `${r.to} · ${noteName(r.to)}`),
          h('td', {}, r.toCanon ? canonLabel(r.toCanon) : '—'),
          h('td', {}, h('span', { class: `mgr-chip ${cls}` }, how)),
        );
      })),
    );
    const s = pl.stats;
    const summary = h('p', { class: 'small dc-summary' }, `${s.notes} hits: ${s.same} on the same drum`, s.standIn ? `, ${s.standIn} on a stand-in` : '', s.kept ? `, ${s.kept} kept as they were` : '', s.dropped ? `, ${s.dropped} left out (no drum for them)` : '', '.');
    const outName = `${st.name.replace(/\.(mid|midi|smf)$/i, '')} (${(dst.short || dst.name).replace(/[^\w\s-]+/g, '').trim()}).mid`;
    const convert = () => remapMidi(st.bytes, pl.map, { channels });
    const result = h(
      'section',
      { class: 'dc-step' },
      h('h3', { class: 'page-sect' }, '3 · Where every drum goes'),
      summary,
      h('div', { class: 'mgr-table-wrap' }, table),
      h(
        'div',
        { class: 'row wrap' },
        button(`Download ${outName}`, () => {
          const out = convert();
          download(new Blob([out.bytes], { type: 'audio/midi' }), outName);
          toast(`Converted ${out.changed} notes${out.silenced ? ` and left out ${out.silenced}` : ''}. Drag it into ${dst.short || dst.name}.`, 'info', 5000);
        }, { iconName: 'download', variant: 'primary' }),
        button('Add it to the media library', async () => {
          const out = convert();
          const rec = await addMedia(new Blob([out.bytes], { type: 'audio/midi' }), outName);
          toast(`“${rec.name}” is in the media library. Show it on the video as a drum chart from there.`, 'info', 5000);
          render();
        }, { iconName: 'plus', variant: 'sm' }),
        button('Show the original on the video', async () => {
          const rec = st.pick && media.get(st.pick) ? media.get(st.pick) : await addMedia(new Blob([st.bytes], { type: 'audio/midi' }), st.name);
          panels.actions.useMidi(rec);
          // read with the map it was written for
          store.update((d) => d.layers.filter((l) => l.type === 'drums' && l.mediaId === rec.id).forEach((l) => (l.drumMap = st.from)));
        }, { iconName: 'activity', variant: 'sm ghost', title: 'A drum chart from this file, read with the source map' }),
      ),
    );
    root.replaceChildren(head, pick, maps, result, mapViewer());
  }

  /** Look up any map: which note plays which drum. */
  function mapViewer() {
    const id = st.viewMap || st.to || 'general_midi';
    const e = engine(id) || engines()[0];
    const rows = [...e.notes.entries()].sort((a, b) => a[0] - b[0]);
    const sel = mapSelect(e.id, (v) => ((st.viewMap = v), render()), 'Drum map to look up');
    return h(
      'details',
      { class: 'dc-step dc-viewer', open: !!st.viewMap || null },
      h('summary', {}, 'Look up a drum map'),
      h('div', { class: 'row' }, sel),
      h('p', { class: 'muted tiny' }, `${e.name} (${e.vendor}) · ${rows.length} notes. Note names count middle C (60) as C3, like most DAWs and drum software. ★ is the note it uses first for that drum.`),
      h('div', { class: 'mgr-table-wrap' }, h('table', { class: 'mgr-table compact' }, h('thead', {}, h('tr', {}, h('th', {}, 'Note'), h('th', {}, 'Drum'))), h('tbody', {}, rows.map(([n, c]) => h('tr', {}, h('td', { class: 'mono' }, `${n} · ${noteName(n)}`), h('td', {}, canonLabel(c), e.byCanon.get(c)[0] === n && e.byCanon.get(c).length > 1 ? ' ★' : '')))))),
      h('p', { class: 'muted tiny' }, 'Drum maps from ', h('a', { href: 'https://github.com/nullcrimson/remidi', target: '_blank', rel: 'noopener noreferrer' }, 'remidi'), ' (MIT licence).'),
    );
  }

  if (st.pick && !st.bytes) fromLibrary(st.pick);
  else render();
  return { el: root, render };
}
