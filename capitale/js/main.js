// Point d'entrée : relie la carte 3D, la simulation et l'interface.
import { createWorld, MAP, heightAt, terrainColor } from './world.js';
import { load, save, reset, log, hourOf, fmt } from './game/state.js';
import { Game, PLACE_BY_ID } from './game/game.js';
import { UI } from './ui/ui.js';
import { PLACES, SITES, VEHICLES } from './data/places.js';
import * as THREE from 'three';

const TRAVEL_SCALE = 30;   // minutes de jeu par seconde réelle pendant un trajet
const IDLE_SCALE = 1;      // minutes de jeu par seconde réelle le reste du temps

const state = load();

requestAnimationFrame(() => setTimeout(init, 30));

function init() {
  const world = createWorld(document.getElementById('c'), PLACES, SITES);
  const pos = (id) => world.placePos[id];
  const here = () => [state.pos.x, state.pos.z];
  const distanceTo = (id) => { const p = pos(id); return Math.hypot(p[0] - state.pos.x, p[1] - state.pos.z); };
  let travel = null;

  function arriveOffset(id) { return PLACE_BY_ID[id].kind ? 30 : 9; }
  const game = new Game(state, {
    distanceTo,
    distanceBetween: (a, b) => { const pa = a ? pos(a) : here(); const pb = pos(b); return Math.hypot(pa[0] - pb[0], pa[1] - pb[1]); },
    climateAt: world.climateAt,
    teleport: (id) => {
      const p = pos(id);
      state.pos.x = p[0]; state.pos.z = p[1] + arriveOffset(id);
      travel = null; world.setDestination(null);
      world.flyTo(state.pos.x, state.pos.z);
    },
  });

  // première partie : on démarre au pied de la grande flèche
  if (!state.started) { const p = pos('portail'); state.pos = { x: p[0], z: p[1] + 9 }; }

  const ui = new UI(game, {
    distanceTo,
    travelTo: (id) => { const p = pos(id); startTravel(p[0], p[1] + arriveOffset(id), id); },
    minigame: () => startMinigame(),
    reset: () => { reset(); state.__reset = true; location.reload(); },
  });
  state.onLog = (msg, kind) => ui.toast(msg, kind);
  game.onChange(() => ui.render());

  // ------------------------------------------------------------------ déplacements
  function startTravel(x, z, placeId) {
    if (placeId && game.at(placeId)) { ui.open('place', placeId); return; }
    travel = { x, z, placeId };
    world.setDestination(x, z);
    world.follow(true);
    if (window.innerWidth < 800) ui.close();
  }
  world.onTap(({ placeId, x, z }) => {
    if (placeId) ui.open('place', placeId);
    else startTravel(x, z, null);
  });
  const tip = document.getElementById('tip');
  world.onHover((id, x, y) => {
    if (!id) { tip.style.display = 'none'; return; }
    const p = PLACE_BY_ID[id];
    tip.innerHTML = `${p.emoji} <b>${p.nom}</b><br><small>${p.desc || ''}</small>`;
    tip.style.display = 'block';
    tip.style.left = `${Math.min(x + 14, innerWidth - 260)}px`;
    tip.style.top = `${y + 14}px`;
  });

  let heading = 0;
  function stepTravel(dt) {
    if (!travel) return;
    let mode = state.transport;
    const v = VEHICLES[mode];
    const dx = travel.x - state.pos.x, dz = travel.z - state.pos.z;
    const d = Math.hypot(dx, dz);
    let speed = v.speed;
    const wet = !v.fly && heightAt(state.pos.x, state.pos.z) < -1;
    if (wet) speed = VEHICLES.marche.speed * 0.35;     // à la nage
    let step = speed * TRAVEL_SCALE * dt;
    if (step >= d) step = d;
    heading = Math.atan2(dx, dz);
    state.pos.x += (dx / (d || 1)) * step;
    state.pos.z += (dz / (d || 1)) * step;
    const minutes = step / speed;
    game.travelled(step, wet ? 'marche' : mode);
    game.advance(minutes);
    if (!travel) return;           // évanoui pendant le trajet
    if (step >= d - 0.01) {
      const id = travel.placeId;
      travel = null;
      world.setDestination(null);
      world.follow(false);
      if (id) { ui.toast(`Arrivé : ${PLACE_BY_ID[id].nom}`, 'good'); ui.open('place', id); }
      game.changed();
    }
  }

  // ------------------------------------------------------------------ mini-carte
  const mm = document.getElementById('mm');
  const mmCtx = mm.getContext('2d');
  const S = 256;
  const img = mmCtx.createImageData(S, S), col = new THREE.Color();
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const x = (i / S - 0.5) * MAP, z = (j / S - 0.5) * MAP;
    const h = heightAt(x, z);
    const sl = (Math.abs(heightAt(x + 30, z) - h) + Math.abs(heightAt(x, z + 30) - h)) / 60;
    if (h < 0) col.set('#2a86c0'); else terrainColor(h, sl, x, z, col);
    const shade = 1 + Math.max(-0.35, Math.min(0.35, (heightAt(x - 30, z - 30) - h) / 40));
    col.convertLinearToSRGB();
    const k = (j * S + i) * 4;
    img.data[k] = Math.min(255, col.r * shade * 255); img.data[k + 1] = Math.min(255, col.g * shade * 255);
    img.data[k + 2] = Math.min(255, col.b * shade * 255); img.data[k + 3] = 255;
  }
  const mmBase = document.createElement('canvas'); mmBase.width = mmBase.height = S;
  mmBase.getContext('2d').putImageData(img, 0, 0);
  const toMM = (x, z) => [(x / MAP + 0.5) * S, (z / MAP + 0.5) * S];
  function drawMinimap(t) {
    mmCtx.drawImage(mmBase, 0, 0);
    const pts = world.viewCorners().map(([x, z]) => toMM(x, z));
    mmCtx.beginPath(); pts.forEach(([x, y], i) => (i ? mmCtx.lineTo(x, y) : mmCtx.moveTo(x, y))); mmCtx.closePath();
    mmCtx.fillStyle = 'rgba(94,227,255,0.12)'; mmCtx.fill();
    mmCtx.strokeStyle = 'rgba(230,250,255,0.9)'; mmCtx.lineWidth = 1.5; mmCtx.stroke();
    mmCtx.font = '13px sans-serif'; mmCtx.textAlign = 'center'; mmCtx.textBaseline = 'middle';
    for (const s of SITES) { const [x, y] = toMM(...pos(s.id)); mmCtx.fillText(s.emoji, x, y); }
    const [cx, cy] = toMM(0, 0);
    mmCtx.beginPath(); mmCtx.arc(cx, cy, 4, 0, Math.PI * 2); mmCtx.fillStyle = '#5ee3ff'; mmCtx.fill();
    const [px, py] = toMM(state.pos.x, state.pos.z);
    mmCtx.beginPath(); mmCtx.arc(px, py, 3.5 + Math.sin(t * 5), 0, Math.PI * 2);
    mmCtx.fillStyle = '#ffb84d'; mmCtx.fill(); mmCtx.strokeStyle = '#000'; mmCtx.lineWidth = 1; mmCtx.stroke();
  }
  let mmDown = false;
  const mmPick = (e) => { const r = mm.getBoundingClientRect(); world.flyTo(((e.clientX - r.left) / r.width - 0.5) * MAP, ((e.clientY - r.top) / r.height - 0.5) * MAP); };
  mm.addEventListener('pointerdown', (e) => { mmDown = true; mm.setPointerCapture(e.pointerId); mmPick(e); });
  mm.addEventListener('pointermove', (e) => { if (mmDown) mmPick(e); });
  mm.addEventListener('pointerup', () => { mmDown = false; });

  // ------------------------------------------------------------------ boutons
  const $ = (id) => document.getElementById(id);
  $('zin').onclick = () => world.zoomBy(0.55);
  $('zout').onclick = () => world.zoomBy(1.8);
  $('home').onclick = () => world.home();
  $('me').onclick = () => world.flyTo(state.pos.x, state.pos.z, Math.min(world.dist, 260));
  $('compass').onclick = () => world.resetNorth();
  $('panelx').onclick = () => ui.close();
  let paused = false;
  $('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? '▶️' : '⏸️'; $('pause').title = paused ? 'Reprendre le temps' : 'Mettre le temps en pause'; };
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); world.home(); }
    if (e.code === 'Escape') ui.close();
  });

  // ------------------------------------------------------------------ mini-jeu de l'arène
  function startMinigame() {
    const ov = $('minigame'), zone = $('mgzone'), info = $('mginfo');
    ov.classList.add('show');
    let score = 0, left = 15;
    zone.innerHTML = '';
    const target = document.createElement('button');
    target.className = 'mgtarget'; target.textContent = '🎯';
    zone.appendChild(target);
    const move = () => {
      target.style.left = `${8 + Math.random() * 78}%`;
      target.style.top = `${8 + Math.random() * 74}%`;
      target.style.transform = `scale(${0.7 + Math.random() * 0.6})`;
    };
    target.onclick = () => { score++; move(); info.textContent = `Touché : ${score} · ${left} s`; };
    move();
    info.textContent = `Touchez la cible un maximum de fois ! ${left} s`;
    const timer = setInterval(() => {
      left--;
      info.textContent = `Touché : ${score} · ${left} s`;
      if (left <= 0) {
        clearInterval(timer);
        zone.innerHTML = `<div class="mgend">Score : ${score}<br><small>${fmt(score * 12)} gagnés</small></div>`;
        game.minigameReward(score);
        game.changed();
        setTimeout(() => ov.classList.remove('show'), 1600);
      }
    }, 1000);
  }

  // ------------------------------------------------------------------ accueil
  if (!state.started) {
    $('intro').classList.add('show');
    $('introgo').onclick = () => {
      state.nom = ($('introname').value || '').trim().slice(0, 20) || 'Voyageur';
      state.started = true;
      log(state, `Bienvenue à Nexus, ${state.nom} ! Commencez par un petit boulot à l’Agence pour l’emploi.`, 'good');
      $('intro').classList.remove('show');
      game.changed();
    };
  }
  $('pname').textContent = state.nom;
  game.onChange(() => { $('pname').textContent = state.nom; });

  // ------------------------------------------------------------------ boucle
  document.getElementById('loading').classList.add('done');
  world.flyTo(state.pos.x, state.pos.z);
  ui.render();
  const clock = new THREE.Clock();
  let acc = 0, uiAcc = 0, saveAcc = 0, frameN = 0, lastWeather = null;
  window.__nexus = { game, world, state, ui };
  function tick() {
    const dt = Math.min(clock.getDelta(), 0.1);
    if (!document.hidden) {
      if (travel) stepTravel(dt);
      else if (!paused && state.started) {
        acc += dt * IDLE_SCALE;
        if (acc >= 1) { const m = Math.floor(acc); acc -= m; game.advance(m); }
      }
    }
    world.setAvatar(state.pos.x, state.pos.z, travel ? state.transport : 'marche', heading);
    world.setTime(hourOf(state.time));
    if (state.weather.type !== lastWeather) { lastWeather = state.weather.type; world.setWeather(lastWeather); }
    world.frame();
    uiAcc += dt; saveAcc += dt;
    if (uiAcc > 0.5) { uiAcc = 0; ui.updateHud(); document.getElementById('zfill').style.height = `${(1 - world.zoomT()) * 100}%`; }
    if (saveAcc > 8) { saveAcc = 0; save(state); }
    if ((frameN++ & 1) === 0) { drawMinimap(clock.elapsedTime); document.getElementById('needle').style.transform = `rotate(${world.yaw * 180 / Math.PI}deg)`; }
    requestAnimationFrame(tick);
  }
  addEventListener('beforeunload', () => { if (!state.__reset) save(state); });
  tick();
}
