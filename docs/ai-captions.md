# Captions from speech (on-device)

Writes what is said in a clip as captions, timed to the words, on the Text row. It uses the same Whisper model
and the same shared runtime as lyric auto-sync (`js/ai/runtime.js`), so the model is downloaded once for both.
Nothing is uploaded: the only network call is the one-time model download from huggingface.co, made after you agree.

## Where
Video Studio: select a **video clip** (main lane or an overlay layer) or an **audio track** on the timeline, then
**Inspector → Captions → Captions from speech**.

## How it works
1. Pick a language, or leave it on **Detect it** (speech, unlike a screamed vocal, is fine to detect). The choice is remembered.
2. The first time, it asks before downloading (about 77 MB) and says nothing but the model is fetched.
3. The clip's own file is decoded to 16 kHz mono and cut to what plays: **from the clip's in-point, for its length at
   its speed** (`captionsync.clipTarget`, `windowSamples`). Pieces under 28 s are cut at the quietest gap; silent
   pieces are never sent to the model.
4. The heard words are cut into caption lines (`buildCues`): a new line at a pause over 0.7 s, after a sentence end
   (once the line has 3 words), and at 34 characters, 7 words or 4 s.
5. Times are moved to the timeline (`toTimeline`): `clip start + speech time / speed`. A 2x clip gets captions twice
   as fast; words after the clip's end are dropped and the last line is cut there.
6. They are added as normal captions (`caption: true`, your current caption style, including **Word by word**, which
   follows the real word times). They sit on the Text row where you can drag and edit them, are burned into the
   export and appear in the .srt/.vtt files.
7. If captions already sit under the clip, you choose **Replace those N** (only the captions overlapping the clip are
   removed) or **Add alongside**, or throw the new ones away.

Cancel works at any time and changes nothing. A run is one undo step. Typed lyrics and other texts are never touched.

## Limits
- The whole file is decoded in memory before it is cut (16 kHz mono floats, about 4 MB a minute). Very long files are slow on WASM.
- Whisper may invent words over music or noise; only silent pieces are skipped. Check the captions.
- One speaker's words are not told apart from another's.
- Without WebGPU (Firefox on Linux) it runs on one WASM thread.
- A video with no readable sound says so and changes nothing.

## Tests
`node --test test/ai-captions.test.js` (cue building, offset by in-point and speed, chunking, replace/add, privacy grep);
browser check `v62_check.py` with the model stubbed (`setPipelineForTesting`).
