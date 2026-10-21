// « Untel te défie ! » : bandeau qui apparaît quand un ami (compte en ligne) nous envoie un défi.
// REJOINDRE ouvre directement sa salle de combat amical ; pendant un combat, le défi est seulement signalé.
import { onInvite } from '../net/friendsOnline.js';
import { openFriendMatch } from './screens/friendMatch.js';
import { closePanel, toast } from './panel.js';
import { avatarSvg } from './avatar.js';
import { ICONS } from './icons.js';

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function initInviteBanner() {
  onInvite(({ code, from }) => {
    if (document.getElementById('arena')) { toast(`${from.name} te défie : termine ton combat puis va dans Amis`, '#5cc8ff', 'info'); return; }
    document.querySelector('.inv-banner')?.remove();
    const el = document.createElement('div');
    el.className = 'inv-banner';
    el.setAttribute('role', 'alertdialog');
    el.innerHTML = `
      <span class="inv-av">${avatarSvg(from.avatar)}</span>
      <div class="inv-txt"><b>${esc(from.name)}</b><small>te défie en duel !</small></div>
      <button class="inv-no" data-inv-no aria-label="Refuser">${ICONS.close}</button>
      <button class="inv-yes" data-inv-yes>${ICONS.battle}REJOINDRE</button>`;
    document.body.append(el);
    navigator.vibrate?.([30, 40, 30]);
    const timer = setTimeout(() => el.remove(), 30000);
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-inv-no]')) { clearTimeout(timer); el.remove(); }
      if (e.target.closest('[data-inv-yes]')) { clearTimeout(timer); el.remove(); closePanel(true); openFriendMatch({ join: code }); }
    });
  });
}
