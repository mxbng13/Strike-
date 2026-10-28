import { describe, it, expect } from "vitest";
import { hasForbiddenClaim } from "@/agents/quality-auditor";
import { checkCompleteness } from "@/artifacts/service";
import { contrast, accessiblePrimary } from "@/agents/brand-designer";

describe("règles du contrôle qualité", () => {
  it("détecte une promesse de résultat garanti", () => {
    expect(hasForbiddenClaim("Avec notre méthode, revenus garantis dès le premier mois !")).toBe(true);
    expect(hasForbiddenClaim("Nous garantissons vos résultats.")).toBe(true);
  });
  it("accepte les avertissements négatifs", () => {
    expect(hasForbiddenClaim("Les projections ne constituent en aucun cas une garantie de revenus.")).toBe(false);
    expect(hasForbiddenClaim("Aucun résultat garanti : il s'agit de scénarios.")).toBe(false);
  });
  it("calcule la complétude à partir du contenu", () => {
    const ok = checkCompleteness({ format: "markdown", content: "# T\n\n## Problème\n\nUn problème décrit avec suffisamment de mots.\n\n## Client\n\nDes clients décrits avec suffisamment de mots.\n", requiredSections: ["Problème", "Client"] });
    expect(ok).toEqual({ complete: true, missing: [] });
    const ko = checkCompleteness({ format: "markdown", content: "# T\n\n## Problème\n\n\n## Autre\n\n[à compléter]", requiredSections: ["Problème", "Client"] });
    expect(ko.complete).toBe(false);
    expect(ko.missing).toEqual(["section « Problème » vide", "section « Client » absente", "contient des marqueurs « à compléter »"]);
  });
  it("garantit un contraste WCAG AA pour la couleur primaire", () => {
    const p = accessiblePrimary("#fbbf24");
    expect(contrast(p, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});
