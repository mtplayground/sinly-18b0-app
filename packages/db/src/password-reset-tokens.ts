import type { QueryResultRow } from "pg";
import type { Database } from "./database.js";
import { Repository } from "./repository.js";

export interface PasswordResetTokenRecord {
  tokenHash: string;
  userSub: string;
  email: string;
  requestedAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface CreatePasswordResetTokenInput {
  tokenHash: string;
  userSub: string;
  email: string;
  expiresAt: Date;
}

interface PasswordResetTokenRow extends QueryResultRow {
  token_hash: string;
  user_sub: string;
  email: string;
  requested_at: Date;
  expires_at: Date;
  consumed_at: Date | null;
}

function toPasswordResetTokenRecord(row: PasswordResetTokenRow): PasswordResetTokenRecord {
  return {
    tokenHash: row.token_hash,
    userSub: row.user_sub,
    email: row.email,
    requestedAt: row.requested_at,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
  };
}

export class PasswordResetTokenRepository extends Repository {
  constructor(database: Database) {
    super(database);
  }

  async create(input: CreatePasswordResetTokenInput): Promise<PasswordResetTokenRecord> {
    const row = await this.one<PasswordResetTokenRow>(
      `
        INSERT INTO password_reset_tokens (
          token_hash,
          user_sub,
          email,
          expires_at
        )
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [input.tokenHash, input.userSub, input.email, input.expiresAt],
    );

    return toPasswordResetTokenRecord(row);
  }

  async consumeValid(tokenHash: string): Promise<PasswordResetTokenRecord | null> {
    const row = await this.oneOrNone<PasswordResetTokenRow>(
      `
        UPDATE password_reset_tokens
        SET consumed_at = NOW()
        WHERE token_hash = $1
          AND consumed_at IS NULL
          AND expires_at > NOW()
        RETURNING *
      `,
      [tokenHash],
    );

    return row ? toPasswordResetTokenRecord(row) : null;
  }
}
