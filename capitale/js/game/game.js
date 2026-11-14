// Moteur de la simulation : temps, besoins, climat, santé, et toute la vie économique.
// Tout passe par les gens : on achète aux producteurs (market.js), on paie des prestataires pour les services,
// et le joueur peut lui-même produire, vendre, rendre des services, embaucher et faire construire.
import { ITEMS } from '../data/items.js';
import { JOBS, SECTOR_BY_ID, ODD_JOB, levelOf, PERMITS } from '../data/jobs.js';
import { PLACES, SITES, VEHICLES, HOUSING, GUILDS, STOCKS, NAMES, JOB_HOUSES } from '../data/places.js';
import { RECIPES, SERVICES, BUILDINGS, BUILD_STEPS, COMPANY_DOCS, LIFE_REQUIREMENTS, GATHER_JOBS } from '../data/economy.js';
import { def, has, addItem, removeItem, wear, log, clamp, fmt, hourOf, day, duration, save } from './state.js';
import { Market, createEconomy, VALUE, serviceValue, RECIPES_BY_JOB, SERVICES_BY_JOB, PRODUCERS } from './market.js';
const PRODUCERS_OF = (id) => PRODUCERS[id] || new Set();
import { installLife, seasonOf, weekday } from './life.js';
import { PETS } from '../data/life.js';

export const PLACE_BY_ID = Object.fromEntries([...PLACES, ...SITES, ...JOB_HOUSES].map((p) => [p.id, p]));
const rnd = Math.random;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
const ok = (msg) => ({ ok: true, msg });
const fail = (msg) => ({ ok: false, msg });
const STAT_KEYS = ['faim', 'soif', 'hygiene', 'energie', 'sante', 'moral'];
const STAT_NAMES = { faim: 'faim', soif: 'soif', hygiene: 'hygiène', energie: 'sommeil', sante: 'santé', moral: 'moral' };
export const COND_NAMES = { blessure: 'Blessure', maladie: 'Maladie', radiation: 'Irradiation', carie: 'Carie', deprime: 'Déprime' };
export const WEATHER = {
  soleil: { nom: 'Ensoleillé', emoji: '☀️' }, nuageux: { nom: 'Nuageux', emoji: '⛅' }, pluie: { nom: 'Pluie', emoji: '🌧️' },
  orage: { nom: 'Orage', emoji: '⛈️' }, canicule: { nom: 'Canicule', emoji: '🥵' }, vague_froid: { nom: 'Vague de froid', emoji: '🥶' },
};
export const CLIMATES = { tempere: { nom: 'Tempéré', emoji: '🌤️' }, froid: { nom: 'Froid (altitude)', emoji: '❄️' }, chaud: { nom: 'Chaud (sud)', emoji: '🏜️' } };
const PROTECT_NAMES = { froid: 'le froid', chaud: 'la chaleur', pluie: 'la pluie' };
const INSURANCE_COVER = 0.6;

export class Game {
  constructor(state, world) {
    this.s = state;
    this.world = world;
    if (!state.eco) { state.eco = createEconomy(); this.m = new Market(state, this.marketHooks()); for (let i = 0; i < 14; i++) this.m.day(); }
    else this.m = new Market(state, this.marketHooks());
    this.listeners = [];
    this.saleLog = {};
  }
  marketHooks() {
    return {
      onPlayerSale: (good, n, money, buyer, b) => {
        const k = good;
        this.saleLog[k] = this.saleLog[k] || { n: 0, money: 0 };
        this.saleLog[k].n += n; this.saleLog[k].money += money;
        this.s.stats_total.gagne += money;
        if (b) this.s.weekCompany = (this.s.weekCompany || 0) + money; else this.s.weekIncome = (this.s.weekIncome || 0) + money;
      },
    };
  }
  flushSales() {
    const parts = Object.entries(this.saleLog).map(([id, v]) => `${def(id).emoji} ${def(id).nom} ×${v.n} (+${fmt(v.money)})`);
    if (parts.length) log(this.s, `💰 Vendu sur le marché : ${parts.join(', ')}.`, 'good');
    this.saleLog = {};
  }
  onChange(f) { this.listeners.push(f); }
  changed() { this.m.dirty = true; save(this.s); for (const f of this.listeners) f(); }

  // ------------------------------------------------------------------ utilitaires
  place(id) { return PLACE_BY_ID[id]; }
  radius(id) { return this.place(id)?.kind ? 90 : this.place(id)?.jobHouse ? 14 : 16; }
  at(id) { return this.world.distanceTo(id) <= this.radius(id); }
  hereId() {
    let best = null, bd = Infinity;
    for (const p of [...PLACES, ...SITES, ...JOB_HOUSES]) { const d = this.world.distanceTo(p.id); if (d < bd) { bd = d; best = p; } }
    return best && bd <= this.radius(best.id) ? best.id : null;
  }
  atSite() { const h = this.hereId(); return h && this.place(h).kind ? h : null; }
  atJobHouse() { const h = this.hereId(); return h && this.place(h).jobHouse ? this.place(h).jobHouse : null; }
  atPlaceFor(svc) {
    if (svc.place === '*any') return true;
    const jh = this.atJobHouse();
    if (jh && svc.jobs.includes(jh)) return true;          // on peut aussi aller chez le prestataire
    if (svc.place === '*site') return !!this.atSite();
    return this.at(svc.place);
  }
  jobLevel(id = this.s.job) { return levelOf(this.s.jobXp[id] || 0); }
  guild(id) { return this.s.guild === id; }
  coverage() { return this.s.insuranceUntil > this.s.time ? INSURANCE_COVER : 0; }
  climateHere() { return this.world.climateAt(this.s.pos.x, this.s.pos.z); }
  homeComfort() {
    const h = this.s.housing && HOUSING[this.s.housing.type];
    if (!h) return 0;
    return h.comfort + (this.s.flags.renov || 0) + this.s.home.reduce((a, id) => a + (def(id)?.comfort || 0), 0);
  }
  homeHasBed() { const h = this.s.housing && HOUSING[this.s.housing.type]; return !!h && (h.bed || this.s.home.some((id) => def(id)?.bed)); }
  homeHas(flag) { return this.s.home.some((id) => def(id)?.[flag]); }
  atHome() { return !!this.s.housing && this.at('residences'); }
  value(id) { return VALUE[id] || def(id)?.prix || 5; }

  pay(amount) {
    amount = Math.round(amount * 10) / 10;
    if (amount <= 0) return true;
    if (this.s.money < amount) return false;
    this.s.money -= amount;
    this.s.stats_total.depense += amount;
    return true;
  }
  forcePay(amount, why) {
    this.s.money -= amount;
    this.s.stats_total.depense += amount;
    if (this.s.money < 0) log(this.s, `Vous êtes à découvert (${fmt(this.s.money)}) après : ${why}.`, 'bad');
  }
  earn(amount, taxable = true) { this.s.money += amount; this.s.stats_total.gagne += amount; if (taxable) this.s.weekIncome = (this.s.weekIncome || 0) + amount; }
  applyEff(eff, mult = 1) {
    if (!eff) return;
    for (const k of STAT_KEYS) if (eff[k]) this.s.stats[k] = clamp(this.s.stats[k] + eff[k] * mult, 0, 100);
  }
  effText(eff) {
    if (!eff) return '';
    return STAT_KEYS.filter((k) => eff[k]).map((k) => `${eff[k] > 0 ? '+' : ''}${Math.round(eff[k])} ${STAT_NAMES[k]}`).join(', ');
  }
  addCondition(type) {
    if (this.s.conditions.includes(type)) return;
    if (type === 'maladie' && this.s.flags.vaccinUntil > this.s.time) return;
    this.s.conditions.push(type);
    const tip = { blessure: 'infirmier, kiné ou secouriste', maladie: 'médecin (ordonnance) puis pharmacie', radiation: 'médecin puis pharmacie (traitement anti-radiation)', carie: 'dentiste', deprime: 'psychologue' }[type];
    log(this.s, `⚠️ ${COND_NAMES[type]} ! Soignez-vous : ${tip}.`, 'bad');
  }
  cure(type) { this.s.conditions = type === 'tout' ? [] : this.s.conditions.filter((c) => c !== type); }
  carried() {
    let n = 0;
    for (const [id, q] of Object.entries(this.s.inv)) { const d = def(id); n += q * (d?.cat === 'doc' || d?.cat === 'papier' ? 0 : d?.cat === 'machine' ? 15 : 1); }
    return n;
  }
  capacity() {
    let c = 80;
    if (this.s.vehicles.cheval) c += 40;
    if (this.s.vehicles.voiture) c += 150;
    if (this.s.vehicles.drone) c += 40;
    return c;
  }
  overloaded() { return this.carried() > this.capacity(); }

  // ------------------------------------------------------------------ climat
  climateNeeds(indoor = false) {
    const w = this.s.weather.type, c = this.climateHere();
    const needs = new Set();
    const h = hourOf(this.s.time);
    if (c === 'froid' || w === 'vague_froid') needs.add('froid');
    if ((c === 'chaud' && (w === 'soleil' || w === 'canicule') && h > 9 && h < 19) || (w === 'canicule' && c !== 'froid' && h > 10 && h < 19)) needs.add('chaud');
    if (w === 'pluie' || w === 'orage') needs.add('pluie');
    if (has(this.s, 'armure_celeste')) needs.clear();
    if (indoor) {
      needs.delete('pluie');
      if (this.atHome()) {
        if (this.s.home.some((id) => def(id)?.climate === 'froid')) needs.delete('froid');
        if (this.s.home.some((id) => def(id)?.climate === 'chaud')) needs.delete('chaud');
      } else { needs.delete('froid'); needs.delete('chaud'); }
    }
    return [...needs];
  }
  clothingFor(need) { return Object.keys(this.s.inv).find((id) => ITEMS[id]?.protect === need); }

  // ------------------------------------------------------------------ le temps qui passe
  advance(minutes, opt = {}) {
    const s = this.s;
    let left = minutes;
    while (left > 0) {
      const step = Math.min(left, 30);
      left -= step;
      const h = step / 60;
      const forme = s.buffs.forme > s.time ? 0.7 : 1;
      const comfortMoral = this.atHome() ? Math.min(this.homeComfort() / 80, 0.8) : 0;
      s.stats.faim -= (opt.sleep ? 2 : 4) * h;
      s.stats.soif -= (opt.sleep ? 3 : 6) * h;
      s.stats.hygiene -= (opt.sleep ? 1 : 2.5) * h;
      s.stats.moral -= (1.2 - comfortMoral) * h;
      if (opt.sleep) s.stats.energie += 11 * (opt.quality || 1) * h; else s.stats.energie -= 4 * forme * h;
      for (const need of this.climateNeeds(opt.indoor)) {
        const cloth = this.clothingFor(need);
        if (cloth) wear(s, cloth, h);
        else {
          const k = need === 'pluie' ? 0.45 : 1;
          s.stats.sante -= 2 * k * h; s.stats.moral -= 2 * k * h; s.stats.energie -= 1 * k * h;
          if (need !== 'chaud' && rnd() < 0.024 * h * k * (this.event()?.ill || 1)) this.addCondition('maladie');
          if (!this._climateWarned || s.time - this._climateWarned > 240) {
            this._climateWarned = s.time;
            log(s, `🥶 Rien pour vous protéger contre ${PROTECT_NAMES[need]} : santé et moral baissent (vêtements chez les couturiers).`, 'warn');
          }
        }
      }
      if (s.stats.faim <= 0) s.stats.sante -= 5 * h;
      if (s.stats.soif <= 0) s.stats.sante -= 7 * h;
      if (s.stats.energie <= 0) { s.stats.sante -= 3 * h; s.stats.moral -= 2 * h; }
      if (this.event()?.ill && rnd() < 0.006 * h * this.event().ill) this.addCondition('maladie');
      if (s.stats.hygiene < 20) { s.stats.moral -= 1 * h; if (rnd() < 0.02 * h) this.addCondition('maladie'); if (rnd() < 0.01 * h) this.addCondition('carie'); }
      if (s.stats.moral < 12 && rnd() < 0.03 * h) this.addCondition('deprime');
      for (const c of s.conditions) {
        if (c === 'blessure') { s.stats.sante -= 1.5 * h; s.stats.energie -= 0.5 * h; }
        if (c === 'maladie') { s.stats.sante -= 1 * h; s.stats.moral -= 1 * h; }
        if (c === 'radiation') s.stats.sante -= 2.5 * h;
        if (c === 'carie') s.stats.moral -= 0.6 * h;
        if (c === 'deprime') { s.stats.moral -= 1 * h; s.stats.energie -= 0.5 * h; }
      }
      for (const k of STAT_KEYS) s.stats[k] = clamp(s.stats[k], 0, 100);
      const before = s.time;
      s.time += step;
      if (s.time >= s.weather.until) this.rollWeather();
      if (Math.floor(s.time / 60) !== Math.floor(before / 60)) this.stockTick(0.25);
      for (const [id, v] of Object.entries(s.vehicles)) {
        if (v.rentedUntil && s.time >= v.rentedUntil) {
          delete s.vehicles[id];
          if (s.transport === id) s.transport = 'marche';
          log(s, `${VEHICLES[id].emoji} Fin de la location : ${VEHICLES[id].nom.toLowerCase()}.`, 'warn');
        }
      }
      if (day(s.time) !== day(before)) this.dailyTick();
      if (weekday(s.time) === 6 && hourOf(before) < 20 && hourOf(s.time) >= 20 && day(s.time) === day(before)) { this.lotoDraw(); this.electionResult(); }
      if (s.stats.sante <= 0 && !opt.noFaint) { this.faint(); break; }
    }
    this.lowStatWarnings();
    this.flushSales();
  }
  lowStatWarnings() {
    const s = this.s;
    s._warned = s._warned || {};
    for (const k of ['faim', 'soif', 'energie', 'hygiene']) {
      if (s.stats[k] < 20 && !s._warned[k]) {
        s._warned[k] = true;
        const tip = { faim: 'mangez (marché, restaurant)', soif: 'buvez (marché)', energie: 'dormez (hôtel ou chez vous)', hygiene: 'lavez-vous (bains publics)' }[k];
        const lab = { faim: 'Faim', soif: 'Soif', energie: 'Énergie', hygiene: 'Hygiène' }[k];
        log(s, `⚠️ ${lab} très basse : ${tip}.`, 'warn');
      }
      if (s.stats[k] > 35) s._warned[k] = false;
    }
  }
  rollWeather() {
    const s = this.s, r = rnd();
    let type = 'soleil';
    const se = seasonOf(s.time);
    if (r < se.froid) type = 'vague_froid'; else if (r < se.froid + se.chaud) type = 'canicule';
    else { const q = rnd(); type = q < 0.45 ? 'soleil' : q < 0.7 ? 'nuageux' : q < 0.92 ? 'pluie' : 'orage'; }
    if (this.event()?.weather) type = this.event().weather;
    if (type !== s.weather.type && (type === 'canicule' || type === 'vague_froid' || type === 'orage')) log(s, `${WEATHER[type].emoji} Météo : ${WEATHER[type].nom.toLowerCase()} !`, 'warn');
    s.weather = { type, until: s.time + 180 };
  }
  faint() {
    const s = this.s;
    const bill = 400 * (1 - this.coverage());
    log(s, `💫 Vous vous êtes évanoui ! Les aides-soignants vous ont pris en charge : facture ${fmt(bill)}${this.coverage() ? ' (après assurance)' : ''}.`, 'bad');
    this.forcePay(bill, 'hospitalisation d’urgence');
    s.conditions = [];
    s.stats.sante = 45; s.stats.energie = Math.max(s.stats.energie, 50); s.stats.faim = Math.max(s.stats.faim, 40);
    s.stats.soif = Math.max(s.stats.soif, 45); s.stats.moral = clamp(s.stats.moral - 15, 0, 100);
    s.time += 360;
    this.world.teleport('hopital');
  }

  // ------------------------------------------------------------------ chaque nuit
  // vos prix automatiques suivent la concurrence (un peu moins cher, jamais sous le plancher)
  autoPrices() {
    for (const [id, l] of Object.entries(this.s.listings)) {
      if (!l.auto) continue;
      const best = this.m.offers(id).find((o) => !o.player);
      const target = best ? best.price() * 0.97 : this.value(id) * 1.3;
      l.price = Math.max(l.floor || 0.5, Math.round(target * 10) / 10);
    }
  }
  dailyTick() {
    const s = this.s;
    const lines = [];
    this.autoPrices();
    this.m.dirty = true;
    for (const o of Object.values(s.orders || {})) for (const [id, q] of Object.entries(o)) s.eco.shortages[id] = (s.eco.shortages[id] || 0) + q * 3;
    this.m.day();
    this.autoPrices();
    this.deliverOrders();
    if (s.housing?.type === 'location') { this.forcePay(HOUSING.location.loyer, 'loyer'); lines.push(`loyer −${HOUSING.location.loyer} ₵`); }
    this.lifeDaily();
    if (weekday(s.time) === 0) this.weeklyTick();
    this.electionState();
    if (s.guild) { const g = GUILDS.find((x) => x.id === s.guild); this.forcePay(g.cotisation, 'cotisation de guilde'); lines.push(`guilde −${g.cotisation} ₵`); }
    if (s.privateCity) s.stats.moral = clamp(s.stats.moral + 2, 0, 100);
    if (s.storageUntil && s.storageUntil < s.time && Object.keys(s.warehouse).length) log(s, '📦 Votre location d’entrepôt est terminée : il faut la renouveler pour y ajouter des marchandises.', 'warn');
    // prêt
    if (s.loan) {
      const due = Math.min(s.loan.left, s.loan.daily);
      this.forcePay(due, 'remboursement du prêt'); s.loan.left -= due; lines.push(`prêt −${Math.round(due)} ₵`);
      if (s.loan.left <= 0.5) { s.loan = null; log(s, '🏦 Prêt entièrement remboursé.', 'good'); }
    }
    if (s.wealthUntil > s.time && s.money > 0) { const g = Math.round(s.money * 0.004); this.earn(g); lines.push(`patrimoine +${g} ₵`); }
    // famille
    lines.push(...this.familyDay());
    // vos bâtiments et vos employés
    for (const b of s.buildings) if (b.stage === 'actif') lines.push(this.buildingDay(b));
    // vols
    this.theftCheck();
    // placements
    for (const d of [...s.deposits]) {
      if (s.time >= d.until) {
        const gain = Math.round(d.amount * (1 + d.rate));
        this.earn(gain); s.deposits.splice(s.deposits.indexOf(d), 1);
        log(s, `🏦 Placement arrivé à échéance : +${fmt(gain)}.`, 'good');
      }
    }
    this.stockTick(1);
    const lst = lines.filter(Boolean);
    if (lst.length) log(s, `🌅 Jour ${day(s.time)} : ${lst.join(' · ')}.`, 'info');
  }
  familyDay() {
    const s = this.s, f = s.family, out = [];
    if (f.partner) { if (f.married) s.stats.moral = clamp(s.stats.moral + 3, 0, 100); else f.partner.love = clamp(f.partner.love - 2, 0, 100); }
    if (!f.children.length) return out;
    let cost = 0;
    for (const ch of f.children) {
      // nourrir l'enfant : acheté aux producteurs
      const food = ['pain', 'fruits_legumes', 'lait', 'fromage'].find((id) => has(s, id));
      if (food) removeItem(s, food); else { const r = this.m.buy('player', pick(['pain', 'fruits_legumes', 'lait']), 1); if (r.n) { cost += r.spent; const id = Object.keys(s.inv).find((k) => ['pain', 'fruits_legumes', 'lait'].includes(k)); if (id) removeItem(s, id); } else ch.happy = clamp((ch.happy ?? 70) - 10, 0, 100); }
      // école (professeur) et garde (nounou, animateur)
      for (const sid of ['ecole', 'garde_enfant']) {
        const p = this.m.providers(sid)[0];
        if (p && s.money > p.price) { s.money -= p.price; cost += p.price; this.m.payService(p.c, SERVICES[sid], p.price, 'player'); ch.growth = clamp((ch.growth || 0) + (sid === 'ecole' ? 2 : 1), 0, 100); }
        else ch.happy = clamp((ch.happy ?? 70) - 5, 0, 100);
      }
      s.stats.moral = clamp(s.stats.moral + ((ch.happy ?? 70) > 40 ? 3 : -2), 0, 100);
    }
    if (cost) out.push(`enfants −${Math.round(cost)} ₵ (nourriture, école, garde)`);
    return out;
  }

  // ------------------------------------------------------------------ acheter aux producteurs
  canBuyHere(id) {
    if (this.at('comptoir')) return true;
    const jh = this.atJobHouse();
    if (jh && (PRODUCERS_OF(id).has(jh))) return true;
    const here = this.hereId();
    const p = here && this.place(here);
    return !!(p && p.shop && p.shop.includes(id));
  }
  buyGood(id, n = 1, opts = {}) {
    if (!opts.anywhere && !this.canBuyHere(id)) return fail('Ce produit ne se vend pas ici (essayez le Comptoir des ressources).');
    if (!opts.anywhere) { const cl = this.closedMsg(this.hereId()); if (cl) return fail(cl); }
    const discount = opts.useBon && has(this.s, 'bon_achat') ? 0.15 : 0;
    const r = this.m.buy('player', id, n, { discount, seller: opts.seller });
    if (!r.n) return fail(this.m.offers(id).length ? 'Pas assez d’argent.' : `Rupture : personne ne vend de ${def(id).nom.toLowerCase()} en ce moment.`);
    if (discount) removeItem(this.s, 'bon_achat');
    this.s.stats_total.depense += r.spent;
    this.m.dirty = true;
    log(this.s, `Achat : ${def(id).emoji} ${def(id).nom} ×${r.n} (−${fmt(r.spent)})${r.n < n ? ' — stock épuisé chez les vendeurs' : ''}.`);
    return ok();
  }
  use(id) {
    const s = this.s, d = def(id);
    if (!d || !has(s, id)) return fail('Objet absent.');
    if (d.vehicle) return this.registerVehicle(id);
    if (d.pet) return this.adoptPet(id);
    if (id === 'manuel' || id === 'encyclopedie') {
      if (!s.job) return fail('Il faut un métier pour progresser avec un livre.');
      const xp = id === 'manuel' ? 3 : 8;
      removeItem(s, id); this.advance(id === 'manuel' ? 120 : 240);
      return this.gainXp(xp, `📘 Lecture terminée : +${xp} d'expérience en ${JOBS[s.job].nom}.`);
    }
    if (['carte_prospection', 'alerte_meteores', 'etude_marine'].includes(id)) {
      removeItem(s, id); s.docsBuff[id] = (s.docsBuff[id] || 0) + 5;
      log(s, `${d.emoji} ${d.nom} : vos 5 prochaines récoltes au bon endroit seront bien meilleures.`, 'good'); return ok();
    }
    if (id === 'optimisation') { removeItem(s, id); for (const b of s.buildings) b.optimUntil = s.time + 7 * 1440; log(s, '📈 Plan d’optimisation appliqué : +30 % de production dans vos bâtiments pendant 7 jours.', 'good'); return ok(); }
    if (d.vaccine) { removeItem(s, id); s.flags.vaccinUntil = s.time + 30 * 1440; log(s, '💉 Vacciné pour 30 jours : plus de maladie.', 'good'); return ok(); }
    if (d.needs && !has(s, d.needs)) return fail(`Il faut une ${def(d.needs).nom.toLowerCase()} (consultation chez un médecin).`);
    if (!d.use && !d.cure) return fail('Cet objet ne s’utilise pas directement.');
    removeItem(s, id);
    if (d.needs) removeItem(s, d.needs);
    this.applyEff(d.use);
    let extra = '';
    if (d.cure && (d.cure === 'tout' || s.conditions.includes(d.cure))) {
      if (rnd() < d.cureChance) { this.cure(d.cure); extra = ' Vous êtes soigné.'; } else extra = ' Le soin n’a pas suffi.';
    }
    this.advance(10);
    log(s, `${d.emoji} ${d.nom} utilisé(e). ${this.effText(d.use)}${extra}`);
    return ok();
  }

  // ------------------------------------------------------------------ services rendus par des gens
  servicesAt(placeId) { return Object.values(SERVICES).filter((sv) => !sv.hidden && (sv.place === placeId || (sv.place === '*site' && this.place(placeId)?.kind))); }
  providerPrice(svcId, p) {
    const svc = SERVICES[svcId];
    let price = p.price;
    const pol = this.policy();
    if (svc.health) { price *= (1 - 0.3 - this.coverage()) * (pol.sante || 1); if (this.guild('soigneurs')) price *= 0.8; }
    if (['school', 'childcare', 'child_growth'].includes(svc.special)) price *= pol.ecole || 1;
    price *= this.friendDiscount(p.c.id);
    if (svc.free && this.s.money < 80) price = 0;
    return Math.round(price * 10) / 10;
  }
  buyService(svcId, citizenId, arg) {
    const s = this.s, svc = SERVICES[svcId];
    if (!this.atPlaceFor(svc)) return fail('Il faut être sur place.');
    if (!svc.place.startsWith('*') && !this.atJobHouse()) { const cl = this.closedMsg(svc.place); if (cl) return fail(cl); }
    if (this.event()?.block?.includes(svc.special)) return fail(`${this.event().nom} : service interrompu.`);
    if (['flight', 'tour', 'loan'].includes(svc.special) && !has(s, 'carte_identite')) return fail('Il faut une carte d’identité (préfecture).');
    const prov = this.m.providers(svcId).find((p) => p.c.id === citizenId) || this.m.providers(svcId)[0];
    if (!prov) return fail(`Personne n’exerce ce service en ce moment (${svc.jobs.map((j) => JOBS[j].nom).join(', ')}). Une place à prendre !`);
    const n = svc.needs || {};
    if (n.item && !has(s, n.item)) return fail(`Il faut : ${def(n.item).emoji} ${def(n.item).nom}.`);
    const pre = this.serviceCheck(svc, arg);
    if (pre) return fail(pre);
    let price = this.providerPrice(svcId, prov);
    if (svc.special === 'flight') { const ctl = this.m.providers('controle_vol')[0]; if (!ctl) return fail('Aucun contrôleur aérien en service : pas de vol possible.'); price += ctl.price; this.m.payService(ctl.c, SERVICES.controle_vol, ctl.price, 'player'); }
    if (svc.special === 'judge') { const jail = this.m.providers('detention')[0]; if (jail) price += jail.price; }
    if (!this.pay(price)) return fail(`Pas assez d'argent (${fmt(price)}).`);
    this.m.payService(prov.c, svc, prov.price, 'player');
    s.stats_total.services++;
    this.befriend(prov.c.id, 3);
    const who = `${prov.c.nom} (${JOBS[prov.c.job].nom.toLowerCase()})`;
    return this.applyService(svc, who, price, arg);
  }
  serviceCheck(svc, arg) {
    const s = this.s;
    switch (svc.special) {
      case 'cure_blessure': return s.conditions.includes('blessure') ? null : 'Vous n’êtes pas blessé.';
      case 'cure_carie': return null;
      case 'build': { const b = s.buildings.find((x) => x.id === arg); if (!b) return 'Choisissez le chantier depuis l’onglet Entreprise.'; return this.stepReady(b, svc.step); }
      case 'install_machine': { const b = s.buildings.find((x) => x.id === arg?.b); if (!b || b.stage !== 'actif') return 'Il faut un bâtiment terminé.'; if (!has(s, arg.m)) return 'Machine absente de votre sac.'; if (b.machines.length >= BUILDINGS[b.type].slots) return 'Plus de place pour une machine.'; return null; }
      case 'repair_vehicle': return Object.keys(s.vehicles).some((v) => v !== 'cheval' && !s.vehicles[v].rentedUntil) ? null : 'Pas de véhicule à entretenir.';
      case 'repair_horse': return s.vehicles.cheval ? null : 'Pas de cheval.';
      case 'repair_machines': return s.buildings.some((b) => b.stage === 'actif' && (b.wear || 0) > 0) ? null : 'Aucune machine usée.';
      case 'repair_tools': return Object.keys(s.inv).some((x) => def(x)?.dur && s.dur[x] !== undefined && s.dur[x] < def(x).dur) ? null : 'Aucun outil abîmé.';
      case 'investigate': return s.theft?.stage === 'plainte' ? null : 'Aucun vol à signaler.';
      case 'prosecute': return s.theft?.stage === 'identifie' ? null : 'Il faut d’abord un suspect identifié par la police.';
      case 'judge': return s.theft?.stage === 'poursuites' ? null : 'Il faut d’abord des poursuites du procureur.';
      case 'lawyer': return s.theft && ['identifie', 'poursuites'].includes(s.theft.stage) ? null : 'Pas de procès en cours.';
      case 'mediate': case 'recover': return s.theft?.stage === 'identifie' ? null : 'Il faut un responsable identifié.';
      case 'freight': return Object.keys(s.inv).some((id) => def(id)?.kind === 'resource' || def(id)?.cat === 'agro' || def(id)?.cat === 'materiau') ? (s.storageUntil > s.time ? null : 'Il faut d’abord louer un entrepôt (Comptoir des ressources).') : 'Rien à transporter.';
      case 'loan': return s.loan ? 'Vous avez déjà un prêt en cours.' : null;
      case 'export': return null;
      case 'ad': return s.buildings.some((b) => b.stage === 'actif') ? null : 'Il vous faut un bâtiment actif (atelier, usine, boutique).';
      case 'child_growth': return s.family.children.length ? null : 'Pas d’enfant.';
      case 'school': case 'childcare': return s.family.children.length ? null : 'Pas d’enfant.';
      case 'wedding_plan': return s.family.partner ? null : 'Personne à épouser pour l’instant.';
      case 'training': return arg && JOBS[arg] ? (s.diplomas.includes(arg) ? 'Déjà diplômé.' : null) : 'Choisissez une formation.';
      case 'clean_home': case 'renovate': return s.housing ? null : 'Il faut un logement.';
      case 'tour': case 'teleport': case 'train': case 'flight': case 'taxi': return arg ? null : 'Choisissez une destination.';
      case 'minigame': return null;
      case 'vet': return (s.pets || []).length ? null : 'Vous n’avez pas d’animal.';
      case 'parcel': return s.family.partner ? (arg && def(arg)?.gift && has(s, arg) ? null : 'Choisissez un cadeau de votre sac.') : 'Personne à qui envoyer un colis.';
      case 'driving': return s.permits.includes('permis_conduire') ? 'Vous avez déjà le permis.' : null;
      case 'clean_building': return s.buildings.some((b) => b.stage === 'actif') ? null : 'Il vous faut un bâtiment actif.';
      default: return null;
    }
  }
  applyService(svc, who, price, arg) {
    const s = this.s;
    let msg = `${svc.nom} avec ${who} : −${fmt(price)}.`;
    const done = (kind = 'good') => { log(s, msg, kind); return ok(); };
    switch (svc.special) {
      case 'sleep': return this.sleep(svc.min, svc.quality, price, svc.eff, `${svc.nom} (${who})`);
      case 'hospital': this.advance(svc.min, { indoor: true, noFaint: true }); s.conditions = []; s.stats.sante = 100; s.stats.energie = clamp(s.stats.energie + 30, 0, 100); msg += ' Vous êtes complètement soigné.'; return done();
      case 'consult': {
        this.advance(svc.min, { indoor: true, noFaint: true });
        const found = [];
        if (s.conditions.includes('maladie') || s.conditions.includes('radiation')) { addItem(s, 'ordonnance', 1); found.push('ordonnance pour la pharmacie (antibiotique ou traitement anti-radiation)'); }
        if (s.conditions.includes('blessure')) found.push('blessure : voyez un infirmier ou un kiné');
        this.applyEff({ sante: 5, moral: 3 });
        msg += ` ${found.length ? found.join(' · ') : 'Rien à signaler, vous êtes en bonne santé'}.`; return done();
      }
      case 'cure_blessure': this.advance(svc.min, { indoor: true, noFaint: true }); this.cure('blessure'); this.applyEff(svc.eff); msg += ' Blessure soignée.'; return done();
      case 'cure_carie': this.advance(svc.min, { indoor: true }); this.cure('carie'); this.applyEff(svc.eff); return done();
      case 'cure_deprime': this.advance(svc.min, { indoor: true }); this.cure('deprime'); this.applyEff(svc.eff); return done();
      case 'welfare': {
        this.advance(svc.min);
        if (s.money < 80) { this.earn(150); msg = `🤝 ${who} vous accorde une aide de 150 ₵.`; } else msg = `${who} : vous avez assez d’argent, pas d’aide cette fois.`;
        return done();
      }
      case 'charm': this.advance(svc.min); this.applyEff(svc.eff); s.flags.charmUntil = s.time + 3 * 1440; msg += ' Plus de chances en rencontre pendant 3 jours.'; return done();
      case 'clean_home': this.advance(svc.min); this.applyEff(svc.eff); s.flags.cleanUntil = s.time + 3 * 1440; msg += ' Maison propre : meilleur sommeil 3 jours.'; return done();
      case 'renovate': this.advance(30); s.flags.renov = Math.min(20, (s.flags.renov || 0) + 5); msg += ` Confort de la maison +5.`; return done();
      case 'tour': return this.tour(arg, price, who);
      case 'tour_discount': s.flags.tourDiscount = true; msg += ' Votre prochain voyage guidé coûtera 30 % de moins.'; return done();
      case 'minigame': return ok('minigame');
      case 'school': case 'childcare': case 'child_growth':
        for (const ch of s.family.children) { ch.growth = clamp((ch.growth || 0) + 4, 0, 100); ch.happy = clamp((ch.happy ?? 70) + 10, 0, 100); }
        this.applyEff({ moral: 6 }); this.advance(svc.min); return done();
      case 'training': return this.trainJob(arg, price, who);
      case 'orientation': s.flags.orientation = true; this.advance(svc.min); msg += ' −20 % sur votre prochaine formation.'; return done();
      case 'freight': {
        const moved = [];
        for (const [id, q] of Object.entries({ ...s.inv })) {
          const d = def(id);
          if (d?.kind === 'resource' || d?.cat === 'agro' || d?.cat === 'materiau') { s.warehouse[id] = (s.warehouse[id] || 0) + q; delete s.inv[id]; moved.push(`${d.emoji}${q}`); }
        }
        msg += ` Envoyé à votre entrepôt : ${moved.join(' ')}.`; return done();
      }
      case 'storage': s.storageUntil = Math.max(s.storageUntil, s.time) + 7 * 1440; msg += ` Entrepôt loué jusqu’au ${day(s.storageUntil)}e jour.`; return done();
      case 'export': return this.exportGoods(arg, who);
      case 'teleport': return this.teleportTo(arg, price, who);
      case 'train': case 'flight': return this.transit(arg, svc.special === 'flight', price, who);
      case 'taxi': return this.taxi(arg, price, who);
      case 'repair_vehicle': for (const v of Object.keys(s.vehicles)) if (v !== 'cheval') s.vehicles[v].cond = 100; this.advance(svc.min); msg += ' Véhicules révisés.'; return done();
      case 'repair_horse': s.vehicles.cheval.cond = 100; this.advance(svc.min); msg += ' Votre cheval est en pleine forme.'; return done();
      case 'repair_machines': for (const b of s.buildings) b.wear = 0; this.advance(svc.min); msg += ' Machines remises à neuf.'; return done();
      case 'repair_tools': for (const id of Object.keys(s.inv)) if (def(id)?.dur) s.dur[id] = def(id).dur; this.advance(svc.min); msg += ' Outils réparés.'; return done();
      case 'build': { const b = s.buildings.find((x) => x.id === arg); b.steps[svc.step] = true; this.advance(30); msg += ` Étape terminée sur « ${b.nom} ».`; this.checkBuilt(b); return done(); }
      case 'install_machine': {
        const b = s.buildings.find((x) => x.id === arg.b);
        removeItem(s, arg.m); b.machines.push(arg.m); this.advance(30);
        msg += ` ${def(arg.m).nom} installé(e) dans « ${b.nom} ».`; return done();
      }
      case 'network': s.flags.network = true; msg += ' Vos bâtiments sont reliés au réseau (+10 % de ventes).'; return done();
      case 'cyber': s.cyberUntil = s.time + 30 * 1440; msg += ' Protégé contre les cyberattaques pendant 30 jours.'; return done();
      case 'hosting': s.flags.hostingUntil = s.time + 30 * 1440; msg += ' Site web en ligne 30 jours (si vous en avez un).'; return done();
      case 'investigate': {
        this.advance(svc.min);
        let chance = 0.55;
        if (has(s, 'rapport_renseignement')) { removeItem(s, 'rapport_renseignement'); chance = 0.95; }
        if (rnd() < chance) { s.theft.stage = 'identifie'; s.theft.suspect = `${pick(NAMES)} « le Rat »`; msg += ` Suspect identifié : ${s.theft.suspect}. Allez au palais de justice.`; }
        else { msg += ' Le voleur n’a pas été retrouvé. Affaire classée.'; s.theft = null; }
        return done();
      }
      case 'prosecute': s.theft.stage = 'poursuites'; this.advance(svc.min); msg += ' Le procureur engage des poursuites : place au jugement.'; return done();
      case 'lawyer': s.theft.lawyer = true; msg += ' Votre avocat prépare le dossier (+25 % de chances).'; return done();
      case 'judge': {
        this.advance(svc.min);
        if (rnd() < (s.theft.lawyer ? 0.95 : 0.7)) { this.earn(s.theft.amount); msg += ` Coupable condamné et mis en prison : vous récupérez ${fmt(s.theft.amount)}.`; }
        else msg += ' Relaxé faute de preuves.';
        s.theft = null; return done();
      }
      case 'mediate': { const g = Math.round(s.theft.amount * 0.5); this.earn(g); msg += ` Accord trouvé : vous récupérez ${fmt(g)}.`; s.theft = null; return done(); }
      case 'recover': { const g = Math.round(s.theft.amount * 0.4); this.earn(g); msg += ` L’huissier récupère ${fmt(g)}.`; s.theft = null; return done(); }
      case 'guard': s.guardUntil = Math.max(s.guardUntil, s.time) + 7 * 1440; msg += ' Vos biens sont surveillés 7 jours.'; return done();
      case 'escort': s.escortUntil = s.time + 8 * 60; msg += ' Escorte pour 8 heures : les pillards n’oseront pas.'; return done();
      case 'escort_mountain': s.mountainUntil = s.time + 8 * 60; msg += ' Guide à vos côtés pour 8 heures : bien moins de blessures.'; return done();
      case 'loan': {
        const big = has(s, 'plan_financement');
        const amount = big ? 8000 : 2000;
        if (big) removeItem(s, 'plan_financement');
        this.earn(amount, false);
        s.loan = { left: amount * 1.12, daily: (amount * 1.12) / 14 };
        msg += ` Prêt de ${fmt(amount)} accordé, remboursé sur 14 jours (+12 %).`; return done();
      }
      case 'advice': s.adviceBonus = 0.03; msg += ' Vos prochains placements rapportent 3 % de plus.'; return done();
      case 'broker': s.brokerUntil = s.time + 1440; msg += ' Vous pouvez acheter et vendre des actions pendant 24 h.'; return done();
      case 'wealth': s.wealthUntil = Math.max(s.wealthUntil, s.time) + 7 * 1440; msg += ' Votre argent rapporte 0,4 % par jour pendant 7 jours.'; return done();
      case 'insurance': s.insuranceUntil = Math.max(s.insuranceUntil, s.time) + 30 * 1440; msg += ` Assuré 30 jours : ${INSURANCE_COVER * 100} % des soins remboursés.`; return done();
      case 'ad': { for (const b of s.buildings) if (b.stage === 'actif') b.rep = clamp((b.rep || 30) + 15, 0, 100); this.advance(svc.min); msg += ' Réputation de vos bâtiments +15.'; return done(); }
      case 'sellboost': s.buffs.sellboost = s.time + 1440; this.advance(svc.min); msg += ' Vos ventes rapportent +15 % pendant 24 h.'; return done();
      case 'photos': addItem(s, 'photos', 2); this.advance(svc.min); this.applyEff(svc.eff); return done();
      case 'consign': return this.consign(arg, who);
      case 'wedding_plan': s.flags.weddingPlanned = true; this.advance(svc.min); msg += ' Le mariage est organisé : il ne reste qu’à le célébrer à la salle des fêtes.'; return done();
      case 'vet': for (const p of s.pets) { p.sante = 100; } this.advance(svc.min); msg += ' Vos animaux sont soignés.'; return done();
      case 'parcel': { const d2 = def(arg); removeItem(s, arg); s.family.partner.love = clamp(s.family.partner.love + d2.gift, 0, 100); msg += ` ${d2.nom} livré(e) à ${s.family.partner.nom} (affection +${d2.gift}).`; return done(); }
      case 'loto': s.lotoTickets = (s.lotoTickets || 0) + 1; msg += ` Vous avez ${s.lotoTickets} ticket(s) pour le tirage de dimanche 20 h.`; return done();
      case 'realtor': s.flags.realtorUntil = s.time + 1440; msg += ' L’agent vous accompagne 24 h pour louer ou acheter.'; return done();
      case 'driving': this.advance(svc.min); s.permits.push('permis_conduire'); msg += ' 🚗 Permis de conduire obtenu !'; return done();
      case 'library': this.advance(svc.min); this.applyEff(svc.eff); if (s.job && s.flags.libDay !== day(s.time)) { s.flags.libDay = day(s.time); this.gainXp(1); msg += ' +1 expérience.'; } return done();
      case 'clean_building': for (const b of s.buildings) if (b.stage === 'actif') b.rep = clamp((b.rep || 30) + 10, 0, 100); this.advance(30); msg += ' Locaux propres : réputation +10.'; return done();
      case 'internet': s.internetUntil = Math.max(s.internetUntil || 0, s.time) + 30 * 1440; msg += ' Internet et téléphone pour 30 jours (télétravail possible).'; return done();
      case 'home_insurance': s.homeInsuranceUntil = Math.max(s.homeInsuranceUntil || 0, s.time) + 30 * 1440; msg += ' Logement assuré 30 jours (tempêtes, cambriolages).'; return done();
      case 'car_insurance': s.carInsuranceUntil = Math.max(s.carInsuranceUntil || 0, s.time) + 30 * 1440; msg += ' Véhicules assurés 30 jours.'; return done();
      case 'party': this.advance(svc.min); this.applyEff(svc.eff); if (s.family.partner) s.family.partner.love = clamp(s.family.partner.love + 6, 0, 100); return done();
      default: break;
    }
    this.advance(svc.min, { indoor: true });
    this.applyEff(svc.eff);
    if (svc.buff) for (const [b, hh] of Object.entries(svc.buff)) s.buffs[b] = s.time + hh * 60;
    msg += ` ${this.effText(svc.eff)}`;
    return done();
  }
  hasPass(p) {
    if (p === 'club' && this.s.privateCity) return true;
    const v = this.s.passes[p];
    return v === true || (typeof v === 'number' && v > this.s.time);
  }
  buyClubPass() {
    if (!this.at('club')) return fail('Au club.');
    if (!this.pay(150)) return fail('Pas assez d’argent (150 ₵).');
    this.s.passes.club = Math.max(this.s.passes.club || 0, this.s.time) + 7 * 1440;
    log(this.s, '🎫 Pass club pour 7 jours.', 'good'); return ok();
  }
  sleep(min, quality, price, eff, label) {
    const s = this.s, startE = s.stats.energie;
    this.advance(min, { sleep: true, quality, indoor: label !== 'dehors' });
    if (eff) this.applyEff(eff);
    if (label === 'dehors') s.stats.moral = clamp(s.stats.moral - 8, 0, 100);
    log(s, `😴 ${label === 'dehors' ? 'Nuit à la belle étoile' : label}${price ? ` (−${fmt(price)})` : ''} : sommeil ${Math.round(startE)} → ${Math.round(s.stats.energie)}.`, 'good');
    return ok();
  }
  sleepHome() {
    if (!this.atHome()) return fail('Il faut être chez vous (Résidences).');
    const bed = this.homeHasBed();
    let quality = bed ? 0.75 + Math.min(this.homeComfort(), 60) / 100 : 0.55;
    if (this.s.flags.cleanUntil > this.s.time) quality += 0.1;
    const w = this.s.weather.type;
    if ((w === 'canicule' && !this.s.home.some((id) => def(id)?.climate === 'chaud')) || (w === 'vague_froid' && !this.s.home.some((id) => def(id)?.climate === 'froid'))) {
      quality *= 0.7; log(this.s, 'La température gêne votre sommeil (chauffage / climatisation).', 'warn');
    }
    return this.sleep(480, quality, 0, { moral: Math.round(this.homeComfort() / 8) }, bed ? 'Nuit chez vous' : 'Nuit chez vous, sans lit');
  }
  sleepOutside() { return this.sleep(480, 0.45, 0, null, 'dehors'); }

  // ------------------------------------------------------------------ votre métier
  currentJob() { return this.s.job ? JOBS[this.s.job] : null; }
  missingFor(job) {
    const s = this.s;
    return {
      outils: (job.outils || []).filter((id) => !has(s, id)),
      equip: (job.equip || []).filter((id) => !has(s, id)),
      permis: job.permis && !s.permits.includes(job.permis) ? job.permis : null,
    };
  }
  // Salarié chez un employeur habitant : salaire fixe
  work(odd = false) {
    const s = this.s;
    const job = odd ? ODD_JOB : this.currentJob();
    if (!job) return fail('Vous n’avez pas de métier.');
    const tele = !odd && this.canTelework();
    if (!tele && !this.at(job.place)) return fail(`Votre lieu de travail : ${this.place(job.place).nom}.`);
    if (!tele) { const cl = this.closedMsg(job.place); if (cl) return fail(cl); }
    if (s.stats.energie < 15) return fail('Trop fatigué pour travailler. Dormez d’abord.');
    if (!odd) s.flags.everEmployed = true;
    const miss = this.missingFor(job);
    if (miss.outils.length) return fail(`Outils manquants : ${miss.outils.map((i) => def(i).nom).join(', ')}.`);
    if (miss.permis) return fail(`Il faut : ${PERMITS[miss.permis].nom}.`);
    const lvl = odd ? 1 : this.jobLevel();
    let pay = job.salaire * (1 + 0.15 * (lvl - 1));
    if (s.stats.moral < 20) pay *= 0.8;
    if (miss.equip.length) pay *= 0.9;
    this.advance(240);
    this.applyEff({ energie: -16, faim: -5, soif: -6, hygiene: -6 });
    for (const t of job.outils || []) wear(s, t, 1);
    for (const t of job.equip || []) if (has(s, t)) wear(s, t, 1);
    this.earn(pay);
    if (rnd() < (job.risque || 0) * (miss.equip.length ? 3 : 1)) this.addCondition('blessure');
    log(s, `💼 Service de 4 h comme salarié (${job.nom}) : +${fmt(pay)}${miss.equip.length ? ` · sans ${miss.equip.map((i) => def(i).nom.toLowerCase()).join(', ')} : −10 %, risque ×3` : ''}.`, 'good');
    if (!odd) return this.gainXp(1);
    return ok();
  }
  // Recevoir des clients habitants pour un service de votre métier
  serve(svcId) {
    const s = this.s, svc = SERVICES[svcId];
    if (!s.job || !svc.jobs.includes(s.job)) return fail('Ce service n’est pas votre métier.');
    if (svc.special === 'build') return fail('Sur un chantier, travaillez comme salarié ou proposez vos services aux autres.');
    if (!this.atPlaceFor(svc)) return fail(`Il faut être au bon endroit : ${svc.place.startsWith('*') ? 'sur un site' : this.place(svc.place).nom}.`);
    if (!svc.place.startsWith('*')) { const cl = this.closedMsg(svc.place); if (cl) return fail(cl); }
    if (s.stats.energie < 15) return fail('Trop fatigué.');
    if (svc.tool && !has(s, svc.tool)) return fail(`Il faut : ${def(svc.tool).nom}.`);
    const miss = this.missingFor(JOBS[s.job]);
    if (miss.permis) return fail(`Il faut : ${PERMITS[miss.permis].nom}.`);
    const myPrice = s.myPrices[svcId] || serviceValue(svc);
    let clients = this.m.clientsFor(svcId, myPrice);
    clients = Math.round(clients * (1 + 0.06 * (this.jobLevel() - 1)));
    let served = 0;
    for (let i = 0; i < clients; i++) {
      // vérifier les fournitures
      const holder = { stock: s.inv, acc: s.supplyAcc };
      let enough = true;
      for (const [id, q] of Object.entries(svc.supplies)) if ((s.inv[id] || 0) + (1 - ((s.supplyAcc[id] || 0) % 1)) < q && (s.inv[id] || 0) < Math.ceil(q - (s.supplyAcc[id] || 0))) enough = false;
      if (!enough) break;
      this.m.useSupplies(holder, svc);
      served++;
    }
    this.advance(240);
    this.applyEff({ energie: -14, faim: -5, soif: -6 });
    if (svc.tool) wear(s, svc.tool, 1);
    const gain = served * myPrice;
    this.earn(gain);
    s.notoriety = clamp((s.notoriety || 0) + served * 0.5, 0, 100);
    s.flags.everEmployed = true;
    const missing = served < clients ? ` (${clients - served} client(s) renvoyé(s) : il manque ${Object.keys(svc.supplies).map((i) => def(i).nom.toLowerCase()).join(', ')})` : '';
    log(s, `🧑‍💼 ${svc.nom} : ${served} client(s) servi(s) en 4 h, +${fmt(gain)}${missing}.${served === 0 && !missing ? ' Peu de demande aujourd’hui : baissez votre prix ou changez de lieu.' : ''}`, served ? 'good' : 'warn');
    return this.gainXp(1);
  }
  setServicePrice(svcId, price) { this.s.myPrices[svcId] = Math.max(1, Math.round(price)); return ok(); }
  gainXp(n, msg) {
    const s = this.s;
    if (!s.job) return ok();
    const before = this.jobLevel();
    s.jobXp[s.job] = (s.jobXp[s.job] || 0) + n;
    if (msg) log(s, msg, 'good');
    const after = this.jobLevel();
    if (after > before) log(s, `⭐ Niveau ${after} en ${JOBS[s.job].nom} : meilleur salaire, plus de clients, meilleure production.`, 'good');
    return ok();
  }
  trainingCost(jobId) {
    let c = JOBS[jobId].formation;
    if (this.s.flags.orientation) c *= 0.8;
    if (this.event()?.training) c *= this.event().training;
    return Math.round(c);
  }
  trainJob(jobId, paidToTrainer, who) {
    const s = this.s, job = JOBS[jobId];
    if (job.formation >= 4000) { if (!has(s, 'diplome_univ')) { this.earn(paidToTrainer); return fail('Cette formation exige un diplôme universitaire (maître de conférences).'); } removeItem(s, 'diplome_univ'); }
    let hours = job.heures;
    if (has(s, 'methode_pedagogique')) { removeItem(s, 'methode_pedagogique'); hours *= 0.7; }
    const rest = this.trainingCost(jobId) - paidToTrainer;
    if (rest > 0 && !this.pay(rest)) { this.earn(paidToTrainer); return fail(`Pas assez d'argent (${fmt(this.trainingCost(jobId))}).`); }
    s.flags.orientation = false;
    this.advance(hours * 60, { indoor: true });
    s.diplomas.push(jobId);
    log(s, `🎓 Diplôme obtenu : ${job.nom}, formé par ${who}. Vous pouvez prendre ce métier.`, 'good');
    return ok();
  }
  takeJob(jobId) {
    const s = this.s;
    if (!s.diplomas.includes(jobId)) return fail('Il faut d’abord le diplôme.');
    s.job = jobId;
    const j = JOBS[jobId];
    log(s, `💼 Nouveau métier : ${j.nom}. Voir l’onglet Métier pour ce que vous pouvez produire et vendre.`, 'good');
    return ok();
  }
  quitJob() { if (!this.s.job) return fail('Aucun métier.'); log(this.s, `Vous avez quitté votre poste de ${JOBS[this.s.job].nom}.`); this.s.job = null; return ok(); }
  buyPermit(id) {
    const s = this.s, p = PERMITS[id];
    if (id === 'permis_conduire') return fail('Le permis de conduire se passe à l’auto-école, avec un moniteur.');
    if (!this.at('ecole')) return fail('À l’Académie.');
    const prov = this.m.providers('formation')[0];
    if (!prov) return fail('Aucun formateur disponible.');
    if (s.permits.includes(id)) return fail('Déjà obtenu.');
    if (!this.pay(p.prix)) return fail(`Pas assez d'argent (${fmt(p.prix)}).`);
    prov.c.money += p.prix * 0.9;
    this.advance(p.heures * 60, { indoor: true });
    s.permits.push(id);
    log(s, `${p.emoji} ${p.nom} obtenu avec ${prov.c.nom} (−${fmt(p.prix)}).`, 'good');
    return ok();
  }

  // ------------------------------------------------------------------ fabriquer
  recipesForPlayer() {
    const s = this.s;
    const own = s.job ? (RECIPES_BY_JOB[s.job] || []) : [];
    return [...own, ...RECIPES.filter((r) => r.home)];
  }
  workshopFor(r) {
    // une machine : seulement dans un de vos bâtiments où elle est installée
    if (r.machine) return this.s.buildings.find((b) => b.stage === 'actif' && b.machines.includes(r.machine)) || null;
    return null;
  }
  canCraft(r) {
    const s = this.s;
    if (r.home) { if (!this.homeHas('cooking')) return 'Il faut une cuisine équipée chez vous'; if (!this.atHome()) return 'Chez vous uniquement'; }
    else {
      if (!s.job || !r.jobs.includes(s.job)) return `Réservé : ${r.jobs.map((j) => JOBS[j]?.nom).join(', ')}`;
      if (r.machine) { const b = this.workshopFor(r); if (!b) return `Il faut une machine « ${def(r.machine).nom} » installée dans votre bâtiment`; }
      else if (!this.at(JOBS[s.job].place) && this.atJobHouse() !== s.job && !s.buildings.some((b) => b.stage === 'actif' && this.atBuilding(b))) return `À votre lieu de travail (${this.place(JOBS[s.job].place).nom}) ou dans votre bâtiment`;
      const miss = this.missingFor(JOBS[s.job]);
      if (miss.permis) return `Il faut : ${PERMITS[miss.permis].nom}`;
    }
    if (r.tool && !has(s, r.tool)) return `Outil : ${def(r.tool).nom}`;
    for (const [id, q] of Object.entries(r.in)) if (!has(s, id, q)) return 'Matières insuffisantes (achetez-les aux producteurs)';
    return null;
  }
  atBuilding(b) { return b.pos && Math.hypot(b.pos[0] - this.s.pos.x, b.pos[1] - this.s.pos.z) < 20; }
  craft(idx, times = 1) {
    const r = RECIPES[idx], s = this.s;
    let made = 0;
    for (let k = 0; k < times; k++) {
      const why = this.canCraft(r);
      if (why) { if (!made) return fail(why); break; }
      if (s.stats.energie < 8) break;
      for (const [id, q] of Object.entries(r.in)) removeItem(s, id, q);
      if (r.tool) wear(s, r.tool, 1);
      const b = this.workshopFor(r);
      let mult = 1 + (r.home ? 0 : 0.05 * (this.jobLevel() - 1));
      if (b) { b.wear = (b.wear || 0) + 1; if (b.wear > 40) mult *= 0.5; }
      this.advance(r.min, { indoor: true });
      this.applyEff({ energie: -r.min / 30 });
      for (const [id, q] of Object.entries(r.out)) { let n = q * mult; n = Math.floor(n) + (rnd() < n % 1 ? 1 : 0); if (this.guild('artisans') && q >= 2) n += 1; addItem(s, id, n); }
      made++;
    }
    log(s, `🛠️ Produit : ${Object.entries(r.out).map(([id, q]) => `${def(id).emoji} ${def(id).nom} ×${q * made}`).join(', ')}${made > 1 ? ` (${made} fois)` : ''}.`, 'good');
    if (!r.home) this.gainXp(1);
    return ok();
  }

  // ------------------------------------------------------------------ récolte sur les sites
  gather(siteId, gId) {
    const s = this.s, site = this.place(siteId), g = site.gather.find((x) => x.id === gId);
    if (!this.at(siteId)) return fail('Vous devez être sur le site.');
    if (site.pass && !this.hasPass(site.pass)) return fail('Zone de haut niveau : pass à l’Hôtel de ville.');
    if (g.tool && !has(s, g.tool)) return fail(`Il faut : ${def(g.tool).emoji} ${def(g.tool).nom} (fabriqué par d’autres, en vente à la quincaillerie).`);
    if (g.permit && !s.permits.includes(g.permit)) return fail(`Il faut : ${PERMITS[g.permit].nom}.`);
    if (g.fuel) for (const [id, q] of Object.entries(g.fuel)) if (!has(s, id, q)) return fail(`Il faut ${q} ${def(id).nom.toLowerCase()}.`);
    if (s.stats.energie < g.energie) return fail('Trop fatigué.');
    if (this.overloaded()) return fail('Votre sac est trop lourd : vendez, stockez ou faites transporter vos marchandises.');
    const missEquip = (g.equip || []).filter((e) => !has(s, e));
    if (g.rad && missEquip.includes('combi_antirad')) return fail('Sans combinaison anti-radiation, c’est mortel.');
    this.advance(g.min);
    this.applyEff({ energie: -g.energie, hygiene: -10, faim: -4, soif: -5 });
    if (g.tool) wear(s, g.tool, 1);
    if (g.fuel) for (const [id, q] of Object.entries(g.fuel)) removeItem(s, id, q);
    for (const e of g.equip || []) if (has(s, e)) wear(s, e, 1);
    let rolls = g.rolls;
    if (this.guild('explorateurs')) rolls *= 1.25;
    const jobGathers = s.job && (GATHER_JOBS[s.job] || []).some(([si, gi]) => si === siteId && gi === gId);
    if (jobGathers) rolls *= 1.5 + 0.06 * this.jobLevel();
    const buffKey = { mine: 'carte_prospection', cratere: 'alerte_meteores', port: 'etude_marine' }[siteId];
    const boosted = buffKey && s.docsBuff[buffKey] > 0;
    if (boosted) s.docsBuff[buffKey]--;
    rolls = Math.floor(rolls) + (rnd() < rolls % 1 ? 1 : 0);
    const total = g.loot.reduce((a, l) => a + l[1], 0);
    const got = {};
    for (let i = 0; i < rolls; i++) {
      let r = rnd() * total;
      for (const [id, w, a, b] of g.loot) {
        const ww = boosted && def(id).rare >= 3 ? w * 3 : w;
        r -= ww * (total / (total + (boosted ? 1 : 0)));
        if (r <= 0) { got[id] = (got[id] || 0) + a + Math.floor(rnd() * (b - a + 1)); break; }
      }
    }
    let extra = '';
    if ((siteId === 'volcan' || siteId === 'cratere') && s.escortUntil < s.time && rnd() < 0.15) {
      for (const id of Object.keys(got)) got[id] = Math.floor(got[id] / 2);
      extra = ' 🏴 Des pillards vous ont pris la moitié du butin (une escorte militaire les aurait dissuadés).';
    }
    for (const [id, n] of Object.entries(got)) if (n > 0) addItem(s, id, n);
    const mountain = (siteId === 'mine' || siteId === 'volcan') && s.mountainUntil > s.time ? 0.3 : 1;
    if (rnd() < (g.risque || 0) * (missEquip.length ? 3 : 1) * mountain) this.addCondition('blessure');
    if (g.rad && rnd() < 0.08) this.addCondition('radiation');
    const txt = Object.entries(got).filter(([, n]) => n > 0).map(([id, n]) => `${def(id).emoji} ${def(id).nom} ×${n}`).join(', ');
    log(s, `${site.emoji} ${g.nom} : ${txt || 'rien trouvé'}.${boosted ? ' (document utilisé : butin rare)' : ''}${extra}`, 'good');
    if (jobGathers) this.gainXp(1);
    return ok();
  }

  // ------------------------------------------------------------------ vendre
  setListing(id, qty, price, auto) {
    if (qty <= 0) { delete this.s.listings[id]; this.m.dirty = true; return ok(); }
    const old = this.s.listings[id];
    this.s.listings[id] = { qty: Math.round(qty), price: Math.max(0.5, Math.round(price * 10) / 10), auto: auto ?? old?.auto ?? true, floor: Math.round(this.value(id) * 0.6 * 10) / 10 };
    this.m.dirty = true;
    return ok();
  }
  quickSell(id, n) {
    if (!this.at('comptoir')) return fail('Au Comptoir des ressources.');
    if (!has(this.s, id, n)) return fail('Quantité insuffisante.');
    let p = this.m.quickPrice(id);
    if (this.guild('marchands')) p *= 1.1;
    removeItem(this.s, id, n);
    if (this.s.listings[id]) this.setListing(id, Math.min(this.s.listings[id].qty, this.s.inv[id] || 0), this.s.listings[id].price);
    this.earn(p * n);
    log(this.s, `💰 Vendu au grossiste : ${def(id).emoji} ${def(id).nom} ×${n} (+${fmt(p * n)}).`, 'good');
    return ok();
  }
  suggestedPrice(id) {
    const offers = this.m.offers(id).filter((o) => !o.player);
    const base = offers.length ? offers[0].price() : this.value(id) * 1.4;
    let p = base * 0.98;
    if (this.s.buffs.sellboost > this.s.time) p *= 1.15;
    if (has(this.s, 'certificat_qualite')) p *= 1.05;
    return Math.max(0.5, Math.round(p * 10) / 10);
  }
  consign(id, who) {
    const s = this.s;
    if (!id || !has(s, id)) return fail('Choisissez une marchandise de votre sac.');
    const n = Math.min(s.inv[id], 20);
    const p = this.m.refPrice(id) * 1.1;
    removeItem(s, id, n);
    this.earn(p * n * 0.9);
    log(s, `🛍️ ${who} a vendu en boutique ${def(id).emoji} ${def(id).nom} ×${n} : +${fmt(p * n * 0.9)} (après sa commission).`, 'good');
    return ok();
  }
  exportGoods(id, who) {
    const s = this.s;
    if (!id || !has(s, id)) return fail('Choisissez une marchandise.');
    removeItem(s, 'dedouanement');
    const n = s.inv[id];
    const p = this.value(id) * 1.15;
    removeItem(s, id, n);
    this.earn(p * n);
    log(s, `🚢 Export par ${who} : ${def(id).emoji} ${def(id).nom} ×${n} vendus à l’étranger (+${fmt(p * n)}).`, 'good');
    return ok();
  }
  warehouseMove(id, n, toWarehouse) {
    const s = this.s;
    if (!this.at('comptoir')) return fail('Votre entrepôt est au Comptoir des ressources.');
    if (toWarehouse) {
      if (s.storageUntil < s.time) return fail('Louez d’abord un entrepôt auprès d’un logisticien ou magasinier.');
      if (!removeItem(s, id, n)) return fail('Quantité insuffisante.');
      s.warehouse[id] = (s.warehouse[id] || 0) + n;
    } else {
      if ((s.warehouse[id] || 0) < n) return fail('Quantité insuffisante.');
      s.warehouse[id] -= n; if (!s.warehouse[id]) delete s.warehouse[id];
      addItem(s, id, n);
    }
    return ok();
  }

  // ------------------------------------------------------------------ véhicules
  registerVehicle(id) {
    const d = def(id), s = this.s;
    if (s.vehicles[d.vehicle] && !s.vehicles[d.vehicle].rentedUntil) return fail('Vous en avez déjà un.');
    removeItem(s, id);
    s.vehicles[d.vehicle] = { fuel: 80, cond: 100 };
    log(s, `${d.emoji} ${d.nom} prêt à rouler.${VEHICLES[d.vehicle].needs && !has(s, VEHICLES[d.vehicle].needs) ? ` Il vous faut une ${def(VEHICLES[d.vehicle].needs).nom.toLowerCase()}.` : ''}`, 'good');
    return ok();
  }
  vehicleUsable(id) {
    if (id === 'marche') return null;
    const v = this.s.vehicles[id], d = VEHICLES[id];
    if (!v) return 'Vous n’avez pas ce véhicule';
    if (d.permis && !this.s.permits.includes(d.permis)) return `Il faut : ${PERMITS[d.permis].nom}`;
    if (d.needs && !has(this.s, d.needs)) return `Il faut : ${def(d.needs).nom}`;
    if ((id === 'voiture' || id === 'drone') && !v.rentedUntil && !has(this.s, 'carte_grise')) return 'Il faut une carte grise (préfecture)';
    if (v.fuel <= 0) return `Plus de ${d.fuelNom.toLowerCase()}`;
    if (v.cond <= 0) return 'En panne : entretien nécessaire';
    return null;
  }
  setTransport(id) { const why = this.vehicleUsable(id); if (why) return fail(why); this.s.transport = id; return ok(); }
  speed() { return VEHICLES[this.s.transport].speed; }
  travelled(dist, mode) {
    const s = this.s;
    if (mode !== 'marche' && s.vehicles[mode]) {
      const v = s.vehicles[mode], d = VEHICLES[mode];
      v.fuel = clamp(v.fuel - dist / 1000 * d.fuel, 0, 100);
      v.cond = clamp(v.cond - dist / 1000 * d.wear, 0, 100);
      this.roadEvents(dist, mode);
      if (v.fuel <= 0 || v.cond <= 0) {
        log(s, `${d.emoji} Votre ${d.nom.toLowerCase()} ${v.fuel <= 0 ? `n'a plus de ${d.fuelNom.toLowerCase()}` : 'est en panne'}. Vous continuez à pied.`, 'warn');
        s.transport = 'marche';
      }
    } else if (mode === 'marche') this.applyEff({ energie: -dist / 1000 * 3 });
  }
  refuelWithItem(vid) {
    const v = this.s.vehicles[vid], d = VEHICLES[vid];
    if (!v) return fail('Pas de véhicule.');
    if (!has(this.s, d.refill)) {
      const r = this.m.buy('player', d.refill, 1);
      if (!r.n) return fail(`Personne ne vend de ${def(d.refill).nom.toLowerCase()} en ce moment.`);
      log(this.s, `Achat : ${def(d.refill).nom} (−${fmt(r.spent)}).`);
    }
    removeItem(this.s, d.refill);
    v.fuel = clamp(v.fuel + d.refillPct, 0, 100);
    log(this.s, `${d.emoji} ${def(d.refill).nom} utilisé(e) : ${d.fuelNom} ${Math.round(v.fuel)} %.`);
    return ok();
  }
  rentVehicle(id) {
    const d = VEHICLES[id];
    if (!this.at('garage')) return fail('Au garage.');
    if (this.s.vehicles[id]) return fail('Vous en avez déjà un.');
    if (!this.pay(d.loc)) return fail(`Pas assez d'argent (${fmt(d.loc)}).`);
    this.s.vehicles[id] = { fuel: 100, cond: 100, rentedUntil: this.s.time + 1440 };
    if (id === 'cheval' && !has(this.s, 'selle')) addItem(this.s, 'selle', 1);
    log(this.s, `${d.emoji} ${d.nom} loué(e) pour 24 h (−${fmt(d.loc)}).`, 'good');
    return ok();
  }
  transit(destId, fast, price, who) {
    const from = this.hereId();
    const dist = this.world.distanceBetween(from, destId);
    this.advance(10 + dist / (fast ? 300 : 90), { indoor: true });
    this.world.teleport(destId);
    log(this.s, `${fast ? '🚀 Navette' : '🚆 Train'} vers ${this.place(destId).nom}, conduit(e) par ${who} (−${fmt(price)}).`, 'good');
    return ok();
  }
  teleportTo(destId, price, who) {
    this.advance(5);
    this.world.teleport(destId);
    log(this.s, `🌀 ${who} vous téléporte à ${this.place(destId).nom} (−${fmt(price)}).`, 'good');
    return ok();
  }
  taxi(destId, price, who) {
    const dist = this.world.distanceBetween(this.hereId(), destId);
    this.advance(dist / 38);
    this.world.teleport(destId);
    log(this.s, `🚘 ${who} vous dépose à ${this.place(destId).nom} (−${fmt(price)}).`, 'good');
    return ok();
  }
  tour(destId, price, who) {
    let p = price;
    if (this.s.flags.tourDiscount) { this.s.flags.tourDiscount = false; const back = Math.round(p * 0.3); this.earn(back); p -= back; }
    this.advance(120 + this.world.distanceBetween(this.hereId(), destId) / 90, { noFaint: true });
    this.world.teleport(destId);
    this.applyEff({ moral: 32, energie: -10 });
    log(this.s, `🧭 Voyage guidé à ${this.place(destId).nom} avec ${who} (−${fmt(p)}). Quelle vue !`, 'good');
    return ok();
  }

  // ------------------------------------------------------------------ logement
  rent() {
    const s = this.s;
    if (!this.at('immobilier')) return fail('À l’agence immobilière.');
    if (s.housing) return fail('Vous avez déjà un logement.');
    if (!has(s, 'carte_identite')) return fail('Il faut une carte d’identité pour le dossier (préfecture).');
    if (!(s.flags.realtorUntil > s.time)) return fail('Il faut être accompagné par un agent immobilier (service ci-dessous).');
    const h = HOUSING.location;
    if (!this.pay(h.caution + h.loyer)) return fail(`Il faut ${fmt(h.caution + h.loyer)}.`);
    s.housing = { type: 'location' };
    log(s, `🏢 Appartement loué aux Résidences (loyer ${fmt(h.loyer)} par jour).`, 'good');
    return ok();
  }
  buyHouse(type) {
    const s = this.s, h = HOUSING[type];
    if (!this.at('immobilier')) return fail('À l’agence immobilière.');
    if (type === 'villa' && !s.privateCity) return fail('La villa est en Haute-Ville : il faut en être citoyen.');
    if (!has(s, 'carte_identite')) return fail('Il faut une carte d’identité (préfecture).');
    if (!(s.flags.realtorUntil > s.time)) return fail('Il faut être accompagné par un agent immobilier.');
    const miss = Object.entries(LIFE_REQUIREMENTS.achat_maison).filter(([id, q]) => !has(s, id, q));
    if (miss.length) return fail(`Il faut : ${miss.map(([id]) => def(id).nom).join(' et ')} (achetez-les au Comptoir, faits par un notaire et un géomètre).`);
    let price = h.prix;
    const old = s.housing && HOUSING[s.housing.type];
    if (old?.prix) price -= Math.round(old.prix * 0.8);
    if (!this.pay(price)) return fail(`Pas assez d'argent (${fmt(price)}).`);
    for (const [id, q] of Object.entries(LIFE_REQUIREMENTS.achat_maison)) removeItem(s, id, q);
    s.housing = { type };
    if (s.home.length > h.slots) { const extra = s.home.splice(h.slots); for (const id of extra) addItem(s, id, 1); }
    log(s, `${h.emoji} Vous êtes propriétaire : ${h.nom} (−${fmt(price)}). Acte signé chez le notaire.`, 'good');
    return ok();
  }
  leaveHousing() {
    const s = this.s;
    if (!s.housing || s.housing.type !== 'location') return fail('Rien à résilier.');
    s.housing = null;
    for (const id of s.home) addItem(s, id, 1);
    s.home = [];
    log(s, 'Location résiliée. Vos meubles sont dans votre sac.');
    return ok();
  }
  install(id) {
    const s = this.s, h = s.housing && HOUSING[s.housing.type];
    if (!h) return fail('Il faut un logement.');
    if (!this.atHome()) return fail('Allez chez vous (Résidences).');
    if (s.home.length >= h.slots) return fail('Plus de place chez vous.');
    if (!removeItem(s, id)) return fail('Objet absent.');
    s.home.push(id);
    log(s, `${def(id).emoji} ${def(id).nom} installé(e). Confort : ${this.homeComfort()}.`, 'good');
    return ok();
  }
  uninstall(idx) { const id = this.s.home.splice(idx, 1)[0]; if (id) addItem(this.s, id, 1); return ok(); }
  homeActivity(kind) {
    if (!this.atHome()) return fail('Allez chez vous.');
    const s = this.s;
    if (kind === 'radio') { if (!s.home.includes('radio')) return fail('Il faut une radio.'); this.advance(60, { indoor: true }); this.applyEff({ moral: 6 }); log(s, '📻 Vous écoutez la radio. +6 moral.'); }
    if (kind === 'ordi') { if (!s.home.includes('ordinateur')) return fail('Il faut un ordinateur.'); this.advance(90, { indoor: true }); this.applyEff({ moral: 8, energie: -3 }); log(s, '🖥️ Détente sur l’ordinateur. +8 moral.'); }
    if (kind === 'douche') {
      if (!has(s, 'eau', 2)) return fail('Il faut 2 bouteilles d’eau (au marché).');
      removeItem(s, 'eau', 2); this.advance(20, { indoor: true }); this.applyEff({ hygiene: has(s, 'savon') ? 70 : 35 }); if (has(s, 'savon')) removeItem(s, 'savon'); log(s, '🚿 Douche à la maison.');
    }
    return ok();
  }

  // ------------------------------------------------------------------ social
  joinGuild(id) {
    const g = GUILDS.find((x) => x.id === id);
    if (!this.at('guilde')) return fail('À la Maison des guildes.');
    if (this.s.guild === id) return fail('Déjà membre.');
    if (!this.pay(g.entree)) return fail(`Pas assez d'argent (${fmt(g.entree)}).`);
    this.s.guild = id;
    log(this.s, `${g.emoji} Bienvenue dans la ${g.nom} !`, 'good');
    return ok();
  }
  leaveGuild() { this.s.guild = null; log(this.s, 'Vous avez quitté votre guilde.'); return ok(); }
  joinPrivateCity() {
    if (!this.at('guilde')) return fail('À la Maison des guildes.');
    if (this.s.privateCity) return fail('Déjà citoyen.');
    if (!this.pay(2500)) return fail('Pas assez d’argent (2 500 ₵).');
    this.s.privateCity = true;
    log(this.s, '🏰 Citoyen de la Haute-Ville : club en accès libre, villas, +2 moral par jour.', 'good');
    return ok();
  }
  buyHighPass() {
    if (!this.at('mairie')) return fail('À l’Hôtel de ville.');
    if (this.s.passes.haut_niveau) return fail('Déjà acheté.');
    if (!this.pay(5000)) return fail('Pas assez d’argent (5 000 ₵).');
    this.s.passes.haut_niveau = true;
    log(this.s, '🌠 Pass zone de haut niveau : le Cratère de l’Étoile vous est ouvert.', 'good');
    return ok();
  }

  // ------------------------------------------------------------------ famille
  meet(msg) {
    const f = this.s.family;
    if (f.partner) { f.partner.love = clamp(f.partner.love + 4, 0, 100); this.applyEff({ moral: 8 }); log(this.s, `💬 ${msg} Moment passé avec ${f.partner.nom}. Affection ${Math.round(f.partner.love)}.`, 'good'); return ok(); }
    const chance = this.s.flags.charmUntil > this.s.time ? 0.8 : 0.5;
    if (rnd() < chance) { f.partner = { nom: pick(NAMES), love: 20 }; log(this.s, `💘 ${msg} Vous avez rencontré ${f.partner.nom} !`, 'good'); }
    else log(this.s, `${msg} Pas de rencontre cette fois.`);
    this.applyEff({ moral: 5 });
    return ok();
  }
  clubNight() {
    if (!this.at('club')) return fail('Au club.');
    if (!this.hasPass('club')) return fail('Il faut un pass.');
    this.advance(150);
    this.applyEff({ moral: 18, energie: -10 });
    return this.meet('🍸 Soirée au club :');
  }
  date() {
    const f = this.s.family;
    if (!f.partner) return fail('Personne à inviter. Faites des rencontres.');
    if (!this.at('restaurant') && !this.at('evenements')) return fail('Au restaurant ou à la salle des fêtes.');
    const p = this.m.providers('repas_restaurant')[0];
    if (!p) return fail('Le restaurant n’a ni serveur ni plat en ce moment.');
    const price = p.price * 2;
    if (!this.pay(price)) return fail(`Pas assez d’argent (${fmt(price)}).`);
    this.m.payService(p.c, SERVICES.repas_restaurant, p.price, 'player');
    this.m.payService(p.c, SERVICES.repas_restaurant, p.price, 'player');
    this.advance(150);
    f.partner.love = clamp(f.partner.love + 12, 0, 100);
    this.applyEff({ moral: 12, faim: 50, soif: 25 });
    log(this.s, `🕯️ Dîner avec ${f.partner.nom}, servi par ${p.c.nom} (−${fmt(price)}). Affection ${Math.round(f.partner.love)}.`, 'good');
    return ok();
  }
  gift(id) {
    const f = this.s.family, d = def(id);
    if (!f.partner) return fail('Personne à qui l’offrir.');
    if (!d?.gift || !removeItem(this.s, id)) return fail('Ce n’est pas un cadeau.');
    f.partner.love = clamp(f.partner.love + d.gift, 0, 100);
    this.applyEff({ moral: 4 });
    log(this.s, `🎁 ${d.nom} offert(e) à ${f.partner.nom}. Affection ${Math.round(f.partner.love)}.`, 'good');
    return ok();
  }
  marry() {
    const s = this.s, f = s.family;
    if (!this.at('evenements')) return fail('À la salle des fêtes.');
    if (!f.partner || f.partner.love < 80) return fail('Il faut une affection d’au moins 80.');
    if (f.married) return fail('Déjà marié(e) !');
    if (!s.housing) return fail('Il faut un logement.');
    if (!s.flags.weddingPlanned) return fail('Il faut d’abord un wedding planner (service à la salle des fêtes).');
    if (!has(s, 'carte_identite')) return fail('Il faut une carte d’identité.');
    const miss = Object.entries(LIFE_REQUIREMENTS.mariage).filter(([id, q]) => !has(s, id, q));
    if (miss.length) return fail(`Il manque : ${miss.map(([id, q]) => `${def(id).nom} ×${q}`).join(', ')} (bijoutier, cuisiniers).`);
    if (!this.pay(500)) return fail('Frais de mairie : 500 ₵.');
    for (const [id, q] of Object.entries(LIFE_REQUIREMENTS.mariage)) removeItem(s, id, q);
    this.advance(360);
    f.married = true; s.flags.weddingPlanned = false;
    this.applyEff({ moral: 50, energie: -20 });
    log(s, `💍 Félicitations ! Vous avez épousé ${f.partner.nom}.`, 'good');
    return ok();
  }
  adopt() {
    const s = this.s, h = s.housing && HOUSING[s.housing.type];
    if (!this.at('famille')) return fail('À la Maison de la famille.');
    if (!h?.family) return fail('Il faut une maison familiale ou une villa.');
    if (s.family.children.length >= 3) return fail('Votre foyer est complet.');
    if (!has(s, 'carte_identite')) return fail('Il faut une carte d’identité (préfecture).');
    if (!has(s, 'dossier_admin')) return fail('Il faut un dossier administratif (secrétaires).');
    const p = this.m.providers('aide_sociale')[0];
    if (!p) return fail('Aucun assistant social pour l’enquête sociale.');
    if (!this.pay(800 + p.price)) return fail(`Pas assez d’argent (${fmt(800 + p.price)}).`);
    removeItem(s, 'dossier_admin');
    this.m.payService(p.c, SERVICES.aide_sociale, p.price, 'player');
    const nom = pick(NAMES);
    s.family.children.push({ nom, born: s.time, growth: 0, happy: 80 });
    this.applyEff({ moral: 25 });
    log(s, `👶 Bienvenue à ${nom} ! Enquête sociale par ${p.c.nom}. Chaque jour : nourriture, école et garde à payer.`, 'good');
    return ok();
  }

  // ------------------------------------------------------------------ société et bâtiments
  createCompany(nom) {
    const s = this.s;
    if (!this.at('mairie')) return fail('À l’Hôtel de ville.');
    if (s.company) return fail('Vous avez déjà une société.');
    const miss = Object.entries(COMPANY_DOCS).filter(([id, q]) => !has(s, id, q));
    if (miss.length) return fail(`Il faut : ${miss.map(([id]) => def(id).nom).join(' et ')} (avocat, greffier : au Comptoir).`);
    if (!this.pay(300)) return fail('Frais d’enregistrement : 300 ₵.');
    for (const [id, q] of Object.entries(COMPANY_DOCS)) removeItem(s, id, q);
    s.company = { nom: nom || `${s.nom} & Cie`, founded: s.time };
    log(s, `🏢 Société « ${s.company.nom} » enregistrée. Vous pouvez faire construire des bâtiments.`, 'good');
    return ok();
  }
  startProject(type, nom) {
    const s = this.s, B = BUILDINGS[type];
    if (!this.at('mairie')) return fail('À l’Hôtel de ville.');
    if (!s.company) return fail('Créez d’abord votre société.');
    if (!this.pay(B.terrain)) return fail(`Terrain : ${fmt(B.terrain)}.`);
    const plot = this.world.plotFor(s.buildings.length);
    const b = { id: `b${Date.now().toString(36)}`, type, nom: nom || `${B.nom} ${s.buildings.length + 1}`, stage: 'chantier', pos: plot,
      docs: {}, mats: {}, steps: {}, machines: [], employees: [], stock: {}, sell: {}, prod: {}, rep: 30, wear: 0, autoBuy: true, paidUntil: s.time + 7 * 1440 };
    s.buildings.push(b);
    this.world.updateBuildings?.(s.buildings);
    log(s, `🏗️ Terrain acheté pour « ${b.nom} » (−${fmt(B.terrain)}). Il faut maintenant les documents, les matériaux, puis les ouvriers.`, 'good');
    return ok();
  }
  deliver(bid) {
    const s = this.s, b = s.buildings.find((x) => x.id === bid), B = BUILDINGS[b.type];
    const moved = [];
    for (const [kind, need] of [['docs', B.docs], ['mats', B.mats]]) {
      for (const [id, q] of Object.entries(need)) {
        const missing = q - (b[kind][id] || 0);
        const n = Math.min(missing, s.inv[id] || 0);
        if (n > 0) { removeItem(s, id, n); b[kind][id] = (b[kind][id] || 0) + n; moved.push(`${def(id).emoji}${n}`); }
      }
    }
    if (!moved.length) return fail('Rien à livrer : achetez les documents et matériaux au Comptoir.');
    log(s, `🚚 Livré au chantier « ${b.nom} » : ${moved.join(' ')}.`, 'good');
    return ok();
  }
  buyMissing(bid) {
    const s = this.s, b = s.buildings.find((x) => x.id === bid), B = BUILDINGS[b.type];
    let spent = 0; const got = []; const none = [];
    for (const [kind, need] of [['docs', B.docs], ['mats', B.mats]]) {
      for (const [id, q] of Object.entries(need)) {
        const missing = q - (b[kind][id] || 0) - (s.inv[id] || 0);
        if (missing <= 0) continue;
        const r = this.m.buy('player', id, missing);
        spent += r.spent;
        if (r.n) got.push(`${def(id).emoji}${r.n}`);
        if (r.n < missing) none.push(def(id).nom);
      }
    }
    this.m.dirty = true;
    if (got.length) log(s, `Achats pour le chantier : ${got.join(' ')} (−${fmt(spent)}).`);
    if (none.length) {
      // commande auprès des producteurs : livrée sur le chantier dès qu'ils en auront fabriqué
      s.orders = s.orders || {};
      const o = (s.orders[bid] = s.orders[bid] || {});
      for (const [kind, need] of [['docs', B.docs], ['mats', B.mats]]) for (const [id, q] of Object.entries(need)) {
        const missing = q - (b[kind][id] || 0) - (s.inv[id] || 0);
        if (missing > 0) o[id] = missing;
      }
      log(s, `📦 Commande passée pour : ${none.join(', ')}. Les producteurs vont en fabriquer davantage ; livraison sur le chantier dès que possible.`, 'warn');
    }
    return this.deliver(bid);
  }
  deliverOrders() {
    const s = this.s;
    for (const [bid, o] of Object.entries(s.orders || {})) {
      const b = s.buildings.find((x) => x.id === bid);
      if (!b || b.stage !== 'chantier') { delete s.orders[bid]; continue; }
      const B = BUILDINGS[b.type], got = [];
      for (const [id, q] of Object.entries(o)) {
        const r = this.m.buy('player', id, q);
        if (!r.n) continue;
        s.inv[id] -= r.n; if (s.inv[id] <= 0) delete s.inv[id];
        const kind = B.docs[id] ? 'docs' : 'mats';
        b[kind][id] = (b[kind][id] || 0) + r.n;
        o[id] -= r.n; if (o[id] <= 0) delete o[id];
        got.push(`${def(id).emoji}${r.n} (−${fmt(r.spent)})`);
      }
      if (got.length) log(s, `🚚 Commande livrée sur « ${b.nom} » : ${got.join(' ')}.`, 'good');
      if (!Object.keys(o).length) delete s.orders[bid];
    }
  }
  stepReady(b, step) {
    const B = BUILDINGS[b.type];
    if (b.stage !== 'chantier') return 'Ce bâtiment n’est pas en chantier.';
    const missDocs = Object.entries(B.docs).filter(([id, q]) => (b.docs[id] || 0) < q);
    const missMats = Object.entries(B.mats).filter(([id, q]) => (b.mats[id] || 0) < q);
    if (missDocs.length) return 'Livrez d’abord tous les documents.';
    if (missMats.length && step !== 'validation') return 'Livrez d’abord tous les matériaux.';
    if (b.steps[step]) return 'Étape déjà faite.';
    const i = BUILD_STEPS.indexOf(step);
    if (i > 0 && !b.steps[BUILD_STEPS[i - 1]]) return `Il faut d’abord : ${BUILD_STEPS[i - 1]}.`;
    return null;
  }
  // Faire soi-même une étape si l'on a le métier
  doStep(bid, step) {
    const s = this.s, b = s.buildings.find((x) => x.id === bid);
    const svc = Object.values(SERVICES).find((x) => x.step === step);
    if (!s.job || !svc.jobs.includes(s.job)) return fail('Ce n’est pas votre métier.');
    const why = this.stepReady(b, step);
    if (why) return fail(why);
    this.advance(svc.min);
    this.applyEff({ energie: -18, faim: -6, soif: -8 });
    b.steps[step] = true;
    log(s, `🧱 Vous avez fait vous-même : ${svc.nom} sur « ${b.nom} ».`, 'good');
    this.gainXp(1);
    this.checkBuilt(b);
    return ok();
  }
  checkBuilt(b) {
    if (BUILD_STEPS.every((st) => b.steps[st])) {
      b.stage = 'actif';
      this.world.updateBuildings?.(this.s.buildings);
      log(this.s, `🎉 « ${b.nom} » est construit ! Faites installer des machines par un électricien et embauchez du personnel.`, 'good');
    }
  }
  hireCandidates(b) {
    // habitants qui pourraient travailler ici : ceux dont le métier utilise une machine installée, ou le commerce pour une boutique
    const jobs = new Set();
    for (const r of RECIPES) if (r.machine && b.machines.includes(r.machine)) r.jobs.forEach((j) => jobs.add(j));
    if (BUILDINGS[b.type].shop) ['commerce.vendeur', 'commerce.responsable_de_magasin', 'commerce.marchandiseur'].forEach((j) => jobs.add(j));
    if (b.type === 'atelier') for (const r of RECIPES) if (!r.machine && !r.home && r.jobs[0] !== '*' && ['artisanat', 'textile', 'agroalim'].includes(JOBS[r.jobs[0]]?.sector)) r.jobs.forEach((j) => jobs.add(j));
    const machineJobs = new Set(RECIPES.filter((r) => r.machine && b.machines.includes(r.machine)).flatMap((r) => r.jobs));
    // les candidats sont de nouvelles personnes formées au métier (le bot du métier reste sur le marché)
    const d = day(this.s.time);
    return [...jobs].sort((x, y) => (machineJobs.has(y) ? 1 : 0) - (machineJobs.has(x) ? 1 : 0)).slice(0, 30).map((job, i) => ({
      id: `w${d}-${i}-${job}`, nom: `${NAMES[(d * 7 + i * 13) % NAMES.length]} ${['Arden', 'Voss', 'Calder', 'Morrow', 'Lune', 'Ferro', 'Silva', 'Vega', 'Stone', 'Hale'][(d + i) % 10]}`, job }));
  }
  hire(bid, cid) {
    const s = this.s, b = s.buildings.find((x) => x.id === bid);
    const c = this.hireCandidates(b).find((x) => x.id === cid);
    if (!c) return fail('Candidat introuvable.');
    if (b.employees.length >= BUILDINGS[b.type].workers) return fail('Plus de poste disponible.');
    if (!has(s, 'contrat_travail')) return fail('Il faut un contrat de travail (fait par les ressources humaines, au Comptoir).');
    removeItem(s, 'contrat_travail');
    b.staff = b.staff || {};
    b.staff[cid] = { nom: c.nom, job: c.job };
    b.employees.push(cid);
    const rec = (RECIPES_BY_JOB[c.job] || []).find((r) => !r.machine || b.machines.includes(r.machine));
    if (rec) b.prod[cid] = rec.idx;
    this.m.dirty = true;
    log(s, `🤝 ${c.nom} (${JOBS[c.job].nom.toLowerCase()}) travaille désormais pour vous : ${fmt(this.wageOf(c))} par jour.`, 'good');
    return ok();
  }
  fire(bid, cid) {
    const b = this.s.buildings.find((x) => x.id === bid), c = this.worker(b, cid);
    b.employees = b.employees.filter((x) => x !== cid); delete b.prod[cid];
    if (b.staff) delete b.staff[cid];
    this.m.dirty = true;
    log(this.s, `${c?.nom} a quitté « ${b.nom} ».`);
    return ok();
  }
  wageOf(c) { return Math.round(JOBS[c.job].salaire * 1.6); }
  worker(b, cid) { return b.staff?.[cid] || this.m.citizen(cid); }
  setProd(bid, cid, idx) { const b = this.s.buildings.find((x) => x.id === bid); b.prod[cid] = Number(idx); return ok(); }
  takeFromBuilding(bid, id, n) {
    const b = this.s.buildings.find((x) => x.id === bid);
    n = Math.min(n, b.stock[id] || 0);
    if (!n) return fail('Rien à prendre.');
    b.stock[id] -= n; if (!b.stock[id]) delete b.stock[id];
    addItem(this.s, id, n);
    return ok();
  }
  putInBuilding(bid, id, n) {
    const b = this.s.buildings.find((x) => x.id === bid);
    if (!removeItem(this.s, id, n)) return fail('Quantité insuffisante.');
    b.stock[id] = (b.stock[id] || 0) + n;
    return ok();
  }
  setBuildingSale(bid, id, price) {
    const b = this.s.buildings.find((x) => x.id === bid);
    if (price <= 0) delete b.sell[id]; else b.sell[id] = Math.round(price * 10) / 10;
    this.m.dirty = true;
    return ok();
  }
  buildingDay(b) {
    const s = this.s;
    const lines = [];
    // paie hebdomadaire : fiches de paie obligatoires
    if (b.employees.length && s.time > b.paidUntil) {
      if (has(s, 'fiches_paie')) { removeItem(s, 'fiches_paie'); b.paidUntil = s.time + 7 * 1440; b.strike = false; }
      else { b.strike = true; }
    }
    let wages = 0, produced = 0;
    const optim = b.optimUntil > s.time;
    for (const cid of [...b.employees]) {
      const c = this.worker(b, cid);
      if (!c) continue;
      const w = this.wageOf(c);
      wages += w;
      this.forcePay(w, `salaire de ${c.nom}`);
      this.s.eco.budget += w * 0.2;        // cotisations sociales
      if (b.strike) continue;
      const r = RECIPES[b.prod[cid]];
      if (!r) continue;
      if (r.machine && !b.machines.includes(r.machine)) continue;
      for (let batch = 0; batch < 2; batch++) {
        // matières : d'abord le stock du bâtiment, sinon achat automatique aux producteurs
        let okk = true;
        for (const [id, q] of Object.entries(r.in)) {
          const have = b.stock[id] || 0;
          if (have < q && b.autoBuy) { const got = this.m.buy('player', id, q - have); if (got.n) { s.inv[id] -= got.n; if (s.inv[id] <= 0) delete s.inv[id]; b.stock[id] = have + got.n; } }
          if ((b.stock[id] || 0) < q) { okk = false; break; }
        }
        if (!okk) { b.lack = Object.keys(r.in).find((id) => (b.stock[id] || 0) < r.in[id]); break; }
        for (const [id, q] of Object.entries(r.in)) { b.stock[id] -= q; if (!b.stock[id]) delete b.stock[id]; }
        let mult = (b.wear || 0) > 40 ? 0.5 : 1;
        if (b.machines.includes('robot_industriel')) mult *= 1.5;
        if (optim) mult *= 1.3;
        for (const [id, q] of Object.entries(r.out)) {
          const n = Math.max(1, Math.round(q * mult));
          b.stock[id] = (b.stock[id] || 0) + n; produced += n;
          if (b.sell[id] === undefined) b.sell[id] = Math.round(this.m.refPrice(id) * 10) / 10;
        }
        if (r.machine) b.wear = (b.wear || 0) + 1;
      }
    }
    if (b.employees.length) lines.push(`« ${b.nom} » : salaires −${wages} ₵, ${produced} produits${b.strike ? ' (GRÈVE : il manque les fiches de paie)' : ''}${b.lack && !produced ? ` (manque ${def(b.lack).nom.toLowerCase()})` : ''}`);
    if (b.revenue) { lines.push(`ventes +${Math.round(b.revenue)} ₵`); b.revenue = 0; }
    b.rep = clamp((b.rep || 30) - 1, 0, 100);
    this.m.dirty = true;
    return lines.join(', ');
  }

  // ------------------------------------------------------------------ vols et justice
  theftCheck() {
    const s = this.s;
    if (s.theft || s.money < 200) return;
    let chance = 0.03;
    if (s.guardUntil > s.time) chance *= 0.2;
    const police = s.eco.citizens.filter((c) => c.job === 'securite.policier' || c.job === 'securite.gendarme').length;
    chance *= police ? 0.8 : 1.5;
    chance /= this.policy().police || 1;
    if (rnd() < chance) {
      const amount = Math.round(Math.min(s.money * 0.25, 600));
      s.money -= amount;
      s.theft = { amount, stage: 'plainte', day: day(s.time) };
      log(s, `🦹 Vous avez été volé : −${fmt(amount)} ! Portez plainte à la caserne (enquête de police).`, 'bad');
    }
    if (s.cyberUntil < s.time && s.buildings.some((b) => b.stage === 'actif') && rnd() < 0.015) {
      const loss = Math.round(Math.min(s.money * 0.1, 400));
      s.money -= loss;
      log(s, `💻 Cyberattaque sur votre entreprise : −${fmt(loss)}. Un ingénieur en cybersécurité peut vous protéger.`, 'bad');
    }
  }
  dropCase() { this.s.theft = null; return ok(); }

  // ------------------------------------------------------------------ bourse
  stockTick(scale) {
    const s = this.s;
    for (const st of STOCKS) {
      const p = s.stockPrices[st.id];
      s.stockPrices[st.id] = Math.max(1, p * Math.exp(gauss() * st.vol * scale + (st.prix - p) / st.prix * 0.02 * scale));
      if (scale >= 1) { (s.stockHist[st.id] = s.stockHist[st.id] || []).push(s.stockPrices[st.id]); if (s.stockHist[st.id].length > 20) s.stockHist[st.id].shift(); }
    }
  }
  buyStock(id, n) {
    if (!this.at('banque')) return fail('À la Banque.');
    if (this.s.brokerUntil < this.s.time) return fail('Il faut passer par un trader (service « ordres de bourse »).');
    const total = Math.round(this.s.stockPrices[id] * n);
    if (!this.pay(total)) return fail(`Pas assez d'argent (${fmt(total)}).`);
    this.s.stocks[id] = (this.s.stocks[id] || 0) + n;
    log(this.s, `📈 Achat de ${n} action(s) ${id} (−${fmt(total)}).`);
    return ok();
  }
  sellStock(id, n) {
    if (!this.at('banque')) return fail('À la Banque.');
    if (this.s.brokerUntil < this.s.time) return fail('Il faut passer par un trader (service « ordres de bourse »).');
    if ((this.s.stocks[id] || 0) < n) return fail('Pas assez d’actions.');
    const total = Math.round(this.s.stockPrices[id] * n);
    this.s.stocks[id] -= n; if (!this.s.stocks[id]) delete this.s.stocks[id];
    this.earn(total);
    log(this.s, `📉 Vente de ${n} action(s) ${id} (+${fmt(total)}).`, 'good');
    return ok();
  }
  deposit(amount, days) {
    if (!this.at('banque')) return fail('À la Banque.');
    if (!this.pay(amount)) return fail('Pas assez d’argent.');
    const rate = (days >= 30 ? 0.2 : 0.04) + (this.s.adviceBonus || 0);
    this.s.adviceBonus = 0;
    this.s.deposits.push({ amount, until: this.s.time + days * 1440, rate });
    log(this.s, `🏦 Placement de ${fmt(amount)} pendant ${days} jours (+${Math.round(rate * 100)} %).`);
    return ok();
  }

  // ------------------------------------------------------------------ mini-jeu
  minigameReward(score) {
    const gain = Math.round(score * 12);
    this.earn(gain);
    this.applyEff({ moral: Math.min(20, score * 2), energie: -6 });
    log(this.s, `🏟️ Tournoi de l’arène : ${score} cibles touchées → +${fmt(gain)}.`, gain > 20 ? 'good' : 'info');
  }
}

installLife(Game);

export { duration, fmt, VALUE, serviceValue, RECIPES_BY_JOB, SERVICES_BY_JOB };
