// The "Which part of the song?" dialog (a bottom sheet on a phone) and the Song part summary in the Audio tab.
// Entire song, one section, several sections (ticked in song order, then reordered or repeated, crossfaded or
// hard cut) or a custom range; a preview of the parts and the length before Apply; one undo step. The last
// choice is remembered per song in this browser. The edit itself is changed by songpart.js.
import { h, button, iconButton, toast } from './dom.js';
import { timelineToSong, hasSongParts } from './core.js';
import { fmtTime } from './manager/releases.js';
import { PART_KINDS, DEFAULT_FADE, partSections, describePart, linesInParts, applySongPart, defaultPicture, usableChoice, defaultTemplatePart } from './songpart.js';

const KEY = 'pvm.songpart.v1';
export function rememberedPart(songId) {
  try {
    return (JSON.parse(localStorage.getItem(KEY)) || {})[songId] || null;
  } catch {
    return null;
  }
}
export function rememberPart(songId, choice) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY)) || {};
    all[songId] = choice;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* no room: it's only a convenience */
  }
}

/** The edit's Song part, and whether it still plays it (Find the hook, a drag or a template may have moved it). */
export function currentPart(p, ctx) {
  const sp = p.songPart;
  if (!sp || !ctx || !ctx.song || sp.songId !== ctx.song.id || !p.song || !ctx.audio) return null;
  const want = describePart(sp, partSections(ctx.song, ctx.audio.duration || 0), ctx.audio.duration || 0);
  const many = hasSongParts(p.song);
  const same = want.ok && Math.abs(want.parts[0].from - (p.song.offset || 0)) < 0.01 && (want.parts.length > 1) === many;
  return { ...sp, want, same };
}

const KIND_LABEL = Object.fromEntries(PART_KINDS);
const pictureLabel = { video: 'The music video, in sync', footage: 'Raw footage, cut on the beat', cover: 'The cover art', keep: 'Keep the video track as it is' };

/** One line for the Audio tab: "Chorus · 0:28" or "Changed by hand". */
export function partSummary(p, ctx) {
  const cur = currentPart(p, ctx);
  if (!cur) return '';
  if (!cur.same) return `${cur.byTemplate ? 'Set by a template, then changed' : 'Changed by hand since'}: the song starts at ${fmtTime(p.song.offset || 0)}`;
  const parts = cur.want.parts;
  const what = cur.byTemplate ? `${fmtTime(parts[0].from)}–${fmtTime(parts[0].to)} (from the template)` : cur.kind === 'all' ? 'Entire song' : parts.map((q) => q.label).join(', ');
  return `${what} · ${fmtTime(cur.want.length)}`;
}

/**
 * Open the dialog. env: { store, engine, ctx: () => song template context, refresh, detect(songId), picture?,
 * choose?(choice): pick a part for the templates instead of applying it (start?: the choice to start from),
 * remake?: { name, edited, run(choice) -> facts }: the edit was made by a song template; re-make it for the part }.
 * Returns the dialog element.
 */
export function openSongPart(env) {
  document.querySelectorAll('dialog.songpart-dialog').forEach((d) => d.remove());
  const ctx0 = env.ctx();
  if (!ctx0 || !ctx0.song) return toast('Pick one of your songs in the Audio tab first.', 'error'), null;
  if (!ctx0.audio) return toast(`“${ctx0.song.title}” has no song file yet (its Overview in Songs & releases).`, 'error'), null;
  const song = ctx0.song;
  const dur = ctx0.audio.duration || 0;
  const sections = partSections(song, dur);
  const p0 = env.store.get();
  const cur = currentPart(p0, ctx0);
  const start = usableChoice(env.start || null, sections, dur) || usableChoice(cur && !cur.byTemplate ? cur : null, sections, dur) || usableChoice(rememberedPart(song.id), sections, dur) || { kind: 'all', ids: [], join: { kind: 'fade', fade: DEFAULT_FADE } };
  const st = {
    kind: start.kind,
    one: start.kind === 'one' ? start.ids[0] : (sections.find((s) => /^chorus/i.test(s.label)) || sections[0] || {}).id,
    order: start.kind === 'several' ? [...start.ids] : [],
    from: start.kind === 'range' ? start.from : cur && cur.byTemplate ? cur.from : 0,
    to: start.kind === 'range' ? start.to : cur && cur.byTemplate ? cur.to : Math.min(dur, 30),
    join: start.join && start.join.kind === 'cut' ? 'cut' : 'fade',
    fade: start.join && Number.isFinite(+start.join.fade) ? +start.join.fade : DEFAULT_FADE,
    picture: env.picture || start.picture || null,
    remake: !!env.remake,
  };
  const templateMade = () => !!env.choose || (env.remake && st.remake);
  const pictures = () => {
    const c = env.ctx();
    const d = env.store.get();
    return [c.video && 'video', (c.footage || []).length && 'footage', c.coverRec && 'cover', ((d.clips || []).length || !c.video) && 'keep'].filter(Boolean);
  };
  if (!st.picture || !pictures().includes(st.picture)) st.picture = defaultPicture(env.store.get(), env.ctx());
  if (!pictures().includes(st.picture)) st.picture = pictures()[0] || 'keep';

  const choice = () => ({
    kind: st.kind,
    ids: st.kind === 'one' ? [st.one].filter(Boolean) : st.kind === 'several' ? [...st.order] : [],
    from: st.kind === 'range' ? +st.from : null,
    to: st.kind === 'range' ? +st.to : null,
    join: { kind: st.join, fade: st.join === 'cut' ? 0 : +st.fade },
    picture: st.picture,
  });

  const dlg = h('dialog', { class: 'songpart-dialog', 'aria-label': `Which part of ${song.title}` });
  const close = () => {
    dlg.close();
    dlg.remove();
  };
  dlg.addEventListener('cancel', (e) => (e.preventDefault(), close()));
  dlg.addEventListener('click', (e) => e.target === dlg && close());
  const body = h('div', { class: 'songpart-body' });
  dlg.append(h('div', { class: 'songpart-head' }, h('h2', {}, `Which part of “${song.title}”?`), iconButton('x', 'Close', close, 'ghost')), body);
  document.body.append(dlg);
  dlg.showModal();

  const playheadSong = () => +Math.max(0, Math.min(dur, timelineToSong(env.engine.t, env.store.get().song))).toFixed(2);

  function kindTabs() {
    return h(
      'div',
      { class: 'songpart-kinds', role: 'radiogroup', 'aria-label': 'Part of the song' },
      PART_KINDS.map(([k, label]) =>
        h('button', { type: 'button', role: 'radio', 'aria-checked': String(st.kind === k), class: `btn chip${st.kind === k ? ' on' : ''}`, 'data-part-kind': k, onclick: () => ((st.kind = k), render()) }, label),
      ),
    );
  }

  function noSections() {
    return h(
      'div',
      { class: 'songpart-none' },
      h('p', { class: 'small' }, `“${song.title}” has no sections yet.`),
      h('div', { class: 'row' }, button('Detect sections from the audio', () => (close(), env.detect(song.id)), { iconName: 'wand', variant: 'sm', title: 'Opens the song’s Sections tab and listens for the intro, verses and choruses; accept them there, then come back' }), button('Use a custom range', () => ((st.kind = 'range'), render()), { variant: 'sm ghost' })),
    );
  }

  const arrow = (txt, title, fn, off) => h('button', { type: 'button', class: 'icon-btn ghost', title, 'aria-label': title, onclick: fn, disabled: off }, txt);
  const secLine = (s) => `${fmtTime(s.start)}–${fmtTime(s.end)} · ${fmtTime(s.end - s.start)}`;

  function oneList() {
    if (!sections.length) return noSections();
    return h(
      'ul',
      { class: 'songpart-list', role: 'radiogroup', 'aria-label': 'Section' },
      sections.map((s) =>
        h(
          'li',
          {},
          h('label', { class: 'songpart-row' }, h('input', { type: 'radio', name: 'songpart-one', value: s.id, checked: st.one === s.id, 'data-sec': s.id, onchange: () => ((st.one = s.id), render()) }), h('strong', {}, s.label), h('span', { class: 'muted tiny' }, secLine(s))),
        ),
      ),
    );
  }

  function severalList() {
    if (!sections.length) return noSections();
    const byId = new Map(sections.map((s) => [s.id, s]));
    const tick = h(
      'ul',
      { class: 'songpart-list', 'aria-label': 'Sections to use' },
      sections.map((s) =>
        h(
          'li',
          {},
          h(
            'label',
            { class: 'songpart-row' },
            h('input', {
              type: 'checkbox',
              checked: st.order.includes(s.id),
              'data-sec': s.id,
              onchange: (e) => {
                if (e.target.checked) {
                  // ticked sections go in song order
                  st.order.push(s.id);
                  st.order.sort((a, b) => sections.findIndex((x) => x.id === a) - sections.findIndex((x) => x.id === b));
                } else st.order = st.order.filter((id) => id !== s.id);
                render();
              },
            }),
            h('strong', {}, s.label),
            h('span', { class: 'muted tiny' }, secLine(s)),
          ),
        ),
      ),
    );
    const move = (i, by) => {
      const j = i + by;
      if (j < 0 || j >= st.order.length) return;
      [st.order[i], st.order[j]] = [st.order[j], st.order[i]];
      render();
    };
    const order = st.order.length
      ? h(
          'ol',
          { class: 'songpart-order', 'aria-label': 'Play order' },
          st.order.map((id, i) =>
            h(
              'li',
              { 'data-order': String(i) },
              h('span', { class: 'songpart-order-name' }, byId.get(id) ? byId.get(id).label : '?'),
              arrow('↑', `Move ${byId.get(id).label} earlier`, () => move(i, -1), i === 0),
              arrow('↓', `Move ${byId.get(id).label} later`, () => move(i, 1), i === st.order.length - 1),
              iconButton('copy', `Play ${byId.get(id).label} again`, () => (st.order.splice(i + 1, 0, id), render()), 'ghost'),
              iconButton('x', `Leave out ${byId.get(id).label} here`, () => (st.order.splice(i, 1), render()), 'ghost'),
            ),
          ),
        )
      : null;
    const fadeIn = h('input', { type: 'number', min: 0, max: 2, step: 0.05, value: st.fade, 'aria-label': 'Crossfade length (s)', disabled: st.join === 'cut', 'data-k': 'songpart-fade' });
    fadeIn.addEventListener('change', () => ((st.fade = Math.max(0, Math.min(2, +fadeIn.value || 0))), render()));
    const joinSel = h('select', { 'aria-label': 'Where sections meet', 'data-k': 'songpart-join' }, h('option', { value: 'fade', selected: st.join === 'fade' }, 'Short crossfade'), h('option', { value: 'cut', selected: st.join === 'cut' }, 'Hard cut'));
    joinSel.addEventListener('change', () => ((st.join = joinSel.value), render()));
    return h(
      'div',
      {},
      h('p', { class: 'muted tiny' }, 'Tick the sections: they play in song order, with the gaps between them cut out. Change the order or play one again below.'),
      tick,
      order ? h('div', {}, h('p', { class: 'small songpart-sub' }, 'Play order'), order) : null,
      h('div', { class: 'row songpart-join' }, h('label', { class: 'small' }, 'Where they meet ', joinSel), st.join === 'fade' ? h('label', { class: 'small' }, 'Crossfade (s) ', fadeIn) : null),
    );
  }

  function rangeBox() {
    const num = (k, label) => {
      const el = h('input', { type: 'number', min: 0, max: dur || undefined, step: 0.1, value: (+st[k]).toFixed(2), 'aria-label': label, 'data-k': `songpart-${k}` });
      el.addEventListener('change', () => ((st[k] = Math.max(0, Math.min(dur || Infinity, +el.value || 0))), render()));
      return el;
    };
    return h(
      'div',
      { class: 'songpart-range' },
      h('div', { class: 'grid2' }, h('label', { class: 'small' }, 'Start (s) ', num('from', 'Start (s)')), h('label', { class: 'small' }, 'End (s) ', num('to', 'End (s)'))),
      h('div', { class: 'row' }, button('Start at the playhead', () => ((st.from = playheadSong()), render()), { variant: 'sm ghost', title: 'The moment of the song under the playhead' }), button('End at the playhead', () => ((st.to = playheadSong()), render()), { variant: 'sm ghost' })),
      h('p', { class: 'muted tiny' }, `The song is ${fmtTime(dur)} long. Play the preview to the spot you want, then press a playhead button.`),
    );
  }

  function remakeBox() {
    if (!env.remake) return null;
    const opt = (on, label) =>
      h('label', { class: 'songpart-row' }, h('input', { type: 'radio', name: 'songpart-remake', checked: st.remake === on, 'data-remake': on ? 'yes' : 'no', onchange: () => ((st.remake = on), render()) }), h('span', {}, label));
    return h(
      'div',
      { class: 'songpart-remake', role: 'radiogroup', 'aria-label': 'Template' },
      opt(true, `Re-make “${env.remake.name}” for this part`),
      opt(false, 'Only change the song part, keep the edit as it is'),
      st.remake && env.remake.edited ? h('p', { class: 'warn-list small', 'data-k': 'songpart-handwarn' }, `You changed this edit by hand since the template made it. Re-making it replaces those changes (clips, texts, layers and look). Undo (Ctrl+Z) puts them back.`) : null,
    );
  }

  function pictureBox() {
    if (templateMade()) return null; // the template picks its own picture
    const list = pictures();
    const sel = h('select', { 'aria-label': 'Picture', 'data-k': 'songpart-picture' }, list.map((k) => h('option', { value: k, selected: st.picture === k }, pictureLabel[k])));
    sel.addEventListener('change', () => ((st.picture = sel.value), render()));
    return h('label', { class: 'small songpart-picture' }, 'Picture ', sel);
  }

  function preview() {
    const c = choice();
    const r = describePart(c, sections, dur);
    if (!r.ok) return h('div', { class: 'songpart-preview' }, h('p', { class: 'error-text small', role: 'status' }, r.error));
    const d = env.store.get();
    const mine = (d.clips || []).filter((x) => !x.songPart).length;
    const ec = d.endCard && d.endCard.enabled ? d.endCard.duration || 0 : 0;
    const lyr = linesInParts(d.lyrics, r.parts).length;
    const notes = templateMade() ? [env.choose ? 'The template is built for this part: the song, the music video in sync, lyrics, layers and the end card.' : `Re-makes “${env.remake.name}” for this part, in one undo step.`, d.lyrics.length ? `${lyr} lyric line${lyr === 1 ? '' : 's'} in this part, kept in time.` : ''].filter(Boolean) : [
      st.picture !== 'keep' && mine ? `Replaces the ${mine} clip${mine === 1 ? '' : 's'} on your video track (Undo puts ${mine === 1 ? 'it' : 'them'} back).` : '',
      st.picture === 'keep' && (d.clips || []).length ? 'Your clips stay where they are; music video clips are put back in sync.' : '',
      d.lyrics.length ? `${lyr} lyric line${lyr === 1 ? '' : 's'} in this part, kept in time.` : song.instrumental ? '' : 'The song’s lyrics go on (timed when they are).',
      'Texts, layers, effects and the look stay. Speech captions move with the song; ones in a cut-out part go.',
    ].filter(Boolean);
    return h(
      'div',
      { class: 'songpart-preview', role: 'status' },
      h('p', { class: 'songpart-total' }, h('strong', {}, `${fmtTime(r.length)}`), ` of the song${ec ? ` + ${ec} s end card = ${fmtTime(r.length + ec)}` : ''}`),
      h(
        'ol',
        { class: 'songpart-parts' },
        r.parts.map((q, i) => h('li', {}, h('strong', {}, q.label), h('span', { class: 'muted tiny' }, ` ${fmtTime(q.from)}–${fmtTime(q.to)} in the song · at ${fmtTime(q.at)} in the video${i && r.fade ? ` (${r.fade} s crossfade)` : i ? ' (hard cut)' : ''}`))),
      ),
      h('ul', { class: 'songpart-notes muted tiny' }, notes.map((n) => h('li', {}, n))),
    );
  }

  function apply() {
    const c = choice();
    if (env.choose) {
      close();
      return env.choose(c);
    }
    const ctx = { ...env.ctx(), picture: st.picture };
    let facts = [];
    if (env.remake && st.remake) {
      try {
        facts = env.remake.run(c);
      } catch (e) {
        return toast(e.message, 'error', 6000);
      }
      rememberPart(song.id, c);
      close();
      return toast(`“${env.remake.name}”, ${KIND_LABEL[c.kind].toLowerCase()}: ${facts.join('. ')}. Undo (Ctrl+Z) puts it back.`, 'info', 9000);
    }
    try {
      env.store.update((d) => (facts = applySongPart(d, c, ctx)));
    } catch (e) {
      return toast(e.message, 'error', 6000);
    }
    rememberPart(song.id, c);
    env.engine.seek(0);
    close();
    env.refresh();
    toast(`${KIND_LABEL[c.kind]}: ${facts.join('. ')}. Undo (Ctrl+Z) puts it back.`, 'info', 9000);
  }

  function render() {
    const kindBody = st.kind === 'one' ? oneList() : st.kind === 'several' ? severalList() : st.kind === 'range' ? rangeBox() : h('p', { class: 'muted small' }, `All ${fmtTime(dur)} of the song, from the start.`);
    const ok = describePart(choice(), sections, dur).ok;
    body.replaceChildren(
      ...[
        kindTabs(),
        h('div', { class: 'songpart-kind' }, kindBody),
        remakeBox(),
        pictureBox(),
        preview(),
        h('div', { class: 'row songpart-actions' }, button('Cancel', close, { variant: 'ghost' }), button(env.choose ? 'Use for the templates' : 'Apply', apply, { variant: 'primary', iconName: 'check', disabled: !ok })),
      ].filter(Boolean), // replaceChildren would write "null"
    );
  }
  render();
  return dlg;
}

// ---- the part templates are built for (Templates tab, Suggested tab), kept per song while the page is open
const tplPick = { songId: null, edit: '', choice: null, picked: false };

/** Was the part picked on the picker itself (not just started from the edit or memory)? The Chorus promo keeps its chorus otherwise. */
export const templatePartPicked = () => tplPick.picked;

/** The part the templates use for the song in ctx, or null for each template's own pick. */
export function templatePartChoice(p, ctx) {
  if (!ctx || !ctx.song || !ctx.audio) return null;
  const dur = ctx.audio.duration || 0;
  const sections = partSections(ctx.song, dur);
  const edit = JSON.stringify(p.songPart || null);
  if (tplPick.songId !== ctx.song.id) {
    tplPick.picked = false;
    tplPick.choice = defaultTemplatePart(currentPart(p, ctx), rememberedPart(ctx.song.id), sections, dur);
  } else if (tplPick.edit !== edit) {
    // the edit's Song part changed (Song part → Change): follow it when it is a real choice
    const next = defaultTemplatePart(currentPart(p, ctx), null, sections, dur);
    if (next.kind !== 'own') tplPick.choice = next;
  }
  tplPick.songId = ctx.song.id;
  tplPick.edit = edit;
  const c = tplPick.choice && tplPick.choice.kind !== 'own' ? usableChoice(tplPick.choice, sections, dur) : null;
  return c;
}

/**
 * The inline "Part of the song" line over template cards. env: { store, ctx(), openMore(start, choose), detect(id),
 * onChange() }. Returns null when no song with a song file is picked.
 */
export function templatePartPicker(env) {
  const ctx = env.ctx();
  if (!ctx || !ctx.song || !ctx.audio) return null;
  const dur = ctx.audio.duration || 0;
  const sections = partSections(ctx.song, dur);
  const cur = templatePartChoice(env.store.get(), ctx);
  const set = (c) => {
    tplPick.choice = c;
    tplPick.songId = ctx.song.id;
    tplPick.picked = c.kind !== 'own';
    if (c.kind !== 'own') rememberPart(ctx.song.id, c);
    env.onChange();
  };
  const value = !cur ? 'own' : cur.kind === 'all' ? 'all' : cur.kind === 'one' ? `one:${cur.ids[0]}` : 'picked';
  const r = cur ? describePart(cur, sections, dur) : null;
  const opts = [
    ['own', 'Each template’s own pick'],
    ['all', `Entire song (${fmtTime(dur)})`],
    ...sections.map((s) => [`one:${s.id}`, `${s.label} · ${fmtTime(s.start)}–${fmtTime(s.end)}`]),
    ...(value === 'picked' && r && r.ok ? [['picked', `${r.parts.map((q) => q.label).join(', ')} (${fmtTime(r.length)})`]] : []),
    ['more', 'Several sections or a custom range…'],
  ];
  const sel = h('select', { 'aria-label': 'Part of the song for templates', 'data-k': 'tplpart' }, opts.map(([v, label]) => h('option', { value: v, selected: v === value }, label)));
  sel.addEventListener('change', () => {
    const v = sel.value;
    if (v === 'more') {
      sel.value = value;
      return env.openMore(cur, (c) => set(c));
    }
    if (v === 'own') return set({ kind: 'own' });
    if (v === 'all') return set({ kind: 'all', ids: [], join: { kind: 'fade', fade: DEFAULT_FADE } });
    if (v.startsWith('one:')) return set({ kind: 'one', ids: [v.slice(4)], join: { kind: 'fade', fade: DEFAULT_FADE } });
  });
  return h(
    'div',
    { class: 'tplpart', 'data-tplpart': cur ? cur.kind : 'own' },
    h('label', { class: 'small tplpart-lbl' }, h('span', {}, 'Part of the song '), sel),
    h(
      'p',
      { class: 'muted tiny', role: 'status' },
      cur && r && r.ok ? `Templates are built for ${fmtTime(r.length)} of “${ctx.song.title}”: the song, its music video in sync, lyrics, layers and the end card.${tplPick.picked ? '' : ' The Chorus promo keeps its chorus unless you pick a part here.'}` : `Each template picks its own stretch (its best 15–30 s, or the chorus). Pick a part of “${ctx.song.title}” to build them for it.`,
      sections.length ? null : ' No sections yet: ',
      sections.length ? null : h('button', { type: 'button', class: 'link', 'data-k': 'tplpart-detect', onclick: () => env.detect(ctx.song.id) }, 'Detect sections from the audio'),
      sections.length ? null : ' or use a custom range.',
    ),
  );
}
