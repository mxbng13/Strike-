// Génère des personnages 3D stylisés (chibi / anime) à partir de primitives.
// Aucun fichier externe : chaque personnage est décrit par son `look` dans data/characters.js.
// Remplaçable plus tard par des modèles glTF sans toucher au reste du jeu (même interface : root + update + play).
import * as THREE from 'three';
import { RARITIES } from '../data/rarities.js';
import { glowTexture, crystalTexture } from '../render/textures.js';
import { createClaudeModel } from './models/claude.js';
import { createHumanoidModel } from './models/humanoid.js';
import { STRIKER_SPECS } from './models/strikers/index.js';

let toonGradient = null;
function getToonGradient() {
  if (toonGradient) return toonGradient;
  const data = new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]);
  toonGradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  toonGradient.minFilter = toonGradient.magFilter = THREE.NearestFilter;
  toonGradient.needsUpdate = true;
  return toonGradient;
}

const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: 0x120a24, side: THREE.BackSide });

function toon(color, emissive = 0x000000, emissiveIntensity = 0) {
  return new THREE.MeshToonMaterial({ color, gradientMap: getToonGradient(), emissive, emissiveIntensity });
}

// Maillage avec contour "inverted hull" (look cel-shading).
function part(geometry, material, { outline = 0.035, shadow = true } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = shadow;
  if (outline) {
    const hull = new THREE.Mesh(geometry, OUTLINE_MAT);
    hull.scale.setScalar(1 + outline);
    mesh.add(hull);
  }
  return mesh;
}

function glowSprite(color, size) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  sprite.scale.setScalar(size);
  return sprite;
}

function buildHair(look, headR) {
  const g = new THREE.Group();
  const hairMat = toon(look.hair);
  const cap = part(new THREE.SphereGeometry(headR * 1.07, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.56), hairMat);
  cap.rotation.x = -0.6;
  g.add(cap);

  switch (look.hairStyle) {
    case 'spiky':
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 1.3 - Math.PI * 0.15;
        const spike = part(new THREE.ConeGeometry(0.13, 0.36, 8), hairMat, { outline: 0.06 });
        spike.position.set(Math.cos(a) * 0.26, headR * 0.82, -Math.sin(a) * 0.26 - 0.05);
        spike.rotation.set(-Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
        g.add(spike);
      }
      break;
    case 'hood': {
      const hood = part(new THREE.SphereGeometry(headR * 1.18, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), toon(look.primary));
      hood.rotation.x = -0.6;
      g.add(hood);
      const tip = part(new THREE.ConeGeometry(0.16, 0.42, 10), toon(look.primary), { outline: 0.06 });
      tip.position.set(0, headR * 0.7, -headR * 0.85);
      tip.rotation.x = -1.9;
      g.add(tip);
      break;
    }
    case 'swoop': {
      const tufts = [[-0.2, 0.36, 0.1, 0.5], [0.05, 0.44, 0.05, 0.2], [0.26, 0.34, 0.08, -0.4], [-0.32, 0.12, 0.0, 0.9], [0.36, 0.1, -0.02, -0.9], [0.0, 0.3, -0.3, 0]];
      for (const [x, y, z, rz] of tufts) {
        const tuft = part(new THREE.SphereGeometry(0.2, 14, 10), hairMat, { outline: 0.05 });
        tuft.scale.set(1.2, 0.62, 1.05);
        tuft.position.set(x, y, z);
        tuft.rotation.z = rz;
        g.add(tuft);
      }
      // grande mèche qui retombe sur le front, balayée vers la droite
      const fringe = part(new THREE.SphereGeometry(0.24, 16, 10), hairMat, { outline: 0.05 });
      fringe.scale.set(1.25, 0.5, 0.75);
      fringe.position.set(0.1, 0.22, headR * 0.72);
      fringe.rotation.set(0.5, 0, -0.35);
      g.add(fringe);
      break;
    }
    case 'bob':
      for (const sd of [-1, 1]) {
        const side = part(new THREE.CapsuleGeometry(0.16, 0.22, 6, 12), hairMat, { outline: 0.05 });
        side.position.set(sd * headR * 0.88, -0.12, -0.05);
        g.add(side);
      }
      break;
    case 'twintails':
      for (const s of [-1, 1]) {
        const tail = part(new THREE.CapsuleGeometry(0.13, 0.5, 6, 12), hairMat, { outline: 0.06 });
        tail.position.set(s * headR * 1.05, -0.05, -0.12);
        tail.rotation.z = s * 0.35;
        tail.userData.sway = s;
        g.add(tail);
        const tie = part(new THREE.TorusGeometry(0.09, 0.035, 8, 16), toon(look.accent), { outline: 0 });
        tie.position.set(s * headR * 0.98, 0.25, -0.12);
        tie.rotation.y = Math.PI / 2;
        g.add(tie);
      }
      break;
    case 'helmet': {
      const helm = part(new THREE.SphereGeometry(headR * 1.13, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), toon(look.secondary));
      helm.rotation.x = -0.15;
      g.add(helm);
      const band = part(new THREE.TorusGeometry(headR * 1.1, 0.05, 8, 32), toon(look.accent, look.accent, 0.4), { outline: 0 });
      band.rotation.x = Math.PI / 2 - 0.15;
      band.position.y = 0.04;
      g.add(band);
      for (const s of [-1, 1]) {
        const horn = part(new THREE.ConeGeometry(0.07, 0.3, 8), toon(0xf2e6cc), { outline: 0.08 });
        horn.position.set(s * headR * 0.9, headR * 0.6, 0);
        horn.rotation.z = -s * 0.7;
        g.add(horn);
      }
      break;
    }
    case 'long':
    case 'witch':
    case 'horns': {
      const back = part(new THREE.CapsuleGeometry(headR * 0.82, 0.55, 6, 16), hairMat);
      back.scale.z = 0.55;
      back.position.set(0, -0.28, -headR * 0.55);
      g.add(back);
      const fringe = part(new THREE.SphereGeometry(headR * 1.07, 24, 8, Math.PI / 2 - 0.9, 1.8, 0.25, 0.55), hairMat, { outline: 0 });
      g.add(fringe);
      if (look.hairStyle === 'witch') {
        const hatMat = toon(look.primary);
        const brim = part(new THREE.CylinderGeometry(headR * 1.75, headR * 1.75, 0.05, 32), hatMat);
        brim.position.y = headR * 0.62;
        brim.rotation.x = -0.12;
        g.add(brim);
        const cone = part(new THREE.ConeGeometry(headR * 0.95, 0.85, 24), hatMat);
        cone.position.set(0, headR * 0.62 + 0.42, -0.06);
        cone.rotation.x = -0.28;
        g.add(cone);
        const star = part(new THREE.OctahedronGeometry(0.08), toon(look.secondary, look.secondary, 0.8), { outline: 0 });
        star.position.set(0, headR * 0.62 + 0.18, headR * 0.72);
        g.add(star);
      }
      if (look.hairStyle === 'horns') {
        const hornMat = toon(look.accent, look.accent, 0.9);
        for (const s of [-1, 1]) {
          const horn = new THREE.Group();
          let y = 0;
          for (let i = 0; i < 4; i++) {
            const seg = part(new THREE.ConeGeometry(0.08 - i * 0.017, 0.2, 8, 1, true), hornMat, { outline: 0.1 });
            seg.position.set(s * i * 0.06, y, -i * 0.03);
            seg.rotation.z = -s * (0.4 + i * 0.25);
            horn.add(seg);
            y += 0.15;
          }
          horn.position.set(s * headR * 0.62, headR * 0.65, 0);
          g.add(horn);
        }
      }
      break;
    }
  }
  return g;
}

function buildWeapon(look) {
  const g = new THREE.Group();
  const metal = toon(0xd8dde8);
  const glow = toon(look.accent, look.accent, 0.9);
  switch (look.weapon) {
    case 'sword': {
      const blade = part(new THREE.BoxGeometry(0.09, 0.9, 0.025), toon(look.accent, look.accent, 0.35), { outline: 0.06 });
      blade.position.y = 0.6;
      const guard = part(new THREE.BoxGeometry(0.32, 0.06, 0.08), toon(look.secondary));
      guard.position.y = 0.14;
      const grip = part(new THREE.CylinderGeometry(0.035, 0.035, 0.22), toon(0x3a2a20));
      g.add(blade, guard, grip);
      break;
    }
    case 'staff': {
      const shaft = part(new THREE.CylinderGeometry(0.035, 0.04, 1.6, 8), toon(look.secondary));
      shaft.position.y = 0.35;
      const gem = part(new THREE.OctahedronGeometry(0.13), glow, { outline: 0.05 });
      gem.position.y = 1.22;
      gem.userData.spin = true;
      const halo = glowSprite(look.accent, 0.8);
      halo.position.y = 1.22;
      g.add(shaft, gem, halo);
      break;
    }
    case 'bow': {
      const arc = part(new THREE.TorusGeometry(0.5, 0.03, 8, 24, Math.PI), toon(look.secondary));
      arc.rotation.z = -Math.PI / 2;
      arc.position.y = 0.0;
      const string = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.0), new THREE.MeshBasicMaterial({ color: look.accent }));
      g.add(arc, string);
      g.rotation.y = Math.PI / 2;
      break;
    }
    case 'hammer': {
      const handle = part(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 8), toon(0x5a3a22));
      handle.position.y = 0.3;
      const head = part(new THREE.BoxGeometry(0.42, 0.26, 0.26), metal);
      head.position.y = 0.78;
      const core = part(new THREE.BoxGeometry(0.44, 0.08, 0.28), glow, { outline: 0 });
      core.position.y = 0.78;
      g.add(handle, head, core);
      break;
    }
    case 'spear': {
      const shaft = part(new THREE.CylinderGeometry(0.03, 0.03, 1.9, 8), toon(look.secondary));
      shaft.position.y = 0.45;
      const tip = part(new THREE.ConeGeometry(0.08, 0.32, 4), toon(look.accent, look.accent, 0.5), { outline: 0.06 });
      tip.position.y = 1.55;
      const tassel = part(new THREE.ConeGeometry(0.06, 0.18, 8), toon(look.primary), { outline: 0 });
      tassel.position.y = 1.32;
      tassel.rotation.x = Math.PI;
      g.add(shaft, tip, tassel);
      break;
    }
    case 'dagger': {
      const blade = part(new THREE.ConeGeometry(0.06, 0.42, 4), toon(look.accent, look.accent, 0.35), { outline: 0.06 });
      blade.position.y = 0.32;
      blade.scale.z = 0.35;
      const guard = part(new THREE.BoxGeometry(0.18, 0.04, 0.06), toon(look.secondary));
      guard.position.y = 0.1;
      g.add(blade, guard);
      g.rotation.x = 0.5;
      break;
    }
    case 'scythe': {
      const shaft = part(new THREE.CylinderGeometry(0.03, 0.035, 1.8, 8), toon(0x2a2030));
      shaft.position.y = 0.4;
      const blade = part(new THREE.TorusGeometry(0.42, 0.04, 6, 20, Math.PI * 0.75), toon(look.accent, look.accent, 0.5), { outline: 0.08 });
      blade.scale.set(1, 1, 0.4);
      blade.position.set(-0.4, 1.28, 0);
      blade.rotation.z = Math.PI * 0.05;
      g.add(shaft, blade);
      break;
    }
    case 'orb': {
      const orb = part(new THREE.IcosahedronGeometry(0.17, 1), glow, { outline: 0.05 });
      orb.position.set(0, 0.32, 0.1);
      orb.userData.float = true;
      const halo = glowSprite(look.accent, 1.0);
      orb.add(halo);
      g.add(orb);
      break;
    }
  }
  return g;
}

function buildAura(rarityKey) {
  const r = RARITIES[rarityKey];
  const g = new THREE.Group();
  if (!r.aura3d) return g;
  const count = 40;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    seeds[i] = Math.random();
    const a = Math.random() * Math.PI * 2;
    const rad = 0.55 + Math.random() * 0.35;
    pos.set([Math.cos(a) * rad, Math.random() * 2.2, Math.sin(a) * rad], i * 3);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    color: r.aura, size: 0.09, map: glowTexture(), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  pts.userData.seeds = seeds;
  g.add(pts);
  g.userData.particles = pts;
  return g;
}

// Oreilles (renard / chat / elfe)
function buildEars(look, headR) {
  const g = new THREE.Group();
  if (!look.ears) return g;
  const mat = toon(look.hair);
  for (const sd of [-1, 1]) {
    if (look.ears === 'elf') {
      const ear = part(new THREE.ConeGeometry(0.07, 0.34, 6), toon(look.skin), { outline: 0.08 });
      ear.position.set(sd * headR * 0.98, 0.02, -0.02);
      ear.rotation.z = -sd * 1.25;
      g.add(ear);
    } else {
      const big = look.ears === 'fox';
      const ear = part(new THREE.ConeGeometry(big ? 0.15 : 0.11, big ? 0.36 : 0.24, 4), mat, { outline: 0.06 });
      ear.position.set(sd * headR * 0.55, headR * 0.92, -0.04);
      ear.rotation.z = -sd * 0.35;
      ear.rotation.y = Math.PI / 4;
      const inner = part(new THREE.ConeGeometry(big ? 0.08 : 0.06, big ? 0.22 : 0.14, 4), toon(0xffb3c7), { outline: 0, shadow: false });
      inner.position.set(0, -0.02, 0.06);
      ear.add(inner);
      g.add(ear);
    }
  }
  return g;
}

// Queues : 'fox' (touffue, pointe blanche) ou 'dragon' (segments). count = nombre de queues.
function buildTails(look) {
  const g = new THREE.Group();
  if (!look.tail) return g;
  const n = look.tails ?? 1;
  for (let i = 0; i < n; i++) {
    const t = new THREE.Group();
    const spread = n > 1 ? (i / (n - 1) - 0.5) * 1.4 : 0;
    // vers l'arrière : relevée pour le renard, plus basse pour le dragon
    t.rotation.set(look.tail === 'fox' ? 2.0 : 1.0, 0, spread);
    t.userData.tail = { base: spread, phase: i * 0.7 };
    if (look.tail === 'fox') {
      const fur = part(new THREE.CapsuleGeometry(0.13, 0.42, 6, 12), toon(look.hair));
      fur.position.y = -0.3;
      const tip = part(new THREE.SphereGeometry(0.13, 12, 10), toon(0xffffff), { outline: 0.05 });
      tip.position.y = -0.58;
      t.add(fur, tip);
    } else {
      for (let k = 0; k < 4; k++) {
        const seg = part(new THREE.ConeGeometry(0.11 - k * 0.022, 0.24, 8), toon(look.primary), { outline: 0.06 });
        seg.position.y = -0.12 - k * 0.18;
        seg.rotation.x = Math.PI;
        t.add(seg);
      }
      const spike = part(new THREE.ConeGeometry(0.06, 0.16, 4), toon(look.accent, look.accent, 0.5), { outline: 0 });
      spike.position.y = -0.84;
      spike.rotation.x = Math.PI;
      t.add(spike);
    }
    t.position.set(0, 0.74, -0.27);
    g.add(t);
  }
  return g;
}

// Ailes : 'feather', 'angel' (plumes) ou 'bat', 'dragon' (membranes).
function buildWings(look) {
  const g = new THREE.Group();
  if (!look.wings) return g;
  const feathered = look.wings === 'feather' || look.wings === 'angel';
  const size = look.wings === 'feather' ? 0.75 : look.wings === 'angel' ? 1.25 : look.wings === 'dragon' ? 1.2 : 0.95;
  const color = look.wingColor ?? (look.wings === 'angel' ? 0xffffff : look.secondary);
  for (const sd of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(sd * 0.12, 1.22, -0.26);
    if (feathered) {
      const mat = toon(color, look.wings === 'angel' ? look.accent : 0x000000, look.wings === 'angel' ? 0.25 : 0);
      for (let k = 0; k < 4; k++) {
        const f = part(new THREE.CapsuleGeometry(0.07, 0.42 * size * (1 - k * 0.15), 4, 8), mat, { outline: 0.05 });
        f.scale.z = 0.45;
        const a = 0.55 + k * 0.38;
        f.rotation.z = sd * -a;
        f.position.set(sd * Math.sin(a) * 0.22 * size, Math.cos(a) * 0.22 * size, -k * 0.015);
        wing.add(f);
      }
    } else {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0);
      sh.lineTo(0.9, 0.55);
      sh.lineTo(1.05, 0.1);
      sh.quadraticCurveTo(0.85, 0.05, 0.8, -0.25);
      sh.quadraticCurveTo(0.6, -0.1, 0.5, -0.4);
      sh.quadraticCurveTo(0.35, -0.15, 0.2, -0.35);
      sh.lineTo(0, 0);
      const geo = new THREE.ShapeGeometry(sh);
      geo.scale(size * sd, size, 1);
      const membrane = part(geo, new THREE.MeshToonMaterial({ color, gradientMap: getToonGradient(), side: THREE.DoubleSide }), { outline: 0 });
      const bone = part(new THREE.CylinderGeometry(0.025, 0.02, 1.05 * size, 6), toon(look.primary), { outline: 0.1 });
      bone.rotation.z = sd * -Math.atan2(0.9, 0.55);
      bone.position.set(sd * 0.45 * size, 0.27 * size, 0.01);
      wing.add(membrane, bone);
    }
    wing.rotation.y = sd * -0.5;
    wing.userData.wing = sd;
    g.add(wing);
  }
  return g;
}

// Accessoires : écharpe, couronne, masque.
function buildAccessory(look, headR) {
  const g = new THREE.Group();
  if (look.accessory === 'scarf') {
    const ring = part(new THREE.TorusGeometry(0.24, 0.08, 8, 20), toon(look.accent));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.3;
    const tail = part(new THREE.BoxGeometry(0.14, 0.42, 0.05), toon(look.accent));
    tail.position.set(0.12, 1.1, -0.24);
    tail.rotation.set(0.25, 0, 0.15);
    tail.userData.scarf = true;
    g.add(ring, tail);
  } else if (look.accessory === 'crown') {
    const crown = new THREE.Group();
    const gold = toon(0xffcf4a, 0xffb422, 0.35);
    const band = part(new THREE.CylinderGeometry(0.24, 0.26, 0.1, 16, 1, true), gold, { outline: 0 });
    crown.add(band);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const spike = part(new THREE.ConeGeometry(0.045, 0.15, 6), gold, { outline: 0 });
      spike.position.set(Math.sin(a) * 0.24, 0.11, Math.cos(a) * 0.24);
      crown.add(spike);
    }
    const jewel = part(new THREE.OctahedronGeometry(0.05), toon(look.accent, look.accent, 1), { outline: 0 });
    jewel.position.set(0, 0.02, 0.26);
    crown.add(jewel);
    crown.position.y = 1.72 + headR * 0.92;
    crown.rotation.x = -0.12;
    g.add(crown);
  } else if (look.accessory === 'heroMask') {
    // Bandeau rouge sur les yeux
    const band = part(new THREE.SphereGeometry(headR * 1.0, 32, 8, Math.PI / 2 - 1.2, 2.4, Math.PI * 0.42, Math.PI * 0.19),
      toon(look.accent), { outline: 0, shadow: false });
    band.scale.set(1.025, 0.955, 0.99);
    band.position.y = 1.72;
    g.add(band);
  } else if (look.accessory === 'mask') {
    const mask = part(new THREE.SphereGeometry(headR * 1.0, 24, 8, Math.PI / 2 - 0.9, 1.8, Math.PI * 0.55, 0.42), toon(look.secondary), { outline: 0 });
    mask.position.y = 1.72;
    g.add(mask);
  }
  return g;
}

function buildShield(look) {
  const g = new THREE.Group();
  const disc = part(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 20), toon(look.secondary));
  disc.rotation.z = Math.PI / 2;
  const boss = part(new THREE.SphereGeometry(0.09, 12, 8), toon(look.accent, look.accent, 0.3), { outline: 0 });
  boss.position.x = -0.04;
  const rim = part(new THREE.TorusGeometry(0.3, 0.03, 6, 24), toon(0xd8dde8), { outline: 0 });
  rim.rotation.y = Math.PI / 2;
  g.add(disc, boss, rim);
  g.position.set(-0.08, -0.36, 0.05);
  return g;
}

// --- Rangs : la tenue devient dorée (Or) ou en cristal (Diamant) ---
const RANK_MATS = {
  or: {
    primary: () => new THREE.MeshStandardMaterial({ color: 0xf0b43c, metalness: 1, roughness: 0.26 }),
    secondary: () => new THREE.MeshStandardMaterial({ color: 0xe9a92e, metalness: 1, roughness: 0.3 }),
    pants: () => new THREE.MeshStandardMaterial({ color: 0xe6aa36, metalness: 1, roughness: 0.3 }),
    hair: () => new THREE.MeshStandardMaterial({ color: 0xffd25e, metalness: 1, roughness: 0.22 }),
    shoes: () => new THREE.MeshStandardMaterial({ color: 0xb87418, metalness: 1, roughness: 0.25 }),
  },
  diamant: {
    primary: () => crystal(0xdfeeff),
    secondary: () => crystal(0xd6e8ff),
    pants: () => crystal(0xd9eaff),
    hair: () => crystal(0xeef6ff),
    shoes: () => crystal(0xffffff, true),
  },
};
function crystal(color, dark = false) {
  return new THREE.MeshPhysicalMaterial({
    color, map: crystalTexture(dark), metalness: dark ? 0.6 : 0.15, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04,
    iridescence: 0.7, iridescenceIOR: 1.7, flatShading: true, envMapIntensity: 0.9,
  });
}
const sameColor = (a, b) => {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  return Math.abs(ca.r - cb.r) + Math.abs(ca.g - cb.g) + Math.abs(ca.b - cb.b) < 0.02;
};
function applyRank(root, look, rank) {
  const mats = RANK_MATS[rank];
  if (!mats) return;
  const parts = look.rankParts ?? ['primary', 'secondary', 'hair', ...(look.shoes ? ['shoes'] : []), ...(look.pants ? ['pants'] : [])];
  const cache = {};
  root.traverse((o) => {
    if (!o.isMesh || o.material === OUTLINE_MAT || !o.material.isMeshToonMaterial) return;
    for (const key of parts) {
      if (look[key] !== undefined && sameColor(o.material.color, look[key])) {
        const side = o.material.side;
        o.material.dispose();
        o.material = cache[key] ??= mats[key]();
        o.material.side = side;
        break;
      }
    }
  });
}
function buildSparkles(count) {
  const g = new THREE.Group();
  const spots = [[0.2, 1.1, 0.3], [-0.22, 0.95, 0.3], [0.32, 1.2, 0.1], [-0.15, 0.4, 0.15], [0.16, 0.25, 0.15], [-0.3, 2.1, 0.2], [0.25, 2.2, 0.25], [0.0, 2.3, 0.1], [-0.38, 1.0, 0.0]];
  for (let i = 0; i < Math.min(count, spots.length); i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.position.set(...spots[i]);
    sp.userData.phase = i * 1.7;
    g.add(sp);
  }
  return g;
}

/**
 * Crée un personnage 3D.
 * @returns {{ root: THREE.Group, update(t:number, dt:number):void, play(name:string):void, dispose():void }}
 */
export function createCharacter(def, { aura: withAura = true, weapon: equippedWeapon = null, skin: charSkin = null, weaponSkin = null, stance = 'rest' } = {}) {
  // Les paliers (Or, Diamant) ne changent plus l'apparence : le Striker garde toujours sa tenue d'origine
  // (ou son skin). Ils ne donnent que des bonus de statistiques.
  const rank = 'basique';
  // Personnage avec un modèle 3D dédié (plus détaillé que le générateur générique).
  if (def.model === 'claude') return createClaudeModel(def, { rank, weapon: equippedWeapon, skin: charSkin, weaponSkin, stance });
  if (STRIKER_SPECS[def.model]) return createHumanoidModel(STRIKER_SPECS[def.model], def, { rank, weapon: equippedWeapon, skin: charSkin, weaponSkin, stance });
  const { look } = def;
  const root = new THREE.Group();
  const body = new THREE.Group(); // tout sauf l'aura : ce groupe "respire" et sautille
  root.add(body);

  const skin = toon(look.skin);
  const primary = toon(look.primary);
  const secondary = toon(look.secondary);
  const accent = toon(look.accent, look.accent, 0.25);

  // Jambes
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * 0.15, 0.62, 0);
    const thigh = part(new THREE.CapsuleGeometry(0.11, 0.32, 4, 12), look.pants ? toon(look.pants) : secondary);
    thigh.position.y = -0.24;
    const boot = part(new THREE.CapsuleGeometry(0.13, 0.12, 4, 12), look.shoes ? toon(look.shoes) : primary);
    boot.position.set(0, -0.5, 0.04);
    boot.scale.z = 1.25;
    leg.add(thigh, boot);
    body.add(leg);
    legs.push(leg);
  }

  // Torse + ceinture
  const torso = part(new THREE.CylinderGeometry(0.27, 0.33, 0.62, 16), primary);
  torso.position.y = 0.92;
  const chest = part(new THREE.SphereGeometry(0.29, 16, 12), primary);
  chest.position.y = 1.16;
  chest.scale.set(1.05, 0.6, 0.9);
  const belt = part(new THREE.TorusGeometry(0.315, 0.045, 8, 24), accent, { outline: 0 });
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.72;
  const gem = part(new THREE.OctahedronGeometry(0.065), toon(look.accent, look.accent, 1), { outline: 0 });
  gem.position.set(0, 1.05, 0.29);
  body.add(torso, chest, belt, gem);

  // Bras (pivot à l'épaule)
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.38, 1.2, 0);
    const shoulder = part(new THREE.SphereGeometry(0.13, 12, 10), look.outfit === 'suit' ? primary : secondary);
    const upper = part(new THREE.CapsuleGeometry(0.075, 0.3, 4, 10), primary);
    upper.position.y = -0.22;
    const hand = part(new THREE.SphereGeometry(0.085, 12, 10), skin);
    hand.position.y = -0.45;
    arm.add(shoulder, upper, hand);
    arm.rotation.z = s * 0.18;
    body.add(arm);
    arms.push(arm);
  }
  const weapon = buildWeapon(look);
  weapon.position.set(0, -0.45, 0.04);
  arms[1].add(weapon); // main droite du personnage (côté +x)

  // Tête
  const headR = 0.46;
  const head = new THREE.Group();
  head.position.y = 1.72;
  const skull = part(new THREE.SphereGeometry(headR, 32, 24), skin);
  skull.scale.set(1, 0.95, 0.95);
  head.add(skull);
  const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(look.accent).multiplyScalar(0.55) });
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eyes = [];
  const masked = look.eyes === 'mask';
  for (const s of [-1, 1]) {
    if (masked) {
      // Yeux blancs à pupille noire, posés sur le masque (style des illustrations)
      const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), whiteMat);
      eye.scale.set(0.095, 0.085, 0.035);
      eye.position.set(s * 0.165, -0.02, headR * 1.0);
      eye.rotation.y = s * 0.32;
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), new THREE.MeshBasicMaterial({ color: 0x1a1214 }));
      pupil.position.set(-s * 0.18, -0.05, 0.75);
      eye.add(pupil);
      const brow = part(new THREE.CapsuleGeometry(0.022, 0.12, 4, 6), toon(look.hair), { outline: 0.15, shadow: false });
      brow.position.set(s * 0.165, 0.09, headR * 0.995);
      brow.rotation.set(0, s * 0.3, Math.PI / 2 + s * 0.38);
      head.add(eye, brow);
      eyes.push(eye);
      continue;
    }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), eyeMat);
    eye.scale.set(0.075, 0.11, 0.04);
    eye.position.set(s * 0.16, -0.04, headR * 0.9);
    eye.rotation.y = s * 0.3;
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), whiteMat);
    shine.position.set(-0.3, 0.35, 0.8);
    eye.add(shine);
    head.add(eye);
    eyes.push(eye);
    const blush = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16),
      new THREE.MeshBasicMaterial({ color: 0xff7a9a, transparent: true, opacity: 0.45, depthWrite: false }));
    blush.position.set(s * 0.25, -0.18, headR * 0.83);
    blush.rotation.y = s * 0.55;
    head.add(blush);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 6, 12, Math.PI), new THREE.MeshBasicMaterial({ color: 0x3a1a1a }));
  mouth.position.set(0, -0.2, headR * 0.92);
  mouth.rotation.z = Math.PI;
  head.add(mouth);
  const hair = buildHair(look, headR);
  head.add(hair);
  if (look.halo) {
    const halo = part(new THREE.TorusGeometry(0.3, 0.03, 8, 32), toon(look.accent, look.accent, 1.2), { outline: 0, shadow: false });
    halo.rotation.x = Math.PI / 2 - 0.2;
    halo.position.y = 0.62;
    if (withAura) halo.add(glowSprite(look.accent, 1.2)); // pas de lueur sur l'écran principal
    head.add(halo);
  }
  body.add(head);

  // Cape
  let cape = null;
  if (look.cape) {
    const capeGeo = new THREE.CylinderGeometry(0.36, 0.62, 1.15, 20, 6, true, Math.PI * 0.62, Math.PI * 0.76);
    capeGeo.translate(0, -0.575, 0);
    cape = part(capeGeo, new THREE.MeshToonMaterial({ color: look.secondary, gradientMap: getToonGradient(), side: THREE.DoubleSide }), { outline: 0 });
    cape.position.set(0, 1.3, -0.04);
    body.add(cape);
  }

  // Costume : chemise blanche, cravate rouge, revers, pochette, poignets de chemise.
  if (look.outfit === 'suit') {
    belt.visible = false;
    gem.visible = false;
    const shirtMat = toon(look.secondary);
    const shirt = part(new THREE.CylinderGeometry(0.0, 0.17, 0.42, 3, 1), shirtMat, { outline: 0, shadow: false });
    shirt.rotation.set(Math.PI, Math.PI / 6, 0);
    shirt.scale.set(1, 1, 0.25);
    shirt.position.set(0, 1.06, 0.285);
    const collar = part(new THREE.BoxGeometry(0.22, 0.06, 0.06), shirtMat, { outline: 0.05, shadow: false });
    collar.position.set(0, 1.27, 0.22);
    const tie = part(new THREE.CylinderGeometry(0.035, 0.06, 0.34, 4), toon(look.accent), { outline: 0.06, shadow: false });
    tie.position.set(0, 1.07, 0.315);
    tie.rotation.y = Math.PI / 4;
    tie.scale.z = 0.4;
    const knot = part(new THREE.SphereGeometry(0.04, 8, 6), toon(look.accent), { outline: 0, shadow: false });
    knot.position.set(0, 1.24, 0.3);
    const jacketMat = primary;
    const lapels = [];
    for (const sd of [-1, 1]) {
      const lapel = part(new THREE.BoxGeometry(0.06, 0.34, 0.03), jacketMat, { outline: 0.06, shadow: false });
      lapel.position.set(sd * 0.11, 1.1, 0.3);
      lapel.rotation.z = sd * 0.32;
      lapels.push(lapel);
    }
    const pocket = part(new THREE.BoxGeometry(0.08, 0.035, 0.02), toon(look.accent), { outline: 0, shadow: false });
    pocket.position.set(-0.2, 1.05, 0.29);
    pocket.rotation.y = -0.3;
    const hem = part(new THREE.CylinderGeometry(0.335, 0.36, 0.14, 16), jacketMat);
    hem.position.y = 0.66;
    body.add(shirt, collar, tie, knot, ...lapels, pocket, hem);
    arms.forEach((arm) => {
      const cuff = part(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 12), shirtMat, { outline: 0.04 });
      cuff.position.y = -0.39;
      arm.add(cuff);
    });
  }

  // Gabarit : 'stout' (trapu) ou 'slim' (élancé) change la largeur du corps.
  const bw = look.build === 'stout' ? 1.28 : look.build === 'slim' ? 0.84 : 1;
  if (bw !== 1) {
    for (const m of [torso, chest, belt]) { m.scale.x *= bw; if (m === belt) m.scale.y *= bw; else m.scale.z *= bw; }
    arms.forEach((a, i) => { a.position.x = (i ? 1 : -1) * 0.38 * bw; a.scale.setScalar(Math.sqrt(bw)); });
    legs.forEach((l, i) => { l.position.x = (i ? 1 : -1) * 0.15 * bw; l.scale.set(bw, look.build === 'stout' ? 0.92 : 1.05, bw); });
  }
  const ears = buildEars(look, headR);
  head.add(ears);
  const tails = buildTails(look);
  const wings = buildWings(look);
  const accessory = buildAccessory(look, headR);
  body.add(tails, wings, accessory);
  if (look.offhand === 'shield') arms[0].add(buildShield(look));

  const aura = withAura ? buildAura(def.rarity) : new THREE.Group();
  applyRank(body, look, rank);
  // Éclats fixés SUR la tenue diamant (ils scintillent sur place, ils ne volent pas autour)
  const sparkles = rank === 'diamant' ? buildSparkles(9) : new THREE.Group();
  body.add(sparkles);
  const updateSparkles = (t) => sparkles.children.forEach((sp) => {
    const k = Math.max(0, Math.sin(t * 2.2 + sp.userData.phase));
    sp.scale.setScalar(0.04 + k * k * 0.16);
    sp.material.opacity = k;
  });
  root.add(aura);

  // --- Animation ---
  let action = null; // { name, t }
  const tmp = new THREE.Vector3();

  function update(t, dt) {
    const breathe = Math.sin(t * 2.2);
    body.position.y = 0.02 + breathe * 0.025;
    torso.scale.set(1 + breathe * 0.015, 1, 1 + breathe * 0.015);
    head.rotation.z = Math.sin(t * 1.1) * 0.05;
    head.rotation.x = Math.sin(t * 0.7) * 0.04;
    arms[0].rotation.z = -0.18 - breathe * 0.05;
    arms[1].rotation.z = 0.18 + breathe * 0.05;
    arms[0].rotation.x = Math.sin(t * 1.1) * 0.08;
    arms[1].rotation.x = -0.25 + Math.sin(t * 1.1 + 1) * 0.06;
    legs[0].rotation.x = legs[1].rotation.x = 0;
    if (cape) cape.rotation.x = -0.12 - Math.sin(t * 1.6) * 0.06;

    // Clignement des yeux
    const blink = (t % 4.2) < 0.12 ? 0.15 : 1;
    eyes.forEach((e) => (e.scale.y = (masked ? 0.085 : 0.11) * blink));

    hair.traverse((o) => { if (o.userData.sway) o.rotation.z = o.userData.sway * (0.35 + Math.sin(t * 2) * 0.08); });
    tails.children.forEach((o) => { const d = o.userData.tail; o.rotation.z = d.base + Math.sin(t * 2.2 + d.phase) * 0.25; });
    wings.children.forEach((o) => { o.rotation.y = o.userData.wing * (-0.5 - Math.sin(t * 2.6) * 0.18); });
    accessory.traverse((o) => { if (o.userData.scarf) o.rotation.z = 0.15 + Math.sin(t * 2.4) * 0.12; });
    weapon.traverse((o) => {
      if (o.userData.spin) o.rotation.y = t * 1.5;
      if (o.userData.float) o.position.y = 0.32 + Math.sin(t * 2.4) * 0.06;
    });

    const pts = aura.userData.particles;
    if (pts) {
      const p = pts.geometry.attributes.position;
      const seeds = pts.userData.seeds;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) + dt * (0.25 + seeds[i] * 0.4);
        if (y > 2.4) y = 0;
        p.setY(i, y);
      }
      p.needsUpdate = true;
      pts.material.opacity = 0.6 + Math.sin(t * 3) * 0.2;
      aura.rotation.y = t * 0.3;
    }

    // Actions ponctuelles (réaction au toucher, apparition…)
    if (action) {
      action.t += dt;
      const k = action.t;
      if (action.name === 'jump') {
        const d = 0.6;
        const p = Math.min(k / d, 1);
        body.position.y += Math.sin(p * Math.PI) * 0.45;
        arms[0].rotation.z -= Math.sin(p * Math.PI) * 1.4;
        arms[1].rotation.z += Math.sin(p * Math.PI) * 1.4;
        legs[0].rotation.x = Math.sin(p * Math.PI) * 0.5;
        legs[1].rotation.x = -Math.sin(p * Math.PI) * 0.5;
        if (p >= 1) action = null;
      } else if (action.name === 'attack') {
        const d = 0.5;
        const p = Math.min(k / d, 1);
        const swing = Math.sin(p * Math.PI);
        arms[1].rotation.x = -0.25 - swing * 2.2;
        body.position.z = swing * 0.35;
        if (p >= 1) { action = null; body.position.z = 0; }
      } else if (action.name === 'hit') {
        const d = 0.4;
        const p = Math.min(k / d, 1);
        body.position.z = -Math.sin(p * Math.PI) * 0.25;
        tmp.set(Math.sin(k * 60) * 0.03 * (1 - p), 0, 0);
        body.position.x = tmp.x;
        if (p >= 1) { action = null; body.position.set(0, body.position.y, 0); }
      }
    }
  }

  function play(name) { action = { name, t: 0 }; }

  function dispose() {
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material !== OUTLINE_MAT) o.material.dispose();
    });
  }

  root.userData.def = def;
  return { root, update: (t, dt) => { update(t, dt); updateSparkles(t); }, play, dispose, def, rank };
}
