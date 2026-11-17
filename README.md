# Promo Studio

A browser-based editor for short promo videos for new song releases (Reels, TikTok, Shorts).
Everything runs in your browser. Your files are not uploaded anywhere; projects and media are
saved in the browser (localStorage + IndexedDB) and restored when you come back.

## Run it

```bash
npm start            # serves on http://127.0.0.1:8765/ (loopback only)
PORT=9000 npm start  # different port
```

No `npm install` is needed: there are no dependencies. Use a recent Chrome or Edge for MP4 export
(Firefox exports WebM). Since the app is plain static files, it can also be hosted on Netlify or
any other static host.

## Features

**Video**
- Upload videos and images, or drag files anywhere onto the window.
- Free stock footage search: Pexels and Pixabay (free API key, stored only in your browser) and
  Wikimedia Commons (no key). Hover to preview; credits are collected for your post caption.
- Sequential video track: reorder by dragging, trim either edge, split at the playhead (S),
  duplicate, delete.
- Per clip: speed (0.25×–4×), fill / fit / fit with blurred background, zoom, pan, rotate, mirror,
  slow zoom or drift motion, color presets (Mono, Noir, Warm, Cold, Vivid, Faded, Dream) plus
  brightness/contrast/saturation/blur.
- 24 transitions: crossfade, fade/dip to black or white, flash, blur dissolve, zoom punch / out / through,
  spin, push left/up, slide over, whip pan, wipes, split open, circle reveal, pixelate, glitch, RGB split,
  shake, light leak. Apply one to every cut, or mix them randomly.
- Clip effects: zoom pulse, strobe and invert on the beat, camera shake, RGB split, flicker, VHS tape,
  mirror / kaleidoscope.
- Formats: 9:16, 4:5, 1:1, 16:9.

**Lyrics**
- Paste lyrics, then **tap-sync**: press Space as each line starts (and `.` to end a line early).
- Fine-tune by dragging or resizing lyric blocks on the timeline, editing times in the list, or
  "start/end at playhead". Shift all lines by ±0.1/0.5 s.
- Import/export `.lrc` files.
- Lyric times are stored in *song time*, so choosing a different section of the song keeps them in sync.
- Styles: 10 fonts (or upload your own), size, position, width, alignment, colors, outline, shadow,
  background box, ALL CAPS, per-line height override. 17 animations including pop, words rise,
  drop & bounce, zoom, blur, spin, flip, typewriter, karaoke, word by word, wave, neon flicker, glitch
  and pulse on the beat. One-click presets.

**Audio**
- Song with waveform. Drag it on the timeline or click the overview to choose the section.
- **Find the hook** picks the loudest 15/30/45/60 s (usually the chorus) and sets the video length.
- **Detect BPM** adds beat markers; timeline items snap to beats.
- **Auto-edit to the beat** builds a video track that cuts on every 1/2/4/8 beats.
- Extra audio tracks (voice-over, SFX) with volume and fades; per-clip sound (muted by default).

**End card / call to action**
- Cover art with blurred-cover, color or dimmed-video background, title, artist, CTA pill,
  streaming platform badges, small text. Entrances: rise, zoom, spin, drop & bounce, card flip,
  vinyl slides out, glitch.
- CTA tokens: `{date}` → "NOV 21", `{countdown}` → "OUT IN 3 DAYS" / "OUT TOMORROW" / "OUT NOW".

**Extras**
- Text overlays with presets (NEW SINGLE, PRE-SAVE NOW, …).
- Logo watermark, progress bar, vignette, film grain, cinema bars, light leaks, scanlines, flash on the beat.
- Phone app preview: phantom TikTok, Instagram Reels or YouTube Shorts buttons, caption and nav bar
  over the 9:16 preview, plus a "clear area" guide for text. Switch it from the bar under the preview
  or press O. Preview only, never exported.
- Style templates to reuse a look on the next release.
- Undo/redo, autosave, keyboard shortcuts, PNG frame export, generated post caption with credits.

## Export

Export plays the project once in real time onto a full-resolution canvas while the browser records
it (MediaRecorder), so a 20 s video takes about 20 s. Keep the tab in front while it runs.

## Tests

```bash
npm test   # unit tests for timing, LRC, tap-sync, hook/beat detection, beat-cut plans
```

## Code layout

| File | Purpose |
|---|---|
| `js/core.js` | Pure logic: time math, lyrics/LRC, tap-sync, audio analysis (unit tested) |
| `js/state.js` | Project model, undo/redo store, persistence |
| `js/media.js` | Media library, element creation, waveform/energy analysis |
| `js/renderer.js` | Draws a frame (video, transitions, effects, text, lyrics, end card) to a canvas |
| `js/overlays.js` | Phantom TikTok / Reels / Shorts UI for the preview |
| `js/engine.js` | Playback clock, media sync, Web Audio mix, export |
| `js/timeline.js` | Multi-track timeline UI |
| `js/panels.js` | Tool panels and inspector |
| `js/stock.js` | Pexels / Pixabay / Wikimedia search and download |
| `js/app.js` | Layout, wiring, shortcuts |
