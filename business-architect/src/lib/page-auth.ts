import { redirect } from "next/navigation";
import { currentUser } from "./http";
import type { SessionUser } from "@/auth/service";

/** Server-component guard: redirects anonymous visitors to /login. */
export async function requirePageUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}
