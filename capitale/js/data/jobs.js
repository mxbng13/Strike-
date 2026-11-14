// Les métiers, regroupés par secteur.
// Chaque secteur donne des valeurs par défaut (lieu de travail, coût de la formation, salaire par service de 4 h,
// outils et équipements nécessaires, risque d'accident). Un métier peut les remplacer.
// prod : ressources gagnées à chaque service · conso : ressources consommées · permis : document obligatoire

const SECTORS_RAW = [
  { id: 'agri', nom: 'Agriculture, Agroalimentaire et Environnement', emoji: '🌾', place: 'ferme',
    formation: 500, heures: 8, salaire: 55, outils: ['faucille'], equip: ['gants'], risque: 0.03, jobs: [
      ['Agriculteur', { prod: { fruits_legumes: 6, graines: 2, biomasse: 2 }, conso: { graines: 1 }, bonus: { engrais: 0.5 } }],
      ['Éleveur', { prod: { cuir: 1, laine: 3, peaux: 1 }, outils: [] }],
      ['Apiculteur', { prod: { miel: 3, pollen: 3 }, outils: [] }],
      ['Pépiniériste', { prod: { graines: 5, plantes_medicinales: 1 } }],
      ['Maraîcher', { prod: { fruits_legumes: 8, cafe: 1 }, bonus: { engrais: 0.5 } }],
      ['Horticulteur', { prod: { plantes_medicinales: 2, pollen: 2, fibres_vegetales: 2 } }],
      ['Bûcheron', { place: 'foret', outils: ['hache'], equip: ['casque'], prod: { bois: 10, cendres_bois: 1 }, risque: 0.07 }],
      ['Ingénieur agronome', { place: 'labo', salaire: 150, formation: 3500, heures: 24, outils: ['ordinateur_pro'], equip: [], prod: { engrais: 3 } }],
      ['Technicien en environnement', { salaire: 95, formation: 1500, heures: 16, prod: { algues: 2 } }],
    ] },
  { id: 'artisanat', nom: 'Artisanat et Métiers d’Art', emoji: '🔨', place: 'atelier',
    formation: 900, heures: 12, salaire: 80, outils: ['marteau'], equip: ['gants'], risque: 0.04, jobs: [
      ['Bijoutier', { salaire: 120, craft: true }], ['Céramiste', { craft: true }], ['Ébéniste', { outils: ['scie'], craft: true }],
      ['Horloger', { salaire: 115, craft: true }], ['Luthier', { outils: ['scie'], craft: true }], ['Maroquinier', { craft: true }],
      ['Tapissier', {}], ['Verrier', { craft: true, risque: 0.06 }], ['Forgeron', { craft: true, risque: 0.08, equip: ['gants', 'tenue_securite'] }],
    ] },
  { id: 'btp', nom: 'Bâtiment et Travaux Publics (BTP)', emoji: '🏗️', place: 'chantier',
    formation: 800, heures: 10, salaire: 85, outils: ['marteau'], equip: ['casque', 'tenue_securite'], risque: 0.07, jobs: [
      ['Architecte', { salaire: 170, formation: 5000, heures: 30, outils: ['ordinateur_pro'], equip: [], risque: 0.01 }],
      ['Maçon', { conso: { pierre: 2 } }], ['Plombier', { salaire: 95 }], ['Électricien', { salaire: 100, risque: 0.08 }],
      ['Charpentier', { outils: ['scie'] }], ['Peintre en bâtiment', { outils: [] }],
      ['Conducteur de travaux', { salaire: 140, formation: 2500, heures: 20, outils: [] }],
      ['Géomètre', { salaire: 120, formation: 2000, heures: 16, outils: ['ordinateur_pro'], equip: [], risque: 0.02 }],
      ['Ingénieur en génie civil', { salaire: 165, formation: 4500, heures: 28, outils: ['ordinateur_pro'], risque: 0.02 }],
    ] },
  { id: 'commerce', nom: 'Commerce et Vente', emoji: '🛍️', place: 'marche',
    formation: 400, heures: 6, salaire: 60, outils: [], equip: [], risque: 0.005, jobs: [
      ['Vendeur', {}], ['Responsable de magasin', { salaire: 110, formation: 1500, heures: 12 }], ['Commercial', { salaire: 95, outils: ['mallette'] }],
      ['Acheteur', { salaire: 100, place: 'comptoir' }], ['Chef de produit', { salaire: 130, formation: 2500, heures: 16, outils: ['ordinateur_pro'] }],
      ['Marchandiseur', {}], ['Télévendeur', { salaire: 50 }], ['Représentant', { salaire: 90, outils: ['mallette'] }],
      ['Négociateur', { salaire: 120, place: 'comptoir', formation: 1800, heures: 12 }],
    ] },
  { id: 'com', nom: 'Communication, Médias et Multimédia', emoji: '📡', place: 'com',
    formation: 1200, heures: 12, salaire: 90, outils: ['ordinateur_pro'], equip: [], risque: 0.005, jobs: [
      ['Journaliste', {}], ['Photographe', { outils: ['kit_artiste'] }], ['Réalisateur', { salaire: 140, formation: 3000, heures: 20 }],
      ['Graphiste', {}], ['Community manager', { salaire: 80 }], ['Rédacteur web', { salaire: 75 }], ['Illustrateur', { outils: ['kit_artiste'] }],
      ['Chargé de communication', { salaire: 100 }], ['Designer UX/UI', { salaire: 125, formation: 2200, heures: 16 }],
    ] },
  { id: 'info', nom: 'Informatique et Télécommunications', emoji: '💻', place: 'technopole',
    formation: 2500, heures: 20, salaire: 140, outils: ['ordinateur_pro'], equip: [], risque: 0.002, jobs: [
      ['Développeur logiciel', {}], ['Administrateur réseau', { salaire: 130 }], ['Ingénieur en cybersécurité', { salaire: 175, formation: 4500, heures: 28 }],
      ['Technicien support', { salaire: 90, formation: 1200, heures: 10 }], ['Data scientist', { salaire: 170, formation: 4500, heures: 28 }],
      ['Chef de projet IT', { salaire: 165, formation: 4000, heures: 24 }], ['Analyste en systèmes d’information', { salaire: 145 }],
      ['Intégrateur web', { salaire: 110, formation: 1500, heures: 12 }], ['Architecte cloud', { salaire: 190, formation: 6000, heures: 32 }],
    ] },
  { id: 'sante', nom: 'Santé et Action Sociale', emoji: '🩺', place: 'hopital',
    formation: 3000, heures: 24, salaire: 130, outils: ['trousse_medicale'], equip: ['blouse'], risque: 0.01, jobs: [
      ['Médecin', { place: 'cabinet', salaire: 230, formation: 9000, heures: 48, healer: true }], ['Infirmier', { salaire: 110 }],
      ['Pharmacien', { place: 'pharmacie', salaire: 170, formation: 6000, heures: 36, craft: true, outils: [] }],
      ['Dentiste', { place: 'cabinet', salaire: 200, formation: 8000, heures: 40 }], ['Psychologue', { place: 'cabinet', salaire: 150, outils: [] }],
      ['Assistant social', { place: 'mairie', salaire: 90, formation: 1500, heures: 12, outils: [], equip: [] }],
      ['Kinésithérapeute', { place: 'cabinet', salaire: 140 }], ['Orthophoniste', { place: 'cabinet', salaire: 125, outils: [] }],
      ['Aide-soignant', { salaire: 80, formation: 900, heures: 8 }],
    ] },
  { id: 'education', nom: 'Éducation et Formation', emoji: '🎓', place: 'ecole',
    formation: 2000, heures: 18, salaire: 95, outils: ['mallette'], equip: [], risque: 0.002, jobs: [
      ['Professeur des écoles', {}], ['Enseignant en collège/lycée', { salaire: 105 }], ['Formateur professionnel', { salaire: 120, trainer: true }],
      ['Conseiller d’orientation', {}], ['Éducateur spécialisé', { salaire: 90 }], ['Surveillant scolaire', { salaire: 55, formation: 300, heures: 4, outils: [] }],
      ['Maître de conférences', { salaire: 160, formation: 6000, heures: 36 }], ['Animateur périscolaire', { salaire: 55, formation: 300, heures: 4, outils: [] }],
      ['Chercheur en éducation', { place: 'labo', salaire: 140, formation: 4500, heures: 28 }],
    ] },
  { id: 'transport', nom: 'Transport et Logistique', emoji: '🚚', place: 'gare',
    formation: 900, heures: 10, salaire: 85, outils: [], equip: [], risque: 0.02, jobs: [
      ['Chauffeur routier', { permis: 'permis_conduire' }], ['Pilote de ligne', { salaire: 220, formation: 9000, heures: 48, permis: 'licence_vol' }],
      ['Conducteur de train', { salaire: 120, formation: 2500, heures: 16 }], ['Logisticien', { salaire: 95, place: 'usine' }],
      ['Magasinier', { salaire: 60, place: 'comptoir', equip: ['gants'], formation: 300, heures: 4 }], ['Agent de transit', { salaire: 90, place: 'port' }],
      ['Affréteur', { salaire: 100, place: 'port' }], ['Contrôleur aérien', { salaire: 190, formation: 7000, heures: 40 }],
      ['Capitaine de navire', { place: 'port', salaire: 180, formation: 6000, heures: 36, permis: 'permis_bateau', prod: { poissons: 4 } }],
    ] },
  { id: 'hotellerie', nom: 'Hôtellerie, Restauration et Tourisme', emoji: '🍽️', place: 'restaurant',
    formation: 500, heures: 6, salaire: 60, outils: [], equip: [], risque: 0.02, jobs: [
      ['Chef cuisinier', { salaire: 120, formation: 2000, heures: 16, craft: true }], ['Serveur', { salaire: 50 }], ['Réceptionniste', { place: 'hotel' }],
      ['Gouvernante', { place: 'hotel', salaire: 65 }], ['Guide touristique', { place: 'tourisme', salaire: 80, guide: true }],
      ['Sommelier', { salaire: 100, formation: 1500, heures: 12 }], ['Barman', { place: 'club', salaire: 65 }],
      ['Agent de voyage', { place: 'tourisme', salaire: 80 }], ['Concierge', { place: 'hotel', salaire: 75 }],
    ] },
  { id: 'industrie', nom: 'Industrie et Production', emoji: '🏭', place: 'usine',
    formation: 900, heures: 10, salaire: 85, outils: [], equip: ['casque', 'gants'], risque: 0.05, jobs: [
      ['Opérateur de production', { prod: { plastique: 2 } }], ['Technicien de maintenance', { outils: ['marteau'], salaire: 95 }],
      ['Ingénieur en production', { salaire: 165, formation: 4500, heures: 28, outils: ['ordinateur_pro'] }],
      ['Soudeur', { salaire: 100, equip: ['casque', 'gants', 'tenue_securite'], risque: 0.08 }], ['Conducteur de ligne', { salaire: 90 }],
      ['Responsable qualité', { salaire: 130, formation: 2500, heures: 16, risque: 0.01 }],
      ['Chimiste', { place: 'labo', salaire: 150, formation: 4000, heures: 24, craft: true, prod: { solvants: 1 } }],
      ['Métallurgiste', { salaire: 120, formation: 2000, heures: 14, prod: { aluminium: 1 }, conso: { bauxite: 2 } }],
      ['Responsable d’atelier', { salaire: 140, formation: 3000, heures: 18 }],
    ] },
  { id: 'sciences', nom: 'Sciences et Recherche', emoji: '🔬', place: 'labo',
    formation: 4000, heures: 28, salaire: 150, outils: ['ordinateur_pro'], equip: ['blouse'], risque: 0.01, jobs: [
      ['Chercheur', {}], ['Technicien de laboratoire', { salaire: 95, formation: 1500, heures: 12 }], ['Ingénieur de recherche', { salaire: 175 }],
      ['Mathématicien', { equip: [] }], ['Physicien', { salaire: 165 }], ['Biologiste', { prod: { plantes_medicinales: 1 } }],
      ['Géologue', { place: 'mine', outils: ['pioche'], equip: ['casque'], risque: 0.04, prod: { fossiles: 0.3, cristaux: 0.2 }, gatherBonus: 'mine' }],
      ['Astronome', { prod: { poussiere_meteorite: 0.05 } }], ['Océanographe', { place: 'port', equip: [], prod: { algues_marines: 3, corail: 0.3 }, gatherBonus: 'port' }],
    ] },
  { id: 'droit', nom: 'Droit et Justice', emoji: '⚖️', place: 'tribunal',
    formation: 5000, heures: 32, salaire: 170, outils: ['mallette'], equip: [], risque: 0.003, jobs: [
      ['Avocat', {}], ['Juge', { salaire: 230, formation: 9000, heures: 48 }], ['Notaire', { salaire: 210, place: 'mairie', formation: 7000, heures: 40 }],
      ['Huissier de justice', { salaire: 150 }], ['Greffier', { salaire: 100, formation: 2000, heures: 14 }], ['Juriste', { salaire: 140 }],
      ['Procureur', { salaire: 220, formation: 9000, heures: 48 }], ['Médiateur', { salaire: 120, formation: 2500, heures: 16 }],
      ['Clerc de notaire', { salaire: 95, place: 'mairie', formation: 1500, heures: 12 }],
    ] },
  { id: 'securite', nom: 'Sécurité et Défense', emoji: '🛡️', place: 'caserne',
    formation: 1200, heures: 14, salaire: 100, outils: [], equip: ['tenue_securite'], risque: 0.06, jobs: [
      ['Policier', {}], ['Gendarme', {}], ['Militaire', { salaire: 110, risque: 0.09 }], ['Pompier', { salaire: 105, equip: ['tenue_securite', 'casque'], risque: 0.09 }],
      ['Agent de sécurité', { salaire: 65, formation: 400, heures: 4, place: 'banque' }], ['Douanier', { salaire: 105, place: 'port' }],
      ['Gardien de prison', { salaire: 90 }], ['Officier de renseignement', { salaire: 170, formation: 5000, heures: 30, risque: 0.02 }],
      ['Secouriste', { place: 'hopital', salaire: 80, formation: 600, heures: 6, healer: true }],
    ] },
  { id: 'sport', nom: 'Sport et Loisirs', emoji: '🏟️', place: 'arene',
    formation: 800, heures: 10, salaire: 75, outils: ['equip_sport'], equip: [], risque: 0.04, jobs: [
      ['Entraîneur sportif', { salaire: 95 }], ['Animateur socioculturel', { place: 'loisirs', outils: [], salaire: 60 }], ['Coach personnel', { salaire: 100, coach: true }],
      ['Guide de haute montagne', { place: 'mine', salaire: 120, equip: ['manteau'], risque: 0.07, guide: true }],
      ['Moniteur de ski', { place: 'mine', salaire: 90, equip: ['manteau'] }], ['Professeur de danse', { place: 'loisirs', salaire: 80 }],
      ['Éducateur sportif', {}], ['Directeur de centre de loisirs', { place: 'loisirs', salaire: 140, formation: 2500, heures: 16, outils: [] }],
      ['Arbitre', { salaire: 70 }],
    ] },
  { id: 'admin', nom: 'Administration et Gestion', emoji: '🗂️', place: 'mairie',
    formation: 1000, heures: 10, salaire: 85, outils: ['ordinateur_pro'], equip: [], risque: 0.002, jobs: [
      ['Secrétaire', { salaire: 65, formation: 500, heures: 6 }], ['Assistant de direction', {}], ['Comptable', { salaire: 110 }],
      ['Ressources humaines', { salaire: 105 }], ['Contrôleur de gestion', { salaire: 135, formation: 2500, heures: 16 }],
      ['Directeur administratif et financier', { salaire: 200, formation: 7000, heures: 40 }], ['Gestionnaire de paie', { salaire: 95 }],
      ['Office manager', { salaire: 95 }], ['Auditeur', { salaire: 150, formation: 3500, heures: 22 }],
    ] },
  { id: 'finance', nom: 'Finance et Assurance', emoji: '💰', place: 'banque',
    formation: 3500, heures: 24, salaire: 150, outils: ['ordinateur_pro'], equip: [], risque: 0.002, jobs: [
      ['Banquier', {}], ['Conseiller financier', { salaire: 130 }], ['Actuaire', { salaire: 175, formation: 5500, heures: 32 }],
      ['Courtier en assurances', { place: 'assurance', salaire: 130 }], ['Analyste financier', { salaire: 165 }],
      ['Trader', { salaire: 120, trader: true }], ['Gestionnaire de patrimoine', { salaire: 170 }],
      ['Inspecteur des finances', { salaire: 190, formation: 7000, heures: 40, place: 'mairie' }], ['Comptable', { salaire: 115 }],
    ] },
  { id: 'arts', nom: 'Arts et Culture', emoji: '🎭', place: 'loisirs',
    formation: 1000, heures: 12, salaire: 70, outils: [], equip: [], risque: 0.01, jobs: [
      ['Musicien', {}], ['Acteur', {}], ['Danseur', { risque: 0.03 }], ['Écrivain', { place: 'residences', outils: ['ordinateur_pro'] }],
      ['Conservateur de musée', { place: 'musee', salaire: 120, formation: 3000, heures: 20 }],
      ['Restaurateur d’œuvres d’art', { place: 'musee', salaire: 110, outils: ['kit_artiste'] }], ['Scénariste', { outils: ['ordinateur_pro'], salaire: 90 }],
      ['Producteur', { salaire: 160, formation: 3500, heures: 20 }], ['Directeur artistique', { salaire: 150, formation: 3000, heures: 18 }],
    ] },
  { id: 'services', nom: 'Services à la Personne', emoji: '💈', place: 'coiffeur',
    formation: 500, heures: 6, salaire: 60, outils: [], equip: [], risque: 0.01, jobs: [
      ['Coiffeur', {}], ['Esthéticienne', {}], ['Aide à domicile', { place: 'residences' }], ['Nounou', { place: 'famille' }],
      ['Auxiliaire de vie', { place: 'residences', salaire: 70 }], ['Conseiller en image', { place: 'vetements', salaire: 85 }],
      ['Masseur bien-être', { place: 'bains', salaire: 75 }], ['Wedding planner', { place: 'evenements', salaire: 100, formation: 1500, heures: 10 }],
      ['Chauffeur privé', { place: 'garage', salaire: 80, permis: 'permis_conduire' }],
    ] },
];

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export const SECTORS = [];
export const JOBS = {};
for (const s of SECTORS_RAW) {
  const { jobs, ...base } = s;
  const sector = { ...base, jobIds: [] };
  for (const [nom, o] of jobs) {
    const id = `${s.id}.${slug(nom)}`;
    JOBS[id] = { id, nom, sector: s.id, place: base.place, formation: base.formation, heures: base.heures, salaire: base.salaire,
      outils: base.outils, equip: base.equip, risque: base.risque, ...o };
    sector.jobIds.push(id);
  }
  SECTORS.push(sector);
}
export const SECTOR_BY_ID = Object.fromEntries(SECTORS.map((s) => [s.id, s]));

// Petit boulot accessible sans diplôme
export const ODD_JOB = { id: 'petit_boulot', nom: 'Petits boulots (manutention)', sector: null, place: 'emploi', salaire: 32,
  outils: [], equip: [], risque: 0.02 };

// Niveau dans un métier selon le nombre de services effectués
export const LEVELS = [0, 3, 7, 12, 18, 25, 33, 42, 52, 63];
export const levelOf = (xp) => { let l = 1; for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i]) l = i + 1; return l; };

// Permis et certificats, vendus par des formateurs
export const PERMITS = {
  permis_conduire: { nom: 'Permis de conduire', emoji: '🚗', prix: 900, heures: 10 },
  licence_drone: { nom: 'Licence de pilote de drone', emoji: '🛸', prix: 1800, heures: 14 },
  licence_vol: { nom: 'Licence de vol (ligne)', emoji: '✈️', prix: 4000, heures: 20 },
  permis_bateau: { nom: 'Permis bateau', emoji: '⛵', prix: 1200, heures: 10 },
  permis_extraction: { nom: 'Permis d’extraction pétrolière', emoji: '🛢️', prix: 2500, heures: 12 },
  certif_securite: { nom: 'Certificat sécurité mine', emoji: '⛑️', prix: 600, heures: 6 },
  certif_nucleaire: { nom: 'Certificat matières radioactives', emoji: '☢️', prix: 5000, heures: 24 },
};
