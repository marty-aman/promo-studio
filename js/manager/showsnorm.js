// The show normaliser, kept out of model.js so each build adds its own line to SHOW_EXTRAS.
// normalizeShow(s, d): `s` is the saved show, `d` a fresh newShow() (model.js passes it).

/**
 * Extra normalisers run after the core ones, in order. A build appends ONE line: `s => s` that
 * returns the show with its own field checked, e.g. `(s) => ({ ...s, advance: normalizeAdvance(s.advance) })`.
 */
export const SHOW_EXTRAS = [];

export function normalizeShow(s, d) {
  const core = { ...d, ...s, posterId: typeof s.posterId === 'string' && s.posterId ? s.posterId : null, settlement: { ...d.settlement, ...(s.settlement || {}), shares: s.settlement && s.settlement.shares && typeof s.settlement.shares === 'object' && !Array.isArray(s.settlement.shares) ? { ...s.settlement.shares } : {} } };
  return SHOW_EXTRAS.reduce((acc, fn) => fn(acc), core);
}
