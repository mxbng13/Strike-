// Simulation en temps réel : revenus, marché, enchères, rachats, défis des rivaux, atelier et expéditions.
import { ART, RARITY } from './catalog.js';
import { S, log, addItem, removeItem, incomePerMin, setOwner, ownerInfo, freeArt, myOriginal } from './state.js';
import { now, rand, randi, pick, clamp, weighted, money } from './util.js';

const listeners = {};
export const on = (ev, fn) => { (listeners[ev] ??= []).push(fn); };
export const emit = (ev, ...a) => (listeners[ev] ?? []).forEach(f => f(...a));
export const toast = (msg, kind = 'info', extra) => emit('toast', msg, kind, extra);

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
  for (let i = 0; i < 6; i++) { const a = drawArt([55, 33, 10, 2, 0], a => !lots.includes(a.id)); if (a) lots.push(a.id); }
  S.market.lots = lots;
}
export const marketPrice = aid => Math.round(ART[aid].v * 1.15 / 100) * 100;
export function buy(aid) {
  const p = marketPrice(aid);
  if (S.money < p) { toast('Pas assez d’argent.', 'bad'); return false; }
  S.money -= p; addItem(aid); S.stats.bought++;
  log(`Acheté en galerie : « ${ART[aid].t} » pour ${money(p)}.`, 'good');
  toast(`« ${ART[aid].t} » rejoint votre réserve.`, 'good', { aid });
  emit('changed'); return true;
}
export const sellPrice = aid => Math.round(ART[aid].v * 0.6 / 100) * 100;

// ---------- rachat ----------
export function buyoutChance(aid, offer) {
  const o = ownerInfo(S.owners[aid]);
  if (!o) return 0;
  const ratio = offer / ART[aid].v;
  let c = (ratio - 0.9) * 0.9 + 0.15 - o.lvl * 0.015;
  if (o.kind === 'inst') c *= ART[aid].s === 'wiki' ? 0.12 : 0.35;
  return clamp(c, 0.01, o.kind === 'inst' ? 0.5 : 0.95);
}
export function proposeBuyout(aid, offer) {
  const o = ownerInfo(S.owners[aid]);
  if (!o) return false;
  if ((o.ref.refuse ?? 0) > now()) { toast(`${o.name} ne veut plus entendre parler d’offre pour l’instant.`, 'warn'); return false; }
  if (S.money < offer) { toast('Pas assez d’argent pour cette offre.', 'bad'); return false; }
  if (Math.random() < buyoutChance(aid, offer)) {
    S.money -= offer;
    if (o.kind === 'rival') o.ref.money += offer;
    addItem(aid); S.stats.buyouts++;
    log(`${o.name} accepte votre offre : « ${ART[aid].t} » pour ${money(offer)}.`, 'good');
    toast(`Marché conclu ! ${o.name} vous cède « ${ART[aid].t} ».`, 'good', { aid });
    emit('changed'); return true;
  }
  o.ref.refuse = now() + 3 * 60e3;
  log(`${o.name} refuse votre offre de ${money(offer)} pour « ${ART[aid].t} ».`, 'warn');
  toast(`${o.name} refuse. Réessayez dans 3 minutes, avec une meilleure offre.`, 'warn');
  return false;
}

// ---------- enchères ----------
export function makeLot(aid, seller, extra = {}) {
  const a = ART[aid];
  const bidders = [...S.rivals].sort(() => Math.random() - 0.5).slice(0, randi(2, 5))
    .map(r => ({ id: r.id, max: Math.min(r.money * 0.5, a.v * rand(0.7, 1.4)) }));
  return { id: Math.random().toString(36).slice(2, 9), aid, seller, bid: Math.round(a.v * 0.45 / 100) * 100, top: null,
    end: now() + randi(100, 220) * 1000, bidders, hist: [], nextAi: now() + randi(3, 9) * 1000, ...extra };
}
export const bidStep = l => Math.max(100, Math.round(l.bid * 0.05 / 100) * 100);
export function playerBid(l, amount) {
  if (l.top === 'me' || l.seller === 'me') return false;
  if (amount > S.money) { toast('Pas assez d’argent pour cette enchère.', 'bad'); return false; }
  S.money -= amount; // bloqué tant que vous êtes en tête
  l.bid = amount; l.top = 'me'; l.hist.unshift({ who: 'me', v: amount });
  if (l.end - now() < 15000) l.end = now() + 15000;
  return true;
}
export function consign(it) {
  if (it.copy) { toast('Seuls les originaux passent en vente publique. Vendez la reproduction à la boutique.', 'warn'); return false; }
  it.wall = false; it.selling = true;
  S.auctions.push(makeLot(it.aid, 'me', { iid: it.iid }));
  log(`« ${ART[it.aid].t} » est mis aux enchères.`, 'info');
  emit('changed'); return true;
}
function outbid(l, who, amount) {
  if (l.top === 'me') { S.money += l.bid; toast(`Surenchère sur « ${ART[l.aid].t} » : ${ownerInfo(who).name} propose ${money(amount)}.`, 'warn'); }
  l.bid = amount; l.top = who; l.hist.unshift({ who, v: amount });
  if (l.hist.length > 8) l.hist.length = 8;
  if (l.end - now() < 12000) l.end = now() + 12000;
}
function tickAuctions() {
  const t = now();
  while (S.auctions.filter(l => l.seller === 'npc').length < 3) {
    const a = drawArt([30, 38, 22, 8, 2], a => !S.auctions.some(l => l.aid === a.id));
    if (!a) break;
    S.auctions.push(makeLot(a.id, 'npc'));
  }
  for (const l of [...S.auctions]) {
    if (t >= l.nextAi && t < l.end) {
      l.nextAi = t + randi(2, 9) * 1000;
      const want = l.bidders.filter(b => b.id !== l.top && b.max >= l.bid + bidStep(l));
      if (want.length && Math.random() < 0.75) {
        const b = pick(want);
        outbid(l, b.id, Math.round(Math.min(b.max, l.bid + bidStep(l) * randi(1, 3)) / 100) * 100);
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
    if (!it) return;
    if (!l.top) { it.selling = false; toast(`« ${a.t} » n’a trouvé aucun acheteur.`, 'warn'); return; }
    const gain = Math.round(l.bid * 0.9);
    S.money += gain; removeItem(it);
    const buyer = ownerInfo(l.top);
    buyer.ref.money -= l.bid;
    setOwner(l.aid, l.top);
    log(`Vendu aux enchères : « ${a.t} » à ${buyer.name} pour ${money(l.bid)} (vous touchez ${money(gain)}).`, 'good');
    toast(`Adjugé ! « ${a.t} » vendu ${money(l.bid)} à ${buyer.name}.`, 'good');
    emit('changed'); return;
  }
  if (!l.top) return;
  if (l.top === 'me') {
    addItem(l.aid); S.stats.auctionsWon++;
    log(`Vous remportez « ${a.t} » aux enchères pour ${money(l.bid)}.`, 'good');
    toast(`Adjugé ! « ${a.t} » rejoint votre réserve.`, 'good', { aid: l.aid });
    emit('changed'); return;
  }
  const rv = ownerInfo(l.top).ref;
  rv.money -= l.bid; setOwner(l.aid, rv.id);
  log(`${rv.name} remporte « ${a.t} » pour ${money(l.bid)}.`, 'info');
}

// ---------- atelier (reproductions officielles) et expéditions ----------
export const copyCost = aid => Math.max(500, Math.round(ART[aid].v * 0.03 / 100) * 100);
export const copyTime = aid => (30 + 30 * ART[aid].r) * 1000;
export const workshopSlots = () => 1 + Math.floor((S.me.lvl - 1) / 3);
export function startCopy(aid) {
  if (!myOriginal(aid)) return toast('Vous devez posséder l’original pour en faire une reproduction.', 'warn');
  if (S.jobs.filter(j => j.type === 'copy').length >= workshopSlots()) return toast('L’atelier est complet. Agrandissez le musée pour plus d’établis.', 'warn');
  const c = copyCost(aid);
  if (S.money < c) return toast('Pas assez d’argent.', 'bad');
  S.money -= c;
  const q = clamp(0.6 + 0.02 * S.me.lvl + Math.random() * 0.2, 0, 0.99);
  S.jobs.push({ id: Math.random().toString(36).slice(2, 8), type: 'copy', aid, q, start: now(), end: now() + copyTime(aid) });
  toast(`L’atelier commence une reproduction de « ${ART[aid].t} ».`, 'info');
  emit('changed');
}
export const EXPEDITIONS = [
  { k: 'brocante', name: 'Brocantes & greniers', cost: 3000, ms: 45e3, w: [70, 27, 3, 0, 0], desc: 'Chiner chez les antiquaires de province.' },
  { k: 'fouilles', name: 'Fouilles archéologiques', cost: 45000, ms: 3 * 60e3, w: [28, 45, 22, 5, 0], desc: 'Une équipe sur un site oublié.' },
  { k: 'grande', name: 'Grande expédition', cost: 650000, ms: 8 * 60e3, w: [0, 30, 45, 20, 5], desc: 'Archives, épaves, collections perdues.' },
];
export function startExpedition(ex) {
  if (S.jobs.some(j => j.type === 'exped' && j.k === ex.k)) return;
  if (S.money < ex.cost) return toast('Pas assez d’argent.', 'bad');
  S.money -= ex.cost;
  S.jobs.push({ id: Math.random().toString(36).slice(2, 8), type: 'exped', k: ex.k, start: now(), end: now() + ex.ms });
  toast(`L’équipe part : ${ex.name}.`, 'info'); emit('changed');
}
function finishJob(j) {
  if (j.type === 'copy') {
    const it = addItem(j.aid, { copy: j.q });
    S.stats.copies++;
    log(`Atelier : reproduction de « ${ART[j.aid].t} » terminée (qualité ${Math.round(j.q * 100)} %).`, 'good');
    toast(`Reproduction terminée : « ${ART[j.aid].t} ».`, 'good', { aid: j.aid, iid: it.iid });
  } else {
    const ex = EXPEDITIONS.find(e => e.k === j.k);
    const a = drawArt(ex.w);
    S.stats.exped++;
    if (!a) { toast('L’expédition revient bredouille.', 'warn'); return; }
    addItem(a.id);
    log(`Expédition « ${ex.name} » : découverte de « ${a.t} » (${RARITY[a.r].name}).`, 'good');
    emit('reveal', a.id, ex.name);
  }
}

// ---------- boucle ----------
let acc = 0, challengeFn = null;
export const setChallengeHandler = fn => { challengeFn = fn; };
export function tick(dtMs) {
  const t = now();
  acc += incomePerMin() * dtMs / 60000;
  if (acc >= 1) { const g = Math.floor(acc); S.money += g; acc -= g; }
  for (const j of [...S.jobs]) if (t >= j.end) { S.jobs = S.jobs.filter(x => x !== j); finishJob(j); emit('changed'); }
  tickAuctions();
  refreshMarket(false);
  if (S.me.placed && t >= S.nextChallenge) {
    S.nextChallenge = t + randi(5, 9) * 60e3;
    const cands = S.rivals.filter(r => r.aggr > 0.15);
    challengeFn?.(cands[weighted(cands.map(r => r.aggr))]);
  }
  for (const rv of S.rivals) rv.money += rv.lvl * 25 * dtMs / 1000;
}
export function catchUp() {
  const away = Math.min(now() - S.last, 8 * 3600e3);
  if (away < 60e3) return null;
  const gained = Math.round(incomePerMin() * away / 60000);
  S.money += gained;
  for (const l of [...S.auctions]) if (now() >= l.end) closeLot(l);
  if (S.nextChallenge < now()) S.nextChallenge = now() + randi(2, 5) * 60e3;
  return { away, gained };
}
