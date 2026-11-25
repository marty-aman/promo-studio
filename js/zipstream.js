// A zip that is written and read in pieces, so a library of many gigabytes never sits in memory as one copy.
//   ZipWriter  stored (not compressed) entries, zip64 when a file or the whole zip passes 4 GB. The sink receives
//              small Uint8Arrays (headers) and the original Blobs (the browser streams those to disk itself).
//   openZip    reads the central directory of a zip Blob or File; entry.slice() is a lazy Blob of the entry's bytes.
//   hashBlob   sha256 and crc32 of a Blob, read in 4 MB pieces, with progress and cancel.
// shortcut: stored entries only (media is already compressed); a zip from another tool with deflated entries is refused.

const PIECE = 4 * 1024 * 1024;

const CRC = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC[n] = c >>> 0;
}

export class Crc32 {
  constructor() {
    this.c = 0xffffffff;
  }
  update(b) {
    let c = this.c;
    for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    this.c = c;
  }
  get value() {
    return (this.c ^ 0xffffffff) >>> 0;
  }
}

// sha256 constants: fractional parts of the cube roots (K) and square roots (H) of the first primes
const PRIMES = [];
for (let n = 2; PRIMES.length < 64; n++) if (PRIMES.every((p) => n % p)) PRIMES.push(n);
const frac = (x) => Math.floor((x - Math.floor(x)) * 4294967296) >>> 0;
const K = Uint32Array.from(PRIMES, (p) => frac(Math.cbrt(p)));
const H0 = Uint32Array.from(PRIMES.slice(0, 8), (p) => frac(Math.sqrt(p)));

export class Sha256 {
  constructor() {
    this.h = Uint32Array.from(H0);
    this.buf = new Uint8Array(64);
    this.fill = 0;
    this.len = 0;
    this.w = new Uint32Array(64);
  }
  block(d, o) {
    const w = this.w;
    for (let t = 0; t < 16; t++, o += 4) w[t] = (d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3];
    for (let t = 16; t < 64; t++) {
      const a = w[t - 15];
      const b = w[t - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    const h = this.h;
    let [a, b, c, d2, e, f, g, hh] = h;
    for (let t = 0; t < 64; t++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (hh + S1 + ((e & f) ^ (~e & g)) + K[t] + w[t]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d2 + t1) | 0;
      d2 = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d2;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += hh;
  }
  update(data) {
    const n = data.length;
    let i = 0;
    this.len += n;
    if (this.fill) {
      while (i < n && this.fill < 64) this.buf[this.fill++] = data[i++];
      if (this.fill === 64) {
        this.block(this.buf, 0);
        this.fill = 0;
      }
    }
    for (; i + 64 <= n; i += 64) this.block(data, i);
    while (i < n) this.buf[this.fill++] = data[i++];
  }
  hex() {
    const len = this.len;
    this.buf[this.fill++] = 0x80;
    if (this.fill > 56) {
      this.buf.fill(0, this.fill);
      this.block(this.buf, 0);
      this.fill = 0;
    }
    this.buf.fill(0, this.fill);
    const dv = new DataView(this.buf.buffer);
    dv.setUint32(56, Math.floor(len / 0x20000000));
    dv.setUint32(60, (len << 3) >>> 0);
    this.block(this.buf, 0);
    return [...this.h].map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
}

export const cancelled = () => Object.assign(new Error('Cancelled'), { name: 'Cancelled' });

/** Read `blob` in pieces, calling each(Uint8Array). onBytes(n) after each piece; signal aborts. */
export async function readPieces(blob, each, { onBytes, signal } = {}) {
  for (let at = 0; at < blob.size; at += PIECE) {
    if (signal && signal.aborted) throw cancelled();
    const u = new Uint8Array(await blob.slice(at, Math.min(blob.size, at + PIECE)).arrayBuffer());
    each(u);
    if (onBytes) onBytes(u.length);
  }
}

/** { sha256, crc, size } of a Blob, read in pieces. */
export async function hashBlob(blob, opts = {}) {
  const sha = new Sha256();
  const crc = new Crc32();
  await readPieces(
    blob,
    (u) => {
      sha.update(u);
      crc.update(u);
    },
    opts,
  );
  return { sha256: sha.hex(), crc: crc.value, size: blob.size };
}

export const bytesOf = (text) => new TextEncoder().encode(text);
const U32 = 0xffffffff;

// ---------------------------------------------------------------- sinks
/** Collects parts (Blobs stay Blobs, so nothing is copied into memory); result() is the finished zip Blob. */
export function blobSink() {
  const parts = [];
  return {
    write: async (x) => void parts.push(x),
    result: () => new Blob(parts, { type: 'application/zip' }),
  };
}
/** Writes to a FileSystemWritableFileStream (Chrome's save dialog): the zip goes straight to disk. */
export function fileSink(writable) {
  return { write: (x) => writable.write(x), close: () => writable.close(), abort: () => writable.abort().catch(() => {}) };
}

// ---------------------------------------------------------------- writer
export class ZipWriter {
  constructor(sink, { force64 = false, date = new Date() } = {}) {
    this.sink = sink;
    this.force64 = force64;
    this.off = 0;
    this.entries = [];
    this.time = ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff;
    this.day = (((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;
  }
  async put(x) {
    await this.sink.write(x);
    this.off += x.length === undefined ? x.size : x.length;
  }
  /** Add bytes (Uint8Array) or a Blob as a file. `hash` ({crc,size}) skips the reading pass when known. */
  async add(name, data, { hash, onBytes, signal } = {}) {
    const blob = data instanceof Uint8Array ? new Blob([data]) : data;
    const h = hash || (await hashBlob(blob, { onBytes, signal }));
    const n = bytesOf(name);
    const big = this.force64 || h.size >= U32;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, big ? 45 : 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(10, this.time, true);
    local.setUint16(12, this.day, true);
    local.setUint32(14, h.crc, true);
    local.setUint32(18, big ? U32 : h.size, true);
    local.setUint32(22, big ? U32 : h.size, true);
    local.setUint16(26, n.length, true);
    let extra = new Uint8Array(0);
    if (big) {
      const e = new DataView(new ArrayBuffer(20));
      e.setUint16(0, 1, true);
      e.setUint16(2, 16, true);
      e.setBigUint64(4, BigInt(h.size), true);
      e.setBigUint64(12, BigInt(h.size), true);
      extra = new Uint8Array(e.buffer);
    }
    local.setUint16(28, extra.length, true);
    const start = this.off;
    await this.put(new Uint8Array(local.buffer));
    await this.put(n);
    if (extra.length) await this.put(extra);
    if (data instanceof Uint8Array) await this.put(data);
    else if (blob.size) await this.put(blob);
    this.entries.push({ name: n, crc: h.crc, size: h.size, off: start, big });
    return h;
  }
  /** Writes the central directory. Resolves the zip's total size. */
  async finish() {
    const cdStart = this.off;
    for (const e of this.entries) {
      const offBig = this.force64 || e.off >= U32;
      const ex = [];
      if (e.big) ex.push(e.size, e.size);
      if (offBig) ex.push(e.off);
      const extra = new DataView(new ArrayBuffer(ex.length ? 4 + ex.length * 8 : 0));
      if (ex.length) {
        extra.setUint16(0, 1, true);
        extra.setUint16(2, ex.length * 8, true);
        ex.forEach((v, i) => extra.setBigUint64(4 + i * 8, BigInt(v), true));
      }
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 45, true);
      cd.setUint16(6, e.big || offBig ? 45 : 20, true);
      cd.setUint16(8, 0x0800, true);
      cd.setUint16(12, this.time, true);
      cd.setUint16(14, this.day, true);
      cd.setUint32(16, e.crc, true);
      cd.setUint32(20, e.big ? U32 : e.size, true);
      cd.setUint32(24, e.big ? U32 : e.size, true);
      cd.setUint16(28, e.name.length, true);
      cd.setUint16(30, extra.byteLength, true);
      cd.setUint32(42, offBig ? U32 : e.off, true);
      await this.put(new Uint8Array(cd.buffer));
      await this.put(e.name);
      if (extra.byteLength) await this.put(new Uint8Array(extra.buffer));
    }
    const cdSize = this.off - cdStart;
    const count = this.entries.length;
    const need64 = this.force64 || count >= 0xffff || cdStart >= U32 || cdSize >= U32;
    if (need64) {
      const z = new DataView(new ArrayBuffer(56 + 20));
      z.setUint32(0, 0x06064b50, true);
      z.setBigUint64(4, 44n, true);
      z.setUint16(12, 45, true);
      z.setUint16(14, 45, true);
      z.setBigUint64(24, BigInt(count), true);
      z.setBigUint64(32, BigInt(count), true);
      z.setBigUint64(40, BigInt(cdSize), true);
      z.setBigUint64(48, BigInt(cdStart), true);
      z.setUint32(56, 0x07064b50, true);
      z.setBigUint64(64, BigInt(this.off), true);
      z.setUint32(72, 1, true);
      await this.put(new Uint8Array(z.buffer));
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, need64 ? 0xffff : count, true);
    end.setUint16(10, need64 ? 0xffff : count, true);
    end.setUint32(12, need64 ? U32 : cdSize, true);
    end.setUint32(16, need64 ? U32 : cdStart, true);
    await this.put(new Uint8Array(end.buffer));
    return this.off;
  }
}

// ---------------------------------------------------------------- reader
const readAt = async (blob, at, len) => new DataView(await blob.slice(at, at + len).arrayBuffer());

/** Map of name -> { name, size, crc, slice(type) } for a zip Blob/File. Throws a readable error for anything else. */
export async function openZip(blob) {
  const bad = () => new Error('This file is not a Promo Studio “everything” zip.');
  if (blob.size < 22) throw bad();
  const tailLen = Math.min(blob.size, 65557);
  const tail = await readAt(blob, blob.size - tailLen, tailLen);
  let p = tailLen - 22;
  while (p >= 0 && tail.getUint32(p, true) !== 0x06054b50) p--;
  if (p < 0) throw bad();
  let count = tail.getUint16(p + 10, true);
  let cdSize = tail.getUint32(p + 12, true);
  let cdOff = tail.getUint32(p + 16, true);
  if (count === 0xffff || cdSize === U32 || cdOff === U32) {
    const at = blob.size - tailLen + p - 20;
    const loc = await readAt(blob, at, 20);
    if (at < 0 || loc.getUint32(0, true) !== 0x07064b50) throw bad();
    const z = await readAt(blob, Number(loc.getBigUint64(8, true)), 56);
    if (z.getUint32(0, true) !== 0x06064b50) throw bad();
    count = Number(z.getBigUint64(32, true));
    cdSize = Number(z.getBigUint64(40, true));
    cdOff = Number(z.getBigUint64(48, true));
  }
  const cd = await readAt(blob, cdOff, cdSize);
  const dec = new TextDecoder();
  const entries = new Map();
  let o = 0;
  for (let i = 0; i < count; i++) {
    if (o + 46 > cdSize || cd.getUint32(o, true) !== 0x02014b50) throw bad();
    const method = cd.getUint16(o + 10, true);
    const crc = cd.getUint32(o + 16, true);
    let size = cd.getUint32(o + 24, true);
    const csize = cd.getUint32(o + 20, true);
    const nl = cd.getUint16(o + 28, true);
    const el = cd.getUint16(o + 30, true);
    const cl = cd.getUint16(o + 32, true);
    let off = cd.getUint32(o + 42, true);
    const name = dec.decode(new Uint8Array(cd.buffer, o + 46, nl));
    let x = o + 46 + nl;
    const xend = x + el;
    while (x + 4 <= xend) {
      const id = cd.getUint16(x, true);
      const sz = cd.getUint16(x + 2, true);
      if (id === 1) {
        let q = x + 4;
        if (size === U32) (size = Number(cd.getBigUint64(q, true))), (q += 8);
        if (csize === U32) q += 8;
        if (off === U32) off = Number(cd.getBigUint64(q, true));
      }
      x += 4 + sz;
    }
    if (method !== 0) throw new Error('This zip uses compression. Use the zip that Promo Studio’s “Export everything” made, unchanged.');
    entries.set(name, entryOf(blob, name, size, crc, off));
    o += 46 + nl + el + cl;
  }
  return entries;
}

function entryOf(blob, name, size, crc, off) {
  let start = null;
  return {
    name,
    size,
    crc,
    /** The entry's bytes as a Blob (lazy: the browser reads the file only when it is used). */
    async slice(type = '') {
      if (start === null) {
        const l = await readAt(blob, off, 30);
        if (l.getUint32(0, true) !== 0x04034b50) throw new Error('The zip is damaged.');
        start = off + 30 + l.getUint16(26, true) + l.getUint16(28, true);
      }
      return blob.slice(start, start + size, type);
    },
    async bytes() {
      return new Uint8Array(await (await this.slice()).arrayBuffer());
    },
    async text() {
      return new TextDecoder().decode(await this.bytes());
    },
  };
}
