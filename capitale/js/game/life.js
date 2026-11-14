// LA VIE QUOTIDIENNE : horaires, courrier, factures, impôts, sécurité sociale, actualités, élections, amis, animaux,
// loto, contrôles routiers, papiers d'identité, anniversaires et jours fériés.
// Ces fonctions sont ajoutées au moteur du jeu (Game) par installLife().
import { HOURS, EVENTS, TAX_BRACKETS, PROPERTY_TAX, BILL_PRICES, PROGRAMMES, MAYOR_SALARY, PETS, PET_NAMES,
  weekday, seasonOf, holidayOf, dayOfYear, yearOf, DAYS } from '../data/life.js';
import { SERVICES } from '../data/economy.js';
import { JOBS } from '../data/jobs.js';
import { NAMES } from '../data/places.js';
import { def, has, addItem, removeItem, log, clamp, fmt, hourOf, day } from './state.js';

const rnd = Math.random;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const ok = (msg) => ({ ok: true, msg });
const fail = (msg) => ({ ok: false, msg });
export const DEFAULT_POLICY = PROGRAMMES[1];

export function installLife(Game) {
  const P = Game.prototype;

  // ------------------------------------------------------------------ calendrier et horaires
  P.policy = function () { return PROGRAMMES.find((p) => p.id === this.s.city?.programme) || DEFAULT_POLICY; };
  P.event = function () { const e = this.s.eco.event; return e && e.until > this.s.time ? EVENTS.find((x) => x.id === e.id) : null; };
  P.isOpen = function (placeId, t = this.s.time) {
    const H = HOURS[placeId];
    if (!H || this.place(placeId)?.kind || H.cat === 'always') return true;
    const hol = holidayOf(t);
    if (hol && ((H.cat === 'admin' && hol.ferme.includes('admin')) || (H.cat === 'shops' && hol.ferme.includes('shops')))) return false;
    if (H.closed?.includes(weekday(t))) return false;
    const h = hourOf(t), [o, c] = H.h;
    if (c > 24) return h >= o || h < c - 24;
    return h >= o && h < c;
  };
  P.waitTime = function (placeId) {
    let t = this.s.time, m = 0;
    while (!this.isOpen(placeId, t) && m < 8 * 1440) { t += 15; m += 15; }
    return m;
  };
  P.hoursText = function (placeId) {
    const H = HOURS[placeId];
    if (!H) return '';
    if (H.cat === 'always') return 'Ouvert 24 h/24';
    const f = (h) => `${h % 24} h`;
    return `${f(H.h[0])} – ${f(H.h[1])}${H.closed?.length ? ` · fermé le ${H.closed.map((d) => DAYS[d].toLowerCase()).join(' et ')}` : ''}${H.cat === 'admin' ? ' et les jours fériés' : ''}`;
  };
  P.waitOpen = function (placeId) {
    const m = this.waitTime(placeId);
    if (!m) return fail('C’est déjà ouvert.');
    if (m > 3 * 1440) return fail('Fermé pour plusieurs jours.');
    this.advance(m);
    log(this.s, `⏳ Vous avez attendu l’ouverture (${Math.round(m / 60)} h).`);
    return ok();
  };
  P.closedMsg = function (placeId) {
    if (!placeId || this.isOpen(placeId)) return null;
    return `${this.place(placeId).nom} est fermé (${this.hoursText(placeId)}).`;
  };

  // ------------------------------------------------------------------ courrier
  P.mail = function (kind, from, subject, amount = 0, extra = {}) {
    const s = this.s;
    s.mail = s.mail || [];
    s.mail.unshift({ id: `m${s.time}-${Math.floor(rnd() * 1e6)}`, t: s.time, kind, from, subject, amount: Math.round(amount * 10) / 10, due: amount ? s.time + 3 * 1440 : 0, paid: !amount, read: false, late: 0, ...extra });
    if (s.mail.length > 60) s.mail.length = 60;
    log(s, `📬 Courrier : ${subject}${amount ? ` (${fmt(amount)} à payer)` : ''}.`, kind === 'amende' || kind === 'impot' ? 'warn' : 'info');
  };
  P.unread = function () { return (this.s.mail || []).filter((m) => !m.read || (!m.paid && m.amount)).length; };
  P.payMail = function (id) {
    const m = (this.s.mail || []).find((x) => x.id === id);
    if (!m || m.paid) return fail('Rien à payer.');
    if (!this.pay(m.amount)) return fail(`Pas assez d’argent (${fmt(m.amount)}).`);
    m.paid = true; m.read = true;
    if (m.goods) for (const [id2, q] of Object.entries(m.goods)) {      // la facture paie vraiment les producteurs
      const r = this.m.buy('player', id2, q);
      if (r.n) { this.s.money += r.spent; this.s.inv[id2] -= r.n; if (this.s.inv[id2] <= 0) delete this.s.inv[id2]; }
    }
    if (m.svc) { const p = this.m.providers(m.svc)[0]; if (p) p.c.money += m.amount * 0.9; }
    this.s.eco.budget += m.goods || m.svc ? 0 : m.amount;
    log(this.s, `✅ Payé : ${m.subject} (−${fmt(m.amount)}).`);
    return ok();
  };
  P.chaseBills = function () {
    for (const m of this.s.mail || []) {
      if (m.paid || !m.amount || this.s.time < m.due) continue;
      if (m.late === 0) { m.late = 1; m.amount = Math.round(m.amount * 1.1); m.due = this.s.time + 3 * 1440; log(this.s, `⚠️ Retard de paiement : ${m.subject} majoré de 10 %.`, 'bad'); }
      else {
        const total = Math.round(m.amount * 1.25);
        this.forcePay(total, `saisie par huissier (${m.subject})`);
        const h = this.m.providers('recouvrement')[0]; if (h) h.c.money += total - m.amount;
        m.paid = true;
        log(this.s, `🧾 Un huissier a saisi ${fmt(total)} pour « ${m.subject} » (majoration comprise).`, 'bad');
        this.s.notoriety = clamp((this.s.notoriety || 0) - 5, 0, 100);
      }
    }
  };

  // ------------------------------------------------------------------ chaque semaine : factures et impôts
  P.weeklyTick = function () {
    const s = this.s, pol = this.policy();
    if (s.housing) {
      const season = seasonOf(s.time);
      const apps = s.home.filter((id) => ['appareil', 'climat'].includes(def(id)?.cat)).length;
      const elec = Math.round(5 + apps * 2 + season.chauffage * (s.home.includes('chauffage') ? 4 : 2));
      const eau = 6;
      const pe = this.m.refPrice('electricite'), pw = this.m.refPrice('eau');
      this.mail('facture', 'Fournisseurs d’énergie et d’eau', `Facture électricité (${elec} lots) et eau (${eau} bouteilles) de la semaine`, elec * pe + eau * pw, { goods: { electricite: elec, eau } });
      this.mail('facture', 'Service de collecte des déchets', 'Ramassage des ordures', BILL_PRICES.ordures, { svc: 'collecte_dechets' });
      const t = PROPERTY_TAX[s.housing.type];
      if (t) this.mail('impot', 'Centre des impôts', s.housing.type === 'location' ? 'Taxe d’habitation' : 'Taxe foncière', t);
    }
    const income = s.weekIncome || 0;
    let tax = 0, prev = 0;
    for (const [lim, rate] of TAX_BRACKETS) { const part = Math.max(0, Math.min(income, lim) - prev); tax += part * rate; prev = lim; if (income <= lim) break; }
    tax *= pol.ir;
    if (tax >= 1) this.mail('impot', 'Centre des impôts', `Impôt sur le revenu (revenus de la semaine : ${fmt(income)})`, tax);
    const comp = (s.weekCompany || 0) * 0.15 * (pol.company || 1);
    if (comp >= 1) this.mail('impot', 'Centre des impôts', `Impôt sur les sociétés (ventes de vos bâtiments : ${fmt(s.weekCompany)})`, comp);
    s.weekIncome = 0; s.weekCompany = 0;
    // anniversaire
    if (dayOfYear(s.time) === 1 && day(s.time) > 1) {
      s.age = (s.age || 25) + 1;
      this.mail('info', 'Vos proches', `Joyeux anniversaire ! Vous avez ${s.age} ans`, 0);
      const friends = Object.entries(s.friends || {}).filter(([, v]) => v >= 30).length;
      if (friends) { this.earn(friends * 25); log(s, `🎂 Vos ${friends} ami(s) vous offrent ${fmt(friends * 25)}.`, 'good'); }
    }
  };

  // ------------------------------------------------------------------ chaque jour
  P.lifeDaily = function () {
    const s = this.s;
    s.notoriety = clamp((s.notoriety || 0) - 0.3, 0, 100);
    this.chaseBills();
    // jour férié
    const hol = holidayOf(s.time);
    if (hol) {
      this.applyEff({ moral: hol.moral });
      log(s, `${hol.emoji} Aujourd’hui : ${hol.nom} !${hol.ferme.length ? (hol.ferme.includes('shops') ? ' Administrations et commerces fermés.' : ' Administrations fermées.') : ''}`, 'good');
      if (hol.gifts && (s.family.partner || s.family.children.length || Object.keys(s.friends || {}).length)) {
        const g = pick(['chocolats', 'peluche', 'parfum', 'bouquet', 'smartphone', 'montre']);
        addItem(s, g, 1);
        log(s, `🎁 Vous recevez un cadeau : ${def(g).emoji} ${def(g).nom}.`, 'good');
      }
    }
    // saison : premier jour
    if ((dayOfYear(s.time) - 1) % 7 === 0) { const se = seasonOf(s.time); log(s, `${se.emoji} C’est le début de : ${se.nom.toLowerCase()}.${se.id === 'hiver' ? ' Chauffage et manteau !' : se.id === 'ete' ? ' Attention à la chaleur.' : ''}`, 'info'); }
    // actualités
    const ev = this.event();
    if (!ev) {
      if (s.eco.event) { const old = EVENTS.find((x) => x.id === s.eco.event.id); log(s, `📰 Fin de l’actualité : ${old?.nom}.`); s.eco.event = null; }
      if (rnd() < 0.16) this.startEvent(pick(EVENTS));
    }
    // chômage
    if (!s.job && s.flags.everEmployed && (s.flags.chomage || 0) < 20) { s.flags.chomage = (s.flags.chomage || 0) + 1; this.earn(40, true); log(s, '🏛️ Allocation chômage : +40 ₵.'); }
    if (s.job) s.flags.chomage = 0;
    // maire
    if (s.city?.mayor === 'player') { this.earn(MAYOR_SALARY, false); s.notoriety = clamp(s.notoriety + 0.5, 0, 100); }
    // animaux
    this.petsDaily();
    // amis : messages, invitations
    const friends = Object.entries(s.friends || {}).filter(([, v]) => v >= 30);
    for (const [cid] of friends) s.friends[cid] = Math.max(0, s.friends[cid] - 0.5);
    if (friends.length && rnd() < 0.25) {
      const c = this.m.citizen(pick(friends)[0]);
      if (c) {
        const kind = pick(['invite', 'conseil', 'cadeau']);
        if (kind === 'invite') { s.flags.inviteUntil = s.time + 1440; s.flags.inviteFrom = c.id; this.mail('ami', c.nom, 'Invitation à une soirée à la salle des fêtes (aujourd’hui)', 0); }
        else if (kind === 'cadeau') { const g = pick(['chocolats', 'bouquet', 'journal', 'fromage', 'vin']); addItem(s, g, 1); this.mail('ami', c.nom, `Petit cadeau : ${def(g).nom}`, 0); }
        else { const sh = this.m.shortageList(3)[0]; if (sh) this.mail('ami', c.nom, `Conseil : la ville manque de « ${sh.nom} » en ce moment`, 0); }
      }
    }
  };
  P.startEvent = function (ev) {
    const s = this.s;
    s.eco.event = { id: ev.id, until: s.time + ev.jours * 1440 };
    if (ev.weather) s.weather = { type: ev.weather, until: s.time + ev.jours * 1440 };
    if (ev.stocks) for (const k of Object.keys(s.stockPrices)) s.stockPrices[k] *= 1 + ev.stocks;
    if (ev.storm && s.housing) {
      if (s.homeInsuranceUntil > s.time) this.mail('info', 'Votre assurance habitation', 'Tempête : les dégâts de votre logement sont pris en charge', 0);
      else { s.flags.renov = (s.flags.renov || 0) - 6; this.mail('info', 'Météo Nexus', 'Tempête : votre logement est abîmé (confort −6). Un peintre peut le rénover. Pensez à l’assurance habitation.', 0); }
    }
    this.mail('info', 'Journal de Nexus', `${ev.emoji} ${ev.nom} : ${ev.txt}`, 0);
  };

  // ------------------------------------------------------------------ loto (tirage le dimanche à 20 h)
  P.lotoDraw = function () {
    const s = this.s, n = s.lotoTickets || 0;
    if (!n) return;
    let gain = 0;
    for (let i = 0; i < n; i++) { const r = rnd(); if (r < 1 / 1500) gain += 25000; else if (r < 1 / 80) gain += 150; else if (r < 1 / 8) gain += 4; }
    s.lotoTickets = 0;
    if (gain) this.earn(gain);
    this.mail('info', 'Loto de Nexus', gain >= 25000 ? `🎉 JACKPOT ! Vous gagnez ${fmt(gain)} !` : gain ? `Vous gagnez ${fmt(gain)} avec vos ${n} ticket(s)` : `Pas de gain cette semaine (${n} ticket(s))`, 0);
  };

  // ------------------------------------------------------------------ élections (un dimanche sur deux)
  P.electionState = function () {
    const s = this.s;
    const d = day(s.time) - 1;
    const week = Math.floor(d / 7);
    if (week % 2 === 0) return null;                   // semaine de campagne : une semaine sur deux
    const e = s.election;
    if (!e || e.week !== week) {
      const used = new Set();
      const cands = [];
      while (cands.length < 3) {
        const c = pick(s.eco.citizens); if (used.has(c.id)) continue; used.add(c.id);
        cands.push({ id: c.id, nom: c.nom, job: c.job, prog: pick(PROGRAMMES).id, score: 20 + rnd() * 30 });
      }
      s.election = { week, cands, voted: null, player: false };
      this.mail('info', 'Hôtel de ville', `Élections municipales dimanche : ${cands.map((c) => c.nom).join(', ')}. Votez à l’Hôtel de ville.`, 0);
    }
    return s.election;
  };
  P.vote = function (cid) {
    const e = this.electionState();
    if (!e) return fail('Pas d’élection cette semaine.');
    if (!this.at('mairie')) return fail('Le bureau de vote est à l’Hôtel de ville.');
    if (!has(this.s, 'carte_identite')) return fail('Il faut une carte d’identité pour voter (préfecture).');
    e.voted = cid;
    log(this.s, `🗳️ Vous avez voté pour ${cid === 'player' ? 'vous-même' : e.cands.find((c) => c.id === cid).nom}.`, 'good');
    return ok();
  };
  P.runForMayor = function (prog) {
    const s = this.s, e = this.electionState();
    if (!e) return fail('Les candidatures ouvrent la semaine des élections.');
    if (!this.at('mairie')) return fail('À l’Hôtel de ville.');
    if (e.player) return fail('Déjà candidat.');
    if ((s.notoriety || 0) < 30) return fail('Il faut une notoriété d’au moins 30 (servez des clients, faites-vous des amis, développez votre entreprise).');
    if (!has(s, 'carte_identite')) return fail('Il faut une carte d’identité.');
    if (!this.pay(1500)) return fail('La campagne coûte 1 500 ₵ (affiches, meetings).');
    e.player = true; e.playerProg = prog;
    log(s, `📣 Vous êtes candidat aux municipales avec le programme « ${PROGRAMMES.find((p) => p.id === prog).nom} ».`, 'good');
    return ok();
  };
  P.electionResult = function () {
    const s = this.s, e = s.election;
    if (!e || e.done === e.week) return;
    e.done = e.week;
    const scores = e.cands.map((c) => ({ id: c.id, nom: c.nom, prog: c.prog, v: c.score + rnd() * 25 + (e.voted === c.id ? 3 : 0) }));
    if (e.player) scores.push({ id: 'player', nom: s.nom, prog: e.playerProg, v: (s.notoriety || 0) * 0.9 + Object.keys(s.friends || {}).length * 2 + rnd() * 25 + (e.voted === 'player' ? 3 : 0) });
    scores.sort((a, b) => b.v - a.v);
    const w = scores[0];
    s.city = { mayor: w.id, mayorName: w.nom, programme: w.prog };
    this.mail('info', 'Hôtel de ville', `${w.id === 'player' ? '🎉 Vous êtes élu(e) maire de Nexus !' : `${w.nom} est élu(e) maire`} — programme : ${PROGRAMMES.find((p) => p.id === w.prog).nom}`, 0);
    if (w.id === 'player') s.notoriety = clamp((s.notoriety || 0) + 20, 0, 100);
  };
  P.setProgramme = function (prog) {
    if (this.s.city?.mayor !== 'player') return fail('Seul le maire peut changer la politique de la ville.');
    this.s.city.programme = prog;
    log(this.s, `🏛️ Nouvelle politique municipale : ${PROGRAMMES.find((p) => p.id === prog).nom}.`, 'good');
    return ok();
  };

  // ------------------------------------------------------------------ amis
  P.befriend = function (cid, pts = 8) {
    const s = this.s;
    s.friends = s.friends || {};
    const before = s.friends[cid] || 0;
    s.friends[cid] = clamp(before + pts, 0, 100);
    const c = this.m.citizen(cid);
    if (before < 30 && s.friends[cid] >= 30) { log(s, `🤝 ${c.nom} est maintenant votre ami(e) : −10 % sur ses services.`, 'good'); s.notoriety = clamp((s.notoriety || 0) + 2, 0, 100); }
    if (before < 70 && s.friends[cid] >= 70) log(s, `💛 ${c.nom} est un(e) ami(e) proche : il/elle peut vous prêter de l’argent.`, 'good');
  };
  P.chat = function (cid) {
    const c = this.m.citizen(cid);
    if (!c) return fail('Personne.');
    this.advance(30);
    this.befriend(cid, 6 + Math.round(rnd() * 6));
    this.applyEff({ moral: 3 });
    log(this.s, `💬 Vous discutez avec ${c.nom} (${JOBS[c.job].nom.toLowerCase()}). Amitié ${Math.round(this.s.friends[cid])}.`);
    return ok();
  };
  P.friendDiscount = function (cid) { return (this.s.friends?.[cid] || 0) >= 30 ? 0.9 : 1; };
  P.borrowFromFriend = function (cid) {
    const s = this.s, c = this.m.citizen(cid);
    if ((s.friends?.[cid] || 0) < 70) return fail('Il faut être ami(e) proche.');
    if (s.flags.friendLoan) return fail('Remboursez d’abord votre ami(e).');
    const amount = Math.min(400, Math.round(c.money * 0.3));
    if (amount < 50) return fail(`${c.nom} n’a pas assez d’argent.`);
    c.money -= amount; this.earn(amount, false);
    s.flags.friendLoan = { cid, amount };
    log(s, `🤝 ${c.nom} vous prête ${fmt(amount)}.`, 'good');
    return ok();
  };
  P.repayFriend = function () {
    const s = this.s, l = s.flags.friendLoan;
    if (!l) return fail('Aucune dette.');
    if (!this.pay(l.amount)) return fail('Pas assez d’argent.');
    const c = this.m.citizen(l.cid); if (c) c.money += l.amount;
    s.flags.friendLoan = null;
    this.befriend(l.cid, 5);
    log(s, `Vous avez remboursé ${c?.nom}.`);
    return ok();
  };
  P.attendInvite = function () {
    const s = this.s;
    if (!(s.flags.inviteUntil > s.time)) return fail('Pas d’invitation en cours.');
    if (!this.at('evenements')) return fail('La soirée a lieu à la salle des fêtes.');
    this.advance(180);
    this.applyEff({ moral: 20, faim: 30, soif: 30, energie: -10 });
    this.befriend(s.flags.inviteFrom, 10);
    s.flags.inviteUntil = 0;
    if (!s.family.partner && rnd() < 0.3) return this.meet('🎉 À la soirée de votre ami(e) :');
    log(s, '🎉 Belle soirée chez votre ami(e) !', 'good');
    return ok();
  };

  // ------------------------------------------------------------------ animaux
  P.adoptPet = function (id) {
    const s = this.s;
    if (!removeItem(s, id)) return fail('Animal absent.');
    s.pets = s.pets || [];
    const nom = pick(PET_NAMES);
    s.pets.push({ type: id, nom, faim: 80, sante: 100 });
    this.applyEff({ moral: 15 });
    log(s, `${PETS[id].emoji} Bienvenue à ${nom} ! Il lui faut des croquettes chaque jour et un vétérinaire s’il tombe malade.`, 'good');
    return ok();
  };
  P.petsDaily = function () {
    const s = this.s;
    for (const p of s.pets || []) {
      const need = PETS[p.type].mange;
      if (has(s, 'croquettes', need)) { removeItem(s, 'croquettes', need); p.faim = 100; }
      else { p.faim -= 45; log(s, `${PETS[p.type].emoji} ${p.nom} a faim : achetez des croquettes (clinique vétérinaire).`, 'warn'); }
      if (p.faim < 20) p.sante -= 20;
      if (rnd() < 0.04) { p.sante -= 35; log(s, `${PETS[p.type].emoji} ${p.nom} est malade : emmenez-le chez le vétérinaire.`, 'warn'); }
      p.sante = clamp(p.sante, 0, 100); p.faim = clamp(p.faim, 0, 100);
      if (p.sante <= 0) { log(s, `💔 ${p.nom} est mort faute de soins…`, 'bad'); this.applyEff({ moral: -30 }); p.dead = true; continue; }
      this.applyEff({ moral: p.sante > 50 && p.faim > 40 ? PETS[p.type].moral : -3 });
    }
    s.pets = (s.pets || []).filter((p) => !p.dead);
  };

  // ------------------------------------------------------------------ parc
  P.parkActivity = function (kind) {
    const s = this.s;
    if (!this.at('parc')) return fail('Au parc.');
    if (kind === 'promenade') { this.advance(60); this.applyEff({ moral: 6, energie: -3 }); log(s, '🌳 Promenade au parc : +6 moral.'); }
    if (kind === 'jogging') { if (s.stats.energie < 15) return fail('Trop fatigué.'); this.advance(60); this.applyEff({ sante: 4, moral: 4, energie: -12, soif: -12, hygiene: -10 }); s.buffs.forme = s.time + 12 * 60; log(s, '🏃 Jogging : +4 santé, en forme 12 h.'); }
    if (kind === 'piquenique') {
      const food = ['sandwich', 'pain', 'fromage', 'fruits_legumes', 'plat'].find((id) => has(s, id));
      if (!food) return fail('Apportez à manger (sandwich, pain, fromage…).');
      removeItem(s, food); this.advance(90); this.applyEff({ faim: 30, moral: 10 }); log(s, `🧺 Pique-nique au parc avec ${def(food).nom.toLowerCase()} : +10 moral.`);
    }
    if (kind === 'chien') {
      const dog = (s.pets || []).find((p) => p.type === 'chiot');
      if (!dog) return fail('Pas de chien à promener.');
      this.advance(60); this.applyEff({ moral: 9, energie: -5 }); dog.sante = clamp(dog.sante + 10, 0, 100); log(s, `🐕 Balade avec ${dog.nom} : +9 moral.`);
    }
    return ok();
  };

  // ------------------------------------------------------------------ route : contrôles et accidents
  P.roadEvents = function (dist, mode) {
    const s = this.s;
    if (mode !== 'voiture' && mode !== 'drone') return;
    const k = dist / 1000;
    if (rnd() < 0.05 * k) {
      const miss = [];
      if (mode === 'voiture' && !s.permits.includes('permis_conduire')) miss.push('permis de conduire');
      if (mode === 'drone' && !s.permits.includes('licence_drone')) miss.push('licence de drone');
      if (!has(s, 'carte_grise')) miss.push('carte grise');
      if (!(s.carInsuranceUntil > s.time)) miss.push('assurance auto');
      if (miss.length) this.mail('amende', 'Police de Nexus', `Contrôle routier : défaut de ${miss.join(', ')}`, 135 * miss.length);
      else log(s, '👮 Contrôle routier : tout est en règle.', 'good');
    }
    if (rnd() < 0.006 * k) {
      const v = s.vehicles[mode];
      if (v) v.cond = clamp(v.cond - 40, 0, 100);
      this.addCondition('blessure');
      if (s.carInsuranceUntil > s.time) { if (v) v.cond = 100; log(s, '💥 Accident ! Votre assurance auto paie les réparations.', 'bad'); }
      else log(s, '💥 Accident ! Véhicule abîmé et blessure. Sans assurance, tout est à vos frais.', 'bad');
    }
  };

  // ------------------------------------------------------------------ télétravail
  P.canTelework = function () {
    const s = this.s, job = this.currentJob();
    return !!job && ['info', 'com', 'admin', 'finance'].includes(job.sector) && s.internetUntil > s.time && this.atHome() && (s.home.includes('ordinateur') || has(s, 'ordinateur_pro'));
  };
}

export { seasonOf, weekday, holidayOf, dayOfYear, yearOf, DAYS };
