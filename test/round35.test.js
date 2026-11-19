// Photo folders, paging, and the stage plot's gear drawings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newFolder, normalizeFolders, subfolders, folderPath, folderTree, photosIn, deleteFolder, movePhotos, moveFolder, paginate, loadPageSize, savePageSize, PAGE_SIZES, addPhotos, normalizePhotos } from '../js/manager/photos.js';
import { normalizeManager } from '../js/manager/model.js';
import { ARTIST_KEYS } from '../js/manager/artists.js';
import { drawGear, GEAR_DEFS } from '../js/manager/stagegear.js';
import { STAGE_GEAR, newStage, stagePlotSVG, stagePlotHTML } from '../js/manager/showplan.js';

const tree = () => {
  const live = { ...newFolder('Live'), id: 'live' };
  const s26 = { ...newFolder('2026', 'live'), id: 's26' };
  const press = { ...newFolder('Press'), id: 'press' };
  return [live, s26, press];
};

test('folders: nesting, paths and cleaning', () => {
  const f = tree();
  assert.deepEqual(subfolders(f).map((x) => x.name), ['Live', 'Press']);
  assert.deepEqual(subfolders(f, 'live').map((x) => x.id), ['s26']);
  assert.deepEqual(folderPath(f, 's26').map((x) => x.name), ['Live', '2026']);
  assert.deepEqual(folderPath(f, ''), []);
  assert.deepEqual([...folderTree(f, 'live')].sort(), ['live', 's26']);
  assert.equal(newFolder('  ').name, 'New folder');
  const clean = normalizeFolders([{ id: 'a', name: 'A', parent: 'b' }, { id: 'b', name: 'B', parent: 'a' }, { id: 'c', parent: 'gone' }, { name: 'no id' }, null]);
  assert.equal(clean.length, 3);
  assert.equal(clean.find((x) => x.id === 'c').parent, '');
  // a loop is broken so every folder can be reached from the top
  assert.ok(clean.filter((x) => x.id !== 'c').some((x) => x.parent === ''));
});

test('folders: photos in them, moving, deleting', () => {
  const m = { photos: normalizePhotos([{ id: 'p1', mediaId: 'a', folder: 'live' }, { id: 'p2', mediaId: 'b', folder: 's26' }, { id: 'p3', mediaId: 'c' }]), photoFolders: tree() };
  assert.deepEqual(photosIn(m.photos, m.photoFolders, '').map((p) => p.id), ['p3']);
  assert.deepEqual(photosIn(m.photos, m.photoFolders, 'live').map((p) => p.id), ['p1']);
  assert.deepEqual(photosIn(m.photos, m.photoFolders, 'live', { deep: true }).map((p) => p.id), ['p1', 'p2']);
  assert.equal(photosIn(m.photos, m.photoFolders, '', { deep: true }).length, 3);
  assert.equal(movePhotos(m, ['p3', 'p1'], 'press'), 2);
  assert.equal(movePhotos(m, ['p3'], 'press'), 0);
  assert.ok(!moveFolder(m, 'live', 's26')); // not into its own folder
  assert.ok(moveFolder(m, 'press', 'live'));
  assert.equal(m.photoFolders.find((x) => x.id === 'press').parent, 'live');
  // deleting Live moves its photos and folders up to the top
  m.photos.find((p) => p.id === 'p1').folder = 'live';
  assert.equal(deleteFolder(m, 'live'), 1);
  assert.equal(m.photos.find((p) => p.id === 'p1').folder, '');
  assert.equal(m.photoFolders.find((x) => x.id === 's26').parent, '');
  assert.equal(m.photoFolders.length, 2);
  // uploads go into the open folder
  addPhotos(m, [{ id: 'z' }], 1, 'press');
  assert.equal(m.photos[0].folder, 'press');
});

test('folders are saved per artist and cleaned on load', () => {
  assert.ok(ARTIST_KEYS.includes('photoFolders'));
  const m = normalizeManager({ photoFolders: [{ id: 'f1', name: 'Live' }], photos: [{ mediaId: 'a', folder: 'f1' }, { mediaId: 'b', folder: 'gone' }] });
  assert.equal(m.photoFolders.length, 1);
  assert.deepEqual(m.photos.map((p) => p.folder), ['f1', '']);
});

test('paging', () => {
  const list = Array.from({ length: 101 }, (_, i) => i);
  let p = paginate(list, 1, 48);
  assert.deepEqual([p.items.length, p.page, p.pages, p.from, p.to, p.total], [48, 1, 3, 1, 48, 101]);
  p = paginate(list, 3, 48);
  assert.deepEqual([p.items, p.from, p.to], [[96, 97, 98, 99, 100], 97, 101]);
  assert.equal(paginate(list, 99, 48).page, 3);
  assert.equal(paginate(list, 0, 48).page, 1);
  p = paginate([], 2, 24);
  assert.deepEqual([p.page, p.pages, p.from, p.to], [1, 1, 0, 0]);
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(loadPageSize(storage), 48);
  savePageSize(96, storage);
  assert.equal(loadPageSize(storage), 96);
  storage.setItem('pvm.photos.pageSize', '7');
  assert.equal(loadPageSize(storage), 48);
  assert.ok(PAGE_SIZES.includes(200));
});

test('every piece of gear has a detailed drawing and a grab box', () => {
  for (const [type, g] of Object.entries(STAGE_GEAR)) {
    const { shape, hit } = drawGear(type, g.w, g.h, 500, 300);
    assert.match(hit, /class="sp-hit"/, type);
    assert.ok(shape.length > 150, `${type} drawing is detailed`);
    assert.doesNotMatch(shape, /NaN|undefined/, type);
  }
  const drums = drawGear('drums', 180, 140, 500, 300).shape;
  assert.ok((drums.match(/url\(#spg-bronze\)/g) || []).length === 3, 'three cymbals');
  assert.ok((drums.match(/url\(#spg-head\)/g) || []).length >= 5, 'kick, snare and toms');
  assert.match(drawGear('guitar', 90, 50, 0, 0).shape, /spg-grille/);
  assert.equal((drawGear('bass', 90, 60, 0, 0).shape.match(/spg-cone/g) || []).length, 4);
  for (const id of ['spg-head', 'spg-chrome', 'spg-bronze', 'spg-grille', 'spg-tolex', 'spg-mesh', 'spg-carpet', 'spg-floor']) assert.match(GEAR_DEFS, new RegExp(`id="${id}"`));
  const svg = stagePlotSVG(newStage('five'));
  assert.match(svg, /<defs>/);
  assert.ok((svg.match(/class="sp-item/g) || []).length === newStage('five').items.length);
  assert.match(stagePlotHTML(newStage('four'), { name: 'Arc Flash' }), /spg-bronze/);
});
