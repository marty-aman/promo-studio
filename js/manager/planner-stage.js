// Show planner tabs: the show plan (run of show and our timed setlist) and the stage plot creator
// (drag gear on a stage; the input list and monitor mixes are made from it). Both export to PDF.
import { h, button, iconButton, toast } from '../dom.js';
import { niceDate } from './model.js';
import { exportPDF } from './pdf.js';
import { songSeconds } from './setlist.js';
import { setlistSongs } from './covers.js';
import { newPlan, normalizePlan, runOfShow, setTimings, showPlanHTML, fromSec, STAGE_GEAR, STAGE_PRESETS, newStage, newStageItem, normalizeStage, inputList, monitorMixes, stagePlotSVG, stagePlotHTML, gearNames, STAGE_H } from './showplan.js';

export const planUI = { showId: null };
export const stageUI = { sel: null };
const pdfNote = () => toast('Pick “Save as PDF” as the printer to get a PDF.');

/** Song lengths from each song's audio file in the media library, for the setlist timings. */
// your songs and your covers, with their lengths
const songLengths = (ctx) => setlistSongs(ctx.store.get()).map((s) => ({ title: s.title, seconds: songSeconds(s, (id) => (ctx.studio.mediaInfo ? ctx.studio.mediaInfo(id)?.duration : 0) || 0) }));

// ---------------------------------------------------------------- show plan
export function showPlanTab(ctx) {
  const m = ctx.store.get();
  const f = ctx.form;
  const today = ctx.today();
  if (ctx.view.id && m.shows.some((s) => s.id === ctx.view.id)) planUI.showId = ctx.view.id;
  const shows = [...m.shows].filter((s) => s.status !== 'cancelled').sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  const show = shows.find((s) => s.id === planUI.showId) || shows.find((s) => !s.date || s.date >= today) || shows[0];
  if (!show) return h('div', { class: 'mgr-empty' }, h('p', {}, 'Add a show first (Shows, or Build a show here), then plan its night.'), button('Build a show', () => ctx.setTab('build'), { iconName: 'ticket', variant: 'sm primary' }));
  const showSel = h('select', { 'data-k': 'plan-show', 'aria-label': 'Show' }, shows.map((s) => h('option', { value: s.id, selected: s.id === show.id }, `${s.date ? niceDate(s.date, { weekday: false }) : 'No date'} · ${s.venue || 'Venue TBD'}`)));
  showSel.addEventListener('change', () => ((planUI.showId = showSel.value), ctx.go('planner', showSel.value, 'plan')));
  const head = h('div', { class: 'mgr-filters' }, h('label', { class: 'mf inline' }, h('span', { class: 'mf-l' }, 'Show'), showSel), button('Open the show', () => ctx.go('shows', show.id), { variant: 'sm ghost' }));
  const plan = normalizePlan(show.plan);
  if (!plan) {
    return h(
      'div',
      {},
      head,
      h(
        'div',
        { class: 'mgr-empty' },
        h('p', {}, `No plan for ${show.venue || 'this show'} yet. It starts from the show’s lineup, doors time and setlist.`),
        button('Start the show plan', () => ctx.update((d) => {
          const s = d.shows.find((x) => x.id === show.id);
          if (s) s.plan = newPlan(s, { band: d.band.name, songs: songLengths(ctx) });
        }), { iconName: 'clipboard', variant: 'primary' }),
      ),
    );
  }
  const P = (fn) => (d, v) => {
    const s = d.shows.find((x) => x.id === show.id);
    if (!s) return;
    s.plan = normalizePlan(s.plan) || newPlan(s);
    fn(s.plan, v, s);
  };
  const run = runOfShow(plan);
  const set = setTimings(plan, m.band.name);
  const times = new Map(run.rows.filter((r) => r.kind === 'set').map((r) => [r.id, r]));
  const slotRows = plan.slots.map((sl, i) =>
    h(
      'tr',
      {},
      h('td', { class: 'n mono' }, times.get(sl.id) ? `${times.get(sl.id).start}–${times.get(sl.id).end}` : ''),
      h('td', {}, f.text(`pl-sn-${sl.id}`, '', sl.name, P((p, v) => (p.slots.find((x) => x.id === sl.id).name = v)), { placeholder: 'Band', list: 'mgr-plan-bands' })),
      h('td', {}, f.text(`pl-sm-${sl.id}`, '', sl.minutes, P((p, v) => (p.slots.find((x) => x.id === sl.id).minutes = Math.max(0, +v || 0))), { type: 'number', aria: `Minutes: ${sl.name || 'slot'}` })),
      h('td', {}, i < plan.slots.length - 1 ? f.text(`pl-sc-${sl.id}`, '', sl.changeover, P((p, v) => (p.slots.find((x) => x.id === sl.id).changeover = Math.max(0, +v || 0))), { type: 'number', aria: `Changeover after ${sl.name || 'slot'}` }) : h('span', { class: 'muted tiny' }, 'last')),
      h(
        'td',
        { class: 'row' },
        iconButton('arrowUp', 'Play earlier', () => ctx.update(P((p) => {
          const k = p.slots.findIndex((x) => x.id === sl.id);
          if (k > 0) [p.slots[k - 1], p.slots[k]] = [p.slots[k], p.slots[k - 1]];
        })), 'ghost'),
        iconButton('trash', `Remove ${sl.name || 'this set'}`, () => ctx.update(P((p) => (p.slots = p.slots.filter((x) => x.id !== sl.id)))), 'ghost'),
      ),
    ),
  );
  const setRows = set.rows.map((r) =>
    h(
      'tr',
      {},
      h('td', { class: 'n' }, String(r.n)),
      h('td', {}, f.text(`pl-st-${r.id}`, '', r.title, P((p, v) => (p.setlist.find((x) => x.id === r.id).title = v)), { placeholder: 'Song' })),
      h('td', {}, f.text(`pl-sl-${r.id}`, '', r.length, P((p, v) => (p.setlist.find((x) => x.id === r.id).length = v.trim())), { placeholder: '3:30' })),
      h('td', { class: 'n mono' }, r.clock || r.from),
      h('td', {}, f.text(`pl-so-${r.id}`, '', r.note, P((p, v) => (p.setlist.find((x) => x.id === r.id).note = v)), { placeholder: 'Talk, tuning, segue…' })),
      h(
        'td',
        { class: 'row' },
        iconButton('arrowUp', 'Move up', () => ctx.update(P((p) => {
          const k = p.setlist.findIndex((x) => x.id === r.id);
          if (k > 0) [p.setlist[k - 1], p.setlist[k]] = [p.setlist[k], p.setlist[k - 1]];
        })), 'ghost'),
        iconButton('trash', `Remove ${r.title || 'song'}`, () => ctx.update(P((p) => (p.setlist = p.setlist.filter((x) => x.id !== r.id)))), 'ghost'),
      ),
    ),
  );
  const lengths = songLengths(ctx).filter((s) => s.seconds);
  const fillLengths = () => {
    let k = 0;
    ctx.update(P((p) => {
      for (const s of p.setlist) {
        const hit = !s.length && lengths.find((x) => x.title.toLowerCase() === s.title.trim().toLowerCase());
        if (hit) (s.length = fromSec(hit.seconds)), k++;
      }
    }));
    toast(k ? `Filled ${k} song length${k > 1 ? 's' : ''} from the song files` : 'No missing lengths match a song with an audio file.');
  };
  const addSong = (title) => ctx.update(P((p) => {
    const hit = lengths.find((x) => x.title === title);
    p.setlist.push({ id: `sl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, title, length: hit ? fromSec(hit.seconds) : '', note: '' });
  }));
  const pdf = () => (exportPDF(showPlanHTML(show, plan, { band: m.band.name }), `${show.venue || 'Show'} show plan`), pdfNote());
  const bandNames = h('datalist', { id: 'mgr-plan-bands' }, [m.band.name, ...show.lineup.map((b) => b.name), ...m.bands.map((b) => b.name)].filter(Boolean).map((v) => h('option', { value: v })));

  return h(
    'div',
    { class: 'mgr-plan' },
    head,
    bandNames,
    h(
      'div',
      { class: 'mgr-cols' },
      h(
        'section',
        { class: 'mgr-sect' },
        h('div', { class: 'mgr-sect-head' }, h('h2', {}, 'Run of show'), button('Export PDF', pdf, { iconName: 'print', variant: 'sm primary' })),
        h('div', { class: 'mgr-three' }, f.text(`pl-doors-${show.id}`, 'Doors', plan.doors, P((p, v) => (p.doors = v)), { type: 'time' }), f.text(`pl-first-${show.id}`, 'First band after doors (min)', plan.firstAfter, P((p, v) => (p.firstAfter = Math.max(0, +v || 0))), { type: 'number' }), f.text(`pl-curfew-${show.id}`, 'Curfew', plan.curfew, P((p, v) => (p.curfew = v)), { type: 'time' })),
        h('table', { class: 'mgr-table mgr-plan-slots' }, h('thead', {}, h('tr', {}, ['Time', 'Band', 'Set (min)', 'Changeover (min)', ''].map((x) => h('th', {}, x)))), h('tbody', {}, slotRows)),
        h('div', { class: 'row' }, button('Add a set', () => ctx.update(P((p) => p.slots.push({ id: `slot_${Date.now().toString(36)}`, name: '', minutes: 30, changeover: 15 }))), { iconName: 'plus', variant: 'sm ghost' }), button('Use the show’s lineup', () => confirm('Replace these sets with the show’s lineup?') && ctx.update(P((p, _v, s) => (p.slots = newPlan(s, { band: m.band.name }).slots))), { variant: 'sm ghost' })),
        h(
          'ol',
          { class: 'mgr-run' },
          run.rows.map((r) => h('li', { class: `run-${r.kind}${r.kind === 'set' && r.name.toLowerCase() === (m.band.name || '').toLowerCase() ? ' ours' : ''}` }, h('span', { class: 'mono' }, r.start), h('span', {}, r.name), r.end ? h('span', { class: 'muted tiny' }, `until ${r.end}`) : null)),
        ),
        run.over ? h('p', { class: 'warn-list small' }, `The night runs ${run.over} min past the curfew. Shorten a set or a changeover.`) : run.rows.length ? h('p', { class: 'muted tiny' }, `Last set ends ${run.end}.`) : h('p', { class: 'muted tiny' }, 'Set the doors time to work out the night.'),
        f.text(`pl-notes-${show.id}`, 'Notes', plan.notes, P((p, v) => (p.notes = v)), { rows: 3, placeholder: 'Soundcheck order, guest list, merch, who settles…' }),
      ),
      h(
        'section',
        { class: 'mgr-sect' },
        h('div', { class: 'mgr-sect-head' }, h('h2', {}, `Our setlist · ${set.totalText}${set.slot ? ` of ${Math.round(set.slot / 60)} min` : ''}`)),
        set.slot && set.spare != null ? h('p', { class: `small ${set.spare < 0 ? 'warn-list' : 'muted'}` }, set.spare < 0 ? `${fromSec(-set.spare)} too long for the set.` : `${fromSec(set.spare)} spare for talking and tuning.`) : h('p', { class: 'muted tiny' }, `Name a set “${m.band.name}” on the left to get clock times.`),
        set.rows.length ? h('table', { class: 'mgr-table' }, h('thead', {}, h('tr', {}, ['#', 'Song', 'Length', 'Starts', 'Notes', ''].map((x) => h('th', {}, x)))), h('tbody', {}, setRows)) : h('p', { class: 'muted small' }, 'No songs yet. Add them below or write the setlist on the show.'),
        set.missing ? h('p', { class: 'muted tiny' }, `${set.missing} song${set.missing > 1 ? 's have' : ' has'} no length yet (type 3:30).`) : null,
        m.songs.length ? h('div', { class: 'chips' }, m.songs.map((sg) => button(sg.title, () => addSong(sg.title), { variant: 'chip' }))) : null,
        h('div', { class: 'row' }, lengths.length ? button('Fill lengths from song files', fillLengths, { variant: 'sm ghost' }) : null, show.setlist ? button('Use the show’s setlist', () => confirm('Replace this setlist with the one on the show?') && ctx.update(P((p, _v, s) => (p.setlist = newPlan(s, { songs: songLengths(ctx) }).setlist))), { variant: 'sm ghost' }) : null),
      ),
    ),
  );
}

// ---------------------------------------------------------------- stage plot
export function stagePlotTab(ctx) {
  const m = ctx.store.get();
  const f = ctx.form;
  const stage = normalizeStage(m.band.stage);
  const re = () => ctx.setTab('stage');
  const B = (fn) => (d, v) => {
    d.band.stage = normalizeStage(d.band.stage) || newStage();
    fn(d.band.stage, v);
  };
  if (!stage) {
    return h(
      'div',
      { class: 'mgr-empty' },
      h('p', {}, `Make ${m.band.name || 'your band'}’s stage plot: where everyone stands, the amps, mics and monitors. The input list for the sound engineer is made from it.`),
      h('div', { class: 'row' }, Object.entries(STAGE_PRESETS).map(([k, p]) => button(`Start: ${p.label}`, () => ctx.update((d) => (d.band.stage = newStage(k))), { iconName: 'grid', variant: 'sm' })), button('Start empty', () => ctx.update((d) => (d.band.stage = { items: [], notes: '', backline: '' })), { variant: 'sm ghost' })),
    );
  }
  const names = gearNames(stage.items);
  const sel = stage.items.find((x) => x.id === stageUI.sel);
  const canvas = h('div', { class: 'sp-canvas', tabindex: '0', 'aria-label': 'Stage plot. Drag gear to move it. Select an item and use the arrow keys to nudge it.' });
  canvas.innerHTML = stagePlotSVG(stage, { title: `${m.band.name} stage plot` });
  const svg = canvas.querySelector('svg');
  if (sel) svg.querySelector(`[data-id="${CSS.escape(sel.id)}"]`)?.classList.add('sp-sel');
  // drag: move the group while dragging, save the place on release
  let drag = null;
  const pt = (e) => {
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  };
  svg.addEventListener('pointerdown', (e) => {
    const g = e.target.closest('.sp-item');
    if (!g) return;
    e.preventDefault();
    const it = stage.items.find((x) => x.id === g.dataset.id);
    drag = { g, it, start: pt(e), moved: false };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = pt(e);
    const dx = p.x - drag.start.x;
    const dy = p.y - drag.start.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    drag.g.setAttribute('transform', `translate(${dx} ${dy})`);
  });
  const end = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    const p = pt(e);
    stageUI.sel = d.it.id;
    if (!d.moved) return re();
    const x = Math.min(1, Math.max(0, d.it.x + (p.x - d.start.x) / 1000));
    const y = Math.min(1, Math.max(0, d.it.y + (p.y - d.start.y) / STAGE_H));
    ctx.update(B((s) => Object.assign(s.items.find((z) => z.id === d.it.id) || {}, { x: +x.toFixed(3), y: +y.toFixed(3) })));
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', () => (drag = null) || re());
  canvas.addEventListener('keydown', (e) => {
    if (!sel) return;
    const step = e.shiftKey ? 0.05 : 0.01;
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (mv) {
      e.preventDefault();
      ctx.update(B((s) => {
        const it = s.items.find((z) => z.id === sel.id);
        if (it) (it.x = +Math.min(1, Math.max(0, it.x + mv[0])).toFixed(3)), (it.y = +Math.min(1, Math.max(0, it.y + mv[1])).toFixed(3));
      }));
      requestAnimationFrame(() => document.querySelector('.sp-canvas')?.focus());
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      ctx.update(B((s) => (s.items = s.items.filter((z) => z.id !== sel.id))));
      stageUI.sel = null;
    }
  });
  const add = (type) => {
    const it = newStageItem(type, 0.5, 0.5);
    stageUI.sel = it.id;
    ctx.update(B((s) => s.items.push(it)));
  };
  const inputs = inputList(stage);
  const mixes = monitorMixes(stage);
  const pdf = () => (exportPDF(stagePlotHTML(stage, m.band), `${m.band.name || 'Band'} stage plot`), pdfNote());
  const selBox = sel
    ? h(
        'div',
        { class: 'sp-selbox' },
        h('strong', {}, STAGE_GEAR[sel.type].label),
        f.text(`sp-label-${sel.id}`, '', sel.label, B((s, v) => (s.items.find((z) => z.id === sel.id).label = v)), { placeholder: names[sel.id] }),
        button('Duplicate', () => {
          const it = newStageItem(sel.type, Math.min(1, sel.x + 0.06), sel.y, '');
          stageUI.sel = it.id;
          ctx.update(B((s) => s.items.push(it)));
        }, { iconName: 'copy', variant: 'sm ghost' }),
        iconButton('trash', `Remove ${names[sel.id]}`, () => ((stageUI.sel = null), ctx.update(B((s) => (s.items = s.items.filter((z) => z.id !== sel.id))))), 'ghost danger'),
        h('span', { class: 'muted tiny' }, 'Arrow keys nudge it (Shift for bigger steps).'),
      )
    : h('p', { class: 'muted tiny sp-selbox' }, 'Click an item to name it (e.g. “Lead vocal: Sam”), copy or remove it. Drag to move.');

  return h(
    'div',
    { class: 'mgr-stage' },
    h(
      'div',
      { class: 'mgr-filters' },
      h('div', { class: 'chips sp-palette' }, Object.entries(STAGE_GEAR).map(([k, g]) => button(g.label, () => add(k), { iconName: 'plus', variant: 'chip' }))),
      h('div', { class: 'row' }, button('Export PDF', pdf, { iconName: 'print', variant: 'sm primary' }), button('Start over', () => confirm('Clear this stage plot and pick a starting layout again?') && ctx.update((d) => delete d.band.stage), { variant: 'sm ghost' })),
    ),
    canvas,
    selBox,
    h(
      'div',
      { class: 'mgr-cols' },
      h(
        'section',
        { class: 'mgr-sect' },
        h('h2', {}, `Input list · ${inputs.length} channels`),
        inputs.length ? h('table', { class: 'mgr-table' }, h('thead', {}, h('tr', {}, ['Ch', 'Input', 'Mic / DI', 'Stand'].map((x) => h('th', {}, x)))), h('tbody', {}, inputs.map((r) => h('tr', {}, h('td', { class: 'n' }, String(r.ch)), h('td', {}, r.name), h('td', {}, r.mic), h('td', {}, r.stand))))) : h('p', { class: 'muted small' }, 'Add drums, amps, keys or mics to build the input list.'),
        h('p', { class: 'muted tiny' }, 'Mics are suggestions; the venue’s engineer has the final say.'),
      ),
      h(
        'section',
        { class: 'mgr-sect' },
        h('h2', {}, `Monitor mixes · ${mixes.length}`),
        mixes.length ? h('ol', { class: 'mgr-mixes' }, mixes.map((x) => h('li', {}, `${x.name} · ${x.type}`))) : h('p', { class: 'muted small' }, 'No wedges or in-ears yet.'),
        f.text('sp-backline', 'Backline (what you bring, what you need)', stage.backline, B((s, v) => (s.backline = v)), { rows: 3, placeholder: 'We bring: guitar and bass amps, snare, cymbals. Need: kick drum, shells, 2 wedges.' }),
        f.text('sp-notes', 'Notes for the engineer', stage.notes, B((s, v) => (s.notes = v)), { rows: 3, placeholder: 'Click track to drummer only; vocal FX on the lead vocal; we finish on a sample.' }),
      ),
    ),
  );
}

