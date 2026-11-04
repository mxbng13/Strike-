/**
 * Catalogue initial (catégories, badges, paramètres). Ces valeurs sont insérées une seule fois
 * puis entièrement administrables depuis le back-office (aucune modification de code nécessaire).
 * Les fourchettes de prix sont des repères indicatifs fixés par l'équipe, pas des statistiques.
 */
import type { BadgeRule } from "./schema";

type Sensitivity = "standard" | "home_access" | "children" | "vulnerable" | "animals" | "technical" | "transport";

export type CategorySeed = {
  slug: string;
  name: string;
  group: string;
  icon: string;
  color: string;
  keywords: string[];
  sensitivity?: Sensitivity;
  requiresPhone?: boolean;
  requiresIdentity?: boolean;
  requiresReferences?: boolean;
  safetyNotice?: string;
  min: number; // euros
  max: number;
  duration: number; // minutes
};

const G = {
  famille: "Famille & proches",
  animaux: "Animaux",
  courses: "Courses & livraisons",
  maison: "Maison & entretien",
  jardin: "Jardin & extérieur",
  bricolage: "Bricolage & travaux",
  numerique: "Numérique & créatif",
  aide: "Aide & accompagnement",
  transport: "Transport & déménagement",
  evenements: "Événements",
  autre: "Autre",
};

const CHILD_NOTICE =
  "Garde d'enfants : intervenant majeur, téléphone et identité vérifiés, références obligatoires. Rencontrez-vous avant la première garde et ne partagez votre adresse qu'une fois l'intervenant choisi.";
const HOME_NOTICE =
  "Accès au domicile : privilégiez des intervenants au profil vérifié et bien noté. L'adresse exacte n'est communiquée qu'après acceptation.";
const VULNERABLE_NOTICE =
  "Accompagnement de personnes vulnérables : identité vérifiée obligatoire. Un proche doit être informé de l'intervention. Aucun acte médical ou de soin réglementé.";
const TECH_NOTICE =
  "Travaux techniques : petits travaux uniquement. Les interventions réglementées (électricité sur tableau, gaz, toiture…) doivent être confiées à des professionnels qualifiés et assurés.";
const ANIMAL_NOTICE = "Garde d'animaux : précisez le caractère, la santé et les habitudes de l'animal. Un numéro de vétérinaire doit être communiqué.";
const TRANSPORT_NOTICE =
  "Transport d'objets uniquement. Le transport rémunéré de personnes est une activité réglementée et n'est pas proposé sur ENTOUR.";

export const CATEGORY_SEEDS: CategorySeed[] = [
  { slug: "baby-sitting", name: "Baby-sitting et garde d'enfants", group: G.famille, icon: "baby", color: "#E8613C", keywords: ["baby", "babysitting", "baby-sitter", "enfant", "enfants", "bébé", "garde", "nounou", "sortie d'école"], sensitivity: "children", requiresPhone: true, requiresIdentity: true, requiresReferences: true, safetyNotice: CHILD_NOTICE, min: 10, max: 15, duration: 180 },
  { slug: "garde-animaux", name: "Garde d'animaux", group: G.animaux, icon: "paw", color: "#C2410C", keywords: ["chat", "chats", "animal", "animaux", "lapin", "garde", "nourrir", "litière"], sensitivity: "animals", requiresPhone: true, safetyNotice: ANIMAL_NOTICE, min: 10, max: 25, duration: 60 },
  { slug: "promenade-chiens", name: "Promenade de chiens", group: G.animaux, icon: "dog", color: "#B45309", keywords: ["chien", "chiens", "promener", "promenade", "balade", "sortir le chien"], sensitivity: "animals", requiresPhone: true, safetyNotice: ANIMAL_NOTICE, min: 8, max: 15, duration: 30 },
  { slug: "livraison-repas", name: "Livraison de repas", group: G.courses, icon: "utensils", color: "#DC2626", keywords: ["mcdo", "mcdonald", "mcdonald's", "burger", "kebab", "pizza", "sushi", "repas", "restaurant", "livrer", "apporter à manger"], min: 4, max: 10, duration: 30 },
  { slug: "courses-alimentaires", name: "Courses alimentaires", group: G.courses, icon: "basket", color: "#16A34A", keywords: ["courses", "supermarché", "carrefour", "leclerc", "lidl", "intermarché", "épicerie", "provisions"], min: 8, max: 20, duration: 60 },
  { slug: "recuperation-colis", name: "Récupération de colis", group: G.courses, icon: "package", color: "#9333EA", keywords: ["colis", "relais", "point relais", "la poste", "chronopost", "amazon", "récupérer un colis"], min: 4, max: 10, duration: 30 },
  { slug: "aide-demenagement", name: "Aide au déménagement", group: G.transport, icon: "truck", color: "#2563EB", keywords: ["déménagement", "déménager", "cartons", "porter", "monter", "étage"], min: 15, max: 25, duration: 180 },
  { slug: "montage-meubles", name: "Montage de meubles", group: G.bricolage, icon: "hammer", color: "#7C3AED", keywords: ["ikea", "meuble", "montage", "monter", "armoire", "lit", "étagère", "commode", "assembler"], sensitivity: "home_access", safetyNotice: HOME_NOTICE, min: 20, max: 60, duration: 120 },
  { slug: "jardinage", name: "Jardinage", group: G.jardin, icon: "sprout", color: "#15803D", keywords: ["jardin", "jardinage", "désherber", "haie", "tailler", "plantation", "feuilles", "massif"], min: 15, max: 25, duration: 120 },
  { slug: "tonte-pelouse", name: "Tonte de pelouse", group: G.jardin, icon: "leaf", color: "#65A30D", keywords: ["tondre", "tonte", "pelouse", "gazon", "herbe", "tondeuse"], min: 20, max: 50, duration: 90 },
  { slug: "nettoyage-maison", name: "Nettoyage de maison", group: G.maison, icon: "spray", color: "#0891B2", keywords: ["ménage", "nettoyage", "nettoyer", "aspirateur", "serpillière", "salle de bain", "cuisine"], sensitivity: "home_access", safetyNotice: HOME_NOTICE, min: 13, max: 20, duration: 120 },
  { slug: "nettoyage-voiture", name: "Nettoyage de voiture", group: G.maison, icon: "car", color: "#0E7490", keywords: ["voiture", "lavage auto", "intérieur voiture", "aspirer la voiture"], min: 15, max: 40, duration: 60 },
  { slug: "lavage-vitres", name: "Lavage de vitres", group: G.maison, icon: "window", color: "#0284C7", keywords: ["vitres", "fenêtres", "carreaux", "baie vitrée"], sensitivity: "home_access", safetyNotice: HOME_NOTICE, min: 15, max: 40, duration: 90 },
  { slug: "repassage", name: "Repassage", group: G.maison, icon: "shirt", color: "#DB2777", keywords: ["repassage", "repasser", "linge", "chemises"], min: 12, max: 18, duration: 60 },
  { slug: "aide-informatique", name: "Aide informatique", group: G.numerique, icon: "laptop", color: "#4F46E5", keywords: ["ordinateur", "pc", "mac", "informatique", "wifi", "box internet", "virus", "logiciel", "windows"], min: 15, max: 30, duration: 60 },
  { slug: "installation-imprimante", name: "Installation d'imprimante", group: G.numerique, icon: "printer", color: "#6366F1", keywords: ["imprimante", "scanner", "imprimer", "installation imprimante"], min: 15, max: 30, duration: 45 },
  { slug: "assistance-telephonique", name: "Assistance smartphone et téléphone", group: G.numerique, icon: "phone", color: "#8B5CF6", keywords: ["téléphone", "smartphone", "iphone", "android", "whatsapp", "applications", "configurer"], min: 10, max: 25, duration: 45 },
  { slug: "aide-devoirs", name: "Aide aux devoirs", group: G.famille, icon: "book", color: "#EA580C", keywords: ["devoirs", "collège", "primaire", "école", "leçons"], sensitivity: "children", requiresPhone: true, requiresIdentity: true, safetyNotice: CHILD_NOTICE, min: 12, max: 20, duration: 60 },
  { slug: "cours-particuliers", name: "Cours particuliers", group: G.famille, icon: "graduation", color: "#F59E0B", keywords: ["cours", "maths", "anglais", "physique", "piano", "guitare", "soutien scolaire", "langue"], requiresPhone: true, min: 15, max: 30, duration: 60 },
  { slug: "aide-administrative", name: "Aide administrative", group: G.aide, icon: "file", color: "#475569", keywords: ["papiers", "administratif", "caf", "impôts", "dossier", "formulaire", "courrier", "démarches"], min: 15, max: 30, duration: 60 },
  { slug: "aide-personnes-agees", name: "Aide aux personnes âgées", group: G.aide, icon: "heart", color: "#E11D48", keywords: ["personne âgée", "senior", "grand-mère", "grand-père", "compagnie", "visite", "mamie", "papi"], sensitivity: "vulnerable", requiresPhone: true, requiresIdentity: true, safetyNotice: VULNERABLE_NOTICE, min: 12, max: 20, duration: 120 },
  { slug: "petites-reparations", name: "Petites réparations domestiques", group: G.bricolage, icon: "wrench", color: "#6D28D9", keywords: ["réparer", "réparation", "fuite", "robinet", "porte", "poignée", "joint", "ampoule"], sensitivity: "technical", safetyNotice: TECH_NOTICE, min: 20, max: 50, duration: 60 },
  { slug: "peinture-decoration", name: "Peinture et décoration", group: G.bricolage, icon: "paintbrush", color: "#A21CAF", keywords: ["peinture", "peindre", "mur", "plafond", "tapisserie", "papier peint", "déco"], sensitivity: "home_access", safetyNotice: HOME_NOTICE, min: 50, max: 200, duration: 240 },
  { slug: "debarras", name: "Débarras", group: G.transport, icon: "trash", color: "#57534E", keywords: ["débarras", "déchetterie", "vider", "cave", "grenier", "encombrants", "jeter"], min: 30, max: 120, duration: 180 },
  { slug: "transport-objets", name: "Transport d'objets", group: G.transport, icon: "truck", color: "#1D4ED8", keywords: ["transporter", "camionnette", "utilitaire", "véhicule", "emmener", "déplacer"], sensitivity: "transport", safetyNotice: TRANSPORT_NOTICE, min: 20, max: 80, duration: 90 },
  { slug: "recuperation-meubles", name: "Récupération de meubles", group: G.transport, icon: "sofa", color: "#1E40AF", keywords: ["canapé", "meuble", "leboncoin", "récupérer un meuble", "table", "frigo"], min: 20, max: 80, duration: 90 },
  { slug: "arrosage-plantes", name: "Arrosage des plantes", group: G.jardin, icon: "droplets", color: "#0D9488", keywords: ["arroser", "arrosage", "plantes", "fleurs"], sensitivity: "home_access", safetyNotice: HOME_NOTICE, min: 5, max: 15, duration: 30 },
  { slug: "surveillance-maison", name: "Surveillance de maison", group: G.maison, icon: "shield", color: "#334155", keywords: ["surveiller", "surveillance", "passer voir", "courrier", "boîte aux lettres", "volets"], sensitivity: "home_access", requiresIdentity: true, safetyNotice: HOME_NOTICE, min: 5, max: 15, duration: 30 },
  { slug: "gardiennage-vacances", name: "Gardiennage pendant les vacances", group: G.maison, icon: "plane", color: "#0F766E", keywords: ["vacances", "absence", "gardiennage", "house sitting", "garder la maison"], sensitivity: "home_access", requiresIdentity: true, requiresPhone: true, safetyNotice: HOME_NOTICE, min: 10, max: 30, duration: 60 },
  { slug: "courses-pharmacie", name: "Courses à la pharmacie", group: G.courses, icon: "pill", color: "#059669", keywords: ["pharmacie", "médicaments", "ordonnance", "parapharmacie"], safetyNotice: "Les médicaments sur ordonnance ne peuvent être retirés qu'avec l'ordonnance originale et l'accord du patient.", min: 5, max: 12, duration: 30 },
  { slug: "depot-documents", name: "Dépôt et récupération de documents", group: G.courses, icon: "files", color: "#64748B", keywords: ["document", "déposer", "dossier", "mairie", "poste", "lettre recommandée"], min: 5, max: 15, duration: 45 },
  { slug: "organisation-evenements", name: "Aide à l'organisation d'événements", group: G.evenements, icon: "party", color: "#D946EF", keywords: ["anniversaire", "fête", "mariage", "organisation", "décoration de salle", "soirée"], min: 15, max: 25, duration: 240 },
  { slug: "photographie", name: "Photographie", group: G.numerique, icon: "camera", color: "#9D174D", keywords: ["photo", "photographe", "shooting", "portrait"], min: 30, max: 150, duration: 120 },
  { slug: "montage-video", name: "Montage vidéo", group: G.numerique, icon: "film", color: "#BE185D", keywords: ["vidéo", "montage", "youtube", "tiktok", "film"], min: 30, max: 150, duration: 180 },
  { slug: "creation-graphique", name: "Création graphique", group: G.numerique, icon: "palette", color: "#C026D3", keywords: ["logo", "affiche", "flyer", "graphisme", "design", "carte de visite"], min: 30, max: 150, duration: 180 },
  { slug: "aide-vente-objets", name: "Aide à la vente d'objets", group: G.aide, icon: "tag", color: "#CA8A04", keywords: ["vendre", "vente", "vinted", "leboncoin", "annonces", "photos d'objets"], min: 15, max: 40, duration: 120 },
  { slug: "aide-rangement", name: "Aide au rangement", group: G.maison, icon: "boxes", color: "#0369A1", keywords: ["ranger", "rangement", "trier", "désencombrer", "placards"], sensitivity: "home_access", safetyNotice: HOME_NOTICE, min: 15, max: 25, duration: 180 },
  { slug: "nettoyage-terrasse", name: "Nettoyage de terrasse", group: G.jardin, icon: "brush", color: "#4D7C0F", keywords: ["terrasse", "karcher", "dalles", "balcon", "mousse"], min: 30, max: 90, duration: 180 },
  { slug: "deneigement", name: "Déneigement", group: G.jardin, icon: "snowflake", color: "#38BDF8", keywords: ["neige", "déneiger", "pelleter", "verglas"], min: 15, max: 40, duration: 60 },
  { slug: "aide-bricolage", name: "Aide au bricolage", group: G.bricolage, icon: "drill", color: "#5B21B6", keywords: ["bricolage", "percer", "fixer", "accrocher", "cadre", "tringle", "étagère"], sensitivity: "technical", safetyNotice: TECH_NOTICE, min: 15, max: 50, duration: 60 },
  { slug: "installation-materiel", name: "Installation de matériel", group: G.bricolage, icon: "plug", color: "#7E22CE", keywords: ["installer", "télé", "tv", "home cinéma", "box", "lave-linge", "brancher"], sensitivity: "technical", safetyNotice: TECH_NOTICE, min: 20, max: 50, duration: 60 },
  { slug: "assistance-evenement", name: "Assistance lors d'un événement", group: G.evenements, icon: "users", color: "#A855F7", keywords: ["service", "serveur", "accueil", "vestiaire", "buffet", "extra"], min: 13, max: 20, duration: 240 },
  { slug: "accompagnement-courses", name: "Accompagnement pour des courses", group: G.aide, icon: "cart", color: "#22C55E", keywords: ["accompagner", "accompagnement", "faire les courses avec"], sensitivity: "vulnerable", requiresPhone: true, requiresIdentity: true, safetyNotice: VULNERABLE_NOTICE, min: 10, max: 20, duration: 90 },
  { slug: "collecte-livraison-objets", name: "Collecte et livraison d'objets", group: G.courses, icon: "package-open", color: "#7C3AED", keywords: ["livrer", "livraison", "déposer un objet", "apporter", "récupérer"], min: 5, max: 20, duration: 45 },
  { slug: "nettoyage-apres-fete", name: "Aide au nettoyage après une fête", group: G.evenements, icon: "wine", color: "#E879F9", keywords: ["après fête", "après soirée", "ranger après", "vaisselle"], sensitivity: "home_access", safetyNotice: HOME_NOTICE, min: 15, max: 25, duration: 180 },
  { slug: "entretien-piscine", name: "Entretien de piscine", group: G.jardin, icon: "waves", color: "#0EA5E9", keywords: ["piscine", "chlore", "épuisette", "bâche"], min: 20, max: 50, duration: 60 },
  { slug: "lavage-velos", name: "Lavage et entretien de vélos", group: G.maison, icon: "bike", color: "#14B8A6", keywords: ["vélo", "vélos", "chaîne", "crevaison", "pneu"], min: 10, max: 25, duration: 45 },
  { slug: "jardin-potager", name: "Aide au jardin potager", group: G.jardin, icon: "carrot", color: "#84CC16", keywords: ["potager", "légumes", "semis", "tomates", "bêcher"], min: 15, max: 25, duration: 120 },
  { slug: "courses-derniere-minute", name: "Courses de dernière minute", group: G.courses, icon: "zap", color: "#F97316", keywords: ["urgent", "vite", "maintenant", "dernière minute", "boulangerie", "pain", "piles"], min: 4, max: 10, duration: 30 },
  { slug: "services-personnalises", name: "Services personnalisés", group: G.autre, icon: "star", color: "#4338CA", keywords: ["personnalisé", "sur mesure"], min: 10, max: 50, duration: 60 },
  { slug: "autre", name: "Autre service", group: G.autre, icon: "help", color: "#6B7280", keywords: [], min: 5, max: 50, duration: 60 },
];

export type BadgeSeed = { slug: string; name: string; description: string; icon: string; color: string; kind?: "auto" | "manual" | "seasonal"; rule: BadgeRule; points: number };

export const BADGE_SEEDS: BadgeSeed[] = [
  { slug: "nouveau-membre", name: "Nouveau membre", description: "Bienvenue dans la communauté ENTOUR.", icon: "sparkles", color: "#6366F1", rule: { type: "account_created" }, points: 0 },
  { slug: "premiere-mission", name: "Première mission", description: "A réalisé sa première mission.", icon: "flag", color: "#22C55E", rule: { type: "missions_done", min: 1 }, points: 20 },
  { slug: "missions-5", name: "5 missions réussies", description: "5 missions terminées avec succès.", icon: "medal", color: "#0EA5E9", rule: { type: "missions_done", min: 5 }, points: 50 },
  { slug: "missions-10", name: "10 missions réussies", description: "10 missions terminées avec succès.", icon: "medal", color: "#8B5CF6", rule: { type: "missions_done", min: 10 }, points: 100 },
  { slug: "missions-50", name: "50 missions réussies", description: "50 missions terminées avec succès.", icon: "trophy", color: "#F59E0B", rule: { type: "missions_done", min: 50 }, points: 300 },
  { slug: "missions-100", name: "100 missions réussies", description: "100 missions terminées : une référence du quartier.", icon: "crown", color: "#EAB308", rule: { type: "missions_done", min: 100 }, points: 600 },
  { slug: "tres-bien-note", name: "Très bien noté", description: "Note moyenne d'au moins 4,8/5 sur 5 avis ou plus.", icon: "star", color: "#F59E0B", rule: { type: "rating", min: 4.8, minCount: 5 }, points: 80 },
  { slug: "ponctuel", name: "Ponctuel", description: "À l'heure dans au moins 95 % des missions (10 minimum).", icon: "clock", color: "#14B8A6", rule: { type: "punctuality", minRate: 0.95, minCount: 10 }, points: 60 },
  { slug: "expert-jardinage", name: "Expert du jardinage", description: "10 missions de jardin réalisées.", icon: "sprout", color: "#15803D", rule: { type: "category_missions", categoryGroup: "Jardin & extérieur", min: 10 }, points: 80 },
  { slug: "expert-bricolage", name: "Expert en bricolage", description: "10 missions de bricolage réalisées.", icon: "hammer", color: "#6D28D9", rule: { type: "category_missions", categoryGroup: "Bricolage & travaux", min: 10 }, points: 80 },
  { slug: "super-voisin", name: "Super voisin", description: "A rendu service à au moins 10 personnes différentes.", icon: "home-heart", color: "#E11D48", rule: { type: "neighbor", minDistinctPeople: 10 }, points: 100 },
  { slug: "profil-verifie", name: "Profil vérifié", description: "Téléphone et identité vérifiés.", icon: "badge-check", color: "#2563EB", rule: { type: "verified" }, points: 40 },
  { slug: "membre-actif", name: "Membre actif", description: "Au moins 5 missions (demandées ou réalisées) sur les 30 derniers jours.", icon: "activity", color: "#F97316", rule: { type: "active_days", days: 30, minActions: 5 }, points: 40 },
  { slug: "fiable", name: "Fiable", description: "Moins de 5 % d'annulations sur au moins 10 missions.", icon: "shield-check", color: "#0F766E", rule: { type: "reliability", maxCancelRate: 0.05, minCount: 10 }, points: 80 },
  { slug: "excellent-communicateur", name: "Excellent communicateur", description: "Note de communication moyenne d'au moins 4,8 (5 avis minimum).", icon: "message", color: "#7C3AED", rule: { type: "criterion_avg", criterion: "communication", min: 4.8, minCount: 5 }, points: 60 },
  { slug: "hiver-solidaire", name: "Hiver solidaire", description: "Badge saisonnier : 3 missions réalisées entre décembre et février.", icon: "snowflake", color: "#38BDF8", kind: "seasonal", rule: { type: "season", months: [12, 1, 2], min: 3 }, points: 50 },
  { slug: "ete-au-jardin", name: "Été au jardin", description: "Badge saisonnier : 3 missions réalisées entre juin et août.", icon: "sun", color: "#FACC15", kind: "seasonal", rule: { type: "season", months: [6, 7, 8], min: 3 }, points: 50 },
];

/** Paramètres de la plateforme, modifiables depuis l'administration. */
export const DEFAULT_SETTINGS: Record<string, unknown> = {
  fees: { providerCommissionPct: 5, payerServiceFeePct: 0, payerServiceFeeFixedCents: 0, minFeeCents: 0 },
  subscriptions: {
    plus: { priceCents: 499, label: "ENTOUR Plus", perks: ["Commission réduite à 3 %", "Alertes prioritaires", "Badge Plus", "Statistiques avancées"], commissionPct: 3 },
    pro: { priceCents: 1499, label: "ENTOUR Pro", perks: ["Profil professionnel vérifié", "Commission réduite à 2 %", "2 mises en avant / mois", "Devis multiples illimités"], commissionPct: 2 },
  },
  boost: { priceCents: 199, hours: 24 },
  limits: { maxOpenServicesPerUser: 10, maxApplicationsPerDay: 30, maxMessagesPerMinute: 30, maxNotificationsPerHour: 6 },
  moderation: { autoHoldRiskScore: 60, bannedWords: ["arme", "drogue", "cannabis", "prostitution", "faux papiers", "contrefaçon"] },
  loyalty: { pointsPerMission: 20, pointsPerReview: 5, pointsPerReferral: 100, levels: [0, 100, 300, 700, 1500, 3000] },
  referral: { rewardPoints: 100, qualifyingMissions: 1 },
  purchaseClaims: { minSilenceMinutes: 120, maxPurchaseCents: 50000 },
  launch: { activeZones: [{ label: "Lyon", lat: 45.764, lng: 4.8357, radiusKm: 20 }], waitlistOutsideZones: false },
  legal: { termsVersion: "2026-11" },
};
