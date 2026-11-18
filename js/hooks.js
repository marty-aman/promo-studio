// Hook openers: ideas for the first 1-2 seconds of a promo. They're things you film yourselves,
// licensed stock you search for, or the apps' own remix features (TikTok Stitch / green screen),
// never other people's clips reposted. "Add as intro" puts the on-screen text, a sound effect and a
// punchy first cut in place, and can put one of your clips first.
import { uid } from './core.js';

export const HOOK_SOURCES = [
  { label: 'CapCut: first 3-second patterns (motion, tension, payoff)', url: 'https://www.capcut.com/create/short-form-video-hooks-first-3-second-patterns' },
  { label: 'Skeepers: scroll-stopping visual and verbal hooks', url: 'https://community.skeepers.io/blog/scroll-stopping-hook-ideas-visual-verbal/' },
  { label: 'UnHurd: turn the story behind the song into your first line', url: 'https://www.unhurdmusic.com/blog/make-a-list-of-hooks-for-your-content' },
  { label: 'audiartist: a clear opening event for your 15 seconds', url: 'https://www.audiartist.com/choose-best-15-seconds-song-reels-tiktok-shorts/' },
  { label: 'TikTok Help: Stitch (only on videos whose creator allows it)', url: 'https://support.tiktok.com/en/using-tiktok/creating-videos/stitch' },
];

export const HOOK_KINDS = {
  film: 'Film it yourselves',
  stock: 'Licensed stock',
  app: 'Use the app’s remix tools',
  edit: 'Pure edit (no new footage)',
};

/**
 * id, title, kind, how (filming / doing it), text (on-screen line, tokens {title} {similar}),
 * sfx (built-in sound at 0 s), cut (first-clip effect), seconds (how long the opener runs),
 * stock (searches for licensed footage), safety (optional note).
 */
export const HOOK_OPENERS = [
  { id: 'trip', title: 'Staged fall on the drop', kind: 'film', how: 'Film the singer “tripping” over a cable or the mic stand right as the song kicks in. Land on a crash mat or a sofa, never a hard floor. The drop hides the cut.', text: 'WAIT FOR IT', sfx: 'impact', cut: 'shake', seconds: 2, safety: 'Use a mat, rehearse slowly, and have someone spot.' },
  { id: 'outrageous', title: 'The outrageous one-liner', kind: 'film', how: 'Singer looks straight into the lens and says one bold line (“This song got us kicked out of a church”), then hard-cut to the loudest part.', text: 'THIS SONG GOT US BANNED', sfx: 'recordStop', cut: 'zoom', seconds: 2.2 },
  { id: 'freeze', title: '“Yep, that’s me” freeze-frame', kind: 'edit', how: 'Start on your most chaotic moment (mid-scream, mid-jump), stop it with a record scratch and a caption, then rewind into the song.', text: 'YEP. THAT’S ME. YOU’RE PROBABLY WONDERING…', sfx: 'scratch', cut: 'freeze', seconds: 2.4 },
  { id: 'fakeout', title: 'The soft fake-out', kind: 'edit', how: 'Open on the quietest, prettiest moment with a gentle caption, then smash-cut into the breakdown. The contrast is the joke.', text: 'a gentle love song for you 🌸', sfx: 'subdrop', cut: 'flash', seconds: 2.5 },
  { id: 'jumpscare', title: 'Silent hallway jump scare', kind: 'film', how: 'Film an empty, quiet room or hallway for 1.5 seconds, then the whole band bursts in on the first hit.', text: '', sfx: 'impact', cut: 'flash', seconds: 1.6 },
  { id: 'wronginstrument', title: 'Breakdown on the wrong instrument', kind: 'film', how: 'Play the riff on a recorder, kazoo or toy piano first, then cut to the real thing at full volume.', text: 'THE BREAKDOWN BUT ON A RECORDER', sfx: 'recordStop', cut: 'zoom', seconds: 3 },
  { id: 'reaction', title: 'Family member hears it first', kind: 'film', how: 'Film a parent or grandparent hearing the heaviest part for the first time. Their real face is the hook. Ask them before you post it.', text: 'PLAYED OUR NEW SONG FOR MY GRANDMA', sfx: null, cut: 'zoom', seconds: 2.5, safety: 'Only post with their OK.' },
  { id: 'snap', title: 'String snaps mid-riff', kind: 'film', how: 'Fake a string snap (pluck a loose string with a pick and flinch), freeze, then the song hits.', text: 'IT WAS TOO HEAVY', sfx: 'glitch', cut: 'shake', seconds: 2 },
  { id: 'takes', title: '“Take 400” clapper', kind: 'film', how: 'Start with a clapperboard or phone note saying a ridiculous take number, then the perfect take.', text: 'TAKE 400 OF THIS RIFF', sfx: 'clap', cut: 'flash', seconds: 1.8 },
  { id: 'pitpov', title: 'Mosh-pit POV', kind: 'film', how: 'A chest-mounted phone or action cam in the pit at your own show. Ask the venue first, and tell the crowd they may be filmed.', text: 'POV: YOU’RE IN THE PIT', sfx: 'whoosh', cut: 'shake', seconds: 2 },
  { id: 'rate', title: '“Rate this scream” close-up', kind: 'film', how: 'Tight close-up of the scream with a rating prompt; people comment a number.', text: 'RATE THIS SCREAM 1–10', sfx: null, cut: 'zoom', seconds: 2 },
  { id: 'lightning', title: 'Lightning strike / glass shatter', kind: 'stock', how: 'Open on a licensed slow-motion lightning strike, explosion or shattering glass that lands on the first hit, then cut to the band.', text: '', sfx: 'impact', cut: 'flash', seconds: 1.2, stock: ['lightning strike slow motion', 'glass shatter slow motion', 'explosion fire slow motion'] },
  { id: 'crowd', title: 'Crowd surge', kind: 'stock', how: 'A licensed shot of a huge crowd jumping as the song drops, then your band.', text: 'IF YOU LIKE {similar}', sfx: 'riser', cut: 'flash', seconds: 1.8, stock: ['concert crowd jumping', 'festival crowd hands up'] },
  { id: 'stitch', title: 'Stitch a question you can answer', kind: 'app', how: 'Find a TikTok asking “bands like ___?” or “heaviest breakdown?”. If its creator allows Stitch, use TikTok’s Stitch button so their 1–5 s clip plays first, then your song. Don’t download and re-upload it.', text: '', sfx: null, cut: 'flash', seconds: 0 },
  { id: 'greenscreen', title: 'Reply to a comment on green screen', kind: 'app', how: 'Use the app’s “reply with video” on a comment like “no way this is a 3-piece band” and play the proof. Remove background here can do the green-screen look too.', text: '“NO WAY THIS IS 3 PEOPLE”', sfx: 'whoosh', cut: 'zoom', seconds: 2 },
];

const fill = (s, ctx) => String(s || '').replace(/\{similar\}/gi, (ctx.similar || 'YOUR FAVORITE BANDS').toUpperCase()).replace(/\{title\}/gi, ctx.title || 'THIS SONG');

/**
 * Put an opener in place on draft `d`. opts: { clipMediaId, clipKind, clipDuration, similar }.
 * Adds the hook text at 0 s, makes the first cut punchy, and (with clipMediaId) puts that clip first.
 * Returns the built-in sound id to add at 0 s, or null.
 */
export function applyHookOpener(d, hook, opts = {}) {
  const secs = Math.max(1.2, hook.seconds || 2);
  if (opts.clipMediaId) {
    const dur = opts.clipKind === 'video' ? Math.min(secs, opts.clipDuration || secs) : secs;
    d.clips.unshift({
      id: uid('clip'), mediaId: opts.clipMediaId, kind: opts.clipKind || 'video', in: 0, duration: +dur.toFixed(2), speed: 1, fit: 'cover', zoom: 1, panX: 0, panY: 0, rotate: 0, flip: false, volume: 0,
      filter: { preset: 'none', adjust: {} }, transition: { type: 'none', duration: 0.3 }, kenBurns: null, effects: {},
    });
    // the song now starts with the cut after the opener
    if (d.clips[1]) d.clips[1].transition = { type: hook.cut === 'flash' ? 'flash' : hook.cut === 'zoom' ? 'zoom' : hook.cut === 'shake' ? 'shake' : 'glitch', duration: 0.3 };
  } else if (d.clips[0]) {
    const c = d.clips[0];
    if (hook.cut === 'shake') c.effects = { ...(c.effects || {}), shake: 0.5 };
    if (hook.cut === 'zoom') c.kenBurns = { fromZoom: 1.35, toZoom: 1, fromX: 0, toX: 0, fromY: 0, toY: 0 };
    c.transition = { type: hook.cut === 'flash' ? 'flash' : hook.cut === 'freeze' ? 'glitch' : 'zoom', duration: 0.35 };
  }
  d.texts = (d.texts || []).filter((t) => !t.hook);
  const text = fill(hook.text, { similar: opts.similar, title: d.endCard && d.endCard.title });
  if (text) {
    d.texts.unshift({
      id: uid('txt'), hook: true, text, start: 0, end: +Math.max(1.5, secs + 0.4).toFixed(2), x: 50, y: 18,
      size: text.length > 24 ? 6.5 : 8.5, font: 'Bebas Neue', color: '#ffffff', outline: '#000000', box: true,
      boxColor: hook.id === 'fakeout' ? '#f7c6d9' : '#e0182d', boxOpacity: 0.95, animation: hook.id === 'fakeout' ? 'fade' : 'pop',
      ...(hook.id === 'fakeout' ? { color: '#3a1a2a', font: 'Playfair Display' } : {}),
    });
  }
  d.hookOpener = hook.id;
  return hook.sfx || null;
}
