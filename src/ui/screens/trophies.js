// TROPHÉES : la ROUTE DU CLASSEMENT, de Ruine I (en bas) à Zénith (en haut), sur un chemin sinueux.
//  - un emblème de rang à chaque nouveau rang (tous les 3 000 points), avec sa grande récompense à côté ;
//  - un médaillon de niveau (II, III) tous les 1 000 points ;
//  - une récompense dans chaque virage (milieu de niveau : 500, 1 500…) ;
//  - chaque zone de rang a sa couleur ; le chemin se remplit jusqu'aux points du joueur (repère « Toi ») ;
//  - récompenses : récupérable / déjà récupérée / verrouillée (avec sa condition), une seule fois chacune.
// Les nouveautés depuis la dernière visite s'animent (remplissage du chemin, cadenas qui sautent).
import { RANKED_TIERS, ZENITH_POINTS, POINTS_PER_LEVEL, POINTS_PER_RANK, rankOf } from '../../data/ranked.js';
import { BOX_TYPES } from '../../data/boxes.js';
import { RARITIES } from '../../data/rarities.js';
import { getCharacterSkin, getWeaponSkin } from '../../data/skins.js';
import { weaponOf } from '../../data/weapons.js';
import { rankedPoints, rankedBest, rankedRoad, claimRankedReward, rankedClaimable, nextRoadStep, markRoadSeen, resolveReward } from '../../game/ranked.js';
import { weaponPortrait, skinPreview } from '../../render/portraits.js';
import { save } from '../../save/storage.js';
import { ICONS } from '../icons.js';
import { boxArt } from '../boxArt.js';
import { avatarSvg } from '../avatar.js';
import { rankEmblem } from '../rankEmblem.js';
import { showPanel, toast } from '../panel.js';

// Géométrie de la route, en unités de dessin (largeur 360) : la carte garde ses proportions sur tous les écrans.
const W = 360, SEG = 290, AMP = 74, PAD_TOP = 330, PAD_BOTTOM = 150;
const LEVELS = ZENITH_POINTS / POINTS_PER_LEVEL;
const H = PAD_TOP + LEVELS * SEG + PAD_BOTTOM;
const yOf = (p) => H - PAD_BOTTOM - (Math.min(p, ZENITH_POINTS) / POINTS_PER_LEVEL) * SEG;
const xOf = (p) => W / 2 + AMP * Math.sin((Math.PI * Math.min(p, ZENITH_POINTS)) / POINTS_PER_LEVEL);
const pct = (x, y) => `left:${((x / W) * 100).toFixed(3)}%;top:${((y / H) * 100).toFixed(3)}%`;
/** Tracé du chemin entre deux scores (échantillonné finement : courbe lisse). */
function pathBetween(a, b) {
  const pts = [];
  for (let p = a; p < b; p += 40) pts.push(`${xOf(p).toFixed(1)} ${yOf(p).toFixed(1)}`);
  pts.push(`${xOf(b).toFixed(1)} ${yOf(b).toFixed(1)}`);
  return `M${pts.join(' L')}`;
}
const fmt = (n) => n.toLocaleString('fr-FR');

/** Nom lisible d'une récompense (déjà convertie si le skin est possédé). */
export function rewardLabel(r) {
  const parts = [];
  if (r.characterSkin) parts.push(`Skin ${getCharacterSkin(r.characterSkin)?.name ?? ''}`);
  if (r.weaponSkin) parts.push(`Skin d’arme ${getWeaponSkin(r.weaponSkin)?.name ?? ''}`);
  if (r.box) parts.push(BOX_TYPES[r.box].name);
  if (r.coins) parts.push(`${fmt(r.coins)} pièces`);
  if (r.gems) parts.push(`${fmt(r.gems)} diamants`);
  return parts.join(' + ');
}
/** Illustration principale d'une récompense + petits bonus. */
function rewardArt(r, s) {
  const extra = [];
  let art, name, rarity = null;
  if (r.characterSkin) {
    const k = getCharacterSkin(r.characterSkin); rarity = k.rarity;
    art = `<img src="${skinPreview(k)}" alt="" />`; name = k.name;
  } else if (r.weaponSkin) {
    const k = getWeaponSkin(r.weaponSkin); rarity = k.rarity;
    art = `<img src="${weaponPortrait(weaponOf(s.selected).id, k.id)}" alt="" />`; name = `Skin d’arme ${k.name}`;
  } else if (r.box) {
    art = boxArt(r.box); name = BOX_TYPES[r.box].name; rarity = r.box === 'legendaire' ? 'legendaire' : r.box === 'rare' ? 'rare' : null;
  } else if (r.gems) {
    art = `<span class="rc-cur">${ICONS.gem}</span>`; name = `${fmt(r.gems)} diamants`;
  } else {
    art = `<span class="rc-cur">${ICONS.coin}</span>`; name = `${fmt(r.coins)} pièces`;
  }
  const main = r.characterSkin || r.weaponSkin || r.box;
  if (main && r.box && (r.characterSkin || r.weaponSkin)) extra.push(`<span class="rc-x">${ICONS.chest}</span>`);
  if (main && r.gems) extra.push(`<span class="rc-x">${ICONS.gem}<b>${r.gems}</b></span>`);
  if (main && r.coins) extra.push(`<span class="rc-x">${ICONS.coin}<b>${fmt(r.coins)}</b></span>`);
  return { art, name, rarity, extra: extra.join('') };
}

export function openTrophies() {
  const el = document.createElement('div');
  el.className = 'road-page';
  let firstRender = true;

  function cardHtml(step, s, nextId) {
    const r = step.state === 'claimed' ? step.reward : resolveReward(step.reward, s);
    const a = rewardArt(r, s);
    // éloignée : verrouillée et dans un rang supérieur à celui du record
    const far = step.state === 'locked' && step.id !== nextId && rankOf(step.points).tierIndex > rankOf(rankedBest(s)).tierIndex;
    const cls = ['rc', step.state, step.major ? 'major' : '', step.id === nextId ? 'next' : '', far ? 'far' : '', a.rarity ? `rar-${a.rarity}` : ''].join(' ');
    const cond = step.state === 'ready' ? `<span class="rc-go">RÉCUPÉRER</span>`
      : step.state === 'claimed' ? `<span class="rc-done">${ICONS.check}Obtenu</span>`
      : `<span class="rc-lock">${ICONS.lock}${fmt(step.points)}</span>`;
    const conv = r.convertedSkin && step.state !== 'claimed' ? '<small class="rc-conv">Skin déjà possédé : converti en pièces</small>' : '';
    return `
      <button class="${cls}" data-claim="${step.id}" style="${a.rarity ? `--rar:${RARITIES[a.rarity].color};` : ''}" aria-label="${rewardLabel(r)} — ${step.state === 'ready' ? 'à récupérer' : step.state === 'claimed' ? 'déjà récupérée' : `verrouillée, ${fmt(step.points)} trophées`}">
        <span class="rc-art">${a.art}</span>
        ${a.extra ? `<span class="rc-extras">${a.extra}</span>` : ''}
        <span class="rc-name">${a.name}</span>${conv}
        ${cond}
      </button>`;
  }

  function render() {
    const s = save.get();
    const pts = rankedPoints(s), best = rankedBest(s), seen = Math.min(s.ranked?.seen ?? best, best);
    const road = rankedRoad(s), next = nextRoadStep(s);
    const me = rankOf(pts);
    const animate = firstRender && best > seen;
    // zones de rang (bandes colorées) et emblèmes en filigrane
    const zones = RANKED_TIERS.map((t, k) => {
      const y0 = k === RANKED_TIERS.length - 1 ? 0 : yOf((k + 1) * POINTS_PER_RANK), y1 = k === 0 ? H : yOf(k * POINTS_PER_RANK);
      return `<rect x="0" y="${y0}" width="${W}" height="${y1 - y0}" fill="url(#rz${k})" />`;
    }).join('');
    const zoneDefs = RANKED_TIERS.map((t, k) => `<linearGradient id="rz${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.main}" stop-opacity="${k === 9 ? 0.3 : 0.24}"/><stop offset=".55" stop-color="${t.dark}" stop-opacity=".16"/><stop offset="1" stop-color="${t.main}" stop-opacity=".08"/></linearGradient>`).join('');
    // couleur du chemin rempli : celle du rang traversé
    const fillStops = RANKED_TIERS.map((t, k) => {
      const o0 = 1 - yOf(k * POINTS_PER_RANK) / H, o1 = k === 9 ? 1 : 1 - yOf((k + 1) * POINTS_PER_RANK) / H;
      return `<stop offset="${o0.toFixed(4)}" stop-color="${t.main}"/><stop offset="${o1.toFixed(4)}" stop-color="${k === 9 ? t.light : t.main}"/>`;
    }).join('');
    const marks = RANKED_TIERS.map((t, k) => k > 0 ? `<line x1="16" x2="${W - 16}" y1="${yOf(k * POINTS_PER_RANK)}" y2="${yOf(k * POINTS_PER_RANK)}" class="rz-line" stroke="${t.main}" />` : '').join('');
    // nœuds : rangs (gros emblèmes) et niveaux (médaillons)
    const nodes = [];
    for (let n = 0; n <= LEVELS; n++) {
      const p = n * POINTS_PER_LEVEL, r = rankOf(p), reached = best >= p;
      const state = reached ? 'reached' : p === Math.ceil((best + 1) / POINTS_PER_LEVEL) * POINTS_PER_LEVEL ? 'next' : r.tierIndex > rankOf(best).tierIndex ? 'far' : 'soon';
      if (n % 3 === 0) {
        const zen = r.isMax;
        nodes.push(`
          <div class="rn-rank ${state} ${zen ? 'zenith' : (r.tierIndex % 2 ? 'lbl-l' : 'lbl-r')}" style="${pct(xOf(p), yOf(p))};--rk:${r.tier.main};--rk-l:${r.tier.light}" data-node="${p}">
            <span class="rn-halo"></span>
            ${rankEmblem(r.tierIndex, r.level, { size: zen ? 128 : 92 })}
            <span class="rn-name"><b>${r.label}</b><small>${zen ? `Rang ultime · ${ICONS.trophy}${fmt(p)}` : `${ICONS.trophy}${fmt(p)}`}</small></span>
          </div>`);
      } else {
        nodes.push(`
          <div class="rn-level ${state}" style="${pct(xOf(p), yOf(p))};--rk:${r.tier.main};--rk-l:${r.tier.light}" data-node="${p}">
            ${rankEmblem(r.tierIndex, r.level, { size: 40, pips: false })}
            <span class="rn-tag ${n % 2 ? 'left' : 'right'}"><b>${r.label}</b><small>${fmt(p)}</small></span>
          </div>`);
      }
    }
    // récompenses : dans les virages, et à côté de chaque emblème de rang (grande récompense)
    const cards = road.map((st) => {
      let x = xOf(st.points), y = yOf(st.points);
      // grande récompense : à côté de l'emblème, du côté opposé au virage suivant (Zénith : à gauche)
      // (un peu au-dessus, pour laisser la place au nom du rang) ; Zénith : la récompense ultime le couronne
      if (st.major) { x = st.tierIndex % 2 ? 300 : 60; y -= 44; }
      if (st.major && st.tierIndex === 9) { x = W / 2; y = yOf(ZENITH_POINTS) - 215; }
      return `<div class="rc-slot ${st.major ? 'major' : ''} ${x < W / 2 ? 'l' : x > W / 2 ? 'r' : 'c'}" style="${pct(x, y)};--x:${((x / W) * 100).toFixed(3)}%">${cardHtml(st, s, next?.id)}</div>`;
    }).join('');
    const myX = xOf(pts), myY = yOf(pts);
    const claimable = rankedClaimable(s);
    const nx = next ? resolveReward(next.reward, s) : null;
    el.innerHTML = `
      <div class="road-map" style="aspect-ratio:${W} / ${H}">
        <svg class="road-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
          <defs>${zoneDefs}<linearGradient id="road-fill" gradientUnits="userSpaceOnUse" x1="0" y1="${H}" x2="0" y2="0">${fillStops}</linearGradient></defs>
          ${zones}${marks}
          <path class="road-shadow" d="${pathBetween(0, ZENITH_POINTS)}" transform="translate(0 7)" />
          <path class="road-rim" d="${pathBetween(0, ZENITH_POINTS)}" />
          <path class="road-bed" d="${pathBetween(0, ZENITH_POINTS)}" />
          <path class="road-dash" d="${pathBetween(0, ZENITH_POINTS)}" />
          ${best > pts ? `<path class="road-best" d="${pathBetween(0, best)}" />` : ''}
          ${pts > 0 ? `<path class="road-glow" d="${pathBetween(0, pts)}" /><path class="road-fill ${animate ? 'grow' : ''}" d="${pathBetween(0, pts)}" pathLength="1000" style="--from:${animate && pts ? (1000 * (1 - Math.min(1, seen / pts))).toFixed(0) : 0}" />` : ''}
        </svg>
        ${nodes.join('')}
        ${cards}
        <div class="road-me ${myX > W / 2 ? 'lbl-l' : 'lbl-r'}" style="${pct(myX, myY)};--rk:${me.tier.main}">
          <span class="rm-pin"><span class="rm-av">${avatarSvg(s.avatar)}</span></span>
          <span class="rm-lbl"><b>Toi</b> ${ICONS.trophy}${fmt(pts)}</span>
        </div>
      </div>
      <div class="road-bar" style="--rk:${me.tier.main};--rk-l:${me.tier.light}">
        <button class="rb-me" data-goto-me aria-label="Revenir à ma position">${rankEmblem(me.tierIndex, me.level, { size: 40, pips: false })}</button>
        <div class="rb-info">
          <b>${me.label}${me.isMax ? '' : ` · ${fmt(me.progress)} / ${fmt(POINTS_PER_LEVEL)} trophées`}</b>
          <span class="rb-prog"><i style="width:${me.isMax ? 100 : (me.progress / POINTS_PER_LEVEL) * 100}%"></i></span>
          <small>${next ? `Prochaine : ${rewardLabel(nx)} · dans ${fmt(next.points - best)} trophées` : 'Toutes les récompenses sont débloquées'}</small>
        </div>
        ${claimable ? `<button class="rb-all" data-all>${claimable > 1 ? `TOUT<br>RÉCUPÉRER` : 'RÉCUPÉRER'}<span class="badge">${claimable}</span></button>` : ''}
      </div>`;
    if (animate) {
      // cadenas qui sautent sur les récompenses débloquées depuis la dernière visite
      el.querySelectorAll('.rc.ready').forEach((b) => {
        const st = road.find((x) => x.id === b.dataset.claim);
        if (st.points > seen) b.classList.add('unlocking');
      });
    }
    firstRender = false;
    markRoadSeen();
  }

  /** Fait défiler la route pour centrer un élément (la position du joueur par défaut). */
  function scrollTo(target, smooth = false) {
    const body = el.closest('.panel-body');
    if (!body || !target) return;
    const tb = target.getBoundingClientRect(), bb = body.getBoundingClientRect();
    body.scrollTo({ top: body.scrollTop + tb.top + tb.height / 2 - bb.top - body.clientHeight * 0.5, behavior: smooth ? 'smooth' : 'auto' });
  }
  /** Position pertinente à l'ouverture : la première récompense à récupérer, sinon le joueur. */
  function focusTarget() {
    const ready = [...el.querySelectorAll('.rc.ready')].sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0];
    return ready ?? el.querySelector('.road-me');
  }

  function claim(id, btn) {
    const res = claimRankedReward(id);
    if (!res.ok) return false;
    const slot = btn.closest('.rc-slot');
    // effet de récupération : éclat, la carte rebondit, les gains s'envolent
    slot.insertAdjacentHTML('beforeend', `<span class="rc-burst"></span><span class="rc-fly">+ ${rewardLabel(res.reward)}</span>`);
    btn.classList.add('claiming');
    navigator.vibrate?.(20);
    setTimeout(() => {
      const s = save.get();
      const step = rankedRoad(s).find((x) => x.id === id);
      btn.outerHTML = cardHtml(step, s, nextRoadStep(s)?.id).replace('class="rc ', 'class="rc just-claimed ');
      setTimeout(() => slot.querySelectorAll('.rc-burst, .rc-fly').forEach((n) => n.remove()), 700);
      refreshBar();
    }, 380);
    return res;
  }
  function refreshBar() {
    // met à jour la barre du bas sans reconstruire la route (le défilement ne bouge pas)
    const s = save.get();
    const claimable = rankedClaimable(s);
    const bar = el.querySelector('.road-bar');
    const all = bar.querySelector('[data-all]');
    if (!claimable) all?.remove();
    else if (all) { all.innerHTML = `${claimable > 1 ? 'TOUT<br>RÉCUPÉRER' : 'RÉCUPÉRER'}<span class="badge">${claimable}</span>`; }
  }

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-goto-me]')) { scrollTo(el.querySelector('.road-me'), true); return; }
    if (e.target.closest('[data-all]')) {
      const ready = rankedRoad().filter((p) => p.state === 'ready');
      const got = ready.map((p) => claim(p.id, el.querySelector(`.rc[data-claim="${p.id}"]`))).filter(Boolean);
      if (got.length) toast(got.length > 1 ? `${got.length} récompenses récupérées !` : `Récupéré : ${rewardLabel(got[0].reward)}`, '#ffc83d', 'ok');
      return;
    }
    const b = e.target.closest('[data-claim]');
    if (!b) return;
    const step = rankedRoad().find((x) => x.id === b.dataset.claim);
    if (step.state === 'locked') {
      toast(`Atteins ${fmt(step.points)} trophées (${rankOf(step.points).label}) pour la débloquer`, '#b45cff', 'error');
      b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
      return;
    }
    if (step.state === 'claimed') return;
    const res = claim(step.id, b);
    if (res) toast(`Récupéré : ${rewardLabel(res.reward)}`, '#ffc83d', 'ok');
  });

  render();
  showPanel({ title: 'TROPHÉES', icon: ICONS.trophy, accent: '#ffc83d', content: el, ranked: true });
  requestAnimationFrame(() => scrollTo(focusTarget()));
}
