// Optional writing assistant: drafts captions, video ideas and pitches with the owner's own API key.
// fetch only, no SDK. Nothing here runs until the owner saves a key AND clicks Send; it only ever sends the
// text shown in the "What gets sent" box (title, artist, a draft and, when allowed for that song, lyrics),
// never audio, video or stems. The key lives in this browser's settings (pvm.settings.v1) and is never put
// in an error message, a log line, a backup, a project file or an export.

export const PROVIDERS = {
  gemini: {
    label: 'Google Gemini',
    model: 'gemini-2.5-flash',
    keyHelp: 'Get a key at aistudio.google.com → Get API key.',
    note: 'Google’s free tier may use what you send to improve its products. Unreleased lyrics are better sent with a paid key (a key on a project with billing turned on).',
  },
  openai: {
    label: 'OpenAI',
    model: 'gpt-4.1-mini',
    keyHelp: 'Get a key at platform.openai.com → API keys. Paid use only.',
    note: 'OpenAI does not let web pages read its replies, so this one goes through the app’s own server on this computer (npm start). That server keeps and logs nothing.',
  },
  anthropic: {
    label: 'Anthropic Claude',
    model: 'claude-sonnet-4-5',
    keyHelp: 'Get a key at console.anthropic.com → API keys. Paid use only.',
    note: 'Sent straight from this browser to Anthropic.',
  },
};
export const PROVIDER_IDS = Object.keys(PROVIDERS);

export const TONES = [
  ['hype', 'Hype'],
  ['heartfelt', 'Heartfelt'],
  ['short', 'Short'],
];

// what each tool asks for; `max` is a hard character limit the draft must fit (Spotify's pitch box)
export const TASKS = {
  caption: { what: 'a social media post caption', ask: 'Write 3 different captions for a short video post promoting the song. Start each with a hook of a few words, end with one clear ask, and use at most 5 niche hashtags.' },
  ideas: { what: 'music video and short-form video ideas', ask: 'Write 3 different video concepts for the song. For each: a one-line title, two sentences on what happens, and the look (light, colour, location).' },
  pitch: { what: 'a Spotify for Artists editorial pitch', ask: 'Write 3 different song descriptions for a Spotify for Artists editorial pitch: what the song is about, its sound, and why it fits playlists. Plain text, no hashtags, no emojis.', max: 500 },
  curator: { what: 'a short message to an independent playlist curator', ask: 'Write 3 different short, friendly messages to an independent playlist curator asking them to consider the song. Keep each under 90 words. No flattery, no pressure.' },
};

const TONE_TEXT = {
  hype: 'Tone: high energy and confident, like a band hyping its own release.',
  heartfelt: 'Tone: sincere and personal, about what the song means to the band.',
  short: 'Tone: as short as it can be while still working. One or two lines each.',
};

export const MAX_LYRICS = 4000; // characters; very long lyrics are cut (the request says so)
export const MAX_DRAFT = 3000;
const SEP = '---';

export class AiError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = 'AiError';
    this.kind = kind;
  }
}

// ------------------------------------------------------------ settings (pvm.settings.v1)
// aiProvider: '' (off) | 'gemini' | 'openai' | 'anthropic'
// aiKeys: { [provider]: key }   aiModels: { [provider]: model }   aiLyricsOk: { [song title, lower case]: bool }

/** The chosen provider with its key and model, or null when the assistant is off (no provider or no key). */
export function aiConfig(s = {}) {
  const provider = PROVIDERS[s.aiProvider] ? s.aiProvider : '';
  const key = provider ? String((s.aiKeys || {})[provider] || '').trim() : '';
  if (!provider || !key) return null;
  const model = String((s.aiModels || {})[provider] || '').trim() || PROVIDERS[provider].model;
  return { provider, key, model, label: PROVIDERS[provider].label };
}

/** Settings with this provider's key saved (and the provider picked); an empty key removes it. Returns a new object. */
export function withKey(s, provider, key, model = '') {
  if (!PROVIDERS[provider]) throw new AiError('provider', 'Pick a provider first.');
  const keys = { ...(s.aiKeys || {}) };
  const models = { ...(s.aiModels || {}) };
  const k = String(key || '').trim();
  if (k) keys[provider] = k;
  else delete keys[provider];
  const m = String(model || '').trim();
  if (m && m !== PROVIDERS[provider].model) models[provider] = m;
  else delete models[provider];
  return { ...s, aiProvider: provider, aiKeys: keys, aiModels: models };
}

/** Settings with this provider's key removed; the assistant turns off when it was the chosen one. */
export function withoutKey(s, provider) {
  const keys = { ...(s.aiKeys || {}) };
  delete keys[provider];
  return { ...s, aiKeys: keys, aiProvider: s.aiProvider === provider ? '' : s.aiProvider || '' };
}

/** "Saved, ends …x9Q2" without ever showing the key; short keys show no characters at all. */
export function maskKey(key) {
  const k = String(key || '');
  if (!k) return '';
  return k.length >= 16 ? `•••• ${k.slice(-4)}` : '••••';
}

const songKey = (title) => String(title || '').trim().toLowerCase();
/** May this song's lyrics be sent? Asked per song; off by default unless the song is already out. */
export function lyricsAllowed(s, title, released = false) {
  const v = (s.aiLyricsOk || {})[songKey(title)];
  return typeof v === 'boolean' ? v : !!released;
}
export function withLyricsAllowed(s, title, ok) {
  return { ...s, aiLyricsOk: { ...(s.aiLyricsOk || {}), [songKey(title)]: !!ok } };
}

// ------------------------------------------------------------ the request
const clip = (t, n) => {
  const s = String(t || '').replace(/\r\n?/g, '\n').trim();
  return s.length > n ? { text: s.slice(0, n), cut: true } : { text: s, cut: false };
};

/**
 * The exact text that would be sent. ctx: { task, tone, title, artist, genre, lyrics, lyricsOk, instrumental, draft, extra }.
 * Returns { system, user, sent: { lyrics: bool, cut: bool } }. Lyrics go in only when lyricsOk is set.
 */
export function buildPrompt(ctx) {
  const task = TASKS[ctx.task] || TASKS.caption;
  const tone = TONE_TEXT[ctx.tone] || TONE_TEXT.hype;
  const system = `You help an independent band write ${task.what}. Write in the band's own voice (first person plural). Never invent facts such as dates, streams, labels or awards. Separate the drafts with a line containing only ${SEP}. Output only the drafts, with no numbering and no commentary.`;
  const lines = [task.ask, tone];
  if (task.max) lines.push(`Each draft must be under ${task.max} characters.`);
  lines.push('');
  if (ctx.artist) lines.push(`Artist: ${clip(ctx.artist, 120).text}`);
  if (ctx.title) lines.push(`Song: ${clip(ctx.title, 160).text}`);
  if (ctx.genre) lines.push(`Genre: ${clip(ctx.genre, 160).text}`);
  if (ctx.extra) lines.push(clip(ctx.extra, 600).text);
  const ly = clip(ctx.lyrics, MAX_LYRICS);
  let sentLyrics = false;
  if (ctx.instrumental) lines.push('The song is an instrumental (no vocals).');
  else if (ly.text && ctx.lyricsOk) {
    lines.push('', `Lyrics${ly.cut ? ' (first part only)' : ''}:`, ly.text);
    sentLyrics = true;
  }
  const dr = clip(ctx.draft, MAX_DRAFT);
  if (dr.text) lines.push('', 'Our current draft, to improve on:', dr.text);
  return { system, user: lines.join('\n').trim(), sent: { lyrics: sentLyrics, cut: sentLyrics && ly.cut } };
}

const OPENAI_PROXY = '/api/openai/chat';
const MAX_TOKENS = 1500;

/** { url, init } for one request to the provider. The key goes only in a request header. */
export function buildRequest(cfg, { system, user }) {
  const { provider, key, model } = cfg;
  if (provider === 'gemini') {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { maxOutputTokens: MAX_TOKENS * 2, temperature: 0.9 } }),
      },
    };
  }
  if (provider === 'openai') {
    return {
      url: OPENAI_PROXY,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-OpenAI-Key': key },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_completion_tokens: MAX_TOKENS }),
      },
    };
  }
  if (provider === 'anthropic') {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model, max_tokens: MAX_TOKENS, system, messages: [{ role: 'user', content: user }] }),
      },
    };
  }
  throw new AiError('provider', 'Pick a provider first.');
}

/** The reply's text. Throws AiError('empty' | 'blocked') when there is none. */
export function parseResponse(provider, json) {
  let text = '';
  if (provider === 'gemini') {
    const c = (json && json.candidates && json.candidates[0]) || null;
    if (!c && json && json.promptFeedback && json.promptFeedback.blockReason) throw new AiError('blocked', 'Gemini would not answer this request (its safety filter). Try other wording or leave the lyrics out.');
    text = ((c && c.content && c.content.parts) || []).map((p) => p.text || '').join('');
    if (!text && c && c.finishReason === 'SAFETY') throw new AiError('blocked', 'Gemini would not answer this request (its safety filter). Try other wording or leave the lyrics out.');
  } else if (provider === 'openai') {
    const ch = json && json.choices && json.choices[0];
    text = (ch && ch.message && typeof ch.message.content === 'string' && ch.message.content) || '';
    if (!text && ch && ch.message && ch.message.refusal) throw new AiError('blocked', 'OpenAI would not answer this request. Try other wording or leave the lyrics out.');
  } else if (provider === 'anthropic') {
    text = ((json && json.content) || []).filter((b) => b && b.type === 'text').map((b) => b.text || '').join('');
  }
  text = text.trim();
  if (!text) throw new AiError('empty', 'The assistant sent back nothing. Try again.');
  return text;
}

/** Split a reply into up to 3 drafts; each is cut to `max` characters when the task has a limit. */
export function splitDrafts(text, max = 0) {
  const parts = String(text || '')
    .split(new RegExp(`^\\s*${SEP}+\\s*$`, 'm'))
    .map((t) => t.trim().replace(/^(draft|option)\s*\d+\s*[:.)-]\s*/i, '').replace(/^\d+[.)]\s+/, ''))
    .filter(Boolean);
  return parts.slice(0, 3).map((t) => (max && t.length > max ? t.slice(0, max).replace(/\s+\S*$/, '') : t));
}

/**
 * A plain message for a failed request. Built only from the status and the provider's error code: the
 * provider's own message is never shown, because some of them quote part of the key back.
 */
export function errorFor(provider, status, body = null) {
  const name = (PROVIDERS[provider] || {}).label || 'The provider';
  const err = (body && body.error) || {};
  const code = String(err.status || err.code || err.type || '').toUpperCase();
  const reason = JSON.stringify(err.details || '').toUpperCase();
  if (status === 401 || status === 403 || /API_KEY|INVALID_API_KEY|AUTHENTICATION|PERMISSION/.test(code + reason)) {
    return new AiError('key', `${name} did not accept the key. Check it under Assistant settings (copy it again from the provider’s site).`);
  }
  if (status === 429 || /QUOTA|RESOURCE_EXHAUSTED|RATE_LIMIT|INSUFFICIENT_QUOTA/.test(code)) {
    return new AiError('quota', `${name} says the key is out of quota or sending too fast. Wait a minute, or check the plan and billing on the provider’s site.`);
  }
  if (status === 402 || /BILLING|CREDIT/.test(code + reason)) return new AiError('quota', `${name} says the account has no credit left. Check billing on the provider’s site.`);
  if (status === 404 || /MODEL_NOT_FOUND|NOT_FOUND/.test(code)) return new AiError('model', `${name} does not know that model name. Clear the Model box to use the default.`);
  if (status === 529 || status >= 500) return new AiError('busy', `${name} is busy or down right now. Try again in a minute.`);
  if (status === 400) return new AiError('request', `${name} could not use this request. Check the model name, or try shorter text.`);
  return new AiError('other', `${name} answered with an error (${status}). Try again.`);
}

/** Make sure a message can never carry the key, even if one slipped into it. */
export function scrub(text, key) {
  let s = String(text || '');
  const k = String(key || '');
  if (k.length >= 4) s = s.split(k).join('••••');
  return s.replace(/\b(sk-[A-Za-z0-9_-]{6,}|AIza[0-9A-Za-z_-]{10,})\b/g, '••••');
}

/**
 * Send one request and return { drafts, provider, label }. Throws AiError with a message that never contains the key.
 * fetchFn is injectable for tests and the browser check.
 */
export async function askAssistant(cfg, ctx, { fetchFn = (...a) => fetch(...a), signal } = {}) {
  if (!cfg) throw new AiError('off', 'Add an API key under Assistant settings first.');
  const prompt = buildPrompt(ctx);
  const { url, init } = buildRequest(cfg, prompt);
  let res;
  try {
    res = await fetchFn(url, { ...init, signal: signal || (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(60000) : undefined) });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new AiError('network', 'Stopped.');
    const via = cfg.provider === 'openai' ? ' OpenAI goes through the app’s own server: start it with npm start and open the app from there.' : '';
    throw new AiError('network', `Could not reach ${cfg.label}. Check the internet connection and try again.${via}`);
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const e = errorFor(cfg.provider, res.status, body);
    e.message = scrub(e.message, cfg.key);
    throw e;
  }
  const text = parseResponse(cfg.provider, body);
  const drafts = splitDrafts(scrub(text, cfg.key), (TASKS[ctx.task] || {}).max || 0);
  if (!drafts.length) throw new AiError('empty', 'The assistant sent back nothing. Try again.');
  return { drafts, provider: cfg.provider, label: cfg.label };
}
