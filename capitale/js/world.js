// La carte 3D : terrain, capitale, avant-postes, marqueurs des lieux, avatar, caméra, jour/nuit et météo.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---------------------------------------------------------------------------
// Réglages du monde
// ---------------------------------------------------------------------------
export const MAP = 8000;
const HALF = MAP / 2;
const SEG = 512;
export const CAP_Y = 22;
const CAP_FLAT = 215;
const CAP_BLEND = 520;
const MIN_DIST = 30, MAX_DIST = 11000;

// ---------------------------------------------------------------------------
// Bruit procédural (déterministe : même carte à chaque lancement)
// ---------------------------------------------------------------------------
function hash(ix, iz, s) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, z, s) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz, s), b = hash(ix + 1, iz, s), c = hash(ix, iz + 1, s), d = hash(ix + 1, iz + 1, s);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
function fbm(x, z, oct, s) {
  let v = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { v += a * vnoise(x * f, z * f, s + i * 17); n += a; a *= 0.5; f *= 2.03; }
  return v / n;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function rawHeight(x, z) {
  const nx = x / 1500, nz = z / 1500;
  const base = fbm(nx, nz, 6, 1);
  const ridge = 1 - Math.abs(fbm(nx * 1.6 + 3.1, nz * 1.6 - 5.7, 5, 7) * 2 - 1);
  const mask = smooth(0.54, 0.74, fbm(nx * 0.45 + 11, nz * 0.45 + 4, 3, 3));
  let h = (base - 0.45) * 380;
  h += Math.pow(ridge, 3) * mask * 520;
  const r = Math.hypot(x, z);
  h += (1 - smooth(0, 1100, r)) * 45;
  const e = Math.max(Math.abs(x), Math.abs(z)) / HALF;
  h -= smooth(0.8, 1.0, e) * 300;
  return Math.max(h, -45);
}
export function heightAt(x, z) {
  const t = smooth(CAP_FLAT, CAP_BLEND, Math.hypot(x, z));
  return CAP_Y + (rawHeight(x, z) - CAP_Y) * t;
}
export const forestAt = (x, z) => fbm(x / 600, z / 600, 4, 21);
export function climateAt(x, z) {
  const h = heightAt(x, z);
  if (h > 230) return 'froid';
  if (z > 1300 && h < 150) return 'chaud';
  return 'tempere';
}

const C = (hex) => new THREE.Color(hex);
const PAL = {
  deep: C('#3f7f8f'), sand: C('#dccb98'), grassA: C('#86b852'), grassB: C('#4f8d3c'), dry: C('#a9a65e'),
  rock: C('#857f76'), rockDark: C('#5f5b56'), snow: C('#f1f4f8'), hot: C('#c9b26a'),
};
const tmpC = new THREE.Color(), tmpC2 = new THREE.Color();
export function terrainColor(h, slope, x, z, out) {
  const n = vnoise(x / 110, z / 110, 5) * 0.6 + vnoise(x / 27, z / 27, 9) * 0.4;
  if (h < -1) out.copy(PAL.sand).lerp(PAL.deep, clamp(-h / 45, 0, 1));
  else if (h < 6) out.copy(PAL.sand);
  else if (h < 170) {
    out.copy(PAL.grassA).lerp(PAL.grassB, n);
    out.lerp(PAL.dry, smooth(90, 170, h) * 0.6);
    out.lerp(PAL.hot, smooth(1100, 1700, z) * 0.55 * (1 - smooth(120, 170, h)));   // sud chaud plus sec
    out.lerp(PAL.sand, 1 - smooth(6, 14, h));
  } else if (h < 330) { tmpC.copy(PAL.dry).lerp(PAL.rock, smooth(170, 260, h)); out.copy(tmpC); }
  else out.copy(PAL.rock).lerp(PAL.snow, smooth(340, 400, h + n * 30));
  const rocky = smooth(0.24, 0.5, slope);
  if (rocky > 0 && h > 4) { tmpC2.copy(PAL.rockDark).lerp(PAL.rock, n); out.lerp(tmpC2, rocky); }
  return out;
}

// ---------------------------------------------------------------------------
// Recherche d'emplacements pour les avant-postes (toujours les mêmes)
// ---------------------------------------------------------------------------
function findSpot(score) {
  let best = null, bs = -Infinity;
  for (let i = -60; i <= 60; i++) for (let j = -60; j <= 60; j++) {
    const x = i * 62, z = j * 62;
    const sc = score(x, z, heightAt(x, z), Math.hypot(x, z));
    if (sc > bs) { bs = sc; best = [x, z]; }
  }
  return best;
}
const slopeAt = (x, z) => Math.abs(heightAt(x + 15, z) - heightAt(x - 15, z)) + Math.abs(heightAt(x, z + 15) - heightAt(x, z - 15));
function computeSites() {
  const S = {};
  const far = (pts, x, z, min) => pts.every(([a, b]) => Math.hypot(a - x, b - z) > min);
  const taken = [[0, 0]];
  const put = (id, f) => { S[id] = findSpot((x, z, h, r) => (far(taken, x, z, 700) ? f(x, z, h, r) : -Infinity)); taken.push(S[id]); };
  put('volcan', (x, z, h, r) => (r < 3600 ? h : -Infinity));
  put('ferme', (x, z, h, r) => (h > 30 && h < 110 && r > 600 && r < 1600 && forestAt(x, z) < 0.5 ? 100 - slopeAt(x, z) * 3 - Math.abs(r - 1000) * 0.02 : -Infinity));
  put('foret', (x, z, h, r) => (h > 30 && h < 200 && r > 600 && r < 2000 ? forestAt(x, z) * 100 - slopeAt(x, z) - r * 0.004 : -Infinity));
  put('mine', (x, z, h, r) => (h > 240 && h < 340 && r > 600 && r < 2600 ? 100 - slopeAt(x, z) * 2 - r * 0.01 : -Infinity));
  put('port', (x, z, h, r) => {
    if (h < 3 || h > 12 || r < 700 || r > 2800) return -Infinity;
    let water = 0;
    for (let a = 0; a < 8; a++) if (heightAt(x + Math.cos(a * 0.785) * 80, z + Math.sin(a * 0.785) * 80) < -2) water++;
    return water > 1 && water < 6 ? 100 - r * 0.01 - slopeAt(x, z) : -Infinity;
  });
  put('puits', (x, z, h, r) => (h > 15 && h < 90 && z > 1100 && r < 3200 ? 100 - slopeAt(x, z) * 2 - Math.abs(r - 2000) * 0.01 : -Infinity));
  put('foret_ancienne', (x, z, h, r) => (h > 40 && h < 230 && r > 1800 && r < 3300 ? forestAt(x, z) * 100 - slopeAt(x, z) : -Infinity));
  put('cratere', (x, z, h, r) => (h > 20 && h < 160 && r < 3500 ? r * 0.03 - slopeAt(x, z) * 2 : -Infinity));
  return S;
}

// ---------------------------------------------------------------------------
export function createWorld(canvas, places, sites) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const HORIZON = C('#cfe0ec');
  scene.fog = new THREE.Fog(HORIZON.clone(), 1000, 8000);
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 1, 60000);

  const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.4, 1.6);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const skyU = { top: { value: C('#2f63b0') }, horizon: { value: HORIZON.clone() } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
    vertexShader: `varying vec3 vW; void main(){ vW = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vW;
      void main(){ float h = max(vW.y, 0.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.55)), 1.0); }`,
  }));
  sky.frustumCulled = false; sky.renderOrder = -1;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(C('#a9cdfa'), C('#3d4a35'), 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(C('#ffe6c2'), 2.1);
  sun.position.set(320, 420 + CAP_Y, 180);
  sun.target.position.set(0, CAP_Y, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -230, right: 230, top: 230, bottom: -230, near: 10, far: 1600 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);

  // ------------------------------------------------------------------ terrain
  let terrain;
  function buildTerrain() {
    const geo = new THREE.PlaneGeometry(MAP, MAP, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals();
    const nor = geo.attributes.normal;
    const colors = new Float32Array(pos.count * 3);
    const col = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      terrainColor(pos.getY(i), 1 - nor.getY(i), pos.getX(i), pos.getZ(i), col);
      colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
    terrain.receiveShadow = true;
    scene.add(terrain);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(MAP * 6, MAP * 6), new THREE.MeshStandardMaterial({
      color: C('#2a86c0'), roughness: 0.18, metalness: 0.15, transparent: true, opacity: 0.86 }));
    water.rotation.x = -Math.PI / 2;
    scene.add(water);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(MAP * 6, MAP * 6), new THREE.MeshStandardMaterial({ color: PAL.deep, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -45.5;
    scene.add(floor);
  }

  function buildForests(avoid) {
    const MAX = 32000;
    const geo = new THREE.ConeGeometry(1, 1, 6);
    geo.translate(0, 0.5, 0);
    const trees = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), MAX);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const greens = [C('#2f6b2c'), C('#3c7d33'), C('#285a2a'), C('#4a8a3a')];
    const col = new THREE.Color();
    let n = 0, seed = 0;
    const rnd = () => hash(seed++, 77, 991);
    for (let tries = 0; tries < 400000 && n < MAX; tries++) {
      const x = (rnd() - 0.5) * MAP * 0.96, z = (rnd() - 0.5) * MAP * 0.96;
      if (Math.hypot(x, z) < 260) continue;
      if (avoid.some(([ax, az]) => Math.hypot(ax - x, az - z) < 75)) continue;
      const f = forestAt(x, z);
      if (f < 0.53 + rnd() * 0.08) continue;
      const h = heightAt(x, z);
      if (h < 8 || h > 260) continue;
      const slope = Math.abs(heightAt(x + 8, z) - h) + Math.abs(heightAt(x, z + 8) - h);
      if (slope > 9) continue;
      const r = 5 + rnd() * 4, ht = 16 + rnd() * 14;
      p.set(x, h - 1, z); s.set(r, ht, r);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rnd() * 6.28);
      trees.setMatrixAt(n, m.compose(p, q, s));
      trees.setColorAt(n, col.copy(greens[(rnd() * greens.length) | 0]).multiplyScalar(0.85 + rnd() * 0.3));
      n++;
    }
    trees.count = n;
    scene.add(trees);
  }

  // ------------------------------------------------------------------ matériaux
  const polar = (r, a) => [r * Math.sin(a), r * Math.cos(a)];
  const glow = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), toneMapped: false });
  const MAT = {
    metal: new THREE.MeshStandardMaterial({ color: C('#d4dbe3'), metalness: 0.65, roughness: 0.32 }),
    white: new THREE.MeshStandardMaterial({ color: C('#d9dfe6'), metalness: 0.35, roughness: 0.4 }),
    dark: new THREE.MeshStandardMaterial({ color: C('#232b37'), metalness: 0.6, roughness: 0.4 }),
    pave: new THREE.MeshStandardMaterial({ color: C('#6d7783'), metalness: 0.1, roughness: 0.8 }),
    road: new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, color: C('#434b56'), metalness: 0.2, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    glass: new THREE.MeshStandardMaterial({ color: C('#7fd8ff'), metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.45, emissive: C('#1a6a8a'), emissiveIntensity: 0.6 }),
    wood: new THREE.MeshStandardMaterial({ color: C('#8a5a35'), roughness: 0.85 }),
    red: glow(4.5, 0.5, 0.4), cyan: glow(0.4, 3.2, 4.2), cyanSoft: glow(0.25, 1.6, 2.2), amber: glow(4.0, 2.0, 0.5),
    green: glow(0.6, 3.6, 1.0), pink: glow(3.8, 0.7, 3.0), violet: glow(1.8, 0.8, 4.2),
  };
  const ACCENTS = [MAT.cyan, MAT.amber, MAT.green, MAT.pink, MAT.violet];

  function windowTexture(cols, rows, seed) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 128, 256);
    const cw = 128 / cols, rh = 256 / rows;
    let k = seed;
    for (let r = 0; r < rows; r++) for (let i = 0; i < cols; i++) {
      const v = hash(k++, r, 4242);
      if (v < 0.58) { g.fillStyle = v < 0.47 ? '#9fefff' : '#ffd08a'; g.fillRect(i * cw + cw * 0.18, r * rh + rh * 0.28, cw * 0.64, rh * 0.44); }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  const windowMats = [];
  function towerMat(cols, rows, seed, rx = 1, ry = 1) {
    const t = windowTexture(cols, rows, seed);
    t.repeat.set(rx, ry);
    const m = new THREE.MeshStandardMaterial({ color: C('#2c3644'), metalness: 0.8, roughness: 0.28, emissive: C('#ffffff'), emissiveMap: t, emissiveIntensity: 2.4 });
    windowMats.push(m);
    return m;
  }

  const city = new THREE.Group();
  city.position.y = CAP_Y;
  scene.add(city);
  const animated = [];
  const spots = {};       // id d'emplacement -> [x, z] (monde)

  function add(geo, mat, x = 0, y = 0, z = 0, parent = city, shadow = true) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (shadow && !(mat instanceof THREE.MeshBasicMaterial)) { m.castShadow = true; m.receiveShadow = true; }
    parent.add(m);
    return m;
  }
  const hexRing = (r, h, mat, y, parent = city) => add(new THREE.CylinderGeometry(r, r, h, 6, 1, true), mat, 0, y, 0, parent, false);

  function buildShip(scale) {
    const g = new THREE.Group();
    add(new THREE.CapsuleGeometry(1.1, 5, 4, 10).rotateX(Math.PI / 2), MAT.white, 0, 0, 0, g);
    add(new THREE.BoxGeometry(7, 0.25, 2.2), MAT.metal, 0, 0, 0.6, g);
    add(new THREE.SphereGeometry(0.8, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2), MAT.glass, 0, 0.5, -2.2, g, false);
    for (const x of [-3.2, 3.2]) add(new THREE.CylinderGeometry(0.45, 0.45, 2.4, 8).rotateX(Math.PI / 2), MAT.dark, x, 0, 1, g);
    for (const x of [-3.2, 3.2]) add(new THREE.SphereGeometry(0.42, 8, 6), MAT.cyan, x, 0, 2.3, g);
    add(new THREE.SphereGeometry(0.6, 8, 6), MAT.amber, 0, 0, 3.4, g);
    g.scale.setScalar(scale);
    return g;
  }

  function buildRoad(angle, r0, r1) {
    const dirx = Math.sin(angle), dirz = Math.cos(angle);
    const px = Math.cos(angle), pz = -Math.sin(angle);
    const W = 5.5, step = 6;
    const n = Math.ceil((r1 - r0) / step) + 1;
    const pos = [], idx = [], dots = [];
    for (let i = 0; i < n; i++) {
      const r = r0 + i * step;
      const cx = dirx * r, cz = dirz * r;
      const y = r < 120 ? CAP_Y + 0.25 : Math.max(heightAt(cx, cz), 0.3) + 1.2;
      for (const s of [-1, 1]) pos.push(cx + px * W * s, y, cz + pz * W * s);
      if (i % 2 === 0) for (const s of [-1, 1]) dots.push([cx + px * (W - 0.8) * s, y + 0.05, cz + pz * (W - 0.8) * s]);
      if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const road = new THREE.Mesh(geo, MAT.road);
    road.receiveShadow = true;
    scene.add(road);
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.25, 2.2), MAT.cyanSoft, dots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, angle), one = new THREE.Vector3(1, 1, 1);
    dots.forEach((d, k) => inst.setMatrixAt(k, m.compose(new THREE.Vector3(...d), q, one)));
    scene.add(inst);
  }

  // ------------------------------------------------------------------ capitale
  const WALL_R = 118, PLAZA_R = 70;
  const ROADS = [Math.PI / 6, Math.PI / 6 + 2 * Math.PI / 3, Math.PI / 6 + 4 * Math.PI / 3];
  const SLOTS = [Math.PI / 2, Math.PI / 2 + 2 * Math.PI / 3, Math.PI / 2 + 4 * Math.PI / 3];
  const spot = (id, x, z) => { spots[id] = [x, z]; };

  function buildCapital() {
    add(new THREE.CylinderGeometry(WALL_R + 2, WALL_R + 6, 3, 6), MAT.pave, 0, -1.2, 0);
    add(new THREE.CylinderGeometry(PLAZA_R, PLAZA_R + 3, 3, 6), MAT.dark, 0, 1.5, 0);
    hexRing(PLAZA_R + 0.15, 0.5, MAT.cyan, 2.9);
    add(new THREE.CylinderGeometry(PLAZA_R - 8, PLAZA_R - 8, 0.4, 6), MAT.white, 0, 3.2, 0);
    hexRing(PLAZA_R - 7.9, 0.25, MAT.cyanSoft, 3.35);
    for (const a of ROADS) buildRoad(a, 56, 900);
    // anneau de faubourg pavé
    const ring = add(new THREE.RingGeometry(150, 186, 72).rotateX(-Math.PI / 2), MAT.pave, 0, 0.15, 0, city, false);
    ring.receiveShadow = true;

    // flèche centrale
    const spire = new THREE.Group(); spire.position.y = 3.4; city.add(spire);
    add(new THREE.CylinderGeometry(16, 20, 8, 8), MAT.metal, 0, 4, 0, spire);
    add(new THREE.CylinderGeometry(20.2, 20.2, 0.6, 8, 1, true), MAT.cyan, 0, 1, 0, spire);
    add(new THREE.CylinderGeometry(12, 15, 14, 8), MAT.dark, 0, 15, 0, spire);
    add(new THREE.CylinderGeometry(5.5, 9.5, 74, 8), towerMat(6, 40, 1, 4, 3), 0, 59, 0, spire);
    for (const [y, r] of [[30, 8.9], [52, 7.7], [74, 6.6], [92, 5.7]]) {
      const rr = add(new THREE.TorusGeometry(r + 0.6, 0.35, 6, 32), MAT.cyan, 0, y, 0, spire);
      rr.rotation.x = Math.PI / 2;
    }
    add(new THREE.CylinderGeometry(9, 4.5, 7, 8), MAT.metal, 0, 99, 0, spire);
    add(new THREE.CylinderGeometry(2.8, 2.8, 1, 16), MAT.cyan, 0, 103, 0, spire);
    add(new THREE.CylinderGeometry(0.5, 1.2, 22, 6), MAT.metal, 0, 114, 0, spire);
    const beacon = add(new THREE.SphereGeometry(1.6, 16, 12), MAT.red, 0, 125.5, 0, spire);
    animated.push((t) => { beacon.scale.setScalar(0.7 + 0.5 * (0.5 + 0.5 * Math.sin(t * 3))); });
    const halo = new THREE.Group(); halo.position.y = 64; spire.add(halo);
    const r1 = add(new THREE.TorusGeometry(19, 0.7, 8, 64), MAT.cyan, 0, 0, 0, halo);
    const r2 = add(new THREE.TorusGeometry(25, 0.5, 8, 64), MAT.amber, 0, 0, 0, halo);
    const r1g = new THREE.Group(); r1g.add(r1); halo.add(r1g);
    const r2g = new THREE.Group(); r2g.add(r2); halo.add(r2g);
    r1.rotation.x = Math.PI / 2 + 0.25; r2.rotation.x = Math.PI / 2 - 0.35;
    animated.push((t) => { r1g.rotation.y = t * 0.6; r2g.rotation.y = -t * 0.4; halo.position.y = 64 + Math.sin(t * 0.8) * 2; });
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const [bx, bz] = polar(22, a);
      const b = add(new THREE.BoxGeometry(2.2, 1.2, 26), MAT.white, bx, 24, bz, spire);
      b.rotation.y = a; b.rotation.x = -0.55;
    }
    // portail et banque au pied de la flèche
    {
      const [px, pz] = polar(31, ROADS[0]);
      const g = new THREE.Group(); g.position.set(px, 3.4, pz); g.rotation.y = ROADS[0]; city.add(g);
      const ringP = add(new THREE.TorusGeometry(6, 0.7, 10, 40), MAT.violet, 0, 7, 0, g);
      const disc = add(new THREE.CircleGeometry(5.4, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 0.3, 2.2), transparent: true, opacity: 0.5, side: THREE.DoubleSide, toneMapped: false }), 0, 7, 0, g, false);
      add(new THREE.CylinderGeometry(4, 5, 1, 12), MAT.dark, 0, 0.5, 0, g);
      animated.push((t) => { ringP.rotation.z = t; disc.material.opacity = 0.35 + 0.2 * Math.sin(t * 3); });
      spot('core:spire', px, pz);
      const [qx, qz] = polar(31, ROADS[1]);
      const b = new THREE.Group(); b.position.set(qx, 3.4, qz); b.rotation.y = ROADS[1]; city.add(b);
      add(new THREE.BoxGeometry(12, 9, 9), MAT.white, 0, 4.5, 0, b);
      for (let k = -2; k <= 2; k++) add(new THREE.CylinderGeometry(0.6, 0.6, 9, 8), MAT.metal, k * 2.6, 4.5, 4.8, b);
      add(new THREE.BoxGeometry(12.4, 0.5, 9.4), MAT.amber, 0, 9.2, 0, b);
      spot('core:spire2', qx, qz);
    }

    // dôme de recherche
    {
      const [x, z] = polar(43, SLOTS[0]);
      const g = new THREE.Group(); g.position.set(x, 3.4, z); city.add(g);
      add(new THREE.CylinderGeometry(15, 16, 2.4, 24), MAT.metal, 0, 1.2, 0, g);
      add(new THREE.CylinderGeometry(15.1, 15.1, 0.5, 24, 1, true), MAT.cyan, 0, 2.2, 0, g);
      add(new THREE.SphereGeometry(14, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), MAT.glass, 0, 2.4, 0, g, false);
      for (let i = 0; i < 6; i++) { const rib = add(new THREE.TorusGeometry(14.1, 0.25, 4, 24, Math.PI), MAT.white, 0, 2.4, 0, g); rib.rotation.y = i * Math.PI / 6; }
      add(new THREE.CylinderGeometry(3, 4, 9, 12), MAT.white, 0, 6, 0, g);
      const core = add(new THREE.SphereGeometry(2.6, 16, 12), MAT.cyan, 0, 12, 0, g);
      animated.push((t) => { core.position.y = 12 + Math.sin(t * 1.7) * 0.8; });
      spot('core:dome', x, z);
    }
    // tours jumelles
    {
      const [x, z] = polar(44, SLOTS[1]);
      const g = new THREE.Group(); g.position.set(x, 3.4, z); g.rotation.y = SLOTS[1]; city.add(g);
      for (const [dx, h, seed] of [[-7, 46, 7], [7, 38, 9]]) {
        add(new THREE.CylinderGeometry(5.2, 6, h, 6), towerMat(4, 24, seed, 3, 2), dx, h / 2, 0, g);
        add(new THREE.CylinderGeometry(6.6, 6.6, 1.6, 6), MAT.metal, dx, h + 0.8, 0, g);
        add(new THREE.CylinderGeometry(6.65, 6.65, 0.4, 6, 1, true), MAT.cyan, dx, h + 1.3, 0, g);
        add(new THREE.CylinderGeometry(0.25, 0.25, 9, 4), MAT.metal, dx, h + 6, 0, g);
        add(new THREE.SphereGeometry(0.6, 8, 6), MAT.red, dx, h + 10.8, 0, g);
      }
      add(new THREE.BoxGeometry(9, 2.4, 3.2), MAT.white, 0, 27, 0, g);
      add(new THREE.BoxGeometry(9.1, 0.4, 3.3), MAT.cyan, 0, 26, 0, g);
      spot('core:twins', x, z);
    }
    // centre de commandement
    {
      const [x, z] = polar(44, SLOTS[2]);
      const g = new THREE.Group(); g.position.set(x, 3.4, z); g.rotation.y = SLOTS[2]; city.add(g);
      let y = 0;
      for (const [w, h] of [[24, 5], [18, 5], [12, 5], [7, 4]]) {
        add(new THREE.BoxGeometry(w, h, w), y === 0 ? MAT.dark : MAT.metal, 0, y + h / 2, 0, g);
        add(new THREE.BoxGeometry(w + 0.3, 0.35, w + 0.3), MAT.amber, 0, y + h - 0.4, 0, g);
        y += h;
      }
      const crystal = add(new THREE.OctahedronGeometry(2.6), MAT.amber, 0, y + 4, 0, g);
      animated.push((t) => { crystal.rotation.y = t; crystal.position.y = y + 4 + Math.sin(t * 2) * 0.6; });
      spot('core:command', x, z);
    }
    // piste et navette
    {
      const [x, z] = polar(84, SLOTS[0]);
      const g = new THREE.Group(); g.position.set(x, 0, z); city.add(g);
      add(new THREE.CylinderGeometry(12, 13, 1.6, 6), MAT.dark, 0, 0.8, 0, g);
      hexRing(12.05, 0.4, MAT.amber, 1.4, g);
      const rr = add(new THREE.TorusGeometry(7, 0.3, 4, 48), MAT.cyan, 0, 1.75, 0, g);
      rr.rotation.x = Math.PI / 2;
      const ship = buildShip(1.6);
      g.add(ship);
      animated.push((t) => { ship.position.y = 7 + Math.sin(t * 1.3) * 0.7; ship.rotation.y = Math.sin(t * 0.3) * 0.3; });
      spot('core:pad', x, z);
    }
    // réservoirs
    {
      const [x, z] = polar(84, SLOTS[1]);
      const g = new THREE.Group(); g.position.set(x, 0, z); city.add(g);
      for (let i = 0; i < 3; i++) {
        const [sx, sz] = polar(7, i * 2 * Math.PI / 3);
        add(new THREE.CylinderGeometry(4, 4, 14, 20), MAT.white, sx, 7, sz, g);
        add(new THREE.SphereGeometry(4, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT.white, sx, 14, sz, g);
        for (const by of [4, 8, 12]) add(new THREE.CylinderGeometry(4.08, 4.08, 0.5, 20, 1, true), MAT.cyan, sx, by, sz, g);
      }
      add(new THREE.CylinderGeometry(1.2, 1.2, 20, 8), MAT.metal, 0, 10, 0, g);
      const orb = add(new THREE.SphereGeometry(1.8, 16, 12), MAT.cyan, 0, 21, 0, g);
      animated.push((t) => { orb.scale.setScalar(1 + 0.25 * Math.sin(t * 4)); });
      spot('core:silos', x, z);
    }
    // habitations
    {
      const base = SLOTS[2];
      for (let i = 0; i < 7; i++) {
        const a = base + (i - 3) * 0.13, r = 78 + (i % 2) * 14;
        const [x, z] = polar(r, a);
        const rad = 4 + hash(i, 3, 5) * 2.5;
        add(new THREE.CylinderGeometry(rad, rad + 0.4, 2, 16), MAT.metal, x, 1, z);
        add(new THREE.SphereGeometry(rad, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT.white, x, 2, z);
        add(new THREE.CylinderGeometry(rad + 0.05, rad + 0.05, 0.4, 16, 1, true), MAT.cyanSoft, x, 2.1, z);
      }
      spot('core:homes', ...polar(85, base));
    }
    // petits bâtiments (boutiques)
    let fi = 0;
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      for (const [dr, da] of [[0, -0.12], [12, 0.1]]) {
        const [x, z] = polar(80 + dr, a + da);
        const h = 6 + hash(i, dr, 8) * 10, w = 6 + hash(i, dr, 9) * 4;
        const b = add(new THREE.BoxGeometry(w, h, w * 0.8), towerMat(3, 6, i * 13 + dr, 1, 1), x, h / 2, z);
        b.rotation.y = a;
        const cap = add(new THREE.BoxGeometry(w + 0.4, 0.5, w * 0.8 + 0.4), MAT.cyanSoft, x, h, z);
        cap.rotation.y = a;
        spot(`filler:${fi++}`, x, z);
      }
    }
    // rempart
    const corners = [];
    for (let i = 0; i < 6; i++) corners.push(polar(WALL_R, i * Math.PI / 3));
    for (let i = 0; i < 6; i++) {
      const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 6];
      const mid = (i * Math.PI / 3) + Math.PI / 6;
      const isGate = ROADS.some((r) => Math.abs(((r - mid) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)) < 0.01);
      const segs = isGate ? [[0, 0.42], [0.58, 1]] : [[0, 1]];
      for (const [s0, s1] of segs) {
        const x0 = ax + (bx - ax) * s0, z0 = az + (bz - az) * s0, x1 = ax + (bx - ax) * s1, z1 = az + (bz - az) * s1;
        const len = Math.hypot(x1 - x0, z1 - z0), rot = Math.atan2(x1 - x0, z1 - z0);
        const w = add(new THREE.BoxGeometry(2.4, 7, len), MAT.metal, (x0 + x1) / 2, 3.5, (z0 + z1) / 2); w.rotation.y = rot;
        const s = add(new THREE.BoxGeometry(2.6, 0.5, len), MAT.cyan, (x0 + x1) / 2, 7.1, (z0 + z1) / 2); s.rotation.y = rot;
      }
      if (isGate) {
        for (const k of [0.42, 0.58]) {
          const gx = ax + (bx - ax) * k, gz = az + (bz - az) * k;
          add(new THREE.BoxGeometry(4, 13, 4), MAT.dark, gx, 6.5, gz);
          add(new THREE.BoxGeometry(4.2, 0.6, 4.2), MAT.amber, gx, 12.5, gz);
        }
        const [gx, gz] = polar(WALL_R * Math.cos(Math.PI / 6), mid);
        const arch = add(new THREE.BoxGeometry(22, 2, 3), MAT.white, gx, 14, gz); arch.rotation.y = mid + Math.PI / 2;
        const ag = add(new THREE.BoxGeometry(22.2, 0.4, 3.2), MAT.amber, gx, 13, gz); ag.rotation.y = mid + Math.PI / 2;
      }
    }
    for (const [x, z] of corners) {
      add(new THREE.CylinderGeometry(2.4, 3.4, 26, 8), MAT.dark, x, 13, z);
      add(new THREE.CylinderGeometry(3.5, 3.5, 0.6, 8, 1, true), MAT.cyan, x, 8, z);
      add(new THREE.SphereGeometry(2, 16, 12), MAT.cyan, x, 27.5, z);
    }
    // bouclier
    const shieldMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0.35, 1.5, 2.3) } },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vP = position;
          vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main(){
          float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0);
          float band = exp(-pow((vP.y - mod(uTime * 16.0, 150.0)) / 2.5, 2.0));
          vec2 g = abs(fract(vec2(atan(vP.x, vP.z) * 18.0, vP.y / 9.0)) - 0.5);
          float grid = smoothstep(0.46, 0.5, max(g.x, g.y));
          float a = f * 0.32 + 0.012 + band * 0.14 + grid * 0.035;
          gl_FragColor = vec4(uColor * a, a); }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    const shield = new THREE.Mesh(new THREE.SphereGeometry(132, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2), shieldMat);
    shield.scale.y = 0.95; shield.renderOrder = 2;
    city.add(shield);
    animated.push((t) => { shieldMat.uniforms.uTime.value = t; });
    // drones
    for (let i = 0; i < 5; i++) {
      const d = buildShip(0.55 + (i % 2) * 0.2);
      city.add(d);
      const R = 30 + i * 13, H = 40 + (i % 3) * 14, sp = (0.25 + i * 0.05) * (i % 2 ? -1 : 1), ph = i * 1.3;
      animated.push((t) => {
        const a = ph + t * sp;
        d.position.set(Math.sin(a) * R, H + Math.sin(t * 1.5 + i) * 2, Math.cos(a) * R);
        d.rotation.y = a + (sp > 0 ? Math.PI / 2 : -Math.PI / 2);
      });
    }
  }

  // Pavillons du faubourg (un par lieu « ring »)
  function buildRingPlaces(ringPlaces) {
    const n = ringPlaces.length;
    const angles = [];
    const avoid = ROADS.map((r) => r);
    let a = 0.0;
    const stepA = (Math.PI * 2) / (n + 3);
    while (angles.length < n) {
      const near = avoid.some((r) => Math.abs(Math.atan2(Math.sin(a - r), Math.cos(a - r))) < 0.13);
      if (!near) angles.push(a);
      a += near ? 0.05 : stepA;
    }
    ringPlaces.forEach((p, i) => {
      const ang = angles[i], r = 168;
      const [x, z] = polar(r, ang);
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ang; city.add(g);
      const acc = ACCENTS[i % ACCENTS.length];
      add(new THREE.CylinderGeometry(11, 12, 1.4, 6), MAT.dark, 0, 0.7, 0, g);
      hexRing(11.05, 0.35, acc, 1.3, g);
      const v = i % 4;
      if (p.id === 'arene') {
        const st = add(new THREE.TorusGeometry(9, 2.6, 8, 32), MAT.white, 0, 3, 0, g); st.rotation.x = Math.PI / 2;
        const top = add(new THREE.TorusGeometry(9.5, 0.3, 6, 40), acc, 0, 5.6, 0, g); top.rotation.x = Math.PI / 2;
        add(new THREE.CylinderGeometry(6.5, 6.5, 0.4, 24), MAT.green === acc ? MAT.metal : new THREE.MeshStandardMaterial({ color: C('#4f8d3c') }), 0, 1.6, 0, g);
      } else if (p.id === 'chantier') {
        add(new THREE.BoxGeometry(10, 6, 8), MAT.pave, 0, 3, 0, g);
        add(new THREE.BoxGeometry(1, 26, 1), MAT.amber, 6, 13, -3, g);
        const arm = add(new THREE.BoxGeometry(18, 0.8, 0.8), MAT.amber, 0, 26, -3, g);
        animated.push((t) => { arm.rotation.y = Math.sin(t * 0.2) * 0.8; });
      } else if (v === 0) {
        const hgt = 14 + (i % 3) * 4;
        add(new THREE.CylinderGeometry(5.5, 7, hgt, 6), towerMat(4, 12, i * 31, 2, 1), 0, hgt / 2 + 1.4, 0, g);
        add(new THREE.CylinderGeometry(7.6, 7.6, 1, 6), MAT.metal, 0, hgt + 1.9, 0, g);
        add(new THREE.CylinderGeometry(7.65, 7.65, 0.35, 6, 1, true), acc, 0, hgt + 2.3, 0, g);
      } else if (v === 1) {
        add(new THREE.SphereGeometry(8.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), MAT.white, 0, 1.4, 0, g);
        add(new THREE.CylinderGeometry(8.55, 8.55, 0.5, 24, 1, true), acc, 0, 1.8, 0, g);
        add(new THREE.SphereGeometry(1.4, 12, 8), acc, 0, 10.5, 0, g);
      } else if (v === 2) {
        add(new THREE.BoxGeometry(14, 8, 10), towerMat(5, 4, i * 17, 2, 1), 0, 5.4, 0, g);
        add(new THREE.BoxGeometry(14.4, 0.5, 10.4), acc, 0, 9.4, 0, g);
        add(new THREE.BoxGeometry(8, 3, 6), MAT.white, 0, 11, 0, g);
      } else {
        add(new THREE.CylinderGeometry(3, 8, 12, 8), MAT.white, 0, 7.4, 0, g);
        add(new THREE.TorusGeometry(5, 0.35, 6, 32), acc, 0, 10, 0, g).rotation.x = Math.PI / 2;
        add(new THREE.ConeGeometry(3, 6, 8), MAT.metal, 0, 16.4, 0, g);
      }
      spot(`ring:${p.id}`, x, z);
    });
  }

  // Avant-postes
  function buildSites(siteSpots) {
    for (const site of sites) {
      const [x, z] = siteSpots[site.id];
      const y = Math.max(heightAt(x, z), 0.5);
      const g = new THREE.Group(); g.position.set(x, y, z); scene.add(g);
      add(new THREE.CylinderGeometry(22, 24, 3, 6), MAT.dark, 0, 0, 0, g);
      hexRing(22.1, 0.6, MAT.amber, 1.2, g);
      const pole = add(new THREE.CylinderGeometry(0.8, 1.2, 40, 6), MAT.metal, -14, 20, -8, g);
      add(new THREE.SphereGeometry(2, 12, 8), MAT.amber, -14, 41, -8, g);
      // petit portail sur chaque avant-poste
      const ringP = add(new THREE.TorusGeometry(4, 0.5, 8, 28), MAT.violet, 14, 6, 10, g);
      animated.push((t) => { ringP.rotation.y = t * 0.8; });
      if (site.kind === 'mine' || site.kind === 'puits') {
        for (const s of [-1, 1]) { const leg = add(new THREE.BoxGeometry(1, 30, 1), MAT.metal, s * 5, 15, 0, g); leg.rotation.z = -s * 0.15; }
        add(new THREE.BoxGeometry(12, 1, 1), MAT.metal, 0, 28, 0, g);
        const wheel = add(new THREE.TorusGeometry(3, 0.4, 6, 20), site.kind === 'puits' ? MAT.amber : MAT.cyan, 0, 30, 0, g);
        animated.push((t) => { wheel.rotation.z = t * 2; });
        add(new THREE.BoxGeometry(14, 7, 10), MAT.white, 6, 5, 8, g);
      } else if (site.kind === 'ferme') {
        add(new THREE.BoxGeometry(16, 9, 11), MAT.wood, 4, 6, 4, g);
        const roof = add(new THREE.CylinderGeometry(6.2, 6.2, 16.4, 3, 1), new THREE.MeshStandardMaterial({ color: C('#a3402c') }), 4, 12.3, 4, g);
        roof.rotation.z = Math.PI / 2;
        add(new THREE.CylinderGeometry(3, 3, 18, 12), MAT.white, -8, 10, 8, g);
      } else if (site.kind === 'foret') {
        add(new THREE.BoxGeometry(14, 6, 9), MAT.wood, 4, 4.5, 4, g);
        for (let k = 0; k < 5; k++) add(new THREE.CylinderGeometry(0.9, 0.9, 10, 8).rotateZ(Math.PI / 2), MAT.wood, -6, 2 + k * 1.8, -4 + (k % 2) * 1.5, g);
      } else if (site.kind === 'port') {
        add(new THREE.BoxGeometry(6, 1, 40), MAT.wood, 0, 1, -30, g);
        const boat = buildShip(2.2); boat.position.set(8, 3, -40); g.add(boat);
        animated.push((t) => { boat.position.y = 2 + Math.sin(t) * 0.5; });
        add(new THREE.BoxGeometry(12, 7, 9), MAT.white, 4, 5, 8, g);
      } else if (site.kind === 'volcan') {
        for (let k = 0; k < 4; k++) add(new THREE.SphereGeometry(1.6, 8, 6), MAT.amber, Math.sin(k) * 10, 3, Math.cos(k) * 10, g);
        add(new THREE.BoxGeometry(10, 6, 8), MAT.dark, 4, 4.5, 6, g);
      } else if (site.kind === 'cratere') {
        const cr = add(new THREE.OctahedronGeometry(6), MAT.violet, 0, 14, 0, g);
        animated.push((t) => { cr.rotation.y = t * 0.5; cr.position.y = 14 + Math.sin(t) * 1.5; });
        add(new THREE.TorusGeometry(18, 1.5, 6, 32).rotateX(Math.PI / 2), MAT.dark, 0, 2, 0, g);
      }
      spots[`site:${site.id}`] = [x, z];
    }
  }

  // ------------------------------------------------------------------ marqueurs des lieux
  const markerGroup = new THREE.Group();
  scene.add(markerGroup);
  const markers = [];
  function makeMarkerTexture(emoji, label, color) {
    const c = document.createElement('canvas'); c.width = 256; c.height = label ? 200 : 128;
    const g = c.getContext('2d');
    g.beginPath(); g.arc(128, 64, 54, 0, Math.PI * 2);
    g.fillStyle = 'rgba(8,18,34,0.85)'; g.fill();
    g.lineWidth = 7; g.strokeStyle = color; g.stroke();
    g.font = '60px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(emoji, 128, 68);
    if (label) {
      g.font = 'bold 30px Rajdhani, sans-serif';
      const w = Math.min(250, g.measureText(label).width + 22);
      g.fillStyle = 'rgba(8,18,34,0.85)';
      g.beginPath(); g.roundRect(128 - w / 2, 136, w, 40, 10); g.fill();
      g.fillStyle = '#e6f6ff'; g.fillText(label, 128, 157, 240);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  function addMarker(place, x, z, big) {
    const y = big ? Math.max(heightAt(x, z), 0) + 55 : CAP_Y + 30;
    const color = big ? '#ffb84d' : '#5ee3ff';
    const texIcon = makeMarkerTexture(place.emoji, null, color);
    const texLabel = makeMarkerTexture(place.emoji, place.nom, color);
    const mat = new THREE.SpriteMaterial({ map: texIcon, depthTest: false, transparent: true, toneMapped: false });
    const sp = new THREE.Sprite(mat);
    sp.position.set(x, y, z);
    sp.center.set(0.5, 0.25);
    sp.renderOrder = 10;
    sp.userData = { id: place.id, big, texIcon, texLabel, labelOn: false };
    markerGroup.add(sp);
    markers.push(sp);
    // fine ligne vers le sol
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, y, z), new THREE.Vector3(x, (big ? Math.max(heightAt(x, z), 0) : CAP_Y) + 2, z)]);
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: big ? 0xffb84d : 0x5ee3ff, transparent: true, opacity: 0.5 }));
    markerGroup.add(line);
    sp.userData.line = line;
  }

  // ------------------------------------------------------------------ avatar
  const avatar = new THREE.Group();
  scene.add(avatar);
  const body = new THREE.Group(); avatar.add(body);
  add(new THREE.CapsuleGeometry(1.1, 2.2, 4, 10), new THREE.MeshStandardMaterial({ color: C('#ffb84d'), metalness: 0.3, roughness: 0.4 }), 0, 2.4, 0, body);
  add(new THREE.SphereGeometry(0.9, 14, 10), MAT.white, 0, 4.6, 0, body);
  add(new THREE.BoxGeometry(1.4, 0.35, 0.4), MAT.cyan, 0, 4.7, 0.75, body);
  const vehicleMeshes = {
    cheval: (() => { const g = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ color: C('#7a4a2a'), roughness: 0.8 });
      add(new THREE.BoxGeometry(1.6, 1.6, 4), m, 0, 2.4, 0, g); add(new THREE.BoxGeometry(0.9, 2.2, 1.2), m, 0, 3.6, 2.2, g);
      for (const [a, b] of [[-0.6, -1.5], [0.6, -1.5], [-0.6, 1.5], [0.6, 1.5]]) add(new THREE.BoxGeometry(0.4, 1.8, 0.4), m, a, 0.9, b, g); return g; })(),
    voiture: (() => { const g = new THREE.Group(); add(new THREE.BoxGeometry(3.2, 1.4, 6), new THREE.MeshStandardMaterial({ color: C('#d23c3c'), metalness: 0.6, roughness: 0.3 }), 0, 1.2, 0, g);
      add(new THREE.BoxGeometry(2.8, 1.2, 3), MAT.glass, 0, 2.4, -0.3, g); add(new THREE.BoxGeometry(3.3, 0.2, 0.2), MAT.cyan, 0, 1.2, 3, g); return g; })(),
    drone: buildShip(0.8),
  };
  for (const [k, m] of Object.entries(vehicleMeshes)) { m.visible = false; avatar.add(m); }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.6, 0.3), transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }));
  beam.position.y = 0.5; avatar.add(beam);
  const footRing = add(new THREE.TorusGeometry(3, 0.25, 6, 32), MAT.amber, 0, 0.4, 0, avatar);
  footRing.rotation.x = Math.PI / 2;
  const dest = new THREE.Mesh(new THREE.TorusGeometry(4, 0.4, 6, 32), MAT.cyan);
  dest.rotation.x = Math.PI / 2; dest.visible = false;
  scene.add(dest);
  let avatarMode = 'marche';
  function setAvatar(x, z, mode, heading) {
    const fly = mode === 'drone';
    const gy = Math.max(heightAt(x, z), 0);
    avatar.position.set(x, gy + (fly ? 14 : 0), z);
    if (heading !== undefined) avatar.rotation.y = heading;
    if (mode !== avatarMode) {
      avatarMode = mode;
      for (const [k, m] of Object.entries(vehicleMeshes)) m.visible = k === mode;
      body.position.set(0, mode === 'cheval' ? 2.6 : mode === 'voiture' ? 0.6 : mode === 'drone' ? 1.2 : 0, mode === 'voiture' ? -0.4 : 0);
      body.scale.setScalar(mode === 'voiture' ? 0.7 : 1);
      body.visible = mode !== 'drone';
    }
  }
  function setDestination(x, z) {
    if (x === null) { dest.visible = false; return; }
    dest.visible = true;
    dest.position.set(x, Math.max(heightAt(x, z), 0) + 1, z);
  }

  // ------------------------------------------------------------------ pluie
  const RAIN_N = 2500;
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(RAIN_N * 6);
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xbfd9ee, transparent: true, opacity: 0.45 }));
  rain.frustumCulled = false; rain.visible = false;
  scene.add(rain);
  const rainSeed = Array.from({ length: RAIN_N }, (_, i) => [hash(i, 1, 3), hash(i, 2, 3), hash(i, 3, 3)]);
  function updateRain(t) {
    if (!rain.visible) return;
    const R = clamp(dist * 0.9, 60, 900), H = R * 1.2;
    const cx = target.x, cz = target.z, cy = target.y;
    for (let i = 0; i < RAIN_N; i++) {
      const [a, b, c] = rainSeed[i];
      const x = cx + (a - 0.5) * 2 * R, z = cz + (b - 0.5) * 2 * R;
      const y = cy + ((c * H - t * H * 0.9) % H + H) % H;
      const len = R * 0.03;
      rainPos.set([x, y, z, x + len * 0.15, y - len, z], i * 6);
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  // ------------------------------------------------------------------ jour / nuit
  const DAY = { top: C('#2f63b0'), hor: C('#cfe0ec') }, NIGHT = { top: C('#0b1630'), hor: C('#2a3d5e') }, DUSK = { hor: C('#f0a070') };
  const GREY = { top: C('#5b6878'), hor: C('#9aa6b2') };
  let weatherType = 'soleil';
  function setTime(hour) {
    const d = clamp(Math.sin((hour - 6) / 12 * Math.PI) * 1.4 + 0.15, 0, 1);       // 0 nuit · 1 jour
    const dusk = clamp(1 - Math.abs(d - 0.35) * 4, 0, 1);
    const grey = weatherType === 'pluie' || weatherType === 'orage' ? 0.7 : weatherType === 'nuageux' ? 0.35 : 0;
    const top = NIGHT.top.clone().lerp(DAY.top, d).lerp(GREY.top, grey * d);
    const hor = NIGHT.hor.clone().lerp(DAY.hor, d).lerp(DUSK.hor, dusk * 0.6).lerp(GREY.hor, grey * d);
    skyU.top.value.copy(top); skyU.horizon.value.copy(hor); scene.fog.color.copy(hor);
    sun.intensity = 0.35 + 1.75 * d * (1 - grey * 0.55);
    hemi.intensity = 0.45 + 0.35 * d;
    const ang = (hour - 6) / 12 * Math.PI;
    sun.position.set(Math.cos(ang) * 420, CAP_Y + 80 + Math.max(Math.sin(ang), 0.15) * 400, 180);
    sun.color.setHSL(0.09, 0.6 + dusk * 0.4, 0.75 - dusk * 0.1);
    for (const m of windowMats) m.emissiveIntensity = 1.2 + (1 - d) * 2.6;
  }
  function setWeather(type) { weatherType = type; rain.visible = type === 'pluie' || type === 'orage'; }

  // ------------------------------------------------------------------ caméra
  const target = new THREE.Vector3(0, CAP_Y, 0);
  let dist = 260, goalDist = 260, yaw = 0.6, tiltOffset = 0;
  let goalYaw = null, flyTo = null, zoomAnchor = null, follow = null;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const tmpV = new THREE.Vector3();
  const LOG_MIN = Math.log(MIN_DIST), LOG_MAX = Math.log(MAX_DIST);
  const zoomT = () => (Math.log(dist) - LOG_MIN) / (LOG_MAX - LOG_MIN);

  function updateCamera() {
    target.x = clamp(target.x, -HALF * 1.05, HALF * 1.05);
    target.z = clamp(target.z, -HALF * 1.05, HALF * 1.05);
    const pitch = clamp(THREE.MathUtils.degToRad(28 + 50 * Math.pow(zoomT(), 1.2)) + tiltOffset, 0.25, 1.52);
    const hd = Math.cos(pitch) * dist;
    camera.position.set(target.x + Math.sin(yaw) * hd, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * hd);
    const floorY = Math.max(heightAt(camera.position.x, camera.position.z), 0) + 6;
    if (camera.position.y < floorY) camera.position.y = floorY;
    camera.lookAt(target);
    camera.near = clamp(dist * 0.02, 0.5, 200);
    camera.far = dist * 12 + 6000;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    scene.fog.near = dist * 2.5;
    scene.fog.far = dist * 7 + 2500;
  }
  function groundPoint(sx, sy, out = new THREE.Vector3()) {
    ndc.set((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    plane.constant = -target.y;
    const hit = raycaster.ray.intersectPlane(plane, out);
    if (!hit || hit.distanceTo(camera.position) > dist * 25) return null;
    return out;
  }
  // point exact du terrain sous le curseur (marche le long du rayon)
  function terrainPoint(sx, sy) {
    ndc.set((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const o = raycaster.ray.origin, d = raycaster.ray.direction;
    const maxT = dist * 20, stepT = Math.max(dist / 150, 1);
    let prev = 0;
    for (let t = 0; t < maxT; t += stepT) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (y <= Math.max(heightAt(x, z), 0)) {
        let a = prev, b = t;
        for (let k = 0; k < 12; k++) { const m = (a + b) / 2; const yy = o.y + d.y * m; if (yy <= Math.max(heightAt(o.x + d.x * m, o.z + d.z * m), 0)) b = m; else a = m; }
        return new THREE.Vector3(o.x + d.x * b, 0, o.z + d.z * b);
      }
      prev = t;
    }
    return null;
  }
  function pickMarker(sx, sy) {
    ndc.set((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(markers.filter((m) => m.visible), false);
    return hits.length ? hits[0].object.userData.id : null;
  }
  function setZoomAnchor(sx, sy) { const w = groundPoint(sx, sy); zoomAnchor = w ? { sx, sy, world: w.clone() } : null; }
  function zoomBy(factor, sx, sy) {
    goalDist = clamp(goalDist * factor, MIN_DIST, MAX_DIST);
    if (sx !== undefined) setZoomAnchor(sx, sy); else zoomAnchor = null;
  }

  const handlers = { tap: () => {}, hover: () => {} };
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
    zoomBy(Math.exp(clamp(dy, -300, 300) * 0.0015), e.clientX, e.clientY);
    flyTo = null;
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  const pointers = new Map();
  let gesture = null, tapStart = null;
  function startGesture() {
    const pts = [...pointers.values()];
    zoomAnchor = null; goalYaw = null;
    if (pts.length === 0) { gesture = null; canvas.classList.remove('grabbing'); return; }
    canvas.classList.add('grabbing');
    if (pts.length === 1) {
      const p = pts[0];
      if (p.button === 2 || p.button === 1 || p.shift) gesture = { type: 'rotate', x: p.x, y: p.y };
      else { const w = groundPoint(p.x, p.y); gesture = w ? { type: 'pan', anchor: w.clone() } : null; }
    } else {
      const [a, b] = pts;
      const w = groundPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      gesture = { type: 'pinch', span: Math.hypot(a.x - b.x, a.y - b.y) || 1, angle: Math.atan2(b.y - a.y, b.x - a.x), dist, yaw, anchor: w ? w.clone() : null };
    }
  }
  function panTo(anchor, sx, sy) {
    if (!anchor) return;
    const p = groundPoint(sx, sy, tmpV);
    if (!p) return;
    target.x += anchor.x - p.x; target.z += anchor.z - p.z;
    updateCamera();
  }
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, shift: e.shiftKey });
    tapStart = pointers.size === 1 && e.button === 0 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
    startGesture();
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') { const id = pickMarker(e.clientX, e.clientY); handlers.hover(id, e.clientX, e.clientY); canvas.style.cursor = id ? 'pointer' : ''; }
      return;
    }
    p.x = e.clientX; p.y = e.clientY;
    if (tapStart && Math.hypot(p.x - tapStart.x, p.y - tapStart.y) > 7) tapStart = null;
    if (!gesture) return;
    if (gesture.type === 'pan') { if (!tapStart) { panTo(gesture.anchor, p.x, p.y); flyTo = null; follow = null; } }
    else if (gesture.type === 'rotate') {
      yaw -= (p.x - gesture.x) * 0.006;
      tiltOffset = clamp(tiltOffset + (p.y - gesture.y) * 0.004, -0.45, 0.6);
      gesture.x = p.x; gesture.y = p.y;
      updateCamera();
    } else if (gesture.type === 'pinch') {
      const [a, b] = [...pointers.values()];
      const span = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      dist = goalDist = clamp(gesture.dist * gesture.span / span, MIN_DIST, MAX_DIST);
      yaw = gesture.yaw + (ang - gesture.angle);
      updateCamera();
      panTo(gesture.anchor, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
  });
  const endPointer = (e) => {
    if (tapStart && pointers.size === 1 && performance.now() - tapStart.t < 450) {
      const id = pickMarker(e.clientX, e.clientY);
      if (id) handlers.tap({ placeId: id });
      else { const g = terrainPoint(e.clientX, e.clientY); if (g) handlers.tap({ x: g.x, z: g.z }); }
    }
    tapStart = null;
    if (pointers.delete(e.pointerId)) startGesture();
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', (e) => { tapStart = null; if (pointers.delete(e.pointerId)) startGesture(); });

  const keys = new Set();
  addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    keys.add(e.code);
    if (e.code === 'Equal' || e.code === 'NumpadAdd') zoomBy(0.6);
    if (e.code === 'Minus' || e.code === 'Digit6' || e.code === 'NumpadSubtract') zoomBy(1.65);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  // ------------------------------------------------------------------ construction
  const siteSpots = computeSites();
  buildTerrain();
  buildForests(Object.values(siteSpots));
  buildCapital();
  buildRingPlaces(places.filter((p) => p.spot === 'ring'));
  buildSites(siteSpots);
  const placePos = {};
  for (const p of places) {
    const key = p.spot === 'ring' ? `ring:${p.id}` : p.spot;
    const s = spots[key];
    if (!s) { console.warn('emplacement manquant', p.id, key); continue; }
    placePos[p.id] = s;
    addMarker(p, s[0], s[1], false);
  }
  for (const s of sites) { placePos[s.id] = spots[`site:${s.id}`]; addMarker(s, ...placePos[s.id], true); }
  updateCamera();

  // ------------------------------------------------------------------ boucle
  const clock = new THREE.Clock();
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    let fx = 0, fz = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) fz -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) fz += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) fx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) fx += 1;
    if (fx || fz) {
      const sp = dist * 1.1 * dt;
      target.x += (Math.cos(yaw) * fx + Math.sin(yaw) * fz) * sp;
      target.z += (-Math.sin(yaw) * fx + Math.cos(yaw) * fz) * sp;
      flyTo = null; follow = null;
    }
    if (keys.has('KeyQ')) { yaw += dt * 1.4; goalYaw = null; }
    if (keys.has('KeyE')) { yaw -= dt * 1.4; goalYaw = null; }
    if (follow) { target.x += (avatar.position.x - target.x) * (1 - Math.exp(-dt * 6)); target.z += (avatar.position.z - target.z) * (1 - Math.exp(-dt * 6)); }
    else if (flyTo) {
      target.x += (flyTo.x - target.x) * (1 - Math.exp(-dt * 4));
      target.z += (flyTo.y - target.z) * (1 - Math.exp(-dt * 4));
      if (Math.hypot(flyTo.x - target.x, flyTo.y - target.z) < 0.5) flyTo = null;
    }
    if (goalYaw !== null) {
      const d = ((goalYaw - yaw) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
      yaw += d * (1 - Math.exp(-dt * 6));
      if (Math.abs(d) < 0.001) goalYaw = null;
    }
    if (!gesture || gesture.type !== 'pinch') dist += (goalDist - dist) * (1 - Math.exp(-dt * 9));
    const groundY = Math.max(heightAt(target.x, target.z), 0);
    target.y += (groundY - target.y) * (1 - Math.exp(-dt * 5));
    updateCamera();
    if (zoomAnchor) {
      const p = groundPoint(zoomAnchor.sx, zoomAnchor.sy, tmpV);
      if (p) { target.x += zoomAnchor.world.x - p.x; target.z += zoomAnchor.world.z - p.z; updateCamera(); }
      if (Math.abs(goalDist - dist) / dist < 0.002) zoomAnchor = null;
    }
    sky.position.copy(camera.position);
    sky.scale.setScalar(camera.far * 0.5);
    for (const f of animated) f(t);
    // marqueurs : taille constante à l'écran, étiquettes de près
    for (const m of markers) {
      const d = camera.position.distanceTo(m.position);
      const vis = m.userData.big ? true : dist < 900;
      m.visible = vis; m.userData.line.visible = vis;
      if (!vis) continue;
      const wantLabel = m.userData.big ? dist < 2600 : dist < 240;
      if (wantLabel !== m.userData.labelOn) {
        m.userData.labelOn = wantLabel;
        m.material.map = wantLabel ? m.userData.texLabel : m.userData.texIcon;
        m.material.needsUpdate = true;
      }
      const w = d * (m.userData.big ? 0.1 : 0.06);
      m.scale.set(w, w * (wantLabel ? 200 / 256 : 0.5), 1);
    }
    // avatar visible de loin
    const ad = camera.position.distanceTo(avatar.position);
    beam.scale.y = clamp(ad * 0.25, 20, 1500);
    beam.position.y = beam.scale.y / 2;
    beam.scale.x = beam.scale.z = clamp(ad * 0.004, 0.6, 30);
    footRing.scale.setScalar(clamp(ad * 0.006, 1, 40));
    dest.scale.setScalar(clamp(camera.position.distanceTo(dest.position) * 0.008, 1, 60));
    dest.rotation.z = t;
    updateRain(t);
    composer.render();
  }

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    bloom.setSize(innerWidth, innerHeight);
  });

  return {
    frame, heightAt, climateAt, placePos, siteSpots, camera, raycaster,
    get dist() { return dist; }, set dist(v) { dist = goalDist = v; },
    get yaw() { return yaw; }, get target() { return target; },
    zoomT, zoomBy, setAvatar, setDestination, setTime, setWeather,
    onTap(f) { handlers.tap = f; }, onHover(f) { handlers.hover = f; },
    flyTo(x, z, d) { flyTo = new THREE.Vector2(x, z); follow = null; zoomAnchor = null; if (d) goalDist = d; },
    follow(on) { follow = on; if (on) { flyTo = null; zoomAnchor = null; } },
    resetNorth() { goalYaw = 0; },
    home() { flyTo = new THREE.Vector2(0, 0); goalDist = 260; goalYaw = 0.6; tiltOffset = 0; follow = null; },
    viewCorners() {
      return [[0, 0], [innerWidth, 0], [innerWidth, innerHeight], [0, innerHeight]].map(([sx, sy]) => {
        ndc.set((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        plane.constant = -target.y;
        const hit = raycaster.ray.intersectPlane(plane, tmpV);
        const far = dist * 6;
        if (!hit || hit.distanceTo(camera.position) > far) raycaster.ray.at(far, tmpV);
        return [tmpV.x, tmpV.z];
      });
    },
  };
}
