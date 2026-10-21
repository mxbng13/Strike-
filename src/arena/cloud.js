// NUAGE NOIR : après CLOUD.start secondes de combat, un nuage toxique avance depuis les bords de l'arène et
// resserre la zone de jeu vers le centre, petit à petit (CLOUD.shrink secondes), jusqu'à une zone minimale.
// Tout combattant dans le nuage perd CLOUD.dmg de sa vie max toutes les CLOUD.tick secondes.
// La zone sûre est un rectangle aux coins arrondis centré sur l'arène (la carte est symétrique : équitable).
import * as THREE from 'three';
import { WIDTH, DEPTH } from './grid.js';

export const CLOUD = { warn: 5, start: 25, shrink: 60, minHX: 4.2, minHZ: 6.3, corner: 2.2, tick: 0.5, dmg: 0.05 };

/** Demi-largeur et demi-profondeur de la zone sûre au temps de combat `mt` (en secondes). */
export function safeHalf(mt) {
  const k = Math.min(1, Math.max(0, (mt - CLOUD.start) / CLOUD.shrink));
  const e = k * k * (3 - 2 * k) * 0.35 + k * 0.65;   // départ doux, puis avancée régulière
  const fx = WIDTH / 2 + 0.6, fz = DEPTH / 2 + 0.6;
  return [fx + (CLOUD.minHX - fx) * e, fz + (CLOUD.minHZ - fz) * e];
}
/** Distance signée au bord de la zone sûre (> 0 : dans le nuage). */
export function cloudDist(x, z, hx, hz, r = CLOUD.corner) {
  const qx = Math.abs(x) - (hx - r), qz = Math.abs(z) - (hz - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}

const vert = 'varying vec2 vP; varying vec2 vUv; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xz; vUv = w.xz * 0.045; gl_Position = projectionMatrix * viewMatrix * w; }';
// Léger pour les téléphones : la forme du bord est calculée d'abord (les pixels de la zone sûre sont abandonnés
// tout de suite), puis la fumée est lue dans une petite texture de bruit (2 lectures au lieu de calculs).
const frag = `varying vec2 vP; varying vec2 vUv; uniform float uTime, uOn, uR, uAlpha; uniform vec2 uH; uniform sampler2D uNoise;
  void main(){
    vec2 q = abs(vP) - (uH - uR);
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uR;
    if (d < -1.2) discard;
    float t = uTime * 0.03;
    float n = texture2D(uNoise, vUv + vec2(t, -t * 0.7)).r;
    float m = texture2D(uNoise, vUv * 2.3 - vec2(t * 1.6, t * 0.5)).r;
    float edge = d + (n - 0.5) * 1.6;
    float a = smoothstep(-0.2, 0.9, edge) * uAlpha * uOn;
    vec3 col = vec3(0.012, 0.01, 0.018) + vec3(0.07, 0.055, 0.09) * m * m + vec3(0.05, 0.0, 0.08) * smoothstep(0.6, 0.0, abs(edge - 0.4));
    gl_FragColor = vec4(col, a * (0.85 + 0.15 * m));
    #include <colorspace_fragment>
  }`;

/** Texture de bruit douce et répétable (fumée), générée une fois. */
let noiseTex = null;
function smokeNoise() {
  if (noiseTex) return noiseTex;
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N);
  const grid = (k) => { const a = new Float32Array(k * k); for (let i = 0; i < a.length; i++) a[i] = Math.random(); return a; };
  const octs = [[4, 0.5], [8, 0.27], [16, 0.15], [32, 0.08]].map(([k, w]) => ({ k, w, a: grid(k) }));
  const sm = (x) => x * x * (3 - 2 * x);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    for (const { k, w, a } of octs) {
      const fx = (x / N) * k, fy = (y / N) * k, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy);
      const at = (i, j) => a[((j + k) % k) * k + ((i + k) % k)];
      v += w * ((at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty);
    }
    const o = (y * N + x) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.round(v * 255); img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  noiseTex = new THREE.CanvasTexture(c);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  return noiseTex;
}

export function createCloud(scene) {
  const layers = [];
  // le nuage ne couvre que l'arène et ses abords (moins de pixels à dessiner)
  const plane = new THREE.PlaneGeometry(WIDTH + 16, DEPTH + 16);
  for (const [y, alpha] of [[0.1, 0.97], [1.6, 0.6]]) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uOn: { value: 0 }, uR: { value: CLOUD.corner }, uAlpha: { value: alpha }, uH: { value: new THREE.Vector2(WIDTH, DEPTH) }, uNoise: { value: smokeNoise() } },
    });
    const m = new THREE.Mesh(plane, mat);
    m.rotation.x = -Math.PI / 2; m.position.y = y; m.renderOrder = 5;
    m.visible = false;
    scene.add(m); layers.push(m);
  }
  // grosses volutes sombres le long du bord du nuage (relief)
  const MAX = 90;
  const puffGeo = new THREE.IcosahedronGeometry(1, 1);
  const puffMat = new THREE.MeshStandardMaterial({ color: 0x16121d, roughness: 1, flatShading: true, transparent: true, opacity: 0.92, emissive: 0x0c0612 });
  const puffs = new THREE.InstancedMesh(puffGeo, puffMat, MAX);
  puffs.count = 0; puffs.renderOrder = 4; puffs.frustumCulled = false;
  scene.add(puffs);
  const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  let on = 0, hx = WIDTH, hz = DEPTH, frameN = 0;

  /** Points le long du bord (rectangle arrondi), tous les ~1,6 unités (tableau réutilisé). */
  const pts = [];
  function edgePoints(hxs, hzs, r) {
    pts.length = 0;
    const ax = hxs - r, az = hzs - r;
    const seg = (x0, z0, x1, z1, nx, nz) => { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 1.6)); for (let i = 0; i < n; i++) { const k = (i + 0.5) / n; pts.push([x0 + (x1 - x0) * k, z0 + (z1 - z0) * k, nx, nz]); } };
    seg(-ax, -hzs, ax, -hzs, 0, -1); seg(ax, hzs, -ax, hzs, 0, 1); seg(-hxs, az, -hxs, -az, -1, 0); seg(hxs, -az, hxs, az, 1, 0);
    for (const [cx, cz, a0] of [[ax, az, 0], [-ax, az, Math.PI / 2], [-ax, -az, Math.PI], [ax, -az, -Math.PI / 2]]) for (let i = 0; i < 3; i++) { const a = a0 + ((i + 0.5) / 3) * (Math.PI / 2); pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r, Math.cos(a), Math.sin(a)]); }
    return pts;
  }

  return {
    get half() { return [hx, hz]; },
    get active() { return on > 0; },
    /** `mt` : temps de combat écoulé ; `t` : horloge (animation). */
    update(mt, t, dt) {
      [hx, hz] = safeHalf(mt);
      // apparition en 1,5 s de combat (ne dépend pas de la vitesse d'affichage : identique chez les deux joueurs en ligne)
      on = Math.min(1, Math.max(0, (mt - CLOUD.start) / 1.5));
      for (const l of layers) {
        l.visible = on > 0.001;
        const u = l.material.uniforms;
        u.uTime.value = t; u.uOn.value = on; u.uH.value.set(hx, hz);
      }
      if (on <= 0.001) { puffs.count = 0; return; }
      if ((frameN = (frameN + 1) % 2)) return;   // volutes : une image sur deux suffit
      edgePoints(hx + 0.5, hz + 0.5, CLOUD.corner + 0.5);
      const n = Math.min(MAX, pts.length);
      for (let i = 0; i < n; i++) {
        const [x, z, nx, nz] = pts[i];
        const w = Math.sin(t * 1.3 + i * 1.7) * 0.18;
        const sc = (0.75 + 0.25 * Math.sin(i * 12.9898) ** 2 + w) * on;
        v.set(x + nx * 0.35, 0.45 + 0.35 * Math.sin(i * 3.1 + t * 0.8), z + nz * 0.35);
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, i + t * 0.2);
        s.set(sc * 1.55, sc * 1.1, sc * 1.55);
        puffs.setMatrixAt(i, m4.compose(v, q, s));
      }
      puffs.count = n;
      puffs.instanceMatrix.needsUpdate = true;
    },
    /** Distance signée au bord (> 0 : dans le nuage) ; toujours négative tant que le nuage n'est pas là. */
    dist(x, z) { return on > 0.5 ? cloudDist(x, z, hx, hz) : -99; },
    reset() { on = 0; [hx, hz] = safeHalf(0); for (const l of layers) l.visible = false; puffs.count = 0; },
    dispose() { plane.dispose(); /* la texture de bruit est gardée pour le combat suivant */ for (const l of layers) { scene.remove(l); l.material.dispose(); } scene.remove(puffs); puffGeo.dispose(); puffMat.dispose(); },
  };
}
