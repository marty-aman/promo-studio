# Guitar Pro test files

Used by `test/gpreader.test.js` to check how Promo Studio reads Guitar Pro files.

- `*.gp3`, `*.gp4`, `*.gp5`, `*.gpx`, `*.gp` other than `metal-riffs.*` come unchanged from alphaTab's
  test data (`packages/alphatab/test-data/guitarpro3`–`guitarpro7`, commit
  639e20efd111789e029839beb6f573603f3f7c34, <https://github.com/CoderLine/alphaTab>), licensed under the
  Mozilla Public License 2.0 like the vendored alphaTab build (see `vendor/alphatab/LICENSE`).
  They were saved by Guitar Pro.
- `playback-orders.json` holds the AlphaTex bar sequences from alphaTab's
  `test/audio/MidiPlaybackController.test.ts` (same commit, MPL-2.0). alphaTab notes many of them are
  "sequences as played by Guitar Pro 8".
- `metal-riffs.gp5`, `.gp4` and `.gp3` were written for Promo Studio with PyGuitarPro 0.11 (an
  independent Guitar Pro writer). They hold a Drop C guitar, a 7-string with capo 2, a 5-string bass and
  a two-voice drum track (GP5 only), repeats ×3, first and second endings, a 7/8 bar with a tempo change,
  section markers, a Windows-1252 title with accents, and palm mutes, dead notes, ties, triplets, a grace
  note, a slide, let ring, a harmonic, a bend, vibrato and tremolo picking. PyGuitarPro read every file
  back with the same content.
