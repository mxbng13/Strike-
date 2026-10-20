// Niveaux de rareté : couleur d'UI, couleur d'aura 3D, nombre d'étoiles.
export const RARITIES = {
  commun:     { label: 'Commun',     color: '#9aa7b8', aura: 0x9aa7b8, stars: 1, aura3d: false },
  rare:       { label: 'Rare',       color: '#3fa9ff', aura: 0x3fa9ff, stars: 2, aura3d: false },
  epique:     { label: 'Épique',     color: '#b45cff', aura: 0xb45cff, stars: 3, aura3d: true },
  legendaire: { label: 'Légendaire', color: '#ffb422', aura: 0xffb422, stars: 4, aura3d: true },
  mythique:   { label: 'Mythique',   color: '#ff3d7f', aura: 0xff3d7f, stars: 5, aura3d: true },
};
export const RARITY_ORDER = ['commun', 'rare', 'epique', 'legendaire', 'mythique'];
