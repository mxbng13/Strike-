// Interface : barre d'état, panneaux des lieux, inventaire, métier, maison, entreprise, famille, guide.
import { RESOURCES, RESOURCE_CATEGORIES } from '../data/resources.js';
import { ITEMS, ITEM_CATEGORIES } from '../data/items.js';
import { JOBS, SECTORS, SECTOR_BY_ID, ODD_JOB, PERMITS, LEVELS } from '../data/jobs.js';
import { PLACES, SITES, PROVIDERS, RECIPES, VEHICLES, HOUSING, GUILDS, STOCKS } from '../data/places.js';
import { STATS, def, has, fmt, clock, duration, hourOf } from '../game/state.js';
import { PLACE_BY_ID, WEATHER, CLIMATES } from '../game/game.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const COND = { blessure: ['🩹', 'Blessure'], maladie: ['🤒', 'Maladie'], radiation: ['☢️', 'Irradiation'] };

// Les 10 grandes familles de besoins et où les satisfaire
const GUIDE = [
  ['1. Besoins de base (survie)', [
    ['Faim / soif : nourriture, boissons, repas', ['marche', 'restaurant']], ['Hygiène : savon, douche publique, coupe de cheveux', ['bains', 'coiffeur']],
    ['Sommeil : louer une chambre ou acheter un lit', ['hotel', 'immobilier', 'meubles']], ['Vêtements selon le climat (froid, chaleur, pluie)', ['vetements']]]],
  ['2. Besoins liés au métier', [
    ['Outils (pioche, marteau, scie…) à réparer ou remplacer', ['quincaillerie', 'atelier']], ['Équipements (tenue de sécurité, gants…)', ['quincaillerie']],
    ['Ressources premières : bois, pierre, métal, carburant', ['comptoir', 'foret', 'mine', 'puits']], ['Machines et véhicules à acheter ou louer', ['garage', 'quincaillerie']],
    ['Permis et certificats (formateurs joueurs)', ['ecole']]]],
  ['3. Besoins de déplacement', [
    ['Transports en commun (train, navette)', ['gare']], ['Chevaux, voitures, drones à acheter ou louer', ['garage']],
    ['Téléportation payante gérée par des joueurs', ['portail']], ['Essence, électricité, entretien', ['garage']]]],
  ['4. Besoins sociaux', [
    ['Communication payante (pubs, messages massifs)', ['com']], ['Guilde ou ville privée', ['guilde']],
    ['Hébergement en ville (loyer ou hôtel)', ['immobilier', 'hotel']], ['Lieux exclusifs (club, arène, musée)', ['club', 'arene', 'musee']]]],
  ['5. Besoins de confort', [
    ['Meubles pour sa maison ou son commerce', ['meubles']], ['Décoration (tableaux, plantes, statues)', ['meubles']],
    ['Appareils (radio, cuisine, ordinateur)', ['meubles']], ['Chauffage / climatisation (canicule, vague de froid)', ['meubles']]]],
  ['6. Besoins de santé', [
    ['Médecins (joueurs) : blessures et maladies', ['cabinet']], ['Hôpital public ou privé', ['hopital']],
    ['Médicaments en pharmacie', ['pharmacie']], ['Assurance santé (créée par des joueurs)', ['assurance']]]],
  ['7. Besoins de loisirs', [
    ['Cinéma, concert, théâtre', ['loisirs']], ['Sport : équipement et coach', ['arene']],
    ['Voyages touristiques avec un guide', ['tourisme']], ['Mini-jeu : défi de l’arène', ['arene']]]],
  ['8. Besoins de progression', [
    ['Formations pour changer de métier', ['ecole']], ['Livres et stages', ['ecole']],
    ['Zone de haut niveau payante', ['mairie', 'cratere']], ['Fabrication avancée avec des ressources rares', ['atelier', 'labo', 'usine']]]],
  ['9. Besoins familiaux', [
    ['Maison pour vivre à plusieurs', ['immobilier']], ['Mariage ou fête', ['evenements']],
    ['Élever un enfant (dépenses chaque jour)', ['famille']], ['Cadeaux et objets sentimentaux', ['cadeaux']]]],
  ['10. Besoins économiques', [
    ['Créer une entreprise (licence, local, matériel)', ['mairie']], ['Employer des gens (salaires)', ['mairie']],
    ['Publicité pour attirer des clients', ['com']], ['Bourse et placements', ['banque']]]],
];

export class UI {
  constructor(game, actions) {
    this.g = game;
    this.s = game.s;
    this.a = actions;            // travelTo(placeId), travelToPoint, setTransport, startMinigame…
    this.panel = null;
    this.tab = {};
    this.buildHud();
    document.addEventListener('click', (e) => this.onClick(e));
    document.addEventListener('change', (e) => this.onChange(e));
  }

  // ------------------------------------------------------------------ HUD
  buildHud() {
    $('#statbars').innerHTML = STATS.map(([k, n, e]) => `<div class="stat" data-k="${k}" title="${n}"><span class="si">${e}</span><div class="bar"><i></i></div><span class="sv"></span></div>`).join('');
    $('#actionbar').innerHTML = [
      ['inventory', '🎒', 'Sac'], ['job', '💼', 'Métier'], ['home', '🏠', 'Maison'], ['family', '💞', 'Famille'],
      ['company', '🏢', 'Entreprise'], ['places', '📍', 'Lieux'], ['guide', '📖', 'Besoins'], ['journal', '📜', 'Journal'],
    ].map(([k, e, n]) => `<button data-a="open" data-k="${k}"><span>${e}</span><small>${n}</small></button>`).join('');
  }
  updateHud() {
    const s = this.s, g = this.g;
    $('#money').textContent = fmt(s.money);
    $('#money').classList.toggle('neg', s.money < 0);
    $('#clock').textContent = clock(s.time);
    const w = WEATHER[s.weather.type], c = CLIMATES[g.climateHere()];
    $('#weather').textContent = `${w.emoji} ${w.nom} · ${c.emoji} ${c.nom}`;
    const job = g.currentJob();
    $('#jobline').textContent = job ? `${SECTOR_BY_ID[job.sector].emoji} ${job.nom} · niv. ${g.jobLevel()}` : 'Sans emploi';
    for (const el of document.querySelectorAll('.stat')) {
      const v = s.stats[el.dataset.k];
      el.querySelector('i').style.width = `${v}%`;
      el.querySelector('.sv').textContent = Math.round(v);
      el.classList.toggle('low', v < 25);
    }
    const needs = g.climateNeeds();
    const chips = [];
    for (const c2 of s.conditions) chips.push(`<span class="chip bad">${COND[c2][0]} ${COND[c2][1]}</span>`);
    for (const n of needs) {
      const cloth = g.clothingFor(n);
      const lab = { froid: '❄️ Froid', chaud: '🔥 Chaleur', pluie: '☔ Pluie' }[n];
      chips.push(`<span class="chip ${cloth ? 'ok' : 'bad'}">${lab} : ${cloth ? def(cloth).nom : 'non protégé'}</span>`);
    }
    if (s.buffs.forme > s.time) chips.push('<span class="chip ok">💪 En forme</span>');
    if (s.buffs.sellboost > s.time) chips.push('<span class="chip ok">📣 Ventes +15 %</span>');
    $('#chips').innerHTML = chips.join('');
    const here = g.hereId();
    $('#here').innerHTML = here ? `📍 ${PLACE_BY_ID[here].emoji} ${esc(PLACE_BY_ID[here].nom)} <button data-a="open" data-k="place" data-id="${here}">Entrer</button>` : '📍 En pleine nature';
    $('#transport').innerHTML = Object.entries(VEHICLES).filter(([id]) => id === 'marche' || s.vehicles[id]).map(([id, v]) => {
      const veh = s.vehicles[id];
      const info = veh ? ` ${Math.round(veh.fuel)}%` : '';
      return `<button class="${s.transport === id ? 'on' : ''}" data-a="transport" data-id="${id}" title="${v.nom}">${v.emoji}<small>${info}</small></button>`;
    }).join('');
  }
  toast(msg, kind = 'info') {
    if (!msg) return;
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = msg;
    $('#toasts').prepend(el);
    setTimeout(() => el.classList.add('out'), 4200);
    setTimeout(() => el.remove(), 4800);
    while ($('#toasts').children.length > 4) $('#toasts').lastChild.remove();
  }

  // ------------------------------------------------------------------ panneau
  open(kind, id) { this.panel = { kind, id }; this.render(); $('#panel').classList.add('show'); }
  close() { this.panel = null; $('#panel').classList.remove('show'); }
  render() {
    this.updateHud();
    if (!this.panel) return;
    const { kind, id } = this.panel;
    const html = {
      place: () => this.placePanel(id), inventory: () => this.inventoryPanel(), job: () => this.jobPanel(), home: () => this.homePanel(),
      family: () => this.familyPanel(), company: () => this.companyPanel(), places: () => this.placesPanel(), guide: () => this.guidePanel(),
      journal: () => this.journalPanel(),
    }[kind]();
    const body = $('#panelbody');
    const scroll = body.scrollTop;
    body.innerHTML = html;
    body.scrollTop = scroll;
  }

  btn(label, a, data = {}, opt = {}) {
    const attrs = Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
    return `<button class="btn ${opt.cls || ''}" data-a="${a}" ${attrs} ${opt.disabled ? 'disabled' : ''} ${opt.title ? `title="${esc(opt.title)}"` : ''}>${label}</button>`;
  }
  head(emoji, title, sub) { return `<div class="ph"><div class="pe">${emoji}</div><div><h2>${esc(title)}</h2>${sub ? `<p>${sub}</p>` : ''}</div></div>`; }
  section(title, inner) { return inner ? `<section><h3>${title}</h3>${inner}</section>` : ''; }
  req(id) { const d = def(id); const okk = has(this.s, id); return `<span class="req ${okk ? 'ok' : 'no'}">${d.emoji} ${esc(d.nom)}</span>`; }
  effText(eff) { return this.g.effText(eff); }

  placePanel(id) {
    const g = this.g, s = this.s, p = PLACE_BY_ID[id];
    const here = g.at(id);
    let h = this.head(p.emoji, p.nom, esc(p.desc || ''));
    if (!here) {
      const d = this.a.distanceTo(id);
      const v = VEHICLES[s.transport];
      h += `<div class="goto">Vous êtes à ${Math.round(d)} m. ${this.btn(`${v.emoji} Y aller (≈ ${duration(d / v.speed)})`, 'go', { id }, { cls: 'primary' })}</div>`;
    }
    const dis = !here;
    // travail
    const job = g.currentJob();
    if (job && job.place === id) {
      const miss = g.missingFor(job);
      const lvl = g.jobLevel();
      h += this.section('💼 Travailler ici', `<p>${esc(job.nom)} · niveau ${lvl} · ${fmt(job.salaire * (1 + 0.15 * (lvl - 1)))} par service de 4 h</p>
        ${(job.outils || []).length || (job.equip || []).length ? `<p>Il faut : ${[...(job.outils || []), ...(job.equip || [])].map((x) => this.req(x)).join(' ')}</p>` : ''}
        ${miss.permis ? `<p class="warn">Document manquant : ${PERMITS[miss.permis].nom}</p>` : ''}
        ${this.btn('Travailler 4 h', 'work', {}, { cls: 'primary', disabled: dis })}`);
    }
    const jobsHere = Object.values(JOBS).filter((j) => j.place === id);
    if (jobsHere.length && !(job && job.place === id)) {
      h += this.section('Métiers exercés ici', `<p class="small">${jobsHere.map((j) => `${esc(j.nom)} (${fmt(j.salaire)})`).join(' · ')}</p><p class="small">Formation à l’Académie des métiers.</p>`);
    }
    if (p.services) h += this.section('Services', p.services.map((sv) => this.serviceRow(id, sv, dis)).join(''));
    if (p.shop) h += this.section('Boutique', `<div class="grid">${p.shop.map((it) => this.shopCard(it, id, dis)).join('')}</div>`);
    if (p.special) h += this.special(p.special, id, dis);
    if (p.gather) h += this.sitePanel(p, dis);
    return h;
  }
  serviceRow(placeId, sv, dis) {
    const g = this.g;
    const n = sv.needs || {};
    const reqs = [n.item ? this.req(n.item) : '', n.pass ? `<span class="req ${g.hasPass(n.pass) ? 'ok' : 'no'}">🎫 Pass ${n.pass}</span>` : ''].join(' ');
    const eff = sv.eff ? `<span class="eff">${this.effText(sv.eff)}</span>` : '';
    if (sv.prov) {
      const provs = PROVIDERS[sv.prov].map((pv, i) => this.btn(`${esc(pv.nom)} ⭐${pv.note} · ${fmt(g.providerPrice(sv, i))}`, 'service', { place: placeId, svc: sv.id, prov: i }, { disabled: dis })).join('');
      return `<div class="row"><div><b>${esc(sv.nom)}</b> · ${duration(sv.min)} ${eff} ${reqs}<div class="provs">${provs}</div></div></div>`;
    }
    return `<div class="row"><div><b>${esc(sv.nom)}</b> · ${duration(sv.min)} ${eff} ${reqs}${sv.bonus ? `<span class="small"> (mieux avec ${def(sv.bonus.item).nom.toLowerCase()})</span>` : ''}</div>${this.btn(fmt(g.providerPrice(sv)), 'service', { place: placeId, svc: sv.id }, { disabled: dis })}</div>`;
  }
  shopCard(id, placeId, dis) {
    const d = def(id), price = this.g.priceOf(id, placeId);
    const info = d.use ? this.effText(d.use) : d.protect ? `protège : ${{ froid: 'froid', chaud: 'chaleur', pluie: 'pluie' }[d.protect]}` : d.comfort ? `confort +${d.comfort}` : d.dur ? `${d.dur} utilisations` : '';
    const consumable = d.cat === 'nourriture' || d.cat === 'boisson' || d.cat === 'medicament' || d.cat === 'hygiene';
    return `<div class="card"><div class="ce">${d.emoji}</div><div class="cn">${esc(d.nom)}</div><div class="ci">${esc(info)}${d.needs ? ' · sur ordonnance' : ''}</div>
      <div class="cb">${this.btn(fmt(price), 'buy', { id, place: placeId }, { disabled: dis })}${consumable ? this.btn('×5', 'buy', { id, place: placeId, n: 5 }, { disabled: dis }) : ''}</div>
      ${has(this.s, id) ? `<div class="own">possédé : ${this.s.inv[id]}</div>` : ''}</div>`;
  }

  special(kind, id, dis) {
    const g = this.g, s = this.s;
    switch (kind) {
      case 'market': return this.marketPanel(dis);
      case 'repair': {
        const rows = Object.keys(s.inv).filter((x) => def(x)?.dur && s.dur[x] !== undefined && s.dur[x] < def(x).dur)
          .map((x) => `<div class="row"><div>${def(x).emoji} ${esc(def(x).nom)} · état ${Math.round(100 * s.dur[x] / def(x).dur)} %</div>${this.btn(`Réparer ${fmt(g.repairCost(x))}`, 'repair', { id: x }, { disabled: dis })}</div>`).join('');
        return this.section('🔧 Réparations', rows || '<p class="small">Aucun outil abîmé.</p>');
      }
      case 'craft': return this.craftPanel(id, dis);
      case 'jobs': return this.section('Petits boulots', `<p>Sans diplôme : manutention, livraisons, rangement. ${fmt(ODD_JOB.salaire)} par service de 4 h.</p>${this.btn('Faire un petit boulot (4 h)', 'oddjob', {}, { cls: 'primary', disabled: dis })}`)
        + this.section('Trouver un métier', '<p class="small">Choisissez un métier dans l’onglet 💼 Métier, puis suivez la formation à l’Académie des métiers.</p>' + this.btn('Voir les métiers', 'open', { k: 'job' }));
      case 'garage': return this.garagePanel(dis);
      case 'transit': return this.transitPanel(id, dis);
      case 'portal': return this.portalPanel(id, dis);
      case 'insurance': return this.section('Assurances santé', PROVIDERS.assurance.map((pv, i) => `<div class="row"><div><b>${esc(pv.nom)}</b> ⭐${pv.note}<br><span class="small">${Math.round(pv.couverture * 100)} % des soins remboursés (50 % de ce taux sur les médicaments) · ${fmt(pv.prime)} / jour</span></div>
        ${s.insurance === i ? this.btn('Résilier', 'unsub', {}, { disabled: dis }) : this.btn('Souscrire', 'sub', { i }, { disabled: dis })}</div>`).join(''));
      case 'tourism': return this.section('Voyages guidés', SITES.map((st) => `<div class="row"><div><b>${st.emoji} ${esc(st.nom)}</b><div class="provs">${PROVIDERS.guide.map((pv, i) => this.btn(`${esc(pv.nom)} · ${fmt(g.tourPrice(st.id, i))}`, 'tour', { id: st.id, i }, { disabled: dis })).join('')}</div></div></div>`).join(''));
      case 'school': return this.schoolPanel(dis);
      case 'realestate': return this.realEstatePanel(dis);
      case 'home': return this.section('Mon logement', s.housing ? `<p>${HOUSING[s.housing.type].emoji} ${HOUSING[s.housing.type].nom} · confort ${g.homeComfort()}</p>${this.btn('Ouvrir ma maison', 'open', { k: 'home' }, { cls: 'primary' })}` : '<p>Vous n’avez pas encore de logement ici. Passez à l’agence immobilière.</p>');
      case 'guild': return this.guildPanel(dis);
      case 'events': return this.section('Fêtes et mariages', `
        <div class="row"><div><b>Rendez-vous galant</b> · 2 h 30 · affection +12</div>${this.btn('60 ₵', 'date', {}, { disabled: dis || !s.family.partner })}</div>
        <div class="row"><div><b>Organiser une grande fête</b> · 5 h · +35 moral</div>${this.btn('800 ₵', 'party', {}, { disabled: dis })}</div>
        <div class="row"><div><b>Mariage</b> · affection ≥ 80 et un logement</div>${this.btn('3 000 ₵', 'marry', {}, { disabled: dis || s.family.married })}</div>
        <div class="row"><div><b>Soirée rencontres</b> · 2 h</div>${this.btn('40 ₵', 'meetEvent', {}, { disabled: dis })}</div>`);
      case 'family': return this.section('Élever un enfant', `<p class="small">Il faut une maison familiale ou une villa. Chaque enfant coûte 45 ₵ par jour et apporte +3 moral par jour.</p>
        <div class="row"><div><b>Adopter un enfant</b> (frais de dossier)</div>${this.btn('1 500 ₵', 'adopt', {}, { disabled: dis })}</div>
        <div class="row"><div><b>Après-midi en famille</b> · 2 h · +14 moral</div>${this.btn(`${30 * Math.max(1, s.family.children.length)} ₵`, 'childAct', {}, { disabled: dis || !s.family.children.length })}</div>`);
      case 'cityhall': return this.cityHallPanel(dis);
      case 'bank': return this.bankPanel(dis);
      default: return '';
    }
  }

  marketPanel(dis) {
    const g = this.g, s = this.s;
    const tab = this.tab.market || 'vendre';
    let h = `<div class="tabs">${this.btn('Vendre', 'tab', { t: 'market', v: 'vendre' }, { cls: tab === 'vendre' ? 'on' : '' })}${this.btn('Acheter', 'tab', { t: 'market', v: 'acheter' }, { cls: tab === 'acheter' ? 'on' : '' })}</div>`;
    if (tab === 'vendre') {
      const ids = Object.keys(s.inv).filter((id) => g.sellPrice(id) > 0);
      h += ids.length ? ids.map((id) => {
        const d = def(id), p = g.sellPrice(id);
        return `<div class="row"><div>${d.emoji} ${esc(d.nom)} ×${s.inv[id]} · <b>${fmt(p)}</b>/u ${RESOURCES[id] ? this.trend(id) : ''}</div><div>${this.btn('1', 'sell', { id, n: 1 }, { disabled: dis })}${s.inv[id] > 1 ? this.btn('Tout', 'sell', { id, n: s.inv[id] }, { disabled: dis }) : ''}</div></div>`;
      }).join('') : '<p class="small">Rien à vendre. Récoltez des ressources sur les sites de la carte !</p>';
    } else {
      for (const cat of RESOURCE_CATEGORIES) {
        h += `<h4>${cat.emoji} ${esc(cat.nom)}</h4>` + cat.list.map(([id]) => {
          const d = RESOURCES[id];
          return `<div class="row"><div>${d.emoji} ${esc(d.nom)} · <b>${fmt(g.marketBuyPrice(id))}</b> ${this.trend(id)} ${has(s, id) ? `<span class="small">(×${s.inv[id]})</span>` : ''}</div><div>${this.btn('1', 'mbuy', { id, n: 1 }, { disabled: dis })}${this.btn('10', 'mbuy', { id, n: 10 }, { disabled: dis })}</div></div>`;
        }).join('');
      }
    }
    return this.section('📦 Marché des ressources', h);
  }
  trend(id) { const p = this.s.prices[id]; return p > 1.08 ? '<span class="up">▲</span>' : p < 0.92 ? '<span class="down">▼</span>' : ''; }

  craftPanel(placeId, dis) {
    const g = this.g;
    const list = RECIPES.map((r, i) => [r, i]).filter(([r]) => r.place === placeId);
    return this.section('🛠️ Fabrication', list.map(([r, i]) => {
      const why = g.canCraft(r);
      const out = def(r.out[0]);
      const ins = Object.entries(r.in).map(([id, q]) => `<span class="req ${has(this.s, id, q) ? 'ok' : 'no'}">${def(id).emoji} ${esc(def(id).nom)} ×${q}</span>`).join(' ');
      const who = r.job ? `<span class="small">· ${esc(JOBS[r.job].nom)}</span>` : r.sector ? `<span class="small">· ${esc(SECTOR_BY_ID[r.sector].nom)}</span>` : '';
      return `<div class="row"><div><b>${out.emoji} ${esc(out.nom)} ×${r.out[1]}</b> · ${duration(r.min)} ${who}<br>${ins}</div>${this.btn('Fabriquer', 'craft', { i }, { disabled: dis || !!why, title: why || '' })}</div>`;
    }).join(''));
  }

  garagePanel(dis) {
    const g = this.g, s = this.s;
    return this.section('🚗 Véhicules', Object.entries(VEHICLES).filter(([id]) => id !== 'marche').map(([id, v]) => {
      const mine = s.vehicles[id];
      const permis = v.permis ? `<span class="req ${s.permits.includes(v.permis) ? 'ok' : 'no'}">${PERMITS[v.permis].emoji} ${PERMITS[v.permis].nom}</span>` : '';
      let actions = '';
      if (!mine) actions = this.btn(`Acheter ${fmt(v.prix)}`, 'vbuy', { id }, { disabled: dis }) + this.btn(`Louer 24 h ${fmt(v.loc)}`, 'vrent', { id }, { disabled: dis });
      else {
        actions = this.btn(`Plein ${fmt(g.refuelCost(id))}`, 'refuel', { id }, { disabled: dis || !g.refuelCost(id) })
          + this.btn(`Entretien ${fmt(g.maintCost(id))}`, 'maint', { id }, { disabled: dis || !g.maintCost(id) })
          + (mine.rentedUntil ? '' : this.btn('Revendre', 'vsell', { id }, { disabled: dis }));
      }
      const state = mine ? `<br><span class="small">${v.fuelNom} ${Math.round(mine.fuel)} % · état ${Math.round(mine.cond)} %${mine.rentedUntil ? ` · location jusqu’à ${clock(mine.rentedUntil)}` : ''}</span>` : '';
      return `<div class="row"><div><b>${v.emoji} ${v.nom}</b> · ${v.speed * 10} m/min${v.fly ? ' · vole au-dessus de tout' : ''} ${permis}${state}</div><div class="col">${actions}</div></div>`;
    }).join('') + '<p class="small">On peut aussi refaire le plein depuis le sac : avoine (cheval), carburant (voiture), pile solaire (drone).</p>');
  }
  transitPanel(fromId, dis) {
    const g = this.g;
    const dests = [...SITES.filter((x) => x.station && x.id !== fromId)];
    if (fromId !== 'gare') dests.unshift({ id: 'gare', nom: 'Gare de Nexus (capitale)', emoji: '🚉' });
    return this.section('🚆 Train et navettes', dests.map((d) => `<div class="row"><div><b>${d.emoji} ${esc(d.nom)}</b></div><div>${this.btn(`🚆 ${fmt(g.transitPrice(d.id, false))}`, 'transit', { id: d.id }, { disabled: dis })}${this.btn(`🚀 ${fmt(g.transitPrice(d.id, true))}`, 'transit', { id: d.id, fast: 1 }, { disabled: dis })}</div></div>`).join('')
      + '<p class="small">🚆 Train : moins cher, plus lent · 🚀 Navette rapide.</p>');
  }
  portalPanel(fromId, dis) {
    const g = this.g;
    const dests = [{ id: 'portail', nom: 'Nexus (capitale)', emoji: '🌀' }, ...SITES].filter((d) => d.id !== fromId);
    const pi = this.tab.portal || 0;
    return this.section('🌀 Téléportation', `<div class="tabs">${PROVIDERS.teleport.map((pv, i) => this.btn(`${esc(pv.nom)} ⭐${pv.note}`, 'tab', { t: 'portal', v: i }, { cls: pi === i ? 'on' : '' })).join('')}</div>
      ${PROVIDERS.teleport[pi].risque ? '<p class="warn small">Pas cher, mais les sauts sont parfois mal réglés…</p>' : ''}
      ${dests.map((d) => `<div class="row"><div>${d.emoji} ${esc(d.nom)}</div>${this.btn(fmt(g.teleportPrice(d.id, pi)), 'teleport', { id: d.id, i: pi }, { disabled: dis })}</div>`).join('')}`);
  }
  sitePanel(site, dis) {
    const g = this.g, s = this.s;
    let h = '';
    if (site.pass && !g.hasPass(site.pass)) h += '<p class="warn">Zone de haut niveau : le pass s’achète à l’Hôtel de ville (5 000 ₵).</p>';
    const job = g.currentJob();
    h += this.section('⛏️ Récolter', site.gather.map((ga) => {
      const reqs = [ga.tool ? this.req(ga.tool) : '', ...(ga.equip || []).map((e) => this.req(e)), ga.permit ? `<span class="req ${s.permits.includes(ga.permit) ? 'ok' : 'no'}">${PERMITS[ga.permit].emoji} ${PERMITS[ga.permit].nom}</span>` : ''].join(' ');
      const loot = ga.loot.map(([id]) => def(id).emoji).join('');
      return `<div class="row"><div><b>${esc(ga.nom)}</b> · ${duration(ga.min)} · −${ga.energie} sommeil<br>${reqs}<br><span class="small">Peut donner : ${loot}</span></div>${this.btn('Y aller', 'gather', { site: site.id, g: ga.id }, { cls: 'primary', disabled: dis })}</div>`;
    }).join(''));
    if (job && job.place === site.id) h += '';
    h += this.section('Repartir', `${site.station ? this.transitPanel(site.id, dis) : ''}${this.portalPanel(site.id, dis)}`);
    return h;
  }
  schoolPanel(dis) {
    const g = this.g, s = this.s;
    const pi = this.tab.school || 0;
    const prov = PROVIDERS.formateur[pi];
    const sec = this.tab.sector || SECTORS[0].id;
    let h = `<p class="small">Formateurs (joueurs) :</p><div class="tabs">${PROVIDERS.formateur.map((pv, i) => this.btn(`${esc(pv.nom)} ⭐${pv.note}`, 'tab', { t: 'school', v: i }, { cls: pi === i ? 'on' : '' })).join('')}</div>`;
    if (prov.slow) h += '<p class="small warn">Moins cher mais 30 % plus long.</p>';
    h += `<select data-c="sector">${SECTORS.map((x) => `<option value="${x.id}" ${x.id === sec ? 'selected' : ''}>${x.emoji} ${esc(x.nom)}</option>`).join('')}</select>`;
    h += SECTOR_BY_ID[sec].jobIds.map((jid) => {
      const j = JOBS[jid];
      const got = s.diplomas.includes(jid);
      const action = got ? (s.job === jid ? '<span class="tag">Votre métier</span>' : this.btn('Prendre ce métier', 'takejob', { id: jid })) :
        this.btn(`Formation ${fmt(j.formation * prov.mult)} · ${duration(j.heures * 60 * (prov.slow || 1))}`, 'train', { id: jid, i: pi }, { disabled: dis });
      return `<div class="row"><div><b>${esc(j.nom)}</b> · ${fmt(j.salaire)} / 4 h · lieu : ${esc(PLACE_BY_ID[j.place].nom)}${j.permis ? ` · ${PERMITS[j.permis].nom}` : ''}</div>${action}</div>`;
    }).join('');
    let p2 = Object.entries(PERMITS).map(([id, p]) => `<div class="row"><div>${p.emoji} <b>${esc(p.nom)}</b> · ${duration(p.heures * 60 * (prov.slow || 1))}</div>${s.permits.includes(id) ? '<span class="tag">Obtenu</span>' : this.btn(fmt(p.prix * prov.mult), 'permit', { id, i: pi }, { disabled: dis })}</div>`).join('');
    const stage = `<div class="row"><div><b>Stage pratique</b> · 8 h · +6 expérience dans votre métier</div>${this.btn('400 ₵', 'stage', {}, { disabled: dis || !s.job })}</div>`;
    return this.section('🎓 Formations', h) + this.section('📄 Permis et certificats', p2) + this.section('📘 Progresser', stage + '<p class="small">Les livres (boutique ci-dessus) s’utilisent depuis le sac.</p>');
  }
  realEstatePanel(dis) {
    const s = this.s;
    const loc = HOUSING.location;
    let h = `<div class="row"><div><b>${loc.emoji} ${loc.nom}</b> · caution ${fmt(loc.caution)} + ${fmt(loc.loyer)} / jour · lit inclus · ${loc.slots} emplacements</div>
      ${s.housing?.type === 'location' ? this.btn('Résilier', 'leavehouse', {}, { disabled: dis }) : this.btn('Louer', 'rent', {}, { disabled: dis || !!s.housing })}</div>`;
    for (const t of ['studio', 'maison', 'villa']) {
      const ho = HOUSING[t];
      h += `<div class="row"><div><b>${ho.emoji} ${ho.nom}</b> · ${ho.slots} emplacements · confort de base ${ho.comfort}${ho.family ? ' · pour une famille' : ''}${t === 'villa' ? ' · Haute-Ville' : ''}</div>
        ${s.housing?.type === t ? '<span class="tag">Chez vous</span>' : this.btn(`Acheter ${fmt(ho.prix)}`, 'buyhouse', { t }, { disabled: dis })}</div>`;
    }
    return this.section('🏠 Logements aux Résidences', h + '<p class="small">Un logement acheté n’a pas de lit : achetez-en un (Meubles & Déco) puis installez-le chez vous. Ancien logement repris à 80 %.</p>');
  }
  guildPanel(dis) {
    const s = this.s;
    let h = GUILDS.map((gu) => `<div class="row"><div><b>${gu.emoji} ${esc(gu.nom)}</b><br><span class="small">${esc(gu.desc)} Entrée ${fmt(gu.entree)}, ${fmt(gu.cotisation)} / jour.</span></div>
      ${s.guild === gu.id ? this.btn('Quitter', 'leaveguild', {}, { disabled: dis }) : this.btn('Rejoindre', 'joinguild', { id: gu.id }, { disabled: dis })}</div>`).join('');
    h += `<div class="row"><div><b>🏰 Citoyenneté de la Haute-Ville</b> (ville privée)<br><span class="small">Club en accès libre, villas, +2 moral par jour.</span></div>${s.privateCity ? '<span class="tag">Citoyen</span>' : this.btn('2 500 ₵', 'privatecity', {}, { disabled: dis })}</div>`;
    return this.section('⚜️ Guildes et ville privée', h);
  }
  cityHallPanel(dis) {
    const s = this.s;
    let h = s.company ? `<p>Vous dirigez <b>${esc(s.company.nom)}</b>. ${this.btn('Gérer mon entreprise', 'open', { k: 'company' })}</p>` :
      `<p class="small">Licence 2 500 ₵ + matériel 1 500 ₵, puis un local à 120 ₵ par jour.</p>
      <input id="coname" placeholder="Nom de l’entreprise" maxlength="28">
      <select id="cosector">${SECTORS.map((x) => `<option value="${x.id}">${x.emoji} ${esc(x.nom)}</option>`).join('')}</select>
      ${this.btn('Créer mon entreprise (4 000 ₵)', 'createco', {}, { cls: 'primary', disabled: dis })}`;
    h = this.section('🏢 Créer une entreprise', h);
    h += this.section('🌠 Zone de haut niveau', `<p class="small">Le Cratère de l’Étoile donne des matériaux venus des étoiles (fragment d’étoile, pierre de lune…).</p>
      ${s.passes.haut_niveau ? '<span class="tag">Pass acheté</span>' : this.btn('Acheter le pass (5 000 ₵)', 'highpass', {}, { disabled: dis })}`);
    return h;
  }
  bankPanel(dis) {
    const s = this.s;
    let value = 0;
    const rows = STOCKS.map((st) => {
      const p = s.stockPrices[st.id], own = s.stocks[st.id] || 0;
      value += own * p;
      const hist = s.stockHist[st.id] || [];
      const prev = hist.length > 1 ? hist[hist.length - 2] : st.prix;
      const ch = (p / prev - 1) * 100;
      return `<div class="row"><div><b>${st.id}</b> ${esc(st.nom)} <span class="small">(${esc(st.owner)})</span><br><b>${p.toFixed(2)} ₵</b> <span class="${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch).toFixed(1)} %</span>${this.spark(hist)} ${own ? `· vous : ${own}` : ''}</div>
        <div class="col">${this.btn('Acheter 1', 'sbuy', { id: st.id, n: 1 }, { disabled: dis })}${this.btn('Acheter 10', 'sbuy', { id: st.id, n: 10 }, { disabled: dis })}${own ? this.btn('Vendre tout', 'ssell', { id: st.id, n: own }, { disabled: dis }) : ''}</div></div>`;
    }).join('');
    let h = this.section(`📈 Bourse · portefeuille ${fmt(value)}`, rows + '<p class="small">Frais de 1 % à l’achat et à la vente. Les cours bougent chaque heure.</p>');
    h += this.section('🏦 Placements', `<div class="row"><div>500 ₵ pendant 7 jours · +4 %</div>${this.btn('Placer', 'deposit', { a: 500, d: 7 }, { disabled: dis })}</div>
      <div class="row"><div>2 000 ₵ pendant 30 jours · +20 %</div>${this.btn('Placer', 'deposit', { a: 2000, d: 30 }, { disabled: dis })}</div>
      ${s.deposits.map((d) => `<p class="small">En cours : ${fmt(d.amount)} jusqu’au ${clock(d.until)} (+${d.rate * 100} %)</p>`).join('')}`);
    return h;
  }
  spark(hist) {
    if (hist.length < 2) return '';
    const min = Math.min(...hist), max = Math.max(...hist), w = 60, hh = 16;
    const pts = hist.map((v, i) => `${(i / (hist.length - 1)) * w},${hh - ((v - min) / (max - min || 1)) * hh}`).join(' ');
    return ` <svg class="spark" width="${w}" height="${hh}"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
  }

  // ------------------------------------------------------------------ onglets personnels
  inventoryPanel() {
    const g = this.g, s = this.s;
    let h = this.head('🎒', 'Mon sac', `${fmt(s.money)} · ${Object.values(s.inv).reduce((a, b) => a + b, 0)} objets`);
    if (s.conditions.length) h += `<p class="warn">${s.conditions.map((c) => `${COND[c][0]} ${COND[c][1]}`).join(', ')} : allez au cabinet médical, à la pharmacie ou à l’hôpital.</p>`;
    const groups = {};
    for (const id of Object.keys(s.inv)) {
      const d = def(id);
      const cat = d.kind === 'resource' ? `res:${d.cat}` : d.cat;
      (groups[cat] = groups[cat] || []).push(id);
    }
    const order = [...Object.keys(ITEM_CATEGORIES), ...RESOURCE_CATEGORIES.map((c) => `res:${c.id}`)];
    for (const cat of order) {
      if (!groups[cat]) continue;
      const title = cat.startsWith('res:') ? `${RESOURCE_CATEGORIES.find((c) => `res:${c.id}` === cat).emoji} ${RESOURCE_CATEGORIES.find((c) => `res:${c.id}` === cat).nom}` : ITEM_CATEGORIES[cat];
      h += this.section(esc(title), groups[cat].map((id) => {
        const d = def(id);
        const acts = [];
        if (d.use || d.cure || d.cat === 'livre') acts.push(this.btn('Utiliser', 'use', { id }));
        if (d.comfort && s.housing) acts.push(this.btn('Installer', 'install', { id }, { disabled: !g.atHome(), title: 'Chez vous uniquement' }));
        if (d.gift && s.family.partner) acts.push(this.btn('Offrir', 'gift', { id }));
        for (const [vid, v] of Object.entries(VEHICLES)) if (v.refill === id && s.vehicles[vid]) acts.push(this.btn(`Plein ${v.emoji}`, 'refitem', { id: vid }));
        const durTxt = d.dur && s.dur[id] !== undefined ? ` · état ${Math.round(100 * s.dur[id] / d.dur)} %` : '';
        const info = d.use ? this.effText(d.use) : d.protect ? `protège du ${{ froid: 'froid', chaud: 'soleil', pluie: 'pluie' }[d.protect]}` : '';
        return `<div class="row"><div>${d.emoji} <b>${esc(d.nom)}</b> ×${s.inv[id]}${durTxt} <span class="small">${esc(info)}</span></div><div>${acts.join('')}</div></div>`;
      }).join(''));
    }
    if (!Object.keys(s.inv).length) h += '<p>Votre sac est vide.</p>';
    return h;
  }
  jobPanel() {
    const g = this.g, s = this.s, job = g.currentJob();
    let h = this.head('💼', 'Métier et carrière', job ? `${esc(job.nom)} · niveau ${g.jobLevel()}` : 'Sans emploi');
    if (job) {
      const xp = s.jobXp[job.id] || 0, lvl = g.jobLevel();
      const next = LEVELS[lvl] ?? null;
      const miss = g.missingFor(job);
      h += this.section('Poste actuel', `<p>${SECTOR_BY_ID[job.sector].emoji} ${esc(SECTOR_BY_ID[job.sector].nom)}</p>
        <p>Salaire : <b>${fmt(job.salaire * (1 + 0.15 * (lvl - 1)))}</b> par service de 4 h · lieu : ${esc(PLACE_BY_ID[job.place].nom)} ${g.at(job.place) ? '' : this.btn('Y aller', 'go', { id: job.place })}</p>
        <p>Expérience : ${xp}${next !== null ? ` / ${next} pour le niveau ${lvl + 1}` : ' (niveau maximum)'}</p>
        ${job.prod ? `<p>Produit à chaque service : ${Object.entries(job.prod).map(([r, q]) => `${def(r).emoji} ${def(r).nom} ×${q}`).join(', ')}</p>` : ''}
        ${(job.outils || []).length || (job.equip || []).length ? `<p>Outils et équipements : ${[...(job.outils || []), ...(job.equip || [])].map((x) => this.req(x)).join(' ')}</p>` : ''}
        ${miss.permis ? `<p class="warn">Il manque : ${PERMITS[miss.permis].nom}</p>` : ''}
        ${this.btn('Travailler 4 h', 'work', {}, { cls: 'primary', disabled: !g.at(job.place) })} ${this.btn('Démissionner', 'quit')}`);
    } else h += '<p>Faites des petits boulots à l’Agence pour l’emploi, ou formez-vous à l’Académie des métiers.</p>' + this.btn('Aller à l’Agence pour l’emploi', 'go', { id: 'emploi' }) + this.btn('Aller à l’Académie', 'go', { id: 'ecole' });
    if (s.diplomas.length) h += this.section('🎓 Mes diplômes', s.diplomas.map((d) => `<div class="row"><div>${esc(JOBS[d].nom)} · niv. ${g.jobLevel(d)}</div>${s.job === d ? '<span class="tag">Actuel</span>' : this.btn('Reprendre', 'takejob', { id: d })}</div>`).join(''));
    if (s.permits.length) h += this.section('📄 Mes permis', s.permits.map((p) => `${PERMITS[p].emoji} ${PERMITS[p].nom}`).join(' · '));
    h += this.section(`📋 Tous les métiers (${Object.keys(JOBS).length})`, SECTORS.map((sec) => `<details><summary>${sec.emoji} ${esc(sec.nom)}</summary>${sec.jobIds.map((jid) => {
      const j = JOBS[jid];
      return `<div class="row small"><div><b>${esc(j.nom)}</b> · ${fmt(j.salaire)} / 4 h · formation ${fmt(j.formation)} (${j.heures} h) · ${esc(PLACE_BY_ID[j.place].nom)}${j.prod ? ' · produit des ressources' : ''}${j.craft ? ' · fabrication spéciale' : ''}</div></div>`;
    }).join('')}</details>`).join(''));
    return h;
  }
  homePanel() {
    const g = this.g, s = this.s;
    const ho = s.housing && HOUSING[s.housing.type];
    let h = this.head('🏠', 'Ma maison', ho ? `${ho.nom} · confort ${g.homeComfort()} · ${s.home.length}/${ho.slots} emplacements` : 'Pas de logement');
    if (!ho) return h + '<p>Sans logement, il faut payer l’hôtel ou dormir dehors (mauvais sommeil, moral en baisse).</p>' + this.btn('Aller à l’agence immobilière', 'go', { id: 'immobilier' }, { cls: 'primary' }) + this.btn('Dormir dehors (8 h)', 'sleepout');
    const here = g.atHome();
    if (!here) h += `<div class="goto">Votre logement est aux Résidences. ${this.btn('Rentrer chez moi', 'go', { id: 'residences' }, { cls: 'primary' })}</div>`;
    h += this.section('Vie quotidienne', `<div class="row"><div><b>Dormir 8 h</b> · ${g.homeHasBed() ? 'lit installé' : '<span class="warn">pas de lit : sommeil médiocre</span>'}</div>${this.btn('Dormir', 'sleephome', {}, { disabled: !here })}</div>
      <div class="row"><div><b>Douche</b> · ${has(s, 'savon') ? 'avec savon' : 'sans savon'}</div>${this.btn('Se laver', 'homeact', { k: 'douche' }, { disabled: !here })}</div>
      ${s.home.includes('radio') ? `<div class="row"><div>📻 Écouter la radio · 1 h</div>${this.btn('Écouter', 'homeact', { k: 'radio' }, { disabled: !here })}</div>` : ''}
      ${s.home.includes('ordinateur') ? `<div class="row"><div>🖥️ Se détendre sur l’ordinateur · 1 h 30</div>${this.btn('Jouer', 'homeact', { k: 'ordi' }, { disabled: !here })}</div>` : ''}`);
    h += this.section('Meubles installés', s.home.length ? s.home.map((id, i) => `<div class="row"><div>${def(id).emoji} ${esc(def(id).nom)} · confort +${def(id).comfort}</div>${this.btn('Retirer', 'uninstall', { i }, { disabled: !here })}</div>`).join('') : '<p class="small">Aucun meuble. Achetez-en chez Meubles & Déco ou fabriquez-les à l’atelier.</p>');
    const installable = Object.keys(s.inv).filter((id) => def(id)?.comfort);
    if (installable.length) h += this.section('Dans mon sac', installable.map((id) => `<div class="row"><div>${def(id).emoji} ${esc(def(id).nom)}</div>${this.btn('Installer', 'install', { id }, { disabled: !here })}</div>`).join(''));
    const cook = RECIPES.map((r, i) => [r, i]).filter(([r]) => r.place === 'home');
    h += this.section('🍳 Cuisine', g.homeHas('cooking') ? cook.map(([r, i]) => {
      const out = def(r.out[0]);
      const ins = Object.entries(r.in).map(([id, q]) => `<span class="req ${has(s, id, q) ? 'ok' : 'no'}">${def(id).emoji}×${q}</span>`).join(' ');
      return `<div class="row"><div>${out.emoji} ${esc(out.nom)} ×${r.out[1]} ${ins}</div>${this.btn('Cuisiner', 'craft', { i }, { disabled: !here || !!g.canCraft(r) })}</div>`;
    }).join('') : '<p class="small">Installez une cuisine équipée pour cuisiner vos fruits, légumes et poissons.</p>');
    return h;
  }
  familyPanel() {
    const s = this.s, f = s.family;
    let h = this.head('💞', 'Famille et relations', f.married ? `Marié(e) à ${esc(f.partner.nom)}` : f.partner ? `En couple avec ${esc(f.partner.nom)}` : 'Célibataire');
    if (f.partner) {
      h += this.section('Relation', `<p>${esc(f.partner.nom)} · affection <b>${Math.round(f.partner.love)}</b>/100</p><div class="bar big"><i style="width:${f.partner.love}%"></i></div>
        <p class="small">Rendez-vous (restaurant, salle des fêtes), cadeaux, fêtes. ${f.married ? 'Mariés : +3 moral par jour.' : 'L’affection baisse un peu chaque jour. Mariage possible à 80.'}</p>`);
      const gifts = Object.keys(s.inv).filter((id) => def(id)?.gift);
      h += this.section('🎁 Offrir un cadeau', gifts.length ? gifts.map((id) => `<div class="row"><div>${def(id).emoji} ${esc(def(id).nom)} · affection +${def(id).gift}</div>${this.btn('Offrir', 'gift', { id })}</div>`).join('') : `<p class="small">Pas de cadeau dans votre sac. ${this.btn('Boutique de cadeaux', 'go', { id: 'cadeaux' })}</p>`);
    } else h += `<p>Faites des rencontres au Club Néon, à la salle des fêtes ou avec une petite annonce.</p>${this.btn('Salle des fêtes', 'go', { id: 'evenements' })}${this.btn('Club Néon', 'go', { id: 'club' })}`;
    h += this.section('👶 Enfants', f.children.length ? f.children.map((c) => `<p>${esc(c.nom)} · ${Math.floor((s.time - c.born) / 1440)} jour(s) avec vous</p>`).join('') + '<p class="small">45 ₵ par jour et par enfant.</p>' : '<p class="small">Adoption à la Maison de la famille (il faut une maison familiale).</p>');
    return h;
  }
  companyPanel() {
    const g = this.g, s = this.s, c = s.company;
    if (!c) return this.head('🏢', 'Entreprise', 'Aucune') + '<p>Créez votre entreprise à l’Hôtel de ville : licence, local et matériel. Embauchez ensuite des employés et faites de la publicité.</p>' + this.btn('Aller à l’Hôtel de ville', 'go', { id: 'mairie' }, { cls: 'primary' });
    const sal = c.employees.reduce((a, e) => a + e.salaire, 0);
    let h = this.head('🏢', c.nom, `${SECTOR_BY_ID[c.sector].emoji} ${esc(SECTOR_BY_ID[c.sector].nom)} · réputation ${Math.round(c.rep)}`);
    h += this.section('Résultats', `<p>Charges par jour : local 120 ₵ + salaires ${fmt(sal)}. Les comptes sont faits chaque nuit à minuit.</p>
      ${c.history.length ? `<p>Derniers jours : ${c.history.map((v) => `<span class="${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '+' : ''}${v}</span>`).join(' · ')}</p>` : ''}
      <p class="small">Plus d’employés compétents et une bonne réputation = plus de clients. Si vous travaillez vous-même dans le même secteur, l’entreprise gagne +70 ₵ par jour.</p>
      ${this.btn('📣 Faire de la pub (Tour de communication)', 'go', { id: 'com' })}`);
    h += this.section(`Employés (${c.employees.length}/8)`, c.employees.length ? c.employees.map((e, i) => `<div class="row"><div>${esc(e.nom)} · compétence ${e.skill} · ${fmt(e.salaire)} / jour</div>${this.btn('Licencier', 'fire', { i })}</div>`).join('') : '<p class="small">Aucun employé.</p>');
    h += this.section('Candidats du jour', g.candidates().map((e, i) => `<div class="row"><div>${esc(e.nom)} · compétence ${e.skill} · demande ${fmt(e.salaire)} / jour</div>${this.btn('Embaucher', 'hire', { i }, { disabled: c.employees.some((x) => x.nom === e.nom) })}</div>`).join(''));
    h += this.btn('Fermer l’entreprise', 'closeco', {}, { cls: 'danger' });
    return h;
  }
  placesPanel() {
    const g = this.g;
    const row = (p) => `<div class="row"><div>${p.emoji} ${esc(p.nom)} <span class="small">${Math.round(this.a.distanceTo(p.id))} m</span></div><div>${this.btn('Voir', 'open', { k: 'place', id: p.id })}${this.btn('Y aller', 'go', { id: p.id })}</div></div>`;
    return this.head('📍', 'Lieux', 'Cliquez sur un lieu de la carte ou choisissez-le ici.')
      + this.section('🗺️ Sites de ressources', SITES.map(row).join(''))
      + this.section('🏙️ Capitale Nexus', PLACES.map(row).join(''));
  }
  guidePanel() {
    let h = this.head('📖', 'Besoins et où les satisfaire', 'Chaque besoin coûte de l’argent : il faut travailler, récolter, fabriquer ou commercer.');
    h += `<p class="small">Vos besoins baissent avec le temps : faim, soif, hygiène, sommeil, moral. Si l’un tombe à zéro, la santé chute. À 0 de santé, vous vous évanouissez (hôpital payant).</p>`;
    for (const [title, rows] of GUIDE) {
      h += this.section(esc(title), rows.map(([txt, ids]) => `<div class="row small"><div>${esc(txt)}</div><div>${ids.map((id) => this.btn(`${PLACE_BY_ID[id].emoji}`, 'open', { k: 'place', id }, { title: PLACE_BY_ID[id].nom })).join('')}</div></div>`).join(''));
    }
    h += this.section('Ressources du monde', RESOURCE_CATEGORIES.map((c) => `<details><summary>${c.emoji} ${esc(c.nom)} (${c.list.length})</summary><p class="small">${c.list.map(([id]) => `${RESOURCES[id].emoji} ${esc(RESOURCES[id].nom)}`).join(' · ')}</p></details>`).join(''));
    h += this.btn('Recommencer une nouvelle vie', 'reset', {}, { cls: 'danger' });
    return h;
  }
  journalPanel() {
    return this.head('📜', 'Journal', '') + this.s.log.map((l) => `<div class="log ${l.kind}"><span>${clock(l.t)}</span> ${esc(l.msg)}</div>`).join('');
  }

  // ------------------------------------------------------------------ actions
  onChange(e) {
    const c = e.target.dataset.c;
    if (c === 'sector') { this.tab.sector = e.target.value; this.render(); }
  }
  onClick(e) {
    const b = e.target.closest('[data-a]');
    if (!b || b.disabled) return;
    const d = b.dataset, g = this.g;
    const num = (k) => (d[k] !== undefined ? Number(d[k]) : undefined);
    let r = null;
    switch (d.a) {
      case 'open': this.open(d.k, d.id); return;
      case 'close': this.close(); return;
      case 'tab': this.tab[d.t] = isNaN(Number(d.v)) ? d.v : Number(d.v); this.render(); return;
      case 'go': this.a.travelTo(d.id); return;
      case 'transport': r = g.setTransport(d.id); break;
      case 'buy': r = g.buy(d.id, d.place, num('n') || 1); break;
      case 'use': r = g.use(d.id); break;
      case 'service': r = g.service(d.place, d.svc, num('prov')); if (r.msg === 'minigame') { this.a.minigame(); r = null; } break;
      case 'work': r = g.work(); break;
      case 'oddjob': r = g.work(true); break;
      case 'quit': r = g.quitJob(); break;
      case 'train': r = g.trainJob(d.id, num('i')); break;
      case 'takejob': r = g.takeJob(d.id); break;
      case 'permit': r = g.buyPermit(d.id, num('i')); break;
      case 'stage': r = g.internship(); break;
      case 'gather': r = g.gather(d.site, d.g); break;
      case 'craft': r = g.craft(num('i')); break;
      case 'sell': r = g.sell(d.id, num('n')); break;
      case 'mbuy': r = g.marketBuy(d.id, num('n')); break;
      case 'repair': r = g.repair(d.id); break;
      case 'vbuy': r = g.buyVehicle(d.id); break;
      case 'vrent': r = g.rentVehicle(d.id); break;
      case 'vsell': r = g.sellVehicle(d.id); break;
      case 'refuel': r = g.refuel(d.id); break;
      case 'refitem': r = g.refuelWithItem(d.id); break;
      case 'maint': r = g.maintain(d.id); break;
      case 'transit': r = g.transit(d.id, !!d.fast); break;
      case 'teleport': r = g.teleport(d.id, num('i')); break;
      case 'tour': r = g.tour(d.id, num('i')); break;
      case 'sub': r = g.subscribe(num('i')); break;
      case 'unsub': r = g.unsubscribe(); break;
      case 'rent': r = g.rent(); break;
      case 'buyhouse': r = g.buyHouse(d.t); break;
      case 'leavehouse': r = g.leaveHousing(); break;
      case 'install': r = g.install(d.id); break;
      case 'uninstall': r = g.uninstall(num('i')); break;
      case 'sleephome': r = g.sleepHome(); break;
      case 'sleepout': r = g.sleepOutside(); break;
      case 'homeact': r = g.homeActivity(d.k); break;
      case 'joinguild': r = g.joinGuild(d.id); break;
      case 'leaveguild': r = g.leaveGuild(); break;
      case 'privatecity': r = g.joinPrivateCity(); break;
      case 'highpass': r = g.buyHighPass(); break;
      case 'date': r = g.date(); break;
      case 'party': r = g.party(); break;
      case 'marry': r = g.marry(); break;
      case 'meetEvent': if (!g.at('evenements')) r = { ok: false, msg: 'À la salle des fêtes.' }; else if (!g.pay(40)) r = { ok: false, msg: 'Pas assez d’argent.' }; else { g.advance(120); r = g.meet('Soirée rencontres :'); } break;
      case 'gift': r = g.gift(d.id); break;
      case 'adopt': r = g.adopt(); break;
      case 'childAct': r = g.childActivity(); break;
      case 'createco': r = g.createCompany($('#coname')?.value.trim(), $('#cosector')?.value); break;
      case 'hire': r = g.hire(num('i')); break;
      case 'fire': r = g.fire(num('i')); break;
      case 'closeco': if (confirm('Fermer définitivement votre entreprise ?')) r = g.closeCompany(); break;
      case 'sbuy': r = g.buyStock(d.id, num('n')); break;
      case 'ssell': r = g.sellStock(d.id, num('n')); break;
      case 'deposit': r = g.deposit(num('a'), num('d')); break;
      case 'reset': if (confirm('Effacer votre partie et recommencer ?')) this.a.reset(); return;
      default: return;
    }
    if (r && !r.ok) this.toast(r.msg, 'bad');
    this.g.changed();
  }
}
