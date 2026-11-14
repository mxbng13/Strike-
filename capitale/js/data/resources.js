// Toutes les ressources du monde : [id, nom, emoji, prix de base, rareté]
// rareté : 1 commun · 2 peu commun · 3 rare · 4 très rare · 5 légendaire
export const RESOURCE_CATEGORIES = [
  { id: 'metaux', nom: 'Minéraux et métaux', emoji: '⛏️', list: [
    ['pierre', 'Pierre', '🪨', 3, 1],
    ['fer', 'Fer', '🔩', 10, 1],
    ['cuivre', 'Cuivre', '🟠', 14, 1],
    ['or', 'Or', '🥇', 120, 3],
    ['argent', 'Argent', '🥈', 60, 2],
    ['plomb', 'Plomb', '⚫', 9, 1],
    ['aluminium', 'Aluminium', '🥫', 18, 2],
    ['nickel', 'Nickel', '🪙', 22, 2],
    ['platine', 'Platine', '💍', 180, 4],
    ['diamant', 'Diamant', '💎', 400, 4],
    ['titane', 'Titane', '🛡️', 90, 3],
    ['lithium', 'Lithium', '🔋', 45, 2],
    ['uranium', 'Uranium (centrales nucléaires)', '☢️', 220, 4],
    ['zinc', 'Zinc', '⬜', 11, 1],
    ['cobalt', 'Cobalt', '🔵', 40, 2],
    ['manganese', 'Manganèse', '🟣', 16, 1],
    ['mercure', 'Mercure', '🌡️', 70, 3],
    ['bauxite', 'Bauxite (donne l’aluminium)', '🟫', 7, 1],
    ['beryllium', 'Béryllium', '🟢', 85, 3],
  ] },
  { id: 'energie', nom: 'Ressources énergétiques', emoji: '⚡', list: [
    ['petrole_brut', 'Pétrole brut', '🛢️', 30, 2],
    ['gaz_naturel', 'Gaz naturel', '💨', 22, 2],
    ['charbon', 'Charbon', '⬛', 8, 1],
    ['panneau_solaire', 'Panneau solaire (matériaux rares)', '☀️', 260, 3],
    ['composant_eolien', 'Composant d’éolienne', '🌬️', 220, 3],
    ['carburant', 'Carburant (diesel, essence)', '⛽', 25, 1],
    ['hydrogene', 'Hydrogène (stockage d’énergie)', '🫧', 60, 2],
    ['geothermie', 'Chaleur géothermique', '♨️', 40, 2],
    ['biomasse', 'Biomasse', '🍂', 6, 1],
    ['pile_nucleaire', 'Pile nucléaire', '⚛️', 900, 4],
    ['pile_solaire', 'Pile solaire', '🔆', 70, 2],
    ['plasma', 'Plasma (haute technologie)', '🟪', 1500, 5],
  ] },
  { id: 'chimie', nom: 'Produits chimiques et composés', emoji: '⚗️', list: [
    ['acide_sulfurique', 'Acide sulfurique', '🧪', 28, 2],
    ['ammoniac', 'Ammoniac', '🫙', 20, 1],
    ['chlore', 'Chlore', '🟩', 15, 1],
    ['sodium', 'Sodium', '🧂', 8, 1],
    ['calcium', 'Calcium', '🦴', 9, 1],
    ['carbonate_calcium', 'Carbonate de calcium (ciment)', '🏗️', 6, 1],
    ['silicium', 'Silicium (semi-conducteurs)', '💠', 35, 2],
    ['phosphore', 'Phosphore', '🔥', 24, 2],
    ['soufre', 'Soufre', '🟡', 12, 1],
    ['hydrocarbures', 'Hydrocarbures', '🛢️', 26, 1],
    ['solvants', 'Solvants', '🧴', 22, 1],
    ['plastique', 'Plastique', '♻️', 14, 1],
    ['benzene', 'Benzène', '⌬', 32, 2],
  ] },
  { id: 'bio', nom: 'Ressources biologiques', emoji: '🌿', list: [
    ['cuir', 'Cuir', '🟤', 25, 1],
    ['laine', 'Laine', '🐑', 14, 1],
    ['soie', 'Soie', '🧵', 55, 2],
    ['pollen', 'Pollen', '🌼', 12, 1],
    ['miel', 'Miel', '🍯', 18, 1],
    ['fruits_legumes', 'Fruits et légumes', '🥕', 5, 1],
    ['cafe', 'Café (plants, graines)', '☕', 16, 1],
    ['chanvre', 'Cannabis / chanvre (produits divers)', '🌱', 20, 2],
    ['algues', 'Algues', '🥬', 6, 1],
    ['bois', 'Bois', '🪵', 6, 1],
    ['peaux', 'Peaux d’animaux', '🦌', 20, 1],
    ['fibres_vegetales', 'Fibres végétales', '🌾', 5, 1],
    ['plantes_medicinales', 'Plantes médicinales', '🌿', 22, 2],
  ] },
  { id: 'avance', nom: 'Ressources naturelles avancées', emoji: '✨', list: [
    ['terres_rares', 'Terres rares', '🧲', 140, 3],
    ['cristaux', 'Cristaux (magie, électronique)', '🔮', 160, 3],
    ['gemmes', 'Gemmes précieuses (saphir, rubis, émeraude)', '💎', 260, 4],
    ['cendres_volcaniques', 'Cendres volcaniques', '🌋', 30, 2],
    ['pierre_de_lune', 'Pierre de lune', '🌙', 450, 4],
    ['fragment_etoile', 'Fragment d’étoile', '🌠', 1200, 5],
    ['cendres_phoenix', 'Cendres de phénix', '🔥', 1000, 5],
    ['essence_plantes_rares', 'Essence de plantes rares', '🌺', 200, 3],
    ['larmes_foret', 'Larmes de la forêt', '💧', 380, 4],
  ] },
  { id: 'pratique', nom: 'Autres ressources pratiques', emoji: '🧰', list: [
    ['cendres_bois', 'Cendres de bois', '🩶', 3, 1],
    ['poussiere_meteorite', 'Poussière de météorite', '☄️', 300, 4],
    ['plumes', 'Plumes', '🪶', 8, 1],
    ['fossiles', 'Fossiles', '🦕', 120, 3],
    ['radioactif', 'Ressources radioactives', '☢️', 350, 4],
    ['air_comprime', 'Air comprimé', '🎈', 12, 1],
  ] },
  { id: 'mer', nom: 'Ressources maritimes', emoji: '🌊', list: [
    ['perles', 'Perles', '🦪', 150, 3],
    ['poissons', 'Poissons', '🐟', 9, 1],
    ['corail', 'Corail', '🪸', 70, 2],
    ['algues_marines', 'Algues marines', '🌊', 10, 1],
  ] },
  { id: 'agri', nom: 'Agriculture et fabrication', emoji: '🚜', list: [
    ['graines', 'Graines', '🫘', 4, 1],
    ['engrais', 'Engrais (chimique ou organique)', '💩', 10, 1],
    ['pesticides', 'Pesticides', '🧯', 14, 1],
    ['insectes', 'Insectes', '🐞', 7, 1],
  ] },
];

export const RESOURCES = {};
for (const cat of RESOURCE_CATEGORIES) {
  for (const [id, nom, emoji, prix, rare] of cat.list) {
    RESOURCES[id] = { id, nom, emoji, prix, rare, cat: cat.id, kind: 'resource' };
  }
}

// Certaines ressources se mangent ou se boivent
RESOURCES.fruits_legumes.use = { faim: 10, soif: 4 };
RESOURCES.miel.use = { faim: 8, moral: 3 };
RESOURCES.poissons.use = { faim: 12, sante: -2 };
RESOURCES.cafe.use = { soif: 6, energie: 8 };
RESOURCES.plantes_medicinales.use = { sante: 6 };
