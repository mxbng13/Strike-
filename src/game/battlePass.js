// PASSE DE COMBAT : progression, missions du jour, récompenses. Toutes les écritures passent par la
// sauvegarde en une seule mise à jour (jamais de double attribution d'une récompense).
import { save } from '../save/storage.js';
import {
  seasonAt, PASS_REWARDS, PASS_TIER_XP, PASS_TIERS, MISSION_POOL, MISSIONS_PER_DAY, MISSION_BONUS_XP,
} from '../data/battlePass.js';

const DUP_COINS = 500; // skin du passe déjà possédé : converti en pièces

export const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Les 3 missions du jour (tirage déterministe à partir de la date : identique toute la journée). */
export function missionsForDay(day) {
  let h = 2166136261;
  for (const c of day) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const pool = [...MISSION_POOL];
  const out = [];
  while (out.length < MISSIONS_PER_DAY && pool.length) {
    h = Math.imul(h ^ (h >>> 13), 1597334677) >>> 0;
    out.push(pool.splice(h % pool.length, 1)[0]);
  }
  return out.map((m) => ({ id: m.id, progress: 0, claimed: false }));
}

const fresh = (season, day) => ({ season, xp: 0, premium: false, claimed: { free: [], premium: [] }, day, missions: missionsForDay(day), bonus: false });

/** Passe à jour (nouvelle saison = remise à zéro ; nouveau jour = nouvelles missions). */
export function ensurePass(t = Date.now()) {
  const season = seasonAt(t).number, day = dayKey(t);
  const p = save.get().pass;
  if (!p || p.season !== season) { save.update({ pass: fresh(season, day) }); return save.get().pass; }
  if (p.day !== day) save.update({ pass: { ...p, day, missions: missionsForDay(day), bonus: false } });
  return save.get().pass;
}

export function passLevel(xp) {
  const tier = Math.min(PASS_TIERS, Math.floor(xp / PASS_TIER_XP));
  return { tier, into: tier >= PASS_TIERS ? PASS_TIER_XP : xp % PASS_TIER_XP, max: tier >= PASS_TIERS };
}

/** Ajoute de l'XP de passe. Renvoie { gained, before, after } (paliers). */
export function addPassXp(n, t = Date.now()) {
  const p = ensurePass(t);
  const before = passLevel(p.xp).tier;
  const xp = Math.min(PASS_TIERS * PASS_TIER_XP, p.xp + Math.max(0, Math.round(n)));
  save.update((s) => ({ pass: { ...s.pass, xp } }));
  return { gained: xp - p.xp, before, after: passLevel(xp).tier };
}

const missionDef = (id) => MISSION_POOL.find((m) => m.id === id);

/** Événement de jeu (fin de combat, dégâts, ulti, box…) : fait avancer les missions du jour concernées. */
export function trackPass(event, amount = 1, t = Date.now()) {
  const p = ensurePass(t);
  const events = new Set([event]);
  if (event === 'arena_play') events.add('any_play');
  let changed = false;
  const missions = p.missions.map((m) => {
    const d = missionDef(m.id);
    if (!d || !events.has(d.event) || m.progress >= d.target) return m;
    changed = true;
    return { ...m, progress: Math.min(d.target, m.progress + amount) };
  });
  if (changed) save.update((s) => ({ pass: { ...s.pass, missions } }));
}

export function missionList(s = save.get()) {
  // (une mission retirée du jeu, encore présente dans une sauvegarde du jour, n'est plus affichée)
  return (s.pass?.missions ?? []).filter((m) => missionDef(m.id)).map((m) => { const d = missionDef(m.id); return { ...d, ...m, done: m.progress >= d.target }; });
}

/** Récupère l'XP d'une mission terminée (+ bonus quand les 3 sont récupérées). */
export function claimMission(id, t = Date.now()) {
  const p = ensurePass(t);
  const m = p.missions.find((x) => x.id === id), d = missionDef(id);
  if (!m || !d || m.claimed || m.progress < d.target) return { ok: false };
  const missions = p.missions.map((x) => (x.id === id ? { ...x, claimed: true } : x));
  const allDone = missions.filter((x) => missionDef(x.id)).every((x) => x.claimed);
  const bonus = allDone && !p.bonus;
  save.update((s) => ({ pass: { ...s.pass, missions, bonus: s.pass.bonus || bonus } }));
  const res = addPassXp(d.xp + (bonus ? MISSION_BONUS_XP : 0));
  return { ok: true, xp: d.xp, bonus: bonus ? MISSION_BONUS_XP : 0, ...res };
}

/** État d'une récompense de palier : 'locked' | 'claimable' | 'claimed' | 'premium' (premium non débloqué). */
export function tierState(tier, track, s = save.get()) {
  const p = s.pass;
  if (!p) return 'locked';
  if ((p.claimed?.[track] ?? []).includes(tier)) return 'claimed';
  if (passLevel(p.xp).tier < tier) return 'locked';
  if (track === 'premium' && !p.premium) return 'premium';
  return 'claimable';
}

/** Applique une récompense (passe ou cadeau du jour) à un état de sauvegarde (fonction pure).
 *  Jamais d'XP ni de personnage : seuls pièces, diamants, box (cadeau du jour) et skins existent. */
export function applyPassReward(st, r) {
  const next = { ...st };
  if (r.coins) next.coins += r.coins;
  if (r.gems) next.gems += r.gems;
  if (r.box) next.boxes = { ...next.boxes, [r.box]: (next.boxes[r.box] ?? 0) + 1 };
  for (const [k, list] of [['characterSkin', 'characterSkinsOwned'], ['weaponSkin', 'weaponSkinsOwned']]) {
    if (!r[k]) continue;
    if ((next[list] ?? []).includes(r[k])) next.coins += DUP_COINS;
    else next[list] = [...(next[list] ?? []), r[k]];
  }
  return next;
}

export function claimTier(tier, track) {
  if (tierState(tier, track) !== 'claimable') return { ok: false };
  const reward = PASS_REWARDS[tier - 1][track];
  save.update((s) => ({ ...applyPassReward(s, reward), pass: { ...s.pass, claimed: { ...s.pass.claimed, [track]: [...s.pass.claimed[track], tier] } } }));
  return { ok: true, reward };
}

/** Récupère d'un coup toutes les récompenses disponibles. Renvoie la liste obtenue. */
export function claimAll() {
  const got = [];
  for (const { tier } of PASS_REWARDS) for (const track of ['free', 'premium']) { const r = claimTier(tier, track); if (r.ok) got.push(r.reward); }
  return got;
}

/**
 * Débloque le premium de la saison en cours APRÈS un paiement validé (appelé uniquement par
 * game/payments.js → onPurchaseVerified). Rien d'autre ne passe `premium` à true.
 */
export function unlockPremiumVerified(transactionId, t = Date.now()) {
  if (!transactionId) return { ok: false, error: 'unknown' };
  const p = ensurePass(t);
  if (p.premium) return { ok: false, error: 'owned' };
  save.update((s) => ({ pass: { ...s.pass, premium: true, premiumTx: transactionId, premiumAt: t } }));
  return { ok: true };
}

/** Nombre de choses à récupérer (badge du bouton PASSE). */
export function passClaimable(s = save.get()) {
  if (!s.pass) return 0;
  let n = 0;
  for (const { tier } of PASS_REWARDS) for (const track of ['free', 'premium']) if (tierState(tier, track, s) === 'claimable') n++;
  return n + missionList(s).filter((m) => m.done && !m.claimed).length;
}
