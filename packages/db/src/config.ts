export interface DatabaseConfig {
  connectionString: string;
  maxConnections: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  statementTimeoutMillis: number;
  ssl?: {
    rejectUnauthorized: boolean;
  };
}

function readPositiveInteger(name: string, value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    throw new Error(`Invalid ${name} value: ${value}`);
  }

  return parsed;
}

export function loadDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const rawConnectionString = env.DATABASE_URL;

  if (!rawConnectionString) {
    throw new Error("DATABASE_URL is required for PostgreSQL access");
  }

  const url = new URL(rawConnectionString);
  const sslMode = url.searchParams.get("sslmode");
  const ssl =
    sslMode && sslMode !== "disable"
      ? { rejectUnauthorized: sslMode === "verify-full" || env.DATABASE_SSL_VERIFY === "true" }
      : undefined;
  url.searchParams.delete("sslmode");

  return {
    connectionString: url.toString(),
    maxConnections: readPositiveInteger(
      "DATABASE_MAX_CONNECTIONS",
      env.DATABASE_MAX_CONNECTIONS,
      5,
    ),
    idleTimeoutMillis: readPositiveInteger(
      "DATABASE_IDLE_TIMEOUT_MS",
      env.DATABASE_IDLE_TIMEOUT_MS,
      10_000,
    ),
    connectionTimeoutMillis: readPositiveInteger(
      "DATABASE_CONNECTION_TIMEOUT_MS",
      env.DATABASE_CONNECTION_TIMEOUT_MS,
      5_000,
    ),
    statementTimeoutMillis: readPositiveInteger(
      "DATABASE_STATEMENT_TIMEOUT_MS",
      env.DATABASE_STATEMENT_TIMEOUT_MS,
      15_000,
    ),
    ssl,
  };
}
