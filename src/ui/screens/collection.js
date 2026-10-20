// STRIKERS (collection), en deux onglets : STRIKERS (grille + filtre, puis la carte de chaque Striker) et ACTIF
// (la carte du Striker actuellement utilisé). Chaque carte montre le personnage, son statut (actif ou non), ses
// skins possédés, puis en bas SON arme (et ses skins d'armes) et SON ulti. Changer de Striker actif met tout à
// jour immédiatement. Les personnages inconnus restent anonymes ; les skins non possédés ne sont jamais montrés.
import { CHARACTERS, getCharacter, shortName } from '../../data/characters.js';
import { RARITIES, RARITY_ORDER } from '../../data/rarities.js';
import { statsAt, COMBAT_LEVEL } from '../../game/progression.js';
import { getPortrait, skinPreview } from '../../render/portraits.js';
import { mountViewer } from '../../render/characterViewer.js';
import { nextTier } from '../../data/ranks.js';
import { rankFor } from '../../game/ranks.js';
import { strikerTrophies } from '../../game/trophies.js';
import { equippedWeapon } from '../../game/weapons.js';
import { appearanceFor } from '../../game/appearance.js';
import { equippedCharacterSkin, equipCharacterSkin, equippedWeaponSkin, equipWeaponSkin, ownedSkinsFor, ownedWeaponSkinsFor } from '../../game/skins.js';
import { getWeapon } from '../../data/weapons.js';
import { weaponPortrait } from '../../render/portraits.js';
import { ultiOf } from '../../data/ultis.js';
import { tabs } from '../tabs.js';
import { save } from '../../save/storage.js';
import { ICONS } from '../icons.js';
import { showPanel, toast } from '../panel.js';

const STAT_LABELS = { pv: 'PV', atk: 'Attaque', def: 'Défense', vit: 'Vitesse' };
const STAT_MAX = Object.fromEntries(['pv', 'atk', 'def', 'vit'].map((k) => [k, Math.max(...CHARACTERS.map((c) => c.stats[k]))]));
let filter = 'all';

function select(id) {
  save.update({ selected: id });
  const d = getCharacter(id);
  toast(`${d.name} est ton Striker actif`, RARITIES[d.rarity].color, 'ok');
}

/** tab : 0 STRIKERS, 1 ACTIF. */
export function openCollection(animate = true, tab = 0) {
  const s = save.get();
  const ownedCount = CHARACTERS.filter((c) => s.owned.includes(c.id)).length;
  const el = document.createElement('div');
  el.innerHTML = `
    <div class="col-progress"><div class="cp-bar"><i style="width:${(ownedCount / CHARACTERS.length) * 100}%"></i></div><b>${ownedCount} / ${CHARACTERS.length}</b></div>
    <div class="chips filter">
      <button data-filter="all">Toutes</button>
      ${RARITY_ORDER.map((r) => `<button data-filter="${r}" style="--rarity:${RARITIES[r].color}">${RARITIES[r].label}</button>`).join('')}
    </div>
    <div class="col-grid"></div>`;
  const grid = el.querySelector('.col-grid');

  function render() {
    const st = save.get();
    el.querySelectorAll('[data-filter]').forEach((b) => b.classList.toggle('on', b.dataset.filter === filter));
    const list = CHARACTERS
      .filter((c) => filter === 'all' || c.rarity === filter)
      .sort((a, b) => (st.owned.includes(b.id) - st.owned.includes(a.id)) || RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity));
    grid.innerHTML = list.map((c) => {
      const owned = st.owned.includes(c.id);
      const r = RARITIES[c.rarity];
      const rk = rankFor(c.id, st);
      return `
        <button class="col-card ${owned ? '' : 'locked'} ${st.selected === c.id ? 'active' : ''}" style="--rarity:${r.color}" ${owned ? `data-detail="${c.id}"` : 'data-locked'}>
          <span class="cc-art"><img alt="" src="${getPortrait(c, owned ? rk.id : 'basique')}" />${owned ? '' : `<span class="lock">${ICONS.lock}</span>`}</span>
          ${owned ? `<span class="rank-chip rk-${rk.id}" style="--rk:${rk.color}">${rk.label}</span>` : ''}
          <span class="cc-rarity">${r.label}</span>
          <span class="cc-name">${owned ? shortName(c) : '???'}</span>
          ${st.selected === c.id ? '<span class="cc-active">ACTIF</span>' : ''}
          ${owned ? `<span class="cc-level cc-trophies">${ICONS.trophy}${strikerTrophies(c.id, st)}</span>` : ''}
        </button>`;
    }).join('') || '<p class="empty">Aucun Striker de cette rareté.</p>';
  }

  el.addEventListener('click', (e) => {
    const f = e.target.closest('[data-filter]');
    if (f) { filter = f.dataset.filter; render(); return; }
    const d = e.target.closest('[data-detail]');
    if (d) { openDetail(d.dataset.detail); return; }
    if (e.target.closest('[data-locked]')) toast('Striker inconnu : ouvre des box pour le découvrir !', '#b45cff');
  });
  render();
  let panel = null;
  const subtitles = ['Strikers débloqués', 'Ton Striker en combat'];
  const t = tabs([
    { label: 'STRIKERS', render: () => { panel?.setSubtitle(subtitles[0]); render(); return el; } },
    { label: 'ACTIF', render: () => { panel?.setSubtitle(subtitles[1]); return activeTab(); } },
  ], Math.min(tab, 1));
  panel = showPanel({ title: 'STRIKERS', subtitle: subtitles[tab], icon: ICONS.collection, accent: '#b45cff', content: t, animate });
}

// ---------- Carte d'un Striker ----------
// Ordre (tout l'essentiel visible sans défiler) : personnage en 3D, nom + statut + bouton de sélection, skins
// possédés, palier ; puis en bas son ARME (skins d'armes compatibles) et son ULTI. Jamais l'arme ou l'ulti d'un autre.
const statLine = (a) => `${a.pellets > 1 ? `${a.pellets}×` : ''}${a.dmg}${a.burst > 1 ? ` ×${a.burst}` : ''}`;
function cardHtml(id, s) {
  const c = getCharacter(id), r = RARITIES[c.rarity];
  const active = s.selected === id;
  const tro = strikerTrophies(id, s), rank = rankFor(id, s), nx = nextTier(tro);
  const skins = ownedSkinsFor(id, s), skin = equippedCharacterSkin(id, s);
  const w = getWeapon(equippedWeapon(id, s)), wskin = equippedWeaponSkin(w.id, s), wskins = ownedWeaponSkinsFor(w.id, s), a = w.arena;
  const u = ultiOf(id);
  const st = statsAt(c, COMBAT_LEVEL, rank.id);
  return `
    <div class="dt-viewer tier-${rank.id}" aria-label="Striker en 3D : glisse le doigt pour le faire tourner">
      <span class="dt-rotate" aria-hidden="true">${ICONS.rotate}</span>
    </div>
    <div class="sc-head">
      <div class="sc-id">
        <p class="rarity-text">${r.label}</p>
        <h2 class="dt-name">${c.name}</h2>
        <p class="sc-sub"><span class="rank-chip rk-${rank.id}" style="--rk:${rank.color}">${rank.label}</span><span class="sc-tro">${ICONS.trophy}${tro}</span>${nx ? `<small>${nx.label} à ${nx.minTrophies}</small>` : ''}</p>
      </div>
      ${active ? `<span class="sc-status on">${ICONS.check}ACTIF</span>` : `<button class="sc-status" data-select>SÉLECTIONNER</button>`}
    </div>
    <div class="sc-row" role="radiogroup" aria-label="Skin">
      <button class="sc-skin ${skin ? '' : 'sel'}" data-skin=""><span class="sc-skin-art">${ICONS.striker}</span><small>Classique</small></button>
      ${skins.map((k) => `<button class="sc-skin ${skin?.id === k.id ? 'sel' : ''}" data-skin="${k.id}" style="--rk:${RARITIES[k.rarity].color}"><img src="${skinPreview(k)}" alt="" /><small>${k.name.replace(c.name, '').trim() || k.name}</small></button>`).join('')}
    </div>
    <ul class="sc-stats">${Object.keys(STAT_LABELS).map((k) => `<li><small>${STAT_LABELS[k]}</small><b>${st[k]}</b></li>`).join('')}</ul>
    <section class="sc-part sc-weapon" style="--rarity:${RARITIES[w.rarity].color}">
      <img class="sc-part-art" src="${weaponPortrait(w.id, wskin?.id)}" alt="" />
      <div class="sc-part-txt">
        <p class="sc-part-kind">${ICONS.gun}ARME</p>
        <b>${w.name}</b>
        <small>${statLine(a)} dégâts · ${a.range} m · ${a.mag} charges</small>
      </div>
      <div class="sc-chips" role="radiogroup" aria-label="Skin d’arme">
        <button class="ws-pick ${wskin ? '' : 'sel'}" data-wskin="">Standard</button>
        ${wskins.map((k) => `<button class="ws-pick ${wskin?.id === k.id ? 'sel' : ''}" data-wskin="${k.id}" style="--rarity:${RARITIES[k.rarity].color}">${k.name}</button>`).join('')}
      </div>
    </section>
    <section class="sc-part sc-ulti" style="--uc:${u.color}">
      <span class="sc-part-art sc-ulti-ic">${ICONS.ulti}</span>
      <div class="sc-part-txt">
        <p class="sc-part-kind">${ICONS.star}ULTI</p>
        <b>${u.name}</b>
        <small>${u.desc}</small>
      </div>
      <div class="sc-ulti-stats">${u.stats.map(([v, l]) => `<span><b>${v}</b><small>${l}</small></span>`).join('')}</div>
    </section>`;
}
/** Monte une carte dans `el` ; `onChange` est rappelé après un changement (skin, sélection). */
function mountCard(el, id, { yaw = 0, onChange } = {}) {
  const s = save.get();
  const c = getCharacter(id);
  el.classList.add('detail', 'sc-card');
  el.style.setProperty('--rarity', RARITIES[c.rarity].color);
  el.innerHTML = cardHtml(id, s);
  const look = appearanceFor(id, s);
  const viewer = mountViewer(el.querySelector('.dt-viewer'), c, look.rank, { initialYaw: yaw, weapon: look.weapon, skin: look.skin, weaponSkin: look.weaponSkin });
  el.onclick = (e) => {
    const yawNow = viewer?.getYaw?.() ?? 0;
    if (e.target.closest('[data-select]')) { select(id); onChange?.(yawNow); return; }
    const b = e.target.closest('[data-skin]');
    if (b) { if (equipCharacterSkin(id, b.dataset.skin || null).ok) { toast(b.dataset.skin ? 'Skin équipé' : 'Tenue classique', '#b45cff', 'ok'); onChange?.(yawNow); } return; }
    const ws = e.target.closest('[data-wskin]');
    if (ws) { if (equipWeaponSkin(equippedWeapon(id), ws.dataset.wskin || null).ok) { toast(ws.dataset.wskin ? 'Skin d’arme appliqué' : 'Skin d’arme retiré', '#ff8a3d', 'ok'); onChange?.(yawNow); } }
  };
  return viewer;
}

// ---------- Onglet ACTIF : la carte du Striker utilisé en combat, avec le choix rapide du Striker actif ----------
function strikerStrip(s) {
  const owned = CHARACTERS.filter((c) => s.owned.includes(c.id));
  return `
    <div class="cs-strip" role="listbox" aria-label="Striker actif">${owned.map((c) => `
      <button class="cs-pick ${s.selected === c.id ? 'on' : ''}" data-pick="${c.id}" role="option" aria-selected="${s.selected === c.id}" style="--rarity:${RARITIES[c.rarity].color}">
        <img src="${getPortrait(c, rankFor(c.id, s).id)}" alt="" /><span>${shortName(c)}</span>
      </button>`).join('')}
    </div>`;
}
function activeTab() {
  const el = document.createElement('div');
  el.className = 'active-screen';
  const strip = document.createElement('div');
  const card = document.createElement('div');
  el.append(strip, card);
  let shown = null;
  const render = (yaw = 0) => {
    const s = save.get();
    shown = s.selected;
    strip.innerHTML = strikerStrip(s);
    requestAnimationFrame(() => { if (el.isConnected) mountCard(card, s.selected, { yaw, onChange: (y) => render(y) }); });
  };
  strip.addEventListener('click', (e) => {
    const p = e.target.closest('[data-pick]');
    if (p && p.dataset.pick !== save.get().selected) select(p.dataset.pick);   // la mise à jour suit (abonnement)
  });
  // changement de Striker actif (ici ou ailleurs) : la carte suit aussitôt
  const off = save.subscribe((s) => { if (!el.isConnected) { off?.(); return; } if (s.selected !== shown) render(); });
  render();
  return el;
}

// ---------- Carte d'un Striker ouverte depuis la grille ----------
function openDetail(id, yaw = 0) {
  const el = document.createElement('div');
  const c = getCharacter(id);
  showPanel({ title: 'STRIKER', accent: RARITIES[c.rarity].color, content: el, animate: false, onBack: () => openCollection(false) });
  mountCard(el, id, { yaw, onChange: (y) => openDetail(id, y) });
}
