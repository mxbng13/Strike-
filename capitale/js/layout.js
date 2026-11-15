// LE PLAN DE LA VILLE : positions des lieux, des maisons de métiers, des pontons et des terrains.
// Partagé par la vue pixel (world2d.js). Les calculs reprennent ceux de la vue 3D pour garder la même carte.
import { CAP_Y, LAKE, lakeDist, computeSites } from './world.js';

export const ROADS = [Math.PI / 6, Math.PI / 6 + 2 * Math.PI / 3, Math.PI / 6 + 4 * Math.PI / 3];
export const SLOTS = [Math.PI / 2, Math.PI / 2 + 2 * Math.PI / 3, Math.PI / 2 + 4 * Math.PI / 3];
export const WATER_SECTORS = ['hotellerie', 'arts', 'transport', 'sport'];
export const polar = (r, a) => [r * Math.sin(a), r * Math.cos(a)];
const angDist = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

export function plotFor(i) {
  const ring = 505 + Math.floor(i / 16) * 40;
  let a = 1.15 + (i % 16) * 0.25;
  for (const r of ROADS) if (angDist(a, r) < 0.06) a += 0.12;
  const [x, z] = polar(ring, a);
  return [Math.round(x), Math.round(z)];
}

export function computeLayout(places, sites, sectors) {
  const spots = {};
  // centre : flèche, banque, dôme, tours, mairie, gare, usines, résidences
  spots['core:spire'] = polar(31, ROADS[0]); spots['core:spire2'] = polar(31, ROADS[1]);
  spots['core:dome'] = polar(43, SLOTS[0]); spots['core:twins'] = polar(44, SLOTS[1]); spots['core:command'] = polar(44, SLOTS[2]);
  spots['core:pad'] = polar(84, SLOTS[0]); spots['core:silos'] = polar(84, SLOTS[1]); spots['core:homes'] = polar(85, SLOTS[2]);
  let fi = 0;
  for (let i = 0; i < 6; i++) for (const [dr, da] of [[0, -0.12], [12, 0.1]]) spots[`filler:${fi++}`] = polar(80 + dr, i * Math.PI / 3 + da);
  // faubourg : un pavillon par lieu « ring »
  const ring = places.filter((p) => p.spot === 'ring');
  const angles = [];
  let a = 0;
  const stepA = (Math.PI * 2) / (ring.length + 3);
  while (angles.length < ring.length) { const near = ROADS.some((r) => angDist(a, r) < 0.13); if (!near) angles.push(a); a += near ? 0.05 : stepA; }
  ring.forEach((p, i) => { spots[`ring:${p.id}`] = polar(168, angles[i]); });
  const placePos = {};
  const placeSize = {};
  for (const p of places) {
    const key = p.spot === 'ring' ? `ring:${p.id}` : p.spot;
    if (spots[key]) { placePos[p.id] = spots[key]; placeSize[p.id] = p.spot.startsWith('filler') ? 10 : p.spot.startsWith('core') ? 16 : 18; }
  }
  // sites de récolte
  const siteSpots = computeSites();
  for (const s of sites) { placePos[s.id] = siteSpots[s.id]; placeSize[s.id] = 36; }

  // maisons des métiers : quartiers en éventail au nord du lac
  const slots = [];
  const districts = [];
  const landSectors = sectors.filter((s) => !WATER_SECTORS.includes(s.id));
  const total = landSectors.reduce((acc, s) => acc + s.jobIds.length, 0);
  const A0 = 1.0, A1 = Math.PI * 2 - 1.0;
  a = A0;
  for (const sec of landSectors) {
    const span = (A1 - A0) * (sec.jobIds.length / total);
    const list = [...sec.jobIds];
    let r = 214;
    while (list.length && r < 900) {
      const n = Math.max(1, Math.floor((span * r) / 34));
      for (let k = 0; k < n && list.length; k++) {
        const aa = a + span * (k + 0.5) / n;
        if (ROADS.some((rd) => angDist(aa, rd) * r < 18)) continue;
        const [x, z] = polar(r, aa);
        if (lakeDist(x, z) < 1.08) continue;
        slots.push({ id: `job:${list.shift()}`, x, z, rot: aa + Math.PI, sector: sec.id, size: 16 });
      }
      r += 32;
    }
    districts.push({ sec, pos: polar(300, a + span / 2) });
    a += span;
  }
  // les pontons sur le lac
  const piers = [];
  for (const pa of [-0.5, -0.17, 0.17]) {
    const dx = Math.sin(pa), dz = Math.cos(pa);
    let r0 = 150;
    while (lakeDist(dx * r0, dz * r0) > 1.0 && r0 < 600) r0 += 4;
    piers.push({ a: pa, r0: r0 - 14, r1: r0 + 270 });
  }
  const waterJobs = [['hotellerie', 'arts'], ['transport'], ['sport']];
  piers.forEach((p, i) => {
    const list = sectors.filter((s) => waterJobs[i].includes(s.id)).flatMap((s) => s.jobIds.map((j) => [j, s.id]));
    const px = Math.cos(p.a), pz = -Math.sin(p.a), dx = Math.sin(p.a), dz = Math.cos(p.a);
    let k = 0;
    for (let r = p.r0 + 34; r < p.r1 - 10 && k < list.length; r += 25) {
      for (const side of [-1, 1]) {
        if (k >= list.length) break;
        const [j, sid] = list[k++];
        slots.push({ id: `job:${j}`, x: dx * r + px * 17 * side, z: dz * r + pz * 17 * side, rot: p.a + (side > 0 ? -Math.PI / 2 : Math.PI / 2), sector: sid, size: 15, stilt: true });
      }
    }
    districts.push({ sec: sectors.find((s) => s.id === waterJobs[i][0]), pos: polar(p.r0 + 140, p.a), label: waterJobs[i].map((sid) => sectors.find((s) => s.id === sid).nom.split(',')[0]).join(' · ') });
  });
  const jobFront = {};
  for (const sl of slots) {
    placePos[sl.id] = [sl.x, sl.z];
    placeSize[sl.id] = sl.size;
    jobFront[sl.id] = [sl.x + Math.sin(sl.rot) * 12, sl.z + Math.cos(sl.rot) * 12];
  }
  return { placePos, placeSize, siteSpots, slots, districts, piers, jobFront, CAP_Y, LAKE };
}
