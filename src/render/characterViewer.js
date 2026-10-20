// Visionneuse 3D de la fiche personnage : le MÊME modèle que sur l'écran principal et en combat
// (createCharacter), posé sur le cercle noir, qu'on fait pivoter à 360° au doigt.
// - glisser horizontalement : le personnage tourne sur son axe vertical (la caméra et le fond ne bougent pas) ;
// - relâcher : il continue sur son élan puis ralentit et s'arrête là où il est (pas de retour de face) ;
// - toucher sans glisser : petit saut ;
// - touch-action: none sur la zone : le geste ne fait jamais défiler la fiche.
// Un seul contexte WebGL est créé et réutilisé d'une fiche à l'autre.
import * as THREE from 'three';
import { createCharacter } from '../characters/characterFactory.js';
import { applyEnvMap } from './environment.js';
import { glowTexture } from './textures.js';

let shared = null;

function getShared() {
  if (shared) return shared;
  const canvas = document.createElement('canvas');
  canvas.className = 'viewer-canvas';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  applyEnvMap(renderer, scene, 0.9);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2.5, 6, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 1, far: 15 });
  key.shadow.radius = 5;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 0.9);
  rim.position.set(-3, 3, -4);
  scene.add(rim);

  // même socle que l'écran principal
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 0.95, 0.05, 64),
    new THREE.MeshStandardMaterial({ color: 0x0c0c0f, roughness: 0.8, metalness: 0, envMapIntensity: 0.15 }),
  );
  disc.position.y = -0.025;
  disc.receiveShadow = true;
  const soft = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 3),
    new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  soft.rotation.x = -Math.PI / 2;
  soft.position.y = -0.06;
  scene.add(disc, soft);

  const turntable = new THREE.Group();
  scene.add(turntable);
  const camera = new THREE.PerspectiveCamera(28, 0.75, 0.1, 50);
  shared = { canvas, renderer, scene, camera, turntable, mounted: null };
  return shared;
}

/**
 * Affiche le personnage dans `container`. Renvoie une fonction pour démonter la visionneuse.
 * `initialYaw` permet de garder l'angle quand on change d'aperçu de rang.
 */
export function mountViewer(container, def, rank = 'basique', { initialYaw = 0, weapon = null, skin = null, weaponSkin = null } = {}) {
  const s = getShared();
  s.mounted?.destroy();
  const { canvas, renderer, scene, camera, turntable } = s;
  container.append(canvas);

  const ch = createCharacter(def, { aura: false, rank, weapon, skin, weaponSkin });
  turntable.add(ch.root);

  let yaw = initialYaw, vel = 0, dragging = false, lastX = 0, lastT = 0, downX = 0, downT = 0, id = null;
  const onDown = (e) => {
    dragging = true; id = e.pointerId; vel = 0;
    lastX = downX = e.clientX; lastT = downT = performance.now();
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onMove = (e) => {
    if (!dragging || e.pointerId !== id) return;
    const now = performance.now();
    const dx = e.clientX - lastX;
    const d = dx * 0.013;
    yaw += d;
    const dtm = Math.max(now - lastT, 8) / 1000;
    vel = vel * 0.6 + (d / dtm) * 0.4; // vitesse en rad/s, lissée
    lastX = e.clientX; lastT = now;
    e.preventDefault();
  };
  const onUp = (e) => {
    if (!dragging || e.pointerId !== id) return;
    dragging = false;
    if (performance.now() - lastT > 80) vel = 0; // doigt immobile avant de relâcher : pas d'élan
    if (Math.abs(e.clientX - downX) < 8 && performance.now() - downT < 300) ch.play('jump');
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(1.62 / t, 1.15 / (t * camera.aspect));
    camera.position.set(0, 1.12 + dist * 0.14, dist);
    camera.lookAt(0, 1.12, 0);
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  const clock = new THREE.Clock();
  let alive = true;
  function frame() {
    if (!alive) return;
    if (!container.isConnected) { destroy(); return; } // fiche fermée
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!dragging && vel) {
      yaw += vel * dt;
      vel *= Math.pow(0.08, dt); // ralentit progressivement
      if (Math.abs(vel) < 0.05) vel = 0;
    }
    turntable.rotation.y = yaw;
    ch.update(clock.elapsedTime, dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function destroy() {
    if (!alive) return;
    alive = false;
    ro.disconnect();
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    turntable.remove(ch.root);
    ch.dispose();
    canvas.remove();
    if (s.mounted?.destroy === destroy) s.mounted = null;
  }
  const handle = { destroy, getYaw: () => yaw };
  s.mounted = handle;
  return handle;
}
