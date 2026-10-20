// Monnaie, niveaux, statistiques et récompenses.
import { save } from '../save/storage.js';
import { getRank } from '../data/ranks.js';

// Niveau de combat de référence. L'XP ne fait plus monter aucun niveau (elle sert uniquement au passe) :
// le joueur combat toujours à ce niveau, les adversaires à ce niveau ± la difficulté.
export const COMBAT_LEVEL = 3;

// Statistiques d'un personnage au niveau donné (+7 % par niveau) et à son palier (Or +5 %, Diamant +10 %,
// paliers obtenus avec les trophées du Striker).
export function statsAt(def, level, rankId = 'basique') {
  const k = (1 + 0.07 * (level - 1)) * (1 + getRank(rankId).statBonus);
  const s = def.stats;
  return { pv: Math.round(s.pv * k), atk: Math.round(s.atk * k), def: Math.round(s.def * k), vit: s.vit };
}
export const power = (def, level, rankId) => { const s = statsAt(def, level, rankId); return Math.round(s.pv / 2 + s.atk * 3 + s.def * 2 + s.vit); };

export function canAfford(price) {
  const s = save.get();
  return (price.coins ?? 0) <= s.coins && (price.gems ?? 0) <= s.gems;
}

export function spend(price) {
  if (!canAfford(price)) return false;
  save.update((s) => ({ coins: s.coins - (price.coins ?? 0), gems: s.gems - (price.gems ?? 0) }));
  return true;
}

// Ajoute un personnage ; renvoie false si c'est un doublon (converti en pièces).
export function grantCharacter(id, duplicateCoins = 0) {
  const s = save.get();
  if (s.owned.includes(id)) {
    save.update({ coins: s.coins + duplicateCoins });
    return false;
  }
  save.update({ owned: [...s.owned, id], obtainedAt: { ...s.obtainedAt, [id]: Date.now() } });
  return true;
}

export function grantItem(id, n = 1) {
  save.update((s) => ({ items: { ...s.items, [id]: (s.items[id] ?? 0) + n } }));
}

export function useItem(id) {
  const s = save.get();
  if (!s.items[id]) return false;
  save.update({ items: { ...s.items, [id]: s.items[id] - 1 } });
  return true;
}

/** Donne pièces / diamants (fin de combat). L'XP de combat va au passe (game/battlePass.js → addPassXp). */
export function grantRewards({ coins = 0, gems = 0 }) {
  save.update((s) => ({ coins: s.coins + coins, gems: s.gems + gems }));
}
