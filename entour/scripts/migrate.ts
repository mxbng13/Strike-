import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { loadEnv } from "./env";

loadEnv();
const url = process.env.DATABASE_URL!;
const sql = postgres(url, { max: 1, onnotice: () => {} });
await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
console.log("✓ Migrations appliquées sur", url.replace(/:[^:@/]+@/, ":***@"));
await sql.end();
