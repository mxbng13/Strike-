// BOUTIQUE DU JOUR (valeurs modifiables ici).
// Chaque jour : un skin de personnage et un skin d'arme tirés selon la date (les mêmes pour tout le monde
// ce jour-là), et des packs Box + pièces à prix réduit, achetables une fois par jour chacun.
// Les skins exclusifs au Passe de combat n'apparaissent jamais ici.

/** Prix des skins du jour selon la rareté (en diamants). */
export const SKIN_PRICES = {
  character: { rare: 120, epique: 200, legendaire: 320, mythique: 450 },
  weapon: { rare: 80, epique: 140, legendaire: 220, mythique: 300 },
};

/**
 * Packs du jour. `value` = prix normal du contenu acheté séparément (même monnaie que `price`),
 * la réduction affichée en découle. Tous payés en monnaie du jeu (pièces ou diamants).
 *  - Box normale 300 pièces, Box rare 1 200 pièces, Box légendaire 120 diamants.
 *  - Pack Légende : 1 diamant ≈ 15 pièces pour estimer la valeur des pièces incluses.
 */
export const DAILY_PACKS = [
  { id: 'pack-depart', name: 'Pack Départ', boxes: { normale: 3 }, coins: 1000, price: { coins: 1090 }, value: { coins: 1900 } },
  { id: 'pack-rare', name: 'Pack Rare', boxes: { rare: 2 }, coins: 2500, price: { coins: 2900 }, value: { coins: 4900 } },
  { id: 'pack-legende', name: 'Pack Légende', boxes: { legendaire: 1, rare: 1 }, coins: 3000, price: { gems: 220 }, value: { gems: 400 } },
];
