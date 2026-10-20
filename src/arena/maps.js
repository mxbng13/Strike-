// Plan de l'arène (une seule carte : Map1). Chaque carte est décrite par sa moitié haute (côté ennemi) et sa rangée
// centrale : la moitié basse est obtenue par symétrie centrale, donc les deux camps sont à égalité.
// Légende : . sol   - chemin   B buisson   W mur   C caisse   R rocher   w eau   E départ ennemi
// `bonus` : cases où apparaissent les bonus à ramasser (colonne, rangée), symétriques eux aussi.
const mirror = (top, middle) => [...top, middle, ...[...top].reverse().map((r) => [...r].reverse().join('').replace('E', 'P'))];

export const ARENA_MAPS = {
  map1: {
    id: 'map1', name: 'Map1', title: 'Prairie', theme: 'meadow', color: '#5cbf4a',
    desc: 'Herbe, murs de pierre et grands buissons. Une allée centrale et des abris sur les côtés.',
    layout: mirror([
      'BBB......---......RBB',
      'BB.......-E-.......BB',
      '...CC....---....CC...',
      '...C.....---.....C...',
      '.......WWW-WWW.......',
      '.BBB......-......BBB.',
      '.BBB..R...-...R..BBB.',
      '......WW..-..WW......',
      'W.....W...-...W.....W',
      'W..BB.....-.....BB..W',
      'W..BB..CC---CC..BB..W',
      '...BB...-----...BB...',
      '........-BBB-........',
      '..RR....-BBB-....RR..',
      '.WWW....-----....WWW.',
    ], 'BB...C...-R-...C...BB'),
    bonus: [[10, 13], [10, 17], [2, 15], [18, 15]],
  },
};
export const ARENA_MAP_LIST = Object.values(ARENA_MAPS);
