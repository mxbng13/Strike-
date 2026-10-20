// Profil du joueur : avatars disponibles et règles du nom.

// Avatars intégrés au jeu (aucun accès aux photos du téléphone). `bg` = fond, `fg` = silhouette/icône.
export const AVATARS = [
  { id: 'defaut', name: 'Par défaut', bg: '#9aa0aa', fg: '#2b2e35', shape: 'person' },
  { id: 'striker', name: 'Striker', bg: '#6a35d8', fg: '#150c33', shape: 'fighter' },
  { id: 'eclair', name: 'Éclair', bg: '#1f8fd6', fg: '#ffe36b', shape: 'bolt' },
  { id: 'flamme', name: 'Flamme', bg: '#d8451c', fg: '#ffd36b', shape: 'flame' },
  { id: 'couronne', name: 'Couronne', bg: '#2a2d48', fg: '#ffc83d', shape: 'crown' },
  { id: 'masque', name: 'Masque', bg: '#f3bf9a', fg: '#e1222c', shape: 'mask' },
  { id: 'cible', name: 'Cible', bg: '#17a58f', fg: '#0b2a24', shape: 'target' },
  { id: 'etoile', name: 'Étoile', bg: '#ff3d7f', fg: '#fff3f8', shape: 'star' },
];
export const DEFAULT_AVATAR = 'defaut';
export const getAvatar = (id) => AVATARS.find((a) => a.id === id) ?? AVATARS[0];

export const NAME_RULES = { min: 3, max: 16 };
// Mots interdits (liste de base, à compléter). Comparaison sans accents ni majuscules.
export const BANNED_WORDS = ['merde', 'putain', 'connard', 'connasse', 'salope', 'encule', 'pute', 'batard', 'nazi', 'hitler', 'fuck', 'shit', 'bitch', 'nigger', 'pd'];
