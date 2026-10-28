import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { env } from "@/config/env";

export type Db = NodePgDatabase<typeof schema>;
/** A transaction handle has the same query surface as the db. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

const g = globalThis as unknown as { __baPool?: Pool; __baDb?: Db };

export function pool(): Pool {
  if (!g.__baPool) {
    g.__baPool = new Pool({ connectionString: env().DATABASE_URL, max: 10 });
    g.__baPool.on("error", (err) => console.error(JSON.stringify({ level: "error", msg: "pg pool error", error: err.message })));
  }
  return g.__baPool;
}

export function db(): Db {
  if (!g.__baDb) g.__baDb = drizzle(pool(), { schema });
  return g.__baDb;
}

export async function closeDb(): Promise<void> {
  if (g.__baPool) {
    await g.__baPool.end();
    g.__baPool = undefined;
    g.__baDb = undefined;
  }
}

export { schema };
