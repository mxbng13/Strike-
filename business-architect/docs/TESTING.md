# Stratégie de tests

| Commande | Contenu | Pré-requis |
|---|---|---|
| `npm run test:unit` | moteur financier, scoring/QA, assainissement, connecteurs (fetch simulé), sandbox réelle, rendu Markdown | — |
| `npm run test:integration` | Postgres réel (`business_architect_test`, recréée), orchestration complète en mode inline | PostgreSQL |
| `npm test` | unit + intégration | PostgreSQL |
| `npm run test:live` | appels réels aux API publiques (registre, HN, Eurostat, data.gouv) | réseau |
| `npm run test:e2e` | Playwright : navigateur réel, `next start` + `npm run worker`, vraies API, vrai pg-boss | serveur + worker lancés |

## Couverture des scénarios obligatoires
| Scénario | Test |
|---|---|
| Création sans idée (1 000 €, 10 h, France) | `pipeline.test.ts › scénario central` (10 assertions) + `e2e/central.e2e.mjs` |
| Secteur imposé | `pipeline › secteur imposé` |
| Idée existante challengée | `pipeline › idée existante` |
| Connecteur en échec | `research.test.ts`, `pipeline › un connecteur en échec` |
| Budget IA atteint | `research.test.ts` (recherche payante), `governance › FinOps` (pause, reprise) |
| Tâche en échec reprise sans doublon | `pipeline › une tâche qui échoue` |
| Accès au projet d'un autre | `auth-isolation.test.ts`, E2E (401 anonyme) |
| Page Web malveillante | `pipeline › une page Web malveillante`, `sanitize.test.ts` |
| Calcul financier incohérent | `governance › détecte un calcul financier incohérent`, `financial-engine.test.ts` |
| Livrable incomplet | `governance › un livrable incomplet`, `qa-rules.test.ts` |
| Publication soumise à autorisation | `governance › L1/L2/L3`, `› approuver une publication`, E2E |
| Redémarrage serveur | `pipeline › après un redémarrage` (recoverStale + double livraison) |
| Fermeture de la page | E2E : le worker exécute indépendamment ; progression relue via `/progress` |
| Chemin LLM | `governance › chemin LLM` (fournisseur scripté : anti-hallucination, diversité, coûts) |
| Concurrence | `pipeline › concurrence` (garde de non-régression ; la course n'est pas reproductible à coup sûr) |

## Doubles de test
- `tests/integration/fixtures.ts` : réponses aux formats réels des API publiques (formats vérifiés par `test:live`).
- `tests/integration/scripted-llm.ts` : `LlmProvider` scripté. Aucun test n'appelle l'API Anthropic (pas de clé ici).

## Évaluation de la qualité IA
Les sorties LLM sont re-validées par Zod (une réparation), les références de sources vérifiées, la diversité contrôlée,
et chaque tâche enregistre une évaluation (`agent_evaluations`). Une évaluation qualitative sur clé réelle reste à faire.
