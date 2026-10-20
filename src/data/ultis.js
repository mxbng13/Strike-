// ULTIS : capacité spéciale du Combat en arène. Chaque Striker a SON ulti (comme son arme), le seul
// qu'il utilise. La jauge se remplit en infligeant des dégâts (`chargeDmg` pour la remplir) et un peu
// avec le temps (`chargePerSec`) ; quand elle est pleine, le bouton ULTI s'allume.
//
// kind :
//  - 'leap'   : bond sur l'adversaire visible le plus proche (portée `range`), dégâts en zone à l'atterrissage ;
//  - 'zone'   : zone de feu lancée sur la cible (ou devant), brûle les adversaires qui s'y trouvent ;
//  - 'salvo'  : plusieurs rafales de projectiles en éventail vers la cible (ou devant) ;
//  - 'slam'   : onde de choc autour du Striker, recul et étourdissement ;
//  - 'pierce' : un seul tir qui traverse les murs et tous les adversaires sur sa ligne ;
//  - 'vortex' : vortex qui attire les adversaires puis explose.
export const ULTIS = [
  {
    id: 'bond', owner: 'claude', kind: 'leap', name: 'Bond fracassant', color: '#ffb422',
    desc: 'Claude bondit par-dessus les obstacles et retombe sur l’ennemi : gros dégâts à l’atterrissage et onde de choc.',
    range: 7, dmg: 420, radius: 1.7, chargeDmg: 650, chargePerSec: 0.02, leapTime: 0.6, height: 2.4,
    stats: [['7 m', 'Portée du bond'], ['420', 'Dégâts à l’impact'], ['1,7 m', 'Onde de choc']],
  },
  {
    id: 'brasier', owner: 'tobi', kind: 'zone', name: 'Mur de flammes', color: '#ff7a1a',
    desc: 'Tobi lance une bombe incendiaire : une zone de feu brûle pendant 3,5 s tous les ennemis qui s’y trouvent.',
    range: 6.5, radius: 1.9, dps: 260, duration: 3.5, chargeDmg: 700, chargePerSec: 0.02,
    stats: [['6,5 m', 'Portée du lancer'], ['260 / s', 'Brûlure'], ['3,5 s', 'Durée du feu']],
  },
  {
    id: 'tempete', owner: 'nova', kind: 'salvo', name: 'Tempête de carreaux', color: '#3ff7e0',
    desc: 'Nova tire 3 salves de 7 carreaux en éventail : impossible de tout esquiver de près.',
    range: 11, dmg: 150, pellets: 7, spread: 0.6, waves: 3, gap: 0.16, speed: 28, size: 1.1, chargeDmg: 750, chargePerSec: 0.02,
    stats: [['3 × 7', 'Carreaux'], ['150', 'Dégâts par carreau'], ['11 m', 'Portée']],
  },
  {
    id: 'seisme', owner: 'brutus', kind: 'slam', name: 'Séisme', color: '#c08a52',
    desc: 'Brutus frappe le sol : l’onde de choc repousse et étourdit tous les ennemis autour de lui.',
    range: 3.2, radius: 3.2, dmg: 380, stun: 1.3, chargeDmg: 650, chargePerSec: 0.02,
    stats: [['3,2 m', 'Rayon'], ['380', 'Dégâts'], ['1,3 s', 'Étourdissement']],
  },
  {
    id: 'ombre', owner: 'selena', kind: 'pierce', name: 'Tir de l’Ombre', color: '#b45cff',
    desc: 'Selena charge un tir d’ombre qui traverse les murs, les buissons et tous les ennemis sur sa ligne.',
    range: 20, dmg: 1000, speed: 55, size: 2.2, chargeDmg: 900, chargePerSec: 0.02,
    stats: [['20 m', 'Portée'], ['1 000', 'Dégâts'], ['∞', 'Traverse les murs']],
  },
  {
    id: 'vortex', owner: 'kaiser', kind: 'vortex', name: 'Vortex du Néant', color: '#ff3dc8',
    desc: 'Kaiser ouvre un vortex qui aspire les ennemis pendant 2 s, puis explose.',
    range: 7, radius: 2.8, pull: 3.4, dps: 110, duration: 2, blast: 380, blastRadius: 2.2, chargeDmg: 800, chargePerSec: 0.02,
    stats: [['7 m', 'Portée'], ['2 s', 'Aspiration'], ['380', 'Explosion']],
  },
];
export const getUlti = (id) => ULTIS.find((u) => u.id === id) ?? null;
/** Ulti d'un Striker (chaque Striker a le sien ; à défaut, le Bond fracassant). */
export const ultiOf = (strikerId) => ULTIS.find((u) => u.owner === strikerId) ?? ULTIS[0];
