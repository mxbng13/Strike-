// SERVEUR EN LIGNE (Supabase) : comptes joueurs et sauvegarde dans le cloud.
// Ne mettre ici QUE l'URL du projet et la clé publique « anon / publishable » (faite pour être dans le jeu).
// Jamais la clé « service_role / secret » ni le mot de passe de la base.
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
export const cloudConfigured = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY);

// Adresse publique du jeu : base des liens d'invitation envoyés aux amis.
export const PUBLIC_URL = 'https://mxbng13.github.io/Strike-/';
