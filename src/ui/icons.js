// Icônes SVG inline (originales, style trait arrondi).
const svg = (body, fill = 'none') =>
  `<svg viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

// Pièce STRIKE : pièce dorée (couronne métallique crantée, face bombée, reflets) avec un grand S noir
// au centre. Dessin vectoriel : reste nette à toutes les tailles. Chaque appel génère des identifiants
// de dégradés uniques (plusieurs pièces peuvent coexister dans la page).
let coinUid = 0;
export function strikeCoin() {
  const k = `sc${coinUid++}`;
  // S en forme pleine (et non en texte), centré en (12, 12)
  const S = 'M15.6 8.9c-.8-1.3-2.2-2.1-3.9-2.1-2.4 0-4.1 1.4-4.1 3.3 0 2.1 1.7 2.8 3.8 3.4 1.4.4 1.9.7 1.9 1.3 0 .7-.7 1.2-1.8 1.2-1.2 0-2.2-.6-2.9-1.6l-2 1.7c1.1 1.5 2.9 2.4 4.9 2.4 2.7 0 4.5-1.5 4.5-3.6 0-2.2-1.7-2.9-3.9-3.5-1.3-.4-1.8-.6-1.8-1.2 0-.6.6-1 1.4-1 1 0 1.7.4 2.3 1.1z';
  return `<svg viewBox="0 0 24 24" aria-hidden="true" class="strike-coin">
    <defs>
      <linearGradient id="${k}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2b8"/><stop offset=".45" stop-color="#f2be3c"/><stop offset="1" stop-color="#a8700c"/></linearGradient>
      <radialGradient id="${k}f" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#ffe98f"/><stop offset=".55" stop-color="#f4c443"/><stop offset="1" stop-color="#d79a1c"/></radialGradient>
      <linearGradient id="${k}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2a2a"/><stop offset="1" stop-color="#050505"/></linearGradient>
    </defs>
    <circle cx="12" cy="12.6" r="10.6" fill="#6b4206" opacity=".55"/>
    <circle cx="12" cy="12" r="10.6" fill="url(#${k}r)" stroke="#7a4f08" stroke-width=".7"/>
    <circle cx="12" cy="12" r="8.7" fill="none" stroke="#b07a10" stroke-width="1.6" stroke-dasharray=".55 .75" opacity=".7"/>
    <circle cx="12" cy="12" r="7.8" fill="url(#${k}f)" stroke="#9a6608" stroke-width=".55"/>
    <path d="M6.2 9.2a6.4 6.4 0 0 1 7.6-5" fill="none" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".7"/>
    <path d="${S}" transform="translate(0 .45)" fill="#fff3c4" opacity=".55"/>
    <path d="${S}" fill="url(#${k}s)"/>
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
  gem: svg('<path d="M6 3h12l4 6-10 12L2 9z" fill="#5fe0ff" stroke="#1b6c8f"/><path d="M2 9h20M9 3l3 18 3-18" stroke="#1b6c8f"/>'),
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
  card: svg('<rect x="5" y="3" width="14" height="18" rx="2"/>'),
  rare: svg('<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z"/>'),
  trophy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v5a5 5 0 0 1-10 0z" fill="#ffc83d" stroke="#8a5a06" stroke-width="1"/><path d="M7 5H4v1.5A3.5 3.5 0 0 0 7.5 10M17 5h3v1.5A3.5 3.5 0 0 1 16.5 10" fill="none" stroke="#ffc83d" stroke-width="1.6"/><path d="M10.5 13h3l.5 4h-4z" fill="#f0a812"/><rect x="7.5" y="17" width="9" height="3.5" rx="1" fill="#b8740e"/><path d="M9 5v3" stroke="#fff" stroke-width="1.1" stroke-linecap="round" opacity=".7"/></svg>',
  rank: svg('<path d="M12 3l7 4v6c0 4-3 7-7 8-4-1-7-4-7-8V7z"/><path d="M9 12l2 2 4-4"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>'),
  rotate: svg('<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/>'),
};

export const stars = (n) => `<span class="stars">${ICONS.star.repeat(n)}</span>`;
