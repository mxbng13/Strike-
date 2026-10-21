// AMIS EN LIGNE (Supabase) : recherche par ID joueur (STK-XXXXXX, donné par le serveur à chaque compte) ou par
// nom de joueur, demandes d'ami, liste d'amis, qui est en ligne,
// et défis (« Untel te défie ! » → on rejoint sa salle de combat amical).
// Tables : profiles (profil public de chaque compte) et friendships (demandes / amitiés), protégées :
// chacun ne voit que les amitiés qui le concernent et ne peut accepter que les demandes reçues.
// Branché dans game/social.js (registerSocialBackend) quand le joueur est connecté.
import { supabase as sb } from './supabase.js';
import { onAccount, currentUser } from './account.js';
import { registerSocialBackend } from '../game/social.js';
import { save } from '../save/storage.js';

const ONLINE = 'strike-online';
const inboxOf = (id) => `strike-inbox-${id}`;
let me = null, onlineCh = null, inboxCh = null;
const online = new Set();
const listeners = { online: new Set(), invite: new Set() };
export const onOnlineChange = (fn) => { listeners.online.add(fn); return () => listeners.online.delete(fn); };
export const onInvite = (fn) => { listeners.invite.add(fn); return () => listeners.invite.delete(fn); };
export const isOnline = (id) => online.has(id);

const FIELDS = 'id, username, name, avatar, trophies, player_code';
const toPlayer = (p) => ({ id: p.id, name: p.name || p.username, username: p.username, code: p.player_code, avatar: p.avatar, trophies: p.trophies ?? 0, online: online.has(p.id) });
async function profilesOf(ids) {
  if (!ids.length) return [];
  const { data } = await sb().from('profiles').select(FIELDS).in('id', ids);
  return (data ?? []).map(toPlayer);
}
/** Toutes les lignes d'amitié qui me concernent (envoyées et reçues). */
async function myLinks() {
  const [a, b] = await Promise.all([
    sb().from('friendships').select('requester, addressee, status').eq('requester', me.id),
    sb().from('friendships').select('requester, addressee, status').eq('addressee', me.id),
  ]);
  return [...(a.data ?? []), ...(b.data ?? [])];
}

const backend = {
  async search(q) {
    const code = String(q).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^STK/, '');
    if (/^[A-Z0-9]{6}$/.test(code)) {   // un ID joueur : STK-XXXXXX (ou juste les 6 caractères)
      const { data } = await sb().from('profiles').select(FIELDS).eq('player_code', `STK-${code}`).neq('id', me.id);
      if (data?.length) return data.map(toPlayer);
    }
    const t = String(q).trim().replace(/[%_\\]/g, '');
    if (!t) return [];
    const { data } = await sb().from('profiles').select(FIELDS).ilike('username', `${t}%`).neq('id', me.id).limit(20);
    return (data ?? []).map(toPlayer);
  },
  async listFriends() {
    const links = (await myLinks()).filter((l) => l.status === 'accepted');
    const list = await profilesOf(links.map((l) => (l.requester === me.id ? l.addressee : l.requester)));
    return list.sort((x, y) => Number(y.online) - Number(x.online) || x.name.localeCompare(y.name));
  },
  async listRequests() {
    const links = (await myLinks()).filter((l) => l.status === 'pending');
    const [incoming, outgoing] = await Promise.all([
      profilesOf(links.filter((l) => l.addressee === me.id).map((l) => l.requester)),
      profilesOf(links.filter((l) => l.requester === me.id).map((l) => l.addressee)),
    ]);
    return { incoming, outgoing };
  },
  async sendRequest(id, retry = true) {
    if (id === me.id) return { ok: false, error: 'self' };
    const links = await myLinks();
    const link = links.find((l) => (l.requester === id && l.addressee === me.id) || (l.requester === me.id && l.addressee === id));
    if (link?.status === 'accepted') return { ok: true, already: true };
    if (link?.requester === id) return backend.accept(id);   // il m'avait déjà demandé : on devient amis
    if (link) return { ok: true, pending: true };
    const { error } = await sb().from('friendships').insert({ requester: me.id, addressee: id });
    // l'autre vient de nous demander au même moment (lien d'invitation) : sa demande existe, on l'accepte
    if (error?.code === '23505' && retry) return backend.sendRequest(id, false);
    return { ok: !error };
  },
  async accept(id) {
    const { error } = await sb().from('friendships').update({ status: 'accepted' }).eq('requester', id).eq('addressee', me.id);
    return { ok: !error };
  },
  async decline(id) {
    const { error } = await sb().from('friendships').delete().eq('requester', id).eq('addressee', me.id);
    return { ok: !error };
  },
  async remove(id) {
    const [a, b] = await Promise.all([
      sb().from('friendships').delete().eq('requester', id).eq('addressee', me.id),
      sb().from('friendships').delete().eq('requester', me.id).eq('addressee', id),
    ]);
    return { ok: !a.error && !b.error };
  },
};

/** Défie un ami : il reçoit le code de notre salle et peut la rejoindre en un geste. */
export async function sendInvite(friendId, code) {
  if (!me) return false;
  const ch = sb().channel(inboxOf(friendId), { config: { broadcast: { self: false, ack: true } } });
  await new Promise((res) => { ch.subscribe((st) => { if (st === 'SUBSCRIBED' || st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') res(); }); setTimeout(res, 6000); });
  const s = save.get();
  await ch.send({ type: 'broadcast', event: 'invite', payload: { code, from: { id: me.id, name: s.playerName, avatar: s.avatar === 'photo' ? 'defaut' : s.avatar } } }).catch(() => {});
  setTimeout(() => sb().removeChannel(ch), 1500);
  return true;
}

function connect(u) {
  me = u;
  registerSocialBackend(backend);
  // l'ID joueur affiché dans le jeu devient celui du compte (le même sur tous les téléphones)
  sb().from('profiles').select('player_code').eq('id', u.id).maybeSingle().then(({ data }) => {
    if (data?.player_code && me?.id === u.id && save.get().playerId !== data.player_code) save.update({ playerId: data.player_code });
  });
  // présence : qui est connecté en ce moment
  onlineCh = sb().channel(ONLINE, { config: { presence: { key: me.id } } });
  onlineCh.on('presence', { event: 'sync' }, () => {
    online.clear();
    for (const k of Object.keys(onlineCh.presenceState())) if (k !== me.id) online.add(k);
    listeners.online.forEach((fn) => fn());
  });
  onlineCh.subscribe((st) => { if (st === 'SUBSCRIBED') onlineCh.track({ at: Date.now() }); });
  // boîte de réception : défis envoyés par les amis
  inboxCh = sb().channel(inboxOf(me.id));
  inboxCh.on('broadcast', { event: 'invite' }, ({ payload }) => {
    if (!payload?.code || !payload.from?.id) return;
    listeners.invite.forEach((fn) => fn(payload));
  });
  inboxCh.subscribe();
}
function disconnect() {
  registerSocialBackend(null);
  for (const ch of [onlineCh, inboxCh]) if (ch) sb()?.removeChannel(ch);
  onlineCh = inboxCh = null; me = null; online.clear();
  listeners.online.forEach((fn) => fn());
}

/** Suit le compte : amis en ligne dès la connexion, coupés à la déconnexion. */
export function initFriendsOnline() {
  onAccount((st) => {
    const u = currentUser();
    if (u && st.status !== 'off' && me?.id !== u.id) { if (me) disconnect(); connect(u); }
    else if (!u && me) disconnect();
  });
}
