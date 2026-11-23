// Which workspace the address bar names. The Video, Photo and Tab Studios put #studio, #photo and #tabstudio on the
// address; the Manager leaves its own #m/... page address alone. Pure functions.

const STUDIOS = ['studio', 'photo', 'tabstudio'];

/**
 * The address for workspace `mode`: `#photo` and so on for a studio, no studio hash for the Manager. A ?studio or
 * ?tabstudio in the address is dropped too, or it would win over the hash after a reload.
 */
export function modeUrl(mode, { pathname = '/', search = '', hash = '' } = {}) {
  const params = new URLSearchParams(search);
  params.delete('studio');
  params.delete('tabstudio');
  const q = params.toString();
  const keep = STUDIOS.includes(mode) ? `#${mode}` : STUDIOS.some((s) => hash === `#${s}`) ? '' : hash;
  return `${pathname}${q ? `?${q}` : ''}${keep}`;
}
