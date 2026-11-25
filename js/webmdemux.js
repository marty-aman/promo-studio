// A small WebM (Matroska) reader for the fast export: the first video track's codec, size and its frames in
// file order. Pure (unit tested). Handles the unknown-size Segment and Cluster that browser recordings write.
// shortcut: laced blocks (used for audio, not video) and video in BlockGroups with lacing are not read; such a
// file returns null and the export seeks its <video> instead.

const ID = {
  Segment: 0x18538067,
  Info: 0x1549a966,
  TimecodeScale: 0x2ad7b1,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackNumber: 0xd7,
  TrackType: 0x83,
  CodecID: 0x86,
  CodecPrivate: 0x63a2,
  Video: 0xe0,
  PixelWidth: 0xb0,
  PixelHeight: 0xba,
  Cluster: 0x1f43b675,
  Timecode: 0xe7,
  SimpleBlock: 0xa3,
  BlockGroup: 0xa0,
  Block: 0xa1,
  ReferenceBlock: 0xfb,
};
// elements whose children we read in place (so an unknown size does not matter)
const MASTER = new Set([ID.Segment, ID.Info, ID.Tracks, ID.TrackEntry, ID.Video, ID.Cluster, ID.BlockGroup]);

/** A variable-length integer at `p`: { value, len } (`keepMarker` for element IDs); value -1 = unknown size. */
export function vint(b, p, keepMarker = false) {
  const first = b[p];
  if (first === undefined) return null;
  let len = 1;
  while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++;
  if (len > 8 || p + len > b.length) return null;
  let value = keepMarker ? first : first & (0xff >> len);
  let allOnes = value === 0xff >> len;
  for (let i = 1; i < len; i++) {
    value = value * 256 + b[p + i];
    if (b[p + i] !== 0xff) allOnes = false;
  }
  return { value: !keepMarker && allOnes ? -1 : value, len };
}

const uint = (b, p, n) => {
  let v = 0;
  for (let i = 0; i < n; i++) v = v * 256 + b[p + i];
  return v;
};
const CODECS = { V_VP8: 'vp8', V_VP9: 'vp09.00.10.08', V_AV1: 'av01.0.08M.08' };

/** Parse a WebM file (Uint8Array) into { codec, width, height, rotation: 0, samples: [{ ts, key, data }] } or null. */
export function parseWebm(b) {
  let scale = 1e6; // ns per timecode tick
  const tracks = [];
  let track = null;
  let cluster = 0;
  const blocks = []; // [trackNumber, timecode, key, data]
  let group = null;
  let p = 0;
  while (p < b.length) {
    const id = vint(b, p, true);
    if (!id) break;
    const size = vint(b, p + id.len);
    if (!size) break;
    const at = p + id.len + size.len;
    const end = size.value < 0 ? b.length : Math.min(b.length, at + size.value);
    if (group && id.value !== ID.Block && id.value !== ID.ReferenceBlock && !(p < group.end)) group = null;
    if (MASTER.has(id.value)) {
      if (id.value === ID.TrackEntry) tracks.push((track = {}));
      if (id.value === ID.BlockGroup) group = { end, block: null };
      p = at;
      continue;
    }
    if (size.value < 0) return null; // a leaf must have a size
    switch (id.value) {
      case ID.TimecodeScale:
        scale = uint(b, at, size.value);
        break;
      case ID.TrackNumber:
        if (track) track.number = uint(b, at, size.value);
        break;
      case ID.TrackType:
        if (track) track.type = uint(b, at, size.value);
        break;
      case ID.CodecID:
        if (track) track.codec = String.fromCharCode(...b.subarray(at, end)).replace(/\0+$/, '');
        break;
      case ID.CodecPrivate:
        if (track) track.priv = b.subarray(at, end);
        break;
      case ID.PixelWidth:
        if (track) track.width = uint(b, at, size.value);
        break;
      case ID.PixelHeight:
        if (track) track.height = uint(b, at, size.value);
        break;
      case ID.Timecode:
        cluster = uint(b, at, size.value);
        break;
      case ID.SimpleBlock:
      case ID.Block: {
        const tn = vint(b, at);
        if (!tn) return null;
        const rel = (b[at + tn.len] << 24) >> 16 | b[at + tn.len + 1]; // signed 16-bit
        const flags = b[at + tn.len + 2];
        if (flags & 0x06) {
          blocks.push([tn.value, cluster + rel, false, null, true]); // laced: not read
          break;
        }
        const blk = [tn.value, cluster + rel, id.value === ID.SimpleBlock ? !!(flags & 0x80) : true, b.subarray(at + tn.len + 3, end), false];
        blocks.push(blk);
        if (id.value === ID.Block && group) group.block = blk;
        break;
      }
      case ID.ReferenceBlock:
        if (group && group.block) group.block[2] = false; // refers to another frame: not a key frame
        break;
      default:
    }
    p = end;
  }
  const v = tracks.find((t) => t.type === 1 && CODECS[t.codec]);
  if (!v || !v.width || !v.height) return null;
  const mine = blocks.filter((x) => x[0] === v.number);
  if (!mine.length || mine.some((x) => x[4])) return null;
  const t0 = Math.min(...mine.map((x) => x[1]));
  const samples = mine.map(([, tc, key, data]) => ({ ts: ((tc - t0) * scale) / 1e9, key, data }));
  samples[0].key = true; // a decoder must start on a key frame; the first frame of a recording is one
  return { codec: CODECS[v.codec], width: v.width, height: v.height, rotation: 0, description: undefined, samples };
}
