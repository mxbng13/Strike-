// Rendu 3D de l'écran principal : le personnage seul, debout sur la plateforme de l'image de fond
// (assets/home-background.jpg, affichée en « cover » derrière le canevas transparent).
// La caméra est calculée pour que les pieds du personnage tombent exactement sur le point d'ancrage de la
// plateforme, à l'échelle de la plateforme, quelle que soit la taille de l'écran.
// Rotation au doigt avec inertie, saut au toucher, transition lors du changement de personnage.
import * as THREE from 'three';
import { createCharacter } from '../characters/characterFactory.js';
import { glowTexture } from './textures.js';
import { applyEnvMap } from './environment.js';
import homeBackground from '../assets/home-background.jpg';

const FOV = 30;
// Image de fond : taille, point d'ancrage des pieds (centre de la face supérieure du podium, en fraction de
// l'image) et largeur de cette face supérieure (fraction de la largeur de l'image).
export const HOME_BG = { w: 1438, h: 2576, anchorX: 0.49, anchorY: 0.745, topWidth: 0.59 };
const PODIUM_UNITS = 2.1;                  // la face supérieure du podium mesure 2,1 unités (personnage ≈ 2 unités)
const PITCH = THREE.MathUtils.degToRad(17); // la face supérieure est vue d'environ 17° au-dessus : même angle ici

export function createStage(renderer) {
  const canvas = renderer.domElement;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  applyEnvMap(renderer, scene, 0.9);
  // fond : l'image, recadrée en « cover » et centrée (le canevas 3D est transparent par-dessus)
  canvas.style.background = `#120826 url("${homeBackground}") center / cover no-repeat`;

  // Éclairage : lumière principale blanche (couleurs fidèles), sol et contre-jour violets pour détacher
  // la silhouette du fond sombre
  scene.add(new THREE.HemisphereLight(0xf2ecff, 0x2a1a4a, 1.05));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2.5, 6, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 1, far: 15 });
  key.shadow.bias = -0.0005;
  key.shadow.radius = 5;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xb48cff, 1.5);
  rim.position.set(-3, 3, -4);
  scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0x8a5cff, 0.9);
  rim2.position.set(3.5, 2.5, -3.5);
  scene.add(rim2);

  // Ancrage sur la plateforme de l'image : ombre portée réelle (lumière principale) + ombre douce de contact,
  // posées sur la face supérieure (le podium lui-même est dans l'image)
  const shadowCatcher = new THREE.Mesh(new THREE.CircleGeometry(1.0, 48), new THREE.ShadowMaterial({ opacity: 0.38 }));
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.position.y = 0.001;
  shadowCatcher.receiveShadow = true;
  scene.add(shadowCatcher);
  const softShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 1.7),
    new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }),
  );
  softShadow.rotation.x = -Math.PI / 2;
  softShadow.position.y = 0.0005;
  scene.add(softShadow);

  const turntable = new THREE.Group();
  scene.add(turntable);
  let current = null;
  let pending = null;
  let transition = null; // { phase: 'out' | 'in', t }

  // rank : 'basique' | 'or' | 'diamant' (change la tenue)
  function setCharacter(def, look = {}) {
    pending = { def, look };
    if (!current || !running) { spawn(); return; }
    transition = { phase: 'out', t: 0 };
  }
  function spawn() {
    const { def, look } = pending;
    pending = null;
    if (current) { turntable.remove(current.root); current.dispose(); }
    current = createCharacter(def, { aura: false, ...look }); // pas de particules autour du personnage
    current.root.scale.setScalar(0.001);
    turntable.add(current.root);
    transition = { phase: 'in', t: 0 };
  }

  // Rotation au doigt avec inertie ; tap = réaction du personnage
  let rotY = 0, velY = 0, dragging = false, lastX = 0, downX = 0, downT = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (!running) return;
    dragging = true; lastX = downX = e.clientX; downT = performance.now(); velY = 0;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const d = (e.clientX - lastX) * 0.012;
    lastX = e.clientX;
    rotY += d;
    velY = d;
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    if (Math.abs(e.clientX - downX) < 8 && performance.now() - downT < 300) current?.play('jump');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  /** Position de l'image à l'écran (recadrage « cover », centré) : point d'ancrage et largeur du podium en px. */
  function backgroundLayout(w, h) {
    const k = Math.max(w / HOME_BG.w, h / HOME_BG.h);
    const iw = HOME_BG.w * k, ih = HOME_BG.h * k;
    const ox = (w - iw) / 2, oy = (h - ih) / 2;
    return { ax: ox + HOME_BG.anchorX * iw, ay: oy + HOME_BG.anchorY * ih, topPx: HOME_BG.topWidth * iw };
  }
  // Caméra : vise les pieds (origine) depuis PITCH au-dessus, à la distance qui donne la bonne échelle, puis
  // décale le cadre (setViewOffset) pour que l'origine tombe exactement sur le point d'ancrage de l'image.
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    const { ax, ay, topPx } = backgroundLayout(w, h);
    const pxPerUnit = topPx / PODIUM_UNITS;
    const dist = h / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * pxPerUnit);
    camera.aspect = w / h;
    camera.position.set(0, Math.sin(PITCH) * dist, Math.cos(PITCH) * dist);
    camera.lookAt(0, 0, 0);
    camera.setViewOffset(w, h, w / 2 - ax, h / 2 - ay, w, h);
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', () => running && resize());

  const clock = new THREE.Clock();
  let running = false;
  function frame() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    if (!dragging) {
      rotY += velY * dt * 60;
      velY *= Math.pow(0.04, dt);
      if (Math.abs(velY) < 0.0005) {
        velY = 0;
        rotY += (Math.round(rotY / (Math.PI * 2)) * Math.PI * 2 - rotY) * Math.min(dt * 1.2, 1); // revient de face
      }
    }
    turntable.rotation.y = rotY;

    if (transition) {
      transition.t += dt;
      if (transition.phase === 'out') {
        const p = Math.min(transition.t / 0.18, 1);
        current.root.scale.setScalar(Math.max(1 - p * p, 0.001));
        if (p >= 1) spawn();
      } else {
        const p = Math.min(transition.t / 0.45, 1);
        const s = 1 + Math.sin(p * Math.PI) * 0.1 * (1 - p) - Math.pow(1 - p, 3);
        current.root.scale.setScalar(Math.max(s, 0.001));
        if (p >= 1) { current.root.scale.setScalar(1); transition = null; }
      }
    }
    current?.update(t, dt);

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  let hiddenPause = false;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && running) { hiddenPause = true; running = false; }
    else if (!document.hidden && hiddenPause) { hiddenPause = false; resume(); }
  });

  function resume() {
    if (running) return;
    running = true;
    resize();
    clock.getDelta();
    requestAnimationFrame(frame);
  }

  return {
    setCharacter,
    start: resume,
    resume,
    pause() { running = false; dragging = false; },
    jump() { current?.play('jump'); },
    /** (tests) point de l'écran où sont les pieds du personnage et point d'ancrage de l'image. */
    feetOnScreen() {
      const v = new THREE.Vector3(0, 0, 0).project(camera);
      const { ax, ay } = backgroundLayout(innerWidth, innerHeight);
      return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, ax, ay };
    },
  };
}
