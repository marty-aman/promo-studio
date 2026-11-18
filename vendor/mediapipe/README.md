# MediaPipe Tasks Vision (vendored, modified)

Used for **Remove background → Person (AI)**. It runs fully in the browser: video frames never leave
the device. Loaded lazily, the first time someone turns person background removal on.

| File | Source | SHA-256 |
|---|---|---|
| `vision_bundle.mjs` | [@mediapipe/tasks-vision](https://www.npmjs.com/package/@mediapipe/tasks-vision) 1.2.3, **modified** (see below) | `4a9eb2e609c096c916e14afd6c1ecf00aba1224e6c3ff386a4e90314b657a04f` |
| `wasm/vision_wasm_internal.js` | same package, unmodified | `2aa5fd3fdd3d8208cd7587df0bb19fb6925c4ea16a76dd025aedc1f64d6a6309` |
| `wasm/vision_wasm_internal.wasm` | same package, unmodified | `225bc06c0f51a9cf31fea0e9e0b0243e9e01fb5ef332cc1a7fa6656dbdfdaabf` |
| `selfie_segmenter.tflite` | [MediaPipe selfie segmenter](https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter#selfie-model) (float16), from `storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/` | `191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b` |

The package and the model are licensed under the Apache License 2.0 (see `LICENSE`).
Original `vision_bundle.mjs` SHA-256: `fb0c02c296f44ce0cc324ba16bd646d8773eb4a7847db4019cc4d0430db7a9b5`.

## Modification

MediaPipe Tasks normally sends usage and performance metrics to Google
(`https://odml.pa.googleapis.com/v1/log`, every 60 s). Its privacy notice makes the app responsible for
getting users' consent for that. Promo Studio does not send it: the metrics logger's `flush()` in
`vision_bundle.mjs` was changed to discard its queue without any network request (search for
`promo-studio patch`). The trailing `sourceMappingURL` comment was also removed because the map is not
shipped. Nothing else was changed. `test/vendor.test.js` checks the patch is in place.
