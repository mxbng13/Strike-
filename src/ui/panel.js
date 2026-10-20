// Écran de menu plein écran (glisse depuis le bas), réutilisé par tous les menus.
// En-tête commun : bouton retour, titre (+ sous-titre), pièces et diamants toujours visibles.
import { ICONS } from './icons.js';
import { createWallet } from './currency.js';

const root = () => document.getElementById('panel-root');
let openPanel = null;

/**
 * @param {{ title: string, subtitle?: string, icon?: string, accent?: string, content: HTMLElement | string,
 *           onClose?: () => void, onBack?: () => void, animate?: boolean, ranked?: boolean }} opts
 * ranked : affiche aussi les points de classement, à gauche des pièces et des diamants.
 * onBack : action du bouton retour (par défaut : retour à l'écran principal).
 */
export function showPanel({ title, subtitle = '', icon = '', accent = '#7fe0ff', content, onClose, onBack, animate = true, ranked = false }) {
  closePanel(true);
  const el = document.createElement('div');
  el.className = `panel${ranked ? ' with-ranked' : ''}`;
  el.style.setProperty('--accent', accent);
  el.innerHTML = `
    <div class="panel-backdrop"></div>
    <section class="panel-sheet" role="dialog" aria-label="${title}">
      <header class="panel-head">
        <button class="panel-back" aria-label="Retour">${ICONS.back}</button>
        <div class="panel-title">
          <h2>${icon ? `<span class="panel-icon">${icon}</span>` : ''}${title}</h2>
          <p class="panel-subtitle"${subtitle ? '' : ' hidden'}>${subtitle}</p>
        </div>
        <div class="panel-wallet"></div>
      </header>
      <div class="panel-body"></div>
    </section>`;
  const wallet = createWallet({ compact: true, ranked });
  el.querySelector('.panel-wallet').append(wallet);
  const body = el.querySelector('.panel-body');
  if (typeof content === 'string') body.innerHTML = content; else body.append(content);
  const close = () => closePanel();
  el.querySelector('.panel-back').addEventListener('click', () => {
    if (onBack) { closePanel(true); onBack(); } else close();
  });
  el.querySelector('.panel-backdrop').addEventListener('click', close);
  if (!animate) el.classList.add('open', 'no-anim');
  root().append(el);
  requestAnimationFrame(() => el.classList.add('open'));
  // en-tête chargé (points de classement) : si le titre n'a plus la place sur un petit écran, on le masque
  // plutôt que de le laisser passer sous les compteurs.
  let ro = null;
  if (ranked) {
    const titleEl = el.querySelector('.panel-title');
    const fit = () => { titleEl.classList.remove('clip'); titleEl.classList.toggle('clip', titleEl.querySelector('h2').scrollWidth > titleEl.clientWidth + 1); };
    ro = new ResizeObserver(fit); ro.observe(el.querySelector('.panel-head'));
    document.fonts?.ready.then(fit);
  }
  openPanel = { el, onClose, wallet, ro };
  const setSubtitle = (text) => {
    const p = el.querySelector('.panel-subtitle');
    p.textContent = text;
    p.hidden = !text;
  };
  return { close, body, setSubtitle };
}

export function closePanel(instant = false) {
  if (!openPanel) return;
  const { el, onClose, wallet, ro } = openPanel;
  openPanel = null;
  wallet.destroy();
  ro?.disconnect();
  onClose?.();
  if (!instant) document.dispatchEvent(new Event('panel:closed'));
  if (instant) { el.remove(); return; }
  el.classList.remove('open');
  setTimeout(() => el.remove(), 280);
}

/** Message bref. kind : 'ok' | 'error' | 'info'. */
export function toast(text, color = '#5cffc4', kind = 'info') {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.style.setProperty('--accent', kind === 'error' ? '#ff5c7a' : color);
  t.setAttribute('role', 'status');
  t.innerHTML = `<span class="toast-ic">${kind === 'error' ? ICONS.close : ICONS.check}</span><span>${text}</span>`;
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2000);
}
