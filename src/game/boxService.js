// Service des box : achat, box gratuite, ouverture.
// Toutes les règles passent par ici et chaque opération modifie la sauvegarde en UNE seule écriture
// (pas d'état intermédiaire où la box serait perdue ou la monnaie débitée deux fois).
// Pour un futur mode en ligne, ces fonctions sont la frontière à déplacer côté serveur :
// le client n'aurait plus qu'à afficher le résultat renvoyé (tirage et horloge faits par le serveur).
import { BOX_TYPES, FREE_BOX } from '../data/boxes.js';
import { rollRewards, applyRewards } from './rewards.js';
import { CHARACTERS } from '../data/characters.js';
import { trackPass } from './battlePass.js';
import { RARITY_ORDER } from '../data/rarities.js';
import { save } from '../save/storage.js';

const now = () => Date.now();

export const totalBoxes = (s = save.get()) => Object.values(s.boxes).reduce((a, b) => a + b, 0); // box achetées

// --- Box gratuites (stock de 0 à FREE_BOX.maxStored, +1 toutes les FREE_BOX.intervalMs) ---
// Sauvegarde : freeBox = { stored, lastTick }. lastTick = début de la période en cours.
// Le calcul se fait à partir des dates enregistrées : fermer le jeu ne remet rien à zéro.
function syncFree(fb, t) {
  const { intervalMs, maxStored } = FREE_BOX;
  let { stored, lastTick } = fb;
  if (lastTick > t) lastTick = t; // horloge reculée : on ne bloque jamais plus d'une période
  if (stored >= maxStored) return { stored: maxStored, lastTick: t }; // plein : le compteur est à l'arrêt
  const gained = Math.floor((t - lastTick) / intervalMs);
  stored = Math.min(maxStored, stored + gained);
  lastTick = stored >= maxStored ? t : lastTick + gained * intervalMs;
  return { stored, lastTick };
}

export function freeBoxStatus(t = now()) {
  const fb = syncFree(save.get().freeBox, t);
  const full = fb.stored >= FREE_BOX.maxStored;
  return { stored: fb.stored, max: FREE_BOX.maxStored, full, nextInMs: full ? 0 : FREE_BOX.intervalMs - (t - fb.lastTick) };
}

export function buyBox(typeId) {
  const box = BOX_TYPES[typeId];
  if (!box) return { ok: false, error: 'unknown' };
  const s = save.get();
  const cost = { coins: box.price.coins ?? 0, gems: box.price.gems ?? 0 };
  if (s.coins < cost.coins || s.gems < cost.gems) return { ok: false, error: cost.gems ? 'gems' : 'coins' };
  save.update((st) => ({
    coins: st.coins - cost.coins,
    gems: st.gems - cost.gems,
    boxes: { ...st.boxes, [typeId]: (st.boxes[typeId] ?? 0) + 1 },
  }));
  return { ok: true };
}

/** Tire une rareté selon les probabilités de la box (tableau `rates`). */
export function rollRarity(typeId, rng = Math.random) {
  const rates = BOX_TYPES[typeId].rates;
  let r = rng() * 100;
  for (const k of RARITY_ORDER) {
    if (r < rates[k]) return k;
    r -= rates[k];
  }
  return RARITY_ORDER[RARITY_ORDER.length - 1];
}

/** Choisit un Striker NON possédé : rareté tirée selon la box ; s'il n'en reste plus dans cette rareté,
 *  on prend la rareté la plus proche (d'abord en dessous, puis au-dessus) où il en reste.
 *  Renvoie { striker, rarity } (striker = null si tous les Strikers sont déjà possédés). */
function pickNewStriker(typeId, owned, rng) {
  const rarity = rollRarity(typeId, rng);
  const target = RARITY_ORDER.indexOf(rarity);
  for (let d = 0; d < RARITY_ORDER.length; d++) {
    for (const idx of [target - d, target + d]) {
      if (idx < 0 || idx >= RARITY_ORDER.length || (d > 0 && idx === target)) continue;
      const pool = CHARACTERS.filter((c) => c.rarity === RARITY_ORDER[idx] && !owned.includes(c.id));
      if (pool.length) return { striker: pool[Math.floor(rng() * pool.length)], rarity: RARITY_ORDER[idx] };
    }
  }
  return { striker: null, rarity };
}

/**
 * Ouvre une box : la retire du stock, tire son contenu (XP, pièces, Striker, skins…), l'ajoute à la
 * sauvegarde et mémorise le résultat à afficher, le tout en UNE seule écriture (jamais crédité deux fois).
 */
export function openBox(typeId, source = 'bought', rng = Math.random, t = now()) {
  const s = save.get();
  if (s.pendingReveal) return { ok: true, reveal: s.pendingReveal }; // résultat pas encore vu : on le remontre
  const free = source === 'free' ? syncFree(s.freeBox, t) : null;
  if (free ? free.stored < 1 : !(s.boxes[typeId] > 0)) return { ok: false, error: 'empty' };
  if (free) typeId = FREE_BOX.type;
  const rewards = rollRewards(typeId, {
    characterSkinsOwned: s.characterSkinsOwned, weaponSkinsOwned: s.weaponSkinsOwned,
    pickStriker: (r) => pickNewStriker(typeId, s.owned, r),
  }, rng);
  const charId = rewards.find((r) => r.type === 'striker' && !r.converted)?.id ?? null;
  const reveal = { id: `${t}-${Math.floor(rng() * 1e6)}`, box: typeId, source, charId, rewards };
  save.update((st) => ({
    ...applyRewards(st, rewards, t),
    ...(free
      // si le stock était plein, le compte à rebours de la prochaine box démarre maintenant
      ? { freeBox: { stored: free.stored - 1, lastTick: free.stored >= FREE_BOX.maxStored ? t : free.lastTick } }
      : { boxes: { ...st.boxes, [typeId]: st.boxes[typeId] - 1 } }),
    pendingReveal: reveal,
    boxHistory: [...(st.boxHistory ?? []), { id: reveal.id, box: typeId, at: t, rewards }].slice(-50),
    stats: { ...st.stats, boxesOpened: (st.stats?.boxesOpened ?? 0) + 1 },
  }));
  trackPass('box');
  return { ok: true, reveal };
}

/** Le joueur a vu son écran de récompense. */
export function acknowledgeReveal(id) {
  if (save.get().pendingReveal?.id === id) save.update({ pendingReveal: null });
}
