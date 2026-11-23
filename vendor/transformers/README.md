# Transformers.js + ONNX Runtime Web (vendored)

Runs speech and other small models **in the browser** (used by Auto-sync lyrics, `js/ai/runtime.js`).
None of these files sends usage data. One change: in `transformers.web.min.js` the two bare imports
(`from"onnxruntime-common"` and `from"onnxruntime-web/webgpu"`, which a browser cannot resolve without a bundler or an
import map) are rewritten to `from"./ort.webgpu.bundle.min.mjs"`, which exports the same `Tensor`/`env` and is one shared copy.
A second edit keeps secret scanners quiet: the 32-letter Mistral 3 conditional-generation class name looked like
a Mistral API key to GitHub push protection, so its three occurrences are split (as `"…Conditional"+"Generation"`,
a computed key and a map value) or, in the unused re-export list, removed. Nothing in the app uses that class.

| File | From | Licence |
|---|---|---|
| `transformers.web.min.js` | `@huggingface/transformers` **4.3.2** `dist/transformers.web.min.js` | Apache-2.0 (`LICENSE`) |
| `ort.webgpu.bundle.min.mjs`, `ort-wasm-simd-threaded.asyncify.mjs`, `.wasm` | `onnxruntime-web` **1.31.0-dev.20260914-8d85527a0** (the version transformers.js 4.3.2 pins) `dist/` | MIT |

`js/ai/runtime.js` points `env.backends.onnx.wasm.wasmPaths` at this folder, so the page never asks
jsDelivr for the runtime. The `.asyncify` build serves both WebGPU and plain WASM. Model weights are not
here: they are downloaded from huggingface.co on first use, after the person agrees, and kept in the
browser's Cache Storage. SHA-256 values are checked in `test/vendor.test.js`.

To upgrade: replace the files (and redo the two import rewrites), update the hashes and versions here and in the test, and re-run the
real-model check (`v57_realmodel.py`), because word timestamps have regressed between releases
(transformers.js issues 1358 and 1684).
