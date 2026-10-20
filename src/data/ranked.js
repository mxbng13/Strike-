// CLASSEMENT COMPÉTITIF du joueur : 10 rangs, de Ruine à Zénith, gagnés avec les POINTS DE CLASSEMENT
// des combats en arène. Ces points sont propres au joueur : ils ne se mélangent ni avec l'XP du passe,
// ni avec les trophées de chaque Striker (data/trophies.js, qui fixent le palier Basique / Or / Diamant).
//
// Règle : chaque niveau (I, II, III) vaut POINTS_PER_LEVEL points, donc chaque rang 3 × 1 000 = 3 000 points.
//   0 – 999 : Ruine I · 1 000 – 1 999 : Ruine II · 2 000 – 2 999 : Ruine III · 3 000 : Onde I … 27 000 : Zénith.
// Les points sont cumulés : le surplus d'une victoire est conservé au rang suivant (2 900 + 200 = Onde I, 100 pts).
// Zénith est le rang ultime, sans niveau : il est le plafond du classement (les points continuent de compter).

export const POINTS_PER_LEVEL = 1000;
export const LEVELS_PER_RANK = 3;
export const POINTS_PER_RANK = POINTS_PER_LEVEL * LEVELS_PER_RANK;
export const LEVEL_NAMES = ['I', 'II', 'III'];

// Identité de chaque rang : couleurs (clair / principal / sombre) et matière, utilisées par ui/rankEmblem.js.
// win / loss : points gagnés ou perdus par combat à ce rang (les défaites coûtent plus cher en montant).
export const RANKED_TIERS = [
  { id: 'ruine', name: 'Ruine', light: '#d8cbb8', main: '#9a8b78', dark: '#4a4038', win: 150, loss: 30 },
  { id: 'onde', name: 'Onde', light: '#9ff4ff', main: '#2fb8d8', dark: '#0d4a66', win: 140, loss: 45 },
  { id: 'flux', name: 'Flux', light: '#b8ffd8', main: '#2ed49a', dark: '#0b5a48', win: 130, loss: 55 },
  { id: 'nova', name: 'Nova', light: '#ffe8a8', main: '#ff9f2e', dark: '#7a3410', win: 120, loss: 65 },
  { id: 'vortex', name: 'Vortex', light: '#e0c4ff', main: '#9b5cff', dark: '#341470', win: 115, loss: 75 },
  { id: 'pulse', name: 'Pulse', light: '#ffc4e4', main: '#ff4fa8', dark: '#6e0f46', win: 110, loss: 85 },
  { id: 'apex', name: 'Apex', light: '#fff4c8', main: '#f2c14a', dark: '#6b4a0c', win: 105, loss: 95 },
  { id: 'titan', name: 'Titan', light: '#ffb4a4', main: '#d8423a', dark: '#4a0e10', win: 100, loss: 100 },
  { id: 'nexus', name: 'Nexus', light: '#bff0ff', main: '#3e8bff', dark: '#0c1f5e', win: 100, loss: 110 },
  { id: 'zenith', name: 'Zénith', light: '#ffffff', main: '#ffe28a', dark: '#5b3d9e', win: 90, loss: 120 },
];
export const ZENITH_POINTS = (RANKED_TIERS.length - 1) * POINTS_PER_RANK; // 27 000

export const RANKED_RULES = {
  // un abandon en cours de combat compte comme une défaite pour le classement (pas d'esquive des défaites)
  fleeAsLoss: true,
  // une défaite ne fait jamais redescendre sous le début du rang atteint (Onde I reste Onde I au pire)
  rankFloor: true,
};

/**
 * Rang correspondant à un nombre de points de classement.
 * Renvoie { tierIndex, tier, level (0, 1, 2 ; null pour Zénith), label ('Onde II'), levelStart, levelEnd,
 *           progress (points dans le niveau), toNext (points avant le niveau suivant ; null à Zénith), isMax }.
 */
export function rankOf(points = 0) {
  const p = Math.max(0, Math.floor(points));
  if (p >= ZENITH_POINTS) {
    const tier = RANKED_TIERS[RANKED_TIERS.length - 1];
    return { tierIndex: RANKED_TIERS.length - 1, tier, level: null, label: tier.name, levelStart: ZENITH_POINTS, levelEnd: null, progress: p - ZENITH_POINTS, toNext: null, isMax: true };
  }
  const step = Math.floor(p / POINTS_PER_LEVEL);
  const tierIndex = Math.floor(step / LEVELS_PER_RANK), level = step % LEVELS_PER_RANK;
  const tier = RANKED_TIERS[tierIndex], levelStart = step * POINTS_PER_LEVEL;
  return { tierIndex, tier, level, label: `${tier.name} ${LEVEL_NAMES[level]}`, levelStart, levelEnd: levelStart + POINTS_PER_LEVEL,
    progress: p - levelStart, toNext: levelStart + POINTS_PER_LEVEL - p, isMax: false };
}
/** Niveau suivant ({ points, label }) ou null à Zénith. */
export function nextRankStep(points = 0) {
  const r = rankOf(points);
  return r.isMax ? null : { points: r.levelEnd, ...pick(rankOf(r.levelEnd)) };
}
const pick = (r) => ({ label: r.label, tierIndex: r.tierIndex, level: r.level });
/** Libellé d'un seuil (« Flux III », « Zénith »). */
export const rankLabelAt = (points) => rankOf(points).label;

/** Points gagnés / perdus pour un résultat ('win' | 'loss' | 'flee'), sans plancher. */
export function pointsDelta(points, result) {
  const t = rankOf(points).tier;
  if (result === 'win') return t.win;
  if (result === 'loss' || (result === 'flee' && RANKED_RULES.fleeAsLoss)) return -t.loss;
  return 0;
}
/** Nouveaux points après un combat (plancher : 0, et début du rang atteint si RANKED_RULES.rankFloor). */
export function applyResult(points, result) {
  const d = pointsDelta(points, result);
  if (d >= 0) return points + d;
  const floor = RANKED_RULES.rankFloor ? Math.min(points, rankOf(points).tierIndex * POINTS_PER_RANK) : 0;
  return Math.max(floor, 0, points + d);
}

// ROUTE DES TROPHÉES : le parcours du classement, de 0 à Zénith. Les récompenses se débloquent selon le
// RECORD de points (une étape atteinte reste acquise) et se récupèrent une seule fois.
//  - une récompense au milieu de chaque niveau (500, 1 500, 2 500…) : id 'm<n>' ;
//  - une grande récompense à chaque nouveau rang (3 000, 6 000… 27 000) : id 'r<k>'.
// Types réellement gérés par le jeu : pièces, diamants, box (MES BOX), skins d'arme et de personnage
// (un skin déjà possédé est converti en pièces, comme dans les box). Jamais d'XP : elle sert au passe.
function midReward(n) {
  const t = Math.floor(n / LEVELS_PER_RANK);
  if (n % 3 === 2) return { box: n % 6 === 5 ? 'rare' : 'normale' };
  if (n % 2 === 1) return { gems: 15 + 5 * t };
  return { coins: 200 + 100 * t };
}
const RANK_UP_REWARDS = [
  null,
  { box: 'rare', gems: 40 },                    // Onde
  { weaponSkin: 'camo', coins: 500 },           // Flux
  { box: 'rare', coins: 1000 },                 // Nova
  { characterSkin: 'claude-nuit', gems: 60 },   // Vortex
  { weaponSkin: 'dore', coins: 1500 },          // Pulse
  { box: 'legendaire', gems: 100 },             // Apex
  { weaponSkin: 'neon', coins: 2500 },          // Titan
  { box: 'legendaire', gems: 150 },             // Nexus
  { characterSkin: 'claude-bordeaux', box: 'legendaire', gems: 250 }, // Zénith
];
export const RANKED_ROAD = [
  ...Array.from({ length: ZENITH_POINTS / POINTS_PER_LEVEL }, (_, n) => ({ id: `m${n}`, points: n * POINTS_PER_LEVEL + POINTS_PER_LEVEL / 2, major: false, reward: midReward(n) })),
  ...RANK_UP_REWARDS.map((reward, k) => reward && ({ id: `r${k}`, points: k * POINTS_PER_RANK, major: true, tierIndex: k, reward })).filter(Boolean),
].sort((a, b) => a.points - b.points);

/**
 * Migration des anciennes sauvegardes (avant le classement) : l'ancien total de trophées du joueur
 * (+8 par victoire) devient des points de classement ×10, et les chemins déjà récupérés sur l'ancienne route
 * (récompense à 100 n + 50 trophées) correspondent aux récompenses 'm<n>' (à 1 000 n + 500 points) : elles
 * restent récupérées (pas de double récompense). Fonction pure.
 */
export function migrateRanked(s) {
  const points = Math.max(0, Math.round((s.trophies ?? 0) * 10));
  const best = Math.max(points, Math.round((s.trophyBest ?? 0) * 10));
  const claimed = (s.trophyRoadClaimed ?? []).filter((i) => i >= 0 && i < ZENITH_POINTS / POINTS_PER_LEVEL).map((i) => `m${i}`);
  return { points, best, seen: best, claimed, battles: [] };
}
