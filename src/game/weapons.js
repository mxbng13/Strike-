// Armes : chaque Striker utilise toujours sa propre arme (data/weapons.js). Plus d'achat ni d'amélioration :
// seuls les skins d'armes se choisissent (game/skins.js).
import { WEAPONS, weaponOf } from '../data/weapons.js';

/** Arme d'un Striker (id). */
export const equippedWeapon = (strikerId) => weaponOf(strikerId).id;
/** Les armes n'ont plus de niveau : aucun bonus d'attaque. */
export const weaponBonus = () => 0;

export { WEAPONS };
