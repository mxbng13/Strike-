// Lieux de la capitale et sites de ressources sur la carte.
// spot : où placer le lieu (voir world.js) · shop : objets vendus · services : actions payantes
// special : écran particulier (marché des ressources, garage, gare, école…)
// Effets possibles : faim, soif, hygiene, energie, sante, moral (en points), min = durée en minutes de jeu

// « Joueurs » simulés qui tiennent des services (en attendant un vrai serveur multijoueur)
export const PROVIDERS = {
  medecin: [
    { nom: 'Dr Lyra Voss', mult: 1.4, note: 4.9 }, { nom: 'Dr Malik Oran', mult: 1.0, note: 4.4 }, { nom: 'Dr Inès Calder', mult: 0.75, note: 3.8 },
  ],
  teleport: [
    { nom: 'Portails Zéphyr (Kael)', mult: 1.25, note: 4.8 }, { nom: 'Saut-Éclair (Mira)', mult: 1.0, note: 4.3 }, { nom: 'TéléBudget (Rook)', mult: 0.7, note: 3.5, risque: 0.08 },
  ],
  formateur: [
    { nom: 'Académie Nexus (officielle)', mult: 1.0, note: 4.5 }, { nom: 'Prof. Selene Arkwright', mult: 0.85, note: 4.7 }, { nom: 'Cours Express (Dax)', mult: 0.65, note: 3.6, slow: 1.3 },
  ],
  assurance: [
    { nom: 'Mutuelle Égide (Noa)', prime: 22, couverture: 0.8, note: 4.6 }, { nom: 'Bouclier Santé (Tess)', prime: 12, couverture: 0.55, note: 4.1 },
    { nom: 'Assur’Mini (Bram)', prime: 6, couverture: 0.3, note: 3.4 },
  ],
  spectacle: [
    { nom: 'Troupe Aurore (Elio)', mult: 1.2, note: 4.8 }, { nom: 'Les Néons (Suki)', mult: 1.0, note: 4.4 }, { nom: 'Scène libre (amateurs)', mult: 0.5, note: 3.7 },
  ],
  coach: [{ nom: 'Coach Ryn Talos', mult: 1.3, note: 4.9 }, { nom: 'Coach Fae Morrow', mult: 1.0, note: 4.3 }],
  guide: [{ nom: 'Guide Orin (vétéran)', mult: 1.3, note: 4.9 }, { nom: 'Guide Pip (débutant)', mult: 0.8, note: 4.0 }],
};

export const PLACES = [
  // ---------------- 1. Besoins de base ----------------
  { id: 'marche', nom: 'Marché central', emoji: '🛒', spot: 'filler:0', desc: 'Nourriture et boissons de tous les jours.',
    shop: ['pain', 'sandwich', 'ration', 'avoine', 'eau', 'jus', 'cafe_tasse', 'boisson_energie', 'vitamines'] },
  { id: 'restaurant', nom: 'Restaurant Orbite', emoji: '🍽️', spot: 'filler:1', desc: 'Des repas chauds servis par des cuisiniers.',
    services: [
      { id: 'menu', nom: 'Menu du jour', prix: 22, min: 45, eff: { faim: 60, soif: 25, moral: 5 } },
      { id: 'gastro', nom: 'Repas gastronomique', prix: 70, min: 90, eff: { faim: 90, soif: 40, moral: 18 } },
    ] },
  { id: 'bains', nom: 'Bains publics', emoji: '🚿', spot: 'filler:2', desc: 'Douches publiques et soins.',
    shop: ['savon', 'brosse_dents'],
    services: [
      { id: 'douche', nom: 'Douche publique', prix: 5, min: 20, eff: { hygiene: 40 }, bonus: { item: 'savon', eff: { hygiene: 40, moral: 3 } } },
      { id: 'bain', nom: 'Bain chaud', prix: 18, min: 60, eff: { hygiene: 70, moral: 8, energie: 6 }, bonus: { item: 'savon', eff: { hygiene: 30 } } },
      { id: 'massage', nom: 'Massage bien-être', prix: 45, min: 60, eff: { moral: 15, energie: 10, sante: 4 } },
    ] },
  { id: 'coiffeur', nom: 'Salon de coiffure', emoji: '💈', spot: 'filler:3', desc: 'Coupe de cheveux et soins du visage.',
    services: [
      { id: 'coupe', nom: 'Coupe de cheveux', prix: 25, min: 40, eff: { hygiene: 15, moral: 10 } },
      { id: 'soin_visage', nom: 'Soin esthétique', prix: 40, min: 50, eff: { hygiene: 15, moral: 14 } },
    ] },
  { id: 'hotel', nom: 'Hôtel Nexus', emoji: '🏨', spot: 'filler:4', desc: 'Chambres pour la nuit ou à la semaine.',
    services: [
      { id: 'nuit', nom: 'Chambre pour la nuit (8 h)', prix: 60, min: 480, special: 'sleep', quality: 1.05 },
      { id: 'sieste', nom: 'Chambre pour une sieste (3 h)', prix: 25, min: 180, special: 'sleep', quality: 1.0 },
      { id: 'suite', nom: 'Suite de luxe (8 h)', prix: 180, min: 480, special: 'sleep', quality: 1.25, eff: { moral: 15 } },
    ] },
  { id: 'vetements', nom: 'Boutique de vêtements', emoji: '👕', spot: 'filler:5', desc: 'Vêtements adaptés au climat : froid, chaleur, pluie.',
    shop: ['manteau', 'tenue_legere', 'impermeable'] },

  // ---------------- 2. Métier ----------------
  { id: 'quincaillerie', nom: 'Quincaillerie & Outils', emoji: '🧰', spot: 'filler:6', desc: 'Outils, équipements de sécurité, réparations.',
    shop: ['pioche', 'hache', 'scie', 'marteau', 'faucille', 'canne_peche', 'gants', 'casque', 'tenue_securite', 'blouse', 'mallette',
      'kit_artiste', 'trousse_medicale', 'ordinateur_pro', 'combi_plongee', 'combi_thermique', 'combi_antirad', 'foreuse'],
    special: 'repair' },
  { id: 'comptoir', nom: 'Comptoir des ressources', emoji: '📦', spot: 'filler:7', desc: 'Achat et vente de toutes les matières premières. Les prix bougent chaque jour.',
    special: 'market' },
  { id: 'atelier', nom: 'Ateliers d’artisans', emoji: '🔨', spot: 'ring', desc: 'Fabriquer outils, meubles, vêtements et objets rares.', special: 'craft' },
  { id: 'usine', nom: 'Complexe industriel', emoji: '🏭', spot: 'core:silos', desc: 'Raffinerie, chimie et énergie.', special: 'craft' },
  { id: 'chantier', nom: 'Chantier du BTP', emoji: '🏗️', spot: 'ring', desc: 'Le chantier de la nouvelle aile de la ville.' },
  { id: 'technopole', nom: 'Technopole', emoji: '💻', spot: 'core:twins', desc: 'Bureaux de l’informatique et des télécoms.' },
  { id: 'labo', nom: 'Dôme de recherche', emoji: '🔬', spot: 'core:dome', desc: 'Laboratoires scientifiques.', special: 'craft' },
  { id: 'tribunal', nom: 'Palais de justice', emoji: '⚖️', spot: 'ring', desc: 'Avocats, juges et notaires y travaillent.' },
  { id: 'caserne', nom: 'Caserne de sécurité', emoji: '🚓', spot: 'ring', desc: 'Police, pompiers et défense.' },
  { id: 'emploi', nom: 'Agence pour l’emploi', emoji: '💼', spot: 'ring', desc: 'Petits boulots sans diplôme et liste des métiers.', special: 'jobs' },

  // ---------------- 3. Déplacements ----------------
  { id: 'garage', nom: 'Concession & Garage', emoji: '🚗', spot: 'filler:8', desc: 'Chevaux, voitures et drones à acheter ou louer. Carburant, recharge et entretien.',
    special: 'garage' },
  { id: 'gare', nom: 'Gare des navettes', emoji: '🚉', spot: 'core:pad', desc: 'Train et navettes vers les avant-postes de la carte.', special: 'transit' },
  { id: 'portail', nom: 'Portails de téléportation', emoji: '🌀', spot: 'core:spire', desc: 'Téléportation payante, gérée par des joueurs.', special: 'portal' },

  // ---------------- 4. Social ----------------
  { id: 'com', nom: 'Tour de communication', emoji: '📡', spot: 'ring', desc: 'Publicités et messages massifs payants.',
    services: [
      { id: 'pub', nom: 'Campagne de pub pour mon entreprise', prix: 300, min: 30, special: 'ad' },
      { id: 'massif', nom: 'Message massif « Je vends ! » (+15 % sur mes ventes, 1 jour)', prix: 120, min: 15, special: 'sellboost' },
      { id: 'annonce', nom: 'Petite annonce rencontre', prix: 60, min: 15, special: 'meet' },
    ] },
  { id: 'guilde', nom: 'Maison des guildes', emoji: '⚜️', spot: 'ring', desc: 'Entrer dans une guilde ou une ville privée.', special: 'guild' },
  { id: 'club', nom: 'Club Néon', emoji: '🍸', spot: 'ring', desc: 'Lieu exclusif : il faut un pass pour entrer.',
    services: [
      { id: 'pass_club', nom: 'Pass club (7 jours)', prix: 150, min: 5, special: 'pass', pass: 'club', days: 7 },
      { id: 'soiree', nom: 'Soirée au club', prix: 30, min: 180, eff: { moral: 30, energie: -12, soif: 10 }, needs: { pass: 'club' } },
      { id: 'rencontre', nom: 'Faire des rencontres', prix: 20, min: 120, special: 'meet', needs: { pass: 'club' } },
    ] },
  { id: 'musee', nom: 'Musée des Étoiles', emoji: '🖼️', spot: 'ring', desc: 'Collections et expositions.',
    services: [
      { id: 'visite', nom: 'Visite du musée', prix: 12, min: 90, eff: { moral: 12 } },
      { id: 'expo', nom: 'Exposition privée (pass musée)', prix: 0, min: 120, eff: { moral: 25 }, needs: { pass: 'musee' } },
      { id: 'pass_musee', nom: 'Pass musée (30 jours)', prix: 90, min: 5, special: 'pass', pass: 'musee', days: 30 },
    ] },

  // ---------------- 5. Confort ----------------
  { id: 'meubles', nom: 'Meubles & Déco', emoji: '🛋️', spot: 'filler:9', desc: 'Meubles, décoration, appareils, chauffage et climatisation.',
    shop: ['lit', 'canape', 'table', 'armoire', 'bureau_meuble', 'comptoir_meuble', 'tableau', 'plante', 'statue', 'tapis',
      'radio', 'cuisine', 'ordinateur', 'frigo', 'chauffage', 'climatiseur'] },
  { id: 'immobilier', nom: 'Agence immobilière', emoji: '🏠', spot: 'ring', desc: 'Louer un appartement ou acheter une maison.', special: 'realestate' },
  { id: 'residences', nom: 'Résidences', emoji: '🏘️', spot: 'core:homes', desc: 'Le quartier où se trouvent les logements.', special: 'home' },

  // ---------------- 6. Santé ----------------
  { id: 'hopital', nom: 'Hôpital', emoji: '🏥', spot: 'filler:10', desc: 'Soins complets. Public (lent, moins cher) ou privé (rapide).',
    services: [
      { id: 'hop_public', nom: 'Hospitalisation publique (soigne tout)', prix: 350, min: 600, special: 'hospital', health: true },
      { id: 'hop_prive', nom: 'Clinique privée (soigne tout, rapide)', prix: 1100, min: 120, special: 'hospital', health: true },
      { id: 'urgences', nom: 'Urgences (blessure)', prix: 140, min: 180, cure: 'blessure', eff: { sante: 20 }, health: true },
    ] },
  { id: 'cabinet', nom: 'Cabinet médical', emoji: '🩺', spot: 'ring', desc: 'Des médecins (joueurs) soignent blessures et maladies.',
    services: [
      { id: 'consult', nom: 'Consultation', prix: 50, min: 40, special: 'consult', prov: 'medecin', health: true },
      { id: 'psy', nom: 'Séance chez le psychologue', prix: 70, min: 60, eff: { moral: 25 }, prov: 'medecin', health: true },
      { id: 'dentiste', nom: 'Dentiste', prix: 90, min: 45, eff: { sante: 8, hygiene: 10 }, prov: 'medecin', health: true },
      { id: 'kine', nom: 'Kinésithérapeute', prix: 60, min: 60, eff: { sante: 12, energie: 10 }, prov: 'medecin', health: true },
    ] },
  { id: 'pharmacie', nom: 'Pharmacie', emoji: '💊', spot: 'filler:11', desc: 'Médicaments vendus par des pharmaciens.',
    shop: ['bandage', 'antidouleur', 'antibiotique', 'kit_soins', 'iode', 'vitamines'] },
  { id: 'assurance', nom: 'Mutuelles santé', emoji: '🛡️', spot: 'ring', desc: 'Assurances créées par des joueurs : une prime par jour, des soins remboursés.',
    special: 'insurance' },

  // ---------------- 7. Loisirs ----------------
  { id: 'loisirs', nom: 'Quartier des spectacles', emoji: '🎭', spot: 'ring', desc: 'Cinéma, concerts et théâtre créés par des joueurs.',
    services: [
      { id: 'cinema', nom: 'Séance de cinéma', prix: 15, min: 120, eff: { moral: 15 }, prov: 'spectacle' },
      { id: 'concert', nom: 'Concert', prix: 40, min: 180, eff: { moral: 26, energie: -6 }, prov: 'spectacle' },
      { id: 'theatre', nom: 'Pièce de théâtre', prix: 30, min: 150, eff: { moral: 22 }, prov: 'spectacle' },
    ] },
  { id: 'arene', nom: 'Arène & Sports', emoji: '🏟️', spot: 'ring', desc: 'Sport, coachs et défis de l’arène.',
    shop: ['equip_sport'],
    services: [
      { id: 'sport', nom: 'Séance de sport', prix: 5, min: 120, eff: { moral: 10, sante: 5, energie: -15, soif: -15 }, needs: { item: 'equip_sport' }, buff: { forme: 24 } },
      { id: 'coach', nom: 'Séance avec un coach', prix: 60, min: 120, eff: { moral: 15, sante: 10, energie: -12, soif: -15 }, needs: { item: 'equip_sport' }, prov: 'coach', buff: { forme: 48 } },
      { id: 'defi', nom: 'Défi de l’arène (mini-jeu, 20 ₵)', prix: 20, min: 30, special: 'minigame' },
    ] },
  { id: 'tourisme', nom: 'Office de tourisme', emoji: '🧭', spot: 'ring', desc: 'Voyages guidés vers les merveilles de la carte.', special: 'tourism' },

  // ---------------- 8. Progression ----------------
  { id: 'ecole', nom: 'Académie des métiers', emoji: '🎓', spot: 'ring', desc: 'Formations, permis, livres et stages.', special: 'school',
    shop: ['manuel', 'encyclopedie'] },

  // ---------------- 9. Famille ----------------
  { id: 'evenements', nom: 'Salle des fêtes', emoji: '💍', spot: 'ring', desc: 'Mariages, fêtes, rencontres.', special: 'events' },
  { id: 'famille', nom: 'Maison de la famille', emoji: '👶', spot: 'ring', desc: 'Adopter et élever un enfant.', special: 'family' },
  { id: 'cadeaux', nom: 'Boutique de cadeaux', emoji: '🎁', spot: 'ring', desc: 'Cadeaux et objets sentimentaux.',
    shop: ['bouquet', 'chocolats', 'peluche', 'parfum', 'medaillon'] },

  // ---------------- 10. Économie ----------------
  { id: 'mairie', nom: 'Hôtel de ville', emoji: '🏛️', spot: 'core:command', desc: 'Créer une entreprise, licences, zones réservées.', special: 'cityhall' },
  { id: 'banque', nom: 'Banque & Bourse', emoji: '📈', spot: 'core:spire2', desc: 'Actions d’entreprises de joueurs et placements.', special: 'bank' },
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
    ] },
  { id: 'mine', nom: 'Mine du Pic Gris', emoji: '⛏️', kind: 'mine', desc: 'Filons de métaux dans la montagne. Il y fait froid.', station: true,
    gather: [
      { id: 'carriere', nom: 'Extraire de la pierre', min: 120, energie: 14, tool: 'pioche', equip: ['gants'], risque: 0.04, rolls: 4,
        loot: [['pierre', 8, 3, 6], ['carbonate_calcium', 3, 1, 3], ['calcium', 2, 1, 2], ['soufre', 1, 1, 2], ['silicium', 1, 1, 2], ['fossiles', 0.25, 1, 1]] },
      { id: 'miner', nom: 'Miner les filons', min: 180, energie: 20, tool: 'pioche', equip: ['casque', 'gants'], risque: 0.08, rolls: 5,
        loot: [['fer', 10, 2, 5], ['cuivre', 7, 1, 4], ['charbon', 7, 2, 5], ['plomb', 4, 1, 3], ['zinc', 4, 1, 3], ['bauxite', 5, 2, 4], ['manganese', 3, 1, 2],
          ['nickel', 3, 1, 2], ['cobalt', 2, 1, 2], ['argent', 2, 1, 2], ['lithium', 2, 1, 2], ['mercure', 1, 1, 1], ['or', 1, 1, 1], ['titane', 0.8, 1, 1],
          ['beryllium', 0.6, 1, 1], ['platine', 0.3, 1, 1], ['diamant', 0.15, 1, 1], ['gemmes', 0.25, 1, 1], ['cristaux', 0.4, 1, 1], ['terres_rares', 0.4, 1, 1]] },
      { id: 'uranium', nom: 'Galerie radioactive (uranium)', min: 180, energie: 22, tool: 'pioche', equip: ['combi_antirad', 'casque'], permit: 'certif_nucleaire', risque: 0.05, rad: true, rolls: 3,
        loot: [['uranium', 4, 1, 2], ['radioactif', 2, 1, 1], ['terres_rares', 2, 1, 2], ['plomb', 3, 1, 3]] },
    ] },
  { id: 'port', nom: 'Port des Brumes', emoji: '⚓', kind: 'port', desc: 'Pêche, plongée et sel de mer.', station: true,
    gather: [
      { id: 'pecher', nom: 'Pêcher', min: 150, energie: 10, tool: 'canne_peche', rolls: 4, loot: [['poissons', 8, 1, 3], ['algues_marines', 3, 1, 3], ['algues', 2, 1, 2]] },
      { id: 'sel', nom: 'Récolter le sel et les algues', min: 120, energie: 12, rolls: 4, loot: [['sodium', 5, 2, 4], ['chlore', 2, 1, 2], ['algues', 4, 2, 4], ['algues_marines', 3, 1, 3]] },
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

// ---------------- Recettes de fabrication ----------------
// place : lieu où fabriquer · job / sector : métier ou secteur obligatoire (sinon tout le monde)
export const RECIPES = [
  // Atelier : outils et objets du quotidien
  { place: 'atelier', out: ['pioche', 1], in: { fer: 3, bois: 2 }, min: 60 },
  { place: 'atelier', out: ['hache', 1], in: { fer: 2, bois: 2 }, min: 60 },
  { place: 'atelier', out: ['scie', 1], in: { fer: 2, bois: 1 }, min: 60 },
  { place: 'atelier', out: ['marteau', 1], in: { fer: 1, bois: 1 }, min: 40 },
  { place: 'atelier', out: ['faucille', 1], in: { fer: 1, bois: 1 }, min: 40 },
  { place: 'atelier', out: ['canne_peche', 1], in: { bois: 2, fibres_vegetales: 3 }, min: 40 },
  { place: 'atelier', out: ['gants', 1], in: { cuir: 1 }, min: 30 },
  { place: 'atelier', out: ['manteau', 1], in: { laine: 4, cuir: 1 }, min: 90 },
  { place: 'atelier', out: ['tenue_legere', 1], in: { fibres_vegetales: 4 }, min: 60 },
  { place: 'atelier', out: ['impermeable', 1], in: { plastique: 3, fibres_vegetales: 2 }, min: 60 },
  { place: 'atelier', out: ['lit', 1], in: { bois: 8, laine: 3 }, min: 120 },
  { place: 'atelier', out: ['table', 1], in: { bois: 6 }, min: 90 },
  { place: 'atelier', out: ['armoire', 1], in: { bois: 8, fer: 1 }, min: 90 },
  { place: 'atelier', out: ['savon', 3], in: { cendres_bois: 2, sodium: 1 }, min: 30 },
  { place: 'atelier', out: ['bandage', 2], in: { fibres_vegetales: 2 }, min: 20 },
  // Métiers d'art (fabrication avancée)
  { place: 'atelier', out: ['bijou', 1], in: { or: 2, gemmes: 1 }, min: 120, job: 'artisanat.bijoutier' },
  { place: 'atelier', out: ['amulette_lune', 1], in: { argent: 2, pierre_de_lune: 1 }, min: 150, job: 'artisanat.bijoutier' },
  { place: 'atelier', out: ['vase_ceramique', 1], in: { pierre: 3, calcium: 1 }, min: 90, job: 'artisanat.ceramiste' },
  { place: 'atelier', out: ['meuble_luxe', 1], in: { bois: 12, cuivre: 1 }, min: 180, job: 'artisanat.ebeniste' },
  { place: 'atelier', out: ['montre', 1], in: { argent: 1, cuivre: 2, cristaux: 1 }, min: 180, job: 'artisanat.horloger' },
  { place: 'atelier', out: ['violon', 1], in: { bois: 6, fibres_vegetales: 2 }, min: 240, job: 'artisanat.luthier' },
  { place: 'atelier', out: ['sac_cuir', 1], in: { cuir: 3 }, min: 120, job: 'artisanat.maroquinier' },
  { place: 'atelier', out: ['vitrail', 1], in: { silicium: 3, plomb: 1, cobalt: 1 }, min: 150, job: 'artisanat.verrier' },
  { place: 'atelier', out: ['foreuse', 1], in: { fer: 12, titane: 1, cuivre: 3 }, min: 240, job: 'artisanat.forgeron' },
  { place: 'atelier', out: ['armure_celeste', 1], in: { fragment_etoile: 1, titane: 4, cristaux: 2 }, min: 360, job: 'artisanat.forgeron' },
  // Usine : raffinerie, chimie, énergie
  { place: 'usine', out: ['carburant', 3], in: { petrole_brut: 2 }, min: 60 },
  { place: 'usine', out: ['plastique', 3], in: { petrole_brut: 1, hydrocarbures: 1 }, min: 60 },
  { place: 'usine', out: ['aluminium', 1], in: { bauxite: 3, charbon: 1 }, min: 60 },
  { place: 'usine', out: ['air_comprime', 4], in: { charbon: 1 }, min: 30 },
  { place: 'usine', out: ['acide_sulfurique', 2], in: { soufre: 2 }, min: 45, sector: 'industrie' },
  { place: 'usine', out: ['ammoniac', 2], in: { gaz_naturel: 1 }, min: 45, sector: 'industrie' },
  { place: 'usine', out: ['engrais', 4], in: { ammoniac: 1, phosphore: 1 }, min: 45 },
  { place: 'usine', out: ['engrais', 2], in: { biomasse: 3 }, min: 30 },
  { place: 'usine', out: ['pesticides', 2], in: { benzene: 1, chlore: 1 }, min: 45, sector: 'industrie' },
  { place: 'usine', out: ['phosphore', 1], in: { calcium: 2, charbon: 1 }, min: 45 },
  { place: 'usine', out: ['hydrogene', 2], in: { gaz_naturel: 1, air_comprime: 1 }, min: 60 },
  { place: 'usine', out: ['pile_solaire', 1], in: { silicium: 2, lithium: 1 }, min: 90 },
  { place: 'usine', out: ['panneau_solaire', 1], in: { silicium: 4, aluminium: 2, terres_rares: 1 }, min: 150 },
  { place: 'usine', out: ['composant_eolien', 1], in: { fer: 6, cuivre: 3, terres_rares: 1 }, min: 150 },
  { place: 'usine', out: ['pile_nucleaire', 1], in: { uranium: 2, plomb: 4, titane: 1 }, min: 240, sector: 'industrie' },
  // Laboratoire : chimie fine, santé, haute technologie
  { place: 'labo', out: ['solvants', 2], in: { hydrocarbures: 1, chlore: 1 }, min: 45, job: 'industrie.chimiste' },
  { place: 'labo', out: ['benzene', 1], in: { petrole_brut: 2 }, min: 60, job: 'industrie.chimiste' },
  { place: 'labo', out: ['silicium', 2], in: { pierre: 4, charbon: 1 }, min: 60 },
  { place: 'labo', out: ['antibiotique', 2], in: { plantes_medicinales: 2, solvants: 1 }, min: 60, job: 'sante.pharmacien' },
  { place: 'labo', out: ['kit_soins', 1], in: { plantes_medicinales: 2, fibres_vegetales: 2 }, min: 45, sector: 'sante' },
  { place: 'labo', out: ['iode', 1], in: { algues_marines: 4, sodium: 1 }, min: 60, job: 'sante.pharmacien' },
  { place: 'labo', out: ['potion_phenix', 1], in: { cendres_phoenix: 1, larmes_foret: 1, essence_plantes_rares: 1 }, min: 240 },
  { place: 'labo', out: ['plasma', 1], in: { hydrogene: 4, cristaux: 2, poussiere_meteorite: 1 }, min: 240, sector: 'sciences' },
  { place: 'labo', out: ['reacteur_plasma', 1], in: { plasma: 2, titane: 6, fragment_etoile: 1, pile_nucleaire: 1 }, min: 480, sector: 'sciences' },
  // Cuisine (maison équipée)
  { place: 'home', out: ['repas_maison', 2], in: { fruits_legumes: 3 }, min: 40, needs: 'cuisine' },
  { place: 'home', out: ['festin', 1], in: { poissons: 2, fruits_legumes: 2, algues: 1 }, min: 60, needs: 'cuisine' },
  { place: 'home', out: ['jus', 2], in: { fruits_legumes: 2 }, min: 15, needs: 'cuisine' },
  { place: 'home', out: ['cafe_tasse', 3], in: { cafe: 1 }, min: 10, needs: 'cuisine' },
];

// ---------------- Véhicules ----------------
// speed : unités par minute de jeu · fuel : % consommé par 1 000 unités · wear : usure par 1 000 unités
export const VEHICLES = {
  marche: { nom: 'À pied', emoji: '🚶', speed: 6, prix: 0 },
  cheval: { nom: 'Cheval', emoji: '🐎', speed: 16, prix: 1500, loc: 60, fuel: 12, wear: 2, fuelNom: 'Avoine', refill: 'avoine', refillPct: 25, fuelPrix: 0.8 },
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
