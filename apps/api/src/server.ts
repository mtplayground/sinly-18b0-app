import { loadAppConfig } from "@sinly/config";
import { Database, runMigrations } from "@sinly/db";
import { createApp } from "./app.js";

const config = loadAppConfig();
const database = new Database(config.database);

try {
  const migrations = await runMigrations(database);
  if (migrations.length > 0) {
    console.log(`Database migrations applied: ${migrations.length}`);
  }

  const app = createApp(config.server, {
    auth: config.auth,
    database,
    email: config.email,
    keyEncryption: config.keyEncryption,
  });
  const server = app.listen(config.server.port, config.server.host, () => {
    console.log(`API server listening on http://${config.server.host}:${config.server.port}`);
  });

  const shutdown = (signal: NodeJS.Signals) => {
    console.log(`Received ${signal}, shutting down`);
    server.close((error) => {
      database
        .close()
        .then(() => {
          if (error) {
            console.error("HTTP server shutdown failed", error);
            process.exit(1);
          }

          process.exit(0);
        })
        .catch((closeError: unknown) => {
          console.error("Database shutdown failed", closeError);
          process.exit(1);
        });
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} catch (error) {
  console.error("API server failed to start", error);
  await database.close();
  process.exit(1);
}
