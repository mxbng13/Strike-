// Animation de passage à un nouveau palier (Or / Diamant).
import { getPortrait } from '../render/portraits.js';

export function celebrateTier(def, tier) {
  const el = document.createElement('div');
  el.className = `tier-up tier-${tier.id}`;
  el.style.setProperty('--rk', tier.color);
  el.innerHTML = `
    <div class="tu-rays"></div>
    <div class="tu-card">
      <img src="${getPortrait(def, tier.id)}" alt="" />
      <p class="tu-label">NOUVEAU PALIER</p>
      <h2>${tier.label.toUpperCase()}</h2>
      <p class="tu-name">${def.name} atteint le palier ${tier.label} : stats +${Math.round(tier.statBonus * 100)} %</p>
      <button class="r-btn">GÉNIAL !</button>
    </div>`;
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  const close = () => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); };
  el.querySelector('button').addEventListener('click', close);
}
