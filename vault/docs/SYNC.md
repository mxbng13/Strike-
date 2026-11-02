# Sauvegarde et synchronisation

## Trois modes
1. **Local** (par défaut) : tout reste sur l'appareil ; le dossier du coffre est exclu des sauvegardes
   iCloud de l'appareil (la clé étant « cet appareil uniquement », une telle sauvegarde serait illisible).
2. **Sauvegarde** : Réglages › Sauvegarde chiffrée → un fichier `.vaultbackup` (médias toujours chiffrés,
   clé emballée par une phrase secrète ≥ 12 caractères) enregistré où vous voulez via Fichiers. Restauration
   depuis l'écran d'accueil d'une installation neuve.
3. **Synchronisation** : base **privée CloudKit** du compte iCloud de l'utilisateur.

## Fournisseur : CloudKit (Apple)
- **Coût** : aucun frais d'infrastructure pour l'éditeur ; les données comptent dans le quota iCloud de
  l'utilisateur (5 Go gratuits, puis iCloud+). Il faut un compte Apple Developer (99 $/an) pour publier
  l'app et créer le conteneur.
- **Limites** : la taille des fichiers dépend du quota de l'utilisateur ; il y a des limites de requêtes par
  seconde (on envoie par lots de 200) ; le compte iCloud doit être connecté.
- **Confidentialité** : VAULT chiffre tout avant l'envoi (enregistrements AES-GCM avec la MK, médias déjà en
  VLT1). Apple ne voit que des identifiants aléatoires, des tailles et des dates de modification.

## Activer
1. Dans Xcode, cible VAULT › Signing & Capabilities › + iCloud › cocher **CloudKit**, créer le conteneur
   `iCloud.<votre.bundle>`.
2. Dans `project.yml`, renseigner `VaultCloudKitContainer: iCloud.<votre.bundle>` puis `xcodegen generate`.
3. Dans la console CloudKit, déployer le schéma (types `VaultRecord`, `VaultBlob`, `VaultEscrow` ; créés
   automatiquement en développement au premier envoi).

Sans cette configuration, l'interface indique « Mode local » : rien n'est simulé.

## Moteur (VaultCore/Sync)
- Chaque média, album, projet, préférence est un enregistrement `type:UUID` chiffré.
- **Base de référence** (dernière version synchronisée, chiffrée localement) → détection des
  changements locaux ; jeton de changements serveur → changements distants.
- **Conflits** : fusion à trois voies champ par champ ; les listes (médias d'un album) combinent les ajouts
  et retraits des deux côtés ; pour les autres champs, la modification la plus récente l'emporte (horloge
  logique hybride). Modifié ici et supprimé ailleurs → la modification est conservée. Les conflits résolus
  sont listés dans Réglages.
- **Nouvel appareil** : l'enregistrement `VaultEscrow` contient la MK emballée par la clé de récupération
  (120 bits). Il est inexploitable sans elle.
- Testé sous Linux avec un serveur en mémoire simulant deux appareils (`SyncTests`). Le transport CloudKit
  est compilé en CI mais **n'a pas pu être testé ici** (il faut un compte développeur et un appareil).
