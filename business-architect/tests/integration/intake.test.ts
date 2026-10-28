import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { answerIntake, getIntakeState } from "@/intake/engine";
import { createProject } from "@/projects/service";
import { closeDb, db, schema } from "@/db/client";
import { makeUser, makeProfiledProject } from "./helpers";

afterAll(closeDb);

describe("M2 — conversation et profil", () => {
  it("un utilisateur sans idée obtient un profil complet sans définir de business", async () => {
    const { user, workspaceId } = await makeUser();
    const { project, state } = await makeProfiledProject(user.id, workspaceId);
    expect(state.complete).toBe(true);
    expect(state.profile).toMatchObject({
      mode: "autonomous",
      budgetEur: 1000,
      weeklyHours: 10,
      countryCode: "FR",
      sector: null,
      existingIdea: null,
    });
    // No question ever asked for an idea in autonomous mode.
    expect(state.messages.some((m) => m.role === "assistant" && /décris ton idée/i.test(m.content))).toBe(false);
    const row = await db().query.projectConstraints.findFirst({ where: eq(schema.projectConstraints.projectId, project.id) });
    expect(row?.budgetEur).toBe(1000);
    const p = await db().query.projects.findFirst({ where: eq(schema.projects.id, project.id) });
    expect(p?.status).toBe("ready");
    const ms = await db().query.projectMilestones.findMany({ where: eq(schema.projectMilestones.projectId, project.id) });
    expect(ms.filter((m) => m.status === "done").map((m) => m.phase)).toEqual(["intake"]);
  });

  it("redemande en cas de réponse incompréhensible, et applique des valeurs par défaut explicites", async () => {
    const { user, workspaceId } = await makeUser();
    const project = await createProject(user.id, { workspaceId });
    await answerIntake(project.id, user.id, "Je n'ai pas d'idée");
    let s = await answerIntake(project.id, user.id, "beaucoup");
    expect(s.nextQuestion?.key).toBe("budgetEur");
    s = await answerIntake(project.id, user.id, "je ne sais pas");
    expect(s.nextQuestion?.key).toBe("country");
    for (const a of ["France", "je ne sais pas", "je ne sais pas", "passer", "rien"]) s = await answerIntake(project.id, user.id, a);
    expect(s.complete).toBe(true);
    expect(s.profile?.defaultsUsed.sort()).toEqual(["budgetEur", "horizon", "weeklyHours"]);
  });

  it("mode secteur : demande le secteur, pas l'idée", async () => {
    const { user, workspaceId } = await makeUser();
    const { state } = await makeProfiledProject(user.id, workspaceId, ["J'ai un secteur en tête", "Éducation", "2k", "Belgique", "temps plein", "forte croissance", "Développement, vente", "B2B uniquement"]);
    expect(state.profile).toMatchObject({ mode: "sector", sector: "Éducation", budgetEur: 2000, countryCode: "BE", weeklyHours: 35, horizon: "high_growth", customerPreference: "b2b", existingIdea: null });
    expect(state.profile?.skills).toEqual(["Développement", "vente"]);
  });

  it("mode idée existante : l'idée est enregistrée comme hypothèse à challenger", async () => {
    const { user, workspaceId } = await makeUser();
    const { state } = await makeProfiledProject(user.id, workspaceId, ["J'ai déjà une idée à évaluer", "Une application de covoiturage pour les clubs de sport amateurs", "1500", "France", "8", "rapide", "passer", "pas de stock physique"]);
    expect(state.profile).toMatchObject({ mode: "existing_idea", allowPhysicalProducts: false, horizon: "quick_revenue" });
    expect(state.profile?.existingIdea).toContain("covoiturage");
  });

  it("refuse une réponse après complétion", async () => {
    const { user, workspaceId } = await makeUser();
    const { project } = await makeProfiledProject(user.id, workspaceId);
    await expect(answerIntake(project.id, user.id, "encore")).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await getIntakeState(project.id)).complete).toBe(true);
  });
});
