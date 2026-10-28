# PROGRESS — Business Architect AI

Dernière mise à jour : 2026-10-28. Branche : `claude/business-architect-ai`.

## Jalons
| Jalon | État | Preuve |
|---|---|---|
| M0 Audit & fondations | ✅ | dépôt inspecté (jeu STRIKE existant laissé intact), projet isolé `business-architect/`, TS strict, lint, Vitest, env validé, erreurs typées, logs JSON |
| M1 Auth & persistance | ✅ | 54 tables, migration `drizzle/0000_init.sql`, sessions, rôles, isolation (tests `auth-isolation`) |
| M2 Conversation & profil | ✅ | intake adaptatif, 3 modes, valeurs par défaut tracées, UI chat (tests `intake`, E2E) |
| M3 Recherche & sources | ✅ | 7 connecteurs (4 gratuits actifs, 3 à clé), sources/instantanés/constats, échecs signalés, FinOps (tests `research`, `test:live`) |
| M4 Opportunity Engine | ✅ | exploration, invention, analyse, scoring explicable, sélection, itération, dossier |
| M5 Orchestration & agents | ✅ | 12 agents, graphe de tâches, pg-boss, ContextAssembler, reprises, historique, progression réelle |
| M6 Stratégie & finances | ✅ | charter, modèle économique, moteur financier déterministe (12 tests), 3 scénarios, sensibilité, risques |
| M7 Livrables | ✅ | 20 livrables versionnés, complétude calculée, site + serveur + tests exécutés en sandbox, export ZIP |
| M8 Interface | ✅ | tableau de bord, projet (14 onglets), progression live, livrables (aperçu, versions, diff), approbations, paramètres |
| M9 Gouvernance & fiabilité | ✅ (partiel, voir limites) | L1/L2/L3, approbations admin, audit, budgets/alertes, récupération après crash, concurrence |
| M10 Validation finale | ✅ | E2E Playwright du scénario central réussi ; docs d'installation/déploiement |

## Tests exécutés (dernière exécution)
- `tsc --noEmit` : OK · `eslint .` : OK
- `npm test` : **73/73** (11 fichiers : 6 unitaires, 5 intégration sur PostgreSQL 16 réel)
- `npm run test:live` : **4/4** (API publiques réelles)
- `npm run test:e2e` : **1/1** (Chromium, `next start` + worker pg-boss, vraies API ; ~25 s)
- `scripts/run-scenario.ts` (vraies API) : 35 requêtes réussies, 6 concepts, sélection, 20 livrables, 5 approbations en attente, ~10 s.

## Problèmes détectés et corrigés pendant le développement
- Formulaire soumis en GET avant hydratation React → mot de passe dans l'URL (corrigé : `method="post"` + bouton inactif avant hydratation).
- `scrollIntoView()` renvoyant une Promise utilisée comme cleanup de `useEffect` → crash client (corrigé).
- Course entre complétions parallèles empêchant la clôture d'une phase (corrigé : verrou du run + réconciliation post-commit).
- Faux positif « garantie de revenus » sur l'avertissement légal (détection par phrase avec négation).
- Plafond 10 000 du registre des entreprises : remplacé par un indice de densité départemental (Rhône) + borne nationale.

## Dépendances externes
- **Clé Anthropic** : non disponible dans cet environnement → toutes les exécutions réelles ont tourné en **mode heuristique**.
  Le chemin LLM est implémenté et testé avec un fournisseur scripté, **jamais contre l'API réelle**.
- **Recherche Web payante** (Brave/Tavily/Exa) : non configurée → concurrence directe « non mesurée » (signalé partout).
  Implémentations testées uniquement avec réponses simulées.
- Connecteurs d'exécution externes (hébergement, registrar, e-mail, publicité, paiement) : aucun. Les actions approuvées
  restent à réaliser manuellement (affiché explicitement).

## Variables d'environnement requises
`DATABASE_URL`, `APP_URL`, `APP_ENCRYPTION_KEY` ; optionnelles : `ANTHROPIC_API_KEY`, `AI_MODEL`, `AI_EFFORT`,
`BRAVE_SEARCH_API_KEY`, `TAVILY_API_KEY`, `EXA_API_KEY`, budgets par défaut, `USD_TO_EUR`, `WORKER_CONCURRENCY`, `SANDBOX_DIR`.

## Limites connues
- Qualité en mode heuristique : concepts issus d'un catalogue (25 segments, ~35 problèmes-hypothèses, 10 archétypes) ;
  l'invention ouverte (n'importe quel secteur) requiert le mode LLM. Un secteur hors catalogue est signalé.
- Le chemin LLM n'a pas été évalué qualitativement sur l'API réelle (coûts réels, latence, taux de réparation inconnus).
- Recherche : pas de tendances de recherche (Google Trends n'a pas d'API publique officielle), pas de données SEO,
  pas d'INSEE (clé requise), Wikipédia/GitHub inaccessibles depuis cet environnement.
- `connectors` / `connector_credentials` / `scheduled_actions` / `permissions` (hors règle « deny ») : tables créées mais
  non utilisées par l'UI ; les clés des connecteurs viennent de l'environnement serveur.
- Pas de tâches planifiées récurrentes (pg-boss `schedule`) : seule la récupération périodique tourne dans le worker.
- Phases « Lancement » et « Optimisation » : aucun suivi de résultats réels (nécessite intégrations analytics/paiement).
- Développement produit : le Developer construit le site de lancement + l'API de liste d'attente, pas encore le MVP complet.
- Sécurité : pas de CSP stricte, pas de purge/export RGPD automatisés, pas de 2FA ni réinitialisation de mot de passe,
  pas d'invitation de membres dans l'UI (rôles gérés en base).
- Le budget IA est un contrôle pré-appel (dépassement possible borné par les appels concurrents en vol).
- Pas de tests de charge.
- Interface en thème clair uniquement.

## Prochaines tâches
1. Exécuter le scénario central avec une vraie clé Anthropic ; mesurer coût/latence/qualité ; ajuster prompts et `AI_EFFORT`.
2. Configurer un moteur de recherche Web pour mesurer la concurrence directe.
3. Câbler les identifiants de connecteurs par espace (chiffrés) et un premier connecteur d'exécution (hébergement statique).
4. Developer : génération du MVP (au-delà du site) en mode LLM, avec tests en sandbox.
5. Saisie des résultats réels d'expériences → boucle d'apprentissage (phases 10–11).
6. Invitations de membres, réinitialisation de mot de passe, CSP, export/purge RGPD, tests de charge ciblés.
