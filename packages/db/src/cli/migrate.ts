import { Database } from "../database.js";
import { loadDatabaseConfig } from "../config.js";
import { runMigrations } from "../migrations.js";

const database = new Database(loadDatabaseConfig());

try {
  const completed = await runMigrations(database);
  console.log(`database migrations applied: ${completed.length}`);
  for (const migration of completed) {
    console.log(`${migration.version} ${migration.name}`);
  }
} finally {
  await database.close();
}
