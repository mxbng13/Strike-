import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { AgentContext, AgentResult } from "./framework";
import type { Concept } from "@/discovery/types";
import type { Sales } from "./sales-growth";
import type { ProductSpec } from "./product-architect";
import { runInSandbox } from "@/sandbox/runner";
import { MODE_BANNER, table } from "./md";
import type { ArtifactFile } from "@/db/schema/artifacts";

type Brand = { name: string; tagline: string; keyMessages: string[]; palette: { primary: string; ink: string; muted: string; accent: string; surface: string } };

export const CopySchema = z.object({
  headline: z.string().max(90),
  subheadline: z.string().max(220),
  problemTitle: z.string(),
  problemText: z.string(),
  solutionTitle: z.string(),
  benefits: z.array(z.object({ title: z.string(), text: z.string() })).length(3),
  cta: z.string().max(40),
  faq: z.array(z.object({ q: z.string(), a: z.string() })).min(3),
});
type Copy = z.infer<typeof CopySchema>;

const h = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function copyHeuristic(c: Concept, brand: Brand, sales: Sales, spec: ProductSpec | undefined): Copy {
  const must = spec?.features.filter((f) => f.priority === "must").slice(0, 3) ?? [];
  return {
    headline: brand.tagline.length <= 90 ? brand.tagline : `${brand.name} : ${c.segmentLabel}`.slice(0, 90),
    subheadline: c.valueProposition.slice(0, 220),
    problemTitle: "Le problème",
    problemText: c.problem,
    solutionTitle: `Ce que ${brand.name} fait pour vous`,
    benefits: (must.length === 3 ? must.map((f) => ({ title: f.name, text: f.description })) : brand.keyMessages.slice(0, 3).map((m, i) => ({ title: ["Simple", "Spécialisé", "Sans engagement"][i]!, text: m }))).slice(0, 3) as Copy["benefits"],
    cta: "Rejoindre la liste d'attente",
    faq: sales.objections.slice(0, 4).map((o) => ({ q: o.objection, a: o.answer })),
  };
}

export function buildSite(brand: Brand, copy: Copy, sales: Sales, concept: Concept): ArtifactFile[] {
  const p = brand.palette;
  const offers = sales.offers
    .map((o) => `<article class="offer"><h3>${h(o.name)}</h3><p class="price" data-price="${o.priceEur}">${o.priceEur.toLocaleString("fr-FR")} €</p><p class="unit">${h(o.unit)}</p><ul>${o.includes.map((i) => `<li>${h(i)}</li>`).join("")}</ul></article>`)
    .join("\n        ");
  const index = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${h(brand.name)} — ${h(copy.headline)}</title>
  <meta name="description" content="${h(copy.subheadline)}">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="hero">
    <p class="brand">${h(brand.name)}</p>
    <h1>${h(copy.headline)}</h1>
    <p class="lead">${h(copy.subheadline)}</p>
    <a class="button" href="#inscription">${h(copy.cta)}</a>
  </header>
  <main>
    <section>
      <h2>${h(copy.problemTitle)}</h2>
      <p>${h(copy.problemText)}</p>
    </section>
    <section>
      <h2>${h(copy.solutionTitle)}</h2>
      <div class="grid">
        ${copy.benefits.map((b) => `<article><h3>${h(b.title)}</h3><p>${h(b.text)}</p></article>`).join("\n        ")}
      </div>
    </section>
    <section id="offres">
      <h2>Offres de lancement</h2>
      <div class="grid">
        ${offers}
      </div>
      <p class="note">Prix de lancement indicatifs, susceptibles d'évoluer.</p>
    </section>
    <section id="inscription">
      <h2>${h(copy.cta)}</h2>
      <form id="waitlist" action="/api/waitlist" method="post" novalidate>
        <label for="email">Adresse e-mail professionnelle</label>
        <input id="email" name="email" type="email" required autocomplete="email">
        <label class="consent"><input id="consent" name="consent" type="checkbox" value="yes" required> J'accepte d'être recontacté(e) au sujet de ${h(brand.name)}. <a href="confidentialite.html">Politique de confidentialité</a></label>
        <button type="submit">${h(copy.cta)}</button>
        <p id="form-status" role="status" aria-live="polite"></p>
      </form>
    </section>
    <section>
      <h2>Questions fréquentes</h2>
      ${copy.faq.map((f) => `<details><summary>${h(f.q)}</summary><p>${h(f.a)}</p></details>`).join("\n      ")}
    </section>
  </main>
  <footer>
    <p>© ${h(brand.name)} — <a href="mentions-legales.html">Mentions légales</a> · <a href="confidentialite.html">Confidentialité</a></p>
  </footer>
  <script src="app.js" defer></script>
</body>
</html>
`;
  const css = `:root{--primary:${p.primary};--ink:${p.ink};--muted:${p.muted};--accent:${p.accent};--surface:${p.surface}}
*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--surface);line-height:1.6}
.hero{background:var(--primary);color:#fff;padding:4rem 1rem;text-align:center}.hero h1{font-family:Poppins,system-ui,sans-serif;font-size:clamp(1.8rem,5vw,3rem);margin:.5rem auto;max-width:22ch}
.brand{font-weight:700;letter-spacing:.05em;text-transform:uppercase;opacity:.9}.lead{max-width:60ch;margin:0 auto 1.5rem}
.button,button{display:inline-block;background:#fff;color:var(--primary);border:2px solid #fff;border-radius:.5rem;padding:.75rem 1.25rem;font-weight:700;text-decoration:none;cursor:pointer}
button{background:var(--primary);color:#fff;border-color:var(--primary)}
main{max-width:960px;margin:0 auto;padding:1rem}section{padding:2rem 0}.grid{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
article{background:var(--muted);border-radius:.75rem;padding:1rem}.price{font-size:1.75rem;font-weight:700;color:var(--accent);margin:0}.unit,.note{font-size:.875rem;opacity:.8}
form{display:grid;gap:.75rem;max-width:480px}input[type=email]{padding:.75rem;border:1px solid #9ca3af;border-radius:.5rem;font-size:1rem}
.consent{font-size:.875rem}footer{text-align:center;padding:2rem 1rem;font-size:.875rem}a{color:var(--primary)}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
`;
  const app = `// Liste d'attente : envoi au serveur fourni (server.mjs). Aucun script tiers, aucun traceur.
document.getElementById("waitlist")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const status = document.getElementById("form-status");
  const email = form.email.value.trim();
  if (!form.consent.checked) { status.textContent = "Merci d'accepter d'être recontacté(e)."; return; }
  try {
    const res = await fetch(form.action, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, consent: true }) });
    status.textContent = res.ok ? "Merci ! Vous êtes inscrit(e)." : "Adresse invalide, merci de vérifier.";
    if (res.ok) form.reset();
  } catch { status.textContent = "Service momentanément indisponible."; }
});
`;
  const legal = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Mentions légales — ${h(brand.name)}</title><link rel="stylesheet" href="styles.css"></head><body><main>
<h1>Mentions légales</h1>
<p>Éditeur : {{RAISON_SOCIALE}} — {{FORME_JURIDIQUE}} — SIREN {{SIREN}} — {{ADRESSE}} — contact : {{EMAIL_CONTACT}}</p>
<p>Directeur de la publication : {{NOM_RESPONSABLE}}</p>
<p>Hébergeur : {{HEBERGEUR_NOM_ADRESSE}}</p>
<p><a href="index.html">Retour</a></p></main></body></html>
`;
  const privacy = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Confidentialité — ${h(brand.name)}</title><link rel="stylesheet" href="styles.css"></head><body><main>
<h1>Politique de confidentialité</h1>
<p>Donnée collectée : adresse e-mail, uniquement avec votre consentement, pour vous informer du lancement de ${h(brand.name)}.</p>
<p>Responsable du traitement : {{RAISON_SOCIALE}} ({{EMAIL_CONTACT}}). Durée de conservation : {{DUREE_CONSERVATION}}.</p>
<p>Vous pouvez retirer votre consentement et demander l'effacement de vos données à tout moment à {{EMAIL_CONTACT}}. Réclamation possible auprès de la CNIL (cnil.fr).</p>
<p>Aucun cookie ni traceur n'est utilisé sur ce site.</p>
<p><a href="index.html">Retour</a></p></main></body></html>
`;
  const server = `// Serveur minimal sans dépendance : site statique + API de liste d'attente.
// Lancer : node server.mjs (PORT=8080 par défaut). Données : data/waitlist.jsonl
import http from "node:http";
import { readFile, appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(ROOT, "site");
const DATA = path.join(ROOT, "data");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript" };
const EMAIL = /^[^\\s@]{1,64}@[^\\s@]{1,190}\\.[a-z]{2,24}$/i;

async function readBody(req, limit = 4096) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw new Error("too large"); chunks.push(Buffer.from(c)); }
  return Buffer.concat(chunks).toString("utf8");
}

export async function handler(req, res) {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "POST" && url.pathname === "/api/waitlist") {
    let data;
    try { data = JSON.parse(await readBody(req)); } catch { res.writeHead(400, { "Content-Type": "application/json" }); return res.end('{"error":"invalid"}'); }
    if (typeof data?.email !== "string" || !EMAIL.test(data.email) || data.consent !== true) {
      res.writeHead(400, { "Content-Type": "application/json" }); return res.end('{"error":"invalid"}');
    }
    await mkdir(DATA, { recursive: true });
    await appendFile(path.join(DATA, "waitlist.jsonl"), JSON.stringify({ email: data.email.toLowerCase(), consent: true, at: new Date().toISOString() }) + "\\n");
    res.writeHead(201, { "Content-Type": "application/json" }); return res.end('{"ok":true}');
  }
  if (req.method !== "GET") { res.writeHead(405); return res.end(); }
  const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const file = path.normalize(path.join(SITE, rel));
  if (!file.startsWith(SITE + path.sep)) { res.writeHead(404); return res.end("Not found"); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream", "X-Content-Type-Options": "nosniff" });
    return res.end(body);
  } catch { res.writeHead(404); return res.end("Not found"); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8080);
  http.createServer((req, res) => { handler(req, res).catch(() => { res.writeHead(500); res.end(); }); }).listen(port, () => console.log("http://localhost:" + port));
}
`;
  const test = `// Tests générés — exécutés dans la sandbox (sans réseau). Sortie : JSON des résultats.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { handler } from "../server.mjs";

const results = [];
async function t(name, fn) { try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: String(e?.message ?? e) }); } }
function mockReq(method, url, body) { const r = Readable.from(body ? [Buffer.from(body)] : []); Object.assign(r, { method, url, headers: {} }); return r; }
function mockRes() { const res = { status: 0, body: "", writeHead(s) { this.status = s; return this; }, end(b) { this.body = b ? String(b) : ""; } }; return res; }
const html = await readFile(new URL("../site/index.html", import.meta.url), "utf8");
const expectedPrices = ${JSON.stringify(sales.offers.map((o) => o.priceEur))};

await t("titre contient la marque", () => assert.match(html, /<title>${brand.name.replace(/[.*+?^${}()|[\]\\]/g, "\\\\$&")}/));
await t("meta description présente", () => assert.match(html, /<meta name="description" content="[^"]{20,}"/));
await t("un seul h1", () => assert.equal((html.match(/<h1>/g) ?? []).length, 1));
await t("formulaire e-mail requis + consentement", () => { assert.match(html, /type="email" required/); assert.match(html, /id="consent"[^>]*required/); });
await t("prix cohérents avec le plan commercial", () => { for (const p of expectedPrices) assert.ok(html.includes('data-price="' + p + '"'), "prix manquant " + p); });
await t("aucun script tiers", () => assert.doesNotMatch(html, /<script[^>]+src="https?:/i));
await t("aucun secret dans le code", async () => { for (const f of ["../site/index.html", "../site/app.js", "../server.mjs"]) assert.doesNotMatch(await readFile(new URL(f, import.meta.url), "utf8"), /(sk-[a-z0-9]{10,}|api[_-]?key\\s*[:=])/i); });
await t("liens légaux présents", () => { assert.match(html, /mentions-legales\\.html/); assert.match(html, /confidentialite\\.html/); });
await t("POST valide enregistre l'inscription", async () => { const res = mockRes(); await handler(mockReq("POST", "/api/waitlist", JSON.stringify({ email: "test@example.org", consent: true })), res); assert.equal(res.status, 201); const saved = await readFile(new URL("../data/waitlist.jsonl", import.meta.url), "utf8"); assert.match(saved, /test@example\\.org/); });
await t("e-mail invalide refusé", async () => { const res = mockRes(); await handler(mockReq("POST", "/api/waitlist", JSON.stringify({ email: "pas-un-email", consent: true })), res); assert.equal(res.status, 400); });
await t("consentement obligatoire", async () => { const res = mockRes(); await handler(mockReq("POST", "/api/waitlist", JSON.stringify({ email: "a@example.org" })), res); assert.equal(res.status, 400); });
await t("page d'accueil servie", async () => { const res = mockRes(); await handler(mockReq("GET", "/"), res); assert.equal(res.status, 200); });
await t("traversée de répertoire bloquée", async () => { const res = mockRes(); await handler(mockReq("GET", "/../server.mjs"), res); assert.equal(res.status, 404); });

console.log(JSON.stringify(results));
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
`;
  const readme = `# ${brand.name} — site de lancement

Généré par Business Architect AI pour le concept « ${concept.title} ».

## Lancer en local
\`\`\`bash
node server.mjs          # http://localhost:8080
node tests/site.test.mjs # tests (aucune dépendance)
\`\`\`

## Avant toute publication (actions humaines)
1. Compléter les variables {{...}} de \`site/mentions-legales.html\` et \`site/confidentialite.html\` (identité légale, hébergeur, durée de conservation).
2. Choisir un hébergeur (Node.js pour la liste d'attente, ou statique + service de formulaire conforme RGPD).
3. La publication est une action L2 : elle doit être approuvée dans l'application.

## Contenu
- \`site/\` : page de lancement accessible, sans traceur ni script tiers.
- \`server.mjs\` : serveur minimal + API \`POST /api/waitlist\` (e-mail + consentement), stockage \`data/waitlist.jsonl\`.
- \`tests/site.test.mjs\` : tests de structure, cohérence des prix, sécurité et API.
`;
  return [
    { path: "site/index.html", content: index, mimeType: "text/html" },
    { path: "site/styles.css", content: css, mimeType: "text/css" },
    { path: "site/app.js", content: app, mimeType: "text/javascript" },
    { path: "site/mentions-legales.html", content: legal, mimeType: "text/html" },
    { path: "site/confidentialite.html", content: privacy, mimeType: "text/html" },
    { path: "server.mjs", content: server, mimeType: "text/javascript" },
    { path: "tests/site.test.mjs", content: test, mimeType: "text/javascript" },
    { path: "README.md", content: readme, mimeType: "text/markdown" },
  ];
}

export async function developerHandler(ctx: AgentContext): Promise<AgentResult> {
  const sel = ctx.context.selected;
  const brand = ctx.context.outputs["brand.identity"] as Brand | undefined;
  const sales = ctx.context.outputs["sales.plan"] as Sales | undefined;
  const spec = ctx.context.outputs["product.spec"] as ProductSpec | undefined;
  if (!sel || !brand || !sales) throw new AppError("INTERNAL", "Marque ou offres absentes.");
  const c = sel.content as Concept;
  const copy = ctx.mode === "llm"
    ? await ctx.llm({ instructions: `Rédige les textes de la page de lancement de ${brand.name} (titre ≤ 90 caractères, sous-titre, problème, 3 bénéfices, appel à l'action, FAQ). Aucune promesse de résultat garanti.`, schema: CopySchema, schemaName: "landing_copy", maxTokens: 4000 })
    : copyHeuristic(c, brand, sales, spec);
  const files = buildSite(brand, copy, sales, c);
  const run = await runInSandbox(files, "tests/site.test.mjs", { timeoutMs: 20_000 });
  let results: Array<{ name: string; ok: boolean; error?: string }> = [];
  try {
    results = JSON.parse(run.stdout.trim().split("\n").at(-1) ?? "[]");
  } catch {
    results = [];
  }
  const passed = run.exitCode === 0 && results.length > 0 && results.every((r) => r.ok);
  await ctx.note(`Tests du site exécutés en sandbox : ${results.filter((r) => r.ok).length}/${results.length} réussis.`, { exitCode: run.exitCode, isolation: run.isolation });
  if (!passed) throw new AppError("QUALITY_BLOCKED", `Tests du site en échec : ${results.filter((r) => !r.ok).map((r) => `${r.name} (${r.error})`).join(" ; ") || run.stderr.slice(0, 300)}`, { retryable: ctx.mode === "llm" });

  const report =
    MODE_BANNER(ctx.mode) +
    `# Rapport de tests — site de lancement ${brand.name}\n\n## Résultat\n\n${results.filter((r) => r.ok).length}/${results.length} tests réussis, code de sortie ${run.exitCode}, durée ${run.durationMs} ms.\n\n## Détail\n\n${table(["Test", "Résultat"], results.map((r) => [r.name, r.ok ? "✅ réussi" : `❌ ${r.error}`]))}\n\n## Isolation de l'exécution\n\n${table(["Couche", "État"], [["Réseau", run.isolation.network === "namespace" ? "coupé (namespace réseau vide)" : "NON isolé (unshare indisponible)"], ["Système de fichiers", "limité au répertoire temporaire (modèle de permissions Node)"], ["Limites", run.isolation.limits.join(", ")]])}\n`;
  return {
    kind: "build.website",
    output: { brandName: brand.name, files: files.map((f) => f.path), tests: results, isolation: run.isolation, copy },
    mode: ctx.mode === "llm" ? "llm" : "heuristic",
    artifacts: [
      { key: "launch-website", title: `Site de lancement ${brand.name} (code source)`, kind: "website", category: "product", format: "files", content: `Bundle de ${files.length} fichiers — voir README.md`, files, requiredFiles: ["site/index.html", "server.mjs", "tests/site.test.mjs", "README.md"], dependsOn: ["brand-identity", "sales-plan"] },
      { key: "website-test-report", title: "Rapport de tests sandbox du site", kind: "document", category: "quality", format: "markdown", content: report, requiredSections: ["Résultat", "Détail", "Isolation de l'exécution"], dependsOn: ["launch-website"] },
    ],
    evaluation: { passed, findings: results.map((r) => `${r.ok ? "OK" : "KO"} ${r.name}`) },
  };
}
