// A QR code encoder written from the ISO/IEC 18004 rules, for the Link page: byte mode, versions 1
// to 10, error correction level M (about 15% of the code can be damaged and it still scans). No
// library and no network. The output is an inline SVG, so it works inside a single HTML file.
// Pure functions, unit tested in test/qr.test.js (spec vectors and a separate decoder).

// ---- tables for level M, versions 1-10 (ISO 18004 table 9)
const TOTAL = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346]; // all codewords in the symbol
const EC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const ALIGN = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
export const MAX_VERSION = 10;

/** Data codewords a version holds at level M. */
export const dataCapacity = (v) => TOTAL[v] - EC_PER_BLOCK[v] * BLOCKS[v];
/** The most bytes a version holds in byte mode (4 mode bits, 8 or 16 count bits). */
export const byteCapacity = (v) => Math.floor((dataCapacity(v) * 8 - 4 - (v < 10 ? 8 : 16)) / 8);

// ---- GF(256) with the QR polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11d)
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
export const gfMul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
export const gfExp = (i) => EXP[((i % 255) + 255) % 255];

/** The generator polynomial (x - a^0)(x - a^1)...(x - a^(n-1)), highest power first, leading 1 dropped. */
function generator(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= gfMul(g[j], EXP[i]);
    }
    g = next;
  }
  return g.slice(1);
}

/** Reed-Solomon error correction codewords for `data` (the remainder of data(x) * x^n / g(x)). */
export function rsEncode(data, n) {
  const g = generator(n);
  const rem = new Array(n).fill(0);
  for (const byte of data) {
    const f = byte ^ rem.shift();
    rem.push(0);
    if (f) for (let j = 0; j < n; j++) rem[j] ^= gfMul(g[j], f);
  }
  return rem;
}

// ---- data

/** The smallest version (1-10) whose level-M byte mode fits `len` bytes, or 0 when none does. */
export function pickVersion(len) {
  for (let v = 1; v <= MAX_VERSION; v++) if (byteCapacity(v) >= len) return v;
  return 0;
}

/** Byte-mode data codewords for `bytes` in version `v`: mode, count, data, terminator, pad bytes. */
export function dataCodewords(bytes, v) {
  const bits = [];
  const put = (val, n) => {
    for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, v < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const cap = dataCapacity(v) * 8;
  if (bits.length > cap) throw new Error('Too long for a QR code');
  put(0, Math.min(4, cap - bits.length)); // terminator
  while (bits.length % 8) bits.push(0);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; out.length < dataCapacity(v); pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

/** Split data into blocks, add each block's error correction, and interleave (ISO 18004 8.6). */
export function interleave(data, v) {
  const nb = BLOCKS[v];
  const ec = EC_PER_BLOCK[v];
  const shortLen = Math.floor(TOTAL[v] / nb) - ec; // data codewords in a short block
  const numLong = TOTAL[v] % nb; // the last `numLong` blocks hold one more
  const blocks = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const len = shortLen + (i >= nb - numLong ? 1 : 0);
    const d = data.slice(k, k + len);
    k += len;
    blocks.push({ d, e: rsEncode(d, ec) });
  }
  const out = [];
  for (let i = 0; i <= shortLen; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
  for (let i = 0; i < ec; i++) for (const b of blocks) out.push(b.e[i]);
  return out;
}

// ---- format and version information

/** The 15 format bits for level M and `mask` (BCH(15,5), then XOR 101010000010010). */
export function formatBits(mask) {
  const data = (0b00 << 3) | mask; // level M is 00
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
  return ((data << 10) | rem) ^ 0x5412;
}

/** The 18 version bits (BCH(18,6) with generator 0x1f25), versions 7 and up. */
export function versionBits(v) {
  let rem = v << 12;
  for (let i = 17; i >= 12; i--) if ((rem >>> i) & 1) rem ^= 0x1f25 << (i - 12);
  return (v << 12) | rem;
}

const MASKS = [
  (y, x) => (y + x) % 2 === 0,
  (y) => y % 2 === 0,
  (y, x) => x % 3 === 0,
  (y, x) => (y + x) % 3 === 0,
  (y, x) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (y, x) => ((y * x) % 2) + ((y * x) % 3) === 0,
  (y, x) => (((y * x) % 2) + ((y * x) % 3)) % 2 === 0,
  (y, x) => (((y + x) % 2) + ((y * x) % 3)) % 2 === 0,
];
export const maskAt = (mask, y, x) => MASKS[mask](y, x);

// ---- the symbol

/** An empty symbol with its function patterns drawn: { size, mods, fn } as [y][x] arrays. */
function base(v) {
  const size = 17 + 4 * v;
  const mods = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => {
    mods[y][x] = dark;
    fn[y][x] = true;
  };
  // finder patterns with their light separators
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]])
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, d !== 2 && d !== 4);
      }
  // timing patterns
  for (let i = 8; i < size - 8; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  // alignment patterns, except where they would sit on a finder
  const pos = ALIGN[v];
  for (const ay of pos)
    for (const ax of pos) {
      if ((ax === 6 && ay === 6) || (ax === 6 && ay === pos[pos.length - 1]) || (ax === pos[pos.length - 1] && ay === 6)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  // reserve the format areas (filled per mask) and draw the dark module
  drawFormat({ size, set }, 0);
  if (v >= 7) {
    const bits = versionBits(v);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, dark);
      set(b, a, dark);
    }
  }
  return { size, mods, fn };
}

/** Both copies of the format bits (bit 0 is the least significant), and the dark module. */
function drawFormat({ size, set }, mask) {
  const bits = formatBits(mask);
  const bit = (i) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6));
  set(8, 8, bit(7));
  set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
  set(8, size - 8, true);
}

/** Place the codewords in the two-column zigzag from the bottom right, skipping function modules. */
function place({ size, mods, fn }, codewords) {
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // the vertical timing column is skipped
    const upward = ((right + 1) & 2) === 0;
    for (let k = 0; k < size; k++) {
      const y = upward ? size - 1 - k : k;
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        if (fn[y][x]) continue;
        // remainder bits past the last codeword stay light
        mods[y][x] = i < codewords.length * 8 && ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
        i++;
      }
    }
  }
}

/** The penalty score of a finished symbol (ISO 18004 7.8.3: N1 = 3, N2 = 3, N3 = 40, N4 = 10). */
export function penalty(mods) {
  const n = mods.length;
  let score = 0;
  const line = (get) => {
    for (let a = 0; a < n; a++) {
      let run = 1;
      for (let b = 1; b <= n; b++) {
        if (b < n && get(a, b) === get(a, b - 1)) run++;
        else {
          if (run >= 5) score += 3 + run - 5;
          run = 1;
        }
      }
      // 1:1:3:1:1 finder-like pattern with 4 light modules on one side
      for (let b = 0; b + 11 <= n; b++) {
        const w = Array.from({ length: 11 }, (_, k) => get(a, b + k));
        const core = (o) => w[o] && !w[o + 1] && w[o + 2] && w[o + 3] && w[o + 4] && !w[o + 5] && w[o + 6];
        if ((core(0) && !w[7] && !w[8] && !w[9] && !w[10]) || (!w[0] && !w[1] && !w[2] && !w[3] && core(4))) score += 40;
      }
    }
  };
  line((a, b) => mods[a][b]);
  line((a, b) => mods[b][a]);
  let dark = 0;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (mods[y][x]) dark++;
      if (y < n - 1 && x < n - 1) {
        const c = mods[y][x];
        if (c === mods[y][x + 1] && c === mods[y + 1][x] && c === mods[y + 1][x + 1]) score += 3;
      }
    }
  score += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
  return score;
}

/**
 * Build the symbol from finished data codewords (before interleaving) for version `v`. With `mask`
 * (0-7) that mask is used; otherwise the one with the lowest penalty. Returns { version, size, mask, modules }.
 */
export function symbolFromCodewords(data, v, mask = -1) {
  const cw = interleave(data, v);
  let best = null;
  for (let mk = 0; mk < 8; mk++) {
    if (mask >= 0 && mk !== mask) continue;
    const s = base(v);
    place(s, cw);
    for (let y = 0; y < s.size; y++) for (let x = 0; x < s.size; x++) if (!s.fn[y][x] && MASKS[mk](y, x)) s.mods[y][x] = !s.mods[y][x];
    drawFormat({ size: s.size, set: (x, y, d) => (s.mods[y][x] = d) }, mk);
    const p = mask >= 0 ? 0 : penalty(s.mods);
    if (!best || p < best.p) best = { p, version: v, size: s.size, mask: mk, modules: s.mods };
  }
  return { version: best.version, size: best.size, mask: best.mask, modules: best.modules };
}

/** Encode `text` (UTF-8, byte mode, level M) as a QR symbol. Throws when it is too long (over 213 bytes). */
export function encodeQR(text, { mask = -1 } = {}) {
  const bytes = [...new TextEncoder().encode(String(text ?? ''))];
  const v = pickVersion(bytes.length);
  if (!v) throw new Error(`That address is too long for a QR code here (${bytes.length} bytes, the most is ${byteCapacity(MAX_VERSION)}).`);
  return symbolFromCodewords(dataCodewords(bytes, v), v, mask);
}

const HEX = /^#[\da-f]{6}$/i;
const escAttr = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * The QR code for `text` as an SVG string: one path, a 4-module light margin (the quiet zone the
 * spec asks for), sized by `px`. Colours must be #rrggbb; keep the dark one dark for scanners.
 */
export function qrSVG(text, { px = 200, dark = '#000000', light = '#ffffff', title = '' } = {}) {
  const q = encodeQR(text);
  const n = q.size + 8;
  let d = '';
  for (let y = 0; y < q.size; y++)
    for (let x = 0; x < q.size; x++) {
      if (!q.modules[y][x]) continue;
      let run = 1;
      while (x + run < q.size && q.modules[y][x + run]) run++;
      d += `M${x + 4} ${y + 4}h${run}v1h-${run}z`;
      x += run - 1;
    }
  const fg = HEX.test(dark) ? dark : '#000000';
  const bg = HEX.test(light) ? light : '#ffffff';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${+px || 200}" height="${+px || 200}" shape-rendering="crispEdges" role="img" aria-label="${escAttr(title || 'QR code')}">${title ? `<title>${escAttr(title)}</title>` : ''}<rect width="${n}" height="${n}" fill="${bg}"/><path d="${d}" fill="${fg}"/></svg>`;
}
