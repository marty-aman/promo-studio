// Per-line lyric styles: any lyric line can look different from the rest (a screamed line in huge
// red capitals, a whispered one small and soft). line.style = { preset?, ...your own changes }.
// Presets take their colours from the project's theme (or from the shared lyric style), so changing
// the theme recolours them too.

export const LINE_PRESETS = [
  ['scream', 'Scream', 'Huge, glitchy capitals in the accent colour'],
  ['breakdown', 'Breakdown', 'Biggest text, pulsing on the beat'],
  ['chant', 'Gang vocals', 'Boxed capitals that drop in word by word'],
  ['clean', 'Clean vocal', 'Smooth karaoke fill, sentence case'],
  ['whisper', 'Whisper', 'Small, soft serif that fades in'],
  ['spoken', 'Spoken word', 'Typewriter text on a dark strip'],
];

/** The fields a line can override (anything else comes from the shared lyric style). */
export const LINE_FIELDS = ['font', 'size', 'color', 'highlight', 'outline', 'outlineWidth', 'animation', 'uppercase', 'box', 'boxColor', 'boxOpacity', 'shadow'];

function hexRgb(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255];
}
const mix = (a, b, k) => {
  const x = hexRgb(a);
  const y = hexRgb(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('');
};

/** Theme colours (or ones guessed from the shared lyric style). */
export function paletteFor(base, theme) {
  if (theme && theme.colors) return theme.colors;
  return { bg: '#000000', deep: mix(base.highlight || '#e0182d', '#000000', 0.6), accent: base.highlight || '#e0182d', light: base.color || '#ffffff' };
}

/** A preset's fields for a palette, relative to the shared style `base`. */
export function presetFields(id, base, pal) {
  const sz = base.size || 9;
  switch (id) {
    case 'scream':
      return { font: 'Bebas Neue', size: +(sz * 1.35).toFixed(2), color: pal.accent, highlight: pal.light, outline: '#000000', outlineWidth: 0.9, uppercase: true, animation: 'glitch', box: false, shadow: true };
    case 'breakdown':
      return { font: 'Impact', size: +(sz * 1.6).toFixed(2), color: pal.light, highlight: pal.accent, outline: pal.accent, outlineWidth: 0.5, uppercase: true, animation: 'beat', box: false, shadow: true };
    case 'chant':
      return { font: 'Oswald', size: +(sz * 1.05).toFixed(2), color: pal.light, highlight: pal.accent, outline: '#000000', outlineWidth: 0, uppercase: true, animation: 'bounce', box: true, boxColor: pal.accent, boxOpacity: 0.92, shadow: false };
    case 'clean':
      return { font: 'Montserrat', size: +(sz * 0.8).toFixed(2), color: pal.light, highlight: pal.accent, outline: '#000000', outlineWidth: 0.4, uppercase: false, animation: 'karaoke', box: false, shadow: true };
    case 'whisper':
      return { font: 'Playfair Display', size: +(sz * 0.65).toFixed(2), color: mix(pal.light, pal.bg, 0.25), highlight: pal.light, outline: '#000000', outlineWidth: 0, uppercase: false, animation: 'fade', box: false, shadow: true };
    case 'spoken':
      return { font: 'Courier New', size: +(sz * 0.62).toFixed(2), color: pal.light, highlight: pal.accent, outline: '#000000', outlineWidth: 0, uppercase: false, animation: 'typewriter', box: true, boxColor: '#000000', boxOpacity: 0.7, shadow: false };
    default:
      return {};
  }
}

/** The style a line is drawn with: shared style, then its preset, then its own changes. */
export function lineStyle(base, line, theme) {
  const st = line && line.style;
  if (!st) return base;
  const { preset, ...own } = st;
  return { ...base, ...(preset ? presetFields(preset, base, paletteFor(base, theme)) : {}), ...own };
}

/** Does this line look different from the shared style? */
export const hasLineStyle = (line) => !!(line && line.style && Object.keys(line.style).length);
