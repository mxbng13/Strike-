import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, closeDb } from "./client";
import { seedReferenceData } from "./seed";

export async function runMigrations(): Promise<void> {
  await migrate(db(), { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  await seedReferenceData();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => {
      process.stdout.write("Migrations appliquées.\n");
      return closeDb();
    })
    .catch(async (e) => {
      console.error(e);
      await closeDb();
      process.exit(1);
    });
}
