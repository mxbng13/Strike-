// Scènes 3D IDREA (three.js) : bonnet en satin modélisé, oreiller, draps et cheveux mèche par mèche.
// Piloté par rendre.mjs : window.preparer(mode, options) -> nombre d'images ; window.rendre(i) -> dataURL PNG.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.72;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const pmrem = new THREE.PMREMGenerator(renderer);
const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// ------------------------------------------------------------------ bruit (valeur 3D lissée)
function hash(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function bruit(x, y, z = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const s = t => t * t * (3 - 2 * t);
  const u = s(xf), v = s(yf), w = s(zf);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
           l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w) * 2 - 1;
}
function fbm(x, y, z = 0, o = 4) {
  let a = 0, f = 1, amp = 0.5;
  for (let i = 0; i < o; i++) { a += amp * bruit(x * f, y * f, z * f + i * 7.1); f *= 2; amp *= 0.5; }
  return a;
}
let graine = 1;
const alea = () => (graine = (graine * 16807) % 2147483647) / 2147483647;
const gauss = () => Math.sqrt(-2 * Math.log(alea() + 1e-9)) * Math.cos(2 * Math.PI * alea());

// ------------------------------------------------------------------ textures procédurales
function textureCanvas(w, h, dessin) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  dessin(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// carte de normales à partir d'une fonction de hauteur
function normalesDepuis(w, h, hauteur, force = 2) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); const img = g.createImageData(w, h);
  const H = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) H[y * w + x] = hauteur(x / w, y / h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H[y * w + (x + 1) % w] - H[y * w + (x - 1 + w) % w]) * force;
    const dy = (H[((y + 1) % h) * w + x] - H[((y - 1 + h) % h) * w + x]) * force;
    const n = new THREE.Vector3(-dx, -dy, 1).normalize();
    const k = (y * w + x) * 4;
    img.data[k] = (n.x * .5 + .5) * 255; img.data[k + 1] = (n.y * .5 + .5) * 255; img.data[k + 2] = (n.z * .5 + .5) * 255; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
  return t;
}

// ------------------------------------------------------------------ BONNET
function bonnet() {
  const g = new THREE.Group();
  // profil de la calotte (r, y) : de la couture avec le bandeau jusqu'au sommet, très bouffant
  const profil = new THREE.SplineCurve([
    new THREE.Vector2(0.95, 0.38), new THREE.Vector2(1.16, 0.41), new THREE.Vector2(1.42, 0.52),
    new THREE.Vector2(1.55, 0.78), new THREE.Vector2(1.45, 1.06), new THREE.Vector2(1.08, 1.30),
    new THREE.Vector2(0.55, 1.42), new THREE.Vector2(0.0, 1.45)]);
  const NU = 900, NV = 240;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= NV; j++) {
    const v = j / NV;
    const p = profil.getPoint(v), t = profil.getTangent(v);
    const n2 = new THREE.Vector2(t.y, -t.x); // normale extérieure du profil
    for (let i = 0; i <= NU; i++) {
      const u = i / NU, th = u * Math.PI * 2;
      // fronces serrées près de l'élastique, grands plis souples vers le sommet
      const cx = Math.cos(th), sx = Math.sin(th);
      const ph = 3.0 * fbm(cx * 1.1, sx * 1.1, v * 1.8);
      const ampl = 0.55 + 0.45 * fbm(cx * 2.2 + 5, sx * 2.2, v * 1.5);   // plis irréguliers
      const serre = Math.pow(1 - v, 2.6);
      const lisse = (t, a, b) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
      const plis = Math.sin(th * 34 + ph * 4) * 0.05 * serre * ampl
        + Math.sin(th * 9 + ph * 2.5 + v * 2) * 0.07 * Math.sin(Math.PI * Math.min(1, v * 1.15)) * (1 - v * 0.5) * ampl
        + fbm(cx * 2.5, sx * 2.5, v * 4, 4) * 0.06 * (1 - v * 0.6);
      const sommet = Math.min(1, (1 - v) * 5); // le sommet reste lisse
      const d = plis * sommet * lisse(v, 0.0, 0.07); // couture propre avec le bandeau
      const rr = Math.max(0, p.x + n2.x * d), yy = p.y + n2.y * d;
      pos.push(rr * Math.cos(th), yy, rr * Math.sin(th));
      uv.push(u * 12, v * 3);
    }
  }
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const a = j * (NU + 1) + i, b = a + NU + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeTangents();
  const tissage = normalesDepuis(256, 256, (x, y) => Math.sin(x * Math.PI * 2 * 64) * 0.5 + Math.sin(y * Math.PI * 2 * 48) * 0.5, 0.15);
  const satin = new THREE.MeshPhysicalMaterial({
    color: 0x0b0b0d, roughness: 0.34, metalness: 0, sheen: 1, sheenColor: new THREE.Color(0x3a3a44), sheenRoughness: 0.45,
    anisotropy: 0.5, anisotropyRotation: Math.PI / 2, specularIntensity: 0.9, envMap, envMapIntensity: 1.05,
    normalMap: tissage, normalScale: new THREE.Vector2(0.15, 0.15), side: THREE.DoubleSide,
  });
  const calotte = new THREE.Mesh(geo, satin);
  calotte.castShadow = calotte.receiveShadow = true;
  g.add(calotte);
  // bandeau élastique en maille (paroi extérieure + intérieure + lèvre arrondie)
  const pts = [];
  const e = 0.045;
  for (let k = 0; k <= 12; k++) { const a = Math.PI + k / 12 * Math.PI; pts.push(new THREE.Vector2(0.975 - e + Math.cos(a) * e, 0.0 + Math.sin(a) * e * 0.8 + e * 0.8)); }
  pts.push(new THREE.Vector2(0.99, 0.43), new THREE.Vector2(0.92, 0.43));
  pts.reverse();
  const bande = new THREE.LatheGeometry(pts, 400);
  const maille = normalesDepuis(256, 256, (x, y) => Math.abs(Math.sin(x * Math.PI * 2 * 180)) * 0.7 + bruit(x * 400, y * 60) * 0.15, 0.6);
  maille.repeat.set(1, 1);
  const elastique = new THREE.MeshStandardMaterial({
    color: 0x111113, roughness: 0.82, metalness: 0, envMap, envMapIntensity: 0.6,
    normalMap: maille, normalScale: new THREE.Vector2(0.6, 0.6), side: THREE.DoubleSide,
  });
  const band = new THREE.Mesh(bande, elastique);
  band.castShadow = band.receiveShadow = true;
  g.add(band);
  // fond intérieur sombre (on voit l'ouverture)
  const fond = new THREE.Mesh(new THREE.CircleGeometry(0.93, 96), new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 1, side: THREE.DoubleSide }));
  fond.rotation.x = -Math.PI / 2; fond.position.y = 0.42;
  g.add(fond);
  return g;
}

// ------------------------------------------------------------------ OREILLER + DRAPS
const OA = 1.75, OB = 1.12, OH = 0.42; // demi-largeur, demi-profondeur, épaisseur
function hauteurOreiller(x, z) {
  const s = Math.pow(Math.abs(x / OA), 3.2) + Math.pow(Math.abs(z / OB), 3.2);
  if (s >= 1) return -1;
  const bombe = Math.pow(1 - s, 0.42);
  const creux = Math.exp(-((x + 0.05) ** 2 / 0.5 + (z - 0.05) ** 2 / 0.25)) * 0.09; // empreinte de la tête
  const plis = fbm(x * 1.6, z * 1.6, 3.3, 4) * 0.035 * bombe;
  return OH * bombe - creux + plis;
}
function hauteurDraps(x, z) {
  return fbm(x * 0.45, z * 0.45, 9.1, 4) * 0.12 + Math.sin(x * 0.9 + z * 0.4 + fbm(x * .3, z * .3) * 3) * 0.035;
}
function lit() {
  const g = new THREE.Group();
  const draps = new THREE.PlaneGeometry(16, 26, 320, 520);
  draps.rotateX(-Math.PI / 2);
  const p = draps.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, hauteurDraps(p.getX(i), p.getZ(i)) - 0.06);
  draps.computeVertexNormals();
  const lin = normalesDepuis(512, 512, (x, y) => bruit(x * 512, y * 6) * 0.5 + bruit(x * 6, y * 512) * 0.5 + bruit(x * 60, y * 60) * 0.3, 0.8);
  lin.repeat.set(6, 10);
  const mDraps = new THREE.MeshStandardMaterial({ color: 0x9c9690, roughness: 0.95, envMap, envMapIntensity: 0.5, normalMap: lin, normalScale: new THREE.Vector2(0.5, 0.5) });
  const mD = new THREE.Mesh(draps, mDraps); mD.receiveShadow = true; g.add(mD);
  const o = new THREE.PlaneGeometry(OA * 2.04, OB * 2.04, 520, 340);
  o.rotateX(-Math.PI / 2);
  const q = o.attributes.position;
  for (let i = 0; i < q.count; i++) {
    const h = hauteurOreiller(q.getX(i), q.getZ(i));
    q.setY(i, h < 0 ? -0.2 : h);
  }
  o.computeVertexNormals();
  const coton = normalesDepuis(512, 512, (x, y) => Math.sin(x * Math.PI * 2 * 128) * Math.sin(y * Math.PI * 2 * 128) * 0.4 + bruit(x * 300, y * 300) * 0.3, 0.5);
  coton.repeat.set(3, 2);
  const mO = new THREE.MeshStandardMaterial({ color: 0xc9c5bf, roughness: 0.9, envMap, envMapIntensity: 0.35, normalMap: coton, normalScale: new THREE.Vector2(0.4, 0.4) });
  const mesh = new THREE.Mesh(o, mO); mesh.castShadow = mesh.receiveShadow = true; g.add(mesh);
  return g;
}

// ------------------------------------------------------------------ CHEVEUX (mèches de brins, ombrage Kajiya-Kay)
function surface(x, z) {
  const h = hauteurOreiller(x, z);
  return h > 0 ? h : hauteurDraps(x, z) - 0.06;
}
function cheveux(type = 'macro') {
  // type « macro » : masse de cheveux en pagaille qui remplit le cadre ; « epars » : quelques cheveux tombés sur l'oreiller
  graine = type === 'macro' ? 4242 : 777;
  const P = [], T = [], C = [], A = [];
  const base = [[0.055, 0.032, 0.02], [0.075, 0.045, 0.026], [0.04, 0.025, 0.016], [0.10, 0.062, 0.035]];
  const macro = type === 'macro';
  const NMECHES = macro ? 420 : 14;
  for (let m = 0; m < NMECHES; m++) {
    let gx, gz, ang;
    if (macro) { // les mèches entrent par le haut et les côtés et se croisent dans tous les sens
      gx = -1.1 + alea() * 2.2; gz = -1.8 + alea() * 0.9;
      ang = Math.PI / 2 + gauss() * 0.9;
    } else {
      gx = -1.2 + alea() * 2.4; gz = -0.7 + alea() * 1.4; ang = alea() * Math.PI * 2;
    }
    const L = macro ? 2.2 + alea() * 1.6 : 0.4 + alea() * 0.6, pas = 0.016, n = Math.floor(L / pas);
    const guide = [];
    const seed = alea() * 100;
    for (let k = 0; k < n; k++) {
      guide.push([gx, gz, ang]);
      ang += fbm(gx * 1.4 + seed, gz * 1.4, 1.7, 3) * (macro ? 0.34 : 0.12) + Math.sin(k * 0.12 + seed) * 0.04;
      gx += Math.cos(ang) * pas; gz += Math.sin(ang) * pas;
    }
    const col = base[Math.floor(alea() * base.length)];
    const brins = macro ? 46 + Math.floor(alea() * 30) : 1 + Math.floor(alea() * 3);
    for (let s = 0; s < brins; s++) {
      const off0 = gauss() * (macro ? 0.016 : 0.002), offE = gauss() * (macro ? 0.04 + alea() * 0.06 : 0.004);
      const frisotti = macro && alea() < 0.35;
      const envol = macro && alea() < 0.12; // mèches rebelles qui se dressent
      const longueur = n * (0.55 + alea() * 0.45);
      const ph = alea() * 100;
      const teinte = 0.7 + alea() * 0.6;
      const couche = macro ? alea() * 0.16 : 0;
      let prev = null;
      for (let k = 0; k < longueur; k++) {
        const [x, z, an] = guide[k];
        const f = k / n;
        const off = off0 + (offE - off0) * Math.min(1, f * 1.4) + bruit(k * 0.12, ph) * 0.007;
        let px = x - Math.sin(an) * off, pz = z + Math.cos(an) * off;
        let py = surface(px, pz) + 0.004 + couche * (0.6 + 0.4 * bruit(k * 0.05, ph + 9));
        if (frisotti && f > 0.25) { // frisottis : boucles irrégulières qui se soulèvent
          const r = (0.004 + 0.012 * f) * (0.6 + 0.8 * Math.abs(bruit(k * 0.08, ph + 1)));
          const w = k * (0.5 + 0.6 * Math.abs(bruit(ph, 3))) + 3 * bruit(k * 0.05, ph);
          px += Math.cos(w + ph) * r; pz += Math.sin(w + ph) * r;
          py += (0.5 + 0.5 * Math.sin(k * 0.37 + ph)) * 0.05 * f;
        }
        if (envol) py += Math.max(0, Math.sin(f * Math.PI * 1.3 + ph)) * 0.22 * f;
        const cur = new THREE.Vector3(px, py, pz);
        if (prev) {
          const t = cur.clone().sub(prev).normalize();
          P.push(prev.x, prev.y, prev.z, cur.x, cur.y, cur.z);
          T.push(t.x, t.y, t.z, t.x, t.y, t.z);
          const ao = macro ? 0.4 + 0.6 * Math.min(1, (py - surface(px, pz)) / 0.16) : 0.9;
          for (let q = 0; q < 2; q++) { C.push(col[0] * teinte, col[1] * teinte, col[2] * teinte); A.push(ao); }
        }
        prev = cur;
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('tangente', new THREE.Float32BufferAttribute(T, 3));
  geo.setAttribute('couleur', new THREE.Float32BufferAttribute(C, 3));
  geo.setAttribute('ao', new THREE.Float32BufferAttribute(A, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: true,
    uniforms: { lumiere: { value: new THREE.Vector3(-0.5, 1.0, 0.6).normalize() }, teinteLum: { value: new THREE.Color(1, 0.97, 0.92) } },
    vertexShader: `attribute vec3 tangente; attribute vec3 couleur; attribute float ao;
      varying vec3 vT; varying vec3 vC; varying float vA; varying vec3 vV;
      void main(){ vT = normalize(tangente); vC = couleur; vA = ao;
        vec4 w = modelMatrix * vec4(position,1.0); vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 lumiere; uniform vec3 teinteLum; varying vec3 vT; varying vec3 vC; varying float vA; varying vec3 vV;
      void main(){ vec3 L = lumiere; float tl = dot(vT, L); float diff = sqrt(max(0.0, 1.0 - tl*tl));
        vec3 Hh = normalize(L + vV); float th = dot(vT, Hh); float s = sqrt(max(0.0, 1.0 - th*th));
        float th2 = dot(vT, normalize(Hh + vec3(0.0,0.12,0.0))); float s2 = sqrt(max(0.0, 1.0 - th2*th2));
        vec3 c = vC * (0.35 + 0.75*diff) * teinteLum + teinteLum * pow(s, 110.0) * 0.18 + vC * 3.0 * pow(s2, 20.0) * 0.5;
        gl_FragColor = vec4(c * vA, 0.85);
        #include <colorspace_fragment>
      }`,
  });
  return new THREE.LineSegments(geo, mat);
}

// ------------------------------------------------------------------ éclairages
function lumieres(scene, preset) {
  const P = {
    studio: { amb: [0xffffff, 0.35], key: [0xfff4e8, 3.2, [3, 6, 4]], rim: [0xffffff, 2.2, [-4, 3, -3]], fill: [0xffe8d8, 0.8, [-3, 2, 4]] },
    jour: { amb: [0xeef2ff, 0.3], key: [0xfff6ea, 2.4, [-7, 3.2, 1.5]], rim: [0xdfe8ff, 0.5, [4, 3, -3]], fill: [0xffffff, 0.2, [2, 3, 4]] },
    soir: { amb: [0xffcf9a, 0.25], key: [0xffb36b, 2.4, [4, 4, -1]], rim: [0xff9a5a, 0.5, [-4, 2, -3]], fill: [0x6a5a50, 0.2, [-2, 3, 4]] },
    nuit: { amb: [0x6070a0, 0.18], key: [0x9fb4ff, 1.1, [-3, 6, -2]], rim: [0x7a8cff, 0.4, [4, 2, 3]], fill: [0x202840, 0.2, [2, 3, 4]] },
    matin: { amb: [0xfff0dc, 0.6], key: [0xfff1d6, 3.0, [-5, 5, 1]], rim: [0xffffff, 0.5, [4, 3, -3]], fill: [0xffffff, 0.35, [2, 3, 4]] },
  }[preset];
  scene.add(new THREE.AmbientLight(...P.amb));
  const k = new THREE.DirectionalLight(P.key[0], P.key[1]);
  k.position.set(...P.key[2]); k.castShadow = true;
  k.shadow.mapSize.set(4096, 4096); k.shadow.camera.left = -5; k.shadow.camera.right = 5; k.shadow.camera.top = 5; k.shadow.camera.bottom = -5;
  k.shadow.radius = 6; k.shadow.bias = -0.0004; k.shadow.normalBias = 0.02;
  scene.add(k);
  for (const l of [P.rim, P.fill]) { const d = new THREE.DirectionalLight(l[0], l[1]); d.position.set(...l[2]); scene.add(d); }
  return k;
}

// ------------------------------------------------------------------ modes
let plan = null;
window.preparer = (mode, o) => {
  const scene = new THREE.Scene();
  scene.environment = envMap;
  if (mode === 'bonnet') {
    // tour complet du bonnet (fond transparent)
    // le bonnet tourne sur son propre axe : l'angle de vue (ouverture visible) reste celui de la photo produit
    const b = bonnet(); const tour = new THREE.Group(); b.position.y = -0.75; tour.add(b);
    const pivot = new THREE.Group(); pivot.add(tour); pivot.rotation.x = -0.72; pivot.rotation.z = 0.2; scene.add(pivot);
    lumieres(scene, 'studio');
    const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 100); cam.position.set(0, 0.9, 7.4); cam.lookAt(0, 0.05, 0);
    const n = o.n || 72, taille = o.taille || 1200;
    plan = { n, rendre: i => { tour.rotation.y = i / n * Math.PI * 2; renderer.setSize(taille, taille); renderer.setClearColor(0, 0); renderer.render(scene, cam); },
             nom: i => `bonnet_${String(i).padStart(3, '0')}.png` };
    return n;
  }
  if (mode === 'lit') {
    // vue de dessus du lit : draps + oreiller (+ cheveux en vrac, ou bonnet posé), fond opaque
    scene.add(lit());
    lumieres(scene, o.lumiere || 'jour');
    if (o.cheveux) scene.add(cheveux('epars'));
    if (o.bonnet) {
      // posé sur l'oreiller, légèrement incliné vers la caméra
      const b = bonnet(); b.scale.setScalar(0.52); b.rotation.set(-0.22, 0.5, 0.05);
      b.position.set(0.1, hauteurOreiller(0.1, 0.15) - 0.04, 0.15); scene.add(b);
    }
    const cam = new THREE.PerspectiveCamera(30, 9 / 16, 0.1, 100);
    cam.position.set(0, 9.2, 4.2); cam.lookAt(0, 0, 0.35);
    const w = o.w || 2160, h = Math.round(w * 16 / 9);
    plan = { n: 1, rendre: () => { renderer.setSize(w, h); renderer.setClearColor(0x000000, 1); renderer.render(scene, cam); },
             nom: () => `${o.nom || 'lit'}.png` };
    return 1;
  }
  if (mode === 'macro') {
    // gros plan : cheveux en pagaille sur l'oreiller, qui remplissent tout le cadre
    scene.add(lit()); scene.add(cheveux('macro'));
    lumieres(scene, 'jour');
    const cam = new THREE.PerspectiveCamera(30, 9 / 16, 0.1, 100);
    cam.position.set(0.1, 4.3, 1.5); cam.lookAt(0, 0.4, 0.1);
    const w = o.w || 2160, h = Math.round(w * 16 / 9);
    plan = { n: 1, rendre: () => { renderer.setSize(w, h); renderer.setClearColor(0, 1); renderer.render(scene, cam); },
             nom: () => `${o.nom || 'macro'}.png` };
    return 1;
  }
  throw new Error('mode inconnu ' + mode);
};
window.rendre = i => { plan.rendre(i); return renderer.domElement.toDataURL('image/png'); };
window.nom = i => plan.nom(i);
window.pret = true;
