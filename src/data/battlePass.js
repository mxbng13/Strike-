// PASSE DE COMBAT : saisons de 6 semaines, 30 paliers. Deux pistes : gratuite (pour tous) et premium
// (achat intégré à 7,99 €, débloqué uniquement après validation du paiement : game/payments.js).
// L'XP sert uniquement au passe : elle se gagne en combattant et avec les missions du jour.
// Récompenses : { coins } | { gems } | { characterSkin: id } | { weaponSkin: id }
// (skins exclusifs : data/skins.js, source 'pass'). Jamais d'XP (pas de boucle) ni de personnage jouable
// (donc pas de box, qui peuvent contenir des Strikers).

export const PASS_TIER_XP = 100;          // XP de passe par palier
export const PASS_TIERS = 30;
// Produit d'achat intégré (identifiant identique dans App Store Connect / Google Play Console)
export const PASS_PREMIUM = { productId: 'strike.pass.premium', price: 7.99, label: '7,99 €' };
const SEASON_DAYS = 42;
const SEASON_ZERO = Date.UTC(2026, 9, 1); // 1er octobre 2026 : début de la saison 1
const SEASON_NAMES = ['Éveil', 'Néon', 'Givre', 'Éclipse'];

/** Saison en cours à l'instant t : { number, name, start, end }. */
export function seasonAt(t = Date.now()) {
  const len = SEASON_DAYS * 86400000;
  const n = Math.max(0, Math.floor((t - SEASON_ZERO) / len));
  return { number: n + 1, name: SEASON_NAMES[n % SEASON_NAMES.length], start: SEASON_ZERO + n * len, end: SEASON_ZERO + (n + 1) * len };
}

// Récompenses par palier (index 0 = palier 1). Piste gratuite puis premium.
const F = (i) => {
  const lvl = i + 1;
  if (lvl === 30) return { gems: 50 };
  if (lvl === 15) return { characterSkin: 'nova-givre' };
  if (lvl % 10 === 0) return { gems: 15 };
  if (lvl % 5 === 0) return { gems: 8 };
  return lvl % 2 ? { coins: 150 + lvl * 10 } : { coins: 100 + lvl * 8 };
};
const P = (i) => {
  const lvl = i + 1;
  if (lvl === 1) return { gems: 30 };
  if (lvl === 10) return { weaponSkin: 'ether' };
  if (lvl === 20) return { characterSkin: 'tobi-neon' };
  if (lvl === 30) return { characterSkin: 'kaiser-eclipse' };
  if (lvl === 25) return { gems: 60 };
  if (lvl % 5 === 0) return { gems: 25 };
  if (lvl % 3 === 0) return { gems: 10 };
  return lvl % 2 ? { coins: 300 + lvl * 15 } : { coins: 220 + lvl * 12 };
};
export const PASS_REWARDS = Array.from({ length: PASS_TIERS }, (_, i) => ({ tier: i + 1, free: F(i), premium: P(i) }));

/** XP de passe gagnée à la fin d'un combat. */
export const PASS_XP = { arenaWin: 50, arenaLoss: 20 };

// Missions du jour : 3 tirées chaque jour dans cette liste (même tirage pour toute la journée).
// event : l'événement de jeu qui fait progresser la mission (game/battlePass.js → trackPass).
export const MISSION_POOL = [
  { id: 'arena_play', event: 'arena_play', text: 'Joue 2 combats en arène (Map1)', target: 2, xp: 80 },
  { id: 'arena_win', event: 'arena_win', text: 'Gagne 1 combat en arène', target: 1, xp: 100 },
  { id: 'damage', event: 'damage', text: 'Inflige 2 500 dégâts en arène', target: 2500, xp: 90 },
  { id: 'ulti_hit', event: 'ulti_hit', text: 'Touche un ennemi avec ton ulti', target: 1, xp: 90 },
  { id: 'kills', event: 'kill', text: 'Élimine 8 adversaires en arène', target: 8, xp: 90 },
  { id: 'battle_play', event: 'any_play', text: 'Joue 3 combats en arène', target: 3, xp: 70 },
  { id: 'box_open', event: 'box', text: 'Ouvre 2 box', target: 2, xp: 60 },
  { id: 'bush_kill', event: 'bush_kill', text: 'Élimine un ennemi en tirant depuis un buisson', target: 1, xp: 110 },
];
export const MISSIONS_PER_DAY = 3;
export const MISSION_BONUS_XP = 100; // bonus quand les 3 missions du jour sont récupérées
