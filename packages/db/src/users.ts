import type { QueryResultRow } from "pg";
import type { Database } from "./database.js";
import { Repository } from "./repository.js";

export type UserMembershipStatus = "none" | "active" | "expired" | "cancelled";

export interface UserRecord {
  sub: string;
  email: string;
  account: string;
  passwordHash: string | null;
  name: string | null;
  pictureUrl: string | null;
  membershipStatus: UserMembershipStatus;
  currentMembershipId: string | null;
  registeredAt: Date;
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt: Date;
}

export interface CreateUserInput {
  sub: string;
  email: string;
  account?: string;
  passwordHash?: string | null;
  name?: string | null;
  pictureUrl?: string | null;
}

export interface UpsertUserIdentityInput {
  sub: string;
  email: string;
  account?: string;
  name?: string | null;
  pictureUrl?: string | null;
}

interface UserRow extends QueryResultRow {
  sub: string;
  email: string;
  account: string;
  password_hash: string | null;
  name: string | null;
  picture_url: string | null;
  membership_status: UserMembershipStatus;
  current_membership_id: string | null;
  registered_at: Date;
  created_at: Date;
  updated_at: Date;
  last_seen_at: Date;
}

function toUserRecord(row: UserRow): UserRecord {
  return {
    sub: row.sub,
    email: row.email,
    account: row.account,
    passwordHash: row.password_hash,
    name: row.name,
    pictureUrl: row.picture_url,
    membershipStatus: row.membership_status,
    currentMembershipId: row.current_membership_id,
    registeredAt: row.registered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at,
  };
}

export class UserRepository extends Repository {
  constructor(database: Database) {
    super(database);
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    const row = await this.one<UserRow>(
      `
        INSERT INTO users (
          sub,
          email,
          account,
          password_hash,
          name,
          picture_url
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
      [
        input.sub,
        input.email,
        input.account ?? input.email,
        input.passwordHash ?? null,
        input.name ?? null,
        input.pictureUrl ?? null,
      ],
    );

    return toUserRecord(row);
  }

  async upsertIdentity(input: UpsertUserIdentityInput): Promise<UserRecord> {
    const row = await this.one<UserRow>(
      `
        INSERT INTO users (
          sub,
          email,
          account,
          name,
          picture_url
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (sub)
        DO UPDATE SET
          email = EXCLUDED.email,
          account = EXCLUDED.account,
          name = EXCLUDED.name,
          picture_url = EXCLUDED.picture_url,
          last_seen_at = NOW()
        RETURNING *
      `,
      [
        input.sub,
        input.email,
        input.account ?? input.email,
        input.name ?? null,
        input.pictureUrl ?? null,
      ],
    );

    return toUserRecord(row);
  }

  async findBySub(sub: string): Promise<UserRecord | null> {
    const row = await this.oneOrNone<UserRow>("SELECT * FROM users WHERE sub = $1", [sub]);
    return row ? toUserRecord(row) : null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const row = await this.oneOrNone<UserRow>("SELECT * FROM users WHERE email = $1", [email]);
    return row ? toUserRecord(row) : null;
  }

  async touchLastSeen(sub: string): Promise<UserRecord | null> {
    const row = await this.oneOrNone<UserRow>(
      "UPDATE users SET last_seen_at = NOW() WHERE sub = $1 RETURNING *",
      [sub],
    );

    return row ? toUserRecord(row) : null;
  }

  async setMembershipReference(
    sub: string,
    status: UserMembershipStatus,
    membershipId: string | null,
  ): Promise<UserRecord | null> {
    const row = await this.oneOrNone<UserRow>(
      `
        UPDATE users
        SET
          membership_status = $2,
          current_membership_id = $3
        WHERE sub = $1
        RETURNING *
      `,
      [sub, status, membershipId],
    );

    return row ? toUserRecord(row) : null;
  }
}
