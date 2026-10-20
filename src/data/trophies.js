// TROPHÉES : gagnés (ou perdus) en combat avec un Striker. Chaque Striker a ses propres trophées, qui
// fixent son palier (data/ranks.js : 500 = Or, 1 000 = Diamant). Ils sont distincts des POINTS DE CLASSEMENT
// du joueur (data/ranked.js : Ruine → Zénith), qui font avancer la route de l'onglet Trophées.
export const TROPHY_RULES = {
  win: 8,     // victoire
  loss: -3,   // défaite (jamais sous 0)
  flee: 0,    // abandon
};
