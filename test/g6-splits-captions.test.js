// G6: split sheets (js/manager/splits.js) and the caption bank (js/manager/captionbank.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { newManager, newSong, normalizeManager } from '../js/manager/model.js';
import { workspaceFrom, viewOf, mergeView, addArtist, workspaceBackup, parseWorkspaceBackup, normalizeWorkspace } from '../js/manager/artists.js';
import { normalizeSong } from '../js/manager/songnorm.js';
import { cleanShare, normalizeSplit, splitTotal, splitAddsUp, evenShares, addMembers, splitStatus, splitSheetHTML, SPLIT_NOTE, newWriter } from '../js/manager/splits.js';
import { parseHashtags, normalizeBank, newCaption, copyText, markUsed, filterCaptions, captionFromPost, postsFor, bestCaptions } from '../js/manager/captionbank.js';

const W = (name, share, extra = {}) => ({ ...newWriter(name), share, ...extra });

test('split shares: rounding, totals that add up exactly', () => {
  assert.equal(cleanShare('33.333'), 33.33);
  assert.equal(cleanShare('12,5'), 12.5);
  assert.equal(cleanShare(-4), 0);
  assert.equal(cleanShare(140), 100);
  assert.equal(cleanShare('abc'), 0);
  assert.equal(splitTotal([W('a', 33.33), W('b', 33.33), W('c', 33.34)]), 100);
  assert.ok(splitAddsUp([W('a', 33.33), W('b', 33.33), W('c', 33.34)]));
  assert.ok(splitAddsUp([W('a', 0.1), W('b', 0.2), W('c', 99.7)]), 'no float drift');
  assert.ok(!splitAddsUp([W('a', 50), W('b', 49.99)]));
  assert.ok(!splitAddsUp([]), 'no writers is not a split');
  assert.equal(splitTotal([W('a', 60), W('b', 50)]), 110);
});

test('even split of 3 (and 1, 6, 7) adds up to exactly 100', () => {
  assert.deepEqual(evenShares(3), [33.34, 33.33, 33.33]);
  assert.deepEqual(evenShares(1), [100]);
  assert.deepEqual(evenShares(0), []);
  for (const n of [2, 3, 6, 7, 9]) {
    const s = evenShares(n);
    assert.equal(s.length, n);
    assert.ok(splitAddsUp(s.map((x) => ({ share: x }))), `n=${n}`);
    assert.ok(Math.max(...s) - Math.min(...s) <= 0.011);
  }
});

test('band members are added once, by name', () => {
  const sp = normalizeSplit({ writers: [W('Marty', 50)] });
  const next = addMembers(sp, [{ id: '1', name: 'marty ' }, { id: '2', name: 'Sam' }, { id: '3', name: '' }, null]);
  assert.deepEqual(next.writers.map((w) => w.name), ['Marty', 'Sam']);
  assert.equal(next.writers[1].share, 0);
});

test('split status chip: missing (none, not 100, unsigned) and signed', () => {
  const s = newSong('Black Tide');
  assert.deepEqual([splitStatus(s).ok, splitStatus(s).label], [false, 'Split missing']);
  s.split = { writers: [W('a', 50), W('b', 40)], signed: true };
  assert.equal(splitStatus(s).label, 'Split missing');
  assert.match(splitStatus(s).why, /90%/);
  s.split.writers[1].share = 50;
  s.split.signed = false;
  assert.equal(splitStatus(s).label, 'Split missing');
  assert.match(splitStatus(s).why, /not signed/);
  s.split.signed = true;
  s.split.signedDate = '2026-11-20';
  assert.deepEqual([splitStatus(s).ok, splitStatus(s).label], [true, 'Split signed']);
});

test('normaliser runs through SONG_EXTRAS and tolerates junk', () => {
  const d = newSong('x');
  const n = normalizeSong({ ...d, split: { writers: [null, { name: 3, role: 'drummer', share: '25.555' }, 'x'], signed: 'yes', keep: 1 } }, d);
  assert.equal(n.split.writers.length, 1);
  assert.deepEqual([n.split.writers[0].name, n.split.writers[0].role, n.split.writers[0].share], ['', 'other', 25.56]);
  assert.equal(n.split.signed, false);
  assert.equal(n.split.keep, 1, 'unknown fields kept');
  assert.deepEqual(normalizeSong({ ...d, split: 'bad' }, d).split.writers, []);
  const m = normalizeManager({ ...newManager(), songs: [{ ...d, split: { writers: [W('a', 100)] } }] });
  assert.equal(m.songs[0].split.writers[0].share, 100);
});

test('split sheet: escapes text, prints the note, emails only when asked', () => {
  const song = { ...newSong('<script>x</script>'), split: { writers: [W('Ann "A" <b>', 60, { email: 'ann@example.com', pro: 'BMI' }), W('Bo', 40, { email: 'bo@example.com' })], date: '2026-11-01', master: 'Band owns <master>' } };
  const html = splitSheetHTML(song, { name: 'Doom & Co' });
  assert.ok(!html.includes('<script>x'), 'title escaped');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('Ann &quot;A&quot; &lt;b&gt;'));
  assert.ok(html.includes('Doom &amp; Co'));
  assert.ok(html.includes(SPLIT_NOTE));
  assert.ok(html.includes('60%') && html.includes('40%') && html.includes('100%'));
  assert.ok(!html.includes('ann@example.com') && !html.includes('bo@example.com'), 'no emails by default');
  assert.ok(!html.includes('Draft'));
  assert.equal((html.match(/class="sig"/g) || []).length, 2, 'a signature line per writer');
  const withMail = splitSheetHTML(song, {}, { includeEmail: true });
  assert.ok(withMail.includes('ann@example.com'));
  song.split.writers[1].share = 30;
  assert.match(splitSheetHTML(song, {}), /Draft: the shares add up to 90%/);
});

test('hashtags: parsed, no #, no repeats, no junk', () => {
  assert.deepEqual(parseHashtags('#doom, metal #Doom ##new_music #!'), ['doom', 'metal', 'new_music']);
  assert.deepEqual(parseHashtags(['#a', 'b', null]), ['a', 'b']);
  assert.deepEqual(parseHashtags(''), []);
});

test('caption normaliser, copy text and the use counter', () => {
  const [c] = normalizeBank([{ id: 'c1', text: 'Out now', hashtags: '#doom #metal', platform: 'myspace', kind: 'release', uses: '-3' }, { text: 'no id' }, null]);
  assert.deepEqual([c.platform, c.kind, c.uses, c.hashtags], ['any', 'release', 0, ['doom', 'metal']]);
  assert.equal(copyText(c), 'Out now\n\n#doom #metal');
  assert.equal(copyText({ ...c, hashtags: [] }), 'Out now');
  markUsed(c, '2026-11-23');
  markUsed(c, '2026-11-24');
  assert.deepEqual([c.uses, c.lastUsed], [2, '2026-11-24']);
});

test('caption search and filters', () => {
  const bank = normalizeBank([
    { id: 'a', text: 'New single out Friday', hashtags: ['doom'], platform: 'tiktok', kind: 'release', songId: 's1' },
    { id: 'b', text: 'Live in Leeds tonight', hashtags: ['gig'], platform: 'any', kind: 'show' },
    { id: 'c', text: 'Riff from the studio', hashtags: ['doom', 'bts'], platform: 'reels', kind: 'behind-the-scenes', songId: 's1' },
  ]);
  const ids = (o) => filterCaptions(bank, o).map((c) => c.id);
  assert.deepEqual(ids({}), ['a', 'b', 'c']);
  assert.deepEqual(ids({ q: 'DOOM' }), ['a', 'c']);
  assert.deepEqual(ids({ q: '#doom studio' }), ['c'], 'every word must match');
  assert.deepEqual(ids({ platform: 'tiktok' }), ['a', 'b'], '"any" shows under every app');
  assert.deepEqual(ids({ kind: 'show' }), ['b']);
  assert.deepEqual(ids({ songId: 's1', platform: 'reels' }), ['c']);
  assert.deepEqual(ids({ q: 'zzz' }), []);
});

test('save from a post: hook line first, linked by id', () => {
  const c = captionFromPost({ id: 'p1', hook: ' Wait for the drop ', title: 'Teaser', platform: 'Reels', songId: 's1' }, '2026-11-23');
  assert.deepEqual([c.text, c.platform, c.songId, c.postIds, c.created], ['Wait for the drop', 'reels', 's1', ['p1'], '2026-11-23']);
  assert.equal(captionFromPost({ id: 'p2', hook: '', title: 'Riff', platform: 'Other' }).platform, 'any');
});

test('best performers: matched by id or same text, ranked by median views, tiny samples flagged', () => {
  const bank = normalizeBank([
    { id: 'a', text: 'Wait for the drop', postIds: ['p1'] },
    { id: 'b', text: 'This riff took a year' },
    { id: 'c', text: 'Short' },
    { id: 'd', text: 'Never used anywhere at all' },
  ]);
  const post = (id, title, hook, views) => ({ id, title, hook, stats: views == null ? null : { views } });
  const one = [post('p1', 'Teaser', 'x', 500)];
  let r = bestCaptions(bank, one);
  assert.deepEqual(r.top, [{ id: 'a', n: 1, views: 500 }]);
  assert.equal(r.enough, false, 'one caption and one post is too little');
  const posts = [...one, post('p2', 'This riff took a year!', '', 9000), post('p3', 'x', 'this RIFF took a year', 1000), post('p4', 'Short', 'Short', 99999), post('p5', 'none', '', null)];
  assert.deepEqual(postsFor(bank[1], posts).map((p) => p.id), ['p2', 'p3'], 'text match ignores case and punctuation');
  assert.deepEqual(postsFor(bank[2], posts), [], 'very short texts never match by text');
  r = bestCaptions(bank, posts);
  assert.deepEqual(r.top, [{ id: 'b', n: 2, views: 5000 }, { id: 'a', n: 1, views: 500 }]);
  assert.deepEqual([r.rated, r.posts, r.enough], [2, 3, true]);
  assert.deepEqual(bestCaptions([], posts), { top: [], rated: 0, posts: 0, enough: false });
  const many = normalizeBank(['one two three four', 'five six seven eight', 'nine ten eleven twelve', 'thirteen fourteen x'].map((t, i) => ({ id: `m${i}`, text: t, postIds: [`q${i}`] })));
  const r4 = bestCaptions(many, many.map((c, i) => post(`q${i}`, '', '', (i + 1) * 100)));
  assert.deepEqual(r4.top.map((x) => x.id), ['m3', 'm2', 'm1'], 'only the top three');
});

test('backup round trip and artist switch keep song.split and captionBank', () => {
  const ws = workspaceFrom(newManager());
  const v = viewOf(ws);
  const s = newSong('Split song');
  s.split = normalizeSplit({ writers: [W('Ann', 50, { email: 'a@x.io' }), W('Bo', 50)], signed: true, signedDate: '2026-11-22', notes: 'n', master: 'm' });
  v.songs = [s];
  v.captionBank = [newCaption({ text: 'Out now', hashtags: ['doom'], uses: 2, postIds: ['p1'] }, '2026-11-23')];
  const full = mergeView(ws, v);
  const back = parseWorkspaceBackup(workspaceBackup(full));
  assert.deepEqual(back.artists[0], full.artists[0]);
  assert.deepEqual(normalizeWorkspace(JSON.parse(JSON.stringify(full))), full);
  const [ws2, id2] = addArtist(full, 'Other band');
  assert.deepEqual(viewOf(ws2, id2).captionBank, []);
  const again = viewOf(ws2, full.current);
  assert.deepEqual(again.captionBank, v.captionBank);
  assert.deepEqual(again.songs[0].split, s.split);
  const m = normalizeManager(JSON.parse(JSON.stringify(again)));
  assert.deepEqual(m.songs[0].split, s.split, 'normalising a saved split changes nothing');
});
