// NUAGE NOIR : après CLOUD.start secondes de combat, un nuage toxique avance depuis les bords de l'arène et
// resserre la zone de jeu vers le centre, petit à petit (CLOUD.shrink secondes), jusqu'à une zone minimale.
// Tout combattant dans le nuage perd CLOUD.dmg de sa vie max toutes les CLOUD.tick secondes.
// La zone sûre est un rectangle aux coins arrondis centré sur l'arène (la carte est symétrique : équitable).
import * as THREE from 'three';
import { WIDTH, DEPTH } from './grid.js';

export const CLOUD = { warn: 5, start: 25, shrink: 60, minHX: 4.2, minHZ: 6.3, corner: 2.2, tick: 0.5, dmg: 0.08 };

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

const vert = 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
const frag = `varying vec3 vW; uniform float uTime, uOn, uR, uAlpha, uSeed; uniform vec2 uH;
  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * n2(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
  void main(){
    vec2 p = vW.xz;
    vec2 q = abs(p) - (uH - uR);
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uR;
    float t = uTime * 0.25 + uSeed;
    float n = fbm(p * 0.32 + vec2(t, -t * 0.7));
    float m = fbm(p * 0.75 - vec2(t * 1.3, t * 0.4));
    float edge = d + (n - 0.5) * 1.6;
    float a = smoothstep(-0.2, 0.9, edge) * uAlpha * uOn;
    vec3 col = vec3(0.012, 0.01, 0.018) + vec3(0.07, 0.055, 0.09) * m * m + vec3(0.05, 0.0, 0.08) * smoothstep(0.6, 0.0, abs(edge - 0.4));
    gl_FragColor = vec4(col, a * (0.85 + 0.15 * m));
    #include <colorspace_fragment>
  }`;

export function createCloud(scene) {
  const layers = [];
  const plane = new THREE.PlaneGeometry(140, 140);
  for (const [y, alpha, seed] of [[0.1, 0.97, 0], [1.25, 0.62, 4.7], [2.5, 0.5, 9.1]]) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uOn: { value: 0 }, uR: { value: CLOUD.corner }, uAlpha: { value: alpha }, uSeed: { value: seed }, uH: { value: new THREE.Vector2(WIDTH, DEPTH) } },
    });
    const m = new THREE.Mesh(plane, mat);
    m.rotation.x = -Math.PI / 2; m.position.y = y; m.renderOrder = 5;
    m.visible = false;
    scene.add(m); layers.push(m);
  }
  // grosses volutes sombres le long du bord du nuage (relief)
  const MAX = 150;
  const puffGeo = new THREE.IcosahedronGeometry(1, 1);
  const puffMat = new THREE.MeshStandardMaterial({ color: 0x16121d, roughness: 1, flatShading: true, transparent: true, opacity: 0.92, emissive: 0x0c0612 });
  const puffs = new THREE.InstancedMesh(puffGeo, puffMat, MAX);
  puffs.count = 0; puffs.renderOrder = 4; puffs.frustumCulled = false;
  scene.add(puffs);
  const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  let on = 0, hx = WIDTH, hz = DEPTH;

  /** Points le long du bord (rectangle arrondi), tous les ~1,15 unités. */
  function edgePoints(hxs, hzs, r) {
    const pts = [];
    const ax = hxs - r, az = hzs - r;
    const seg = (x0, z0, x1, z1, nx, nz) => { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 1.15)); for (let i = 0; i < n; i++) { const k = (i + 0.5) / n; pts.push([x0 + (x1 - x0) * k, z0 + (z1 - z0) * k, nx, nz]); } };
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
      const target = mt >= CLOUD.start ? 1 : 0;
      on += (target - on) * Math.min(1, dt * 1.5);
      if (target === 0 && on < 0.01) on = 0;
      for (const l of layers) {
        l.visible = on > 0.001;
        const u = l.material.uniforms;
        u.uTime.value = t; u.uOn.value = on; u.uH.value.set(hx, hz);
      }
      if (on <= 0.001) { puffs.count = 0; return; }
      const pts = edgePoints(hx + 0.5, hz + 0.5, CLOUD.corner + 0.5).slice(0, MAX);
      pts.forEach(([x, z, nx, nz], i) => {
        const w = Math.sin(t * 1.3 + i * 1.7) * 0.18;
        const sc = (0.75 + 0.25 * Math.sin(i * 12.9898) ** 2 + w) * on;
        v.set(x + nx * 0.35, 0.45 + 0.35 * Math.sin(i * 3.1 + t * 0.8), z + nz * 0.35);
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, i + t * 0.2);
        s.set(sc * 1.2, sc * 0.9, sc * 1.2);
        puffs.setMatrixAt(i, m4.compose(v, q, s));
      });
      puffs.count = pts.length;
      puffs.instanceMatrix.needsUpdate = true;
    },
    /** Distance signée au bord (> 0 : dans le nuage) ; toujours négative tant que le nuage n'est pas là. */
    dist(x, z) { return on > 0.5 ? cloudDist(x, z, hx, hz) : -99; },
    reset() { on = 0; [hx, hz] = safeHalf(0); for (const l of layers) l.visible = false; puffs.count = 0; },
    dispose() { plane.dispose(); for (const l of layers) { scene.remove(l); l.material.dispose(); } scene.remove(puffs); puffGeo.dispose(); puffMat.dispose(); },
  };
}
