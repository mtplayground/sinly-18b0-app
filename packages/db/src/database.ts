import pg from "pg";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import type { DatabaseConfig } from "./config.js";

export type QueryValue = string | number | boolean | Date | Buffer | null;
export type QueryValues = readonly QueryValue[];

export interface DatabaseHealth {
  databaseName: string;
  serverTime: Date;
}

export class Database {
  readonly pool: pg.Pool;

  constructor(config: DatabaseConfig) {
    this.pool = new pg.Pool({
      connectionString: config.connectionString,
      max: config.maxConnections,
      idleTimeoutMillis: config.idleTimeoutMillis,
      connectionTimeoutMillis: config.connectionTimeoutMillis,
      ssl: config.ssl,
    });
  }

  async query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values: QueryValues = [],
  ): Promise<QueryResult<Row>> {
    return this.pool.query<Row>(text, [...values]);
  }

  async transaction<Result>(work: (client: PoolClient) => Promise<Result>): Promise<Result> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Database rollback failed", rollbackError);
      }

      throw error;
    } finally {
      client.release();
    }
  }

  async healthCheck(): Promise<DatabaseHealth> {
    const result = await this.query<{
      database_name: string;
      server_time: Date;
    }>("SELECT current_database() AS database_name, NOW() AS server_time");
    const row = result.rows[0];

    if (!row) {
      throw new Error("Database health check returned no rows");
    }

    return {
      databaseName: row.database_name,
      serverTime: row.server_time,
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
