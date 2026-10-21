// JOUER AVEC UN AMI : salle de combat amical en ligne.
// L'hôte crée une salle et envoie son lien (…/Strike-/?join=CODE). L'ami ouvre le lien, la salle se connecte,
// chacun voit le vrai profil de l'autre (qui s'ajoute à ses amis), puis l'hôte lance le Duel.
// Combat amical : pas de trophées, de classement ni de récompenses.
import { openRoom, newRoomCode, cleanCode } from '../../net/transport.js';
import { PUBLIC_URL } from '../../net/config.js';
import { openArena, onlineFighterInfo, KILL_TARGETS, DEFAULT_KILL_TARGET } from '../../arena/arenaGame.js';
import { save } from '../../save/storage.js';
import { playerId, rememberFriend, sendFriendRequest } from '../../game/social.js';
import { currentUser } from '../../net/account.js';
import { sendInvite } from '../../net/friendsOnline.js';
import { rankedPoints } from '../../game/ranked.js';
import { rankOf } from '../../data/ranked.js';
import { getCharacter } from '../../data/characters.js';
import { getPortrait } from '../../render/portraits.js';
import { getRank } from '../../data/ranks.js';
import { ICONS, swordsArt } from '../icons.js';
import { ARENA_MAPS } from '../../arena/maps.js';
import { mapPickerHtml, fillMapPreviews } from '../mapPicker.js';
import { avatarSvg } from '../avatar.js';
import { rankEmblem } from '../rankEmblem.js';
import { showPanel, closePanel, toast } from '../panel.js';

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (n) => (n ?? 0).toLocaleString('fr-FR');
export const inviteLink = (code) => `${PUBLIC_URL}?join=${code}`;

/** Petite version (64 px) de la photo de profil, pour l'envoyer à l'ami. */
function photoThumb() {
  const src = save.get().avatar === 'photo' ? save.get().avatarPhoto : null;
  if (!src) return Promise.resolve(null);
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      c.getContext('2d').drawImage(img, 0, 0, 64, 64);
      try { res(c.toDataURL('image/jpeg', 0.7)); } catch { res(null); }
    };
    img.onerror = () => res(null);
    img.src = src;
  });
}

async function helloMsg() {
  const s = save.get();
  return { t: 'hello', v: 1, uid: currentUser()?.id ?? null, id: playerId(), name: s.playerName, avatar: s.avatar, photo: await photoThumb(), trophies: rankedPoints(s), fighter: onlineFighterInfo(s) };
}

/**
 * Ouvre la salle. `join` : code d'une salle à rejoindre (lien d'invitation) ; sinon on en crée une.
 */
/** `invite` : ami (compte en ligne) à défier directement : il reçoit le code de la salle dès qu'elle est prête. */
export function openFriendMatch({ join = null, invite = null } = {}) {
  let invited = false;
  const role = join ? 'guest' : 'host';
  let code = join ? cleanCode(join) : newRoomCode();
  let room = null, foe = null, started = false, connected = false, tries = 0;
  let map = ARENA_MAPS[save.get().battlePrefs?.arenaMap] ? save.get().battlePrefs.arenaMap : 'map1';
  let kills = KILL_TARGETS.includes(save.get().battlePrefs?.arenaKills) ? save.get().battlePrefs.arenaKills : DEFAULT_KILL_TARGET;
  let status = role === 'host' ? 'creating' : 'joining', errorKind = null;

  const root = document.createElement('div');
  root.className = 'fm-screen';

  const card = (p, mine) => {
    const r = rankOf(p.trophies ?? 0);
    const def = getCharacter(p.fighter?.strikerId);
    const img = getPortrait(def, getRank(p.fighter?.look?.rank).id);
    return `
      <div class="fm-player ${mine ? 'me' : 'foe'}" style="--rk:${r.tier.main}">
        <span class="fm-av">${avatarSvg(p.avatar, p.photo)}</span>
        <b class="fm-name">${esc(p.name)}</b>
        <span class="fm-rank"><span class="fm-emb">${rankEmblem(r.tierIndex, r.level, { size: 18, pips: false })}</span>${ICONS.trophy}${fmt(p.trophies)}</span>
        <span class="fm-striker"><img src="${img}" alt="" /><small>${esc(def.name)}</small></span>
      </div>`;
  };
  const meInfo = () => { const s = save.get(); return { name: s.playerName, avatar: s.avatar, photo: null, trophies: rankedPoints(s), fighter: onlineFighterInfo(s) }; };
  const waitingCard = () => `
    <div class="fm-player empty"><span class="fm-av fm-q">?</span><b class="fm-name">${role === 'host' ? esc(invite?.name ?? 'Ton ami') : 'Connexion…'}</b>${invite && invited ? '<small class="fm-sent">Défi envoyé !</small>' : ''}<span class="fm-dots"><i></i><i></i><i></i></span></div>`;

  function render() {
    const link = inviteLink(code);
    let body = '';
    if (status === 'error') {
      const msg = {
        'not-found': ['Salle introuvable', 'Le lien a expiré ou ton ami a fermé la salle. Demande-lui un nouveau lien.'],
        network: ['Connexion impossible', 'Vérifie ta connexion Internet puis réessaie.'],
        left: ['Ton ami est parti', 'La salle est fermée.'],
      }[errorKind] ?? ['Connexion impossible', 'La liaison avec ton ami n’a pas pu s’établir. Réessaie, ou passez tous les deux en Wi-Fi.'];
      body = `<div class="fm-error" role="alert"><b>${msg[0]}</b><p>${msg[1]}</p><button class="fm-btn" data-retry>${ICONS.rotate}RÉESSAYER</button></div>`;
    } else if (role === 'host' && !foe) {
      body = `
        <section class="fm-invite">
          <small>Code de la salle</small>
          <b class="fm-code" data-code>${status === 'creating' ? '·····' : code}</b>
          <p class="fm-link" data-link>${status === 'creating' ? 'Création de la salle…' : esc(link)}</p>
          <div class="fm-share">
            <button class="fm-btn share" data-share ${status !== 'open' ? 'disabled' : ''}>${ICONS.share}ENVOYER LE LIEN</button>
            <button class="fm-btn ghost" data-copy ${status !== 'open' ? 'disabled' : ''}>${ICONS.copy}COPIER</button>
          </div>
          <p class="fm-hint">Ton ami ouvre le lien sur son téléphone : il arrive directement dans ta salle et s’ajoute à tes amis.</p>
        </section>`;
    }
    const ready = !!foe;
    root.innerHTML = `
      <section class="fm-hero">
        <span class="fm-art">${swordsArt()}</span>
        <div><h3>COMBAT AMICAL</h3><p>Duel en ligne contre ton ami · sans trophées</p></div>
      </section>
      <section class="fm-versus">
        ${card(meInfo(), true)}
        <i class="fm-vs">VS</i>
        ${foe ? card(foe, false) : waitingCard()}
      </section>
      ${body}
      ${ready ? `
        <div class="sh-banner bm-banner"><span class="sh-ic">${ICONS.map}</span><h4>Carte</h4></div>
        ${mapPickerHtml(map, 'fmap', role === 'guest')}
        <div class="sh-banner bm-banner"><span class="sh-ic">${ICONS.trophy}</span><h4>Victoire à</h4></div>
        <div class="bm-kills2 fm-kills" role="radiogroup" aria-label="Nombre d’éliminations pour gagner">${KILL_TARGETS.map((k) => `
          <button class="bm-kill2 ${kills === k ? 'sel' : ''}" data-fkills="${k}" role="radio" aria-checked="${kills === k}" ${role === 'guest' ? 'disabled' : ''}><b>${k}</b><small>éliminations</small></button>`).join('')}
        </div>
        <div class="bm-footer2">
          ${role === 'host'
            ? `<button class="bm-go" data-start><span class="bm-go-ic">${ICONS.battle}</span><span><b>LANCER</b><small>${ARENA_MAPS[map].title} · ${kills} élim.</small></span></button>`
            : `<p class="fm-wait-host" data-wait-map="${map}">${ICONS.clock}<span>${esc(foe.name)} va lancer le combat…</span></p>`}
        </div>` : ''}`;
    fillMapPreviews(root);
  }

  function fail(kind) {
    if (started) return;
    // code déjà pris par une autre salle : on en tire un autre (hôte uniquement)
    if (role === 'host' && kind === 'taken' && tries++ < 3) { room?.close(); code = newRoomCode(); connect(); return; }
    status = 'error'; errorKind = kind; foe = null; connected = false;
    room?.close(); room = null;
    render();
  }

  function connect() {
    status = role === 'host' ? 'creating' : 'joining'; errorKind = null;
    render();
    const r = room = openRoom(code, role);
    // l'hôte est prêt dès que la salle est enregistrée (petit délai de la messagerie PeerJS)
    // l'hôte peut partager son lien dès que la salle est enregistrée sur le serveur
    r.onReady(() => {
      if (room !== r || role !== 'host' || status !== 'creating') return;
      status = 'open';
      // défi direct à un ami connecté : il reçoit le code de la salle
      if (invite && !invited) sendInvite(invite.id, code).then((ok) => { if (ok && room === r) { invited = true; render(); toast(`Défi envoyé à ${invite.name}`, '#5cffc4', 'ok'); } });
      render();
    });
    let joinTimer = role === 'guest' ? setTimeout(() => { if (room === r && !connected) fail('timeout'); }, 20000) : null;
    r.onOpen(async () => { if (room !== r) return; connected = true; clearTimeout(joinTimer); r.send(await helloMsg()); });
    r.onError((k) => { if (room === r) fail(k); });
    r.onClose((k) => {
      if (room !== r || started) return;
      if (role === 'host') { foe = null; connected = false; room.close(); toast('Ton ami a quitté la salle', '#ff5c7a', 'error'); connect(); return; }
      fail(k === 'left' ? 'left' : 'network');
    });
    r.onMessage((m) => {
      if (room !== r || started || !m) return;
      if (m.t === 'hello') {
        foe = { ...m, name: String(m.name ?? 'Ami').slice(0, 16) };
        rememberFriend(foe);   // ajouté aux amis (des deux côtés)
        // deux joueurs avec un compte : ils deviennent amis en ligne (chacun demande, la 2e demande accepte)
        if (m.uid && currentUser() && m.uid !== currentUser().id) sendFriendRequest(m.uid).catch(() => {});
        if (role === 'host') status = 'open';
        navigator.vibrate?.(20);
        render();
      } else if (m.t === 'kills' && role === 'guest') { kills = m.k; render(); }
      else if (m.t === 'map' && role === 'guest' && ARENA_MAPS[m.map]) { map = m.map; render(); }
      else if (m.t === 'start' && role === 'guest') { if (ARENA_MAPS[m.map]) map = m.map; launch(m.k); }
    });
  }

  function launch(k) {
    if (started || !foe || !room) return;
    started = true;
    const r = room;
    closePanel(true);
    const api = openArena({ online: { room: r, kills: k, map, foe: { ...foe.fighter, name: foe.name } } });
    window.__arena = api;   // accès de debug / tests automatisés
  }

  root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-retry]')) { tries = 0; connect(); return; }
    const k = e.target.closest('[data-fkills]');
    if (k && role === 'host') { kills = Number(k.dataset.fkills); room?.send({ t: 'kills', k: kills }); navigator.vibrate?.(8); render(); return; }
    const fm = e.target.closest('[data-fmap]');
    if (fm && role === 'host') { map = fm.dataset.fmap; room?.send({ t: 'map', map }); navigator.vibrate?.(8); render(); return; }
    if (e.target.closest('[data-start]')) { room.send({ t: 'start', k: kills, map }); launch(kills); return; }
    const link = inviteLink(code);
    if (e.target.closest('[data-share]')) {
      if (navigator.share) { try { await navigator.share({ title: 'STRIKE', text: `Viens m’affronter sur STRIKE ! Code : ${code}`, url: link }); } catch { /* partage annulé */ } return; }
    }
    if (e.target.closest('[data-share], [data-copy]')) {
      try { await navigator.clipboard.writeText(link); toast('Lien copié : envoie-le à ton ami', '#5cffc4', 'ok'); }
      catch { const t = root.querySelector('[data-link]'); const rg = document.createRange(); rg.selectNodeContents(t); getSelection().removeAllRanges(); getSelection().addRange(rg); toast('Lien sélectionné : copie-le', '#5cffc4', 'info'); }
    }
  });

  connect();
  showPanel({
    title: 'EN LIGNE', icon: ICONS.friends, accent: '#5cc8ff', content: root,
    onClose: () => { if (!started) { room?.close(); room = null; } },
  });
  return { get code() { return code; }, get foe() { return foe; } };
}
