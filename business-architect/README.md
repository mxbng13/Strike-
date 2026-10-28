# Business Architect AI

Application web où **l'IA découvre, conçoit et construit un business** à partir des objectifs et contraintes de
l'utilisateur — sans qu'il ait besoin d'idée. Voir `docs/SPEC.md` (fonctionnel), `docs/ARCHITECTURE.md`,
`docs/SECURITY.md`, `docs/AGENTS.md`, `docs/TESTING.md`, et `PROGRESS.md` (état réel).

## Installation (développement)
Prérequis : Node.js ≥ 22, PostgreSQL ≥ 14, Linux recommandé pour la sandbox (`unshare`, `prlimit`).

```bash
cd business-architect
npm install
createuser -P ba && createdb -O ba business_architect && createdb -O ba business_architect_test   # (en tant que postgres)
cp .env.example .env
sed -i "s|^APP_ENCRYPTION_KEY=.*|APP_ENCRYPTION_KEY=$(openssl rand -base64 32)|" .env
npm run db:migrate          # migrations + données de référence (idempotent)
npm run dev                 # http://localhost:3100
npm run worker              # dans un 2e terminal : exécute les agents (OBLIGATOIRE)
```

Scénario central en ligne de commande (sans UI, vraies API) : `npx tsx scripts/run-scenario.ts 1000 10 France`.

## Configuration
| Variable | Rôle | Obligatoire |
|---|---|---|
| `DATABASE_URL` | PostgreSQL | oui |
| `APP_URL` | URL publique (cookie `Secure` si https) | oui en production |
| `APP_ENCRYPTION_KEY` | 32 o base64 (réservée au chiffrement des identifiants de connecteurs) | recommandé |
| `ANTHROPIC_API_KEY` | active la génération par IA ; sans elle : mode heuristique étiqueté | non |
| `AI_MODEL`, `AI_EFFORT` | modèle (défaut `claude-opus-5-5`) et niveau d'effort | non |
| `BRAVE_SEARCH_API_KEY` / `TAVILY_API_KEY` / `EXA_API_KEY` | recherche Web (concurrence directe, signaux Web) — payant, conditions à vérifier | non |
| `DEFAULT_WORKSPACE_MONTHLY_AI_BUDGET_EUR`, `DEFAULT_PROJECT_AI_BUDGET_EUR` | budgets IA par défaut | non |
| `USD_TO_EUR` | taux utilisé pour estimer les coûts | non (0,92) |
| `WORKER_CONCURRENCY` | tâches simultanées par worker | non (3) |

Connecteurs gratuits actifs sans clé : registre des entreprises (api.gouv.fr), data.gouv.fr, Eurostat, Hacker News (Algolia).

## Production
```bash
npm ci && npm run build && npm run db:migrate
npm run start            # processus web (derrière un reverse proxy HTTPS)
npm run worker           # 1..N processus worker (supervisés : systemd, PM2, conteneur)
```
- Le worker applique les migrations au démarrage et récupère les tâches interrompues.
- Plusieurs workers peuvent tourner en parallèle (réservation atomique des tâches, pg-boss).
- `GET /api/health` vérifie la base.
- Sauvegarder PostgreSQL (toutes les données, y compris la file pg-boss, y résident).

## Tests
`npm run check` (typecheck + lint + unit + intégration) · `npm run test:live` · `npm run test:e2e` (serveur + worker lancés).
