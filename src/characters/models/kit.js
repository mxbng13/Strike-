// Outils communs aux modèles 3D détaillés (même style que Claude) : textures procédurales, contour
// « dessin animé », mèches de cheveux, membres, placage de détails sur un buste, visage peint.
import * as THREE from 'three';
import { crystalTexture } from '../../render/textures.js';

const cache = {};
export function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
export function tex(c, { repeat = null, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
export function cached(key, make) { return cache[key] ?? (cache[key] = make()); }
let seed = 7;
export const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ---------- Textures de matières (blanc = couleur du matériau) ----------
/** Relief de tissu -> normal map. kind : 'twill' (sergé), 'knit' (maille), 'denim', 'leather'. */
export function normalMap(kind = 'twill') {
  return cached(`n:${kind}`, () => {
    const N = 128, h = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N;
      let val = 0.5;
      if (kind === 'twill' || kind === 'denim') val += 0.35 * Math.sin((u + v) * Math.PI * 2 * (kind === 'denim' ? 32 : 24));
      if (kind === 'knit') val += 0.3 * Math.abs(Math.sin(u * Math.PI * 2 * 20)) + 0.15 * Math.sin(v * Math.PI * 2 * 40);
      if (kind === 'leather') val += 0;
      h[y * N + x] = val + (rnd() - 0.5) * (kind === 'leather' ? 0.6 : 0.25);
    }
    const [c, g] = canvas(N, N);
    const img = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const hx = h[y * N + ((x + 1) % N)] - h[y * N + ((x - 1 + N) % N)];
      const hy = h[((y + 1) % N) * N + x] - h[((y - 1 + N) % N) * N + x];
      const v = new THREE.Vector3(-hx * 1.2, -hy * 1.2, 1).normalize();
      const i = (y * N + x) * 4;
      img.data[i] = (v.x * 0.5 + 0.5) * 255; img.data[i + 1] = (v.y * 0.5 + 0.5) * 255; img.data[i + 2] = (v.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return tex(c, { repeat: [6, 6], srgb: false });
  });
}
/** Variation de teinte d'un tissu (jean délavé, grain du cuir…) : texture « map » proche du blanc. */
export function fabricMap(kind) {
  return cached(`f:${kind}`, () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256);
    if (kind === 'denim') {
      for (let i = 0; i < 2200; i++) { g.fillStyle = `rgba(255,255,255,${rnd() * 0.25})`; g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 3, 1); }
      for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,40,${rnd() * 0.12})`; g.fillRect(rnd() * 256, rnd() * 256, 2, 1); }
    } else if (kind === 'leather') {
      for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.1})`; g.fillRect(rnd() * 256, rnd() * 256, 2, 2); }
      for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(255,255,255,${rnd() * 0.12})`; g.fillRect(rnd() * 256, rnd() * 256, 3, 1); }
    } else if (kind === 'hair') {
      return hairStrands();
    }
    return tex(c, { repeat: [2, 2] });
  });
}
/** Stries de mèches (le long de la mèche). */
export function hairStrands() {
  return cached('hair', () => {
    const [c, g] = canvas(128, 512);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 512);
    for (let i = 0; i < 46; i++) {
      const x = rnd() * 128;
      g.strokeStyle = rnd() < 0.5 ? `rgba(0,0,0,${0.06 + rnd() * 0.1})` : `rgba(255,255,255,${0.15 + rnd() * 0.25})`;
      g.lineWidth = 1 + rnd() * 3;
      g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (rnd() - 0.5) * 20, 170, x + (rnd() - 0.5) * 20, 340, x + (rnd() - 0.5) * 16, 512); g.stroke();
    }
    const grd = g.createLinearGradient(0, 0, 0, 512); grd.addColorStop(0, 'rgba(0,0,0,.08)'); grd.addColorStop(0.5, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,.18)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 512);
    return tex(c);
  });
}
/** Bandes latérales (jogging) / coutures (jean) : texture de jambe, u = 0 devant. */
export function legMap(kind, accent = '#ffffff') {
  return cached(`leg:${kind}:${accent}`, () => {
    const [c, g] = canvas(512, 512);
    g.fillStyle = '#fff'; g.fillRect(0, 0, 512, 512);
    if (kind === 'stripes') { g.fillStyle = accent; for (const x of [118, 138, 374, 394]) g.fillRect(x, 0, 12, 512); }
    if (kind === 'jeans') {
      g.strokeStyle = 'rgba(200,140,40,.9)'; g.lineWidth = 3; g.setLineDash([10, 6]);
      for (const x of [128, 384]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); }
      g.setLineDash([]);
      g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 4;
      for (const [y, a] of [[420, 14], [460, 10]]) { g.beginPath(); g.moveTo(-10, y); g.bezierCurveTo(128, y - a, 384, y + a, 522, y - 4); g.stroke(); }
      g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(200, 160, 110, 120); // genou délavé
    }
    if (kind === 'cargo') {
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 3;
      for (const x of [128, 384]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); }
    }
    return tex(c);
  });
}

// ---------- Contour « dessin animé » ----------
export const outlineMat = new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color(0x24160f) }, uWidth: { value: 0.0065 } },
  vertexShader: 'uniform float uWidth; void main(){ vec3 p = position + normal * uWidth; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
  fragmentShader: 'uniform vec3 uColor;\nvoid main(){\n  gl_FragColor = vec4(uColor, 1.0);\n  #include <colorspace_fragment>\n}',
  side: THREE.BackSide,
});
const outlineVariants = {};
export function outline(mesh, width = 1) {
  const mat = width === 1 ? outlineMat : (outlineVariants[width] ??= (() => { const m = outlineMat.clone(); m.uniforms.uWidth.value = 0.0065 * width; return m; })());
  const o = new THREE.Mesh(mesh.geometry, mat);
  o.userData.outline = true;
  mesh.add(o);
  return mesh;
}
export const isOutlineMat = (m) => m === outlineMat || Object.values(outlineVariants).includes(m);

// ---------- Matières des paliers Or / Diamant ----------
export function goldMat(color = 0xf0b43c, rough = 0.28) {
  return new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: rough, normalMap: normalMap('twill'), normalScale: new THREE.Vector2(0.15, 0.15) });
}
export function crystalMat(color = 0xdfeeff, dark = false) {
  const map = cached(`cr:${dark}`, () => { const t = crystalTexture(dark).clone(); t.repeat.set(2.6, 2.6); t.needsUpdate = true; return t; });
  return new THREE.MeshPhysicalMaterial({ color, map, metalness: dark ? 0.6 : 0.15, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04, iridescence: 0.7, iridescenceIOR: 1.7, flatShading: true, envMapIntensity: 0.9 });
}

// ---------- Géométrie ----------
/** Membre : cylindre effilé orienté de a vers b (avec sphère d'articulation). */
export function limb(a, b, r0, r1, mat, { cap = true, seg = 20, ol = 1 } = {}) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const geo = new THREE.CylinderGeometry(r1, r0, len, seg, 6, true);
  geo.translate(0, -len / 2, 0);
  const m = outline(new THREE.Mesh(geo, mat), ol);
  m.position.copy(A);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), B.clone().sub(A).normalize());
  const g = new THREE.Group();
  g.add(m);
  if (cap) { const s = new THREE.Mesh(new THREE.SphereGeometry(r1 * 0.97, seg, 12), mat); s.position.copy(B); g.add(s); } // articulation : invisible jambe tendue, comble le pli quand elle se plie
  g.userData.limbMesh = m;
  return g;
}
/** Densifie une géométrie plane (pour l'épouser sur une surface courbe). */
export function densify(geo, steps = 3) {
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
export const flatShape = (pts, depth = 0) => {
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  return depth ? new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 8 }) : new THREE.ShapeGeometry(sh, 8);
};

/** Mèche de cheveux : tube effilé et aplati qui suit une courbe passant par `pts` (base -> pointe). */
export function hairLock(pts, width, { flat = 0.46, segs = 22, ring = 14, taper = 1 } = {}) {
  const curve = pts.length === 3
    ? new THREE.QuadraticBezierCurve3(...pts.map((p) => new THREE.Vector3(...p)))
    : new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const pos = [], uv = [], idx = [];
  const c = new THREE.Vector3(), T = new THREE.Vector3(), R = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPoint(t, c);
    curve.getTangent(t, T);
    R.copy(c).normalize();
    side.crossVectors(T, R);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    up.crossVectors(side, T).normalize();
    const w = width * Math.pow(1 - Math.pow(t, 1.8 / taper), 0.7) * (0.85 + 0.15 * Math.min(1, t * 5)) + 0.003;
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
  return geo;
}

// ---------- Visage : dessiné « vu de face » puis reprojeté sur la sphère de la tête ----------
// Repère de dessin : centre de la tête (450, 320), rayon 119 px (même repère que Claude).
export const FACE = { cx: 450, cy: 320, r: 119 };
export function paintFront(drawFn, size = 1024) {
  const [, g] = canvas(size, size);
  const k = size / 2 / FACE.r;
  g.setTransform(k, 0, 0, k, size / 2 - FACE.cx * k, size / 2 - FACE.cy * k);
  drawFn(g);
  return g.getImageData(0, 0, size, size);
}
/** Reprojette l'image de face sur la texture équirectangulaire d'une sphère (devant = +z). */
export function frontToSphere(front, size, base = null, W2 = 2048, H2 = 1024) {
  const [c, g] = canvas(W2, H2);
  if (base) { g.fillStyle = base; g.fillRect(0, 0, W2, H2); }
  const out = g.getImageData(0, 0, W2, H2);
  for (let y = 0; y < H2; y++) {
    const theta = (y / H2) * Math.PI;
    const sy = Math.cos(theta), st = Math.sin(theta);
    for (let x = 0; x < W2; x++) {
      const phi = (x / W2) * Math.PI * 2;
      const X = -Math.cos(phi) * st, Z = Math.sin(phi) * st;
      if (Z < 0.05) continue;
      const px = Math.round((X * 0.5 + 0.5) * (size - 1)), py = Math.round((-sy * 0.5 + 0.5) * (size - 1));
      if (px < 0 || py < 0 || px >= size || py >= size) continue;
      const si = (py * size + px) * 4, di = (y * W2 + x) * 4;
      const a = front.data[si + 3] / 255;
      if (!a) continue;
      for (let ch = 0; ch < 3; ch++) out.data[di + ch] = out.data[di + ch] * (1 - a) + front.data[si + ch] * a;
      out.data[di + 3] = Math.max(out.data[di + 3], front.data[si + 3]);
    }
  }
  g.putImageData(out, 0, 0);
  return tex(c);
}

// ---------- Marche : jambes articulées (hanche -> genou) ----------
/**
 * Transforme des jambes construites « à plat » dans `body` en jambes articulées.
 * legs : [{ sd, hip:[x,y,z], knee:[x,y,z], thigh, shin, foot }] (positions monde).
 * Tout autre objet ajouté à `body` sur une jambe (revers, poches, genouillères…) suit la bonne partie :
 * au-dessus du genou -> cuisse, en dessous -> tibia. `keep` : objets de `body` qui ne bougent pas.
 */
export function articulateLegs(body, legs, keep = [], parent = body) {
  body.updateMatrixWorld(true);
  const extra = body.children.filter((o) => !keep.includes(o) && !legs.some((l) => [l.thigh, l.shin, l.foot].includes(o)));
  for (const l of legs) {
    l.hipPivot = new THREE.Group();
    l.hipPivot.position.set(...l.hip);
    parent.add(l.hipPivot);   // parent : bas du corps (peut pivoter vers la direction de la course)
    l.kneePivot = new THREE.Group();
    l.kneePivot.position.set(l.knee[0] - l.hip[0], l.knee[1] - l.hip[1], l.knee[2] - l.hip[2]);
    l.hipPivot.add(l.kneePivot);
    body.updateMatrixWorld(true);
    l.hipPivot.attach(l.thigh);
    l.kneePivot.attach(l.shin);
    if (l.foot) l.kneePivot.attach(l.foot);
  }
  const wp = new THREE.Vector3();
  for (const o of extra) {
    o.getWorldPosition(wp);
    if (Math.abs(wp.x) < 0.02 || wp.y > legs[0].hip[1]) continue;
    const l = legs.find((q) => Math.sign(q.sd) === Math.sign(wp.x));
    if (!l) continue;
    (wp.y >= l.knee[1] ? l.hipPivot : l.kneePivot).attach(o);
  }
}
/**
 * Cycle de marche : setWalk(0..1) depuis le jeu, apply() à chaque image (après la pose d'attente).
 * Cuisse en avant / arrière, genou plié pendant le passage de la jambe, balancement des bras, rebond.
 * Options (valeurs par défaut = marche des Strikers génériques) :
 *  - style 'run' : course. L'amplitude et la cadence varient comme √vitesse (leur produit suit la vitesse :
 *    les pieds ne glissent pas), le corps est au plus bas quand une jambe passe sous le bassin et au plus
 *    haut jambes écartées (phase de suspension), buste penché en avant, épaules en contre-rotation.
 */
export function createWalkCycle({ style = 'walk', rate = 11.5, hip = 0.62, knee = 0.95, bounce = 0.07, lean = 0.05, arms: swing = [0.5, 0.14], twist = 0.07 } = {}) {
  let target = 0, amt = 0, ph = 0;
  const run = style === 'run';
  return {
    set(v) { target = Math.max(0, Math.min(1, v)); },
    get amount() { return amt; },
    // opts.dir : −1 = recule (cycle inversé) ; opts.amp / opts.cadence : foulée plus courte et plus rapide
    apply(dt, { legs, arms, body, upper }, { dir = 1, amp = 1, cadence = 1 } = {}) {
      amt += (target - amt) * Math.min(1, dt * 10);
      if (amt < 0.002 && target === 0) { amt = 0; ph = 0; }
      const k = (run ? Math.sqrt(amt) : amt) * amp;
      ph += dt * rate * cadence * dir * (run ? Math.max(0.3, Math.sqrt(amt)) : 0.35 + 0.65 * amt);
      for (const l of legs) {
        const p = ph + (l.sd > 0 ? Math.PI : 0);
        l.hipPivot.rotation.x = -Math.sin(p) * hip * k;
        l.kneePivot.rotation.x = (Math.max(0, Math.cos(p)) * knee + (run ? 0.1 : 0.06)) * k;
      }
      if (arms[0]) arms[0].shoulder.rotation.x += Math.sin(ph) * swing[0] * k;
      if (arms[1]) arms[1].shoulder.rotation.x += Math.sin(ph + Math.PI) * swing[1] * k;
      body.position.y += (run ? Math.abs(Math.sin(ph)) : Math.abs(Math.cos(ph))) * bounce * k;
      upper.rotation.y += Math.sin(ph) * twist * k;
      upper.rotation.x += lean * k * (dir > 0 ? 1 : -0.5); // à reculons : buste légèrement en arrière
    },
  };
}

// ---------- Animateur commun des Strikers détaillés ----------
/**
 * Toutes les animations d'un personnage, en couches additives lissées (ressorts amortis, enveloppes douces) :
 *  1. respiration + transfert du poids d'une jambe à l'autre + regard qui se promène (attente),
 *  2. course orientée vers la vraie direction de déplacement (pas chassés, marche arrière),
 *     inclinaison dans les accélérations et dans les virages,
 *  3. visée (arme levée), recul de chaque tir, réaction aux coups, saut avec appel et réception,
 *  4. au menu : petits gestes de temps en temps (regarder son arme, s'étirer la nuque).
 * rig : { body, lower, upper, neckPivot, hair, arms: [{ shoulder, rest }], legs: [{ sd, hipPivot, kneePivot, ankle }] }
 * blink : { mat, open, closed } (textures du visage) ; extra(t, dt) : animations propres au personnage.
 */
export function createAnimator({ body, lower, upper, neckPivot, hair, arms, legs }, { walk, showcase = true, hasWeapon = false, blink = null, extra = null } = {}) {
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const damp = (x, target, k, dt) => x + (target - x) * (1 - Math.exp(-k * dt));
  const ease = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  // enveloppe : monte en `a` s, tient, redescend en `b` s (durée totale d)
  const envelope = (k, d, a, b) => ease(k / a) * ease((d - k) / b);
  // ressort amorti (x'' = −raideur·x − amortissement·x')
  const spring = (st, target, stiff, dampR, dt) => { st.v += (stiff * (target - st.x) - 2 * Math.sqrt(stiff) * dampR * st.v) * dt; st.x += st.v * dt; return st.x; };
  const rand = (a, b) => a + Math.random() * (b - a);
  const S = {
    motion: { speed: 0, rel: 0, turn: 0, aiming: false }, lowerYaw: 0, dirSign: 1, accel: 0, prevSpeed: 0, aim: 0, turnLean: 0,
    kick: { x: 0, v: 0 }, hit: { x: 0, v: 0 }, headYaw: { x: 0, v: 0 }, headPitch: { x: 0, v: 0 },
    look: [0, 0], lookT: rand(1.5, 3), blinkT: rand(1.5, 4), blink: 0, blinkTwice: false, fidget: null, fidgetT: rand(7, 11), wsPhase: Math.random() * 6,
  };
  let action = null;
  // points de contact des semelles (repère de chaque chaussure), mesurés à la création des chaussures
  const contacts = legs.filter((l) => l.foot?.userData.soles?.length).map((l) => ({ foot: l.foot, pts: l.foot.userData.soles }));
  const _m = new THREE.Matrix4(), _v = new THREE.Vector3();
  function soleLowest() {
    const ref = body.parent;
    if (!ref || !contacts.length) return null;
    ref.updateWorldMatrix(true, false);
    const inv = _m.copy(ref.matrixWorld).invert();
    let low = Infinity;
    for (const c of contacts) {
      c.foot.updateWorldMatrix(true, false);
      for (const p of c.pts) low = Math.min(low, _v.copy(p).applyMatrix4(c.foot.matrixWorld).applyMatrix4(inv).y);
    }
    return low;
  }
  function setMotion(mo) { Object.assign(S.motion, mo); }
  function shoot() { S.kick.v += 11; }
  function update(t, dt) {
    dt = Math.min(dt, 0.05);
    const mo = S.motion;
    // --- pose de base ---
    body.position.set(0, 0, 0); body.rotation.set(0, 0, 0);
    lower.rotation.set(0, 0, 0);
    upper.rotation.set(0, 0, 0);
    neckPivot.rotation.set(0, 0, 0);
    hair.rotation.set(0, 0, 0);
    for (const a of arms) { a.shoulder.rotation.set(0, 0, 0); a.shoulder.position.copy(a.rest); }
    for (const l of legs) l.hipPivot.rotation.z = 0;

    // --- course orientée : les jambes suivent la direction réelle du déplacement ---
    let rel = wrap(mo.rel ?? 0), dirSign = 1;
    if (Math.abs(rel) > 1.95) { dirSign = -1; rel = wrap(rel - Math.PI); }         // marche arrière
    if (mo.speed < 0.08) rel = 0;
    S.dirSign = dirSign;
    S.lowerYaw = damp(S.lowerYaw, clamp(rel, -1.05, 1.05), 9, dt);
    lower.rotation.y = S.lowerYaw;
    walk.apply(dt, { legs, arms, body, upper }, dirSign > 0 ? {} : { dir: -1, amp: 0.72, cadence: 1.3 });
    const moving = walk.amount, idle = 1 - clamp(moving * 1.6, 0, 1);
    // inclinaison : vers l'avant quand on accélère, en arrière quand on freine, vers l'intérieur des virages
    S.accel = damp(S.accel, (mo.speed - S.prevSpeed) / Math.max(dt, 1e-3), 6, dt);
    S.prevSpeed = mo.speed;
    body.rotation.x += clamp(S.accel * 0.03, -0.1, 0.12);
    S.turnLean = damp(S.turnLean, clamp(-(mo.turn ?? 0) * moving * 0.045, -0.14, 0.14), 8, dt);
    body.rotation.z += S.turnLean - Math.sin(S.lowerYaw) * 0.05 * moving * dirSign;

    // --- respiration ---
    const br = Math.sin(t * (Math.PI * 2) / (showcase ? 4.2 : 3.2));
    upper.rotation.x -= br * 0.012;
    for (const a of arms) a.shoulder.position.y += br * 0.005;
    neckPivot.rotation.x += br * 0.008;

    // --- transfert du poids (pieds qui restent au sol) ---
    const ws = Math.sin(t * (Math.PI * 2) / (showcase ? 7.5 : 5.5) + S.wsPhase) * (showcase ? 1 : 0.5) * idle;
    body.position.x += ws * 0.022;
    body.position.y -= Math.abs(ws) * 0.006;
    for (const l of legs) {
      l.hipPivot.rotation.z = -ws * 0.0256;                                      // les pieds restent en place
      const relaxed = Math.max(0, -Math.sign(l.sd) * ws);                         // jambe libre : genou souple
      l.hipPivot.rotation.x -= relaxed * 0.05;
      l.kneePivot.rotation.x += relaxed * 0.1;
    }
    upper.rotation.z -= ws * 0.025;
    neckPivot.rotation.z += ws * 0.03;

    // --- regard : la tête se pose sur un point, puis un autre (mouvement amorti, léger dépassement) ---
    S.lookT -= dt;
    if (S.lookT <= 0) {
      const wide = showcase ? 1 : 0.35;
      S.look = Math.random() < 0.3 ? [0, 0] : [rand(-0.42, 0.42) * wide, rand(-0.1, 0.12) * wide];
      S.lookT = rand(showcase ? 2.2 : 1.5, showcase ? 5 : 3.5);
      if (Math.abs(S.look[0] - S.headYaw.x) > 0.35 && Math.random() < 0.35) S.blinkT = 0.05;  // on cligne en tournant la tête
    }
    let lookYaw = S.look[0] * idle + clamp((mo.turn ?? 0) * 0.07, -0.35, 0.35);  // la tête devance les virages
    let lookPitch = S.look[1] * idle;

    // --- petits gestes au menu ---
    let fid = null;
    if (showcase && !action && idle > 0.95) {
      S.fidgetT -= dt;
      if (!S.fidget && S.fidgetT <= 0) {
        S.fidget = { name: hasWeapon && Math.random() < 0.6 ? 'weapon' : 'neck', t: 0 };
        S.fidget.d = S.fidget.name === 'weapon' ? 2.8 : 2.2;
      }
    }
    if (S.fidget) {
      const F = S.fidget;
      F.t += dt;
      const e = envelope(F.t, F.d, 0.55, 0.6) * idle;
      if (F.name === 'weapon') {            // il lève son arme et la regarde
        arms[1].shoulder.rotation.x -= 0.78 * e;
        arms[1].shoulder.rotation.z += 0.18 * e;
        arms[1].shoulder.rotation.y -= 0.25 * e;
        lookYaw = lookYaw * (1 - e) + 0.42 * e; lookPitch = lookPitch * (1 - e) - 0.3 * e;
        upper.rotation.y -= 0.08 * e;
      } else {                              // il s'étire la nuque (inclinaison d'un côté puis de l'autre)
        fid = Math.sin((F.t / F.d) * Math.PI * 2) * e;
        neckPivot.rotation.z += fid * 0.2;
        for (const a of arms) a.shoulder.position.y += 0.012 * e * Math.sin((F.t / F.d) * Math.PI * 4);
      }
      if (F.t >= F.d) { S.fidget = null; S.fidgetT = rand(8, 14); }
    }
    neckPivot.rotation.y += spring(S.headYaw, lookYaw, 30, 0.8, dt);
    neckPivot.rotation.x += spring(S.headPitch, lookPitch, 30, 0.85, dt);
    upper.rotation.y += S.headYaw.x * 0.15;
    hair.rotation.z = -S.headYaw.v * 0.006;   // la chevelure suit les mouvements de tête avec un léger retard

    // --- visée et tir (arène) ---
    S.aim = damp(S.aim, mo.aiming ? 1 : 0, 9, dt);
    if (!showcase) {
      arms[1].shoulder.rotation.x += -0.2 * S.aim + 0.14 * (1 - S.aim) * moving;  // arme levée en visant, basse en courant
      upper.rotation.y -= 0.08 * S.aim;
      arms[1].shoulder.rotation.y += 0.08 * S.aim;
    }
    const kick = spring(S.kick, 0, 260, 0.55, dt);
    arms[1].shoulder.rotation.x -= kick * 0.32;   // le canon remonte
    upper.rotation.y += kick * 0.05;              // l'épaule part en arrière
    upper.rotation.x -= kick * 0.03;

    // --- coup reçu : le buste et la tête partent en arrière, les genoux plient ---
    const hit = spring(S.hit, 0, 120, 0.5, dt);
    upper.rotation.x -= hit * 0.22;
    neckPivot.rotation.x -= hit * 0.25;
    body.position.y -= Math.abs(hit) * 0.03;
    for (const l of legs) { l.hipPivot.rotation.x -= Math.abs(hit) * 0.12; l.kneePivot.rotation.x += Math.abs(hit) * 0.24; }

    // --- actions ---
    if (action) {
      action.t += dt;
      const k = action.t;
      if (action.name === 'jump') {
        // appel (accroupi), suspension (jambes repliées, bras levé), réception (amorti)
        const pre = action.inPlace ? 0 : 0.16, air = action.inPlace ? 0.6 : 0.46, land = 0.24;
        let crouch = 0, up = 0, tuck = 0;
        if (k < pre) crouch = ease(k / pre);
        else if (k < pre + air) { const p = (k - pre) / air; up = Math.sin(p * Math.PI); tuck = Math.sin(p * Math.PI); crouch = Math.max(0, 1 - p * 6); }
        else { const q = (k - pre - air) / land; crouch = q < 0.25 ? q / 0.25 : 1 - ease((q - 0.25) / 0.75); }
        if (!action.inPlace) body.position.y += up * 0.5;
        body.position.y -= crouch * 0.07;
        for (const l of legs) { l.hipPivot.rotation.x -= crouch * 0.45 + tuck * 0.4; l.kneePivot.rotation.x += crouch * 0.9 + tuck * 0.85; }
        upper.rotation.x += crouch * 0.16 - up * 0.05;
        arms[0].shoulder.rotation.x += crouch * 0.4 - tuck * 0.3;
        arms[1].shoulder.rotation.x += crouch * 0.4;
        arms[1].shoulder.rotation.z += (action.inPlace ? 0.5 : 1.35) * tuck;   // bras levé
        lookPitch += up * 0.1;
        if (k >= pre + air + land) action = null;
      } else if (action.name === 'hit') {
        action = null;
      }
    }
    // la cheville compense la rotation de la jambe : à l'arrêt le pied reste exactement à plat ; en course
    // il suit en partie la jambe (déroulé du pas)
    const comp = 1 - 0.38 * clamp(moving * 1.4, 0, 1);
    for (const l of legs) l.anklePivot.rotation.x = -(l.hipPivot.rotation.x + l.kneePivot.rotation.x + body.rotation.x) * comp;
    // contact au sol : le point le plus bas des semelles est posé sur le sol (ni dans le sol, ni au-dessus),
    // sauf pendant un saut
    if (!(action?.name === 'jump')) {
      const lowest = soleLowest();
      if (lowest !== null) body.position.y -= lowest;
    }

    // --- clignements (intervalles irréguliers, parfois doubles) ---
    S.blinkT -= dt;
    if (S.blinkT <= 0 && S.blink <= 0) { S.blink = 0.1; S.blinkTwice = Math.random() < 0.15; S.blinkT = rand(2.5, 6); }
    if (S.blink > 0) { S.blink -= dt; if (S.blink <= 0 && S.blinkTwice) { S.blinkTwice = false; S.blink = 0.2; S.blinkT = rand(2.5, 6); } }
    const closed = S.blink > 0 && S.blink <= 0.1;
    if (blink && (blink.mat.map === blink.closed) !== closed) { blink.mat.map = closed ? blink.closed : blink.open; blink.mat.needsUpdate = true; }
    extra?.(t, dt);
  }
  function play(name) {
    if (name === 'hit') { S.hit.v += 9; return; }
    if (name === 'inspect' || name === 'stretch') {   // petits gestes (aussi déclenchés seuls au menu)
      S.fidget = { name: name === 'inspect' && hasWeapon ? 'weapon' : 'neck', t: 0 };
      S.fidget.d = S.fidget.name === 'weapon' ? 2.8 : 2.2;
      return;
    }
    action = { name, t: 0, inPlace: name === 'jump' && !showcase };
  }
  return { update, play, setMotion, shoot, setWalk: walk.set };
}
