// Section detection on synthetic songs: sections of different chords and timbres, repeated, with a steady beat.
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSections, snapBoundary, proposalAgainst, pickPeaks } from '../js/sectiondetect.js';

const SR = 22050;
const PARTS = {
  // a quiet single note
  I: { notes: [220], harm: 1, amp: 0.05, noise: 0 },
  // C major, mellow (3 harmonics)
  A: { notes: [261.63, 329.63, 392.0], harm: 3, amp: 0.12, noise: 0 },
  // F# major, bright and loud with some grit
  B: { notes: [369.99, 466.16, 554.37], harm: 8, amp: 0.25, noise: 0.04 },
  // A minor, odd harmonics only (hollow)
  C: { notes: [220, 261.63, 329.63], harm: 9, odd: true, amp: 0.14, noise: 0 },
};

/** plan: [[part, seconds]] → Float32Array at SR, with a kick every 0.5 s (120 BPM) throughout. */
function synth(plan) {
  const total = plan.reduce((a, [, s]) => a + s, 0);
  const out = new Float32Array(Math.round(total * SR));
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  let t0 = 0;
  for (const [k, secs] of plan) {
    const p = PARTS[k];
    const a = Math.round(t0 * SR);
    const b = Math.round((t0 + secs) * SR);
    for (let i = a; i < b; i++) {
      const t = i / SR;
      let v = 0;
      for (const f of p.notes) for (let h = 1; h <= p.harm; h++) if (!p.odd || h % 2) v += Math.sin(2 * Math.PI * f * h * t) / h;
      out[i] = (p.amp * v) / p.notes.length + p.noise * rnd();
    }
    t0 += secs;
  }
  for (let t = 0; t < total; t += 0.5) {
    const s = Math.round(t * SR);
    for (let i = 0; i < 0.12 * SR && s + i < out.length; i++) out[s + i] += 0.2 * Math.sin(2 * Math.PI * 60 * (i / SR)) * Math.exp(-i / (0.03 * SR));
  }
  return out;
}

const bounds = (r) => r.sections.slice(1).map((s) => s.start);
const near = (got, want, tol, msg) => {
  assert.equal(got.length, want.length, `${msg}: ${JSON.stringify(got)}`);
  got.forEach((g, i) => assert.ok(Math.abs(g - want[i]) <= tol, `${msg}: boundary ${g} vs ${want[i]} (${JSON.stringify(got)})`));
};

test('A-B-A-B: boundaries within 1.5 s, the loud repeated part is the Chorus', async () => {
  const r = await detectSections(synth([['A', 16], ['B', 16], ['A', 16], ['B', 16]]), SR);
  near(bounds(r), [16, 32, 48], 1.5, 'ABAB');
  assert.deepEqual(r.sections.map((s) => s.label), ['Verse', 'Chorus', 'Verse', 'Chorus']);
  assert.ok(['good', 'fair'].includes(r.confidence), r.confidence);
  assert.ok(Math.abs(r.bpm - 120) < 3 || Math.abs(r.bpm - 60) < 2, `bpm ${r.bpm}`);
  assert.match(r.note, /metal/);
});

test('intro, verses, choruses, a bridge: each named by its place', async () => {
  const r = await detectSections(synth([['I', 8], ['A', 16], ['B', 16], ['A', 16], ['B', 16], ['C', 12], ['B', 16]]), SR);
  near(bounds(r), [8, 24, 40, 56, 72, 84], 1.5, 'full song');
  assert.deepEqual(r.sections.map((s) => s.label), ['Intro', 'Verse', 'Chorus', 'Verse', 'Chorus', 'Bridge', 'Chorus']);
  assert.equal(r.sections[r.sections.length - 1].end, 100);
});

test('timed lyrics: a boundary moves to the line start near it, and repeated lyrics mark the chorus', async () => {
  const lines = [
    { start: 1, text: 'first verse line' },
    { start: 16.9, text: 'this is the chorus' },
    { start: 20, text: 'sing it again' },
    { start: 33, text: 'second verse line' },
    { start: 48.9, text: 'this is the chorus' },
    { start: 52, text: 'sing it again' },
  ];
  const r = await detectSections(synth([['A', 16], ['B', 16], ['A', 16], ['B', 16]]), SR, { lines });
  const b = bounds(r);
  assert.equal(b[0], 16.9);
  assert.equal(b[2], 48.9);
  assert.equal(r.sections[1].label, 'Chorus');
  assert.match(r.note, /moved to the start of a lyric line/);
});

test('progress is reported and an aborted run rejects with AbortError', async () => {
  const seen = [];
  await detectSections(synth([['A', 12], ['B', 12]]), SR, { onProgress: (x) => seen.push(x) });
  assert.ok(seen.length > 2 && seen[seen.length - 1] === 1);
  const ac = new AbortController();
  const run = detectSections(synth([['A', 30], ['B', 30]]), SR, { signal: ac.signal, onProgress: () => ac.abort() });
  await assert.rejects(run, (e) => e.name === 'AbortError');
});

test('a short file gives no sections', async () => {
  const r = await detectSections(new Float32Array(SR * 10), SR);
  assert.deepEqual(r.sections, []);
});

test('snapBoundary: lyric line first, then a beat, else unchanged', () => {
  assert.deepEqual(snapBoundary(10, { lineStarts: [11.5, 30] }), { t: 11.5, to: 'lyric' });
  assert.deepEqual(snapBoundary(10, { lineStarts: [13], beats: { period: 0.5, beats: [9.4, 9.9, 10.4] } }), { t: 9.9, to: 'beat' });
  assert.deepEqual(snapBoundary(10, {}), { t: 10, to: '' });
});

test('pickPeaks keeps the strongest peaks apart', () => {
  const nov = new Float64Array(100);
  nov[20] = 1;
  nov[24] = 0.9;
  nov[60] = 0.8;
  const { peaks } = pickPeaks(nov, { minGap: 10, edge: 2 });
  assert.deepEqual(peaks, [20, 60]);
});

test('proposalAgainst marks detected sections that would clash with typed ones', () => {
  const typed = [{ id: 'a', label: 'My intro', start: 0, end: null }, { id: 'b', label: 'Big chorus', start: 41, end: 70 }];
  const p = proposalAgainst(typed, [{ label: 'Intro', start: 0, end: 12 }, { label: 'Verse', start: 12, end: 40 }, { label: 'Chorus', start: 40, end: 70 }, { label: 'Outro', start: 70, end: 90 }], 90);
  assert.deepEqual(p.map((x) => x.clash), ['My intro', 'My intro', 'Big chorus', '']);
});

// a 4-minute song closer to a real one: chords change every 2 s inside each part, noise-burst drums, and the
// chorus uses the verse's chords in another order, played heavier; a bridge on two of the chorus chords
function progSong(plan) {
  const C = [261.63, 329.63, 392];
  const G = [196, 246.94, 293.66];
  const Am = [220, 261.63, 329.63];
  const F = [174.61, 220, 261.63];
  const P = {
    V: { prog: [Am, F, C, G], harm: 6, amp: 0.15, noise: 0.08 },
    K: { prog: [F, G, C, Am], harm: 10, amp: 0.2, noise: 0.18 },
    B: { prog: [G, Am], harm: 10, amp: 0.18, noise: 0.15 },
  };
  const total = plan.reduce((a, [, s]) => a + s, 0);
  const out = new Float32Array(Math.round(total * SR));
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  let t0 = 0;
  for (const [k, secs] of plan) {
    const p = P[k];
    for (let i = Math.round(t0 * SR); i < Math.round((t0 + secs) * SR); i++) {
      const t = i / SR;
      const ch = p.prog[Math.floor((t - t0) / 2) % p.prog.length];
      let v = 0;
      for (const f of ch) for (let h = 1; h <= p.harm; h++) v += Math.sin(2 * Math.PI * f * h * t) / h;
      out[i] = (p.amp * v) / ch.length + p.noise * rnd();
    }
    t0 += secs;
  }
  for (let t = 0; t < total; t += 0.5) {
    const s = Math.round(t * SR);
    for (let i = 0; i < 0.1 * SR && s + i < out.length; i++) out[s + i] += 0.25 * rnd() * Math.exp(-i / (0.02 * SR));
  }
  return out;
}

test('4-minute song with chord progressions: boundaries within 3 s, chorus, verse and bridge found, under 5 s', async () => {
  const mono = progSong([['V', 32], ['K', 24], ['V', 24], ['K', 24], ['B', 16], ['K', 32], ['V', 8], ['K', 80]]);
  const t = Date.now();
  const r = await detectSections(mono, SR);
  assert.ok(Date.now() - t < 5000, `${Date.now() - t} ms`);
  near(bounds(r), [32, 56, 80, 104, 120, 152, 160], 3, 'progressions');
  assert.deepEqual(r.sections.map((s) => s.label), ['Verse', 'Chorus', 'Verse', 'Chorus', 'Bridge', 'Chorus', 'Verse', 'Chorus']);
});
