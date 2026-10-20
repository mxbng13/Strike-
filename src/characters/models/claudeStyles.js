// CLAUDE — 4 directions artistiques « jeu mobile » pour choisir le futur modèle du personnage.
// Même identité dans les 4 : cheveux blonds en pointes, masque rouge, costume bleu marine, chemise blanche,
// cravate rouge, pochette, chaussures marron, pistolet doré. Ce qui change : les proportions, le rendu
// (ombrage en aplats + contour noir, ou modelé doux), le visage et la coiffure.
//
//  A · BRAWLER : trapu, grosse tête, gros poings, aplats + contour épais (esprit arène mobile 3D).
//  B · ROYALE  : tête énorme et ronde, petit corps, gros nez, sourcils, modelé doux sans contour.
//  C · HÉROS   : plus grand et athlétique, épaules larges, mèches longues et tranchantes, aplats + contour fin.
//  D · MINI    : super-déformé, très mignon, yeux immenses, coiffure en 5 grosses mèches, aplats doux.
//
// Tout est construit par le code (aucune image). Repère : +y haut, +z vers la caméra, sol à y = 0,
// hauteur ≈ 2,4 comme les autres modèles du jeu. Interface : { root, update(t), dispose() }.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const CLAUDE_STYLES = [
  {
    id: 'brawler', letter: 'A', name: 'Brawler', blurb: 'Trapu et punchy : grosse tête, gros poings, aplats de couleur et contour noir épais.',
    shading: 'toon', outline: 0.022, height: 2.35,
    head: { r: 0.46, squash: 1.0 }, torso: { h: 0.62, top: 0.36, mid: 0.34, bot: 0.3, depth: 0.78 },
    legs: { len: 0.34, r: 0.11, gap: 0.13 }, arms: { up: 0.26, low: 0.24, r: 0.085 }, hand: 0.13,
    shoe: { w: 0.15, h: 0.11, l: 0.3 },
    hair: { kind: 'spikes', n: 11, len: 0.34, r: 0.12, sweep: 0.35 },
    eyes: { r: 0.105, pupil: 0.5, gap: 0.2, el: 0.02 }, brows: true, nose: 0.05, mouth: 'smirk', ears: true,
    pose: 'gunUp',
  },
  {
    id: 'royale', letter: 'B', name: 'Royale', blurb: 'Tête énorme et ronde, gros nez, sourcils expressifs, petit corps et modelé tout doux.',
    shading: 'soft', outline: 0, height: 2.3,
    head: { r: 0.6, squash: 0.94 }, torso: { h: 0.5, top: 0.3, mid: 0.33, bot: 0.31, depth: 0.85 },
    legs: { len: 0.22, r: 0.1, gap: 0.12 }, arms: { up: 0.2, low: 0.18, r: 0.08 }, hand: 0.11,
    shoe: { w: 0.14, h: 0.1, l: 0.26 },
    hair: { kind: 'quiff', n: 8, len: 0.72, r: 0.17, sweep: 0.2 },
    eyes: { r: 0.11, pupil: 0.55, gap: 0.23, el: 0.04 }, brows: true, nose: 0.13, mouth: 'grin', ears: true, cheeks: true,
    pose: 'gunSide',
  },
  {
    id: 'heros', letter: 'C', name: 'Héros', blurb: 'Plus grand et athlétique : épaules larges, taille fine, mèches longues et tranchantes.',
    shading: 'toon', outline: 0.014, height: 2.5,
    head: { r: 0.33, squash: 1.06 }, torso: { h: 0.78, top: 0.36, mid: 0.27, bot: 0.24, depth: 0.7 },
    legs: { len: 0.62, r: 0.095, gap: 0.12 }, arms: { up: 0.34, low: 0.32, r: 0.075 }, hand: 0.1,
    shoe: { w: 0.12, h: 0.09, l: 0.28 },
    hair: { kind: 'blades', n: 13, len: 0.36, r: 0.075, sweep: 0.7 },
    eyes: { r: 0.075, pupil: 0.48, gap: 0.15, el: 0.02 }, brows: true, nose: 0.035, mouth: 'smirk', ears: true,
    pose: 'gunUp',
  },
  {
    id: 'mini', letter: 'D', name: 'Mini', blurb: 'Super-déformé et très mignon : yeux immenses, 5 grosses mèches, petit corps rond.',
    shading: 'toonSoft', outline: 0.016, height: 2.2,
    head: { r: 0.62, squash: 0.98 }, torso: { h: 0.42, top: 0.27, mid: 0.31, bot: 0.3, depth: 0.9 },
    legs: { len: 0.16, r: 0.105, gap: 0.12 }, arms: { up: 0.16, low: 0.15, r: 0.08 }, hand: 0.115,
    shoe: { w: 0.15, h: 0.11, l: 0.25 },
    hair: { kind: 'chunks', n: 8, len: 0.5, r: 0.21, sweep: 0.3 },
    eyes: { r: 0.16, pupil: 0.62, gap: 0.27, el: 0.0 }, brows: false, nose: 0, mouth: 'open', ears: false, cheeks: true,
    pose: 'gunSide',
  },
];

// ------------------------------------------------------------------------------------------------
// Couleurs de l'identité de Claude
const COL = {
  skin: 0xffd2b0, skinShade: 0xf2b48f, hair: 0xffcf3a, hairDark: 0xe0a21b, mask: 0xe0242e, maskDark: 0x9e121c,
  suit: 0x1e2a52, suitDark: 0x141c3a, shirt: 0xf6f7fb, tie: 0xd4202c, shoe: 0x7a4422, sole: 0x2a1a12,
  gold: 0xffc93a, goldDark: 0xc98a12, eyeWhite: 0xffffff, pupil: 0x1d1a2a, outline: 0x15121e, mouth: 0x6e1622, cheek: 0xff8f8f,
};

// Dégradé en 3 paliers pour l'ombrage en aplats (MeshToonMaterial)
let gradCache = {};
function toonGradient(steps) {
  const key = steps.join(',');
  if (gradCache[key]) return gradCache[key];
  const d = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => { d.set([v, v, v, 255], i * 4); });
  const t = new THREE.DataTexture(d, steps.length, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  return (gradCache[key] = t);
}

function makeMaterials(style) {
  const mats = [];
  const mk = (color, extra = {}) => {
    let m;
    if (style.shading === 'soft') m = new THREE.MeshStandardMaterial({ color, roughness: extra.metal ? 0.35 : 0.62, metalness: extra.metal ? 0.55 : 0, ...extra.std });
    else m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(style.shading === 'toonSoft' ? [120, 185, 235, 255] : [95, 175, 255]), ...extra.toon });
    if (extra.map) m.map = extra.map;
    mats.push(m); return m;
  };
  return {
    list: mats, mk,
    skin: mk(COL.skin), hair: mk(COL.hair), mask: mk(COL.mask), suit: mk(COL.suit), shirt: mk(COL.shirt),
    tie: mk(COL.tie), shoe: mk(COL.shoe), sole: mk(COL.sole), gold: mk(COL.gold, { metal: true }), goldDark: mk(COL.goldDark, { metal: true }),
    eyeWhite: new THREE.MeshBasicMaterial({ color: COL.eyeWhite }), pupil: new THREE.MeshBasicMaterial({ color: COL.pupil }),
    shine: new THREE.MeshBasicMaterial({ color: 0xffffff }), mouth: new THREE.MeshBasicMaterial({ color: COL.mouth }),
    cheek: new THREE.MeshBasicMaterial({ color: COL.cheek, transparent: true, opacity: 0.45, depthWrite: false }),
  };
}

// Contour « coque inversée » : copie de la forme gonflée le long des normales, faces arrière en noir.
function outlineMaterial(t) {
  const m = new THREE.MeshBasicMaterial({ color: COL.outline, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = position + normal * ${t.toFixed(4)};`); };
  return m;
}

// Torse du costume : profil tourné (lathe), plat devant/derrière ; la chemise, la cravate, les revers,
// les boutons et la pochette sont peints dans sa texture (nets, sans pièces collées qui dépassent).
function jacketTexture(style) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
  g.fillStyle = hex(COL.suit); g.fillRect(0, 0, 1024, 512);
  const cx = 512;                                   // devant du torse (u = 0,5)
  const vBot = style.id === 'heros' ? 250 : 220;    // pointe du V de la chemise
  const halfV = style.id === 'mini' ? 70 : 60;
  // revers (plus sombres) autour du V
  g.fillStyle = hex(COL.suitDark);
  g.beginPath(); g.moveTo(cx - halfV - 34, 0); g.lineTo(cx, vBot + 40); g.lineTo(cx + halfV + 34, 0); g.closePath(); g.fill();
  // chemise
  g.fillStyle = hex(COL.shirt);
  g.beginPath(); g.moveTo(cx - halfV, 0); g.lineTo(cx, vBot); g.lineTo(cx + halfV, 0); g.closePath(); g.fill();
  // col de chemise (deux pointes)
  g.fillStyle = '#e3e6ef';
  g.beginPath(); g.moveTo(cx - halfV, 0); g.lineTo(cx - 8, 0); g.lineTo(cx - 22, 44); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(cx + halfV, 0); g.lineTo(cx + 8, 0); g.lineTo(cx + 22, 44); g.closePath(); g.fill();
  // cravate : nœud + lame
  g.fillStyle = hex(COL.tie);
  g.beginPath(); g.moveTo(cx - 14, 6); g.lineTo(cx + 14, 6); g.lineTo(cx + 10, 34); g.lineTo(cx - 10, 34); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(cx - 10, 34); g.lineTo(cx + 10, 34); g.lineTo(cx + 22, vBot - 10); g.lineTo(cx, vBot + 14); g.lineTo(cx - 22, vBot - 10); g.closePath(); g.fill();
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(cx - 2, 40, 4, vBot - 40);
  // fermeture de la veste et boutons
  g.strokeStyle = hex(COL.suitDark); g.lineWidth = 6; g.beginPath(); g.moveTo(cx, vBot + 40); g.lineTo(cx, 512); g.stroke();
  g.fillStyle = '#0b1026';
  for (const y of [vBot + 70, vBot + 140]) { g.beginPath(); g.arc(cx + 12, y, 9, 0, Math.PI * 2); g.fill(); }
  // pochette (poitrine gauche du personnage = +x = u > 0,5)
  const px = cx + 150, py = 120;
  g.fillStyle = hex(COL.suitDark); g.fillRect(px - 36, py + 6, 72, 8);
  g.fillStyle = hex(COL.shirt); g.beginPath(); g.moveTo(px - 30, py + 8); g.lineTo(px - 14, py - 16); g.lineTo(px, py + 2); g.lineTo(px + 14, py - 18); g.lineTo(px + 30, py + 8); g.closePath(); g.fill();
  g.fillStyle = hex(COL.tie); g.beginPath(); g.moveTo(px - 8, py + 8); g.lineTo(px + 6, py - 10); g.lineTo(px + 18, py + 8); g.closePath(); g.fill();
  // ourlet et coutures discrètes
  g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(0, 488, 1024, 24);
  g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(250, 0, 4, 512); g.fillRect(770, 0, 4, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// Boule d'ombre douce sous les pieds
let shadowTex = null;
function blobShadow() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(.6, 'rgba(0,0,0,.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return (shadowTex = new THREE.CanvasTexture(c));
}

const Z = new THREE.Vector3(0, 0, 1);
const dirOf = (az, el) => new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));

export function createClaudeStyle(styleOrId) {
  const style = typeof styleOrId === 'string' ? CLAUDE_STYLES.find((s) => s.id === styleOrId) : styleOrId;
  const M = makeMaterials(style);
  const geos = [];
  const G = (g) => { geos.push(g); return g; };
  const oMat = style.outline ? outlineMaterial(style.outline) : null;
  /** Maillage + contour éventuel. */
  const mesh = (geo, mat, parent, { outline = true } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    if (oMat && outline) m.add(new THREE.Mesh(geo, oMat));
    parent?.add(m);
    return m;
  };

  const root = new THREE.Group();
  root.name = `claude-${style.id}`;
  const body = new THREE.Group(); root.add(body);

  // ---------- jambes et chaussures ----------
  const { legs, shoe, torso, head: H, arms, hand } = style;
  const hipY = shoe.h * 0.7 + legs.len + legs.r;
  const legParts = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * legs.gap, hipY, 0); body.add(leg);
    mesh(G(new THREE.CapsuleGeometry(legs.r, legs.len, 8, 20)), M.suit, leg).position.y = -legs.len / 2;
    // chaussure : bout arrondi vers l'avant, semelle sombre
    const sh = new THREE.Group(); sh.position.set(side * 0.01, -legs.len - legs.r * 0.4, shoe.l * 0.18); leg.add(sh);
    const upper = mesh(G(new THREE.SphereGeometry(1, 28, 18)), M.shoe, sh); upper.scale.set(shoe.w, shoe.h, shoe.l * 0.5); upper.position.y = shoe.h * 0.25;
    const sole = mesh(G(new THREE.CylinderGeometry(1, 1, 1, 28)), M.sole, sh); sole.scale.set(shoe.w * 1.04, shoe.h * 0.32, shoe.l * 0.52); sole.position.y = -shoe.h * 0.42;
    legParts.push(leg);
  }

  // ---------- torse (veste) ----------
  const torsoG = new THREE.Group(); torsoG.position.y = hipY - legs.r * 0.3; body.add(torsoG);
  const prof = [
    [0.001, 0], [torso.bot, 0], [torso.bot * 1.03, torso.h * 0.12], [torso.mid, torso.h * 0.45],
    [torso.top, torso.h * 0.8], [torso.top * 0.93, torso.h * 0.93], [torso.top * 0.6, torso.h * 1.0], [0.001, torso.h * 1.01],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const torsoGeo = G(new THREE.LatheGeometry(prof, 48, Math.PI, Math.PI * 2));
  // v suit la hauteur (et non l'index du profil) : la chemise et la cravate tombent bien sur la poitrine
  { const pos = torsoGeo.attributes.position, uv = torsoGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setY(i, Math.min(1, pos.getY(i) / (torso.h * 0.97))); uv.needsUpdate = true; }
  const jt = jacketTexture(style);
  const jacketMat = M.mk(0xffffff, { map: jt });
  const torsoMesh = mesh(torsoGeo, jacketMat, torsoG); torsoMesh.scale.z = torso.depth;
  // bas de la veste : léger évasement qui couvre le haut des jambes
  const skirt = mesh(G(new THREE.CylinderGeometry(torso.bot * 1.02, torso.bot * 1.08, torso.h * 0.18, 40, 1, true)), M.suit, torsoG);
  skirt.scale.z = torso.depth; skirt.position.y = -torso.h * 0.05; skirt.material = M.suit;
  const shoulderY = torso.h * 0.86;

  // ---------- tête ----------
  const headG = new THREE.Group();
  const neckY = torsoG.position.y + torso.h;
  headG.position.set(0, neckY + H.r * 0.86, 0.02); body.add(headG);
  const r = H.r;
  const skull = mesh(G(new THREE.SphereGeometry(r, 48, 36)), M.skin, headG); skull.scale.y = H.squash;
  // cou (caché sous la tête pour les grosses têtes)
  mesh(G(new THREE.CylinderGeometry(r * 0.28, r * 0.32, r * 0.4, 20)), M.skin, headG, { outline: false }).position.y = -r * 0.8;
  if (style.ears) for (const s of [-1, 1]) { const e = mesh(G(new THREE.SphereGeometry(r * 0.17, 20, 14)), M.skin, headG); e.position.set(s * r * 0.97, -r * 0.05, -r * 0.05); e.scale.set(0.55, 1, 0.8); }
  // place un élément sur la surface du visage (azimut, élévation, décollement), orienté vers l'extérieur
  const onFace = (obj, az, el, off = 0) => {
    const d = dirOf(az, el), R1 = r * (1 + off);
    obj.position.set(d.x * R1, d.y * R1 * H.squash, d.z * R1);
    obj.quaternion.setFromUnitVectors(Z, d); headG.add(obj); return obj;
  };

  // masque : bandeau sur le haut du visage + deux pans noués derrière la tête
  const eyeEl = style.eyes.el;
  const maskBand = mesh(G(new THREE.SphereGeometry(r * 1.018, 64, 16, Math.PI / 2 - Math.PI * 0.7, Math.PI * 1.4, Math.PI * (0.5 - 0.11 - eyeEl / Math.PI), Math.PI * 0.2)), M.mask, headG);
  maskBand.scale.y = H.squash;
  for (const s of [-1, 1]) {
    const tail = mesh(G(new THREE.CapsuleGeometry(r * 0.06, r * 0.42, 6, 12)), M.mask, headG);
    tail.position.set(s * r * 0.22, r * (0.02 + eyeEl) - r * 0.18, -r * 1.02); tail.rotation.set(0.35, 0, s * 0.55); tail.scale.z = 0.45;
  }
  const knot = mesh(G(new THREE.SphereGeometry(r * 0.1, 16, 12)), M.mask, headG); knot.position.set(0, r * (0.06 + eyeEl), -r * 1.0); knot.scale.z = 0.6;

  // yeux : blancs en relief sur le masque, pupilles et reflets
  const eyes = [];
  for (const s of [-1, 1]) {
    const eg = new THREE.Group();
    const az = s * Math.asin(Math.min(0.9, style.eyes.gap / r));
    onFace(eg, az, eyeEl + 0.02, 0.03);
    const white = new THREE.Mesh(G(new THREE.SphereGeometry(style.eyes.r, 28, 20)), M.eyeWhite); white.scale.set(1, 1.18, 0.42); eg.add(white);
    if (oMat) { const ow = new THREE.Mesh(white.geometry, outlineMaterial(style.outline * 0.8)); ow.scale.copy(white.scale); eg.add(ow); }
    const pupil = new THREE.Mesh(G(new THREE.SphereGeometry(style.eyes.r * style.eyes.pupil, 24, 16)), M.pupil);
    pupil.scale.set(0.9, 1.1, 0.4); pupil.position.set(-s * style.eyes.r * 0.08, -style.eyes.r * 0.04, style.eyes.r * 0.34); eg.add(pupil);
    const shine = new THREE.Mesh(G(new THREE.SphereGeometry(style.eyes.r * style.eyes.pupil * 0.32, 12, 8)), M.shine);
    shine.position.set(-s * style.eyes.r * 0.08 + style.eyes.r * 0.18, style.eyes.r * 0.2, style.eyes.r * 0.5); eg.add(shine);
    eyes.push(eg);
  }
  // sourcils (au-dessus du masque, air sûr de lui)
  if (style.brows) for (const s of [-1, 1]) {
    const b = new THREE.Group(); onFace(b, s * Math.asin(Math.min(0.9, style.eyes.gap / r)), eyeEl + 0.27, 0.02);
    const bm = mesh(G(new THREE.CapsuleGeometry(r * 0.045, style.eyes.r * 1.3, 6, 12)), M.mk(COL.hairDark), b); bm.rotation.z = Math.PI / 2 + s * 0.22; bm.scale.z = 0.5;
  }
  // nez
  if (style.nose) { const n = new THREE.Group(); onFace(n, 0, eyeEl - 0.14, -0.02); const nm = mesh(G(new THREE.SphereGeometry(style.nose, 24, 16)), M.mk(COL.skinShade), n); nm.scale.set(1, 0.85, 1.1); }
  // bouche
  const mouth = new THREE.Group(); onFace(mouth, style.mouth === 'smirk' ? 0.08 : 0, eyeEl - 0.36, 0.0);
  if (style.mouth === 'open') {
    const m = new THREE.Mesh(G(new THREE.CircleGeometry(r * 0.11, 24, Math.PI, Math.PI)), M.mouth); m.position.z = 0.004; mouth.add(m);
    const tongue = new THREE.Mesh(G(new THREE.CircleGeometry(r * 0.06, 16, Math.PI, Math.PI)), M.mk(0xff6f7d)); tongue.position.set(0, -r * 0.045, 0.006); mouth.add(tongue);
  } else {
    const arc = style.mouth === 'grin' ? Math.PI * 0.9 : Math.PI * 0.6;
    const sm = new THREE.Mesh(G(new THREE.TorusGeometry(r * (style.mouth === 'grin' ? 0.15 : 0.12), r * 0.022, 8, 28, arc)), M.mouth);
    sm.rotation.z = Math.PI + (Math.PI - arc) / 2 + (style.mouth === 'smirk' ? 0.18 : 0); sm.scale.z = 0.4; mouth.add(sm);
    if (style.mouth === 'grin') { const teeth = new THREE.Mesh(G(new THREE.CircleGeometry(r * 0.14, 24, Math.PI * 1.08, Math.PI * 0.84)), M.shine); teeth.position.z = -0.002; teeth.scale.y = 0.6; mouth.add(teeth); }
  }
  if (style.cheeks) for (const s of [-1, 1]) { const ch = new THREE.Group(); onFace(ch, s * 0.62, eyeEl - 0.22, 0.012); ch.add(new THREE.Mesh(G(new THREE.CircleGeometry(r * 0.1, 20)), M.cheek)); }

  // cheveux : calotte + mèches selon le style
  const hairG = new THREE.Group(); headG.add(hairG);
  const capTheta = Math.PI * (0.5 - 0.11 - eyeEl / Math.PI) + 0.02;
  const cap = mesh(G(new THREE.SphereGeometry(r * 1.035, 48, 24, 0, Math.PI * 2, 0, capTheta)), M.hair, hairG); cap.scale.y = H.squash;
  const back = mesh(G(new THREE.SphereGeometry(r * 1.03, 40, 20, Math.PI / 2 + Math.PI * 0.32, Math.PI * 1.36, capTheta - 0.05, Math.PI * 0.26)), M.hair, hairG); back.scale.y = H.squash;
  const hz = style.hair;
  const spikes = [];
  const UP = new THREE.Vector3(0, 1, 0), BACK = new THREE.Vector3(0, 0.35, -1).normalize();
  /** Repère d'une mèche posée sur le crâne : z = sens de la mèche (vers l'arrière et le haut), y = normale. */
  const lockBasis = (n, lift) => {
    const t = BACK.clone().sub(n.clone().multiplyScalar(BACK.dot(n))).normalize().lerp(n, lift).normalize();
    const y = n.clone().sub(t.clone().multiplyScalar(n.dot(t))).normalize();
    return new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(y, t).normalize(), y, t);
  };
  const addSpike = (az, el, len, rad, tilt, kind) => {
    const d = dirOf(az, el); const n = d.clone().setY(d.y * H.squash).normalize();
    if (kind === 'quiff') {
      // mèche en amande couchée sur le crâne, peignée vers l'arrière ; à l'avant elle se relève (banane)
      const front = Math.cos(az) > 0.55 && el < 0.9;
      const sp = mesh(G(new THREE.SphereGeometry(1, 28, 18)), M.hair, hairG);
      sp.scale.set(rad, rad * 0.5, len * 0.5);
      const m = lockBasis(n, front ? 0.55 : 0.12);
      sp.quaternion.setFromRotationMatrix(m);
      sp.position.copy(n.clone().multiplyScalar(r * (front ? 1.02 : 0.97))).add(new THREE.Vector3().setFromMatrixColumn(m, 2).multiplyScalar(len * 0.12));
      spikes.push(sp); return;
    }
    // pointes (coniques) : droites et longues (Héros), trapues (Brawler) ou larges et rabattues (Mini)
    const lift = kind === 'chunks' ? 0.45 : kind === 'blades' ? 0.5 - tilt * 0.3 : 0.75 - tilt * 0.3;
    const m = lockBasis(n, lift);
    const axis = new THREE.Vector3().setFromMatrixColumn(m, 2);
    const sp = mesh(G(new THREE.ConeGeometry(rad, len, 18, 1, true)), M.hair, hairG);
    sp.quaternion.setFromUnitVectors(UP, axis);
    if (kind === 'chunks') sp.scale.set(1, 1, 0.78);
    sp.position.copy(n.clone().multiplyScalar(r * 0.9)).add(axis.clone().multiplyScalar(len * 0.42));
    spikes.push(sp);
  };
  // répartition : 3 couronnes (sommet, milieu, bas) décalées, plus deux mèches de frange
  const n = hz.n;
  for (let i = 0; i < n; i++) {
    const ring = i % 3;
    const az = (i / n) * Math.PI * 2 + ring * 0.4;
    const el = [0.98, 0.62, 0.3][ring] + (hz.kind === 'chunks' ? 0.12 : 0);
    const front = Math.cos(az) > 0.3;
    const len = hz.len * (ring === 0 ? 1.05 : 0.9) * (front ? 0.85 : 1);
    addSpike(az, el, len, hz.r * (ring === 0 ? 1 : 0.9), hz.sweep * (front ? 0.55 : 1), hz.kind);
  }
  addSpike(0.25, 0.5, hz.len * 0.7, hz.r * 0.85, 0.1, hz.kind);
  addSpike(-0.35, 0.55, hz.len * 0.62, hz.r * 0.8, 0.05, hz.kind);
  if (hz.kind === 'quiff') addSpike(0.05, 0.42, hz.len * 0.9, hz.r * 1.15, 0, 'quiff');   // la banane

  // ---------- bras, mains, pistolet ----------
  const armParts = {};
  for (const side of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(side * torso.top * 0.95, torsoG.position.y + shoulderY, 0); body.add(sh);
    const upper = mesh(G(new THREE.CapsuleGeometry(arms.r, arms.up, 6, 16)), M.suit, sh); upper.position.y = -arms.up / 2;
    const elbow = new THREE.Group(); elbow.position.y = -arms.up - arms.r * 0.3; sh.add(elbow);
    const lower = mesh(G(new THREE.CapsuleGeometry(arms.r * 0.95, arms.low, 6, 16)), M.suit, elbow); lower.position.y = -arms.low / 2;
    const cuff = mesh(G(new THREE.CylinderGeometry(arms.r * 0.98, arms.r * 0.98, arms.r * 0.5, 20)), M.shirt, elbow); cuff.position.y = -arms.low - arms.r * 0.15;
    const fist = mesh(G(new THREE.SphereGeometry(hand, 24, 18)), M.skin, elbow); fist.position.y = -arms.low - arms.r * 0.3 - hand * 0.75; fist.scale.set(1, 0.95, 1.05);
    const thumb = mesh(G(new THREE.CapsuleGeometry(hand * 0.28, hand * 0.35, 4, 10)), M.skin, fist); thumb.position.set(-side * hand * 0.55, hand * 0.25, hand * 0.55); thumb.rotation.z = side * 0.6;
    armParts[side] = { sh, elbow, fist };
  }
  // pose : bras gauche (+x) un peu écarté ; bras droit (-x) tient le pistolet
  const L = armParts[1], R = armParts[-1];
  L.sh.rotation.z = 0.28; L.elbow.rotation.x = -0.15;
  if (style.pose === 'gunUp') { R.sh.rotation.set(-0.2, 0, -0.3); R.elbow.rotation.set(-1.25, 0, 0.15); }
  else { R.sh.rotation.set(0.05, 0, -0.25); R.elbow.rotation.set(-0.35, 0, 0); }
  // pistolet doré stylisé
  const gun = new THREE.Group(); R.fist.add(gun);
  const gs = hand * 3.4;
  const slide = mesh(G(new RoundedBoxGeometry(gs * 0.22, gs * 0.26, gs * 0.95, 3, gs * 0.06)), M.gold, gun); slide.position.set(0, gs * 0.2, gs * 0.28);
  const barrel = mesh(G(new THREE.CylinderGeometry(gs * 0.07, gs * 0.07, gs * 0.3, 16)), M.goldDark, gun); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, gs * 0.22, gs * 0.85);
  const grip = mesh(G(new RoundedBoxGeometry(gs * 0.2, gs * 0.5, gs * 0.24, 3, gs * 0.05)), M.goldDark, gun); grip.position.set(0, -gs * 0.08, -gs * 0.02); grip.rotation.x = 0.25;
  gun.rotation.x = style.pose === 'gunUp' ? 1.3 : 0.55;   // canon vers l'avant, bras levé ou le long du corps

  // ---------- ombre au sol ----------
  const shadow = new THREE.Mesh(G(new THREE.PlaneGeometry(1.4, 1.4)), new THREE.MeshBasicMaterial({ map: blobShadow(), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.005; root.add(shadow);

  // mise à l'échelle sur la hauteur visée (sommet des cheveux)
  const box = new THREE.Box3().setFromObject(body);
  const k = style.height / (box.max.y - Math.min(0, box.min.y));
  body.scale.setScalar(k); body.position.y = -Math.min(0, box.min.y) * k;

  // ---------- animation d'attente : respiration, balancement, mèches qui rebondissent ----------
  const base = { head: headG.position.y, torso: torsoG.scale.y };
  function update(t) {
    const b = Math.sin(t * 2.2);
    torsoG.scale.y = base.torso * (1 + b * 0.018);
    headG.position.y = base.head + b * 0.012 * (1 / k);
    headG.rotation.z = Math.sin(t * 1.1) * 0.035; headG.rotation.y = Math.sin(t * 0.7) * 0.06;
    L.sh.rotation.z = 0.28 + b * 0.03; R.sh.rotation.z = (style.pose === 'gunUp' ? -0.3 : -0.25) - b * 0.025;
    spikes.forEach((s, i) => { s.rotation.z += Math.sin(t * 3 + i) * 0.0009; });
    for (const e of eyes) e.scale.y = (Math.sin(t * 0.9) > 0.995 ? 0.15 : 1);   // clignement
  }
  function dispose() {
    geos.forEach((g) => g.dispose());
    M.list.forEach((m) => { m.map?.dispose(); m.dispose(); });
    [M.eyeWhite, M.pupil, M.shine, M.mouth, M.cheek, oMat].forEach((m) => m?.dispose());
    jt.dispose();
  }
  return { root, update, dispose, style };
}
