// AMIS : carte du joueur (photo, nom, rang, ID à partager), puis Amis / Demandes / Ajouter.
// Avec un compte (net/friendsOnline.js) : recherche par nom, demandes, amis en ligne et défis. Sans compte :
// amis rencontrés par lien d'invitation. Aucun joueur n'est jamais simulé.
import { socialAvailable, playerId, searchPlayers, listFriends, listRequests, sendFriendRequest, acceptRequest, declineRequest, removeFriend } from '../../game/social.js';
import { currentRank, rankedPoints } from '../../game/ranked.js';
import { rankOf } from '../../data/ranked.js';
import { save } from '../../save/storage.js';
import { ICONS, friendsArt } from '../icons.js';
import { avatarSvg } from '../avatar.js';
import { rankEmblem } from '../rankEmblem.js';
import { showPanel, closePanel, toast } from '../panel.js';
import { openFriendMatch } from './friendMatch.js';
import { openLogin } from './login.js';
import { accountAvailable, currentUser } from '../../net/account.js';
import { onOnlineChange } from '../../net/friendsOnline.js';
import { tabs } from '../tabs.js';

const fmt = (n) => (n ?? 0).toLocaleString('fr-FR');
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Bandeau du haut : se connecter (amis par nom) ou inviter par lien. */
const statusBanner = () => (accountAvailable() && !currentUser() ? `
  <button class="fr-invite login" data-login>
    <span class="frs-ic">${ICONS.user}</span>
    <div><b>Connecte-toi pour ajouter des amis</b><small>Crée ton compte avec ton nom de joueur : tes amis te trouvent et te défient.</small></div>
    <span class="fri-go">${ICONS.plus}</span>
  </button>` : '') + `
  <button class="fr-invite" data-invite>
    <span class="frs-ic">${ICONS.share}</span>
    <div><b>Inviter un ami</b><small>Envoie ton lien de combat : ton ami te rejoint en ligne et s’ajoute ici.</small></div>
    <span class="fri-go">${ICONS.battle}</span>
  </button>`;

/** Ligne d'un joueur (ami, demande, résultat de recherche). */
const row = (p, actions) => {
  const r = rankOf(p.trophies ?? 0);
  return `
  <article class="fr-row" style="--rk:${r.tier.main}">
    <span class="fr-av">${avatarSvg(p.avatar, p.photo)}<i class="fr-dot ${p.online ? 'on' : ''}"></i></span>
    <div class="fr-info"><h3>${esc(p.name)}</h3><p><span class="fr-emb">${rankEmblem(r.tierIndex, r.level, { size: 18, pips: false })}</span>${r.label} · ${ICONS.trophy}${fmt(p.trophies)}</p></div>
    <div class="fr-actions">${actions}</div>
  </article>`;
};

/** Carte « moi » en haut de l'écran. */
function meCard() {
  const s = save.get(), r = currentRank(s), id = playerId();
  return `
    <section class="fr-me" style="--rk:${r.tier.main};--rk-l:${r.tier.light}">
      <span class="fr-me-av">${avatarSvg(s.avatar)}</span>
      <div class="fr-me-info">
        <h3>${esc(s.playerName)}</h3>${currentUser() ? `<small class="fr-handle">@${esc(currentUser().username)}</small>` : ''}
        <p><span class="fr-emb">${rankEmblem(r.tierIndex, r.level, { size: 20, pips: false })}</span>${r.label} · ${ICONS.trophy}${fmt(rankedPoints(s))}</p>
      </div>
      <div class="fr-id">
        <small>ID joueur</small>
        <b id="my-player-id">${id}</b>
        <button class="fr-copy" data-copy aria-label="Copier mon ID joueur">${ICONS.copy}<span>Copier</span></button>
      </div>
    </section>`;
}

function emptyState(title, text, action = '') {
  return `<div class="fr-empty"><span class="fre-art">${friendsArt()}</span><h3>${title}</h3><p>${text}</p>${action}</div>`;
}

export function openFriends() {
  const wrap = document.createElement('div');
  wrap.className = 'fr-page';
  let tabEl = null;

  function friendsView() {
    const el = document.createElement('div');
    el.className = 'fr-friends';
    el.innerHTML = '<p class="fr-loading">Chargement…</p>';
    let shown = [];
    listFriends().then((list) => {
      shown = list;
      el.innerHTML = list.length
        ? `<h4 class="fr-sec">Mes amis <span>${list.length}</span></h4>` + list.map((p) => row(p, `${p.username
          ? `<button class="fr-btn ok" data-challenge="${p.id}" ${p.online ? '' : 'disabled'} aria-label="Défier ${esc(p.name)}">${ICONS.battle}<span>${p.online ? 'Défier' : 'Hors ligne'}</span></button>`
          : `<button class="fr-btn ok" data-invite aria-label="Défier ${esc(p.name)}">${ICONS.battle}</button>`}<button class="fr-btn danger" data-remove="${p.id}" aria-label="Retirer ${esc(p.name)}">${ICONS.close}</button>`)).join('')
        : emptyState('Pas encore d’amis', 'Envoie ton lien de combat à un ami : dès qu’il le rejoint, il apparaît ici.', `<button class="fr-cta" data-goto-add>${ICONS.plus}AJOUTER UN AMI</button>`);
    });
    el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-goto-add]')) { tabEl.show(2); return; }
      const ch = e.target.closest('[data-challenge]');
      if (ch) { const p = shown.find((x) => x.id === ch.dataset.challenge); if (p) { closePanel(true); openFriendMatch({ invite: p }); } return; }
      const b = e.target.closest('[data-remove]');
      if (b) { const r = await removeFriend(b.dataset.remove); if (r.ok) el.replaceWith(friendsView()); }
    });
    return el;
  }

  function requestsView() {
    const el = document.createElement('div');
    listRequests().then(({ incoming, outgoing }) => {
      const block = (title, list, empty, actions) => `
        <section class="fr-block">
          <h4 class="fr-sec">${title} <span>${list.length}</span></h4>
          ${list.length ? list.map((p) => row(p, actions(p))).join('') : `<p class="fr-none">${empty}</p>`}
        </section>`;
      el.innerHTML = block('Reçues', incoming, 'Aucune demande reçue pour le moment.', (p) => `<button class="fr-btn ok" data-accept="${p.id}" aria-label="Accepter">${ICONS.check}</button><button class="fr-btn danger" data-decline="${p.id}" aria-label="Refuser">${ICONS.close}</button>`)
        + block('Envoyées', outgoing, 'Aucune demande en attente.', () => '<span class="fr-pending">En attente</span>');
    });
    el.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-accept]'), d = e.target.closest('[data-decline]');
      if (a) await acceptRequest(a.dataset.accept);
      if (d) await declineRequest(d.dataset.decline);
      if (a || d) el.replaceWith(requestsView());
    });
    return el;
  }

  function addView() {
    const el = document.createElement('div');
    el.innerHTML = `
      <form class="fr-search" id="friend-search-form">
        <label for="friend-search">Rechercher un joueur</label>
        <div class="frs-field"><span class="frs-ic2">${ICONS.search}</span><input id="friend-search" type="search" placeholder="Nom de joueur" autocomplete="off" enterkeyhint="search" /></div>
        <button class="fr-cta" type="submit">${ICONS.search}RECHERCHER</button>
      </form>
      <div class="fr-results"></div>
      <section class="fr-share">
        <span class="frs-art">${friendsArt()}</span>
        <div><b>Invite tes amis</b><small>Donne-leur ton ID : <span>${playerId()}</span></small></div>
        <button class="fr-copy" data-copy aria-label="Copier mon ID joueur">${ICONS.copy}<span>Copier</span></button>
      </section>`;
    const input = el.querySelector('input');
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    const results = el.querySelector('.fr-results');
    el.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) { input.focus(); return; }
      if (!socialAvailable()) { results.innerHTML = accountAvailable() ? `<p class="fr-none">Connecte-toi à ton compte pour chercher tes amis par leur nom.</p><button class="fr-cta" data-login>${ICONS.user}SE CONNECTER</button>` : '<p class="fr-none">La recherche par nom s’active dès que le serveur du jeu est branché. En attendant, invite tes amis avec ton lien.</p>'; return; }
      const found = await searchPlayers(q);
      results.innerHTML = found.length ? found.map((p) => row(p, `<button class="fr-btn add" data-add="${p.id}">${ICONS.plus}Ajouter</button>`)).join('') : '<p class="fr-none">Aucun joueur trouvé.</p>';
    });
    el.addEventListener('click', async (e) => {
      const add = e.target.closest('[data-add]');
      if (add) { const r = await sendFriendRequest(add.dataset.add); toast(r.ok ? 'Demande envoyée' : 'Envoi impossible', r.ok ? '#5cffc4' : '#ff5c7a', r.ok ? 'ok' : 'error'); }
    });
    return el;
  }

  wrap.innerHTML = meCard() + statusBanner();
  tabEl = tabs([
    { label: 'Amis', render: friendsView },
    { label: 'Demandes', render: requestsView },
    { label: 'Ajouter', render: addView },
  ]);
  wrap.append(tabEl);
  // copier l'ID (presse-papiers ; à défaut, l'ID est sélectionné pour une copie manuelle)
  wrap.addEventListener('click', async (e) => {
    if (e.target.closest('[data-invite]')) { closePanel(true); openFriendMatch(); return; }
    if (e.target.closest('[data-login]')) { closePanel(true); openLogin(); return; }
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    const id = playerId();
    try { await navigator.clipboard.writeText(id); toast(`ID copié : ${id}`, '#5cffc4', 'ok'); b.classList.add('done'); setTimeout(() => b.classList.remove('done'), 1500); }
    catch { const t = wrap.querySelector('#my-player-id'); const r = document.createRange(); r.selectNodeContents(t); getSelection().removeAllRanges(); getSelection().addRange(r); toast('ID sélectionné : copie-le avec ton téléphone', '#5cffc4', 'info'); }
  });
  // amis qui se connectent / se déconnectent : la liste se met à jour
  const offOnline = onOnlineChange(() => { const v = wrap.querySelector('.fr-friends'); if (v) v.replaceWith(friendsView()); });
  showPanel({ title: 'AMIS', icon: ICONS.friends, accent: '#5cffc4', content: wrap, onClose: offOnline });
}
