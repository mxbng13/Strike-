// Objets achetables : nourriture, vêtements, outils, équipements, meubles, médicaments…
// use : effet quand on l'utilise · dur : nombre d'utilisations (outils) ou heures portées (vêtements)
// comfort : confort apporté dans une maison
export const ITEM_CATEGORIES = {
  nourriture: 'Nourriture', boisson: 'Boissons', hygiene: 'Hygiène', vetement: 'Vêtements', outil: 'Outils',
  equipement: 'Équipements de travail', meuble: 'Meubles', deco: 'Décoration', appareil: 'Appareils',
  climat: 'Climatisation / chauffage', medicament: 'Médicaments', sport: 'Sport', cadeau: 'Cadeaux',
  livre: 'Livres', fabrique: 'Objets fabriqués', papier: 'Documents',
};

const I = (id, nom, emoji, cat, prix, extra = {}) => ({ id, nom, emoji, cat, prix, kind: 'item', ...extra });

export const ITEMS = Object.fromEntries([
  // 1. Besoins de base
  I('pain', 'Pain', '🥖', 'nourriture', 4, { use: { faim: 15 } }),
  I('sandwich', 'Sandwich', '🥪', 'nourriture', 9, { use: { faim: 30 } }),
  I('ration', 'Ration complète', '🍱', 'nourriture', 16, { use: { faim: 50, soif: 5 } }),
  I('repas_maison', 'Repas fait maison', '🍲', 'nourriture', 12, { use: { faim: 55, moral: 4 } }),
  I('festin', 'Festin de la mer', '🍣', 'nourriture', 30, { use: { faim: 75, moral: 8 } }),
  I('avoine', 'Avoine (pour cheval)', '🌾', 'nourriture', 6),
  I('eau', 'Bouteille d’eau', '💧', 'boisson', 2, { use: { soif: 25 } }),
  I('jus', 'Jus de fruits', '🧃', 'boisson', 5, { use: { soif: 35, faim: 4 } }),
  I('cafe_tasse', 'Café', '☕', 'boisson', 4, { use: { soif: 10, energie: 12 } }),
  I('boisson_energie', 'Boisson énergisante', '🥤', 'boisson', 9, { use: { soif: 20, energie: 22, sante: -2 } }),
  I('savon', 'Savon', '🧼', 'hygiene', 6),
  I('brosse_dents', 'Kit d’hygiène', '🪥', 'hygiene', 12, { use: { hygiene: 15 } }),
  I('manteau', 'Manteau chaud (froid)', '🧥', 'vetement', 90, { dur: 240, protect: 'froid' }),
  I('tenue_legere', 'Tenue légère (chaleur)', '👕', 'vetement', 45, { dur: 240, protect: 'chaud' }),
  I('impermeable', 'Imperméable (pluie)', '🧥', 'vetement', 60, { dur: 200, protect: 'pluie' }),

  // 2. Métier : outils et équipements
  I('pioche', 'Pioche', '⛏️', 'outil', 80, { dur: 25 }),
  I('hache', 'Hache', '🪓', 'outil', 70, { dur: 25 }),
  I('scie', 'Scie', '🪚', 'outil', 65, { dur: 30 }),
  I('marteau', 'Marteau', '🔨', 'outil', 40, { dur: 40 }),
  I('canne_peche', 'Canne à pêche', '🎣', 'outil', 55, { dur: 30 }),
  I('faucille', 'Faucille', '🌾', 'outil', 35, { dur: 30 }),
  I('trousse_medicale', 'Trousse médicale pro', '🩺', 'outil', 180, { dur: 30 }),
  I('ordinateur_pro', 'Ordinateur de travail', '💻', 'outil', 900, { dur: 120 }),
  I('mallette', 'Mallette de documents', '💼', 'outil', 120, { dur: 80 }),
  I('kit_artiste', 'Kit d’artiste', '🎨', 'outil', 140, { dur: 40 }),
  I('foreuse', 'Foreuse (machine)', '🛠️', 'outil', 2400, { dur: 40 }),
  I('casque', 'Casque de sécurité', '⛑️', 'equipement', 60, { dur: 60 }),
  I('gants', 'Gants de travail', '🧤', 'equipement', 20, { dur: 30 }),
  I('tenue_securite', 'Tenue de sécurité', '🦺', 'equipement', 110, { dur: 60 }),
  I('blouse', 'Blouse professionnelle', '🥼', 'equipement', 50, { dur: 60 }),
  I('combi_plongee', 'Combinaison de plongée', '🤿', 'equipement', 320, { dur: 30 }),
  I('combi_thermique', 'Combinaison thermique', '🧑‍🚒', 'equipement', 650, { dur: 30 }),
  I('combi_antirad', 'Combinaison anti-radiation', '☣️', 'equipement', 1200, { dur: 25 }),

  // 5. Confort
  I('lit', 'Lit', '🛏️', 'meuble', 260, { comfort: 15, bed: true }),
  I('canape', 'Canapé', '🛋️', 'meuble', 340, { comfort: 10 }),
  I('table', 'Table et chaises', '🪑', 'meuble', 150, { comfort: 6 }),
  I('armoire', 'Armoire', '🚪', 'meuble', 180, { comfort: 5 }),
  I('bureau_meuble', 'Bureau', '🗄️', 'meuble', 200, { comfort: 5 }),
  I('comptoir_meuble', 'Comptoir de commerce', '🏪', 'meuble', 450, { comfort: 3 }),
  I('tableau', 'Tableau', '🖼️', 'deco', 220, { comfort: 6 }),
  I('plante', 'Plante d’intérieur', '🪴', 'deco', 40, { comfort: 4 }),
  I('statue', 'Statue', '🗿', 'deco', 600, { comfort: 9 }),
  I('tapis', 'Tapis', '🟥', 'deco', 120, { comfort: 4 }),
  I('radio', 'Radio', '📻', 'appareil', 80, { comfort: 3 }),
  I('cuisine', 'Cuisine équipée', '🍳', 'appareil', 900, { comfort: 6, cooking: true }),
  I('ordinateur', 'Ordinateur personnel', '🖥️', 'appareil', 700, { comfort: 5 }),
  I('frigo', 'Réfrigérateur', '🧊', 'appareil', 400, { comfort: 4 }),
  I('chauffage', 'Chauffage', '🔥', 'climat', 350, { comfort: 4, climate: 'froid' }),
  I('climatiseur', 'Climatisation', '❄️', 'climat', 420, { comfort: 4, climate: 'chaud' }),

  // 6. Santé
  I('bandage', 'Bandage', '🩹', 'medicament', 15, { cure: 'blessure', cureChance: 0.5, use: { sante: 5 } }),
  I('antidouleur', 'Antidouleur', '💊', 'medicament', 20, { use: { sante: 10, moral: 2 } }),
  I('antibiotique', 'Antibiotique (ordonnance)', '💊', 'medicament', 45, { cure: 'maladie', cureChance: 1, needs: 'ordonnance' }),
  I('kit_soins', 'Kit de soins', '🧰', 'medicament', 60, { use: { sante: 25 } }),
  I('iode', 'Traitement anti-radiation', '🧪', 'medicament', 160, { cure: 'radiation', cureChance: 1, needs: 'ordonnance' }),
  I('vitamines', 'Vitamines', '🍊', 'medicament', 12, { use: { sante: 4, energie: 4 } }),
  I('ordonnance', 'Ordonnance', '📄', 'papier', 0),

  // 7. Loisirs / 9. Relations
  I('equip_sport', 'Équipement sportif', '👟', 'sport', 150),
  I('bouquet', 'Bouquet de fleurs', '💐', 'cadeau', 25, { gift: 8 }),
  I('chocolats', 'Boîte de chocolats', '🍫', 'cadeau', 18, { gift: 6 }),
  I('peluche', 'Peluche', '🧸', 'cadeau', 30, { gift: 7 }),
  I('parfum', 'Parfum', '🌸', 'cadeau', 120, { gift: 15 }),
  I('bijou', 'Bijou en or', '📿', 'fabrique', 600, { gift: 30 }),
  I('medaillon', 'Médaillon sentimental', '🧿', 'cadeau', 240, { gift: 22 }),

  // 8. Progression
  I('manuel', 'Manuel professionnel', '📘', 'livre', 220),
  I('encyclopedie', 'Encyclopédie des métiers', '📚', 'livre', 650),

  // Fabrication avancée (atelier)
  I('meuble_luxe', 'Meuble d’ébéniste', '🪑', 'fabrique', 900, { comfort: 14 }),
  I('vase_ceramique', 'Vase en céramique', '🏺', 'fabrique', 160, { comfort: 6, gift: 10 }),
  I('montre', 'Montre d’horloger', '⌚', 'fabrique', 1100, { gift: 25 }),
  I('violon', 'Violon de luthier', '🎻', 'fabrique', 1400, { comfort: 8 }),
  I('sac_cuir', 'Sac en cuir', '👜', 'fabrique', 380, { gift: 14 }),
  I('vitrail', 'Vitrail', '🪟', 'fabrique', 500, { comfort: 10 }),
  I('armure_celeste', 'Armure céleste', '🛡️', 'fabrique', 9000),
  I('potion_phenix', 'Potion du phénix', '🧪', 'fabrique', 4500, { use: { sante: 100, energie: 100, moral: 30 }, cure: 'tout', cureChance: 1 }),
  I('reacteur_plasma', 'Réacteur à plasma', '🌀', 'fabrique', 14000),
  I('amulette_lune', 'Amulette de lune', '🌙', 'fabrique', 2600, { gift: 40 }),
].map((it) => [it.id, it]));
