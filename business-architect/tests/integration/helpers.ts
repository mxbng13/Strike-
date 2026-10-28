import { randomUUID } from "node:crypto";
import { signup } from "@/auth/service";
import { createProject } from "@/projects/service";
import { answerIntake } from "@/intake/engine";

export async function makeUser(name = "Test") {
  const email = `u-${randomUUID()}@example.test`;
  const { user, workspaceId } = await signup({ email, password: "correct horse battery", displayName: name });
  return { user, workspaceId, email };
}

/** The central scenario profile: 1000 €, 10 h/week, France, no sector, no idea. */
export async function makeProfiledProject(userId: string, workspaceId: string, answers?: string[]) {
  const project = await createProject(userId, { workspaceId });
  const seq = answers ?? ["Je n'ai pas d'idée : explore tout et choisis", "1000", "France", "10", "Entreprise durable", "Passer", "Rien de particulier"];
  let state;
  for (const a of seq) state = await answerIntake(project.id, userId, a);
  return { project, state: state! };
}
