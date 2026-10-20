# STRIKE — jeu mobile 3D de combat et de collection de Strikers

Prototype **web** (Three.js + Vite), pensé pour téléphone en portrait. Ce n'est pas une application iOS/Android native :
c'est un jeu qui tourne dans le navigateur mobile (et qui pourra plus tard être empaqueté avec Capacitor, par exemple).

## Lancer

```bash
npm install
npm run dev        # http://localhost:5173  (aussi accessible depuis un téléphone sur le même Wi-Fi via l'IP affichée)
npm run build      # version optimisée dans dist/
```

## Organisation

```
src/
  main.js                       point d'entrée : relie sauvegarde, scènes 3D et interface
  assets/background.jpg         image de fond (remplacer ce fichier pour changer de fond)
  characters/models/claude.js   modèle 3D détaillé du Claude
  render/stage.js               écran principal : personnage seul sur un cercle noir, fond transparent
  render/environment.js         renderer + décor de l'arène de combat
  render/battleScene.js         arène de combat 3D
  render/portraits.js           vignettes générées à partir des modèles 3D
  characters/characterFactory.js  17 modèles 3D procéduraux (gabarits, oreilles, queues, ailes, accessoires, armes)
  data/boxes.js                 LES 3 BOX : prix, probabilités, box gratuite, conversion des doublons
  data/                         personnages, raretés, objets, compétences, joueurs simulés
  game/boxService.js            achat, box gratuite, ouverture (frontière à déplacer côté serveur plus tard)
  game/battleEngine.js          règles du combat + IA
  game/progression.js           monnaie, niveaux, XP, statistiques
  save/storage.js               sauvegarde LOCALE centralisée (localStorage)
  ui/hud.js, ui/currency.js     écran principal, compteurs de pièces et diamants
  ui/boxArt.js                  illustrations des 3 box
  ui/screens/                   box (MES BOX), boxOpening, shop, collection, friends, battle
tests/boxes.test.mjs            tests de la logique des box (npm test)
```

## Contenu

- **Écran principal** : fond personnalisé, pièces et diamants en haut à gauche (bouton + vers la boutique),
  personnage seul sur un cercle noir (respiration, rotation au doigt, saut au toucher), badge sur BOX.
- **MES BOX**, deux onglets :
  - **Gratuites** : une box normale toutes les 5 heures, jusqu'à 5 en stock (le compteur s'arrête à 5 et
    repart dès qu'on en ouvre une). Compte à rebours réel, conservé après fermeture du jeu.
  - **Achetées** : les box achetées dans la boutique, regroupées (x2, x3…) avec un bouton OUVRIR.
- **Solde de test** : à chaque ouverture du jeu, au moins 100 000 pièces et 1 000 diamants (TEST_BALANCE dans src/data/boxes.js, mettre null pour l'enlever).
- **Boutique** : uniquement des box et des objets (aucun achat de personnage).
- **3 box** : normale (300 pièces), rare (1 200 pièces), légendaire (120 diamants). Probabilités :

  | Rareté     | Normale | Rare | Légendaire |
  |------------|---------|------|------------|
  | Commun     | 65 %    | 25 % | 5 %        |
  | Rare       | 25 %    | 45 % | 20 %       |
  | Épique     | 8 %     | 23 % | 35 %       |
  | Légendaire | 1,8 %   | 6 %  | 30 %       |
  | Mythique   | 0,2 %   | 1 %  | 10 %       |

- **Ouverture** : chute, secousses (plus longues si rare), couvercle qui saute, lumière de la rareté,
  personnage, carte avec nom + rareté, « Ouvrir encore ». Doublons convertis en pièces
  (50 / 120 / 300 / 800 / 2 000). Résultat enregistré AVANT l'animation : rien n'est perdu ni dupliqué.
- **COLLECTION** : 17 personnages, progression x / 17, filtre par rareté, fiche détaillée, sélection.
  Les inconnus restent des silhouettes « ??? ».
- **Claude** (seul Striker jouable pour l'instant ; les autres sont dans data/charactersArchive.js) (Épique, Lumière) : offert et équipé. Modèle 3D dédié
  (characters/models/claude.js) construit d'après les illustrations de référence : proportions relevées sur
  l'image, chevelure en mèches, masque rouge avec sourcils, yeux qui clignent, costume (revers, chemise, cravate,
  pochette, poches, coutures, tissu texturé), poings, chaussures en cuir à lacets, dos détaillé (couture, fente,
  nuque). Rangs : costume / cheveux / chaussures en or ou en cristal. Aucune image n'est utilisée dans le jeu
  (hors image de fond) : vignettes et écrans de récompense sont des rendus du modèle 3D.
- **Fiche personnage** : le même modèle 3D qu'en jeu, qu'on fait tourner à 360° au doigt (render/characterViewer.js),
  avec la rareté en texte seul centrée dessous (ÉPIQUE, LÉGENDAIRE…), sans étoiles.
- **Rangs** (data/ranks.js), pour chaque personnage : Basique 0-49 pts, Or 50-99 pts, Diamant 100 pts et +.
  Victoire +10, défaite −3, doublon en box +15. Or = tenue dorée + stats +5 %, Diamant = tenue en cristal + stats +10 %.
  Fiche de chaque personnage : rang actuel, progression, aperçu des 3 tenues, bouton de test « +25 pts ».
- **Box** : toujours des pièces + un Striker pas encore possédé (jamais de doublon) ou des points d'XP.
- **XP** (bouton à gauche, au-dessus de STRIKERS) : l'XP gagnée s'accumule dans une réserve ; on choisit
  le Striker et la quantité à lui donner. Niveau des Strikers : 1 à 10, +6 % de stats par niveau.
- **COMBAT** et **AMIS** (joueurs simulés) : inchangés (le combat donne maintenant des points de rang).

Sauvegarde : locale à ce navigateur, sans synchronisation entre appareils.
Console : `__game.save.reset()` remet la progression à zéro.

## Mise à jour : XP, niveaux, paliers, boutique, fusils

- **Barre latérale** : XP (logo XP), STRIKER (silhouette de combattant), ARMES.
- **Réserve d'XP commune** (save.xpPool) : combats, coffres et boutique. Indépendante du classement (save.rankPoints).
- **Niveaux des Strikers** : coûts dans `data/strikerLevels.js` (100, 110, 130… puis +18 %/niveau, max 30).
  On paie le coût du niveau suivant ; rien n'est débité si l'XP manque.
- **Paliers** dans `data/ranks.js` : Or au niveau 10, Diamant au niveau 20 (animation au passage).
- **Coffres** : `data/rewards.js` = 7 catégories (XP, Pièces actives ; Fragments, Jetons, Objets d'amélioration,
  Cartes de Striker, Récompenses rares préparées mais désactivées). Probabilités des Strikers inchangées.
- **Boutique** : Box, Armes, XP (contre pièces), Pièces (argent réel : `game/payments.js`, aucun crédit sans
  paiement validé), Skins (vide, `data/skins.js`). Offres dans `data/shopOffers.js`. Onglet Objets retiré.
- **Armes** : 3 fusils (assaut, pompe, précision), modélisés en 3D (`characters/weaponModels.js`), achetés en
  boutique, améliorés avec la réserve d'XP, visibles dans la main du Striker (accueil, fiche, combat).

## Mise à jour : profil, trophées, amis, coffres, diamants

- **Écran d'accueil** : trophées (haut centre), amis puis profil (haut droite), boutique (bas centre).
- **Profil** (`ui/screens/profile.js`, `game/profile.js`, `data/profile.js`) : avatar (8 avatars intégrés),
  nom validé (3 à 16 caractères, caractères et mots interdits), trophées, rang compétitif (`data/competitive.js`,
  basé sur l'XP de classement), victoires/défaites, Strikers, niveau du compte, identifiant joueur.
- **Trophées** (`data/trophies.js`) : victoire +8, défaite −3 ; comptés une seule fois par combat ;
  route de 10 paliers avec récompenses à récupérer une fois.
- **Amis** (`game/social.js`) : interface prête, serveur requis (aucun joueur simulé).
- **Coffres** (`data/rewards.js` → BOX_LOOT) : 3 à 5 types par coffre parmi XP, pièces, Strikers,
  skins de personnages, skins d'armes ; déjà possédé = converti en pièces ; historique des 50 dernières ouvertures.
- **Skins** (`data/skins.js`) : 3 skins de Claude (costume), 3 skins d'armes (camouflage, doré, néon), à équiper
  dans la fiche du Striker et dans ARMES.
- **Diamants** : packs sous les packs de pièces (`data/shopOffers.js` → GEM_PACKS), crédités uniquement après
  paiement validé (`game/payments.js`).
