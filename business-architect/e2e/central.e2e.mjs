// End-to-end test of the central scenario through the real UI.
// Requires: `npm run start` (port 3100) AND `npm run worker` running against the same database.
// Run: npm run test:e2e   (BASE_URL to override)
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Uses the project dependency if installed, else the environment's preinstalled Playwright.
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const SHOTS = process.env.E2E_SCREENSHOTS;

test("scénario central : 1 000 €, 10 h/sem, France, aucune idée → business construit", { timeout: 300_000 }, async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const shot = async (n) => SHOTS && page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true });
  try {
    await page.goto(`${BASE}/signup`);
    await page.getByLabel("Nom").fill("Utilisatrice E2E");
    await page.getByLabel("E-mail").fill(`e2e-${Date.now()}@example.test`);
    await page.getByLabel(/Mot de passe/).fill("mot-de-passe-solide");
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await page.waitForURL(/dashboard/);
    await shot("1-dashboard-vide");

    await page.getByRole("button", { name: /Créer un nouveau business/ }).click();
    await page.waitForURL(/projects\//);
    // The very first question offers "no idea" — the user never has to invent a business.
    await page.getByRole("button", { name: /Je n'ai pas d'idée/ }).click();
    for (const answer of ["1000", "France", "10", "Entreprise durable"]) {
      await page.getByLabel("Ta réponse").fill(answer);
      await page.getByRole("button", { name: "Envoyer" }).click();
      await page.waitForTimeout(400);
    }
    await page.getByRole("button", { name: "Passer" }).click();
    await page.getByRole("button", { name: "Rien de particulier" }).click();
    await page.getByText("Voici ce que j'ai compris").waitFor();
    await shot("2-intake");
    const body = await page.textContent("body");
    assert.doesNotMatch(body, /Décris ton idée/);
    await page.getByRole("button", { name: "Lancer la création du business" }).click();

    // Live progress comes from the real task table, executed by the separate worker.
    await page.getByText("Progression en temps réel").waitFor({ timeout: 30_000 });
    await page.getByText(/Approbations en attente|Bloqué/).first().waitFor({ timeout: 240_000 });
    await page.reload();
    await shot("3-vue-ensemble");
    assert.match(await page.textContent("body"), /Approbations en attente/);

    await page.getByRole("link", { name: "Opportunités", exact: true }).click();
    await page.waitForURL(/tab=opportunities/);
    await page.getByText("Dernière décision").waitFor();
    const opp = await page.textContent("main");
    assert.match(opp, /Retenu/);
    assert.ok((opp.match(/Itération/g) ?? []).length >= 5, "au moins 5 concepts affichés");
    await shot("4-opportunites");

    await page.getByRole("link", { name: "Finances", exact: true }).click();
    await page.waitForURL(/tab=finance/);
    await page.getByText("Trésorerie fin de mois par scénario").waitFor();
    await shot("5-finances");

    await page.getByRole("link", { name: "Livrables", exact: true }).click();
    await page.waitForURL(/tab=deliverables/);
    await page.getByText("Centre de livrables").waitFor();
    const deliverables = await page.textContent("main");
    assert.match(deliverables, /Site de lancement/);
    assert.doesNotMatch(deliverables, /Incomplet/);
    await page.getByRole("link", { name: /Site de lancement/ }).first().click();
    await page.waitForURL(/artifacts\//);
    await page.getByTitle("Aperçu du site généré").waitFor();
    await shot("6-site");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Télécharger v1 \(\.zip\)/ }).click()]);
    assert.match(download.suggestedFilename(), /\.zip$/);

    await page.goto(`${BASE}/approvals`);
    await page.getByText(/Publier le site de lancement/).waitFor();
    page.once("dialog", (d) => d.accept());
    const card = page.locator("li", { hasText: "Publier le site de lancement" });
    await card.getByRole("button", { name: "Approuver" }).click();
    await page.getByText(/Aucun connecteur d'hébergement configuré/).waitFor();
    await shot("7-approbations");

    // Isolation: an anonymous visitor cannot read the project API.
    const projectUrl = page.url();
    const anon = await browser.newContext();
    const res = await anon.request.get(`${BASE}/api/projects`);
    assert.equal(res.status(), 401);
    await anon.close();
    void projectUrl;
  } finally {
    await browser.close();
  }
});
