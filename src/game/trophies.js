// Trophées : gagnés/perdus en combat avec un Striker (trophées du Striker → son palier Basique / Or / Diamant).
// La route de l'onglet Trophées et le rang du joueur dépendent, eux, des points de classement (game/ranked.js).
import { TROPHY_RULES } from '../data/trophies.js';
import { save } from '../save/storage.js';

/** Total des trophées gagnés avec tous les Strikers. */
export const trophies = (s = save.get()) => s.trophies ?? 0;
export const trophyBest = (s = save.get()) => Math.max(s.trophyBest ?? 0, trophies(s));
/** Trophées gagnés avec un Striker donné. */
export const strikerTrophies = (id, s = save.get()) => s.strikerTrophies?.[id] ?? 0;

/**
 * Applique le résultat d'un combat joué avec le Striker `strikerId`. `battleId` unique par combat : un même
 * combat ne compte qu'une fois. result : 'win' | 'loss' | 'flee'.
 * Renvoie { delta, total, striker: { id, before, after, total } } (delta = 0 si déjà compté).
 */
export function applyBattleTrophies(battleId, result, strikerId) {
  const s = save.get();
  const mine = strikerTrophies(strikerId, s);
  if ((s.trophyBattles ?? []).includes(battleId)) return { delta: 0, total: trophies(s), striker: { id: strikerId, before: mine, after: mine, total: mine }, duplicate: true };
  // les deux compteurs bougent du même nombre de trophées (jamais sous 0)
  const after = Math.max(0, mine + (TROPHY_RULES[result] ?? 0));
  const delta = after - mine;
  const before = trophies(s);
  const total = Math.max(0, before + delta);
  save.update((st) => ({
    trophies: total,
    trophyBest: Math.max(st.trophyBest ?? 0, total),
    strikerTrophies: { ...(st.strikerTrophies ?? {}), [strikerId]: after },
    trophyBattles: [...(st.trophyBattles ?? []), battleId].slice(-50), // derniers combats comptés
  }));
  return { delta: total - before, total, striker: { id: strikerId, before: mine, after, total: after } };
}
