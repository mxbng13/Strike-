# Spécification fonctionnelle — Business Architect AI

## Principe
L'IA crée le business. L'utilisateur fournit objectifs, contraintes et budget ; l'**Opportunity Engine** découvre
et invente, le **Business Execution Engine** construit. L'utilisateur n'est jamais obligé de fournir une idée.

## Modes
| Mode | Déclencheur (1re question) | Comportement |
|---|---|---|
| 1 — Autonome (prioritaire) | « Je n'ai pas d'idée » | Exploration multi-secteurs, l'IA choisit |
| 2 — Secteur | « J'ai un secteur en tête » | Secteur = contrainte ; besoin et concept inventés par l'IA |
| 3 — Idée existante | « J'ai déjà une idée à évaluer » | L'idée devient un candidat parmi ≥ 4 alternatives de l'IA ; elle peut être battue |

## Parcours
1. **Intake** (`src/intake/engine.ts`) : ≤ 9 questions courtes (mode, secteur/idée si pertinent, budget, pays, heures/sem.,
   horizon, compétences, exclusions). « Je ne sais pas » ⇒ valeur par défaut explicite (tracée dans `defaultsUsed`).
   Sortie : `UserProfile` (Zod). Résumé puis bouton « Lancer la création ».
2. **Découverte** : `discovery.explore` (directions + recherches réelles) → `discovery.invent` (5–7 concepts distincts).
3. **Évaluation** : `evaluation.market` (preuves, concurrence, raisons d'échec) → `evaluation.select` (grille explicable,
   sélection ; si aucun concept ≥ 55/100 avec une preuve observée ⇒ nouvelle itération ; 2 itérations max par exécution).
4. **Dossier directeur** : `charter.build` (Charter + OpportunityDossier = contrat transmis au moteur d'exécution).
5. **Validation** : `validation.plan` (hypothèses risquées + expériences ; distingue validation documentaire / commerciale).
6. **Conception** : finances, marque, produit, marketing, ventes, opérations.
7. **Construction** : `build.website` (site + serveur liste d'attente + tests exécutés en sandbox).
8. **QA** : `qa.audit` (peut demander une correction automatique unique ou bloquer).
9. **Préparation du lancement** : `launch.plan` + demandes d'approbation L2.
10–11. **Lancement / optimisation** : nécessitent des données réelles et des connecteurs — affichés « En attente » ; aucune
    performance inventée.

## Contrôle utilisateur
Modifier objectifs/budget/contraintes (onglet Paramètres du projet), budget IA du projet et de l'espace, pause/reprise,
« Contester / demander une nouvelle piste » (rejette le choix, nouvelle exploration), consulter les sources, approuver /
refuser les actions L2, comparer les versions d'un livrable (diff ligne à ligne).

## Livrables produits (clé → contenu)
`research-log-N`, `concepts-N`, `market-comparison-N`, `opportunity-decision-N`, `opportunity-dossier`, `project-charter`,
`market-study`, `competitive-analysis`, `validation-plan`, `financial-model`, `financial-projection-csv`, `product-spec`,
`brand-identity`, `marketing-plan`, `sales-plan`, `operations-plan`, `launch-website` (bundle de fichiers, export ZIP),
`website-test-report`, `qa-report`, `launch-plan`. Tous versionnés ; complétude calculée depuis le contenu.

## Règles de vérité
- Aucune source, statistique, URL ou concurrent inventé ; les concurrents en mode LLM doivent citer un `sourceId` existant.
- Les chiffres financiers sont calculés par `src/financial/engine.ts` ; les hypothèses sont étiquetées.
- Les promesses de résultat garanti sont bloquées par le QA.
- Une action approuvée sans connecteur reste « approuvée » avec une note « exécution manuelle » — jamais « exécutée ».
