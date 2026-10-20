// Projectiles de Map1 : trajectoire droite sur le plan, arrêtés par les obstacles solides (calculé au tir),
// touchent les combattants (segment / cercle). Effets : traînée, étincelles d'impact.
import * as THREE from 'three';
import { raycast } from './grid.js';
import { RADIUS } from './fighter.js';
import { glowTexture } from '../render/textures.js';

const BULLET_Y = 0.85;

export function createProjectiles(scene) {
  const list = [];
  const geo = new THREE.CapsuleGeometry(0.1, 0.5, 3, 8).rotateX(Math.PI / 2);
  // cœur du projectile : couleur de l'arme (un matériau par couleur) ; halo : couleur de l'équipe
  const mats = new Map();
  const coreMat = (color) => {
    if (!mats.has(color)) mats.set(color, new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    return mats.get(color);
  };
  const glowMat = { player: new THREE.SpriteMaterial({ map: glowTexture(), color: 0x5cffc4, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), enemy: new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff3d7f, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }) };
  // étincelles (pool)
  const sparks = [];
  const sparkMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffe0a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

  function spark(x, z, color = 0xffe0a0, n = 6, size = 0.35) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(sparkMat.clone());
      s.material.color.set(color);
      s.position.set(x, BULLET_Y, z);
      s.scale.setScalar(size);
      const a = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3;
      s.userData = { vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 1 + Math.random() * 2, life: 0.35 };
      scene.add(s);
      sparks.push(s);
    }
  }

  /**
   * Tire depuis le combattant (centre du personnage pour les collisions, bout du canon pour l'affichage).
   * Renvoie le nombre de projectiles créés.
   */
  // opts.gun : caractéristiques à utiliser (ulti) ; opts.pierce : traverse murs et adversaires ;
  // opts.fromUlti : dégâts d'ulti (ne rechargent pas la jauge)
  function fire(shooter, dirAngle, muzzle, { gun = null, pierce = false, fromUlti = false } = {}) {
    const g = gun ?? shooter.gun;
    for (let i = 0; i < g.pellets; i++) {
      const a = dirAngle + (g.pellets > 1 ? (i / (g.pellets - 1) - 0.5) * g.spread * 2 : (Math.random() - 0.5) * g.spread * 2);
      const dx = Math.sin(a), dz = Math.cos(a);
      const wall = pierce ? g.range : raycast(shooter.x, shooter.z, dx, dz, g.range);
      const mesh = new THREE.Mesh(geo, coreMat(g.color ?? 0xffffff));
      const size = g.size ?? 1;
      mesh.scale.set(size, size, size > 1.8 ? 0.55 : 1); // gros projectiles (rochers) : plus ronds
      const glow = new THREE.Sprite(glowMat[shooter.team]);
      glow.scale.setScalar(1.1);
      mesh.add(glow);
      mesh.rotation.y = a;
      mesh.position.set(muzzle.x, BULLET_Y, muzzle.z);
      scene.add(mesh);
      list.push({ mesh, owner: shooter, x: shooter.x, z: shooter.z, dx, dz, speed: g.speed, color: g.color ?? 0xffe0a0, travelled: 0, max: wall, blocked: wall < g.range - 1e-3, dmg: g.dmg * shooter.dmgMult * (shooter.boostT > 0 ? 1.35 : 1), vx: muzzle.x - shooter.x, vz: muzzle.z - shooter.z, pierce, fromUlti, hits: pierce ? new Set() : null });
    }
    return g.pellets;
  }

  /** Avance les projectiles ; onHit(cible, dégâts, x, z) pour chaque touche. */
  function update(dt, fighters, onHit, onBlock = null) {
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      const step = Math.min(b.speed * dt, b.max - b.travelled);
      const ox = b.x, oz = b.z;
      b.x += b.dx * step; b.z += b.dz * step; b.travelled += step;
      // touche un adversaire ? (segment parcouru contre cercle)
      let hit = null;
      for (const f of fighters) {
        if (f === b.owner || f.team === b.owner.team || !f.alive || b.hits?.has(f)) continue;
        const px = f.x - ox, pz = f.z - oz;
        const t = Math.max(0, Math.min(step, px * b.dx + pz * b.dz));
        const cx = ox + b.dx * t - f.x, cz = oz + b.dz * t - f.z;
        if (cx * cx + cz * cz < (RADIUS + 0.08) ** 2) { hit = f; b.x = ox + b.dx * t; b.z = oz + b.dz * t; break; }
      }
      // l'affichage part du canon et rejoint la ligne de tir réelle
      const k = Math.max(0, 1 - b.travelled / 1.2);
      b.mesh.position.set(b.x + b.vx * k, BULLET_Y, b.z + b.vz * k);
      if (hit && b.pierce) { b.hits.add(hit); onHit(hit, b.dmg, b.x, b.z, b.owner, { fromUlti: b.fromUlti }); spark(b.x, b.z, b.color, 12, 0.5); }   // continue sa course
      else if (hit) { onHit(hit, b.dmg, b.x, b.z, b.owner, { fromUlti: b.fromUlti }); spark(b.x, b.z, b.color, 7); remove(i); continue; }
      if (b.travelled >= b.max - 1e-4) { if (b.blocked) { spark(b.x - b.dx * 0.05, b.z - b.dz * 0.05, 0xffe0a0, 5, 0.28); if (b.owner.team === 'player') onBlock?.(); } remove(i); }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i], u = s.userData;
      u.life -= dt;
      s.position.x += u.vx * dt; s.position.z += u.vz * dt; s.position.y += u.vy * dt; u.vy -= 9 * dt;
      s.material.opacity = Math.max(0, u.life / 0.35);
      if (u.life <= 0) { scene.remove(s); s.material.dispose(); sparks.splice(i, 1); }
    }
  }
  function remove(i) { scene.remove(list[i].mesh); list.splice(i, 1); }
  function clear() { while (list.length) remove(list.length - 1); for (const s of sparks) { scene.remove(s); s.material.dispose(); } sparks.length = 0; }
  function dispose() { clear(); geo.dispose(); mats.forEach((m) => m.dispose()); Object.values(glowMat).forEach((m) => m.dispose()); sparkMat.dispose(); }
  return { fire, update, spark, clear, dispose, get count() { return list.length; } };
}
