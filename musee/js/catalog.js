// Catalogue des œuvres réelles (data/catalog.json) et chargement des images.
import { hash } from './util.js';

export const RARITY = [
  null,
  { key: 1, name: 'Commune', color: '#a9b4b0', min: 4e3, max: 4e4 },
  { key: 2, name: 'Rare', color: '#5fa8d3', min: 4e4, max: 4e5 },
  { key: 3, name: 'Épique', color: '#b07be0', min: 4e5, max: 6e6 },
  { key: 4, name: 'Légendaire', color: '#e8b04a', min: 6e6, max: 9e7 },
  { key: 5, name: 'Mythique', color: '#ff5d6c', min: 1.2e8, max: 1.1e9 },
];
export const SOURCES = {
  wiki: 'Wikipédia / Wikimedia Commons',
  met: 'The Metropolitan Museum of Art (Open Access)',
  cma: 'The Cleveland Museum of Art (Open Access CC0)',
};

export let ART = [];
export const KINDS = new Set();

export async function loadCatalog() {
  const r = await fetch('data/catalog.json');
  ART = await r.json();
  const famous = ART.filter(a => a.s === 'wiki').length;
  for (const a of ART) {
    KINDS.add(a.k);
    const R = RARITY[a.r];
    // valeur log-uniforme dans la fourchette de la rareté ; les œuvres célèbres listées en premier valent plus
    let x = hash(a.id * 31 + 7);
    if (a.s === 'wiki') x = Math.min(1, x * 0.5 + 0.5 * (1 - a.id / famous));
    a.v = Math.round(Math.exp(Math.log(R.min) + x * (Math.log(R.max) - Math.log(R.min))) / 100) * 100;
    a.q = (a.t + ' ' + a.a + ' ' + (a.o ?? '') + ' ' + a.m).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  if (ART[0]?.t?.startsWith('La Joconde') || ART[0]?.t?.startsWith('Mona')) ART[0].v = 1.5e9;
  return ART;
}

// ---- images ----
// Si des paquets d'images (img/index.json) sont publiés à côté du jeu, ils sont utilisés ;
// sinon l'image est chargée directement depuis le musée ou Wikimedia.
let packs = null;            // null = inconnu, false = absent, objet = index
const packCache = new Map(); // n° paquet -> Promise<objet id->dataURI>
async function packIndex() {
  if (packs !== null) return packs;
  try {
    const r = await fetch('img/index.json');
    packs = r.ok ? await r.json() : false;
  } catch { packs = false; }
  return packs;
}
export async function imageURL(a) {
  const idx = await packIndex();
  if (!idx) return a.u;
  const n = Math.floor(a.id / idx.size);
  if (!packCache.has(n)) packCache.set(n, fetch(`img/p${n}.json`).then(r => r.ok ? r.json() : {}).catch(() => ({})));
  const p = await packCache.get(n);
  return p[a.id] ?? a.u;
}

// Charge l'image quand l'élément devient visible.
const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => {
  for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); fill(e.target); }
}, { rootMargin: '300px' }) : null;
async function fill(img) {
  const a = ART[+img.dataset.aid];
  if (!a) return;
  const url = await imageURL(a);
  if (+img.dataset.aid === a.id) img.src = url;
}
export function bindImg(img, a, eager = false) {
  img.dataset.aid = a.id;
  img.alt = a.t;
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.onload = () => img.classList.add('ok');
  if (eager || !io) fill(img); else io.observe(img);
}
const bitmapCache = new Map();
export function imageBitmap(a) {
  if (!bitmapCache.has(a.id)) {
    bitmapCache.set(a.id, imageURL(a).then(u => new Promise(res => {
      const im = new Image(); im.referrerPolicy = 'no-referrer';
      im.onload = () => res(im); im.onerror = () => res(null); im.src = u;
    })));
  }
  return bitmapCache.get(a.id);
}
