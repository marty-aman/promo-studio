// Batch export: many short promos from one song (playbook: "batch 20-30 clips per song") or from one
// music video ("cut the music video into 5-10 clips"). Sections are the loudest non-overlapping windows
// of the song, each exported with the current look, then bundled into one .zip (no dependencies).

/**
 * Start times (s) of the `count` loudest non-overlapping windows of `len` seconds.
 * `gap` keeps sections apart so the clips don't all repeat the same chorus bar.
 */
export function loudestSections(env, rate, len, count, { gap = 0, total = env.length / rate } = {}) {
  const w = Math.max(1, Math.round(len * rate));
  if (env.length <= w) return [0];
  const sums = new Float64Array(env.length - w + 1);
  let s = 0;
  for (let i = 0; i < w; i++) s += env[i];
  sums[0] = s;
  for (let i = w; i < env.length; i++) {
    s += env[i] - env[i - w];
    sums[i - w + 1] = s;
  }
  const order = [...sums.keys()].sort((a, b) => sums[b] - sums[a]);
  const picks = [];
  const minDist = w + Math.round(gap * rate);
  for (const i of order) {
    if (picks.every((p) => Math.abs(p - i) >= minDist)) picks.push(i);
    if (picks.length >= count) break;
  }
  return picks.map((i) => Math.min(Math.floor((i / rate) * 10) / 10, Math.max(0, total - len))).sort((a, b) => a - b);
}

/** Evenly spread start times across a long video (fallback when there's no audio envelope). */
export function evenSections(total, len, count) {
  if (total <= len) return [0];
  const n = Math.max(1, Math.min(count, Math.floor(total / len)));
  const step = (total - len) / Math.max(1, n - 1);
  return Array.from({ length: n }, (_, i) => +(i * step).toFixed(1));
}

/**
 * The plan: [{ label, songOffset, mvIn }]. mode 'song' moves the song section; mode 'mv' also moves a
 * music-video clip (`mv`: {id, duration, envelope?, envRate?}) so picture and sound stay together.
 */
export function planBatch({ mode = 'song', song = null, mv = null, len = 15, count = 10 }) {
  const fmt = (t) => `${Math.floor(t / 60)}m${String(Math.floor(t % 60)).padStart(2, '0')}s`;
  if (mode === 'mv' && mv) {
    const src = mv.envelope ? mv : song && song.envelope ? song : null;
    const starts = src ? loudestSections(src.envelope, src.envRate || 100, len, count, { gap: 2, total: mv.duration }) : evenSections(mv.duration, len, count);
    return starts.map((t, i) => ({ label: `mv-${String(i + 1).padStart(2, '0')}-${fmt(t)}`, songOffset: t, mvIn: t }));
  }
  if (!song || !song.envelope) return [];
  return loudestSections(song.envelope, song.envRate || 100, len, count, { gap: 1, total: song.duration }).map((t, i) => ({ label: `clip-${String(i + 1).padStart(2, '0')}-${fmt(t)}`, songOffset: t, mvIn: null }));
}

/** The music video as one main-track clip from `inT` seconds into it; its own sound off while the song plays. */
export const mvClip = (mvId, inT, duration, volume = 0) => ({
  id: `batch-mv`, mediaId: mvId, kind: 'video', in: inT, duration: +duration.toFixed(2), speed: 1, fit: 'cover', zoom: 1, panX: 0, panY: 0, rotate: 0, flip: false,
  volume, filter: { preset: 'none', adjust: {} }, transition: { type: 'none', duration: 0.3 }, kenBurns: null, effects: {},
});

/** Apply one batch item to a project draft. */
export function applyBatchItem(d, item, { len, mvId = null, mvDuration = 0 }) {
  if (d.song) {
    d.song.offset = item.songOffset;
    delete d.song.parts; // each item is one stretch of the song
    delete d.song.join;
  }
  d.duration = +(len + (d.endCard.enabled ? d.endCard.duration : 0)).toFixed(2);
  // the music video plays in sync with the song section; its own sound stays muted (the song plays)
  if (mvId) d.clips = [mvClip(mvId, item.mvIn, Math.min(len, Math.max(0.5, mvDuration - item.mvIn)), d.song ? 0 : 1)];
}

// ------------------------------------------------------------ zip (stored, no compression)

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** files: [{ name, bytes: Uint8Array }] -> Uint8Array of a .zip (store method, UTF-8 names). */
export function zipStore(files, date = new Date()) {
  const enc = new TextEncoder();
  const dosTime = ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.bytes);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true);
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, f.bytes.length, true);
    local.setUint32(22, f.bytes.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, f.bytes);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(12, dosTime, true);
    cd.setUint16(14, dosDate, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, f.bytes.length, true);
    cd.setUint32(24, f.bytes.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + f.bytes.length;
  }
  const cdSize = central.reduce((s, b) => s + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, b) => s + b.length, 0));
  let p = 0;
  for (const b of all) {
    out.set(b, p);
    p += b.length;
  }
  return out;
}

// ------------------------------------------------------------ calendar (.ics)

/** A posting schedule: `perWeek` posts a week for `weeks` weeks from `start` (Date), at `hour` local. */
export function postingSchedule(start, perWeek = 4, weeks = 6, hour = 18) {
  const days = { 3: [0, 2, 4], 4: [0, 1, 3, 5], 5: [0, 1, 2, 4, 5] }[perWeek] || [0, 2, 4];
  const out = [];
  for (let w = 0; w < weeks; w++) {
    for (const off of days) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + off, hour, 0, 0);
      out.push(d);
    }
  }
  return out;
}

const icsDate = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`;
const icsText = (s) => String(s).replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');

/** events: [{ date, title, note }] -> .ics text (floating local times, 30-minute slots). */
export function toICS(events, calName = 'Band Manager posting plan') {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Band Manager//Posting plan//EN', `X-WR-CALNAME:${icsText(calName)}`];
  events.forEach((e, i) => {
    const end = new Date(e.date.getTime() + 30 * 60000);
    lines.push('BEGIN:VEVENT', `UID:promo-${icsDate(e.date)}-${i}@promo-studio`, `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(e.date)}`, `DTEND:${icsDate(end)}`, `SUMMARY:${icsText(e.title)}`, `DESCRIPTION:${icsText(e.note || '')}`, 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
