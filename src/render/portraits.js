// Vignettes des personnages, par rang.
// Toutes les vignettes sont des rendus du modèle 3D (aucune image externe), calculés une fois et mis en cache.
import * as THREE from 'three';
import { createCharacter } from '../characters/characterFactory.js';
import { CHARACTERS } from '../data/characters.js';
import { createWeaponModel, disposeWeaponModel } from '../characters/weaponModels.js';
import { appearanceFor, appearanceKey } from '../game/appearance.js';
import { getWeaponSkin } from '../data/skins.js';
import { RARITIES } from '../data/rarities.js';
import { applyEnvMap } from './environment.js';
import { useMap, WIDTH as AW } from '../arena/grid.js';
import { buildArenaMap } from '../arena/mapBuilder.js';
import { ARENA_MAPS } from '../arena/maps.js';

const cache = new Map();
let ctx = null;

function getContext() {
  if (ctx) return ctx;
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(256, 256, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  applyEnvMap(renderer, scene, 1);
  scene.add(new THREE.HemisphereLight(0xd8ccff, 0x30405a, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2, 3, 4);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0.5, 1.85, 4.3);
  camera.lookAt(0, 1.38, 0);
  ctx = { renderer, scene, camera };
  return ctx;
}

/** Vignette carrée (buste). */
export function getPortrait(def, rank = 'basique') {
  const look = { ...appearanceFor(def.id), rank };
  const keyId = appearanceKey(def.id, look);
  if (cache.has(keyId)) return cache.get(keyId);
  const { renderer, scene, camera } = getContext();
  const ch = createCharacter(def, { aura: false, ...look });
  ch.root.rotation.y = 0.25;
  ch.update(0.4, 0.016);
  scene.add(ch.root);
  renderer.setClearColor(new THREE.Color(RARITIES[def.rarity].aura).multiplyScalar(0.25), 0);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(ch.root);
  ch.dispose();
  cache.set(keyId, url);
  return url;
}

/** Rendu en pied du modèle 3D (écran d'ouverture de box). */
export function getIllustration(def, rank = 'basique') {
  const look = { ...appearanceFor(def.id), rank };
  const keyId = `full:${appearanceKey(def.id, look)}`;
  if (cache.has(keyId)) return cache.get(keyId);
  const { renderer, scene } = getContext();
  renderer.setSize(384, 512, false);
  const cam = new THREE.PerspectiveCamera(30, 384 / 512, 0.1, 50);
  cam.position.set(0.6, 1.6, 5.6);
  cam.lookAt(0, 1.18, 0);
  const ch = createCharacter(def, { aura: false, ...look });
  ch.root.rotation.y = 0.2;
  ch.update(0.4, 0.016);
  scene.add(ch.root);
  renderer.setClearColor(0x000000, 0);
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(ch.root);
  ch.dispose();
  renderer.setSize(256, 256, false);
  cache.set(keyId, url);
  return url;
}

/** Vignette carrée d'une arme (rendu 3D, mise en cache). */
export function weaponPortrait(id, skinId = null) {
  const keyId = `weapon:${id}:${skinId ?? ''}`;
  if (cache.has(keyId)) return cache.get(keyId);
  const { renderer, scene } = getContext();
  // fusil vu de profil (canon le long de z), cadré pour remplir la vignette
  const w = createWeaponModel(id, skinId ? getWeaponSkin(skinId) : null);
  w.rotation.set(-0.35, 0, 0);
  const bb = new THREE.Box3().setFromObject(w);
  const c = bb.getCenter(new THREE.Vector3()), size = bb.getSize(new THREE.Vector3());
  const span = Math.max(size.y, size.z);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  cam.position.set(c.x + span * 1.75, c.y + span * 0.12, c.z + span * 0.25);
  cam.lookAt(c);
  scene.add(w);
  renderer.setClearColor(0x000000, 0);
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(w);
  disposeWeaponModel(w);
  cache.set(keyId, url);
  return url;
}

/** Aperçu en pied d'un Striker portant un skin donné (écran de révélation, liste des skins). */
export function skinPreview(skin) {
  const keyId = `skin:${skin.id}`;
  if (cache.has(keyId)) return cache.get(keyId);
  const def = CHARACTERS.find((c) => c.id === skin.strikerId) ?? CHARACTERS[0];
  const { renderer, scene } = getContext();
  renderer.setSize(384, 512, false);
  const cam = new THREE.PerspectiveCamera(30, 384 / 512, 0.1, 50);
  cam.position.set(0.6, 1.6, 5.6);
  cam.lookAt(0, 1.18, 0);
  const ch = createCharacter(def, { aura: false, rank: 'basique', skin });
  ch.root.rotation.y = 0.2;
  ch.update(0.4, 0.016);
  scene.add(ch.root);
  renderer.setClearColor(0x000000, 0);
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(ch.root);
  ch.dispose();
  renderer.setSize(256, 256, false);
  cache.set(keyId, url);
  return url;
}

export const cachedArenaMapPreview = (id) => cache.get(`amap:${id}`) ?? null;

/** Aperçu d'une carte de l'arène (vue du dessus, comme en jeu), mis en cache. */
export function arenaMapPreview(id) {
  const keyId = `amap:${id}`;
  if (cache.has(keyId)) return cache.get(keyId);
  const { renderer } = getContext();
  const W = 480, H = 270;
  renderer.setSize(W, H, false);
  const scene = new THREE.Scene();
  applyEnvMap(renderer, scene, 0.6);
  const def = useMap(id);
  const m = buildArenaMap(scene, { theme: def.theme });
  m.update(1, 0.016, new THREE.Vector3());
  const cam = new THREE.OrthographicCamera(-AW / 2 - 1, AW / 2 + 1, (AW + 2) * H / W / 2, -(AW + 2) * H / W / 2, 0.1, 200);
  cam.position.set(0, 40, 22); cam.lookAt(0, 0, 0);
  renderer.setClearColor(0x000000, 1);
  const tm = renderer.toneMapping;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.render(scene, cam);
  renderer.toneMapping = tm;
  const url = renderer.domElement.toDataURL('image/jpeg', 0.85);
  m.dispose();
  scene.traverse((o) => { if (o.isMesh || o.isInstancedMesh) o.geometry?.dispose?.(); });
  renderer.setSize(256, 256, false);
  renderer.setClearColor(0x000000, 0);
  cache.set(keyId, url);
  return url;
}

