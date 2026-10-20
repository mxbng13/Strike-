// Tirage et attribution des récompenses des coffres.
import { BOX_LOOT, MAX_PER_BOX, DUPLICATE_COINS } from '../data/rewards.js';
import { CHEST_CHARACTER_SKINS, CHEST_WEAPON_SKINS } from '../data/skins.js';

const randInt = ([a, b], rng) => a + Math.floor(rng() * (b - a + 1));
const pick = (list, rng) => list[Math.floor(rng() * list.length)];

/** Tire une entrée de la table selon les poids. */
function pickWeighted(table, rng) {
  let x = rng() * table.reduce((t, e) => t + e.weight, 0);
  for (const e of table) { if (x < e.weight) return e; x -= e.weight; }
  return table[table.length - 1];
}

/**
 * Tire le contenu d'une box : exactement `drops` gains (3 / 5 / 7). `ctx` = { characterSkinsOwned,
 * weaponSkinsOwned, pickStriker }. Renvoie [{ type, amount?, id?, rarity?, converted? }].
 * Un élément déjà possédé n'est jamais redonné : il est converti en pièces (converted: true, amount: pièces).
 */
export function rollRewards(boxType, ctx, rng = Math.random) {
  const cfg = BOX_LOOT[boxType];
  if (!cfg) return [];
  const coinsEntry = cfg.table.find((e) => e.type === 'coins');
  const out = [], count = {};
  const skinsTaken = { characterSkin: [...(ctx.characterSkinsOwned ?? [])], weaponSkin: [...(ctx.weaponSkinsOwned ?? [])] };
  for (let i = 0; i < cfg.drops; i++) {
    let entry = pickWeighted(cfg.table, rng);
    if (MAX_PER_BOX[entry.type] && (count[entry.type] ?? 0) >= MAX_PER_BOX[entry.type]) entry = coinsEntry;
    count[entry.type] = (count[entry.type] ?? 0) + 1;
    if (entry.type === 'coins' || entry.type === 'gems') out.push({ type: entry.type, amount: randInt(entry.amount, rng) });
    else if (entry.type === 'striker') {
      const { striker, rarity } = ctx.pickStriker(rng);
      out.push(striker ? { type: 'striker', id: striker.id, rarity: striker.rarity } : { type: 'striker', converted: true, rarity, amount: DUPLICATE_COINS[rarity] });
    } else if (entry.type === 'characterSkin' || entry.type === 'weaponSkin') {
      const all = entry.type === 'characterSkin' ? CHEST_CHARACTER_SKINS : CHEST_WEAPON_SKINS;
      const free = all.filter((k) => !skinsTaken[entry.type].includes(k.id));
      if (free.length) { const k = pick(free, rng); skinsTaken[entry.type].push(k.id); out.push({ type: entry.type, id: k.id, rarity: k.rarity }); }
      else if (all.length) { const k = pick(all, rng); out.push({ type: entry.type, converted: true, rarity: k.rarity, amount: DUPLICATE_COINS[k.rarity] }); }
      else out.push({ type: 'coins', amount: randInt(coinsEntry.amount, rng) });
    }
  }
  return out;
}

/** Applique une liste de récompenses à un état de sauvegarde (fonction pure). */
export function applyRewards(st, rewards, t = Date.now()) {
  const next = { ...st };
  for (const r of rewards) {
    if (r.converted || r.type === 'coins') next.coins = next.coins + r.amount;
    else if (r.type === 'gems') next.gems = (next.gems ?? 0) + r.amount;
    else if (r.type === 'striker' && !next.owned.includes(r.id)) {
      next.owned = [...next.owned, r.id];
      next.obtainedAt = { ...next.obtainedAt, [r.id]: t };
    } else if (r.type === 'characterSkin') next.characterSkinsOwned = [...new Set([...(next.characterSkinsOwned ?? []), r.id])];
    else if (r.type === 'weaponSkin') next.weaponSkinsOwned = [...new Set([...(next.weaponSkinsOwned ?? []), r.id])];
  }
  return next;
}
