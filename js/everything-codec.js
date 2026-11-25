// "Export everything": how one IndexedDB value becomes JSON plus binary zip entries, and back. Pure (no IndexedDB), so
// it runs in node tests. A value may hold Blobs, typed arrays, ArrayBuffers, Dates, Maps and Sets at any depth.
// Small binary values are written inline as base64; big ones and every Blob become their own entry in the zip.

const TYPED = { Uint8Array, Int8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array, ArrayBuffer };
const INLINE_MAX = 16 * 1024;

const b64 = (u8) => {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const bytesOfView = (v) => (v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer, v.byteOffset, v.byteLength));

/**
 * value -> JSON-safe value. `addBin(bytesOrBlob) -> entryName` stores a binary part and returns its zip name.
 * Tagged objects look like { $: 'blob', e, type, name?, lm? }.
 */
export async function encodeValue(v, addBin) {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : { $: 'num', v: String(v) };
  if (typeof v === 'bigint') return { $: 'big', v: String(v) };
  if (v === undefined) return { $: 'undef' };
  if (typeof Blob !== 'undefined' && v instanceof Blob) {
    const t = { $: 'blob', e: await addBin(v), type: v.type };
    if (typeof v.name === 'string') (t.name = v.name), (t.lm = v.lastModified);
    return t;
  }
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
    const t = v instanceof ArrayBuffer ? 'ArrayBuffer' : v.constructor.name;
    if (!TYPED[t]) throw new Error(`Cannot export a ${t}`);
    const u = bytesOfView(v);
    return u.length <= INLINE_MAX ? { $: 'bin', t, d: b64(u) } : { $: 'bin', t, e: await addBin(u) };
  }
  if (v instanceof Date) return { $: 'date', v: v.getTime() };
  if (v instanceof Map) return { $: 'map', v: await Promise.all([...v].map(async ([k, x]) => [await encodeValue(k, addBin), await encodeValue(x, addBin)])) };
  if (v instanceof Set) return { $: 'set', v: await Promise.all([...v].map((x) => encodeValue(x, addBin))) };
  if (Array.isArray(v)) return Promise.all(v.map((x) => encodeValue(x, addBin)));
  if (typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) if (v[k] !== undefined) o[k] = await encodeValue(v[k], addBin);
    return '$' in o ? { $: 'obj', v: o } : o;
  }
  return null; // functions and symbols are not data
}

/** The inverse. `getBin(entryName, type) -> Promise<Blob>` gives a part's bytes as a (lazy) Blob. */
export async function decodeValue(v, getBin) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return Promise.all(v.map((x) => decodeValue(x, getBin)));
  switch (v.$) {
    case undefined: {
      const o = {};
      for (const k of Object.keys(v)) o[k] = await decodeValue(v[k], getBin);
      return o;
    }
    case 'obj': {
      const o = {};
      for (const k of Object.keys(v.v)) o[k] = await decodeValue(v.v[k], getBin);
      return o;
    }
    case 'num':
      return Number(v.v);
    case 'big':
      return BigInt(v.v);
    case 'undef':
      return undefined;
    case 'date':
      return new Date(v.v);
    case 'map':
      return new Map(await Promise.all(v.v.map(async ([k, x]) => [await decodeValue(k, getBin), await decodeValue(x, getBin)])));
    case 'set':
      return new Set(await Promise.all(v.v.map((x) => decodeValue(x, getBin))));
    case 'blob': {
      const b = await getBin(v.e, v.type || '');
      return v.name !== undefined ? new File([b], v.name, { type: v.type || '', lastModified: v.lm }) : b;
    }
    case 'bin': {
      const ctor = TYPED[v.t];
      if (!ctor) throw new Error(`Unknown data type ${v.t} in the zip`);
      const u = v.e ? new Uint8Array(await (await getBin(v.e, '')).arrayBuffer()) : unb64(v.d);
      return ctor === ArrayBuffer ? u.buffer : new ctor(u.buffer, u.byteOffset, u.byteLength / ctor.BYTES_PER_ELEMENT);
    }
    default:
      throw new Error('The zip holds a kind of value this version does not know');
  }
}

/** Every Blob/binary size in a value (without reading it), for the size shown before exporting. */
export function sizeOfValue(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'string') return v.length;
  if (typeof v !== 'object') return 8;
  if (typeof Blob !== 'undefined' && v instanceof Blob) return v.size;
  if (v instanceof ArrayBuffer) return v.byteLength;
  if (ArrayBuffer.isView(v)) return v.byteLength;
  if (v instanceof Date) return 8;
  let n = 0;
  const items = v instanceof Map ? [...v].flat() : v instanceof Set || Array.isArray(v) ? [...v] : Object.values(v);
  for (const x of items) n += sizeOfValue(x);
  return n;
}

export const base64 = { encode: b64, decode: unb64 };
