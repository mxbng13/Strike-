// Construit musee/data/catalog.json à partir de sources ouvertes :
//  - Wikipédia (chefs-d'œuvre célèbres listés dans famous.txt, image principale de l'article)
//  - The Metropolitan Museum of Art (œuvres « highlight » du domaine public)
//  - The Cleveland Museum of Art (Open Access CC0 : highlights + peintures)
// Usage : node musee/tools/build-catalog.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'data', 'catalog.json');
const UA = { 'User-Agent': 'MuseeGameCatalogBuilder/1.0 (educational game)' };

async function getJSON(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch (e) {
      if (i === tries - 1) { console.warn('échec', url, e.message); return null; }
      await new Promise(res => setTimeout(res, 2000 * (i + 1)));
    }
  }
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}
const yearOf = s => { const m = String(s ?? '').match(/(-?\d{3,4})/); return m ? +m[1] : null; };
const clean = s => String(s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

function kindFrom(text) {
  const t = text.toLowerCase();
  if (/photograph/.test(t)) return 'Photographie';
  if (/print|woodcut|etching|engraving|drawing|lithograph|ukiyo|watercolor|manuscript|book|scroll|codex/.test(t)) return 'Dessin & estampe';
  if (/sculpt|statue|bust|bronze|marble|relief|figure|head|mask|stele|stela/.test(t)) return 'Sculpture';
  if (/jewel|gold|crown|diamond|egg|ring|necklace|cup|vase|vessel|bowl|ceramic|porcelain|glass|silver|clock|furniture|chair|cabinet/.test(t)) return 'Objet précieux';
  if (/textile|tapestry|carpet|rug|embroider|costume|kimono/.test(t)) return 'Textile';
  if (/armor|armour|sword|helmet|weapon|dagger|shield/.test(t)) return 'Armes & armures';
  if (/painting|oil|canvas|fresco|panel|tempera|mural|altarpiece|triptych|portrait/.test(t)) return 'Peinture';
  return 'Antiquité & objet';
}

// ---------- 1. Wikipédia ----------
// une requête pour 40 titres : image principale, description, titre français
async function famous() {
  const lines = readFileSync(join(here, 'famous.txt'), 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#'));
  const rows = lines.map(l => { const [title, artist, date, place, tier] = l.split('|'); return { title, artist, date, place, tier: +tier }; });
  const info = {};
  for (let i = 0; i < rows.length; i += 40) {
    const chunk = rows.slice(i, i + 40).map(r => r.title);
    const j = await getJSON('https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages|description|langlinks&piprop=thumbnail|original&pithumbsize=500&lllang=fr&lllimit=max&titles=' + encodeURIComponent(chunk.join('|')), 8);
    if (!j) continue;
    const norm = {}; for (const n of [...(j.query.normalized ?? []), ...(j.query.redirects ?? [])]) norm[n.to] = n.from;
    for (const p of Object.values(j.query.pages)) {
      const names = [p.title]; let src = p.title; while (norm[src]) { src = norm[src]; names.push(src); }
      for (const n of names) info[n] = p;
    }
    await new Promise(res => setTimeout(res, 1500));
  }
  const seen = new Set(); const out = [];
  for (const r of rows) {
    const p = info[r.title];
    if (!p?.thumbnail?.source) { console.warn('  sans image :', r.title); continue; }
    if (seen.has(p.title)) continue; seen.add(p.title);
    const t = clean(p.langlinks?.[0]?.['*'] ?? p.title).replace(/\s*\([^)]*\)$/, '');
    out.push({ t, a: r.artist, d: r.date.startsWith('-') ? `${r.date.slice(1)} av. J.-C.` : r.date, y: +r.date, m: r.place,
      k: kindFrom((p.description ?? '') + ' ' + r.title), r: r.tier, u: p.thumbnail.source, s: 'wiki',
      ar: +(p.thumbnail.width / p.thumbnail.height).toFixed(3),
      wk: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(p.title.replace(/ /g, '_')) });
  }
  console.log('Wikipédia :', out.length);
  return out;
}

// ---------- 2. The Met ----------
async function met() {
  const ids = [];
  for (let off = 0; off < 5000; off += 100) {
    const j = await getJSON(`https://collectionapi.metmuseum.org/public/collection/v1.1/search?isHighlight=true&hasImages=true&q=*&offset=${off}&limit=100`);
    if (!j?.objectIDs?.length) break;
    ids.push(...j.objectIDs);
    if (ids.length >= j.total) break;
  }
  console.log('Met : ids', ids.length);
  const objs = await pool([...new Set(ids)], 3, async id => {
    const o = await getJSON(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
    if (!o?.isPublicDomain || !o.primaryImageSmall) return null;
    const artist = o.artistDisplayName || o.culture || o.dynasty || o.period || 'Inconnu';
    const kind = kindFrom([o.classification, o.objectName, o.medium, o.department].join(' '));
    return { t: clean(o.title), a: clean(artist), d: clean(o.objectDate) || '?', y: o.objectBeginDate ?? yearOf(o.objectDate),
      m: 'Metropolitan Museum, New York', o: clean(o.culture || o.country || o.department), k: kind,
      r: 2, u: o.primaryImageSmall, s: 'met', wk: o.objectURL };
  });
  const out = objs.filter(Boolean);
  console.log('Met :', out.length);
  return out;
}

// ---------- 3. Cleveland ----------
async function cma() {
  const out = []; const seen = new Set();
  const grab = async (query, max, rar) => {
    for (let skip = 0; skip < max; skip += 500) {
      const j = await getJSON(`https://openaccess-api.clevelandart.org/api/artworks/?has_image=1&cc0=1&${query}&limit=500&skip=${skip}`);
      if (!j?.data?.length) break;
      for (const o of j.data) {
        if (seen.has(o.id) || !o.images?.web?.url) continue; seen.add(o.id);
        const cr = o.creators?.[0]?.description?.replace(/\s*\(.*$/, '') || o.culture?.[0] || 'Inconnu';
        out.push({ t: clean(o.title), a: clean(cr), d: clean(o.creation_date) || '?', y: o.creation_date_earliest ?? yearOf(o.creation_date),
          m: 'Cleveland Museum of Art', o: clean(o.culture?.[0] ?? ''), k: kindFrom([o.type, o.technique, o.department].join(' ')),
          r: rar, u: o.images.web.url, s: 'cma', wk: o.url,
          ar: o.images.web.width && o.images.web.height ? +(o.images.web.width / o.images.web.height).toFixed(3) : 0.8 });
      }
      if (j.data.length < 500) break;
    }
  };
  await grab('highlight=1', 1000, 3);
  await grab('type=Painting', 4000, 1);
  console.log('Cleveland :', out.length);
  return out;
}

// cache par source (relancer avec --fresh-met / --fresh-cma pour retélécharger)
async function cached(name, fn) {
  const dir = join(here, '.cache'); mkdirSync(dir, { recursive: true });
  const f = join(dir, name + '.json');
  if (existsSync(f) && !process.argv.includes('--fresh-' + name)) return JSON.parse(readFileSync(f, 'utf8'));
  const v = await fn(); writeFileSync(f, JSON.stringify(v)); return v;
}
const w = await famous(); const m = await cached('met', met); const c = await cached('cma', cma);
// raretés : ~20 % des highlights du Met deviennent épiques, une partie des peintures de Cleveland deviennent rares
let h = 7; const rnd = () => (h = (h * 16807) % 2147483647) / 2147483647;
for (const x of m) if (rnd() < 0.2) x.r = 3;
for (const x of c) if (x.r === 1 && rnd() < 0.3) x.r = 2;
const all = [...w, ...m, ...c].filter(x => x.t);
all.forEach((x, i) => { x.id = i; });
writeFileSync(OUT, JSON.stringify(all));
console.log('Total :', all.length, '→', OUT);
