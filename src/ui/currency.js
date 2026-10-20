// Compteurs de pièces et de diamants, réutilisés sur l'écran principal et dans les menus.
// Se mettent à jour tout seuls à chaque modification de la sauvegarde.
import { ICONS } from './icons.js';
import { save } from '../save/storage.js';
import { rankOf } from '../data/ranked.js';
import { rankEmblem } from './rankEmblem.js';

const fmt = (n) => n.toLocaleString('fr-FR');

/** @param {{ onPlus?: (kind: 'coins'|'gems') => void, compact?: boolean, ranked?: boolean }} opts
 * ranked : ajoute les trophées du joueur (classement) (avec l'emblème du rang) à gauche des pièces et des diamants. */
export function createWallet({ onPlus, compact = false, ranked = false } = {}) {
  const el = document.createElement('div');
  el.className = `wallet-ui${compact ? ' compact' : ''}${ranked ? ' with-ranked' : ''}`;
  const kinds = ranked ? ['ranked', 'coins', 'gems'] : ['coins', 'gems'];
  el.innerHTML = (ranked ? `
    <div class="cur-pill rkp" data-kind="ranked" aria-label="Trophées">
      <span class="cur-ico" data-rk-emb></span>
      <b data-v="ranked">0</b><small class="rkp-tro">${ICONS.trophy}</small>
    </div>` : '') + ['coins', 'gems'].map((k) => `
    <div class="cur-pill" data-kind="${k}" aria-label="${k === 'coins' ? 'Pièces' : 'Diamants'}">
      <span class="cur-ico">${k === 'coins' ? ICONS.coin : ICONS.gem}</span>
      <b data-v="${k}">0</b>
      ${onPlus ? `<button class="cur-plus" data-plus="${k}" aria-label="Obtenir des ${k === 'coins' ? 'pièces' : 'diamants'}">${ICONS.plus}</button>` : ''}
    </div>`).join('');
  const last = {};
  let lastRank = '';
  const valueOf = (s, k) => (k === 'ranked' ? s.ranked?.points ?? 0 : s[k] ?? 0);
  function render(s) {
    if (ranked) {
      const r = rankOf(valueOf(s, 'ranked')), key = `${r.tierIndex}-${r.level}`;
      if (key !== lastRank) { lastRank = key; el.querySelector('[data-rk-emb]').innerHTML = rankEmblem(r.tierIndex, r.level, { size: 26, pips: false }); }
      el.querySelector('.rkp').style.setProperty('--rk', r.tier.light);
    }
    for (const k of kinds) {
      const v = valueOf(s, k);
      const node = el.querySelector(`[data-v="${k}"]`);
      node.textContent = fmt(v);
      if (last[k] !== undefined && last[k] !== v) {
        const pill = node.parentElement;
        pill.classList.remove('up', 'down'); void pill.offsetWidth;
        pill.classList.add(v > last[k] ? 'up' : 'down');
      }
      last[k] = v;
    }
  }
  render(save.get());
  const unsub = save.subscribe(render);
  if (onPlus) el.addEventListener('click', (e) => { const b = e.target.closest('[data-plus]'); if (b) onPlus(b.dataset.plus); });
  el.destroy = unsub;
  return el;
}
