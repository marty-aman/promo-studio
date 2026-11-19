// Stage plot drawings: each piece of gear seen from above, as sound engineers read a plot (the
// audience at the bottom). Plain SVG strings with shared gradients and textures (GEAR_DEFS), so the
// same drawing works on the page and in the printed PDF.

const f1 = (v) => Math.round(v * 10) / 10;

/** A drum from above: the shell edge, a coated head, the chrome hoop and its tension lugs. */
function drum(cx, cy, r, lugs = 8) {
  let out = `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r + 2.5)}" fill="#1e1f24"/><circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" fill="url(#spg-head)" stroke="url(#spg-chrome)" stroke-width="${f1(Math.max(1.6, r * 0.12))}"/>`;
  for (let i = 0; i < lugs; i++) {
    const a = (i / lugs) * Math.PI * 2 + 0.2;
    out += `<rect x="${f1(cx + Math.cos(a) * (r + 3.2) - 1.6)}" y="${f1(cy + Math.sin(a) * (r + 3.2) - 1.6)}" width="3.2" height="3.2" rx="0.8" fill="#c9ccd2" stroke="#55585f" stroke-width="0.6"/>`;
  }
  return out;
}

/** A cymbal from above: bronze with lathe rings and a raised bell. */
function cymbal(cx, cy, r) {
  let rings = '';
  for (let k = 0.35; k < 1; k += 0.13) rings += `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r * k)}" fill="none" stroke="#6b4a12" stroke-width="0.5" opacity="0.35"/>`;
  return `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" fill="url(#spg-bronze)" stroke="#7a5516" stroke-width="1.2"/>${rings}<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r * 0.24)}" fill="url(#spg-bell)" stroke="#7a5516" stroke-width="0.8"/><circle cx="${f1(cx)}" cy="${f1(cy)}" r="1.8" fill="#3b3b3b"/>`;
}

/** A speaker cone with its dust cap. */
const cone = (cx, cy, r) => `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" fill="url(#spg-cone)" stroke="#0c0c0e" stroke-width="1"/><circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r * 0.3)}" fill="#2b2c31" stroke="#55565c" stroke-width="0.6"/>`;

/** A mic stand from above: tripod legs, the boom arm and the mic's mesh grille. */
function micStand(cx, cy, boom = 16) {
  let legs = '';
  for (const a of [30, 150, 270]) {
    const r = (a * Math.PI) / 180;
    legs += `<line x1="${cx}" y1="${cy}" x2="${f1(cx + Math.cos(r) * 14)}" y2="${f1(cy + Math.sin(r) * 14)}" stroke="#2a2b30" stroke-width="2.4" stroke-linecap="round"/>`;
  }
  const my = cy - boom;
  return `${legs}<circle cx="${cx}" cy="${cy}" r="3.4" fill="#3a3b41"/><line x1="${cx}" y1="${cy}" x2="${cx}" y2="${my}" stroke="#46474d" stroke-width="2.2" stroke-linecap="round"/><rect x="${cx - 2.6}" y="${my + 3}" width="5.2" height="9" rx="2" fill="#2a2b30"/><circle cx="${cx}" cy="${my}" r="6.5" fill="url(#spg-mesh)" stroke="#2a2b30" stroke-width="1.1"/>`;
}

/**
 * The drawing for one piece of gear of type `type`, `w` × `h`, centred on (cx, cy). Returns
 * { shape, hit } where hit is the grab box (outlined when the piece is selected).
 */
export function drawGear(type, w, h, cx, cy) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  let shape = '';
  let hit = { x: x - 6, y: y - 6, w: w + 12, h: h + 12 };
  switch (type) {
    case 'drums': {
      // the drummer sits at the back (top); the kick points at the audience
      const k = w / 190;
      const X = (v) => cx + v * k;
      const Y = (v) => cy + v * k;
      shape =
        `<circle cx="${f1(X(0))}" cy="${f1(Y(-50))}" r="${f1(13 * k)}" fill="#2a2b30" stroke="#111" stroke-width="1"/><circle cx="${f1(X(0))}" cy="${f1(Y(-50))}" r="${f1(9 * k)}" fill="#3c3d43"/>` +
        `<rect x="${f1(X(-32))}" y="${f1(Y(-12))}" width="${f1(64 * k)}" height="${f1(74 * k)}" rx="${f1(8 * k)}" fill="url(#spg-shell)" stroke="#111" stroke-width="1.4"/>` +
        `<rect x="${f1(X(-30))}" y="${f1(Y(58))}" width="${f1(60 * k)}" height="${f1(7 * k)}" rx="2" fill="url(#spg-head)" stroke="url(#spg-chrome)" stroke-width="1.6"/>` +
        `<rect x="${f1(X(-6))}" y="${f1(Y(-30))}" width="${f1(12 * k)}" height="${f1(14 * k)}" rx="2" fill="#2d2e33"/>` +
        drum(X(-34), Y(-26), 17 * k, 10) +
        drum(X(-14), Y(-4), 13 * k, 6) +
        drum(X(14), Y(-4), 14 * k, 6) +
        drum(X(48), Y(-14), 20 * k, 8) +
        cymbal(X(-64), Y(-32), 15 * k) +
        cymbal(X(-58), Y(18), 24 * k) +
        cymbal(X(68), Y(30), 27 * k);
      break;
    }
    case 'guitar':
    case 'bass': {
      // a cabinet seen at its front edge: tolex, grille cloth, speakers; a bass rig has a head on top
      const bass = type === 'bass';
      const ch = h - 12;
      const spots = bass ? [[-0.24, 0.28], [0.24, 0.28], [-0.24, 0.72], [0.24, 0.72]] : [[-0.24, 0.55], [0.24, 0.55]];
      const r = Math.min(w * 0.19, ch * (bass ? 0.21 : 0.36));
      const head = bass
        ? `<rect x="${f1(x + 4)}" y="${f1(y - 12)}" width="${f1(w - 8)}" height="12" rx="2" fill="#26272c" stroke="#0e0e10"/>${[14, 22, 30].map((d) => `<circle cx="${f1(x + d)}" cy="${f1(y - 6)}" r="2.2" fill="#d6d8dc"/>`).join('')}<rect x="${f1(x + w - 22)}" y="${f1(y - 9)}" width="10" height="5" rx="1" fill="#e0182d"/>`
        : '';
      shape =
        `${head}<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="url(#spg-tolex)" stroke="#0b0b0d" stroke-width="1.4"/>` +
        `<rect x="${x + 5}" y="${y + 6}" width="${w - 10}" height="${ch}" rx="3" fill="url(#spg-grille)" stroke="#000" stroke-width="0.8"/>` +
        spots.map(([dx, dy]) => cone(cx + dx * w, y + 6 + dy * ch, r)).join('') +
        `<rect x="${f1(cx - 9)}" y="${f1(y + 1.5)}" width="18" height="4" rx="2" fill="#c8a24a"/>`;
      if (bass) hit = { ...hit, y: hit.y - 12, h: hit.h + 12 };
      break;
    }
    case 'keys': {
      const n = 24;
      const kw = (w - 12) / n;
      let keys = '';
      for (let i = 0; i < n; i++) keys += `<rect x="${f1(x + 6 + i * kw)}" y="${y + 14}" width="${f1(kw - 0.6)}" height="${h - 18}" rx="0.8" fill="#fbfbf8" stroke="#9a9a9a" stroke-width="0.4"/>`;
      for (let i = 0; i < n - 1; i++) if (![2, 6].includes(i % 7)) keys += `<rect x="${f1(x + 6 + (i + 0.68) * kw)}" y="${y + 14}" width="${f1(kw * 0.64)}" height="${f1((h - 18) * 0.6)}" rx="0.6" fill="#141414"/>`;
      shape =
        `<line x1="${x + 10}" y1="${y + h + 4}" x2="${x + w - 10}" y2="${y - 4}" stroke="#3a3b41" stroke-width="3"/><line x1="${x + 10}" y1="${y - 4}" x2="${x + w - 10}" y2="${y + h + 4}" stroke="#3a3b41" stroke-width="3"/>` +
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#24252a" stroke="#0e0e10" stroke-width="1.2"/><rect x="${x + 8}" y="${y + 4}" width="26" height="6" rx="1" fill="#5ad1ff" opacity="0.85"/>` +
        `<circle cx="${x + w - 14}" cy="${y + 7}" r="2.6" fill="#c8ccd2"/><circle cx="${x + w - 24}" cy="${y + 7}" r="2.6" fill="#c8ccd2"/>${keys}`;
      break;
    }
    case 'vocal':
      shape = micStand(cx, cy + 5);
      break;
    case 'di':
      shape = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="url(#spg-steel)" stroke="#2c2d31" stroke-width="1.2"/><circle cx="${x + 7}" cy="${cy + 2}" r="3.4" fill="#1b1c20" stroke="#9aa0a8"/><circle cx="${x + w - 7}" cy="${cy + 2}" r="4" fill="#1b1c20" stroke="#9aa0a8"/><rect x="${cx - 2.5}" y="${y + 3}" width="5" height="7" rx="1" fill="#e9eaec" stroke="#555"/>`;
      break;
    case 'tracks': {
      // an open laptop and an audio interface beside it
      const s = h * 0.48;
      shape =
        `<rect x="${x}" y="${y}" width="${w}" height="${f1(s)}" rx="3" fill="#2b2d33" stroke="#111"/><rect x="${x + 4}" y="${y + 3}" width="${w - 8}" height="${f1(s - 6)}" rx="1.5" fill="url(#spg-screen)"/>` +
        `<rect x="${x - 2}" y="${f1(y + h * 0.5)}" width="${w + 4}" height="${f1(h * 0.5)}" rx="3" fill="#c3c7cd" stroke="#6b6f76"/><rect x="${x + 6}" y="${f1(y + h * 0.56)}" width="${w - 12}" height="${f1(h * 0.24)}" rx="1" fill="#8d9199"/>` +
        `<rect x="${x + w + 6}" y="${y + 6}" width="18" height="${h - 12}" rx="2" fill="#c43c3c" stroke="#5a1414"/><circle cx="${x + w + 15}" cy="${y + 14}" r="3" fill="#222"/><circle cx="${x + w + 15}" cy="${y + 24}" r="3" fill="#222"/>`;
      hit = { ...hit, w: hit.w + 28 };
      break;
    }
    case 'wedge':
      shape =
        `<path d="M${x} ${y + h}L${x + 9} ${y}H${x + w - 9}L${x + w} ${y + h}Z" fill="url(#spg-tolex)" stroke="#0b0b0d" stroke-width="1.4"/>` +
        `<path d="M${x + 7} ${y + h - 4}L${x + 13} ${y + 4}H${x + w - 13}L${x + w - 7} ${y + h - 4}Z" fill="url(#spg-grille)"/>` +
        cone(cx - w * 0.17, cy + 1, h * 0.3) +
        `<circle cx="${f1(cx + w * 0.19)}" cy="${cy + 1}" r="${f1(h * 0.17)}" fill="#18191c" stroke="#55565c"/>`;
      break;
    case 'iem':
      shape = `<line x1="${cx + 6}" y1="${y + 2}" x2="${cx + 10}" y2="${y - 10}" stroke="#2a2b30" stroke-width="2" stroke-linecap="round"/><rect x="${x + 4}" y="${y + 2}" width="${w - 8}" height="${h - 4}" rx="4" fill="#33353b" stroke="#0e0e10"/><rect x="${x + 8}" y="${y + 6}" width="${w - 16}" height="7" rx="1" fill="#79e08c"/><circle cx="${cx}" cy="${y + h - 8}" r="3.4" fill="#9aa0a8"/>`;
      break;
    case 'power': {
      let sockets = '';
      for (let i = 0; i < 3; i++) sockets += `<rect x="${cx - 7}" y="${f1(y + 4 + i * 8)}" width="14" height="6" rx="1.5" fill="#f4f4f2" stroke="#999" stroke-width="0.5"/><rect x="${cx - 3.5}" y="${f1(y + 5.5 + i * 8)}" width="1.4" height="3" fill="#333"/><rect x="${cx + 2}" y="${f1(y + 5.5 + i * 8)}" width="1.4" height="3" fill="#333"/>`;
      shape = `<rect x="${cx - 10}" y="${y}" width="20" height="${h}" rx="3" fill="#2b2c31" stroke="#0e0e10"/>${sockets}<rect x="${cx - 4}" y="${y + h - 3}" width="8" height="3" fill="#e0182d"/><path d="M${cx} ${y + h}c0 8 8 6 10 14" fill="none" stroke="#111" stroke-width="2"/>`;
      break;
    }
    case 'riser': {
      let planks = '';
      for (let i = 1; i < 5; i++) planks += `<line x1="${x + 6}" y1="${f1(y + (h / 5) * i)}" x2="${x + w - 6}" y2="${f1(y + (h / 5) * i)}" stroke="#5b3d22" stroke-width="1" opacity="0.5"/>`;
      shape = `<rect x="${x + 4}" y="${y + 6}" width="${w}" height="${h}" rx="5" fill="#000" opacity="0.18"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="url(#spg-carpet)" stroke="#3b2a1a" stroke-width="2"/>${planks}`;
      break;
    }
    case 'person':
      shape = `<ellipse cx="${cx}" cy="${cy + 4}" rx="20" ry="11" fill="#3d4b66" stroke="#1d2433"/><circle cx="${cx}" cy="${cy}" r="9" fill="#d9a882" stroke="#7a5236"/><path d="M${cx - 9} ${cy - 1}a9 9 0 0 1 18 0c-3 -4 -14 -4 -18 0z" fill="#2b2017"/>`;
      break;
    default:
      shape = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#d9d9d9" stroke="#222" stroke-width="2"/>`;
  }
  return { shape, hit: `<rect class="sp-hit" x="${f1(hit.x)}" y="${f1(hit.y)}" width="${f1(hit.w)}" height="${f1(hit.h)}" rx="6"/>` };
}

/** Gradients and textures the drawings share (ids prefixed so they don't clash with the page). */
export const GEAR_DEFS = `<defs>
<radialGradient id="spg-head" cx="45%" cy="40%" r="65%"><stop offset="0" stop-color="#ffffff"/><stop offset="0.7" stop-color="#eeeae0"/><stop offset="1" stop-color="#d6d0c2"/></radialGradient>
<linearGradient id="spg-chrome" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f5f6f8"/><stop offset="0.45" stop-color="#8d939c"/><stop offset="0.55" stop-color="#e2e5e9"/><stop offset="1" stop-color="#6c7179"/></linearGradient>
<radialGradient id="spg-bronze" cx="42%" cy="38%" r="70%"><stop offset="0" stop-color="#f6d98b"/><stop offset="0.55" stop-color="#d9a441"/><stop offset="1" stop-color="#a8741f"/></radialGradient>
<radialGradient id="spg-bell" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fff0c0"/><stop offset="1" stop-color="#c58f2e"/></radialGradient>
<linearGradient id="spg-shell" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a0d12"/><stop offset="0.5" stop-color="#8e1b26"/><stop offset="1" stop-color="#3a0d12"/></linearGradient>
<radialGradient id="spg-cone" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#4a4b51"/><stop offset="0.75" stop-color="#1b1c20"/><stop offset="1" stop-color="#38393f"/></radialGradient>
<pattern id="spg-grille" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="#2a2620"/><path d="M0 4L4 0" stroke="#4a4236" stroke-width="0.9"/></pattern>
<pattern id="spg-tolex" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="#18181b"/><circle cx="1" cy="1" r="0.5" fill="#2a2a2f"/></pattern>
<pattern id="spg-mesh" width="2.4" height="2.4" patternUnits="userSpaceOnUse"><rect width="2.4" height="2.4" fill="#b9bdc4"/><circle cx="1.2" cy="1.2" r="0.6" fill="#5c6067"/></pattern>
<pattern id="spg-carpet" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#a0764b"/><path d="M0 3H6M3 0V6" stroke="#8c6640" stroke-width="0.6" opacity="0.6"/></pattern>
<pattern id="spg-floor" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#f4f2ee"/><path d="M40 0H0V40" fill="none" stroke="#e2ded6" stroke-width="1"/></pattern>
<linearGradient id="spg-steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a6fa5"/><stop offset="1" stop-color="#28426a"/></linearGradient>
<linearGradient id="spg-screen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c3b6e"/><stop offset="1" stop-color="#3a7bd5"/></linearGradient>
</defs>`;
