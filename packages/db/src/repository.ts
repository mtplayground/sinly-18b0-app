import type { QueryResult, QueryResultRow } from "pg";
import type { Database, QueryValues } from "./database.js";

export abstract class Repository {
  protected constructor(protected readonly database: Database) {}

  protected query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values: QueryValues = [],
  ): Promise<QueryResult<Row>> {
    return this.database.query<Row>(text, values);
  }

  protected async one<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values: QueryValues = [],
  ): Promise<Row> {
    const result = await this.query<Row>(text, values);
    const row = result.rows[0];

    if (!row) {
      throw new Error("Expected one database row but query returned none");
    }

    return row;
  }

  protected async oneOrNone<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values: QueryValues = [],
  ): Promise<Row | null> {
    const result = await this.query<Row>(text, values);
    return result.rows[0] ?? null;
  }
}
