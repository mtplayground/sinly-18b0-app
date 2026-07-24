import { Database } from "../database.js";
import { loadDatabaseConfig } from "../config.js";

const database = new Database(loadDatabaseConfig());

try {
  const health = await database.healthCheck();
  console.log(`database ok: ${health.databaseName} at ${health.serverTime.toISOString()}`);
} finally {
  await database.close();
}
