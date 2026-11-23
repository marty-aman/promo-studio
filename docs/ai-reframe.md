# Auto-reframe

Auto-reframe keeps the main person in the picture when wide footage (16:9) is cropped into a narrower
format: 9:16 Reels / TikTok / Shorts, the Spotify Canvas, 4:5 or 1:1. It runs entirely in the browser.
The models are vendored in `vendor/mediapipe/`, and no frame leaves the device.

## Using it

Select a video clip. The clip settings have an **Auto-reframe** section with:

- **How tight**. *Follow loosely* keeps the clip at 1× and only moves the crop. A wide dead zone stops
  small moves from shaking the picture. *Follow closely* zooms in so the person (head and shoulders,
  for a face) fills about 60% of the height, and it follows more closely.
- **When there are several people**: *Largest person* or *Most central person*. Once the person is
  picked, the same person is followed, so two people walking past each other do not swap.
- **Auto-reframe this clip**. The status line counts the frames as they are checked, and **Cancel**
  stops the run without changing anything.
- **Reframe every clip (n)** appears when the format is narrower than 16:9 and the video track has
  more than one video clip. It reframes all the main-track video clips in one undo step.

When no person is found in at least 10% of the checked frames, the clip is left as it was and the status
line says so. Without WebGL, the status line says the person finder needs it, and nothing changes.

## What it writes

The clip's own keyframes: `panX` (and `panY` when the crop has room to move up and down), plus a single
`zoom` keyframe for *Follow closely*. Keyframes for other properties, such as opacity, are kept. Earlier
`zoom` / `panX` / `panY` keyframes on the clip are replaced. The clip is set to **Fill**, and any
**Motion** preset is turned off, because both would move the picture away from the person. Undo,
the Keyframes list, the timeline diamonds and export all work as they do for hand-made keyframes.
"Pan inside X / Y" can now be keyframed by hand too, with the ◆ next to each slider in **Frame**.

## How it works (`js/reframe.js`)

1. **Sampling.** It checks 5 frames per second of the source the clip actually plays, capped at 240
   frames. The samples follow the clip's in-point and speed, so a 2× clip covers twice the source per
   second. The keyframe times are in clip time.
2. **Finding the person.** Each frame is drawn at 640 px on its long side. It is checked with
   BlazeFace short-range (`blaze_face_short_range.tflite`, 0.2 MB). When no face is found, EfficientDet-Lite0
   (`efficientdet_lite0.tflite`, 4.6 MB, `person` class only) is used, aiming at the top of the box.
   When that cannot load, the centre of the selfie segmenter mask is used (the model Remove background
   already uses). The loader is a copy of `bgremove.js`'s: the vendored tasks-vision 1.2.3 bundle,
   with its metrics patch, on GPU and then CPU.
3. **Steadying.** Gaps are filled with straight lines. Then a dead zone is applied (16% of the
   visible width when loose, 7% when close), followed by a One-Euro filter run forwards and then
   backwards, so the crop does not lag behind. Finally the window is moved the least amount that keeps
   the person's box inside it, and it is clamped so no edge of the picture shows.
4. **Keyframes.** The path is reduced with Ramer-Douglas-Peucker (pan tolerance 0.004) and written
   as linear keyframes.

## Limits

- It does not account for **Rotate**. A mirrored clip is handled.
- It uses the main video track only. Overlay video layers are left alone.
- BlazeFace short-range is trained for faces within about 2 m. A small singer on a far stage falls
  through to the person box, which aims at the top fifth of the body.
- It needs WebGL, like Remove background.
