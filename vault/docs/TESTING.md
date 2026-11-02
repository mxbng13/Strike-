# Tests et vérifications

## Automatisés (`swift test` dans VaultCore, Linux et macOS)
| Domaine | Ce qui est vérifié |
|---|---|
| Crypto | vecteurs RFC 7914 pour PBKDF2 ; aller-retour de 0 o à 70 Ko ; vidéo de 24 Mo en flux avec SHA-256 et lectures aléatoires ; mauvaise clé, bit modifié, troncature à une frontière de bloc, permutation de blocs ; rotation de clé ; boîte de dépôt X25519 |
| Clés | création, déverrouillage, code jamais présent dans le stockage, délais après erreurs, recul d'horloge, effacement après N essais, changement de code, clé de récupération, copie biométrique, codes faibles, verrouillage auto |
| Bibliothèque | ajout/déplacement/retrait/réorganisation, collections et cycles, albums protégés/masqués invisibles dans la galerie, la recherche et les stats, corbeille, albums intelligents, historique des retouches, chronologie, persistance chiffrée, doublons à l'import |
| Fonctions | analyseur de recherche (FR), moteur de recherche, dHash/netteté/couleur, souvenirs (voyage, grand jour, ce jour-là, anniversaire, saison, modifications), statistiques et nettoyage, timeline vidéo (transitions, intervalles, vitesse, fractionnement), sauvegarde/restauration et archive tronquée |
| Synchro | deux appareils : médias + fichiers, fusion concurrente d'un album, suppressions, modification contre suppression, serveur ne voyant que du chiffré |
| Performance | 10 000 médias : enregistrement + relecture de l'index chiffré, chronologie, recherche, souvenirs, nettoyage |

## Compilation iOS (CI macOS)
`xcodebuild` compile l'app et l'extension pour le simulateur à chaque push.

## Non vérifiable dans cet environnement
Le développement s'est fait dans un conteneur Linux, sans Mac ni iPhone. Ces points demandent un essai sur
appareil (liste de recette) : Face ID ; import depuis Photos de vidéos volumineuses ; caméra ; extension de
partage ; rendu visuel des filtres et du compositeur ; export 4K ; CloudKit ; fluidité avec des milliers de
miniatures ; Instruments (fuites, temps CPU).

### Recette manuelle conseillée
1. Créer le coffre (6 chiffres), noter la clé, activer Face ID ; verrouiller/déverrouiller ; 5 codes faux → délai.
2. Importer 200 photos et une vidéo de plus de 2 Go depuis Photos ; vérifier la progression et les doublons.
3. Créer un album protégé, y déplacer des médias, vérifier qu'ils disparaissent de Photos, de la recherche et des souvenirs.
4. Retoucher une photo (filtre + recadrage + flou d'arrière-plan), comparer avant/après, restaurer une version.
5. Monter 3 vidéos avec transition, texte et musique ; exporter en 1080p puis 4K.
6. Sauvegarder en `.vaultbackup`, réinstaller, restaurer.
