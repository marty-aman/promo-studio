# Frame quality and best moments

No model, no network, nothing to download. Everything runs in the browser on a few small grey pictures.

## What is measured

For each video, about every 0.75 s (at most 90 samples), the app grabs three frames 0.07 s apart, shrinks them to 96 px wide and measures:

| Measure | How | Flag |
|---|---|---|
| Sharpness | variance of the Laplacian of the grey frame | **Blurry** when under 20, or under 30% of the clip's own 90th percentile |
| Shake | global shift between the frames (block matching, ±6 px); the flag uses how much the shift *changes* between the two steps, so a steady pan is not shake | **Shaky** when over 2.2% of the frame width |
| Exposure | mean brightness and share of clipped white pixels | **Dark** under 40, **Overexposed** over 215 or over 35% clipped |
| Motion | size of the shift (a little credit for some movement) | none |

A black frame is called Dark, not Blurry. Photos are not analysed.

Each sample gets a 0..1 score (sharp × steady × well exposed, with a small motion bonus). A stretch's score is the mean of its samples, reduced when part of it is flagged.

## Where it shows

- **Media tab and a song's Files tab (raw footage):** badges on the thumbnail and a **Hide weak takes** checkbox. A take is hidden when more than half of it is flagged.
- **Timeline:** coloured strips along the bottom of a clip block for the weak stretches inside the part of the file that clip plays (trim and speed are taken into account), plus flag chips.
- **Clip settings → Take quality:** the whole file as a strip with weak stretches and the clip's own part marked, a list of the stretches, and **Start from the best moment**, which moves the clip's start to the best stretch of the file.
- **Suggested tab and the "Raw footage + lyrics" song template:** `applyTake` in `js/suggest.js` now starts every cut at the best stretch of its clip (`bestStart`), avoids reusing the same stretch, and leaves out a video that is more than 75% flagged while any other clip is left. Cut lengths still come from `beatCutPlan`, so the cuts stay on the beat. The card's "why" list says when it did this.

Analysis starts when a badge, the clip settings or the Suggested tab first needs it, one clip at a time, and only awaits seeks, so the editor stays responsive. A song template applied before the footage has been looked at uses the old first-free-spot start (open the Files tab first, or use the Suggested tab, to start it).

## Cache

Results are kept in `localStorage` under `pvm.frameQuality.v1`, by media id and file size, for the 40 most recent clips (about 2 to 3 KB each). A different file with the same id is re-analysed. The filter choice is `pvm.hideWeakTakes`.

## Hook for another score

`applyTake(d, take, { inv, extraScore })` (or `inv.extraScore`) accepts `extraScore(rec, from, to) -> 0..1`, with `from` and `to` in seconds into the file. It counts for a third of a stretch's score, for example for a text-search match. `scoreRange(q, from, to, extra)` and `bestStart(q, len, duration, used, extra)` in `js/framequality.js` take the same function.

## Files

`js/framequality.js` (maths, sampling, cache), `js/panel-quality.js` (badges, timeline marks, clip settings section, filter), `js/suggest.js` (ranking), `test/framequality.test.js`.

## Limits

- Thresholds were tuned on synthetic footage (noise-like scenes, a blur filter, random offsets). Real phone footage with a plain wall or night shots may need tuning.
- Shake is judged from three frames per sample, so a slow wobble between samples is not seen.
- A sample covers a 0.75 s window, so flags have that much edge fuzz.
