# Architecture

Projet autonome dans `business-architect/` (le reste du dépôt est un autre projet).

## Stack
Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind 4 · Zod 4 · PostgreSQL 16 · Drizzle ORM (migrations
versionnées dans `drizzle/`) · pg-boss 12 (file de tâches dans le schéma `pgboss`) · SDK Anthropic (`@anthropic-ai/sdk`).
Composants UI écrits à la main (pas de shadcn : le CLI dépend d'un registre réseau ; mêmes principes : accessibles, réutilisables).

## Processus
```
navigateur ──HTTP──> Next.js (pages serveur + /api/*)  ──enqueue(taskId)──> pg-boss ──> worker (npm run worker)
                            │                                                     │
                            └──────────── PostgreSQL (source de vérité) ◄─────────┘
```
Le web ne fait qu'**enfiler** ; le worker exécute. Fermer la page n'arrête rien ; la progression est relue depuis la base.

## Modules (`src/`)
| Module | Rôle |
|---|---|
| `config/env.ts` | configuration validée (Zod), secrets uniquement côté serveur |
| `db/` | schéma Drizzle (54 tables, 7 fichiers), client, migration + données de référence |
| `auth/` | scrypt, sessions en base (jeton haché SHA-256, cookie httpOnly SameSite=Lax) |
| `workspaces/`, `projects/` | rôles (owner/admin/member/viewer), `requireWorkspaceRole`, `requireProjectAccess`, cycle de vie |
| `intake/` | conversation adaptative + parseurs déterministes → `UserProfile` |
| `research/` | `ResearchProvider` + 7 connecteurs, assainissement, persistance sources/instantanés/constats |
| `ai/` | `LlmProvider`, `AnthropicProvider` (sorties structurées Zod, fallbacks serveur, réparation), tarifs, résolution du mode |
| `finops/guard.ts` | budgets (espace/mois, projet, plafond par tâche), contrôle pré-appel, alertes, usage |
| `discovery/` | archétypes de modèles, segments (codes NAF vérifiés), scoring explicable, types du contrat |
| `agents/` | 12 agents + framework (`AgentContext`/`AgentResult`) |
| `orchestration/` | plan (graphe de tâches), orchestrateur, ContextAssembler, file, worker |
| `financial/engine.ts` | moteur financier déterministe |
| `artifacts/` | livrables versionnés, complétude, revues, export ZIP |
| `sandbox/runner.ts` | exécution isolée du code généré |
| `governance/` | politique L1/L2/L3, approbations, exécuteurs |
| `audit/` | journal d'audit (caviardé) |
| `lib/` | erreurs typées, logger JSON + correlation id, rate limit Postgres, helpers HTTP |
| `app/`, `components/` | pages, routes API, composants UI, rendu Markdown sûr, graphique de trésorerie |

## Graphe de tâches (`orchestration/plan.ts`)
```
explore → invent → market → select ──(sélection)──> charter ─┬─> validation ─> product ─┐
   ▲                          │                               ├─> finance ──┬───────────┼─> marketing ─┐
   └──── nouvelle itération ──┘ (score insuffisant)           └─> brand ────┼─> sales ──┼─> build ─────┼─> qa ─> launch
                                                                            └─ ops <────┘              ┘
```
- Les tâches d'exécution ne sont créées **qu'après** la sélection (le moteur d'exécution reçoit un OpportunityDossier).
- Dépendances exprimées par *type* et résolues vers la tâche non annulée de génération la plus élevée.
- Correction QA : les tâches concernées et leurs dépendants sont remplacés par une nouvelle génération (historique conservé).

## Exécution d'une tâche (`orchestrator.ts`)
1. Réservation atomique (`UPDATE … WHERE status IN (queued, ready) RETURNING`) : une double livraison est sans effet.
2. Résolution du mode (`llm` / `heuristic`), création d'un `agent_run`, assemblage du contexte (digest enregistré).
3. Heartbeat toutes les 10 s ; exécution de l'agent (recherche via `runResearch`, LLM via `ctx.llm` contrôlé par FinOps).
4. **Une seule transaction** : écritures métier, livrables, demandes d'approbation, sortie, évaluation, succès de la tâche,
   contrôle (replan/redo/block), jalons, fin de run. Verrou `FOR UPDATE` sur le run + réconciliation après commit.
5. Échecs : budget ⇒ `paused_budget` + projet en pause ; dépendance manquante ⇒ `blocked` ; sinon nouvel essai avec
   backoff (3 tentatives), puis `failed` + projet bloqué (reprise manuelle possible).
6. Récupération (`recoverStale`, au démarrage du worker puis chaque minute) : tâches `running` sans heartbeat depuis 2 min
   et tâches `queued` orphelines.

## Contrat Opportunity → Execution
`project_charters.content.dossier` : `{ contractVersion, concept, decision, evidence[], assumptions[], constraints, objectives[], risks[] }`.

## ContextAssembler (`orchestration/context.ts`)
Par type de tâche, n'inclut que : profil, itération, opportunité retenue, charter, sorties amont listées dans `TASK_NEEDS`,
budget, ≤ 40 sources. Limite 80 000 caractères (sections tronquées signalées). Sources rendues en
`<untrusted_source id=… url=… flagged=…>` après le prompt de confiance. Digest (version, sorties, ids de sources,
taille, troncature) enregistré dans `agent_runs.context_digest`.

## Mode heuristique vs LLM
Sans `ANTHROPIC_API_KEY` (ou mode « heuristique »), les agents génératifs utilisent des règles déterministes et un
catalogue d'exploration (`discovery/segments.ts`, `archetypes.ts`), alimentés par des recherches réelles. Tout est étiqueté
`heuristic` dans la base et l'UI. Avec une clé, chaque agent génératif demande au modèle une sortie conforme au **même**
schéma Zod ; scoring, finances, QA restent déterministes.

## Décisions
- Auth maison (scrypt + sessions en base) plutôt qu'une lib : contrôle total, aucune dépendance réseau.
- pg-boss pour le transport, table `agent_tasks` comme source de vérité (statuts riches, idempotence).
- Rate limit en Postgres (multi-processus).
- Next 15.5 (et non 16) : API stabilisées connues ; TypeScript 5.9.
