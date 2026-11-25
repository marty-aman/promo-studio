// Exact video frames for the fast export: a clip's file is read once (MP4/MOV with the vendored mp4box, WebM with
// the small reader in webmdemux.js) and decoded in order with WebCodecs. Seeking a <video> to every frame costs a
// full decoder restart each time (about 60 ms a frame at 1080p), which made a fast export slower than real time.
// A file this cannot read or decode returns null and the export seeks its <video> as before.
// The file is read in pieces (`reader`): MP4/MOV boxes until the sample table is known, then each frame's bytes
// as it is decoded, so a linked multi-GB camera file is never held in memory.
// shortcut: a WebM file is still read whole (and skipped above WEBM_MAX); MP4 edit lists are not applied (the
// first shown frame is time 0, which is what a <video> shows for nearly every camera file).
import { parseWebm } from './webmdemux.js';
import { pickFrame, keyBefore } from './exportplan.js';
import { linkedReader } from './desktop.js';

const CHUNK = 4 * 1024 * 1024; // bytes read at a time while looking for the sample table
const BATCH = 8 * 1024 * 1024; // frame bytes read in one go while decoding
const WEBM_MAX = 1024 * 1024 * 1024;

/** A reader over a Blob: { size, read(start, end) -> Promise<Uint8Array> } (end exclusive). */
export const blobReader = (blob) => ({ size: blob.size, read: async (start, end) => new Uint8Array(await blob.slice(start, end).arrayBuffer()) });

/**
 * The MP4/MOV sample table, reading `reader` in chunks from wherever mp4box asks next (a file with its index at
 * the end skips the media data). Resolves { file, info } once the index is read (and, for a fragmented file,
 * every fragment), or null.
 */
export async function readMp4Index(reader, mp4box) {
  const { createFile, MP4BoxBuffer } = mp4box;
  const file = createFile(); // media data is skipped; frame bytes are read later by offset
  let info = null;
  file.onReady = (i) => (info = i);
  file.onError = () => {};
  let pos = 0;
  for (let guard = 0; guard < 100000 && pos < reader.size; guard++) {
    const bytes = await reader.read(pos, Math.min(reader.size, pos + CHUNK));
    if (!bytes.length) break;
    const ab = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer;
    const last = pos + bytes.length >= reader.size;
    const next = file.appendBuffer(MP4BoxBuffer.fromArrayBuffer(ab, pos), last);
    if (info && !info.isFragmented) break;
    pos = next > pos ? next : pos + bytes.length;
  }
  file.flush();
  return info ? { file, info } : null;
}

/** The video track of a file: { codec, description, width, height, rotation, samples: [{ ts, key, offset, size }], reader } or null. */
async function demux(reader) {
  const head = await reader.read(0, Math.min(12, reader.size));
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    if (reader.size > WEBM_MAX) return null; // the export seeks the <video> instead
    return parseWebm(await reader.read(0, reader.size));
  }
  if (String.fromCharCode(...head.slice(4, 8)) !== 'ftyp') return null;
  const mp4box = await import('../vendor/mp4box/mp4box.all.mjs');
  const { DataStream, Endianness } = mp4box;
  const idx = await readMp4Index(reader, mp4box);
  const vt = idx && idx.info.videoTracks[0];
  if (!vt) return null;
  const trak = idx.file.getTrackById(vt.id);
  const all = (trak && trak.samples) || [];
  if (!all.length) return null;
  let description;
  for (const entry of trak.mdia.minf.stbl.stsd.entries) {
    const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
    if (!box) continue;
    const s = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
    box.write(s);
    description = new Uint8Array(s.buffer, 8); // without the box's own 8-byte header
    break;
  }
  // the first frame shown is time 0, as a <video> shows it (B-frames start their stamps a little later)
  const t0 = Math.min(...all.map((x) => x.cts));
  const m = vt.matrix || [];
  const rotation = (Math.round((Math.atan2(m[1] || 0, m[0] || 65536) * 180) / Math.PI / 90) * 90 + 360) % 360;
  const decodeOrder = all.map((x) => ({ ts: (x.cts - t0) / x.timescale, key: x.is_sync, offset: x.offset, size: x.size, data: null }));
  return {
    codec: vt.codec,
    description,
    width: vt.video ? vt.video.width : vt.track_width,
    height: vt.video ? vt.video.height : vt.track_height,
    rotation,
    samples: [...decodeOrder].sort((a, b) => a.ts - b.ts),
    decodeOrder,
    reader,
  };
}

/** Read the bytes of samples order[i..] that are still missing, up to BATCH bytes in one read. */
export async function fillSamples(order, i, reader) {
  const first = order[i];
  if (!first || first.data || !reader) return;
  let j = i;
  let end = first.offset + first.size;
  // neighbours that sit right after each other in the file come in the same read
  while (j + 1 < order.length && !order[j + 1].data && order[j + 1].offset >= end && order[j + 1].offset - end < 65536 && order[j + 1].offset + order[j + 1].size - first.offset <= BATCH) {
    j++;
    end = order[j].offset + order[j].size;
  }
  const bytes = await reader.read(first.offset, end);
  for (let k = i; k <= j; k++) {
    const s = order[k];
    const a = s.offset - first.offset;
    s.data = bytes.subarray(a, a + s.size);
  }
}

const tracks = new Map(); // mediaId -> Promise<track | null>, for one export
export const clearTracks = () => tracks.clear();

/** A frame source for one clip, or null when the file cannot be decoded here (the export seeks its <video>). */
export async function openFrames(rec) {
  if (!rec) return null;
  const reader = rec.blob ? blobReader(rec.blob) : rec.linked && rec.size > 0 && window.desktop ? linkedReader(rec.id, rec.size) : null;
  if (!reader) return null;
  if (!tracks.has(rec.id)) tracks.set(rec.id, demux(reader).catch((e) => (console.warn('Fast export: could not read', rec.name, e), null)));
  const track = await tracks.get(rec.id);
  if (!track || !window.VideoDecoder) return null;
  const config = { codec: track.codec, codedWidth: track.width, codedHeight: track.height, ...(track.description ? { description: track.description } : {}) };
  try {
    if (!(await VideoDecoder.isConfigSupported(config)).supported) return null;
  } catch {
    return null;
  }
  return new FrameSource(track, config);
}

class FrameSource {
  constructor(track, config) {
    this.track = track;
    this.config = config;
    // samples in decode order (MP4 keeps it; WebM is already in it)
    this.order = track.decodeOrder || track.samples;
    this.dec = null;
    this.frames = []; // decoded, in time order, not yet passed
    this.canvas = document.createElement('canvas');
    const turn = track.rotation % 180 !== 0;
    this.canvas.width = turn ? track.height : track.width;
    this.canvas.height = turn ? track.width : track.height;
    this.shown = null;
    this.lastT = -Infinity;
    this.err = null;
  }

  _reset(t) {
    this.close();
    this.err = null;
    this.dec = new VideoDecoder({
      output: (f) => {
        this.frames.push(f);
        this.frames.sort((a, b) => a.timestamp - b.timestamp);
        this._wake && this._wake();
      },
      error: (e) => ((this.err = e), this._wake && this._wake()),
    });
    this.dec.configure(this.config);
    this.dec.addEventListener('dequeue', () => this._wake && this._wake());
    // start from the key frame at or before t (in decode order)
    this.next = keyBefore(this.order, t);
    this.flushed = false;
  }

  _wait() {
    return new Promise((resolve) => {
      const timer = setTimeout(() => ((this._wake = null), resolve()), 3000);
      this._wake = () => (clearTimeout(timer), (this._wake = null), resolve());
    });
  }

  /** The canvas showing the clip's frame at file time t (seconds), or null if the file failed to decode.
   *  Times mostly go forward, one frame at a time. */
  async frameAt(t) {
    const eps = 1e-4;
    // a jump back (a loop, a second use of the clip) or far ahead starts again from a key frame
    if (!this.dec || this.err || t < this.lastT - 0.1 || t > this.lastT + 2) this._reset(t);
    t = Math.max(t, this.lastT);
    this.lastT = t;
    for (let guard = 0; guard < 100000; guard++) {
      while (this.frames.length > 1 && this.frames[1].timestamp / 1e6 <= t + eps) this.frames.shift().close();
      const last = this.frames[this.frames.length - 1];
      if (this.err || (last && last.timestamp / 1e6 > t + eps)) break;
      if (this.next < this.order.length && this.dec.decodeQueueSize < 3) {
        if (!this.order[this.next].data) await fillSamples(this.order, this.next, this.track.reader);
        const s = this.order[this.next++];
        this.dec.decode(new EncodedVideoChunk({ type: s.key ? 'key' : 'delta', timestamp: Math.round(s.ts * 1e6), data: s.data }));
        if (this.track.reader && s.offset != null) s.data = null; // read again if a jump back needs it: memory stays small
        continue;
      }
      if (this.dec.decodeQueueSize > 0) {
        await this._wait();
        continue;
      }
      if (this.next < this.order.length) continue;
      if (this.flushed) break;
      this.flushed = true; // the end of the file: let the decoder give back what it still holds
      await this.dec.flush().catch(() => {});
    }
    if (this.err) return null; // the caller seeks the clip's <video> instead
    const f = pickFrame(this.frames.map((x) => x.timestamp / 1e6), t);
    const frame = f >= 0 ? this.frames[f] : null;
    if (frame && frame.timestamp !== this.shown) {
      const g = this.canvas.getContext('2d');
      const { width: cw, height: ch } = this.canvas;
      const fw = this.track.rotation % 180 ? ch : cw;
      const fh = this.track.rotation % 180 ? cw : ch;
      g.save();
      g.translate(cw / 2, ch / 2);
      if (this.track.rotation) g.rotate((this.track.rotation * Math.PI) / 180);
      g.drawImage(frame, -fw / 2, -fh / 2, fw, fh);
      g.restore();
      this.shown = frame.timestamp;
    }
    return this.canvas;
  }

  close() {
    for (const f of this.frames) f.close();
    this.frames = [];
    if (this.dec && this.dec.state !== 'closed') this.dec.close();
    this.dec = null;
  }
}
