// Séquence d'ouverture d'une box : apparition, secousses, couvercle qui saute, puis UN GAIN À CHAQUE TOUCHER
// (du plus simple au plus précieux, le compteur montre ce qu'il reste) et enfin le résumé de tous les gains.
// Le résultat est tiré ET enregistré avant l'animation (boxService.openBox) : fermer le jeu
// pendant l'animation ne fait rien perdre, le résultat sera réaffiché à la prochaine visite de MES BOX.
import { BOX_TYPES } from '../../data/boxes.js';
import { getCharacter } from '../../data/characters.js';
import { RARITIES, RARITY_ORDER } from '../../data/rarities.js';
import { openBox, acknowledgeReveal, freeBoxStatus } from '../../game/boxService.js';
import { getIllustration, weaponPortrait, skinPreview } from '../../render/portraits.js';
import { getCharacterSkin, getWeaponSkin } from '../../data/skins.js';
import { weaponOf } from '../../data/weapons.js';
import { REWARD_CATEGORIES } from '../../data/rewards.js';
import { rankFor } from '../../game/ranks.js';
import { save } from '../../save/storage.js';
import { ICONS } from '../icons.js';
import { boxArt } from '../boxArt.js';
import { toast } from '../panel.js';

const sleep = (ms, skip) => new Promise((r) => { const t = setTimeout(r, ms); skip.list.push(() => { clearTimeout(t); r(); }); });

/** Ouvre une box du type donné et joue la séquence. Se résout quand le joueur revient à la liste. */
export function playOpening(typeId, source = 'bought') {
  return new Promise((resolve) => run(typeId, source, resolve));
}

async function run(typeId, source, done) {
  const res = openBox(typeId, source);
  if (!res.ok) { toast('Tu n’as plus de box de ce type.', '#ff5c7a', 'error'); done(); return; }
  const reveal = res.reveal;
  const box = BOX_TYPES[reveal.box];
  // Contenu (anciens formats de sauvegarde convertis ; l'ancienne XP des box n'est plus affichée)
  let rewards = (reveal.rewards ?? [
    ...(reveal.charId ? [{ type: 'striker', id: reveal.charId }] : []),
    ...(reveal.coins ? [{ type: 'coins', amount: reveal.coins }] : []),
  ]).filter((r) => r.type !== 'xp');
  if (!rewards.length) rewards = [{ type: 'coins', amount: 0 }];
  // Ordre de révélation : du plus simple au plus précieux (le meilleur gain arrive en dernier)
  const VALUE = { coins: 0, gems: 1, weaponSkin: 3, characterSkin: 4, striker: 5 };
  const val = (r) => (r.converted ? 2 : VALUE[r.type] ?? 0) * 1e6 + (r.amount ?? 0);
  const order = [...rewards].sort((x, y) => val(x) - val(y));
  const info = (r) => {
    if (r.converted) {
      return { color: '#ffc83d', kind: 'coins', top: `${REWARD_CATEGORIES[r.type].label} déjà possédé`, title: '', sub: 'converti en pièces', art: orb(r.amount, ICONS.coin, 'coins-orb') };
    }
    if (r.type === 'coins') return { color: '#ffc83d', kind: 'coins', top: 'Pièces', title: '', sub: '', art: orb(r.amount, ICONS.coin, 'coins-orb') };
    if (r.type === 'gems') return { color: '#5fd0ff', kind: 'gems', top: 'Diamants', title: '', sub: '', art: orb(r.amount, ICONS.gem, 'coins-orb gems-orb') };
    if (r.type === 'striker') {
      const d = getCharacter(r.id);
      return { color: RARITIES[d.rarity].color, kind: 'special', rarity: d.rarity, top: RARITIES[d.rarity].label, title: d.name, sub: 'NOUVEAU STRIKER !', art: `<img class="oi-img full" src="${getIllustration(d, rankFor(d.id).id)}" alt="" />` };
    }
    if (r.type === 'characterSkin') {
      const k = getCharacterSkin(r.id);
      return { color: RARITIES[k.rarity].color, kind: 'special', rarity: k.rarity, top: `${RARITIES[k.rarity].label} · Skin`, title: k.name, sub: 'NOUVEAU SKIN ! Équipe-le depuis la fiche du Striker.', art: `<img class="oi-img full" src="${skinPreview(k)}" alt="" />` };
    }
    const k = getWeaponSkin(r.id);
    return { color: RARITIES[k.rarity].color, kind: 'special', rarity: k.rarity, top: `${RARITIES[k.rarity].label} · Skin d’arme`, title: k.name, sub: 'NOUVEAU SKIN D’ARME ! Applique-le depuis la fiche du Striker.', art: `<img class="oi-img weapon" src="${weaponPortrait(weaponOf(save.get().selected).id, k.id)}" alt="" />` };
  };
  function orb(amount, icon, cls) { return `<div class="oi-orb ${cls}"><span>+${amount.toLocaleString('fr-FR')}</span><i>${icon}</i></div>`; }
  // tension de l'ouverture selon le meilleur gain de la box
  const best = order[order.length - 1], bestInfo = info(best);
  const tier = bestInfo.rarity ? RARITY_ORDER.indexOf(bestInfo.rarity) : 0;

  const label = (r) => {
    if (r.converted) return `${REWARD_CATEGORIES[r.type].label} déjà possédé : +${r.amount.toLocaleString('fr-FR')} pièces`;
    if (r.type === 'coins') return `+${r.amount.toLocaleString('fr-FR')} pièces`;
    if (r.type === 'gems') return `+${r.amount.toLocaleString('fr-FR')} diamants`;
    if (r.type === 'striker') return `Striker : ${getCharacter(r.id).name}`;
    if (r.type === 'characterSkin') return `Skin : ${getCharacterSkin(r.id)?.name ?? r.id}`;
    if (r.type === 'weaponSkin') return `Skin d’arme : ${getWeaponSkin(r.id)?.name ?? r.id}`;
    return '';
  };
  const icon = (r) => (r.converted || r.type === 'coins' ? ICONS.coin : ICONS[REWARD_CATEGORIES[r.type]?.icon] ?? '');
  const rarColor = (r) => (r.rarity && !r.converted ? RARITIES[r.rarity].color : r.type === 'gems' ? '#5fd0ff' : '#ffc83d');
  const big = (r) => (r.converted || r.type === 'coins' || r.type === 'gems' ? `+${r.amount.toLocaleString('fr-FR')}` : r.type === 'striker' ? 'STRIKER' : 'SKIN');
  const tiles = order.map((r, i) => `<span class="rw-tile rw-${r.converted ? 'coins' : r.type} ${r.rarity && !r.converted ? 'rare' : ''}" style="--rc:${rarColor(r)};--i:${i}" title="${label(r)}"><span class="pi">${icon(r)}</span><b>${big(r)}</b><small>${label(r).replace(/^\+[\d\s ]+/, '')}</small></span>`).join('');
  const totalCoins = rewards.filter((r) => r.type === 'coins' || r.converted).reduce((t, r) => t + r.amount, 0);
  const totalGems = rewards.filter((r) => r.type === 'gems').reduce((t, r) => t + r.amount, 0);
  const specials = order.filter((r) => !r.converted && ['striker', 'characterSkin', 'weaponSkin'].includes(r.type));

  const el = document.createElement('div');
  el.className = `opening box-${reveal.box}`;
  el.style.setProperty('--rarity', bestInfo.rarity ? bestInfo.color : '#ffc83d');
  el.innerHTML = `
    <div class="op-bg"></div>
    <div class="op-rays"></div>
    <div class="op-stage">
      <div class="op-glow"></div>
      <div class="op-box">${boxArt(reveal.box)}</div>
      <div class="op-item" aria-live="polite"></div>
    </div>
    <div class="op-flash"></div>
    <p class="op-hint">${box.name}${reveal.source === 'free' ? ' gratuite' : ''}</p>
    <button class="op-skip" data-act="skip">TOUT VOIR ${ICONS.back}</button>
    <div class="op-info"><small></small><b></b><span></span></div>
    <div class="op-left"><span class="ol-box">${boxArt(reveal.box)}</span><b></b></div>
    <p class="op-tap">Touche l’écran</p>
    <div class="op-card">
      <p class="rarity-text">Résumé · ${rewards.length} gains</p>
      ${specials.length ? `<p class="op-result new">${specials.map((r) => label(r)).join(' · ')}</p>` : ''}
      <p class="op-totals"><span><span class="pi">${ICONS.coin}</span>+${totalCoins.toLocaleString('fr-FR')}</span>${totalGems ? `<span><span class="pi">${ICONS.gem}</span>+${totalGems.toLocaleString('fr-FR')}</span>` : ''}</p>
      <div class="rw-grid n${rewards.length}">${tiles}</div>
      <div class="op-btns">
        <button class="r-btn ghost" data-act="back">CONTINUER</button>
        <button class="r-btn" data-act="again" hidden></button>
      </div>
    </div>`;
  document.body.append(el);

  // 1) ouverture de la box (toucher accélère)
  const skip = { list: [], skipped: false };
  const fast = () => { skip.skipped = true; skip.list.splice(0).forEach((f) => f()); };
  let phase = 'intro', next = null, toSummary = false;
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.op-card, .op-skip')) return;
    if (phase === 'intro') fast();
    else if (phase === 'items') next?.();
  });
  el.querySelector('.op-skip').addEventListener('click', () => { toSummary = true; if (phase === 'intro') fast(); next?.(); });
  const step = (cls, ms) => { el.classList.add(cls); return skip.skipped ? Promise.resolve() : sleep(ms, skip); };
  await sleep(30, skip);
  await step('s-drop', 550);                       // la box tombe au centre
  await step('s-shake', 700 + tier * 160);         // secousses (plus longues si un gain rare attend)
  el.classList.add('s-tint');
  await step('s-shake2', 350 + tier * 120);
  navigator.vibrate?.(tier >= 3 ? [40, 50, 80] : 40);
  await step('s-open', 380);                       // couvercle qui saute + flash
  el.classList.add('s-drop', 's-shake', 's-tint', 's-shake2', 's-open', 's-items');

  // 2) un gain à chaque toucher, du plus simple au plus précieux
  phase = 'items';
  const item = el.querySelector('.op-item'), inf = el.querySelector('.op-info'), left = el.querySelector('.op-left b');
  for (let i = 0; i < order.length && !toSummary; i++) {
    const it = info(order[i]);
    el.style.setProperty('--rarity', it.color);
    el.classList.toggle('special', it.kind === 'special');
    item.innerHTML = `<div class="oi oi-${it.kind}">${it.art}</div>`;
    inf.querySelector('small').textContent = it.top;
    inf.querySelector('b').textContent = it.title;
    inf.querySelector('span').textContent = it.sub;
    inf.classList.remove('in'); void inf.offsetWidth; inf.classList.add('in');
    const remaining = order.length - i - 1;
    left.textContent = remaining ? `${remaining}` : '0';
    el.querySelector('.op-left').classList.toggle('empty', !remaining);
    if (it.kind === 'special') { el.classList.remove('flash2'); void el.offsetWidth; el.classList.add('flash2'); navigator.vibrate?.([30, 40, 60]); } else navigator.vibrate?.(12);
    await new Promise((r) => { next = r; });
    next = null;
  }

  // 3) résumé de tous les gains
  phase = 'summary';
  el.classList.remove('special');
  el.style.setProperty('--rarity', bestInfo.rarity ? bestInfo.color : '#ffc83d');
  el.classList.add('s-card');
  const again = el.querySelector('[data-act="again"]');
  const src = reveal.source ?? 'bought';
  const leftBoxes = src === 'free' ? freeBoxStatus().stored : save.get().boxes[reveal.box];
  if (leftBoxes > 0) { again.hidden = false; again.textContent = `OUVRIR ENCORE (x${leftBoxes})`; }

  el.querySelector('.op-btns').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || el.dataset.closing) return;
    el.dataset.closing = '1';
    acknowledgeReveal(reveal.id);
    el.classList.add('closing');
    setTimeout(() => {
      el.remove();
      if (b.dataset.act === 'again') run(reveal.box, src, done); else done();
    }, 220);
  });
}
