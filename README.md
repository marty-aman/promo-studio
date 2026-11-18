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
- **How lyrics are shown:** one line at a time (with the animations above), or a whole-song display:
  - **Scrolling lyric sheet:** the current line is big and fills in word by word, the lines around it are
    dimmed, and the sheet glides to the next line.
  - **Kinetic poster:** each word slams in on its beat at its own size and angle, building a poster.
  - **3D word tunnel:** words fly at the camera out of a neon tunnel that pulses on the beat.

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
- **Templates tab:** 16 one-click song templates with live previews of your own footage. Each sets the
  lyric style, grade, effects, transitions, text and end card.
  - Song looks: Lyric spotlight, Hype teaser, Cinematic, Golden hour acoustic, Neon night, Retro VHS,
    Punk / rock, Minimal clean, Release countdown.
  - Band templates, which add layers from your Guitar Pro files: **Riff breakdown** (light-up guitar
    neck), **Bass cam** (bass neck plus an electric visualizer), **Full band** (guitar highway and the
    light-up drum kit), **Can you play this?** (vibrating strings). Other tab, drum and visualizer layers
    are hidden, not deleted. A card says when a template needs a Guitar Pro file with a guitar or bass track.
  - Lyric templates: **Lyric video** (scrolling sheet over blurred video), **Lyric poster** (kinetic
    words), **Neon tunnel** (3D word tunnel).
- **App layouts:** TikTok, Instagram Reels, YouTube Shorts, "works on all three" and full frame. A layout
  moves lyrics, text, logo, progress bar and the end card into that app's clear area; templates keep it.
- **Sounds tab:** 12 built-in effects generated in the browser (riser, impact, sub drop, whoosh, reverse
  cymbal, clap, record scratch, record stop, glitch, heartbeat, camera shutter, vinyl crackle), a direct
  [Freesound](https://freesound.org) search (free API key; CC0 or CC0 + CC BY, never non-commercial; filter
  by length and sort), and a keyless search of CC sounds through [Openverse](https://openverse.org).
- **My sound library:** add sound clips in bulk (pick many files, a whole folder, or drag files and folders
  in). They are stored in this browser (IndexedDB) and kept for every project. Search by name or folder,
  star favorites, rename, delete, and add to the timeline. Any Freesound, Openverse or built-in sound can be
  saved into it. The app asks the browser to protect the library from automatic clean-up; it stays on this
  device and is removed if you clear the site's data.
- **Per clip:** position X/Y (picture-in-picture over a blurred copy), zoom 0.2×–4×, custom start → end
  keyframes for zoom and X/Y, masks (circle, oval, rounded, square, arch, heart, star, diamond, hexagon,
  split-screen halves) with soft edge, border and outside fill, and color grading (12 looks plus exposure,
  contrast, saturation, temperature, tint, fade and shadow/highlight tints).
- Lyric horizontal position and a custom X/Y logo position.
- **Guitar tab layer:** upload a Guitar Pro file (.gp, .gp5, .gp4, .gp3, .gpx; MusicXML works too) and it
  scrolls over the video in time with the song. Repeats and tempo changes are followed. Choose
  the track, scrolling or bar-by-bar style, size, position, colors, and technique marks (PM, h, /, bends, ~).
  Sync it by putting any bar at the playhead, matching the song's detected BPM, or dragging the purple
  block on the timeline.

## Layers

The **Layers** panel holds a stack of layers above the main video. Add as many as you like, reorder
them, rename them, and show or hide each one with its eye (in the panel or on the timeline). Hidden
layers are left out of the preview and the export. The fixed rows (main video, text, lyrics, song,
extra audio, end card) have eyes too; hiding an audio row mutes it.

- **Video layers:** clips placed freely in time over the main video, with opacity and blend mode
  (screen for smoke or light-leak footage, multiply for textures). Quick framings: picture in picture,
  full frame, top or bottom half (split screen), circle. Each clip has the full clip inspector.
- **Guitar tab:** as many tab layers as you need, e.g. lead and rhythm guitar or bass. All styles work for
  4- and 5-string bass and 6- and 7-string guitar, and colour each string (bass E-A-D-G match guitar E-A-D-G).
  Pick one of four styles:
  - **Scrolling tab:** classic tab lines, scrolling or bar by bar.
  - **Fretboard highway:** notes with fret numbers fly down a lane per string to a strike line, with
    sustain tails, sparks, and the chord name (plus the next chord) on top.
  - **Light-up neck:** a real neck with frets and inlays that slides to the frets in use. Fingered notes
    glow, open strings ring, the next notes show as ghosts, with big chord names and a strip of what's next.
  - **Vibrating strings:** a frosted glass panel where fret numbers slide in to a hit line and each string
    shakes when it's played.

  Chord names (Em, G, C/G, E5, Am7…) are worked out from the notes.
- **Drum chart:** from a Guitar Pro drum track (kick, snare, hi-hat, toms, crash, ride) or detected
  from a drum stem audio file (kick, snare, hi-hat). Pick one of six styles from the style grid:
  - **Scrolling lanes**, a falling **highway**, or a **circle** that sweeps once per bar with hits on rings.
  - **Neon highway:** a 3D glowing road with gem notes, shockwaves and sparks at the strike line, and an
    optional combo counter.
  - **Light-up drum kit:** a drawn kit whose pieces glow, bounce and ripple when hit, with your band name
    on the kick drum and a strip of upcoming hits along the top.
  - **Glass lanes:** a frosted panel over your video with gradient capsules, trails and hit bursts.

  Choosing a style also moves the chart to a spot that suits it.
- **Visualizer:** reacts to any audio you give it: a stem (drums, bass, vocals…) or the song.
  Styles: water ripple (bends the picture on each hit), electricity, spectrum bars, circular spectrum,
  waveform, particles, glow pulse and speaker rings. Stems drive the visuals silently unless you switch
  their sound on. Analysis runs once per file, so preview and export match.

Old projects with a single guitar tab are moved into the layer list automatically.

## Inspiration page

The **Inspiration** button at the top of the left rail opens a page of short-form trends for alt-metal,
emocore and post-hardcore bands on TikTok and Instagram (researched November 17, 2026, with links to
the sources on each card). Each trend comes with on-screen hook text, steps and a **Build this**
button that sets up the edit from your song and clips: template, hook section, length and text.

The trends are "If you like ___, you'll like us", Wait for the breakdown, Cleans → screams contrast,
Learn the riff (with the tab layer), Live one take, 2006 emo released in 2026, Send this to your pit
friend, Make your sound reusable, The story behind the song, Rate this chorus 1–10 and Release countdown.

The page also has a posting playbook, a release-week plan dated from your release date, hashtag sets
of five and caption openers you can copy. Trends change weekly, so the page links to TikTok Creative
Center for what is rising today. The trend list lives in `js/inspiration.js`.

## Sharing

- **Share to an app:** after exporting, the system share sheet sends the video (and copies the caption)
  to Instagram, TikTok, YouTube or any other app. This works on phones and on desktops that can share
  files, and needs the site on https (e.g. GitHub Pages).
- **YouTube Shorts direct upload:** connect your channel with Google sign-in and upload from the Export tab.
  It runs fully in the browser. You need your own free OAuth client ID:
  1. In the [Google Cloud console](https://console.cloud.google.com/apis/library/youtube.googleapis.com),
     create a project and enable **YouTube Data API v3**.
  2. In **Google Auth Platform**, set an app name and your email under Branding, and add your Google
     account as a test user under Audience.
  3. Under **Clients**, create a **Web application** client and add the site's address as an authorized
     JavaScript origin (`http://localhost:8765` for local use, plus your GitHub Pages URL).
  4. Paste the client ID in Export → Share → YouTube Shorts and press **Connect YouTube**.

  The client ID is not a secret and is saved in your browser. The sign-in token is held in memory only
  and revoked when you disconnect. Uploads count against the project's daily YouTube API quota.
- **Instagram and TikTok:** direct posting needs a backend server plus an app approved by Meta or TikTok
  (TikTok keeps posts from unaudited apps private, and Instagram fetches the video from a public URL),
  so it is not built in. Use the share sheet instead.
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
| `js/templates.js` | App layouts and song templates |
| `js/sfx.js` | Built-in synthesized sound effects and Openverse sound search |
| `js/freesound.js` | Freesound API search |
| `js/soundlib.js` | Personal sound library stored in IndexedDB |
| `js/tab.js` | Guitar Pro tab parsing (via alphaTab), timing and drawing |
| `js/drums.js` | Drum chart: GP drum tracks, drum-stem hit detection, lanes / highway / circle drawing |
| `js/viz.js` | Audio visualizers: FFT analysis and the eight styles |
| `js/panel-layers.js` | Layers panel |
| `js/share.js` | Share sheet and YouTube upload |
| `vendor/alphatab/` | alphaTab 1.9.0 parser (MPL-2.0), loaded only when a tab is used |
| `js/engine.js` | Playback clock, media sync, Web Audio mix, export |
| `js/timeline.js` | Multi-track timeline UI |
| `js/panels.js` | Tool panels and inspector |
| `js/stock.js` | Pexels / Pixabay / Wikimedia search and download |
| `js/app.js` | Layout, wiring, shortcuts |
