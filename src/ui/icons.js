// Icônes SVG inline (originales, style trait arrondi).
const svg = (body, fill = 'none') =>
  `<svg viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

// Pièce STRIKE : pièce d'or épaisse vue légèrement de dessus (tranche cannelée visible), listel en relief,
// S frappé en relief dans le métal (pas de noir), reflet spéculaire. Vectoriel, net à toutes les tailles ;
// identifiants de dégradés uniques à chaque appel (plusieurs pièces dans la page).
let coinUid = 0;
export function strikeCoin() {
  const k = `sc${coinUid++}`;
  const S = 'M15.6 8.9c-.8-1.3-2.2-2.1-3.9-2.1-2.4 0-4.1 1.4-4.1 3.3 0 2.1 1.7 2.8 3.8 3.4 1.4.4 1.9.7 1.9 1.3 0 .7-.7 1.2-1.8 1.2-1.2 0-2.2-.6-2.9-1.6l-2 1.7c1.1 1.5 2.9 2.4 4.9 2.4 2.7 0 4.5-1.5 4.5-3.6 0-2.2-1.7-2.9-3.9-3.5-1.3-.4-1.8-.6-1.8-1.2 0-.6.6-1 1.4-1 1 0 1.7.4 2.3 1.1z';
  const ridges = Array.from({ length: 15 }, (_, i) => { const x = 3 + i * 1.29; return `<path d="M${x.toFixed(2)} 13.4v2.1" />`; }).join('');
  return `<svg viewBox="0 0 24 24" aria-hidden="true" class="strike-coin">
    <defs>
      <linearGradient id="${k}e" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6e4305"/><stop offset=".3" stop-color="#c88a17"/><stop offset=".55" stop-color="#8d5a08"/><stop offset="1" stop-color="#4d2e03"/></linearGradient>
      <linearGradient id="${k}r" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="#fff4c4"/><stop offset=".35" stop-color="#f3c247"/><stop offset=".75" stop-color="#c58612"/><stop offset="1" stop-color="#8f5b07"/></linearGradient>
      <radialGradient id="${k}f" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#ffe7a0"/><stop offset=".5" stop-color="#e9b33a"/><stop offset="1" stop-color="#b47a0e"/></radialGradient>
      <linearGradient id="${k}s" x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stop-color="#fff6cf"/><stop offset=".5" stop-color="#f7cf5c"/><stop offset="1" stop-color="#c88b16"/></linearGradient>
    </defs>
    <ellipse cx="12" cy="15.6" rx="10.4" ry="7.6" fill="#000" opacity=".28"/>
    <path d="M1.6 11.2v2.6c0 4.2 4.66 7.6 10.4 7.6s10.4-3.4 10.4-7.6v-2.6z" fill="url(#${k}e)"/>
    <g stroke="#3d2402" stroke-width=".35" opacity=".55">${ridges}</g>
    <ellipse cx="12" cy="11.2" rx="10.4" ry="9.2" fill="url(#${k}r)" stroke="#5a3804" stroke-width=".55"/>
    <ellipse cx="12" cy="11.2" rx="8.3" ry="7.3" fill="url(#${k}f)" stroke="#8a5908" stroke-width=".7"/>
    <ellipse cx="12" cy="11.4" rx="8.3" ry="7.3" fill="none" stroke="#fff3c0" stroke-width=".35" opacity=".5"/>
    <g transform="translate(12 11.2) scale(.92 .82) translate(-12 -12)">
      <path d="${S}" transform="translate(.35 .55)" fill="#7a4c05" opacity=".75"/>
      <path d="${S}" fill="url(#${k}s)" stroke="#9a6409" stroke-width=".3"/>
    </g>
    <path d="M4.6 7.4C6.2 4.6 9.4 3.1 13 3.3" fill="none" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".75"/>
  </svg>`;
}

// Diamant STRIKE : brillant vu de profil (couronne à 10 facettes, rondiste, pavillon profond à 6 facettes),
// dégradés de cristal à saphir profond, touches irisées, arêtes fines et éclat. Dégradés uniques par appel.
let gemUid = 0;
export function strikeGem() {
  const k = `sg${gemUid++}`;
  const P = { L: [2.4, 9], TL: [6.4, 3.3], T1: [9, 3.3], Tm: [12, 3.3], T2: [15, 3.3], TR: [17.6, 3.3], R: [21.6, 9],
    gA: [5.6, 9], gB: [8.8, 9], gC: [12, 9], gD: [15.2, 9], gE: [18.4, 9], C: [12, 22.4] };
  const tri = (a, b, c, g, o) => `<polygon points="${[a, b, c].map((n) => P[n].join(',')).join(' ')}" fill="url(#${k}${g})"${o ? ` opacity="${o}"` : ''}/>`;
  const stop = (o, c) => `<stop offset="${o}" stop-color="${c}"/>`;
  const lg = (id, c0, c1, x2 = '.25') => `<linearGradient id="${k}${id}" x1="0" y1="0" x2="${x2}" y2="1">${stop(0, c0)}${stop(1, c1)}</linearGradient>`;
  return `<svg viewBox="0 0 24 24" aria-hidden="true" class="strike-gem">
    <defs>
      ${lg('a', '#ffffff', '#c6f7ff')}${lg('b', '#d9fbff', '#66d4ff')}${lg('c', '#7ddcff', '#2b8ff0')}
      ${lg('d', '#3f9cf5', '#2448c4')}${lg('e', '#2a5fd6', '#2a1d8a')}${lg('p', '#b9f7ff', '#b79cff', '1')}
      <radialGradient id="${k}h" cx=".5" cy=".5" r=".5">${stop(0, '#fff')}<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    </defs>
    ${tri('L', 'TL', 'gA', 'c')}${tri('TL', 'T1', 'gA', 'b')}${tri('T1', 'gB', 'gA', 'a')}${tri('T1', 'Tm', 'gB', 'b')}${tri('Tm', 'gC', 'gB', 'a')}
    ${tri('Tm', 'gD', 'gC', 'b')}${tri('Tm', 'T2', 'gD', 'a')}${tri('T2', 'gE', 'gD', 'c')}${tri('T2', 'TR', 'gE', 'b')}${tri('TR', 'R', 'gE', 'd')}
    <polygon points="2.4,9 21.6,9 21.4,9.7 2.6,9.7" fill="#e9fdff" opacity=".85"/>
    ${tri('L', 'gA', 'C', 'c')}${tri('gA', 'gB', 'C', 'p', '.95')}${tri('gB', 'gC', 'C', 'a', '.9')}${tri('gC', 'gD', 'C', 'd')}${tri('gD', 'gE', 'C', 'c')}${tri('gE', 'R', 'C', 'e')}
    <path d="M2.4 9 6.4 3.3h11.2l4 5.7L12 22.4z" fill="none" stroke="#0b2c72" stroke-width=".5" stroke-linejoin="round"/>
    <path d="M2.4 9h19.2M5.6 9 12 22.4 8.8 9M12 9v13.4M15.2 9 12 22.4l6.4-13.4M6.4 3.3 5.6 9 9 3.3 8.8 9 12 3.3 12 9M12 3.3 15.2 9 15 3.3 18.4 9 17.6 3.3"
      fill="none" stroke="#fff" stroke-opacity=".32" stroke-width=".25" stroke-linejoin="round"/>
    <ellipse cx="10.6" cy="5.2" rx="3.4" ry="1.4" fill="url(#${k}h)" opacity=".85"/>
    <path d="M9.2 12.2 10.6 18.6" stroke="#fff" stroke-width=".55" stroke-linecap="round" opacity=".55"/>
    <path d="M20.2.6l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5z" fill="#fff"/>
  </svg>`;
}

// Illustrations des boutons de l'accueil (pleines, en relief), dégradés uniques à chaque appel.
let artUid = 0;
/** AMIS : deux joueurs, celui de devant en clair, celui de derrière en turquoise. */
export function friendsArt() {
  const k = `fa${artUid++}`;
  return `<svg viewBox="0 0 48 48" aria-hidden="true" class="hud-art">
    <defs>
      <linearGradient id="${k}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ff7da"/><stop offset="1" stop-color="#1fa98d"/></linearGradient>
      <linearGradient id="${k}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c9e6ff"/></linearGradient>
    </defs>
    <circle cx="31" cy="15" r="7.4" fill="url(#${k}a)" stroke="#0b3a33" stroke-width="2"/>
    <path d="M18.5 38c.6-9 5.6-14 12.5-14s11.9 5 12.5 14z" fill="url(#${k}a)" stroke="#0b3a33" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="18" cy="19" r="8.4" fill="url(#${k}b)" stroke="#11183a" stroke-width="2"/>
    <path d="M3.5 43c.7-10.4 6.3-16 14.5-16s13.8 5.6 14.5 16z" fill="url(#${k}b)" stroke="#11183a" stroke-width="2" stroke-linejoin="round"/>
    <path d="M13.2 15.4c1.4-2.6 4-3.8 6.8-3.2" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`;
}
/** CADEAU : boîte dorée, ruban rouge et gros nœud. */
export function giftArt() {
  const k = `ga${artUid++}`;
  return `<svg viewBox="0 0 48 48" aria-hidden="true" class="hud-art">
    <defs>
      <linearGradient id="${k}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd76a"/><stop offset="1" stop-color="#e08a12"/></linearGradient>
      <linearGradient id="${k}l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0a8"/><stop offset="1" stop-color="#f2b42c"/></linearGradient>
      <linearGradient id="${k}r" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff4a5c"/><stop offset=".5" stop-color="#e01e34"/><stop offset="1" stop-color="#a30f22"/></linearGradient>
    </defs>
    <rect x="7" y="21" width="34" height="23" rx="3" fill="url(#${k}b)" stroke="#6b3b06" stroke-width="2"/>
    <rect x="4.5" y="15" width="39" height="9" rx="3" fill="url(#${k}l)" stroke="#6b3b06" stroke-width="2"/>
    <rect x="20.5" y="15" width="7" height="29" fill="url(#${k}r)" stroke="#6b0a16" stroke-width="1.6"/>
    <path d="M24 15c-3-7-12-9-12-3 0 3 5 4 12 3zM24 15c3-7 12-9 12-3 0 3-5 4-12 3z" fill="url(#${k}r)" stroke="#6b0a16" stroke-width="1.8" stroke-linejoin="round"/>
    <circle cx="24" cy="15" r="2.6" fill="#ff5d6c" stroke="#6b0a16" stroke-width="1.4"/>
    <path d="M9 24.5h10" stroke="#fff6c8" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>
  </svg>`;
}

/** BOUTIQUE : échoppe à auvent rayé, comptoir en bois, pièces et diamant à l'étalage. */
export function shopArt() {
  const k = `sa${artUid++}`;
  const scallops = Array.from({ length: 6 }, (_, i) => `<path d="M${5 + i * 6.33} 17.5a3.17 3.17 0 0 0 6.33 0" fill="${i % 2 ? '#fff4e0' : '#e8323f'}" stroke="#5a1410" stroke-width="1.4"/>`).join('');
  return `<svg viewBox="0 0 48 48" aria-hidden="true" class="hud-art">
    <defs>
      <linearGradient id="${k}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c98a4a"/><stop offset="1" stop-color="#7a4a22"/></linearGradient>
      <linearGradient id="${k}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe07a"/><stop offset="1" stop-color="#e09a14"/></linearGradient>
      <linearGradient id="${k}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9fbff"/><stop offset="1" stop-color="#3a8cf0"/></linearGradient>
    </defs>
    <rect x="8" y="17" width="3" height="24" rx="1" fill="#6b3b16" stroke="#3a1d08" stroke-width="1.2"/>
    <rect x="37" y="17" width="3" height="24" rx="1" fill="#6b3b16" stroke="#3a1d08" stroke-width="1.2"/>
    <path d="M7 8h34l3 9.5H4z" fill="#e8323f" stroke="#5a1410" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M14.5 8 12.3 17.5M21.5 8l-.9 9.5M26.5 8l.9 9.5M33.5 8l2.2 9.5" stroke="#fff4e0" stroke-width="3.4"/>
    <path d="M7 8h34l3 9.5H4z" fill="none" stroke="#5a1410" stroke-width="1.6" stroke-linejoin="round"/>
    ${scallops}
    <rect x="5" y="30" width="38" height="12" rx="2.5" fill="url(#${k}w)" stroke="#3a1d08" stroke-width="1.6"/>
    <path d="M7 34h34M7 38h34" stroke="#5a3214" stroke-width=".9" opacity=".7"/>
    <ellipse cx="15" cy="29.5" rx="5" ry="2.4" fill="#b8740e"/><ellipse cx="15" cy="28" rx="5" ry="2.4" fill="url(#${k}c)" stroke="#6b3b06" stroke-width="1.1"/>
    <ellipse cx="17" cy="25.6" rx="4.4" ry="2.1" fill="url(#${k}c)" stroke="#6b3b06" stroke-width="1.1"/>
    <path d="M28 22h8l2.6 3.2L32 32l-6.6-6.8z" fill="url(#${k}g)" stroke="#0b2c72" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M25.4 25.2h13.2M30 22l2 10 2-10" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width=".6"/>
  </svg>`;
}

/** COMBAT : deux épées croisées (lames d'acier, gardes dorées) devant un éclat. */
export function swordsArt() {
  const k = `sw${artUid++}`;
  const sword = (rot) => `<g transform="rotate(${rot} 24 24)">
      <path d="M22.4 3.5h3.2l.6 25h-4.4z" fill="url(#${k}b)" stroke="#2a2f44" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M24 4.5v23" stroke="#fff" stroke-width=".9" opacity=".7"/>
      <rect x="15.5" y="28" width="17" height="4.2" rx="2.1" fill="url(#${k}g)" stroke="#5a3204" stroke-width="1.2"/>
      <rect x="22" y="32" width="4" height="8.5" rx="1.4" fill="#7a3d14" stroke="#3a1d08" stroke-width="1.1"/>
      <circle cx="24" cy="42.3" r="2.6" fill="url(#${k}g)" stroke="#5a3204" stroke-width="1.1"/>
    </g>`;
  return `<svg viewBox="0 0 48 48" aria-hidden="true" class="hud-art">
    <defs>
      <linearGradient id="${k}b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e9f0ff"/><stop offset=".5" stop-color="#ffffff"/><stop offset="1" stop-color="#9aa8c8"/></linearGradient>
      <linearGradient id="${k}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0a0"/><stop offset="1" stop-color="#e0950f"/></linearGradient>
      <radialGradient id="${k}f" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6c8" stop-opacity=".95"/><stop offset="1" stop-color="#ffb02e" stop-opacity="0"/></radialGradient>
    </defs>
    <circle cx="24" cy="22" r="16" fill="url(#${k}f)"/>
    ${sword(-38)}${sword(38)}
  </svg>`;
}
/** PASSE DE COMBAT : médaillon doré à étoile et rubans. */
export function passArt() {
  const k = `pa${artUid++}`;
  return `<svg viewBox="0 0 48 48" aria-hidden="true" class="hud-art">
    <defs>
      <linearGradient id="${k}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4b8"/><stop offset=".5" stop-color="#ffc83d"/><stop offset="1" stop-color="#c9800c"/></linearGradient>
      <linearGradient id="${k}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b47bff"/><stop offset="1" stop-color="#5a24c8"/></linearGradient>
    </defs>
    <path d="M14 30 9 45l6-3 4 5 5-14zM34 30l5 15-6-3-4 5-5-14z" fill="url(#${k}r)" stroke="#2a0f5e" stroke-width="1.4" stroke-linejoin="round"/>
    <circle cx="24" cy="21" r="17" fill="url(#${k}g)" stroke="#6b3b06" stroke-width="1.8"/>
    <circle cx="24" cy="21" r="13" fill="none" stroke="#fff3c0" stroke-width="1.2" opacity=".75"/>
    <path d="M24 9.5l3.4 7 7.7 1.1-5.6 5.4 1.3 7.6-6.8-3.6-6.8 3.6 1.3-7.6-5.6-5.4 7.7-1.1z" fill="#fff8d8" stroke="#a8660a" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M12 15c2-4 6-7 11-7.5" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>
  </svg>`;
}

// Logo XP : hexagone dégradé bleu-violet, chevrons de montée de niveau et lettres « XP » dessinées.
let xpUid = 0;
export function xpLogo() {
  const k = `xl${xpUid++}`;
  return `<svg viewBox="0 0 24 24" aria-hidden="true" class="xp-logo">
    <defs><linearGradient id="${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8ff0ff"/><stop offset=".5" stop-color="#3fa9ff"/><stop offset="1" stop-color="#8a4dff"/></linearGradient></defs>
    <path d="M12 1.2 21.6 6.6v10.8L12 22.8 2.4 17.4V6.6z" fill="url(#${k})" stroke="#0d2a52" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M12 3.4 19.6 7.7v8.6L12 20.6 4.4 16.3V7.7z" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width=".7"/>
    <path d="M8.6 6.9 12 4.9l3.4 2" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M6.6 10.2h1.9l1.1 1.9 1.1-1.9h1.9l-2 3.2 2.1 3.4h-1.9l-1.2-2-1.2 2H6.5l2.1-3.4zM13.3 10.2h2.9c1.6 0 2.5.8 2.5 2.1 0 1.4-1 2.2-2.6 2.2h-1.1v2.3h-1.7zm1.7 1.4v1.6h1c.6 0 1-.3 1-.8s-.4-.8-1-.8z" fill="#fff" stroke="#0d2a52" stroke-width=".35"/>
  </svg>`;
}

export const ICONS = {
  shop: svg('<path d="M4 9h16l-1.2 10.2a2 2 0 0 1-2 1.8H7.2a2 2 0 0 1-2-1.8z"/><path d="M8.5 9V7a3.5 3.5 0 0 1 7 0v2"/><path d="M9 14h6"/>'),
  friends: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.6c2.4.2 4 1.9 4.5 4.9"/>'),
  collection: svg('<rect x="3" y="4" width="11" height="15" rx="2" transform="rotate(-8 8.5 11.5)"/><rect x="9" y="5" width="11" height="15" rx="2" transform="rotate(8 14.5 12.5)"/><path d="M14.5 10.5l1 2 2 .3-1.5 1.4.4 2-1.9-1-1.9 1 .4-2-1.5-1.4 2-.3z"/>'),
  box: svg('<path d="M3 8l9-4.5L21 8v8.5L12 21l-9-4.5z"/><path d="M3 8l9 4.5L21 8"/><path d="M12 12.5V21"/><path d="M7.5 5.8l9 4.5"/>'),
  battle: svg('<path d="M4 4l9.5 9.5"/><path d="M4 4h4l9 9"/><path d="M14 17l3-3 3 3-3 3z"/><path d="M20 4l-9.5 9.5"/><path d="M20 4h-4l-4 4"/><path d="M10 17l-3-3-3 3 3 3z"/>'),
  get coin() { return strikeCoin(); },
  get xpLogo() { return xpLogo(); },
  get xp() { return xpLogo(); }, // pièce STRIKE (S noir au centre), voir strikeCoin()
  get gem() { return strikeGem(); },
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  star: svg('<path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.3l-5.6 2.9 1.1-6.3L2.9 9.5l6.3-.9z" stroke="none"/>', 'currentColor'),
  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  plus: svg('<path d="M12 6v12M6 12h12"/>'),
  filter: svg('<path d="M4 6h16M7 12h10M10 18h4"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  gift: svg('<rect x="3.5" y="9" width="17" height="11" rx="2"/><path d="M3.5 13h17M12 9v11"/><path d="M12 9c-1.5-3-5-4-5-1.6C7 9 12 9 12 9zM12 9c1.5-3 5-4 5-1.6C17 9 12 9 12 9z"/>'),
  shield: svg('<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  heart: svg('<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>'),
  chest: svg('<rect x="3" y="9" width="18" height="11" rx="2"/><path d="M3 13h18"/><path d="M5 9a7 5 0 0 1 14 0"/><rect x="10.5" y="11.5" width="3" height="4" rx="1"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  user: svg('<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.7-3.8 3.4-6 7-6s6.3 2.2 7 6"/>'),
  sword: svg('<path d="M14.5 3.5H20.5V9.5L10 20l-3.5-3.5z"/><path d="M5 14l5 5"/><path d="M3.5 20.5l3-3"/><path d="M17 7l-6 6"/>'),
  // silhouette sombre de combattant (garde haute, épaules larges)
  striker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.6a3 3 0 0 1 3 3.1c0 1.2-.6 2.2-1.6 2.7l3.6 1.3c.9.3 1.5 1 1.8 1.9l1 3.6c.2.8-.6 1.3-1.2.8l-2.4-2.3-.5 3.4 1.5 5.4c.2.8-.4 1.6-1.2 1.6h-.4c-.5 0-1-.4-1.1-.9L13 17.4l-1 0-1.5 4.8c-.1.5-.6.9-1.1.9H9c-.8 0-1.4-.8-1.2-1.6l1.5-5.4-.5-3.4-2.4 2.3c-.6.5-1.4 0-1.2-.8l1-3.6c.3-.9.9-1.6 1.8-1.9l3.6-1.3c-1-.5-1.6-1.5-1.6-2.7a3 3 0 0 1 3-3.1z" fill="#14101f" stroke="#fff" stroke-opacity=".35" stroke-width=".6"/></svg>',
  // ulti : silhouette qui bondit + onde de choc
  ulti: svg('<path d="M3 20.5c2.5-1.6 5.6-2.4 9-2.4s6.5.8 9 2.4"/><path d="M6.5 17.2c1.6-.8 3.5-1.2 5.5-1.2s3.9.4 5.5 1.2"/><circle cx="13.5" cy="4.2" r="1.8"/><path d="M8 9.5l3.5-2.6 3.6.9 2.4 3"/><path d="M11.5 6.9l-.4 4.4 2.8 2.1-1 3"/><path d="M11.1 11.3l-3.4 1.5"/>'),
  gun: svg('<path d="M2.5 9.5h15l1.5-1.5h2.5v3h-3l-1 1.2H12l-1.2 1.6h-2l-1.6 4.7H4.6l1.3-5.3H2.5z"/><path d="M12 12.2l.6 2.3"/>'),
  skin: svg('<path d="M8.5 3.5 5 5.2 2.8 9.6l3 1.6 1.2-1.8V20.5h10V9.4l1.2 1.8 3-1.6L19 5.2l-3.5-1.7c-.6 1.4-2 2.3-3.5 2.3s-2.9-.9-3.5-2.3z"/>'),
  fragment: svg('<path d="M12 3l6 7-6 11-6-11z"/>'),
  token: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7v10M7 12h10"/>'),
  upgrade: svg('<path d="M12 4l6 6h-4v8h-4v-8H6z"/>'),
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"/>'),
  share: svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.5l6.8-4M8.6 13.5l6.8 4"/>'),
  map: svg('<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>'),
  card: svg('<rect x="5" y="3" width="14" height="18" rx="2"/>'),
  rare: svg('<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z"/>'),
  trophy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v5a5 5 0 0 1-10 0z" fill="#ffc83d" stroke="#8a5a06" stroke-width="1"/><path d="M7 5H4v1.5A3.5 3.5 0 0 0 7.5 10M17 5h3v1.5A3.5 3.5 0 0 1 16.5 10" fill="none" stroke="#ffc83d" stroke-width="1.6"/><path d="M10.5 13h3l.5 4h-4z" fill="#f0a812"/><rect x="7.5" y="17" width="9" height="3.5" rx="1" fill="#b8740e"/><path d="M9 5v3" stroke="#fff" stroke-width="1.1" stroke-linecap="round" opacity=".7"/></svg>',
  rank: svg('<path d="M12 3l7 4v6c0 4-3 7-7 8-4-1-7-4-7-8V7z"/><path d="M9 12l2 2 4-4"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>'),
  rotate: svg('<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/>'),
};

export const stars = (n) => `<span class="stars">${ICONS.star.repeat(n)}</span>`;
