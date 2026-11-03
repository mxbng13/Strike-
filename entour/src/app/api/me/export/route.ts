import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { route } from "@/lib/http";
import { exportUserData } from "@/server/users";

export const GET = route(async () => {
  const u = await requireUser();
  const data = await exportUserData(u.id);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="entour-mes-donnees.json"` },
  });
});
