# Agents — rôles et contrats

Chaque agent est une fonction `AgentHandler(ctx) → AgentResult` (`src/agents/framework.ts`). Il reçoit un contexte
assemblé (`TASK_NEEDS`), peut appeler `ctx.research` (connecteurs réels, FinOps) et `ctx.llm` (sortie Zod), et renvoie :
`output` typé, `persist(tx)` (écritures métier dans la transaction de succès), `artifacts`, `actions` (→ gouvernance),
`evaluation` (critères de réussite) et `control` (`replan` / `redo` / `block`). Les agents n'ont aucun accès direct au
monde extérieur. Registre : `src/agents/registry.ts` (missions, limites, critères — affichés dans l'UI).

| # | Agent | Tâche(s) | Sortie / persistance | Mode sans LLM | Contrôles |
|---|---|---|---|---|---|
| 1 | Opportunity Researcher | `discovery.explore` | `ExploreOutput` (directions, signaux observés, rapport connecteurs) ; `research-log-N` | sélection diversifiée dans le catalogue (≥ 4 secteurs), seed = projet+itération | directions déjà explorées / rejetées exclues ; rapport d'échec des connecteurs |
| 2 | Business Inventor | `discovery.invent` | 5–7 `Concept` → `opportunity_candidates` ; `concepts-N` | combinaison problème × archétype filtrée par contraintes dures, sélection gloutonne diversifiée | LLM : direction connue, sources existantes, ≥ 3 archétypes et directions, sinon rejet |
| 3 | Market Analyst | `evaluation.market`, `validation.plan` | preuves (observé/hypothèse), concurrents sourcés, `evidence_assessments`, `market_research` ; plan de validation | raisons d'échec par archétype ; concurrence « non mesurée » sans moteur Web | concurrents LLM sans `sourceId` valide ignorés |
| 4 | Business Strategist | `evaluation.select`, `charter.build` | `OpportunityDecision`, décision tracée, statut/rang/scores ; Charter + OpportunityDossier, risques, modèle économique | scoring déterministe (les deux modes) ; charter par gabarit | seuil 55/100 + ≥ 1 preuve observée ; `replan` ; `block` si aucune option ne respecte les contraintes |
| 5 | Financial Analyst | `finance.model` | hypothèses étiquetées, 3 scénarios, projections mensuelles, modèle + CSV | hypothèses par archétype et profil | calculs exclusivement par `financial/engine.ts` |
| 6 | Product Architect | `product.spec` | cahier des charges MVP | gabarit logiciel / service | ≥ 1 fonctionnalité MUST |
| 7 | Developer | `build.website` | bundle (site, serveur liste d'attente, tests, README) + rapport de tests | textes dérivés de la marque et des offres | tests exécutés en sandbox ; échec ⇒ tâche en erreur |
| 8 | Brand Designer | `brand.identity` | noms, nom retenu, palette (contraste AA calculé), messages | noms construits sur les mots du concept | homonymes exacts vérifiés au registre des entreprises (FR) |
| 9 | Marketing Strategist | `marketing.plan`, `launch.plan` | canaux, SEO, calendrier, expériences ; plan de lancement + 4–5 demandes L2 | gabarits B2B/B2C | ≥ 3 expériences mesurables ; rien n'est envoyé/dépensé |
| 10 | Sales & Growth | `sales.plan` | offres, tests de prix, script, objections, entonnoir, e-mails préparés | gabarits | prix = hypothèses |
| 11 | Operations Manager | `ops.plan` | procédures, outils « à étudier », obligations légales à vérifier (portails officiels), continuité | gabarits + règles sectorielles | aucun fournisseur engagé |
| 12 | Quality & Risk Auditor | `qa.audit` | rapport, revues par livrable, verdict | déterministe | recalcul financier, complétude, sources, promesses garanties, cohérence marque/prix/site, sécurité du code ; `redo` (une fois) puis `block` |

Coordination : l'orchestrateur définit les tâches (`plan.ts`), transmet le contexte minimal, gère les dépendances,
évite les doublons (clé unique par run, réservation atomique), réconcilie via le QA (redo/blocage) et met à jour l'état
du projet. Une tâche = un agent = un type de sortie distinct.
