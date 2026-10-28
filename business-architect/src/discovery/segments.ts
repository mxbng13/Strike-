import type { ArchetypeId } from "./archetypes";

/**
 * Exploration space for the Opportunity Engine. Each problem statement is an
 * UNVERIFIED HYPOTHESIS until research attaches evidence to it. NAF codes are
 * official French activity codes (NAF rév. 2) used to query the company
 * register for market density.
 */
export type Problem = {
  id: string;
  short: string;
  statement: string;
  /** English query for tech discussions (pain/demand signals). */
  hnQuery: string;
  /** French keywords for public datasets / web search. */
  frQuery: string;
  archetypes: ArchetypeId[];
};

export type Segment = {
  id: string;
  label: string;
  sector: string;
  sectorKeywords: string[];
  customerType: "b2b" | "b2c";
  naf?: string;
  problems: Problem[];
};

export const SEGMENTS: Segment[] = [
  {
    id: "restaurants",
    label: "restaurants indépendants",
    sector: "Restauration",
    sectorKeywords: ["restauration", "restaurant", "food", "alimentation", "hôtellerie"],
    customerType: "b2b",
    naf: "56.10A",
    problems: [
      { id: "no-show", short: "la réduction des réservations non honorées", statement: "Les restaurants indépendants perdent du chiffre d'affaires à cause des réservations non honorées (no-show).", hnQuery: "restaurant no-show reservations", frQuery: "réservation restaurant", archetypes: ["vertical_saas", "ai_automation_service"] },
      { id: "food-waste", short: "le suivi du gaspillage et des coûts matières", statement: "Les restaurateurs suivent mal leurs coûts matières et leur gaspillage alimentaire, ce qui dégrade leur marge.", hnQuery: "restaurant food cost inventory software", frQuery: "gaspillage alimentaire restauration", archetypes: ["vertical_saas", "productized_service", "info_product"] },
      { id: "reviews", short: "la gestion des avis clients en ligne", statement: "Les restaurants n'ont pas le temps de répondre aux avis en ligne alors qu'ils influencent fortement le choix des clients.", hnQuery: "restaurant online reviews management", frQuery: "avis clients restaurant", archetypes: ["productized_service", "ai_automation_service"] },
    ],
  },
  {
    id: "bakeries",
    label: "boulangeries-pâtisseries",
    sector: "Artisanat alimentaire",
    sectorKeywords: ["boulangerie", "artisanat", "alimentation", "commerce de proximité"],
    customerType: "b2b",
    naf: "10.71C",
    problems: [
      { id: "unsold", short: "la prévision de production et des invendus", statement: "Les boulangeries produisent trop ou pas assez selon les jours, générant des invendus ou des ruptures.", hnQuery: "bakery demand forecasting waste", frQuery: "invendus boulangerie", archetypes: ["vertical_saas", "data_product"] },
      { id: "preorders", short: "la prise de commandes à l'avance", statement: "Les boulangeries gèrent les commandes (gâteaux, fêtes) par téléphone et papier, source d'erreurs.", hnQuery: "bakery online preorder system small business", frQuery: "commande en ligne boulangerie", archetypes: ["vertical_saas", "productized_service"] },
    ],
  },
  {
    id: "plumbers",
    label: "plombiers et chauffagistes",
    sector: "Bâtiment et artisanat",
    sectorKeywords: ["bâtiment", "btp", "artisanat", "plomberie", "rénovation", "énergie"],
    customerType: "b2b",
    naf: "43.22A",
    problems: [
      { id: "quotes", short: "la rédaction des devis et la relance des impayés", statement: "Les artisans perdent des heures le soir sur les devis et relancent mal leurs factures impayées.", hnQuery: "tradesman quotes invoicing software", frQuery: "devis facture artisan", archetypes: ["vertical_saas", "ai_automation_service"] },
      { id: "grants", short: "le montage des dossiers d'aides à la rénovation", statement: "Les artisans RGE perdent des chantiers car le montage des dossiers d'aides (MaPrimeRénov', CEE) est complexe pour leurs clients.", hnQuery: "energy renovation subsidy paperwork contractor", frQuery: "MaPrimeRénov artisans RGE", archetypes: ["productized_service", "data_product", "info_product"] },
    ],
  },
  {
    id: "electricians",
    label: "électriciens",
    sector: "Bâtiment et artisanat",
    sectorKeywords: ["bâtiment", "btp", "artisanat", "électricité", "énergie"],
    customerType: "b2b",
    naf: "43.21A",
    problems: [
      { id: "irve", short: "la qualification et le suivi des installations de bornes de recharge", statement: "Les électriciens veulent capter le marché des bornes de recharge mais manquent d'outils de chiffrage et de suivi des certifications.", hnQuery: "EV charger installer business software", frQuery: "bornes de recharge IRVE", archetypes: ["data_product", "info_product", "vertical_saas"] },
    ],
  },
  {
    id: "hairdressers",
    label: "salons de coiffure",
    sector: "Beauté et bien-être",
    sectorKeywords: ["beauté", "coiffure", "bien-être", "commerce de proximité"],
    customerType: "b2b",
    naf: "96.02A",
    problems: [
      { id: "loyalty", short: "la fidélisation et la relance des clients inactifs", statement: "Les salons perdent des clients réguliers sans s'en rendre compte, faute de relance personnalisée.", hnQuery: "salon customer retention sms", frQuery: "fidélisation salon de coiffure", archetypes: ["productized_service", "ai_automation_service", "vertical_saas"] },
    ],
  },
  {
    id: "physios",
    label: "kinésithérapeutes libéraux",
    sector: "Santé",
    sectorKeywords: ["santé", "médical", "paramédical", "kiné", "bien-être"],
    customerType: "b2b",
    naf: "86.90E",
    problems: [
      { id: "exercises", short: "le suivi des exercices des patients à domicile", statement: "Les kinésithérapeutes ont du mal à s'assurer que leurs patients font leurs exercices entre les séances.", hnQuery: "physical therapy home exercise app adherence", frQuery: "kinésithérapie exercices domicile", archetypes: ["vertical_saas", "info_product"] },
    ],
  },
  {
    id: "driving-schools",
    label: "auto-écoles",
    sector: "Éducation et formation",
    sectorKeywords: ["éducation", "formation", "auto-école", "mobilité"],
    customerType: "b2b",
    naf: "85.53Z",
    problems: [
      { id: "scheduling", short: "la planification des leçons et des moniteurs", statement: "Les auto-écoles gèrent les plannings de leçons et les annulations de façon manuelle et chronophage.", hnQuery: "driving school scheduling software", frQuery: "auto-école planning", archetypes: ["vertical_saas", "productized_service"] },
    ],
  },
  {
    id: "training-orgs",
    label: "organismes de formation",
    sector: "Éducation et formation",
    sectorKeywords: ["éducation", "formation", "enseignement", "e-learning", "qualiopi"],
    customerType: "b2b",
    naf: "85.59A",
    problems: [
      { id: "qualiopi", short: "la préparation et le suivi de la conformité Qualiopi", statement: "Les petits organismes de formation consacrent beaucoup de temps à prouver leur conformité Qualiopi.", hnQuery: "training compliance documentation audit", frQuery: "Qualiopi organismes de formation", archetypes: ["vertical_saas", "productized_service", "info_product"] },
    ],
  },
  {
    id: "real-estate",
    label: "agences immobilières indépendantes",
    sector: "Immobilier",
    sectorKeywords: ["immobilier", "logement", "habitat"],
    customerType: "b2b",
    naf: "68.31Z",
    problems: [
      { id: "listings", short: "la rédaction et la diffusion des annonces", statement: "Les agents immobiliers passent trop de temps à rédiger et diffuser des annonces de qualité.", hnQuery: "real estate listing description generator", frQuery: "annonces immobilières", archetypes: ["ai_automation_service", "vertical_saas"] },
      { id: "dpe", short: "l'anticipation des obligations liées au DPE", statement: "Les agences peinent à conseiller les propriétaires bailleurs sur les interdictions de location liées au DPE.", hnQuery: "energy performance certificate rental ban data", frQuery: "diagnostic de performance énergétique DPE", archetypes: ["data_product", "info_product"] },
    ],
  },
  {
    id: "sports-clubs",
    label: "clubs de sport amateurs",
    sector: "Sport",
    sectorKeywords: ["sport", "association", "loisirs", "bien-être"],
    customerType: "b2b",
    naf: "93.12Z",
    problems: [
      { id: "members", short: "la gestion des adhésions et des paiements", statement: "Les clubs amateurs gèrent adhésions, certificats et cotisations sur des tableurs, avec beaucoup de relances.", hnQuery: "sports club membership management", frQuery: "clubs sportifs licenciés", archetypes: ["vertical_saas", "productized_service"] },
      { id: "sponsors", short: "la recherche de sponsors et de subventions", statement: "Les clubs amateurs manquent de financements faute de méthode pour trouver sponsors locaux et subventions.", hnQuery: "sports club sponsorship small", frQuery: "subventions associations sportives", archetypes: ["info_product", "data_product", "productized_service"] },
    ],
  },
  {
    id: "accountants",
    label: "cabinets d'expertise comptable",
    sector: "Services aux entreprises",
    sectorKeywords: ["services aux entreprises", "comptabilité", "finance", "b2b"],
    customerType: "b2b",
    naf: "69.20Z",
    problems: [
      { id: "documents", short: "la collecte des pièces justificatives auprès des clients", statement: "Les cabinets comptables perdent du temps à réclamer les pièces manquantes à leurs clients TPE.", hnQuery: "accounting firm document collection clients", frQuery: "expertise comptable", archetypes: ["vertical_saas", "ai_automation_service"] },
    ],
  },
  {
    id: "fashion-retail",
    label: "boutiques de prêt-à-porter indépendantes",
    sector: "Commerce de détail",
    sectorKeywords: ["commerce", "mode", "retail", "e-commerce", "habillement"],
    customerType: "b2b",
    naf: "47.71Z",
    problems: [
      { id: "omnichannel", short: "la vente en ligne du stock existant", statement: "Les boutiques indépendantes n'arrivent pas à vendre leur stock en ligne sans y passer leurs soirées.", hnQuery: "independent retailer sell inventory online", frQuery: "commerce de détail habillement", archetypes: ["productized_service", "vertical_saas"] },
    ],
  },
  {
    id: "market-gardeners",
    label: "maraîchers en vente directe",
    sector: "Agriculture et alimentation",
    sectorKeywords: ["agriculture", "alimentation", "circuit court", "bio", "environnement"],
    customerType: "b2b",
    naf: "01.13Z",
    problems: [
      { id: "direct-sales", short: "la vente directe et la gestion des paniers", statement: "Les maraîchers en circuit court gèrent commandes de paniers et points de retrait de façon artisanale.", hnQuery: "farm direct sales csa box software", frQuery: "circuits courts vente directe", archetypes: ["vertical_saas", "local_marketplace"] },
    ],
  },
  {
    id: "holiday-rentals",
    label: "gîtes et locations de vacances",
    sector: "Tourisme",
    sectorKeywords: ["tourisme", "hôtellerie", "voyage", "location", "immobilier"],
    customerType: "b2b",
    naf: "55.20Z",
    problems: [
      { id: "direct-booking", short: "la réservation directe sans commission des plateformes", statement: "Les propriétaires de gîtes dépendent des plateformes et de leurs commissions élevées.", hnQuery: "vacation rental direct booking website", frQuery: "hébergement touristique", archetypes: ["vertical_saas", "productized_service", "info_product"] },
    ],
  },
  {
    id: "home-care",
    label: "structures d'aide à domicile",
    sector: "Services à la personne",
    sectorKeywords: ["services à la personne", "santé", "seniors", "social"],
    customerType: "b2b",
    naf: "88.10A",
    problems: [
      { id: "rota", short: "la planification des intervenants", statement: "Les structures d'aide à domicile peinent à planifier les intervenants avec les absences et les trajets.", hnQuery: "home care scheduling caregivers", frQuery: "aide à domicile", archetypes: ["vertical_saas", "productized_service"] },
    ],
  },
  {
    id: "ecommerce-smb",
    label: "petits e-commerçants",
    sector: "E-commerce",
    sectorKeywords: ["e-commerce", "commerce", "vente en ligne", "retail", "numérique"],
    customerType: "b2b",
    naf: "47.91B",
    problems: [
      { id: "returns", short: "la gestion des retours et du service client", statement: "Les petits e-commerçants sont submergés par les demandes de service client répétitives (livraison, retours).", hnQuery: "small ecommerce customer support automation", frQuery: "vente à distance", archetypes: ["ai_automation_service", "vertical_saas"] },
    ],
  },
  {
    id: "vets",
    label: "cliniques vétérinaires",
    sector: "Animaux",
    sectorKeywords: ["animaux", "vétérinaire", "santé"],
    customerType: "b2b",
    naf: "75.00Z",
    problems: [
      { id: "reminders", short: "les rappels de vaccins et le suivi des clients", statement: "Les cliniques vétérinaires perdent des rendez-vous de rappel faute de relances personnalisées.", hnQuery: "veterinary clinic reminders software", frQuery: "cliniques vétérinaires", archetypes: ["productized_service", "vertical_saas"] },
    ],
  },
  {
    id: "associations",
    label: "associations",
    sector: "Associatif et économie sociale",
    sectorKeywords: ["association", "social", "économie sociale", "culture", "solidaire"],
    customerType: "b2b",
    naf: "94.99Z",
    problems: [
      { id: "grants", short: "la recherche et la rédaction de demandes de subventions", statement: "Les associations passent beaucoup de temps à repérer les appels à projets et à rédiger les demandes de subventions.", hnQuery: "nonprofit grant writing software", frQuery: "subventions associations appels à projets", archetypes: ["data_product", "ai_automation_service", "info_product"] },
    ],
  },
  // ---- B2C segments (market sized with population statistics) ----
  {
    id: "parents",
    label: "parents de collégiens",
    sector: "Éducation et formation",
    sectorKeywords: ["éducation", "école", "famille", "soutien scolaire", "enfants"],
    customerType: "b2c",
    problems: [
      { id: "homework", short: "l'accompagnement des devoirs en mathématiques", statement: "Des parents se sentent démunis pour aider leurs enfants en mathématiques au collège.", hnQuery: "math homework help parents app", frQuery: "soutien scolaire collège", archetypes: ["info_product", "community_membership", "local_service"] },
    ],
  },
  {
    id: "seniors",
    label: "seniors vivant seuls",
    sector: "Services à la personne",
    sectorKeywords: ["seniors", "services à la personne", "santé", "numérique", "social"],
    customerType: "b2c",
    problems: [
      { id: "digital", short: "l'autonomie numérique (démarches en ligne, visio)", statement: "Des seniors sont bloqués par les démarches administratives en ligne et la visioconférence.", hnQuery: "seniors digital literacy help", frQuery: "illectronisme seniors", archetypes: ["local_service", "info_product"] },
    ],
  },
  {
    id: "dog-owners",
    label: "propriétaires de chiens en ville",
    sector: "Animaux",
    sectorKeywords: ["animaux", "chien", "loisirs"],
    customerType: "b2c",
    problems: [
      { id: "walking", short: "la garde et la promenade en semaine", statement: "Les propriétaires de chiens actifs manquent de solutions fiables pour la promenade en journée.", hnQuery: "dog walking marketplace", frQuery: "animaux de compagnie", archetypes: ["local_service", "local_marketplace"] },
      { id: "nutrition", short: "l'alimentation adaptée et les friandises saines", statement: "Des propriétaires cherchent des friandises naturelles adaptées aux chiens sensibles.", hnQuery: "dog treats natural small brand", frQuery: "alimentation animale", archetypes: ["d2c_physical", "niche_media"] },
    ],
  },
  {
    id: "remote-workers",
    label: "télétravailleurs",
    sector: "Travail et productivité",
    sectorKeywords: ["travail", "productivité", "numérique", "bien-être", "télétravail"],
    customerType: "b2c",
    problems: [
      { id: "ergonomics", short: "l'ergonomie du poste de travail à domicile", statement: "Des télétravailleurs souffrent de douleurs liées à un poste de travail mal aménagé.", hnQuery: "home office ergonomics back pain", frQuery: "télétravail", archetypes: ["d2c_physical", "info_product", "local_service"] },
    ],
  },
  {
    id: "renovating-households",
    label: "ménages qui rénovent leur logement",
    sector: "Énergie et habitat",
    sectorKeywords: ["énergie", "habitat", "rénovation", "environnement", "immobilier", "logement"],
    customerType: "b2c",
    problems: [
      { id: "aid-maze", short: "le parcours des aides à la rénovation énergétique", statement: "Des ménages renoncent à rénover faute de comprendre les aides cumulables et les démarches.", hnQuery: "home energy renovation grants confusing", frQuery: "rénovation énergétique aides", archetypes: ["data_product", "info_product", "local_service"] },
    ],
  },
  {
    id: "career-changers",
    label: "actifs en reconversion",
    sector: "Éducation et formation",
    sectorKeywords: ["formation", "emploi", "reconversion", "éducation", "carrière"],
    customerType: "b2c",
    problems: [
      { id: "cpf", short: "le choix d'une formation finançable et utile", statement: "Des actifs en reconversion ont du mal à choisir une formation finançable qui débouche vraiment sur un emploi.", hnQuery: "career change course choice outcomes", frQuery: "formation professionnelle CPF", archetypes: ["data_product", "community_membership", "niche_media"] },
    ],
  },
  {
    id: "runners",
    label: "coureurs amateurs",
    sector: "Sport",
    sectorKeywords: ["sport", "running", "bien-être", "santé", "loisirs"],
    customerType: "b2c",
    problems: [
      { id: "injury", short: "la prévention des blessures et la préparation aux courses", statement: "Des coureurs amateurs se blessent en préparant leur premier semi-marathon faute de plan adapté.", hnQuery: "running injury prevention training plan app", frQuery: "course à pied", archetypes: ["info_product", "community_membership", "niche_media"] },
    ],
  },
];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Segments matching a free-text sector (mode "sector"). Empty if the sector is not covered. */
export function segmentsForSector(sector: string): Segment[] {
  const q = norm(sector);
  const words = q.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  return SEGMENTS.filter((s) => {
    const hay = [s.sector, s.label, ...s.sectorKeywords].map(norm).join(" ");
    return hay.includes(q) || words.some((w) => hay.includes(w));
  });
}

export function segmentsForIdea(idea: string): Segment[] {
  const q = norm(idea);
  return SEGMENTS.filter((s) => [s.label, ...s.sectorKeywords, ...s.problems.map((p) => p.short)].map(norm).some((k) => k.split(/\s+/).some((w) => w.length > 4 && q.includes(w))));
}
