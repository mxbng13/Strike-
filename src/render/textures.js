// Textures générées procéduralement (canvas) et mises en cache.
import * as THREE from 'three';

let glow = null;
export function glowTexture() {
  if (glow) return glow;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glow = new THREE.CanvasTexture(c);
  glow.colorSpace = THREE.SRGBColorSpace;
  return glow;
}

// Cercle runique pour le piédestal.
export function runeCircleTexture() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.translate(S / 2, S / 2);
  g.strokeStyle = 'rgba(160,220,255,0.95)';
  g.shadowColor = '#7fd6ff';
  g.shadowBlur = 12;
  const ring = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
  ring(240, 6); ring(222, 2); ring(150, 3); ring(140, 1.5);
  // Glyphes
  g.font = 'bold 26px serif';
  g.fillStyle = 'rgba(190,235,255,0.95)';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    g.save();
    g.rotate(a);
    g.fillText(glyphs[i % glyphs.length], 0, -186);
    g.restore();
  }
  // Étoile à 6 branches
  g.lineWidth = 2.5;
  for (let k = 0; k < 2; k++) {
    g.beginPath();
    for (let i = 0; i <= 3; i++) {
      const a = (i / 3) * Math.PI * 2 + k * Math.PI / 3 - Math.PI / 2;
      const x = Math.cos(a) * 140, y = Math.sin(a) * 140;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Texture « cristal à facettes » (tenue Diamant) : triangles clairs aux reflets irisés, arêtes blanches.
const crystalCache = {};
export function crystalTexture(dark = false) {
  const key = dark ? 'dark' : 'light';
  if (crystalCache[key]) return crystalCache[key];
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  let seed = dark ? 7 : 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const tints = dark
    ? ['#2c313b', '#3d4350', '#555c6b', '#22262e', '#6b7385', '#8a93a6']
    : ['#ffffff', '#cfe3f7', '#9fbad6', '#e6f1ff', '#b8c9f0', '#a6e3ee', '#f2d8ff', '#ffe9c2', '#7f9ec2', '#dbe8f5'];
  g.fillStyle = tints[1];
  g.fillRect(0, 0, S, S);
  // grille de points déformée -> triangles
  const N = 6, pts = [];
  for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) {
    const edge = x === 0 || y === 0 || x === N || y === N;
    pts.push([(x + (edge ? 0 : (rnd() - 0.5) * 0.7)) * S / N, (y + (edge ? 0 : (rnd() - 0.5) * 0.7)) * S / N]);
  }
  const P = (x, y) => pts[y * (N + 1) + x];
  g.lineWidth = 1.5;
  g.strokeStyle = dark ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.9)';
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    for (const tri of [[P(x, y), P(x + 1, y), P(x + 1, y + 1)], [P(x, y), P(x + 1, y + 1), P(x, y + 1)]]) {
      g.beginPath();
      g.moveTo(...tri[0]); g.lineTo(...tri[1]); g.lineTo(...tri[2]); g.closePath();
      g.fillStyle = tints[Math.floor(rnd() * tints.length)];
      g.fill();
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  crystalCache[key] = tex;
  return tex;
}

// Étoile scintillante à 4 branches (éclats de la tenue Diamant).
let sparkle = null;
export function sparkleTexture() {
  if (sparkle) return sparkle;
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, 'rgba(230,245,255,.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#fff';
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 4 : 31;
    g.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r);
  }
  g.fill();
  sparkle = new THREE.CanvasTexture(c);
  sparkle.colorSpace = THREE.SRGBColorSpace;
  return sparkle;
}
