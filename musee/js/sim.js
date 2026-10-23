// Simulation en temps réel : revenus, enchères, raids des rivaux, police, ateliers, expéditions.
import { ART, RARITY } from './catalog.js';
import { S, DEF, ROLES, log, addItem, removeItem, wallItems, incomePerMin, isHot, setOwner, ownerInfo, worksOf, freeArt, newCrewMember, myOriginal } from './state.js';
import { now, rand, randi, pick, clamp, weighted, money } from './util.js';

const listeners = {};
export const on = (ev, fn) => { (listeners[ev] ??= []).push(fn); };
export const emit = (ev, ...a) => (listeners[ev] ?? []).forEach(f => f(...a));
export const toast = (msg, kind = 'info', extra) => emit('toast', msg, kind, extra);

// ---------- tirages ----------
export function drawArt(weights, filter = () => true) {
  const free = freeArt().filter(filter);
  for (let tries = 0; tries < 6; tries++) {
    const r = weighted(weights) + 1;
    const c = free.filter(a => a.r === r);
    if (c.length) return pick(c);
  }
  return free.length ? pick(free) : null;
}

// ---------- marché ----------
export function refreshMarket(force) {
  if (!force && now() - S.market.at < 8 * 60e3 && S.market.lots.length) return;
  S.market.at = now();
  const lots = [];
  for (let i = 0; i < 6; i++) {
    const a = drawArt([55, 33, 10, 2, 0], a => !lots.includes(a.id));
    if (a) lots.push(a.id);
  }
  S.market.lots = lots;
}
export const marketPrice = aid => Math.round(ART[aid].v * 1.15 / 100) * 100;

// ---------- enchères ----------
function newLot() {
  const a = drawArt([30, 38, 22, 8, 2], a => !S.auctions.some(l => l.aid === a.id));
  if (!a) return null;
  return makeLot(a.id, 'npc');
}
export function makeLot(aid, seller, extra = {}) {
  const a = ART[aid];
  const bidders = [...S.rivals].sort(() => Math.random() - 0.5).slice(0, randi(2, 5))
    .map(r => ({ id: r.id, max: Math.min(r.money * 0.5, a.v * rand(0.7, 1.4)) }));
  return {
    id: Math.random().toString(36).slice(2, 9), aid, seller, bid: Math.round(a.v * 0.45 / 100) * 100, top: null,
    end: now() + randi(100, 220) * 1000, bidders, hist: [], nextAi: now() + randi(3, 9) * 1000, ...extra,
  };
}
export function bidStep(l) { return Math.max(100, Math.round(l.bid * 0.05 / 100) * 100); }
export function playerBid(l, amount) {
  if (l.top === 'me' || l.seller === 'me') return false;
  if (amount > S.money) { toast('Pas assez d’argent pour cette enchère.', 'bad'); return false; }
  S.money -= amount;            // l’argent est bloqué tant que vous êtes en tête
  l.bid = amount; l.top = 'me'; l.hist.unshift({ who: 'me', v: amount, t: now() });
  if (l.end - now() < 15000) l.end = now() + 15000;
  return true;
}
function outbid(l, who, amount) {
  if (l.top === 'me') { S.money += l.bid; toast(`Surenchère sur « ${ART[l.aid].t} » : ${ownerInfo(who).name} propose ${money(amount)}.`, 'warn'); }
  l.bid = amount; l.top = who; l.hist.unshift({ who, v: amount, t: now() });
  if (l.hist.length > 8) l.hist.length = 8;
  if (l.end - now() < 12000) l.end = now() + 12000;
}
function tickAuctions() {
  const t = now();
  while (S.auctions.filter(l => l.seller === 'npc').length < 3) { const l = newLot(); if (!l) break; S.auctions.push(l); }
  for (const l of [...S.auctions]) {
    if (t >= l.nextAi && t < l.end) {
      l.nextAi = t + randi(2, 9) * 1000;
      const want = l.bidders.filter(b => b.id !== l.top && b.max >= l.bid + bidStep(l));
      if (want.length && Math.random() < 0.75) {
        const b = pick(want);
        const amount = Math.min(b.max, l.bid + bidStep(l) * randi(1, 3));
        outbid(l, b.id, Math.round(amount / 100) * 100);
      }
    }
    if (t >= l.end) closeLot(l);
  }
}
function closeLot(l) {
  S.auctions = S.auctions.filter(x => x !== l);
  const a = ART[l.aid];
  if (l.seller === 'me') {
    const it = S.items.find(x => x.iid === l.iid);
    if (!l.top) { if (it) it.selling = false; toast(`« ${a.t} » n’a trouvé aucun acheteur.`, 'warn'); return; }
    if (!it) return;
    // contrôle de l’expert : faux, ou œuvre volée encore recherchée
    let risk = 0;
    if (it.copy) risk = 0.1 + (1 - it.copy) * 0.8 + (S.owners[l.aid] || (myOriginal(l.aid) && myOriginal(l.aid) !== it) ? 0.3 : 0);
    else if (it.from) risk = isHot(it) ? 0.5 : 0.1;
    if (Math.random() < risk) {
      removeItem(it);
      if (it.from && !it.copy) setOwner(l.aid, it.from);
      S.heat = clamp(S.heat + 15, 0, 100);
      log(`Vente annulée : l’expert a démasqué « ${a.t} » (${it.copy ? 'faux' : 'œuvre volée'}). L’objet est saisi.`, 'bad');
      toast(`L’expert de la maison de ventes a démasqué « ${a.t} » ! Objet saisi, la police s’intéresse à vous.`, 'bad');
      return;
    }
    const gain = Math.round(l.bid * 0.9);
    S.money += gain;
    removeItem(it);
    const buyer = ownerInfo(l.top);
    if (!it.copy) setOwner(l.aid, l.top);
    else { S.stats.fakesSold++; buyer.ref.fakes[l.aid] = it.copy; }
    log(`Vendu aux enchères : « ${a.t} » à ${buyer.name} pour ${money(l.bid)} (vous touchez ${money(gain)}).`, 'good');
    toast(`Adjugé ! « ${a.t} » vendu ${money(l.bid)} à ${buyer.name}.`, 'good');
    return;
  }
  if (!l.top) return;
  if (l.top === 'me') {
    const it = addItem(l.aid);
    S.stats.auctionsWon++;
    log(`Vous remportez « ${a.t} » aux enchères pour ${money(l.bid)}.`, 'good');
    toast(`Adjugé ! « ${a.t} » rejoint votre réserve.`, 'good', { aid: l.aid });
    emit('changed');
    return it;
  }
  const rv = ownerInfo(l.top).ref;
  rv.money -= l.bid;
  setOwner(l.aid, rv.id);
  log(`${rv.name} remporte « ${a.t} » pour ${money(l.bid)}.`, 'info');
}

// ---------- raids rivaux ----------
export function phaseChance(skill, def) {
  return clamp(0.55 + 0.09 * (skill - def), 0.04, 0.97);
}
function raid(silent) {
  const targets = wallItems();
  if (!S.me.placed || !targets.length) return;
  const cands = S.rivals.filter(r => r.aggr > 0.15);
  const rv = cands[weighted(cands.map(r => r.aggr * (r.grudge ? 3 : 1)))];
  rv.grudge = 0;
  const d = S.me.def;
  const phases = [d.locks, d.cams, Math.ceil((d.guards + d.dogs) / 2), d.lasers, d.alarm];
  const skill = rv.lvl * 0.9 + rand(-1, 2);
  const fails = phases.filter(def => Math.random() > phaseChance(skill, def)).length;
  emit('raid', rv);
  if (fails >= 2) {
    log(`${rv.name} a tenté un cambriolage chez vous : repoussé par votre sécurité.`, 'good');
    if (!silent) toast(`Cambriolage repoussé ! L’équipe de ${rv.name} a fait demi-tour.`, 'good');
    return;
  }
  const it = targets[weighted(targets.map(x => ART[x.aid].v))];
  const a = ART[it.aid];
  removeItem(it);
  if (it.copy) {
    log(`${rv.name} a volé votre copie de « ${a.t} ». L’original ne craint rien.`, 'warn');
    if (!silent) toast(`${rv.name} est tombé dans le piège : ils ont volé votre copie de « ${a.t} » !`, 'warn');
  } else {
    setOwner(it.aid, rv.id);
    log(`${rv.name} a volé « ${a.t} » dans vos salles !`, 'bad');
    if (!silent) toast(`Alerte : ${rv.name} a volé « ${a.t} » ! Vous pouvez le reprendre sur la carte.`, 'bad', { rival: rv.id });
  }
  emit('changed');
}

// ---------- police ----------
function inspect() {
  if (S.heat < 50) return;
  if (Math.random() > (S.heat - 45) / 150) return;
  const hot = S.items.filter(x => x.wall && isHot(x) && !x.copy);
  S.heat = clamp(S.heat - 20, 0, 100);
  if (!hot.length) { log('Inspection d’Interpol : rien trouvé dans vos salles.', 'info'); toast('Interpol a inspecté votre musée… sans rien trouver.', 'info'); return; }
  const it = pick(hot);
  const a = ART[it.aid];
  removeItem(it);
  setOwner(it.aid, it.from);
  const fine = Math.round(a.v * 0.1);
  S.money = Math.max(0, S.money - fine);
  log(`Interpol a saisi « ${a.t} » exposé dans vos salles et vous inflige ${money(fine)} d’amende.`, 'bad');
  toast(`Descente d’Interpol ! « ${a.t} » est rendu à son propriétaire. Amende : ${money(fine)}.`, 'bad');
  emit('changed');
}
function fakeChecks() {
  for (const rv of S.rivals) for (const [aid, q] of Object.entries(rv.fakes)) {
    if (Math.random() < (1 - q) * 0.08) {
      delete rv.fakes[aid];
      rv.grudge = 1;
      if (S.owners[aid] === rv.id) setOwner(+aid, null);
      log(`${rv.name} a découvert que son « ${ART[aid].t} » est un faux. Ils cherchent le coupable…`, 'warn');
      toast(`${rv.name} a découvert votre faux « ${ART[aid].t} ». Attendez-vous à une riposte.`, 'warn');
      S.nextRaid = Math.min(S.nextRaid, now() + 90e3);
    }
  }
}

// ---------- ateliers et expéditions ----------
export const EXPEDITIONS = [
  { k: 'brocante', name: 'Brocantes & greniers', cost: 3000, ms: 45e3, w: [70, 27, 3, 0, 0], desc: 'Chiner chez les antiquaires de province.' },
  { k: 'fouilles', name: 'Fouilles archéologiques', cost: 45000, ms: 3 * 60e3, w: [28, 45, 22, 5, 0], desc: 'Une équipe sur un site oublié.' },
  { k: 'grande', name: 'Grande expédition', cost: 650000, ms: 8 * 60e3, w: [0, 30, 45, 20, 5], desc: 'Archives, épaves, collections perdues.' },
];
function finishJob(j) {
  if (j.type === 'copy') {
    const it = addItem(j.aid, { copy: j.q });
    S.stats.forged++;
    log(`Atelier : copie de « ${ART[j.aid].t} » terminée (qualité ${Math.round(j.q * 100)} %).`, 'good');
    toast(`Copie terminée : « ${ART[j.aid].t} » (qualité ${Math.round(j.q * 100)} %).`, 'good', { iid: it.iid });
  } else if (j.type === 'exped') {
    const ex = EXPEDITIONS.find(e => e.k === j.k);
    const a = drawArt(ex.w);
    S.stats.exped++;
    if (!a) { toast('L’expédition revient bredouille.', 'warn'); return; }
    addItem(a.id);
    log(`Expédition « ${ex.name} » : découverte de « ${a.t} » (${RARITY[a.r].name}).`, 'good');
    emit('reveal', a.id, ex.name);
  }
}

function tickRecruits() {
  if (now() - S.recruitsAt < 5 * 60e3 && S.recruits.length) return;
  S.recruitsAt = now();
  const roles = Object.keys(ROLES);
  const best = Math.max(1, ...S.crew.map(c => c.lvl));
  S.recruits = Array.from({ length: 4 }, () => newCrewMember(pick(roles), clamp(randi(1, best + 1), 1, 8)));
}
export const hireCost = lvl => Math.round(3000 * Math.pow(lvl, 2.2));

// ---------- boucle ----------
let acc = 0;
export function tick(dtMs, silent = false) {
  const t = now();
  acc += incomePerMin() * dtMs / 60000;
  if (acc >= 1) { const g = Math.floor(acc); S.money += g; acc -= g; }
  S.heat = clamp(S.heat - dtMs / 15000, 0, 100);
  for (const j of [...S.jobs]) if (t >= j.end) { S.jobs = S.jobs.filter(x => x !== j); finishJob(j); emit('changed'); }
  for (const c of S.crew) if (c.jail && t >= c.jail) { c.jail = 0; log(`${c.name} est sorti de prison.`, 'info'); }
  tickAuctions();
  refreshMarket(false);
  tickRecruits();
  if (S.me.placed && t >= S.nextRaid) { S.nextRaid = t + randi(4, 8) * 60e3; raid(silent); }
  if (t >= S.nextInspect) { S.nextInspect = t + 30e3; inspect(); }
  if (t >= S.nextFakeCheck) { S.nextFakeCheck = t + 60e3; fakeChecks(); }
  // les rivaux s’enrichissent et se protègent avec le temps
  for (const rv of S.rivals) rv.money += rv.lvl * 25 * dtMs / 1000;
}

// rattrapage hors-ligne (8 h au plus), sans notifications en cascade
export function catchUp() {
  const away = Math.min(now() - S.last, 8 * 3600e3);
  if (away < 5000) return null;
  const before = S.money, beforeItems = S.items.length;
  const gained = Math.round(incomePerMin() * away / 60000);
  S.money += gained;
  S.heat = clamp(S.heat - away / 15000, 0, 100);
  let raids = 0;
  while (S.me.placed && S.nextRaid < now() && raids < 2) { raid(true); raids++; S.nextRaid += randi(4, 8) * 60e3; }
  if (S.nextRaid < now()) S.nextRaid = now() + randi(2, 5) * 60e3;
  for (const l of [...S.auctions]) if (now() >= l.end) closeLot(l);
  return { away, gained: S.money - before, lost: beforeItems - S.items.length };
}
