// Tests de la logique des box : probabilités, achats, box gratuite, ouverture, doublons. Lancer : npm test
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
const { BOX_TYPES } = await import('../src/data/boxes.js');
const svc = await import('../src/game/boxService.js');
const { save } = await import('../src/save/storage.js');
const { RARITY_ORDER } = await import('../src/data/rarities.js');
let fail = 0;
const check = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) fail++; };

// 1. Totaux exacts (en dixièmes pour éviter les erreurs de virgule flottante)
for (const [id, b] of Object.entries(BOX_TYPES)) {
  const sum = RARITY_ORDER.reduce((a, r) => a + Math.round(b.rates[r] * 10), 0);
  check(sum === 1000, `${id}: total = ${sum / 10} %`);
}
// 2. Distribution observée sur 1 000 000 tirages
const N = 1_000_000;
for (const id of Object.keys(BOX_TYPES)) {
  const cnt = Object.fromEntries(RARITY_ORDER.map((r) => [r, 0]));
  for (let i = 0; i < N; i++) cnt[svc.rollRarity(id)]++;
  const line = RARITY_ORDER.map((r) => `${r} ${(cnt[r] / N * 100).toFixed(2)}% (attendu ${BOX_TYPES[id].rates[r]})`).join(' | ');
  const maxErr = Math.max(...RARITY_ORDER.map((r) => Math.abs(cnt[r] / N * 100 - BOX_TYPES[id].rates[r])));
  check(maxErr < 0.2, `${id}: ${line}`);
}
// 3. Achat : fonds insuffisants => solde inchangé
save.reset();
check(save.get().coins === 100000 && save.get().gems === 1000, 'solde de test : 100 000 pièces, 1 000 diamants');
save.update({ coins: 1200 });
const { save: reloaded } = await import('../src/save/storage.js?reload');
check(reloaded.get().coins === 100000, 'au relancement, le solde remonte à 100 000 pièces');
save.update({ coins: 100, gems: 0 });
check(!svc.buyBox('normale').ok && save.get().coins === 100 && save.get().boxes.normale === 0, 'achat refusé sans fonds, solde inchangé');
save.update({ coins: 700 });
check(svc.buyBox('normale').ok && save.get().coins === 400 && save.get().boxes.normale === 1, 'achat box normale : -300 pièces, +1 box');
check(!svc.buyBox('legendaire').ok && save.get().gems === 0, 'box légendaire refusée sans diamants');
// 4. Box gratuites : +1 toutes les 5 h, stock max 5, persistance
const H = 3600_000;
const t0 = 1_000_000_000_000;
save.update({ freeBox: { stored: 1, lastTick: t0 } });
check(svc.freeBoxStatus(t0).stored === 1, 'premier lancement : 1 box gratuite en stock');
check(svc.freeBoxStatus(t0 + 4 * H).stored === 1 && svc.freeBoxStatus(t0 + 4 * H).nextInMs === H, 'après 4 h : toujours 1, prochaine dans 1:00:00');
check(svc.freeBoxStatus(t0 + 5 * H).stored === 2, 'après 5 h : 2 box gratuites');
check(svc.freeBoxStatus(t0 + 100 * H).stored === 5 && svc.freeBoxStatus(t0 + 100 * H).full, 'après 100 h : plafonné à 5');
// ouverture d'une box gratuite quand le stock est plein : le compteur repart de l'ouverture
save.update({ freeBox: { stored: 5, lastTick: t0 }, pendingReveal: null });
const boughtBefore = save.get().boxes.normale;
const fr = svc.openBox('normale', 'free', Math.random, t0 + 100 * H);
check(fr.ok && fr.reveal.source === 'free' && save.get().boxes.normale === boughtBefore, 'ouverture gratuite : ne touche pas aux box achetées');
const fs = svc.freeBoxStatus(t0 + 100 * H + 60_000);
check(fs.stored === 4 && fs.nextInMs === 5 * H - 60_000, 'stock 5 -> 4, prochaine box 5 h après l’ouverture');
svc.acknowledgeReveal(fr.reveal.id);
check(svc.freeBoxStatus(t0 + 105 * H).stored === 5, '5 h plus tard : de nouveau 5');
save.update({ freeBox: { stored: 0, lastTick: t0 } });
check(!svc.openBox('normale', 'free', Math.random, t0 + H).ok, 'stock gratuit vide : ouverture refusée');
check(svc.freeBoxStatus(t0 - 10 * H).nextInMs <= 5 * H, 'horloge reculée : attente plafonnée à 5 h');
// 5. Persistance : la sauvegarde contient le stock et la date de la période
const raw = JSON.parse(store['eclats-ether-save-v1']);
check(raw.freeBox.stored === 0 && raw.freeBox.lastTick === t0, 'stock et date des box gratuites enregistrés');
save.update({ boxes: { normale: 2, rare: 0, legendaire: 0 } });
// 6. Ouverture : box retirée, récompenses enregistrées une seule fois, pas de double ouverture
save.update({ boxes: { normale: 2, rare: 0, legendaire: 0 }, pendingReveal: null, xpPool: 0, pass: null });
const coinsBefore = save.get().coins;
const r1 = svc.openBox('normale');
const sum = (r, t) => r.reveal.rewards.filter((x) => x.type === t).reduce((a, b) => a + b.amount, 0);
check(r1.ok && save.get().boxes.normale === 1 && save.get().pendingReveal?.id === r1.reveal.id, 'ouverture : -1 box, résultat mémorisé');
check(save.get().coins === coinsBefore + sum(r1, 'coins') && sum(r1, 'xp') === 0 && save.get().xpPool === 0, 'pièces de la box créditées une seule fois, jamais d’XP dans une box');
const r2 = svc.openBox('normale');
check(r2.reveal.id === r1.reveal.id && save.get().boxes.normale === 1 && save.get().coins === coinsBefore + sum(r1, 'coins'), 'second clic avant acquittement : même résultat, rien de crédité en double');
svc.acknowledgeReveal(r1.reveal.id);
// 7. Récompenses : 3 / 5 / 7 gains par box, Strikers très rares, jamais d'XP
const { BOX_LOOT, chanceInBox } = await import('../src/data/rewards.js');
const { CHARACTER_SKINS, WEAPON_SKINS } = await import('../src/data/skins.js');
check(BOX_LOOT.normale.drops === 3 && BOX_LOOT.rare.drops === 5 && BOX_LOOT.legendaire.drops === 7, 'gains par box : 3 (normale), 5 (rare), 7 (légendaire)');
check(Object.values(BOX_LOOT).every((c) => Math.abs(c.table.reduce((t, e) => t + e.weight, 0) - 100) < 1e-9 && !c.table.some((e) => e.type === 'xp')), 'tables à 100 %, aucune XP');
check(chanceInBox('normale', 'striker') < 0.035 && chanceInBox('rare', 'striker') < 0.1 && chanceInBox('legendaire', 'striker') < 0.26, `Strikers très rares : ${['normale', 'rare', 'legendaire'].map((k) => `${k} ${(chanceInBox(k, 'striker') * 100).toFixed(1)} %`).join(', ')} par box`);
{
  const { BOX_TYPES: BT } = await import('../src/data/boxes.js');
  const legMyth = (k) => chanceInBox(k, 'striker') * (BT[k].rates.legendaire + BT[k].rates.mythique) / 100;
  check(legMyth('normale') < 0.0005 && legMyth('rare') < 0.004 && legMyth('legendaire') < 0.03 && BT.legendaire.rates.mythique <= 1.5,
    `légendaire ou mythique : ${['normale', 'rare', 'legendaire'].map((k) => `${(legMyth(k) * 100).toFixed(2)} %`).join(' / ')} par box`);
}
for (const [box, coins] of [['normale', [10, 30]], ['rare', [25, 70]], ['legendaire', [60, 160]]]) {
  const n = BOX_LOOT[box].drops, N = 4000;
  save.update({ owned: ['claude'], boxes: { normale: 0, rare: 0, legendaire: 0, [box]: N }, pendingReveal: null, characterSkinsOwned: [], weaponSkinsOwned: [] });
  let bad = 0, wrongCount = 0, strikerBoxes = 0, twoStrikers = 0, gemsSeen = 0, types = new Set();
  for (let k = 0; k < N; k++) {
    const r = svc.openBox(box);
    const rw = r.reveal.rewards;
    if (rw.length !== n) wrongCount++;
    const st = rw.filter((w) => w.type === 'striker').length;
    if (st) strikerBoxes++; if (st > 1) twoStrikers++;
    for (const w of rw) { types.add(w.converted ? `${w.type}*` : w.type); if (w.type === 'coins' && (w.amount < coins[0] || w.amount > coins[1])) bad++; if (w.type === 'gems') gemsSeen++; }
    svc.acknowledgeReveal(r.reveal.id);
    if (save.get().owned.length > 1) save.update({ owned: ['claude'] });   // on garde des Strikers à gagner
  }
  const expected = chanceInBox(box, 'striker') * 100, seen = (strikerBoxes / N) * 100;
  check(wrongCount === 0 && bad === 0 && twoStrikers === 0, `${box} : toujours ${n} gains, pièces entre ${coins[0]} et ${coins[1]}, jamais 2 Strikers (types : ${[...types].join(', ')})`);
  check(Math.abs(seen - expected) < Math.max(1.2, expected * 0.25) && gemsSeen > 0, `${box} : Striker dans ${seen.toFixed(1)} % des box (prévu ${expected.toFixed(1)} %), diamants possibles`);
}
const st7 = save.get();
save.update({ characterSkinsOwned: [], weaponSkinsOwned: [] });
for (let k = 0; k < 400; k++) { save.update({ boxes: { normale: 0, rare: 0, legendaire: 1 }, pendingReveal: null }); svc.acknowledgeReveal(svc.openBox('legendaire').reveal.id); }
const st7b = save.get();
check(new Set(st7b.characterSkinsOwned).size === st7b.characterSkinsOwned.length && st7b.characterSkinsOwned.length > 0 && st7b.characterSkinsOwned.every((x) => CHARACTER_SKINS.some((k) => k.id === x)), `skins de personnages débloqués et enregistrés sans doublon (${st7b.characterSkinsOwned.length}/${CHARACTER_SKINS.length})`);
{
  const { CHEST_WEAPON_SKINS } = await import('../src/data/skins.js');
  check(new Set(st7b.weaponSkinsOwned).size === st7b.weaponSkinsOwned.length && st7b.weaponSkinsOwned.length === CHEST_WEAPON_SKINS.length, `skins d'armes des coffres débloqués et enregistrés (${st7b.weaponSkinsOwned.length}/${CHEST_WEAPON_SKINS.length})`);
  check(![...st7b.weaponSkinsOwned, ...st7b.characterSkinsOwned].some((id) => [...CHARACTER_SKINS, ...WEAPON_SKINS].find((k) => k.id === id)?.source === 'pass'), 'les skins exclusifs du Passe ne sortent jamais des coffres');
}
check(st7.boxHistory.length === 50, 'historique des coffres ouverts enregistré (50 derniers)');
// Striker déjà possédé : converti en pièces
const { rollRewards } = await import('../src/game/rewards.js');
const conv = rollRewards('normale', { pickStriker: () => ({ striker: null, rarity: 'rare' }) }, () => 0);   // rng 0 : premier gain = Striker
check(conv.some((r) => r.type === 'striker' && r.converted && r.amount === 120), 'Striker déjà possédé : converti en 120 pièces (rare)');
// XP : sert uniquement au passe (plus de réserve, de niveaux de Striker ni d'achat d'XP)
const prog = await import('../src/game/progression.js');
const { COIN_PACKS } = await import('../src/data/shopOffers.js');
const shopOffers = await import('../src/data/shopOffers.js');
check(!('XP_OFFERS' in shopOffers) && !('buyXpOffer' in prog), 'plus d’offre d’XP en boutique');
{
  let gone = 0;
  for (const m of ['../src/game/strikerLevel.js', '../src/data/strikerLevels.js', '../src/ui/screens/xp.js']) { try { await import(m); } catch { gone++; } }
  check(gone === 3, 'ancien système d’XP des Strikers supprimé (niveaux, réserve, écran XP)');
}
save.update({ coins: 100, gems: 10, xpPool: 0, level: 7, xp: 30 });
prog.grantRewards({ coins: 40, gems: 2, xp: 500 });
check(save.get().coins === 140 && save.get().gems === 12 && save.get().xpPool === 0 && save.get().level === 7 && save.get().xp === 30, 'fin de combat : pièces et diamants seulement, l’XP ne fait monter aucun niveau');
const D = { stats: { pv: 1000, atk: 100, def: 50, vit: 10 } };
check(prog.statsAt(D, prog.COMBAT_LEVEL, 'basique').pv === prog.statsAt(D, prog.COMBAT_LEVEL, 'basique', 30).pv, 'les stats ne dépendent d’aucune XP (seulement du palier)');
check(prog.statsAt(D, 3, 'or').pv === Math.round(prog.statsAt(D, 3, 'basique').pv * 1.05) && prog.statsAt(D, 3, 'diamant').atk === Math.round(114 * 1.1), 'palier Or +5 %, Diamant +10 %');
save.update({ coins: 55 });
// paiements réels : rien sans paiement validé, jamais deux fois la même transaction
const pay = await import('../src/game/payments.js');
const res = await pay.requestPurchase(COIN_PACKS[0].productId);
check(!res.ok && res.error === 'unavailable' && save.get().coins === 55, 'pack de pièces sans paiement connecté : aucune pièce créditée');
check(pay.onPurchaseVerified(COIN_PACKS[0].productId, 'T1').ok && !pay.onPurchaseVerified(COIN_PACKS[0].productId, 'T1').ok && save.get().coins === 555, 'paiement validé crédité une seule fois par transaction');
check(pay.onPurchaseVerified('strike.gems.500', 'T2').ok && save.get().gems >= 500 && !pay.onPurchaseVerified('strike.gems.500', 'T2').ok, 'pack de diamants validé crédité une seule fois');
const gemsNow = save.get().gems;
const resG = await pay.requestPurchase('strike.gems.100');
check(!resG.ok && save.get().gems === gemsNow, 'diamants sans paiement connecté : rien crédité');
// trophées : par Striker (palier) + total du joueur (route)
const tro = await import('../src/game/trophies.js');
const { rankFor } = await import('../src/game/ranks.js');
const { RANKS, tierOfTrophies } = await import('../src/data/ranks.js');
check(RANKS.map((r) => `${r.id}@${r.minTrophies}`).join() === 'basique@0,or@500,diamant@1000', 'paliers : Basique 0, Or 500, Diamant 1 000 trophées (aucun autre seuil)');
save.update({ trophies: 0, trophyBest: 0, trophyClaimed: [], trophyBattles: [], coins: 0, strikerTrophies: {}, strikerXp: { claude: 99999 }, xpPool: 99999 });
check(rankFor('claude').id === 'basique', 'l’XP n’améliore plus le palier (ancienne XP ignorée)');
const w1 = tro.applyBattleTrophies('B1', 'win', 'claude');
check(w1.delta === 8 && w1.striker.after === 8 && tro.applyBattleTrophies('B1', 'win', 'claude').delta === 0 && tro.trophies() === 8 && tro.strikerTrophies('claude') === 8, 'victoire +8 trophées pour Claude (et au total), comptée une seule fois');
check(tro.applyBattleTrophies('B2', 'loss', 'claude').delta === -3 && tro.trophies() === 5 && tro.strikerTrophies('claude') === 5, 'défaite −3 trophées');
tro.applyBattleTrophies('B3', 'win', 'tobi');
check(tro.strikerTrophies('tobi') === 8 && tro.strikerTrophies('claude') === 5 && tro.trophies() === 13, 'trophées suivis séparément pour chaque Striker');
save.update({ strikerTrophies: { claude: 499 } });
check(rankFor('claude').id === 'basique', '499 trophées : Basique');
tro.applyBattleTrophies('B4', 'win', 'claude');
check(rankFor('claude').id === 'or' && tro.strikerTrophies('claude') === 507, '499 → 507 trophées : passe Or automatiquement');
save.update({ strikerTrophies: { claude: 999 } });
check(rankFor('claude').id === 'or' && tierOfTrophies(1000).id === 'diamant' && tierOfTrophies(5000).id === 'diamant' && tierOfTrophies(500).id === 'or' && tierOfTrophies(30).id === 'basique', '999 : Or ; 1 000 et plus : Diamant ; 30 : Basique');
tro.applyBattleTrophies('B5', 'win', 'claude');
check(rankFor('claude').id === 'diamant', '999 → 1 007 trophées : passe Diamant');
{
  const { appearanceFor } = await import('../src/game/appearance.js');
  check(appearanceFor('claude').rank === 'diamant', 'l’apparence (tenue) suit le palier par trophées');
}
// ===== Classement compétitif : Ruine → Zénith (points de classement, distincts des trophées et de l'XP) =====
{
  const R = await import('../src/data/ranked.js');
  const rk = await import('../src/game/ranked.js');
  check(R.RANKED_TIERS.map((t) => t.name).join() === 'Ruine,Onde,Flux,Nova,Vortex,Pulse,Apex,Titan,Nexus,Zénith', 'les dix rangs, dans l’ordre');
  const L = (p) => R.rankOf(p).label;
  check(L(0) === 'Ruine I' && L(999) === 'Ruine I' && L(1000) === 'Ruine II' && L(1999) === 'Ruine II' && L(2000) === 'Ruine III' && L(2999) === 'Ruine III' && L(3000) === 'Onde I',
    'seuils exacts : 0–999 Ruine I, 1 000 Ruine II, 2 000 Ruine III, 3 000 Onde I');
  const names = ['Ruine', 'Onde', 'Flux', 'Nova', 'Vortex', 'Pulse', 'Apex', 'Titan', 'Nexus'];
  let allOk = true;
  names.forEach((n, k) => ['I', 'II', 'III'].forEach((lv, l) => {
    const p = k * 3000 + l * 1000;
    if (L(p) !== `${n} ${lv}` || L(p + 999) !== `${n} ${lv}` || (p > 0 && L(p - 1) === `${n} ${lv}`)) allOk = false;
  }));
  check(allOk, 'tous les rangs : chaque niveau commence exactement à un multiple de 1 000, chaque rang à un multiple de 3 000');
  check(L(26999) === 'Nexus III' && L(27000) === 'Zénith' && L(99999) === 'Zénith' && R.rankOf(27000).level === null && R.nextRankStep(27500) === null, 'Zénith à 27 000 : rang ultime sans niveau, plafond du classement');
  check(R.rankOf(1250).progress === 250 && R.rankOf(1250).toNext === 750, 'progression dans le niveau : 1 250 pts = 250 / 1 000');
  // surplus conservé : 2 900 + 200 → Onde I avec 100 pts
  check(R.applyResult(2900, 'win') === 2900 + R.RANKED_TIERS[0].win && R.rankOf(2900 + 200).label === 'Onde I' && R.rankOf(3100).progress === 100, 'surplus conservé au passage de rang (2 900 + 200 = Onde I, 100 pts)');
  check(R.applyResult(20, 'loss') === 0 && R.applyResult(3010, 'loss') === 3000 && R.applyResult(4500, 'loss') === 4500 - R.RANKED_TIERS[1].loss, 'défaites : jamais sous 0 ni sous le début du rang atteint');
  check(R.applyResult(1000, 'loss') === 1000 - R.RANKED_TIERS[0].loss && R.rankOf(R.applyResult(1000, 'loss')).label === 'Ruine I', 'une défaite peut faire perdre un niveau (Ruine II → Ruine I)');
  check(R.applyResult(5000, 'flee') === R.applyResult(5000, 'loss'), 'abandon = défaite pour le classement');
  // combats : anti double attribution, sauvegarde, promotions
  save.update({ ranked: { points: 2900, best: 2900, seen: 2900, claimed: [], battles: [] }, pass: save.get().pass, coins: 0, gems: 0 });
  const xp0 = JSON.stringify(save.get().pass), st0 = JSON.stringify(save.get().strikerTrophies);
  const c1 = rk.applyRankedResult('M1', 'win');
  check(c1.after === 3050 && c1.promoted && c1.rankAfter.label === 'Onde I' && rk.rankedPoints() === 3050, 'victoire à 2 900 : +150 → Onde I (promotion)');
  check(rk.applyRankedResult('M1', 'win').duplicate && rk.rankedPoints() === 3050, 'un même combat ne donne des points qu’une fois');
  check(JSON.stringify(save.get().pass) === xp0 && JSON.stringify(save.get().strikerTrophies) === st0, 'le classement ne touche ni l’XP du passe ni les trophées des Strikers');
  const c2 = rk.applyRankedResult('M2', 'loss'), c3 = rk.applyRankedResult('M3', 'loss');
  check(c2.after === 3050 - R.RANKED_TIERS[1].loss && c3.after === 3000 && !c3.demoted && rk.rankedBest() === 3050, 'deux défaites à Onde I : 3 005 puis 3 000 (plancher du rang), rang conservé ; record 3 050');
  // route : récompenses débloquées selon le record, une seule fois, sauvegardées
  check(R.RANKED_ROAD.length === 36 && R.RANKED_ROAD.filter((p) => p.major).length === 9 && R.RANKED_ROAD.every((p) => !p.reward.xp), 'route : 27 récompenses de niveau + 9 grandes récompenses de rang, jamais d’XP');
  const road = rk.rankedRoad();
  check(road.filter((p) => p.state === 'ready').map((p) => p.id).join() === 'm0,m1,m2,r1' && road.find((p) => p.id === 'm3').state === 'locked', '3 050 pts : 500, 1 500, 2 500 et la grande récompense d’Onde (3 000) débloquées ; 3 500 verrouillée');
  const g = save.get();
  check(rk.claimRankedReward('m0').ok && save.get().coins === g.coins + R.RANKED_ROAD[0].reward.coins && !rk.claimRankedReward('m0').ok && !rk.claimRankedReward('m3').ok, 'récupérée une seule fois ; verrouillée refusée');
  const b0 = save.get().boxes.rare;
  check(rk.claimRankedReward('r1').ok && save.get().boxes.rare === b0 + 1, 'grande récompense d’Onde : box rare ajoutée à MES BOX');
  check(rk.rankedRoad().find((p) => p.id === 'm0').state === 'claimed' && save.get().ranked.claimed.includes('r1'), 'état « récupérée » sauvegardé');
  // skins : vrais skins ajoutés ; déjà possédés → pièces
  save.update({ ranked: { ...save.get().ranked, points: 6000, best: 6000 }, weaponSkinsOwned: [] });
  check(rk.claimRankedReward('r2').ok && save.get().weaponSkinsOwned.includes('camo'), 'Flux : skin d’arme Camouflage débloqué');
  save.update({ ranked: { ...save.get().ranked, points: 12000, best: 12000 }, characterSkinsOwned: ['claude-nuit'] });
  const coins4 = save.get().coins;
  const r4 = rk.claimRankedReward('r4');
  check(r4.ok && r4.reward.convertedSkin === 'claude-nuit' && save.get().coins > coins4, 'skin déjà possédé : converti en pièces (pas de doublon)');
  // migration des anciennes sauvegardes
  const mg = R.migrateRanked({ trophies: 412, trophyBest: 430, trophyRoadClaimed: [0, 2, 3] });
  check(mg.points === 4120 && mg.best === 4300 && mg.claimed.join() === 'm0,m2,m3' && mg.seen === 4300, 'migration : anciens trophées ×10 en points, chemins récupérés repris (pas de double récompense)');
  check(R.migrateRanked({}).points === 0 && R.migrateRanked({}).claimed.length === 0, 'migration d’une nouvelle partie : 0 point');
}
{
  // migration : trophées existants répartis entre les Strikers selon les anciens points de classement
  const { migrateStrikerTrophies } = await import('../src/save/storage.js');
  const m1 = migrateStrikerTrophies({ trophies: 100, rankPoints: { claude: 60, tobi: 30, nova: 10, kaiser: 0 }, selected: 'claude' });
  check(m1.claude === 60 && m1.tobi === 30 && m1.nova === 10 && !m1.kaiser, 'migration : 100 trophées répartis (60 / 30 / 10) selon les combats de chaque Striker');
  const m2 = migrateStrikerTrophies({ trophies: 7, rankPoints: { claude: 1, tobi: 1, nova: 1 } });
  check(Object.values(m2).reduce((a, b) => a + b, 0) === 7, 'migration : le total de trophées est conservé exactement');
  check(JSON.stringify(migrateStrikerTrophies({ trophies: 9, rankPoints: {}, selected: 'tobi' })) === '{"tobi":9}' && JSON.stringify(migrateStrikerTrophies({ trophies: 0, rankPoints: { claude: 5 } })) === '{}', 'migration : sans historique, trophées au Striker actif ; 0 trophée = rien');
}
// profil
const prof = await import('../src/game/profile.js');
check(!prof.validateName('ab').ok && !prof.validateName('x'.repeat(17)).ok && !prof.validateName('   ').ok, 'nom vide / trop court / trop long refusé');
check(!prof.validateName('Gros Connard').ok && !prof.validateName('<script>').ok, 'nom inapproprié ou caractères interdits refusé');
check(prof.setPlayerName('  Max  Striker ').ok && save.get().playerName === 'Max Striker', 'nom valide enregistré (espaces nettoyés)');
check(prof.setAvatar('eclair').ok && save.get().avatar === 'eclair' && !prof.setAvatar('inconnu').ok, 'photo de profil enregistrée');
save.update({ boxes: { normale: 0, rare: 0, legendaire: 0 } });
check(!svc.openBox('normale').ok, 'ouverture impossible sans box');
const { CHARACTERS } = await import('../src/data/characters.js');
check(CHARACTERS[0].id === 'claude' && CHARACTERS[0].name === 'Claude', 'Claude reste le premier Striker');
check(['tobi', 'nova', 'brutus', 'selena', 'kaiser'].every((id) => CHARACTERS.some((c) => c.id === id && c.model === id)), '5 nouveaux Strikers détaillés');
check(['commun', 'rare', 'epique', 'legendaire', 'mythique'].every((r) => CHARACTERS.filter((c) => c.id !== 'claude').some((c) => c.rarity === r)), 'une rareté différente pour chacun');
check(new Set(CHARACTERS.map((c) => c.id)).size === CHARACTERS.length, 'identifiants uniques');
// COMBAT : une seule arène, deux modes (Duel / Duo), victoire à 3, 5 ou 10 éliminations
{
  const { DEFAULT_BATTLE_PREFS } = await import('../src/data/battleModes.js');
  const { ARENA_MAPS, ARENA_MAP_LIST } = await import('../src/arena/maps.js');
  check(ARENA_MAP_LIST.length === 4 && ARENA_MAPS.map1 && !ARENA_MAPS.map2, 'l’arène compte 4 cartes (Prairie en premier)');
  check(DEFAULT_BATTLE_PREFS.arenaFormat === 'duel' && DEFAULT_BATTLE_PREFS.arenaKills === 5 && save.get().battlePrefs.arenaKills === 5, 'par défaut : Duel, 5 éliminations pour gagner');
  let gone = 0;
  for (const m of ['../src/ui/screens/battle.js', '../src/game/battleEngine.js', '../src/render/battleScene.js', '../src/render/arenas.js']) { try { await import(m); } catch { gone++; } }
  check(gone === 4, 'anciens modes au tour par tour et leurs cartes retirés');
  const g = await import('../src/arena/grid.js');
  check(g.useMap('map2').id === 'map1' && g.MAP_ID === 'map1', 'une carte inconnue (ancienne Map2) ramène à l’arène');
}
// COMBAT EN ARÈNE — Map1 : plan, collisions, lignes de tir, chemins
{
  const g = await import('../src/arena/grid.js');
  check(g.LAYOUT.every((r) => r.length === g.COLS) && g.LAYOUT.every((r, i) => [...r].reverse().join('').replace('P', 'E') === g.LAYOUT[g.ROWS - 1 - i].replace('P', 'E')), `Map1 : plan ${g.COLS}×${g.ROWS} symétrique (carte équitable)`);
  const types = new Set(g.LAYOUT.join(''));
  check(['B', 'W', 'C', 'R', '-', '.'].every((t) => types.has(t)) && g.findTiles('P').length === 1 && g.findTiles('E').length === 1, 'Map1 : buissons, murs, caisses, rochers, chemins, un départ par camp');
  const [px, pz] = g.spawnOf('P'), [ex, ez] = g.spawnOf('E');
  const path = g.findPath(px, pz, ex, ez);
  check(path.length > 0 && Math.hypot(path.at(-1)[0] - ex, path.at(-1)[1] - ez) < 0.01, `Map1 : un chemin relie les deux départs (${path.length} étapes)`);
  check(!g.lineOfSight(px, pz, ex, ez), 'Map1 : pas de ligne de tir directe d’un départ à l’autre');
  const [wx, wz] = g.cellCenter(8, 26);
  const [cx, cz] = g.collide(wx, wz + 1.0, 0.45);
  check(cz >= wz + g.TILE / 2 + 0.45 - 1e-6, 'collision : un personnage est repoussé hors d’un mur');
  check(g.raycast(...g.cellCenter(8, 28), 0, -1, 20) < 2.2 && g.raycast(...g.cellCenter(10, 28), 0, -1, 5) === 5, 'tir : un mur arrête le projectile, le chemin dégagé non');
  check(g.inBush(...g.cellCenter(0, 29)) && !g.inBush(px, pz), 'buissons : détection de la tuile');
}
// ULTI
{
  const { ULTIS, ultiOf } = await import('../src/data/ultis.js');
  const { CHARACTERS } = await import('../src/data/characters.js');
  check(CHARACTERS.every((c) => ultiOf(c.id).owner === c.id) && new Set(ULTIS.map((u) => u.owner)).size === CHARACTERS.length && new Set(ULTIS.map((u) => u.kind)).size === CHARACTERS.length,
    `chaque Striker a son propre ulti (${ULTIS.map((u) => u.name).join(', ')})`);
  check(ULTIS.every((u) => u.range > 0 && u.chargeDmg > 0 && u.chargePerSec > 0 && (u.dmg > 0 || u.dps > 0) && u.stats?.length === 3), 'chaque ulti a ses caractéristiques (portée, dégâts, charge, fiche)');
}
// PASSE DE COMBAT
{
  const bp = await import('../src/game/battlePass.js');
  const data = await import('../src/data/battlePass.js');
  const { getCharacterSkin, getWeaponSkin } = await import('../src/data/skins.js');
  save.reset();
  const t0 = Date.UTC(2026, 9, 17, 12);
  const realNow = Date.now;
  Date.now = () => t0; // horloge figée sur la date du test (le passe dépend du jour)
  const p0 = bp.ensurePass(t0);
  check(p0.season === 1 && p0.xp === 0 && !p0.premium && p0.missions.length === 3 && new Set(p0.missions.map((m) => m.id)).size === 3, `passe : saison 1 « ${data.seasonAt(t0).name} », 3 missions différentes`);
  check(JSON.stringify(bp.missionsForDay('2026-10-17')) === JSON.stringify(bp.missionsForDay('2026-10-17')), 'missions identiques toute la journée');
  check(data.PASS_REWARDS.length === 30 && data.PASS_REWARDS.every((r) => r.free && r.premium), '30 paliers, piste gratuite et premium');
  const skinIds = data.PASS_REWARDS.flatMap((r) => [r.free, r.premium]).flatMap((r) => [r.characterSkin && getCharacterSkin(r.characterSkin), r.weaponSkin && getWeaponSkin(r.weaponSkin)]).filter(Boolean);
  check(skinIds.length === 4 && skinIds.every((k) => k.source === 'pass'), '4 skins exclusifs au Passe (dont Kaiser Éclipse au palier 30)');
  const allRewards = data.PASS_REWARDS.flatMap((r) => [r.free, r.premium]);
  const KINDS = ['coins', 'gems', 'characterSkin', 'weaponSkin'];
  check(allRewards.every((r) => Object.keys(r).every((k) => KINDS.includes(k))), 'passe : seulement pièces, diamants et skins (ni XP, ni box, ni personnage jouable)');
  check(!bp.claimTier(1, 'free').ok, 'palier 1 non atteint : récompense refusée');
  bp.addPassXp(250, t0);
  check(bp.passLevel(save.get().pass.xp).tier === 2, '250 XP de passe = palier 2');
  const c0 = save.get().coins;
  const r1 = bp.claimTier(1, 'free');
  check(r1.ok && save.get().coins === c0 + data.PASS_REWARDS[0].free.coins && !bp.claimTier(1, 'free').ok, 'récompense gratuite récupérée une seule fois');
  check(bp.tierState(1, 'premium') === 'premium' && !bp.claimTier(1, 'premium').ok, 'récompense premium bloquée sans premium');
  // premium : 7,99 €, uniquement après un paiement validé (aucun paiement simulé)
  check(data.PASS_PREMIUM.price === 7.99 && data.PASS_PREMIUM.label === '7,99 €', 'premium du passe : 7,99 €');
  const pay = await import('../src/game/payments.js');
  save.update({ gems: 1000 });
  const noPay = await pay.requestPurchase(data.PASS_PREMIUM.productId);
  check(!noPay.ok && noPay.error === 'unavailable' && !save.get().pass.premium && save.get().gems === 1000, 'sans système de paiement : premium NON débloqué, rien débité');
  check(!('buyPremium' in bp), 'plus de déblocage du premium avec des diamants');
  // provider de test : paiement refusé par la vérification → rien
  pay.registerPaymentProvider({ purchase: async () => ({ transactionId: 'TX-BAD', receipt: 'bad' }), verify: async () => false });
  const bad = await pay.requestPurchase(data.PASS_PREMIUM.productId);
  check(!bad.ok && bad.error === 'invalid' && !save.get().pass.premium, 'reçu invalide : premium non débloqué');
  pay.registerPaymentProvider({ purchase: async () => { throw new Error('annulé'); }, verify: async () => true });
  check(!(await pay.requestPurchase(data.PASS_PREMIUM.productId)).ok && !save.get().pass.premium, 'achat annulé : premium non débloqué');
  pay.registerPaymentProvider({ purchase: async () => ({ transactionId: 'TX-PASS-1', receipt: 'ok' }), verify: async () => true });
  const okPay = await pay.requestPurchase(data.PASS_PREMIUM.productId);
  check(okPay.ok && save.get().pass.premium && save.get().pass.premiumTx === 'TX-PASS-1' && save.get().gems === 1000, 'paiement validé : premium débloqué (aucun diamant débité)');
  check(!pay.onPurchaseVerified(data.PASS_PREMIUM.productId, 'TX-PASS-1').ok && !pay.onPurchaseVerified(data.PASS_PREMIUM.productId, null).ok, 'même transaction ou transaction vide : refusée');
  pay.registerPaymentProvider(null);
  {
    const { save: again } = await import('../src/save/storage.js?premium');
    check(again.get().pass.premium === true && again.get().pass.premiumTx === 'TX-PASS-1', 'premium conservé après redémarrage du jeu');
  }
  const got = bp.claimAll();
  check(got.length === 3 && bp.passClaimable() === 0, `tout récupérer : ${got.length} récompenses (palier 2 gratuit, paliers 1-2 premium)`);
  const passXp = save.get().pass.xp;
  check(bp.claimAll().length === 0 && save.get().pass.xp === passXp && !bp.claimTier(1, 'premium').ok, 'récompenses jamais récupérées deux fois, et elles ne donnent pas d’XP');
  // missions
  const m = save.get().pass.missions[0], def = data.MISSION_POOL.find((x) => x.id === m.id);
  check(!bp.claimMission(m.id, t0).ok, 'mission non terminée : rien à récupérer');
  bp.trackPass(def.event === 'any_play' ? 'arena_play' : def.event, def.target, t0);
  const xpBefore = save.get().pass.xp;
  const cm = bp.claimMission(m.id, t0);
  check(cm.ok && save.get().pass.xp === xpBefore + def.xp && !bp.claimMission(m.id, t0).ok, `mission « ${def.text} » terminée : +${def.xp} XP de passe, une seule fois`);
  bp.ensurePass(t0 + 86400000);
  check(save.get().pass.missions.every((x) => !x.claimed && x.progress === 0) && save.get().pass.xp === xpBefore + def.xp, 'le lendemain : nouvelles missions, XP du passe conservée');
  Date.now = realNow;
  bp.ensurePass(Date.UTC(2026, 10, 20));
  check(save.get().pass.season === 2 && save.get().pass.xp === 0 && !save.get().pass.premium, 'nouvelle saison : passe remis à zéro');
}
// RÉCOMPENSES QUOTIDIENNES
{
  const dl = await import('../src/game/daily.js');
  save.reset();
  const day = (d) => Date.UTC(2026, 9, d, 10);
  const c0 = save.get().coins;
  check(dl.dailyStatus(day(1)).claimable && dl.dailyStatus(day(1)).day === 0, 'cadeau du jour 1 disponible');
  const r1 = dl.claimDaily(day(1));
  check(r1.ok && save.get().coins === c0 + 200 && !dl.claimDaily(day(1)).ok, 'jour 1 : +200 pièces, une seule fois par jour');
  dl.claimDaily(day(2)); dl.claimDaily(day(3));
  check(dl.dailyStatus(day(4)).day === 3, 'jours consécutifs : la série avance (jour 4)');
  check(dl.dailyStatus(day(6)).day === 0 && dl.dailyStatus(day(6)).streakBroken, 'un jour manqué : la série repart au jour 1');
  for (let d = 4; d <= 7; d++) dl.claimDaily(day(d));
  check(save.get().daily.next === 0, 'après le 7e jour, le cycle recommence');
}
// Armes : une arme unique par Striker, c'est la seule qu'il utilise
{
  const { WEAPONS, weaponOf } = await import('../src/data/weapons.js');
  const { CHARACTERS } = await import('../src/data/characters.js');
  const { equippedWeapon } = await import('../src/game/weapons.js');
  const { appearanceFor } = await import('../src/game/appearance.js');
  const owners = CHARACTERS.map((c) => weaponOf(c.id).owner);
  check(CHARACTERS.every((c) => weaponOf(c.id).owner === c.id) && new Set(owners).size === CHARACTERS.length && WEAPONS.length === CHARACTERS.length, `chaque Striker a sa propre arme (${WEAPONS.length} armes pour ${CHARACTERS.length} Strikers)`);
  check(CHARACTERS.every((c) => equippedWeapon(c.id) === weaponOf(c.id).id && appearanceFor(c.id).weapon === weaponOf(c.id).id), 'le Striker utilise toujours son arme (impossible d’en changer)');
  check(WEAPONS.every((w) => { const a = w.arena; return a.dmg > 0 && a.pellets >= 1 && a.burst >= 1 && a.mag >= 1 && a.reload > 0 && a.range > 0 && a.speed > 0; }), 'chaque arme a ses caractéristiques d’arène');
}
// Boutique du jour : skins qui changent chaque jour, packs en promo achetables une fois par jour
{
  const ds = await import('../src/game/dailyShop.js');
  const { WEAPON_SKINS, CHARACTER_SKINS } = await import('../src/data/skins.js');
  const day = (d, h = 10) => new Date(2026, 9, d, h).getTime();
  const o1 = ds.dailyOffers(day(20, 9)), o1b = ds.dailyOffers(day(20, 22));
  check(JSON.stringify(o1) === JSON.stringify(o1b) && o1.characterSkin && o1.weaponSkin && o1.packs.length === 3, 'boutique du jour : 1 skin de perso, 1 skin d’arme, 3 packs, identiques toute la journée');
  const days = Array.from({ length: 14 }, (_, i) => ds.dailyOffers(day(1 + i)));
  check(new Set(days.map((o) => o.characterSkin.id + o.weaponSkin.id)).size > 3, 'les skins du jour changent d’un jour à l’autre');
  const pass = new Set([...CHARACTER_SKINS, ...WEAPON_SKINS].filter((k) => k.source === 'pass').map((k) => k.id));
  check(days.every((o) => !pass.has(o.characterSkin.skin.id) && !pass.has(o.weaponSkin.skin.id)), 'jamais de skin exclusif au Passe dans la boutique du jour');
  check(o1.packs.every((p) => p.discount >= 40 && (p.price.coins ?? p.price.gems) < (p.value.coins ?? p.value.gems)), `packs en promo (${o1.packs.map((p) => '−' + p.discount + ' %').join(', ')})`);
  save.reset();
  save.update({ coins: 5000, gems: 1000, boxes: { normale: 0, rare: 0, legendaire: 0 } });
  const r1 = ds.buyDaily('pack-depart', day(20));
  const st = save.get();
  check(r1.ok && st.coins === 5000 - 1090 + 1000 && st.boxes.normale === 3, 'Pack Départ : −1 090 pièces, +3 Box normales, +1 000 pièces');
  check(!ds.buyDaily('pack-depart', day(20, 18)).ok && ds.isSoldOut('pack-depart', day(20, 18)), 'un pack ne s’achète qu’une fois par jour');
  check(ds.buyDaily('pack-depart', day(21)).ok && save.get().boxes.normale === 6, 'le lendemain, le pack est de nouveau disponible');
  const g0 = save.get().gems;
  const r2 = ds.buyDaily('pack-legende', day(21));
  check(r2.ok && save.get().gems === g0 - 220 && save.get().boxes.legendaire === 1 && save.get().boxes.rare === 1, 'Pack Légende : −220 diamants, +1 Box légendaire, +1 Box rare');
  const o = ds.dailyOffers(day(21));
  const r3 = ds.buyDaily(o.weaponSkin.id, day(21));
  check(r3.ok && save.get().weaponSkinsOwned.includes(o.weaponSkin.skin.id) && !ds.buyDaily(o.weaponSkin.id, day(21)).ok, `skin d’arme du jour (${o.weaponSkin.skin.name}) acheté une fois, ajouté à la collection`);
  check(!ds.buyDaily(o1.characterSkin.id === o.characterSkin.id ? 'skin:inexistant' : o1.characterSkin.id, day(21)).ok, 'une offre d’un autre jour n’est pas achetable');
  save.update({ gems: 10, coins: 10 });
  const r4 = ds.buyDaily(o.characterSkin.id, day(21));
  check(!r4.ok && r4.error === 'gems' && !save.get().characterSkinsOwned.includes(o.characterSkin.skin.id), 'sans assez de diamants : refusé, rien n’est débité ni débloqué');
}
// Skins : seuls les skins possédés sont proposés ; skins d'armes uniquement sur les armes compatibles
{
  const sk = await import('../src/game/skins.js');
  const data = await import('../src/data/skins.js');
  save.reset();
  save.update({ characterSkinsOwned: ['claude-nuit'], weaponSkinsOwned: ['camo'] });
  check(sk.ownedSkinsFor('claude').map((k) => k.id).join() === 'claude-nuit' && sk.ownedSkinsFor('tobi').length === 0, 'collection : seuls les skins de personnage possédés sont listés');
  check(sk.ownedWeaponSkinsFor('lumiere').map((k) => k.id).join() === 'camo', 'armes : seuls les skins d’armes possédés sont listés');
  check(!sk.equipCharacterSkin('claude', 'claude-blanc').ok && !sk.equipWeaponSkin('lumiere', 'neon').ok, 'skin non possédé : impossible à équiper');
  const only = { id: 'test-only', name: 'Test', rarity: 'rare', weapons: ['lumiere'] };
  data.WEAPON_SKINS.push(only);
  save.update({ weaponSkinsOwned: ['camo', 'test-only'] });
  const other = (await import('../src/data/weapons.js')).WEAPONS.find((w) => w.id !== 'lumiere').id;
  check(data.skinFitsWeapon(only, 'lumiere') && !data.skinFitsWeapon(only, other) && !sk.ownedWeaponSkinsFor(other).some((k) => k.id === 'test-only'), 'skin d’arme réservé à une arme : proposé uniquement pour elle');
  check(!sk.equipWeaponSkin(other, 'test-only').ok && sk.equipWeaponSkin('lumiere', 'test-only').ok && sk.equippedWeaponSkin('lumiere')?.id === 'test-only', 'skin d’arme incompatible refusé, compatible appliqué');
  save.update((st) => ({ weaponSkin: { ...st.weaponSkin, [other]: 'test-only' } }));
  check(sk.equippedWeaponSkin(other) === null, 'un skin incompatible n’est jamais affiché sur une autre arme');
  data.WEAPON_SKINS.pop();
}
// --- Cartes de l'arène et nuage noir ---
{
  const { ARENA_MAPS } = await import('../src/arena/maps.js');
  const { safeHalf, cloudDist, CLOUD } = await import('../src/arena/cloud.js');
  check(Object.keys(ARENA_MAPS).join() === 'map1,river,desert,glacier', '4 cartes : Prairie, Rivière, Désert, Glacier');
  for (const m of Object.values(ARENA_MAPS)) {
    const L = m.layout, R = L.length, C = L[0].length;
    let sym = L.every((r) => r.length === C);
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { const n = (x) => (x === 'P' ? 'E' : x); if (n(L[r][c]) !== n(L[R - 1 - r][C - 1 - c])) sym = false; }
    const pos = (ch) => { for (let r = 0; r < R; r++) { const c = L[r].indexOf(ch); if (c >= 0) return [c, r]; } };
    const block = (c, r) => c < 0 || r < 0 || c >= C || r >= R || 'WCRw'.includes(L[r][c]);
    const seen = new Set([pos('P').join()]), q = [pos('P')];
    while (q.length) { const [c, r] = q.pop(); for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = `${c + dc},${r + dr}`; if (!block(c + dc, r + dr) && !seen.has(k)) { seen.add(k); q.push([c + dc, r + dr]); } } }
    let free = 0; for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (!block(c, r)) free++;
    check(sym && seen.has(pos('E').join()) && seen.size === free && m.bonus.every(([c, r]) => !block(c, r)), `${m.title} : symétrique, tout est accessible, bonus sur des cases libres`);
  }
  const [x0, z0] = safeHalf(0), [x1, z1] = safeHalf(CLOUD.start + CLOUD.shrink / 2), [x2, z2] = safeHalf(999);
  check(safeHalf(CLOUD.start)[0] === x0 && x1 < x0 && z1 < z0 && Math.abs(x2 - CLOUD.minHX) < 1e-9 && Math.abs(z2 - CLOUD.minHZ) < 1e-9, 'nuage : immobile avant 25 s, puis se resserre jusqu’à la zone minimale');
  check(cloudDist(0, 0, x2, z2) < 0 && cloudDist(0, z2 + 1, x2, z2) > 0 && cloudDist(x2 + 1, 0, x2, z2) > 0, 'nuage : le centre est sûr, les bords sont dans le nuage');
}
console.log(fail ? `${fail} échec(s)` : "TOUS LES TESTS PASSENT");
if (fail) process.exit(1);
