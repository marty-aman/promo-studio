// Multi-track timeline: ruler, video lane, text, lyrics, song, extra audio and end card.
import { layoutClips, songToTimeline, timelineToSong, snap, clamp, formatTime, maxClipDuration, ctaText } from './core.js';
import { media } from './media.js';
import { h } from './dom.js';

const HEAD_W = 112;

export function createTimeline({ root, store, engine, ui }) {
  const heads = h('div', { class: 'tl-heads' });
  const content = h('div', { class: 'tl-content' });
  const scroller = h('div', { class: 'tl-scroll' }, content);
  const playhead = h('div', { class: 'tl-playhead' }, h('div', { class: 'tl-playhead-knob' }));
  const body = h('div', { class: 'tl-body' }, heads, scroller);
  root.append(body);

  let drag = null; // active drag operation
  let preview = null; // transient visual offset for clip reordering

  const pps = () => ui.pxPerSec;
  const x2t = (clientX) => (clientX - content.getBoundingClientRect().left) / pps();

  function snapCandidates(excludeId) {
    const p = store.get();
    const c = [0, p.duration, engine.t];
    for (const l of layoutClips(p.clips)) c.push(l.start, l.end);
    for (const l of p.lyrics) if (l.id !== excludeId) c.push(songToTimeline(l.start, p.song), songToTimeline(l.end, p.song));
    for (const tx of p.texts) if (tx.id !== excludeId) c.push(tx.start, tx.end);
    for (const a of p.audioTracks) if (a.id !== excludeId) c.push(a.start, a.start + a.duration);
    if (p.endCard.enabled) c.push(p.duration - p.endCard.duration);
    if (p.beats) for (const b of p.beats.beats) c.push(songToTimeline(b, p.song));
    return c;
  }
  const snapT = (t, excludeId) => (ui.snap ? snap(t, snapCandidates(excludeId), 8 / pps()) : t);

  // ------------------------------------------------------------ rendering

  function block({ cls, left, width, label, sub, selected, data, handles = 'both', style = {} }) {
    const el = h(
      'div',
      {
        class: `tl-block ${cls}${selected ? ' selected' : ''}`,
        style: { left: `${left}px`, width: `${Math.max(4, width)}px`, ...style },
        dataset: data,
        title: label,
        role: 'button',
        tabindex: '0',
        'aria-pressed': selected ? 'true' : 'false',
      },
      h('span', { class: 'tl-label' }, label),
      sub ? h('span', { class: 'tl-sub' }, sub) : null,
    );
    if (handles === 'both' || handles === 'left') el.append(h('div', { class: 'tl-handle l', dataset: { edge: 'l' } }));
    if (handles === 'both' || handles === 'right') el.append(h('div', { class: 'tl-handle r', dataset: { edge: 'r' } }));
    return el;
  }

  function waveformCanvas(rec, fromSec, toSec, width, height, color) {
    const c = h('canvas', { class: 'tl-wave' });
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.min(8000, Math.round(width)));
    c.width = Math.round(w * dpr);
    c.height = Math.round(height * dpr);
    c.style.width = `${w}px`;
    c.style.height = `${height}px`;
    if (!rec || !rec.peaks) return c;
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
    const s = pps();
    const total = p.duration;
    const width = Math.max(scroller.clientWidth, (total + 4) * s);
    content.style.width = `${width}px`;
    content.replaceChildren();
    heads.replaceChildren(h('div', { class: 'tl-head ruler-head' }, formatTime(engine.t)));
    const sel = ui.selection;
    const rows = [];
    const addRow = (name, cls, height, fill) => {
      const row = h('div', { class: `tl-track ${cls}`, style: { height: `${height}px` }, dataset: { track: cls } });
      fill(row);
      content.append(row);
      heads.append(h('div', { class: `tl-head ${cls}`, style: { height: `${height}px` } }, name));
      rows.push(row);
    };

    // ruler
    const ruler = h('div', { class: 'tl-ruler', dataset: { track: 'ruler' } });
    const step = s > 120 ? 0.5 : s > 50 ? 1 : s > 20 ? 2 : 5;
    for (let t = 0; t <= total + 4; t += step) {
      const major = Math.abs(t / (step * 2) - Math.round(t / (step * 2))) < 1e-6 || step >= 5;
      ruler.append(
        h('div', { class: `tick${major ? ' major' : ''}`, style: { left: `${t * s}px` } }, major ? h('span', {}, formatTime(t, false)) : null),
      );
    }
    if (p.beats) {
      for (const b of p.beats.beats) {
        const bt = songToTimeline(b, p.song);
        if (bt >= 0 && bt <= total) ruler.append(h('div', { class: 'beat', style: { left: `${bt * s}px` } }));
      }
    }
    ruler.append(h('div', { class: 'tl-outside', style: { left: `${total * s}px` } }));
    ruler.append(h('div', { class: 'tl-end-handle', style: { left: `${total * s}px` }, dataset: { op: 'duration' }, title: 'Drag to change the video length' }));
    content.append(ruler);

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
          label: rec ? rec.name : 'Missing media',
          sub: `${l.clip.duration.toFixed(1)}s${l.clip.speed && l.clip.speed !== 1 ? ` · ${l.clip.speed}×` : ''}`,
          selected: sel && sel.type === 'clip' && sel.id === l.clip.id,
          data: { kind: 'clip', id: l.clip.id },
          style: rec && rec.thumb ? { backgroundImage: `linear-gradient(rgba(10,20,40,.55),rgba(10,20,40,.55)), url(${rec.thumb})` } : {},
        });
        if (preview && preview.id === l.clip.id) {
          el.style.transform = `translateX(${preview.dx}px)`;
          el.classList.add('dragging');
        }
        if (l.clip.transition && l.clip.transition.type !== 'none') el.append(h('div', { class: 'tl-trans', title: `Transition: ${l.clip.transition.type}` }));
        row.append(el);
      });
    });

    // text overlays
    const tl = lanes(p.texts, (x) => x.start, (x) => x.end);
    addRow('Text', 'text', Math.max(30, tl.count * 26 + 4), (row) => {
      for (const tx of p.texts) {
        row.append(
          block({
            cls: 'txt',
            left: tx.start * s,
            width: (tx.end - tx.start) * s,
            label: tx.text || '(empty)',
            selected: sel && sel.type === 'text' && sel.id === tx.id,
            data: { kind: 'text', id: tx.id },
            style: { top: `${2 + tl.map.get(tx.id) * 26}px`, height: '24px' },
          }),
        );
      }
    });

    // lyrics
    addRow('Lyrics', 'lyrics', 40, (row) => {
      if (!p.lyrics.length) row.append(h('div', { class: 'tl-empty' }, 'Paste lyrics in the Lyrics tab'));
      for (const l of p.lyrics) {
        const a = songToTimeline(l.start, p.song);
        const b = songToTimeline(l.end, p.song);
        if (b < 0 || a > total + 4) continue;
        row.append(
          block({
            cls: 'lyr',
            left: a * s,
            width: (b - a) * s,
            label: l.text,
            selected: sel && sel.type === 'lyric' && sel.id === l.id,
            data: { kind: 'lyric', id: l.id },
          }),
        );
      }
    });

    // song
    addRow('Song', 'song', 46, (row) => {
      const rec = p.song && media.get(p.song.mediaId);
      if (!rec) {
        row.append(h('div', { class: 'tl-empty' }, 'Choose your song in the Audio tab'));
        return;
      }
      const songDur = rec.duration || total;
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
      el.prepend(waveformCanvas(rec, from, to, (to - from) * s, 44, 'rgba(110,231,160,.55)'));
      row.append(el);
    });

    // extra audio
    p.audioTracks.forEach((a, i) => {
      addRow(`Audio ${i + 1}`, 'audio', 40, (row) => {
        const rec = media.get(a.mediaId);
        const el = block({
          cls: 'aud',
          left: a.start * s,
          width: a.duration * s,
          label: rec ? rec.name : 'Missing audio',
          selected: sel && sel.type === 'audio' && sel.id === a.id,
          data: { kind: 'audio', id: a.id },
        });
        if (rec) el.prepend(waveformCanvas(rec, a.in, a.in + a.duration, a.duration * s, 38, 'rgba(94,234,212,.5)'));
        row.append(el);
      });
    });

    // end card
    addRow('End card', 'endcard', 32, (row) => {
      if (!p.endCard.enabled) {
        row.append(h('div', { class: 'tl-empty' }, 'End card off'));
        return;
      }
      const start = total - p.endCard.duration;
      row.append(
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
    });

    playhead.style.left = `${engine.t * s}px`;
    content.append(playhead);
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

  content.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const p = store.get();
    const blockEl = e.target.closest('.tl-block');
    const edge = e.target.dataset.edge;
    const t0 = x2t(e.clientX);
    try {
      content.setPointerCapture(e.pointerId);
    } catch {
      /* capture is a nicety; drags still work without it */
    }

    if (e.target.dataset.op === 'duration') {
      drag = { op: 'duration', x0: e.clientX, orig: p.duration };
      return;
    }
    if (!blockEl) {
      // ruler or empty track: scrub
      drag = { op: 'scrub' };
      engine.seek(Math.max(0, t0));
      if (e.target.closest('[data-track]')?.dataset.track !== 'ruler') ui.select(null);
      return;
    }
    const { kind, id } = blockEl.dataset;
    const base = { kind, id, x0: e.clientX, moved: false, edge };
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
      drag = { ...base, op: 'song', orig: { offset: p.song.offset } };
    } else if (kind === 'endcard') {
      drag = { ...base, op: edge ? 'endcard' : 'select', orig: { duration: p.endCard.duration } };
    }
  });

  content.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const s = pps();
    const dx = e.clientX - (drag.x0 ?? e.clientX);
    if (drag.op === 'scrub') {
      engine.seek(Math.max(0, x2t(e.clientX)));
      return;
    }
    if (!drag.moved && Math.abs(dx) < 3) return;
    drag.moved = true;
    const dt = dx / s;
    const key = `drag:${drag.op}:${drag.id}`;
    const p = store.get();

    if (drag.op === 'duration') {
      const v = clamp(snapT(drag.orig + dt), 3, 600);
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
    } else if (drag.op === 'song') {
      const rec = media.get(p.song.mediaId);
      const maxOff = Math.max(0, (rec ? rec.duration : 0) - 1);
      store.update((d) => (d.song.offset = +clamp(drag.orig.offset - dt, 0, maxOff).toFixed(2)), key);
    } else if (drag.op === 'endcard') {
      store.update((d) => (d.endCard.duration = +clamp(drag.orig.duration - dt, 1, d.duration).toFixed(2)), key);
    }
  });

  const endDrag = (e) => {
    if (!drag) return;
    const d0 = drag;
    drag = null;
    try {
      content.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
    if (d0.op === 'scrub' || d0.op === 'duration') return;
    if (!d0.moved) {
      ui.select({ type: d0.kind, id: d0.id });
      if (d0.kind !== 'song' && d0.kind !== 'endcard') return;
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
      ui.select({ type: b.dataset.kind, id: b.dataset.id });
    }
  });

  // ctrl/cmd + wheel zooms around the pointer
  scroller.addEventListener(
    'wheel',
    (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const t = x2t(e.clientX);
      const before = e.clientX - scroller.getBoundingClientRect().left;
      ui.setZoom(ui.pxPerSec * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
      scroller.scrollLeft = t * ui.pxPerSec - before;
    },
    { passive: false },
  );

  scroller.addEventListener('scroll', () => {
    heads.scrollTop = scroller.scrollTop;
  });

  return { render, movePlayhead, scroller, HEAD_W };
}
