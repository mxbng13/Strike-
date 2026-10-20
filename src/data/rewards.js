// RÉCOMPENSES DES COFFRES — configuration centralisée.
// Chaque box donne un nombre FIXE de gains (`drops`) : 3 pour la normale, 5 pour la rare, 7 pour la légendaire.
// Chaque gain est tiré séparément dans la table de la box (`weight` = % de chance par gain, total 100).
// Les Strikers sont très rares (et dans un Striker, les légendaires et mythiques encore plus : data/boxes.js).
// Au plus 1 Striker, 1 skin de personnage et 1 skin d'arme par box (au-delà, le gain devient des pièces).
// Le comportement à l'obtention de chaque type est dans game/rewards.js.
//  - coins / gems  : pièces / diamants, quantité [min, max] par gain
//  - striker       : nouveau Striker (rareté selon `rates` de data/boxes.js ; s'il n'en reste plus à
//                    obtenir, conversion en pièces selon DUPLICATE_COINS)
//  - characterSkin : skin de personnage pas encore possédé (sinon conversion en pièces)
//  - weaponSkin    : skin d'arme pas encore possédé (sinon conversion en pièces)
export const BOX_LOOT = {
  normale: { drops: 3, table: [
    { type: 'striker', weight: 1 },
    { type: 'characterSkin', weight: 2 },
    { type: 'weaponSkin', weight: 2 },
    { type: 'gems', weight: 6, amount: [2, 5] },
    { type: 'coins', weight: 89, amount: [10, 30] },
  ] },
  rare: { drops: 5, table: [
    { type: 'striker', weight: 2 },
    { type: 'characterSkin', weight: 4 },
    { type: 'weaponSkin', weight: 4 },
    { type: 'gems', weight: 10, amount: [5, 12] },
    { type: 'coins', weight: 80, amount: [25, 70] },
  ] },
  legendaire: { drops: 7, table: [
    { type: 'striker', weight: 4 },
    { type: 'characterSkin', weight: 8 },
    { type: 'weaponSkin', weight: 8 },
    { type: 'gems', weight: 14, amount: [10, 25] },
    { type: 'coins', weight: 66, amount: [60, 160] },
  ] },
};
/** Maximum de chaque type par box (le reste est remplacé par des pièces). */
export const MAX_PER_BOX = { striker: 1, characterSkin: 1, weaponSkin: 1 };
/** Chance d'obtenir au moins un gain d'un type dans une box (pour l'afficher honnêtement). */
export function chanceInBox(boxType, type) {
  const cfg = BOX_LOOT[boxType], e = cfg.table.find((x) => x.type === type);
  return e ? 1 - (1 - e.weight / 100) ** cfg.drops : 0;
}
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
  gems: { label: 'Diamants', icon: 'gem' },
  striker: { label: 'Striker', icon: 'striker' },
  characterSkin: { label: 'Skin de personnage', icon: 'skin' },
  weaponSkin: { label: 'Skin d’arme', icon: 'gun' },
};
