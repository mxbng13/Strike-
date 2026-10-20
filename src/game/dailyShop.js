// Boutique du jour : offres du jour (mêmes pour tous, selon la date), achat une seule fois par jour.
import { CHEST_CHARACTER_SKINS, CHEST_WEAPON_SKINS } from '../data/skins.js';
import { SKIN_PRICES, DAILY_PACKS } from '../data/dailyShop.js';
import { dayKey } from './battlePass.js';
import { save } from '../save/storage.js';

// tirage stable pour un jour donné (hachage de la date)
function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const pick = (list, day, salt) => list[hash(`${day}:${salt}`) % list.length];

/** Offres du jour : { day, characterSkin, weaponSkin, packs } (chaque offre : id, prix, contenu). */
export function dailyOffers(t = Date.now()) {
  const day = dayKey(t);
  const cs = pick(CHEST_CHARACTER_SKINS, day, 'perso');
  const ws = pick(CHEST_WEAPON_SKINS, day, 'arme');
  return {
    day,
    characterSkin: cs && { id: `skin:${cs.id}`, skin: cs, price: { gems: SKIN_PRICES.character[cs.rarity] ?? 200 } },
    weaponSkin: ws && { id: `wskin:${ws.id}`, skin: ws, price: { gems: SKIN_PRICES.weapon[ws.rarity] ?? 140 } },
    packs: DAILY_PACKS.map((p) => ({ ...p, discount: Math.round((1 - (p.price.coins ?? p.price.gems) / (p.value.coins ?? p.value.gems)) * 100) })),
  };
}
/** Temps restant avant les offres du lendemain (ms). */
export function msUntilTomorrow(t = Date.now()) {
  const d = new Date(t); const n = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return n.getTime() - t;
}
const shopState = (t, s = save.get()) => (s.shop?.day === dayKey(t) ? s.shop : { day: dayKey(t), bought: [] });
/** L'offre est-elle déjà achetée aujourd'hui ? (les skins : déjà possédés) */
export function isSoldOut(offerId, t = Date.now(), s = save.get()) {
  if (offerId.startsWith('skin:')) return (s.characterSkinsOwned ?? []).includes(offerId.slice(5));
  if (offerId.startsWith('wskin:')) return (s.weaponSkinsOwned ?? []).includes(offerId.slice(6));
  return shopState(t, s).bought.includes(offerId);
}

/** Achète une offre du jour : débite le prix, crédite le contenu. { ok, error? } */
export function buyDaily(offerId, t = Date.now()) {
  const o = dailyOffers(t);
  const offer = [o.characterSkin, o.weaponSkin, ...o.packs].find((x) => x?.id === offerId);
  if (!offer) return { ok: false, error: 'unavailable' };          // pas (ou plus) en boutique aujourd'hui
  if (isSoldOut(offerId, t)) return { ok: false, error: 'sold' };
  const s = save.get();
  const cost = { coins: offer.price.coins ?? 0, gems: offer.price.gems ?? 0 };
  if (s.coins < cost.coins || s.gems < cost.gems) return { ok: false, error: cost.gems ? 'gems' : 'coins' };
  save.update((st) => {
    const next = { coins: st.coins - cost.coins, gems: st.gems - cost.gems, shop: { ...shopState(t, st), bought: [...shopState(t, st).bought, offerId] } };
    if (offerId.startsWith('skin:')) next.characterSkinsOwned = [...(st.characterSkinsOwned ?? []), offer.skin.id];
    else if (offerId.startsWith('wskin:')) next.weaponSkinsOwned = [...(st.weaponSkinsOwned ?? []), offer.skin.id];
    else {
      next.coins += offer.coins ?? 0;
      next.boxes = { ...st.boxes };
      for (const [k, n] of Object.entries(offer.boxes ?? {})) next.boxes[k] = (next.boxes[k] ?? 0) + n;
    }
    return next;
  });
  return { ok: true, offer };
}

/** Le joueur a-t-il déjà vu les offres d'aujourd'hui ? (pastille « ! » sur le bouton BOUTIQUE) */
export const newShopOffers = (s = save.get(), t = Date.now()) => s.shopSeenDay !== dailyOffers(t).day;
export function markShopSeen(t = Date.now()) {
  const day = dailyOffers(t).day;
  if (save.get().shopSeenDay !== day) save.update({ shopSeenDay: day });
}
