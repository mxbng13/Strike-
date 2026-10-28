import { api, json, requireUser } from "@/lib/http";
import { listApprovals } from "@/governance/approvals";
import { currentWorkspaceId } from "@/workspaces/service";

export const GET = api(async (req) => {
  const user = await requireUser();
  const ws = req.nextUrl.searchParams.get("workspaceId") ?? (await currentWorkspaceId(user.id));
  return json({ approvals: await listApprovals(user.id, ws) });
});
