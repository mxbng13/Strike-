// État de la partie, génération du monde et sauvegarde locale.
import { ART, RARITY } from './catalog.js';
import { RIVALS, placeCoords } from './places.js';
import { rng, now, clamp } from './util.js';

const KEY = 'vernissage-v2';
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

function buildWorld(seed) {
  const r = rng(seed);
  const owners = {};
  const inst = {};
  const rivals = RIVALS.map((x, i) => ({ id: 'r' + i, ...x, money: 4e5 * Math.pow(2.6, x.lvl), def: {}, cool: 0 }));
  for (const rv of rivals) for (const d of DEF) rv.def[d.k] = clamp(Math.round(rv.lvl + (r() * 3 - 1.5)), 0, 10);
  const pool = [], met = [], cma = [];
  for (const a of ART) {
    if (a.s === 'wiki') {
      const c = placeCoords(a.m);
      if (/Volé|Collection privée/.test(a.m) || !c) {
        if (/Détruit|Disparu|diverses/.test(a.m)) { pool.push(a.id); continue; }
        const rich = rivals.filter(x => x.lvl >= 5);
        owners[a.id] = rich[Math.floor(r() * rich.length)].id;
        continue;
      }
      const key = a.m;
      inst[key] ??= { id: 'i:' + key, name: key.split(',')[0].trim(), city: key.includes(',') ? key.split(',').slice(1).join(',').trim() : '', lat: c[0], lon: c[1], max: 0, def: {} };
      inst[key].max = Math.max(inst[key].max, a.r);
      owners[a.id] = inst[key].id;
    } else if (a.s === 'met') met.push(a.id); else cma.push(a.id);
  }
  const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  shuffle(met); shuffle(cma);
  const metKey = 'Metropolitan Museum, New York', cmaKey = 'Cleveland Museum of Art';
  inst[metKey] ??= { id: 'i:' + metKey, name: 'Metropolitan Museum', city: 'New York', lat: 40.779, lon: -73.963, max: 3, def: {} };
  inst[cmaKey] = { id: 'i:' + cmaKey, name: 'Cleveland Museum of Art', city: 'Cleveland', lat: 41.509, lon: -81.612, max: 3, def: {} };
  met.splice(0, 160).forEach(id => { owners[id] = inst[metKey].id; });
  cma.splice(0, 160).forEach(id => { owners[id] = inst[cmaKey].id; });
  pool.push(...met, ...cma);
  shuffle(pool);
  for (const rv of rivals) {
    const n = 5 + rv.lvl * 3;
    let got = 0;
    for (let i = 0; i < pool.length && got < n; i++) {
      const a = ART[pool[i]];
      if (owners[a.id] || a.r > Math.min(4, 1 + Math.ceil(rv.lvl / 2.5))) continue;
      owners[a.id] = rv.id; got++;
    }
  }
  for (const m of Object.values(inst)) {
    const base = { 5: 9, 4: 7, 3: 5, 2: 3, 1: 2 }[m.max] ?? 4;
    m.lvl = clamp(base + Math.round(r() * 2 - 0.5), 1, 10);
    m.cool = 0;
    for (const d of DEF) m.def[d.k] = clamp(Math.round(m.lvl + r() * 2 - 1), 0, 10);
  }
  return { owners, inst: Object.fromEntries(Object.values(inst).map(m => [m.id, m])), rivals };
}

export function newGame() {
  const seed = Math.floor(Math.random() * 1e9);
  const w = buildWorld(seed);
  S = {
    v: 2, seed, t0: now(), last: now(), money: 30000,
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
    if (raw) { const s = JSON.parse(raw); if (s?.v === 2 && s.owners) { S = s; return S; } }
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
