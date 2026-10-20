// Apparence complète d'un Striker : palier (tenue), arme équipée, skin de personnage, skin de l'arme.
import { rankFor } from './ranks.js';
import { equippedWeapon } from './weapons.js';
import { equippedCharacterSkin, equippedWeaponSkin } from './skins.js';
import { save } from '../save/storage.js';

export function appearanceFor(strikerId, s = save.get()) {
  const weapon = equippedWeapon(strikerId, s);
  return {
    rank: rankFor(strikerId, s).id,
    weapon,
    skin: equippedCharacterSkin(strikerId, s),
    weaponSkin: weapon ? equippedWeaponSkin(weapon, s) : null,
  };
}
/** Clé courte décrivant l'apparence (pour savoir s'il faut reconstruire le modèle). */
export const appearanceKey = (id, a) => `${id}:${a.rank}:${a.weapon}:${a.skin?.id ?? ''}:${a.weaponSkin?.id ?? ''}`;
