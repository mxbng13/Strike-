import { execSync } from "node:child_process";

/** Recreates the test database schema from migrations before the integration suite. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://ba:ba@localhost:5432/business_architect_test";
  execSync(`psql "${url}" -q -c "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS pgboss CASCADE; CREATE SCHEMA public;"`, { stdio: "inherit" });
  execSync("npx tsx src/db/migrate.ts", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url, NODE_ENV: "test" } });
}
