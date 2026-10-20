// Chaussures des Strikers, modélisées par le code.
// Chaque chaussure est un VOLUME UNIQUE sculpté (talon, cambrure, plante, bout arrondi) : une suite de
// sections arrondies le long du pied, sur une vraie semelle (première + intercalaire éventuelle), avec
// des lacets qui suivent la surface, un col rembourré, et des détails peints directement sur le modèle
// (coutures, surpiqûres, empiècements, perforations), calculés depuis la forme elle-même.
//
// Repère d'une chaussure : origine au sol sous la cheville, +z vers la pointe, +y vers le haut.
// La jambe entre dans la chaussure autour de z ≈ 0 ; le talon est vers z = −0,22, la pointe vers z = +0,30.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const Z0 = -0.22, Z1 = 0.3, LEN = Z1 - Z0;
const cache = new Map();
const memo = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const css = (hex) => `#${new THREE.Color(hex).getHexString()}`;

/**
 * Forme d'une chaussure (fonctions de s ∈ [0, 1], talon -> pointe).
 *  W : demi-largeur max (plante du pied) ; collar : hauteur du col (ou de la tige) au-dessus de la semelle ;
 *  collarEnd : où finit le col / la tige ; toeH : hauteur du bout ; sole : épaisseur de semelle ;
 *  heel : hauteur de talon (chaussure à talon : l'arrière est surélevé) ; point : bout plus pointu.
 */
function makeShape({ W = 0.125, collar = 0.21, collarEnd = 0.5, instep = null, toeH = 0.09, sole = 0.045, heel = 0, point = 0, spring = 0.03, nTop = 2.4 }) {
  const widthCtl = new THREE.SplineCurve([[0, 0.78], [0.2, 0.84], [0.45, 0.8], [0.68, 1.0], [0.86, 0.9 - point * 0.25], [1, 0.62 - point * 0.3]].map(([a, b]) => new THREE.Vector2(a, b)));
  // profil de largeur précalculé (la peinture des textures interroge la forme pour chaque texel)
  const WT = Array.from({ length: 257 }, (_, i) => widthCtl.getPoint(i / 256).y);
  const wAt = (s) => { const f = Math.max(0, Math.min(1, s)) * 256, i = Math.min(255, Math.floor(f)); return WT[i] + (WT[i + 1] - WT[i]) * (f - i); };
  const toeStart = 0.74 - point * 0.06;
  const endRound = (s) => {
    let k = 1;
    if (s < 0.1) k *= Math.pow(1 - Math.pow((0.1 - s) / 0.1, 3), 1 / 3);                      // talon presque droit
    if (s > toeStart) k *= Math.pow(Math.max(0, 1 - Math.pow((s - toeStart) / (1 - toeStart), 2.2 - point * 0.5)), 1 / (2.2 - point * 0.5));
    return Math.max(0, k);
  };
  // dessous de la semelle : talon surélevé (talons hauts), pointe légèrement relevée
  const ground = (s) => heel * (1 - smooth(0.3, 0.66, s)) + spring * Math.pow(smooth(0.72, 1, s), 2);
  const soleH = (s) => (heel ? sole * 0.6 + sole * 0.4 * smooth(0.5, 0.7, s) : sole) * (0.85 + 0.15 * endRound(s));
  const ins = instep ?? collar * 0.82;
  const upperH = (s) => {
    let h;
    if (s < collarEnd) h = collar - 0.02 * (1 - smooth(0, 0.12, s));                             // col / tige
    else if (s < 0.74) h = lerp(lerp(collar, ins, smooth(collarEnd, collarEnd + 0.06, s)), toeH, smooth(collarEnd + 0.04, 0.76, s)); // cou-de-pied
    else h = toeH;
    return h;
  };
  return { W, wAt, endRound, ground, soleH, upperH, collar, collarEnd, nTop };
}

/** Point de la surface d'une couche (θ = 0 dessous, π/2 côté +x, π dessus). */
function sectionPoint(shape, layer, s, theta, out = new THREE.Vector3()) {
  const { W, wAt, endRound, ground, soleH, upperH } = shape;
  const e = endRound(s);
  const z = Z0 + s * LEN;
  let w, y0, y1, nTop, nBot;
  if (layer === 'upper') {
    w = W * wAt(s) * e - 0.004;
    y0 = ground(s) + soleH(s) - 0.012;
    y1 = ground(s) + soleH(s) + upperH(s) * Math.pow(e, 0.45);
    nTop = shape.nTop; nBot = 6;
  } else {
    const [a, b] = layer;                         // tranche de semelle : fractions de l'épaisseur
    w = W * wAt(s) * Math.pow(e, 0.9) + 0.008;
    y0 = ground(s) + soleH(s) * a;
    y1 = ground(s) + soleH(s) * b;
    // extrémités arrondies aussi en hauteur : le talon de la semelle se referme en douceur (pas d'arête)
    const k = Math.pow(e, 0.35), m0 = (y0 + y1) / 2;
    y0 = m0 + (y0 - m0) * k; y1 = m0 + (y1 - m0) * k;
    nTop = 7; nBot = 5;
  }
  const mid = (y0 + y1) / 2, hh = (y1 - y0) / 2;
  const c = Math.cos(theta), sn = Math.sin(theta);
  const n = c > 0 ? nBot : nTop;
  let x = w * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n), y = mid - hh * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), zz = z;
  return out.set(x, y, zz);
}

/** Maillage d'une couche : sections réparties plus serrées aux extrémités (talon, pointe). */
function loft(shape, layer, segS = 38, segT = 30) {
  const pos = [], uv = [], idx = [];
  const P = new THREE.Vector3();
  for (let i = 0; i <= segS; i++) {
    const s = 0.5 - 0.5 * Math.cos((Math.PI * i) / segS);
    for (let j = 0; j <= segT; j++) {
      sectionPoint(shape, layer, s, (j / segT) * Math.PI * 2, P);
      pos.push(P.x, P.y, P.z);
      uv.push(j / segT, s);
    }
  }
  for (let i = 0; i < segS; i++) for (let j = 0; j < segT; j++) {
    const a = i * (segT + 1) + j, b = a + segT + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // la jointure des sections (θ = 0) passe sous la semelle : on y moyenne les normales (aucune ligne)
  const nrm = g.attributes.normal;
  for (let i = 0; i <= segS; i++) {
    const a = i * (segT + 1), b = a + segT;
    const x = (nrm.getX(a) + nrm.getX(b)) / 2, y = (nrm.getY(a) + nrm.getY(b)) / 2, z = (nrm.getZ(a) + nrm.getZ(b)) / 2;
    nrm.setXYZ(a, x, y, z); nrm.setXYZ(b, x, y, z);
  }
  return g;
}

// ---------------------------------------------------------------------------------------------
// Peinture des détails : texture (u autour de la section, v = s le long du pied), 512 × 512.
// Chaque texel connaît sa position 3D sur la chaussure : les motifs « à hauteur fixe » (bandes de la
// tige, plis de cheville) tombent exactement à la bonne hauteur.
const TS = 512;
function painter(shape, base) {
  const [c, g] = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = TS; return [cv, cv.getContext('2d')]; })();
  g.fillStyle = base; g.fillRect(0, 0, TS, TS);
  const X = (u) => u * TS, Y = (s) => (1 - s) * TS;
  const P = new THREE.Vector3();
  const api = {
    g, X, Y,
    /** Trace une courbe (liste de [u, s]) ; dash : pointillés de surpiqûre. */
    line(pts, color, width = 3, dash = null) {
      g.save(); g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round';
      if (dash) g.setLineDash(dash);
      g.beginPath(); pts.forEach(([u, s], i) => (i ? g.lineTo(X(u), Y(s)) : g.moveTo(X(u), Y(s)))); g.stroke(); g.restore();
    },
    fill(pts, color) { g.fillStyle = color; g.beginPath(); pts.forEach(([u, s], i) => (i ? g.lineTo(X(u), Y(s)) : g.moveTo(X(u), Y(s)))); g.closePath(); g.fill(); },
    /**
     * Ombrage qui dépend de la position 3D : fn(point, u, s) -> facteur (1 = inchangé, < 1 assombrit,
     * > 1 éclaircit). Les variations étant douces, on le calcule en basse résolution puis on l'étire
     * (lissé) sur la texture : rapide même sur mobile.
     */
    shade(fn, res = 64) {
      const mk = () => { const cv = document.createElement('canvas'); cv.width = cv.height = res; return cv; };
      const dark = mk(), light = mk();
      const dd = dark.getContext('2d').createImageData(res, res), ld = light.getContext('2d').createImageData(res, res);
      for (let y = 0; y < res; y++) {
        const s = 1 - (y + 0.5) / res;
        for (let x = 0; x < res; x++) {
          const u = (x + 0.5) / res;
          const k = fn(sectionPoint(shape, 'upper', s, u * Math.PI * 2, P), u, s);
          const i = (y * res + x) * 4;
          const dv = Math.round(255 * Math.min(1, k)), lv = Math.round(255 * Math.max(0, Math.min(1, k - 1)));
          dd.data[i] = dd.data[i + 1] = dd.data[i + 2] = dv; dd.data[i + 3] = 255;
          ld.data[i] = ld.data[i + 1] = ld.data[i + 2] = lv; ld.data[i + 3] = 255;
        }
      }
      dark.getContext('2d').putImageData(dd, 0, 0); light.getContext('2d').putImageData(ld, 0, 0);
      g.save(); g.imageSmoothingEnabled = true;
      g.globalCompositeOperation = 'multiply'; g.drawImage(dark, 0, 0, TS, TS);
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.8; g.drawImage(light, 0, 0, TS, TS);
      g.restore();
    },
    /** Courbe des points situés à `h` au-dessus de la semelle (des deux côtés) : liseré, trépointe. */
    soleLine(h, color, width = 3, s0 = 0, s1 = 1) {
      for (const side of [1, -1]) {
        const pts = [];
        for (let s = s0; s <= s1 + 1e-6; s += 0.01) {
          let lo = 0, hi = Math.PI;                                    // θ de 0 (dessous) à π (dessus), côté +x
          for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; const Pt = sectionPoint(shape, 'upper', s, m, P); if (Pt.y - (shape.ground(s) + shape.soleH(s)) < h) lo = m; else hi = m; }
          const u = ((lo + hi) / 2) / (Math.PI * 2);
          pts.push([side > 0 ? u : 1 - u, s]);
        }
        api.line(pts, color, width);
      }
    },
    texture() { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; },
  };
  return api;
}
// motif symétrique (u autour de 0,5 = dessus) : les deux côtés de la chaussure
const both = (pts) => [pts, pts.map(([u, s]) => [1 - u, s])];
/** Ombrage commun : un peu plus sombre près de la semelle et dans le creux du cou-de-pied. */
function shading(p, shape, { dark = 0.82, extra = null } = {}) {
  p.shade((P, u, s) => {
    const y = P.y - (shape.ground(s) + shape.soleH(s));
    return (1 - (1 - dark) * (1 - smooth(0.0, 0.05, y))) * (extra ? extra(P, u, s) : 1);
  });
}

// ---------------------------------------------------------------------------------------------
// Lacets, col, languette
function surfaceFrame(shape, s, theta, lift) {
  const P = sectionPoint(shape, 'upper', s, theta);
  const A = sectionPoint(shape, 'upper', s, theta + 0.01).sub(sectionPoint(shape, 'upper', s, theta - 0.01));
  const B = sectionPoint(shape, 'upper', Math.min(1, s + 0.005), theta).sub(sectionPoint(shape, 'upper', Math.max(0, s - 0.005), theta));
  const N = new THREE.Vector3().crossVectors(B, A).normalize();
  if (N.y < -0.2) N.negate();
  return P.addScaledVector(N, lift);
}
/** θ (proche du dessus) pour lequel la surface est à une distance x du milieu, à la position s. */
function thetaForX(shape, s, x) {
  let lo = Math.PI * 0.5, hi = Math.PI;                          // côté +x : x décroît de lo à hi
  for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (sectionPoint(shape, 'upper', s, m).x > x) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
function laces(shape, mat, { from, to, n, spread = 0.042, cross = true, r = 0.0075, bow = true }) {
  const g = new THREE.Group();
  const eyelets = [];
  for (let i = 0; i < n; i++) {
    const s = lerp(from, to, n === 1 ? 0 : i / (n - 1));
    const t = thetaForX(shape, s, spread);
    eyelets.push([surfaceFrame(shape, s, t, 0.004), surfaceFrame(shape, s, Math.PI * 2 - t, 0.004), s]);
  }
  const tube = (a, b, lift) => {
    const mid = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, lift, 0));
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    return new THREE.Mesh(new THREE.TubeGeometry(curve, 6, r, 5, false), mat);
  };
  eyelets.forEach(([L, R], i) => {
    g.add(tube(L, R, 0.012));                                                          // barrette
    if (cross && i < eyelets.length - 1) g.add(tube(R, eyelets[i + 1][0], 0.016));     // croisement
  });
  if (bow && eyelets.length) {
    // nœud en boucles sur l'œillet le plus haut
    const [L, R] = eyelets.reduce((a, e) => (e[2] < a[2] ? e : a));
    const c = L.clone().add(R).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.012, 0));
    for (const sd of [-1, 1]) {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.022, r * 0.9, 6, 16), mat);
      loop.position.copy(c).add(new THREE.Vector3(sd * 0.024, 0.004, 0.004));
      loop.rotation.set(-0.9, 0, sd * 0.5);
      loop.scale.set(1, 0.6, 1);
      g.add(loop);
      const end = tube(c.clone(), c.clone().add(new THREE.Vector3(sd * 0.02, -0.025, 0.045)), 0.004);
      g.add(end);
    }
    const knot = new THREE.Mesh(new THREE.SphereGeometry(r * 1.6, 8, 6), mat);
    knot.position.copy(c);
    g.add(knot);
  }
  return g;
}
/** Col rembourré : bourrelet qui suit l'ouverture de la chaussure (vu d'au-dessus : ovale du col). */
function collarRing(shape, mat, { thick = 0.022 } = {}) {
  const pts = [];
  const N = 36;
  const sEnd = shape.collarEnd * 0.96;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const s = (0.5 - 0.5 * Math.cos(a)) * sEnd * 0.94 + 0.03;          // du talon (a = 0) à l'avant du col
    const side = Math.sin(a);
    const y = shape.ground(s) + shape.soleH(s) + shape.upperH(s) * Math.pow(shape.endRound(s), 0.45) - 0.004;
    const w = shape.W * shape.wAt(s) * shape.endRound(s) * 0.86;
    pts.push(new THREE.Vector3(w * side, y, Z0 + s * LEN));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 48, thick, 8, true), mat);
}

/**
 * Tige (bottes, baskets montantes) : tube ouvert autour de la jambe, section ovale, légèrement évasé
 * en haut, avec doublure intérieure plus sombre et bord roulé. u = 0 devant (+z), v = 0 en bas.
 */
// Point de la tige (section en ovale légèrement carré : elle enveloppe bien le talon de la chaussure).
function tubePoint(sh, v, a, inset = 0, out = new THREE.Vector3()) {
  const k = lerp(1, sh.flare ?? 1.06, v * v) * lerp(sh.base ?? 1.2, 1, smooth(0, 0.4, v));   // pied plus large, haut évasé
  const sn = Math.sin(a), cs = Math.cos(a), n = 2.6;
  return out.set(Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n) * (sh.rx * k - inset), lerp(sh.y0, sh.y1, v), sh.zc + Math.sign(cs) * Math.pow(Math.abs(cs), 2 / n) * (sh.rz * k - inset));
}
function shaftTube(sh) {
  const { mat, lining, rim, outline, rimR = 0.014 } = sh;
  const g = new THREE.Group();
  const H = 8, R = 30, P = new THREE.Vector3();
  const make = (inset) => {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= H; i++) {
      const v = i / H;
      for (let j = 0; j <= R; j++) {
        tubePoint(sh, v, (j / R) * Math.PI * 2, inset, P);
        pos.push(P.x, P.y, P.z);
        uv.push(j / R, v);
      }
    }
    for (let i = 0; i < H; i++) for (let j = 0; j < R; j++) { const a = i * (R + 1) + j, b = a + R + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  };
  g.add(outline(new THREE.Mesh(make(0), mat)));
  const inner = new THREE.Mesh(make(0.008), lining);
  inner.material.side = THREE.BackSide;
  g.add(inner);
  // bord roulé
  const pts = [];
  for (let j = 0; j < 48; j++) pts.push(tubePoint(sh, 1, (j / 48) * Math.PI * 2, 0.004));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 44, rimR, 6, true), rim));
  return g;
}
/** Lacets qui montent le long du devant d'une tige (œillets de part et d'autre de l'avant). */
function shaftLaces(sh, mat, { from, to, n, a = 0.36, r = 0.008 }) {
  const g = new THREE.Group();
  const pt = (v, ang) => tubePoint(sh, v, ang, -0.005);
  const tube = (p, q) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(p, p.clone().add(q).multiplyScalar(0.5).add(new THREE.Vector3(0, 0, 0.008)), q), 6, r, 5, false), mat);
  for (let i = 0; i < n; i++) {
    const v = lerp(from, to, i / (n - 1));
    g.add(tube(pt(v, a), pt(v, -a)));
    if (i < n - 1) g.add(tube(pt(v, -a), pt(lerp(from, to, (i + 1) / (n - 1)), a)));
  }
  return g;
}
function paintTube(base, draw) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  draw(g, (u) => u * 256, (v) => (1 - v) * 256);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------------------------------------
// Modèles
function assemble({ shape, upperMat, soleLayers, outline, extras = [], opening = null }) {
  const g = new THREE.Group();
  const geoKey = JSON.stringify([shape.W, shape.collar, shape.collarEnd, shape.toeHVal, shape.heelVal, shape.pointVal, shape.soleVal]);
  const up = new THREE.Mesh(memo(`up:${geoKey}`, () => loft(shape, 'upper')).clone(), upperMat);
  g.add(outline(up));
  for (const [range, mat] of soleLayers) g.add(outline(new THREE.Mesh(memo(`so:${geoKey}:${range}`, () => loft(shape, range, 30, 20)).clone(), mat)));
  for (const e of extras) g.add(e);
  g.traverse((o) => { if (o.isMesh && !o.userData.outline) o.castShadow = true; });
  g.userData.isShoe = true;
  // ouverture où entre la jambe : centre (z), hauteur du bord et rayon intérieur. Une chaussure basse
  // s'ouvre sur l'arrière du pied (du talon à la fin du col) : la cheville est au-dessus de son milieu.
  const zLow = Z0 + shape.collarEnd * LEN * 0.5;
  const o = opening ?? { z: zLow, y: shape.soleH(shape.collarEnd * 0.5) + shape.ground(shape.collarEnd * 0.5) + shape.upperH(shape.collarEnd * 0.5), r: shape.W * shape.wAt(shape.collarEnd * 0.5) * 0.82 };
  g.userData.ankleZ = o.z;
  g.userData.opening = o;
  g.userData.soles = solePoints(g);
  return g;
}
/** Profil du dessous de la semelle (repère de la chaussure) : le point le plus bas de chaque tranche, du talon
 *  à la pointe ; quelle que soit l'inclinaison du pied, le point en contact avec le sol en fait partie. */
function solePoints(g) {
  const v = new THREE.Vector3(), N = 10;
  const bins = Array.from({ length: N }, () => new THREE.Vector3(0, Infinity, 0));
  g.updateMatrixWorld(true);
  g.traverse((o) => {
    if (!o.isMesh || o.userData.outline) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);   // (la chaussure n'a pas encore de parent)
      const b = bins[Math.max(0, Math.min(N - 1, Math.floor(((v.z - Z0) / LEN) * N)))];
      if (v.y < b.y) b.set(0, v.y, v.z);
    }
  });
  return bins.filter((p) => Number.isFinite(p.y));
}
/**
 * Pose une chaussure sous une cheville : renvoie la position (repère de la cheville, cheville à `ankleY`
 * au-dessus du sol) qui place le centre de l'ouverture exactement sous la jambe, quelle que soit l'échelle
 * et l'orientation (pointe tournée de `rotY`).
 */
export function seatShoe(shoe, { scale = 1, rotY = 0, ankleY = 0 } = {}) {
  const az = shoe.userData.ankleZ * scale;
  shoe.scale.setScalar(scale);
  shoe.rotation.y = rotY;
  shoe.position.set(-Math.sin(rotY) * az, -ankleY, -Math.cos(rotY) * az);
  return shoe;
}
function shapeOf(p) {
  const s = makeShape(p);
  Object.assign(s, { toeHVal: p.toeH, heelVal: p.heel ?? 0, pointVal: p.point ?? 0, soleVal: p.sole });
  return s;
}

/**
 * RICHELIEU (Claude) : cuir poli, bout golf perforé (fleur et rangée de trous), quartiers cousus,
 * semelle cuir avec trépointe surpiquée, lacets fins.
 */
export function oxford({ color = 0x8a4a22, sole = 0x2b170e, lace = 0x2a140a, outline = (m) => m } = {}) {
  const shape = shapeOf({ W: 0.12, collar: 0.15, collarEnd: 0.42, instep: 0.14, toeH: 0.085, sole: 0.034, spring: 0.025, point: 0.15, nTop: 2.05 });
  const map = memo(`oxford:${color}`, () => {
    const p = painter(shape, '#ffffff');
    // brillance du cuir ciré (bout et talon plus clairs) + ombre près de la semelle
    shading(p, shape, { dark: 0.78, extra: (P, u, s) => 1 + 0.16 * Math.exp(-(((s - 0.9) / 0.09) ** 2 + ((u - 0.5) / 0.16) ** 2)) + 0.08 * Math.exp(-(((s - 0.05) / 0.06) ** 2)) });
    const seam = 'rgba(40,18,6,.85)', stitch = 'rgba(255,225,190,.55)';
    // bout golf : couture en W et rangée de perforations
    const cap = []; for (let i = 0; i <= 40; i++) { const u = 0.18 + (0.64 * i) / 40; const d = (u - 0.5) / 0.32; cap.push([u, 0.74 - 0.12 * d * d + 0.025 * Math.cos(d * Math.PI * 2)]); }
    p.line(cap, seam, 4);
    p.line(cap.map(([u, s]) => [u, s - 0.018]), stitch, 2, [3, 4]);
    for (let i = 0; i <= 26; i++) { const [u, s] = cap[Math.round((i / 26) * 40)]; p.g.fillStyle = 'rgba(30,12,4,.8)'; p.g.beginPath(); p.g.arc(p.X(u), p.Y(s + 0.016), 2.6, 0, Math.PI * 2); p.g.fill(); }
    // fleur perforée sur le bout
    for (let a = 0; a < 7; a++) { const ang = (a / 7) * Math.PI * 2; p.g.beginPath(); p.g.arc(p.X(0.5 + Math.cos(ang) * 0.025), p.Y(0.88 + Math.sin(ang) * 0.025), 2.4, 0, Math.PI * 2); p.g.fill(); }
    // quartiers : couture du talon vers le laçage, surpiqûre parallèle
    for (const pts of both([[0.5 + 0.07, 0.6], [0.66, 0.52], [0.74, 0.44], [0.82, 0.4], [0.9, 0.38]])) { p.line(pts, seam, 4); p.line(pts.map(([u, s]) => [u, s - 0.02]), stitch, 2, [3, 4]); }
    // contrefort du talon
    p.line([[0.62, 0.0], [0.6, 0.16], [0.5, 0.2], [0.4, 0.16], [0.38, 0.0]], seam, 3);
    // ouverture du laçage (languette plus sombre)
    p.fill([[0.47, 0.45], [0.53, 0.45], [0.535, 0.6], [0.465, 0.6]], 'rgba(30,12,4,.45)');
    return p.texture();
  });
  const upperMat = new THREE.MeshStandardMaterial({ color, map, roughness: 0.3, metalness: 0.05, envMapIntensity: 0.85 });
  const soleMat = new THREE.MeshStandardMaterial({ color: sole, roughness: 0.55 });
  const welt = new THREE.MeshStandardMaterial({ color: new THREE.Color(sole).lerp(new THREE.Color(color), 0.35), roughness: 0.5 });
  const lm = new THREE.MeshStandardMaterial({ color: lace, roughness: 0.6 });
  return assemble({ shape, upperMat, outline, soleLayers: [[[0, 0.62], soleMat], [[0.6, 1.0], welt]],
    extras: [laces(shape, lm, { from: 0.47, to: 0.58, n: 4, spread: 0.034, cross: false, r: 0.006 })] });
}

/**
 * BASKET (Tobi : montante ; Nova : de course). Tige blanche, empiècements couleur (éclair latéral original),
 * bout renforcé perforé, contrefort coloré, intercalaire épaisse, semelle d'usure, col rembourré.
 */
export function sneaker({ upper = 0xf7f6f2, accent = 0xe0262e, sole = 0xf2f0ea, outsole = 0x2b2b30, lace = 0xffffff, high = false, runner = false, outline = (m) => m } = {}) {
  const shape = shapeOf(high
    ? { W: 0.13, collar: 0.085, collarEnd: 0.5, instep: 0.15, toeH: 0.1, sole: 0.07, spring: 0.035 }
    : { W: 0.122, collar: 0.17, collarEnd: 0.46, instep: 0.15, toeH: 0.092, sole: runner ? 0.075 : 0.065, spring: 0.04, point: runner ? 0.1 : 0 });
  const key = `sneaker:${upper}:${accent}:${high}:${runner}`;
  const map = memo(key, () => {
    const p = painter(shape, css(upper));
    const acc = css(accent);
    if (runner) {
      // maille respirante (fine trame) sur l'avant
      p.g.fillStyle = 'rgba(255,255,255,.05)';
      for (let y = 0; y < p.Y(0.55); y += 6) for (let x = (y / 6) % 2 ? 3 : 0; x < TS; x += 6) p.g.fillRect(x, y, 3, 3);
    }
    shading(p, shape, { dark: 0.86 });
    // bout renforcé (gris clair) + perforations
    const toe = []; for (let i = 0; i <= 30; i++) { const u = 0.2 + (0.6 * i) / 30; const d = (u - 0.5) / 0.3; toe.push([u, 0.8 - 0.1 * d * d]); }
    p.fill([...toe, [0.8, 1.0], [0.2, 1.0]], 'rgba(0,0,0,.06)');
    p.line(toe, 'rgba(0,0,0,.28)', 3); p.line(toe.map(([u, s]) => [u, s - 0.015]), 'rgba(0,0,0,.22)', 1.5, [3, 4]);
    p.g.fillStyle = 'rgba(0,0,0,.25)';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { p.g.beginPath(); p.g.arc(p.X(0.44 + i * 0.04), p.Y(0.86 + j * 0.035), 2.2, 0, Math.PI * 2); p.g.fill(); }
    // éclair latéral (double chevron filant vers la pointe) des deux côtés
    for (const sideU of [0.25, 0.75]) {
      const sg = sideU < 0.5 ? 1 : -1;
      const bolt = [[0.06, -0.07], [0.3, -0.02], [0.27, 0.035], [0.62, 0.055], [0.38, 0.0], [0.41, -0.05]];
      p.fill(bolt.map(([s, du]) => [sideU + sg * du, s]), acc);
      p.line([...bolt, bolt[0]].map(([s, du]) => [sideU + sg * du, s]), 'rgba(0,0,0,.3)', 2);
    }
    // contrefort du talon coloré et languette de talon
    p.fill([[0.36, 0.0], [0.64, 0.0], [0.62, 0.14], [0.5, 0.18], [0.38, 0.14]], acc);
    p.line([[0.36, 0.0], [0.38, 0.14], [0.5, 0.18], [0.62, 0.14], [0.64, 0.0]], 'rgba(0,0,0,.25)', 2, [4, 4]);
    // œillets (pattes de laçage)
    for (const pts of both([[0.56, high ? 0.5 : 0.44], [0.56, 0.68]])) p.line(pts, 'rgba(0,0,0,.18)', 10);
    return p.texture();
  });
  const upperMat = new THREE.MeshStandardMaterial({ map, roughness: 0.55, envMapIntensity: 0.6 });
  const mid = new THREE.MeshStandardMaterial({ color: sole, roughness: 0.65 });
  const out = new THREE.MeshStandardMaterial({ color: outsole, roughness: 0.8 });
  const stripe = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5 });
  const lm = new THREE.MeshStandardMaterial({ color: lace, roughness: 0.65 });
  const extras = [laces(shape, lm, { from: high ? 0.48 : 0.45, to: 0.68, n: 4, spread: 0.04, bow: !high })];
  if (high) {
    // tige montante rembourrée : blanche, panneau couleur à l'arrière, col couleur, lacets jusqu'en haut
    const sh = { y0: 0.05, y1: 0.33, rx: 0.118, rz: 0.145, zc: -0.07, flare: 1.03 };
    const tm = new THREE.MeshStandardMaterial({ roughness: 0.55, map: memo(`hiTop:${upper}:${accent}`, () => paintTube(css(upper), (g, X, Y) => {
      g.fillStyle = css(accent); g.beginPath(); g.moveTo(X(0.32), Y(0)); g.lineTo(X(0.36), Y(0.75)); g.lineTo(X(0.5), Y(0.95)); g.lineTo(X(0.64), Y(0.75)); g.lineTo(X(0.68), Y(0)); g.fill();   // panneau arrière
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; g.setLineDash([4, 4]); g.stroke();
      g.setLineDash([]); g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(X(0.9), 0, X(0.2), 256); g.fillRect(0, 0, X(0.1), 256);   // pattes de laçage
    })) });
    extras.push(shaftTube({ ...sh, mat: tm, lining: new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.9 }), rim: new THREE.MeshStandardMaterial({ color: accent, roughness: 0.55 }), outline, rimR: 0.022 }));
    extras.push(shaftLaces(sh, lm, { from: 0.55, to: 0.9, n: 3, a: 0.34 }));
  } else {
    extras.push(collarRing(shape, new THREE.MeshStandardMaterial({ color: upper, roughness: 0.6 }), { thick: 0.022 }));
  }
  // languette rembourrée qui dépasse un peu du col
  const tongue = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.07, 0.024, 4, 0.011), new THREE.MeshStandardMaterial({ color: high ? upper : accent, roughness: 0.6 }));
  if (high) { tongue.position.set(0, 0.345, 0.07); tongue.rotation.x = -0.25; }   // dépasse du haut de la tige, devant
  else { tongue.position.copy(surfaceFrame(shape, shape.collarEnd + 0.01, Math.PI, 0.004)).add(new THREE.Vector3(0, 0.022, -0.012)); tongue.rotation.x = -0.35; }
  extras.push(outline(tongue));
  // montante : la jambe entre au centre de la tige ; basse : ouverture calculée sur la forme
  return assemble({ shape, upperMat, outline, soleLayers: [[[0, 0.3], out], [[0.28, 0.42], stripe], [[0.4, 1.0], mid]], extras,
    opening: high ? { z: -0.07, y: 0.33, r: 0.118 * 0.9 } : null });
}

/**
 * BOTTE. Trois styles :
 *  'combat' (Brutus) : cuir épais, laçage jusqu'en haut, plis à la cheville, grosse semelle crantée ;
 *  'armor' (Kaiser) : coque sombre, plaques, bandes néon lumineuses à hauteur fixe ;
 *  'heel' (Selena) : bottine fine à talon, bout effilé, fermeture éclair, cuir verni.
 */
export function boot({ style = 'combat', color = 0x2a2420, sole = 0x121212, lace = 0x3a302a, neon = 0xff3dc8, shaft = 0.26, outline = (m) => m } = {}) {
  const P = style === 'heel'
    ? { W: 0.088, collar: 0.08, collarEnd: 0.5, instep: 0.11, toeH: 0.07, sole: 0.022, heel: 0.11, point: 0.65, spring: 0.01 }
    : style === 'armor'
      ? { W: 0.124, collar: 0.08, collarEnd: 0.5, instep: 0.14, toeH: 0.1, sole: 0.06, spring: 0.025 }
      : { W: 0.13, collar: 0.08, collarEnd: 0.5, instep: 0.14, toeH: 0.1, sole: 0.075, spring: 0.03 };
  const shape = shapeOf(P);
  const map = memo(`boot:${style}:${color}:${neon}:${shaft}`, () => {
    const p = painter(shape, '#ffffff');
    const top = (s) => shape.ground(s) + shape.soleH(s);
    if (style === 'combat') {
      // plis horizontaux à la cheville, cuir patiné (bords plus clairs)
      shading(p, shape, { dark: 0.75, extra: (Pt, u, s) => 1 + 0.12 * Math.exp(-(((s - 0.9) / 0.1) ** 2)) });   // bout patiné
      const toe = []; for (let i = 0; i <= 30; i++) { const u = 0.2 + (0.6 * i) / 30; const d = (u - 0.5) / 0.3; toe.push([u, 0.78 - 0.1 * d * d]); }
      p.line(toe, 'rgba(0,0,0,.55)', 4); p.line(toe.map(([u, s]) => [u, s - 0.02]), 'rgba(255,230,190,.35)', 2, [3, 4]);
      for (const pts of both([[0.55, 0.36], [0.55, 0.72]])) { p.line(pts, 'rgba(0,0,0,.35)', 12); }   // pattes de laçage
      p.line([[0.5, 0.0], [0.5, 0.12]], 'rgba(0,0,0,.4)', 4);                                   // couture arrière
    } else if (style === 'armor') {
      shading(p, shape, { dark: 0.7 });
      // plaques : arêtes plus claires
      for (const pts of both([[0.62, 0.62], [0.74, 0.5], [0.86, 0.48]])) p.line(pts, 'rgba(255,255,255,.35)', 4);
      const toe = []; for (let i = 0; i <= 30; i++) { const u = 0.22 + (0.56 * i) / 30; const d = (u - 0.5) / 0.28; toe.push([u, 0.76 - 0.08 * d * d]); }
      p.line(toe, 'rgba(255,255,255,.3)', 4);
    } else {
      // cuir verni + fermeture éclair sur le côté intérieur
      shading(p, shape, { dark: 0.8 });
      p.line([[0.72, 0.08], [0.72, 0.5]], 'rgba(200,200,210,.8)', 5);
      p.line([[0.72, 0.08], [0.72, 0.5]], 'rgba(40,40,48,1)', 2, [2, 3]);
      const toe = []; for (let i = 0; i <= 30; i++) { const u = 0.25 + (0.5 * i) / 30; const d = (u - 0.5) / 0.25; toe.push([u, 0.82 - 0.06 * d * d]); }
      p.line(toe, 'rgba(255,255,255,.12)', 3);
    }
    return p.texture();
  });
  const upperMat = new THREE.MeshStandardMaterial({
    color, map,
    roughness: style === 'heel' ? 0.16 : style === 'armor' ? 0.3 : 0.5,
    metalness: style === 'armor' ? 0.65 : style === 'heel' ? 0.1 : 0.05,
    envMapIntensity: style === 'heel' ? 1.1 : 0.7,
  });
  if (style === 'armor') {
    // liseré néon le long de la semelle (hauteur fixe, calculée depuis la forme réelle)
    upperMat.emissive = new THREE.Color(neon);
    upperMat.emissiveIntensity = 2.2;
    upperMat.emissiveMap = memo('bootNeonFoot', () => {
      const p = painter(shape, '#000000');
      p.soleLine(0.005, '#ffffff', 5, 0.03, 0.95);
      return p.texture();
    });
  }
  const soleMat = new THREE.MeshStandardMaterial({ color: sole, roughness: style === 'heel' ? 0.4 : 0.85, map: style === 'combat' ? lugMap() : null });
  const extras = [];
  // tige : tube ouvert autour de la jambe
  const sh = style === 'heel'
    ? { y0: 0.08, y1: 0.12 + shaft, rx: 0.074, rz: 0.1, zc: -0.11, flare: 1.08, base: 1.14 }
    : { y0: 0.04, y1: 0.1 + shaft, rx: 0.118, rz: 0.148, zc: -0.075, flare: style === 'armor' ? 1.08 : 1.04 };
  const shaftMat = new THREE.MeshStandardMaterial({ color, roughness: upperMat.roughness, metalness: upperMat.metalness, envMapIntensity: upperMat.envMapIntensity,
    map: memo(`shaft:${style}`, () => paintTube('#ffffff', (g, X, Y) => {
      if (style === 'combat') {
        g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(X(0.92), 0, X(0.16), 256); g.fillRect(0, 0, X(0.08), 256);   // ouverture du laçage
        g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2;
        for (const v of [0.12, 0.2, 0.31]) { g.beginPath(); for (let u = 0.15; u <= 0.85; u += 0.02) g.lineTo(X(u), Y(v + 0.015 * Math.sin(u * 20))); g.stroke(); }  // plis de cheville
        g.strokeStyle = 'rgba(255,230,190,.35)'; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(0, Y(0.94)); g.lineTo(256, Y(0.94)); g.stroke();
        g.setLineDash([]); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(X(0.48), Y(1), X(0.04), 30);                   // couture arrière
      } else if (style === 'armor') {
        g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 3;
        for (const u of [0.25, 0.75]) { g.beginPath(); g.moveTo(X(u), Y(0.05)); g.lineTo(X(u), Y(0.95)); g.stroke(); }  // arêtes des plaques
      } else {
        g.fillStyle = 'rgba(210,210,220,.9)'; g.fillRect(X(0.24), Y(0.98), 5, 250);                                    // fermeture éclair
        g.fillStyle = 'rgba(30,30,36,1)'; for (let y = 4; y < 250; y += 5) g.fillRect(X(0.24) + 1, y, 3, 2);
      }
    })) });
  if (style === 'armor') {
    shaftMat.emissive = new THREE.Color(neon); shaftMat.emissiveIntensity = 2.2;
    shaftMat.emissiveMap = memo('shaftNeon', () => paintTube('#000000', (g, X, Y) => { g.fillStyle = '#fff'; for (const v of [0.35, 0.72]) g.fillRect(0, Y(v) - 3, 256, 6); }));
  }
  const lining = new THREE.MeshStandardMaterial({ color: style === 'heel' ? 0x2a0a12 : 0x1a1612, roughness: 0.9 });
  const rimMat = style === 'armor' ? new THREE.MeshStandardMaterial({ color: neon, emissive: neon, emissiveIntensity: 1.8 }) : new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.75), roughness: 0.5, metalness: upperMat.metalness });
  extras.push(shaftTube({ ...sh, mat: shaftMat, lining, rim: rimMat, outline, rimR: style === 'heel' ? 0.008 : style === 'armor' ? 0.012 : 0.018 }));
  if (style === 'combat') {
    const lm = new THREE.MeshStandardMaterial({ color: lace, roughness: 0.7 });
    extras.push(laces(shape, lm, { from: 0.53, to: 0.7, n: 3, spread: 0.042, r: 0.0085, bow: false }));
    extras.push(shaftLaces(sh, lm, { from: 0.55, to: 0.92, n: 4, a: 0.4, r: 0.0085 }));
  }
  if (style === 'heel') {
    // talon : bloc effilé sous l'arrière, légèrement incliné
    const hg = new RoundedBoxGeometry(0.06, P.heel + 0.02, 0.06, 3, 0.012);
    hg.translate(0, (P.heel + 0.02) / 2, 0);
    const hp = hg.attributes.position;
    for (let i = 0; i < hp.count; i++) { const k = 1 - 0.45 * (1 - hp.getY(i) / (P.heel + 0.02)); hp.setX(i, hp.getX(i) * k); hp.setZ(i, hp.getZ(i) * k); }
    hg.computeVertexNormals();
    const h = outline(new THREE.Mesh(hg, soleMat));
    h.position.set(0, 0, -0.17);
    extras.push(h);
  }
  // la jambe est au centre de la tige
  return assemble({ shape, upperMat, outline, soleLayers: style === 'heel' ? [[[0, 1], soleMat]] : [[[0, 0.78], soleMat], [[0.76, 1], new THREE.MeshStandardMaterial({ color: new THREE.Color(sole).lerp(new THREE.Color(color), 0.4), roughness: 0.6 })]], extras,
    opening: { z: sh.zc, y: sh.y1, r: sh.rx * 0.9 } });
}
// semelle crantée : crampons sombres répartis le long du pied (visibles sur la tranche)
function lugMap() {
  return memo('lug', () => {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256;
    const g = cv.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 256);
    g.fillStyle = 'rgba(0,0,0,.55)';
    for (let i = 0; i < 18; i++) g.fillRect(0, i * (256 / 18), 64, 5);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}
