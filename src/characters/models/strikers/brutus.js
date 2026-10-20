// BRUTUS — Épique (Terre). Colosse trapu : débardeur noir, gilet de cuir sans manches clouté,
// pantalon cargo kaki à poches et genouillères, rangers, crâne rasé, grosse barbe, cicatrice, bras nus musclés.
import * as THREE from 'three';
import {
  tiered, cloth, leather, plain, drawEye, drawBrow, blush, faceTexture, plate, tube, addLocks, bulge,
  outline, canvas, tex, cached, rnd, paintFront, frontToSphere, hairStrands, goldMat, crystalMat, RoundedBoxGeometry,
} from '../humanoid.js';
import { sneaker, boot } from '../../shoes.js';

const SKIN = '#74462b';
const PECS = [{ x: -0.16, y: 1.33, amp: 0.045, sx: 0.13, sy: 0.085 }, { x: 0.16, y: 1.33, amp: 0.045, sx: 0.13, sy: 0.085 }];

// Cargo kaki : grain, coutures, plis
function cargoTex() {
  return cached('brutus:cargo', () => {
    const [c, g] = canvas(512, 512);
    g.fillStyle = '#5b6340'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 7000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,230' : '20,25,10'},${rnd() * 0.1})`; g.fillRect(rnd() * 512, rnd() * 512, 2, 1 + rnd() * 2); }
    g.strokeStyle = 'rgba(25,28,15,.5)'; g.lineWidth = 3;
    for (const x of [128, 384]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); }
    g.strokeStyle = 'rgba(20,25,10,.35)'; g.lineWidth = 5;
    for (const [y, a] of [[60, 12], [420, 18], [460, 12], [495, 8]]) { g.beginPath(); g.moveTo(-10, y); g.bezierCurveTo(128, y - a, 384, y + a, 522, y - 4); g.stroke(); }
    return tex(c);
  });
}
// Crâne rasé : repousse (points sombres) sur la calotte
function stubbleTex(color) {
  return cached(`brutus:stubble:${color}`, () => {
    const [c, g] = canvas(512, 256);
    g.fillStyle = color; g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 16000; i++) { g.fillStyle = `rgba(0,0,0,${0.2 + rnd() * 0.4})`; g.fillRect(rnd() * 512, rnd() * 256, 1.5, 1.5); }
    return tex(c);
  });
}
// Barbe : dessinée de face (pattes, mâchoire, menton, moustache), trou pour la bouche
function beardTex(color) {
  return cached(`brutus:beard:${color}`, () => {
    const front = paintFront((g) => {
      const path = () => {
        g.beginPath();
        g.moveTo(342, 322); g.lineTo(354, 322);
        g.bezierCurveTo(356, 356, 374, 380, 404, 386);
        g.bezierCurveTo(430, 378, 470, 378, 496, 386);
        g.bezierCurveTo(526, 380, 544, 356, 546, 322); g.lineTo(558, 322);
        g.bezierCurveTo(578, 380, 540, 470, 450, 478);
        g.bezierCurveTo(360, 470, 322, 380, 336, 300);
        g.closePath();
      };
      path(); g.fillStyle = color; g.fill();
      g.save(); path(); g.clip();
      for (let i = 0; i < 2600; i++) {
        const x = 330 + rnd() * 240, y = 300 + rnd() * 180;
        g.strokeStyle = rnd() < 0.5 ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.12)'; g.lineWidth = 1.4;
        const a = Math.atan2(y - 330, x - 450) * 0.3 + Math.PI / 2;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); g.stroke();
      }
      g.restore();
      // bouche (trou) : lèvres visibles entre moustache et barbe
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.ellipse(450, 412, 32, 9, 0, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'source-over';
      // moustache épaisse
      g.fillStyle = color;
      g.beginPath(); g.moveTo(450, 396); g.bezierCurveTo(430, 388, 400, 390, 392, 416); g.bezierCurveTo(410, 404, 432, 404, 450, 406);
      g.bezierCurveTo(468, 404, 490, 404, 508, 416); g.bezierCurveTo(500, 390, 470, 388, 450, 396); g.fill();
    }, 1024);
    return frontToSphere(front, 1024);
  });
}

function drawFace(g, closed) {
  // cernes / volume des pommettes
  blush(g, 380, 372, 30, '60,30,20', 0.18);
  blush(g, 520, 372, 30, '60,30,20', 0.18);
  drawEye(g, { x: 400, y: 344, side: -1, w: 30, h: 21, iris: '#4a2a14', closed, lidDrop: 0.28, lid: '#1a0e0a', look: 1 });
  drawEye(g, { x: 500, y: 344, side: 1, w: 30, h: 21, iris: '#4a2a14', closed, lidDrop: 0.28, lid: '#1a0e0a', look: 1 });
  // sourcils épais froncés
  drawBrow(g, { x: 400, y: 312, side: -1, w: 38, t: 14, color: '#1a110c', angle: 0.2, arch: 2 });
  drawBrow(g, { x: 500, y: 312, side: 1, w: 38, t: 14, color: '#1a110c', angle: 0.2, arch: 2 });
  // ride du froncement
  g.strokeStyle = 'rgba(40,20,12,.45)'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(444, 300); g.lineTo(446, 318); g.stroke(); g.beginPath(); g.moveTo(456, 300); g.lineTo(454, 318); g.stroke();
  // cicatrice (sur l'œil droit de l'image)
  g.strokeStyle = '#c98a72'; g.lineWidth = 5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(492, 290); g.lineTo(512, 386); g.stroke();
  g.strokeStyle = 'rgba(120,60,45,.6)'; g.lineWidth = 1.6;
  for (const k of [0.2, 0.42, 0.64, 0.86]) { const x = 492 + 20 * k, y = 290 + 96 * k; g.beginPath(); g.moveTo(x - 7, y + 1); g.lineTo(x + 7, y - 1); g.stroke(); }
  // nez large (narines)
  g.fillStyle = 'rgba(50,25,15,.55)';
  g.beginPath(); g.ellipse(438, 388, 7, 4, 0.3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(462, 388, 7, 4, -0.3, 0, Math.PI * 2); g.fill();
  // lèvres (bouche fermée, air sérieux)
  g.fillStyle = '#5a2e22'; g.beginPath(); g.ellipse(450, 414, 30, 8, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#2a120c'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(420, 413); g.quadraticCurveTo(450, 410, 480, 414); g.stroke();
}

export const BRUTUS = {
  id: 'brutus',
  hipY: 0.82,
  depth: 0.7,
  torsoMat: 'tank',
  torso: [[0.33, 0.74], [0.355, 0.8], [0.365, 0.9], [0.375, 1.0], [0.4, 1.12], [0.44, 1.25], [0.47, 1.36], [0.465, 1.45], [0.41, 1.51], [0.27, 1.56], [0.165, 1.585]],
  bumps: PECS,
  legs: { mat: 'cargo', pelvis: [0.35, 0.12, 0.25], hip: [0.19, 0, 0], knee: [0.23, 0.5, 0.04], ankle: [0.26, 0.32, 0.04], r: [0.185, 0.16, 0.155] },
  feet: { x: 0.27, z: 0.04, scale: 1.3, rotY: 0.3, build: (m, sd, o) => boot({ style: 'combat', color: 0x6b4a2e, sole: 0x141414, lace: 0x2a1d12, shaft: 0.2, outline: o.outline }) },
  arms: {
    r: [0.15, 0.128, 0.115], upperMat: 'skinPlain', hand: 1.28, crease: 0x4a2a1a,
    poses: [
      { sh: [-0.46, 1.43, 0], el: [-0.74, 1.17, -0.08], fi: [-0.47, 0.96, 0.16], fistRot: [0.2, 0.5, -1.7] },
      { sh: [0.46, 1.43, 0], el: [0.62, 1.09, -0.02], fi: [0.62, 0.79, 0.08], fistRot: [0, -0.25, 0.05] },
    ],
  },
  neck: { r: 0.135, h: 0.2 },
  head: { y: 1.86, neckY: 1.55, r: 0.29, scale: 1.04, jaw: 0.22, chin: 0.02, taper: 0, s: [1.05, 1.0, 0.98], nose: 0.042, noseY: -0.14 },
  idle: { breath: 1.8, hairSway: 0 },

  materials(rank, look) {
    const m = {};
    m.tank = tiered(rank, cloth(look?.top ?? 0x1c1d22, { kind: 'knit', ns: 0.4, rough: 0.85 }), { gold: 0x9a6a1c, crystal: 0x9fb4d8, dark: true });
    m.vest = tiered(rank, leather(look?.vest ?? 0x5a3220, { rough: 0.45 }), { gold: 0xf0b43c, crystal: 0xe6efff });
    m.vestEdge = tiered(rank, leather(0x3a1e12, { rough: 0.5 }), { gold: 0xc8902a, crystal: 0xffffff, dark: true });
    m.lining = new THREE.MeshStandardMaterial({ color: rank === 'basique' ? 0x2a1610 : rank === 'or' ? 0x7a4a10 : 0x8aa8e0, roughness: 0.7, side: THREE.BackSide });
    m.cargo = tiered(rank, cloth(0xffffff, { kind: 'twill', map: cargoTex(), ns: 0.45, rough: 0.9 }), { gold: 0xe6aa36, crystal: 0xd9eaff, keepMap: false });
    if (look?.bottom !== undefined && rank === 'basique') m.cargo.color.set(look.bottom);
    m.cargoDark = tiered(rank, cloth(0x474e30, { kind: 'twill', ns: 0.45 }), { gold: 0xd09a30, crystal: 0xeaf4ff });
    m.pad = tiered(rank, plain(0x22252a, 0.45), { gold: 0x8a5a14, crystal: 0xffffff, dark: true });
    m.boot = tiered(rank, leather(0x2a2420, { rough: 0.4 }), { gold: 0xc27a1c, crystal: 0xffffff, dark: true });
    m.bootSole = tiered(rank, plain(0x121212, 0.8), { gold: 0x6a4010, crystal: 0xd0d8ff, dark: true });
    m.lace = plain(0x3a302a, 0.6);
    m.metal = plain(0xc6c9cc, 0.22, { metalness: 1 });
    m.belt = leather(0x241812);
    m.band = plain(0xd8661a, 0.6);
    const hairCol = '#1a130f';
    m.hair = rank === 'or' ? goldMat(0xffd25e, 0.3) : rank === 'diamant' ? crystalMat(0xeef6ff) : new THREE.MeshStandardMaterial({ map: stubbleTex('#6e4630'), roughness: 0.9 });
    if (rank === 'or') m.hair.map = stubbleTex('#ffffff');
    if (rank === 'basique') m.beard = new THREE.MeshStandardMaterial({ map: beardTex(hairCol), transparent: true, alphaTest: 0.5, roughness: 0.85 });
    else { m.beard = rank === 'or' ? goldMat(0xffd25e, 0.3) : crystalMat(0xeef6ff); m.beard.alphaMap = beardTex('#ffffff'); m.beard.alphaTest = 0.5; }
    m.beardLock = rank === 'basique' ? new THREE.MeshStandardMaterial({ color: 0x1a130f, roughness: 0.8, map: hairStrands() }) : m.hair;
    m.skin = new THREE.MeshStandardMaterial({ color: 0xffffff, map: faceTexture('brutus', SKIN, drawFace, false), roughness: 0.55 });
    m.skinClosed = faceTexture('brutus', SKIN, drawFace, true);
    m.skinPlain = plain(SKIN, 0.55);
    m.earInner = plain(0x6e4028, 0.7);
    return m;
  },

  build({ m, upper, U, T, H, arms, legs, body, head, R, skull }) {
    const r = T.radius;
    // gilet de cuir sans manches, ouvert devant
    const GAP = 1.25;
    const prof = [[r(0.9) + 0.03, 0.9], [r(1.0) + 0.035, 1.0], [r(1.12) + 0.04, 1.12], [r(1.25) + 0.045, 1.25], [r(1.36) + 0.045, 1.36], [r(1.45) + 0.04, 1.45], [r(1.51) + 0.035, 1.51], [r(1.56) + 0.03, 1.56], [0.17, 1.6]];
    const vestGeo = bulge(T.shell(prof, { gap: GAP }), PECS.map((b) => ({ ...b, y: b.y - H, amp: b.amp * 0.8 })));
    const vest = outline(new THREE.Mesh(vestGeo, m.vest));
    upper.add(vest, new THREE.Mesh(vestGeo, m.lining));
    // bords du gilet (passepoil épais) + clous le long des bords
    for (const sd of [-1, 1]) {
      const pts = [];
      for (const y of [0.9, 1.0, 1.12, 1.25, 1.36, 1.45, 1.53, 1.585]) {
        const rb = r(y) + 0.04, a = sd * GAP / 2;
        const bump = PECS.reduce((s, b) => s + b.amp * 0.8 * Math.exp(-(((rb * Math.sin(a) - b.x) / b.sx) ** 2) - (((y - b.y) / b.sy) ** 2)), 0);
        pts.push([rb * Math.sin(a), U(y), rb * 0.7 * Math.cos(a) + bump]);
      }
      upper.add(tube(pts, 0.02, m.vestEdge, { seg: 40, radial: 8, ol: 0.6 }));
      for (let i = 1; i < 6; i++) {
        const [x, y, z] = pts[i];
        const stud = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.03, 8), m.metal);
        stud.position.set(x + sd * 0.035, y, z - 0.004); stud.rotation.x = Math.PI / 2;
        upper.add(stud);
      }
    }
    // clous sur les épaules du gilet
    for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) {
      const stud = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.035, 8), m.metal);
      const x = sd * (0.26 + i * 0.045), y = 1.545 - i * 0.025;
      stud.position.set(x, U(y), 0.02); stud.rotation.z = -sd * 0.3;
      upper.add(stud);
    }
    // écusson « montagne » dans le dos
    const patch = outline(new THREE.Mesh(T.conform(plate([[-0.17, 1.14], [0.17, 1.14], [0.17, 1.36], [-0.17, 1.36]], 0.008), 0.045, { dir: -1 }), m.vestEdge), 0.6);
    const mount = new THREE.Mesh(T.conform(plate([[-0.14, 1.16], [-0.06, 1.3], [-0.02, 1.24], [0.05, 1.34], [0.14, 1.16]], 0.006), 0.055, { dir: -1 }), plain(0xd8661a, 0.5));
    upper.add(patch, mount);
    // ceinture + boucle
    const belt = outline(new THREE.Mesh(T.shell([[r(0.76) + 0.022, 0.76], [r(0.8) + 0.026, 0.8], [r(0.84) + 0.022, 0.84]]), m.belt), 0.7);
    upper.add(belt);
    const buckle = outline(new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.075, 0.025, 3, 0.01), m.metal), 0.6);
    buckle.position.set(0, U(0.8), r(0.8) * 0.7 + 0.03); upper.add(buckle);
    // plaque militaire au cou
    upper.add(tube([[-0.12, U(1.58), 0.06], [-0.09, U(1.46), 0.22], [0, U(1.36), 0.3], [0.09, U(1.46), 0.22], [0.12, U(1.58), 0.06]], 0.006, m.metal, { seg: 30 }));
    const tag = outline(new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.075, 0.008, 2, 0.008), m.metal), 0.5);
    tag.position.set(0, U(1.33), 0.31); tag.rotation.x = -0.3; upper.add(tag);
    // biceps, avant-bras, bracelets de force, brassard clouté
    for (const a of arms) {
      const el = a.elbow.position;
      const bi = outline(new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), m.skinPlain), 0.8);
      bi.scale.set(0.11, 0.15, 0.11);
      bi.position.set(el.x * 0.5, el.y * 0.5, el.z * 0.5 + 0.05);
      bi.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), el.clone().normalize());
      a.shoulder.add(bi);
      const fa = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), m.skinPlain);
      fa.scale.set(0.12, 0.15, 0.12);
      fa.position.copy(a.wrist).multiplyScalar(0.32);
      fa.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.dir);
      a.elbow.add(fa);
      const wb = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.09, 20), m.band), 0.7);
      wb.position.copy(a.wrist).addScaledVector(a.dir, -0.03);
      wb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.dir);
      a.elbow.add(wb);
    }
    const armband = outline(new THREE.Mesh(new THREE.TorusGeometry(0.142, 0.028, 10, 28), m.vestEdge), 0.6);
    const el0 = arms[0].elbow.position;
    armband.position.copy(el0).multiplyScalar(0.45);
    armband.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), el0.clone().normalize());
    arms[0].shoulder.add(armband);
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.03, 6), m.metal);
      const ang = (i / 8) * Math.PI * 2;
      s.position.set(Math.cos(ang) * 0.165, Math.sin(ang) * 0.165, 0);
      s.rotation.z = ang - Math.PI / 2;
      armband.add(s);
    }
    // cargo : poches de cuisse à rabat, genouillères
    for (const l of legs) {
      const [hx, hy, hz] = l.hip, [kx, ky, kz] = l.knee;
      const p = new THREE.Group();
      p.position.set(hx + (kx - hx) * 0.45 + l.sd * 0.16, hy + (ky - hy) * 0.45, hz + (kz - hz) * 0.45 + 0.02);
      p.rotation.set(0, l.sd * Math.PI / 2, -l.sd * 0.07);
      const box = outline(new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.2, 0.06, 3, 0.02), m.cargo), 0.7);
      const flap = outline(new THREE.Mesh(new RoundedBoxGeometry(0.18, 0.06, 0.07, 3, 0.02), m.cargoDark), 0.7);
      flap.position.set(0, 0.09, 0.01);
      const snap = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 10), m.metal);
      snap.rotation.x = Math.PI / 2; snap.position.set(0, 0.08, 0.05);
      p.add(box, flap, snap);
      body.add(p);
      const pad = outline(new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.6), m.pad), 0.8);
      pad.scale.set(0.135, 0.13, 0.08);
      pad.position.set(kx, ky - 0.01, kz + 0.13); pad.rotation.x = Math.PI / 2;
      body.add(pad);
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.012, 6, 28), m.pad);
      strap.rotation.x = Math.PI / 2; strap.position.set(kx, ky + 0.06, kz); body.add(strap);
    }
    // barbe : coque peinte + volume au menton et le long de la mâchoire
    const beard = new THREE.Mesh(skull.geometry.clone().scale(1.035, 1.025, 1.06), m.beard);
    head.add(beard);
    addLocks(head, [
      [[[0, -0.22, 0.24], [0.0, -0.33, 0.27], [0.0, -0.4, 0.2]], 0.12, { flat: 0.7 }],
      [[[-0.1, -0.2, 0.23], [-0.13, -0.3, 0.24], [-0.1, -0.37, 0.17]], 0.1, { flat: 0.7 }],
      [[[0.1, -0.2, 0.23], [0.13, -0.3, 0.24], [0.1, -0.37, 0.17]], 0.1, { flat: 0.7 }],
      [[[-0.2, -0.13, 0.17], [-0.25, -0.24, 0.17], [-0.19, -0.31, 0.1]], 0.09, { flat: 0.7 }],
      [[[0.2, -0.13, 0.17], [0.25, -0.24, 0.17], [0.19, -0.31, 0.1]], 0.09, { flat: 0.7 }],
    ], m.beardLock, 0.4);
    // boucle d'oreille
    const ear = head.userData.ears[1];
    const stud = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), plain(0xf2c45a, 0.2, { metalness: 1 }));
    stud.position.set(0, -0.9, 0.3); ear.add(stud);
  },

  hair({ m, hair, R }) {
    // crâne rasé : calotte fine (repousse), ligne nette sur le front
    const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 1.012, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.55), m.hair);
    cap.rotation.x = -0.5; cap.scale.set(1.05, 1.0, 0.985);
    hair.add(cap);
  },
};
