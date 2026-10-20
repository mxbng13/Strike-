// Rendu 3D partagé : création du renderer et reflets d’environnement (écran principal, arène, portraits).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export function createRenderer(canvas) {
  const isMobile = matchMedia('(pointer: coarse)').matches;
  // alpha : l'écran principal laisse voir l'image de fond (CSS) derrière la scène 3D.
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !isMobile || devicePixelRatio < 2, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.userData = { isMobile };
  return renderer;
}

// Reflets pour les matériaux métalliques (tenues Or et Diamant). Un seul calcul par renderer.
const envCache = new WeakMap();
export function applyEnvMap(renderer, scene, intensity = 1) {
  let tex = envCache.get(renderer);
  if (!tex) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    envCache.set(renderer, tex);
  }
  scene.environment = tex;
  scene.environmentIntensity = intensity;
}
