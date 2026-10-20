// Skins possédés et équipés (personnages et armes).
import { getCharacterSkin, getWeaponSkin, skinFitsWeapon, skinsFor, WEAPON_SKINS } from '../data/skins.js';
import { save } from '../save/storage.js';

export const ownsCharacterSkin = (id, s = save.get()) => (s.characterSkinsOwned ?? []).includes(id);
export const ownsWeaponSkin = (id, s = save.get()) => (s.weaponSkinsOwned ?? []).includes(id);

/** Skin de personnage porté par un Striker (ou null). */
export function equippedCharacterSkin(strikerId, s = save.get()) {
  const id = s.equippedSkin?.[strikerId];
  return id && ownsCharacterSkin(id, s) ? getCharacterSkin(id) : null;
}
/** Skin appliqué sur une arme (ou null) : uniquement s'il est possédé et compatible avec cette arme. */
export function equippedWeaponSkin(weaponId, s = save.get()) {
  const id = s.weaponSkin?.[weaponId];
  const k = id && ownsWeaponSkin(id, s) ? getWeaponSkin(id) : null;
  return k && skinFitsWeapon(k, weaponId) ? k : null;
}
/** Skins de personnage POSSÉDÉS pour un Striker (les autres ne sont jamais montrés dans la collection). */
export const ownedSkinsFor = (strikerId, s = save.get()) => skinsFor(strikerId).filter((k) => ownsCharacterSkin(k.id, s));
/** Skins d'arme POSSÉDÉS et compatibles avec une arme. */
export const ownedWeaponSkinsFor = (weaponId, s = save.get()) => WEAPON_SKINS.filter((k) => ownsWeaponSkin(k.id, s) && skinFitsWeapon(k, weaponId));

export function equipCharacterSkin(strikerId, skinId) {
  if (skinId && !ownsCharacterSkin(skinId)) return { ok: false };
  save.update((st) => ({ equippedSkin: { ...st.equippedSkin, [strikerId]: skinId } }));
  return { ok: true };
}
export function equipWeaponSkin(weaponId, skinId) {
  if (skinId && (!ownsWeaponSkin(skinId) || !skinFitsWeapon(getWeaponSkin(skinId), weaponId))) return { ok: false };
  save.update((st) => ({ weaponSkin: { ...st.weaponSkin, [weaponId]: skinId } }));
  return { ok: true };
}
