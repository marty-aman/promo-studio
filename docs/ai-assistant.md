# Writing assistant (optional, your own API key)

The writing assistant drafts post captions, video ideas and pitches with an AI model you pick. It is off until you add a key. Without a key, nothing is sent anywhere, and every existing tool works as it did before.

## Where it is

A **Write with assistant** button sits inside tools that already exist. It does not add a new panel.

| Where | What it drafts | What "use" does |
|---|---|---|
| Video Studio → Export, Inspiration, Carousel (the caption picker) | 3 post captions, for Instagram or TikTok | Puts the draft in the caption box |
| Video Studio → Start → Suggested → From your lyrics | 3 video concepts | Copies the idea |
| Manager → song → Video shoot | 3 video concepts | Makes it the shoot's Concept |
| Manager → song → Pitching → Spotify for Artists pitch | 3 song descriptions, under 500 characters | Makes it the song description |
| Manager → song → Pitching → Pitch an independent curator | 3 short curator messages | Puts it in the message box |

Each reply comes back as up to three **editable drafts**. Edit one and use it, or discard it. Tone options: **Hype**, **Heartfelt** and **Short**.

## Settings

Open the box and pick **Assistant settings**:

- **Provider:** Google Gemini, OpenAI or Anthropic Claude.
- **API key:** stored only in this browser's settings (`pvm.settings.v1`), in the same place as the YouTube and setlist.fm keys. The key is shown masked (only its last 4 characters). **Remove key** deletes it. Each provider keeps its own key, so you can switch providers without pasting a key again.
- **Model:** leave it empty to use the default (`gemini-2.5-flash`, `gpt-4.1-mini`, `claude-sonnet-4-5`), or type another model name your key can use.

The key never appears in Manager backups, project files, exports, the page, console output or error messages. Error messages are written by the app from the status code alone. The provider's own message text is never shown, because OpenAI's message quotes part of the key.

## What is sent, and when

- Nothing is sent until you click **Send to <provider>**. The button and the line above it name the provider and the model.
- **What gets sent** shows the exact text of the request. That text is the task, the tone, the artist, the song title, the genre and the current draft, plus the lyrics if you allow them. Lyrics longer than 4,000 characters are cut, and the request says so.
- The assistant never sends audio, video, stems or images.
- **OK to send these lyrics to the assistant** is a switch for each song, remembered by song title. It is off by default for songs that are not out yet, on for released songs, and missing for instrumentals.

### Google Gemini's free tier

Gemini is the only provider here with a free tier. On that tier, Google may use what you send to improve its products. Unreleased lyrics are therefore better sent with a paid key, meaning a key on a Google Cloud project with billing turned on. The app shows this warning next to Gemini, and again when an unreleased song's lyrics would be sent to it.

## How each provider is reached

These results come from real browser requests made from a page on `http://127.0.0.1` on 2026-11-23, using invalid keys.

| Provider | Route | Why |
|---|---|---|
| Gemini | Browser → `generativelanguage.googleapis.com`, key in the `x-goog-api-key` header | CORS is allowed for the page's origin, and its error replies can be read |
| Anthropic | Browser → `api.anthropic.com/v1/messages` with `anthropic-dangerous-direct-browser-access: true` | CORS is allowed (`*`), and its error replies can be read |
| OpenAI | Browser → this app's `server.js` (`/api/openai/chat`) → `api.openai.com` | The preflight passes, but OpenAI's error replies (for example 401) have no `Access-Control-Allow-Origin`. A browser therefore reports a bad key or an empty quota as a plain network error |

The OpenAI pass-through:

- uses the same Host, Origin and Sec-Fetch-Site checks as the setlist.fm one, so only this app on this computer can use it;
- is bound to `127.0.0.1`;
- accepts only `POST` with a JSON body of 256 KB or less;
- forwards only `model`, the system and user messages, and a capped token limit;
- returns an error reply cut down to its code and type, and stores and logs nothing.

If the app is served by a plain static host instead of `npm start`, OpenAI is not available. Gemini and Claude still work.

## For developers

- `js/ai/assistant.js` is the request logic, with no DOM: settings helpers, `buildPrompt`, `buildRequest`, `parseResponse`, `splitDrafts`, `errorFor`, `scrub` and `askAssistant`.
- `js/ai/panel-assistant.js` is the box: `assistantBox({ id, task, context, onAccept, acceptLabel })`. Test code can call `setAssistantFetchForTesting(fn)` to stub the providers.
- The settings keys are `aiProvider`, `aiKeys`, `aiModels` and `aiLyricsOk`.
- `test/ai-assistant.test.js` covers request building, response parsing and error messages for each provider. It also builds a Manager backup and a project file with keys set and checks that no key appears in them.
