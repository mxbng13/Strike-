# ENTOUR — les services entre voisins

ENTOUR met en relation des particuliers qui ont besoin d'un coup de main (baby-sitting, courses, bricolage, jardin, déménagement… ou n'importe quelle demande libre) avec des personnes disponibles autour d'eux.

> Publier → les voisins pertinents sont prévenus → ils acceptent, proposent un prix ou posent une question → le demandeur compare et choisit → conversation → paiement sécurisé → mission → évaluations mutuelles.

Application **mobile-first** (PWA installable), utilisable aussi sur tablette et ordinateur, en français.

---

## Démarrer en local

Prérequis : Node.js 20+ et PostgreSQL 14+ (extensions standard `cube`, `earthdistance`, `pg_trgm`).

```bash
cd entour
npm install
cp .env.example .env.local          # puis renseigner AUTH_SECRET (openssl rand -hex 32)

# Base de données (rôle avec droit de créer les extensions, ou extensions créées au préalable par un superutilisateur)
createdb entour
npm run db:setup                    # migrations + catégories, badges et paramètres par défaut

npm run dev                         # http://localhost:3000
```

Optionnel :

```bash
npm run db:seed-demo                # 12 comptes et 14 demandes de DÉMONSTRATION autour de Lyon (refusé en production)
npm run db:purge-demo               # supprime toutes les données de démonstration
npm run admin:grant -- vous@exemple.fr super_admin   # donne un rôle d'administration à un compte existant
```

Comptes de démonstration (mot de passe `demo-entour-2026`) : `camille.durand@demo.entour.invalid` (intervenante vérifiée), `julie.bernard@demo.entour.invalid` (demandeuse). Les comptes et annonces de démo sont marqués « démonstration » dans l'interface et exclus des statistiques d'administration par défaut ; aucun avis, note ou transaction n'est fabriqué.

### Tests

```bash
npm test                            # 28 tests unitaires (diffusion, modération, prix, frais, assistant, géo, fichiers)
DISABLE_RATE_LIMIT=1 npm run dev    # dans un autre terminal
npm run test:e2e                    # parcours complet de bout en bout contre le serveur et la base réels
npm run lint                        # vérification TypeScript
npm run build                       # build de production
```

Le test de bout en bout (`tests/e2e/flow.test.ts`, 14 étapes) couvre : inscription et refus des mineurs, vérification e-mail et téléphone, publication avec floutage de l'adresse, notification des offreurs, recherche par rayon et par zone de carte, candidatures et contrôle des catégories sensibles, négociation de prix, **deux acceptations simultanées sur une mission à une place (une seule réussit)**, messagerie (réponse, réaction, accusé de lecture, avertissement anti-arnaque, isolement des conversations), paiement simulé, démarrage / fin / confirmation / versement, évaluations (refusées aux non-participants), historique, signalement, blocage, droits d'administration et journal en ajout seul, mise en attente d'une annonce suspecte.

---

## Variables d'environnement

| Variable | Rôle | Sans valeur |
|---|---|---|
| `DATABASE_URL` | PostgreSQL | obligatoire |
| `AUTH_SECRET` | secret applicatif | obligatoire |
| `APP_URL` | URL publique (liens des e-mails, retours de paiement) | `http://localhost:3000` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | paiements Stripe Connect | **mode simulation** : aucun argent réel, chaque opération est marquée SIMULATION |
| `ANTHROPIC_API_KEY` | assistant de rédaction et traduction par Claude | assistant local à base de règles ; traduction indisponible (message explicite) |
| `RESEND_API_KEY`, `EMAIL_FROM` | e-mails transactionnels | e-mails écrits dans la console (dev uniquement) |
| `SMS_PROVIDER` | vérification du téléphone | code écrit dans la console (dev uniquement) — brancher un fournisseur dans `src/lib/messaging-providers.ts` |
| `STORAGE_DRIVER=s3`, `S3_*` | stockage des fichiers compatible S3 | dossier local `./uploads` |
| `NEXT_PUBLIC_MAP_STYLE_URL` | style de carte MapLibre | OpenFreeMap (gratuit, sans clé) |
| `CRON_SECRET` | protège `/api/cron` | tâches planifiées désactivées |

**État des intégrations** : les modes simulation / local / console ont été testés. Les branchements Stripe Connect, Claude, Resend et S3 sont écrits selon la documentation des fournisseurs mais **n'ont pas été testés avec de vraies clés** dans cet environnement : à valider en préproduction.

### Tâches planifiées

```
*/5 * * * *  curl -H "Authorization: Bearer $CRON_SECRET" https://votre-domaine/api/cron              # expirations, rappels 1 h avant, abonnements
0 18 * * *   curl -H "Authorization: Bearer $CRON_SECRET" "https://votre-domaine/api/cron?task=digest" # résumé quotidien
```

---

## Architecture

| Couche | Choix | Pourquoi |
|---|---|---|
| Application | **Next.js 15** (App Router), React 19, TypeScript | une seule base de code pour l'interface et l'API, déployable partout |
| Style | **Tailwind CSS 4**, composants maison, **Framer Motion** | identité propre, pas d'interface générique ; animations discrètes |
| Données | **PostgreSQL + Drizzle ORM** | relationnel strict, migrations versionnées, requêtes typées |
| Géographie | extensions **earthdistance/cube** + index GiST | recherches par rayon indexées, disponibles chez tous les hébergeurs Postgres (PostGIS non nécessaire pour des rayons ≤ 50 km) |
| Temps réel | **PostgreSQL LISTEN/NOTIFY → Server-Sent Events** | messages, frappe, accusés de lecture, notifications sans Redis ni serveur WebSocket à opérer ; fonctionne avec plusieurs instances |
| Carte | **MapLibre GL** + OpenFreeMap, regroupement des marqueurs | open source, sans clé ni coût par chargement |
| Géocodage | **Base Adresse Nationale** (api-adresse.data.gouv.fr) | service public, gratuit, précis pour la France |
| Paiements | **Stripe Connect** (Checkout, capture différée, destination charges) | les fonds ne transitent jamais par un compte d'ENTOUR |
| IA | **Claude** (sortie structurée validée par Zod) + repli local | rédaction d'annonces en une phrase, traduction |
| Auth | sessions en base (cookie httpOnly, SameSite=Lax), mots de passe **scrypt** | pas de dépendance externe, révocation immédiate |

```
src/
  app/              pages (App Router) et routes d'API (src/app/api/**)
    (app)/          espace connecté : accueil, carte, publier, messages, profil…
    (public)/       pages consultables sans compte : fiche mission partagée, profil public
    admin/          back-office
  components/       interface (ui.tsx = système de design)
  db/               schéma Drizzle (40 tables), catalogue initial
  lib/              logique pure et testée (matching, modération, prix, géo, frais…) + infrastructure
  server/           services métier (une fonction = une règle, appelée par les routes)
drizzle/            migrations SQL (dont index géographiques, triggers de sécurité)
scripts/            migrations, données de base, démo, administration
tests/              tests unitaires et de bout en bout
```

### Points clés de conception

- **Vie privée géographique** : l'adresse exacte n'est jamais renvoyée par l'API à un tiers. La carte et les distances utilisent une position floutée de 150 à 400 m (déterministe par annonce) ; l'adresse est révélée uniquement à l'intervenant retenu. Le partage de position en conversation est temporaire et les coordonnées ne sont plus transmises après expiration.
- **Pas de double attribution** : verrou de ligne `SELECT … FOR UPDATE` dans la transaction d'acceptation, plus un trigger PostgreSQL de capacité en dernier rempart (testé avec deux requêtes simultanées).
- **Diffusion intelligente** (`src/lib/matching.ts`) : distance (rayon de l'annonce ∩ rayon du membre), catégorie et compétences, disponibilités, préférences (catégories en silencieux, ne pas déranger, plafond d'alertes par heure), réputation (moyenne bayésienne pour ne pas pénaliser les nouveaux), missions similaires réalisées, fiabilité, vérifications exigées par la catégorie, blocages.
- **Avis infalsifiables** : uniquement entre participants d'une mission terminée, une fois, sous 30 jours ; critères détaillés ; signalement → modération.
- **Badges automatiques** à règles déclaratives (JSON) administrables ; points de fidélité et niveaux ; parrainage récompensé à la première mission.
- **Journal d'administration en ajout seul** (trigger qui interdit UPDATE/DELETE) ; date de naissance immuable (trigger) pour empêcher le contournement de la majorité.
- **Fichiers** : type MIME autorisé + vérification de la signature binaire, taille limitée, noms aléatoires, pièces jointes servies uniquement aux membres de la conversation.
- **Sécurité HTTP** : validation Zod de toutes les entrées, contrôle d'origine (CSRF) sur les requêtes modifiantes, limitation de débit en base, en-têtes de sécurité, aucune clé secrète côté client.

---

## Fonctionnalités livrées

**Cœur (phase 1)** : inscription/connexion, vérification e-mail, mot de passe oublié, onboarding (zone, intention, compétences), 51 catégories administrables + « Autre service », publication en moins d'une minute (photos, rayon 1-50 km, immédiat/aujourd'hui/demain/programmé/récurrent, prix fixe/négociable/offre, nombre de personnes, urgence, compétences, visibilité publique/invitation/groupe, demande groupée), accueil personnalisé, carte interactive (clusters, prix sur les marqueurs, filtres, recherche de ville, géolocalisation, bascule liste), explorer avec filtres et pagination, candidatures (accepter le prix, proposer un tarif, message, expérience, liste d'attente), comparaison des candidats (fiches + tableau, tri), acceptation sécurisée, messagerie complète (temps réel, photos, vidéos, documents, messages vocaux, réponses, réactions, statuts envoyé/distribué/lu, indicateur de saisie, partage de position temporaire, recherche, archivage, sourdine, suppression de son affichage, blocage, signalement, traduction), encadré mission avec actions rapides, notifications temps réel et historique, profils et réputation, signalements, back-office.

**Marketplace (phase 2)** : paiement sécurisé (Stripe Connect ou simulation), frais configurables, annulations/remboursements, litiges avec gel des fonds et décision motivée, historique revenus/dépenses avec graphique, négociation de prix et d'horaire tracée dans la conversation, calendrier, disponibilités hebdomadaires, missions récurrentes (occurrence suivante créée automatiquement, intervenant précédent prioritaire), vérifications téléphone/identité/références, 17 badges dont saisonniers, favoris et personnes de confiance, filtres avancés, statistiques personnelles (taux de réalisation, ponctualité).

**Intelligence & communauté (phase 3)** : assistant de rédaction (Claude ou local), correction automatique, suggestion de prix (historique réel ≥ 5 missions, sinon repères), estimation de durée, détection de fraude et d'incohérences de budget, avertissements anti-arnaque dans la messagerie, missions recommandées, « disponible maintenant », « besoin d'aide immédiatement », voisins disponibles, groupes de quartier et thématiques, fil local, remerciements publics (réservés aux personnes ayant réellement travaillé ensemble), abonnements entre membres, classements (données réelles), parrainage, programme de fidélité à niveaux.

**Commercial (phase 4)** : abonnements Plus/Pro configurables (simulation ; Stripe Billing à brancher), mise en avant d'annonces, tableau de rentabilité (réel vs simulé), analyse offre/demande par zone avec recommandations, zones de lancement configurables, annonces générales ciblées.

**Administration** : tableau de bord, utilisateurs (recherche, fiche, suspension, bannissement, réactivation, rôles), modération des annonces et file d'attente automatique, vérifications d'identité et références, signalements avec aperçu du contenu, litiges, catégories et badges, paramètres (frais, limites, modération, fidélité…), communication, finances, journaux. Rôles **super-administrateur / modérateur / support** avec matrice de permissions côté serveur.

### Non livré / à faire avant la production

- Notifications **push** natives (Web Push / VAPID) : les notifications sont en temps réel dans l'application et par e-mail pour les événements importants ; le push mobile reste à brancher (table `push_subscriptions` prête).
- **Stripe Billing** pour les abonnements payants réels, **Stripe Identity** pour la vérification d'identité automatisée (aujourd'hui : examen par un modérateur habilité).
- Fournisseur **SMS** de production.
- Rapport annuel **DAC7** (export des montants par utilisateur) : les données sont en base, l'export reste à écrire.
- Compléter les mentions légales (`[…]` dans `src/app/legal/[slug]/page.tsx`) et faire relire CGU / politique de confidentialité par un juriste.
- Sauvegardes : activer les sauvegardes automatiques et le PITR de l'hébergeur PostgreSQL.

Voir aussi [`docs/STRATEGIE.md`](docs/STRATEGIE.md) : modèle économique, lancement, conformité.
