// Classement compétitif (data/ranked.js) : points du joueur, résultat des combats, route des trophées.
// Sauvegarde : save.ranked = { points, best (record), seen (record déjà montré dans l'onglet), claimed, battles }.
import { RANKED_ROAD, applyResult, rankOf } from '../data/ranked.js';
import { getCharacterSkin, getWeaponSkin } from '../data/skins.js';
import { DUPLICATE_COINS } from '../data/rewards.js';
import { save } from '../save/storage.js';

const st = (s) => s.ranked ?? { points: 0, best: 0, seen: 0, claimed: [], battles: [] };
export const rankedPoints = (s = save.get()) => st(s).points;
export const rankedBest = (s = save.get()) => Math.max(st(s).best, st(s).points);
export const currentRank = (s = save.get()) => rankOf(rankedPoints(s));

/**
 * Applique un combat compétitif. `battleId` unique : un même combat ne compte qu'une fois.
 * result : 'win' | 'loss' | 'flee'. Renvoie { before, after, delta, rankBefore, rankAfter, promoted, demoted, duplicate }.
 */
export function applyRankedResult(battleId, result) {
  const s = save.get(), r = st(s);
  const before = r.points;
  if (r.battles.includes(battleId)) return { before, after: before, delta: 0, rankBefore: rankOf(before), rankAfter: rankOf(before), promoted: false, demoted: false, duplicate: true };
  const after = applyResult(before, result);
  save.update((x) => {
    const y = st(x);
    return { ranked: { ...y, points: after, best: Math.max(y.best, after), battles: [...y.battles, battleId].slice(-50) } };
  });
  const rankBefore = rankOf(before), rankAfter = rankOf(after);
  const step = (k) => k.tierIndex * 3 + (k.level ?? 0);
  return { before, after, delta: after - before, rankBefore, rankAfter,
    promoted: step(rankAfter) > step(rankBefore), demoted: step(rankAfter) < step(rankBefore), duplicate: false };
}

/** Valeur réelle d'une récompense pour ce joueur : un skin déjà possédé devient des pièces. */
export function resolveReward(reward, s = save.get()) {
  const out = { ...reward };
  if (reward.weaponSkin && (s.weaponSkinsOwned ?? []).includes(reward.weaponSkin)) {
    out.coins = (out.coins ?? 0) + DUPLICATE_COINS[getWeaponSkin(reward.weaponSkin)?.rarity ?? 'rare']; out.convertedSkin = reward.weaponSkin; delete out.weaponSkin;
  }
  if (reward.characterSkin && (s.characterSkinsOwned ?? []).includes(reward.characterSkin)) {
    out.coins = (out.coins ?? 0) + DUPLICATE_COINS[getCharacterSkin(reward.characterSkin)?.rarity ?? 'rare']; out.convertedSkin = reward.characterSkin; delete out.characterSkin;
  }
  return out;
}

/** Étapes de la route avec leur état : 'claimed' | 'ready' | 'locked'. */
export function rankedRoad(s = save.get()) {
  const best = rankedBest(s), claimed = st(s).claimed;
  return RANKED_ROAD.map((p) => ({ ...p, state: claimed.includes(p.id) ? 'claimed' : best >= p.points ? 'ready' : 'locked' }));
}
export const rankedClaimable = (s = save.get()) => rankedRoad(s).filter((p) => p.state === 'ready').length;
/** Prochaine étape verrouillée (et la prochaine grande récompense). */
export const nextRoadStep = (s = save.get()) => rankedRoad(s).find((p) => p.state === 'locked') ?? null;
export const nextMajorStep = (s = save.get()) => rankedRoad(s).find((p) => p.major && p.state === 'locked') ?? null;

/** Récupère la récompense `id` (atteinte, une seule fois). */
export function claimRankedReward(id) {
  const s = save.get();
  const p = rankedRoad(s).find((x) => x.id === id);
  if (!p || p.state !== 'ready') return { ok: false };
  const r = resolveReward(p.reward, s);
  save.update((x) => ({
    coins: x.coins + (r.coins ?? 0),
    gems: x.gems + (r.gems ?? 0),
    boxes: r.box ? { ...x.boxes, [r.box]: (x.boxes[r.box] ?? 0) + 1 } : x.boxes,
    weaponSkinsOwned: r.weaponSkin ? [...new Set([...(x.weaponSkinsOwned ?? []), r.weaponSkin])] : x.weaponSkinsOwned,
    characterSkinsOwned: r.characterSkin ? [...new Set([...(x.characterSkinsOwned ?? []), r.characterSkin])] : x.characterSkinsOwned,
    ranked: { ...st(x), claimed: [...st(x).claimed, id] },
  }));
  return { ok: true, reward: r, step: p };
}

/** Mémorise le record déjà montré dans l'onglet (pour animer seulement les nouveautés). */
export function markRoadSeen() {
  const s = save.get();
  if (st(s).seen !== rankedBest(s)) save.update((x) => ({ ranked: { ...st(x), seen: rankedBest(x) } }));
}
