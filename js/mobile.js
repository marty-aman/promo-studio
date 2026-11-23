// Phone and tablet shell: picks the layout class for the window, folds the top bar into menus, turns the tool
// panels and the clip settings into sheets, and adds the transport scrub bar. On a desktop window none of this
// does anything: every rule it switches on is scoped to a body class that is only set below 1100 px (or on touch).
import { h, icon, iconButton, button } from './dom.js';
import { layoutMode, compactBar, scrubToTime, isTouchDevice } from './mobilelogic.js';

const SETTINGS_TITLE = { clip: 'Clip settings', text: 'Text settings', lyric: 'Lyric settings', audio: 'Audio settings', layer: 'Layer settings', song: 'Song settings', endcard: 'End card settings' };

export function initMobile({ header, modeSwitch, nowOn, keep, tabRail, pageEl, transport, tlToolbar, engine, store, ui, panels, getMode }) {
  const body = document.body;
  if (isTouchDevice()) body.classList.add('touch');

  // ---------------------------------------------------------- scrub bar in the transport
  const scrub = h('input', { type: 'range', class: 'm-scrub', min: 0, max: 1000, step: 1, value: 0, 'aria-label': 'Playhead position' });
  let scrubbing = false;
  scrub.addEventListener('pointerdown', () => (scrubbing = true));
  for (const ev of ['pointerup', 'pointercancel', 'blur']) scrub.addEventListener(ev, () => (scrubbing = false));
  scrub.addEventListener('input', () => engine.seek(scrubToTime(Number(scrub.value), 1000, store.get().duration)));
  transport.prepend(scrub);
  engine.on(() => {
    if (!scrubbing) scrub.value = String(Math.round((engine.t / Math.max(0.01, store.get().duration)) * 1000));
  });

  // ---------------------------------------------------------- extra timeline buttons (hidden on desktop)
  const mOnly = (el) => (el.classList.add('m-only'), el);
  const zoomAnchor = tlToolbar.querySelector('.spacer');
  for (const el of [
    mOnly(button('Duplicate', () => ui.duplicate(), { iconName: 'copy', variant: 'sm', title: 'Make a copy of the selected item right after it' })),
    mOnly(button('Paste', () => ui.paste(), { iconName: 'clipboard', variant: 'sm', title: 'Paste the copied item at the playhead (copy is in the long-press menu)' })),
    mOnly(button('Settings', () => openSheet('insp'), { iconName: 'settings', variant: 'sm', title: 'Open the settings of the selected item' })),
  ])
    zoomAnchor.before(el);

  // ---------------------------------------------------------- the top bar
  const exportBtn = keep.find((el) => el.textContent.trim() === 'Export');
  const moreBody = h('div', { class: 'm-more-body' });
  const moreMenu = h('div', { class: 'm-more', role: 'dialog', 'aria-label': 'Project', hidden: true }, h('div', { class: 'm-more-head' }, h('strong', {}, 'Project'), iconButton('x', 'Close', () => setMore(false))), moreBody);
  const moreBtn = h('button', { type: 'button', class: 'icon-btn m-more-btn', 'aria-label': 'Project menu: name, artist, format, saving', 'aria-expanded': 'false', onclick: () => setMore(moreMenu.hidden) }, icon('settings', 20));
  exportBtn.before(moreBtn);
  const modeMenu = h('div', { class: 'm-modemenu', role: 'menu', hidden: true });
  document.body.append(moreMenu, modeMenu);
  function setMore(on) {
    moreMenu.hidden = !on;
    moreBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) setModeMenu(false);
  }
  function setModeMenu(on) {
    modeMenu.hidden = !on;
    if (on) {
      setMore(false);
      modeMenu.replaceChildren(
        ...[...modeSwitch.children].map((b) =>
          h('button', { type: 'button', role: 'menuitem', class: b.classList.contains('on') ? 'on' : '', onclick: () => (setModeMenu(false), b.click()) }, b.querySelector('svg').cloneNode(true), h('span', {}, b.title)),
        ),
      );
    }
  }
  // on a phone the four workspaces are one button that opens a list
  modeSwitch.addEventListener(
    'click',
    (e) => {
      if (!body.classList.contains('m-compact')) return;
      const b = e.target.closest('.mode-btn');
      if (b && b.classList.contains('on') && modeMenu.hidden) {
        e.stopPropagation();
        setModeMenu(true);
      }
    },
    true,
  );
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!modeMenu.hidden && !modeMenu.contains(e.target) && !modeSwitch.contains(e.target)) setModeMenu(false);
      if (!moreMenu.hidden && !moreMenu.contains(e.target) && !moreBtn.contains(e.target)) setMore(false);
    },
    true,
  );

  // controls that move into the Project menu while the bar is compact (restored in reverse order)
  let moved = [];
  function relocate(want) {
    if (want && !moved.length) {
      const els = [...header.querySelectorAll('.studio-only > *')].filter((el) => !keep.includes(el) && el !== moreBtn);
      els.push(nowOn);
      for (const el of els) {
        moved.push({ el, parent: el.parentNode, next: el.nextSibling });
        moreBody.append(el);
      }
    } else if (!want && moved.length) {
      for (const { el, parent, next } of moved.reverse()) parent.insertBefore(el, next && next.parentNode === parent ? next : null);
      moved = [];
      setMore(false);
    }
  }

  // ---------------------------------------------------------- layout class
  let lastMode = '';
  function apply() {
    const m = layoutMode(innerWidth, innerHeight, body.classList.contains('touch'));
    const compact = compactBar(m, innerWidth);
    body.classList.toggle('m-phone', m === 'phone');
    body.classList.toggle('m-land', m === 'land');
    body.classList.toggle('m-tab', m === 'tablet');
    body.classList.toggle('m-compact', compact);
    body.classList.toggle('m-sheets', m !== 'desktop');
    relocate(compact && getMode() === 'studio');
    // phone-class memory: the preview canvas is drawn at 0.4 of full size there (0.5 elsewhere); export still uses the full size
    const scale = m === 'phone' || m === 'land' ? 0.4 : 0.5;
    if (engine.previewScale !== scale) {
      engine.previewScale = scale;
      engine.resize();
      if (!engine.playing) engine.render();
    }
    if (m === 'desktop') closeSheet();
    if (lastMode !== m) setModeMenu(false);
    lastMode = m;
    syncTitle();
  }

  // ---------------------------------------------------------- sheets
  let sheet = null; // 'left' (tool panel or page) | 'insp' (selected item settings)
  const sheetTitle = h('strong', { class: 'm-sheet-title' });
  const sheetBar = h(
    'div',
    { class: 'm-sheetbar', hidden: true },
    sheetTitle,
    h('div', { class: 'spacer' }),
    iconButton('arrowUp', 'Make the sheet taller or shorter', () => body.classList.toggle('m-sheet-tall')),
    iconButton('x', 'Close', () => closeSheet()),
  );
  document.body.append(sheetBar);
  function syncTitle() {
    body.classList.toggle('m-sheet-page', sheet === 'left' && !pageEl.hidden);
    if (sheet === 'insp') sheetTitle.textContent = SETTINGS_TITLE[ui.selection && ui.selection.type] || 'Settings';
    else if (sheet === 'left') sheetTitle.textContent = (panels.tabs.find((t) => t.id === ui.tab) || {}).label || pageEl.getAttribute('aria-label') || 'Tools';
  }
  function openSheet(kind) {
    if (!body.classList.contains('m-sheets')) return;
    sheet = kind;
    body.classList.add('m-sheet');
    body.classList.toggle('m-sheet-left', kind === 'left');
    body.classList.toggle('m-sheet-insp', kind === 'insp');
    sheetBar.hidden = false;
    setMore(false);
    syncTitle();
  }
  function closeSheet() {
    sheet = null;
    body.classList.remove('m-sheet', 'm-sheet-left', 'm-sheet-insp', 'm-sheet-tall', 'm-sheet-page');
    sheetBar.hidden = true;
  }
  window.addEventListener('keydown', (e) => e.key === 'Escape' && sheet && !e.defaultPrevented && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && closeSheet());

  // tapping a tool opens its panel; tapping the lit tool again closes it
  let railTap = null;
  tabRail.addEventListener('click', () => (railTap = { tab: ui.tab, sheet }), true);
  tabRail.addEventListener('click', () => (railTap = null));
  const openTab = ui.openTab.bind(ui);
  ui.openTab = (req) => {
    const r = openTab(req);
    if (getMode() === 'studio') {
      if (railTap && railTap.sheet === 'left' && railTap.tab === ui.tab) closeSheet();
      else openSheet('left');
    }
    return r;
  };
  // tapping a block opens its settings; selecting from code (split, undo) leaves the sheets alone
  let touchedAt = 0;
  document.addEventListener('pointerup', (e) => e.pointerType === 'touch' && (touchedAt = performance.now()), true);
  const select = ui.select.bind(ui);
  ui.select = (sel) => {
    select(sel);
    if (sel && sheet === 'insp') syncTitle();
    else if (sel && performance.now() - touchedAt < 600 && getMode() === 'studio') openSheet('insp');
    else if (!sel && sheet === 'insp') closeSheet();
  };
  ui.openSettings = () => openSheet('insp');

  // ---------------------------------------------------------- touch detection and resize
  addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'touch' && !body.classList.contains('touch')) {
        body.classList.add('touch');
        apply();
      }
    },
    { capture: true, passive: true },
  );
  addEventListener('resize', apply);
  addEventListener('orientationchange', apply);
  apply();
  return { refresh: apply, openSheet, closeSheet };
}
