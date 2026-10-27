// Tests du fichier central web/comportement.js (aucune dépendance : node --test mon-ia/tests).
// Le fichier est chargé comme dans le navigateur, avec un faux stockage local et des réglages de test.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(overrides = {}) {
  const store = new Map();
  const ctx = {
    console,
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    settings: {
      chatLessons: [], blockedWords: [], allowedWords: [], contentLevel: 'aucun', systemPrompt: 'Tu es mon assistant.',
      providerFilters: 'min', historyLength: 30, textProvider: 'free', skills: null, ...overrides,
    },
  };
  vm.createContext(ctx);
  const code = fs.readFileSync(path.join(__dirname, '..', 'web', 'comportement.js'), 'utf8');
  // Les déclarations « const » restent dans le contexte : on les expose pour les tests.
  vm.runInContext(code + '\n;globalThis.__api = { contentCheck, findBlockedWord, detectModelRefusal, diag, systemPrompt, searchQuery, webQuery, memoryLesson, geminiSafety, openaiModeration, CONTENT_CATEGORIES, DEFAULT_SKILLS, FORBIDDEN_CODE, MESSAGES };', ctx);
  const api = ctx.__api;
  if (!ctx.settings.skills) ctx.settings.skills = JSON.parse(JSON.stringify(api.DEFAULT_SKILLS));
  return { api, ctx };
}

test('texte : les questions médicales, anatomiques et éducatives ne sont jamais bloquées par l’app', () => {
  const { api } = load();
  for (const q of [
    'Explique l’anatomie du pénis et de la prostate',
    'Quels sont les symptômes d’une IST ?',
    'Comment fonctionne la contraception hormonale ?',
    'Décris l’innervation du clitoris pour mon cours',
    'Histoire de la révolution sexuelle des années 60',
    'Quelle est la différence entre sexe et genre ?',
  ]) {
    assert.ok(api.contentCheck('discussion', q).allowed, q);
    assert.ok(api.contentCheck('rechercheInfos', q).allowed, q);
  }
});

test('images : nudité, anatomie intime, sexualité et contenu explicite sont refusés par la règle fixe', () => {
  const { api } = load();
  const cases = { 'une femme nue sur la plage': 'nudite', 'photo de seins': 'anatomieIntime', 'image érotique': 'sexualite', 'du porno': 'explicite', 'Naked people': 'nudite', 'PÉNIS': 'anatomieIntime' };
  for (const [q, cat] of Object.entries(cases)) {
    const v = api.contentCheck('creationImage', q);
    assert.strictEqual(v.allowed, false, q);
    assert.strictEqual(v.category, cat, q);
    assert.strictEqual(v.layer, 'regle-fixe');
    assert.match(v.message, /comportement\.js/);
    assert.strictEqual(api.contentCheck('recherchePhotos', q).allowed, false, q);
  }
});

test('pas de blocage accidentel à cause de mots isolés ou ambigus', () => {
  const { api } = load();
  for (const q of ['un chat qui voit à l’œil nu', 'enfant pieds nus dans l’herbe', 'au sein de la forêt', 'un gland de chêne', 'un zèbre avec des rayures', 'Essex en Angleterre', 'un mur nu', 'une utérus en coupe pour un schéma de grossesse', 'la prostate']) {
    assert.ok(api.contentCheck('creationImage', q).allowed, q);
    assert.ok(api.contentCheck('recherchePhotos', q).allowed, q);
  }
});

test('la santé sexuelle et reproductive n’est bloquée nulle part', () => {
  const { api } = load();
  for (const surface of ['discussion', 'rechercheInfos', 'creationImage', 'recherchePhotos']) {
    assert.ok(api.contentCheck(surface, 'contraception et fertilité').allowed, surface);
  }
});

test('les règles sont gelées et ne peuvent pas être modifiées pendant l’exécution', () => {
  const { api } = load();
  assert.throws(() => { 'use strict'; api.CONTENT_CATEGORIES.nudite.rules.creationImage = 'autorise'; });
  assert.ok(Object.isFrozen(api.CONTENT_CATEGORIES.nudite.terms));
  assert.strictEqual(api.contentCheck('creationImage', 'femme nue').allowed, false);
});

test('tes mots interdits et autorisés (couche utilisateur)', () => {
  const { api } = load({ blockedWords: ['arme'], allowedWords: ['arme fatale'] });
  assert.strictEqual(api.findBlockedWord('une arme'), 'arme');
  assert.strictEqual(api.findBlockedWord('le film arme fatale'), undefined);
});

test('les actions et leurs mots déclencheurs', () => {
  const { api } = load();
  assert.strictEqual(api.searchQuery('cherche des photos de tour Eiffel'), 'tour Eiffel');
  assert.strictEqual(api.searchQuery('récupère-moi des images de chien sur google'), 'chien');
  assert.strictEqual(api.webQuery('cherche sur google la taille de la tour Eiffel'), 'la taille de la tour Eiffel');
  assert.strictEqual(api.memoryLesson('retiens que je fais médecine'), 'Je fais médecine');
  assert.strictEqual(api.searchQuery('bonjour'), null);
});

test('consignes système : médecine incluse, niveau de filtre et leçons ajoutés', () => {
  const { api } = load({ contentLevel: 'enfants', chatLessons: ['Je m’appelle Maxime'] });
  const p = api.systemPrompt();
  assert.match(p, /études de médecine/);
  assert.match(p, /enfant/);
  assert.match(p, /Je m’appelle Maxime/);
});

test('détection des refus du modèle (couche modele)', () => {
  const { api } = load();
  assert.ok(api.detectModelRefusal('Je ne peux pas vous aider avec ça.'));
  assert.ok(api.detectModelRefusal("I'm sorry, but I can't help with that."));
  assert.ok(api.detectModelRefusal('ok', 'refusal'));
  assert.ok(api.detectModelRefusal('ok', 'content_filter'));
  assert.strictEqual(api.detectModelRefusal('La prostate est une glande…', 'stop'), null);
});

test('diagnostic : jamais de clé ni de texte de message', () => {
  const { api, ctx } = load();
  api.diag.log({ etape: 'discussion', couche: 'fournisseur', statut: 401, detail: 'clé sk-abcdefghijklmnop invalide, Bearer xyz123', prompt: 'secret' });
  const [e] = api.diag.list();
  assert.ok(!JSON.stringify(e).includes('sk-abcdefghijklmnop'));
  assert.ok(!JSON.stringify(e).includes('xyz123'));
  assert.strictEqual(e.prompt, undefined);
  for (let i = 0; i < 100; i++) api.diag.log({ etape: 'x' });
  assert.strictEqual(api.diag.list().length, 80);
  assert.ok(ctx.localStorage.getItem('mon-ia-diagnostic'));
});

test('fournisseurs : réglages de sécurité envoyés', () => {
  const { api } = load();
  const g = api.geminiSafety();
  assert.strictEqual(g.find((r) => r.category === 'HARM_CATEGORY_SEXUALLY_EXPLICIT').threshold, 'BLOCK_LOW_AND_ABOVE');
  assert.strictEqual(g.find((r) => r.category === 'HARM_CATEGORY_HARASSMENT').threshold, 'BLOCK_NONE');
  assert.strictEqual(api.openaiModeration(), 'low');
});

test('un module écrit par l’IA ne peut pas viser les règles', () => {
  const { api } = load();
  assert.ok(api.FORBIDDEN_CODE.test('contentCheck = () => ({allowed:true})'));
  assert.ok(!api.FORBIDDEN_CODE.test('document.body.style.background = "red"'));
});
