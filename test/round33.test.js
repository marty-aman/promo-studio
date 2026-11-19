// Show plan, stage plot, tours, PDF documents, SubmitHub/Groover, Google Drive helpers and the
// setlist.fm pass-through's guards.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { toMin, fromMin, toSec, fromSec, newPlan, normalizePlan, runOfShow, setTimings, showPlanHTML, newStage, normalizeStage, inputList, monitorMixes, stagePlotSVG, stagePlotHTML, newStageItem, STAGE_PRESETS } from '../js/manager/showplan.js';
import { newTour, newStop, haversineKm, tourLegs, tourMoney, parsePlaces, venueQuery, parseOSMVenues, venueFromOSM, parseSetlists, similarVenues, venueFromSetlist, fansOf, setlistSearchURL, showFromStop, tourHTML, normalizeTours } from '../js/manager/tours.js';
import { docHTML, esc } from '../js/manager/pdf.js';
import { showSheetHTML, moneyHTML, calendarHTML } from '../js/manager/docs.js';
import { PITCH_SERVICES, SUBMIT_SERVICES, submitPitch, newPitch } from '../js/manager/press.js';
import { pickerMimeTypes, isGoogleDoc, driveReady, downloadDriveFile } from '../js/gdrive.js';
import { ARTIST_KEYS } from '../js/manager/artists.js';
import * as nodeBuffer from 'node:buffer';
import { newManager, newSong, newShow, normalizeManager } from '../js/manager/model.js';

test('time helpers', () => {
  assert.equal(toMin('19:30'), 1170);
  assert.equal(toMin('nope'), null);
  assert.equal(fromMin(1170), '19:30');
  assert.equal(fromMin(1440 + 75), '01:15');
  assert.equal(toSec('3:45'), 225);
  assert.equal(toSec('4'), 240);
  assert.equal(toSec('200s'), 200);
  assert.equal(toSec(''), 0);
  assert.equal(fromSec(225), '3:45');
});

test('a show plan works out the night from doors, sets and changeovers', () => {
  const show = { ...newShow('2026-03-14'), doors: '19:00', lineup: [{ name: 'Openers' }, { name: 'Arc Flash' }, { name: 'Headliner' }], setlist: 'Static Bloom\nUndertow' };
  const plan = newPlan(show, { band: 'Arc Flash', songs: [{ title: 'Static Bloom', seconds: 210 }] });
  assert.deepEqual(plan.slots.map((s) => [s.name, s.minutes, s.changeover]), [['Openers', 30, 15], ['Arc Flash', 30, 15], ['Headliner', 45, 0]]);
  assert.equal(plan.setlist[0].length, '3:30');
  assert.equal(plan.setlist[1].length, '');
  const run = runOfShow(plan);
  const sets = run.rows.filter((r) => r.kind === 'set');
  assert.deepEqual(sets.map((r) => `${r.start}-${r.end}`), ['19:30-20:00', '20:15-20:45', '21:00-21:45']);
  assert.equal(run.rows.filter((r) => r.kind === 'changeover').length, 2);
  assert.equal(run.over, 0);
  assert.equal(run.end, '21:45');
  // a curfew before the last set ends
  assert.equal(runOfShow({ ...plan, curfew: '21:30' }).over, 15);
  // a curfew after midnight
  assert.equal(runOfShow({ ...plan, doors: '22:00', curfew: '01:00' }).over, 0);
  assert.equal(runOfShow({ ...plan, doors: '' }).rows.length, 0);
});

test('setlist timings run from our set start', () => {
  const plan = normalizePlan({ doors: '19:00', firstAfter: 30, slots: [{ id: 'a', name: 'Arc Flash', minutes: 10, changeover: 0 }], setlist: [{ id: '1', title: 'One', length: '4:00' }, { id: '2', title: 'Two', length: '5:30' }, { id: '3', title: 'Three', length: '' }] });
  const t = setTimings(plan, 'arc flash');
  assert.deepEqual(t.rows.map((r) => r.clock), ['19:30', '19:34', '19:39']);
  assert.equal(t.totalText, '9:30');
  assert.equal(t.spare, 30);
  assert.equal(t.missing, 1);
  assert.equal(normalizePlan(null), null);
  const html = showPlanHTML({ venue: 'El Corazon', date: '2026-03-14' }, plan, { band: 'Arc Flash' });
  assert.match(html, /El Corazon · show plan/);
  assert.match(html, /19:30/);
  assert.doesNotMatch(showPlanHTML({ venue: '<b>x' }, plan), /<b>x/);
});

test('stage plot: presets, input list and monitor mixes', () => {
  const st = newStage('four');
  assert.ok(st.items.length > 8);
  const inputs = inputList(st);
  assert.equal(inputs[0].name, 'Kick');
  assert.equal(inputs[0].stand, 'Short boom');
  assert.ok(inputs.some((r) => r.name === 'Bass DI' && r.stand === ''));
  assert.deepEqual(inputs.filter((r) => /vocal/i.test(r.name)).map((r) => r.name), ['Lead vocal', 'Backing vocal (guitar)', 'Backing vocal (bass)']);
  assert.deepEqual(inputs.map((r) => r.ch), inputs.map((_, i) => i + 1));
  // vocals come last, drums first
  assert.ok(inputs.findIndex((r) => r.name === 'Lead vocal') > inputs.findIndex((r) => r.name === 'Guitar amp'));
  const mixes = monitorMixes(st);
  assert.equal(mixes.length, 3);
  assert.ok(mixes.every((x, i) => x.mix === i + 1));
  // two unlabelled guitar amps are numbered
  const two = { items: [newStageItem('guitar', 0.2, 0.2), newStageItem('guitar', 0.8, 0.2), newStageItem('keys', 0.5, 0.3, 'Synth')] };
  assert.deepEqual(inputList(two).map((r) => r.name), ['Guitar amp 1', 'Guitar amp 2', 'Synth: Keys L', 'Synth: Keys R']);
  assert.ok(Object.keys(STAGE_PRESETS).length >= 3);
});

test('stage plot SVG and document escape labels', () => {
  const st = normalizeStage({ items: [{ id: 'a', type: 'vocal', x: 2, y: -1, label: '<script>' }, { type: 'nope' }] });
  assert.equal(st.items.length, 1);
  assert.equal(st.items[0].x, 1);
  assert.equal(st.items[0].y, 0);
  const svg = stagePlotSVG(st);
  assert.match(svg, /AUDIENCE/);
  assert.match(svg, /data-id="a"/);
  assert.doesNotMatch(svg, /<script>/);
  const html = stagePlotHTML(st, { name: 'Arc Flash', email: 'band@example.com' });
  assert.match(html, /Input list · 1 channels/);
  assert.match(html, /band@example.com/);
  assert.equal(normalizeStage(null), null);
});

test('tours: distances, legs and money', () => {
  const sea = { lat: 47.6062, lon: -122.3321 };
  const pdx = { lat: 45.5152, lon: -122.6784 };
  const km = haversineKm(sea, pdx);
  assert.ok(km > 230 && km < 240, String(km));
  assert.equal(haversineKm(sea, {}), null);
  const t = { ...newTour('NW run'), gasRate: 0.25, stops: [newStop({ city: 'Seattle', ...sea }), newStop({ city: 'Portland', ...pdx }), newStop({ city: 'Nowhere' })] };
  t.stops[1].guarantee = '200';
  t.stops[1].merch = '150';
  t.stops[1].lodging = '60';
  const legs = tourLegs(t);
  assert.equal(legs.length, 2);
  assert.ok(legs[0].dist > 170 && legs[0].dist < 190, String(legs[0].dist)); // miles, road guess
  assert.equal(legs[1].dist, null);
  const mo = tourMoney(t);
  assert.equal(mo.rows[1].gas, Math.round(legs[0].dist * 0.25));
  assert.equal(mo.rows[1].net, 350 - 60 - mo.rows[1].gas);
  t.stops[1].gas = '30';
  assert.equal(tourMoney(t).rows[1].gas, 30);
  t.stops[1].status = 'dropped';
  assert.equal(tourMoney(t).income, 0);
  assert.equal(tourLegs({ ...t, units: 'km' })[0].dist, Math.round(km * 1.25));
});

test('tours: OpenStreetMap city search and venue results', () => {
  const places = parsePlaces([{ lat: '45.5', lon: '-122.6', name: 'Portland', display_name: 'Portland, Multnomah County, Oregon, United States', address: { city: 'Portland', state: 'Oregon', country: 'United States' } }, { lat: 'x', lon: '1', name: 'bad' }]);
  assert.deepEqual(places.map((p) => [p.name, p.region]), [['Portland', 'Oregon']]);
  const q = venueQuery(45.5, -122.6, 15);
  assert.match(q, /\[out:json\]/);
  assert.match(q, /amenity"="music_venue"\]\(around:15000,45\.50000,-122\.60000\)/);
  assert.match(venueQuery(1, 1, 500), /around:50000/);
  const res = parseOSMVenues({ elements: [
    { type: 'node', id: 1, lat: 45.52, lon: -122.65, tags: { name: 'Doug Fir Lounge', amenity: 'music_venue', 'addr:housenumber': '830', 'addr:street': 'E Burnside St', 'addr:city': 'Portland', website: 'https://www.dougfirlounge.com', capacity: '299' } },
    { type: 'way', id: 2, center: { lat: 45.51, lon: -122.68 }, tags: { name: 'Some Pub', amenity: 'pub', live_music: 'yes', email: 'book@pub.example' } },
    { type: 'node', id: 3, lat: 45.51, lon: -122.68, tags: { amenity: 'bar' } },
    { type: 'node', id: 4, lat: 45.52, lon: -122.65, tags: { name: 'Doug Fir Lounge', amenity: 'music_venue' } },
    { type: 'node', id: 5, lat: 45.5, lon: -122.6, tags: { name: 'Club X', amenity: 'nightclub', website: 'javascript:alert(1)' } },
  ] }, { lat: 45.5, lon: -122.6 });
  assert.deepEqual(res.map((r) => r.name), ['Doug Fir Lounge', 'Some Pub', 'Club X']);
  assert.equal(res[0].address, '830 E Burnside St, Portland');
  assert.equal(res[0].capacity, 299);
  assert.equal(res[1].kind, 'Pub');
  assert.equal(res[2].website, '');
  assert.equal(res[2].liveMusic, false);
  const v = venueFromOSM(res[0], 'Portland');
  assert.equal(v.id, 'osm-node-1');
  assert.equal(v.verified, false);
  assert.equal(v.capacity, 299);
  assert.deepEqual(v.sources, ['https://www.openstreetmap.org/node/1']);
  assert.equal(venueFromOSM(res[1]).bookingEmail, 'book@pub.example');
});

test('tours: rooms where similar bands played (setlist.fm)', () => {
  assert.deepEqual(fansOf('Bad Omens, Spiritbox and Deftones'), ['Bad Omens', 'Spiritbox', 'Deftones']);
  assert.equal(setlistSearchURL('Bad Omens', 'Portland'), '/api/setlistfm/search/setlists?artistName=Bad+Omens&cityName=Portland&p=1');
  const shows = parseSetlists({ setlist: [
    { eventDate: '12-10-2024', artist: { name: 'Spiritbox' }, venue: { name: 'Roseland Theater', city: { name: 'Portland', state: 'Oregon', country: { name: 'United States' }, coords: { lat: 45.5, long: -122.6 } } }, url: 'https://www.setlist.fm/setlist/x.html' },
    { eventDate: '01-02-2023', artist: { name: 'Bad Omens' }, venue: { name: 'Roseland Theater', city: { name: 'Portland' } } },
    { eventDate: '05-05-2022', artist: { name: 'Bad Omens' }, venue: { name: 'Hawthorne Theatre', city: { name: 'Portland' } } },
    { eventDate: '05-05-2022', artist: { name: 'Bad Omens' }, venue: {} },
  ] });
  assert.equal(shows.length, 3);
  assert.equal(shows[0].date, '2024-10-12');
  const rooms = similarVenues(shows);
  assert.equal(rooms[0].venue, 'Roseland Theater');
  assert.deepEqual(rooms[0].bands.sort(), ['Bad Omens', 'Spiritbox']);
  assert.equal(rooms[0].last, '2024-10-12');
  const v = venueFromSetlist(rooms[0]);
  assert.equal(v.id, 'sl-roseland-theater-portland');
  assert.match(v.notes, /Spiritbox/);
});

test('a confirmed stop becomes a show; tours survive a save', () => {
  const stop = { ...newStop({ city: 'Portland' }), date: '2026-04-02', guarantee: '150' };
  const s = showFromStop(stop, { id: 'v1', name: 'Doug Fir', bookingEmail: 'b@x.example' }, { name: 'Arc Flash' });
  assert.equal(s.status, 'confirmed');
  assert.equal(s.venueId, 'v1');
  assert.equal(s.deal, '$150 guarantee');
  assert.ok(s.todo.length > 3);
  assert.equal(s.lineup[0].name, 'Arc Flash');
  assert.ok(ARTIST_KEYS.includes('tours'));
  const m = normalizeManager({ tours: [{ id: 't1', name: 'Run', stops: [{ city: 'Portland', picks: [{ venueId: 'v1' }, {}] }] }, { name: 'no id' }] });
  assert.equal(m.tours.length, 1);
  assert.equal(m.tours[0].stops[0].picks.length, 1);
  assert.deepEqual(normalizeTours('nope'), []);
  assert.deepEqual(newManager().tours, []);
  const html = tourHTML({ ...newTour('Spring run'), stops: [stop] }, { venues: [], band: { name: 'Arc Flash' } });
  assert.match(html, /Arc Flash · Spring run/);
});

test('PDF documents are complete pages with escaped text', () => {
  const d = docHTML('A <b>title</b>', '<p>x</p>', { subtitle: 'sub' });
  assert.match(d, /^<!doctype html>/);
  assert.match(d, /A &lt;b&gt;title&lt;\/b&gt;/);
  assert.match(d, /@page/);
  assert.equal(esc(`<"'&>`), '&lt;&quot;&#39;&amp;&gt;');
  const show = { ...newShow('2026-03-14'), venue: 'El Corazon', doors: '19:00', setlist: 'One\nTwo', lineup: [{ name: 'Arc Flash', time: '21:00' }], settlement: { pay: '200', merch: '50', costs: '30', gross: '' } };
  const sh = showSheetHTML(show, { name: 'Arc Flash' });
  assert.match(sh, /Arc Flash · El Corazon/);
  assert.match(sh, /\$220/);
  const mo = moneyHTML({ band: { name: 'Arc Flash' }, year: '2026', lines: [{ date: '2026-01-02', kind: 'income', category: 'show', amount: 100 }], sum: { income: 100, expense: 0, net: 100, byCat: [['show', 100, 0]] } });
  assert.match(mo, /money 2026/);
  assert.match(calendarHTML({ title: 'Cal', monthName: 'March', items: [{ date: '2026-03-01', kind: 'show', title: 'El Corazon' }] }), /El Corazon/);
});

test('SubmitHub and Groover are pitch services with a short pitch and a cost', () => {
  assert.ok(PITCH_SERVICES.includes('SubmitHub'));
  assert.ok(PITCH_SERVICES.includes('Groover'));
  assert.deepEqual(SUBMIT_SERVICES.map((s) => s.id), ['SubmitHub', 'Groover']);
  assert.ok(SUBMIT_SERVICES.every((s) => /^https:\/\//.test(s.url)));
  assert.equal(newPitch().cost, '');
  const m = newManager();
  m.band.similar = 'Bad Omens, Spiritbox';
  const song = newSong('Static Bloom');
  const p = submitPitch(song, m, { today: '2026-01-01' });
  assert.match(p, /“Static Bloom” by Arc Flash/);
  assert.match(p, /For fans of Bad Omens, Spiritbox/);
});

test('Google Drive helpers', async () => {
  globalThis.File ??= nodeBuffer.File; // Node 18 has File only in node:buffer
  assert.equal(pickerMimeTypes('audio/*'), 'audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/wave,audio/mp4,audio/x-m4a,audio/aac,audio/ogg,audio/opus,audio/flac,audio/x-flac,audio/aiff,audio/x-aiff');
  assert.match(pickerMimeTypes('video/*,image/*'), /video\/mp4.*image\/jpeg/);
  assert.equal(pickerMimeTypes('.gp,.gp5'), '');
  assert.equal(pickerMimeTypes('video/*,.mov,font/ttf'), '');
  assert.ok(isGoogleDoc('application/vnd.google-apps.document'));
  assert.ok(!isGoogleDoc('audio/mpeg'));
  assert.ok(driveReady({ clientId: '123-abc.apps.googleusercontent.com', apiKey: 'AIzaSyA-0123456789abcdefghij', appId: '123456789012' }));
  assert.ok(!driveReady({ clientId: 'nope', apiKey: 'x', appId: 'abc' }));
  let asked = null;
  const file = await downloadDriveFile({ id: 'f/1', name: 'stem.wav', mimeType: 'audio/wav' }, 'tok', async (u, o) => ((asked = [u, o.headers.Authorization]), { ok: true, blob: async () => new Blob(['RIFF']) }));
  assert.equal(asked[0], 'https://www.googleapis.com/drive/v3/files/f%2F1?alt=media&supportsAllDrives=true');
  assert.equal(asked[1], 'Bearer tok');
  assert.equal(file.name, 'stem.wav');
  assert.equal(file.type, 'audio/wav');
  await assert.rejects(downloadDriveFile({ id: 'd', name: 'Doc', mimeType: 'application/vnd.google-apps.document' }, 't', async () => ({})), /Google Doc/);
  await assert.rejects(downloadDriveFile({ id: 'd', name: 'x.mp3', mimeType: 'audio/mpeg' }, 't', async () => ({ ok: false, status: 404 })), /404/);
});

test('setlist.fm pass-through only serves this app on this computer', async (t) => {
  const port = 18000 + Math.floor(Math.random() * 2000);
  const srv = spawn(process.execPath, [fileURLToPath(new URL('../server.js', import.meta.url))], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => srv.kill());
  await new Promise((resolve, reject) => {
    srv.stdout.on('data', (d) => String(d).includes('running') && resolve());
    srv.on('exit', () => reject(new Error('server exited')));
    setTimeout(() => reject(new Error('server did not start')), 5000);
  });
  const base = `http://127.0.0.1:${port}`;
  const get = (path, headers = {}) => fetch(base + path, { headers });
  // another web site can't use it
  assert.equal((await get('/api/setlistfm/search/setlists?artistName=x', { Origin: 'https://evil.example', 'x-setlistfm-key': 'abcdef12-3456' })).status, 403);
  assert.equal((await get('/api/setlistfm/search/setlists?artistName=x', { 'Sec-Fetch-Site': 'cross-site', 'x-setlistfm-key': 'abcdef12-3456' })).status, 403);
  // only the read-only searches
  assert.equal((await get('/api/setlistfm/user/me', { 'x-setlistfm-key': 'abcdef12-3456' })).status, 404);
  // a key is needed
  const noKey = await get('/api/setlistfm/search/setlists?artistName=x');
  assert.equal(noKey.status, 401);
  assert.match((await noKey.json()).error, /API key/);
  // only GET
  assert.equal((await fetch(`${base}/api/setlistfm/search/setlists`, { method: 'POST' })).status, 405);
  // the static files still work
  assert.equal((await get('/index.html')).status, 200);
});
