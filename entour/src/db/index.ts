import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "postgres://entour:entour@localhost:5432/entour";

type Globals = { __entourSql?: postgres.Sql };
const g = globalThis as unknown as Globals;

/** Un seul pool par processus (évite l'épuisement des connexions avec le rechargement à chaud de Next). */
export const sqlClient: postgres.Sql =
  g.__entourSql ??
  postgres(url, {
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idle_timeout: 30,
    onnotice: () => {},
  });
if (process.env.NODE_ENV !== "production") g.__entourSql = sqlClient;

export const db = drizzle(sqlClient, { schema, casing: undefined });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export { schema };
