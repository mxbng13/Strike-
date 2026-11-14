// Interface : barre d'état, lieux (offres des producteurs, services rendus par des gens), métier, entreprise, marché.
import { RESOURCES, RESOURCE_CATEGORIES } from '../data/resources.js';
import { ITEMS, ITEM_CATEGORIES } from '../data/items.js';
import { GOODS, GOOD_CATEGORIES, RECIPES, SERVICES, BUILDINGS, BUILD_STEPS, BUILD_STEP_NAMES, COMPANY_DOCS, LIFE_REQUIREMENTS, GATHER_JOBS } from '../data/economy.js';
import { JOBS, SECTORS, SECTOR_BY_ID, ODD_JOB, PERMITS, LEVELS } from '../data/jobs.js';
import { PLACES, SITES, VEHICLES, HOUSING, GUILDS, STOCKS } from '../data/places.js';
import { STATS, def, has, fmt, clock, duration } from '../game/state.js';
import { PLACE_BY_ID, WEATHER, CLIMATES, COND_NAMES, VALUE, serviceValue, RECIPES_BY_JOB, SERVICES_BY_JOB } from '../game/game.js';
import { PRODUCERS } from '../game/market.js';
import { DAYS, seasonOf, weekday, holidayOf, yearOf, PROGRAMMES, PETS } from '../data/life.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const COND_EMOJI = { blessure: '🩹', maladie: '🤒', radiation: '☢️', carie: '🦷', deprime: '😞' };
const money = (n) => fmt(n).replace(' ₵', '') + ' ₵';
const p1 = (n) => (Math.round(n * 10) / 10).toLocaleString('fr-FR') + ' ₵';
const USERS = {};   // bien -> métiers qui l'utilisent comme matière
for (const r of RECIPES) for (const id of Object.keys(r.in)) for (const j of r.jobs) if (j !== '*') (USERS[id] = USERS[id] || new Set()).add(j);
for (const s of Object.values(SERVICES)) for (const id of Object.keys(s.supplies)) for (const j of s.jobs) (USERS[id] = USERS[id] || new Set()).add(j);

const GUIDE = [
  ['1. Besoins de base', [['Manger, boire', ['marche', 'restaurant']], ['Hygiène : douche, savon, coiffeur', ['bains', 'coiffeur']], ['Dormir : hôtel, logement, lit', ['hotel', 'immobilier', 'meubles']], ['Vêtements selon le climat', ['vetements']]]],
  ['2. Métier', [['Outils et équipements (forgerons, couturiers…)', ['quincaillerie']], ['Matières premières (mineurs, bûcherons…)', ['comptoir', 'mine', 'foret']], ['Machines (mécaniciens industriels)', ['usine']], ['Formations et permis (formateurs)', ['ecole']]]],
  ['3. Déplacements', [['Train, navette (conducteurs, pilotes)', ['gare']], ['Chevaux, voitures, drones, entretien', ['garage']], ['Téléportation (opérateurs)', ['portail']]]],
  ['4. Social', [['Publicité, messages massifs', ['com']], ['Guildes, ville privée', ['guilde']], ['Logement', ['immobilier', 'hotel']], ['Lieux exclusifs', ['club', 'arene', 'musee']]]],
  ['5. Confort', [['Meubles, déco, appareils, chauffage', ['meubles']], ['Ménage, plombier, rénovation', ['residences']]]],
  ['6. Santé', [['Médecin → ordonnance', ['cabinet']], ['Pharmacie (médicaments des pharmaciens)', ['pharmacie']], ['Infirmiers, hôpital', ['hopital']], ['Assurance (courtiers)', ['assurance']]]],
  ['7. Loisirs', [['Cinéma, concerts, théâtre', ['loisirs']], ['Sport, coach, tournoi', ['arene']], ['Voyages guidés', ['tourisme']]]],
  ['8. Progression', [['Formations, livres', ['ecole']], ['Zone de haut niveau', ['mairie', 'cratere']], ['Fabrication avancée', ['atelier', 'usine', 'labo']]]],
  ['9. Famille', [['Maison (notaire + géomètre)', ['immobilier']], ['Mariage (alliances, wedding planner)', ['evenements']], ['Enfants (école, garde)', ['famille']], ['Cadeaux', ['cadeaux']]]],
  ['Vie quotidienne', [['Papiers : carte d’identité, carte grise', ['prefecture']], ['Impôts et factures (courrier)', ['prefecture']], ['Permis de conduire', ['auto_ecole']], ['Animaux', ['veterinaire']], ['Loisirs gratuits', ['parc', 'bibliotheque']], ['Loto, journaux', ['kiosque']], ['Colis', ['poste']]]],
  ['10. Économie', [['Société, bâtiments, employés', ['mairie']], ['Vendre au marché', ['comptoir']], ['Bourse (traders), prêts (banquiers)', ['banque']]]],
];

export class UI {
  constructor(game, actions) {
    this.g = game;
    this.s = game.s;
    this.m = game.m;
    this.a = actions;
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
      ['inventory', '🎒', 'Sac'], ['job', '💼', 'Métier'], ['company', '🏭', 'Entreprise'], ['market', '📊', 'Marché'], ['home', '🏠', 'Maison'],
      ['family', '💞', 'Proches'], ['mail', '📬', 'Courrier'], ['city', '🏛️', 'Ville'], ['places', '📍', 'Lieux'], ['guide', '📖', 'Besoins'], ['journal', '📜', 'Journal'],
    ].map(([k, e, n]) => `<button data-a="open" data-k="${k}"><span>${e}</span><small>${n}</small></button>`).join('');
  }
  updateHud() {
    const s = this.s, g = this.g;
    $('#money').textContent = fmt(s.money);
    $('#money').classList.toggle('neg', s.money < 0);
    const se = seasonOf(s.time), hol = holidayOf(s.time);
    $('#clock').textContent = `${DAYS[weekday(s.time)]} · ${clock(s.time)} · ${se.emoji} ${se.nom}${hol ? ` · ${hol.emoji} ${hol.nom}` : ''}`;
    const unread = g.unread();
    const mb = document.querySelector('#actionbar [data-k="mail"]');
    if (mb) mb.classList.toggle('badge', unread > 0), mb.dataset.n = unread;
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
    const chips = [];
    for (const c2 of s.conditions) chips.push(`<span class="chip bad">${COND_EMOJI[c2]} ${COND_NAMES[c2]}</span>`);
    for (const n of g.climateNeeds()) {
      const cloth = g.clothingFor(n);
      chips.push(`<span class="chip ${cloth ? 'ok' : 'bad'}">${{ froid: '❄️ Froid', chaud: '🔥 Chaleur', pluie: '☔ Pluie' }[n]} : ${cloth ? def(cloth).nom : 'non protégé'}</span>`);
    }
    if (g.overloaded()) chips.push(`<span class="chip bad">🎒 Trop chargé (${g.carried()}/${g.capacity()})</span>`);
    if (s.theft) chips.push('<span class="chip bad">🦹 Vol à signaler</span>');
    const ev = g.event();
    if (ev) chips.push(`<span class="chip warn" data-a="open" data-k="city">${ev.emoji} ${ev.nom}</span>`);
    const dueBills = (s.mail || []).filter((m) => !m.paid && m.amount).length;
    if (dueBills) chips.push(`<span class="chip bad" data-a="open" data-k="mail">🧾 ${dueBills} facture(s) à payer</span>`);
    if (s.buffs.forme > s.time) chips.push('<span class="chip ok">💪 En forme</span>');
    if (s.insuranceUntil > s.time) chips.push('<span class="chip ok">🛡️ Assuré</span>');
    $('#chips').innerHTML = chips.join('');
    const here = g.hereId();
    $('#here').innerHTML = here ? `📍 ${PLACE_BY_ID[here].emoji} ${esc(PLACE_BY_ID[here].nom)} <button data-a="open" data-k="place" data-id="${here}">Entrer</button>` : '📍 En pleine nature';
    $('#transport').innerHTML = Object.entries(VEHICLES).filter(([id]) => id === 'marche' || s.vehicles[id]).map(([id, v]) => {
      const veh = s.vehicles[id];
      return `<button class="${s.transport === id ? 'on' : ''}" data-a="transport" data-id="${id}" title="${v.nom}">${v.emoji}<small>${veh ? ` ${Math.round(veh.fuel)}%` : ''}</small></button>`;
    }).join('');
  }
  toast(msg, kind = 'info') {
    if (!msg) return;
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = msg;
    $('#toasts').prepend(el);
    setTimeout(() => el.classList.add('out'), 4500);
    setTimeout(() => el.remove(), 5100);
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
      journal: () => this.journalPanel(), mail: () => this.mailPanel(), city: () => this.cityPanel(), market: () => this.marketPanel(), good: () => this.goodPanel(id), sector: () => this.jobPanel(id),
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
  req(id, q = 1) { const d = def(id); return `<span class="req ${has(this.s, id, q) ? 'ok' : 'no'}" data-a="open" data-k="good" data-id="${id}">${d.emoji} ${esc(d.nom)}${q > 1 ? ` ×${q}` : ''}</span>`; }
  goodLink(id, q) { const d = def(id); return `<a class="glink" data-a="open" data-k="good" data-id="${id}">${d.emoji} ${esc(d.nom)}${q ? ` ×${q}` : ''}</a>`; }
  jobName(j) { return JOBS[j] ? JOBS[j].nom : j; }
  jobsText(jobs) { return [...jobs].slice(0, 4).map((j) => this.jobName(j).toLowerCase()).join(', ') + (jobs.length > 4 || jobs.size > 4 ? '…' : ''); }

  // ------------------------------------------------------------------ un lieu
  placePanel(id) {
    const g = this.g, s = this.s, p = PLACE_BY_ID[id];
    const here = g.at(id);
    let h = this.head(p.emoji, p.nom, esc(p.desc || ''));
    if (!here) {
      const d = this.a.distanceTo(id), v = VEHICLES[s.transport];
      h += `<div class="goto">Vous êtes à ${Math.round(d)} m. ${this.btn(`${v.emoji} Y aller (≈ ${duration(d / v.speed)})`, 'go', { id }, { cls: 'primary' })}</div>`;
    }
    const open = g.isOpen(id);
    if (!p.kind) h += `<p class="small">🕒 ${esc(g.hoursText(id))}</p>`;
    if (!open) h += `<div class="goto warn">Fermé en ce moment. ${this.btn(`⏳ Attendre l’ouverture (${duration(g.waitTime(id))})`, 'waitopen', { id }, { disabled: !here })}</div>`;
    const dis = !here || !open;
    h += this.workHere(id, here && (open || g.canTelework()) ? false : true);
    if (p.special) h += this.special(p.special, id, dis);
    if (p.gather) h += this.sitePanel(p, dis);
    const svcs = g.servicesAt(id);
    if (svcs.length) h += this.section('🧑‍🔧 Services rendus par des gens', svcs.map((sv) => this.serviceRow(sv, dis)).join(''));
    const people = [...new Set(svcs.flatMap((sv) => this.m.providers(sv.id).slice(0, 2).map((x) => x.c)))].slice(0, 4);
    if (people.length && open) h += this.section('🙋 Les gens qui travaillent ici', people.map((c) => `<div class="row small"><div>${esc(c.nom)} · ${esc(JOBS[c.job].nom)}${(s.friends[c.id] || 0) >= 30 ? ' · <span class="tag">ami(e)</span>' : (s.friends[c.id] ? ` · amitié ${Math.round(s.friends[c.id])}` : '')}</div>${this.btn('Discuter (30 min)', 'chat', { c: c.id }, { disabled: dis })}</div>`).join(''));
    if (p.shop) h += this.section('🛒 En vente ici (par leurs producteurs)', `<div class="grid">${p.shop.map((it) => this.offerCard(it, dis)).join('')}</div>`);
    return h;
  }
  workHere(id, dis) {
    const g = this.g, s = this.s, job = g.currentJob();
    if (!job) return '';
    let h = '';
    if (job.place === id) {
      const lvl = g.jobLevel(), miss = g.missingFor(job);
      if (g.canTelework()) h += '<p class="small tag">💻 Télétravail possible depuis chez vous</p>';
      h += `<div class="row"><div><b>Salarié</b> chez un employeur · ${fmt(job.salaire * (1 + 0.15 * (lvl - 1)))} par service de 4 h${(job.outils || []).length || (job.equip || []).length ? `<br>${[...job.outils, ...job.equip].map((x) => this.req(x)).join(' ')}` : ''}${miss.permis ? `<br><span class="warn">Il faut : ${PERMITS[miss.permis].nom}</span>` : ''}</div>${this.btn('Travailler 4 h', 'work', {}, { cls: 'primary', disabled: dis })}</div>`;
    }
    for (const sv of SERVICES_BY_JOB[s.job] || []) {
      if (sv.special === 'build' || sv.hidden) continue;
      if (!(sv.place === id || (sv.place === '*site' && PLACE_BY_ID[id].kind) || (sv.place === '*any' && job.place === id))) continue;
      const price = s.myPrices[sv.id] || serviceValue(sv);
      h += `<div class="row"><div><b>À votre compte :</b> ${esc(sv.nom)} · votre prix <input class="pin" type="number" min="1" value="${price}" data-c="svcprice" data-id="${sv.id}"> ₵
        ${Object.keys(sv.supplies).length ? `<br><span class="small">Par client : ${Object.entries(sv.supplies).map(([i, q]) => `${def(i).emoji} ${def(i).nom} ×${q}`).join(', ')}</span>` : ''}</div>${this.btn('Recevoir des clients (4 h)', 'serve', { id: sv.id }, { cls: 'primary', disabled: dis })}</div>`;
    }
    const recs = (RECIPES_BY_JOB[s.job] || []).filter((r) => !r.machine && job.place === id);
    if (recs.length) h += `<p class="small">Vous pouvez aussi fabriquer ici ${recs.length} produit(s) de votre métier : onglet 💼 Métier.</p>`;
    return h ? this.section('💼 Votre travail ici', h) : '';
  }
  serviceRow(sv, dis) {
    const g = this.g;
    const provs = this.m.providers(sv.id);
    const n = sv.needs || {};
    const reqs = n.item ? this.req(n.item) : '';
    const eff = sv.eff ? `<span class="eff">${g.effText(sv.eff)}</span>` : '';
    let arg = '';
    if (['teleport', 'train', 'flight', 'taxi', 'tour'].includes(sv.special)) arg = this.destSelect(sv.special);
    if (['consign', 'export', 'parcel'].includes(sv.special)) arg = this.itemSelect();
    if (sv.special === 'training') return `<div class="row"><div><b>${esc(sv.nom)}</b><br><span class="small">Choisissez une formation plus bas (Académie).</span></div></div>`;
    if (sv.special === 'build' || sv.special === 'install_machine' || sv.special === 'repair_machines' && false) return `<div class="row"><div><b>${esc(sv.nom)}</b> · ${provs.length} disponible(s)<br><span class="small">Engagez-les depuis l’onglet 🏭 Entreprise.</span></div></div>`;
    if (!provs.length) return `<div class="row"><div><b>${esc(sv.nom)}</b> ${eff}<br><span class="warn small">Personne ne rend ce service en ce moment. Métier à prendre : ${esc(this.jobsText(sv.jobs))}.</span></div></div>`;
    const list = provs.slice(0, 3).map((p) => this.btn(`${esc(p.c.nom)} ⭐${p.c.note} · ${p1(g.providerPrice(sv.id, p))}`, 'service', { svc: sv.id, c: p.c.id }, { disabled: dis })).join('');
    return `<div class="row"><div><b>${esc(sv.nom)}</b> · ${duration(sv.min)} ${eff} ${reqs}<br><span class="small">${esc(this.jobsText(sv.jobs))} · ${provs.length} en service</span>${arg}<div class="provs">${list}</div></div></div>`;
  }
  destSelect(kind) {
    const dests = [...PLACES.filter((p) => ['portail', 'gare', 'comptoir', 'marche', 'mairie', 'hopital', 'residences'].includes(p.id)), ...SITES];
    const cur = this.tab.dest || SITES[0].id;
    return `<select data-c="dest">${dests.map((d) => `<option value="${d.id}" ${d.id === cur ? 'selected' : ''}>${d.emoji} ${esc(d.nom)}</option>`).join('')}</select>`;
  }
  itemSelect() {
    const ids = Object.keys(this.s.inv).filter((id) => def(id)?.cat !== 'doc' && def(id)?.cat !== 'papier');
    if (!ids.length) return '<p class="small">Votre sac est vide.</p>';
    const cur = this.tab.item && this.s.inv[this.tab.item] ? this.tab.item : ids[0];
    this.tab.item = cur;
    return `<select data-c="item">${ids.map((id) => `<option value="${id}" ${id === cur ? 'selected' : ''}>${def(id).emoji} ${esc(def(id).nom)} ×${this.s.inv[id]}</option>`).join('')}</select>`;
  }
  offerCard(id, dis) {
    const d = def(id);
    const offers = this.m.offers(id).filter((o) => !o.player);
    const best = offers[0];
    const qty = offers.reduce((a, o) => a + o.qty(), 0);
    const info = d.use ? this.g.effText(d.use) : d.protect ? `protège : ${{ froid: 'froid', chaud: 'chaleur', pluie: 'pluie' }[d.protect]}` : d.comfort ? `confort +${d.comfort}` : d.dur ? `${d.dur} utilisations` : '';
    const prod = [...(PRODUCERS[id] || [])];
    const consumable = ['nourriture', 'boisson', 'medicament', 'hygiene', 'agro', 'energie'].includes(d.cat) || d.kind === 'resource';
    return `<div class="card"><div class="ce">${d.emoji}</div><div class="cn" data-a="open" data-k="good" data-id="${id}">${esc(d.nom)}</div><div class="ci">${esc(info)}${d.needs ? ' · sur ordonnance' : ''}</div>
      ${best ? `<div class="ci">par ${esc(best.name)} · ${qty} en stock${offers.length > 1 ? ` · ${offers.length} vendeurs` : ''}</div>
      <div class="cb">${this.btn(p1(best.price()), 'buy', { id }, { disabled: dis })}${consumable ? this.btn('×5', 'buy', { id, n: 5 }, { disabled: dis }) : ''}</div>`
      : `<div class="ci warn">Rupture : fait par ${esc(this.jobsText(prod)) || 'personne'}</div>`}
      ${has(this.s, id) ? `<div class="own">dans votre sac : ${this.s.inv[id]}</div>` : ''}</div>`;
  }

  special(kind, id, dis) {
    const g = this.g, s = this.s;
    switch (kind) {
      case 'market': return this.comptoirPanel(dis);
      case 'jobs': {
        const short = this.m.shortageList(10);
        return this.section('Petits boulots', `<p>Sans diplôme : manutention, livraisons. ${fmt(ODD_JOB.salaire)} par service de 4 h.</p>${this.btn('Faire un petit boulot (4 h)', 'oddjob', {}, { cls: 'primary', disabled: dis })}`)
          + this.section('📣 La ville manque de…', short.map((x) => `<div class="row small"><div><b>${esc(x.nom)}</b> (${x.n} demandes non servies)<br>Métier : ${esc(this.jobsText(x.jobs))}</div>${this.btn('Voir', 'open', x.kind === 'good' ? { k: 'good', id: x.id } : { k: 'job' })}</div>`).join('') || '<p class="small">Aucune pénurie.</p>');
      }
      case 'garage': {
        let h = Object.entries(VEHICLES).filter(([vid]) => vid !== 'marche').map(([vid, v]) => {
          const mine = s.vehicles[vid];
          const st = mine ? `<br><span class="small">${v.fuelNom} ${Math.round(mine.fuel)} % · état ${Math.round(mine.cond)} %${mine.rentedUntil ? ' · loué' : ''}</span>` : '';
          const acts = mine ? this.btn(`Plein (${def(v.refill).nom})`, 'refitem', { id: vid }) : this.btn(`Louer 24 h · ${fmt(v.loc)}`, 'vrent', { id: vid }, { disabled: dis });
          return `<div class="row"><div><b>${v.emoji} ${v.nom}</b> · ${v.speed * 10} m/min${v.permis ? ` · ${PERMITS[v.permis].nom}` : ''}${v.needs ? ` · ${def(v.needs).nom}` : ''}${st}</div><div class="col">${acts}</div></div>`;
        }).join('');
        return this.section('🚗 Vos véhicules', h + '<p class="small">Achetez un cheval, une voiture ou un drone ci-dessous (élevés ou fabriqués par d’autres), puis « Mettre en service » depuis le sac. Entretien : mécaniciens et maréchaux-ferrants.</p>');
      }
      case 'transit': return '';
      case 'theft': {
        if (!s.theft) return this.section('🦹 Plaintes', '<p class="small">Aucun vol en cours. Un agent de sécurité peut vous protéger pendant 7 jours.</p>');
        const st = { plainte: 'Plainte à déposer : faites faire une enquête (police).', identifie: `Suspect identifié : ${s.theft.suspect}. Procureur puis juge au palais de justice (ou médiation / huissier).`, poursuites: 'Poursuites engagées : audience devant le juge.' }[s.theft.stage];
        return this.section('🦹 Votre affaire', `<p>Volé : <b>${fmt(s.theft.amount)}</b>. ${st}</p>${this.btn('Abandonner l’affaire', 'dropcase')}`);
      }
      case 'guild': return this.guildPanel(dis);
      case 'club': return this.section('🍸 Club', `<div class="row"><div>Pass 7 jours ${g.hasPass('club') ? '<span class="tag">Actif</span>' : ''}</div>${this.btn('150 ₵', 'clubpass', {}, { disabled: dis })}</div>
        <div class="row"><div>Soirée et rencontres (2 h 30)</div>${this.btn('Y aller', 'clubnight', {}, { disabled: dis || !g.hasPass('club') })}</div>`);
      case 'school': return this.schoolPanel(dis);
      case 'realestate': return this.realEstatePanel(dis);
      case 'home': return this.section('Mon logement', s.housing ? `<p>${HOUSING[s.housing.type].emoji} ${HOUSING[s.housing.type].nom} · confort ${g.homeComfort()}</p>${this.btn('Ouvrir ma maison', 'open', { k: 'home' }, { cls: 'primary' })}` : '<p>Pas encore de logement : agence immobilière.</p>');
      case 'events': {
        const f = s.family;
        const req = Object.entries(LIFE_REQUIREMENTS.mariage).map(([i, q]) => this.req(i, q)).join(' ');
        const inv = s.flags.inviteUntil > s.time ? `<div class="row"><div><b>Soirée de votre ami(e) ${esc(this.m.citizen(s.flags.inviteFrom)?.nom || '')}</b> · 3 h</div>${this.btn('Y participer', 'invite', {}, { disabled: dis, cls: 'primary' })}</div>` : '';
        return this.section('Fêtes et mariages', inv + `<div class="row"><div><b>Dîner galant</b> (servi au restaurant)</div>${this.btn('Inviter', 'date', {}, { disabled: dis || !f.partner })}</div>
          <div class="row"><div><b>Mariage</b> · affection ≥ 80, logement, wedding planner ${s.flags.weddingPlanned ? '✅' : '❌'}<br>${req} · frais de mairie 500 ₵</div>${this.btn('Se marier', 'marry', {}, { disabled: dis || f.married })}</div>`);
      }
      case 'family': return this.section('Enfants', `<p class="small">Il faut une maison familiale. Chaque jour, un enfant mange (produits achetés), va à l’école (professeur) et se fait garder (nounou, animateur) : beaucoup de dépenses, mais du bonheur.</p>
        <div class="row"><div><b>Adopter</b> · ${this.req('dossier_admin')} + enquête d’un assistant social + 800 ₵</div>${this.btn('Adopter', 'adopt', {}, { disabled: dis })}</div>`);
      case 'cityhall': return this.cityHallPanel(dis) + this.electionSection(dis);
      case 'park': return this.section('🌳 Activités gratuites', [['promenade', 'Promenade (1 h) · +6 moral'], ['jogging', 'Jogging (1 h) · +4 santé, en forme'], ['piquenique', 'Pique-nique (apportez à manger) · +10 moral'], ['chien', 'Promener votre chien · +9 moral']]
        .map(([k, t]) => `<div class="row"><div>${t}</div>${this.btn('Y aller', 'park', { k }, { disabled: dis })}</div>`).join(''));
      case 'taxes': {
        const due = (s.mail || []).filter((m) => !m.paid && m.amount);
        return this.section('🧾 Impôts et factures', `<p class="small">Impôt sur le revenu chaque lundi (0 % jusqu’à 500 ₵ gagnés dans la semaine, puis 10 %, 20 %, 30 %), taxe d’habitation ou foncière, impôt sur les sociétés. Revenus de la semaine en cours : <b>${fmt(s.weekIncome || 0)}</b>.</p>`
          + (due.length ? due.map((m) => `<div class="row small"><div>${esc(m.subject)}${m.late ? ' <span class="warn">(majoré)</span>' : ''}</div>${this.btn(`Payer ${p1(m.amount)}`, 'paymail', { id: m.id })}</div>`).join('') : '<p class="small">Rien à payer.</p>'));
      }
      case 'bank': return this.bankPanel(dis);
      default: return '';
    }
  }

  comptoirPanel(dis) {
    const g = this.g, s = this.s;
    const tab = this.tab.comptoir || 'vendre';
    let h = `<div class="tabs">${[['vendre', 'Vendre'], ['acheter', 'Acheter'], ['entrepot', 'Entrepôt']].map(([k, n]) => this.btn(n, 'tab', { t: 'comptoir', v: k }, { cls: tab === k ? 'on' : '' })).join('')}</div>`;
    if (tab === 'vendre') {
      h += '<p class="small">Mettez en vente au prix que vous voulez : les habitants (et les entreprises) achètent chez le moins cher. Ou vendez tout de suite au grossiste, moins cher.</p>';
      const ids = Object.keys(s.inv).filter((id) => def(id)?.cat !== 'papier');
      h += ids.length ? ids.map((id) => {
        const d = def(id), l = s.listings[id];
        const best = this.m.offers(id).find((o) => !o.player);
        return `<div class="row"><div>${d.emoji} <b>${esc(d.nom)}</b> ×${s.inv[id]}<br><span class="small">marché : ${best ? p1(best.price()) : 'personne n’en vend'} · grossiste : ${p1(this.m.quickPrice(id))}</span>
          ${l ? `<br><span class="tag">En vente : ${l.qty} à ${p1(l.price)}</span>` : ''}</div>
          <div class="col">${l ? `<span><input class="pin" type="number" step="0.1" min="0.5" value="${l.price}" data-c="listprice" data-id="${id}"> ₵</span><label class="small"><input type="checkbox" data-c="listauto" data-id="${id}" ${l.auto ? 'checked' : ''}> prix auto (suit la concurrence)</label>${this.btn('Retirer', 'unlist', { id })}`
            : this.btn(`Mettre en vente (${p1(g.suggestedPrice(id))})`, 'list', { id }, { cls: 'primary' })}
          ${this.btn(`Grossiste ×${s.inv[id]}`, 'quicksell', { id, n: s.inv[id] }, { disabled: dis })}</div></div>`;
      }).join('') : '<p class="small">Rien à vendre : produisez, récoltez ou fabriquez !</p>';
    } else if (tab === 'acheter') {
      const cats = { ...Object.fromEntries(RESOURCE_CATEGORIES.map((c) => [`r:${c.id}`, `${c.emoji} ${c.nom}`])), ...Object.fromEntries(Object.entries(GOOD_CATEGORIES).map(([k, v]) => [`g:${k}`, v])), ...Object.fromEntries(Object.entries(ITEM_CATEGORIES).map(([k, v]) => [`i:${k}`, v])) };
      const cur = this.tab.cat || 'g:doc';
      h += `<select data-c="cat">${Object.entries(cats).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
      const [kind, c] = cur.split(':');
      const list = kind === 'r' ? RESOURCE_CATEGORIES.find((x) => x.id === c).list.map((x) => x[0]) : kind === 'g' ? Object.values(GOODS).filter((x) => x.cat === c).map((x) => x.id) : Object.values(ITEMS).filter((x) => x.cat === c).map((x) => x.id);
      h += `<div class="grid">${list.map((id) => this.offerCard(id, dis)).join('')}</div>`;
    } else {
      h += `<p class="small">Entrepôt : ${s.storageUntil > s.time ? `loué jusqu’au jour ${Math.floor(s.storageUntil / 1440) + 1}` : 'non loué (voir les logisticiens et magasiniers ci-dessous)'}. Un chauffeur routier peut y envoyer vos ressources depuis n’importe où.</p>`;
      const w = Object.entries(s.warehouse);
      h += w.length ? w.map(([id, q]) => `<div class="row"><div>${def(id).emoji} ${esc(def(id).nom)} ×${q}</div>${this.btn('Reprendre', 'wh', { id, n: q, to: 0 }, { disabled: dis })}</div>`).join('') : '<p class="small">Entrepôt vide.</p>';
      const stockable = Object.keys(s.inv).filter((id) => def(id)?.kind === 'resource' || ['agro', 'materiau', 'meca'].includes(def(id)?.cat));
      if (stockable.length) h += '<h4>Déposer depuis le sac</h4>' + stockable.map((id) => `<div class="row"><div>${def(id).emoji} ${esc(def(id).nom)} ×${s.inv[id]}</div>${this.btn('Déposer', 'wh', { id, n: s.inv[id], to: 1 }, { disabled: dis })}</div>`).join('');
    }
    return this.section('📦 Grand marché', h);
  }
  sitePanel(site, dis) {
    const g = this.g, s = this.s;
    let h = '';
    if (site.pass && !g.hasPass(site.pass)) h += '<p class="warn">Zone de haut niveau : le pass s’achète à l’Hôtel de ville (5 000 ₵).</p>';
    const myG = (GATHER_JOBS[s.job] || []).filter(([si]) => si === site.id).map(([, gi]) => gi);
    h += this.section('⛏️ Récolter', site.gather.map((ga) => {
      const reqs = [ga.tool ? this.req(ga.tool) : '', ...(ga.equip || []).map((e) => this.req(e)), ga.permit ? `<span class="req ${s.permits.includes(ga.permit) ? 'ok' : 'no'}">${PERMITS[ga.permit].emoji} ${PERMITS[ga.permit].nom}</span>` : '', ...Object.entries(ga.fuel || {}).map(([i, q]) => this.req(i, q))].join(' ');
      return `<div class="row"><div><b>${esc(ga.nom)}</b> · ${duration(ga.min)} · −${ga.energie} sommeil${myG.includes(ga.id) ? ' · <span class="tag">votre métier : ×1,5</span>' : ''}<br>${reqs}<br><span class="small">Peut donner : ${ga.loot.map(([id]) => def(id).emoji).join('')}</span></div>${this.btn('Récolter', 'gather', { site: site.id, g: ga.id }, { cls: 'primary', disabled: dis })}</div>`;
    }).join(''));
    if (site.station) h += this.section('🚆 Repartir', this.serviceRow(SERVICES.train, dis) + this.serviceRow(SERVICES.vol, dis));
    h += this.section('🌀 Portail de l’avant-poste', this.serviceRow(SERVICES.teleportation, dis));
    return h;
  }
  schoolPanel(dis) {
    const g = this.g, s = this.s;
    const provs = this.m.providers('formation');
    const prov = provs[0];
    const sec = this.tab.sector || SECTORS[0].id;
    let h = prov ? `<p class="small">Formateur disponible : <b>${esc(prov.c.nom)}</b> ⭐${prov.c.note}${s.flags.orientation ? ' · −20 % (bilan d’orientation)' : ''}. Formations de plus de 4 000 ₵ : diplôme universitaire exigé.</p>` : '<p class="warn">Aucun formateur professionnel en service : impossible de se former pour l’instant.</p>';
    h += `<select data-c="sector">${SECTORS.map((x) => `<option value="${x.id}" ${x.id === sec ? 'selected' : ''}>${x.emoji} ${esc(x.nom)}</option>`).join('')}</select>`;
    h += SECTOR_BY_ID[sec].jobIds.map((jid) => {
      const j = JOBS[jid], got = s.diplomas.includes(jid);
      const action = got ? (s.job === jid ? '<span class="tag">Votre métier</span>' : this.btn('Prendre ce métier', 'takejob', { id: jid }))
        : this.btn(`Formation ${fmt(g.trainingCost(jid))} · ${duration(j.heures * 60)}`, 'train', { id: jid, c: prov?.c.id || '' }, { disabled: dis || !prov });
      return `<div class="row"><div><b>${esc(j.nom)}</b> · ${fmt(j.salaire)} / 4 h salarié${j.formation >= 4000 ? ' · 🎓 diplôme univ.' : ''}${j.permis ? ` · ${PERMITS[j.permis].nom}` : ''}<br><span class="small">${esc(this.jobOutputText(jid))}</span></div>${action}</div>`;
    }).join('');
    const permits = Object.entries(PERMITS).map(([pid, p]) => `<div class="row"><div>${p.emoji} <b>${esc(p.nom)}</b> · ${duration(p.heures * 60)}</div>${s.permits.includes(pid) ? '<span class="tag">Obtenu</span>' : this.btn(fmt(p.prix), 'permit', { id: pid }, { disabled: dis })}</div>`).join('');
    return this.section('🎓 Formations', h) + this.section('📄 Permis et certificats', permits);
  }
  jobOutputText(jid) {
    const outs = new Set();
    for (const r of RECIPES_BY_JOB[jid] || []) Object.keys(r.out).forEach((o) => outs.add(def(o).nom));
    for (const [site, gid] of GATHER_JOBS[jid] || []) SITES.find((x) => x.id === site).gather.find((x) => x.id === gid).loot.slice(0, 4).forEach(([id]) => outs.add(def(id).nom));
    const svcs = (SERVICES_BY_JOB[jid] || []).filter((x) => !x.hidden).map((x) => x.nom);
    return [outs.size ? `Produit : ${[...outs].slice(0, 6).join(', ')}${outs.size > 6 ? '…' : ''}` : '', svcs.length ? `Services : ${svcs.join(', ')}` : ''].filter(Boolean).join(' · ');
  }
  realEstatePanel(dis) {
    const s = this.s, loc = HOUSING.location;
    let h = `<div class="row"><div><b>${loc.emoji} ${loc.nom}</b> · caution ${fmt(loc.caution)} + ${fmt(loc.loyer)} / jour · lit inclus</div>${s.housing?.type === 'location' ? this.btn('Résilier', 'leavehouse', {}, { disabled: dis }) : this.btn('Louer', 'rent', {}, { disabled: dis || !!s.housing })}</div>`;
    const req = Object.entries(LIFE_REQUIREMENTS.achat_maison).map(([i, q]) => this.req(i, q)).join(' ');
    for (const t of ['studio', 'maison', 'villa']) {
      const ho = HOUSING[t];
      h += `<div class="row"><div><b>${ho.emoji} ${ho.nom}</b> · ${ho.slots} emplacements${ho.family ? ' · famille' : ''}${t === 'villa' ? ' · Haute-Ville' : ''}</div>${s.housing?.type === t ? '<span class="tag">Chez vous</span>' : this.btn(`Acheter ${fmt(ho.prix)}`, 'buyhouse', { t }, { disabled: dis })}</div>`;
    }
    return this.section('🏠 Logements', h + `<p class="small">Pour acheter : ${req}. Un logement acheté n’a pas de lit (ébénistes).</p>`);
  }
  guildPanel(dis) {
    const s = this.s;
    let h = GUILDS.map((gu) => `<div class="row"><div><b>${gu.emoji} ${esc(gu.nom)}</b><br><span class="small">${esc(gu.desc)} Entrée ${fmt(gu.entree)}, ${fmt(gu.cotisation)} / jour.</span></div>${s.guild === gu.id ? this.btn('Quitter', 'leaveguild', {}, { disabled: dis }) : this.btn('Rejoindre', 'joinguild', { id: gu.id }, { disabled: dis })}</div>`).join('');
    h += `<div class="row"><div><b>🏰 Haute-Ville</b> (ville privée) : club libre, villas, +2 moral/jour</div>${s.privateCity ? '<span class="tag">Citoyen</span>' : this.btn('2 500 ₵', 'privatecity', {}, { disabled: dis })}</div>`;
    return this.section('⚜️ Guildes et ville privée', h);
  }
  cityHallPanel(dis) {
    const s = this.s;
    let h;
    if (s.company) h = `<p>Société : <b>${esc(s.company.nom)}</b>.</p><p class="small">Nouveau bâtiment : achetez le terrain ici, puis suivez le chantier dans l’onglet 🏭 Entreprise.</p>` + Object.entries(BUILDINGS).map(([t, B]) =>
      `<div class="row"><div><b>${B.emoji} ${B.nom}</b> · ${B.slots} machine(s), ${B.workers} employé(s)<br><span class="small">Documents : ${Object.keys(B.docs).map((i) => def(i).nom).join(', ')}</span></div>${this.btn(`Terrain ${fmt(B.terrain)}`, 'project', { t }, { disabled: dis })}</div>`).join('');
    else h = `<p class="small">Pour créer votre société : ${Object.keys(COMPANY_DOCS).map((i) => this.req(i)).join(' ')} (avocat, greffier : au Comptoir) + 300 ₵.</p><input id="coname" placeholder="Nom de la société" maxlength="28">${this.btn('Créer ma société', 'createco', {}, { cls: 'primary', disabled: dis })}`;
    return this.section('🏢 Société et bâtiments', h) + this.section('🌠 Zone de haut niveau', s.passes.haut_niveau ? '<span class="tag">Pass acheté</span>' : this.btn('Pass (5 000 ₵)', 'highpass', {}, { disabled: dis }));
  }
  bankPanel(dis) {
    const s = this.s;
    let value = 0;
    const broker = s.brokerUntil > s.time;
    const rows = STOCKS.map((st) => {
      const p = s.stockPrices[st.id], own = s.stocks[st.id] || 0;
      value += own * p;
      const hist = s.stockHist[st.id] || [];
      const prev = hist.length > 1 ? hist[hist.length - 2] : st.prix;
      const ch = (p / prev - 1) * 100;
      return `<div class="row"><div><b>${st.id}</b> ${esc(st.nom)}<br><b>${p.toFixed(2)} ₵</b> <span class="${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch).toFixed(1)} %</span>${this.spark(hist)}${own ? ` · vous : ${own}` : ''}</div>
        <div class="col">${this.btn('Acheter 10', 'sbuy', { id: st.id, n: 10 }, { disabled: dis || !broker })}${own ? this.btn('Vendre tout', 'ssell', { id: st.id, n: own }, { disabled: dis || !broker }) : ''}</div></div>`;
    }).join('');
    let h = this.section(`📈 Bourse · portefeuille ${fmt(value)}`, `${broker ? '<p class="small tag">Trader engagé pour 24 h</p>' : '<p class="small warn">Les ordres passent par un trader (service ci-dessous).</p>'}${rows}`);
    h += this.section('🏦 Placements', `<div class="row"><div>500 ₵ · 7 jours · +4 %${s.adviceBonus ? ' (+3 % conseil)' : ''}</div>${this.btn('Placer', 'deposit', { a: 500, d: 7 }, { disabled: dis })}</div>
      <div class="row"><div>2 000 ₵ · 30 jours · +20 %</div>${this.btn('Placer', 'deposit', { a: 2000, d: 30 }, { disabled: dis })}</div>
      ${s.loan ? `<p class="warn">Prêt en cours : reste ${fmt(s.loan.left)}</p>` : ''}${s.deposits.map((d) => `<p class="small">Placement : ${fmt(d.amount)} jusqu’au ${clock(d.until)}</p>`).join('')}`);
    return h;
  }
  spark(hist) {
    if (hist.length < 2) return '';
    const min = Math.min(...hist), max = Math.max(...hist), w = 60, hh = 16;
    const pts = hist.map((v, i) => `${(i / (hist.length - 1)) * w},${hh - ((v - min) / (max - min || 1)) * hh}`).join(' ');
    return ` <svg class="spark" width="${w}" height="${hh}"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
  }

  // ------------------------------------------------------------------ fiche d'un bien : qui le fait, qui l'utilise
  goodPanel(id) {
    const d = def(id);
    const offers = this.m.offers(id);
    const prods = [...(PRODUCERS[id] || [])];
    const users = [...(USERS[id] || [])];
    let h = this.head(d.emoji, d.nom, `Valeur de référence ${p1(VALUE[id] || d.prix || 0)}`);
    h += this.section('🏷️ Vendeurs', offers.length ? offers.slice(0, 8).map((o) => `<div class="row small"><div>${esc(o.name)}${o.job ? ` · ${esc(this.jobName(o.job).toLowerCase())}` : ''} · ${o.qty()} en stock</div><b>${p1(o.price())}</b></div>`).join('') : '<p class="warn">Personne n’en vend en ce moment.</p>');
    const recs = RECIPES.filter((r) => r.out[id]);
    h += this.section('🛠️ Fabriqué par', recs.map((r) => `<div class="row small"><div><b>${esc(r.jobs.map((j) => j === '*' ? 'vous, à la maison' : this.jobName(j)).join(' / '))}</b>${r.machine ? ` · machine ${def(r.machine).nom}` : ''}${r.tool ? ` · outil ${def(r.tool).nom}` : ''}<br>${Object.entries(r.in).map(([i, q]) => this.goodLink(i, q)).join(' + ') || 'rien (travail seul)'} → ×${r.out[id]}</div></div>`).join('')
      + (prods.some((j) => GATHER_JOBS[j]) ? `<p class="small">Récolté par : ${esc(prods.filter((j) => GATHER_JOBS[j]).map((j) => this.jobName(j)).join(', '))}</p>` : '') || '<p class="small">—</p>');
    h += this.section('🔗 Utilisé par', users.length ? `<p class="small">${esc(users.map((j) => this.jobName(j)).join(', '))}</p>` : '<p class="small">Consommé directement par les habitants.</p>');
    return h;
  }

  // ------------------------------------------------------------------ onglets
  inventoryPanel() {
    const g = this.g, s = this.s;
    let h = this.head('🎒', 'Mon sac', `${fmt(s.money)} · chargé ${g.carried()}/${g.capacity()}`);
    if (s.conditions.length) h += `<p class="warn">${s.conditions.map((c) => `${COND_EMOJI[c]} ${COND_NAMES[c]}`).join(', ')} : allez vous faire soigner.</p>`;
    const groups = {};
    for (const id of Object.keys(s.inv)) { const d = def(id); const cat = d.kind === 'resource' ? `r:${d.cat}` : d.kind === 'good' ? `g:${d.cat}` : d.cat; (groups[cat] = groups[cat] || []).push(id); }
    const title = (cat) => cat.startsWith('r:') ? RESOURCE_CATEGORIES.find((c) => `r:${c.id}` === cat)?.nom : cat.startsWith('g:') ? (GOOD_CATEGORIES[cat.slice(2)] || 'Outils') : ITEM_CATEGORIES[cat];
    for (const cat of Object.keys(groups)) {
      h += this.section(esc(title(cat) || cat), groups[cat].map((id) => {
        const d = def(id), acts = [];
        if (d.use || d.cure || d.cat === 'livre' || d.vaccine || ['carte_prospection', 'alerte_meteores', 'etude_marine', 'optimisation'].includes(id)) acts.push(this.btn('Utiliser', 'use', { id }));
        if (d.vehicle) acts.push(this.btn('Mettre en service', 'use', { id }, { cls: 'primary' }));
        if (d.pet) acts.push(this.btn('Adopter', 'use', { id }, { cls: 'primary' }));
        if (d.comfort && s.housing) acts.push(this.btn('Installer', 'install', { id }, { disabled: !g.atHome() }));
        if (d.gift && s.family.partner) acts.push(this.btn('Offrir', 'gift', { id }));
        const durTxt = d.dur && s.dur[id] !== undefined ? ` · état ${Math.round(100 * s.dur[id] / d.dur)} %` : '';
        const l = s.listings[id];
        return `<div class="row"><div>${d.emoji} <b data-a="open" data-k="good" data-id="${id}">${esc(d.nom)}</b> ×${s.inv[id]}${durTxt}${l ? ` <span class="tag">en vente ${l.qty} à ${p1(l.price)}</span>` : ''}</div><div>${acts.join('')}${l ? '' : this.btn('Vendre', 'list', { id })}</div></div>`;
      }).join(''));
    }
    if (!Object.keys(s.inv).length) h += '<p>Votre sac est vide.</p>';
    return h;
  }
  jobPanel() {
    const g = this.g, s = this.s, job = g.currentJob();
    let h = this.head('💼', 'Métier', job ? `${esc(job.nom)} · niveau ${g.jobLevel()}` : 'Sans emploi');
    if (job) {
      const xp = s.jobXp[job.id] || 0, lvl = g.jobLevel(), next = LEVELS[lvl] ?? null, miss = g.missingFor(job);
      h += this.section('Votre poste', `<p>Lieu : ${esc(PLACE_BY_ID[job.place].nom)} ${g.at(job.place) ? '' : this.btn('Y aller', 'go', { id: job.place })} · salarié ${fmt(job.salaire * (1 + 0.15 * (lvl - 1)))} / 4 h</p>
        <p>Expérience ${xp}${next !== null ? ` / ${next}` : ' (max)'}${miss.permis ? ` · <span class="warn">il faut ${PERMITS[miss.permis].nom}</span>` : ''}</p>
        ${[...job.outils, ...job.equip].length ? `<p>${[...job.outils, ...job.equip].map((x) => this.req(x)).join(' ')}</p>` : ''}
        ${this.btn(g.canTelework() ? 'Télétravailler 4 h' : 'Travailler 4 h (salarié)', 'work', {}, { cls: 'primary', disabled: !g.at(job.place) && !g.canTelework() })} ${this.btn('Démissionner', 'quit')}
        ${['info', 'com', 'admin', 'finance'].includes(job.sector) ? '<p class="small">Télétravail possible chez vous avec internet (technicien télécom) et un ordinateur.</p>' : ''}`);
      // ce que vous pouvez produire
      const recs = RECIPES_BY_JOB[s.job] || [];
      if (recs.length) h += this.section('🛠️ À votre compte : fabriquer et vendre', recs.map((r) => {
        const why = g.canCraft(r);
        const outs = Object.entries(r.out).map(([id, q]) => this.goodLink(id, q)).join(' + ');
        const ins = Object.entries(r.in).map(([id, q]) => this.req(id, q)).join(' ') || '<span class="small">aucune matière</span>';
        const value = Object.entries(r.out).reduce((a, [id, q]) => a + (this.m.bestPrice(id) ?? VALUE[id]) * q, 0);
        const cost = Object.entries(r.in).reduce((a, [id, q]) => a + (this.m.bestPrice(id) ?? VALUE[id]) * q, 0);
        return `<div class="row"><div><b>${outs}</b> · ${duration(r.min)}${r.machine ? ` · 🏭 ${esc(def(r.machine).nom)}` : ''}${r.tool ? ` · outil ${this.req(r.tool)}` : ''}<br>${ins}<br><span class="small">vaut ≈ ${p1(value)} · matières ≈ ${p1(cost)}</span>${why ? `<br><span class="warn small">${esc(why)}</span>` : ''}</div>
          <div class="col">${this.btn('Fabriquer', 'craft', { i: r.idx }, { disabled: !!why })}${this.btn('×5', 'craft', { i: r.idx, n: 5 }, { disabled: !!why })}${this.btn('Acheter matières', 'buyinputs', { i: r.idx })}</div></div>`;
      }).join(''));
      const svcs = (SERVICES_BY_JOB[s.job] || []).filter((x) => !x.hidden);
      if (svcs.length) h += this.section('🧑‍💼 À votre compte : rendre des services', svcs.map((sv) => `<div class="row"><div><b>${esc(sv.nom)}</b> · ${sv.place.startsWith('*') ? (sv.place === '*site' ? 'sur les sites' : 'partout') : esc(PLACE_BY_ID[sv.place].nom)}
        ${Object.keys(sv.supplies).length ? `<br>Par client : ${Object.entries(sv.supplies).map(([i, q]) => `${this.req(i)} ×${q}`).join(' ')}` : ''}<br><span class="small">Concurrents : ${this.m.providers(sv.id).length} · prix habituel ${fmt(serviceValue(sv))}</span></div>
        ${sv.special === 'build' ? '<span class="small">Sur vos chantiers (Entreprise)</span>' : sv.place.startsWith('*') ? this.btn('Recevoir des clients', 'serve', { id: sv.id }) : this.btn('Y aller', 'go', { id: sv.place })}</div>`).join(''));
      const gath = GATHER_JOBS[s.job];
      if (gath) h += this.section('⛏️ À votre compte : récolter', gath.map(([site, gid]) => `<div class="row"><div>${PLACE_BY_ID[site].emoji} ${esc(SITES.find((x) => x.id === site).gather.find((x) => x.id === gid).nom)} à ${esc(PLACE_BY_ID[site].nom)} · récolte ×1,5</div>${this.btn('Y aller', 'go', { id: site })}</div>`).join(''));
      // qui a besoin de votre travail
      const outs = new Set(recs.flatMap((r) => Object.keys(r.out)));
      const who = new Set([...outs].flatMap((o) => [...(USERS[o] || [])]));
      if (who.size) h += this.section('🔗 Qui a besoin de votre production', `<p class="small">${esc([...who].slice(0, 20).map((j) => this.jobName(j)).join(', '))}${who.size > 20 ? '…' : ''}, et les habitants.</p>`);
    } else h += '<p>Faites des petits boulots à l’Agence pour l’emploi, ou formez-vous à l’Académie.</p>' + this.btn('Agence pour l’emploi', 'go', { id: 'emploi' }) + this.btn('Académie', 'go', { id: 'ecole' });
    if (s.diplomas.length) h += this.section('🎓 Diplômes', s.diplomas.map((d) => `<div class="row"><div>${esc(JOBS[d].nom)} · niv. ${g.jobLevel(d)}</div>${s.job === d ? '<span class="tag">Actuel</span>' : this.btn('Reprendre', 'takejob', { id: d })}</div>`).join(''));
    if (s.permits.length) h += this.section('📄 Permis', s.permits.map((p) => `${PERMITS[p].emoji} ${PERMITS[p].nom}`).join(' · '));
    h += this.section(`📋 Les ${Object.keys(JOBS).length} métiers et à quoi ils servent`, SECTORS.map((sec) => `<details><summary>${sec.emoji} ${esc(sec.nom)} (${sec.jobIds.length})</summary>${sec.jobIds.map((jid) => `<div class="row small"><div><b>${esc(JOBS[jid].nom)}</b> · formation ${fmt(JOBS[jid].formation)}<br>${esc(this.jobOutputText(jid))}</div></div>`).join('')}</details>`).join(''));
    return h;
  }
  companyPanel() {
    const g = this.g, s = this.s;
    let h = this.head('🏭', 'Entreprise', s.company ? esc(s.company.nom) : 'Pas encore de société');
    if (!s.company) return h + `<p>Pour avoir votre usine, votre atelier ou votre boutique :</p><ol class="small"><li>Créez votre société à l’Hôtel de ville (statuts d’un avocat + immatriculation d’un greffier).</li><li>Achetez un terrain, puis livrez les documents (architecte, géomètre, notaire, secrétaire…) et les matériaux (briques, mortier, poutres, verre, câbles…), tous produits par d’autres.</li><li>Engagez maçon, charpentier, plombier, électricien, peintre, puis le conducteur de travaux.</li><li>Achetez des machines (construites par les mécaniciens industriels), faites-les installer par un électricien, embauchez des habitants avec un contrat de travail.</li></ol>${this.btn('Aller à l’Hôtel de ville', 'go', { id: 'mairie' }, { cls: 'primary' })}`;
    if (!s.buildings.length) h += `<p>Aucun bâtiment. ${this.btn('Acheter un terrain (Hôtel de ville)', 'go', { id: 'mairie' })}</p>`;
    for (const b of s.buildings) h += b.stage === 'chantier' ? this.projectCard(b) : this.buildingCard(b);
    return h;
  }
  projectCard(b) {
    const g = this.g, s = this.s, B = BUILDINGS[b.type];
    const line = (kind, id, q) => { const have = b[kind][id] || 0; return `<span class="req ${have >= q ? 'ok' : (s.inv[id] ? 'mid' : 'no')}" data-a="open" data-k="good" data-id="${id}">${def(id).emoji} ${esc(def(id).nom)} ${have}/${q}</span>`; };
    let h = `<p class="small">Documents :</p><p>${Object.entries(B.docs).map(([i, q]) => line('docs', i, q)).join(' ')}</p><p class="small">Matériaux :</p><p>${Object.entries(B.mats).map(([i, q]) => line('mats', i, q)).join(' ')}</p>
      ${this.btn('Livrer ce que j’ai', 'deliver', { b: b.id })}${this.btn('Acheter ce qui manque', 'buymissing', { b: b.id }, { cls: 'primary' })}<h4>Ouvriers</h4>`;
    for (const step of BUILD_STEPS) {
      const svc = Object.values(SERVICES).find((x) => x.step === step);
      const done = b.steps[step];
      const why = g.stepReady(b, step);
      const provs = this.m.providers(svc.id).slice(0, 2);
      const mine = s.job && svc.jobs.includes(s.job);
      h += `<div class="row"><div>${done ? '✅' : '⬜'} ${esc(BUILD_STEP_NAMES[step])}${!done && why ? `<br><span class="small">${esc(why)}</span>` : ''}</div><div class="col">${done ? '' :
        (mine ? this.btn('Le faire moi-même', 'dostep', { b: b.id, st: step }, { disabled: !!why }) : '') + (provs.length ? provs.map((p) => this.btn(`${esc(p.c.nom)} · ${p1(p.price)}`, 'service', { svc: svc.id, c: p.c.id, arg: b.id }, { disabled: !!why })).join('') : '<span class="warn small">personne</span>')}</div></div>`;
    }
    return this.section(`🏗️ Chantier : ${esc(b.nom)} (${B.nom.toLowerCase()})`, h);
  }
  buildingCard(b) {
    const g = this.g, s = this.s, B = BUILDINGS[b.type];
    let h = `<p class="small">Réputation ${Math.round(b.rep || 0)} · usure des machines ${Math.round(b.wear || 0)}${(b.wear || 0) > 40 ? ' <span class="warn">(production divisée par 2 : maintenance !)</span>' : ''}${b.employees.length ? ` · paie jusqu’au jour ${Math.floor(b.paidUntil / 1440) + 1}${b.strike ? ' <span class="warn">GRÈVE : fiches de paie manquantes</span>' : ''}` : ''}</p>`;
    // machines
    const machinesInv = Object.keys(s.inv).filter((id) => def(id)?.cat === 'machine' || id === 'reacteur_plasma');
    const elec = this.m.providers('installation_machine')[0];
    h += `<h4>Machines (${b.machines.length}/${B.slots})</h4>${b.machines.map((m) => `<span class="tag">${def(m).emoji} ${esc(def(m).nom)}</span>`).join(' ') || '<span class="small">aucune</span>'}`;
    if (machinesInv.length && b.machines.length < B.slots) h += machinesInv.map((m) => `<div class="row small"><div>${def(m).emoji} ${esc(def(m).nom)} (dans votre sac)</div>${elec ? this.btn(`Installer (${esc(elec.c.nom)}, ${p1(elec.price)})`, 'install_m', { b: b.id, m, c: elec.c.id }) : '<span class="warn">aucun électricien</span>'}</div>`).join('');
    else if (b.machines.length < B.slots) h += `<p class="small">Achetez une machine à la Zone industrielle ou au Comptoir (catégorie Machines), puis installez-la ici.</p>`;
    const maint = this.m.providers('maintenance_machine')[0];
    if ((b.wear || 0) > 0 && maint) h += this.btn(`Maintenance (${esc(maint.c.nom)}, ${p1(maint.price)})`, 'service', { svc: 'maintenance_machine', c: maint.c.id });
    // employés
    h += `<h4>Employés (${b.employees.length}/${B.workers}) · ${this.req('contrat_travail')} par embauche, ${this.req('fiches_paie')} chaque semaine</h4>`;
    for (const cid of b.employees) {
      const c = this.m.citizen(cid);
      const recs = (RECIPES_BY_JOB[c.job] || []).filter((r) => !r.machine || b.machines.includes(r.machine));
      h += `<div class="row small"><div><b>${esc(c.nom)}</b> · ${esc(JOBS[c.job].nom)} · ${fmt(g.wageOf(c))}/jour<br><select data-c="prod" data-b="${b.id}" data-cid="${cid}">${recs.map((r) => `<option value="${r.idx}" ${b.prod[cid] === r.idx ? 'selected' : ''}>${Object.entries(r.out).map(([i, q]) => `${def(i).nom} ×${q}`).join(' + ')} ← ${Object.entries(r.in).map(([i, q]) => `${def(i).nom} ×${q}`).join(', ') || 'rien'}</option>`).join('')}</select></div>${this.btn('Licencier', 'fire', { b: b.id, c: cid })}</div>`;
    }
    if (b.employees.length < B.workers) {
      const cands = g.hireCandidates(b).slice(0, 8);
      h += cands.length ? `<details><summary>Embaucher (${cands.length} candidats)</summary>${cands.map((c) => `<div class="row small"><div>${esc(c.nom)} · ${esc(JOBS[c.job].nom)} · ${fmt(g.wageOf(c))}/jour</div>${this.btn('Embaucher', 'hire', { b: b.id, c: c.id })}</div>`).join('')}</details>`
        : '<p class="small">Installez des machines pour attirer des candidats (ou un atelier/une boutique).</p>';
    }
    h += `<label class="small"><input type="checkbox" data-c="autobuy" data-b="${b.id}" ${b.autoBuy ? 'checked' : ''}> Acheter automatiquement les matières aux producteurs</label>`;
    // stock et ventes
    const st = Object.entries(b.stock).filter(([, q]) => q > 0);
    h += `<h4>Stock du bâtiment</h4>${st.length ? st.map(([id, q]) => `<div class="row small"><div>${def(id).emoji} ${esc(def(id).nom)} ×${q}${b.sell[id] ? ` · en vente à <input class="pin" type="number" step="0.1" value="${b.sell[id]}" data-c="bsell" data-b="${b.id}" data-id="${id}"> ₵` : ''}</div><div>${b.sell[id] ? this.btn('Ne plus vendre', 'bunsell', { b: b.id, id }) : this.btn('Vendre', 'bsellon', { b: b.id, id })}${this.btn('Prendre', 'btake', { b: b.id, id, n: q })}</div></div>`).join('') : '<p class="small">Vide.</p>'}`;
    const putable = Object.keys(s.inv).filter((id) => def(id)?.kind === 'resource' || ['agro', 'materiau', 'meca', 'energie'].includes(def(id)?.cat));
    if (putable.length) h += `<details><summary>Déposer des matières</summary>${putable.map((id) => `<div class="row small"><div>${def(id).emoji} ${esc(def(id).nom)} ×${s.inv[id]}</div>${this.btn('Déposer', 'bput', { b: b.id, id, n: s.inv[id] })}</div>`).join('')}</details>`;
    h += this.btn('Aller au bâtiment', 'gobuilding', { x: b.pos[0], z: b.pos[1] });
    return this.section(`${B.emoji} ${esc(b.nom)}`, h);
  }
  marketPanel() {
    const short = this.m.shortageList(15);
    const e = this.s.eco;
    const jobsCount = {};
    for (const c of e.citizens) jobsCount[c.job] = (jobsCount[c.job] || 0) + 1;
    let h = this.head('📊', 'Marché de la ville', `${e.citizens.length} habitants · tous les produits viennent de quelqu’un`);
    h += `<p class="small">Dans cette version, les autres joueurs sont des habitants simulés : chacun exerce un métier, achète ses matières, vend sa production et paie des services. Plus tard, de vrais joueurs pourront prendre ces places.</p>`;
    h += this.section('📣 Pénuries du jour (places à prendre)', short.map((x) => `<div class="row small"><div><b>${esc(x.nom)}</b> · ${x.n} demandes non servies<br>${esc(this.jobsText(x.jobs))}</div>${x.kind === 'good' ? this.btn('Voir', 'open', { k: 'good', id: x.id }) : ''}</div>`).join('') || '<p class="small">Rien ne manque.</p>');
    const watch = ['pain', 'eau', 'electricite', 'acier', 'planches', 'briques', 'tissu', 'antibiotique', 'moteur', 'voiture', 'plan_archi', 'acte_notarie'];
    h += this.section('💹 Quelques prix', watch.map((id) => { const p = this.m.bestPrice(id); return `<div class="row small"><div>${this.goodLink(id)}</div><b>${p === null ? '<span class="warn">rupture</span>' : p1(p)}</b></div>`; }).join(''));
    h += this.section('🔎 Explorer une chaîne de production', `<select data-c="explore"><option value="">Choisir un produit…</option>${Object.keys(PRODUCERS).sort((a, b) => def(a).nom.localeCompare(def(b).nom)).map((id) => `<option value="${id}">${def(id).emoji} ${esc(def(id).nom)}</option>`).join('')}</select>`);
    return h;
  }
  homePanel() {
    const g = this.g, s = this.s;
    const ho = s.housing && HOUSING[s.housing.type];
    let h = this.head('🏠', 'Ma maison', ho ? `${ho.nom} · confort ${g.homeComfort()} · ${s.home.length}/${ho.slots}` : 'Pas de logement');
    if (!ho) return h + '<p>Sans logement : hôtel ou nuit dehors.</p>' + this.btn('Agence immobilière', 'go', { id: 'immobilier' }, { cls: 'primary' }) + this.btn('Dormir dehors (8 h)', 'sleepout');
    const here = g.atHome();
    if (!here) h += `<div class="goto">${this.btn('Rentrer chez moi', 'go', { id: 'residences' }, { cls: 'primary' })}</div>`;
    h += this.section('Vie quotidienne', `<div class="row"><div><b>Dormir 8 h</b> · ${g.homeHasBed() ? 'lit installé' : '<span class="warn">pas de lit</span>'}${s.flags.cleanUntil > s.time ? ' · maison propre' : ''}</div>${this.btn('Dormir', 'sleephome', {}, { disabled: !here })}</div>
      <div class="row"><div><b>Douche</b> · ${this.req('eau', 2)} ${has(s, 'savon') ? '+ savon' : ''}</div>${this.btn('Se laver', 'homeact', { k: 'douche' }, { disabled: !here })}</div>
      ${s.home.includes('radio') ? `<div class="row"><div>📻 Radio · 1 h</div>${this.btn('Écouter', 'homeact', { k: 'radio' }, { disabled: !here })}</div>` : ''}
      ${s.home.includes('ordinateur') ? `<div class="row"><div>🖥️ Ordinateur · 1 h 30</div>${this.btn('Se détendre', 'homeact', { k: 'ordi' }, { disabled: !here })}</div>` : ''}
      <p class="small">Ménage (aides à domicile), dépannage (plombiers) et rénovation (peintres) : services aux Résidences.</p>`);
    h += this.section('Meubles installés', s.home.length ? s.home.map((id, i) => `<div class="row"><div>${def(id).emoji} ${esc(def(id).nom)} · +${def(id).comfort}</div>${this.btn('Retirer', 'uninstall', { i }, { disabled: !here })}</div>`).join('') : '<p class="small">Aucun meuble (Meubles & Déco).</p>');
    const cook = RECIPES.filter((r) => r.home);
    h += this.section('🍳 Cuisine', g.homeHas('cooking') ? cook.map((r) => `<div class="row"><div>${Object.entries(r.out).map(([i, q]) => `${def(i).emoji} ${def(i).nom} ×${q}`).join('')} ← ${Object.entries(r.in).map(([i, q]) => this.req(i, q)).join(' ')}</div>${this.btn('Cuisiner', 'craft', { i: r.idx }, { disabled: !!g.canCraft(r) })}</div>`).join('') : '<p class="small">Installez une cuisine équipée.</p>');
    return h;
  }
  familyPanel() {
    const s = this.s, f = s.family;
    let h = this.head('💞', 'Famille', f.married ? `Marié(e) à ${esc(f.partner.nom)}` : f.partner ? `En couple avec ${esc(f.partner.nom)}` : 'Célibataire');
    if (f.partner) {
      h += this.section('Relation', `<p>Affection <b>${Math.round(f.partner.love)}</b>/100</p><div class="bar big"><i style="width:${f.partner.love}%"></i></div>`);
      const gifts = Object.keys(s.inv).filter((id) => def(id)?.gift);
      h += this.section('🎁 Cadeaux', gifts.length ? gifts.map((id) => `<div class="row"><div>${def(id).emoji} ${esc(def(id).nom)} · +${def(id).gift}</div>${this.btn('Offrir', 'gift', { id })}</div>`).join('') : `<p class="small">${this.btn('Boutique de cadeaux', 'go', { id: 'cadeaux' })}</p>`);
    } else h += `<p>Rencontres : Club Néon, conseiller en image pour plus de charme.</p>${this.btn('Club Néon', 'go', { id: 'club' })}`;
    const pets = s.pets || [];
    h += this.section('🐾 Animaux', pets.length ? pets.map((pt) => `<p>${PETS[pt.type].emoji} ${esc(pt.nom)} · faim ${Math.round(pt.faim)} · santé ${Math.round(pt.sante)}</p>`).join('') + `<p class="small">Croquettes chaque jour (${this.req('croquettes')}), vétérinaire s’il est malade.</p>` : `<p class="small">Chiots et chatons à la clinique vétérinaire. ${this.btn('Y aller', 'go', { id: 'veterinaire' })}</p>`);
    const fr = Object.entries(s.friends || {}).filter(([, v]) => v >= 5).sort((a, b) => b[1] - a[1]).slice(0, 15);
    h += this.section(`🤝 Amis (notoriété ${Math.round(s.notoriety || 0)})`, (fr.length ? fr.map(([cid, v]) => { const c = this.m.citizen(cid); return c ? `<div class="row small"><div>${esc(c.nom)} · ${esc(JOBS[c.job].nom)} · amitié ${Math.round(v)}${v >= 70 ? ' 💛' : v >= 30 ? ' 🤝' : ''}</div>${v >= 70 && !s.flags.friendLoan ? this.btn('Emprunter', 'borrow', { c: cid }) : ''}</div>` : ''; }).join('') : '<p class="small">Discutez avec les gens dans les lieux, utilisez leurs services : ils deviennent vos amis (−10 % chez eux, invitations, prêts).</p>')
      + (s.flags.friendLoan ? `<p class="warn">Vous devez ${fmt(s.flags.friendLoan.amount)} à un ami. ${this.btn('Rembourser', 'repay')}</p>` : ''));
    h += this.section('👶 Enfants', f.children.length ? f.children.map((c) => `<p>${esc(c.nom)} · éducation ${Math.round(c.growth || 0)} · bonheur ${Math.round(c.happy ?? 70)}</p>`).join('') + '<p class="small">Orthophoniste, éducateur, colonie : plus d’éducation et de bonheur.</p>' : '<p class="small">Adoption à la Maison de la famille.</p>');
    return h;
  }
  placesPanel() {
    const row = (p) => `<div class="row"><div>${p.emoji} ${esc(p.nom)} <span class="small">${Math.round(this.a.distanceTo(p.id))} m</span></div><div>${this.btn('Voir', 'open', { k: 'place', id: p.id })}${this.btn('Y aller', 'go', { id: p.id })}</div></div>`;
    return this.head('📍', 'Lieux', '') + this.section('🗺️ Sites de ressources', SITES.map(row).join('')) + this.section('🏙️ Capitale', PLACES.map(row).join(''));
  }
  guidePanel() {
    let h = this.head('📖', 'Besoins', 'Tout se paie, et tout est fait par quelqu’un.');
    for (const [title, rows] of GUIDE) h += this.section(esc(title), rows.map(([txt, ids]) => `<div class="row small"><div>${esc(txt)}</div><div>${ids.map((id) => this.btn(PLACE_BY_ID[id].emoji, 'open', { k: 'place', id }, { title: PLACE_BY_ID[id].nom })).join('')}</div></div>`).join(''));
    h += this.btn('Recommencer une nouvelle vie', 'reset', {}, { cls: 'danger' });
    return h;
  }
  mailPanel() {
    const s = this.s;
    for (const m of s.mail || []) m.read = true;
    const icon = { facture: '🧾', impot: '🏛️', amende: '🚨', info: '📰', ami: '💌' };
    let h = this.head('📬', 'Courrier', 'Factures, impôts, amendes, nouvelles et messages de vos amis');
    h += '<p class="small">Payez avant la date limite : sinon +10 %, puis saisie par un huissier (+25 %).</p>';
    h += (s.mail || []).map((m) => `<div class="row"><div>${icon[m.kind] || '✉️'} <b>${esc(m.subject)}</b><br><span class="small">${esc(m.from)} · ${clock(m.t)}${m.amount && !m.paid ? ` · à payer avant ${clock(m.due)}${m.late ? ' (majoré)' : ''}` : ''}</span></div>${m.amount ? (m.paid ? '<span class="tag">Payé</span>' : this.btn(`Payer ${p1(m.amount)}`, 'paymail', { id: m.id }, { cls: 'primary' })) : ''}</div>`).join('') || '<p class="small">Boîte aux lettres vide.</p>';
    return h;
  }
  cityPanel() {
    const g = this.g, s = this.s, pol = g.policy(), ev = g.event();
    let h = this.head('🏛️', 'La ville de Nexus', `Année ${yearOf(s.time)} · ${seasonOf(s.time).emoji} ${seasonOf(s.time).nom}`);
    h += this.section('📰 Actualité', ev ? `<p><b>${ev.emoji} ${ev.nom}</b> : ${esc(ev.txt)}</p>` : '<p class="small">Rien de spécial en ce moment.</p>');
    h += this.section('🏛️ Mairie', `<p>Maire : <b>${s.city?.mayor === 'player' ? 'vous !' : esc(s.city?.mayorName || 'aucun (intérim)')}</b> · politique : <b>${esc(pol.nom)}</b></p><p class="small">${esc(pol.txt)} TVA ${Math.round(pol.tva * 100)} % sur toutes les ventes.</p>`);
    h += this.section('📅 Calendrier', `<p class="small">Une année = 28 jours (4 saisons de 7 jours). L’hiver, les récoltes baissent et le chauffage coûte cher ; l’été, attention à la canicule.</p><p class="small">Jours fériés : 5 Fête du travail · 10 Fête de la ville · 12 Fête de la musique · 21 Halloween · 26 Noël · 28 Réveillon. Élections municipales un dimanche sur deux.</p>`);
    h += this.section('👤 Vous', `<p>${s.age || 25} ans · notoriété ${Math.round(s.notoriety || 0)}/100 · revenus de la semaine ${fmt(s.weekIncome || 0)}</p>`);
    return h;
  }
  electionSection(dis) {
    const g = this.g, s = this.s, e = g.electionState();
    if (!e) return this.section('🗳️ Élections', `<p class="small">Pas d’élection cette semaine (une semaine sur deux, vote le dimanche à 20 h).</p>${s.city?.mayor === 'player' ? this.policySelect() : ''}`);
    let h = e.cands.map((c) => `<div class="row small"><div><b>${esc(c.nom)}</b> (${esc(JOBS[c.job].nom.toLowerCase())}) · ${esc(PROGRAMMES.find((p) => p.id === c.prog).nom)}</div>${e.voted === c.id ? '<span class="tag">Votre vote</span>' : this.btn('Voter', 'vote', { c: c.id }, { disabled: dis })}</div>`).join('');
    if (e.player) h += `<div class="row small"><div><b>Vous</b> · ${esc(PROGRAMMES.find((p) => p.id === e.playerProg).nom)}</div>${e.voted === 'player' ? '<span class="tag">Votre vote</span>' : this.btn('Voter', 'vote', { c: 'player' }, { disabled: dis })}</div>`;
    else h += `<p class="small">Se présenter (notoriété ≥ 30, 1 500 ₵ de campagne) :</p>${PROGRAMMES.map((p) => this.btn(p.nom, 'run', { p: p.id }, { disabled: dis, title: p.txt })).join('')}`;
    return this.section('🗳️ Élections de dimanche', h + (s.city?.mayor === 'player' ? this.policySelect() : ''));
  }
  policySelect() { return `<p class="small">Vous êtes maire : choisissez la politique de la ville.</p>${PROGRAMMES.map((p) => this.btn(p.nom, 'policy', { p: p.id }, { cls: this.s.city.programme === p.id ? 'on' : '', title: p.txt })).join('')}`; }
  journalPanel() { return this.head('📜', 'Journal', '') + this.s.log.map((l) => `<div class="log ${l.kind}"><span>${clock(l.t)}</span> ${esc(l.msg)}</div>`).join(''); }

  // ------------------------------------------------------------------ actions
  onChange(e) {
    const t = e.target, c = t.dataset.c, g = this.g;
    if (!c) return;
    if (c === 'sector') this.tab.sector = t.value;
    else if (c === 'dest') { this.tab.dest = t.value; return; }
    else if (c === 'item') { this.tab.item = t.value; return; }
    else if (c === 'cat') this.tab.cat = t.value;
    else if (c === 'explore') { if (t.value) this.open('good', t.value); return; }
    else if (c === 'svcprice') g.setServicePrice(t.dataset.id, Number(t.value));
    else if (c === 'listprice') { const l = this.s.listings[t.dataset.id]; g.setListing(t.dataset.id, l.qty, Number(t.value), false); }
    else if (c === 'listauto') { const l = this.s.listings[t.dataset.id]; l.auto = t.checked; if (l.auto) g.autoPrices(); }
    else if (c === 'prod') g.setProd(t.dataset.b, t.dataset.cid, t.value);
    else if (c === 'autobuy') this.s.buildings.find((b) => b.id === t.dataset.b).autoBuy = t.checked;
    else if (c === 'bsell') g.setBuildingSale(t.dataset.b, t.dataset.id, Number(t.value));
    g.changed();
  }
  onClick(e) {
    const b = e.target.closest('[data-a]');
    if (!b || b.disabled) return;
    const d = b.dataset, g = this.g, s = this.s;
    const num = (k) => (d[k] !== undefined && d[k] !== '' ? Number(d[k]) : undefined);
    let r = null;
    switch (d.a) {
      case 'open': this.open(d.k, d.id); return;
      case 'tab': this.tab[d.t] = isNaN(Number(d.v)) ? d.v : Number(d.v); this.render(); return;
      case 'go': this.a.travelTo(d.id); return;
      case 'gobuilding': this.a.travelToPoint(num('x'), num('z')); return;
      case 'transport': r = g.setTransport(d.id); break;
      case 'buy': r = g.buyGood(d.id, num('n') || 1); break;
      case 'use': r = g.use(d.id); break;
      case 'service': {
        const sv = SERVICES[d.svc];
        let arg = d.arg;
        if (['teleport', 'train', 'flight', 'taxi', 'tour'].includes(sv.special)) arg = this.tab.dest || SITES[0].id;
        if (['consign', 'export', 'parcel'].includes(sv.special)) arg = this.tab.item;
        r = g.buyService(d.svc, d.c, arg);
        if (r.msg === 'minigame') { this.a.minigame(); r = null; }
        break;
      }
      case 'serve': r = g.serve(d.id); break;
      case 'work': r = g.work(); break;
      case 'oddjob': r = g.work(true); break;
      case 'quit': r = g.quitJob(); break;
      case 'train': r = g.buyService('formation', d.c, d.id); break;
      case 'takejob': r = g.takeJob(d.id); break;
      case 'permit': r = g.buyPermit(d.id); break;
      case 'gather': r = g.gather(d.site, d.g); break;
      case 'craft': r = g.craft(num('i'), num('n') || 1); break;
      case 'buyinputs': {
        const rec = RECIPES[num('i')];
        const parts = [];
        for (const [id, q] of Object.entries(rec.in)) { const miss = q - (s.inv[id] || 0); if (miss > 0) { const x = g.m.buy('player', id, miss); if (x.n) parts.push(`${def(id).emoji}${x.n} (−${fmt(x.spent)})`); else parts.push(`${def(id).nom} introuvable`); } }
        if (rec.tool && !has(s, rec.tool)) { const x = g.m.buy('player', rec.tool, 1); parts.push(x.n ? `${def(rec.tool).nom} (−${fmt(x.spent)})` : `${def(rec.tool).nom} introuvable`); }
        g.m.dirty = true;
        this.toast(parts.length ? `Achats : ${parts.join(', ')}` : 'Vous avez déjà tout.', 'info');
        break;
      }
      case 'list': r = g.setListing(d.id, s.inv[d.id], g.suggestedPrice(d.id)); if (r.ok) this.toast(`${def(d.id).nom} mis en vente : les acheteurs passeront au fil des jours.`, 'good'); break;
      case 'unlist': r = g.setListing(d.id, 0); break;
      case 'quicksell': r = g.quickSell(d.id, num('n')); break;
      case 'wh': r = g.warehouseMove(d.id, num('n'), d.to === '1'); break;
      case 'refitem': r = g.refuelWithItem(d.id); break;
      case 'vrent': r = g.rentVehicle(d.id); break;
      case 'dropcase': r = g.dropCase(); break;
      case 'clubpass': r = g.buyClubPass(); break;
      case 'clubnight': r = g.clubNight(); break;
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
      case 'marry': r = g.marry(); break;
      case 'gift': r = g.gift(d.id); break;
      case 'adopt': r = g.adopt(); break;
      case 'createco': r = g.createCompany($('#coname')?.value.trim()); break;
      case 'project': r = g.startProject(d.t); if (r.ok) { this.open('company'); g.changed(); return; } break;
      case 'deliver': r = g.deliver(d.b); break;
      case 'buymissing': r = g.buyMissing(d.b); break;
      case 'dostep': r = g.doStep(d.b, d.st); break;
      case 'install_m': r = g.buyService('installation_machine', d.c, { b: d.b, m: d.m }); break;
      case 'hire': r = g.hire(d.b, d.c); break;
      case 'fire': r = g.fire(d.b, d.c); break;
      case 'btake': r = g.takeFromBuilding(d.b, d.id, num('n')); break;
      case 'bput': r = g.putInBuilding(d.b, d.id, num('n')); break;
      case 'bsellon': r = g.setBuildingSale(d.b, d.id, g.m.refPrice(d.id)); break;
      case 'bunsell': r = g.setBuildingSale(d.b, d.id, 0); break;
      case 'sbuy': r = g.buyStock(d.id, num('n')); break;
      case 'ssell': r = g.sellStock(d.id, num('n')); break;
      case 'deposit': r = g.deposit(num('a'), num('d')); break;
      case 'waitopen': r = g.waitOpen(d.id); break;
      case 'chat': r = g.chat(d.c); break;
      case 'park': r = g.parkActivity(d.k); break;
      case 'paymail': r = g.payMail(d.id); break;
      case 'invite': r = g.attendInvite(); break;
      case 'borrow': r = g.borrowFromFriend(d.c); break;
      case 'repay': r = g.repayFriend(); break;
      case 'vote': r = g.vote(d.c); break;
      case 'run': r = g.runForMayor(d.p); break;
      case 'policy': r = g.setProgramme(d.p); break;
      case 'reset': if (confirm('Effacer votre partie et recommencer ?')) this.a.reset(); return;
      default: return;
    }
    if (r && !r.ok) this.toast(r.msg, 'bad');
    g.changed();
  }
}
