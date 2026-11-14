// Moteur de la simulation : temps, besoins, climat, santé, métiers, économie.
// Toutes les actions renvoient { ok, msg } et écrivent dans le journal.
import { RESOURCES } from '../data/resources.js';
import { ITEMS } from '../data/items.js';
import { JOBS, SECTOR_BY_ID, ODD_JOB, levelOf, PERMITS } from '../data/jobs.js';
import { PLACES, SITES, PROVIDERS, RECIPES, VEHICLES, HOUSING, GUILDS, STOCKS, NAMES } from '../data/places.js';
import { def, has, addItem, removeItem, wear, log, clamp, fmt, hourOf, day, duration, save } from './state.js';

export const PLACE_BY_ID = Object.fromEntries([...PLACES, ...SITES].map((p) => [p.id, p]));
const rnd = Math.random;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
const ok = (msg) => ({ ok: true, msg });
const fail = (msg) => ({ ok: false, msg });
const STAT_KEYS = ['faim', 'soif', 'hygiene', 'energie', 'sante', 'moral'];
const STAT_NAMES = { faim: 'faim', soif: 'soif', hygiene: 'hygiène', energie: 'sommeil', sante: 'santé', moral: 'moral' };
const COND_NAMES = { blessure: 'Blessure', maladie: 'Maladie', radiation: 'Irradiation' };
export const WEATHER = {
  soleil: { nom: 'Ensoleillé', emoji: '☀️' }, nuageux: { nom: 'Nuageux', emoji: '⛅' }, pluie: { nom: 'Pluie', emoji: '🌧️' },
  orage: { nom: 'Orage', emoji: '⛈️' }, canicule: { nom: 'Canicule', emoji: '🥵' }, vague_froid: { nom: 'Vague de froid', emoji: '🥶' },
};
export const CLIMATES = { tempere: { nom: 'Tempéré', emoji: '🌤️' }, froid: { nom: 'Froid (altitude)', emoji: '❄️' }, chaud: { nom: 'Chaud (basses terres du sud)', emoji: '🏜️' } };
const PROTECT_NAMES = { froid: 'froid', chaud: 'chaleur', pluie: 'pluie' };

export class Game {
  constructor(state, world) {
    this.s = state;
    this.world = world;      // heightAt, climateAt, posOf(placeId), distanceTo(placeId)
    this.listeners = [];
  }
  onChange(f) { this.listeners.push(f); }
  changed() { save(this.s); for (const f of this.listeners) f(); }

  // ------------------------------------------------------------------ utilitaires
  place(id) { return PLACE_BY_ID[id]; }
  at(id) { return this.world.distanceTo(id) <= (this.place(id)?.kind ? 90 : 16); }
  hereId() {
    let best = null, bd = Infinity;
    for (const p of [...PLACES, ...SITES]) {
      const d = this.world.distanceTo(p.id);
      if (d < bd) { bd = d; best = p; }
    }
    return best && bd <= (best.kind ? 90 : 16) ? best.id : null;
  }
  jobLevel(id = this.s.job) { return levelOf(this.s.jobXp[id] || 0); }
  guild(id) { return this.s.guild === id; }
  coverage() { return this.s.insurance !== null && this.s.insurance !== undefined ? PROVIDERS.assurance[this.s.insurance].couverture : 0; }
  climateHere() { return this.world.climateAt(this.s.pos.x, this.s.pos.z); }
  homeComfort() {
    const h = this.s.housing && HOUSING[this.s.housing.type];
    if (!h) return 0;
    return h.comfort + this.s.home.reduce((a, id) => a + (def(id)?.comfort || 0), 0);
  }
  homeHasBed() {
    const h = this.s.housing && HOUSING[this.s.housing.type];
    return !!h && (h.bed || this.s.home.some((id) => def(id)?.bed));
  }
  homeHas(flag) { return this.s.home.some((id) => def(id)?.[flag]); }
  atHome() { return !!this.s.housing && this.at('residences'); }

  pay(amount, why) {
    amount = Math.round(amount);
    if (amount <= 0) return true;
    if (this.s.money < amount) return false;
    this.s.money -= amount;
    this.s.stats_total.depense += amount;
    return true;
  }
  forcePay(amount, why) {
    amount = Math.round(amount);
    this.s.money -= amount;
    this.s.stats_total.depense += amount;
    if (this.s.money < 0) log(this.s, `Vous êtes à découvert (${fmt(this.s.money)}) après : ${why}.`, 'bad');
  }
  earn(amount) {
    amount = Math.round(amount);
    this.s.money += amount;
    this.s.stats_total.gagne += amount;
  }
  applyEff(eff, mult = 1) {
    if (!eff) return;
    for (const k of STAT_KEYS) if (eff[k]) this.s.stats[k] = clamp(this.s.stats[k] + eff[k] * mult, 0, 100);
  }
  effText(eff) {
    if (!eff) return '';
    return STAT_KEYS.filter((k) => eff[k]).map((k) => `${eff[k] > 0 ? '+' : ''}${eff[k]} ${STAT_NAMES[k]}`).join(', ');
  }
  addCondition(type) {
    if (this.s.conditions.includes(type)) return;
    this.s.conditions.push(type);
    log(this.s, `⚠️ ${COND_NAMES[type]} ! Il faut vous soigner (médecin, pharmacie ou hôpital).`, 'bad');
  }
  cure(type) {
    if (type === 'tout') { this.s.conditions = []; return; }
    this.s.conditions = this.s.conditions.filter((c) => c !== type);
  }

  // ------------------------------------------------------------------ climat
  climateNeeds(indoor = false) {
    const w = this.s.weather.type, c = this.climateHere();
    const needs = new Set();
    const h = hourOf(this.s.time);
    if (c === 'froid' || w === 'vague_froid') needs.add('froid');
    if ((c === 'chaud' && (w === 'soleil' || w === 'canicule') && h > 9 && h < 19) || (w === 'canicule' && c !== 'froid' && h > 10 && h < 19)) needs.add('chaud');
    if (w === 'pluie' || w === 'orage') needs.add('pluie');
    if (indoor) {
      needs.delete('pluie');
      if (this.atHome()) { if (this.homeHas('climate') && this.s.home.some((id) => def(id)?.climate === 'froid')) needs.delete('froid');
        if (this.s.home.some((id) => def(id)?.climate === 'chaud')) needs.delete('chaud'); }
      else { needs.delete('froid'); needs.delete('chaud'); }
    }
    return [...needs];
  }
  clothingFor(need) { return Object.keys(this.s.inv).find((id) => ITEMS[id]?.protect === need); }

  // ------------------------------------------------------------------ temps qui passe
  advance(minutes, opt = {}) {
    const s = this.s;
    let left = minutes;
    while (left > 0) {
      const step = Math.min(left, 30);
      left -= step;
      const h = step / 60;
      const sleeping = opt.sleep;
      const forme = s.buffs.forme && s.buffs.forme > s.time ? 0.7 : 1;
      const comfortMoral = this.atHome() ? Math.min(this.homeComfort() / 80, 0.8) : 0;
      s.stats.faim -= (sleeping ? 2 : 4) * h;
      s.stats.soif -= (sleeping ? 3 : 6) * h;
      s.stats.hygiene -= (sleeping ? 1 : 2.5) * h;
      s.stats.moral -= (1.2 - comfortMoral) * h;
      if (sleeping) s.stats.energie += 11 * (opt.quality || 1) * h;
      else s.stats.energie -= 4 * forme * h;

      // climat
      for (const need of this.climateNeeds(opt.indoor)) {
        const cloth = this.clothingFor(need);
        if (cloth) wear(s, cloth, h);
        else {
          const k = need === 'pluie' ? 0.45 : 1;
          s.stats.sante -= 2 * k * h; s.stats.moral -= 2 * k * h; s.stats.energie -= 1 * k * h;
          if (need !== 'chaud' && rnd() < 0.012 * h * 2) this.addCondition('maladie');
          if (!this._climateWarned || s.time - this._climateWarned > 240) {
            this._climateWarned = s.time;
            log(s, `🥶 Vous n'êtes pas équipé contre ${PROTECT_NAMES[need]} : santé et moral baissent. Achetez un vêtement adapté.`, 'warn');
          }
        }
      }
      // manque grave
      if (s.stats.faim <= 0) s.stats.sante -= 5 * h;
      if (s.stats.soif <= 0) s.stats.sante -= 7 * h;
      if (s.stats.energie <= 0) { s.stats.sante -= 3 * h; s.stats.moral -= 2 * h; }
      if (s.stats.hygiene < 20) { s.stats.moral -= 1 * h; if (rnd() < 0.02 * h) this.addCondition('maladie'); }
      // problèmes de santé
      for (const c of s.conditions) {
        if (c === 'blessure') { s.stats.sante -= 1.5 * h; s.stats.energie -= 0.5 * h; }
        if (c === 'maladie') { s.stats.sante -= 1 * h; s.stats.moral -= 1 * h; }
        if (c === 'radiation') s.stats.sante -= 2.5 * h;
      }
      for (const k of STAT_KEYS) s.stats[k] = clamp(s.stats[k], 0, 100);

      const before = s.time;
      s.time += step;
      // météo toutes les 3 heures
      if (s.time >= s.weather.until) this.rollWeather();
      // bourse : petites variations à chaque heure
      if (Math.floor(s.time / 60) !== Math.floor(before / 60)) this.stockTick(0.25);
      // location de véhicules terminée
      for (const [id, v] of Object.entries(s.vehicles)) {
        if (v.rentedUntil && s.time >= v.rentedUntil) {
          delete s.vehicles[id];
          if (s.transport === id) s.transport = 'marche';
          log(s, `${VEHICLES[id].emoji} La location de votre ${VEHICLES[id].nom.toLowerCase()} est terminée.`, 'warn');
        }
      }
      // nouveau jour
      if (day(s.time) !== day(before)) this.dailyTick();
      if (s.stats.sante <= 0 && !opt.noFaint) { this.faint(); break; }
    }
    this.lowStatWarnings();
  }
  lowStatWarnings() {
    const s = this.s;
    s._warned = s._warned || {};
    for (const k of ['faim', 'soif', 'energie', 'hygiene']) {
      if (s.stats[k] < 20 && !s._warned[k]) {
        s._warned[k] = true;
        const tip = { faim: 'mangez quelque chose (marché, restaurant)', soif: 'buvez (marché)', energie: 'dormez (hôtel ou chez vous)', hygiene: 'lavez-vous (bains publics)' }[k];
        const lab = { faim: 'Faim', soif: 'Soif', energie: 'Énergie', hygiene: 'Hygiène' }[k];
        log(s, `⚠️ ${lab} très basse : ${tip}.`, 'warn');
      }
      if (s.stats[k] > 35) s._warned[k] = false;
    }
  }
  rollWeather() {
    const s = this.s, r = rnd();
    let type = 'soleil';
    if (r < 0.42) type = 'soleil'; else if (r < 0.66) type = 'nuageux'; else if (r < 0.86) type = 'pluie'; else if (r < 0.92) type = 'orage';
    else if (r < 0.96) type = 'canicule'; else type = 'vague_froid';
    if (type !== s.weather.type && (type === 'canicule' || type === 'vague_froid' || type === 'orage')) log(s, `${WEATHER[type].emoji} Météo : ${WEATHER[type].nom.toLowerCase()} !`, 'warn');
    s.weather = { type, until: s.time + 180 };
  }
  faint() {
    const s = this.s;
    const bill = 400 * (1 - this.coverage());
    log(s, `💫 Vous vous êtes évanoui ! Transporté à l'hôpital : facture ${fmt(bill)}${this.coverage() ? ' (après assurance)' : ''}.`, 'bad');
    this.forcePay(bill, 'hospitalisation d’urgence');
    s.conditions = [];
    s.stats.sante = 45; s.stats.energie = Math.max(s.stats.energie, 50); s.stats.faim = Math.max(s.stats.faim, 40);
    s.stats.soif = Math.max(s.stats.soif, 45); s.stats.moral = clamp(s.stats.moral - 15, 0, 100);
    s.time += 360;
    this.world.teleport('hopital');
  }

  dailyTick() {
    const s = this.s;
    const lines = [];
    // logement
    if (s.housing?.type === 'location') { this.forcePay(HOUSING.location.loyer, 'loyer'); lines.push(`loyer −${HOUSING.location.loyer} ₵`); }
    // assurance
    if (s.insurance !== null && s.insurance !== undefined) {
      const p = PROVIDERS.assurance[s.insurance];
      this.forcePay(p.prime, 'assurance'); lines.push(`assurance −${p.prime} ₵`);
    }
    // guilde
    if (s.guild) { const g = GUILDS.find((x) => x.id === s.guild); this.forcePay(g.cotisation, 'cotisation de guilde'); lines.push(`guilde −${g.cotisation} ₵`); }
    if (s.privateCity) s.stats.moral = clamp(s.stats.moral + 2, 0, 100);
    // famille
    const f = s.family;
    if (f.children.length) {
      const cost = 45 * f.children.length;
      this.forcePay(cost, 'dépenses pour les enfants'); lines.push(`enfants −${cost} ₵`);
      s.stats.moral = clamp(s.stats.moral + 3 * f.children.length, 0, 100);
    }
    if (f.partner) {
      if (f.married) s.stats.moral = clamp(s.stats.moral + 3, 0, 100);
      else f.partner.love = clamp(f.partner.love - 2, 0, 100);
    }
    // entreprise
    if (s.company) lines.push(this.companyDay());
    // placements
    for (const d of [...s.deposits]) {
      if (s.time >= d.until) {
        const gain = Math.round(d.amount * (1 + d.rate));
        this.earn(gain);
        s.deposits.splice(s.deposits.indexOf(d), 1);
        log(s, `🏦 Votre placement arrive à échéance : +${fmt(gain)}.`, 'good');
      }
    }
    // marchés
    for (const id in s.prices) s.prices[id] = clamp(s.prices[id] + (1 - s.prices[id]) * 0.15 + gauss() * 0.07, 0.4, 3);
    this.stockTick(1);
    if (lines.length) log(s, `🌅 Jour ${day(s.time)} : ${lines.join(' · ')}.`, 'info');
  }

  // ------------------------------------------------------------------ objets
  priceOf(id, placeId) {
    const d = def(id);
    let p = d.prix;
    if (this.guild('artisans') && (d.cat === 'outil' || d.cat === 'equipement')) p *= 0.9;
    if (d.cat === 'medicament') { p *= 1 - this.coverage() * 0.5; if (this.guild('soigneurs')) p *= 0.8; }
    return Math.max(1, Math.round(p));
  }
  buy(id, placeId, n = 1) {
    const d = def(id);
    const price = this.priceOf(id, placeId) * n;
    if (!this.at(placeId)) return fail('Vous devez être sur place.');
    if (!this.pay(price)) return fail(`Pas assez d'argent (${fmt(price)}).`);
    addItem(this.s, id, n);
    log(this.s, `Achat : ${d.emoji} ${d.nom}${n > 1 ? ` ×${n}` : ''} (−${fmt(price)}).`);
    return ok();
  }
  use(id) {
    const s = this.s, d = def(id);
    if (!d || !has(s, id)) return fail('Objet absent.');
    if (d.id === 'manuel' || d.id === 'encyclopedie') {
      if (!s.job) return fail('Il faut un métier pour progresser avec un livre.');
      const xp = d.id === 'manuel' ? 3 : 8;
      removeItem(s, id); this.advance(d.id === 'manuel' ? 120 : 240);
      return this.gainXp(xp, `📘 Lecture terminée : +${xp} d'expérience en ${JOBS[s.job].nom}.`);
    }
    if (d.needs && !has(s, d.needs)) return fail(`Il faut une ${def(d.needs).nom.toLowerCase()} (consultez un médecin).`);
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

  // ------------------------------------------------------------------ services
  providerPrice(svc, provIdx) {
    let p = svc.prix;
    if (svc.prov && provIdx !== undefined) p *= PROVIDERS[svc.prov][provIdx].mult;
    if (svc.health) { p *= 1 - this.coverage(); if (this.guild('soigneurs')) p *= 0.8; }
    return Math.round(p);
  }
  service(placeId, svcId, provIdx) {
    const s = this.s, place = this.place(placeId);
    const svc = place.services.find((x) => x.id === svcId);
    if (!this.at(placeId)) return fail('Vous devez être sur place.');
    const n = svc.needs || {};
    if (n.item && !has(s, n.item)) return fail(`Il faut : ${def(n.item).emoji} ${def(n.item).nom}.`);
    if (n.pass && !this.hasPass(n.pass)) return fail('Il faut un pass pour accéder à ce lieu.');
    const price = this.providerPrice(svc, provIdx);
    if (svc.special === 'ad' && !s.company) return fail('Vous n’avez pas d’entreprise.');
    if (!this.pay(price)) return fail(`Pas assez d'argent (${fmt(price)}).`);
    s.stats_total.services++;
    const prov = svc.prov && provIdx !== undefined ? PROVIDERS[svc.prov][provIdx] : null;
    const q = prov ? 0.7 + (prov.note - 3.5) * 0.35 : 1;
    let msg = `${svc.nom}${prov ? ` (${prov.nom})` : ''} : −${fmt(price)}.`;
    switch (svc.special) {
      case 'sleep': return this.sleep(svc.min, svc.quality, price, svc.eff, svc.nom);
      case 'hospital':
        this.advance(svc.min, { indoor: true, noFaint: true });
        s.conditions = []; s.stats.sante = 100; s.stats.energie = clamp(s.stats.energie + 30, 0, 100);
        log(s, `🏥 ${msg} Vous êtes complètement soigné.`, 'good'); return ok();
      case 'consult': {
        this.advance(svc.min, { indoor: true, noFaint: true });
        const found = [];
        if (s.conditions.includes('blessure')) { this.cure('blessure'); found.push('blessure soignée'); }
        if (s.conditions.includes('maladie') || s.conditions.includes('radiation')) { addItem(s, 'ordonnance', 1); found.push('ordonnance pour la pharmacie'); }
        this.applyEff({ sante: 6 * q, moral: 3 });
        log(s, `🩺 ${msg} ${found.length ? found.join(', ') : 'Vous êtes en bonne santé'}.`, 'good'); return ok();
      }
      case 'pass': s.passes[svc.pass] = Math.max(s.passes[svc.pass] || 0, s.time) + svc.days * 1440; log(s, `🎫 ${msg}`, 'good'); return ok();
      case 'ad': s.company.rep = clamp(s.company.rep + 15, 0, 100); this.advance(svc.min); log(s, `📣 ${msg} Réputation de ${s.company.nom} : ${Math.round(s.company.rep)}.`, 'good'); return ok();
      case 'sellboost': s.buffs.sellboost = s.time + 1440; this.advance(svc.min); log(s, `📣 ${msg} Vos ventes rapportent +15 % pendant 24 h.`, 'good'); return ok();
      case 'meet': this.advance(svc.min); return this.meet(msg);
      case 'minigame': return ok('minigame');
      default: break;
    }
    this.advance(svc.min, { indoor: true });
    let eff = { ...(svc.eff || {}) };
    if (prov) for (const k in eff) if (eff[k] > 0) eff[k] = Math.round(eff[k] * q);
    if (svc.bonus && has(s, svc.bonus.item)) {
      removeItem(s, svc.bonus.item);
      for (const [k, v] of Object.entries(svc.bonus.eff)) eff[k] = (eff[k] || 0) + v;
      msg += ` (avec ${def(svc.bonus.item).nom.toLowerCase()})`;
    }
    this.applyEff(eff);
    if (svc.cure) this.cure(svc.cure);
    if (svc.buff) for (const [b, hh] of Object.entries(svc.buff)) s.buffs[b] = s.time + hh * 60;
    log(s, `${place.emoji} ${msg} ${this.effText(eff)}`, 'good');
    return ok();
  }
  hasPass(p) {
    if (p === 'club' && this.s.privateCity) return true;
    const v = this.s.passes[p];
    return v === true || (typeof v === 'number' && v > this.s.time);
  }
  sleep(min, quality, price, eff, label) {
    const s = this.s;
    const startE = s.stats.energie;
    this.advance(min, { sleep: true, quality, indoor: label !== 'dehors' });
    if (eff) this.applyEff(eff);
    if (label === 'dehors') { s.stats.moral = clamp(s.stats.moral - 8, 0, 100); }
    log(s, `😴 ${label === 'dehors' ? 'Nuit à la belle étoile' : label}${price ? ` (−${fmt(price)})` : ''} : sommeil ${Math.round(startE)} → ${Math.round(s.stats.energie)}.`, 'good');
    return ok();
  }
  sleepHome() {
    if (!this.atHome()) return fail('Il faut être chez vous (Résidences).');
    const bed = this.homeHasBed();
    let quality = bed ? 0.75 + Math.min(this.homeComfort(), 60) / 100 : 0.55;
    const w = this.s.weather.type;
    if ((w === 'canicule' && !this.s.home.some((id) => def(id)?.climate === 'chaud')) || (w === 'vague_froid' && !this.s.home.some((id) => def(id)?.climate === 'froid'))) {
      quality *= 0.7; log(this.s, 'La température gêne votre sommeil (pensez au chauffage / à la climatisation).', 'warn');
    }
    return this.sleep(480, quality, 0, { moral: Math.round(this.homeComfort() / 8) }, bed ? 'Nuit chez vous' : 'Nuit chez vous, sans lit');
  }
  sleepOutside() { return this.sleep(480, 0.45, 0, null, 'dehors'); }

  // ------------------------------------------------------------------ métiers
  currentJob() { return this.s.job ? JOBS[this.s.job] : null; }
  missingFor(job) {
    const s = this.s;
    return {
      outils: (job.outils || []).filter((id) => !has(s, id)),
      equip: (job.equip || []).filter((id) => !has(s, id)),
      permis: job.permis && !s.permits.includes(job.permis) ? job.permis : null,
    };
  }
  work(odd = false) {
    const s = this.s;
    const job = odd ? ODD_JOB : this.currentJob();
    if (!job) return fail('Vous n’avez pas de métier. Formez-vous à l’Académie ou faites des petits boulots à l’Agence pour l’emploi.');
    if (!this.at(job.place)) return fail(`Votre lieu de travail est : ${this.place(job.place).nom}.`);
    if (s.stats.energie < 15) return fail('Vous êtes trop fatigué pour travailler. Dormez d’abord.');
    const miss = this.missingFor(job);
    if (miss.outils.length) return fail(`Outils manquants : ${miss.outils.map((i) => def(i).nom).join(', ')} (quincaillerie).`);
    if (miss.permis) return fail(`Il faut le document : ${PERMITS[miss.permis].nom} (Académie).`);
    const lvl = odd ? 1 : this.jobLevel();
    let pay = job.salaire * (1 + 0.15 * (lvl - 1));
    if (s.stats.moral < 20) pay *= 0.8;
    if (miss.equip.length) pay *= 0.9;
    this.advance(240);
    this.applyEff({ energie: -16, faim: -5, soif: -6, hygiene: -6, moral: s.stats.moral > 60 ? -2 : 1 });
    for (const t of job.outils || []) wear(s, t, 1);
    for (const t of job.equip || []) if (has(s, t)) wear(s, t, 1);
    this.earn(pay);
    const parts = [`+${fmt(pay)}`];
    // production
    if (job.prod) {
      let mult = 1 + 0.08 * (lvl - 1);
      if (job.conso) for (const [r, q] of Object.entries(job.conso)) { if (has(s, r, q)) removeItem(s, r, q); else mult *= 0.5; }
      if (job.bonus) for (const [r] of Object.entries(job.bonus)) if (has(s, r)) { removeItem(s, r, 1); mult *= 1.5; }
      const got = [];
      for (const [r, q] of Object.entries(job.prod)) {
        let n = q * mult; n = Math.floor(n) + (rnd() < n % 1 ? 1 : 0);
        if (n > 0) { addItem(s, r, n); got.push(`${def(r).emoji}${n}`); }
      }
      if (got.length) parts.push(got.join(' '));
    }
    // accident
    const risk = (job.risque || 0) * (miss.equip.length ? 3 : 1);
    if (rnd() < risk) this.addCondition('blessure');
    if (miss.equip.length) parts.push(`sans ${miss.equip.map((i) => def(i).nom.toLowerCase()).join(', ')} : −10 % et risque ×3`);
    log(s, `💼 Service de 4 h (${job.nom}) : ${parts.join(' · ')}.`, 'good');
    if (!odd) return this.gainXp(1);
    return ok();
  }
  gainXp(n, msg) {
    const s = this.s;
    const before = this.jobLevel();
    s.jobXp[s.job] = (s.jobXp[s.job] || 0) + n;
    if (msg) log(s, msg, 'good');
    const after = this.jobLevel();
    if (after > before) log(s, `⭐ Niveau ${after} en ${JOBS[s.job].nom} ! Salaire +${Math.round(15 * (after - 1))} %.`, 'good');
    return ok();
  }
  trainJob(jobId, provIdx = 0) {
    const s = this.s, job = JOBS[jobId], prov = PROVIDERS.formateur[provIdx];
    if (!this.at('ecole')) return fail('Les formations ont lieu à l’Académie.');
    if (s.diplomas.includes(jobId)) return fail('Vous avez déjà ce diplôme.');
    const price = Math.round(job.formation * prov.mult);
    if (!this.pay(price)) return fail(`Pas assez d'argent (${fmt(price)}).`);
    this.advance(job.heures * 60 * (prov.slow || 1), { indoor: true });
    s.diplomas.push(jobId);
    log(s, `🎓 Diplôme obtenu : ${job.nom} (${prov.nom}, −${fmt(price)}). Vous pouvez prendre ce métier.`, 'good');
    return ok();
  }
  takeJob(jobId) {
    const s = this.s;
    if (!s.diplomas.includes(jobId)) return fail('Il faut d’abord le diplôme.');
    s.job = jobId;
    const j = JOBS[jobId];
    const miss = this.missingFor(j);
    log(s, `💼 Nouveau métier : ${j.nom}. Lieu de travail : ${this.place(j.place).nom}.${miss.outils.length || miss.equip.length ? ` À prévoir : ${[...miss.outils, ...miss.equip].map((i) => def(i).nom).join(', ')}.` : ''}`, 'good');
    return ok();
  }
  quitJob() { if (!this.s.job) return fail('Aucun métier.'); log(this.s, `Vous avez quitté votre poste de ${JOBS[this.s.job].nom}.`); this.s.job = null; return ok(); }
  buyPermit(id, provIdx = 0) {
    const s = this.s, p = PERMITS[id], prov = PROVIDERS.formateur[provIdx];
    if (!this.at('ecole')) return fail('À l’Académie uniquement.');
    if (s.permits.includes(id)) return fail('Déjà obtenu.');
    const price = Math.round(p.prix * prov.mult);
    if (!this.pay(price)) return fail(`Pas assez d'argent (${fmt(price)}).`);
    this.advance(p.heures * 60 * (prov.slow || 1), { indoor: true });
    s.permits.push(id);
    log(s, `${p.emoji} ${p.nom} obtenu (−${fmt(price)}).`, 'good');
    return ok();
  }
  internship() {
    if (!this.s.job) return fail('Il faut un métier.');
    if (!this.at('ecole')) return fail('À l’Académie uniquement.');
    if (!this.pay(400)) return fail('Pas assez d’argent (400 ₵).');
    this.advance(480, { indoor: true });
    this.applyEff({ energie: -15, moral: 5 });
    return this.gainXp(6, `🧑‍🏫 Stage terminé : +6 d'expérience en ${JOBS[this.s.job].nom}.`);
  }

  // ------------------------------------------------------------------ récolte
  gather(siteId, gId) {
    const s = this.s, site = this.place(siteId), g = site.gather.find((x) => x.id === gId);
    if (!this.at(siteId)) return fail('Vous devez être sur le site.');
    if (site.pass && !this.hasPass(site.pass)) return fail('Zone de haut niveau : achetez le pass à l’Hôtel de ville.');
    if (g.tool && !has(s, g.tool)) return fail(`Il faut : ${def(g.tool).emoji} ${def(g.tool).nom}.`);
    if (g.permit && !s.permits.includes(g.permit)) return fail(`Il faut : ${PERMITS[g.permit].nom}.`);
    if (s.stats.energie < g.energie) return fail('Trop fatigué.');
    const missEquip = (g.equip || []).filter((e) => !has(s, e));
    if (g.rad && missEquip.includes('combi_antirad')) return fail('Sans combinaison anti-radiation, c’est mortel. Équipez-vous d’abord.');
    this.advance(g.min);
    this.applyEff({ energie: -g.energie, hygiene: -10, faim: -4, soif: -5 });
    if (g.tool) wear(s, g.tool, 1);
    for (const e of g.equip || []) if (has(s, e)) wear(s, e, 1);
    let rolls = g.rolls;
    if (this.guild('explorateurs')) rolls *= 1.25;
    const job = this.currentJob();
    if (job && (job.gatherBonus === siteId || (job.sector === 'agri' && site.kind === 'ferme') || (job.id === 'agri.bucheron' && site.kind === 'foret')))
      rolls *= 1.4 + 0.05 * this.jobLevel();
    rolls = Math.floor(rolls) + (rnd() < rolls % 1 ? 1 : 0);
    const total = g.loot.reduce((a, l) => a + l[1], 0);
    const got = {};
    for (let i = 0; i < rolls; i++) {
      let r = rnd() * total;
      for (const [id, w, a, b] of g.loot) { r -= w; if (r <= 0) { got[id] = (got[id] || 0) + a + Math.floor(rnd() * (b - a + 1)); break; } }
    }
    for (const [id, n] of Object.entries(got)) addItem(s, id, n);
    if (rnd() < (g.risque || 0) * (missEquip.length ? 3 : 1)) this.addCondition('blessure');
    if (g.rad && rnd() < 0.08) this.addCondition('radiation');
    const txt = Object.entries(got).map(([id, n]) => `${def(id).emoji} ${def(id).nom} ×${n}`).join(', ');
    log(s, `${site.emoji} ${g.nom} : ${txt || 'rien trouvé'}.${missEquip.length ? ` (Sans ${missEquip.map((e) => def(e).nom.toLowerCase()).join(', ')} : plus risqué.)` : ''}`, 'good');
    return ok();
  }

  // ------------------------------------------------------------------ fabrication
  recipesAt(placeId) { return RECIPES.filter((r) => r.place === placeId); }
  canCraft(r) {
    const s = this.s;
    if (r.job && s.job !== r.job) return `Réservé au métier : ${JOBS[r.job].nom}`;
    if (r.sector && (!s.job || JOBS[s.job].sector !== r.sector)) return `Réservé au secteur : ${SECTOR_BY_ID[r.sector].nom}`;
    if (r.needs && !this.homeHas('cooking')) return 'Il faut une cuisine équipée chez vous';
    for (const [id, q] of Object.entries(r.in)) if (!has(s, id, q)) return 'Ressources insuffisantes';
    return null;
  }
  craft(idx) {
    const r = RECIPES[idx], s = this.s;
    if (r.place === 'home' ? !this.atHome() : !this.at(r.place)) return fail('Pas au bon endroit.');
    const why = this.canCraft(r);
    if (why) return fail(why);
    for (const [id, q] of Object.entries(r.in)) removeItem(s, id, q);
    let n = r.out[1];
    if (this.guild('artisans') && n >= 2) n += 1;
    this.advance(r.min, { indoor: true });
    addItem(s, r.out[0], n);
    log(s, `🛠️ Fabriqué : ${def(r.out[0]).emoji} ${def(r.out[0]).nom} ×${n}.`, 'good');
    return ok();
  }

  // ------------------------------------------------------------------ marché des ressources
  marketBuyPrice(id) { return Math.max(1, Math.round(RESOURCES[id].prix * this.s.prices[id] * 1.15)); }
  sellPrice(id) {
    const d = def(id);
    let p;
    if (RESOURCES[id]) p = d.prix * this.s.prices[id] * 0.85;
    else if (d.cat === 'fabrique') p = d.prix * 0.75;
    else p = d.prix * 0.4;
    if (this.s.buffs.sellboost > this.s.time) p *= 1.15;
    if (this.guild('marchands') && RESOURCES[id]) p *= 1.1;
    return Math.max(0, Math.round(p));
  }
  marketBuy(id, n = 1) {
    if (!this.at('comptoir')) return fail('Au Comptoir des ressources uniquement.');
    let total = 0;
    for (let i = 0; i < n; i++) { total += this.marketBuyPrice(id); this.s.prices[id] = clamp(this.s.prices[id] * 1.006, 0.4, 3); }
    if (!this.pay(total)) { for (let i = 0; i < n; i++) this.s.prices[id] /= 1.006; return fail(`Pas assez d'argent (${fmt(total)}).`); }
    addItem(this.s, id, n);
    log(this.s, `📦 Achat : ${RESOURCES[id].emoji} ${RESOURCES[id].nom} ×${n} (−${fmt(total)}).`);
    return ok();
  }
  sell(id, n = 1) {
    if (!this.at('comptoir')) return fail('Au Comptoir des ressources uniquement.');
    if (!has(this.s, id, n)) return fail('Quantité insuffisante.');
    let total = 0;
    for (let i = 0; i < n; i++) { total += this.sellPrice(id); if (RESOURCES[id]) this.s.prices[id] = clamp(this.s.prices[id] * 0.994, 0.4, 3); }
    removeItem(this.s, id, n);
    this.earn(total);
    log(this.s, `💰 Vente : ${def(id).emoji} ${def(id).nom} ×${n} (+${fmt(total)}).`, 'good');
    return ok();
  }
  repairCost(id) {
    const d = def(id);
    if (!d?.dur || this.s.dur[id] === undefined) return 0;
    return Math.round(d.prix * 0.6 * (1 - this.s.dur[id] / d.dur));
  }
  repair(id) {
    if (!this.at('quincaillerie')) return fail('À la quincaillerie uniquement.');
    const c = this.repairCost(id);
    if (!c) return fail('Rien à réparer.');
    if (!this.pay(c)) return fail(`Pas assez d'argent (${fmt(c)}).`);
    this.s.dur[id] = def(id).dur;
    this.advance(30);
    log(this.s, `🔧 ${def(id).nom} réparé(e) (−${fmt(c)}).`, 'good');
    return ok();
  }

  // ------------------------------------------------------------------ véhicules et déplacements
  vehicleUsable(id) {
    if (id === 'marche') return null;
    const v = this.s.vehicles[id], d = VEHICLES[id];
    if (!v) return 'Vous n’avez pas ce véhicule';
    if (d.permis && !this.s.permits.includes(d.permis)) return `Il faut : ${PERMITS[d.permis].nom}`;
    if (v.fuel <= 0) return `Plus de ${d.fuelNom.toLowerCase()}`;
    if (v.cond <= 0) return 'En panne : entretien nécessaire';
    return null;
  }
  setTransport(id) {
    const why = this.vehicleUsable(id);
    if (why) return fail(why);
    this.s.transport = id;
    return ok();
  }
  speed() { return VEHICLES[this.s.transport].speed; }
  travelled(dist, mode) {
    const s = this.s;
    if (mode !== 'marche' && s.vehicles[mode]) {
      const v = s.vehicles[mode], d = VEHICLES[mode];
      v.fuel = clamp(v.fuel - dist / 1000 * d.fuel, 0, 100);
      v.cond = clamp(v.cond - dist / 1000 * d.wear, 0, 100);
      if (v.fuel <= 0 || v.cond <= 0) {
        log(s, `${d.emoji} Votre ${d.nom.toLowerCase()} ${v.fuel <= 0 ? `n'a plus de ${d.fuelNom.toLowerCase()}` : 'est en panne'}. Vous continuez à pied.`, 'warn');
        s.transport = 'marche';
      }
    } else if (mode === 'marche') {
      this.applyEff({ energie: -dist / 1000 * 3 });
    }
  }
  buyVehicle(id) {
    const d = VEHICLES[id];
    if (!this.at('garage')) return fail('À la concession uniquement.');
    if (this.s.vehicles[id] && !this.s.vehicles[id].rentedUntil) return fail('Vous en avez déjà un.');
    if (!this.pay(d.prix)) return fail(`Pas assez d'argent (${fmt(d.prix)}).`);
    this.s.vehicles[id] = { fuel: 100, cond: 100 };
    log(this.s, `${d.emoji} Vous avez acheté : ${d.nom} (−${fmt(d.prix)}).${d.permis && !this.s.permits.includes(d.permis) ? ` Attention : il faut le ${PERMITS[d.permis].nom.toLowerCase()} pour l'utiliser.` : ''}`, 'good');
    return ok();
  }
  rentVehicle(id) {
    const d = VEHICLES[id];
    if (!this.at('garage')) return fail('À la concession uniquement.');
    if (this.s.vehicles[id]) return fail('Vous en avez déjà un.');
    if (!this.pay(d.loc)) return fail(`Pas assez d'argent (${fmt(d.loc)}).`);
    this.s.vehicles[id] = { fuel: 100, cond: 100, rentedUntil: this.s.time + 1440 };
    log(this.s, `${d.emoji} ${d.nom} loué(e) pour 24 h (−${fmt(d.loc)}).`, 'good');
    return ok();
  }
  sellVehicle(id) {
    const v = this.s.vehicles[id], d = VEHICLES[id];
    if (!this.at('garage') || !v || v.rentedUntil) return fail('Impossible.');
    const p = Math.round(d.prix * 0.4 * (v.cond / 100));
    delete this.s.vehicles[id];
    if (this.s.transport === id) this.s.transport = 'marche';
    this.earn(p);
    log(this.s, `${d.emoji} ${d.nom} revendu(e) : +${fmt(p)}.`, 'good');
    return ok();
  }
  refuelCost(id) { const v = this.s.vehicles[id]; return v ? Math.round((100 - v.fuel) * VEHICLES[id].fuelPrix) : 0; }
  maintCost(id) { const v = this.s.vehicles[id]; return v ? Math.round((100 - v.cond) * VEHICLES[id].prix * 0.0009) : 0; }
  refuel(id) {
    if (!this.at('garage')) return fail('Au garage uniquement.');
    const c = this.refuelCost(id);
    if (!c) return fail('Déjà plein.');
    if (!this.pay(c)) return fail(`Pas assez d'argent (${fmt(c)}).`);
    this.s.vehicles[id].fuel = 100;
    log(this.s, `⛽ Plein fait (${VEHICLES[id].fuelNom}, −${fmt(c)}).`);
    return ok();
  }
  refuelWithItem(id) {
    const v = this.s.vehicles[id], d = VEHICLES[id];
    if (!v) return fail('Pas de véhicule.');
    if (!has(this.s, d.refill)) return fail(`Il faut : ${def(d.refill).nom}.`);
    removeItem(this.s, d.refill);
    v.fuel = clamp(v.fuel + d.refillPct, 0, 100);
    log(this.s, `${d.emoji} ${def(d.refill).nom} utilisé(e) : ${d.fuelNom} ${Math.round(v.fuel)} %.`);
    return ok();
  }
  maintain(id) {
    if (!this.at('garage')) return fail('Au garage uniquement.');
    const c = this.maintCost(id);
    if (!c) return fail('En parfait état.');
    if (!this.pay(c)) return fail(`Pas assez d'argent (${fmt(c)}).`);
    this.s.vehicles[id].cond = 100;
    this.advance(60);
    log(this.s, `🔧 Entretien de votre ${VEHICLES[id].nom.toLowerCase()} (−${fmt(c)}).`);
    return ok();
  }
  transitPrice(destId, fast) {
    let p = 15 + this.world.distanceBetween(this.hereId(), destId) * 0.02;
    if (fast) p *= 2.6;
    if (this.guild('explorateurs')) p *= 0.8;
    return Math.round(p);
  }
  transit(destId, fast) {
    const from = this.hereId();
    if (!from || !(from === 'gare' || this.place(from).station)) return fail('Il faut être à une gare.');
    const price = this.transitPrice(destId, fast);
    if (!this.pay(price)) return fail(`Pas assez d'argent (${fmt(price)}).`);
    const dist = this.world.distanceBetween(from, destId);
    this.advance(10 + dist / (fast ? 300 : 90), { indoor: true });
    this.world.teleport(destId);
    log(this.s, `${fast ? '🚀 Navette rapide' : '🚆 Train'} vers ${this.place(destId).nom} (−${fmt(price)}).`, 'good');
    return ok();
  }
  teleportPrice(destId, provIdx) {
    return Math.round((60 + this.world.distanceBetween(this.hereId(), destId) * 0.06) * PROVIDERS.teleport[provIdx].mult);
  }
  teleport(destId, provIdx) {
    const from = this.hereId();
    if (!from || !(from === 'portail' || this.place(from).kind)) return fail('Il faut être à un portail.');
    const prov = PROVIDERS.teleport[provIdx];
    const price = this.teleportPrice(destId, provIdx);
    if (!this.pay(price)) return fail(`Pas assez d'argent (${fmt(price)}).`);
    this.advance(5);
    this.world.teleport(destId);
    let extra = '';
    if (prov.risque && rnd() < prov.risque) { this.applyEff({ moral: -10, energie: -12, faim: -10 }); extra = ' Le saut était mal réglé : vous êtes tout secoué !'; }
    log(this.s, `🌀 Téléporté vers ${this.place(destId).nom} par ${prov.nom} (−${fmt(price)}).${extra}`, extra ? 'warn' : 'good');
    return ok();
  }
  tourPrice(destId, provIdx) { return Math.round((150 + this.world.distanceBetween('tourisme', destId) * 0.05) * PROVIDERS.guide[provIdx].mult); }
  tour(destId, provIdx) {
    if (!this.at('tourisme')) return fail('À l’Office de tourisme uniquement.');
    const price = this.tourPrice(destId, provIdx), prov = PROVIDERS.guide[provIdx];
    if (!this.pay(price)) return fail(`Pas assez d'argent (${fmt(price)}).`);
    this.advance(120 + this.world.distanceBetween('tourisme', destId) / 90, { noFaint: true });
    this.world.teleport(destId);
    this.applyEff({ moral: Math.round(30 * (prov.note / 4.5)), energie: -10 });
    log(this.s, `🧭 Voyage guidé à ${this.place(destId).nom} avec ${prov.nom} (−${fmt(price)}). Quelle vue !`, 'good');
    return ok();
  }

  // ------------------------------------------------------------------ logement
  rent() {
    const s = this.s;
    if (!this.at('immobilier')) return fail('À l’agence immobilière.');
    if (s.housing) return fail('Vous avez déjà un logement.');
    const h = HOUSING.location;
    if (!this.pay(h.caution + h.loyer)) return fail(`Il faut ${fmt(h.caution + h.loyer)} (caution + premier jour).`);
    s.housing = { type: 'location' };
    log(s, `🏢 Appartement loué aux Résidences (caution ${fmt(h.caution)}, loyer ${fmt(h.loyer)} par jour).`, 'good');
    return ok();
  }
  buyHouse(type) {
    const s = this.s, h = HOUSING[type];
    if (!this.at('immobilier')) return fail('À l’agence immobilière.');
    if (type === 'villa' && !s.privateCity) return fail('La villa se trouve en Haute-Ville : il faut en être citoyen (Maison des guildes).');
    let price = h.prix;
    const old = s.housing && HOUSING[s.housing.type];
    if (old?.prix) price -= Math.round(old.prix * 0.8);
    if (!this.pay(price)) return fail(`Pas assez d'argent (${fmt(price)}).`);
    if (s.housing?.type === 'location') log(s, 'Votre location est résiliée.');
    s.housing = { type };
    if (s.home.length > h.slots) { const extra = s.home.splice(h.slots); for (const id of extra) addItem(s, id, 1); }
    log(s, `${h.emoji} Vous êtes propriétaire : ${h.nom} (−${fmt(price)}${old?.prix ? ', ancien logement repris' : ''}).`, 'good');
    return ok();
  }
  leaveHousing() {
    const s = this.s;
    if (!s.housing) return fail('Pas de logement.');
    if (s.housing.type !== 'location') return fail('Vous êtes propriétaire.');
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
    log(s, `${def(id).emoji} ${def(id).nom} installé(e) chez vous. Confort : ${this.homeComfort()}.`, 'good');
    return ok();
  }
  uninstall(idx) {
    const s = this.s;
    const id = s.home.splice(idx, 1)[0];
    if (id) addItem(s, id, 1);
    return ok();
  }
  homeActivity(kind) {
    if (!this.atHome()) return fail('Allez chez vous.');
    const s = this.s;
    if (kind === 'radio') { if (!s.home.includes('radio')) return fail('Il faut une radio.'); this.advance(60, { indoor: true }); this.applyEff({ moral: 6 }); log(s, '📻 Vous écoutez la radio. +6 moral.'); }
    if (kind === 'ordi') { if (!s.home.includes('ordinateur')) return fail('Il faut un ordinateur.'); this.advance(90, { indoor: true }); this.applyEff({ moral: 8, energie: -3 }); log(s, '🖥️ Un peu de jeux et de discussions en ligne. +8 moral.'); }
    if (kind === 'douche') { this.advance(20, { indoor: true }); this.applyEff({ hygiene: has(s, 'savon') ? 70 : 35 }); if (has(s, 'savon')) removeItem(s, 'savon'); log(s, '🚿 Douche à la maison.'); }
    return ok();
  }

  // ------------------------------------------------------------------ santé : assurance
  subscribe(idx) {
    if (!this.at('assurance')) return fail('Aux mutuelles uniquement.');
    this.s.insurance = idx;
    const p = PROVIDERS.assurance[idx];
    log(this.s, `🛡️ Assuré chez ${p.nom} : ${Math.round(p.couverture * 100)} % des soins remboursés, ${fmt(p.prime)} par jour.`, 'good');
    return ok();
  }
  unsubscribe() { this.s.insurance = null; log(this.s, 'Assurance résiliée.'); return ok(); }

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
    log(this.s, '🏰 Vous êtes citoyen de la Haute-Ville : club en accès libre, villas disponibles, +2 moral par jour.', 'good');
    return ok();
  }
  buyHighPass() {
    if (!this.at('mairie')) return fail('À l’Hôtel de ville.');
    if (this.s.passes.haut_niveau) return fail('Déjà acheté.');
    if (!this.pay(5000)) return fail('Pas assez d’argent (5 000 ₵).');
    this.s.passes.haut_niveau = true;
    log(this.s, '🌠 Pass zone de haut niveau acheté : le Cratère de l’Étoile vous est ouvert.', 'good');
    return ok();
  }

  // ------------------------------------------------------------------ famille
  meet(msg) {
    const f = this.s.family;
    if (f.partner) {
      f.partner.love = clamp(f.partner.love + 4, 0, 100);
      this.applyEff({ moral: 8 });
      log(this.s, `💬 ${msg} Vous passez du temps avec ${f.partner.nom}. Affection ${Math.round(f.partner.love)}.`, 'good');
      return ok();
    }
    if (rnd() < 0.55) {
      f.partner = { nom: pick(NAMES), love: 20 };
      log(this.s, `💘 ${msg} Vous avez rencontré ${f.partner.nom} ! Invitez cette personne, offrez des cadeaux…`, 'good');
    } else log(this.s, `${msg} Pas de rencontre cette fois.`);
    this.applyEff({ moral: 5 });
    return ok();
  }
  date() {
    const f = this.s.family;
    if (!f.partner) return fail('Personne à inviter. Faites des rencontres (club, annonce).');
    if (!this.at('evenements') && !this.at('restaurant')) return fail('Au restaurant ou à la salle des fêtes.');
    if (!this.pay(60)) return fail('Pas assez d’argent (60 ₵).');
    this.advance(150);
    f.partner.love = clamp(f.partner.love + 12, 0, 100);
    this.applyEff({ moral: 12, faim: 35, soif: 20 });
    log(this.s, `🕯️ Rendez-vous avec ${f.partner.nom}. Affection ${Math.round(f.partner.love)}.`, 'good');
    return ok();
  }
  gift(id) {
    const f = this.s.family, d = def(id);
    if (!f.partner) return fail('Personne à qui l’offrir.');
    if (!d?.gift || !removeItem(this.s, id)) return fail('Ce n’est pas un cadeau.');
    f.partner.love = clamp(f.partner.love + d.gift, 0, 100);
    this.applyEff({ moral: 4 });
    log(this.s, `🎁 Vous offrez ${d.nom.toLowerCase()} à ${f.partner.nom}. Affection ${Math.round(f.partner.love)}.`, 'good');
    return ok();
  }
  marry() {
    const s = this.s, f = s.family;
    if (!this.at('evenements')) return fail('À la salle des fêtes.');
    if (!f.partner || f.partner.love < 80) return fail('Il faut une affection d’au moins 80.');
    if (f.married) return fail('Déjà marié(e) !');
    if (!s.housing) return fail('Il faut un logement pour vivre ensemble.');
    if (!this.pay(3000)) return fail('Pas assez d’argent (3 000 ₵).');
    this.advance(360);
    f.married = true;
    this.applyEff({ moral: 50, energie: -20 });
    log(s, `💍 Félicitations ! Vous avez épousé ${f.partner.nom}. Vous vivez désormais ensemble.`, 'good');
    return ok();
  }
  party() {
    if (!this.at('evenements')) return fail('À la salle des fêtes.');
    if (!this.pay(800)) return fail('Pas assez d’argent (800 ₵).');
    this.advance(300);
    this.applyEff({ moral: 35, energie: -18, faim: 30, soif: 30 });
    if (this.s.family.partner) this.s.family.partner.love = clamp(this.s.family.partner.love + 6, 0, 100);
    if (rnd() < 0.3 && !this.s.family.partner) return this.meet('🎉 Grande fête organisée !');
    log(this.s, '🎉 Grande fête organisée : vos amis s’en souviendront !', 'good');
    return ok();
  }
  adopt() {
    const s = this.s, h = s.housing && HOUSING[s.housing.type];
    if (!this.at('famille')) return fail('À la Maison de la famille.');
    if (!h?.family) return fail('Il faut une maison familiale ou une villa.');
    if (s.family.children.length >= 3) return fail('Votre foyer est complet.');
    if (!this.pay(1500)) return fail('Pas assez d’argent (1 500 ₵).');
    const nom = pick(NAMES);
    s.family.children.push({ nom, born: s.time });
    this.applyEff({ moral: 25 });
    log(s, `👶 Bienvenue à ${nom} dans votre famille ! (45 ₵ de dépenses par jour et par enfant)`, 'good');
    return ok();
  }
  childActivity() {
    if (!this.s.family.children.length) return fail('Pas d’enfant.');
    if (!this.at('famille') && !this.atHome()) return fail('À la maison ou à la Maison de la famille.');
    if (!this.pay(30 * this.s.family.children.length)) return fail('Pas assez d’argent.');
    this.advance(120);
    this.applyEff({ moral: 14, energie: -8 });
    log(this.s, `🎈 Après-midi en famille avec ${this.s.family.children.map((c) => c.nom).join(', ')}.`, 'good');
    return ok();
  }

  // ------------------------------------------------------------------ entreprise
  createCompany(nom, sector) {
    const s = this.s;
    if (!this.at('mairie')) return fail('À l’Hôtel de ville.');
    if (s.company) return fail('Vous avez déjà une entreprise.');
    if (!this.pay(4000)) return fail('Il faut 4 000 ₵ (licence 2 500 + matériel 1 500).');
    s.company = { nom: nom || 'Ma Société', sector, rep: 25, employees: [], founded: s.time, history: [] };
    log(s, `🏢 Entreprise « ${s.company.nom} » créée (${SECTOR_BY_ID[sector].nom}). Local : 120 ₵ par jour.`, 'good');
    return ok();
  }
  candidates() {
    const d = day(this.s.time);
    const out = [];
    for (let i = 0; i < 3; i++) {
      const r = Math.abs(Math.sin(d * 91.7 + i * 13.3)) ;
      const skill = Math.round((0.6 + r * 0.9) * 100) / 100;
      out.push({ nom: NAMES[(d * 7 + i * 11) % NAMES.length], skill, salaire: Math.round(35 + skill * 55) });
    }
    return out;
  }
  hire(i) {
    const c = this.s.company;
    if (!c) return fail('Pas d’entreprise.');
    if (c.employees.length >= 8) return fail('Maximum 8 employés.');
    const cand = this.candidates()[i];
    if (c.employees.some((e) => e.nom === cand.nom)) return fail('Déjà embauché.');
    c.employees.push(cand);
    log(this.s, `🤝 ${cand.nom} rejoint ${c.nom} (salaire ${fmt(cand.salaire)} par jour).`, 'good');
    return ok();
  }
  fire(i) { const c = this.s.company; const e = c.employees.splice(i, 1)[0]; log(this.s, `${e.nom} a quitté ${c.nom}.`); return ok(); }
  companyDay() {
    const s = this.s, c = s.company;
    const ownerBonus = s.job && JOBS[s.job].sector === c.sector ? 70 : 0;
    const revenue = Math.round((70 + c.employees.reduce((a, e) => a + 115 * e.skill, 0) + ownerBonus) * (0.5 + c.rep / 100) * (0.8 + rnd() * 0.45));
    const cost = 120 + c.employees.reduce((a, e) => a + e.salaire, 0);
    const res = revenue - cost;
    if (res >= 0) this.earn(res); else this.forcePay(-res, 'pertes de l’entreprise');
    c.rep = clamp(c.rep - 2, 0, 100);
    c.history.push(res); if (c.history.length > 14) c.history.shift();
    return `${c.nom} ${res >= 0 ? '+' : ''}${res} ₵`;
  }
  closeCompany() { const c = this.s.company; this.s.company = null; log(this.s, `${c.nom} a fermé ses portes.`); return ok(); }

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
    const total = Math.round(this.s.stockPrices[id] * n * 1.01);
    if (!this.pay(total)) return fail(`Pas assez d'argent (${fmt(total)}).`);
    this.s.stocks[id] = (this.s.stocks[id] || 0) + n;
    log(this.s, `📈 Achat de ${n} action(s) ${id} (−${fmt(total)}).`);
    return ok();
  }
  sellStock(id, n) {
    if (!this.at('banque')) return fail('À la Banque.');
    if ((this.s.stocks[id] || 0) < n) return fail('Pas assez d’actions.');
    const total = Math.round(this.s.stockPrices[id] * n * 0.99);
    this.s.stocks[id] -= n; if (!this.s.stocks[id]) delete this.s.stocks[id];
    this.earn(total);
    log(this.s, `📉 Vente de ${n} action(s) ${id} (+${fmt(total)}).`, 'good');
    return ok();
  }
  deposit(amount, days) {
    if (!this.at('banque')) return fail('À la Banque.');
    if (!this.pay(amount)) return fail('Pas assez d’argent.');
    const rate = days >= 30 ? 0.2 : 0.04;
    this.s.deposits.push({ amount, until: this.s.time + days * 1440, rate });
    log(this.s, `🏦 Placement de ${fmt(amount)} pendant ${days} jours (+${rate * 100} %).`);
    return ok();
  }

  // ------------------------------------------------------------------ mini-jeu
  minigameReward(score) {
    const gain = Math.round(score * 12);
    this.earn(gain);
    this.applyEff({ moral: Math.min(20, score * 2), energie: -6 });
    log(this.s, `🏟️ Défi de l’arène : ${score} cibles touchées → +${fmt(gain)}.`, gain > 20 ? 'good' : 'info');
  }
}

export { duration, fmt };
