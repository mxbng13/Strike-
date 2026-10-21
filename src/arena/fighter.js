// Combattant de Map1 : modèle 3D du Striker (réduit), position sur le plan, vie, chargeur, tir.
import * as THREE from 'three';
import { createCharacter } from '../characters/characterFactory.js';
import { collide, inBush } from './grid.js';
import { weaponOf } from '../data/weapons.js';

export const MODEL_SCALE = 0.84;   // hauteur du Striker ≈ 2 (une tuile = 1,4)
export const RADIUS = 0.45;        // rayon de collision
export const SPEED = 3.7;          // unités / seconde

/** Arme d'arène d'un Striker : la sienne (data/weapons.js), avec son nom. */
export function arenaGun(strikerId) {
  const w = weaponOf(strikerId);
  return { ...w.arena, id: w.id, name: w.name };
}

/**
 * look : apparence (rang, arme, skins). opts : { team: 'player' | 'enemy', maxHp, dmgMult, name }.
 */
export function createFighter(scene, def, look, { team, maxHp, dmgMult = 1, name, ringColor = null }) {
  // chaque Striker utilise toujours sa propre arme
  const gun = arenaGun(def.id);
  const gunId = gun.id;
  const model = createCharacter(def, { aura: false, ...look, weapon: gunId, stance: 'combat' }); // arme tenue devant, dans l'axe des tirs
  const holder = new THREE.Group();
  const tilt = new THREE.Group(); // inclinaison pendant la course (et chute à l'élimination)
  tilt.rotation.order = 'YXZ';
  holder.add(tilt);
  tilt.add(model.root);
  model.root.scale.setScalar(MODEL_SCALE);
  scene.add(holder);

  // bout du canon (repère du personnage, échelle comprise) : calculé une fois, personnage à l'origine
  let weaponObj = null;
  model.root.traverse((o) => { if (o.userData.weaponId) weaponObj = o; });
  holder.updateMatrixWorld(true);
  const muzzleLocal = new THREE.Vector3(0.28, 0.55, 0.55);
  if (weaponObj) {
    const box = new THREE.Box3().setFromObject(weaponObj);
    muzzleLocal.set((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.max.z);
  }
  const weaponRest = weaponObj?.position.clone();
  let prevFace = 0;

  // anneau d'équipe au sol + flèche de direction
  const color = ringColor ?? (team === 'player' ? 0x5cffc4 : 0xff3d7f);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
  const arrow = new THREE.Mesh(new THREE.CircleGeometry(0.16, 3), ring.material);
  arrow.rotation.x = -Math.PI / 2; arrow.rotation.z = Math.PI / 2; arrow.position.set(0, 0.031, 0.78);
  const ringGroup = new THREE.Group();
  ringGroup.add(ring, arrow);
  holder.add(ringGroup);

  // flash de tir
  const flash = new THREE.PointLight(gun.color ?? 0xffd27a, 0, 3, 2);
  holder.add(flash);

  // matériaux du modèle (pour la transparence dans les buissons) : on ne touche pas aux contours partagés
  const mats = [];
  model.root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.outline) { o.userData.isOutline = true; return; }
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of list) if (!mats.includes(m)) mats.push(m);
  });
  const outlines = [];
  model.root.traverse((o) => { if (o.userData.outline) outlines.push(o); });
  // transparence progressive (fondu), sans recompiler les matériaux : seul l'état « transparent » bascule
  let alpha = 1, alphaTarget = 1;
  function applyAlpha(a) {
    alpha = a;
    const tr = a < 0.995;
    for (const m of mats) { m.transparent = tr || m.userData.wasTransparent; m.opacity = a; m.depthWrite = !tr; }
    for (const o of outlines) o.visible = !tr;
    holder.visible = a > 0.02;
  }
  function setAlpha(a, instant = false) { alphaTarget = a; if (instant) applyAlpha(a); }
  for (const m of mats) m.userData.wasTransparent = m.transparent;
  // éclair au moment d'un coup reçu (couleur émissive temporaire, puis retour à l'origine)
  const glowMats = mats.filter((m) => m.emissive);
  const baseEmissive = glowMats.map((m) => [m.emissive.clone(), m.emissiveIntensity]);
  let flashHit = 0;
  const flashColor = new THREE.Color();
  function applyHitFlash(k) {
    glowMats.forEach((m, i) => {
      const [c, inten] = baseEmissive[i];
      if (k <= 0) { m.emissive.copy(c); m.emissiveIntensity = inten; return; }
      m.emissive.copy(c).lerp(flashColor, k); m.emissiveIntensity = inten + (1.2 - inten) * k;
    });
  }

  const f = {
    team, def, name, gun, gunId, holder, model, ring,
    x: 0, y: 0, z: 0, face: 0, leap: null, ulti: 0, boostT: 0, stunT: 0, aimFace: 0, maxHp, hp: maxHp, dmgMult,
    ammo: gun.mag, burst: null, fireCd: 0, revealT: 0, lastHurtT: -99, lastShotT: -99, alive: true,
    moving: false, walkT: 0, recoil: 0, flashT: 0,
    stats: { shots: 0, hits: 0, dmg: 0, kills: 0 },
    respawnT: 0, shieldT: 0, life: 0,   // réapparition : délai restant, protection, numéro de la vie en cours
    get hidden() { return this.alive && inBush(this.x, this.z) && this.revealT <= 0; },
    get inBush() { return inBush(this.x, this.z); },
    place(x, z, face) { this.x = x; this.z = z; this.face = this.aimFace = face; prevFace = face; },
    reset(x, z, face) {
      this.place(x, z, face);
      Object.assign(this, { y: 0, leap: null, ulti: 0, boostT: 0, hp: maxHp, ammo: gun.mag, burst: null, fireCd: 0, revealT: 0, lastHurtT: -99, lastShotT: -99, alive: true, moving: false, recoil: 0, flashT: 0, stunT: 0 });
      this.stats = { shots: 0, hits: 0, dmg: 0, kills: 0 };
      this.respawnT = this.shieldT = this.life = 0;
      holder.visible = true; tilt.rotation.set(0, 0, 0); tilt.position.y = 0; ringGroup.visible = true;
      setAlpha(1, true); this.vx = this.vz = 0;
    },
    /** Réapparition en cours de partie : vie et charges pleines ; statistiques et charge d'ulti conservées. */
    respawn(x, z, face) {
      const { stats, ulti, life } = this;
      this.reset(x, z, face);
      Object.assign(this, { stats, ulti, life });
    },
    /** Déplacement (dirX, dirZ normalisé ou nul) avec collisions. */
    /** Déplacement (direction voulue, longueur 0..1) : accélération et freinage courts pour un mouvement souple. */
    move(dx, dz, dt) {
      if (this.stunT > 0) { dx = 0; dz = 0; }   // étourdi : ne peut plus se déplacer
      const len = Math.hypot(dx, dz);
      const tx = len > 0.05 ? (dx / Math.max(1, len)) * SPEED : 0, tz = len > 0.05 ? (dz / Math.max(1, len)) * SPEED : 0;
      const k = 1 - Math.exp(-dt * 16);
      this.vx += (tx - this.vx) * k; this.vz += (tz - this.vz) * k;
      const sp = Math.hypot(this.vx, this.vz);
      this.moving = sp > 0.4;
      if (sp < 0.02) { this.vx = this.vz = 0; return; }
      const ox = this.x, oz = this.z;
      [this.x, this.z] = collide(this.x + this.vx * dt, this.z + this.vz * dt, RADIUS);
      // contre un mur : la vitesse suit le déplacement réel (glissement le long de l'obstacle)
      if (dt > 0) { this.vx = (this.x - ox) / dt; this.vz = (this.z - oz) / dt; }
      if (len > 0.05 && !this.aimingRecently) this.aimFace = Math.atan2(dx, dz);
    },
    vx: 0, vz: 0,
    // charges : une attaque en consomme une ; elles reviennent toutes seules (une toutes les `gun.reload` s)
    canFire() { return this.alive && !this.leap && !this.burst && this.stunT <= 0 && this.fireCd <= 0 && this.ammo >= 1; },
    get charges() { return Math.floor(this.ammo + 1e-6); },
    get aimingRecently() { return this.now - this.lastShotT < 0.6 || this.aiming; },
    now: 0, aiming: false,
    muzzle(out = new THREE.Vector3()) { return out.copy(muzzleLocal).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.face).add(new THREE.Vector3(this.x, 0, this.z)); },
    update(t, dt) {
      this.now = t;
      this.fireCd = Math.max(0, this.fireCd - dt);
      this.revealT = Math.max(0, this.revealT - dt);
      this.boostT = Math.max(0, this.boostT - dt);
      this.stunT = Math.max(0, this.stunT - dt);
      if (this.alive && this.ammo < gun.mag) this.ammo = Math.min(gun.mag, this.ammo + dt / gun.reload);
      // régénération hors combat (3 s sans dégâts ni tir)
      if (this.alive && t - this.lastHurtT > 3 && t - this.lastShotT > 3 && this.hp < maxHp) this.hp = Math.min(maxHp, this.hp + maxHp * 0.09 * dt);
      // rotation fluide vers la visée / la marche
      let d = this.aimFace - this.face;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.face += d * Math.min(1, dt * 16);
      holder.position.set(this.x, this.y, this.z);
      tilt.rotation.y = this.face;
      ringGroup.rotation.y = this.face;
      // course : rebond + légère inclinaison ; recul de l'arme
      if (this.moving && this.alive) this.walkT += dt * 11; else this.walkT = 0;
      // animation de marche du modèle (jambes, bras, rebond), proportionnelle à la vitesse
      const speed = this.alive ? Math.min(1, Math.hypot(this.vx, this.vz) / SPEED) : 0;
      model.setWalk?.(speed);
      // mouvement détaillé pour les modèles qui l'exploitent : direction de la course par rapport au
      // regard (pas chassés, marche arrière), vitesse de rotation (virages), visée
      if (model.setMotion) {
        const turn = dt > 0 ? Math.atan2(Math.sin(this.face - prevFace), Math.cos(this.face - prevFace)) / dt : 0;
        model.setMotion({ speed, rel: speed > 0.05 ? Math.atan2(this.vx, this.vz) - this.face : 0, turn, aiming: this.aimingRecently });
      }
      prevFace = this.face;
      this.recoil = Math.max(0, this.recoil - dt * 6);
      if (weaponObj && !model.shoot) weaponObj.position.z = weaponRest.z - this.recoil * 0.12; // sinon : recul animé par le modèle
      this.flashT = Math.max(0, this.flashT - dt);
      flash.intensity = this.flashT > 0 ? 6 : 0;
      if (this.flashT > 0) flash.position.copy(muzzleLocal).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.face);
      if (Math.abs(alphaTarget - alpha) > 0.003) applyAlpha(alpha + (alphaTarget - alpha) * Math.min(1, dt * 9));
      else if (alpha !== alphaTarget) applyAlpha(alphaTarget);
      if (flashHit > 0) { flashHit = Math.max(0, flashHit - dt * 7); applyHitFlash(flashHit); }
      if (this.alive) model.update(t, dt);
      else { tilt.rotation.x += (-1.45 - tilt.rotation.x) * Math.min(1, dt * 7); ringGroup.visible = false; }
    },
    setAlpha,
    /** Éclair de dégâts (blanc / rouge). */
    hitFlash(color = 0xffffff) { flashColor.set(color); flashHit = 1; applyHitFlash(1); },
    kill() {
      this.alive = false; this.hp = 0;
      model.play('hit');
    },
    dispose() { scene.remove(holder); model.dispose(); ring.geometry.dispose(); arrow.geometry.dispose(); ring.material.dispose(); },
  };
  return f;
}
