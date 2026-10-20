// Mains des Strikers (communes à tous les personnages détaillés).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const DEG = Math.PI / 180;
const cache = {};

// --- Mains -----------------------------------------------------------------------------------------
// Main stylisée d'un seul maillage : paume légèrement effilée vers le poignet, quatre doigts à trois
// phalanges (longueurs et épaisseurs différentes), pouce à deux phalanges posé sur une éminence charnue.
// Repère H : poignet en haut (+y), doigts vers le bas (−y), paume tournée vers +z, jointures le long de x.
// `side` : côté du pouce (−1 main droite, +1 main gauche).
export const HAND_WRIST = new THREE.Vector3(0, 0.075, 0);
const HAND_GRIP = new THREE.Vector3(0, -0.064, 0.064);   // centre du « tunnel » formé par les doigts (prise)
const HAND_POSES = {
  // poing fermé : doigts repliés dans la paume, pouce par-dessus les deuxièmes phalanges
  fist: { curls: [[80, 96, 62], [84, 98, 64], [84, 98, 64], [80, 96, 60]], thumb: [[-0.25, -0.95, 0.55, 0.055], [-1, -0.45, 0.35, 0.048]] },
  // prise d'une poignée : doigts enroulés autour, index allongé le long de l'arme, pouce de l'autre côté
  grip: { curls: [[24, 14, 6], [78, 94, 56], [80, 96, 58], [80, 94, 56]], thumb: [[-0.2, -0.9, 0.6, 0.052], [-0.6, -0.75, 0.3, 0.046]] },
};
const FINGERS = [
  { x: 0.058, y: -0.071, len: [0.047, 0.031, 0.025], r: 0.0205 },  // index
  { x: 0.019, y: -0.077, len: [0.051, 0.034, 0.027], r: 0.0215 },  // majeur
  { x: -0.02, y: -0.074, len: [0.048, 0.032, 0.025], r: 0.0205 },  // annulaire
  { x: -0.056, y: -0.065, len: [0.039, 0.026, 0.021], r: 0.0178 }, // auriculaire
];
export function handGeometry(pose, side) {
  const key = `hand:${pose}:${side}`;
  if (cache[key]) return cache[key];
  const P = HAND_POSES[pose];
  const parts = [];
  const put = (geo, pos, dir = null, sc = null) => {
    const m = new THREE.Matrix4();
    const q = dir ? new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir) : new THREE.Quaternion();
    m.compose(pos, q, sc ?? new THREE.Vector3(1, 1, 1));
    geo.applyMatrix4(m);
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    parts.push(geo.index ? geo.toNonIndexed() : geo);
  };
  // phalange : capsule de `a` vers a + d × len (les extrémités arrondies se recouvrent aux articulations)
  const bone = (a, d, len, r) => { put(new THREE.CapsuleGeometry(r, len, 5, 12), a.clone().addScaledVector(d, len / 2), d); return a.clone().addScaledVector(d, len); };
  // paume : bloc arrondi, plus étroit et plus fin au poignet
  const palm = new RoundedBoxGeometry(0.165, 0.15, 0.088, 5, 0.038);
  { const p = palm.attributes.position; for (let i = 0; i < p.count; i++) { const w = (p.getY(i) + 0.075) / 0.15; p.setX(i, p.getX(i) * (1 - 0.13 * w)); p.setZ(i, p.getZ(i) * (1 - 0.1 * w) + 0.004 * Math.cos(p.getX(i) * 18)); } palm.computeVertexNormals(); }
  put(palm, new THREE.Vector3(0, 0, 0));
  // doigts : flexion cumulée vers la paume (+z)
  FINGERS.forEach((f, i) => {
    let a = new THREE.Vector3(side * f.x, f.y, 0.004), c = 0;
    P.curls[i].forEach((deg, j) => {
      c += deg * DEG;
      const d = new THREE.Vector3(side * -0.04 * (i - 1.5) * (j === 0 ? 1 : 0), -Math.cos(c), Math.sin(c)).normalize();
      a = bone(a, d, f.len[j], f.r * (1 - 0.06 * j));
    });
  });
  // éminence du pouce (partie charnue de la paume) et pouce
  put(new THREE.SphereGeometry(1, 16, 12), new THREE.Vector3(side * 0.05, 0.006, 0.03), null, new THREE.Vector3(0.038, 0.052, 0.03));
  let t = new THREE.Vector3(side * 0.07, 0.024, 0.028);
  P.thumb.forEach(([x, y, z, len], j) => { t = bone(t, new THREE.Vector3(side * x, y, z).normalize(), len, j ? 0.0215 : 0.0235); });
  const geo = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  return (cache[key] = geo);
}
/**
 * Main dans le repère du coude : poignet posé au bout de la manchette (`wrist`), main dans l'axe de
 * l'avant-bras (`dir`), paume tournée au mieux vers `palmHint`.
 */
export function handOnArm(mat, side, wrist, dir, palmHint, { outline = (m) => m, scale = 1 } = {}) {
  const Y = dir.clone().negate();
  const Z = palmHint.clone().addScaledVector(Y, -palmHint.dot(Y)).normalize();
  const X = new THREE.Vector3().crossVectors(Y, Z);
  const g = new THREE.Group();
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  g.scale.setScalar(scale);
  g.position.copy(wrist).sub(HAND_WRIST.clone().multiplyScalar(scale).applyQuaternion(g.quaternion));
  g.add(outline(new THREE.Mesh(handGeometry('fist', side).clone(), mat)));
  return g;
}
/** Main qui tient l'arme par sa poignée (repère de l'arme : poignée inclinée le long de y, canon vers +z). */
export function handOnWeapon(mat, side, { outline = (m) => m, scale = 1 } = {}) {
  const g = new THREE.Vector3(0, Math.cos(-0.28), Math.sin(-0.28));          // axe de la poignée
  const Z = new THREE.Vector3(-side, 0, 0);                                    // paume contre la poignée
  const Y = new THREE.Vector3().crossVectors(Z, g);                            // vers le poignet (arrière)
  const M = new THREE.Matrix4().makeBasis(g, Y, Z);
  const hand = new THREE.Group();
  hand.quaternion.setFromRotationMatrix(M);
  hand.scale.setScalar(scale);
  hand.position.set(0, -0.01, -0.01).sub(HAND_GRIP.clone().applyMatrix4(M).multiplyScalar(scale));
  hand.add(outline(new THREE.Mesh(handGeometry('grip', side).clone(), mat)));
  return hand;
}


// ---------------------------------------------------------------------------------------------

/**
 * Met l'arme dans la main : orientation `rot` (repère du coude), poignée affinée là où les doigts se
 * referment, main qui tient la poignée, et l'ensemble placé pour que le poignet tombe sur `wrist`.
 */
export function gripWeapon(weaponModel, mat, side, wrist, rot, { outline, scale = 1 } = {}) {
  weaponModel.rotation.set(...rot);
  // la partie de la poignée cachée dans la main est affinée pour tenir dans les doigts repliés
  weaponModel.children.find((o) => o.userData.grip)?.scale.set(0.7, 1, 0.72);
  const grip = handOnWeapon(mat, side, { outline, scale });
  weaponModel.add(grip);
  weaponModel.userData.hand = grip;   // la main appartient au personnage (libérée avec lui)
  const w = HAND_WRIST.clone().multiplyScalar(scale).applyQuaternion(grip.quaternion).add(grip.position).applyEuler(weaponModel.rotation);
  weaponModel.position.copy(wrist).sub(w);
  return weaponModel;
}
