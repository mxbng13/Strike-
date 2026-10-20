// PALIERS des Strikers (Basique / Or / Diamant) : ils dépendent UNIQUEMENT des trophées gagnés avec ce
// Striker (save.strikerTrophies) : Or à 500 trophées, Diamant à 1 000. Ce ne sont ni des monnaies ni des points à acheter, et l'XP n'y joue aucun rôle.
// Le palier change l'apparence (tenue dorée / en cristal) et donne un petit bonus de stats.
export const RANKS = [
  { id: 'basique', label: 'Basique', minTrophies: 0, color: '#c9d1dc', statBonus: 0 },
  { id: 'or', label: 'Or', minTrophies: 500, color: '#ffc83d', statBonus: 0.05 },
  { id: 'diamant', label: 'Diamant', minTrophies: 1000, color: '#9be7ff', statBonus: 0.1 },
];

/** Palier correspondant à un nombre de trophées du Striker. */
export function tierOfTrophies(trophies = 0) {
  let r = RANKS[0];
  for (const rank of RANKS) if (trophies >= rank.minTrophies) r = rank;
  return r;
}
export const nextTier = (trophies = 0) => RANKS.find((r) => r.minTrophies > trophies) ?? null;
export const getRank = (id) => RANKS.find((r) => r.id === id) ?? RANKS[0];
