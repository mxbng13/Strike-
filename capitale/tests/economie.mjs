// Vérifie que chaque métier a une activité, que chaque bien a un producteur et que chaque production sert à quelqu’un.
// Lancer : node capitale/tests/economie.mjs
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const B = new URL('../js/', import.meta.url).href;
const { RESOURCES } = await import(B + 'data/resources.js');
const { ITEMS } = await import(B + 'data/items.js');
const E = await import(B + 'data/economy.js');
const { JOBS } = await import(B + 'data/jobs.js');
const { SITES, PLACES, VEHICLES } = await import(B + 'data/places.js');
const M = await import(B + 'game/market.js');
const ALL = { ...RESOURCES, ...ITEMS, ...E.GOODS };
const errs = [];
const produced = new Set(Object.keys(M.PRODUCERS));
const consumed = new Set();
const use = (id, why) => { if (!ALL[id]) errs.push(`inconnu: ${id} (${why})`); consumed.add(id); };
for (const r of E.RECIPES) { for (const id of Object.keys(r.in)) use(id, 'recette'); for (const id of Object.keys(r.out)) if (!ALL[id]) errs.push('sortie inconnue ' + id); if (r.tool) use(r.tool, 'outil'); if (r.machine) use(r.machine, 'machine'); for (const j of r.jobs) if (j !== '*' && !JOBS[j]) errs.push('métier inconnu ' + j); }
for (const s of Object.values(E.SERVICES)) { for (const id of Object.keys(s.supplies)) use(id, 'fourniture ' + s.id); if (s.tool) use(s.tool, 'outil service'); if (s.needs?.item) use(s.needs.item, 'service'); for (const j of s.jobs) if (!JOBS[j]) errs.push('métier service inconnu ' + j); if (!s.place.startsWith('*') && !PLACES.find((p) => p.id === s.place) && !SITES.find((p) => p.id === s.place)) errs.push('lieu inconnu ' + s.place); }
for (const j of Object.values(JOBS)) { for (const t of [...j.outils, ...j.equip]) use(t, 'métier ' + j.id); if (!PLACES.find((p) => p.id === j.place) && !SITES.find((p) => p.id === j.place)) errs.push('lieu métier ' + j.place); }
for (const s of SITES) for (const g of s.gather) { if (g.tool) use(g.tool, 'récolte'); (g.equip || []).forEach((e) => use(e, 'récolte')); Object.keys(g.fuel || {}).forEach((e) => use(e, 'carburant')); for (const [id] of g.loot) if (!ALL[id]) errs.push('loot ' + id); }
for (const n of E.NPC_NEEDS) n.any.forEach((id) => use(id, 'besoin habitant'));
[...E.COMPANY_NEEDS, ...E.RESEARCH_NEEDS, ...Object.keys(E.CONSTRUCTION_NEEDS)].forEach((id) => use(id, 'demande'));
for (const b of Object.values(E.BUILDINGS)) [...Object.keys(b.docs), ...Object.keys(b.mats)].forEach((id) => use(id, 'bâtiment'));
for (const r of Object.values(E.LIFE_REQUIREMENTS)) Object.keys(r).forEach((id) => use(id, 'vie'));
Object.keys(E.COMPANY_DOCS).forEach((id) => use(id, 'société'));
for (const v of Object.values(VEHICLES)) { if (v.refill) use(v.refill, 'véhicule'); if (v.needs) use(v.needs, 'véhicule'); }
for (const p of PLACES) for (const id of p.shop || []) if (!ALL[id]) errs.push('shop ' + id);
for (const [id, d] of Object.entries(ALL)) if (d.use || d.comfort || d.gift || d.protect || d.vehicle || d.cure || d.vaccine) consumed.add(id);
['optimisation', 'carte_prospection', 'alerte_meteores', 'etude_marine', 'rapport_renseignement', 'diplome_univ', 'methode_pedagogique', 'bon_achat', 'certificat_qualite', 'plan_financement', 'dedouanement', 'ordonnance', 'manuel', 'encyclopedie', 'photos', 'robot_industriel', 'fiches_paie', 'contrat_travail', 'dossier_admin'].forEach((id) => consumed.add(id));
const jobsNoActivity = Object.keys(JOBS).filter((j) => !M.RECIPES_BY_JOB[j] && !M.SERVICES_BY_JOB[j] && !E.GATHER_JOBS[j]);
const notProduced = Object.keys(ALL).filter((id) => consumed.has(id) && !produced.has(id) && id !== 'ordonnance');
const notConsumed = [...produced].filter((id) => !consumed.has(id));
// métiers dont la production ne sert à rien
const useless = Object.keys(JOBS).filter((j) => {
  const outs = [...(M.RECIPES_BY_JOB[j] || []).flatMap((r) => Object.keys(r.out))];
  const svcs = M.SERVICES_BY_JOB[j] || [];
  const g = E.GATHER_JOBS[j];
  return !svcs.length && !g && outs.length && outs.every((o) => !consumed.has(o));
});
console.log('erreurs:', errs);
console.log('métiers sans activité:', jobsNoActivity);
console.log('biens utilisés mais produits par personne:', notProduced);
console.log('biens produits mais utilisés par personne:', notConsumed);
console.log('métiers inutiles:', useless);
console.log('métiers', Object.keys(JOBS).length, 'recettes', E.RECIPES.length, 'services', Object.keys(E.SERVICES).length, 'biens', Object.keys(ALL).length);
