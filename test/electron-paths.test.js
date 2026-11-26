// The Mac app's dialog start folders: app.getPath only knows Electron's own names and throws for any other
// ("Failed to get 'movies' path" on Marty's Mac), so the save and folder dialogs must never ask for one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { defaultVideoDir } = require('../electron/paths.cjs');
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

// Electron's app.getPath names (https://www.electronjs.org/docs/latest/api/app#appgetpathname)
const VALID = ['home', 'appData', 'userData', 'sessionData', 'temp', 'exe', 'module', 'desktop', 'documents', 'downloads', 'music', 'pictures', 'videos', 'recent', 'logs', 'crashDumps'];
const fakeApp = (paths) => ({
  getPath(name) {
    if (!VALID.includes(name)) throw new Error(`Failed to get '${name}' path`);
    if (!(name in paths)) throw new Error(`Failed to get '${name}' path`);
    return paths[name];
  },
});

test('dialog start folder: Movies (videos), else Downloads, else home, else none, and never throws', () => {
  assert.equal(defaultVideoDir(fakeApp({ videos: '/Users/m/Movies', downloads: '/Users/m/Downloads', home: '/Users/m' })), '/Users/m/Movies');
  assert.equal(defaultVideoDir(fakeApp({ downloads: '/Users/m/Downloads', home: '/Users/m' })), '/Users/m/Downloads');
  assert.equal(defaultVideoDir(fakeApp({ home: '/Users/m' })), '/Users/m');
  assert.equal(defaultVideoDir(fakeApp({})), undefined);
});

test('every literal app.getPath / app.setPath name in electron/ is one Electron knows', () => {
  const dir = join(ROOT, 'electron');
  const used = [];
  for (const f of readdirSync(dir).filter((n) => /\.c?js$/.test(n))) {
    const src = readFileSync(join(dir, f), 'utf8');
    for (const m of src.matchAll(/\b(?:get|set)Path\(\s*['"`]([^'"`]+)['"`]/g)) used.push(`${f}:${m[1]}`);
    for (const m of src.matchAll(/\[\s*((?:['"][A-Za-z]+['"]\s*,?\s*)+)\]\s*\)\s*\{[^}]*getPath\(name\)/g)) for (const n of m[1].match(/[A-Za-z]+/g)) used.push(`${f}:${n}`);
  }
  assert.ok(used.length >= 4, used.join());
  for (const u of used) assert.ok(VALID.includes(u.split(':')[1]), `unknown app.getPath name ${u}`);
  assert.ok(used.includes('paths.cjs:videos'), used.join());
});
