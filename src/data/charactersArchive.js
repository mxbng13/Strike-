// Strikers mis de côté pour l'instant (non chargés par le jeu).
// Pour en remettre un : déplacer son objet dans CHARACTERS (data/characters.js).
export const ARCHIVED_CHARACTERS = [
  {
    id: 'pip', name: 'Pip le Mousse', rarity: 'commun', element: 'Eau',
    stats: { pv: 90, atk: 14, def: 10, vit: 12 },
    look: { skin: 0xffd9b8, primary: 0x2f7fd6, secondary: 0xf2f2f2, accent: 0xffc93d, hair: 0x7a4a2a,
            hairStyle: 'spiky', weapon: 'sword', cape: false },
  },
  {
    id: 'brindille', name: 'Brindille', rarity: 'commun', element: 'Nature',
    stats: { pv: 100, atk: 11, def: 13, vit: 9 },
    look: { skin: 0xf5c9a0, primary: 0x4f9a3c, secondary: 0x8c6a3f, accent: 0xb6e35a, hair: 0x3c6b2a,
            hairStyle: 'hood', weapon: 'staff', cape: false },
  },
  {
    id: 'kaela', name: 'Kaela Vent-d’Azur', rarity: 'rare', element: 'Vent',
    stats: { pv: 105, atk: 18, def: 11, vit: 17 },
    look: { skin: 0xffe0c4, primary: 0x14a3b8, secondary: 0xfff4e0, accent: 0x7af0ff, hair: 0x2e5bd1,
            hairStyle: 'twintails', weapon: 'bow', cape: true },
  },
  {
    id: 'torvin', name: 'Torvin Forge-Braise', rarity: 'rare', element: 'Feu',
    stats: { pv: 130, atk: 17, def: 16, vit: 8 },
    look: { skin: 0xd99a6c, primary: 0xb8401f, secondary: 0x4a4a52, accent: 0xff8a2a, hair: 0x3a1d10,
            hairStyle: 'helmet', weapon: 'hammer', cape: false },
  },
  {
    id: 'nyx', name: 'Nyx Lame-Lune', rarity: 'epique', element: 'Ombre',
    stats: { pv: 110, atk: 24, def: 12, vit: 20 },
    look: { skin: 0xe9d6ff, primary: 0x2a1f4f, secondary: 0x8e6bff, accent: 0xc9b6ff, hair: 0xe8e8ff,
            hairStyle: 'long', weapon: 'sword', cape: true },
  },
  {
    id: 'mira', name: 'Mira Fil-d’Étoile', rarity: 'epique', element: 'Arcane',
    stats: { pv: 100, atk: 26, def: 10, vit: 16 },
    look: { skin: 0xffe6d6, primary: 0x6b3fd6, secondary: 0xffd86b, accent: 0xff9bf0, hair: 0xff7ac8,
            hairStyle: 'witch', weapon: 'orb', cape: true },
  },
  {
    id: 'solenne', name: 'Solenne l’Aurore', rarity: 'legendaire', element: 'Lumière',
    stats: { pv: 140, atk: 27, def: 18, vit: 15 },
    look: { skin: 0xfff0e0, primary: 0xfff4d6, secondary: 0xffb422, accent: 0xffe27a, hair: 0xffd36b,
            hairStyle: 'long', weapon: 'staff', cape: true, halo: true },
  },
  {
    id: 'ozzrah', name: 'Ozzrah Cœur-du-Néant', rarity: 'mythique', element: 'Néant',
    stats: { pv: 160, atk: 32, def: 20, vit: 18 },
    look: { skin: 0x5b4a7a, primary: 0x14101f, secondary: 0xff3d7f, accent: 0xff3d7f, hair: 0x1a1426,
            hairStyle: 'horns', weapon: 'orb', cape: true },
  },
  // --- Communs ---
  {
    id: 'galet', name: 'Galet', rarity: 'commun', element: 'Terre',
    stats: { pv: 120, atk: 10, def: 15, vit: 7 },
    look: { skin: 0xc9b69a, primary: 0x7d6b55, secondary: 0x5b5048, accent: 0x9fd36a, hair: 0x6f8f4a,
            hairStyle: 'spiky', weapon: 'none', offhand: 'shield', build: 'stout', cape: false },
  },
  {
    id: 'plume', name: 'Plume', rarity: 'commun', element: 'Vent',
    stats: { pv: 85, atk: 13, def: 9, vit: 15 },
    look: { skin: 0xffe3cf, primary: 0xf2f2f8, secondary: 0x9ec9ff, accent: 0xffd36b, hair: 0xf7c97a,
            hairStyle: 'bob', weapon: 'dagger', wings: 'feather', wingColor: 0xffffff, build: 'slim', cape: false },
  },
  {
    id: 'tico', name: 'Tico', rarity: 'commun', element: 'Feu',
    stats: { pv: 90, atk: 15, def: 8, vit: 14 },
    look: { skin: 0xffd9b8, primary: 0xd9542b, secondary: 0x3a2a3a, accent: 0xffb13d, hair: 0xff8a3d,
            hairStyle: 'spiky', weapon: 'dagger', ears: 'fox', tail: 'fox', cape: false },
  },
  // --- Rares ---
  {
    id: 'sora', name: 'Sora Brise-Glace', rarity: 'rare', element: 'Glace',
    stats: { pv: 110, atk: 19, def: 12, vit: 14 },
    look: { skin: 0xf4ecff, primary: 0x3b6fd1, secondary: 0xe8f4ff, accent: 0x9be7ff, hair: 0xdff3ff,
            hairStyle: 'long', weapon: 'spear', ears: 'elf', accessory: 'scarf', build: 'slim', cape: false },
  },
  {
    id: 'rokk', name: 'Rokk Bouclier-de-Pierre', rarity: 'rare', element: 'Terre',
    stats: { pv: 150, atk: 14, def: 20, vit: 6 },
    look: { skin: 0xb07a52, primary: 0x58606e, secondary: 0x8a6a3f, accent: 0xffc93d, hair: 0x2a1d14,
            hairStyle: 'helmet', weapon: 'sword', offhand: 'shield', build: 'stout', accessory: 'mask', cape: false },
  },
  // --- Épiques ---
  {
    id: 'vesper', name: 'Vesper Aile-de-Nuit', rarity: 'epique', element: 'Ombre',
    stats: { pv: 105, atk: 25, def: 11, vit: 19 },
    look: { skin: 0xf3e3ea, primary: 0x2b1a2f, secondary: 0x6e1238, accent: 0xff4f7b, hair: 0xb3123f,
            hairStyle: 'long', weapon: 'scythe', wings: 'bat', wingColor: 0x3a1430, build: 'slim', cape: false },
  },
  {
    id: 'ilya', name: 'Ilya Croc-de-Givre', rarity: 'epique', element: 'Glace',
    stats: { pv: 115, atk: 23, def: 13, vit: 18 },
    look: { skin: 0xffe8dc, primary: 0x6f86a8, secondary: 0x1f2c44, accent: 0x7fe0ff, hair: 0xe9f1ff,
            hairStyle: 'spiky', weapon: 'sword', ears: 'fox', tail: 'fox', tails: 2, accessory: 'scarf', cape: false },
  },
  // --- Légendaire ---
  {
    id: 'aurelion', name: 'Aurelion Cœur-de-Dragon', rarity: 'legendaire', element: 'Feu',
    stats: { pv: 150, atk: 29, def: 17, vit: 14 },
    look: { skin: 0xf0c49a, primary: 0x9e1e1e, secondary: 0xffb422, accent: 0xff7a2a, hair: 0x2a1410,
            hairStyle: 'horns', weapon: 'sword', wings: 'dragon', wingColor: 0xc23a1e, tail: 'dragon', cape: false },
  },
  // --- Mythique ---
  {
    id: 'elyndra', name: 'Elyndra l’Éternelle', rarity: 'mythique', element: 'Arcane',
    stats: { pv: 155, atk: 31, def: 19, vit: 20 },
    look: { skin: 0xfff2ea, primary: 0xf4f0ff, secondary: 0x8f7bff, accent: 0xc9a6ff, hair: 0xe6e2ff,
            hairStyle: 'long', weapon: 'staff', wings: 'angel', accessory: 'crown', halo: true, build: 'slim', cape: true },
  },
];
