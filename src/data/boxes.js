// Les trois catégories de box. TOUT le paramétrage économique est ici : prix, probabilités, conversions.
// Les catégories de box sont indépendantes des raretés de personnages (data/rarities.js).

export const BOX_TYPES = {
  normale: {
    id: 'normale', name: 'Box normale', tier: 'Normale',
    desc: '3 gains : surtout des pièces, parfois des diamants ou un skin. Un Striker y est très rare.',
    price: { coins: 300 },
    // Rareté du Striker QUAND la box en donne un (en %, total 100). La chance d'avoir un Striker est
    // dans data/rewards.js (BOX_LOOT) : elle est déjà très faible.
    rates: { commun: 70, rare: 24, epique: 5, legendaire: 0.9, mythique: 0.1 },
  },
  rare: {
    id: 'rare', name: 'Box rare', tier: 'Rare',
    desc: '5 gains : plus de pièces, de diamants et de skins. Un peu plus de chances de Striker.',
    price: { coins: 1200 },
    rates: { commun: 45, rare: 38, epique: 13.6, legendaire: 3, mythique: 0.4 },
  },
  legendaire: {
    id: 'legendaire', name: 'Box légendaire', tier: 'Légendaire',
    desc: '7 gains : les plus grosses récompenses et la meilleure chance de Striker, même légendaire.',
    price: { gems: 120 },
    rates: { commun: 25, rare: 36, epique: 28.5, legendaire: 9, mythique: 1.5 },
  },
};
export const BOX_ORDER = ['normale', 'rare', 'legendaire'];

// Box gratuites : une nouvelle toutes les 5 heures, stockage limité à 5.
// Quand le stock est plein, le compteur s'arrête (aucune box n'est générée au-delà de 5).
export const FREE_BOX = { type: 'normale', intervalMs: 5 * 60 * 60 * 1000, maxStored: 5 };

// Solde de TEST pour essayer le prototype : à CHAQUE ouverture du jeu, le solde est remonté à au moins
// ces valeurs (nouvelle partie comme sauvegarde existante). Mettre TEST_BALANCE à null pour l'enlever.
export const TEST_BALANCE = { coins: 100000, gems: 1000 };

// Le contenu des box (XP, pièces, Strikers, skins) est configuré dans data/rewards.js (BOX_LOOT).
