import { destroySession } from "@/lib/auth";
import { route } from "@/lib/http";

export const POST = route(async () => {
  await destroySession();
  return { ok: true };
});
