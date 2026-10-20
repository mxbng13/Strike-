// Joueurs SIMULÉS localement (aucun serveur, aucun vrai joueur connecté).
export const PLAYERS = [
  { id: 'p_lyra',  name: 'Lyra_Étoile', level: 7,  champion: 'mira',     wins: 42,  bio: 'Collectionneuse d’arcanes.' },
  { id: 'p_borin', name: 'Borin42',     level: 4,  champion: 'torvin',   wins: 18,  bio: 'Le marteau d’abord, les questions après.' },
  { id: 'p_sefa',  name: 'Sefa',        level: 3,  champion: 'kaela',    wins: 9,   bio: 'Vent arrière toujours.' },
  { id: 'p_kenji', name: 'KenjiNova',   level: 9,  champion: 'nyx',      wins: 77,  bio: 'Main de l’ombre.' },
  { id: 'p_alba',  name: 'Alba',        level: 12, champion: 'solenne',  wins: 130, bio: 'Chasseuse d’aurores.' },
  { id: 'p_mo',    name: 'Mo_le_Brave', level: 2,  champion: 'pip',      wins: 3,   bio: 'Débutant motivé !' },
  { id: 'p_ivy',   name: 'IvyRonce',    level: 5,  champion: 'brindille',wins: 24,  bio: 'Racines profondes.' },
  { id: 'p_zed',   name: 'Zed',         level: 15, champion: 'ozzrah',   wins: 260, bio: 'Le Néant m’appelle.' },
  { id: 'p_nora',  name: 'Nora',        level: 6,  champion: 'kaela',    wins: 31,  bio: 'Archère du dimanche.' },
  { id: 'p_tao',   name: 'TaoFeu',      level: 8,  champion: 'torvin',   wins: 55,  bio: 'Forgeron de victoires.' },
];
export const getPlayer = (id) => PLAYERS.find((p) => p.id === id);
