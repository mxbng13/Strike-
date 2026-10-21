// COMPTE JOUEUR ET SAUVEGARDE EN LIGNE (Supabase).
// On se connecte avec son NOM DE JOUEUR et un mot de passe (pas d'e-mail). N'importe qui peut créer un compte ;
// le nom est unique. Le compte relie la partie au serveur : la sauvegarde est envoyée dans le cloud (table
// « saves », chacun ne lit et n'écrit que la sienne) et retrouvée sur n'importe quel téléphone ; le profil public
// (nom, photo par défaut, trophées) sert à la recherche d'amis. La session reste enregistrée sur l'appareil.
// La sauvegarde locale reste la référence pendant le jeu ; rien n'est effacé : avant de remplacer la partie
// de l'appareil par celle du compte, une copie de secours est gardée.
import { supabase as sb } from './supabase.js';
import { save, BACKUP_KEY } from '../save/storage.js';
import { CHARACTERS } from '../data/characters.js';

export const accountAvailable = () => !!sb();

// Le serveur d'identification attend une adresse : on en fabrique une à partir du nom (jamais utilisée pour
// envoyer de mail : domaine réservé « example.com », confirmation par e-mail désactivée sur le projet).
export const USERNAME_RULES = { min: 3, max: 16, re: /^[A-Za-z0-9_]+$/ };
export const usernameEmail = (name) => `${name.toLowerCase()}@joueurs.strike.example.com`;
export function checkUsername(name) {
  const n = String(name ?? '').trim();
  if (n.length < USERNAME_RULES.min || n.length > USERNAME_RULES.max) return { ok: false, error: `Le nom doit faire ${USERNAME_RULES.min} à ${USERNAME_RULES.max} caractères.` };
  if (!USERNAME_RULES.re.test(n)) return { ok: false, error: 'Lettres sans accent, chiffres et _ uniquement.' };
  return { ok: true, value: n };
}

let user = null, status = 'off', lastSync = null, pending = null, timer = null, unsub = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(accountState()));
export const onAccount = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const usernameOf = (u) => u?.user_metadata?.username ?? u?.email?.split('@')[0] ?? '';
export const accountState = () => ({ available: accountAvailable(), user: user ? { id: user.id, username: usernameOf(user) } : null, status, lastSync });
export const currentUser = () => (user ? { id: user.id, username: usernameOf(user) } : null);

/** Résumé lisible d'une sauvegarde (pour choisir entre celle de l'appareil et celle du compte). */
export function saveSummary(s) {
  return { trophies: s?.ranked?.points ?? 0, coins: s?.coins ?? 0, gems: s?.gems ?? 0, strikers: CHARACTERS.filter((c) => s?.owned?.includes(c.id)).length, name: s?.playerName ?? '' };
}

const FR = {
  'Invalid login credentials': 'Nom de joueur ou mot de passe incorrect.',
  'User already registered': 'Ce nom de joueur est déjà pris : choisis-en un autre (ou connecte-toi si c’est le tien).',
  'Database error saving new user': 'Ce nom de joueur est déjà pris : choisis-en un autre.',
  'Email not confirmed': 'Le serveur demande une confirmation par e-mail : désactive « Confirm email » dans Supabase.',
  'Password should be at least 6 characters.': 'Le mot de passe doit faire au moins 6 caractères.',
};
const msg = (e) => FR[e?.message] ?? (/fetch|network/i.test(e?.message ?? '') ? 'Pas de connexion Internet.' : e?.message || 'Erreur inconnue.');

async function fetchCloud() {
  const { data, error } = await sb().from('saves').select('data, updated_at').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return data;
}
/** Profil public (recherche d'amis) : nom affiché, photo (dessin, pas la photo perso), trophées. */
async function pushProfile() {
  const s = save.get();
  await sb().from('profiles').update({ name: s.playerName, avatar: s.avatar === 'photo' ? 'defaut' : s.avatar, trophies: s.ranked?.points ?? 0, updated_at: new Date().toISOString() }).eq('id', user.id);
}
async function pushCloud() {
  if (!user) return;
  clearTimeout(timer); timer = null;
  status = 'syncing'; emit();
  const { error } = await sb().from('saves').upsert({ user_id: user.id, data: save.get(), updated_at: new Date().toISOString() });
  await pushProfile().catch(() => {});
  status = error ? 'error' : 'synced';
  if (!error) lastSync = Date.now();
  emit();
}
/** Envoi automatique (regroupé) après chaque changement de la sauvegarde. */
function watch() {
  unsub?.();
  unsub = save.subscribe(() => { if (!user || pending) return; clearTimeout(timer); timer = setTimeout(pushCloud, 4000); });
}
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && timer) pushCloud(); });

/**
 * Après connexion : compare la partie de l'appareil et celle du compte.
 * - pas de partie dans le compte : on y envoie celle de l'appareil ;
 * - sinon : on renvoie { choice: { local, cloud } } et le joueur choisit (resolveChoice).
 */
async function afterLogin(fresh) {
  status = 'syncing'; emit();
  save.update({ account: usernameOf(user) });   // le compte connecté est noté dans la sauvegarde
  const row = await fetchCloud();
  if (!row?.data) { await pushCloud(); watch(); return { ok: true, uploaded: true }; }
  const same = JSON.stringify({ ...row.data, account: null }) === JSON.stringify({ ...save.get(), account: null });
  if (same) { status = 'synced'; lastSync = Date.now(); emit(); watch(); return { ok: true }; }
  // reconnexion automatique (même appareil) : la partie de l'appareil est la plus récente, on l'envoie
  if (!fresh) { await pushCloud(); watch(); return { ok: true }; }
  pending = row.data;
  status = 'choice'; emit();
  return { ok: true, choice: { local: saveSummary(save.get()), cloud: saveSummary(row.data) } };
}
/** `keep` : 'cloud' (reprendre la partie du compte) ou 'local' (garder celle de l'appareil et l'envoyer). */
export async function resolveChoice(keep) {
  const data = pending; pending = null;
  if (keep === 'cloud' && data) {
    try { localStorage.setItem(BACKUP_KEY, JSON.stringify(save.get())); } catch { /* stockage plein */ }
    save.replace({ ...data, account: usernameOf(user) });
  }
  await pushCloud();
  watch();
}

export async function signUp(name, password) {
  if (!accountAvailable()) return { ok: false, error: 'Comptes pas encore disponibles.' };
  const v = checkUsername(name);
  if (!v.ok) return v;
  // compte créé déjà confirmé par la fonction serveur « signup » (aucun e-mail envoyé), puis connexion normale
  const made = await sb().functions.invoke('signup', { body: { username: v.value, password } });
  let data, error;
  if (!made.error) ({ data, error } = await sb().auth.signInWithPassword({ email: usernameEmail(v.value), password }));
  else {
    const code = await made.error.context?.json?.().then((b) => b?.error).catch(() => null);
    if (code === 'taken') return { ok: false, error: FR['User already registered'] };
    if (code) return { ok: false, error: code === 'password' ? FR['Password should be at least 6 characters.'] : 'Création du compte impossible, réessaie.' };
    // fonction injoignable : inscription classique
    ({ data, error } = await sb().auth.signUp({ email: usernameEmail(v.value), password, options: { data: { username: v.value } } }));
  }
  if (error) return { ok: false, error: msg(error) };
  if (!data.session) return { ok: false, error: FR['Email not confirmed'] };
  user = data.user;
  save.update({ playerName: v.value });   // le nom du compte devient le nom affiché en jeu
  return afterLogin(true).then((r) => (r.ok ? { ...r, created: true } : r)).catch((e) => ({ ok: false, error: msg(e) }));
}
export async function signIn(name, password) {
  if (!accountAvailable()) return { ok: false, error: 'Comptes pas encore disponibles.' };
  const v = checkUsername(name);
  if (!v.ok) return { ok: false, error: FR['Invalid login credentials'] };
  const { data, error } = await sb().auth.signInWithPassword({ email: usernameEmail(v.value), password });
  if (error) return { ok: false, error: msg(error) };
  user = data.user;
  return afterLogin(true).catch((e) => { status = 'error'; emit(); return { ok: false, error: msg(e) }; });
}
export async function signOut() {
  if (timer) await pushCloud().catch(() => {});
  unsub?.(); unsub = null;
  await sb()?.auth.signOut().catch(() => {});
  user = null; status = 'off'; pending = null;
  save.update({ account: null });
  emit();
}
export const syncNow = () => pushCloud();

/** Au lancement : reprend la session enregistrée sur l'appareil (si le joueur s'était connecté). */
export async function initAccount() {
  if (!accountAvailable()) return;
  try {
    const { data } = await sb().auth.getSession();
    if (!data.session) return;
    user = data.session.user;
    emit();
    await afterLogin(false);
  } catch { status = 'error'; emit(); }
}
