// Tirage et attribution des récompenses des coffres.
import { BOX_LOOT, GUARANTEED_FALLBACK, DUPLICATE_COINS } from '../data/rewards.js';
import { CHEST_CHARACTER_SKINS, CHEST_WEAPON_SKINS } from '../data/skins.js';

const randInt = ([a, b], rng) => a + Math.floor(rng() * (b - a + 1));
const pick = (list, rng) => list[Math.floor(rng() * list.length)];

/**
 * Tire le contenu d'une box. `ctx` = { owned, characterSkinsOwned, weaponSkinsOwned, pickStriker }.
 * Renvoie [{ type, amount?, id?, rarity?, converted? }]. Un élément déjà possédé n'est jamais redonné :
 * il est converti en pièces (converted: true, amount: pièces).
 */
export function rollRewards(boxType, ctx, rng = Math.random) {
  const out = [];
  for (const entry of BOX_LOOT[boxType] ?? []) {
    if (rng() * 100 >= entry.chance) continue;
    if (entry.type === 'coins') out.push({ type: entry.type, amount: randInt(entry.amount, rng) });
    else if (entry.type === 'striker') {
      const { striker, rarity } = ctx.pickStriker(rng);
      out.push(striker ? { type: 'striker', id: striker.id, rarity: striker.rarity } : { type: 'striker', converted: true, rarity, amount: DUPLICATE_COINS[rarity] });
    } else if (entry.type === 'characterSkin' || entry.type === 'weaponSkin') {
      const all = entry.type === 'characterSkin' ? CHEST_CHARACTER_SKINS : CHEST_WEAPON_SKINS;
      const owned = (entry.type === 'characterSkin' ? ctx.characterSkinsOwned : ctx.weaponSkinsOwned) ?? [];
      if (!all.length) continue;
      const free = all.filter((k) => !owned.includes(k.id));
      if (free.length) { const k = pick(free, rng); out.push({ type: entry.type, id: k.id, rarity: k.rarity }); }
      else { const k = pick(all, rng); out.push({ type: entry.type, converted: true, rarity: k.rarity, amount: DUPLICATE_COINS[k.rarity] }); }
    }
  }
  // jamais de box vide
  if (!out.length) {
    const fb = (BOX_LOOT[boxType] ?? []).find((e) => e.type === GUARANTEED_FALLBACK);
    if (fb) out.push({ type: fb.type, amount: randInt(fb.amount, rng) });
  }
  return out;
}

/** Applique une liste de récompenses à un état de sauvegarde (fonction pure). */
export function applyRewards(st, rewards, t = Date.now()) {
  const next = { ...st };
  for (const r of rewards) {
    if (r.converted || r.type === 'coins') next.coins = next.coins + r.amount;
    else if (r.type === 'striker' && !next.owned.includes(r.id)) {
      next.owned = [...next.owned, r.id];
      next.obtainedAt = { ...next.obtainedAt, [r.id]: t };
    } else if (r.type === 'characterSkin') next.characterSkinsOwned = [...new Set([...(next.characterSkinsOwned ?? []), r.id])];
    else if (r.type === 'weaponSkin') next.weaponSkinsOwned = [...new Set([...(next.weaponSkinsOwned ?? []), r.id])];
  }
  return next;
}
