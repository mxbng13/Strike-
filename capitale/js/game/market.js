// LE MARCHÉ ET LES HABITANTS.
// Chaque habitant exerce un vrai métier : il récolte, fabrique (en achetant ses matières aux autres) ou rend des services,
// puis vend sa production au prix qu'il fixe selon la demande. Les habitants achètent aussi pour vivre
// (nourriture, soins, coiffeur, électricité…). Rien n'apparaît de nulle part : si personne ne produit, c'est la pénurie.
// Le joueur est un acteur comme les autres : il peut vendre (ses offres sont mises sur le marché) et acheter.
// Ce module est la version locale ; un serveur multijoueur pourra le remplacer par de vrais joueurs.
import { RESOURCES } from '../data/resources.js';
import { ITEMS } from '../data/items.js';
import { GOODS, RECIPES, SERVICES, GATHER_JOBS, NPC_NEEDS, COMPANY_NEEDS, CONSTRUCTION_NEEDS, RESEARCH_NEEDS, PUBLIC_JOBS } from '../data/economy.js';
import { JOBS } from '../data/jobs.js';
import { SITES, NAMES } from '../data/places.js';
import { PROGRAMMES, EVENTS, seasonOf, holidayOf } from '../data/life.js';

export const ALL = { ...RESOURCES, ...ITEMS, ...GOODS };
const SITE = Object.fromEntries(SITES.map((s) => [s.id, s]));
const rnd = Math.random;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TAX = 0.05;
const SURNAMES = ['Arden', 'Voss', 'Calder', 'Morrow', 'Talos', 'Orin', 'Kade', 'Lune', 'Ferro', 'Silva', 'Nox', 'Vega', 'Rook', 'Blythe', 'Corin',
  'Drake', 'Ember', 'Frost', 'Grey', 'Hale', 'Iver', 'Jett', 'Kael', 'Lark', 'Marsh', 'Nash', 'Oak', 'Pike', 'Quill', 'Reyes', 'Stone', 'Thorne'];

// ------------------------------------------------------------------ recettes par métier, valeur de chaque bien
export const RECIPES_BY_JOB = {};
RECIPES.forEach((r, i) => { r.idx = i; for (const j of r.jobs) (RECIPES_BY_JOB[j] = RECIPES_BY_JOB[j] || []).push(r); });
export const PRODUCERS = {};      // bien -> métiers qui le fabriquent ou le récoltent
for (const r of RECIPES) for (const o of Object.keys(r.out)) for (const j of r.jobs) if (j !== '*') (PRODUCERS[o] = PRODUCERS[o] || new Set()).add(j);
for (const [job, list] of Object.entries(GATHER_JOBS)) for (const [site, g] of list) {
  const ga = SITE[site].gather.find((x) => x.id === g);
  for (const [id] of ga.loot) (PRODUCERS[id] = PRODUCERS[id] || new Set()).add(job);
}
export const SERVICES_BY_JOB = {};
for (const s of Object.values(SERVICES)) for (const j of s.jobs) (SERVICES_BY_JOB[j] = SERVICES_BY_JOB[j] || []).push(s);

const wage = (job) => (JOBS[job]?.salaire || 60) / 4;      // ₵ par heure
export const VALUE = {};
(function computeValues() {
  for (const id in ALL) VALUE[id] = ALL[id].prix || 0;
  for (let pass = 0; pass < 8; pass++) {
    for (const r of RECIPES) {
      if (r.jobs[0] === '*') continue;
      let cost = 0;
      for (const [id, q] of Object.entries(r.in)) cost += (VALUE[id] || 5) * q;
      cost += (r.min / 60) * wage(r.jobs[0]);
      if (r.tool) cost += (VALUE[r.tool] || 50) / (ALL[r.tool]?.dur || 30);
      if (r.machine) cost *= 1.1;
      const outs = Object.entries(r.out);
      const totalQ = outs.reduce((a, [, q]) => a + q, 0);
      for (const [id, q] of outs) {
        const v = (cost * 1.15) / totalQ;
        if (!RESOURCES[id] || !VALUE[id]) VALUE[id] = VALUE[id] && pass > 0 ? Math.min(VALUE[id], v) || v : v;
      }
    }
  }
  for (const id in VALUE) VALUE[id] = Math.max(1, Math.round(VALUE[id] * 10) / 10);
})();
export function serviceValue(svc) {
  let v = (Math.min(svc.min, 90) / 60) * wage(svc.jobs[0]) * 1.3 + 4;
  for (const [id, q] of Object.entries(svc.supplies || {})) v += (VALUE[id] || 5) * q;
  if (svc.special === 'hospital') v += 120;
  if (svc.special === 'sleep') v += 25;
  if (svc.special === 'build') v = (svc.min / 60) * wage(svc.jobs[0]) * 1.3;
  return Math.round(v);
}

// ------------------------------------------------------------------ création des habitants
// UN SEUL habitant (bot) par métier pour l'instant. Plus tard, des milliers de joueurs pourront exercer le même métier :
// le marché accepte déjà autant de vendeurs et de prestataires qu'on veut pour un même bien ou service.
// Chaque bot tient une petite entreprise dont la taille (SCALE) suit les besoins de la ville : c'est ce qui permet à un
// seul boulanger de nourrir tout le monde. Quand des joueurs arriveront, on pourra réduire cette taille.
export const JOB_SCALE = { 'agri.agriculteur': 8, 'agroalim.boulanger': 8, 'agri.maraicher': 7, 'agri.pepinieriste': 5, 'hotellerie.chef_cuisinier': 5, 'hotellerie.sommelier': 3, 'agroalim.brasseur': 3,  'agri.eleveur': 3, 'agroalim.boucher': 3, 'agroalim.torrefacteur': 3,
  'hotellerie.serveur': 3, 'hotellerie.chef_cuisinier': 3, 'services.agent_des_bains_publics': 3, 'services.coiffeur': 3, 'industrie.papetier': 6,
  'extraction.carrier': 4, 'industrie.metallurgiste': 5, 'energie.operateur_de_centrale': 6, 'energie.technicien_solaire': 4, 'energie.technicien_eolien': 4, 'extraction.mineur': 6, 'agri.technicien_en_environnement': 8,
  'agri.bucheron': 4, 'artisanat.verrier': 6, 'industrie.soudeur': 5, 'btp.plombier': 4, 'btp.macon': 4, 'btp.electricien': 4, 'btp.peintre_en_batiment': 3, 'btp.conducteur_de_travaux': 3, 'artisanat.ebeniste': 3, 'artisanat.ceramiste': 3, 'btp.charpentier': 3, 'industrie.chimiste': 8, 'agroalim.meunier': 5, 'agroalim.conserveur': 3, 'textile.tisserand': 3, 'textile.couturier': 3,
  'extraction.cueilleur_de_plantes_medicinales': 3, 'sante.pharmacien': 3, 'sante.medecin': 3, 'industrie.operateur_de_production': 5, 'energie.raffineur': 4,
  'extraction.foreur_petrolier': 3, 'artisanat.forgeron': 3, 'mecanique.tourneur_fraiseur': 3, 'mecanique.electronicien': 3 };

export function createEconomy() {
  const citizens = [];
  const used = new Set();
  const uniqueName = () => { for (let k = 0; k < 50; k++) { const nm = `${pick(NAMES)} ${pick(SURNAMES)}`; if (!used.has(nm)) { used.add(nm); return nm; } } return `${pick(NAMES)} ${pick(SURNAMES)} ${used.size}`; };
  let n = 0;
  for (const job of Object.keys(JOBS)) {
    const scale = JOB_SCALE[job] || 2;
    const c = { id: `c${n++}`, nom: uniqueName(), job, scale, money: (500 + Math.round(rnd() * 400)) * scale, stock: {}, price: {}, acc: {},
      wear: 0, note: Math.round((3.4 + rnd() * 1.6) * 10) / 10, sold: 0, earned: 0 };
    for (let k = 0; k < scale; k++) seedStock(c);
    citizens.push(c);
  }
  return { citizens, day: 0, budget: 60000, demand: {}, sales: {}, shortages: {}, lastTx: {} };
}
function outputsOf(job) {
  const outs = new Set();
  for (const r of RECIPES_BY_JOB[job] || []) for (const o of Object.keys(r.out)) outs.add(o);
  for (const [site, g] of GATHER_JOBS[job] || []) for (const [id] of SITE[site].gather.find((x) => x.id === g).loot) outs.add(id);
  return [...outs];
}
const OUTPUTS = {};
for (const job of Object.keys(JOBS)) OUTPUTS[job] = outputsOf(job);
function seedStock(c) {
  for (const id of OUTPUTS[c.job]) {
    const v = VALUE[id] || 5;
    const q = v > 2000 ? (rnd() < 0.5 ? 1 : 0) : v > 300 ? 1 + Math.floor(rnd() * 2) : v > 50 ? 2 + Math.floor(rnd() * 4) : 6 + Math.floor(rnd() * 14);
    if (q) c.stock[id] = q;
    c.price[id] = Math.round(v * (1.05 + rnd() * 0.3) * 10) / 10;
  }
  // de quoi travailler les premiers jours (outils et un peu de matière)
  const job = JOBS[c.job];
  for (const t of [...(job.outils || []), ...(job.equip || [])]) c.stock[t] = (c.stock[t] || 0) + 1;
  for (const r of RECIPES_BY_JOB[c.job] || []) {
    if (r.tool) c.stock[r.tool] = (c.stock[r.tool] || 0) + 1;
    for (const [id, q] of Object.entries(r.in)) c.stock[id] = (c.stock[id] || 0) + q * 2;
  }
  for (const s of SERVICES_BY_JOB[c.job] || []) {
    c.price[`svc:${s.id}`] = Math.round(serviceValue(s) * (0.85 + rnd() * 0.4));
    for (const [id, q] of Object.entries(s.supplies)) c.stock[id] = (c.stock[id] || 0) + Math.ceil(q * 8);
    if (s.tool) c.stock[s.tool] = (c.stock[s.tool] || 0) + 1;
  }
}

// ------------------------------------------------------------------ le marché
export class Market {
  constructor(state, hooks = {}) {
    this.s = state;
    this.e = state.eco;
    this.hooks = hooks;               // onPlayerSale(good, qty, money, buyerName)
    this.byId = new Map(this.e.citizens.map((c) => [c.id, c]));
    this.dirty = true;
  }
  citizen(id) { return this.byId.get(id); }
  policy() { return PROGRAMMES.find((p) => p.id === this.s.city?.programme) || PROGRAMMES[1]; }
  tax() { return this.policy().tva ?? TAX; }
  event() { const e = this.e.event; return e && e.until > (this.s.time || 0) ? EVENTS.find((x) => x.id === e.id) : null; }
  // saisons, actualités et politique de la ville changent la production
  prodMult(job) {
    const sector = JOBS[job]?.sector;
    let m = this.event()?.prod?.[sector] || 1;
    if (sector === 'agri') m *= seasonOf(this.s.time || 0).agri * (this.policy().agri || 1);
    return m;
  }
  // Offres de vente d'un bien, de la moins chère à la plus chère
  offers(good) {
    if (this.dirty) this.rebuild();
    return (this.index[good] || []).filter((o) => o.qty() > 0).sort((a, b) => a.price() - b.price());
  }
  rebuild() {
    const idx = {};
    for (const c of this.e.citizens) {
      if (c.hired) continue;
      for (const id of OUTPUTS[c.job]) if ((c.stock[id] || 0) > 0)
        (idx[id] = idx[id] || []).push({ seller: c, name: c.nom, job: c.job, qty: () => this.sellable(c, id), price: () => (c.price[id] || VALUE[id]) * this.saleMult(id), player: false });
    }
    // offres du joueur (son sac) et de ses bâtiments
    for (const [id, l] of Object.entries(this.s.listings || {})) {
      (idx[id] = idx[id] || []).push({ seller: 'player', name: `${this.s.nom} (vous)`, qty: () => Math.min(l.qty, this.s.inv[id] || 0), price: () => l.price, player: true });
    }
    for (const b of this.s.buildings || []) {
      for (const [id, q] of Object.entries(b.stock || {})) if (q > 0 && b.sell?.[id])
        (idx[id] = idx[id] || []).push({ seller: `b:${b.id}`, building: b, name: `${b.nom} (vous)`, qty: () => b.stock[id] || 0,
          price: () => b.sell[id] * (b.type === 'boutique' ? 0.92 : 1), realPrice: () => b.sell[id], player: true });
    }
    this.index = idx;
    this.dirty = false;
  }
  saleMult(id) {
    const ev = this.event();
    return ev?.sale && ['vetement', 'meuble', 'deco', 'appareil', 'climat'].includes(ALL[id]?.cat) ? ev.sale : 1;
  }
  sellable(c, id) {
    // un habitant garde de quoi travailler : il ne vend pas les matières dont il a besoin
    return Math.max(0, (c.stock[id] || 0) - (this.reserve(c, id)));
  }
  reserve(c, id) {
    let r = 0;
    for (const rec of RECIPES_BY_JOB[c.job] || []) if (rec.in[id]) r = Math.max(r, rec.in[id]);
    if ((JOBS[c.job].outils || []).includes(id) || (JOBS[c.job].equip || []).includes(id)) r = Math.max(r, 1);
    return r;
  }
  bestPrice(good) { const o = this.offers(good)[0]; return o ? o.price() : null; }
  supply(good) { return this.offers(good).reduce((a, o) => a + o.qty(), 0); }
  refPrice(good) { return this.bestPrice(good) ?? VALUE[good] ?? 5; }

  // Achat par un habitant ou par le joueur (buyer = citoyen ou 'player'). Retourne { n, spent }.
  buy(buyer, good, qty, opts = {}) {
    let n = 0, spent = 0;
    const isPlayer = buyer === 'player';
    for (const o of this.offers(good)) {
      if (n >= qty) break;
      if ((isPlayer && o.player) || o.seller === buyer) continue;
      let p = o.price();
      if (opts.maxPrice && p > opts.maxPrice) break;
      if (isPlayer && opts.discount) p *= 1 - opts.discount;
      const take = Math.min(qty - n, o.qty());
      for (let k = 0; k < take; k++) {
        const money = isPlayer ? this.s.money : buyer.money;
        if (money < p) break;
        if (isPlayer) this.s.money -= p; else buyer.money -= p;
        this.pay(o, good, p, isPlayer ? `${this.s.nom}` : buyer.nom);
        if (isPlayer) this.s.inv[good] = (this.s.inv[good] || 0) + 1; else buyer.stock[good] = (buyer.stock[good] || 0) + 1;
        n++; spent += p;
      }
      if (n < qty && (isPlayer ? this.s.money : buyer.money) < p) break;
    }
    if (n < qty && !isPlayer) this.e.shortages[good] = (this.e.shortages[good] || 0) + (qty - n);
    return { n, spent };
  }
  pay(offer, good, p, buyerName) {
    const tax = p * this.tax();
    this.e.budget += tax;
    this.e.sales[good] = (this.e.sales[good] || 0) + 1;
    this.e.lastTx[good] = p;
    if (offer.seller === 'player') {
      this.s.inv[good] -= 1; if (this.s.inv[good] <= 0) delete this.s.inv[good];
      this.s.listings[good].qty -= 1; if (this.s.listings[good].qty <= 0) delete this.s.listings[good];
      this.s.money += p - tax;
      this.hooks.onPlayerSale?.(good, 1, p - tax, buyerName);
      this.dirty = true;
    } else if (offer.building) {
      const b = offer.building;
      b.stock[good] -= 1;
      const real = offer.realPrice();
      this.s.money += real - tax;
      b.revenue = (b.revenue || 0) + real - tax;
      this.hooks.onPlayerSale?.(good, 1, real - tax, buyerName, b);
    } else {
      const c = offer.seller;
      c.stock[good] -= 1;
      c.money += p - tax;
      c.sold++; c.earned += p - tax;
    }
  }

  // Prestataires d'un service (habitants qui exercent le métier et ont de quoi travailler)
  providers(svcId) {
    const svc = SERVICES[svcId];
    const cap = clamp(Math.round(600 / svc.min), 4, 40);
    return this.e.citizens.filter((c) => !c.hired && svc.jobs.includes(c.job) && (c.clients || 0) < cap * (c.scale || 1) && this.canServe(c, svc))
      .map((c) => ({ c, price: c.price[`svc:${svcId}`] || serviceValue(svc) }))
      .sort((a, b) => a.price - b.price);
  }
  canServe(c, svc) {
    if (svc.tool && !(c.stock[svc.tool] > 0)) return false;
    for (const [id, q] of Object.entries(svc.supplies)) if ((c.stock[id] || 0) + (1 - (c.acc[id] || 0)) < q && (c.stock[id] || 0) < Math.ceil(q)) return false;
    return true;
  }
  useSupplies(holder, svc, stockKey = 'stock') {
    holder.acc = holder.acc || {};
    for (const [id, q] of Object.entries(svc.supplies)) {
      holder.acc[id] = (holder.acc[id] || 0) + q;
      while (holder.acc[id] >= 1) {
        const st = holder[stockKey];
        if ((st[id] || 0) <= 0) return false;
        st[id] -= 1; if (st[id] <= 0) delete st[id];
        holder.acc[id] -= 1;
      }
    }
    return true;
  }
  // Un habitant (ou le joueur) paie un service à un prestataire habitant
  payService(c, svc, price, buyer) {
    c.money += price * (1 - this.tax());
    this.e.budget += price * this.tax();
    c.earned += price;
    c.clients = (c.clients || 0) + 1;
    this.useSupplies(c, svc);
    this.e.demand[svc.id] = (this.e.demand[svc.id] || 0) + (buyer === 'player' ? 0 : 1);
  }

  // ------------------------------------------------------------------ une journée d'économie
  day() {
    const e = this.e;
    e.day++;
    e.prevShort = e.shortages || {};
    e.sales = {}; e.shortages = {}; e.demand = {};
    for (const c of e.citizens) { c.sold = 0; c.clients = 0; }
    const order = [...e.citizens].sort(() => rnd() - 0.5);
    this.dirty = true;
    // 1. production
    for (const c of order) if (!c.hired) this.produce(c);
    this.dirty = true;
    // 2. consommation des habitants
    for (const c of order) this.consume(c);
    // 3. commandes des entreprises, chantiers, recherche
    for (const c of order) for (let k = 0; k < (c.scale || 1); k++) {
      for (const [list, p] of [[COMPANY_NEEDS, 0.2], [RESEARCH_NEEDS, 0.1]]) {
        if (c.money < 600 || rnd() > p) continue;
        const id = pick(list);
        if (this.buy(c, id, 1).n && !OUTPUTS[c.job].includes(id)) { c.stock[id] -= 1; if (c.stock[id] <= 0) delete c.stock[id]; }
      }
    }
    const builders = e.day % 2 ? order.filter((c) => c.money > 2500 * (c.scale || 1)).slice(0, 1) : [];
    for (const c of builders) {
      for (const [id, q] of Object.entries(CONSTRUCTION_NEEDS)) this.buy(c, id, q);
      for (const sid of ['gros_oeuvre', 'charpente', 'plomberie', 'electricite_batiment', 'peinture_batiment', 'reception_travaux']) {
        const p = this.providers(sid)[0];
        if (p && c.money > p.price) { c.money -= p.price; this.payService(p.c, SERVICES[sid], p.price, c); }
      }
    }
    // 4. la ville : salaires publics, aides sociales, consommation des stocks périssables
    for (const c of e.citizens) {
      const sc = c.scale || 1;
      if (PUBLIC_JOBS.includes(c.job)) { const w = JOBS[c.job].salaire * 0.9 * sc * (JOBS[c.job].sector === 'securite' ? this.policy().police : 1); c.money += w; e.budget -= w; }
      if (c.money < 60 * sc) { c.money += 70 * sc; e.budget -= 70 * sc; }
      if (c.money > 2500 * sc) { const t = (c.money - 2500 * sc) * 0.04; c.money -= t; e.budget += t; }
      for (const id of Object.keys(c.stock)) {
        const d = ALL[id];
        if (!d) { delete c.stock[id]; continue; }
        if ((d.cat === 'agro' || d.cat === 'nourriture' || d.cat === 'boisson') && c.stock[id] > this.cap(id) * sc) c.stock[id] = Math.floor(c.stock[id] * 0.85);
        if (d.cat === 'doc' && c.stock[id] > 12 * sc) c.stock[id] = 12 * sc;
      }
    }
    // 5. les prix s'ajustent : ce qui part augmente, ce qui reste baisse
    for (const c of e.citizens) {
      const sc = c.scale || 1;
      for (const id of OUTPUTS[c.job]) {
        const st = c.stock[id] || 0, v = VALUE[id] || 5;
        let p = c.price[id] || v;
        if (st <= sc) p *= 1.07; else if (st > 10 * sc && !e.sales[id]) p *= 0.95; else if (st > 4 * sc) p *= 0.98;
        c.price[id] = Math.round(clamp(p, v * 0.55, v * 2.6) * 10) / 10;
      }
      for (const s of SERVICES_BY_JOB[c.job] || []) {
        const k = `svc:${s.id}`, v = serviceValue(s);
        c.price[k] = Math.round(clamp((c.price[k] || v) * (e.demand[s.id] > 2 ? 1.03 : 0.99), v * 0.6, v * 2));
      }
    }
    this.dirty = true;
  }

  produce(c) {
    const job = c.job;
    // les prestataires de services rachètent leurs fournitures (savon, bandages, plats, électricité…)
    for (const svc of SERVICES_BY_JOB[job] || []) {
      for (const [id, q] of Object.entries(svc.supplies)) if ((c.stock[id] || 0) < Math.ceil(q * 4 * (c.scale || 1))) this.ensure(c, id, Math.ceil(q * 8 * (c.scale || 1)));
      if (svc.tool) this.ensure(c, svc.tool, 1);
    }
    if (GATHER_JOBS[job]) {
      // on va récolter là où ça manque le plus
      const opts = GATHER_JOBS[job].map(([site, gid]) => {
        const g = SITE[site].gather.find((x) => x.id === gid);
        const need = g.loot.reduce((a, [id, w]) => a + w * (1 + (this.e.prevShort?.[id] || 0)), 0);
        return [[site, gid], need * (0.6 + rnd() * 0.8)];
      }).sort((x, y) => y[1] - x[1]);
      const [site, gid] = opts[0][0];
      const g = SITE[site].gather.find((x) => x.id === gid);
      if (g.tool && !this.ensure(c, g.tool, 1)) return;
      if (g.fuel) for (const [id, q] of Object.entries(g.fuel)) if (!this.ensure(c, id, q)) return; else c.stock[id] -= q;
      const total = g.loot.reduce((a, l) => a + l[1], 0);
      const short = OUTPUTS[c.job].some((o) => (this.e.prevShort?.[o] || 0) > 2);
      const pm = this.prodMult(job);
      for (let i = 0; i < g.rolls * (short ? 3 : 2) * (c.scale || 1); i++) {
        let r = rnd() * total;
        for (const [id, w, a, b] of g.loot) { r -= w; if (r <= 0) { c.stock[id] = (c.stock[id] || 0) + Math.round((a + Math.floor(rnd() * (b - a + 1))) * pm); break; } }
      }
      if (g.tool) this.wearTool(c, g.tool);
      return;
    }
    const recs = (RECIPES_BY_JOB[job] || []);
    if (!recs.length) return;
    // on travaille plus quand ce qu'on fabrique manque
    const short = OUTPUTS[c.job].some((o) => (this.e.prevShort?.[o] || 0) > 0 || this.supplyFast(o) < 3);
    let batches = (short ? 4 : 2) * (c.scale || 1);
    // on produit ce qui manque le plus sur le marché
    const ranked = [...recs].sort((a, b) => this.scarcity(b) - this.scarcity(a));
    let progress = true;
    while (batches > 0 && progress) {
     progress = false;
     for (const r of ranked) {
      if (batches <= 0) break;
      if (Object.keys(r.out).every((o) => (c.stock[o] || 0) > this.cap(o) * (c.scale || 1))) continue;
      if (r.tool && !this.ensure(c, r.tool, 1)) continue;
      let okk = true;
      for (const [id, q] of Object.entries(r.in)) if (!this.ensure(c, id, q)) { okk = false; break; }
      if (!okk) continue;
      for (const [id, q] of Object.entries(r.in)) { c.stock[id] -= q; if (c.stock[id] <= 0) delete c.stock[id]; }
      const pm = this.prodMult(job);
      for (const [id, q] of Object.entries(r.out)) { const n = q * pm; c.stock[id] = (c.stock[id] || 0) + Math.floor(n) + (rnd() < n % 1 ? 1 : 0); }
      if (r.tool) this.wearTool(c, r.tool);
      if (r.machine) { c.wear++; if (c.wear > 40) this.maintain(c, r.machine); }
      batches--; progress = true;
      if (Object.values(r.out).reduce((a, b) => a + b, 0) < 3) batches--;   // objets complexes : moins par jour
     }
    }
  }
  cap(id) { const v = VALUE[id] || 5; if (ALL[id]?.cat === 'doc') return 5; return v > 1000 ? 2 : v > 200 ? 4 : v > 40 ? 10 : v > 8 ? 40 : 150; }
  scarcity(r) {
    return Object.keys(r.out).reduce((a, o) => a + (this.e.prevShort?.[o] || 0) * 5 + 10 / (1 + this.supplyFast(o)) + (ALL[o]?.cat === 'doc' ? -3 : 0), 0);
  }
  supplyFast(id) { return (this.index?.[id] || []).reduce((a, o) => a + o.qty(), 0); }
  ensure(c, id, q) {
    const have = c.stock[id] || 0;
    if (have >= q) return true;
    if (c.money < 20) return false;
    this.buy(c, id, q - have, { maxPrice: (VALUE[id] || 5) * 3 });
    return (c.stock[id] || 0) >= q;
  }
  wearTool(c, tool) {
    c.acc[`w:${tool}`] = (c.acc[`w:${tool}`] || 0) + 1;
    if (c.acc[`w:${tool}`] >= (ALL[tool]?.dur || 30)) { c.acc[`w:${tool}`] = 0; c.stock[tool] -= 1; if (c.stock[tool] <= 0) delete c.stock[tool]; }
  }
  maintain(c, machine) {
    // une machine usée : on paie un technicien de maintenance, sinon on rachète une machine
    const p = this.providers('maintenance_machine')[0];
    if (p && c.money > p.price) { c.money -= p.price; this.payService(p.c, SERVICES.maintenance_machine, p.price, c); c.wear = 0; return; }
    const r = this.buy(c, machine, 1);
    if (r.n) { c.stock[machine] -= 1; c.wear = 0; }
  }
  consume(c) {
    for (let k = 0; k < (c.scale || 1); k++) this.consumeOnce(c);
  }
  consumeOnce(c) {
    const hol = holidayOf(this.s.time || 0);
    for (const need of NPC_NEEDS) {
      const pp = need.p * (hol?.gifts && need.any.includes('bouquet') ? 4 : 1);
      if (rnd() > pp || (need.rich && c.money < need.rich)) continue;
      const options = need.any.map((id) => [id, this.bestPrice(id)]).filter(([, p]) => p !== null && p < c.money * 0.5);
      if (!options.length) { this.e.shortages[need.any[0]] = (this.e.shortages[need.any[0]] || 0) + 1; continue; }
      options.sort((a, b) => a[1] / (VALUE[a[0]] || 1) - b[1] / (VALUE[b[0]] || 1));
      const id = rnd() < 0.7 ? options[0][0] : pick(options)[0];
      const r = this.buy(c, id, need.q);
      if (r.n && c.stock[id]) { c.stock[id] -= r.n; if (c.stock[id] <= 0) delete c.stock[id]; }   // consommé
    }
    const richBoost = c.money > 1500 ? 2.5 : c.money > 800 ? 1.4 : 1;
    for (const svc of Object.values(SERVICES)) {
      const evm = (this.event()?.svc?.[svc.id] || 1) * (hol?.festival && ['concert', 'cinema', 'theatre', 'cocktail'].includes(svc.id) ? 2 : 1);
      if (!svc.npc || rnd() > svc.npc * evm * (svc.special ? 1 : richBoost)) continue;
      const ps = this.providers(svc.id).filter((p) => p.c !== c);
      if (!ps.length) { this.e.shortages[`svc:${svc.id}`] = (this.e.shortages[`svc:${svc.id}`] || 0) + 1; this.e.demand[svc.id] = (this.e.demand[svc.id] || 0) + 1; continue; }
      const p = rnd() < 0.6 ? ps[0] : pick(ps);
      if (c.money < p.price * 2) continue;
      c.money -= p.price;
      this.payService(p.c, svc, p.price, c);
    }
  }

  // Combien de clients habitants viendraient chez le joueur pendant un service de 4 h
  clientsFor(svcId, myPrice) {
    const svc = SERVICES[svcId];
    const ps = this.providers(svcId);
    const daily = svc.npc * this.e.citizens.reduce((a, c) => a + (c.scale || 1), 0);
    const avg = ps.length ? ps.reduce((a, p) => a + p.price, 0) / ps.length : serviceValue(svc);
    const priceFactor = clamp(avg / Math.max(1, myPrice), 0.2, 2.5);
    const share = (1 / (ps.length + 1)) * priceFactor;
    const evm = this.event()?.svc?.[svcId] || 1;
    const expected = daily * evm * share * 0.6 + (this.e.shortages[`svc:${svcId}`] ? 1.5 : 0);
    return Math.min(8, Math.max(0, Math.round(expected + (rnd() - 0.4) * 1.5)));
  }
  // Prix auquel un grossiste rachète tout de suite (moins que sur le marché)
  quickPrice(good) { return Math.max(1, Math.round((this.e.lastTx[good] || VALUE[good] || 5) * 0.6 * 10) / 10); }
  // Les métiers qui manquent de bras (pénuries les plus fortes)
  shortageList(limit = 12) {
    const arr = Object.entries(this.e.shortages).sort((a, b) => b[1] - a[1]).slice(0, limit);
    return arr.map(([k, n]) => {
      if (k.startsWith('svc:')) { const s = SERVICES[k.slice(4)]; return { kind: 'service', id: s.id, nom: s.nom, n, jobs: s.jobs }; }
      return { kind: 'good', id: k, nom: ALL[k]?.nom || k, n, jobs: [...(PRODUCERS[k] || [])] };
    });
  }
}
