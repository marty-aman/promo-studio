# Auto-sync lyrics (on-device)

Times every line **and word** of a song's lyrics by listening to its vocals with a small speech model that runs in
your browser. Nothing is uploaded: the only network call is the one-time model download from huggingface.co,
made after you agree, and it carries no song data.

## Where
- **Video Studio → Lyrics tab → "Or let the computer do it"** (under "2 · Sync to the song").
- **Manager → a song → Lyrics tab → Timing → Auto-sync lyrics.**

## How it works
1. The audio is the song's **vocal stem** (Files tab, part "Lead vocals"). Without one it uses the full mix and says
   so: much less accurate. There is no stem separation; add a vocal stem for good results.
2. Decoded to 16 kHz mono, cut into pieces under 28 s at the quietest gap (never through a word); silent pieces
   are skipped. The language you pick is always passed to the model.
3. `onnx-community/whisper-base_timestamped` (q8, about 77 MB, MIT) returns words with times.
4. The heard words are lined up with your lyrics (edit-distance alignment, `js/ai/lyricsync.js`). Matched words take
   the heard time; the others are spread between matched neighbours. Each line gets a confidence (the share of its
   words heard; a near miss counts 0.6). Lines under 0.5 are listed as "not sure" for tap-sync.
5. Result: one undo step in the studio; on the song it is saved as `song.lyricTiming` with source `auto`.

## Saved shape (`js/manager/lyrictiming.js`)
`lines[i] = { t, end?, text, words?: [{ w, t, end? }], conf? }` (song seconds, at most 40 words a line, sorted,
clamped). Words and confidence survive save, backup and restore. The karaoke and word-by-word lyric styles
(`js/core.js savedWordTimes`, `lyricviz.js wordTimes`, `renderer.js`) and word-level captions
(`subtitles.js` cues and caption texts) use the saved times when the words still match the line and fall back to
the proportional split otherwise (text edited, line moved far away). Shift, split and caption shifts move them too.

## Runtime (`js/ai/runtime.js`, shared)
`loadPipeline(task, model, { onProgress, consented })`, `modelInfo()`, `setPipelineForTesting(task, fake)`,
`clearModelCache()`. Transformers.js 4.3.2 and ONNX Runtime Web are vendored in `vendor/transformers/` (see its
README); WebGPU when the browser has an adapter, otherwise single-threaded WASM. A download that does not fit in the
browser's storage raises the app's "out of space" message. `loadPipeline` refuses to download without `consented`.

## Tests
`node --test test/` (`ai-lyrics.test.js`, `vendor.test.js`); browser check `v57_check.py` (model stubbed);
opt-in `v57_realmodel.py` downloads and runs the real model once.
