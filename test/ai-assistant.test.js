import test from 'node:test';
import assert from 'node:assert/strict';

// a browser-like localStorage, so the real settings, workspace and project code run
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

const A = await import('../js/ai/assistant.js');
const { loadSettings, saveSettings, newProject, saveProject } = await import('../js/state.js');
const { makeProjectFile } = await import('../js/projectfile.js');
const { loadWorkspace, saveWorkspace, workspaceBackup, workspaceFrom } = await import('../js/manager/artists.js');
const { newManager, newSong } = await import('../js/manager/model.js');

const KEY = 'AIzaSyD-THIS-IS-A-FAKE-TEST-KEY-1234567';
const OKEY = 'sk-proj-FAKEFAKEFAKEFAKEFAKE0987654321';
const CKEY = 'sk-ant-api03-FAKEFAKEFAKEFAKE-xyz789';
const cfgOf = (provider, key) => ({ provider, key, model: A.PROVIDERS[provider].model, label: A.PROVIDERS[provider].label });
const ctx = { task: 'caption', tone: 'hype', title: 'Static Bloom', artist: 'Arc Flash', lyrics: 'Burn it down\nI am the fire tonight', lyricsOk: true, draft: 'New song out now' };
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('off by default: no provider or no key means no config', () => {
  assert.equal(A.aiConfig({}), null);
  assert.equal(A.aiConfig({ aiProvider: 'gemini' }), null);
  assert.equal(A.aiConfig({ aiProvider: 'gemini', aiKeys: { gemini: '   ' } }), null);
  assert.equal(A.aiConfig({ aiProvider: 'nope', aiKeys: { nope: 'x' } }), null);
  const c = A.aiConfig({ aiProvider: 'anthropic', aiKeys: { anthropic: CKEY } });
  assert.deepEqual(c, { provider: 'anthropic', key: CKEY, model: 'claude-sonnet-4-5', label: 'Anthropic Claude' });
});

test('keys per provider: switching keeps each key, a custom model sticks, Remove turns it off', () => {
  let s = A.withKey({}, 'gemini', KEY, '');
  s = A.withKey(s, 'openai', OKEY, 'gpt-4o');
  assert.equal(A.aiConfig(s).provider, 'openai');
  assert.equal(A.aiConfig(s).model, 'gpt-4o');
  s = { ...s, aiProvider: 'gemini' }; // provider switched mid-session
  assert.equal(A.aiConfig(s).key, KEY);
  assert.equal(A.aiConfig(s).model, 'gemini-2.5-flash');
  s = A.withoutKey(s, 'gemini');
  assert.equal(A.aiConfig(s), null);
  assert.equal(s.aiKeys.openai, OKEY);
  assert.equal(A.withKey({}, 'openai', OKEY, 'gpt-4.1-mini').aiModels.openai, undefined); // the default is not stored
});

test('maskKey never shows more than the last 4 characters', () => {
  assert.equal(A.maskKey(KEY), '•••• 4567');
  assert.equal(A.maskKey('short'), '••••');
  assert.equal(A.maskKey(''), '');
  assert.ok(!A.maskKey(KEY).includes(KEY.slice(0, 8)));
});

test('lyrics: per song, off for unreleased songs, on for released ones, and the owner decides', () => {
  assert.equal(A.lyricsAllowed({}, 'Static Bloom', false), false);
  assert.equal(A.lyricsAllowed({}, 'Static Bloom', true), true);
  let s = A.withLyricsAllowed({}, 'Static Bloom', true);
  assert.equal(A.lyricsAllowed(s, ' static bloom ', false), true);
  assert.equal(A.lyricsAllowed(s, 'Night Drive', false), false);
  s = A.withLyricsAllowed(s, 'Night Drive', false);
  assert.equal(A.lyricsAllowed(s, 'Night Drive', true), false);
});

test('buildPrompt sends lyrics only when allowed, never for an instrumental, and cuts very long lyrics', () => {
  const on = A.buildPrompt(ctx);
  assert.ok(on.user.includes('Burn it down') && on.sent.lyrics && !on.sent.cut);
  assert.ok(on.user.includes('Song: Static Bloom') && on.user.includes('Artist: Arc Flash') && on.user.includes('New song out now'));
  const off = A.buildPrompt({ ...ctx, lyricsOk: false });
  assert.ok(!off.user.includes('Burn it down') && !off.sent.lyrics);
  const inst = A.buildPrompt({ ...ctx, instrumental: true });
  assert.ok(!inst.user.includes('Burn it down') && inst.user.includes('instrumental'));
  const empty = A.buildPrompt({ ...ctx, lyrics: '   ' });
  assert.ok(!empty.user.includes('Lyrics') && !empty.sent.lyrics);
  const long = A.buildPrompt({ ...ctx, lyrics: 'scream '.repeat(2000) });
  assert.ok(long.sent.cut && long.user.includes('first part only') && long.user.length < A.MAX_LYRICS + 1000);
  assert.ok(A.buildPrompt({ ...ctx, task: 'pitch' }).user.includes('under 500 characters'));
  assert.ok(A.buildPrompt({ ...ctx, tone: 'short' }).user.includes('as short as'));
});

test('buildRequest: Gemini puts the key in x-goog-api-key, never in the URL', () => {
  const p = A.buildPrompt(ctx);
  const { url, init } = A.buildRequest(cfgOf('gemini', KEY), p);
  assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['x-goog-api-key'], KEY);
  assert.ok(!url.includes(KEY) && !init.body.includes(KEY));
  const b = JSON.parse(init.body);
  assert.equal(b.systemInstruction.parts[0].text, p.system);
  assert.equal(b.contents[0].parts[0].text, p.user);
});

test('buildRequest: OpenAI goes to the same-origin pass-through with the key in a header', () => {
  const { url, init } = A.buildRequest({ ...cfgOf('openai', OKEY), model: 'gpt-4o' }, A.buildPrompt(ctx));
  assert.equal(url, '/api/openai/chat');
  assert.equal(init.headers['X-OpenAI-Key'], OKEY);
  const b = JSON.parse(init.body);
  assert.equal(b.model, 'gpt-4o');
  assert.deepEqual(b.messages.map((m) => m.role), ['system', 'user']);
  assert.ok(!init.body.includes(OKEY));
});

test('buildRequest: Anthropic sends the browser-access header and version', () => {
  const { url, init } = A.buildRequest(cfgOf('anthropic', CKEY), A.buildPrompt(ctx));
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.equal(init.headers['x-api-key'], CKEY);
  assert.equal(init.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(init.headers['anthropic-version'], '2023-06-01');
  const b = JSON.parse(init.body);
  assert.equal(b.model, 'claude-sonnet-4-5');
  assert.ok(b.max_tokens > 0 && typeof b.system === 'string' && b.messages[0].role === 'user');
  assert.ok(!init.body.includes(CKEY));
});

test('parseResponse reads each provider’s reply shape', () => {
  assert.equal(A.parseResponse('gemini', { candidates: [{ content: { parts: [{ text: 'A' }, { text: 'B' }] } }] }), 'AB');
  assert.equal(A.parseResponse('openai', { choices: [{ message: { content: ' Hi ' } }] }), 'Hi');
  assert.equal(A.parseResponse('anthropic', { content: [{ type: 'text', text: 'Yo' }, { type: 'tool_use' }] }), 'Yo');
  assert.throws(() => A.parseResponse('gemini', { candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] }), (e) => e.kind === 'blocked');
  assert.throws(() => A.parseResponse('gemini', { promptFeedback: { blockReason: 'OTHER' } }), (e) => e.kind === 'blocked');
  assert.throws(() => A.parseResponse('openai', { choices: [{ message: { content: null, refusal: 'no' } }] }), (e) => e.kind === 'blocked');
  assert.throws(() => A.parseResponse('anthropic', { content: [] }), (e) => e.kind === 'empty');
  assert.throws(() => A.parseResponse('openai', null), (e) => e.kind === 'empty');
});

test('splitDrafts splits on ---, drops numbering, keeps 3 and honours a limit', () => {
  assert.deepEqual(A.splitDrafts('1. One\n---\nDraft 2: Two\n---\nThree\n---\nFour'), ['One', 'Two', 'Three']);
  assert.deepEqual(A.splitDrafts('Only one'), ['Only one']);
  const d = A.splitDrafts('word '.repeat(200), 500)[0];
  assert.ok(d.length <= 500);
});

test('error messages: bad key, quota, model, busy, network; none echo the key', async () => {
  const cases = [
    ['gemini', 400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: `API key not valid ${KEY}`, details: [{ reason: 'API_KEY_INVALID' }] } }, 'key', KEY],
    ['openai', 401, { error: { code: 'invalid_api_key', type: 'invalid_request_error' } }, 'key', OKEY],
    ['anthropic', 401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 'key', CKEY],
    ['gemini', 429, { error: { status: 'RESOURCE_EXHAUSTED', message: 'quota' } }, 'quota', KEY],
    ['openai', 429, { error: { code: 'insufficient_quota' } }, 'quota', OKEY],
    ['anthropic', 404, { error: { type: 'not_found_error' } }, 'model', CKEY],
    ['anthropic', 529, { error: { type: 'overloaded_error' } }, 'busy', CKEY],
  ];
  for (const [provider, status, body, kind, key] of cases) {
    await assert.rejects(A.askAssistant(cfgOf(provider, key), ctx, { fetchFn: async () => reply(status, body) }), (e) => {
      assert.equal(e.kind, kind, `${provider} ${status}`);
      assert.ok(!e.message.includes(key) && !e.message.includes(key.slice(-8)), e.message);
      assert.ok(e.message.includes(A.PROVIDERS[provider].label));
      return true;
    });
  }
  // network failure (and OpenAI's CORS-blocked error replies look like this in a browser)
  for (const p of A.PROVIDER_IDS) {
    await assert.rejects(A.askAssistant(cfgOf(p, KEY), ctx, { fetchFn: async () => { throw new TypeError(`NetworkError ${KEY}`); } }), (e) => e.kind === 'network' && !e.message.includes(KEY));
  }
  await assert.rejects(A.askAssistant(null, ctx), (e) => e.kind === 'off');
});

test('scrub removes the key and key-shaped strings', () => {
  assert.equal(A.scrub(`bad ${KEY} here`, KEY), 'bad •••• here');
  assert.ok(!A.scrub('Incorrect API key provided: sk-proj-abcdefgh1234', '').includes('sk-proj-abcdefgh'));
});

test('askAssistant sends exactly one request to the chosen provider and returns drafts', async () => {
  const calls = [];
  const fetchFn = async (url, init) => (calls.push([url, init]), reply(200, { candidates: [{ content: { parts: [{ text: 'Draft A\n---\nDraft B' }] } }] }));
  const got = await A.askAssistant(cfgOf('gemini', KEY), ctx, { fetchFn });
  assert.equal(calls.length, 1);
  assert.ok(calls[0][0].startsWith('https://generativelanguage.googleapis.com/'));
  assert.deepEqual(got.drafts, ['Draft A', 'Draft B']);
  assert.equal(got.label, 'Google Gemini');
});

test('the key is never in a Manager backup, a project file or anything else saved but the settings', () => {
  store.clear();
  let s = A.withKey(loadSettings(), 'gemini', KEY);
  s = A.withKey(s, 'openai', OKEY);
  s = A.withKey(s, 'anthropic', CKEY);
  saveSettings(A.withLyricsAllowed(s, 'Static Bloom', true));
  const m = newManager();
  m.songs.push({ ...newSong('Static Bloom'), lyrics: 'Burn it down' });
  saveWorkspace(workspaceFrom(m));
  const p = newProject();
  p.lyrics = [{ id: 'l1', text: 'Burn it down', start: 0, end: 2 }];
  saveProject(p);
  const backup = workspaceBackup(loadWorkspace());
  const file = makeProjectFile(p, {});
  for (const k of [KEY, OKEY, CKEY]) {
    assert.ok(!backup.includes(k), 'backup holds a key');
    assert.ok(!file.includes(k), 'project file holds a key');
    for (const [name, v] of store) if (name !== 'pvm.settings.v1') assert.ok(!v.includes(k), `${name} holds a key`);
  }
  assert.ok(backup.includes('Static Bloom') && file.includes('Burn it down')); // the files are real
  assert.ok(store.get('pvm.settings.v1').includes(KEY)); // and the key is where it should be
});
