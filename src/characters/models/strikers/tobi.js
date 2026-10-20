// TOBI — Commun (Feu). Ado mince et souriant : sweat à capuche orange, jean large retroussé,
// baskets montantes blanches et rouges, casquette à l'envers, cheveux châtains en bataille, taches de rousseur.
import * as THREE from 'three';
import {
  tiered, cloth, leather, hairMat, plain, drawEye, drawBrow, blush, faceTexture, plate, tube, addLocks,
  outline, canvas, tex, cached, rnd,
} from '../humanoid.js';
import { sneaker, boot } from '../../shoes.js';

const SKIN = '#f2c09c';

// Jean : toile bleue (grain, délavage, surpiqûres orange, plis) — u = 0 devant
function denimTex() {
  return cached('tobi:denim', () => {
    const [c, g] = canvas(512, 512);
    g.fillStyle = '#41639e'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '10,20,50'},${rnd() * 0.16})`; g.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 4, 1); }
    // délavage devant (u ≈ 0 et 1) et derrière les genoux
    for (const x of [0, 512]) { const rg = g.createRadialGradient(x, 230, 10, x, 230, 170); rg.addColorStop(0, 'rgba(190,215,245,.42)'); rg.addColorStop(1, 'rgba(190,215,245,0)'); g.fillStyle = rg; g.fillRect(x - 180, 40, 360, 400); }
    g.strokeStyle = 'rgba(232,150,52,.95)'; g.lineWidth = 2.5; g.setLineDash([9, 6]);
    for (const x of [126, 136, 382, 392]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); }
    g.setLineDash([]);
    g.strokeStyle = 'rgba(15,25,60,.35)'; g.lineWidth = 4;
    for (const [y, a] of [[400, 16], [440, 12], [478, 8], [120, 10]]) { g.beginPath(); g.moveTo(-10, y); g.bezierCurveTo(128, y - a, 384, y + a, 522, y - 4); g.stroke(); }
    return tex(c);
  });
}
// Sweat : maille + coutures (raglan, côtés) — u = 0 devant
function hoodieTex() {
  return cached('tobi:hoodie', () => {
    const [c, g] = canvas(1024, 512);
    g.fillStyle = '#fff'; g.fillRect(0, 0, 1024, 512);
    g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 3;
    for (const x of [256, 768]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (x < 512 ? 6 : -6), 512); g.stroke(); }
    // plis horizontaux au-dessus de la bande du bas
    g.strokeStyle = 'rgba(0,0,0,.1)'; g.lineWidth = 5;
    for (const [x, y] of [[60, 440], [190, 452], [840, 446], [960, 438], [520, 450]]) { g.beginPath(); g.moveTo(x - 50, y); g.quadraticCurveTo(x, y - 14, x + 50, y + 2); g.stroke(); }
    return tex(c);
  });
}

function drawFace(g, closed) {
  blush(g, 372, 388, 34, '240,130,110', 0.32);
  blush(g, 528, 388, 34, '240,130,110', 0.32);
  // taches de rousseur (nez et pommettes)
  const fr = [[372, 372], [384, 384], [362, 386], [392, 370], [378, 396], [520, 372], [508, 384], [532, 384], [516, 396], [500, 372], [440, 372], [452, 366], [462, 374], [446, 380]];
  for (const [x, y] of fr) { g.fillStyle = 'rgba(160,80,40,.55)'; g.beginPath(); g.ellipse(x, y, 2.6, 2.2, 0, 0, Math.PI * 2); g.fill(); }
  drawEye(g, { x: 398, y: 342, side: -1, w: 32, h: 30, iris: '#8a5224', closed, look: 2 });
  drawEye(g, { x: 502, y: 342, side: 1, w: 32, h: 30, iris: '#8a5224', closed, look: 2 });
  drawBrow(g, { x: 396, y: 296, side: -1, w: 34, t: 10, color: '#4a2a14', angle: -0.12, arch: 9 });
  drawBrow(g, { x: 504, y: 294, side: 1, w: 34, t: 10, color: '#4a2a14', angle: -0.08, arch: 10 });
  // ombre du nez
  g.fillStyle = 'rgba(190,105,80,.5)'; g.beginPath(); g.ellipse(452, 384, 13, 4.5, 0, 0, Math.PI * 2); g.fill();
  // grand sourire ouvert (dents + langue)
  const mouth = () => { g.beginPath(); g.moveTo(404, 398); g.bezierCurveTo(430, 404, 476, 402, 500, 392); g.bezierCurveTo(492, 428, 470, 442, 450, 442); g.bezierCurveTo(424, 442, 408, 424, 404, 398); g.closePath(); };
  mouth(); g.fillStyle = '#6e1f22'; g.fill();
  g.save(); mouth(); g.clip();
  g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(400, 396); g.bezierCurveTo(430, 406, 476, 404, 504, 390); g.lineTo(504, 410); g.bezierCurveTo(476, 418, 430, 418, 400, 410); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1.5; for (const x of [430, 450, 470]) { g.beginPath(); g.moveTo(x, 402); g.lineTo(x, 414); g.stroke(); }
  g.fillStyle = '#e0656a'; g.beginPath(); g.ellipse(454, 444, 30, 16, 0, 0, Math.PI * 2); g.fill();
  g.restore();
  mouth(); g.strokeStyle = '#4a1712'; g.lineWidth = 4; g.lineJoin = 'round'; g.stroke();
  // fossettes / coins de la bouche
  g.strokeStyle = 'rgba(130,60,45,.55)'; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(400, 394); g.quadraticCurveTo(397, 399, 400, 403); g.stroke();
  g.beginPath(); g.moveTo(504, 388); g.quadraticCurveTo(508, 393, 506, 398); g.stroke();
}

export const TOBI = {
  id: 'tobi',
  hipY: 0.84,
  depth: 0.66,
  torso: [[0.2, 0.72], [0.3, 0.745], [0.3, 0.8], [0.285, 0.9], [0.28, 1.02], [0.3, 1.16], [0.33, 1.3], [0.345, 1.39], [0.33, 1.45], [0.26, 1.5], [0.16, 1.53], [0.1, 1.545]],
  legs: { mat: 'jeans', pelvis: [0.27, 0.11, 0.18], hip: [0.15, 0, 0], knee: [0.185, 0.58, 0.03], ankle: [0.235, 0.34, 0.05], r: [0.152, 0.142, 0.15] },
  feet: { x: 0.26, z: 0.05, scale: 1.12, rotY: 0.24, build: (m, sd, o) => sneaker({ high: true, upper: 0xf7f6f2, accent: 0xff7a1a, sole: 0xf2f0ea, outsole: 0x26262b, lace: 0xffffff, outline: o.outline }) },
  arms: {
    r: [0.105, 0.095, 0.088], upperMat: 'top', hand: 0.95,
    poses: [
      { sh: [-0.31, 1.4, 0], el: [-0.47, 1.12, -0.03], fi: [-0.4, 0.86, 0.1], fistRot: [0.2, 0.4, -0.35] },
      { sh: [0.31, 1.4, 0], el: [0.43, 1.07, -0.02], fi: [0.43, 0.78, 0.07], fistRot: [0, -0.25, 0.05] },
    ],
  },
  neck: { r: 0.088, h: 0.22 },
  head: { y: 1.86, neckY: 1.5, r: 0.3, scale: 1.15, jaw: 0.05, chin: 0.03, taper: 0.06, s: [1, 1.04, 0.97], nose: 0.028 },
  idle: { breath: 2.4, hairSway: 0.012 },

  materials(rank, look) {
    const m = {};
    const orange = look?.top ?? 0xff7a1f;
    m.top = tiered(rank, cloth(orange, { kind: 'knit', map: hoodieTex(), ns: 0.5, rough: 0.88 }), { gold: 0xf0b43c, crystal: 0xffe6cf });
    m.rib = tiered(rank, cloth(new THREE.Color(orange).multiplyScalar(0.82), { kind: 'knit', ns: 1, rough: 0.9 }), { gold: 0xd99a2c, crystal: 0xffdcc0 });
    m.jeans = tiered(rank, cloth(0xffffff, { kind: 'denim', map: denimTex(), ns: 0.55, rough: 0.85 }), { gold: 0xe6aa36, crystal: 0xd9eaff, keepMap: false });
    if (look?.bottom !== undefined && rank === 'basique') m.jeans.color.set(look.bottom);
    m.cuffJ = tiered(rank, cloth(0x7d9bd0, { kind: 'denim', ns: 0.6 }), { gold: 0xf5c451, crystal: 0xeaf4ff, keepMap: false });
    m.shoe = tiered(rank, leather(0xf6f5f0, { rough: 0.5 }), { gold: 0xf5c451, crystal: 0xffffff });
    m.sole = tiered(rank, plain(0xfafafa, 0.7), { gold: 0x8a5410, crystal: 0xffffff, dark: true });
    m.shoeAccent = tiered(rank, plain(0xe0262e, 0.45), { gold: 0xc27a1c, crystal: 0xffd0d0, dark: true });
    m.lace = plain(rank === 'basique' ? 0xffffff : 0xfff0c8, 0.6);
    m.cap = tiered(rank, cloth(look?.cap ?? 0xd8262e, { kind: 'twill', ns: 0.4, rough: 0.75 }), { gold: 0xf0b43c, crystal: 0xeaf4ff });
    m.capDark = tiered(rank, cloth(0x1d1d24, { kind: 'twill', ns: 0.3 }), { gold: 0xb07a1c, crystal: 0xffffff, dark: true });
    m.hair = hairMat(rank, 0x5c3418);
    m.string = plain(0xf6f2ea, 0.7);
    m.metal = plain(0xcfd3d8, 0.25, { metalness: 0.9 });
    m.emblem = plain(rank === 'basique' ? 0xfff3e0 : 0x2a1a10, 0.5);
    m.skin = new THREE.MeshStandardMaterial({ color: 0xffffff, map: faceTexture('tobi', SKIN, drawFace, false), roughness: 0.62 });
    m.skinClosed = faceTexture('tobi', SKIN, drawFace, true);
    m.skinPlain = plain(SKIN, 0.62);
    return m;
  },

  build({ m, upper, U, T, arms, legs, body }) {
    // bande côtelée du bas du sweat
    upper.add(outline(new THREE.Mesh(T.shell([[0.285, 0.725], [0.308, 0.74], [0.31, 0.775], [0.302, 0.81], [0.29, 0.815]]), m.rib), 0.8));
    // poche kangourou (bords en biais) + surpiqûres
    const pocket = outline(new THREE.Mesh(T.conform(plate([[-0.215, 0.84], [0.215, 0.84], [0.215, 0.9], [0.165, 1.075], [-0.165, 1.075], [-0.215, 0.9]], 0.016), 0.002), m.top), 0.8);
    upper.add(pocket);
    for (const sd of [-1, 1]) upper.add(new THREE.Mesh(T.conform(plate([[sd * 0.215, 0.905], [sd * 0.205, 0.905], [sd * 0.157, 1.07], [sd * 0.167, 1.07]], 0, 2), 0.02), m.capDark));
    // emblème flamme sur la poitrine
    const flame = [[0.12, 1.22], [0.2, 1.22], [0.215, 1.27], [0.2, 1.32], [0.205, 1.37], [0.185, 1.33], [0.17, 1.36], [0.16, 1.31], [0.14, 1.34], [0.125, 1.28]];
    upper.add(outline(new THREE.Mesh(T.conform(plate(flame, 0.008), 0.004), m.emblem), 0.6));
    // capuche rabattue dans le dos + bord de capuche autour du cou
    const hood = outline(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), m.top));
    hood.scale.set(0.25, 0.17, 0.13); hood.position.set(0, U(1.46), -0.21); hood.rotation.x = -0.35;
    const hoodIn = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14), m.capDark);
    hoodIn.scale.set(0.17, 0.06, 0.07); hoodIn.position.set(0, U(1.575), -0.19); hoodIn.rotation.x = -0.35;
    upper.add(hood, hoodIn);
    const rim = [[-0.115, 1.38, 0.225], [-0.155, 1.5, 0.13], [-0.13, 1.57, -0.04], [0, 1.6, -0.13], [0.13, 1.57, -0.04], [0.155, 1.5, 0.13], [0.115, 1.38, 0.225]];
    upper.add(tube(rim.map(([x, y, z]) => [x, U(y), z]), 0.036, m.rib, { seg: 48, radial: 12, ol: 0.8 }));
    // cordons de capuche + embouts
    for (const sd of [-1, 1]) {
      const pts = [[sd * 0.062, 1.47, 0.205], [sd * 0.068, 1.38, 0.235], [sd * (0.07 + 0.01 * sd), 1.29, 0.238], [sd * 0.078, 1.23, 0.236]].map(([x, y, z]) => [x, U(y), z]);
      upper.add(tube(pts, 0.011, m.string, { seg: 20, radial: 8, ol: 0.5 }));
      const ag = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.045, 10), m.metal);
      ag.position.set(sd * 0.078, U(1.21), 0.236); upper.add(ag);
      // œillets
      const ey = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.004, 6, 12), m.metal);
      ey.position.set(sd * 0.062, U(1.455), 0.21); upper.add(ey);
    }
    // poignets côtelés
    for (const a of arms) {
      const c = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.094, 0.09, 0.075, 20), m.rib), 0.7);
      c.position.copy(a.wrist).addScaledVector(a.dir, -0.01);
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.dir);
      a.elbow.add(c);
    }
    // jean : revers retroussés sur les baskets + passants / ceinture visibles sous le sweat
    for (const l of legs) {
      const cuff = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.162, 0.168, 0.07, 28), m.cuffJ), 0.8);
      cuff.position.set(l.ankle[0], l.ankle[1] + 0.02, l.ankle[2]);
      cuff.rotation.z = -l.sd * 0.08;
      body.add(cuff);
    }
  },

  hair({ m, head, hair, R }) {
    // casquette à l'envers : calotte, coutures, bouton, visière dans la nuque, ouverture réglable devant
    const capG = new THREE.Group();
    capG.rotation.x = -0.4;
    head.add(capG);
    const dome = outline(new THREE.Mesh(new THREE.SphereGeometry(R * 1.085, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.5), m.cap));
    dome.scale.set(1.02, 0.95, 1.04); dome.position.y = 0.01;
    capG.add(dome);
    for (let i = 0; i < 3; i++) {
      const seam = new THREE.Mesh(new THREE.TorusGeometry(R * 1.095, 0.0035, 4, 48, Math.PI), m.capDark);
      seam.rotation.set(0, (i / 3) * Math.PI + Math.PI / 6, 0);
      seam.scale.set(0.95, 1.02, 1.04); seam.position.y = 0.01;
      capG.add(seam);
    }
    const btn = outline(new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 10), m.cap), 0.6);
    btn.scale.y = 0.6; btn.position.set(0, R * 1.03 + 0.01, 0); capG.add(btn);
    const band = new THREE.Mesh(new THREE.TorusGeometry(R * 1.09, 0.012, 6, 64), m.capDark);
    band.rotation.x = Math.PI / 2; band.scale.set(1.02, 1.04, 1); band.position.y = 0.012; capG.add(band);
    // visière (vers l'arrière)
    const brimShape = new THREE.Shape();
    brimShape.moveTo(-0.2, 0); brimShape.bezierCurveTo(-0.2, 0.2, 0.2, 0.2, 0.2, 0); brimShape.lineTo(-0.2, 0);
    const brim = outline(new THREE.Mesh(new THREE.ExtrudeGeometry(brimShape, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 16 }).rotateX(-Math.PI / 2), m.cap));
    brim.position.set(0, 0.0, -R * 1.02); brim.rotation.x = -0.12; capG.add(brim);
    // mèches en bataille : touffe qui sort de l'ouverture, frange, tempes, nuque
    const locks = [
      [[[0.0, 0.08, 0.28], [0.03, 0.13, 0.36], [0.05, 0.07, 0.4]], 0.06],
      [[[-0.03, 0.08, 0.28], [-0.05, 0.14, 0.35], [-0.09, 0.1, 0.38]], 0.055],
      [[[0.04, 0.07, 0.28], [0.09, 0.12, 0.34], [0.12, 0.06, 0.37]], 0.05],
      // frange qui dépasse sous le bord de la casquette
      [[[-0.16, 0.08, 0.24], [-0.17, 0.06, 0.32], [-0.14, -0.0, 0.33]], 0.08],
      [[[-0.08, 0.07, 0.27], [-0.09, 0.05, 0.33], [-0.05, -0.0, 0.34]], 0.075],
      [[[0.08, 0.07, 0.27], [0.1, 0.05, 0.33], [0.13, 0.0, 0.33]], 0.075],
      [[[0.17, 0.08, 0.23], [0.19, 0.05, 0.3], [0.2, -0.01, 0.29]], 0.075],
      // tempes et pattes
      [[[-0.27, 0.02, 0.1], [-0.33, -0.04, 0.12], [-0.31, -0.12, 0.08]], 0.075],
      [[[0.27, 0.02, 0.1], [0.33, -0.04, 0.12], [0.31, -0.12, 0.08]], 0.075],
      [[[-0.3, 0.0, -0.06], [-0.36, -0.05, -0.08], [-0.33, -0.12, -0.1]], 0.08],
      [[[0.3, 0.0, -0.06], [0.36, -0.05, -0.08], [0.33, -0.12, -0.1]], 0.08],
      // nuque (sous la visière)
      [[[-0.12, -0.04, -0.28], [-0.16, -0.12, -0.32], [-0.13, -0.18, -0.3]], 0.08],
      [[[0.0, -0.04, -0.3], [0.0, -0.13, -0.34], [0.02, -0.19, -0.31]], 0.09],
      [[[0.12, -0.04, -0.28], [0.16, -0.12, -0.32], [0.14, -0.18, -0.3]], 0.08],
      [[[-0.22, -0.02, -0.2], [-0.29, -0.09, -0.23], [-0.27, -0.16, -0.22]], 0.08],
      [[[0.22, -0.02, -0.2], [0.29, -0.09, -0.23], [0.27, -0.16, -0.22]], 0.08],
    ];
    addLocks(hair, locks, m.hair);
    // base des cheveux sous la casquette (évite le crâne nu sur les côtés)
    const under = new THREE.Mesh(new THREE.SphereGeometry(R * 1.02, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.62), m.hair);
    under.rotation.x = -0.75; under.scale.set(1.01, 1.0, 1);
    hair.add(under);
  },
};
