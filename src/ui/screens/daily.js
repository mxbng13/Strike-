// CADEAUX : récompense de connexion du jour (cycle de 7 jours, la série repart à zéro si on saute un jour).
import { DAILY_REWARDS } from '../../data/daily.js';
import { dailyStatus, claimDaily } from '../../game/daily.js';
import { rewardView } from './pass.js';
import { ICONS } from '../icons.js';
import { showPanel, toast } from '../panel.js';
import { sfx } from '../../audio/sfx.js';

const parts = (r) => Object.entries(r).map(([k, v]) => ({ [k]: v }));

export function openDaily() {
  const el = document.createElement('div');
  el.className = 'daily-screen';
  function render() {
    const st = dailyStatus();
    el.innerHTML = `
      <p class="dl-intro">${st.claimable ? 'Ton cadeau du jour t’attend !' : 'Cadeau du jour récupéré. Reviens demain pour le suivant !'}${st.streakBroken ? '<br><small>Tu as manqué un jour : la série recommence au jour 1.</small>' : ''}</p>
      <div class="dl-grid">${DAILY_REWARDS.map((r, i) => {
        const done = st.claimedToday ? i <= st.day : i < st.day;
        const today = i === st.day && st.claimable;
        return `
          <div class="dl-day ${done ? 'done' : ''} ${today ? 'today' : ''} ${i === 6 ? 'big' : ''}">
            <span class="dl-n">JOUR ${i + 1}</span>
            <span class="dl-items">${parts(r).map((p) => { const v = rewardView(p); return `<span class="dl-it ${v.cls}"><i>${v.icon}</i><b>${v.label}</b></span>`; }).join('')}</span>
            ${done ? `<span class="dl-ok">${ICONS.check}</span>` : ''}
          </div>`;
      }).join('')}</div>
      <button class="r-btn wide dl-claim" ${st.claimable ? '' : 'disabled'}>${st.claimable ? `RÉCUPÉRER LE JOUR ${st.day + 1}` : 'À DEMAIN !'}</button>`;
  }
  el.addEventListener('click', (e) => {
    if (!e.target.closest('.dl-claim')) return;
    const r = claimDaily();
    if (r.ok) { sfx('claim'); navigator.vibrate?.([20, 30, 40]); toast(`Jour ${r.day + 1} récupéré !`, '#ffb422', 'ok'); }
    render();
  });
  render();
  showPanel({ title: 'CADEAUX', subtitle: 'Connecte-toi chaque jour', icon: ICONS.gift, accent: '#ffb422', content: el });
}
