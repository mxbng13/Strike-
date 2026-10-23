# Vernissage Noir

Jeu de collection d'œuvres d'art réelles, dans le navigateur.

- **6 074 œuvres réelles** avec leurs vraies images : chefs-d'œuvre célèbres (Wikipédia / Wikimedia Commons),
  The Metropolitan Museum of Art et The Cleveland Museum of Art (Open Access).
- **Carte du monde** zoomable (molette, glisser, pincer) : aucun musée n'existe au départ, vous touchez la carte pour bâtir
  le vôtre n'importe où ; 40 collectionneurs rivaux ont fait de même, éparpillés sur tous les continents.
- **4 menus** : Musée (murs, protections, agrandir), Collection, Caisses (caisses à ouvrir et enchères en direct), Défis.
- **Guide pas à pas** en haut de l'écran, avec une récompense à chaque étape.
- **Défis** : 3 manches, un thème par manche, le gagnant garde une œuvre de l'autre. Les rivaux défient aussi.
- **Copies** de vos œuvres, à accrocher ou à vendre.

## Lancer

```bash
npm run dev      # puis ouvrir http://localhost:5173/musee/
```

N'importe quel serveur de fichiers statiques convient aussi (`python3 -m http.server` dans ce dossier).
La partie est sauvegardée dans le navigateur (localStorage).

## Données

`node musee/tools/build-catalog.mjs` reconstruit `data/catalog.json` (liste des chefs-d'œuvre : `tools/famous.txt`).
`data/land.json` et `data/borders.json` viennent de Natural Earth (world-atlas).
