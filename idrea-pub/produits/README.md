# IDREA — 5 publicités TikTok produits

Même style que la pub bonnet en satin : 1080 × 1920, 30 i/s, environ 30 s, voix Rémy, sous-titres en bas, accroche visible dès la première image, produits modélisés en 3D, fin avec le logo IDREA.

| Dossier | Produit (boutique idrea.fr) | Durée | Vidéo |
|---|---|---|---|
| `patchs/` | Patchs nez points noirs | 28,7 s | `patchs/livrables/idrea_patchs.mp4` |
| `guasha/` | Rouleau & gua sha – massage du visage | 32,5 s | `guasha/livrables/idrea_guasha.mp4` |
| `tondeuse/` | Coupe-poils nez & oreilles rechargeable | 29,6 s | `tondeuse/livrables/idrea_tondeuse.mp4` |
| `glace/` | Rouleau de massage en glace | 27,4 s | `glace/livrables/idrea_glace.mp4` |
| `langue/` | Gratte-langue avec étui | 28,4 s | `langue/livrables/idrea_langue.mp4` |

Chaque dossier `livrables/` contient aussi les sous-titres `.srt`, la voix off (une piste par scène) et une image de couverture.

## Structure de chaque pub

1. **Accroche** (dès l'image 0) : la question sur le problème, en gros, sur une salle de bain en 3D, avec un impact sonore et la musique qui démarre directement.
2. **Le problème** : le titre et des puces rouges qui apparaissent sur les mots de la voix off.
3. **La solution** : le produit en 3D qui tourne (ou se balance s'il est plat), sur un fond studio coloré avec un reflet au sol, et ses points forts.
4. **La routine** : le produit posé sur le comptoir en marbre (3 cadrages), avec une checklist qui reprend le mode d'emploi de la fiche produit.
5. **IDREA** : logo, slogan, le produit, le bouton et « Lien en bio ».

## Avant / après (patchs)

La pub des patchs montre une carte AVANT / APRÈS (`patchs/assets/avant_apres.jpg`, fournie par IDREA) au moment où la voix dit « il retire une partie des impuretés », avec la mention « Photo d'illustration – résultats variables selon les peaux ». Avant diffusion, vérifiez les droits d'utilisation de la photo et les règles publicitaires de TikTok sur les avant / après cosmétiques. Pour la retirer, supprimez la clé `avant_apres` dans `patchs/config.json`.

## Textes

Les scripts (`*/config.json`) reprennent les fiches produits de la boutique, sans aller plus loin : pas de promesse anti-rides ou liftante pour le gua sha, « retire une partie des impuretés » pour les patchs, fréquences et précautions de la fiche (1 à 2 fois par semaine, 1 à 2 min par zone, « sans forcer »…).

## Les produits en 3D

Ils sont modélisés dans `../3d/produits3d.js` d'après les photos de la boutique (`refs/`) : moule à glace cannelé et dôme de glace, rouleau et gua sha en jade avec monture dorée, coupe-poils gris métal avec écran « 99 % », gratte-langue inox et étui vert, patchs en feutre noir. Les coloris choisis sont ceux des photos (vert, noir). Pour un autre coloris, changez la couleur dans `produits3d.js`.

## Régénérer

```bash
cd ../3d && ./rendre_produits.sh                 # rendus 3D des 5 produits (≈ 25 min)
cd ../produits
python3 ../voix_off.py glace/config.json glace/build   # voix off d'un produit (après modification du texte)
python3 pub.py glace --apercu 1 12 19 25        # aperçus
./tout_rendre.sh                                # les 5 vidéos (ou : ./tout_rendre.sh glace)
```

Le lien boutique s'affiche si la variable `IDREA_LIEN` est définie, sinon « Lien en bio ».
