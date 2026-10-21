// COMPTE JOUEUR ET SAUVEGARDE EN LIGNE (Supabase).
// Se connecter (e-mail + mot de passe) relie la partie à un compte : la sauvegarde est envoyée dans le cloud
// (table « saves », une ligne par compte, protégée : chacun ne lit et n'écrit que la sienne) et retrouvée
// sur n'importe quel téléphone. La sauvegarde locale reste la référence pendant le jeu ; rien n'est effacé :
// avant de remplacer la partie de l'appareil par celle du compte, une copie de secours est gardée.
import { supabase as sb } from './supabase.js';
import { save, BACKUP_KEY } from '../save/storage.js';
import { CHARACTERS } from '../data/characters.js';

export const accountAvailable = () => !!sb();

let user = null, status = 'off', lastSync = null, pending = null, timer = null, unsub = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(accountState()));
export const onAccount = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const accountState = () => ({ available: accountAvailable(), user: user ? { id: user.id, email: user.email } : null, status, lastSync });

/** Résumé lisible d'une sauvegarde (pour choisir entre celle de l'appareil et celle du compte). */
export function saveSummary(s) {
  return { trophies: s?.ranked?.points ?? 0, coins: s?.coins ?? 0, gems: s?.gems ?? 0, strikers: CHARACTERS.filter((c) => s?.owned?.includes(c.id)).length, name: s?.playerName ?? '' };
}

const FR = {
  'Invalid login credentials': 'E-mail ou mot de passe incorrect.',
  'User already registered': 'Un compte existe déjà avec cet e-mail : connecte-toi.',
  'Email not confirmed': 'Confirme d’abord ton e-mail (lien reçu par mail).',
  'Password should be at least 6 characters.': 'Le mot de passe doit faire au moins 6 caractères.',
};
const msg = (e) => FR[e?.message] ?? (/fetch|network/i.test(e?.message ?? '') ? 'Pas de connexion Internet.' : e?.message || 'Erreur inconnue.');

async function fetchCloud() {
  const { data, error } = await sb().from('saves').select('data, updated_at').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return data;
}
async function pushCloud() {
  if (!user) return;
  clearTimeout(timer); timer = null;
  status = 'syncing'; emit();
  const { error } = await sb().from('saves').upsert({ user_id: user.id, data: save.get(), updated_at: new Date().toISOString() });
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
  const row = await fetchCloud();
  if (!row?.data) { await pushCloud(); watch(); return { ok: true, uploaded: true }; }
  const same = JSON.stringify(row.data) === JSON.stringify(save.get());
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
    save.replace(data);
  }
  await pushCloud();
  watch();
}

export async function signUp(email, password) {
  if (!accountAvailable()) return { ok: false, error: 'Comptes pas encore disponibles.' };
  const { data, error } = await sb().auth.signUp({ email, password });
  if (error) return { ok: false, error: msg(error) };
  if (!data.session) return { ok: true, confirm: true };   // confirmation par e-mail demandée par le serveur
  user = data.user;
  return afterLogin(true).catch((e) => ({ ok: false, error: msg(e) }));
}
export async function signIn(email, password) {
  if (!accountAvailable()) return { ok: false, error: 'Comptes pas encore disponibles.' };
  const { data, error } = await sb().auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: msg(error) };
  user = data.user;
  return afterLogin(true).catch((e) => { status = 'error'; emit(); return { ok: false, error: msg(e) }; });
}
export async function signOut() {
  if (timer) await pushCloud().catch(() => {});
  unsub?.(); unsub = null;
  await sb()?.auth.signOut().catch(() => {});
  user = null; status = 'off'; pending = null; emit();
}
export const syncNow = () => pushCloud();

/** Au lancement : reprend la session enregistrée sur l'appareil (si le joueur s'était connecté). */
export async function initAccount() {
  if (!accountAvailable()) return;
  try {
    const { data } = await sb().auth.getSession();
    if (!data.session) return;
    user = data.session.user;
    await afterLogin(false);
  } catch { status = 'error'; emit(); }
}
