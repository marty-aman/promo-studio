// "Faster speech" in the Mac app's Storage panel: turn whisper.cpp on for lyric sync and speech captions, see whether
// the program and its models are in place, download a model (after asking, with a checksum), remove it. Nothing here
// shows in the web build (no window.desktop). The work itself is in nativewhisper.js and electron/native.cjs.
import { h, button, toast } from '../dom.js';
import { desktop } from '../desktop.js';
import { NATIVE_MODELS, nativeSetting, setNativeSetting, nativeStatus } from './nativewhisper.js';

const mb = (n) => `${Math.round(n / 1e6)} MB`; // decimal, like the sizes Hugging Face lists

/** The panel, or null in a browser. `onChange()` is called after anything that changes the models on disk. */
export function nativeWhisperBlock({ onChange = () => {} } = {}) {
  if (!desktop || !desktop.native || !desktop.native.status) return null;
  const box = h('div', { class: 'storage-native small', 'data-native-whisper': '' });
  let st = null;
  const progress = new Map(); // model -> fraction
  desktop.native.onEvent((e) => {
    if (e && e.type === 'download') {
      progress.set(e.model, e.total ? e.loaded / e.total : 0);
      paint();
    }
  });

  async function refresh() {
    st = await nativeStatus();
    paint();
  }

  async function download(m) {
    if (!confirm(`Download the ${m.label} speech model (${mb(m.bytes)}) from huggingface.co?\n\nIt is kept in the app's own folder, checked against a fixed checksum, and can be removed here. No song data is sent.`)) return;
    progress.set(m.name, 0);
    paint();
    try {
      await desktop.native.download(m.name, { consent: true });
      toast(`${m.label} is ready.`);
    } catch (e) {
      toast(`The download stopped: ${(e && e.message) || e}`, 'error', 7000);
    }
    progress.delete(m.name);
    await refresh();
    onChange();
  }

  async function remove(m) {
    if (!confirm(`Delete the ${m.label} model (${mb(m.bytes)}) from this Mac?`)) return;
    await desktop.native.removeModel(m.name).catch(() => {});
    if (nativeSetting().model === m.name) setNativeSetting({ on: false });
    await refresh();
    onChange();
  }

  function paint() {
    if (!st) return box.replaceChildren(h('p', { class: 'muted' }, 'Checking the speech tool…'));
    const tool = st.tools.whisper && st.tools.whisper.installed;
    const set = nativeSetting();
    const chosen = st.models.find((m) => m.name === set.model);
    const ready = !!(tool && chosen && chosen.installed);
    const toggle = h('input', { type: 'checkbox', checked: set.on && ready, disabled: !ready, 'data-native-on': '' });
    toggle.addEventListener('change', () => (setNativeSetting({ on: toggle.checked }), paint()));
    const sel = h('select', { 'aria-label': 'Speech model for whisper.cpp', 'data-native-model': '' }, Object.entries(NATIVE_MODELS).map(([v, label]) => h('option', { value: v, selected: v === set.model }, label)));
    sel.addEventListener('change', () => (setNativeSetting({ model: sel.value }), paint()));
    box.replaceChildren(
      h('h4', { class: 'storage-h' }, 'Faster speech (whisper.cpp)'),
      h('p', { class: 'muted' }, 'Lyric sync and speech captions can run on whisper.cpp, a program made for your Mac, instead of the model in the app. It is off until you turn it on, and the app\u2019s own model is used whenever it is off or fails.'),
      h('p', {}, tool ? 'The whisper program is in place.' : ['The whisper program is not installed. Put a whisper.cpp build named \u201cwhisper\u201d in the tools folder. ', button('Open the tools folder', () => desktop.native.reveal('bin'), { variant: 'sm' })]),
      h('ul', { class: 'storage-native-models' }, st.models.map((m) => {
        const frac = progress.get(m.name);
        return h(
          'li',
          { 'data-model': m.name },
          h('span', {}, `${m.label}, ${mb(m.bytes)}: `),
          frac !== undefined ? h('span', {}, `downloading ${Math.round(frac * 100)} %  `) : m.installed ? h('span', {}, 'downloaded  ') : null,
          frac !== undefined ? button('Cancel', () => desktop.native.cancelDownload(m.name), { variant: 'sm' }) : m.installed ? button('Delete', () => remove(m), { variant: 'sm' }) : button('Download\u2026', () => download(m), { variant: 'sm' }),
        );
      })),
      h('label', { class: 'row' }, h('span', {}, 'Model: '), sel),
      h('label', { class: 'row' }, toggle, h('span', {}, ' Use whisper.cpp for lyric sync and speech captions')),
      !ready && set.on ? h('p', { class: 'muted' }, 'It is on, but the program or the chosen model is missing, so the app\u2019s own model is used.') : null,
    );
  }

  paint();
  refresh();
  return box;
}
