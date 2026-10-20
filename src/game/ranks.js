// Palier d'un Striker (Basique / Or / Diamant) : calculé à partir des trophées gagnés avec CE Striker.
import { tierOfTrophies } from '../data/ranks.js';
import { strikerTrophies } from './trophies.js';
import { save } from '../save/storage.js';

/** Palier (Basique / Or / Diamant) du Striker, selon ses trophées. */
export const rankFor = (id, s = save.get()) => tierOfTrophies(strikerTrophies(id, s));
