// Test de bout en bout de l'app dans un vrai navigateur (Chromium via Playwright).
// Lancer : node mon-ia/tests/app.e2e.cjs   (Playwright doit être installé : npm i -g playwright)
// Les services en ligne (modèle de texte, Wikipédia, banques de photos) sont simulés pour que le test
// soit reproductible ; ce test vérifie donc le code de l'app, pas les services eux-mêmes.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', 'web');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.onnx': 'application/octet-stream', '.webmanifest': 'application/manifest+json' };

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
      if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    }).listen(0, '127.0.0.1', () => resolve(server));
  });
}

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const errors = [];
  let lastSystem = '', nextReply = 'Réponse de test.';
  // Faux services en ligne.
  await ctx.route(/text\.pollinations\.ai/, (r) => {
    const body = JSON.parse(r.request().postData());
    if (/Translate/.test(body.messages[0].content)) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: body.messages[1].content } }] }) });
    lastSystem = body.messages[0].content;
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: nextReply }, finish_reason: 'stop' }] }) });
  });
  await ctx.route(/fr\.wikipedia\.org/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ query: { pages: { 1: { index: 1, title: 'Prostate', fullurl: 'https://fr.wikipedia.org/wiki/Prostate', extract: 'La prostate est une glande.' } } } }) }));
  await ctx.route(/commons\.wikimedia\.org/, (r) => r.fulfill({ status: 503, body: 'busy' }));
  await ctx.route(/api\.openverse\.org/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: [{ title: 'chat', url: base + 'icon-192.png', thumbnail: base + 'icon-192.png' }] }) }));

  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(base);
  await p.fill('#lockCode', 'banane13'); await p.click('#lockForm button'); await p.waitForTimeout(1200);
  const say = async (text) => {
    await p.fill('#input', text); await p.click('#sendBtn');
    await p.waitForFunction(() => !document.querySelector('#sendBtn').disabled, null, { timeout: 120000 });
    await p.waitForTimeout(200);
    return p.$eval('.msg.assistant:last-child', (e) => e.innerText);
  };
  const lastDiag = () => p.evaluate(() => diag.list().slice(-1)[0]);
  const results = [];
  const check = async (name, fn) => { try { await fn(); results.push(['ok', name]); } catch (err) { results.push(['ÉCHEC', name + ' — ' + err.message]); } };

  await check('question médicale en discussion : envoyée au modèle, avec les consignes médecine', async () => {
    const out = await say('Explique l’anatomie du pénis et de la prostate pour mon cours');
    assert.match(out, /Réponse de test/);
    assert.match(lastSystem, /études de médecine/);
  });
  await check('question éducative sur la sexualité : pas bloquée par l’app', async () => {
    const out = await say('Quels sont les symptômes d’une IST ?');
    assert.match(out, /Réponse de test/);
  });
  await check('recherche d’infos médicale : Wikipédia + modèle, avec lien Google', async () => {
    const out = await say('cherche sur google le rôle de la prostate');
    assert.match(out, /Réponse de test/); assert.match(out, /Voir sur Google/);
    assert.match(lastSystem, /La prostate est une glande/);
  });
  await check('refus du modèle détecté et attribué au modèle (pas à l’app)', async () => {
    nextReply = 'Je ne peux pas répondre à cette question.';
    await say('une question quelconque');
    const d = await lastDiag();
    assert.strictEqual(d.couche, 'modele');
    nextReply = 'Réponse de test.';
  });
  await check('recherche de photos autorisée : résultats affichés, erreur Wikimedia notée', async () => {
    const out = await say('cherche des photos de chat');
    assert.match(out, /Voici des photos/);
    const list = await p.evaluate(() => diag.list().filter((e) => e.etape === 'recherche de photos'));
    assert.ok(list.some((e) => e.statut === 503 && e.couche === 'fournisseur'));
    assert.ok(list.some((e) => e.resultats === 1));
  });
  await check('recherche de photos avec nudité : refusée par la règle fixe', async () => {
    const out = await say('cherche des photos de femme nue');
    assert.match(out, /règle fixe/); assert.match(out, /comportement\.js/);
    const d = await lastDiag(); assert.strictEqual(d.couche, 'regle-fixe'); assert.strictEqual(d.categorie, 'nudite');
  });
  await check('création d’image intime (moteur HD) : refusée avant de charger le moteur', async () => {
    await p.evaluate(() => { settings.imageProvider = 'hd'; setImageMode(true); });
    const out = await say('un pénis');
    assert.match(out, /anatomie intime/);
    assert.strictEqual(await p.evaluate(() => typeof window.MonIAHD), 'undefined');
    await p.evaluate(() => { settings.imageProvider = 'maison'; });
  });
  await check('création d’image normale avec l’IA maison : marche', async () => {
    const out = await p.evaluate(async () => { const img = await generateHomeImage('un cheval', () => {}); return img.slice(0, 22); });
    assert.match(out, /^data:image\/png;base64/);
  });
  await check('mot interdit de l’utilisateur : refus attribué à ses réglages', async () => {
    await p.evaluate(() => { setImageMode(false); settings.blockedWords = ['foot']; });
    const out = await say('parle-moi de foot');
    assert.match(out, /tes mots interdits/);
    assert.strictEqual((await lastDiag()).couche, 'utilisateur');
  });
  await check('diagnostic visible dans Paramètres, sans le texte des messages', async () => {
    await p.click('#openSettings');
    const txt = await p.$eval('#diagList', (e) => e.innerText);
    assert.match(txt, /règle fixe/); assert.match(txt, /le modèle de texte/);
    assert.ok(!/femme nue|pénis|parle-moi de foot/.test(txt));
    await p.click('#closeSettings');
  });
  await check('les règles ne peuvent pas être remplacées par un module', async () => {
    const r = await p.evaluate(() => { try { contentCheck = () => ({ allowed: true }); return 'remplacé'; } catch (e) { return 'protégé'; } });
    assert.strictEqual(r, 'protégé');
  });
  await check('aucune erreur JavaScript dans la page', async () => { assert.deepStrictEqual(errors, []); });

  for (const [s, n] of results) console.log(s.padEnd(6), n);
  await browser.close(); server.close();
  process.exit(results.some(([s]) => s !== 'ok') ? 1 : 0);
})();
