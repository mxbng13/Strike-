// VUE PIXEL ART ISOMÉTRIQUE : toute la carte dessinée en 2D, en pixels.
// Chaque métier a sa pièce ouverte où l'on voit l'habitant travailler à son bureau, avec une étiquette « 1/1 au poste »
// et des bulles qui disent ce qu'il fait. Même interface que la vue 3D (world.js), pour que le reste du jeu ne change pas.
import * as THREE from 'three';
import { heightAt, forestAt, climateAt, terrainColor, MAP, CAP_Y, LAKE, lakeDist } from './world.js';
import { computeLayout, plotFor, ROADS, polar } from './layout.js';

const HALF = MAP / 2;
const MIN_DIST = 45, MAX_DIST = 12000;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hash = (a, b) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// Couleurs des pièces par secteur : mur, sol
const ROOM = {
  agri: ['#7fbf4a', '#e3f3cf'], agroalim: ['#ef9d55', '#fde6cc'], artisanat: ['#d8794f', '#f8dccd'], textile: ['#ad78c4', '#efe1f5'],
  services: ['#e0779e', '#fbe0ea'], extraction: ['#9a8b7a', '#ece5dc'], industrie: ['#8790a3', '#e4e8ee'], mecanique: ['#6a8cb8', '#dee8f4'],
  energie: ['#dcb93b', '#f8f0c8'], btp: ['#e09a3a', '#f9e6c8'], info: ['#5687ec', '#dde8fc'], finance: ['#cfa23a', '#f6ecd3'],
  admin: ['#7887ee', '#e3e7fc'], droit: ['#9d86cf', '#ece5f7'], com: ['#c065cf', '#f5e0f8'], sciences: ['#45b3a2', '#d8f2ee'],
  sante: ['#e46666', '#fde3e3'], education: ['#eeb057', '#fcefd8'], securite: ['#4769c2', '#dce5f8'], transport: ['#4699d4', '#d9edf9'],
  hotellerie: ['#ee8659', '#fde5da'], arts: ['#9566d6', '#eee3fb'], sport: ['#57bb66', '#dcf4e0'], place: ['#8d97b5', '#eceef6'],
};
const SKIN = ['#f3cfa8', '#e0ac7e', '#c58a5c', '#8d5a3b', '#f7dcc1'];
const HAIR = ['#2b2118', '#5a3a22', '#c48a3a', '#e8d27a', '#8a8a8a', '#a8402a', '#1d1d2b'];
const shadeCache = new Map();
function shade(hex, f) {
  const k = hex + f;
  if (shadeCache.has(k)) return shadeCache.get(k);
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f >= 1) { r += (255 - r) * (f - 1); g += (255 - g) * (f - 1); b += (255 - b) * (f - 1); } else { r *= f; g *= f; b *= f; }
  const v = `rgb(${r | 0},${g | 0},${b | 0})`;
  shadeCache.set(k, v);
  return v;
}

export function createWorld(canvas, places, sites, jobHouses = [], sectors = []) {
  const L = computeLayout(places, sites, sectors);
  const out = canvas.getContext('2d');
  const low = document.createElement('canvas');
  const g = low.getContext('2d');
  let PIX = 3, LW = 300, LH = 200, DPR = 1;
  function resize() {
    PIX = innerWidth < 800 ? 2 : 3;
    DPR = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * DPR); canvas.height = Math.round(innerHeight * DPR);
    LW = Math.ceil(innerWidth / PIX); LH = Math.ceil(innerHeight / PIX);
    low.width = LW; low.height = LH;
  }
  resize();
  addEventListener('resize', resize);

  // ------------------------------------------------------------------ caméra isométrique
  let cx = 0, cz = 140, dist = 700, goalDist = 700, s = 1;
  let flyTo = null, follow = false, zoomAnchor = null;
  const sOf = (d) => LH / d;
  const csx = () => cx - cz, csy = () => (cx + cz) * 0.5;
  function P(x, z, h = 0) { return [((x - z) - csx()) * s + LW / 2, (((x + z) * 0.5 - h) - csy()) * s + LH / 2]; }
  function unproject(px, py) {
    const sx = (px - LW / 2) / s + csx(), sy = (py - LH / 2) / s + csy();
    return { x: sy + sx / 2, z: sy - sx / 2 };
  }
  const toLow = (cxp, cyp) => [cxp * LW / innerWidth, cyp * LH / innerHeight];

  // ------------------------------------------------------------------ dessin de base
  function poly(pts, fill) {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath(); g.fillStyle = fill; g.fill();
  }
  function box(x0, z0, x1, z1, h0, H, color, roof) {
    poly([P(x1, z0, h0), P(x1, z1, h0), P(x1, z1, h0 + H), P(x1, z0, h0 + H)], shade(color, 0.78));
    poly([P(x0, z1, h0), P(x1, z1, h0), P(x1, z1, h0 + H), P(x0, z1, h0 + H)], shade(color, 0.9));
    poly([P(x0, z0, h0 + H), P(x1, z0, h0 + H), P(x1, z1, h0 + H), P(x0, z1, h0 + H)], roof || shade(color, 1.12));
  }
  function person(x, z, h, look, sitting, t, walking) {
    const [px, py] = P(x, z, h);
    const k = Math.max(1, Math.round(s * 0.42));
    const X = Math.round(px), Y = Math.round(py);
    g.fillStyle = 'rgba(40,30,60,0.22)'; g.fillRect(X - 3 * k, Y - k, 6 * k, 2 * k);
    const bob = walking ? Math.round(Math.abs(Math.sin(t * 9)) * k) : 0;
    const legH = sitting ? 2 : 3;
    g.fillStyle = '#3a3550';
    if (walking && Math.sin(t * 9) > 0) { g.fillRect(X - 2 * k, Y - legH * k, k, legH * k); g.fillRect(X + k, Y - (legH - 1) * k, k, (legH - 1) * k); }
    else { g.fillRect(X - 2 * k, Y - legH * k, k, legH * k); g.fillRect(X + k, Y - legH * k, k, legH * k); }
    const top = Y - legH * k - bob;
    g.fillStyle = look.shirt; g.fillRect(X - 2 * k, top - 4 * k, 4 * k, 4 * k);
    g.fillStyle = shade(look.shirt, 0.75); g.fillRect(X - 3 * k, top - 4 * k, k, 3 * k); g.fillRect(X + 2 * k, top - 4 * k, k, 3 * k);
    g.fillStyle = look.skin; g.fillRect(X - 2 * k, top - 8 * k, 4 * k, 4 * k);
    g.fillStyle = look.hair; g.fillRect(X - 2 * k, top - 9 * k, 4 * k, 2 * k); g.fillRect(X - 2 * k, top - 8 * k, k, 2 * k);
    g.fillStyle = '#2a2233'; g.fillRect(X, top - 6 * k, k, k);
  }
  const lookOf = (seed, shirt) => ({ skin: SKIN[(hash(seed, 1) * SKIN.length) | 0], hair: HAIR[(hash(seed, 2) * HAIR.length) | 0], shirt: shirt || shade('#6a7fd0', 0.8 + hash(seed, 3) * 0.5) });

  // ------------------------------------------------------------------ terrain en losanges
  const tileCache = new Map();
  function tileInfo(T, i, j) {
    const key = (T * 8192 + i + 4096) * 8192 + (j + 4096);
    let v = tileCache.get(key);
    if (v) return v;
    const x = (i + 0.5) * T, z = (j + 0.5) * T;
    let h, color, water = false, tree = false;
    if (Math.abs(x) > HALF * 1.02 || Math.abs(z) > HALF * 1.02) { h = -40; }
    else h = heightAt(x, z);
    if (h < 0) {
      water = true;
      const deep = clamp(-h / 40, 0, 1);
      color = `rgb(${(110 - deep * 40) | 0},${(185 - deep * 45) | 0},${(235 - deep * 20) | 0})`;
    } else {
      const hx = heightAt(x + T, z), hz = heightAt(x, z + T);
      const slope = (Math.abs(hx - h) + Math.abs(hz - h)) / T;
      const c = terrainColor(h, slope, x, z, new THREE.Color());
      c.convertLinearToSRGB();
      const light = clamp(1 + (h - heightAt(x - T, z - T)) / T * 0.6, 0.75, 1.25);
      const r = Math.min(255, (c.r * 255 * 0.85 + 38) * light), gg = Math.min(255, (c.g * 255 * 0.85 + 38) * light), b = Math.min(255, (c.b * 255 * 0.85 + 45) * light);
      color = `rgb(${r | 0},${gg | 0},${b | 0})`;
      tree = h > 8 && h < 260 && Math.hypot(x, z) > 820 && forestAt(x, z) > 0.56 && slope < 0.8;
    }
    v = { color, water, tree, h };
    if (tileCache.size > 250000) tileCache.clear();
    tileCache.set(key, v);
    return v;
  }
  function drawTerrain(t) {
    let T = 8;
    while (2 * T * s < 9 && T < 1024) T *= 2;
    const cs = [unproject(0, 0), unproject(LW, 0), unproject(0, LH), unproject(LW, LH)];
    const x0 = Math.min(...cs.map((c) => c.x)), x1 = Math.max(...cs.map((c) => c.x)), z0 = Math.min(...cs.map((c) => c.z)), z1 = Math.max(...cs.map((c) => c.z));
    const i0 = Math.floor(x0 / T) - 1, i1 = Math.ceil(x1 / T) + 1, j0 = Math.floor(z0 / T) - 1, j1 = Math.ceil(z1 / T) + 1;
    const trees = [];
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const a = P(i * T, j * T), b = P((i + 1) * T, j * T), c = P((i + 1) * T, (j + 1) * T), d = P(i * T, (j + 1) * T);
      if (b[0] < -2 || d[0] > LW + 2 || a[1] > LH + 2 || c[1] < -2) continue;
      const ti = tileInfo(T, i, j);
      let col = ti.color;
      if (ti.water && hash(i * 7 + Math.floor(t * 1.2), j) > 0.985) col = '#d6f1ff';
      poly([a, b, c, d], col);
      if (ti.tree && T <= 32 && hash(i, j) > 0.25) trees.push([(i + 0.3 + hash(j, i) * 0.4) * T, (j + 0.3 + hash(i, j + 9) * 0.4) * T, ti.h]);
    }
    for (const [x, z] of trees) {
      const [px, py] = P(x, z, 0);
      const r = Math.max(2, 4.5 * s), k = Math.max(1, s * 1.2);
      g.fillStyle = '#7a5134'; g.fillRect(px - k / 2, py - r * 1.4, k, r * 1.4);
      g.fillStyle = '#3f8f45'; g.beginPath(); g.arc(px, py - r * 1.9, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#5fb35a'; g.beginPath(); g.arc(px - r * 0.3, py - r * 2.15, r * 0.55, 0, Math.PI * 2); g.fill();
    }
  }

  // ------------------------------------------------------------------ sol de la ville : places, routes, quais, pontons
  function strokePath(pts, width, color, dash) {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
    g.lineWidth = width; g.strokeStyle = color; g.setLineDash(dash || []); g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); g.setLineDash([]);
  }
  const roadPts = ROADS.map((a) => { const arr = []; for (let r = 56; r <= 1100; r += 25) arr.push([...polar(r, a), r]); return arr; });
  const quayPts = []; for (let phi = -1.25; phi <= 1.25; phi += 0.03) quayPts.push([LAKE.x + LAKE.rx * Math.sin(phi) * 0.985, LAKE.z - LAKE.rz * Math.cos(phi) * 0.985]);
  function drawGround(t) {
    // anneau du faubourg
    const ringPts = []; for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.06) ringPts.push(P(...polar(168, a)));
    strokePath(ringPts, 36 * s * 0.9, '#d9d0c1');
    // enceinte et place centrale
    const hex = (R) => Array.from({ length: 6 }, (_, i) => P(...polar(R, i * Math.PI / 3)));
    poly(hex(120), '#e4dccd');
    poly(hex(70), '#efe8da');
    poly(hex(62), '#f6f1e6');
    // routes et pont
    for (const rp of roadPts) {
      const pts = rp.map(([x, z]) => P(x, z, heightAt(x, z) < 0 ? 2 : 0));
      strokePath(pts, Math.max(1, 11 * s), '#cbc2b3');
      if (s > 0.5) strokePath(pts, Math.max(1, s * 0.6), '#ffffff', [3 * s, 4 * s]);
    }
    // quai
    strokePath(quayPts.map(([x, z]) => P(x, z, 1)), Math.max(1, 8 * s), '#cfc6b6');
    strokePath(quayPts.map(([x, z]) => P(x, z, 0)), Math.max(1, 2 * s), '#9b9286');
    // pontons
    for (const p of L.piers) {
      const dx = Math.sin(p.a), dz = Math.cos(p.a), px = Math.cos(p.a), pz = -Math.sin(p.a);
      const q = (r, side) => P(dx * r + px * 7 * side, dz * r + pz * 7 * side, 1);
      poly([q(p.r0, -1), q(p.r1, -1), q(p.r1, 1), q(p.r0, 1)], '#b98a5a');
      if (s > 0.8) for (let r = p.r0; r < p.r1; r += 6) strokePath([q(r, -1), q(r, 1)], 1, '#9c7046');
      const [ex, ez] = polar(p.r1 + 26, p.a);
      if (p === L.piers[1]) {   // place flottante
        const circ = []; for (let a = 0; a <= Math.PI * 2; a += 0.2) circ.push(P(ex + Math.cos(a) * 30, ez + Math.sin(a) * 30, 1));
        poly(circ, '#c79a68');
      }
    }
  }

  // ------------------------------------------------------------------ objets : pièces des métiers, lieux, sites
  const objects = [];
  const sectorOf = {};
  for (const sl of L.slots) sectorOf[sl.id] = sl.sector;
  for (const sl of L.slots) objects.push({ kind: 'room', id: sl.id, x: sl.x, z: sl.z, size: sl.size, sector: sl.sector, stilt: sl.stilt, seed: hash(sl.x, sl.z) * 1e6 });
  for (const p of places) {
    const pos = L.placePos[p.id];
    if (!pos) continue;
    objects.push({ kind: 'room', id: p.id, x: pos[0], z: pos[1], size: L.placeSize[p.id], sector: 'place', place: p, seed: hash(pos[0], pos[1]) * 1e6 });
  }
  for (const st of sites) { const pos = L.placePos[st.id]; objects.push({ kind: 'site', id: st.id, x: pos[0], z: pos[1], size: 36, site: st }); }
  objects.push({ kind: 'tower', id: 'tour', x: 0, z: 0, size: 18 });
  const lighthouse = (() => { const p = L.piers[1]; const [ex, ez] = polar(p.r1 + 26, p.a); return { kind: 'lighthouse', x: ex + 12, z: ez, size: 8 }; })();
  objects.push(lighthouse);
  let playerBuildings = [];
  let info = () => ({});
  const nightWindows = [];
  let daylight = 1;

  function drawRoom(o, t) {
    const h = o.size / 2, x0 = o.x - h, z0 = o.z - h, x1 = o.x + h, z1 = o.z + h;
    const [wall, floor] = ROOM[o.sector] || ROOM.place;
    const base = o.stilt ? 2 : 0;
    const px = 2 * o.size * s;
    if (o.stilt) {
      box(x0 - 1.5, z0 - 1.5, x1 + 1.5, z1 + 1.5, -6, 8, '#a8794b');
    }
    if (px < 30) {
      box(x0, z0, x1, z1, base, o.sector === 'place' ? 6 : 4.5, wall, shade(wall, 1.25));
      if (daylight < 0.5) nightWindows.push(P(o.x, z1, base + 2));
      return;
    }
    const WH = o.sector === 'place' ? 5.5 : 4.5, th = 0.7;
    // sol en damier
    const mx = o.x, mz = o.z;
    poly([P(x0, z0, base), P(x1, z0, base), P(x1, z1, base), P(x0, z1, base)], floor);
    poly([P(x0, z0, base), P(mx, z0, base), P(mx, mz, base), P(x0, mz, base)], shade(floor, 0.96));
    poly([P(mx, mz, base), P(x1, mz, base), P(x1, z1, base), P(mx, z1, base)], shade(floor, 0.96));
    // murs du fond
    box(x0, z0, x1, z0 + th, base, WH, wall);
    box(x0, z0 + th, x0 + th, z1, base, WH, wall);
    // fenêtre et tableau
    const wy = base + WH * 0.45;
    poly([P(x0 + o.size * 0.25, z0 + th + 0.05, wy), P(x0 + o.size * 0.55, z0 + th + 0.05, wy), P(x0 + o.size * 0.55, z0 + th + 0.05, wy + WH * 0.4), P(x0 + o.size * 0.25, z0 + th + 0.05, wy + WH * 0.4)], daylight < 0.5 ? '#ffe7a3' : '#cfe9ff');
    if (daylight < 0.5) nightWindows.push(P(x0 + o.size * 0.4, z0 + th, wy + WH * 0.2));
    poly([P(x0 + th + 0.05, z0 + o.size * 0.3, wy), P(x0 + th + 0.05, z0 + o.size * 0.65, wy), P(x0 + th + 0.05, z0 + o.size * 0.65, wy + WH * 0.42), P(x0 + th + 0.05, z0 + o.size * 0.3, wy + WH * 0.42)], '#fbfbfb');
    if (px > 60) for (let k = 0; k < 4; k++) { const [a, b] = P(x0 + th + 0.1, z0 + o.size * (0.34 + k * 0.08), wy + WH * (0.15 + (k % 2) * 0.15)); g.fillStyle = ['#f3a3b4', '#a3d3f3', '#f5d36b', '#9fe0a6'][k]; g.fillRect(a, b, Math.max(1, s * 0.8), Math.max(1, s * 0.6)); }
    // plante
    const [ppx, ppy] = P(x1 - 1.6, z0 + 1.8, base);
    g.fillStyle = '#b8754a'; g.fillRect(ppx - s, ppy - 1.6 * s, 2 * s, 1.6 * s);
    g.fillStyle = '#4e9c4e'; g.beginPath(); g.arc(ppx, ppy - 3.2 * s, 1.8 * s, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6dbb5e'; g.beginPath(); g.arc(ppx - 0.5 * s, ppy - 3.7 * s, 0.9 * s, 0, Math.PI * 2); g.fill();
    // bureaux, écrans, gens
    const st = info(o.id) || {};
    const desks = o.sector === 'place' ? 2 : 1;
    for (let d = 0; d < desks; d++) {
      const dz = desks === 1 ? mz : mz - o.size * 0.18 + d * o.size * 0.36;
      const dxc = mx + 0.5;
      box(dxc - 2.6, dz - 1.3, dxc + 2.6, dz + 1.3, base, 1.3, '#f4f4f6');
      box(dxc - 1.6, dz - 1.1, dxc - 0.2, dz - 0.7, base + 1.3, 1.1, '#3a4260', '#6a7cc4');
      box(dxc + 0.4, dz - 1.1, dxc + 1.8, dz - 0.7, base + 1.3, 1.1, '#3a4260', '#6a7cc4');
      if (st.present && d < (st.count || 1)) person(dxc, dz + 2.2, base + 0.6, lookOf(o.seed + d * 17, shade(wall, 0.85)), true, t, false);
      else box(dxc - 0.7, dz + 1.6, dxc + 0.7, dz + 3, base, 1, '#5a5f78');
    }
    // murs de devant (bas)
    box(x0, z1 - th, x1, z1, base, 1.3, wall);
    box(x1 - th, z0 + th, x1, z1 - th, base, 1.3, wall);
  }
  function drawSite(o, t) {
    const h = 9;
    box(o.x - 14, o.z - 14, o.x + 14, o.z + 14, 0, 0.8, '#b3a58d');
    box(o.x - h, o.z - h - 3, o.x + h - 2, o.z + 2, 0.8, 7, '#d9cbb3', '#c0563d');
    box(o.x + 3, o.z + 2, o.x + 11, o.z + 10, 0.8, 4, '#9c8a6e');
    const [px, py] = P(o.x - 10, o.z + 8, 0.8);
    g.fillStyle = '#6a5a48'; g.fillRect(px - s * 0.4, py - 14 * s, Math.max(1, s * 0.8), 14 * s);
    g.fillStyle = '#ffb84d'; g.fillRect(px, py - 14 * s, 5 * s, 3 * s);
  }
  function drawTower(o, t) {
    const H = 46, w = 8;
    box(-w, -w, w, w, 0, H, '#dfe4ee', '#b9c4dc');
    if (s > 0.35) for (let r = 4; r < H - 2; r += 4) for (let c = -w + 1.5; c < w - 1; c += 3) {
      const [a, b] = P(w, c, r); g.fillStyle = (hash(r, c) > 0.45) !== (daylight < 0.5) ? '#9bb4e8' : '#ffe39a'; g.fillRect(a, b - s, Math.max(1, s), Math.max(1, s * 1.5));
      const [a2, b2] = P(c, w, r); g.fillStyle = (hash(c, r) > 0.45) !== (daylight < 0.5) ? '#9bb4e8' : '#ffe39a'; g.fillRect(a2, b2 - s, Math.max(1, s), Math.max(1, s * 1.5));
    }
    const [tx, ty] = P(0, 0, H);
    g.fillStyle = '#8a92a8'; g.fillRect(tx - s * 0.3, ty - 10 * s, Math.max(1, s * 0.6), 10 * s);
    g.fillStyle = Math.sin(t * 4) > 0 ? '#ff5a5a' : '#b33'; g.fillRect(tx - s, ty - 11 * s, 2 * s, 2 * s);
  }
  function drawLighthouse(o, t) {
    for (let i = 0; i < 5; i++) box(o.x - 3 + i * 0.3, o.z - 3 + i * 0.3, o.x + 3 - i * 0.3, o.z + 3 - i * 0.3, 1 + i * 5, 5, i % 2 ? '#e05a4a' : '#f4f1ea');
    const [lx, ly] = P(o.x, o.z, 27);
    const on = daylight < 0.6 || Math.sin(t * 3) > 0;
    g.fillStyle = on ? '#ffd86b' : '#c9a24a'; g.fillRect(lx - 2 * s, ly - 3 * s, 4 * s, 3 * s);
    if (daylight < 0.6) { const a = t * 0.8; g.fillStyle = 'rgba(255,230,140,0.22)'; g.beginPath(); g.moveTo(lx, ly - s); g.lineTo(lx + Math.cos(a) * 90 * s, ly + Math.sin(a) * 45 * s - 10 * s); g.lineTo(lx + Math.cos(a + 0.18) * 90 * s, ly + Math.sin(a + 0.18) * 45 * s + 10 * s); g.fill(); }
  }
  function drawPlayerBuilding(b, t) {
    const [x, z] = b.pos;
    if (b.stage !== 'actif') {
      const done = Object.values(b.steps || {}).filter(Boolean).length;
      box(x - 11, z - 9, x + 11, z + 9, 0, 1 + done * 2, '#c9c1b2');
      const pts = [[x - 12, z - 10], [x + 12, z - 10], [x + 12, z + 10], [x - 12, z + 10]];
      for (const [px, pz] of pts) { const [a, bb] = P(px, pz, 0), [, c] = P(px, pz, 16); strokePath([[a, bb], [a, c]], Math.max(1, s * 0.5), '#e8a23a'); }
      return;
    }
    const col = b.type === 'usine' ? '#8790a3' : b.type === 'boutique' ? '#e0779e' : '#d8794f';
    box(x - 12, z - 9, x + 12, z + 9, 0, b.type === 'usine' ? 12 : 8, col);
    if (b.type === 'usine') box(x + 6, z - 6, x + 9, z - 3, 12, 10, '#9aa0ad');
  }

  // ------------------------------------------------------------------ vie : passants, bateaux, avatar
  const walkers = Array.from({ length: 46 }, (_, i) => ({ road: i % 3, off: (hash(i, 4) - 0.5) * 8, r: 60 + hash(i, 5) * 420, v: (8 + hash(i, 6) * 10) * (hash(i, 7) > 0.5 ? 1 : -1), seed: i * 31 }));
  const boats = Array.from({ length: 8 }, (_, i) => ({ k: 0.35 + (i % 4) * 0.13, ph: i * 0.9, sp: (0.03 + (i % 3) * 0.015) * (i % 2 ? 1 : -1), sail: i % 3 !== 0, col: ['#ffffff', '#ffd27a', '#ff8f6b', '#9fd6ff'][i % 4] }));
  const avatar = { x: 0, z: 150, mode: 'marche', heading: 0 };
  let dest = null;
  function drawBoat(b, t) {
    const phi = b.ph + t * b.sp;
    const x = LAKE.x + LAKE.rx * b.k * Math.sin(phi), z = LAKE.z + LAKE.rz * b.k * Math.cos(phi) * 0.9;
    box(x - 4, z - 2, x + 4, z + 2, -0.5, 1.6, '#f4f1ea', '#c98d55');
    if (b.sail) { const [a, c] = P(x, z, 1.5), [, top] = P(x, z, 12); g.fillStyle = b.col; g.beginPath(); g.moveTo(a, c); g.lineTo(a, top); g.lineTo(a + 5 * s, c); g.fill(); }
    else box(x - 2, z - 1.5, x + 1, z + 1.5, 1.1, 2, '#5f88c8');
  }
  function drawAvatar(t) {
    const { x, z, mode } = avatar;
    const [px, py] = P(x, z, 0);
    g.strokeStyle = '#ffb84d'; g.lineWidth = Math.max(1, s * 0.5);
    g.beginPath(); g.ellipse(px, py, 5 * s, 2.5 * s, 0, 0, Math.PI * 2); g.stroke();
    if (mode === 'voiture') box(x - 3, z - 2, x + 3, z + 2, 0, 2.2, '#e0524a', '#f07a72');
    if (mode === 'cheval') box(x - 3, z - 1, x + 3, z + 1, 1.5, 2.2, '#8a5a34');
    if (mode === 'drone') { box(x - 2.5, z - 2.5, x + 2.5, z + 2.5, 7, 1.2, '#9aa4b8'); }
    if (s >= 0.6) person(x, z, mode === 'drone' ? 8 : mode === 'cheval' ? 3.5 : mode === 'voiture' ? 1.5 : 0, { skin: '#f3cfa8', hair: '#3a2a1e', shirt: '#ff9f3a' }, false, t, mode === 'marche');
    // repère visible de loin
    if (s < 0.6) { g.fillStyle = '#ff9f3a'; g.beginPath(); g.moveTo(px, py - 1); g.lineTo(px - 3, py - 6); g.lineTo(px + 3, py - 6); g.fill(); g.fillStyle = '#ffffff'; g.fillRect(px - 1, py - 5, 2, 2); }
  }

  // ------------------------------------------------------------------ étiquettes (pleine résolution)
  const labelRects = [];
  let bubble = { id: null, until: 0 };
  function pill(x, y, title, sub, color, emoji) {
    const sc = DPR;
    out.font = `700 ${13 * sc}px Rajdhani, system-ui, sans-serif`;
    const tw = out.measureText(title).width;
    out.font = `600 ${10.5 * sc}px Rajdhani, system-ui, sans-serif`;
    const sw = sub ? out.measureText(sub).width : 0;
    const w = Math.max(tw, sw) + (emoji ? 30 : 16) * sc, h = (sub ? 34 : 24) * sc;
    const bx = x - w / 2, by = y;
    out.fillStyle = 'rgba(40,30,70,0.25)'; out.beginPath(); out.roundRect(bx + 2 * sc, by + 3 * sc, w, h, 9 * sc); out.fill();
    out.fillStyle = color; out.beginPath(); out.roundRect(bx, by, w, h, 9 * sc); out.fill();
    out.strokeStyle = 'rgba(255,255,255,0.65)'; out.lineWidth = 1.5 * sc; out.stroke();
    let tx = bx + 8 * sc;
    if (emoji) { out.font = `${13 * sc}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; out.textBaseline = 'middle'; out.fillText(emoji, tx, by + h / 2); tx += 20 * sc; }
    out.fillStyle = '#ffffff'; out.textBaseline = 'alphabetic';
    out.font = `700 ${13 * sc}px Rajdhani, system-ui, sans-serif`; out.fillText(title, tx, by + (sub ? 15 : 16.5) * sc);
    if (sub) { out.globalAlpha = 0.85; out.font = `600 ${10.5 * sc}px Rajdhani, system-ui, sans-serif`; out.fillText(sub, tx, by + 28 * sc); out.globalAlpha = 1; }
    return { x: bx / sc, y: by / sc, w: w / sc, h: h / sc };
  }
  function drawBubble(x, y, name, text) {
    const sc = DPR;
    out.font = `italic ${13 * sc}px Georgia, serif`;
    const w = Math.max(out.measureText(text).width, 60 * sc) + 28 * sc, h = 46 * sc;
    const bx = x - w / 2, by = y - h - 10 * sc;
    out.fillStyle = 'rgba(40,30,70,0.18)'; out.beginPath(); out.roundRect(bx + 2 * sc, by + 3 * sc, w, h, 10 * sc); out.fill();
    out.fillStyle = 'rgba(255,255,255,0.96)'; out.beginPath(); out.roundRect(bx, by, w, h, 10 * sc); out.fill();
    out.beginPath(); out.moveTo(x - 6 * sc, by + h); out.lineTo(x, by + h + 8 * sc); out.lineTo(x + 6 * sc, by + h); out.fill();
    out.fillStyle = '#5a7be0'; out.beginPath(); out.arc(bx + 14 * sc, by + 14 * sc, 3 * sc, 0, Math.PI * 2); out.fill();
    out.fillStyle = '#8a8fa3'; out.font = `700 ${10 * sc}px Rajdhani, sans-serif`; out.textBaseline = 'alphabetic';
    out.fillText(name.toUpperCase(), bx + 22 * sc, by + 18 * sc);
    out.fillStyle = '#3a3550'; out.font = `italic ${13 * sc}px Georgia, serif`; out.fillText(text, bx + 14 * sc, by + 36 * sc);
  }
  function drawLabels(t) {
    labelRects.length = 0;
    const F = canvas.width / LW;
    const scr = (x, z, h) => { const [a, b] = P(x, z, h); return [a * F, b * F]; };
    const onScreen = ([a, b]) => a > -80 && a < canvas.width + 80 && b > -40 && b < canvas.height + 40;
    // sites (toujours)
    for (const o of objects) if (o.kind === 'site') {
      const p = scr(o.x, o.z + 16, 0);
      if (onScreen(p)) labelRects.push({ id: o.id, ...pill(p[0], p[1], o.site.nom, null, '#c9852f', o.site.emoji) });
    }
    // quartiers (vue moyenne)
    if (s > 0.12 && s < 0.75) for (const d of L.districts) {
      const p = scr(d.pos[0], d.pos[1], 0);
      if (onScreen(p)) pill(p[0], p[1], d.label || d.sec.nom.split(',')[0], null, (ROOM[d.sec.id] || ROOM.place)[0], d.sec.emoji);
    }
    // pièces et lieux (vue proche)
    const visibleRooms = [];
    for (const o of objects) {
      if (o.kind !== 'room') continue;
      const px = 2 * o.size * s;
      const isPlace = o.sector === 'place';
      if (px < (isPlace ? 22 : 34)) continue;
      const p = scr(o.x + o.size / 2, o.z + o.size / 2, 0);
      if (!onScreen(p)) continue;
      const st = info(o.id) || {};
      const title = isPlace ? o.place.nom : (st.title || o.id);
      const sub = isPlace ? (st.open === false ? 'fermé' : 'ouvert') : `${st.present ? st.count : 0}/${st.count || 1} au poste`;
      const col = (ROOM[o.sector] || ROOM.place)[0];
      labelRects.push({ id: o.id, ...pill(p[0], p[1] - 6 * DPR, title, sub, isPlace ? '#7d86a6' : col, st.emoji || (isPlace ? o.place.emoji : null)) });
      if (!isPlace && st.present) visibleRooms.push(o);
    }
    // bulle « ce que fait l'habitant »
    if (s > 0.9 && visibleRooms.length) {
      if (!bubble.id || t > bubble.until || !visibleRooms.includes(bubble.o)) { bubble.o = visibleRooms[(Math.random() * visibleRooms.length) | 0]; bubble.id = bubble.o.id; bubble.until = t + 5; }
      const st = info(bubble.id) || {};
      if (st.name && st.activity) { const p = scr(bubble.o.x, bubble.o.z, 9); drawBubble(p[0], p[1], st.name, st.activity); }
    }
    // avatar : petit repère
    const pa = scr(avatar.x, avatar.z, 12);
    out.fillStyle = '#ff9f3a'; out.font = `700 ${11 * DPR}px Rajdhani, sans-serif`; out.textAlign = 'center';
    if (s > 0.8) out.fillText('▼', pa[0], pa[1]);
    out.textAlign = 'left';
  }

  // ------------------------------------------------------------------ météo et lumière
  let weather = 'soleil';
  const rainDrops = Array.from({ length: 220 }, (_, i) => [hash(i, 1), hash(i, 2), hash(i, 3)]);
  function setTime(hour) { daylight = clamp(Math.sin((hour - 6) / 12 * Math.PI) * 1.4 + 0.15, 0, 1); }
  function setWeather(w) { weather = w; }

  // ------------------------------------------------------------------ boucle
  let last = performance.now(), T0 = performance.now();
  function frame() {
    const now = performance.now(), dt = Math.min((now - last) / 1000, 0.05), t = (now - T0) / 1000;
    last = now;
    // caméra
    const prevS = s;
    dist += (goalDist - dist) * (1 - Math.exp(-dt * 9));
    s = sOf(dist);
    if (zoomAnchor) {
      const w = zoomAnchor.world, [lx, ly] = zoomAnchor.low;
      const now2 = unproject(lx, ly);
      cx += w.x - now2.x; cz += w.z - now2.z;
      if (Math.abs(goalDist - dist) / dist < 0.002) zoomAnchor = null;
    }
    if (follow) { cx += (avatar.x - cx) * (1 - Math.exp(-dt * 6)); cz += (avatar.z - cz) * (1 - Math.exp(-dt * 6)); }
    else if (flyTo) { cx += (flyTo[0] - cx) * (1 - Math.exp(-dt * 4)); cz += (flyTo[1] - cz) * (1 - Math.exp(-dt * 4)); if (Math.hypot(flyTo[0] - cx, flyTo[1] - cz) < 0.5) flyTo = null; }
    const k = keys;
    let fx = 0, fz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) { fx -= 1; fz -= 1; }
    if (k.has('KeyS') || k.has('ArrowDown')) { fx += 1; fz += 1; }
    if (k.has('KeyA') || k.has('ArrowLeft')) { fx -= 1; fz += 1; }
    if (k.has('KeyD') || k.has('ArrowRight')) { fx += 1; fz -= 1; }
    if (fx || fz) { const sp = dist * 0.9 * dt; cx += fx * sp * 0.7; cz += fz * sp * 0.7; flyTo = null; follow = false; }
    cx = clamp(cx, -HALF, HALF); cz = clamp(cz, -HALF, HALF);

    // dessin basse résolution
    g.fillStyle = '#c9b0e3'; g.fillRect(0, 0, LW, LH);
    drawTerrain(t);
    drawGround(t);
    nightWindows.length = 0;
    const view = [unproject(-40, -60), unproject(LW + 40, LH + 120)];
    const items = [];
    const vis = (x, z, m = 60) => { const [a, b] = P(x, z); return a > -m * s - 20 && a < LW + m * s + 20 && b > -m * s * 1.5 - 30 && b < LH + 40 + m * s; };
    for (const o of objects) if (vis(o.x, o.z, o.size + 40)) items.push([o.x + o.z, o]);
    for (const b of playerBuildings) if (vis(b.pos[0], b.pos[1])) items.push([b.pos[0] + b.pos[1], { kind: 'pb', b }]);
    if (s > 0.45) for (const w of walkers) {
      w.r += w.v * dt; if (w.r > 480 || w.r < 60) w.v *= -1;
      const a = ROADS[w.road];
      const x = Math.sin(a) * w.r + Math.cos(a) * w.off, z = Math.cos(a) * w.r - Math.sin(a) * w.off;
      if (heightAt(x, z) < 0) continue;
      if (vis(x, z, 5)) items.push([x + z, { kind: 'walker', x, z, w }]);
    }
    for (const b of boats) { const phi = b.ph + t * b.sp; const x = LAKE.x + LAKE.rx * b.k * Math.sin(phi), z = LAKE.z + LAKE.rz * b.k * Math.cos(phi) * 0.9; if (vis(x, z, 10)) items.push([x + z, { kind: 'boat', b }]); }
    items.push([avatar.x + avatar.z + 0.1, { kind: 'avatar' }]);
    items.sort((p, q) => p[0] - q[0]);
    for (const [, o] of items) {
      if (o.kind === 'room') drawRoom(o, t);
      else if (o.kind === 'site') drawSite(o, t);
      else if (o.kind === 'tower') drawTower(o, t);
      else if (o.kind === 'lighthouse') drawLighthouse(o, t);
      else if (o.kind === 'pb') drawPlayerBuilding(o.b, t);
      else if (o.kind === 'walker') person(o.x, o.z, 0, lookOf(o.w.seed), false, t + o.w.seed, true);
      else if (o.kind === 'boat') drawBoat(o.b, t);
      else if (o.kind === 'avatar') drawAvatar(t);
    }
    if (dest) {
      const [a, b] = P(dest[0], dest[1]);
      const r = (3 + Math.sin(t * 6)) * Math.max(1, s);
      g.strokeStyle = '#5ee3ff'; g.lineWidth = Math.max(1, s * 0.4);
      g.beginPath(); g.moveTo(a, b - r / 2); g.lineTo(a + r, b); g.lineTo(a, b + r / 2); g.lineTo(a - r, b); g.closePath(); g.stroke();
    }
    // nuit
    if (daylight < 1) {
      g.fillStyle = `rgba(24,22,70,${(1 - daylight) * 0.5})`; g.fillRect(0, 0, LW, LH);
      if (daylight < 0.5) { g.fillStyle = '#ffe38a'; for (const [a, b] of nightWindows) g.fillRect(a - Math.max(1, s * 0.6), b - Math.max(1, s * 0.6), Math.max(1, s * 1.2), Math.max(1, s)); }
    }
    if (weather === 'pluie' || weather === 'orage') {
      g.strokeStyle = 'rgba(220,235,255,0.55)'; g.lineWidth = 1;
      g.beginPath();
      for (const [a, b, c] of rainDrops) { const x = (a * LW + t * 30 * c) % LW, y = (b * LH + t * 160 * (0.6 + c)) % LH; g.moveTo(x, y); g.lineTo(x - 2, y + 5); }
      g.stroke();
    }
    // agrandissement en pixels nets
    out.imageSmoothingEnabled = false;
    out.drawImage(low, 0, 0, LW * (canvas.width / LW), LH * (canvas.height / LH));
    drawLabels(t);
    void prevS;
  }

  // ------------------------------------------------------------------ commandes
  const handlers = { tap: () => {}, hover: () => {} };
  function pick(clientX, clientY) {
    for (const r of labelRects) if (clientX >= r.x && clientX <= r.x + r.w && clientY >= r.y && clientY <= r.y + r.h) return r.id;
    const [lx, ly] = toLow(clientX, clientY);
    const w = unproject(lx, ly);
    let best = null, bd = Infinity;
    for (const o of objects) {
      if (o.kind !== 'room' && o.kind !== 'site') continue;
      const half = o.size / 2 + 1;
      // on teste aussi un peu au-dessus (les murs) en remontant le point le long de la verticale
      for (const lift of [0, 3, 6]) {
        const ww = unproject(lx, ly + lift * s);
        if (Math.abs(ww.x - o.x) < half && Math.abs(ww.z - o.z) < half) { const d = Math.hypot(w.x - o.x, w.z - o.z); if (d < bd) { bd = d; best = o.id; } }
      }
    }
    return best;
  }
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
    zoomBy(Math.exp(clamp(dy, -300, 300) * 0.0015), e.clientX, e.clientY);
    flyTo = null;
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  const pointers = new Map();
  let gesture = null, tapStart = null;
  function startGesture() {
    const pts = [...pointers.values()];
    zoomAnchor = null;
    if (!pts.length) { gesture = null; canvas.classList.remove('grabbing'); return; }
    canvas.classList.add('grabbing');
    if (pts.length === 1) { const [lx, ly] = toLow(pts[0].x, pts[0].y); gesture = { type: 'pan', anchor: unproject(lx, ly) }; }
    else { const [a, b] = pts; gesture = { type: 'pinch', span: Math.hypot(a.x - b.x, a.y - b.y) || 1, dist, anchor: unproject(...toLow((a.x + b.x) / 2, (a.y + b.y) / 2)) }; }
  }
  function panTo(anchor, cxp, cyp) {
    const [lx, ly] = toLow(cxp, cyp);
    const w = unproject(lx, ly);
    cx += anchor.x - w.x; cz += anchor.z - w.z;
  }
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    tapStart = pointers.size === 1 && e.button === 0 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
    startGesture();
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) { if (e.pointerType === 'mouse') { const id = pick(e.clientX, e.clientY); handlers.hover(id, e.clientX, e.clientY); canvas.style.cursor = id ? 'pointer' : ''; } return; }
    p.x = e.clientX; p.y = e.clientY;
    if (tapStart && Math.hypot(p.x - tapStart.x, p.y - tapStart.y) > 7) tapStart = null;
    if (!gesture) return;
    if (gesture.type === 'pan') { if (!tapStart) { panTo(gesture.anchor, p.x, p.y); flyTo = null; follow = false; } }
    else {
      const [a, b] = [...pointers.values()];
      const span = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      dist = goalDist = clamp(gesture.dist * gesture.span / span, MIN_DIST, MAX_DIST);
      s = sOf(dist);
      panTo(gesture.anchor, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
  });
  const endPointer = (e) => {
    if (tapStart && pointers.size === 1 && performance.now() - tapStart.t < 450) {
      const id = pick(e.clientX, e.clientY);
      if (id) handlers.tap({ placeId: id });
      else { const w = unproject(...toLow(e.clientX, e.clientY)); handlers.tap({ x: w.x, z: w.z }); }
    }
    tapStart = null;
    if (pointers.delete(e.pointerId)) startGesture();
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', (e) => { tapStart = null; if (pointers.delete(e.pointerId)) startGesture(); });
  const keys = new Set();
  addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    keys.add(e.code);
    if (e.code === 'Equal' || e.code === 'NumpadAdd') zoomBy(0.6);
    if (e.code === 'Minus' || e.code === 'Digit6' || e.code === 'NumpadSubtract') zoomBy(1.65);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  function zoomBy(f, cxp, cyp) {
    goalDist = clamp(goalDist * f, MIN_DIST, MAX_DIST);
    if (cxp !== undefined) { const lowp = toLow(cxp, cyp); zoomAnchor = { low: lowp, world: unproject(...lowp) }; } else zoomAnchor = null;
  }
  const LOG_MIN = Math.log(MIN_DIST), LOG_MAX = Math.log(MAX_DIST);

  return {
    frame, heightAt, climateAt, placePos: L.placePos, siteSpots: L.siteSpots, plotFor, jobFront: L.jobFront,
    updateBuildings(list) { playerBuildings = list || []; },
    setInfo(fn) { info = fn; },
    get dist() { return dist; }, set dist(v) { dist = goalDist = v; s = sOf(v); },
    get yaw() { return Math.PI / 4; }, get target() { return { x: cx, y: 0, z: cz }; },
    zoomT: () => (Math.log(dist) - LOG_MIN) / (LOG_MAX - LOG_MIN),
    zoomBy,
    setAvatar(x, z, mode, heading) { avatar.x = x; avatar.z = z; avatar.mode = mode; avatar.heading = heading; },
    setDestination(x, z) { dest = x === null ? null : [x, z]; },
    setTime, setWeather,
    onTap(f) { handlers.tap = f; }, onHover(f) { handlers.hover = f; },
    flyTo(x, z, d) { flyTo = [x, z]; follow = false; zoomAnchor = null; if (d) goalDist = d; },
    follow(on) { follow = on; if (on) { flyTo = null; zoomAnchor = null; } },
    resetNorth() {},
    home() { flyTo = [0, 160]; goalDist = 700; follow = false; },
    viewCorners() { return [[0, 0], [LW, 0], [LW, LH], [0, LH]].map(([a, b]) => { const w = unproject(a, b); return [w.x, w.z]; }); },
  };
}
