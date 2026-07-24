import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PoolClient, QueryResultRow } from "pg";
import type { Database } from "./database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface MigrationRecord {
  version: string;
  name: string;
  checksum: string;
}

interface AppliedMigrationRow extends QueryResultRow {
  version: string;
  checksum: string;
}

function defaultMigrationsDirectory(): string {
  return path.resolve(__dirname, "../migrations");
}

function checksumSql(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

function parseMigration(filename: string, sql: string): MigrationRecord {
  const match = /^(\d+)_(.+)\.sql$/.exec(filename);
  if (!match) {
    throw new Error(`Invalid migration filename: ${filename}`);
  }

  const [, version, rawName] = match;
  if (!version || !rawName) {
    throw new Error(`Invalid migration filename: ${filename}`);
  }

  return {
    version,
    name: rawName.replaceAll("_", " "),
    checksum: checksumSql(sql),
  };
}

async function ensureMigrationTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function loadAppliedMigrations(client: PoolClient): Promise<Map<string, string>> {
  const result = await client.query<AppliedMigrationRow>(
    "SELECT version, checksum FROM app_migrations ORDER BY version",
  );

  return new Map(result.rows.map((row) => [row.version, row.checksum]));
}

export async function runMigrations(
  database: Database,
  migrationsDirectory = defaultMigrationsDirectory(),
): Promise<MigrationRecord[]> {
  const filenames = (await readdir(migrationsDirectory))
    .filter((filename) => filename.endsWith(".sql"))
    .sort();

  return database.transaction(async (client) => {
    await ensureMigrationTable(client);
    const applied = await loadAppliedMigrations(client);
    const completed: MigrationRecord[] = [];

    for (const filename of filenames) {
      const sql = await readFile(path.join(migrationsDirectory, filename), "utf8");
      const migration = parseMigration(filename, sql);
      const appliedChecksum = applied.get(migration.version);

      if (appliedChecksum) {
        if (appliedChecksum !== migration.checksum) {
          throw new Error(`Migration checksum mismatch for ${filename}`);
        }

        continue;
      }

      await client.query(sql);
      await client.query(
        "INSERT INTO app_migrations (version, name, checksum) VALUES ($1, $2, $3)",
        [migration.version, migration.name, migration.checksum],
      );
      completed.push(migration);
    }

    return completed;
  });
}
