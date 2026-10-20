// COMBAT : une seule arène (Map1) et deux modes, Duel (1 contre 1) et Duo (2 contre 2), gagnés au nombre
// d'éliminations choisi avant le combat (arena/arenaGame.js : ARENA_FORMATS, KILL_TARGETS).
// Le choix est enregistré dans la sauvegarde (battlePrefs).
export const DEFAULT_BATTLE_PREFS = { arenaFormat: 'duel', arenaKills: 5 };
