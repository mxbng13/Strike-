// Illustrations vectorielles des trois box. Silhouettes volontairement différentes :
// normale = caisse en bois cerclée, rare = coffre bombé bleu-violet, légendaire = coffre royal ailé et doré.
// Le couvercle est un groupe séparé (.lid) pour l'animation d'ouverture.
let uid = 0;

function normale(id) {
  return `
  <defs>
    <linearGradient id="wood${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c99a66"/><stop offset="1" stop-color="#8d6037"/></linearGradient>
    <linearGradient id="woodL${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ddb07a"/><stop offset="1" stop-color="#a87444"/></linearGradient>
  </defs>
  <ellipse class="shadow" cx="100" cy="176" rx="66" ry="9" fill="#000" opacity=".22"/>
  <g class="body">
    <rect x="40" y="96" width="120" height="76" rx="6" fill="url(#wood${id})" stroke="#5a3a1f" stroke-width="3"/>
    <path d="M42 121h116M42 146h116" stroke="#6e4826" stroke-width="2.5" opacity=".7"/>
    <rect x="40" y="96" width="14" height="76" rx="3" fill="#6f747d" stroke="#3d4148" stroke-width="2"/>
    <rect x="146" y="96" width="14" height="76" rx="3" fill="#6f747d" stroke="#3d4148" stroke-width="2"/>
    <circle cx="47" cy="106" r="2.5" fill="#c9ced6"/><circle cx="153" cy="106" r="2.5" fill="#c9ced6"/>
    <circle cx="47" cy="162" r="2.5" fill="#c9ced6"/><circle cx="153" cy="162" r="2.5" fill="#c9ced6"/>
  </g>
  <g class="lid">
    <rect x="34" y="74" width="132" height="26" rx="5" fill="url(#woodL${id})" stroke="#5a3a1f" stroke-width="3"/>
    <path d="M36 87h128" stroke="#7a5230" stroke-width="2" opacity=".6"/>
    <rect x="88" y="88" width="24" height="22" rx="4" fill="#8b9099" stroke="#3d4148" stroke-width="2.5"/>
    <circle cx="100" cy="99" r="3.5" fill="#3d4148"/>
  </g>`;
}

function rare(id) {
  return `
  <defs>
    <linearGradient id="rb${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f7bff"/><stop offset="1" stop-color="#5a2fc2"/></linearGradient>
    <linearGradient id="rl${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fb0ff"/><stop offset="1" stop-color="#7d4ef0"/></linearGradient>
    <linearGradient id="silver${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#aab6d8"/></linearGradient>
    <radialGradient id="gem${id}"><stop offset="0" stop-color="#e6fdff"/><stop offset=".5" stop-color="#7af0ff"/><stop offset="1" stop-color="#1fa3c9"/></radialGradient>
  </defs>
  <ellipse class="shadow" cx="100" cy="178" rx="70" ry="9" fill="#000" opacity=".25"/>
  <g class="body">
    <rect x="34" y="100" width="132" height="74" rx="12" fill="url(#rb${id})" stroke="#2a1a6e" stroke-width="3"/>
    <rect x="56" y="100" width="12" height="74" fill="url(#silver${id})" opacity=".9"/>
    <rect x="132" y="100" width="12" height="74" fill="url(#silver${id})" opacity=".9"/>
    <path d="M36 160h128" stroke="#2a1a6e" stroke-width="2" opacity=".5"/>
  </g>
  <g class="lid">
    <path d="M34 102V88Q34 48 100 46Q166 48 166 88V102Z" fill="url(#rl${id})" stroke="#2a1a6e" stroke-width="3"/>
    <path d="M56 101V80Q58 56 62 52M144 101V80Q142 56 138 52" stroke="url(#silver${id})" stroke-width="12" fill="none" stroke-linecap="round" opacity=".9"/>
    <path d="M52 66Q100 52 148 66" stroke="#fff" stroke-width="3" opacity=".35" fill="none"/>
    <path d="M100 86l13 15-13 15-13-15z" fill="url(#gem${id})" stroke="#0d5a73" stroke-width="2.5"/>
    <path d="M95 94l5-5" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
  </g>`;
}

function legendaire(id) {
  return `
  <defs>
    <radialGradient id="halo${id}"><stop offset="0" stop-color="#ffe9a6" stop-opacity=".75"/><stop offset="1" stop-color="#ffb422" stop-opacity="0"/></radialGradient>
    <linearGradient id="gold${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1b0"/><stop offset=".45" stop-color="#ffc83d"/><stop offset="1" stop-color="#b8740e"/></linearGradient>
    <linearGradient id="lb${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a1846"/><stop offset="1" stop-color="#2c0b2e"/></linearGradient>
    <radialGradient id="ruby${id}"><stop offset="0" stop-color="#ffd0e0"/><stop offset=".45" stop-color="#ff3d7f"/><stop offset="1" stop-color="#8a0f45"/></radialGradient>
  </defs>
  <circle class="halo" cx="100" cy="104" r="92" fill="url(#halo${id})"/>
  <ellipse class="shadow" cx="100" cy="182" rx="76" ry="10" fill="#000" opacity=".28"/>
  <g class="body">
    <path d="M14 110Q2 92 10 78Q22 96 34 100L30 128Q18 124 14 110Z" fill="url(#gold${id})" stroke="#7a4a06" stroke-width="2.5"/>
    <path d="M186 110Q198 92 190 78Q178 96 166 100L170 128Q182 124 186 110Z" fill="url(#gold${id})" stroke="#7a4a06" stroke-width="2.5"/>
    <path d="M26 104H174L164 178H36Z" fill="url(#lb${id})" stroke="#7a4a06" stroke-width="3"/>
    <path d="M26 104H174L172 116H28Z" fill="url(#gold${id})"/>
    <path d="M36 178H164L166 168H34Z" fill="url(#gold${id})"/>
    <path d="M60 116V168M140 116V168" stroke="url(#gold${id})" stroke-width="7"/>
    <circle cx="60" cy="142" r="7" fill="url(#gold${id})" stroke="#7a4a06" stroke-width="2"/>
    <circle cx="140" cy="142" r="7" fill="url(#gold${id})" stroke="#7a4a06" stroke-width="2"/>
  </g>
  <g class="lid">
    <path d="M22 106V90Q22 46 100 40Q178 46 178 90V106Z" fill="url(#lb${id})" stroke="#7a4a06" stroke-width="3"/>
    <path d="M22 106V96H178V106Z" fill="url(#gold${id})"/>
    <path d="M34 92Q40 56 100 50Q160 56 166 92" stroke="url(#gold${id})" stroke-width="6" fill="none"/>
    <path d="M74 44L80 24L90 38L100 16L110 38L120 24L126 44Z" fill="url(#gold${id})" stroke="#7a4a06" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="100" cy="16" r="4" fill="url(#ruby${id})"/>
    <path d="M100 66L114 82L100 98L86 82Z" fill="url(#ruby${id})" stroke="#7a4a06" stroke-width="3"/>
    <path d="M95 76l5-5" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
  </g>`;
}

const ART = { normale, rare, legendaire };

/** Renvoie le SVG d'une box. */
export function boxArt(type) {
  const id = `b${uid++}`;
  return `<svg class="box-art box-${type}" viewBox="0 0 200 200" aria-hidden="true">${ART[type](id)}</svg>`;
}
