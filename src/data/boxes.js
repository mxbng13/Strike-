// Les trois catégories de box. TOUT le paramétrage économique est ici : prix, probabilités, conversions.
// Les catégories de box sont indépendantes des raretés de personnages (data/rarities.js).

export const BOX_TYPES = {
  normale: {
    id: 'normale', name: 'Box normale', tier: 'Normale',
    desc: 'La box de tous les jours. Surtout des Strikers communs et rares.',
    price: { coins: 300 },
    // Probabilités en % par rareté de personnage (chaque colonne totalise 100).
    rates: { commun: 65, rare: 25, epique: 8, legendaire: 1.8, mythique: 0.2 },
  },
  rare: {
    id: 'rare', name: 'Box rare', tier: 'Rare',
    desc: 'Plus de Strikers rares et épiques, avec une chance de légendaire.',
    price: { coins: 1200 },
    rates: { commun: 25, rare: 45, epique: 23, legendaire: 6, mythique: 1 },
  },
  legendaire: {
    id: 'legendaire', name: 'Box légendaire', tier: 'Légendaire',
    desc: 'Le coffre des champions : Strikers épiques et légendaires le plus souvent.',
    price: { gems: 120 },
    rates: { commun: 5, rare: 20, epique: 35, legendaire: 30, mythique: 10 },
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
