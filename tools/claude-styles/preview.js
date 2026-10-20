// Page de choix du modèle de Claude : scène tournante, 4 directions artistiques, vue côte à côte.
import * as THREE from 'three';
import { CLAUDE_STYLES, createClaudeStyle } from '../../src/characters/models/claudeStyles.js';

const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);

// éclairage « jeu mobile » : ciel doux, lumière principale chaude, contre-jour froid qui détoure
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a2f55, 1.6));
const key = new THREE.DirectionalLight(0xfff1dc, 2.4); key.position.set(3, 5, 6); scene.add(key);
const rim = new THREE.DirectionalLight(0x9fd8ff, 2.2); rim.position.set(-4, 3, -5); scene.add(rim);
const fill = new THREE.DirectionalLight(0xffc9e8, 0.6); fill.position.set(-5, 1, 3); scene.add(fill);

// socle
function platform() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.22, 0.16, 64), new THREE.MeshStandardMaterial({ color: 0x2a2547, roughness: 0.5, metalness: 0.2 }));
  top.position.y = -0.08; g.add(top);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.17, 0.025, 12, 96), new THREE.MeshBasicMaterial({ color: 0xffc93a }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.002; g.add(ring);
  return g;
}

const models = CLAUDE_STYLES.map((s) => { const m = createClaudeStyle(s); const holder = new THREE.Group(); holder.add(platform(), m.root); scene.add(holder); return { s, m, holder }; });
let current = 0, compare = false, yaw = 0.35, dragging = null, autoSpin = true;

function layout() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  if (compare) {
    // paysage : les 4 en ligne ; portrait (téléphone) : grille 2 × 2
    const grid = camera.aspect < 1.2;
    const sx = grid ? 2.5 : 2.65, sy = 3.1;
    models.forEach((o, i) => {
      o.holder.visible = true;
      o.holder.position.set(grid ? (i % 2 - 0.5) * sx : (i - 1.5) * sx, grid ? (i < 2 ? sy / 2 : -sy / 2) : 0, 0);
    });
    const halfW = grid ? sx / 2 + 1.35 : sx * 2 + 1.3, halfH = grid ? 3.0 : 1.6;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(halfH / t, halfW / t / camera.aspect) + 1;
    camera.position.set(0, 1.25, dist); camera.lookAt(0, 1.15, 0);
  } else {
    models.forEach((o, i) => { o.holder.visible = i === current; o.holder.position.set(0, 0, 0); });
    const dist = Math.max(7.2, 6.4 / Math.min(1, camera.aspect * 1.1));
    camera.position.set(0, 1.55, dist); camera.lookAt(0, 1.2, 0);
  }
  camera.updateProjectionMatrix();
}
new ResizeObserver(layout).observe(canvas);

// faire tourner au doigt
canvas.addEventListener('pointerdown', (e) => { dragging = { x: e.clientX, yaw }; autoSpin = false; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => { if (dragging) yaw = dragging.yaw + (e.clientX - dragging.x) * 0.012; });
const stop = () => { dragging = null; };
canvas.addEventListener('pointerup', stop); canvas.addEventListener('pointercancel', stop);

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clock = new THREE.Clock();
function frame() {
  const t = clock.getElapsedTime(), dt = Math.min(0.05, clock.getDelta());
  if (autoSpin && !reduce) yaw += 0.006;
  for (const o of models) { o.m.root.rotation.y = yaw; if (o.holder.visible) o.m.update(t); }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// interface
const chips = document.getElementById('chips'), info = document.getElementById('info'), cmp = document.getElementById('compare');
chips.innerHTML = CLAUDE_STYLES.map((s, i) => `<button class="chip" id="pick-${s.id}" data-i="${i}" aria-pressed="${i === 0}"><b>${s.letter}</b><span>${s.name}</span></button>`).join('');
function select(i) {
  current = i; compare = false; cmp.setAttribute('aria-pressed', 'false'); cmp.textContent = 'Voir les 4 côte à côte';
  chips.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.i === i)));
  const s = CLAUDE_STYLES[i];
  info.innerHTML = `<h2><span class="letter">${s.letter}</span> ${s.name}</h2><p>${s.blurb}</p>`;
  layout();
}
chips.addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (b) select(+b.dataset.i); });
cmp.addEventListener('click', () => {
  compare = !compare; cmp.setAttribute('aria-pressed', String(compare)); cmp.textContent = compare ? 'Revenir à un seul modèle' : 'Voir les 4 côte à côte';
  chips.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(!compare && +b.dataset.i === current)));
  const nm = (s) => `<b>${s.letter}</b> ${s.name}`;
  info.innerHTML = compare ? `<h2>Les 4 côte à côte</h2><p>${camera.aspect < 1.2 ? `En haut : ${nm(CLAUDE_STYLES[0])} et ${nm(CLAUDE_STYLES[1])}. En bas : ${nm(CLAUDE_STYLES[2])} et ${nm(CLAUDE_STYLES[3])}.` : `De gauche à droite : ${CLAUDE_STYLES.map(nm).join(' · ')}.`}</p>` : info.innerHTML;
  if (!compare) select(current); else layout();
});
const start = location.hash.slice(1);
select(Math.max(0, CLAUDE_STYLES.findIndex((s) => s.id === start)));
window.__styles = { select, setCompare: (v) => { if (v !== compare) cmp.click(); }, setYaw: (v) => { yaw = v; autoSpin = false; } };
frame();
