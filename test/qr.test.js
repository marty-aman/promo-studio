// The Link page's QR encoder (js/manager/qr.js) against vectors from the QR spec and tutorials,
// plus a small decoder written here, apart from the encoder, that reads a symbol back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rsEncode, dataCodewords, formatBits, versionBits, encodeQR, symbolFromCodewords, qrSVG, pickVersion, byteCapacity, dataCapacity, interleave } from '../js/manager/qr.js';

// ---- known-good vectors

// ISO/IEC 18004 Annex I worked example: "01234567" in numeric mode, version 1-M.
// Numeric bits: 0001 | 0000001000 (count 8) | 012 -> 0000001100 | 345 -> 0101011001 | 67 -> 1000011,
// then the 0000 terminator, zero fill and the EC 11 pad bytes.
const SPEC_DATA = [0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11];
const SPEC_EC = [0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55];
// Thonky's QR tutorial: "HELLO WORLD" (alphanumeric), version 1-M.
const HW_DATA = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
const HW_EC = [196, 35, 39, 119, 235, 215, 231, 226, 93, 23];
// The format information table for level M, masks 0-7 (ISO 18004 table C.1).
const FORMAT_M = ['101010000010010', '101000100100101', '101111001111100', '101101101001011', '100010111111001', '100000011001110', '100111110010111', '100101010100000'];
// Version information (ISO 18004 table D.1).
const VERSION_INFO = { 7: '000111110010010100', 8: '001000010110111100', 9: '001001101010011001', 10: '001010010011010011' };

test('Reed-Solomon codewords match the spec example and the HELLO WORLD tutorial', () => {
  assert.deepEqual(rsEncode(SPEC_DATA, 10), SPEC_EC);
  assert.deepEqual(rsEncode(HW_DATA, 10), HW_EC);
});

test('format and version bits match the spec tables', () => {
  for (let m = 0; m < 8; m++) assert.equal(formatBits(m).toString(2).padStart(15, '0'), FORMAT_M[m], `mask ${m}`);
  for (const [v, bits] of Object.entries(VERSION_INFO)) assert.equal(versionBits(+v).toString(2).padStart(18, '0'), bits, `version ${v}`);
});

test('capacities at level M match the spec (data codewords and bytes)', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(dataCapacity), [16, 28, 44, 64, 86, 108, 124, 154, 182, 216]);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(byteCapacity), [14, 26, 42, 62, 84, 106, 122, 152, 180, 213]);
  assert.equal(pickVersion(14), 1);
  assert.equal(pickVersion(15), 2);
  assert.equal(pickVersion(213), 10);
  assert.equal(pickVersion(214), 0);
  assert.throws(() => encodeQR('x'.repeat(214)), /too long/);
});

test('byte-mode data codewords for a real URL, worked by hand', () => {
  // "https://arcflash.band" is 21 bytes: 0100 | 00010101 | 'h' 01101000 | 't' 01110100 ...
  const cw = dataCodewords([...new TextEncoder().encode('https://arcflash.band')], 2);
  assert.equal(cw.length, 28);
  assert.deepEqual(cw.slice(0, 4), [0b01000001, 0b01010110, 0b10000111, 0b01000111]);
  // 4 + 8 + 168 = 180 bits, the terminator makes 184 = 23 bytes, then EC 11 EC 11 EC
  assert.deepEqual(cw.slice(23), [0xec, 0x11, 0xec, 0x11, 0xec]);
  assert.equal(cw[22], 0x40); // the last 'd' (0x64) low nibble 0100 then the 0000 terminator
});

// ---- a decoder, written apart from the encoder

const G = (() => {
  const exp = [];
  let x = 1;
  for (let i = 0; i < 255; i++) {
    exp.push(x);
    x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
    x &= 0xff;
  }
  return exp;
})();
const LOGT = (() => {
  const l = new Array(256).fill(-1);
  G.forEach((v, i) => (l[v] = i));
  return l;
})();
const mul = (a, b) => (a && b ? G[(LOGT[a] + LOGT[b]) % 255] : 0);
/** Every syndrome of a valid codeword block is zero: c(a^i) = 0 for i < ec. */
const syndromesZero = (block, ec) => {
  for (let i = 0; i < ec; i++) {
    let s = 0;
    for (const c of block) s = mul(s, G[i]) ^ c; // Horner's rule at a^i
    if (s) return false;
  }
  return true;
};
const TBL = { 1: [26, 10, 1], 2: [44, 16, 1], 3: [70, 26, 1], 4: [100, 18, 2], 5: [134, 24, 2], 6: [172, 16, 4], 7: [196, 18, 4], 8: [242, 22, 4], 9: [292, 22, 5], 10: [346, 26, 5] };
const AL = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
const MASKFN = [(i, j) => (i + j) % 2 === 0, (i) => i % 2 === 0, (i, j) => j % 3 === 0, (i, j) => (i + j) % 3 === 0, (i, j) => (((i / 2) | 0) + ((j / 3) | 0)) % 2 === 0, (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0, (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0, (i, j) => (((i * j) % 3) + ((i + j) % 2)) % 2 === 0];

function decode(M) {
  const n = M.length;
  const v = (n - 17) / 4;
  assert.ok(Number.isInteger(v) && v >= 1 && v <= 10, 'size');
  // format: read the first copy around the top-left finder (row 8 then column 8)
  const fpos = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]]; // [x, y] for bits 0..14
  let fmt = 0;
  fpos.forEach(([x, y], i) => (fmt |= (M[y][x] ? 1 : 0) << i));
  const fmt2 = [...Array(15)].reduce((a, _, i) => a | ((i < 8 ? M[8][n - 1 - i] : M[n - 15 + i][8]) ? 1 << i : 0), 0);
  assert.equal(fmt, fmt2, 'both format copies agree');
  const mask = FORMAT_M.indexOf(fmt.toString(2).padStart(15, '0'));
  assert.ok(mask >= 0, 'format is a level-M entry');
  assert.equal(M[n - 8][8], true, 'dark module');
  // which modules are function modules
  const F = Array.from({ length: n }, () => new Array(n).fill(false));
  const box = (x0, y0, w, hgt) => {
    for (let y = y0; y < y0 + hgt; y++) for (let x = x0; x < x0 + w; x++) if (x >= 0 && y >= 0 && x < n && y < n) F[y][x] = true;
  };
  box(0, 0, 9, 9);
  box(n - 8, 0, 8, 9);
  box(0, n - 8, 9, 8);
  box(6, 0, 1, n);
  box(0, 6, n, 1);
  const a = AL[v];
  // every centre pair except the three that would land on a finder (those touching the top-left 9x9 or the other corners)
  const nearFinder = (x, y) => (x < 9 && y < 9) || (x > n - 9 && y < 9) || (x < 9 && y > n - 9);
  for (const y of a) for (const x of a) if (!nearFinder(x, y)) box(x - 2, y - 2, 5, 5);
  if (v >= 7) {
    box(n - 11, 0, 3, 6);
    box(0, n - 11, 6, 3);
  }
  // finder and timing patterns are where they belong
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) {
    assert.equal(M[cy][cx], true);
    assert.equal(M[cy - 2][cx], false);
    assert.equal(M[cy - 3][cx], true);
  }
  for (let i = 8; i < n - 8; i++) assert.equal(M[6][i], i % 2 === 0, `timing ${i}`);
  // read bits in the zigzag order, unmasking
  const bits = [];
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    // column pairs counted from the right; even pairs go up
    const pair = col > 6 ? (n - 1 - col) / 2 : (n - 2 - col) / 2;
    const upward = pair % 2 === 0;
    for (let k = 0; k < n; k++) {
      const y = upward ? n - 1 - k : k;
      for (const x of [col, col - 1]) if (!F[y][x]) bits.push(M[y][x] !== MASKFN[mask](y, x));
    }
  }
  const [total, ec, nb] = TBL[v];
  const cw = [];
  for (let i = 0; i < total; i++) cw.push(bits.slice(i * 8, i * 8 + 8).reduce((s, b) => (s << 1) | (b ? 1 : 0), 0));
  // de-interleave
  const short = Math.floor(total / nb);
  const longCount = total % nb;
  const lens = [...Array(nb)].map((_, i) => short - ec + (i >= nb - longCount ? 1 : 0));
  const blocks = lens.map(() => []);
  let k = 0;
  for (let i = 0; i < Math.max(...lens); i++) for (let b = 0; b < nb; b++) if (i < lens[b]) blocks[b].push(cw[k++]);
  for (let i = 0; i < ec; i++) for (let b = 0; b < nb; b++) blocks[b].push(cw[k++]);
  blocks.forEach((b, i) => assert.ok(syndromesZero(b, ec), `block ${i} passes the error check`));
  const data = blocks.flatMap((b, i) => b.slice(0, lens[i]));
  // byte mode
  const stream = data.flatMap((b) => [...Array(8)].map((_, i) => (b >> (7 - i)) & 1));
  const read = (from, len) => stream.slice(from, from + len).reduce((s, b) => s * 2 + b, 0);
  assert.equal(read(0, 4), 0b0100, 'byte mode');
  const cbits = v < 10 ? 8 : 16;
  const count = read(4, cbits);
  const out = [...Array(count)].map((_, i) => read(4 + cbits + i * 8, 8));
  return { version: v, mask, data, text: new TextDecoder().decode(new Uint8Array(out)) };
}

test('the spec example symbol (01234567, 1-M) carries the spec codewords in every mask', () => {
  for (let mk = 0; mk < 8; mk++) {
    const q = symbolFromCodewords(SPEC_DATA, 1, mk);
    assert.equal(q.size, 21);
    assert.equal(q.mask, mk);
    // the decoder reads numeric data, so check codewords only: data plus the spec's EC
    const n = 21;
    assert.ok(q.modules[n - 8][8]);
    assert.deepEqual(interleave(SPEC_DATA, 1), [...SPEC_DATA, ...SPEC_EC]);
  }
});

test('encoded symbols decode back to the same text, across versions 1-10 and every mask', () => {
  const samples = ['https://arcflash.band', 'https://open.spotify.com/artist/0OdUWJ0sBjDrqHygGUXeCF', 'Ünïcødé ⚡ metal', 'x'.repeat(100), 'https://example.com/'.padEnd(213, 'z')];
  for (const s of samples) {
    const q = encodeQR(s);
    const d = decode(q.modules);
    assert.equal(d.text, s);
    assert.equal(d.mask, q.mask);
  }
  for (let mk = 0; mk < 8; mk++) assert.equal(decode(encodeQR('https://arcflash.band/links', { mask: mk }).modules).text, 'https://arcflash.band/links');
  // one sample per version
  const versions = new Set();
  for (let v = 1; v <= 10; v++) {
    const s = 'a'.repeat(byteCapacity(v));
    const q = encodeQR(s);
    versions.add(q.version);
    assert.equal(decode(q.modules).text, s);
  }
  assert.equal(versions.size, 10);
});

test('a damaged module is caught by the error check', () => {
  const q = encodeQR('https://arcflash.band');
  q.modules[q.size - 1][q.size - 1] = !q.modules[q.size - 1][q.size - 1]; // the first data bit
  assert.throws(() => decode(q.modules), /error check/);
});

test('qrSVG is plain SVG with a quiet zone and no way to inject markup', () => {
  const svg = qrSVG('https://arcflash.band', { px: 160, title: '"><script>alert(1)</script>', dark: 'red;x' });
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 33 33" width="160"/); // 25 modules + 8
  assert.ok(!svg.includes('<script'));
  assert.ok(svg.includes('&lt;script&gt;'));
  assert.ok(svg.includes('fill="#000000"'), 'a bad colour falls back to black');
});
