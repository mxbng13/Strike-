// LIAISON ENTRE DEUX JOUEURS (combat amical en ligne).
// Une « salle » = un code de 5 caractères. L'hôte la crée, l'ami la rejoint avec le lien d'invitation.
// Rien n'est simulé : la salle n'existe que si deux vrais joueurs sont connectés.
// - Serveur du jeu configuré (Supabase) : messages relayés par le serveur (Realtime) → marche sur tous les
//   réseaux, Wi-Fi comme 4G/5G.
// - Sinon : liaison directe entre les deux téléphones (WebRTC via PeerJS), qui peut échouer derrière
//   certains réseaux mobiles.
// Interface commune : { code, role, send(msg), onMessage, onOpen, onClose, onError, onReady, close() }.
import Peer from 'peerjs';
import { supabase } from './supabase.js';

const PREFIX = 'strike-fm-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newRoomCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
export const cleanCode = (c) => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

function base(code, role) {
  const ls = { message: [], open: [], close: [], error: [], ready: [] };
  return {
    emit: (k, v) => ls[k].slice().forEach((fn) => fn(v)),
    api: {
      code, role,
      onMessage: (fn) => ls.message.push(fn), onOpen: (fn) => ls.open.push(fn), onClose: (fn) => ls.close.push(fn),
      onError: (fn) => ls.error.push(fn), onReady: (fn) => ls.ready.push(fn),
    },
  };
}

/** Salle relayée par le serveur Supabase (Realtime : diffusion + présence des deux joueurs). */
function supabaseRoom(code, role) {
  const { emit, api } = base(code, role);
  const me = `${role}-${Math.random().toString(36).slice(2, 10)}`;
  let opened = false, closed = false, ch = null;
  const sb = supabase();
  ch = sb.channel(PREFIX + code, { config: { broadcast: { self: false, ack: false }, presence: { key: me } } });
  ch.on('broadcast', { event: 'm' }, ({ payload }) => { if (!closed && opened) emit('message', payload); });
  ch.on('presence', { event: 'sync' }, () => {
    if (closed) return;
    const others = Object.entries(ch.presenceState()).filter(([k]) => k !== me).map(([, v]) => v[0]?.role);
    if (!opened && role === 'host' && others.includes('host')) { emit('error', 'taken'); return; }   // code déjà utilisé
    const peer = others.includes(role === 'host' ? 'guest' : 'host');
    if (peer && !opened) { opened = true; emit('open'); }
    else if (!peer && opened) { opened = false; emit('close', 'left'); }
  });
  let guestTimer = null;
  ch.subscribe(async (status) => {
    if (closed) return;
    if (status === 'SUBSCRIBED') {
      await ch.track({ role });
      emit('ready');
      // l'invité ne trouve personne dans la salle : lien expiré ou salle fermée
      if (role === 'guest') guestTimer = setTimeout(() => { if (!opened && !closed) emit('error', 'not-found'); }, 8000);
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') emit(opened ? 'close' : 'error', 'network');
  });
  return Object.assign(api, {
    send: (m) => { if (opened) ch.send({ type: 'broadcast', event: 'm', payload: m }); },
    close() { if (closed) return; closed = true; clearTimeout(guestTimer); ch.untrack().catch(() => {}).finally(() => sb.removeChannel(ch)); },
  });
}

const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

/** Salle PeerJS : l'hôte s'enregistre sous l'identifiant de la salle, l'invité s'y connecte. */
function peerRoom(code, role) {
  const { emit, api } = base(code, role);
  let peer = null, conn = null, closed = false, opened = false;
  const wire = (c) => {
    if (conn) { c.close(); return; }      // la salle est pleine : un seul ami
    conn = c;
    c.on('open', () => { opened = true; emit('open'); });
    c.on('data', (d) => { try { emit('message', typeof d === 'string' ? JSON.parse(d) : d); } catch { /* message illisible */ } });
    c.on('close', () => { if (!closed) emit('close', 'left'); });
    c.on('error', () => { if (!closed) emit('close', 'error'); });
  };
  if (role === 'host') {
    peer = new Peer(PREFIX + code, { config: ICE });
    peer.on('open', () => emit('ready'));
    peer.on('connection', wire);
  } else {
    peer = new Peer({ config: ICE });
    peer.on('open', () => { emit('ready'); wire(peer.connect(PREFIX + code, { reliable: true, serialization: 'json' })); });
  }
  peer.on('error', (e) => {
    if (closed) return;
    const kind = e.type === 'peer-unavailable' ? 'not-found' : e.type === 'unavailable-id' ? 'taken' : e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error' ? 'network' : 'error';
    emit(opened ? 'close' : 'error', kind);
  });
  peer.on('disconnected', () => { if (!closed && !opened) emit('error', 'network'); });
  return Object.assign(api, {
    send: (m) => { if (conn?.open) conn.send(m); },
    close() { if (closed) return; closed = true; try { conn?.close(); } catch { /* déjà fermée */ } try { peer?.destroy(); } catch { /* déjà détruit */ } },
  });
}

/** Salle de test : petit relais HTTP local (flux d'événements + envois), pour les tests automatisés. */
function relayRoom(code, role, url) {
  const { emit, api } = base(code, role);
  const me = `${role}-${Math.random().toString(36).slice(2, 10)}`;
  let opened = false, closed = false;
  const es = new EventSource(`${url}/room/${code}?id=${me}&role=${role}`);
  es.onopen = () => emit('ready');
  es.onmessage = ({ data }) => {
    if (closed) return;
    const { from, m } = JSON.parse(data);
    if (from === me) return;
    if (m.__join) { if (!opened) { opened = true; emit('open'); } return; }
    if (m.__leave) { if (opened) { opened = false; emit('close', 'left'); } return; }
    if (opened) emit('message', m);
  };
  es.onerror = () => { if (!closed && es.readyState === EventSource.CLOSED) emit(opened ? 'close' : 'error', 'network'); };
  // envois dans l'ordre : un seul envoi à la fois, les messages en attente partent ensemble
  let queue = [], busy = false;
  const flush = () => {
    if (busy || !queue.length) return;
    busy = true;
    const batch = queue; queue = [];
    fetch(`${url}/room/${code}`, { method: 'POST', body: JSON.stringify({ from: me, list: batch }) }).catch(() => {}).finally(() => { busy = false; flush(); });
  };
  const post = (m) => { queue.push(m); flush(); };
  return Object.assign(api, {
    send: (m) => { if (opened) post(m); },
    close() { if (closed) return; closed = true; es.close(); },
  });
}

export function openRoom(code, role) {
  if (window.__STRIKE_TEST_RELAY) return relayRoom(code, role, window.__STRIKE_TEST_RELAY);
  return supabase() ? supabaseRoom(code, role) : peerRoom(code, role);
}
