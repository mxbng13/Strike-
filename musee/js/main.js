// Démarrage : catalogue, carte, boucle de jeu, barre du haut et navigation.
import { loadCatalog } from './catalog.js';
import { S, load, save, collectionValue, worksOf, ownerInfo, log } from './state.js';
import { on, tick, catchUp, toast, setChallengeHandler } from './sim.js';
import { incomingChallenge } from './duel.js';
import { initMap, loadLand, mapEvents, flyTo, setPlacing, nearestCity, select, markDirty } from './map.js';
import { openPanel, closeSheet, refreshPanel, openOwner, showToast, reveal, liveUpdate, goalsReady, setStartPlacing, currentPanel } from './ui.js';
import { money, dur, esc, $, $$, h } from './util.js';

async function boot() {
  await Promise.all([loadCatalog(), loadLand()]);
  load();
  await initMap($('#map'));
  on('toast', showToast);
  on('reveal', reveal);
  on('changed', () => { markDirty(); refreshPanel(); hud(); save(); });
  setChallengeHandler(rv => rv && incomingChallenge(rv));
  setStartPlacing(startPlacing);

  $$('#nav button').forEach(b => b.onclick = () => currentPanel() === b.dataset.open ? closeSheet() : openPanel(b.dataset.open));
  $$('[data-open]', $('#hud')).forEach(b => b.onclick = () => openPanel(b.dataset.open));
  $('#menu-btn').onclick = () => openPanel('rivals', null, 'goals');
  $$('[data-zoom]').forEach(b => b.onclick = () => {
    const z = b.dataset.zoom;
    if (z === 'home') return S.me.placed ? flyTo(S.me.lat, S.me.lon, 10) : flyTo(30, 10, 0.1);
    import('./map.js').then(m => m.zoomBy(z === 'in' ? 1.8 : 1 / 1.8));
  });

  mapEvents.onSelect = ids => {
    if (!ids) { select(null); return; }
    if (ids.length === 1) return ids[0] === 'me' ? openPanel('museum') : openOwner(ids[0]);
    openPanel('list', ids);
  };
  mapEvents.onPlace = (lat, lon, onLand) => {
    if (!onLand) return toast('Il faut construire sur la terre ferme.', 'warn');
    confirmPlace(lat, lon);
  };

  const away = catchUp();
  if (S.me.placed) flyTo(S.me.lat, S.me.lon, 3.5, 1400); else startPlacing();
  if (away?.gained) toast(`Pendant votre absence (${dur(away.away)}), vos visiteurs ont rapporté ${money(away.gained)}.`, 'good');

  let last = performance.now();
  setInterval(() => {
    const t = performance.now();
    tick(t - last); last = t;
    hud(); liveUpdate();
    if (currentPanel() === 'auctions' && ++auctionTick % 3 === 0) refreshPanel();
  }, 1000);
  setInterval(save, 5000);
  addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  addEventListener('pagehide', save);
  hud();
  $('#loading').classList.add('out');
  setTimeout(() => $('#loading').remove(), 600);
}

function startPlacing() {
  setPlacing(true);
  $('#place-hint').hidden = false;
}
function confirmPlace(lat, lon) {
  const near = nearestCity(lat, lon);
  const m = $('#modal');
  m.hidden = false;
  m.innerHTML = `<div class="dialog"><p class="eyebrow">Nouvel emplacement</p><h3>Bâtir ici, près de ${esc(near)} ?</h3>
    <label class="field">Nom du musée<input type="text" id="place-name" maxlength="32" value="${esc(S.me.placed ? S.me.name : 'Musée de ' + near)}"></label>
    ${S.pendingMove ? `<p class="muted">Déménagement : ${money(S.pendingMove)}</p>` : ''}
    <div class="row"><button class="btn primary" data-ok>Construire</button><button class="btn" data-no>Choisir ailleurs</button></div></div>`;
  $('[data-no]', m).onclick = () => { m.hidden = true; m.innerHTML = ''; };
  $('[data-ok]', m).onclick = () => {
    if (S.pendingMove) { if (S.money < S.pendingMove) return toast('Pas assez d’argent.', 'bad'); S.money -= S.pendingMove; S.pendingMove = 0; }
    const first = !S.me.placed;
    Object.assign(S.me, { placed: true, lat, lon, near, name: $('#place-name', m).value.trim() || 'Mon musée' });
    m.hidden = true; m.innerHTML = '';
    setPlacing(false); $('#place-hint').hidden = true;
    log(`${S.me.name} ouvre ses portes près de ${near}.`, 'good');
    toast(first ? `${S.me.name} ouvre ses portes ! Accrochez vos œuvres et défiez vos voisins.` : 'Déménagement terminé.', 'good');
    flyTo(lat, lon, 8);
    save(); markDirty(); hud();
    if (first) openPanel('museum');
  };
}

let auctionTick = 0;
let rankCache = { t: 0, v: '—' };
function hud() {
  $('#h-money').textContent = money(S.money);
  import('./state.js').then(({ incomePerMin }) => { $('#h-income').textContent = `+${money(incomePerMin())}/min`; });
  if (performance.now() - rankCache.t > 5000) {
    const mine = collectionValue('me');
    const ids = S.rivals.map(r => r.id);
    rankCache = { t: performance.now(), v: '#' + (1 + ids.filter(id => collectionValue(id) > mine).length) };
  }
  $('#h-rank').textContent = rankCache.v;
  const n = goalsReady();
  $('#menu-btn').classList.toggle('alert', n > 0);
}

boot().catch(e => {
  console.error(e);
  $('#loading p').textContent = 'Impossible de charger le jeu. Rechargez la page.';
});
