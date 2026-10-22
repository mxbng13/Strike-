// Produits IDREA modélisés en 3D (d'après les photos de la boutique) + salle de bain pour les plans d'ambiance.
import * as THREE from 'three';

export function fabrique(o) {
  const { env, normalesDepuis, textureCanvas, fbm, bruit } = o;
  const V2 = (x, y) => new THREE.Vector2(x, y);
  const metal = (couleur, rugo = 0.25) => new THREE.MeshPhysicalMaterial({ color: couleur, metalness: 1, roughness: rugo, envMap: env, envMapIntensity: 1.4 });
  const silicone = (couleur, rugo = 0.62) => new THREE.MeshPhysicalMaterial({ color: couleur, roughness: rugo, metalness: 0, sheen: 0.4, sheenColor: new THREE.Color(0x888888), envMap: env, envMapIntensity: 0.7 });
  const ombres = g => { g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return g; };

  // pierre veinée (jade) : texture procédurale
  function texturePierre(base, veine) {
    return textureCanvas(1024, 1024, (g, w, h) => {
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const n = fbm(x / 140, y / 140, 0, 5);
        const v = Math.pow(1 - Math.abs(Math.sin((x + y * 0.6) / 70 + n * 6)), 14);
        const t = 0.82 + 0.18 * fbm(x / 40, y / 40, 4, 3);
        const k = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) img.data[k + c] = Math.min(255, (base[c] * t) * (1 - v * 0.5) + veine[c] * v * 0.5);
        img.data[k + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    });
  }

  // ---------------------------------------------------------------- rouleau de glace (moule silicone + dôme de glace)
  function glace() {
    const g = new THREE.Group();
    const vert = 0x8fb08a;
    // socle cannelé
    const pts = [V2(0, 0), V2(0.46, 0), V2(0.52, 0.05), V2(0.53, 0.12), V2(0.53, 0.78), V2(0.47, 0.82), V2(0.44, 0.82)];
    const socle = new THREE.LatheGeometry(pts, 192);
    const p = socle.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), y = p.getY(i), r = Math.hypot(x, z);
      if (r > 0.5 && y > 0.1 && y < 0.79) {
        const a = Math.atan2(z, x), k = 1 + 0.022 * Math.pow(Math.abs(Math.sin(a * 22)), 0.6);
        p.setX(i, x * k); p.setZ(i, z * k);
      }
    }
    socle.computeVertexNormals();
    g.add(new THREE.Mesh(socle, silicone(vert)));
    // dôme de glace translucide avec veines blanches
    const dome = new THREE.LatheGeometry([V2(0, 0.78), V2(0.43, 0.78), V2(0.43, 1.25), V2(0.41, 1.42), V2(0.34, 1.57), V2(0.2, 1.66), V2(0, 1.69)], 160);
    const givre = textureCanvas(512, 512, (c, w, h) => {
      c.fillStyle = '#dcebf5'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        c.strokeStyle = `rgba(170,190,205,${0.15 + Math.random() * 0.3})`; c.lineWidth = 1 + Math.random() * 3;
        c.beginPath(); let x = Math.random() * w, y = Math.random() * h; c.moveTo(x, y);
        for (let k = 0; k < 8; k++) { x += (Math.random() - 0.5) * 120; y += (Math.random() - 0.3) * 90; c.lineTo(x, y); }
        c.stroke();
      }
    });
    const glaceMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.72, depthWrite: false,
      envMap: env, envMapIntensity: 1.8, clearcoat: 1, clearcoatRoughness: 0.04, map: givre, side: THREE.DoubleSide,
    });
    g.add(new THREE.Mesh(dome, glaceMat));
    // capuchon en arche posé à côté
    const s = new THREE.Shape();
    s.moveTo(-0.42, 0); s.lineTo(0.42, 0); s.lineTo(0.42, 0.62); s.absarc(0, 0.62, 0.42, 0, Math.PI, false); s.lineTo(-0.42, 0);
    const cap = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 6, curveSegments: 64 });
    const arches = normalesDepuis(256, 256, (x, y) => { const r = Math.hypot(x - 0.5, (y - 0.38) * 1.2); return Math.abs(Math.sin(r * 60)) * 0.5; }, 1.2);
    const mc = silicone(vert); mc.normalMap = arches; mc.normalScale = V2(0.8, 0.8);
    const capm = new THREE.Mesh(cap, mc); capm.position.set(0.78, 0, -0.2); capm.rotation.y = -0.5;
    g.add(capm);
    g.position.x = -0.3;
    return ombres(g);
  }

  // ---------------------------------------------------------------- rouleau double tête + gua sha en jade
  function guasha() {
    const g = new THREE.Group();
    const jade = new THREE.MeshPhysicalMaterial({
      map: texturePierre([96, 140, 82], [226, 236, 200]), roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05,
      transmission: 0.08, thickness: 0.3, envMap: env, envMapIntensity: 1.2,
    });
    const or = metal(0xd9ab55, 0.22);
    // gua sha en forme de cœur
    const s = new THREE.Shape();
    s.moveTo(0, -0.95);
    s.bezierCurveTo(0.35, -0.7, 0.7, -0.25, 0.72, 0.25);
    s.bezierCurveTo(0.74, 0.6, 0.45, 0.78, 0.25, 0.62);
    s.bezierCurveTo(0.12, 0.52, 0.06, 0.4, 0, 0.42);
    s.bezierCurveTo(-0.06, 0.4, -0.12, 0.55, -0.3, 0.66);
    s.bezierCurveTo(-0.55, 0.8, -0.82, 0.55, -0.78, 0.2);
    s.bezierCurveTo(-0.74, -0.25, -0.38, -0.7, 0, -0.95);
    const gs = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.045, bevelSize: 0.06, bevelSegments: 10, curveSegments: 80 });
    const uvAuto = geo => { const p = geo.attributes.position, uv = []; for (let i = 0; i < p.count; i++) uv.push(p.getX(i) * 0.5 + 0.5, p.getY(i) * 0.5 + 0.5); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); };
    uvAuto(gs);
    const pierre = new THREE.Mesh(gs, jade); pierre.position.set(0.85, 0.1, 0); pierre.rotation.z = -0.25;
    g.add(pierre);
    // rouleau : manche, cadre doré, grande et petite pierre
    const r = new THREE.Group();
    const cyl = (rad, len, mat) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(rad, len, 12, 48), mat); m.rotation.z = Math.PI / 2; return m; };
    const manche = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 1.0, 12, 48), jade); r.add(manche);
    for (const y of [0.55, -0.55]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.07, 48), or); b.position.y = y; r.add(b); }
    const grand = cyl(0.17, 0.42, jade); grand.position.y = 1.05; r.add(grand);
    const petit = cyl(0.1, 0.2, jade); petit.position.y = -1.0; r.add(petit);
    const fil = (pts, rad = 0.022) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, rad, 12), or);
    r.add(fil([new THREE.Vector3(0, 0.58, 0), new THREE.Vector3(0, 0.75, 0), new THREE.Vector3(0.34, 0.8, 0), new THREE.Vector3(0.4, 1.05, 0)]));
    r.add(fil([new THREE.Vector3(0.4, 1.05, 0), new THREE.Vector3(0.36, 1.05, 0)]));
    r.add(fil([new THREE.Vector3(0, 0.75, 0), new THREE.Vector3(-0.34, 0.8, 0), new THREE.Vector3(-0.4, 1.05, 0)]));
    r.add(fil([new THREE.Vector3(0, -0.58, 0), new THREE.Vector3(0, -0.72, 0), new THREE.Vector3(0.2, -0.76, 0), new THREE.Vector3(0.24, -1.0, 0)]));
    r.add(fil([new THREE.Vector3(0, -0.72, 0), new THREE.Vector3(-0.2, -0.76, 0), new THREE.Vector3(-0.24, -1.0, 0)]));
    r.position.set(-0.6, 0.05, 0.05); r.rotation.z = 0.12;
    g.add(r);
    g.scale.setScalar(0.62);
    return ombres(g);
  }

  // ---------------------------------------------------------------- coupe-poils nez & oreilles
  function tondeuse() {
    const g = new THREE.Group();
    const corps = new THREE.LatheGeometry([V2(0, 0), V2(0.18, 0), V2(0.215, 0.04), V2(0.225, 0.15), V2(0.225, 1.25), V2(0.2, 1.33), V2(0.16, 1.36)], 128);
    const brosse = normalesDepuis(128, 512, (x, y) => bruit(x * 4, y * 400) * 0.5, 1.4);
    const gunmetal = new THREE.MeshPhysicalMaterial({ color: 0x7a818c, metalness: 0.55, roughness: 0.38, envMap: env, envMapIntensity: 1.3,
      normalMap: brosse, normalScale: V2(0.25, 0.25), clearcoat: 0.4, clearcoatRoughness: 0.2 });
    g.add(new THREE.Mesh(corps, gunmetal));
    // écran LED (batterie)
    const ecran = textureCanvas(256, 512, (c, w, h) => {
      c.fillStyle = '#050608'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#7fe3ff'; c.shadowColor = '#7fe3ff'; c.shadowBlur = 18; c.font = 'bold 150px monospace'; c.textAlign = 'center';
      c.fillText('99', w / 2, h * 0.42);
      c.font = 'bold 60px monospace'; c.fillText('%', w / 2, h * 0.62);
    });
    const vitre = new THREE.Mesh(new THREE.CylinderGeometry(0.2275, 0.2275, 0.34, 64, 1, true, -0.38, 0.76),
      new THREE.MeshPhysicalMaterial({ map: ecran, emissiveMap: ecran, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.05, clearcoat: 1, envMap: env }));
    vitre.position.y = 0.82; vitre.rotation.y = Math.PI / 2; g.add(vitre);
    const bouton = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 48), metal(0x9aa0a8, 0.3));
    bouton.rotation.x = Math.PI / 2; bouton.position.set(0, 0.52, 0.228); g.add(bouton);
    // bague chromée + tête à fentes + capot transparent
    const bague = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 64), metal(0xdfe3e8, 0.12)); bague.position.y = 1.38; g.add(bague);
    const tete = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.34, 64), metal(0xd0d4da, 0.18)); tete.position.y = 1.58; g.add(tete);
    for (let k = 0; k < 10; k++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.22, 0.03), new THREE.MeshStandardMaterial({ color: 0x111111 }));
      const a = k / 10 * Math.PI * 2; f.position.set(Math.cos(a) * 0.112, 1.6, Math.sin(a) * 0.112); f.rotation.y = -a; g.add(f);
    }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.105, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), metal(0xd8dce2, 0.15)); dome.position.y = 1.75; g.add(dome);
    g.position.y = -0.85;
    return ombres(g);
  }

  // ---------------------------------------------------------------- gratte-langue inox + étui
  function langue() {
    const g = new THREE.Group();
    const inox = metal(0xd9dce1, 0.16);
    const vert = silicone(0x7ed957, 0.55);
    // boucle en U (lame inox aplatie)
    const u = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.05, 0, 0), new THREE.Vector3(-0.12, 0.35, 0), new THREE.Vector3(-0.2, 0.62, 0),
      new THREE.Vector3(0, 0.78, 0), new THREE.Vector3(0.2, 0.62, 0), new THREE.Vector3(0.12, 0.35, 0), new THREE.Vector3(0.05, 0, 0)]);
    const lame = new THREE.Mesh(new THREE.TubeGeometry(u, 160, 0.022, 16), inox); lame.scale.z = 1.8; lame.position.y = 0.95;
    g.add(lame);
    const tige = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.5, 32), inox); tige.position.y = 0.75; g.add(tige);
    // manche ergonomique vert, avec crans
    const prof = [];
    for (let k = 0; k <= 40; k++) { const t = k / 40; prof.push(V2(0.05 + 0.055 * Math.sin(Math.PI * Math.pow(t, 0.8)) + 0.008 * Math.sin(t * 40), 0.5 - t * 1.6)); }
    const manche = new THREE.LatheGeometry(prof, 64); manche.scale(1, 1, 0.55);
    g.add(new THREE.Mesh(manche, vert));
    // étui (gélule allongée) posé derrière
    const etui = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 1.9, 16, 64), vert);
    etui.scale.z = 0.55; etui.rotation.z = Math.PI / 2 - 0.9; etui.position.set(0.15, -0.1, -0.35);
    g.add(etui);
    g.rotation.z = -0.55; g.scale.setScalar(0.85);
    return ombres(g);
  }

  // ---------------------------------------------------------------- patchs nez (feutre noir)
  function patchs() {
    const g = new THREE.Group();
    const s = new THREE.Shape();
    s.moveTo(0, 0.34);
    s.bezierCurveTo(0.18, 0.36, 0.3, 0.22, 0.42, 0.18); s.bezierCurveTo(0.62, 0.14, 0.72, 0.0, 0.7, -0.18);
    s.bezierCurveTo(0.68, -0.36, 0.48, -0.42, 0.3, -0.32); s.bezierCurveTo(0.16, -0.25, 0.08, -0.2, 0, -0.22);
    s.bezierCurveTo(-0.08, -0.2, -0.16, -0.25, -0.3, -0.32); s.bezierCurveTo(-0.48, -0.42, -0.68, -0.36, -0.7, -0.18);
    s.bezierCurveTo(-0.72, 0.0, -0.62, 0.14, -0.42, 0.18); s.bezierCurveTo(-0.3, 0.22, -0.18, 0.36, 0, 0.34);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.008, bevelSegments: 3, curveSegments: 64 });
    const feutre = normalesDepuis(512, 512, (x, y) => bruit(x * 300, y * 300) * 0.6 + bruit(x * 900, y * 40) * 0.3, 2.0);
    const mat = new THREE.MeshPhysicalMaterial({ color: 0x1e1e22, roughness: 0.9, sheen: 1, sheenColor: new THREE.Color(0x70707c), sheenRoughness: 0.6,
      normalMap: feutre, normalScale: V2(0.6, 0.6), envMap: env, envMapIntensity: 0.5 });
    const uvA = gg => { const p = gg.attributes.position, uv = []; for (let i = 0; i < p.count; i++) uv.push(p.getX(i), p.getY(i)); gg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); };
    uvA(geo);
    // éventail de patchs, un peu de relief (chacun légèrement bombé)
    const P = [[-0.78, 0.46, 0.0, 0.06], [0.78, 0.46, 0.04, -0.05], [-0.78, -0.46, 0.08, -0.04], [0.78, -0.46, 0.12, 0.07]]; // grille 2 x 2, comme sur la photo produit
    for (const [x, y, z, rot] of P) {
      const gg = geo.clone(); const p = gg.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + 0.08 * (1 - (p.getX(i) / 0.7) ** 2));
      gg.computeVertexNormals();
      const m = new THREE.Mesh(gg, mat); m.position.set(x, y, z); m.rotation.z = rot; g.add(m);
    }
    g.scale.setScalar(0.9);
    return ombres(g);
  }

  // ---------------------------------------------------------------- salle de bain (comptoir en marbre + carrelage)
  function salleDeBain() {
    const g = new THREE.Group();
    const marbre = textureCanvas(2048, 2048, (c, w, h) => {
      const img = c.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const n = fbm(x / 260, y / 260, 2, 5);
        const v = Math.pow(1 - Math.abs(Math.sin((x * 0.8 + y) / 160 + n * 7)), 22) + 0.4 * Math.pow(1 - Math.abs(Math.sin((x - y * 0.3) / 90 + n * 5)), 30);
        const base = 238 + 10 * fbm(x / 60, y / 60, 7, 3);
        const k = (y * w + x) * 4;
        img.data[k] = base - v * 70; img.data[k + 1] = base - v * 68; img.data[k + 2] = base - v * 62; img.data[k + 3] = 255;
      }
      c.putImageData(img, 0, 0);
    });
    marbre.colorSpace = THREE.SRGBColorSpace;
    const plan = new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 6),
      new THREE.MeshPhysicalMaterial({ map: marbre, roughness: 0.18, clearcoat: 0.8, clearcoatRoughness: 0.1, envMap: env, envMapIntensity: 0.6 }));
    plan.position.y = -0.15; plan.receiveShadow = true; g.add(plan);
    const carreaux = textureCanvas(1024, 1024, (c, w, h) => {
      c.fillStyle = '#d9d5cf'; c.fillRect(0, 0, w, h);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
        const dx = (y % 2) * 128;
        c.fillStyle = `rgb(${244 - Math.random() * 6},${242 - Math.random() * 6},${238 - Math.random() * 6})`;
        c.fillRect(x * 256 + dx + 4 - 256, y * 128 + 4, 248, 120); c.fillRect(x * 256 + dx + 4, y * 128 + 4, 248, 120);
      }
    });
    carreaux.colorSpace = THREE.SRGBColorSpace; carreaux.repeat.set(4, 3);
    const mur = new THREE.Mesh(new THREE.PlaneGeometry(14, 9), new THREE.MeshPhysicalMaterial({ map: carreaux, roughness: 0.25, clearcoat: 0.6, envMap: env, envMapIntensity: 0.5 }));
    mur.position.set(0, 4.3, -2.6); mur.receiveShadow = true; g.add(mur);
    // petit vase pour la profondeur
    const vase = new THREE.Mesh(new THREE.LatheGeometry([V2(0, 0), V2(0.28, 0), V2(0.34, 0.3), V2(0.2, 0.8), V2(0.14, 1.05), V2(0.16, 1.15)], 64),
      new THREE.MeshPhysicalMaterial({ color: 0xcdb8a0, roughness: 0.55, envMap: env, envMapIntensity: 0.6 }));
    vase.position.set(2.6, 0, -1.6); vase.castShadow = true; g.add(vase);
    return g;
  }

  return { glace, guasha, tondeuse, langue, patchs, salleDeBain };
}
