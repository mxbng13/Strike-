// AMIS — architecture prête pour un serveur, sans aucune simulation de joueurs.
//
// Il n'existe pas encore de serveur ni de comptes en ligne : la liste d'amis, la recherche et les
// demandes nécessitent un « backend » (API REST/WebSocket + comptes joueurs). Quand il existera,
// il suffira d'enregistrer un client via registerSocialBackend() avec ces méthodes :
//   search(query) -> [{ id, name, avatar, trophies }]
//   listFriends() / listRequests() -> […]
//   sendRequest(id) / accept(id) / decline(id) / remove(id) -> { ok }
import { save } from '../save/storage.js';

let backend = null;
export function registerSocialBackend(b) { backend = b; }
export const socialAvailable = () => !!backend;

/** Identifiant du joueur (généré une fois, conservé dans la sauvegarde) à partager avec ses amis. */
export function playerId() {
  let id = save.get().playerId;
  if (!id) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    id = 'STK-' + Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    save.update({ playerId: id });
  }
  return id;
}

const off = async () => ({ ok: false, error: 'backend' });
export const searchPlayers = (q) => (backend ? backend.search(q) : Promise.resolve([]));
export const listFriends = () => (backend ? backend.listFriends() : Promise.resolve([]));
export const listRequests = () => (backend ? backend.listRequests() : Promise.resolve({ incoming: [], outgoing: [] }));
export const sendFriendRequest = (id) => (backend ? backend.sendRequest(id) : off());
export const acceptRequest = (id) => (backend ? backend.accept(id) : off());
export const declineRequest = (id) => (backend ? backend.decline(id) : off());
export const removeFriend = (id) => (backend ? backend.remove(id) : off());
