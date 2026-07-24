import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { Database } from "./database.js";
import { Repository } from "./repository.js";
import type { UserMembershipStatus } from "./users.js";

export type MembershipRecordStatus = Exclude<UserMembershipStatus, "none">;

export interface MembershipRecord {
  id: string;
  userSub: string;
  status: MembershipRecordStatus;
  startsAt: Date;
  expiresAt: Date;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MembershipStatusSnapshot {
  status: UserMembershipStatus;
  membershipId: string | null;
  startsAt: Date | null;
  expiresAt: Date | null;
}

export interface CreateMembershipInput {
  userSub: string;
  startsAt: Date;
  expiresAt: Date;
  status?: MembershipRecordStatus;
}

interface MembershipRow extends QueryResultRow {
  id: string;
  user_sub: string;
  status: MembershipRecordStatus;
  starts_at: Date;
  expires_at: Date;
  cancelled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function toMembershipRecord(row: MembershipRow): MembershipRecord {
  return {
    id: row.id,
    userSub: row.user_sub,
    status: row.status,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function effectiveStatus(membership: MembershipRecord | null, at: Date): MembershipStatusSnapshot {
  if (!membership) {
    return {
      status: "none",
      membershipId: null,
      startsAt: null,
      expiresAt: null,
    };
  }

  if (membership.status === "cancelled") {
    return {
      status: "cancelled",
      membershipId: membership.id,
      startsAt: membership.startsAt,
      expiresAt: membership.expiresAt,
    };
  }

  const active =
    membership.status === "active" &&
    membership.startsAt.getTime() <= at.getTime() &&
    membership.expiresAt.getTime() > at.getTime();

  return {
    status: active ? "active" : "expired",
    membershipId: membership.id,
    startsAt: membership.startsAt,
    expiresAt: membership.expiresAt,
  };
}

export class MembershipRepository extends Repository {
  constructor(database: Database) {
    super(database);
  }

  async create(input: CreateMembershipInput): Promise<MembershipRecord> {
    const row = await this.one<MembershipRow>(
      `
        INSERT INTO memberships (
          id,
          user_sub,
          status,
          starts_at,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
      [randomUUID(), input.userSub, input.status ?? "active", input.startsAt, input.expiresAt],
    );

    return toMembershipRecord(row);
  }

  async findCurrentByUser(userSub: string, at = new Date()): Promise<MembershipRecord | null> {
    const row = await this.oneOrNone<MembershipRow>(
      `
        SELECT *
        FROM memberships
        WHERE user_sub = $1
        ORDER BY
          CASE
            WHEN status = 'active' AND starts_at <= $2 AND expires_at > $2 THEN 0
            WHEN status = 'active' THEN 1
            WHEN status = 'cancelled' THEN 2
            ELSE 3
          END,
          expires_at DESC,
          created_at DESC
        LIMIT 1
      `,
      [userSub, at],
    );

    return row ? toMembershipRecord(row) : null;
  }

  async getEffectiveStatus(userSub: string, at = new Date()): Promise<MembershipStatusSnapshot> {
    const membership = await this.findCurrentByUser(userSub, at);
    return effectiveStatus(membership, at);
  }

  async refreshUserMembershipStatus(
    userSub: string,
    at = new Date(),
  ): Promise<MembershipStatusSnapshot> {
    const snapshot = await this.getEffectiveStatus(userSub, at);

    await this.query(
      `
        UPDATE users
        SET
          membership_status = $2,
          current_membership_id = $3
        WHERE sub = $1
      `,
      [userSub, snapshot.status, snapshot.membershipId],
    );

    return snapshot;
  }
}
