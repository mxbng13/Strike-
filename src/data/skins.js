// SKINS : apparences alternatives, sans effet sur les statistiques.
// Deux catégories distinctes : skins de personnages et skins d'armes. Obtenus dans les coffres.
// Ajouter un skin ici suffit : les coffres, la boutique et les écrans d'équipement le prennent en compte.

// Skins de personnages : couleurs du costume pour un Striker donné (palier Basique ; en Or et Diamant,
// la tenue dorée / en cristal reste prioritaire).
export const CHARACTER_SKINS = [
  { id: 'claude-nuit', strikerId: 'claude', name: 'Claude Nuit', rarity: 'rare',
    look: { jacket: 0x16161a, pants: 0x111114, tie: 0x8e6bff, square: 0x8e6bff } },
  { id: 'claude-blanc', strikerId: 'claude', name: 'Claude Gala', rarity: 'epique',
    look: { jacket: 0xeceef4, pants: 0xdfe2ea, tie: 0x14172e, square: 0xe1222c } },
  { id: 'claude-bordeaux', strikerId: 'claude', name: 'Claude Bordeaux', rarity: 'legendaire',
    look: { jacket: 0x5a0f1f, pants: 0x3a0a14, tie: 0xffc83d, square: 0xffc83d } },
  // Exclusifs au Passe de combat (jamais dans les coffres) : source: 'pass'
  { id: 'tobi-neon', strikerId: 'tobi', name: 'Tobi Néon', rarity: 'epique', source: 'pass',
    look: { top: 0x2fd8ff, bottom: 0x9aa0c8, cap: 0x1b1d33 } },
  { id: 'nova-givre', strikerId: 'nova', name: 'Nova Givre', rarity: 'epique', source: 'pass',
    look: { top: 0xdff4ff, bottom: 0x9fb8ff, hair: 0x9fe6ff } },
  { id: 'kaiser-eclipse', strikerId: 'kaiser', name: 'Kaiser Éclipse', rarity: 'mythique', source: 'pass',
    look: { top: 0x4a1030 } },
];

// Skins d'armes : à choisir arme par arme. `weapons` (facultatif) limite un skin à certaines armes ;
// sans cette liste, le skin est compatible avec toutes les armes.
export const WEAPON_SKINS = [
  { id: 'camo', name: 'Camouflage', rarity: 'rare', style: 'camo' },
  { id: 'dore', name: 'Doré', rarity: 'epique', style: 'gold' },
  { id: 'neon', name: 'Néon', rarity: 'legendaire', style: 'neon' },
  { id: 'ether', name: 'Éther', rarity: 'legendaire', style: 'ether', source: 'pass' },
];
/** Skins qu'on peut trouver dans les coffres (les exclusifs du Passe en sont exclus). */
export const CHEST_CHARACTER_SKINS = CHARACTER_SKINS.filter((k) => k.source !== 'pass');
export const CHEST_WEAPON_SKINS = WEAPON_SKINS.filter((k) => k.source !== 'pass');

// (ancien nom conservé pour compatibilité)
export const SKINS = CHARACTER_SKINS;
export const skinsFor = (strikerId) => CHARACTER_SKINS.filter((s) => s.strikerId === strikerId);
export const getCharacterSkin = (id) => CHARACTER_SKINS.find((s) => s.id === id) ?? null;
export const getWeaponSkin = (id) => WEAPON_SKINS.find((s) => s.id === id) ?? null;
/** Le skin d'arme peut-il s'appliquer à cette arme ? */
export const skinFitsWeapon = (skin, weaponId) => !!skin && (!skin.weapons || skin.weapons.includes(weaponId));
