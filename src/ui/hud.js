// HUD de l'écran principal : monnaies (haut gauche), TROPHÉES (haut centre), AMIS puis PROFIL (haut droite),
// cadeau du jour (sous le profil), STRIKER puis BOX juste dessous (à gauche), PASSE (bas gauche),
// BOUTIQUE (bas centre) et COMBAT (bas droite).
import { ICONS, friendsArt, giftArt } from './icons.js';
import { createWallet } from './currency.js';
import { freeBoxStatus, totalBoxes } from '../game/boxService.js';
import { rankedClaimable, nextMajorStep, resolveReward } from '../game/ranked.js';
import { rankOf, POINTS_PER_LEVEL } from '../data/ranked.js';
import { rankEmblem } from './rankEmblem.js';
import { boxArt } from './boxArt.js';
import { avatarSvg } from './avatar.js';
import { passClaimable } from '../game/battlePass.js';
import { dailyStatus } from '../game/daily.js';

export function createHud(container, { onShop, onFriends, onCollection, onBox, onBattle, onProfile, onTrophies, onPass, onDaily }) {
  container.innerHTML = `
    <div class="hud-top">
      <div class="hud-wallet"></div>
      <button class="btn rank-card btn-trophies" data-action="trophies" aria-label="Trophées : classement et récompenses">
        <span class="rkc-emb" data-bind="rankEmb"></span>
        <span class="rkc-info">
          <small class="rkc-rank" data-bind="rankName">Ruine I</small>
          <span class="rkc-pts"><i class="rkc-tro">${ICONS.trophy}</i><b data-bind="rankPts">0</b></span>
          <span class="rkc-bar"><i data-bind="rankBar"></i></span>
        </span>
        <span class="rkc-next" data-bind="rankNext" aria-hidden="true"></span>
        <span class="badge" data-bind="trophyBadge" hidden></span>
      </button>
      <div class="hud-top-right">
        <button class="btn hud-tile tile-friends btn-friends" data-action="friends" aria-label="Amis">
          <span class="ht-art">${friendsArt()}</span><span class="ht-lbl">AMIS</span>
        </button>
        <button class="btn hud-tile tile-profile btn-profile" data-action="profile" aria-label="Profil">
          <span class="ht-portrait" data-bind="avatar"></span><span class="ht-rank" data-bind="profileRank"></span>
        </button>
      </div>
      <button class="btn hud-tile tile-gift btn-gift" data-action="daily" aria-label="Cadeau du jour">
        <span class="ht-art">${giftArt()}</span><span class="ht-lbl">CADEAU</span>
        <span class="badge" data-bind="giftBadge" hidden>1</span>
      </button>
    </div>

    <nav class="side-nav">
      <button class="btn btn-side2 btn-striker" data-action="collection" aria-label="Striker">
        <span class="sn-ico striker-ico">${ICONS.striker}</span><span class="btn-label">STRIKER</span>
      </button>
      <button class="btn btn-side2 btn-box" data-action="box" aria-label="Box">
        <span class="sn-ico">${ICONS.chest}</span><span class="btn-label">BOX</span>
        <span class="badge" data-bind="boxBadge" hidden></span>
      </button>
    </nav>

    <div class="hud-bottom">
      <button class="btn btn-corner btn-pass" data-action="pass" aria-label="Passe de combat">
        <span class="btn-icon">${ICONS.ulti}</span><span class="btn-label">PASSE DE COMBAT</span>
        <span class="badge" data-bind="passBadge" hidden></span>
      </button>
      <button class="btn btn-corner btn-shop-bottom" data-action="shop">
        <span class="btn-icon">${ICONS.shop}</span><span class="btn-label">BOUTIQUE</span>
      </button>
      <button class="btn btn-battle" data-action="battle">
        <span class="battle-shine"></span>
        <span class="btn-icon">${ICONS.battle}</span><span class="btn-label">COMBAT</span>
      </button>
    </div>`;

  container.querySelector('.hud-wallet').append(createWallet({ onPlus: (kind) => onShop(kind === 'coins' ? 'coins' : 'gems') }));

  const actions = { shop: onShop, friends: onFriends, collection: onCollection, box: onBox, battle: onBattle, profile: onProfile, trophies: onTrophies, pass: onPass, daily: onDaily };
  container.querySelectorAll('[data-action]').forEach((b) => {
    b.addEventListener('click', () => {
      b.classList.remove('pressed'); void b.offsetWidth; b.classList.add('pressed');
      navigator.vibrate?.(10);
      // état « sélectionné » tant que l'écran ouvert depuis ce bouton est affiché
      container.querySelectorAll('.side-nav .btn').forEach((x) => x.classList.toggle('is-open', x === b));
      actions[b.dataset.action]?.();
    });
  });

  document.addEventListener('panel:closed', () => container.querySelectorAll('.side-nav .btn').forEach((x) => x.classList.remove('is-open')));
  const bind = (k) => container.querySelector(`[data-bind="${k}"]`);
  let lastState = null;
  let lastAvatar = null;

  function render(state = lastState) {
    lastState = state;
    // bouton TROPHÉES : rang (emblème), points de classement, progression du niveau, prochaine grande récompense
    const pts = state.ranked?.points ?? 0, r = rankOf(pts), rkKey = `${r.tierIndex}-${r.level}`;
    const card = container.querySelector('.rank-card');
    if (card.dataset.rk !== rkKey) { card.dataset.rk = rkKey; bind('rankEmb').innerHTML = rankEmblem(r.tierIndex, r.level, { size: 46 }); bind('profileRank').innerHTML = rankEmblem(r.tierIndex, r.level, { size: 22, pips: false }); }
    container.querySelector('.tile-profile').style.setProperty('--rk', r.tier.main);
    card.style.setProperty('--rk', r.tier.main); card.style.setProperty('--rk-l', r.tier.light);
    // contour de tous les boutons de l'accueil aux couleurs du rang (Ruine : gris-brun, Onde : turquoise…)
    container.style.setProperty('--rank', r.tier.main); container.style.setProperty('--rank-l', r.tier.light); container.dataset.rank = r.tier.id;
    bind('rankName').textContent = r.label;
    bind('rankPts').textContent = pts.toLocaleString('fr-FR');
    bind('rankBar').style.width = `${r.isMax ? 100 : (r.progress / POINTS_PER_LEVEL) * 100}%`;
    const major = nextMajorStep(state), nr = major && resolveReward(major.reward, state);
    const nextKey = major ? `${major.id}-${nr.box ?? ''}-${!!(nr.characterSkin || nr.weaponSkin)}` : '';
    if (bind('rankNext').dataset.k !== nextKey) {
      bind('rankNext').dataset.k = nextKey;
      bind('rankNext').innerHTML = major ? `<span class="rkn-ic">${nr.characterSkin || nr.weaponSkin ? ICONS.skin : nr.box ? boxArt(nr.box) : nr.gems ? ICONS.gem : ICONS.coin}</span><small>${major.points.toLocaleString('fr-FR')}</small>` : '';
      bind('rankNext').hidden = !major;
    }
    card.setAttribute('aria-label', `Trophées : ${r.label}, ${pts.toLocaleString('fr-FR')} trophées${major ? `, prochaine grande récompense à ${major.points.toLocaleString('fr-FR')} trophées` : ''}`);
    const tb = bind('trophyBadge');
    const claim = rankedClaimable(state);
    tb.hidden = !claim; tb.textContent = claim;
    card.classList.toggle('has-reward', claim > 0);
    const gift = dailyStatus(Date.now(), state).claimable;
    bind('giftBadge').hidden = !gift;
    container.querySelector('.btn-gift').classList.toggle('glow', gift);
    const pb = bind('passBadge'), pc = passClaimable(state);
    pb.hidden = !pc; pb.textContent = pc;
    if (state.avatar !== lastAvatar) { lastAvatar = state.avatar; bind('avatar').innerHTML = avatarSvg(state.avatar); }
    // Badge BOX : nombre total de box à ouvrir (vert s'il y a des box gratuites).
    const box = bind('boxBadge');
    const free = freeBoxStatus().stored;
    const n = free + totalBoxes();
    box.hidden = !n;
    box.textContent = n;
    box.classList.toggle('free', free > 0);
    container.querySelector('.btn-box').classList.toggle('glow', free > 0);
  }
  // La box gratuite peut devenir disponible pendant que le joueur est sur l'écran principal.
  setInterval(() => lastState && render(), 5000);
  return { render };
}
