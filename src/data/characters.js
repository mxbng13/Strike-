// Catalogue des personnages (créations originales).
// `look` pilote la génération procédurale du modèle 3D (src/characters/characterFactory.js).
// Les anciens Strikers « chibi » sont mis de côté dans data/charactersArchive.js (non chargé).
export const CHARACTERS = [
  {
    // Premier personnage officiel, modélisé en 3D d'après les illustrations de référence.
    id: 'claude', name: 'Claude', rarity: 'epique', element: 'Lumière',
    stats: { pv: 125, atk: 22, def: 14, vit: 17 },
    model: 'claude', // modèle 3D dédié : characters/models/claude.js
    look: { skin: 0xffd6b8, primary: 0x262b52, secondary: 0xf4f6ff, accent: 0xe3242b, hair: 0xf6e29a,
            pants: 0x262b52, shoes: 0x7a4426, outfit: 'suit', eyes: 'mask', accessory: 'heroMask',
            hairStyle: 'swoop', weapon: 'none', cape: false,
            rankParts: ['primary', 'pants', 'hair', 'shoes'] }, // ce qui devient or / diamant
  },
  // Strikers détaillés construits sur le squelette commun (characters/models/strikers/*.js).
  // Une rareté chacun ; tenue, cheveux et chaussures deviennent or / cristal aux paliers Or et Diamant.
  {
    id: 'tobi', name: 'Tobi', rarity: 'commun', element: 'Feu',
    stats: { pv: 100, atk: 17, def: 11, vit: 18 },
    model: 'tobi', // sweat à capuche, jean, casquette à l'envers
    look: { skin: 0xf2c09c, primary: 0xff7a1f, secondary: 0x41639e, accent: 0xd8262e, hair: 0x5c3418 },
  },
  {
    id: 'nova', name: 'Nova', rarity: 'rare', element: 'Vent',
    stats: { pv: 105, atk: 19, def: 11, vit: 22 },
    model: 'nova', // bomber court, jogging, queue de cheval
    look: { skin: 0xe9b58f, primary: 0x1fa79c, secondary: 0x2c2f3a, accent: 0x3ff7e0, hair: 0xd4609e },
  },
  {
    id: 'brutus', name: 'Brutus', rarity: 'epique', element: 'Terre',
    stats: { pv: 150, atk: 21, def: 19, vit: 11 },
    model: 'brutus', // gilet de cuir clouté, cargo, barbe
    look: { skin: 0x74462b, primary: 0x5a3220, secondary: 0x5b6340, accent: 0xd8661a, hair: 0x1a130f },
  },
  {
    id: 'selena', name: 'Selena', rarity: 'legendaire', element: 'Ombre',
    stats: { pv: 130, atk: 26, def: 15, vit: 20 },
    model: 'selena', // trench bordeaux, cuissardes, longs cheveux noirs
    look: { skin: 0xf1cdb4, primary: 0x6e1426, secondary: 0x16141a, accent: 0x2fb36e, hair: 0x1d1622 },
  },
  {
    id: 'kaiser', name: 'Kaiser', rarity: 'mythique', element: 'Néant',
    stats: { pv: 160, atk: 29, def: 20, vit: 16 },
    model: 'kaiser', // armure du Néant, cape, cheveux blancs
    look: { skin: 0xdcb394, primary: 0x23252f, secondary: 0x15141c, accent: 0xff2aa0, hair: 0xeceaf4 },
  },
];

export const getCharacter = (id) => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];

// Nom court : « Kaela Vent-d’Azur » -> « Kaela »
export const shortName = (c) => c.name.replace(/^(Le|La|Les|L’)\s+/, '').split(' ')[0];
