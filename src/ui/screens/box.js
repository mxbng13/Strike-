// MES BOX : deux onglets.
//  - GRATUITES : une box normale offerte toutes les 5 heures, jusqu'à 5 en stock.
//  - ACHETÉES  : les box achetées dans la boutique, pas encore ouvertes.
import { BOX_TYPES, BOX_ORDER, FREE_BOX } from '../../data/boxes.js';
import { freeBoxStatus, totalBoxes } from '../../game/boxService.js';
import { save } from '../../save/storage.js';
import { ICONS } from '../icons.js';
import { boxArt } from '../boxArt.js';
import { showPanel } from '../panel.js';
import { tabs } from '../tabs.js';
import { playOpening } from './boxOpening.js';
import { openShop } from './shop.js';

const two = (n) => String(n).padStart(2, '0');
export function formatCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 3600)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
}

let lastTab = 0; // 0 = Gratuites, 1 = Achetées
let opening = false; // un seul clic « OUVRIR » pris en compte à la fois

async function open(type, source, after) {
  if (opening) return;
  opening = true;
  await playOpening(type, source);
  opening = false;
  after();
}

function freeView(refreshAll) {
  const el = document.createElement('div');
  el.className = 'mybox';
  el.innerHTML = `
    <section class="free-card">
      <div class="fc-art">${boxArt(FREE_BOX.type)}<span class="fb-ribbon">GRATUIT</span><span class="mb-qty"></span></div>
      <h3>Box gratuites</h3>
      <p class="fc-desc">Une ${BOX_TYPES[FREE_BOX.type].name.toLowerCase()} offerte toutes les 5 heures. Tu peux en garder jusqu’à ${FREE_BOX.maxStored}.</p>
      <div class="slots" aria-hidden="true"></div>
      <p class="fc-timer"></p>
      <button class="open-btn big" data-open-free>OUVRIR</button>
    </section>
    <p class="save-note">Progression sauvegardée sur cet appareil uniquement (pas de synchronisation entre appareils).</p>`;
  const btn = el.querySelector('[data-open-free]');
  function render() {
    const st = freeBoxStatus();
    el.querySelector('.mb-qty').textContent = `x${st.stored}`;
    el.querySelector('.slots').innerHTML = Array.from({ length: st.max }, (_, i) => `<i class="${i < st.stored ? 'on' : ''}"></i>`).join('');
    el.querySelector('.fc-timer').innerHTML = st.full
      ? `${ICONS.check}<span>Stockage plein (${st.stored}/${st.max}) : ouvre une box pour relancer le compteur</span>`
      : `${ICONS.clock}<span>Prochaine box gratuite dans <b>${formatCountdown(st.nextInMs)}</b></span>`;
    el.querySelector('.fc-timer').classList.toggle('full', st.full);
    btn.disabled = st.stored < 1;
    btn.textContent = st.stored ? `OUVRIR (${st.stored}/${st.max})` : 'AUCUNE BOX GRATUITE';
  }
  btn.addEventListener('click', () => !btn.disabled && open(FREE_BOX.type, 'free', refreshAll));
  render();
  const timer = setInterval(() => (el.isConnected ? render() : clearInterval(timer)), 1000);
  return el;
}

function boughtView(refreshAll) {
  const el = document.createElement('div');
  el.className = 'mybox';
  const s = save.get();
  const owned = BOX_ORDER.filter((id) => s.boxes[id] > 0);
  el.innerHTML = owned.length
    ? `<div class="box-cards">${owned.map((id) => {
        const b = BOX_TYPES[id];
        return `
          <article class="my-box tier-${id}">
            <div class="mb-art">${boxArt(id)}<span class="mb-qty">x${s.boxes[id]}</span></div>
            <div class="mb-info">
              <span class="tier-tag">${b.tier}</span>
              <h3>${b.name}</h3>
              <button class="open-btn" data-open="${id}">OUVRIR</button>
            </div>
          </article>`;
      }).join('')}</div>
      <button class="r-btn ghost wide" data-shop>${ICONS.shop} ACHETER D’AUTRES BOX</button>`
    : `<div class="box-empty">
        <div class="be-art">${boxArt('rare')}</div>
        <h3>Aucune box achetée</h3>
        <p>Les box que tu achètes dans la boutique arrivent ici. Tu peux aussi ouvrir tes box gratuites dans l’autre onglet.</p>
        <button class="r-btn" data-shop>${ICONS.shop} BOUTIQUE</button>
      </div>`;
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-shop]')) { openShop('box'); return; }
    const b = e.target.closest('[data-open]');
    if (b) open(b.dataset.open, 'bought', refreshAll);
  });
  return el;
}

export function openBox(initial = lastTab) {
  const wrap = document.createElement('div');
  let panel = null;
  const subtitle = () => {
    const f = freeBoxStatus().stored, b = totalBoxes();
    panel?.setSubtitle(`${f + b} box disponible${f + b > 1 ? 's' : ''}`);
  };
  const tabLabels = () => [`Gratuites (${freeBoxStatus().stored}/${FREE_BOX.maxStored})`, `Achetées (${totalBoxes()})`];
  const t = tabs([
    { label: tabLabels()[0], render: () => freeView(refreshAll) },
    { label: tabLabels()[1], render: () => boughtView(refreshAll) },
  ], initial);
  t.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) lastTab = +b.dataset.i; });
  function refreshAll() {
    t.querySelectorAll('[role=tab]').forEach((b, i) => (b.textContent = tabLabels()[i]));
    subtitle();
    t.show(lastTab);
  }
  wrap.append(t);
  // Les libellés suivent l'arrivée d'une nouvelle box gratuite pendant que l'écran est ouvert.
  const labelTimer = setInterval(() => { t.querySelectorAll('[role=tab]').forEach((b, i) => (b.textContent = tabLabels()[i])); subtitle(); }, 1000);
  panel = showPanel({ title: 'MES BOX', icon: ICONS.chest, accent: '#ffb422', content: wrap, onClose: () => clearInterval(labelTimer) });
  subtitle();

  // Un résultat d'ouverture n'a pas été affiché (jeu fermé pendant l'animation) : on le montre.
  const p = save.get().pendingReveal;
  if (p) open(p.box, p.source ?? 'bought', refreshAll);
}
