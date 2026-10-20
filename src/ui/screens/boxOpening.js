// Séquence d'ouverture d'une box : apparition, secousses, couvercle qui saute, lumière de la rareté,
// révélation du personnage puis carte de récompense. Toucher l'écran accélère la séquence.
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
  // Contenu (anciens formats de sauvegarde convertis)
  // (l'ancienne XP des box n'existe plus : elle n'est plus affichée)
  let rewards = (reveal.rewards ?? [
    ...(reveal.charId ? [{ type: 'striker', id: reveal.charId }] : []),
    ...(reveal.coins ? [{ type: 'coins', amount: reveal.coins }] : []),
  ]).filter((r) => r.type !== 'xp');
  if (!rewards.length) rewards = [{ type: 'coins', amount: 0 }];
  // Récompense mise en avant (la plus spectaculaire) : Striker > skin perso > skin d'arme > pièces
  const ORDER = ['striker', 'characterSkin', 'weaponSkin', 'gems', 'coins'];
  const main = [...rewards].sort((a, b) => (!!a.converted - !!b.converted) || ORDER.indexOf(a.type) - ORDER.indexOf(b.type))[0];
  const def = main.type === 'striker' && !main.converted ? getCharacter(main.id) : null;
  const cskin = main.type === 'characterSkin' && !main.converted ? getCharacterSkin(main.id) : null;
  const wskin = main.type === 'weaponSkin' && !main.converted ? getWeaponSkin(main.id) : null;
  const rarity = def?.rarity ?? cskin?.rarity ?? wskin?.rarity ?? null;
  const color = rarity ? RARITIES[rarity].color : main.type === 'coins' ? '#ffc83d' : '#5cc8ff';
  // total des pièces et diamants de la box (plusieurs gains peuvent en donner)
  const coins = rewards.filter((r) => r.type === 'coins' || r.converted).reduce((t, r) => t + r.amount, 0);
  const gems = rewards.filter((r) => r.type === 'gems').reduce((t, r) => t + r.amount, 0);
  // 0..4 : plus c'est rare, plus la tension monte
  const tier = rarity ? RARITY_ORDER.indexOf(rarity) : coins >= 150 ? 2 : coins >= 60 ? 1 : 0;

  const el = document.createElement('div');
  el.className = `opening reveal-${main.type} ${rarity ? `rarity-${rarity}` : 'xp'} box-${reveal.box}`;
  el.style.setProperty('--rarity', color);
  const prize = def ? `<img class="op-char full" src="${getIllustration(def, rankFor(def.id).id)}" alt="" />`
    : cskin ? `<img class="op-char full skin-reveal" src="${skinPreview(cskin)}" alt="" />`
    : wskin ? `<img class="op-char weapon-reveal" src="${weaponPortrait(weaponOf(save.get().selected).id, wskin.id)}" alt="" />`
    : main.type === 'gems' && gems >= coins / 10 ? `<div class="op-char xp-orb-big coins-orb gems-orb"><span>+${gems}</span><i>${ICONS.gem}</i></div>`
    : `<div class="op-char xp-orb-big coins-orb"><span>+${coins}</span><i>${ICONS.coin}</i></div>`;
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
  // un carré par gain (3, 5 ou 7), qui apparaissent l'un après l'autre
  const rarColor = (r) => (r.rarity ? RARITIES[r.rarity].color : r.type === 'gems' ? '#5fd0ff' : '#ffc83d');
  const big = (r) => (r.converted || r.type === 'coins' || r.type === 'gems' ? `+${r.amount.toLocaleString('fr-FR')}` : r.type === 'striker' ? 'STRIKER' : 'SKIN');
  const chips = rewards.map((r, i) => `<span class="rw-tile rw-${r.converted ? 'coins' : r.type} ${r.rarity && !r.converted ? 'rare' : ''}" style="--rc:${rarColor(r)};--i:${i}" title="${label(r)}"><span class="pi">${icon(r)}</span><b>${big(r)}</b><small>${label(r).replace(/^\+[\d\s\u202f]+/, '')}</small></span>`).join('');
  const headline = def ? `<p class="rarity-text">${RARITIES[def.rarity].label}</p><h2>${def.name}</h2><p class="op-result new">NOUVEAU STRIKER !</p>`
    : cskin ? `<p class="rarity-text">${RARITIES[cskin.rarity].label} · Skin de personnage</p><h2>${cskin.name}</h2><p class="op-result new">NOUVEAU SKIN ! Équipe-le depuis la carte du Striker.</p>`
    : wskin ? `<p class="rarity-text">${RARITIES[wskin.rarity].label} · Skin d’arme</p><h2>${wskin.name}</h2><p class="op-result new">NOUVEAU SKIN D’ARME ! Applique-le depuis la carte du Striker.</p>`
    : `<p class="rarity-text">${rewards.length} gains</p>`;
  el.innerHTML = `
    <div class="op-bg"></div>
    <div class="op-rays"></div>
    <div class="op-stage">
      <div class="op-glow"></div>
      <div class="op-box">${boxArt(reveal.box)}</div>
      ${prize}
    </div>
    <div class="op-flash"></div>
    <p class="op-hint">${box.name}${reveal.source === 'free' ? ' gratuite' : ''}</p>
    <div class="op-card">
      ${headline}
      ${def || cskin || wskin ? `<p class="rw-count">${rewards.length} gains</p>` : ''}
      <div class="rw-grid n${rewards.length}">${chips}</div>
      <div class="op-btns">
        <button class="r-btn ghost" data-act="back">CONTINUER</button>
        <button class="r-btn" data-act="again" hidden></button>
      </div>
    </div>`;
  document.body.append(el);

  const skip = { list: [], skipped: false };
  const fast = () => { skip.skipped = true; skip.list.splice(0).forEach((f) => f()); };
  el.addEventListener('pointerdown', (e) => { if (!e.target.closest('.op-card')) fast(); });

  const step = (cls, ms) => { el.classList.add(cls); return skip.skipped ? Promise.resolve() : sleep(ms, skip); };
  await sleep(30, skip);
  await step('s-drop', 550);                       // la box tombe au centre
  await step('s-shake', 700 + tier * 160);         // secousses (plus longues si rare)
  el.classList.add('s-tint');                      // la lumière prend la couleur de la rareté
  await step('s-shake2', 350 + tier * 120);
  navigator.vibrate?.(tier >= 3 ? [40, 50, 80] : 40);
  await step('s-open', 380);                       // couvercle qui saute + flash
  await step('s-reveal', 650);                     // personnage
  el.classList.add('s-drop', 's-shake', 's-tint', 's-shake2', 's-open', 's-reveal', 's-card');

  const again = el.querySelector('[data-act="again"]');
  const src = reveal.source ?? 'bought';
  const left = src === 'free' ? freeBoxStatus().stored : save.get().boxes[reveal.box];
  if (left > 0) { again.hidden = false; again.textContent = `OUVRIR ENCORE (x${left})`; }

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
