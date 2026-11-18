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
- **A look per line:** select a lyric line and pick a look for just that line: **Scream** (huge, glitchy
  capitals in the accent colour), **Breakdown** (the biggest text, pulsing on the beat), **Gang vocals**
  (boxed capitals that drop in word by word), **Clean vocal** (karaoke fill), **Whisper** (small, soft
  serif) or **Spoken word** (typewriter on a dark strip), or keep it the same as the others. You can then change that line's font, colours,
  outline, box, size, case and animation. Presets take their colours from the theme if one is set.
  "Use on the other lines with these words" styles every repeat of a line (a chorus) at once, and
  "Copy look to the next line" carries it forward. Styled lines show a ✦ on the timeline. In the lyric
  sheet, poster and tunnel, a line keeps its own font, colours and case.

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
- **Carousel page:** Instagram carousel posts built from your cover art, photos, frames from your clips,
  stills from the edit itself (with lyrics and tab) and your release info.
  - Suggested carousels: release announcement, lyric reveal, behind the song, photo dump, rate the
    frames, and learn the riff when the edit has a tab. Each follows the 2026 research: slide 1 earns the
    swipe, each slide pays off one idea, the last asks for one thing, 5–10 slides.
  - Edit any slide: its picture (with the exact moment for clip frames), layout, text, and 11 looks with
    a preview of that slide in each: flash, film, grit, noir, neon, cinematic, VHS, dreamy, duotone in
    your cover colours, and polaroid. Each look says what it does for a post.
  - Reorder, duplicate or delete slides, with up to 20 per post.
  - Suggested captions written for carousels.
  - Downloads all 1080×1350 slides and the caption as one .zip, or shares them to the app from a phone.
- **Tab Studio** (its own page, also opened from a tab layer's “Edit in Tab Studio”): open any Guitar Pro
  file from your media, or start a new tab. All tracks (guitar, bass, 7-string, 5-string, drums) are
  stacked and scroll together.
  - Keyboard editing: arrows move, digits type frets (two quickly for 10–24), + / − change length,
    `.` dots, R rests, I inserts a beat. Techniques: H hammer-on, S slide, B bend, V vibrato, P palm mute,
    X dead note, G ghost.
  - Drum rows you click or press Enter on, tunings (drop D, drop C, 7-string, 5-string bass…), tempo
    changes, time signatures, add and delete bars, undo, and playback with a simple synth.
  - Save writes a new Guitar Pro 7 file into your media. “Save & use in video” also points the video's
    tab and drum layers at it.
- **Tab from stems** (in Tab Studio): upload an isolated stem and pick the part.
  - Bass lines and lead riffs are pitch-tracked note by note and placed on strings and frets that keep
    the hand in one position.
  - Rhythm guitar becomes power-chord shapes with the chord names (E5, G, Am…).
  - Drums give kick, snare and hi-hat.
  - Everything is lined up with the song's tempo, or the stem's own, with the stem's waveform under the
    track so you can check it by eye and fix it by ear.
- **Posting playbook buttons** (Inspiration page): every rule has an Apply button. Put the hook first,
  make it 12 seconds, add a “send this to…” share ask, add “use this sound”, and use a raw real-phone look
  change the edit directly. The rest open tools on the page:
  - **Batch export:** several promos from the loudest non-overlapping sections of the song, downloaded as
    one .zip.
  - **Split a music video:** its strongest moments, each as its own short, with the song in sync.
  - **Posting calendar:** 3–5 posts a week for 4–6 weeks, downloaded as an .ics file for Google, Apple or
    Outlook calendar.
  - **Caption writer:** opens the caption suggestions.
- **Hook openers:** ideas for the first second, grouped as things you film yourselves (staged fall onto a
  mat, the outrageous one-liner, the soft fake-out, the wrong-instrument breakdown…), licensed stock
  searches, and TikTok's own Stitch and reply tools. “Add as intro” sets the on-screen line, a sound effect
  and a punchy first cut, optionally with one of your clips first. Reposting other people's clips isn't
  offered, because it gets reels muted or taken down.
- **Suggested captions** (Export tab, Inspiration page and carousel tool): written from the edit (song,
  look, hook lyric, release date, tab layers, your city and similar bands) in the formats the 2026 research
  found work: a 3–7 word hook first, searchable plain words, one specific ask (sends to a friend count most
  on Instagram) and at most 5 hashtags, with TikTok versions under 150 characters. Sources are linked in
  the app.
- **From Spotify** (End card tab): paste a track or album link to fill in the title, cover art and a
  “Listen on Spotify” link for your bio. Spotify doesn't let other apps download songs, so the audio
  still comes from your own file.
- **Suggested tab:** add a song and some clips (plus a Guitar Pro file or lyrics if you have them) and it
  builds three different ready-to-post edits. Each one picks the hook, cuts your clips on the beat, applies
  a fitting template, lines tab and drum layers up with the song's first beat and tempo (layers you synced
  yourself are kept), and puts cut-outs in front of a matching background. Every card has a preview that
  plays with the song and a short list of what it does. "Use this edit" applies it (undo works), and
  "Show 3 different takes" gives new ideas. A dot on the rail means new suggestions are ready.
- **Remove background** (clip inspector, video and image clips):
  - **Person (AI):** finds people with Google's MediaPipe selfie segmenter, vendored in
    `vendor/mediapipe` and running only in your browser (frames never leave the device; its usage metrics
    are patched out, see `vendor/mediapipe/README.md`). Each clip is prepared once, then preview and export
    use the stored cut-out. It needs WebGL, so it says so when a browser has it turned off. Edge
    (shrink/grow) and softness controls.
  - **Green screen:** chroma key for green or blue screens, including shadowed parts, with screen colour,
    amount and softness.
  - **Suggested backgrounds:** animated scenes drawn by the app (smoke, stage lights, concrete wall, neon
    grid, lasers, starfield, bokeh), a gradient from your cover art's colours, the blurred original, your
    other clips, or a solid colour. Ranked for your template and colours. One click puts the same
    background behind every cut-out, and stock searches ("concert lights", "smoke background"…) open the
    Stock tab.
- **Themes (top of the Templates tab):** six dark looks for heavy music that restyle everything at once:
  lyrics and text, the picture's colour grade and film look, the end card, guitar/bass tab, drum chart and
  visualizer colours (including the drawn wood, frets, drum shells and highway roads), cut-out
  backgrounds and carousel filters.
  - **Blood & Ash** (black, deep red, bone white), **Funeral Doom** (faded sepia and old gold, cinema
    bars), **Frostbite** (icy black-metal grey-blue), **Hellfire** (ember orange, light leaks),
    **Toxic Sludge** (acid green, scanlines), **Rust & Steel** (gunmetal and rust orange).
  - **Make my own:** change the theme's four colours (background, deep, accent, light). "Back to the
    theme's colours" undoes it.
  - A theme changes colours and fonts only. Tick "Also use the theme's cuts, clip effects and lyric
    motion" to take its transitions and animations too.
  - Templates keep your theme, and layers you add later are themed as well.
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
  waveform, particles, glow pulse and speaker rings, plus six that look like real things:
  - **VU meters:** a pair of analog needle meters with ballistics and a peak light.
  - **LED spectrum rack:** a rack-mounted analyzer with lit segments and peak-hold caps.
  - **CRT oscilloscope:** a phosphor trace with afterglow on a gridded tube.
  - **Speaker cone:** a woofer that pumps with the low end (best on a kick or bass stem).
  - **Fire:** flames that roar with the music, with rising embers.
  - **Spectrogram:** a scrolling heat map of the last few seconds.

  They use real-world colours (amber meters, green phosphor, orange fire) unless you switch "Real-world
  colours" off to use the layer's colours; themes do that for you. Stems drive the visuals silently unless
  you switch their sound on. Analysis runs once per file, so preview and export match.

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
| `js/viz.js` | Audio visualizers: FFT analysis and the styles |
| `js/vizreal.js` | Realistic visualizers: VU meters, LED rack, oscilloscope, speaker, fire, spectrogram |
| `js/themes.js` | The six dark themes and how they restyle a project |
| `js/linestyle.js` | Per-line lyric looks (presets and overrides) |
| `js/panel-layers.js` | Layers panel |
| `js/share.js` | Share sheet and YouTube upload |
| `vendor/alphatab/` | alphaTab 1.9.0 parser (MPL-2.0), loaded only when a tab is used |
| `js/engine.js` | Playback clock, media sync, Web Audio mix, export |
| `js/timeline.js` | Multi-track timeline UI |
| `js/panels.js` | Tool panels and inspector |
| `js/stock.js` | Pexels / Pixabay / Wikimedia search and download |
| `js/app.js` | Layout, wiring, shortcuts |
