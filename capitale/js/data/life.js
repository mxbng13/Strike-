// LA VRAIE VIE : calendrier, saisons, jours fériés, horaires d'ouverture, actualités, impôts, élections, animaux.

// Une année de jeu = 28 jours (4 saisons de 7 jours). Le jour 1 est un lundi de printemps.
export const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const SEASONS = [
  { id: 'printemps', nom: 'Printemps', emoji: '🌸', agri: 1.15, chauffage: 1, froid: 0.03, chaud: 0.02 },
  { id: 'ete', nom: 'Été', emoji: '☀️', agri: 1.3, chauffage: 0, froid: 0, chaud: 0.12 },
  { id: 'automne', nom: 'Automne', emoji: '🍂', agri: 1.0, chauffage: 1, froid: 0.05, chaud: 0 },
  { id: 'hiver', nom: 'Hiver', emoji: '❄️', agri: 0.5, chauffage: 2.5, froid: 0.15, chaud: 0 },
];
export const YEAR = 28;
// Jours fériés (jour de l'année 1 à 28)
export const HOLIDAYS = {
  5: { nom: 'Fête du travail', emoji: '🌼', moral: 6, ferme: ['admin'] },
  10: { nom: 'Fête de la ville de Nexus', emoji: '🎉', moral: 12, ferme: ['admin'], festival: true },
  12: { nom: 'Fête de la musique', emoji: '🎵', moral: 10, ferme: [], festival: true },
  21: { nom: 'Halloween', emoji: '🎃', moral: 6, ferme: [] },
  26: { nom: 'Noël', emoji: '🎄', moral: 15, ferme: ['admin', 'shops'], gifts: true },
  28: { nom: 'Réveillon du Nouvel An', emoji: '🎆', moral: 10, ferme: ['admin'], festival: true },
};
export const dayOfYear = (t) => (Math.floor(t / 1440) % YEAR) + 1;
export const weekday = (t) => Math.floor(t / 1440) % 7;            // 0 = lundi
export const seasonOf = (t) => SEASONS[Math.floor((dayOfYear(t) - 1) / 7)];
export const yearOf = (t) => Math.floor(Math.floor(t / 1440) / YEAR) + 1;
export const holidayOf = (t) => HOLIDAYS[dayOfYear(t)] || null;

// Horaires d'ouverture : [ouverture, fermeture] en heures (fermeture > 24 = après minuit), jours fermés, catégorie
// cat : admin (fermé le week-end et les jours fériés administratifs), shops (commerces), always (jamais fermé)
export const HOURS = {
  marche: { h: [6, 20], closed: [6], cat: 'shops' }, restaurant: { h: [11, 23], cat: 'leisure' }, bains: { h: [6, 22], cat: 'shops' },
  coiffeur: { h: [9, 19], closed: [6], cat: 'shops' }, hotel: { h: [0, 24], cat: 'always' }, vetements: { h: [10, 19], closed: [6], cat: 'shops' },
  quincaillerie: { h: [8, 19], closed: [6], cat: 'shops' }, comptoir: { h: [6, 22], cat: 'shops' }, atelier: { h: [7, 19], cat: 'work' },
  usine: { h: [0, 24], cat: 'always' }, chantier: { h: [7, 18], closed: [6], cat: 'work' }, technopole: { h: [8, 20], cat: 'work' },
  labo: { h: [8, 20], cat: 'work' }, tribunal: { h: [9, 17], closed: [5, 6], cat: 'admin' }, caserne: { h: [0, 24], cat: 'always' },
  emploi: { h: [9, 17], closed: [5, 6], cat: 'admin' }, garage: { h: [8, 19], closed: [6], cat: 'shops' }, gare: { h: [5, 24], cat: 'always' },
  portail: { h: [0, 24], cat: 'always' }, com: { h: [9, 19], closed: [6], cat: 'work' }, guilde: { h: [10, 22], cat: 'leisure' },
  club: { h: [21, 29], cat: 'leisure' }, musee: { h: [10, 18], closed: [0], cat: 'leisure' }, meubles: { h: [10, 19], closed: [6], cat: 'shops' },
  immobilier: { h: [9, 18], closed: [6], cat: 'shops' }, residences: { h: [0, 24], cat: 'always' }, hopital: { h: [0, 24], cat: 'always' },
  cabinet: { h: [8, 19], closed: [6], cat: 'shops' }, pharmacie: { h: [8, 21], cat: 'shops' }, assurance: { h: [9, 18], closed: [5, 6], cat: 'admin' },
  loisirs: { h: [14, 25], cat: 'leisure' }, arene: { h: [7, 22], cat: 'leisure' }, tourisme: { h: [9, 18], cat: 'shops' },
  ecole: { h: [8, 18], closed: [6], cat: 'admin' }, evenements: { h: [10, 26], cat: 'leisure' }, famille: { h: [9, 18], closed: [5, 6], cat: 'admin' },
  cadeaux: { h: [10, 20], closed: [6], cat: 'shops' }, mairie: { h: [9, 17], closed: [5, 6], cat: 'admin' }, banque: { h: [9, 17], closed: [5, 6], cat: 'admin' },
  veterinaire: { h: [8, 19], closed: [6], cat: 'shops' }, poste: { h: [9, 18], closed: [6], cat: 'admin' }, kiosque: { h: [6, 21], cat: 'shops' },
  parc: { h: [6, 23], cat: 'always' }, bibliotheque: { h: [10, 19], closed: [0], cat: 'leisure' }, prefecture: { h: [9, 16], closed: [5, 6], cat: 'admin' },
  auto_ecole: { h: [9, 19], closed: [6], cat: 'shops' },
};

// Actualités : événements qui changent la vie et l'économie pendant quelques jours
// prod : multiplicateur de production par secteur · need : demande des habitants · ill : risque de maladie
export const EVENTS = [
  { id: 'secheresse', nom: 'Sécheresse', emoji: '🏜️', jours: 5, prod: { agri: 0.5 }, txt: 'Les récoltes chutent : la nourriture va devenir chère.' },
  { id: 'recolte', nom: 'Récolte record', emoji: '🌾', jours: 4, prod: { agri: 1.6 }, txt: 'Les champs débordent : la nourriture sera moins chère.' },
  { id: 'grippe', nom: 'Épidémie de grippe', emoji: '🤧', jours: 6, ill: 3, svc: { consultation: 3, soins_infirmiers: 2 }, txt: 'Lavez-vous, faites-vous vacciner : les médecins sont débordés.' },
  { id: 'greve', nom: 'Grève des transports', emoji: '🪧', jours: 3, block: ['train', 'vol'], txt: 'Plus de trains ni de navettes : marchez, roulez ou téléportez-vous.' },
  { id: 'krach', nom: 'Krach boursier', emoji: '📉', jours: 3, stocks: -0.25, txt: 'Les actions s’effondrent. Certains achètent à bas prix…' },
  { id: 'boom', nom: 'Euphorie boursière', emoji: '📈', jours: 3, stocks: 0.2, txt: 'Les actions s’envolent.' },
  { id: 'festival', nom: 'Grand festival', emoji: '🎪', jours: 3, moral: 2, svc: { concert: 3, cinema: 2, theatre: 2, cocktail: 2 }, txt: 'Concerts et spectacles partout : la ville fait la fête.' },
  { id: 'panne', nom: 'Panne du réseau électrique', emoji: '🔌', jours: 3, prod: { energie: 0.4 }, txt: 'L’électricité manque : les usines tournent au ralenti.' },
  { id: 'filon', nom: 'Découverte d’un filon', emoji: '💎', jours: 5, prod: { extraction: 1.7 }, txt: 'Les mineurs trouvent beaucoup plus de minerai.' },
  { id: 'tempete', nom: 'Tempête', emoji: '🌪️', jours: 2, storm: true, txt: 'Toitures arrachées : les maisons non assurées sont abîmées.' },
  { id: 'carburant', nom: 'Pénurie de carburant', emoji: '⛽', jours: 4, prod: { energie: 0.7 }, txt: 'Les raffineries manquent de pétrole.' },
  { id: 'salon', nom: 'Salon de l’emploi', emoji: '💼', jours: 4, training: 0.7, txt: 'Formations −30 % pendant le salon.' },
  { id: 'soldes', nom: 'Soldes', emoji: '🏷️', jours: 5, sale: 0.8, txt: 'Vêtements, meubles et appareils −20 % chez les vendeurs.' },
  { id: 'canicule_longue', nom: 'Canicule', emoji: '🥵', jours: 3, weather: 'canicule', txt: 'Buvez beaucoup et protégez-vous du soleil.' },
  { id: 'froid_long', nom: 'Grand froid', emoji: '🥶', jours: 3, weather: 'vague_froid', txt: 'Chauffage indispensable, manteau obligatoire.' },
];

// Impôt sur le revenu (par semaine, sur ce que vous avez gagné)
export const TAX_BRACKETS = [[500, 0], [1500, 0.1], [4000, 0.2], [Infinity, 0.3]];
export const PROPERTY_TAX = { location: 15, studio: 40, maison: 90, villa: 200 };   // taxe d'habitation / foncière par semaine
export const BILL_PRICES = { internet: 25, ordures: 10 };

// Élections municipales : programmes des candidats
export const PROGRAMMES = [
  { id: 'baisse', nom: 'Baisser les impôts', tva: 0.03, ir: 0.8, police: 0.9, ecole: 1.1, txt: 'Moins d’impôts, mais moins de services publics.' },
  { id: 'securite', nom: 'Plus de sécurité', tva: 0.05, ir: 1, police: 1.6, ecole: 1, txt: 'Plus de policiers : beaucoup moins de vols.' },
  { id: 'social', nom: 'Écoles et santé gratuites', tva: 0.07, ir: 1.2, police: 1, ecole: 0.5, sante: 0.5, txt: 'École et soins moins chers, mais impôts plus élevés.' },
  { id: 'ecologie', nom: 'Ville verte', tva: 0.05, ir: 1, police: 1, ecole: 1, agri: 1.2, txt: 'Aides à l’agriculture, parcs et énergies propres.' },
  { id: 'business', nom: 'Aider les entreprises', tva: 0.04, ir: 1, police: 1, ecole: 1, company: 0.5, txt: 'Impôt sur les sociétés divisé par deux.' },
];
export const MAYOR_SALARY = 350;

// Animaux de compagnie
export const PETS = {
  chiot: { nom: 'Chien', emoji: '🐕', moral: 4, mange: 2, promenade: true },
  chaton: { nom: 'Chat', emoji: '🐈', moral: 3, mange: 1 },
};
export const PET_NAMES = ['Rex', 'Pixel', 'Moka', 'Luna', 'Biscuit', 'Nova', 'Filou', 'Prune', 'Comète', 'Tofu', 'Orion', 'Mimi'];
