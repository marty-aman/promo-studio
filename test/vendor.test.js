import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../vendor/mediapipe/${p}`, import.meta.url), 'utf8');

test('vendored MediaPipe never sends usage metrics', () => {
  const js = read('vision_bundle.mjs');
  // the logger's flush() discards its queue before it can reach the network call
  assert.ok(js.includes('flush(t,e){/* promo-studio patch: usage metrics are never sent */this.i=[];t?.();return;'), 'patch present');
  assert.equal(js.split('promo-studio patch').length - 1, 1);
  assert.ok(!js.includes('sourceMappingURL'), 'no dangling source map');
  // the WASM loader has no network endpoints of its own
  assert.ok(!/googleapis\.com/.test(read('wasm/vision_wasm_internal.js')));
  assert.match(read('LICENSE'), /Apache License\s+Version 2\.0/);
  assert.match(read('README.md'), /promo-studio patch/);
  assert.ok(statSync(new URL('../vendor/mediapipe/selfie_segmenter.tflite', import.meta.url)).size > 200_000);
});

// ---- Transformers.js + ONNX Runtime Web (vendor/transformers, unmodified), used by js/ai/runtime.js
import { createHash } from 'node:crypto';

const TF = {
  'transformers.web.min.js': 'ab20188dcf6702d0bd754f441eb497a3517777b01da61a6a0285cfa20723e14b', // patched (see vendor/transformers/README.md): ORT imports, one identifier split
  'ort.webgpu.bundle.min.mjs': '7c93a51e9906b246af505bbfbfa4e5806ebe70a081ab0ca0d34e1180293f4f8d',
  'ort-wasm-simd-threaded.asyncify.mjs': '0966b6105cd936744498aa60df7a22cbd47af3374dbc64a9ab561c08a71e3611',
  'ort-wasm-simd-threaded.asyncify.wasm': '49871f5a4409519797e127440868a6d1923339d9185907f301a5b2a1d90af082',
  LICENSE: 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30',
};

test('vendored Transformers.js and ONNX Runtime match their recorded SHA-256', () => {
  for (const [file, sha] of Object.entries(TF)) {
    const got = createHash('sha256').update(readFileSync(new URL(`../vendor/transformers/${file}`, import.meta.url))).digest('hex');
    assert.equal(got, sha, file);
  }
  assert.match(readFileSync(new URL('../vendor/transformers/README.md', import.meta.url), 'utf8'), /4\.3\.2/);
});

test('vendored Transformers.js sends no usage data, and the runtime never uses the CDN', () => {
  const lib = readFileSync(new URL('../vendor/transformers/transformers.web.min.js', import.meta.url), 'utf8');
  const ort = readFileSync(new URL('../vendor/transformers/ort-wasm-simd-threaded.asyncify.mjs', import.meta.url), 'utf8');
  assert.equal(lib.split('./ort.webgpu.bundle.min.mjs').length - 1, 2, 'both ORT imports point at the vendored bundle');
  assert.ok(!/from"onnxruntime/.test(lib), 'no bare specifier left');
  for (const src of [lib, ort]) {
    assert.ok(!/googleapis|google-analytics|sendBeacon|telemetry|sentry/i.test(src));
    assert.ok(!/sourceMappingURL/.test(src), 'no dangling source map');
  }
  // the only remote hosts in the library: Hugging Face (model files) and, as a default we override, jsDelivr
  const hosts = new Set([...lib.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1]));
  const allowed = ['huggingface.co', 'cdn.jsdelivr.net', 'developer.mozilla.org', 'github.com', 'gist.github.com'];
  for (const h of hosts) assert.ok(allowed.some((a) => h === a || h.endsWith(`.${a}`)), `unexpected host ${h}`);
  const rt = readFileSync(new URL('../js/ai/runtime.js', import.meta.url), 'utf8');
  assert.match(rt, /wasmPaths = \{ mjs: `\$\{VENDOR_BASE\}/); // jsDelivr is only the library's default, never reached
  assert.ok(!/jsdelivr|unpkg|cdnjs/i.test(rt));
});

// ---- Basic Pitch + TensorFlow.js (vendor/basic-pitch), used by js/ai/basicpitch.js (edits listed in its README)
const BP = {
  'inference.js': 'add4c17c26e165e82e962543e7c2b783b1b789b8db0ab6f559b1f3ea1825caf9',
  'toMidi.js': '8f543a395438c2baca01ede557d466e3bb82f3f249af68ca67ad98a140513f1f',
  'tf.fesm.min.js': 'f713b1031e09ba5613265388d7c063a366053a0ddfcb3c957ca19cfbb962cd38',
  'model/model.json': '1ed1aaee3409ec1dc098c8b01f430c0911f6fe9412e7af8086750f9e8f302f68',
  'model/group1-shard1of1.bin': 'b142a95737a52e1e412d5f92e73d8bb80dfe8d04941acc0702f11f4524fb377c',
};

test('vendored Basic Pitch matches its recorded SHA-256, has its licence, and loads nothing from the network', () => {
  for (const [file, sha] of Object.entries(BP)) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(`../vendor/basic-pitch/${file}`, import.meta.url))).digest('hex'), sha, file);
  }
  assert.match(readFileSync(new URL('../vendor/basic-pitch/LICENSE', import.meta.url), 'utf8'), /Apache License\s+Version 2\.0/);
  assert.ok(!/tonejs/.test(readFileSync(new URL('../vendor/basic-pitch/toMidi.js', import.meta.url), 'utf8')));
});

// ---- mp4-muxer 5.2.2 and webm-muxer 5.1.4 (MIT, unmodified ESM builds), used by js/fastexport.js
const MUX = {
  'mp4-muxer/mp4-muxer.mjs': 'd2c4c782f180c86ed30b1f5d9487a34a0d370bf9b4535285734ea187d38f9bb5',
  'mp4-muxer/LICENSE': '75c54aae7ef6ad652f684f9dd3b71e4dcef86ccebd88cf441ceed7f5eec037c5',
  'webm-muxer/webm-muxer.mjs': '53710543cecc4db7b6cd23fb0d9b308aa3374697f43a6149a8497f0a8547f0cb',
  'webm-muxer/LICENSE': '1619f937fa43f768d38d2bfb35d228258e0dffe1f71c4202b338df20e68ff680',
};

test('vendored muxers match their recorded SHA-256, are MIT and never reach the network', () => {
  for (const [file, sha] of Object.entries(MUX)) {
    const buf = readFileSync(new URL(`../vendor/${file}`, import.meta.url));
    assert.equal(createHash('sha256').update(buf).digest('hex'), sha, file);
    if (file.endsWith('LICENSE')) assert.match(buf.toString(), /^MIT License/);
    else assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|import\(/.test(buf.toString()), `${file} makes no requests`);
  }
  const fx = readFileSync(new URL('../js/fastexport.js', import.meta.url), 'utf8');
  assert.match(fx, /import\('\.\.\/vendor\/mp4-muxer\/mp4-muxer\.mjs'\)/);
  assert.match(fx, /import\('\.\.\/vendor\/webm-muxer\/webm-muxer\.mjs'\)/);
});

// ---- mp4box 2.6.0 (BSD-3-Clause), used by js/framesource.js to read MP4/MOV clips; only the two
// "//# sourceMappingURL=" lines were removed (no maps are shipped)
const MP4BOX = {
  'mp4box.all.mjs': '5afbeac9e044c12cde51b865b590057a20e90f14d9fac63b4e282f2597fab809',
  'styp-BbiO7KT1.mjs': '18b227f5c17eb5e189883216dc05046412df9a8652e79bf0bee3617a8ea648c4',
  'rolldown-runtime-CNh9ExCG.mjs': 'be065d52a250755063b5b89dfa6786ad988b57ba020cb91c415afd1b15fdf635',
  LICENSE: 'ebad0332150a08f37389158289d93ab2f70b0ee8717d1db9b3d002febc6c5047',
};

test('vendored mp4box matches its recorded SHA-256 and makes no requests', () => {
  for (const [file, sha] of Object.entries(MP4BOX)) {
    const buf = readFileSync(new URL(`../vendor/mp4box/${file}`, import.meta.url));
    assert.equal(createHash('sha256').update(buf).digest('hex'), sha, file);
    if (file === 'LICENSE') assert.match(buf.toString(), /Redistribution and use in source and binary forms/);
    else assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|sourceMappingURL/.test(buf.toString()), file);
  }
});
