// EMBLÈMES DES RANGS (SVG vectoriels, nets à toutes les tailles). Chaque rang a sa propre silhouette,
// sa matière et son symbole ; les niveaux I, II, III ajoutent des finitions progressives :
//   I   : l'emblème seul ;
//   II  : + liseré intérieur clair (bord travaillé) ;
//   III : + ailettes latérales et gemme au sommet.
// Une rangée de 1 à 3 losanges sous l'emblème rappelle le niveau. Zénith, rang ultime, n'a pas de niveau.
import { RANKED_TIERS } from '../data/ranked.js';

let uid = 0;
const pts = (arr) => arr.map((p) => p.join(',')).join(' ');
const star = (cx, cy, n, r1, r2, rot = -90) => pts(Array.from({ length: n * 2 }, (_, i) => {
  const a = ((rot + (i * 180) / n) * Math.PI) / 180, r = i % 2 ? r2 : r1;
  return [+(cx + Math.cos(a) * r).toFixed(2), +(cy + Math.sin(a) * r).toFixed(2)];
}));

// Silhouette (forme pleine) et symbole de chaque rang. `g` = ids des dégradés de l'instance.
const SHAPES = {
  // Ruine : tablette de pierre brisée, fissurée, une arche gravée — le commencement.
  ruine: {
    body: `<polygon points="22,14 60,10 66,21 74,17 84,22 85,60 72,84 30,86 15,62 17,30" />`,
    symbol: (t) => `
      <path d="M61 12 L55 28 L61 37 L53 54" fill="none" stroke="${t.dark}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity=".75"/>
      <path d="M36 70 V52 Q50 34 64 52 V70" fill="none" stroke="${t.dark}" stroke-width="7" stroke-linecap="round"/>
      <path d="M36 70 V52 Q50 34 64 52 V70" fill="none" stroke="${t.light}" stroke-width="2" stroke-linecap="round" opacity=".55" transform="translate(-1 -1.5)"/>
      <rect x="31" y="70" width="38" height="5" rx="2" fill="${t.dark}" opacity=".8"/>`,
  },
  // Onde : médaillon rond traversé de vagues — le premier mouvement.
  onde: {
    body: `<circle cx="50" cy="48" r="37" />`,
    symbol: (t, g) => `
      <g clip-path="url(#${g}c)">
        <path d="M6 58 q11 -10 22 0 t22 0 t22 0 t22 0 V92 H6Z" fill="${t.dark}" opacity=".55"/>
        <path d="M6 46 q11 -10 22 0 t22 0 t22 0 t22 0" fill="none" stroke="${t.light}" stroke-width="5" stroke-linecap="round"/>
        <path d="M6 60 q11 -10 22 0 t22 0 t22 0 t22 0" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" opacity=".9"/>
        <path d="M6 33 q11 -8 22 0 t22 0 t22 0 t22 0" fill="none" stroke="${t.light}" stroke-width="2.2" stroke-linecap="round" opacity=".6"/>
      </g>`,
    clip: `<circle cx="50" cy="48" r="37" />`,
  },
  // Flux : goutte d'énergie, deux courants tressés qui montent.
  flux: {
    body: `<path d="M50 7 C73 28 81 51 71 70 C65 82 57 88 50 90 C43 88 35 82 29 70 C19 51 27 28 50 7Z" />`,
    symbol: (t) => `
      <path d="M38 78 C28 58 66 50 57 26" fill="none" stroke="${t.dark}" stroke-width="7" stroke-linecap="round" opacity=".6"/>
      <path d="M62 78 C72 58 34 50 43 26" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
      <path d="M38 78 C28 58 66 50 57 26" fill="none" stroke="${t.light}" stroke-width="4.4" stroke-linecap="round"/>
      <circle cx="50" cy="20" r="3.4" fill="#fff"/>`,
  },
  // Nova : étoile à huit branches autour d'un cœur incandescent — la montée en puissance.
  nova: {
    body: `<polygon points="${star(50, 48, 8, 42, 21)}" />`,
    symbol: (t, g) => `
      <polygon points="${star(50, 48, 4, 30, 7, -45)}" fill="${t.light}" opacity=".55"/>
      <circle cx="50" cy="48" r="14" fill="url(#${g}r)" stroke="${t.dark}" stroke-width="2"/>
      <circle cx="46" cy="44" r="4" fill="#fff" opacity=".9"/>`,
  },
  // Vortex : losange aux angles adoucis, spirale qui aspire tout vers le centre.
  vortex: {
    body: `<rect x="23" y="21" width="54" height="54" rx="11" transform="rotate(45 50 48)" />`,
    symbol: (t) => {
      const sp = Array.from({ length: 60 }, (_, i) => { const a = (i / 59) * 3.1 * Math.PI, r = 2.5 + a * 2.55; return `${(50 + Math.cos(a - 1.2) * r).toFixed(1)},${(48 + Math.sin(a - 1.2) * r).toFixed(1)}`; }).join(' ');
      return `
      <polyline points="${sp}" fill="none" stroke="${t.dark}" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>
      <polyline points="${sp}" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="50" cy="48" r="3" fill="${t.light}"/>`;
    },
  },
  // Pulse : cristal à facettes traversé d'une pulsation — prestige vibrant.
  pulse: {
    body: `<polygon points="50,6 79,25 79,67 50,90 21,67 21,25" />`,
    symbol: (t) => `
      <path d="M50 6 L50 90 M21 25 L79 67 M79 25 L21 67" stroke="${t.light}" stroke-width="1.2" opacity=".35"/>
      <polygon points="50,20 66,32 66,62 50,74 34,62 34,32" fill="${t.dark}" opacity=".45"/>
      <path d="M22 50 H36 L42 36 L51 66 L57 44 L61 50 H78" fill="none" stroke="${t.dark}" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round" opacity=".6"/>
      <path d="M22 50 H36 L42 36 L51 66 L57 44 L61 50 H78" fill="none" stroke="#fff" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  // Apex : écu doré, double sommet et étoile — le haut de la montagne.
  apex: {
    body: `<path d="M50 7 L83 18 V46 C83 66 69 80 50 90 C31 80 17 66 17 46 V18Z" />`,
    symbol: (t) => `
      <path d="M26 70 L50 36 L74 70Z" fill="${t.dark}" opacity=".55"/>
      <path d="M26 70 L50 36 L74 70" fill="none" stroke="#fff" stroke-width="4.6" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="M38 70 L50 53 L62 70" fill="none" stroke="${t.light}" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/>
      <polygon points="${star(50, 23, 4, 7.5, 2.6)}" fill="#fff"/>`,
  },
  // Titan : plaque octogonale massive, rivets et enclume — la force brute.
  titan: {
    body: `<polygon points="33,9 67,9 87,29 87,65 67,87 33,87 13,65 13,29" />`,
    symbol: (t) => `
      <polygon points="37,18 63,18 78,33 78,61 63,77 37,77 22,61 22,33" fill="${t.dark}" opacity=".5"/>
      <path d="M20 36 H72 C72 44 66 50 58 50 V58 H64 L68 68 H32 L36 58 H42 V50 C34 50 26 45 20 36Z" fill="${t.light}" stroke="${t.dark}" stroke-width="2.6" stroke-linejoin="round"/>
      <path d="M26 39 H68" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>
      ${[[24, 24], [76, 24], [24, 72], [76, 72]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.2" fill="${t.light}" stroke="${t.dark}" stroke-width="1.4"/>`).join('')}`,
  },
  // Nexus : hexagone-réseau, nœuds reliés autour d'un cœur — la maîtrise.
  nexus: {
    body: `<polygon points="28,11 72,11 93,48 72,85 28,85 7,48" />`,
    symbol: (t) => {
      const n = Array.from({ length: 6 }, (_, k) => { const a = ((30 + 60 * k) * Math.PI) / 180; return [50 + Math.cos(a) * 25, 48 + Math.sin(a) * 25]; });
      return `
      <polygon points="${pts(n.map(([x, y]) => [x.toFixed(1), y.toFixed(1)]))}" fill="none" stroke="${t.light}" stroke-width="2" opacity=".6"/>
      ${n.map(([x, y]) => `<path d="M50 48 L${x.toFixed(1)} ${y.toFixed(1)}" stroke="#fff" stroke-width="2.4" opacity=".9"/>`).join('')}
      ${n.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.4" fill="${t.light}" stroke="${t.dark}" stroke-width="1.6"/>`).join('')}
      <circle cx="50" cy="48" r="8" fill="#fff" stroke="${t.dark}" stroke-width="2"/>`;
    },
  },
};

// Zénith : soleil couronné à douze rayons, flanqué de deux ailes — le rang ultime.
function zenith(t, g) {
  const rays = Array.from({ length: 12 }, (_, k) => {
    const a = ((k * 30 - 90) * Math.PI) / 180, r = k % 2 ? 38 : 50, w = k % 2 ? 4.5 : 6;
    const p = (rr, da) => [50 + Math.cos(a + da) * rr, 48 + Math.sin(a + da) * rr].map((v) => v.toFixed(1)).join(',');
    return `${p(20, -w / 20)} ${p(r, 0)} ${p(20, w / 20)}`;
  });
  const wing = (s) => `<path transform="translate(50 0) scale(${s} 1) translate(-50 0)" d="M32 60 C14 60 2 46 0 26 C10 36 18 38 25 37 C14 32 7 22 6 10 C16 22 24 26 32 26 C26 22 22 15 22 6 C30 16 36 20 40 22" fill="url(#${g}w)" stroke="${t.dark}" stroke-width="2" stroke-linejoin="round"/>`;
  return `
    ${wing(1)}${wing(-1)}
    ${rays.map((r) => `<polygon points="${r}" fill="url(#${g}m)" stroke="${t.dark}" stroke-width="1.6" stroke-linejoin="round"/>`).join('')}
    <circle cx="50" cy="48" r="25" fill="${t.dark}"/>
    <circle cx="50" cy="48" r="22" fill="url(#${g}r)" stroke="${t.main}" stroke-width="2.4"/>
    <circle cx="50" cy="48" r="16.5" fill="none" stroke="#fff" stroke-width="1.6" opacity=".7"/>
    <path d="M38 44 L41 32 L46 39 L50 29 L54 39 L59 32 L62 44Z" fill="#fff" stroke="${t.dark}" stroke-width="1.8" stroke-linejoin="round"/>
    <polygon points="${star(50, 55, 4, 7, 2.4)}" fill="${t.dark}"/>`;
}

/**
 * SVG de l'emblème. tierIndex : 0 (Ruine) à 9 (Zénith) ; level : 0, 1, 2 (I, II, III), ignoré pour Zénith.
 * opts : { size (px), pips (afficher les losanges du niveau, défaut true), title }.
 */
export function rankEmblem(tierIndex, level = 0, { size = 48, pips = true, title = '' } = {}) {
  const t = RANKED_TIERS[Math.max(0, Math.min(RANKED_TIERS.length - 1, tierIndex))];
  const g = `rk${++uid}`;
  const isZenith = t.id === 'zenith';
  const lv = isZenith ? 2 : Math.max(0, Math.min(2, level ?? 0));
  const S = SHAPES[t.id];
  const defs = `
    <defs>
      <linearGradient id="${g}m" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${t.light}"/><stop offset=".45" stop-color="${t.main}"/><stop offset="1" stop-color="${t.dark}"/></linearGradient>
      <radialGradient id="${g}r" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="${t.light}"/><stop offset="1" stop-color="${t.main}"/></radialGradient>
      <linearGradient id="${g}w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="${t.main}"/></linearGradient>
      <linearGradient id="${g}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
      ${S?.clip ? `<clipPath id="${g}c">${S.clip}</clipPath>` : ''}
      ${S ? `<clipPath id="${g}b">${S.body}</clipPath>` : ''}
    </defs>`;
  let art;
  if (isZenith) art = zenith(t, g);
  else {
    // III : ailettes derrière la silhouette ; II et III : liseré intérieur ; III : gemme au sommet
    const fins = lv >= 2 ? `
      <path d="M17 40 L2 30 L6 50 L2 66 L18 58Z" fill="url(#${g}m)" stroke="${t.dark}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M83 40 L98 30 L94 50 L98 66 L82 58Z" fill="url(#${g}m)" stroke="${t.dark}" stroke-width="2" stroke-linejoin="round"/>` : '';
    const body = S.body.replace('/>', ` fill="url(#${g}m)" stroke="${t.dark}" stroke-width="3" stroke-linejoin="round"/>`);
    const trim = lv >= 1 ? `<g transform="translate(50 48) scale(.84) translate(-50 -48)">${S.body.replace('/>', ` fill="none" stroke="${t.light}" stroke-width="2.8" stroke-linejoin="round" opacity=".95"/>`)}</g>` : '';
    const shine = `<g clip-path="url(#${g}b)"><rect x="0" y="0" width="100" height="52" fill="url(#${g}s)"/></g>`;
    const gem = lv >= 2 ? `<polygon points="50,0 56,7 50,14 44,7" fill="#fff" stroke="${t.dark}" stroke-width="1.8" stroke-linejoin="round"/>` : '';
    art = `${fins}${body}${trim}${S.symbol(t, g)}${shine}${gem}`;
  }
  const pip = pips && !isZenith ? `<g>${Array.from({ length: lv + 1 }, (_, i) => {
    const x = 50 + (i - lv / 2) * 10;
    return `<polygon points="${x},93 ${x + 4},98 ${x},103 ${x - 4},98" fill="${t.light}" stroke="${t.dark}" stroke-width="1.4" stroke-linejoin="round"/>`;
  }).join('')}</g>` : '';
  const label = title || (isZenith ? t.name : `${t.name} ${['I', 'II', 'III'][lv]}`);
  return `<svg class="rank-emblem rk-${t.id} lv-${lv + 1}" viewBox="0 0 100 106" width="${size}" height="${Math.round(size * 1.06)}" role="img" aria-label="${label}">${defs}${art}${pip}</svg>`;
}
