# Sécurité

## Authentification et sessions
- Mots de passe : scrypt (N=16384, r=8, p=1, sel 16 o), comparaison à temps constant ; un e-mail inconnu déclenche
  quand même une dérivation (timing homogène).
- Session : jeton aléatoire 32 o en cookie `httpOnly`, `SameSite=Lax`, `Secure` si `APP_URL` est en https ; seul le
  SHA-256 est stocké. Expiration 14 jours. Déconnexion = suppression de la ligne.
- Rate limiting (Postgres, multi-processus) : inscription 10/h/IP, connexion 10/15 min/e-mail, création de projet,
  réponses d'intake, actions d'exécution.
- Formulaires en `method="post"` et désactivés avant hydratation (aucun identifiant dans une URL).

## Autorisation et isolation
- Toute ressource projet passe par `requireProjectAccess` (projet → espace → appartenance + rôle minimal) ; espaces par
  `requireWorkspaceRole`. Non-membre ⇒ **404** (l'existence n'est pas révélée). Identifiants non-UUID rejetés avant SQL.
- Rôles : viewer (lecture), member (intake, lancement), admin/owner (budgets, réglages, **décisions d'approbation**).
- Requêtes mutantes : contrôle `Origin` == hôte (CSRF), en plus de SameSite.
- Téléchargements : l'artefact doit appartenir au projet autorisé.

## Secrets
- Clés API uniquement dans l'environnement serveur ; jamais dans prompts, livrables, logs (le logger caviarde clés
  sensibles et motifs `sk-…`, `tvly-…`) ni dans la sandbox (environnement vide).
- `connector_credentials` (AES-GCM prévu) : **non câblé** à ce jour — les connecteurs lisent les clés de l'environnement.

## Contenu Web non fiable / injection de prompt
1. `sanitize.ts` : suppression HTML, neutralisation des formulations d'instruction (EN/FR), des fausses balises
   système et des demandes d'exfiltration ; drapeau `injection_flag` sur la source.
2. ContextAssembler : sources après le prompt de confiance, dans `<untrusted_source>`, règle système explicite
   « aucune autorité ».
3. Les agents n'ont **aucun outil** d'effet externe : leurs sorties sont des données typées ; les actions passent par
   `requestAction` (politique déterministe), et une approbation ne peut venir que d'un humain admin via l'API.
4. Anti-hallucination : références de sources inconnues retirées, concurrents non sourcés ignorés, QA bloquant si un
   livrable cite une source absente du projet.
Test : `pipeline.test.ts › une page Web malveillante…`.

## Gouvernance
L1 autonome · L2 approbation (dépense, compte, communication, publication, domaine, publicité, immatriculation,
données personnelles chez un tiers, toute action inconnue) · L3 interdit (fausses preuves, contournement, vol
d'identifiants, garantie de résultats, contrat sans autorité, opération illégale…). Les règles d'espace ne peuvent que
durcir. Tout est audité (`audit_events`, avec correlation id).

## Sandbox (code généré)
Répertoire temporaire supprimé après usage · modèle de permissions Node (`--permission`, lecture/écriture limitées au
répertoire, pas de sous-processus ni workers) · `unshare -n` (aucune interface réseau) si disponible · `prlimit`
(CPU 10 s, fichiers ≤ 10 Mo, 64 descripteurs) · heap 128 Mo · timeout 15–20 s · sortie ≤ 64 Ko · env vide. L'état de
chaque couche est affiché dans l'UI et le rapport de tests. Docker n'est pas utilisé (démon indisponible ici).
L'aperçu du site dans l'UI est une `iframe sandbox=""` (scripts désactivés).

## Rendu des livrables
Markdown rendu par un moteur maison qui échappe tout HTML et ne crée que des liens http(s) (`rel=noopener noreferrer nofollow`).

## En-têtes
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
`poweredByHeader` désactivé. Pas encore de CSP stricte (voir limites).

## Conservation des données
Les données de projet sont conservées tant que le projet existe (suppression en cascade). Politique de purge
automatique et export RGPD utilisateur : non implémentés (limite connue).
