// LE CLAUDE — modèle 3D dédié, construit d'après les illustrations de référence.
// Toutes les proportions ont été relevées sur l'illustration (tête, masque, yeux, épaules, bras,
// poings, jambes, chaussures) puis converties en unités de scène (hauteur totale ≈ 2,45).
//
// Repère : +x = droite de l'écran (main gauche du personnage), +y = haut, +z = vers la caméra.
// Rangs : 'basique' (costume bleu marine), 'or' (costume, cheveux, chaussures dorés), 'diamant' (cristal).
// Interface identique aux autres personnages : { root, update(t, dt), play(name), dispose() }.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { crystalTexture } from '../../render/textures.js';
import { createWeaponModel, disposeWeaponModel } from '../weaponModels.js';
import { createWalkCycle, createAnimator } from './kit.js';
import { oxford, seatShoe } from '../shoes.js';
import { handOnArm, gripWeapon } from '../hands.js';
// contour des mains reculé : pas de traits aux articulations des doigts
const handOutline = (mesh) => outline(mesh, 0.7, 0.006);

// ---------------------------------------------------------------------------------------------
// Conversion des mesures de l'illustration (pixels de la référence affichée à 896×1200) en scène.
const S = 0.002518;                  // 1 px de référence = 0,0025 unité (hauteur 973 px -> 2,45)
const W = (px, py) => [(px - 450) * S, (1075 - py) * S];
const HEAD = { x: 0, y: 1.915, z: 0.03, r: 0.3 };   // centre de la tête (référence : 450, 320)

// ---------------------------------------------------------------------------------------------
// Matériaux et textures procédurales (tout est dessiné par le code, aucune image).
const cache = {};
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, { repeat = null, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// Relief de laine fine -> normal map : grain très fin et non directionnel (pas de rayures diagonales
// visibles ni de moiré en mouvement), juste assez pour casser l'aspect plastique de près.
function fabricNormal() {
  if (cache.fabric) return cache.fabric;
  const N = 128;
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    h[y * N + x] = 0.5 + (rnd() - 0.5) * 0.3;
  }
  // lissage léger : grain doux plutôt que des pixels durs
  const sm = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let acc = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) acc += h[((y + dy + N) % N) * N + ((x + dx + N) % N)];
    sm[y * N + x] = acc / 9;
  }
  const [c, g] = canvas(N, N);
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const hx = sm[y * N + ((x + 1) % N)] - sm[y * N + ((x - 1 + N) % N)];
    const hy = sm[((y + 1) % N) * N + x] - sm[((y - 1 + N) % N) * N + x];
    const v = new THREE.Vector3(-hx * 2, -hy * 2, 1).normalize();
    const i = (y * N + x) * 4;
    img.data[i] = (v.x * 0.5 + 0.5) * 255; img.data[i + 1] = (v.y * 0.5 + 0.5) * 255; img.data[i + 2] = (v.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return (cache.fabric = tex(c, { repeat: [6, 6], srgb: false }));
}

// Coutures de la veste (UV du tour de buste : u = 0 devant, 0,5 dos ; v = 0 ourlet, 1 col)
function jacketDetail() {
  if (cache.jacket) return cache.jacket;
  const [c, g] = canvas(1024, 512);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 1024, 512);
  const line = (x0, y0, x1, y1, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
  // couture du dos + fente (en bas)
  line(512, 40, 512, 512, 3, 'rgba(0,0,0,.35)');
  line(518, 400, 518, 512, 5, 'rgba(0,0,0,.45)');
  // coutures latérales (discrètes)
  line(256, 60, 262, 512, 2, 'rgba(0,0,0,.18)');
  line(768, 60, 762, 512, 2, 'rgba(0,0,0,.18)');
  // pinces de taille devant
  line(150, 260, 160, 440, 2, 'rgba(0,0,0,.15)'); line(874, 260, 864, 440, 2, 'rgba(0,0,0,.15)');
  // ouverture de la veste sous le bouton (devant, bas)
  line(2, 380, 2, 512, 5, 'rgba(0,0,0,.5)'); line(1022, 380, 1022, 512, 5, 'rgba(0,0,0,.5)');
  // ourlet légèrement plus sombre
  const grd = g.createLinearGradient(0, 470, 0, 512); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,.28)');
  g.fillStyle = grd; g.fillRect(0, 470, 1024, 42);
  return (cache.jacket = tex(c));
}

// Plis du pantalon (UV cylindre : u = 0 devant)
function pantsDetail() {
  if (cache.pants) return cache.pants;
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 512, 512);
  // pli marqué devant et derrière
  for (const x of [3, 256, 509]) { g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 6; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 5, 0); g.lineTo(x + 5, 512); g.stroke(); }
  // cassure du pantalon sur la chaussure (bas)
  g.strokeStyle = 'rgba(0,0,0,.32)'; g.lineWidth = 5;
  for (const [y, a] of [[430, 18], [470, 12], [495, 8]]) { g.beginPath(); g.moveTo(-10, y); g.bezierCurveTo(128, y - a, 384, y + a, 522, y - 4); g.stroke(); }
  // plis au genou
  g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 3;
  for (const y of [230, 255]) { g.beginPath(); g.moveTo(40, y); g.bezierCurveTo(140, y - 14, 220, y + 10, 300, y - 4); g.stroke(); }
  return (cache.pants = tex(c));
}

// Mèches : ombrage stylisé lisse (aucun bruit, aucune strie qui scintille de loin).
// u fait le tour de la mèche (0,25 = face extérieure, 0,75 = dessous), v va de la racine (0) à la pointe (1).
function hairDetail() {
  if (cache.hair) return cache.hair;
  const [c, g] = canvas(64, 256);
  const img = g.createImageData(64, 256);
  for (let y = 0; y < 256; y++) {
    const v = 1 - y / 255;                       // la texture est retournée : haut du canevas = pointe
    for (let x = 0; x < 64; x++) {
      const u = x / 64;
      const d = (q) => Math.min(Math.abs(u - q), 1 - Math.abs(u - q));
      const top = Math.exp(-((d(0.25) / 0.13) ** 2));      // reflet doux sur le dessus de la mèche
      const under = Math.exp(-((d(0.75) / 0.2) ** 2));     // dessous dans l'ombre
      const root = Math.max(0, 1 - v / 0.38) ** 1.6;       // racines plus sombres
      const tip = Math.max(0, (v - 0.7) / 0.3);            // pointes un peu plus claires
      let k = 1 + 0.14 * top * (0.4 + 0.6 * v) + 0.08 * tip - 0.2 * under - 0.3 * root;
      k = Math.max(0.45, Math.min(1.12, k));
      const i = (y * 64 + x) * 4;
      img.data[i] = Math.min(255, 228 * k); img.data[i + 1] = Math.min(255, 228 * k); img.data[i + 2] = Math.min(255, 228 * k * (0.97 + 0.03 * k)); img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return (cache.hair = tex(c));
}

// Cuir des chaussures : grain + reflets
function leatherDetail() {
  if (cache.leather) return cache.leather;
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(60,30,10,${rnd() * 0.08})`; g.fillRect(rnd() * 256, rnd() * 256, 2, 2); }
  return (cache.leather = tex(c, { repeat: [2, 2] }));
}

// --- Visage : dessiné vu de face (comme l'illustration), puis reprojeté sur la sphère de la tête ---
// Coordonnées de dessin = pixels de la référence (centre de la tête : 450, 320 ; rayon : 119 px).
const FACE = { cx: 450, cy: 320, r: 119 };
function paintFront(drawFn, size = 1024) {
  const [c, g] = canvas(size, size);
  const k = size / 2 / FACE.r;
  g.setTransform(k, 0, 0, k, size / 2 - FACE.cx * k, size / 2 - FACE.cy * k);
  drawFn(g);
  return g.getImageData(0, 0, size, size);
}
// Reprojette une image "vue de face" sur la texture équirectangulaire d'une sphère (u = 0,25 devant).
function frontToSphere(front, size, W2 = 2048, H2 = 1024, base = null, coverage = 1.3) {
  const [c, g] = canvas(W2, H2);
  if (base) { g.fillStyle = base; g.fillRect(0, 0, W2, H2); }
  const out = g.getImageData(0, 0, W2, H2);
  for (let y = 0; y < H2; y++) {
    const theta = (y / H2) * Math.PI;
    const sy = Math.cos(theta), st = Math.sin(theta);
    for (let x = 0; x < W2; x++) {
      const phi = (x / W2) * Math.PI * 2; // SphereGeometry : X = -cos(phi) sinθ, Z = sin(phi) sinθ
      const X = -Math.cos(phi) * st, Z = Math.sin(phi) * st;
      if (Z < 0.05) continue;
      // projection orthographique (avec léger étalement sur les côtés pour couvrir les tempes)
      const fx = X, fy = sy;
      const px = Math.round((fx * 0.5 + 0.5) * (size - 1)), py = Math.round((-fy * 0.5 + 0.5) * (size - 1));
      if (px < 0 || py < 0 || px >= size || py >= size) continue;
      const si = (py * size + px) * 4, di = (y * W2 + x) * 4;
      const a = front.data[si + 3] / 255;
      if (!a) continue;
      for (let ch = 0; ch < 3; ch++) out.data[di + ch] = out.data[di + ch] * (1 - a) + front.data[si + ch] * a;
      out.data[di + 3] = Math.max(out.data[di + 3], front.data[si + 3]);
    }
  }
  g.putImageData(out, 0, 0);
  return c;
}

const SKIN = '#f3bf9a';
function drawEyes(g, closed) {
  for (const e of [{ x: 397, px: 404 }, { x: 510, px: 494 }]) {
    if (closed) {
      g.strokeStyle = '#3a1a14'; g.lineWidth = 5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(e.x - 36, 342); g.quadraticCurveTo(e.x, 352, e.x + 36, 340); g.stroke();
      continue;
    }
    // blanc de l'œil (forme en amande, haut plus plat)
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(e.x - 40, 340);
    g.bezierCurveTo(e.x - 34, 312, e.x + 34, 310, e.x + 41, 336);
    g.bezierCurveTo(e.x + 36, 368, e.x - 34, 370, e.x - 40, 340);
    g.fill();
    // pupille noire verticale
    g.fillStyle = '#1c1416';
    g.beginPath(); g.ellipse(e.px, 343, 9.5, 20, 0, 0, Math.PI * 2); g.fill();
    // trait de paupière supérieure, plus épais au coin externe
    g.strokeStyle = '#2a1414'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(e.x - 40, 338); g.bezierCurveTo(e.x - 30, 313, e.x + 30, 311, e.x + 42, 334); g.stroke();
  }
}
function skinTexture(closed) {
  const key = closed ? 'skinClosed' : 'skin';
  if (cache[key]) return cache[key];
  const front = paintFront((g) => {
    // joues légèrement rosées
    for (const x of [372, 528]) { const rg = g.createRadialGradient(x, 392, 0, x, 392, 34); rg.addColorStop(0, 'rgba(240,140,130,.35)'); rg.addColorStop(1, 'rgba(240,140,130,0)'); g.fillStyle = rg; g.fillRect(x - 40, 350, 80, 80); }
    drawEyes(g, closed);
    // ombre sous le nez
    g.fillStyle = 'rgba(190,110,90,.55)';
    g.beginPath(); g.ellipse(452, 386, 15, 5, 0, 0, Math.PI * 2); g.fill();
    // sourire en coin (remonte à droite)
    g.strokeStyle = '#6b2f25'; g.lineWidth = 4.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(410, 406); g.bezierCurveTo(440, 414, 470, 410, 494, 396); g.stroke();
    g.strokeStyle = 'rgba(150,70,55,.4)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(436, 418); g.quadraticCurveTo(452, 424, 466, 417); g.stroke();
    // fossette
    g.strokeStyle = 'rgba(120,60,45,.55)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(492, 392); g.quadraticCurveTo(500, 398, 497, 404); g.stroke();
  });
  return (cache[key] = tex(frontToSphere(front, 1024, 2048, 1024, SKIN)));
}
// --- Crâne et masque ---------------------------------------------------------------------------
// Forme du crâne : sphère légèrement allongée, mâchoire un peu plus carrée, menton arrondi.
// La même fonction sert au crâne et au masque, qui l'épouse donc exactement.
function skullDeform(x, y, z) {
  const ny = y / HEAD.r;
  if (ny < 0) { const k = -ny; x *= 1 + 0.12 * k * (1 - k); z *= 1 - 0.08 * k; y *= 1 + 0.05 * k; }
  return [x, y * 1.06, z * 0.96];
}
const DEG = Math.PI / 180;
/** Point du crâne dans la direction (lacet, tangage) en degrés, à `scale` × rayon. */
function skullPoint(yaw, pitch, scale = 1, out = new THREE.Vector3()) {
  const r = HEAD.r, cp = Math.cos(pitch * DEG);
  const [x, y, z] = skullDeform(Math.sin(yaw * DEG) * cp * r, Math.sin(pitch * DEG) * r, Math.cos(yaw * DEG) * cp * r);
  return out.set(x * scale, y * scale, z * scale);
}
/** Position d'un point dessiné « vu de face » (pixels de la référence) en angles sur le crâne. */
function pxToAngles(px, py) {
  const X = (px - FACE.cx) / FACE.r, Y = (FACE.cy - py) / FACE.r;
  const z = Math.sqrt(Math.max(1e-4, 1 - X * X - Y * Y));
  return [Math.atan2(X, z) / DEG, Math.asin(Math.max(-1, Math.min(1, Y))) / DEG];
}
// Trou d'un œil (même tracé que le blanc de l'œil peint sur la peau, un peu plus large), en angles.
function eyeHole(x) {
  const path = new THREE.Path();
  path.moveTo(x - 46, 340);
  path.bezierCurveTo(x - 38, 304, x + 38, 302, x + 47, 335);
  path.bezierCurveTo(x + 42, 376, x - 38, 378, x - 46, 340);
  return path.getSpacedPoints(48).slice(0, -1).map(({ x: px, y: py }) => new THREE.Vector2(...pxToAngles(px, py)));
}
// Contour extérieur du masque, dessiné directement sur le crâne (angles) : il s'enroule proprement
// jusqu'aux tempes au lieu d'être une image projetée qui se déchire sur les côtés.
const MASK_OUTER = new THREE.SplineCurve([
  [0, 26.5], [18, 29.5], [40, 28], [60, 21], [72, 11], [75, -1], [72, -14], [64, -26], [50, -35], [34, -38], [20, -34], [10, -26], [3, -21.5],
  [-3, -21.5], [-10, -26], [-20, -34], [-34, -38], [-50, -35], [-64, -26], [-72, -14], [-75, -1], [-72, 11], [-60, 21], [-40, 28], [-18, 29.5], [0, 26.5],
].map(([a, b]) => new THREE.Vector2(a, b)));
function maskOutline() {
  if (cache.maskOutline) return cache.maskOutline;
  const outer = MASK_OUTER.getSpacedPoints(132).slice(0, -1);
  const holes = [eyeHole(397), eyeHole(510)];
  return (cache.maskOutline = { outer, holes });
}
// Peinture du masque en coordonnées d'angles (u : lacet −90..90°, v : tangage −45..45°)
const MASK_UV = { u: (yaw) => (yaw + 90) / 180, v: (pitch) => (pitch + 45) / 90 };
function maskPaint() {
  if (cache.maskPaint) return cache.maskPaint;
  const Wc = 2048, Hc = 1024;
  const [c, g] = canvas(Wc, Hc);
  const X = (yaw) => MASK_UV.u(yaw) * Wc, Y = (pitch) => (1 - MASK_UV.v(pitch)) * Hc;
  const lg = g.createLinearGradient(0, Y(30), 0, Y(-38));
  lg.addColorStop(0, '#e83a40'); lg.addColorStop(0.55, '#d6252e'); lg.addColorStop(1, '#bb1b24');
  g.fillStyle = lg; g.fillRect(0, 0, Wc, Hc);
  const { outer, holes } = maskOutline();
  const trace = (pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo : g.moveTo).call(g, X(p.x), Y(p.y))); g.closePath(); };
  // liseré sombre le long de tous les bords (le bord géométrique tombe au milieu du trait)
  g.lineJoin = 'round';
  g.strokeStyle = '#8c1219'; g.lineWidth = 22;
  trace(outer); g.stroke();
  for (const h of holes) { trace(h); g.stroke(); }
  // reflet doux en haut du masque
  g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 16; g.lineCap = 'round';
  g.beginPath(); g.moveTo(X(-52), Y(19)); g.quadraticCurveTo(X(-28), Y(25.5), X(-6), Y(23)); g.stroke();
  // sourcils blonds, inclinés vers le centre (air déterminé)
  const brow = (pts) => {
    g.beginPath(); pts.forEach(([px, py], i) => { const [a, b] = pxToAngles(px, py); (i ? g.lineTo : g.moveTo).call(g, X(a), Y(b)); }); g.closePath();
    g.fillStyle = '#f6dc8e'; g.fill(); g.strokeStyle = '#8a5a2a'; g.lineWidth = 5; g.lineJoin = 'round'; g.stroke();
  };
  brow([[364, 296], [392, 290], [434, 312], [431, 322], [394, 306], [366, 306]]);
  brow([[466, 312], [508, 290], [536, 296], [534, 306], [506, 306], [469, 322]]);
  return (cache.maskPaint = tex(c));
}
/**
 * Masque en vrai volume : surface qui épouse le crâne (subdivisée finement) + tranche tout autour
 * (bord extérieur et trous des yeux). Bords nets à toutes les distances, aucune transparence.
 */
function maskGeometries(lift = 1.03, base = 0.99) {
  const { outer, holes } = maskOutline();
  const tris = THREE.ShapeUtils.triangulateShape(outer, holes);
  const all = [...outer, ...holes.flat()];
  // subdivision par l'arête la plus longue jusqu'à ce que chaque arête fasse moins de 4,5° (≈ 1,5 cm)
  const stack = tris.map(([a, b, c]) => [all[a], all[b], all[c]]);
  const fine = [];
  while (stack.length) {
    const t = stack.pop();
    const e = [t[0].distanceTo(t[1]), t[1].distanceTo(t[2]), t[2].distanceTo(t[0])];
    const i = e.indexOf(Math.max(...e));
    if (e[i] < 4.5) { fine.push(t); continue; }
    const A = t[i], B = t[(i + 1) % 3], C = t[(i + 2) % 3], M = A.clone().add(B).multiplyScalar(0.5);
    stack.push([A, M, C], [M, B, C]);
  }
  const P = new THREE.Vector3(), Pa = new THREE.Vector3(), Pb = new THREE.Vector3(), n = new THREE.Vector3();
  const normalAt = (yaw, pitch, scale) => {
    skullPoint(yaw + 0.3, pitch, scale, Pa).sub(skullPoint(yaw - 0.3, pitch, scale, P));
    skullPoint(yaw, pitch + 0.3, scale, Pb).sub(skullPoint(yaw, pitch - 0.3, scale, P));
    return n.crossVectors(Pa, Pb).normalize();
  };
  // surface : on oriente chaque triangle vers l'extérieur (sens de la normale du crâne)
  const pos = [], nor = [], uv = [];
  const push = (v, scale) => { skullPoint(v.x, v.y, scale, P); pos.push(P.x, P.y, P.z); const q = normalAt(v.x, v.y, scale); nor.push(q.x, q.y, q.z); uv.push(MASK_UV.u(v.x), MASK_UV.v(v.y)); };
  const tri = new THREE.Triangle(), tn = new THREE.Vector3(), a3 = new THREE.Vector3(), b3 = new THREE.Vector3(), c3 = new THREE.Vector3();
  for (let [A, B, C] of fine) {
    tri.set(skullPoint(A.x, A.y, lift, a3), skullPoint(B.x, B.y, lift, b3), skullPoint(C.x, C.y, lift, c3)).getNormal(tn);
    if (tn.dot(a3) < 0) [B, C] = [C, B];
    push(A, lift); push(B, lift); push(C, lift);
  }
  const cap = new THREE.BufferGeometry();
  cap.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  cap.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  cap.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  // tranche : bandes entre le crâne et la surface du masque, normales tournées vers l'extérieur de la forme
  const wpos = [], wnor = [];
  const inPoly = (pt, poly) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  };
  const inMask = (pt) => inPoly(pt, outer) && !holes.some((h) => inPoly(pt, h));
  for (const pts of [outer, ...holes]) {
    // normale 2D de chaque point, tournée vers l'extérieur du masque
    const N2 = pts.map((p, i) => {
      const d = pts[(i + 1) % pts.length].clone().sub(pts[(i - 1 + pts.length) % pts.length]).normalize();
      const o = new THREE.Vector2(d.y, -d.x);
      return inMask(p.clone().addScaledVector(o, 0.4)) ? o.negate() : o;
    });
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      const q = [[pts[i], base], [pts[j], base], [pts[j], lift], [pts[i], base], [pts[j], lift], [pts[i], lift]];
      const want = new THREE.Vector3();
      for (const [p, sc] of q) {
        skullPoint(p.x, p.y, sc, P);
        const o = N2[pts.indexOf(p)];
        skullPoint(p.x + o.x * 0.5, p.y + o.y * 0.5, sc, Pa).sub(P).normalize();
        wpos.push(P.x, P.y, P.z); wnor.push(Pa.x, Pa.y, Pa.z);
      }
      // orientation des deux triangles selon la normale voulue
      const L = wpos.length;
      for (const off of [18, 9]) {
        const k = L - off;
        a3.fromArray(wpos, k); b3.fromArray(wpos, k + 3); c3.fromArray(wpos, k + 6);
        want.fromArray(wnor, k);
        tri.set(a3, b3, c3).getNormal(tn);
        if (tn.dot(want) < 0) for (let ch = 0; ch < 3; ch++) { const t1 = wpos[k + 3 + ch]; wpos[k + 3 + ch] = wpos[k + 6 + ch]; wpos[k + 6 + ch] = t1; const t2 = wnor[k + 3 + ch]; wnor[k + 3 + ch] = wnor[k + 6 + ch]; wnor[k + 6 + ch] = t2; }
      }
    }
  }
  const wall = new THREE.BufferGeometry();
  wall.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
  wall.setAttribute('normal', new THREE.Float32BufferAttribute(wnor, 3));
  return { cap, wall };
}

// --- Tube lisse (manches, jambes) ----------------------------------------------------------------
/**
 * Tube le long d'une courbe, sans couture ni marche : repères à transport parallèle (aucune torsion),
 * u = 0 tourné vers l'avant (+z), normales analytiques (pas de ligne sur la jointure de l'uv).
 * radius(t) : rayon le long de la courbe (t = 0 au départ, 1 à l'arrivée). v = 1 − t.
 */
function tubeAlong(curve, radius, { segs = 40, ring = 28 } = {}) {
  const pos = [], nor = [], uv = [], idx = [], ts = [];
  const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), R = new THREE.Vector3();
  const fwd = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, C);
    curve.getTangentAt(t, T).normalize();
    if (i === 0) N.copy(fwd).addScaledVector(T, -fwd.dot(T)).normalize();
    else N.addScaledVector(T, -N.dot(T)).normalize();
    B.crossVectors(N, T).normalize();
    const r = radius(t), dr = (radius(Math.min(1, t + 0.01)) - radius(Math.max(0, t - 0.01))) / (0.02 * curve.getLength());
    for (let j = 0; j <= ring; j++) {
      const a = (j / ring) * Math.PI * 2;
      R.copy(N).multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
      pos.push(C.x + R.x * r, C.y + R.y * r, C.z + R.z * r);
      const n = R.clone().addScaledVector(T, -dr).normalize();
      nor.push(n.x, n.y, n.z);
      uv.push(j / ring, 1 - t);
      ts.push(t);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < ring; j++) {
    const a = i * (ring + 1) + j, b = a + ring + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.userData.t = ts;
  return geo;
}
/** Bras plié : segment droit, arrondi au coude (rayon `fillet`), segment droit. */
function bentPath(a, b, c, fillet = 0.07) {
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), Cv = new THREE.Vector3(...c);
  const d1 = Bv.clone().sub(A), d2 = Cv.clone().sub(Bv);
  const f = Math.min(fillet, d1.length() * 0.4, d2.length() * 0.4);
  const p1 = Bv.clone().addScaledVector(d1.normalize(), -f), p2 = Bv.clone().addScaledVector(d2.normalize(), f);
  const path = new THREE.CurvePath();
  path.add(new THREE.LineCurve3(A, p1));
  path.add(new THREE.QuadraticBezierCurve3(p1, Bv, p2));
  path.add(new THREE.LineCurve3(p2, Cv));
  return path;
}

// Contour « dessin animé » : coque inversée gonflée le long des normales.
// - Compatible avec les maillages à squelette (jambes) : la coque suit exactement la déformation.
// - `push` recule la coque vers l'arrière (repère caméra) : elle reste visible sur la silhouette, mais
//   disparaît entre deux surfaces très proches (mèches de cheveux qui se chevauchent, plis), là où elle
//   produisait des traits cassés et irréguliers.
const OUTLINE_COLOR = 0x2a1912;
const OUTLINE_W = 0.0065;
const outlineVariants = new Map();
function outlineMaterial(width = 1, push = 0) {
  const key = `${width}:${push}`;
  if (!outlineVariants.has(key)) {
    outlineVariants.set(key, new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(OUTLINE_COLOR) }, uWidth: { value: OUTLINE_W * width }, uPush: { value: push } },
      vertexShader: `
#include <common>
#include <skinning_pars_vertex>
uniform float uWidth;
uniform float uPush;
void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec4 mv = modelViewMatrix * vec4(transformed + normalize(objectNormal) * uWidth, 1.0);
  if (uPush > 0.0) { if (isPerspectiveMatrix(projectionMatrix)) mv.xyz += normalize(mv.xyz) * uPush; else mv.z -= uPush; }
  gl_Position = projectionMatrix * mv;
}`,
      fragmentShader: 'uniform vec3 uColor;\nvoid main(){\n  gl_FragColor = vec4(uColor, 1.0);\n  #include <colorspace_fragment>\n}',
      side: THREE.BackSide,
    }));
  }
  return outlineVariants.get(key);
}
const isOutline = (m) => [...outlineVariants.values()].includes(m);
// Géométrie de la coque : sommets soudés et normales moyennées. Sur les formes à arêtes vives (cravate,
// revers, nœud…) la coque reste continue : plus de contour en pointillés aux angles.
function hullGeometry(geo) {
  if (geo.index && !geo.userData.weld) return geo; // sphères, tubes, boîtes arrondies… : déjà continues
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', geo.attributes.position.clone());
  if (geo.index) g.setIndex(geo.index.clone());
  const merged = mergeVertices(g, 1e-5);
  merged.computeVertexNormals();
  g.dispose();
  return merged;
}
function outline(mesh, width = 1, push = 0) {
  const o = mesh.isSkinnedMesh ? new THREE.SkinnedMesh(mesh.geometry, outlineMaterial(width, push)) : new THREE.Mesh(hullGeometry(mesh.geometry), outlineMaterial(width, push));
  o.userData.outline = true;
  if (mesh.isSkinnedMesh) o.frustumCulled = false;
  mesh.add(o);
  return mesh;
}

// ---------------------------------------------------------------------------------------------
// Matériaux par rang
// facettes plus fines que sur les autres personnages (comme l'illustration Diamant)
function fineCrystal(dark) {
  const key = dark ? 'crystalD' : 'crystalL';
  if (!cache[key]) { cache[key] = crystalTexture(dark).clone(); cache[key].repeat.set(2.6, 2.6); cache[key].needsUpdate = true; }
  return cache[key];
}
function rankMaterials(rank, look = null) {
  const fabric = fabricNormal();
  const suitNavy = { color: 0x1b2042, roughness: 0.8, metalness: 0, envMapIntensity: 0.55, normalMap: fabric, normalScale: new THREE.Vector2(0.25, 0.25) };
  const gold = (color, rough = 0.28) => new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: rough, normalMap: fabric, normalScale: new THREE.Vector2(0.15, 0.15) });
  const crystal = (color, dark = false) => new THREE.MeshPhysicalMaterial({
    color, map: fineCrystal(dark), metalness: dark ? 0.6 : 0.15, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04,
    iridescence: 0.7, iridescenceIOR: 1.7, flatShading: true, envMapIntensity: 0.9,
  });
  const m = {};
  if (rank === 'or') {
    m.jacket = gold(0xf0b43c); m.jacket.map = jacketDetail();
    m.pants = gold(0xe6aa36, 0.32); m.pants.map = pantsDetail();
    m.sleeve = gold(0xeeb13a);
    m.hair = new THREE.MeshStandardMaterial({ color: 0xffd25e, metalness: 1, roughness: 0.22, map: hairDetail() });
    m.shoe = new THREE.MeshStandardMaterial({ color: 0xc27a1c, metalness: 1, roughness: 0.22, map: leatherDetail() });
    m.sole = new THREE.MeshStandardMaterial({ color: 0x8a5410, metalness: 1, roughness: 0.3 });
  } else if (rank === 'diamant') {
    m.jacket = crystal(0xdfeeff); m.pants = crystal(0xd9eaff); m.sleeve = m.jacket;
    m.hair = crystal(0xeef6ff); m.shoe = crystal(0xffffff, true); m.sole = crystal(0xffffff, true);
  } else {
    m.jacket = new THREE.MeshStandardMaterial({ ...suitNavy, map: jacketDetail() });
    m.pants = new THREE.MeshStandardMaterial({ ...suitNavy, color: 0x181c3a, map: pantsDetail() });
    m.sleeve = new THREE.MeshStandardMaterial({ ...suitNavy });
    m.hair = new THREE.MeshStandardMaterial({ color: 0xe6ac3a, roughness: 0.55, envMapIntensity: 0.45, map: hairDetail() });
    m.shoe = new THREE.MeshStandardMaterial({ color: 0x7c4322, roughness: 0.36, metalness: 0.05, map: leatherDetail() });
    m.sole = new THREE.MeshStandardMaterial({ color: 0x3a2014, roughness: 0.6 });
  }
  // skin de personnage (palier Basique uniquement : en Or / Diamant la tenue du palier est prioritaire)
  if (look && rank === 'basique') {
    if (look.jacket !== undefined) { m.jacket.color.set(look.jacket); m.sleeve.color.set(look.jacket); }
    if (look.pants !== undefined) m.pants.color.set(look.pants);
  }
  // revers et rabats : même matière que la veste, sans les coutures dessinées
  m.lapel = m.jacket.clone();
  if (rank !== 'diamant') m.lapel.map = null;
  m.skin = new THREE.MeshStandardMaterial({ color: 0xffffff, map: skinTexture(false), roughness: 0.62 });
  m.skinPlain = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.62 });
  m.mask = new THREE.MeshStandardMaterial({ map: maskPaint(), roughness: 0.38, metalness: 0, envMapIntensity: 0.7 });
  m.maskEdge = new THREE.MeshStandardMaterial({ color: 0x7a0e15, roughness: 0.5 });
  m.hairCap = new THREE.MeshStandardMaterial({ color: new THREE.Color(m.hair.color).multiplyScalar(0.8), roughness: m.hair.roughness, metalness: m.hair.metalness, envMapIntensity: 0.4 });
  m.shirt = new THREE.MeshStandardMaterial({ color: 0xf3f5ff, roughness: 0.7, normalMap: fabric, normalScale: new THREE.Vector2(0.15, 0.15) });
  m.red = new THREE.MeshStandardMaterial({ color: 0xe1222c, roughness: 0.45, normalMap: fabric, normalScale: new THREE.Vector2(0.2, 0.2) });
  m.tie = look?.tie !== undefined ? new THREE.MeshStandardMaterial({ color: look.tie, roughness: 0.45, normalMap: fabric, normalScale: new THREE.Vector2(0.2, 0.2) }) : m.red;
  m.square = look?.square !== undefined ? new THREE.MeshStandardMaterial({ color: look.square, roughness: 0.45 }) : m.red;
  m.dark = new THREE.MeshStandardMaterial({ color: 0x14172e, roughness: 0.8 });
  m.lace = new THREE.MeshStandardMaterial({ color: rank === 'basique' ? 0x4a2412 : 0x6b4a20, roughness: 0.5 });
  return m;
}

// ---------------------------------------------------------------------------------------------
// Buste : profil de révolution (rayon, hauteur), section elliptique (profondeur = 0,62 × rayon)
const TORSO = [[0.325, 0.8], [0.295, 0.92], [0.285, 1.02], [0.315, 1.16], [0.355, 1.3], [0.385, 1.4], [0.375, 1.47], [0.31, 1.52], [0.19, 1.555], [0.12, 1.575]];
const DEPTH = 0.62;
// profil lissé (spline) : volumes continus, sans arête aux points du profil (épaules, taille)
const TORSO_SMOOTH = new THREE.SplineCurve(TORSO.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(44).map((v) => [v.x, v.y]);
function torsoRadius(y) {
  const P = TORSO_SMOOTH;
  if (y <= P[0][1]) return P[0][0];
  for (let i = 1; i < P.length; i++) {
    const [r1, y1] = P[i], [r0, y0] = P[i - 1];
    if (y <= y1) return r0 + ((y - y0) / (y1 - y0)) * (r1 - r0);
  }
  return P[P.length - 1][0];
}
// Plaque une géométrie (dessinée dans le plan x,y) sur le devant du buste, avec un décalage.
// Les faces avant et arrière (revers, cravate, chemise…) prennent la normale exacte du buste : ombrage
// parfaitement lisse, sans les facettes qui donnaient des traits blancs irréguliers sur les revers.
function torsoNormal(x, y, out) {
  const r = torsoRadius(y), dr = (torsoRadius(y + 0.03) - torsoRadius(y - 0.03)) / 0.06;
  const z = Math.sqrt(Math.max(0, 1 - (x / r) ** 2)) * r * DEPTH;
  return out.set(x / (r * r), -dr / r, z / (r * r * DEPTH * DEPTH)).normalize();
}
function conform(geo, offset) {
  const p = geo.attributes.position;
  // faces à plat (avant / arrière) repérées avant la déformation
  const flat = !geo.index ? new Int8Array(p.count) : null;
  if (flat) {
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
      n.crossVectors(b.sub(a), c.sub(a)).normalize();
      const sg = Math.abs(n.z) > 0.9 ? Math.sign(n.z) : 0;
      flat[i] = flat[i + 1] = flat[i + 2] = sg;
    }
  }
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = torsoRadius(y);
    const k = Math.max(0, 1 - (x / r) ** 2);
    p.setZ(i, Math.sqrt(k) * r * DEPTH + offset + z);
  }
  p.needsUpdate = true;
  if (!geo.index || !geo.attributes.normal) geo.computeVertexNormals(); // formes arrondies : normales d'origine
  if (flat) {
    const nAttr = geo.attributes.normal, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      if (!flat[i]) continue;
      torsoNormal(p.getX(i), p.getY(i), v).multiplyScalar(flat[i]);
      nAttr.setXYZ(i, v.x, v.y, v.z);
    }
    nAttr.needsUpdate = true;
  }
  return geo;
}
function shapeGeo(points, depth = 0, bevel = 0) {
  const sh = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = depth ? new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 }) : new THREE.ShapeGeometry(sh, 8);
  // subdivision horizontale pour bien épouser la courbure
  return geo;
}
// Densifie une géométrie plane (pour le placage sur une surface courbe)
function densify(geo, steps = 3) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (let s = 0; s < steps; s++) {
    const p = g.attributes.position;
    const out = [];
    for (let i = 0; i < p.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(p, i), b = new THREE.Vector3().fromBufferAttribute(p, i + 1), c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
      const ab = a.clone().add(b).multiplyScalar(0.5), bc = b.clone().add(c).multiplyScalar(0.5), ca = c.clone().add(a).multiplyScalar(0.5);
      for (const t of [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]]) for (const v of t) out.push(v.x, v.y, v.z);
    }
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  }
  g.computeVertexNormals();
  return g;
}

// Mèche de cheveux : tube effilé et aplati qui suit une courbe (base -> pointe)
function hairLock(p0, p1, p2, width, { flat = 0.46, segs = 20, ring = 16 } = {}) {
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(...p0), new THREE.Vector3(...p1), new THREE.Vector3(...p2));
  const pos = [], uv = [], idx = [];
  const c = new THREE.Vector3(), T = new THREE.Vector3(), R = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPoint(t, c);
    curve.getTangent(t, T);
    R.copy(c).normalize(); // direction radiale (depuis le centre de la tête)
    side.crossVectors(T, R).normalize();
    up.crossVectors(side, T).normalize();
    const w = width * Math.pow(1 - Math.pow(t, 1.8), 0.7) * (0.85 + 0.15 * Math.min(1, t * 5)) + 0.003; // mèche large, pointe effilée
    for (let j = 0; j <= ring; j++) {
      const a = (j / ring) * Math.PI * 2;
      const sx = Math.cos(a) * w, sy = Math.sin(a) * w * flat;
      pos.push(c.x + side.x * sx + up.x * sy, c.y + side.y * sx + up.y * sy, c.z + side.z * sx + up.z * sy);
      uv.push(j / ring, t);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < ring; j++) {
    const a = i * (ring + 1) + j, b = a + ring + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.userData.weld = true; // la jointure de l'anneau tombe sur le bord de la mèche : coque soudée
  return geo;
}

// Mèches (repère de la tête : centre = 0, rayon ≈ 0,30). Relevées sur la silhouette de l'illustration :
// grosse touffe sur le dessus, volume balayé vers la droite, pointes sur les côtés, frange sur le masque.
// Chevelure : mèches qui partent du sommet du crâne et retombent tout autour (comme l'illustration),
// + épis sur le dessus pour la silhouette. Repère de la tête (rayon ≈ 0,30, avant = +z).
function buildLocks() {
  const locks = [];
  const N = 18;
  const deg = Math.PI / 180;
  for (let i = 0; i < N; i++) {
    const a = -Math.PI + (i / N) * Math.PI * 2 + 0.09;
    const front = Math.cos(a), side = Math.abs(Math.sin(a));
    // angle depuis le sommet où se trouve la pointe : frange sur le haut du masque, côtés bouffants, nuque
    const phi = (66 + 7 * Math.max(front, 0) + 50 * Math.max(-front, 0) + 7 * Math.sin(i * 1.9) * Math.max(-front, 0)) * deg;
    const R = (front > -0.35 ? 0.35 + 0.13 * side : 0.355 + 0.03 * side) + 0.025 * Math.sin(i * 2.7); // longueurs irrégulières
    const tip = [R * Math.sin(phi) * Math.sin(a), R * Math.cos(phi), R * Math.sin(phi) * Math.cos(a)];
    if (front > 0.4) tip[0] -= 0.1 * front; // frange balayée vers la gauche
    const pc = phi * 0.55, Rc = 0.375;
    const ctrl = [Rc * Math.sin(pc) * Math.sin(a), Rc * Math.cos(pc), Rc * Math.sin(pc) * Math.cos(a)];
    const base = [0.06 * Math.sin(a), 0.25, 0.06 * Math.cos(a) - 0.03]; // départ sous le cuir chevelu : aucun anneau visible au sommet
    const w = front > 0.5 ? 0.21 : front < -0.5 ? 0.24 : 0.2;
    locks.push([base, ctrl, tip, w]);
  }
  // épis et volume du dessus (silhouette de l'illustration)
  locks.push(
    [[0.0, 0.25, 0.0], [-0.07, 0.45, 0.02], [-0.17, 0.55, -0.02], 0.17],
    [[0.03, 0.25, -0.06], [0.0, 0.45, -0.1], [-0.08, 0.5, -0.17], 0.16],
    [[0.03, 0.25, 0.04], [0.14, 0.46, 0.05], [0.24, 0.52, 0.0], 0.18],
    [[0.06, 0.25, -0.05], [0.26, 0.43, -0.07], [0.38, 0.43, -0.09], 0.17],
    [[0.04, 0.25, 0.08], [0.26, 0.39, 0.1], [0.43, 0.33, 0.03], 0.17],
    [[-0.05, 0.25, 0.05], [-0.25, 0.37, 0.05], [-0.38, 0.37, -0.01], 0.16],
    // grosses mèches de frange qui retombent sur le masque
    [[0.08, 0.26, 0.1], [0.16, 0.24, 0.33], [0.22, 0.06, 0.31], 0.17],
    [[0.0, 0.26, 0.1], [-0.1, 0.24, 0.33], [-0.2, 0.08, 0.31], 0.17],
    // devant des oreilles (tempes) : plus de vide de profil
    [[-0.2, 0.22, 0.06], [-0.32, 0.12, 0.1], [-0.31, -0.03, 0.08], 0.12],
    [[0.2, 0.22, 0.06], [0.32, 0.12, 0.1], [0.31, -0.03, 0.08], 0.12],
    [[-0.22, 0.2, -0.04], [-0.34, 0.08, -0.02], [-0.33, -0.06, -0.04], 0.12],
    [[0.22, 0.2, -0.04], [0.34, 0.08, -0.02], [0.33, -0.06, -0.04], 0.12],
  );
  return locks;
}
const LOCKS = buildLocks();

// Poses des bras. 'rest' : pose de l'illustration (poing sur la hanche, arme le long du corps).
// 'combat' (arène) : même poing sur la hanche, mais l'arme est tenue devant, canon vers l'avant, dans
// l'axe des tirs.
const ARM_POSES = {
  rest: [
    { sh: [-0.35, 1.45, 0.0], el: [-0.6, 1.2, -0.04], fi: [-0.34, 1.0, 0.13] },
    { sh: [0.35, 1.45, 0.0], el: [0.48, 1.1, -0.02], fi: [0.46, 0.79, 0.07], weaponRot: [1.05, 0.3, 0] }, // arme baissée le long de la jambe
  ],
  combat: [
    { sh: [-0.35, 1.45, 0.0], el: [-0.6, 1.2, -0.04], fi: [-0.34, 1.0, 0.13] },
    { sh: [0.35, 1.45, 0.0], el: [0.47, 1.14, -0.05], fi: [0.4, 1.04, 0.33], weaponRot: [0, 0, 0] },
  ],
};

// Course de Claude (vitesse en arène ≈ 5 unités du modèle / s ; jambe ≈ 0,86 de la hanche au sol) :
// foulée ≈ 2 × 0,86 × sin(0,78) ≈ 1,2 par pas, soit ≈ 2 cycles / s -> 13 rad/s.
const RUN = { style: 'run', rate: 13, hip: 0.78, knee: 1.15, bounce: 0.055, lean: 0.13, arms: [0.5, 0.08], twist: 0.09 };

export function createClaudeModel(def, { rank = 'basique', weapon = null, skin = null, weaponSkin = null, stance = 'rest' } = {}) {
  const m = rankMaterials(rank, skin?.look ?? null);
  const root = new THREE.Group();
  const body = new THREE.Group(); // saut, respiration
  root.add(body);
  const shadowCast = (o) => o.traverse((c) => { if (c.isMesh && !c.userData.outline) c.castShadow = true; });

  // --- Jambes (pantalon large) + bassin ---
  // Chaque jambe est un seul tube continu (hanche -> ourlet) déformé par deux os (cuisse, tibia) :
  // le genou plie sans cassure ni ligne de raccord, le contour suit la déformation.
  const pelvis = outline(new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16), m.pants));
  pelvis.scale.set(0.28, 0.1, 0.19);
  pelvis.position.set(0, 0.86, 0);
  // bas du corps (bassin + os des jambes) : peut pivoter seul vers la direction de déplacement
  const lower = new THREE.Group();
  body.add(lower);
  lower.add(pelvis);
  const legs = [];
  for (const sd of [-1, 1]) {
    const hip = [sd * 0.16, 0.86, 0], ankle = [sd * 0.245, 0.27, 0.04];
    const knee = [sd * 0.2025, 0.565, 0.02];
    const hipBone = new THREE.Bone();
    hipBone.position.set(...hip);
    const kneeBone = new THREE.Bone();
    kneeBone.position.set(knee[0] - hip[0], knee[1] - hip[1], knee[2] - hip[2]);
    hipBone.add(kneeBone);
    lower.add(hipBone);
    // jambe de pantalon droite, à peine marquée au genou, légèrement évasée vers l'ourlet
    // l'ourlet descend un peu sous la cheville et se pose sur la chaussure (cassure du pantalon)
    const hemEnd = new THREE.Vector3(...ankle).sub(new THREE.Vector3(...hip)).normalize().multiplyScalar(0.05).add(new THREE.Vector3(...ankle));
    const geo = tubeAlong(new THREE.LineCurve3(new THREE.Vector3(...hip), hemEnd),
      (t) => 0.149 + 0.014 * t - 0.005 * Math.exp(-(((t - 0.5) / 0.14) ** 2)), { segs: 36, ring: 28 });
    const sIdx = [], sW = [];
    for (const t of geo.userData.t) {
      const w = THREE.MathUtils.smoothstep(t, 0.4, 0.6);   // zone de pliure autour du genou
      sIdx.push(0, 1, 0, 0); sW.push(1 - w, w, 0, 0);
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sIdx, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sW, 4));
    const leg = new THREE.SkinnedMesh(geo, m.pants);
    leg.frustumCulled = false;
    body.add(leg);
    body.updateMatrixWorld(true);
    leg.bind(new THREE.Skeleton([hipBone, kneeBone]));
    outline(leg);
    leg.children[0].bind(leg.skeleton, leg.bindMatrix);
    // cheville (pivot du pied, cachée sous l'ourlet) + fond de l'ourlet (aucun vide visible)
    const anklePivot = new THREE.Group();
    anklePivot.position.set(ankle[0] - knee[0], ankle[1] - knee[1], ankle[2] - knee[2]);
    kneeBone.add(anklePivot);
    const hem = new THREE.Mesh(new THREE.CircleGeometry(0.16, 28).rotateX(Math.PI / 2), m.dark);
    hem.position.set(hemEnd.x - knee[0], hemEnd.y - knee[1] + 0.004, hemEnd.z - knee[2]);
    kneeBone.add(hem);
    // richelieu cognac : bout golf perforé, trépointe surpiquée, lacets fins (characters/shoes.js) ;
    // le centre de son ouverture est exactement sous la cheville, pointe légèrement tournée vers l'extérieur
    const sh = seatShoe(oxford({ color: 0x9a5426, sole: 0x2b170e, lace: 0x2a140a, outline: (o) => outline(o, 0.8, 0.004) }), { scale: 1.22, rotY: sd * 0.2, ankleY: ankle[1] });
    anklePivot.add(sh);
    // chaussette sombre : de la cheville jusqu'à la semelle, à l'intérieur de la chaussure
    const sockR = Math.min(0.11, sh.userData.opening.r * 1.22), sockH = ankle[1] - 0.05;
    anklePivot.add(new THREE.Mesh(new THREE.CylinderGeometry(sockR, sockR, sockH + 0.03, 20, 1, true).translate(0, -sockH / 2, 0), m.dark));
    legs.push({ sd, hip, knee, hipPivot: hipBone, kneePivot: kneeBone, anklePivot, foot: sh, mesh: leg });
  }

  // --- Haut du corps (pivot à la taille pour la respiration / les attaques) ---
  const upper = new THREE.Group();
  upper.position.y = 0.86;
  body.add(upper);
  const U = (y) => y - 0.86; // conversion hauteur monde -> repère du haut du corps

  // Veste (tour de buste)
  const lathe = new THREE.LatheGeometry(TORSO_SMOOTH.map(([r, y]) => new THREE.Vector2(r, U(y))), 64);
  lathe.scale(1, 1, DEPTH);
  lathe.computeVertexNormals();
  const jacket = outline(new THREE.Mesh(lathe, m.jacket));
  upper.add(jacket);
  const conformU = (geo, off) => { conform(geo, off); geo.translate(0, -0.86, 0); return geo; }; // formes dessinées en coordonnées monde

  // Chemise blanche (V), col, cravate, revers, pochette, poches, bouton
  // plastron de chemise : reste sur le buste (le haut s'arrête sous le menton, sans plonger sous la veste)
  const shirt = new THREE.Mesh(conformU(densify(shapeGeo([[-0.1, 1.556], [0.1, 1.556], [0.0, 0.995]]), 4), 0.004), m.shirt);
  upper.add(shirt);
  // pointes du col : posées sur la chemise, elles glissent sous les revers (cachées dans leur épaisseur)
  for (const sd of [-1, 1]) {
    const pts = [[sd * 0.03, 1.552], [sd * 0.095, 1.556], [sd * 0.074, 1.462]];
    const collar = outline(new THREE.Mesh(conformU(densify(new THREE.ExtrudeGeometry(new THREE.Shape((sd > 0 ? pts : [...pts].reverse()).map(([x, y]) => new THREE.Vector2(x, y))), { depth: 0.004, bevelEnabled: false }), 3), 0.011), m.shirt), 0.6);
    upper.add(collar);
  }
  const knot = outline(new THREE.Mesh(conformU(new RoundedBoxGeometry(0.07, 0.058, 0.028, 4, 0.013).translate(0, 1.522, 0.014), 0.016), m.tie), 0.8);
  const blade = outline(new THREE.Mesh(conformU(densify(new THREE.ExtrudeGeometry(new THREE.Shape([[-0.026, 1.5], [0.026, 1.5], [0.05, 1.08], [0.0, 1.03], [-0.05, 1.08]].map(([x, y]) => new THREE.Vector2(x, y))), { depth: 0.012, bevelEnabled: false }), 2), 0.014), m.tie), 0.8);
  upper.add(knot, blade);
  for (const sd of [-1, 1]) {
    // revers cranté : bord intérieur le long du V, cran au niveau du col
    const pts = [[sd * 0.1, 1.585], [sd * 0.2, 1.53], [sd * 0.165, 1.47], [sd * 0.265, 1.405], [sd * 0.045, 1.0], [sd * 0.012, 1.0], [sd * 0.07, 1.36]];
    const lp = sd > 0 ? pts : [...pts].reverse();
    const lapel = outline(new THREE.Mesh(conformU(densify(new THREE.ExtrudeGeometry(new THREE.Shape(lp.map(([x, y]) => new THREE.Vector2(x, y))), { depth: 0.014, bevelEnabled: false }), 2), 0.006), m.lapel), 0.9);
    upper.add(lapel);
  }
  const square = outline(new THREE.Mesh(conformU(densify(new THREE.ExtrudeGeometry(new THREE.Shape([[0.19, 1.29], [0.3, 1.29], [0.26, 1.345]].map(([x, y]) => new THREE.Vector2(x, y))), { depth: 0.01, bevelEnabled: false }), 2), 0.008), m.square), 0.7);
  const slit = new THREE.Mesh(conformU(densify(shapeGeo([[0.18, 1.285], [0.31, 1.285], [0.31, 1.275], [0.18, 1.275]]), 2), 0.009), m.dark);
  upper.add(square, slit);
  for (const sd of [-1, 1]) {
    const flap = outline(new THREE.Mesh(conformU(densify(new THREE.ExtrudeGeometry(new THREE.Shape([[sd * 0.17, 0.99], [sd * 0.31, 0.985], [sd * 0.305, 0.94], [sd * 0.175, 0.945]].map(([x, y]) => new THREE.Vector2(x, y))), { depth: 0.012, bevelEnabled: false }), 2), 0.004), m.lapel), 0.8);
    upper.add(flap);
  }
  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 16), m.dark);
  button.rotation.x = Math.PI / 2;
  button.position.set(0.03, U(1.0), torsoRadius(1.0) * DEPTH + 0.012);
  upper.add(button);
  // col de la veste derrière la nuque
  const backCollar = outline(new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.035, 10, 32, Math.PI * 1.25), m.jacket));
  backCollar.rotation.set(Math.PI / 2 + 0.25, 0, Math.PI * 0.125 + Math.PI);
  backCollar.scale.set(1, 0.8, 1);
  backCollar.position.set(0, U(1.575), -0.02);
  upper.add(backCollar);

  // --- Bras (épaule -> coude -> main) ---
  let weaponModel = null;
  // Manche d'un seul tenant de l'épaule au poignet, coude arrondi : aucune jointure visible.
  const arms = [];
  const ARM = ARM_POSES[stance] ?? ARM_POSES.rest;
  for (const [i, a] of ARM.entries()) {
    const shoulder = new THREE.Group();
    shoulder.position.set(a.sh[0], U(a.sh[1]), a.sh[2]);
    upper.add(shoulder);
    const rel = (p) => [p[0] - a.sh[0], p[1] - a.sh[1], p[2] - a.sh[2]];
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.112, 24, 16), m.sleeve);
    pad.scale.set(1.0, 0.75, 0.9);
    pad.position.set(-Math.sign(a.sh[0]) * 0.015, 0.0, 0);
    shoulder.add(pad);
    const el = new THREE.Vector3(...rel(a.el)), fi = new THREE.Vector3(...rel(a.fi));
    const dir = fi.clone().sub(el).normalize();
    const cuffPoint = fi.clone().addScaledVector(dir, -0.11);
    const path = bentPath([0, 0, 0], el.toArray(), cuffPoint.toArray(), 0.075);
    const L1 = el.length(), L = path.getLength();
    const sleeve = outline(new THREE.Mesh(tubeAlong(path, (t) => {
      const s = t * L;                                              // distance depuis l'épaule
      return s < L1 ? 0.112 - 0.012 * (s / L1) : 0.1 - 0.006 * ((s - L1) / (L - L1));
    }, { segs: 40, ring: 24 }), m.sleeve));
    shoulder.add(sleeve);
    const elbow = new THREE.Group();
    elbow.position.copy(el);
    shoulder.add(elbow);
    const cuffLocal = cuffPoint.clone().sub(el);
    const cuff = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.05, 24), m.shirt));
    cuff.position.copy(cuffLocal).addScaledVector(dir, 0.01);
    cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    elbow.add(cuff);
    // main : le poignet commence juste au bout de la manchette
    const wristPt = cuffLocal.clone().addScaledVector(dir, 0.02);
    let hand;
    if (i === 1 && weapon) {
      // l'arme est tenue par sa poignée ; on la place pour que le poignet tombe au bout de la manchette
      weaponModel = gripWeapon(createWeaponModel(weapon, weaponSkin), m.skinPlain, 1, wristPt, a.weaponRot, { outline: handOutline });
      elbow.add(weaponModel);
      hand = weaponModel;
    } else {
      hand = handOnArm(m.skinPlain, i ? 1 : -1, wristPt, dir, new THREE.Vector3(...(a.palm ?? (i ? [-1, 0, 0] : [0, 0, 1]))), { outline: handOutline });
      elbow.add(hand);
    }
    arms.push({ shoulder, elbow, hand, rest: shoulder.position.clone(), pose: a });
  }

  // --- Tête (pivot à la base du cou) ---
  const neckPivot = new THREE.Group();
  neckPivot.position.y = U(1.55);
  upper.add(neckPivot);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.2, 20), m.skinPlain);
  neck.position.y = 0.06;
  neckPivot.add(neck);
  const head = new THREE.Group();
  head.position.set(HEAD.x, HEAD.y - 1.55, HEAD.z);
  head.scale.setScalar(1.1); // tête un peu plus grosse, comme sur l'illustration
  neckPivot.add(head);
  // crâne : sphère déformée (mâchoire un peu plus carrée, menton arrondi)
  const skullGeo = new THREE.SphereGeometry(HEAD.r, 64, 48);
  {
    const p = skullGeo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, ...skullDeform(p.getX(i), p.getY(i), p.getZ(i)));
    skullGeo.computeVertexNormals();
  }
  const skull = outline(new THREE.Mesh(skullGeo, m.skin));
  head.add(skull);
  // masque : vrai volume posé sur le crâne (surface + tranche sombre)
  const maskGeos = cache.maskGeos ?? (cache.maskGeos = maskGeometries());
  const mask = new THREE.Mesh(maskGeos.cap.clone(), m.mask);
  mask.add(new THREE.Mesh(maskGeos.wall.clone(), m.maskEdge));
  head.add(mask);
  // nez : petit volume arrondi qui sort du visage juste sous le pont du masque (posé sur la peau)
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), m.skinPlain);
  nose.scale.set(0.034, 0.028, 0.03);
  skullPoint(0.5, -29, 0.965, nose.position);
  head.add(nose);
  // oreilles : ourlet en « C » ouvert vers l'avant, conque plus foncée, lobe ; collées au crâne
  const earDeep = new THREE.MeshStandardMaterial({ color: 0xdb9c80, roughness: 0.7 });
  for (const sd of [-1, 1]) {
    const ear = new THREE.Group();
    skullPoint(sd * 88, -13, 0.985, ear.position);
    ear.rotation.y = sd * Math.PI / 2;           // le plan de l'oreille est tourné vers l'extérieur
    ear.rotation.x = 0.12;                        // légèrement inclinée vers l'arrière
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), m.skinPlain);
    shell.scale.set(0.048, 0.07, 0.022);
    shell.position.z = 0.004;
    const rim = outline(new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.0145, 10, 28, Math.PI * 1.55), m.skinPlain), 0.7);
    rim.rotation.z = sd > 0 ? Math.PI * 0.72 : Math.PI * 0.72;
    rim.scale.set(1, 1.35, 1);
    rim.position.z = 0.016;
    const concha = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), earDeep);
    concha.scale.set(0.026, 0.04, 0.008);
    concha.position.set(-0.004, -0.004, 0.02);
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), m.skinPlain);
    lobe.scale.set(0.022, 0.026, 0.016);
    lobe.position.set(0.008, -0.05, 0.008);       // fondu dans le bas de l'oreille
    ear.add(shell, rim, concha, lobe);
    ear.scale.setScalar(1.22);
    head.add(ear);
  }
  // cheveux : calotte + mèches
  const capGeo = new THREE.SphereGeometry(HEAD.r * 1.03, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.55);
  capGeo.scale(1.02, 1.07, 0.99);
  const cap = new THREE.Mesh(capGeo, m.hairCap);
  cap.rotation.x = -0.55; // ligne des cheveux haute devant (front dégagé sous la frange), basse sur la nuque
  head.add(cap);
  const hair = new THREE.Group();
  // contour des mèches reculé : il dessine la silhouette de la chevelure sans tracer de traits cassés
  // là où les mèches se chevauchent
  for (const [p0, p1, p2, w] of LOCKS) hair.add(outline(new THREE.Mesh(hairLock(p0, p1, p2, w), m.hair), 0.8, 0.07));
  head.add(hair);


  // course : cadence et amplitude calées sur la vitesse de déplacement (pieds qui ne glissent pas)
  const walk = createWalkCycle(RUN);
  shadowCast(root);

  // ---------------------------------------------------------------------------------------------
  // Animations (animateur commun : kit.js)
  const animator = createAnimator({ body, lower, upper, neckPivot, hair, arms, legs }, {
    walk, showcase: stance !== 'combat', hasWeapon: !!weaponModel,
    blink: { mat: m.skin, open: m.skin.map, closed: skinTexture(true) },
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
      if (!isOutline(o.material) && !o.userData.outline) o.material.dispose?.();
    });
  }
  return { root, ...animator, dispose, def, rank, weapon, skin };
}
