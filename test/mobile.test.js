import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutMode, compactBar, pinchZoom, pinchScroll, edgeZone, scrubToTime, exportAdvice, downloadWarning } from '../js/mobilelogic.js';

test('layoutMode picks the layout from the window', () => {
  assert.equal(layoutMode(390, 844), 'phone');
  assert.equal(layoutMode(844, 390), 'land');
  assert.equal(layoutMode(820, 1180), 'tablet');
  assert.equal(layoutMode(1180, 820, true), 'tablet');
  assert.equal(layoutMode(1180, 820, false), 'desktop');
  assert.equal(layoutMode(1366, 768, true), 'desktop');
  assert.equal(layoutMode(1500, 950), 'desktop');
  assert.equal(layoutMode(1024, 768), 'tablet');
});

test('compactBar only collapses small windows', () => {
  assert.ok(compactBar('phone', 390) && compactBar('land', 844) && compactBar('tablet', 820));
  assert.ok(!compactBar('tablet', 1024) && !compactBar('desktop', 1500));
});

test('pinchZoom scales by finger spread and clamps', () => {
  assert.equal(pinchZoom(40, 100, 200), 80);
  assert.equal(pinchZoom(40, 100, 50), 20);
  assert.equal(pinchZoom(40, 100, 1000), 300);
  assert.equal(pinchZoom(40, 100, 1), 10);
  assert.equal(pinchZoom(40, 0, 100), 40, 'fingers that start on top of each other change nothing');
  assert.equal(pinchScroll(5, 80, 100), 300);
  assert.equal(pinchScroll(0.5, 10, 100), 0);
});

test('edgeZone: only a selected block trims, with a 44 px target across the edge', () => {
  assert.equal(edgeZone(100, 400, 110, false), null);
  assert.equal(edgeZone(100, 400, 110, true), 'l');
  assert.equal(edgeZone(100, 400, 390, true), 'r');
  assert.equal(edgeZone(100, 400, 250, true), null);
  // a 30 px block: the zone shrinks to a third on each side, the middle moves it
  assert.equal(edgeZone(100, 130, 104, true), 'l');
  assert.equal(edgeZone(100, 130, 126, true), 'r');
  assert.equal(edgeZone(100, 130, 115, true), null);
});

test('scrubToTime maps the slider to seconds', () => {
  assert.equal(scrubToTime(500, 1000, 12), 6);
  assert.equal(scrubToTime(2000, 1000, 12), 12);
  assert.equal(scrubToTime(5, 0, 12), 0);
});

test('exportAdvice is honest about format and the phone', () => {
  const ios = exportAdvice({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', mp4: true, webm: false, touch: true, seconds: 20 });
  assert.equal(ios.format, 'MP4');
  assert.ok(ios.ios && ios.phone);
  assert.ok(ios.lines.some((l) => /screen on/.test(l)) && ios.lines.some((l) => /Safari/.test(l)));
  const droid = exportAdvice({ ua: 'Android Chrome', mp4: false, webm: true, touch: true, seconds: 20 });
  assert.equal(droid.format, 'WebM');
  assert.ok(droid.lines[0].includes('may not take WebM'));
  const desk = exportAdvice({ ua: 'X11 Firefox', mp4: false, webm: true, touch: false, seconds: 20 });
  assert.ok(!desk.lines.some((l) => /screen on/.test(l)));
  assert.match(desk.lines[1], /20 seconds/);
  const none = exportAdvice({ ua: '', mp4: false, webm: false, touch: true, seconds: 5 });
  assert.equal(none.format, null);
  assert.match(none.lines[0], /cannot export/);
  assert.match(exportAdvice({ ua: '', mp4: true, webm: false, touch: true, seconds: 120 }).lines[1], /minutes/);
});

test('downloadWarning speaks up on slow links, Data Saver and phones', () => {
  assert.equal(downloadWarning(77, { effectiveType: '4g', touch: false }), '');
  assert.match(downloadWarning(77, { effectiveType: '3g' }), /slow or limited/);
  assert.match(downloadWarning(77, { saveData: true }), /Data Saver/);
  assert.match(downloadWarning(77, { touch: true }), /Wi-Fi/);
  assert.equal(downloadWarning(5, { touch: true }), '');
});
