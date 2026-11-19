# Promo Studio

A band manager and a video editor for short promos (Reels, TikTok, Shorts), in one browser app.
Switch between them at the top: **Manager** plans songs, releases, shows and content; **Video Studio**
makes the promos. Everything runs in your browser. Your files are not uploaded anywhere; projects and
media are saved in the browser (localStorage + IndexedDB) and restored when you come back.

## Run it

```bash
npm start            # serves on http://127.0.0.1:8765/ (loopback only)
PORT=9000 npm start  # different port
```

No `npm install` is needed: there are no dependencies. Use a recent Chrome or Edge for MP4 export
(Firefox exports WebM). Since the app is plain static files, it can also be hosted on Netlify or
any other static host.

## Manager

The Manager workspace keeps the band's plans. It has its own undo (Ctrl+Z), saves in this browser, and
**Back up / Restore** (bottom left) moves everything to another computer or bandmate as one file.

**Several artists.** The switcher at the top left of the Manager holds every artist you manage
(**Add an artist** creates one). Each artist has its own profile, songs, shows, posts, money, press kit
and branding; venues, scene bands and contacts are one shared address book. **All artists** on Home and the
Calendar puts every artist's dates together (tagged with the artist), and opening another artist's item
switches to that artist. In the Video Studio, the **Artist** menu in the top bar puts that artist's name,
theme and logo (set under Press kit → Branding for promos) on the edit. Older saves become the first artist.

| Page | What it does |
|---|---|
| **Home** | The next show and the next release (with checklist progress), what's working in your content, anything overdue, and the next two weeks day by day |
| **Songs** | A page per song. *Overview*: status, release date, BPM, key, the song file (pick one from the Video Studio's library or **Upload from computer** right there: MP3, WAV, M4A, OGG or FLAC; it's saved with your media and used by **Make a promo**), and links to Spotify, Apple Music, YouTube, YouTube Music, Deezer, Tidal, Amazon Music, SoundCloud and Bandcamp. Type the song's ISRC and **Find links** looks it up: Deezer and MusicBrainz match the ISRC exactly (MusicBrainz often lists Spotify and Tidal too), Apple Music is matched by title and length, YouTube uses your YouTube key from the Content page, and every other service gets a search link. Add a free Spotify app's client ID and secret (kept in this browser) for an exact Spotify match. Pick **Use** per link or **Use all**. *Lyrics*: the words, and the lines that work best as on-screen hooks. *Files*: the song's **stems** (upload several at once; the part, such as drums, bass, guitar, vocals or keys, is guessed from the file name and can be changed; play each one; send a drum stem to the editor as a drum chart, or any stem as a visualizer or an extra audio track), its **music video** (play it, add it to the video track or as picture-in-picture), and **raw footage** (videos and photos with a note each; add one, all, or picture-in-picture). Files are stored with the Video Studio's media in this browser; removing one from a song keeps it in the library. The Video Studio's Video tab lists them under **From your songs**. *Video shoot*: music video concepts from the lyrics (with the words they came from), then the plan (date, call time, locations, crew, shot list, wardrobe, props, budget) and a printable call sheet. *Release*: a 22-step checklist counted back from release day (upload 5 weeks ahead, Spotify editorial pitch 30 days ahead, pre-save, press, short-form batch, premiere, follow-ups); change the date and every task moves. *Content*: a short-form plan around release day from the posting playbook. *Playlists*: tag the sound (genres, mood, energy, vocals, "for fans of"); the lyric themes are found from the words; get suggested playlists from a built-in list of about 50 editorial playlists on Spotify, Apple Music, Amazon Music and Deezer, each with why it fits and a search link, plus playlist types to search for. Hide built-ins that no longer exist and add your own playlists and curators (shared by every artist). *Press release*: a full release (FOR IMMEDIATE RELEASE … ###), a short version for blogs and a radio/DJ blurb, drafted from the song, the press kit and confirmed shows; add the story, a quote, label and credits, edit any draft, copy it, download it or print it to PDF. *Pitching*: the Spotify for Artists pitch with a live 500-character counter, the pitch deadline (7 days before release) and what to pick in the form; a short note to an independent curator (copy or open in email); and a pitch tracker (status, sent date, follow-up a week later that shows on Home and the Calendar). **Make a promo** puts the song's title, lyrics and file into the Video Studio. |
| **Shows** | Upcoming and past shows: date, status, venue, load-in, doors, set time, billing, tickets, deal, contact, notes, lineup, setlist, a to-do list counted back from the show (pitch, confirm, flyer, tickets, promo posts, advance, settle), the settlement (pay, merch, costs, net) and a summary to paste in the band chat |
| **Show planner** | *Venues*: a researched starter list of 29 Seattle-area rooms (Seattle, Tacoma, Everett, Bellingham, Olympia) with capacity, ages, genres, how each one says to book, the booking email or form, links and sources. Filter by size, city and all-ages, enter how many people you bring to see which rooms fit, and write a **pitch email** from your profile, songs and dates (copy it or open it in your email app). *Bands*: scene bands with their official accounts. *Build a show*: pick a date, a room and bands, see the break-even and the expected crowd, and create the show with its to-do list. *Contacts*: promoters, sound, photo, press, radio and curators. Researched entries say "Check before you reach out" until you tick them. |
| **Content** | Every planned and posted short across songs: type, app, status, link and stats. Paste a YouTube or Shorts link and **Fetch YouTube stats** reads views, likes, comments and length with a free YouTube Data API key. TikTok and Instagram only share stats with approved apps, so type the numbers from the post's insights, or **Import stats (CSV)** from TikTok Studio or Meta Business Suite exports (rows are matched to your posts by link). *What works best* ranks types of post, apps, days and lengths by shares, saves, comments and likes per view, and says it in plain words. |
| **Calendar** | Shows, releases, shoots, posts and to-dos on a month grid; **Download for my calendar (.ics)** imports into Google Calendar, Apple Calendar or Outlook |
| **Press kit** | The band profile (bio, highlights, genres, "for fans of", links, members, press quotes, booking contact, up to four photos) with a live preview, **Download press kit** (one self-contained HTML page) and **Copy short bio** |
| **Money** | A ledger of money in and out plus every show's settlement, totals for the year, by category and by month, each release's spend against its budget, and a CSV download |

## How it's laid out

The rail on the left has one **Start** tab for ideas, then a tab for each kind of thing you build:

| Tab | What's in it |
|---|---|
| **Start** | Stacked, collapsible sections: *Suggested for you* (ideas from your lyrics and three ready-made edits), *Templates and themes*, *My templates*, and links to the full-screen *Inspiration*, *Tab Studio* and *Carousel* pages |
| **Video** | My clips (upload and arrange), Stock video, From your YouTube channel, Video layers |
| **Audio** | Song and your own audio (beats, hook, voice-over, clip sound), Sound effects (the free sound pack, your library, Freesound, built-in, Openverse) |
| **Lyrics** | Lines, sync, display and style; select a line for its own look |
| **Visualizer** | Visualizer layers and all 18 styles |
| **Guitar Pro** | Guitar, bass and drum layers, and Tab Studio |
| **Text**, **End card**, **Look**, **Export** | As before; Look also has the pop-up tips switch |

Sections remember whether you left them open. API key boxes fold away once a key is saved. Every
layer tab has an *All layers and rows* section to reorder or hide everything at once.

**Post check.** The pill in the top bar scores the edit against the posting playbook (Start →
Inspiration): vertical format, a hook in the first 1.5 s, 7–15 s length, cut pace, a share ask,
"use this sound", text clear of the app buttons, not too many layers at once, and a short end card.
Click it for what helps or hurts, each with a one-click fix (undo works) or a jump to the right tab.

**Pop-up tips.** As you add layers, clips, the song or lyrics, a small card at the bottom right of
the preview suggests the next improvement, for example pointing a new visualizer at your drum stem,
moving lyrics off a new tab, or cutting on the beat once you have two clips. Each card has a fix,
"Got it" and "Don't show this again". Turn them off in Look → Editing tips.

**Ideas from your lyrics.** Start → Suggested for you reads your lyrics (in the browser, nothing is
sent anywhere) and suggests a theme, a visualizer, how lyrics are shown and per-line looks, quoting
the words it matched: fire and burn words point to Hellfire and the fire visualizer, storm and static
words to lightning, cold words to Frostbite, long lines to the scrolling sheet, short ones to the
kinetic poster, shouted lines to Scream and repeated lines to Gang vocals. Use them one at a time or
all at once.

**My templates.** Start → My templates saves the look of the current edit (theme, fonts, lyric style,
grades and effects per clip, text overlays, end card, visualizer and tab styles, length) without your
clips, song, lyrics or cover. Using one on a new release reuses your own layers' files and sync and
says which parts still need a file. Download a template as a `.promo-template.json` file to share it,
and import one from a file (imported files are checked and cleaned).

**From your YouTube channel.** YouTube only allows downloading videos you uploaded yourself, from
YouTube Studio (Content → ⋮ → Download). The Video tab walks you through it and takes the file.
Promo Studio doesn't download other channels' videos.

**Free sound pack.** 362 short public-domain (CC0) sound effects ship in `sounds/pack`:
hits, risers, airhorns, crowds, cymbals, guitar noises, scratches, cartoon and meme sounds, horror
stings, sci-fi zaps, everyday sounds and weather. Search them by name, category or tag, preview, add
at the playhead or save to your library. No key and no credit needed (each sound's creator and page are
still listed in `sounds/pack/index.json`). The pack was gathered through [Openverse](https://openverse.org),
mostly from Freesound. A *Find on MyInstants* link opens the same search there; most MyInstants
clips are cut from films, TV and songs, so only use ones you have the rights to.

## Features

**Keyframes (animate anything over time)**
- Every animatable slider has a ◆ next to it. Move the playhead and press ◆ (or just change the value once a
  property has a keyframe) to set a keyframe; the value glides between keyframes.
- Clips: position, zoom, rotation, opacity, blur, exposure, contrast, saturation. Text and lyric lines:
  position, size, rotation, opacity. Tab and drum layers: position, opacity. Visualizers: position, size,
  opacity, intensity.
- Keyframes show as diamonds on the selected item in the timeline: drag to retime (they snap to beats when
  snapping is on), double-click to delete, right-click to choose how it moves (smooth, linear, ease in,
  ease out, overshoot, hold). The inspector lists them with their easing and a jump-to time.

**Entrances and exits**
- Text and lyrics: pick an **Entrance** (17 animations) and an **Exit** (fade, pop out, zoom out, shrink,
  slide down / up / left / right, blur, spin, drop, glitch, flicker or cut) with its own length; per lyric
  line too. Left on "Quick fade", they end with the original short fade.
- Tab, drum, visualizer and video layers: an entrance and an exit from the same set.
- Clips: an **Exit** on the last clip (as the video ends or the end card starts) and on video-layer clips;
  between clips the next clip's transition in is used.

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
- **Suggested edits (Start → Suggested for you):** add a song and some clips (plus a Guitar Pro file or lyrics if you have them) and it
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
    Stock video section of the Video tab.
- **Themes (Start → Templates and themes):** six dark looks for heavy music that restyle everything at once:
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
- **Templates (Start → Templates and themes):** 16 one-click song templates with live previews of your own footage. Each sets the
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
- **Sound effects (Audio tab):** 12 built-in effects generated in the browser (riser, impact, sub drop, whoosh, reverse
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

Layers stack above the main video. Each kind lives in its own tab (video layers in **Video**,
visualizers in **Visualizer**, guitar tabs and drum charts in **Guitar Pro**), and every one of those
tabs has *All layers and rows* for the whole stack. Add as many as you like, reorder
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
- **Drum chart:** from a Guitar Pro drum track or detected from a drum stem audio file (kick, snare,
  hi-hat). Every style charts the whole kit: kick, snare, hi-hat, high tom, mid tom, floor tom, crash 1,
  crash 2, china and ride (GM 50/48 high tom, 47/45 mid tom, 43/41 floor tom, 49 crash 1, 57 and the
  55 splash crash 2, 52 china). Lane styles show every drum and cymbal for a Guitar Pro part, and only the
  found ones for a stem; *Show every drum and cymbal* changes that. **Kit pieces** (in the layer's
  settings, for every style) turns each drum and cymbal on or off, with quick setups (*Full kit*,
  *5-piece, crash and ride*, *4-piece*, *Full kit, no china*). A piece that's off isn't drawn and its hits
  move to the closest piece that's on (a china to crash 2, then crash 1, then the ride; a mid tom to the high
  tom, then the floor tom; the hi-hat to the ride). The kick always stays; a lone rack tom moves to the
  middle. Pick one of six styles from the style grid:
  - **Scrolling lanes**, a falling **highway**, or a **circle** that sweeps once per bar with hits on rings.
  - **Neon highway:** a 3D glowing road with gem notes, shockwaves and sparks at the strike line, and an
    optional combo counter.
  - **Light-up drum kit:** a drawn kit (kick, snare, high and mid rack toms, floor tom, hi-hat, two
    crashes, a china and a ride) with your band name on the kick drum and a strip of upcoming hits along
    the top. *Finish*:
    - **Neon glow:** lit shells and heads that glow, bounce and ripple.
    - **Stage (realistic):** wrapped shells with chrome hoops and lugs, coated heads that flex on a hit,
      bronze cymbals with lathe rings that wobble, a hi-hat stand with its pedal, tripod stands, a rug and
      a spotlight. *Shells* picks the wrap: black, wine red or ocean blue sparkle, natural maple, dark
      walnut or white pearl.
    - **Inferno:** charred shells with glowing cracks, black hardware and heads, flames behind the kit that
      leap on every kick, embers drifting up.
    - **Thunder:** midnight sparkle shells under storm clouds; lightning strikes the crash, ride and snare.
    - **Frostbite:** black shells covered in frost crystals, white heads, silver cymbals, fog and snow.
    - **Steel & spikes:** brushed steel shells with rivets, spiked kick hoops, black hardware, and welding
      sparks off every hit.
    - **Blackout:** all black and grey: satin black shells, black hardware, grey heads, smoked cymbals,
      grey light and haze, and a grey upcoming-hits strip.
    The realistic and metal finishes can use **Double bass drums** (two kicks that take turns; on by default
    for the metal finishes), with the band name split across both.
  - **Glass lanes:** a frosted panel over your video with gradient capsules, trails and hit bursts.

  Choosing a style also moves the chart to a spot that suits it.
- **Visualizer:** reacts to any audio you give it: a stem (drums, bass, vocals…) or the song.
  Styles: water ripple (bends the picture on each hit), electricity, spectrum bars, circular spectrum,
  waveform, particles, glow pulse and speaker rings, plus ten that look like real things:
  - **VU meters:** a pair of analog needle meters with ballistics and a peak light.
  - **LED spectrum rack:** a rack-mounted analyzer with lit segments and peak-hold caps.
  - **CRT oscilloscope:** a phosphor trace with afterglow on a gridded tube.
  - **Speaker cone:** a woofer that pumps with the low end (best on a kick or bass stem).
  - **Fire:** flames that roar with the music, with rising embers.
  - **Spectrogram:** a scrolling heat map of the last few seconds.
  - **Tape reels:** a reel-to-reel deck; the reels turn (the fuller one slower), the tape winds across
    over the song and flutters with the level, and two meters swing.
  - **Mixing desk:** a channel strip (kick, bass, snare, guitars, vocals, keys, cymbals, main) whose
    faders ride each band, with fast LED meters beside them.
  - **Lightning:** branching bolts strike on each hit, flicker like real lightning and light the sky.
  - **Vibrating strings:** six strings over a guitar body that blur and ring like a plucked string, low
    strings with the low end.

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
| `js/drumkit.js` | The drum kit's layout (single or double bass), the Stage and metal finishes, shell wraps and effects (unit tested) |
| `js/viz.js` | Audio visualizers: FFT analysis and the styles |
| `js/vizreal.js` | Realistic visualizers: VU meters, LED rack, oscilloscope, speaker, fire, spectrogram |
| `js/vizgear.js` | More realistic visualizers: tape reels, mixing desk, lightning, vibrating strings |
| `js/postcheck.js`, `js/panel-postcheck.js` | Post check score and pop-over |
| `js/tips.js`, `js/panel-tips.js` | Pop-up editing tips |
| `js/lyricideas.js` | Theme, visualizer, display and line-look ideas from the lyrics |
| `js/mytemplates.js` | Save, apply, export and import your own templates |
| `js/soundpack.js`, `sounds/pack/` | The bundled CC0 sound pack and its search |
| `js/manager/shell.js` | The Manager workspace: nav, artist switcher, store, backup and restore |
| `js/manager/isrc.js` | ISRC → links: MusicBrainz, Deezer (JSONP in a sandboxed iframe), Spotify, iTunes and YouTube lookups, matching and search links (unit tested) |
| `js/manager/page-links.js` | The song's Links section with the ISRC lookup |
| `js/manager/files.js` | A song's stems, music video and raw footage, stem part guessing, the Video Studio list (unit tested) |
| `js/manager/page-files.js` | The song's Files tab |
| `js/manager/playlists.js` | Lyric themes, genre families, the built-in playlist list, playlist matching and playlist types (unit tested) |
| `js/manager/press.js` | Press release drafts, the Spotify pitch, curator notes, pitch deadline and follow-ups (unit tested) |
| `js/manager/page-press.js` | The song's Playlists, Press release and Pitching tabs |
| `js/manager/artists.js` | Several artists with a shared address book; combined agenda; backups (unit tested) |
| `js/keyframes.js`, `js/panel-kf.js` | Keyframe engine (values, easing, editing) and its sliders, list and target lookup |
| `js/exits.js` | Exit and entrance motions shared by text, lyrics, layers and clips |
| `js/manager/model.js` | Songs, shows, the release checklist, the agenda and backups (unit tested) |
| `js/manager/ideas.js` | Music video concepts, hook lines and post plans from the lyrics |
| `js/manager/planner.js`, `seed.js` | Venues, bands, contacts, pitch emails, show to-dos; the researched starter lists |
| `js/manager/content.js` | Post links, YouTube stats, CSV import and the what-works comparison |
| `js/manager/extras.js` | Calendar (.ics), the press kit and money totals |
| `js/manager/page-*.js`, `planner-tabs.js` | The Manager pages |
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
