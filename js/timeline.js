// Multi-track timeline: ruler, video lane, text, lyrics, song, extra audio and end card.
import { layoutClips, songToTimeline, timelineToSong, snap, clamp, formatTime, maxClipDuration, ctaText, hasSongParts } from './core.js';
import { media, videoWaveform } from './media.js';
import { isVisible } from './state.js';
import { OFF_KEY, isOff } from './itemoff.js';
import { h, icon, toast } from './dom.js';
import { kfTarget } from './panel-kf.js';
import { resolveRange, setRangeSide, toFrame, MIN_RANGE } from './exportrange.js';
import { allKeys, moveKey, removeKey, EASES, KEY_EPS, snapToBeat, propInfo } from './keyframes.js';
import { markTimed } from './manager/lyrictiming.js';
import { qualityMarks } from './panel-quality.js';
import { pinchZoom, pinchScroll, edgeZone } from './mobilelogic.js';
import { ZOOM_MAX, TAIL_SEC, MAX_LENGTH, zoomMin, fitZoom, rulerSteps, rulerLabel, showBeats, LABEL_MIN_PX, THUMB_MIN_PX, WAVE_MAX_PX } from './tlzoom.js';
import { keyOf, inGroup, toggleIn, spans, planMove, applyMove } from './multimove.js';

const HEAD_W = 112;
const EYE_MIN_PX = 56; // narrower blocks keep all their width for grabbing (E and the menu still turn them off)

export function createTimeline({ root, store, engine, ui }) {
  const heads = h('div', { class: 'tl-heads' });
  const content = h('div', { class: 'tl-content' });
  const scroller = h('div', { class: 'tl-scroll' }, content);
  const playhead = h('div', { class: 'tl-playhead' }, h('div', { class: 'tl-playhead-knob' }));
  const body = h('div', { class: 'tl-body' }, heads, scroller);
  root.append(body);

  let drag = null; // active drag operation
  let preview = null; // transient visual offset for clip reordering
  let groupKeys = null; // keys (multimove keyOf) of the blocks in a multi-selection, while there is one
  let groupPreview = null; // { plan } while a group is dragged: drawn shifted, written to the edit on release

  const pps = () => ui.pxPerSec;
  const x2t = (clientX) => (clientX - content.getBoundingClientRect().left) / pps();
  const group = () => (ui.group && ui.group.length > 1 ? ui.group : null);

  function snapCandidates(excludeId) {
    const p = store.get();
    const ex = (id) => (excludeId instanceof Set ? excludeId.has(id) : id === excludeId);
    const c = [0, p.duration, engine.t];
    for (const l of layoutClips(p.clips)) if (!ex(l.clip.id)) c.push(l.start, l.end);
    for (const L of p.layers || []) {
      if (L.type === 'video') for (const oc of L.clips) if (!ex(oc.id)) c.push(oc.start, oc.start + oc.duration);
      if (L.type === 'viz' && !ex(L.id)) c.push(L.start || 0);
    }
    for (const l of p.lyrics) if (!ex(l.id)) c.push(songToTimeline(l.start, p.song), songToTimeline(l.end, p.song));
    for (const tx of p.texts) if (!ex(tx.id)) c.push(tx.start, tx.end);
    for (const a of p.audioTracks) if (!ex(a.id)) c.push(a.start, a.start + a.duration);
    if (p.endCard.enabled) c.push(p.duration - p.endCard.duration);
    if (p.beats) for (const b of p.beats.beats) c.push(songToTimeline(b, p.song));
    return c;
  }
  const snapT = (t, excludeId) => (ui.snap ? snap(t, snapCandidates(excludeId), 8 / pps()) : t);

  // ------------------------------------------------------------ rendering

  // Only blocks near the visible part are drawn (a 30 minute edit has hundreds), the rest are skipped: block() returns
  // null for them. The selected, multi-selected and dragged blocks are always drawn. A scroll past the margin redraws.
  let win = { l: -Infinity, r: Infinity, at: 0 };
  const WIN_MIN_PX = 1600;
  function setWindow() {
    const w = Math.max(scroller.clientWidth, WIN_MIN_PX);
    const l = scroller.scrollLeft;
    win = { l: l - w, r: l + 2 * w, at: l, w };
  }
  const culled = (left, width) => left + width < win.l || left > win.r;

  function block({ cls, left, width, label, sub, selected, data, handles = 'both', style = {}, off = null }) {
    if (!selected && culled(left, width) && !(data && ((groupKeys && groupKeys.has(keyOf(selFor(data.kind, data.id)))) || (preview && preview.id === data.id)))) return null;
    // zoomed far out a block can be a few px wide: no text, no thumbnail (its name stays in the tooltip)
    const thin = width < LABEL_MIN_PX;
    if (width < THUMB_MIN_PX && style.backgroundImage) {
      style = { ...style };
      delete style.backgroundImage;
    }
    // part of a multi-selection: outlined, and drawn shifted while the group is dragged
    const grouped = !!(groupKeys && data && groupKeys.has(keyOf(selFor(data.kind, data.id))));
    if (grouped && groupPreview && groupPreview.plan.delta) style = { ...style, transform: `translateX(${groupPreview.plan.delta * pps()}px)` };
    const el = h(
      'div',
      {
        class: `tl-block ${cls}${selected ? ' selected' : ''}${grouped ? ' grouped' : ''}${grouped && groupPreview ? ' dragging' : ''}${thin ? ' thin' : ''}${off ? ' off' : ''}`,
        style: { left: `${left}px`, width: `${Math.max(4, width)}px`, ...(left < 0 && !thin ? { paddingLeft: `${8 - left}px` } : {}), ...style },
        dataset: data,
        title: off ? `${label} (turned off: press ${OFF_KEY} or its eye to turn it back on)` : label,
        role: 'button',
        tabindex: '0',
        'aria-pressed': selected || grouped ? 'true' : 'false',
      },
      thin ? null : h('span', { class: 'tl-label' }, off ? h('b', { class: 'tl-offtag' }, 'off') : null, label),
      sub && !thin ? h('span', { class: 'tl-sub' }, sub) : null,
    );
    // the eye turns this block off or on (itemoff.js); a block that's off says so even when not selected
    if (off != null && width >= EYE_MIN_PX) {
      const what = off ? 'Turn on' : 'Turn off';
      el.append(h('button', { type: 'button', class: 'tl-offbtn', title: `${what} (${OFF_KEY}). It stays on the timeline.`, 'aria-label': `${what} ${label}`, 'aria-pressed': off ? 'false' : 'true', onpointerdown: (e) => e.stopPropagation(), onclick: (e) => (e.stopPropagation(), ui.toggleOff([selFor(data.kind, data.id)])) }, icon(off ? 'eyeOff' : 'eye', 12)));
    }
    if (handles === 'both' || handles === 'left') el.append(h('div', { class: 'tl-handle l', dataset: { edge: 'l' } }));
    if (handles === 'both' || handles === 'right') el.append(h('div', { class: 'tl-handle r', dataset: { edge: 'r' } }));
    return el;
  }

  // Drawn waveforms are kept between renders (a render runs on every drag step, and a 30-minute song has a lot
  // of peaks to scan); any not used by the latest render are dropped after it.
  let waveCache = new Map();
  let waveUsed = new Map();
  function waveformCanvas(rec, fromSec, toSec, width, height, color) {
    const cssW = Math.max(1, Math.round(width));
    const key = rec && rec.peaks ? `${rec.id}|${rec.peaks.length}|${fromSec.toFixed(3)}|${toSec.toFixed(3)}|${cssW}|${height}|${color}` : null;
    const hit = key && (waveUsed.get(key) ? null : waveCache.get(key));
    if (hit) {
      waveUsed.set(key, hit);
      return hit;
    }
    const c = h('canvas', { class: 'tl-wave' });
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // shortcut: past WAVE_MAX_PX the canvas is stretched to the block; fine for a waveform, sharp again zoomed out
    const w = Math.min(WAVE_MAX_PX, cssW);
    c.width = Math.round(w * dpr);
    c.height = Math.round(height * dpr);
    c.style.width = `${cssW}px`;
    c.style.height = `${height}px`;
    if (!rec || !rec.peaks) return c;
    if (key) waveUsed.set(key, c);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.fillStyle = color;
    const per = rec.peaksPerSec;
    const bins = rec.peaks.length / 2;
    for (let x = 0; x < w; x++) {
      const t0 = fromSec + ((toSec - fromSec) * x) / w;
      const t1 = fromSec + ((toSec - fromSec) * (x + 1)) / w;
      let lo = 0;
      let hi = 0;
      for (let b = Math.floor(t0 * per); b <= Math.min(bins - 1, Math.ceil(t1 * per)); b++) {
        if (b < 0) continue;
        lo = Math.min(lo, rec.peaks[b * 2]);
        hi = Math.max(hi, rec.peaks[b * 2 + 1]);
      }
      const y0 = height / 2 - hi * (height / 2) * 0.95;
      const y1 = height / 2 - lo * (height / 2) * 0.95;
      g.fillRect(x, y0, 1, Math.max(1, y1 - y0));
    }
    return c;
  }

  /**
   * A video clip's own sound along the bottom of its block (from its in-point, at its speed), so you can
   * line it up with the song by eye. The file is analysed once in the background; the timeline redraws
   * when it's ready.
   */
  let waveRedraw = 0;
  const qualityRedraw = () => requestAnimationFrame(() => render());
  function clipWave(el, rec, clip, widthPx) {
    if (widthPx < THUMB_MIN_PX) return; // too thin to show weak takes or sound
    qualityMarks(el, rec, clip, widthPx, qualityRedraw);
    if (!rec || rec.kind !== 'video' || ui.clipWaves === false) return;
    const state = videoWaveform(rec, () => {
      cancelAnimationFrame(waveRedraw);
      waveRedraw = requestAnimationFrame(() => render());
    });
    if (state === 'none') {
      el.classList.add('no-sound');
      return;
    }
    if (state !== 'ready') return;
    const sp = clip.speed || 1;
    const c = waveformCanvas(rec, clip.in || 0, (clip.in || 0) + clip.duration * sp, widthPx, 20, 'rgba(255,214,102,.85)');
    c.classList.add('clip-wave');
    el.append(c);
  }

  const put = (row, el) => el && row.append(el);

  /** Greedy lane packing so overlapping items get their own row. */
  function lanes(items, startOf, endOf) {
    const ends = [];
    const out = new Map();
    for (const it of [...items].sort((a, b) => startOf(a) - startOf(b))) {
      let lane = ends.findIndex((e) => e <= startOf(it) + 1e-3);
      if (lane < 0) {
        lane = ends.length;
        ends.push(0);
      }
      ends[lane] = endOf(it);
      out.set(it.id, lane);
    }
    return { map: out, count: Math.max(1, ends.length) };
  }

  function render() {
    const p = store.get();
    const total = p.duration;
    const { min } = zoomRange();
    if (ui.pxPerSec < min) ui.pxPerSec = min; // the edit got shorter: zoomed-out-fully now means it fits again
    const s = pps();
    if (ui.zoomShown) ui.zoomShown(s, min, ZOOM_MAX);
    waveCache = waveUsed;
    waveUsed = new Map();
    const width = Math.max(scroller.clientWidth, (total + TAIL_SEC) * s);
    content.style.width = `${width}px`;
    setWindow();
    content.replaceChildren();
    heads.replaceChildren(h('div', { class: 'tl-head ruler-head' }, formatTime(engine.t)));
    const sel = ui.selection;
    const grp = group();
    groupKeys = grp ? new Set(grp.map(keyOf)) : null;
    if (ui.groupShown) ui.groupShown(grp ? grp.length : 0);
    const rows = [];
    const addRow = (name, cls, height, fill, opt = {}) => {
      const hidden = opt.layer ? opt.layer.visible === false : opt.vis ? !isVisible(p, opt.vis) : false;
      const row = h('div', { class: `tl-track ${cls}${hidden ? ' hidden-row' : ''}`, style: { height: `${height}px` }, dataset: { track: cls } });
      fill(row);
      content.append(row);
      const toggle = (e) => {
        e.stopPropagation();
        store.update((d) => {
          if (opt.layer) {
            const l = d.layers.find((x) => x.id === opt.layer.id);
            if (l) l.visible = l.visible === false;
          } else {
            d.layerVis = { ...(d.layerVis || {}) };
            if (d.layerVis[opt.vis] === false) delete d.layerVis[opt.vis];
            else d.layerVis[opt.vis] = false;
          }
        });
      };
      const what = opt.audio ? (hidden ? 'Unmute' : 'Mute') : hidden ? 'Show' : 'Hide';
      const eye =
        opt.vis || opt.layer
          ? h('button', { type: 'button', class: `tl-eye${hidden ? ' off' : ''}`, title: `${what} ${name}`, 'aria-label': `${what} ${name}`, 'aria-pressed': hidden ? 'false' : 'true', onclick: toggle }, icon(opt.audio ? (hidden ? 'mute' : 'volume') : hidden ? 'eyeOff' : 'eye', 14))
          : null;
      const label = opt.layer
        ? h('button', { type: 'button', class: 'tl-head-name', title: `${name}: open its settings`, onclick: () => ui.select({ type: 'layer', id: opt.layer.id }) }, name)
        : h('span', { class: 'tl-head-name' }, name);
      heads.append(h('div', { class: `tl-head ${cls}${hidden ? ' off' : ''}${opt.layer && sel && sel.type === 'layer' && sel.id === opt.layer.id ? ' sel' : ''}`, style: { height: `${height}px` } }, eye, label));
      rows.push(row);
    };

    // ruler: labelled ticks at least LABEL_PX apart (0.5 s up to 1 h), minor ticks between when there is room
    const ruler = h('div', { class: 'tl-ruler', dataset: { track: 'ruler' } });
    const { label: lStep, minor: minor0 } = rulerSteps(s);
    // shortcut: a long edit zoomed right in drops the minor ticks to keep the ruler under ~4000 nodes
    const minor = minor0 && (total + TAIL_SEC) / minor0 <= 4000 ? minor0 : 0;
    const tick = minor || lStep;
    const per = Math.round(lStep / tick);
    for (let i = Math.max(0, Math.floor(win.l / s / tick)); i * tick <= total + TAIL_SEC && i * tick * s <= win.r; i++) {
      const t = +(i * tick).toFixed(3);
      const major = i % per === 0;
      ruler.append(h('div', { class: `tick${major ? ' major' : ''}`, style: { left: `${t * s}px` } }, major ? h('span', {}, rulerLabel(t, lStep)) : null));
    }
    if (p.beats && showBeats(p.beats.beats, s)) {
      for (const b of p.beats.beats) {
        const bt = songToTimeline(b, p.song);
        if (bt >= 0 && bt <= total && bt * s >= win.l && bt * s <= win.r) ruler.append(h('div', { class: 'beat', style: { left: `${bt * s}px` } }));
      }
    }
    ruler.append(h('div', { class: 'tl-outside', style: { left: `${total * s}px` } }));
    ruler.append(h('div', { class: 'tl-end-handle', style: { left: `${total * s}px` }, dataset: { op: 'duration' }, title: 'Drag to change the video length' }));
    // export range: In / Out flags on the ruler (draggable) and a dim over what the export leaves out
    const rg = resolveRange(p);
    if (p.exportRange && p.exportRange.start != null) ruler.append(h('div', { class: 'tl-range-mark in', style: { left: `${rg.start * s}px` }, dataset: { op: 'range-in' }, title: 'Export starts here. Drag to move it', role: 'img', 'aria-label': `Export start ${formatTime(rg.start)}` }, h('span', {}, 'In')));
    if (p.exportRange && p.exportRange.end != null) ruler.append(h('div', { class: 'tl-range-mark out', style: { left: `${rg.end * s}px` }, dataset: { op: 'range-out' }, title: 'Export ends here. Drag to move it', role: 'img', 'aria-label': `Export end ${formatTime(rg.end)}` }, h('span', {}, 'Out')));
    content.append(ruler);
    if (rg.start > 0) content.append(h('div', { class: 'tl-range-dim', style: { left: '0px', width: `${rg.start * s}px` } }));
    if (rg.end < total) content.append(h('div', { class: 'tl-range-dim', style: { left: `${rg.end * s}px`, width: `${(total - rg.end) * s}px` } }));

    // stacked layers, topmost first
    const visEnd = p.endCard.enabled ? total - p.endCard.duration : total;
    for (const L of [...(p.layers || [])].reverse()) {
      const isSel = sel && sel.type === 'layer' && sel.id === L.id;
      if (L.type === 'video') {
        addRow(L.name || 'Video layer', 'vlayer', 46, (row) => {
          if (!L.clips.length) row.append(h('div', { class: 'tl-empty' }, 'Empty video layer: add a clip in its settings'));
          for (const c of L.clips) {
            const rec = media.get(c.mediaId);
            const el = block({
              cls: 'clip oclip',
              left: c.start * s,
              width: c.duration * s,
              label: rec ? rec.name : media.missingLabel(c.mediaId),
              sub: `${c.duration.toFixed(1)}s`,
              selected: sel && sel.type === 'clip' && sel.id === c.id,
              data: { kind: 'oclip', id: c.id, layer: L.id },
              off: !!c.disabled,
              style: rec && rec.thumb ? { backgroundImage: `linear-gradient(rgba(10,40,30,.55),rgba(10,40,30,.55)), url(${rec.thumb})` } : {},
            });
            if (!el) continue;
            clipWave(el, rec, c, c.duration * s);
            row.append(el);
          }
        }, { layer: L });
        continue;
      }
      let a = 0;
      let len = 0;
      let label = L.name;
      let kind = 'layer';
      let handles = 'none';
      if (L.type === 'tab' || L.type === 'drums' || L.type === 'midi' || L.type === 'game') {
        const rec = media.get(L.mediaId);
        const stem = L.type === 'drums' && L.source === 'audio';
        len = rec && rec.duration ? (stem ? rec.duration : rec.duration / (L.tempoScale || 1)) : 0;
        if (L.type === 'drums' && !stem && rec && rec.score) {
          const tr = rec.drumTimelines && rec.drumTimelines.get(L.track);
          if (tr) len = tr.duration / (L.tempoScale || 1);
        }
        a = songToTimeline(L.offset || 0, p.song);
        label = `${L.name}${rec ? ` · ${rec.title || rec.name}` : ' · choose a file'}`;
        if (L.chain && len > 0) {
          // a piece of a split layer: show only the part of the chart it draws
          const lo = Math.max(a, L.start || 0);
          len = Math.max(0, Math.min(a + len, L.end ?? visEnd) - lo);
          a = lo;
        }
      } else if (L.type === 'viz') {
        a = L.start || 0;
        len = (L.end ?? visEnd) - a;
        kind = 'vizrange';
        handles = 'both';
      }
      addRow(L.name, `lrow ${L.type}row`, 32, (row) => {
        if (len > 0) {
          put(row,
            block({
              cls: `lblk ${L.type}blk`,
              left: a * s,
              width: len * s,
              label,
              sub: L.type === 'viz' ? 'drag edges to set when it shows · S splits at the playhead' : 'drag to line up with the song · S splits at the playhead',
              selected: isSel,
              data: { kind, id: L.id },
              handles,
            }),
          );
        } else row.append(h('div', { class: 'tl-empty' }, 'Pick a file in its settings'));
      }, { layer: L });
    }

    // video lane
    addRow('Video', 'video', 52, (row) => {
      const laid = layoutClips(p.clips);
      if (!laid.length) row.append(h('div', { class: 'tl-empty' }, 'Add clips from Media or Stock'));
      laid.forEach((l) => {
        const rec = media.get(l.clip.mediaId);
        const el = block({
          cls: 'clip',
          left: l.start * s,
          width: l.clip.duration * s,
          label: rec ? rec.name : media.missingLabel(l.clip.mediaId),
          sub: `${l.clip.duration.toFixed(1)}s${l.clip.speed && l.clip.speed !== 1 ? ` · ${l.clip.speed}×` : ''}`,
          selected: sel && sel.type === 'clip' && sel.id === l.clip.id,
          data: { kind: 'clip', id: l.clip.id },
          off: !!l.clip.disabled,
          style: rec && rec.thumb ? { backgroundImage: `linear-gradient(rgba(10,20,40,.55),rgba(10,20,40,.55)), url(${rec.thumb})` } : {},
        });
        if (!el) return;
        if (preview && preview.id === l.clip.id) {
          el.style.transform = `translateX(${preview.dx}px)`;
          el.classList.add('dragging');
        }
        if (l.clip.transition && l.clip.transition.type !== 'none') el.append(h('div', { class: 'tl-trans', title: `Transition: ${l.clip.transition.type}` }));
        clipWave(el, rec, l.clip, l.clip.duration * s);
        row.append(el);
      });
    }, { vis: 'video' });

    // text overlays
    const tl = lanes(p.texts, (x) => x.start, (x) => x.end);
    addRow('Text', 'text', Math.max(30, tl.count * 26 + 4), (row) => {
      for (const tx of p.texts) {
        put(row,
          block({
            cls: 'txt',
            left: tx.start * s,
            width: (tx.end - tx.start) * s,
            label: tx.text || '(empty)',
            selected: sel && sel.type === 'text' && sel.id === tx.id,
            data: { kind: 'text', id: tx.id },
            off: !!tx.disabled,
            style: { top: `${2 + tl.map.get(tx.id) * 26}px`, height: '24px' },
          }),
        );
      }
    }, { vis: 'text' });

    // lyrics
    addRow('Lyrics', 'lyrics', 40, (row) => {
      if (!p.lyrics.length) row.append(h('div', { class: 'tl-empty' }, 'Paste lyrics in the Lyrics tab'));
      for (const l of p.lyrics) {
        const a = songToTimeline(l.start, p.song);
        const b = songToTimeline(l.end, p.song);
        if (b < 0 || a > total + 4) continue;
        put(row,
          block({
            cls: `lyr${l.style ? ' styled' : ''}`,
            left: a * s,
            width: (b - a) * s,
            label: l.style ? `✦ ${l.text}` : l.text,
            selected: sel && sel.type === 'lyric' && sel.id === l.id,
            data: { kind: 'lyric', id: l.id },
            off: !!l.disabled,
          }),
        );
      }
    }, { vis: 'lyrics' });

    // song
    addRow('Song', 'song', 46, (row) => {
      const rec = p.song && media.get(p.song.mediaId);
      if (!rec) {
        row.append(h('div', { class: 'tl-empty' }, 'Choose your song in the Audio tab'));
        return;
      }
      const songDur = rec.duration || total;
      if (hasSongParts(p.song)) {
        // several parts of the song (Song part in the Audio tab): one block each, where it plays
        p.song.parts.forEach((q, i) => {
          const last = i === p.song.parts.length - 1;
          const to = last ? Math.min(songDur, q.from + (total - q.at)) : q.to;
          const el = block({
            cls: 'song',
            left: q.at * s,
            width: Math.max(2, (to - q.from) * s),
            label: i ? `${formatTime(q.from)}` : `${rec.name}`,
            sub: `${formatTime(q.from)}–${formatTime(q.to)} · change it with Song part`,
            selected: sel && sel.type === 'song',
            data: { kind: 'song', id: 'song' },
            handles: 'none',
          });
          if (!el) return;
          el.prepend(waveformCanvas(rec, q.from, to, Math.max(2, (to - q.from) * s), 44, 'rgba(110,231,160,.55)'));
          row.append(el);
        });
        return;
      }
      const from = p.song.offset;
      const to = Math.min(songDur, from + total);
      const el = block({
        cls: 'song',
        left: 0,
        width: (to - from) * s,
        label: `${rec.name}`,
        sub: `from ${formatTime(from)} · drag to pick the section`,
        selected: sel && sel.type === 'song',
        data: { kind: 'song', id: 'song' },
        handles: 'none',
      });
      if (!el) return;
      el.prepend(waveformCanvas(rec, from, to, (to - from) * s, 44, 'rgba(110,231,160,.55)'));
      row.append(el);
    }, { vis: 'song', audio: true });

    // extra audio
    p.audioTracks.forEach((a, i) => {
      addRow(`Audio ${i + 1}`, 'audio', 40, (row) => {
        const rec = media.get(a.mediaId);
        const el = block({
          cls: 'aud',
          left: a.start * s,
          width: a.duration * s,
          label: rec ? rec.name : media.missingLabel(a.mediaId, 'audio'),
          selected: sel && sel.type === 'audio' && sel.id === a.id,
          data: { kind: 'audio', id: a.id },
          off: !!a.disabled,
        });
        if (!el) return;
        if (rec) el.prepend(waveformCanvas(rec, a.in, a.in + a.duration, a.duration * s, 38, 'rgba(94,234,212,.5)'));
        row.append(el);
      }, { vis: `audio:${a.id}`, audio: true });
    });

    // end card
    addRow('End card', 'endcard', 32, (row) => {
      if (!p.endCard.enabled) {
        row.append(h('div', { class: 'tl-empty' }, 'End card off'));
        return;
      }
      const start = total - p.endCard.duration;
      put(row,
        block({
          cls: 'end',
          left: start * s,
          width: p.endCard.duration * s,
          label: `End card · ${ctaText(p.endCard.cta, p.endCard.releaseDate) || 'call to action'}`,
          selected: sel && sel.type === 'endcard',
          data: { kind: 'endcard', id: 'endcard' },
          handles: 'left',
        }),
      );
    }, { vis: 'endcard' });

    drawKeyframes(p, s);
    playhead.style.left = `${engine.t * s}px`;
    content.append(playhead);
  }

  // ------------------------------------------------------------ keyframe diamonds on the selected block
  function drawKeyframes(p, s) {
    const tg = kfTarget(p, ui.selection);
    const el = content.querySelector('.tl-block.selected');
    if (!tg || !el) return;
    // one diamond per moment (several properties can share it)
    const groups = [];
    for (const k of allKeys(tg.item)) {
      const g = groups.find((x) => Math.abs(x.t - k.t) < KEY_EPS);
      if (g) g.keys.push(k);
      else groups.push({ t: k.t, keys: [k] });
    }
    for (const g of groups) {
      const names = g.keys.map((k) => (propInfo(tg.kind, k.path) || [k.path, k.path])[1]).join(', ');
      const d = h('div', { class: 'tl-kf', style: { left: `${g.t * s}px` }, title: `${formatTime(tg.start + g.t)} · ${names}. Drag to move, double-click to delete, right-click for easing.`, role: 'button', 'aria-label': `Keyframe at ${formatTime(tg.start + g.t)}: ${names}` });
      d.addEventListener('pointerdown', (e) => kfDrag(e, tg, g, d));
      d.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        store.update((dr) => {
          const it = kfTarget(dr, ui.selection)?.find(dr);
          if (it) for (const k of g.keys) removeKey(it, k.path, k.t);
        });
      });
      d.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        easeMenu(e.clientX, e.clientY, g);
      });
      el.append(d);
    }
  }

  function kfDrag(e, tg, g, el) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const s = pps();
    const x0 = e.clientX;
    let to = g.t;
    let moved = false;
    const p = store.get();
    const startSong = timelineToSong(tg.start, p.song);
    // touch has no right-click: holding a diamond opens the same easing menu
    const lp =
      e.pointerType === 'touch'
        ? setTimeout(() => {
            if (moved) return;
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            easeMenu(e.clientX, e.clientY, g);
          }, 550)
        : null;
    const move = (ev) => {
      if (Math.abs(ev.clientX - x0) > (e.pointerType === 'touch' ? 8 : 3)) moved = true;
      if (!moved) return;
      to = clamp(g.t + (ev.clientX - x0) / s, 0, tg.dur);
      if (ui.snap && p.beats) to = snapToBeat(to, p.beats.beats, startSong, 8 / s);
      el.style.left = `${to * s}px`;
    };
    const up = () => {
      clearTimeout(lp);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved) return engine.seek(tg.start + g.t);
      store.update((dr) => {
        const it = kfTarget(dr, ui.selection)?.find(dr);
        if (it) for (const k of g.keys) moveKey(it, k.path, k.t, to);
      });
      engine.seek(tg.start + to);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function easeMenu(x, y, g) {
    document.querySelector('.kf-menu')?.remove();
    const close = () => {
      menu.remove();
      document.removeEventListener('pointerdown', outside, true);
    };
    const outside = (ev) => !menu.contains(ev.target) && close();
    const cur = g.keys[0].e || 'smooth';
    const menu = h(
      'div',
      { class: 'kf-menu', role: 'menu', style: { left: `${x}px`, top: `${y}px` } },
      h('div', { class: 'muted tiny' }, 'How it moves to the next keyframe'),
      EASES.map(([v, label]) =>
        h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': cur === v ? 'true' : 'false', class: cur === v ? 'on' : '', onclick: () => {
          store.update((dr) => {
            const it = kfTarget(dr, ui.selection)?.find(dr);
            if (!it) return;
            for (const k of g.keys) {
              const kk = it.keys[k.path].find((z) => Math.abs(z.t - k.t) < KEY_EPS);
              if (kk) kk.e = v;
            }
          });
          close();
        } }, label),
      ),
      h('button', { type: 'button', role: 'menuitem', class: 'danger', onclick: () => {
        store.update((dr) => {
          const it = kfTarget(dr, ui.selection)?.find(dr);
          if (it) for (const k of g.keys) removeKey(it, k.path, k.t);
        });
        close();
      } }, 'Delete this keyframe'),
    );
    document.body.append(menu);
    const r = menu.getBoundingClientRect();
    if (r.bottom > innerHeight) menu.style.top = `${Math.max(4, y - r.height)}px`;
    if (r.right > innerWidth) menu.style.left = `${Math.max(4, x - r.width)}px`;
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
    menu.addEventListener('keydown', (ev) => ev.key === 'Escape' && close());
    menu.querySelector('button')?.focus();
  }

  function movePlayhead() {
    playhead.style.left = `${engine.t * pps()}px`;
    const head = heads.querySelector('.ruler-head');
    if (head) head.textContent = formatTime(engine.t);
    if (engine.playing && ui.follow) {
      const x = engine.t * pps();
      if (x > scroller.scrollLeft + scroller.clientWidth - 40 || x < scroller.scrollLeft) scroller.scrollLeft = x - 60;
    }
  }

  // ------------------------------------------------------------ interaction

  // ---- touch: pinch to zoom, two fingers to scroll, one finger on empty space to scroll, long-press for a menu
  const touches = new Map();
  let gesture = null;
  let press = null; // long-press timer
  const isTouchEv = (e) => e.pointerType === 'touch';
  const clearPress = () => {
    clearTimeout(press);
    press = null;
  };
  const fingers = () => {
    const [a, b] = [...touches.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  };
  function startGesture() {
    clearPress();
    drag = null;
    preview = null;
    groupPreview = null;
    const f = fingers();
    gesture = { pps0: ui.pxPerSec, dist0: f.dist, cy0: f.cy, st0: scroller.scrollTop, tc: x2t(f.cx) };
    render();
  }
  function moveGesture() {
    const f = fingers();
    ui.setZoom(pinchZoom(gesture.pps0, gesture.dist0, f.dist, zoomRange().min, ZOOM_MAX), f.cx);
    scroller.scrollLeft = pinchScroll(gesture.tc, ui.pxPerSec, f.cx - scroller.getBoundingClientRect().left);
    scroller.scrollTop = gesture.st0 - (f.cy - gesture.cy0);
  }
  const selFor = (kind, id) => (kind === 'oclip' ? { type: 'clip', id } : kind === 'layer' || kind === 'vizrange' ? { type: 'layer', id } : { type: kind, id });
  /** The multi-selection, or the single selected block as a group of one (what Shift-click adds to). */
  const currentGroup = () => (ui.group && ui.group.length ? ui.group : ui.selection && !['song', 'endcard'].includes(ui.selection.type) ? [ui.selection] : []);
  let marqueeEl = null;
  function drawMarquee(d, cx, cy) {
    if (!marqueeEl) marqueeEl = h('div', { class: 'tl-marquee', 'aria-hidden': 'true' });
    const cr = content.getBoundingClientRect();
    const x1 = Math.min(d.x0, cx);
    const x2 = Math.max(d.x0, cx);
    const y1 = Math.min(d.y0, cy);
    const y2 = Math.max(d.y0, cy);
    Object.assign(marqueeEl.style, { left: `${x1 - cr.left}px`, top: `${y1 - cr.top}px`, width: `${x2 - x1}px`, height: `${y2 - y1}px` });
    if (!marqueeEl.isConnected) content.append(marqueeEl);
    d.hits = [];
    for (const b of content.querySelectorAll('.tl-block')) {
      const { kind, id } = b.dataset;
      if (!kind || kind === 'song' || kind === 'endcard') continue;
      const r = b.getBoundingClientRect();
      const hit = r.right >= x1 && r.left <= x2 && r.bottom >= y1 && r.top <= y2;
      b.classList.toggle('marquee-hit', hit);
      if (hit) d.hits.push(selFor(kind, id));
    }
  }
  function blockMenu(x, y, kind, id) {
    document.querySelector('.kf-menu')?.remove();
    ui.select(selFor(kind, id));
    const close = () => {
      menu.remove();
      document.removeEventListener('pointerdown', outside, true);
    };
    const outside = (ev) => !menu.contains(ev.target) && close();
    const item = (label, fn, cls = '') => h('button', { type: 'button', role: 'menuitem', class: cls, onclick: () => (close(), fn()) }, label);
    const menu = h(
      'div',
      { class: 'kf-menu block-menu', role: 'menu', style: { left: `${x}px`, top: `${y}px` } },
      item('Split at playhead', () => ui.split()),
      item('Duplicate', () => ui.duplicate()),
      item('Copy', () => ui.copy()),
      ui.toggleOff ? item(isOff(store.get(), selFor(kind, id)) ? `Turn on (${OFF_KEY})` : `Turn off (${OFF_KEY})`, () => ui.toggleOff([selFor(kind, id)])) : null,
      item('Settings', () => ui.openSettings && ui.openSettings()),
      item('Delete', () => ui.deleteSelection(), 'danger'),
    );
    document.body.append(menu);
    const r = menu.getBoundingClientRect();
    if (r.bottom > innerHeight) menu.style.top = `${Math.max(4, innerHeight - r.height - 4)}px`;
    if (r.right > innerWidth) menu.style.left = `${Math.max(4, innerWidth - r.width - 4)}px`;
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  }
  content.addEventListener('contextmenu', (e) => {
    if (document.body.classList.contains('touch')) return e.preventDefault();
    // right-click on a block: the same menu a long press opens on touch
    const b = e.target.closest('.tl-block');
    if (!b || !b.dataset.kind) return;
    e.preventDefault();
    blockMenu(e.clientX, e.clientY, b.dataset.kind, b.dataset.id);
  });

  content.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (isTouchEv(e)) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) return startGesture();
      if (touches.size > 2 || gesture) return;
    }
    const p = store.get();
    const blockEl = e.target.closest('.tl-block');
    let edge = e.target.dataset.edge;
    if (isTouchEv(e) && blockEl) {
      // a 44 px target across each edge of the selected block, whatever the drawn handle size
      const r = blockEl.getBoundingClientRect();
      edge = blockEl.querySelector('.tl-handle') ? edgeZone(r.left, r.right, e.clientX, blockEl.classList.contains('selected')) || undefined : undefined;
      if (edge && !blockEl.querySelector(`.tl-handle.${edge}`)) edge = undefined;
    }
    const t0 = x2t(e.clientX);
    try {
      content.setPointerCapture(e.pointerId);
    } catch {
      /* capture is a nicety; drags still work without it */
    }

    const rop = e.target.closest && e.target.closest('[data-op^="range-"]');
    if (rop) {
      const side = rop.dataset.op === 'range-in' ? 'start' : 'end';
      drag = { op: 'range', side, x0: e.clientX, orig: resolveRange(p)[side] };
      return;
    }
    if (e.target.dataset.op === 'duration') {
      drag = { op: 'duration', x0: e.clientX, orig: p.duration };
      return;
    }
    // Shift/Ctrl/Cmd-click (or the Select button, for touch) adds blocks to a multi-selection or takes them out
    const picking = (!isTouchEv(e) && (e.shiftKey || e.ctrlKey || e.metaKey)) || !!ui.multiSelect;
    if (!blockEl) {
      // a finger on empty track space scrolls (a tap still moves the playhead); the ruler and the playhead scrub
      const onRuler = e.target.closest('[data-track]')?.dataset.track === 'ruler';
      const nearHead = Math.abs(e.clientX - playhead.getBoundingClientRect().left) <= (isTouchEv(e) ? 22 : 6);
      if (!onRuler && !nearHead && (!isTouchEv(e) || ui.multiSelect)) {
        // empty track space: a click moves the playhead, a drag draws a box that selects every block it touches
        drag = { op: 'marquee', x0: e.clientX, y0: e.clientY, t0, moved: false, keep: picking, base: picking ? currentGroup() : [] };
        return;
      }
      if (isTouchEv(e) && !onRuler && !nearHead) {
        drag = { op: 'pan', x0: e.clientX, y0: e.clientY, sl: scroller.scrollLeft, st: scroller.scrollTop, t0, moved: false };
        return;
      }
      // ruler or empty track: scrub
      drag = { op: 'scrub' };
      engine.seek(Math.max(0, t0));
      if (e.target.closest('[data-track]')?.dataset.track !== 'ruler') ui.select(null);
      return;
    }
    const { kind, id } = blockEl.dataset;
    const groupable = kind !== 'song' && kind !== 'endcard';
    const bsel = selFor(kind, id);
    if (picking && groupable) edge = undefined;
    const grp = group();
    if (groupable && !edge && (picking || (grp && inGroup(grp, bsel)))) {
      // a block of the multi-selection: a drag moves the whole group, a click (with Shift/Ctrl/Cmd) toggles it
      drag = { op: 'gmove', kind, id, sel: bsel, x0: e.clientX, y0: e.clientY, moved: false, toggle: picking, inG: !!(grp && inGroup(grp, bsel)) };
      return;
    }
    const base = { kind, id, x0: e.clientX, y0: e.clientY, moved: false, edge };
    if (isTouchEv(e)) {
      const cx = e.clientX;
      const cy = e.clientY;
      clearPress();
      press = setTimeout(() => {
        press = null;
        if (!drag || drag.moved || drag.id !== id) return;
        drag = null; // the menu replaces the tap
        blockMenu(cx, cy, kind, id);
      }, 550);
    }
    if (kind === 'clip') {
      const c = p.clips.find((x) => x.id === id);
      drag = { ...base, op: edge ? `trim-${edge}` : 'reorder', orig: { ...c } };
    } else if (kind === 'lyric') {
      const l = p.lyrics.find((x) => x.id === id);
      drag = { ...base, op: edge ? `resize-${edge}` : 'move', orig: { start: songToTimeline(l.start, p.song), end: songToTimeline(l.end, p.song) } };
    } else if (kind === 'text') {
      const tx = p.texts.find((x) => x.id === id);
      drag = { ...base, op: edge ? `resize-${edge}` : 'move', orig: { start: tx.start, end: tx.end } };
    } else if (kind === 'audio') {
      const a = p.audioTracks.find((x) => x.id === id);
      drag = { ...base, op: edge ? `trim-${edge}` : 'move', orig: { ...a } };
    } else if (kind === 'song') {
      // several song parts don't slide as one: they are changed with Song part (Audio tab)
      drag = hasSongParts(p.song) ? { ...base, op: 'select', orig: {} } : { ...base, op: 'song', orig: { offset: p.song.offset } };
    } else if (kind === 'oclip') {
      const L = p.layers.find((x) => x.id === blockEl.dataset.layer);
      const c = L && L.clips.find((x) => x.id === id);
      if (!c) return;
      drag = { ...base, layerId: L.id, op: edge ? `trim-${edge}` : 'move', orig: { ...c } };
    } else if (kind === 'layer') {
      const L = p.layers.find((x) => x.id === id);
      drag = { ...base, op: 'layershift', orig: { start: songToTimeline(L.offset || 0, p.song) } };
    } else if (kind === 'vizrange') {
      const L = p.layers.find((x) => x.id === id);
      const visEnd = p.endCard.enabled ? p.duration - p.endCard.duration : p.duration;
      drag = { ...base, op: edge ? `resize-${edge}` : 'move', orig: { start: L.start || 0, end: L.end ?? visEnd } };
    } else if (kind === 'endcard') {
      drag = { ...base, op: edge ? 'endcard' : 'select', orig: { duration: p.endCard.duration } };
    }
  });

  content.addEventListener('pointermove', (e) => {
    if (isTouchEv(e) && touches.has(e.pointerId)) {
      Object.assign(touches.get(e.pointerId), { x: e.clientX, y: e.clientY });
      if (gesture) return touches.size >= 2 && moveGesture();
    }
    if (!drag) return;
    const s = pps();
    const dx = e.clientX - (drag.x0 ?? e.clientX);
    if (drag.op === 'scrub') {
      engine.seek(Math.max(0, x2t(e.clientX)));
      return;
    }
    if (drag.op === 'pan') {
      if (!drag.moved && Math.hypot(dx, e.clientY - drag.y0) < 8) return;
      drag.moved = true;
      scroller.scrollLeft = drag.sl - dx;
      scroller.scrollTop = drag.st - (e.clientY - drag.y0);
      return;
    }
    // a finger wobbles more than a mouse: it needs a bigger move before a tap turns into a drag
    const slop = isTouchEv(e) ? 8 : 3;
    if (drag.op === 'marquee') {
      if (!drag.moved && Math.hypot(dx, e.clientY - drag.y0) < slop + 1) return;
      drag.moved = true;
      drawMarquee(drag, e.clientX, e.clientY);
      return;
    }
    if (drag.op === 'gmove') {
      if (!drag.moved && Math.abs(dx) < slop) return;
      drag.moved = true;
      const g = group();
      if (!drag.inG || !g) return; // Shift-dragging a block outside the group moves nothing
      const p = store.get();
      const me = spans(p, [drag.sel])[0];
      if (!me) return;
      let dt = dx / s;
      if (!me.main) {
        // snap the dragged block's start, else its end, to edges, the playhead or beats (the group's own blocks excluded)
        const ex = new Set(g.map((x) => x.id));
        const a = me.start + dt;
        let na = snapT(a, ex);
        if (na === a) {
          const b = snapT(me.end + dt, ex);
          if (b !== me.end + dt) na = b - (me.end - me.start);
        }
        dt = na - me.start;
      }
      groupPreview = { plan: planMove(p, g, dt) };
      render();
      return;
    }
    if (!drag.moved && Math.abs(dx) < slop) return;
    if (!drag.moved) clearPress();
    drag.moved = true;
    const dt = dx / s;
    const key = `drag:${drag.op}:${drag.id}`;
    const p = store.get();

    if (drag.op === 'range') {
      // snaps like clips (edges, the playhead, beats); the other flag keeps MIN_RANGE away, the edit's ends hold it in
      const cur = resolveRange(p);
      const lo = drag.side === 'start' ? 0 : cur.start + MIN_RANGE;
      const hi = drag.side === 'start' ? cur.end - MIN_RANGE : p.duration;
      const v = toFrame(clamp(snapT(drag.orig + dt), lo, Math.max(lo, hi)));
      store.update((d) => setRangeSide(d, drag.side, v), `drag:range:${drag.side}`);
    } else if (drag.op === 'duration') {
      const v = clamp(snapT(drag.orig + dt), 3, MAX_LENGTH);
      store.update((d) => (d.duration = +v.toFixed(2)), key);
    } else if (drag.kind === 'clip' && drag.op === 'reorder') {
      preview = { id: drag.id, dx };
      render();
    } else if (drag.kind === 'clip') {
      const rec = media.get(drag.orig.mediaId);
      const speed = drag.orig.speed || 1;
      store.update((d) => {
        const c = d.clips.find((x) => x.id === drag.id);
        if (!c) return;
        if (drag.op === 'trim-r') {
          c.duration = clamp(drag.orig.duration + dt, 0.2, maxClipDuration(drag.orig, rec ? rec.duration : Infinity));
        } else {
          const maxBack = rec && rec.kind === 'video' ? -drag.orig.in / speed : -Infinity;
          const d2 = clamp(dt, Math.max(maxBack, -600), drag.orig.duration - 0.2);
          c.in = rec && rec.kind === 'video' ? Math.max(0, drag.orig.in + d2 * speed) : 0;
          c.duration = drag.orig.duration - d2;
        }
        c.duration = +c.duration.toFixed(3);
      }, key);
    } else if (drag.kind === 'lyric' || drag.kind === 'text') {
      const o = drag.orig;
      let a = o.start;
      let b = o.end;
      if (drag.op === 'move') {
        const len = o.end - o.start;
        a = snapT(o.start + dt, drag.id);
        const snappedEnd = snapT(o.end + dt, drag.id);
        if (snappedEnd !== o.end + dt && a === o.start + dt) a = snappedEnd - len;
        a = Math.max(drag.kind === 'lyric' ? -p.song?.offset || 0 : 0, a);
        b = a + len;
      } else if (drag.op === 'resize-l') {
        a = Math.min(snapT(o.start + dt, drag.id), o.end - 0.15);
      } else {
        b = Math.max(snapT(o.end + dt, drag.id), o.start + 0.15);
      }
      store.update((d) => {
        if (drag.kind === 'lyric') {
          const l = d.lyrics.find((x) => x.id === drag.id);
          if (!l) return;
          l.start = +Math.max(0, timelineToSong(a, d.song)).toFixed(3);
          l.end = +timelineToSong(b, d.song).toFixed(3);
          d.lyricsTimed = markTimed(d.lyricsTimed, 'manual');
        } else {
          const tx = d.texts.find((x) => x.id === drag.id);
          if (!tx) return;
          tx.start = +Math.max(0, a).toFixed(3);
          tx.end = +b.toFixed(3);
        }
      }, key);
    } else if (drag.kind === 'audio') {
      const o = drag.orig;
      const rec = media.get(o.mediaId);
      const srcDur = rec ? rec.duration : Infinity;
      store.update((d) => {
        const a = d.audioTracks.find((x) => x.id === drag.id);
        if (!a) return;
        if (drag.op === 'move') a.start = +Math.max(0, snapT(o.start + dt, o.id)).toFixed(3);
        else if (drag.op === 'trim-r') a.duration = +clamp(snapT(o.start + o.duration + dt, o.id) - o.start, 0.2, srcDur - o.in).toFixed(3);
        else {
          const d2 = clamp(dt, Math.max(-o.in, -o.start), o.duration - 0.2);
          a.start = +(o.start + d2).toFixed(3);
          a.in = +(o.in + d2).toFixed(3);
          a.duration = +(o.duration - d2).toFixed(3);
        }
      }, key);
    } else if (drag.kind === 'oclip') {
      const o = drag.orig;
      const rec = media.get(o.mediaId);
      const speed = o.speed || 1;
      store.update((d) => {
        const L = d.layers.find((x) => x.id === drag.layerId);
        const c = L && L.clips.find((x) => x.id === drag.id);
        if (!c) return;
        if (drag.op === 'move') {
          let a = snapT(o.start + dt, o.id);
          const endSnap = snapT(o.start + o.duration + dt, o.id);
          if (endSnap !== o.start + o.duration + dt && a === o.start + dt) a = endSnap - o.duration;
          c.start = +Math.max(0, a).toFixed(3);
        } else if (drag.op === 'trim-r') {
          c.duration = +clamp(snapT(o.start + o.duration + dt, o.id) - o.start, 0.2, maxClipDuration(o, rec ? rec.duration : Infinity)).toFixed(3);
        } else {
          const maxBack = rec && rec.kind === 'video' ? -o.in / speed : -o.start;
          const d2 = clamp(snapT(o.start + dt, o.id) - o.start, Math.max(maxBack, -o.start), o.duration - 0.2);
          c.start = +(o.start + d2).toFixed(3);
          if (rec && rec.kind === 'video') c.in = +Math.max(0, o.in + d2 * speed).toFixed(3);
          c.duration = +(o.duration - d2).toFixed(3);
        }
      }, key);
    } else if (drag.op === 'layershift') {
      const start = snapT(drag.orig.start + dt, drag.id);
      store.update((d) => {
        const L = d.layers.find((x) => x.id === drag.id);
        if (L) {
          L.offset = +timelineToSong(start, d.song).toFixed(3);
          L.userSync = true;
        }
      }, key);
    } else if (drag.kind === 'vizrange') {
      const o = drag.orig;
      store.update((d) => {
        const L = d.layers.find((x) => x.id === drag.id);
        if (!L) return;
        const visEnd = d.endCard.enabled ? d.duration - d.endCard.duration : d.duration;
        if (drag.op === 'move') {
          const len = o.end - o.start;
          const a = clamp(snapT(o.start + dt, drag.id), 0, Math.max(0, d.duration - len));
          L.start = +a.toFixed(3);
          L.end = Math.abs(a + len - visEnd) < 0.01 ? null : +(a + len).toFixed(3);
        } else if (drag.op === 'resize-l') {
          L.start = +clamp(snapT(o.start + dt, drag.id), 0, o.end - 0.3).toFixed(3);
        } else {
          const b = clamp(snapT(o.end + dt, drag.id), o.start + 0.3, d.duration);
          L.end = Math.abs(b - visEnd) < 0.01 ? null : +b.toFixed(3);
        }
      }, key);
    } else if (drag.op === 'song') {
      const rec = media.get(p.song.mediaId);
      const maxOff = Math.max(0, (rec ? rec.duration : 0) - 1);
      store.update((d) => (d.song.offset = +clamp(drag.orig.offset - dt, 0, maxOff).toFixed(2)), key);
    } else if (drag.op === 'endcard') {
      store.update((d) => (d.endCard.duration = +clamp(drag.orig.duration - dt, 1, d.duration).toFixed(2)), key);
    }
  });

  const endDrag = (e) => {
    if (isTouchEv(e)) {
      touches.delete(e.pointerId);
      if (!touches.size) gesture = null;
    }
    clearPress();
    if (!drag) return;
    const d0 = drag;
    drag = null;
    try {
      content.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
    if (d0.op === 'pan') {
      if (!d0.moved && e.type === 'pointerup') {
        engine.seek(Math.max(0, d0.t0));
        ui.select(null);
      }
      return;
    }
    if (d0.op === 'marquee') {
      if (marqueeEl) marqueeEl.remove();
      if (e.type !== 'pointerup') return render();
      if (!d0.moved) {
        engine.seek(Math.max(0, d0.t0));
        if (!d0.keep) ui.select(null);
        return;
      }
      let list = d0.base;
      for (const hs of d0.hits || []) if (!inGroup(list, hs)) list = [...list, hs];
      return ui.setGroup(list);
    }
    if (d0.op === 'gmove') {
      const gp = groupPreview;
      groupPreview = null;
      const g = group();
      if (!d0.moved) {
        if (e.type !== 'pointerup') return render();
        return d0.toggle ? ui.setGroup(toggleIn(currentGroup(), d0.sel)) : ui.select(d0.sel);
      }
      if (!gp || !g || e.type !== 'pointerup') return render();
      if (gp.plan.error) {
        toast(gp.plan.error);
        return render();
      }
      if (!gp.plan.delta && gp.plan.insertAt == null) return render();
      store.update((d) => applyMove(d, g, gp.plan)); // the whole group in one undo step
      return render();
    }
    if (d0.op === 'scrub' || d0.op === 'duration') return;
    if (!d0.moved) {
      if (d0.kind === 'oclip') ui.select({ type: 'clip', id: d0.id });
      else if (d0.kind === 'layer' || d0.kind === 'vizrange') ui.select({ type: 'layer', id: d0.id });
      else ui.select({ type: d0.kind, id: d0.id });
      return;
    }
    if (d0.kind === 'clip' && d0.op === 'reorder') {
      const p = store.get();
      const laid = layoutClips(p.clips);
      const me = laid.find((l) => l.clip.id === d0.id);
      preview = null;
      if (!me) return render();
      const center = (me.start + me.end) / 2 + (e.clientX - d0.x0) / pps();
      let idx = laid.filter((l) => l.clip.id !== d0.id && (l.start + l.end) / 2 < center).length;
      store.update((d) => {
        const from = d.clips.findIndex((c) => c.id === d0.id);
        const [c] = d.clips.splice(from, 1);
        d.clips.splice(idx, 0, c);
      });
      ui.select({ type: 'clip', id: d0.id });
    }
  };
  content.addEventListener('pointerup', endDrag);
  content.addEventListener('pointercancel', endDrag);

  // keyboard: Enter selects a focused block
  content.addEventListener('keydown', (e) => {
    const b = e.target.closest && e.target.closest('.tl-block');
    if (b && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      e.stopPropagation();
      const bs = selFor(b.dataset.kind, b.dataset.id);
      if (e.shiftKey && !['song', 'endcard'].includes(bs.type)) ui.setGroup(toggleIn(currentGroup(), bs));
      else ui.select(bs);
    }
  });

  // ctrl/cmd + wheel zooms around the pointer
  scroller.addEventListener(
    'wheel',
    (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      ui.setZoom(ui.pxPerSec * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX);
    },
    { passive: false },
  );

  scroller.addEventListener('scroll', () => {
    heads.scrollTop = scroller.scrollTop;
    // scrolled far enough that the drawn blocks no longer cover the view with room to spare: draw the ones now near.
    // Done in the scroll event itself (before the next paint) so there is never a frame with a gap.
    if ((!drag || drag.op === 'pan') && Math.abs(scroller.scrollLeft - win.at) > 0.6 * (win.w || WIN_MIN_PX)) render();
  });

  /** Zoom limits in px per second for this edit in this window: zoomed out fully, the whole edit fits. */
  function zoomRange() {
    const d = store.get().duration;
    const w = scroller.clientWidth;
    return { min: zoomMin(d, w), max: ZOOM_MAX, fit: fitZoom(d, w) };
  }
  /**
   * Where a zoom should stay put: the moment under `clientX` (mouse or pinch), else the playhead while it is in
   * view, else the middle of the view. Returns the time and its offset from the left of the view.
   */
  function zoomAnchor(clientX) {
    const left = scroller.getBoundingClientRect().left;
    if (clientX != null) return { t: Math.max(0, x2t(clientX)), off: clientX - left };
    const x = engine.t * pps() - scroller.scrollLeft;
    if (x >= 0 && x <= scroller.clientWidth) return { t: engine.t, off: x };
    const off = scroller.clientWidth / 2;
    return { t: (scroller.scrollLeft + off) / pps(), off };
  }

  return { render, movePlayhead, scroller, HEAD_W, zoomRange, zoomAnchor };
}
