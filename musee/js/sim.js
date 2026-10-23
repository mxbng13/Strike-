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

export const sellPrice = aid => Math.round(ART[aid].v * 0.6 / 100) * 100;

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
  S.money -= amount; // rendu si un rival surenchérit
  l.bid = amount; l.top = 'me'; l.hist.unshift({ who: 'me', v: amount });
  if (l.end - now() < 15000) l.end = now() + 15000;
  return true;
}
export function consign(it) {
  if (it.copy) { toast('On ne peut pas vendre une copie aux enchères.', 'warn'); return false; }
  it.wall = false; it.selling = true;
  S.auctions.push(makeLot(it.aid, 'me', { iid: it.iid }));
  log(`« ${ART[it.aid].t} » est mis aux enchères.`, 'info');
  emit('changed'); return true;
}
function outbid(l, who, amount) {
  if (l.top === 'me') { S.money += l.bid; toast(`${ownerInfo(who).name} a dépassé ton offre sur « ${ART[l.aid].t} » (${money(amount)}). Ton argent t’est rendu.`, 'warn'); }
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
    if (!l.top) { it.selling = false; toast(`Personne n’a acheté « ${a.t} ». Elle revient chez toi.`, 'warn'); return; }
    const gain = Math.round(l.bid * 0.9);
    S.money += gain; removeItem(it);
    const buyer = ownerInfo(l.top);
    buyer.ref.money -= l.bid;
    setOwner(l.aid, l.top);
    log(`Vendu aux enchères : « ${a.t} » à ${buyer.name} pour ${money(l.bid)} (vous touchez ${money(gain)}).`, 'good');
    toast(`Vendu ! « ${a.t} » part chez ${buyer.name} pour ${money(l.bid)}.`, 'good');
    emit('changed'); return;
  }
  if (!l.top) return;
  if (l.top === 'me') {
    addItem(l.aid); S.stats.auctionsWon++;
    log(`Vous remportez « ${a.t} » aux enchères pour ${money(l.bid)}.`, 'good');
    toast(`Gagné ! « ${a.t} » est à toi pour ${money(l.bid)}.`, 'good', { aid: l.aid });
    emit('changed'); return;
  }
  const rv = ownerInfo(l.top).ref;
  rv.money -= l.bid; setOwner(l.aid, rv.id);
  log(`${rv.name} remporte « ${a.t} » pour ${money(l.bid)}.`, 'info');
}

// ---------- copies et caisses ----------
export const copyCost = aid => Math.max(500, Math.round(ART[aid].v * 0.03 / 100) * 100);
export function makeCopy(aid) {
  if (!myOriginal(aid)) { toast('Il faut avoir l’original pour en faire une copie.', 'warn'); return false; }
  const c = copyCost(aid);
  if (S.money < c) { toast('Pas assez d’argent.', 'bad'); return false; }
  S.money -= c;
  const q = clamp(0.6 + 0.02 * S.me.lvl + Math.random() * 0.2, 0, 0.99);
  addItem(aid, { copy: q });
  S.stats.copies++;
  toast(`Copie de « ${ART[aid].t} » prête : elle est dans ta réserve.`, 'good');
  emit('changed'); return true;
}
export const CRATES = [
  { k: 'bois', name: 'Caisse en bois', cost: 3000, w: [70, 27, 3, 0, 0], desc: 'Des trouvailles de brocante.' },
  { k: 'argent', name: 'Caisse d’argent', cost: 45000, w: [28, 45, 22, 5, 0], desc: 'De belles pièces de collection.' },
  { k: 'or', name: 'Caisse dorée', cost: 650000, w: [0, 30, 45, 20, 5], desc: 'Des chefs-d’œuvre, parfois mythiques.' },
];
export function openCrate(c) {
  if (S.money < c.cost) { toast('Pas assez d’argent pour cette caisse.', 'bad'); return; }
  const a = drawArt(c.w);
  if (!a) { toast('Plus aucune œuvre disponible.', 'warn'); return; }
  S.money -= c.cost;
  addItem(a.id);
  S.stats.exped++;
  log(`${c.name} : « ${a.t} » (${RARITY[a.r].name}).`, 'good');
  emit('reveal', a.id, c.name);
  emit('changed');
}

// ---------- boucle ----------
let acc = 0, challengeFn = null;
export const setChallengeHandler = fn => { challengeFn = fn; };
export function tick(dtMs) {
  const t = now();
  acc += incomePerMin() * dtMs / 60000;
  if (acc >= 1) { const g = Math.floor(acc); S.money += g; acc -= g; }
  tickAuctions();
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
