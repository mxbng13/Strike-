// État du joueur, sauvegarde locale et petites fonctions utiles.
import { RESOURCES } from '../data/resources.js';
import { ITEMS } from '../data/items.js';
import { STOCKS } from '../data/places.js';

const KEY = 'nexus-vie-v1';
export const STATS = [
  ['faim', 'Faim', '🍗'], ['soif', 'Soif', '💧'], ['hygiene', 'Hygiène', '🧼'],
  ['energie', 'Sommeil', '😴'], ['sante', 'Santé', '❤️'], ['moral', 'Moral', '🙂'],
];

export const def = (id) => RESOURCES[id] || ITEMS[id] || null;
export const fmt = (n) => `${Math.round(n).toLocaleString('fr-FR')} ₵`;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function newState() {
  const prices = {};
  for (const id in RESOURCES) prices[id] = 1;
  return {
    v: 1,
    nom: 'Voyageur',
    money: 650,
    time: 8 * 60,                 // minutes depuis le début (jour 1, 8 h)
    stats: { faim: 80, soif: 75, hygiene: 85, energie: 90, sante: 100, moral: 70 },
    pos: { x: 0, z: 150 },
    inv: { pain: 2, eau: 2, savon: 1 },
    dur: {},                      // usure de l'objet en cours d'utilisation (outils, vêtements)
    job: null, diplomas: [], jobXp: {}, permits: [],
    housing: null,                // { type, rentPaidUntil? }
    home: [],                     // meubles installés
    vehicles: {},                 // id -> { fuel, cond, rentedUntil? }
    transport: 'marche',
    conditions: [],               // blessure, maladie, radiation
    insurance: null,              // index du fournisseur
    guild: null, privateCity: false,
    passes: {},                   // club: fin, musee: fin, haut_niveau: true
    buffs: {},                    // forme: fin, sellboost: fin
    company: null,
    stocks: {}, stockPrices: Object.fromEntries(STOCKS.map((s) => [s.id, s.prix])), stockHist: {},
    deposits: [],                 // placements { amount, until, rate }
    family: { partner: null, married: false, children: [] },
    prices,
    weather: { type: 'soleil', until: 11 * 60 },
    lastDay: 0,
    log: [],
    stats_total: { gagne: 0, depense: 0, services: 0 },
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.v === 1) return Object.assign(newState(), s);
    }
  } catch (e) { /* stockage indisponible : nouvelle partie */ }
  return newState();
}
export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}
export function reset() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}

export const has = (s, id, n = 1) => (s.inv[id] || 0) >= n;
export function addItem(s, id, n = 1) {
  s.inv[id] = (s.inv[id] || 0) + n;
  if (s.inv[id] <= 0) delete s.inv[id];
}
export function removeItem(s, id, n = 1) {
  if (!has(s, id, n)) return false;
  addItem(s, id, -n);
  if (!s.inv[id]) delete s.dur[id];
  return true;
}
// Use one "charge" of a durable object (tool, equipment, clothing). Returns false if not owned.
export function wear(s, id, amount = 1) {
  if (!has(s, id)) return false;
  const d = def(id);
  if (!d || !d.dur) return true;
  if (s.dur[id] === undefined) s.dur[id] = d.dur;
  s.dur[id] -= amount;
  if (s.dur[id] <= 0) {
    removeItem(s, id, 1);
    if (has(s, id)) s.dur[id] = d.dur; else delete s.dur[id];
    log(s, `${d.emoji} ${d.nom} est usé(e) et a été jeté(e).`, 'warn');
  }
  return true;
}

export function log(s, msg, kind = 'info') {
  s.log.unshift({ t: s.time, msg, kind });
  if (s.log.length > 80) s.log.length = 80;
  if (s.onLog) s.onLog(msg, kind);
}

export const day = (t) => Math.floor(t / 1440) + 1;
export const hourOf = (t) => (t % 1440) / 60;
export const clock = (t) => {
  const m = Math.floor(t % 1440);
  return `Jour ${day(t)} · ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
export const duration = (min) => {
  min = Math.round(min);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
};
