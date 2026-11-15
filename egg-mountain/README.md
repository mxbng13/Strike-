# 🥚 EGG MOUNTAIN — jeu Roblox

Apporte un œuf intact à Gérard, au sommet d'une montagne géante, pour qu'il prépare la meilleure omelette de l'histoire.

## État : phase 1 (prototype jouable)

| Fonction | État |
|---|---|
| Camp de départ, piédestal aux œufs | ✅ |
| Biome « Forêt des racines » : souches, pont aux planches fragiles, bras rotatif, zone de vent, pente aux rondins | ✅ |
| 3 checkpoints validés par le serveur (dans l'ordre, œuf en main) | ✅ |
| Œuf physique : solidité, fissures visibles, équilibre, chute, rebond, ramassage, posé (touche G) | ✅ |
| Dégâts calculés par le serveur selon la violence des chocs | ✅ |
| Sommet provisoire avec Gérard et livraison | ✅ |
| EGG COINS, XP, niveaux, record de temps | ✅ |
| Sauvegarde DataStore (réessais, sauvegarde auto, fermeture du serveur) | ✅ |
| HUD (coins, niveau, altitude, checkpoint, chrono, état de l'œuf) + notifications | ✅ |
| Cinématique d'introduction de Gérard | ✅ |
| Température, équipements, boutique Robux, 13 autres biomes, cuisine, Battle Pass… | ⏳ phases suivantes |

## Installer dans Roblox Studio (sans rien installer sur le PC)

1. Ouvre une place vide dans Studio.
2. Copie tout `build/1_BuildMap.luau`, colle-le dans la **barre de commandes**, Entrée → la map se construit.
3. Copie tout `build/2_InstallScripts.luau`, colle-le dans la barre de commandes, Entrée → les scripts sont installés.
4. Jouer (F5).

Pour la sauvegarde : publie le jeu, puis *Paramètres du jeu → Sécurité → Autoriser l'accès de Studio aux services API*.

## Avec Rojo (sur un PC perso)

`default.project.json` décrit l'arborescence : `rojo serve` synchronise `src/` avec Studio.
Après toute modification de `src/`, régénérer l'installateur : `python3 tools/make_installer.py`.

## Arborescence

- `src/shared/Config.luau` — tous les réglages d'équilibrage
- `src/server/Main.server.luau` — ascension, checkpoints, livraison, économie
- `src/server/EggSystem.luau` — physique et dégâts de l'œuf (serveur)
- `src/server/ObstacleSystem.luau` — obstacles
- `src/server/DataManager.luau` — sauvegarde
- `src/client/Client.client.luau` — HUD, notifications, cinématique
- `build/` — scripts à coller dans la barre de commandes de Studio
