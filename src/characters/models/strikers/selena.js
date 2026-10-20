// SELENA — Légendaire (Ombre). Grande et élancée : long trench bordeaux ceinturé (col relevé, boutons dorés),
// col roulé noir, collants sombres, cuissardes à talons, longs cheveux noirs ondulés, yeux de chat verts, lèvres rouges.
import * as THREE from 'three';
import {
  tiered, cloth, leather, hairMat, plain, drawEye, drawBrow, blush, faceTexture, plate, tube, addLocks, bulge,
  outline, canvas, tex, cached, rnd, RoundedBoxGeometry,
} from '../humanoid.js';
import { sneaker, boot } from '../../shoes.js';

const SKIN = '#f1cdb4';
const H = 1.0;
const BUST = [{ x: -0.095, y: 1.36, amp: 0.06, sx: 0.07, sy: 0.065 }, { x: 0.095, y: 1.36, amp: 0.06, sx: 0.07, sy: 0.065 }];

// Trench : gabardine (sergé), coutures, fente dans le dos — u = 0 devant, 0,5 dos
function coatTex() {
  return cached('selena:coat', () => {
    const [c, g] = canvas(1024, 1024);
    g.fillStyle = '#fff'; g.fillRect(0, 0, 1024, 1024);
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 3;
    for (const x of [256, 768]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 1024); g.stroke(); }
    g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.4)';
    g.beginPath(); g.moveTo(512, 0); g.lineTo(512, 1024); g.stroke();
    g.lineWidth = 7; g.beginPath(); g.moveTo(518, 640); g.lineTo(518, 1024); g.stroke();
    // surpiqûres le long de l'ourlet
    g.setLineDash([8, 6]); g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.35)';
    g.beginPath(); g.moveTo(0, 1000); g.lineTo(1024, 1000); g.stroke(); g.setLineDash([]);
    // plis verticaux
    g.strokeStyle = 'rgba(0,0,0,.1)'; g.lineWidth = 10;
    for (const x of [90, 180, 340, 420, 610, 690, 860, 940]) { g.beginPath(); g.moveTo(x, 1024); g.quadraticCurveTo(x + 8, 760, x - 4, 560); g.stroke(); }
    return tex(c);
  });
}

function drawFace(g, closed) {
  blush(g, 372, 384, 28, '230,110,120', 0.22);
  blush(g, 528, 384, 28, '230,110,120', 0.22);
  // fard à paupières fumé violet
  for (const [x, sd] of [[400, -1], [500, 1]]) {
    const rg = g.createRadialGradient(x + sd * 8, 326, 4, x + sd * 8, 326, 46);
    rg.addColorStop(0, 'rgba(90,30,90,.55)'); rg.addColorStop(1, 'rgba(90,30,90,0)');
    g.fillStyle = rg; g.fillRect(x - 56, 280, 112, 80);
  }
  drawEye(g, { x: 400, y: 342, side: -1, w: 37, h: 22, iris: '#2fb36e', closed, lashes: true, liner: true, slant: 0.17, lidDrop: 0.12, lid: '#140c12', look: 2 });
  drawEye(g, { x: 500, y: 342, side: 1, w: 37, h: 22, iris: '#2fb36e', closed, lashes: true, liner: true, slant: 0.17, lidDrop: 0.12, lid: '#140c12', look: 2 });
  drawBrow(g, { x: 398, y: 296, side: -1, w: 38, t: 5.5, color: '#1c1218', angle: 0.06, arch: 14 });
  drawBrow(g, { x: 502, y: 296, side: 1, w: 38, t: 5.5, color: '#1c1218', angle: 0.06, arch: 14 });
  g.strokeStyle = 'rgba(170,100,90,.45)'; g.lineWidth = 2.2; g.lineCap = 'round';
  g.beginPath(); g.moveTo(444, 384); g.quadraticCurveTo(452, 389, 460, 384); g.stroke();
  // lèvres rouges, sourire en coin
  const top = () => { g.beginPath(); g.moveTo(422, 410); g.bezierCurveTo(434, 400, 444, 398, 450, 403); g.bezierCurveTo(458, 397, 472, 397, 484, 402); g.quadraticCurveTo(452, 412, 422, 410); g.closePath(); };
  const bot = () => { g.beginPath(); g.moveTo(424, 411); g.quadraticCurveTo(452, 413, 482, 404); g.bezierCurveTo(474, 428, 432, 430, 424, 411); g.closePath(); };
  g.fillStyle = '#a3102c'; top(); g.fill(); g.fillStyle = '#c21a38'; bot(); g.fill();
  g.strokeStyle = '#5a0614'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(418, 410); g.quadraticCurveTo(452, 413, 490, 398); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.ellipse(452, 419, 9, 2.6, -0.1, 0, Math.PI * 2); g.fill();
}

export const SELENA = {
  id: 'selena',
  hipY: H,
  depth: 0.64,
  torsoMat: 'turtle',
  torso: [[0.235, 0.94], [0.245, 1.0], [0.225, 1.08], [0.2, 1.15], [0.21, 1.22], [0.24, 1.3], [0.268, 1.4], [0.282, 1.47], [0.272, 1.53], [0.215, 1.57], [0.13, 1.6], [0.085, 1.615]],
  bumps: BUST,
  legs: { mat: 'tights', pelvis: [0.245, 0.12, 0.17], hip: [0.115, 0, 0], knee: [0.125, 0.56, 0.03], ankle: [0.13, 0.17, 0.02], r: [0.12, 0.08, 0.062] },
  feet: { x: 0.14, z: 0.03, scale: 1.08, rotY: 0.18, build: (m, sd, o) => boot({ style: 'heel', color: 0x4a0f1e, sole: 0x0b0b0d, shaft: 0.26, outline: o.outline }) },
  arms: {
    r: [0.098, 0.088, 0.078], upperMat: 'coat', hand: 0.78, crease: 0xc0806a,
    poses: [
      { sh: [-0.28, 1.5, 0], el: [-0.5, 1.28, -0.06], fi: [-0.29, 1.1, 0.07], fistRot: [0.2, 0.5, -1.7] },
      { sh: [0.28, 1.5, 0], el: [0.37, 1.18, -0.02], fi: [0.37, 0.9, 0.07], fistRot: [0, -0.25, 0.05] },
    ],
  },
  neck: { r: 0.068, h: 0.26 },
  head: { y: 2.0, neckY: 1.6, r: 0.28, scale: 1.06, jaw: 0.0, chin: 0.08, taper: 0.15, s: [0.95, 1.08, 0.96], nose: 0.02, noseY: -0.13 },
  idle: { breath: 2.0, hairSway: 0.012 },

  materials(rank, look) {
    const m = {};
    m.coat = tiered(rank, cloth(look?.top ?? 0x6e1426, { kind: 'twill', map: coatTex(), ns: 0.4, rough: 0.6, env: 0.7 }), { gold: 0xf0b43c, crystal: 0xffd8e2 });
    m.coatEdge = tiered(rank, cloth(0x55101e, { kind: 'twill', ns: 0.4, rough: 0.6 }), { gold: 0xd99a2c, crystal: 0xffeef2 });
    m.lining = new THREE.MeshStandardMaterial({ color: rank === 'basique' ? 0x1a0a10 : rank === 'or' ? 0x6a3a08 : 0x9ab0e6, roughness: 0.4, metalness: 0.2, side: THREE.BackSide });
    m.turtle = tiered(rank, cloth(0x16141a, { kind: 'knit', ns: 0.9, rough: 0.85 }), { gold: 0x8a5a14, crystal: 0x6a7aa8, dark: true });
    m.tights = tiered(rank, new THREE.MeshStandardMaterial({ color: 0x23202a, roughness: 0.45, metalness: 0.1, envMapIntensity: 0.8 }), { gold: 0xe6aa36, crystal: 0xd9eaff });
    if (look?.bottom !== undefined && rank === 'basique') m.tights.color.set(look.bottom);
    m.boot = tiered(rank, leather(0x121014, { rough: 0.25, metal: 0.1 }), { gold: 0xc27a1c, crystal: 0xffffff, dark: true });
    m.bootSole = tiered(rank, plain(0x0a0a0a, 0.5), { gold: 0x6a4010, crystal: 0xd0d8ff, dark: true });
    m.belt = tiered(rank, leather(0x2a0a12, { rough: 0.35 }), { gold: 0xb07a1c, crystal: 0xffffff, dark: true });
    m.gold = plain(0xf2c45a, 0.22, { metalness: 1 });
    m.gem = new THREE.MeshPhysicalMaterial({ color: 0x29d07a, roughness: 0.05, transmission: 0.2, clearcoat: 1, emissive: 0x0a4020, emissiveIntensity: 0.6 });
    m.hair = hairMat(rank, look?.hair ?? 0x1d1622);
    m.skin = new THREE.MeshStandardMaterial({ color: 0xffffff, map: faceTexture('selena', SKIN, drawFace, false), roughness: 0.5 });
    m.skinClosed = faceTexture('selena', SKIN, drawFace, true);
    m.skinPlain = plain(SKIN, 0.5);
    m.earInner = plain(0xe0a090, 0.7);
    return m;
  },

  build({ m, upper, U, T, arms, legs, body, head }) {
    const r = T.radius;
    // col roulé
    const roll = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.083, 0.095, 0.13, 24, 3, true), m.turtle), 0.7);
    roll.position.y = U(1.645); upper.add(roll);
    const fold = outline(new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.025, 10, 28), m.turtle), 0.6);
    fold.rotation.x = Math.PI / 2; fold.position.y = U(1.69); upper.add(fold);
    // haut du trench (croisé, quasiment fermé) + jupe du manteau ouverte sous la ceinture
    const top = [[r(1.08) + 0.035, 1.08], [r(1.15) + 0.035, 1.15], [r(1.25) + 0.04, 1.25], [r(1.35) + 0.042, 1.35], [r(1.44) + 0.04, 1.44], [r(1.5) + 0.036, 1.5], [r(1.55) + 0.03, 1.55], [0.17, 1.59]];
    const topGeo = bulge(T.shell(top, { gap: 0.12 }), BUST.map((b) => ({ ...b, y: b.y - H, amp: b.amp * 0.85 })));
    upper.add(outline(new THREE.Mesh(topGeo, m.coat)), new THREE.Mesh(topGeo, m.lining));
    const skirt = [[0.43, 0.42], [0.405, 0.5], [0.37, 0.62], [0.33, 0.76], [0.3, 0.88], [0.285, 0.98], [r(1.06) + 0.04, 1.06], [r(1.13) + 0.04, 1.13]];
    const skirtGeo = T.shell(skirt, { gap: 0.75, d: 0.72 });
    upper.add(outline(new THREE.Mesh(skirtGeo, m.coat)), new THREE.Mesh(skirtGeo, m.lining));
    // ourlet du manteau (bande plus sombre)
    const hemGeo = T.shell([[0.432, 0.415], [0.436, 0.44], [0.428, 0.47]], { gap: 0.75, d: 0.72 });
    upper.add(outline(new THREE.Mesh(hemGeo, m.coatEdge), 0.6));
    // revers larges (pointes vers les épaules)
    for (const sd of [-1, 1]) {
      const pts = [[sd * 0.03, 1.2], [sd * 0.06, 1.2], [sd * 0.2, 1.45], [sd * 0.24, 1.52], [sd * 0.15, 1.5], [sd * 0.12, 1.58], [sd * 0.05, 1.56]];
      const lp = sd > 0 ? pts : [...pts].reverse();
      const lapel = outline(new THREE.Mesh(T.conform(plate(lp, 0.014), 0.012, { scale: 1.15 }), m.coatEdge), 0.8);
      const p = lapel.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i) + H; p.setZ(i, p.getZ(i) + BUST.reduce((s, b) => s + b.amp * 0.85 * Math.exp(-(((x - b.x) / b.sx) ** 2) - (((y - b.y) / b.sy) ** 2)), 0)); }
      p.needsUpdate = true; lapel.geometry.computeVertexNormals();
      upper.add(lapel);
    }
    // col relevé
    const collarGeo = new THREE.LatheGeometry([[0.15, 0.0], [0.165, 0.07], [0.2, 0.15], [0.205, 0.165]].map(([x, y]) => new THREE.Vector2(x, y)), 40, 0.5, Math.PI * 2 - 1.0);
    collarGeo.scale(1, 1, 0.9);
    const collar = outline(new THREE.Mesh(collarGeo, m.coatEdge), 0.8);
    collar.position.y = U(1.565); upper.add(collar, new THREE.Mesh(collarGeo, m.lining));
    collar.children.at(-1);
    // boutons dorés (croisé) + épaulettes
    for (const sd of [-1, 1]) for (const y of [1.18, 1.3]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.02, 14, 10), m.gold);
      b.scale.z = 0.5;
      const x = sd * 0.085;
      b.position.set(x, U(y), r(y) * 0.64 + 0.045 + BUST.reduce((s, q) => s + q.amp * 0.85 * Math.exp(-(((x - q.x) / q.sx) ** 2) - (((y - q.y) / q.sy) ** 2)), 0));
      upper.add(b);
    }
    for (const sd of [-1, 1]) {
      const ep = outline(new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.025, 0.08, 2, 0.01), m.coatEdge), 0.6);
      ep.position.set(sd * 0.22, U(1.575), 0); ep.rotation.z = -sd * 0.38; upper.add(ep);
      const eb = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), m.gold);
      eb.position.set(sd * 0.15, U(1.6), 0.03); upper.add(eb);
    }
    // ceinture serrée, boucle dorée, pans qui pendent
    const belt = outline(new THREE.Mesh(T.shell([[r(1.08) + 0.05, 1.08], [r(1.1) + 0.056, 1.1], [r(1.13) + 0.056, 1.13], [r(1.15) + 0.05, 1.15]]), m.belt), 0.7);
    upper.add(belt);
    const buckle = outline(new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 6, 4), m.gold), 0.5);
    buckle.rotation.z = Math.PI / 4; buckle.scale.set(1.3, 1, 1);
    buckle.position.set(-0.03, U(1.115), r(1.115) * 0.64 + 0.065); upper.add(buckle);
    upper.add(tube([[-0.07, U(1.11), r(1.11) * 0.64 + 0.06], [-0.1, U(1.02), 0.21], [-0.09, U(0.9), 0.24]], 0.016, m.belt, { ol: 0.6 }));
    // manches : patte de serrage au poignet
    for (const a of arms) {
      const c = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.084, 0.084, 0.05, 20), m.coatEdge), 0.6);
      c.position.copy(a.wrist).addScaledVector(a.dir, -0.05);
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.dir);
      a.elbow.add(c);
      const bt = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), m.gold);
      bt.position.copy(c.position).add(new THREE.Vector3(0, 0, 0.085));
      a.elbow.add(bt);
    }
    // boucles d'oreilles : goutte d'émeraude
    for (const ear of head.userData.ears) {
      const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 6), m.gold);
      ch.position.set(0, -1.3, 0.1); ear.add(ch);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), m.gem);
      gem.scale.set(0.8, 1.3, 0.8); gem.position.set(0, -2.0, 0.1); ear.add(gem);
    }
  },

  hair({ m, head, hair, R, anim }) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 1.04, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.6), m.hair);
    cap.rotation.x = -0.42; cap.scale.set(1.0, 1.08, 1.0);
    hair.add(outline(cap, 0.5));
    // raie sur le côté (x = 0,09) : grosse frange balayée vers la gauche de l'image
    const locks = [
      [[[0.09, 0.3, 0.07], [-0.08, 0.3, 0.3], [-0.24, 0.1, 0.3], [-0.3, -0.08, 0.24]], 0.15, { flat: 0.4 }],
      [[[0.1, 0.29, 0.1], [0.0, 0.25, 0.32], [-0.15, 0.1, 0.32], [-0.2, 0.0, 0.31]], 0.11, { flat: 0.4 }],
      [[[0.11, 0.29, 0.06], [0.21, 0.24, 0.24], [0.25, 0.1, 0.26], [0.24, -0.04, 0.24]], 0.1, { flat: 0.4 }],
    ];
    // longs cheveux ondulés dans le dos (vagues = zigzag doux)
    const N = 13;
    for (let i = 0; i < N; i++) {
      const a = Math.PI * 0.45 + (i / (N - 1)) * Math.PI * 1.1; // de l'oreille droite à l'oreille gauche par l'arrière
      const sx = Math.sin(a), cz = Math.cos(a);
      const len = 0.95 + 0.08 * Math.sin(i * 2.3);
      const pts = [];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        const rr = R * (0.6 + 0.65 * Math.min(1, t * 3));
        const y = 0.22 - t * len;
        const wave = Math.sin(t * Math.PI * 3 + i) * 0.035 * t;
        pts.push([sx * rr * (1 - 0.25 * t) + wave * cz, y, Math.min(cz * rr, -0.02) - 0.08 * t + wave * sx]);
      }
      locks.push([pts, 0.12 + 0.02 * Math.sin(i * 1.7), { flat: 0.55, segs: 36 }]);
    }
    // mèches qui retombent devant l'épaule (côté droit de l'image) + mèche fine côté gauche
    locks.push(
      [[[0.22, 0.12, 0.08], [0.33, -0.1, 0.12], [0.33, -0.35, 0.18], [0.28, -0.6, 0.22], [0.31, -0.82, 0.2]], 0.1, { flat: 0.5, segs: 36 }],
      [[[0.25, 0.1, 0.0], [0.36, -0.12, 0.04], [0.38, -0.4, 0.08], [0.34, -0.66, 0.1]], 0.1, { flat: 0.5, segs: 36 }],
      [[[-0.22, 0.12, 0.08], [-0.31, -0.08, 0.13], [-0.3, -0.3, 0.14], [-0.26, -0.45, 0.12]], 0.07, { flat: 0.5, segs: 30 }],
    );
    addLocks(hair, locks, m.hair, 0.4);
    anim.push((t) => { hair.rotation.x = Math.sin(t * 0.9) * 0.012; });
  },
};
