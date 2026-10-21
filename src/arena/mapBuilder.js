// Construction 3D d'une carte de l'arène à partir de son plan (arena/grid.js, arena/maps.js).
// Sol peint tuile par tuile, murs, caisses, rochers, buissons (cachettes), eau animée, clôture et décor
// autour. Thèmes : prairie, rivière (ponts), désert, glacier. Tout est généré par le code.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TILE, COLS, ROWS, WIDTH, DEPTH, LAYOUT, tileAt, cellCenter, findTiles } from './grid.js';

let seed = 3;
// Palettes des thèmes
export const THEMES = {
  meadow: {
    bg: 0x3f7f38, hemi: [0xdff2ff, 0x4d7a3a, 1.05], sun: [0xfff2d8, 2.0],
    tiles: ['#62b24c', '#5aa845'], blotch: ['120,200,90', '40,110,40'], blades: ['rgba(150,215,100,.5)', 'rgba(40,100,40,.45)'],
    path: '#b8895a', pathDots: ['rgba(120,85,50,.55)', 'rgba(225,190,140,.6)'], shade: '20,40,15',
    stone: (s) => `rgb(${s},${s + 2},${s + 10})`, stoneBase: '#8d8f99', moss: true, cap: 0xc4c6ce,
    rock: 0x8e9098, bushes: [0x2f8f3a, 0x3aa246, 0x47b552, 0x2a7f34, 0x56c25c], bushStyle: 'leaves',
    outer: '#4c9140', outerDots: ['rgba(110,180,80,.4)', 'rgba(30,80,30,.4)'], edge: 0x9b7448, wood: 0x8a5a2e,
    tuft: 0x7cc456, flowers: true, decor: 'trees', wet: '#3f8f6a',
  },
  desert: {
    bg: 0xd9a65a, hemi: [0xfff1d6, 0xb07a3a, 1.1], sun: [0xffe7c2, 2.2],
    tiles: ['#e8c27a', '#e0b86e'], blotch: ['255,225,160', '180,120,60'], blades: ['rgba(255,235,190,.35)', 'rgba(170,110,50,.3)'],
    path: '#c98f4f', pathDots: ['rgba(140,90,40,.5)', 'rgba(255,225,170,.55)'], shade: '110,60,20',
    stone: (s) => `rgb(${s + 70},${s + 30},${s - 25})`, stoneBase: '#c58a4c', moss: false, cap: 0xe2b27a,
    rock: 0xb9814a, bushes: [0xc9a64a, 0xb8923a, 0xd8b85a, 0xa98432], bushStyle: 'grass',
    outer: '#d8a95e', outerDots: ['rgba(255,230,170,.45)', 'rgba(160,100,40,.35)'], edge: 0xa8743a, wood: 0x7a4c22,
    tuft: 0xb89a4a, flowers: false, decor: 'cactus', wet: '#8a7a4a', water: [[0.12, 0.45, 0.55], [0.45, 0.80, 0.80]],
  },
  snow: {
    bg: 0xcfe3f2, hemi: [0xf2f8ff, 0x8aa4c0, 1.15], sun: [0xffffff, 1.7],
    tiles: ['#eef5fb', '#e3edf7'], blotch: ['255,255,255', '150,185,220'], blades: ['rgba(255,255,255,.55)', 'rgba(160,190,225,.35)'],
    path: '#a9c3dc', pathDots: ['rgba(120,150,190,.45)', 'rgba(255,255,255,.7)'], shade: '60,90,130',
    stone: (s) => `rgb(${s - 10},${s + 40},${s + 75})`, stoneBase: '#8fc4e6', moss: false, snowCap: true, cap: 0xffffff,
    rock: 0x8f9fb2, bushes: [0x2f6f5a, 0x3a7f68, 0x285f4e, 0x447f6c], bushStyle: 'leaves', bushSnow: true,
    outer: '#e6eff8', outerDots: ['rgba(255,255,255,.7)', 'rgba(150,180,215,.35)'], edge: 0x9fb6cc, wood: 0x6e5a48,
    tuft: 0xd9e8f5, flowers: false, decor: 'pines', wet: '#9cc8e4', water: [[0.20, 0.50, 0.72], [0.70, 0.90, 1.0]],
  },
};
// Rivière : la prairie avec de l'eau plus vive
THEMES.river = { ...THEMES.meadow, bg: 0x3b8a46, wet: '#2f7f6a', water: [[0.06, 0.42, 0.70], [0.38, 0.80, 0.95]] };
let T = THEMES.meadow;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const range = (a, b) => a + rnd() * (b - a);

function canvasTex(w, h, draw, repeat = null) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

// Sol de l'arène : 40 px par tuile. Herbe en damier très doux + brins, chemins de terre aux bords adoucis.
function groundTexture() {
  const P = 40;
  return canvasTex(COLS * P, ROWS * P, (g, w, h) => {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      g.fillStyle = (r + c) % 2 ? T.tiles[0] : T.tiles[1];
      g.fillRect(c * P, r * P, P, P);
    }
    // nuances (taches claires / sombres)
    for (let i = 0; i < 260; i++) {
      const x = rnd() * w, y = rnd() * h, rad = range(20, 70);
      const rg = g.createRadialGradient(x, y, 0, x, y, rad);
      const col = rnd() < 0.5 ? T.blotch[0] : T.blotch[1];
      rg.addColorStop(0, `rgba(${col},.22)`); rg.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = rg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // brins d'herbe
    for (let i = 0; i < 9000; i++) {
      const x = rnd() * w, y = rnd() * h;
      g.strokeStyle = rnd() < 0.5 ? T.blades[0] : T.blades[1];
      g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + range(-2, 2), y - range(3, 6)); g.stroke();
    }
    // chemins de terre (calque flouté pour des bords naturels)
    const d = document.createElement('canvas'); d.width = w; d.height = h;
    const dg = d.getContext('2d');
    dg.fillStyle = T.path;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (LAYOUT[r][c] === '-' || LAYOUT[r][c] === 'P' || LAYOUT[r][c] === 'E') dg.fillRect(c * P - 4, r * P - 4, P + 8, P + 8);
    g.save(); g.filter = 'blur(7px)'; g.drawImage(d, 0, 0); g.restore();
    // bord mouillé autour de l'eau (l'eau elle-même est un maillage animé)
    const wcv = document.createElement('canvas'); wcv.width = w; wcv.height = h;
    const wg = wcv.getContext('2d'); wg.fillStyle = T.wet;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if ('wH'.includes(LAYOUT[r][c])) wg.fillRect(c * P - 9, r * P - 9, P + 18, P + 18);
    g.save(); g.filter = 'blur(6px)'; g.globalAlpha = 0.85; g.drawImage(wcv, 0, 0); g.restore();
    // cailloux et traces sur la terre
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (!'-PE'.includes(LAYOUT[r][c])) continue;
      for (let i = 0; i < 9; i++) { g.fillStyle = rnd() < 0.5 ? T.pathDots[0] : T.pathDots[1]; g.beginPath(); g.ellipse(c * P + rnd() * P, r * P + rnd() * P, range(1, 3), range(1, 2.4), rnd() * 3, 0, Math.PI * 2); g.fill(); }
    }
    // zones de départ : cercle peint
    for (const ch of ['P', 'E']) {
      const [c, r] = findTiles(ch)[0];
      g.strokeStyle = ch === 'P' ? 'rgba(92,255,196,.8)' : 'rgba(255,61,127,.8)'; g.lineWidth = 4; g.setLineDash([10, 8]);
      g.beginPath(); g.arc((c + 0.5) * P, (r + 0.5) * P, P * 1.3, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    }
    // ombre douce au pied des murs, caisses et rochers
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (!'WCR'.includes(LAYOUT[r][c])) continue;
      const rg = g.createRadialGradient((c + 0.5) * P, (r + 0.5) * P, P * 0.3, (c + 0.5) * P, (r + 0.5) * P, P * 0.95);
      rg.addColorStop(0, `rgba(${T.shade},.35)`); rg.addColorStop(1, `rgba(${T.shade},0)`);
      g.fillStyle = rg; g.fillRect(c * P - P / 2, r * P - P / 2, P * 2, P * 2);
    }
  });
}

function stoneTexture() {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = T.stoneBase; g.fillRect(0, 0, 256, 256);
    const rowH = 64;
    for (let y = 0; y < 4; y++) for (let x = -1; x < 3; x++) {
      const ox = (y % 2) * 64 + x * 128;
      const shade = 120 + Math.floor(rnd() * 40);
      g.fillStyle = T.stone(shade);
      g.fillRect(ox + 4, y * rowH + 4, 120, rowH - 8);
      g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(ox + 4, y * rowH + 4, 120, 6);
      g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(ox + 4, y * rowH + rowH - 12, 120, 8);
    }
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.12})`; g.fillRect(rnd() * 256, rnd() * 256, 2, 2); }
    // mousse
    if (T.moss) for (let i = 0; i < 18; i++) { g.fillStyle = 'rgba(90,140,60,.35)'; g.beginPath(); g.ellipse(rnd() * 256, rnd() < 0.5 ? rnd() * 30 : 230 + rnd() * 26, range(6, 20), range(3, 8), 0, 0, Math.PI * 2); g.fill(); }
  });
}
function crateTexture() {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#b07a3f'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#a66f37' : '#bb8546'; g.fillRect(0, i * 64, 256, 62); }
    g.strokeStyle = 'rgba(90,50,20,.45)'; g.lineWidth = 2;
    for (let i = 0; i < 40; i++) { const y = rnd() * 256; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(80, y + range(-4, 4), 170, y + range(-4, 4), 256, y); g.stroke(); }
    g.fillStyle = '#7a4c22';
    g.fillRect(0, 0, 256, 22); g.fillRect(0, 234, 256, 22); g.fillRect(0, 0, 22, 256); g.fillRect(234, 0, 22, 256);
    g.save(); g.translate(128, 128); g.rotate(Math.PI / 4); g.fillRect(-170, -11, 340, 22); g.restore();
    g.fillStyle = '#d8d0c0'; for (const [x, y] of [[11, 11], [245, 11], [11, 245], [245, 245]]) { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); }
  });
}

/** Construit la carte active (grid.useMap) dans la scène. Renvoie { bushes, bushAt, update, dispose }. */
export function buildArenaMap(scene, { theme = 'meadow', isMobile = false } = {}) {
  seed = 3;
  T = THEMES[theme] ?? THEMES.meadow;
  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };
  scene.background = new THREE.Color(T.bg);

  // --- Lumières ---
  scene.add(new THREE.HemisphereLight(...T.hemi));
  const sun = new THREE.DirectionalLight(...T.sun);
  sun.position.set(-6, 14, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 50 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  // --- Sol : arène peinte + prairie autour ---
  const arenaGround = new THREE.Mesh(track(new THREE.PlaneGeometry(WIDTH, DEPTH)), track(new THREE.MeshStandardMaterial({ map: track(groundTexture()), roughness: 0.95 })));
  arenaGround.rotation.x = -Math.PI / 2; arenaGround.receiveShadow = true;
  scene.add(arenaGround);
  const outerTex = track(canvasTex(256, 256, (g) => {
    g.fillStyle = T.outer; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3000; i++) { g.fillStyle = rnd() < 0.5 ? T.outerDots[0] : T.outerDots[1]; g.fillRect(rnd() * 256, rnd() * 256, 2, 3); }
  }, [30, 30]));
  const outer = new THREE.Mesh(track(new THREE.PlaneGeometry(220, 220)), track(new THREE.MeshStandardMaterial({ map: outerTex, roughness: 1 })));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.02; outer.receiveShadow = true;
  scene.add(outer);
  // bordure : bande de terre + clôture en bois
  const edgeMat = track(new THREE.MeshStandardMaterial({ color: T.edge, roughness: 0.95 }));
  for (const [w, d, x, z] of [[WIDTH + 1.6, 0.8, 0, -DEPTH / 2 - 0.4], [WIDTH + 1.6, 0.8, 0, DEPTH / 2 + 0.4], [0.8, DEPTH, -WIDTH / 2 - 0.4, 0], [0.8, DEPTH, WIDTH / 2 + 0.4, 0]]) {
    const m = new THREE.Mesh(track(new THREE.BoxGeometry(w, 0.04, d)), edgeMat); m.position.set(x, 0.0, z); m.receiveShadow = true; scene.add(m);
  }
  const woodMat = track(new THREE.MeshStandardMaterial({ color: T.wood, roughness: 0.8 }));
  const posts = [];
  const step = TILE;
  for (let x = -WIDTH / 2; x <= WIDTH / 2 + 0.01; x += step) posts.push([x, -DEPTH / 2 - 0.4], [x, DEPTH / 2 + 0.4]);
  for (let z = -DEPTH / 2 + step; z < DEPTH / 2 - 0.01; z += step) posts.push([-WIDTH / 2 - 0.4, z], [WIDTH / 2 + 0.4, z]);
  const postGeo = track(new THREE.BoxGeometry(0.22, 1.0, 0.22));
  const postMesh = new THREE.InstancedMesh(postGeo, woodMat, posts.length);
  posts.forEach(([x, z], i) => postMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0.5, z)));
  postMesh.castShadow = true; scene.add(postMesh);
  for (const y of [0.4, 0.78]) for (const [w, d, x, z] of [[WIDTH + 0.8, 0.1, 0, -DEPTH / 2 - 0.4], [WIDTH + 0.8, 0.1, 0, DEPTH / 2 + 0.4], [0.1, DEPTH + 0.8, -WIDTH / 2 - 0.4, 0], [0.1, DEPTH + 0.8, WIDTH / 2 + 0.4, 0]]) {
    const rail = new THREE.Mesh(track(new THREE.BoxGeometry(w, 0.12, d)), woodMat); rail.position.set(x, y, z); rail.castShadow = true; scene.add(rail);
  }

  // --- Murs de pierre (bloc + chaperon), caisses, rochers ---
  const stoneTex = track(stoneTexture());
  const wallGeo = track(new RoundedBoxGeometry(TILE * 0.98, 1.5, TILE * 0.98, 2, 0.08));
  const capGeo = track(new RoundedBoxGeometry(TILE * 1.02, 0.22, TILE * 1.02, 2, 0.06));
  const walls = findTiles('W');
  const wallMesh = new THREE.InstancedMesh(wallGeo, track(new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.85 })), walls.length);
  const capMesh = new THREE.InstancedMesh(capGeo, track(new THREE.MeshStandardMaterial({ color: T.cap, roughness: 0.7 })), walls.length);
  walls.forEach(([c, r], i) => {
    const [x, z] = cellCenter(c, r);
    wallMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0.75, z));
    capMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 1.55, z));
  });
  wallMesh.castShadow = wallMesh.receiveShadow = capMesh.castShadow = capMesh.receiveShadow = true;
  scene.add(wallMesh, capMesh);
  // neige sur les murs (glacier)
  if (T.snowCap) {
    const snowMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
    const snowGeo = track(new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2));
    for (const [c, r] of walls) { const [x, z] = cellCenter(c, r); const sn = new THREE.Mesh(snowGeo, snowMat); sn.scale.set(1.35, 0.32, 1.35); sn.position.set(x, 1.64, z); scene.add(sn); }
  }
  // mousse sur certains chaperons
  const mossMat = track(new THREE.MeshStandardMaterial({ color: 0x5d9a3c, roughness: 0.9 }));
  for (const [c, r] of walls) {
    if (!T.moss || rnd() > 0.35) continue;
    const [x, z] = cellCenter(c, r);
    const moss = new THREE.Mesh(track(new THREE.SphereGeometry(0.35, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), mossMat);
    moss.scale.set(range(0.8, 1.4), 0.35, range(0.7, 1.1)); moss.position.set(x + range(-0.3, 0.3), 1.65, z + range(-0.3, 0.3)); scene.add(moss);
  }
  const crates = findTiles('C');
  const crateMat = track(new THREE.MeshStandardMaterial({ map: track(crateTexture()), roughness: 0.75 }));
  const crateMesh = new THREE.InstancedMesh(track(new RoundedBoxGeometry(TILE * 0.86, TILE * 0.86, TILE * 0.86, 2, 0.05)), crateMat, crates.length);
  crates.forEach(([c, r], i) => {
    const [x, z] = cellCenter(c, r);
    crateMesh.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, TILE * 0.43, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, range(-0.12, 0.12), 0)), new THREE.Vector3(1, 1, 1)));
  });
  crateMesh.castShadow = crateMesh.receiveShadow = true;
  scene.add(crateMesh);
  const rockMat = track(new THREE.MeshStandardMaterial({ color: T.rock, roughness: 0.9, flatShading: true }));
  for (const [c, r] of findTiles('R')) {
    const [x, z] = cellCenter(c, r);
    const geo = track(new THREE.IcosahedronGeometry(0.72, 1));
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 0.85 + rnd() * 0.3; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); }
    geo.computeVertexNormals();
    const rock = new THREE.Mesh(geo, rockMat);
    rock.scale.set(1.05, 0.8, 1.0); rock.position.set(x, 0.45, z); rock.rotation.y = rnd() * 6;
    rock.castShadow = rock.receiveShadow = true;
    scene.add(rock);
    const pebble = new THREE.Mesh(track(new THREE.IcosahedronGeometry(0.22, 0)), rockMat);
    pebble.position.set(x + range(-0.6, 0.6), 0.12, z + (rnd() < 0.5 ? -0.7 : 0.7)); scene.add(pebble);
  }

  // --- Buissons : une touffe de boules par tuile, regroupées par massif (un massif = un maillage) ---
  const bushTiles = new Set(findTiles('B').map(([c, r]) => r * COLS + c));
  const seen = new Set();
  const bushes = [];
  const greens = T.bushes.map((h) => new THREE.Color(h));
  for (const start of bushTiles) {
    if (seen.has(start)) continue;
    const comp = [], stack = [start];
    seen.add(start);
    while (stack.length) {
      const k = stack.pop(); comp.push(k);
      const c = k % COLS, r = Math.floor(k / COLS);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = (r + dr) * COLS + (c + dc);
        if (c + dc >= 0 && c + dc < COLS && bushTiles.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
      }
    }
    const geos = [];
    let cx = 0, cz = 0;
    for (const k of comp) {
      const [x, z] = cellCenter(k % COLS, Math.floor(k / COLS));
      cx += x; cz += z;
      const grass = T.bushStyle === 'grass';
      for (let i = 0; i < (grass ? 16 : 4); i++) {
        let g;
        if (grass) {
          // hautes herbes sèches : brins inclinés
          const h = range(0.9, 1.45);
          g = new THREE.ConeGeometry(range(0.07, 0.12), h, 4).toNonIndexed();
          g.translate(0, h / 2, 0);
          g.rotateZ(range(-0.35, 0.35)); g.rotateX(range(-0.35, 0.35));
          g.translate(x + range(-0.6, 0.6), 0, z + range(-0.6, 0.6));
        } else {
          g = new THREE.IcosahedronGeometry(range(0.42, 0.62), 1);
          g.scale(1, range(0.85, 1.1), 1);
          g.translate(x + range(-0.36, 0.36), range(0.62, 0.95), z + range(-0.36, 0.36));
        }
        const col = greens[Math.floor(rnd() * greens.length)];
        const colors = new Float32Array(g.attributes.position.count * 3);
        for (let v = 0; v < g.attributes.position.count; v++) {
          const y = g.attributes.position.getY(v);
          const shade = 0.75 + Math.min(0.4, (y - 0.3) * 0.5); // plus clair en haut
          if (T.bushSnow && y > 1.05) colors.set([0.93, 0.97, 1], v * 3);   // neige sur le dessus
          else colors.set([col.r * shade, col.g * shade, col.b * shade], v * 3);
        }
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geos.push(g);
      }
    }
    const geo = track(mergeGeometries(geos));
    geos.forEach((g) => g.dispose());
    cx /= comp.length; cz /= comp.length;
    geo.translate(-cx, 0, -cz);
    const mat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true, transparent: true, opacity: 1 }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, 0, cz);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    bushes.push({ mesh, mat, tiles: new Set(comp), wiggle: 0, fade: 1 });
  }

  // --- Décor : touffes d'herbe, fleurs, arbres autour de l'arène ---
  const grassTiles = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (LAYOUT[r][c] === '.') grassTiles.push([c, r]);
  const tuftGeo = track(new THREE.ConeGeometry(0.06, 0.3, 4));
  const tuftMat = track(new THREE.MeshStandardMaterial({ color: T.tuft, roughness: 0.9 }));
  const nTufts = isMobile ? 260 : 420;
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, nTufts);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < nTufts; i++) {
    const [c, r] = grassTiles[Math.floor(rnd() * grassTiles.length)];
    const [x, z] = cellCenter(c, r);
    q.setFromEuler(e.set(range(-0.4, 0.4), 0, range(-0.4, 0.4)));
    m4.compose(new THREE.Vector3(x + range(-0.6, 0.6), 0.13, z + range(-0.6, 0.6)), q, new THREE.Vector3(1, range(0.7, 1.3), 1));
    tufts.setMatrixAt(i, m4);
  }
  scene.add(tufts);
  const flowerGeo = track(new THREE.SphereGeometry(0.07, 6, 4));
  const flowers = new THREE.InstancedMesh(flowerGeo, track(new THREE.MeshStandardMaterial({ roughness: 0.6 })), T.flowers ? 90 : 0);
  const flowerCols = [0xffffff, 0xffe066, 0xff8fb8, 0xb69cff].map((h) => new THREE.Color(h));
  for (let i = 0; i < (T.flowers ? 90 : 0); i++) {
    const [c, r] = grassTiles[Math.floor(rnd() * grassTiles.length)];
    const [x, z] = cellCenter(c, r);
    flowers.setMatrixAt(i, m4.makeTranslation(x + range(-0.6, 0.6), 0.06, z + range(-0.6, 0.6)));
    flowers.setColorAt(i, flowerCols[i % 4]);
  }
  scene.add(flowers);
  // décor autour de l'arène : arbres (prairie) ou cactus et palmiers (désert)
  const outside = () => {
    const side = Math.floor(rnd() * 4);
    if (side < 2) return [range(-WIDTH / 2 - 8, WIDTH / 2 + 8), side ? range(DEPTH / 2 + 2, DEPTH / 2 + 9) : range(-DEPTH / 2 - 9, -DEPTH / 2 - 2)];
    return [side === 2 ? range(-WIDTH / 2 - 9, -WIDTH / 2 - 2) : range(WIDTH / 2 + 2, WIDTH / 2 + 9), range(-DEPTH / 2 - 6, DEPTH / 2 + 6)];
  };
  const trunkMat = track(new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.9 }));
  if (T.decor === 'trees') {
    const leafMats = [0x2f7a34, 0x3b8c3c, 0x276b2e].map((h) => track(new THREE.MeshStandardMaterial({ color: h, roughness: 0.85, flatShading: true })));
    const treeGeo = track(new THREE.IcosahedronGeometry(1, 1));
    const trunkGeo = track(new THREE.CylinderGeometry(0.18, 0.25, 1.4, 7));
    for (let i = 0; i < 70; i++) {
      const [x, z] = outside();
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat); trunk.position.y = 0.7; trunk.castShadow = true;
      const s = range(1.0, 1.7);
      const crown = new THREE.Mesh(treeGeo, leafMats[i % 3]); crown.position.y = 1.9; crown.scale.set(s, s * 0.9, s); crown.castShadow = true;
      const top = new THREE.Mesh(treeGeo, leafMats[(i + 1) % 3]); top.position.y = 2.7; top.scale.setScalar(s * 0.65); top.castShadow = true;
      t.add(trunk, crown, top);
      t.position.set(x, 0, z); t.rotation.y = rnd() * 6;
      scene.add(t);
    }
  } else if (T.decor === 'pines') {
    // sapins enneigés
    const pineMat = track(new THREE.MeshStandardMaterial({ color: 0x2f6a55, roughness: 0.85, flatShading: true }));
    const snowMat = track(new THREE.MeshStandardMaterial({ color: 0xf4f9ff, roughness: 0.7, flatShading: true }));
    const coneGeo = track(new THREE.ConeGeometry(1, 1.4, 7));
    const trunkGeo = track(new THREE.CylinderGeometry(0.15, 0.2, 0.8, 6));
    for (let i = 0; i < 60; i++) {
      const [x, z] = outside();
      const t = new THREE.Group(), s = range(0.9, 1.5);
      const trunk = new THREE.Mesh(trunkGeo, trunkMat); trunk.position.y = 0.4; t.add(trunk);
      for (let k = 0; k < 3; k++) {
        const cone = new THREE.Mesh(coneGeo, pineMat); cone.position.y = 1.1 + k * 0.75; cone.scale.setScalar(1 - k * 0.25); cone.castShadow = true; t.add(cone);
        const cap = new THREE.Mesh(coneGeo, snowMat); cap.position.y = 1.32 + k * 0.75; cap.scale.setScalar((1 - k * 0.25) * 0.62); t.add(cap);
      }
      t.position.set(x, 0, z); t.scale.setScalar(s); t.rotation.y = rnd() * 6; scene.add(t);
    }
  } else {
    // cactus (saguaro) à épines dessinées
    const spines = track(canvasTex(128, 128, (g) => {
      g.fillStyle = '#4f8a3a'; g.fillRect(0, 0, 128, 128);
      g.fillStyle = 'rgba(30,70,30,.55)'; for (let x = 0; x < 128; x += 16) g.fillRect(x, 0, 5, 128);
      g.fillStyle = 'rgba(255,250,210,.85)'; for (let i = 0; i < 90; i++) g.fillRect(rnd() * 128, rnd() * 128, 2, 2);
    }, [2, 3]));
    const cactusMat = track(new THREE.MeshStandardMaterial({ map: spines, roughness: 0.75 }));
    const capsule = (r, h) => track(new THREE.CapsuleGeometry(r, h, 6, 10));
    for (let i = 0; i < 34; i++) {
      const [x, z] = outside();
      const g = new THREE.Group(), h = range(1.4, 2.6);
      const trunk = new THREE.Mesh(capsule(0.26, h), cactusMat); trunk.position.y = h / 2 + 0.2; trunk.castShadow = true; g.add(trunk);
      for (const [sd, y, l] of [[1, h * 0.45, h * 0.35], [-1, h * 0.62, h * 0.28]]) {
        const arm = new THREE.Mesh(capsule(0.17, 0.4), cactusMat); arm.rotation.z = Math.PI / 2; arm.position.set(sd * 0.42, y, 0); g.add(arm);
        const up = new THREE.Mesh(capsule(0.17, l), cactusMat); up.position.set(sd * 0.68, y + l / 2 + 0.05, 0); up.castShadow = true; g.add(up);
      }
      g.position.set(x, 0, z); g.rotation.y = rnd() * 6; g.scale.setScalar(range(0.8, 1.3)); scene.add(g);
    }
    // palmiers : tronc courbé en anneaux + palmes
    const palmLeaf = track(new THREE.MeshStandardMaterial({ color: 0x3f9a3c, roughness: 0.8, side: THREE.DoubleSide, flatShading: true }));
    const ringGeo = track(new THREE.CylinderGeometry(0.16, 0.2, 0.42, 8));
    const leafGeo = track((() => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(0.35, 0.9, 0, 2.0); sh.quadraticCurveTo(-0.35, 0.9, 0, 0); const g = new THREE.ShapeGeometry(sh, 6); g.rotateX(-Math.PI / 2); return g; })());
    for (let i = 0; i < 18; i++) {
      const [x, z] = outside();
      const p = new THREE.Group();
      let px = 0, py = 0;
      const lean = range(0.08, 0.2);
      for (let k = 0; k < 9; k++) { const seg = new THREE.Mesh(ringGeo, trunkMat); px += lean * k * 0.05; seg.position.set(px, py + 0.21, 0); seg.rotation.z = -lean; p.add(seg); py += 0.4; }
      for (let k = 0; k < 7; k++) { const leaf = new THREE.Mesh(leafGeo, palmLeaf); leaf.position.set(px, py + 0.1, 0); leaf.rotation.set(range(-0.5, -0.2), (k / 7) * Math.PI * 2, 0, 'YXZ'); leaf.castShadow = true; p.add(leaf); }
      p.position.set(x, 0, z); p.rotation.y = rnd() * 6; p.scale.setScalar(range(0.9, 1.3)); scene.add(p);
    }
  }

  // --- Eau : bassins animés (on ne les traverse pas, les tirs passent au-dessus) ---
  const waterTiles = findTiles('w');
  const bridgeTiles = findTiles('H');
  let waterMat = null;
  if (waterTiles.length) {
    const geos = [...waterTiles, ...bridgeTiles].map(([c, r]) => { const [x, z] = cellCenter(c, r); return new THREE.PlaneGeometry(TILE * 1.02, TILE * 1.02).rotateX(-Math.PI / 2).translate(x, 0.06, z); });
    const geo = track(mergeGeometries(geos)); geos.forEach((g) => g.dispose());
    waterMat = track(new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { uTime: { value: 0 }, uDeep: { value: new THREE.Vector3(...(T.water?.[0] ?? [0.10, 0.48, 0.66])) }, uLight: { value: new THREE.Vector3(...(T.water?.[1] ?? [0.42, 0.82, 0.90])) } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `varying vec3 vW; uniform float uTime; uniform vec3 uDeep; uniform vec3 uLight;
        void main(){
          float a = sin(vW.x * 2.3 + uTime * 1.6) * sin(vW.z * 2.1 - uTime * 1.3);
          float b = sin((vW.x + vW.z) * 3.7 + uTime * 2.2);
          float n = a * 0.5 + b * 0.25;
          vec3 deep = uDeep, light = uLight;
          vec3 col = mix(deep, light, smoothstep(-0.4, 0.8, n));
          col += vec3(1.0) * smoothstep(0.62, 0.75, n) * 0.55;
          gl_FragColor = vec4(col, 0.92);
          #include <colorspace_fragment>
        }`,
    }));
    const water = new THREE.Mesh(geo, waterMat);
    water.receiveShadow = false;
    scene.add(water);
    // pierres et roseaux au bord
    const reedMat = track(new THREE.MeshStandardMaterial({ color: 0x5f8f3a, roughness: 0.8 }));
    const reedGeo = track(new THREE.ConeGeometry(0.05, 0.9, 4));
    for (const [c, r] of waterTiles) {
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if ('wH'.includes(tileAt(c + dc, r + dr)) || rnd() > 0.5) continue;
        const [x, z] = cellCenter(c, r);
        const reed = new THREE.Mesh(reedGeo, reedMat);
        reed.position.set(x + dc * TILE * 0.5 + range(-0.3, 0.3), 0.45, z + dr * TILE * 0.5 + range(-0.3, 0.3)); reed.rotation.z = range(-0.2, 0.2);
        scene.add(reed);
      }
    }
  }

  // --- Ponts de bois (on marche dessus, au-dessus de l'eau) ---
  if (bridgeTiles.length) {
    const plankMat = track(new THREE.MeshStandardMaterial({ color: 0xa0703c, roughness: 0.85 }));
    const plankDark = track(new THREE.MeshStandardMaterial({ color: 0x6e4a24, roughness: 0.9 }));
    const plankGeo = track(new RoundedBoxGeometry(TILE * 0.98, 0.12, TILE * 0.2, 1, 0.03));
    const n = bridgeTiles.length * 5;
    const planks = new THREE.InstancedMesh(plankGeo, plankMat, n);
    let i = 0;
    for (const [c, r] of bridgeTiles) {
      const [x, z] = cellCenter(c, r);
      for (let k = 0; k < 5; k++) planks.setMatrixAt(i++, new THREE.Matrix4().compose(new THREE.Vector3(x, 0.14, z - TILE / 2 + TILE * (k + 0.5) / 5), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, range(-0.03, 0.03), 0)), new THREE.Vector3(1, 1, 0.92)));
    }
    planks.receiveShadow = planks.castShadow = true; scene.add(planks);
    // rambardes sur les bords du pont qui donnent sur l'eau
    const railGeo = track(new THREE.BoxGeometry(0.1, 0.1, TILE));
    const postGeo2 = track(new THREE.BoxGeometry(0.14, 0.5, 0.14));
    for (const [c, r] of bridgeTiles) {
      const [x, z] = cellCenter(c, r);
      for (const dc of [-1, 1]) {
        if (tileAt(c + dc, r) !== 'w') continue;
        const rx = x + dc * (TILE / 2 - 0.08);
        const rail = new THREE.Mesh(railGeo, plankDark); rail.position.set(rx, 0.52, z); rail.castShadow = true; scene.add(rail);
        for (const dz of [-0.45, 0.45]) { const p = new THREE.Mesh(postGeo2, plankDark); p.position.set(rx, 0.3, z + dz * TILE); scene.add(p); }
      }
    }
  }

  function update(t, dt, focus) {
    if (waterMat) waterMat.uniforms.uTime.value = t;
    // l'ombre suit la zone visible
    sun.position.set(focus.x - 6, 14, focus.z + 8);
    sun.target.position.set(focus.x, 0, focus.z);
    for (const b of bushes) {
      b.wiggle = Math.max(0, b.wiggle - dt * 2.5);
      const w = Math.sin(t * 28) * 0.035 * b.wiggle;
      b.mesh.scale.set(1 + w, 1 - w, 1 + w);
      b.mat.opacity += (b.fade - b.mat.opacity) * Math.min(1, dt * 10);
      b.mat.depthWrite = b.mat.opacity > 0.95;
    }
  }
  /** Massif de buissons contenant la tuile (c, r), ou null. */
  const bushAt = (c, r) => (tileAt(c, r) === 'B' ? bushes.find((b) => b.tiles.has(r * COLS + c)) ?? null : null);
  function dispose() { disposables.forEach((d) => d.dispose()); }
  return { bushes, bushAt, update, dispose };
}
