// AMIS : carte du joueur (photo, nom, rang, ID à partager), puis Amis / Demandes / Ajouter.
// Interface prête pour un serveur en ligne ; tant qu'il n'est pas branché, aucun joueur n'est simulé.
import { socialAvailable, playerId, searchPlayers, listFriends, listRequests, sendFriendRequest, acceptRequest, declineRequest, removeFriend } from '../../game/social.js';
import { currentRank, rankedPoints } from '../../game/ranked.js';
import { rankOf } from '../../data/ranked.js';
import { save } from '../../save/storage.js';
import { ICONS, friendsArt } from '../icons.js';
import { avatarSvg } from '../avatar.js';
import { rankEmblem } from '../rankEmblem.js';
import { showPanel, toast } from '../panel.js';
import { tabs } from '../tabs.js';

const fmt = (n) => (n ?? 0).toLocaleString('fr-FR');
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Bandeau d'état du service en ligne (plein, sans pointillés). */
const statusBanner = () => (socialAvailable() ? '' : `
  <div class="fr-status" role="note">
    <span class="frs-ic">${ICONS.clock}</span>
    <div><b>Amis en ligne : bientôt</b><small>Les listes d’amis, les demandes et la recherche arrivent avec les serveurs du jeu. Ton ID est déjà réservé.</small></div>
  </div>`);

/** Ligne d'un joueur (ami, demande, résultat de recherche). */
const row = (p, actions) => {
  const r = rankOf(p.trophies ?? 0);
  return `
  <article class="fr-row" style="--rk:${r.tier.main}">
    <span class="fr-av">${avatarSvg(p.avatar)}<i class="fr-dot ${p.online ? 'on' : ''}"></i></span>
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
        <h3>${esc(s.playerName)}</h3>
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
    el.innerHTML = '<p class="fr-loading">Chargement…</p>';
    listFriends().then((list) => {
      el.innerHTML = list.length
        ? `<h4 class="fr-sec">Mes amis <span>${list.length}</span></h4>` + list.map((p) => row(p, `<button class="fr-btn danger" data-remove="${p.id}" aria-label="Retirer ${esc(p.name)}">${ICONS.close}</button>`)).join('')
        : emptyState('Pas encore d’amis', 'Ajoute tes amis avec leur ID joueur et retrouve-les ici pour suivre leur rang.', `<button class="fr-cta" data-goto-add>${ICONS.plus}AJOUTER UN AMI</button>`);
    });
    el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-goto-add]')) { tabEl.show(2); return; }
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
        <div class="frs-field"><span class="frs-ic2">${ICONS.search}</span><input id="friend-search" type="search" placeholder="Nom ou ID (STK-…)" autocomplete="off" enterkeyhint="search" /></div>
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
      if (!socialAvailable()) { results.innerHTML = '<p class="fr-none">La recherche sera disponible dès que les serveurs du jeu seront en ligne.</p>'; return; }
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
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    const id = playerId();
    try { await navigator.clipboard.writeText(id); toast(`ID copié : ${id}`, '#5cffc4', 'ok'); b.classList.add('done'); setTimeout(() => b.classList.remove('done'), 1500); }
    catch { const t = wrap.querySelector('#my-player-id'); const r = document.createRange(); r.selectNodeContents(t); getSelection().removeAllRanges(); getSelection().addRange(r); toast('ID sélectionné : copie-le avec ton téléphone', '#5cffc4', 'info'); }
  });
  showPanel({ title: 'AMIS', icon: ICONS.friends, accent: '#5cffc4', content: wrap });
}
