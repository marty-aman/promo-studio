// Wires the Auto-sync box (panel-autosync.js) to the two places that have lyrics:
//  - the Video Studio's Lyrics tab: the edit's lyric lines get their times, words and confidence (one undo step);
//    the app then saves the timing on the song by itself, like any other timing change
//  - the Manager song's Lyrics tab: the timing is saved straight on the song
import { autoSyncBox } from './panel-autosync.js';
import { LOW_CONFIDENCE } from './lyricsync.js';
import { sortLyrics, songToTimeline } from '../core.js';
import { markTimed, timingFromLyrics, setSongTiming } from '../manager/lyrictiming.js';

const summary = (res, info) => {
  const flagged = res.lines.filter((l) => l.flagged).length;
  const heard = Math.round((100 * res.stats.matched) / Math.max(1, res.stats.words));
  return `Timed ${res.lines.length} line${res.lines.length === 1 ? '' : 's'}, ${heard}% of the words heard${flagged ? `, ${flagged} to check` : ''}.${info.source === 'mix' ? ' (From the full mix: lower accuracy.)' : ''}`;
};

/** The Video Studio's Lyrics tab: `{ store, engine, ui, media }` from createPanels. */
export function studioAutoSync({ store, engine, ui, media }) {
  const sorted = () => sortLyrics(store.get().lyrics).filter((l) => String(l.text || '').trim());
  return autoSyncBox({
    key: 'studio',
    lines: () => sorted().map((l) => l.text.trim()),
    sources() {
      const sc = ui.songContext ? ui.songContext() : null;
      const v = sc && sc.stems.find((s) => s.role === 'vocals');
      const song = store.get().song;
      const rec = song && media.get(song.mediaId);
      return { vocal: v && media.get(v.mediaId) ? { mediaId: v.mediaId, name: (media.get(v.mediaId) || {}).name || v.label } : null, mix: rec ? { mediaId: rec.id, name: rec.name } : null };
    },
    blob: (id) => (media.get(id) || {}).blob || null,
    apply(res, info) {
      store.update((d) => {
        const old = sortLyrics(d.lyrics).filter((l) => String(l.text || '').trim());
        const keep = d.lyrics.filter((l) => !String(l.text || '').trim());
        d.lyrics = [...old.map((l, i) => (res.lines[i] ? { ...l, start: res.lines[i].start, end: res.lines[i].end, words: res.lines[i].words, conf: res.lines[i].conf } : l)), ...keep];
        d.lyricsTimed = markTimed(d.lyricsTimed, 'auto');
      });
      ui.refreshPanels(true);
      return summary(res, info);
    },
    flagged() {
      const p = store.get();
      if (!p.lyricsTimed || p.lyricsTimed.by !== 'auto') return [];
      return sorted().map((l, index) => ({ index, text: l.text, start: l.start, id: l.id, conf: l.conf })).filter((f) => typeof f.conf === 'number' && f.conf < LOW_CONFIDENCE);
    },
    goto(f) {
      engine.seek(Math.max(0, songToTimeline(f.start, store.get().song)));
      ui.select({ type: 'lyric', id: f.id });
    },
  });
}

/**
 * The Manager song's Lyrics tab. ctx = the Manager's page context, S = the song updater of page-songs.js.
 * ctx.studio.mediaBlob(id) gives a library file's audio.
 */
export function managerAutoSync(ctx, song, S) {
  const plain = () => String(song.lyrics || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return autoSyncBox({
    key: 'manager',
    lines: plain,
    sources() {
      const stem = (song.files && song.files.stems ? song.files.stems : []).find((s) => s.role === 'vocals' && ctx.studio.mediaInfo(s.mediaId));
      const mix = song.audioId && ctx.studio.mediaInfo(song.audioId);
      return { vocal: stem ? { mediaId: stem.mediaId, name: ctx.studio.mediaInfo(stem.mediaId).name } : null, mix: mix ? { mediaId: song.audioId, name: mix.name } : null };
    },
    blob: (id) => (ctx.studio.mediaBlob ? ctx.studio.mediaBlob(id) : null),
    confirmReplace: () => !song.lyricTiming || confirm(`Replace the saved timing of “${song.title}” with the auto-synced one?`),
    apply(res, info) {
      const mix = song.audioId && ctx.studio.mediaInfo(song.audioId);
      const timing = timingFromLyrics(res.lines.map((l) => ({ text: l.text, start: l.start, end: l.end, words: l.words, conf: l.conf })), { source: 'auto', songLength: (mix && mix.duration) || 0, lyricsText: song.lyrics });
      ctx.update(S((s) => setSongTiming(s, timing)));
      return summary(res, info);
    },
    flagged() {
      const t = song.lyricTiming;
      if (!t || t.source !== 'auto') return [];
      return t.lines.map((l, index) => ({ index, text: l.text, start: l.t, conf: l.conf })).filter((f) => typeof f.conf === 'number' && f.conf < LOW_CONFIDENCE);
    },
    goto: () => ctx.studio.openPromo(song),
  });
}
