# Band Manager

A band manager and a video editor for short promos (Reels, TikTok, Shorts), in one browser app.
Switch between them at the top: **Manager** plans songs, releases, shows, tours and content; **Video Studio**
makes the promos; **Photo Studio** makes images; **Tab Studio** writes and fixes Guitar Pro tabs. On a narrow
window the inactive workspace buttons show only their icon. The app opens on the Manager (a link ending in
`#studio` opens the Video Studio, `#photo` the Photo Studio, `#tabstudio` Tab Studio), and shows that workspace from
the first paint, while fonts and media are still loading, so the Video Studio no longer flashes up first. The
badge next to the switch shows the band and song you're working on; click it to open the song. Everything runs in your browser. Your files are not uploaded anywhere; projects and
media are saved in the browser (localStorage + IndexedDB) and restored when you come back.

## Run it

```bash
npm start            # serves on http://127.0.0.1:8765/ (loopback only)
PORT=9000 npm start  # different port
```

The server also passes the Tours page's setlist.fm searches on (setlist.fm doesn't accept calls from web
pages). It answers only this app on this computer, forwards only the read-only searches, and uses the
API key your browser sends; it stores and logs nothing. On a static host that search falls back to links.

No `npm install` is needed: there are no dependencies. Use a recent Chrome or Edge for MP4 export
(Firefox exports WebM). Since the app is plain static files, it can also be hosted on Netlify or
any other static host.

## Manager

The Manager workspace keeps the band's plans. It has its own undo (Ctrl+Z, also right after ticking a
checkbox or picking from a list; inside a text field Ctrl+Z undoes your typing), saves in this browser, and
**Back up / Restore** (bottom left) moves everything to another computer or bandmate as one file.

- **Backups.** Under the buttons it says when you last backed up. Home reminds you after 14 days without
  one. On the first edit the Manager asks the browser to keep its storage (browsers may still clear it, so
  back up). If a save fails (for example, storage is full), a banner stays on screen until a save works,
  with **Back up now**. **Restore** keeps what you had before, and **Undo restore** puts it back while
  the bar is showing (if you changed anything since the restore, it asks first, because those changes are
  undone too). Deleting an artist can be undone the same way; other artists' changes since are kept.
- **Phone.** Below 760 px the side nav turns into a strip across the top and every page is one column.
- **Back button and links.** Each Manager page has its own address (`#m/songs/<id>/release`), so the
  browser's Back button steps back through the pages and a song page can be bookmarked.

**Several artists.** The switcher at the top left of the Manager holds every artist you manage
(**Add an artist** creates one). Each artist has its own profile, songs, shows, posts, money, press kit
and branding; venues, scene bands and contacts are one shared address book. **All artists** on Home and the
Calendar puts every artist's dates together (tagged with the artist), and opening another artist's item
switches to that artist. In the Video Studio, the **Artist** menu in the top bar puts that artist's name,
theme and logo (set under Press kit → Branding for promos) on the edit. Older saves become the first artist.

| Page | What it does |
|---|---|
| **Home** | The next show and the next release (with checklist progress), what's working in your content, anything overdue, and the next two weeks day by day |
| **Songs** | A page per song. *Overview*: status, release date, an **Instrumental** tick (no vocals: the Lyrics tab steps aside, the video shoot ideas come from the title, post plans skip lyric hooks, and the press release and pitches call it an instrumental), BPM, key, the song file (pick one from the Video Studio's library or **Upload from computer** right there: MP3, WAV, M4A, OGG or FLAC; it's saved with your media and used by **Make a promo**), and links to Spotify, Apple Music, YouTube, YouTube Music, Deezer, Tidal, Amazon Music, SoundCloud and Bandcamp. Type the song's ISRC and **Find links** looks it up: Deezer and MusicBrainz match the ISRC exactly (MusicBrainz often lists Spotify and Tidal too), Apple Music is matched by title and length, YouTube uses your YouTube key from the Content page, and every other service gets a search link. Add a free Spotify app's client ID and secret (kept in this browser) for an exact Spotify match. Pick **Use** per link or **Use all**. No ISRC? Type the release's **UPC** (its barcode) and **Find the release**: Deezer, MusicBrainz and Apple Music list its tracks with their ISRCs; pick the song and its links are found from there. An EP or album page has **Find tracks by UPC**, which fills in the title, type, date, label and cover and gives every song on it its ISRC and track number (adding songs it doesn't have yet). Each song also has a **Length** (blank uses its song file's length) for setlists. *Lyrics*: the words, and the lines that work best as on-screen hooks. *Overview* also has the song's EP or album, its track number and its **cover art**. *Sections*: the song's intro, verses, choruses and so on with their times, typed or pasted as a list ("0:42 Chorus", "Chorus 0:42–1:10", "[1:10] Bridge"), plus where the song starts in its music video. In the Video Studio, **Export → Song sections** exports any of them in one go (one file, or a .zip): cut from the edit as you made it, as a promo of each section with your look and end card, or cut from the music video in sync. *Files*: the song's **Guitar Pro tab** (Guitar Pro 3–8 or MusicXML; shows its tracks; **Add to the video** puts it on the edit as a tab or drum chart, **Open in Tab Studio** opens it for fixing), its **stems** (upload several at once; the part (drums, percussion, bass, guitar, keys, lead vocals, backing vocals, FX, click or other) is guessed from the file name and can be changed; stems are grouped by part, can be moved up and down within a part, and can be given their own name without renaming the file; play each one; send a drum or percussion stem to the editor as a drum chart, or any stem as a visualizer or an extra audio track), its **music video** (where it's at: idea, planned, shot, editing, complete or released, with a one-click **Mark complete**; a finished video shows as **✓ Video** on the song's card and in its Overview; play it, add it to the video track or as picture-in-picture), and **raw footage** (videos and photos with a note each; add one, all, or picture-in-picture). Files are stored with the Video Studio's media in this browser; removing one from a song keeps it in the library. The Video Studio's Video tab lists them under **From your songs**. *Video shoot*: music video concepts from the lyrics (with the words they came from), then the plan (date, call time, locations, crew, shot list, wardrobe, props, budget) and a printable call sheet. *Release*: a 22-step checklist counted back from release day (upload 5 weeks ahead, Spotify editorial pitch 30 days ahead, pre-save, press, short-form batch, premiere, follow-ups); change the date and every task moves. Once a song is marked Released, its tasks up to release day no longer show as overdue, and **Mark everything before release day done** ticks them. *Content*: a short-form plan around release day from the posting playbook. *Playlists*: tag the sound (genres, mood, energy, vocals, "for fans of"); the lyric themes are found from the words; get suggested playlists from a built-in list of about 50 editorial playlists on Spotify, Apple Music, Amazon Music and Deezer, each with why it fits and a search link, plus playlist types to search for. Hide built-ins that no longer exist and add your own playlists and curators (shared by every artist). *Press release*: a full release (FOR IMMEDIATE RELEASE … ###), a short version for blogs and a radio/DJ blurb, drafted from the song, the press kit and confirmed shows; add the story, a quote, label and credits, edit any draft, copy it, download it or print it to PDF. *Pitching*: the Spotify for Artists pitch with a live 500-character counter, the pitch deadline (7 days before release) and what to pick in the form; a short note to an independent curator (copy or open in email); a **SubmitHub and Groover** box (neither has a public API for artists, so it opens the site, gives you a short pitch to paste, and logs the campaign with what you spent); and a pitch tracker (service, status, sent date, cost, follow-up a week later that shows on Home and the Calendar). **Make a promo** puts the song's title, lyrics and file into the Video Studio. |
| **Songs & releases** | One page with three sections: **Albums**, **EPs** and **Songs** (every song, saying which EP or album it's on; a chip shows only the ones on neither). Each EP and album opens its own page with (deluxe, live and compilation releases count as albums): cover art, release date, label, UPC and notes, and an ordered tracklist. Add songs from the release or pick the release on a song's Overview (or start a new EP or album from there); reorder tracks; **Give every track this release date**. A song shows its EP's or album's cover until it has its own. Covers warn when they aren't the 3000 × 3000 square stores want. **Design a post** opens the Photo Studio with the release's title and cover. |
| **Shows** | Upcoming and past shows: date, status, venue, load-in, doors, set time, billing, tickets, deal, contact, notes, the **poster** (upload it, take it from Google Drive or pick one you have, or design one in the Photo Studio and press **Use as the show's poster** there; it shows on the show and as a thumbnail in the list), lineup, setlist (each song's length, when it starts and the **set length**, with time between songs if you want it; a line can carry its own time, like "Jam 2:30"; a line that isn't one of your songs gets a length box that saves it to your **Covers**), a to-do list counted back from the show (pitch, confirm, flyer, tickets, promo posts, advance, settle), the settlement (pay, merch, costs, net, then the **split** between the members from the press kit: even or by share, with an optional band-fund % kept back) and a summary to paste in the band chat (with each member's cut). **Print setlist** prints the setlist for the stage floor: one page, big type, covers marked and each song's key. A show set to **Pitched** gets a "Follow up with the venue" on Home and the Calendar a week later. Shows move to **Past** the day after their date, with how many you played, the venues, cities and net, and a wall of their posters; **Log a past show** adds one you played before using Band Manager. Venues marked Played show on the press kit. |
| **Covers** (on Songs & releases) | Songs by other artists you play live: title, original artist, length, key or tuning, notes, and how many shows they're on. They're setlist chips on every show and count in the set length and the show planner's run of show, like your own songs. |
| **Show planner** | *Venues*: a researched starter list of 29 Seattle-area rooms (Seattle, Tacoma, Everett, Bellingham, Olympia) with capacity, ages, genres, how each one says to book, the booking email or form, links and sources. Filter by size, city and all-ages, enter how many people you bring to see which rooms fit, and write a **pitch email** from your profile, songs and dates (copy it or open it in your email app). *Bands*: scene bands with their official accounts. *Build a show*: pick a date, a room and bands, see the break-even and the expected crowd, and create the show with its to-do list. *Contacts*: promoters, sound, photo, press, radio and curators. *Show plan*: the run of show for any show: doors, when the first band starts, each band's set and changeover, the curfew (with a warning when the night runs over), and your setlist with song lengths (filled from the songs' audio files) and the clock time each song starts. *Stage plot* (each piece drawn from above as on a real plot: the kit with its heads, hoops and bronze cymbals, cabinets with grille cloth and speakers, mic stands, keyboards, wedges, in-ear packs, power strips, a carpeted riser): start from a four-piece, five-piece or trio-with-tracks layout and drag drums, amps, keys, mics, DIs, tracks, wedges, in-ears, power and the riser around the stage (arrow keys nudge the selected piece); name pieces ("Lead vocal: Sam"); the **input list** (channel, mic or DI, stand) and **monitor mixes** are made from it, with backline and engineer notes. Researched entries say "Check before you reach out" until you tick them. |
| **Tours** | Plan a run city by city. Find each city on OpenStreetMap, set its date and status (looking, pitched, on hold, confirmed, dropped), and see the drive from the last stop (straight line × 1.25 at about 55 mph: a rough guess). **Find venues** searches OpenStreetMap for music venues, nightclubs, concert halls and places tagged with live music near the city (address, website, phone and email when listed), or **Where similar bands played** looks up the bands in your "for fans of" list on setlist.fm (free API key) and lists the rooms they played in that city. Shortlisted venues go into the shared venue list marked "Check before you reach out". Each stop has a guarantee, merch, gas (worked out from your cost per mile unless you type it) and lodging, and the tour shows the totals. **Confirm here** makes the stop a confirmed show with its to-do list. |
| **Content** | Every planned and posted short across songs: type, app, status, link and stats. Paste a YouTube or Shorts link and **Fetch YouTube stats** reads views, likes, comments and length with a free YouTube Data API key. TikTok and Instagram only share stats with approved apps, so type the numbers from the post's insights, or **Import stats (CSV)** from TikTok Studio or Meta Business Suite exports (rows are matched to your posts by link). *What works best* ranks types of post, apps, days and lengths by shares, saves, comments and likes per view, and says it in plain words. |
| **Calendar** | Shows, releases, shoots, posts and to-dos on a month grid, plus **your own events**: **Add event** (or click a day's empty space, or its +) for a rehearsal, meeting, travel day, something personal or anything else, with a date, an optional start and end time (an end before the start runs past midnight) or all day, a location, a note and **Every week** with an optional last date. Events are coloured by kind; click one to edit or delete it (Ctrl+Z undoes either). They show on Home's next two weeks, in **All artists**, in the month PDF and in the .ics (a weekly one as a single repeating event); **Download for my calendar (.ics)** imports into Google Calendar, Apple Calendar or Outlook (each event keeps the same ID between downloads, even when its date moves, so importing again updates events instead of doubling them; a late set runs past midnight correctly). A file downloaded before November 2026 used other IDs: the first import of a new file adds every event once more, so delete the old imported calendar or its events once, then import the new file |
| **Photos** | A file browser for each artist's photos: a **folder tree** on the left (expand and collapse, click to open, drop photos or folders on it), **Back** and **Up** buttons and the path above, and folders that open to show what's inside. **Shift-click** ticks a run of photos and **Ctrl/⌘-click** adds or drops one (while photos are ticked, a plain click ticks too); move them all, or **Tag…** them (a minus takes a tag off). **Tag all…** on a folder tags every photo in it, and in its folders if you say so. Two views: **Browse** (just the pictures, caption and photographer underneath) and **Edit details** (caption, photographer, tags, folder and the press kit / profile / logo / video buttons beside each photo; remembered). The viewer has a **Details** panel to edit the photo you're looking at. Photos are in **folders** (folders can hold folders; **New folder**, rename, delete moves its photos up so nothing is lost; tick photos and **Move to**, or drag photos onto a folder; uploads go into the open folder; a search or a filter looks in every folder and says where each photo is). One page of photos at a time (24, 48, 96 or 200 per page, remembered), so a big library stays quick; the Photo Studio's Photos tab has the same folders and pages. Also: **Profile** makes a photo the artist's profile photo (shown in the artist menu, on Home and at the top of the press kit; it can also be uploaded or picked on the Press kit page); upload in bulk (or drag them in, or add from the media library), caption, photographer and tags on each, star favorites, search and filter by tag, starred or press kit, a full-size viewer (arrow keys to step, Esc to close), **Press kit** (up to four, used by the downloadable press kit with the photographer credited), **Logo** (the artist's logo on promos), **Video** (add to the Video Studio's video track) and download |
| **Press kit** | **Profile photo**: upload or pick one, then **Reposition** to drag it inside its frame (or click it and use the arrow keys; Shift for bigger steps), zoom 1×–3× with the slider or + and −, and **Reset** to centre it. The framing shows in the artist menu, on Home and in the downloaded press kit, and Ctrl+Z undoes it. The band profile (bio, highlights, genres, "for fans of", links, members, press quotes, booking contact, up to four photos picked here or on the Photos page and remembered; the photo list shows one page at a time with the Photos page's page size, and the picked photos and the profile photo stay on top of every page) with a live preview, **Download press kit** (one self-contained HTML page) and **Copy short bio** |
| **Money** | A ledger of money in and out plus show settlements: pay and merch count once a show is marked Played, or is Confirmed and its day is over (ideas, pitches and holds never count; pay typed in for upcoming shows shows as **Expected**), and costs count as soon as they're typed (a deposit or the van is spent already), totals for the year, by category and by month, what each member was paid from the shows' splits, each release's spend against its budget, and a CSV download |

**Streaming stats** (Manager page). Every song's streams, Spotify listeners and saves, YouTube views,
Last.fm scrobbles, Deezer rank and earnings in one table, plus totals by store and a monthly trend. No
service gives artists a stream-count API (Spotify's Web API has no plays, and since February 2026 no
popularity or followers for new apps), so streams come from files you download:
- **Spotify for Artists:** Music → Songs → the download arrow (a song's own timeline CSV works too).
- **Your distributor's report** for every other store (Apple Music, Amazon, TikTok, Tidal, YouTube Music…):
  DistroKid's Bank → See Excruciating Detail → download, or TuneCore, CD Baby and Amuse sales exports.
  Rows match your songs by ISRC, then by title; pick the song for any title that doesn't match.
  Importing the same file again replaces it.
- **Refresh live numbers** gets YouTube views (the Content page's key and each song's YouTube link),
  Last.fm listeners and scrobbles (free key) and Deezer's rank (by ISRC, no key).

**Photo Studio** (third workspace, next to the Video Studio). Make posters, promo images, stories,
thumbnails and carousels from layers: photos, text, shapes and gradients. Each layer has position, size,
rotation, opacity, a blend mode, a drop shadow, photo adjustments (brightness, contrast, saturation, hue,
black and white, sepia, blur, invert, plus ready looks) and a **mask**: rectangle, ellipse, fades in any
direction, a soft spotlight, **cut out the person** (the same on-device person finder as the video
background remover) or **clip to the layer below** (text filled with a photo). Drag to move (snaps to
the centre), pull the handles to resize, the knob to rotate; arrow keys nudge, Ctrl+D duplicates, Ctrl+Z
undoes; drag rows in the layer list to reorder, hide or lock them.
- **Templates** from the artist's theme, logo and details: continuous carousel (one wide photo across
  2–10 slides, worked out from the photo's shape), promotional image, release notification ("Out Friday"
  story), countdown to release (or the whole set: 7, 3 and 1 days and release day), show poster, tour
  dates, photo in photo (a framed print over a blurred photo), lyric card and YouTube thumbnail. Pick several photos
  in order for the carousel: they're laid side by side across the slides, each blending into the next. The
  promo and release templates put the song's (or album's) cover on the artwork. Songs and shows have **Design a post** / **Make a poster**, tours
  **Tour poster**.
- **Photos** from the shared media library, an upload, Google Drive, or **Stock** (Pexels, Pixabay or
  Wikimedia Commons; the same keys as stock video; the credit is kept with the photo).
- **Export** PNG or JPG at full size (a carousel downloads one image per slide), or **Save to media** to
  use it in the Video Studio and on the artist's Photos page. Designs are saved in this browser.

**Export PDF.** The press release, press kit, call sheet, show sheet, show plan, stage plot, tour sheet,
money report and the month's calendar each have **Export PDF**. It opens the print dialog with a clean
black-on-white page; pick **Save as PDF** as the printer.

**Google Drive.** **From Google Drive** sits next to the upload buttons (song file, stems, tabs, music
video, footage, Photos, and the Video Studio's media). Google only lets an app read Drive through a Google
Cloud project you own, so connect it once (Manager → **Google Drive**, bottom left):

1. Make a project in [Google Cloud](https://console.cloud.google.com/projectcreate) and note its project number.
2. Turn on the Google Drive API and the Google Picker API.
3. Set up the OAuth consent screen (External) and add yourself and bandmates as test users.
4. Create an OAuth client ID (Web application) with the app's address (for example `http://127.0.0.1:8765`) as an authorised JavaScript origin.
5. Create an API key restricted to the Picker API and the app's address (add `https://docs.google.com/*` if the picker refuses the key).
6. Paste the client ID, API key and project number. They're kept in this browser only.

Signing in uses the `drive.file` permission: the app can open only the files you pick, nothing else in
your Drive, and the sign-in lasts until you close the tab. Google Docs, Sheets and Slides are skipped.

### Outreach and the press kit health check

**Content → Outreach** keeps the blogs, playlist curators, radio shows, podcasts and press you pitch that
aren't a song's own playlist pitch. Each has a type, contact, email, link, an optional song, a status (Idea,
Drafted, Sent, Replied, Placed, Passed), notes and a short log. **Draft email** opens your own mail app with
the pitch filled in (the band, the picked song and your links, using the same text as the song pitches);
tick several to write one email with everyone in BCC. **Mark sent** sets today and a follow-up a week later
(change it under Edit), and the follow-up shows on Home and the Calendar until you mark it followed up or
set Replied, Placed or Passed. Your songs' playlist pitches are listed on the same tab, read only; edit them
on each song's Pitch tab. The app sends nothing and can't see your inbox, so replies are marked by hand.
Contacts stay in this browser and your backups and never go into the press kit.

**Press kit → Health check** looks at what a booker or blog checks first: a short bio of a sensible length,
a profile photo, a press photo of at least 2000 px on its long side ("can't tell" until the photo has
loaded), a YouTube link, streaming stats imported in the last 90 days, a booking email, a social link, a
released song with links, and a confirmed upcoming show. Each one that isn't met says how to fix it and
links to the page or field. The score counts passed checks only.

### Availability (Calendar → Availability)

Ask the band which dates work, with no accounts and no server. This app runs on your own computer, so a link to it would not open for your bandmates; you send a file instead.

1. **New poll**: a title, a kind (rehearsal, show, recording, other), the candidate dates (click days on a month grid, or add a weekday range) and the names of who should answer. Up to 60 dates and 12 people.
2. **Make poll file** saves one HTML file (about 20 KB). Send it by message or email. It opens offline in any browser, sends nothing anywhere, and has a strict Content-Security-Policy (no network, one hash-approved inline script). Your bandmate types their name, ticks Yes, Maybe or No for each date and gets a short **reply code** (`AV1.…`) with a Copy button and an email link.
3. **Paste the codes** here (one, several, or the whole message they sent). A person's earlier reply is replaced when they answer again; codes for another poll, cut-off or tampered codes and a 13th person are ignored with a reason.
4. The grid shows dates × people, a Yes / Maybe / No count per date, the dates everyone can make, the dates where everyone is at least a Maybe, and a **Best date**. **Pick this date** adds a calendar event of the right kind (or a show draft for a show poll) through the normal events and shows.

Limits, also said in the app: no live sync (replies come back by hand), the code is not secret and does not prove who sent it, anyone with the file can answer, and you only see what people send. Only names are stored, never emails or phone numbers; a poll's names and answers are never put in the press kit, the .ics or any PDF. Polls live in the Manager workspace (backup, restore, undo and artist switch cover them). Code: `js/manager/availability.js` (logic), `page-availability.js` (screen), `css/mgr-avail.css`.

### Link page

**Press kit → Link page** makes a link-in-bio page: one HTML file with your profile photo, latest
release (cover and store links), the next confirmed shows with ticket links, merch, socials, a short bio
and your own buttons (add, reorder, remove). It uses the band's theme colours, dark or light. The file
has no scripts, loads nothing from the internet, blocks everything else with a Content-Security-Policy,
and keeps photos small (usually well under 200 KB). Only public fields go on it: no fans, contacts,
members or notes, and the booking email only if you tick it. Links must be `https://`, `http://` or `mailto:`.

The app can't host the page or know its address. Upload the file to a free static host (GitHub Pages,
Netlify Drop, Cloudflare Pages…), paste the address it gives you into **Page address**, and upload again
after changes. The QR code (written in `js/manager/qr.js` from the QR spec: byte mode, versions 1–10,
level M, no library) then points at that address, or at your Spotify link until you have one. It's on
the page, in **Download QR (SVG)** and on a one-page flyer (**Print flyer**, then Save as PDF). The
settings live in `band.linkInBio`, so backups, undo and artist switching cover them.

### Fans & opportunities

A Manager page after Money, with two tabs.

**Fans** is each artist's own list of people who agreed to hear from the band: email, name (optional),
city, region, where you met (show, signup form, merch table, other), the show, a note and an "agreed to
hear from us" box. No phone numbers are kept. Add people by hand, paste a list (one per line: email,
name, city), or import a CSV file (pick where each column goes; duplicates by email are skipped; up to
2,000 rows per import and 5,000 people per artist). **Download CSV** exports the list shown (it holds
personal data, so keep the file safe). **By city** counts fans per city and filters the list. **Fans near
a show** lists your upcoming shows with the fans in that city, plus nearby towns you type in ("Also try
nearby"). **Email these fans** opens your own mail app with the addresses in BCC, split into several
emails when the list is long; only fans with the box ticked are included. The app sends nothing.

The list is stored only in this browser and goes into backups. When there are fans, the backup area
says so and offers **Back up without the fan list** (also on the page), the one to use when you share
a backup with a bandmate. Fan details never go into the press kit, show sheets, PDFs or calendar files.

**Opportunities** is one list shared by every artist: grants, festival and showcase calls, contests and
residencies, with kind, organisation, link, deadline, region, fee, notes, status (interested, planning,
applied, won, passed) and the day you last checked it. Filter by kind, status and region; sort by
deadline. Reminders show in the Calendar and on Home 14 and 3 days before a deadline, until you mark it
applied, won or passed. A starter list of 14 calls and grants for a heavy band in the Pacific Northwest
is added once (checked 23 Nov 2026, each with its source link; deadlines that couldn't be confirmed are
left blank). Dates change, so always confirm on the organiser's site; nothing here updates itself.

### Split sheets and the caption bank

**Splits** (a tab on each song's page) records who wrote the song and each writer's share: name, role
(lyrics, music, both, producer, other), share in %, PRO or society, and an optional email. **Add band
members** starts from the band's member list, and **Split evenly** gives equal shares that add up to exactly
100 (three writers get 33.34 / 33.33 / 33.33). The running total turns into a warning when the shares don't add
up to 100. Tick **Everyone has signed** yourself once the signed copies are back; the app does not collect
signatures. **Print split sheet (PDF)** prints the title, date, writers, shares and a signature line per
writer, with the note "This is a record of what the writers agree, not legal advice. Each writer signs and
keeps a copy." Emails are printed only when **Include email addresses** is ticked. Song cards and the Overview
show **Split signed** or **Split missing** (hover for why: no writers, not 100%, or not signed).

**Captions** (a tab on the Content page) is a bank of captions to reuse: text, hashtags, app, kind (hook,
teaser, release, show, behind the scenes, other) and an optional song. Search covers the text and hashtags;
filter by app, kind or song. **Copy** puts the text and hashtags on the clipboard and counts a use. The star
on a Schedule row saves that post's hook line (or title) to the bank, linked to the post. **Best performers**
marks the top three captions by the median views of the posts they were used on (linked by the star, or with
the same text as a post's hook line or title) and says when there is too little data (fewer than 2 captions
or 3 posts with views). Both are stored per artist in this browser and go into backups.

### Merch and release money

**Money** now has three tabs: **Overview** (as before), **Merch** and **Releases**.

- **Merch** keeps your stock: each item (shirt, hoodie, vinyl, CD, sticker, patch, poster, other) with a
  price, a cost per piece, the count per size (or one count) and a reorder point. **Add stock** adds a batch
  and puts what it cost into Money as merch spending. **Sell at a show** logs a sale (show, item, size, how
  many, price) and takes it off the stock; you can't sell more than you have, and **Take this sale back**
  puts it back. Items at or below their reorder point are flagged and get a reorder reminder on Home and
  the Calendar; **Retire** an item to stop selling it and its reminder.
- Sales logged for a show **replace** that show's "Merch sales" number in Money and in the members' split,
  never add to it, and count once the show is played. Shows with no logged sales keep using the number.
  Sales with no show (online, mail order) count on their own date.
- A show's costs are its settlement "Costs", or the show recap's expense lines when Costs is blank.
- **Releases** shows each song, EP and album: budget (the songs' Video shoot budgets), spent and earned
  (ledger lines tagged "For" the song or release, plus streaming earnings from reports imported on
  Streaming stats), net, and **Paid off** once earnings cover the spending. When a song has imported
  earnings, a ledger "Streaming & sales" line for it is left out so a payout isn't counted twice.
  **Export PDF** prints the table. Nothing here is live: it's what you typed or imported.

### Show day

At the bottom of each show (**Shows** → a show) the **Show day** section has three tabs. Everything is typed
by you and kept in this browser with the show (so backups, Restore and Undo cover it). Nothing is fetched,
synced or sent by the app.

- **Advance sheet:** one page for the venue and its sound engineer: load-in, soundcheck, doors, your set,
  curfew, set length, lineup, parking, load-in notes, hospitality, a rider, and the stage plot and input
  list from **Show planner → Stage plot**. The venue contact's name, phone and email are typed here and go
  on the sheet only when you tick them. The sheet is built from a fixed list of fields: the deal, money,
  the show's own notes, fans, bandmates and other contacts are never on it. **Send to venue** opens your
  own email app with the sheet as text (a mailto link can't carry attachments, so save the PDF and attach it
  yourself); **Export advance sheet PDF** and **Copy as text** are next to it. **Mark as sent** stops the reminder.
- **Gear and load-in:** a packing list that can start from the stage plot's gear, with who brings each item,
  a packed count, "Needs backline" for gear you won't bring (flagged until "Borrowed / arranged", and listed
  on the advance sheet), and a printable version.
- **After-show recap:** people through the door, expense lines (numbers), how it went, what worked, a note
  on the promoter and a venue note for next time. "Add to the venue's notes" appends a dated line to the
  venue's **Our notes**. **Use as Costs** copies the expense total into the settlement's Costs.

A show page and **Show planner → Build a show** say "Last time here: …" (date, net, door count and your venue
note) for a venue you played before. Two reminders appear in Home and Calendar: **Send advance sheet** a
week before a Confirmed show until it's marked sent, and **Fill in the recap** the day after a Played show
with no recap (for two weeks). Cancelled, past and not-played shows give no reminders.

### Rollout, This week and what worked

- **Release rollout.** The release checklist now runs from 8 weeks before release day to 30 days after: first
  teaser, pre-save push, a follow-up round with blogs and curators, setting up the video premiere, a
  behind-the-scenes post, thanking supporters, a second playlist pitch round, fan reposts and a release recap.
  Some tick themselves (a posted post for the song, answered pitches, a YouTube link, a pitch sent after release).
  On a song's **Release** tab, **Rollout by week** shows the steps week by week with progress, and the
  current week is outlined. Songs made before this get an **Add N newer rollout steps** button (steps whose
  date has already passed are left out). Once a song is marked Released, its run-up is skipped and an
  after-release step stays on Home's Overdue list for one week only; after that it shows as *missed* on
  the Rollout view instead.
- **EP and album rollout.** An EP or album with songs on it gets its own plan on its page (tracklist,
  singles first, cover, upload, announcement, pre-save, press, track-by-track posts, release day, listening
  party, first-week check, recap), counted from the release date. Open steps show on the Calendar and Home.
  Each track keeps its own checklist, listed underneath.
- **Home → This week.** What to post (with the type of post that has done best so far and how many posts
  that rests on), who to contact (follow-ups, pitches, press steps), shows and deadlines, anything late,
  and one *Do this first* line. Move between weeks, print it with **Export PDF**, or see every artist with
  **All artists**. It only uses what is in Band Manager and does not update by itself. Fans, contacts and
  band members never go into the PDF.
- **What worked.** Content → *What works best* can compare by **Song** and **Hashtag** (taken from a post's
  title, hook or idea; a post with several hashtags counts once in each). **Best this month** lists the best post,
  type, song and hashtag from this month's posts with stats, always with how many posts it is based on.
  Home's *What works* card shows the same.

## How it's laid out

The rail on the left has one **Start** tab for ideas, then a tab for each kind of thing you build:

| Tab | What's in it |
|---|---|
| **Start** | Stacked, collapsible sections: *Suggested for you* (ideas from your lyrics and three ready-made edits), *Templates and themes*, *My templates*, *Project file and earlier projects*, and links to the full-screen *Inspiration* and *Carousel* pages (and the drum converter) |
| **Video** | My clips (upload and arrange), Stock video, From your YouTube channel, Video layers |
| **Audio** | Song and your own audio (beats, hook, voice-over, clip sound), Sound effects (Your sounds: your clips, the free pack and built-ins, starred, renamed and tagged; Freesound; Openverse; Add your own sounds) |
| **Lyrics** | Lines, sync, display and style; select a line for its own look |
| **Visualizer** | Visualizer layers and all 21 styles, including polyrhythm and polymeter |
| **Guitar Pro** | Guitar, bass and drum layers, and a button that opens the Tab Studio workspace |
| **Text**, **End card**, **Look**, **Export** | As before; Look also has the pop-up tips switch. Text has **Your fonts**: upload TTF, OTF, WOFF or WOFF2 files (saved in this browser), see each one in a sample, **Use everywhere** (lyrics, every text, the end card) or delete it (anything using it switches back to Bebas Neue). Every font menu also has an **Add a font** button that uploads one and picks it right away |

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
Band Manager doesn't download other channels' videos.

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

**Captions** (Text tab)
- Words on the video for people watching with the sound off: **Import .srt / .vtt** (formatting tags and
  cue settings are dropped), or **Captions from the lyrics** (each lyric line that plays, in time; the lyric
  line is then hidden so it doesn't show twice). They're on-screen texts on the Text row, so you can drag,
  trim and edit them, and they burn into the export.
- Five styles for all of them at once: Bold pop, Word by word, Boxed, Highlight, Film subtitle. They sit low
  in the app layout's clear area. **Shift all** by ±0.1 or ±1 s.
- **Download .srt / .vtt** (Text tab, or next to the exported video): the lyrics that play and the captions,
  timed to the video, to upload as closed captions on YouTube, Facebook or LinkedIn. TikTok and Instagram
  make their own auto captions in the app.

**Lyrics**
- Paste lyrics, then **tap-sync**: press Space as each line starts (and `.` to end a line early).
- Fine-tune by dragging or resizing lyric blocks on the timeline, editing times in the list, or
  "start/end at playhead". Shift all lines by ±0.1/0.5 s.
- Import/export `.lrc` files.
- **Filled in for the song you pick.** Choosing the song (Audio tab, or *Use as song*) fills the Lyrics tab:
  - from the song in Songs & releases (matched by its song file or its title), with nothing sent anywhere;
  - else timed lyrics from [LRCLIB](https://lrclib.net), a free open lyrics database: lines arrive already
    in time with the song. Only the title, artist and length are sent. A song in your Covers list is looked
    up under its original artist. An unreleased song of yours is never looked up by itself.
  - Lyrics you typed or pasted are never replaced by picking a song; ones filled in for another song are.
  - The Lyrics tab's **Lyrics for this song** box says where they came from, has *Use the lyrics from
    “…”* and *Find timed lyrics online*, and switches for both automatic steps.
- Lyric times are stored in *song time*, so choosing a different section of the song keeps them in sync.
- **Timing kept on the song.** When the edit is one of your songs (picked in the Audio tab, *Make a promo*,
  a song template or Spotify Canvas), its line times are saved on the song in Songs & releases by
  themselves after a tap-sync, timed lyrics from LRCLIB, an imported `.lrc`, a shift, a time typed in the
  list or a dragged lyric block. *Save timing to the song* on the Lyrics tab does it by hand.
  - Every later edit of that song starts with the saved timing, before the song's plain lyrics (2.5 s a
    line) and before any LRCLIB lookup.
  - An automatic save never overwrites a *different* timing the song already has (saved from another edit
    or imported in the Manager): the Lyrics tab says so and offers *Replace the song's timing*.
  - If the song's lyrics are edited after they were timed, both the studio and the Manager say
    "Lyrics changed since they were timed": *Re-time with the new lyrics* (each line keeps its old line's
    time, then tap-sync) or *Keep the timing*.
  - The song's **Lyrics** tab in the Manager shows *Timed (n lines, saved date)* and how it was timed, with
    *Export .lrc*, *Export .srt*, *Import .lrc* and *Clear timing*. Backups carry it.
  - Only the lines are kept (`song.lyricTiming = { lines: [{ t, end?, text }], offset, source, savedAt,
    songLength?, lyricsKey? }`), so it stays small. It's separate from the music video's sync point.
  - Saving from the studio works for the open artist's songs; for another artist's song, open that artist
    in the Manager first.
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
- **Video sound on the timeline:** each video clip shows its own sound as a gold waveform along the bottom
  of its block (read in the background the first time it's shown). A video with no sound track says
  "no sound".
- **Sound sync** (in a video clip's settings): the song (green) over the video's own sound (gold), 3 s
  either side of the playhead. Drag sideways to slide the video against the song, or nudge it by
  ±0.5 s, ±0.1 s or one frame; this changes where in the file the clip plays from. **Line it up by
  listening** compares the two sounds and sets it for you (1× speed only), and you can switch on the
  video's own sound to check by ear. For the song's music video, **Save as the music video sync** stores
  where the song starts in it, which templates and section exports use.

**End card / call to action**
- Cover art with blurred-cover, color or dimmed-video background, title, artist, CTA pill,
  streaming platform badges, small text. Entrances: rise, zoom, spin, drop & bounce, card flip,
  vinyl slides out, glitch.
- **Your songs and their files only.** The Audio tab's song menu lists your songs from Songs & releases
  that have a song file, by title; picking one also links the edit to that song. Then the Visualizer's
  *Reacts to* (the song, then that song's stems by part), a drum chart's stem (drums and percussion first)
  and the Guitar Pro pickers list only that song's files from its Files tab. *Upload stems* there adds them
  to the song's Files tab too. Anything already picked stays in its menu, marked when it isn't the song's;
  an edit that isn't linked to one of your songs keeps the full lists. Any other audio file can still be
  the song with *Use as song* in the media library.
- The **Cover art** menu lists only the covers of your songs, EPs and albums in Songs & releases (an EP's
  or album's cover names the songs on it), the song in the edit first, not every picture in the library.
  A cover set another way (Spotify's *Get info*, *Cover art* on a library picture) stays in the menu,
  marked as not a song's cover.
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
- **Tab Studio** (the fourth workspace in the top bar, full width with no rail, timeline or inspector; every
  “Open / Edit / Send to Tab Studio” button, in the Video Studio and the Manager, switches to it, and an old
  saved Video Studio tab of `tabstudio` opens it once): open any Guitar Pro
  file from your media, or start a new tab. All tracks (guitar, bass, 7-string, 5-string, drums) are
  stacked and scroll together.
  - Keyboard editing: arrows move, digits type frets (two quickly for 10–24), + / − change length,
    `.` dots, R rests, I inserts a beat. Techniques: H hammer-on, S slide, B bend, V vibrato, P palm mute,
    X dead note, G ghost.
  - Drum rows you click or press Enter on, tunings (drop D, drop C, 7-string, 5-string bass…), tempo
    changes, time signatures, add and delete bars, undo, and playback with a simple synth.
  - Save writes a new Guitar Pro 7 file into your media. “Save & use in video” also points the video's
    tab and drum layers at it (that adds to the Video Studio edit; switch back with the **Video Studio** button and
  press Ctrl+Z there to undo it).
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
- **Spotify Canvas (Start → Templates and themes, or Spotify Canvas on a song's page in the Manager):** the
  3–8 second vertical loop that plays behind a track in Spotify's Now Playing view. Pick a loop length, then
  one of 7 templates that build the loop from your first clips, or the song's cover art:
  - Seamless loops, where the end blends back into the opening frame: **Seamless loop**, **Super 8 memory**,
    **Neon city**, **Performance montage** (up to four shots, about two seconds each, soft crossfades).
  - Rebound loops (zoom out and back, so a still loops perfectly): **Cover art, alive**, **Black and white**.
  - Hard cut: **Slow push**.
  - Each switches the Format to Spotify Canvas (608×1080: Spotify takes 720–1080 px tall), turns the end
    card and text off, hides lyrics (kept), loops playback and previews Spotify's Now Playing view, with the
    area its title and controls cover.
  - A checklist flags what breaks Spotify's rules (length, size, end card, text, lyrics, fast cuts,
    flashing, a logo, a fade from black that blinks every loop). **Back to my edit** puts the format,
    length, clips and end card back.
  - The export is silent (Spotify plays the track) and named `…-spotify-canvas.mp4`. Spotify needs MP4,
    so export from Chrome or Edge. Upload it in Spotify for Artists → Music → your track → Add Canvas.
- **From your song's files** (top of Templates and themes), made from the song in the edit and its Files tab in
  Songs & releases, each ending on the song's end card (title, artist, cover, OUT NOW or a countdown):
  - **Rhythm game:** up to three highways (guitar, drums, bass), from its Guitar Pro tabs, a MIDI file named
    after the song, or its stems, best source first; 30 s from the loudest part; the song's title and artist
    up top like the game shows them; the music video dimmed behind them, or the rock arena; every highway
    auto-synced to the song.
  - **Music video + lyrics:** the 15 s hook over the same moment of the music video (using where the song
    starts in it), cinematic grade, lyrics on top.
  - **Raw footage + lyrics:** the footage cut on the beat over the hook, lyrics on top.
  - Each card says what it will use, or what the song still needs. Lyrics come from the edit, else the song's
    own (instrumentals get none). Layers they don't use are hidden, not deleted.
- **App layouts:** TikTok, Instagram Reels, YouTube Shorts, "works on all three" and full frame. A layout
  moves lyrics, text, logo, progress bar and the end card into that app's clear area; templates keep it.
- **Sound effects (Audio tab):** one list, **Your sounds**, holds everything you have: your own clips, the
  362-sound free CC0 pack and 12 effects generated in the browser (riser, impact, sub drop, whoosh, reverse
  cymbal, clap, record scratch, record stop, glitch, heartbeat, camera shutter, vinyl crackle). Search by
  name or tag, filter by **All / Mine / Free pack / Built-in**, **★ Starred** or a tag chip, preview, and add
  to the timeline at the playhead. Any sound can be starred, renamed and tagged with the rename button (your
  own clips keep the edits on the clip; pack and built-in sounds keep them in this browser, with *Back to the
  original*). Below it: a direct [Freesound](https://freesound.org) search (free API key; CC0 or CC0 + CC BY,
  never non-commercial; filter by length and sort) and a keyless search of CC sounds through
  [Openverse](https://openverse.org); either result can be saved into Your sounds.
- **Add your own sounds** (bottom of the Audio tab's sound effects): add clips in bulk (pick many files, a
  whole folder, or drag files and folders in). Folder and file names become tags. They are stored in this
  browser (IndexedDB) and kept for every project. The app asks the browser to protect them from automatic
  clean-up; they stay on this device and are removed if you clear the site's data.
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
- **Drum chart:** from a Guitar Pro drum track, a **MIDI file** (.mid), or detected from a drum stem audio file
  (kick, snare, hi-hat). A MIDI file is read with the drum map it was written for (General MIDI, Superior
  Drummer 3, EZdrummer, Addictive Drums 2, GetGood Drums, SSD5, BFD, Roland TD, Alesis… 160 in all), so
  every note lands on the right drum; the best fits for its notes are suggested. Every style charts the whole kit: kick, snare, hi-hat, high tom, mid tom, floor tom, crash 1,
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
- **MIDI notes** (Visualizer and Guitar Pro tabs): any MIDI part (keys, synths, bass, guitar, strings, a
  melody) in time with the song, as a **piano roll** past a playhead, **falling keys** onto a keyboard that
  lights up, or **note bursts** placed by pitch. Pick the tracks, colours by track, by note or one colour,
  glow and placement. Dropping a .mid file in adds its drums as a drum chart and its other parts as MIDI notes.
- **Auto-sync to the song:** every Guitar Pro tab, drum chart (Guitar Pro, MIDI or stem), MIDI notes layer
  and visualizer driven by a stem has **Auto-sync to the song** under *Sync with the song*, and each tab has
  *Auto-sync every layer here*. It listens: the song and the stem (or the chart's notes) become onset
  curves, cross-correlated with an FFT, so it finds where the part starts and, for a chart, its tempo (the
  file's, the song's detected BPM, and up to 3% either side). It says how sure the match is; undo puts it
  back, and the manual nudges and *Put bar at the playhead* still work.
- **Rhythm game** (Guitar Pro tab): a Guitar Hero / Rock Band style note highway "played" in time with the
  song: five coloured frets (four pads and a kick bar for drums), gems, sustains, flames on every hit, a
  score with a streak multiplier, star power stretches, note streak call-outs and a rock meter. Notes come
  from a Guitar Pro track, a MIDI track (drums read through their drum map), or a stem: a gem where each new
  sound starts, its fret from how bright it sounds. Optional **Rock arena** behind it (a lit stage over a
  crowd that jumps on the beat; also a background scene). Auto-sync lines it up. Original drawing, no game
  art or logos.
  - **Themes:** Classic, Neon (glowing ring gems, synthwave colours), Inferno (scorched board, diamond gems,
    fire), 8-bit arcade (square pixel gems, scanlines, a blocky score), Ice (frosted board, icy sparks) and
    Mono (black and white with one accent). Each sets the frets, gems, board, rails, flames, HUD font and the
    arena's light colours. With a project theme on, the board, rails and star power take its colours (a
    switch turns that off). *Use this theme on every highway* matches the others; the Rhythm game template
    card has its own theme menu.
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

  And three rhythm styles that keep time with the song (from Audio → Detect BPM, or a tempo you set),
  with or without audio (audio only adds a glow on loud moments):
  - **Polyrhythm shapes:** nested shapes (3, 4, 5, 6 sides…). A dot runs round each shape once per cycle
    and lights the corner it hits, so you see 3 against 4 against 5; the frame flashes when they all meet.
  - **Polyrhythm arcs:** a fan of half-circles over a line; each ball swings across its arc one hit faster
    than the one inside it (1 to 12), drifting apart and lining back up.
  - **Polymeter grid:** step rows of different lengths (4, 5, 7…) all moving on the same pulse, so their
    first steps drift; each row's first step is outlined when it comes round.
  Type the counts ("3, 4, 5", "3:4" or a range like "2-9") or pick a preset, and set the cycle (half a bar
  to 8 bars) or the pulse (quarters to sixteenths), beats per bar, rainbow colours and the numbers.

  They use real-world colours (amber meters, green phosphor, orange fire) unless you switch "Real-world
  colours" off to use the layer's colours; themes do that for you. Stems drive the visuals silently unless
  you switch their sound on. Analysis runs once per file, so preview and export match.

Old projects with a single guitar tab are moved into the layer list automatically.

## Drum MIDI converter

Start → *Inspiration, Tab Studio, Carousel and the drum converter* → **Drum MIDI converter** (or *Convert
drum map* on a MIDI file in the media library). Open a drum .mid, pick what it was written for (the best
fits for its notes are suggested) and what it should play on, out of 160 drum maps: drum software
(Superior Drummer 3, EZdrummer 1–3, Addictive Drums 2, GetGood Drums kits, Steven Slate Drums 5, BFD,
MixWave, Ugritone, MT Power Drum Kit, Native Instruments, Logic Drummer…), e-kits (Roland TD, Alesis,
Yamaha DTX, Simmons, EFNote…), drum machines and General MIDI / Guitar Pro / MuseScore.

- A table shows every note the file plays, its drum, how often, and where it goes: the same drum, a
  stand-in (another stroke of the same drum first, then the nearest drum: a china on a stack or crash,
  tom 4 on tom 3), or left out. Toms are spread in order when the destination has fewer, so fills still
  run down the kit.
- Options: the drum channel (channel 10, or every channel), what to do with drums the destination doesn't
  have, and with notes the source map doesn't know.
- **Download** the converted file, or add it to the media library for a drum chart. Only note numbers
  change: timing, velocities, controllers and everything else in the file stay byte for byte. Nothing is
  uploaded.
- *Look up a drum map* lists any map's notes and drums.

The drum maps are the engine tables of [remidi](https://github.com/nullcrimson/remidi) (MIT licence, see
`vendor/remidi`); the conversion is in `js/drummap.js` and `js/midi.js`.

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

**Refresh trends** (top of the page) checks what's working this fortnight and re-ranks everything:

- It searches YouTube Shorts from the last 14 days for your words (default: metalcore, post-hardcore,
  emo band), using the YouTube key saved on the Manager's Content page. TikTok and Instagram can't be
  searched from a web page, so Shorts (mostly the same videos, cross-posted) stand in. Each search word
  costs 100 of the key's 10,000 free daily units.
- Each trend card gets **🔥 Hot now**, **Rising** or **Quiet now**, with how many Shorts and channels use
  that format, their views and example videos. The hottest come first.
- **Right now on Shorts** lists the hashtags two or more channels are using (copy the top 5), and phrases
  that 3+ channels put in titles that none of the known formats cover, each with an example.
- The newest additions to Deezer's own editorial playlist for your genre (for example "Metalcore"; no key
  needed), with a button to use those bands in "bands your fans also like" and the "If you like…" hooks.
- The **Suggested edits** on the Start tab lean on the hottest format and mark it **🔥 Trending format**;
  a new refresh shows as new suggestions.
- The refresh is saved in this browser. After a week the page asks you to refresh again. Without a
  YouTube key only Deezer is read, and the page says so. The logic is in `js/trendscan.js` (unit tested).

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
- **Safe-area guide**: a dashed box in the preview (button under the preview or **G**; pick TikTok, Reels, Shorts
  or the smallest area common to all in Look) showing where text stays clear of each app's buttons. Preview only.
- **Level meter and limiter**: the bar under the preview shows the mix level (red at the top means the limiter is
  working). A limiter (−2 dB, 20:1) keeps a loud song, clip sound and effects from clipping in the preview and in
  the export; Export has a switch for it.

### Editing keys (Video Studio)

| Key | Does |
|---|---|
| Space, ← / →, Home, End | Play, step a frame (Shift = 1 s), go to the start or end |
| **S** | Split under the playhead: the selected clip, text, lyric line (its words are shared out) or extra audio block, else the main-lane clip. The song runs under the whole video and says so instead |
| **Ctrl+D** | Duplicate the selection right after itself (clip, text, lyric line, audio block, layer) |
| **Ctrl+C**, **Ctrl+V** | Copy, then paste at the playhead |
| Delete, Ctrl+Z, Ctrl+Shift+Z, G, O | Delete, undo, redo, safe-area guide, phone-app preview |

While a video exports, the panels, timeline and top bar are locked (greyed, not clickable) and these keys do
nothing, so the file can't freeze or change; the bar at the bottom has **Cancel export**.

### Keeping your work safe

- **New project** keeps the edit it replaces: **Start → Project file and earlier projects** lists the last 5, and
  Ctrl+Z straight after also brings it back. Opening a project file does the same.
- **Save project file** (Start, and Export) downloads the edit as `name.promo.json`: clips, texts, lyrics, layers
  and the song with its settings, plus the names of the media it uses, but not the media. **Open project file…**
  restores it (also on another computer); any media that isn't in that browser is listed in **Replace missing
  files**, matched by name.
- Edits are saved half a second after the last change and also when the tab is closed, reloaded or hidden, in the
  Video Studio, the Manager and the Photo Studio.
- If the browser has no room, a red banner stays up with **Download project file**, the biggest files and a link to the
  media library. Saving settings or templates no longer throws, and a media file the browser refuses to store is
  named (it works until a reload, then shows as missing). Persistent storage is requested when media is added.
- An exported video is marked **Out of date** as soon as the edit changes after it, and can't be shared until you
  export again (it can still be downloaded, labelled as the old version).

## Export

Export plays the project once in real time onto a full-resolution canvas while the browser records
it (MediaRecorder), so a 20 s video takes about 20 s. Keep the tab in front while it runs.

## Replace missing files

A file goes missing when the browser drops its storage, when you remove an item from the media library, or
when you restore a Manager backup in a browser that never had the files (a backup holds the data, not the
media). Whatever used the file still holds its id, so it shows **Missing: name** (the timeline), “Missing” on
song files and photos, and a **Replace missing files (n)** button appears:

- Video Studio: in the top bar. Manager: in the side panel (every artist), at the top of a song's **Files**
  tab (that song) and of **Photos**. Photo Studio: in the toolbar (its designs).
- It opens a dialog listing what is missing (name and folder). **Choose a folder…**, **Choose files…** or drop
  a folder or files on it.
- Each missing file is replaced by the picked file with **the same name** (case and accent form ignored). When
  several files share the name, the one in the same sub-folder wins (folders are compared from the file
  outwards, so a moved or renamed parent folder is fine). If that does not settle it, or two different missing
  files want the same picked file, nothing is guessed and the file stays missing with the reason shown.
- The file comes back under the **same media id**, so every clip, layer, song file, stem, music video and
  photo that used it works at once; duration, waveform, envelope and thumbnail are worked out again.
- A file that is not missing is never touched, nothing is deleted, and picked files that match nothing are
  left alone. A summary (and a toast) says what was replaced and what is still missing, by name. A picked file
  of another kind than the one it replaces (an image named like a video) is refused.

How it knows the names: `js/media.js` keeps a small index (`pvm.mediaNames.v1` in localStorage: id → name,
relative folder path, kind) that is written whenever media is added and never shrinks when media is removed.
A Manager **Back up** carries the names of the media it uses (`mediaNames`), and **Restore** merges them in, so
a backup opened elsewhere can still ask for the right files. Media lost before this version, and files whose
name was never saved, are listed as “a file whose name was not saved” and cannot be matched.
Limit: if a record exists in IndexedDB but could not be opened, it counts as missing and a replacement
overwrites it. Matching is in `js/mediamatch.js` (unit tested); the dialog is `js/relink.js`.

## Smart photo search

On **Manager → Photos**, the search box also finds photos by what is in them. Type "drums", "crowd" or "singer on
stage" and you get the photos whose caption, photographer, tags or file name match first, as before and at once.
After them come the photos that **look like** the words, best first, each with a "looks like" badge and a match bar.
The search covers the same photos as a word search: every folder, narrowed by a tag, Starred or Press kit filter.

- **Set up smart search** asks before the one-time 23 MB download of the picture model (TinyCLIP, MIT licence,
  from huggingface.co). Find a moment in the Video Studio uses the same model, so a model you already have is reused
  with no prompt. No photo or search words leave the computer.
- Each photo is looked at once, from a small copy (224 px), one at a time in the background, with a progress line
  ("Indexing photos 120/600"), **Pause** and **Stop**. You can keep using the page while it runs. New photos are
  looked at when they are added, and photos already done are skipped, even after a reload.
- The **Smart search** switch turns it off; the search is then words only. **Clear photo index** deletes what was
  learned (the photos are not touched), and **Index now** starts again.
- Limit: TinyCLIP 8M is a small model. Broad things (drums, crowd, stage lights) work better than detail, and some
  matches will be loose. A photo only counts as a match when its score stands out from the rest; when nothing stands
  out, none are shown.

Details: `docs/ai-search.md`.

## Tests

```bash
npm test   # unit tests for timing, LRC, tap-sync, hook/beat detection, beat-cut plans
```

## Code layout

| File | Purpose |
|---|---|
| `js/core.js` | Pure logic: time math, lyrics/LRC, tap-sync, audio analysis (unit tested) |
| `js/state.js` | Project model, undo/redo store, persistence |
| `js/media.js` | Media library, element creation, waveform/energy analysis, the name index and `restoreMissing` |
| `js/mediamatch.js` | Finding missing media: which ids data points at, the name index, matching picked files by name and folder (unit tested) |
| `js/relink.js` | The Replace missing files notice, button and dialog |
| `js/renderer.js` | Draws a frame (video, transitions, effects, text, lyrics, end card) to a canvas |
| `js/overlays.js` | Phantom TikTok / Reels / Shorts UI for the preview |
| `js/templates.js` | App layouts and song templates |
| `js/canvas.js` | Spotify Canvas loop templates, going back to the edit, and the checks against Spotify's rules (unit tested) |
| `js/sfx.js` | Built-in synthesized sound effects and Openverse sound search |
| `js/freesound.js` | Freesound API search |
| `js/soundlib.js` | Personal sound library stored in IndexedDB |
| `js/soundindex.js` | The combined sound list: your clips, the pack and built-ins as one list, renames, tags, stars and filters (unit tested) |
| `js/tab.js` | Guitar Pro tab parsing (via alphaTab), timing and drawing |
| `js/drums.js` | Drum chart: GP drum tracks, MIDI drums, drum-stem hit detection, lanes / highway / circle drawing |
| `js/midi.js` | MIDI files: notes, tempo map, bars, and rewriting drum notes in place (unit tested) |
| `js/drummap.js`, `js/drummaps-data.js` | 160 drum maps, stand-ins, converting drum MIDI between them (unit tested) |
| `js/midiviz.js` | MIDI notes layer: piano roll, falling keys, note bursts |
| `js/page-drumconvert.js` | The Drum MIDI converter page |
| `js/autosync.js`, `js/layersync.js` | Auto-sync of stems and charts to the song (FFT cross-correlation, unit tested) |
| `js/clipsync.js` | Lining a video clip's own sound up with the song (sync point maths, unit tested) |
| `js/subtitles.js` | Captions: .srt/.vtt in and out, caption styles, the lyrics and captions as cues in video time (unit tested) |
| `js/rhythmgame.js`, `js/gamechart.js` | Rhythm game layer: charts from tabs, MIDI or stems, drawing, themes (unit tested) |
| `js/songtemplates.js` | Templates from a song's files: rhythm game, music video + lyrics, raw footage + lyrics (unit tested) |
| `js/lyricsfetch.js` | Lyrics for the chosen song: Songs & releases or LRCLIB, LRC parsing (unit tested) |
| `js/manager/lyrictiming.js` | Lyric timing kept on the song: normalize, save rules, stale check, .lrc/.srt (unit tested) |
| `js/drumkit.js` | The drum kit's layout (single or double bass), the Stage and metal finishes, shell wraps and effects (unit tested) |
| `js/viz.js` | Audio visualizers: FFT analysis and the styles |
| `js/vizreal.js` | Realistic visualizers: VU meters, LED rack, oscilloscope, speaker, fire, spectrogram |
| `js/vizgear.js` | More realistic visualizers: tape reels, mixing desk, lightning, vibrating strings |
| `js/vizpoly.js` | Polyrhythm shapes and arcs and the polymeter grid, locked to the song's tempo (timing unit tested) |
| `js/postcheck.js`, `js/panel-postcheck.js` | Post check score and pop-over |
| `js/tips.js`, `js/panel-tips.js` | Pop-up editing tips |
| `js/lyricideas.js` | Theme, visualizer, display and line-look ideas from the lyrics |
| `js/mytemplates.js` | Save, apply, export and import your own templates |
| `js/soundpack.js`, `sounds/pack/` | The bundled CC0 sound pack and its search |
| `js/manager/shell.js` | The Manager workspace: nav, artist switcher, store, backup and restore |
| `js/manager/isrc.js` | ISRC → links: MusicBrainz, Deezer (JSONP in a sandboxed iframe), Spotify, iTunes and YouTube lookups, matching and search links (unit tested) |
| `js/manager/page-links.js` | The song's Links section with the ISRC lookup |
| `js/manager/covers.js` | Cover songs played live, adding one from a setlist line, and what setlists are timed from (unit tested) |
| `js/manager/files.js` | A song's stems (parts, names, grouping, order), music video and its status, raw footage, stem part guessing, the Video Studio list (unit tested) |
| `js/manager/page-files.js` | The song's Files tab |
| `js/manager/photos.js` | An artist's photos: adding, filters, tags, the press kit's four photos and credits (unit tested) |
| `js/manager/page-photos.js` | The Photos page |
| `js/ai/panel-photosearch.js` | Smart photo search on the Photos page: the switch, the indexing bar and the "looks like" badge |
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
| `js/manager/showplan.js` | The run of show, setlist timings, stage plot drawing, input list and monitor mixes (unit tested) |
| `js/manager/planner-stage.js` | The Show plan and Stage plot tabs |
| `js/manager/tours.js` | Tours: stops, distances, money, OpenStreetMap and setlist.fm results, tour sheet (unit tested) |
| `js/manager/pdf.js`, `docs.js` | Export PDF (print from a hidden frame) and the printable show sheet, money and calendar |
| `js/gdrive.js` | Google Drive: sign-in, Google's file picker, downloads and the setup steps |
| `js/themes.js` | The six dark themes and how they restyle a project |
| `js/linestyle.js` | Per-line lyric looks (presets and overrides) |
| `js/panel-layers.js` | Layers panel |
| `js/share.js` | Share sheet and YouTube upload |
| `vendor/alphatab/` | alphaTab 1.9.0 parser (MPL-2.0), loaded only when a tab is used |
| `js/engine.js` | Playback clock, media sync, Web Audio mix, export |
| `js/timeline.js` | Multi-track timeline UI |
| `js/panels.js` | Tool panels and inspector |
| `js/stock.js` | Pexels / Pixabay / Wikimedia search and download |
| `js/app.js` | Layout, wiring, shortcuts, the four workspaces, save banner and export lock |
| `js/studioedit.js` | Pure editing helpers: split, duplicate, copy and paste of timeline items, safe areas, level maths (unit tested) |
| `js/projectfile.js` | Project files and the earlier-projects list (unit tested) |

### Mobile: Photo Studio

On a phone or tablet (window up to 1100px wide) the Photo Studio puts the canvas first and moves the side panels into a sheet above a bottom toolbar: Add, Layers, Style, Templates, Export. Undo and redo stay at the top. Buttons over the canvas replace the keyboard actions (style, edit text, crop, duplicate, forward, back, lock, delete). One finger moves a layer, pulls a handle or turns the knob; two fingers pinch to zoom the view and pan; double-tap text to edit it. While cropping, one finger slides the photo inside its frame and a pinch zooms it. Layers reorder with the grip on each row. Photos far bigger than the screen are drawn from a smaller copy while editing; exports use the original. Code: `js/photo/gesture.js` (touch maths, unit tested in `test/photo-touch.test.js`) and `css/mobile-photo.css`.
