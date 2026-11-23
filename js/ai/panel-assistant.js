// "Write with assistant": one button inside the caption picker, the lyric/video idea views and the pitch
// tools. It opens a small box with Assistant settings (provider, key, model) until a key is saved, then
// shows exactly what would be sent and to whom; nothing is sent until the owner clicks Send. Replies come
// back as editable drafts to use or discard. No key saved: the box only offers the settings.
import { h, button, toast } from '../dom.js';
import { loadSettings, saveSettings } from '../state.js';
import { captionFacts } from '../captions.js';
import { PROVIDERS, PROVIDER_IDS, TONES, TASKS, aiConfig, withKey, withoutKey, maskKey, lyricsAllowed, withLyricsAllowed, buildPrompt, askAssistant } from './assistant.js';

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** What a Video Studio edit can tell the assistant: its end card's title and artist and the Lyrics tab's lines. */
export function projectContext(p) {
  const f = captionFacts(p || {});
  const rd = ((p && p.endCard) || {}).releaseDate || '';
  return { title: f.title, artist: f.artist, lyrics: ((p && p.lyrics) || []).map((l) => (l && l.text) || '').filter((t) => t.trim()).join('\n'), released: !!rd && rd <= todayISO() };
}

/** The same for a Manager song (and its band). */
export function songContext(song, band = {}) {
  return { title: song.title || '', artist: band.name || '', genre: band.genres || '', lyrics: song.lyrics || '', instrumental: !!song.instrumental, released: song.status === 'released' };
}

// per box (by id), so drafts survive the page being rebuilt around them
const boxes = new Map();
let fetchForTesting = null;
/** The browser check swaps in a stub for the providers. */
export function setAssistantFetchForTesting(fn) {
  fetchForTesting = fn;
}

/**
 * opts: { id, task: 'caption'|'ideas'|'pitch'|'curator', context: () => ({ title, artist, genre, lyrics,
 * instrumental, released, draft, extra }), onAccept(text), acceptLabel }
 */
export function assistantBox({ id, task, context, onAccept, acceptLabel = 'Use this' }) {
  const st = boxes.get(id) || { open: false, setup: false, tone: 'hype', drafts: [], busy: false, status: '', error: false };
  boxes.set(id, st);
  const el = h('div', { class: 'ai-box', 'data-k': `ai-${id}` });
  st.el = el;
  st.ctx = { task, context, onAccept, acceptLabel };
  render(st);
  return el;
}

function render(st) {
  const el = st.el;
  const toggle = button(st.open ? 'Close assistant' : 'Write with assistant', () => ((st.open = !st.open), render(st)), { iconName: 'sparkle', variant: 'sm ghost', title: 'Draft this with an AI model you choose, using your own API key' });
  toggle.setAttribute('aria-expanded', st.open ? 'true' : 'false');
  if (!st.open) return el.replaceChildren(h('div', { class: 'row' }, toggle));
  const s = loadSettings();
  const cfg = aiConfig(s);
  const body = !cfg || st.setup ? setupForm(st, s) : writer(st, s, cfg);
  el.replaceChildren(h('div', { class: 'row' }, toggle), h('div', { class: 'ai-body' }, body));
}

function setupForm(st, s) {
  let provider = PROVIDERS[st.pick] ? st.pick : PROVIDERS[s.aiProvider] ? s.aiProvider : 'gemini';
  const saved = (s.aiKeys || {})[provider] || '';
  const sel = h('select', { 'aria-label': 'Assistant provider', 'data-k': 'ai-provider' }, PROVIDER_IDS.map((p) => h('option', { value: p, selected: p === provider }, PROVIDERS[p].label)));
  sel.addEventListener('change', () => ((st.pick = sel.value), render(st)));
  const keyIn = h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', 'data-k': 'ai-key', 'aria-label': `${PROVIDERS[provider].label} API key`, placeholder: saved ? `Saved (${maskKey(saved)}). Paste a new key to replace it` : 'Paste your API key' });
  const modelIn = h('input', { type: 'text', 'data-k': 'ai-model', 'aria-label': 'Model name', value: (s.aiModels || {})[provider] || '', placeholder: PROVIDERS[provider].model });
  const save = () => {
    const key = keyIn.value.trim() || saved;
    if (!key) return toast('Paste an API key first.', 'error');
    if (!saveSettings(withKey(loadSettings(), provider, key, modelIn.value))) return;
    keyIn.value = '';
    st.setup = false;
    st.pick = '';
    toast(`${PROVIDERS[provider].label} key saved in this browser only`);
    render(st);
  };
  const remove = () => {
    saveSettings(withoutKey(loadSettings(), provider));
    toast(`${PROVIDERS[provider].label} key removed from this browser`);
    render(st);
  };
  return h(
    'div',
    { class: 'ai-setup', 'data-k': 'ai-setup' },
    h('strong', {}, 'Assistant settings'),
    h('p', { class: 'muted tiny' }, 'Off until you add a key. The key stays in this browser’s settings only: it is never in backups, project files or exports.'),
    h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Provider'), sel),
    h('p', { class: provider === 'gemini' ? 'ai-warn tiny' : 'muted tiny', 'data-k': 'ai-note' }, PROVIDERS[provider].note),
    h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'API key'), keyIn),
    h('p', { class: 'muted tiny' }, PROVIDERS[provider].keyHelp),
    h('label', { class: 'mf' }, h('span', { class: 'mf-l' }, 'Model'), modelIn),
    h(
      'div',
      { class: 'row' },
      button('Save key', save, { iconName: 'key', variant: 'sm primary' }),
      saved ? button('Remove key', remove, { iconName: 'trash', variant: 'sm ghost' }) : null,
      aiConfig(s) ? button('Done', () => ((st.setup = false), (st.pick = ''), render(st)), { variant: 'sm ghost' }) : null,
    ),
  );
}

function writer(st, s, cfg) {
  const { task, context } = st.ctx;
  const c = context() || {};
  const hasLyrics = !c.instrumental && !!String(c.lyrics || '').trim();
  const ok = hasLyrics && lyricsAllowed(s, c.title, c.released);
  const prompt = buildPrompt({ ...c, task, tone: st.tone, lyricsOk: ok });
  const lyricsSwitch = hasLyrics
    ? h(
        'label',
        { class: 'ai-check', 'data-k': 'ai-lyrics-ok' },
        h('input', {
          type: 'checkbox',
          checked: ok,
          onchange: (e) => {
            saveSettings(withLyricsAllowed(loadSettings(), c.title, e.target.checked));
            render(st);
          },
        }),
        h('span', {}, `OK to send these lyrics to the assistant${c.title ? ` (“${c.title}”)` : ''}`),
      )
    : null;
  const lyricsNote = hasLyrics
    ? h('p', { class: ok && cfg.provider === 'gemini' && !c.released ? 'ai-warn tiny' : 'muted tiny' }, ok ? (cfg.provider === 'gemini' && !c.released ? 'This song isn’t out yet. On Google’s free tier what you send may be used to improve its products; a paid key is safer for unreleased lyrics.' : 'The lyrics are part of the request.') : `The lyrics stay here${c.released ? '' : ' (off by default for songs that aren’t out yet)'}; only the title, artist and draft are sent.`)
    : c.instrumental
      ? h('p', { class: 'muted tiny' }, 'An instrumental: no lyrics are sent.')
      : null;
  const send = async () => {
    if (st.busy) return;
    st.busy = true;
    st.status = `Writing with ${cfg.label}…`;
    st.error = false;
    render(st);
    try {
      // read the settings and the context again: what is sent is what the box showed at the click
      const now = aiConfig(loadSettings());
      const cc = context() || {};
      const lok = !cc.instrumental && !!String(cc.lyrics || '').trim() && lyricsAllowed(loadSettings(), cc.title, cc.released);
      const got = await askAssistant(now, { ...cc, task, tone: st.tone, lyricsOk: lok }, fetchForTesting ? { fetchFn: fetchForTesting } : {});
      st.drafts = [...got.drafts.map((text) => ({ text, from: got.label })), ...st.drafts].slice(0, 6);
      st.status = `${got.drafts.length} draft${got.drafts.length === 1 ? '' : 's'} from ${got.label}. Edit one and use it, or discard it.`;
    } catch (e) {
      st.status = (e && e.kind && e.message) || 'Something went wrong. Try again.';
      st.error = true;
    } finally {
      st.busy = false;
      render(st);
    }
  };
  const max = (TASKS[task] || {}).max || 0;
  return h(
    'div',
    { class: 'ai-writer' },
    h('p', { class: 'muted tiny', 'data-k': 'ai-to' }, `Sends to ${cfg.label} (${cfg.model}), only when you click Send. `, h('button', { type: 'button', class: 'link', onclick: () => ((st.setup = true), render(st)) }, 'Assistant settings')),
    h(
      'div',
      { class: 'seg', role: 'radiogroup', 'aria-label': 'Tone' },
      TONES.map(([id, label]) => h('button', { type: 'button', role: 'radio', 'aria-checked': st.tone === id ? 'true' : 'false', class: st.tone === id ? 'on' : '', onclick: () => ((st.tone = id), render(st)) }, label)),
    ),
    lyricsSwitch,
    lyricsNote,
    h('details', { class: 'ai-sent tiny' }, h('summary', {}, `What gets sent to ${cfg.label}`), h('pre', { 'data-k': 'ai-preview' }, prompt.user)),
    h('div', { class: 'row' }, button(st.busy ? 'Writing…' : `Send to ${cfg.label}`, send, { iconName: 'sparkle', variant: 'sm primary', disabled: st.busy })),
    st.status ? h('p', { class: st.error ? 'warn-list tiny' : 'muted tiny', role: 'status', 'data-k': 'ai-status' }, st.status) : null,
    st.drafts.length
      ? h(
          'div',
          { class: 'ai-drafts' },
          st.drafts.map((d) => {
            const box = h('textarea', { rows: 4, 'aria-label': `Draft from ${d.from}`, 'data-k': 'ai-draft' });
            box.value = d.text;
            box.addEventListener('input', () => (d.text = box.value));
            return h(
              'div',
              { class: 'ai-draft' },
              box,
              h(
                'div',
                { class: 'row' },
                button(st.ctx.acceptLabel, () => {
                  st.drafts = st.drafts.filter((x) => x !== d);
                  st.ctx.onAccept(max && d.text.length > max ? d.text.slice(0, max) : d.text);
                  render(st);
                }, { iconName: 'check', variant: 'sm' }),
                button('Discard', () => ((st.drafts = st.drafts.filter((x) => x !== d)), render(st)), { variant: 'sm ghost' }),
                h('span', { class: 'muted tiny' }, `${d.from} · ${d.text.length} characters${max ? ` / ${max}` : ''}`),
              ),
            );
          }),
        )
      : null,
  );
}

/** Video Studio "From your lyrics": video ideas drafted from the edit's lyrics; a draft you keep is copied. */
export function lyricIdeasAssistant(getProject) {
  return assistantBox({
    id: 'lyric-ideas',
    task: 'ideas',
    context: () => projectContext(getProject()),
    onAccept: (text) => navigator.clipboard.writeText(text).then(() => toast('Idea copied. Paste it into the song’s Video shoot tab, or your notes.'), () => toast('Could not copy', 'error')),
    acceptLabel: 'Copy idea',
  });
}
