// Interface : 4 menus (Musée, Collection, Caisses, Défis), fiche d'œuvre, guide pas à pas, notifications.
import { ART, RARITY, SOURCES, bindImg } from './catalog.js';
import {
  S, DEF, slotsFor, extendCost, defCost, ownerOf, ownerInfo, worksOf, wallItems, incomePerMin, myOriginal,
  removeItem, setOwner, log, collectionValue, defenseScore, reset,
} from './state.js';
import { emit, toast, sellPrice, playerBid, bidStep, consign, CRATES, openCrate, copyCost, makeCopy } from './sim.js';
import { openDuel, canDuel, duelFee } from './duel.js';
import { flyTo, select } from './map.js';
import { esc, money, dur, now, clamp, $, $$, h } from './util.js';

const sheet = () => $('#sheet');
const modal = () => $('#modal');
let current = null;
const rar = r => RARITY[r];
const rarChip = a => `<span class="chip"><i style="background:${rar(a.r).color}"></i>${rar(a.r).name}</span>`;
export let startPlacing = () => {};
export const setStartPlacing = fn => { startPlacing = fn; };

function frameSheet(title, sub, tabs = null, tab = null) {
  sheet().hidden = false;
  sheet().innerHTML = `<div class="sh-head"><div><h2>${title}</h2>${sub ? `<p class="muted">${sub}</p>` : ''}</div>
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
export const refreshPanel = () => { if (current && !sheet().hidden) openPanel(current.name, current.arg, current.tab); };
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
    const el = h(`<button class="slot empty"><div class="frame">+ Accrocher</div><div class="cartel"><b>Mur vide</b><span>Touche pour accrocher une œuvre</span></div></button>`);
    el.onclick = () => pickItems('Quelle œuvre accrocher ?', S.items.filter(x => !x.wall && !x.selling), x => { x.wall = true; emit('changed'); });
    return el;
  }
  const a = ART[it.aid];
  const el = h(`<button class="slot">${it.copy ? '<span class="badge copy">Copie</span>' : ''}
    <div class="frame ${it.copy ? 'copy' : ''}"><img></div>
    <div class="cartel"><b>${esc(a.t)}</b><span>${esc(a.a)}</span></div></button>`);
  $('.frame', el).style.aspectRatio = String(clamp(a.ar || 0.8, 0.55, 1.5));
  bindImg($('img', el), a);
  el.onclick = () => openArt(it.aid, it.iid);
  return el;
}

const PANELS = {
  museum(arg, tab = 'rooms') {
    const me = S.me, wall = wallItems(), slots = slotsFor(me.lvl);
    const body = frameSheet(esc(me.name), `Tes œuvres accrochées rapportent <b class="good">${money(incomePerMin())}</b> par minute.`,
      [['rooms', 'Mes murs'], ['upgrade', 'Améliorer']], tab);
    if (tab === 'rooms') {
      body.append(h(`<p class="note">Plus une œuvre est précieuse, plus elle rapporte. ${wall.length}/${slots} murs utilisés.</p>`));
      const w = h('<div class="wall"></div>');
      for (let i = 0; i < slots; i++) w.append(slot(wall[i]));
      body.append(w);
      const store = S.items.filter(x => !x.wall).sort((a, b) => ART[b.aid].v - ART[a.aid].v);
      body.append(h(`<h4>Pas accrochées (${store.length})</h4>`));
      if (!store.length) body.append(h('<p class="note">Rien en attente. Ouvre une caisse pour trouver de nouvelles œuvres.</p>'));
      const g = h('<div class="grid"></div>');
      for (const it of store) g.append(card(it.aid, { item: it, label: it.copy ? 'Copie' : it.selling ? 'En vente' : '' }));
      body.append(g);
    } else {
      const c = extendCost(me.lvl);
      const box = h(`<div class="box" style="margin-top:14px"><h3>Agrandir le musée</h3><p>Passe au niveau ${me.lvl + 1} : ${slotsFor(me.lvl + 1)} murs au lieu de ${slots}.</p>
        <button class="btn primary" ${me.lvl >= 12 ? 'disabled' : ''}>Agrandir · ${money(c)}</button></div>`);
      $('button', box).onclick = () => {
        if (S.money < c) return toast('Pas assez d’argent.', 'bad');
        S.money -= c; me.lvl++; toast(`Ton musée passe au niveau ${me.lvl} !`, 'good'); emit('changed');
      };
      body.append(box);
      body.append(h(`<h4>Protections</h4>`));
      body.append(h(`<p class="note">Quand un rival vient te défier chez toi, chaque protection donne un bonus à tes œuvres. Bonus actuel : <b class="good">+${Math.round(defenseScore(me.def) * 3)} %</b>.</p>`));
      const list = h('<div class="defs"></div>');
      for (const d of DEF) {
        const lv = me.def[d.k], cost = defCost(d, lv);
        const row = h(`<div class="def"><div><b>${d.name}</b><div class="pips">${Array.from({ length: 10 }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div></div>
          <button class="btn sm ${S.money >= cost ? 'primary' : ''}" ${lv >= 10 ? 'disabled' : ''}>${lv >= 10 ? 'Max' : money(cost)}</button></div>`);
        $('button', row).onclick = () => {
          if (S.money < cost) return toast('Pas assez d’argent.', 'bad');
          S.money -= cost; me.def[d.k]++; emit('changed');
        };
        list.append(row);
      }
      body.append(list);
      const nm = h(`<div class="box" style="margin-top:18px"><h3>Nom du musée</h3><input type="text" id="museum-name" maxlength="32" value="${esc(me.name)}"><button class="btn">Renommer</button></div>`);
      $('button', nm).onclick = () => { const v = $('input', nm).value.trim(); if (v) { me.name = v; emit('changed'); } };
      body.append(nm);
      const mv = 20000 * me.lvl;
      const move = h(`<div class="box" style="margin-top:12px"><h3>Déménager</h3><p>Choisis un autre endroit sur la carte.</p><button class="btn">${me.placed ? `Déménager · ${money(mv)}` : 'Choisir l’endroit'}</button></div>`);
      $('button', move).onclick = () => {
        if (me.placed && S.money < mv) return toast('Pas assez d’argent.', 'bad');
        S.pendingMove = me.placed ? mv : 0;
        closeSheet(); startPlacing();
      };
      body.append(move);
      const rs = h('<div class="box" style="margin-top:12px"><h3>Recommencer</h3><p>Efface ta partie sur cet appareil.</p><button class="btn danger">Nouvelle partie</button></div>');
      $('button', rs).onclick = () => {
        const b = $('button', rs);
        if (b.dataset.armed) { reset(); location.reload(); return; }
        b.dataset.armed = 1; b.textContent = 'Toucher encore pour confirmer';
      };
      body.append(rs);
    }
  },

  catalog() {
    const st = (S.ui ??= {}).cat ??= { show: 'all', q: '', n: 60 };
    const ownedSet = new Set(S.items.filter(x => !x.copy).map(x => x.aid));
    const body = frameSheet('Collection', `Tu as <b class="good">${ownedSet.size}</b> œuvres sur ${ART.length}. En gris : celles qu’il te reste à trouver.`);
    const fl = h(`<div class="filters"><input type="search" id="cat-q" placeholder="Chercher : Van Gogh, Joconde, Égypte…" value="${esc(st.q)}">
      <div class="seg">${[['all', 'Toutes'], ['mine', 'Les miennes']].map(([k, n]) => `<button data-v="${k}" class="${st.show === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>`);
    body.append(fl);
    const q = st.q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const list = ART.filter(a => (!q || a.q.includes(q)) && (st.show !== 'mine' || ownedSet.has(a.id))).sort((a, b) => b.r - a.r || b.v - a.v);
    const g = h('<div class="grid"></div>');
    for (const a of list.slice(0, st.n)) g.append(card(a.id, { label: ownedSet.has(a.id) ? 'À toi' : '' }));
    body.append(g);
    if (!list.length) body.append(h('<p class="empty-note">Aucune œuvre trouvée.</p>'));
    if (list.length > st.n) {
      const more = h(`<button class="btn" style="margin:18px auto 0;display:flex">Voir plus</button>`);
      more.onclick = () => { st.n += 90; openPanel('catalog'); };
      body.append(more);
    }
    const inp = $('#cat-q', body);
    let tm;
    inp.oninput = () => {
      clearTimeout(tm);
      tm = setTimeout(() => { st.q = inp.value; st.n = 60; openPanel('catalog'); const e = $('#cat-q'); e?.focus(); e?.setSelectionRange(e.value.length, e.value.length); }, 300);
    };
    $$('.seg button', fl).forEach(b => b.onclick = () => { st.show = b.dataset.v; st.n = 60; openPanel('catalog'); });
  },

  shop(arg, tab = 'crates') {
    const body = frameSheet('Trouver des œuvres', 'Ouvre une caisse ou gagne une vente aux enchères.', [['crates', 'Caisses'], ['auctions', `Enchères ${S.auctions.length}`]], tab);
    if (tab === 'crates') {
      const grid = h('<div class="cards3"></div>');
      for (const c of CRATES) {
        const box = h(`<div class="box crate crate-${c.k}"><div class="crate-art"></div><h3>${c.name}</h3><p>${c.desc}</p>
          <div class="odds">${c.w.map((w, i) => w ? `<i style="flex:${w};background:${rar(i + 1).color}"></i>` : '').join('')}</div>
          <p>${c.w.map((w, i) => w ? `${rar(i + 1).name} ${w} %` : '').filter(Boolean).join(' · ')}</p>
          <button class="btn ${S.money >= c.cost ? 'primary' : ''}">Ouvrir · ${money(c.cost)}</button></div>`);
        $('button', box).onclick = () => openCrate(c);
        grid.append(box);
      }
      body.append(grid);
    } else {
      body.append(h(`<p class="note">Les rivaux enchérissent en direct. Quand le temps est écoulé, le plus offrant gagne. Si quelqu’un te dépasse, ton argent t’est rendu.</p>`));
      const lots = [...S.auctions].sort((a, b) => a.end - b.end);
      for (const l of lots) body.append(lotRow(l));
      const b = h('<button class="btn" style="margin-top:16px">Vendre une de mes œuvres aux enchères</button>');
      b.onclick = () => pickItems('Quelle œuvre vendre ?', S.items.filter(x => !x.selling && !x.copy), it => consign(it));
      body.append(b);
    }
  },

  rivals() {
    const all = [{ id: 'me', name: S.me.name }, ...S.rivals.map(r => ({ id: r.id, name: r.name }))]
      .map(x => ({ ...x, v: collectionValue(x.id), n: worksOf(x.id).length })).sort((a, b) => b.v - a.v);
    const rank = all.findIndex(x => x.id === 'me') + 1;
    const body = frameSheet('Défis', `Tu es <b class="good">${rank}<sup>e</sup></b> sur ${all.length}. Commence par les rivaux faciles.`);
    body.append(h(`<div class="box" style="margin-top:14px"><b>Comment ça marche</b><p>3 manches. À chaque manche, le jury donne un thème et tu choisis une de tes œuvres. Gagne 2 manches : tu prends une œuvre de ton rival. Perds : il prend une des tiennes.</p></div>`));
    const list = h('<div class="list"></div>');
    const diff = lvl => lvl <= 3 ? ['Facile', 'good'] : lvl <= 6 ? ['Moyen', 'warn'] : ['Difficile', 'bad'];
    for (const r of [...S.rivals].sort((a, b) => a.lvl - b.lvl || collectionValue(a.id) - collectionValue(b.id))) {
      const ready = canDuel(r.id), [dn, dc] = diff(r.lvl);
      const row = h(`<div class="li"><div class="grow" style="cursor:pointer"><div class="t">${esc(r.name)}</div><div class="s"><span class="${dc}">${dn}</span> · ${worksOf(r.id).length} œuvres · ${money(collectionValue(r.id))}</div></div>
        <button class="btn sm ${ready ? 'primary' : ''}" ${ready ? '' : 'disabled'}>${ready ? 'Défier' : dur(r.cool - now())}</button></div>`);
      $('.grow', row).onclick = () => openOwner(r.id);
      $('button', row).onclick = () => { closeSheet(); openDuel(r.id); };
      list.append(row);
    }
    body.append(list);
  },

  owner(id) {
    const o = ownerInfo(id);
    if (!o) return closeSheet();
    select(id);
    const works = worksOf(id);
    const body = frameSheet(esc(o.name), `${esc(o.boss)} · niveau ${o.lvl}${o.near ? ' · près de ' + esc(o.near) : ''} · ${works.length} œuvres`);
    const act = h(`<div class="row" style="margin-top:14px">
      <button class="btn primary" data-duel ${canDuel(id) ? '' : 'disabled'}>${canDuel(id) ? `Défier · ${money(duelFee(o.lvl))}` : `Il se repose · ${dur(o.ref.cool - now())}`}</button>
      <button class="btn" data-fly>Voir sur la carte</button></div>`);
    $('[data-duel]', act).onclick = () => { closeSheet(); openDuel(id); };
    $('[data-fly]', act).onclick = () => flyTo(o.lat, o.lon, 9);
    body.append(act);
    body.append(h(`<p class="note"><i>« ${esc(o.motto)} »</i></p>`));
    const w = h('<div class="wall"></div>');
    for (const aid of works.slice(0, 40)) {
      const a = ART[aid];
      const el = h(`<button class="slot"><div class="frame"><img></div><div class="cartel"><b>${esc(a.t)}</b><span>${esc(a.a)}</span></div></button>`);
      $('.frame', el).style.aspectRatio = String(clamp(a.ar || 0.8, 0.55, 1.5));
      bindImg($('img', el), a);
      el.onclick = () => openArt(aid);
      w.append(el);
    }
    body.append(w);
  },

  list(ids) {
    const body = frameSheet('Musées ici', `${ids.length} musées`);
    const list = h('<div class="list"></div>');
    for (const id of ids) {
      const o = ownerInfo(id);
      const row = h(`<div class="li" style="cursor:pointer"><div class="grow"><div class="t">${esc(o.name)}</div><div class="s">${o.kind === 'me' ? 'Ton musée' : 'Rival'} · niveau ${o.lvl} · ${worksOf(id).length} œuvres</div></div></div>`);
      row.onclick = () => id === 'me' ? openPanel('museum') : openOwner(id);
      list.append(row);
    }
    body.append(list);
  },
};
export const openOwner = id => openPanel('owner', id);

function lotRow(l) {
  const a = ART[l.aid];
  const top = l.top ? (l.top === 'me' ? 'Toi' : ownerInfo(l.top)?.name) : 'Personne';
  const step = bidStep(l);
  const row = h(`<div class="lot ${l.top === 'me' ? 'mine' : ''}"><div class="frame"><img></div><div class="meta">
    <div class="row">${rarChip(a)}<span class="timer num" data-until="${l.end}">${dur(l.end - now())}</span></div>
    <div class="t">${esc(a.t)}</div><div class="muted" style="font-size:13px">${esc(a.a)} · vaut ${money(a.v)}</div>
    <div class="bid">${money(l.bid)}</div><div class="muted" style="font-size:12.5px">Meilleure offre : <b>${esc(top)}</b>${l.seller === 'me' ? ' · c’est ton œuvre' : ''}</div>
    ${l.seller === 'me' ? '' : l.top === 'me' ? '<p class="good" style="margin:4px 0 0">Tu es en tête !</p>' : `<button class="btn sm primary" data-b="${l.bid + step}" style="margin-top:6px;align-self:flex-start">Enchérir ${money(l.bid + step)}</button>`}
  </div></div>`);
  bindImg($('img', row), a);
  $('.frame', row).onclick = () => openArt(l.aid);
  const b = $('[data-b]', row);
  if (b) b.onclick = () => { if (playerBid(l, +b.dataset.b)) { S.stats.bids = (S.stats.bids ?? 0) + 1; toast(`Tu es en tête sur « ${a.t} ».`, 'good'); refreshPanel(); } };
  return row;
}

// ---------- guide pas à pas ----------
const STEPS = [
  { text: 'Touche la carte pour poser ton musée où tu veux.', done: () => S.me.placed, reward: 0 },
  { text: 'Ouvre ta première caisse (menu Caisses).', done: () => S.stats.exped >= 1, reward: 5000, open: 'shop' },
  { text: 'Accroche ta nouvelle œuvre au mur (menu Musée).', done: () => wallItems().length >= 5, reward: 5000, open: 'museum' },
  { text: 'Défie un rival pour lui gagner une œuvre (menu Défis).', done: () => S.stats.duels >= 1, reward: 15000, open: 'rivals' },
  { text: 'Fais une offre aux enchères (menu Caisses, onglet Enchères).', done: () => (S.stats.bids ?? 0) >= 1 || S.stats.auctionsWon >= 1, reward: 10000, open: 'shop', tab: 'auctions' },
  { text: 'Achète une protection (menu Musée, onglet Améliorer).', done: () => DEF.some(d => S.me.def[d.k] > 0), reward: 10000, open: 'museum', tab: 'upgrade' },
  { text: 'Fais une copie d’une de tes œuvres (touche une œuvre, puis « Faire une copie »).', done: () => S.stats.copies >= 1, reward: 10000, open: 'museum' },
];
export function updateQuest() {
  S.step ??= 0;
  while (S.step < STEPS.length && STEPS[S.step].done()) {
    const st = STEPS[S.step];
    if (st.reward) { S.money += st.reward; toast(`Étape réussie ! +${money(st.reward)}`, 'good'); }
    S.step++;
  }
  const q = $('#quest');
  if (S.step >= STEPS.length) { q.hidden = true; return; }
  const st = STEPS[S.step];
  q.hidden = false;
  q.innerHTML = `<span class="q-num">Étape ${S.step + 1}/${STEPS.length}</span><span class="q-text">${esc(st.text)}</span>${st.reward ? `<span class="q-rew num">+${money(st.reward)}</span>` : ''}`;
  q.onclick = () => st.open && openPanel(st.open, null, st.tab ?? null);
  $$('#nav button').forEach(b => b.classList.toggle('hint', b.dataset.open === st.open && currentPanel() !== st.open));
}

// ---------- fiche d'œuvre ----------
export function openArt(aid, iid = null) {
  const a = ART[aid];
  const it = iid ? S.items.find(x => x.iid === iid) : myOriginal(aid);
  const oid = it && !it.copy ? 'me' : ownerOf(aid);
  const o = ownerInfo(oid);
  const lot = S.auctions.find(l => l.aid === aid);
  const where = it?.copy ? 'Ta copie' : oid === 'me' ? (it?.wall ? 'Accrochée dans ton musée' : 'À toi, pas encore accrochée') : o ? 'Chez ' + esc(o.name) : lot ? 'Aux enchères en ce moment' : 'Personne ne l’a encore';
  modal().hidden = false;
  modal().innerHTML = `<div class="art">
    <button class="icon-btn close-x" data-x aria-label="Fermer">✕</button>
    <div class="frame ${it?.copy ? 'copy' : ''}"><img></div>
    <div class="art-info">
      <div class="row">${rarChip(a)}</div>
      <h2>${esc(a.t)}</h2>
      <p class="by">${esc(a.a)} · ${esc(a.d)}</p>
      <dl class="kv"><dt>Valeur</dt><dd class="num">${money(it?.copy ? a.v * 0.02 * it.copy : a.v)}</dd><dt>Dans le jeu</dt><dd>${where}</dd><dt>En vrai</dt><dd>${esc(a.m)}</dd></dl>
      <div class="actions"></div>
      <p class="src">Image : ${SOURCES[a.s]}${a.wk ? ` · <a href="${esc(a.wk)}" target="_blank" rel="noopener">En savoir plus ↗</a>` : ''}</p>
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
      else btn('Accrocher au mur', () => {
        if (wallItems().length >= slotsFor(S.me.lvl)) return toast('Tous tes murs sont pris. Décroche une œuvre ou agrandis ton musée.', 'warn');
        it.wall = true; emit('changed'); close();
      }, 'primary');
    }
    if (!it.copy) {
      btn(`Faire une copie · ${money(copyCost(aid))}`, () => { if (makeCopy(aid)) close(); });
      if (!it.selling) btn(`Vendre · ${money(sellPrice(aid))}`, () => {
        S.money += sellPrice(aid); removeItem(it); setOwner(aid, null);
        toast(`Vendue ${money(sellPrice(aid))}.`, 'good'); emit('changed'); close();
      });
    } else {
      const p = Math.round(a.v * 0.02 * it.copy);
      btn(`Vendre la copie · ${money(p)}`, () => { S.money += p; removeItem(it); emit('changed'); close(); });
    }
    if (it.copy) acts.append(h('<p class="muted" style="margin:0;width:100%">Une copie rapporte un peu d’argent si tu l’accroches. Pratique pour garder les murs pleins.</p>'));
  } else if (o && oid !== 'me') {
    btn(`Défier ${esc(o.name)} pour la gagner`, () => { close(); openDuel(oid); }, 'primary');
  } else if (lot) {
    btn('Aller aux enchères', () => { close(); openPanel('shop', null, 'auctions'); }, 'primary');
  } else {
    acts.append(h('<p class="muted" style="margin:0">Elle peut sortir d’une caisse ou passer aux enchères.</p>'));
  }
}

export function pickItems(title, items, onPick) {
  modal().hidden = false;
  modal().innerHTML = `<div class="dialog" style="width:min(720px,100%);max-height:86vh;overflow:auto"><div class="spread"><h3>${esc(title)}</h3><button class="icon-btn" data-x aria-label="Fermer">✕</button></div>
    ${items.length ? '' : '<p class="muted">Aucune œuvre disponible. Ouvre une caisse pour en trouver.</p>'}<div class="grid"></div></div>`;
  const close = () => { modal().hidden = true; modal().innerHTML = ''; };
  $('[data-x]', modal()).onclick = close;
  modal().onclick = e => { if (e.target === modal()) close(); };
  const g = $('.grid', modal());
  for (const it of items.sort((a, b) => ART[b.aid].v - ART[a.aid].v)) {
    g.append(card(it.aid, { item: it, label: it.copy ? 'Copie' : money(ART[it.aid].v), onClick: () => { close(); onPick(it); } }));
  }
}

export function reveal(aid, source) {
  const a = ART[aid];
  modal().hidden = false;
  modal().innerHTML = `<div class="reveal"><p class="eyebrow">${esc(source)}</p>
    <div style="position:relative"><div class="glow" style="background:${rar(a.r).color}"></div><div class="frame"><img></div></div>
    <p class="eyebrow" style="color:${rar(a.r).color};font-size:14px">${rar(a.r).name}</p>
    <h2>${esc(a.t)}</h2><p class="by" style="margin:0;font:italic 500 17px var(--display)">${esc(a.a)}</p>
    <p class="num">Valeur ${money(a.v)}</p><div class="row"><button class="btn primary" data-show>Accrocher au mur</button><button class="btn" data-x>Plus tard</button></div></div>`;
  bindImg($('img', modal()), a, true);
  const close = () => { modal().hidden = true; modal().innerHTML = ''; };
  $('[data-x]', modal()).onclick = close;
  $('[data-show]', modal()).onclick = () => {
    const it = myOriginal(aid);
    if (it && wallItems().length < slotsFor(S.me.lvl)) { it.wall = true; emit('changed'); }
    else toast('Tous tes murs sont pris. Agrandis ton musée ou décroche une œuvre.', 'warn');
    close();
  };
}

export function showToast(msg, kind, extra) {
  const el = h(`<div class="toast ${kind}"><span>${esc(msg)}</span></div>`);
  if (extra?.aid != null) { const b = h('<button>Voir</button>'); b.onclick = () => { openArt(extra.aid, extra.iid); el.remove(); }; el.append(b); }
  if (extra?.owner) { const b = h('<button>Revanche</button>'); b.onclick = () => { openDuel(extra.owner); el.remove(); }; el.append(b); }
  $('#toasts').prepend(el);
  while ($('#toasts').children.length > 3) $('#toasts').lastChild.remove();
  setTimeout(() => el.remove(), kind === 'bad' ? 8000 : 5000);
}

export function liveUpdate() {
  $$('[data-until]').forEach(e => { const left = +e.dataset.until - now(); e.textContent = dur(left); e.classList.toggle('hurry', left < 15000); });
}
