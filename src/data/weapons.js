// ARMES : chaque Striker a SA propre arme (la seule qu'il utilise). Les armes ne s'achètent plus ;
// on peut seulement leur appliquer des skins (data/skins.js → WEAPON_SKINS).
// `arena` : comportement en Combat en arène. Une attaque = une rafale de `burst` tirs espacés de `gap` s,
// chaque tir lance `pellets` projectiles (éventail `spread`). Charges : `mag`, une charge revient en `reload` s.
export const WEAPONS = [
  { id: 'lumiere', owner: 'claude', name: 'Lanceur Aurore', rarity: 'epique', color: '#ffd84a',
    desc: 'Rafale de 3 éclairs de lumière, précise à moyenne distance.',
    arena: { dmg: 125, pellets: 1, spread: 0.03, burst: 3, gap: 0.09, interval: 0.45, mag: 3, reload: 1.3, speed: 26, range: 10, color: 0xfff1a0, size: 1 } },
  { id: 'brasier', owner: 'tobi', name: 'Brasier', rarity: 'commun', color: '#ff7a2a',
    desc: 'Lance-flammes : un souffle de boules de feu à courte portée, redoutable de près.',
    arena: { dmg: 42, pellets: 3, spread: 0.32, burst: 4, gap: 0.06, interval: 0.55, mag: 3, reload: 1.0, speed: 15, range: 5.5, color: 0xff8a2a, size: 1.5 } },
  { id: 'rafale', owner: 'nova', name: 'Arbalète Rafale', rarity: 'rare', color: '#3ff7e0',
    desc: 'Deux carreaux rapides qui filent loin et vite.',
    arena: { dmg: 175, pellets: 1, spread: 0.02, burst: 2, gap: 0.12, interval: 0.5, mag: 3, reload: 1.2, speed: 30, range: 11, color: 0x8ffff0, size: 1 } },
  { id: 'rocher', owner: 'brutus', name: 'Canon à rochers', rarity: 'epique', color: '#c08a52',
    desc: 'Un énorme rocher lent mais dévastateur.',
    arena: { dmg: 520, pellets: 1, spread: 0, burst: 1, gap: 0, interval: 0.8, mag: 2, reload: 1.8, speed: 15, range: 8, color: 0xc89a6a, size: 2.4 } },
  { id: 'ombre', owner: 'selena', name: 'Fusil de l’Ombre', rarity: 'legendaire', color: '#b45cff',
    desc: 'Un seul tir, très puissant, depuis très loin.',
    arena: { dmg: 600, pellets: 1, spread: 0, burst: 1, gap: 0, interval: 0.9, mag: 2, reload: 2.0, speed: 40, range: 15, color: 0xd9a6ff, size: 1.2 } },
  { id: 'neant', owner: 'kaiser', name: 'Disperseur du Néant', rarity: 'mythique', color: '#ff3dc8',
    desc: 'Une gerbe de 5 éclats d’énergie du Néant à moyenne portée.',
    arena: { dmg: 112, pellets: 5, spread: 0.3, burst: 1, gap: 0, interval: 0.7, mag: 3, reload: 1.5, speed: 21, range: 8, color: 0xff6ad8, size: 1.1 } },
];
export const getWeapon = (id) => WEAPONS.find((w) => w.id === id) ?? null;
/** Arme d'un Striker (chaque Striker a la sienne ; à défaut, le Lanceur Aurore). */
export const weaponOf = (strikerId) => WEAPONS.find((w) => w.owner === strikerId) ?? WEAPONS[0];
