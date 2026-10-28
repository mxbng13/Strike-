import { describe, it, expect, afterAll } from "vitest";
import { login, createSession, userFromToken, destroySession } from "@/auth/service";
import { requireProjectAccess, listProjects, createProject } from "@/projects/service";
import { requireWorkspaceRole } from "@/workspaces/service";
import { closeDb } from "@/db/client";
import { makeUser } from "./helpers";

afterAll(closeDb);

describe("M1 — authentification et isolation", () => {
  it("crée un compte, un espace et une session valide", async () => {
    const { user, email } = await makeUser();
    const logged = await login({ email, password: "correct horse battery" });
    expect(logged.id).toBe(user.id);
    const { token } = await createSession(user.id);
    expect((await userFromToken(token))?.id).toBe(user.id);
    await destroySession(token);
    expect(await userFromToken(token)).toBeNull();
  });

  it("refuse un mauvais mot de passe", async () => {
    const { email } = await makeUser();
    await expect(login({ email, password: "wrong password!!" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("refuse l'accès au projet d'un autre utilisateur (NOT_FOUND, sans fuite d'existence)", async () => {
    const alice = await makeUser("Alice");
    const bob = await makeUser("Bob");
    const p = await createProject(alice.user.id, { workspaceId: alice.workspaceId });
    await expect(requireProjectAccess(bob.user.id, p.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(listProjects(bob.user.id, alice.workspaceId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createProject(bob.user.id, { workspaceId: alice.workspaceId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(requireWorkspaceRole(bob.user.id, alice.workspaceId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await requireProjectAccess(alice.user.id, p.id)).role).toBe("owner");
  });

  it("rejette les identifiants non-UUID sans erreur SQL", async () => {
    const alice = await makeUser();
    await expect(requireProjectAccess(alice.user.id, "../../etc")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("les projets persistent et sont listés pour leur propriétaire", async () => {
    const alice = await makeUser();
    await createProject(alice.user.id, { workspaceId: alice.workspaceId, name: "A" });
    await createProject(alice.user.id, { workspaceId: alice.workspaceId, name: "B" });
    const list = await listProjects(alice.user.id, alice.workspaceId);
    expect(list.map((p) => p.name).sort()).toEqual(["A", "B"]);
    expect(list[0]!.status).toBe("intake");
  });
});
