import { route } from "@/lib/http";
import { listCategories } from "@/server/services";

export const GET = route(async () => ({ categories: await listCategories() }));
