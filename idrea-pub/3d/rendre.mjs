// Rendu des éléments 3D (three.js) dans Chromium headless -> PNG.
// Usage : node rendre.mjs <mode> [options JSON]   (modes : test, bonnet, lit)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ICI = path.dirname(new URL(import.meta.url).pathname);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const serveur = http.createServer((req, res) => {
  const p = path.join(ICI, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ICI) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => serveur.listen(0, r));
const port = serveur.address().port;

const [mode = 'test', optsJson = '{}'] = process.argv.slice(2);
const opts = JSON.parse(optsJson);
const sortie = path.join(ICI, 'rendus');
fs.mkdirSync(sortie, { recursive: true });

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await nav.newPage();
page.on('console', m => console.log('[page]', m.text()));
page.on('pageerror', e => console.log('[erreur]', e.message));
await page.goto(`http://localhost:${port}/scene.html`);
await page.waitForFunction(() => window.pret === true, null, { timeout: 120000 });

const images = await page.evaluate(([m, o]) => window.preparer(m, o), [mode, opts]);
for (let i = 0; i < images; i++) {
  const t0 = Date.now();
  const url = await page.evaluate(i => window.rendre(i), i);
  const nom = await page.evaluate(i => window.nom(i), i);
  fs.writeFileSync(path.join(sortie, nom), Buffer.from(url.split(',')[1], 'base64'));
  console.log(`${nom} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
await nav.close();
serveur.close();
