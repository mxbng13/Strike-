// Duel d'expositions : trois manches, un thème par manche, un jury. Le gagnant emporte une œuvre présentée par le perdant.
import { ART, RARITY, bindImg } from './catalog.js';
import { S, ownerInfo, worksOf, wallItems, addItem, removeItem, setOwner, myOriginal, defenseScore, log } from './state.js';
import { emit, toast } from './sim.js';
import { addRoute, clearRoutes } from './map.js';
import { esc, money, now, pick, clamp, $, $$ } from './util.js';

const KINDS = ['Peinture', 'Sculpture', 'Dessin & estampe', 'Objet précieux', 'Antiquité & objet'];
export function drawTheme() {
  const r = Math.random();
  if (r < 0.3) return { k: 'value', name: 'Le prestige', desc: 'Le jury retient l’œuvre la plus précieuse.' };
  if (r < 0.5) return { k: 'age', name: 'Les origines', desc: 'Le jury préfère l’œuvre la plus ancienne.' };
  if (r < 0.7) return { k: 'rarity', name: 'La rareté', desc: 'Le jury retient l’œuvre la plus rare.' };
  const kind = pick(KINDS);
  return { k: 'kind', kind, name: kind, desc: `Thème « ${kind} » : une œuvre de ce type compte triple.` };
}
export function score(aid, theme) {
  const a = ART[aid];
  if (theme.k === 'value') return a.v;
  if (theme.k === 'age') return 2100 - (a.y ?? 1850);
  if (theme.k === 'rarity') return a.r * 1e10 + a.v;
  return a.v * (a.k === theme.kind ? 3 : 0.6);
}
const homeBonus = def => 1 + 0.03 * defenseScore(def);
export const duelFee = lvl => Math.round(800 * Math.pow(lvl, 1.6));

function aiPick(pool, theme, lvl) {
  const sorted = [...pool].sort((a, b) => score(b, theme) - score(a, theme));
  const spread = Math.max(1, Math.round(6 - lvl / 2));
  return sorted[Math.floor(Math.random() * Math.min(spread, sorted.length))];
}

// Défi lancé par un rival contre vous, résolu automatiquement avec vos œuvres exposées.
export function incomingChallenge(rv) {
  const mine = wallItems().filter(x => !x.copy).map(x => x.aid);
  const theirs = worksOf(rv.id);
  if (mine.length < 1 || theirs.length < 1) return;
  let me = 0, them = 0; const shown = [];
  const usedA = new Set(), usedB = new Set();
  for (let i = 0; i < 3 && me < 2 && them < 2; i++) {
    const t = drawTheme();
    const a = [...mine].filter(x => !usedA.has(x)).sort((x, y) => score(y, t) - score(x, t))[0] ?? mine[0];
    const b = aiPick(theirs.filter(x => !usedB.has(x)), t, rv.lvl) ?? theirs[0];
    usedA.add(a); usedB.add(b); shown.push(a);
    if (score(a, t) * homeBonus(S.me.def) >= score(b, t)) me++; else them++;
  }
  S.stats.defended++;
  addRoute(rv.id, 'me', '#9e2b2b', 5000);
  if (me > them) {
    log(`${rv.name} vous a défié : votre exposition l’emporte ${me}-${them}.`, 'good');
    toast(`Défi remporté ${me}-${them} contre ${rv.name} ! Votre réputation grandit.`, 'good');
    S.money += duelFee(rv.lvl);
    return;
  }
  const lost = shown.sort((x, y) => ART[y].v - ART[x].v)[0];
  const it = myOriginal(lost);
  if (it) { removeItem(it); setOwner(lost, rv.id); }
  log(`${rv.name} vous a défié et gagne ${them}-${me} : le jury lui attribue « ${ART[lost].t} ».`, 'bad');
  toast(`Défi perdu contre ${rv.name} : « ${ART[lost].t} » change de musée. Relevez le défi sur la carte pour le reprendre.`, 'bad', { owner: rv.id });
  emit('changed');
}

// ---------- duel joué par vous ----------
let D = null;
const root = () => $('#duel');
export function canDuel(id) {
  const o = ownerInfo(id);
  return o && (o.ref.cool ?? 0) < now();
}
export function openDuel(id) {
  if (!S.me.placed) return toast('Bâtissez d’abord votre musée sur la carte.', 'warn');
  const o = ownerInfo(id);
  if (!canDuel(id)) return toast(`${o.name} se repose après le dernier défi. Revenez dans un moment.`, 'warn');
  const mine = worksOf('me');
  if (mine.length < 3) return toast('Il vous faut au moins 3 œuvres originales pour lancer un défi.', 'warn');
  if (worksOf(id).length < 1) return toast(`${o.name} n’a aucune œuvre à présenter.`, 'warn');
  const fee = duelFee(o.lvl);
  if (S.money < fee) return toast(`Le défi coûte ${money(fee)} de frais de jury.`, 'bad');
  S.money -= fee;
  D = { o, round: 0, me: 0, them: 0, used: new Set(), usedThem: new Set(), shownMe: [], shownThem: [], theme: drawTheme() };
  S.stats.duels++;
  o.ref.cool = now() + 4 * 60e3;
  addRoute('me', id, '#e2b85a', 120e3);
  root().hidden = false;
  document.body.classList.add('dueling');
  renderRound();
}
function close() {
  root().hidden = true; root().innerHTML = '';
  document.body.classList.remove('dueling');
  clearRoutes(); D = null; emit('changed');
}
function head(sub) {
  return `<div class="dz-head"><div><p class="eyebrow">Défi d’exposition · ${esc(D.o.name)}</p><h2>${sub}</h2></div>
    <div class="score num"><span>${D.me}</span><i>—</i><span>${D.them}</span></div></div>`;
}
function renderRound() {
  const t = D.theme;
  const mine = worksOf('me').filter(aid => !D.used.has(aid)).sort((a, b) => score(b, t) - score(a, t));
  root().innerHTML = `<div class="dz">${head(`Manche ${D.round + 1} sur 3`)}
    <div class="theme"><p class="eyebrow">Thème du jury</p><h3>${esc(t.name)}</h3><p class="muted">${esc(t.desc)}</p></div>
    <p class="note">Choisissez l’œuvre à présenter. Elles sont triées de la plus forte à la plus faible pour ce thème.</p>
    <div class="grid dz-pick"></div></div>`;
  const g = $('.dz-pick', root());
  for (const aid of mine.slice(0, 24)) {
    const a = ART[aid];
    const el = document.createElement('button');
    el.className = 'card';
    el.innerHTML = `<div class="ph"><img><i class="rar" style="background:${RARITY[a.r].color}"></i></div><span class="t">${esc(a.t)}</span><span class="a">${esc(a.a)} · ${esc(a.d)}</span><span class="a num">${money(a.v)}</span>`;
    bindImg(el.querySelector('img'), a);
    el.onclick = () => play(aid);
    g.append(el);
  }
}
function play(aid) {
  const t = D.theme;
  const theirs = worksOf(D.o.id).filter(x => !D.usedThem.has(x));
  const b = aiPick(theirs.length ? theirs : worksOf(D.o.id), t, D.o.lvl);
  D.used.add(aid); D.usedThem.add(b); D.shownMe.push(aid); D.shownThem.push(b);
  const sa = score(aid, t), sb = score(b, t) * homeBonus(D.o.def);
  const win = sa >= sb;
  if (win) D.me++; else D.them++;
  const A = ART[aid], B = ART[b];
  root().innerHTML = `<div class="dz">${head(win ? 'Manche gagnée' : 'Manche perdue')}
    <div class="theme"><p class="eyebrow">Thème</p><h3>${esc(t.name)}</h3></div>
    <div class="versus">
      <figure class="${win ? 'win' : 'lose'}"><div class="frame"><img></div><figcaption><b>${esc(A.t)}</b><span>${esc(A.a)} · ${esc(A.d)}</span><span class="num">${money(A.v)}</span></figcaption></figure>
      <div class="vs">contre</div>
      <figure class="${win ? 'lose' : 'win'}"><div class="frame"><img></div><figcaption><b>${esc(B.t)}</b><span>${esc(B.a)} · ${esc(B.d)}</span><span class="num">${money(B.v)}</span></figcaption></figure>
    </div>
    <p class="verdict ${win ? 'good' : 'bad'}">${win ? 'Le jury se lève pour votre œuvre.' : `Le jury préfère l’œuvre de ${esc(D.o.name)}${D.o.kind !== 'me' && defenseScore(D.o.def) > 0 ? ' (ses protections lui donnent un avantage à domicile)' : ''}.`}</p>
    <div class="dz-foot"><button class="btn primary" data-next>${D.me >= 2 || D.them >= 2 || D.round >= 2 ? 'Voir le verdict' : 'Manche suivante'}</button></div></div>`;
  const imgs = $$('.versus img', root());
  bindImg(imgs[0], A, true); bindImg(imgs[1], B, true);
  $('[data-next]', root()).onclick = () => {
    D.round++;
    if (D.me >= 2 || D.them >= 2 || D.round >= 3) return verdict();
    D.theme = drawTheme(); renderRound();
  };
}
function verdict() {
  const o = D.o;
  if (D.me > D.them) {
    const prizes = D.shownThem.filter((x, i, arr) => arr.indexOf(x) === i);
    root().innerHTML = `<div class="dz">${head('Victoire !')}
      <p class="lead">Le jury vous désigne vainqueur ${D.me}-${D.them}. Choisissez l’œuvre de ${esc(o.name)} qui rejoint votre musée.</p>
      <div class="grid dz-pick"></div></div>`;
    const g = $('.dz-pick', root());
    for (const aid of prizes) {
      const a = ART[aid];
      const el = document.createElement('button'); el.className = 'card';
      el.innerHTML = `<div class="ph"><img><i class="rar" style="background:${RARITY[a.r].color}"></i></div><span class="t">${esc(a.t)}</span><span class="a num">${money(a.v)}</span>`;
      bindImg(el.querySelector('img'), a);
      el.onclick = () => {
        addItem(aid);
        S.stats.wins++;
        log(`Défi gagné ${D.me}-${D.them} contre ${o.name} : « ${a.t} » rejoint votre réserve.`, 'good');
        toast(`« ${a.t} » rejoint votre réserve !`, 'good', { aid });
        if (o.kind === 'rival') o.ref.money += 0;
        finalScreen(a);
      };
      g.append(el);
    }
  } else {
    const lost = D.shownMe.sort((x, y) => ART[y].v - ART[x].v)[0];
    const it = myOriginal(lost);
    if (it) { removeItem(it); setOwner(lost, o.id); }
    log(`Défi perdu ${D.me}-${D.them} contre ${o.name} : « ${ART[lost].t} » part chez eux.`, 'bad');
    root().innerHTML = `<div class="dz">${head('Défaite')}
      <p class="lead">${esc(o.name)} l’emporte ${D.them}-${D.me}. Le jury lui attribue votre « ${esc(ART[lost].t)} ».</p>
      <div class="dz-foot"><button class="btn primary" data-x>Retour à la carte</button></div></div>`;
    $('[data-x]', root()).onclick = close;
  }
}
function finalScreen(a) {
  root().innerHTML = `<div class="dz">${head('Victoire !')}
    <div class="result"><div class="frame"><img></div><h2>${esc(a.t)}</h2><p class="muted">${esc(a.a)} · ${esc(a.d)} · ${money(a.v)}</p></div>
    <div class="dz-foot"><button class="btn primary" data-x>Retour à la carte</button></div></div>`;
  bindImg($('.result img', root()), a, true);
  $('[data-x]', root()).onclick = close;
}
