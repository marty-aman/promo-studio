// Where the save and folder dialogs start. Plain Node (unit-tested with a fake app).
'use strict';

/**
 * The person's Movies folder (Electron calls it 'videos'; there is no 'movies' name and app.getPath throws for
 * unknown names), else Downloads, else home. Never throws: undefined means "let the dialog pick its own start".
 */
function defaultVideoDir(app) {
  for (const name of ['videos', 'downloads', 'home']) {
    try {
      const p = app.getPath(name);
      if (p) return p;
    } catch {}
  }
  return undefined;
}

module.exports = { defaultVideoDir };
