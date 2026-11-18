// Suggested-caption picker shared by Export, the Inspiration page and the carousel tool.
import { h, button, toast } from './dom.js';
import { suggestCaptions, CAPTION_SOURCES, CAPTION_RESEARCHED_ON } from './captions.js';
import { loadSettings } from './state.js';

const state = { platform: 'instagram', pick: null };

/**
 * opts: { project, settings, kind: 'video'|'carousel', slides, credits: [string], onUse(text) }
 * Returns an element with caption ideas for TikTok or Instagram, an editable box and Copy.
 */
export function captionPicker({ project, settings: given, kind = 'video', slides = 5, credits = [], onUse = null }) {
  // the Inspiration page saves bands / city on its own copy of the settings, so read them fresh
  const settings = { ...(given || {}), ...loadSettings() };
  const ideas = suggestCaptions(project, { similar: settings.similarBands || '', city: settings.city ?? 'Seattle', kind, slides });
  const preferred = project.captionStyle && ideas.find((i) => i.id === project.captionStyle);
  let pick = (state.pick && ideas.find((i) => i.id === state.pick)) || preferred || ideas[0];
  const root = h('div', { class: 'cap-picker' });
  const box = h('textarea', { rows: 7, 'aria-label': 'Caption' });
  const count = h('span', { class: 'muted tiny' });
  const textFor = (idea) => {
    const t = state.platform === 'tiktok' ? idea.tiktok : idea.instagram;
    return credits.length ? `${t}\n\nFootage: ${credits.join('; ')}` : t;
  };
  const updateCount = () => {
    const first = box.value.split('\n')[0];
    const tags = (box.value.match(/#[\p{L}\p{N}_]+/gu) || []).length;
    const limit = state.platform === 'tiktok' ? 150 : 2200;
    count.textContent = `${box.value.length} characters${state.platform === 'tiktok' && box.value.length > limit ? ' (aim for under 150 on TikTok)' : ''} · ${tags} hashtag${tags === 1 ? '' : 's'}${tags > 5 ? ' (Instagram allows 5)' : ''} · first line ${first.length > 60 ? 'is long; keep the hook short' : 'OK'}`;
  };
  box.addEventListener('input', updateCount);
  const render = () => {
    box.value = textFor(pick);
    updateCount();
    root.replaceChildren(
      h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Caption for' },
        [['instagram', 'Instagram'], ['tiktok', 'TikTok / Shorts']].map(([id, label]) =>
          h('button', { type: 'button', role: 'radio', 'aria-checked': state.platform === id ? 'true' : 'false', class: state.platform === id ? 'on' : '', onclick: () => ((state.platform = id), render()) }, label))),
      h('div', { class: 'cap-ideas', role: 'radiogroup', 'aria-label': 'Caption ideas' },
        ideas.map((idea) =>
          h('button', {
            type: 'button', role: 'radio', 'aria-checked': idea === pick ? 'true' : 'false', class: `cap-idea${idea === pick ? ' on' : ''}`, title: idea.why,
            onclick: () => ((pick = idea), (state.pick = idea.id), render()),
          }, h('strong', {}, idea.style), h('span', {}, (state.platform === 'tiktok' ? idea.tiktok : idea.instagram).split('\n')[0])))),
      h('p', { class: 'muted tiny' }, pick.why),
      box,
      count,
      h('div', { class: 'row' },
        button('Copy caption', () => navigator.clipboard.writeText(box.value).then(() => toast('Caption copied'), () => toast('Could not copy', 'error')), { iconName: 'copy', variant: 'sm primary' }),
        onUse ? button('Use for sharing', () => onUse(box.value), { variant: 'ghost sm' }) : null),
      h('details', { class: 'tiny muted' },
        h('summary', {}, `Why these captions (researched ${CAPTION_RESEARCHED_ON})`),
        h('ul', {}, h('li', {}, 'Hook in the first 3–7 words: only the first line shows before “more”.'), h('li', {}, 'Plain searchable words (genre, city, “new song”): both apps search caption text.'), h('li', {}, 'One specific ask. A send to a friend’s DMs counts most on Instagram.'), h('li', {}, 'At most 5 hashtags (Instagram’s limit), niche over generic.')),
        h('div', {}, CAPTION_SOURCES.map((s, i) => [i ? ' · ' : '', h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.label)]))),
    );
  };
  render();
  root.currentText = () => box.value;
  return root;
}
