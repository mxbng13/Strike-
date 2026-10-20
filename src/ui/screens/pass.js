// PASSE DE COMBAT : en-tête de saison (niveau, progression, fin de saison, premium), onglets
// RÉCOMPENSES (piste gratuite / premium, 30 paliers) et MISSIONS (missions du jour).
import { PASS_REWARDS, PASS_TIER_XP, PASS_TIERS, PASS_PREMIUM, PASS_XP, MISSION_BONUS_XP, seasonAt } from '../../data/battlePass.js';
import { ensurePass, passLevel, tierState, claimTier, claimAll, missionList, claimMission } from '../../game/battlePass.js';
import { requestPurchase, paymentsAvailable } from '../../game/payments.js';
import { getCharacterSkin, getWeaponSkin } from '../../data/skins.js';
import { RARITIES } from '../../data/rarities.js';
import { save } from '../../save/storage.js';
import { ICONS } from '../icons.js';
import { showPanel, toast } from '../panel.js';
import { tabs } from '../tabs.js';
import { skinPreview, weaponPortrait } from '../../render/portraits.js';
import { sfx } from '../../audio/sfx.js';

/** Icône + texte d'une récompense. */
export function rewardView(r) {
  if (r.coins) return { cls: 'coins', icon: ICONS.coin, label: r.coins.toLocaleString('fr-FR') };
  if (r.gems) return { cls: 'gems', icon: ICONS.gem, label: r.gems };
  if (r.characterSkin) { const k = getCharacterSkin(r.characterSkin); return { cls: 'skin', img: skinPreview(k), label: k.name, rarity: k.rarity }; }
  if (r.weaponSkin) { const k = getWeaponSkin(r.weaponSkin); return { cls: 'skin', img: weaponPortrait('lumiere', k.id), label: `Skin ${k.name}`, rarity: k.rarity }; }
  return { cls: '', icon: '', label: '' };
}
const rewardText = (r) => { const v = rewardView(r); return r.coins ? `${v.label} pièces` : r.gems ? `${v.label} diamants` : v.label; };

function countdown(end) {
  const ms = Math.max(0, end - Date.now());
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return d > 0 ? `${d} j ${h} h` : `${h} h ${m} min`;
}

export function openPass(initialTab = 0) {
  ensurePass();
  const season = seasonAt();
  const root = document.createElement('div');
  root.className = 'pass-screen';
  const head = document.createElement('div');
  head.className = 'ps-head';
  let panel = null;
  let buying = false;

  function renderHead() {
    const s = save.get(), p = s.pass, lv = passLevel(p.xp);
    head.innerHTML = `
      <div class="ps-season"><span>SAISON ${season.number}</span><b>${season.name}</b><em>${ICONS.clock}Fin dans ${countdown(season.end)}</em></div>
      <div class="ps-level">
        <div class="ps-badge"><small>NIV.</small><b>${lv.tier}</b></div>
        <div class="ps-prog">
          <div class="ps-bar"><i style="width:${lv.max ? 100 : (lv.into / PASS_TIER_XP) * 100}%"></i></div>
          <span>${lv.max ? 'Passe terminé !' : `${lv.into} / ${PASS_TIER_XP} XP · palier ${lv.tier + 1}`}</span>
        </div>
      </div>
      ${p.premium
        ? `<div class="ps-premium on">${ICONS.star}<span>PREMIUM ACTIF</span></div>`
        : `<button class="ps-premium" data-premium ${buying ? 'disabled' : ''}>${ICONS.star}<span>${buying ? 'PAIEMENT EN COURS…' : 'DÉBLOQUER LE PREMIUM'}</span><b class="ps-price">${PASS_PREMIUM.label}</b></button>
           ${paymentsAvailable() ? '' : '<p class="ps-pay-note">Paiement non disponible pour le moment : aucun achat ne peut être effectué et rien n’est débité.</p>'}`}`;
  }

  // ---------- RÉCOMPENSES ----------
  const cell = (tier, track, r) => {
    const st = tierState(tier, track);
    const v = rewardView(r);
    const rc = v.rarity ? RARITIES[v.rarity].color : null;
    return `
      <button class="ps-cell ${track} ${st} ${v.cls}" data-claim="${tier}:${track}" ${st === 'claimable' ? '' : 'aria-disabled="true"'} ${rc ? `style="--rarity:${rc}"` : ''}>
        <span class="ps-ic">${v.img ? `<img src="${v.img}" alt="" />` : v.icon}</span>
        <span class="ps-lbl">${v.label}</span>
        ${st === 'claimed' ? `<span class="ps-st ps-st-ok">${ICONS.check}</span>` : st === 'premium' || (track === 'premium' && !save.get().pass.premium) ? `<span class="ps-st ps-st-lock">${ICONS.lock}</span>` : st === 'claimable' ? '<span class="ps-st ps-st-go">!</span>' : ''}
      </button>`;
  };
  function renderRewards() {
    const s = save.get(), lv = passLevel(s.pass.xp);
    const n = PASS_REWARDS.reduce((a, { tier }) => a + ['free', 'premium'].filter((tr) => tierState(tier, tr, s) === 'claimable').length, 0);
    const el = document.createElement('div');
    el.className = 'ps-track';
    el.innerHTML = `
      <div class="ps-cols"><span>GRATUIT</span><span></span><span class="prem">${ICONS.star} PREMIUM</span></div>
      ${n ? `<button class="r-btn wide ps-all" data-all>TOUT RÉCUPÉRER (${n})</button>` : ''}
      ${PASS_REWARDS.map(({ tier, free, premium }) => `
        <div class="ps-row ${lv.tier >= tier ? 'reached' : ''} ${lv.tier + 1 === tier ? 'next' : ''}" data-tier="${tier}">
          ${cell(tier, 'free', free)}
          <span class="ps-num"><b>${tier}</b></span>
          ${cell(tier, 'premium', premium)}
        </div>`).join('')}`;
    // place la liste sur le palier en cours
    requestAnimationFrame(() => {
      const row = el.querySelector(`[data-tier="${Math.max(1, Math.min(PASS_TIERS, lv.tier))}"]`);
      const body = el.closest('.panel-body');
      if (row && body && lv.tier > 2) body.scrollTo({ top: row.offsetTop - 220 });
    });
    return el;
  }

  // ---------- MISSIONS ----------
  function renderMissions() {
    const s = save.get();
    const list = missionList(s);
    const el = document.createElement('div');
    el.className = 'ps-missions';
    const tomorrow = new Date(); tomorrow.setHours(24, 0, 0, 0);
    el.innerHTML = `
      <p class="ps-mhead">${ICONS.clock}<span>Nouvelles missions dans ${countdown(tomorrow.getTime())}</span></p>
      ${list.map((m) => `
        <div class="ps-mission ${m.done ? 'done' : ''} ${m.claimed ? 'claimed' : ''}">
          <div class="pm-txt"><b>${m.text}</b>
            <div class="pm-bar"><i style="width:${(m.progress / m.target) * 100}%"></i></div>
            <small>${m.progress.toLocaleString('fr-FR')} / ${m.target.toLocaleString('fr-FR')}</small></div>
          ${m.claimed ? `<span class="pm-ok">${ICONS.check}</span>` : `<button class="pm-claim" data-mission="${m.id}" ${m.done ? '' : 'disabled'}>+${m.xp}<small>XP</small></button>`}
        </div>`).join('')}
      <div class="ps-mission bonus ${s.pass.bonus ? 'claimed' : ''}">
        <div class="pm-txt"><b>Bonus : récupère les 3 missions du jour</b><small>${list.filter((m) => m.claimed).length} / ${list.length}</small></div>
        ${s.pass.bonus ? `<span class="pm-ok">${ICONS.check}</span>` : `<span class="pm-bonus">+${MISSION_BONUS_XP}<small>XP</small></span>`}
      </div>
      <p class="ps-how">L’XP sert uniquement au passe. Gagne-la en combattant dans l’arène : <b>+${PASS_XP.arenaWin}</b> par victoire, <b>+${PASS_XP.arenaLoss}</b> par défaite.</p>`;
    return el;
  }

  const t = tabs([{ label: 'RÉCOMPENSES', render: renderRewards }, { label: 'MISSIONS', render: renderMissions }], initialTab);
  root.append(head, t);
  const refresh = () => { renderHead(); const i = [...t.querySelectorAll('[role=tab]')].findIndex((b) => b.getAttribute('aria-selected') === 'true'); t.show(Math.max(0, i)); };

  root.addEventListener('click', (e) => {
    const c = e.target.closest('[data-claim]');
    if (c) {
      const [tier, track] = c.dataset.claim.split(':');
      const st = tierState(+tier, track);
      if (st === 'premium') { toast('Débloque le Premium pour cette récompense', '#ffb422', 'error'); return; }
      if (st === 'locked') { toast(`Atteins le palier ${tier} pour la récupérer`, '#b45cff', 'error'); return; }
      const r = claimTier(+tier, track);
      if (r.ok) { sfx('claim'); navigator.vibrate?.(20); toast(`Récupéré : ${rewardText(r.reward)}`, '#5cffc4', 'ok'); c.classList.add('pop'); setTimeout(refresh, 250); }
      return;
    }
    if (e.target.closest('[data-all]')) {
      const got = claimAll();
      if (got.length) { sfx('claim'); navigator.vibrate?.([20, 30, 40]); toast(`${got.length} récompense${got.length > 1 ? 's' : ''} récupérée${got.length > 1 ? 's' : ''}`, '#5cffc4', 'ok'); }
      refresh(); return;
    }
    const m = e.target.closest('[data-mission]');
    if (m && !m.disabled) {
      const r = claimMission(m.dataset.mission);
      if (r.ok) { navigator.vibrate?.(20); toast(`+${r.xp + r.bonus} XP de passe${r.bonus ? ' (bonus du jour inclus)' : ''}${r.after > r.before ? ` · palier ${r.after} atteint !` : ''}`, '#b45cff', 'ok'); }
      refresh(); return;
    }
    if (e.target.closest('[data-premium]') && !buying) buy();
  });

  // Achat du premium (7,99 €) : passe par le système de paiement du store ; le premium n'est débloqué
  // qu'après validation du paiement (game/payments.js). Sans système de paiement : rien n'est débité.
  async function buy() {
    if (save.get().pass.premium) { toast('Premium déjà actif', '#ffb422'); return; }
    if (!paymentsAvailable()) { toast('Paiement non disponible : aucun achat n’a été effectué', '#ff5c7a', 'error'); return; }
    buying = true; renderHead();
    const r = await requestPurchase(PASS_PREMIUM.productId);
    buying = false;
    if (r.ok) { navigator.vibrate?.([30, 40, 60]); toast('Paiement validé : Premium débloqué !', '#ffb422', 'ok'); }
    else toast(r.error === 'owned' || r.error === 'duplicate' ? 'Premium déjà actif' : r.error === 'invalid' ? 'Paiement refusé : premium non débloqué' : 'Achat annulé : rien n’a été débité', '#ff5c7a', 'error');
    if (root.isConnected) refresh();
  }

  renderHead();
  panel = showPanel({ title: 'PASSE', subtitle: `Saison ${season.number} · ${season.name}`, icon: ICONS.ulti, accent: '#b45cff', content: root });
  return panel;
}
