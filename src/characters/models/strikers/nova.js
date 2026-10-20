// NOVA — Rare (Vent). Sportive et vive : bomber court bleu-vert ouvert sur un débardeur blanc,
// jogging taille haute à bandes, baskets basses, longue queue de cheval rose-violet, casque audio au cou.
import * as THREE from 'three';
import {
  tiered, cloth, leather, hairMat, plain, glow, drawEye, drawBrow, blush, faceTexture, plate, tube, addLocks,
  bulge, outline, canvas, tex, cached, rnd,
} from '../humanoid.js';
import { sneaker, boot } from '../../shoes.js';

const SKIN = '#e9b58f';
const BUMPS = [{ x: -0.1, y: 1.31, amp: 0.07, sx: 0.075, sy: 0.07 }, { x: 0.1, y: 1.31, amp: 0.07, sx: 0.075, sy: 0.07 }];

// Jogging : molleton anthracite + double bande blanche sur les côtés (u = 0,25 et 0,75)
function joggerTex(base = '#2c2f3a', stripe = '#f4f4f4') {
  return cached(`nova:jog:${base}`, () => {
    const [c, g] = canvas(512, 512);
    g.fillStyle = base; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(255,255,255,${rnd() * 0.05})`; g.fillRect(rnd() * 512, rnd() * 512, 2, 2); }
    g.fillStyle = stripe;
    for (const x of [112, 136, 368, 392]) g.fillRect(x, 0, 14, 512);
    g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 4;
    for (const [y, a] of [[90, 10], [300, 14], [330, 10]]) { g.beginPath(); g.moveTo(-10, y); g.bezierCurveTo(128, y - a, 384, y + a, 522, y - 4); g.stroke(); }
    return tex(c);
  });
}
// Bomber : nylon satiné, coutures verticales et poche bras
function bomberTex() {
  return cached('nova:bomber', () => {
    const [c, g] = canvas(1024, 512);
    g.fillStyle = '#fff'; g.fillRect(0, 0, 1024, 512);
    g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 3;
    for (const x of [180, 340, 512, 684, 844]) { g.beginPath(); g.moveTo(x, 40); g.lineTo(x, 512); g.stroke(); }
    // reflets froissés du nylon
    for (let i = 0; i < 40; i++) { const x = rnd() * 1024, y = 60 + rnd() * 400; g.strokeStyle = `rgba(255,255,255,${0.1 + rnd() * 0.15})`; g.lineWidth = 3 + rnd() * 5; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 20, y - 12, x + 50, y - 4); g.stroke(); }
    return tex(c);
  });
}

function drawFace(g, closed) {
  blush(g, 370, 384, 30, '245,120,150', 0.3);
  blush(g, 530, 384, 30, '245,120,150', 0.3);
  // ombre douce sous l'arcade
  drawEye(g, { x: 400, y: 340, side: -1, w: 35, h: 25, iris: '#9b4fe0', closed, lashes: true, slant: 0.08, look: 3 });
  drawEye(g, { x: 500, y: 340, side: 1, w: 35, h: 25, iris: '#9b4fe0', closed, lashes: true, slant: 0.08, look: 3 });
  drawBrow(g, { x: 398, y: 298, side: -1, w: 36, t: 6, color: '#7a2c62', angle: -0.02, arch: 10 });
  drawBrow(g, { x: 502, y: 298, side: 1, w: 36, t: 6, color: '#7a2c62', angle: -0.02, arch: 10 });
  // grain de beauté
  g.fillStyle = '#5a2a20'; g.beginPath(); g.arc(532, 374, 3.2, 0, Math.PI * 2); g.fill();
  // nez (ombre fine)
  g.strokeStyle = 'rgba(170,95,70,.45)'; g.lineWidth = 2.5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(442, 382); g.quadraticCurveTo(452, 388, 462, 382); g.stroke();
  // lèvres : lèvre supérieure en arc, lèvre inférieure pleine, léger sourire
  const lipTop = () => { g.beginPath(); g.moveTo(420, 408); g.bezierCurveTo(432, 400, 444, 398, 450, 403); g.bezierCurveTo(456, 398, 470, 400, 482, 406); g.quadraticCurveTo(452, 412, 420, 408); g.closePath(); };
  const lipBot = () => { g.beginPath(); g.moveTo(422, 409); g.quadraticCurveTo(452, 413, 480, 407); g.bezierCurveTo(474, 426, 430, 428, 422, 409); g.closePath(); };
  g.fillStyle = '#d4587a'; lipTop(); g.fill(); g.fillStyle = '#e8708e'; lipBot(); g.fill();
  g.strokeStyle = '#7a2238'; g.lineWidth = 2.6;
  g.beginPath(); g.moveTo(416, 405); g.quadraticCurveTo(452, 414, 486, 402); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(448, 417, 10, 3, 0, 0, Math.PI * 2); g.fill();
}

export const NOVA = {
  id: 'nova',
  hipY: 0.94,
  depth: 0.64,
  torsoMat: 'skinPlain',
  torso: [[0.245, 0.88], [0.25, 0.94], [0.232, 1.02], [0.212, 1.1], [0.222, 1.18], [0.252, 1.27], [0.282, 1.37], [0.298, 1.44], [0.288, 1.5], [0.228, 1.54], [0.14, 1.57], [0.085, 1.585]],
  bumps: BUMPS,
  legs: { mat: 'jog', pelvis: [0.265, 0.12, 0.185], hip: [0.13, 0, 0], knee: [0.155, 0.56, 0.035], ankle: [0.175, 0.2, 0.03], r: [0.138, 0.108, 0.082] },
  feet: { x: 0.18, z: 0.05, scale: 1.02, rotY: 0.22, build: (m, sd, o) => sneaker({ runner: true, upper: 0x1d1f26, accent: 0x1fd3c0, sole: 0xf4f4f4, outsole: 0x1fd3c0, lace: 0xffffff, outline: o.outline }) },
  arms: {
    r: [0.112, 0.102, 0.094], upperMat: 'bomber', hand: 0.82, crease: 0xb07058,
    poses: [
      { sh: [-0.29, 1.45, 0], el: [-0.52, 1.22, -0.06], fi: [-0.31, 1.03, 0.08], fistRot: [0.2, 0.5, -1.7] },
      { sh: [0.29, 1.45, 0], el: [0.39, 1.13, -0.02], fi: [0.4, 0.86, 0.07], fistRot: [0, -0.25, 0.05] },
    ],
  },
  neck: { r: 0.072, h: 0.24 },
  head: { y: 1.94, neckY: 1.56, r: 0.29, scale: 1.08, jaw: 0.0, chin: 0.07, taper: 0.12, s: [0.97, 1.06, 0.96], nose: 0.022, noseY: -0.14 },
  idle: { breath: 2.3, hairSway: 0.015 },

  materials(rank, look) {
    const m = {};
    m.bomber = tiered(rank, cloth(look?.top ?? 0x1fa79c, { kind: 'twill', map: bomberTex(), ns: 0.25, rough: 0.42, env: 0.8 }), { gold: 0xf0b43c, crystal: 0xd7fff8 });
    m.rib = tiered(rank, cloth(0x153a44, { kind: 'knit', ns: 1, rough: 0.9 }), { gold: 0xb7801e, crystal: 0xffffff, dark: true });
    m.lining = new THREE.MeshStandardMaterial({ color: rank === 'basique' ? 0xff7a2a : rank === 'or' ? 0x7a4a10 : 0xa8c8ff, roughness: 0.5, side: THREE.BackSide });
    m.tank = tiered(rank, cloth(0xf7f7f4, { kind: 'knit', ns: 0.35, rough: 0.8 }), { gold: 0xffe08a, crystal: 0xffffff });
    m.jog = tiered(rank, cloth(0xffffff, { kind: 'knit', map: joggerTex(), ns: 0.3, rough: 0.9 }), { gold: 0xe6aa36, crystal: 0xd9eaff, keepMap: false });
    if (look?.bottom !== undefined && rank === 'basique') m.jog.color.set(look.bottom);
    m.jogRib = tiered(rank, cloth(0x24262f, { kind: 'knit', ns: 1 }), { gold: 0xb07a1c, crystal: 0xffffff, dark: true });
    m.shoe = tiered(rank, leather(0xfafafa, { rough: 0.55 }), { gold: 0xf5c451, crystal: 0xffffff });
    m.sole = tiered(rank, plain(0xe9e4dc, 0.7), { gold: 0x8a5410, crystal: 0xffffff, dark: true });
    m.shoeAccent = tiered(rank, plain(0x1fa79c, 0.45), { gold: 0xc27a1c, crystal: 0xb8fff4, dark: true });
    m.lace = plain(0xffffff, 0.6);
    m.hair = hairMat(rank, look?.hair ?? 0xd4609e);
    m.tie = plain(0x22c4b4, 0.35);
    m.phone = plain(0x1b1d24, 0.35, { metalness: 0.3 });
    m.phonePad = plain(0x2a2c34, 0.8);
    m.phoneGlow = glow(0x3ff7e0, 1.8);
    m.zip = plain(0xcfd4da, 0.25, { metalness: 1 });
    m.gold = plain(0xf2c45a, 0.25, { metalness: 1 });
    m.skin = new THREE.MeshStandardMaterial({ color: 0xffffff, map: faceTexture('nova', SKIN, drawFace, false), roughness: 0.58 });
    m.skinClosed = faceTexture('nova', SKIN, drawFace, true);
    m.skinPlain = plain(SKIN, 0.58);
    m.earInner = plain(0xd08f72, 0.7);
    return m;
  },

  build({ m, upper, U, T, arms, legs, body, head, R }) {
    const r = T.radius;
    // nombril
    const navel = new THREE.Mesh(T.conform(plate([[-0.009, 1.035], [0.009, 1.035], [0.007, 1.06], [-0.007, 1.06]], 0, 2), 0.001), plain(0x9a5a40, 0.8));
    upper.add(navel);
    // débardeur blanc (suit la poitrine), bretelles
    const tankProf = [[0.0, 1.12], [r(1.12) + 0.01, 1.12], [r(1.2) + 0.014, 1.2], [r(1.3) + 0.016, 1.3], [r(1.4) + 0.016, 1.4], [r(1.46) + 0.014, 1.46], [r(1.49) + 0.008, 1.49]];
    const tank = outline(new THREE.Mesh(bulge(T.shell(tankProf.slice(1)), BUMPS.map((b) => ({ ...b, amp: b.amp + 0.014, y: b.y - 0.94 }))), m.tank), 0.8);
    upper.add(tank);
    // jogging taille haute : ceinture élastique + cordon
    const band = outline(new THREE.Mesh(T.shell([[r(0.9) + 0.012, 0.9], [r(0.95) + 0.016, 0.95], [r(1.0) + 0.016, 1.0], [r(1.03) + 0.01, 1.03]]), m.jogRib), 0.8);
    upper.add(band);
    for (const sd of [-1, 1]) {
      upper.add(tube([[sd * 0.03, U(0.985), r(0.985) * 0.64 + 0.02], [sd * 0.04, U(0.93), r(0.93) * 0.64 + 0.03], [sd * 0.05, U(0.86), r(0.9) * 0.64 + 0.02]], 0.008, m.lace, { ol: 0.4 }));
    }
    // bomber court ouvert : coque ouverte devant, doublure orange, col / bas côtelés, zip
    const GAP = 1.15;
    const prof = [[r(1.07) + 0.04, 1.07], [r(1.14) + 0.045, 1.14], [r(1.25) + 0.05, 1.25], [r(1.35) + 0.05, 1.35], [r(1.44) + 0.045, 1.44], [r(1.5) + 0.04, 1.5], [r(1.54) + 0.03, 1.54], [0.12, 1.575]];
    const bomber = new THREE.Mesh(bulge(T.shell(prof, { gap: GAP }), BUMPS.map((b) => ({ ...b, amp: b.amp * 0.6, y: b.y - 0.94 }))), m.bomber);
    upper.add(outline(bomber));
    upper.add(new THREE.Mesh(bomber.geometry, m.lining));
    const hem = outline(new THREE.Mesh(T.shell([[r(1.04) + 0.045, 1.035], [r(1.06) + 0.052, 1.06], [r(1.09) + 0.05, 1.095]], { gap: GAP }), m.rib), 0.8);
    upper.add(hem);
    for (const sd of [-1, 1]) {
      const pts = [];
      for (const y of [1.04, 1.12, 1.2, 1.3, 1.4, 1.48, 1.53]) {
        const rb = r(y) + 0.045, a = sd * GAP / 2;
        pts.push([rb * Math.sin(a), U(y), rb * 0.64 * Math.cos(a) + (y > 1.2 && y < 1.42 ? 0.02 : 0)]);
      }
      upper.add(tube(pts, 0.011, m.zip, { seg: 30, radial: 6 }));
    }
    const collar = [[-0.15, 1.5, 0.12], [-0.155, 1.58, 0.0], [-0.1, 1.62, -0.1], [0, 1.635, -0.13], [0.1, 1.62, -0.1], [0.155, 1.58, 0.0], [0.15, 1.5, 0.12]];
    upper.add(tube(collar.map(([x, y, z]) => [x, U(y), z]), 0.034, m.rib, { seg: 40, radial: 12, ol: 0.8 }));
    // poche zippée sur la manche gauche + poignets côtelés
    const sl = arms[1];
    const pocket = outline(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.02), m.bomber), 0.6);
    pocket.position.set(0.105, -0.12, 0.01); pocket.rotation.set(0, Math.PI / 2, -0.12); sl.shoulder.add(pocket);
    for (const a of arms) {
      const c = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.092, 0.08, 20), m.rib), 0.7);
      c.position.copy(a.wrist).addScaledVector(a.dir, -0.012);
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.dir);
      a.elbow.add(c);
    }
    // jogging : chevilles resserrées
    for (const l of legs) {
      const cuff = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.086, 0.09, 0.08, 24), m.jogRib), 0.7);
      cuff.position.set(l.ankle[0], l.ankle[1] + 0.03, l.ankle[2]);
      body.add(cuff);
    }
    // casque audio autour du cou
    const bandPts = [[-0.17, 1.52, 0.1], [-0.19, 1.6, -0.02], [-0.12, 1.66, -0.13], [0, 1.68, -0.16], [0.12, 1.66, -0.13], [0.19, 1.6, -0.02], [0.17, 1.52, 0.1]];
    upper.add(tube(bandPts.map(([x, y, z]) => [x, U(y), z]), 0.017, m.phone, { seg: 40, radial: 10, ol: 0.6 }));
    for (const sd of [-1, 1]) {
      const cup = new THREE.Group();
      cup.position.set(sd * 0.165, U(1.5), 0.13);
      cup.rotation.set(-0.9, 0, sd * 0.5);
      const shell = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.045, 28), m.phone), 0.7);
      const pad = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.02, 10, 28), m.phonePad);
      pad.rotation.x = Math.PI / 2; pad.position.y = -0.03;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.007, 6, 28), m.phoneGlow);
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.024;
      cup.add(shell, pad, ring);
      upper.add(cup);
    }
    // créoles dorées
    for (const ear of head.userData.ears) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.07, 8, 24), m.gold);
      hoop.position.set(0, -0.95, 0.1); hoop.rotation.y = Math.PI / 2;
      ear.add(hoop);
    }
  },

  hair({ m, head, hair, R, anim }) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 1.035, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.56), m.hair);
    cap.rotation.x = -0.5; cap.scale.set(0.99, 1.07, 1.0);
    hair.add(outline(cap, 0.5));
    const TIE = [0, 0.19, -0.27];
    // mèches tirées vers l'élastique (texture des cheveux attachés)
    const locks = [];
    for (let i = 0; i < 9; i++) {
      const a = -1.25 + (i / 8) * 2.5;
      const base = [Math.sin(a) * R * 0.8, 0.15 + 0.05 * Math.cos(a), Math.cos(a) * R * 0.75];
      const mid = new THREE.Vector3((base[0] + TIE[0]) / 2, (base[1] + TIE[1]) / 2 + 0.12, (base[2] + TIE[2]) / 2).normalize().multiplyScalar(R * 1.1);
      const ctrl = mid.toArray();
      locks.push([[base, ctrl, [TIE[0] + Math.sin(a) * 0.03, TIE[1] + 0.02, TIE[2] + 0.02]], 0.09, { flat: 0.3 }]);
    }
    // frange balayée sur le côté + mèches qui encadrent le visage
    locks.push(
      [[[0.1, 0.28, 0.13], [-0.04, 0.25, 0.31], [-0.22, 0.07, 0.3]], 0.12, { flat: 0.4 }],
      [[[0.13, 0.26, 0.15], [0.06, 0.2, 0.33], [-0.1, 0.06, 0.33]], 0.1, { flat: 0.4 }],
      [[[0.16, 0.24, 0.16], [0.2, 0.18, 0.3], [0.2, 0.07, 0.31]], 0.07, { flat: 0.4 }],
      [[[-0.2, 0.17, 0.19], [-0.31, 0.0, 0.22], [-0.29, -0.15, 0.2], [-0.25, -0.32, 0.17]], 0.06, { flat: 0.35 }],
      [[[0.2, 0.17, 0.19], [0.31, 0.0, 0.22], [0.29, -0.15, 0.2], [0.26, -0.3, 0.16]], 0.055, { flat: 0.35 }],
    );
    addLocks(hair, locks, m.hair);
    // élastique + longue queue de cheval (se balance)
    const tie = outline(new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.022, 10, 24), m.tie), 0.6);
    tie.position.set(...TIE); tie.rotation.x = 0.5;
    hair.add(tie);
    const tail = new THREE.Group();
    tail.position.set(...TIE);
    hair.add(tail);
    const tl = [
      [[[0, 0, 0], [0, 0.06, -0.12], [0.0, -0.08, -0.24], [0.02, -0.35, -0.26], [0.0, -0.62, -0.18]], 0.13, { flat: 0.6 }],
      [[[0.02, 0, 0], [0.06, 0.04, -0.1], [0.08, -0.1, -0.2], [0.09, -0.38, -0.2], [0.07, -0.58, -0.12]], 0.09, { flat: 0.6 }],
      [[[-0.02, 0, 0], [-0.06, 0.04, -0.1], [-0.08, -0.1, -0.2], [-0.08, -0.36, -0.2], [-0.05, -0.6, -0.12]], 0.09, { flat: 0.6 }],
      [[[0, 0.01, 0], [0, 0.09, -0.08], [0.0, 0.0, -0.3], [-0.02, -0.25, -0.33], [0.03, -0.5, -0.27]], 0.08, { flat: 0.6 }],
      [[[0, -0.01, 0], [0.03, -0.02, -0.1], [0.05, -0.2, -0.14], [0.03, -0.45, -0.12], [0.04, -0.68, -0.08]], 0.07, { flat: 0.6 }],
      [[[0, 0, 0], [0, 0.03, -0.1], [0.0, -0.12, -0.2], [0.0, -0.4, -0.2], [0.01, -0.66, -0.13]], 0.15, { flat: 0.75 }],
    ];
    addLocks(tail, tl, m.hair);
    anim.push((t) => { tail.rotation.x = Math.sin(t * 1.6) * 0.06; tail.rotation.z = Math.sin(t * 1.25) * 0.08; });
  },
};
