// Phone and tablet helpers: which layout fits the window, pinch zoom, touch trim zones, export advice.
// Everything above the last section is pure (unit tested); keepAwake touches the browser.

/** 'phone' (portrait), 'land' (a phone on its side), 'tablet' (drawer layout) or 'desktop'. */
export function layoutMode(w, h, touch = false) {
  if (h <= 500 && w <= 950) return 'land';
  if (w <= 700) return 'phone';
  if (w <= 1100 || (touch && w <= 1250)) return 'tablet';
  return 'desktop';
}

/** The top bar collapses its rarely used controls into a menu in these windows. */
export const compactBar = (mode, w) => mode === 'phone' || mode === 'land' || (mode === 'tablet' && w <= 900);

/** New pixels-per-second for a two-finger pinch: the spread of the fingers scales the zoom. */
export function pinchZoom(pps0, dist0, dist1, min = 10, max = 300) {
  if (!(dist0 > 4) || !(dist1 > 0)) return pps0;
  return Math.min(max, Math.max(min, pps0 * (dist1 / dist0)));
}

/** scrollLeft that keeps the moment under the pinch centre where it was. */
export const pinchScroll = (timeAtCentre, pps, centreOffset) => Math.max(0, timeAtCentre * pps - centreOffset);

/**
 * Which edge of a block a touch at x grabs ('l', 'r' or null). Thin blocks still get a zone on each side;
 * the zone is 22 px (a 44 px hit area across the edge) but never more than a third of the block.
 * Only a selected block can be trimmed by touch, so a stray tap near an edge just selects it.
 */
export function edgeZone(left, right, x, selected) {
  if (!selected) return null;
  const zone = Math.min(22, (right - left) / 3);
  if (zone <= 0) return null;
  if (x - left <= zone) return 'l';
  if (right - x <= zone) return 'r';
  return null;
}

/** Fraction 0..1 for a scrub bar value and back. */
export const scrubToTime = (v, max, duration) => (max > 0 ? (Math.min(max, Math.max(0, v)) / max) * duration : 0);

/**
 * What to tell someone before an export on this device.
 * env: { ua, mp4, webm, touch, saveData, effectiveType, seconds, fast } (fast: the frame-by-frame export is chosen)
 */
export function exportAdvice(env) {
  const ua = env.ua || '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && env.touch);
  const phone = !!env.touch;
  const format = env.mp4 ? 'MP4' : env.webm ? 'WebM' : null;
  const lines = [];
  if (!format) lines.push('This browser cannot record video, so it cannot export. Try Chrome, Edge or Firefox on a computer.');
  else if (format === 'WebM' && phone) lines.push('This browser saves WebM. Instagram and TikTok may not take WebM from a phone; export on a computer or in Chrome if the upload is refused.');
  else lines.push(`This browser will save ${format}.`);
  const secs = Math.max(1, Math.ceil(env.seconds || 0));
  const lo = Math.ceil(secs * (phone ? 1.5 : 1));
  // a fast export's time depends on the device (the Export tab says when this browser cannot do one)
  if (!env.fast) lines.push(`It records in real time, so expect about ${lo >= 90 ? `${Math.ceil(lo / 60)} minutes` : `${lo} seconds`}.`);
  if (phone) lines.push(env.fast ? 'Keep this screen on until it finishes. A phone may pause it while you switch apps or lock the screen, and closing the tab stops it.' : 'Keep this screen on and this tab in front until it finishes. Locking the phone or switching apps stops the recording.');
  if (ios) lines.push('On iPhone and iPad, Safari can only record short, smaller videos and may stop on its own. Try a shorter edit or the 30 fps setting if it fails.');
  return { format, lines, ios, phone };
}

/** A warning for big downloads on a phone, a metered connection or Data Saver; '' when nothing needs saying. */
export function downloadWarning(mb, env = {}) {
  const slow = env.saveData || /(^|-)2g$|3g/.test(env.effectiveType || '');
  if (slow) return `This is a ${mb} MB download and your connection looks slow or limited${env.saveData ? ' (Data Saver is on)' : ''}. Wait for Wi-Fi if you can.`;
  if (env.touch && mb >= 20) return `This is a ${mb} MB download. On a phone, use Wi-Fi if you are not on an unlimited plan.`;
  return '';
}

// ------------------------------------------------------------ browser side
const conn = () => (typeof navigator !== 'undefined' && (navigator.connection || navigator.mozConnection || navigator.webkitConnection)) || {};
export const isTouchDevice = () => typeof matchMedia === 'function' && (matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints || 0) > 0 && !matchMedia('(pointer: fine)').matches);

/** downloadWarning for this device. */
export const warnDownload = (mb) => downloadWarning(mb, { saveData: !!conn().saveData, effectiveType: conn().effectiveType, touch: isTouchDevice() || (typeof document !== 'undefined' && document.body.classList.contains('touch')) });

/** Keep the screen on while something long runs. Returns a release function (a no-op without the API). */
export async function keepAwake() {
  try {
    if (!navigator.wakeLock) return { release() {}, supported: false };
    let lock = await navigator.wakeLock.request('screen');
    // the lock drops when the tab is hidden; take it again when the tab comes back
    const again = async () => {
      if (document.visibilityState === 'visible' && lock && lock.released) {
        try { lock = await navigator.wakeLock.request('screen'); } catch { /* refused: nothing to do */ }
      }
    };
    document.addEventListener('visibilitychange', again);
    return {
      supported: true,
      release() {
        document.removeEventListener('visibilitychange', again);
        try { lock.release(); } catch { /* already released */ }
        lock = null;
      },
    };
  } catch {
    return { release() {}, supported: false };
  }
}

export function exportEnv(seconds, pick) {
  return { ua: navigator.userAgent, mp4: !!(pick('mp4') || '').startsWith?.('video/mp4'), webm: !!pick('webm'), touch: isTouchDevice() || document.body.classList.contains('touch'), seconds };
}
