import { JOBS, SECTOR_BY_ID } from './jobs.js';
// Lieux de la capitale et sites de ressources sur la carte.
// spot : où placer le lieu (voir world.js) · shop : objets vendus · services : actions payantes
// special : écran particulier (marché des ressources, garage, gare, école…)
// Effets possibles : faim, soif, hygiene, energie, sante, moral (en points), min = durée en minutes de jeu

// shop : catégories de produits affichées (offres des producteurs sur le marché) · special : écran particulier
// Les services de chaque lieu viennent de economy.js (SERVICES, champ place) : ils sont rendus par des gens.
const SHOP = {
  food: ['pain', 'sandwich', 'plat', 'ration', 'fromage', 'fruits_legumes', 'viande', 'lait', 'eau', 'jus', 'cafe_tasse', 'biere', 'vin', 'boisson_energie', 'chocolats', 'miel', 'avoine', 'journal'],
  hygiene: ['savon', 'brosse_dents'],
  clothes: ['manteau', 'tenue_legere', 'impermeable'],
  tools: ['pioche', 'hache', 'scie', 'marteau', 'faucille', 'canne_peche', 'arc', 'ruche', 'alambic', 'gants', 'casque', 'tenue_securite', 'blouse', 'mallette',
    'kit_artiste', 'trousse_medicale', 'ordinateur_pro', 'combi_plongee', 'combi_thermique', 'combi_antirad', 'foreuse', 'bateau_peche', 'selle', 'panneau_solaire', 'composant_eolien'],
  furniture: ['lit', 'canape', 'table', 'armoire', 'bureau_meuble', 'comptoir_meuble', 'meuble_luxe', 'tableau', 'plante', 'statue', 'tapis', 'vase_ceramique', 'vitrail',
    'radio', 'cuisine', 'ordinateur', 'frigo', 'chauffage', 'climatiseur', 'violon'],
  pharma: ['bandage', 'antidouleur', 'antibiotique', 'kit_soins', 'iode', 'vitamines', 'vaccin', 'potion_phenix'],
  gifts: ['bouquet', 'chocolats', 'peluche', 'parfum', 'medaillon', 'bijou', 'montre', 'sac_cuir', 'amulette_lune', 'alliances', 'vase_ceramique'],
  vehicles: ['cheval', 'voiture', 'drone', 'selle', 'avoine', 'carburant', 'pile_solaire', 'electricite'],
  machines: ['haut_fourneau', 'four_cimenterie', 'four_verrier', 'moulin', 'presse', 'tour_usinage', 'chaine_assemblage', 'reacteur_chimique', 'raffinerie',
    'centrale_thermique', 'reacteur_nucleaire', 'imprimerie', 'scierie', 'metier_tisser', 'robot_industriel', 'reacteur_plasma'],
  books: ['manuel', 'encyclopedie', 'journal'],
  sport: ['equip_sport'],
};

export const PLACES = [
  { id: 'marche', nom: 'Marché central', emoji: '🛒', spot: 'filler:0', desc: 'Les produits des agriculteurs, boulangers, bouchers, fromagers… vendus par leurs producteurs.', shop: SHOP.food },
  { id: 'restaurant', nom: 'Restaurant Orbite', emoji: '🍽️', spot: 'filler:1', desc: 'Des serveurs vous servent les plats préparés par les cuisiniers.' },
  { id: 'bains', nom: 'Bains publics', emoji: '🚿', spot: 'filler:2', desc: 'Douches et massages. L’eau vient des techniciens en environnement, le savon des chimistes.', shop: SHOP.hygiene },
  { id: 'coiffeur', nom: 'Salon de coiffure', emoji: '💈', spot: 'filler:3', desc: 'Coiffeurs et esthéticiennes.' },
  { id: 'hotel', nom: 'Hôtel Nexus', emoji: '🏨', spot: 'filler:4', desc: 'Réceptionnistes, gouvernantes et concierges.' },
  { id: 'vetements', nom: 'Boutique de vêtements', emoji: '👕', spot: 'filler:5', desc: 'Vêtements cousus par les couturiers, selon le climat.', shop: SHOP.clothes },
  { id: 'quincaillerie', nom: 'Quincaillerie & Outils', emoji: '🧰', spot: 'filler:6', desc: 'Outils forgés, équipements cousus ou moulés, réparations à la forge.', shop: SHOP.tools },
  { id: 'comptoir', nom: 'Comptoir des ressources', emoji: '📦', spot: 'filler:7', desc: 'Le grand marché : toutes les marchandises de tous les producteurs. Vendez ici ce que vous produisez.', special: 'market' },
  { id: 'atelier', nom: 'Ateliers d’artisans', emoji: '🔨', spot: 'ring', desc: 'Lieu de travail des artisans et du textile.' },
  { id: 'usine', nom: 'Zone industrielle', emoji: '🏭', spot: 'core:silos', desc: 'Industrie, mécanique, énergie. Les machines construites ici sont en vente.', shop: SHOP.machines },
  { id: 'chantier', nom: 'Chantier du BTP', emoji: '🏗️', spot: 'ring', desc: 'Maçons, charpentiers, plombiers, électriciens, peintres.' },
  { id: 'technopole', nom: 'Technopole', emoji: '💻', spot: 'core:twins', desc: 'Informatique et télécoms.' },
  { id: 'labo', nom: 'Dôme de recherche', emoji: '🔬', spot: 'core:dome', desc: 'Laboratoires des scientifiques.' },
  { id: 'tribunal', nom: 'Palais de justice', emoji: '⚖️', spot: 'ring', desc: 'Procureurs, juges, avocats, médiateurs, huissiers.' },
  { id: 'caserne', nom: 'Caserne de sécurité', emoji: '🚓', spot: 'ring', desc: 'Police, gendarmerie, pompiers, prison. Portez plainte en cas de vol.', special: 'theft' },
  { id: 'emploi', nom: 'Agence pour l’emploi', emoji: '💼', spot: 'ring', desc: 'Petits boulots sans diplôme, métiers qui manquent de bras.', special: 'jobs' },
  { id: 'garage', nom: 'Garage & Écuries', emoji: '🚗', spot: 'filler:8', desc: 'Véhicules fabriqués par les mécaniciens et chevaux élevés par les éleveurs. Carburant, entretien.', shop: SHOP.vehicles, special: 'garage' },
  { id: 'gare', nom: 'Gare des navettes', emoji: '🚉', spot: 'core:pad', desc: 'Trains conduits par des conducteurs, navettes pilotées par des pilotes.', special: 'transit' },
  { id: 'portail', nom: 'Portails de téléportation', emoji: '🌀', spot: 'core:spire', desc: 'Des opérateurs de téléportation vous envoient partout (ils consomment de l’électricité).' },
  { id: 'com', nom: 'Tour de communication', emoji: '📡', spot: 'ring', desc: 'Publicités et messages massifs.' },
  { id: 'guilde', nom: 'Maison des guildes', emoji: '⚜️', spot: 'ring', desc: 'Entrer dans une guilde ou une ville privée.', special: 'guild' },
  { id: 'club', nom: 'Club Néon', emoji: '🍸', spot: 'ring', desc: 'Lieu exclusif : il faut un pass pour entrer.', special: 'club' },
  { id: 'musee', nom: 'Musée des Étoiles', emoji: '🖼️', spot: 'ring', desc: 'Œuvres restaurées et fossiles exposés par les conservateurs.' },
  { id: 'meubles', nom: 'Meubles & Déco', emoji: '🛋️', spot: 'filler:9', desc: 'Meubles d’ébénistes et tapissiers, appareils de l’électronique et des chaînes d’assemblage.', shop: SHOP.furniture },
  { id: 'immobilier', nom: 'Agence immobilière', emoji: '🏠', spot: 'ring', desc: 'Louer ou acheter (acte du notaire et bornage du géomètre obligatoires pour acheter).', special: 'realestate' },
  { id: 'residences', nom: 'Résidences', emoji: '🏘️', spot: 'core:homes', desc: 'Le quartier des logements.', special: 'home' },
  { id: 'hopital', nom: 'Hôpital', emoji: '🏥', spot: 'filler:10', desc: 'Infirmiers et aides-soignants.' },
  { id: 'cabinet', nom: 'Cabinet médical', emoji: '🩺', spot: 'ring', desc: 'Médecins, dentistes, psychologues, kinés.' },
  { id: 'pharmacie', nom: 'Pharmacie', emoji: '💊', spot: 'filler:11', desc: 'Médicaments préparés par les pharmaciens à partir des plantes des cueilleurs.', shop: SHOP.pharma },
  { id: 'assurance', nom: 'Courtiers en assurance', emoji: '🛡️', spot: 'ring', desc: 'Assurances santé vendues par des courtiers (tables des actuaires).' },
  { id: 'loisirs', nom: 'Quartier des spectacles', emoji: '🎭', spot: 'ring', desc: 'Cinéma, concerts, théâtre, danse.' },
  { id: 'arene', nom: 'Arène & Sports', emoji: '🏟️', spot: 'ring', desc: 'Entraîneurs, coachs, arbitres.', shop: SHOP.sport },
  { id: 'tourisme', nom: 'Office de tourisme', emoji: '🧭', spot: 'ring', desc: 'Guides touristiques et agents de voyage.' },
  { id: 'ecole', nom: 'Académie des métiers', emoji: '🎓', spot: 'ring', desc: 'Formations données par des formateurs, école des enfants.', special: 'school', shop: SHOP.books },
  { id: 'evenements', nom: 'Salle des fêtes', emoji: '💍', spot: 'ring', desc: 'Mariages, fêtes, rencontres.', special: 'events' },
  { id: 'famille', nom: 'Maison de la famille', emoji: '👶', spot: 'ring', desc: 'Adoption, garde d’enfants.', special: 'family' },
  { id: 'cadeaux', nom: 'Boutique de cadeaux', emoji: '🎁', spot: 'ring', desc: 'Bijoux, fleurs, parfums, objets sentimentaux.', shop: SHOP.gifts },
  { id: 'veterinaire', nom: 'Clinique vétérinaire', emoji: '🐾', spot: 'ring', desc: 'Vétérinaires et éleveurs : chiots, chatons, croquettes.', shop: ['croquettes', 'chiot', 'chaton'] },
  { id: 'poste', nom: 'La Poste', emoji: '📮', spot: 'ring', desc: 'Les facteurs livrent colis et courrier.' },
  { id: 'kiosque', nom: 'Kiosque Presse & Loto', emoji: '🎟️', spot: 'ring', desc: 'Journaux, tickets de loto (tirage chaque dimanche à 20 h).', shop: ['journal', 'smartphone'] },
  { id: 'parc', nom: 'Parc central', emoji: '🌳', spot: 'ring', desc: 'Gratuit : promenade, jogging, pique-nique. Entretenu par les jardiniers.', special: 'park' },
  { id: 'bibliotheque', nom: 'Bibliothèque', emoji: '📚', spot: 'ring', desc: 'Emprunter des livres : un peu d’expérience et du moral.' },
  { id: 'prefecture', nom: 'Préfecture & Centre des impôts', emoji: '🏢', spot: 'ring', desc: 'Carte d’identité, carte grise, impôts.', shop: ['carte_identite', 'carte_grise'], special: 'taxes' },
  { id: 'auto_ecole', nom: 'Auto-école', emoji: '🚘', spot: 'ring', desc: 'Les moniteurs vous font passer le permis de conduire.' },
  { id: 'mairie', nom: 'Hôtel de ville', emoji: '🏛️', spot: 'core:command', desc: 'Créer sa société, faire construire, zones réservées.', special: 'cityhall' },
  { id: 'banque', nom: 'Banque & Bourse', emoji: '📈', spot: 'core:spire2', desc: 'Banquiers, traders, conseillers.', special: 'bank' },
];

// ---------------- Sites de ressources sur la carte ----------------
// loot : [ressource, poids, quantité min, quantité max]
export const SITES = [
  { id: 'ferme', nom: 'Fermes des Plaines', emoji: '🌾', kind: 'ferme', desc: 'Champs, vergers, ruches et élevages.', station: true,
    gather: [
      { id: 'cueillir', nom: 'Cueillir et ramasser', min: 120, energie: 10, rolls: 3, loot: [['fruits_legumes', 6, 2, 4], ['fibres_vegetales', 3, 1, 3], ['graines', 3, 1, 3], ['pollen', 1, 1, 2], ['insectes', 1, 1, 2], ['plumes', 1, 1, 3]] },
      { id: 'recolter', nom: 'Récolter les champs', min: 180, energie: 16, tool: 'faucille', equip: ['gants'], risque: 0.03, rolls: 5,
        loot: [['fruits_legumes', 6, 3, 6], ['cafe', 2, 1, 3], ['chanvre', 2, 1, 2], ['biomasse', 3, 2, 4], ['laine', 2, 1, 3], ['cuir', 1, 1, 1], ['miel', 1, 1, 2], ['soie', 0.5, 1, 1], ['plantes_medicinales', 1, 1, 2]] },
    ] },
  { id: 'foret', nom: 'Camp forestier', emoji: '🪓', kind: 'foret', desc: 'Grandes forêts exploitables.', station: true,
    gather: [
      { id: 'ramasser', nom: 'Ramasser du bois mort', min: 90, energie: 8, rolls: 3, loot: [['bois', 5, 1, 3], ['cendres_bois', 1, 1, 2], ['plumes', 1, 1, 2], ['insectes', 1, 1, 3]] },
      { id: 'abattre', nom: 'Abattre des arbres', min: 180, energie: 18, tool: 'hache', equip: ['casque', 'gants'], risque: 0.06, rolls: 5,
        loot: [['bois', 8, 4, 8], ['fibres_vegetales', 2, 2, 4], ['plantes_medicinales', 1, 1, 2], ['peaux', 1, 1, 1], ['cendres_bois', 1, 1, 2]] },
      { id: 'chasser', nom: 'Chasser', min: 180, energie: 16, tool: 'arc', risque: 0.04, rolls: 4,
        loot: [['peaux', 5, 1, 2], ['plumes', 4, 2, 5], ['cuir', 2, 1, 2], ['insectes', 1, 1, 3]] },
      { id: 'herbes', nom: 'Cueillir des plantes médicinales', min: 150, energie: 10, tool: 'faucille', rolls: 3,
        loot: [['plantes_medicinales', 6, 1, 3], ['fibres_vegetales', 2, 1, 3], ['pollen', 1, 1, 2]] },
    ] },
  { id: 'mine', nom: 'Mine du Pic Gris', emoji: '⛏️', kind: 'mine', desc: 'Filons de métaux dans la montagne. Il y fait froid.', station: true,
    gather: [
      { id: 'carriere', nom: 'Extraire de la pierre', min: 120, energie: 14, tool: 'pioche', equip: ['gants'], risque: 0.04, rolls: 4,
        loot: [['pierre', 8, 3, 6], ['argile', 6, 3, 6], ['carbonate_calcium', 3, 1, 3], ['calcium', 2, 1, 2], ['soufre', 1, 1, 2], ['silicium', 1, 1, 2], ['fossiles', 0.25, 1, 1]] },
      { id: 'miner', nom: 'Miner les filons', min: 180, energie: 20, tool: 'pioche', equip: ['casque', 'gants'], risque: 0.08, rolls: 5,
        loot: [['fer', 10, 2, 5], ['cuivre', 7, 1, 4], ['charbon', 7, 2, 5], ['plomb', 4, 1, 3], ['zinc', 4, 1, 3], ['bauxite', 5, 2, 4], ['manganese', 3, 1, 2],
          ['nickel', 3, 1, 2], ['cobalt', 2, 1, 2], ['argent', 2, 1, 2], ['lithium', 2, 1, 2], ['mercure', 1, 1, 1], ['or', 1, 1, 1], ['titane', 0.8, 1, 1],
          ['beryllium', 0.6, 1, 1], ['platine', 0.3, 1, 1], ['diamant', 0.15, 1, 1], ['gemmes', 0.25, 1, 1], ['cristaux', 0.4, 1, 1], ['terres_rares', 0.4, 1, 1]] },
      { id: 'charbon', nom: 'Extraire du charbon', min: 180, energie: 18, tool: 'pioche', equip: ['casque', 'gants'], risque: 0.07, rolls: 5,
        loot: [['charbon', 9, 3, 6], ['fer', 3, 1, 3], ['soufre', 1, 1, 2], ['fossiles', 0.15, 1, 1]] },
      { id: 'uranium', nom: 'Galerie radioactive (uranium)', min: 180, energie: 22, tool: 'pioche', equip: ['combi_antirad', 'casque'], permit: 'certif_nucleaire', risque: 0.05, rad: true, rolls: 3,
        loot: [['uranium', 4, 1, 2], ['radioactif', 2, 1, 1], ['terres_rares', 2, 1, 2], ['plomb', 3, 1, 3]] },
    ] },
  { id: 'port', nom: 'Port des Brumes', emoji: '⚓', kind: 'port', desc: 'Pêche, plongée et sel de mer.', station: true,
    gather: [
      { id: 'pecher', nom: 'Pêcher', min: 150, energie: 10, tool: 'canne_peche', rolls: 4, loot: [['poissons', 8, 1, 3], ['algues_marines', 3, 1, 3], ['algues', 2, 1, 2]] },
      { id: 'sel', nom: 'Récolter le sel et les algues', min: 120, energie: 12, rolls: 4, loot: [['sodium', 5, 2, 4], ['chlore', 2, 1, 2], ['algues', 4, 2, 4], ['algues_marines', 3, 1, 3]] },
      { id: 'peche_large', nom: 'Pêche au large (bateau)', min: 240, energie: 16, tool: 'bateau_peche', permit: 'permis_bateau', fuel: { carburant: 2 }, rolls: 6,
        loot: [['poissons', 8, 3, 6], ['algues_marines', 2, 2, 4], ['perles', 0.4, 1, 1], ['corail', 0.6, 1, 1]] },
      { id: 'plonger', nom: 'Plonger au récif', min: 150, energie: 20, equip: ['combi_plongee'], risque: 0.05, rolls: 4,
        loot: [['corail', 4, 1, 2], ['perles', 1.5, 1, 1], ['poissons', 4, 1, 3], ['algues_marines', 4, 2, 3], ['gemmes', 0.1, 1, 1]] },
    ] },
  { id: 'puits', nom: 'Champ pétrolifère', emoji: '🛢️', kind: 'puits', desc: 'Pétrole et gaz dans les basses terres chaudes.', station: true,
    gather: [
      { id: 'forer', nom: 'Forer un puits', min: 240, energie: 18, tool: 'foreuse', equip: ['casque', 'tenue_securite'], permit: 'permis_extraction', risque: 0.06, rolls: 4,
        loot: [['petrole_brut', 8, 2, 5], ['gaz_naturel', 5, 2, 4], ['hydrocarbures', 3, 1, 3], ['soufre', 2, 1, 2], ['benzene', 1, 1, 1]] },
      { id: 'collecter', nom: 'Collecter les suintements', min: 120, energie: 10, equip: ['gants'], rolls: 2, loot: [['petrole_brut', 4, 1, 2], ['hydrocarbures', 2, 1, 1], ['soufre', 2, 1, 2]] },
    ] },
  { id: 'volcan', nom: 'Pic de Braise', emoji: '🌋', kind: 'volcan', desc: 'Le plus haut sommet, ancien volcan. Chaleur géothermique et cendres.', station: false,
    gather: [
      { id: 'cendres', nom: 'Récolter les cendres', min: 150, energie: 18, tool: 'pioche', equip: ['combi_thermique'], risque: 0.06, rolls: 4,
        loot: [['cendres_volcaniques', 8, 2, 4], ['soufre', 5, 2, 4], ['geothermie', 4, 1, 3], ['cristaux', 1, 1, 1], ['gemmes', 0.4, 1, 1], ['cendres_phoenix', 0.12, 1, 1]] },
    ] },
  { id: 'foret_ancienne', nom: 'Forêt ancienne', emoji: '🌳', kind: 'foret', desc: 'Forêt millénaire aux plantes rares.', station: false,
    gather: [
      { id: 'herboriser', nom: 'Herboriser', min: 150, energie: 12, tool: 'faucille', rolls: 4,
        loot: [['plantes_medicinales', 6, 1, 3], ['essence_plantes_rares', 1.2, 1, 1], ['larmes_foret', 0.4, 1, 1], ['soie', 1, 1, 2], ['insectes', 3, 1, 3], ['pollen', 3, 1, 3], ['miel', 2, 1, 2]] },
    ] },
  { id: 'cratere', nom: 'Cratère de l’Étoile', emoji: '🌠', kind: 'cratere', desc: 'Zone de haut niveau : il faut un pass. Matériaux venus des étoiles.', station: true, pass: 'haut_niveau',
    gather: [
      { id: 'fouiller', nom: 'Fouiller le cratère', min: 180, energie: 22, tool: 'pioche', equip: ['combi_antirad'], risque: 0.07, rad: true, rolls: 4,
        loot: [['poussiere_meteorite', 5, 1, 2], ['pierre_de_lune', 2, 1, 1], ['fragment_etoile', 0.6, 1, 1], ['radioactif', 2, 1, 1], ['cristaux', 3, 1, 2],
          ['terres_rares', 3, 1, 2], ['platine', 2, 1, 1], ['titane', 3, 1, 2]] },
    ] },
];

// ---------------- Véhicules ----------------
// speed : unités par minute de jeu · fuel : % consommé par 1 000 unités · wear : usure par 1 000 unités
export const VEHICLES = {
  marche: { nom: 'À pied', emoji: '🚶', speed: 6, prix: 0 },
  cheval: { nom: 'Cheval', emoji: '🐎', speed: 16, prix: 1500, loc: 60, needs: 'selle', fuel: 12, wear: 2, fuelNom: 'Avoine', refill: 'avoine', refillPct: 25, fuelPrix: 0.8 },
  voiture: { nom: 'Voiture', emoji: '🚗', speed: 38, prix: 6500, loc: 160, fuel: 6, wear: 3, fuelNom: 'Essence', refill: 'carburant', refillPct: 35, fuelPrix: 1.6, permis: 'permis_conduire' },
  drone: { nom: 'Drone personnel', emoji: '🛸', speed: 70, prix: 16000, loc: 320, fuel: 5, wear: 2.5, fuelNom: 'Électricité', refill: 'pile_solaire', refillPct: 40, fuelPrix: 1.2, permis: 'licence_drone', fly: true },
};

// ---------------- Logements ----------------
export const HOUSING = {
  location: { nom: 'Appartement en location', emoji: '🏢', caution: 200, loyer: 45, slots: 6, comfort: 12, bed: true },
  studio: { nom: 'Studio', emoji: '🏠', prix: 9000, slots: 6, comfort: 5 },
  maison: { nom: 'Maison familiale', emoji: '🏡', prix: 26000, slots: 12, comfort: 10, family: true },
  villa: { nom: 'Villa de la Haute-Ville', emoji: '🏰', prix: 72000, slots: 20, comfort: 25, family: true },
};

export const GUILDS = [
  { id: 'artisans', nom: 'Guilde des Artisans', emoji: '🔨', entree: 500, cotisation: 15, desc: '+1 objet sur chaque fabrication de 2 ou plus, −10 % sur les outils.' },
  { id: 'marchands', nom: 'Ligue des Marchands', emoji: '💰', entree: 600, cotisation: 18, desc: '+10 % sur toutes vos ventes de ressources.' },
  { id: 'explorateurs', nom: 'Ordre des Explorateurs', emoji: '🧭', entree: 550, cotisation: 15, desc: '+25 % de ressources récoltées, navettes −20 %.' },
  { id: 'soigneurs', nom: 'Cercle des Soigneurs', emoji: '⚕️', entree: 450, cotisation: 12, desc: 'Soins et médicaments −20 %.' },
];

// Entreprises de joueurs cotées en bourse
export const STOCKS = [
  { id: 'ASTR', nom: 'Astra Minerals', owner: 'Kael', prix: 42, vol: 0.06 },
  { id: 'NEON', nom: 'Néon Divertissement', owner: 'Suki', prix: 18, vol: 0.09 },
  { id: 'ORBT', nom: 'Orbite Restauration', owner: 'Elio', prix: 25, vol: 0.04 },
  { id: 'ZEPH', nom: 'Portails Zéphyr', owner: 'Kael', prix: 77, vol: 0.07 },
  { id: 'EGID', nom: 'Mutuelle Égide', owner: 'Noa', prix: 55, vol: 0.03 },
  { id: 'FORG', nom: 'Forges du Pic', owner: 'Dax', prix: 31, vol: 0.05 },
  { id: 'VERT', nom: 'VertGreen Agro', owner: 'Lin', prix: 12, vol: 0.08 },
  { id: 'QBIT', nom: 'Qubit Systèmes', owner: 'Ada', prix: 120, vol: 0.1 },
];

export const NAMES = ['Alix', 'Noé', 'Lou', 'Sacha', 'Eden', 'Maé', 'Rayan', 'Lina', 'Iris', 'Malo', 'Zoé', 'Nils', 'Jade', 'Elio', 'Léa', 'Timéo',
  'Ambre', 'Yanis', 'Nora', 'Axel', 'Mila', 'Oscar', 'Romy', 'Kenzo', 'Livia', 'Hugo', 'Anouk', 'Milan', 'Céleste', 'Gabin'];

// Une maison (ou un atelier, un immeuble) pour CHAQUE métier : c'est là qu'on trouve ceux qui l'exercent
// (aujourd'hui un habitant simulé, demain tous les joueurs qui ont choisi ce métier).
export const JOB_HOUSES = Object.values(JOBS).map((j) => ({
  id: `job:${j.id}`, jobHouse: j.id, nom: `${j.nom}`, emoji: SECTOR_BY_ID[j.sector].emoji,
  desc: `Quartier ${SECTOR_BY_ID[j.sector].nom.split(',')[0]} · la maison des ${j.nom.toLowerCase()}s`,
}));
