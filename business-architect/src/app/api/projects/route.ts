import { api, json, parseBody, requireUser } from "@/lib/http";
import { CreateProjectInput, createProject, listProjects } from "@/projects/service";
import { currentWorkspaceId } from "@/workspaces/service";
import { rateLimit } from "@/lib/rate-limit";

export const GET = api(async (req) => {
  const user = await requireUser();
  const ws = req.nextUrl.searchParams.get("workspaceId") ?? (await currentWorkspaceId(user.id));
  return json({ projects: await listProjects(user.id, ws) });
});

export const POST = api(async (req) => {
  const user = await requireUser();
  await rateLimit(`project-create:${user.id}`, 20, 3600);
  const body = await parseBody(req, CreateProjectInput.partial({ workspaceId: true }));
  const workspaceId = body.workspaceId ?? (await currentWorkspaceId(user.id));
  const project = await createProject(user.id, { workspaceId, name: body.name });
  return json({ project }, 201);
});
