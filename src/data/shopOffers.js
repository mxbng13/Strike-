// Offres de la boutique (valeurs provisoires, modifiables ici).

// Onglet Pièces : packs payés en argent réel (achats intégrés iOS / Android).
// `productId` = identifiant du produit à déclarer dans App Store Connect / Google Play Console.
// AUCUNE pièce n'est créditée sans validation du paiement (voir game/payments.js).
export const COIN_PACKS = [
  { id: 'coins500', productId: 'strike.coins.500', coins: 500, price: 0.99 },
  { id: 'coins1500', productId: 'strike.coins.1500', coins: 1500, price: 2.99 },
  { id: 'coins3500', productId: 'strike.coins.3500', coins: 3500, price: 5.99 },
  { id: 'coins8000', productId: 'strike.coins.8000', coins: 8000, price: 11.99 },
  { id: 'coins20000', productId: 'strike.coins.20000', coins: 20000, price: 24.99 },
];
// Packs de diamants (argent réel), affichés juste sous les packs de pièces.
export const GEM_PACKS = [
  { id: 'gems100', productId: 'strike.gems.100', gems: 100, price: 0.99 },
  { id: 'gems500', productId: 'strike.gems.500', gems: 500, price: 3.99 },
  { id: 'gems1200', productId: 'strike.gems.1200', gems: 1200, price: 7.99 },
  { id: 'gems2500', productId: 'strike.gems.2500', gems: 2500, price: 14.99 },
  { id: 'gems6000', productId: 'strike.gems.6000', gems: 6000, price: 29.99 },
];
export const CURRENCY = 'EUR';
