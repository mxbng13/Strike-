// Modèles 3D des armes (construits par le code) : une arme par Striker.
// Repère : origine = centre de la poignée-pistolet (là où se ferme la main), poignée le long de y,
// canon vers +z (l'avant), crosse vers −z. Taille à l'échelle des Strikers.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const outlineMat = new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color(0x111216) }, uWidth: { value: 0.005 } },
  vertexShader: 'uniform float uWidth;\nvoid main(){ vec3 p = position + normal * uWidth; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
  fragmentShader: 'uniform vec3 uColor;\nvoid main(){\n  gl_FragColor = vec4(uColor, 1.0);\n  #include <colorspace_fragment>\n}',
  side: THREE.BackSide,
});
function mesh(geo, mat, { outline = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  if (outline) { const o = new THREE.Mesh(geo, outlineMat); o.userData.outline = true; m.add(o); }
  return m;
}
const box = (w, h, d, r = 0.012) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.2, h / 2.2, d / 2.2));
// cylindre orienté le long de z
const tubeZ = (r, len, seg = 16) => new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2);
const place = (m, x, y, z, rx = 0) => { m.position.set(x, y, z); m.rotation.x = rx; return m; };

const metal = (c = 0x2d3038) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.85, roughness: 0.35 });
const polymer = (c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.05, roughness: 0.6 });
const wood = () => new THREE.MeshStandardMaterial({ color: 0x8a4a22, roughness: 0.5, metalness: 0.05 });
const glow = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2, toneMapped: false });
const lens = () => new THREE.MeshPhysicalMaterial({ color: 0x3fd0ff, metalness: 0.2, roughness: 0.05, clearcoat: 1, emissive: 0x0a5a80, emissiveIntensity: 0.6 });

// Poignée-pistolet inclinée (commune à toutes les armes)
function grip(mat) {
  const g = place(mesh(box(0.05, 0.15, 0.065, 0.018), mat), 0, -0.01, -0.01, -0.28);
  g.userData.grip = true; // repérée par les personnages qui referment la main dessus
  return g;
}

const chrome = (c = 0xd8dce6) => new THREE.MeshStandardMaterial({ color: c, metalness: 1, roughness: 0.2 });
const ring = (r, t, mat) => new THREE.Mesh(new THREE.TorusGeometry(r, t, 8, 24), mat);

// LANCEUR AURORE (Claude) : blaster blanc et or, cœur lumineux, anneaux émetteurs au bout du canon
function lumiere() {
  const g = new THREE.Group();
  const white = polymer(0xf2f2f6), gold = chrome(0xf0c14a), dark = metal(0x23252c), core = glow(0xffe27a);
  g.add(grip(white));
  g.add(place(mesh(box(0.08, 0.1, 0.36, 0.035), white), 0, 0.1, 0.08));
  g.add(place(mesh(box(0.084, 0.03, 0.3, 0.01), gold), 0, 0.155, 0.08));               // bandeau doré
  g.add(place(mesh(tubeZ(0.03, 0.26), dark), 0, 0.1, 0.36));                            // canon
  const c = place(new THREE.Mesh(tubeZ(0.022, 0.2), core), 0, 0.1, 0.12); g.add(c);    // cœur visible
  for (const z of [0.42, 0.47, 0.52]) { const r = ring(0.04, 0.009, gold); r.position.set(0, 0.1, z); g.add(r); }
  g.add(place(new THREE.Mesh(new THREE.CircleGeometry(0.024, 16), core), 0, 0.1, 0.495));
  g.add(place(mesh(box(0.05, 0.05, 0.12, 0.02), white), 0, 0.075, -0.13, 0.2));         // crosse courte
  for (const sd of [-1, 1]) g.add(place(mesh(box(0.01, 0.06, 0.14, 0.004), gold), sd * 0.045, 0.11, 0.14)); // ailettes
  return g;
}

// BRASIER (Tobi) : lance-flammes, réservoir rouge, tuyau, buse évasée et veilleuse
function brasier() {
  const g = new THREE.Group();
  const red = polymer(0xd8352a), dark = metal(0x2a2a2e), steel = chrome(0xb8bcc6), flame = glow(0xff8a2a);
  g.add(grip(dark));
  g.add(place(mesh(box(0.07, 0.08, 0.3, 0.02), dark), 0, 0.1, 0.06));
  g.add(place(mesh(tubeZ(0.022, 0.3), steel), 0, 0.11, 0.33));                           // tube
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.026, 0.09, 16, 1, true).rotateX(-Math.PI / 2), dark);
  nozzle.material.side = THREE.DoubleSide; nozzle.position.set(0, 0.11, 0.52); g.add(nozzle);
  g.add(place(new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), flame), 0, 0.075, 0.5));  // veilleuse
  // réservoir sous le canon, avec bandes et manomètre
  const tank = place(mesh(new THREE.CapsuleGeometry(0.045, 0.2, 6, 14).rotateX(Math.PI / 2), red), 0, 0.02, 0.2); g.add(tank);
  for (const z of [0.13, 0.27]) { const r = ring(0.047, 0.008, dark); r.position.set(0, 0.02, z); g.add(r); }
  g.add(place(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 14), steel), 0, 0.068, 0.2).rotateX(0.2));
  // tuyau (arc) du réservoir vers le corps
  const hose = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.01, 6, 16, Math.PI), dark);
  hose.rotation.y = Math.PI / 2; hose.position.set(0.045, 0.06, 0.02); g.add(hose);
  g.add(place(mesh(box(0.08, 0.025, 0.06, 0.008), polymer(0xffc23d)), 0, 0.15, 0.0));    // bande jaune
  return g;
}

// ARBALÈTE RAFALE (Nova) : crosse turquoise, arc horizontal, corde, carreau à pointe lumineuse
function rafale() {
  const g = new THREE.Group();
  const teal = polymer(0x1fa79c), dark = metal(0x1e2026), steel = chrome(0xcfd6e0), tip = glow(0x5ffff0);
  g.add(grip(dark));
  g.add(place(mesh(box(0.06, 0.07, 0.48, 0.02), teal), 0, 0.1, 0.12));
  g.add(place(mesh(box(0.05, 0.08, 0.16, 0.02), teal), 0, 0.075, -0.18, 0.15));          // crosse
  // arc : deux branches courbées
  for (const sd of [-1, 1]) {
    const limbArc = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.012, 6, 20, Math.PI / 2.4), steel);
    limbArc.rotation.set(Math.PI / 2, 0, sd > 0 ? -0.15 : Math.PI + 0.15 - Math.PI / 2.4);
    limbArc.position.set(0, 0.11, 0.2);
    g.add(limbArc);
  }
  const string = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.004, 0.004), new THREE.MeshBasicMaterial({ color: 0xe8f8ff }));
  string.position.set(0, 0.11, 0.24); g.add(string);
  g.add(place(mesh(tubeZ(0.008, 0.36), steel), 0, 0.14, 0.32));                          // carreau
  g.add(place(new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 6).rotateX(Math.PI / 2), tip), 0, 0.14, 0.52));
  for (let i = 0; i < 3; i++) g.add(place(new THREE.Mesh(box(0.062, 0.012, 0.02, 0.003), dark), 0, 0.137, 0.02 + i * 0.05));
  return g;
}

// CANON À ROCHERS (Brutus) : gros fût de pierre cerclé de fer, rocher chargé à la bouche
function rocher() {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x8a7a6a, roughness: 0.95, flatShading: true });
  const iron = metal(0x3a3330), wood2 = wood(), rock = new THREE.MeshStandardMaterial({ color: 0xa0784e, roughness: 0.9, flatShading: true });
  g.add(grip(wood2));
  const barrel = place(mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.46, 9).rotateX(Math.PI / 2), stone), 0, 0.12, 0.2); g.add(barrel);
  for (const z of [0.02, 0.2, 0.4]) { const r = ring(0.092, 0.014, iron); r.position.set(0, 0.12, z); g.add(r); }
  const mouth = ring(0.07, 0.02, iron); mouth.position.set(0, 0.12, 0.44); g.add(mouth);
  const ball = place(mesh(new THREE.DodecahedronGeometry(0.06, 0), rock), 0, 0.12, 0.45); g.add(ball);
  g.add(place(mesh(box(0.06, 0.06, 0.14, 0.02), wood2), 0, 0.05, -0.08, 0.25));          // crosse
  g.add(place(mesh(box(0.03, 0.08, 0.03, 0.008), iron), 0, 0.2, 0.05));                 // poignée du dessus
  return g;
}

// FUSIL DE L'OMBRE (Selena) : long fusil noir et violet, filets argentés, lunette à lentille violette
function ombre() {
  const g = new THREE.Group();
  const black = polymer(0x16141c), violet = new THREE.MeshStandardMaterial({ color: 0x5a1f8a, metalness: 0.5, roughness: 0.3 }), silver = chrome(0xc9ccd6);
  const purple = new THREE.MeshPhysicalMaterial({ color: 0xb45cff, roughness: 0.05, clearcoat: 1, emissive: 0x6a1fb0, emissiveIntensity: 0.9 });
  g.add(grip(black));
  g.add(place(mesh(box(0.065, 0.085, 0.42, 0.025), black), 0, 0.1, 0.05));
  g.add(place(mesh(box(0.068, 0.03, 0.36, 0.01), violet), 0, 0.075, 0.08));
  g.add(place(mesh(tubeZ(0.015, 0.66), black), 0, 0.11, 0.6));
  for (const z of [0.45, 0.7, 0.92]) { const r = ring(0.019, 0.005, silver); r.position.set(0, 0.11, z); g.add(r); }
  g.add(place(mesh(tubeZ(0.024, 0.28), black), 0, 0.2, 0.06));                            // lunette
  for (const z of [-0.08, 0.2]) { g.add(place(mesh(tubeZ(0.032, 0.05), silver), 0, 0.2, z)); g.add(place(new THREE.Mesh(new THREE.CircleGeometry(0.026, 18), purple), 0, 0.2, z + (z > 0 ? 0.026 : -0.026)).rotateY(z > 0 ? 0 : Math.PI)); }
  g.add(place(mesh(box(0.055, 0.035, 0.26, 0.012), black), 0, 0.12, -0.27));             // crosse
  g.add(place(mesh(box(0.06, 0.13, 0.035, 0.012), violet), 0, 0.07, -0.41));
  return g;
}

// DISPERSEUR DU NÉANT (Kaiser) : corps anguleux noir, triple émetteur, lignes et cœur magenta
function neant() {
  const g = new THREE.Group();
  const black = metal(0x1a1b22), neon = glow(0xff3dc8), plate = metal(0x2c2e3a);
  g.add(grip(black));
  g.add(place(mesh(box(0.1, 0.1, 0.34, 0.015), black), 0, 0.1, 0.07));
  g.add(place(mesh(box(0.11, 0.04, 0.2, 0.01), plate), 0, 0.165, 0.05));
  for (const sd of [-1, 0, 1]) g.add(place(mesh(tubeZ(0.018, 0.2), plate), sd * 0.035, 0.1, 0.33));
  for (const sd of [-1, 0, 1]) g.add(place(new THREE.Mesh(new THREE.CircleGeometry(0.014, 12), neon), sd * 0.035, 0.1, 0.431));
  for (const sd of [-1, 1]) g.add(place(new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.012, 0.3), neon), sd * 0.051, 0.1, 0.07));
  const coreM = new THREE.Mesh(new THREE.OctahedronGeometry(0.03, 0), neon); coreM.position.set(0, 0.2, 0.05); g.add(coreM);
  g.add(place(mesh(box(0.06, 0.06, 0.16, 0.012), plate), 0, 0.08, -0.17, 0.18));
  return g;
}

const BUILDERS = { lumiere, brasier, rafale, rocher, ombre, neant };

// Texture camouflage (canvas), partagée
let camoTex = null;
function camo() {
  if (camoTex) return camoTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#7a7048'; g.fillRect(0, 0, 128, 128);
  let seed = 5; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const col of ['#4f5a32', '#a39466', '#2f3324', '#6b5a3a']) {
    g.fillStyle = col;
    for (let i = 0; i < 14; i++) { g.beginPath(); g.ellipse(r() * 128, r() * 128, 6 + r() * 16, 4 + r() * 10, r() * 3, 0, Math.PI * 2); g.fill(); }
  }
  camoTex = new THREE.CanvasTexture(c);
  camoTex.colorSpace = THREE.SRGBColorSpace;
  camoTex.wrapS = camoTex.wrapT = THREE.RepeatWrapping;
  camoTex.repeat.set(3, 3);
  return camoTex;
}
// Applique un skin d'arme (apparence seulement) : camouflage, doré, néon.
function applyWeaponSkin(g, skin) {
  g.traverse((o) => {
    if (!o.isMesh || o.userData.outline) return;
    const mat = o.material;
    if (mat.emissiveIntensity >= 1.5 || mat.isMeshPhysicalMaterial) return; // lentilles et lumières conservées
    let next;
    if (skin.style === 'gold') next = new THREE.MeshStandardMaterial({ color: mat.metalness > 0.5 ? 0xffd25e : 0xe9a92e, metalness: 1, roughness: 0.25 });
    else if (skin.style === 'camo') next = mat.metalness > 0.5 ? mat.clone() : new THREE.MeshStandardMaterial({ map: camo(), roughness: 0.75 });
    else if (skin.style === 'neon') next = mat.metalness > 0.5
      ? new THREE.MeshStandardMaterial({ color: 0x14121e, metalness: 0.8, roughness: 0.3 })
      : new THREE.MeshStandardMaterial({ color: 0xff3d9a, emissive: 0xff3d9a, emissiveIntensity: 0.9, roughness: 0.4 });
    else if (skin.style === 'ether') next = mat.metalness > 0.5
      ? new THREE.MeshStandardMaterial({ color: 0xd8dcff, metalness: 1, roughness: 0.18 })
      : new THREE.MeshStandardMaterial({ color: 0x6a3cff, emissive: 0x7a4bff, emissiveIntensity: 0.55, metalness: 0.3, roughness: 0.25 });
    if (next) { mat.dispose(); o.material = next; }
  });
  if (skin.style === 'ether') {
    // cristaux d'éther flottant le long du canon
    const box = new THREE.Box3().setFromObject(g);
    const mat = new THREE.MeshStandardMaterial({ color: 0xbfa8ff, emissive: 0x9f7bff, emissiveIntensity: 1.6, roughness: 0.1, flatShading: true });
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.018 + i * 0.004, 0), mat);
      c.position.set(0, box.max.y + 0.02, box.min.z + (box.max.z - box.min.z) * (0.3 + i * 0.22));
      c.scale.y = 1.6;
      g.add(c);
    }
  }
  if (skin.style === 'neon') {
    const box = new THREE.Box3().setFromObject(g);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.01, box.max.z - box.min.z),
      new THREE.MeshStandardMaterial({ color: 0x40e8ff, emissive: 0x40e8ff, emissiveIntensity: 2.5, toneMapped: false }));
    for (const sd of [-1, 1]) { const st = strip.clone(); st.position.set(sd * 0.042, 0.1, (box.max.z + box.min.z) / 2); g.add(st); }
  }
}

/** Crée le modèle 3D d'une arme (Group), avec un skin éventuel. Arme inconnue : groupe vide. */
export function createWeaponModel(id, skin = null) {
  const build = BUILDERS[id];
  const g = build ? build() : new THREE.Group();
  if (skin && build) applyWeaponSkin(g, skin);
  g.userData.weaponId = id;
  return g;
}
export function disposeWeaponModel(g) {
  g.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (o.material !== outlineMat) o.material.dispose?.(); } });
}
