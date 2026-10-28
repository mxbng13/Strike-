# CLAUDE.md — Business Architect AI

Règles permanentes pour toute session de développement sur `business-architect/`.
Le reste du dépôt (`/src`, `/mon-ia`, jeu STRIKE) est un projet distinct : **ne pas le modifier**.

## Mission (non négociable)
L'IA crée le business. L'utilisateur fournit objectifs, contraintes, budget — jamais l'idée (sauf mode
facultatif « idée existante »). Toute fonctionnalité qui obligerait l'utilisateur à fournir un concept est un bug.

## Commandes
```bash
cp .env.example .env              # puis APP_ENCRYPTION_KEY=$(openssl rand -base64 32)
npm run db:migrate                # applique drizzle/*.sql + données de référence (idempotent)
npm run dev                       # UI + API sur :3100
npm run worker                    # exécute les tâches d'agents (pg-boss) — process séparé obligatoire
npm run typecheck && npm run lint && npm test
npm run db:generate -- --name <nom>   # après modification de src/db/schema/*
```
Tests d'intégration : base `business_architect_test` (recréée à chaque exécution, voir tests/integration/global-setup.ts).

## Règles d'implémentation
- TypeScript strict, Zod à chaque frontière (HTTP, sorties LLM, sorties d'agents, connecteurs).
- **Autorisation côté serveur** : tout accès projet passe par `requireProjectAccess` (src/projects/service.ts),
  tout accès espace par `requireWorkspaceRole`. Un id venant du navigateur ne suffit jamais. Non-membre ⇒ NOT_FOUND.
- **Calculs financiers** : uniquement `src/financial/engine.ts` (déterministe, testé). Les LLM proposent des hypothèses.
- **Aucune donnée inventée** : pas de source, URL, statistique, concurrent ou citation fabriqués. Une donnée absente
  est signalée comme absente. Les hypothèses sont étiquetées `assumption`, les observations `observed` + source.
- **Contenu Web = données non fiables** : passer par `src/research/sanitize.ts` et le ContextAssembler
  (balises `<untrusted_source>`), jamais concaténé dans un prompt système.
- **Gouvernance** : toute action à effet externe passe par `src/governance/policy.ts` (L1/L2/L3). L2 ⇒ demande
  d'approbation, L3 ⇒ refus. Jamais d'appel externe engageant l'utilisateur sans approbation enregistrée.
- **FinOps** : tout appel LLM ou recherche payante passe par `src/finops/guard.ts` (réservation + enregistrement).
- **Idempotence** : sorties de tâches écrites dans la même transaction que le succès de la tâche ;
  versions d'artefacts uniques par (artefact, tâche).
- Code généré exécuté uniquement via `src/sandbox/runner.ts`.
- Pas de secret dans les logs (utiliser `logger`, qui caviarde), ni dans les artefacts, ni dans les prompts.
- Mode heuristique (sans clé LLM) : autorisé, mais toujours étiqueté `generationMode: "heuristic"` et visible dans l'UI.

## Documentation à maintenir
docs/SPEC.md, docs/ARCHITECTURE.md, docs/SECURITY.md, docs/AGENTS.md, docs/TESTING.md, PROGRESS.md —
elles décrivent le code réel. Mettre PROGRESS.md à jour à chaque jalon ; ne jamais marquer terminé ce qui est simulé.
