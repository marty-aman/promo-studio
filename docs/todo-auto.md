# To-dos that tick themselves

Some standard to-dos on a song's release checklist and on a show's to-do list are marked done on their own
when the song or show already holds what the task asks for. For example, "Cover art final" is done as soon as
the song (or the EP or album it is on) has its cover art attached.

The code is in `js/manager/todoauto.js`. It uses pure functions with unit tests in `test/todoauto.test.js`.

## What you see

- The task is ticked and struck through. A line under it says **Done automatically: <reason>**.
- It counts in the checklist total ("Release checklist · 5/22"), in Home's Next release bar, and on the song cards.
- It is not listed in Home's Overdue list, in the next-two-weeks agenda, on the Calendar or in the .ics export.
- **Untick it to mark it not done.** The app remembers this for that one task (`autoOff: true` on the task).
  The line then reads "Marked not done by you" and has a **Let it tick itself again** link.
- Ticking a task by hand works as before (`done: true`), and a hand tick holds even if the file is removed later.

## Rules

Detection only reads data. It never writes to the song, the show or the task. Only your own ticks and untick
overrides are saved. A file counts only while it is in the media library. A cover, poster, song file, video or
clip whose file is missing (see Replace missing files) does not tick anything. Until the library has loaded at
startup, every file counts as present, which matches how Replace missing files treats that moment.

A rule matches the standard task's exact text. A task you renamed or added yourself stays manual.
"Put back the standard checklist" brings the standard tasks back.

### Release checklist

| Task | Done automatically when |
|---|---|
| Final mix and master approved | the song file is attached and the song's status is Ready to release or Released |
| Cover art final (3000 × 3000 px) | the song has cover art, or its EP or album does |
| Register the song with your PRO … and note the ISRC | a valid ISRC is entered |
| Upload to your distributor with the release date | a valid UPC is on the song or its release, or a streaming link is filled in |
| Plan the music video and short-form shoot (Shoot tab) | the music video's status is Planned or later, or a shoot date is set |
| Film 20–30 short clips in one session | Raw footage holds 20 or more files that are in the library |
| Music video edit locked | the music video file is attached, or the video's status is Complete or Released |
| Add the song to your press kit (EPK) | the song has a release date (the press kit lists every song with one) |
| Premiere the music video | the music video's status is Released |

### Show to-do list

| To-do | Done automatically when |
|---|---|
| Pitch the venue and hold the date | the show is Pitched, On hold, Confirmed or Played |
| Confirm the lineup and the deal in writing | the show is Confirmed or Played and the deal is filled in |
| Flyer / poster made (all bands tagged) | a poster is attached |

### Left manual

The app holds nothing that shows these were done: the Spotify editorial pitch, the pre-save link, pitching blogs
and curators, announcing and revealing the cover, the teaser, countdown and "out tomorrow" posts, the release-day
and thank-you posts, sending the live link to curators, the first-week and content reviews, the lyric or live
version, the ticket link and announcement, advancing the show, show day, and settling up.

Tab, stems, lyrics, lyric timing, sections and length have no matching task on the standard lists, so nothing
ticks from them.

## Old saves

Nothing changes when an old save loads. Tasks have no `autoOff` until you untick an automatic one, and saves
from before this change load as they are.
