// État de la partie, génération du monde et sauvegarde locale.
import { ART, RARITY } from './catalog.js';
import { RIVALS, FIRST, NICK, placeCoords } from './places.js';
import { rng, now, pick, randi, clamp } from './util.js';

const KEY = 'vernissage-noir-v1';
export let S = null;

export const DEF = [
  { k: 'locks', name: 'Serrures blindées', short: 'Serrures', base: 2500, desc: 'Ralentissent l’entrée des cambrioleurs.' },
  { k: 'cams', name: 'Vidéosurveillance', short: 'Caméras', base: 4000, desc: 'Les hackers doivent les aveugler.' },
  { k: 'guards', name: 'Gardiens de nuit', short: 'Gardiens', base: 5000, desc: 'Patrouillent dans les salles.' },
  { k: 'dogs', name: 'Maîtres-chiens', short: 'Chiens', base: 3500, desc: 'Flairent les intrus, même invisibles.' },
  { k: 'lasers', name: 'Grille laser', short: 'Lasers', base: 8000, desc: 'Protège les murs des œuvres.' },
  { k: 'alarm', name: 'Alarme reliée à la police', short: 'Alarme', base: 6000, desc: 'Réduit le temps pour s’enfuir.' },
];
export const ROLES = {
  cambrioleur: { name: 'Cambrioleur', skill: 'Crochetage' },
  hacker: { name: 'Hacker', skill: 'Piratage' },
  grosbras: { name: 'Gros bras', skill: 'Force' },
  acrobate: { name: 'Acrobate', skill: 'Agilité' },
  chauffeur: { name: 'Chauffeur', skill: 'Pilotage' },
  faussaire: { name: 'Faussaire', skill: 'Faux' },
};
export const GADGETS = {
  passe: { name: 'Passe-partout', price: 2500, phase: 'locks', desc: 'Ouvre n’importe quelle serrure.' },
  brouilleur: { name: 'Brouilleur vidéo', price: 4000, phase: 'cams', desc: 'Boucle les caméras sur une image fixe.' },
  somnifere: { name: 'Fléchettes somnifères', price: 3500, phase: 'patrol', desc: 'Endort gardiens et chiens.' },
  miroirs: { name: 'Miroirs à lasers', price: 6000, phase: 'lasers', desc: 'Dévient les faisceaux.' },
  fumigene: { name: 'Fumigènes', price: 3000, phase: 'escape', desc: 'Couvrent la fuite.' },
};

export const slotsFor = lvl => 4 + lvl * 2;
export const extendCost = lvl => Math.round(12000 * Math.pow(2.5, lvl - 1));
export const defCost = (d, lvl) => Math.round(d.base * Math.pow(1.85, lvl));
export const trainCost = lvl => Math.round(2500 * Math.pow(lvl, 2.3));

export function newCrewMember(role, lvl) {
  return { id: Math.random().toString(36).slice(2, 9), name: `${pick(FIRST)} « ${pick(NICK)} »`, role, lvl, jail: 0 };
}

// ---------- génération du monde ----------
function buildWorld(seed) {
  const r = rng(seed);
  const owners = {};
  const inst = {};      // institutions réelles (musées)
  const rivals = RIVALS.map((x, i) => ({ id: 'r' + i, ...x, money: 4e5 * Math.pow(2.6, x.lvl), def: {}, nextRaid: 0, scout: 0, fakes: {} }));
  for (const rv of rivals) for (const d of DEF) rv.def[d.k] = clamp(Math.round(rv.lvl + (r() * 3 - 1.5)), 0, 10);

  const pool = [];
  const met = [], cma = [];
  for (const a of ART) {
    if (a.s === 'wiki') {
      const c = placeCoords(a.m);
      if (/Volé|Collection privée/.test(a.m) || !c) {
        if (/Détruit|Disparu|diverses/.test(a.m)) { pool.push(a.id); continue; }
        // les œuvres en mains privées vont chez les rivaux les plus riches
        const rich = rivals.filter(x => x.lvl >= 5);
        owners[a.id] = /Gardner/.test(a.m) ? 'r17' : rich[Math.floor(r() * rich.length)].id;
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
  // collections de départ des rivaux, tirées dans le pool
  for (const rv of rivals) {
    const n = 5 + rv.lvl * 3;
    let got = 0;
    for (let i = 0; i < pool.length && got < n; i++) {
      const a = ART[pool[i]];
      if (owners[a.id] || a.r > Math.min(4, 1 + Math.ceil(rv.lvl / 2.5))) continue;
      owners[a.id] = rv.id; got++;
    }
  }
  const instArr = Object.values(inst);
  for (const m of instArr) {
    const base = { 5: 9, 4: 7, 3: 5, 2: 3, 1: 2 }[m.max] ?? 4;
    m.lvl = clamp(base + Math.round(r() * 2 - 0.5), 1, 10);
    for (const d of DEF) m.def[d.k] = clamp(Math.round(m.lvl + r() * 2 - 1), 0, 10);
  }
  return { owners, inst: Object.fromEntries(instArr.map(m => [m.id, m])), rivals };
}

export function newGame() {
  const seed = Math.floor(Math.random() * 1e9);
  const w = buildWorld(seed);
  S = {
    v: 1, seed, t0: now(), last: now(),
    money: 30000, heat: 0, rep: 0,
    me: { placed: false, lat: 0, lon: 0, name: 'Mon musée', near: '', lvl: 1, def: Object.fromEntries(DEF.map(d => [d.k, 0])) },
    items: [], nid: 1,
    crew: [newCrewMember('cambrioleur', 1), newCrewMember('hacker', 1)],
    recruits: [], recruitsAt: 0,
    gadgets: { passe: 1, brouilleur: 0, somnifere: 1, miroirs: 0, fumigene: 0 },
    jobs: [],
    market: { at: 0, lots: [] },
    auctions: [],
    owners: w.owners, inst: w.inst, rivals: w.rivals,
    log: [], stats: { heists: 0, wins: 0, stolen: 0, forged: 0, fakesSold: 0, bought: 0, auctionsWon: 0, exped: 0 },
    done: {}, nextRaid: now() + 12 * 60e3, nextInspect: now() + 60e3, nextFakeCheck: now() + 120e3,
  };
  // trois œuvres de départ, prises dans le pool
  const free = ART.filter(a => !S.owners[a.id]);
  const starters = [...free.filter(a => a.r === 1).sort(() => Math.random() - 0.5).slice(0, 3), free.find(a => a.r === 2)];
  starters.filter(Boolean).forEach((a, i) => addItem(a.id, { wall: i < 4 }));
  log('Bienvenue. Choisissez un emplacement sur la carte pour bâtir votre musée.', 'info');
  return S;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s?.v === 1 && s.owners) { S = s; return S; }
    }
  } catch { /* stockage indisponible : nouvelle partie */ }
  return newGame();
}
export function save() {
  if (!S) return;
  S.last = now();
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* quota ou stockage bloqué */ }
}
export function reset() {
  try { localStorage.removeItem(KEY); } catch {}
  newGame(); save();
}

// ---------- possession ----------
export function addItem(aid, extra = {}) {
  const it = { iid: S.nid++, aid, copy: 0, from: null, at: now(), wall: false, ...extra };
  S.items.push(it);
  if (!it.copy) delete S.owners[aid];
  return it;
}
export function removeItem(it) {
  S.items = S.items.filter(x => x !== it);
}
export const myOriginal = aid => S.items.find(x => x.aid === aid && !x.copy);
export const wallItems = () => S.items.filter(x => x.wall);
export function ownerOf(aid) {
  if (myOriginal(aid)) return 'me';
  return S.owners[aid] ?? null;
}
export function ownerInfo(id) {
  if (!id) return null;
  if (id === 'me') return { id: 'me', name: S.me.name, kind: 'me', lat: S.me.lat, lon: S.me.lon, lvl: S.me.lvl, def: S.me.def };
  if (id.startsWith('i:')) return { ...S.inst[id], kind: 'inst', ref: S.inst[id] };
  const rv = S.rivals.find(x => x.id === id);
  return rv ? { ...rv, kind: 'rival', ref: rv } : null;
}
let worksCache = null, worksStamp = -1;
let ownerStamp = 0;
export const touchOwners = () => { ownerStamp++; };
export function worksOf(id) {
  if (worksStamp !== ownerStamp || !worksCache) {
    worksCache = new Map();
    for (const [aid, o] of Object.entries(S.owners)) {
      if (!worksCache.has(o)) worksCache.set(o, []);
      worksCache.get(o).push(+aid);
    }
    for (const l of worksCache.values()) l.sort((a, b) => ART[b].v - ART[a].v);
    worksStamp = ownerStamp;
  }
  return worksCache.get(id) ?? [];
}
export function setOwner(aid, id) {
  if (id) S.owners[aid] = id; else delete S.owners[aid];
  touchOwners();
}
export const freeArt = () => ART.filter(a => !S.owners[a.id] && !myOriginal(a.id));

export function collectionValue(id) {
  if (id === 'me') return S.items.reduce((s, x) => s + (x.copy ? 0 : ART[x.aid].v), 0);
  return worksOf(id).reduce((s, aid) => s + ART[aid].v, 0);
}
export function defenseScore(def) {
  return DEF.reduce((s, d) => s + (def[d.k] ?? 0), 0) / DEF.length;
}

// ---------- revenus ----------
export function incomePerMin() {
  let sum = 0;
  const artists = {};
  for (const it of wallItems()) {
    const a = ART[it.aid];
    sum += it.copy ? a.v * 0.0004 * it.copy : a.v * 0.004;
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

export const isHot = it => it.from && now() - it.at < 20 * 60e3;
export const rarityOf = aid => RARITY[ART[aid].r];
export { randi };
