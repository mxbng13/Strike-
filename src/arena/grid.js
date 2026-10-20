// Cartes de l'arène : plan (grille de tuiles), collisions, lignes de tir et chemins (A*).
// Le monde est en (x, z) sur le plan du sol ; une tuile = TILE unités. Origine au centre de la carte.
// La carte active se choisit avec useMap(id) (les plans sont dans arena/maps.js).
//
// Légende :  . sol   - chemin   B buisson (cache)   W mur   C caisse   R rocher
//            w eau (on ne peut pas la traverser, mais les tirs passent au-dessus)
//            P départ du joueur   E départ de l'ennemi
import { ARENA_MAPS } from './maps.js';

export const TILE = 1.4;
export let LAYOUT = ARENA_MAPS.map1.layout;
export let COLS = LAYOUT[0].length;
export let ROWS = LAYOUT.length;
export let WIDTH = COLS * TILE;
export let DEPTH = ROWS * TILE;
export let MAP_ID = 'map1';
/** Active une carte (toutes les fonctions de ce module travaillent ensuite sur elle). */
export function useMap(id) {
  const m = ARENA_MAPS[id] ?? ARENA_MAPS.map1;
  MAP_ID = ARENA_MAPS[id] ? id : 'map1';
  LAYOUT = m.layout; COLS = LAYOUT[0].length; ROWS = LAYOUT.length; WIDTH = COLS * TILE; DEPTH = ROWS * TILE;
  return m;
}
const SOLID = new Set(['W', 'C', 'R']);

export const tileAt = (c, r) => (c < 0 || r < 0 || c >= COLS || r >= ROWS ? '#' : LAYOUT[r][c]);
/** Bloque les tirs et la vue (murs, caisses, rochers, bords). */
export const isSolid = (c, r) => { const t = tileAt(c, r); return t === '#' || SOLID.has(t); };
/** Bloque les déplacements (comme isSolid, plus l'eau). */
export const blocksMove = (c, r) => isSolid(c, r) || tileAt(c, r) === 'w';
export const toCell = (x, z) => [Math.floor((x + WIDTH / 2) / TILE), Math.floor((z + DEPTH / 2) / TILE)];
export const cellCenter = (c, r) => [(c + 0.5) * TILE - WIDTH / 2, (r + 0.5) * TILE - DEPTH / 2];
export const inBush = (x, z) => { const [c, r] = toCell(x, z); return tileAt(c, r) === 'B'; };

export function findTiles(ch) {
  const out = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (LAYOUT[r][c] === ch) out.push([c, r]);
  return out;
}
export const spawnOf = (ch) => cellCenter(...findTiles(ch)[0]);

/** Pousse un cercle (x, z, rayon) hors des tuiles solides et des bords. Renvoie la position corrigée. */
export function collide(x, z, rad) {
  const [c0, r0] = toCell(x - rad, z - rad), [c1, r1] = toCell(x + rad, z + rad);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    if (!blocksMove(c, r)) continue;
    const minX = c * TILE - WIDTH / 2, minZ = r * TILE - DEPTH / 2;
    const px = Math.max(minX, Math.min(x, minX + TILE)), pz = Math.max(minZ, Math.min(z, minZ + TILE));
    let dx = x - px, dz = z - pz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= rad * rad) continue;
    if (d2 > 1e-9) { const d = Math.sqrt(d2); x = px + (dx / d) * rad; z = pz + (dz / d) * rad; }
    else {
      // centre à l'intérieur de la tuile : sortie par le côté le plus proche
      const cx = minX + TILE / 2, cz = minZ + TILE / 2;
      dx = x - cx; dz = z - cz;
      if (Math.abs(dx) > Math.abs(dz)) x = cx + Math.sign(dx || 1) * (TILE / 2 + rad); else z = cz + Math.sign(dz || 1) * (TILE / 2 + rad);
    }
  }
  return [x, z];
}

/**
 * Lance un rayon sur le plan (DDA sur la grille). Renvoie la distance jusqu'au premier obstacle solide
 * (au plus `maxDist`). Les buissons ne bloquent pas.
 */
export function raycast(x, z, dx, dz, maxDist, blocker = isSolid) {
  const len = Math.hypot(dx, dz) || 1;
  dx /= len; dz /= len;
  const gx = (x + WIDTH / 2) / TILE, gz = (z + DEPTH / 2) / TILE;
  let c = Math.floor(gx), r = Math.floor(gz);
  if (blocker(c, r)) return 0;
  const stepC = dx > 0 ? 1 : -1, stepR = dz > 0 ? 1 : -1;
  const tDeltaC = dx !== 0 ? Math.abs(TILE / dx) : Infinity, tDeltaR = dz !== 0 ? Math.abs(TILE / dz) : Infinity;
  let tC = dx !== 0 ? ((dx > 0 ? c + 1 - gx : gx - c) * TILE) / Math.abs(dx) : Infinity;
  let tR = dz !== 0 ? ((dz > 0 ? r + 1 - gz : gz - r) * TILE) / Math.abs(dz) : Infinity;
  for (;;) {
    let t;
    if (tC < tR) { t = tC; tC += tDeltaC; c += stepC; } else { t = tR; tR += tDeltaR; r += stepR; }
    if (t > maxDist) return maxDist;
    if (blocker(c, r)) return t;
  }
}
/** Vrai si rien de solide ne sépare les deux points. */
export function lineOfSight(ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az);
  return raycast(ax, az, bx - ax, bz - az, d) >= d - 1e-3;
}

/** Chemin A* (8 directions, sans couper les coins) entre deux positions. Renvoie une liste de points [x, z]. */
export function findPath(ax, az, bx, bz) {
  const [sc, sr] = toCell(ax, az);
  let [ec, er] = toCell(bx, bz);
  if (blocksMove(ec, er)) { const n = nearestFree(ec, er); if (!n) return []; [ec, er] = n; }
  const key = (c, r) => r * COLS + c;
  const open = new Map(), closed = new Set(), came = new Map();
  const g = new Map([[key(sc, sr), 0]]);
  const h = (c, r) => Math.hypot(c - ec, r - er);
  open.set(key(sc, sr), h(sc, sr));
  let guard = 0;
  while (open.size && guard++ < 3000) {
    let cur = null, best = Infinity;
    for (const [k, f] of open) if (f < best) { best = f; cur = k; }
    open.delete(cur);
    const c = cur % COLS, r = Math.floor(cur / COLS);
    if (c === ec && r === er) {
      const path = [];
      let k = cur;
      while (k !== undefined && k !== key(sc, sr)) { path.unshift(cellCenter(k % COLS, Math.floor(k / COLS))); k = came.get(k); }
      return smoothPath(ax, az, path);
    }
    closed.add(cur);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nc = c + dc, nr = r + dr, nk = key(nc, nr);
      if (blocksMove(nc, nr) || closed.has(nk)) continue;
      if (dc && dr && (blocksMove(c + dc, r) || blocksMove(c, r + dr))) continue;
      const ng = g.get(cur) + (dc && dr ? 1.414 : 1);
      if (ng < (g.get(nk) ?? Infinity)) { g.set(nk, ng); came.set(nk, cur); open.set(nk, ng + h(nc, nr)); }
    }
  }
  return [];
}
// Supprime les points intermédiaires quand la ligne droite est libre (trajectoire plus naturelle).
function smoothPath(ax, az, path) {
  const out = [];
  let fx = ax, fz = az, i = 0;
  while (i < path.length) {
    let j = path.length - 1;
    while (j > i && !clearCorridor(fx, fz, path[j][0], path[j][1])) j--;
    out.push(path[j]);
    [fx, fz] = path[j];
    i = j + 1;
  }
  return out;
}
// Couloir libre pour un personnage (on teste deux rayons décalés de part et d'autre).
function clearCorridor(ax, az, bx, bz, rad = 0.45) {
  const d = Math.hypot(bx - ax, bz - az) || 1;
  const nx = -(bz - az) / d * rad, nz = (bx - ax) / d * rad;
  const free = (x0, z0, x1, z1) => { const dd = Math.hypot(x1 - x0, z1 - z0); return raycast(x0, z0, x1 - x0, z1 - z0, dd, blocksMove) >= dd - 1e-3; };
  return free(ax + nx, az + nz, bx + nx, bz + nz) && free(ax - nx, az - nz, bx - nx, bz - nz) && free(ax, az, bx, bz);
}
function nearestFree(c, r) {
  for (let d = 1; d < 5; d++) for (let dr = -d; dr <= d; dr++) for (let dc = -d; dc <= d; dc++) if (!blocksMove(c + dc, r + dr)) return [c + dc, r + dr];
  return null;
}
