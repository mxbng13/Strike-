# Architecture de VAULT

## Choix techniques

| Besoin | Choix | Pourquoi |
|---|---|---|
| Interface | SwiftUI (iOS 17) + UIKit ponctuel (zoom, caméra, lecteur) | natif, animations et conventions iOS |
| Chiffrement | CryptoKit (AES-256-GCM, HKDF, X25519), CommonCrypto (PBKDF2) | API système auditées ; swift-crypto (même API) sous Linux |
| Secrets | Keychain `WhenUnlockedThisDeviceOnly`, `SecAccessControl .biometryCurrentSet` | jamais sauvegardés ni synchronisés, invalidés si Face ID change |
| Base de données | index `LibraryState` (JSON) chiffré en VLT1, écriture atomique différée | SwiftData/Core Data stockeraient les métadonnées (dates, lieux, noms d'albums) **en clair** |
| Retouche photo | Core Image (GPU/Metal) + Vision | rendu temps réel, segmentation du sujet sur l'appareil |
| Montage vidéo | AVFoundation : `AVMutableComposition` + compositeur `AVVideoCompositing` personnalisé | transitions, filtres, textes rendus image par image |
| Recherche visuelle | Vision `VNClassifyImageRequest`, **opt-in**, locale | aucune image ne quitte l'appareil |
| Synchro | moteur maison + CloudKit (base privée) | chiffrement de bout en bout, aucun serveur à opérer |

**Base de données.** L'index est gardé en mémoire et réécrit chiffré (~0,7 s pour 10 000 médias sur un PC
Linux de CI, mesuré par le test de performance ; plus rapide sur iPhone grâce à l'accélération AES). Au-delà
d'environ 50 000 médias, il faudra passer à SQLite chiffré (SQLCipher) : l'interface `LibraryStore` est
isolée pour ce changement.

## Couches

```
SwiftUI (UI/*)  ──►  Services (@MainActor) ──►  VaultCore (pur Swift, testé)
                      VaultSession              VaultKeyManager, EncryptedFile, LibraryState,
                      MediaLibrary              SearchEngine, MemoryGenerator, SyncEngine, BackupArchive…
                      PhotoRenderer / VideoComposer (Core Image / AVFoundation)
```

Toute la logique métier est dans **VaultCore**, qui ne dépend ni d'UIKit ni de SwiftUI : c'est ce qui
permet de la tester sous Linux et de préparer Android (portage en Kotlin en suivant `FORMAT.md`, ou
Swift sur Android).

## Flux principaux

- **Déverrouillage.** Le code → PBKDF2 (600 000 itérations) → HKDF avec un secret de l'appareil → ouvre la
  clé maîtresse (AES-GCM). Avec Face ID, la clé est lue dans le Keychain après une évaluation biométrique.
  La clé n'existe qu'en mémoire ; au verrouillage, on la libère avec les caches, et l'espace temporaire est effacé.
- **Import.** Photothèque (PhotosPicker, format d'origine, chargement un par un), Fichiers, appareil photo,
  extension de partage. Extraction des métadonnées (EXIF/GPS/vidéo), miniature, dHash, netteté, couleur, puis
  chiffrement **en flux** (mémoire constante, vidéos de plusieurs Go) avec calcul SHA-256 pour les doublons.
- **Affichage.** Miniatures déchiffrées en mémoire (NSCache). Les photos sont décodées à la taille de l'écran.
  Les vidéos sont lues **directement depuis le fichier chiffré** via `AVAssetResourceLoaderDelegate`
  (déchiffrement à la demande des blocs de 256 Ko).
- **Retouche.** La recette (`EditRecipe`) est enregistrée dans l'index ; le rendu pleine résolution (HEIC) est
  chiffré dans `renders/`. L'original n'est jamais modifié. L'historique conserve les 30 dernières versions.
- **Montage.** Les sources sont déchiffrées dans un espace temporaire protégé (AVFoundation ne sait pas
  composer depuis un chargeur personnalisé de façon fiable), puis effacées à la fermeture ou au verrouillage.
  Le projet est sauvegardé (chiffré) à chaque modification.

## Fonctionnalités et état

Toutes les fonctions listées ci-dessous sont implémentées dans le code (pas de maquette) :

- Verrouillage : code 4/6 chiffres, Face ID/Touch ID, changement de code, verrouillage auto (délai) et en
  arrière-plan, délais croissants, effacement optionnel après 10 erreurs, clé de récupération, animation
  d'ouverture, rideau de confidentialité dans le sélecteur d'apps.
- Galerie : années / mois / jours / tout, filtres (photos, vidéos, favoris), grille 2–7 colonnes (pincement),
  3 styles, sélection multiple (exporter, album, déplacer, favori, supprimer, créer un montage).
- Albums : nom, description, couverture, couleur, icône, ordre, tri, collections imbriquées, albums
  intelligents (vidéos, photos, favoris, modifiés/ajoutés récemment, volumineux, panoramas, captures,
  localisés), albums **protégés** et **masqués**, corbeille 30 jours.
- Visionneuse : plein écran, zoom, défilement, glisser pour fermer, infos techniques, légende, carte sur
  demande, « au même endroit », lecture vidéo (AVPlayerViewController, ±10 s, plein écran, vitesse).
- Éditeur photo : 15 réglages, 14 filtres originaux à intensité réglable, recadrage libre/formats, rotation,
  miroirs, redressement, perspective, correcteur ponctuel, ajustements locaux radiaux, flou d'arrière-plan
  (Vision), correction auto, avant/après (appui long), annuler/rétablir, réinitialisation, historique.
- Éditeur vidéo : découpe, fractionnement, réorganisation, duplication, vitesse 0,25×–4×, volume, filtres,
  couleurs, 4 transitions, textes/titres, musique importée (fondus, atténuation), formats 16:9, 9:16, 1:1,
  4:3, 21:9, export 720p/1080p/4K (selon l'appareil), projets sauvegardés.
- Souvenirs : voyages, moments, grands jours, week-ends, saisons, « ce jour-là », anniversaires ;
  renommer, retirer des médias, écarter, mettre en avant, diaporama, vidéo souvenir, enregistrement en album.
- Recherche : années, mois, jours, périodes relatives, saisons, types, formats/codecs, couleurs, favoris,
  captures, panoramas, modifiés, volumineux, albums, légendes, noms de fichiers, appareil ; recherche
  visuelle locale facultative ; résultats limités aux albums déverrouillés.
- Réglages : sécurité, confidentialité, mode discret, aperçus de notifications masqués, thème, accent,
  grille, ordre des onglets, statistiques (graphiques), nettoyage intelligent, sauvegarde, synchro, effacement.
