# Extending the Manager

Rules for every build that touches the Manager. The scaffold (G0) already did the shared edits, so a build should not need to touch `artists.js` lists, `model.js` internals or `app.css`.

## Rules
- **No new localStorage keys for data.** Data lives in the Manager workspace (so backup, restore, undo and artist delete cover it). Only UI prefs may have their own key, like `pvm.photos.pageSize`.
- **README:** append one `### <name>` section at the end of the Manager section. Edit no existing lines.
- Keep new logic in your own module and register it; do not edit `agenda()`, `normalizeSong` or `normalizeShow` bodies.

## A data key
`outreach`, `merch`, `fans`, `captionBank`, `availability` (per artist) and `opportunities` (shared) exist already, as arrays of objects with a string `id`. Unknown fields are kept. Write your own item normaliser in your module and call it where you read the list (`normalizeOutreach(m.outreach)`); the scaffold only guarantees "array of plain objects with an id". A genuinely new key is a scaffold change: add it to `ARTIST_KEYS` or `SHARED_KEYS` (`js/manager/artists.js`), to `newManager()` and `NEW_LISTS` (`js/manager/model.js`), and to the test in `test/manager-scaffold.test.js`.

## An agenda source
```js
import { registerAgendaSource } from './model.js';
registerAgendaSource((m, from, to, inRange) =>
  m.outreach.filter((o) => o.status !== 'done' && inRange(o.followUp))
    .map((o) => ({ date: o.followUp, kind: 'task', key: o.id, title: `Follow up: ${o.name}`, sub: 'Outreach', ref: { page: 'outreach', id: o.id } })));
```
Use `kind: 'task'` with a distinct `key`. Skip released and cancelled things. `overdueTasks()` runs the same function with `from = ''` and `to = today`, so late items come from the same code. The Home overdue list shows them as a link without a tick box.

## A song or show field
Append one line to `SONG_EXTRAS` (`js/manager/songnorm.js`) or `SHOW_EXTRAS` (`js/manager/showsnorm.js`):
```js
SONG_EXTRAS.push((s) => ({ ...s, split: Array.isArray(s.split) ? s.split : [] }));
```
Put the push in your module and import that module from the Manager shell, or add the line at the bottom of the extras file.

## A tab on an existing page
Add the tab inside that page's file and build its body in your own module. Do not change the page list in `shell.js` unless the build adds a page.

## A CSS file
Eight files are linked after `css/app.css`: `mgr-outreach`, `mgr-linkbio`, `mgr-plan`, `mgr-show`, `mgr-avail`, `mgr-merch`, `mgr-fans`, `mgr-misc`. Write only into your own; scope selectors with your own class prefix.

## Backups
`workspaceBackup(ws, mediaNames, { withoutFans: true })` (or `workspaceBackup(ws, { withoutFans: true })`) writes a backup with every artist's `fans` emptied. The workspace itself is not changed.
