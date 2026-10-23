// Interface : panneaux, fiche d'œuvre, sélecteurs, notifications.
import { ART, RARITY, KINDS, SOURCES, bindImg } from './catalog.js';
import {
  S, DEF, slotsFor, extendCost, defCost, ownerOf, ownerInfo, worksOf, wallItems, incomePerMin, setBonuses, myOriginal,
  removeItem, setOwner, log, collectionValue, defenseScore, reset,
} from './state.js';
import {
  emit, toast, refreshMarket, marketPrice, buy, sellPrice, playerBid, bidStep, consign, EXPEDITIONS, startExpedition,
  copyCost, copyTime, startCopy, workshopSlots, buyoutChance, proposeBuyout,
} from './sim.js';
import { openDuel, canDuel, duelFee } from './duel.js';
import { flyTo, select } from './map.js';
import { esc, money, dur, ago, now, clamp, $, $$, h } from './util.js';

const sheet = () => $('#sheet');
const modal = () => $('#modal');
let current = null;
const rar = r => RARITY[r];
const rarChip = a => `<span class="chip"><i style="background:${rar(a.r).color}"></i>${rar(a.r).name}</span>`;
export let startPlacing = () => {};
export const setStartPlacing = fn => { startPlacing = fn; };

function frameSheet(title, sub, tabs = null, tab = null, eyebrow = '') {
  sheet().hidden = false;
  sheet().innerHTML = `<div class="sh-head"><div>${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ''}<h2>${title}</h2>${sub ? `<p class="muted">${sub}</p>` : ''}</div>
    <button class="icon-btn" data-close aria-label="Fermer">✕</button></div>
    ${tabs ? `<div class="tabs">${tabs.map(([k, n]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('')}</div>` : ''}
    <div class="sh-body"></div>`;
  $('[data-close]', sheet()).onclick = closeSheet;
  $$('[data-tab]', sheet()).forEach(b => b.onclick = () => openPanel(current.name, current.arg, b.dataset.tab));
  return $('.sh-body', sheet());
}
export function closeSheet() {
  sheet().hidden = true; sheet().innerHTML = ''; current = null; select(null);
  $$('#nav button').forEach(b => b.classList.remove('on'));
}
export function openPanel(name, arg = null, tab = null) {
  const same = current && current.name === name && current.arg === arg && current.tab === tab;
  const keep = same ? $('.sh-body', sheet())?.scrollTop : 0;
  current = { name, arg, tab };
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.open === name));
  PANELS[name]?.(arg, tab ?? undefined);
  const body = $('.sh-body', sheet());
  if (body && keep) body.scrollTop = keep;
}
export const refreshPanel = () => { if (current && !sheet().hidden && !current.typing) openPanel(current.name, current.arg, current.tab); };
export const currentPanel = () => current?.name ?? null;

function card(aid, { item = null, label = '', onClick = null } = {}) {
  const a = ART[aid];
  const own = item || ownerOf(aid) === 'me';
  const el = h(`<button class="card ${own ? '' : 'unowned'}">
    <div class="ph"><img><i class="rar" style="background:${rar(a.r).color}"></i>${label ? `<span class="own">${esc(label)}</span>` : ''}</div>
    <span class="t">${esc(a.t)}</span><span class="a">${esc(a.a)}</span></button>`);
  bindImg($('img', el), a);
  el.onclick = onClick ?? (() => openArt(aid, item?.iid));
  return el;
}
function slot(it) {
  if (!it) {
    const el = h(`<button class="slot empty"><div class="frame">Accrocher une œuvre</div><div class="cartel"><b>Emplacement libre</b><span>Choisir dans la réserve</span></div></button>`);
    el.onclick = () => pickItems('Accrocher une œuvre', S.items.filter(x => !x.wall && !x.selling), x => { x.wall = true; emit('changed'); });
    return el;
  }
  const a = ART[it.aid];
  const el = h(`<button class="slot">${it.copy ? '<span class="badge copy">Reproduction</span>' : ''}
    <div class="frame ${it.copy ? 'copy' : ''}"><img></div>
    <div class="cartel"><b>${esc(a.t)}</b><span>${esc(a.a)}, ${esc(a.d)}</span></div></button>`);
  $('.frame', el).style.aspectRatio = String(clamp(a.ar || 0.8, 0.55, 1.5));
  bindImg($('img', el), a);
  el.onclick = () => openArt(it.aid, it.iid);
  return el;
}
const bar = (start, end) => `<div class="progress"><i data-prog="${start}:${end}" style="width:${clamp((now() - start) / (end - start), 0, 1) * 100}%"></i></div>`;

const PANELS = {
  museum(arg, tab = 'rooms') {
    const me = S.me, wall = wallItems(), slots = slotsFor(me.lvl), sets = setBonuses();
    const body = frameSheet(esc(me.name),
      me.placed ? `Niveau ${me.lvl}${me.near ? ' · près de ' + esc(me.near) : ''} · ${money(incomePerMin())} par minute` : 'Pas encore construit : choisissez un emplacement sur la carte.',
      [['rooms', `Salles ${wall.length}/${slots}`], ['store', `Réserve ${S.items.filter(x => !x.wall).length}`], ['security', 'Protections'], ['wing', 'Agrandir']], tab, 'Votre musée');
    if (tab === 'rooms') {
      body.append(h(`<p class="note">Les œuvres exposées attirent des visiteurs chaque minute. Quand un rival vous défie, ce sont elles qui défendent votre musée.</p>`));
      if (sets.length) body.append(h(`<p class="note good">Rétrospective : ${sets.map(esc).join(', ')} (+10 % de visiteurs chacune).</p>`));
      const w = h('<div class="wall"></div>');
      for (let i = 0; i < slots; i++) w.append(slot(wall[i]));
      body.append(w);
    } else if (tab === 'store') {
      const store = S.items.filter(x => !x.wall).sort((a, b) => ART[b.aid].v - ART[a.aid].v);
      body.append(h(`<p class="note">En réserve, une œuvre ne rapporte rien et ne participe pas aux défis reçus.</p>`));
      if (!store.length) body.append(h('<p class="empty-note">La réserve est vide. Les œuvres achetées, gagnées ou découvertes arrivent ici.</p>'));
      const g = h('<div class="grid"></div>');
      for (const it of store) g.append(card(it.aid, { item: it, label: it.copy ? 'Reproduction' : it.selling ? 'En vente' : '' }));
      body.append(g);
    } else if (tab === 'security') {
      body.append(h(`<p class="note">Indice de protection <b class="num">${defenseScore(me.def).toFixed(1)}</b> / 10, soit <b class="num">+${Math.round(defenseScore(me.def) * 3)} %</b> pour vos œuvres quand un rival vient vous défier chez vous.</p>`));
      const list = h('<div class="defs"></div>');
      for (const d of DEF) {
        const lv = me.def[d.k], c = defCost(d, lv);
        const row = h(`<div class="def"><div><b>${d.name}</b><p>${d.desc}</p><div class="pips">${Array.from({ length: 10 }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div></div>
          <button class="btn sm ${S.money >= c ? 'primary' : ''}" ${lv >= 10 ? 'disabled' : ''}>${lv >= 10 ? 'Maximum' : `Niveau ${lv + 1} <small>${money(c)}</small>`}</button></div>`);
        $('button', row).onclick = () => {
          if (S.money < c) return toast('Pas assez d’argent.', 'bad');
          S.money -= c; me.def[d.k]++; log(`${d.name} : niveau ${me.def[d.k]}.`, 'info'); emit('changed');
        };
        list.append(row);
      }
      body.append(list);
    } else {
      const c = extendCost(me.lvl);
      const box = h(`<div class="box" style="margin-top:14px"><h3>Nouvelle aile</h3><p>Niveau ${me.lvl} → ${me.lvl + 1} : ${slotsFor(me.lvl + 1)} emplacements au lieu de ${slots}, +5 % de visiteurs${(me.lvl) % 3 === 0 ? ', un établi de plus à l’atelier' : ''}.</p>
        <button class="btn primary" ${me.lvl >= 12 ? 'disabled' : ''}>Construire · ${money(c)}</button></div>`);
      $('button', box).onclick = () => {
        if (S.money < c) return toast('Pas assez d’argent.', 'bad');
        S.money -= c; me.lvl++; log(`Nouvelle aile : votre musée passe niveau ${me.lvl}.`, 'good'); toast(`Inauguration ! Musée niveau ${me.lvl}.`, 'good'); emit('changed');
      };
      body.append(box);
      const nm = h(`<div class="box" style="margin-top:12px"><h3>Nom du musée</h3><input type="text" id="museum-name" maxlength="32" value="${esc(me.name)}"><button class="btn">Renommer</button></div>`);
      $('button', nm).onclick = () => { const v = $('input', nm).value.trim(); if (v) { me.name = v; emit('changed'); toast('Musée renommé.', 'good'); } };
      body.append(nm);
      const mv = 20000 * me.lvl;
      const move = h(`<div class="box" style="margin-top:12px"><h3>${me.placed ? 'Déménager' : 'Emplacement'}</h3><p>Choisir un nouvel endroit sur la carte.</p><button class="btn">${me.placed ? `Déménager · ${money(mv)}` : 'Choisir l’emplacement'}</button></div>`);
      $('button', move).onclick = () => {
        if (me.placed && S.money < mv) return toast('Pas assez d’argent.', 'bad');
        S.pendingMove = me.placed ? mv : 0;
        closeSheet(); startPlacing();
      };
      body.append(move);
    }
  },

  catalog() {
    const st = (S.ui ??= {}).cat ??= { show: 'all', r: 0, k: '', q: '', n: 60 };
    const ownedSet = new Set(S.items.filter(x => !x.copy).map(x => x.aid));
    const body = frameSheet('Catalogue mondial', `${ownedSet.size} / ${ART.length} œuvres dans votre collection`, null, null, 'Toutes les œuvres du jeu');
    const fl = h(`<div class="filters">
      <input type="search" id="cat-q" placeholder="Titre, artiste, culture, musée…" value="${esc(st.q)}">
      <div class="seg" data-g="show">${[['all', 'Toutes'], ['mine', 'Les miennes'], ['others', 'Chez les autres'], ['free', 'Introuvables']].map(([k, n]) => `<button data-v="${k}" class="${st.show === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="seg" data-g="r"><button data-v="0" class="${!st.r ? 'on' : ''}">Toutes raretés</button>${[1, 2, 3, 4, 5].map(r => `<button data-v="${r}" class="${st.r === r ? 'on' : ''}" style="${st.r === r ? '' : `color:${rar(r).color}`}">${rar(r).name}</button>`).join('')}</div>
      <select id="cat-k"><option value="">Tous les types</option>${[...KINDS].sort().map(k => `<option ${st.k === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select>
    </div>`);
    body.append(fl);
    const q = st.q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const list = ART.filter(a => {
      if (st.r && a.r !== st.r) return false;
      if (st.k && a.k !== st.k) return false;
      if (q && !a.q.includes(q)) return false;
      const o = ownedSet.has(a.id) ? 'me' : S.owners[a.id];
      if (st.show === 'mine') return o === 'me';
      if (st.show === 'others') return o && o !== 'me';
      if (st.show === 'free') return !o;
      return true;
    }).sort((a, b) => b.r - a.r || b.v - a.v);
    body.append(h(`<p class="note">${list.length} œuvre${list.length > 1 ? 's' : ''}. En gris : celles que vous ne possédez pas encore.</p>`));
    const g = h('<div class="grid"></div>');
    for (const a of list.slice(0, st.n)) g.append(card(a.id, { label: ownedSet.has(a.id) ? 'À vous' : '' }));
    body.append(g);
    if (list.length > st.n) {
      const more = h(`<button class="btn" style="margin:18px auto 0;display:flex">Afficher plus (${list.length - st.n} restantes)</button>`);
      more.onclick = () => { st.n += 90; openPanel('catalog'); };
      body.append(more);
    }
    const inp = $('#cat-q', body);
    let tm;
    inp.oninput = () => {
      clearTimeout(tm);
      tm = setTimeout(() => { st.q = inp.value; st.n = 60; openPanel('catalog'); const e = $('#cat-q'); e?.focus(); e?.setSelectionRange(e.value.length, e.value.length); }, 300);
    };
    $$('.seg', fl).forEach(sg => $$('button', sg).forEach(b => b.onclick = () => { st[sg.dataset.g] = sg.dataset.g === 'r' ? +b.dataset.v : b.dataset.v; st.n = 60; openPanel('catalog'); }));
    $('#cat-k', fl).onchange = e => { st.k = e.target.value; st.n = 60; openPanel('catalog'); };
  },

  market(arg, tab = 'gallery') {
    refreshMarket(false);
    const body = frameSheet('Marché de l’art', 'Galeries, antiquaires et expéditions', [['gallery', 'Galerie'], ['exped', 'Expéditions']], tab, 'Acheter et découvrir');
    if (tab === 'gallery') {
      const top = h(`<div class="spread" style="margin-top:14px"><span class="muted">Nouvel arrivage dans <b class="num" data-until="${S.market.at + 8 * 60e3}">${dur(S.market.at + 8 * 60e3 - now())}</b></span><button class="btn sm">Renouveler · ${money(2000)}</button></div>`);
      $('button', top).onclick = () => { if (S.money < 2000) return toast('Pas assez d’argent.', 'bad'); S.money -= 2000; refreshMarket(true); openPanel('market', null, 'gallery'); };
      body.append(top);
      const list = h('<div class="list"></div>');
      for (const aid of S.market.lots) {
        const a = ART[aid], p = marketPrice(aid), sold = ownerOf(aid);
        const row = h(`<div class="li"><img class="thumb"><div class="grow"><div class="t">${esc(a.t)}</div><div class="s">${esc(a.a)} · ${esc(a.d)}</div><div class="row" style="margin-top:4px">${rarChip(a)}</div></div>
          <button class="btn sm ${S.money >= p ? 'primary' : ''}" ${sold ? 'disabled' : ''}>${sold ? 'Vendu' : money(p)}</button></div>`);
        bindImg($('img', row), a);
        $('img', row).onclick = () => openArt(aid);
        $('button', row).onclick = () => buy(aid);
        list.append(row);
      }
      body.append(list);
    } else {
      body.append(h('<p class="note">Envoyez une équipe chercher des œuvres oubliées. Chaque expédition rapporte une œuvre authentique, plus ou moins rare.</p>'));
      const grid = h('<div class="cards3"></div>');
      for (const ex of EXPEDITIONS) {
        const job = S.jobs.find(j => j.type === 'exped' && j.k === ex.k);
        const box = h(`<div class="box"><h3>${ex.name}</h3><p>${ex.desc}</p>
          <div class="odds">${ex.w.map((w, i) => w ? `<i style="flex:${w};background:${rar(i + 1).color}"></i>` : '').join('')}</div>
          <p>${ex.w.map((w, i) => w ? `${rar(i + 1).name} ${w} %` : '').filter(Boolean).join(' · ')}</p>
          ${job ? `${bar(job.start, job.end)}<p class="num" data-until="${job.end}">${dur(job.end - now())}</p>` : `<button class="btn ${S.money >= ex.cost ? 'primary' : ''}">Partir · ${money(ex.cost)} · ${dur(ex.ms)}</button>`}</div>`);
        const b = $('button', box);
        if (b) b.onclick = () => startExpedition(ex);
        grid.append(box);
      }
      body.append(grid);
    }
  },

  auctions(arg, tab = 'lots') {
    const body = frameSheet('Hôtel des ventes', 'Les rivaux enchérissent en direct. Votre mise est bloquée tant que vous êtes en tête.', [['lots', 'Ventes en cours'], ['sell', 'Vendre']], tab, 'Enchères');
    if (tab === 'lots') {
      const lots = [...S.auctions].sort((a, b) => a.end - b.end);
      if (!lots.length) body.append(h('<p class="empty-note">Aucune vente pour le moment.</p>'));
      for (const l of lots) body.append(lotRow(l));
    } else {
      body.append(h(`<p class="note">La maison prend 10 % du prix final. Les rivaux enchérissent selon leur budget et l’intérêt de l’œuvre.</p>`));
      const b = h('<button class="btn primary" style="margin-top:12px">Mettre une œuvre en vente</button>');
      b.onclick = () => pickItems('Mettre en vente', S.items.filter(x => !x.selling && !x.copy), it => consign(it));
      body.append(b);
      const mine = S.auctions.filter(l => l.seller === 'me');
      if (mine.length) { body.append(h('<h4>Vos lots</h4>')); for (const l of mine) body.append(lotRow(l)); }
    }
  },

  atelier(arg, tab = 'jobs') {
    const copies = S.items.filter(x => x.copy);
    const body = frameSheet('Atelier de reproduction', `${workshopSlots()} établi${workshopSlots() > 1 ? 's' : ''} · reproductions officielles et signées`, [['jobs', 'En cours'], ['copies', `Reproductions ${copies.length}`]], tab, 'Atelier');
    if (tab === 'jobs') {
      body.append(h(`<p class="note">Une reproduction exposée rapporte une petite part des visiteurs de l’original, ce qui libère l’original pour vos défis. Vous pouvez aussi la vendre à la boutique du musée.</p>`));
      const b = h('<button class="btn primary" style="margin-top:12px">Reproduire une de mes œuvres</button>');
      b.onclick = () => pickItems('Reproduire', S.items.filter(x => !x.copy), it => startCopy(it.aid), it => `${money(copyCost(it.aid))} · ${dur(copyTime(it.aid))}`);
      body.append(b);
      const jobs = S.jobs.filter(j => j.type === 'copy');
      if (!jobs.length) body.append(h('<p class="empty-note">Aucun établi occupé.</p>'));
      const list = h('<div class="list"></div>');
      for (const j of jobs) {
        const a = ART[j.aid];
        const row = h(`<div class="li"><img class="thumb"><div class="grow"><div class="t">${esc(a.t)}</div><div class="s">Qualité prévue ${Math.round(j.q * 100)} % · <span class="num" data-until="${j.end}">${dur(j.end - now())}</span></div>${bar(j.start, j.end)}</div></div>`);
        bindImg($('img', row), a);
        list.append(row);
      }
      body.append(list);
    } else {
      if (!copies.length) body.append(h('<p class="empty-note">Aucune reproduction pour l’instant.</p>'));
      const g = h('<div class="grid"></div>');
      for (const it of copies) g.append(card(it.aid, { item: it, label: `${Math.round(it.copy * 100)} %` }));
      body.append(g);
    }
  },

  rivals(arg, tab = 'rank') {
    const body = frameSheet('Rivaux et classement', 'Défiez un musée : trois manches devant un jury, le gagnant emporte une œuvre.', [['rank', 'Classement'], ['rivals', 'Collectionneurs'], ['journal', 'Journal'], ['goals', 'Succès']], tab, 'Le monde de l’art');
    if (tab === 'rank') {
      const all = [{ id: 'me', name: S.me.name, kind: 'me' }, ...S.rivals.map(r => ({ id: r.id, name: r.name, kind: 'rival', lvl: r.lvl })), ...Object.values(S.inst).map(i => ({ id: i.id, name: i.name, kind: 'inst', lvl: i.lvl, city: i.city }))]
        .map(x => ({ ...x, v: collectionValue(x.id), n: worksOf(x.id).length })).filter(x => x.n || x.id === 'me').sort((a, b) => b.v - a.v);
      const list = h('<div class="list"></div>');
      all.slice(0, 120).forEach((x, i) => {
        const row = h(`<div class="li ${x.id === 'me' ? 'me' : ''}" style="cursor:pointer"><span class="rk">${i + 1}</span><div class="grow"><div class="t">${esc(x.name)}</div><div class="s">${x.kind === 'me' ? 'Vous' : x.kind === 'rival' ? 'Collectionneur' : 'Musée' + (x.city ? ' · ' + esc(x.city) : '')} · ${x.n} œuvre${x.n > 1 ? 's' : ''}</div></div><b class="num">${money(x.v)}</b></div>`);
        row.onclick = () => x.id === 'me' ? openPanel('museum') : openOwner(x.id);
        list.append(row);
      });
      const myRank = all.findIndex(x => x.id === 'me') + 1;
      if (myRank > 120) list.append(h(`<div class="li me"><span class="rk">${myRank}</span><div class="grow"><div class="t">${esc(S.me.name)}</div></div><b class="num">${money(collectionValue('me'))}</b></div>`));
      body.append(list);
    } else if (tab === 'rivals') {
      const list = h('<div class="list"></div>');
      for (const r of [...S.rivals].sort((a, b) => b.lvl - a.lvl)) {
        const row = h(`<div class="li" style="cursor:pointer"><div class="grow"><div class="t">${esc(r.name)}</div><div class="s">${esc(r.boss)} · niveau ${r.lvl} · ${worksOf(r.id).length} œuvres</div><div class="s"><i>« ${esc(r.motto)} »</i></div></div><span class="chip ${canDuel(r.id) ? 'good' : ''}">${canDuel(r.id) ? 'Disponible' : 'Au repos'}</span></div>`);
        row.onclick = () => openOwner(r.id);
        list.append(row);
      }
      body.append(list);
    } else if (tab === 'journal') {
      const list = h('<div class="list"></div>');
      if (!S.log.length) list.append(h('<p class="empty-note">Rien pour l’instant.</p>'));
      for (const e of S.log) list.append(h(`<div class="li"><div class="grow"><div class="${e.kind === 'bad' ? 'bad' : e.kind === 'good' ? 'good' : e.kind === 'warn' ? 'warn' : ''}">${esc(e.msg)}</div><div class="s">${ago(e.t)}</div></div></div>`));
      body.append(list);
    } else {
      for (const g of GOALS) {
        const ok = g.test(), done = S.done[g.k];
        const row = h(`<div class="ach ${done ? 'done' : ''}"><div><div class="t">${esc(g.name)}</div><div class="s">${esc(g.desc)} · récompense ${money(g.reward)}</div></div>
          ${done ? '<span class="chip good">Obtenu</span>' : `<button class="btn sm ${ok ? 'primary' : ''}" ${ok ? '' : 'disabled'}>${ok ? 'Récupérer' : 'En cours'}</button>`}</div>`);
        const b = $('button', row);
        if (b) b.onclick = () => { S.done[g.k] = 1; S.money += g.reward; toast(`Succès « ${g.name} » : +${money(g.reward)}.`, 'good'); emit('changed'); };
        body.append(row);
      }
      const rs = h('<div class="box" style="margin-top:22px"><h3>Nouvelle partie</h3><p>Efface votre progression sur cet appareil.</p><button class="btn danger">Tout recommencer</button></div>');
      $('button', rs).onclick = () => {
        const b = $('button', rs);
        if (b.dataset.armed) { reset(); location.reload(); return; }
        b.dataset.armed = 1; b.textContent = 'Toucher encore pour confirmer';
      };
      body.append(rs);
    }
  },

  owner(id) {
    const o = ownerInfo(id);
    if (!o) return closeSheet();
    select(id);
    const works = worksOf(id);
    const body = frameSheet(esc(o.name), `${o.kind === 'rival' ? esc(o.boss) + ' · ' : ''}${o.city ? esc(o.city) + ' · ' : ''}niveau ${o.lvl} · ${works.length} œuvres · ${money(collectionValue(id))}`, null, null, o.kind === 'rival' ? 'Collectionneur rival' : 'Musée');
    if (o.kind === 'rival') body.append(h(`<p class="note"><i>« ${esc(o.motto)} »</i></p>`));
    const fee = duelFee(o.lvl);
    const act = h(`<div class="row" style="margin-top:14px">
      <button class="btn primary" data-duel ${canDuel(id) ? '' : 'disabled'}>${canDuel(id) ? `Lancer un défi · ${money(fee)}` : `Au repos · ${dur(o.ref.cool - now())}`}</button>
      <button class="btn" data-fly>Voir sur la carte</button></div>`);
    $('[data-duel]', act).onclick = () => { closeSheet(); openDuel(id); };
    $('[data-fly]', act).onclick = () => flyTo(o.lat, o.lon, 9);
    body.append(act);
    body.append(h(`<p class="note">Protections : indice <b class="num">${defenseScore(o.def).toFixed(1)}</b>, soit +${Math.round(defenseScore(o.def) * 3)} % pour ses œuvres quand vous le défiez.</p>`));
    const w = h('<div class="wall"></div>');
    for (const aid of works.slice(0, 40)) {
      const a = ART[aid];
      const el = h(`<button class="slot"><div class="frame"><img></div><div class="cartel"><b>${esc(a.t)}</b><span>${esc(a.a)}, ${esc(a.d)}</span></div></button>`);
      $('.frame', el).style.aspectRatio = String(clamp(a.ar || 0.8, 0.55, 1.5));
      bindImg($('img', el), a);
      el.onclick = () => openArt(aid);
      w.append(el);
    }
    body.append(w);
    if (works.length > 40) body.append(h(`<p class="note">Et ${works.length - 40} autres œuvres dans les réserves (visibles dans le Catalogue).</p>`));
  },

  list(ids) {
    const body = frameSheet('Musées de la zone', `${ids.length} établissements`, null, null, 'Sur la carte');
    const list = h('<div class="list"></div>');
    for (const id of ids) {
      const o = ownerInfo(id);
      const row = h(`<div class="li" style="cursor:pointer"><div class="grow"><div class="t">${esc(o.name)}</div><div class="s">${o.kind === 'me' ? 'Votre musée' : o.kind === 'rival' ? 'Collectionneur rival' : 'Musée'} · niveau ${o.lvl} · ${worksOf(id).length} œuvres</div></div></div>`);
      row.onclick = () => id === 'me' ? openPanel('museum') : openOwner(id);
      list.append(row);
    }
    body.append(list);
  },
};
export const openOwner = id => openPanel('owner', id);

function lotRow(l) {
  const a = ART[l.aid];
  const top = l.top ? (l.top === 'me' ? 'Vous' : ownerInfo(l.top)?.name) : 'Aucune offre';
  const step = bidStep(l);
  const row = h(`<div class="lot ${l.top === 'me' ? 'mine' : ''}"><div class="frame"><img></div><div class="meta">
    <div class="row">${rarChip(a)}<span class="timer num" data-until="${l.end}">${dur(l.end - now())}</span></div>
    <div class="t">${esc(a.t)}</div><div class="muted" style="font-size:13px">${esc(a.a)} · estimation ${money(a.v)}</div>
    <div class="bid">${money(l.bid)}</div><div class="muted" style="font-size:12.5px">En tête : <b>${esc(top)}</b>${l.seller === 'me' ? ' · votre lot' : ''}</div>
    ${l.seller === 'me' ? '' : `<div class="row" style="margin-top:4px">${[1, 2, 5].map(k => `<button class="btn sm" data-b="${l.bid + step * k}" ${l.top === 'me' ? 'disabled' : ''}>+${money(step * k)}</button>`).join('')}</div>`}
  </div></div>`);
  bindImg($('img', row), a);
  $('.frame', row).onclick = () => openArt(l.aid);
  $$('[data-b]', row).forEach(b => b.onclick = () => { if (playerBid(l, +b.dataset.b)) { toast(`Vous êtes en tête sur « ${a.t} ».`, 'good'); refreshPanel(); } });
  return row;
}

// ---------- succès ----------
const originals = () => S.items.filter(x => !x.copy).length;
const GOALS = [
  { k: 'place', name: 'Première pierre', desc: 'Bâtir votre musée', test: () => S.me.placed, reward: 5000 },
  { k: 'own10', name: 'Cabinet de curiosités', desc: 'Posséder 10 œuvres originales', test: () => originals() >= 10, reward: 20000 },
  { k: 'own50', name: 'Grande collection', desc: 'Posséder 50 œuvres originales', test: () => originals() >= 50, reward: 300000 },
  { k: 'own150', name: 'Musée national', desc: 'Posséder 150 œuvres originales', test: () => originals() >= 150, reward: 3e6 },
  { k: 'duel1', name: 'Premier jury', desc: 'Gagner un défi', test: () => S.stats.wins >= 1, reward: 15000 },
  { k: 'duel10', name: 'Champion des cimaises', desc: 'Gagner 10 défis', test: () => S.stats.wins >= 10, reward: 400000 },
  { k: 'leg', name: 'Légende', desc: 'Posséder une œuvre légendaire', test: () => S.items.some(x => !x.copy && ART[x.aid].r >= 4), reward: 500000 },
  { k: 'myth', name: 'Mythe vivant', desc: 'Posséder une œuvre mythique', test: () => S.items.some(x => !x.copy && ART[x.aid].r === 5), reward: 5e6 },
  { k: 'auction', name: 'Adjugé !', desc: 'Remporter une enchère', test: () => S.stats.auctionsWon >= 1, reward: 10000 },
  { k: 'buyout', name: 'Négociateur', desc: 'Réussir un rachat', test: () => S.stats.buyouts >= 1, reward: 25000 },
  { k: 'copy5', name: 'Atelier en marche', desc: 'Terminer 5 reproductions', test: () => S.stats.copies >= 5, reward: 50000 },
  { k: 'set', name: 'Rétrospective', desc: 'Exposer 3 œuvres d’un même artiste', test: () => setBonuses().length >= 1, reward: 150000 },
  { k: 'def', name: 'Écrin parfait', desc: 'Toutes les protections au niveau 5', test: () => DEF.every(d => S.me.def[d.k] >= 5), reward: 1e6 },
  { k: 'lvl5', name: 'Aile nouvelle', desc: 'Musée niveau 5', test: () => S.me.lvl >= 5, reward: 300000 },
  { k: 'exped', name: 'Explorateur', desc: 'Revenir de 5 expéditions', test: () => S.stats.exped >= 5, reward: 60000 },
];
export const goalsReady = () => GOALS.filter(g => !S.done[g.k] && g.test()).length;

// ---------- fiche d'œuvre ----------
export function openArt(aid, iid = null) {
  const a = ART[aid];
  const it = iid ? S.items.find(x => x.iid === iid) : myOriginal(aid);
  const oid = it && !it.copy ? 'me' : ownerOf(aid);
  const o = ownerInfo(oid);
  const inMarket = S.market.lots.includes(aid) && !oid;
  const lot = S.auctions.find(l => l.aid === aid);
  const where = it?.copy ? `Votre reproduction (qualité ${Math.round(it.copy * 100)} %)` : oid === 'me' ? (it?.wall ? 'Exposée dans votre musée' : 'Dans votre réserve') : o ? esc(o.name) + (o.city ? ', ' + esc(o.city) : '') : lot ? 'En vente à l’hôtel des ventes' : inMarket ? 'En vente à la galerie' : 'Introuvable pour l’instant';
  modal().hidden = false;
  modal().innerHTML = `<div class="art">
    <button class="icon-btn close-x" data-x aria-label="Fermer">✕</button>
    <div class="frame ${it?.copy ? 'copy' : ''}"><img></div>
    <div class="art-info">
      <div class="row">${rarChip(a)}<span class="chip">${esc(a.k)}</span></div>
      <h2>${esc(a.t)}</h2>
      <p class="by">${esc(a.a)}</p>
      <dl class="kv"><dt>Date</dt><dd>${esc(a.d)}</dd>${a.o ? `<dt>Culture</dt><dd>${esc(a.o)}</dd>` : ''}<dt>Dans la réalité</dt><dd>${esc(a.m)}</dd>
        <dt>Valeur</dt><dd class="num">${money(it?.copy ? a.v * 0.02 * it.copy : a.v)}</dd><dt>Dans le jeu</dt><dd>${where}</dd></dl>
      <div class="actions"></div>
      <p class="src">Image et notice : ${SOURCES[a.s]}${a.wk ? ` · <a href="${esc(a.wk)}" target="_blank" rel="noopener">Notice originale ↗</a>` : ''}</p>
    </div></div>`;
  bindImg($('.art img', modal()), a, true);
  const close = () => { modal().hidden = true; modal().innerHTML = ''; };
  $('[data-x]', modal()).onclick = close;
  modal().onclick = e => { if (e.target === modal()) close(); };
  const acts = $('.actions', modal());
  const btn = (label, fn, cls = '') => { const b = h(`<button class="btn ${cls}">${label}</button>`); b.onclick = fn; acts.append(b); return b; };
  if (it) {
    if (!it.selling) {
      if (it.wall) btn('Décrocher', () => { it.wall = false; emit('changed'); close(); });
      else btn('Exposer', () => {
        if (wallItems().length >= slotsFor(S.me.lvl)) return toast('Toutes les salles sont pleines. Décrochez une œuvre ou agrandissez le musée.', 'warn');
        it.wall = true; emit('changed'); close();
      }, 'primary');
    }
    if (!it.copy) {
      btn(`Reproduire · ${money(copyCost(aid))}`, () => { startCopy(aid); close(); });
      if (!it.selling) {
        btn('Mettre aux enchères', () => { if (consign(it)) { close(); openPanel('auctions', null, 'sell'); } });
        btn(`Vendre à un marchand · ${money(sellPrice(aid))}`, () => {
          S.money += sellPrice(aid); removeItem(it); setOwner(aid, null);
          log(`« ${a.t} » vendu à un marchand pour ${money(sellPrice(aid))}.`, 'info'); emit('changed'); close();
        });
      }
    } else {
      const p = Math.round(a.v * 0.02 * it.copy);
      btn(`Vendre à la boutique · ${money(p)}`, () => { S.money += p; removeItem(it); emit('changed'); close(); });
    }
  } else if (o && oid !== 'me') {
    btn(`Défier ${esc(o.name)}`, () => { close(); openDuel(oid); }, 'primary');
    btn('Voir leur musée', () => { close(); openOwner(oid); });
    const box = h(`<div class="box" style="width:100%"><b>Proposer un rachat</b>
      <input type="range" id="offer" min="0.8" max="2.5" step="0.05" value="1.2">
      <div class="spread"><span class="num" data-offer></span><span class="muted" data-chance></span></div><button class="btn">Envoyer l’offre</button></div>`);
    const upd = () => { const v = Math.round(a.v * +$('#offer', box).value / 100) * 100; $('[data-offer]', box).textContent = money(v); $('[data-chance]', box).textContent = `Chance d’accord ≈ ${Math.round(buyoutChance(aid, v) * 100)} %`; return v; };
    $('#offer', box).oninput = upd; upd();
    $('button', box).onclick = () => { if (proposeBuyout(aid, upd())) close(); };
    acts.append(box);
  } else if (inMarket) {
    btn(`Acheter · ${money(marketPrice(aid))}`, () => { if (buy(aid)) close(); }, 'primary');
  } else if (lot) {
    btn('Voir la vente', () => { close(); openPanel('auctions'); }, 'primary');
  } else {
    acts.append(h('<p class="muted" style="margin:0">Cette œuvre peut apparaître à la galerie, aux enchères ou au retour d’une expédition.</p>'));
  }
}

// ---------- sélecteur ----------
export function pickItems(title, items, onPick, extra = null) {
  modal().hidden = false;
  modal().innerHTML = `<div class="dialog" style="width:min(720px,100%);max-height:86vh;overflow:auto"><div class="spread"><h3>${esc(title)}</h3><button class="icon-btn" data-x aria-label="Fermer">✕</button></div>
    ${items.length ? '' : '<p class="muted">Aucune œuvre disponible.</p>'}<div class="grid"></div></div>`;
  const close = () => { modal().hidden = true; modal().innerHTML = ''; };
  $('[data-x]', modal()).onclick = close;
  modal().onclick = e => { if (e.target === modal()) close(); };
  const g = $('.grid', modal());
  for (const it of items.sort((a, b) => ART[b.aid].v - ART[a.aid].v)) {
    g.append(card(it.aid, { item: it, label: it.copy ? 'Reproduction' : extra ? extra(it) : money(ART[it.aid].v), onClick: () => { close(); onPick(it); } }));
  }
}

// ---------- découverte ----------
export function reveal(aid, source) {
  const a = ART[aid];
  modal().hidden = false;
  modal().innerHTML = `<div class="reveal"><p class="eyebrow">${esc(source)}</p>
    <div style="position:relative"><div class="glow" style="background:${rar(a.r).color}"></div><div class="frame"><img></div></div>
    <p class="eyebrow" style="color:${rar(a.r).color};font-size:14px">${rar(a.r).name}</p>
    <h2>${esc(a.t)}</h2><p class="by" style="margin:0;font:italic 500 17px var(--display)">${esc(a.a)} · ${esc(a.d)}</p>
    <p class="num">${money(a.v)}</p><div class="row"><button class="btn primary" data-x>Dans la réserve</button><button class="btn" data-show>Exposer</button></div></div>`;
  bindImg($('img', modal()), a, true);
  const close = () => { modal().hidden = true; modal().innerHTML = ''; };
  $('[data-x]', modal()).onclick = close;
  $('[data-show]', modal()).onclick = () => {
    const it = myOriginal(aid);
    if (it && wallItems().length < slotsFor(S.me.lvl)) { it.wall = true; emit('changed'); } else toast('Toutes les salles sont pleines.', 'warn');
    close();
  };
}

// ---------- notifications ----------
export function showToast(msg, kind, extra) {
  const el = h(`<div class="toast ${kind}"><span>${esc(msg)}</span></div>`);
  if (extra?.aid != null) { const b = h('<button>Voir</button>'); b.onclick = () => { openArt(extra.aid, extra.iid); el.remove(); }; el.append(b); }
  if (extra?.owner) { const b = h('<button>Défier</button>'); b.onclick = () => { openOwner(extra.owner); el.remove(); }; el.append(b); }
  $('#toasts').prepend(el);
  while ($('#toasts').children.length > 4) $('#toasts').lastChild.remove();
  setTimeout(() => el.remove(), kind === 'bad' ? 9000 : 5500);
}

// mise à jour légère, chaque seconde, des comptes à rebours et barres
export function liveUpdate() {
  $$('[data-until]').forEach(e => { const left = +e.dataset.until - now(); e.textContent = dur(left); e.classList.toggle('hurry', left < 15000); });
  $$('[data-prog]').forEach(e => { const [s, en] = e.dataset.prog.split(':').map(Number); e.style.width = clamp((now() - s) / (en - s), 0, 1) * 100 + '%'; });
}
