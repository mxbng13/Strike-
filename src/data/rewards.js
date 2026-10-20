// RÉCOMPENSES DES COFFRES — configuration centralisée et extensible.
// Chaque coffre a sa propre table (3 à 5 types de récompenses possibles). À l'ouverture, chaque
// entrée est tirée indépendamment selon sa probabilité (%), avec sa quantité [min, max].
// Le comportement à l'obtention de chaque type est dans game/rewards.js.
//  - coins         : pièces
//  - striker       : nouveau Striker (rareté selon `rates` de data/boxes.js ; s'il n'en reste plus à
//                    obtenir, conversion en pièces selon DUPLICATE_COINS)
//  - characterSkin : skin de personnage pas encore possédé (sinon conversion en pièces)
//  - weaponSkin    : skin d'arme pas encore possédé (sinon conversion en pièces)
export const BOX_LOOT = {
  normale: [
    { type: 'coins', chance: 75, amount: [15, 45] },
    { type: 'striker', chance: 40 },
  ],
  rare: [
    { type: 'coins', chance: 85, amount: [40, 110] },
    { type: 'striker', chance: 55 },
    { type: 'characterSkin', chance: 8 },
  ],
  legendaire: [
    { type: 'coins', chance: 95, amount: [100, 260] },
    { type: 'striker', chance: 75 },
    { type: 'characterSkin', chance: 20 },
    { type: 'weaponSkin', chance: 20 },
  ],
};
// Si une ouverture ne donne rien d'autre, des pièces sont garanties (une box n'est jamais vide).
// (Pas d'XP dans les box : l'XP se gagne en combat et avec les missions, et sert uniquement au passe.)
export const GUARANTEED_FALLBACK = 'coins';

// Conversion en pièces d'un Striker ou d'un skin déjà possédé (par rareté).
export const DUPLICATE_COINS = { commun: 50, rare: 120, epique: 300, legendaire: 800, mythique: 2000 };

// Catégories préparées pour plus tard (désactivées : jamais tirées ni affichées).
export const FUTURE_CATEGORIES = {
  fragments: { label: 'Fragments de Striker', enabled: false },
  tokens: { label: 'Jetons spéciaux', enabled: false },
  upgradeItems: { label: 'Objets d’amélioration', enabled: false },
  strikerCards: { label: 'Cartes de Striker', enabled: false },
  rareRewards: { label: 'Récompenses rares', enabled: false },
};

// Libellés et icônes des récompenses actives
export const REWARD_CATEGORIES = {
  coins: { label: 'Pièces', icon: 'coin' },
  striker: { label: 'Striker', icon: 'striker' },
  characterSkin: { label: 'Skin de personnage', icon: 'skin' },
  weaponSkin: { label: 'Skin d’arme', icon: 'gun' },
};
