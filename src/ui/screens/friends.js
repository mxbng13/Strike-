// AMIS : interface prête, en attente d'un serveur (aucun joueur simulé).
import { socialAvailable, playerId, searchPlayers, listFriends, listRequests, sendFriendRequest, acceptRequest, declineRequest, removeFriend } from '../../game/social.js';
import { ICONS } from '../icons.js';
import { avatarSvg } from '../avatar.js';
import { showPanel, toast } from '../panel.js';
import { tabs } from '../tabs.js';

const BACKEND_NOTE = `<p class="sim-note">Les amis nécessitent un serveur en ligne (comptes joueurs), pas encore connecté. Ton identifiant est prêt : partage-le dès que les amis seront disponibles.</p>`;

const row = (p, actions) => `
  <article class="f-row">
    <span class="f-avatar">${avatarSvg(p.avatar)}</span>
    <div class="f-info"><h3>${p.name}</h3><p><span class="pi">${ICONS.trophy}</span> ${p.trophies ?? 0} trophées</p></div>
    <div class="f-actions">${actions}</div>
  </article>`;

function friendsView() {
  const el = document.createElement('div');
  el.innerHTML = '<p class="empty">Chargement…</p>';
  listFriends().then((list) => {
    el.innerHTML = (socialAvailable() ? '' : BACKEND_NOTE) + (list.length
      ? list.map((p) => row(p, `<button class="f-btn no" data-remove="${p.id}" aria-label="Supprimer">${ICONS.close}</button>`)).join('')
      : `<div class="box-empty"><div class="se-ico">${ICONS.friends}</div><h3>Aucun ami pour l’instant</h3><p>Ajoute des joueurs avec leur nom ou leur identifiant.</p></div>`);
  });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-remove]');
    if (b) { const r = await removeFriend(b.dataset.remove); if (r.ok) el.replaceWith(friendsView()); }
  });
  return el;
}

function requestsView() {
  const el = document.createElement('div');
  listRequests().then(({ incoming, outgoing }) => {
    el.innerHTML = (socialAvailable() ? '' : BACKEND_NOTE) + `
      <h4 class="f-sec">Reçues</h4>
      ${incoming.length ? incoming.map((p) => row(p, `<button class="f-btn ok" data-accept="${p.id}" aria-label="Accepter">${ICONS.check}</button><button class="f-btn no" data-decline="${p.id}" aria-label="Refuser">${ICONS.close}</button>`)).join('') : '<p class="empty">Aucune demande reçue.</p>'}
      <h4 class="f-sec">Envoyées</h4>
      ${outgoing.length ? outgoing.map((p) => row(p, '<span class="pending">En attente</span>')).join('') : '<p class="empty">Aucune demande envoyée.</p>'}`;
  });
  el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-accept]'), d = e.target.closest('[data-decline]');
    if (a) await acceptRequest(a.dataset.accept);
    if (d) await declineRequest(d.dataset.decline);
    if (a || d) el.replaceWith(requestsView());
  });
  return el;
}

function searchView() {
  const el = document.createElement('div');
  el.innerHTML = `
    <div class="my-id"><span>Ton identifiant</span><b>${playerId()}</b></div>
    <label class="search"><span class="s-ic">${ICONS.search}</span><input id="friend-search" type="search" placeholder="Nom ou identifiant (STK-…)" autocomplete="off" /></label>
    <button class="r-btn wide" data-search>RECHERCHER</button>
    <div class="results"></div>
    ${socialAvailable() ? '' : BACKEND_NOTE}`;
  const input = el.querySelector('input');
  input.addEventListener('pointerdown', (e) => e.stopPropagation());
  const results = el.querySelector('.results');
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-search]')) {
      if (!socialAvailable()) { toast('Recherche indisponible : serveur pas encore connecté.', '#ff5c7a', 'error'); return; }
      const found = await searchPlayers(input.value.trim());
      results.innerHTML = found.length ? found.map((p) => row(p, `<button class="f-btn add" data-add="${p.id}">${ICONS.plus}AJOUTER</button>`)).join('') : '<p class="empty">Aucun joueur trouvé.</p>';
    }
    const add = e.target.closest('[data-add]');
    if (add) { const r = await sendFriendRequest(add.dataset.add); toast(r.ok ? 'Demande envoyée' : 'Envoi impossible', r.ok ? '#5cffc4' : '#ff5c7a', r.ok ? 'ok' : 'error'); }
  });
  return el;
}

export function openFriends() {
  const wrap = document.createElement('div');
  wrap.append(tabs([
    { label: 'Amis', render: friendsView },
    { label: 'Demandes', render: requestsView },
    { label: 'Ajouter', render: searchView },
  ]));
  showPanel({ title: 'AMIS', icon: ICONS.friends, accent: '#5cffc4', content: wrap });
}
