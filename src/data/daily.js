// RÉCOMPENSES QUOTIDIENNES : une récompense par jour de connexion, sur un cycle de 7 jours.
// Un jour manqué fait repartir la série au jour 1. Format des récompenses : comme le Passe de combat
// (jamais d'XP : elle se gagne en combat et avec les missions, et sert uniquement au passe).
export const DAILY_REWARDS = [
  { coins: 200 },
  { coins: 300 },
  { gems: 10 },
  { box: 'normale' },
  { coins: 500 },
  { coins: 700 },
  { box: 'rare', gems: 20 },
];
