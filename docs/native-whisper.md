# Faster speech in the Mac app (whisper.cpp)

Lyric sync and speech captions normally run the speech model inside the app (Transformers.js, WebGPU or WASM). In the
Mac app they can run on [whisper.cpp](https://github.com/ggml-org/whisper.cpp) instead. This is optional and off by
default. The app's own model stays the default and the fallback.

## What the app does

- Settings: Manager home, Storage, "Faster speech (whisper.cpp)". The switch is usable once the program and a model are in place.
- When it is on, `js/ai/runtime.js` hands lyric sync and captions a pipe backed by whisper.cpp
  (`js/ai/nativewhisper.js`). `lyricsync.js` and `captionsync.js` are unchanged: the adapter returns the same
  `{ chunks: [{ text, timestamp: [start, end] }] }` shape as the browser model, built from whisper.cpp's JSON.
- If whisper.cpp fails during a run, that run (and the rest of the session) uses the browser model, but only if
  the browser model is already downloaded. Otherwise the error says what to do. Nothing is downloaded without asking.
- Word times come from whisper.cpp's DTW alignment (`--dtw base` or `small`, with `-nfa`). If that build cannot do
  DTW, the run repeats without it and uses the rougher per-token times.

## Where things live

| What | Where (macOS) |
|---|---|
| The program | `~/Library/Application Support/Promo Studio/bin/whisper` (never inside the app bundle or the zip) |
| Models | `~/Library/Application Support/Promo Studio/models/ggml-base.bin`, `ggml-small.bin` |

The Storage meter counts the models folder under "AI models and caches".

## Getting the program

Build whisper.cpp once on the Mac (Xcode command line tools and CMake needed), as one self-contained file:

```
git clone https://github.com/ggml-org/whisper.cpp && cd whisper.cpp
cmake -B build -DBUILD_SHARED_LIBS=OFF -DGGML_METAL_EMBED_LIBRARY=ON
cmake --build build -j --config Release --target whisper-cli
cp build/bin/whisper-cli "$HOME/Library/Application Support/Promo Studio/bin/whisper"
chmod +x "$HOME/Library/Application Support/Promo Studio/bin/whisper"
```

"Open the tools folder" in the Storage panel opens the `bin` folder. Models are downloaded from the same panel
("Download…" asks first). Each download is checked against a fixed size and sha256 and deleted if it does not match:

| Model | Size | sha256 |
|---|---|---|
| ggml-base.bin | 147951465 bytes | `60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe` |
| ggml-small.bin | 487601967 bytes | `1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b` |

The hashes are from the Hugging Face file pages (`ggerganov/whisper.cpp`); the base file was also downloaded and
hashed. If the upstream file ever changes, the download fails with a checksum message and `electron/native.cjs`
needs the new values.

## Safety

- `window.desktop.native.run(name, args, { input })` only starts `whisper`, only from `userData/bin`, with
  `--model base|small`, `--language`, `--threads` and nothing else. The page never gives a path or a command line,
  and the audio goes in as WAV bytes into a private temp folder that is removed afterwards.
- A model download needs `consent: true` from the page and the person's OK in the panel.
- The child process gets only `PATH` in its environment and is killed when the app quits or after 20 minutes.

## Not tested on Linux

Metal (the Mac build flag and speed), DTW together with Metal (whisper.cpp does the DTW step on the CPU; if it fails
on a Mac the run repeats without it), quarantine on a program that was downloaded instead of built, Apple Silicon
thread counts. The Mac self-check's "Speech model timing" block lists whisper.cpp next to the browser settings so one
run on the Mac gives the numbers.
