// Carte du monde : terres réelles (Natural Earth), musées, routes des casses. Glisser, molette, pincer.
import { S, worksOf, ownerInfo } from './state.js';
import { ART, imageBitmap } from './catalog.js';
import { CITIES } from './places.js';
import { clamp, now } from './util.js';

const K = 10;                       // unités monde par degré
const WW = 360 * K, WH = 180 * K;
export const project = (lat, lon) => [(lon + 180) * K, (90 - lat) * K];
export const unproject = (x, y) => [90 - y / K, x / K - 180];

const C = {
  sea: '#12232a', seaDeep: '#0d1a20', grid: 'rgba(201,178,120,0.10)', land: '#c9b994', landEdge: '#3a3022',
  border: 'rgba(58,48,34,0.35)', city: '#2b241a', cityLabel: 'rgba(40,32,22,0.85)', seaLabel: 'rgba(201,178,120,0.28)',
  inst: '#efe6d2', rival: '#9e2b2b', me: '#e2b85a', ink: '#1a140d', route: '#ff5b4a', mine: '#e2b85a',
};

let cv, ctx, W = 0, H = 0, dpr = 1;
let land = null, borders = null, polys = [];
const cam = { x: project(30, 10)[0], y: project(30, 10)[1], z: 0.5 };
let anim = null;
let placing = false;
let selected = null;
let markers = [];
let drawn = [];
const routes = [];
let texture = null;
let dirty = true;
export const mapEvents = { onSelect: null, onPlace: null };

export async function initMap(canvas) {
  cv = canvas; ctx = cv.getContext('2d');
  const [l, b] = await Promise.all([
    fetch('data/land.json').then(r => r.json()),
    fetch('data/borders.json').then(r => r.ok ? r.json() : []).catch(() => []),
  ]);
  polys = l.map(unwrap);
  land = new Path2D();
  for (const p of polys) for (const off of [0, -360, 360]) {
    if (off && !(p.minLon + off < 180 && p.maxLon + off > -180)) continue;
    addRing(land, p.pts, off);
  }
  borders = new Path2D();
  for (const line of b) {
    for (let i = 0; i < line.length; i += 2) {
      const [x, y] = project(line[i + 1], line[i]);
      if (i === 0 || Math.abs(line[i] - line[i - 2]) > 90) borders.moveTo(x, y); else borders.lineTo(x, y);
    }
  }
  makeTexture();
  resize();
  addEventListener('resize', resize);
  bindInput();
  cam.z = minZ();
  requestAnimationFrame(frame);
}
function unwrap(flat) {
  const pts = []; let prev = null, shift = 0, minLon = 999, maxLon = -999;
  for (let i = 0; i < flat.length; i += 2) {
    let lon = flat[i]; const lat = flat[i + 1];
    if (prev !== null) { const d = lon + shift - prev; if (d > 180) shift -= 360; else if (d < -180) shift += 360; }
    lon += shift; prev = lon;
    pts.push(lon, lat); minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
  }
  return { pts, minLon, maxLon };
}
function addRing(path, pts, off) {
  for (let i = 0; i < pts.length; i += 2) {
    const [x, y] = project(pts[i + 1], pts[i] + off);
    if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
  }
  path.closePath();
}
function makeTexture() {
  const t = document.createElement('canvas'); t.width = t.height = 160;
  const g = t.getContext('2d');
  const img = g.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = Math.random();
    img.data[i] = 60; img.data[i + 1] = 45; img.data[i + 2] = 25; img.data[i + 3] = n < 0.5 ? n * 40 : 0;
  }
  g.putImageData(img, 0, 0);
  texture = ctx.createPattern(t, 'repeat');
}

export function landAt(lat, lon) {
  for (const p of polys) {
    for (const off of [0, -360, 360]) {
      const L = lon - off;
      if (L < p.minLon || L > p.maxLon) continue;
      let inside = false; const a = p.pts;
      for (let i = 0, j = a.length - 2; i < a.length; j = i, i += 2) {
        const xi = a[i], yi = a[i + 1], xj = a[j], yj = a[j + 1];
        if ((yi > lat) !== (yj > lat) && L < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) return true;
    }
  }
  return false;
}
export function nearestCity(lat, lon) {
  let best = null, bd = 1e9;
  for (const c of CITIES) { const d = (c[1] - lat) ** 2 + ((c[2] - lon) * Math.cos(lat * Math.PI / 180)) ** 2; if (d < bd) { bd = d; best = c; } }
  return best ? best[0] : '';
}

function resize() {
  dpr = Math.min(2, devicePixelRatio || 1);
  W = cv.clientWidth; H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  cam.z = Math.max(cam.z, minZ());
  dirty = true;
}
const minZ = () => Math.max(W / WW, H / (WH * 0.8));
const maxZ = 70;
function clampCam() {
  cam.z = clamp(cam.z, minZ(), maxZ);
  const hw = W / 2 / cam.z, hh = H / 2 / cam.z;
  cam.x = clamp(cam.x, hw, WW - hw);
  cam.y = clamp(cam.y, Math.min(5 * K + hh, WH / 2), Math.max(152 * K - hh, WH / 2));
}
const toScreen = (x, y) => [(x - cam.x) * cam.z + W / 2, (y - cam.y) * cam.z + H / 2];
const toWorld = (sx, sy) => [(sx - W / 2) / cam.z + cam.x, (sy - H / 2) / cam.z + cam.y];

export function flyTo(lat, lon, z = 6, ms = 900) {
  const [x, y] = project(lat, lon);
  anim = { t0: now(), ms, from: { ...cam }, to: { x, y, z: clamp(z, minZ(), maxZ) } };
}
export function zoomBy(f) { anim = { t0: now(), ms: 300, from: { ...cam }, to: { x: cam.x, y: cam.y, z: clamp(cam.z * f, minZ(), maxZ) } }; }
export function setPlacing(v) { placing = v; cv.classList.toggle('placing', v); dirty = true; }
export function select(id) { selected = id; dirty = true; }
export function addRoute(fromId, toId, color = C.route, ms = 4000, dashed = true) {
  routes.push({ fromId, toId, color, until: now() + ms, dashed });
}
export function clearRoutes() { routes.length = 0; }
export const markDirty = () => { dirty = true; };

// ---------- marqueurs ----------
function buildMarkers() {
  const m = [];
  for (const i of Object.values(S.inst)) m.push({ id: i.id, kind: 'inst', lat: i.lat, lon: i.lon, name: i.name, lvl: i.lvl, pri: i.lvl + 2 });
  for (const r of S.rivals) m.push({ id: r.id, kind: 'rival', lat: r.lat, lon: r.lon, name: r.name, lvl: r.lvl, pri: r.lvl + 1 });
  if (S.me.placed) m.push({ id: 'me', kind: 'me', lat: S.me.lat, lon: S.me.lon, name: S.me.name, lvl: S.me.lvl, pri: 99 });
  for (const x of m) [x.wx, x.wy] = project(x.lat, x.lon);
  m.sort((a, b) => b.pri - a.pri);
  return m;
}

function temple(x, y, s, fill, edge) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath(); ctx.ellipse(0, s * 0.62, s * 0.9, s * 0.22, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
  ctx.fillStyle = fill; ctx.strokeStyle = edge; ctx.lineWidth = Math.max(1, s / 9);
  ctx.beginPath(); ctx.moveTo(-s * 0.8, -s * 0.25); ctx.lineTo(0, -s * 0.75); ctx.lineTo(s * 0.8, -s * 0.25); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillRect(-s * 0.8, s * 0.38, s * 1.6, s * 0.2); ctx.strokeRect(-s * 0.8, s * 0.38, s * 1.6, s * 0.2);
  ctx.fillRect(-s * 0.72, -s * 0.25, s * 1.44, s * 0.12);
  for (let i = 0; i < 4; i++) { const cx = -s * 0.56 + i * s * 0.373; ctx.fillRect(cx - s * 0.08, -s * 0.12, s * 0.16, s * 0.5); }
  ctx.restore();
}

function frame() {
  requestAnimationFrame(frame);
  if (anim) {
    const k = clamp((now() - anim.t0) / anim.ms, 0, 1), e = 1 - Math.pow(1 - k, 3);
    const lz = Math.log(anim.from.z) + (Math.log(anim.to.z) - Math.log(anim.from.z)) * e;
    cam.z = Math.exp(lz); cam.x = anim.from.x + (anim.to.x - anim.from.x) * e; cam.y = anim.from.y + (anim.to.y - anim.from.y) * e;
    if (k >= 1) anim = null;
    dirty = true;
  }
  const live = routes.some(r => r.until > now()) || placing || S?.me?.placed;
  if (!dirty && !live) return;
  dirty = false;
  for (let i = routes.length - 1; i >= 0; i--) if (routes[i].until < now()) routes.splice(i, 1);
  clampCam();
  draw();
}

function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, C.sea); g.addColorStop(1, C.seaDeep);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // graticule
  const step = cam.z > 8 ? 5 : cam.z > 2 ? 10 : 15;
  ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.beginPath();
  for (let lon = -180; lon <= 180; lon += step) { const [sx] = toScreen((lon + 180) * K, 0); if (sx > -2 && sx < W + 2) { ctx.moveTo(sx, 0); ctx.lineTo(sx, H); } }
  for (let lat = -80; lat <= 80; lat += step) { const [, sy] = toScreen(0, (90 - lat) * K); if (sy > -2 && sy < H + 2) { ctx.moveTo(0, sy); ctx.lineTo(W, sy); } }
  ctx.stroke();

  // terres
  ctx.save();
  ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (W / 2 - cam.x * cam.z), dpr * (H / 2 - cam.y * cam.z));
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 14 * dpr; ctx.shadowOffsetY = 3 * dpr;
  ctx.fillStyle = C.land; ctx.fill(land, 'nonzero');
  ctx.shadowColor = 'transparent';
  ctx.save(); ctx.clip(land); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = texture; ctx.fillRect(0, 0, W, H); ctx.restore();
  ctx.lineWidth = 0.9 / cam.z; ctx.strokeStyle = C.border; if (cam.z > 0.9) ctx.stroke(borders);
  ctx.lineWidth = 1.1 / cam.z; ctx.strokeStyle = C.landEdge; ctx.stroke(land);
  ctx.restore();

  // océans (étiquettes)
  ctx.font = `italic ${Math.round(clamp(cam.z * 14, 11, 22))}px "Bodoni Moda", Georgia, serif`;
  ctx.fillStyle = C.seaLabel; ctx.textAlign = 'center';
  if (cam.z < 3) for (const [n, lat, lon] of [['Océan Atlantique', 25, -40], ['Océan Pacifique', 5, -140], ['Océan Indien', -20, 78], ['Océan Austral', -55, 20], ['Océan Arctique', 79, 0], ['Méditerranée', 35.2, 18]]) {
    if (n === 'Méditerranée' && cam.z < 1.5) continue;
    const [sx, sy] = toScreen(...project(lat, lon)); ctx.fillText(n.toUpperCase().split('').join(' '), sx, sy);
  }

  // villes
  const labels = [];
  const fits = r => !labels.some(o => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y);
  const showRank = cam.z > 2.6 ? 3 : cam.z > 1.3 ? 2 : cam.z > 0.75 ? 1 : 0;
  ctx.textAlign = 'left';
  ctx.font = `italic 12px "Bodoni Moda", Georgia, serif`;
  for (const c of CITIES) {
    if (c[3] > showRank) continue;
    const [sx, sy] = toScreen(...project(c[1], c[2]));
    if (sx < -50 || sx > W + 50 || sy < -20 || sy > H + 20) continue;
    ctx.fillStyle = C.city; ctx.beginPath(); ctx.arc(sx, sy, 2, 0, 7); ctx.fill();
    const w = ctx.measureText(c[0]).width;
    const r = { x: sx + 4, y: sy - 12, w: w + 2, h: 14 };
    if (fits(r)) { labels.push(r); ctx.fillStyle = C.cityLabel; ctx.fillText(c[0], sx + 5, sy - 3); }
  }

  // marqueurs avec regroupement à l'écran
  markers = buildMarkers();
  drawn = [];
  const R = cam.z < 1.5 ? 24 : 18;
  for (const m of markers) {
    [m.sx, m.sy] = toScreen(m.wx, m.wy);
    if (m.sx < -40 || m.sx > W + 40 || m.sy < -40 || m.sy > H + 40) continue;
    const host = drawn.find(d => Math.hypot(d.sx - m.sx, d.sy - m.sy) < R * 1.25);
    if (host && m.kind !== 'me') { host.count++; host.members.push(m); continue; }
    m.count = 1; m.members = [m]; drawn.push(m);
  }

  // routes
  for (const r of routes) {
    const a = markers.find(m => m.id === r.fromId), b = markers.find(m => m.id === r.toId);
    if (!a || !b) continue;
    const [ax, ay] = toScreen(a.wx, a.wy), [bx, by] = toScreen(b.wx, b.wy);
    const mx = (ax + bx) / 2, my = (ay + by) / 2 - Math.hypot(bx - ax, by - ay) * 0.25;
    ctx.save(); ctx.strokeStyle = r.color; ctx.lineWidth = 2.5; ctx.setLineDash(r.dashed ? [8, 7] : []); ctx.lineDashOffset = -now() / 30;
    ctx.shadowColor = r.color; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by); ctx.stroke(); ctx.restore();
    const k = (now() / 1600) % 1, ik = 1 - k;
    const px = ik * ik * ax + 2 * ik * k * mx + k * k * bx, py = ik * ik * ay + 2 * ik * k * my + k * k * by;
    ctx.fillStyle = r.color; ctx.beginPath(); ctx.arc(px, py, 4, 0, 7); ctx.fill();
  }

  for (const m of drawn) {
    const s = m.kind === 'me' ? 15 : clamp(8 + m.lvl * 0.9 + Math.log2(cam.z + 1) * 1.5, 8, 18);
    if (m.kind === 'me') {
      const p = (now() % 2000) / 2000;
      ctx.strokeStyle = `rgba(226,184,90,${1 - p})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(m.sx, m.sy, s + p * 26, 0, 7); ctx.stroke();
    }
    if (selected && m.members.some(x => x.id === selected)) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(m.sx, m.sy, s + 9, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
    temple(m.sx, m.sy, s, m.kind === 'me' ? C.me : m.kind === 'rival' ? C.rival : C.inst, C.ink);
    if (m.count > 1) {
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(m.sx + s * 0.9, m.sy - s * 0.7, 9, 0, 7); ctx.fill();
      ctx.fillStyle = '#efe6d2'; ctx.font = '600 10px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText(m.count, m.sx + s * 0.9, m.sy - s * 0.7 + 3.5);
    }
    // étiquette
    const big = m.kind === 'me' || cam.z > 2.2 || (cam.z > 0.9 && m.lvl >= 9) || (cam.z > 1.4 && m.lvl >= 6);
    if (!big) continue;
    const label = m.count > 1 ? `${m.name} +${m.count - 1}` : m.name;
    ctx.font = `${m.kind === 'me' ? 700 : 600} 12px "Instrument Sans", system-ui, sans-serif`;
    const w = ctx.measureText(label).width + 12;
    const r = { x: m.sx - w / 2, y: m.sy + s * 0.7 + 3, w, h: 18 };
    if (m.kind !== 'me' && !fits(r)) continue;
    labels.push(r);
    ctx.fillStyle = m.kind === 'me' ? C.me : m.kind === 'rival' ? 'rgba(90,20,20,0.92)' : 'rgba(20,16,10,0.85)';
    roundRect(r.x, r.y, r.w, r.h, 9); ctx.fill();
    ctx.fillStyle = m.kind === 'me' ? C.ink : '#efe6d2'; ctx.textAlign = 'center';
    ctx.fillText(label, m.sx, r.y + 13);
  }

  // vignettes des œuvres autour du musée sélectionné quand on zoome
  if (cam.z > 5) for (const m of drawn) if (m.id === selected || m.kind === 'me') thumbs(m);

  if (placing) {
    ctx.fillStyle = 'rgba(226,184,90,0.08)'; ctx.fillRect(0, 0, W, H);
  }
}
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }

const thumbCache = new Map();
function thumbs(m) {
  const ids = m.id === 'me' ? S.items.filter(i => i.wall).map(i => i.aid) : worksOf(m.id);
  const list = ids.slice(0, 8);
  const rad = 62;
  list.forEach((aid, i) => {
    const ang = -Math.PI / 2 + (i - (list.length - 1) / 2) * 0.55;
    const x = m.sx + Math.cos(ang) * rad * 1.3, y = m.sy + Math.sin(ang) * rad - 8;
    let im = thumbCache.get(aid);
    if (im === undefined) { thumbCache.set(aid, null); imageBitmap(ART[aid]).then(b => { thumbCache.set(aid, b); dirty = true; }); im = null; }
    const ar = ART[aid].ar || 0.8, hgt = 34, wid = clamp(hgt * ar, 22, 56);
    ctx.fillStyle = '#b8902f'; ctx.fillRect(x - wid / 2 - 3, y - hgt / 2 - 3, wid + 6, hgt + 6);
    ctx.fillStyle = '#1a140d'; ctx.fillRect(x - wid / 2, y - hgt / 2, wid, hgt);
    if (im) ctx.drawImage(im, x - wid / 2, y - hgt / 2, wid, hgt);
  });
}

// ---------- entrées ----------
function bindInput() {
  const pts = new Map();
  let downAt = null, moved = 0, pinch = null, lastTap = 0;
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, [e.offsetX, e.offsetY]);
    anim = null;
    if (pts.size === 1) { downAt = [e.offsetX, e.offsetY]; moved = 0; }
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: cam.z, c: toWorld((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) };
    }
  });
  cv.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId);
    pts.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      cam.z = clamp(pinch.z * d / pinch.d, minZ(), maxZ);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      cam.x = pinch.c[0] - (mx - W / 2) / cam.z; cam.y = pinch.c[1] - (my - H / 2) / cam.z;
      moved = 99; dirty = true; return;
    }
    const dx = e.offsetX - prev[0], dy = e.offsetY - prev[1];
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved > 6) { cam.x -= dx / cam.z; cam.y -= dy / cam.z; dirty = true; cv.classList.add('dragging'); }
  });
  const up = e => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    cv.classList.remove('dragging');
    if (pts.size === 0 && moved <= 6 && downAt) {
      const t = now();
      if (t - lastTap < 300) { zoomAt(e.offsetX, e.offsetY, 2.2); lastTap = 0; return; }
      lastTap = t;
      tap(e.offsetX, e.offsetY);
    }
    downAt = null;
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)), true);
  }, { passive: false });
}
function zoomAt(sx, sy, f, instant) {
  const [wx, wy] = toWorld(sx, sy);
  const z = clamp(cam.z * f, minZ(), maxZ);
  const to = { z, x: wx - (sx - W / 2) / z, y: wy - (sy - H / 2) / z };
  if (instant) { Object.assign(cam, to); anim = null; dirty = true; } else anim = { t0: now(), ms: 280, from: { ...cam }, to };
}
function tap(sx, sy) {
  if (placing) {
    const [lat, lon] = unproject(...toWorld(sx, sy));
    mapEvents.onPlace?.(lat, lon, landAt(lat, lon));
    return;
  }
  let best = null, bd = 26;
  for (const m of drawn) { const d = Math.hypot(m.sx - sx, m.sy - sy); if (d < bd) { bd = d; best = m; } }
  if (!best) { mapEvents.onSelect?.(null); return; }
  if (best.count > 1 && cam.z < maxZ / 2) {
    // un groupe : on zoome dessus ; si les musées sont au même endroit, on ouvre la liste
    const spread = Math.max(...best.members.map(x => Math.hypot(x.wx - best.wx, x.wy - best.wy)));
    if (spread * cam.z * 4 > 12) { const [lat, lon] = unproject(best.wx, best.wy); flyTo(lat, lon, Math.min(maxZ, cam.z * 3.5), 600); return; }
    mapEvents.onSelect?.(best.members.map(m => m.id));
    return;
  }
  mapEvents.onSelect?.([best.id]);
}
export { ownerInfo };
