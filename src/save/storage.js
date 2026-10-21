// Sauvegarde LOCALE (localStorage de ce navigateur). Toute la progression du joueur est
// centralisée dans un seul objet. Pas de synchronisation entre appareils.
import { FREE_BOX, TEST_BALANCE } from '../data/boxes.js';
import { CHARACTERS } from '../data/characters.js';
import { DEFAULT_BATTLE_PREFS } from '../data/battleModes.js';
import { migrateRanked } from '../data/ranked.js';

// Clé de sauvegarde historique : NE PAS la renommer (sinon toutes les progressions seraient perdues).
const KEY = 'eclats-ether-save-v1';
export const BACKUP_KEY = 'eclats-ether-save-backup'; // copie de secours avant de reprendre la partie d'un compte
export const SAVE_VERSION = 3;

const DEFAULT_SAVE = {
  version: SAVE_VERSION,
  playerName: 'Voyageur',
  account: null,           // nom du compte en ligne connecté sur cet appareil (null : pas de compte)
  loginSkipped: false,     // « Jouer sans compte » choisi à l'écran de connexion
  level: 1,
  xp: 0,
  coins: 800,
  gems: 60,                // diamants
  owned: ['claude', 'pip', 'brindille', 'kaela'],
  obtainedAt: {},          // id -> date d'obtention
  favorites: [],
  selected: 'claude',
  strikerTrophies: {},     // id -> trophées gagnés avec ce Striker (fixent son palier : 500 Or, 1 000 Diamant)
  rankPoints: {},          // (ancien) points de classement par Striker : conservés, servent à la migration des trophées
  strikerXp: {},           // (ancien) XP donnée aux Strikers : conservée, n'a plus d'effet
  xpPool: 0,               // (ancien) réserve d'XP : conservée, n'a plus d'effet (l'XP sert uniquement au passe)
  weaponsOwned: [],        // armes achetées
  weaponXp: {},            // id d'arme -> XP totale (amélioration)
  equipped: {},            // id de Striker -> id de l'arme équipée
  skinsOwned: [],          // skins possédés (aucun skin pour l'instant)
  equippedSkin: {},        // id de Striker -> id du skin porté
  purchases: [],           // transactions de paiement réel déjà créditées (anti double crédit)
  avatar: 'defaut',        // photo de profil (data/profile.js), ou 'photo' = photo personnelle
  avatarPhoto: null,       // photo personnelle choisie dans la photothèque (JPEG carré 256 px, data URL)
  playerId: null,          // identifiant joueur (généré au premier lancement)
  trophies: 0,             // total des trophées des Strikers
  trophyBest: 0,           // record de ce total (sert à la migration du classement)
  trophyClaimed: [],       // (ancienne route des trophées) paliers récupérés : conservés
  trophyRoadClaimed: [],   // (route précédente) chemins récupérés : conservés, repris par la migration du classement
  trophyBattles: [],       // derniers combats déjà comptés (anti double attribution)
  ranked: null,            // classement compétitif (data/ranked.js) : { points, best, seen, claimed, battles }
  characterSkinsOwned: [], // skins de personnages débloqués
  weaponSkinsOwned: [],    // skins d'armes débloqués
  weaponSkin: {},          // id d'arme -> skin appliqué
  boxHistory: [],          // 50 dernières ouvertures de coffres et leurs récompenses
  items: { potion: 2, bombe: 1, elixir: 0 },
  boxes: { normale: 0, rare: 0, legendaire: 0 }, // box ACHETÉES en stock, non ouvertes
  freeBox: { stored: 1, lastTick: null },        // box GRATUITES en stock (max 5) + début de la période en cours
  grants: ['claude-starter'],                                    // dotations uniques déjà appliquées (ex. solde de test)
  pendingReveal: null,                           // résultat d'ouverture pas encore affiché
  // Amis : gérés par un futur serveur (game/social.js). Ces champs locaux ne sont plus utilisés.
  friends: [],
  requestsIn: [],
  requestsOut: [],
  record: { wins: 0, losses: 0 },
  battlePrefs: { ...DEFAULT_BATTLE_PREFS }, // COMBAT : mode (Duel / Duo) et éliminations pour gagner
  survivalBest: 0,         // (ancien mode Survie, retiré) : conservé
  bossWins: 0,             // (ancien mode Boss, retiré) : conservé
  arenaRecord: { wins: 0, losses: 0 }, // Combat en arène (Map1)
  arenaSurvivalBest: 0,    // Survie en arène : record de vagues tenues
  ultisOwned: ['bond'],    // ultis débloqués (Bond fracassant offert)
  ultiEquipped: 'bond',    // ulti utilisé en arène (null = aucun)
  pass: null,              // Passe de combat (game/battlePass.js) : saison, XP, premium, paliers récupérés, missions du jour
  sound: true,             // effets sonores
  daily: { next: 0, last: null }, // récompenses de connexion (jour suivant du cycle, dernier jour récupéré)
  shop: { day: null, bought: [] }, // boutique du jour : jour affiché et offres déjà achetées ce jour-là
  shopSeenDay: null,       // dernier jour où les offres du jour ont été vues (pastille « ! » de la boutique)
  stats: { boxesOpened: 0 },
};

let state = load();
persist(); // enregistre tout de suite les migrations et dotations appliquées au chargement
const listeners = new Set();

/** Normalise et migre une sauvegarde lue (appareil ou compte en ligne). */
function fromData(parsed) {
      const s = { ...structuredClone(DEFAULT_SAVE), ...parsed };
      // trophées par Striker absents (sauvegarde d'avant leur création) : migrés depuis les trophées enregistrés
      if (parsed.strikerTrophies === undefined) s.strikerTrophies = migrateStrikerTrophies(s);
      s.items = { ...DEFAULT_SAVE.items, ...s.items };
      s.boxes = { ...DEFAULT_SAVE.boxes, ...s.boxes };
      // Migration v2 -> v3 : l'ancienne box gratuite horaire devient le stock de box gratuites.
      if (s.freeBox?.stored === undefined) s.freeBox = { stored: 1, lastTick: Date.now() };
      s.grants = s.grants ?? [];
      s.version = SAVE_VERSION;
      return finalize(s);
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return fromData(JSON.parse(raw));
  } catch { /* stockage indisponible : valeurs par défaut */ }
  return finalize(structuredClone(DEFAULT_SAVE));
}

function finalize(s) {
  if (s.freeBox.lastTick == null) s.freeBox.lastTick = Date.now();
  s.freeBox.stored = Math.min(s.freeBox.stored, FREE_BOX.maxStored);
  s.rankPoints = s.rankPoints ?? {};
  s.strikerXp = s.strikerXp ?? {};
  s.xpPool = s.xpPool ?? 0;
  s.weaponsOwned = s.weaponsOwned ?? [];
  s.weaponXp = s.weaponXp ?? {};
  s.equipped = s.equipped ?? {};
  s.skinsOwned = s.skinsOwned ?? [];
  s.equippedSkin = s.equippedSkin ?? {};
  s.purchases = s.purchases ?? [];
  // Migration : nouveaux champs du profil, des trophées et des skins (sans toucher aux données existantes)
  for (const [k, v] of Object.entries({ avatar: 'defaut', trophies: 0, trophyBest: 0, trophyClaimed: [], trophyRoadClaimed: [], trophyBattles: [],
    characterSkinsOwned: [], weaponSkinsOwned: [], weaponSkin: {}, boxHistory: [] })) if (s[k] === undefined) s[k] = structuredClone(v);
  s.battlePrefs = { ...DEFAULT_BATTLE_PREFS, ...(s.battlePrefs ?? {}) };
  s.survivalBest = s.survivalBest ?? 0;
  s.bossWins = s.bossWins ?? 0;
  s.arenaRecord = s.arenaRecord ?? { wins: 0, losses: 0 };
  s.arenaSurvivalBest = s.arenaSurvivalBest ?? 0;
  s.daily = s.daily ?? { next: 0, last: null };
  s.shop = s.shop ?? { day: null, bought: [] };
  if (!s.ultisOwned) { s.ultisOwned = ['bond']; s.ultiEquipped = 'bond'; }
  s.strikerTrophies = s.strikerTrophies ?? {};
  // Classement compétitif (Ruine → Zénith) : créé depuis l'ancien total de trophées, sans rien effacer
  if (!s.ranked) s.ranked = migrateRanked(s);
  s.ranked = { points: 0, best: 0, seen: 0, claimed: [], battles: [], ...s.ranked };
  if (!s.playerId) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    s.playerId = 'STK-' + Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }
  // Anciennes cartes d'XP (version précédente) : converties en points dans la réserve, rien n'est perdu
  if (s.xpCards) {
    s.xpPool += (s.xpCards.petite ?? 0) * 50 + (s.xpCards.moyenne ?? 0) * 150 + (s.xpCards.grande ?? 0) * 400;
    delete s.xpCards;
  }
  // Claude, premier personnage officiel : offert une fois aux sauvegardes existantes, et équipé.
  if (!s.grants.includes('claude-starter')) {
    if (!s.owned.includes('claude')) s.owned = ['claude', ...s.owned];
    s.selected = 'claude';
    s.grants = [...s.grants, 'claude-starter'];
  }
  // Striker actif retiré du jeu (mis de côté) : on repasse sur Claude. Les Strikers possédés restent
  // enregistrés et réapparaîtront s'ils reviennent.
  if (!CHARACTERS.some((c) => c.id === s.selected)) s.selected = 'claude';
  if (TEST_BALANCE) {
    s.coins = Math.max(s.coins, TEST_BALANCE.coins);
    s.gems = Math.max(s.gems, TEST_BALANCE.gems);
  }
  return s;
}

/**
 * Migration : les trophées enregistrés (total du joueur) sont répartis entre les Strikers avec lesquels ils
 * ont été gagnés, au prorata des anciens points de classement (attribués lors des mêmes combats classés).
 * Le total est conservé exactement ; rien n'est remis à zéro.
 */
export function migrateStrikerTrophies(s) {
  const total = Math.max(0, Math.round(s.trophies ?? 0));
  const pts = Object.entries(s.rankPoints ?? {}).filter(([, v]) => v > 0);
  if (!total) return {};
  if (!pts.length) return { [s.selected ?? 'claude']: total };
  const sum = pts.reduce((a, [, v]) => a + v, 0);
  const shares = pts.map(([id, v]) => { const x = (total * v) / sum; return { id, n: Math.floor(x), r: x - Math.floor(x) }; });
  let rest = total - shares.reduce((a, x) => a + x.n, 0);
  for (const x of [...shares].sort((a, b) => b.r - a.r)) { if (rest <= 0) break; x.n++; rest--; }
  return Object.fromEntries(shares.filter((x) => x.n > 0).map((x) => [x.id, x.n]));
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignoré */ }
}

export const save = {
  get: () => state,
  update(patch) {
    state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
    persist();
    listeners.forEach((fn) => fn(state));
  },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  /** Remplace la partie (sauvegarde du compte en ligne), migrée comme au chargement. */
  replace(data) {
    state = fromData(structuredClone(data)); persist(); listeners.forEach((fn) => fn(state));
  },
  reset() { state = finalize(structuredClone(DEFAULT_SAVE)); persist(); listeners.forEach((fn) => fn(state)); },
};
