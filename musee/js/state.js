// État de la partie, génération du monde et sauvegarde locale.
import { ART, RARITY } from './catalog.js';
import { RIVALS } from './places.js';
import { landAt, nearestCity } from './map.js';
import { rng, now, clamp } from './util.js';

const KEY = 'vernissage-v3';
export let S = null;

// Protections : elles renforcent votre musée quand un rival vous défie (bonus « à domicile »).
export const DEF = [
  { k: 'vitrines', name: 'Vitrines blindées', base: 2500, desc: 'Vos œuvres paraissent plus précieuses aux yeux du jury.' },
  { k: 'eclairage', name: 'Éclairage muséal', base: 4000, desc: 'Chaque toile est mise en valeur.' },
  { k: 'gardiens', name: 'Gardiens et médiateurs', base: 5000, desc: 'Le public reste plus longtemps.' },
  { k: 'climat', name: 'Climatisation de conservation', base: 3500, desc: 'Les œuvres restent en parfait état.' },
  { k: 'assurance', name: 'Assurance tous risques', base: 8000, desc: 'Les jurés vous font confiance.' },
  { k: 'mecenes', name: 'Cercle de mécènes', base: 6000, desc: 'Des soutiens influents dans chaque jury.' },
];

export const slotsFor = lvl => 4 + lvl * 2;
export const extendCost = lvl => Math.round(12000 * Math.pow(2.5, lvl - 1));
export const defCost = (d, lvl) => Math.round(d.base * Math.pow(1.85, lvl));

// Le monde ne contient que des musées créés par des collectionneurs (vous et vos rivaux), posés n'importe où sur la terre ferme.
function buildWorld(seed) {
  const r = rng(seed);
  const owners = {};
  const rivals = RIVALS.map((x, i) => {
    let lat = 0, lon = 0;
    for (let t = 0; t < 400; t++) {
      lat = -40 + r() * 105; lon = -170 + r() * 345;
      if (lat > 62 && lon > -75 && lon < -10) continue; // pas sur la calotte du Groenland
      if (landAt(lat, lon)) break;
    }
    return { id: 'r' + i, ...x, lat, lon, near: nearestCity(lat, lon), money: 4e5 * Math.pow(2.6, x.lvl), def: {}, cool: 0 };
  });
  for (const rv of rivals) for (const d of DEF) rv.def[d.k] = clamp(Math.round(rv.lvl + (r() * 3 - 1.5)), 0, 10);
  const ids = ART.map(a => a.id);
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  // chaque rival démarre avec une collection à sa mesure ; les chefs-d'œuvre vont aux plus puissants
  const cap = lvl => lvl >= 8 ? 5 : lvl >= 6 ? 4 : lvl >= 3 ? 3 : 2;
  const want = Object.fromEntries(rivals.map(rv => [rv.id, 6 + rv.lvl * 4]));
  const famousShare = 0.45;
  for (const id of ids) {
    const a = ART[id];
    if (a.s === 'wiki' && r() > famousShare) continue;
    const cands = rivals.filter(rv => want[rv.id] > 0 && cap(rv.lvl) >= a.r);
    if (!cands.length) continue;
    if (a.s !== 'wiki' && r() > 0.12) continue;
    const rv = cands[Math.floor(r() * cands.length)];
    owners[id] = rv.id; want[rv.id]--;
  }
  return { owners, inst: {}, rivals };
}

export function newGame() {
  const seed = Math.floor(Math.random() * 1e9);
  const w = buildWorld(seed);
  S = {
    v: 3, seed, t0: now(), last: now(), money: 30000,
    me: { placed: false, lat: 0, lon: 0, name: 'Mon musée', near: '', lvl: 1, def: Object.fromEntries(DEF.map(d => [d.k, 0])) },
    items: [], nid: 1, jobs: [], market: { at: 0, lots: [] }, auctions: [],
    owners: w.owners, inst: w.inst, rivals: w.rivals,
    log: [], stats: { duels: 0, wins: 0, bought: 0, buyouts: 0, auctionsWon: 0, copies: 0, exped: 0, defended: 0 },
    done: {}, nextChallenge: now() + 12 * 60e3,
  };
  const free = ART.filter(a => !S.owners[a.id]);
  const any = r => { const c = free.filter(a => a.r === r); return c[Math.floor(Math.random() * c.length)]; };
  const starters = [any(1), any(1), any(1), any(2)].filter((a, i, arr) => a && arr.indexOf(a) === i);
  starters.forEach(a => addItem(a.id, { wall: true }));
  log('Bienvenue. Choisissez un emplacement sur la carte pour bâtir votre musée.', 'info');
  return S;
}
export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const s = JSON.parse(raw); if (s?.v === 3 && s.owners) { S = s; return S; } }
  } catch { /* stockage indisponible */ }
  return newGame();
}
export function save() {
  if (!S) return;
  S.last = now();
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* stockage bloqué */ }
}
export function reset() { try { localStorage.removeItem(KEY); } catch {} newGame(); save(); }

export function addItem(aid, extra = {}) {
  const it = { iid: S.nid++, aid, copy: 0, at: now(), wall: false, ...extra };
  S.items.push(it);
  if (!it.copy) { delete S.owners[aid]; touchOwners(); }
  return it;
}
export function removeItem(it) { S.items = S.items.filter(x => x !== it); }
export const myOriginal = aid => S.items.find(x => x.aid === aid && !x.copy);
export const wallItems = () => S.items.filter(x => x.wall);
export const ownerOf = aid => myOriginal(aid) ? 'me' : (S.owners[aid] ?? null);
export function ownerInfo(id) {
  if (!id) return null;
  if (id === 'me') return { id: 'me', name: S.me.name, kind: 'me', lat: S.me.lat, lon: S.me.lon, lvl: S.me.lvl, def: S.me.def, ref: S.me };
  if (id.startsWith('i:')) return S.inst[id] ? { ...S.inst[id], kind: 'inst', ref: S.inst[id] } : null;
  const rv = S.rivals.find(x => x.id === id);
  return rv ? { ...rv, kind: 'rival', ref: rv } : null;
}
let cache = null, stamp = 0, cacheStamp = -1;
export const touchOwners = () => { stamp++; };
export function worksOf(id) {
  if (id === 'me') return S.items.filter(x => !x.copy).map(x => x.aid).sort((a, b) => ART[b].v - ART[a].v);
  if (cacheStamp !== stamp || !cache) {
    cache = new Map();
    for (const [aid, o] of Object.entries(S.owners)) { if (!cache.has(o)) cache.set(o, []); cache.get(o).push(+aid); }
    for (const l of cache.values()) l.sort((a, b) => ART[b].v - ART[a].v);
    cacheStamp = stamp;
  }
  return cache.get(id) ?? [];
}
export function setOwner(aid, id) { if (id) S.owners[aid] = id; else delete S.owners[aid]; touchOwners(); }
export const freeArt = () => ART.filter(a => !S.owners[a.id] && !myOriginal(a.id));
export const collectionValue = id => worksOf(id).reduce((s, aid) => s + ART[aid].v, 0);
export const defenseScore = def => DEF.reduce((s, d) => s + (def[d.k] ?? 0), 0) / DEF.length;

export function incomePerMin() {
  let sum = 0; const artists = {};
  for (const it of wallItems()) {
    const a = ART[it.aid];
    sum += it.copy ? a.v * 0.0005 * it.copy : a.v * 0.004;
    if (!it.copy) artists[a.a] = (artists[a.a] ?? 0) + 1;
  }
  const sets = Object.values(artists).filter(n => n >= 3).length;
  return Math.round((sum + 40 * S.me.lvl) * (1 + 0.05 * (S.me.lvl - 1) + 0.1 * sets));
}
export function setBonuses() {
  const artists = {};
  for (const it of wallItems()) if (!it.copy) { const a = ART[it.aid].a; artists[a] = (artists[a] ?? 0) + 1; }
  return Object.entries(artists).filter(([, n]) => n >= 3).map(([a]) => a);
}
export function log(msg, kind = 'info') {
  S.log.unshift({ t: now(), msg, kind });
  if (S.log.length > 120) S.log.length = 120;
}
export const rarityOf = aid => RARITY[ART[aid].r];
