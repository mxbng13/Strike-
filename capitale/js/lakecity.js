// LA CAPITALE SUR LE LAC : une maison, un atelier ou un immeuble pour CHAQUE métier, regroupés en quartiers par secteur.
// Les métiers de la mer, de l'hôtellerie, des arts et du sport vivent sur pilotis, au bout des pontons.
// Quais illuminés, phare, place flottante et bateaux sur le lac.
import * as THREE from 'three';

// Style de bâtiment et couleurs par secteur
const STYLE = {
  agri: { type: 'house', roof: '#a0632f', glow: [0.6, 3.2, 0.8] }, agroalim: { type: 'house', roof: '#c4713a', glow: [3.6, 2.2, 0.6] },
  artisanat: { type: 'house', roof: '#8d3b2a', glow: [3.8, 1.6, 0.5] }, textile: { type: 'house', roof: '#7a4a8a', glow: [3.0, 1.0, 3.6] },
  services: { type: 'house', roof: '#b84a6a', glow: [3.8, 0.9, 2.2] }, extraction: { type: 'workshop', roof: '#5a5450', glow: [3.4, 2.4, 0.6] },
  industrie: { type: 'workshop', roof: '#4a4f58', glow: [3.8, 1.4, 0.4] }, mecanique: { type: 'workshop', roof: '#3c4656', glow: [0.6, 2.6, 4.0] },
  energie: { type: 'workshop', roof: '#3a3f2a', glow: [4.0, 3.6, 0.6] }, btp: { type: 'workshop', roof: '#b07a2a', glow: [4.0, 2.6, 0.4] },
  info: { type: 'tower', roof: '#2c3644', glow: [0.4, 3.2, 4.2] }, finance: { type: 'tower', roof: '#2a2f3a', glow: [3.8, 3.0, 1.0] },
  admin: { type: 'tower', roof: '#3a4250', glow: [1.6, 2.4, 4.0] }, droit: { type: 'tower', roof: '#3b3b46', glow: [3.0, 2.8, 2.0] },
  com: { type: 'tower', roof: '#352c44', glow: [3.6, 0.8, 3.4] }, sciences: { type: 'tower', roof: '#2a3c44', glow: [0.6, 4.0, 3.0] },
  sante: { type: 'tower', roof: '#e8eef2', glow: [4.2, 0.6, 0.6], white: true }, education: { type: 'tower', roof: '#4a3a2a', glow: [3.6, 3.0, 1.4] },
  securite: { type: 'tower', roof: '#22304a', glow: [0.8, 1.4, 4.4] },
  transport: { type: 'stilt', roof: '#2f5d8a', glow: [0.5, 2.4, 4.4] }, hotellerie: { type: 'stilt', roof: '#d0553a', glow: [4.0, 2.4, 0.8] },
  arts: { type: 'stilt', roof: '#7b3fa0', glow: [3.2, 0.8, 4.0] }, sport: { type: 'stilt', roof: '#3f8f4a', glow: [0.8, 4.0, 1.2] },
};
export const WATER_SECTORS = ['hotellerie', 'arts', 'transport', 'sport'];

export function buildLakeCity(ctx) {
  const { scene, add, MAT, towerMat, heightAt, polar, CAP_Y, ROADS, animated, buildShip, hash, jobHouses, sectors, LAKE, lakeDist, plotFor } = ctx;
  const C = (h) => new THREE.Color(h);
  const jobPos = {};          // id de la maison -> [x, z]
  const jobFront = {};        // point devant la porte
  const tops = {};            // id -> hauteur du toit (pour les étiquettes)
  const pickables = [];       // { mesh, ids: [] }
  const byJob = {};
  for (const h of jobHouses) byJob[h.jobHouse] = h;

  // ------------------------------------------------------------------ emplacements
  const slots = [];          // { id, x, z, y, rot, sector }
  const waterDeck = CAP_Y - 1.5;
  // 1) quartiers sur la terre ferme : secteurs en éventail au nord du lac
  const landSectors = sectors.filter((s) => !WATER_SECTORS.includes(s.id));
  const total = landSectors.reduce((a, s) => a + s.jobIds.length, 0);
  const A0 = 1.0, A1 = Math.PI * 2 - 1.0;
  let a = A0;
  const districtSigns = [];
  for (const sec of landSectors) {
    const span = (A1 - A0) * (sec.jobIds.length / total);
    const list = [...sec.jobIds];
    let r = 214;
    while (list.length) {
      const n = Math.max(1, Math.floor((span * r) / 34));
      const cands = [];
      for (let k = 0; k < n; k++) {
        const aa = a + span * (k + 0.5) / n;
        if (ROADS.some((rd) => Math.abs(Math.atan2(Math.sin(aa - rd), Math.cos(aa - rd))) * r < 18)) continue;
        cands.push(aa);
      }
      for (const aa of cands) {
        if (!list.length) break;
        const [x, z] = polar(r, aa);
        if (lakeDist(x, z) < 1.08) continue;
        slots.push({ id: `job:${list.shift()}`, x, z, y: CAP_Y, rot: aa + Math.PI, sector: sec.id });
      }
      r += 32;
      if (r > 900) break;
    }
    districtSigns.push({ sec, a: a + span / 2, r: 300 });
    a += span;
  }
  // 2) les pontons sur le lac
  const PIERS = [-0.5, -0.17, 0.17];
  const pierInfo = [];
  for (const pa of PIERS) {
    const dx = Math.sin(pa), dz = Math.cos(pa);
    let r0 = 150;
    while (lakeDist(dx * r0, dz * r0) > 1.0 && r0 < 600) r0 += 4;
    pierInfo.push({ a: pa, r0: r0 - 14, r1: r0 + 270 });
  }
  const waterJobs = { 0: ['hotellerie', 'arts'], 1: ['transport'], 2: ['sport'] };
  pierInfo.forEach((p, i) => {
    const list = sectors.filter((s) => waterJobs[i].includes(s.id)).flatMap((s) => s.jobIds.map((j) => [j, s.id]));
    const px = Math.cos(p.a), pz = -Math.sin(p.a), dx = Math.sin(p.a), dz = Math.cos(p.a);
    let k = 0;
    for (let r = p.r0 + 34; r < p.r1 - 10 && k < list.length; r += 25) {
      for (const side of [-1, 1]) {
        if (k >= list.length) break;
        const [j, sid] = list[k++];
        const x = dx * r + px * 17 * side, z = dz * r + pz * 17 * side;
        slots.push({ id: `job:${j}`, x, z, y: waterDeck, rot: p.a + (side > 0 ? -Math.PI / 2 : Math.PI / 2), sector: sid, stilt: true });
      }
    }
    districtSigns.push({ sec: sectors.find((s) => s.id === waterJobs[i][0]), a: p.a, r: p.r0 + 140, water: true, label: waterJobs[i].map((sid) => sectors.find((s) => s.id === sid).nom.split(',')[0]).join(' · ') });
  });

  // ------------------------------------------------------------------ maisons, ateliers, immeubles (en instances)
  const N = slots.length;
  const mk = (geo, mat, n = N) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.castShadow = true; m.receiveShadow = true; scene.add(m); return m; };
  const box = () => { const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); return g; };
  const roofGeo = new THREE.ConeGeometry(0.75, 0.6, 4); roofGeo.rotateY(Math.PI / 4); roofGeo.translate(0, 0.3, 0);
  const houseBody = mk(box(), new THREE.MeshStandardMaterial({ roughness: 0.8 }));
  const houseRoof = mk(roofGeo, new THREE.MeshStandardMaterial({ roughness: 0.7, flatShading: true }));
  const towerBody = mk(box(), towerMat(5, 14, 777, 2, 2));
  const towerWhite = mk(box(), new THREE.MeshStandardMaterial({ color: C('#eef3f6'), roughness: 0.4 }));
  const flatRoof = mk(box(), MAT.metal);
  const workBody = mk(box(), new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.4 }));
  const chimney = mk(new THREE.CylinderGeometry(0.5, 0.6, 1, 10).translate(0, 0.5, 0), MAT.metal);
  const band = mk(box(), new THREE.MeshBasicMaterial({ toneMapped: false }), N * 3);
  band.castShadow = false;
  const windowsLit = mk(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.0, 1.0), toneMapped: false }));
  windowsLit.castShadow = false;
  const platform = mk(box(), MAT.wood);
  const piling = mk(new THREE.CylinderGeometry(0.5, 0.5, 1, 6).translate(0, 0.5, 0), MAT.wood, N * 4 + 2000);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
  const put = (mesh, x, y, z, rot, sx, sy, sz, color) => {
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rot);
    if (mesh.count >= mesh.instanceMatrix.count) return -1;
    const i = mesh.count++;
    mesh.setMatrixAt(i, m4.compose(p.set(x, y, z), q, s.set(sx, sy, sz)));
    if (color) mesh.setColorAt(i, color);
    return i;
  };
  const local = (sl, ox, oz) => { const c = Math.cos(sl.rot), sn = Math.sin(sl.rot); return [sl.x + ox * c + oz * sn, sl.z - ox * sn + oz * c]; };
  const walls = [C('#f2ece1'), C('#e8dccb'), C('#dfe7ee'), C('#f4e3c9'), C('#e6efe2'), C('#f0e0e0')];
  const pickIds = new Map();     // mesh -> tableau instance -> id
  const reg = (mesh, i, id) => { if (i < 0) return; if (!pickIds.has(mesh)) pickIds.set(mesh, []); pickIds.get(mesh)[i] = id; };
  let seed = 1;
  const rnd = () => hash(seed++, 911, 5);
  for (const sl of slots) {
    const st = STYLE[sl.sector] || STYLE.services;
    const glow = new THREE.Color(...st.glow);
    const roofC = C(st.roof);
    let top = 0;
    const base = sl.y;
    if (sl.stilt) {
      // plateforme sur pilotis au-dessus de l'eau
      put(platform, sl.x, base - 0.6, sl.z, sl.rot, 16, 0.6, 16);
      for (const [ox, oz] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) { const [x, z] = local(sl, ox, oz); put(piling, x, -12, z, 0, 1, base + 12, 1); }
    }
    if (st.type === 'house' || st.type === 'stilt') {
      const w = 9 + rnd() * 3, d = 8 + rnd() * 2, h = st.type === 'stilt' ? 6 + rnd() * 5 : 5 + rnd() * 3;
      const wall = st.type === 'stilt' ? C(['#f6f1e4', '#e9f2f6', '#f6e7d8', '#eef5e6'][(rnd() * 4) | 0]) : walls[(rnd() * walls.length) | 0];
      reg(houseBody, put(houseBody, sl.x, base, sl.z, sl.rot, w, h, d, wall), sl.id);
      reg(houseRoof, put(houseRoof, sl.x, base + h, sl.z, sl.rot, w * 1.12, h * 0.7 + 2, d * 1.12, roofC), sl.id);
      put(band, sl.x, base + h - 0.6, sl.z, sl.rot, w + 0.3, 0.35, d + 0.3, glow);
      const [wx, wz] = local(sl, 0, d / 2 + 0.05);
      put(windowsLit, wx, base + h * 0.35, wz, sl.rot, w * 0.5, h * 0.25, 0.1);
      top = h + h * 0.7 + 2;
    } else if (st.type === 'tower') {
      const w = 11 + rnd() * 3, h = 16 + rnd() * 26;
      const mesh = st.white ? towerWhite : towerBody;
      reg(mesh, put(mesh, sl.x, base, sl.z, sl.rot, w, h, w, st.white ? null : C('#ffffff')), sl.id);
      put(flatRoof, sl.x, base + h, sl.z, sl.rot, w + 0.6, 0.8, w + 0.6);
      put(band, sl.x, base + h + 0.8, sl.z, sl.rot, w + 0.7, 0.45, w + 0.7, glow);
      if (st.white) { const [cx, cz] = local(sl, 0, w / 2 + 0.1); put(band, cx, base + h * 0.7, cz, sl.rot, 3, 1, 0.2, glow); put(band, cx, base + h * 0.7 - 1, cz, sl.rot, 1, 3, 0.2, glow); }
      top = h + 2;
    } else {
      const w = 15 + rnd() * 4, d = 11 + rnd() * 3, h = 7 + rnd() * 3;
      reg(workBody, put(workBody, sl.x, base, sl.z, sl.rot, w, h, d, roofC.clone().lerp(C('#c8ccd2'), 0.55)), sl.id);
      put(flatRoof, sl.x, base + h, sl.z, sl.rot, w + 0.4, 0.6, d + 0.4);
      put(band, sl.x, base + h - 0.8, sl.z, sl.rot, w + 0.3, 0.4, d + 0.3, glow);
      const [cx, cz] = local(sl, w * 0.3, -d * 0.2);
      put(chimney, cx, base + h, cz, 0, 1.4, 7 + rnd() * 6, 1.4);
      const [wx, wz] = local(sl, 0, d / 2 + 0.05);
      put(windowsLit, wx, base + h * 0.3, wz, sl.rot, w * 0.6, h * 0.2, 0.1);
      top = h + 8;
    }
    jobPos[sl.id] = [sl.x, sl.z];
    jobFront[sl.id] = local(sl, 0, 11);
    tops[sl.id] = base + top;
  }
  for (const m of [houseBody, houseRoof, towerBody, towerWhite, flatRoof, workBody, chimney, band, windowsLit, platform, piling]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }

  // ------------------------------------------------------------------ pontons, place flottante, phare
  for (const pi of pierInfo) {
    const len = pi.r1 - pi.r0, mid = (pi.r0 + pi.r1) / 2;
    const [mx, mz] = polar(mid, pi.a);
    const deck = add(new THREE.BoxGeometry(14, 1, len), MAT.wood, mx, waterDeck - 0.5, mz, scene);
    deck.rotation.y = pi.a;
    for (let r = pi.r0; r <= pi.r1; r += 14) for (const side of [-1, 1]) {
      const x = Math.sin(pi.a) * r + Math.cos(pi.a) * 6 * side, z = Math.cos(pi.a) * r - Math.sin(pi.a) * 6 * side;
      put(piling, x, -12, z, 0, 0.8, waterDeck + 11, 0.8);
      if (Math.round(r / 14) % 3 === 0) { add(new THREE.CylinderGeometry(0.2, 0.2, 5, 6), MAT.metal, x, waterDeck + 2.5, z, scene); add(new THREE.SphereGeometry(0.6, 8, 6), MAT.amber, x, waterDeck + 5.2, z, scene, false); }
    }
  }
  piling.instanceMatrix.needsUpdate = true; piling.computeBoundingSphere();
  // place flottante et phare au bout du ponton central
  const mp = pierInfo[1];
  const [lx, lz] = polar(mp.r1 + 26, mp.a);
  add(new THREE.CylinderGeometry(30, 30, 1.2, 40), MAT.wood, lx, waterDeck - 0.6, lz, scene);
  add(new THREE.CylinderGeometry(30.2, 30.2, 0.4, 40, 1, true), MAT.cyan, lx, waterDeck, lz, scene, false);
  for (let i = 0; i < 4; i++) add(new THREE.CylinderGeometry(3.4 - i * 0.4, 3.8 - i * 0.4, 6, 16), i % 2 ? MAT.red.clone() : MAT.white, lx + 14, waterDeck + 3 + i * 6, lz, scene);
  add(new THREE.CylinderGeometry(2.6, 2.6, 3, 12), MAT.glass, lx + 14, waterDeck + 26.5, lz, scene, false);
  const lamp = add(new THREE.SphereGeometry(1.6, 12, 10), MAT.amber, lx + 14, waterDeck + 26.5, lz, scene, false);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(14, 90, 24, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.0, 1.0), transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  beam.geometry.translate(0, -45, 0); beam.rotation.z = Math.PI / 2;
  const beamPivot = new THREE.Group(); beamPivot.position.set(lx + 14, waterDeck + 26.5, lz); beamPivot.add(beam); scene.add(beamPivot);
  const fountain = add(new THREE.CylinderGeometry(6, 7, 1.5, 24), MAT.white, lx - 8, waterDeck + 0.75, lz, scene);
  const jet = add(new THREE.CylinderGeometry(0.6, 1.4, 8, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 2.2, 3.2), transparent: true, opacity: 0.6, toneMapped: false }), lx - 8, waterDeck + 5, lz, scene, false);
  animated.push((t) => { beamPivot.rotation.y = t * 0.8; jet.scale.y = 0.8 + 0.25 * Math.sin(t * 3); lamp.scale.setScalar(0.9 + 0.15 * Math.sin(t * 5)); });

  // ------------------------------------------------------------------ quais illuminés le long du lac
  const quayW = mk(box(), new THREE.MeshStandardMaterial({ color: C('#9a948a'), roughness: 0.9 }), 400);
  const quayD = mk(box(), MAT.pave, 400);
  const lamps = mk(new THREE.SphereGeometry(0.7, 8, 6), MAT.amber, 200); lamps.castShadow = false;
  const posts = mk(new THREE.CylinderGeometry(0.18, 0.22, 1, 6).translate(0, 0.5, 0), MAT.metal, 200);
  const ell = (phi, k) => [LAKE.x + LAKE.rx * Math.sin(phi) * k, LAKE.z - LAKE.rz * Math.cos(phi) * k];
  let prev = null, cnt = 0;
  for (let phi = -1.25; phi <= 1.25; phi += 0.02) {
    const pt = ell(phi, 0.985);
    if (prev) {
      const dx = pt[0] - prev[0], dz = pt[1] - prev[1], L = Math.hypot(dx, dz), rot = Math.atan2(dx, dz);
      const cx = (pt[0] + prev[0]) / 2, cz = (pt[1] + prev[1]) / 2;
      put(quayW, cx, -8, cz, rot, 3, CAP_Y + 8, L + 0.5);
      put(quayD, cx, CAP_Y - 0.2, cz, rot, 9, 0.4, L + 0.5);
      if (cnt++ % 3 === 0) { put(posts, cx, CAP_Y, cz, 0, 1, 5, 1); put(lamps, cx, CAP_Y + 5.4, cz, 0, 1, 1, 1); }
    }
    prev = pt;
  }
  for (const m of [quayW, quayD, lamps, posts]) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); }

  // ------------------------------------------------------------------ bateaux sur le lac
  const boats = [];
  for (let i = 0; i < 9; i++) {
    let g;
    if (i % 3 === 0) { g = buildShip(1.8); }
    else {
      g = new THREE.Group();
      add(new THREE.BoxGeometry(3, 1.4, 9), MAT.white, 0, 0.7, 0, g);
      add(new THREE.CylinderGeometry(0.15, 0.15, 10, 6), MAT.metal, 0, 6, 0, g);
      const sail = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1.6, -3.5), new THREE.Vector3(0, 10.5, 0), new THREE.Vector3(0, 1.6, 3)]),
        new THREE.MeshStandardMaterial({ color: C(['#ffffff', '#ffd27a', '#ff8f6b', '#9fd6ff'][i % 4]), side: THREE.DoubleSide }));
      sail.geometry.computeVertexNormals(); g.add(sail);
    }
    scene.add(g);
    const k = 0.35 + (i % 4) * 0.13, ph = i * 0.9, sp = (0.03 + (i % 3) * 0.015) * (i % 2 ? 1 : -1);
    boats.push({ g, k, ph, sp });
  }
  animated.push((t) => {
    for (const b of boats) {
      const phi = b.ph + t * b.sp;
      const x = LAKE.x + LAKE.rx * b.k * Math.sin(phi), z = LAKE.z + LAKE.rz * b.k * Math.cos(phi) * 0.9;
      b.g.position.set(x, 0.4 + Math.sin(t * 1.5 + b.ph) * 0.25, z);
      b.g.rotation.y = Math.atan2(LAKE.rx * Math.cos(phi) * b.sp, -LAKE.rz * Math.sin(phi) * b.sp * 0.9) + Math.PI;
    }
  });

  // ------------------------------------------------------------------ panneaux de quartier et étiquettes des maisons
  const makeLabel = (emoji, text, color = '#5ee3ff', w = 512) => {
    const c = document.createElement('canvas'); c.width = w; c.height = 96;
    const g = c.getContext('2d');
    g.font = 'bold 40px Rajdhani, sans-serif';
    const tw = Math.min(w - 20, g.measureText(text).width + 90);
    g.fillStyle = 'rgba(8,18,34,0.85)'; g.beginPath(); g.roundRect((w - tw) / 2, 10, tw, 76, 20); g.fill();
    g.lineWidth = 5; g.strokeStyle = color; g.stroke();
    g.font = '44px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(emoji, (w - tw) / 2 + 14, 50);
    g.font = 'bold 38px Rajdhani, sans-serif'; g.fillStyle = '#e6f6ff';
    g.fillText(text, (w - tw) / 2 + 72, 51, tw - 84);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  const signs = districtSigns.map((d) => {
    const [x, z] = polar(d.r, d.a);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabel(d.sec.emoji, d.label || d.sec.nom.split(',')[0], '#ffb84d'), depthTest: false, transparent: true, toneMapped: false }));
    sp.position.set(x, (d.water ? CAP_Y : CAP_Y) + 60, z); sp.renderOrder = 11; scene.add(sp);
    return sp;
  });
  const POOL = 14;
  const pool = Array.from({ length: POOL }, () => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true, toneMapped: false }));
    sp.visible = false; sp.renderOrder = 12; sp.center.set(0.5, 0); scene.add(sp); return { sp, id: null };
  });
  const texCache = new Map();
  let tick = 0;
  function update(t, camera, target, dist) {
    for (const sp of signs) {
      sp.visible = dist > 180 && dist < 1500;
      const d = camera.position.distanceTo(sp.position);
      sp.scale.set(d * 0.11, d * 0.11 * 96 / 512, 1);
    }
    if ((tick++ & 3) !== 0) return;
    const ids = dist < 230 ? Object.keys(jobPos).map((id) => [id, Math.hypot(jobPos[id][0] - target.x, jobPos[id][1] - target.z)]).filter(([, d]) => d < dist * 1.1).sort((x, y) => x[1] - y[1]).slice(0, POOL).map(([id]) => id) : [];
    pool.forEach((slot, i) => {
      const id = ids[i];
      if (!id) { slot.sp.visible = false; slot.id = null; return; }
      if (slot.id !== id) {
        if (!texCache.has(id)) { const h = byJob[id.slice(4)]; texCache.set(id, makeLabel(h.emoji, h.nom)); }
        slot.sp.material.map = texCache.get(id); slot.sp.material.needsUpdate = true; slot.id = id;
      }
      slot.sp.visible = true;
      slot.sp.position.set(jobPos[id][0], tops[id] + 1.5, jobPos[id][1]);
      const d = camera.position.distanceTo(slot.sp.position);
      slot.sp.scale.set(d * 0.085, d * 0.085 * 96 / 512, 1);
    });
  }
  function pick(raycaster) {
    const hits = raycaster.intersectObjects([...pickIds.keys()], false);
    for (const h of hits) { const arr = pickIds.get(h.object); if (arr && h.instanceId !== undefined && arr[h.instanceId]) return arr[h.instanceId]; }
    return null;
  }
  return { jobPos, jobFront, update, pick, nightWindows: windowsLit };
}
