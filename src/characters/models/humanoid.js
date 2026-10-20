// Squelette commun des Strikers détaillés (même style et même interface que Claude).
// Chaque personnage est décrit par une « fiche » (models/strikers/*.js) : silhouette du buste, jambes,
// pose des bras, tête, visage peint, matières par palier, puis ses vêtements et sa coiffure (build / hair).
//
// Repère : +x = droite de l'écran, +y = haut, +z = vers la caméra. Pieds au sol (y = 0).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createWeaponModel, disposeWeaponModel } from '../weaponModels.js';
import {
  canvas, tex, cached, normalMap, fabricMap, hairStrands, outline, isOutlineMat, goldMat, crystalMat,
  limb, densify, hairLock, paintFront, frontToSphere, articulateLegs, createWalkCycle, createAnimator,
} from './kit.js';
import { handOnArm, gripWeapon } from '../hands.js';
import { seatShoe } from '../shoes.js';

// ---------------------------------------------------------------------------------------------
// Matières

/** Matière d'une pièce de tenue selon le palier : la matière Basique, ou or / cristal. */
export function tiered(rank, basic, { gold = 0xf0b43c, crystal = 0xdfeeff, dark = false, rough = 0.28, keepMap = true } = {}) {
  if (rank === 'or') {
    const m = goldMat(gold, rough);
    if (keepMap && basic.map) m.map = basic.map;
    return m;
  }
  if (rank === 'diamant') return crystalMat(crystal, dark);
  return basic;
}
/** Tissu : couleur + relief (+ motif éventuel). */
export function cloth(color, { kind = 'twill', map = null, rough = 0.8, ns = 0.35, metal = 0, env = 0.55 } = {}) {
  return new THREE.MeshStandardMaterial({ color, map, roughness: rough, metalness: metal, envMapIntensity: env, normalMap: normalMap(kind), normalScale: new THREE.Vector2(ns, ns) });
}
export function leather(color, { rough = 0.38, metal = 0.05 } = {}) {
  return new THREE.MeshStandardMaterial({ color, map: fabricMap('leather'), roughness: rough, metalness: metal, normalMap: normalMap('leather'), normalScale: new THREE.Vector2(0.25, 0.25) });
}
export function hairMat(rank, color, { gold = 0xffd25e, crystal = 0xeef6ff } = {}) {
  if (rank === 'or') return new THREE.MeshStandardMaterial({ color: gold, metalness: 1, roughness: 0.22, map: hairStrands() });
  if (rank === 'diamant') return crystalMat(crystal);
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, envMapIntensity: 0.45, map: hairStrands() });
}
export const plain = (color, rough = 0.6, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
export const glow = (color, intensity = 2.2) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });

// ---------------------------------------------------------------------------------------------
// Visage (dessiné vu de face dans le repère de la tête : centre 450,320 ; rayon 119 px)

/** Œil détaillé. side = -1 pour l'œil à gauche de l'image, +1 à droite (coin externe vers l'extérieur). */
export function drawEye(g, { x, y, side, w = 34, h = 26, iris = '#6b4426', irisR = 0, closed = false, lashes = false,
  lid = '#2a1612', slant = 0, look = 0, lidDrop = 0, liner = false } = {}) {
  g.save();
  g.translate(x, y);
  g.scale(side, 1);
  g.rotate(-slant);
  if (closed) {
    g.strokeStyle = lid; g.lineWidth = lashes ? 6 : 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-w, 2); g.quadraticCurveTo(0, h * 0.45, w, 0); g.stroke();
    if (lashes) { g.lineWidth = 3; for (const k of [0.45, 0.75]) { const px = -w + 2 * w * k; g.beginPath(); g.moveTo(px, h * 0.3); g.lineTo(px + 6, h * 0.62); g.stroke(); } }
    g.restore();
    return;
  }
  const top = -h * (1 - lidDrop);
  const shape = () => {
    g.beginPath();
    g.moveTo(-w, 2);
    g.bezierCurveTo(-w * 0.75, top * 1.05, w * 0.7, top * 1.1, w, -h * 0.12);
    g.bezierCurveTo(w * 0.8, h * 0.85, -w * 0.7, h * 0.9, -w, 2);
    g.closePath();
  };
  // blanc de l'œil, légèrement ombré sous la paupière
  shape();
  const wg = g.createLinearGradient(0, -h, 0, h); wg.addColorStop(0, '#d8d2d4'); wg.addColorStop(0.35, '#ffffff'); wg.addColorStop(1, '#f4f0f0');
  g.fillStyle = wg; g.fill();
  g.save(); shape(); g.clip();
  const R = irisR || h * 0.82;
  const ix = look * side, iy = 2;
  const ig = g.createRadialGradient(ix, iy + R * 0.25, R * 0.1, ix, iy, R);
  const c = new THREE.Color(iris);
  const light = '#' + c.clone().lerp(new THREE.Color(0xffffff), 0.35).getHexString();
  const dark = '#' + c.clone().multiplyScalar(0.45).getHexString();
  ig.addColorStop(0, light); ig.addColorStop(0.55, iris); ig.addColorStop(0.92, dark); ig.addColorStop(1, '#140c0c');
  g.fillStyle = ig; g.beginPath(); g.arc(ix, iy, R, 0, Math.PI * 2); g.fill();
  // stries de l'iris
  g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1.2;
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; g.beginPath(); g.moveTo(ix + Math.cos(a) * R * 0.4, iy + Math.sin(a) * R * 0.4); g.lineTo(ix + Math.cos(a) * R * 0.85, iy + Math.sin(a) * R * 0.85); g.stroke(); }
  g.fillStyle = '#0e0909'; g.beginPath(); g.arc(ix, iy, R * 0.42, 0, Math.PI * 2); g.fill();
  // ombre de la paupière sur l'œil
  const sg = g.createLinearGradient(0, -h, 0, -h * 0.2); sg.addColorStop(0, 'rgba(60,30,30,.45)'); sg.addColorStop(1, 'rgba(60,30,30,0)');
  g.fillStyle = sg; g.fillRect(-w, -h * 1.2, w * 2, h);
  // reflets
  g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.ellipse(ix - R * 0.38 * side, iy - R * 0.42, R * 0.26, R * 0.2, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(ix + R * 0.35 * side, iy + R * 0.38, R * 0.12, 0, Math.PI * 2); g.fill();
  g.restore();
  // paupière supérieure (plus épaisse au coin externe), cils
  g.strokeStyle = lid; g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = lashes ? 6.5 : 5;
  g.beginPath(); g.moveTo(-w - 1, 3); g.bezierCurveTo(-w * 0.75, top * 1.08, w * 0.7, top * 1.12, w + 2, -h * 0.14); g.stroke();
  if (lashes || liner) {
    g.fillStyle = lid;
    g.beginPath(); g.moveTo(w - 6, -h * 0.5); g.quadraticCurveTo(w + 10, -h * 0.4, w + (liner ? 18 : 12), -h * (liner ? 0.75 : 0.62)); g.quadraticCurveTo(w + 6, -h * 0.15, w - 2, -h * 0.05); g.fill();
  }
  if (lashes) {
    g.lineWidth = 2.6;
    for (const k of [0.55, 0.72, 0.88]) {
      const px = -w + 2 * w * k, py = top * (1 - Math.pow(2 * k - 1, 2)) * 0.95 - 1;
      g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + 6, py - 7, px + 11, py - 9); g.stroke();
    }
  }
  // pli de la paupière et ligne inférieure
  g.strokeStyle = 'rgba(120,60,50,.35)'; g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(-w * 0.6, top - 7); g.quadraticCurveTo(0, top * 1.35 - 6, w * 0.75, top * 0.75 - 6); g.stroke();
  g.strokeStyle = 'rgba(90,40,35,.5)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(-w * 0.55, h * 0.72); g.quadraticCurveTo(0, h * 0.98, w * 0.8, h * 0.45); g.stroke();
  g.restore();
}
/** Sourcil plein (forme effilée). */
export function drawBrow(g, { x, y, side, w = 40, t = 9, color = '#3a2414', angle = 0, arch = 6 }) {
  g.save();
  g.translate(x, y); g.scale(side, 1); g.rotate(-angle);
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(-w, t * 0.5);
  g.quadraticCurveTo(0, -arch - t * 0.6, w, -t * 0.1 + 3);
  g.quadraticCurveTo(w * 0.2, -arch + t * 0.4, -w, t * 0.5 + t);
  g.closePath(); g.fill();
  g.restore();
}
export function blush(g, x, y, r, color = '240,140,130', a = 0.35) {
  const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, `rgba(${color},${a})`); rg.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
}
/** Texture de peau (avec le visage) : base + dessin. */
export function faceTexture(key, skinColor, draw, closed) {
  return cached(`face:${key}:${closed}`, () => frontToSphere(paintFront((g) => draw(g, closed), 1024), 1024, skinColor));
}

// ---------------------------------------------------------------------------------------------
// Pièces réutilisables


// ---------------------------------------------------------------------------------------------
// Buste : profil de révolution (rayon, hauteur) à section elliptique (profondeur = depth × rayon)
export function torsoTools(profile, depth, hipY) {
  const radius = (y) => {
    if (y <= profile[0][1]) return profile[0][0];
    for (let i = 1; i < profile.length; i++) {
      const [r1, y1] = profile[i], [r0, y0] = profile[i - 1];
      if (y <= y1) return r0 + ((y - y0) / (y1 - y0)) * (r1 - r0);
    }
    return profile[profile.length - 1][0];
  };
  /** Plaque une forme dessinée dans le plan (x, y monde) sur le devant (dir = 1) ou le dos (dir = -1) du buste. */
  const conform = (geo, off = 0.005, { dir = 1, scale = 1 } = {}) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const r = radius(y) * scale;
      const k = Math.max(0, 1 - (x / r) ** 2);
      p.setZ(i, dir * (Math.sqrt(k) * r * depth + off + z));
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
    geo.translate(0, -hipY, 0);
    return geo;
  };
  /** Coque (vêtement) autour du buste : profil décalé, éventuellement ouvert devant (gap en radians). */
  const shell = (prof, { gap = 0, seg = 64, d = depth } = {}) => {
    const geo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y - hipY)), seg, gap / 2, Math.PI * 2 - gap);
    geo.scale(1, 1, d);
    geo.computeVertexNormals();
    return geo;
  };
  return { radius, conform, shell, depth };
}
/** Ajoute du volume (poitrine, pectoraux…) sur l'avant d'une géométrie : bosses gaussiennes. */
export function bulge(geo, bumps) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (z <= 0) continue;
    let d = 0;
    for (const { x: bx, y: by, amp, sx, sy } of bumps) d += amp * Math.exp(-(((x - bx) / sx) ** 2) - (((y - by) / sy) ** 2));
    p.setZ(i, z + d * Math.min(1, z / 0.05));
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}
/** Forme plane (densifiée) à plaquer ; extrudée si depth > 0. */
export function plate(pts, depth = 0, steps = 3) {
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = depth ? new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 6 }) : new THREE.ShapeGeometry(sh, 6);
  const d = mergeVertices(densify(geo, steps), 1e-5);
  d.computeVertexNormals();
  return d;
}
/** Tube le long de points (cordons, coutures en relief, câbles). */
export function tube(pts, r, mat, { seg = 24, radial = 8, closed = false, ol = 0 } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, r, radial, closed), mat);
  return ol ? outline(m, ol) : m;
}
/** Mèches -> maillages (avec contour fin). locks : [[pts, width, opts?], …] */
export function addLocks(group, locks, mat, ol = 0.45) {
  for (const [pts, w, o] of locks) group.add(outline(new THREE.Mesh(hairLock(pts, w, o), mat), ol));
  return group;
}

// ---------------------------------------------------------------------------------------------
/**
 * Crée un Striker à partir de sa fiche.
 * spec : { id, hipY, torso, depth, legs, feet, arms, head, neck, face, materials(rank, look), build(ctx), hair(ctx), idle? }
 */
export function createHumanoidModel(spec, def, { rank = 'basique', weapon = null, skin = null, weaponSkin = null, stance = 'rest' } = {}) {
  const m = spec.materials(rank, skin?.look ?? null);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const H = spec.hipY;
  const T = torsoTools(spec.torso, spec.depth, H);

  // --- Bassin + jambes (cuisse -> genou -> cheville) ---
  const L = spec.legs;
  const pelvis = outline(new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16), m[L.pelvisMat ?? L.mat]));
  pelvis.scale.set(...L.pelvis);
  pelvis.position.set(0, H, 0);
  // bas du corps (bassin + hanches) : pivote seul vers la direction de la course (pas chassés)
  const lower = new THREE.Group();
  body.add(lower);
  lower.add(pelvis);
  const legs = [];
  for (const sd of [-1, 1]) {
    const hip = [sd * L.hip[0], H + (L.hip[1] ?? 0), L.hip[2] ?? 0];
    const knee = [sd * L.knee[0], L.knee[1], L.knee[2]];
    const ankle = [sd * L.ankle[0], L.ankle[1], L.ankle[2]];
    const thigh = limb(hip, knee, L.r[0], L.r[1], m[L.mat], { seg: 28 });
    const shin = limb(knee, ankle, L.r[1], L.r[2], m[L.shinMat ?? L.mat], { cap: false, seg: 28 });
    body.add(thigh, shin);
    const leg = { thigh, shin, hip, knee, ankle, sd, r: L.r[2], mat: m[L.shinMat ?? L.mat] };
    legs.push(leg);
    const f = spec.feet;
    const foot = f.build(m, sd, { outline });
    // la chaussure est posée au sol, le centre de son ouverture exactement sous la cheville
    seatShoe(foot, { scale: f.scale ?? 1.2, rotY: sd * (f.rotY ?? 0.2), ankleY: ankle[1] });
    foot.position.add(new THREE.Vector3(...ankle));
    body.add(foot);
    leg.foot = foot;
  }

  // --- Haut du corps (pivot à la taille) ---
  const upper = new THREE.Group();
  upper.position.y = H;
  body.add(upper);
  const U = (y) => y - H;
  const torsoGeo = T.shell(spec.torso);
  if (spec.bumps) bulge(torsoGeo, spec.bumps.map((b) => ({ ...b, y: b.y - H })));
  const torsoMesh = outline(new THREE.Mesh(torsoGeo, m[spec.torsoMat ?? 'top']));
  upper.add(torsoMesh);

  // --- Bras ---
  const arms = [];
  const A = spec.arms;
  let weaponModel = null;
  for (const [i, p0] of A.poses.entries()) {
    // posture de combat (arène) : l'arme tenue devant, canon vers l'avant, dans l'axe des tirs
    // (mêmes proportions que Claude, mises à l'échelle de la longueur du bras de chaque Striker)
    let a = p0;
    if (i === 1 && stance === 'combat') {
      const v = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      const k = (v(p0.sh, p0.el) + v(p0.el, p0.fi)) / 0.66;
      a = { ...p0, el: [p0.sh[0] + 0.12 * k, p0.sh[1] - 0.31 * k, p0.sh[2] - 0.05 * k], fi: [p0.sh[0] + 0.05 * k, p0.sh[1] - 0.41 * k, p0.sh[2] + 0.33 * k] };
    }
    const shoulder = new THREE.Group();
    shoulder.position.set(a.sh[0], U(a.sh[1]), a.sh[2]);
    upper.add(shoulder);
    const rel = (p) => [p[0] - a.sh[0], p[1] - a.sh[1], p[2] - a.sh[2]];
    const ball = new THREE.Mesh(new THREE.SphereGeometry(A.r[0] * 1.02, 24, 16), m[A.upperMat]);
    ball.scale.set(1, 0.85, 0.92);
    shoulder.add(ball);
    shoulder.add(limb([0, 0, 0], rel(a.el), A.r[0], A.r[1], m[A.upperMat], { seg: 24 }));
    const elbow = new THREE.Group();
    elbow.position.set(...rel(a.el));
    shoulder.add(elbow);
    const fr = new THREE.Vector3(a.fi[0] - a.el[0], a.fi[1] - a.el[1], a.fi[2] - a.el[2]);
    const dir = fr.clone().normalize();
    const wrist = fr.clone().addScaledVector(dir, -0.1 * (A.hand ?? 1));
    elbow.add(limb([0, 0, 0], wrist.toArray(), A.r[1], A.r[2], m[A.foreMat ?? A.upperMat], { cap: false, seg: 24 }));
    // main détaillée (paume, doigts à trois phalanges, pouce) ; la main gauche tient l'arme par sa poignée
    const side = i ? 1 : -1, hs = A.hand ?? 1, handMat = m.hand ?? m.skinPlain;
    const wristPt = wrist.clone().addScaledVector(dir, 0.02 * hs);
    let hand;
    if (i === 1 && weapon) {
      weaponModel = gripWeapon(createWeaponModel(weapon, weaponSkin), handMat, 1, wristPt, stance === 'combat' ? [0, 0, 0] : [1.05, 0.3, 0], { outline: (o) => outline(o, 0.7), scale: hs });
      hand = weaponModel;
    } else {
      // poing sur la hanche (paume vers l'avant) ou bras le long du corps (paume vers la cuisse)
      const onHip = dir.x * side < -0.3;
      hand = handOnArm(handMat, side, wristPt, dir, onHip ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(-side, 0, 0), { outline: (o) => outline(o, 0.7), scale: hs });
    }
    elbow.add(hand);
    arms.push({ shoulder, elbow, hand, wrist, dir, pose: a, side, rest: shoulder.position.clone() });
  }

  // --- Cou + tête ---
  const Hd = spec.head;
  const neckPivot = new THREE.Group();
  neckPivot.position.y = U(Hd.neckY);
  upper.add(neckPivot);
  const neck = outline(new THREE.Mesh(new THREE.CylinderGeometry(spec.neck?.r ?? 0.1, (spec.neck?.r ?? 0.1) * 1.1, spec.neck?.h ?? 0.22, 20), m.skinPlain), 0.6);
  neck.position.y = 0.06;
  neckPivot.add(neck);
  const head = new THREE.Group();
  head.position.set(0, Hd.y - Hd.neckY, Hd.z ?? 0.03);
  head.scale.setScalar(Hd.scale ?? 1.1);
  neckPivot.add(head);
  const R = Hd.r;
  const skullGeo = new THREE.SphereGeometry(R, 64, 48);
  {
    const p = skullGeo.attributes.position;
    const jaw = Hd.jaw ?? 0.12, chin = Hd.chin ?? 0.05, [sx, sy, sz] = Hd.s ?? [1, 1.06, 0.96];
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const ny = y / R;
      if (ny < 0) { const k = -ny; x *= 1 + jaw * k * (1 - k) - (Hd.taper ?? 0) * k * k; z *= 1 - 0.08 * k; y *= 1 + chin * k; }
      p.setXYZ(i, x * sx, y * sy, z * sz);
    }
    skullGeo.computeVertexNormals();
  }
  const skull = outline(new THREE.Mesh(skullGeo, m.skin));
  head.add(skull);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(Hd.nose ?? 0.03, 16, 12), m.skinPlain);
  nose.scale.set(1.1, 0.8, 0.9);
  nose.position.set(0, Hd.noseY ?? -0.15, R * 0.93);
  head.add(nose);
  for (const sd of [-1, 1]) {
    const ear = outline(new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), m.skinPlain));
    ear.scale.set(0.05, 0.085, 0.065);
    ear.position.set(sd * R * 0.98 * (Hd.s?.[0] ?? 1), -0.07, -0.01);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), m.earInner ?? plain(0xd9967c, 0.7));
    inner.scale.set(0.5, 0.65, 0.55); inner.position.set(sd * 0.45, 0, 0.2);
    ear.add(inner);
    head.add(ear);
    (head.userData.ears ??= []).push(ear);
  }
  const hair = new THREE.Group();
  head.add(hair);

  const ctx = { THREE, m, rank, root, body, upper, U, H, T, arms, legs, head, hair, neckPivot, neck, skull, R, spec, anim: [] };
  spec.build?.(ctx);
  spec.hair?.(ctx);
  // jambes articulées (les vêtements posés sur les jambes suivent la cuisse ou le tibia)
  articulateLegs(body, legs, [lower, upper], lower);
  // chevilles : le pied pivote sous l'ourlet (il reste à peu près à plat pendant la course)
  for (const l of legs) {
    l.anklePivot = new THREE.Group();
    l.anklePivot.position.set(l.ankle[0] - l.knee[0], l.ankle[1] - l.knee[1], l.ankle[2] - l.knee[2]);
    l.kneePivot.add(l.anklePivot);
    body.updateMatrixWorld(true);
    l.anklePivot.attach(l.foot);
    // la jambe entre dans la chaussure : cheville arrondie sous le bas du tibia, prolongée jusqu'à la semelle
    // (pas de vide entre le bas de la jambe et le bord de la chaussure, même quand le pied pivote)
    const op = l.foot.userData.opening, sc = l.foot.scale.x;
    const depth = l.ankle[1] - 0.05 * sc;
    const rs = Math.min(l.r, op.r * sc);
    const joint = new THREE.Mesh(new THREE.SphereGeometry(l.r * 0.97, 20, 12), l.mat);
    const sock = outline(new THREE.Mesh(new THREE.CylinderGeometry(Math.min(l.r * 0.97, op.r * sc), rs, depth, 20, 1, true).translate(0, -depth / 2, 0), l.mat));
    l.anklePivot.add(joint, sock);
  }
  // course : cadence calée sur la longueur de jambe (mêmes réglages que Claude, jambe de 0,86)
  const walk = createWalkCycle({ style: 'run', rate: 13 * (0.86 / H), hip: 0.78, knee: 1.15, bounce: 0.055 * (H / 0.86), lean: 0.13, arms: [0.5, 0.08], twist: 0.09 });
  root.traverse((c) => { if (c.isMesh && !c.userData.outline && !c.userData.noShadow) c.castShadow = true; });

  // ---------------------------------------------------------------------------------------------
  // Animations : animateur commun (kit.js), le même que Claude ; les animations propres à la fiche
  // (cape, mèches, accessoires) s'ajoutent par-dessus.
  const animator = createAnimator({ body, lower, upper, neckPivot, hair, arms, legs }, {
    walk, showcase: stance !== 'combat', hasWeapon: !!weaponModel,
    blink: m.skinClosed ? { mat: m.skin, open: m.skin.map, closed: m.skinClosed } : null,
    extra: ctx.anim.length ? (t, dt) => { const b = Math.sin(t * (spec.idle?.breath ?? 2.2)); for (const f of ctx.anim) f(t, dt, b); } : null,
  });
  function dispose() {
    if (weaponModel) {
      const h = weaponModel.userData.hand;
      if (h) { weaponModel.remove(h); root.add(h); }
      weaponModel.parent?.remove(weaponModel); disposeWeaponModel(weaponModel);
    }
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      if (!isOutlineMat(o.material) && !o.userData.outline) o.material.dispose?.();
    });
  }
  return { root, ...animator, dispose, def, rank, weapon, skin };
}

export { rnd } from './kit.js';
export { paintFront, frontToSphere } from './kit.js';
export { canvas, tex, cached, normalMap, fabricMap, hairStrands, outline, goldMat, crystalMat, limb, densify, hairLock, RoundedBoxGeometry };
