// The show plan (run of show) and the stage plot. Pure functions: the planner tabs draw them and
// "Export PDF" prints them.
//
// Show plan: kept on the show as `show.plan`. Doors, when the first band starts, each band's set
// length and changeover, the curfew, and our setlist with song lengths. Times are worked out.
// Stage plot: kept on the artist as `band.stage`. Gear placed on a stage (x and y from 0 to 1,
// the audience at the bottom), from which the input list and monitor mixes are made.
import { esc, escBr, docHTML } from './pdf.js';

let n = 0;
const sid = (p) => `${p}_${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// ---------------------------------------------------------------- time helpers
/** "19:30" → minutes after midnight (null when empty or invalid). */
export function toMin(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
  if (!m || +m[1] > 47 || +m[2] > 59) return null;
  return +m[1] * 60 + +m[2];
}
/** Minutes after midnight → "19:30" (wraps past midnight). */
export const fromMin = (v) => `${String(Math.floor((((v % 1440) + 1440) % 1440) / 60)).padStart(2, '0')}:${String(((v % 60) + 60) % 60).padStart(2, '0')}`;
/** "3:45" or "3" or "225s" → seconds (0 when unreadable). */
export function toSec(s) {
  const t = String(s ?? '').trim();
  let m = /^(\d+):(\d{1,2})$/.exec(t);
  if (m) return +m[1] * 60 + +m[2];
  m = /^(\d+)\s*s$/i.exec(t);
  if (m) return +m[1];
  m = /^(\d+(?:\.\d+)?)$/.exec(t);
  return m ? Math.round(+m[1] * 60) : 0;
}
/** Seconds → "3:45". */
export const fromSec = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------- show plan
/** A new plan for a show, from its lineup, doors and setlist. Headliner 45 min, others 30. */
export function newPlan(show = {}, { band = '', songs = [] } = {}) {
  const lineup = (show.lineup || []).filter((b) => b.name);
  const names = lineup.length ? lineup.map((b) => b.name) : [band || 'Us'];
  const set = String(show.setlist || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
  return {
    doors: show.doors || '19:00',
    firstAfter: 30,
    curfew: '23:00',
    slots: names.map((name, i) => ({ id: sid('slot'), name, minutes: i === names.length - 1 ? 45 : 30, changeover: i === names.length - 1 ? 0 : 15 })),
    setlist: set.map((title) => {
      const sg = songs.find((x) => x.title.toLowerCase() === title.toLowerCase());
      return { id: sid('sl'), title, length: sg && sg.seconds ? fromSec(sg.seconds) : '', note: '' };
    }),
    notes: '',
  };
}

/** Fill in anything an older plan is missing. */
export function normalizePlan(p) {
  if (!p || typeof p !== 'object') return null;
  return {
    doors: typeof p.doors === 'string' ? p.doors : '19:00',
    firstAfter: Number.isFinite(+p.firstAfter) ? +p.firstAfter : 30,
    curfew: typeof p.curfew === 'string' ? p.curfew : '',
    slots: (Array.isArray(p.slots) ? p.slots : []).filter((x) => x && typeof x === 'object').map((x) => ({ id: x.id || sid('slot'), name: String(x.name || ''), minutes: Math.max(0, +x.minutes || 0), changeover: Math.max(0, +x.changeover || 0) })),
    setlist: (Array.isArray(p.setlist) ? p.setlist : []).filter((x) => x && typeof x === 'object').map((x) => ({ id: x.id || sid('sl'), title: String(x.title || ''), length: String(x.length || ''), note: String(x.note || '') })),
    notes: String(p.notes || ''),
  };
}

/**
 * The night hour by hour: doors, each set and changeover with start and end times, and the
 * curfew. `over` is how many minutes the last set runs past the curfew (0 when it fits).
 */
export function runOfShow(plan) {
  const doors = toMin(plan.doors);
  const rows = [];
  if (doors == null) return { rows, over: 0, end: null };
  rows.push({ kind: 'doors', name: 'Doors', start: fromMin(doors), end: '' });
  let t = doors + (+plan.firstAfter || 0);
  plan.slots.forEach((s, i) => {
    rows.push({ kind: 'set', id: s.id, name: s.name || `Band ${i + 1}`, start: fromMin(t), end: fromMin(t + s.minutes), minutes: s.minutes });
    t += s.minutes;
    if (s.changeover && i < plan.slots.length - 1) {
      rows.push({ kind: 'changeover', name: 'Changeover', start: fromMin(t), end: fromMin(t + s.changeover), minutes: s.changeover });
      t += s.changeover;
    }
  });
  const cur = toMin(plan.curfew);
  // a curfew earlier than doors means after midnight
  const curfew = cur == null ? null : cur <= doors ? cur + 1440 : cur;
  if (curfew != null) rows.push({ kind: 'curfew', name: 'Curfew', start: fromMin(curfew), end: '' });
  return { rows, over: curfew != null ? Math.max(0, t - curfew) : 0, end: fromMin(t) };
}

/** Our set with running times: each song's start from the top of the set, and the total. */
export function setTimings(plan, ourName = '') {
  const run = runOfShow(plan);
  const ours = run.rows.find((r) => r.kind === 'set' && ourName && r.name.toLowerCase() === ourName.toLowerCase());
  const startMin = ours ? toMin(ours.start) : null;
  let at = 0;
  const rows = plan.setlist.map((s, i) => {
    const sec = toSec(s.length);
    const row = { ...s, n: i + 1, sec, from: fromSec(at), clock: startMin != null ? fromMin(startMin + Math.floor(at / 60)) : '' };
    at += sec;
    return row;
  });
  const slot = ours ? ours.minutes * 60 : 0;
  return { rows, total: at, totalText: fromSec(at), slot, spare: slot ? slot - at : null, missing: rows.filter((r) => !r.sec).length };
}

/** The run of show as a printable document. */
export function showPlanHTML(show, plan, { band = '' } = {}) {
  const run = runOfShow(plan);
  const set = setTimings(plan, band);
  const runRows = run.rows.map((r) => `<tr${r.kind === 'set' && r.name.toLowerCase() === String(band).toLowerCase() ? ' style="font-weight:700"' : ''}><td class="n">${esc(r.start)}</td><td class="n">${esc(r.end)}</td><td>${esc(r.name)}</td><td class="n">${r.minutes ? `${r.minutes} min` : ''}</td></tr>`).join('');
  const setRows = set.rows.map((r) => `<tr><td class="n">${r.n}</td><td>${esc(r.title)}</td><td class="n">${r.sec ? esc(fromSec(r.sec)) : '?'}</td><td class="n">${esc(r.clock || r.from)}</td><td>${esc(r.note)}</td></tr>`).join('');
  const body = `<h2>Run of show</h2>${runRows ? `<table><tr><th class="n">Start</th><th class="n">End</th><th>What</th><th class="n">Length</th></tr>${runRows}</table>` : '<p class="muted">Set the doors time to work out the night.</p>'}
${run.over ? `<p><b>Runs ${run.over} min past the curfew.</b> Trim sets or changeovers.</p>` : ''}
${set.rows.length ? `<h2>Our setlist · ${esc(set.totalText)}${set.slot ? ` of ${Math.round(set.slot / 60)} min` : ''}</h2><table><tr><th class="n">#</th><th>Song</th><th class="n">Length</th><th class="n">Starts</th><th>Notes</th></tr>${setRows}</table>` : ''}
${plan.notes ? `<h2>Notes</h2><p>${escBr(plan.notes)}</p>` : ''}`;
  return docHTML(`${show.venue || 'Show'} · show plan`, body, { subtitle: [show.date, show.city, band].filter(Boolean).join(' · ') });
}

// ---------------------------------------------------------------- stage plot
/**
 * Gear you can put on the stage. `inputs` are the channels it needs at the desk (with a
 * suggested mic), `w`/`h` its size on a 1000 × 600 stage drawing.
 */
export const STAGE_GEAR = {
  drums: { label: 'Drum kit', w: 150, h: 120, inputs: [['Kick', 'Beta 91 / D112'], ['Snare', 'SM57'], ['Hi-hat', 'Small condenser'], ['Rack tom', 'e604'], ['Floor tom', 'e604'], ['Overhead L', 'Condenser'], ['Overhead R', 'Condenser']] },
  guitar: { label: 'Guitar amp', w: 90, h: 50, inputs: [['Guitar amp', 'SM57']] },
  bass: { label: 'Bass amp', w: 90, h: 60, inputs: [['Bass DI', 'DI box'], ['Bass amp', 'RE20 / D112']] },
  keys: { label: 'Keys', w: 120, h: 40, inputs: [['Keys L', 'DI box'], ['Keys R', 'DI box']] },
  vocal: { label: 'Vocal mic', w: 34, h: 34, inputs: [['Vocal', 'SM58']] },
  di: { label: 'DI box', w: 30, h: 24, inputs: [['DI', 'DI box']] },
  tracks: { label: 'Tracks / laptop', w: 60, h: 36, inputs: [['Tracks L', 'DI box'], ['Tracks R', 'DI box'], ['Click (to IEM only)', 'DI box']] },
  wedge: { label: 'Monitor wedge', w: 60, h: 30, inputs: [] },
  iem: { label: 'In-ear pack', w: 30, h: 30, inputs: [] },
  power: { label: 'Power', w: 28, h: 28, inputs: [] },
  riser: { label: 'Drum riser', w: 220, h: 160, inputs: [] },
  person: { label: 'Player', w: 40, h: 40, inputs: [] },
};

/** Ready-made stages for common lineups. */
export const STAGE_PRESETS = {
  four: { label: 'Four-piece rock', items: [['riser', 0.5, 0.2], ['drums', 0.5, 0.2], ['guitar', 0.2, 0.18], ['bass', 0.8, 0.18], ['vocal', 0.5, 0.72, 'Lead vocal'], ['vocal', 0.25, 0.62, 'Backing vocal (guitar)'], ['vocal', 0.75, 0.62, 'Backing vocal (bass)'], ['wedge', 0.5, 0.9], ['wedge', 0.25, 0.85], ['wedge', 0.75, 0.85], ['power', 0.2, 0.05], ['power', 0.8, 0.05], ['power', 0.66, 0.05]] },
  five: { label: 'Five-piece, two guitars', items: [['riser', 0.5, 0.2], ['drums', 0.5, 0.2], ['guitar', 0.15, 0.2, 'Guitar 1 amp'], ['guitar', 0.32, 0.12, 'Guitar 2 amp'], ['bass', 0.82, 0.18], ['vocal', 0.5, 0.74, 'Lead vocal'], ['vocal', 0.2, 0.62, 'Backing vocal'], ['vocal', 0.8, 0.62, 'Backing vocal'], ['wedge', 0.5, 0.9], ['wedge', 0.2, 0.85], ['wedge', 0.8, 0.85], ['power', 0.15, 0.05], ['power', 0.85, 0.05]] },
  tracks: { label: 'Trio with tracks', items: [['riser', 0.5, 0.2], ['drums', 0.5, 0.2], ['tracks', 0.72, 0.12], ['guitar', 0.22, 0.18], ['vocal', 0.5, 0.74, 'Lead vocal'], ['vocal', 0.22, 0.62, 'Backing vocal'], ['iem', 0.62, 0.3, 'Drummer IEM + click'], ['wedge', 0.5, 0.9], ['wedge', 0.22, 0.85], ['power', 0.72, 0.05]] },
};

export const newStageItem = (type, x = 0.5, y = 0.5, label = '') => ({ id: sid('gear'), type, x, y, label });
export const newStage = (preset = 'four') => ({ items: (STAGE_PRESETS[preset] || STAGE_PRESETS.four).items.map(([t, x, y, l]) => newStageItem(t, x, y, l || '')), notes: '', backline: '' });

export function normalizeStage(s) {
  if (!s || typeof s !== 'object') return null;
  const clamp01 = (v) => Math.min(1, Math.max(0, Number.isFinite(+v) ? +v : 0.5));
  return {
    items: (Array.isArray(s.items) ? s.items : []).filter((x) => x && STAGE_GEAR[x.type]).map((x) => ({ id: x.id || sid('gear'), type: x.type, x: clamp01(x.x), y: clamp01(x.y), label: String(x.label || '') })),
    notes: String(s.notes || ''),
    backline: String(s.backline || ''),
  };
}

/** What a piece of gear is called on the plot: its own label, or the gear name (numbered when repeated). */
export function gearNames(items) {
  const count = {};
  const total = {};
  for (const it of items) total[it.type] = (total[it.type] || 0) + 1;
  // numbered left to right as the audience sees the stage, so names match the mix numbers
  return Object.fromEntries([...items].sort((x, y) => x.x - y.x).map((it) => {
    count[it.type] = (count[it.type] || 0) + 1;
    const base = STAGE_GEAR[it.type].label;
    return [it.id, it.label || (total[it.type] > 1 ? `${base} ${count[it.type]}` : base)];
  }));
}

/**
 * The input list for the sound engineer: one row per channel, in the usual order (drums first,
 * then bass, guitars, keys, tracks, other DIs, vocals). Mics on a stand are marked.
 */
export function inputList(stage) {
  const order = ['drums', 'bass', 'guitar', 'keys', 'tracks', 'di', 'vocal'];
  const rows = [];
  for (const type of order) {
    const same = stage.items.filter((x) => x.type === type);
    const byX = [...same].sort((x, y) => x.x - y.x); // unlabelled ones are numbered left to right
    same.forEach((it) => {
      const k = byX.indexOf(it);
      const ins = STAGE_GEAR[type].inputs;
      const prefix = it.label || (same.length > 1 ? `${STAGE_GEAR[type].label} ${k + 1}` : '');
      for (const [name, mic] of ins) {
        const label = ins.length === 1 ? it.label || (same.length > 1 ? `${name} ${k + 1}` : name) : prefix ? `${prefix}: ${name}` : name;
        const stand = /DI/.test(mic) ? '' : /Kick|Bass amp/.test(name) ? 'Short boom' : /tom/i.test(name) ? 'Clip' : 'Boom';
        rows.push({ ch: rows.length + 1, name: label, mic, stand });
      }
    });
  }
  return rows;
}

/** Monitor mixes: one per wedge or in-ear pack, numbered left to right from the audience's view. */
export function monitorMixes(stage) {
  const names = gearNames(stage.items);
  return stage.items.filter((x) => x.type === 'wedge' || x.type === 'iem').sort((a, b) => a.x - b.x).map((it, i) => ({ mix: i + 1, name: it.label || names[it.id], type: it.type === 'iem' ? 'In-ear' : 'Wedge' }));
}

// the stage area inside the drawing (the edges are labelled above and below it)
export const STAGE_TOP = 40;
export const STAGE_H = 600;

/** One piece of gear as SVG at its place on the stage. */
function gearSVG(it, name) {
  const g = STAGE_GEAR[it.type];
  const cx = Math.round(it.x * 1000);
  const cy = Math.round(STAGE_TOP + it.y * STAGE_H);
  const x = cx - g.w / 2;
  const y = cy - g.h / 2;
  let shape = '';
  switch (it.type) {
    case 'drums':
      shape = `<circle cx="${cx}" cy="${cy + 18}" r="26" class="sp-fill"/><circle cx="${cx - 40}" cy="${cy - 10}" r="17" class="sp-fill"/><circle cx="${cx + 40}" cy="${cy - 10}" r="17" class="sp-fill"/><circle cx="${cx + 52}" cy="${cy + 32}" r="21" class="sp-fill"/><circle cx="${cx - 52}" cy="${cy + 26}" r="14" class="sp-fill"/><circle cx="${cx - 66}" cy="${cy - 38}" r="16" class="sp-line"/><circle cx="${cx + 66}" cy="${cy - 38}" r="18" class="sp-line"/><circle cx="${cx}" cy="${cy - 40}" r="9" class="sp-line"/>`;
      break;
    case 'vocal':
      shape = `<circle cx="${cx}" cy="${cy}" r="11" class="sp-fill"/><line x1="${cx}" y1="${cy + 11}" x2="${cx}" y2="${cy + 22}" class="sp-stroke"/>`;
      break;
    case 'wedge':
      shape = `<path d="M${x} ${y + g.h}L${x + 10} ${y}H${x + g.w - 10}L${x + g.w} ${y + g.h}Z" class="sp-fill"/>`;
      break;
    case 'iem':
    case 'power':
      shape = `<rect x="${x}" y="${y}" width="${g.w}" height="${g.h}" rx="6" class="sp-line"/><text x="${cx}" y="${cy + 5}" class="sp-ico">${it.type === 'power' ? '⚡' : 'IEM'}</text>`;
      break;
    case 'riser':
      shape = `<rect x="${x}" y="${y}" width="${g.w}" height="${g.h}" rx="4" class="sp-riser"/>`;
      break;
    case 'person':
      shape = `<circle cx="${cx}" cy="${cy}" r="18" class="sp-line"/>`;
      break;
    default:
      shape = `<rect x="${x}" y="${y}" width="${g.w}" height="${g.h}" rx="4" class="sp-fill"/>`;
  }
  // a riser's name sits small in its top-left corner, so it doesn't cover the kit's
  const text = it.type === 'riser' ? `<text x="${x + 8}" y="${y + 16}" class="sp-small">${esc(name)}</text>` : `<text x="${cx}" y="${y + g.h + 16}" class="sp-label">${esc(name)}</text>`;
  return `<g class="sp-item sp-t-${it.type}" data-id="${esc(it.id)}">${shape}${text}</g>`;
}

/** The stage drawing as SVG (the audience at the bottom). Risers are drawn under everything else. */
export function stagePlotSVG(stage, { title = '' } = {}) {
  const names = gearNames(stage.items);
  const items = [...stage.items].sort((a, b) => (a.type === 'riser' ? -1 : 0) - (b.type === 'riser' ? -1 : 0));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 680" class="sp-svg" role="img" aria-label="${esc(title || 'Stage plot')}">
<style>.sp-stage{fill:#fafafa;stroke:#222;stroke-width:3}.sp-fill{fill:#d9d9d9;stroke:#222;stroke-width:2}.sp-line{fill:#fff;stroke:#222;stroke-width:2}.sp-stroke{stroke:#222;stroke-width:3}.sp-riser{fill:#eee;stroke:#666;stroke-width:2;stroke-dasharray:8 6}.sp-label{font:600 15px system-ui,sans-serif;fill:#111;text-anchor:middle}.sp-ico{font:700 13px system-ui,sans-serif;fill:#111;text-anchor:middle}.sp-small{font:italic 400 13px system-ui,sans-serif;fill:#555}.sp-edge{font:700 13px system-ui,sans-serif;fill:#666;text-anchor:middle;letter-spacing:.2em}</style>
<text x="500" y="20" class="sp-edge">BACK OF STAGE</text>
<rect x="2" y="30" width="996" height="620" rx="8" class="sp-stage"/>
${items.map((it) => gearSVG(it, names[it.id])).join('\n')}
<text x="500" y="672" class="sp-edge">AUDIENCE</text>
</svg>`;
}

/** The stage plot, input list and monitor mixes as one printable page. */
export function stagePlotHTML(stage, band = {}) {
  const inputs = inputList(stage);
  const mixes = monitorMixes(stage);
  const body = `<div class="box">${stagePlotSVG(stage, { title: `${band.name || 'Band'} stage plot` })}</div>
<div class="two"><div><h2>Input list · ${inputs.length} channels</h2>${inputs.length ? `<table><tr><th class="n">Ch</th><th>Input</th><th>Mic / DI</th><th>Stand</th></tr>${inputs.map((r) => `<tr><td class="n">${r.ch}</td><td>${esc(r.name)}</td><td>${esc(r.mic)}</td><td>${esc(r.stand)}</td></tr>`).join('')}</table>` : '<p class="muted">No inputs.</p>'}</div>
<div>${mixes.length ? `<h2>Monitor mixes</h2><table><tr><th class="n">Mix</th><th>Who</th><th>Type</th></tr>${mixes.map((r) => `<tr><td class="n">${r.mix}</td><td>${esc(r.name)}</td><td>${r.type}</td></tr>`).join('')}</table>` : ''}
${stage.backline ? `<h2>Backline</h2><p>${escBr(stage.backline)}</p>` : ''}
${stage.notes ? `<h2>Notes for the engineer</h2><p>${escBr(stage.notes)}</p>` : ''}
${band.email || band.phone ? `<h2>Contact</h2><p>${esc([band.email, band.phone].filter(Boolean).join(' · '))}</p>` : ''}</div></div>`;
  return docHTML(`${band.name || 'Band'} · stage plot`, body, { subtitle: 'Audience at the bottom. Input list and monitor mixes below.', css: '.sp-svg{width:100%;height:auto;display:block}' });
}
