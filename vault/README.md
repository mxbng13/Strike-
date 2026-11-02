# VAULT — galerie multimédia privée (iOS)

VAULT est une galerie photo/vidéo **native iOS (Swift / SwiftUI)** qui chiffre réellement chaque média sur
l'appareil, avec un éditeur photo non destructif, un éditeur vidéo, des albums avancés, des souvenirs
automatiques et une recherche locale.

> Ce dossier est indépendant du jeu STRIKE présent à la racine du dépôt.

## Démarrer

```bash
brew install xcodegen
cd vault
xcodegen generate          # crée VAULT.xcodeproj (app + extension de partage + paquet VaultCore)
open VAULT.xcodeproj
```

Dans Xcode : choisir votre équipe (Signing & Capabilities) pour les cibles **VAULT** et **VAULTShare**,
puis adapter si besoin les identifiants (`com.vault.app`, `group.com.vault.app` dans `project.yml`).
iOS 17 minimum. Face ID, l'appareil photo et la suppression dans Photos nécessitent un appareil réel.

Tests du cœur (macOS ou Linux) :

```bash
cd vault/VaultCore && swift test      # 35 tests : crypto, clés, bibliothèque, recherche, souvenirs, synchro, sauvegarde, perf.
```

La CI GitHub (`.github/workflows/vault.yml`) exécute ces tests sous Linux et macOS, puis **compile l'app iOS
et l'extension** avec Xcode pour le simulateur.

## Organisation

```
vault/
  project.yml                 définition du projet Xcode (XcodeGen)
  VaultCore/                  paquet Swift portable (iOS, macOS, Linux → base d'un futur Android)
    Crypto/                   format chiffré VLT1, PBKDF2, emballage de clés, boîte de dépôt X25519, clé de récupération
    Security/                 gestion des clés, tentatives, verrouillage automatique
    Model/ Library/           médias, albums, recettes de retouche, état de la bibliothèque, persistance chiffrée
    Search/ Memories/         moteur de recherche en français, génération des souvenirs
    Insights/ Analysis/       statistiques, nettoyage, dHash, netteté, couleur dominante
    Video/ Editing/           modèle de montage + timeline, filtres
    Sync/ Backup/             synchro E2E (fusion à 3 voies, HLC), archive .vaultbackup
  App/                        application SwiftUI
    Services/                 Keychain/Face ID, session, bibliothèque, import, export, lecture vidéo chiffrée, iCloud
    Editing/                  moteur Core Image, compositeur vidéo AVFoundation, vidéo souvenir
    UI/                       verrouillage, onglets Photos/Albums/Souvenirs/Recherche/Réglages, visionneuse, éditeurs
  ShareExtension/             « Partager › VAULT » (dépôt chiffré, sans accès au coffre)
  docs/                       ARCHITECTURE.md, SECURITY.md, FORMAT.md, SYNC.md, TESTING.md, ROADMAP.md
```

## Fonctionnalités livrées

Voir `docs/ARCHITECTURE.md` pour le détail et `docs/ROADMAP.md` pour ce qui n'est **pas** implémenté.
