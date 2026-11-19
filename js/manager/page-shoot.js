// A song's Video shoot tab: concepts from the lyrics, then the plan (date, locations, crew, shot
// list, wardrobe, props, budget) and a printable call sheet.
import { h, icon, button, iconButton, toast } from '../dom.js';
import { shootIdeas, hookLines } from './ideas.js';
import { niceDate, mid } from './model.js';
import { exportPDF } from './pdf.js';

// clips worth grabbing on the same day, for the short-form plan
const SHORT_FORM_GRABS = [
  'Each member playing the hook alone, phone vertical (for “learn the riff” and duets)',
  'The breakdown from the drum riser and from the crowd’s view',
  'A 3-second reaction shot of each member (for hook openers)',
  'Behind the scenes: setting up, the first take, a mistake that made you laugh',
  'A clean shot of the singer on the hook line, for a lyric video',
];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** A plain call sheet you can print or save as PDF. */
export function callSheetHTML(band, song) {
  const s = song.shoot;
  const rows = (list, cols) => list.map((x) => `<tr>${cols.map((c) => `<td>${esc(x[c])}</td>`).join('')}</tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Call sheet · ${esc(song.title)}</title>
<style>body{font:14px/1.45 system-ui,sans-serif;margin:32px;color:#111}h1{margin:0 0 4px}h2{font-size:15px;margin:22px 0 6px;border-bottom:1px solid #ccc}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:5px 8px;text-align:left;vertical-align:top}.meta{color:#555}li{margin:2px 0}</style></head><body>
<h1>${esc(band.name)} · “${esc(song.title)}”</h1>
<p class="meta">Music video shoot · ${esc(niceDate(s.date, { weekday: true }) || 'date to be set')}${s.callTime ? ` · call time ${esc(s.callTime)}` : ''}${s.budget ? ` · budget ${esc(s.budget)}` : ''}</p>
${s.concept ? `<h2>Concept</h2><p>${esc(s.concept).replace(/\n/g, '<br>')}</p>` : ''}
${s.locations.length ? `<h2>Locations</h2><table><tr><th>Place</th><th>Address</th><th>Notes</th></tr>${rows(s.locations, ['name', 'address', 'notes'])}</table>` : ''}
${s.crew.length ? `<h2>Crew and contacts</h2><table><tr><th>Role</th><th>Name</th><th>Contact</th></tr>${rows(s.crew, ['role', 'name', 'contact'])}</table>` : ''}
${s.shots.length ? `<h2>Shot list</h2><ol>${s.shots.map((x) => `<li>${esc(x.text)}</li>`).join('')}</ol>` : ''}
${s.wardrobe ? `<h2>Wardrobe</h2><p>${esc(s.wardrobe)}</p>` : ''}
${s.props ? `<h2>Props and gear</h2><p>${esc(s.props)}</p>` : ''}
${s.notes ? `<h2>Notes</h2><p>${esc(s.notes).replace(/\n/g, '<br>')}</p>` : ''}
</body></html>`;
}

export function buildShootTab(ctx, song, S) {
  const f = ctx.form;
  const sh = song.shoot;
  const ideas = shootIdeas(song.lyrics, song.title);
  const Sh = (fn) => S((s, v) => fn(s.shoot, v));
  const use = (c) =>
    ctx.update(
      Sh((x) => {
        x.concept = `${c.title}: ${c.pitch}\n\nLook: ${c.look}`;
        for (const l of c.locations) if (!x.locations.some((y) => y.name === l)) x.locations.push({ id: mid('loc'), name: l, address: '', notes: '' });
        for (const t of c.shots) if (!x.shots.some((y) => y.text === t)) x.shots.push({ id: mid('shot'), text: t, done: false });
      }),
    ) || toast(`“${c.title}” is now the concept, with its locations and shots added below.`);

  const list = (key, items, cols, blank, label) =>
    h(
      'div',
      { class: 'mgr-mini' },
      items.length
        ? h(
            'table',
            { class: 'mgr-table compact' },
            h('thead', {}, h('tr', {}, [...cols.map(([, l]) => h('th', {}, l)), h('th', {})])),
            h(
              'tbody',
              {},
              items.map((it) =>
                h(
                  'tr',
                  {},
                  cols.map(([c]) => h('td', {}, f.text(`${key}-${c}-${it.id}`, '', it[c], Sh((x, v) => {
                    const y = x[key].find((z) => z.id === it.id);
                    if (y) y[c] = v;
                  })))),
                  h('td', {}, iconButton('trash', `Remove ${label}`, () => ctx.update(Sh((x) => (x[key] = x[key].filter((z) => z.id !== it.id)))), 'ghost')),
                ),
              ),
            ),
          )
        : null,
      button(`Add ${label}`, () => ctx.update(Sh((x) => x[key].push({ id: mid(key), ...blank }))), { iconName: 'plus', variant: 'sm ghost' }),
    );

  const shots = h(
    'ul',
    { class: 'mgr-tasks' },
    sh.shots.map((t) =>
      h(
        'li',
        { class: `mgr-task shot${t.done ? ' done' : ''}` },
        f.check(`shotdone-${t.id}`, t.done, Sh((x, v) => {
          const y = x.shots.find((z) => z.id === t.id);
          if (y) y.done = v;
        }), `Got it: ${t.text}`),
        f.text(`shot-${t.id}`, '', t.text, Sh((x, v) => {
          const y = x.shots.find((z) => z.id === t.id);
          if (y) y.text = v;
        })),
        iconButton('trash', 'Remove shot', () => ctx.update(Sh((x) => (x.shots = x.shots.filter((z) => z.id !== t.id)))), 'ghost'),
      ),
    ),
  );

  const print = () => {
    exportPDF(callSheetHTML(ctx.store.get().band, song), `${song.title} call sheet`);
    toast('Pick “Save as PDF” as the printer to get a PDF.');
  };

  return h(
    'div',
    {},
    h(
      'section',
      { class: 'mgr-sect' },
      h('h2', {}, 'Ideas from the lyrics'),
      song.lyrics.trim() ? null : h('p', { class: 'muted small' }, 'Add lyrics (Lyrics tab) for concepts that fit the words. Until then, here are two that work for any song.'),
      h(
        'div',
        { class: 'mgr-ideas' },
        ideas.map((c) =>
          h(
            'article',
            { class: 'mgr-idea' },
            h('strong', {}, c.title),
            c.words.length ? h('span', { class: 'mgr-why' }, 'From: ', c.words.slice(0, 4).map((w) => `“${w}”`).join(', ')) : h('span', { class: 'mgr-why' }, 'Works for any song'),
            h('p', {}, c.pitch),
            h('p', { class: 'muted tiny' }, c.look),
            button('Use this idea', () => use(c), { variant: 'sm' }),
          ),
        ),
      ),
    ),
    h(
      'div',
      { class: 'mgr-cols' },
      h(
        'section',
        { class: 'mgr-sect' },
        h('h2', {}, 'The plan'),
        f.text(`concept-${song.id}`, 'Concept', sh.concept, Sh((x, v) => (x.concept = v)), { rows: 5, placeholder: 'Pick an idea above or write your own.' }),
        h('div', { class: 'mgr-two' }, f.text(`sdate-${song.id}`, 'Shoot date', sh.date, Sh((x, v) => (x.date = v)), { type: 'date' }), f.text(`call-${song.id}`, 'Call time', sh.callTime, Sh((x, v) => (x.callTime = v)), { type: 'time' })),
        h('h3', { class: 'mgr-h3' }, 'Locations'),
        list('locations', sh.locations, [['name', 'Place'], ['address', 'Address'], ['notes', 'Notes / permit']], { name: '', address: '', notes: '' }, 'a location'),
        h('h3', { class: 'mgr-h3' }, 'Crew and contacts'),
        list('crew', sh.crew, [['role', 'Role'], ['name', 'Name'], ['contact', 'Phone / email']], { role: 'Camera', name: '', contact: '' }, 'a person'),
        h('div', { class: 'mgr-two' }, f.text(`ward-${song.id}`, 'Wardrobe', sh.wardrobe, Sh((x, v) => (x.wardrobe = v)), { rows: 2 }), f.text(`props-${song.id}`, 'Props and gear', sh.props, Sh((x, v) => (x.props = v)), { rows: 2 })),
        h('div', { class: 'mgr-two' }, f.text(`budget-${song.id}`, 'Budget', sh.budget, Sh((x, v) => (x.budget = v)), { placeholder: 'e.g. $400' }), f.text(`snotes-${song.id}`, 'Notes', sh.notes, Sh((x, v) => (x.notes = v)), { rows: 2 })),
        button('Export call sheet PDF', print, { iconName: 'print', variant: 'sm' }),
      ),
      h(
        'section',
        { class: 'mgr-sect' },
        h('h2', {}, `Shot list · ${sh.shots.filter((s) => s.done).length}/${sh.shots.length}`),
        shots,
        button('Add a shot', () => ctx.update(Sh((x) => x.shots.push({ id: mid('shot'), text: 'New shot', done: false }))), { iconName: 'plus', variant: 'sm ghost' }),
        h('h3', { class: 'mgr-h3' }, 'Also film for short-form'),
        h('ul', { class: 'mgr-bullets' }, [...SHORT_FORM_GRABS, ...hookLines(song.lyrics, 2).map((l) => `The hook line on its own: “${l}”`)].map((t) => h('li', {}, t))),
        button('Add these to the shot list', () => ctx.update(Sh((x) => {
          for (const t of [...SHORT_FORM_GRABS]) if (!x.shots.some((y) => y.text === t)) x.shots.push({ id: mid('shot'), text: t, done: false });
        })), { variant: 'sm ghost' }),
        h('p', { class: 'muted tiny' }, icon('sparkle', 12), ' One shoot day can cover the video and two weeks of short-form posts.'),
      ),
    ),
  );
}
