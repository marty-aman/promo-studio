# Basic Pitch + TensorFlow.js (vendored)

Turns a guitar or bass stem into notes **on this computer** (used by "Make a tab from this stem",
`js/ai/basicpitch.js`). Everything, the model included, is in this folder: nothing is downloaded and no
audio leaves the browser. Total about 2 MB.

| File | From | Licence |
|---|---|---|
| `inference.js`, `toMidi.js` | `@spotify/basic-pitch` **1.0.1** `esm/` | Apache-2.0 (`LICENSE`) |
| `model/model.json`, `model/group1-shard1of1.bin` | `@spotify/basic-pitch` **1.0.1** `model/` (the ICASSP 2022 model, 0.9 MB) | Apache-2.0 (`LICENSE`) |
| `tf.fesm.min.js` | `@tensorflow/tfjs` **3.21.0** `dist/tf.fesm.min.js` (the version range Basic Pitch asks for) | Apache-2.0 (header of the file; same text as `LICENSE`) |

Changes, so a browser can load the files without a bundler:

- `inference.js`: `from '@tensorflow/tfjs'` is rewritten to `from './tf.fesm.min.js'`.
- `toMidi.js`: `generateFileData()` (the only user of `@tonejs/midi`, which writes a MIDI file with Node's
  `Buffer`) and its import are removed. The app writes MIDI files itself (`js/midi.js`).
- All three: the trailing `//# sourceMappingURL=` comment is removed (the maps are not shipped).

Nothing else is edited. The model is the one in the npm package, byte for byte. SHA-256 values are
checked in `test/vendor.test.js`.

Running in Node (the unit tests): TensorFlow.js sees `process` and wants `require`, so the test puts
`createRequire` on `globalThis` first; the CPU backend then runs the real model.

To upgrade: replace the files, redo the three edits, update the hashes here and in the test, and run
`test/stemtab-model.test.js` (the real model on synthetic notes).
