// Drum maps: what each MIDI note plays in a drum engine (Superior Drummer 3, EZdrummer, Addictive Drums 2,
// GetGood Drums, General MIDI, Guitar Pro, Roland TD…), and converting drum MIDI from one to another.
// Every note is decoded to a shared drum name ("snare1.rimshot", "hat.open2.tip", "tom.floor1.hit"), then
// encoded to the destination's note for that drum. When the destination has no such drum, the nearest
// stand-in it has is used: another stroke of the same drum first (a rimshot becomes a hit), then the closest
// drum (a china on a crash, tom 4 on tom 3). The note tables come from remidi (MIT, see vendor/remidi);
// the stand-in order follows remidi's published rules. Pure, unit tested.
import { CANON, ENGINES } from './drummaps-data.js';

// ---- engines

let cache = null;
/** All engines: [{ id, name, vendor, variant, hub, openHat, notes: Map(note -> canon), byCanon: Map(canon -> [notes, primary first]) }]. */
export function engines() {
  if (cache) return cache;
  cache = ENGINES.map((e) => {
    const notes = new Map();
    const byCanon = new Map();
    for (const pair of e.n.split(' ')) {
      const m = /^(\d+):(\d+)(!?)$/.exec(pair);
      if (!m) continue;
      const note = +m[1];
      const canon = CANON[+m[2]];
      notes.set(note, canon);
      const list = byCanon.get(canon) || [];
      if (m[3]) list.unshift(note);
      else list.push(note);
      byCanon.set(canon, list);
    }
    return { id: e.id, name: e.name, short: e.short || '', vendor: e.vendor, variant: e.variant || '', hub: e.hub || '', openHat: e.openHat || 0, notes, byCanon };
  });
  return cache;
}
export const engine = (id) => engines().find((e) => e.id === id) || null;

/** Engines grouped by maker for a picker, the best-known first: [[vendor, [engine…]]]. */
export function engineGroups() {
  const order = ['Standards', 'Toontrack', 'XLN Audio', 'GetGood Drums', 'Steven Slate Drums', 'BFD'];
  const groups = new Map();
  for (const e of engines()) {
    if (!groups.has(e.vendor)) groups.set(e.vendor, []);
    groups.get(e.vendor).push(e);
  }
  const rank = (v) => (order.includes(v) ? order.indexOf(v) : order.length);
  return [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0])).map(([v, list]) => [v, list.sort((a, b) => (b.hub ? 1 : 0) - (a.hub ? 1 : 0) || a.name.localeCompare(b.name))]);
}

// ---- drum names

const RUNGS = ['loose', 'open1', 'open2', 'open3', 'open4', 'open5', 'open6'];
const rungVal = (r) => (r === 'loose' ? 0.5 : +r.slice(4));
const TOMS = ['rack1', 'rack2', 'rack3', 'rack4', 'rack5', 'rack6', 'rack7', 'rack8', 'floor1', 'floor2', 'floor3', 'floor4'];
const CYM_COUNT = { crash: 6, china: 3, splash: 3, stack: 4, bell: 2 };

/** A drum name split into its parts: { kind, idx, a (stroke), o (hat opening), z (hat zone) }. */
export function parseCanon(c) {
  const p = String(c).split('.');
  if (p[0] === 'kick') return { kind: 'kick', a: p[1] || 'main' };
  const sn = /^snare(\d)$/.exec(p[0]);
  if (sn) return { kind: 'snare', idx: +sn[1], a: p[1] || 'hit' };
  if (p[0] === 'tom') return { kind: 'tom', pos: p[1], a: p[2] || 'hit' };
  const aux = /^aux(\d)$/.exec(p[0]);
  if (p[0] === 'hat' || aux) return { kind: aux ? 'aux' : 'hat', idx: aux ? +aux[1] : 0, o: p[1], z: p[2] || 'plain' };
  if (CYM_COUNT[p[0]]) return { kind: 'cym', slot: p[0], idx: +p[1] || 1, a: p[2] || 'hit' };
  if (p[0] === 'ride') return { kind: 'ride', idx: +p[1] || 1, a: p[2] || 'bow' };
  return { kind: 'perc', name: p.slice(1).join('.') };
}
/** The drum name for the parts (the inverse of parseCanon). */
export function canonOf(x) {
  switch (x.kind) {
    case 'kick': return `kick.${x.a}`;
    case 'snare': return `snare${x.idx}.${x.a}`;
    case 'tom': return `tom.${x.pos}.${x.a}`;
    case 'hat':
    case 'aux': return `${x.kind === 'hat' ? 'hat' : `aux${x.idx}`}.${x.o}${x.z === 'plain' ? '' : `.${x.z}`}`;
    case 'cym': return `${x.slot}.${x.idx}.${x.a}`;
    case 'ride': return `ride.${x.idx}${x.a === 'bow' ? '' : `.${x.a}`}`;
    default: return `perc.${x.name}`;
  }
}

/** Two drum names on the same physical drum or cymbal (only the stroke differs). */
export function sameDrum(a, b) {
  const x = parseCanon(a);
  const y = parseCanon(b);
  if (x.kind !== y.kind) return false;
  if (x.kind === 'snare' || x.kind === 'aux' || x.kind === 'ride') return x.idx === y.idx;
  if (x.kind === 'tom') return x.pos === y.pos;
  if (x.kind === 'cym') return x.slot === y.slot && x.idx === y.idx;
  if (x.kind === 'perc') return x.name.split('.')[0] === y.name.split('.')[0];
  return true; // the kick, the hi-hat
}

// other strokes of the same drum, closest first
const KICK = { main: ['alt', 'left'], alt: ['main', 'left'], left: ['main', 'alt'] };
const SNARE = { hit: ['side'], side: ['hit'], rimshot: ['hit'], flam: ['hit'], off: ['hit'], ghost: ['hit'], rim: ['sidestick'], sidestick: ['rim'], ruff: ['flam', 'hit'] };
const TOM = { rimshot: ['hit'], hit: [], rim: [] };
const CYM = { hit: ['edge'], edge: ['hit'], bow: ['bowtip', 'hit', 'edge'], bowtip: ['bow', 'hit', 'edge'], bell: ['belltip'], belltip: ['bell'], mute: ['hit', 'edge'] };
const RIDE = { bow: ['bowtip'], bowtip: ['bow'], bell: ['belltip', 'bow', 'bowtip'], belltip: ['bell', 'bow', 'bowtip'], mute: ['bow', 'bowtip'], edge: ['bow', 'bowtip'] };

function nearest(from, all, dist) {
  return all.filter((x) => x !== from).map((x, i) => [x, dist(from, x), i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map((r) => r[0]);
}
function openingOrder(o) {
  if (o === 'tight') return ['closed', 'cc'];
  if (o === 'closed') return ['tight', 'cc'];
  if (o === 'cc') return ['closed', 'tight'];
  if (o === 'pedal') return [];
  if (o === 'pedalsplash') return ['pedal'];
  if (RUNGS.includes(o)) return nearest(o, RUNGS, (a, b) => Math.abs(rungVal(a) - rungVal(b)));
  return [];
}
function zoneOrder(from, opening) {
  const open = RUNGS.includes(opening) || opening === 'pedalsplash';
  if (from === 'plain') return open ? ['plain', 'edge', 'tip'] : ['plain', 'tip', 'edge'];
  if (from === 'tip') return ['tip', 'plain', 'edge'];
  if (from === 'edge') return ['edge', 'plain', 'tip'];
  return ['bell', 'edge', 'tip', 'plain'];
}
function hatOrder(o, z) {
  const own = zoneOrder(z, o).slice(1).map((zone) => [o, zone]);
  const others = openingOrder(o).flatMap((to) => zoneOrder(z, to).map((zone) => [to, zone]));
  return [...own, ...others];
}

function variants(c) {
  const x = parseCanon(c);
  const as = (a) => canonOf({ ...x, a });
  switch (x.kind) {
    case 'kick': return (KICK[x.a] || []).map(as);
    case 'snare': return (SNARE[x.a] || []).map(as);
    case 'tom': return (TOM[x.a] || []).map(as);
    case 'hat':
    case 'aux': return hatOrder(x.o, x.z).map(([o, z]) => canonOf({ ...x, o, z }));
    case 'cym': return (CYM[x.a] || []).map(as);
    case 'ride': return (RIDE[x.a] || []).map(as);
    default: return [];
  }
}
function neighbours(c) {
  const x = parseCanon(c);
  const crash1 = (a) => canonOf({ kind: 'cym', slot: 'crash', idx: 1, a });
  const rideBell = (a) => `ride.1.${a === 'belltip' ? 'belltip' : 'bell'}`;
  switch (x.kind) {
    case 'snare': return [1, 2].filter((i) => i !== x.idx).map((idx) => canonOf({ ...x, idx }));
    case 'tom': return nearest(x.pos, TOMS, (a, b) => Math.abs(TOMS.indexOf(a) - TOMS.indexOf(b))).map((pos) => canonOf({ ...x, pos }));
    case 'aux': return [canonOf({ ...x, kind: 'hat' })];
    case 'cym': {
      const range = (slot) => Array.from({ length: CYM_COUNT[slot] }, (_, i) => i + 1);
      const same = nearest(x.idx, range(x.slot), (a, b) => Math.abs(a - b)).map((idx) => canonOf({ ...x, idx }));
      const every = (slot) => range(slot).map((idx) => canonOf({ ...x, slot, idx }));
      const next = x.slot === 'crash' ? (['bell', 'belltip'].includes(x.a) ? [rideBell(x.a)] : [])
        : x.slot === 'china' ? [...every('stack'), crash1(x.a)]
          : x.slot === 'stack' ? [...every('china'), crash1(x.a)]
            : x.slot === 'splash' ? [crash1(x.a)]
              : [rideBell(x.a)];
      return [...same, ...next];
    }
    case 'ride': return [...[1, 2].filter((i) => i !== x.idx).map((idx) => canonOf({ ...x, idx })), ...(x.a === 'edge' ? [crash1('hit')] : [])];
    default: return [];
  }
}

const chains = new Map();
/** Where a drum goes when the destination doesn't have it, closest first (its own other strokes, then nearby drums). */
export function fallbackChain(c) {
  if (chains.has(c)) return chains.get(c);
  const out = variants(c);
  const queue = [c, ...out].flatMap(neighbours);
  while (queue.length) {
    const entry = queue.shift();
    if (sameDrum(c, entry) || out.includes(entry)) continue;
    const standIns = [entry, ...variants(entry)].filter((s) => !out.includes(s));
    queue.push(...standIns.flatMap(neighbours));
    out.push(...standIns);
  }
  const res = out.filter((s) => s !== c);
  chains.set(c, res);
  return res;
}

// ---- what a drum is called, and where it goes on the drum chart

const ART = { hit: '', rimshot: 'rimshot', rim: 'rim', sidestick: 'side stick', side: 'side', flam: 'flam', ghost: 'ghost', off: 'off-centre', ruff: 'ruff', edge: 'edge', bow: 'bow', bowtip: 'bow (tip)', bell: 'bell', belltip: 'bell (tip)', mute: 'choke', tip: 'tip' };
const HAT_OPEN = { tight: 'tight', closed: 'closed', cc: 'closed (pedal down)', pedal: 'pedal', pedalsplash: 'foot splash', loose: 'loose' };
const CYM_NAME = { crash: 'Crash', china: 'China', splash: 'Splash', stack: 'Stack', bell: 'Bell' };
const TOM_NAME = (pos) => (pos.startsWith('rack') ? `Rack tom ${pos.slice(4)}` : `Floor tom ${pos.slice(5)}`);
/** A drum name people read: "snare1.rimshot" → "Snare rimshot", "hat.open2.tip" → "Hi-hat open 2 (tip)". */
export function canonLabel(c) {
  const x = parseCanon(c);
  const art = (a) => (ART[a] ? ` ${ART[a]}` : '');
  switch (x.kind) {
    case 'kick': return x.a === 'main' ? 'Kick' : x.a === 'left' ? 'Kick (left foot)' : 'Kick 2';
    case 'snare': return `${x.idx === 1 ? 'Snare' : 'Snare 2'}${art(x.a)}`;
    case 'tom': return `${TOM_NAME(x.pos)}${art(x.a)}`;
    case 'hat':
    case 'aux': {
      const o = HAT_OPEN[x.o] || (x.o.startsWith('open') ? `open${x.o.length > 4 ? ` ${x.o.slice(4)}` : ''}` : x.o);
      return `${x.kind === 'hat' ? 'Hi-hat' : `Hi-hat ${x.idx + 1}`} ${o}${x.z === 'plain' ? '' : ` (${x.z})`}`;
    }
    case 'cym': return `${CYM_NAME[x.slot]}${x.slot === 'bell' || CYM_COUNT[x.slot] > 1 ? ` ${x.idx}` : ''}${art(x.a)}`;
    case 'ride': return `${x.idx === 1 ? 'Ride' : 'Ride 2'}${x.a === 'bow' ? '' : art(x.a)}`;
    default: {
      const s = x.name.replace(/\./g, ' ');
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
  }
}

/** The drum chart lane for a drum name (lanes as in drums.js), or null for percussion. */
export function canonLane(c) {
  const x = parseCanon(c);
  switch (x.kind) {
    case 'kick': return 'kick';
    case 'snare': return 'snare';
    case 'hat':
    case 'aux': return 'hihat';
    case 'tom': return x.pos.startsWith('floor') ? 'floor' : ['rack1', 'rack2'].includes(x.pos) ? 'tom1' : 'tom2';
    case 'cym': return x.slot === 'crash' ? (x.idx === 1 ? 'crash' : 'crash2') : x.slot === 'splash' ? 'crash2' : x.slot === 'bell' ? 'ride' : 'china';
    case 'ride': return 'ride';
    default: return null;
  }
}

/** Note number and its name, with middle C (60) as C3 like most DAWs and drum engines: 36 → "C1". */
export function noteName(n) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return `${names[n % 12]}${Math.floor(n / 12) - 2}`;
}

// ---- converting

/**
 * Toms when the destination can't give each source tom its own drum: if the nearest-tom rule would put two
 * of the toms the file plays on one tom while the destination has others free, spread them over the
 * destination's toms in order, high to low, so a fill still runs down the kit. Map(sourcePos -> destPos).
 */
function tomSpread(from, to, used, missing) {
  const out = new Map();
  if (missing === 'drop') return out;
  const pos = (e, notes) => [...new Set(notes.map((n) => e.notes.get(n)).filter(Boolean).map(parseCanon).filter((x) => x.kind === 'tom').map((x) => x.pos))].sort((a, b) => TOMS.indexOf(a) - TOMS.indexOf(b));
  const src = pos(from, [...used.keys()]);
  const dst = pos(to, [...to.notes.keys()]);
  if (src.length < 2 || !dst.length) return out;
  const near = src.map((p) => (dst.includes(p) ? p : nearest(p, TOMS, (a, b) => Math.abs(TOMS.indexOf(a) - TOMS.indexOf(b))).find((q) => dst.includes(q))));
  if (new Set(near).size === near.length) return out; // every tom the file plays already has its own
  src.forEach((p, i) => out.set(p, dst[Math.round((i * (dst.length - 1)) / (src.length - 1))]));
  return out;
}

/**
 * Where every source note goes. `used` is a Map(note -> count) of the notes the file plays.
 * missing: 'nearest' (a stand-in, possibly another drum) | 'drop' (only another stroke of the same drum).
 * unknown: 'remove' | 'keep' for notes the source map doesn't know.
 * Returns { map: Map(note -> newNote | null), rows: [{ note, count, canon, to, toCanon, how }], stats }.
 * how: 'same' | 'stand-in' | 'dropped' | 'unknown-removed' | 'unknown-kept'.
 */
export function plan(fromId, toId, used, { missing = 'nearest', unknown = 'remove' } = {}) {
  const from = engine(fromId);
  const to = engine(toId);
  if (!from || !to) throw new Error('Pick a source and a destination drum map.');
  const spread = tomSpread(from, to, used, missing);
  const map = new Map();
  const rows = [];
  for (const [note, count] of [...used.entries()].sort((a, b) => a[0] - b[0])) {
    const canon = from.notes.get(note);
    if (!canon) {
      const keep = unknown === 'keep';
      map.set(note, keep ? note : null);
      rows.push({ note, count, canon: null, to: keep ? note : null, toCanon: keep ? to.notes.get(note) || null : null, how: keep ? 'unknown-kept' : 'unknown-removed' });
      continue;
    }
    const x = parseCanon(canon);
    const want = x.kind === 'tom' && spread.has(x.pos) ? canonOf({ ...x, pos: spread.get(x.pos) }) : canon;
    const chain = [want, ...fallbackChain(want).filter((c) => missing === 'nearest' || sameDrum(canon, c))];
    const hit = chain.find((c) => to.byCanon.has(c));
    const dest = hit ? to.byCanon.get(hit)[0] : null;
    map.set(note, dest);
    rows.push({ note, count, canon, to: dest, toCanon: hit || null, how: !hit ? 'dropped' : hit === canon ? 'same' : 'stand-in' });
  }
  const sum = (how) => rows.filter((r) => how.includes(r.how)).reduce((a, r) => a + r.count, 0);
  return { map, rows, stats: { notes: sum(['same', 'stand-in', 'dropped', 'unknown-removed', 'unknown-kept']), same: sum(['same']), standIn: sum(['stand-in']), dropped: sum(['dropped', 'unknown-removed']), kept: sum(['unknown-kept']) } };
}

/**
 * Which maps a file was most likely written for, from the notes it plays: the share of hits each map
 * knows, best first: [{ engine, fit }] (fit 0..1). Maps with a hub (the well-known ones) win ties.
 */
export function guessEngines(used, max = 4) {
  const total = [...used.values()].reduce((a, b) => a + b, 0) || 1;
  return engines()
    .filter((e) => !e.variant)
    .map((e) => {
      let known = 0;
      let primary = 0;
      for (const [n, c] of used) {
        const canon = e.notes.get(n);
        if (!canon) continue;
        known += c;
        if (e.byCanon.get(canon)[0] === n) primary += c;
      }
      return { engine: e, fit: known / total, score: known / total + (primary / total) * 0.01 + (e.hub ? 0.001 : 0) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(({ engine: e, fit }) => ({ engine: e, fit: +fit.toFixed(3) }));
}

/** A drum note to its chart lane with a given map (GM when the map is unknown). */
export function laneFor(mapId, note) {
  const e = engine(mapId) || engine('general_midi');
  const c = e && e.notes.get(note);
  return c ? canonLane(c) : null;
}
