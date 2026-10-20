// IA des combattants de l'arène (ennemis et allié). États : patrouille (ou escorte du joueur pour l'allié),
// combat, traque (dernière position connue), repli (buisson). Elle ne voit un adversaire que s'il est
// visible : ligne de vue dégagée, à portée, et pas caché dans un buisson (sauf tout près ou s'il vient de
// tirer). Elle n'a jamais d'informations « magiques » sur la position de ses adversaires.
import { findPath, findTiles, cellCenter, lineOfSight, inBush } from './grid.js';

const SIGHT = 13;          // portée de vue
const BUSH_REVEAL = 2.3;   // distance à laquelle on repère quelqu'un dans un buisson
const HEARING = 9;         // un tir entendu dans ce rayon donne une position approximative

/** Le combattant `a` voit-il `b` ? */
export function canSee(a, b) {
  if (!b.alive) return false;
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  if (d > SIGHT) return false;
  if (b.hidden && d > BUSH_REVEAL) return false;
  return lineOfSight(a.x, a.z, b.x, b.z);
}

/**
 * me : le combattant piloté. opts.foes() : adversaires ; opts.leader : joueur à escorter (allié) ;
 * opts.bonuses() : bonus ramassables [{ x, z, active }].
 */
export function createAI(me, { foes, leader = null, bonuses = () => [], level = 1, rng = Math.random } = {}) {
  const freeTiles = [...findTiles('.'), ...findTiles('-'), ...findTiles('B')];
  const bushTiles = findTiles('B').map(([c, r]) => cellCenter(c, r));
  const skill = Math.min(1, 0.55 + level * 0.04);   // précision / réactivité
  let state = 'patrol', stateT = 0;
  let path = [], goal = null, repathT = 0;
  let lastSeen = null;                               // { x, z, t }
  let target = null;
  let react = 0, strafe = 1, strafeT = 0;
  let stuckT = 0, lastX = me.x, lastZ = me.z, searchShots = 0;

  function setState(s) { if (state !== s) { state = s; stateT = 0; path = []; goal = null; } }
  function goTo(x, z, now = false) {
    if (!now && goal && Math.hypot(goal[0] - x, goal[1] - z) < 0.8 && path.length && repathT > 0) return;
    goal = [x, z]; path = findPath(me.x, me.z, x, z); repathT = 0.7;
  }
  function follow() {
    while (path.length && Math.hypot(path[0][0] - me.x, path[0][1] - me.z) < 0.35) path.shift();
    if (!path.length) return [0, 0];
    const dx = path[0][0] - me.x, dz = path[0][1] - me.z, d = Math.hypot(dx, dz) || 1;
    return [dx / d, dz / d];
  }
  function randomPatrolPoint() {
    // bonus disponible proche : on va le chercher
    const b = bonuses().filter((x) => x.active).sort((p, q) => Math.hypot(p.x - me.x, p.z - me.z) - Math.hypot(q.x - me.x, q.z - me.z))[0];
    if (b && Math.hypot(b.x - me.x, b.z - me.z) < 12 && rng() < 0.7) return [b.x, b.z];
    // de préférence vers le centre et les buissons (là où se passent les combats)
    const pick = rng() < 0.35 ? bushTiles[Math.floor(rng() * bushTiles.length)] : cellCenter(...freeTiles[Math.floor(rng() * freeTiles.length)]);
    return [pick[0] * 0.8, pick[1] * 0.75];
  }
  function bestBush(from) {
    let best = null, score = -Infinity;
    for (const [x, z] of bushTiles) {
      const s = Math.hypot(x - from.x, z - from.z) * 1.2 - Math.hypot(x - me.x, z - me.z);
      if (s > score) { score = s; best = [x, z]; }
    }
    return best;
  }
  /** Adversaire visible le plus proche (ou null). */
  function pickTarget() {
    let best = null, bd = Infinity;
    for (const f of foes()) {
      if (!canSee(me, f)) continue;
      const d = Math.hypot(f.x - me.x, f.z - me.z);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  /** Événements extérieurs : coup reçu, tir entendu. */
  function onHurt(fromX, fromZ, t) { lastSeen = { x: fromX, z: fromZ, t }; if (state === 'patrol') setState('hunt'); }
  function onNoise(x, z, t) {
    if (Math.hypot(x - me.x, z - me.z) < HEARING && state !== 'engage') { lastSeen = { x: x + (rng() - 0.5) * 2, z: z + (rng() - 0.5) * 2, t }; if (state === 'patrol') setState('hunt'); }
  }

  /** Décision de l'image : { mx, mz, aim (angle ou null), fire, target }. */
  function update(t, dt) {
    stateT += dt; repathT -= dt; strafeT -= dt;
    const out = { mx: 0, mz: 0, aim: null, fire: false, target: null };
    if (!me.alive) return out;
    target = pickTarget();
    const sees = !!target;
    const dist = sees ? Math.hypot(target.x - me.x, target.z - me.z) : Infinity;
    if (sees) { lastSeen = { x: target.x, z: target.z, t }; react += dt; } else react = 0;
    out.target = target;

    // changements d'état
    if (me.hp < me.maxHp * 0.3 && state !== 'retreat' && (sees || t - (lastSeen?.t ?? -99) < 2)) setState('retreat');
    else if (state === 'retreat' && me.hp > me.maxHp * 0.7) setState('patrol');
    else if (sees && state !== 'retreat') setState('engage');
    else if (state === 'engage' && !sees) setState(lastSeen ? 'hunt' : 'patrol');
    // l'allié qui s'éloigne trop du joueur revient vers lui
    if (leader?.alive && state === 'hunt' && Math.hypot(leader.x - me.x, leader.z - me.z) > 9) setState('patrol');

    let mv = [0, 0];
    if (state === 'engage') {
      const desired = me.gun.range * 0.62;
      if (dist > desired + 1.2) { if (repathT <= 0) goTo(target.x, target.z, true); mv = follow(); }
      else if (dist < desired - 1.6) { mv = [(me.x - target.x) / dist, (me.z - target.z) / dist]; }
      else {
        // déplacement latéral (difficile à toucher)
        if (strafeT <= 0) { strafe = rng() < 0.5 ? -1 : 1; strafeT = 0.7 + rng() * 1.1; }
        mv = [-(target.z - me.z) / dist * strafe, (target.x - me.x) / dist * strafe];
      }
      const err = (1 - skill) * 0.35 * (rng() - 0.5) + Math.max(0, 0.4 - react) * 0.4 * (rng() - 0.5);
      out.aim = Math.atan2(target.x - me.x, target.z - me.z) + err;
      out.fire = react > 0.45 - skill * 0.15 && dist <= me.gun.range * 0.95;
    } else if (state === 'hunt') {
      if (!lastSeen || stateT > 6) { lastSeen = null; setState('patrol'); }
      else {
        const d = Math.hypot(lastSeen.x - me.x, lastSeen.z - me.z);
        if (d > 1) { if (repathT <= 0 || !path.length) goTo(lastSeen.x, lastSeen.z); mv = follow(); out.aim = Math.atan2(lastSeen.x - me.x, lastSeen.z - me.z); }
        else if (inBush(lastSeen.x, lastSeen.z) && searchShots < 2 && me.canFire()) { searchShots++; out.aim = Math.atan2(lastSeen.x - me.x, lastSeen.z - me.z) + (rng() - 0.5) * 0.6; out.fire = true; }
        else if (stateT > 3) { lastSeen = null; setState('patrol'); }
        // tire dans le buisson où l'adversaire a disparu (s'il est à portée et en ligne de vue)
        if (lastSeen && d <= me.gun.range * 0.8 && d > 1 && inBush(lastSeen.x, lastSeen.z) && searchShots < 2 && rng() < dt * 1.2 && lineOfSight(me.x, me.z, lastSeen.x, lastSeen.z)) {
          searchShots++; out.aim = Math.atan2(lastSeen.x - me.x, lastSeen.z - me.z) + (rng() - 0.5) * 0.4; out.fire = true;
        }
      }
    } else if (state === 'retreat') {
      const from = target ?? lastSeen ?? { x: 0, z: 0 };
      const b = goal ?? (leader?.alive ? [leader.x, leader.z] : bestBush(from));
      if (!goal || repathT <= 0) goTo(b[0], b[1], !goal);
      mv = follow();
      if (sees && dist < me.gun.range) { out.aim = Math.atan2(target.x - me.x, target.z - me.z) + (rng() - 0.5) * 0.2; out.fire = react > 0.4; }
    } else {
      searchShots = 0;
      if (leader?.alive) {
        // escorte : reste à 2-4 m du joueur
        const d = Math.hypot(leader.x - me.x, leader.z - me.z);
        if (d > 4) { if (repathT <= 0 || !path.length) goTo(leader.x + (rng() - 0.5) * 2, leader.z + (rng() - 0.5) * 2, true); mv = follow(); }
        else if (!goal || !path.length) { if (rng() < dt * 0.6) { const a = rng() * Math.PI * 2; goTo(leader.x + Math.cos(a) * 2.5, leader.z + Math.sin(a) * 2.5, true); } }
        else mv = follow();
      } else {
        if (!goal || !path.length) { const p = randomPatrolPoint(); goTo(p[0], p[1], true); }
        mv = follow();
      }
    }

    // coincé : on recalcule le chemin
    const moved = Math.hypot(me.x - lastX, me.z - lastZ);
    if ((mv[0] || mv[1]) && moved < 0.01) { stuckT += dt; if (stuckT > 0.4) { stuckT = 0; strafe = -strafe; path = []; goal = null; repathT = 0; } } else stuckT = 0;
    lastX = me.x; lastZ = me.z;
    out.mx = mv[0]; out.mz = mv[1];
    return out;
  }
  function reset() { state = 'patrol'; stateT = 0; path = []; goal = null; lastSeen = null; react = 0; searchShots = 0; target = null; lastX = me.x; lastZ = me.z; }
  return { update, onHurt, onNoise, reset, get state() { return state; }, get target() { return target; } };
}
