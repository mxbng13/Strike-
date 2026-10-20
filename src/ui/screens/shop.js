// BOUTIQUE : Du jour (skins du jour + packs en promo), Box, Pièces (argent réel,
// paiement pas encore connecté).
import { BOX_TYPES, BOX_ORDER } from '../../data/boxes.js';
import { RARITIES, RARITY_ORDER } from '../../data/rarities.js';
import { buyBox } from '../../game/boxService.js';
import { COIN_PACKS, GEM_PACKS, CURRENCY } from '../../data/shopOffers.js';
import { getCharacter } from '../../data/characters.js';
import { weaponOf } from '../../data/weapons.js';
import { dailyOffers, buyDaily, isSoldOut, msUntilTomorrow } from '../../game/dailyShop.js';
import { requestPurchase, paymentsAvailable } from '../../game/payments.js';
import { weaponPortrait, skinPreview } from '../../render/portraits.js';
import { save } from '../../save/storage.js';
import { ICONS } from '../icons.js';
import { boxArt } from '../boxArt.js';
import { showPanel, toast } from '../panel.js';
import { tabs } from '../tabs.js';

export const pct = (v) => `${String(v).replace('.', ',')} %`;
export const priceHtml = (p) => p.gems
  ? `<span class="pi">${ICONS.gem}</span>${p.gems.toLocaleString('fr-FR')}`
  : `<span class="pi">${ICONS.coin}</span>${p.coins.toLocaleString('fr-FR')}`;

function refuse(btn, msg) {
  btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake');
  navigator.vibrate?.([30, 40, 30]);
  toast(msg, '#ff5c7a', 'error');
}

export function ratesHtml(rates) {
  return `<ul class="rates">${RARITY_ORDER.map((r) =>
    `<li style="--rarity:${RARITIES[r].color}"><span>${RARITIES[r].label}</span><b>${pct(rates[r])}</b></li>`).join('')}</ul>`;
}

function boxesView(goToBox) {
  const el = document.createElement('div');
  el.className = 'shop-list';
  for (const id of BOX_ORDER) {
    const box = BOX_TYPES[id];
    const card = document.createElement('article');
    card.className = `shop-box tier-${id}`;
    card.innerHTML = `
      <div class="sb-art">${boxArt(id)}</div>
      <div class="sb-info">
        <span class="tier-tag">${box.tier}</span>
        <h3>${box.name}</h3>
        <div class="sb-buy">
          <span class="price">${priceHtml(box.price)}</span>
          <button class="buy-btn">ACHETER</button>
        </div>
      </div>`;
    const btn = card.querySelector('.buy-btn');
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const res = buyBox(id);
      if (!res.ok) return refuse(btn, res.error === 'gems' ? 'Pas assez de diamants pour cette box.' : 'Pas assez de pièces pour cette box.');
      btn.disabled = true; // anti double-tap
      setTimeout(() => (btn.disabled = false), 350);
      toast(`${box.name} ajoutée à MES BOX`, '#5cffc4', 'ok');
      const art = card.querySelector('.box-art');
      art.classList.remove('bought'); void art.getBoundingClientRect(); art.classList.add('bought');
    });
    el.append(card);
  }
  const go = document.createElement('button');
  go.className = 'r-btn ghost wide';
  go.innerHTML = `${ICONS.chest} VOIR MES BOX`;
  go.addEventListener('click', goToBox);
  el.append(go);
  return el;
}

// --- Pièces et Diamants (argent réel : interface prête, paiement pas encore connecté) ---
const euro = (v) => v.toLocaleString('fr-FR', { style: 'currency', currency: CURRENCY });
// Tas de diamants qui grossit avec le pack : [taille %, x %, y %, rotation°] (le premier est devant)
const GEM_PILES = [
  [[78, 50, 52, 0]],
  [[72, 40, 54, -6], [52, 72, 62, 10]],
  [[66, 50, 50, 0], [48, 24, 64, -14], [48, 76, 64, 12]],
  [[62, 50, 42, 0], [46, 22, 58, -16], [46, 78, 58, 14], [38, 36, 74, -4], [38, 64, 74, 6]],
  [[62, 50, 36, 0], [44, 20, 50, -18], [44, 80, 50, 16], [38, 33, 68, -6], [38, 67, 68, 8], [32, 50, 76, 0]],
];
function packCard(p, kind, i, n) {
  const ico = kind === 'coins' ? ICONS.coin : ICONS.gem;
  const amount = kind === 'coins' ? p.coins : p.gems;
  const art = kind === 'gems'
    ? `<span class="offer-ico gem-pile">${[...GEM_PILES[Math.min(i, GEM_PILES.length - 1)]].reverse().map(([sz, x, y, r]) => `<i style="width:${sz}%;left:${x}%;top:${y}%;transform:translate(-50%,-50%) rotate(${r}deg)">${ICONS.gem}</i>`).join('')}</span>`
    : `<span class="offer-ico coin-stack">${ico}${i >= 2 ? ico : ''}${i >= 4 ? ico : ''}</span>`;
  return `
    <article class="offer ${kind}-offer ${i === n - 1 ? 'best' : ''}">
      ${art}
      <b class="offer-amount">${amount.toLocaleString('fr-FR')}</b>
      <span class="offer-sub">${kind === 'coins' ? 'pièces' : 'diamants'}</span>
      <button class="buy-btn" data-pack="${p.productId}">${euro(p.price)}</button>
    </article>`;
}
/** Packs de pièces OU de diamants (onglets séparés). */
function packsView(kind) {
  const el = document.createElement('div');
  el.className = `offer-grid ${kind}-grid`;
  const packs = kind === 'coins' ? COIN_PACKS : GEM_PACKS;
  el.innerHTML = `<h4 class="f-sec offer-title"><span class="pi">${kind === 'coins' ? ICONS.coin : ICONS.gem}</span> ${kind === 'coins' ? 'Pièces' : 'Diamants'}</h4>`
    + packs.map((p, i) => packCard(p, kind, i, packs.length)).join('')
    + `<p class="pay-note">${paymentsAvailable() ? '' : 'Les achats ne sont pas encore disponibles : aucun système de paiement n’est connecté. Aucune somme n’est débitée et rien n’est crédité.'}</p>`;
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pack]');
    if (!b || b.disabled) return;
    b.disabled = true;
    const res = await requestPurchase(b.dataset.pack); // ne crédite qu'après validation du paiement
    b.disabled = false;
    if (res.ok) toast(res.coins ? `+${res.coins.toLocaleString('fr-FR')} pièces` : `+${res.gems.toLocaleString('fr-FR')} diamants`, '#ffb422', 'ok');
    else if (res.error === 'unavailable') toast('Achats pas encore disponibles : paiement non connecté.', '#ff5c7a', 'error');
    else if (res.error !== 'cancelled') toast('Paiement non validé : rien n’a été crédité.', '#ff5c7a', 'error');
  });
  return el;
}

// --- Boutique du jour : 1 skin de personnage + 1 skin d'arme (changent chaque jour) et packs en promo ---
const BOX_LABEL = { normale: 'Box normale', rare: 'Box rare', legendaire: 'Box légendaire' };
function untilText(ms) {
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}
function dailyView() {
  const el = document.createElement('div');
  el.className = 'daily-shop';
  function render() {
    const o = dailyOffers();
    const s = save.get();
    const skinCard = (offer, kind) => {
      if (!offer) return '';
      const k = offer.skin, r = RARITIES[k.rarity], sold = isSoldOut(offer.id);
      const img = kind === 'character' ? skinPreview(k) : weaponPortrait(weaponOf(s.selected).id, k.id);
      const sub = kind === 'character' ? `Skin de ${getCharacter(k.strikerId)?.name ?? '?'}` : 'Skin d’arme';
      return `
        <article class="ds-skin ${sold ? 'sold' : ''}" style="--rarity:${r.color}">
          <span class="ds-art"><img src="${img}" alt="" /></span>
          <span class="cc-rarity">${r.label}</span>
          <b class="ds-name">${k.name}</b>
          <small>${sub}</small>
          <button class="buy-btn" data-daily="${offer.id}" ${sold ? 'disabled' : ''}>${sold ? 'POSSÉDÉ' : priceHtml(offer.price)}</button>
        </article>`;
    };
    const packCard = (p) => {
      const sold = isSoldOut(p.id);
      const boxes = Object.entries(p.boxes);
      return `
        <article class="ds-pack ${sold ? 'sold' : ''}">
          <span class="ds-off">−${p.discount} %</span>
          <div class="ds-pack-art">${boxes.map(([id, n]) => `<span class="ds-box">${boxArt(id)}<i>×${n}</i></span>`).join('')}<span class="ds-coins"><span class="pi">${ICONS.coin}</span>${p.coins.toLocaleString('fr-FR')}</span></div>
          <div class="ds-pack-info">
            <h3>${p.name}</h3>
            <p>${boxes.map(([id, n]) => `${n} × ${BOX_LABEL[id]}`).join(' · ')} · ${p.coins.toLocaleString('fr-FR')} pièces</p>
            <div class="sb-buy">
              <s class="ds-old">${priceHtml(p.value)}</s>
              <button class="buy-btn" data-daily="${p.id}" ${sold ? 'disabled' : ''}>${sold ? 'ACHETÉ' : priceHtml(p.price)}</button>
            </div>
          </div>
        </article>`;
    };
    el.innerHTML = `
      <div class="ds-head"><h4 class="f-sec">Boutique du jour</h4><span class="ds-timer">${ICONS.clock ?? ''}Nouvelles offres dans <b>${untilText(msUntilTomorrow())}</b></span></div>
      <div class="ds-skins">${skinCard(o.characterSkin, 'character')}${skinCard(o.weaponSkin, 'weapon')}</div>
      <h4 class="f-sec">Packs du jour <span class="ds-note">1 achat par pack et par jour</span></h4>
      <div class="ds-packs">${o.packs.map(packCard).join('')}</div>
      <p class="shop-note">Les skins changent l’apparence, pas les statistiques.</p>`;
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-daily]');
    if (!b || b.disabled) return;
    b.disabled = true; // anti double-achat
    const res = buyDaily(b.dataset.daily);
    if (!res.ok) {
      b.disabled = false;
      if (res.error === 'unavailable') { toast('Cette offre n’est plus disponible : nouvelles offres du jour !', '#ff5c7a', 'error'); render(); return; }
      return refuse(b, res.error === 'gems' ? 'Pas assez de diamants.' : res.error === 'coins' ? 'Pas assez de pièces.' : 'Déjà acheté aujourd’hui.');
    }
    const of = res.offer;
    toast(of.skin ? `${of.skin.name} débloqué !` : `${of.name} : box ajoutées à MES BOX, +${of.coins.toLocaleString('fr-FR')} pièces`, '#ffb422', 'ok');
    navigator.vibrate?.([20, 30, 40]);
    render();
  });
  render();
  // le compte à rebours se met à jour ; au changement de jour, les offres se renouvellent
  let day = dailyOffers().day;
  const timer = setInterval(() => {
    if (!el.isConnected) { clearInterval(timer); return; }
    const d = dailyOffers().day;
    if (d !== day) { day = d; render(); return; }
    const t = el.querySelector('.ds-timer b'); if (t) t.textContent = untilText(msUntilTomorrow());
  }, 20000);
  return el;
}

let goToBoxImpl = () => {};
export const setShopNavigation = ({ openBox }) => { goToBoxImpl = openBox; };

export function openShop(tab = 'daily') {
  const wrap = document.createElement('div');
  const TABS = [
    { key: 'daily', label: 'Du jour', render: dailyView },
    { key: 'box', label: 'Box', render: () => boxesView(() => goToBoxImpl()) },
    { key: 'coins', label: 'Pièces', render: () => packsView('coins') },
    { key: 'gems', label: 'Diamants', render: () => packsView('gems') },
  ];
  wrap.append(tabs(TABS, Math.max(0, TABS.findIndex((t) => t.key === tab))));
  showPanel({ title: 'BOUTIQUE', icon: ICONS.shop, accent: '#ffb422', content: wrap });
}
