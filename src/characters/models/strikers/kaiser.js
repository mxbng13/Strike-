// KAISER — Mythique (Néant). Grand et imposant : armure sombre parcourue de lignes d'énergie magenta,
// plastron à cœur lumineux, spallières, gantelets, jambières, longue cape (doublure rouge), cheveux blancs plaqués en arrière.
import * as THREE from 'three';
import {
  tiered, plain, glow, drawEye, drawBrow, blush, faceTexture, plate, tube, addLocks, bulge,
  outline, canvas, tex, cached, rnd, normalMap, RoundedBoxGeometry, hairMat,
} from '../humanoid.js';
import { sneaker, boot } from '../../shoes.js';

const SKIN = '#dcb394';
const H = 0.96;
const NEON = 0xff2aa0;
const PECS = [{ x: -0.15, y: 1.38, amp: 0.035, sx: 0.12, sy: 0.08 }, { x: 0.15, y: 1.38, amp: 0.035, sx: 0.12, sy: 0.08 }];

// Combinaison : panneaux (couleur) + circuits lumineux (emissiveMap) — u = 0 devant
function suitTex(emissive) {
  return cached(`kaiser:suit:${emissive}`, () => {
    const [c, g] = canvas(1024, 512);
    g.fillStyle = emissive ? '#000' : '#fff'; g.fillRect(0, 0, 1024, 512);
    g.strokeStyle = emissive ? '#fff' : 'rgba(0,0,0,.35)';
    g.lineWidth = emissive ? 5 : 3; g.lineCap = 'round'; g.lineJoin = 'round';
    const path = (pts) => { g.beginPath(); g.moveTo(...pts[0]); for (const p of pts.slice(1)) g.lineTo(...p); g.stroke(); };
    // circuits latéraux et dorsaux
    for (const x of [240, 784]) { path([[x, 512], [x, 330], [x + 30, 290], [x + 30, 60]]); path([[x + 60, 512], [x + 60, 380], [x + 90, 350], [x + 90, 140]]); }
    path([[512, 500], [512, 120]]); path([[470, 470], [470, 300], [512, 260]]); path([[554, 470], [554, 300], [512, 260]]);
    if (emissive) { g.fillStyle = '#fff'; for (const [x, y] of [[270, 60], [330, 140], [814, 60], [874, 140], [512, 120]]) { g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill(); } }
    else { g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 2; for (let y = 40; y < 512; y += 46) { g.beginPath(); g.moveTo(0, y); g.lineTo(1024, y); g.stroke(); } }
    return tex(c);
  });
}
function legTex(emissive) {
  return cached(`kaiser:leg:${emissive}`, () => {
    const [c, g] = canvas(512, 512);
    g.fillStyle = emissive ? '#000' : '#fff'; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = emissive ? '#fff' : 'rgba(0,0,0,.3)'; g.lineWidth = emissive ? 6 : 3;
    for (const x of [128, 384]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 200); g.lineTo(x + 20, 240); g.lineTo(x + 20, 512); g.stroke(); }
    return tex(c);
  });
}
function armorMat(rank, color = 0x23252f) {
  return tiered(rank, new THREE.MeshStandardMaterial({ color, metalness: 0.75, roughness: 0.32, envMapIntensity: 1.1, normalMap: normalMap('leather'), normalScale: new THREE.Vector2(0.12, 0.12) }), { gold: 0xf0b43c, crystal: 0xe6ecff, rough: 0.22 });
}

function drawFace(g, closed) {
  blush(g, 380, 380, 28, '150,80,90', 0.18);
  blush(g, 520, 380, 28, '150,80,90', 0.18);
  drawEye(g, { x: 400, y: 344, side: -1, w: 34, h: 21, iris: '#ff2aa0', closed, slant: 0.12, lidDrop: 0.2, lid: '#160c16', look: 0 });
  drawEye(g, { x: 500, y: 344, side: 1, w: 34, h: 21, iris: '#ff2aa0', closed, slant: 0.12, lidDrop: 0.2, lid: '#160c16', look: 0 });
  drawBrow(g, { x: 400, y: 310, side: -1, w: 38, t: 9, color: '#d8d6e4', angle: 0.18, arch: 3 });
  drawBrow(g, { x: 500, y: 310, side: 1, w: 38, t: 9, color: '#d8d6e4', angle: 0.18, arch: 3 });
  // marques du Néant sous les yeux (lumineuses)
  g.strokeStyle = 'rgba(255,60,170,.95)'; g.lineWidth = 3.5; g.lineCap = 'round';
  for (const sd of [-1, 1]) { const x = 450 + sd * 50; g.beginPath(); g.moveTo(x - 6 * sd, 368); g.lineTo(x + 2 * sd, 392); g.stroke(); g.beginPath(); g.moveTo(x + 10 * sd, 366); g.lineTo(x + 16 * sd, 384); g.stroke(); }
  // nez droit, pommettes marquées
  g.strokeStyle = 'rgba(140,80,60,.45)'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(446, 340); g.lineTo(442, 380); g.quadraticCurveTo(452, 388, 462, 382); g.stroke();
  g.strokeStyle = 'rgba(120,70,60,.25)'; g.lineWidth = 6;
  for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(450 + sd * 92, 360); g.quadraticCurveTo(450 + sd * 80, 390, 450 + sd * 60, 404); g.stroke(); }
  // bouche fine, sévère
  g.strokeStyle = '#5e2a2a'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(424, 414); g.bezierCurveTo(440, 410, 462, 410, 478, 416); g.stroke();
  g.strokeStyle = 'rgba(150,80,70,.4)'; g.lineWidth = 3; g.beginPath(); g.moveTo(438, 426); g.quadraticCurveTo(452, 430, 466, 426); g.stroke();
}

export const KAISER = {
  id: 'kaiser',
  hipY: H,
  depth: 0.66,
  torsoMat: 'suit',
  torso: [[0.31, 0.88], [0.325, 0.96], [0.305, 1.04], [0.315, 1.14], [0.365, 1.27], [0.415, 1.4], [0.435, 1.49], [0.415, 1.56], [0.34, 1.61], [0.2, 1.645], [0.13, 1.66]],
  bumps: PECS,
  legs: { mat: 'legSuit', pelvis: [0.31, 0.12, 0.21], hip: [0.165, 0, 0], knee: [0.2, 0.55, 0.03], ankle: [0.23, 0.3, 0.03], r: [0.16, 0.125, 0.11] },
  feet: { x: 0.24, z: 0.04, scale: 1.25, rotY: 0.25, build: (m, sd, o) => boot({ style: 'armor', color: 0x2a2d36, sole: 0x111216, neon: NEON, shaft: 0.2, outline: o.outline }) },
  arms: {
    r: [0.13, 0.115, 0.105], upperMat: 'suit', foreMat: 'armor', hand: 1.12, crease: 0x0a0a10,
    poses: [
      { sh: [-0.44, 1.5, 0], el: [-0.66, 1.2, -0.04], fi: [-0.6, 0.9, 0.12], fistRot: [0.1, 0.3, -0.25] },
      { sh: [0.44, 1.5, 0], el: [0.6, 1.16, -0.02], fi: [0.6, 0.86, 0.08], fistRot: [0, -0.25, 0.05] },
    ],
  },
  neck: { r: 0.1, h: 0.24 },
  head: { y: 2.06, neckY: 1.64, r: 0.28, scale: 1.04, jaw: 0.15, chin: 0.05, taper: 0.05, s: [1.0, 1.06, 0.97], nose: 0.03, noseY: -0.13 },
  idle: { breath: 1.7, hairSway: 0.006 },

  materials(rank, look) {
    const m = {};
    m.suit = tiered(rank, new THREE.MeshStandardMaterial({ color: look?.top ?? 0x2a2c38, map: suitTex(false), emissive: NEON, emissiveMap: suitTex(true), emissiveIntensity: 1.6, roughness: 0.55, metalness: 0.3, normalMap: normalMap('knit'), normalScale: new THREE.Vector2(0.2, 0.2) }), { gold: 0xe6aa36, crystal: 0xd9e2ff, dark: true });
    if (rank !== 'basique') { m.suit.emissive = new THREE.Color(NEON); m.suit.emissiveMap = suitTex(true); m.suit.emissiveIntensity = 1.4; }
    m.legSuit = tiered(rank, new THREE.MeshStandardMaterial({ color: 0x24262f, map: legTex(false), emissive: NEON, emissiveMap: legTex(true), emissiveIntensity: 1.6, roughness: 0.55, metalness: 0.3 }), { gold: 0xe6aa36, crystal: 0xd9e2ff, dark: true });
    if (rank !== 'basique') { m.legSuit.emissive = new THREE.Color(NEON); m.legSuit.emissiveMap = legTex(true); m.legSuit.emissiveIntensity = 1.4; }
    m.armor = armorMat(rank);
    m.armorDark = armorMat(rank, 0x121318);
    m.hand = m.armorDark;
    m.neon = glow(NEON, 2.4);
    m.core = glow(0xff5ac8, 4);
    m.cape = tiered(rank, new THREE.MeshStandardMaterial({ color: 0x15141c, roughness: 0.7, normalMap: normalMap('twill'), normalScale: new THREE.Vector2(0.3, 0.3), side: THREE.FrontSide }), { gold: 0xd9a030, crystal: 0xe6ecff });
    m.capeIn = new THREE.MeshStandardMaterial({ color: rank === 'basique' ? 0x8a0f26 : rank === 'or' ? 0x7a1010 : 0xc01a50, roughness: 0.5, side: THREE.BackSide, normalMap: normalMap('twill'), normalScale: new THREE.Vector2(0.3, 0.3) });
    m.hair = hairMat(rank, 0xeceaf4, { gold: 0xffe08a, crystal: 0xffffff });
    m.skin = new THREE.MeshStandardMaterial({ color: 0xffffff, map: faceTexture('kaiser', SKIN, drawFace, false), roughness: 0.5 });
    m.skinClosed = faceTexture('kaiser', SKIN, drawFace, true);
    m.skinPlain = plain(SKIN, 0.5);
    m.earInner = plain(0xc08a74, 0.7);
    return m;
  },

  build({ m, upper, U, T, arms, legs, body, head, anim }) {
    const r = T.radius;
    const onChest = (x, y) => PECS.reduce((s, b) => s + b.amp * Math.exp(-(((x - b.x) / b.sx) ** 2) - (((y - b.y) / b.sy) ** 2)), 0);
    const bumpGeo = (geo) => { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + onChest(p.getX(i), p.getY(i) + H)); p.needsUpdate = true; geo.computeVertexNormals(); return geo; };
    // plastron : plaque en V + cœur d'énergie
    const chest = [[-0.36, 1.5], [-0.16, 1.58], [0, 1.53], [0.16, 1.58], [0.36, 1.5], [0.33, 1.3], [0.12, 1.18], [0, 1.15], [-0.12, 1.18], [-0.33, 1.3]];
    upper.add(outline(new THREE.Mesh(bumpGeo(T.conform(plate(chest, 0.03, 4), 0.012)), m.armor)));
    const lines = [[[-0.3, 1.32], [-0.12, 1.22], [-0.05, 1.24]], [[0.3, 1.32], [0.12, 1.22], [0.05, 1.24]], [[-0.3, 1.5], [-0.16, 1.55], [-0.06, 1.47]], [[0.3, 1.5], [0.16, 1.55], [0.06, 1.47]]];
    for (const l of lines) {
      const pts = l.map(([x, y]) => [x, U(y), Math.sqrt(Math.max(0, 1 - (x / r(y)) ** 2)) * r(y) * 0.66 + 0.046 + onChest(x, y)]);
      upper.add(tube(pts, 0.008, m.neon, { seg: 16, radial: 6 }));
    }
    const cz = r(1.36) * 0.66 + 0.05 + onChest(0, 1.36);
    const ring = outline(new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 10, 6), m.armorDark), 0.6);
    ring.position.set(0, U(1.36), cz); ring.rotation.z = Math.PI / 6; upper.add(ring);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), m.core);
    core.position.set(0, U(1.36), cz + 0.01); core.scale.set(1, 1.25, 0.6); upper.add(core);
    anim.push((t) => { core.rotation.y = t * 1.5; m.core.emissiveIntensity = 3.2 + Math.sin(t * 3) * 1.1; m.neon.emissiveIntensity = 2.1 + Math.sin(t * 3 + 1) * 0.5; });
    // abdomen segmenté (3 plaques) + ceinture à boucle lumineuse
    for (const [y0, y1] of [[1.0, 1.06], [1.065, 1.12], [1.125, 1.18]]) {
      upper.add(outline(new THREE.Mesh(T.shell([[r(y0) + 0.012, y0], [r((y0 + y1) / 2) + 0.022, (y0 + y1) / 2], [r(y1) + 0.014, y1]], { gap: Math.PI }), m.armor), 0.6));
    }
    upper.add(outline(new THREE.Mesh(T.shell([[r(0.9) + 0.025, 0.9], [r(0.94) + 0.03, 0.94], [r(0.98) + 0.025, 0.98]]), m.armorDark), 0.7));
    const tri = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 3), m.neon);
    tri.rotation.set(Math.PI / 2, 0, Math.PI); tri.position.set(0, U(0.94), r(0.94) * 0.66 + 0.035); upper.add(tri);
    // tassettes (plaques de hanches)
    for (const sd of [-1, 1]) {
      const tas = outline(new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.2, 0.03, 3, 0.012), m.armor), 0.7);
      tas.position.set(sd * 0.25, U(0.82), 0.12); tas.rotation.set(-0.1, sd * 0.55, sd * 0.12); upper.add(tas);
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.008, 0.01), m.neon);
      st.position.set(0, -0.04, 0.02); tas.add(st);
    }
    // gorgerin (col armuré)
    const gorget = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.2, 0.12, 28, 2, true), m.armor), 0.8);
    gorget.position.y = U(1.665); upper.add(gorget);
    const gl = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.007, 6, 32), m.neon);
    gl.rotation.x = Math.PI / 2; gl.position.y = U(1.71); upper.add(gl);
    // spallières à 3 lames + gantelets
    for (const a of arms) {
      const sd = a.side;
      for (let i = 0; i < 3; i++) {
        const p = outline(new THREE.Mesh(new THREE.SphereGeometry(0.2 - i * 0.025, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), m.armor), 0.8);
        p.scale.set(1.05, 0.7, 0.95);
        p.position.set(sd * (0.02 + i * 0.035), 0.05 - i * 0.075, 0);
        p.rotation.z = -sd * (0.45 + i * 0.12);
        a.shoulder.add(p);
        if (i === 0) {
          const edge = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.008, 6, 40), m.neon);
          edge.rotation.x = Math.PI / 2; edge.scale.set(1.05, 0.95, 1); p.add(edge);
        }
      }
      const g = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, a.wrist.length() * 0.62, 20), m.armor), 0.8);
      g.position.copy(a.wrist).multiplyScalar(0.62);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.dir);
      a.elbow.add(g);
      const gs = new THREE.Mesh(new THREE.BoxGeometry(0.012, a.wrist.length() * 0.5, 0.01), m.neon);
      gs.position.set(0, 0, 0.125); g.add(gs);
      const fin = outline(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), m.armorDark), 0.6);
      fin.position.copy(a.wrist).multiplyScalar(0.35).add(new THREE.Vector3(sd * 0.11, 0, -0.02));
      fin.rotation.z = sd * 2.1; a.elbow.add(fin);
    }
    // jambières : cuissards, genouillères pointues, tibias
    for (const l of legs) {
      const [hx, hy, hz] = l.hip, [kx, ky, kz] = l.knee, [ax, ay, az] = l.ankle;
      const th = outline(new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.26, 0.05, 3, 0.02), m.armor), 0.7);
      th.position.set(hx + (kx - hx) * 0.45 + l.sd * 0.02, hy + (ky - hy) * 0.45, 0.15); th.rotation.set(-0.06, l.sd * 0.25, 0); body.add(th);
      const kn = outline(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 4), m.armor), 0.7);
      kn.rotation.set(Math.PI / 2, 0, Math.PI / 4); kn.position.set(kx, ky, kz + 0.14); kn.scale.set(1, 1, 0.6); body.add(kn);
      const kg = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), m.core); kg.position.set(kx, ky, kz + 0.2); body.add(kg);
      const sh = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.125, ky - ay, 20, 1, true, -1.2, 2.4), m.armor), 0.7);
      sh.position.set((kx + ax) / 2, (ky + ay) / 2 - 0.02, (kz + az) / 2 + 0.01); body.add(sh);
    }
    // cape : fermoirs aux épaules, tombe dans le dos jusqu'aux mollets
    const capeG = new THREE.Group();
    capeG.position.set(0, U(1.6), -0.08);
    upper.add(capeG);
    const prof = [[0.38, 0.0], [0.43, -0.12], [0.47, -0.4], [0.52, -0.8], [0.58, -1.15], [0.62, -1.36]].map(([x, y]) => new THREE.Vector2(x, y));
    const capeGeo = new THREE.LatheGeometry(prof, 48, Math.PI - 1.35, 2.7);
    capeGeo.scale(1, 1, 0.62);
    capeGeo.computeVertexNormals();
    {
      // plis verticaux
      const p = capeGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const k = Math.min(1, -y / 0.5);
        const f = 1 + 0.06 * k * Math.sin(Math.atan2(x, z) * 9);
        p.setXYZ(i, x * f, y, z * f);
      }
      capeGeo.computeVertexNormals();
    }
    capeG.add(outline(new THREE.Mesh(capeGeo, m.cape)), new THREE.Mesh(capeGeo, m.capeIn));
    anim.push((t) => { capeG.rotation.x = -0.03 - Math.sin(t * 1.3) * 0.025; });
    for (const sd of [-1, 1]) {
      const clasp = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.025, 6), m.armorDark), 0.6);
      clasp.rotation.x = Math.PI / 2; clasp.position.set(sd * 0.27, U(1.6), 0.13); upper.add(clasp);
      const cg = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), m.core);
      cg.position.set(sd * 0.27, U(1.6), 0.15); upper.add(cg);
    }
    upper.add(tube([[-0.27, U(1.6), 0.15], [0, U(1.53), 0.25], [0.27, U(1.6), 0.15]], 0.007, m.neon, { seg: 20 }));
    // oreillette tech
    const ear = head.userData.ears[0];
    const dev = outline(new THREE.Mesh(new RoundedBoxGeometry(0.5, 1.4, 1.2, 2, 0.15), m.armorDark), 0.5);
    dev.position.set(-0.6, 0, 0); ear.add(dev);
    const dl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.15), m.neon); dl.position.set(-0.3, 0, 0.4); dev.add(dl);
  },

  hair({ m, hair, R }) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 1.035, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.58), m.hair);
    cap.rotation.x = -0.38; cap.scale.set(1.0, 1.06, 1.0);
    hair.add(outline(cap, 0.5));
    // mèches plaquées vers l'arrière, pointes relevées sur la nuque
    const locks = [];
    for (let i = 0; i < 11; i++) {
      const a = -1.1 + (i / 10) * 2.2;
      const sx = Math.sin(a), cz = Math.cos(a);
      const base = [sx * R * 0.8, 0.2, cz * R * 0.7];
      const mid = [sx * R * 1.08, 0.3 - 0.06 * Math.abs(sx), -0.04];
      const tip = [sx * R * 0.78, 0.04 + 0.06 * Math.cos(i * 1.9), -R * 1.22];
      locks.push([[base, mid, tip], 0.12, { flat: 0.4 }]);
    }
    for (const sd of [-1, 1]) {
      locks.push([[[sd * 0.2, 0.18, 0.12], [sd * 0.31, 0.08, 0.0], [sd * 0.29, -0.06, -0.16]], 0.09, { flat: 0.4 }]);
      locks.push([[[sd * 0.15, 0.0, -0.22], [sd * 0.22, -0.12, -0.32], [sd * 0.24, -0.2, -0.38]], 0.1, { flat: 0.45 }]);
    }
    locks.push([[[0, 0.0, -0.25], [0.0, -0.12, -0.34], [0.02, -0.24, -0.38]], 0.12, { flat: 0.45 }]);
    // mèche rebelle sur le front
    locks.push([[[0.04, 0.27, 0.16], [0.1, 0.25, 0.32], [0.07, 0.08, 0.33]], 0.05, { flat: 0.45 }]);
    addLocks(hair, locks, m.hair);
  },
};
