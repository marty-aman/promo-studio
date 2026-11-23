# Find a moment (on-device footage search)

Type what you are looking for, such as "crowd jumping" or "close-up of guitar", and get the best moments across your
footage. Each result has a thumbnail, its time and **Add to video**. A small picture-and-words model (CLIP) does the
matching in your browser. Nothing is uploaded: the only network call is the one-time model download from
huggingface.co, made after you agree, and it carries no video, picture or search words.

## Where
**Video Studio → Video tab → Find a moment.** Choose which videos to search: all videos in the library, or one
song's raw footage and music video (from its Files tab in the Manager). The edit's own song is picked first when it
has footage. The example buttons run a search straight away.

## How it works
1. Each video is sampled once a second (at most 120 frames, spread evenly over a longer video). Each frame is drawn
   with a 224 px short side and turned into a 512-number picture vector by the model. A 160 px JPEG thumbnail, a
   sharpness value (variance of the Laplacian on a 96 px grey copy) and the brightness are kept with it.
2. The description becomes a text vector ("crowd jumping" is sent to the model as "a photo of crowd jumping").
   The cosine between the two says how well a frame matches. Scores are lightly smoothed over neighbouring frames,
   moments of one video closer than 4 s to a better one are dropped, and moments that match worse than the average
   frame are left out. You get up to 12 moments, best first, with a bar relative to the best one.
3. **Add to video** puts 4 s of that video on the end of the video track, starting 0.5 s before the moment (earlier
   when the file ends sooner). It is one undo step.
4. **Best frame** picks a frame for a thumbnail. Without words it takes the sharpest frame. With the last search's
   words, the match counts 65% and sharpness 35%. Very dark or blown-out frames lose up to 60% either way.
   **Save as PNG** grabs that frame at full size, and **Add to photos** keeps it in the library for the Photo Studio.
5. **Suggested edits** favour the last search's moments. The Suggested tab passes `extraScore(rec, from, to)` (0 to 1,
   the best match inside the stretch, scaled within that video) to `applyTake`. The hook is read by
   `js/suggest.js` from the blurry/shaky build (PR #47). Before that build is merged, the value is ignored.
   **Clear search** turns it off.

## Cache and missing files
- The vectors are stored per media id in IndexedDB (`pvm-ai-search`, stores `frames` and `meta`), so a video is
  looked at once. A second search, or the same search after a reload, embeds nothing new. The 60 most recently
  indexed videos are kept.
- The key is `mediaId | fingerprint | model | version`. The fingerprint is the file size plus an FNV-1a hash of its
  first and last 64 KB. A different file put under the same id (Replace missing files with another file) is looked
  at again. The same file put back keeps its frames.
- A missing file is not searched, and its stored frames are kept for when it comes back. The box shows the app's
  usual "Replace missing files" notice. A video that cannot be read is listed as left out, and the others are still
  searched.
- Cancel stops between frames. Videos already finished stay in the cache, and the one in progress is not stored.
- A full browser store shows the app's storage message. The index then works until you reload.

## Model
`onnx-community/TinyCLIP-ViT-8M-16-Text-3M-YFCC15M-ONNX`, `onnx/model_quantized.onnx` (q8), **23.2 MB**, plus about
0.7 MB of tokenizer files. MIT licence (Microsoft TinyCLIP, `wkcn/TinyCLIP-ViT-8M-16-Text-3M-YFCC15M`). One file holds
the picture and text halves, so each call gives the model a stand-in for the other half (a blank picture or a short
caption), the same way the zero-shot pipeline does.

It loads through the shared runtime (`js/ai/runtime.js`, `MODELS.tinyclip`) with the same consent check, download
progress, Cache Storage, storage-full message and test stub (`setPipelineForTesting('zero-shot-image-classification',
fake)`) as Auto-sync lyrics. No new vendored files.

Sizes compared (Hugging Face tree API, 2026-11-23):

| Model | Files | Size | Licence |
|---|---|---|---|
| **TinyCLIP ViT-8M/16 Text-3M (chosen)** | one q8 file | **23.2 MB** | MIT |
| TinyCLIP ViT-40M/32 Text-19M LAION | one q8 file | 81.7 MB | MIT upstream; the ONNX card names no licence |
| `Xenova/clip-vit-base-patch32` | vision q8 85.0 + text q8 61.5 | 146.5 MB | MIT |
| MobileCLIP (`Xenova/mobileclip_*`) | | | Apple's own licence: not used |

TinyCLIP 8M is much weaker than CLIP B/32 (about 41% against 63% zero-shot ImageNet in the TinyCLIP paper). Expect
broad things (crowd, stage lights, guitar, drums, faces) to work better than fine detail. To switch, add a `MODELS`
row for B/32 (`Xenova/clip-vit-base-patch32`, separate `vision_model` and `text_model` files, which need
`CLIPVisionModelWithProjection` and `CLIPTextModelWithProjection` instead of the combined call in
`js/ai/searchindex.js`). Then bump `CACHE_V`.

Measured once with the real model (`v63_realmodel.py`, headless Firefox, WASM, one thread): download and load plus
18 frames took about 9 s. Each query took about 0.1 s. Red, green and blue test scenes were found at the right times.
Real band footage was not tried.

## Files
`js/ai/clipsearch.js` (pure: sampling times, fingerprint, cache key, ranking, time mapping, stretch score, best
frame), `js/ai/searchindex.js` (sampling, model calls, IndexedDB, current search), `js/ai/panel-search.js` (the box),
one fold in `js/panels.js` (and `addClip` takes `{ from, len }`), the hook call in `js/panel-suggest.js`, the
`MODELS.tinyclip` row and `runtimeLibrary()` in `js/ai/runtime.js`, and CSS under `/* == ai-search == */`.

## Tests
`node --test test/` (`test/ai-search.test.js`). Browser check `v63_check.py`, with the model stubbed as a mean-colour
vector. Opt-in `v63_realmodel.py` downloads and runs the real model once.
