// COMBAT EN ARÈNE : combat en temps réel en vue du dessus, en Duel (1 contre 1) ou en Duo (2 contre 2 avec
// un allié IA), sur l’arène (Map1), victoire au nombre d’éliminations (3, 5 ou 10). Relie la carte, les combattants, les projectiles,
// l'IA, les bonus à ramasser, les commandes et l'interface.
import * as THREE from 'three';
import { buildArenaMap } from './mapBuilder.js';
import { useMap, WIDTH, DEPTH, toCell, cellCenter, findTiles, blocksMove, collide } from './grid.js';
import { createFighter, RADIUS } from './fighter.js';
import { weaponOf } from '../data/weapons.js';
import { ultiOf as ultiForStriker } from '../data/ultis.js';
import { addPassXp, trackPass } from '../game/battlePass.js';
import { PASS_XP } from '../data/battlePass.js';
import { sfx } from '../audio/sfx.js';
import { createProjectiles } from './projectiles.js';
import { createAI, canSee } from './ai.js';
import { createControls } from './controls.js';
import { createCloud, CLOUD } from './cloud.js';
import { ARENA_MAPS } from './maps.js';
import { CHARACTERS, getCharacter, shortName } from '../data/characters.js';
import { save } from '../save/storage.js';
import { appearanceFor } from '../game/appearance.js';
import { statsAt, grantRewards, COMBAT_LEVEL } from '../game/progression.js';
import { applyBattleTrophies } from '../game/trophies.js';
import { trophyResultHtml, rankedResultHtml } from '../ui/trophyResult.js';
import { applyRankedResult } from '../game/ranked.js';
import { applyEnvMap } from '../render/environment.js';
import { getCharacterSkin, getWeaponSkin } from '../data/skins.js';
import { getRank } from '../data/ranks.js';
import { ICONS } from '../ui/icons.js';

let ctx = null; // { renderer, stage }
const hpOf = (pv) => Math.round((pv * 8) / 10) * 10;
/** Ce que l'ami doit savoir de notre Striker pour l'afficher en combat amical (net/friendMatch.js). */
export function onlineFighterInfo(s = save.get()) {
  const def = getCharacter(s.selected), look = appearanceFor(def.id, s);
  return { strikerId: def.id, look: { rank: look.rank, skin: look.skin?.id ?? null, weaponSkin: look.weaponSkin?.id ?? null }, maxHp: hpOf(statsAt(def, COMBAT_LEVEL, look.rank).pv) };
}
export const initArena = (c) => { ctx = c; };

const PITCH = THREE.MathUtils.degToRad(55);   // inclinaison fixe de la caméra (vue du dessus)
const VIEW_W = 11.5;                          // largeur de terrain visible en portrait
const VIEW_H = 13;                            // hauteur visible en paysage
const BUSH_SEE = 2.3;                         // un ennemi dans un buisson n'est visible que de près
export const ARENA_REWARDS = { win: { coins: 60, gems: 0 }, loss: { coins: 10, gems: 0 } };   // + XP de passe (PASS_XP)
export const ARENA_FORMATS = {
  duel: { id: 'duel', name: 'Duel', short: '1 contre 1', size: 1 },
  duo: { id: 'duo', name: 'Duo', short: '2 contre 2', size: 2 },
};
// Victoire au score : chaque élimination d'un adversaire rapporte 1 point à l'équipe du tireur (en Duo, les
// éliminations des deux coéquipiers s'additionnent). Le combattant éliminé réapparaît dans son camp après
// RESPAWN s (protégé SPAWN_SHIELD s) ; la première équipe à atteindre le nombre choisi gagne aussitôt.
export const KILL_TARGETS = [3, 5, 10];
export const DEFAULT_KILL_TARGET = 5;
export const RESPAWN = 3;
export const SPAWN_SHIELD = 1.5;
// Bonus à ramasser : soin, charge d'ulti, puissance (dégâts +35 % pendant 8 s)
const BONUS = {
  heal: { color: 0x4cff8a },
  ulti: { color: 0xffc23d },
  power: { color: 0xff4f6a },
};
const ALLY_RING = 0x4fb6ff;

/**
 * `online` (combat amical contre un vrai joueur, net/friendMatch.js) : { room, foe: { strikerId, look, maxHp, name }, kills }.
 * Chaque téléphone joue son Striker et voit l'arène de son côté (l'arène est symétrique : la position de l'ami
 * reçue est retournée de 180°). Chacun fait foi pour les coups qu'il REÇOIT (vie, élimination) et l'annonce à l'autre.
 * Pas de bonus, d'IA, de trophées ni de récompenses dans ce mode.
 */
export function openArena({ onExit, format: formatId = null, kills: killsOpt = null, map: mapOpt = null, online = null } = {}) {
  const renderer = ctx.renderer;
  ctx.stage.pause();
  document.getElementById('hud').classList.add('hidden-for-battle');
  const isTouch = matchMedia('(pointer: coarse)').matches;
  const prefs = save.get().battlePrefs ?? {};
  const format = online ? ARENA_FORMATS.duel : ARENA_FORMATS[formatId ?? prefs.arenaFormat] ?? ARENA_FORMATS.duel;
  if (online) mapOpt = online.map;
  const mapDef = useMap(ARENA_MAPS[mapOpt] ? mapOpt : ARENA_MAPS[prefs.arenaMap] ? prefs.arenaMap : 'map1');
  if (online) killsOpt = online.kills;
  const killTarget = KILL_TARGETS.includes(killsOpt) ? killsOpt : KILL_TARGETS.includes(prefs.arenaKills) ? prefs.arenaKills : DEFAULT_KILL_TARGET;

  const scene = new THREE.Scene();
  applyEnvMap(renderer, scene, 0.6);
  const map = buildArenaMap(scene, { theme: mapDef.theme, isMobile: renderer.userData.isMobile });
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 120);
  const camTarget = new THREE.Vector3();
  const camDir = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH));

  // --- Combattants ---
  const state = save.get();
  const playerDef = getCharacter(state.selected);
  const look = appearanceFor(playerDef.id, state);
  const pStats = statsAt(playerDef, COMBAT_LEVEL, look.rank);
  const player = createFighter(scene, playerDef, look, {
    team: 'player', name: shortName(playerDef), maxHp: hpOf(pStats.pv), dmgMult: 1,
  });
  let ally = null;          // Duo : allié IA
  let enemies = [];
  const ais = new Map();    // combattant -> IA
  function makeAIFighter(def, team, { hp = 1, dmg = 0.8 } = {}) {
    const st = statsAt(def, COMBAT_LEVEL, 'basique');
    return createFighter(scene, def, { rank: 'basique', weapon: weaponOf(def.id).id, skin: null, weaponSkin: null },
      { team, name: shortName(def), maxHp: Math.round(hpOf(st.pv) * hp / 10) * 10, dmgMult: dmg, ringColor: team === 'player' ? ALLY_RING : null });
  }
  function makeTeams() {
    for (const f of [ally, ...enemies]) f?.dispose();
    ais.clear();
    if (online) {
      // l'adversaire est l'ami : son Striker, son apparence, sa vie ; aucune IA
      const def = getCharacter(online.foe.strikerId) ?? CHARACTERS[0];
      const lk = online.foe.look ?? {};
      ally = null;
      // apparence reçue : on ne garde que des valeurs qui existent dans le jeu
      const sk = getCharacterSkin(lk.skin), wsk = getWeaponSkin(lk.weaponSkin);
      enemies = [createFighter(scene, def, { rank: getRank(lk.rank).id, weapon: weaponOf(def.id).id, skin: sk?.strikerId === def.id ? sk : null, weaponSkin: wsk },
        { team: 'enemy', name: String(online.foe.name ?? shortName(def)).slice(0, 16), maxHp: online.foe.maxHp ?? 1000, dmgMult: 1 })];
      return;
    }
    const pool = [...CHARACTERS.filter((c) => c.id !== playerDef.id)].sort(() => Math.random() - 0.5);
    const take = () => pool.shift() ?? CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
    ally = format.size > 1 ? makeAIFighter(take(), 'player') : null;
    enemies = Array.from({ length: format.size }, () => makeAIFighter(take(), 'enemy'));
    const team = () => [player, ally].filter(Boolean);
    for (const e of enemies) ais.set(e, createAI(e, { foes: team, bonuses: () => bonuses, level: COMBAT_LEVEL }));
    if (ally) ais.set(ally, createAI(ally, { foes: () => enemies, leader: player, bonuses: () => bonuses, level: COMBAT_LEVEL + 1 }));
  }
  const fighters = () => [player, ally, ...enemies].filter(Boolean);
  const teamOf = (f) => (f.team === 'player' ? [player, ally].filter(Boolean) : enemies);
  const foesOf = (f) => (f.team === 'player' ? enemies : [player, ally].filter(Boolean));
  const shots = createProjectiles(scene);
  const cloud = createCloud(scene);   // nuage noir qui resserre l'arène (arena/cloud.js)

  // indicateur de visée au sol (portée de l'arme)
  const aimLine = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false }));
  aimLine.rotation.x = -Math.PI / 2;
  aimLine.geometry.translate(0, 0.5, 0);
  aimLine.position.y = 0.04;
  scene.add(aimLine);
  // ULTI : cercle de portée (quand la jauge est pleine) et onde de choc à l'atterrissage
  // chaque Striker a SON ulti (data/ultis.js), le joueur comme l'IA
  let ulti = ultiForStriker(playerDef.id);
  const ultiRange = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 72), new THREE.MeshBasicMaterial({ color: 0xffb422, transparent: true, opacity: 0.45, depthWrite: false }));
  ultiRange.rotation.x = -Math.PI / 2; ultiRange.position.y = 0.035; ultiRange.visible = false;
  const shock = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  shock.rotation.x = -Math.PI / 2; shock.position.y = 0.06;
  // visée de l'ulti (joystick d'ulti tenu) : bande dans la direction choisie + cercle d'impact au sol
  const ultiLine = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 1), new THREE.MeshBasicMaterial({ color: 0xffb422, transparent: true, opacity: 0.42, depthWrite: false }));
  ultiLine.geometry.translate(0, 0.5, 0); ultiLine.visible = false;
  const ultiMark = new THREE.Mesh(new THREE.RingGeometry(0.84, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffb422, transparent: true, opacity: 0.75, depthWrite: false }));
  ultiMark.rotation.x = -Math.PI / 2; ultiMark.visible = false;
  scene.add(ultiRange, shock, ultiLine, ultiMark);
  /** Distance de lancement selon l'inclinaison du joystick : seuls les ultis posés au sol en dépendent. */
  const PLACED = new Set(['leap', 'zone', 'vortex']);
  const ultiDist = (u, mag) => (PLACED.has(u.kind) ? Math.max(1, mag * u.range) : u.range);
  /** Point du sol sous le pointeur de la souris (ou null). */
  function groundAt(p) {
    ndc.set((p.x / innerWidth) * 2 - 1, -(p.y / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(plane, hitP) ? hitP : null;
  }
  let shockT = 1, shake = 0, lastUltiTrack = -99;
  // repères d'atterrissage quand un ADVERSAIRE lance son ulti (on peut l'esquiver)
  const markers = new Map();
  function markerFor(f) {
    if (!markers.has(f)) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 40), new THREE.MeshBasicMaterial({ color: 0xff3d7f, transparent: true, opacity: 0.8, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.05; m.visible = false; scene.add(m); markers.set(f, m);
    }
    return markers.get(f);
  }

  // particules de décor : poussière de course, feuilles qui volent en entrant dans un buisson
  const puffTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,.9)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
  })();
  const leafTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(16, 16, 13, 6, 0.6, 0, Math.PI * 2); g.fill();
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
  })();
  const fx = [];
  const dustColor = 0xe8d9b8;
  const leafColors = [0x5cbf4a, 0x3fa040, 0x8fd65a];
  const fxMats = { dust: new THREE.SpriteMaterial({ map: puffTex, color: dustColor, transparent: true, depthWrite: false }), leaf: new THREE.SpriteMaterial({ map: leafTex, color: 0x5cbf4a, transparent: true, depthWrite: false }) };
  function spawnFx(kind, x, y, z, { vx = 0, vy = 0, vz = 0, size = 0.5, grow = 1.5, life = 0.5, color = null } = {}) {
    if (fx.length > 110) return;
    const sp = new THREE.Sprite(fxMats[kind].clone());
    if (color) sp.material.color.set(color);
    sp.position.set(x, y, z); sp.scale.setScalar(size);
    sp.userData = { vx, vy, vz, size, grow, life, max: life, spin: (Math.random() - 0.5) * 8 };
    scene.add(sp); fx.push(sp);
  }
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const s = fx[i], u = s.userData;
      u.life -= dt;
      s.position.x += u.vx * dt; s.position.y += u.vy * dt; s.position.z += u.vz * dt;
      u.vy -= (s.material.map === leafTex ? 2.5 : 0) * dt;
      s.material.rotation += u.spin * dt;
      const k = 1 - u.life / u.max;
      s.scale.setScalar(u.size * (1 + k * u.grow));
      s.material.opacity = Math.max(0, (1 - k) * (s.material.map === leafTex ? 1 : 0.55));
      if (u.life <= 0) { scene.remove(s); s.material.dispose(); fx.splice(i, 1); }
    }
  }
  const dustT = new Map(), wasInBush = new Map();
  function leafBurst(x, z, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 2;
      spawnFx('leaf', x, 0.7 + Math.random() * 0.5, z, { vx: Math.cos(a) * v, vy: 1.5 + Math.random() * 1.5, vz: Math.sin(a) * v, size: 0.22, grow: 0, life: 0.7, color: leafColors[i % 3] });
    }
  }
  function burst(x, z, color, n = 12) {
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; spawnFx('dust', x, 0.5, z, { vx: Math.cos(a) * 2.4, vy: 1.2, vz: Math.sin(a) * 2.4, size: 0.35, grow: 1.2, life: 0.5, color }); }
  }

  // --- Bonus à ramasser (apparaissent sur les cases prévues par la carte, puis réapparaissent) ---
  const bonusGeo = { base: new THREE.RingGeometry(0.42, 0.6, 32), heal: new THREE.BoxGeometry(0.42, 0.13, 0.13), ulti: new THREE.OctahedronGeometry(0.26, 0), power: new THREE.TetrahedronGeometry(0.3, 0) };
  const bonuses = mapDef.bonus.map(([c, r], i) => {
    const [x, z] = cellCenter(c, r);
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const base = new THREE.Mesh(bonusGeo.base, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
    base.rotation.x = -Math.PI / 2; base.position.y = 0.05;
    const item = new THREE.Group(); item.position.y = 0.95;
    g.add(base, item);
    g.visible = false;
    scene.add(g);
    return { x, z, g, base, item, type: null, active: false, t: i < 2 ? 7 : 12, center: i < 2 };
  });
  function spawnBonus(b) {
    b.type = b.center ? (Math.random() < 0.5 ? 'power' : 'ulti') : 'heal';
    const col = BONUS[b.type].color;
    b.item.clear();
    const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.2, flatShading: true });
    if (b.type === 'heal') { const h = new THREE.Mesh(bonusGeo.heal, mat), v = new THREE.Mesh(bonusGeo.heal, mat); v.rotation.z = Math.PI / 2; b.item.add(h, v); }
    else { const m = new THREE.Mesh(bonusGeo[b.type], mat); m.scale.y = b.type === 'ulti' ? 1.4 : 1; b.item.add(m); }
    b.item.userData.mat = mat;
    b.base.material.color.set(col);
    b.active = true; b.g.visible = true;
    burst(b.x, b.z, col, 8);
  }
  function pickBonus(b, f) {
    b.active = false; b.g.visible = false; b.t = 14;
    b.item.userData.mat?.dispose();
    const col = BONUS[b.type].color;
    burst(b.x, b.z, col, 14);
    if (b.type === 'heal') { const h = Math.round(f.maxHp * 0.35); f.hp = Math.min(f.maxHp, f.hp + h); }
    else if (b.type === 'ulti') { f.ulti = Math.min(1, f.ulti + 0.6); }
    else { f.boostT = 8; }
    if (f === player || shownToPlayer(f)) sfx('claim', 0.1);
    if (f === player) navigator.vibrate?.(20);
  }
  function updateBonuses(dt) {
    for (const b of bonuses) {
      if (!b.active) { if (!online && playing() && (b.t -= dt) <= 0) spawnBonus(b); continue; }
      b.item.rotation.y = t * 2; b.item.position.y = 0.95 + Math.sin(t * 3 + b.x) * 0.12;
      b.base.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
      for (const f of fighters()) if (f.alive && !f.leap && Math.hypot(f.x - b.x, f.z - b.z) < 0.85) { pickBonus(b, f); break; }
    }
  }

  // --- Interface ---
  const root = document.createElement('div');
  root.id = 'arena';
  root.innerHTML = `
    <div class="ar-cloudfx"></div>
    <div class="ar-top">
      <button class="ar-quit" aria-label="Quitter">${ICONS.close}</button>
    </div>
    <div class="ar-score" aria-live="polite"></div>
    <div class="ar-respawn" hidden></div>
    <div class="ar-tags"></div>
    <div class="ar-arrows"></div>
    <div class="ar-dmgdir"><i></i></div>
    <div class="ar-fx"></div>
    <div class="ar-me" role="meter" aria-label="Points de vie"><div class="ar-bar player big"><i></i></div></div>
    <button class="ar-ulti" hidden aria-label="Ulti"><span class="ar-ulti-ic">${ICONS.ulti}</span><i class="ar-ulti-knob"></i></button>
    <div class="ar-count"></div>
    <div class="ar-cloudwarn" hidden><span>☁</span><b>LE NUAGE NOIR ARRIVE !</b><small>Il avance depuis les bords : reste vers le centre</small></div>
    <div class="ar-end" hidden></div>`;
  document.body.append(root);
  const $ = (s) => root.querySelector(s);
  const ultiBtn = $('.ar-ulti');
  // l'ulti a son propre joystick (le bouton ULTI) : on vise en le tirant, il part au relâchement
  const controls = createControls(root, { touch: isTouch, ultiEl: ultiBtn });
  addEventListener('touchstart', function first() { controls.setTouch(true); removeEventListener('touchstart', first); }, { once: true });

  const ui = { pBar: $('.ar-bar.player i'), count: $('.ar-count'), dmgdir: $('.ar-dmgdir') };
  const setText = (el, kind, v) => {
    if (el.dataset.v === v) return;
    el.dataset.v = v;
    if (kind === 'width') el.style.width = v; else if (kind === 'html') el.innerHTML = v; else el.textContent = v;
  };
  // petites barres de vie au-dessus des combattants (sans nom) et flèches vers les adversaires hors de l'écran
  const tags = new Map(), arrows = new Map();
  function buildUi() {
    $('.ar-tags').innerHTML = ''; $('.ar-arrows').innerHTML = '';
    tags.clear(); arrows.clear();
    for (const f of fighters()) {
      const el = document.createElement('div');
      el.className = `ar-tag ${f === player ? 'player' : f.team === 'player' ? 'ally' : 'enemy'}`;
      el.innerHTML = `<div class="ar-bar"><i></i></div>${f === player ? '<div class="ar-ammo"></div>' : ''}`;
      $('.ar-tags').append(el);
      tags.set(f, { el, bar: el.querySelector('.ar-bar i'), ammo: el.querySelector('.ar-ammo') });
    }
    for (const e of enemies) {
      const ar = document.createElement('div');
      ar.className = 'ar-arrow'; ar.innerHTML = '<i></i>';
      $('.ar-arrows').append(ar);
      arrows.set(e, ar);
    }
  }
  function ammoHtml(f) {
    // une barre par charge ; celle qui se recharge se remplit progressivement
    return Array.from({ length: f.gun.mag }, (_, i) => {
      const k = Math.max(0, Math.min(1, f.ammo - i));
      return `<i class="${k >= 1 ? 'full' : ''}" style="--f:${(k * 100).toFixed(0)}%"></i>`;
    }).join('');
  }
  const v3 = new THREE.Vector3();
  const project = (x, y, z) => { v3.set(x, y, z).project(camera); return [(v3.x * 0.5 + 0.5) * innerWidth, (-v3.y * 0.5 + 0.5) * innerHeight]; };
  // --- Caméra ---
  let viewW = VIEW_W, viewH = VIEW_W;
  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    const aspect = innerWidth / innerHeight;
    if (aspect < 1) { viewW = VIEW_W; viewH = VIEW_W / aspect; } else { viewH = VIEW_H; viewW = VIEW_H * aspect; }
    camera.left = -viewW / 2; camera.right = viewW / 2; camera.top = viewH / 2; camera.bottom = -viewH / 2;
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener('resize', resize);
  const focusFighter = () => (player.alive || !ally?.alive ? player : ally);
  function placeCamera(dt) {
    // suit le joueur (ou son allié s'il est éliminé) en douceur, sans sortir trop loin de l'arène
    const f = focusFighter();
    const groundH = viewH / Math.sin(PITCH);
    const mx = Math.max(0, WIDTH / 2 - viewW / 2 + 1.5), mz = Math.max(0, DEPTH / 2 - groundH / 2 + 9);
    const lead = f.alive ? 1.6 : 0;
    const tx = THREE.MathUtils.clamp(f.x + Math.sin(f.face) * lead, -mx, mx);
    // portrait : joueur un peu au-dessus des joysticks (en paysage ils sont dans les coins : joueur au centre)
    const portrait = innerHeight > innerWidth;
    let tz = f.z + Math.cos(f.face) * lead + (portrait ? 2.2 : 0.3), extra = 0;
    // portrait tactile : le joueur reste toujours au moins ~100 px au-dessus des joysticks au repos (écrans courts),
    // même au bord bas de l'arène (on laisse alors voir un peu plus du décor sous la carte)
    if (controls.touch && portrait) {
      const upPx = Math.max(0, innerHeight * 0.5 - (controls.restTop() - 100));
      extra = (upPx * (viewH / innerHeight)) / Math.sin(PITCH);
      tz = Math.max(tz, f.z + extra);
    }
    tz = THREE.MathUtils.clamp(tz, -mz, mz + extra);
    const k = dt ? 1 - Math.exp(-dt * 6) : 1;
    camTarget.x += (tx - camTarget.x) * k;
    camTarget.z += (tz - camTarget.z) * k;
    if (finishFocus) {
      // ralenti de fin : la caméra se rapproche du dernier combattant éliminé
      camTarget.x += (finishFocus.x - camTarget.x) * k; camTarget.z += (finishFocus.z + 1 - camTarget.z) * k;
      camera.zoom += (1.45 - camera.zoom) * k; camera.updateProjectionMatrix();
    }
    camera.position.copy(camTarget).addScaledVector(camDir, 40);
    camera.lookAt(camTarget);
    if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake * 0.5; camera.position.z += (Math.random() - 0.5) * shake * 0.5; shake = Math.max(0, shake - (dt || 0) * 1.8); }
  }

  // --- Partie ---
  let matchId = '', phase = 'count', countT = 3, over = false, t = 0, matchT = 0, rewarded = false, finishFocus = null, slowT = 0, lastCount = '';
  const score = { player: 0, enemy: 0 };   // éliminations de chaque équipe (score partagé en Duo)
  const scoredKills = new Set();           // anti double comptage : une élimination = un point
  const playing = () => phase === 'play' || (phase === 'count' && countT <= 0);
  /** Case libre la plus proche d'un départ, décalée de `n` cases sur le côté (Duo). */
  function spawnAt(ch, n) {
    const [c, r] = findTiles(ch)[0];
    for (const [dc, dr] of [[n, 0], [-n, 0], [n, ch === 'P' ? -1 : 1], [0, ch === 'P' ? -1 : 1]]) if (!blocksMove(c + dc, r + dr)) return cellCenter(c + dc, r + dr);
    return cellCenter(c, r);
  }
  function startMatch() {
    shots.clear();
    const [px, pz] = spawnAt('P', 0);
    player.reset(px, pz, Math.PI);
    if (ally) { const [x, z] = spawnAt('P', -1); ally.reset(x, z, Math.PI); }
    enemies.forEach((e, i) => { const [x, z] = spawnAt('E', [0, 1, -1][i] ?? 0); e.reset(x, z, 0); });
    for (const a of ais.values()) a.reset();
    for (const b of bonuses) { b.active = false; b.g.visible = false; b.item.userData.mat?.dispose(); }
    bonuses.forEach((b, i) => { b.t = i < 2 ? 7 : 12; });
    controls.reset();
    phase = online ? 'wait' : 'count'; countT = 3; over = false; matchT = 0; rewarded = false;
    if (online) { netIn = null; meAgain = foeAgain = false; net.send({ t: 'ready' }); if (foeReady) beginOnline(); }
    matchId = `arena-${Date.now()}-${Math.floor(Math.random() * 1e6)}`; // un identifiant par combat (anti double attribution)
    score.player = score.enemy = 0; scoredKills.clear(); renderScore();
    for (const f of fighters()) { f.respawnT = 0; f.shieldT = 0; f.life = 0; }
    $('.ar-respawn').hidden = true;
    $('.ar-end').hidden = true;
    controls.setHidden(false);
    ulti = ultiForStriker(playerDef.id);
    clearUltis();
    cloud.reset(); cloudWarned = false; $('.ar-cloudwarn').hidden = true;
    ultiBtn.hidden = !ulti;
    if (ulti) ultiRange.scale.setScalar(ulti.range);
    shockT = 1; shake = 0; finishFocus = null; slowT = 0; lastCount = '';
    for (const m of markers.values()) m.visible = false;
    camera.zoom = 1; camera.updateProjectionMatrix();
    root.classList.remove('lowhp', 'down', 'incloud');
    const rec = save.get().arenaRecord ?? { wins: 0, losses: 0 };
    buildUi();
    camTarget.set(px, 0, pz - 1);
    placeCamera(0);
  }

  /** Attaque : consomme une charge et lance la rafale de l'arme (burst tirs espacés de gap s). */
  function tryFire(f, angle) {
    if (!f.canFire()) { if (f === player && f.alive && !f.leap && f.ammo < 1) sfx('empty'); return false; }
    f.ammo -= 1; f.fireCd = f.gun.interval;
    f.burst = { left: f.gun.burst, t: 0, angle };
    runBurst(f, 0);
    return true;
  }
  function runBurst(f, dt) {
    const b = f.burst;
    if (!b) return;
    if (!f.alive || f.leap || over) { f.burst = null; return; }
    b.t -= dt;
    while (b.left > 0 && b.t <= 0) { shoot(f, b.angle); b.left--; b.t += f.gun.gap; }
    if (b.left <= 0) f.burst = null;
  }
  function shoot(f, angle) {
    f.aimFace = angle;
    f.face = angle; // le tir part dans la direction visée
    f.lastShotT = t; f.recoil = 1; f.flashT = 0.06;
    f.model.shoot?.(); // recul du bras et de l'épaule
    if (f.inBush) f.revealT = 1.2; // tirer depuis un buisson trahit sa position
    f.stats.shots += shots.fire(f, angle, f.muzzle());
    sfx(f === player ? `shot_${f.gunId}` : 'enemy_shot', 0.05);
    // le bruit du tir alerte les adversaires proches
    for (const o of foesOf(f)) ais.get(o)?.onNoise(f.x, f.z, t);
  }

  function onHit(target, dmg, x, z, shooter, { fromUlti = false } = {}) {
    // mission du passe « toucher avec l'ulti » : une fois par lancer (les zones touchent plusieurs fois)
    if (fromUlti && shooter === player && t - lastUltiTrack > 1.5) { lastUltiTrack = t; trackPass('ulti_hit'); }
    if (over || !target.alive) return;
    if (target.shieldT > 0) return;   // vient de réapparaître : protégé
    const d = Math.round(dmg * (0.9 + Math.random() * 0.2));
    // en ligne, la vie de l'ami est décidée par SON téléphone (reçue avec sa position) : ici, effet visuel seulement
    const remote = online && target === enemies[0];
    if (!remote) target.hp = Math.max(0, target.hp - d);
    target.lastHurtT = t;
    target.revealT = Math.max(target.revealT, 0.6);
    if (!fromUlti) shooter.stats.hits++; // la précision ne compte que les balles
    shooter.stats.dmg += d;
    const su = ultiOf(shooter);
    if (su && !fromUlti) shooter.ulti = Math.min(1, shooter.ulti + d / su.chargeDmg);
    target.hitFlash(target === player ? 0xff4060 : 0xffffff);
    if (target === player || shooter === player || shownToPlayer(target)) sfx(target === player ? 'hurt' : 'hit', 0.04);
    target.model.play('hit');
    ais.get(target)?.onHurt(shooter.x, shooter.z, t);
    if (target === player) {
      navigator.vibrate?.(25); root.classList.remove('hurt'); void root.offsetWidth; root.classList.add('hurt');
      // direction du tireur (flèche rouge autour du centre de l'écran)
      const [ax, ay] = project(player.x, 1, player.z), [bx, by] = project(shooter.x, 1, shooter.z);
      ui.dmgdir.style.setProperty('--a', `${Math.atan2(by - ay, bx - ax) + Math.PI / 2}rad`);
      ui.dmgdir.classList.remove('show'); void ui.dmgdir.offsetWidth; ui.dmgdir.classList.add('show');
    }
    if (!remote && target.hp <= 0) eliminate(target, shooter, fromUlti);
  }

  function eliminate(target, killer, fromUlti, byCloud = false) {
    // une même vie ne rapporte qu'un point, quel que soit le nombre de coups qui l'achèvent
    const key = `${target.name}#${target.team}#${target.life}`;
    if (scoredKills.has(key)) return;
    scoredKills.add(key);
    if (online && target === player) net.send({ t: 'died', life: player.life, ulti: fromUlti });
    target.kill();
    if (target.leap) { target.leap = null; target.y = 0; }
    markers.get(target) && (markers.get(target).visible = false);
    shots.spark(target.x, target.z, target.team === 'player' ? 0x5cffc4 : 0xff3d7f, 18, 0.6);
    sfx('ko');
    if (!byCloud) killer.stats.kills++;   // tué par le nuage : le point va quand même à l'équipe adverse
    if (killer === player && !byCloud) { trackPass('kill'); if (player.inBush && !fromUlti) trackPass('bush_kill'); }
    // point pour l'équipe du tireur, mis à jour tout de suite
    const side = killer.team === 'player' ? 'player' : 'enemy';
    score[side]++;
    renderScore(side);
    if (score[side] >= killTarget) return end(side === 'player', target);
    // pas encore de vainqueur : le combattant éliminé réapparaîtra dans son camp
    target.respawnT = RESPAWN;
    if (target === player) {
      controls.setHidden(true); ultiBtn.hidden = true; ultiRange.visible = false; aimLine.visible = false;
      root.classList.add('down');
    }
  }
  /** Réapparition dans son camp (à l'écart des adversaires), vie et charges pleines, ulti conservé. */
  function respawn(f) {
    const ch = f.team === 'player' ? 'P' : 'E';
    const mates = teamOf(f);
    const [x, z] = safeSpot(...spawnAt(ch, [0, -1, 1][mates.indexOf(f)] ?? 0));
    f.respawn(x, z, ch === 'P' ? Math.PI : 0);
    f.shieldT = SPAWN_SHIELD;
    f.life++;
    ais.get(f)?.reset();
    burst(x, z, f.team === 'player' ? 0x5cffc4 : 0xff3d7f, 14);
    if (f === player) {
      controls.setHidden(false); ultiBtn.hidden = !ulti; root.classList.remove('down');
      $('.ar-respawn').hidden = true;
      sfx('go');
    }
  }
  function updateRespawns(dt) {
    for (const f of fighters()) {
      f.shieldT = Math.max(0, (f.shieldT ?? 0) - dt);
      if (f.alive || !(f.respawnT > 0)) continue;
      f.respawnT -= dt;
      if (f === player) {
        const el = $('.ar-respawn');
        el.hidden = false;
        const n = String(Math.max(1, Math.ceil(f.respawnT)));
        if (el.dataset.n !== n) { el.dataset.n = n; el.innerHTML = `<b>${n}</b>`; }   // compte à rebours seul
      }
      if (f.respawnT <= 0) respawn(f);
    }
  }
  /**
   * Score affiché (haut de l'écran) : uniquement celui du joueur (de son équipe en Duo) et l'objectif.
   * Le score de l'adversaire n'est jamais affiché pendant le combat ; il reste compté dans `score` pour les règles.
   * `pop` : l'équipe du joueur vient de marquer.
   */
  function renderScore(pop = null) {
    const mine = score.player;
    const el = $('.ar-score');
    el.classList.toggle('duo', format.size > 1);
    el.innerHTML = `
      <span class="as-mine ${pop === 'player' ? 'pop' : ''}"><b data-score="player">${mine}</b><small>/${killTarget}</small></span>
      <span class="as-pips">${Array.from({ length: killTarget }, (_, i) => `<i class="${i < mine ? 'on' : ''}"></i>`).join('')}</span>`;
  }


  // ULTI « Bond fracassant » (tous les combattants) : saut par-dessus les obstacles, dégâts à l'atterrissage
  const ultiOf = (f) => ultiForStriker(f.def.id);
  /** Adversaire visible le plus proche à portée d'ulti (ou null). */
  function ultiTarget(f = player) {
    const u = ultiOf(f);
    if (!u || !f.alive) return null;
    let best = null, bd = Infinity;
    for (const o of foesOf(f)) {
      if (!o.alive) continue;
      const d = Math.hypot(o.x - f.x, o.z - f.z);
      const visible = f === player ? shownToPlayer(o) : canSee(f, o);
      if (visible && d <= u.range && d < bd) { bd = d; best = o; }
    }
    return best;
  }
  /** Direction / point visés par l'ulti : l'adversaire visible le plus proche à portée, sinon devant soi. */
  function ultiAim(f, u) {
    const o = ultiTarget(f);
    if (o) return { o, ang: Math.atan2(o.x - f.x, o.z - f.z), x: o.x, z: o.z };
    const ang = f.face, d = (u.range ?? 5) * 0.6;
    const [x, z] = collide(f.x + Math.sin(ang) * d, f.z + Math.cos(ang) * d, 0.2);
    return { o: null, ang, x, z };
  }
  // --- ulti en cours : zones (feu, vortex), salves, ondes de choc ---
  const zones = [];
  function telegraph(f, x, z, r) {
    if (f.team !== 'enemy') return;
    const m = markerFor(f); m.visible = true; m.position.set(x, 0.05, z); m.scale.setScalar(r);
  }
  function clearUltis() {
    for (const z of zones) { scene.remove(z.g); z.g.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); }
    zones.length = 0;
    for (const f of fighters()) { f.salvo = null; f.slam = null; }
  }
  /**
   * Lance l'ulti du Striker `f` (chacun a le sien : data/ultis.js). `aim` = { ang, dist } choisis par le joueur avec
   * le joystick d'ulti : direction de lancement et, pour les ultis posés au sol (bond, zone, vortex), distance.
   * Sans `aim` (IA, appui bref) : l'adversaire visible le plus proche à portée. Renvoie true si l'ulti est parti.
   */
  function tryUlti(f = player, aim = null) {
    const u = ultiOf(f);
    if (!u || f.ulti < 1 || f.leap || f.salvo || f.slam || !f.alive || over || f.stunT > 0) return false;
    let A;
    if (aim) {
      const d = Math.max(1, Math.min(u.range, aim.dist ?? u.range));
      const [x, z] = collide(f.x + Math.sin(aim.ang) * d, f.z + Math.cos(aim.ang) * d, u.kind === 'leap' ? RADIUS : 0.2);
      A = { o: null, ang: aim.ang, x, z };
    } else {
      const o = ultiTarget(f);
      // l'IA ne lance son ulti que sur une cible ; un bond sans direction ni cible n'a pas de sens
      if (!o && (f !== player || u.kind === 'leap')) return false;
      A = ultiAim(f, u);
      if (o && u.kind === 'leap') {
        // bond sur une cible : on atterrit juste devant elle
        const dd = Math.hypot(o.x - f.x, o.z - f.z), back = Math.min(0.55, dd * 0.5);
        [A.x, A.z] = collide(o.x - Math.sin(A.ang) * back, o.z - Math.cos(A.ang) * back, RADIUS);
      }
    }
    if (u.kind === 'leap') {
      f.leap = { t: 0, dur: u.leapTime, sx: f.x, sz: f.z, tx: A.x, tz: A.z, u };
      f.ulti = 0; f.vx = f.vz = 0;
      f.aimFace = f.face = A.ang;
      f.revealT = 1.5;
      f.model.play('jump');
      sfx('leap');
      if (f.team === 'enemy') { const m = markerFor(f); m.visible = true; m.position.set(A.x, 0.05, A.z); m.scale.setScalar(u.radius); }
      else if (f === player) navigator.vibrate?.(30);
      return true;
    }
    f.ulti = 0; f.revealT = 1.5; f.aimFace = f.face = A.ang; f.vx = f.vz = 0;
    if (f === player) navigator.vibrate?.(30);
    if (u.kind === 'salvo') {
      f.salvo = { left: u.waves, t: 0, ang: A.ang, u };
    } else if (u.kind === 'pierce') {
      shots.fire(f, A.ang, f.muzzle(), { gun: { dmg: u.dmg, pellets: 1, spread: 0, speed: u.speed, range: u.range, color: 0xd9a6ff, size: u.size }, pierce: true, fromUlti: true });
      f.model.shoot?.(); f.recoil = 1; f.flashT = 0.12; shake = Math.max(shake, 0.5);
      sfx('shot_ombre');
      for (const o of foesOf(f)) ais.get(o)?.onNoise(f.x, f.z, t);
    } else if (u.kind === 'slam') {
      f.slam = { t: 0.32, u };
      f.model.play('jump');
      telegraph(f, f.x, f.z, u.radius);
    } else {
      // zone de feu ou vortex : lancé sur le point visé, actif après un court vol
      const g = new THREE.Group();
      g.position.set(A.x, 0.05, A.z);
      scene.add(g);
      zones.push({ kind: u.kind, u, owner: f, x: A.x, z: A.z, t: -0.35, tick: 0, g, started: false, tracked: false });
      telegraph(f, A.x, A.z, u.radius);
      f.model.shoot?.(); f.recoil = 1;
      sfx(u.kind === 'vortex' ? 'shot_neant' : 'shot_brasier');
    }
    return true;
  }
  function updateLeap(f, dt) {
    const L = f.leap;
    if (!L) return;
    L.t += dt;
    const p = Math.min(1, L.t / L.dur), e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
    f.x = L.sx + (L.tx - L.sx) * e; f.z = L.sz + (L.tz - L.sz) * e;
    f.y = Math.sin(p * Math.PI) * L.u.height;
    f.moving = false;
    if (markers.get(f)?.visible) markers.get(f).material.opacity = 0.4 + 0.4 * Math.abs(Math.sin(L.t * 14));
    if (p < 1) return;
    // atterrissage : onde de choc, poussière, dégâts et recul pour les adversaires dans la zone
    f.leap = null; f.y = 0;
    if (markers.get(f)) markers.get(f).visible = false;
    shock.position.x = f.x; shock.position.z = f.z; shockT = 0; shock.userData.r = L.u.radius;
    shock.material.color.set(f.team === 'player' ? 0xffd27a : 0xff7aa6);
    shake = 0.9;
    sfx('land');
    shots.spark(f.x, f.z, f.team === 'player' ? 0xffd27a : 0xff7aa6, 16, 0.55);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; spawnFx('dust', f.x, 0.25, f.z, { vx: Math.cos(a) * 3, vz: Math.sin(a) * 3, size: 0.6, grow: 2, life: 0.6 }); }
    if (f === player) navigator.vibrate?.([20, 30, 50]);
    let hitAny = false;
    for (const o of foesOf(f)) {
      const d = Math.hypot(o.x - f.x, o.z - f.z);
      if (!o.alive || d > L.u.radius) continue;
      hitAny = true;
      onHit(o, L.u.dmg * f.dmgMult, o.x, o.z, f, { fromUlti: true });
      if (o.alive && !isRemote(o)) { const k = 1.3 / (d || 1); [o.x, o.z] = collide(o.x + (o.x - f.x) * k, o.z + (o.z - f.z) * k, RADIUS); }
    }
  }  /** Ultis en cours : salves, ondes de choc, zones de feu et vortex. */
  function updateUltis(dt) {
    for (const f of fighters()) {
      if (f.salvo) {
        const S = f.salvo;
        if (!f.alive || over) { f.salvo = null; continue; }
        S.t -= dt;
        if (S.t <= 0) {
          const u = S.u;
          f.face = f.aimFace = S.ang;
          shots.fire(f, S.ang, f.muzzle(), { gun: { dmg: u.dmg, pellets: u.pellets, spread: u.spread, speed: u.speed, range: u.range, color: 0x8ffff0, size: u.size }, fromUlti: true });
          f.model.shoot?.(); f.recoil = 1; f.flashT = 0.06;
          sfx('shot_rafale', 0.02);
          S.left--; S.t = u.gap;
          if (!S.left) f.salvo = null;
        }
      }
      if (f.slam) {
        const W = f.slam;
        if (!f.alive || over) { f.slam = null; continue; }
        W.t -= dt;
        if (W.t > 0) continue;
        f.slam = null;
        const u = W.u;
        if (markers.get(f)) markers.get(f).visible = false;
        shock.position.x = f.x; shock.position.z = f.z; shockT = 0; shock.userData.r = u.radius;
        shock.material.color.set(f.team === 'player' ? 0xffc27a : 0xff7aa6);
        shake = 1.1; sfx('land');
        for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; spawnFx('dust', f.x + Math.cos(a) * 0.5, 0.25, f.z + Math.sin(a) * 0.5, { vx: Math.cos(a) * 5, vz: Math.sin(a) * 5, size: 0.7, grow: 2.2, life: 0.7, color: 0xc8a070 }); }
        if (f === player) navigator.vibrate?.([30, 30, 60]);
        let hitAny = false;
        for (const o of foesOf(f)) {
          const d = Math.hypot(o.x - f.x, o.z - f.z);
          if (!o.alive || d > u.radius) continue;
          hitAny = true;
          onHit(o, u.dmg * f.dmgMult, o.x, o.z, f, { fromUlti: true });
          if (!o.alive || isRemote(o)) continue;
          const k = 1.6 / (d || 1);
          [o.x, o.z] = collide(o.x + (o.x - f.x) * k, o.z + (o.z - f.z) * k, RADIUS);
          o.stunT = u.stun; o.burst = null;
        }
          }
    }
    for (let i = zones.length - 1; i >= 0; i--) {
      const Z = zones[i], u = Z.u, f = Z.owner;
      Z.t += dt;
      if (Z.t < 0) continue;                                      // encore en vol
      if (!Z.started) {
        Z.started = true;
        if (markers.get(f)) markers.get(f).visible = false;
        const col = Z.kind === 'vortex' ? 0xff3dc8 : 0xff7a1a;
        const disc = new THREE.Mesh(new THREE.CircleGeometry(u.radius, 48), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }));
        disc.rotation.x = -Math.PI / 2;
        const rim = new THREE.Mesh(new THREE.RingGeometry(u.radius * 0.93, u.radius, 64), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, depthWrite: false }));
        rim.rotation.x = -Math.PI / 2; rim.position.y = 0.005;
        Z.g.add(disc, rim);
        if (Z.kind === 'vortex') {
          // spirale du vortex et cœur sombre
          for (let k = 0; k < 3; k++) {
            const arm = new THREE.Mesh(new THREE.RingGeometry(u.radius * (0.35 + k * 0.2), u.radius * (0.42 + k * 0.2), 40, 1, k * 2.1, 2.4), new THREE.MeshBasicMaterial({ color: 0xffb0ec, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
            arm.rotation.x = -Math.PI / 2; arm.position.y = 0.01 + k * 0.002; Z.g.add(arm);
          }
          const core = new THREE.Mesh(new THREE.CircleGeometry(u.radius * 0.28, 32), new THREE.MeshBasicMaterial({ color: 0x14001a, transparent: true, opacity: 0.85, depthWrite: false }));
          core.rotation.x = -Math.PI / 2; core.position.y = 0.02; Z.g.add(core);
        }
        shots.spark(Z.x, Z.z, col, 14, 0.5);
        sfx(Z.kind === 'vortex' ? 'enemy_shot' : 'land');
      }
      const dur = u.duration;
      // effets visuels
      Z.g.children[0].material.opacity = 0.22 + 0.12 * Math.sin(Z.t * 12);
      if (Z.kind === 'vortex') Z.g.rotation.y += dt * 4.5;
      if (Math.random() < dt * (Z.kind === 'vortex' ? 20 : 34)) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * u.radius;
        if (Z.kind === 'vortex') spawnFx('dust', Z.x + Math.cos(a) * u.radius, 0.3, Z.z + Math.sin(a) * u.radius, { vx: -Math.cos(a) * 3, vz: -Math.sin(a) * 3, size: 0.3, grow: 0.4, life: 0.6, color: 0xff6ad8 });
        else spawnFx('dust', Z.x + Math.cos(a) * r, 0.15, Z.z + Math.sin(a) * r, { vy: 2.2, size: 0.45, grow: 0.6, life: 0.55, color: Math.random() < 0.5 ? 0xff8a2a : 0xffc23d });
      }
      // dégâts réguliers (et aspiration pour le vortex)
      Z.tick -= dt;
      for (const o of foesOf(f)) {
        if (!o.alive) continue;
        const dx = Z.x - o.x, dz = Z.z - o.z, d = Math.hypot(dx, dz);
        if (d > u.radius) continue;
        if (Z.kind === 'vortex' && d > 0.3 && !o.leap && !isRemote(o)) [o.x, o.z] = collide(o.x + (dx / d) * u.pull * dt, o.z + (dz / d) * u.pull * dt, RADIUS);
        if (Z.tick <= 0) onHit(o, u.dps * 0.25 * f.dmgMult, o.x, o.z, f, { fromUlti: true });
      }
      if (Z.tick <= 0) Z.tick = 0.25;
      if (Z.t >= dur) {
        if (Z.kind === 'vortex') {
          // explosion finale
          shock.position.x = Z.x; shock.position.z = Z.z; shockT = 0; shock.userData.r = u.blastRadius;
          shock.material.color.set(0xff3dc8); shake = Math.max(shake, 0.9); sfx('land');
          shots.spark(Z.x, Z.z, 0xff6ad8, 22, 0.7);
          for (const o of foesOf(f)) if (o.alive && Math.hypot(o.x - Z.x, o.z - Z.z) <= u.blastRadius) onHit(o, u.blast * f.dmgMult, o.x, o.z, f, { fromUlti: true });
        }
        scene.remove(Z.g); Z.g.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
        zones.splice(i, 1);
      }
    }
  }


  function end(victory, lastDown) {
    if (over) return;
    over = true; phase = 'end';
    controls.setHidden(true);   // plus de joysticks ni de bouton ULTI une fois la partie finie
    ultiBtn.hidden = true; ultiRange.visible = false; aimLine.visible = false;
    $('.ar-respawn').hidden = true;
    root.classList.remove('down', 'incloud');
    $('.ar-cloudwarn').hidden = true;
    for (const f of fighters()) if (f.leap) { f.leap = null; f.y = 0; }
    for (const m of markers.values()) m.visible = false;
    finishFocus = { x: lastDown.x, z: lastDown.z }; slowT = 1.1;
    setTimeout(() => sfx(victory ? 'victory' : 'defeat'), 900);
    if (online) { rewarded = true; setTimeout(() => running && showOnlineEnd(victory), 1300); return; }
    // récompenses (une seule fois par partie)
    let reward = null, passGain = null, tr = null, rk = null;
    if (!rewarded) {
      rewarded = true;
      passGain = addPassXp(victory ? PASS_XP.arenaWin : PASS_XP.arenaLoss);
      trackPass('arena_play'); if (victory) trackPass('arena_win');
      trackPass('damage', player.stats.dmg);
      reward = victory ? ARENA_REWARDS.win : ARENA_REWARDS.loss;
      grantRewards(reward);
      // trophées du Striker joué (ils fixent son palier) : une seule fois par partie
      tr = applyBattleTrophies(matchId, victory ? 'win' : 'loss', playerDef.id);
      // classement compétitif du joueur (Ruine → Zénith) : points de classement, distincts des trophées du Striker
      rk = applyRankedResult(matchId, victory ? 'win' : 'loss');
      save.update((s) => ({ arenaRecord: { wins: (s.arenaRecord?.wins ?? 0) + (victory ? 1 : 0), losses: (s.arenaRecord?.losses ?? 0) + (victory ? 0 : 1) } }));
    }
    const rec = save.get().arenaRecord;
    const acc = player.stats.shots ? Math.round((player.stats.hits / player.stats.shots) * 100) : 0;
    const duo = format.size > 1;
    const winner = duo ? (victory ? 'L’ÉQUIPE BLEUE GAGNE' : 'L’ÉQUIPE ROUGE GAGNE') : victory ? `${player.name} GAGNE` : `${enemies[0].name} GAGNE`;
    const pk = player.stats.kills;
    setTimeout(() => {
      const el = $('.ar-end');
      el.className = `ar-end ${victory ? 'win' : 'lose'}`;
      el.innerHTML = `
        <div class="ar-end-box">
          <p class="ar-end-map">${format.name.toUpperCase()} · ${format.short.toUpperCase()} · ${killTarget} ÉLIMINATIONS</p>
          <h2>${victory ? 'VICTOIRE !' : 'DÉFAITE'}</h2>
          <p class="ar-end-winner">${winner}</p>
          <div class="ar-end-score"><span class="me"><small>${duo ? 'Bleus' : 'Toi'}</small><b>${score.player}</b></span><i>–</i><span class="foe"><small>${duo ? 'Rouges' : enemies[0].name}</small><b>${score.enemy}</b></span></div>
          <div class="ar-stats">
            <div><b>${Math.floor(matchT / 60)}:${String(Math.floor(matchT % 60)).padStart(2, '0')}</b><small>Durée</small></div>
            <div><b>${player.stats.dmg}</b><small>Dégâts infligés</small></div>
            <div><b>${pk}</b><small>${duo ? 'Tes élim.' : `Élimination${pk > 1 ? 's' : ''}`}</small></div>
            <div><b>${acc} %</b><small>Précision</small></div>
          </div>
          ${reward ? `<div class="r-rewards"><div class="r-rw"><span class="cur-icon">${ICONS.coin}</span><b>+${reward.coins}</b></div>${reward.gems ? `<div class="r-rw"><span class="cur-icon">${ICONS.gem}</span><b>+${reward.gems}</b></div>` : ''}</div>` : ''}
          ${rk ? rankedResultHtml(rk) : ''}
          ${tr ? trophyResultHtml(tr, player.name) : ''}
          ${passGain?.gained ? `<div class="r-pass">${ICONS.ulti}<b>+${passGain.gained} XP de passe</b>${passGain.after > passGain.before ? `<small>Palier ${passGain.after} atteint !</small>` : ''}</div>` : ''}
          <p class="ar-end-rec">Arène : ${rec.wins} victoire${rec.wins > 1 ? 's' : ''} · ${rec.losses} défaite${rec.losses > 1 ? 's' : ''}</p>
          <div class="r-btns">
            <button class="r-btn ghost" data-end="quit">QUITTER</button>
            <button class="r-btn" data-end="again">REJOUER</button>
          </div>
        </div>`;
      el.hidden = false;
      el.querySelector('[data-end="quit"]').addEventListener('click', close);
      el.querySelector('[data-end="again"]').addEventListener('click', () => { makeTeams(); startMatch(); });
    }, 1300);
  }

  /** Un combattant est-il visible pour l'équipe du joueur ? (adversaire caché = invisible sauf de près) */
  function shownToPlayer(f) {
    if (f.team === 'player' || !f.alive) return true;
    if (!f.hidden) return true;
    return [player, ally].some((m) => m?.alive && Math.hypot(m.x - f.x, m.z - f.z) < BUSH_SEE);
  }

  // --- Nuage noir ---
  let cloudWarned = false;
  /** Case libre la plus proche de (x, z) à l'intérieur de la zone sûre (réapparition hors du nuage). */
  function safeSpot(x, z) {
    const [hx, hz] = cloud.half;
    if (!cloud.active || cloud.dist(x, z) < -1.2) return [x, z];
    const tx = THREE.MathUtils.clamp(x, -hx + 1.6, hx - 1.6), tz = THREE.MathUtils.clamp(z, -hz + 1.6, hz - 1.6);
    const [c0, r0] = toCell(tx, tz);
    for (let d = 0; d < 6; d++) for (let dr = -d; dr <= d; dr++) for (let dc = -d; dc <= d; dc++) {
      if (Math.max(Math.abs(dc), Math.abs(dr)) !== d || blocksMove(c0 + dc, r0 + dr)) continue;
      const [cx, cz] = cellCenter(c0 + dc, r0 + dr);
      if (cloud.dist(cx, cz) < -0.8) return [cx, cz];
    }
    return [tx, tz];
  }
  function updateCloud(dt) {
    cloud.update(matchT, t, dt);
    if (!player.alive) root.classList.remove('incloud');
    // annonce quelques secondes avant l'arrivée du nuage
    const warn = matchT >= CLOUD.start - CLOUD.warn && matchT < CLOUD.start + 2.5;
    const w = $('.ar-cloudwarn');
    if (warn !== !w.hidden) { w.hidden = !warn; if (warn && !cloudWarned) { cloudWarned = true; sfx('count'); navigator.vibrate?.([20, 40, 20]); } }
    for (const f of fighters()) {
      if (!f.alive || isRemote(f)) continue;   // en ligne, le téléphone de l'ami gère sa propre vie
      const inside = !f.leap && cloud.dist(f.x, f.z) > 0;
      if (f === player) root.classList.toggle('incloud', inside);
      if (!inside) { f.cloudT = 0; continue; }
      f.cloudT = (f.cloudT ?? 0) - dt;
      if (f.cloudT > 0) continue;
      f.cloudT = CLOUD.tick;
      if (f.shieldT > 0) continue;
      const d = Math.round(f.maxHp * CLOUD.dmg);
      f.hp = Math.max(0, f.hp - d);
      f.lastHurtT = t;
      f.hitFlash(0x9a5cff);
      if (f === player) { sfx('hurt', 0.04); navigator.vibrate?.(15); }
      if (f.hp <= 0) {
        const foes = foesOf(f);
        eliminate(f, foes.find((o) => o.alive) ?? foes[0], false, true);
      }
    }
  }

  // --- Combat amical en ligne ---
  // Le monde de l'ami est le nôtre retourné de 180° (arène symétrique centrée sur l'origine) :
  // (x, z) -> (-x, -z) et angle -> angle + π, dans les deux sens.
  const net = online?.room ?? { send() {} };
  const isRemote = (f) => !!online && f === enemies[0];
  let netIn = null, sendT = 0, foeReady = false, meAgain = false, foeAgain = false, foeLeft = false;
  const r2 = (v) => Math.round(v * 100) / 100;
  function beginOnline() {
    if (phase !== 'wait') return;
    foeReady = false;
    phase = 'count'; countT = 3; ui.count.innerHTML = '';
  }
  function sendState(dt) {
    if ((sendT -= dt) > 0) return;
    sendT = 1 / 15;
    const p = player;
    net.send({ t: 's', x: r2(p.x), z: r2(p.z), f: r2(p.face), a: r2(p.aimFace), ai: p.aiming ? 1 : 0, vx: r2(p.vx), vz: r2(p.vz), hp: Math.round(p.hp), al: p.alive ? 1 : 0, l: p.life });
  }
  /** Tir du joueur : partout pareil, plus l'annonce à l'ami (direction et position de départ). */
  function fireNet(a) {
    if (tryFire(player, a) && online) net.send({ t: 'fire', a: r2(a), x: r2(player.x), z: r2(player.z) });
  }
  function ultiNet(aim = null) {
    if (!tryUlti(player, aim) || !online) return;
    // on envoie le point réellement visé (bond, zone) ou la direction (salve, rayon, séisme)
    const zn = zones[zones.length - 1];
    const tgt = player.leap ? [player.leap.tx, player.leap.tz] : zn?.owner === player && zn.t < 0 ? [zn.x, zn.z] : null;
    const ang = player.face;
    net.send({ t: 'ulti', a: r2(ang), d: tgt ? r2(Math.hypot(tgt[0] - player.x, tgt[1] - player.z)) : null, x: r2(player.x), z: r2(player.z) });
  }
  /** Déplacement de l'ami : glisse vers la dernière position reçue (téléportée si l'écart est trop grand). */
  function runRemote(f, dt) {
    if (f.leap) { updateLeap(f, dt); return; }
    const s = netIn;
    if (!s) { f.moving = false; f.vx = f.vz = 0; return; }
    const tx = -s.x, tz = -s.z;
    const dx = tx - f.x, dz = tz - f.z;
    if (Math.hypot(dx, dz) > 3) { f.x = tx; f.z = tz; }
    else { const k = 1 - Math.exp(-dt * 14); f.x += dx * k; f.z += dz * k; }
    f.vx = -s.vx; f.vz = -s.vz;
    f.moving = Math.hypot(s.vx, s.vz) > 0.4;
    f.aiming = !!s.ai;
    f.aimFace = s.a + Math.PI;
    if (!f.aiming && !f.moving) f.aimFace = s.f + Math.PI;
    if (s.al && s.l === f.life) f.hp = Math.max(1, Math.min(f.maxHp, s.hp));
  }
  /** Place l'ami à la position du message (tir, ulti) pour que le coup parte du bon endroit. */
  const snap = (f, m) => { if (Math.hypot(-m.x - f.x, -m.z - f.z) < 3) { f.x = -m.x; f.z = -m.z; } };
  function onNet(m) {
    if (!m || !running) return;
    const foe = enemies[0];
    switch (m.t) {
      case 's': netIn = m; break;
      case 'ready': foeReady = true; beginOnline(); break;
      case 'fire':
        if (!playing() || over || !foe.alive) break;
        snap(foe, m);
        foe.ammo = Math.max(foe.ammo, 1); foe.fireCd = 0; foe.burst = null; foe.stunT = 0;
        tryFire(foe, m.a + Math.PI);
        break;
      case 'ulti':
        if (!playing() || over || !foe.alive) break;
        snap(foe, m);
        foe.ulti = 1; foe.leap = foe.salvo = foe.slam = null; foe.stunT = 0;
        tryUlti(foe, { ang: m.a + Math.PI, dist: m.d ?? undefined });
        break;
      case 'died':
        // l'ami annonce qu'il est éliminé (c'est son téléphone qui décide de ses dégâts) : point pour nous
        if (foe.alive && !over) { foe.hp = 0; eliminate(foe, player, !!m.ulti); }
        break;
      case 'again': foeAgain = true; tryAgain(); break;
      case 'bye': friendLeft(); break;
    }
  }
  function tryAgain() {
    const btn = $('[data-end="again"]');
    if (btn) btn.classList.toggle('foe-ok', foeAgain);
    const w = $('.ar-end-wait');
    if (w) w.textContent = meAgain ? (foeAgain ? '' : 'En attente de ton ami…') : foeAgain ? 'Ton ami veut une revanche !' : '';
    if (meAgain && foeAgain && !foeLeft) { makeTeams(); startMatch(); }
  }
  function friendLeft() {
    if (foeLeft || !running) return;
    foeLeft = true;
    if (!over) {
      // fin du combat : l'ami est parti (aucune récompense, combat amical)
      over = true; phase = 'end';
      controls.setHidden(true); ultiBtn.hidden = true; ultiRange.visible = false; aimLine.visible = false;
      $('.ar-respawn').hidden = true; root.classList.remove('down');
      showOnlineEnd(null);
    } else {
      const b = $('[data-end="again"]'); if (b) b.disabled = true;
      const w = $('.ar-end-wait'); if (w) w.textContent = 'Ton ami a quitté le combat.';
    }
  }
  if (online) { online.room.onMessage(onNet); online.room.onClose(friendLeft); }
  /** Écran de fin du combat amical : score, statistiques, REVANCHE (quand les deux le veulent) ou QUITTER. */
  function showOnlineEnd(victory) {
    const el = $('.ar-end');
    const foe = enemies[0];
    const acc = player.stats.shots ? Math.round((player.stats.hits / player.stats.shots) * 100) : 0;
    el.className = `ar-end ${victory === false ? 'lose' : 'win'} friendly`;
    el.innerHTML = `
      <div class="ar-end-box">
        <p class="ar-end-map">COMBAT AMICAL · ${killTarget} ÉLIMINATIONS</p>
        <h2>${victory === null ? 'FIN' : victory ? 'VICTOIRE !' : 'DÉFAITE'}</h2>
        <p class="ar-end-winner">${victory === null ? 'Ton ami a quitté le combat' : victory ? `${save.get().playerName} GAGNE` : `${foe.name} GAGNE`}</p>
        <div class="ar-end-score"><span class="me"><small>Toi</small><b>${score.player}</b></span><i>–</i><span class="foe"><small>${foe.name}</small><b>${score.enemy}</b></span></div>
        <div class="ar-stats">
          <div><b>${Math.floor(matchT / 60)}:${String(Math.floor(matchT % 60)).padStart(2, '0')}</b><small>Durée</small></div>
          <div><b>${player.stats.dmg}</b><small>Dégâts infligés</small></div>
          <div><b>${player.stats.kills}</b><small>Élimination${player.stats.kills > 1 ? 's' : ''}</small></div>
          <div><b>${acc} %</b><small>Précision</small></div>
        </div>
        <p class="ar-end-rec">Combat amical : pas de trophées ni de récompenses.</p>
        <p class="ar-end-wait" aria-live="polite">${foeLeft ? 'Ton ami a quitté le combat.' : ''}</p>
        <div class="r-btns">
          <button class="r-btn ghost" data-end="quit">QUITTER</button>
          <button class="r-btn" data-end="again" ${foeLeft ? 'disabled' : ''}>REVANCHE</button>
        </div>
      </div>`;
    el.hidden = false;
    el.querySelector('[data-end="quit"]').addEventListener('click', close);
    el.querySelector('[data-end="again"]').addEventListener('click', (e) => {
      if (meAgain || foeLeft) return;
      meAgain = true; e.currentTarget.classList.add('sent'); net.send({ t: 'again' }); tryAgain();
    });
    tryAgain();
  }

  // --- Boucle ---
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.85), hitP = new THREE.Vector3();
  let running = true, last = performance.now(), fleeArmed = 0, aiEnabled = true;
  // résolution adaptative : baisse la définition si les images ralentissent, la remonte quand ça va mieux
  const basePR = renderer.getPixelRatio();
  const maxPR = Math.min(devicePixelRatio || 1, 2);
  let pr = Math.min(maxPR, renderer.userData.isMobile ? 1.75 : 2), frameAvg = 1 / 60, prT = 0;
  renderer.setPixelRatio(pr);
  function adaptResolution(rdt) {
    frameAvg += (rdt - frameAvg) * 0.05;
    if ((prT += rdt) < 2) return;
    prT = 0;
    let next = pr;
    if (frameAvg > 1 / 45 && pr > 1) next = Math.max(1, pr - 0.25);
    else if (frameAvg < 1 / 57 && pr < maxPR) next = Math.min(maxPR, pr + 0.25);
    if (next !== pr) { pr = next; renderer.setPixelRatio(pr); resize(); }
  }
  function runAI(f, dt) {
    if (f.leap) { updateLeap(f, dt); return; }
    const a = ais.get(f);
    const dec = aiEnabled && a ? a.update(t, dt) : { mx: 0, mz: 0, aim: null, fire: false, reload: false };
    // nuage tout proche : l'IA rentre vers le centre de l'arène
    const cd = cloud.dist(f.x, f.z);
    if (aiEnabled && cd > -1.4) { const l = Math.hypot(f.x, f.z) || 1; dec.mx = -f.x / l; dec.mz = -f.z / l; }
    f.move(dec.mx, dec.mz, dt);
    if (dec.aim !== null) { f.aiming = true; f.aimFace = dec.aim; } else f.aiming = false;
    if (dec.fire && dec.aim !== null) tryFire(f, dec.aim);
    // ulti de l'IA : quand il est chargé et qu'un adversaire est visible à bonne distance
    const u = ultiOf(f);
    f.ulti = Math.min(1, f.ulti + u.chargePerSec * dt);
    if (aiEnabled && f.ulti >= 1 && f.stunT <= 0) {
      // chaque ulti a sa bonne distance : bond pas trop près, séisme au contact, le reste à portée
      const o = ultiTarget(f), d = o ? Math.hypot(o.x - f.x, o.z - f.z) : Infinity;
      const good = o && (u.kind === 'leap' ? d > 2.2 : u.kind === 'slam' ? d < u.radius * 0.8 : true);
      if (good && Math.random() < dt * 0.9) tryUlti(f);
    }
  }
  function frame(now) {
    if (!running) return;
    const realDt = Math.max(0, Math.min((now - last) / 1000, 0.05));
    last = now;
    // ralenti à l'élimination finale
    if (slowT > 0) slowT -= realDt;
    const dt = realDt * (slowT > 0 ? 0.3 : 1);
    t += dt;
    adaptResolution(realDt);
    const input = controls.read();

    if (phase === 'wait' && !ui.count.querySelector('.ar-wait')) ui.count.innerHTML = '<small class="ar-wait">En attente de ton ami…</small>';
    if (phase === 'count') {
      countT -= dt;
      const c = ui.count;
      const label = countT > 0 ? String(Math.ceil(countT)) : 'GO !';
      if (c.textContent !== label) { c.textContent = label; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }
      if (label !== lastCount) { lastCount = label; sfx(label === 'GO !' ? 'go' : 'count'); }
      if (countT <= -0.5) { phase = 'play'; c.textContent = ''; }
    }
    if (playing() && !over) {
      matchT += dt;
      updateRespawns(dt);
      // joueur : déplacement (repère écran -> monde : haut de l'écran = -z) et visée
      if (player.alive) {
        if (player.leap) updateLeap(player, dt); else player.move(input.mx, input.my, dt);
        const wasReady = player.ulti >= 1;
        if (ulti && !player.leap) player.ulti = Math.min(1, player.ulti + ulti.chargePerSec * dt);
        if (ulti && !wasReady && player.ulti >= 1) sfx('ulti_ready');
        // ulti : part au relâchement de son joystick, dans la direction (et à la distance) visée
        if (input.ulti && ulti) {
          const q = input.ulti;
          if (q.tap) ultiNet();                             // appui bref : vers l'ennemi visible le plus proche
          else if (q.pointer) {                             // clavier (E) : vers la souris
            const P = input.pointer && groundAt(input.pointer);
            if (P) ultiNet({ ang: Math.atan2(P.x - player.x, P.z - player.z), dist: Math.hypot(P.x - player.x, P.z - player.z) });
            else ultiNet();
          } else ultiNet({ ang: Math.atan2(q.x, q.y), dist: ultiDist(ulti, q.mag) });
        }
        let aimAngle = null;
        if (input.stick) aimAngle = Math.atan2(input.stick.x, input.stick.y);
        else if (input.pointer) {
          ndc.set((input.pointer.x / innerWidth) * 2 - 1, -(input.pointer.y / innerHeight) * 2 + 1);
          ray.setFromCamera(ndc, camera);
          if (ray.ray.intersectPlane(plane, hitP)) aimAngle = Math.atan2(hitP.x - player.x, hitP.z - player.z);
        }
        player.aiming = aimAngle !== null && input.aiming;
        if (aimAngle !== null && player.aiming) player.aimFace = aimAngle;
        if (player.leap) { /* en plein saut : pas de tir */ } else if (input.tapFire) {
          // tir rapide : vers l'ennemi visible le plus proche, sinon droit devant
          let best = null, bd = Infinity;
          for (const e of enemies) { if (!e.alive || !shownToPlayer(e)) continue; const d = Math.hypot(e.x - player.x, e.z - player.z); if (d < bd) { bd = d; best = e; } }
          fireNet(best ? Math.atan2(best.x - player.x, best.z - player.z) : player.face);
        } else if (input.release) {
          // le tir part quand on lâche le joystick (ou le clic) : dans la dernière direction visée
          const a = input.release.pointer ? aimAngle : Math.atan2(input.release.x, input.release.y);
          if (a !== null) fireNet(a);
        }
      }
      // IA (allié et adversaires) ; en ligne, l'adversaire suit ce que son téléphone envoie
      for (const f of fighters()) if (f !== player && f.alive) (isRemote(f) ? runRemote(f, dt) : runAI(f, dt));
    }
    if (online) sendState(realDt);
    if (playing() && !over) updateCloud(dt);
    else cloud.update(matchT, t, dt);
    updateUltis(dt);
    shots.update(dt, fighters(), onHit, () => sfx('wall', 0.06));
    updateBonuses(dt);
    // poussière sous les pieds en courant, feuilles en entrant dans un buisson
    for (const f of fighters()) {
      if (!f.alive) continue;
      const vis = shownToPlayer(f);
      const ib = f.inBush;
      if (ib && !wasInBush.get(f) && vis) { leafBurst(f.x, f.z); if (f === player) sfx('bush', 0.2); }
      wasInBush.set(f, ib);
      if (f.moving && !ib && !f.leap && vis) {
        const nt = (dustT.get(f) ?? 0) - dt;
        if (nt <= 0) { spawnFx('dust', f.x - Math.sin(f.face) * 0.3, 0.15, f.z - Math.cos(f.face) * 0.3, { vy: 0.4, size: 0.35, grow: 1.6, life: 0.45 }); dustT.set(f, 0.14); } else dustT.set(f, nt);
      }
      // puissance active : étincelles rouges
      if (f.boostT > 0 && vis && Math.random() < dt * 12) spawnFx('dust', f.x + (Math.random() - 0.5) * 0.6, 0.4 + Math.random(), f.z + (Math.random() - 0.5) * 0.6, { vy: 1.2, size: 0.18, grow: 0.5, life: 0.4, color: 0xff4f6a });
    }
    updateFx(dt);
    for (const f of fighters()) { runBurst(f, dt); f.update(t, dt); }

    // buissons : transparence autour des membres de l'équipe cachés, frémissement quand quelqu'un s'y déplace
    for (const b of map.bushes) b.fade = 1;
    for (const m of [player, ally]) {
      if (!m?.alive) continue;
      const pb = map.bushAt(...toCell(m.x, m.z));
      if (pb) pb.fade = m === player ? 0.45 : 0.6;
      m.setAlpha(m.inBush ? 0.55 : 1);
    }
    for (const f of fighters()) { const b = map.bushAt(...toCell(f.x, f.z)); if (b && f.moving) b.wiggle = 1; }
    // les adversaires cachés dans un buisson disparaissent en fondu (sauf de près ou s'ils viennent de tirer)
    for (const e of enemies) { const shown = shownToPlayer(e); e.setAlpha(!shown ? 0 : e.inBush ? 0.75 : 1); }
    root.classList.toggle('lowhp', player.alive && !over && player.hp / player.maxHp < 0.3);

    // ligne de visée
    const showAim = player.alive && !over && player.aiming;
    aimLine.visible = showAim;
    if (showAim) {
      aimLine.position.set(player.x, 0.04, player.z);
      aimLine.rotation.set(-Math.PI / 2, 0, player.aimFace + Math.PI); // la bande (axe +y) pointe vers la visée
      aimLine.scale.set(1, player.gun.range, 1);
      aimLine.material.color.set(player.canFire() ? (player.boostT > 0 ? 0xff7a8a : 0xffffff) : 0xff7a7a);
    }
    // visée de l'ulti (aucun texte : direction et point d'impact seulement)
    const ua = ulti && !over && player.alive && !player.leap ? input.ultiAim : null;
    ultiLine.visible = ultiMark.visible = false;
    if (ua) {
      const ang = Math.atan2(ua.x, ua.y), d = ultiDist(ulti, ua.mag), ready = player.ulti >= 1;
      const col = ready ? new THREE.Color(ulti.color) : new THREE.Color(0x8a8f9c);
      if (ready) player.aimFace = ang;
      if (ulti.kind !== 'slam') {
        ultiLine.visible = true;
        ultiLine.position.set(player.x, 0.045, player.z);
        ultiLine.rotation.set(-Math.PI / 2, 0, ang + Math.PI);
        ultiLine.scale.set(1, d, 1);
        ultiLine.material.color.copy(col);
      }
      if (PLACED.has(ulti.kind) || ulti.kind === 'slam') {
        const [mx, mz] = ulti.kind === 'slam' ? [player.x, player.z] : collide(player.x + Math.sin(ang) * d, player.z + Math.cos(ang) * d, 0.2);
        ultiMark.visible = true;
        ultiMark.position.set(mx, 0.05, mz);
        ultiMark.scale.setScalar(ulti.radius ?? 1.5);
        ultiMark.material.color.copy(col);
      }
    }

    placeCamera(dt);
    map.update(t, dt, camTarget);
    renderer.render(scene, camera);

    // interface (on n'écrit dans la page que ce qui a changé)
    setText(ui.pBar, 'width', `${((player.hp / player.maxHp) * 100).toFixed(1)}%`);
    if (ulti && !over && player.alive) {
      const ready = player.ulti >= 1, armed = ready && !player.leap && !player.salvo && !player.slam;
      const pct = `${Math.floor(player.ulti * 100)}%`;
      if (ultiBtn.dataset.p !== pct) { ultiBtn.dataset.p = pct; ultiBtn.style.setProperty('--p', pct); }
      ultiBtn.classList.toggle('ready', ready);
      ultiBtn.classList.toggle('armed', armed);
      ultiRange.visible = ready && !player.leap;
      ultiRange.position.set(player.x, 0.035, player.z);
      ultiRange.material.opacity = armed ? 0.7 : 0.35;
    }
    if (shockT < 1) {
      shockT = Math.min(1, shockT + dt / 0.45);
      shock.scale.setScalar(0.4 + shockT * (shock.userData.r ?? 1.7) * 1.4);
      shock.material.opacity = (1 - shockT) * 0.9;
    }
    for (const [f, tg] of tags) {
      const shown = f.alive && shownToPlayer(f);
      tg.el.hidden = !shown;
      if (!shown) continue;
      const [sx, sy] = project(f.x, 2.35 + f.y, f.z);
      tg.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
      const pct = (f.hp / f.maxHp) * 100;
      setText(tg.bar, 'width', `${pct.toFixed(1)}%`);
      tg.bar.dataset.level = pct < 30 ? 'low' : pct < 60 ? 'mid' : 'high';
      tg.el.classList.toggle('shield', f.shieldT > 0);
    }
    const tp = tags.get(player);
    if (tp) {
      const ammoKey = `${Math.round(player.ammo * 20)}`;
      if (tp.ammo.dataset.k !== ammoKey) { tp.ammo.dataset.k = ammoKey; tp.ammo.innerHTML = ammoHtml(player); tp.ammo.classList.toggle('empty', player.ammo < 1); }
    }
    // flèches au bord de l'écran vers les adversaires visibles hors du cadre
    for (const [e, ar] of arrows) {
      const shown = e.alive && shownToPlayer(e) && !over;
      const [sx, sy] = project(e.x, 1, e.z);
      const m = 34, off = sx < m || sx > innerWidth - m || sy < 80 || sy > innerHeight - 40;
      ar.hidden = !(shown && off);
      if (ar.hidden) continue;
      const cx = innerWidth / 2, cy = innerHeight / 2, ang = Math.atan2(sy - cy, sx - cx);
      const k = Math.min((innerWidth / 2 - m) / Math.abs(Math.cos(ang) || 1e-6), (innerHeight / 2 - 90) / Math.abs(Math.sin(ang) || 1e-6));
      ar.style.transform = `translate(${cx + Math.cos(ang) * k}px, ${cy + Math.sin(ang) * k}px) rotate(${ang}rad)`;
    }
    requestAnimationFrame(frame);
  }

  function close() {
    if (!running) return;
    running = false;
    if (online) { net.send({ t: 'bye' }); setTimeout(() => online.room.close(), 300); }
    removeEventListener('resize', resize);
    controls.dispose();
    shots.dispose();
    clearUltis();
    cloud.dispose();
    for (const f of fighters()) f.dispose();
    map.dispose();
    aimLine.geometry.dispose(); aimLine.material.dispose();
    for (const o of [ultiRange, shock, ultiLine, ultiMark, ...markers.values()]) { o.geometry.dispose(); o.material.dispose(); }
    for (const b of bonuses) { b.base.material.dispose(); b.item.userData.mat?.dispose(); }
    Object.values(bonusGeo).forEach((g) => g.dispose());
    fx.forEach((f) => f.material.dispose()); Object.values(fxMats).forEach((m) => m.dispose()); puffTex.dispose(); leafTex.dispose();
    renderer.setPixelRatio(basePR);
    root.remove();
    document.getElementById('hud').classList.remove('hidden-for-battle');
    ctx.stage.resume();
    dispatchEvent(new Event('resize'));
    onExit?.();
  }
  $('.ar-quit').addEventListener('click', (e) => {
    if (over) { close(); return; }
    // double appui pour abandonner (évite les sorties accidentelles)
    if (performance.now() - fleeArmed > 2500) { fleeArmed = performance.now(); e.currentTarget.classList.add('armed'); setTimeout(() => $('.ar-quit')?.classList.remove('armed'), 2500); return; }
    // abandon d'un combat commencé : compté comme une défaite pour le classement (data/ranked.js, RANKED_RULES)
    if (phase === 'play' && !rewarded && !online) { rewarded = true; applyRankedResult(matchId, 'flee'); }
    close();
  });

  makeTeams();
  startMatch();
  requestAnimationFrame(frame);
  // accès pour les tests automatisés
  return {
    get fx() { return fx.length; }, enemyUlti: () => { enemies[0].ulti = 1; tryUlti(enemies[0]); },
    get player() { return player; }, get enemy() { return enemies[0]; }, get enemies() { return enemies; }, get ally() { return ally; },
    get ai() { return ais.get(enemies[0]); }, get phase() { return phase; }, get zones() { return zones.length; }, get over() { return over; }, get score() { return { ...score }; }, get target() { return killTarget; }, get fighters() { return fighters(); }, get bonuses() { return bonuses; },
    get format() { return format.id; }, get online() { return !!online; }, get cloud() { return { half: cloud.half, active: cloud.active, dist: cloud.dist(player.x, player.z) }; }, setMatchTime: (v) => { matchT = v; }, get matchT() { return matchT; }, netFire: (a) => fireNet(a), netUlti: (aim) => ultiNet(aim), get map() { return mapDef.id; },
    hit: (f, dmg, by) => onHit(f, dmg, f.x, f.z, by ?? player),
    zoneList: () => zones.map((z) => ({ kind: z.kind, x: z.x, z: z.z })),
    close, setAIEnabled: (v) => { aiEnabled = v; }, ulti: () => tryUlti(), canSee, fire: (f, angle) => tryFire(f, angle), bullets: () => shots.count,
    spawnBonuses: () => bonuses.forEach((b) => spawnBonus(b)),
  };
}
